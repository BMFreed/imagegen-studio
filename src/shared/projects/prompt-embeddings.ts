import type { ModelCatalogItem, ModelFileStatus } from '../api.js'
import type { IgsProjectDocumentV1 } from './project-schema.js'

export type GenerationPrompt = IgsProjectDocumentV1['generationDraft']['positivePrompt']
export type PromptEmbeddingRef = GenerationPrompt['embeddingRefs'][number]
export interface PromptEmbeddingSelection {
  resourceId: string
  token: string
  versionId: string
}
export interface PromptEmbeddingSource {
  fileStatus: ModelFileStatus
  resource: PromptEmbeddingRef['resource']
  searchTerms: string[]
  token: string
}
export interface PromptEmbeddingMatch {
  candidates: PromptEmbeddingSource[]
  from: number
  ref?: PromptEmbeddingRef
  status:
    | 'ambiguous'
    | 'checking'
    | 'corrupt'
    | 'missing'
    | 'ready'
    | 'unbound'
    | 'unlinked'
    | 'unsupported'
  to: number
  token: string
}

/** Stable app-defined literal; neither a mutable display name nor inferred polarity metadata. */
export function embeddingActivationToken(fileName: string): string | null {
  if (!/\.safetensors$/i.test(fileName) || /[<>\x00-\x1F\x7F/\\]/u.test(fileName)) {
    return null
  }
  const stem = fileName.slice(0, -'.safetensors'.length)
  return stem.trim() ? `<${stem}>` : null
}

export function embeddingSourcesFromCatalog(catalog: ModelCatalogItem[]): PromptEmbeddingSource[] {
  return catalog.flatMap((item) => {
    if (item.resourceType !== 'embedding') {
      return []
    }
    return item.versions.flatMap((version) => {
      // A recalled custom alias can still bind to a verified file with no usable new canonical token.
      const token = embeddingActivationToken(version.fileName) ?? ''
      return [
        {
          fileStatus: version.fileStatus,
          resource: {
            baseModelFamily: version.baseModelFamily,
            civitaiFileId: version.civitaiFileId,
            civitaiModelId: item.modelId,
            civitaiVersionId: version.civitaiVersionId,
            displayName: item.name,
            fileSha256: version.sha256,
            kind: 'embedding' as const,
            localModelId: item.id,
            localVersionId: version.id,
            predictionType: version.predictionType,
            versionName: version.name,
          },
          searchTerms: [item.name, version.name, ...version.trainedWords],
          token,
        },
      ]
    })
  })
}

export function selectablePromptEmbeddingSources(
  sources: PromptEmbeddingSource[],
  modelFamily: string | null,
): PromptEmbeddingSource[] {
  return sources.filter(
    (source) =>
      source.fileStatus === 'ready' &&
      source.token.length > 0 &&
      source.resource.baseModelFamily === 'illustrious' &&
      source.resource.predictionType === null &&
      (modelFamily === null || modelFamily === 'illustrious'),
  )
}

export function promptEmbeddingLiteralRanges(
  text: string,
  token: string,
): { from: number; to: number }[] {
  if (!token) {
    return []
  }
  const ranges: { from: number; to: number }[] = []
  let cursor = 0
  while (cursor <= text.length - token.length) {
    const from = text.indexOf(token, cursor)
    if (from < 0) {
      break
    }
    const to = from + token.length
    if (
      (!/^\w/u.test(token) || from === 0 || !/\w/u.test(text.charAt(from - 1))) &&
      (!/\w$/u.test(token) || to === text.length || !/\w/u.test(text.charAt(to)))
    ) {
      ranges.push({ from, to })
    }
    cursor = to
  }
  return ranges
}

export function sameExactPromptEmbedding(
  a: PromptEmbeddingRef['resource'],
  b: PromptEmbeddingRef['resource'],
): boolean {
  return (
    a.kind === 'embedding' &&
    b.kind === 'embedding' &&
    a.localModelId === b.localModelId &&
    a.localVersionId === b.localVersionId &&
    a.civitaiModelId === b.civitaiModelId &&
    a.civitaiVersionId === b.civitaiVersionId &&
    a.civitaiFileId === b.civitaiFileId &&
    a.fileSha256 === b.fileSha256 &&
    a.baseModelFamily === b.baseModelFamily &&
    a.predictionType === b.predictionType
  )
}

/** Concrete inference/provenance subset, without catalog guessing or changes to authored refs. */
export function activePromptEmbeddingRefs(
  text: string,
  refs: PromptEmbeddingRef[],
): PromptEmbeddingRef[] {
  const tokens = [...new Set(refs.map((ref) => ref.token))]
  const candidates = tokens.flatMap((token) =>
    promptEmbeddingLiteralRanges(text, token).map((range) => ({ ...range, token })),
  )
  candidates.sort((a, b) => b.to - b.from - (a.to - a.from) || a.from - b.from)
  const selected: typeof candidates = []
  for (const range of candidates) {
    if (!selected.some((other) => range.from < other.to && range.to > other.from)) {
      selected.push(range)
    }
  }
  const first = new Map<string, number>()
  for (const range of selected) {
    first.set(range.token, Math.min(first.get(range.token) ?? Infinity, range.from))
  }
  const active: PromptEmbeddingRef[] = []
  for (const ref of refs) {
    if (
      first.has(ref.token) &&
      !active.some(
        (item) => item.token === ref.token && sameExactPromptEmbedding(item.resource, ref.resource),
      )
    ) {
      active.push(ref)
    }
  }
  active.sort(
    (a, b) =>
      first.get(a.token)! - first.get(b.token)! ||
      a.resource.localModelId.localeCompare(b.resource.localModelId) ||
      a.resource.localVersionId.localeCompare(b.resource.localVersionId),
  )
  return structuredClone(active)
}

