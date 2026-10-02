import * as v from 'valibot'

import type { ModelCatalogItem, ModelVersionView } from '../api.js'
import type { IgsProjectDocumentV1, IgsRasterGenerationProvenanceV1 } from './project-schema.js'

import { getEffectiveDynamicPromptSettings } from './generation-dynamic-settings.js'
import { resolveIllustriousScheduler } from './illustrious-scheduler.js'
import { IGS_SAFETY_CEILINGS, isRasterGenerationConfigurationV1 } from './project-schema.js'

export interface RasterGenerationData {
  currentMode: 'img2img' | 'outpaint' | 'txt2img' | null
  documentId: string
  generationConfiguration: IgsRasterGenerationProvenanceV1['generationConfiguration'] | null
  layerId: string
  modeUnavailableReason: string | null
}

const RasterGenerationDataSchema = v.pipe(
  v.strictObject({
    currentMode: v.nullable(v.picklist(['img2img', 'outpaint', 'txt2img'])),
    documentId: v.pipe(v.string(), v.uuid()),
    generationConfiguration: v.nullable(
      v.custom<IgsRasterGenerationProvenanceV1['generationConfiguration']>(
        isRasterGenerationConfigurationV1,
      ),
    ),
    layerId: v.pipe(v.string(), v.uuid()),
    modeUnavailableReason: v.nullable(
      v.pipe(
        v.string(),
        v.nonEmpty(),
        v.maxBytes(IGS_SAFETY_CEILINGS.titleBytes),
        v.check((value) => value.trim().length > 0),
      ),
    ),
  }),
  v.check((data) =>
    data.currentMode === null
      ? data.modeUnavailableReason !== null
      : data.modeUnavailableReason === null,
  ),
)

export type GenerationSettingsComparisonStatus =
  'Added' | 'Changed' | 'Missing resource' | 'Removed' | 'Same' | 'Unavailable'

export interface GenerationSettingsComparisonRow {
  after: string
  before: string
  key: string
  label: string
  status: GenerationSettingsComparisonStatus
}

export interface GenerationSettingsComparisonSection {
  key: string
  label: string
  rows: GenerationSettingsComparisonRow[]
}

export interface GenerationSettingsComparisonCurrent {
  bbox: Pick<IgsProjectDocumentV1['primaryBbox'], 'height' | 'width'>
  generationDraft: IgsProjectDocumentV1['generationDraft']
  /** Null means the catalog is not known, rather than a known empty installed library. */
  modelCatalog: ModelCatalogItem[] | null
  modelCatalogError: string | null
  reuseSeed: number | null
}

type Resource = NonNullable<IgsProjectDocumentV1['generationDraft']['model']>
type Lora = IgsProjectDocumentV1['generationDraft']['loras'][number]

type Prompt = IgsProjectDocumentV1['generationDraft']['positivePrompt']
type Availability = 'Missing resource' | 'Unavailable' | null
/** The comparison transport contains portable settings, never layer/source or execution context. */
export function isRasterGenerationData(value: unknown): value is RasterGenerationData {
  return v.is(RasterGenerationDataSchema, value)
}

const UNRECORDED = 'Unavailable in saved generation data'

