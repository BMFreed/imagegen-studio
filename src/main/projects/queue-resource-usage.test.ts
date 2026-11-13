import { ANIMA_PROMPT_INTERPRETATION } from '../../shared/projects/anima-prompt-weighting.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import type { AnimaRegionalWorkerInput } from './anima-regional-worker-request.js'
import type { CurrentCanvasRegionalRecipe } from './project-current-canvas-regional-recipe.js'

import { prepareAnimaGenerationBatch } from './anima-generation-batch.js'
import { withAnimaGenerationBatchRequests } from './anima-generation-request.js'
import { buildFrozenQueuedAnimaGenerationV1 } from './anima-queued-generation.js'
import { captureAnimaRegionalQueuedMaterial } from './anima-regional-queued-generation.js'
import {
  buildFrozenQueuedOutpaintV1,
  type FrozenQueuedGenerationV1,
  parseFrozenGenerationPayloadV1,
} from './generation-queue.js'
import { freezeAlphaOutpaintConditioning } from './outpaint-conditioning.js'
import { compileCurrentCanvasAnimaRegionalPrompts } from './project-current-canvas-anima-regional-input.js'
import { type QueuedResourcePayload, queuePayloadResourceUses } from './queue-resource-usage.js'
import {
  captureRegionalQueuedMaterial,
  loadRegionalQueuedResourceUses,
  parseFrozenQueuedRegionalOperationalV1,
} from './regional-queued-generation.js'
import { captureSmartPatchInputMaterial } from './smart-patch-frozen-input.js'
import { parseFrozenQueuedSmartPatchV1 } from './smart-patch-queued-generation.js'
import { ANIMA_BATCH_READY, withAnimaBatchFixture } from './test-fixtures/anima-batch.js'
import { capturedEmbeddingFieldsFixture } from './test-fixtures/generation-embeddings.js'
import { createRegionalQueueFixture } from './test-fixtures/regional-queue.js'
import { attachRegionalReferences } from './test-fixtures/regional-reference.js'
import {
  literalSmartPatchColorPng,
  literalSmartPatchPreparedInput,
} from './test-fixtures/smart-patch-input-material.js'

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const invalid = (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === 'QUEUE_INPUT_INVALID'
type Mode = 'img2img' | 'outpaint' | 'txt2img'

/** Literal numerical metadata goes through the existing strict durable parser. */
async function illustriousPayload(mode: Mode): Promise<FrozenQueuedGenerationV1> {
  const f = await createRegionalQueueFixture()
  try {
    const { output: _output, target, ...job } = f.request.job
    const { path: _path, ...workerTarget } = target
    const context = structuredClone(f.prepared.context)
    if (mode === 'txt2img') {
      return parseFrozenGenerationPayloadV1(
        JSON.stringify({
          context,
          kind: 'illustrious-txt2img',
          originRequestId: f.request.requestId,
          schemaVersion: 1,
          workerJob: { ...job, target: workerTarget },
        }),
      )
    }
    const sampling = { ...context.sampling, denoisingStrength: 0.5 }
    const workerSampling = { ...job.sampling, denoisingStrength: 0.5 }
    if (mode === 'img2img') {
      return parseFrozenGenerationPayloadV1(
        JSON.stringify({
          context: { ...context, kind: 'normal-img2img-preparation', sampling },
          kind: 'illustrious-img2img',
          originRequestId: f.request.requestId,
          schemaVersion: 1,
          workerJob: { ...job, sampling: workerSampling, target: workerTarget },
        }),
      )
    }
    const bytes = literalSmartPatchColorPng(
      64,
      64,
      Array.from({ length: 4096 }, () => [1, 2, 3, 128]).flat(),
      4,
    )
    const conditioning = freezeAlphaOutpaintConditioning({
      bbox: context.bbox,
      sourceTargetSha256: sha(bytes),
      targetPngBytes: bytes,
    }).context
    return parseFrozenGenerationPayloadV1(
      JSON.stringify({
        context: {
          ...context,
          conditioning,
          kind: 'normal-outpaint-preparation',
          sampling,
          target: { ...context.target, byteSize: bytes.length, sha256: sha(bytes) },
        },
        kind: 'illustrious-outpaint',
        originRequestId: f.request.requestId,
        schemaVersion: 1,
        workerJob: {
          ...job,
          sampling: workerSampling,
          target: { ...workerTarget, byteSize: bytes.length, sha256: sha(bytes) },
        },
      }),
    )
  } finally {
    await f.close()
  }
}

async function animaPayload(mode: Mode): Promise<FrozenQueuedGenerationV1> {
  let result!: FrozenQueuedGenerationV1
  await withAnimaBatchFixture(
    async (f) => {
      f.prepared.context.prompts = { negative: '', positive: 'fixed subject' }
      f.prepared.context.generationDraft.positivePrompt = {
        embeddingRefs: [],
        text: 'fixed subject',
      }
      f.prepared.context.generationDraft.negativePrompt = { embeddingRefs: [], text: '' }
      if (mode === 'outpaint') {
        const context = f.prepared.context
        if (context.mode !== 'img2img') {
          throw new Error('Expected explicit IMG fixture')
        }
        const conditioning = freezeAlphaOutpaintConditioning({
          bbox: context.bbox,
          sourceTargetSha256: context.target.sha256,
          targetPngBytes: f.prepared.targetPngBytes,
        }).context
        result = buildFrozenQueuedOutpaintV1(
          {
            context: {
              ...context,
              conditioning,
              kind: 'anima-outpaint-preparation',
              mode: 'outpaint',
            },
            targetPngBytes: f.prepared.targetPngBytes,
          },
          randomUUID(),
        )
        return
      }
      const batch = prepareAnimaGenerationBatch({ iterations: 1, prepared: f.prepared })
      await withAnimaGenerationBatchRequests({
        modelService: f.modelService,
        prepared: batch,
        ready: ANIMA_BATCH_READY,
        scratchBasePath: f.scratch,
        use: async (requests) => {
          result = buildFrozenQueuedAnimaGenerationV1({
            context: batch.context,
            item: batch.items[0],
            request: requests[0],
          })
        },
      })
    },
    { opaque: mode !== 'txt2img', ...(mode === 'outpaint' ? { alpha: 128 } : {}) },
  )
  return result
}

async function smartPayload(family: 'anima' | 'illustrious') {
  const { executions, prepared } = literalSmartPatchPreparedInput(family)
  const { manifest: m } = await captureSmartPatchInputMaterial(prepared, executions)
  return parseFrozenQueuedSmartPatchV1({
    ...(m.animaPromptInterpretation
      ? { animaPromptInterpretation: m.animaPromptInterpretation }
      : {}),
    bundle: { id: randomUUID(), itemIndex: 0, manifestSha256: 'a'.repeat(64) },
    context: m.context,
    files: m.files,
    item: m.items[0],
    kind: `${family}-smart-patch`,
    latentMaskHasCoverage: m.latentMaskHasCoverage,
    mode: m.mode,
    schemaVersion: 1,
    sourceAlpha: m.sourceAlpha,
  })
}

const operations = [
  'illustrious-txt2img',
  'illustrious-img2img',
  'illustrious-outpaint',
  'anima-txt2img',
  'anima-img2img',
  'anima-outpaint',
  'illustrious-smart-patch',
  'anima-smart-patch',
  'illustrious-regional',
  'illustrious-regional-txt2img',
  'illustrious-regional-img2img',
  'illustrious-regional-outpaint',
  'anima-regional-txt2img',
  'anima-regional-img2img',
  'anima-regional-outpaint',
] as const

for (const operation of operations) {
  test(`strict resource projection covers ${operation}`, async () => {
    if (operation === 'illustrious-smart-patch' || operation === 'anima-smart-patch') {
      const payload = await smartPayload(
        operation === 'anima-smart-patch' ? 'anima' : 'illustrious',
      )
      const uses = queuePayloadResourceUses(payload)
      assert.ok(
        uses.some(
          (use) =>
            use.localModelId === payload.context.generationDraft.model!.localModelId &&
            use.localVersionId === payload.context.generationDraft.model!.localVersionId,
        ),
      )
      if (payload.item.family === 'anima') {
        for (const component of [
          payload.item.inference.model.qwen3Encoder,
          payload.item.inference.model.vae,
        ]) {
          assert.ok(
            uses.some(
              (use) => use.managedPath === component.path && use.sha256 === component.sha256,
            ),
          )
        }
      }
      return
    }
    const mode: Mode = operation.endsWith('outpaint')
      ? 'outpaint'
      : operation.endsWith('img2img')
        ? 'img2img'
        : 'txt2img'
    const ordinary = operation.startsWith('anima')
      ? await animaPayload(mode)
      : await illustriousPayload(mode)
    const regional = operation.includes('regional')
    const payload = regional
      ? parseFrozenQueuedRegionalOperationalV1(
          JSON.stringify({
            ...ordinary,
            kind: operation,
            regional: { byteSize: 1, sha256: 'b'.repeat(64) },
            ...(operation === 'illustrious-regional'
              ? {}
              : {
                  compositionProfile: operation.startsWith('anima')
                    ? 'invoke-krea2-global-support-v1'
                    : 'invoke-canvas-v1',
                }),
            ...(operation.startsWith('anima')
              ? { promptInterpretation: ANIMA_PROMPT_INTERPRETATION }
              : {}),
            ...('conditioning' in ordinary.context
              ? {
                  outpaintInfill: {
                    ...ordinary.context.conditioning.infillResource,
                    path: '/owned/inference-resources/lama.pt',
                  },
                }
              : {}),
          }),
        )
      : ordinary
    const uses = queuePayloadResourceUses(payload, regional ? [] : undefined)
    assert.ok(uses.length > 0)
    const model = payload.context.model
    if ('checkpoint' in model) {
      assert.ok(uses.some((use) => use.localModelId === model.checkpoint.reference.localModelId))
      for (const component of [model.qwen3Encoder, model.vae]) {
        assert.ok(
          uses.some(
            (use) =>
              use.localModelId === component.localModelId &&
              use.localVersionId === component.localVersionId &&
              use.managedPath === component.managedPath,
          ),
        )
      }
    } else {
      assert.equal(uses[0].localModelId, model.reference.localModelId)
    }
    if (regional) {
      assert.throws(
        () => queuePayloadResourceUses(payload),
        invalid,
        'The sidecar qualification cannot be omitted',
      )
    }
  })
}

test('Smart projection includes enabled zero LoRA, external VAE and effective signed TI while preserving dormant authoring', async () => {
  const payload = await smartPayload('illustrious')
  if (payload.item.family !== 'illustrious') {
    throw new Error('Expected Illustrious fixture')
  }
  const draft = payload.context.generationDraft
  const model = draft.model!
  const lora = {
    ...model,
    fileSha256: 'b'.repeat(64),
    kind: 'lora' as const,
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: null,
  }
  const disabled = {
    ...lora,
    fileSha256: 'c'.repeat(64),
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
  }
  draft.loras = [
    { enabled: true, resource: lora, weight: 0 },
    { enabled: false, resource: disabled, weight: -0.5 },
  ]
  payload.item.inference.loras = [
    { byteSize: 10, path: '/owned/zero-lora.safetensors', sha256: lora.fileSha256, weight: 0 },
  ]
  const vae = {
    ...lora,
    civitaiFileId: 9103,
    civitaiModelId: 9101,
    civitaiVersionId: 9102,
    fileSha256: 'd'.repeat(64),
    kind: 'vae' as const,
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
  }
  draft.vae = vae
  payload.item.inference.vae = {
    byteSize: 11,
    path: '/owned/external-vae.safetensors',
    sha256: vae.fileSha256,
  }
  const fields = capturedEmbeddingFieldsFixture('/owned')
  draft.positivePrompt = {
    embeddingRefs: fields.embeddingRefs.positive,
    text: fields.prompts.positive,
  }
  draft.negativePrompt = {
    embeddingRefs: fields.embeddingRefs.negative,
    text: fields.prompts.negative,
  }
  payload.item.item.prompts = { ...fields.prompts }
  payload.item.inference.prompts = { ...fields.prompts }
  const workerEmbeddings = (sign: 'negative' | 'positive') =>
    fields.embeddings[sign].map((entry) => ({
      byteSize: entry.byteSize,
      path: entry.managedPath,
      sha256: entry.reference.fileSha256,
      token: entry.token,
    }))
  payload.item.inference.embeddings = {
    negative: workerEmbeddings('negative'),
    positive: workerEmbeddings('positive'),
  }
  const before = structuredClone(payload)
  const uses = queuePayloadResourceUses(payload)
  for (const ref of [
    lora,
    vae,
    fields.embeddings.positive[0].reference,
    fields.embeddings.negative[0].reference,
  ]) {
    assert.ok(uses.some((use) => use.localVersionId === ref.localVersionId))
  }
  assert.equal(
    uses.some((use) => use.localVersionId === disabled.localVersionId),
    false,
  )
  assert.equal(
    uses.some(
      (use) => use.localVersionId === fields.embeddingRefs.positive[1].resource.localVersionId,
    ),
    false,
  )
  uses[0].managedPath = '/caller/mutation'
  assert.deepEqual(payload, before)
})

test('unknown, divergent or incomplete usage cannot become an unrelated empty resource list', async () => {
  assert.throws(
    () =>
      queuePayloadResourceUses({ kind: 'future-operation' } as unknown as QueuedResourcePayload),
    invalid,
  )
  const payload = await smartPayload('illustrious')
  if (payload.item.family !== 'illustrious') {
    throw new Error('Expected Illustrious fixture')
  }
  payload.item.inference.checkpoint.sha256 = 'f'.repeat(64)
  assert.throws(() => queuePayloadResourceUses(payload))
  const base = await illustriousPayload('txt2img')
  const regional = parseFrozenQueuedRegionalOperationalV1(
    JSON.stringify({
      ...base,
      kind: 'illustrious-regional',
      regional: { byteSize: 1, sha256: 'a'.repeat(64) },
    }),
  )
  for (const use of [
    { managedPath: 'relative', sha256: 'a'.repeat(64) },
    { managedPath: '/owned/model', sha256: 'invalid' },
    { localModelId: 'unpaired', managedPath: '/owned/model', sha256: 'a'.repeat(64) },
  ]) {
    assert.throws(() => queuePayloadResourceUses(regional, [use]), invalid)
  }
  assert.throws(() => queuePayloadResourceUses(regional, {} as never), invalid)
  assert.throws(() => queuePayloadResourceUses(regional, [null] as never), invalid)
})

test('owned regional metadata exposes local signed TI without requiring its ML files to exist', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const input = structuredClone(f.input)
    const fields = capturedEmbeddingFieldsFixture(path.join(f.root, 'deliberately-absent-models'))
    const region = input.recipe.regions[0]
    region.positive = {
      embeddingRefs: [fields.embeddingRefs.positive[0]],
      text: fields.prompts.positive,
    }
    region.negative = {
      prompt: { embeddingRefs: fields.embeddingRefs.negative, text: fields.prompts.negative },
      source: 'regional',
    }
    region.embeddings = structuredClone(fields.embeddings)
    const material = captureRegionalQueuedMaterial(input)
    // Preserve this fixture's original worker/context identities and target descriptors.
    const { output: _output, target, ...worker } = input.request.job
    const { path: _path, ...descriptor } = target
    const payload = parseFrozenQueuedRegionalOperationalV1(
      JSON.stringify({
        context: f.prepared.context,
        kind: 'illustrious-regional',
        originRequestId: input.request.requestId,
        regional: material.regional,
        schemaVersion: 1,
        workerJob: { ...worker, target: descriptor },
      }),
    )
    const root = path.join(f.root, 'owned-sidecars')
    await mkdir(root, { mode: 0o700 })
    for (const [name, bytes] of Object.entries(material.files)) {
      await writeFile(path.join(root, name), bytes, { mode: 0o600 })
    }
    const uses = await loadRegionalQueuedResourceUses(root, payload)
    assert.deepEqual(
      uses.map((use) => use.localVersionId).sort(),
      [
        fields.embeddings.positive[0].reference.localVersionId,
        fields.embeddings.negative[0].reference.localVersionId,
      ].sort(),
    )
    const all = queuePayloadResourceUses(payload, uses)
    assert.equal(all.length, 3)
    const file = path.join(root, 'regional.json')
    const bytes = await readFile(file)
    await writeFile(file, Buffer.from(bytes.toString().replace('portrait', 'changed!')))
    await assert.rejects(loadRegionalQueuedResourceUses(root, payload), invalid)
  } finally {
    await f.close()
  }
})

