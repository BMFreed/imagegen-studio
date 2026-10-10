/** Real TS preparation/admission/provenance and independent literals; no trained inference. */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../src/main/db/database.ts'
import { GenerationOrchestrator } from '../src/main/projects/generation-orchestrator.ts'
import { GenerationQueueRepository } from '../src/main/projects/generation-queue.ts'
import { prepareNormalGeneration } from '../src/main/projects/project-generation-preparation.ts'
import { provenanceFromVerifiedRasterCandidate } from '../src/main/projects/project-generation-provenance.ts'
import { localProjectRecoveryKey } from '../src/main/projects/project-identity.ts'
import {
  acceptedOutputPngFixture,
  transparentTargetPngFixture,
} from '../src/main/projects/test-fixtures/accepted-provenance.ts'
import { createEmptyProjectDocumentV1 } from '../src/shared/projects/project-schema.ts'
import {
  assertIllustriousDpmConfiguration,
  assertIllustriousDpmFrozen,
  literalIllustriousDpmPlan,
  normalizeIllustriousDpmNativeInputs,
  validateIllustriousDpmFixture,
  validateNoobaiVpredDpmFixture,
} from './illustrious-dpm-qualification.mjs'

const root = path.join(homedir(), '.codex/artifacts/imagegen-studio/runs/noobai-vpred-dpm-oracle')
const digest = (value) => createHash('sha256').update(value).digest('hex')
const icc = '113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1'
const prompts = {
  positive: 'a (red:1.3) ceramic cup on a wooden table, studio photograph',
  negative: '(blurry:0.7), low quality',
}
const cases = [
  ['v_prediction', 'Normal', 'illustrious', 'dpmpp_2m'],
  ['v_prediction', 'Karras', 'illustrious', 'dpmpp_2m_k'],
  ['epsilon', 'Normal', 'illustriousEpsilon', 'dpmpp_2m'],
]
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
    // Qualified 0.14 retains the complete capability chain, even for this TXT-only test.
    'illustrious-outpaint',
    'illustrious-euler',
    'illustrious-noise-profile',
  ],
}

function wrapper(objective = 'v_prediction', schedule = 'Normal', stage = 'baseline') {
  return {
    schemaVersion: 1,
    profile: 'noobai-vpred-dpm',
    objective,
    algorithm: 'dpmpp_2m',
    schedule,
    mode: 'txt2img',
    case: 'history',
    stage,
    artifacts: path.join(root, `${objective}-${schedule}-${stage}`),
    referenceFixture: { path: path.join(root, 'reference.json'), sha256: 'a'.repeat(64) },
    workerBaseline: { path: path.join(root, 'worker.json'), sha256: 'b'.repeat(64) },
    ...(stage === 'baseline'
      ? {}
      : {
          baseline: {
            reportPath: path.join(root, 'baseline/report.json'),
            reportSha256: 'c'.repeat(64),
          },
        }),
    ...(stage === 'control'
      ? {
          mutation: {
            module: 'inference.py',
            originalSha256: 'd'.repeat(64),
            mutatedSha256: 'e'.repeat(64),
          },
        }
      : {}),
  }
}