/** Pure trusted-ref reconciliation. Production callers must verify every newly linked source. */
export function reconcilePromptEmbeddings(
  prompt: GenerationPrompt,
  sources: PromptEmbeddingSource[],
  selected?: PromptEmbeddingRef,
): GenerationPrompt {
  let refs = prompt.embeddingRefs.filter(
    (ref) => promptEmbeddingLiteralRanges(prompt.text, ref.token).length,
  )
  if (selected && promptEmbeddingLiteralRanges(prompt.text, selected.token).length) {
    const retained = refs.find(
      (ref) =>
        ref.token === selected.token && sameExactPromptEmbedding(ref.resource, selected.resource),
    )
    refs = refs.filter((ref) => ref.token !== selected.token)
    refs.push(retained ?? selected)
  }
  const byToken = new Map<string, PromptEmbeddingSource[]>()
  for (const source of sources) {
    const matches = byToken.get(source.token) ?? []
    if (
      !matches.some((candidate) => sameExactPromptEmbedding(candidate.resource, source.resource))
    ) {
      matches.push(source)
    }
    byToken.set(source.token, matches)
  }
  for (const [token, candidates] of byToken) {
    const candidate = candidates[0]
    if (
      !refs.some((ref) => ref.token === token) &&
      candidates.length === 1 &&
      candidate &&
      promptEmbeddingLiteralRanges(prompt.text, token).length
    ) {
      refs.push({ resource: candidate.resource, token })
    }
  }
  const unique: PromptEmbeddingRef[] = []
  for (const ref of refs) {
    if (
      !unique.some(
        (entry) =>
          entry.token === ref.token && sameExactPromptEmbedding(entry.resource, ref.resource),
      )
    ) {
      unique.push(structuredClone(ref))
    }
  }
  unique.sort((a, b) => {
    const position =
      (promptEmbeddingLiteralRanges(prompt.text, a.token)[0]?.from ?? Number.MAX_SAFE_INTEGER) -
      (promptEmbeddingLiteralRanges(prompt.text, b.token)[0]?.from ?? Number.MAX_SAFE_INTEGER)
    return (
      position ||
      a.resource.localModelId.localeCompare(b.resource.localModelId) ||
      a.resource.localVersionId.localeCompare(b.resource.localVersionId)
    )
  })
  return { embeddingRefs: unique, text: prompt.text }
}

export function getPromptEmbeddingMatches(
  prompt: GenerationPrompt,
  sources: PromptEmbeddingSource[],
  catalogReady = true,
  modelFamily: string | null = null,
  includeOverlapping = false,
): PromptEmbeddingMatch[] {
  const tokens = new Set([
    ...sources.map((source) => source.token),
    ...prompt.embeddingRefs.map((ref) => ref.token),
  ])
  const matches: PromptEmbeddingMatch[] = []
  for (const token of tokens) {
    const refs = prompt.embeddingRefs.filter((ref) => ref.token === token)
    const candidates = sources.filter((source) => source.token === token)
    const applicable = candidates.filter(
      (source) =>
        source.resource.baseModelFamily === 'illustrious' &&
        source.resource.predictionType === null &&
        (modelFamily === null || modelFamily === 'illustrious'),
    )
    const ref = refs.length === 1 ? refs[0] : undefined
    let status: PromptEmbeddingMatch['status']
    if (!catalogReady) {
      status = 'checking'
    } else if (refs.length > 1) {
      status = 'ambiguous'
    } else if (ref) {
      const bound = sources.find((source) =>
        sameExactPromptEmbedding(ref.resource, source.resource),
      )
      if (
        ref.resource.baseModelFamily !== 'illustrious' ||
        ref.resource.predictionType !== null ||
        (modelFamily !== null && modelFamily !== 'illustrious')
      ) {
        status = 'unsupported'
      } else if (bound) {
        status = bound.fileStatus
      } else {
        const portable = sources.some(
          (source) =>
            source.resource.civitaiModelId !== null &&
            source.resource.civitaiModelId === ref.resource.civitaiModelId &&
            source.resource.civitaiVersionId === ref.resource.civitaiVersionId &&
            source.resource.civitaiFileId === ref.resource.civitaiFileId &&
            source.resource.fileSha256 === ref.resource.fileSha256 &&
            source.resource.baseModelFamily === ref.resource.baseModelFamily,
        )
        status = portable ? 'unlinked' : 'missing'
      }
    } else if (candidates.length && !applicable.length) {
      status = 'unsupported'
    } else if (applicable.length > 1) {
      status = 'ambiguous'
    } else if (applicable.length === 1 && applicable[0]) {
      status = applicable[0].fileStatus === 'ready' ? 'unbound' : applicable[0].fileStatus
    } else {
      continue
    }
    for (const range of promptEmbeddingLiteralRanges(prompt.text, token)) {
      matches.push({ ...range, candidates, ref, status, token })
    }
  }
  const accepted: PromptEmbeddingMatch[] = []
  if (includeOverlapping) {
    return matches.sort((a, b) => a.from - b.from || b.to - a.to)
  }
  for (const match of matches.sort((a, b) => b.to - b.from - (a.to - a.from) || a.from - b.from)) {
    if (!accepted.some((entry) => match.from < entry.to && match.to > entry.from)) {
      accepted.push(match)
    }
  }
  return accepted.sort((a, b) => a.from - b.from)
}
