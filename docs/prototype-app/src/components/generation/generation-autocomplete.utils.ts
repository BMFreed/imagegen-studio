import type { DanbooruTagMock } from './generation-prompt.utils'
import type {
  GenerationEmbeddingResourceRef,
  GenerationLora,
  GenerationPromptPolarity,
  GenerationPromptToken,
} from './generation.types'

import { createPromptTokenId, normalizePromptSearchValue } from './generation-prompt.utils'

export interface PromptAutocompleteSuggestion {
  detail: string
  group: 'danbooru' | 'embeddings' | 'loras'
  id: string
  label: string
  token: GenerationPromptToken
}

export function getPromptAutocompleteSuggestions(args: {
  danbooruTags: DanbooruTagMock[]
  embeddings: GenerationEmbeddingResourceRef[]
  loras: GenerationLora[]
  polarity: GenerationPromptPolarity
  query: string
}): PromptAutocompleteSuggestion[] {
  const query = normalizePromptSearchValue(String(args.query ?? '').replace(/^</, ''))
  const browsingLocalResources = query.length === 0

  const triggerMap = new Map<string, { names: string[]; sourceIds: string[]; text: string }>()
  for (const lora of args.loras.filter((item) => item.enabled && !item.resource.missing)) {
    for (const phrase of lora.resource.triggerPhrases) {
      if (
        !browsingLocalResources &&
        !Number.isFinite(matchScore(query, phrase, lora.resource.name))
      ) {
        continue
      }
      const key = normalizePromptSearchValue(phrase)
      const current = triggerMap.get(key) ?? { names: [], sourceIds: [], text: phrase }
      current.names.push(lora.resource.name)
      current.sourceIds.push(lora.resource.id)
      triggerMap.set(key, current)
    }
  }
  const loras = [...triggerMap.values()]
    .sort((left, right) => matchScore(query, left.text) - matchScore(query, right.text))
    .slice(0, 5)
    .map<PromptAutocompleteSuggestion>((item) => ({
      detail: item.names.join(', '),
      group: 'loras',
      id: `lora:${item.sourceIds.join('+')}:${item.text}`,
      label: item.text,
      token: {
        id: createPromptTokenId(),
        kind: 'lora-trigger',
        sourceLoraIds: item.sourceIds,
        text: item.text,
      },
    }))

  const embeddings = args.embeddings
    .filter((item) => !item.missing)
    .map((resource) => ({
      resource,
      score:
        (browsingLocalResources
          ? 0
          : matchScore(
              query,
              resource.name,
              resource.activationToken,
              resource.negativeToken ?? '',
            )) +
        (args.polarity === 'negative' && resource.suggestedPolarity === 'negative' ? -0.25 : 0),
    }))
    .filter((item) => Number.isFinite(item.score))
    .sort((left, right) => left.score - right.score)
    .slice(0, 5)
    .map<PromptAutocompleteSuggestion>(({ resource }) => ({
      detail: resource.name,
      group: 'embeddings',
      id: `embedding:${resource.id}`,
      label:
        args.polarity === 'negative' && resource.negativeToken
          ? resource.negativeToken
          : resource.activationToken,
      token: {
        id: createPromptTokenId(),
        kind: 'embedding',
        resource: structuredClone(resource),
        text:
          args.polarity === 'negative' && resource.negativeToken
            ? resource.negativeToken
            : resource.activationToken,
      },
    }))

  const danbooru = (query.length >= 2 ? args.danbooruTags : [])
    .map((tag) => ({ score: matchScore(query, tag.name, ...tag.aliases), tag }))
    .filter((item) => Number.isFinite(item.score))
    .sort((left, right) => left.score - right.score || right.tag.postCount - left.tag.postCount)
    .slice(0, 5)
    .map<PromptAutocompleteSuggestion>(({ tag }) => ({
      detail: `${tag.category} · ${tag.postCount.toLocaleString()} posts`,
      group: 'danbooru',
      id: `danbooru:${tag.name}`,
      label: tag.name,
      token: {
        aliases: [...tag.aliases],
        canonicalName: tag.name,
        category: tag.category,
        id: createPromptTokenId(),
        kind: 'danbooru',
        postCount: tag.postCount,
        text: tag.name,
      },
    }))

  return [...loras, ...embeddings, ...danbooru].slice(0, 12)
}

function matchScore(query: string, ...values: string[]) {
  const normalized = values.map(normalizePromptSearchValue)
  if (normalized.includes(query)) {
    return 0
  }
  if (normalized.some((value) => value.startsWith(query))) {
    return 1
  }
  if (normalized.some((value) => value.includes(query))) {
    return 2
  }
  return Number.POSITIVE_INFINITY
}
