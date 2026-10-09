/** Actual TS preparation/request/provenance vs independent literals; no ML or durable admission. */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { prepareAnimaGenerationBatch } from '../src/main/projects/anima-generation-batch.ts'
import { prepareAnimaGeneration } from '../src/main/projects/anima-generation-preparation.ts'
import { buildFrozenQueuedAnimaGenerationV1 } from '../src/main/projects/anima-queued-generation.ts'
import { provenanceFromVerifiedRasterCandidate } from '../src/main/projects/project-generation-provenance.ts'
import { localProjectRecoveryKey } from '../src/main/projects/project-identity.ts'
import {
  acceptedOutputPngFixture,
  transparentTargetPngFixture,
} from '../src/main/projects/test-fixtures/accepted-provenance.ts'
import { ANIMA_BATCH_READY } from '../src/main/projects/test-fixtures/anima-batch.ts'
import { buildAnimaWorkerRequest } from '../src/shared/projects/anima-worker-request.ts'
import { IGS_SRGB_ICC_SHA256 } from '../src/shared/projects/color-profile.ts'
import { createEmptyProjectDocumentV1 } from '../src/shared/projects/project-schema.ts'

import {
  assertAnimaErSdeConfiguration,
  assertAnimaErSdeFrozen,
  literalAnimaErSdeNativePlan,
  literalAnimaErSdePlan,
  normalizeAnimaErSdeNativeInputs,
  validateAnimaErSdeFixture,
} from './anima-er-sde-qualification.mjs'

const root = path.join(homedir(), '.codex/artifacts/imagegen-studio/runs/er-sde-source-mechanics')
const digest = (value) => createHash('sha256').update(value).digest('hex')
const red = 'a (red:1.3) ceramic cup on a wooden table, studio photograph'
const blurry = '(blurry:0.7), low quality'

function wrapper(stage = 'baseline', steps = 5) {
  return {
    schemaVersion: 1,
    profile: 'anima-er-sde',
    stage,
    steps,
    referenceFixture: { path: path.join(root, 'reference.json'), sha256: 'a'.repeat(64) },
    workerBaseline: { path: path.join(root, 'entry-sources.json'), sha256: 'b'.repeat(64) },
    artifacts: path.join(root, `output-${stage}-${steps}`),
    ...(stage === 'baseline'
      ? {}
      : {
          baseline: {
            reportPath: path.join(root, `baseline-${steps}/report.json`),
            reportSha256: 'c'.repeat(64),
          },
        }),
    ...(stage === 'control'
      ? {
          mutation: {
            module: 'vendor/er_sde_scheduler.py',
            originalSha256: 'd'.repeat(64),
            mutatedSha256: 'e'.repeat(64),
          },
        }
      : {}),
  }
}

