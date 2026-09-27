import { findTopLevelPromptPhraseRange, normalizePromptSearchValue } from './prompt-text.js'

/** Context supplied by the owner. The editor does not resolve or change resources. */
export interface LoraTriggerSource {
  id: string
  name: string
  phrases: string[]
  version?: string
}

export interface LoraTriggerGroup {
  phrase: string
  sources: LoraTriggerSource[]
}

export interface LoraTriggerMatch extends LoraTriggerGroup {
  from: number
  to: number
}

export function groupLoraTriggers(sources: LoraTriggerSource[]): LoraTriggerGroup[] {
  const groups = new Map<string, LoraTriggerGroup>()
  for (const source of sources) {
    for (const raw of source.phrases) {
      const phrase = raw.trim()
      const key = normalizePromptSearchValue(phrase)
      if (!key) {
        continue
      }
      const group = groups.get(key) ?? { phrase, sources: [] }
      if (!group.sources.some((item) => item.id === source.id)) {
        group.sources.push(source)
      }
      groups.set(key, group)
    }
  }
  return [...groups.values()]
}

export function suggestLoraTriggers(
  query: string,
  sources: LoraTriggerSource[],
): LoraTriggerGroup[] {
  const normalized = normalizePromptSearchValue(query)
  return groupLoraTriggers(sources)
    .map((group) => ({
      group,
      score: matchScore(normalized, group.phrase, ...group.sources.map((source) => source.name)),
    }))
    .filter((item) => Number.isFinite(item.score))
    .sort((left, right) => left.score - right.score)
    .slice(0, 5)
    .map((item) => item.group)
}

export function matchLoraTriggers(text: string, sources: LoraTriggerSource[]): LoraTriggerMatch[] {
  const candidates = groupLoraTriggers(sources).flatMap((group) => {
    const pattern = group.phrase
      .split(/[\s_]+/)
      .map(escapeRegExp)
      .join(String.raw`[\s_]+`)
    const matches: LoraTriggerMatch[] = []
    for (const match of text.matchAll(new RegExp(pattern, 'giu'))) {
      const from = match.index
      const to = from + match[0].length
      const leftBoundary =
        !/^[\p{L}\p{N}\p{M}_]/u.test(group.phrase) ||
        !/[\p{L}\p{N}\p{M}_]$/u.test(text.slice(0, from))
      const rightBoundary =
        !/[\p{L}\p{N}\p{M}_]$/u.test(group.phrase) || !/^[\p{L}\p{N}\p{M}_]/u.test(text.slice(to))
      if (leftBoundary && rightBoundary) {
        matches.push({ ...group, from, to })
      }
    }
    return matches
  })
  const accepted: LoraTriggerMatch[] = []
  for (const match of candidates.sort(
    (a, b) => b.to - b.from - (a.to - a.from) || a.from - b.from,
  )) {
    if (!accepted.some((range) => match.from < range.to && match.to > range.from)) {
      accepted.push(match)
    }
  }
  return accepted.sort((a, b) => a.from - b.from)
}

/** Longest matching suffix keeps ordinary text before a multi-word search intact. */
export function loraCompletionFragment(
  text: string,
  position: number,
  sources: LoraTriggerSource[],
) {
  const phrase = findTopLevelPromptPhraseRange(text, position)
  const start = Math.min(phrase.from, position)
  const beforeCaret = text.slice(start, position)
  const starts = [
    0,
    ...[...beforeCaret.matchAll(/[\s([{}\]<>]+/g)].map((match) => match.index + match[0].length),
  ]
  for (const offset of starts) {
    const query = beforeCaret.slice(offset)
    if (
      normalizePromptSearchValue(query).length >= 2 &&
      suggestLoraTriggers(query, sources).length
    ) {
      return { from: start + offset, text: query }
    }
  }
  const fallback = beforeCaret.match(/[^\s,\n()[\]{}<>]*$/)?.[0] ?? ''
  return { from: position - fallback.length, text: fallback }
}

function matchScore(query: string, ...values: string[]) {
  const normalized = values.map(normalizePromptSearchValue)
  if (!query || normalized.includes(query)) {
    return 0
  }
  if (normalized.some((value) => value.startsWith(query))) {
    return 1
  }
  return normalized.some((value) => value.includes(query)) ? 2 : Number.POSITIVE_INFINITY
}

function escapeRegExp(value: string) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}
