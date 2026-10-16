import * as v from 'valibot'

import {
  AlphaOutpaintContributionAlpha8V1Schema,
  AlphaOutpaintIdentityV1Schema,
} from './alpha-outpaint.js'
import { ANIMA_SAMPLING_METHOD_KEYS } from './anima-sampling-method.js'
import { IGS_SRGB_ICC_SHA256 } from './color-profile.js'
import {
  GenerationDynamicPromptSettingsSchema,
  getEffectiveDynamicPromptSettings,
} from './generation-dynamic-settings.js'
import { IGS_GENERATION_PNG_MAX_BYTES } from './generation-image-limits.js'
import { IllustriousNoiseProfileV1Schema } from './illustrious-noise-profile.js'
import { ProjectMaskSettingsSchema } from './project-mask-settings.js'
import {
  PROJECT_MASK_MAX_COORDINATE,
  PROJECT_MASK_MAX_DIMENSION,
  PROJECT_MASK_MAX_PIXELS,
  PROJECT_MASK_MAX_PNG_BYTES,
} from './project-mask.js'
import { SmartPatchCoherenceSettingsSchema } from './smart-patch-coherence-settings.js'

export { IGS_GENERATION_PNG_MAX_BYTES } from './generation-image-limits.js'

/** An internal package marker; it does not claim IANA registration. */
export const IGS_MIMETYPE = 'application/vnd.imagegen-studio.project+zip'
export const IGS_SCHEMA_VERSION = 1

/**
 * Defensive format ceilings, not measured generation/runtime capacity. The ZIP reader must also
 * enforce these against actual streamed bytes. Revisit them with real large-project fixtures before
 * release; model-specific generation limits are separate from portable document limits.
 */
export const IGS_SAFETY_CEILINGS = {
  archiveEntries: 10_000,
  archiveUncompressedBytes: 32 * 1024 * 1024 * 1024,
  coordinateMagnitude: PROJECT_MASK_MAX_COORDINATE,
  iccProfileBytes: 4 * 1024 * 1024,
  manifestJsonBytes: 4 * 1024 * 1024,
  memberBytes: 8 * 1024 * 1024 * 1024,
  previewCoordinateMagnitude: 2_200_000_000,
  previewExtent: 4_400_000_000,
  projectJsonBytes: 16 * 1024 * 1024,
  rasterDimension: 32_768,
  rotationDegrees: 360,
  scaleMagnitude: 1024,
  textBytes: 1024 * 1024,
  titleBytes: 1024,
} as const

export const IGS_REQUIRED_MEMBER_PATHS = [
  'project.json',
  'preview/thumbnail.webp',
  'preview/merged.png',
] as const
const REQUIRED_MEMBER_PATH_SET: ReadonlySet<string> = new Set(IGS_REQUIRED_MEMBER_PATHS)

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const LAYER_ASSET_PATH_PATTERN =
  /^assets\/layers\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|webp)$/
const ICC_PROFILE_PATH_PATTERN = /^assets\/profiles\/([a-f0-9]{64})\.icc$/
const MASK_ASSET_PATH_PATTERN =
  /^assets\/masks\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-f0-9]{64}\.png$/

const UuidSchema = v.pipe(v.string(), v.uuid())
const Sha256Schema = v.pipe(v.string(), v.regex(SHA256_PATTERN))
const NonemptyTextSchema = v.pipe(
  v.string(),
  v.nonEmpty(),
  v.maxBytes(IGS_SAFETY_CEILINGS.titleBytes),
  v.check((value) => value.trim().length > 0, 'Text cannot be only whitespace.'),
)
const PromptTextSchema = v.pipe(v.string(), v.maxBytes(IGS_SAFETY_CEILINGS.textBytes))
const SafeUIntSchema = v.pipe(v.number(), v.finite(), v.safeInteger(), v.minValue(0))
const PositiveIntegerSchema = v.pipe(v.number(), v.finite(), v.safeInteger(), v.minValue(1))
const UInt32Schema = v.pipe(SafeUIntSchema, v.maxValue(0xff_ff_ff_ff))
const FiniteNumberSchema = v.pipe(v.number(), v.finite())
const UnitIntervalSchema = v.pipe(FiniteNumberSchema, v.minValue(0), v.maxValue(1))
const BoundedDimensionSchema = v.pipe(
  PositiveIntegerSchema,
  v.maxValue(IGS_SAFETY_CEILINGS.rasterDimension),
)
const BoundedCoordinateSchema = v.pipe(
  FiniteNumberSchema,
  v.minValue(-IGS_SAFETY_CEILINGS.coordinateMagnitude),
  v.maxValue(IGS_SAFETY_CEILINGS.coordinateMagnitude),
)
const BoundedScaleSchema = v.pipe(
  FiniteNumberSchema,
  v.minValue(-IGS_SAFETY_CEILINGS.scaleMagnitude),
  v.maxValue(IGS_SAFETY_CEILINGS.scaleMagnitude),
  v.check((scale) => scale !== 0, 'A raster transform scale cannot be zero.'),
)

const RectSchema = v.strictObject({
  height: BoundedDimensionSchema,
  width: BoundedDimensionSchema,
  x: v.pipe(BoundedCoordinateSchema, v.safeInteger()),
  y: v.pipe(BoundedCoordinateSchema, v.safeInteger()),
})

/** World-space coverage of a downsampled preview, independent of output bitmap dimensions. */
const PreviewRectSchema = v.pipe(
  v.strictObject({
    height: v.pipe(PositiveIntegerSchema, v.maxValue(IGS_SAFETY_CEILINGS.previewExtent)),
    width: v.pipe(PositiveIntegerSchema, v.maxValue(IGS_SAFETY_CEILINGS.previewExtent)),
    x: v.pipe(
      v.number(),
      v.safeInteger(),
      v.minValue(-IGS_SAFETY_CEILINGS.previewCoordinateMagnitude),
      v.maxValue(IGS_SAFETY_CEILINGS.previewCoordinateMagnitude),
    ),
    y: v.pipe(
      v.number(),
      v.safeInteger(),
      v.minValue(-IGS_SAFETY_CEILINGS.previewCoordinateMagnitude),
      v.maxValue(IGS_SAFETY_CEILINGS.previewCoordinateMagnitude),
    ),
  }),
  v.check(
    ({ height, width, x, y }) =>
      x + width <= IGS_SAFETY_CEILINGS.previewCoordinateMagnitude &&
      y + height <= IGS_SAFETY_CEILINGS.previewCoordinateMagnitude,
    'Preview rect exceeds the supported world-space range.',
  ),
)

const BaseModelFamilySchema = v.nullable(v.picklist(['anima', 'illustrious']))
const PredictionTypeSchema = v.nullable(v.picklist(['epsilon', 'sample', 'v_prediction']))
const ResourceKindSchema = v.picklist(['checkpoint', 'embedding', 'lora', 'vae'])

