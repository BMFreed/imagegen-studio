export interface PromptPhraseRange {
  from: number
  to: number
}

export function normalizePromptSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase().replaceAll('_', ' ').replaceAll(/\s+/g, ' ')
}

export function splitTopLevelPromptPhrases(text: string): PromptPhraseRange[] {
  const ranges: PromptPhraseRange[] = []
  let start = 0
  let escaped = false
  let roundDepth = 0
  let squareDepth = 0
  let braceDepth = 0

  const push = (end: number) => {
    let from = start
    let to = end
    while (from < to && /\s/.test(text.charAt(from))) {
      from += 1
    }
    while (to > from && /\s/.test(text.charAt(to - 1))) {
      to -= 1
    }
    ranges.push({ from, to })
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
        {
          braceDepth = Math.max(0, braceDepth - 1)
          // No default
        }
        break
      }
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

export function findTopLevelPromptPhraseRange(text: string, position: number): PromptPhraseRange {
  const clamped = Math.max(0, Math.min(text.length, position))
  const ranges = splitTopLevelPromptPhrases(text)
  const containing = ranges.find((range) => clamped >= range.from && clamped <= range.to)
  if (containing) {
    return containing
  }
  return (
    ranges.find((range) => clamped < range.from) ?? ranges.at(-1) ?? { from: clamped, to: clamped }
  )
}
