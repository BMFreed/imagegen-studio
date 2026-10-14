import {
  assertProjectMaskBounds,
  assertProjectMaskDimensions,
  parseProjectMaskEdit,
  PROJECT_MASK_MAX_EDIT_PIXEL_VISITS,
  PROJECT_MASK_MAX_IDAT_CHUNKS,
  PROJECT_MASK_MAX_PNG_BYTES,
  type ProjectMaskBitmap,
  type ProjectMaskEdit,
  ProjectMaskError,
} from '../../shared/projects/project-mask.js'
import type { IgsRectV1, IgsSmartPatchMaskAssetV1 } from '../../shared/projects/project-schema.js'

import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import path from 'node:path'
import { crc32, deflateSync, inflateSync } from 'node:zlib'

import type { IgsAssetSource } from './igs-package.js'

type Point = { x: number; y: number }
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex')

/**
 * CPU-owned coverage. Pixel centers are origin + (column + .5, row + .5). Brush capsules have a
 * fixed one-project-pixel antialias edge; no pressure/hardness engine. A gesture combines its
 * overlapping capsules before compositing once with the old coverage.
 */
export function applyProjectMaskEdit(
  current: ProjectMaskBitmap | null,
  input: ProjectMaskEdit,
): ProjectMaskBitmap | null {
  const edit = parseProjectMaskEdit(input)
  if (current) {
    assertProjectMaskBounds(current.bounds)
    assertCoverage(current.alpha, current.bounds.width, current.bounds.height)
  }
  if (edit.kind === 'clear') {
    return null
  }
  if (edit.operation === 'subtract' && !current) {
    return null
  }

  const editBounds = boundsOfPoints(
    edit.points,
    edit.kind === 'brush' ? edit.diameter / 2 + 0.5 : 0,
  )
  if (!editBounds) {
    return current
  }
  const target =
    edit.operation === 'subtract'
      ? current!.bounds
      : current
        ? union(current.bounds, editBounds)
        : editBounds
  assertProjectMaskBounds(target)
  const clipped = intersection(editBounds, target)
  if (!clipped) {
    return current
  }

  const segments =
    edit.kind === 'brush'
      ? edit.points.slice(1).map((point, index) => [edit.points[index], point] as const)
      : []
  if (edit.kind === 'brush' && segments.length === 0) {
    segments.push([edit.points[0], edit.points[0]])
  }
  const segmentRects =
    edit.kind === 'brush'
      ? segments.map(([a, b]) =>
          intersection(boundsOfPoints([a, b], edit.diameter / 2 + 0.5)!, target),
        )
      : []
  // Count both coverage/crop passes, the old bitmap copy and geometry evaluations before allocation.
  let visits = target.width * target.height * 3 + (current?.alpha.length ?? 0) * 2
  visits +=
    edit.kind === 'brush'
      ? segmentRects.reduce((sum, rect) => sum + (rect ? rect.width * rect.height : 0), 0)
      : clipped.width * clipped.height * 4 +
        clipped.height * edit.points.length * 2 * (1 + Math.ceil(Math.log2(edit.points.length)))
  if (!Number.isSafeInteger(visits) || visits > PROJECT_MASK_MAX_EDIT_PIXEL_VISITS) {
    throw new ProjectMaskError('MASK_LIMIT', 'The mask gesture exceeds the CPU work limit.')
  }

  const alpha = new Uint8Array(target.width * target.height)
  const coverage = new Uint8Array(alpha.length)
  if (current) {
    for (let row = 0; row < current.bounds.height; row++) {
      const offset =
        (current.bounds.y - target.y + row) * target.width + current.bounds.x - target.x
      alpha.set(
        current.alpha.subarray(row * current.bounds.width, (row + 1) * current.bounds.width),
        offset,
      )
    }
  }
  if (edit.kind === 'brush') {
    for (let segment = 0; segment < segments.length; segment++) {
      const rect = segmentRects[segment]
      if (!rect) {
        continue
      }
      const [a, b] = segments[segment]
      visitRect(rect, target, (index, x, y) => {
        const distance = pointSegmentDistance(x + 0.5, y + 0.5, a, b)
        const value = Math.round(255 * Math.max(0, Math.min(1, edit.diameter / 2 + 0.5 - distance)))
        coverage[index] = Math.max(coverage[index], value)
      })
    }
  } else {
    paintPolygonCoverage(clipped, target, edit.points, coverage)
  }
  for (let index = 0; index < alpha.length; index++) {
    const previous = alpha[index]
    const value =
      edit.kind === 'polygon' ? Math.round((coverage[index] * 255) / 4) : coverage[index]
    alpha[index] =
      edit.operation === 'add'
        ? Math.round(value + (previous * (255 - value)) / 255)
        : Math.round((previous * (255 - value)) / 255)
  }
  return cropCoverage(target, alpha)
}