const ExactResourceRefSchema = v.strictObject({
  baseModelFamily: BaseModelFamilySchema,
  civitaiFileId: v.nullable(SafeUIntSchema),
  civitaiModelId: v.nullable(SafeUIntSchema),
  civitaiVersionId: v.nullable(SafeUIntSchema),
  displayName: NonemptyTextSchema,
  fileSha256: Sha256Schema,
  kind: ResourceKindSchema,
  localModelId: NonemptyTextSchema,
  localVersionId: NonemptyTextSchema,
  predictionType: PredictionTypeSchema,
  versionName: NonemptyTextSchema,
})

const EmbeddingRefSchema = v.strictObject({
  resource: ExactResourceRefSchema,
  token: NonemptyTextSchema,
})

const PromptSchema = v.strictObject({
  embeddingRefs: v.pipe(
    v.array(EmbeddingRefSchema),
    v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries),
  ),
  text: PromptTextSchema,
})

const LoraSchema = v.strictObject({
  enabled: v.boolean(),
  resource: ExactResourceRefSchema,
  weight: FiniteNumberSchema,
})

/** Copied authored configuration; disabled missing references remain portable authoring data. */
export const RecordedGenerationLoraStackSchema = v.pipe(
  v.array(
    v.strictObject({
      ...LoraSchema.entries,
      resource: v.strictObject({ ...ExactResourceRefSchema.entries, kind: v.literal('lora') }),
    }),
  ),
  v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries),
  v.check((stack) =>
    stack.every((entry) => !entry.enabled || entry.resource.baseModelFamily === 'illustrious'),
  ),
)

const GenerationDimensionSchema = v.pipe(
  BoundedDimensionSchema,
  v.minValue(8),
  v.maxValue(2048),
  v.check((dimension) => dimension % 8 === 0, 'Generation size must be divisible by 8.'),
)
const IsoUtcTimestampSchema = v.pipe(
  v.string(),
  v.check(
    (timestamp) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp) &&
      Number.isFinite(Date.parse(timestamp)) &&
      new Date(timestamp).toISOString() === timestamp,
    'Expected a canonical UTC timestamp.',
  ),
)
const PortableResourceRefSchema = v.strictObject({
  ...ExactResourceRefSchema.entries,
  localModelId: UuidSchema,
  localVersionId: UuidSchema,
})
const IllustriousCheckpointRefSchema = v.strictObject({
  ...PortableResourceRefSchema.entries,
  baseModelFamily: v.literal('illustrious'),
  kind: v.literal('checkpoint'),
  predictionType: v.picklist(['epsilon', 'sample', 'v_prediction']),
})
const IllustriousVaeRefSchema = v.strictObject({
  ...PortableResourceRefSchema.entries,
  baseModelFamily: v.literal('illustrious'),
  kind: v.literal('vae'),
  predictionType: v.null(),
})
const ProvenanceEmbeddingRefSchema = v.strictObject({
  resource: v.strictObject({ ...PortableResourceRefSchema.entries, kind: v.literal('embedding') }),
  token: NonemptyTextSchema,
})
const ProvenancePromptSchema = v.strictObject({
  embeddingRefs: v.pipe(
    v.array(ProvenanceEmbeddingRefSchema),
    v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries),
  ),
  text: PromptTextSchema,
})

const Txt2ImgRasterGenerationConfigurationV1Schema = v.strictObject({
  cfgRescale: v.optional(v.pipe(FiniteNumberSchema, v.minValue(0), v.maxValue(0.99))),
  loras: v.optional(RecordedGenerationLoraStackSchema),
  mode: v.literal('txt2img'),
  model: IllustriousCheckpointRefSchema,
  negativePrompt: ProvenancePromptSchema,
  positivePrompt: ProvenancePromptSchema,
  sampling: v.strictObject({
    actualSeed: UInt32Schema,
    cfgScale: v.pipe(FiniteNumberSchema, v.minValue(1), v.maxValue(30)),
    invokeScheduler: v.picklist([
      'dpmpp_2m_k',
      'dpmpp_2m',
      'euler_a',
      'euler',
      'dpmpp_sde_k',
      'dpmpp_sde',
    ]),
    noiseProfile: v.optional(IllustriousNoiseProfileV1Schema),
    requestedSeedPolicy: v.picklist(['fixed', 'random', 'reuse']),
    sampler: NonemptyTextSchema,
    scheduler: NonemptyTextSchema,
    seedBehavior: v.optional(v.picklist(['per-iteration', 'per-prompt'])),
    steps: v.pipe(PositiveIntegerSchema, v.maxValue(200)),
  }),
  size: v.strictObject({ height: GenerationDimensionSchema, width: GenerationDimensionSchema }),
  vae: v.optional(v.nullable(IllustriousVaeRefSchema)),
  vaePrecision: v.optional(v.picklist(['Auto', 'FP16', 'FP32'])),
})

const Img2ImgRasterGenerationConfigurationV1Schema = v.strictObject({
  ...Txt2ImgRasterGenerationConfigurationV1Schema.entries,
  mode: v.literal('img2img'),
  sampling: v.strictObject({
    ...Txt2ImgRasterGenerationConfigurationV1Schema.entries.sampling.entries,
    denoisingStrength: UnitIntervalSchema,
  }),
})
const OutpaintRasterGenerationConfigurationV1Schema = v.strictObject({
  ...Img2ImgRasterGenerationConfigurationV1Schema.entries,
  mode: v.literal('outpaint'),
})
const IllustriousRasterGenerationConfigurationV1Schema = v.variant('mode', [
  Txt2ImgRasterGenerationConfigurationV1Schema,
  Img2ImgRasterGenerationConfigurationV1Schema,
  OutpaintRasterGenerationConfigurationV1Schema,
])

