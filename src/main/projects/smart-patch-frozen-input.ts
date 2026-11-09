import { compileAnimaFlowSamplingPlan } from '../../shared/projects/anima-flow-sampling-plan.js'
import {
  ANIMA_PROMPT_INTERPRETATION,
  compileAnimaPromptWeightingForInterpretation,
} from '../../shared/projects/anima-prompt-weighting.js'
import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import { GENERATION_BATCH_JOB_LIMIT } from '../../shared/projects/generation-batch-policy.js'
import { ProjectMaskSettingsSchema } from '../../shared/projects/project-mask-settings.js'
import { PROJECT_MASK_MAX_DIMENSION } from '../../shared/projects/project-mask.js'
import {
  IGS_SAFETY_CEILINGS,
  type IgsProjectDocumentV1,
  type IgsSmartPatchLayerV1,
  isProjectGenerationDraftV1,
  isProjectSmartPatchMaskV1,
} from '../../shared/projects/project-schema.js'
import { activePromptEmbeddingRefs } from '../../shared/projects/prompt-embeddings.js'
import { SmartPatchCoherenceSettingsSchema } from '../../shared/projects/smart-patch-coherence-settings.js'

import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import * as v from 'valibot'

import type { SmartPatchExecutionItem } from './project-smart-patch-execution.js'
import type { FrozenSmartPatchGenerationContext } from './project-smart-patch-generation-input.js'
import type {
  PreparedSmartPatchModelSourceInput,
  SmartPatchGenerationMode,
} from './project-smart-patch-preparation.js'
import type {
  SmartPatchAnimaInference,
  SmartPatchExecutionRequest,
  SmartPatchIllustriousInference,
} from './smart-patch-execution-request.js'

import { validateSrgbPngStream } from './igs-package.js'
import { resolveIllustriousScheduler } from './illustrious-scheduler.js'
import { decodeDerivedProjectMaskPng, decodeProjectMaskPng } from './project-mask.js'
import { validateSmartPatchExecutionDraft } from './project-smart-patch-execution.js'
import {
  ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE,
  ANIMA_SMART_PATCH_REGIONAL_PROFILE,
  bindSmartPatchAnimaRegionalExecution,
  captureFrozenSmartPatchAnimaRegionalInputV1,
  capturePreparedSmartPatchAnimaRegionalInput,
  type FrozenSmartPatchAnimaRegionalInputV1,
  type PreparedSmartPatchAnimaRegionalInput,
  SMART_PATCH_REGIONAL_ALPHA_ROLES,
} from './project-smart-patch-regional-input.js'
import { captureSmartPatchExecutionRequest } from './smart-patch-execution-request.js'
import { classifyTargetPngAlpha, decodeTargetPngAlpha } from './target-png-mode.js'

export const SMART_PATCH_INPUT_MANIFEST_MAX_BYTES = 128 * 1024
export const SMART_PATCH_INPUT_PNG_MAX_BYTES = 32 * 1024 * 1024

export interface FrozenSmartPatchInputFileV1 {
  byteSize: number
  height: number
  sha256: string
  width: number
}

export type FrozenSmartPatchInputItemV1 =
  | { family: 'anima'; inference: SmartPatchAnimaInference; item: SmartPatchExecutionItem }
  | {
      family: 'illustrious'
      inference: SmartPatchIllustriousInference
      item: SmartPatchExecutionItem
    }

export interface FrozenSmartPatchInputV1 {
  animaPromptInterpretation?: typeof ANIMA_PROMPT_INTERPRETATION
  context: FrozenSmartPatchGenerationContext
  files: {
    'authored-mask.png'?: FrozenSmartPatchInputFileV1
    'final-contribution-mask.png': FrozenSmartPatchInputFileV1
    'latent-keep-mask.png': FrozenSmartPatchInputFileV1
    'model-source.png'?: FrozenSmartPatchInputFileV1
    'regional-0.alpha8'?: FrozenSmartPatchInputFileV1
    'regional-1.alpha8'?: FrozenSmartPatchInputFileV1
    'regional-2.alpha8'?: FrozenSmartPatchInputFileV1
    'source.png': FrozenSmartPatchInputFileV1
  }
  items: FrozenSmartPatchInputItemV1[]
  kind: 'smart-patch-frozen-input'
  latentMaskHasCoverage: boolean
  mode: SmartPatchGenerationMode
  regional?: FrozenSmartPatchAnimaRegionalInputV1
  schemaVersion: 1
  sourceAlpha: 'mixed' | 'opaque' | 'transparent'
}

