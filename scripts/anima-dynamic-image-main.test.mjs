/**
 * Real Anima opaque IMG/mixed-alpha normal OUT preparation and expansion → SQLite/private inputs →
 * production request reconstruction → actual staging receipts/candidates → accepted projection.
 * Resource/Project ownership/LaMa metadata and candidate pixels are controlled preconditions. No
 * public Add/Save, installed weights, inference or image-quality claim.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import { installedFixture, produced, resource } from './anima-dynamic-image-main-fixtures.mjs'

const red = 'a (red:1.3) ceramic cup on a wooden table, studio photograph'
const blue = 'a (blue:1.3) ceramic cup on a wooden table, studio photograph'
const blurry = '(blurry:0.7), low quality'
const noisy = '(noisy:0.7), low quality'
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

// Literal pair-major/iteration-minor order and full compiled DTOs, independent of the production
// planner, compiler, request validator, frozen parser and qualification assertions.
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
    'a red ceramic cup on a wooden table, studio photograph',
    {
      version: 'anima-prompt-weighting-v1',
      cleanedText: 'a red ceramic cup on a wooden table, studio photograph',
      spans: [{ start: 0, end: 54, weight: 1 }],
    },
  ],
  [
    'blurry, low quality',
    {
      version: 'anima-prompt-weighting-v1',
      cleanedText: 'blurry, low quality',
      spans: [{ start: 0, end: 19, weight: 1 }],
    },
  ],
])

const baseline = [
  [red, blurry, 0, 0, 0],
  [red, blurry, 1, 1, 0],
  [red, noisy, 0, 0, 1],
  [red, noisy, 1, 1, 1],
  [blue, blurry, 0, 0, 2],
  [blue, blurry, 1, 1, 2],
  [blue, noisy, 0, 0, 3],
  [blue, noisy, 1, 1, 3],
]
const prefix = [
  [red, blurry, 0, 0, 0],
  [red, blurry, 1, 1, 0],
]
const plain = [
  ['a red ceramic cup on a wooden table, studio photograph', 'blurry, low quality', 0, 0, 0],
]

function component(reference, key, portable = false) {
  const source = reference[key]
  return {
    byteSize: source.byteSize,
    localModelId: source.installed.resourceId,
    localVersionId: source.installed.versionId,
    ...(portable ? {} : { managedPath: source.installed.managedPath }),
    sha256: source.sha256,
  }
}

function workerFile(reference, key) {
  const source = reference[key]
  return { byteSize: source.byteSize, path: source.installed.managedPath, sha256: source.sha256 }
}

// Literal full-N3 clipped Euler image grid. No compiler or old Heun fixture projects this oracle.
function imageSampling(seed) {
  return {
    beginIndex: 1,
    guidanceScale: 4,
    height: 256,
    initialSigma: 0.8571428571428571,
    mode: 'img2img',
    posteriorSeed: seed === 0 ? 2654435769 : 2654435768,
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

function assertActualBatch(actual, reference, mode, expected, truncated) {
  assert.equal(actual.edits, 1)
  assert.equal(actual.capacityPreflights, 1)
  assert.equal(actual.preparedSeed, 0)
  assert.equal(actual.picks, 0)
  assert.deepEqual(actual.authoredDraft.seed, { policy: 'fixed', value: 0 })
  assert.deepEqual(actual.authoredDraft.positivePrompt.embeddingRefs, [])
  assert.deepEqual(actual.authoredDraft.negativePrompt.embeddingRefs, [])
  assert.deepEqual(actual.lateDraft.seed, { policy: 'fixed', value: 37 })
  assert.equal(actual.lateDraft.positivePrompt.text, 'late ordinary positive')
  assert.equal(actual.lateDraft.negativePrompt.text, 'late ordinary negative')
  assert.equal(actual.lateDraft.sampling.animaMethod, 'heun')
  assert.equal(actual.lateDraft.sampling.steps, 9)
  assert.equal(actual.lateDraft.sampling.denoisingStrength, 0.9)
  assert.equal(actual.lateDraft.loras[0].weight, 0.5)
  assert.deepEqual(actual.lateDraft.dynamicPrompt, { maxPrompts: 1, seedBehavior: 'per-prompt' })
  assert.equal(actual.latePrepared.sampling.seed, 37)
  assert.equal(actual.latePrepared.prompts.positive, 'late prepared positive')
  assert.equal(actual.lateReady.capabilities.length, 0)
  assert.deepEqual(actual.lateOptions, { iterations: 7, maxPrompts: 1, seedBehavior: 'per-prompt' })
  if (mode === 'img2img') {
    assert.equal(actual.latePreparedBatch.items[0].prompts.positive, 'late item positive')
    assert.equal(
      actual.latePreparedBatch.items[0].compiledPrompts.positive.cleanedText,
      'late compiled positive',
    )
    assert.equal(actual.latePreparedBatch.items[0].compiledPrompts.positive.spans[0].weight, 7)
    assert.equal(actual.latePreparedBatch.items[0].samplingPlan.seed, 37)
  }
  assert.equal(actual.plan.truncated, truncated)
  assert.deepEqual(
    actual.plan.items.map(({ prompts, seed, iteration, promptPairIndex }) => [
      prompts.positive,
      prompts.negative,
      seed,
      iteration,
      promptPairIndex,
    ]),
    expected,
  )
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
  assert.ok(actual.resolutionChecks.some(({ kind }) => kind === 'bundle'))
  assert.ok(actual.resolutionChecks.some(({ kind }) => kind === 'lora'))
  assert.equal(actual.cursor, expected.at(-1)[2])
  assert.equal(actual.cursorRow.actual_seed, expected.at(-1)[2])
  assert.equal(actual.cursorRow.candidate_id, actual.rows.at(-1).id)
  assert.equal(actual.cursorRow.document_id, actual.originalPrepared.documentId)
  assert.equal(actual.cursorRow.completion_order, actual.receipts.at(-1).completion_order)
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
    checkpoint: workerFile(reference, 'anima'),
    qwen3Encoder: workerFile(reference, 'encoder'),
    vae: workerFile(reference, 'vae'),
  }
  const wireLoras = [{ ...workerFile(reference, 'animaLora'), weight: -0.5 }]
  const configuredLoras = [
    { enabled: true, resource: resource(reference, 'animaLora'), weight: -0.5 },
  ]
  assert.deepEqual(actual.originalPrepared.model, model)
  assert.deepEqual(actual.originalPrepared.loras, loras)

  for (const [index, [positive, negative, seed]] of expected.entries()) {
    const row = actual.rows[index]
    const frozen = JSON.parse(row.frozen_payload_json)
    const { context, workerJob } = frozen
    assert.equal(row.status, 'pending')
    assert.equal(row.operation, `anima-${mode}`)
    assert.equal(frozen.kind, `anima-${mode}`)
    assert.equal(context.kind, `anima-${mode}-preparation`)
    assert.equal(context.documentId, actual.originalPrepared.documentId)
    assert.equal(context.documentRevision, actual.originalPrepared.documentRevision)
    assert.deepEqual(context.bbox, {
      x: mode === 'outpaint' ? 64 : 0,
      y: 0,
      width: 256,
      height: 256,
    })
    assert.deepEqual(context.prompts, { positive, negative })
    const compiledSigns = { positive: compiled.get(positive), negative: compiled.get(negative) }
    const wireTarget = {
      byteSize: actual.sourceIdentity.byteSize,
      height: 256,
      iccSha256: actual.sourceIdentity.iccSha256,
      sha256: actual.sourceIdentity.sha256,
      width: 256,
    }
    assert.deepEqual(workerJob, {
      bbox: context.bbox,
      loras: wireLoras,
      model: wireModel,
      prompts: compiledSigns,
      sampling: imageSampling(seed),
      schemaVersion: 1,
      target: wireTarget,
    })
    assert.deepEqual(workerJob.prompts, compiledSigns)
    assert.deepEqual(context.sampling, {
      animaMethod: 'euler',
      cfgScale: 4,
      denoisingStrength: 0.5,
      requestedSeedPolicy: 'fixed',
      seed,
      seedBehavior: 'per-iteration',
      steps: 3,
    })
    assert.deepEqual(workerJob.sampling, imageSampling(seed))
    assert.deepEqual(context.model, model)
    assert.deepEqual(context.loras, loras)
    assert.deepEqual(context.loraStack, configuredLoras)
    assert.deepEqual(workerJob.model, wireModel)
    assert.deepEqual(workerJob.loras, wireLoras)
    assert.deepEqual(context.target, {
      byteSize: actual.sourceIdentity.byteSize,
      colorSpace: 'srgb',
      format: 'png',
      height: 256,
      iccSha256: actual.sourceIdentity.iccSha256,
      sha256: actual.sourceIdentity.sha256,
      width: 256,
    })
    assert.deepEqual(context.target, actual.originalPrepared.target)
    assert.equal(workerJob.target.sha256, actual.sourceIdentity.sha256)
    assert.equal(workerJob.target.byteSize, actual.sourceIdentity.byteSize)
    for (const forbidden of ['generationDraft', 'dynamic', 'compiledPrompts', 'embeddingRefs'])
      assert.equal(Object.hasOwn(context, forbidden), false)
    assert.equal(Object.hasOwn(workerJob, 'embeddings'), false)
    assert.equal(Object.hasOwn(workerJob, 'output'), false)
    assert.equal(Object.hasOwn(workerJob.target, 'path'), false)
    if (mode === 'outpaint')
      assert.deepEqual(context.conditioning, actual.originalPrepared.conditioning)
    const input = actual.privateInputs[index]
    assert.equal(input.queueItemId, row.id)
    assert.deepEqual(input.manifest, {
      payloadSha256: digest(row.frozen_payload_json),
      queueInputVersion: 1,
      queueItemId: row.id,
      targetByteSize: actual.sourceIdentity.byteSize,
      targetFile: 'target.png',
      targetSha256: actual.sourceIdentity.sha256,
    })
    assert.equal(input.targetSha256, actual.sourceIdentity.sha256)
    assert.equal(input.targetByteSize, actual.sourceIdentity.byteSize)
    const request = actual.requests[index]
    assert.equal(request.type, `generate-anima-${mode}`)
    assert.equal(request.protocolVersion, '1')
    assert.deepEqual(request.job.prompts, compiledSigns)
    assert.deepEqual(request.job.sampling, imageSampling(seed))
    assert.deepEqual(request.job.model, wireModel)
    assert.deepEqual(request.job.loras, wireLoras)
    assert.equal(request.job.target.sha256, actual.sourceIdentity.sha256)
    assert.equal(request.job.target.path, `${request.job.output.stagingRoot}/target.png`)
    assert.equal(request.job.output.pngPath, `${request.job.output.stagingRoot}/result.png`)
    if (mode === 'outpaint') {
      assert.deepEqual(request.job.conditioning, context.conditioning)
      assert.deepEqual(request.job.infillResource, {
        byteSize: 205669692,
        role: 'outpaint-infill',
        sha256: '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9',
        path: `${reference.appData}/inference-resources/big-lama.pt`,
      })
    }
    const candidate = actual.candidates[index]
    assert.equal(candidate.queueItemId, row.id)
    assert.equal(candidate.frozenPayloadJson, row.frozen_payload_json)
    assert.equal(candidate.frozenPayloadSha256, digest(row.frozen_payload_json))
    assert.equal(candidate.actualSeed, seed)
    assert.equal(candidate.image.sha256, actual.outputIdentity.sha256)
    assert.equal(candidate.image.byteSize, actual.outputIdentity.byteSize)
    assert.deepEqual(actual.publishedCandidates[index], candidate)
    const receipt = actual.receipts[index]
    assert.equal(receipt.queue_item_id, row.id)
    assert.equal(receipt.candidate_id, row.id)
    assert.equal(receipt.frozen_payload_sha256, digest(row.frozen_payload_json))
    assert.equal(receipt.actual_seed, seed)
    assert.equal(receipt.image_sha256, actual.outputIdentity.sha256)
    assert.equal(receipt.image_byte_size, actual.outputIdentity.byteSize)
    assert.equal(receipt.status, 'completed')
    assert.equal(actual.completedRows[index].id, row.id)
    assert.equal(actual.completedRows[index].status, 'completed')
    assert.equal(actual.completedRows[index].frozen_payload_json, row.frozen_payload_json)
    assert.equal(actual.capacityChecks[0].entries[index].queueItemId, row.id)
    assert.equal(actual.capacityChecks[0].entries[index].frozenPayloadJson, row.frozen_payload_json)
    const config = actual.configs[index]
    assert.deepEqual(config, {
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
        seedBehavior: 'per-iteration',
        steps: 3,
      },
      size: { height: 256, width: 256 },
    })
    const mapped = actual.provenance[index]
    assert.equal(mapped.kind, `anima-${mode}`)
    assert.equal(mapped.layerSourceContext.sourceTargetSha256, actual.sourceIdentity.sha256)
    assert.deepEqual(mapped.layerSourceContext.bbox, context.bbox)
    assert.equal(mapped.layerSourceContext.sourceDocumentId, context.documentId)
    assert.equal(mapped.layerSourceContext.sourceDocumentRevision, context.documentRevision)
    assert.equal(mapped.executionResultContext.candidateId, candidate.candidateId)
    assert.equal(mapped.executionResultContext.queueItemId, row.id)
    assert.equal(mapped.executionResultContext.output.sha256, actual.outputIdentity.sha256)
    if (mode === 'outpaint') {
      assert.equal(mapped.executionResultContext.output.outputMode, 'contribution')
      assert.deepEqual(mapped.layerSourceContext.outpaint.policy, context.conditioning.policy)
      assert.deepEqual(
        mapped.layerSourceContext.outpaint.sourceTarget,
        context.conditioning.sourceTarget,
      )
    }
    const serialized = JSON.stringify(mapped)
    for (const forbidden of [
      'managedPath',
      'cleanedText',
      'spans',
      'compiledPrompts',
      'generationDraft',
      'late ordinary',
      'late prepared',
      'late compiled',
      reference.anima.installed.managedPath,
    ])
      assert.equal(
        serialized.includes(forbidden),
        false,
        `${forbidden} is outside accepted provenance`,
      )
  }
}

// Boundary: actual preparation and mode-specific expansion, durable queue/private input, request
// reconstruction, staging and accepted projection. Both weighted signs are literal independent
// oracles. Neighbor: valid plain prompts use the same real image/resource/staging owners.
// Semantic production fault: anima-prompt-weighting.ts numericWeight(rawWeight) → 1. Four weighted
// lanes should fail while two plain controls stay green; shared producer/parser agreement cannot
// alone detect this fault. Root owns protected source mutation, actual execution and restoration.
for (const mode of ['img2img', 'outpaint']) {
  for (const stage of ['baseline', 'prefix'])
    test(`Anima/${mode}: real Main ${stage} weighted pair expansion and image provenance survive late caller edits`, async () => {
      const reference = installedFixture()
      let actual
      await assert.doesNotReject(async () => {
        actual = await produced(reference, stage, mode)
      })
      assertActualBatch(
        actual,
        reference,
        mode,
        stage === 'baseline' ? baseline : prefix,
        stage === 'prefix',
      )
    })
  test(`Anima/${mode}: real Main plain-sign neighbor retains image seed/source through the same staging owners`, async () => {
    const reference = installedFixture()
    const actual = await produced(reference, 'baseline', mode, { plain: true })
    assertActualBatch(actual, reference, mode, plain, false)
  })
}
