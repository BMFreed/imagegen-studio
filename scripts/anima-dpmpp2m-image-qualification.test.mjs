/**
 * Real TS preparation/frozen/provenance vs independent image-mode literals; no installed inference
 * evidence.
 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { prepareAnimaGenerationBatch } from '../src/main/projects/anima-generation-batch.ts'
import {
  prepareAnimaGeneration,
  prepareAnimaOutpaintGeneration,
} from '../src/main/projects/anima-generation-preparation.ts'
import {
  buildFrozenQueuedAnimaGenerationV1,
  buildFrozenQueuedAnimaOutpaintV1,
} from '../src/main/projects/anima-queued-generation.ts'
import { provenanceFromVerifiedRasterCandidate } from '../src/main/projects/project-generation-provenance.ts'
import { localProjectRecoveryKey } from '../src/main/projects/project-identity.ts'
import { acceptedOutputPngFixture } from '../src/main/projects/test-fixtures/accepted-provenance.ts'
import { outpaintPngFromAlpha } from '../src/main/projects/test-fixtures/outpaint-contribution.ts'
import { ANIMA_BATCH_READY } from '../src/main/projects/test-fixtures/anima-batch.ts'
import { buildAnimaWorkerRequest } from '../src/shared/projects/anima-worker-request.ts'
import { IGS_SRGB_ICC_SHA256 } from '../src/shared/projects/color-profile.ts'
import { createEmptyProjectDocumentV1 } from '../src/shared/projects/project-schema.ts'
import {
  assertAnimaDpmpp2mImageConfiguration,
  assertAnimaDpmpp2mImageFrozen,
  assertAnimaDpmpp2mImageOutputPixels,
  assertAnimaDpmpp2mImageSavedPixels,
  assertAnimaDpmpp2mImageTargetPixels,
  literalAnimaDpmpp2mImageContributionAlpha,
  literalAnimaDpmpp2mImageNativePlan,
  literalAnimaDpmpp2mImagePlan,
  literalAnimaDpmpp2mImageTargetAlpha,
  normalizeAnimaDpmpp2mImageNativeInputs,
  validateAnimaDpmpp2mImageFixture,
} from './anima-dpmpp2m-image-qualification.mjs'
import * as common from './anima-heun-image-qualification.mjs'

const root = path.join(
  homedir(),
  '.codex/artifacts/imagegen-studio/runs/dpmpp2m-image-source-mechanics',
)
const digest = (value) => createHash('sha256').update(value).digest('hex')
const red = 'a (red:1.3) ceramic cup on a wooden table, studio photograph'
const blurry = '(blurry:0.7), low quality'
function wrapper(stage = 'baseline', mode = 'outpaint', caseName = 'history') {
  return {
    schemaVersion: 1,
    profile: 'anima-dpmpp2m-image',
    stage,
    mode,
    case: caseName,
    referenceFixture: { path: path.join(root, 'reference.json'), sha256: 'a'.repeat(64) },
    workerBaseline: { path: path.join(root, 'entry-sources.json'), sha256: 'b'.repeat(64) },
    sourceImage: {
      path: path.join(root, 'source.png'),
      sha256: 'f'.repeat(64),
      byteSize: 1024,
      pixelSha256: '1'.repeat(64),
    },
    lamaSource: {
      path: path.join(root, 'source-lama.pt'),
      sha256: '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9',
      byteSize: 205669692,
    },
    artifacts: path.join(root, `output-${stage}-${mode}-${caseName}`),
    ...(stage === 'baseline'
      ? {}
      : {
          baseline: {
            reportPath: path.join(root, `baseline-${mode}-${caseName}/report.json`),
            reportSha256: 'c'.repeat(64),
          },
        }),
    ...(stage === 'control'
      ? {
          mutation: {
            module: 'anima_sampling.py',
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
 * Real preparation/compiler/frozen parser/provenance; model resolvers and output pixels are
 * controlled.
 */