/** Exact source descriptors are independent literals; this does not verify model files. */
function sources() {
  const appData = path.join(root, 'pool/data/imagegen-studio')
  const rows = {
    illustrious: [
      700040,
      6938040794,
      'edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d',
      'checkpoint',
      1147756,
      2679856,
      2566634,
      'v_prediction',
    ],
    illustriousEpsilon: [
      700140,
      6938040416,
      'ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1',
      'checkpoint',
      833294,
      1022833,
      928571,
      'epsilon',
    ],
    illustriousLora: [
      700060,
      114437420,
      'c2bd847fb3859cc8ce16af6ecce291c96b36ca486999e620af9b886367ee6ee9',
      'lora',
      700060,
      700061,
      700062,
    ],
    externalVaeNative: [
      700080,
      167335542,
      'f09b42f799d82812ef38461205c4764ecb3e10384bb6ee198321124dbc59e9b7',
      'vae',
      700070,
      700081,
      700082,
    ],
  }
  return {
    appData,
    ...Object.fromEntries(
      Object.entries(rows).map(
        ([
          key,
          [managedId, byteSize, sha256, type, modelId, versionId, fileId, trainedObjective],
        ]) => [
          key,
          {
            byteSize,
            sha256,
            type,
            family: 'illustrious',
            name: `Fixture ${key}`,
            versionName: 'Exact qualified version',
            origin: { modelId, versionId, fileId },
            ...(trainedObjective ? { trainedObjective } : {}),
            installed: {
              resourceId: randomUUID(),
              versionId: randomUUID(),
              managedPath: path.join(appData, 'models', `qualified-${managedId}.safetensors`),
            },
          },
        ],
      ),
    ),
  }
}
function resource(fixture, key) {
  const source = fixture[key]
  return {
    baseModelFamily: 'illustrious',
    civitaiFileId: source.origin.fileId,
    civitaiModelId: source.origin.modelId,
    civitaiVersionId: source.origin.versionId,
    displayName: source.name,
    fileSha256: source.sha256,
    kind: source.type,
    localModelId: source.installed.resourceId,
    localVersionId: source.installed.versionId,
    predictionType: source.trainedObjective ?? null,
    versionName: source.versionName,
  }
}
function file(fixture, key) {
  const source = fixture[key]
  return { byteSize: source.byteSize, path: source.installed.managedPath, sha256: source.sha256 }
}
function noise(objective) {
  return {
    schemaVersion: 1,
    baseSchedule: 'sdxl-scaled-linear-v1',
    rescaleBetasZeroSnr: objective === 'v_prediction',
    timestepSpacing: 'leading',
  }
}
function expectedInputs(fixture, entry, document, targetBytes) {
  const [objective, schedule, key, scheduler] = entry
  const bbox = { x: 0, y: 0, width: 256, height: 256 }
  const target = {
    byteSize: targetBytes.length,
    height: 256,
    width: 256,
    iccSha256: icc,
    sha256: digest(targetBytes),
  }
  const sampling = { cfgRescale: 0, cfgScale: 4, noiseProfile: noise(objective), seed: 0, steps: 4 }
  return {
    schemaVersion: 1,
    originRequestId: randomUUID(),
    kind: 'illustrious-txt2img',
    context: {
      schemaVersion: 1,
      kind: 'normal-txt2img-preparation',
      documentId: document.documentId,
      documentRevision: document.documentRevision,
      bbox,
      target: { ...target, colorSpace: 'srgb', format: 'png' },
      prompts: { ...prompts },
      sampling: {
        ...sampling,
        invokeScheduler: scheduler,
        requestedSeedPolicy: 'fixed',
        sampler: 'DPM++ 2M',
        scheduler: schedule,
        seedBehavior: 'per-iteration',
      },
      model: { managedPath: fixture[key].installed.managedPath, reference: resource(fixture, key) },
      loraStack: [{ enabled: true, resource: resource(fixture, 'illustriousLora'), weight: -0.5 }],
      loras: [
        {
          byteSize: fixture.illustriousLora.byteSize,
          managedPath: fixture.illustriousLora.installed.managedPath,
          reference: resource(fixture, 'illustriousLora'),
          weight: -0.5,
        },
      ],
      embeddingRefs: { positive: [], negative: [] },
      embeddings: { positive: [], negative: [] },
      vae: {
        byteSize: fixture.externalVaeNative.byteSize,
        managedPath: fixture.externalVaeNative.installed.managedPath,
        reference: resource(fixture, 'externalVaeNative'),
      },
      vaePrecision: 'FP32',
    },
    workerJob: {
      schemaVersion: 1,
      bbox,
      checkpoint: {
        path: fixture[key].installed.managedPath,
        predictionType: objective,
        sha256: fixture[key].sha256,
      },
      prompts: { ...prompts },
      sampling: { ...sampling, scheduler },
      loras: [{ ...file(fixture, 'illustriousLora'), weight: -0.5 }],
      vae: file(fixture, 'externalVaeNative'),
      vaePrecision: 'FP32',
      target,
    },
  }
}
function expectedConfiguration(fixture, entry) {
  const [objective, schedule, key, invokeScheduler] = entry
  return {
    cfgRescale: 0,
    mode: 'txt2img',
    model: resource(fixture, key),
    loras: [{ enabled: true, resource: resource(fixture, 'illustriousLora'), weight: -0.5 }],
    positivePrompt: { embeddingRefs: [], text: prompts.positive },
    negativePrompt: { embeddingRefs: [], text: prompts.negative },
    sampling: {
      actualSeed: 0,
      cfgScale: 4,
      invokeScheduler,
      noiseProfile: noise(objective),
      requestedSeedPolicy: 'fixed',
      sampler: 'DPM++ 2M',
      scheduler: schedule,
      seedBehavior: 'per-iteration',
      steps: 4,
    },
    size: { height: 256, width: 256 },
    vae: resource(fixture, 'externalVaeNative'),
    vaePrecision: 'FP32',
  }
}

