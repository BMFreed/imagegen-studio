import { compileAnimaFlowSamplingPlan } from '../../shared/projects/anima-flow-sampling-plan.js'
import { compileAnimaPromptWeighting } from '../../shared/projects/anima-prompt-weighting.js'
import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import { GENERATION_BATCH_JOB_LIMIT } from '../../shared/projects/generation-batch-policy.js'
import {
  defaultIllustriousNoiseProfile,
  supportsIllustriousNoiseProfile,
} from '../../shared/projects/illustrious-noise-profile.js'

import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import type { OutpaintInfillResolver } from '../runtime/inference-auxiliary-resources.js'
import type { AnimaGenerationModelResolver } from './anima-generation-preparation.js'
import type { GenerationModelResolver } from './illustrious-generation-loras.js'
import type { FrozenGenerationTarget } from './project-generation-target.js'
import type { FrozenSmartPatchGenerationContext } from './project-smart-patch-generation-input.js'
import type { PreparedSmartPatchModelSourceInput } from './project-smart-patch-preparation.js'
import type {
  SmartPatchExecutionRequest,
  SmartPatchExecutionResult,
} from './smart-patch-execution-request.js'
import type { ProjectWorkerClient } from './worker-client.js'

import { validateAnimaGenerationSettings } from './anima-generation-preparation.js'
import {
  effectiveGenerationEmbeddings,
  type FrozenGenerationEmbeddings,
  type FrozenPromptEmbeddingRefs,
  workerEmbeddings,
} from './illustrious-generation-embeddings.js'
import { workerLoras } from './illustrious-generation-loras.js'
import { workerVae } from './illustrious-generation-vae.js'
import {
  GenerationPreparationError,
  validateNormalGenerationDraft,
} from './project-generation-preparation.js'
import { captureSmartPatchExecutionRequest } from './smart-patch-execution-request.js'
import {
  readSmartPatchModelSourceOutput,
  readSmartPatchPreparationOutput,
} from './worker-client.js'

export interface SmartPatchExecutionItem {
  prompts: { negative: string; positive: string }
  seed: number
}

export type SmartPatchExecutionModelResolver = AnimaGenerationModelResolver &
  GenerationModelResolver

export type SmartPatchExecutionPreparationWorker = Pick<
  ProjectWorkerClient,
  'composeTarget' | 'conditionSmartPatch' | 'prepareSmartPatch' | 'prepareSmartPatchModelSource'
>

export interface SmartPatchExecutionOptions {
  generationWorker: {
    executeSmartPatch: (request: SmartPatchExecutionRequest) => Promise<SmartPatchExecutionResult>
  }
  infillResolver?: OutpaintInfillResolver
  /** One already planned concrete item; this boundary never expands prompts or resolves seeds. */
  item: SmartPatchExecutionItem
  modelService: SmartPatchExecutionModelResolver
  preparationWorker: SmartPatchExecutionPreparationWorker
}

export type SmartPatchBatchInputOptions = Omit<
  SmartPatchExecutionOptions,
  'generationWorker' | 'item'
> & {
  /** Already concrete prompt/seed items; preparation never plans or executes them. */
  items: readonly SmartPatchExecutionItem[]
}

export interface ExecutedSmartPatchGenerationInput extends PreparedSmartPatchModelSourceInput {
  item: SmartPatchExecutionItem
  /** Verified processing-size RGB, detached before the operation-owned stage is removed. */
  output: FrozenGenerationTarget['composite']
}

type SmartPatchPreparationOptions = Pick<
  SmartPatchExecutionOptions,
  'infillResolver' | 'modelService' | 'preparationWorker'
>

/** Capture methods as well as values before any asynchronous work can retarget a collaborator. */
export function captureSmartPatchExecutionOptions(
  input: SmartPatchExecutionOptions,
): SmartPatchExecutionOptions {
  return {
    ...captureSmartPatchPreparationOptions(input),
    generationWorker: {
      executeSmartPatch: input.generationWorker.executeSmartPatch.bind(input.generationWorker),
    },
    item: structuredClone(input.item),
  }
}

