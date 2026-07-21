import type { DanbooruTagMock } from './generation-prompt.utils'
import type {
  GenerationEmbeddingResourceRef,
  GenerationLora,
  GenerationPromptPolarity,
} from './generation.types'

import { normalizePromptSearchValue } from './generation-prompt.utils'

export interface PromptAutocompleteSuggestion {
  detail: string
  embedding?: GenerationEmbeddingResourceRef
  group: 'danbooru' | 'embeddings' | 'loras'
  id: string
  label: string
}

export function getPromptAutocompleteSuggestions(args: {
  danbooruTags: DanbooruTagMock[]
  embeddings: GenerationEmbeddingResourceRef[]
  explicit: boolean
  loras: GenerationLora[]
  polarity: GenerationPromptPolarity
  query: string
}): PromptAutocompleteSuggestion[] {
  const query = normalizePromptSearchValue(String(args.query ?? '').replace(/^</, ''))
  const browsingLocalResources = args.explicit && query.length === 0

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
    }))

  const embeddings = args.embeddings
    .filter((item) => !item.missing)
    .map((embedding) => ({
      embedding,
      score:
        (browsingLocalResources
          ? 0
          : matchScore(
              query,
              embedding.name,
              embedding.activationToken,
              embedding.negativeToken ?? '',
            )) +
        (args.polarity === 'negative' && embedding.suggestedPolarity === 'negative' ? -0.25 : 0),
    }))
    .filter((item) => Number.isFinite(item.score))
    .sort(
      (left, right) =>
        left.score - right.score || left.embedding.name.localeCompare(right.embedding.name),
    )
    .slice(0, 5)
    .map<PromptAutocompleteSuggestion>(({ embedding }) => ({
      detail: embedding.name,
      embedding,
      group: 'embeddings',
      id: `embedding:${embedding.id}`,
      label:
        args.polarity === 'negative' && embedding.negativeToken
          ? embedding.negativeToken
          : embedding.activationToken,
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
    }))

  return [...loras, ...embeddings, ...danbooru].slice(0, 12)
}

function matchScore(query: string, ...values: string[]) {
  if (!query) {
    return 0
  }
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
