import * as v from 'valibot'

import type { PromptEmbeddingSelection } from './prompt-embeddings.js'

import { IGS_SAFETY_CEILINGS, type IgsProjectDocumentV1 } from './project-schema.js'

const GENERATION_UNAVAILABLE_REASON =
  'Regional Guidance generation is not available yet. Disable or delete all enabled regions before generating.'

export interface ProjectRegionalGuidanceDocumentOwner {
  documentId: string
  documentRevision: string
}

export interface ProjectRegionalGuidanceOwner extends ProjectRegionalGuidanceDocumentOwner {
  regionId: string
}

export type ProjectRegionalGuidanceChange =
  | { enabled: boolean; kind: 'enabled' }
  | { kind: 'lock'; locked: boolean }
  | { kind: 'overlay-opacity'; overlayOpacity: number }
  | { kind: 'rename'; name: string }

export type ProjectRegionalGuidanceReferenceImageChange =
  | { kind: 'move'; referenceId: string; targetIndex: number }
  | { kind: 'remove'; referenceId: string }

const ReferenceImageChangeSchema = v.variant('kind', [
  v.strictObject({ kind: v.literal('remove'), referenceId: v.pipe(v.string(), v.uuid()) }),
  v.strictObject({
    kind: v.literal('move'),
    referenceId: v.pipe(v.string(), v.uuid()),
    targetIndex: v.pipe(
      v.number(),
      v.safeInteger(),
      v.minValue(0),
      v.maxValue(IGS_SAFETY_CEILINGS.archiveEntries - 1),
    ),
  }),
])

export type ProjectRegionalGuidancePromptChange =
  | {
      embeddingSelection?: PromptEmbeddingSelection
      historyGroupId?: string
      kind: 'text'
      polarity: 'negative' | 'positive'
      text: string
    }
  | { kind: 'block'; polarity: 'negative' | 'positive'; present: boolean }
  | { kind: 'negative-source'; useGlobalNegativePrompt: boolean }

export function isProjectRegionalGuidanceReferenceImageChange(
  input: unknown,
): input is ProjectRegionalGuidanceReferenceImageChange {
  return v.safeParse(ReferenceImageChangeSchema, input).success
}

const GROUP_UUID =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}'
// Current owned IDs use the portable schema's UUID shape; focus IDs are freshly issued RFC UUIDs.
const OWNED_UUID = '[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}'
const PROMPT_GROUP_PATTERN = new RegExp(
  `^regional:(${OWNED_UUID}):(positive|negative):${GROUP_UUID}$`,
)
const PromptChangeSchema = v.variant('kind', [
  v.strictObject({
    kind: v.literal('block'),
    polarity: v.picklist(['positive', 'negative']),
    present: v.boolean(),
  }),
  v.strictObject({
    embeddingSelection: v.optional(
      v.strictObject({
        resourceId: v.pipe(v.string(), v.uuid()),
        token: v.pipe(
          v.string(),
          v.nonEmpty(),
          v.maxBytes(IGS_SAFETY_CEILINGS.titleBytes),
          v.check((token) => token.trim().length > 0),
        ),
        versionId: v.pipe(v.string(), v.uuid()),
      }),
    ),
    historyGroupId: v.optional(v.pipe(v.string(), v.maxLength(128), v.regex(PROMPT_GROUP_PATTERN))),
    kind: v.literal('text'),
    polarity: v.picklist(['positive', 'negative']),
    text: v.pipe(v.string(), v.maxBytes(IGS_SAFETY_CEILINGS.textBytes)),
  }),
  v.strictObject({ kind: v.literal('negative-source'), useGlobalNegativePrompt: v.boolean() }),
])

const DocumentOwnerSchema = v.strictObject({
  documentId: v.pipe(v.string(), v.uuid()),
  documentRevision: v.pipe(v.string(), v.uuid()),
})
const OwnerSchema = v.strictObject({
  ...DocumentOwnerSchema.entries,
  regionId: v.pipe(v.string(), v.uuid()),
})
const ChangeSchema = v.variant('kind', [
  v.strictObject({
    kind: v.literal('rename'),
    name: v.pipe(
      v.string(),
      v.nonEmpty(),
      v.maxBytes(IGS_SAFETY_CEILINGS.titleBytes),
      v.check((value) => value.trim().length > 0, 'A region name cannot be only whitespace.'),
    ),
  }),
  v.strictObject({ enabled: v.boolean(), kind: v.literal('enabled') }),
  v.strictObject({ kind: v.literal('lock'), locked: v.boolean() }),
  v.strictObject({
    kind: v.literal('overlay-opacity'),
    overlayOpacity: v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(1)),
  }),
])

export class RegionalGuidanceGenerationError extends Error {
  readonly code = 'GENERATION_REGIONAL_GUIDANCE_UNSUPPORTED'

  constructor(message = GENERATION_UNAVAILABLE_REASON) {
    super(message)
    this.name = 'RegionalGuidanceGenerationError'
  }
}

export function isProjectRegionalGuidanceDocumentOwner(
  input: unknown,
): input is ProjectRegionalGuidanceDocumentOwner {
  return v.safeParse(DocumentOwnerSchema, input).success
}

export function isProjectRegionalGuidanceOwner(
  input: unknown,
): input is ProjectRegionalGuidanceOwner {
  return v.safeParse(OwnerSchema, input).success
}

export function isProjectRegionalGuidanceChange(
  input: unknown,
): input is ProjectRegionalGuidanceChange {
  return v.safeParse(ChangeSchema, input).success
}

export function isProjectRegionalGuidancePromptChange(
  input: unknown,
): input is ProjectRegionalGuidancePromptChange {
  if (!v.safeParse(PromptChangeSchema, input).success) {
    return false
  }
  const change = input as ProjectRegionalGuidancePromptChange
  return (
    change.kind !== 'text' ||
    change.historyGroupId === undefined ||
    PROMPT_GROUP_PATTERN.exec(change.historyGroupId)?.[2] === change.polarity
  )
}

export function isProjectRegionalGuidancePromptChangeForOwner(
  input: unknown,
  owner: unknown,
): input is ProjectRegionalGuidancePromptChange {
  if (!isProjectRegionalGuidanceOwner(owner) || !isProjectRegionalGuidancePromptChange(input)) {
    return false
  }
  return (
    input.kind !== 'text' ||
    input.historyGroupId === undefined ||
    PROMPT_GROUP_PATTERN.exec(input.historyGroupId)?.[1] === owner.regionId
  )
}

/** Additional namespace accepted only by the shared history-seal endpoint. */
export function isProjectRegionalGuidanceHistoryGroupId(input: unknown): input is string {
  return typeof input === 'string' && input.length <= 128 && PROMPT_GROUP_PATTERN.test(input)
}

/** New-job eligibility only. Frozen Retry and read-only composition do not consult this rule. */
export function getRegionalGuidanceGenerationUnavailableReason(
  document: Pick<IgsProjectDocumentV1, 'regionalGuidance'>,
): string | null {
  return document.regionalGuidance?.some((region) => region.enabled)
    ? GENERATION_UNAVAILABLE_REASON
    : null
}

export function assertRegionalGuidanceGenerationAvailable(
  document: Pick<IgsProjectDocumentV1, 'regionalGuidance'>,
): void {
  if (getRegionalGuidanceGenerationUnavailableReason(document) !== null) {
    throw new RegionalGuidanceGenerationError()
  }
}
