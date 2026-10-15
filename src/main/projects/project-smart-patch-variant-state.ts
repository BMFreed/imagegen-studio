import { getEffectiveDynamicPromptSettings } from '../../shared/projects/generation-dynamic-settings.js'
import { resolveProjectMaskSettings } from '../../shared/projects/project-mask-settings.js'
import {
  IGS_GENERATION_PNG_MAX_BYTES,
  type IgsProjectDocumentV1,
  type IgsSmartPatchGenerationProvenanceV1,
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

/** Identity of actual pixels captured by Main for the current target bbox, not reported worker data. */
export type SmartPatchCurrentSourceTarget =
  IgsSmartPatchGenerationProvenanceV1['layerSourceContext']['sourceTarget']

type Draft = IgsProjectDocumentV1['generationDraft']
type Resource = NonNullable<Draft['model']>
type Prompt = Draft['positivePrompt']

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

  const changedInputs: SmartPatchVariantChangedInput[] = []
  const compare = (axis: SmartPatchVariantChangedInput, before: unknown, after: unknown): void => {
    if (!isDeepStrictEqual(before, after)) {
      changedInputs.push(axis)
    }
  }
  compare('mask', baseline.mask, target.mask)
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
    relevantDraft(target.generationDraft, mode),
  )
  if (currentSourceTarget === undefined) {
    return { blockedBy, changedInputs, status: 'unverified' }
  }
  const source = v.parse(sourceTargetSchema, currentSourceTarget)
  if (source.width !== target.boundingBox.width || source.height !== target.boundingBox.height) {
    throw new Error('The current Smart Patch source identity differs from its captured bbox.')
  }
  compare('source-composite', baseline.sourceTarget, source)
  return { blockedBy, changedInputs, status: changedInputs.length > 0 ? 'outdated' : 'ready' }
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
