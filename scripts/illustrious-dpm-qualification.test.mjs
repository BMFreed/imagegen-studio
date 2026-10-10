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
import { buildQueuedOutpaintWorkerRequest } from '../src/main/projects/outpaint-worker-request.ts'
import {
  prepareNormalGeneration,
  prepareNormalOutpaintGeneration,
} from '../src/main/projects/project-generation-preparation.ts'
import { provenanceFromVerifiedRasterCandidate } from '../src/main/projects/project-generation-provenance.ts'
import { localProjectRecoveryKey } from '../src/main/projects/project-identity.ts'
import {
  acceptedOutputPngFixture,
  transparentTargetPngFixture,
} from '../src/main/projects/test-fixtures/accepted-provenance.ts'
import { outpaintPngFromAlpha } from '../src/main/projects/test-fixtures/outpaint-contribution.ts'
import { createEmptyProjectDocumentV1 } from '../src/shared/projects/project-schema.ts'
import {
  assertIllustriousDpmConfiguration,
  assertIllustriousDpmFrozen,
  assertIllustriousDpmImageOutputPixels,
  assertIllustriousDpmImageSavedPixels,
  assertIllustriousDpmImageTargetPixels,
  illustriousDpmPair,
  illustriousDpmPairs,
  literalIllustriousDpmContributionAlpha,
  literalIllustriousDpmPlan,
  literalIllustriousDpmTargetAlpha,
  normalizeIllustriousDpmNativeInputs,
  validateIllustriousDpmFixture,
} from './illustrious-dpm-qualification.mjs'

const root = path.join(homedir(), '.codex/artifacts/imagegen-studio/runs/illustrious-dpm-oracle')
const icc = '113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1'
const noise = {
  schemaVersion: 1,
  baseSchedule: 'sdxl-scaled-linear-v1',
  rescaleBetasZeroSnr: false,
  timestepSpacing: 'leading',
}
const prompts = {
  positive: 'a (red:1.3) ceramic cup on a wooden table, studio photograph',
  negative: '(blurry:0.7), low quality',
}
const pairs = [
  ['dpmpp_2m', 'Normal', 'DPM++ 2M', 'dpmpp_2m', 4, 3, 2, 0.5],
  ['dpmpp_2m', 'Karras', 'DPM++ 2M', 'dpmpp_2m_k', 4, 3, 2, 0.5],
  ['dpmpp_sde', 'Normal', 'DPM++ SDE', 'dpmpp_sde', 7, 5, 1, 0.05],
  ['dpmpp_sde', 'Karras', 'DPM++ SDE', 'dpmpp_sde_k', 7, 5, 1, 0.05],
]
const modes = ['txt2img', 'img2img', 'outpaint']

function wrapper(
  stage = 'baseline',
  mode = 'outpaint',
  algorithm = 'dpmpp_2m',
  schedule = 'Karras',
  caseName = 'history',
) {
  return {
    schemaVersion: 1,
    profile: 'illustrious-dpm',
    stage,
    mode,
    algorithm,
    schedule,
    case: caseName,
    referenceFixture: { path: path.join(root, 'reference.json'), sha256: 'a'.repeat(64) },
    workerBaseline: { path: path.join(root, 'worker.json'), sha256: 'b'.repeat(64) },
    artifacts: path.join(root, `${algorithm}-${schedule}-${mode}-${caseName}-${stage}`),
    ...(mode === 'txt2img'
      ? {}
      : {
          sourceImage: {
            path: path.join(root, 'source.png'),
            sha256: 'c'.repeat(64),
            byteSize: 1024,
            pixelSha256: 'd'.repeat(64),
          },
        }),
    ...(mode === 'outpaint'
      ? {
          lamaSource: {
            path: path.join(root, 'source-lama.pt'),
            sha256: '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9',
            byteSize: 205669692,
          },
        }
      : {}),
    ...(stage === 'baseline'
      ? {}
      : {
          baseline: {
            reportPath: path.join(
              root,
              `baseline-${algorithm}-${schedule}-${mode}-${caseName}/report.json`,
            ),
            reportSha256: 'e'.repeat(64),
          },
        }),
    ...(stage === 'control'
      ? {
          mutation: {
            module: 'inference.py',
            originalSha256: '1'.repeat(64),
            mutatedSha256: '2'.repeat(64),
          },
        }
      : {}),
  }
}