export interface SmartPatchInputMaterial {
  files: Record<string, Buffer>
  manifest: FrozenSmartPatchInputV1
}

export class SmartPatchFrozenInputError extends Error {
  readonly code = 'SMART_PATCH_INPUT_INVALID'

  constructor(message: string) {
    super(message)
    this.name = 'SmartPatchFrozenInputError'
  }
}

const uint = (min: number, max = Number.MAX_SAFE_INTEGER) =>
  v.pipe(v.number(), v.safeInteger(), v.minValue(min), v.maxValue(max))
const uuid = v.pipe(v.string(), v.uuid())
const sha = v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/))
const dimensions = { height: uint(1, 2048), width: uint(1, 2048) }
const size = v.pipe(
  v.strictObject(dimensions),
  v.check((value) => value.width * value.height <= 4_000_000),
)
const file = v.strictObject({
  byteSize: uint(1, SMART_PATCH_INPUT_PNG_MAX_BYTES),
  height: uint(1, PROJECT_MASK_MAX_DIMENSION),
  sha256: sha,
  width: uint(1, PROJECT_MASK_MAX_DIMENSION),
})
const coordinate = v.pipe(
  v.number(),
  v.safeInteger(),
  v.minValue(-IGS_SAFETY_CEILINGS.coordinateMagnitude),
  v.maxValue(IGS_SAFETY_CEILINGS.coordinateMagnitude),
)
const context = v.strictObject({
  bbox: v.pipe(
    v.strictObject({ ...dimensions, x: coordinate, y: coordinate }),
    v.check((value) => value.width * value.height <= 4_000_000),
  ),
  coherenceSettings: SmartPatchCoherenceSettingsSchema,
  documentId: uuid,
  documentRevision: uuid,
  generationDraft: v.custom<IgsProjectDocumentV1['generationDraft']>(isProjectGenerationDraftV1),
  internalResolution: size,
  lastActualSeedSnapshot: v.nullable(uint(0, 0xff_ff_ff_ff)),
  layerId: uuid,
  locked: v.boolean(),
  mask: v.custom<IgsSmartPatchLayerV1['mask']>(isProjectSmartPatchMaskV1),
  maskSettings: ProjectMaskSettingsSchema,
  projectKey: v.pipe(v.string(), v.nonEmpty(), v.maxBytes(1024)),
  sourceLayerIds: v.pipe(
    v.array(uuid),
    v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries),
    v.check((ids) => new Set(ids).size === ids.length),
  ),
  visible: v.boolean(),
})
const item = v.strictObject({
  prompts: v.strictObject({
    negative: v.pipe(v.string(), v.maxBytes(16 * 1024)),
    positive: v.pipe(v.string(), v.maxBytes(16 * 1024)),
  }),
  seed: uint(0, 0xff_ff_ff_ff),
})
const manifestSchema = v.strictObject({
  animaPromptInterpretation: v.optional(v.literal(ANIMA_PROMPT_INTERPRETATION)),
  context,
  files: v.strictObject({
    'authored-mask.png': v.optional(file),
    'final-contribution-mask.png': file,
    'latent-keep-mask.png': file,
    'model-source.png': v.optional(file),
    'regional-0.alpha8': v.optional(file),
    'regional-1.alpha8': v.optional(file),
    'regional-2.alpha8': v.optional(file),
    'source.png': file,
  }),
  items: v.pipe(
    v.array(
      v.strictObject({
        family: v.picklist(['anima', 'illustrious']),
        inference: v.unknown(),
        item,
      }),
    ),
    v.minLength(1),
    v.maxLength(GENERATION_BATCH_JOB_LIMIT),
  ),
  kind: v.literal('smart-patch-frozen-input'),
  latentMaskHasCoverage: v.boolean(),
  mode: v.picklist(['txt2img', 'img2img', 'inpaint', 'outpaint']),
  regional: v.optional(v.unknown()),
  schemaVersion: v.literal(1),
  sourceAlpha: v.picklist(['mixed', 'opaque', 'transparent']),
})

function refuse(message: string): never {
  throw new SmartPatchFrozenInputError(message)
}

const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
const sameSize = (
  left: { height: number; width: number },
  right: { height: number; width: number },
): boolean => left.width === right.width && left.height === right.height

