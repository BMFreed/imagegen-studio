import * as v from 'valibot'

import { IGS_SRGB_ICC_SHA256 } from './color-profile.js'
import {
  GenerationDynamicPromptSettingsSchema,
  getEffectiveDynamicPromptSettings,
} from './generation-dynamic-settings.js'

/** An internal package marker; it does not claim IANA registration. */
export const IGS_MIMETYPE = 'application/vnd.imagegen-studio.project+zip'
export const IGS_SCHEMA_VERSION = 1
/** Defensive ceiling shared by temporary output verification and accepted-result metadata. */
export const IGS_GENERATION_PNG_MAX_BYTES = 32 * 1024 * 1024

/**
 * Defensive format ceilings, not measured generation/runtime capacity. The ZIP reader must also
 * enforce these against actual streamed bytes. Revisit them with real large-project fixtures before
 * release; model-specific generation limits are separate from portable document limits.
 */
export const IGS_SAFETY_CEILINGS = {
  archiveEntries: 10_000,
  archiveUncompressedBytes: 32 * 1024 * 1024 * 1024,
  coordinateMagnitude: 2_147_483_647,
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
    invokeScheduler: v.picklist(['dpmpp_2m_k', 'dpmpp_2m', 'euler_a', 'dpmpp_sde_k', 'dpmpp_sde']),
    requestedSeedPolicy: v.picklist(['fixed', 'random', 'reuse']),
    sampler: NonemptyTextSchema,
    scheduler: NonemptyTextSchema,
    seedBehavior: v.optional(v.picklist(['per-iteration', 'per-prompt'])),
    steps: v.pipe(PositiveIntegerSchema, v.maxValue(200)),
  }),
  size: v.strictObject({ height: GenerationDimensionSchema, width: GenerationDimensionSchema }),
})

const Img2ImgRasterGenerationConfigurationV1Schema = v.strictObject({
  ...Txt2ImgRasterGenerationConfigurationV1Schema.entries,
  mode: v.literal('img2img'),
  sampling: v.strictObject({
    ...Txt2ImgRasterGenerationConfigurationV1Schema.entries.sampling.entries,
    denoisingStrength: UnitIntervalSchema,
  }),
})
const RasterGenerationConfigurationV1Schema = v.variant('mode', [
  Txt2ImgRasterGenerationConfigurationV1Schema,
  Img2ImgRasterGenerationConfigurationV1Schema,
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
const RasterGenerationProvenanceV1Schema = v.pipe(
  v.variant('kind', [
    Txt2ImgRasterGenerationProvenanceV1Schema,
    v.strictObject({
      ...Txt2ImgRasterGenerationProvenanceV1Schema.entries,
      generationConfiguration: Img2ImgRasterGenerationConfigurationV1Schema,
      kind: v.literal('illustrious-img2img'),
    }),
  ]),
  v.check(
    ({ executionResultContext, generationConfiguration, layerSourceContext }) =>
      generationConfiguration.size.width === layerSourceContext.bbox.width &&
      generationConfiguration.size.height === layerSourceContext.bbox.height &&
      generationConfiguration.size.width === executionResultContext.output.width &&
      generationConfiguration.size.height === executionResultContext.output.height,
    'The accepted result size must match its frozen bbox and output image.',
  ),
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

const ProjectDocumentV1Schema = v.strictObject({
  colorSpace: v.literal('srgb'),
  documentId: UuidSchema,
  documentRevision: UuidSchema,
  generationDraft: GenerationDraftSchema,
  lastActualSeedSnapshot: v.nullable(UInt32Schema),
  layers: v.pipe(v.array(RasterLayerSchema), v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries)),
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

export type IgsRectV1 = v.InferOutput<typeof RectSchema>
export type IgsPreviewRectV1 = v.InferOutput<typeof PreviewRectSchema>
export type IgsMemberRefV1 = v.InferOutput<typeof MemberRefSchema>
export type IgsRasterGenerationProvenanceV1 = v.InferOutput<
  typeof RasterGenerationProvenanceV1Schema
>
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
    ICC_PROFILE_PATH_PATTERN.test(path)
  )
}

export function parseProjectDocumentV1(input: unknown): IgsProjectDocumentV1 {
  const parsed = v.safeParse(ProjectDocumentV1Schema, input)
  if (!parsed.success) {
    throw new IgsSchemaError('INVALID_PROJECT', 'The Project document is invalid.')
  }
  const document = parsed.output
  const layerIds = new Set<string>()
  for (const layer of document.layers) {
    if (layerIds.has(layer.id) || !LAYER_ASSET_PATH_PATTERN.test(layer.asset.path)) {
      throw new IgsSchemaError('INVALID_PROJECT', 'The Project layer references are invalid.')
    }
    const profile = layer.sourceIccProfile
    if (
      profile &&
      (ICC_PROFILE_PATH_PATTERN.exec(profile.path)?.[1] !== profile.sha256 ||
        profile.bytes > IGS_SAFETY_CEILINGS.iccProfileBytes)
    ) {
      throw new IgsSchemaError('INVALID_PROJECT', 'The source ICC profile reference is invalid.')
    }
    layerIds.add(layer.id)
  }
  if (
    document.generationDraft.model?.kind !== undefined &&
    document.generationDraft.model.kind !== 'checkpoint'
  ) {
    throw new IgsSchemaError('INVALID_PROJECT', 'The selected model reference is invalid.')
  }
  if (
    document.generationDraft.vae?.kind !== undefined &&
    document.generationDraft.vae.kind !== 'vae'
  ) {
    throw new IgsSchemaError('INVALID_PROJECT', 'The selected VAE reference is invalid.')
  }
  for (const lora of document.generationDraft.loras) {
    if (lora.resource.kind !== 'lora') {
      throw new IgsSchemaError('INVALID_PROJECT', 'A selected LoRA reference is invalid.')
    }
  }
  for (const prompt of [
    document.generationDraft.positivePrompt,
    document.generationDraft.negativePrompt,
  ]) {
    if (prompt.embeddingRefs.some((embedding) => embedding.resource.kind !== 'embedding')) {
      throw new IgsSchemaError('INVALID_PROJECT', 'A prompt embedding reference is invalid.')
    }
  }
  return document
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
  if (document.layers.length === 0 && manifest.preview.status !== 'empty') {
    throw new IgsSchemaError('PACKAGE_MISMATCH', 'An empty Project cannot have a raster preview.')
  }
  const members = new Map(manifest.members.map((member) => [member.path, member]))
  const assetPaths = new Set(document.layers.map((layer) => layer.asset.path))
  const profilePaths = new Set(
    document.layers.flatMap((layer) =>
      layer.sourceIccProfile ? [layer.sourceIccProfile.path] : [],
    ),
  )
  for (const layer of document.layers) {
    const member = members.get(layer.asset.path)
    if (member?.bytes !== layer.asset.bytes || member.sha256 !== layer.asset.sha256) {
      throw new IgsSchemaError('PACKAGE_MISMATCH', 'A Project layer asset is missing or differs.')
    }
    if (layer.sourceIccProfile) {
      const profile = members.get(layer.sourceIccProfile.path)
      if (
        profile?.bytes !== layer.sourceIccProfile.bytes ||
        profile.sha256 !== layer.sourceIccProfile.sha256
      ) {
        throw new IgsSchemaError('PACKAGE_MISMATCH', 'A source ICC profile is missing or differs.')
      }
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
