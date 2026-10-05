export interface AnimaAttentionAdvisory {
  from: number
  message: string
  to: number
}

interface MarkerOperator {
  kind: 'markers'
  markers: string
}

interface NumericOperator {
  kind: 'numeric'
  raw: string
}

interface Group {
  bodyFrom: number
  bodyTo: number
  end: number
  from: number
  operator: MarkerOperator | NumericOperator
}

interface Literal {
  from: number
  markers: string
  suffixFrom: number
  to: number
}

interface Analysis {
  escapes: { from: number; to: number }[]
  groups: Group[]
  issues: AnimaAttentionAdvisory[]
  literals: Literal[]
}

const FINITE_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
const SUFFIX_NUMBER = /^\+?(?:\d+(?:\.\d*)?|\.\d+)$/
const CONFLICT = 'Anima attention group has conflicting operators.'
const MIXED = 'Anima attention suffix mixes increase and decrease markers.'
const CUT = 'Cannot adjust Anima attention: the selection cuts an attention operator or escape.'

export function inspectAnimaAttentionSyntax(
  text: string,
  maxIssues: number,
): AnimaAttentionAdvisory[] {
  return analyze(text, maxIssues).issues
}

/** A selection may contain complete operators, but must not bisect one or a UTF-16 escape/pair. */
export function inspectAnimaAttentionSelection(
  text: string,
  from: number,
  to: number,
): AnimaAttentionAdvisory | undefined {
  const result = analyze(text)
  const boundaryCuts = (start: number, end: number) =>
    (from > start && from < end) || (to > start && to < end)
  const cutsGroup = result.groups.some((group) => {
    const overlaps = from < group.end && to > group.from
    const contains = from <= group.from && to >= group.end
    if (!overlaps || contains) {
      return false
    }
    return from <= group.from || to > group.bodyTo || from >= group.bodyTo
  })
  const cutsPair = [from, to].some((position) => {
    const code = text.charCodeAt(position)
    const previous = text.charCodeAt(position - 1)
    return code >= 0xdc_00 && code <= 0xdf_ff && previous >= 0xd8_00 && previous <= 0xdb_ff
  })
  const cutsLiteralOperator = result.literals.some(
    (literal) =>
      literal.markers &&
      literal.suffixFrom > literal.from &&
      from < literal.to &&
      to > literal.suffixFrom &&
      !(from <= literal.from && to >= literal.to),
  )
  if (
    cutsGroup ||
    cutsPair ||
    cutsLiteralOperator ||
    result.escapes.some((escape) => boundaryCuts(escape.from, escape.to))
  ) {
    return { from, message: CUT, to }
  }
  return undefined
}

export function adjustAnimaAttentionFragment(
  source: string,
  direction: -1 | 1,
  adjacentLiteral = false,
): { advisory?: AnimaAttentionAdvisory; text: string } {
  const analysis = analyze(source)
  const advisory = analysis.issues[0]
  if (advisory) {
    return { advisory, text: source }
  }
  const group = analysis.groups.find(
    (candidate) => candidate.from === 0 && candidate.end === source.length,
  )
  const literal = analysis.literals.find(
    (candidate) => candidate.from === 0 && candidate.to === source.length,
  )
  if (group) {
    const body = source.slice(group.bodyFrom, group.bodyTo)
    if (group.operator.kind === 'numeric') {
      const next = stepNumber(group.operator.raw, direction)
      return next === undefined
        ? {
            advisory: {
              from: 0,
              message: 'This numeric Anima attention weight cannot change by a finite 0.1 step.',
              to: source.length,
            },
            text: source,
          }
        : { text: Number(next) === 1 ? neutralBody(body) : `(${body}:${next})` }
    }
    if (adjacentLiteral) {
      return { advisory: { from: 0, message: CUT, to: source.length }, text: source }
    }
    return { text: adjustMarkers(body, group.operator.markers, direction, true) }
  }
  if (literal?.markers && literal.suffixFrom > 0 && !adjacentLiteral) {
    return {
      text: adjustMarkers(source.slice(0, literal.suffixFrom), literal.markers, direction, false),
    }
  }
  const protectedSource = protectLiteralColons(source)
  if (adjacentLiteral) {
    return { text: `(${protectedSource}:${direction > 0 ? '1.1' : '0.9'})` }
  }
  return {
    text:
      literal && literal.suffixFrom > literal.from
        ? `${protectedSource}${direction > 0 ? '+' : '-'}`
        : `(${protectedSource})${direction > 0 ? '+' : '-'}`,
  }
}