/** Strict owned-mask encoding: white RGB plus linear alpha8 coverage, no color metadata. */
export function encodeProjectMaskPng(alpha: Uint8Array, width: number, height: number): Buffer {
  assertProjectMaskDimensions(width, height)
  assertCoverage(alpha, width, height)
  const rows = Buffer.alloc(height * (width * 4 + 1))
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const index = row * (width * 4 + 1) + 1 + column * 4
      rows[index] = rows[index + 1] = rows[index + 2] = 255
      rows[index + 3] = alpha[row * width + column]!
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  const png = Buffer.concat([
    pngSignature,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
  if (png.length > PROJECT_MASK_MAX_PNG_BYTES) {
    throw new ProjectMaskError('MASK_LIMIT', 'The encoded mask exceeds the PNG limit.')
  }
  return png
}

/** Validate CRC/structure, exact bounded pixels, white RGB and nonempty tight coverage. */
export function decodeProjectMaskPng(
  input: Uint8Array,
  dimensions: { height: number; width: number },
): Uint8Array {
  assertProjectMaskDimensions(dimensions.width, dimensions.height)
  if (!(input instanceof Uint8Array)) {
    throw new ProjectMaskError('MASK_IMAGE_INVALID', 'The owned mask PNG must be bytes.')
  }
  if (input.byteLength > PROJECT_MASK_MAX_PNG_BYTES) {
    throw new ProjectMaskError('MASK_LIMIT', 'The mask exceeds the PNG limit.')
  }
  const png = Buffer.isBuffer(input) ? input : Buffer.from(input)
  const invalid: () => never = () => {
    throw new ProjectMaskError('MASK_IMAGE_INVALID', 'The owned mask PNG is invalid.')
  }
  if (png.length > PROJECT_MASK_MAX_PNG_BYTES) {
    throw new ProjectMaskError('MASK_LIMIT', 'The mask exceeds the PNG limit.')
  }
  if (png.length < 57 || !png.subarray(0, 8).equals(pngSignature)) {
    invalid()
  }
  const compressed: Buffer[] = []
  let offset = 8
  let state: 'end' | 'header' | 'pixels' = 'header'
  while (offset < png.length) {
    if (offset + 12 > png.length) {
      invalid()
    }
    const length = png.readUInt32BE(offset)
    const end = offset + length + 12
    if (end > png.length) {
      invalid()
    }
    const name = png.toString('ascii', offset + 4, offset + 8)
    const data = png.subarray(offset + 8, end - 4)
    if (crc32(png.subarray(offset + 4, end - 4)) !== png.readUInt32BE(end - 4)) {
      invalid()
    }
    if (name === 'IHDR' && state === 'header' && length === 13) {
      if (
        data.readUInt32BE(0) !== dimensions.width ||
        data.readUInt32BE(4) !== dimensions.height ||
        data[8] !== 8 ||
        data[9] !== 6 ||
        data[10] !== 0 ||
        data[11] !== 0 ||
        data[12] !== 0
      ) {
        invalid()
      }
      state = 'pixels'
    } else if (name === 'IDAT' && state === 'pixels' && length > 0) {
      if (compressed.length >= PROJECT_MASK_MAX_IDAT_CHUNKS) {
        throw new ProjectMaskError('MASK_LIMIT', 'The mask PNG has too many IDAT chunks.')
      }
      compressed.push(data)
    } else if (name === 'IEND' && state === 'pixels' && length === 0 && compressed.length > 0) {
      state = 'end'
      if (end !== png.length) {
        invalid()
      }
    } else {
      invalid()
    }
    offset = end
  }
  if (state !== 'end') {
    invalid()
  }
  const rowBytes = dimensions.width * 4
  const expected = (rowBytes + 1) * dimensions.height
  let filtered: Buffer
  try {
    const bytes = Buffer.concat(compressed)
    // Node returns an info record here; its declaration currently types this overload as Buffer.
    const inflated: unknown = inflateSync(bytes, { info: true, maxOutputLength: expected })
    if (
      typeof inflated !== 'object' ||
      inflated === null ||
      !('buffer' in inflated) ||
      !Buffer.isBuffer(inflated.buffer) ||
      !('engine' in inflated) ||
      typeof inflated.engine !== 'object' ||
      inflated.engine === null ||
      !('bytesWritten' in inflated.engine) ||
      inflated.engine.bytesWritten !== bytes.length
    ) {
      invalid()
    }
    filtered = inflated.buffer
  } catch {
    return invalid()
  }
  if (filtered.length !== expected) {
    invalid()
  }
  const alpha = new Uint8Array(dimensions.width * dimensions.height)
  let previous = new Uint8Array(rowBytes)
  let current = new Uint8Array(rowBytes)
  for (let row = 0; row < dimensions.height; row++) {
    const start = row * (rowBytes + 1)
    const filter = filtered[start]
    if (filter > 4) {
      invalid()
    }
    for (let byte = 0; byte < rowBytes; byte++) {
      const left = byte < 4 ? 0 : current[byte - 4]
      const up = previous[byte]
      const upperLeft = byte < 4 ? 0 : previous[byte - 4]
      const prediction =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? up
              : filter === 3
                ? Math.floor((left + up) / 2)
                : paeth(left, up, upperLeft)
      const value = (filtered[start + 1 + byte] + prediction) & 255
      current[byte] = value
      if (byte % 4 === 3) {
        alpha[row * dimensions.width + Math.floor(byte / 4)] = value
      } else if (value !== 255) {
        invalid()
      }
    }
    const swap = previous
    previous = current
    current = swap
  }
  assertCoverage(alpha, dimensions.width, dimensions.height)
  return alpha
}

/** Read only an exact bounded Main-owned source, then verify its full portable mask semantics. */
export async function readProjectMaskSource(
  source: IgsAssetSource,
  asset: IgsSmartPatchMaskAssetV1,
): Promise<Buffer> {
  assertProjectMaskDimensions(asset.width, asset.height)
  if (
    !Number.isSafeInteger(asset.bytes) ||
    asset.bytes < 1 ||
    asset.bytes > PROJECT_MASK_MAX_PNG_BYTES
  ) {
    throw new ProjectMaskError('MASK_LIMIT', 'The mask source exceeds its byte limit.')
  }
  let bytes: Buffer
  if ('bytes' in source) {
    if (!Buffer.isBuffer(source.bytes) || source.bytes.length !== asset.bytes) {
      throw new ProjectMaskError(
        'MASK_IMAGE_INVALID',
        'The mask source differs from its reference.',
      )
    }
    bytes = Buffer.from(source.bytes)
  } else {
    if (!path.isAbsolute(source.sourcePath)) {
      throw new ProjectMaskError('MASK_IMAGE_INVALID', 'A mask source path must be absolute.')
    }
    const file = await open(
      source.sourcePath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    )
    try {
      const before = await file.stat({ bigint: true })
      if (!before.isFile() || before.size !== BigInt(asset.bytes)) {
        throw new ProjectMaskError(
          'MASK_IMAGE_INVALID',
          'The mask source differs from its reference.',
        )
      }
      bytes = Buffer.alloc(asset.bytes)
      let offset = 0
      while (offset < bytes.length) {
        const result = await file.read(bytes, offset, bytes.length - offset, null)
        if (result.bytesRead === 0) {
          break
        }
        offset += result.bytesRead
      }
      const after = await file.stat({ bigint: true })
      if (
        offset !== bytes.length ||
        after.size !== before.size ||
        after.mtimeNs !== before.mtimeNs ||
        after.ctimeNs !== before.ctimeNs
      ) {
        throw new ProjectMaskError('MASK_IMAGE_INVALID', 'The mask source changed while reading.')
      }
    } finally {
      await file.close()
    }
  }
  if (
    bytes.length !== asset.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== asset.sha256
  ) {
    throw new ProjectMaskError(
      'MASK_IMAGE_INVALID',
      'The mask source failed integrity verification.',
    )
  }
  decodeProjectMaskPng(bytes, asset)
  return bytes
}

function assertCoverage(alpha: Uint8Array, width: number, height: number): void {
  if (!(alpha instanceof Uint8Array) || alpha.length !== width * height) {
    throw new ProjectMaskError('MASK_IMAGE_INVALID', 'The mask coverage length is invalid.')
  }
  let bottom = false
  let left = false
  let right = false
  let top = false
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      if (alpha[row * width + column] === 0) {
        continue
      }
      if (row === 0) {
        top = true
      }
      if (row === height - 1) {
        bottom = true
      }
      if (column === 0) {
        left = true
      }
      if (column === width - 1) {
        right = true
      }
    }
  }
  if (!top || !bottom || !left || !right) {
    throw new ProjectMaskError(
      'MASK_IMAGE_INVALID',
      'The mask coverage must have nonempty tight bounds.',
    )
  }
}