/** Capture the complete batch and every collaborator synchronously before CPU/resource awaits. */
export function captureSmartPatchBatchInputOptions(
  input: SmartPatchBatchInputOptions,
): SmartPatchBatchInputOptions {
  if (
    !Array.isArray(input.items) ||
    input.items.length < 1 ||
    input.items.length > GENERATION_BATCH_JOB_LIMIT
  ) {
    refuse(
      'GENERATION_PARAMETER_UNSUPPORTED',
      'Smart Patch preparation requires 1..32 concrete items.',
    )
  }
  return {
    ...captureSmartPatchPreparationOptions(input),
    items: structuredClone(input.items),
  }
}

/** One frozen qualification per selection across the batch, followed by real final verification. */
export function createSmartPatchBatchModelResolver(input: SmartPatchExecutionModelResolver): {
  models: SmartPatchExecutionModelResolver
  reverify: () => Promise<void>
} {
  const models = captureSmartPatchModelResolver(input)
  const verifications: (() => Promise<void>)[] = []
  const memoize = <Args extends unknown[], Result>(
    resolve: (...args: Args) => Promise<Result>,
  ): ((...args: Args) => Promise<Result>) => {
    const snapshots = new Map<string, Promise<Result>>()
    return (...args) => {
      const capturedArgs = structuredClone(args)
      const key = JSON.stringify(capturedArgs)
      let pending = snapshots.get(key)
      if (!pending) {
        pending = resolve(...capturedArgs).then((result) => {
          const snapshot = structuredClone(result)
          verifications.push(async () => {
            requireUnchanged(snapshot, await resolve(...structuredClone(capturedArgs)))
          })
          return snapshot
        })
        snapshots.set(key, pending)
      }
      return pending.then((result) => structuredClone(result))
    }
  }
  return {
    models: {
      // The unbound-token check is concrete-prompt-specific and intentionally runs for every item.
      assertNoUnboundGenerationEmbeddings: models.assertNoUnboundGenerationEmbeddings,
      resolveVerifiedAnimaGenerationLoraForPlan: memoize(
        models.resolveVerifiedAnimaGenerationLoraForPlan,
      ),
      resolveVerifiedGenerationAnimaBundleForPlan: memoize(
        models.resolveVerifiedGenerationAnimaBundleForPlan,
      ),
      resolveVerifiedGenerationCheckpointForPlan: memoize(
        models.resolveVerifiedGenerationCheckpointForPlan,
      ),
      resolveVerifiedGenerationEmbeddingForPlan: memoize(
        models.resolveVerifiedGenerationEmbeddingForPlan,
      ),
      resolveVerifiedGenerationLoraForPlan: memoize(models.resolveVerifiedGenerationLoraForPlan),
      resolveVerifiedGenerationVaeForPlan: memoize(models.resolveVerifiedGenerationVaeForPlan),
    },
    reverify: async () => {
      for (const verify of verifications) {
        await verify()
      }
    },
  }
}

/** Preflight uses the authored policy for validity and the explicit item's seed for availability. */
export function validateSmartPatchExecutionDraft(
  context: FrozenSmartPatchGenerationContext,
  item: SmartPatchExecutionItem,
): void {
  if (
    !Number.isSafeInteger(item?.seed) ||
    item.seed < 0 ||
    item.seed > 0xff_ff_ff_ff ||
    typeof item.prompts?.positive !== 'string' ||
    typeof item.prompts.negative !== 'string' ||
    Buffer.byteLength(item.prompts.positive, 'utf8') > 16 * 1024 ||
    Buffer.byteLength(item.prompts.negative, 'utf8') > 16 * 1024
  ) {
    refuse('GENERATION_PARAMETER_UNSUPPORTED', 'Smart Patch requires one bounded concrete item.')
  }
  const draft = context.generationDraft
  if (draft.model?.baseModelFamily === 'anima') {
    validateAnimaGenerationSettings(draft, {
      internalResolution: context.internalResolution,
      lastActualSeed: item.seed,
      lastActualSeedSnapshot: context.lastActualSeedSnapshot,
    })
    return
  }
  const valid = validateNormalGenerationDraft(draft, item.seed, context.lastActualSeedSnapshot)
  if (
    valid.invokeScheduler === null ||
    valid.steps > 200 ||
    valid.cfgScale < 1 ||
    valid.cfgScale > 30
  ) {
    refuse(
      'GENERATION_SAMPLING_UNSUPPORTED',
      'Choose bounded explicit Smart Patch sampling settings.',
    )
  }
}