/** Authoring analysis only. It never expands prompts or applies the concrete generation limit. */
function analyze(text: string, maxIssues = 1): Analysis {
  const result: Analysis = { escapes: [], groups: [], issues: [], literals: [] }
  const stack: { braceDepth: number; colon: number | null; from: number }[] = []
  const brackets: { char: string; from: number }[] = []
  let braceDepth = 0
  const issue = (from: number, to: number, message: string) => {
    if (result.issues.length < maxIssues) {
      result.issues.push({ from, message, to })
    }
  }
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index)
    if (char === '\\') {
      const to = Math.min(index + 2, text.length)
      result.escapes.push({ from: index, to })
      index = to - 1
      continue
    }
    if ('([{'.includes(char)) {
      brackets.push({ char, from: index })
    } else if (')]}'.includes(char)) {
      const open = brackets.at(-1)
      if (!open || ')]}'.charAt('([{'.indexOf(open.char)) !== char) {
        issue(index, index + 1, 'Anima attention has mismatched brackets.')
      } else {
        brackets.pop()
      }
    }
    if (char === '{') {
      braceDepth += 1
      continue
    }
    if (char === '}') {
      braceDepth -= 1
      if (braceDepth < 0) {
        issue(index, index + 1, 'Anima attention has an unmatched dynamic bracket.')
        braceDepth = 0
      }
      continue
    }
    if (char === '(') {
      stack.push({ braceDepth, colon: null, from: index })
      continue
    }
    if (char === ':' && text.slice(index + 1, index + 3) !== '//') {
      const top = stack.at(-1)
      if (top && top.braceDepth === braceDepth) {
        if (top.colon !== null) {
          issue(index, index + 1, 'Anima attention has an invalid explicit weight.')
        } else {
          top.colon = index
        }
      }
      continue
    }
    if (char === ')') {
      const open = stack.pop()
      if (!open) {
        issue(index, index + 1, 'Anima attention has an unmatched closing parenthesis.')
        continue
      }
      const colon = open.colon
      const bodyTo = colon ?? index
      let operator: MarkerOperator | NumericOperator = { kind: 'markers', markers: '+' }
      if (colon !== null) {
        const raw = text.slice(colon + 1, index).trim()
        if (bodyTo === open.from + 1 || !validNumber(raw)) {
          issue(colon, index, 'Anima attention has an invalid explicit weight.')
        }
        operator = { kind: 'numeric', raw }
      }
      let end = index + 1
      const first = text.charAt(end)
      if (/[+\-\d.]/.test(first) && (first !== '.' || /\d/.test(text.charAt(end + 1)))) {
        while (end < text.length && !/[\s,()[\]{}<>\\]/.test(text.charAt(end))) {
          if (stack.length && text.charAt(end) === ':') {
            break
          }
          if (braceDepth && text.charAt(end) === '|') {
            break
          }
          end += 1
        }
        const raw = text.slice(index + 1, end)
        if (colon !== null) {
          issue(index + 1, end, CONFLICT)
        } else if (/^\++$/.test(raw) || /^-+$/.test(raw)) {
          operator = { kind: 'markers', markers: raw }
        } else if (SUFFIX_NUMBER.test(raw) && validNumber(raw)) {
          operator = { kind: 'numeric', raw }
        } else {
          issue(
            index + 1,
            end,
            /^[+-]+$/.test(raw) ? MIXED : 'Anima attention has an ambiguous suffix.',
          )
        }
      }
      result.groups.push({
        bodyFrom: open.from + 1,
        bodyTo,
        end,
        from: open.from,
        operator,
      })
      index = end - 1
      continue
    }
    if (/\s/.test(char) || ',[]<>|'.includes(char)) {
      continue
    }
    const from = index
    let end = index
    while (end < text.length && !/[\s,()[\]{}<>|:]/.test(text.charAt(end))) {
      if (text.charAt(end) === '\\') {
        const to = Math.min(end + 2, text.length)
        result.escapes.push({ from: end, to })
        end = to
      } else {
        end += 1
      }
    }
    if (end === index) {
      continue
    }
    let suffixFrom = end
    while (suffixFrom > from && /[+-]/.test(text.charAt(suffixFrom - 1))) {
      let slashes = 0
      for (
        let before = suffixFrom - 2;
        before >= from && text.charAt(before) === '\\';
        before -= 1
      ) {
        slashes += 1
      }
      if (slashes % 2) {
        break
      }
      suffixFrom -= 1
    }
    const markers = text.slice(suffixFrom, end)
    if (markers && suffixFrom > from && !/^\++$/.test(markers) && !/^-+$/.test(markers)) {
      issue(suffixFrom, end, MIXED)
    }
    result.literals.push({ from, markers, suffixFrom, to: end })
    index = end - 1
  }
  for (const group of stack) {
    issue(group.from, group.from + 1, 'Anima attention has an unclosed parenthesis.')
  }
  for (const open of brackets) {
    issue(open.from, open.from + 1, 'Anima attention has an unclosed bracket.')
  }
  if (braceDepth) {
    issue(0, text.length, 'Anima attention has an unclosed dynamic bracket.')
  }
  return result
}

