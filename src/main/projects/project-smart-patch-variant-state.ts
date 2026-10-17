import { getEffectiveDynamicPromptSettings } from '../../shared/projects/generation-dynamic-settings.js'
import { resolveProjectMaskSettings } from '../../shared/projects/project-mask-settings.js'
import {
  IGS_GENERATION_PNG_MAX_BYTES,
  type IgsProjectDocumentV1,
  type IgsSmartPatchGenerationProvenanceV1,
  type IgsSmartPatchLayerV1,
  parseProjectDocumentV1,
  parseSmartPatchGenerationProvenanceV1,
} from '../../shared/projects/project-schema.js'
import { activePromptEmbeddingRefs } from '../../shared/projects/prompt-embeddings.js'
import { resolveSmartPatchCoherenceSettings } from '../../shared/projects/smart-patch-coherence-settings.js'

import { isDeepStrictEqual } from 'node:util'
import * as v from 'valibot'

export type SmartPatchVariantChangedInput =
  | 'bbox'
  | 'coherence'
  | 'generation-draft'
  | 'internal-resolution'
  | 'mask-blur'
  | 'mask'
  | 'source-composite'

export interface SmartPatchVariantState {
  blockedBy: ('hidden' | 'locked')[]
  changedInputs: SmartPatchVariantChangedInput[]
  status: 'blocked' | 'orphaned' | 'outdated' | 'ready' | 'unverified'
}

export interface StoredSmartPatchVariantState {
  changedInputs: SmartPatchVariantChangedInput[]
  sourceVerified: boolean
  status: 'outdated' | 'ready' | 'unverified'
}

/** Identity of actual pixels captured by Main for the current target bbox, not reported worker data. */
export type SmartPatchCurrentSourceTarget =
  IgsSmartPatchGenerationProvenanceV1['layerSourceContext']['sourceTarget']

type Draft = IgsProjectDocumentV1['generationDraft']
type Resource = NonNullable<Draft['model']>
type Prompt = Draft['positivePrompt']
type SmartPatchMode = IgsSmartPatchGenerationProvenanceV1['generationConfiguration']['mode']
type NormalizedDraft = ReturnType<typeof relevantDraft>

const dimension = v.pipe(v.number(), v.safeInteger(), v.minValue(1), v.maxValue(2048))
const sourceTargetSchema = v.pipe(
  v.strictObject({
    byteSize: v.pipe(
      v.number(),
      v.safeInteger(),
      v.minValue(1),
      v.maxValue(IGS_GENERATION_PNG_MAX_BYTES),
    ),
    height: dimension,
    sha256: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/)),
    width: dimension,
  }),
  v.check(({ height, width }) => height * width <= 4_000_000),
)

/**
 * Read-only prerequisite for future acceptance: compare owned authoring and independently captured
 * source pixels. This does not inspect a model registry, qualify a runtime, resolve a seed, accept
 * a variant, or claim resource availability. In particular a `ready` result is not Generate
 * readiness. A later asynchronous caller must capture/recheck its own document revision around
 * source capture.
 */
export function assessSmartPatchVariantState(
  inputProvenance: IgsSmartPatchGenerationProvenanceV1,
  inputDocument: IgsProjectDocumentV1,
  currentSourceTarget?: SmartPatchCurrentSourceTarget,
): SmartPatchVariantState {
  const provenance = parseSmartPatchGenerationProvenanceV1(inputProvenance)
  const document = parseProjectDocumentV1(inputDocument)
  const baseline = provenance.layerSourceContext
  const target = document.layers.find((layer) => layer.id === baseline.layerId)
  if (document.documentId !== baseline.sourceDocumentId || target?.kind !== 'smart-patch') {
    return { blockedBy: [], changedInputs: [], status: 'orphaned' }
  }
  const blockedBy: SmartPatchVariantState['blockedBy'] = []
  if (target.locked) {
    blockedBy.push('locked')
  }
  if (!target.visible) {
    blockedBy.push('hidden')
  }
  if (blockedBy.length > 0) {
    return { blockedBy, changedInputs: [], status: 'blocked' }
  }

  const changedInputs = changedAuthoringInputs(provenance, target, 'ownership')
  if (currentSourceTarget === undefined) {
    return { blockedBy, changedInputs, status: 'unverified' }
  }
  compareCurrentSource(changedInputs, provenance, target, currentSourceTarget)
  return { blockedBy, changedInputs, status: changedInputs.length > 0 ? 'outdated' : 'ready' }
}

/**
 * Stored pixels retain their frozen lineage when a whole Patch is copied into a new owner.
 * Visibility, locking and resource availability are independent of input freshness. A caller
 * supplies the exact current owner and independently captures/rechecks current source pixels;
 * historical provenance IDs are never rewritten to make that owner look like the original.
 */
