/** Real TS producers and independent oracle sensitivity; no installed inference evidence. */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  installedFixture,
  resource,
  authoredStack,
} from './noobai-lora-stack-image-test-fixtures.mjs'
import { provenanceFromVerifiedRasterCandidate } from '../src/main/projects/project-generation-provenance.ts'
import { openAppDatabase } from '../src/main/db/database.ts'
import { GenerationOrchestrator } from '../src/main/projects/generation-orchestrator.ts'
import { GenerationQueueRepository } from '../src/main/projects/generation-queue.ts'
import {
  prepareNormalGeneration,
  prepareNormalOutpaintGeneration,
} from '../src/main/projects/project-generation-preparation.ts'
import { localProjectRecoveryKey } from '../src/main/projects/project-identity.ts'
import { acceptedOutputPngFixture } from '../src/main/projects/test-fixtures/accepted-provenance.ts'
import { outpaintPngFromAlpha } from '../src/main/projects/test-fixtures/outpaint-contribution.ts'
import { createEmptyProjectDocumentV1 } from '../src/shared/projects/project-schema.ts'
import {
  assertNoobaiLoraStackImageFrozen as assertFrozen,
  literalNoobaiLoraStackImagePlan as planFor,
  normalizeNoobaiLoraStackImageNativeInputs as normalize,
  validateNoobaiLoraStackImageFixture as validate,
  assertNoobaiLoraStackImageConfiguration as assertConfiguration,
} from './noobai-lora-stack-image-qualification.mjs'
const root = path.join(
  homedir(),
  '.codex/artifacts/imagegen-studio/runs/lora-image-oracle-mechanics',
)
const icc = '113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1'
const noise = {
  schemaVersion: 1,
  baseSchedule: 'sdxl-scaled-linear-v1',
  rescaleBetasZeroSnr: false,
  timestepSpacing: 'leading',
}
const producerReady = {
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
    'illustrious-euler',
    'illustrious-noise-profile',
  ],
}
const digest = (value) => createHash('sha256').update(value).digest('hex')

/** Independent target/contribution pixels; the oracle's alpha builders are not producer inputs. */
function producerAlpha(contribution = false) {
  const alpha = Buffer.alloc(256 * 256)
  const edge = [0, 5, 12, 23, 36, 52, 70, 89, 109, 130, 151, 172, 193, 212, 230, 247]
  for (let y = 0; y < 256; y++) {
    const start = y * 256
    if (contribution) {
      alpha.set(edge, start + 152)
      alpha.fill(255, start + 168, start + 256)
    } else alpha.fill(255, start, start + 192)
  }
  return alpha
}

/** Only exact resource verification is doubled; preparation/admission/frozen producers are real. */
function producerModels(fixture, plan) {
  const component = (key) => ({
    byteSize: fixture[key].byteSize,
    managedPath: fixture[key].installed.managedPath,
    reference: resource(fixture, key),
  })
  return {
    assertNoUnboundGenerationEmbeddings: async ({
      modelFamily,
      positivePrompt,
      negativePrompt,
    }) => {
      assert.equal(modelFamily, 'illustrious')
      assert.deepEqual(positivePrompt, { embeddingRefs: [], text: plan.sourcePrompts.positive })
      assert.deepEqual(negativePrompt, { embeddingRefs: [], text: plan.sourcePrompts.negative })
    },
    resolveVerifiedGenerationCheckpointForPlan: async (reference) => {
      assert.deepEqual(reference, resource(fixture, plan.modelKey))
      return {
        managedPath: fixture[plan.modelKey].installed.managedPath,
        reference: resource(fixture, plan.modelKey),
        noiseProfile: { ...noise, rescaleBetasZeroSnr: plan.objective === 'v_prediction' },
      }
    },
    resolveVerifiedGenerationLoraForPlan: async (ref) => {
      const key = ['illustriousLora', 'illustriousLoraSecond'].find(
        (key) => fixture[key].sha256 === ref.fileSha256,
      )
      assert.ok(key)
      assert.deepEqual(ref, resource(fixture, key))
      return component(key)
    },
    resolveVerifiedGenerationVaeForPlan: async (reference) => {
      assert.deepEqual(reference, resource(fixture, 'externalVaeNative'))
      return component('externalVaeNative')
    },
    resolveVerifiedGenerationEmbeddingForPlan: async () =>
      assert.fail('Ordinary LoRA qualification cannot resolve an embedding.'),
    // The queue's shared qualification object binds these methods even for Illustrious jobs.
    resolveVerifiedGenerationAnimaBundleForPlan: async () =>
      assert.fail('An Illustrious producer cannot resolve an Anima bundle.'),
    resolveVerifiedAnimaGenerationLoraForPlan: async () =>
      assert.fail('An Illustrious producer cannot resolve an Anima LoRA.'),
  }
}

