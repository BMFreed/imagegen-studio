export type DynamicPromptSeedBehavior = 'per-iteration' | 'per-prompt'

export interface GenerationBatchPlanInput {
  baseSeed: number
  iterations: number
  maxJobs: number
  maxPrompts: number
  negativePrompt: string
  positivePrompt: string
  seedBehavior: DynamicPromptSeedBehavior
}

export interface PlannedGenerationBatchItem {
  readonly iteration: number
  readonly promptPairIndex: number
  readonly prompts: Readonly<{ negative: string; positive: string }>
  readonly seed: number
}

export interface GenerationBatchPlan {
  readonly items: readonly PlannedGenerationBatchItem[]
  readonly truncated: boolean
}

/** Current internal worker prompt envelope, not a public dynamic batch capacity claim. */
export const GENERATION_BATCH_PROMPT_MAX_BYTES = 16 * 1024
const SEED_MODULUS = 2 ** 32

type PromptSegment = { alternatives: string[]; kind: 'group' } | { kind: 'literal'; text: string }
interface BoundedCount {
  count: number
  truncated: boolean
}

export class GenerationBatchPlanError extends Error {
  constructor(
    readonly code: 'BATCH_TOO_LARGE' | 'INPUT_INVALID' | 'PROMPT_INVALID',
    message: string,
  ) {
    super(message)
    this.name = 'GenerationBatchPlanError'
  }
}

/**
 * Plan concrete jobs from an already resolved base seed, without RNG, Project access or I/O.
 * maxPrompts selects a pair prefix; maxJobs refuses admission overflow instead of truncating jobs.
 * The caller owns seed-policy resolution and supplies its measured/current admission bound.
 */
export function planGenerationBatch(input: GenerationBatchPlanInput): GenerationBatchPlan {
  validateInput(input)
  // Validate all syntax before selecting a prefix, including groups beyond the configured maximum.
  const positive = parsePrompt(input.positivePrompt)
  const negative = parsePrompt(input.negativePrompt)
  const positiveCount = countExpansions(positive, input.maxPrompts)
  const negativeCount = countExpansions(negative, input.maxPrompts)
  const pairs = boundedProduct(positiveCount, negativeCount, input.maxPrompts)
  if (pairs.count > Math.floor(input.maxJobs / input.iterations)) {
    throw new GenerationBatchPlanError(
      'BATCH_TOO_LARGE',
      'The planned jobs exceed the supplied batch admission limit.',
    )
  }

  const items: PlannedGenerationBatchItem[] = []
  for (let promptPairIndex = 0; promptPairIndex < pairs.count; promptPairIndex += 1) {
    const prompts = Object.freeze({
      negative: expansionAt(negative, promptPairIndex % negativeCount.count),
      positive: expansionAt(positive, Math.floor(promptPairIndex / negativeCount.count)),
    })
    validatePromptText(prompts.positive)
    validatePromptText(prompts.negative)
    for (let iteration = 0; iteration < input.iterations; iteration += 1) {
      const offset = input.seedBehavior === 'per-iteration' ? iteration : items.length
      // Reduce the offset first to keep uint32 arithmetic exact even for a large supplied bound.
      const seed = (input.baseSeed + (offset % SEED_MODULUS)) % SEED_MODULUS
      items.push(Object.freeze({ iteration, promptPairIndex, prompts, seed }))
    }
  }
  return Object.freeze({ items: Object.freeze(items), truncated: pairs.truncated })
}

function validateInput(input: GenerationBatchPlanInput): void {
  if (
    input === null ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    typeof input.positivePrompt !== 'string' ||
    typeof input.negativePrompt !== 'string' ||
    !Number.isSafeInteger(input.maxPrompts) ||
    input.maxPrompts < 1 ||
    !Number.isSafeInteger(input.iterations) ||
    input.iterations < 1 ||
    !Number.isSafeInteger(input.maxJobs) ||
    input.maxJobs < 1 ||
    !Number.isSafeInteger(input.baseSeed) ||
    input.baseSeed < 0 ||
    input.baseSeed >= SEED_MODULUS ||
    !['per-iteration', 'per-prompt'].includes(input.seedBehavior)
  ) {
    throw new GenerationBatchPlanError('INPUT_INVALID', 'The batch planning input is invalid.')
  }
}

