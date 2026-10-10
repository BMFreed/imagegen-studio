/** Real TS preparation/request/provenance versus external literals; no installed ML evidence. */
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
  ANIMA_IMAGE_METHODS_REGISTRY,
  animaImageMethodDefinition,
  assertAnimaImageMethodsConfiguration,
  assertAnimaImageMethodsFrozen,
  assertAnimaImageMethodsOutputPixels,
  assertAnimaImageMethodsSavedPixels,
  assertAnimaImageMethodsTargetPixels,
  literalAnimaImageMethodsContributionAlpha,
  literalAnimaImageMethodsNativePlan,
  literalAnimaImageMethodsPlan,
  literalAnimaImageMethodsTargetAlpha,
  normalizeAnimaImageMethodsNativeInputs,
  validateAnimaImageMethodsFixture,
} from './anima-image-methods-qualification.mjs'
import * as common from './anima-heun-image-qualification.mjs'

const root = path.join(homedir(), '.codex/artifacts/imagegen-studio/runs/image-methods-mechanics')
const digest = (value) => createHash('sha256').update(value).digest('hex')
const red = 'a (red:1.3) ceramic cup on a wooden table, studio photograph'
const blurry = '(blurry:0.7), low quality'
const methods = ['dpmpp_2m_sde', 'er_sde', 'lcm']
const cases = [
  ['neighbor', 'img2img'],
  ['history', 'img2img'],
  ['history', 'outpaint'],
]

// Independent expected authored-N clips, written outside the qualification registry. These
// literals are never populated by either a production compiler or the exported oracle object.
const externalClips = {
  dpmpp_2m_sde: {
    neighbor: {
      beginIndex: 2,
      initialSigma: 0.7496247887611389,
      sigmas: [0.7496247887611389, 0.4996665418148041, 0],
      startStep: 2,
      steps: 4,
      strength: 0.5,
      timesteps: [749, 499],
      totalSteps: 2,
    },
    history: {
      beginIndex: 1,
      initialSigma: 0.8996397852897644,
      sigmas: [0.8996397852897644, 0.7496247887611389, 0.4996665418148041, 0],
      startStep: 1,
      steps: 4,
      strength: 0.75,
      timesteps: [899, 749, 499],
      totalSteps: 3,
    },
  },
  er_sde: {
    neighbor: {
      beginIndex: 2,
      initialSigma: 0.8181818127632141,
      sigmas: [0.8181818127632141, 0.6666666865348816, 0.4285714328289032, 0],
      startStep: 2,
      steps: 5,
      strength: 0.5,
      timesteps: [818.1818237304688, 666.6666870117188, 428.5714416503906],
      totalSteps: 3,
    },
    history: {
      beginIndex: 1,
      initialSigma: 0.9230769276618958,
      sigmas: [0.9230769276618958, 0.8181818127632141, 0.6666666865348816, 0.4285714328289032, 0],
      startStep: 1,
      steps: 5,
      strength: 0.75,
      timesteps: [923.076904296875, 818.1818237304688, 666.6666870117188, 428.5714416503906],
      totalSteps: 4,
    },
  },
  lcm: {
    neighbor: {
      beginIndex: 2,
      initialSigma: 0.75,
      sigmas: [0.75, 0.5, 0],
      startStep: 2,
      steps: 4,
      strength: 0.5,
      timesteps: [750, 500],
      totalSteps: 2,
    },
    history: {
      beginIndex: 1,
      initialSigma: 0.8999999761581421,
      sigmas: [0.8999999761581421, 0.75, 0.5, 0],
      startStep: 1,
      steps: 4,
      strength: 0.75,
      timesteps: [900, 750, 500],
      totalSteps: 3,
    },
  },
}
function externalNative(method, caseName) {
  return {
    ...structuredClone(externalClips[method][caseName]),
    guidanceScale: 4,
    height: 256,
    mode: 'img2img',
    posteriorSeed: 2654435769,
    scheduler: method,
    seed: 0,
    stepSeed: 0,
    version: 'anima-flow-denoising-v1',
    width: 256,
  }
}

