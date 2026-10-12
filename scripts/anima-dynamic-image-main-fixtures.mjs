/**
 * Actual Main Anima image preparation/expansion → SQLite/private inputs → native request DTO →
 * staging publication/receipt/read → accepted-provenance projection. Exact resource resolution,
 * Project/index ownership, LaMa metadata and output pixels are controlled preconditions. No
 * installed weights, composition worker, ML, public Project Add/Undo or Save claim.
 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'

import { openAppDatabase } from '../src/main/db/database.ts'
import { prepareAnimaGenerationBatch } from '../src/main/projects/anima-generation-batch.ts'
import { buildQueuedAnimaWorkerRequest } from '../src/main/projects/anima-generation-dispatch.ts'
import {
  prepareAnimaGeneration,
  prepareAnimaOutpaintGeneration,
} from '../src/main/projects/anima-generation-preparation.ts'
import { GenerationOrchestrator } from '../src/main/projects/generation-orchestrator.ts'
import { GenerationQueueRepository } from '../src/main/projects/generation-queue.ts'
import { GenerationStagingRepository } from '../src/main/projects/generation-staging.ts'
import { buildQueuedOutpaintWorkerRequest } from '../src/main/projects/outpaint-worker-request.ts'
import { localProjectRecoveryKey } from '../src/main/projects/project-identity.ts'
import { provenanceFromVerifiedRasterCandidate } from '../src/main/projects/project-generation-provenance.ts'
import { outpaintPngFromAlpha } from '../src/main/projects/test-fixtures/outpaint-contribution.ts'
import { IGS_SRGB_ICC_SHA256 } from '../src/shared/projects/color-profile.ts'
import { createEmptyProjectDocumentV1 } from '../src/shared/projects/project-schema.ts'

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const ready = {
  protocolVersion: '1',
  runtimeProfile: 'linux-nvidia',
  workerVersion: '0.14.0',
  capabilities: [
    'illustrious-txt2img',
    'denoising-progress',
    'candidate-thumbnails',
    'illustrious-cfg-rescale',
    'illustrious-img2img',
    'illustrious-lora',
    'illustrious-vae-precision',
    'illustrious-external-vae',
    'illustrious-embeddings',
    'illustrious-outpaint',
    'anima-txt2img',
    'anima-img2img',
    'anima-lora',
    'anima-prompt-weighting',
    'anima-flow-sampling',
    'anima-outpaint',
  ],
}

/** Metadata precondition; these descriptors never claim downloaded/qualified/trained files. */
export function installedFixture() {
  const root = path.join(homedir(), '.codex/artifacts/imagegen-studio/pool')
  const appData = path.join(root, 'data/imagegen-studio')
  const fields = {
    encoder: [
      700010,
      1192135096,
      'cd2a512003e2f9f3cd3c32a9c3573f820bb28c940f73c57b1ddaa983d9223eba',
      'qwen3_encoder',
      'Qwen3 encoder',
      'Anima Qwen3 0.6B',
    ],
    vae: [
      700020,
      253806246,
      'a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f',
      'vae',
      'Anima VAE',
      'Anima Qwen Image VAE',
    ],
    anima: [
      700030,
      4182275752,
      '0fc7507b222e52ac8cc5e2826786bc4caed05223df32d17aeb05a76cb4de9941',
      'checkpoint',
      'Cyberfalafel',
      'Cyberfalafel anima v1.0',
    ],
    animaLora: [
      700050,
      138663759,
      'cd9639b03d4458323e696e3792ff7535ae03f9f70368d6d0dc17fe86fa4f354f',
      'lora',
      'Myth Portrait',
      'Anima Portrait Style',
    ],
  }
  return {
    appData,
    ...Object.fromEntries(
      Object.entries(fields).map(([key, [id, byteSize, sha256, type, name, versionName]]) => [
        key,
        {
          byteSize,
          sha256,
          type,
          name,
          versionName,
          family: 'anima',
          path: path.join(root, 'sources', `${key}.safetensors`),
          origin:
            key === 'anima'
              ? { modelId: 1147756, versionId: 3120487, fileId: 3000817 }
              : key === 'animaLora'
                ? { modelId: 599757, versionId: 3084665, fileId: 2964030 }
                : {},
          installed: {
            resourceId: randomUUID(),
            versionId: randomUUID(),
            managedPath: path.join(appData, 'models', `qualified-${id}.safetensors`),
          },
        },
      ]),
    ),
  }
}