function validatePromptText(text: string): void {
  if (text.length > GENERATION_BATCH_PROMPT_MAX_BYTES) {
    throw new GenerationBatchPlanError(
      'PROMPT_INVALID',
      'The prompt exceeds the internal byte limit.',
    )
  }
  // Reject unpaired UTF-16 surrogates rather than letting UTF-8 encoding replace authored text.
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code >= 0xd8_00 && code <= 0xdb_ff) {
      const next = text.charCodeAt(index + 1)
      if (!(next >= 0xdc_00 && next <= 0xdf_ff)) {
        throw new GenerationBatchPlanError('PROMPT_INVALID', 'The prompt is not valid UTF-8 text.')
      }
      index += 1
    } else if (code >= 0xdc_00 && code <= 0xdf_ff) {
      throw new GenerationBatchPlanError('PROMPT_INVALID', 'The prompt is not valid UTF-8 text.')
    }
  }
  if (new TextEncoder().encode(text).length > GENERATION_BATCH_PROMPT_MAX_BYTES) {
    throw new GenerationBatchPlanError(
      'PROMPT_INVALID',
      'The prompt exceeds the internal byte limit.',
    )
  }
}

function parsePrompt(source: string): PromptSegment[] {
  validatePromptText(source)
  const segments: PromptSegment[] = []
  let literal = ''
  for (let index = 0; index < source.length; index += 1) {
    const char = source.charAt(index)
    if (char === '\\') {
      literal += char
      if (index + 1 < source.length) {
        literal += source.charAt(++index)
      }
      continue
    }
    if (char === '}') {
      throw new GenerationBatchPlanError(
        'PROMPT_INVALID',
        'The dynamic prompt has an unmatched brace.',
      )
    }
    if (char !== '{') {
      literal += char
      continue
    }
    if (literal) {
      segments.push({ kind: 'literal', text: literal })
      literal = ''
    }
    const alternatives: string[] = []
    let alternative = ''
    let closed = false
    for (index += 1; index < source.length; index += 1) {
      const groupChar = source.charAt(index)
      if (groupChar === '\\') {
        alternative += groupChar
        if (index + 1 < source.length) {
          alternative += source.charAt(++index)
        }
        continue
      }
      if (groupChar === '{') {
        throw new GenerationBatchPlanError(
          'PROMPT_INVALID',
          'Nested dynamic groups are unsupported.',
        )
      }
      if (groupChar === '|' || groupChar === '}') {
        const trimmed = alternative.trim()
        if (!trimmed) {
          throw new GenerationBatchPlanError(
            'PROMPT_INVALID',
            'Dynamic alternatives cannot be empty.',
          )
        }
        alternatives.push(trimmed)
        alternative = ''
        if (groupChar === '}') {
          closed = true
          break
        }
        continue
      }
      alternative += groupChar
    }
    if (!closed || alternatives.length < 2) {
      throw new GenerationBatchPlanError(
        'PROMPT_INVALID',
        'A dynamic group needs a closing brace and at least two alternatives.',
      )
    }
    segments.push({ alternatives, kind: 'group' })
  }
  if (literal) {
    segments.push({ kind: 'literal', text: literal })
  }
  return segments
}

function countExpansions(segments: readonly PromptSegment[], limit: number): BoundedCount {
  let count: BoundedCount = { count: 1, truncated: false }
  for (const segment of segments) {
    if (segment.kind === 'group') {
      count = boundedProduct(count, { count: segment.alternatives.length, truncated: false }, limit)
    }
  }
  return count
}

function boundedProduct(left: BoundedCount, right: BoundedCount, limit: number): BoundedCount {
  if (left.truncated || right.truncated || left.count > Math.floor(limit / right.count)) {
    return { count: limit, truncated: true }
  }
  return { count: left.count * right.count, truncated: false }
}

function expansionAt(segments: readonly PromptSegment[], ordinal: number): string {
  const parts: string[] = []
  // Mixed-radix selection reads one expansion directly; no Cartesian product is materialized.
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index]
    if (segment.kind === 'literal') {
      parts.push(segment.text)
    } else {
      parts.push(segment.alternatives[ordinal % segment.alternatives.length])
      ordinal = Math.floor(ordinal / segment.alternatives.length)
    }
  }
  return parts.reverse().join('')
}
