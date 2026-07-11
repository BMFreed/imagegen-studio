export interface PromptEditResult {
  selectionEnd: number
  selectionStart: number
  value: string
}

export interface DynamicPromptExpansion {
  error?: string
  truncated: boolean
  values: string[]
}

export function adjustPromptAttention(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  direction: -1 | 1,
): PromptEditResult {
  const explicitSelection = selectionStart !== selectionEnd
  const range =
    selectionStart === selectionEnd
      ? wordRange(value, selectionStart)
      : { end: selectionEnd, start: selectionStart }
  if (range.start === range.end) {
    return { selectionEnd, selectionStart, value }
  }

  const selected = value.slice(range.start, range.end)
  const numeric = selected.match(/^\((.*)\)(-?\d+(?:\.\d+)?)$/s)
  let replacement: string
  if (numeric) {
    const weight = Math.max(0, Number(numeric[2]) + direction * 0.1).toFixed(1)
    replacement = `(${numeric[1]})${weight}`
  } else {
    const opposite = direction > 0 ? '-' : '+'
    const marker = direction > 0 ? '+' : '-'
    if (selected.endsWith(opposite)) {
      replacement = selected.slice(0, -1)
    } else if ((explicitSelection || selected.includes(' ')) && !/^\(.*\)[+-]+$/s.test(selected)) {
      replacement = `(${selected})${marker}`
    } else {
      replacement = `${selected}${marker}`
    }
  }
  const next = `${value.slice(0, range.start)}${replacement}${value.slice(range.end)}`
  return {
    selectionEnd: range.start + replacement.length,
    selectionStart: range.start,
    value: next,
  }
}

export function expandDynamicPrompt(source: string, maxPrompts: number): DynamicPromptExpansion {
  if (/\{[^{}]*\{/.test(source) || /\}[^{}]*\}/.test(source)) {
    return {
      error: 'Nested dynamic prompt groups are not supported.',
      truncated: false,
      values: [],
    }
  }
  const groups = [...source.matchAll(/\{([^{}]+)\}/g)]
  if (source.includes('{') || source.includes('}')) {
    const matched = groups.reduce((total, match) => total + match[0].length, 0)
    const braces = [...source].filter((char) => char === '{' || char === '}').length
    if (matched === 0 || braces !== groups.length * 2) {
      return { error: 'Check unmatched dynamic prompt braces.', truncated: false, values: [] }
    }
  }
  let values = [source]
  for (const group of groups) {
    const alternatives = group[1]!
      .split('|')
      .map((item) => item.trim())
      .filter(Boolean)
    if (alternatives.length < 2) {
      return {
        error: 'A dynamic group needs at least two alternatives.',
        truncated: false,
        values: [],
      }
    }
    const token = group[0]
    values = values.flatMap((value) =>
      alternatives.map((alternative) => value.replace(token, alternative)),
    )
  }
  const truncated = values.length > maxPrompts
  return { truncated, values: values.slice(0, maxPrompts) }
}

export function expandPromptPairs(positive: string, negative: string, maxPrompts: number) {
  const positiveResult = expandDynamicPrompt(positive, maxPrompts)
  const negativeResult = expandDynamicPrompt(negative, maxPrompts)
  const error = positiveResult.error ?? negativeResult.error
  if (error) {
    return { error, pairs: [], truncated: false }
  }
  const pairs = positiveResult.values.flatMap((prompt) =>
    negativeResult.values.map((negativePrompt) => ({ negativePrompt, prompt })),
  )
  return {
    pairs: pairs.slice(0, maxPrompts),
    truncated: positiveResult.truncated || negativeResult.truncated || pairs.length > maxPrompts,
  }
}

function wordRange(value: string, cursor: number) {
  const left = value.slice(0, cursor).search(/[^\s(),{}]+$/)
  const start = left < 0 ? cursor : left
  const right = value.slice(cursor).search(/[\s(),{}]/)
  return { end: right < 0 ? value.length : cursor + right, start }
}
