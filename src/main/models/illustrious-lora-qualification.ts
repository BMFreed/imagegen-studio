import { constants } from 'node:fs'
import { open } from 'node:fs/promises'

import { ILLUSTRIOUS_LORA_TARGET_PROFILE } from './illustrious-lora-target-profile.js'

const MAX_HEADER_BYTES = 32 * 1024 * 1024
const HEADER_LENGTH_BYTES = 8
const DTYPE_BYTES: Readonly<Record<string, number>> = { BF16: 2, F16: 2, F32: 4 }
const TARGETS = new Map(
  ILLUSTRIOUS_LORA_TARGET_PROFILE.flatMap((entry) =>
    entry.aliases.map((alias) => [alias, entry] as const),
  ),
)
type Tensor = {
  dtype: string
  offsets: readonly [number, number]
  shape: number[]
}
type Alpha = { dtype: string; offset: number }

export class IllustriousLoraQualificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IllustriousLoraQualificationError'
  }
}

/** Header preflight against pinned SDXL modules; not a lineage or successful ML-load claim. */
export function inspectIllustriousLoraSafetensorsHeader(
  headerBytes: Uint8Array,
  fileSizeBytes: number,
): void {
  inspectHeader(headerBytes, fileSizeBytes)
}

/** Read a bounded header and tiny alpha scalars, never allocate reusable model weights in main. */
export async function qualifyIllustriousLora(managedPath: string): Promise<void> {
  if (!managedPath.toLowerCase().endsWith('.safetensors')) {
    invalid('The LoRA is not a safetensors file.')
  }
  const handle = await open(managedPath, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size <= HEADER_LENGTH_BYTES) {
      invalid('The LoRA is not a regular safetensors file.')
    }
    const prefix = Buffer.alloc(HEADER_LENGTH_BYTES)
    await readExactly(handle, prefix, 0)
    const length = prefix.readBigUInt64LE()
    if (length < 2n || length > BigInt(MAX_HEADER_BYTES) || length >= BigInt(stat.size - 8)) {
      invalid('The LoRA header length is invalid or exceeds the 32 MiB limit.')
    }
    const headerBytes = Buffer.alloc(Number(length))
    await readExactly(handle, headerBytes, HEADER_LENGTH_BYTES)
    const alphas = inspectHeader(headerBytes, stat.size)
    for (const alpha of alphas) {
      const bytes = Buffer.alloc(DTYPE_BYTES[alpha.dtype])
      await readExactly(handle, bytes, HEADER_LENGTH_BYTES + headerBytes.length + alpha.offset)
      if (!Number.isFinite(scalar(bytes, alpha.dtype))) {
        invalid('A LoRA alpha scalar is not finite.')
      }
    }
  } finally {
    await handle.close()
  }
}

