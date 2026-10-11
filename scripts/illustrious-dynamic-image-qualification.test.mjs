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
  installedEnvelope,
} from './illustrious-dynamic-image-test-fixtures.mjs'
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
  assertIllustriousDynamicImageFrozen as assertFrozen,
  literalIllustriousDynamicImagePlan as planFor,
  normalizeIllustriousDynamicImageNativeInputs as normalize,
  validateIllustriousDynamicImageFixture as validate,
  assertIllustriousDynamicImageConfiguration as assertConfiguration,
  assertIllustriousDynamicImagePixels as assertPixels,
} from './illustrious-dynamic-image-qualification.mjs'
const root = path.join(
  homedir(),
  '.codex/artifacts/imagegen-studio/runs/dynamic-image-oracle-mechanics',
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
      assert.deepEqual(positivePrompt.embeddingRefs, [])
      assert.deepEqual(negativePrompt.embeddingRefs, [])
      assert.ok(
        [plan.sourcePrompts.positive, ...plan.items.map((item) => item.prompts.positive)].includes(
          positivePrompt.text,
        ),
      )
      assert.ok(
        [plan.sourcePrompts.negative, ...plan.items.map((item) => item.prompts.negative)].includes(
          negativePrompt.text,
        ),
      )
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
      const key = ['illustriousLora'].find((key) => fixture[key].sha256 === ref.fileSha256)
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

async function assertProduction(objective, mode, seedBehavior) {
  const fixture = installedFixture()
  const plan = planFor('baseline', objective, mode, seedBehavior)
  const document = createEmptyProjectDocumentV1({
    title: 'Dynamic common-source image production boundary',
  })
  document.primaryBbox = { x: mode === 'outpaint' ? 64 : 0, y: 0, width: 256, height: 256 }
  const draft = document.generationDraft
  draft.model = resource(fixture, plan.modelKey)
  draft.loras = [{ enabled: true, resource: resource(fixture, 'illustriousLora'), weight: -0.5 }]
  draft.vae = resource(fixture, 'externalVaeNative')
  draft.vaePrecision = 'FP32'
  draft.cfgRescale = 0
  draft.positivePrompt = { embeddingRefs: [], text: plan.sourcePrompts.positive }
  draft.negativePrompt = { embeddingRefs: [], text: plan.sourcePrompts.negative }
  draft.seed = { policy: 'fixed', value: 0 }
  draft.dynamicPrompt = { maxPrompts: 4, seedBehavior }
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
    const ready = structuredClone(producerReady)
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
      prepared.context.bbox.x = 1000
      options.iterations = 7
      options.maxPrompts = 1
      options.seedBehavior = seedBehavior === 'per-iteration' ? 'per-prompt' : 'per-iteration'
      ready.capabilities.length = 0
    }
    const options = { iterations: 2, maxPrompts: 4, seedBehavior }
    const admitted = await (
      mode === 'outpaint'
        ? orchestrator.enqueuePreparedOutpaintBatch.bind(orchestrator)
        : orchestrator.enqueuePreparedBatch.bind(orchestrator)
    )(tabId, prepared, options, { ready }, beforePublication)
    assert.equal(lateEdits, 1)
    assert.equal(admitted.plan.truncated, false)
    assert.equal(admitted.items.length, 8)
    assert.equal(admitted.plan.items.length, 8)
    assert.equal(capacityPreflights.length, 1)
    assert.equal(new Set(admitted.items.map((item) => item.batchId)).size, 1)
    const expectedSeeds =
      seedBehavior === 'per-iteration' ? [0, 1, 0, 1, 0, 1, 0, 1] : [0, 1, 2, 3, 4, 5, 6, 7]
    const expectedPrompts = [
      ['a (red:1.3) ceramic cup on a wooden table, studio photograph', '(blurry:0.7), low quality'],
      ['a (red:1.3) ceramic cup on a wooden table, studio photograph', '(noisy:0.7), low quality'],
      [
        'a (blue:1.3) ceramic cup on a wooden table, studio photograph',
        '(blurry:0.7), low quality',
      ],
      ['a (blue:1.3) ceramic cup on a wooden table, studio photograph', '(noisy:0.7), low quality'],
    ]
    for (const [index, queued] of admitted.items.entries()) {
      assert.equal(queued.status, 'pending')
      const verified = await queue.loadVerifiedInput(queued.id)
      const frozen = verified.payload
      assert.match(frozen.originRequestId, /^[a-f0-9-]{36}$/i)
      const expected = plan.items[index]
      assert.equal(expected.seed, expectedSeeds[index])
      assert.deepEqual(
        [expected.prompts.positive, expected.prompts.negative],
        expectedPrompts[Math.floor(index / 2)],
      )
      assertFrozen(frozen, expected, fixture)
      assert.deepEqual(await readFile(verified.targetPath), targetBytes)
      assert.equal(frozen.context.target.sha256, digest(targetBytes))
      assert.equal(frozen.workerJob.target.sha256, digest(targetBytes))
      assert.equal(capacityPreflights[0][index].queueItemId, queued.id)
      assert.deepEqual(JSON.parse(capacityPreflights[0][index].frozenPayloadJson), frozen)
      const detached = normalize(frozen)
      assert.equal(Object.hasOwn(detached.context, 'documentId'), false)
      assert.deepEqual(detached.workerJob, frozen.workerJob)
      // Acceptance projection is real; candidate/image verification preconditions are set up here.
      // This does not dispatch worker inference or call the Add/Save UI.
      const imagePngBytes =
        mode === 'outpaint'
          ? await outpaintPngFromAlpha(producerAlpha(true), 256, 256)
          : targetBytes
      const frozenPayloadJson = JSON.stringify(frozen)
      const provenance = provenanceFromVerifiedRasterCandidate({
        acceptedAt: '2026-10-10T11:00:00.000Z',
        imagePngBytes,
        candidate: {
          actualSeed: expected.seed,
          assetPath: path.join(scratch, 'candidate.png'),
          bbox: frozen.context.bbox,
          candidateId: queued.id,
          completedAt: '2026-10-10T10:59:00.000Z',
          completionOrder: index + 1,
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
      assertConfiguration(provenance.generationConfiguration, expected, fixture)
      for (const mutate of [
        (value) => {
          value.sampling.actualSeed = 37
        },
        (value) => {
          value.positivePrompt.text = 'late positive'
        },
        (value) => {
          value.negativePrompt.text = 'late negative'
        },
        (value) => {
          value.loras[0].weight = -0.25
        },
      ]) {
        const changed = structuredClone(provenance.generationConfiguration)
        mutate(changed)
        assert.throws(() => assertConfiguration(changed, expected, fixture))
      }
      for (const mutate of [
        (value) => {
          value.context.sampling.seed = 37
          value.workerJob.sampling.seed = 37
        },
        (value) => {
          value.context.prompts.positive = 'wrong pair'
          value.workerJob.prompts.positive = 'wrong pair'
        },
        (value) => {
          value.context.bbox.x++
          value.workerJob.bbox.x++
        },
        (value) => {
          value.context.sampling.denoisingStrength = 0.9
          value.workerJob.sampling.denoisingStrength = 0.9
        },
        (value) => {
          value.context.loras[0].weight = 0
          value.workerJob.loras[0].weight = 0
        },
      ]) {
        const wrong = structuredClone(frozen)
        mutate(wrong)
        assert.throws(() => assertFrozen(wrong, expected, fixture))
      }
      assert.equal(Object.hasOwn(frozen.workerJob, 'embeddings'), false)
    }
  } finally {
    await database?.close()
    await rm(temporary, { force: true, recursive: true })
  }
}

for (const objective of ['epsilon', 'v_prediction'])
  for (const mode of ['img2img', 'outpaint'])
    for (const seedBehavior of ['per-iteration', 'per-prompt'])
      test(`${objective}/${mode}/${seedBehavior}: real preparation -> batch admission -> SQLite isolates common inputs and concrete pairs`, async () =>
        assertProduction(objective, mode, seedBehavior))

test('strict installed envelope pins the finite48-job plan and rejects undeclared scope before reads', () => {
  let jobs = 0
  let accepted = 0
  for (const stage of ['baseline', 'control', 'restored'])
    for (const objective of ['epsilon', 'v_prediction'])
      for (const mode of ['img2img', 'outpaint']) {
        const fixture = installedEnvelope(stage, objective, mode)
        const plan = validate(fixture)
        assert.equal(plan.expectedAdmissions, stage === 'baseline' ? 8 : 2)
        assert.equal(plan.expectedCompletions, plan.expectedAdmissions)
        assert.equal(plan.expectedCanceled, 0)
        assert.deepEqual(
          plan.items.map(({ seed }) => seed),
          stage === 'baseline' ? [0, 1, 0, 1, 0, 1, 0, 1] : [0, 1],
        )
        assert.equal(
          plan.items.every(
            ({ requestedSeedPolicy, seedBehavior }) =>
              requestedSeedPolicy === 'fixed' && seedBehavior === 'per-iteration',
          ),
          true,
        )
        assert.deepEqual(plan.sourcePrompts, planFor('baseline', objective, mode).sourcePrompts)
        assert.equal(plan.maxPrompts, stage === 'baseline' ? 4 : 1)
        jobs += plan.expectedAdmissions
        if (stage !== 'control') accepted += plan.expectedCompletions
      }
  assert.equal(jobs, 48)
  assert.equal(accepted, 40)
  for (const mutate of [
    (v) => {
      v.stage = 'reuse'
    },
    (v) => {
      v.stage = 'crash'
    },
    (v) => {
      v.mode = 'txt2img'
    },
    (v) => {
      v.objective = 'unknown'
    },
    (v) => {
      v.case = 'ab'
    },
    (v) => {
      v.seedBehavior = 'per-prompt'
    },
    (v) => {
      v.sourceImage.path = v.artifacts
    },
    (v) => {
      v.sourceImage.byteSize = 0
    },
    (v) => {
      v.sourceImage.pixelSha256 = 'wrong'
    },
    (v) => {
      v.baseline = { reportPath: '/tmp/not-owned', reportSha256: 'a'.repeat(64) }
    },
  ]) {
    const invalid = installedEnvelope()
    mutate(invalid)
    assert.throws(() => validate(invalid))
  }
  const wrongModule = installedEnvelope('control')
  wrongModule.mutation.module = 'inference_lora.py'
  assert.throws(() => validate(wrongModule))
  for (const stage of ['control', 'restored']) {
    const missing = installedEnvelope(stage)
    delete missing.baseline
    assert.throws(() => validate(missing))
  }
})

test('visible-axis guard distinguishes signed prompt/seed changes from lost common targets and hidden OUT RGB', () => {
  const plan = planFor('baseline', 'epsilon', 'outpaint')
  const image = (item, index) => {
    const pixels = Buffer.alloc(65536 * 4)
    for (let pixel = 0; pixel < 65536; pixel++) {
      pixels[pixel * 4] = index * 10
      pixels[pixel * 4 + 3] = pixel % 256 >= 168 ? 255 : 0
    }
    return {
      expectedItem: item,
      rgba: pixels,
      frozen: {
        kind: 'illustrious-outpaint',
        context: {
          documentId: 'document',
          documentRevision: 'revision',
          target: { sha256: 'common' },
          prompts: item.prompts,
          sampling: {
            seed: item.seed,
            sampler: 'Euler a',
            invokeScheduler: 'euler_a',
            scheduler: 'Normal',
          },
        },
        workerJob: { prompts: item.prompts, sampling: { seed: item.seed, scheduler: 'euler_a' } },
      },
    }
  }
  const healthy = plan.items.map(image)
  const evidence = assertPixels(healthy, plan)
  assert.equal(evidence.iterationSeed.length, 4)
  assert.equal(evidence.positiveAlternatives.length, 4)
  assert.equal(evidence.negativeAlternatives.length, 4)
  assert.equal(evidence.combinedAlternatives.length, 4)
  assert.equal(evidence.pairwiseDistinct, true)
  // Both source templates/seed metadata stay correct while the last pair's actual pixels alias pair0.
  const substitutedPair = structuredClone(healthy)
  substitutedPair[6].rgba = Buffer.from(healthy[0].rgba)
  substitutedPair[7].rgba = Buffer.from(healthy[1].rgba)
  for (let index = 0; index < 8; index++)
    assert.deepEqual(substitutedPair[index].frozen, healthy[index].frozen)
  assert.throws(() => assertPixels(substitutedPair, plan), /visible RGB/)
  const otherDiagonal = structuredClone(healthy)
  otherDiagonal[4].rgba = Buffer.from(healthy[2].rgba)
  otherDiagonal[5].rgba = Buffer.from(healthy[3].rgba)
  assert.throws(() => assertPixels(otherDiagonal, plan), /visible RGB/)
  const changedTarget = structuredClone(healthy)
  changedTarget[7].frozen.context.target.sha256 = 'late composition'
  assert.throws(() => assertPixels(changedTarget, plan), /same frozen image target/)
  const noSeedEffect = structuredClone(healthy)
  noSeedEffect[1].rgba = Buffer.from(noSeedEffect[0].rgba)
  noSeedEffect[1].rgba[0] ^= 1
  assert.throws(() => assertPixels(noSeedEffect, plan), /visible RGB/)
  const wrongAlpha = structuredClone(healthy)
  wrongAlpha[1].rgba[3] = 1
  assert.throws(() => assertPixels(wrongAlpha, plan), /contribution alpha/)
})