const AnimaCheckpointRefSchema = v.strictObject({
  ...PortableResourceRefSchema.entries,
  baseModelFamily: v.literal('anima'),
  kind: v.literal('checkpoint'),
  predictionType: v.null(),
})
/** Registry bindings are advisory; bytes and SHA-256 carry the portable component identity. */
const AnimaComponentSnapshotSchema = v.strictObject({
  byteSize: PositiveIntegerSchema,
  localModelId: UuidSchema,
  localVersionId: UuidSchema,
  sha256: Sha256Schema,
})
const AnimaRecordedLoraStackSchema = v.pipe(
  v.array(
    v.strictObject({
      ...LoraSchema.entries,
      resource: v.strictObject({ ...ExactResourceRefSchema.entries, kind: v.literal('lora') }),
    }),
  ),
  v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries),
  v.check((stack) =>
    stack.every(
      (entry) =>
        !entry.enabled ||
        (entry.resource.baseModelFamily === 'anima' && entry.resource.predictionType === null),
    ),
  ),
)
const AnimaRecordedPromptSchema = v.strictObject({
  embeddingRefs: v.pipe(v.array(ProvenanceEmbeddingRefSchema), v.maxLength(0)),
  text: PromptTextSchema,
})
const AnimaRecordedSizeSchema = v.pipe(
  v.strictObject({
    height: v.pipe(GenerationDimensionSchema, v.minValue(64)),
    width: v.pipe(GenerationDimensionSchema, v.minValue(64)),
  }),
  v.check(({ height, width }) => height * width <= 4_000_000),
)
const Txt2ImgAnimaRasterGenerationConfigurationV1Schema = v.strictObject({
  anima: v.strictObject({
    architecture: v.literal('anima-base-1.0'),
    checkpointByteSize: PositiveIntegerSchema,
    qwen3Encoder: AnimaComponentSnapshotSchema,
    vae: AnimaComponentSnapshotSchema,
  }),
  cfgRescale: v.optional(v.literal(0)),
  loras: AnimaRecordedLoraStackSchema,
  mode: v.literal('txt2img'),
  model: AnimaCheckpointRefSchema,
  negativePrompt: AnimaRecordedPromptSchema,
  positivePrompt: AnimaRecordedPromptSchema,
  sampling: v.strictObject({
    actualSeed: UInt32Schema,
    animaMethod: v.picklist(ANIMA_SAMPLING_METHOD_KEYS),
    cfgScale: v.pipe(FiniteNumberSchema, v.minValue(1), v.maxValue(30)),
    requestedSeedPolicy: v.picklist(['fixed', 'random', 'reuse']),
    seedBehavior: v.picklist(['per-iteration', 'per-prompt']),
    steps: v.pipe(PositiveIntegerSchema, v.maxValue(200)),
  }),
  size: AnimaRecordedSizeSchema,
  vaePrecision: v.optional(v.literal('Auto')),
})
const Img2ImgAnimaRasterGenerationConfigurationV1Schema = v.strictObject({
  ...Txt2ImgAnimaRasterGenerationConfigurationV1Schema.entries,
  mode: v.literal('img2img'),
  sampling: v.strictObject({
    ...Txt2ImgAnimaRasterGenerationConfigurationV1Schema.entries.sampling.entries,
    denoisingStrength: UnitIntervalSchema,
  }),
})
const OutpaintAnimaRasterGenerationConfigurationV1Schema = v.strictObject({
  ...Img2ImgAnimaRasterGenerationConfigurationV1Schema.entries,
  mode: v.literal('outpaint'),
})
const AnimaRasterGenerationConfigurationV1Schema = v.variant('mode', [
  Txt2ImgAnimaRasterGenerationConfigurationV1Schema,
  Img2ImgAnimaRasterGenerationConfigurationV1Schema,
  OutpaintAnimaRasterGenerationConfigurationV1Schema,
])
const RasterGenerationConfigurationV1Schema = v.union([
  IllustriousRasterGenerationConfigurationV1Schema,
  AnimaRasterGenerationConfigurationV1Schema,
])

/**
 * The first accepted-result format records the exact supported Illustrious txt2img run. The owning
 * Raster Layer ID is the accepted-result identity; candidateId records staging origin.
 */
const Txt2ImgRasterGenerationProvenanceV1Schema = v.strictObject({
  executionResultContext: v.strictObject({
    acceptedAt: IsoUtcTimestampSchema,
    candidateId: UuidSchema,
    completedAt: IsoUtcTimestampSchema,
    output: v.strictObject({
      byteSize: v.pipe(PositiveIntegerSchema, v.maxValue(IGS_GENERATION_PNG_MAX_BYTES)),
      colorSpace: v.literal('srgb'),
      format: v.literal('png'),
      height: GenerationDimensionSchema,
      iccSha256: v.literal(IGS_SRGB_ICC_SHA256),
      sha256: Sha256Schema,
      width: GenerationDimensionSchema,
    }),
    queueItemId: UuidSchema,
  }),
  generationConfiguration: Txt2ImgRasterGenerationConfigurationV1Schema,
  kind: v.literal('illustrious-txt2img'),
  layerSourceContext: v.strictObject({
    bbox: v.strictObject({
      height: GenerationDimensionSchema,
      width: GenerationDimensionSchema,
      x: v.pipe(BoundedCoordinateSchema, v.safeInteger()),
      y: v.pipe(BoundedCoordinateSchema, v.safeInteger()),
    }),
    sourceDocumentId: UuidSchema,
    sourceDocumentRevision: UuidSchema,
    sourceTargetSha256: Sha256Schema,
  }),
  schemaVersion: v.literal(1),
})
const Img2ImgRasterGenerationProvenanceV1Schema = v.strictObject({
  ...Txt2ImgRasterGenerationProvenanceV1Schema.entries,
  generationConfiguration: Img2ImgRasterGenerationConfigurationV1Schema,
  kind: v.literal('illustrious-img2img'),
})
const Txt2ImgAnimaRasterGenerationProvenanceV1Schema = v.strictObject({
  ...Txt2ImgRasterGenerationProvenanceV1Schema.entries,
  generationConfiguration: Txt2ImgAnimaRasterGenerationConfigurationV1Schema,
  kind: v.literal('anima-txt2img'),
})
const Img2ImgAnimaRasterGenerationProvenanceV1Schema = v.strictObject({
  ...Txt2ImgRasterGenerationProvenanceV1Schema.entries,
  generationConfiguration: Img2ImgAnimaRasterGenerationConfigurationV1Schema,
  kind: v.literal('anima-img2img'),
})
const OutpaintExecutionResultContextV1Schema = v.strictObject({
  ...Txt2ImgRasterGenerationProvenanceV1Schema.entries.executionResultContext.entries,
  output: v.strictObject({
    ...Txt2ImgRasterGenerationProvenanceV1Schema.entries.executionResultContext.entries.output
      .entries,
    contributionAlpha8: AlphaOutpaintContributionAlpha8V1Schema,
    outputMode: v.literal('contribution'),
  }),
})
const OutpaintLayerSourceContextV1Schema = v.strictObject({
  ...Txt2ImgRasterGenerationProvenanceV1Schema.entries.layerSourceContext.entries,
  outpaint: AlphaOutpaintIdentityV1Schema,
})
const OutpaintRasterGenerationProvenanceV1Schema = v.strictObject({
  ...Txt2ImgRasterGenerationProvenanceV1Schema.entries,
  executionResultContext: OutpaintExecutionResultContextV1Schema,
  generationConfiguration: OutpaintRasterGenerationConfigurationV1Schema,
  kind: v.literal('illustrious-outpaint'),
  layerSourceContext: OutpaintLayerSourceContextV1Schema,
})
const OutpaintAnimaRasterGenerationProvenanceV1Schema = v.strictObject({
  ...OutpaintRasterGenerationProvenanceV1Schema.entries,
  generationConfiguration: OutpaintAnimaRasterGenerationConfigurationV1Schema,
  kind: v.literal('anima-outpaint'),
})
const RasterGenerationProvenanceV1Schema = v.pipe(
  v.variant('kind', [
    Txt2ImgRasterGenerationProvenanceV1Schema,
    Img2ImgRasterGenerationProvenanceV1Schema,
    Txt2ImgAnimaRasterGenerationProvenanceV1Schema,
    Img2ImgAnimaRasterGenerationProvenanceV1Schema,
    OutpaintRasterGenerationProvenanceV1Schema,
    OutpaintAnimaRasterGenerationProvenanceV1Schema,
  ]),
  v.check(
    ({ executionResultContext, generationConfiguration, layerSourceContext }) =>
      generationConfiguration.size.width === layerSourceContext.bbox.width &&
      generationConfiguration.size.height === layerSourceContext.bbox.height &&
      generationConfiguration.size.width === executionResultContext.output.width &&
      generationConfiguration.size.height === executionResultContext.output.height,
    'The accepted result size must match its frozen bbox and output image.',
  ),
  v.check((value) => {
    if (value.kind !== 'illustrious-outpaint' && value.kind !== 'anima-outpaint') {
      return true
    }
    const { bbox, outpaint, sourceTargetSha256 } = value.layerSourceContext
    const { contributionAlpha8 } = value.executionResultContext.output
    return (
      outpaint.sourceTarget.sha256 === sourceTargetSha256 &&
      outpaint.sourceTarget.width === bbox.width &&
      outpaint.sourceTarget.height === bbox.height &&
      contributionAlpha8.width === bbox.width &&
      contributionAlpha8.height === bbox.height
    )
  }, 'Outpaint input and contribution identities must match their frozen source and bbox.'),
)