/** Controlled exact descriptors; these doubles do not qualify actual files or trained models. */
function installedFixture() {
  const appData = path.join(root, 'pool/data/imagegen-studio')
  const fields = {
    anima: [
      700030,
      4182275752,
      '0fc7507b222e52ac8cc5e2826786bc4caed05223df32d17aeb05a76cb4de9941',
      'checkpoint',
      [1147756, 3120487, 3000817],
    ],
    encoder: [
      700010,
      1192135096,
      'cd2a512003e2f9f3cd3c32a9c3573f820bb28c940f73c57b1ddaa983d9223eba',
      'qwen3_encoder',
    ],
    vae: [
      700020,
      253806246,
      'a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f',
      'vae',
    ],
    animaLora: [
      700050,
      138663759,
      'cd9639b03d4458323e696e3792ff7535ae03f9f70368d6d0dc17fe86fa4f354f',
      'lora',
      [599757, 3084665, 2964030],
    ],
  }
  return {
    appData,
    ...Object.fromEntries(
      Object.entries(fields).map(([key, [id, byteSize, sha256, type, ids]]) => [
        key,
        {
          byteSize,
          sha256,
          type,
          family: 'anima',
          name: `Fixture ${key}`,
          versionName: 'Qualified version',
          ...(ids ? { origin: { modelId: ids[0], versionId: ids[1], fileId: ids[2] } } : {}),
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

function reference(fixture, key) {
  const source = fixture[key]
  return {
    baseModelFamily: 'anima',
    civitaiModelId: source.origin.modelId,
    civitaiVersionId: source.origin.versionId,
    civitaiFileId: source.origin.fileId,
    displayName: source.name,
    versionName: source.versionName,
    fileSha256: source.sha256,
    kind: source.type,
    localModelId: source.installed.resourceId,
    localVersionId: source.installed.versionId,
    predictionType: null,
  }
}
function file(fixture, key) {
  const source = fixture[key]
  return { byteSize: source.byteSize, path: source.installed.managedPath, sha256: source.sha256 }
}
function descriptor(fixture, key) {
  return {
    byteSize: fixture[key].byteSize,
    managedPath: fixture[key].installed.managedPath,
    reference: reference(fixture, key),
  }
}
function component(fixture, key) {
  const source = fixture[key]
  return {
    byteSize: source.byteSize,
    sha256: source.sha256,
    managedPath: source.installed.managedPath,
    localModelId: source.installed.resourceId,
    localVersionId: source.installed.versionId,
  }
}

/**
 * Real preparation/compiler/frozen parser/provenance; model resolver and output pixels are
 * controlled.
 */
async function productionRecords(steps, fixture = installedFixture()) {
  const document = createEmptyProjectDocumentV1({
    title: 'ER-SDE',
    primaryBbox: { x: 0, y: 0, width: 256, height: 256 },
  })
  const draft = document.generationDraft
  draft.model = reference(fixture, 'anima')
  draft.loras = [{ enabled: true, resource: reference(fixture, 'animaLora'), weight: -0.5 }]
  draft.positivePrompt.text = red
  draft.negativePrompt.text = blurry
  draft.seed = { policy: 'fixed', value: 0 }
  draft.dynamicPrompt = { maxPrompts: 1, seedBehavior: 'per-iteration' }
  draft.sampling = {
    steps,
    cfgScale: 4,
    denoisingStrength: null,
    sampler: 'Euler',
    scheduler: 'Normal',
    animaMethod: 'er_sde',
  }
  draft.cfgRescale = 0
  draft.vaePrecision = 'Auto'
  const bytes = await transparentTargetPngFixture(256, 256)
  const target = {
    bbox: document.primaryBbox,
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    generationDraft: draft,
    lastActualSeedSnapshot: null,
    mode: 'txt2img',
    composite: {
      bytes,
      byteSize: bytes.length,
      colorSpace: 'srgb',
      width: 256,
      height: 256,
      iccSha256: IGS_SRGB_ICC_SHA256,
      sha256: digest(bytes),
    },
  }
  const prepared = await prepareAnimaGeneration({
    target,
    modelService: {
      resolveVerifiedGenerationAnimaBundleForPlan: async () => ({
        architecture: 'anima-base-1.0',
        checkpoint: descriptor(fixture, 'anima'),
        qwen3Encoder: component(fixture, 'encoder'),
        vae: component(fixture, 'vae'),
      }),
      resolveVerifiedAnimaGenerationLoraForPlan: async () => descriptor(fixture, 'animaLora'),
    },
    randomUint32: () => assert.fail('Fixed0 cannot choose Random.'),
  })
  const batch = prepareAnimaGenerationBatch({ prepared, iterations: 1 })
  const [item] = batch.items
  assert.equal(batch.items.length, 1)
  const context = prepared.context
  const stagingRoot = path.join(tmpdir(), `igs-er-sde-dto-${randomUUID()}`)
  const request = buildAnimaWorkerRequest(
    {
      requestId: randomUUID(),
      mode: 'txt2img',
      bbox: context.bbox,
      model: {
        architecture: 'anima-base-1.0',
        checkpoint: file(fixture, 'anima'),
        qwen3Encoder: file(fixture, 'encoder'),
        vae: file(fixture, 'vae'),
      },
      loras: [{ ...file(fixture, 'animaLora'), weight: -0.5 }],
      prompts: item.prompts,
      sampling: { guidanceScale: 4, scheduler: 'er_sde', seed: item.seed, steps, strength: null },
      target: {
        path: path.join(stagingRoot, 'target.png'),
        byteSize: context.target.byteSize,
        sha256: context.target.sha256,
        width: 256,
        height: 256,
        iccSha256: IGS_SRGB_ICC_SHA256,
      },
      output: { pngPath: path.join(stagingRoot, 'result.png'), stagingRoot },
    },
    {
      ...ANIMA_BATCH_READY,
      workerVersion: '0.14.0',
      capabilities: [
        ...ANIMA_BATCH_READY.capabilities,
        'illustrious-outpaint',
        'illustrious-euler',
        'illustrious-noise-profile',
      ],
    },
  )
  const frozen = buildFrozenQueuedAnimaGenerationV1({ context, item, request })
  const output = await acceptedOutputPngFixture(256, 256)
  const projectPath = path.join(tmpdir(), 'er-sde-oracle.igs')
  const frozenPayloadJson = JSON.stringify(frozen)
  // Staging uses the completed queue ID as its candidate ID. Independent random IDs are invalid.
  const queueItemId = randomUUID()
  const configuration = provenanceFromVerifiedRasterCandidate({
    candidate: {
      actualSeed: 0,
      assetPath: path.join(stagingRoot, 'candidate.png'),
      bbox: context.bbox,
      candidateId: queueItemId,
      completedAt: '2026-10-10T12:00:00.000Z',
      completionOrder: 1,
      documentId: context.documentId,
      documentRevision: context.documentRevision,
      frozenPayloadJson,
      frozenPayloadSha256: digest(frozenPayloadJson),
      image: {
        byteSize: output.length,
        width: 256,
        height: 256,
        sha256: digest(output),
        iccSha256: IGS_SRGB_ICC_SHA256,
      },
      localProjectKey: localProjectRecoveryKey(projectPath),
      projectPath,
      queueItemId,
      stagingSessionId: randomUUID(),
    },
    imagePngBytes: output,
    acceptedAt: '2026-10-10T12:01:00.000Z',
  }).generationConfiguration
  return { batch, frozen, configuration, fixture }
}

for (const steps of [3, 5]) {
  test(`ER-SDE${steps}: independent single case matches real TS preparation/native DTO/provenance`, async () => {
    // Boundary: real TS rules, request builder, frozen parser and portable projection; no GPU/admission.
    // Neighbor: N3 and N5 differ only in authored steps and exact independently written grid.
    // Mutation: Euler method, missing stepSeed, rounded-double grid or unsigned LoRA must be detected.
    const plan = validateAnimaErSdeFixture(wrapper('baseline', steps))
    const { batch, frozen, configuration, fixture } = await productionRecords(steps)
    assert.equal(plan.expectedAdmissions, 1)
    assert.equal(plan.expectedCompletions, 1)
    assert.equal(plan.expectedCanceled, 0)
    assert.equal(batch.truncated, false)
    assert.deepEqual(
      batch.items.map(({ promptPairIndex, iteration, seed, prompts }) => ({
        promptPairIndex,
        iteration,
        seed,
        prompts,
      })),
      [{ promptPairIndex: 0, iteration: 0, seed: 0, prompts: { positive: red, negative: blurry } }],
    )
    assert.deepEqual(frozen.workerJob.sampling, literalAnimaErSdeNativePlan(steps))
    assertAnimaErSdeFrozen(frozen, plan.items[0], fixture)
    assertAnimaErSdeConfiguration(configuration, plan.items[0], fixture)
    assert.equal(frozen.workerJob.sampling.totalSteps, steps)
    assert.ok(Object.isFrozen(plan.items[0].compiledPrompts.positive.spans))
    assert.ok(Object.isFrozen(plan.items))
  })

  test(`ER-SDE${steps}: actual frozen and accepted records reject semantic corruption`, async () => {
    const { frozen, configuration, fixture } = await productionRecords(steps)
    const expected = literalAnimaErSdePlan('baseline', steps).items[0]
    for (const edit of [
      (value) => {
        value.context.sampling.steps = steps === 3 ? 5 : 3
      },
      (value) => {
        value.workerJob.sampling.scheduler = 'euler'
      },
      (value) => {
        value.workerJob.sampling.sigmas[1] = steps === 3 ? 6 / 7 : 12 / 13
      },
      (value) => {
        value.workerJob.sampling.timesteps[1] = value.workerJob.sampling.sigmas[1] * 1000
      },
      (value) => {
        value.workerJob.sampling.stepSeed = 1
      },
      (value) => {
        value.context.sampling.requestedSeedPolicy = 'random'
      },
      (value) => {
        value.context.sampling.seedBehavior = 'per-prompt'
      },
      (value) => {
        value.workerJob.loras[0].weight = 0.5
      },
      (value) => {
        value.workerJob.prompts.positive.spans[1].weight = 1
      },
      (value) => {
        value.workerJob.prompts.negative.spans[0].weight = 1
      },
      (value) => {
        value.workerJob.model.qwen3Encoder.sha256 = 'f'.repeat(64)
      },
      (value) => {
        value.workerJob.target.sha256 = 'f'.repeat(64)
      },
    ]) {
      const changed = structuredClone(frozen)
      edit(changed)
      assert.throws(() => assertAnimaErSdeFrozen(changed, expected, fixture))
    }
    for (const edit of [
      (value) => {
        value.sampling.steps = steps === 3 ? 5 : 3
      },
      (value) => {
        value.sampling.animaMethod = 'euler'
      },
      (value) => {
        value.sampling.actualSeed = 1
      },
      (value) => {
        value.loras[0].weight = 0.5
      },
      (value) => {
        value.positivePrompt.text = 'unweighted red'
      },
      (value) => {
        value.anima.qwen3Encoder.sha256 = 'f'.repeat(64)
      },
    ]) {
      const changed = structuredClone(configuration)
      edit(changed)
      assert.throws(() => assertAnimaErSdeConfiguration(changed, expected, fixture))
    }
    assertAnimaErSdeFrozen(frozen, expected, fixture)
    assertAnimaErSdeConfiguration(configuration, expected, fixture)
  })
}

test('ER-SDE normalization removes only Project identity and retains the step/grid/resource axes', async () => {
  const fixture = installedFixture()
  const three = await productionRecords(3, fixture),
    five = await productionRecords(5, fixture)
  const original = structuredClone(five.frozen)
  const replay = structuredClone(five.frozen)
  replay.context.documentId = randomUUID()
  replay.context.documentRevision = randomUUID()
  assert.deepEqual(
    normalizeAnimaErSdeNativeInputs(replay),
    normalizeAnimaErSdeNativeInputs(five.frozen),
  )
  assert.notDeepEqual(
    normalizeAnimaErSdeNativeInputs(three.frozen),
    normalizeAnimaErSdeNativeInputs(five.frozen),
  )
  const normalized = normalizeAnimaErSdeNativeInputs(five.frozen)
  assert.deepEqual(normalized.workerJob, original.workerJob)
  assert.deepEqual(normalized.context.sampling, original.context.sampling)
  assert.deepEqual(five.frozen, original)
  assert.throws(() => normalizeAnimaErSdeNativeInputs({ ...five.frozen, kind: 'anima-img2img' }))
})

test('ER-SDE fixture guards bind exactly3/5, same-source baseline and one named scheduler delta', () => {
  for (const steps of [3, 5])
    for (const stage of ['baseline', 'restored', 'control']) {
      const value = wrapper(stage, steps)
      assert.deepEqual(validateAnimaErSdeFixture(value), literalAnimaErSdePlan(stage, steps))
    }
  for (const edit of [
    (value) => {
      value.steps = 4
    },
    (value) => {
      value.steps = '5'
    },
    (value) => {
      value.steps = null
    },
    (value) => {
      value.stage = 'iteration'
    },
    (value) => {
      value.profile = 'anima-dynamic-batch'
    },
    (value) => {
      value.objective = 'anima'
    },
    (value) => {
      value.schemaVersion = 2
    },
    (value) => {
      value.referenceFixture.sha256 = 'A'.repeat(64)
    },
    (value) => {
      value.artifacts = root
    },
    (value) => {
      value.artifacts = '/tmp/evidence'
    },
    (value) => {
      value.referenceFixture.path = '/tmp/reference.json'
    },
    (value) => {
      value.artifacts += '/..'
    },
    (value) => {
      value.baseline = wrapper('restored').baseline
    },
    (value) => {
      value.mutation = wrapper('control').mutation
    },
  ]) {
    const value = wrapper()
    edit(value)
    assert.throws(() => validateAnimaErSdeFixture(value))
  }
  for (const edit of [
    (value) => {
      delete value.baseline
    },
    (value) => {
      delete value.mutation
    },
    (value) => {
      value.mutation.module = 'anima_euler.py'
    },
    (value) => {
      value.mutation.module = '../vendor/er_sde_scheduler.py'
    },
    (value) => {
      value.mutation.extra = true
    },
    (value) => {
      value.mutation.mutatedSha256 = value.mutation.originalSha256
    },
    (value) => {
      value.mutation.originalSha256 = 'short'
    },
    (value) => {
      value.baseline.extra = true
    },
    (value) => {
      value.baseline.reportSha256 = 'short'
    },
    (value) => {
      value.artifacts = path.dirname(value.baseline.reportPath)
    },
  ]) {
    const value = wrapper('control')
    edit(value)
    assert.throws(() => validateAnimaErSdeFixture(value))
  }
  assert.throws(() =>
    validateAnimaErSdeFixture({ ...wrapper('restored'), mutation: wrapper('control').mutation }),
  )
  for (const steps of [0, 1, 2, 4, 6, 200, '3', null]) {
    assert.throws(() => literalAnimaErSdePlan('baseline', steps))
    assert.throws(() => literalAnimaErSdeNativePlan(steps))
  }
})

test('ER-SDE literal expected item is independently fixed, not supplied by a captured answer', () => {
  for (const field of ['seed', 'iteration', 'promptPairIndex']) {
    const expected = structuredClone(literalAnimaErSdePlan('baseline', 5).items[0])
    expected[field] = 1
    assert.throws(
      () => assertAnimaErSdeFrozen({}, expected, installedFixture()),
      /independent literal case/,
    )
  }
})
