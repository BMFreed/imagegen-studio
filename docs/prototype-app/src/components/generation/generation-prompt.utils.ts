import type {
  DanbooruTagCategory,
  GenerationEmbeddingResourceRef,
  GenerationLora,
  GenerationPrompt,
  GenerationPromptToken,
  GenerationResourceRef,
} from './generation.types'

export interface DanbooruTagMock {
  aliases: string[]
  category: DanbooruTagCategory
  name: string
  postCount: number
}

let promptTokenSequence = 0

export function createPromptTokenId() {
  promptTokenSequence += 1
  return `prompt-token-${promptTokenSequence}`
}

export function createGenerationPrompt(tokens: GenerationPromptToken[] = []): GenerationPrompt {
  return { tokens: JSON.parse(JSON.stringify(tokens)) as GenerationPromptToken[] }
}

export function serializeGenerationPrompt(prompt: GenerationPrompt | undefined): string {
  return (
    prompt?.tokens
      .map((token) => token.text.trim())
      .filter(Boolean)
      .join(', ') ?? ''
  )
}

export function cloneGenerationPrompt(prompt: GenerationPrompt): GenerationPrompt {
  return JSON.parse(JSON.stringify(prompt)) as GenerationPrompt
}

export function normalizePromptSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase().replaceAll('_', ' ').replaceAll(/\s+/g, ' ')
}

export function splitPromptText(value: string): string[] {
  const parts: string[] = []
  let current = ''
  let escaped = false
  let roundDepth = 0
  let braceDepth = 0
  for (const char of value) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\') {
      current += char
      escaped = true
      continue
    }
    if (char === '(') {
      roundDepth += 1
    }
    if (char === ')') {
      roundDepth = Math.max(0, roundDepth - 1)
    }
    if (char === '{') {
      braceDepth += 1
    }
    if (char === '}') {
      braceDepth = Math.max(0, braceDepth - 1)
    }
    if (char === ',' && roundDepth === 0 && braceDepth === 0) {
      if (current.trim()) {
        parts.push(current.trim())
      }
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim()) {
    parts.push(current.trim())
  }
  return parts
}

export function classifyPromptToken(
  text: string,
  embeddings: GenerationEmbeddingResourceRef[] = [],
  danbooruTags: DanbooruTagMock[] = [],
): GenerationPromptToken {
  const trimmed = text.trim()
  const embedding = embeddings.find(
    (item) => item.activationToken === trimmed || item.negativeToken === trimmed,
  )
  if (embedding) {
    return {
      id: createPromptTokenId(),
      kind: 'embedding',
      resource: structuredClone(embedding),
      text: trimmed,
    }
  }
  if (trimmed.includes('{') || trimmed.includes('}')) {
    return { id: createPromptTokenId(), kind: 'dynamic', text: trimmed }
  }
  const normalized = normalizePromptSearchValue(trimmed)
  const tag = danbooruTags.find((item) => normalizePromptSearchValue(item.name) === normalized)
  if (tag) {
    return {
      aliases: [...tag.aliases],
      canonicalName: tag.name,
      category: tag.category,
      id: createPromptTokenId(),
      kind: 'danbooru',
      postCount: tag.postCount,
      text: tag.name,
    }
  }
  return { id: createPromptTokenId(), kind: 'custom', text: trimmed }
}

export function parseLegacyPromptString(
  value: string,
  embeddings: GenerationEmbeddingResourceRef[] = [],
  danbooruTags: DanbooruTagMock[] = [],
): GenerationPrompt {
  return createGenerationPrompt(
    splitPromptText(value).map((part) => classifyPromptToken(part, embeddings, danbooruTags)),
  )
}

export function getPromptToken(prompt: GenerationPrompt, id: string) {
  return prompt.tokens.find((token) => token.id === id)
}

export function replacePromptToken(
  prompt: GenerationPrompt,
  id: string,
  replacement: GenerationPromptToken,
): GenerationPrompt {
  return { tokens: prompt.tokens.map((token) => (token.id === id ? replacement : token)) }
}

export function removePromptToken(prompt: GenerationPrompt, id: string): GenerationPrompt {
  return { tokens: prompt.tokens.filter((token) => token.id !== id) }
}