export function assessStoredSmartPatchVariantState(
  inputProvenance: IgsSmartPatchGenerationProvenanceV1,
  inputDocument: IgsProjectDocumentV1,
  ownerLayerId: string,
  currentSourceTarget?: SmartPatchCurrentSourceTarget,
): StoredSmartPatchVariantState {
  const provenance = parseSmartPatchGenerationProvenanceV1(inputProvenance)
  const document = parseProjectDocumentV1(inputDocument)
  const target = document.layers.find((layer) => layer.id === ownerLayerId)
  if (target?.kind !== 'smart-patch') {
    throw new Error('The current stored Smart Patch owner is absent.')
  }
  return assessStoredVariantForValidatedLayer(
    provenance,
    target,
    currentSourceTarget === undefined
      ? undefined
      : validateCurrentSource(target, currentSourceTarget),
  )
}

/** One document validation serves every accepted member instead of revalidating it per variant. */
export function assessStoredSmartPatchVariants(
  inputDocument: IgsProjectDocumentV1,
  ownerLayerId: string,
  currentSourceTarget?: SmartPatchCurrentSourceTarget,
): (StoredSmartPatchVariantState & { id: string })[] {
  const document = parseProjectDocumentV1(inputDocument)
  const target = document.layers.find((layer) => layer.id === ownerLayerId)
  if (target?.kind !== 'smart-patch') {
    throw new Error('The current stored Smart Patch owner is absent.')
  }
  const source =
    currentSourceTarget === undefined
      ? undefined
      : validateCurrentSource(target, currentSourceTarget)
  // Current authoring can be much larger than any historic variant's frozen draft. Normalize
  // it once per mode rather than multiplying that work by the number of stored alternatives.
  const currentDrafts = new Map<SmartPatchMode, NormalizedDraft>()
  return target.rasterSubLayers.map(({ generationProvenance, id }) => {
    const mode = generationProvenance.generationConfiguration.mode
    let currentDraft = currentDrafts.get(mode)
    if (currentDraft === undefined) {
      currentDraft = relevantDraft(target.generationDraft, mode)
      currentDrafts.set(mode, currentDraft)
    }
    return {
      ...assessStoredVariantForValidatedLayer(generationProvenance, target, source, currentDraft),
      id,
    }
  })
}

/**
 * Main's DTO projection already owns a schema-validated Patch. Validate only the supplied
 * provenance here, without rescanning unrelated layers or that owner's inactive variants. External
 * callers with an unvalidated document must use the strict document APIs instead.
 */
export function assessStoredSmartPatchVariantForLayer(
  inputProvenance: IgsSmartPatchGenerationProvenanceV1,
  target: IgsSmartPatchLayerV1,
  currentSourceTarget?: SmartPatchCurrentSourceTarget,
): StoredSmartPatchVariantState {
  const provenance = parseSmartPatchGenerationProvenanceV1(inputProvenance)
  return assessStoredVariantForValidatedLayer(
    provenance,
    target,
    currentSourceTarget === undefined
      ? undefined
      : validateCurrentSource(target, currentSourceTarget),
  )
}

function assessStoredVariantForValidatedLayer(
  provenance: IgsSmartPatchGenerationProvenanceV1,
  target: IgsSmartPatchLayerV1,
  currentSourceTarget: SmartPatchCurrentSourceTarget | undefined,
  currentDraft?: NormalizedDraft,
): StoredSmartPatchVariantState {
  const changedInputs = changedAuthoringInputs(provenance, target, 'content', currentDraft)
  const sourceVerified = currentSourceTarget !== undefined
  if (
    sourceVerified &&
    !isDeepStrictEqual(provenance.layerSourceContext.sourceTarget, currentSourceTarget)
  ) {
    changedInputs.push('source-composite')
  }
  return {
    changedInputs,
    sourceVerified,
    status: changedInputs.length > 0 ? 'outdated' : sourceVerified ? 'ready' : 'unverified',
  }
}