test('finite V profile accepts only Normal/Karras TXT and unchanged EPS Normal neighbor', () => {
  for (const entry of cases)
    for (const stage of entry[0] === 'v_prediction'
      ? ['baseline', 'control', 'restored']
      : ['baseline', 'control']) {
      const plan = validateNoobaiVpredDpmFixture(wrapper(entry[0], entry[1], stage))
      assert.equal(plan.objective, entry[0])
      assert.equal(plan.modelKey, entry[2])
      assert.equal(plan.invokeScheduler, entry[3])
      assert.equal(plan.observedSteps, 4)
      assert.deepEqual(plan.bbox, { x: 0, y: 0, width: 256, height: 256 })
      assert.deepEqual(plan.items, [
        {
          promptPairIndex: 0,
          iteration: 0,
          seed: 0,
          requestedSeedPolicy: 'fixed',
          seedBehavior: 'per-iteration',
          objective: entry[0],
          algorithm: 'dpmpp_2m',
          schedule: entry[1],
          sampler: 'DPM++ 2M',
          invokeScheduler: entry[3],
          mode: 'txt2img',
          case: 'history',
          steps: 4,
          prompts,
        },
      ])
      assert.equal(plan.expectedAdmissions, 1)
      assert.equal(plan.expectedCompletions, 1)
      assert.equal(Object.isFrozen(plan.items[0].prompts), true)
    }
  const legacy = wrapper('epsilon')
  legacy.profile = 'illustrious-dpm'
  delete legacy.objective
  assert.equal(validateIllustriousDpmFixture(legacy).objective, 'epsilon')
  legacy.objective = 'v_prediction'
  assert.throws(() => validateIllustriousDpmFixture(legacy))
})