export function adjustPromptTokenAttention(
  prompt: GenerationPrompt,
  id: string,
  direction: -1 | 1,
): GenerationPrompt {
  const token = getPromptToken(prompt, id)
  if (!token) {
    return prompt
  }
  const numeric = token.text.match(/^\((.*)\)(-?\d+(?:\.\d+)?)$/s)
  let text: string
  if (numeric) {
    text = `(${numeric[1]})${Math.max(0, Number(numeric[2]) + direction * 0.1).toFixed(1)}`
  } else {
    const marker = direction > 0 ? '+' : '-'
    const opposite = direction > 0 ? '-' : '+'
    const suffix = token.text.match(/[+-]+$/)?.[0] ?? ''
    const baseText = suffix ? token.text.slice(0, -suffix.length) : token.text
    const wrappedBase = /^\(.*\)$/s.test(baseText) ? baseText : `(${baseText})`
    const nextSuffix = suffix.endsWith(opposite) ? suffix.slice(0, -1) : `${suffix}${marker}`
    const neutralBase = /^\(.*\)$/s.test(baseText) ? baseText.slice(1, -1) : baseText
    text = nextSuffix
      ? `${baseText.includes(' ') ? wrappedBase : baseText}${nextSuffix}`
      : neutralBase
  }
  return replacePromptToken(prompt, id, { ...token, text })
}

export function promptHasMissingEmbedding(prompt: GenerationPrompt | undefined): boolean {
  return (
    prompt?.tokens.some((token) => token.kind === 'embedding' && token.resource.missing) ?? false
  )
}

export function getPromptEmbeddingRefs(
  prompt: GenerationPrompt | undefined,
): GenerationResourceRef[] {
  return (
    prompt?.tokens.filter((token) => token.kind === 'embedding').map((token) => token.resource) ??
    []
  )
}

export function findOrphanedLoraTriggers(
  prompts: (GenerationPrompt | undefined)[],
  nextLoras: GenerationLora[],
) {
  const activeIds = new Set(
    nextLoras
      .filter((lora) => lora.enabled && !lora.resource.missing)
      .map((lora) => lora.resource.id),
  )
  return prompts.flatMap(
    (prompt) =>
      prompt?.tokens.filter(
        (token) =>
          token.kind === 'lora-trigger' && !token.sourceLoraIds.some((id) => activeIds.has(id)),
      ) ?? [],
  )
}

export function detachLoraTriggerSources(
  prompt: GenerationPrompt,
  loraIds: string[],
): GenerationPrompt {
  const detachedIds = new Set(loraIds)
  return {
    tokens: prompt.tokens.map((token) =>
      token.kind === 'lora-trigger'
        ? {
            ...token,
            sourceLoraIds: token.sourceLoraIds.filter((id) => !detachedIds.has(id)),
          }
        : token,
    ),
  }
}

export function removeOrphanedLoraTriggers(
  prompt: GenerationPrompt,
  loraIds: string[],
): GenerationPrompt {
  return {
    tokens: detachLoraTriggerSources(prompt, loraIds).tokens.filter(
      (token) => token.kind !== 'lora-trigger' || token.sourceLoraIds.length > 0,
    ),
  }
}

export function reconcileLoraTriggerSources(
  prompt: GenerationPrompt | undefined,
  nextLoras: GenerationLora[],
  resolution: 'keep' | 'remove',
): GenerationPrompt | undefined {
  if (!prompt) {
    return undefined
  }
  const activeIds = new Set(
    nextLoras
      .filter((lora) => lora.enabled && !lora.resource.missing)
      .map((lora) => lora.resource.id),
  )
  const tokens: GenerationPromptToken[] = []
  for (const token of prompt.tokens) {
    if (token.kind !== 'lora-trigger') {
      tokens.push(token)
      continue
    }
    const sourceLoraIds = token.sourceLoraIds.filter((id) => activeIds.has(id))
    if (sourceLoraIds.length) {
      tokens.push({ ...token, sourceLoraIds })
    } else if (resolution === 'keep') {
      tokens.push({ id: token.id, kind: 'custom', text: token.text })
    }
  }
  return { tokens }
}
