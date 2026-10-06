import { createHash } from 'node:crypto'
import { setImmediate } from 'node:timers/promises'

import type { FrozenAlphaOutpaintConditioningV1 } from './outpaint-conditioning.js'

import { validateSrgbPngStream } from './igs-package.js'
import {
  assertFrozenAlphaOutpaintConditioning,
  parseFrozenAlphaOutpaintConditioningV1,
} from './outpaint-conditioning.js'
import { decodeTargetPngAlpha } from './target-png-mode.js'

export interface OutpaintContributionAlphaIdentity {
  byteSize: number
  format: 'alpha8'
  height: number
  sha256: string
  width: number
}

/** Derive portable identity from actual bounded RGBA pixels, never a worker-reported hash. */
export function outpaintContributionAlphaIdentity(
  bytes: Buffer,
  width: number,
  height: number,
): OutpaintContributionAlphaIdentity {
  const alpha = decodeTargetPngAlpha(bytes, width, height)
  return {
    byteSize: alpha.length,
    format: 'alpha8',
    height,
    sha256: createHash('sha256').update(alpha).digest('hex'),
    width,
  }
}

/** Qualify source-bound contribution semantics independently of the inference process. */
export async function assertOutpaintContribution(
  context: FrozenAlphaOutpaintConditioningV1,
  sourceBytes: Buffer,
  outputBytes: Buffer,
): Promise<OutpaintContributionAlphaIdentity> {
  if (
    !Buffer.isBuffer(sourceBytes) ||
    !Buffer.isBuffer(outputBytes) ||
    sourceBytes.length > 32 * 1024 * 1024 ||
    outputBytes.length > 32 * 1024 * 1024
  ) {
    throw new Error('Outpaint verification requires bounded PNG buffers.')
  }
  const captured = parseFrozenAlphaOutpaintConditioningV1(context)
  const sourcePng = Buffer.from(sourceBytes)
  const outputPng = Buffer.from(outputBytes)
  await assertFrozenAlphaOutpaintConditioning(captured, sourcePng)
  await validateSrgbPngStream(
    (async function* () {
      yield outputPng
    })(),
    'outpaint-result.png',
    32 * 1024 * 1024,
    2048,
  )
  const { height, width } = captured.bbox
  const actual = decodeTargetPngAlpha(outputPng, width, height)
  const source = decodeTargetPngAlpha(sourcePng, width, height)
  let hasIcc = false
  for (let offset = 8; offset + 12 <= outputPng.length;) {
    const length = outputPng.readUInt32BE(offset)
    hasIcc ||= outputPng.toString('ascii', offset + 4, offset + 8) === 'iCCP'
    offset += length + 12
  }
  if (!hasIcc) {
    throw new Error('The outpaint contribution must carry its exact sRGB ICC profile.')
  }
  const steps = deriveContributionSteps(source, width, height)
  let step = steps.next()
  while (!step.done) {
    // Main must continue processing Cancel/window events during a large recovery verification.
    await setImmediate()
    step = steps.next()
  }
  const expected = step.value
  if (!actual.equals(expected)) {
    throw new Error('The output alpha does not match the frozen outpaint contribution policy.')
  }
  return {
    byteSize: actual.length,
    format: 'alpha8',
    height,
    sha256: createHash('sha256').update(actual).digest('hex'),
    width,
  }
}

const COEFFICIENT_SCALE = 1 << 22
const HALF_COEFFICIENT_SCALE = COEFFICIENT_SCALE / 2
const DISTANCE_SCALE = 1 << 16
const AXIAL_DISTANCE = DISTANCE_SCALE
const DIAGONAL_DISTANCE = 91_750
const KNIGHT_DISTANCE = 143_976
const SATURATED_DISTANCE = 16 * DISTANCE_SCALE
const FADE_COEFFICIENTS = [
  -1.114_203_157_815_165_7, 1.329_881_624_559_73, 0.803_503_679_030_122_7,
  -0.020_552_299_044_306_107,
] as const

/**
 * Independent v1 output-alpha policy, not a replacement for the worker's numerical latent mask.
 * Pillow12.2 Resample.c specifies 22-bit coefficients and rounded uint8 horizontal then vertical
 * passes. The fixed radius2 positive Gaussian footprint makes expanded keep binary: any reduced
 * alpha below255 in its circle gives a quantized gradient below255. OpenCV5.0 distranform.cpp uses
 * 16-bit fixed mask5 distances. Distances>=16 are observationally identical for this feather.
 * Pinned live IPP and scalar oracles also verify that their small distance differences do not cross
 * any final uint8 threshold for the finite set of chamfer costs below16.
 */
export function deriveOutpaintContributionAlphaV1(
  sourceAlpha: Buffer,
  width: number,
  height: number,
): Buffer {
  const steps = deriveContributionSteps(sourceAlpha, width, height)
  let step = steps.next()
  while (!step.done) {
    step = steps.next()
  }
  return step.value
}

