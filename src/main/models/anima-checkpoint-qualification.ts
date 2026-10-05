import { constants } from 'node:fs'
import { open } from 'node:fs/promises'

import { ANIMA_BASE_1_TENSOR_SHAPES } from './anima-checkpoint-profile.js'

const HEADER_LENGTH_BYTES = 8
const MAX_HEADER_BYTES = 32 * 1024 * 1024
const DTYPE_BYTES: Readonly<Record<string, number>> = { BF16: 2, F16: 2, F32: 4 }
const MODEL_PREFIXES = ['model.diffusion_model.', 'net.'] as const
const DERIVED_KEYS = new Set([
  'llm_adapter.rotary_emb.inv_freq',
  'pos_embedder.dim_spatial_range',
  'pos_embedder.dim_temporal_range',
  'pos_embedder.seq',
])

export class AnimaCheckpointQualificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AnimaCheckpointQualificationError'
  }
}

/**
 * Screen the complete original Anima Base transformer/adapter schema. Identity and lineage belong
 * to the caller; Python still checks actual tensor values and native strict loading.
 */
export function inspectAnimaSafetensorsHeader(
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
    invalid('The Anima safetensors header or file size is invalid.')
  }
  let parsed: unknown
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(headerBytes)
    parsed = JSON.parse(text) as unknown
  } catch {
    invalid('The Anima header is not valid UTF-8 JSON.')
  }
  if (!record(parsed)) {
    invalid('The Anima header is not an object.')
  }
  assertUniqueJsonFields(text)
  if (
    parsed.__metadata__ !== undefined &&
    (!record(parsed.__metadata__) ||
      Object.values(parsed.__metadata__).some((value) => typeof value !== 'string'))
  ) {
    invalid('Safetensors metadata must contain only string values.')
  }

  const keys = Object.keys(parsed).filter((key) => key !== '__metadata__')
  const prefixes = MODEL_PREFIXES.filter((prefix) => keys.some((key) => key.startsWith(prefix)))
  if (prefixes.length > 1) {
    invalid('Mixed Anima checkpoint packaging prefixes are unsupported.')
  }
  const prefix = prefixes[0] ?? ''
  const payloadSize = fileSizeBytes - HEADER_LENGTH_BYTES - headerBytes.length
  const ranges: { end: number; start: number }[] = []
  const modelKeys = new Set<string>()
  for (const key of keys) {
    const tensor = parsed[key]
    if (!record(tensor) || !Array.isArray(tensor.shape)) {
      invalid('An Anima tensor descriptor is invalid.')
    }
    const shape: unknown[] = tensor.shape
    const elements = shape.reduce<number>((product, dimension) => {
      if (
        !Number.isSafeInteger(dimension) ||
        (dimension as number) <= 0 ||
        !Number.isSafeInteger(product * (dimension as number))
      ) {
        invalid('Anima tensor dimensions must be positive safe integers.')
      }
      return product * (dimension as number)
    }, 1)
    const width = typeof tensor.dtype === 'string' ? DTYPE_BYTES[tensor.dtype] : undefined
    const offsets = tensor.data_offsets
    if (
      width === undefined ||
      !Number.isSafeInteger(elements * width) ||
      !Array.isArray(offsets) ||
      offsets.length !== 2 ||
      !Number.isSafeInteger(offsets[0]) ||
      !Number.isSafeInteger(offsets[1]) ||
      offsets[0] < 0 ||
      offsets[1] <= offsets[0] ||
      offsets[1] > payloadSize ||
      offsets[1] - offsets[0] !== elements * width
    ) {
      invalid('An Anima tensor has invalid or unsupported data.')
    }
    ranges.push({ end: offsets[1] as number, start: offsets[0] as number })

    // Only known bundled companions and regenerable exporter fields are outside model state.
    // Required parameters never match this exclusion; extra trainable weights are refused.
    const normalized = prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key
    if (isDerived(normalized)) {
      continue
    }
    if (prefix && !key.startsWith(prefix)) {
      if (
        prefix === 'model.diffusion_model.' &&
        /^(first_stage_model\.|cond_stage_model\.)/.test(key)
      ) {
        continue
      }
      invalid(`Unexpected tensor outside the Anima model: ${key}`)
    }
    const expected = Object.hasOwn(ANIMA_BASE_1_TENSOR_SHAPES, normalized)
      ? ANIMA_BASE_1_TENSOR_SHAPES[normalized]
      : undefined
    if (
      !expected ||
      shape.length !== expected.length ||
      shape.some((dimension, index) => dimension !== expected[index])
    ) {
      invalid(`Missing or incompatible original Anima Base parameter: ${normalized}`)
    }
    if (modelKeys.has(normalized)) {
      invalid('Anima parameter identity is ambiguous.')
    }
    modelKeys.add(normalized)
  }
  for (const key of Object.keys(ANIMA_BASE_1_TENSOR_SHAPES)) {
    if (!modelKeys.has(key)) {
      invalid(`Missing original Anima Base parameter: ${key}`)
    }
  }
  let end = 0
  for (const range of ranges.sort((left, right) => left.start - right.start)) {
    if (range.start !== end) {
      invalid('Anima tensor data must be contiguous and non-overlapping.')
    }
    end = range.end
  }
  if (end !== payloadSize) {
    invalid('Anima tensors do not cover the full safetensors payload.')
  }
}