async function assertProduction(objective, mode, caseName) {
  const fixture = installedFixture()
  const plan = planFor('baseline', objective, mode, caseName)
  const document = createEmptyProjectDocumentV1({
    title: 'Multiple-LoRA image production boundary',
  })
  document.primaryBbox = { x: mode === 'outpaint' ? 64 : 0, y: 0, width: 256, height: 256 }
  const draft = document.generationDraft
  draft.model = resource(fixture, plan.modelKey)
  draft.loras = authoredStack(fixture, caseName)
  draft.vae = resource(fixture, 'externalVaeNative')
  draft.vaePrecision = 'FP32'
  draft.cfgRescale = 0
  draft.positivePrompt = { embeddingRefs: [], text: plan.sourcePrompts.positive }
  draft.negativePrompt = { embeddingRefs: [], text: plan.sourcePrompts.negative }
  draft.seed = { policy: 'fixed', value: 0 }
  draft.dynamicPrompt = { maxPrompts: 1, seedBehavior: 'per-iteration' }
  draft.sampling = {
    cfgScale: 5,
    steps: 3,
    sampler: plan.sampler,
    scheduler: 'Normal',
    denoisingStrength: 0.5,
  }
  const targetBytes =
    mode === 'outpaint'
      ? await outpaintPngFromAlpha(producerAlpha(), 256, 256)
      : await acceptedOutputPngFixture(256, 256)
  const target = {
    bbox: { ...document.primaryBbox },
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    generationDraft: draft,
    lastActualSeedSnapshot: null,
    mode,
    composite: {
      bytes: targetBytes,
      byteSize: targetBytes.length,
      colorSpace: 'srgb',
      height: 256,
      width: 256,
      iccSha256: icc,
      sha256: digest(targetBytes),
    },
  }
  const models = producerModels(fixture, plan)
  const prepared = await (
    mode === 'outpaint' ? prepareNormalOutpaintGeneration : prepareNormalGeneration
  )({
    target,
    modelService: models,
    randomUint32: () => assert.fail('Fixed 0 cannot pick Random.'),
  })

  const temporary = await mkdtemp(path.join(tmpdir(), 'igs-lora-image-producer-'))
  let database
  try {
    database = openAppDatabase(temporary, path.resolve('src/main/db/migrations'))
    const scratch = path.join(temporary, 'scratch')
    await mkdir(scratch, { mode: 0o700 })
    const projectPath = path.join(temporary, 'producer.igs')
    // This test exercises indexed local identity and queue admission, not the package reader.
    await writeFile(projectPath, 'queue identity fixture', { flag: 'wx', mode: 0o600 })
    const tabId = localProjectRecoveryKey(projectPath)
    const queue = new GenerationQueueRepository(database.db, temporary)
    await queue.recoverAfterRestart()
    const capacityPreflights = []
    const infill = {
      byteSize: 205669692,
      role: 'outpaint-infill',
      sha256: '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9',
      managedPath: path.join(fixture.appData, 'inference-resources/big-lama.pt'),
    }
    const orchestrator = new GenerationOrchestrator(
      {
        getOpenDocumentId: (id) => (id === tabId ? document.documentId : null),
        getOpenTabs: () => [{ id: tabId }],
        prepareNormalGenerationContext: async () =>
          assert.fail('An already prepared batch cannot recompose or reread the draft.'),
      },
      {
        getProject: async (id) => {
          assert.equal(id, tabId)
          return {
            canonicalPath: projectPath,
            documentId: document.documentId,
            fileHealth: 'ready',
            localProjectKey: tabId,
          }
        },
      },
      models,
      queue,
      {
        assertReadyForPublication: () => undefined,
        preflightBatchCapacity: async (input) => {
          assert.equal(input.localProjectKey, tabId)
          assert.equal(input.projectPath, projectPath)
          capacityPreflights.push(structuredClone(input.entries))
        },
      },
      {
        cancelAndWait: async () => assert.fail('The stable batch must not need cancellation.'),
        runOne: async () => assert.fail('Producer tests cannot dispatch inference.'),
      },
      scratch,
      { resolveVerifiedOutpaintInfill: async () => ({ ...infill }) },
    )
    let lateEdits = 0
    const beforePublication = async () => {
      lateEdits++
      draft.positivePrompt.text = 'late Project edit'
      draft.sampling.steps = 9
      draft.seed = { policy: 'fixed', value: 37 }
      prepared.context.prompts.negative = 'late preparation edit'
      prepared.context.sampling.cfgScale = 8
      prepared.context.sampling.seed = 37
      prepared.context.sampling.invokeScheduler = 'euler_a'
      prepared.context.loras[0].weight = 0.5
      prepared.context.loraStack.reverse()
      draft.loras.reverse()
      draft.loras[0].weight = 3
      prepared.targetPngBytes.fill(0)
    }
    const options = { iterations: 1, maxPrompts: 1, seedBehavior: 'per-iteration' }
    const admitted = await (
      mode === 'outpaint'
        ? orchestrator.enqueuePreparedOutpaintBatch.bind(orchestrator)
        : orchestrator.enqueuePreparedBatch.bind(orchestrator)
    )(tabId, prepared, options, { ready: producerReady }, beforePublication)
    assert.equal(lateEdits, 1)
    assert.equal(admitted.plan.truncated, false)
    assert.equal(admitted.items.length, 1)
    assert.equal(admitted.plan.items.length, 1)
    assert.deepEqual(admitted.plan.items[0].prompts, plan.sourcePrompts)
    assert.equal(admitted.plan.items[0].seed, 0)
    assert.equal(capacityPreflights.length, 1)
    const [queued] = admitted.items
    assert.equal(queued.status, 'pending')
    const verified = await queue.loadVerifiedInput(queued.id)
    const frozen = verified.payload
    assert.match(frozen.originRequestId, /^[a-f0-9-]{36}$/i)
    assertFrozen(frozen, plan.items[0], fixture)
    assert.deepEqual(await readFile(verified.targetPath), targetBytes)
    assert.equal(capacityPreflights[0][0].queueItemId, queued.id)
    assert.deepEqual(JSON.parse(capacityPreflights[0][0].frozenPayloadJson), frozen)

    const detached = normalize(frozen)
    assert.equal(Object.hasOwn(detached.context, 'documentId'), false)
    assert.deepEqual(detached.workerJob, frozen.workerJob)
    // Acceptance projection is real; candidate/image verification preconditions are set up here.
    // This does not dispatch worker inference or call the Add/Save UI.
    const imagePngBytes =
      mode === 'outpaint' ? await outpaintPngFromAlpha(producerAlpha(true), 256, 256) : targetBytes
    const frozenPayloadJson = JSON.stringify(frozen)
    const provenance = provenanceFromVerifiedRasterCandidate({
      acceptedAt: '2026-10-10T11:00:00.000Z',
      imagePngBytes,
      candidate: {
        actualSeed: 0,
        assetPath: path.join(scratch, 'candidate.png'),
        bbox: frozen.context.bbox,
        candidateId: queued.id,
        completedAt: '2026-10-10T10:59:00.000Z',
        completionOrder: 1,
        documentId: frozen.context.documentId,
        documentRevision: frozen.context.documentRevision,
        frozenPayloadJson,
        frozenPayloadSha256: digest(frozenPayloadJson),
        image: {
          byteSize: imagePngBytes.length,
          height: 256,
          width: 256,
          iccSha256: icc,
          sha256: digest(imagePngBytes),
        },
        localProjectKey: tabId,
        projectPath,
        queueItemId: queued.id,
        stagingSessionId: randomUUID(),
      },
    })
    assertConfiguration(provenance.generationConfiguration, plan.items[0], fixture)
    for (const mutate of [
      (v) => {
        v.loras[0].weight = 1
      },
      (v) => v.loras.reverse(),
      (v) => {
        v.loras = v.loras.filter(({ enabled }) => enabled)
      },
      (v) => {
        v.sampling.actualSeed = 37
      },
    ]) {
      const changed = structuredClone(provenance.generationConfiguration)
      mutate(changed)
      if (JSON.stringify(changed) !== JSON.stringify(provenance.generationConfiguration))
        assert.throws(() => assertConfiguration(changed, plan.items[0], fixture))
    }
    // Jointly consistent source/weight exchange is semantically wrong even with a valid DTO.
    const wrong = structuredClone(frozen)
    for (const entry of wrong.context.loraStack)
      entry.weight = entry.resource.fileSha256 === fixture.illustriousLora.sha256 ? 0.75 : -0.5
    for (const entry of wrong.context.loras)
      entry.weight = entry.reference.fileSha256 === fixture.illustriousLora.sha256 ? 0.75 : -0.5
    for (const entry of wrong.workerJob.loras)
      entry.weight = entry.sha256 === fixture.illustriousLora.sha256 ? 0.75 : -0.5
    assert.throws(() => assertFrozen(wrong, plan.items[0], fixture))
    for (const mutate of [
      (v) => v.context.loraStack.reverse(),
      (v) => v.context.loras.reverse(),
      (v) => v.workerJob.loras.reverse(),
      (v) => {
        v.context.loraStack[1].enabled = !v.context.loraStack[1].enabled
      },
      (v) => {
        v.workerJob.loras[0].weight = 0
      },
      (v) => {
        v.context.bbox.x += 1
      },
    ]) {
      const changed = structuredClone(frozen)
      mutate(changed)
      if (JSON.stringify(changed) !== JSON.stringify(frozen))
        assert.throws(() => assertFrozen(changed, plan.items[0], fixture))
    }
    assert.equal(Object.hasOwn(frozen.workerJob, 'embeddings'), false)
    return { fixture, frozen, expectedItem: plan.items[0] }
  } finally {
    await database?.close()
    await rm(temporary, { force: true, recursive: true })
  }
}
for (const objective of ['epsilon', 'v_prediction'])
  for (const mode of ['img2img', 'outpaint'])
    for (const choice of ['ab', 'ba', 'b-zero', 'b-disabled'])
      test(`${objective}/${mode}/${choice}: actual Prepare, admission, durable stack and late-edit isolation`, async () =>
        assertProduction(objective, mode, choice))