const GenerationDraftSchema = v.strictObject({
  cfgRescale: v.optional(UnitIntervalSchema),
  clipSkip: v.optional(PositiveIntegerSchema),
  dynamicPrompt: v.optional(GenerationDynamicPromptSettingsSchema),
  loras: v.pipe(v.array(LoraSchema), v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries)),
  model: v.nullable(ExactResourceRefSchema),
  negativePrompt: PromptSchema,
  positivePrompt: PromptSchema,
  sampling: v.strictObject({
    animaMethod: v.optional(v.picklist(ANIMA_SAMPLING_METHOD_KEYS)),
    cfgScale: v.nullable(v.pipe(FiniteNumberSchema, v.minValue(0))),
    denoisingStrength: v.nullable(UnitIntervalSchema),
    sampler: v.nullable(NonemptyTextSchema),
    scheduler: v.nullable(NonemptyTextSchema),
    steps: v.nullable(PositiveIntegerSchema),
  }),
  seed: v.strictObject({
    policy: v.picklist(['fixed', 'random', 'reuse']),
    value: v.nullable(UInt32Schema),
  }),
  vae: v.nullable(ExactResourceRefSchema),
  vaePrecision: v.optional(v.picklist(['Auto', 'FP16', 'FP32'])),
})

const MemberRefSchema = v.strictObject({
  bytes: v.pipe(PositiveIntegerSchema, v.maxValue(IGS_SAFETY_CEILINGS.memberBytes)),
  path: v.string(),
  sha256: Sha256Schema,
})

const RasterLayerSchema = v.strictObject({
  asset: v.strictObject({
    ...MemberRefSchema.entries,
    height: BoundedDimensionSchema,
    width: BoundedDimensionSchema,
  }),
  blendMode: v.picklist(['normal', 'multiply', 'screen', 'overlay']),
  generationProvenance: v.optional(RasterGenerationProvenanceV1Schema),
  id: UuidSchema,
  kind: v.literal('raster'),
  locked: v.boolean(),
  name: NonemptyTextSchema,
  opacity: UnitIntervalSchema,
  sourceIccProfile: v.optional(MemberRefSchema),
  transform: v.strictObject({
    rotationDegrees: v.pipe(
      FiniteNumberSchema,
      v.minValue(-IGS_SAFETY_CEILINGS.rotationDegrees),
      v.maxValue(IGS_SAFETY_CEILINGS.rotationDegrees),
    ),
    scaleX: BoundedScaleSchema,
    scaleY: BoundedScaleSchema,
    x: BoundedCoordinateSchema,
    y: BoundedCoordinateSchema,
  }),
  visible: v.boolean(),
})

const SmartPatchMaskSchema = v.union([
  v.strictObject({ asset: v.null(), id: UuidSchema, revision: SafeUIntSchema }),
  v.pipe(
    v.strictObject({
      asset: v.strictObject({
        bytes: v.pipe(PositiveIntegerSchema, v.maxValue(PROJECT_MASK_MAX_PNG_BYTES)),
        height: v.pipe(PositiveIntegerSchema, v.maxValue(PROJECT_MASK_MAX_DIMENSION)),
        path: v.pipe(v.string(), v.regex(MASK_ASSET_PATH_PATTERN)),
        sha256: Sha256Schema,
        width: v.pipe(PositiveIntegerSchema, v.maxValue(PROJECT_MASK_MAX_DIMENSION)),
      }),
      bounds: RectSchema,
      id: UuidSchema,
      revision: PositiveIntegerSchema,
    }),
    v.check(
      (mask) =>
        mask.asset.path === `assets/masks/${mask.id}/${mask.asset.sha256}.png` &&
        mask.asset.width === mask.bounds.width &&
        mask.asset.height === mask.bounds.height &&
        mask.asset.width * mask.asset.height <= PROJECT_MASK_MAX_PIXELS &&
        Math.abs(mask.bounds.x + mask.bounds.width) <= PROJECT_MASK_MAX_COORDINATE &&
        Math.abs(mask.bounds.y + mask.bounds.height) <= PROJECT_MASK_MAX_COORDINATE,
      'The owned mask geometry or asset reference is invalid.',
    ),
  ),
])

const SmartPatchWorldDimensionSchema = v.pipe(PositiveIntegerSchema, v.maxValue(2048))
const SmartPatchWorldSizeEntries = {
  height: SmartPatchWorldDimensionSchema,
  width: SmartPatchWorldDimensionSchema,
}
const SmartPatchWorldRectSchema = v.pipe(
  v.strictObject({
    ...SmartPatchWorldSizeEntries,
    x: v.pipe(BoundedCoordinateSchema, v.safeInteger()),
    y: v.pipe(BoundedCoordinateSchema, v.safeInteger()),
  }),
  v.check(({ height, width }) => height * width <= 4_000_000),
)
const SmartPatchInternalResolutionSchema = v.pipe(
  v.strictObject({ height: GenerationDimensionSchema, width: GenerationDimensionSchema }),
  v.check(({ height, width }) => height * width <= 4_000_000),
)
const SmartPatchPreparedImageIdentityV1Schema = v.strictObject({
  ...SmartPatchWorldSizeEntries,
  byteSize: v.pipe(PositiveIntegerSchema, v.maxValue(IGS_GENERATION_PNG_MAX_BYTES)),
  sha256: Sha256Schema,
})
const SmartPatchContributionAlpha8V1Schema = v.pipe(
  v.strictObject({
    ...SmartPatchWorldSizeEntries,
    byteSize: v.pipe(PositiveIntegerSchema, v.maxValue(4_000_000)),
    sha256: Sha256Schema,
  }),
  v.check(({ byteSize, height, width }) => byteSize === height * width),
)