function boundsOfPoints(points: readonly Point[], padding: number): IgsRectV1 | null {
  const x = Math.floor(Math.min(...points.map((point) => point.x)) - padding)
  const y = Math.floor(Math.min(...points.map((point) => point.y)) - padding)
  const right = Math.ceil(Math.max(...points.map((point) => point.x)) + padding)
  const bottom = Math.ceil(Math.max(...points.map((point) => point.y)) + padding)
  if (right <= x || bottom <= y) {
    return null
  }
  return { height: bottom - y, width: right - x, x, y }
}

function union(a: IgsRectV1, b: IgsRectV1): IgsRectV1 {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    height: Math.max(a.y + a.height, b.y + b.height) - y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    x,
    y,
  }
}

function intersection(a: IgsRectV1, b: IgsRectV1): IgsRectV1 | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  const right = Math.min(a.x + a.width, b.x + b.width)
  return right <= x || bottom <= y ? null : { height: bottom - y, width: right - x, x, y }
}

function visitRect(
  rect: IgsRectV1,
  target: IgsRectV1,
  visit: (index: number, x: number, y: number) => void,
): void {
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      visit((y - target.y) * target.width + x - target.x, x, y)
    }
  }
}

function pointSegmentDistance(x: number, y: number, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = dx * dx + dy * dy
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length))
  return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy))
}

