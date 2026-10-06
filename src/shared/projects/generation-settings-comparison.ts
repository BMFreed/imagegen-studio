import * as v from 'valibot'

import type { AnimaModelBundleView, ModelCatalogItem, ModelVersionView } from '../api.js'
import type {
  IgsAnimaRasterGenerationProvenanceV1,
  IgsIllustriousRasterGenerationProvenanceV1,
  IgsProjectDocumentV1,
  IgsRasterGenerationProvenanceV1,
} from './project-schema.js'

import { ANIMA_SAMPLING_METHOD_LABELS } from './anima-sampling-method.js'
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
  if ('anima' in baseline) {
    return compareAnimaGenerationSettings(baseline, data, current)
  }
  const sections = compareIllustriousGenerationSettings(baseline, data, current)
  if (current.generationDraft.model?.baseModelFamily === 'anima') {
    // The dormant SD pair in an Anima draft is authoring history, not the current execution.
    for (const section of sections) {
      if (section.key === 'sampling') {
        for (const item of section.rows) {
          item.after = 'Not applied to Anima; a native sampling method is used'
          item.status = 'Unavailable'
        }
      }
    }
    sections.push({
      key: 'animaSampling',
      label: 'Anima Sampling',
      rows: [
        unrecordedRow(
          'sampling.animaMethod',
          'Native sampling method',
          animaMethodDescription(current.generationDraft.sampling.animaMethod),
        ),
      ],
    })
  }
  return sections
}