function* deriveContributionSteps(
  sourceAlpha: Buffer,
  width: number,
  height: number,
): Generator<undefined, Buffer, undefined> {
  if (
    !Buffer.isBuffer(sourceAlpha) ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 8 ||
    height < 8 ||
    width > 2048 ||
    height > 2048 ||
    width % 8 !== 0 ||
    height % 8 !== 0 ||
    width * height > 4_000_000 ||
    sourceAlpha.length !== width * height
  ) {
    throw new Error('The outpaint alpha exceeds the v1 bounded latent grid.')
  }
  const reducedWidth = width / 8
  const reducedHeight = height / 8
  const horizontal = Buffer.alloc(reducedWidth * height)
  const columns = bilinearCoefficients(width)
  for (let row = 0; row < height; row++) {
    if (row % 128 === 0) {
      yield undefined
    }
    for (let column = 0; column < reducedWidth; column++) {
      const coefficients = columns[column]
      let sum = HALF_COEFFICIENT_SCALE
      for (let k = 0; k < coefficients.weights.length; k++) {
        sum += sourceAlpha[row * width + coefficients.start + k] * coefficients.weights[k]
      }
      horizontal[row * reducedWidth + column] = Math.min(255, Math.floor(sum / COEFFICIENT_SCALE))
    }
  }
  const reduced = Buffer.alloc(reducedWidth * reducedHeight)
  const rows = bilinearCoefficients(height)
  for (let row = 0; row < reducedHeight; row++) {
    const coefficients = rows[row]
    for (let column = 0; column < reducedWidth; column++) {
      let sum = HALF_COEFFICIENT_SCALE
      for (let k = 0; k < coefficients.weights.length; k++) {
        sum +=
          horizontal[(coefficients.start + k) * reducedWidth + column] * coefficients.weights[k]
      }
      reduced[row * reducedWidth + column] = Math.min(255, Math.floor(sum / COEFFICIENT_SCALE))
    }
  }
  const expanded = Buffer.alloc(reduced.length, 255)
  for (let row = 0; row < reducedHeight; row++) {
    for (let column = 0; column < reducedWidth; column++) {
      if (reduced[row * reducedWidth + column] === 255) {
        continue
      }
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const x = column + dx
          const y = row + dy
          if (dx * dx + dy * dy <= 4 && x >= 0 && x < reducedWidth && y >= 0 && y < reducedHeight) {
            expanded[y * reducedWidth + x] = 0
          }
        }
      }
    }
  }
  return yield* contributionFromExpanded(expanded, reducedWidth, width, height)
}

function bilinearCoefficients(size: number): { start: number; weights: number[] }[] {
  return Array.from({ length: size / 8 }, (_, position) => {
    const center = (position + 0.5) * 8
    const start = Math.max(0, Math.trunc(center - 8 + 0.5))
    const end = Math.min(size, Math.trunc(center + 8 + 0.5))
    const weights = Array.from({ length: end - start }, (_, k) =>
      Math.max(0, 1 - Math.abs((k + start - center + 0.5) / 8)),
    )
    const total = weights.reduce((sum, weight) => sum + weight, 0)
    return {
      start,
      weights: weights.map((weight) => Math.trunc(0.5 + (weight / total) * COEFFICIENT_SCALE)),
    }
  })
}

function* contributionFromExpanded(
  expanded: Buffer,
  reducedWidth: number,
  width: number,
  height: number,
): Generator<undefined, Buffer, undefined> {
  // A two-cell border removes branches in both directional mask5 sweeps. Saturation at fade16
  // preserves exact observable output while bounding all integer arithmetic well below2^31.
  const stride = width + 4
  const distances = new Uint32Array(stride * (height + 4)).fill(SATURATED_DISTANCE)
  for (let row = 0; row < height; row++) {
    if (row % 128 === 0) {
      yield undefined
    }
    for (let column = 0; column < width; column++) {
      if (expanded[Math.floor(row / 8) * reducedWidth + Math.floor(column / 8)] === 0) {
        distances[(row + 2) * stride + column + 2] = 0
      }
    }
  }
  for (let row = 0; row < height; row++) {
    if (row % 128 === 0) {
      yield undefined
    }
    for (let column = 0; column < width; column++) {
      const index = (row + 2) * stride + column + 2
      if (distances[index] === 0) {
        continue
      }
      distances[index] = Math.min(
        SATURATED_DISTANCE,
        distances[index - 2 * stride - 1] + KNIGHT_DISTANCE,
        distances[index - 2 * stride + 1] + KNIGHT_DISTANCE,
        distances[index - stride - 2] + KNIGHT_DISTANCE,
        distances[index - stride - 1] + DIAGONAL_DISTANCE,
        distances[index - stride] + AXIAL_DISTANCE,
        distances[index - stride + 1] + DIAGONAL_DISTANCE,
        distances[index - stride + 2] + KNIGHT_DISTANCE,
        distances[index - 1] + AXIAL_DISTANCE,
      )
    }
  }
  const alpha = Buffer.alloc(width * height)
  for (let row = height - 1; row >= 0; row--) {
    if (row % 128 === 0) {
      yield undefined
    }
    for (let column = width - 1; column >= 0; column--) {
      const index = (row + 2) * stride + column + 2
      const distance = Math.min(
        distances[index],
        distances[index + 2 * stride + 1] + KNIGHT_DISTANCE,
        distances[index + 2 * stride - 1] + KNIGHT_DISTANCE,
        distances[index + stride + 2] + KNIGHT_DISTANCE,
        distances[index + stride + 1] + DIAGONAL_DISTANCE,
        distances[index + stride] + AXIAL_DISTANCE,
        distances[index + stride - 1] + DIAGONAL_DISTANCE,
        distances[index + stride - 2] + KNIGHT_DISTANCE,
        distances[index + 1] + AXIAL_DISTANCE,
      )
      distances[index] = distance
      const normalized = Math.fround(Math.fround(distance / DISTANCE_SCALE) / 16)
      const feather =
        ((FADE_COEFFICIENTS[0] * normalized + FADE_COEFFICIENTS[1]) * normalized +
          FADE_COEFFICIENTS[2]) *
          normalized +
        FADE_COEFFICIENTS[3]
      const keep =
        distance === 0
          ? 0
          : distance >= SATURATED_DISTANCE
            ? 255
            : Math.trunc(Math.max(0, Math.min(1, feather)) * 255)
      alpha[row * width + column] = 255 - keep
    }
  }
  return alpha
}