function inspectHeader(headerBytes: Uint8Array, fileSizeBytes: number): Alpha[] {
  if (
    headerBytes.length < 2 ||
    headerBytes.length > MAX_HEADER_BYTES ||
    headerBytes[0] !== 123 ||
    !Number.isSafeInteger(fileSizeBytes) ||
    fileSizeBytes <= HEADER_LENGTH_BYTES + headerBytes.length
  ) {
    invalid('The LoRA header or file size is invalid.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(headerBytes)) as unknown
  } catch {
    invalid('The LoRA header is not valid UTF-8 JSON.')
  }
  if (!record(parsed)) {
    invalid('The LoRA header is not an object.')
  }
  if (
    parsed.__metadata__ !== undefined &&
    (!record(parsed.__metadata__) ||
      Object.values(parsed.__metadata__).some((value) => typeof value !== 'string'))
  ) {
    invalid('The safetensors metadata must contain string values.')
  }
  const ranges: Tensor[] = []
  const groups = new Map<string, Map<string, Tensor>>()
  const payloadSize = fileSizeBytes - HEADER_LENGTH_BYTES - headerBytes.length
  let sgm = false
  let diffusers = false
  for (const [key, descriptor] of Object.entries(parsed)) {
    if (key === '__metadata__') {
      continue
    }
    const match = /^(lora_(?:unet|te1|te2)_[^.]+)\.(lora_down\.weight|lora_up\.weight|alpha)$/.exec(
      key,
    )
    if (!match) {
      invalid('Only ordinary Kohya LoRA up/down weights and optional scalar alpha are supported.')
    }
    const [, stem, suffix] = match
    if (!TARGETS.has(stem)) {
      invalid(`Unsupported pinned Illustrious LoRA target: ${stem}`)
    }
    if (!record(descriptor) || !Array.isArray(descriptor.shape)) {
      invalid('A LoRA tensor descriptor is invalid.')
    }
    const dtype = descriptor.dtype
    const bytesPerElement = typeof dtype === 'string' ? DTYPE_BYTES[dtype] : undefined
    const shape: unknown[] = descriptor.shape
    const offsets = descriptor.data_offsets
    const elements = shape.reduce<number>((product, dimension) => {
      if (!Number.isSafeInteger(dimension) || (dimension as number) < 1) {
        invalid('LoRA tensor dimensions must be positive safe integers.')
      }
      const next = product * (dimension as number)
      if (!Number.isSafeInteger(next)) {
        invalid('The LoRA tensor is too large.')
      }
      return next
    }, 1)
    if (
      bytesPerElement === undefined ||
      !Array.isArray(offsets) ||
      offsets.length !== 2 ||
      !Number.isSafeInteger(offsets[0]) ||
      !Number.isSafeInteger(offsets[1]) ||
      offsets[0] < 0 ||
      offsets[1] <= offsets[0] ||
      offsets[1] > payloadSize ||
      offsets[1] - offsets[0] !== elements * bytesPerElement
    ) {
      invalid('LoRA tensor data offsets, dtype or byte size are invalid.')
    }
    const tensor: Tensor = {
      dtype: dtype as string,
      offsets: [offsets[0] as number, offsets[1] as number],
      shape: shape as number[],
    }
    ranges.push(tensor)
    const group = groups.get(stem) ?? new Map<string, Tensor>()
    group.set(suffix, tensor)
    groups.set(stem, group)
    sgm ||= /^lora_unet_(?:input_blocks_|middle_block_|output_blocks_)/.test(stem)
    diffusers ||= /^lora_unet_(?:down_blocks_|mid_block_|up_blocks_)/.test(stem)
  }
  if (!groups.size || (sgm && diffusers)) {
    invalid('The LoRA is empty or mixes SGM and Diffusers UNet naming.')
  }
  ranges.sort((left, right) => left.offsets[0] - right.offsets[0])
  let end = 0
  for (const range of ranges) {
    if (range.offsets[0] !== end) {
      invalid('LoRA tensor data overlaps or contains unreferenced bytes.')
    }
    end = range.offsets[1]
  }
  if (end !== payloadSize) {
    invalid('The LoRA payload contains unreferenced trailing bytes.')
  }
  const usedTargets = new Set<string>()
  const alphas: Alpha[] = []
  for (const [stem, group] of groups) {
    const target = TARGETS.get(stem)!
    if (usedTargets.has(target.target)) {
      invalid('Several LoRA aliases target the same module.')
    }
    usedTargets.add(target.target)
    const down = group.get('lora_down.weight')
    const up = group.get('lora_up.weight')
    if (!down || !up) {
      invalid('A LoRA module is missing its up/down pair.')
    }
    const rank = down.shape[0]
    const expectedDown =
      target.shape.length === 2
        ? [rank, target.shape[1]]
        : [rank, target.shape[1], target.shape[2], target.shape[3]]
    const expectedUp =
      target.shape.length === 2 ? [target.shape[0], rank] : [target.shape[0], rank, 1, 1]
    if (!sameShape(down.shape, expectedDown) || !sameShape(up.shape, expectedUp)) {
      invalid(`LoRA rank or dimensions do not match the target module: ${stem}`)
    }
    const alpha = group.get('alpha')
    if (alpha) {
      if (alpha.shape.length !== 0) {
        invalid('LoRA alpha must be a scalar.')
      }
      alphas.push({ dtype: alpha.dtype, offset: alpha.offsets[0] })
    }
  }
  return alphas
}

function scalar(bytes: Buffer, dtype: string): number {
  if (dtype === 'F32') {
    return bytes.readFloatLE()
  }
  if (dtype === 'BF16') {
    const float = Buffer.alloc(4)
    float.writeUInt16LE(bytes.readUInt16LE(), 2)
    return float.readFloatLE()
  }
  const bits = bytes.readUInt16LE()
  const sign = bits >>> 15 ? -1 : 1
  const exponent = (bits >>> 10) & 31
  const fraction = bits & 1023
  return exponent === 31
    ? fraction === 0
      ? sign * Infinity
      : NaN
    : sign * (exponent === 0 ? fraction * 2 ** -24 : (1 + fraction / 1024) * 2 ** (exponent - 15))
}

function sameShape(actual: readonly number[], expected: readonly (number | undefined)[]): boolean {
  return (
    actual.length === expected.length && actual.every((value, index) => value === expected[index])
  )
}

function invalid(message: string): never {
  throw new IllustriousLoraQualificationError(message)
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function readExactly(
  handle: Awaited<ReturnType<typeof open>>,
  buffer: Buffer,
  position: number,
): Promise<void> {
  let total = 0
  while (total < buffer.length) {
    const { bytesRead } = await handle.read(buffer, total, buffer.length - total, position + total)
    if (!bytesRead) {
      invalid('The LoRA file is truncated.')
    }
    total += bytesRead
  }
}
