import { GENERATION_BATCH_PROMPT_MAX_BYTES } from './generation-batch-plan.js'

export interface AnimaWeightedSpan {
  readonly end: number
  readonly start: number
  readonly weight: number
}

export interface CompiledAnimaPromptWeighting {
  readonly cleanedText: string
  readonly spans: readonly AnimaWeightedSpan[]
  readonly version: 'anima-prompt-weighting-v1'
}

interface WeightedPart {
  text: string
  weight: number
}

interface LiteralPoint {
  escaped: boolean
  text: string
}

export class AnimaPromptWeightingError extends Error {
  readonly code = 'GENERATION_PROMPT_UNSUPPORTED'

  constructor(message: string) {
    super(message)
    this.name = 'AnimaPromptWeightingError'
  }
}

// Provisional compiler work ceiling, not a model-specific attention range.
// Together with the existing 16 KiB concrete envelope this bounds nested work.
const MAX_ATTENTION_NESTING = 128
const FINITE_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
const PLAIN_SUFFIX_NUMBER = /^\+?(?:\d+(?:\.\d*)?|\.\d+)$/
const ESCAPABLE = new Set(String.raw`()[]{}<>:|+-\.,"`.split(''))
const UNSUPPORTED_MARKUP = new Set('[]{}<>'.split(''))

class AnimaAttentionParser {
  private position = 0

  constructor(private readonly points: readonly string[]) {}

  parse(): WeightedPart[] {
    return this.parseSequence(0)
  }

  private isUnsupportedOperator(): boolean {
    const point = this.points[this.position]
    if (point !== '.' && point?.toLowerCase() !== 'w' && point?.toLowerCase() !== 'u') {
      return false
    }
    const next = this.points.slice(this.position, this.position + 12).join('')
    const operator = /^(?:\.(?:swap|and|add|blend|attend)|(?:with|use)Lora)/i.exec(next)
    if (!operator) {
      return false
    }
    let afterOperator = this.position + operator[0].length
    while (/\s/.test(this.points[afterOperator] ?? '')) {
      afterOperator += 1
    }
    return this.points[afterOperator] === '('
  }

  private isUrlColon(): boolean {
    return this.points[this.position + 1] === '/' && this.points[this.position + 2] === '/'
  }

  private parseGroup(depth: number): WeightedPart[] {
    if (depth > MAX_ATTENTION_NESTING) {
      throw new AnimaPromptWeightingError(
        'The prompt exceeds the compiler attention nesting limit.',
      )
    }
    this.position += 1
    const parts = this.parseSequence(depth)
    let explicit = false
    let weight = 1.1
    if (this.points[this.position] === ':') {
      explicit = true
      this.position += 1
      const start = this.position
      while (this.position < this.points.length && this.points[this.position] !== ')') {
        this.position += 1
      }
      const rawWeight = this.points.slice(start, this.position).join('').trim()
      if (!parts.some((part) => part.text) || !FINITE_NUMBER.test(rawWeight)) {
        throw new AnimaPromptWeightingError('The prompt has an invalid explicit attention weight.')
      }
      weight = numericWeight(rawWeight)
    }
    if (this.points[this.position] !== ')') {
      throw new AnimaPromptWeightingError('The prompt has an unclosed attention group.')
    }
    this.position += 1
    const suffix = this.readGroupSuffix(depth)
    if (suffix !== null) {
      if (explicit) {
        throw new AnimaPromptWeightingError(
          'The same attention group has two conflicting operators.',
        )
      }
      weight = suffix
    }
    return parts.map((part) => ({ text: part.text, weight: multiplyWeights(part.weight, weight) }))
  }

  private parseLiteral(depth: number): WeightedPart {
    const literal: LiteralPoint[] = []
    while (this.position < this.points.length) {
      const point = this.points[this.position]
      if (
        /\s/.test(point) ||
        point === ',' ||
        point === '(' ||
        point === ')' ||
        (point === ':' && depth > 0 && !this.isUrlColon())
      ) {
        break
      }
      if (point === '\\' && ESCAPABLE.has(this.points[this.position + 1] ?? '')) {
        literal.push({ escaped: true, text: this.points[this.position + 1] })
        this.position += 2
        continue
      }
      if (UNSUPPORTED_MARKUP.has(point) || this.isUnsupportedOperator()) {
        throw new AnimaPromptWeightingError(
          'The prompt uses an unsupported resource or conditioning syntax.',
        )
      }
      literal.push({ escaped: false, text: point })
      this.position += 1
    }
    let suffixStart = literal.length
    while (suffixStart > 0) {
      const point = literal[suffixStart - 1]
      if (point.escaped || (point.text !== '+' && point.text !== '-')) {
        break
      }
      suffixStart -= 1
    }
    if (suffixStart > 0 && suffixStart < literal.length) {
      const suffix = literal
        .slice(suffixStart)
        .map((point) => point.text)
        .join('')
      if (!/^\++$/.test(suffix) && !/^-+$/.test(suffix)) {
        throw new AnimaPromptWeightingError(
          'The prompt mixes increase and decrease attention suffixes.',
        )
      }
      return {
        text: literal
          .slice(0, suffixStart)
          .map((point) => point.text)
          .join(''),
        weight: suffixMarkersWeight(suffix),
      }
    }
    return { text: literal.map((point) => point.text).join(''), weight: 1 }
  }

