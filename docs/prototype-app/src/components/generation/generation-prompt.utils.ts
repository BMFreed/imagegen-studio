import {
  type LoraTriggerSource,
  matchLoraTriggers,
} from '../../../../../src/shared/projects/lora-triggers'
import { findTopLevelPromptPhraseRange } from '../../../../../src/shared/projects/prompt-text'

import type {
  DanbooruTagCategory,
  GenerationEmbeddingResourceRef,
  GenerationLora,
  GenerationPrompt,
  GenerationPromptEmbeddingRef,
  GenerationPromptSelection,
} from './generation.types'

export {
  findTopLevelPromptPhraseRange,
  normalizePromptSearchValue,
  splitTopLevelPromptPhrases,
} from '../../../../../src/shared/projects/prompt-text'

export interface DanbooruTagMock {
  aliases: string[]
  category: DanbooruTagCategory
  name: string
  postCount: number
}

export interface PromptPhraseRange {
  from: number
  to: number
}

export interface PromptAttentionResult {
  selection: GenerationPromptSelection
  text: string
}

export interface PromptEmbeddingMatch extends PromptPhraseRange {
  ambiguous: boolean
  ref?: GenerationPromptEmbeddingRef
  resources: GenerationEmbeddingResourceRef[]
  token: string
}

export interface PromptLoraTriggerMatch extends PromptPhraseRange {
  loras: GenerationLora[]
  phrase: string
}

export function createGenerationPrompt(
  text = '',
  embeddingRefs: GenerationPromptEmbeddingRef[] = [],
): GenerationPrompt {
  return { embeddingRefs: cloneJson(embeddingRefs), text }
}

export function cloneGenerationPrompt(prompt: GenerationPrompt): GenerationPrompt {
  return cloneJson(prompt)
}

export function serializeGenerationPrompt(prompt: GenerationPrompt | undefined): string {
  return prompt?.text ?? ''
}

/**
 * Temporary bridge used by prototype mock factories while production storage migration is out of
 * scope.
 */
export function parseLegacyPromptString(
  value: string,
  resources: GenerationEmbeddingResourceRef[] = [],
  _danbooruTags: DanbooruTagMock[] = [],
): GenerationPrompt {
  return reconcilePromptEmbeddingRefs(createGenerationPrompt(value), resources)
}

