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
  assertAnimaHeunImageConfiguration,
  assertAnimaHeunImageFrozen,
  assertAnimaHeunImageOutputPixels,
  assertAnimaHeunImageSavedPixels,
  assertAnimaHeunImageTargetPixels,
  literalAnimaHeunImageContributionAlpha,
  literalAnimaHeunImageNativePlan,
  literalAnimaHeunImagePlan,
  literalAnimaHeunImageTargetAlpha,
  normalizeAnimaHeunImageNativeInputs,
  validateAnimaHeunImageFixture,
} from './anima-heun-image-qualification.mjs'

const root = path.join(
  homedir(),
  '.codex/artifacts/imagegen-studio/runs/heun-image-source-mechanics',
)
const digest = (value) => createHash('sha256').update(value).digest('hex')
const red = 'a (red:1.3) ceramic cup on a wooden table, studio photograph'
const blurry = '(blurry:0.7), low quality'
function wrapper(stage = 'baseline', mode = 'outpaint') {
  return {
    schemaVersion: 1,
    profile: 'anima-heun-image',
    stage,
    mode,
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
    artifacts: path.join(root, `output-${stage}-${mode}`),
    ...(stage === 'baseline'
      ? {}
      : {
          baseline: {
            reportPath: path.join(root, `baseline-${mode}/report.json`),
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
async function productionRecords(mode, fixture = installedFixture()) {
  const plan = literalAnimaHeunImagePlan('baseline', mode)
  const document = createEmptyProjectDocumentV1({ title: 'Heun IMG/OUT', primaryBbox: plan.bbox })
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
    denoisingStrength: 0.5,
    sampler: 'Euler',
    scheduler: 'Normal',
    animaMethod: 'heun',
  }
  draft.cfgRescale = 0
  draft.vaePrecision = 'Auto'
  const bytes =
    mode === 'outpaint'
      ? await outpaintPngFromAlpha(literalAnimaHeunImageTargetAlpha(), 256, 256)
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
  const stagingRoot = path.join(tmpdir(), `igs-heun-image-dto-${randomUUID()}`)
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
        sampling: { guidanceScale: 4, scheduler: 'heun', seed: 0, steps: 4, strength: 0.5 },
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
      ? await outpaintPngFromAlpha(literalAnimaHeunImageContributionAlpha(), 256, 256)
      : await acceptedOutputPngFixture(256, 256)
  const projectPath = path.join(tmpdir(), 'heun-image-oracle.igs')
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

for (const mode of ['img2img', 'outpaint']) {
  test(`Heun ${mode}: independent literal case matches actual TS preparation/request/provenance`, async () => {
    // Production boundary: preparation, compiler, frozen parser, portable projector. No GPU/storage.
    // Invariant: authored4 keeps full-N grid, clips at2/4 and publishes3 evaluations.
    // Neighbor: same weighted/signed inputs, opaque IMG versus shifted mixed-alpha OUT.
    const plan = validateAnimaHeunImageFixture(wrapper('baseline', mode))
    const { frozen, configuration, fixture } = await productionRecords(mode)
    assert.equal(plan.expectedAdmissions, 1)
    assert.equal(plan.expectedCompletions, 1)
    assert.equal(plan.expectedCanceled, 0)
    assert.deepEqual(frozen.workerJob.sampling, literalAnimaHeunImageNativePlan())
    assertAnimaHeunImageFrozen(frozen, plan.items[0], fixture)
    assertAnimaHeunImageConfiguration(configuration, plan.items[0], fixture)
    assert.equal(frozen.workerJob.sampling.steps, 4)
    assert.equal(frozen.workerJob.sampling.totalSteps, 3)
    assert.equal(Object.isFrozen(plan.items[0].compiledPrompts.positive.spans), true)
  })
  test(`Heun ${mode}: actual records reject clipped-grid, seed-domain, resource, weight and mode corruption`, async () => {
    const { frozen, configuration, fixture } = await productionRecords(mode)
    const expected = literalAnimaHeunImagePlan('baseline', mode).items[0]
    for (const edit of [
      (value) => {
        value.context.sampling.steps = 3
      },
      (value) => {
        value.context.sampling.denoisingStrength = 1
      },
      (value) => {
        value.workerJob.sampling.scheduler = 'euler'
      },
      (value) => {
        value.workerJob.sampling.beginIndex = 2
      },
      (value) => {
        value.workerJob.sampling.startStep = 1
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
        value.workerJob.sampling.totalSteps = 2
      },
      (value) => {
        value.workerJob.sampling.stepSeed = 1
      },
      (value) => {
        value.workerJob.sampling.posteriorSeed = 0
      },
      (value) => {
        value.context.sampling.seedBehavior = 'per-prompt'
      },
      (value) => {
        value.context.sampling.requestedSeedPolicy = 'random'
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
      (value) => {
        value.kind = 'anima-txt2img'
      },
      ...(mode === 'outpaint'
        ? [
            (value) => {
              delete value.context.conditioning
            },
            (value) => {
              value.context.conditioning.keepMask.sha256 = 'f'.repeat(64)
            },
            (value) => {
              value.context.conditioning.policy.fadeDistance = 8
            },
            (value) => {
              value.context.conditioning.infillResource.sha256 = 'f'.repeat(64)
            },
          ]
        : []),
    ]) {
      const changed = structuredClone(frozen)
      edit(changed)
      assert.throws(() => assertAnimaHeunImageFrozen(changed, expected, fixture))
    }
    for (const edit of [
      (value) => {
        value.sampling.steps = 3
      },
      (value) => {
        value.sampling.denoisingStrength = 1
      },
      (value) => {
        value.sampling.animaMethod = 'euler'
      },
      (value) => {
        value.sampling.actualSeed = 37
      },
      (value) => {
        value.loras[0].weight = 0.5
      },
      (value) => {
        value.anima.vae.sha256 = 'f'.repeat(64)
      },
      (value) => {
        value.positivePrompt.text = 'unweighted red'
      },
      (value) => {
        value.mode = 'txt2img'
      },
    ]) {
      const changed = structuredClone(configuration)
      edit(changed)
      assert.throws(() => assertAnimaHeunImageConfiguration(changed, expected, fixture))
    }
  })
}

test('normalization preserves target/conditioning/full native fields and removes only document identity', async () => {
  const fixture = installedFixture()
  for (const mode of ['img2img', 'outpaint']) {
    const { frozen } = await productionRecords(mode, fixture)
    const original = structuredClone(frozen)
    const replay = structuredClone(frozen)
    replay.context.documentId = randomUUID()
    replay.context.documentRevision = randomUUID()
    assert.deepEqual(
      normalizeAnimaHeunImageNativeInputs(replay),
      normalizeAnimaHeunImageNativeInputs(frozen),
    )
    const normalized = normalizeAnimaHeunImageNativeInputs(frozen)
    assert.deepEqual(normalized.workerJob, original.workerJob)
    assert.deepEqual(normalized.context.target, original.context.target)
    assert.deepEqual(normalized.context.conditioning, original.context.conditioning)
    assert.deepEqual(frozen, original)
    assert.throws(() => normalizeAnimaHeunImageNativeInputs({ ...frozen, kind: 'anima-txt2img' }))
  }
})

test('fixture envelope permits only two image modes and exactly one sampling-file control delta', () => {
  for (const mode of ['img2img', 'outpaint'])
    for (const stage of ['baseline', 'restored', 'control'])
      assert.deepEqual(
        validateAnimaHeunImageFixture(wrapper(stage, mode)),
        literalAnimaHeunImagePlan(stage, mode),
      )
  for (const edit of [
    (value) => {
      value.mode = 'txt2img'
    },
    (value) => {
      value.steps = 4
    },
    (value) => {
      value.profile = 'anima-er-sde'
    },
    (value) => {
      value.stage = 'reuse'
    },
    (value) => {
      value.objective = 'anima'
    },
    (value) => {
      value.schemaVersion = 2
    },
    (value) => {
      value.artifacts = root
    },
    (value) => {
      value.artifacts = '/tmp/out'
    },
    (value) => {
      value.referenceFixture.path = '/tmp/reference.json'
    },
    (value) => {
      value.sourceImage.path = '/tmp/source.png'
    },
    (value) => {
      value.sourceImage.pixelSha256 = 'short'
    },
    (value) => {
      value.sourceImage.byteSize = 0
    },
    (value) => {
      value.sourceImage.extra = true
    },
    (value) => {
      delete value.lamaSource
    },
    (value) => {
      value.lamaSource.sha256 = 'a'.repeat(64)
    },
    (value) => {
      value.lamaSource.byteSize = 1
    },
    (value) => {
      value.lamaSource.path = '/tmp/lama.pt'
    },
    (value) => {
      value.lamaSource.extra = true
    },
    (value) => {
      value.artifacts = value.sourceImage.path
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
    assert.throws(() => validateAnimaHeunImageFixture(value))
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
      value.mutation.module = '../anima_sampling.py'
    },
    (value) => {
      value.mutation.mutatedSha256 = value.mutation.originalSha256
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
    assert.throws(() => validateAnimaHeunImageFixture(value))
  }
  for (const mode of ['', null, 'txt2img', 'inpaint'])
    assert.throws(() => literalAnimaHeunImagePlan('baseline', mode))
  assert.throws(() =>
    validateAnimaHeunImageFixture({
      ...wrapper('restored'),
      mutation: wrapper('control').mutation,
    }),
  )
})

function pixels(width, height, alpha = 255) {
  const rgba = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4
      rgba[index] = x % 256
      rgba[index + 1] = y
      rgba[index + 2] = (x + y) % 256
      rgba[index + 3] = alpha
    }
  return { width, height, rgba }
}
function shiftedTarget(source) {
  const image = pixels(256, 256, 0)
  for (let y = 0; y < 256; y++)
    source.rgba.copy(image.rgba, y * 256 * 4, (y * 256 + 64) * 4, (y * 256 + 256) * 4)
  return image
}
function outputPixels(mode) {
  const image = pixels(256, 256)
  if (mode === 'outpaint') {
    const alpha = literalAnimaHeunImageContributionAlpha()
    for (let index = 0; index < alpha.length; index++) image.rgba[index * 4 + 3] = alpha[index]
  }
  return image
}

test('pixel oracle checks all192 opaque/64 transparent columns and exact source overlap, not only counts', () => {
  const source = pixels(256, 256),
    target = shiftedTarget(source)
  assert.deepEqual(assertAnimaHeunImageTargetPixels({ source, target, mode: 'outpaint' }), {
    opaquePixels: 49152,
    transparentPixels: 16384,
    sourceShift: 64,
  })
  assert.deepEqual(assertAnimaHeunImageTargetPixels({ source, target: source, mode: 'img2img' }), {
    opaquePixels: 65536,
    transparentPixels: 0,
    sourceShift: 0,
  })
  for (const mutate of [
    (value) => {
      value.rgba[0] ^= 1
    },
    (value) => {
      value.rgba[192 * 4 + 3] = 255
    },
    (value) => {
      value.rgba[100 * 4 + 3] = 0
    },
  ]) {
    const changed = structuredClone(target)
    mutate(changed)
    assert.throws(() =>
      assertAnimaHeunImageTargetPixels({ source, target: changed, mode: 'outpaint' }),
    )
  }
})

test('complete output-alpha literal rejects opaque OUT, shifted seam, missing fade and transparent IMG', () => {
  assertAnimaHeunImageOutputPixels({ image: outputPixels('img2img'), mode: 'img2img' })
  assertAnimaHeunImageOutputPixels({ image: outputPixels('outpaint'), mode: 'outpaint' })
  for (const mutate of [
    (value) => {
      for (let index = 3; index < value.rgba.length; index += 4) value.rgba[index] = 255
    },
    (value) => {
      value.rgba[153 * 4 + 3] = 0
    },
    (value) => {
      value.rgba[10 * 4 + 3] = 1
    },
    (value) => {
      value.rgba[200 * 4 + 3] = 0
    },
  ]) {
    const changed = outputPixels('outpaint')
    mutate(changed)
    assert.throws(() => assertAnimaHeunImageOutputPixels({ image: changed, mode: 'outpaint' }))
  }
  assert.throws(() =>
    assertAnimaHeunImageOutputPixels({ image: pixels(256, 256, 0), mode: 'img2img' }),
  )
})

test('saved IMG preview retains the entire generated RGBA result, rejecting a dropped output or RGB corruption', () => {
  const source = pixels(256, 256),
    contribution = outputPixels('img2img')
  // Deliberately different output RGB: replacing it with the old source must be observable.
  for (let index = 0; index < contribution.rgba.length; index += 4)
    contribution.rgba[index] = (contribution.rgba[index] + 17) % 256
  const preview = {
    width: 256,
    height: 256,
    rgba: Buffer.from(contribution.rgba),
  }
  assert.deepEqual(
    assertAnimaHeunImageSavedPixels({ source, contribution, preview, mode: 'img2img' }),
    { width: 256, height: 256, protectedPixels: 0 },
  )
  assert.throws(
    () =>
      assertAnimaHeunImageSavedPixels({ source, contribution, preview: source, mode: 'img2img' }),
    /fully opaque IMG result/,
  )
  const corrupted = structuredClone(preview)
  corrupted.rgba[(100 * 256 + 200) * 4 + 1] ^= 1
  assert.throws(
    () =>
      assertAnimaHeunImageSavedPixels({
        source,
        contribution,
        preview: corrupted,
        mode: 'img2img',
      }),
    /fully opaque IMG result/,
  )
})

test('saved OUT preview protects217 source columns and retains all88 opaque generated columns at world coordinates', () => {
  const source = pixels(256, 256),
    contribution = outputPixels('outpaint'),
    preview = pixels(320, 256)
  for (let y = 0; y < 256; y++)
    source.rgba.copy(preview.rgba, y * 320 * 4, y * 256 * 4, (y + 1) * 256 * 4)
  const droppedOutput = structuredClone(preview)
  // The fully opaque output begins at local x168, so it occupies world x232..319.
  for (let y = 0; y < 256; y++)
    contribution.rgba.copy(
      preview.rgba,
      (y * 320 + 232) * 4,
      (y * 256 + 168) * 4,
      (y + 1) * 256 * 4,
    )
  assert.deepEqual(
    assertAnimaHeunImageSavedPixels({ source, contribution, preview, mode: 'outpaint' }),
    { width: 320, height: 256, protectedPixels: 55552 },
  )
  const changed = structuredClone(preview)
  changed.rgba[(100 * 320 + 216) * 4] ^= 1
  assert.throws(() =>
    assertAnimaHeunImageSavedPixels({ source, contribution, preview: changed, mode: 'outpaint' }),
  )
  assert.throws(
    () =>
      assertAnimaHeunImageSavedPixels({
        source,
        contribution,
        preview: droppedOutput,
        mode: 'outpaint',
      }),
    /fully visible generated OUT pixel/,
  )
  const corruptedExtension = structuredClone(preview)
  corruptedExtension.rgba[(100 * 320 + 300) * 4] ^= 1
  assert.throws(
    () =>
      assertAnimaHeunImageSavedPixels({
        source,
        contribution,
        preview: corruptedExtension,
        mode: 'outpaint',
      }),
    /fully visible generated OUT pixel/,
  )
  assert.throws(() =>
    assertAnimaHeunImageSavedPixels({
      source,
      contribution,
      preview: pixels(256, 256),
      mode: 'outpaint',
    }),
  )
})

test('literal expected case refuses a captured seed/method/mode answer as its own oracle', () => {
  for (const key of ['seed', 'iteration', 'promptPairIndex', 'steps']) {
    const expected = structuredClone(literalAnimaHeunImagePlan('baseline', 'img2img').items[0])
    expected[key]++
    assert.throws(() => assertAnimaHeunImageFrozen({}, expected, installedFixture()))
  }
})