/** Freeze exact resources and verify actual prepared files without running a family model. */
export async function prepareSmartPatchExecutionRequest(input: {
  item: SmartPatchExecutionItem
  modelService: SmartPatchExecutionModelResolver
  prepared: PreparedSmartPatchModelSourceInput
  stagingRoot: string
}): Promise<SmartPatchExecutionRequest> {
  const prepared = copyPreparedInput(input.prepared)
  const item = structuredClone(input.item)
  const modelService = captureSmartPatchModelResolver(input.modelService)
  const stagingRoot = input.stagingRoot
  const { context, mode } = prepared
  const size = context.internalResolution
  validateSmartPatchExecutionDraft(context, item)
  const inference =
    context.generationDraft.model?.baseModelFamily === 'anima'
      ? await prepareAnimaInference(prepared, item, modelService)
      : await prepareIllustriousInference(prepared, item, modelService)
  const modelSource = prepared.modelSource
    ? {
        byteSize: prepared.modelSource.byteSize,
        height: size.height,
        path: path.join(stagingRoot, 'model-source.png'),
        sha256: prepared.modelSource.sha256,
        width: size.width,
      }
    : null
  const keep = prepared.conditioning.latentKeepMask
  const latentKeepMask = {
    byteSize: keep.bytes.length,
    height: keep.height,
    path: path.join(stagingRoot, 'latent-keep-mask.png'),
    sha256: keep.sha256,
    width: keep.width,
  }
  // Resource qualification awaits must not make a replaced input file authoritative.
  await readSmartPatchPreparationOutput(latentKeepMask.path, latentKeepMask, 'mask')
  if (modelSource && prepared.modelSource) {
    await readSmartPatchModelSourceOutput(modelSource.path, {
      ...modelSource,
      colorSpace: 'srgb',
      iccSha256: prepared.modelSource.iccSha256,
    })
  }
  const common = {
    internalResolution: { ...size },
    latentKeepMask,
    mode,
    modelSource,
    output: { pngPath: path.join(stagingRoot, 'model-result.png'), stagingRoot },
    protocolVersion: '1' as const,
    requestId: randomUUID(),
    schemaVersion: 1 as const,
    type: 'execute-smart-patch' as const,
  }
  const request: SmartPatchExecutionRequest =
    inference.family === 'anima'
      ? { ...common, family: 'anima', inference: inference.inference }
      : { ...common, family: 'illustrious', inference: inference.inference }
  return captureSmartPatchExecutionRequest(request)
}

/** Called only inside the capture's registered whole-operation lease. */
export async function executePreparedSmartPatch(input: {
  execution: SmartPatchExecutionOptions
  prepared: PreparedSmartPatchModelSourceInput
  stagingRoot: string
}): Promise<ExecutedSmartPatchGenerationInput> {
  const prepared = copyPreparedInput(input.prepared)
  const item = structuredClone(input.execution.item)
  const { generationWorker, modelService } = input.execution
  const request = await prepareSmartPatchExecutionRequest({
    item,
    modelService,
    prepared,
    stagingRoot: input.stagingRoot,
  })
  const size = prepared.context.internalResolution
  const result = structuredClone(await generationWorker.executeSmartPatch(request))
  if (result.output.width !== size.width || result.output.height !== size.height) {
    refuse('GENERATION_INPUT_CHANGED', 'Smart Patch output differs from its frozen internal size.')
  }
  // This is intentionally repeated outside the concrete transport: adapters cannot bypass Main's
  // actual file/CRC/profile/RGB/hash checks by returning plausible metadata.
  const bytes = await readSmartPatchModelSourceOutput(request.output.pngPath, result.output)
  return {
    ...prepared,
    item,
    output: {
      bytes,
      byteSize: bytes.length,
      colorSpace: 'srgb',
      height: size.height,
      iccSha256: IGS_SRGB_ICC_SHA256,
      sha256: result.output.sha256,
      width: size.width,
    },
  }
}