/** Metadata-only admission for a bounded manifest, before its fixed-role file reads. */
export function parseFrozenSmartPatchInputV1(input: unknown): FrozenSmartPatchInputV1 {
  let snapshot: unknown
  try {
    snapshot = structuredClone(input)
    if (
      Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > SMART_PATCH_INPUT_MANIFEST_MAX_BYTES
    ) {
      refuse('The frozen Smart Patch manifest exceeds its byte limit.')
    }
  } catch (error) {
    if (error instanceof SmartPatchFrozenInputError) {
      throw error
    }
    refuse('The frozen Smart Patch manifest is not JSON metadata.')
  }
  const parsed = v.safeParse(manifestSchema, snapshot)
  if (!parsed.success) {
    refuse('The frozen Smart Patch manifest is invalid.')
  }
  const result = parsed.output as FrozenSmartPatchInputV1
  if (
    result.animaPromptInterpretation !== undefined &&
    !result.items.some((entry) => entry.family === 'anima')
  ) {
    refuse('An Anima prompt interpretation requires an Anima Smart Patch item.')
  }
  const { context: ctx, files, mode } = result
  const mask = ctx.mask.asset
  if (
    !sameSize(files['source.png'], ctx.bbox) ||
    !sameSize(files['final-contribution-mask.png'], ctx.bbox) ||
    files['latent-keep-mask.png'].width !== ctx.internalResolution.width / 8 ||
    files['latent-keep-mask.png'].height !== ctx.internalResolution.height / 8 ||
    (mode === 'txt2img') !== (files['model-source.png'] === undefined) ||
    (files['model-source.png'] && !sameSize(files['model-source.png'], ctx.internalResolution)) ||
    (mask === null) !== (files['authored-mask.png'] === undefined) ||
    (mask &&
      !isDeepStrictEqual(files['authored-mask.png'], {
        byteSize: mask.bytes,
        height: mask.height,
        sha256: mask.sha256,
        width: mask.width,
      })) ||
    ctx.sourceLayerIds.includes(ctx.layerId) ||
    ctx.sourceLayerIds.includes(ctx.mask.id) ||
    ctx.layerId === ctx.mask.id
  ) {
    refuse('The frozen Smart Patch roles differ from their owned context.')
  }
  for (const name of [
    'source.png',
    'model-source.png',
    'latent-keep-mask.png',
    'final-contribution-mask.png',
  ] as const) {
    const ref = files[name]
    if (ref && (ref.width > 2048 || ref.height > 2048 || ref.width * ref.height > 4_000_000)) {
      refuse('A frozen Smart Patch plane exceeds its pixel limit.')
    }
  }
  const expectedSource =
    mode === 'txt2img' ? 'transparent' : mode === 'outpaint' ? 'mixed' : 'opaque'
  if (result.sourceAlpha !== expectedSource) {
    refuse('The frozen Smart Patch source alpha and mode disagree.')
  }
  const commonResources: unknown[] = []
  const embeddings = new Map<string, unknown>()
  result.items = result.items.map((entry) => {
    const request = requestForEntry(result, entry)
    validateEntry(ctx, entry, request, result.animaPromptInterpretation)
    const inference = request.inference
    const resources =
      request.family === 'anima'
        ? { loras: request.inference.loras, model: request.inference.model }
        : {
            checkpoint: request.inference.checkpoint,
            loras: request.inference.loras,
            noiseProfile: request.inference.sampling.noiseProfile,
            vae: request.inference.vae,
            vaePrecision: request.inference.vaePrecision,
          }
    if (commonResources.length && !isDeepStrictEqual(resources, commonResources[0])) {
      refuse('A Smart Patch batch changed its shared resources or model policy.')
    }
    commonResources.push(resources)
    if (request.family === 'illustrious') {
      for (const polarity of ['positive', 'negative'] as const) {
        for (const ref of request.inference.embeddings?.[polarity] ?? []) {
          const key = `${ref.token}:${ref.sha256}`
          const previous = embeddings.get(key)
          if (previous && !isDeepStrictEqual(previous, ref)) {
            refuse('A concrete embedding changed within the Smart Patch batch.')
          }
          embeddings.set(key, ref)
        }
      }
    }
    return {
      family: request.family,
      inference,
      item: structuredClone(entry.item),
    } as FrozenSmartPatchInputItemV1
  })
  if (Object.hasOwn(result, 'regional')) {
    try {
      result.regional = captureFrozenSmartPatchAnimaRegionalInputV1(result.regional)
      assertRegionalMetadataAgreement(result)
    } catch {
      refuse('The frozen Smart regional metadata differs from its exact Smart job.')
    }
  } else if (SMART_PATCH_REGIONAL_ALPHA_ROLES.some((role) => Object.hasOwn(result.files, role))) {
    refuse('Regional alpha roles require the explicit frozen Smart regional profile.')
  }
  return result
}

