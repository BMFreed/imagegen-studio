/**
 * Six actual Main IMG/normal OUT cases supply10 candidate PNGs. Real preparation/expansion,
 * SQLite/private inputs, worker request reconstruction, staging/receipt/cursor and accepted
 * provenance preserve MAX→0 and Fixed0 neighbors. Resource/LaMa/Project ownership/source
 * composition/output PNGs are controlled collaborators. No installed ML, native Add/Undo/Save,
 * recovered-cursor read or physical crash claim. Root owns actual source sensitivity execution.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import {
  parseFrozenQueuedAnimaGenerationV1,
  parseFrozenQueuedAnimaOutpaintV1,
} from '../src/main/projects/anima-queued-generation.ts'
import { installedFixture, produced, resource } from './anima-image-seed-wrap-main-fixtures.mjs'

const red = 'a (red:1.3) ceramic cup on a wooden table, studio photograph'
const blurry = '(blurry:0.7), low quality'
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
// Independent complete tuples [pair, iteration, seed, raw positive, raw negative].
// Neither production scheduling/compilation nor the native qualification oracle builds expectations.
const wrap = [
  [0, 0, 4294967295, red, blurry],
  [0, 1, 0, red, blurry],
]
const zero = [
  [0, 0, 0, red, blurry],
  [0, 1, 1, red, blurry],
]
const plain = [
  [0, 0, 0, 'a red ceramic cup on a wooden table, studio photograph', 'blurry, low quality'],
]
// MAX XOR2654435769 is the uint32 bitwise complement:4294967295−2654435769=1640531526.
// Keep independently handwritten literals; do not compute expectations with the subject compiler.
const posteriorSeeds = new Map([
  [4294967295, 1640531526],
  [0, 2654435769],
  [1, 2654435768],
])
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
  assert.ok(posteriorSeeds.has(seed))
  return {
    beginIndex: 1,
    guidanceScale: 4,
    height: 256,
    initialSigma: 0.8571428571428571,
    mode: 'img2img',
    posteriorSeed: posteriorSeeds.get(seed),
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

function assertActual(actual, reference, mode, expected, seedBehavior) {
  const requestedSeedPolicy = 'fixed'
  const maxPrompts = seedBehavior === 'per-prompt' ? 1 : 4
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
  const operationalSeed = 31
  assert.equal(actual.plan.truncated, false)
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
  assert.deepEqual(actual.authoredDraft.seed, {
    policy: requestedSeedPolicy,
    value: expected[0][2],
  })
  assert.deepEqual(actual.authoredDraft.dynamicPrompt, { maxPrompts, seedBehavior })
  assert.equal(actual.authoredDraft.positivePrompt.text, expected[0][3])
  assert.equal(actual.authoredDraft.negativePrompt.text, expected[0][4])
  assert.deepEqual(actual.originalPrepared.dynamic, { maxPrompts, seedBehavior })
  assert.deepEqual(actual.originalPrepared.model, model)
  assert.deepEqual(actual.originalPrepared.loras, loras)
  assert.equal(actual.preparedSeed, expected[0][2])
  assert.equal(actual.originalPrepared.sampling.requestedSeedPolicy, requestedSeedPolicy)
  assert.equal(actual.picks, 0)
  assert.deepEqual(actual.entropyObservation, {
    producer: 'controlled CPU uint32 collaborator',
    outputSubstitution: false,
    nativeCryptoClaim: false,
    calls: [],
  })
  assert.deepEqual(actual.seedPreconditions, {
    lastActualSeed: operationalSeed,
    lastActualSeedSnapshot: 91,
  })
  assert.deepEqual(actual.authoredCallerOptions.seed, actual.authoredDraft.seed)
  assert.equal(actual.authoredCallerOptions.lastActualSeed, operationalSeed)
  assert.equal(actual.authoredCallerOptions.lastActualSeedSnapshot, 91)
  assert.deepEqual(actual.callerOptionsAfterFirstAwait.seed, { policy: 'random', value: null })
  assert.deepEqual(actual.authoredCallerOptions.recipe, {
    iterations: seedBehavior === 'per-prompt' ? 2 : 8,
    seedBehavior,
  })
  assert.equal(actual.callerOptionsAfterFirstAwait.lastActualSeed, 765)
  assert.equal(actual.callerOptionsAfterFirstAwait.lastActualSeedSnapshot, 766)
  assert.deepEqual(actual.callerOptionsAfterFirstAwait.recipe, {
    iterations: 8,
    seedBehavior: 'per-iteration',
  })
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
  assert.equal(actual.cursor, expected.at(-1)[2])
  // Completion order owns the cursor; MAX then0 must leave0 rather than the largest numeric seed.
  if (expected[0][2] === 4294967295) assert.equal(actual.cursor, 0)
  assert.equal(actual.cursorRow.actual_seed, expected.at(-1)[2])
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
    const sourceAlpha = Buffer.alloc(65536)
    for (let y = 0; y < 256; y++) sourceAlpha.fill(255, y * 256, y * 256 + 192)
    const conditioning = {
      bbox,
      infillResource: {
        byteSize: 205669692,
        role: 'outpaint-infill',
        sha256: '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9',
      },
      kind: 'alpha-outpaint-conditioning',
      policy: {
        edgeRadius: 16,
        fadeDistance: 16,
        infillMethod: 'lama',
        maskBlur: 'gaussian-weighted-max',
        minimumDenoise: 0,
        outputMode: 'contribution',
        version: 1,
      },
      schemaVersion: 1,
      sourceTarget: {
        byteSize: target.byteSize,
        format: 'png',
        height: 256,
        iccSha256: target.iccSha256,
        sha256: target.sha256,
        width: 256,
      },
      keepMask: {
        byteSize: 65536,
        format: 'alpha8',
        height: 256,
        polarity: 'keep',
        sha256: digest(sourceAlpha),
        width: 256,
      },
    }
    if (mode === 'outpaint') assert.deepEqual(actual.originalPrepared.conditioning, conditioning)
    const prompts = { positive: compiled.get(positive), negative: compiled.get(negative) }
    assert.equal(row.status, 'pending')
    assert.equal(row.operation, `anima-${mode}`)
    assert.equal(frozen.kind, `anima-${mode}`)
    const parseFrozen =
      mode === 'outpaint' ? parseFrozenQueuedAnimaOutpaintV1 : parseFrozenQueuedAnimaGenerationV1
    assert.deepEqual(parseFrozen(row.frozen_payload_json), frozen)
    assert.ok(Number.isSafeInteger(seed) && seed >= 0 && seed <= 4294967295)
    assert.equal(frozen.schemaVersion, 1)
    assert.deepEqual(Object.keys(frozen).sort(), [
      'context',
      'kind',
      'originRequestId',
      'schemaVersion',
      'workerJob',
    ])
    assert.equal(typeof frozen.originRequestId, 'string')
    assert.ok(frozen.originRequestId.length > 0)
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
        requestedSeedPolicy,
        seed,
        seedBehavior,
        steps: 3,
      },
      ...(mode === 'outpaint' ? { conditioning } : {}),
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
    if (mode === 'outpaint') assert.deepEqual(request.job.conditioning, conditioning)
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
        requestedSeedPolicy,
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

// Actual shared production source fault: remove only the final `% SEED_MODULUS` from
// `(input.baseSeed + (offset % SEED_MODULUS)) % SEED_MODULUS`. MAX's second item becomes
//4294967296 and both subjects must fail at the real compiler/admission boundary. Fixed0 PP2
// and plain PI1 remain valid. Root owns isolated mutation, execution and exact restoration.
for (const mode of ['img2img', 'outpaint']) {
  test(`Anima/${mode}: actual FixedMAX/per-prompt wraps to0 across image queue/staging/provenance`, async () => {
    const reference = installedFixture()
    const actual = await produced(reference, 'wrap', mode)
    assertActual(actual, reference, mode, wrap, 'per-prompt')
  })
  test(`Anima/${mode}: neighboring Fixed0/per-prompt preserves0 then1 image inputs`, async () => {
    const reference = installedFixture()
    const actual = await produced(reference, 'zero-two', mode)
    assertActual(actual, reference, mode, zero, 'per-prompt')
  })
  test(`Anima/${mode}: neighboring plain Fixed0/per-iteration ignores dynamic alternatives`, async () => {
    const reference = installedFixture()
    const actual = await produced(reference, 'plain', mode)
    assertActual(actual, reference, mode, plain, 'per-iteration')
  })
}