/** Pure, read-only projection. It does not relink resources, expand prompts or allocate seeds. */
export function compareRasterGenerationSettings(
  data: RasterGenerationData,
  current: GenerationSettingsComparisonCurrent,
): GenerationSettingsComparisonSection[] {
  const baseline = data.generationConfiguration
  if (!baseline) {
    return []
  }
  const draft = current.generationDraft
  const modelAvailability = resourceAvailability(
    [baseline.model, ...(draft.model ? [draft.model] : [])],
    current,
  )
  const recordedLoras = baseline.loras
  const loraAvailability =
    recordedLoras === undefined
      ? null
      : resourceAvailability(
          [...recordedLoras, ...draft.loras]
            .filter((lora) => lora.enabled)
            .map((lora) => lora.resource),
          current,
        )
  const currentModelVersion =
    draft.model && current.modelCatalog && !current.modelCatalogError
      ? exactBoundVersion(draft.model, current.modelCatalog)
      : null
  const currentPrediction = !draft.model
    ? null
    : currentModelVersion?.predictionType === null || !currentModelVersion
      ? undefined
      : currentModelVersion.predictionType
  const scheduler =
    draft.model?.baseModelFamily === 'illustrious' && draft.model.kind === 'checkpoint'
      ? resolveIllustriousScheduler(draft.sampling.sampler, draft.sampling.scheduler)
      : { kind: 'unsupported' as const }
  const actualSeed = seedValue(current)
  const currentSeed =
    actualSeed !== undefined
      ? String(actualSeed)
      : draft.seed.policy === 'random'
        ? 'Assigned when the next generation is queued'
        : draft.seed.policy === 'reuse'
          ? 'No completed actual seed is available for this Project'
          : 'Not set'
  const value = (input: number | string | null | undefined) =>
    input == null ? 'Not set' : String(input)
  const currentCfgRescale =
    draft.model?.baseModelFamily === 'illustrious' ? (draft.cfgRescale ?? 0) : undefined
  const recordedStrength =
    'denoisingStrength' in baseline.sampling ? baseline.sampling.denoisingStrength : undefined
  const currentStrength =
    data.currentMode === 'img2img' && draft.model?.baseModelFamily === 'illustrious'
      ? (draft.sampling.denoisingStrength ?? undefined)
      : undefined
  return [
    promptSection('prompt', 'Prompt', baseline.positivePrompt, draft.positivePrompt, current),
    promptSection(
      'negativePrompt',
      'Negative Prompt',
      baseline.negativePrompt,
      draft.negativePrompt,
      current,
    ),
    {
      key: 'model',
      label: 'Model',
      rows: [
        row(
          'model.resource',
          'Model and exact version',
          portableIdentity(baseline.model),
          draft.model ? portableIdentity(draft.model) : null,
          describeResource(baseline.model),
          resourceAfter(describeResource(draft.model), modelAvailability, current),
          modelAvailability,
        ),
        row(
          'model.predictionType',
          'Prediction type',
          baseline.model.predictionType,
          currentPrediction,
          baseline.model.predictionType,
          currentPrediction === undefined ? 'Unavailable' : value(currentPrediction),
          modelAvailability,
        ),
      ],
    },
    {
      key: 'loras',
      label: 'LoRA',
      rows: [
        row(
          'loras.stack',
          'LoRA stack',
          recordedLoras === undefined ? undefined : loraStackIdentity(recordedLoras),
          loraStackIdentity(draft.loras),
          recordedLoras === undefined ? UNRECORDED : describeLoraStack(recordedLoras),
          resourceAfter(describeLoraStack(draft.loras), loraAvailability, current),
          loraAvailability,
        ),
      ],
    },
    {
      key: 'size',
      label: 'Size',
      rows: [
        row(
          'size.dimensions',
          'Generation size',
          [baseline.size.width, baseline.size.height],
          [current.bbox.width, current.bbox.height],
          `${baseline.size.width} × ${baseline.size.height}`,
          `${current.bbox.width} × ${current.bbox.height}`,
        ),
      ],
    },
    {
      key: 'sampling',
      label: 'Sampler & Scheduler',
      rows: [
        row(
          'sampling.sampler',
          'Sampler',
          baseline.sampling.sampler,
          draft.sampling.sampler,
          baseline.sampling.sampler,
          value(draft.sampling.sampler),
        ),
        row(
          'sampling.scheduler',
          'Scheduler',
          baseline.sampling.scheduler,
          draft.sampling.scheduler,
          baseline.sampling.scheduler,
          value(draft.sampling.scheduler),
        ),
        row(
          'sampling.invokeScheduler',
          'Resolved scheduler',
          baseline.sampling.invokeScheduler,
          scheduler.kind === 'supported' ? scheduler.key : undefined,
          baseline.sampling.invokeScheduler,
          scheduler.kind === 'supported' ? scheduler.key : 'Unavailable for the current selection',
        ),
      ],
    },
    {
      key: 'guidance',
      label: 'Steps & CFG',
      rows: [
        row(
          'guidance.steps',
          'Steps',
          baseline.sampling.steps,
          draft.sampling.steps,
          String(baseline.sampling.steps),
          value(draft.sampling.steps),
        ),
        row(
          'guidance.cfg',
          'CFG',
          baseline.sampling.cfgScale,
          draft.sampling.cfgScale,
          String(baseline.sampling.cfgScale),
          value(draft.sampling.cfgScale),
        ),
      ],
    },
    {
      key: 'cfgRescale',
      label: 'CFG Rescale',
      rows: [
        row(
          'cfgRescale.value',
          'CFG Rescale',
          baseline.cfgRescale,
          currentCfgRescale,
          baseline.cfgRescale === undefined ? UNRECORDED : String(baseline.cfgRescale),
          currentCfgRescale === undefined
            ? draft.model?.baseModelFamily === 'anima'
              ? 'Unsupported for Anima'
              : 'Unavailable for the current model'
            : String(currentCfgRescale),
        ),
      ],
    },
    {
      key: 'denoisingStrength',
      label: 'Denoising Strength',
      rows: [
        row(
          'denoisingStrength.value',
          'Denoising Strength',
          recordedStrength,
          currentStrength,
          recordedStrength === undefined ? UNRECORDED : String(recordedStrength),
          currentStrength !== undefined
            ? String(currentStrength)
            : data.currentMode === 'txt2img'
              ? 'Not applied to the current raster input'
              : data.currentMode === 'img2img'
                ? 'Not set or unsupported by the current model'
                : 'Unavailable for the current generation area',
        ),
      ],
    },
    {
      key: 'seed',
      label: 'Seed',
      rows: [
        row(
          'seed.actual',
          'Actual seed',
          baseline.sampling.actualSeed,
          actualSeed,
          String(baseline.sampling.actualSeed),
          currentSeed,
        ),
        row(
          'seed.policy',
          'Requested seed policy',
          baseline.sampling.requestedSeedPolicy,
          draft.seed.policy,
          baseline.sampling.requestedSeedPolicy,
          draft.seed.policy,
        ),
        row(
          'seed.behavior',
          'Dynamic prompt seed behavior',
          baseline.sampling.seedBehavior,
          getEffectiveDynamicPromptSettings(draft.dynamicPrompt).seedBehavior,
          baseline.sampling.seedBehavior ?? UNRECORDED,
          getEffectiveDynamicPromptSettings(draft.dynamicPrompt).seedBehavior,
        ),
      ],
    },
    {
      key: 'vae',
      label: 'VAE',
      rows: [unrecordedRow('vae.resource', 'VAE', describeResource(draft.vae))],
    },
    {
      key: 'vaePrecision',
      label: 'VAE Precision',
      rows: [unrecordedRow('vaePrecision.value', 'VAE Precision', value(draft.vaePrecision))],
    },
    {
      key: 'clipSkip',
      label: 'CLIP Skip',
      rows: [unrecordedRow('clipSkip.value', 'CLIP Skip', value(draft.clipSkip))],
    },
    {
      key: 'context',
      label: 'Generation mode',
      rows: [
        row(
          'context.mode',
          'Generation mode',
          baseline.mode,
          data.currentMode ?? undefined,
          baseline.mode,
          data.currentMode ?? data.modeUnavailableReason ?? 'Unavailable',
        ),
      ],
    },
  ]
}