test('strict envelope rejects undeclared matrices, control directions and unsafe input ownership', () => {
  const good = {
    schemaVersion: 1,
    profile: 'noobai-lora-stack-image',
    objective: 'epsilon',
    mode: 'img2img',
    case: 'ab',
    stage: 'baseline',
    referenceFixture: { path: path.join(root, 'ref.json'), sha256: 'a'.repeat(64) },
    workerBaseline: { path: path.join(root, 'worker.json'), sha256: 'b'.repeat(64) },
    artifacts: path.join(root, 'case'),
    sourceImage: {
      path: path.join(root, 'source.png'),
      byteSize: 100,
      sha256: 'c'.repeat(64),
      pixelSha256: 'd'.repeat(64),
    },
  }
  assert.deepEqual(validate(good), planFor('baseline', 'epsilon', 'img2img', 'ab'))
  for (const patch of [
    { mode: 'txt2img' },
    { stage: 'retry' },
    { case: 'only-a' },
    { unknown: true },
    { artifacts: root },
    { sourceImage: { ...good.sourceImage, pixelSha256: 'x' } },
    { mutation: { module: 'inference.py' } },
  ])
    assert.throws(() => validate({ ...good, ...patch }))
  for (const mode of ['img2img', 'outpaint']) {
    assert.throws(() => planFor('control', 'v_prediction', mode, 'ab'))
    assert.throws(() => planFor('control', 'epsilon', mode, 'b-zero'))
    assert.throws(() => planFor('control', 'epsilon', mode, 'ba'))
    assert.throws(() => planFor('restored', 'epsilon', mode, 'b-disabled'))
    for (const choice of ['ab', 'b-disabled'])
      assert.equal(planFor('control', 'epsilon', mode, choice).expectedAdmissions, 1)
  }
})