test('regional reference usage does not hash or require adapter/vision weights during inspection', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const input = structuredClone(f.input)
    attachRegionalReferences(input, path.join(f.root, 'absent-reference-weights'))
    const material = captureRegionalQueuedMaterial(input)
    const { output: _output, target, ...worker } = input.request.job
    const { path: _path, ...descriptor } = target
    const payload = parseFrozenQueuedRegionalOperationalV1(
      JSON.stringify({
        compositionProfile: 'invoke-canvas-v1',
        context: f.prepared.context,
        kind: 'illustrious-regional-txt2img',
        originRequestId: input.request.requestId,
        referenceProfile: material.referenceProfile,
        regional: material.regional,
        schemaVersion: 1,
        workerJob: { ...worker, target: descriptor },
      }),
    )
    const root = path.join(f.root, 'owned-reference-sidecars')
    await mkdir(root, { mode: 0o700 })
    for (const [name, bytes] of Object.entries(material.files)) {
      await writeFile(path.join(root, name), bytes, { mode: 0o600 })
    }
    const uses = await loadRegionalQueuedResourceUses(root, payload)
    assert.equal(uses.length, 3)
    assert.deepEqual(
      uses.map((use) => use.managedPath).sort(),
      Object.values(input.references!.resources)
        .map((entry) => entry.path)
        .sort(),
    )
    await mkdir(path.join(f.root, 'absent-reference-weights'))
    for (const resource of Object.values(input.references!.resources)) {
      await writeFile(resource.path, 'corrupt weight bytes')
    }
    assert.deepEqual(await loadRegionalQueuedResourceUses(root, payload), uses)
  } finally {
    await f.close()
  }
})