/** Portable identity excludes labels and machine-local registry bindings. */
function portableIdentity(resource: Resource) {
  return {
    baseModelFamily: resource.baseModelFamily,
    civitaiFileId: resource.civitaiFileId,
    civitaiModelId: resource.civitaiModelId,
    civitaiVersionId: resource.civitaiVersionId,
    fileSha256: resource.fileSha256,
    kind: resource.kind,
  }
}

function loraStackIdentity(stack: readonly Lora[]) {
  return stack.length
    ? stack.map((lora) => ({
        enabled: lora.enabled,
        resource: portableIdentity(lora.resource),
        weight: lora.weight,
      }))
    : null
}

function describeLoraStack(stack: readonly Lora[]): string {
  return stack.length
    ? stack
        .map(
          (lora) =>
            `${lora.enabled ? 'Enabled' : 'Disabled'} · ${describeResource(lora.resource)} · Weight ${lora.weight}`,
        )
        .join('\n')
    : 'None'
}

/** A portable match elsewhere in the catalog is not an already-linked resource. */
function exactBoundVersion(
  resource: Resource,
  catalog: ModelCatalogItem[],
): ModelVersionView | null {
  const model = catalog.find(
    (item) => item.id === resource.localModelId && item.resourceType === resource.kind,
  )
  const version = model?.versions.find((item) => item.id === resource.localVersionId)
  return model &&
    version &&
    model.modelId === resource.civitaiModelId &&
    version.civitaiVersionId === resource.civitaiVersionId &&
    version.civitaiFileId === resource.civitaiFileId &&
    version.sha256 === resource.fileSha256 &&
    version.baseModelFamily === resource.baseModelFamily &&
    version.fileStatus === 'ready'
    ? version
    : null
}