/** Reusable settings omit both world bbox and internal resolution; neither is preset Size. */
const SmartPatchIllustriousTxt2ImgConfigurationV1Schema = v.omit(
  Txt2ImgRasterGenerationConfigurationV1Schema,
  ['size'],
)
const SmartPatchIllustriousImg2ImgConfigurationV1Schema = v.omit(
  Img2ImgRasterGenerationConfigurationV1Schema,
  ['size'],
)
const SmartPatchIllustriousConfigurationV1Schema = v.variant('mode', [
  SmartPatchIllustriousTxt2ImgConfigurationV1Schema,
  SmartPatchIllustriousImg2ImgConfigurationV1Schema,
  v.strictObject({
    ...SmartPatchIllustriousImg2ImgConfigurationV1Schema.entries,
    mode: v.literal('inpaint'),
  }),
  v.strictObject({
    ...SmartPatchIllustriousImg2ImgConfigurationV1Schema.entries,
    mode: v.literal('outpaint'),
  }),
])
const SmartPatchAnimaComponentV1Schema = v.strictObject({
  byteSize: PositiveIntegerSchema,
  sha256: Sha256Schema,
})
const SmartPatchAnimaTxt2ImgConfigurationV1Schema = v.strictObject({
  ...v.omit(Txt2ImgAnimaRasterGenerationConfigurationV1Schema, ['size']).entries,
  anima: v.strictObject({
    architecture: v.literal('anima-base-1.0'),
    checkpointByteSize: PositiveIntegerSchema,
    qwen3Encoder: SmartPatchAnimaComponentV1Schema,
    vae: SmartPatchAnimaComponentV1Schema,
  }),
  sampling: v.strictObject({
    ...Txt2ImgAnimaRasterGenerationConfigurationV1Schema.entries.sampling.entries,
    // A concrete private queue item does not yet record the planner's actual seed behavior.
    seedBehavior: v.optional(v.picklist(['per-iteration', 'per-prompt'])),
  }),
})
const SmartPatchAnimaImg2ImgConfigurationV1Schema = v.strictObject({
  ...SmartPatchAnimaTxt2ImgConfigurationV1Schema.entries,
  mode: v.literal('img2img'),
  sampling: v.strictObject({
    ...SmartPatchAnimaTxt2ImgConfigurationV1Schema.entries.sampling.entries,
    denoisingStrength: UnitIntervalSchema,
  }),
})
const SmartPatchAnimaConfigurationV1Schema = v.variant('mode', [
  SmartPatchAnimaTxt2ImgConfigurationV1Schema,
  SmartPatchAnimaImg2ImgConfigurationV1Schema,
  v.strictObject({
    ...SmartPatchAnimaImg2ImgConfigurationV1Schema.entries,
    mode: v.literal('inpaint'),
  }),
  v.strictObject({
    ...SmartPatchAnimaImg2ImgConfigurationV1Schema.entries,
    mode: v.literal('outpaint'),
  }),
])
const SmartPatchProvenanceCommonEntries = {
  executionResultContext: v.strictObject({
    acceptedAt: IsoUtcTimestampSchema,
    candidateId: UuidSchema,
    completedAt: IsoUtcTimestampSchema,
    output: v.strictObject({
      ...SmartPatchWorldSizeEntries,
      byteSize: v.pipe(PositiveIntegerSchema, v.maxValue(IGS_GENERATION_PNG_MAX_BYTES)),
      colorSpace: v.literal('srgb'),
      contributionAlpha8: SmartPatchContributionAlpha8V1Schema,
      format: v.literal('png'),
      iccSha256: v.literal(IGS_SRGB_ICC_SHA256),
      outputMode: v.literal('contribution'),
      sha256: Sha256Schema,
    }),
    queueItemId: UuidSchema,
  }),
  layerSourceContext: v.strictObject({
    bbox: SmartPatchWorldRectSchema,
    coherenceSettings: SmartPatchCoherenceSettingsSchema,
    generationDraft: GenerationDraftSchema,
    internalResolution: SmartPatchInternalResolutionSchema,
    layerId: UuidSchema,
    mask: SmartPatchMaskSchema,
    maskBlur: ProjectMaskSettingsSchema.entries.blur,
    preparedInputs: v.strictObject({
      finalContributionMask: SmartPatchPreparedImageIdentityV1Schema,
      latentKeepMask: SmartPatchPreparedImageIdentityV1Schema,
      modelSource: v.nullable(SmartPatchPreparedImageIdentityV1Schema),
    }),
    sourceDocumentId: UuidSchema,
    sourceDocumentRevision: UuidSchema,
    sourceLayerIds: v.pipe(
      v.array(UuidSchema),
      v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries),
      v.check((ids) => new Set(ids).size === ids.length),
    ),
    sourceTarget: SmartPatchPreparedImageIdentityV1Schema,
  }),
  schemaVersion: v.literal(1),
}

/** Immutable portable provenance; authored Patch inputs may subsequently change. */
export const SmartPatchGenerationProvenanceV1Schema = v.pipe(
  v.variant('kind', [
    v.strictObject({
      ...SmartPatchProvenanceCommonEntries,
      generationConfiguration: SmartPatchIllustriousConfigurationV1Schema,
      kind: v.literal('illustrious-smart-patch'),
    }),
    v.strictObject({
      ...SmartPatchProvenanceCommonEntries,
      generationConfiguration: SmartPatchAnimaConfigurationV1Schema,
      kind: v.literal('anima-smart-patch'),
    }),
  ]),
  v.check((value) => {
    const source = value.layerSourceContext
    const execution = value.executionResultContext
    const output = execution.output
    const prepared = source.preparedInputs
    const internal = source.internalResolution
    const family = value.kind === 'anima-smart-patch' ? 'anima' : 'illustrious'
    const model = source.generationDraft.model
    return (
      source.bbox.width === source.sourceTarget.width &&
      source.bbox.height === source.sourceTarget.height &&
      source.bbox.width === output.width &&
      source.bbox.height === output.height &&
      source.bbox.width === output.contributionAlpha8.width &&
      source.bbox.height === output.contributionAlpha8.height &&
      source.bbox.width === prepared.finalContributionMask.width &&
      source.bbox.height === prepared.finalContributionMask.height &&
      internal.width === prepared.latentKeepMask.width * 8 &&
      internal.height === prepared.latentKeepMask.height * 8 &&
      (value.generationConfiguration.mode === 'txt2img') === (prepared.modelSource === null) &&
      (prepared.modelSource === null ||
        (internal.width === prepared.modelSource.width &&
          internal.height === prepared.modelSource.height)) &&
      execution.candidateId === execution.queueItemId &&
      source.layerId !== source.mask.id &&
      !source.sourceLayerIds.includes(source.layerId) &&
      !source.sourceLayerIds.includes(source.mask.id) &&
      isProjectGenerationDraftV1(source.generationDraft) &&
      model?.baseModelFamily === family &&
      model.fileSha256 === value.generationConfiguration.model.fileSha256 &&
      (family !== 'anima' ||
        (source.internalResolution.width >= 64 && source.internalResolution.height >= 64))
    )
  }, 'The Smart Patch provenance differs from its frozen source, family or output.'),
)

export const SmartPatchVariantV1Schema = v.pipe(
  v.strictObject({
    asset: v.strictObject({
      ...MemberRefSchema.entries,
      ...SmartPatchWorldSizeEntries,
    }),
    bbox: SmartPatchWorldRectSchema,
    generationProvenance: SmartPatchGenerationProvenanceV1Schema,
    id: UuidSchema,
    name: NonemptyTextSchema,
  }),
  v.check(({ asset, bbox, generationProvenance, id }) => {
    const sourceBbox = generationProvenance.layerSourceContext.bbox
    const output = generationProvenance.executionResultContext.output
    return (
      asset.path === `assets/layers/${id}.png` &&
      asset.bytes === output.byteSize &&
      asset.sha256 === output.sha256 &&
      asset.width === output.width &&
      asset.height === output.height &&
      bbox.x === sourceBbox.x &&
      bbox.y === sourceBbox.y &&
      bbox.width === sourceBbox.width &&
      bbox.height === sourceBbox.height
    )
  }, 'The Smart Patch variant asset or placement differs from its immutable provenance.'),
)

