/** Real strict source/ready/catalog guards and semantic normalization; no ML or source copies. */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  assertAcceptedCheckpointIdentity,
  assertNoiseCatalog,
  assertNoiseExecution,
  assertNoiseImageBasedProgress,
  assertNoiseReady,
  assertNoiseStageOutcome,
  assertNoiseTxt2ImgProgress,
  assertOutpaintLayerPlacement,
  assertOutpaintPreviewPixels,
  assertOutpaintSourcePixels,
  baselineNoiseProfile,
  boundedNoiseCases,
  executionFor,
  noiseRecipeSources,
  noiseRetryPolicyAxes,
  noiseStagePlan,
  noiseStages,
  normalizeNoiseInputs,
  officialEpsilonIdentity,
  validateNoiseProfileFixture,
} from './noobai-noise-qualification.mjs'

const ready = {
  workerVersion: '0.14.0',
  protocolVersion: '1',
  runtimeProfile: 'linux-nvidia',
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
const origin = {
  kind: 'civitai-trained',
  modelId: 1147756,
  versionId: 2679856,
  fileId: 2566634,
  url: 'https://civitai.com/api/download/models/2679856?fileId=2566634',
  modelApi: 'https://civitai.com/api/v1/models/1147756',
  versionApi: 'https://civitai.com/api/v1/model-versions/2679856',
  creator: 'Knightus_Ai',
  baseModel: 'NoobAI',
}
function fixture() {
  const value = {
    schemaVersion: 1,
    profile: 'noise-profile',
    stage: 'bounded',
    appData: '/owned/data/imagegen-studio',
    artifacts: '/owned/evidence',
    side: 256,
    steps: 3,
    illustrious: {
      path: '/original/cyber.safetensors',
      sha256: 'a'.repeat(64),
      byteSize: 99,
      type: 'checkpoint',
      family: 'illustrious',
      name: 'Cyber',
      versionName: 'v-trained',
      predictionType: null,
      trainedObjective: 'v_prediction',
      origin,
    },
    illustriousEpsilon: {
      path: '/original/noob-eps.safetensors',
      ...officialEpsilonIdentity,
      type: 'checkpoint',
      family: 'illustrious',
      name: 'Official Noob EPS',
      versionName: 'eps1.0',
      predictionType: null,
      trainedObjective: 'epsilon',
    },
    illustriousLora: {
      path: '/original/lora.safetensors',
      sha256: 'b'.repeat(64),
      byteSize: 10,
      type: 'lora',
      family: 'illustrious',
      name: 'ordinary LoRA',
      versionName: 'trained',
    },
    authorRecipes: {},
  }
  for (const key of ['illustrious', 'illustriousEpsilon'])
    value.authorRecipes[key] = {
      ...noiseRecipeSources[key],
      attribution: key === 'illustrious' ? 'upstream-on-credited-derivative' : 'checkpoint-author',
      assumedFields: ['timestepSpacing'],
      execution: executionFor(key, 'author'),
    }
  return structuredClone(value)
}
function frozen(execution = executionFor('illustrious')) {
  return {
    context: {
      documentId: 'first-project',
      documentRevision: 3,
      bbox: { x: 0, y: 0, width: execution.width, height: execution.height },
      model: {
        reference: {
          predictionType: execution.predictionType,
          fileSha256: 'a'.repeat(64),
          localVersionId: 'same-version',
        },
      },
      sampling: {
        steps: execution.steps,
        cfgScale: execution.cfgScale,
        sampler: execution.sampler === 'euler' ? 'Euler' : 'Euler a',
        scheduler: 'Normal',
        invokeScheduler: execution.sampler,
        noiseProfile: structuredClone(execution.noiseProfile),
        seed: 0,
      },
      prompts: { positive: 'same', negative: 'same' },
      loras: [{ weight: -0.5, sha256: 'b'.repeat(64) }],
      target: { sha256: 'c'.repeat(64), byteSize: 99 },
    },
    workerJob: {
      checkpoint: {
        predictionType: execution.predictionType,
        sha256: 'a'.repeat(64),
        path: '/same/managed',
      },
      bbox: { x: 0, y: 0, width: execution.width, height: execution.height },
      sampling: {
        steps: execution.steps,
        cfgScale: execution.cfgScale,
        scheduler: execution.sampler,
        noiseProfile: structuredClone(execution.noiseProfile),
        seed: 0,
      },
      prompts: { positive: 'same', negative: 'same' },
      loras: [{ weight: -0.5, sha256: 'b'.repeat(64) }],
      target: { sha256: 'c'.repeat(64), byteSize: 99 },
    },
  }
}

test('strict guards preserve independent trained checkpoints and explicit stage claims', () => {
  for (const stage of ['bounded', 'bounded-lifecycle', 'author', 'outpaint']) {
    const value = fixture()
    value.stage = stage
    if (stage === 'outpaint')
      value.lama = {
        path: '/owned/lama.pt',
        sha256: '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9',
        byteSize: 205669692,
      }
    const validated = validateNoiseProfileFixture(value, ready)
    assert.equal(validated.stage, stage)
    assert.equal(validated.modelKeys.length, 3)
    assert.match(
      validated.completedScope,
      stage === 'author' ? /832x1216\/28-step/ : /256px\/three-step/,
    )
    assert.equal(value.illustrious.trainedObjective, 'v_prediction')
    assert.equal(value.illustriousEpsilon.trainedObjective, 'epsilon')
  }
  const raw = fixture()
  raw.authorRecipes.illustrious.sourceUrl = raw.authorRecipes.illustrious.sourceUrl.replace(
    '/resolve/',
    '/raw/',
  )
  validateNoiseProfileFixture(raw, ready)
})

test('partial lifecycle outcome requires four completions/five admissions and cannot claim trained matched controls', () => {
  const value = fixture()
  value.stage = 'bounded-lifecycle'
  const validated = validateNoiseProfileFixture(value, ready)
  assert.match(validated.completedScope, /lifecycle only/)
  assert.match(validated.completedScope, /no matched trained pixel-control completion claim/)
  assert.equal(validated.fullBoundedClaim, false)
  assert.equal(validated.matchedTrainedPixelControlCases, 0)
  assert.deepEqual(validated.expectedOutcome, {
    finiteCompletions: 4,
    actualAdmissions: 5,
    canceledOriginals: 1,
    preservingRetryRefusals: 3,
  })
  const observed = {
    stage: value.stage,
    ...validated.expectedOutcome,
    completedScope: validated.completedScope,
    fullBoundedClaim: validated.fullBoundedClaim,
    matchedTrainedPixelControlCases: validated.matchedTrainedPixelControlCases,
    noCombinedMatrixClaim: true,
  }
  assertNoiseStageOutcome(observed)
  for (const [field, changed] of [
    ['finiteCompletions', 8],
    ['actualAdmissions', 4],
    ['canceledOriginals', 0],
    ['preservingRetryRefusals', 2],
    ['fullBoundedClaim', true],
    ['matchedTrainedPixelControlCases', 5],
    ['noCombinedMatrixClaim', false],
  ])
    assert.throws(() => assertNoiseStageOutcome({ ...observed, [field]: changed }))
})

test('outpaint independently requires four completions, six admissions, two Cancels and six preserving policy refusals', () => {
  const value = fixture()
  value.stage = 'outpaint'
  value.lama = {
    path: '/owned/lama.pt',
    sha256: '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9',
    byteSize: 205669692,
  }
  const validated = validateNoiseProfileFixture(value, ready)
  assert.deepEqual(validated.expectedOutcome, {
    finiteCompletions: 4,
    actualAdmissions: 6,
    canceledOriginals: 2,
    preservingRetryRefusals: 6,
  })
  assert.equal(validated.fullBoundedClaim, false)
  assert.equal(validated.matchedTrainedPixelControlCases, 0)
  assert.match(
    validated.completedScope,
    /two actual Cancels and six refused\/restored frozen Retry/,
  )
  const observed = {
    stage: 'outpaint',
    finiteCompletions: 4,
    actualAdmissions: 6,
    canceledOriginals: 2,
    preservingRetryRefusals: 6,
    completedScope: validated.completedScope,
    fullBoundedClaim: false,
    matchedTrainedPixelControlCases: 0,
    noCombinedMatrixClaim: true,
  }
  assertNoiseStageOutcome(observed)
  for (const [field, value] of [
    ['finiteCompletions', 2],
    ['actualAdmissions', 4],
    ['canceledOriginals', 0],
    ['preservingRetryRefusals', 3],
    ['fullBoundedClaim', true],
    ['matchedTrainedPixelControlCases', 5],
    ['noCombinedMatrixClaim', false],
  ])
    assert.throws(() => assertNoiseStageOutcome({ ...observed, [field]: value }))
})

test('noise Retry changes and restores the captured epsilon or v-prediction policy independently', () => {
  assert.deepEqual(noiseRetryPolicyAxes(executionFor('illustrious')), [
    { axis: 'zero-snr', field: 'rescaleBetasZeroSnr', captured: true, changed: false },
    { axis: 'spacing', field: 'timestepSpacing', captured: 'leading', changed: 'trailing' },
    { axis: 'prediction', field: 'predictionType', captured: 'v_prediction', changed: 'epsilon' },
  ])
  assert.deepEqual(noiseRetryPolicyAxes(executionFor('illustriousEpsilon')), [
    { axis: 'zero-snr', field: 'rescaleBetasZeroSnr', captured: false, changed: true },
    { axis: 'spacing', field: 'timestepSpacing', captured: 'leading', changed: 'trailing' },
    { axis: 'prediction', field: 'predictionType', captured: 'epsilon', changed: 'v_prediction' },
  ])
  const trailing = executionFor('illustrious')
  trailing.noiseProfile.timestepSpacing = 'trailing'
  assert.deepEqual(noiseRetryPolicyAxes(trailing)[1], {
    axis: 'spacing',
    field: 'timestepSpacing',
    captured: 'trailing',
    changed: 'leading',
  })
  assert.throws(() => noiseRetryPolicyAxes({ ...trailing, predictionType: 'sample' }))
})

test('image-based progress uses two selected leading timesteps and permits coalesced delivery', () => {
  const oracle = {
    numTrainTimesteps: 1000,
    denoisingStrength: 0.5,
    nativeTimesteps: [667, 334, 1],
    selectedTimesteps: [334, 1],
    effectiveDenoisingEvaluations: 2,
    productionEqualsIndependentNative: true,
  }
  assertNoiseImageBasedProgress(
    [{ current: { step: 1, totalSteps: 2 } }, { current: { step: 2, totalSteps: 2 } }],
    oracle,
  )
  assertNoiseImageBasedProgress([{ current: { step: 2, totalSteps: 2 } }], oracle)
  for (const trace of [
    [],
    [{ current: { step: 1, totalSteps: 1 } }],
    [{ current: { step: 2, totalSteps: 3 } }],
    [{ current: { step: 1, totalSteps: 2 } }],
    [{ current: { step: 1, totalSteps: 3 } }, { current: { step: 2, totalSteps: 2 } }],
    [{ current: { step: 3, totalSteps: 2 } }, { current: { step: 2, totalSteps: 2 } }],
    [{ current: { step: 0, totalSteps: 2 } }, { current: { step: 2, totalSteps: 2 } }],
    [
      { current: { step: 2, totalSteps: 2 } },
      { current: { step: 1, totalSteps: 2 } },
      { current: { step: 2, totalSteps: 2 } },
    ],
  ])
    assert.throws(() => assertNoiseImageBasedProgress(trace, oracle))
  assert.throws(
    () =>
      assertNoiseImageBasedProgress([{ current: { step: 2, totalSteps: 2 } }], {
        ...oracle,
        selectedTimesteps: [1],
        effectiveDenoisingEvaluations: 1,
      }),
    /independently selected training cutoff/,
  )
})

function pixelExamples() {
  // Independently fixed 4x2 source, shifted target and 6x2 merged preview; no production compositor.
  return {
    sourceRect: { x: 0, y: 0, width: 4, height: 2 },
    bbox: { x: 2, y: 0, width: 4, height: 2 },
    previewRect: { x: 0, y: 0, width: 6, height: 2 },
    source: {
      width: 4,
      height: 2,
      rgba: Buffer.from([
        10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255, 11, 21, 31, 255, 41,
        51, 61, 255, 71, 81, 91, 255, 101, 111, 121, 255,
      ]),
    },
    target: {
      width: 4,
      height: 2,
      rgba: Buffer.from([
        70, 80, 90, 255, 100, 110, 120, 255, 0, 0, 0, 0, 0, 0, 0, 0, 71, 81, 91, 255, 101, 111, 121,
        255, 0, 0, 0, 0, 0, 0, 0, 0,
      ]),
    },
    contribution: {
      width: 4,
      height: 2,
      rgba: Buffer.from([
        0, 0, 0, 0, 110, 120, 130, 128, 140, 150, 160, 255, 170, 180, 190, 255, 0, 0, 0, 0, 111,
        121, 131, 255, 141, 151, 161, 255, 171, 181, 191, 255,
      ]),
    },
    preview: {
      width: 6,
      height: 2,
      rgba: Buffer.from([
        10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 105, 115, 125, 255, 140, 150, 160, 255,
        170, 180, 190, 255, 11, 21, 31, 255, 41, 51, 61, 255, 71, 81, 91, 255, 111, 121, 131, 255,
        141, 151, 161, 255, 171, 181, 191, 255,
      ]),
    },
  }
}

test('shifted outpaint target retains independent source overlap RGB and transparent extension', () => {
  assert.deepEqual(assertOutpaintSourcePixels(pixelExamples()), {
    overlapPixels: 4,
    transparentPixels: 4,
  })
  for (const axis of ['x', 'y']) {
    const overflowing = pixelExamples()
    overflowing.sourceRect[axis] = Number.MAX_SAFE_INTEGER
    assert.throws(() => assertOutpaintSourcePixels(overflowing))
  }
  const wrongRgb = pixelExamples()
  wrongRgb.target.rgba[0] ^= 1
  assert.throws(() => assertOutpaintSourcePixels(wrongRgb), /exact source RGBA/)
  const wrongAlpha = pixelExamples()
  wrongAlpha.target.rgba[11] = 255
  assert.throws(() => assertOutpaintSourcePixels(wrongAlpha), /remain transparent/)
  const shifted = pixelExamples()
  shifted.bbox.x = 1
  assert.throws(() => assertOutpaintSourcePixels(shifted), /exact source RGBA/)
})

test('saved outpaint preview retains protected source pixels and permits generated seam changes', () => {
  assert.deepEqual(assertOutpaintPreviewPixels(pixelExamples()), {
    protectedPixels: 6,
    protectedOverlapPixels: 2,
  })
  const protectedChange = pixelExamples()
  protectedChange.preview.rgba[8] ^= 1
  assert.throws(() => assertOutpaintPreviewPixels(protectedChange), /exact protected source RGBA/)
  const seamChange = pixelExamples()
  seamChange.preview.rgba[12] ^= 1
  assert.deepEqual(assertOutpaintPreviewPixels(seamChange), {
    protectedPixels: 6,
    protectedOverlapPixels: 2,
  })
  const wrongPlacement = pixelExamples()
  wrongPlacement.previewRect.x = 1
  assert.throws(
    () => assertOutpaintPreviewPixels(wrongPlacement),
    /cover every protected source pixel/,
  )
})

test('accepted outpaint view and saved layer retain bbox placement and composition', () => {
  const bbox = { x: -7, y: 12, width: 256, height: 256 }
  const layer = {
    width: 256,
    height: 256,
    transform: { x: -7, y: 12, rotationDegrees: 0, scaleX: 1, scaleY: 1 },
    opacity: 1,
    blendMode: 'normal',
    visible: true,
  }
  assertOutpaintLayerPlacement(layer, bbox)
  const { width, height, ...stored } = layer
  assertOutpaintLayerPlacement({ ...stored, asset: { width, height } }, bbox)
  for (const field of ['x', 'y', 'scaleX', 'scaleY', 'rotationDegrees'])
    assert.throws(() =>
      assertOutpaintLayerPlacement(
        { ...layer, transform: { ...layer.transform, [field]: layer.transform[field] + 1 } },
        bbox,
      ),
    )
  for (const [field, value] of [
    ['width', 128],
    ['height', 128],
    ['opacity', 0.5],
    ['blendMode', 'multiply'],
    ['visible', false],
  ])
    assert.throws(() => assertOutpaintLayerPlacement({ ...layer, [field]: value }, bbox))
})

test('accepted exact identity distinguishes genuine epsilon and v-trained checkpoints in the same family', () => {
  const value = fixture()
  const v = value.illustrious
  const epsilon = value.illustriousEpsilon
  const accepted = (descriptor, predictionType) => ({
    model: {
      baseModelFamily: descriptor.family,
      fileSha256: descriptor.sha256,
      predictionType,
    },
  })
  const vConfiguration = accepted(v, 'v_prediction')
  const epsilonConfiguration = accepted(epsilon, 'epsilon')
  assertAcceptedCheckpointIdentity(vConfiguration, v)
  assertAcceptedCheckpointIdentity(epsilonConfiguration, epsilon)
  assert.throws(
    () => assertAcceptedCheckpointIdentity(epsilonConfiguration, v),
    /exact selected checkpoint/,
  )
  assert.throws(
    () => assertAcceptedCheckpointIdentity(vConfiguration, epsilon),
    /exact selected checkpoint/,
  )
  // Prediction interpretation is separate from weight identity; the same-file causal control
  // must still retain the v-trained checkpoint even when it executes with epsilon prediction.
  assertAcceptedCheckpointIdentity(accepted(v, 'epsilon'), v)
  assert.throws(() =>
    assertAcceptedCheckpointIdentity(
      { model: { ...epsilonConfiguration.model, baseModelFamily: 'anima' } },
      epsilon,
    ),
  )
})

test('all stages keep separate exact outcome guards and only full bounded claims matched controls', () => {
  for (const stage of noiseStages) {
    const plan = noiseStagePlan(stage)
    assertNoiseStageOutcome({
      stage,
      ...plan.expectedOutcome,
      ...plan,
      noCombinedMatrixClaim: true,
    })
    assert.equal(plan.fullBoundedClaim, stage === 'bounded')
    assert.equal(plan.matchedTrainedPixelControlCases, stage === 'bounded' ? 5 : 0)
  }
})

for (const [name, mutate] of [
  [
    'unknown fixture field',
    (f) => {
      f.extraModel = f.illustrious
    },
  ],
  [
    'ambiguous combined stage',
    (f) => {
      f.stage = 'all'
    },
  ],
  [
    'same source used as two objectives',
    (f) => {
      f.illustriousEpsilon.sha256 = f.illustrious.sha256
    },
  ],
  [
    'unverified epsilon file',
    (f) => {
      f.illustriousEpsilon.sha256 = 'd'.repeat(64)
    },
  ],
  [
    'seeded prediction override',
    (f) => {
      f.illustrious.predictionType = 'v_prediction'
    },
  ],
  [
    'wrong credited derivative creator',
    (f) => {
      f.illustrious.origin.creator = 'Laxhar'
    },
  ],
  [
    'source revision drift',
    (f) => {
      f.authorRecipes.illustrious.sourceRevision = 'e'.repeat(40)
    },
  ],
  [
    'source content hash drift',
    (f) => {
      f.authorRecipes.illustriousEpsilon.sourceSha256 = 'e'.repeat(64)
    },
  ],
  [
    'parent guidance claimed as derivative recipe',
    (f) => {
      f.authorRecipes.illustrious.attribution = 'checkpoint-author'
    },
  ],
  [
    'unstated spacing assumption',
    (f) => {
      f.authorRecipes.illustrious.assumedFields = []
    },
  ],
  [
    'author recipe silently bounded',
    (f) => {
      f.authorRecipes.illustrious.execution.width = 256
    },
  ],
  [
    'unlisted recipe field',
    (f) => {
      f.authorRecipes.illustrious.autoApply = true
    },
  ],
])
  test(`${name} refuses at the real fixture guard`, () => {
    const value = fixture()
    mutate(value)
    assert.throws(() => validateNoiseProfileFixture(value, ready))
  })

test('old or capability-incomplete installed peers refuse before any source copy', () => {
  for (const workerVersion of ['0.12.0', '0.13.0', '0.15.0'])
    assert.throws(() => assertNoiseReady({ ...ready, workerVersion }), /worker0.14/)
  for (const capability of ready.capabilities)
    assert.throws(
      () =>
        assertNoiseReady({
          ...ready,
          capabilities: ready.capabilities.filter((v) => v !== capability),
        }),
      new RegExp(capability),
    )
})

test('five matched bounded cases vary exactly prediction, zero-SNR, spacing or sampler', () => {
  const cases = boundedNoiseCases()
  assert.equal(cases.length, 5)
  const baseline = frozen(cases[0].execution)
  for (const spec of cases.slice(1)) {
    const control = frozen(spec.execution)
    control.context.documentId = 'second-project'
    assert.notDeepEqual(normalizeNoiseInputs(control), normalizeNoiseInputs(baseline))
    assert.deepEqual(
      normalizeNoiseInputs(control, spec.axis),
      normalizeNoiseInputs(baseline, spec.axis),
    )
    assertNoiseExecution(control, spec.execution)
  }
  assert.deepEqual(cases[0].execution.noiseProfile, baselineNoiseProfile)
})

test('normalizing one declared axis retains CFG, steps, seed, prompts, LoRA and all neighboring noise fields', () => {
  const baseline = frozen()
  for (const axis of ['prediction', 'zero-snr', 'spacing', 'sampler']) {
    for (const mutate of [
      (v) => {
        v.context.sampling.cfgScale = 6
      },
      (v) => {
        v.workerJob.sampling.steps = 4
      },
      (v) => {
        v.workerJob.sampling.seed = 1
      },
      (v) => {
        v.context.prompts.positive = 'other prompt'
      },
      (v) => {
        v.workerJob.loras[0].weight = 0.5
      },
      (v) => {
        v.context.model.reference.fileSha256 = 'd'.repeat(64)
      },
    ]) {
      const changed = structuredClone(baseline)
      mutate(changed)
      assert.notDeepEqual(normalizeNoiseInputs(changed, axis), normalizeNoiseInputs(baseline, axis))
    }
  }
  const twoAxes = frozen()
  twoAxes.context.sampling.noiseProfile.timestepSpacing = 'trailing'
  twoAxes.workerJob.sampling.noiseProfile.timestepSpacing = 'trailing'
  assert.notDeepEqual(
    normalizeNoiseInputs(twoAxes, 'zero-snr'),
    normalizeNoiseInputs(baseline, 'zero-snr'),
  )
  assert.throws(() => normalizeNoiseInputs(baseline, ['zero-snr', 'spacing']), /one declared/)
  assert.equal(
    baseline.context.documentId,
    'first-project',
    'Normalization must not mutate durable input.',
  )
})

test('frozen execution guard detects ignored profile and incorrect native Euler dispatch', () => {
  const baseline = frozen()
  assertNoiseExecution(baseline, executionFor('illustrious'))
  for (const mutate of [
    (v) => {
      v.workerJob.sampling.noiseProfile.rescaleBetasZeroSnr = false
    },
    (v) => {
      v.workerJob.sampling.scheduler = 'euler_a'
    },
    (v) => {
      v.context.bbox.height = 1216
    },
  ]) {
    const changed = structuredClone(baseline)
    mutate(changed)
    assert.throws(() => assertNoiseExecution(changed, executionFor('illustrious')))
  }
})

test('noise txt2img progress proves requested bounded and author steps despite event coalescing', () => {
  const trace = (steps, observedSteps) =>
    observedSteps.map((step) => ({ current: { step, totalSteps: steps } }))
  assertNoiseTxt2ImgProgress(trace(3, [1, 2, 3]), executionFor('illustrious'))
  assertNoiseTxt2ImgProgress(trace(3, [2, 3]), executionFor('illustriousEpsilon'))
  assertNoiseTxt2ImgProgress(trace(28, [1, 14, 28]), executionFor('illustrious', 'author'))
  assertNoiseTxt2ImgProgress(trace(28, [28]), executionFor('illustriousEpsilon', 'author'))
})

test('noise txt2img progress refuses reduced execution, intermediate total drift and incomplete completion', () => {
  const author = executionFor('illustrious', 'author')
  assert.throws(
    () => assertNoiseTxt2ImgProgress([{ current: { step: 3, totalSteps: 3 } }], author),
    /Every native txt2img progress event/,
  )
  assert.throws(
    () =>
      assertNoiseTxt2ImgProgress(
        [
          { current: { step: 1, totalSteps: 28 } },
          { current: { step: 14, totalSteps: 27 } },
          { current: { step: 28, totalSteps: 28 } },
        ],
        author,
      ),
    /Every native txt2img progress event/,
  )
  assert.throws(
    () => assertNoiseTxt2ImgProgress([{ current: { step: 27, totalSteps: 28 } }], author),
    /completion must reach/,
  )
  assert.throws(() => assertNoiseTxt2ImgProgress([], author), /must report progress/)
})

test('resume admits only the exact previous two rows or final three declared ready source identities', () => {
  const value = fixture()
  const catalog = ['illustrious', 'illustriousEpsilon', 'illustriousLora'].map((key, i) => {
    const source = value[key]
    const id = { illustrious: 700040, illustriousEpsilon: 700140, illustriousLora: 700060 }[key]
    const version = {
      id: `version-${i}`,
      name: source.versionName,
      file: {
        sha256: source.sha256,
        sizeBytes: source.byteSize,
        status: 'ready',
        originalFilename: source.path.split('/').at(-1),
        managedPath: `${value.appData}/models/qualified-${id}.safetensors`,
      },
      expectedSha256: source.sha256,
      baseModelFamily: 'illustrious',
      format: 'safetensors',
      predictionType: null,
      dependencyVersionIds: {},
      civitaiVersionId: source.origin?.versionId ?? 700061,
      civitaiFileId: source.origin?.fileId ?? 700062,
      sourceMetadata: source.origin ? { origin: source.origin } : {},
    }
    return {
      id: `model-${i}`,
      type: source.type,
      displayName: source.name,
      defaultVersionId: version.id,
      versions: [version],
      source: { kind: 'civitai', modelId: source.origin?.modelId ?? 700060 },
      creator: source.origin?.creator,
      sourceMetadata: source.origin ? { origin: source.origin } : {},
    }
  })
  assertNoiseCatalog(catalog, value)
  const old = catalog.filter(
    (row) => row.type === 'lora' || row.displayName === value.illustrious.name,
  )
  assertNoiseCatalog(old, value, { adopting: true })
  assert.throws(() => assertNoiseCatalog(old, value), /exactly/)
  const drift = structuredClone(catalog)
  drift[2].versions[0].file.sha256 = 'd'.repeat(64)
  assert.throws(() => assertNoiseCatalog(drift, value), /undeclared/)
  const missingOld = catalog.filter((row) => row.displayName !== value.illustrious.name)
  assert.throws(
    () => assertNoiseCatalog(missingOld, value, { adopting: true }),
    /previous Cyberfalafel/,
  )
})
