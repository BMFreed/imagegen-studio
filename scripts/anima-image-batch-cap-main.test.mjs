/**
 * Real Anima IMG/normal mixed-alpha OUT: actual preparation/expansion -> queue/private input ->
 * production request reconstruction -> staging/receipt/cursor -> immutable accepted projection.
 * Exact resource/Project ownership/LaMa metadata and output pixels are explicit collaborators.
 * These ten cases supply140 controlled candidate PNGs; no installed ML/public Add/Save/pixel
 * equality. Refusal33 checks empty durable state only; the native gate owns actual32 temporary
 * preservation.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { installedFixture, produced, resource } from './anima-image-batch-cap-main-fixtures.mjs'

const red = 'a (red:1.3) ceramic cup on a wooden table, studio photograph'
const blue = 'a (blue:1.3) ceramic cup on a wooden table, studio photograph'
const blurry = '(blurry:0.7), low quality'
const noisy = '(noisy:0.7), low quality'
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

// Handwritten complete tuple tables [pair, iteration, seed, positive, negative]. No planner,
// producer compiler, profile oracle or seed arithmetic constructs these expected schedules.
const boundary32 = [
  [0, 0, 0, red, blurry],
  [0, 1, 1, red, blurry],
  [0, 2, 2, red, blurry],
  [0, 3, 3, red, blurry],
  [0, 4, 4, red, blurry],
  [0, 5, 5, red, blurry],
  [0, 6, 6, red, blurry],
  [0, 7, 7, red, blurry],
  [1, 0, 0, red, noisy],
  [1, 1, 1, red, noisy],
  [1, 2, 2, red, noisy],
  [1, 3, 3, red, noisy],
  [1, 4, 4, red, noisy],
  [1, 5, 5, red, noisy],
  [1, 6, 6, red, noisy],
  [1, 7, 7, red, noisy],
  [2, 0, 0, blue, blurry],
  [2, 1, 1, blue, blurry],
  [2, 2, 2, blue, blurry],
  [2, 3, 3, blue, blurry],
  [2, 4, 4, blue, blurry],
  [2, 5, 5, blue, blurry],
  [2, 6, 6, blue, blurry],
  [2, 7, 7, blue, blurry],
  [3, 0, 0, blue, noisy],
  [3, 1, 1, blue, noisy],
  [3, 2, 2, blue, noisy],
  [3, 3, 3, blue, noisy],
  [3, 4, 4, blue, noisy],
  [3, 5, 5, blue, noisy],
  [3, 6, 6, blue, noisy],
  [3, 7, 7, blue, noisy],
]
const prefix6 = [
  [0, 0, 0, red, blurry],
  [0, 1, 1, red, blurry],
  [1, 0, 2, red, noisy],
  [1, 1, 3, red, noisy],
  [2, 0, 4, blue, blurry],
  [2, 1, 5, blue, blurry],
]
const plain = [
  [0, 0, 0, 'a red ceramic cup on a wooden table, studio photograph', 'blurry, low quality'],
]
const concrete31 = [
  [0, 0, 0, red, blurry],
  [0, 1, 1, red, blurry],
  [0, 2, 2, red, blurry],
  [0, 3, 3, red, blurry],
  [0, 4, 4, red, blurry],
  [0, 5, 5, red, blurry],
  [0, 6, 6, red, blurry],
  [0, 7, 7, red, blurry],
  [0, 8, 8, red, blurry],
  [0, 9, 9, red, blurry],
  [0, 10, 10, red, blurry],
  [0, 11, 11, red, blurry],
  [0, 12, 12, red, blurry],
  [0, 13, 13, red, blurry],
  [0, 14, 14, red, blurry],
  [0, 15, 15, red, blurry],
  [0, 16, 16, red, blurry],
  [0, 17, 17, red, blurry],
  [0, 18, 18, red, blurry],
  [0, 19, 19, red, blurry],
  [0, 20, 20, red, blurry],
  [0, 21, 21, red, blurry],
  [0, 22, 22, red, blurry],
  [0, 23, 23, red, blurry],
  [0, 24, 24, red, blurry],
  [0, 25, 25, red, blurry],
  [0, 26, 26, red, blurry],
  [0, 27, 27, red, blurry],
  [0, 28, 28, red, blurry],
  [0, 29, 29, red, blurry],
  [0, 30, 30, red, blurry],
]

const posteriorSeeds = [
  2654435769, 2654435768, 2654435771, 2654435770, 2654435773, 2654435772, 2654435775, 2654435774,
  2654435761, 2654435760, 2654435763, 2654435762, 2654435765, 2654435764, 2654435767, 2654435766,
  2654435753, 2654435752, 2654435755, 2654435754, 2654435757, 2654435756, 2654435759, 2654435758,
  2654435745, 2654435744, 2654435747, 2654435746, 2654435749, 2654435748, 2654435751,
]
const compiled = new Map([
  [
    red,
    {
      version: 'anima-prompt-weighting-v1',
      cleanedText: 'a red ceramic cup on a wooden table, studio photograph',
      spans: [
        { start: 0, end: 2, weight: 1 },
        { start: 2, end: 5, weight: 1.3 },
        { start: 5, end: 54, weight: 1 },
      ],
    },
  ],
  [
    blue,
    {
      version: 'anima-prompt-weighting-v1',
      cleanedText: 'a blue ceramic cup on a wooden table, studio photograph',
      spans: [
        { start: 0, end: 2, weight: 1 },
        { start: 2, end: 6, weight: 1.3 },
        { start: 6, end: 55, weight: 1 },
      ],
    },
  ],
  [
    blurry,
    {
      version: 'anima-prompt-weighting-v1',
      cleanedText: 'blurry, low quality',
      spans: [
        { start: 0, end: 6, weight: 0.7 },
        { start: 6, end: 19, weight: 1 },
      ],
    },
  ],
  [
    noisy,
    {
      version: 'anima-prompt-weighting-v1',
      cleanedText: 'noisy, low quality',
      spans: [
        { start: 0, end: 5, weight: 0.7 },
        { start: 5, end: 18, weight: 1 },
      ],
    },
  ],
  [
    plain[0][3],
    {
      version: 'anima-prompt-weighting-v1',
      cleanedText: plain[0][3],
      spans: [{ start: 0, end: 54, weight: 1 }],
    },
  ],
  [
    plain[0][4],
    {
      version: 'anima-prompt-weighting-v1',
      cleanedText: plain[0][4],
      spans: [{ start: 0, end: 19, weight: 1 }],
    },
  ],
])

function nativePlan(seed) {
  assert.ok(Number.isSafeInteger(seed) && seed >= 0 && seed <= 30)
  return {
    beginIndex: 1,
    guidanceScale: 4,
    height: 256,
    initialSigma: 0.8571428571428571,
    mode: 'img2img',
    posteriorSeed: posteriorSeeds[seed],
    scheduler: 'euler',
    seed,
    sigmas: [0.8571428571428571, 0.6, 0],
    startStep: 1,
    steps: 3,
    stepSeed: seed,
    strength: 0.5,
    timesteps: [857.1428571428571, 600],
    totalSteps: 2,
    version: 'anima-flow-denoising-v1',
    width: 256,
  }
}

function component(reference, key, portable = false) {
  const source = reference[key]
  return {
    byteSize: source.byteSize,
    localModelId: source.installed.resourceId,
    localVersionId: source.installed.versionId,
    sha256: source.sha256,
    ...(portable ? {} : { managedPath: source.installed.managedPath }),
  }
}

function file(reference, key) {
  const source = reference[key]
  return { byteSize: source.byteSize, path: source.installed.managedPath, sha256: source.sha256 }
}

function assertActual(actual, reference, mode, expected, seedBehavior, maxPrompts, truncated) {
  const model = {
    architecture: 'anima-base-1.0',
    checkpoint: {
      byteSize: reference.anima.byteSize,
      managedPath: reference.anima.installed.managedPath,
      reference: resource(reference, 'anima'),
    },
    qwen3Encoder: component(reference, 'encoder'),
    vae: component(reference, 'vae'),
  }
  const configuredLoras = [
    { enabled: true, resource: resource(reference, 'animaLora'), weight: -0.5 },
  ]
  const loras = [
    {
      byteSize: reference.animaLora.byteSize,
      managedPath: reference.animaLora.installed.managedPath,
      reference: resource(reference, 'animaLora'),
      weight: -0.5,
    },
  ]
  const wireModel = {
    architecture: 'anima-base-1.0',
    checkpoint: file(reference, 'anima'),
    qwen3Encoder: file(reference, 'encoder'),
    vae: file(reference, 'vae'),
  }
  const wireLoras = [{ ...file(reference, 'animaLora'), weight: -0.5 }]
  const bbox = { x: mode === 'outpaint' ? 64 : 0, y: 0, width: 256, height: 256 }
  assert.equal(actual.plan.truncated, truncated)
  assert.deepEqual(
    actual.plan.items.map(({ promptPairIndex, iteration, seed, prompts }) => [
      promptPairIndex,
      iteration,
      seed,
      prompts.positive,
      prompts.negative,
    ]),
    expected,
  )
  assert.deepEqual(actual.authoredDraft.seed, { policy: 'fixed', value: 0 })
  const expectedAuthoredPrompts =
    expected.length === 31
      ? { positive: red, negative: blurry }
      : expected.length === 1
        ? { positive: plain[0][3], negative: plain[0][4] }
        : {
            positive: 'a {(red:1.3)|(blue:1.3)} ceramic cup on a wooden table, studio photograph',
            negative: '{(blurry:0.7)|(noisy:0.7)}, low quality',
          }
  assert.equal(actual.authoredDraft.positivePrompt.text, expectedAuthoredPrompts.positive)
  assert.equal(actual.authoredDraft.negativePrompt.text, expectedAuthoredPrompts.negative)
  assert.deepEqual(actual.authoredDraft.dynamicPrompt, { maxPrompts, seedBehavior })
  assert.deepEqual(actual.originalPrepared.dynamic, { maxPrompts, seedBehavior })
  assert.deepEqual(actual.authoredCallerOptions.seed, { policy: 'fixed', value: 0 })
  assert.equal(actual.callerOptionsAfterFirstAwait.seed.value, 37)
  assert.equal(actual.callerOptionsAfterFirstAwait.recipe.iterations, 7)
  assert.equal(actual.callerOptionsAfterFirstAwait.recipe.maxPrompts, 1)
  assert.equal(
    actual.callerOptionsAfterFirstAwait.recipe.seedBehavior,
    seedBehavior === 'per-prompt' ? 'per-iteration' : 'per-prompt',
  )
  assert.deepEqual(actual.originalPrepared.model, model)
  assert.deepEqual(actual.originalPrepared.loras, loras)
  assert.equal(actual.preparedSeed, 0)
  assert.equal(actual.picks, 0)
  assert.equal(actual.edits, 1)
  assert.equal(actual.capacityPreflights, 1)
  assert.deepEqual(actual.lateDraft.seed, { policy: 'fixed', value: 37 })
  assert.deepEqual(actual.lateDraft.dynamicPrompt, {
    maxPrompts: 3,
    seedBehavior: seedBehavior === 'per-prompt' ? 'per-iteration' : 'per-prompt',
  })
  assert.equal(actual.lateDraft.positivePrompt.text, 'late ordinary positive')
  assert.equal(actual.lateDraft.negativePrompt.text, 'late ordinary negative')
  assert.equal(actual.lateDraft.sampling.animaMethod, 'heun')
  assert.equal(actual.lateDraft.sampling.steps, 9)
  assert.equal(actual.lateDraft.sampling.denoisingStrength, 0.9)
  assert.equal(actual.lateDraft.loras[0].weight, 0.5)
  assert.equal(actual.latePrepared.sampling.seed, 37)
  assert.equal(actual.latePrepared.prompts.positive, 'late prepared positive')
  assert.deepEqual(actual.latePrepared.dynamic, actual.lateDraft.dynamicPrompt)
  assert.deepEqual(actual.lateReady.capabilities, [])
  if (mode === 'img2img') {
    assert.equal(actual.latePreparedBatch.items[0].prompts.positive, 'late item positive')
    assert.equal(
      actual.latePreparedBatch.items[0].compiledPrompts.positive.cleanedText,
      'late compiled positive',
    )
    assert.equal(actual.latePreparedBatch.items[0].compiledPrompts.positive.spans[0].weight, 7)
    assert.equal(actual.latePreparedBatch.items[0].samplingPlan.seed, 37)
  }
  for (const list of [
    actual.rows,
    actual.requests,
    actual.privateInputs,
    actual.configs,
    actual.provenance,
    actual.candidates,
    actual.publishedCandidates,
    actual.receipts,
    actual.completedRows,
    actual.capacityChecks[0].entries,
  ])
    assert.equal(list.length, expected.length)
  assert.equal(new Set(actual.rows.map(({ id }) => id)).size, expected.length)
  assert.deepEqual(
    actual.candidates.map(({ candidateId }) => candidateId),
    actual.rows.map(({ id }) => id),
  )
  const lastSeed = expected.at(-1)[2]
  assert.equal(actual.cursor, lastSeed)
  assert.equal(actual.cursorRow.actual_seed, lastSeed)
  assert.equal(actual.cursorRow.candidate_id, actual.rows.at(-1).id)
  assert.equal(actual.cursorRow.document_id, actual.originalPrepared.documentId)
  assert.equal(actual.cursorRow.completion_order, actual.receipts.at(-1).completion_order)
  for (const [index, [, , seed, positive, negative]] of expected.entries()) {
    const row = actual.rows[index],
      frozen = JSON.parse(row.frozen_payload_json)
    const target = {
      byteSize: actual.sourceIdentity.byteSize,
      colorSpace: 'srgb',
      format: 'png',
      height: 256,
      iccSha256: actual.sourceIdentity.iccSha256,
      sha256: actual.sourceIdentity.sha256,
      width: 256,
    }
    const wireTarget = {
      byteSize: target.byteSize,
      height: 256,
      iccSha256: target.iccSha256,
      sha256: target.sha256,
      width: 256,
    }
    const prompts = { positive: compiled.get(positive), negative: compiled.get(negative) }
    assert.equal(row.status, 'pending')
    assert.equal(row.operation, `anima-${mode}`)
    assert.equal(frozen.kind, `anima-${mode}`)
    assert.equal(frozen.schemaVersion, 1)
    assert.deepEqual(frozen.context, {
      schemaVersion: 1,
      kind: `anima-${mode}-preparation`,
      bbox,
      cfgRescale: 0,
      vaePrecision: 'Auto',
      documentId: actual.originalPrepared.documentId,
      documentRevision: actual.originalPrepared.documentRevision,
      model,
      loras,
      loraStack: configuredLoras,
      prompts: { positive, negative },
      target,
      sampling: {
        animaMethod: 'euler',
        cfgScale: 4,
        denoisingStrength: 0.5,
        requestedSeedPolicy: 'fixed',
        seed,
        seedBehavior,
        steps: 3,
      },
      ...(mode === 'outpaint' ? { conditioning: actual.originalPrepared.conditioning } : {}),
    })
    assert.deepEqual(frozen.workerJob, {
      bbox,
      loras: wireLoras,
      model: wireModel,
      prompts,
      sampling: nativePlan(seed),
      schemaVersion: 1,
      target: wireTarget,
    })
    const input = actual.privateInputs[index]
    assert.equal(input.queueItemId, row.id)
    assert.equal(input.targetSha256, target.sha256)
    assert.equal(input.targetByteSize, target.byteSize)
    assert.deepEqual(input.manifest, {
      payloadSha256: digest(row.frozen_payload_json),
      queueInputVersion: 1,
      queueItemId: row.id,
      targetByteSize: target.byteSize,
      targetFile: 'target.png',
      targetSha256: target.sha256,
    })
    const request = actual.requests[index]
    assert.equal(request.type, `generate-anima-${mode}`)
    assert.equal(request.protocolVersion, '1')
    assert.deepEqual(request.job.prompts, prompts)
    assert.deepEqual(request.job.sampling, nativePlan(seed))
    assert.deepEqual(request.job.model, wireModel)
    assert.deepEqual(request.job.loras, wireLoras)
    assert.equal(request.job.target.sha256, target.sha256)
    if (mode === 'outpaint') assert.deepEqual(request.job.conditioning, frozen.context.conditioning)
    const candidate = actual.candidates[index],
      receipt = actual.receipts[index]
    assert.equal(candidate.queueItemId, row.id)
    assert.equal(candidate.actualSeed, seed)
    assert.equal(candidate.frozenPayloadJson, row.frozen_payload_json)
    assert.equal(candidate.frozenPayloadSha256, digest(row.frozen_payload_json))
    assert.equal(candidate.image.sha256, actual.outputIdentity.sha256)
    assert.equal(candidate.image.byteSize, actual.outputIdentity.byteSize)
    assert.deepEqual(candidate, actual.publishedCandidates[index])
    assert.equal(receipt.queue_item_id, row.id)
    assert.equal(receipt.candidate_id, row.id)
    assert.equal(receipt.actual_seed, seed)
    assert.equal(receipt.frozen_payload_sha256, digest(row.frozen_payload_json))
    assert.equal(receipt.image_sha256, actual.outputIdentity.sha256)
    assert.equal(receipt.image_byte_size, actual.outputIdentity.byteSize)
    assert.equal(receipt.status, 'completed')
    assert.equal(actual.completedRows[index].id, row.id)
    assert.equal(actual.completedRows[index].status, 'completed')
    assert.equal(actual.completedRows[index].frozen_payload_json, row.frozen_payload_json)
    assert.equal(actual.capacityChecks[0].entries[index].queueItemId, row.id)
    assert.equal(actual.capacityChecks[0].entries[index].frozenPayloadJson, row.frozen_payload_json)
    assert.deepEqual(actual.configs[index], {
      anima: {
        architecture: 'anima-base-1.0',
        checkpointByteSize: reference.anima.byteSize,
        qwen3Encoder: component(reference, 'encoder', true),
        vae: component(reference, 'vae', true),
      },
      cfgRescale: 0,
      vaePrecision: 'Auto',
      loras: configuredLoras,
      mode,
      model: resource(reference, 'anima'),
      positivePrompt: { text: positive, embeddingRefs: [] },
      negativePrompt: { text: negative, embeddingRefs: [] },
      sampling: {
        actualSeed: seed,
        animaMethod: 'euler',
        cfgScale: 4,
        denoisingStrength: 0.5,
        requestedSeedPolicy: 'fixed',
        seedBehavior,
        steps: 3,
      },
      size: { height: 256, width: 256 },
    })
    const provenance = actual.provenance[index]
    assert.equal(provenance.kind, `anima-${mode}`)
    assert.deepEqual(provenance.generationConfiguration, actual.configs[index])
    assert.equal(provenance.layerSourceContext.sourceTargetSha256, target.sha256)
    assert.equal(provenance.layerSourceContext.sourceDocumentId, frozen.context.documentId)
    assert.equal(
      provenance.layerSourceContext.sourceDocumentRevision,
      frozen.context.documentRevision,
    )
    assert.deepEqual(provenance.layerSourceContext.bbox, bbox)
    assert.equal(provenance.executionResultContext.queueItemId, row.id)
    assert.equal(provenance.executionResultContext.candidateId, row.id)
    assert.equal(provenance.executionResultContext.output.sha256, actual.outputIdentity.sha256)
    if (mode === 'outpaint') {
      assert.equal(provenance.executionResultContext.output.outputMode, 'contribution')
      for (const field of ['infillResource', 'keepMask', 'policy', 'sourceTarget'])
        assert.deepEqual(
          provenance.layerSourceContext.outpaint[field],
          frozen.context.conditioning[field],
        )
    }
    const serialized = JSON.stringify(provenance)
    for (const forbidden of [
      'managedPath',
      'compiledPrompts',
      'cleanedText',
      'spans',
      'generationDraft',
      'late ordinary',
      'late prepared',
      'late compiled',
      reference.anima.installed.managedPath,
    ])
      assert.equal(
        serialized.includes(forbidden),
        false,
        `${forbidden} cannot enter portable provenance`,
      )
  }
}

// Real source sensitivity, isolated/executed/restored only by root:
// - shared policy32→33: only refusal33 cases RED; boundary/prefix/concrete31/plain neighbors GREEN;
// - planner truncated:pairs.truncated→false: only prefix6 RED;
// - PP offset items.length→iteration: only prefix6 RED;
// - overflow pairs.count > floor(...)→>=: boundary32 and concrete31 RED, all others GREEN.
// Across10 baseline +4×10 fault +10 restored tests:60 executions,10 semantic RED,50 GREEN.
const cases = [
  {
    stage: 'boundary',
    title: 'boundary32',
    expected: boundary32,
    maxPrompts: 4,
    seedBehavior: 'per-iteration',
    truncated: false,
  },
  {
    stage: 'prefix',
    title: 'prefix6',
    expected: prefix6,
    maxPrompts: 3,
    seedBehavior: 'per-prompt',
    truncated: true,
  },
  {
    stage: 'concrete31',
    title: 'concrete31 neighbor',
    expected: concrete31,
    maxPrompts: 1,
    seedBehavior: 'per-iteration',
    truncated: false,
  },
  {
    stage: 'plain',
    title: 'plain1 neighbor',
    expected: plain,
    maxPrompts: 4,
    seedBehavior: 'per-iteration',
    truncated: false,
  },
]
for (const mode of ['img2img', 'outpaint']) {
  for (const scenario of cases)
    test(`Anima/${mode}: actual Main ${scenario.title}`, async () => {
      const reference = installedFixture()
      const actual = await produced(reference, scenario.stage, mode)
      assertActual(
        actual,
        reference,
        mode,
        scenario.expected,
        scenario.seedBehavior,
        scenario.maxPrompts,
        scenario.truncated,
      )
    })
  test(`Anima/${mode}: actual Main refusal33 preserves empty durable state`, async () => {
    const actual = await produced(installedFixture(), 'refusal', mode)
    assert.equal(actual.refusal?.name, 'GenerationBatchPlanError')
    assert.equal(actual.refusal?.code, 'BATCH_TOO_LARGE')
    assert.equal(
      actual.refusal?.message,
      'The planned jobs exceed the supplied batch admission limit.',
    )
    assert.equal(actual.preparedSeed, 0)
    assert.equal(actual.picks, 0)
    assert.equal(actual.edits, 0)
    assert.equal(actual.capacityPreflights, 0)
    assert.deepEqual(actual.authoredDraft.seed, { policy: 'fixed', value: 0 })
    assert.deepEqual(actual.authoredDraft.dynamicPrompt, {
      maxPrompts: 1,
      seedBehavior: 'per-iteration',
    })
    assert.equal(actual.authoredDraft.positivePrompt.text, red)
    assert.equal(actual.authoredDraft.negativePrompt.text, blurry)
    assert.equal(actual.authoredCallerOptions.observeRefusal, true)
    assert.equal(actual.callerOptionsAfterFirstAwait.observeRefusal, false)
    assert.equal(actual.authoredCallerOptions.concretePair, true)
    assert.equal(actual.callerOptionsAfterFirstAwait.concretePair, false)
    assert.equal(actual.authoredCallerOptions.recipe.iterations, 33)
    assert.equal(actual.callerOptionsAfterFirstAwait.recipe.iterations, 7)
    for (const rows of Object.values(actual.admissionStateBefore.tables)) assert.deepEqual(rows, [])
    assert.deepEqual(actual.admissionStateBefore.document.layers, [])
    assert.equal(actual.admissionStateBefore.privateFiles.scratch.kind, 'directory')
    assert.deepEqual(
      actual.admissionStateAfter,
      actual.admissionStateBefore,
      'Refused33 must preserve this actual empty SQLite/cursor/document/identity/private-file state. It does not prove native32 temporary-result retention.',
    )
  })
}
