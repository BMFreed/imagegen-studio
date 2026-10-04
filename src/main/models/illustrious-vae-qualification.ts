import { constants } from 'node:fs'
import { open } from 'node:fs/promises'

// Shared with the existing checkpoint/LoRA preflight ceiling; no tensor payload is allocated here.
const MAX_HEADER_BYTES = 32 * 1024 * 1024
const HEADER_LENGTH_BYTES = 8
const DTYPE_BYTES: Readonly<Record<string, number>> = { BF16: 2, F16: 2, F32: 4 }
const COMMON_ANCHORS: Readonly<Record<string, readonly number[]>> = {
  'decoder.conv_in.weight': [512, 4, 3, 3],
  'decoder.conv_out.weight': [3, 128, 3, 3],
  'encoder.conv_in.weight': [128, 3, 3, 3],
  'encoder.conv_out.weight': [8, 512, 3, 3],
  'post_quant_conv.weight': [4, 4, 1, 1],
  'quant_conv.weight': [8, 8, 1, 1],
}
const FORMAT_ANCHORS = {
  diffusers: {
    'decoder.up_blocks.0.resnets.0.conv1.weight': [512, 512, 3, 3],
    'encoder.down_blocks.0.resnets.0.conv1.weight': [128, 128, 3, 3],
  },
  ldm: {
    'decoder.up.3.block.0.conv1.weight': [512, 512, 3, 3],
    'encoder.down.0.block.0.conv1.weight': [128, 128, 3, 3],
  },
} as const

export class IllustriousVaeQualificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IllustriousVaeQualificationError'
  }
}

/**
 * Screen standalone LDM/native Diffusers AutoencoderKL headers for the pinned SDXL profile. SD1 and
 * SDXL can share these shapes: this proves neither training lineage nor full loadability. The
 * Python worker still checks every converted key/shape and finite value against its config.
 */