function captureSmartPatchPreparationOptions(
  input: SmartPatchPreparationOptions,
): SmartPatchPreparationOptions {
  const worker = input.preparationWorker
  const resolver = input.infillResolver
  return {
    ...(resolver
      ? {
          infillResolver: {
            resolveVerifiedOutpaintInfill: resolver.resolveVerifiedOutpaintInfill.bind(resolver),
          },
        }
      : {}),
    modelService: captureSmartPatchModelResolver(input.modelService),
    preparationWorker: {
      composeTarget: worker.composeTarget.bind(worker),
      conditionSmartPatch: worker.conditionSmartPatch.bind(worker),
      prepareSmartPatch: worker.prepareSmartPatch.bind(worker),
      prepareSmartPatchModelSource: worker.prepareSmartPatchModelSource.bind(worker),
    },
  }
}

function captureSmartPatchModelResolver(
  models: SmartPatchExecutionModelResolver,
): SmartPatchExecutionModelResolver {
  return {
    assertNoUnboundGenerationEmbeddings: models.assertNoUnboundGenerationEmbeddings.bind(models),
    resolveVerifiedAnimaGenerationLoraForPlan:
      models.resolveVerifiedAnimaGenerationLoraForPlan.bind(models),
    resolveVerifiedGenerationAnimaBundleForPlan:
      models.resolveVerifiedGenerationAnimaBundleForPlan.bind(models),
    resolveVerifiedGenerationCheckpointForPlan:
      models.resolveVerifiedGenerationCheckpointForPlan.bind(models),
    resolveVerifiedGenerationEmbeddingForPlan:
      models.resolveVerifiedGenerationEmbeddingForPlan.bind(models),
    resolveVerifiedGenerationLoraForPlan: models.resolveVerifiedGenerationLoraForPlan.bind(models),
    resolveVerifiedGenerationVaeForPlan: models.resolveVerifiedGenerationVaeForPlan.bind(models),
  }
}