export function adjustPromptAttention(
  text: string,
  selection: GenerationPromptSelection,
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

export function reconcilePromptEmbeddingRefs(
  prompt: GenerationPrompt,
  resources: GenerationEmbeddingResourceRef[],
): GenerationPrompt {
  const installedByToken = resourceTokens(resources)
  const retained = dedupeRefs(prompt.embeddingRefs).filter(
    (ref) => literalTokenMatches(prompt.text, ref.token).length,
  )
  const retainedTokens = new Set(retained.map((ref) => ref.token))
  const added: GenerationPromptEmbeddingRef[] = []

  for (const [token, tokenResources] of installedByToken) {
    if (
      retainedTokens.has(token) ||
      tokenResources.length !== 1 ||
      literalTokenMatches(prompt.text, token).length === 0
    ) {
      continue
    }
    added.push({ resource: structuredClone(tokenResources[0]!), token })
  }

  const embeddingRefs = [...retained, ...added].sort((left, right) => {
    const position =
      firstTokenPosition(prompt.text, left.token) - firstTokenPosition(prompt.text, right.token)
    return position || left.resource.id.localeCompare(right.resource.id)
  })
  return { embeddingRefs, text: prompt.text }
}

export function getPromptEmbeddingMatches(
  prompt: GenerationPrompt,
  resources: GenerationEmbeddingResourceRef[],
): PromptEmbeddingMatch[] {
  const installedByToken = resourceTokens(resources)
  const storedByToken = new Map<string, GenerationPromptEmbeddingRef[]>()
  for (const ref of dedupeRefs(prompt.embeddingRefs)) {
    storedByToken.set(ref.token, [...(storedByToken.get(ref.token) ?? []), ref])
  }
  const tokens = new Set([...installedByToken.keys(), ...storedByToken.keys()])
  const candidates = [...tokens]
    .sort((left, right) => right.length - left.length || left.localeCompare(right))
    .flatMap((token) => {
      const stored = storedByToken.get(token) ?? []
      const installed = installedByToken.get(token) ?? []
      const resourcesForToken = stored.length ? stored.map((ref) => ref.resource) : installed
      const ambiguous = stored.length === 0 && installed.length > 1
      return literalTokenMatches(prompt.text, token).map(({ from, to }) => ({
        ambiguous,
        from,
        ref: stored[0],
        resources: resourcesForToken,
        to,
        token,
      }))
    })
  return discardOverlappingMatches(candidates)
}

export function activePromptLoraSources(loras: GenerationLora[]): LoraTriggerSource[] {
  return loras
    .filter((lora) => lora.enabled && !lora.resource.missing)
    .map((lora) => ({
      id: lora.resource.id,
      name: lora.resource.name,
      phrases: lora.resource.triggerPhrases,
      version: lora.resource.version,
    }))
}

export function getPromptLoraTriggerMatches(
  text: string,
  loras: GenerationLora[],
): PromptLoraTriggerMatch[] {
  return matchLoraTriggers(text, activePromptLoraSources(loras)).map((match) => ({
    from: match.from,
    loras: match.sources.map((source) => loras.find((lora) => lora.resource.id === source.id)!),
    phrase: match.phrase,
    to: match.to,
  }))
}

export function getPromptEmbeddingRefs(
  prompt: GenerationPrompt | undefined,
): GenerationEmbeddingResourceRef[] {
  return prompt?.embeddingRefs.map((ref) => ref.resource) ?? []
}

export function promptHasMissingEmbedding(prompt: GenerationPrompt | undefined): boolean {
  return prompt?.embeddingRefs.some((ref) => ref.resource.missing) ?? false
}

export function promptHasAmbiguousEmbedding(
  prompt: GenerationPrompt | undefined,
  resources: GenerationEmbeddingResourceRef[],
): boolean {
  return prompt
    ? getPromptEmbeddingMatches(prompt, resources).some((match) => match.ambiguous)
    : false
}

export function countPromptTokens(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

function adjustAttentionFragment(source: string, direction: -1 | 1): string {
  const numeric = source.match(/^\((.*)\)(-?\d+(?:\.\d+)?)$/s)
  if (numeric) {
    const next = Math.round((Number(numeric[2]) + direction * 0.1) * 10) / 10
    return Math.abs(next - 1) < 0.001 ? numeric[1]! : `(${numeric[1]})${next.toFixed(1)}`
  }

  const suffix = source.match(/[+-]+$/)?.[0] ?? ''
  const base = suffix ? source.slice(0, -suffix.length) : source
  const marker = direction > 0 ? '+' : '-'
  const opposite = direction > 0 ? '-' : '+'
  const nextSuffix = suffix.endsWith(opposite) ? suffix.slice(0, -1) : `${suffix}${marker}`
  const helperWrapped = /^\([^()]*[\s\n][^()]*\)$/.test(base)
  if (!nextSuffix) {
    return helperWrapped ? base.slice(1, -1) : base
  }
  const adjustedBase = /\s/.test(base) && !helperWrapped ? `(${base})` : base
  return `${adjustedBase}${nextSuffix}`
}

function resourceTokens(resources: GenerationEmbeddingResourceRef[]) {
  const byToken = new Map<string, GenerationEmbeddingResourceRef[]>()
  for (const resource of resources.filter((item) => !item.missing)) {
    for (const token of new Set(
      [resource.activationToken, resource.negativeToken].filter(Boolean),
    )) {
      const value = token!
      byToken.set(value, [...(byToken.get(value) ?? []), resource])
    }
  }
  return byToken
}

function dedupeRefs(refs: GenerationPromptEmbeddingRef[]) {
  const seen = new Set<string>()
  return refs.filter((ref) => {
    const key = `${ref.resource.id}\0${ref.token}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function firstTokenPosition(text: string, token: string) {
  return literalTokenMatches(text, token)[0]?.from ?? Number.MAX_SAFE_INTEGER
}

function literalTokenMatches(text: string, token: string): PromptPhraseRange[] {
  if (!token) {
    return []
  }
  const matches: PromptPhraseRange[] = []
  let from = 0
  while (from <= text.length - token.length) {
    const index = text.indexOf(token, from)
    if (index < 0) {
      break
    }
    const end = index + token.length
    const leftBoundary = !/^\w/u.test(token) || index === 0 || !/\w/u.test(text[index - 1]!)
    const rightBoundary = !/\w$/u.test(token) || end === text.length || !/\w/u.test(text[end]!)
    if (leftBoundary && rightBoundary) {
      matches.push({ from: index, to: end })
    }
    from = index + Math.max(1, token.length)
  }
  return matches
}

function discardOverlappingMatches<T extends PromptPhraseRange>(matches: T[]): T[] {
  const accepted: T[] = []
  for (const match of matches.sort((left, right) => left.from - right.from || right.to - left.to)) {
    if (!accepted.some((item) => match.from < item.to && match.to > item.from)) {
      accepted.push(match)
    }
  }
  return accepted.sort((left, right) => left.from - right.from)
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