export function inspectIllustriousVaeSafetensorsHeader(
  headerBytes: Uint8Array,
  fileSizeBytes: number,
): void {
  if (
    headerBytes.length < 2 ||
    headerBytes.length > MAX_HEADER_BYTES ||
    headerBytes[0] !== 123 ||
    !Number.isSafeInteger(fileSizeBytes) ||
    fileSizeBytes <= HEADER_LENGTH_BYTES + headerBytes.length
  ) {
    invalid('The VAE header or file size is invalid.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(headerBytes)) as unknown
  } catch {
    invalid('The VAE header is not valid UTF-8 JSON.')
  }
  if (!record(parsed)) {
    invalid('The VAE header is not an object.')
  }
  if (
    parsed.__metadata__ !== undefined &&
    (!record(parsed.__metadata__) ||
      Object.values(parsed.__metadata__).some((value) => typeof value !== 'string'))
  ) {
    invalid('The safetensors metadata must contain string values.')
  }
  const payloadSize = fileSizeBytes - HEADER_LENGTH_BYTES - headerBytes.length
  const ranges: { end: number; start: number }[] = []
  let ldm = false
  let diffusers = false
  for (const [key, tensor] of Object.entries(parsed)) {
    if (key === '__metadata__') {
      continue
    }
    if (!/^(encoder\.|decoder\.|quant_conv\.|post_quant_conv\.)/.test(key)) {
      invalid(
        'Only standalone encoder, decoder, quant_conv and post_quant_conv tensors are supported.',
      )
    }
    ldm ||= /^(?:encoder\.down\.|decoder\.up\.|(?:encoder|decoder)\.mid\.(?:block_|attn_))/.test(
      key,
    )
    diffusers ||=
      /^(?:encoder\.down_blocks\.|decoder\.up_blocks\.|(?:encoder|decoder)\.mid_block\.)/.test(key)
    if (!record(tensor) || !Array.isArray(tensor.shape)) {
      invalid('A VAE tensor descriptor is invalid.')
    }
    const shape: unknown[] = tensor.shape
    const elements = shape.reduce<number>((total, dimension) => {
      if (!Number.isSafeInteger(dimension) || (dimension as number) < 1) {
        invalid('VAE tensor dimensions must be positive safe integers.')
      }
      const next = total * (dimension as number)
      if (!Number.isSafeInteger(next)) {
        invalid('A VAE tensor is too large.')
      }
      return next
    }, 1)
    const bytesPerElement = typeof tensor.dtype === 'string' ? DTYPE_BYTES[tensor.dtype] : undefined
    const offsets = tensor.data_offsets
    if (
      bytesPerElement === undefined ||
      !Number.isSafeInteger(elements * bytesPerElement) ||
      !Array.isArray(offsets) ||
      offsets.length !== 2 ||
      !Number.isSafeInteger(offsets[0]) ||
      !Number.isSafeInteger(offsets[1]) ||
      offsets[0] < 0 ||
      offsets[1] <= offsets[0] ||
      offsets[1] > payloadSize ||
      offsets[1] - offsets[0] !== elements * bytesPerElement
    ) {
      invalid('A VAE tensor has invalid or unsupported data.')
    }
    ranges.push({ end: offsets[1] as number, start: offsets[0] as number })
  }
  if (ldm === diffusers) {
    invalid('The VAE must use one supported standalone LDM or native Diffusers layout.')
  }
  const anchors = { ...COMMON_ANCHORS, ...(ldm ? FORMAT_ANCHORS.ldm : FORMAT_ANCHORS.diffusers) }
  for (const [key, expected] of Object.entries(anchors)) {
    const tensor = parsed[key]
    if (
      !record(tensor) ||
      !Array.isArray(tensor.shape) ||
      tensor.shape.length !== expected.length ||
      tensor.shape.some((dimension, index) => dimension !== expected[index])
    ) {
      invalid(`Missing or incompatible pinned SDXL VAE tensor: ${key}`)
    }
  }
  let end = 0
  for (const range of ranges.sort((left, right) => left.start - right.start)) {
    if (range.start !== end) {
      invalid('VAE tensors must occupy contiguous non-overlapping data.')
    }
    end = range.end
  }
  if (end !== payloadSize) {
    invalid('VAE tensor data does not cover the safetensors payload.')
  }
}

/** Read only the bounded header of the current regular file, refusing links and pickle formats. */
export async function qualifyIllustriousVae(managedPath: string): Promise<void> {
  if (!managedPath.toLowerCase().endsWith('.safetensors')) {
    invalid('The VAE is not a safetensors file.')
  }
  const handle = await open(managedPath, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size <= HEADER_LENGTH_BYTES) {
      invalid('The VAE is not a regular safetensors file.')
    }
    const lengthBytes = Buffer.alloc(HEADER_LENGTH_BYTES)
    await readExactly(handle, lengthBytes, 0)
    const length = lengthBytes.readBigUInt64LE()
    if (
      length < 2n ||
      length > BigInt(MAX_HEADER_BYTES) ||
      length >= BigInt(stat.size - HEADER_LENGTH_BYTES)
    ) {
      invalid('The VAE safetensors header length is invalid or exceeds the 32 MiB limit.')
    }
    const headerBytes = Buffer.alloc(Number(length))
    await readExactly(handle, headerBytes, HEADER_LENGTH_BYTES)
    inspectIllustriousVaeSafetensorsHeader(headerBytes, stat.size)
  } finally {
    await handle.close()
  }
}

function invalid(message: string): never {
  throw new IllustriousVaeQualificationError(message)
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function readExactly(
  handle: Awaited<ReturnType<typeof open>>,
  bytes: Buffer,
  position: number,
): Promise<void> {
  let total = 0
  while (total < bytes.length) {
    const { bytesRead } = await handle.read(bytes, total, bytes.length - total, position + total)
    if (bytesRead === 0) {
      invalid('The VAE safetensors header is truncated.')
    }
    total += bytesRead
  }
}
