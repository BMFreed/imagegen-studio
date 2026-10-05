import { constants } from 'node:fs'
import { open } from 'node:fs/promises'

import { ANIMA_LORA_TARGET_PROFILE } from './anima-lora-target-profile.js'

const HEADER_LENGTH_BYTES = 8
const MAX_HEADER_BYTES = 32 * 1024 * 1024
const DTYPE_BYTES: Readonly<Record<string, number>> = { BF16: 2, F16: 2, F32: 4 }
const TARGETS = new Map(
  ANIMA_LORA_TARGET_PROFILE.flatMap((target) =>
    target.aliases.map((alias) => [alias, target] as const),
  ),
)
type Tensor = { dtype: string; offsets: readonly [number, number]; shape: number[] }
type Alpha = { dtype: string; offset: number }

export class AnimaLoraQualificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AnimaLoraQualificationError'
  }
}

/** Complete header preflight against native Linear targets; Python checks all tensor values. */
export function inspectAnimaLoraSafetensorsHeader(
  headerBytes: Uint8Array,
  fileSizeBytes: number,
): void {
  inspectHeader(headerBytes, fileSizeBytes)
}

/** Read a bounded current regular-file header and tiny alpha scalars, never reusable weights. */
export async function qualifyAnimaLora(managedPath: string): Promise<void> {
  if (!managedPath.toLowerCase().endsWith('.safetensors')) {
    invalid('Anima LoRA requires a safetensors file.')
  }
  const handle = await open(
    managedPath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const before = await handle.stat({ bigint: true })
    if (
      !before.isFile() ||
      before.size > BigInt(Number.MAX_SAFE_INTEGER) ||
      before.size <= BigInt(HEADER_LENGTH_BYTES)
    ) {
      invalid('The Anima LoRA is not a regular safetensors file.')
    }
    const prefix = Buffer.alloc(HEADER_LENGTH_BYTES)
    await readExactly(handle, prefix, 0)
    const length = prefix.readBigUInt64LE()
    if (
      length < 2n ||
      length > BigInt(MAX_HEADER_BYTES) ||
      length >= before.size - BigInt(HEADER_LENGTH_BYTES)
    ) {
      invalid('The Anima LoRA header is truncated or exceeds 32 MiB.')
    }
    const bytes = Buffer.alloc(Number(length))
    await readExactly(handle, bytes, HEADER_LENGTH_BYTES)
    const alphas = inspectHeader(bytes, Number(before.size))
    for (const alpha of alphas) {
      const value = Buffer.alloc(DTYPE_BYTES[alpha.dtype])
      await readExactly(handle, value, HEADER_LENGTH_BYTES + bytes.length + alpha.offset)
      if (!Number.isFinite(scalar(value, alpha.dtype))) {
        invalid('An Anima LoRA alpha scalar is not finite.')
      }
    }
    const after = await handle.stat({ bigint: true })
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs
    ) {
      invalid('The Anima LoRA changed during structural qualification.')
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
    invalid('The Anima LoRA header or file size is invalid.')
  }
  let text: string
  let parsed: unknown
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(headerBytes)
    parsed = JSON.parse(text) as unknown
  } catch {
    invalid('The Anima LoRA header is not valid UTF-8 JSON.')
  }
  assertUniqueJsonFields(text)
  if (!record(parsed)) {
    invalid('The Anima LoRA header is not an object.')
  }
  if (
    parsed.__metadata__ !== undefined &&
    (!record(parsed.__metadata__) ||
      Object.values(parsed.__metadata__).some((value) => typeof value !== 'string'))
  ) {
    invalid('Safetensors metadata must contain only string values.')
  }
  const ranges: Tensor[] = []
  const groups = new Map<string, Map<string, Tensor>>()
  const styles = new Set<'kohya' | 'peft'>()
  const payloadSize = fileSizeBytes - HEADER_LENGTH_BYTES - headerBytes.length
  for (const [key, descriptor] of Object.entries(parsed)) {
    if (key === '__metadata__') {
      continue
    }
    const match =
      /^(.+)\.(lora_down\.weight|lora_up\.weight|lora_A\.weight|lora_B\.weight|alpha)$/.exec(key)
    if (!match) {
      invalid('Only ordinary Kohya up/down or PEFT A/B pairs and scalar alpha are supported.')
    }
    const [, stem, suffix] = match
    const target = TARGETS.get(stem)
    if (!target) {
      invalid(`Unsupported pinned Anima Linear LoRA target: ${stem}`)
    }
    const style = stem.startsWith('lora_') ? 'kohya' : 'peft'
    const allowed =
      style === 'kohya'
        ? ['lora_down.weight', 'lora_up.weight', 'alpha']
        : ['lora_A.weight', 'lora_B.weight', 'alpha']
    if (!allowed.includes(suffix)) {
      invalid('The LoRA tensor suffix does not match its namespace style.')
    }
    styles.add(style)
    if (
      !record(descriptor) ||
      Object.keys(descriptor).length !== 3 ||
      !Object.hasOwn(descriptor, 'dtype') ||
      !Object.hasOwn(descriptor, 'shape') ||
      !Object.hasOwn(descriptor, 'data_offsets') ||
      !Array.isArray(descriptor.shape)
    ) {
      invalid('An Anima LoRA tensor descriptor is invalid.')
    }
    const shape: unknown[] = descriptor.shape
    const elements = shape.reduce<number>((total, dimension) => {
      if (
        !Number.isSafeInteger(dimension) ||
        (dimension as number) <= 0 ||
        !Number.isSafeInteger(total * (dimension as number))
      ) {
        invalid('Anima LoRA tensor dimensions must be positive safe integers.')
      }
      return total * (dimension as number)
    }, 1)
    const width = typeof descriptor.dtype === 'string' ? DTYPE_BYTES[descriptor.dtype] : undefined
    const offsets = descriptor.data_offsets
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
      invalid('Anima LoRA tensor dtype, offsets or byte size are invalid.')
    }
    const tensor: Tensor = {
      dtype: descriptor.dtype as string,
      offsets: [offsets[0] as number, offsets[1] as number],
      shape: shape as number[],
    }
    const group = groups.get(stem) ?? new Map<string, Tensor>()
    group.set(suffix, tensor)
    groups.set(stem, group)
    ranges.push(tensor)
  }
  if (groups.size === 0 || styles.size !== 1) {
    invalid('Anima LoRA is empty or mixes Kohya and PEFT styles.')
  }
  let end = 0
  for (const range of ranges.sort((left, right) => left.offsets[0] - right.offsets[0])) {
    if (range.offsets[0] !== end) {
      invalid('Anima LoRA tensors overlap or contain unreferenced bytes.')
    }
    end = range.offsets[1]
  }
  if (end !== payloadSize) {
    invalid('Anima LoRA tensors do not cover the complete payload.')
  }
  const usedTargets = new Set<string>()
  const alphas: Alpha[] = []
  for (const [stem, group] of groups) {
    const target = TARGETS.get(stem)!
    if (usedTargets.has(target.target)) {
      invalid('Several Anima LoRA aliases target the same module.')
    }
    usedTargets.add(target.target)
    const down = group.get(stem.startsWith('lora_') ? 'lora_down.weight' : 'lora_A.weight')
    const up = group.get(stem.startsWith('lora_') ? 'lora_up.weight' : 'lora_B.weight')
    if (!down || !up) {
      invalid('An Anima LoRA module is missing its complete tensor pair.')
    }
    const rank = down.shape[0]
    if (
      !sameShape(down.shape, [rank, target.shape[1]]) ||
      !sameShape(up.shape, [target.shape[0], rank])
    ) {
      invalid(`Anima LoRA rank or dimensions do not match the native module: ${stem}`)
    }
    const alpha = group.get('alpha')
    if (alpha) {
      if (alpha.shape.length !== 0) {
        invalid('Anima LoRA alpha must be a scalar.')
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
  throw new AnimaLoraQualificationError(message)
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** JSON.parse checks grammar; this token walk additionally refuses duplicate decoded fields. */
function assertUniqueJsonFields(text: string): void {
  const stack: (Set<string> | null)[] = []
  for (let index = 0; index < text.length; index++) {
    switch (text[index]) {
      case '"': {
        const start = index
        index++
        while (index < text.length) {
          if (text[index] === '\\') {
            index += 2
          } else if (text[index] === '"') {
            break
          } else {
            index++
          }
        }
        let next = index + 1
        while (next < text.length && /\s/.test(text[next])) {
          next++
        }
        if (text[next] === ':') {
          const fields = stack.at(-1)
          const name = JSON.parse(text.slice(start, index + 1)) as string
          if (fields?.has(name)) {
            invalid('Anima LoRA safetensors JSON has duplicate fields.')
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
      invalid('The Anima LoRA file is truncated.')
    }
    total += bytesRead
  }
}