test('V envelope rejects unsupported scope, extra fields, source overlap and incomplete rollback inputs before reads', () => {
  for (const change of [
    (v) => {
      delete v.objective
    },
    (v) => {
      v.objective = 'sample'
    },
    (v) => {
      v.objective = 'flow'
    },
    (v) => {
      v.algorithm = 'dpmpp_sde'
    },
    (v) => {
      v.mode = 'img2img'
    },
    (v) => {
      v.mode = 'outpaint'
    },
    (v) => {
      v.case = 'neighbor'
    },
    (v) => {
      v.schedule = 'normal'
    },
    (v) => {
      v.profile = 'illustrious-dpm'
    },
    (v) => {
      v.schemaVersion = 2
    },
    (v) => {
      v.sourceImage = { path: '/tmp/source.png' }
    },
    (v) => {
      v.noiseProfile = noise('v_prediction')
    },
    (v) => {
      v.artifacts = path.dirname(v.referenceFixture.path)
    },
    (v) => {
      v.referenceFixture.path += '/../reference.json'
    },
    (v) => {
      v.workerBaseline.sha256 = 'invalid'
    },
    (v) => {
      v.baseline = { reportPath: path.join(root, 'baseline.json'), reportSha256: 'a'.repeat(64) }
    },
  ]) {
    const value = wrapper()
    change(value)
    assert.throws(() => validateNoobaiVpredDpmFixture(value))
  }
  for (const change of [
    (v) => {
      delete v.baseline
    },
    (v) => {
      delete v.mutation
    },
    (v) => {
      v.mutation.module = 'anima_sampling.py'
    },
    (v) => {
      v.mutation.mutatedSha256 = v.mutation.originalSha256
    },
    (v) => {
      v.baseline.reportPath = path.join(v.artifacts, 'report.json')
    },
  ]) {
    const value = wrapper('v_prediction', 'Normal', 'control')
    change(value)
    assert.throws(() => validateNoobaiVpredDpmFixture(value))
  }
  assert.throws(() => validateNoobaiVpredDpmFixture(wrapper('epsilon', 'Karras')))
  assert.throws(() => validateNoobaiVpredDpmFixture(wrapper('epsilon', 'Normal', 'restored')))
  for (const args of [
    ['baseline', 'dpmpp_sde', 'Normal', 'txt2img', 'history', 'v_prediction'],
    ['baseline', 'dpmpp_sde', 'Normal', 'img2img', 'history', 'v_prediction'],
    ['baseline', 'dpmpp_2m', 'Karras', 'outpaint', 'neighbor', 'v_prediction'],
    ['restored', 'dpmpp_2m', 'Normal', 'img2img', 'neighbor', 'v_prediction'],
    ['baseline', 'dpmpp_2m', 'Normal', 'txt2img', 'history', 'sample'],
  ])
    assert.throws(() => literalIllustriousDpmPlan(...args))
})

