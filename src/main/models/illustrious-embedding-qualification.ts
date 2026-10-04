import { constants } from 'node:fs'
import { open } from 'node:fs/promises'

const MAX_HEADER_BYTES = 32 * 1024 * 1024
const HEADER_LENGTH_BYTES = 8
// Four pinned CLIP chunks provide 75 usable content positions each.
export const ILLUSTRIOUS_EMBEDDING_MAX_VECTORS = 300
const WIDTHS = { clip_g: 1280, clip_l: 768 } as const
const DTYPE_BYTES: Readonly<Record<string, number>> = { BF16: 2, F16: 2, F32: 4 }

export class IllustriousEmbeddingQualificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IllustriousEmbeddingQualificationError'
  }
}

/** Structural preflight only; the worker checks all values and their actual encoder conversion. */
export function inspectIllustriousEmbeddingSafetensorsHeader(
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
    invalid('The embedding header or file size is invalid.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(headerBytes)) as unknown
  } catch {
    invalid('The embedding header is not valid UTF-8 JSON.')
  }
  if (!record(parsed)) {
    invalid('The embedding header is not an object.')
  }
  if (
    parsed.__metadata__ !== undefined &&
    (!record(parsed.__metadata__) ||
      Object.values(parsed.__metadata__).some((value) => typeof value !== 'string'))
  ) {
    invalid('The safetensors metadata must contain string values.')
  }
  if (
    Object.keys(parsed).filter((key) => key !== '__metadata__').length !== 2 ||
    Object.keys(parsed).some((key) => key !== '__metadata__' && !(key in WIDTHS))
  ) {
    invalid('Only paired clip_l and clip_g textual-inversion tensors are supported.')
  }
  const payloadSize = fileSizeBytes - HEADER_LENGTH_BYTES - headerBytes.length
  const ranges: { end: number; start: number }[] = []
  let vectorCount: number | undefined
  for (const [key, width] of Object.entries(WIDTHS)) {
    const tensor = parsed[key]
    if (!record(tensor) || !Array.isArray(tensor.shape)) {
      invalid('A paired CLIP embedding tensor is missing or invalid.')
    }
    const shape: unknown[] = tensor.shape
    const count = shape.length === 1 ? 1 : shape[0]
    if (
      (shape.length !== 1 && shape.length !== 2) ||
      shape.at(-1) !== width ||
      !Number.isSafeInteger(count) ||
      (count as number) < 1 ||
      (count as number) > ILLUSTRIOUS_EMBEDDING_MAX_VECTORS ||
      (vectorCount !== undefined && vectorCount !== count)
    ) {
      invalid(
        'Paired CLIP embeddings require equal vector counts from 1 to 300 and widths 768/1280.',
      )
    }
    vectorCount = count as number
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
      offsets[1] > payloadSize ||
      offsets[1] - offsets[0] !== vectorCount * width * bytesPerElement
    ) {
      invalid('An embedding tensor has invalid dtype, offsets or byte size.')
    }
    ranges.push({ end: offsets[1] as number, start: offsets[0] as number })
  }
  let end = 0
  for (const range of ranges.sort((left, right) => left.start - right.start)) {
    if (range.start !== end) {
      invalid('Embedding tensors must occupy contiguous non-overlapping data.')
    }
    end = range.end
  }
  if (end !== payloadSize) {
    invalid('Embedding tensors do not cover the safetensors payload.')
  }
}

/** Open a current regular safetensors file without following links or allocating tensor weights. */
export async function qualifyIllustriousEmbedding(managedPath: string): Promise<void> {
  if (!managedPath.toLowerCase().endsWith('.safetensors')) {
    invalid('The embedding is not a safetensors file.')
  }
  const handle = await open(managedPath, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size <= HEADER_LENGTH_BYTES) {
      invalid('The embedding is not a regular safetensors file.')
    }
    const prefix = Buffer.alloc(HEADER_LENGTH_BYTES)
    await readExactly(handle, prefix, 0)
    const length = prefix.readBigUInt64LE()
    if (
      length < 2n ||
      length > BigInt(MAX_HEADER_BYTES) ||
      length >= BigInt(stat.size - HEADER_LENGTH_BYTES)
    ) {
      invalid('The embedding header length is invalid or exceeds the 32 MiB limit.')
    }
    const headerBytes = Buffer.alloc(Number(length))
    await readExactly(handle, headerBytes, HEADER_LENGTH_BYTES)
    inspectIllustriousEmbeddingSafetensorsHeader(headerBytes, stat.size)
  } finally {
    await handle.close()
  }
}

function invalid(message: string): never {
  throw new IllustriousEmbeddingQualificationError(message)
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
      invalid('The embedding safetensors header is truncated.')
    }
    total += bytesRead
  }
}