async function prepareIllustriousInference(
  prepared: PreparedSmartPatchModelSourceInput,
  item: SmartPatchExecutionItem,
  models: SmartPatchExecutionModelResolver,
): Promise<{
  family: 'illustrious'
  inference: Extract<SmartPatchExecutionRequest, { family: 'illustrious' }>['inference']
}> {
  const { context, mode } = prepared
  const draft = context.generationDraft
  const valid = validateNormalGenerationDraft(draft, item.seed, context.lastActualSeedSnapshot)
  if (valid.invokeScheduler === null) {
    refuse('GENERATION_SAMPLING_REQUIRED', 'Choose an explicit Illustrious sampler and scheduler.')
  }
  if (mode !== 'txt2img' && draft.sampling.denoisingStrength === null) {
    refuse('GENERATION_SAMPLING_REQUIRED', 'Set Denoising Strength for the captured Smart Patch.')
  }
  await models.assertNoUnboundGenerationEmbeddings({
    modelFamily: 'illustrious',
    negativePrompt: { ...structuredClone(draft.negativePrompt), text: item.prompts.negative },
    positivePrompt: { ...structuredClone(draft.positivePrompt), text: item.prompts.positive },
  })
  const checkpoint = structuredClone(
    await models.resolveVerifiedGenerationCheckpointForPlan(structuredClone(valid.model)),
  )
  const predictionType = checkpoint.reference.predictionType
  if (predictionType !== 'epsilon' && predictionType !== 'v_prediction') {
    refuse('GENERATION_PREDICTION_UNAVAILABLE', 'Smart Patch requires a qualified prediction type.')
  }
  const noiseProfile = structuredClone(checkpoint.noiseProfile ?? defaultIllustriousNoiseProfile())
  if (!supportsIllustriousNoiseProfile(valid.invokeScheduler, noiseProfile)) {
    refuse('GENERATION_SAMPLING_UNSUPPORTED', 'The sampler does not support this noise profile.')
  }
  const vae = draft.vae
    ? structuredClone(await models.resolveVerifiedGenerationVaeForPlan(structuredClone(draft.vae)))
    : null
  const loras = []
  for (const entry of draft.loras) {
    if (entry.enabled) {
      const verified = structuredClone(
        await models.resolveVerifiedGenerationLoraForPlan(structuredClone(entry.resource)),
      )
      loras.push({ ...verified, weight: entry.weight })
    }
  }
  const refs: FrozenPromptEmbeddingRefs = {
    negative: structuredClone(draft.negativePrompt.embeddingRefs),
    positive: structuredClone(draft.positivePrompt.embeddingRefs),
  }
  const pool: FrozenGenerationEmbeddings = { negative: [], positive: [] }
  for (const polarity of ['positive', 'negative'] as const) {
    for (const ref of refs[polarity]) {
      const verified = structuredClone(
        await models.resolveVerifiedGenerationEmbeddingForPlan(structuredClone(ref.resource)),
      )
      pool[polarity].push({ ...verified, token: ref.token })
    }
  }
  const embeddings = effectiveGenerationEmbeddings(item.prompts, refs, pool)
  const inference: Extract<SmartPatchExecutionRequest, { family: 'illustrious' }>['inference'] = {
    checkpoint: {
      path: checkpoint.managedPath,
      predictionType,
      sha256: checkpoint.reference.fileSha256,
    },
    ...(workerEmbeddings({ embeddings }) ? { embeddings: workerEmbeddings({ embeddings }) } : {}),
    loras: workerLoras({ loras }),
    prompts: { ...item.prompts },
    sampling: {
      cfgRescale: valid.cfgRescale,
      cfgScale: valid.cfgScale,
      ...(mode !== 'txt2img' ? { denoisingStrength: draft.sampling.denoisingStrength! } : {}),
      noiseProfile,
      scheduler: valid.invokeScheduler,
      seed: item.seed,
      steps: valid.steps,
    },
    vae: workerVae({ vae }),
    vaePrecision: draft.vaePrecision ?? 'Auto',
  }
  // Verify each frozen selection again after the remaining resource awaits. These checks never
  // consult the current Project, current Default or later authoring values.
  requireUnchanged(
    checkpoint,
    await models.resolveVerifiedGenerationCheckpointForPlan(structuredClone(checkpoint.reference)),
  )
  if (vae) {
    requireUnchanged(
      vae,
      await models.resolveVerifiedGenerationVaeForPlan(structuredClone(vae.reference)),
    )
  }
  for (const entry of loras) {
    const verified = await models.resolveVerifiedGenerationLoraForPlan(
      structuredClone(entry.reference),
    )
    requireUnchanged(entry, { ...verified, weight: entry.weight })
  }
  for (const polarity of ['positive', 'negative'] as const) {
    for (const entry of embeddings[polarity]) {
      const verified = await models.resolveVerifiedGenerationEmbeddingForPlan(
        structuredClone(entry.reference),
      )
      requireUnchanged(entry, { ...verified, token: entry.token })
    }
  }
  return { family: 'illustrious', inference }
}