/** Independent exact source descriptors; no resource/stat/model reads. */
function installedFixture() {
  const appData = path.join(root, 'pool/data/imagegen-studio')
  const fields = {
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
            ...(key === 'illustriousEpsilon' ? { trainedObjective: 'epsilon' } : {}),
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
    predictionType: key === 'illustriousEpsilon' ? 'epsilon' : null,
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
function captured(pair, mode, fixture, caseName = 'history') {
  const [algorithm, schedule, sampler, invokeScheduler, , , , neighborStrength] = pair
  const strength = caseName === 'neighbor' ? neighborStrength : 0.75
  const bbox = { x: mode === 'outpaint' ? 64 : 0, y: 0, width: 256, height: 256 }
  const target = {
    byteSize: 2048,
    colorSpace: 'srgb',
    format: 'png',
    height: 256,
    width: 256,
    iccSha256: icc,
    sha256: 'f'.repeat(64),
  }
  const lora = resource(fixture, 'illustriousLora')
  const context = {
    schemaVersion: 1,
    kind: `normal-${mode}-preparation`,
    documentId: randomUUID(),
    documentRevision: randomUUID(),
    bbox,
    prompts: { ...prompts },
    target,
    sampling: {
      cfgRescale: 0,
      cfgScale: 4,
      invokeScheduler,
      noiseProfile: { ...noise },
      requestedSeedPolicy: 'fixed',
      sampler,
      scheduler: schedule,
      seed: 0,
      seedBehavior: 'per-iteration',
      steps: 4,
      ...(mode === 'txt2img' ? {} : { denoisingStrength: strength }),
    },
    model: {
      managedPath: fixture.illustriousEpsilon.installed.managedPath,
      reference: resource(fixture, 'illustriousEpsilon'),
    },
    loraStack: [{ enabled: true, resource: lora, weight: -0.5 }],
    loras: [
      {
        byteSize: fixture.illustriousLora.byteSize,
        managedPath: fixture.illustriousLora.installed.managedPath,
        reference: lora,
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
  }
  if (mode === 'outpaint') {
    const alpha = Buffer.alloc(65536)
    for (let y = 0; y < 256; y++) alpha.fill(255, y * 256, y * 256 + 192)
    context.conditioning = {
      schemaVersion: 1,
      kind: 'alpha-outpaint-conditioning',
      bbox,
      infillResource: {
        byteSize: 205669692,
        role: 'outpaint-infill',
        sha256: '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9',
      },
      policy: {
        edgeRadius: 16,
        fadeDistance: 16,
        infillMethod: 'lama',
        maskBlur: 'gaussian-weighted-max',
        minimumDenoise: 0,
        outputMode: 'contribution',
        version: 1,
      },
      sourceTarget: {
        byteSize: target.byteSize,
        format: 'png',
        height: 256,
        width: 256,
        iccSha256: icc,
        sha256: target.sha256,
      },
      keepMask: {
        byteSize: 65536,
        format: 'alpha8',
        height: 256,
        width: 256,
        polarity: 'keep',
        sha256: createHash('sha256').update(alpha).digest('hex'),
      },
    }
  }
  return {
    schemaVersion: 1,
    originRequestId: randomUUID(),
    kind: `illustrious-${mode}`,
    context,
    workerJob: {
      schemaVersion: 1,
      bbox,
      checkpoint: {
        path: fixture.illustriousEpsilon.installed.managedPath,
        predictionType: 'epsilon',
        sha256: fixture.illustriousEpsilon.sha256,
      },
      prompts: { ...prompts },
      sampling: {
        cfgRescale: 0,
        cfgScale: 4,
        noiseProfile: { ...noise },
        scheduler: invokeScheduler,
        seed: 0,
        steps: 4,
        ...(mode === 'txt2img' ? {} : { denoisingStrength: strength }),
      },
      loras: [{ ...file(fixture, 'illustriousLora'), weight: -0.5 }],
      vae: file(fixture, 'externalVaeNative'),
      vaePrecision: 'FP32',
      target: {
        byteSize: target.byteSize,
        height: 256,
        width: 256,
        iccSha256: icc,
        sha256: target.sha256,
      },
    },
  }
}
function configuration(pair, mode, fixture, caseName = 'history') {
  const [, schedule, sampler, invokeScheduler, , , , neighborStrength] = pair
  return {
    cfgRescale: 0,
    mode,
    model: resource(fixture, 'illustriousEpsilon'),
    loras: [{ enabled: true, resource: resource(fixture, 'illustriousLora'), weight: -0.5 }],
    positivePrompt: { embeddingRefs: [], text: prompts.positive },
    negativePrompt: { embeddingRefs: [], text: prompts.negative },
    sampling: {
      actualSeed: 0,
      cfgScale: 4,
      invokeScheduler,
      noiseProfile: { ...noise },
      requestedSeedPolicy: 'fixed',
      sampler,
      scheduler: schedule,
      seedBehavior: 'per-iteration',
      steps: 4,
      ...(mode === 'txt2img'
        ? {}
        : { denoisingStrength: caseName === 'neighbor' ? neighborStrength : 0.75 }),
    },
    size: { height: 256, width: 256 },
    vae: resource(fixture, 'externalVaeNative'),
    vaePrecision: 'FP32',
  }
}

test('four-pair registry and finite literal plans distinguish authored steps, raw progress and native keys', () => {
  assert.equal(illustriousDpmPairs.length, 4)
  assert.equal(Object.isFrozen(illustriousDpmPairs), true)
  for (const pair of pairs) {
    const [
      algorithm,
      schedule,
      sampler,
      invokeScheduler,
      txtProgress,
      historyProgress,
      neighborProgress,
      neighborStrength,
    ] = pair
    assert.deepEqual(illustriousDpmPair(algorithm, schedule), {
      algorithm,
      schedule,
      sampler,
      invokeScheduler,
      steps: 4,
      txtObservedSteps: txtProgress,
      historyObservedSteps: historyProgress,
      neighborObservedSteps: neighborProgress,
    })
    for (const mode of modes) {
      const plan = literalIllustriousDpmPlan('baseline', algorithm, schedule, mode, 'history')
      assert.equal(plan.observedSteps, mode === 'txt2img' ? txtProgress : historyProgress)
      assert.equal(plan.steps, 4)
      assert.equal(plan.expectedAdmissions, 1)
      assert.equal(plan.expectedCompletions, 1)
      assert.equal(plan.items[0].seed, 0)
      assert.equal(plan.items[0].objective, 'epsilon')
      assert.equal(Object.hasOwn(plan.items[0], 'denoisingStrength'), mode !== 'txt2img')
      if (mode !== 'txt2img') assert.equal(plan.items[0].denoisingStrength, 0.75)
      assert.equal(Object.isFrozen(plan.items[0].prompts), true)
      assert.equal(Object.hasOwn(plan.items[0], 'compiledPrompts'), false)
    }
    const neighbor = literalIllustriousDpmPlan(
      'control',
      algorithm,
      schedule,
      'img2img',
      'neighbor',
    )
    assert.equal(neighbor.observedSteps, neighborProgress)
    assert.equal(neighbor.denoisingStrength, neighborStrength)
  }
  for (const args of [
    ['baseline', 'euler', 'Normal', 'img2img', 'history'],
    ['baseline', 'dpmpp_2m', 'normal', 'img2img', 'history'],
    ['baseline', 'dpmpp_sde', 'Karras', 'inpaint', 'history'],
    ['baseline', 'dpmpp_2m', 'Normal', 'txt2img', 'neighbor'],
    ['baseline', 'dpmpp_sde', 'Normal', 'outpaint', 'neighbor'],
    ['restored', 'dpmpp_sde', 'Normal', 'img2img', 'neighbor'],
    ['baseline', 'dpmpp_2m', 'Normal', 'img2img', 'unknown'],
  ])
    assert.throws(() => literalIllustriousDpmPlan(...args))
})

test('strict wrapper validates modes/stages and refuses unknown fields, overlaps, weak sources and undeclared mutations', () => {
  for (const [algorithm, schedule] of pairs)
    for (const mode of modes)
      for (const stage of ['baseline', 'control', 'restored']) {
        const fixture = wrapper(stage, mode, algorithm, schedule)
        assert.deepEqual(
          validateIllustriousDpmFixture(fixture),
          literalIllustriousDpmPlan(stage, algorithm, schedule, mode, 'history'),
        )
      }
  for (const mutate of [
    (value) => {
      value.extra = true
    },
    (value) => {
      value.objective = 'v_prediction'
    },
    (value) => {
      value.sourceImage.extra = true
    },
    (value) => {
      value.sourceImage.byteSize = 0
    },
    (value) => {
      value.sourceImage.pixelSha256 = 'unknown'
    },
    (value) => {
      value.sourceImage.path = value.artifacts + '/input.png'
    },
    (value) => {
      value.artifacts = root
    },
    (value) => {
      value.referenceFixture.path += '/../reference.json'
    },
    (value) => {
      value.referenceFixture.sha256 = '0'
    },
    (value) => {
      value.workerBaseline.path = value.artifacts
    },
    (value) => {
      value.lamaSource.sha256 = 'f'.repeat(64)
    },
    (value) => {
      value.lamaSource.byteSize++
    },
    (value) => {
      value.baseline = { reportPath: path.join(root, 'report.json'), reportSha256: 'd'.repeat(64) }
    },
    (value) => {
      value.mutation = {
        module: 'inference.py',
        originalSha256: 'a'.repeat(64),
        mutatedSha256: 'b'.repeat(64),
      }
    },
  ]) {
    const value = wrapper()
    mutate(value)
    assert.throws(() => validateIllustriousDpmFixture(value))
  }
  for (const mutate of [
    (value) => {
      delete value.baseline
    },
    (value) => {
      delete value.mutation
    },
    (value) => {
      value.mutation.module = 'anima_sampling.py'
    },
    (value) => {
      value.mutation.mutatedSha256 = value.mutation.originalSha256
    },
    (value) => {
      value.baseline.reportPath = value.artifacts + '/report.json'
    },
  ]) {
    const value = wrapper('control')
    mutate(value)
    assert.throws(() => validateIllustriousDpmFixture(value))
  }
  const txt = wrapper('baseline', 'txt2img')
  txt.sourceImage = wrapper().sourceImage
  assert.throws(() => validateIllustriousDpmFixture(txt))
  const img = wrapper('baseline', 'img2img')
  img.lamaSource = wrapper().lamaSource
  assert.throws(() => validateIllustriousDpmFixture(img))
})

for (const pair of pairs)
  for (const mode of modes)
    test(`${pair[3]} ${mode}: complete native and portable oracles reject silent semantic corruption`, () => {
      const fixture = installedFixture()
      const item = literalIllustriousDpmPlan('baseline', pair[0], pair[1], mode, 'history').items[0]
      const frozen = captured(pair, mode, fixture)
      const config = configuration(pair, mode, fixture)
      assertIllustriousDpmFrozen(frozen, item, fixture)
      assertIllustriousDpmConfiguration(config, item, fixture)
      for (const mutate of [
        (value) => {
          value.context.sampling.seed = 37
        },
        (value) => {
          value.workerJob.sampling.seed = 37
        },
        (value) => {
          value.workerJob.sampling.scheduler = 'euler_a'
        },
        (value) => {
          value.context.sampling.scheduler = pair[1] === 'Normal' ? 'Karras' : 'Normal'
        },
        (value) => {
          value.context.sampling.noiseProfile.rescaleBetasZeroSnr = true
        },
        (value) => {
          value.workerJob.sampling.noiseProfile.timestepSpacing = 'trailing'
        },
        (value) => {
          value.workerJob.checkpoint.predictionType = 'v_prediction'
        },
        (value) => {
          value.context.model.reference.fileSha256 = 'a'.repeat(64)
        },
        (value) => {
          value.workerJob.loras[0].weight = 0.5
        },
        (value) => {
          value.workerJob.vae.sha256 = 'a'.repeat(64)
        },
        (value) => {
          value.context.vaePrecision = 'FP16'
        },
        (value) => {
          value.context.prompts.negative = '(blurry:1), low quality'
        },
        (value) => {
          value.context.bbox.x++
        },
        (value) => {
          value.context.target.iccSha256 = '0'.repeat(64)
        },
        (value) => {
          value.workerJob.embeddings = { positive: [], negative: [] }
        },
        (value) => {
          value.workerJob.sampling.denoisingStrength = mode === 'txt2img' ? 0.75 : 0.5
        },
      ]) {
        const changed = structuredClone(frozen)
        mutate(changed)
        assert.throws(() => assertIllustriousDpmFrozen(changed, item, fixture))
      }
      for (const mutate of [
        (value) => {
          value.sampling.actualSeed = 37
        },
        (value) => {
          value.sampling.invokeScheduler = 'euler_a'
        },
        (value) => {
          value.sampling.noiseProfile.rescaleBetasZeroSnr = true
        },
        (value) => {
          value.model.predictionType = 'v_prediction'
        },
        (value) => {
          value.mode = mode === 'txt2img' ? 'img2img' : 'txt2img'
        },
        (value) => {
          value.loras[0].weight = 0.5
        },
        (value) => {
          value.vaePrecision = 'Auto'
        },
        (value) => {
          value.sampling.denoisingStrength = mode === 'txt2img' ? 0.75 : 0.5
        },
        (value) => {
          value.managedPath = fixture.illustriousEpsilon.installed.managedPath
        },
      ]) {
        const changed = structuredClone(config)
        mutate(changed)
        assert.throws(() => assertIllustriousDpmConfiguration(changed, item, fixture))
      }
      const alteredSource = structuredClone(fixture)
      alteredSource.illustriousEpsilon.trainedObjective = 'v_prediction'
      assert.throws(() => assertIllustriousDpmFrozen(frozen, item, alteredSource))
      for (const key of ['seed', 'steps', 'iteration', 'promptPairIndex']) {
        const expected = structuredClone(item)
        expected[key]++
        assert.throws(() => assertIllustriousDpmFrozen(frozen, expected, fixture))
      }
      if (mode === 'outpaint')
        for (const mutate of [
          (value) => {
            value.context.conditioning.policy.minimumDenoise = 1
          },
          (value) => {
            value.context.conditioning.keepMask.polarity = 'generate'
          },
          (value) => {
            value.context.conditioning.keepMask.sha256 = 'a'.repeat(64)
          },
          (value) => {
            value.context.conditioning.infillResource.sha256 = 'a'.repeat(64)
          },
          (value) => {
            value.context.conditioning.sourceTarget.sha256 = 'a'.repeat(64)
          },
          (value) => {
            value.context.conditioning.bbox.x = 0
          },
        ]) {
          const changed = structuredClone(frozen)
          mutate(changed)
          assert.throws(() => assertIllustriousDpmFrozen(changed, item, fixture))
        }
    })

test('neighbors retain exact strengths and normalization removes only portable document identities', () => {
  const fixture = installedFixture()
  for (const pair of pairs) {
    const item = literalIllustriousDpmPlan('baseline', pair[0], pair[1], 'img2img', 'neighbor')
      .items[0]
    const frozen = captured(pair, 'img2img', fixture, 'neighbor')
    assertIllustriousDpmFrozen(frozen, item, fixture)
    assertIllustriousDpmConfiguration(
      configuration(pair, 'img2img', fixture, 'neighbor'),
      item,
      fixture,
    )
    const original = structuredClone(frozen)
    const normalized = normalizeIllustriousDpmNativeInputs(frozen)
    assert.deepEqual(frozen, original)
    assert.equal(Object.hasOwn(normalized.context, 'documentId'), false)
    assert.equal(Object.hasOwn(normalized.context, 'documentRevision'), false)
    const replay = structuredClone(frozen)
    replay.context.documentId = randomUUID()
    replay.context.documentRevision = randomUUID()
    assert.deepEqual(normalizeIllustriousDpmNativeInputs(replay), normalized)
    for (const mutate of [
      (value) => {
        value.context.sampling.seed = 37
      },
      (value) => {
        value.workerJob.vae.sha256 = 'a'.repeat(64)
      },
      (value) => {
        value.context.sampling.denoisingStrength = 0.75
      },
      (value) => {
        value.context.target.sha256 = 'b'.repeat(64)
      },
    ]) {
      const changed = structuredClone(frozen)
      mutate(changed)
      assert.notDeepEqual(normalizeIllustriousDpmNativeInputs(changed), normalized)
    }
  }
})

test('shared pixel helpers preserve exact independent OUT geometry and alpha; IMG Save compares full RGBA', () => {
  const source = { width: 256, height: 256, rgba: Buffer.alloc(256 * 256 * 4, 255) }
  const target = { width: 256, height: 256, rgba: Buffer.alloc(256 * 256 * 4) }
  for (let y = 0; y < 256; y++)
    source.rgba.copy(target.rgba, y * 256 * 4, (y * 256 + 64) * 4, (y + 1) * 256 * 4)
  assert.deepEqual(assertIllustriousDpmImageTargetPixels({ source, target, mode: 'outpaint' }), {
    opaquePixels: 49152,
    transparentPixels: 16384,
    sourceShift: 64,
  })
  const targetAlpha = literalIllustriousDpmTargetAlpha()
  assert.equal(targetAlpha[191], 255)
  assert.equal(targetAlpha[192], 0)
  const alpha = literalIllustriousDpmContributionAlpha()
  assert.deepEqual(
    [...alpha.subarray(152, 169)],
    [0, 5, 12, 23, 36, 52, 70, 89, 109, 130, 151, 172, 193, 212, 230, 247, 255],
  )
  const out = { width: 256, height: 256, rgba: Buffer.from(source.rgba) }
  for (let index = 0; index < alpha.length; index++) out.rgba[index * 4 + 3] = alpha[index]
  assertIllustriousDpmImageOutputPixels({ image: out, mode: 'outpaint' })
  out.rgba[200 * 4 + 3] = 0
  assert.throws(() => assertIllustriousDpmImageOutputPixels({ image: out, mode: 'outpaint' }))
  const contribution = { width: 256, height: 256, rgba: Buffer.from(source.rgba) }
  contribution.rgba[0] = 10
  assertIllustriousDpmImageSavedPixels({
    source,
    contribution,
    preview: contribution,
    mode: 'img2img',
  })
  assert.throws(() =>
    assertIllustriousDpmImageSavedPixels({
      source,
      contribution,
      preview: source,
      mode: 'img2img',
    }),
  )
})

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

/** Only exact resource verification is doubled; batch/request/frozen/portable producers are real. */
function producerModels(fixture) {
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
      assert.deepEqual(positivePrompt, { embeddingRefs: [], text: prompts.positive })
      assert.deepEqual(negativePrompt, { embeddingRefs: [], text: prompts.negative })
    },
    resolveVerifiedGenerationCheckpointForPlan: async (reference) => {
      assert.deepEqual(reference, resource(fixture, 'illustriousEpsilon'))
      return {
        managedPath: fixture.illustriousEpsilon.installed.managedPath,
        reference: resource(fixture, 'illustriousEpsilon'),
        noiseProfile: { ...noise },
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
      assert.fail('The literal campaign has no embedding resources.'),
    // The queue's shared qualification object binds these methods even for Illustrious jobs.
    resolveVerifiedGenerationAnimaBundleForPlan: async () =>
      assert.fail('An Illustrious producer cannot resolve an Anima bundle.'),
    resolveVerifiedAnimaGenerationLoraForPlan: async () =>
      assert.fail('An Illustrious producer cannot resolve an Anima LoRA.'),
  }
}

async function assertProductionIllustriousDpm(pair, mode, caseName) {
  const fixture = installedFixture()
  const [, , sampler, , , , , neighborStrength] = pair
  const document = createEmptyProjectDocumentV1({
    title: 'Illustrious DPM production boundary',
  })
  document.primaryBbox = { x: mode === 'outpaint' ? 64 : 0, y: 0, width: 256, height: 256 }
  const draft = document.generationDraft
  draft.model = resource(fixture, 'illustriousEpsilon')
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
    sampler,
    scheduler: pair[1],
    denoisingStrength:
      mode === 'txt2img' ? null : caseName === 'neighbor' ? neighborStrength : 0.75,
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
  const models = producerModels(fixture)
  const prepared = await (
    mode === 'outpaint' ? prepareNormalOutpaintGeneration : prepareNormalGeneration
  )({
    target,
    modelService: models,
    randomUint32: () => assert.fail('Fixed 0 cannot pick Random.'),
  })

  // All semantic expectations predate admission. Only the producer's opaque random request ID
  // and disposable lease directory are substituted below; no semantic output feeds this oracle.
  const expected = captured(pair, mode, fixture, caseName)
  expected.context.documentId = document.documentId
  expected.context.documentRevision = document.documentRevision
  Object.assign(expected.context.target, {
    byteSize: targetBytes.length,
    sha256: digest(targetBytes),
  })
  Object.assign(expected.workerJob.target, {
    byteSize: targetBytes.length,
    sha256: digest(targetBytes),
  })
  if (mode === 'outpaint')
    Object.assign(expected.context.conditioning.sourceTarget, {
      byteSize: targetBytes.length,
      sha256: digest(targetBytes),
    })
  const expectedPrepared = structuredClone(expected.context)
  delete expectedPrepared.sampling.seedBehavior
  assert.deepEqual(prepared.context, expectedPrepared)
  assert.deepEqual(prepared.targetPngBytes, targetBytes)

  const temporary = await mkdtemp(path.join(tmpdir(), 'igs-illustrious-dpm-producer-'))
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
    const requests = []
    const realNormalAdmission = queue.enqueueIllustriousGenerationBatch.bind(queue)
    queue.enqueueIllustriousGenerationBatch = async (input) => {
      requests.push(...input.items.map((item) => structuredClone(item.request)))
      return await realNormalAdmission(input)
    }
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
    assert.deepEqual(admitted.plan.items[0].prompts, prompts)
    assert.equal(admitted.plan.items[0].seed, 0)
    assert.equal(capacityPreflights.length, 1)
    const [queued] = admitted.items
    assert.equal(queued.status, 'pending')
    const verified = await queue.loadVerifiedInput(queued.id)
    const frozen = verified.payload
    assert.match(frozen.originRequestId, /^[a-f0-9-]{36}$/i)
    expected.originRequestId = frozen.originRequestId
    assert.deepEqual(frozen, expected)
    assert.deepEqual(await readFile(verified.targetPath), targetBytes)
    assert.equal(capacityPreflights[0][0].queueItemId, queued.id)
    assert.deepEqual(JSON.parse(capacityPreflights[0][0].frozenPayloadJson), expected)

    let request
    if (mode === 'outpaint') {
      assert.equal(requests.length, 0)
      const provisionalRoot = path.join(scratch, 'outpaint-request')
      request = buildQueuedOutpaintWorkerRequest({
        infill,
        outputPath: path.join(provisionalRoot, 'result.png'),
        payload: frozen,
        provisionalRoot,
        ready: producerReady,
        requestId: randomUUID(),
        targetPath: path.join(provisionalRoot, 'target.png'),
      })
    } else {
      assert.equal(requests.length, 1)
      request = requests[0]
      assert.equal(request.requestId, frozen.originRequestId)
    }
    const lease = request.job.output.stagingRoot
    assert.equal(path.dirname(lease), scratch)
    assert.deepEqual(request, {
      protocolVersion: '1',
      requestId: request.requestId,
      type: `generate-illustrious-${mode}`,
      job: {
        ...expected.workerJob,
        ...(mode === 'outpaint'
          ? {
              conditioning: expected.context.conditioning,
              infillResource: {
                byteSize: 205669692,
                role: 'outpaint-infill',
                sha256: '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9',
                path: infill.managedPath,
              },
            }
          : {}),
        output: { pngPath: path.join(lease, 'result.png'), stagingRoot: lease },
        target: { ...expected.workerJob.target, path: path.join(lease, 'target.png') },
      },
    })
    const output =
      mode === 'outpaint'
        ? await outpaintPngFromAlpha(producerAlpha(true), 256, 256)
        : await acceptedOutputPngFixture(256, 256)
    const frozenPayloadJson = JSON.stringify(frozen)
    const candidate = {
      actualSeed: 0,
      assetPath: path.join(temporary, 'candidate.png'),
      bbox: { ...document.primaryBbox },
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
    }
    const provenance = provenanceFromVerifiedRasterCandidate({
      candidate,
      imagePngBytes: output,
      acceptedAt: '2026-10-10T12:01:00.000Z',
    })
    assert.deepEqual(
      provenance.generationConfiguration,
      configuration(pair, mode, fixture, caseName),
    )
    assert.equal(provenance.kind, `illustrious-${mode}`)
    assert.deepEqual(provenance.layerSourceContext.bbox, document.primaryBbox)
    assert.equal(provenance.layerSourceContext.sourceTargetSha256, digest(targetBytes))
    assert.equal(provenance.executionResultContext.queueItemId, queued.id)
    assert.equal(provenance.executionResultContext.output.sha256, digest(output))
    if (mode === 'outpaint') {
      assert.deepEqual(provenance.layerSourceContext.outpaint, {
        infillResource: expected.context.conditioning.infillResource,
        keepMask: expected.context.conditioning.keepMask,
        policy: expected.context.conditioning.policy,
        sourceTarget: expected.context.conditioning.sourceTarget,
      })
      assert.equal(provenance.executionResultContext.output.outputMode, 'contribution')
      assert.deepEqual(provenance.executionResultContext.output.contributionAlpha8, {
        byteSize: 65536,
        format: 'alpha8',
        width: 256,
        height: 256,
        sha256: digest(producerAlpha(true)),
      })
    }
    // Campaign stages repeat these exact semantic inputs. Numerical mutation sensitivity is
    // supplied by the installed campaign, not inferred from this request/provenance test.
    for (const stage of caseName === 'neighbor'
      ? ['baseline', 'control']
      : ['baseline', 'control', 'restored']) {
      const [item] = literalIllustriousDpmPlan(stage, pair[0], pair[1], mode, caseName).items
      assertIllustriousDpmFrozen(frozen, item, fixture)
      assertIllustriousDpmConfiguration(provenance.generationConfiguration, item, fixture)
    }
  } finally {
    try {
      await database?.close()
    } finally {
      await rm(temporary, { force: true, recursive: true })
    }
  }
}

for (const pair of pairs)
  for (const [caseName, mode] of [
    ['history', 'txt2img'],
    ['neighbor', 'img2img'],
    ['history', 'img2img'],
    ['history', 'outpaint'],
  ])
    test(`${pair[2]}/${pair[1]} ${caseName}/${mode}: actual preparation, batch, wire, durable frozen and provenance preserve independent literals`, async () => {
      await assertProductionIllustriousDpm(pair, mode, caseName)
    })