export function resource(reference, key) {
  assert.ok(['anima', 'animaLora'].includes(key))
  const source = reference[key]
  return {
    baseModelFamily: 'anima',
    civitaiFileId: source.origin.fileId,
    civitaiModelId: source.origin.modelId,
    civitaiVersionId: source.origin.versionId,
    displayName: source.name,
    fileSha256: source.sha256,
    kind: source.type,
    localModelId: source.installed.resourceId,
    localVersionId: source.installed.versionId,
    predictionType: null,
    versionName: source.versionName,
  }
}

/** Handwritten templates enter production; neither an oracle nor a planner constructs this input. */
export function authoring(reference, stage, mode) {
  assert.ok(['baseline', 'prefix'].includes(stage))
  assert.ok(['img2img', 'outpaint'].includes(mode))
  return {
    model: resource(reference, 'anima'),
    vae: null,
    vaePrecision: 'Auto',
    cfgRescale: 0,
    positivePrompt: {
      text: 'a {(red:1.3)|(blue:1.3)} ceramic cup on a wooden table, studio photograph',
      embeddingRefs: [],
    },
    negativePrompt: { text: '{(blurry:0.7)|(noisy:0.7)}, low quality', embeddingRefs: [] },
    seed: { policy: 'fixed', value: 0 },
    dynamicPrompt: { maxPrompts: stage === 'baseline' ? 4 : 1, seedBehavior: 'per-iteration' },
    sampling: {
      animaMethod: 'euler',
      steps: 3,
      cfgScale: 4,
      sampler: 'Euler',
      scheduler: 'Normal',
      denoisingStrength: 0.5,
    },
    loras: [{ enabled: true, resource: resource(reference, 'animaLora'), weight: -0.5 }],
  }
}

function sourceAlpha() {
  const alpha = Buffer.alloc(256 * 256)
  for (let row = 0; row < 256; row++) alpha.fill(255, row * 256, row * 256 + 192)
  return alpha
}

/** Literal output-alpha precondition; production independently verifies source/policy agreement. */
function contributionAlpha() {
  const alpha = Buffer.alloc(256 * 256)
  for (let row = 0; row < 256; row++) {
    alpha.set(
      [0, 5, 12, 23, 36, 52, 70, 89, 109, 130, 151, 172, 193, 212, 230, 247],
      row * 256 + 152,
    )
    alpha.fill(255, row * 256 + 168, (row + 1) * 256)
  }
  return alpha
}

function controlledResourceResolvers(reference, resolutionChecks) {
  const component = (key) => ({
    byteSize: reference[key].byteSize,
    localModelId: reference[key].installed.resourceId,
    localVersionId: reference[key].installed.versionId,
    managedPath: reference[key].installed.managedPath,
    sha256: reference[key].sha256,
  })
  const bundle = {
    architecture: 'anima-base-1.0',
    checkpoint: {
      byteSize: reference.anima.byteSize,
      managedPath: reference.anima.installed.managedPath,
      reference: resource(reference, 'anima'),
    },
    qwen3Encoder: component('encoder'),
    vae: component('vae'),
  }
  const lora = {
    byteSize: reference.animaLora.byteSize,
    managedPath: reference.animaLora.installed.managedPath,
    reference: resource(reference, 'animaLora'),
  }
  return {
    // Catalog/header qualification and trained bytes are outside this subject. The exact original
    // descriptors are controlled inputs, not substitutes for expansion, compilation or provenance.
    // The real cross-family OUT qualifier binds this complete interface before selecting Anima.
    // These unsupported branches must never be invoked; their presence only makes the declared
    // collaborator structurally complete, without bypassing any actual OUT qualification owner.
    assertNoUnboundGenerationEmbeddings: async () =>
      assert.fail('No Illustrious embedding binding.'),
    resolveVerifiedGenerationEmbeddingForPlan: async () =>
      assert.fail('No Anima prompt embedding.'),
    resolveVerifiedGenerationVaeForPlan: async () => assert.fail('No standalone Anima VAE.'),
    resolveVerifiedGenerationAnimaBundleForPlan: async (selected) => {
      assert.deepEqual(selected, resource(reference, 'anima'))
      resolutionChecks.push({ kind: 'bundle', reference: structuredClone(selected) })
      return structuredClone(bundle)
    },
    resolveVerifiedAnimaGenerationLoraForPlan: async (selected) => {
      assert.deepEqual(selected, resource(reference, 'animaLora'))
      resolutionChecks.push({ kind: 'lora', reference: structuredClone(selected) })
      return structuredClone(lora)
    },
    resolveVerifiedGenerationCheckpointForPlan: async () => assert.fail('No Illustrious input.'),
    resolveVerifiedGenerationLoraForPlan: async () => assert.fail('No Illustrious adapter.'),
  }
}

