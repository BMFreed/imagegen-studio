export interface PromptPhraseRange {
  from: number
  to: number
}

export interface PromptSelection {
  anchor: number
  head: number
}

export interface PromptAttentionResult {
  selection: PromptSelection
  text: string
}

export function normalizePromptSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase().replaceAll('_', ' ').replaceAll(/\s+/g, ' ')
}

export function splitTopLevelPromptPhrases(text: string): PromptPhraseRange[] {
  return rawPromptPhraseRanges(text).map((range) => trimRange(text, range))
}

export function findTopLevelPromptPhraseRange(text: string, position: number): PromptPhraseRange {
  const clamped = Math.max(0, Math.min(text.length, position))
  const ranges = rawPromptPhraseRanges(text)
  const containing = ranges.find((range) => clamped >= range.from && clamped <= range.to)
  if (containing) {
    return trimRange(text, containing)
  }
  return (
    ranges.find((range) => clamped < range.from) ?? ranges.at(-1) ?? { from: clamped, to: clamped }
  )
}

export function adjustPromptAttention(
  text: string,
  selection: PromptSelection,
  direction: -1 | 1,
): PromptAttentionResult {
  const selectionFrom = Math.min(selection.anchor, selection.head)
  const selectionTo = Math.max(selection.anchor, selection.head)
  const target =
    selectionFrom === selectionTo
      ? findTopLevelPromptPhraseRange(text, selection.head)
      : { from: selectionFrom, to: selectionTo }
  if (target.from === target.to || !text.slice(target.from, target.to).trim()) {
    return { selection, text }
  }

  const source = text.slice(target.from, target.to)
  const replacement = adjustAttentionFragment(source, direction)
  const nextText = text.slice(0, target.from) + replacement + text.slice(target.to)
  const forward = selection.anchor <= selection.head
  const nextSelection = forward
    ? { anchor: target.from, head: target.from + replacement.length }
    : { anchor: target.from + replacement.length, head: target.from }
  return { selection: nextSelection, text: nextText }
}

function rawPromptPhraseRanges(text: string): PromptPhraseRange[] {
  const ranges: PromptPhraseRange[] = []
  let start = 0
  let escaped = false
  let roundDepth = 0
  let squareDepth = 0
  let braceDepth = 0

  const push = (end: number) => {
    ranges.push({ from: start, to: end })
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    switch (char) {
      case '(': {
        roundDepth += 1
        break
      }
      case ')': {
        roundDepth = Math.max(0, roundDepth - 1)
        break
      }
      case '[': {
        squareDepth += 1
        break
      }
      case ']': {
        squareDepth = Math.max(0, squareDepth - 1)
        break
      }
      case '{': {
        braceDepth += 1
        break
      }
      case '}': {
        braceDepth = Math.max(0, braceDepth - 1)
        break
      }
      // No default
    }

    if (
      (char === ',' || char === '\n') &&
      roundDepth === 0 &&
      squareDepth === 0 &&
      braceDepth === 0
    ) {
      push(index)
      start = index + 1
    }
  }
  push(text.length)
  return ranges
}

function trimRange(text: string, range: PromptPhraseRange): PromptPhraseRange {
  let { from, to } = range
  while (from < to && /\s/.test(text.charAt(from))) {
    from += 1
  }
  while (to > from && /\s/.test(text.charAt(to - 1))) {
    to -= 1
  }
  return { from, to }
}

function adjustAttentionFragment(source: string, direction: -1 | 1): string {
  const numeric = source.match(/^\((.*)\)(-?\d+(?:\.\d+)?)$/s)
  if (numeric) {
    const next = Math.round((Number(numeric[2]) + direction * 0.1) * 10) / 10
    return Math.abs(next - 1) < 0.001 ? (numeric[1] ?? '') : `(${numeric[1]})${next.toFixed(1)}`
  }

  const suffix = source.match(/[+-]+$/)?.[0] ?? ''
  const base = suffix ? source.slice(0, -suffix.length) : source
  const marker = direction > 0 ? '+' : '-'
  const opposite = direction > 0 ? '-' : '+'
  const nextSuffix = suffix.endsWith(opposite) ? suffix.slice(0, -1) : `${suffix}${marker}`
  const helperWrapped = /\s/.test(base) && hasOuterGroup(base)
  if (!nextSuffix) {
    return helperWrapped ? base.slice(1, -1) : base
  }
  const adjustedBase = /\s/.test(base) && !helperWrapped ? `(${base})` : base
  return `${adjustedBase}${nextSuffix}`
}

function hasOuterGroup(text: string): boolean {
  if (!text.startsWith('(') || !text.endsWith(')')) {
    return false
  }
  let depth = 0
  let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (escaped) {
      escaped = false
      continue
    }
    switch (char) {
      case '(': {
        depth += 1

        break
      }
      case ')': {
        depth -= 1
        if (depth === 0 && index !== text.length - 1) {
          return false
        }

        break
      }
      case '\\': {
        escaped = true

        break
      }
      // No default
    }
  }
  return depth === 0
}