async function prepareAnimaInference(
  prepared: PreparedSmartPatchModelSourceInput,
  item: SmartPatchExecutionItem,
  models: SmartPatchExecutionModelResolver,
): Promise<{
  family: 'anima'
  inference: Extract<SmartPatchExecutionRequest, { family: 'anima' }>['inference']
}> {
  const { context, mode } = prepared
  const draft = context.generationDraft
  const reference = draft.model
  if (!reference) {
    refuse('GENERATION_MODEL_REQUIRED', 'Choose an Anima checkpoint first.')
  }
  const strength = mode === 'txt2img' ? null : draft.sampling.denoisingStrength
  if (mode !== 'txt2img' && strength === null) {
    refuse('GENERATION_SAMPLING_REQUIRED', 'Set Denoising Strength for the captured Smart Patch.')
  }
  const sampling = compileAnimaFlowSamplingPlan({
    guidanceScale: draft.sampling.cfgScale,
    height: context.internalResolution.height,
    mode: mode === 'txt2img' ? 'txt2img' : 'img2img',
    scheduler: draft.sampling.animaMethod,
    seed: item.seed,
    steps: draft.sampling.steps,
    strength,
    width: context.internalResolution.width,
  })
  const prompts = {
    negative: compileAnimaPromptWeighting(item.prompts.negative),
    positive: compileAnimaPromptWeighting(item.prompts.positive),
  }
  const model = structuredClone(
    await models.resolveVerifiedGenerationAnimaBundleForPlan(structuredClone(reference)),
  )
  const loras = []
  for (const entry of draft.loras) {
    if (entry.enabled) {
      const verified = structuredClone(
        await models.resolveVerifiedAnimaGenerationLoraForPlan(structuredClone(entry.resource)),
      )
      loras.push({ ...verified, weight: entry.weight })
    }
  }
  const inference: Extract<SmartPatchExecutionRequest, { family: 'anima' }>['inference'] = {
    loras: loras.map((entry) => ({
      byteSize: entry.byteSize,
      path: entry.managedPath,
      sha256: entry.reference.fileSha256,
      weight: entry.weight,
    })),
    model: {
      architecture: model.architecture,
      checkpoint: {
        byteSize: model.checkpoint.byteSize,
        path: model.checkpoint.managedPath,
        sha256: model.checkpoint.reference.fileSha256,
      },
      qwen3Encoder: {
        byteSize: model.qwen3Encoder.byteSize,
        path: model.qwen3Encoder.managedPath,
        sha256: model.qwen3Encoder.sha256,
      },
      vae: {
        byteSize: model.vae.byteSize,
        path: model.vae.managedPath,
        sha256: model.vae.sha256,
      },
    },
    prompts,
    sampling,
  }
  requireUnchanged(
    model,
    await models.resolveVerifiedGenerationAnimaBundleForPlan(
      structuredClone(model.checkpoint.reference),
    ),
  )
  for (const entry of loras) {
    const verified = await models.resolveVerifiedAnimaGenerationLoraForPlan(
      structuredClone(entry.reference),
    )
    requireUnchanged(entry, { ...verified, weight: entry.weight })
  }
  return { family: 'anima', inference }
}

function requireUnchanged(expected: unknown, actual: unknown): void {
  if (!isDeepStrictEqual(expected, actual)) {
    refuse(
      'GENERATION_RESOURCE_CHANGED',
      'An exact Smart Patch resource changed during preparation.',
    )
  }
}

function copyPreparedInput(
  input: PreparedSmartPatchModelSourceInput,
): PreparedSmartPatchModelSourceInput {
  const copyBytes = <T extends { bytes: Buffer }>(plane: T): T => ({
    ...plane,
    bytes: Buffer.from(plane.bytes),
  })
  return {
    ...input,
    coherence: structuredClone(input.coherence),
    conditioning: {
      ...input.conditioning,
      expandedProcessingKeepMask: copyBytes(input.conditioning.expandedProcessingKeepMask),
      expandedWorldKeepMask: copyBytes(input.conditioning.expandedWorldKeepMask),
      finalContributionMask: copyBytes(input.conditioning.finalContributionMask),
      latentKeepMask: copyBytes(input.conditioning.latentKeepMask),
      processingKeepMask: copyBytes(input.conditioning.processingKeepMask),
      worldKeepMask: copyBytes(input.conditioning.worldKeepMask),
    },
    context: structuredClone(input.context),
    effectiveMask: copyBytes(input.effectiveMask),
    maskPngBytes: input.maskPngBytes ? Buffer.from(input.maskPngBytes) : null,
    modelSource: input.modelSource ? copyBytes(input.modelSource) : null,
    processingMask: copyBytes(input.processingMask),
    processingSource: copyBytes(input.processingSource),
    source: copyBytes(input.source),
  }
}

function refuse(code: string, message: string): never {
  throw new GenerationPreparationError(code, message)
}