test('Anima OUT sidecar inspection authenticates metadata and exposes infill without opening missing or corrupt ML weights', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-removal-anima-regional-'))
  try {
    const ordinary = await animaPayload('outpaint')
    if (ordinary.kind !== 'anima-outpaint') {
      throw new Error('Expected Anima OUT fixture')
    }
    const { context } = ordinary
    const prompt = (text: string) => ({ embeddingRefs: [], text })
    const positive = prompt('regional subject')
    const negative = prompt(context.prompts.negative)
    const recipe: CurrentCanvasRegionalRecipe = {
      bbox: context.bbox,
      documentId: context.documentId,
      documentRevision: context.documentRevision,
      family: 'anima',
      globalPrompts: { negative, positive: prompt(context.prompts.positive) },
      item: {
        iteration: 0,
        promptPairIndex: 0,
        prompts: context.prompts,
        seed: context.sampling.seed,
      },
      kind: 'current-canvas-regional-recipe',
      regions: [
        {
          authoredPrompts: { negative: null, positive, useGlobalNegativePrompt: true },
          coverage: {
            alpha: new Uint8Array(context.bbox.width * context.bbox.height).fill(255),
            bounds: context.bbox,
            intersection: context.bbox,
            kind: 'covered',
          },
          maskId: randomUUID(),
          maskRevision: 1,
          negative: { prompt: negative, source: 'current-canvas' },
          positive,
          referenceImages: [],
          regionId: randomUUID(),
        },
      ],
    }
    const infill = {
      ...context.conditioning.infillResource,
      path: path.join(root, 'missing-lama.pt'),
    }
    const compiledPrompts = [...compileCurrentCanvasAnimaRegionalPrompts(recipe)]
    const prompts = {
      negative: compiledPrompts[1].prompt,
      positive: compiledPrompts[0].prompt,
    }
    // The strict frozen base must agree with the same compiler that owns the regional input.
    const frozen = parseFrozenGenerationPayloadV1(
      JSON.stringify({ ...ordinary, workerJob: { ...ordinary.workerJob, prompts } }),
    )
    if (frozen.kind !== 'anima-outpaint') {
      throw new Error('Expected the exact Anima OUT base')
    }
    const requestRoot = path.join(root, 'validation-request')
    const input: AnimaRegionalWorkerInput = {
      compiledPrompts,
      compositionProfile: 'invoke-krea2-global-support-v1',
      promptInterpretation: ANIMA_PROMPT_INTERPRETATION,
      recipe,
      request: {
        job: {
          ...frozen.workerJob,
          conditioning: context.conditioning,
          infillResource: infill,
          output: { pngPath: path.join(requestRoot, 'result.png'), stagingRoot: requestRoot },
          target: { ...frozen.workerJob.target, path: path.join(requestRoot, 'target.png') },
        },
        protocolVersion: '1',
        requestId: ordinary.originRequestId,
        type: 'generate-anima-outpaint',
      },
    }
    const material = captureAnimaRegionalQueuedMaterial(input)
    const payload = parseFrozenQueuedRegionalOperationalV1(
      JSON.stringify({
        ...frozen,
        compositionProfile: material.compositionProfile,
        kind: 'anima-regional-outpaint',
        outpaintInfill: infill,
        promptInterpretation: material.promptInterpretation,
        regional: material.regional,
      }),
    )
    const sidecars = path.join(root, 'owned-sidecars')
    await mkdir(sidecars, { mode: 0o700 })
    for (const [name, bytes] of Object.entries(material.files)) {
      await writeFile(path.join(sidecars, name), bytes, { mode: 0o600 })
    }
    const uses = [{ managedPath: infill.path, sha256: infill.sha256 }]
    assert.deepEqual(await loadRegionalQueuedResourceUses(sidecars, payload), uses)
    await writeFile(infill.path, 'corrupt infill bytes')
    assert.deepEqual(await loadRegionalQueuedResourceUses(sidecars, payload), uses)
    await writeFile(path.join(sidecars, 'regional.json'), '{}')
    await assert.rejects(loadRegionalQueuedResourceUses(sidecars, payload), invalid)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})