/** Capture every caller-owned value before strict async PNG checks can yield. */
export async function captureSmartPatchInputMaterial(
  prepared: PreparedSmartPatchModelSourceInput,
  executions: readonly { item: SmartPatchExecutionItem; request: SmartPatchExecutionRequest }[],
): Promise<SmartPatchInputMaterial> {
  const ctx = structuredClone(prepared.context)
  if (
    prepared.conditioning.latentKeepMask.polarity !== 'keep' ||
    prepared.conditioning.finalContributionMask.polarity !== 'generate'
  ) {
    refuse('The prepared Smart Patch numeric roles have wrong polarity.')
  }
  const files: Record<string, Buffer> = {}
  const references: FrozenSmartPatchInputV1['files'] = {
    'final-contribution-mask.png': capturePlane(
      'final-contribution-mask.png',
      prepared.conditioning.finalContributionMask,
      files,
    ),
    'latent-keep-mask.png': capturePlane(
      'latent-keep-mask.png',
      prepared.conditioning.latentKeepMask,
      files,
    ),
    'source.png': capturePlane('source.png', prepared.source, files),
  }
  if (!isDeepStrictEqual(prepared.coherence, ctx.coherenceSettings)) {
    refuse('The prepared coherence differs from the frozen owned profile.')
  }
  if (prepared.maskPngBytes) {
    if (!ctx.mask.asset) {
      refuse('Authored mask bytes have no frozen owner.')
    }
    references['authored-mask.png'] = capturePlane(
      'authored-mask.png',
      { ...ctx.mask.asset, bytes: prepared.maskPngBytes },
      files,
    )
  }
  if (prepared.modelSource) {
    references['model-source.png'] = capturePlane('model-source.png', prepared.modelSource, files)
  }
  const manifest: FrozenSmartPatchInputV1 = {
    ...(executions.some((execution) => execution.request.family === 'anima')
      ? { animaPromptInterpretation: ANIMA_PROMPT_INTERPRETATION }
      : {}),
    context: ctx,
    files: references,
    items: [],
    kind: 'smart-patch-frozen-input',
    latentMaskHasCoverage: prepared.conditioning.latentMaskHasCoverage,
    mode: prepared.mode,
    schemaVersion: 1,
    sourceAlpha: prepared.sourceAlpha,
  }
  manifest.items = executions.map((execution) => {
    const request = captureSmartPatchExecutionRequest(execution.request)
    const strip = ({ path: _path, ...identity }: FrozenSmartPatchInputFileV1 & { path: string }) =>
      identity
    if (
      request.mode !== manifest.mode ||
      !sameSize(request.internalResolution, ctx.internalResolution) ||
      !isDeepStrictEqual(strip(request.latentKeepMask), references['latent-keep-mask.png']) ||
      !isDeepStrictEqual(
        request.modelSource ? strip(request.modelSource) : undefined,
        references['model-source.png'],
      )
    ) {
      refuse('The Smart Patch executable inputs differ from the prepared frozen pixels.')
    }
    return {
      family: request.family,
      inference: request.inference,
      item: structuredClone(execution.item),
    } as FrozenSmartPatchInputItemV1
  })
  return await parseSmartPatchInputMaterial(manifest, files)
}