function validNumber(raw: string): boolean {
  if (!FINITE_NUMBER.test(raw) || !Number.isFinite(Number(raw))) {
    return false
  }
  return Number(raw) !== 0 || !/[1-9]/.test(raw.split(/e/i, 1)[0] ?? '')
}

/**
 * Exact written decimal step; work is bounded by the written coefficient, not an arbitrary
 * exponent.
 */
function stepNumber(raw: string, direction: -1 | 1): string | undefined {
  if (!validNumber(raw)) {
    return undefined
  }
  const numeric = Number(raw)
  if (!Number.isFinite(numeric + direction * 0.1) || numeric + direction * 0.1 === numeric) {
    return undefined
  }
  const [mantissa = '', exponentText = '0'] = raw.toLowerCase().split('e')
  const negative = mantissa.startsWith('-')
  const unsigned = mantissa.replace(/^[+-]/, '')
  const dot = unsigned.indexOf('.')
  const fractionLength = dot < 0 ? 0 : unsigned.length - dot - 1
  let digits = unsigned.replace('.', '').replace(/^0+/, '')
  // Even 0e999999999999 is zero. Never evaluate that exponent or allocate its powers.
  if (!digits) {
    return direction > 0 ? '0.1' : '-0.1'
  }
  const writtenExponent = Number(exponentText)
  if (!Number.isSafeInteger(writtenExponent) || Math.abs(writtenExponent) > raw.length + 324) {
    return undefined
  }
  let exponent = writtenExponent - fractionLength
  const normalizedDigits = digits.replace(/0+$/, '')
  exponent += digits.length - normalizedDigits.length
  digits = normalizedDigits
  const commonExponent = Math.min(exponent, -1)
  const coefficient = BigInt(`${negative ? '-' : ''}${digits}`)
  const stepped =
    coefficient * 10n ** BigInt(exponent - commonExponent) +
    BigInt(direction) * 10n ** BigInt(-1 - commonExponent)
  const sign = stepped < 0n ? '-' : ''
  const absolute = (stepped < 0n ? -stepped : stepped).toString()
  const point = absolute.length + commonExponent
  let result =
    point > 0
      ? `${absolute.slice(0, point)}.${absolute.slice(point)}`
      : `0.${'0'.repeat(-point)}${absolute}`
  result = result.replace(/0+$/, '').replace(/\.$/, '')
  result = `${sign}${result || '0'}`
  return Number.isFinite(Number(result)) && Number(result) !== Number(raw) ? result : undefined
}

function protectLiteralColons(source: string): string {
  let result = ''
  let depth = 0
  for (let index = 0; index < source.length; index += 1) {
    const char = source.charAt(index)
    if (char === '\\') {
      result += char
      // The compiler preserves a terminal literal backslash. New syntax must not become its escape.
      result += index + 1 < source.length ? source.charAt(++index) : '\\'
      continue
    }
    if (char === '(') {
      depth += 1
    } else if (char === ')') {
      depth -= 1
    }
    result +=
      char === ':' && depth === 0 && source.slice(index + 1, index + 3) !== '//'
        ? String.raw`\:`
        : char
  }
  return result
}

function adjustMarkers(body: string, markers: string, direction: -1 | 1, grouped: boolean): string {
  const opposite = direction > 0 ? '-' : '+'
  const next = markers.endsWith(opposite)
    ? markers.slice(0, -1)
    : `${markers}${direction > 0 ? '+' : '-'}`
  return next ? `${grouped ? `(${body})` : body}${next}` : grouped ? neutralBody(body) : body
}

function neutralBody(body: string): string {
  const analysis = analyze(body)
  const ownsOperator =
    analysis.groups.some((group) => group.from === 0 && group.end === body.length) ||
    analysis.literals.some(
      (literal) => literal.from === 0 && literal.to === body.length && literal.markers,
    )
  // Keep a neutral outer operator when unwrapping would make the next action edit an inner weight.
  return ownsOperator ? `(${body}:1)` : body
}