/** Read only a bounded current regular-file header, never model payload or pickle. */
export async function qualifyAnimaCheckpoint(managedPath: string): Promise<void> {
  if (!managedPath.toLowerCase().endsWith('.safetensors')) {
    invalid('Anima requires a safetensors checkpoint.')
  }
  const handle = await open(
    managedPath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const before = await handle.stat()
    if (
      !before.isFile() ||
      !Number.isSafeInteger(before.size) ||
      before.size <= HEADER_LENGTH_BYTES
    ) {
      invalid('The Anima checkpoint is not a regular safetensors file.')
    }
    const length = Buffer.alloc(HEADER_LENGTH_BYTES)
    await readExactly(handle, length, 0)
    const headerLength = length.readBigUInt64LE()
    if (
      headerLength < 2n ||
      headerLength > BigInt(MAX_HEADER_BYTES) ||
      headerLength >= BigInt(before.size - HEADER_LENGTH_BYTES)
    ) {
      invalid('The Anima safetensors header is truncated or exceeds 32 MiB.')
    }
    const bytes = Buffer.alloc(Number(headerLength))
    await readExactly(handle, bytes, HEADER_LENGTH_BYTES)
    inspectAnimaSafetensorsHeader(bytes, before.size)
    const after = await handle.stat()
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs
    ) {
      invalid('The Anima checkpoint changed during header qualification.')
    }
  } finally {
    await handle.close()
  }
}

function invalid(message: string): never {
  throw new AnimaCheckpointQualificationError(message)
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function isDerived(key: string): boolean {
  return key.startsWith('model_sampling.') || DERIVED_KEYS.has(key)
}

// JSON.parse validates grammar but silently overwrites duplicate fields. Walk its valid token
// structure to detect duplicate decoded names at every object level, including tensor fields.
function assertUniqueJsonFields(text: string): void {
  const stack: (Set<string> | null)[] = []
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    switch (character) {
      case '"': {
        const start = index
        index += 1
        while (index < text.length) {
          if (text[index] === '\\') {
            index += 2
          } else if (text[index] === '"') {
            break
          } else {
            index += 1
          }
        }
        let next = index + 1
        while (/\s/.test(text[next] ?? '') && next < text.length) {
          next += 1
        }
        if (text[next] === ':') {
          const fields = stack.at(-1)
          const name = JSON.parse(text.slice(start, index + 1)) as string
          if (fields?.has(name)) {
            invalid('Anima safetensors JSON has duplicate fields.')
          }
          fields?.add(name)
        }

        break
      }
      case '[': {
        stack.push(null)
        break
      }
      case ']':
      case '}': {
        stack.pop()
        break
      }
      case '{': {
        stack.push(new Set<string>())
        break
      }
      // No default
    }
  }
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
      invalid('The Anima safetensors header is truncated.')
    }
    total += bytesRead
  }
}