const SmartPatchLayerSchema = v.pipe(
  v.strictObject({
    activeRasterSubLayerId: v.nullable(UuidSchema),
    blendMode: v.picklist(['normal', 'multiply', 'screen', 'overlay']),
    boundingBox: RectSchema,
    coherenceSettings: v.optional(SmartPatchCoherenceSettingsSchema),
    generationDraft: GenerationDraftSchema,
    id: UuidSchema,
    internalResolution: v.strictObject({
      height: BoundedDimensionSchema,
      width: BoundedDimensionSchema,
    }),
    kind: v.literal('smart-patch'),
    locked: v.boolean(),
    mask: SmartPatchMaskSchema,
    maskSettings: v.optional(ProjectMaskSettingsSchema),
    name: NonemptyTextSchema,
    opacity: UnitIntervalSchema,
    rasterSubLayers: v.pipe(
      v.array(SmartPatchVariantV1Schema),
      v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries),
    ),
    visible: v.boolean(),
  }),
  v.check(
    ({ activeRasterSubLayerId, rasterSubLayers }) =>
      rasterSubLayers.length === 0
        ? activeRasterSubLayerId === null
        : activeRasterSubLayerId !== null &&
          rasterSubLayers.some(({ id }) => id === activeRasterSubLayerId),
    'A nonempty Smart Patch must nominate one of its owned variants.',
  ),
)

const ProjectLayerSchema = v.variant('kind', [RasterLayerSchema, SmartPatchLayerSchema])

const ProjectDocumentV1Schema = v.strictObject({
  colorSpace: v.literal('srgb'),
  documentId: UuidSchema,
  documentRevision: UuidSchema,
  generationDraft: GenerationDraftSchema,
  lastActualSeedSnapshot: v.nullable(UInt32Schema),
  layers: v.pipe(v.array(ProjectLayerSchema), v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries)),
  primaryBbox: RectSchema,
  title: NonemptyTextSchema,
})

const IgsManifestV1Schema = v.strictObject({
  documentId: UuidSchema,
  documentRevision: UuidSchema,
  members: v.pipe(v.array(MemberRefSchema), v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries)),
  preview: v.strictObject({
    rect: v.nullable(PreviewRectSchema),
    status: v.picklist(['empty', 'rendered', 'unavailable']),
  }),
  schemaVersion: v.literal(IGS_SCHEMA_VERSION),
})

export {
  LoraSchema as GenerationLoraSchema,
  PromptSchema as GenerationPromptSchema,
  ExactResourceRefSchema as GenerationResourceRefSchema,
}

export type IgsRectV1 = v.InferOutput<typeof RectSchema>
export type IgsPreviewRectV1 = v.InferOutput<typeof PreviewRectSchema>
export type IgsMemberRefV1 = v.InferOutput<typeof MemberRefSchema>
export type IgsRasterLayerV1 = v.InferOutput<typeof RasterLayerSchema>
export type IgsSmartPatchLayerV1 = v.InferOutput<typeof SmartPatchLayerSchema>
export type IgsSmartPatchMaskAssetV1 = NonNullable<IgsSmartPatchLayerV1['mask']['asset']>
export type IgsProjectLayerV1 = v.InferOutput<typeof ProjectLayerSchema>
export type IgsProjectAssetRefV1 = IgsMemberRefV1 & {
  height?: number
  width?: number
}
export type IgsRasterGenerationProvenanceV1 = v.InferOutput<
  typeof RasterGenerationProvenanceV1Schema
>
export type IgsIllustriousRasterGenerationProvenanceV1 = Extract<
  IgsRasterGenerationProvenanceV1,
  { kind: 'illustrious-img2img' | 'illustrious-outpaint' | 'illustrious-txt2img' }
>
export type IgsAnimaRasterGenerationProvenanceV1 = Extract<
  IgsRasterGenerationProvenanceV1,
  { kind: 'anima-img2img' | 'anima-outpaint' | 'anima-txt2img' }
>
export type IgsOutpaintRasterGenerationProvenanceV1 = Extract<
  IgsRasterGenerationProvenanceV1,
  { kind: 'anima-outpaint' | 'illustrious-outpaint' }
>
export type IgsSmartPatchGenerationProvenanceV1 = v.InferOutput<
  typeof SmartPatchGenerationProvenanceV1Schema
>
export type IgsIllustriousSmartPatchGenerationProvenanceV1 = Extract<
  IgsSmartPatchGenerationProvenanceV1,
  { kind: 'illustrious-smart-patch' }
>
export type IgsAnimaSmartPatchGenerationProvenanceV1 = Extract<
  IgsSmartPatchGenerationProvenanceV1,
  { kind: 'anima-smart-patch' }
>
export type IgsSmartPatchVariantV1 = v.InferOutput<typeof SmartPatchVariantV1Schema>
export type IgsProjectDocumentV1 = v.InferOutput<typeof ProjectDocumentV1Schema>
export type IgsManifestV1 = v.InferOutput<typeof IgsManifestV1Schema>

export class IgsSchemaError extends Error {
  constructor(
    readonly code:
      'INVALID_MANIFEST' | 'INVALID_PROJECT' | 'PACKAGE_MISMATCH' | 'UNSUPPORTED_SCHEMA',
    message: string,
  ) {
    super(message)
    this.name = 'IgsSchemaError'
  }
}

/** Only canonical paths owned by the v1 format may be referenced by a package manifest. */
export function isIgsMemberPathV1(path: string): boolean {
  return (
    REQUIRED_MEMBER_PATH_SET.has(path) ||
    LAYER_ASSET_PATH_PATTERN.test(path) ||
    MASK_ASSET_PATH_PATTERN.test(path) ||
    ICC_PROFILE_PATH_PATTERN.test(path)
  )
}