/** Resource/index/ready/composition boundaries are explicit doubles. TS production owners stay real. */
function modelService(fixture, entry) {
  const [objective, , key] = entry
  const component = (name) => ({
    byteSize: fixture[name].byteSize,
    managedPath: fixture[name].installed.managedPath,
    reference: resource(fixture, name),
  })
  return {
    assertNoUnboundGenerationEmbeddings: async ({
      modelFamily,
      positivePrompt,
      negativePrompt,
    }) => {
      assert.equal(modelFamily, 'illustrious')
      assert.deepEqual(positivePrompt, { embeddingRefs: [], text: prompts.positive })
      assert.deepEqual(negativePrompt, { embeddingRefs: [], text: prompts.negative })
    },
    resolveVerifiedGenerationCheckpointForPlan: async (reference) => {
      assert.deepEqual(reference, resource(fixture, key))
      return {
        managedPath: fixture[key].installed.managedPath,
        reference: resource(fixture, key),
        noiseProfile: noise(objective),
      }
    },
    resolveVerifiedGenerationLoraForPlan: async (reference) => {
      assert.deepEqual(reference, resource(fixture, 'illustriousLora'))
      return component('illustriousLora')
    },
    resolveVerifiedGenerationVaeForPlan: async (reference) => {
      assert.deepEqual(reference, resource(fixture, 'externalVaeNative'))
      return component('externalVaeNative')
    },
    resolveVerifiedGenerationEmbeddingForPlan: async () =>
      assert.fail('No embeddings in this finite gate.'),
    resolveVerifiedGenerationAnimaBundleForPlan: async () =>
      assert.fail('No Anima request in this finite gate.'),
    resolveVerifiedAnimaGenerationLoraForPlan: async () =>
      assert.fail('No Anima LoRA in this finite gate.'),
  }
}
async function preparation(entry) {
  const fixture = sources()
  const document = createEmptyProjectDocumentV1({
    title: 'Exact-file V DPM production boundary',
    primaryBbox: { x: 0, y: 0, width: 256, height: 256 },
  })
  const draft = document.generationDraft
  draft.model = resource(fixture, entry[2])
  draft.loras = [{ enabled: true, resource: resource(fixture, 'illustriousLora'), weight: -0.5 }]
  draft.vae = resource(fixture, 'externalVaeNative')
  draft.vaePrecision = 'FP32'
  draft.cfgRescale = 0
  draft.positivePrompt = { embeddingRefs: [], text: prompts.positive }
  draft.negativePrompt = { embeddingRefs: [], text: prompts.negative }
  draft.seed = { policy: 'fixed', value: 0 }
  draft.dynamicPrompt = { maxPrompts: 1, seedBehavior: 'per-iteration' }
  draft.sampling = {
    cfgScale: 4,
    steps: 4,
    sampler: 'DPM++ 2M',
    scheduler: entry[1],
    denoisingStrength: null,
  }
  const targetBytes = await transparentTargetPngFixture(256, 256)
  const target = {
    bbox: { ...document.primaryBbox },
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    generationDraft: draft,
    lastActualSeedSnapshot: null,
    mode: 'txt2img',
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
  const models = modelService(fixture, entry)
  return { fixture, document, draft, targetBytes, target, models }
}

test('real preparation refuses both DPM++SDE pairs under exact-file V ZTSNR policy', async () => {
  for (const schedule of ['Normal', 'Karras']) {
    const { target, models } = await preparation([
      'v_prediction',
      schedule,
      'illustrious',
      'unused',
    ])
    target.generationDraft.sampling.sampler = 'DPM++ SDE'
    await assert.rejects(
      prepareNormalGeneration({
        target,
        modelService: models,
        randomUint32: () => assert.fail('Fixed0 cannot draw Random.'),
      }),
      (error) => error.code === 'GENERATION_SAMPLING_UNSUPPORTED',
    )
  }
})

for (const entry of cases)
  test(`${entry[0]} ${entry[1]}: actual Prepare→SQLite admission→frozen/native→portable producer keeps exact profile despite caller edits`, async () => {
    const { fixture, document, draft, targetBytes, target, models } = await preparation(entry)
    const prepared = await prepareNormalGeneration({
      target,
      modelService: models,
      randomUint32: () => assert.fail('Fixed0 cannot draw Random.'),
    })
    const expected = expectedInputs(fixture, entry, document, targetBytes)
    const expectedPrepared = structuredClone(expected.context)
    delete expectedPrepared.sampling.seedBehavior
    assert.deepEqual(prepared.context, expectedPrepared)
    const portable = expectedConfiguration(fixture, entry)
    const temporary = await mkdtemp(path.join(tmpdir(), 'igs-noobai-vpred-dpm-producer-'))
    let database
    try {
      database = openAppDatabase(temporary, path.resolve('src/main/db/migrations'))
      const scratch = path.join(temporary, 'scratch')
      await mkdir(scratch, { mode: 0o700 })
      const projectPath = path.join(temporary, 'producer.igs')
      await writeFile(projectPath, 'indexed local queue identity fixture', {
        flag: 'wx',
        mode: 0o600,
      })
      const tabId = localProjectRecoveryKey(projectPath)
      const queue = new GenerationQueueRepository(database.db, temporary)
      await queue.recoverAfterRestart()
      const requests = []
      const enqueue = queue.enqueueIllustriousGenerationBatch.bind(queue)
      queue.enqueueIllustriousGenerationBatch = async (input) => {
        requests.push(...input.items.map((item) => structuredClone(item.request)))
        return await enqueue(input)
      }
      const preflights = []
      const orchestrator = new GenerationOrchestrator(
        {
          getOpenDocumentId: (id) => (id === tabId ? document.documentId : null),
          getOpenTabs: () => [{ id: tabId }],
          prepareNormalGenerationContext: async () =>
            assert.fail('Prepared input cannot reread the edited draft.'),
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
            preflights.push(structuredClone(input.entries))
          },
        },
        {
          cancelAndWait: async () => assert.fail('Stable input cannot cancel.'),
          runOne: async () => assert.fail('Mechanical test cannot dispatch inference.'),
        },
        scratch,
      )
      let edits = 0
      const admitted = await orchestrator.enqueuePreparedBatch(
        tabId,
        prepared,
        { iterations: 1, maxPrompts: 1, seedBehavior: 'per-iteration' },
        { ready },
        async () => {
          edits++
          draft.seed = { policy: 'fixed', value: 37 }
          draft.positivePrompt.text = 'late draft text'
          prepared.context.model.reference.predictionType =
            entry[0] === 'v_prediction' ? 'epsilon' : 'v_prediction'
          prepared.context.sampling.noiseProfile.rescaleBetasZeroSnr = entry[0] !== 'v_prediction'
          prepared.context.sampling.noiseProfile.timestepSpacing = 'trailing'
          prepared.context.sampling.seed = 37
          prepared.context.prompts.negative = 'late prepared text'
          prepared.context.loras[0].weight = 0.5
          prepared.targetPngBytes.fill(0)
        },
      )
      assert.equal(edits, 1)
      assert.equal(admitted.plan.truncated, false)
      assert.equal(admitted.items.length, 1)
      assert.equal(admitted.plan.items.length, 1)
      assert.deepEqual(admitted.plan.items[0].prompts, prompts)
      assert.equal(admitted.plan.items[0].seed, 0)
      const [queued] = admitted.items
      assert.equal(queued.status, 'pending')
      const verified = await queue.loadVerifiedInput(queued.id)
      const frozen = verified.payload
      expected.originRequestId = frozen.originRequestId
      assert.match(frozen.originRequestId, /^[a-f0-9-]{36}$/i)
      assert.deepEqual(frozen, expected)
      assert.deepEqual(await readFile(verified.targetPath), targetBytes)
      assert.equal(preflights.length, 1)
      assert.equal(preflights[0][0].queueItemId, queued.id)
      assert.deepEqual(JSON.parse(preflights[0][0].frozenPayloadJson), expected)
      assert.equal(requests.length, 1)
      const [request] = requests
      const lease = request.job.output.stagingRoot
      assert.equal(path.dirname(lease), scratch)
      assert.deepEqual(request, {
        protocolVersion: '1',
        requestId: expected.originRequestId,
        type: 'generate-illustrious-txt2img',
        job: {
          ...expected.workerJob,
          output: { pngPath: path.join(lease, 'result.png'), stagingRoot: lease },
          target: { ...expected.workerJob.target, path: path.join(lease, 'target.png') },
        },
      })

      const output = await acceptedOutputPngFixture(256, 256)
      const frozenPayloadJson = JSON.stringify(frozen)
      const provenance = provenanceFromVerifiedRasterCandidate({
        candidate: {
          actualSeed: 0,
          assetPath: path.join(temporary, 'candidate.png'),
          bbox: { x: 0, y: 0, width: 256, height: 256 },
          candidateId: queued.id,
          queueItemId: queued.id,
          completedAt: '2026-10-10T12:00:00.000Z',
          completionOrder: 1,
          documentId: document.documentId,
          documentRevision: document.documentRevision,
          frozenPayloadJson,
          frozenPayloadSha256: digest(frozenPayloadJson),
          image: {
            byteSize: output.length,
            width: 256,
            height: 256,
            sha256: digest(output),
            iccSha256: icc,
          },
          localProjectKey: tabId,
          projectPath,
          stagingSessionId: queued.stagingSessionId,
        },
        imagePngBytes: output,
        acceptedAt: '2026-10-10T12:01:00.000Z',
      })
      assert.deepEqual(provenance.generationConfiguration, portable)
      assert.equal(provenance.kind, 'illustrious-txt2img')
      assert.equal(provenance.layerSourceContext.sourceTargetSha256, digest(targetBytes))
      assert.equal(provenance.executionResultContext.queueItemId, queued.id)
      assert.equal(provenance.executionResultContext.output.sha256, digest(output))
      const [item] = literalIllustriousDpmPlan(
        'baseline',
        'dpmpp_2m',
        entry[1],
        'txt2img',
        'history',
        entry[0],
      ).items
      assertIllustriousDpmFrozen(frozen, item, fixture)
      assertIllustriousDpmConfiguration(provenance.generationConfiguration, item, fixture)

      // Sensitivity checks mutate real producer outputs, not a self-declared expected object.
      for (const mutate of [
        (v) => {
          v.workerJob.checkpoint.predictionType =
            entry[0] === 'v_prediction' ? 'epsilon' : 'v_prediction'
        },
        (v) => {
          v.context.model.reference.predictionType = null
        },
        (v) => {
          v.workerJob.sampling.noiseProfile.rescaleBetasZeroSnr = entry[0] !== 'v_prediction'
        },
        (v) => {
          v.context.sampling.noiseProfile.timestepSpacing = 'trailing'
        },
        (v) => {
          const changedScheduler = entry[1] === 'Normal' ? 'dpmpp_2m_k' : 'dpmpp_2m'
          v.workerJob.sampling.scheduler = changedScheduler
          v.context.sampling.invokeScheduler = changedScheduler
          v.context.sampling.scheduler = entry[1] === 'Normal' ? 'Karras' : 'Normal'
        },
        (v) => {
          v.workerJob.checkpoint.sha256 = 'a'.repeat(64)
        },
        (v) => {
          v.workerJob.loras[0].weight = 0.5
        },
        (v) => {
          v.workerJob.sampling.seed = 37
        },
        (v) => {
          v.workerJob.sampling.denoisingStrength = 0.5
        },
        (v) => {
          v.workerJob.vaePrecision = 'FP16'
        },
      ]) {
        const changed = structuredClone(frozen)
        mutate(changed)
        assert.throws(() => assertIllustriousDpmFrozen(changed, item, fixture))
        assert.notDeepEqual(
          normalizeIllustriousDpmNativeInputs(changed),
          normalizeIllustriousDpmNativeInputs(frozen),
        )
      }
      for (const mutate of [
        (v) => {
          v.model.predictionType = null
        },
        (v) => {
          v.sampling.noiseProfile.rescaleBetasZeroSnr = entry[0] !== 'v_prediction'
        },
        (v) => {
          v.sampling.noiseProfile.timestepSpacing = 'trailing'
        },
        (v) => {
          v.sampling.invokeScheduler = 'euler'
        },
        (v) => {
          v.sampling.actualSeed = 37
        },
        (v) => {
          v.loras[0].weight = 0.5
        },
        (v) => {
          v.vaePrecision = 'Auto'
        },
        (v) => {
          v.managedPath = fixture[entry[2]].installed.managedPath
        },
      ]) {
        const changed = structuredClone(provenance.generationConfiguration)
        mutate(changed)
        assert.throws(() => assertIllustriousDpmConfiguration(changed, item, fixture))
      }
      const changedSources = structuredClone(fixture)
      changedSources[entry[2]].trainedObjective =
        entry[0] === 'v_prediction' ? 'epsilon' : 'v_prediction'
      assert.throws(() => assertIllustriousDpmFrozen(frozen, item, changedSources))
      assert.deepEqual(provenance.generationConfiguration, portable)
    } finally {
      try {
        await database?.close()
      } finally {
        await rm(temporary, { force: true, recursive: true })
      }
    }
  })
