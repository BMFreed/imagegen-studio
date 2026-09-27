import { suggestLoraTriggers } from '../../../../../src/shared/projects/lora-triggers'

import type { DanbooruTagMock } from './generation-prompt.utils'
import type {
  GenerationEmbeddingResourceRef,
  GenerationLora,
  GenerationPromptPolarity,
} from './generation.types'

import { activePromptLoraSources, normalizePromptSearchValue } from './generation-prompt.utils'

export interface PromptAutocompleteSuggestion {
  detail: string
  embedding?: GenerationEmbeddingResourceRef
  group: 'danbooru' | 'embeddings' | 'loras'
  id: string
  label: string
}

export function getPromptAutocompleteSuggestions(args: {
  danbooruQuery?: string
  danbooruTags: DanbooruTagMock[]
  embeddings: GenerationEmbeddingResourceRef[]
  explicit: boolean
  loraQuery?: string
  loras: GenerationLora[]
  polarity: GenerationPromptPolarity
  query: string
}): PromptAutocompleteSuggestion[] {
  const query = normalizePromptSearchValue(String(args.query ?? '').replace(/^</, ''))
  const danbooruQuery = normalizePromptSearchValue(
    String(args.danbooruQuery ?? args.query ?? '').replace(/^</, ''),
  )
  const browsingLocalResources = args.explicit && query.length === 0

  const loras = suggestLoraTriggers(
    args.loraQuery ?? query,
    activePromptLoraSources(args.loras),
  ).map<PromptAutocompleteSuggestion>((item) => ({
    detail: item.sources.map((source) => source.name).join(', '),
    group: 'loras',
    id: `lora:${item.sources.map((source) => source.id).join('+')}:${item.phrase}`,
    label: item.phrase,
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

  const danbooru = (danbooruQuery.length >= 2 ? args.danbooruTags : [])
    .map((tag) => ({ score: matchScore(danbooruQuery, tag.name, ...tag.aliases), tag }))
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