/** Fresh durable reload: own and verify all fixed-role bytes without model or current-Project reads. */
export async function parseSmartPatchInputMaterial(
  manifestInput: unknown,
  filesInput: Record<string, Buffer>,
): Promise<SmartPatchInputMaterial> {
  const manifest = parseFrozenSmartPatchInputV1(manifestInput)
  if (
    !filesInput ||
    typeof filesInput !== 'object' ||
    Array.isArray(filesInput) ||
    !isDeepStrictEqual(Object.keys(filesInput).sort(), Object.keys(manifest.files).sort())
  ) {
    refuse('The frozen Smart Patch file roles are incomplete or unexpected.')
  }
  const files: Record<string, Buffer> = {}
  for (const [name, ref] of Object.entries(manifest.files)) {
    const bytes = filesInput[name]
    if (
      !ref ||
      !Buffer.isBuffer(bytes) ||
      bytes.length !== ref.byteSize ||
      bytes.length > SMART_PATCH_INPUT_PNG_MAX_BYTES ||
      digest(bytes) !== ref.sha256
    ) {
      refuse('A frozen Smart Patch file failed its exact byte identity.')
    }
    files[name] = Buffer.from(bytes)
  }
  if (manifest.regional) {
    hydrateFrozenSmartPatchAnimaRegionalInput(manifest, files)
  }
  for (const name of ['source.png', 'model-source.png'] as const) {
    const ref = manifest.files[name]
    if (ref) {
      await assertColorPng(files[name], name, ref, name === 'source.png' ? 6 : 2)
    }
  }
  const authoredRef = manifest.files['authored-mask.png']
  const authored = authoredRef
    ? decodeProjectMaskPng(files['authored-mask.png'], authoredRef)
    : null
  const keep = decodeDerivedProjectMaskPng(
    files['latent-keep-mask.png'],
    manifest.files['latent-keep-mask.png'],
  )
  const final = decodeDerivedProjectMaskPng(
    files['final-contribution-mask.png'],
    manifest.files['final-contribution-mask.png'],
  )
  const source = decodeTargetPngAlpha(
    files['source.png'],
    manifest.context.bbox.width,
    manifest.context.bbox.height,
  )
  const sourceMode = classifyTargetPngAlpha(
    files['source.png'],
    manifest.context.bbox.width,
    manifest.context.bbox.height,
  )
  const sourceAlpha =
    sourceMode === 'txt2img' ? 'transparent' : sourceMode === 'img2img' ? 'opaque' : 'mixed'
  let hasAuthoredCoverage = false
  const bbox = manifest.context.bbox
  const bounds = 'bounds' in manifest.context.mask ? manifest.context.mask.bounds : null
  for (let row = 0; row < bbox.height; row++) {
    for (let column = 0; column < bbox.width; column++) {
      const x = bbox.x + column
      const y = bbox.y + row
      const covered =
        authored &&
        bounds &&
        x >= bounds.x &&
        y >= bounds.y &&
        x < bounds.x + bounds.width &&
        y < bounds.y + bounds.height
          ? authored[(y - bounds.y) * bounds.width + x - bounds.x] > 0
          : false
      if (covered) {
        hasAuthoredCoverage = true
      }
      const index = row * bbox.width + column
      const core =
        manifest.mode === 'txt2img' ||
        manifest.mode === 'img2img' ||
        covered ||
        (manifest.mode === 'outpaint' && source[index] < 255)
      if (core && final[index] !== 255) {
        refuse('The frozen contribution lost its original full world edit core.')
      }
    }
  }
  const mode =
    sourceAlpha === 'transparent'
      ? 'txt2img'
      : sourceAlpha === 'mixed'
        ? 'outpaint'
        : hasAuthoredCoverage
          ? 'inpaint'
          : 'img2img'
  if (
    sourceAlpha !== manifest.sourceAlpha ||
    mode !== manifest.mode ||
    manifest.latentMaskHasCoverage !== keep.some((value) => value < 255) ||
    ((mode === 'txt2img' || mode === 'img2img') && keep.some((value) => value !== 0))
  ) {
    refuse('The frozen Smart Patch mode or numeric KEEP policy differs from its actual inputs.')
  }
  return { files, manifest }
}

/**
 * Invoke4875 freezes the compiled root graph for Retry. Adapt that ownership to the existing Smart
 * manifest commit; raw regions use exact fixed-role bytes. This is operational input, never
 * accepted-result provenance.
 */
export async function attachSmartPatchAnimaRegionalInput(
  input: SmartPatchInputMaterial,
  preparedInput: PreparedSmartPatchAnimaRegionalInput,
): Promise<SmartPatchInputMaterial> {
  const prepared = capturePreparedSmartPatchAnimaRegionalInput(preparedInput)
  const manifest = parseFrozenSmartPatchInputV1(input.manifest)
  if (manifest.regional || prepared.promptInterpretation !== ANIMA_PROMPT_INTERPRETATION) {
    refuse('Public Smart regional input requires one explicit current prompt interpretation.')
  }
  const files: Record<string, Buffer> = {}
  for (const [name, bytes] of Object.entries(input.files)) {
    if (!Buffer.isBuffer(bytes)) {
      refuse('Smart input material requires owned buffers.')
    }
    files[name] = Buffer.from(bytes)
  }
  const regional: FrozenSmartPatchAnimaRegionalInputV1 = {
    ...prepared,
    promptInterpretation: ANIMA_PROMPT_INTERPRETATION,
    recipe: {
      ...prepared.recipe,
      regions: prepared.recipe.regions.map((region, index) => {
        const role = SMART_PATCH_REGIONAL_ALPHA_ROLES[index]
        if (!role || Object.hasOwn(files, role) || Object.hasOwn(manifest.files, role)) {
          refuse('The Smart regional raw alpha role is unavailable.')
        }
        const bytes = Buffer.from(region.coverage.alpha)
        files[role] = bytes
        manifest.files[role] = {
          byteSize: bytes.length,
          height: prepared.recipe.bbox.height,
          sha256: digest(bytes),
          width: prepared.recipe.bbox.width,
        }
        return { ...region, coverage: { ...region.coverage, alpha: role } }
      }),
    },
  }
  manifest.regional = regional
  return await parseSmartPatchInputMaterial(manifest, files)
}