function changedAuthoringInputs(
  provenance: IgsSmartPatchGenerationProvenanceV1,
  target: IgsSmartPatchLayerV1,
  maskComparison: 'content' | 'ownership',
  currentDraft?: NormalizedDraft,
): SmartPatchVariantChangedInput[] {
  const baseline = provenance.layerSourceContext
  const changedInputs: SmartPatchVariantChangedInput[] = []
  const compare = (axis: SmartPatchVariantChangedInput, before: unknown, after: unknown): void => {
    if (!isDeepStrictEqual(before, after)) {
      changedInputs.push(axis)
    }
  }
  compare(
    'mask',
    maskComparison === 'content' ? maskContentIdentity(baseline.mask) : baseline.mask,
    maskComparison === 'content' ? maskContentIdentity(target.mask) : target.mask,
  )
  compare('bbox', baseline.bbox, target.boundingBox)
  compare('internal-resolution', baseline.internalResolution, target.internalResolution)
  compare('mask-blur', baseline.maskBlur, resolveProjectMaskSettings(target.maskSettings).blur)
  compare(
    'coherence',
    baseline.coherenceSettings,
    resolveSmartPatchCoherenceSettings(target.coherenceSettings),
  )
  const mode = provenance.generationConfiguration.mode
  compare(
    'generation-draft',
    relevantDraft(baseline.generationDraft, mode),
    currentDraft ?? relevantDraft(target.generationDraft, mode),
  )
  return changedInputs
}

function compareCurrentSource(
  changedInputs: SmartPatchVariantChangedInput[],
  provenance: IgsSmartPatchGenerationProvenanceV1,
  target: IgsSmartPatchLayerV1,
  currentSourceTarget: SmartPatchCurrentSourceTarget,
): void {
  const source = validateCurrentSource(target, currentSourceTarget)
  if (!isDeepStrictEqual(provenance.layerSourceContext.sourceTarget, source)) {
    changedInputs.push('source-composite')
  }
}

function validateCurrentSource(
  target: IgsSmartPatchLayerV1,
  currentSourceTarget: SmartPatchCurrentSourceTarget,
): SmartPatchCurrentSourceTarget {
  const source = v.parse(sourceTargetSchema, currentSourceTarget)
  if (source.width !== target.boundingBox.width || source.height !== target.boundingBox.height) {
    throw new Error('The current Smart Patch source identity differs from its captured bbox.')
  }
  return source
}

/** Ownership paths and edit counters do not change the exact restored mask input. */
function maskContentIdentity(mask: IgsSmartPatchLayerV1['mask']) {
  if (mask.asset === null) {
    return null
  }
  return {
    asset: {
      bytes: mask.asset.bytes,
      height: mask.asset.height,
      sha256: mask.asset.sha256,
      width: mask.asset.width,
    },
    bounds: mask.bounds,
  }
}

/** Byte identity survives catalog relinking and renaming; prediction metadata affects inference. */
function resourceIdentity(resource: Resource | null) {
  return resource === null
    ? null
    : {
        baseModelFamily: resource.baseModelFamily,
        fileSha256: resource.fileSha256,
        kind: resource.kind,
        predictionType: resource.predictionType,
      }
}

function relevantPrompt(prompt: Prompt) {
  const effective = activePromptEmbeddingRefs(prompt.text, prompt.embeddingRefs).map((ref) => ({
    resource: resourceIdentity(ref.resource),
    token: ref.token,
  }))
  // Local binding IDs can change the sidecar's order after relinking, but not applied embeddings.
  const byIdentity = new Map(effective.map((entry) => [JSON.stringify(entry), entry]))
  return {
    embeddingRefs: [...byIdentity.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, entry]) => entry),
    text: prompt.text,
  }
}

function relevantDraft(
  draft: Draft,
  mode: IgsSmartPatchGenerationProvenanceV1['generationConfiguration']['mode'],
) {
  const anima = draft.model?.baseModelFamily === 'anima'
  return {
    cfgRescale: draft.cfgRescale ?? 0,
    // Any explicit CLIP Skip is currently unsupported; absence is not a guessed numeric default.
    clipSkip: draft.clipSkip ?? null,
    dynamicPrompt: getEffectiveDynamicPromptSettings(draft.dynamicPrompt),
    loras: draft.loras
      .filter((entry) => entry.enabled)
      .map((entry) => ({ resource: resourceIdentity(entry.resource), weight: entry.weight })),
    model: resourceIdentity(draft.model),
    negativePrompt: relevantPrompt(draft.negativePrompt),
    positivePrompt: relevantPrompt(draft.positivePrompt),
    sampling: {
      ...(anima
        ? { animaMethod: draft.sampling.animaMethod ?? null }
        : { sampler: draft.sampling.sampler, scheduler: draft.sampling.scheduler }),
      cfgScale: draft.sampling.cfgScale,
      ...(mode === 'txt2img' ? {} : { denoisingStrength: draft.sampling.denoisingStrength }),
      steps: draft.sampling.steps,
    },
    seed:
      draft.seed.policy === 'fixed'
        ? { policy: draft.seed.policy, value: draft.seed.value }
        : { policy: draft.seed.policy },
    vae: resourceIdentity(draft.vae),
    vaePrecision: draft.vaePrecision ?? 'Auto',
  }
}