export function parseProjectDocumentV1(input: unknown): IgsProjectDocumentV1 {
  const parsed = v.safeParse(ProjectDocumentV1Schema, input)
  if (!parsed.success) {
    throw new IgsSchemaError('INVALID_PROJECT', 'The Project document is invalid.')
  }
  const document = parsed.output
  const ownedIds = new Set<string>()
  for (const layer of document.layers) {
    if (ownedIds.has(layer.id)) {
      throw new IgsSchemaError('INVALID_PROJECT', 'The Project layer references are invalid.')
    }
    ownedIds.add(layer.id)
    if (layer.kind === 'smart-patch') {
      if (ownedIds.has(layer.mask.id)) {
        throw new IgsSchemaError(
          'INVALID_PROJECT',
          'A Smart Patch mask must have its own identity.',
        )
      }
      ownedIds.add(layer.mask.id)
      for (const variant of layer.rasterSubLayers) {
        // Provenance identifies the historical source. A later copy may own fresh hierarchy and
        // asset identities without rewriting the accepted history; exact target matching belongs
        // to the acceptance boundary, not to portable document ownership validation.
        if (ownedIds.has(variant.id)) {
          throw new IgsSchemaError(
            'INVALID_PROJECT',
            'A Smart Patch variant must have its own identity.',
          )
        }
        ownedIds.add(variant.id)
      }
      continue
    }
    if (!LAYER_ASSET_PATH_PATTERN.test(layer.asset.path)) {
      throw new IgsSchemaError('INVALID_PROJECT', 'The Project layer references are invalid.')
    }
    const provenance = layer.generationProvenance
    if (provenance?.kind === 'illustrious-outpaint' || provenance?.kind === 'anima-outpaint') {
      const output = provenance.executionResultContext.output
      if (
        !layer.asset.path.endsWith('.png') ||
        layer.asset.bytes !== output.byteSize ||
        layer.asset.sha256 !== output.sha256 ||
        layer.asset.width !== output.width ||
        layer.asset.height !== output.height
      ) {
        throw new IgsSchemaError(
          'INVALID_PROJECT',
          'The outpaint layer asset differs from its accepted contribution.',
        )
      }
    }
    const profile = layer.sourceIccProfile
    if (
      profile &&
      (ICC_PROFILE_PATH_PATTERN.exec(profile.path)?.[1] !== profile.sha256 ||
        profile.bytes > IGS_SAFETY_CEILINGS.iccProfileBytes)
    ) {
      throw new IgsSchemaError('INVALID_PROJECT', 'The source ICC profile reference is invalid.')
    }
  }
  const generationDrafts = [
    document.generationDraft,
    ...document.layers.flatMap((layer) =>
      layer.kind === 'smart-patch' ? [layer.generationDraft] : [],
    ),
  ]
  for (const draft of generationDrafts) {
    if (draft.model?.kind !== undefined && draft.model.kind !== 'checkpoint') {
      throw new IgsSchemaError('INVALID_PROJECT', 'The selected model reference is invalid.')
    }
    if (draft.vae?.kind !== undefined && draft.vae.kind !== 'vae') {
      throw new IgsSchemaError('INVALID_PROJECT', 'The selected VAE reference is invalid.')
    }
    for (const lora of draft.loras) {
      if (lora.resource.kind !== 'lora') {
        throw new IgsSchemaError('INVALID_PROJECT', 'A selected LoRA reference is invalid.')
      }
    }
    for (const prompt of [draft.positivePrompt, draft.negativePrompt]) {
      if (prompt.embeddingRefs.some((embedding) => embedding.resource.kind !== 'embedding')) {
        throw new IgsSchemaError('INVALID_PROJECT', 'A prompt embedding reference is invalid.')
      }
    }
  }
  return document
}

/** Top-level Raster owners only; do not use for all assets or material composition. */
export function projectRasterLayers(
  document: Pick<IgsProjectDocumentV1, 'layers'>,
): IgsRasterLayerV1[] {
  return document.layers.filter((layer): layer is IgsRasterLayerV1 => layer.kind === 'raster')
}

/** Every owned raster image, including inactive variants; no synthetic owner projection. */
export function projectRasterAssets(
  document: Pick<IgsProjectDocumentV1, 'layers'>,
): (IgsRasterLayerV1 | IgsSmartPatchVariantV1)[] {
  return document.layers.flatMap<IgsRasterLayerV1 | IgsSmartPatchVariantV1>((layer) =>
    layer.kind === 'raster' ? [layer] : layer.rasterSubLayers,
  )
}

/**
 * Material composition only. A Patch occupies its owner stack position and contributes exactly its
 * active immutable image at the accepted world bbox. The synthetic Raster id identifies the parent
 * owner for source-selection scope; it is not a mutable Raster or an accepted-history row.
 */
export function projectActiveRasterContributions(
  document: Pick<IgsProjectDocumentV1, 'layers'>,
): IgsRasterLayerV1[] {
  return document.layers.flatMap((layer) => {
    if (layer.kind === 'raster') {
      return [layer]
    }
    const active = layer.rasterSubLayers.find(({ id }) => id === layer.activeRasterSubLayerId)
    if (!active) {
      return []
    }
    return [
      {
        asset: active.asset,
        blendMode: layer.blendMode,
        id: layer.id,
        kind: 'raster' as const,
        locked: layer.locked,
        name: layer.name,
        opacity: layer.opacity,
        transform: {
          rotationDegrees: 0,
          scaleX: 1,
          scaleY: 1,
          x: active.bbox.x,
          y: active.bbox.y,
        },
        visible: layer.visible,
      },
    ]
  })
}

/** Reuse the exact portable mask guard in IPC DTOs without a fake enclosing document. */
export function isProjectSmartPatchMaskV1(input: unknown): input is IgsSmartPatchLayerV1['mask'] {
  return v.safeParse(SmartPatchMaskSchema, input).success
}

/** Reuse the authored draft contract for private frozen operation metadata, without a fake Project. */
export function isProjectGenerationDraftV1(
  input: unknown,
): input is IgsProjectDocumentV1['generationDraft'] {
  const parsed = v.safeParse(GenerationDraftSchema, input)
  if (!parsed.success) {
    return false
  }
  const draft = parsed.output
  return (
    (draft.model === null || draft.model.kind === 'checkpoint') &&
    (draft.vae === null || draft.vae.kind === 'vae') &&
    draft.loras.every((entry) => entry.resource.kind === 'lora') &&
    [draft.positivePrompt, draft.negativePrompt].every((prompt) =>
      prompt.embeddingRefs.every((entry) => entry.resource.kind === 'embedding'),
    )
  )
}

/** Actual archive assets only. A null owned mask contributes no image member. */
export function projectAssetReferences(
  document: Pick<IgsProjectDocumentV1, 'layers'>,
): IgsProjectAssetRefV1[] {
  return document.layers.flatMap((layer) =>
    layer.kind === 'smart-patch'
      ? [
          ...layer.rasterSubLayers.map(({ asset }) => asset),
          ...(layer.mask.asset ? [layer.mask.asset] : []),
        ]
      : [layer.asset, ...(layer.sourceIccProfile ? [layer.sourceIccProfile] : [])],
  )
}

export function projectMaskAssets(
  document: Pick<IgsProjectDocumentV1, 'layers'>,
): IgsSmartPatchMaskAssetV1[] {
  return document.layers.flatMap((layer) =>
    layer.kind === 'smart-patch' && layer.mask.asset ? [layer.mask.asset] : [],
  )
}

/** Validate the portable comparison payload without accepting private provenance groups. */
export function isRasterGenerationConfigurationV1(
  input: unknown,
): input is IgsRasterGenerationProvenanceV1['generationConfiguration'] {
  return v.is(RasterGenerationConfigurationV1Schema, input)
}