/** Full pixel qualification of the frozen regional extension, without current Project reads. */
export function hydrateFrozenSmartPatchAnimaRegionalInput(
  manifestInput: FrozenSmartPatchInputV1,
  filesInput: Record<string, Buffer>,
): PreparedSmartPatchAnimaRegionalInput {
  const manifest = parseFrozenSmartPatchInputV1(manifestInput)
  const regional = manifest.regional
  if (!regional) {
    refuse('The Smart input has no frozen regional extension.')
  }
  try {
    const prepared = capturePreparedSmartPatchAnimaRegionalInput({
      ...regional,
      recipe: {
        ...regional.recipe,
        regions: regional.recipe.regions.map((region) => {
          const role = region.coverage.alpha
          const file = manifest.files[role]
          const bytes = filesInput[role]
          if (
            !file ||
            !Buffer.isBuffer(bytes) ||
            bytes.length !== file.byteSize ||
            digest(bytes) !== file.sha256
          ) {
            refuse('The frozen regional alpha fails its actual byte identity.')
          }
          return { ...region, coverage: { ...region.coverage, alpha: new Uint8Array(bytes) } }
        }),
      },
    })
    bindSmartPatchAnimaRegionalExecution(prepared, requestForEntry(manifest, manifest.items[0]))
    return prepared
  } catch {
    refuse('The frozen Smart regional pixels or complete signed association are invalid.')
  }
}

/** Metadata admission explicitly does not attest the alpha bytes. */
function assertRegionalMetadataAgreement(manifest: FrozenSmartPatchInputV1): void {
  const regional = manifest.regional!
  const recipe = regional.recipe
  const ctx = manifest.context
  const draft = ctx.generationDraft
  const model = draft.model
  const entry = manifest.items[0]
  const matchingMode =
    (regional.profile === ANIMA_SMART_PATCH_REGIONAL_PROFILE &&
      manifest.mode === 'inpaint' &&
      manifest.sourceAlpha === 'opaque') ||
    (regional.profile === ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE &&
      manifest.mode === 'outpaint' &&
      manifest.sourceAlpha === 'mixed')
  if (
    !matchingMode ||
    manifest.items.length !== 1 ||
    entry.family !== 'anima' ||
    manifest.animaPromptInterpretation !== ANIMA_PROMPT_INTERPRETATION ||
    regional.promptInterpretation !== ANIMA_PROMPT_INTERPRETATION ||
    model?.kind !== 'checkpoint' ||
    model.baseModelFamily !== 'anima' ||
    model.predictionType !== null ||
    draft.loras.some((value) => value.enabled) ||
    draft.vae !== null ||
    (draft.vaePrecision ?? 'Auto') !== 'Auto' ||
    (draft.cfgRescale ?? 0) !== 0 ||
    draft.clipSkip !== undefined ||
    draft.sampling.sampler !== null ||
    draft.sampling.scheduler !== null ||
    !['euler', 'heun'].includes(draft.sampling.animaMethod ?? '') ||
    recipe.item.iteration !== 0 ||
    recipe.item.promptPairIndex !== 0 ||
    recipe.documentId !== ctx.documentId ||
    recipe.documentRevision !== ctx.documentRevision ||
    recipe.layerId !== ctx.layerId ||
    !isDeepStrictEqual(recipe.bbox, ctx.bbox) ||
    !isDeepStrictEqual(recipe.internalResolution, ctx.internalResolution) ||
    !isDeepStrictEqual(recipe.smartMask, {
      maskId: ctx.mask.id,
      maskRevision: ctx.mask.revision,
    }) ||
    recipe.modelSha256 !== model.fileSha256 ||
    recipe.item.seed !== entry.item.seed ||
    !isDeepStrictEqual(recipe.item.prompts, entry.item.prompts) ||
    !isDeepStrictEqual(recipe.globalPrompts, {
      negative: draft.negativePrompt,
      positive: draft.positivePrompt,
    }) ||
    !isDeepStrictEqual(recipe.sampling, {
      animaMethod: draft.sampling.animaMethod,
      cfgScale: draft.sampling.cfgScale,
      denoisingStrength: draft.sampling.denoisingStrength,
      steps: draft.sampling.steps,
    }) ||
    !isDeepStrictEqual(entry.inference.prompts, {
      negative: regional.compiledPrompts[1].prompt,
      positive: regional.compiledPrompts[0].prompt,
    })
  ) {
    refuse('The regional input does not describe this one frozen original Anima Smart job.')
  }
  if (
    recipe.regions.some(
      (region) =>
        ctx.sourceLayerIds.includes(region.regionId) || ctx.sourceLayerIds.includes(region.maskId),
    )
  ) {
    refuse('Regional owners must remain independent of frozen source Raster owners.')
  }
  const expectedRoles = recipe.regions.map((region) => region.coverage.alpha)
  const actualRoles = SMART_PATCH_REGIONAL_ALPHA_ROLES.filter((role) =>
    Object.hasOwn(manifest.files, role),
  )
  if (!isDeepStrictEqual(expectedRoles, actualRoles)) {
    refuse('Frozen regional alpha roles must match every ordered region exactly once.')
  }
  for (const role of expectedRoles) {
    const file = manifest.files[role]
    if (!file || !sameSize(file, ctx.bbox) || file.byteSize !== ctx.bbox.width * ctx.bbox.height) {
      refuse('A frozen raw regional alpha descriptor differs from its world pixel dimensions.')
    }
  }
}