function compareIllustriousGenerationSettings(
  baseline: IgsIllustriousRasterGenerationProvenanceV1['generationConfiguration'],
  data: RasterGenerationData,
  current: GenerationSettingsComparisonCurrent,
): GenerationSettingsComparisonSection[] {
  const draft = current.generationDraft
  const modelAvailability = resourceAvailability(
    [baseline.model, ...(draft.model ? [draft.model] : [])],
    current,
  )
  const recordedLoras = baseline.loras
  const recordedVae = baseline.vae
  const currentVae = draft.model?.baseModelFamily === 'illustrious' ? draft.vae : undefined
  const vaeAvailability =
    recordedVae === undefined || currentVae === undefined
      ? null
      : resourceAvailability(
          [...(recordedVae ? [recordedVae] : []), ...(currentVae ? [currentVae] : [])],
          current,
        )
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
  const currentVaePrecision =
    draft.model?.baseModelFamily === 'illustrious' ? (draft.vaePrecision ?? 'Auto') : undefined
  const recordedStrength =
    'denoisingStrength' in baseline.sampling ? baseline.sampling.denoisingStrength : undefined
  const currentStrength =
    (data.currentMode === 'img2img' || data.currentMode === 'outpaint') &&
    draft.model?.baseModelFamily === 'illustrious'
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
      rows: [
        row(
          'vae.resource',
          'VAE',
          recordedVae === undefined
            ? undefined
            : recordedVae
              ? portableIdentity(recordedVae)
              : null,
          currentVae === undefined ? undefined : currentVae ? portableIdentity(currentVae) : null,
          recordedVae === undefined
            ? UNRECORDED
            : recordedVae
              ? describeResource(recordedVae)
              : 'Embedded',
          resourceAfter(
            currentVae === undefined
              ? 'Unavailable for the current model'
              : currentVae
                ? describeResource(currentVae)
                : 'Embedded',
            vaeAvailability,
            current,
          ),
          vaeAvailability,
        ),
      ],
    },
    {
      key: 'vaePrecision',
      label: 'VAE Precision',
      rows: [
        row(
          'vaePrecision.value',
          'VAE Precision',
          baseline.vaePrecision,
          currentVaePrecision,
          baseline.vaePrecision ?? UNRECORDED,
          currentVaePrecision ??
            (draft.model?.baseModelFamily === 'anima'
              ? 'Unsupported for Anima'
              : 'Unavailable for the current model'),
        ),
      ],
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

function compareAnimaGenerationSettings(
  baseline: IgsAnimaRasterGenerationProvenanceV1['generationConfiguration'],
  data: RasterGenerationData,
  current: GenerationSettingsComparisonCurrent,
): GenerationSettingsComparisonSection[] {
  const draft = current.generationDraft
  const nativeCurrent = draft.model?.baseModelFamily === 'anima'
  const currentVersion =
    draft.model && current.modelCatalog && !current.modelCatalogError
      ? exactBoundVersion(draft.model, current.modelCatalog)
      : null
  const currentBundle = nativeCurrent ? boundAnimaBundle(currentVersion) : null
  const recordedVersion =
    current.modelCatalog && !current.modelCatalogError
      ? exactBoundVersion(baseline.model, current.modelCatalog)
      : null
  const recordedBundle = boundAnimaBundle(recordedVersion)
  const modelAvailability = resourceAvailability(
    [baseline.model, ...(draft.model ? [draft.model] : [])],
    current,
  )
  const loraAvailability = resourceAvailability(
    [...baseline.loras, ...draft.loras]
      .filter((entry) => entry.enabled)
      .map((entry) => entry.resource),
    current,
  )
  const actualSeed = seedValue(current)
  const currentSeed =
    actualSeed !== undefined
      ? String(actualSeed)
      : draft.seed.policy === 'random'
        ? 'Assigned when the next generation is queued'
        : draft.seed.policy === 'reuse'
          ? 'No completed actual seed is available for this Project'
          : 'Not set'
  const cfgRescale = nativeCurrent
    ? draft.cfgRescale === undefined || draft.cfgRescale === 0
      ? 0
      : undefined
    : draft.model?.baseModelFamily === 'illustrious'
      ? (draft.cfgRescale ?? 0)
      : undefined
  const vaePrecision = nativeCurrent
    ? draft.vaePrecision === undefined || draft.vaePrecision === 'Auto'
      ? 'Auto'
      : undefined
    : draft.model?.baseModelFamily === 'illustrious'
      ? (draft.vaePrecision ?? 'Auto')
      : undefined
  const strength =
    (data.currentMode === 'img2img' || data.currentMode === 'outpaint') &&
    (nativeCurrent || draft.model?.baseModelFamily === 'illustrious')
      ? (draft.sampling.denoisingStrength ?? undefined)
      : undefined
  const recordedStrength =
    'denoisingStrength' in baseline.sampling ? baseline.sampling.denoisingStrength : undefined
  const componentRow = (role: 'qwen3Encoder' | 'vae', label: string) => {
    const recorded = baseline.anima[role]
    const after = currentBundle?.[role]
    // Companion rows are hidden from the general catalog. Their owning checkpoint supplies the
    // verified bindings, and each historical local binding still has to match exactly.
    const bound = recordedBundle?.[role]
    const externalVaeUnsupported = nativeCurrent && role === 'vae' && draft.vae !== null
    const availability: Availability =
      externalVaeUnsupported ||
      !bound ||
      !after ||
      recorded.localModelId !== bound.localModelId ||
      recorded.localVersionId !== bound.localVersionId ||
      recorded.sha256 !== bound.sha256 ||
      recorded.byteSize !== bound.byteSize
        ? 'Unavailable'
        : null
    return row(
      `anima.${role}`,
      label,
      componentIdentity(recorded, baseline.anima.architecture),
      after && currentBundle ? componentIdentity(after, currentBundle.architecture) : undefined,
      describeAnimaComponent(recorded),
      externalVaeUnsupported
        ? 'Anima requires its pinned companion VAE; the current external VAE selection is unsupported'
        : after
          ? describeAnimaComponent(after)
          : nativeCurrent
            ? 'The exact installed Anima companion bundle is unavailable'
            : 'Not used by the current model family',
      availability,
    )
  }
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
          'anima.architecture',
          'Model architecture',
          baseline.anima.architecture,
          currentBundle?.architecture,
          baseline.anima.architecture,
          currentBundle?.architecture ?? 'Unavailable for the current model',
        ),
        row(
          'anima.checkpointByteSize',
          'Checkpoint file size',
          baseline.anima.checkpointByteSize,
          currentBundle?.checkpointByteSize,
          `${baseline.anima.checkpointByteSize} bytes`,
          currentBundle ? `${currentBundle.checkpointByteSize} bytes` : 'Unavailable',
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
          loraStackIdentity(baseline.loras),
          loraStackIdentity(draft.loras),
          describeLoraStack(baseline.loras),
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
      label: 'Anima Sampling',
      rows: [
        row(
          'sampling.animaMethod',
          'Native sampling method',
          baseline.sampling.animaMethod,
          nativeCurrent ? draft.sampling.animaMethod : undefined,
          animaMethodDescription(baseline.sampling.animaMethod),
          nativeCurrent
            ? animaMethodDescription(draft.sampling.animaMethod)
            : 'Not used by the current model family',
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
          draft.sampling.steps === null ? 'Not set' : String(draft.sampling.steps),
        ),
        row(
          'guidance.cfg',
          'CFG',
          baseline.sampling.cfgScale,
          draft.sampling.cfgScale,
          String(baseline.sampling.cfgScale),
          draft.sampling.cfgScale === null ? 'Not set' : String(draft.sampling.cfgScale),
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
          cfgRescale,
          baseline.cfgRescale === undefined ? UNRECORDED : String(baseline.cfgRescale),
          cfgRescale === undefined
            ? nativeCurrent
              ? 'Nonzero CFG Rescale is unsupported for Anima'
              : 'Unavailable for the current model'
            : String(cfgRescale),
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
          strength,
          recordedStrength === undefined ? UNRECORDED : String(recordedStrength),
          strength !== undefined
            ? String(strength)
            : data.currentMode === 'txt2img'
              ? 'Not applied to the current raster input'
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
          baseline.sampling.seedBehavior,
          getEffectiveDynamicPromptSettings(draft.dynamicPrompt).seedBehavior,
        ),
      ],
    },
    {
      key: 'textEncoder',
      label: 'Text encoder',
      rows: [componentRow('qwen3Encoder', 'Qwen3 encoder')],
    },
    { key: 'vae', label: 'VAE', rows: [componentRow('vae', 'Anima VAE')] },
    {
      key: 'vaePrecision',
      label: 'VAE Precision',
      rows: [
        row(
          'vaePrecision.value',
          'VAE Precision',
          baseline.vaePrecision,
          vaePrecision,
          baseline.vaePrecision ?? UNRECORDED,
          vaePrecision ??
            (nativeCurrent
              ? 'Manual VAE precision is unsupported for Anima'
              : 'Unavailable for the current model'),
        ),
      ],
    },
    {
      key: 'clipSkip',
      label: 'CLIP Skip',
      rows: [
        unrecordedRow(
          'clipSkip.value',
          'CLIP Skip',
          nativeCurrent
            ? 'Unsupported for Anima'
            : draft.clipSkip === undefined
              ? 'Not set'
              : String(draft.clipSkip),
        ),
      ],
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

function animaMethodDescription(
  method: keyof typeof ANIMA_SAMPLING_METHOD_LABELS | undefined,
): string {
  return method === undefined ? 'Not set' : ANIMA_SAMPLING_METHOD_LABELS[method]
}

function validAnimaBundle(bundle: AnimaModelBundleView | undefined): AnimaModelBundleView | null {
  const validSize = (size: number) => Number.isSafeInteger(size) && size > 0
  const validComponent = (value: AnimaModelBundleView['vae']) =>
    value &&
    validSize(value.byteSize) &&
    /^[a-f0-9]{64}$/.test(value.sha256) &&
    typeof value.localModelId === 'string' &&
    value.localModelId.length > 0 &&
    typeof value.localVersionId === 'string' &&
    value.localVersionId.length > 0
  return bundle?.architecture === 'anima-base-1.0' &&
    validSize(bundle.checkpointByteSize) &&
    validComponent(bundle.qwen3Encoder) &&
    validComponent(bundle.vae)
    ? bundle
    : null
}

function boundAnimaBundle(version: ModelVersionView | null): AnimaModelBundleView | null {
  const bundle = validAnimaBundle(version?.anima)
  return version?.baseModelFamily === 'anima' &&
    version.predictionType === null &&
    version.dependencyIssues.length === 0 &&
    bundle &&
    bundle.checkpointByteSize === version.fileSizeBytes
    ? bundle
    : null
}

function componentIdentity(component: AnimaModelBundleView['vae'], architecture: string) {
  return { architecture, byteSize: component.byteSize, sha256: component.sha256 }
}

function describeAnimaComponent(component: AnimaModelBundleView['vae']): string {
  return `SHA-256 ${component.sha256}\n${component.byteSize} bytes`
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