function wrapper(stage = 'baseline', method = 'er_sde', mode = 'outpaint', caseName = 'history') {
  return {
    schemaVersion: 1,
    profile: 'anima-image-methods',
    stage,
    method,
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
    artifacts: path.join(root, `output-${stage}-${method}-${mode}-${caseName}`),
    ...(stage === 'baseline'
      ? {}
      : {
          baseline: {
            reportPath: path.join(root, `baseline-${method}-${mode}-${caseName}/report.json`),
            reportSha256: 'c'.repeat(64),
          },
        }),
    ...(stage === 'control'
      ? {
          mutation: {
            module: method === 'er_sde' ? 'vendor/er_sde_scheduler.py' : 'anima_sampling.py',
            originalSha256: 'd'.repeat(64),
            mutatedSha256: 'e'.repeat(64),
          },
        }
      : {}),
  }
}

/** Controlled descriptors do not qualify actual original files, installation or trained models. */
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
function selectedReference(fixture, key) {
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
    reference: selectedReference(fixture, key),
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

/** Real production producers; controlled resolver replies and PNGs, no storage/ML substitution. */
async function productionRecords(method, mode, caseName, fixture = installedFixture()) {
  const expected = externalNative(method, caseName)
  const document = createEmptyProjectDocumentV1({
    title: 'Three Anima image methods',
    primaryBbox: { x: mode === 'outpaint' ? 64 : 0, y: 0, width: 256, height: 256 },
  })
  const draft = document.generationDraft
  draft.model = selectedReference(fixture, 'anima')
  draft.loras = [{ enabled: true, resource: selectedReference(fixture, 'animaLora'), weight: -0.5 }]
  draft.positivePrompt.text = red
  draft.negativePrompt.text = blurry
  draft.seed = { policy: 'fixed', value: 0 }
  draft.dynamicPrompt = { maxPrompts: 1, seedBehavior: 'per-iteration' }
  draft.sampling = {
    steps: expected.steps,
    cfgScale: 4,
    denoisingStrength: expected.strength,
    sampler: 'Euler',
    scheduler: 'Normal',
    animaMethod: method,
  }
  draft.cfgRescale = 0
  draft.vaePrecision = 'Auto'
  const bytes =
    mode === 'outpaint'
      ? await outpaintPngFromAlpha(literalAnimaImageMethodsTargetAlpha(), 256, 256)
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
  const stagingRoot = path.join(tmpdir(), `igs-image-methods-dto-${randomUUID()}`)
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
          scheduler: method,
          seed: 0,
          steps: expected.steps,
          strength: expected.strength,
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
      ? await outpaintPngFromAlpha(literalAnimaImageMethodsContributionAlpha(), 256, 256)
      : await acceptedOutputPngFixture(256, 256)
  const projectPath = path.join(tmpdir(), 'image-methods-oracle.igs')
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

for (const method of methods)
  for (const [caseName, mode] of cases) {
    test(`${method}/${caseName}/${mode}: real TS producers match external full native literals`, async () => {
      // Boundary: actual preparation/request/frozen parser/portable projection.
      // Invariant: full authored grid clips, seed domains and signed/weighted inputs survive.
      // Neighbor: same method/full grid with only strength changed; mutations below alter slots.
      const plan = validateAnimaImageMethodsFixture(wrapper('baseline', method, mode, caseName))
      const { frozen, configuration, fixture } = await productionRecords(method, mode, caseName)
      const original = structuredClone({ frozen, configuration })
      assert.deepEqual(frozen.workerJob.sampling, externalNative(method, caseName))
      assert.deepEqual(
        literalAnimaImageMethodsNativePlan(method, caseName),
        externalNative(method, caseName),
      )
      assert.equal(plan.expectedAdmissions, 1)
      assert.equal(plan.expectedCompletions, 1)
      assert.equal(plan.observedSteps, externalClips[method][caseName].totalSteps)
      assertAnimaImageMethodsFrozen(frozen, plan.items[0], fixture)
      assertAnimaImageMethodsConfiguration(configuration, plan.items[0], fixture)
      assert.deepEqual({ frozen, configuration }, original)
      assert.equal(Object.isFrozen(plan.items[0].compiledPrompts.positive.spans), true)
    })

    test(`${method}/${caseName}/${mode}: every changed native slot refuses before common projection`, async () => {
      const { frozen, configuration, fixture } = await productionRecords(method, mode, caseName)
      const expected = literalAnimaImageMethodsPlan('baseline', method, mode, caseName).items[0]
      for (const field of Object.keys(externalNative(method, caseName))) {
        const changed = structuredClone(frozen)
        delete changed.workerJob.sampling[field]
        assert.throws(() => assertAnimaImageMethodsFrozen(changed, expected, fixture))
      }
      for (const field of Object.keys(frozen.context.sampling)) {
        const changed = structuredClone(frozen)
        delete changed.context.sampling[field]
        assert.throws(() => assertAnimaImageMethodsFrozen(changed, expected, fixture))
      }
      for (const edit of [
        (value) => {
          value.workerJob.sampling.extra = true
        },
        (value) => {
          value.workerJob.sampling.scheduler = 'heun'
        },
        (value) => {
          value.workerJob.sampling.steps = 3
        },
        (value) => {
          value.workerJob.sampling.strength = 1
        },
        (value) => {
          value.workerJob.sampling.beginIndex = 0
        },
        (value) => {
          value.workerJob.sampling.startStep = 0
        },
        (value) => {
          value.workerJob.sampling.initialSigma = 1
        },
        (value) => {
          value.workerJob.sampling.sigmas[0] = 1
        },
        (value) => {
          value.workerJob.sampling.timesteps[0] = 1000
        },
        (value) => {
          value.workerJob.sampling.totalSteps = 1
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
          value.context.sampling.denoisingStrength = 1
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
        assert.throws(() => assertAnimaImageMethodsFrozen(changed, expected, fixture))
      }
      for (const field of Object.keys(configuration.sampling)) {
        const changed = structuredClone(configuration)
        delete changed.sampling[field]
        assert.throws(() => assertAnimaImageMethodsConfiguration(changed, expected, fixture))
      }
      for (const edit of [
        (value) => {
          value.sampling.denoisingStrength = 1
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
        assert.throws(() => assertAnimaImageMethodsConfiguration(changed, expected, fixture))
      }
    })
  }

test('normalizer preserves all native/resource/conditioning axes and omits only document identity', async () => {
  const fixture = installedFixture(),
    normalizedCases = []
  for (const method of methods)
    for (const [caseName, mode] of cases) {
      const { frozen } = await productionRecords(method, mode, caseName, fixture)
      const original = structuredClone(frozen),
        replay = structuredClone(frozen)
      replay.context.documentId = randomUUID()
      replay.context.documentRevision = randomUUID()
      const normalized = normalizeAnimaImageMethodsNativeInputs(frozen)
      assert.deepEqual(normalized, normalizeAnimaImageMethodsNativeInputs(replay))
      const expected = structuredClone({
        kind: original.kind,
        context: original.context,
        workerJob: original.workerJob,
      })
      delete expected.context.documentId
      delete expected.context.documentRevision
      assert.deepEqual(normalized, expected)
      assert.deepEqual(frozen, original)
      normalizedCases.push(normalized)
      for (const edit of [
        (value) => {
          value.context.model.vae.sha256 = 'a'.repeat(64)
        },
        (value) => {
          value.workerJob.loras[0].weight = 0.5
        },
        (value) => {
          value.workerJob.prompts.positive.spans[1].weight = 1
        },
        (value) => {
          value.workerJob.target.sha256 = 'a'.repeat(64)
        },
        ...(mode === 'outpaint'
          ? [
              (value) => {
                value.context.conditioning.policy.fadeDistance = 8
              },
            ]
          : []),
      ]) {
        const changed = structuredClone(frozen)
        edit(changed)
        assert.notDeepEqual(normalizeAnimaImageMethodsNativeInputs(changed), normalized)
      }
      const dropped = structuredClone(frozen)
      delete dropped.context.sampling.denoisingStrength
      assert.throws(() => normalizeAnimaImageMethodsNativeInputs(dropped))
      const extra = structuredClone(frozen)
      extra.workerJob.sampling.extra = true
      assert.throws(() => normalizeAnimaImageMethodsNativeInputs(extra))
    }
  assert.equal(new Set(normalizedCases.map((value) => JSON.stringify(value))).size, 9)
})

test('strict envelope admits exactly the declared 24 cases and method-specific source modules', () => {
  let admitted = 0
  for (const method of methods)
    for (const stage of ['baseline', 'control', 'restored'])
      for (const mode of ['img2img', 'outpaint'])
        for (const caseName of ['neighbor', 'history']) {
          const valid = caseName === 'history' || (mode === 'img2img' && stage !== 'restored')
          const input = wrapper(stage, method, mode, caseName)
          if (valid) {
            const original = structuredClone(input)
            validateAnimaImageMethodsFixture(input)
            assert.deepEqual(input, original)
            admitted++
          } else assert.throws(() => validateAnimaImageMethodsFixture(input))
        }
  assert.equal(admitted, 24)
  for (const invalid of ['euler', 'heun', 'dpmpp_2m', 'unknown', '__proto__', 'toString', null]) {
    assert.throws(() => animaImageMethodDefinition(invalid))
    const input = wrapper()
    input.method = invalid
    assert.throws(() => validateAnimaImageMethodsFixture(input))
  }
  for (const edit of [
    (value) => {
      delete value.method
    },
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
      value.steps = 5
    },
    (value) => {
      value.sourceImage.extra = true
    },
    (value) => {
      value.lamaSource.byteSize = 1
    },
    (value) => {
      value.artifacts = path.join(homedir(), '.codex/artifacts/imagegen-studio')
    },
    (value) => {
      value.sourceImage.path = '/tmp/source.png'
    },
    (value) => {
      value.referenceFixture.sha256 = 'A'.repeat(64)
    },
    (value) => {
      value.baseline = { reportPath: path.join(root, 'report.json'), reportSha256: 'c'.repeat(64) }
    },
  ]) {
    const input = wrapper()
    edit(input)
    assert.throws(() => validateAnimaImageMethodsFixture(input))
  }
  for (const method of methods)
    for (const edit of [
      (value) => {
        delete value.baseline
      },
      (value) => {
        delete value.mutation
      },
      (value) => {
        value.mutation.module =
          method === 'er_sde' ? 'anima_sampling.py' : 'vendor/er_sde_scheduler.py'
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
      const input = wrapper('control', method)
      edit(input)
      assert.throws(() => validateAnimaImageMethodsFixture(input))
    }
})

test('declarative registry is frozen; method-independent pixel helpers are shared by identity', () => {
  assert.deepEqual(Object.keys(ANIMA_IMAGE_METHODS_REGISTRY), methods)
  assert.equal(Object.isFrozen(ANIMA_IMAGE_METHODS_REGISTRY), true)
  for (const method of methods)
    for (const caseName of ['neighbor', 'history']) {
      const native = literalAnimaImageMethodsNativePlan(method, caseName)
      assert.equal(Object.isFrozen(native), true)
      assert.equal(Object.isFrozen(native.sigmas), true)
      assert.equal(Object.isFrozen(native.timesteps), true)
    }
  assert.equal(assertAnimaImageMethodsTargetPixels, common.assertAnimaHeunImageTargetPixels)
  assert.equal(assertAnimaImageMethodsOutputPixels, common.assertAnimaHeunImageOutputPixels)
  assert.equal(assertAnimaImageMethodsSavedPixels, common.assertAnimaHeunImageSavedPixels)
  assert.equal(literalAnimaImageMethodsTargetAlpha, common.literalAnimaHeunImageTargetAlpha)
  assert.equal(
    literalAnimaImageMethodsContributionAlpha,
    common.literalAnimaHeunImageContributionAlpha,
  )
})