  private parseSequence(depth: number): WeightedPart[] {
    const parts: WeightedPart[] = []
    while (this.position < this.points.length) {
      const point = this.points[this.position]
      if (point === ')') {
        if (depth === 0) {
          throw new AnimaPromptWeightingError('The prompt has an unexpected closing parenthesis.')
        }
        return parts
      }
      if (point === ':' && depth > 0 && !this.isUrlColon()) {
        return parts
      }
      if (point === '(') {
        parts.push(...this.parseGroup(depth + 1))
      } else if (/\s/.test(point) || point === ',') {
        parts.push({ text: point, weight: 1 })
        this.position += 1
      } else {
        parts.push(this.parseLiteral(depth))
      }
    }
    if (depth > 0) {
      throw new AnimaPromptWeightingError('The prompt has an unclosed attention group.')
    }
    return parts
  }

  private readGroupSuffix(depth: number): number | null {
    const first = this.points[this.position]
    if (first === undefined || !/[+\-\d.]/.test(first)) {
      return null
    }
    // A period followed by prose is literal punctuation; .5 is a numeric suffix.
    if (first === '.' && !/\d/.test(this.points[this.position + 1] ?? '')) {
      return null
    }
    const start = this.position
    while (
      this.position < this.points.length &&
      !/[\s,()[\]{}<>\\]/.test(this.points[this.position])
    ) {
      // Inside a parent group, its explicit colon belongs to that parent rather than this suffix.
      if (depth > 1 && this.points[this.position] === ':') {
        break
      }
      this.position += 1
    }
    const raw = this.points.slice(start, this.position).join('')
    if (/^\++$/.test(raw) || /^-+$/.test(raw)) {
      return suffixMarkersWeight(raw)
    }
    if (!PLAIN_SUFFIX_NUMBER.test(raw)) {
      throw new AnimaPromptWeightingError(
        'The prompt has an ambiguous or unsupported attention suffix.',
      )
    }
    return numericWeight(raw)
  }
}

/**
 * Compile one concrete frozen prompt. It does not expand dynamic syntax, resolve resources, change
 * authored text or admit Anima generation. Offsets count Unicode code points, never JavaScript
 * UTF-16 units.
 */
export function compileAnimaPromptWeighting(concreteText: string): CompiledAnimaPromptWeighting {
  validateConcreteText(concreteText)
  const parts = new AnimaAttentionParser(Array.from(concreteText)).parse()
  const spans: AnimaWeightedSpan[] = []
  let cleanedText = ''
  let position = 0
  for (const part of parts) {
    if (!part.text) {
      continue
    }
    cleanedText += part.text
    const end = position + Array.from(part.text).length
    const previous = spans.at(-1)
    if (previous?.weight === part.weight) {
      spans[spans.length - 1] = { end, start: previous.start, weight: part.weight }
    } else {
      spans.push({ end, start: position, weight: part.weight })
    }
    position = end
  }
  return Object.freeze({
    cleanedText,
    spans: Object.freeze(spans.map((span) => Object.freeze(span))),
    version: 'anima-prompt-weighting-v1',
  })
}

function validateConcreteText(text: string): void {
  if (typeof text !== 'string') {
    throw new AnimaPromptWeightingError('The concrete prompt must be text.')
  }
  if (text.length > GENERATION_BATCH_PROMPT_MAX_BYTES) {
    throw new AnimaPromptWeightingError('The concrete prompt exceeds the 16 KiB byte limit.')
  }
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code >= 0xd8_00 && code <= 0xdb_ff) {
      const next = text.charCodeAt(index + 1)
      if (!(next >= 0xdc_00 && next <= 0xdf_ff)) {
        throw new AnimaPromptWeightingError('The concrete prompt contains an unpaired surrogate.')
      }
      index += 1
    } else if (code >= 0xdc_00 && code <= 0xdf_ff) {
      throw new AnimaPromptWeightingError('The concrete prompt contains an unpaired surrogate.')
    }
  }
  if (new TextEncoder().encode(text).length > GENERATION_BATCH_PROMPT_MAX_BYTES) {
    throw new AnimaPromptWeightingError('The concrete prompt exceeds the 16 KiB byte limit.')
  }
}

function checkedWeight(weight: number): number {
  if (!Number.isFinite(weight)) {
    throw new AnimaPromptWeightingError('The prompt produces a non-finite attention weight.')
  }
  return weight === 0 ? 0 : weight
}

function multiplyWeights(left: number, right: number): number {
  const result = checkedWeight(left * right)
  if (result === 0 && left !== 0 && right !== 0) {
    throw new AnimaPromptWeightingError(
      'The compound attention weight underflows numeric precision.',
    )
  }
  return result
}

function numericWeight(raw: string): number {
  const result = checkedWeight(Number(raw))
  const mantissa = raw.split(/e/i, 1)[0]
  if (result === 0 && /[1-9]/.test(mantissa)) {
    throw new AnimaPromptWeightingError('The attention number underflows numeric precision.')
  }
  return result
}

function suffixMarkersWeight(markers: string): number {
  const result = checkedWeight((markers[0] === '+' ? 1.1 : 0.9) ** markers.length)
  if (result === 0) {
    throw new AnimaPromptWeightingError('The attention suffix underflows numeric precision.')
  }
  return result
}