function resourceAvailability(
  resources: readonly Resource[],
  current: GenerationSettingsComparisonCurrent,
): Availability {
  if (!resources.length) {
    return null
  }
  if (current.modelCatalog === null || current.modelCatalogError !== null) {
    return 'Unavailable'
  }
  return resources.some((resource) => !exactBoundVersion(resource, current.modelCatalog!))
    ? 'Missing resource'
    : null
}

function describeResource(resource: Resource | null): string {
  if (!resource) {
    return 'None'
  }
  const civitai =
    resource.civitaiModelId === null &&
    resource.civitaiVersionId === null &&
    resource.civitaiFileId === null
      ? ''
      : `\nCivitAI model ${resource.civitaiModelId ?? 'Unavailable'} · version ${resource.civitaiVersionId ?? 'Unavailable'} · file ${resource.civitaiFileId ?? 'Unavailable'}`
  return `${resource.displayName} · ${resource.versionName}\n${resource.baseModelFamily ?? 'Family unavailable'} · ${resource.kind} · SHA-256 ${resource.fileSha256}${civitai}`
}

function resourceAfter(
  value: string,
  availability: Availability,
  current: GenerationSettingsComparisonCurrent,
): string {
  return availability === 'Unavailable'
    ? `${value}\nModel catalog unavailable${current.modelCatalogError ? `: ${current.modelCatalogError}` : ' while loading'}`
    : availability === 'Missing resource'
      ? `${value}\nAn exact resource binding used on either side is unavailable.`
      : value
}

function row(
  key: string,
  label: string,
  beforeValue: unknown,
  afterValue: unknown,
  before: string,
  after: string,
  availability: Availability = null,
): GenerationSettingsComparisonRow {
  return {
    after,
    before,
    key,
    label,
    status:
      availability ??
      (beforeValue === undefined || afterValue === undefined
        ? 'Unavailable'
        : beforeValue === null
          ? afterValue === null
            ? 'Same'
            : 'Added'
          : afterValue === null
            ? 'Removed'
            : JSON.stringify(beforeValue) === JSON.stringify(afterValue)
              ? 'Same'
              : 'Changed'),
  }
}

function unrecordedRow(key: string, label: string, after: string): GenerationSettingsComparisonRow {
  return row(key, label, undefined, undefined, UNRECORDED, after)
}

function describeEmbeddings(prompt: Prompt): string {
  return prompt.embeddingRefs.length
    ? prompt.embeddingRefs
        .map((ref) => `${ref.token} · ${describeResource(ref.resource)}`)
        .join('\n')
    : 'None'
}

function promptSection(
  key: 'negativePrompt' | 'prompt',
  label: string,
  baseline: Prompt,
  authored: Prompt,
  current: GenerationSettingsComparisonCurrent,
): GenerationSettingsComparisonSection {
  const availability = resourceAvailability(
    [...baseline.embeddingRefs, ...authored.embeddingRefs].map((ref) => ref.resource),
    current,
  )
  const embeddingIdentity = (prompt: Prompt) =>
    prompt.embeddingRefs.length
      ? prompt.embeddingRefs.map((ref) => ({
          resource: portableIdentity(ref.resource),
          token: ref.token,
        }))
      : null
  return {
    key,
    label,
    rows: [
      row(
        `${key}.text`,
        label,
        baseline.text === '' ? null : baseline.text,
        authored.text === '' ? null : authored.text,
        baseline.text,
        authored.text,
      ),
      row(
        `${key}.embeddings`,
        'Embedding references',
        embeddingIdentity(baseline),
        embeddingIdentity(authored),
        describeEmbeddings(baseline),
        resourceAfter(describeEmbeddings(authored), availability, current),
        availability,
      ),
    ],
  }
}

function seedValue(current: GenerationSettingsComparisonCurrent): number | undefined {
  const seed =
    current.generationDraft.seed.policy === 'fixed'
      ? current.generationDraft.seed.value
      : current.generationDraft.seed.policy === 'reuse'
        ? current.reuseSeed
        : null
  return seed !== null && Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xff_ff_ff_ff
    ? seed
    : undefined
}
