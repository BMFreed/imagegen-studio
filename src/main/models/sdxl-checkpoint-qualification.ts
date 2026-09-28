import { constants } from 'node:fs'
import { open } from 'node:fs/promises'

const MAX_HEADER_BYTES = 32 * 1024 * 1024
const HEADER_LENGTH_BYTES = 8

type TensorDescriptor = {
  data_offsets: unknown
  dtype: unknown
  shape: unknown
}

type RequiredTensor = {
  key: string
  label: string
  shape: readonly number[]
}

// The first SDXL txt2img path loads an original-format, self-contained base checkpoint.
// These anchors distinguish its UNet from SD 1/2, SDXL refiner and inpaint variants and
// require both text encoders and the VAE. They are a preflight, not a complete load test.
const REQUIRED_TENSORS: readonly RequiredTensor[] = [
  {
    key: 'model.diffusion_model.input_blocks.0.0.weight',
    label: 'SDXL base UNet input',
    shape: [320, 4, 3, 3],
  },
  {
    key: 'model.diffusion_model.input_blocks.4.1.transformer_blocks.0.attn2.to_k.weight',
    label: 'SDXL base UNet cross-attention',
    shape: [640, 2048],
  },
  {
    key: 'model.diffusion_model.out.2.weight',
    label: 'SDXL base UNet output',
    shape: [4, 320, 3, 3],
  },
  {
    key: 'conditioner.embedders.0.transformer.text_model.encoder.layers.0.layer_norm1.weight',
    label: 'CLIP-L text encoder',
    shape: [768],
  },
  {
    key: 'conditioner.embedders.1.model.ln_final.weight',
    label: 'OpenCLIP-G text encoder',
    shape: [1280],
  },
  {
    key: 'first_stage_model.encoder.conv_in.weight',
    label: 'VAE encoder',
    shape: [128, 3, 3, 3],
  },
  {
    key: 'first_stage_model.decoder.conv_out.weight',
    label: 'VAE decoder',
    shape: [3, 128, 3, 3],
  },
]

const DTYPE_BYTES: Readonly<Record<string, number>> = {
  BF16: 2,
  F16: 2,
  F32: 4,
}

export class SdxlCheckpointQualificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SdxlCheckpointQualificationError'
  }
}

/** Inspect the bounded header only; this proves neither Illustrious lineage nor loadability. */
export function inspectSdxlSafetensorsHeader(headerBytes: Uint8Array, fileSizeBytes: number): void {
  if (
    headerBytes.length < 2 ||
    headerBytes.length > MAX_HEADER_BYTES ||
    !Number.isSafeInteger(fileSizeBytes) ||
    fileSizeBytes <= HEADER_LENGTH_BYTES + headerBytes.length
  ) {
    invalid('The safetensors header or file size is invalid.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(headerBytes).toString('utf8')) as unknown
  } catch {
    invalid('The safetensors header is not valid JSON.')
  }
  if (!record(parsed)) {
    invalid('The safetensors header is not an object.')
  }
  const metadata = parsed.__metadata__
  if (metadata !== undefined && !record(metadata)) {
    invalid('The safetensors metadata is invalid.')
  }
  // modelspec metadata is advisory. Custom Illustrious files may label it differently;
  // the tensor shapes, selected source family and eventual loader determine compatibility.

  const dataLength = fileSizeBytes - HEADER_LENGTH_BYTES - headerBytes.length
  for (const required of REQUIRED_TENSORS) {
    const descriptor = parsed[required.key]
    if (!record(descriptor) || !sameShape(descriptor.shape, required.shape)) {
      invalid(`Missing or incompatible ${required.label} weights.`)
    }
    const tensor = descriptor as TensorDescriptor
    const bytesPerElement = typeof tensor.dtype === 'string' ? DTYPE_BYTES[tensor.dtype] : undefined
    const offsets = tensor.data_offsets
    if (
      bytesPerElement === undefined ||
      !Array.isArray(offsets) ||
      offsets.length !== 2 ||
      !Number.isSafeInteger(offsets[0]) ||
      !Number.isSafeInteger(offsets[1]) ||
      offsets[0] < 0 ||
      offsets[1] <= offsets[0] ||
      offsets[1] > dataLength ||
      offsets[1] - offsets[0] !==
        required.shape.reduce((elements, dimension) => elements * dimension, 1) * bytesPerElement
    ) {
      invalid(`The ${required.label} tensor data is invalid or unsupported.`)
    }
  }
}

/** Read only the safetensors header from the exact installed checkpoint. */
export async function qualifySdxlCheckpoint(managedPath: string): Promise<void> {
  if (!managedPath.toLowerCase().endsWith('.safetensors')) {
    invalid('The checkpoint is not a safetensors file.')
  }
  const handle = await open(managedPath, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size <= HEADER_LENGTH_BYTES) {
      invalid('The checkpoint is not a regular safetensors file.')
    }
    const lengthBytes = Buffer.alloc(HEADER_LENGTH_BYTES)
    await readExactly(handle, lengthBytes, 0)
    const headerLength = lengthBytes.readBigUInt64LE()
    if (
      headerLength < 2n ||
      headerLength > BigInt(MAX_HEADER_BYTES) ||
      headerLength >= BigInt(stat.size - HEADER_LENGTH_BYTES)
    ) {
      invalid('The safetensors header length is invalid or exceeds the 32 MiB limit.')
    }
    const headerBytes = Buffer.alloc(Number(headerLength))
    await readExactly(handle, headerBytes, HEADER_LENGTH_BYTES)
    inspectSdxlSafetensorsHeader(headerBytes, stat.size)
  } finally {
    await handle.close()
  }
}

function invalid(message: string): never {
  throw new SdxlCheckpointQualificationError(message)
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sameShape(actual: unknown, expected: readonly number[]): boolean {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((dimension, index) => dimension === expected[index])
  )
}

async function readExactly(
  handle: Awaited<ReturnType<typeof open>>,
  buffer: Buffer,
  position: number,
): Promise<void> {
  let total = 0
  while (total < buffer.length) {
    const { bytesRead } = await handle.read(buffer, total, buffer.length - total, position + total)
    if (bytesRead === 0) {
      invalid('The safetensors header is truncated.')
    }
    total += bytesRead
  }
}
