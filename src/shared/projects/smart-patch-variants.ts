import * as v from 'valibot'

import type { ModelCatalogItem } from '../api.js'

import { IGS_SAFETY_CEILINGS, type IgsSmartPatchLayerV1 } from './project-schema.js'
import { activePromptEmbeddingRefs } from './prompt-embeddings.js'

const uuid = v.pipe(v.string(), v.uuid())
const owner = { documentId: uuid, documentRevision: uuid, variantId: uuid }
const changeSchema = v.variant('kind', [
  v.strictObject({ ...owner, kind: v.literal('select') }),
  v.strictObject({ ...owner, kind: v.literal('delete') }),
  v.strictObject({
    ...owner,
    kind: v.literal('rename'),
    name: v.pipe(
      v.string(),
      v.maxBytes(IGS_SAFETY_CEILINGS.titleBytes),
      v.check((name) => name.trim().length > 0),
    ),
  }),
])

export type ProjectSmartPatchVariantChange = v.InferOutput<typeof changeSchema>

export function isProjectSmartPatchVariantChange(
  value: unknown,
): value is ProjectSmartPatchVariantChange {
  return v.safeParse(changeSchema, value).success
}

const changedInputSchema = v.picklist([
  'bbox',
  'coherence',
  'generation-draft',
  'internal-resolution',
  'mask-blur',
  'mask',
  'source-composite',
])
const variantStateSchema = v.pipe(
  v.strictObject({
    changedInputs: v.pipe(v.array(changedInputSchema), v.maxLength(7)),
    id: uuid,
    sourceVerified: v.boolean(),
    status: v.picklist(['ready', 'outdated', 'unverified']),
  }),
  v.check(
    (state) =>
      new Set(state.changedInputs).size === state.changedInputs.length &&
      (state.status === 'outdated'
        ? state.changedInputs.length > 0
        : state.changedInputs.length === 0 &&
          (state.status === 'ready' ? state.sourceVerified : !state.sourceVerified)),
  ),
)
const inspectionSchema = v.strictObject({
  documentId: uuid,
  documentRevision: uuid,
  layerId: uuid,
  resourceDiagnostics: v.pipe(
    v.array(
      v.strictObject({
        code: v.pipe(v.string(), v.maxLength(128)),
        message: v.pipe(v.string(), v.maxLength(512)),
      }),
    ),
    v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries),
  ),
  resourcesChecked: v.boolean(),
  sourceUnavailableReason: v.nullable(v.pipe(v.string(), v.maxLength(512))),
  variants: v.pipe(
    v.array(variantStateSchema),
    v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries),
    v.check((states) => new Set(states.map(({ id }) => id)).size === states.length),
  ),
})

export type ProjectSmartPatchVariantsInspection = v.InferOutput<typeof inspectionSchema>

export function isProjectSmartPatchVariantsInspection(
  value: unknown,
): value is ProjectSmartPatchVariantsInspection {
  return v.safeParse(inspectionSchema, value).success
}

/** Current catalog diagnostics do not change saved output or qualify a runtime. */
export function smartPatchResourceDiagnostics(
  patch: IgsSmartPatchLayerV1,
  catalog: ModelCatalogItem[] | null,
): ProjectSmartPatchVariantsInspection['resourceDiagnostics'] {
  const draft = patch.generationDraft
  const diagnostics: ProjectSmartPatchVariantsInspection['resourceDiagnostics'] = []
  const references = [
    ...(draft.model ? [draft.model] : []),
    ...(draft.vae ? [draft.vae] : []),
    ...draft.loras.filter(({ enabled }) => enabled).map(({ resource }) => resource),
    ...[draft.positivePrompt, draft.negativePrompt].flatMap((prompt) =>
      activePromptEmbeddingRefs(prompt.text, prompt.embeddingRefs).map(({ resource }) => resource),
    ),
  ]
  const versions = new Map(
    catalog?.flatMap((item) =>
      item.versions.map(
        (version) => [`${item.resourceType}:${item.id}:${version.id}`, { item, version }] as const,
      ),
    ),
  )
  const seen = new Set<string>()
  let omitted = 0
  const add = (code: string, message: string) => {
    if (diagnostics.length >= IGS_SAFETY_CEILINGS.archiveEntries - 1) {
      omitted += 1
      return
    }
    diagnostics.push({ code, message: message.slice(0, 512) })
  }
  if (!draft.model) {
    add('MODEL_NOT_SELECTED', 'No checkpoint is selected.')
  }
  if (catalog === null) {
    add('CATALOG_UNAVAILABLE', 'Resource availability could not be checked.')
    return diagnostics
  }
  for (const resource of references) {
    // Deduplicate exact immutable references without a quadratic prior-stack scan.
    const key = JSON.stringify(resource)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    const match = versions.get(
      `${resource.kind}:${resource.localModelId}:${resource.localVersionId}`,
    )
    const label = `${resource.displayName} · ${resource.versionName}`
    if (
      !match ||
      match.item.modelId !== resource.civitaiModelId ||
      match.version.civitaiVersionId !== resource.civitaiVersionId ||
      match.version.civitaiFileId !== resource.civitaiFileId ||
      match.version.sha256 !== resource.fileSha256 ||
      match.version.baseModelFamily !== resource.baseModelFamily ||
      match.version.fileStatus === 'missing'
    ) {
      add('RESOURCE_MISSING', `${label}: exact linked version unavailable.`)
    } else if (match.version.fileStatus === 'corrupt') {
      add('RESOURCE_CORRUPT', `${label}: file needs repair.`)
    } else if (resource.kind === 'checkpoint' && match.version.dependencyIssues.length > 0) {
      add('RESOURCE_MISSING', `${label}: required model components are unavailable.`)
    } else if (resource.baseModelFamily === null) {
      add('RESOURCE_FAMILY_UNKNOWN', `${label}: model family is unknown.`)
    } else if (draft.model && resource.baseModelFamily !== draft.model.baseModelFamily) {
      add('RESOURCE_FAMILY_MISMATCH', `${label}: incompatible with the selected checkpoint.`)
    } else if (
      resource.kind === 'checkpoint' &&
      resource.predictionType !== match.version.predictionType
    ) {
      add(
        'RESOURCE_POLICY_CHANGED',
        `${label}: the current prediction setting differs from the saved draft. Review Model Manager before generating.`,
      )
    }
  }
  if (omitted > 0) {
    diagnostics.push({
      code: 'DIAGNOSTICS_TRUNCATED',
      message: `${omitted} additional resource issues are omitted. Review the generation settings in smaller groups.`,
    })
  }
  return diagnostics
}