async function productionRecords(mode, caseName, fixture = installedFixture()) {
  const plan = literalAnimaDpmpp2mImagePlan('baseline', mode, caseName)
  const document = createEmptyProjectDocumentV1({
    title: 'DPM++2M IMG/OUT',
    primaryBbox: plan.bbox,
  })
  const draft = document.generationDraft
  draft.model = reference(fixture, 'anima')
  draft.loras = [{ enabled: true, resource: reference(fixture, 'animaLora'), weight: -0.5 }]
  draft.positivePrompt.text = red
  draft.negativePrompt.text = blurry
  draft.seed = { policy: 'fixed', value: 0 }
  draft.dynamicPrompt = { maxPrompts: 1, seedBehavior: 'per-iteration' }
  draft.sampling = {
    steps: 4,
    cfgScale: 4,
    denoisingStrength: plan.denoisingStrength,
    sampler: 'Euler',
    scheduler: 'Normal',
    animaMethod: 'dpmpp_2m',
  }
  draft.cfgRescale = 0
  draft.vaePrecision = 'Auto'
  const bytes =
    mode === 'outpaint'
      ? await outpaintPngFromAlpha(literalAnimaDpmpp2mImageTargetAlpha(), 256, 256)
      : await acceptedOutputPngFixture(256, 256)
  const target = {
    bbox: document.primaryBbox,
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    generationDraft: draft,
    lastActualSeedSnapshot: null,
    mode,
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
  const prepared = await (
    mode === 'outpaint' ? prepareAnimaOutpaintGeneration : prepareAnimaGeneration
  )({
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
  const context = prepared.context
  const stagingRoot = path.join(tmpdir(), `igs-dpmpp2m-image-dto-${randomUUID()}`)
  let frozen
  if (mode === 'outpaint') frozen = buildFrozenQueuedAnimaOutpaintV1(context, randomUUID())
  else {
    const batch = prepareAnimaGenerationBatch({ prepared, iterations: 1 })
    assert.equal(batch.items.length, 1)
    assert.equal(batch.truncated, false)
    const [item] = batch.items
    const request = buildAnimaWorkerRequest(
      {
        requestId: randomUUID(),
        mode,
        bbox: context.bbox,
        model: {
          architecture: 'anima-base-1.0',
          checkpoint: file(fixture, 'anima'),
          qwen3Encoder: file(fixture, 'encoder'),
          vae: file(fixture, 'vae'),
        },
        loras: [{ ...file(fixture, 'animaLora'), weight: -0.5 }],
        prompts: item.prompts,
        sampling: {
          guidanceScale: 4,
          scheduler: 'dpmpp_2m',
          seed: 0,
          steps: 4,
          strength: plan.denoisingStrength,
        },
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
    frozen = buildFrozenQueuedAnimaGenerationV1({ context, item, request })
  }
  const output =
    mode === 'outpaint'
      ? await outpaintPngFromAlpha(literalAnimaDpmpp2mImageContributionAlpha(), 256, 256)
      : await acceptedOutputPngFixture(256, 256)
  const projectPath = path.join(tmpdir(), 'dpmpp2m-image-oracle.igs')
  const frozenPayloadJson = JSON.stringify(frozen)
  const queueItemId = randomUUID()
  const provenance = provenanceFromVerifiedRasterCandidate({
    candidate: {
      actualSeed: 0,
      assetPath: path.join(stagingRoot, 'candidate.png'),
      bbox: context.bbox,
      candidateId: queueItemId,
      queueItemId,
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
      stagingSessionId: randomUUID(),
    },
    imagePngBytes: output,
    acceptedAt: '2026-10-10T12:01:00.000Z',
  })
  return { frozen, configuration: provenance.generationConfiguration, provenance, fixture }
}

const cases = [
  ['neighbor', 'img2img'],
  ['history', 'img2img'],
  ['history', 'outpaint'],
]
for (const [caseName, mode] of cases) {
  test(`DPM++2M ${caseName}/${mode}: literal grid matches actual TS preparation/request/provenance`, async () => {
    // Real producers: TS preparation/compiler/frozen parser/portable projection; no ML/storage.
    // Independent expected literals distinguish two first-order evaluations from order1/2/1.
    const plan = validateAnimaDpmpp2mImageFixture(wrapper('baseline', mode, caseName))
    const { frozen, configuration, fixture } = await productionRecords(mode, caseName)
    const original = structuredClone({ frozen, configuration })
    assert.equal(plan.expectedAdmissions, 1)
    assert.equal(plan.expectedCompletions, 1)
    assert.deepEqual(frozen.workerJob.sampling, literalAnimaDpmpp2mImageNativePlan(caseName))
    assertAnimaDpmpp2mImageFrozen(frozen, plan.items[0], fixture)
    assertAnimaDpmpp2mImageConfiguration(configuration, plan.items[0], fixture)
    assert.deepEqual(
      { frozen, configuration },
      original,
      'Common validation projections may not mutate actual payloads.',
    )
    assert.equal(frozen.workerJob.sampling.steps, 4)
    assert.equal(frozen.workerJob.sampling.totalSteps, caseName === 'neighbor' ? 2 : 3)
    assert.equal(Object.isFrozen(plan.items[0].compiledPrompts.positive.spans), true)
  })
  test(`DPM++2M ${caseName}/${mode}: own assertions reject every projected native slot before common checks`, async () => {
    const { frozen, configuration, fixture } = await productionRecords(mode, caseName)
    const expected = literalAnimaDpmpp2mImagePlan('baseline', mode, caseName).items[0]
    for (const field of Object.keys(literalAnimaDpmpp2mImageNativePlan(caseName))) {
      const changed = structuredClone(frozen)
      delete changed.workerJob.sampling[field]
      assert.throws(
        () => assertAnimaDpmpp2mImageFrozen(changed, expected, fixture),
        `Missing native ${field} must not disappear into projection.`,
      )
    }
    for (const edit of [
      (value) => {
        value.workerJob.sampling.extra = true
      },
      (value) => {
        value.workerJob.sampling.scheduler = 'heun'
      },
      (value) => {
        value.workerJob.sampling.strength = caseName === 'history' ? 0.5 : 0.75
      },
      (value) => {
        value.workerJob.sampling.beginIndex = 0
      },
      (value) => {
        value.workerJob.sampling.startStep = 0
      },
      (value) => {
        value.workerJob.sampling.initialSigma = 0.75
      },
      (value) => {
        value.workerJob.sampling.sigmas[0] = 0.75
      },
      (value) => {
        value.workerJob.sampling.timesteps[0] = value.workerJob.sampling.sigmas[0] * 1000
      },
      (value) => {
        value.workerJob.sampling.totalSteps = 4
      },
      (value) => {
        value.workerJob.sampling.posteriorSeed = 0
      },
      (value) => {
        value.workerJob.sampling.stepSeed = 1
      },
      (value) => {
        value.context.sampling.animaMethod = 'heun'
      },
      (value) => {
        value.context.sampling.denoisingStrength = caseName === 'history' ? 0.5 : 0.75
      },
      (value) => {
        value.context.sampling.steps = 3
      },
      (value) => {
        value.context.sampling.seed = 37
      },
      (value) => {
        value.context.sampling.requestedSeedPolicy = 'random'
      },
      (value) => {
        value.context.sampling.extra = true
      },
      (value) => {
        value.workerJob.loras[0].weight = 0.5
      },
      (value) => {
        value.workerJob.prompts.negative.spans[0].weight = 1
      },
      (value) => {
        value.workerJob.model.vae.sha256 = 'f'.repeat(64)
      },
      (value) => {
        value.workerJob.target.sha256 = 'f'.repeat(64)
      },
      ...(mode === 'outpaint'
        ? [
            (value) => {
              value.context.conditioning.keepMask.sha256 = 'f'.repeat(64)
            },
            (value) => {
              value.context.conditioning.policy.fadeDistance = 8
            },
          ]
        : []),
    ]) {
      const changed = structuredClone(frozen)
      edit(changed)
      assert.throws(() => assertAnimaDpmpp2mImageFrozen(changed, expected, fixture))
    }
    for (const edit of [
      (value) => {
        delete value.sampling.denoisingStrength
      },
      (value) => {
        value.sampling.denoisingStrength = caseName === 'history' ? 0.5 : 0.75
      },
      (value) => {
        value.sampling.animaMethod = 'heun'
      },
      (value) => {
        value.sampling.extra = true
      },
      (value) => {
        value.sampling.actualSeed = 37
      },
      (value) => {
        value.sampling.steps = 3
      },
      (value) => {
        value.loras[0].weight = 0.5
      },
      (value) => {
        value.anima.vae.sha256 = 'f'.repeat(64)
      },
      (value) => {
        value.mode = 'txt2img'
      },
    ]) {
      const changed = structuredClone(configuration)
      edit(changed)
      assert.throws(() => assertAnimaDpmpp2mImageConfiguration(changed, expected, fixture))
    }
  })
}

test('DPM native normalizer omits only document identity and preserves original strength/grid/conditioning', async () => {
  const fixture = installedFixture(),
    normalizedCases = []
  for (const [caseName, mode] of cases) {
    const { frozen } = await productionRecords(mode, caseName, fixture)
    const original = structuredClone(frozen),
      replay = structuredClone(frozen)
    replay.context.documentId = randomUUID()
    replay.context.documentRevision = randomUUID()
    const normalized = normalizeAnimaDpmpp2mImageNativeInputs(frozen)
    assert.deepEqual(normalized, normalizeAnimaDpmpp2mImageNativeInputs(replay))
    assert.deepEqual(normalized.workerJob, original.workerJob)
    assert.deepEqual(normalized.context.sampling, original.context.sampling)
    assert.deepEqual(normalized.context.conditioning, original.context.conditioning)
    assert.deepEqual(frozen, original)
    normalizedCases.push(normalized)
    const dropped = structuredClone(frozen)
    delete dropped.context.sampling.denoisingStrength
    assert.throws(() => normalizeAnimaDpmpp2mImageNativeInputs(dropped))
    const extra = structuredClone(frozen)
    extra.workerJob.sampling.extra = true
    assert.throws(() => normalizeAnimaDpmpp2mImageNativeInputs(extra))
  }
  assert.notDeepEqual(normalizedCases[0], normalizedCases[1])
  assert.notDeepEqual(normalizedCases[1], normalizedCases[2])
})

test('envelope admits exactly the eight planned mode/case/stage combinations', () => {
  let admitted = 0
  for (const stage of ['baseline', 'control', 'restored'])
    for (const mode of ['img2img', 'outpaint'])
      for (const caseName of ['neighbor', 'history']) {
        const valid = caseName === 'history' || (mode === 'img2img' && stage !== 'restored')
        if (valid) {
          validateAnimaDpmpp2mImageFixture(wrapper(stage, mode, caseName))
          admitted++
        } else assert.throws(() => validateAnimaDpmpp2mImageFixture(wrapper(stage, mode, caseName)))
      }
  assert.equal(admitted, 8)
  for (const edit of [
    (value) => {
      delete value.case
    },
    (value) => {
      value.case = 'unknown'
    },
    (value) => {
      value.profile = 'anima-heun-image'
    },
    (value) => {
      value.strength = 0.75
    },
    (value) => {
      value.steps = 4
    },
    (value) => {
      value.sourceImage.extra = true
    },
    (value) => {
      value.lamaSource.byteSize = 1
    },
    (value) => {
      value.artifacts = root
    },
    (value) => {
      value.sourceImage.path = '/tmp/source.png'
    },
    (value) => {
      value.referenceFixture.sha256 = 'A'.repeat(64)
    },
  ]) {
    const input = wrapper()
    edit(input)
    assert.throws(() => validateAnimaDpmpp2mImageFixture(input))
  }
  for (const edit of [
    (value) => {
      delete value.baseline
    },
    (value) => {
      delete value.mutation
    },
    (value) => {
      value.mutation.module = 'vendor/er_sde_scheduler.py'
    },
    (value) => {
      value.mutation.mutatedSha256 = value.mutation.originalSha256
    },
    (value) => {
      value.mutation.extra = true
    },
    (value) => {
      value.artifacts = path.dirname(value.baseline.reportPath)
    },
  ]) {
    const input = wrapper('control')
    edit(input)
    assert.throws(() => validateAnimaDpmpp2mImageFixture(input))
  }
})

test('method-independent pixel helpers are shared by identity; DPM literal expectations are fixed independently', () => {
  assert.equal(assertAnimaDpmpp2mImageTargetPixels, common.assertAnimaHeunImageTargetPixels)
  assert.equal(assertAnimaDpmpp2mImageOutputPixels, common.assertAnimaHeunImageOutputPixels)
  assert.equal(assertAnimaDpmpp2mImageSavedPixels, common.assertAnimaHeunImageSavedPixels)
  assert.equal(literalAnimaDpmpp2mImageTargetAlpha, common.literalAnimaHeunImageTargetAlpha)
  assert.equal(
    literalAnimaDpmpp2mImageContributionAlpha,
    common.literalAnimaHeunImageContributionAlpha,
  )
  for (const [caseName, mode] of cases)
    for (const field of [
      'case',
      'seed',
      'iteration',
      'promptPairIndex',
      'animaMethod',
      'denoisingStrength',
    ]) {
      const expected = structuredClone(
        literalAnimaDpmpp2mImagePlan('baseline', mode, caseName).items[0],
      )
      expected[field] = field === 'case' ? 'unknown' : field === 'animaMethod' ? 'heun' : 37
      assert.throws(() => assertAnimaDpmpp2mImageFrozen({}, expected, installedFixture()))
    }
})