function paintPolygonCoverage(
  rect: IgsRectV1,
  target: IgsRectV1,
  points: readonly Point[],
  coverage: Uint8Array,
): void {
  // Even-odd spans on two sample scanlines per world pixel: O(height*vertices + covered pixels).
  // Keep x endpoints left-inclusive/right-exclusive, matching ordinary ray-crossing semantics.
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (const dy of [0.25, 0.75]) {
      const sampleY = y + dy
      const crossings: number[] = []
      for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
        const a = points[index]
        const b = points[previous]
        if (a.y > sampleY !== b.y > sampleY) {
          crossings.push(((b.x - a.x) * (sampleY - a.y)) / (b.y - a.y) + a.x)
        }
      }
      crossings.sort((a, b) => a - b)
      for (let crossing = 0; crossing + 1 < crossings.length; crossing += 2) {
        const left = Math.max(rect.x, crossings[crossing])
        const right = Math.min(rect.x + rect.width, crossings[crossing + 1])
        if (right <= left) {
          continue
        }
        for (const dx of [0.25, 0.75]) {
          const from = Math.max(rect.x, Math.ceil(left - dx))
          const to = Math.min(rect.x + rect.width, Math.ceil(right - dx))
          for (let x = from; x < to; x++) {
            coverage[(y - target.y) * target.width + x - target.x]++
          }
        }
      }
    }
  }
}

function cropCoverage(bounds: IgsRectV1, alpha: Uint8Array): ProjectMaskBitmap | null {
  let bottom = -1
  let left = bounds.width
  let right = -1
  let top = bounds.height
  for (let row = 0; row < bounds.height; row++) {
    for (let column = 0; column < bounds.width; column++) {
      if (alpha[row * bounds.width + column] === 0) {
        continue
      }
      left = Math.min(left, column)
      top = Math.min(top, row)
      right = Math.max(right, column)
      bottom = Math.max(bottom, row)
    }
  }
  if (right < left) {
    return null
  }
  const height = bottom - top + 1
  const width = right - left + 1
  const cropped = new Uint8Array(width * height)
  for (let row = 0; row < height; row++) {
    cropped.set(
      alpha.subarray((top + row) * bounds.width + left, (top + row) * bounds.width + left + width),
      row * width,
    )
  }
  return { alpha: cropped, bounds: { height, width, x: bounds.x + left, y: bounds.y + top } }
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

function chunk(name: string, data: Buffer): Buffer {
  const value = Buffer.alloc(data.length + 12)
  value.writeUInt32BE(data.length, 0)
  value.write(name, 4, 4, 'ascii')
  data.copy(value, 8)
  value.writeUInt32BE(crc32(value.subarray(4, -4)), value.length - 4)
  return value
}