/** Validate a mapper-produced record before it is attached to a generated Raster Layer. */
export function parseRasterGenerationProvenanceV1(input: unknown): IgsRasterGenerationProvenanceV1 {
  const parsed = v.safeParse(RasterGenerationProvenanceV1Schema, input)
  if (!parsed.success) {
    throw new IgsSchemaError('INVALID_PROJECT', 'The generated Raster Layer provenance is invalid.')
  }
  return parsed.output
}

/** Validate standalone immutable metadata before attachment to an exact Project owner. */
export function parseSmartPatchGenerationProvenanceV1(
  input: unknown,
): IgsSmartPatchGenerationProvenanceV1 {
  const parsed = v.safeParse(SmartPatchGenerationProvenanceV1Schema, input)
  if (!parsed.success) {
    throw new IgsSchemaError('INVALID_PROJECT', 'The Smart Patch provenance is invalid.')
  }
  return parsed.output
}

/** A standalone future variant record; this does not create accepted Project ownership. */
export function parseSmartPatchVariantV1(input: unknown): IgsSmartPatchVariantV1 {
  const parsed = v.safeParse(SmartPatchVariantV1Schema, input)
  if (!parsed.success) {
    throw new IgsSchemaError('INVALID_PROJECT', 'The Smart Patch variant is invalid.')
  }
  return parsed.output
}

export function parseIgsManifestV1(input: unknown): IgsManifestV1 {
  if (
    typeof input === 'object' &&
    input !== null &&
    'schemaVersion' in input &&
    typeof input.schemaVersion === 'number' &&
    Number.isSafeInteger(input.schemaVersion) &&
    input.schemaVersion !== IGS_SCHEMA_VERSION
  ) {
    throw new IgsSchemaError('UNSUPPORTED_SCHEMA', 'This Project package version is unsupported.')
  }
  const parsed = v.safeParse(IgsManifestV1Schema, input)
  if (!parsed.success) {
    throw new IgsSchemaError('INVALID_MANIFEST', 'The Project package manifest is invalid.')
  }
  const manifest = parsed.output
  if (
    (manifest.preview.status === 'empty') !== (manifest.preview.rect === null) ||
    manifest.members.some((member) => !isIgsMemberPathV1(member.path))
  ) {
    throw new IgsSchemaError('INVALID_MANIFEST', 'The Project package entries are invalid.')
  }
  const paths = new Set(manifest.members.map((member) => member.path))
  if (
    paths.size !== manifest.members.length ||
    IGS_REQUIRED_MEMBER_PATHS.some((path) => !paths.has(path))
  ) {
    throw new IgsSchemaError('INVALID_MANIFEST', 'The Project package entries are incomplete.')
  }
  const totalBytes = manifest.members.reduce((sum, member) => sum + member.bytes, 0)
  if (totalBytes > IGS_SAFETY_CEILINGS.archiveUncompressedBytes) {
    throw new IgsSchemaError('INVALID_MANIFEST', 'The Project package is too large.')
  }
  return manifest
}

export function validateIgsPackageMetadataV1(
  rawManifest: unknown,
  rawDocument: unknown,
): { document: IgsProjectDocumentV1; manifest: IgsManifestV1 } {
  const manifest = parseIgsManifestV1(rawManifest)
  const document = parseProjectDocumentV1(rawDocument)
  if (
    manifest.documentId !== document.documentId ||
    manifest.documentRevision !== document.documentRevision
  ) {
    throw new IgsSchemaError('PACKAGE_MISMATCH', 'The Project package revision does not match.')
  }
  const rasterLayers = projectRasterLayers(document)
  const rasterAssets = projectRasterAssets(document)
  if (
    projectActiveRasterContributions(document).length === 0 &&
    manifest.preview.status !== 'empty'
  ) {
    throw new IgsSchemaError('PACKAGE_MISMATCH', 'An empty Project cannot have a raster preview.')
  }
  const members = new Map(manifest.members.map((member) => [member.path, member]))
  const assetPaths = new Set(rasterAssets.map((layer) => layer.asset.path))
  const maskPaths = new Set(
    document.layers.flatMap((layer) =>
      layer.kind === 'smart-patch' && layer.mask.asset ? [layer.mask.asset.path] : [],
    ),
  )
  const profilePaths = new Set(
    rasterLayers.flatMap((layer) => (layer.sourceIccProfile ? [layer.sourceIccProfile.path] : [])),
  )
  for (const layer of rasterAssets) {
    const member = members.get(layer.asset.path)
    if (member?.bytes !== layer.asset.bytes || member.sha256 !== layer.asset.sha256) {
      throw new IgsSchemaError('PACKAGE_MISMATCH', 'A Project layer asset is missing or differs.')
    }
    if ('sourceIccProfile' in layer && layer.sourceIccProfile) {
      const profile = members.get(layer.sourceIccProfile.path)
      if (
        profile?.bytes !== layer.sourceIccProfile.bytes ||
        profile.sha256 !== layer.sourceIccProfile.sha256
      ) {
        throw new IgsSchemaError('PACKAGE_MISMATCH', 'A source ICC profile is missing or differs.')
      }
    }
  }
  for (const layer of document.layers) {
    if (layer.kind !== 'smart-patch' || !layer.mask.asset) {
      continue
    }
    const member = members.get(layer.mask.asset.path)
    if (member?.bytes !== layer.mask.asset.bytes || member.sha256 !== layer.mask.asset.sha256) {
      throw new IgsSchemaError('PACKAGE_MISMATCH', 'A Project mask asset is missing or differs.')
    }
  }
  for (const member of manifest.members) {
    if (member.path.startsWith('assets/layers/') && !assetPaths.has(member.path)) {
      throw new IgsSchemaError(
        'PACKAGE_MISMATCH',
        'The Project package has an unreferenced layer asset.',
      )
    }
    if (member.path.startsWith('assets/profiles/') && !profilePaths.has(member.path)) {
      throw new IgsSchemaError('PACKAGE_MISMATCH', 'The package has an unreferenced ICC profile.')
    }
    if (member.path.startsWith('assets/masks/') && !maskPaths.has(member.path)) {
      throw new IgsSchemaError('PACKAGE_MISMATCH', 'The package has an unreferenced mask asset.')
    }
  }
  return { document, manifest }
}

export function createEmptyProjectDocumentV1(options: {
  documentId?: string
  documentRevision?: string
  primaryBbox?: IgsRectV1
  title: string
}): IgsProjectDocumentV1 {
  return parseProjectDocumentV1({
    colorSpace: 'srgb',
    documentId: options.documentId ?? globalThis.crypto.randomUUID(),
    documentRevision: options.documentRevision ?? globalThis.crypto.randomUUID(),
    generationDraft: {
      dynamicPrompt: getEffectiveDynamicPromptSettings(),
      loras: [],
      model: null,
      negativePrompt: { embeddingRefs: [], text: '' },
      positivePrompt: { embeddingRefs: [], text: '' },
      sampling: {
        cfgScale: null,
        denoisingStrength: null,
        sampler: null,
        scheduler: null,
        steps: null,
      },
      seed: { policy: 'random', value: null },
      vae: null,
    },
    lastActualSeedSnapshot: null,
    layers: [],
    primaryBbox: options.primaryBbox ?? { height: 1024, width: 1024, x: 0, y: 0 },
    title: options.title,
  })
}
