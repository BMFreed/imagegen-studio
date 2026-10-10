/** Real TS producers and independent oracle sensitivity; no installed inference evidence. */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../src/main/db/database.ts'
import { GenerationOrchestrator } from '../src/main/projects/generation-orchestrator.ts'
import { GenerationQueueRepository } from '../src/main/projects/generation-queue.ts'
import {
  prepareNormalGeneration,
  prepareNormalOutpaintGeneration,
} from '../src/main/projects/project-generation-preparation.ts'
import { localProjectRecoveryKey } from '../src/main/projects/project-identity.ts'
import {
  acceptedOutputPngFixture,
  transparentTargetPngFixture,
} from '../src/main/projects/test-fixtures/accepted-provenance.ts'
import { outpaintPngFromAlpha } from '../src/main/projects/test-fixtures/outpaint-contribution.ts'
import { createEmptyProjectDocumentV1 } from '../src/shared/projects/project-schema.ts'
import {
  assertNoobaiEmbeddingPolarityImageFrozen as assertFrozen,
  literalNoobaiEmbeddingPolarityImagePlan as planFor,
  normalizeNoobaiEmbeddingPolarityImageNativeInputs as normalize,
  validateNoobaiEmbeddingPolarityImageFixture as validate,
  expectedNoobaiImageEmbeddingRef as embeddingRef,
} from './noobai-embedding-polarity-image-qualification.mjs'
const root = path.join(
  homedir(),
  '.codex/artifacts/imagegen-studio/runs/embedding-image-oracle-mechanics',
)
const icc = '113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1'
const noise = {
  schemaVersion: 1,
  baseSchedule: 'sdxl-scaled-linear-v1',
  rescaleBetasZeroSnr: false,
  timestepSpacing: 'leading',
}
function installedFixture() {
  const appData = path.join(root, 'pool/data/imagegen-studio')
  const fields = {
    illustrious: [
      700040,
      6938040794,
      'edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d',
      'checkpoint',
      1147756,
      2679856,
      2566634,
    ],
    embeddingTrained: [
      700100,
      49736,
      '91a95b244b8ba01d905d32ced7e3cc20eb74b4da8f519de3764505500d386c36',
      'embedding',
      2360940,
      2655289,
      2542976,
    ],
    embeddingControl: [
      700110,
      49552,
      'b736cd9c1f9ee07795c5917825baa95ae14bac6383bdddff5530dfefa4bece0d',
      'embedding',
      2360940,
      700111,
      700112,
    ],
    illustriousEpsilon: [
      700140,
      6938040416,
      'ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1',
      'checkpoint',
      833294,
      1022833,
      928571,
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
      Object.entries(fields).map(
        ([key, [id, byteSize, sha256, type, modelId, versionId, fileId]]) => [
          key,
          {
            byteSize,
            sha256,
            type,
            family: 'illustrious',
            name: `Fixture ${key}`,
            versionName: 'Qualified version',
            origin: { modelId, versionId, fileId },
            ...(key === 'illustriousEpsilon'
              ? { trainedObjective: 'epsilon' }
              : key === 'illustrious'
                ? { trainedObjective: 'v_prediction' }
                : {}),
            installed: {
              resourceId: randomUUID(),
              versionId: randomUUID(),
              managedPath: path.join(appData, 'models', `qualified-${id}.safetensors`),
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
    predictionType:
      key === 'illustriousEpsilon' ? 'epsilon' : key === 'illustrious' ? 'v_prediction' : null,
    versionName: source.versionName,
  }
}
function file(fixture, key) {
  return {
    byteSize: fixture[key].byteSize,
    path: fixture[key].installed.managedPath,
    sha256: fixture[key].sha256,
  }
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
      assert.deepEqual(positivePrompt, {
        embeddingRefs: plan.items[0].positiveEmbedding
          ? [embeddingRef(fixture, plan.items[0].positiveEmbedding)]
          : [],
        text: plan.sourcePrompts.positive,
      })
      assert.deepEqual(negativePrompt, {
        embeddingRefs: plan.items[0].negativeEmbedding
          ? [embeddingRef(fixture, plan.items[0].negativeEmbedding)]
          : [],
        text: plan.sourcePrompts.negative,
      })
    },
    resolveVerifiedGenerationCheckpointForPlan: async (reference) => {
      assert.deepEqual(reference, resource(fixture, plan.modelKey))
      return {
        managedPath: fixture[plan.modelKey].installed.managedPath,
        reference: resource(fixture, plan.modelKey),
        noiseProfile: { ...noise, rescaleBetasZeroSnr: plan.objective === 'v_prediction' },
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
    resolveVerifiedGenerationEmbeddingForPlan: async (ref) => {
      const key = ['embeddingTrained', 'embeddingControl'].find(
        (k) => fixture[k].sha256 === ref.fileSha256,
      )
      assert.ok(key)
      assert.deepEqual(ref, resource(fixture, key))
      return component(key)
    },
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
    title: 'Signed image production boundary',
  })
  document.primaryBbox = { x: mode === 'outpaint' ? 64 : 0, y: 0, width: 256, height: 256 }
  const draft = document.generationDraft
  draft.model = resource(fixture, plan.modelKey)
  draft.loras = [{ enabled: true, resource: resource(fixture, 'illustriousLora'), weight: -0.5 }]
  draft.vae = resource(fixture, 'externalVaeNative')
  draft.vaePrecision = 'FP32'
  draft.cfgRescale = 0
  draft.positivePrompt = {
    embeddingRefs: plan.items[0].positiveEmbedding
      ? [embeddingRef(fixture, plan.items[0].positiveEmbedding)]
      : [],
    text: plan.sourcePrompts.positive,
  }
  draft.negativePrompt = {
    embeddingRefs: plan.items[0].negativeEmbedding
      ? [embeddingRef(fixture, plan.items[0].negativeEmbedding)]
      : [],
    text: plan.sourcePrompts.negative,
  }
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
      : mode === 'txt2img'
        ? await transparentTargetPngFixture(256, 256)
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

  const temporary = await mkdtemp(path.join(tmpdir(), 'igs-signed-image-producer-'))
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
    if (caseName !== 'ordinary') {
      const wrong = structuredClone(frozen)
      for (const field of ['embeddingRefs', 'embeddings'])
        [wrong.context[field].positive, wrong.context[field].negative] = [
          wrong.context[field].negative,
          wrong.context[field].positive,
        ][(wrong.workerJob.embeddings.positive, wrong.workerJob.embeddings.negative)] = [
          wrong.workerJob.embeddings.negative,
          wrong.workerJob.embeddings.positive,
        ]
      assert.throws(
        () => assertFrozen(wrong, plan.items[0], fixture),
        'Jointly swapped otherwise-consistent signed fields cannot pass.',
      )
    } else assert.equal(Object.hasOwn(frozen.workerJob, 'embeddings'), false)
  } finally {
    await database?.close()
    await rm(temporary, { force: true, recursive: true })
  }
}
for (const objective of ['epsilon', 'v_prediction'])
  for (const mode of ['img2img', 'outpaint'])
    for (const choice of ['positive-zero', 'negative-zero'])
      test(`${objective}/${mode}/${choice}: actual Prepare, admission, durable frozen and late-edit isolation`, async () =>
        assertProduction(objective, mode, choice))
test('EPS IMG ordinary neighboring admission omits all signed wire input', async () =>
  assertProduction('epsilon', 'img2img', 'ordinary'))

test('strict envelope rejects undeclared modes, stages, V controls and unsafe source/mutation fields before reads', () => {
  const good = {
    schemaVersion: 1,
    profile: 'noobai-embedding-polarity-image',
    objective: 'epsilon',
    mode: 'img2img',
    case: 'positive-zero',
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
  assert.deepEqual(validate(good), planFor('baseline', 'epsilon', 'img2img', 'positive-zero'))
  for (const patch of [
    { mode: 'txt2img' },
    { stage: 'retry' },
    { case: 'both-trained' },
    { unknown: true },
    { artifacts: root },
    { sourceImage: { ...good.sourceImage, pixelSha256: 'x' } },
    { mutation: { module: 'inference.py' } },
  ])
    assert.throws(() => validate({ ...good, ...patch }))
  assert.throws(() => planFor('control', 'v_prediction', 'img2img', 'positive-zero'))
  assert.throws(() => planFor('baseline', 'epsilon', 'outpaint', 'ordinary'))
  assert.throws(() => planFor('restored', 'epsilon', 'img2img', 'ordinary'))
})