/** Build only transient validation fields; neither file access nor a new request identity occurs. */
function requestForEntry(
  manifest: FrozenSmartPatchInputV1,
  entry: FrozenSmartPatchInputItemV1,
): SmartPatchExecutionRequest {
  const root = '/smart-patch-frozen-validation'
  const source = manifest.files['model-source.png']
  return captureSmartPatchExecutionRequest({
    family: entry.family,
    inference: entry.inference,
    internalResolution: manifest.context.internalResolution,
    latentKeepMask: {
      ...manifest.files['latent-keep-mask.png'],
      path: `${root}/latent-keep-mask.png`,
    },
    mode: manifest.mode,
    modelSource: source ? { ...source, path: `${root}/model-source.png` } : null,
    output: { pngPath: `${root}/result.png`, stagingRoot: root },
    protocolVersion: '1',
    requestId: '00000000-0000-4000-8000-000000000000',
    schemaVersion: 1,
    type: 'execute-smart-patch',
  })
}

function validateEntry(
  ctx: FrozenSmartPatchGenerationContext,
  entry: FrozenSmartPatchInputItemV1,
  request: SmartPatchExecutionRequest,
  animaPromptInterpretation?: typeof ANIMA_PROMPT_INTERPRETATION,
): void {
  validateSmartPatchExecutionDraft(ctx, entry.item)
  const draft = ctx.generationDraft
  const model = draft.model!
  if (request.family !== model.baseModelFamily) {
    refuse('The frozen Smart Patch family differs from its authored checkpoint.')
  }
  const enabled = draft.loras.filter((lora) => lora.enabled)
  const loras = request.inference.loras ?? []
  if (
    loras.length !== enabled.length ||
    loras.some(
      (lora, index) =>
        lora.sha256 !== enabled[index].resource.fileSha256 || lora.weight !== enabled[index].weight,
    )
  ) {
    refuse('The frozen Smart Patch LoRA order or exact file differs from its draft.')
  }
  if (new Set(loras.map((lora) => lora.path)).size !== loras.length) {
    refuse('The frozen Smart Patch LoRA paths are duplicated.')
  }
  if (request.family === 'anima') {
    const expected = compileAnimaFlowSamplingPlan({
      guidanceScale: draft.sampling.cfgScale,
      height: ctx.internalResolution.height,
      mode: request.mode === 'txt2img' ? 'txt2img' : 'img2img',
      scheduler: draft.sampling.animaMethod,
      seed: entry.item.seed,
      steps: draft.sampling.steps,
      strength: request.mode === 'txt2img' ? null : draft.sampling.denoisingStrength,
      width: ctx.internalResolution.width,
    })
    if (
      request.inference.model.checkpoint.sha256 !== model.fileSha256 ||
      !isDeepStrictEqual(request.inference.sampling, expected) ||
      !isDeepStrictEqual(request.inference.prompts, {
        negative: compileAnimaPromptWeightingForInterpretation(
          entry.item.prompts.negative,
          animaPromptInterpretation,
        ),
        positive: compileAnimaPromptWeightingForInterpretation(
          entry.item.prompts.positive,
          animaPromptInterpretation,
        ),
      })
    ) {
      refuse('The frozen Anima checkpoint, concrete prompt or sampling interpretation changed.')
    }
    const resources = request.inference.model
    if (
      new Set([
        resources.checkpoint.path,
        resources.qwen3Encoder.path,
        resources.vae.path,
        ...loras.map((lora) => lora.path),
      ]).size !==
      loras.length + 3
    ) {
      refuse('Anima Smart Patch model roles must use distinct files.')
    }
    return
  }
  const inference = request.inference
  const sampling = inference.sampling
  const expectedScheduler = resolveScheduler(draft.sampling.sampler, draft.sampling.scheduler)
  if (
    inference.checkpoint.sha256 !== model.fileSha256 ||
    inference.checkpoint.predictionType === 'sample' ||
    !isDeepStrictEqual(inference.prompts, entry.item.prompts) ||
    sampling.seed !== entry.item.seed ||
    sampling.steps !== draft.sampling.steps ||
    sampling.cfgScale !== draft.sampling.cfgScale ||
    (sampling.cfgRescale ?? 0) !== (draft.cfgRescale ?? 0) ||
    sampling.scheduler !== expectedScheduler ||
    inference.vaePrecision !== (draft.vaePrecision ?? 'Auto') ||
    sampling.denoisingStrength !==
      (request.mode === 'txt2img' ? undefined : draft.sampling.denoisingStrength)
  ) {
    refuse('The frozen Illustrious checkpoint, concrete prompt or sampling differs from its draft.')
  }
  if (
    (draft.vae === null) !== (inference.vae == null) ||
    (draft.vae && inference.vae?.sha256 !== draft.vae.fileSha256)
  ) {
    refuse('The frozen Smart Patch external VAE differs from its draft.')
  }
  for (const polarity of ['positive', 'negative'] as const) {
    const expected = activePromptEmbeddingRefs(
      entry.item.prompts[polarity],
      draft[polarity === 'positive' ? 'positivePrompt' : 'negativePrompt'].embeddingRefs,
    )
    const actual = inference.embeddings?.[polarity] ?? []
    if (
      actual.length !== expected.length ||
      actual.some(
        (ref, index) =>
          ref.token !== expected[index].token || ref.sha256 !== expected[index].resource.fileSha256,
      )
    ) {
      refuse('The frozen Smart Patch effective embeddings differ from its concrete prompt.')
    }
  }
}