/**
 * Real producer, durable inputs and publication. `plain` changes only the authored sign text and
 * requested iterations to supply the attention-free neighbor. It never supplies a prepared context,
 * expanded pair, compiled span, frozen row, candidate receipt or projected accepted configuration.
 */
export async function produced(reference, stage, mode, options = {}) {
  const document = createEmptyProjectDocumentV1({ title: 'Anima image Main boundary' })
  document.primaryBbox = { x: mode === 'outpaint' ? 64 : 0, y: 0, width: 256, height: 256 }
  document.generationDraft = authoring(reference, stage, mode)
  const iterations = options.plain === true ? 1 : 2
  if (options.plain === true) {
    document.generationDraft.positivePrompt.text =
      'a red ceramic cup on a wooden table, studio photograph'
    document.generationDraft.negativePrompt.text = 'blurry, low quality'
  }
  const authoredDraft = structuredClone(document.generationDraft)
  // Both modes use the same literal RGB pattern. Only alpha changes; composition remains a
  // controlled precondition, while actual Main PNG/alpha/ICC checks and source capture stay real.
  const sourceBytes = await outpaintPngFromAlpha(
    mode === 'outpaint' ? sourceAlpha() : Buffer.alloc(256 * 256, 255),
    256,
    256,
  )
  const target = {
    bbox: { ...document.primaryBbox },
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    generationDraft: document.generationDraft,
    lastActualSeedSnapshot: null,
    mode,
    composite: {
      bytes: Buffer.from(sourceBytes),
      byteSize: sourceBytes.length,
      colorSpace: 'srgb',
      height: 256,
      width: 256,
      iccSha256: IGS_SRGB_ICC_SHA256,
      sha256: digest(sourceBytes),
    },
  }
  const resolutionChecks = []
  const models = controlledResourceResolvers(reference, resolutionChecks)
  let picks = 0
  const prepared = await (
    mode === 'outpaint' ? prepareAnimaOutpaintGeneration : prepareAnimaGeneration
  )({
    target,
    modelService: models,
    randomUint32: () => {
      picks++
      assert.fail('Fixed0 preparation must not draw a Random seed.')
    },
  })
  const originalPrepared = structuredClone(prepared.context)
  // IMG's real producer returns immutable output. This mutable retained-caller copy lets the test
  // prove orchestrator capture rather than merely benefiting from the producer's Object.freeze.
  const preparedBatch =
    mode === 'img2img'
      ? structuredClone(prepareAnimaGenerationBatch({ prepared, iterations }))
      : undefined
  const batchOptions = {
    iterations,
    maxPrompts: authoredDraft.dynamicPrompt.maxPrompts,
    seedBehavior: 'per-iteration',
  }
  const temporary = await mkdtemp(path.join(tmpdir(), 'igs-anima-dynamic-image-main-'))
  let database
  try {
    database = openAppDatabase(temporary, path.resolve('src/main/db/migrations'))
    const scratch = path.join(temporary, 'scratch')
    await mkdir(scratch, { mode: 0o700 })
    const projectPath = path.join(temporary, 'producer.igs')
    // A canonical identity file satisfies this owner's precondition; it is not a portable package.
    const projectIdentityBytes = Buffer.from('Anima Main identity file; not an IGS package')
    await writeFile(projectPath, projectIdentityBytes, { flag: 'wx', mode: 0o600 })
    const tabId = localProjectRecoveryKey(projectPath)
    const queue = new GenerationQueueRepository(database.db, temporary)
    const staging = new GenerationStagingRepository(database.db, temporary)
    await queue.recoverAfterRestart()
    await staging.recoverAfterRestart()
    const infill = {
      byteSize: 205669692,
      role: 'outpaint-infill',
      sha256: '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9',
      managedPath: path.join(reference.appData, 'inference-resources/big-lama.pt'),
    }
    const capacityChecks = []
    const orchestrator = new GenerationOrchestrator(
      {
        getOpenDocumentId: (id) => (id === tabId ? document.documentId : null),
        getOpenTabs: () => [{ id: tabId }],
        prepareNormalGenerationContext: async () => assert.fail('Prepared batch must not reread.'),
      },
      {
        getProject: async () => ({
          canonicalPath: projectPath,
          documentId: document.documentId,
          fileHealth: 'ready',
          localProjectKey: tabId,
        }),
      },
      models,
      queue,
      {
        assertReadyForPublication: () => staging.assertReadyForPublication(),
        preflightBatchCapacity: async (input) => {
          capacityChecks.push(structuredClone(input))
          await staging.preflightBatchCapacity(input)
        },
      },
      {
        cancelAndWait: async () => assert.fail('No cancellation.'),
        runOne: async () => assert.fail('No native inference.'),
      },
      scratch,
      {
        // Only exact local-LaMa identity is supplied. No trained file or infill invocation.
        resolveVerifiedOutpaintInfill: async () => structuredClone(infill),
      },
    )
    let edits = 0
    const callerReady = structuredClone(ready)
    const editRetainedCaller = async () => {
      edits++
      document.generationDraft.seed = { policy: 'fixed', value: 37 }
      document.generationDraft.positivePrompt.text = 'late ordinary positive'
      document.generationDraft.negativePrompt.text = 'late ordinary negative'
      document.generationDraft.dynamicPrompt = { maxPrompts: 1, seedBehavior: 'per-prompt' }
      document.generationDraft.sampling.animaMethod = 'heun'
      document.generationDraft.sampling.steps = 9
      document.generationDraft.sampling.denoisingStrength = 0.9
      document.generationDraft.loras[0].weight = 0.5
      prepared.context.sampling.seed = 37
      prepared.context.sampling.animaMethod = 'heun'
      prepared.context.sampling.steps = 9
      prepared.context.sampling.denoisingStrength = 0.9
      prepared.context.prompts = {
        positive: 'late prepared positive',
        negative: 'late prepared negative',
      }
      prepared.context.generationDraft.positivePrompt.text = 'late prepared positive'
      prepared.context.generationDraft.negativePrompt.text = 'late prepared negative'
      prepared.context.generationDraft.seed = { policy: 'fixed', value: 37 }
      prepared.context.dynamic = { maxPrompts: 1, seedBehavior: 'per-prompt' }
      prepared.targetPngBytes.fill(0)
      target.composite.bytes.fill(0)
      if (preparedBatch) {
        preparedBatch.context.prompts.positive = 'late batch positive'
        preparedBatch.context.sampling.seed = 37
        preparedBatch.context.generationDraft.positivePrompt.text = 'late batch positive'
        preparedBatch.items[0].prompts.positive = 'late item positive'
        preparedBatch.items[0].compiledPrompts.positive.cleanedText = 'late compiled positive'
        preparedBatch.items[0].compiledPrompts.positive.spans[0].weight = 7
        preparedBatch.items[0].samplingPlan.seed = 37
        preparedBatch.targetPngBytes.fill(0)
      }
      callerReady.capabilities.length = 0
      batchOptions.iterations = 7
      batchOptions.maxPrompts = 1
      batchOptions.seedBehavior = 'per-prompt'
    }
    const admitted = await (mode === 'outpaint'
      ? orchestrator.enqueuePreparedOutpaintBatch(
          tabId,
          prepared,
          batchOptions,
          { ready: callerReady },
          editRetainedCaller,
        )
      : orchestrator.enqueuePreparedAnimaBatch(
          tabId,
          preparedBatch,
          { ready: callerReady },
          editRetainedCaller,
        ))
    const rows = []
    const configs = []
    const provenance = []
    const requests = []
    const privateInputs = []
    const publishedCandidates = []
    const outputBytes =
      mode === 'outpaint' ? await outpaintPngFromAlpha(contributionAlpha(), 256, 256) : sourceBytes
    for (const queued of admitted.items) {
      const row = await database.db
        .selectFrom('generation_queue_item')
        .selectAll()
        .where('id', '=', queued.id)
        .executeTakeFirstOrThrow()
      rows.push(row)
      const verified = await queue.loadVerifiedRetryInput(queued.id)
      assert.ok(verified.targetPngBytes.equals(sourceBytes))
      const retainedBytes = await readFile(verified.targetPath)
      assert.ok(retainedBytes.equals(sourceBytes))
      privateInputs.push({
        queueItemId: queued.id,
        manifest: JSON.parse(
          await readFile(path.join(path.dirname(verified.targetPath), 'manifest.json'), 'utf8'),
        ),
        targetSha256: digest(retainedBytes),
        targetByteSize: retainedBytes.length,
      })
      const claimed = await queue.claimNextPending()
      assert.equal(claimed?.item.id, queued.id)
      const provisionalRoot = await mkdtemp(path.join(scratch, 'anima-request-'))
      const targetPath = path.join(provisionalRoot, 'target.png')
      const outputPath = path.join(provisionalRoot, 'result.png')
      await writeFile(targetPath, retainedBytes, { flag: 'wx', mode: 0o600 })
      const requestFields = {
        outputPath,
        payload: claimed.payload,
        provisionalRoot,
        ready: structuredClone(ready),
        requestId: randomUUID(),
        targetPath,
      }
      const request =
        mode === 'outpaint'
          ? buildQueuedOutpaintWorkerRequest({ ...requestFields, infill: structuredClone(infill) })
          : buildQueuedAnimaWorkerRequest(requestFields)
      requests.push(request)
      // Known PNGs substitute for inference; actual staging owns payload/source/receipt/byte checks.
      await writeFile(outputPath, outputBytes, { flag: 'wx', mode: 0o600 })
      const candidate = await staging.publishGenerationCandidate({
        actualSeed: request.job.sampling.seed,
        expectedStatusSequence: claimed.item.statusSequence,
        expectedProvisionalRoot: provisionalRoot,
        provisionalOutputPath: outputPath,
        queueItemId: queued.id,
      })
      const candidateBytes = await staging.readVerifiedCandidatePng({
        candidateId: candidate.candidateId,
        imageSha256: candidate.image.sha256,
        localProjectKey: tabId,
        stagingSessionId: candidate.stagingSessionId,
      })
      assert.ok(candidateBytes?.equals(outputBytes))
      const mapped = provenanceFromVerifiedRasterCandidate({
        acceptedAt: '2026-10-12T06:00:00.000Z',
        candidate,
        imagePngBytes: candidateBytes,
      })
      publishedCandidates.push(candidate)
      provenance.push(mapped)
      configs.push(mapped.generationConfiguration)
    }
    const candidates = await staging.listVerifiedCandidates(tabId)
    const receipts = await database.db
      .selectFrom('generation_candidate_receipt')
      .selectAll()
      .orderBy('completion_order')
      .execute()
    const completedRows = []
    for (const { id } of admitted.items)
      completedRows.push(
        await database.db
          .selectFrom('generation_queue_item')
          .selectAll()
          .where('id', '=', id)
          .executeTakeFirstOrThrow(),
      )
    const cursorRow = await database.db
      .selectFrom('generation_seed_cursor')
      .selectAll()
      .where('local_project_key', '=', tabId)
      .where('document_id', '=', document.documentId)
      .executeTakeFirstOrThrow()
    assert.ok((await readFile(projectPath)).equals(projectIdentityBytes))
    return {
      rows,
      configs,
      provenance,
      requests,
      privateInputs,
      candidates,
      publishedCandidates,
      receipts,
      completedRows,
      cursor: await staging.readLastActualSeed(tabId, document.documentId),
      cursorRow,
      plan: admitted.plan,
      preparedSeed: originalPrepared.sampling.seed,
      originalPrepared,
      authoredDraft,
      lateDraft: structuredClone(document.generationDraft),
      latePrepared: structuredClone(prepared.context),
      latePreparedBatch: structuredClone(preparedBatch),
      lateOptions: { ...batchOptions },
      lateReady: structuredClone(callerReady),
      resolutionChecks,
      capacityChecks,
      edits,
      capacityPreflights: capacityChecks.length,
      picks,
      sourceIdentity: {
        sha256: digest(sourceBytes),
        byteSize: sourceBytes.length,
        width: 256,
        height: 256,
        iccSha256: IGS_SRGB_ICC_SHA256,
      },
      outputIdentity: { sha256: digest(outputBytes), byteSize: outputBytes.length },
    }
  } finally {
    await database?.close()
    await rm(temporary, { force: true, recursive: true })
  }
}