function resolveScheduler(sampler: string | null, scheduler: string | null): string | null {
  const result = resolveIllustriousScheduler(sampler, scheduler)
  return result.kind === 'supported' ? result.key : null
}

function capturePlane(
  name: string,
  input: {
    bytes: Buffer
    byteSize?: number
    colorSpace?: string
    height: number
    iccSha256?: string
    sha256: string
    width: number
  },
  files: Record<string, Buffer>,
): FrozenSmartPatchInputFileV1 {
  if (!Buffer.isBuffer(input.bytes)) {
    refuse('A frozen Smart Patch plane is not bytes.')
  }
  if (
    (input.byteSize !== undefined && input.byteSize !== input.bytes.length) ||
    (input.colorSpace !== undefined && input.colorSpace !== 'srgb') ||
    (input.iccSha256 !== undefined && input.iccSha256 !== IGS_SRGB_ICC_SHA256)
  ) {
    refuse('A prepared Smart Patch color plane has inconsistent metadata.')
  }
  files[name] = Buffer.from(input.bytes)
  return {
    byteSize: input.bytes.length,
    height: input.height,
    sha256: input.sha256,
    width: input.width,
  }
}

async function assertColorPng(
  bytes: Buffer,
  name: string,
  ref: FrozenSmartPatchInputFileV1,
  colorType: 2 | 6,
): Promise<void> {
  await validateSrgbPngStream(
    (async function* () {
      yield bytes
    })(),
    name,
    SMART_PATCH_INPUT_PNG_MAX_BYTES,
    2048,
  )
  if (
    bytes.readUInt32BE(16) !== ref.width ||
    bytes.readUInt32BE(20) !== ref.height ||
    bytes[24] !== 8 ||
    bytes[25] !== colorType ||
    bytes[28] !== 0
  ) {
    refuse('The frozen Smart Patch color PNG has wrong topology.')
  }
  let offset = 8
  let profileSeen = false
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset)
    if (bytes.toString('ascii', offset + 4, offset + 8) === 'iCCP') {
      profileSeen = true
    }
    offset += length + 12
  }
  if (!profileSeen) {
    refuse('The frozen Smart Patch color PNG lacks its pinned sRGB profile.')
  }
}
