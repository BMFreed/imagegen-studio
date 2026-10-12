/**
 * Real Main opaque IMG/mixed-alpha OUT expansion → SQLite/private inputs → actual staging
 * receipts/candidates → production accepted-provenance projection. Exact-resource resolvers,
 * Project/index ownership and candidate PNG pixels are controlled preconditions, not ML or Save.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import {
  installedFixture,
  produced,
  resource,
} from './illustrious-dynamic-embeddings-image-main-fixtures.mjs'

const token = '<illustriousphoto>'
const plain = 'a ceramic cup on a wooden table, studio photograph'
const photo = 'a ceramic cup on a wooden table, studio photograph, (<illustriousphoto>:1.3)'
const low = 'low quality'
const negativePhoto = 'low quality, (<illustriousphoto>:0.7)'
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

// Literal [positive, negative, positive-active, negative-active] order, handwritten independently
// of production planner/filter/provenance and qualification assertions.
const fourPairs = [
  [plain, low, false, false],
  [plain, negativePhoto, false, true],
  [photo, low, true, false],
  [photo, negativePhoto, true, true],
]

function assertActualBatch(actual, reference, objective, mode, expected, truncated) {
  const ref = { resource: resource(reference, 'embeddingTrained'), token }
  const frozenDescriptor = {
    byteSize: 49736,
    managedPath: reference.embeddingTrained.installed.managedPath,
    reference: ref.resource,
    token,
  }
  const wireDescriptor = {
    byteSize: 49736,
    path: reference.embeddingTrained.installed.managedPath,
    sha256: '91a95b244b8ba01d905d32ced7e3cc20eb74b4da8f519de3764505500d386c36',
    token,
  }
  assert.deepEqual(actual.authoredDraft.positivePrompt.embeddingRefs, [ref])
  assert.deepEqual(actual.authoredDraft.negativePrompt.embeddingRefs, [ref])
  assert.deepEqual(actual.originalPrepared.embeddingRefs, { positive: [ref], negative: [ref] })
  assert.deepEqual(actual.originalPrepared.embeddings, {
    positive: [frozenDescriptor],
    negative: [frozenDescriptor],
  })
  assert.equal(actual.edits, 1)
  assert.equal(actual.capacityPreflights, 1)
  assert.equal(actual.preparedSeed, 0)
  assert.equal(actual.picks, 0)
  assert.deepEqual(actual.lateDraft.seed, { policy: 'fixed', value: 37 })
  assert.deepEqual(actual.lateDraft.positivePrompt.embeddingRefs, [])
  assert.deepEqual(actual.lateDraft.negativePrompt.embeddingRefs, [])
  assert.equal(actual.lateDraft.positivePrompt.text, 'late ordinary positive')
  assert.equal(actual.lateDraft.negativePrompt.text, 'late ordinary negative')
  assert.deepEqual(actual.lateDraft.dynamicPrompt, { maxPrompts: 1, seedBehavior: 'per-prompt' })
  assert.equal(actual.latePrepared.sampling.seed, 37)
  assert.deepEqual(actual.latePrepared.embeddingRefs, { positive: [], negative: [] })
  assert.equal(actual.plan.truncated, truncated)
  assert.deepEqual(
    actual.plan.items.map(({ prompts, seed, iteration, promptPairIndex }) => [
      prompts.positive,
      prompts.negative,
      seed,
      iteration,
      promptPairIndex,
    ]),
    expected.map(([positive, negative], index) => [positive, negative, 0, 0, index]),
  )
  for (const list of [
    actual.rows,
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
  assert.deepEqual(actual.bindingChecks[0].positivePrompt, actual.authoredDraft.positivePrompt)
  assert.deepEqual(actual.bindingChecks[0].negativePrompt, actual.authoredDraft.negativePrompt)
  assert.equal(actual.cursor, 0)

  for (const [index, [positive, negative, positiveActive, negativeActive]] of expected.entries()) {
    const row = actual.rows[index]
    const frozen = JSON.parse(row.frozen_payload_json)
    const { context, workerJob } = frozen
    const effective = {
      positive: positiveActive ? [frozenDescriptor] : [],
      negative: negativeActive ? [frozenDescriptor] : [],
    }
    const refs = { positive: positiveActive ? [ref] : [], negative: negativeActive ? [ref] : [] }
    assert.equal(row.status, 'pending')
    assert.equal(row.operation, `illustrious-${mode}`)
    assert.equal(frozen.kind, `illustrious-${mode}`)
    assert.equal(
      context.kind,
      mode === 'outpaint' ? 'normal-outpaint-preparation' : 'normal-img2img-preparation',
    )
    assert.equal(context.documentId, actual.originalPrepared.documentId)
    assert.equal(context.documentRevision, actual.originalPrepared.documentRevision)
    assert.deepEqual(context.bbox, {
      x: mode === 'outpaint' ? 64 : 0,
      y: 0,
      width: 256,
      height: 256,
    })
    assert.deepEqual(context.prompts, { positive, negative })
    assert.deepEqual(workerJob.prompts, { positive, negative })
    assert.deepEqual(context.embeddingRefs, { positive: [ref], negative: [ref] })
    assert.deepEqual(context.embeddings, effective)
    assert.equal('embeddingPool' in frozen, false)
    assert.equal('embeddingPool' in context, false)
    if (positiveActive || negativeActive) {
      assert.deepEqual(workerJob.embeddings, {
        positive: positiveActive ? [wireDescriptor] : [],
        negative: negativeActive ? [wireDescriptor] : [],
      })
    } else {
      assert.equal(Object.hasOwn(workerJob, 'embeddings'), false)
    }
    assert.equal(context.sampling.seed, 0)
    assert.equal(workerJob.sampling.seed, 0)
    assert.equal(context.sampling.requestedSeedPolicy, 'fixed')
    assert.equal(context.sampling.seedBehavior, 'per-iteration')
    assert.equal(workerJob.checkpoint.predictionType, objective)
    assert.equal(workerJob.sampling.noiseProfile.rescaleBetasZeroSnr, objective === 'v_prediction')
    assert.equal(workerJob.sampling.denoisingStrength, 0.5)
    assert.equal(workerJob.loras[0].weight, -0.5)
    assert.equal(workerJob.target.sha256, actual.sourceIdentity.sha256)
    assert.equal(workerJob.target.byteSize, actual.sourceIdentity.byteSize)
    assert.deepEqual(context.target, actual.originalPrepared.target)
    if (mode === 'outpaint')
      assert.deepEqual(context.conditioning, actual.originalPrepared.conditioning)
    const candidate = actual.candidates[index]
    assert.equal(candidate.queueItemId, row.id)
    assert.equal(candidate.frozenPayloadJson, row.frozen_payload_json)
    assert.equal(candidate.frozenPayloadSha256, digest(row.frozen_payload_json))
    assert.equal(candidate.actualSeed, 0)
    assert.equal(candidate.image.sha256, actual.outputIdentity.sha256)
    assert.equal(candidate.image.byteSize, actual.outputIdentity.byteSize)
    const receipt = actual.receipts[index]
    assert.equal(receipt.queue_item_id, row.id)
    assert.equal(receipt.candidate_id, row.id)
    assert.equal(receipt.frozen_payload_sha256, digest(row.frozen_payload_json))
    assert.equal(receipt.actual_seed, 0)
    assert.equal(receipt.status, 'completed')
    assert.equal(actual.completedRows[index].id, row.id)
    assert.equal(actual.completedRows[index].status, 'completed')
    assert.equal(actual.completedRows[index].frozen_payload_json, row.frozen_payload_json)
    assert.equal(actual.capacityChecks[0].entries[index].queueItemId, row.id)
    assert.equal(actual.capacityChecks[0].entries[index].frozenPayloadJson, row.frozen_payload_json)
    const config = actual.configs[index]
    assert.deepEqual(config.positivePrompt, { text: positive, embeddingRefs: refs.positive })
    assert.deepEqual(config.negativePrompt, { text: negative, embeddingRefs: refs.negative })
    assert.equal(config.mode, mode)
    assert.equal(config.sampling.actualSeed, 0)
    assert.equal(config.sampling.requestedSeedPolicy, 'fixed')
    assert.equal(config.sampling.seedBehavior, 'per-iteration')
    assert.equal(config.model.predictionType, objective)
    const serialized = JSON.stringify(actual.provenance[index])
    for (const forbidden of [
      'managedPath',
      'embeddingPool',
      'igs_ti_private_',
      reference.embeddingTrained.installed.managedPath,
      'late ordinary',
      'Late caller metadata',
    ])
      assert.equal(
        serialized.includes(forbidden),
        false,
        `${forbidden} is outside accepted provenance`,
      )
  }
}

// Boundary: actual preparation + image orchestrator expansion + SQLite/staging/provenance.
// Invariant: each concrete pair owns exactly its active signed resources; ordinary wire omits them.
// Neighbor: concrete both-active changes only source text; all authored refs are already effective.
// Semantic fault: in effectiveGenerationEmbeddings replace activePromptEmbeddingRefs(...) with
// refs[polarity]. Eight baseline/prefix tests must go RED; four both-active controls remain GREEN.
// Production frozen agreement may refuse before publication: that is causal admission sensitivity,
// not installed numerical/pixel evidence. Root runs the protected source fault and restoration.
for (const objective of ['epsilon', 'v_prediction'])
  for (const mode of ['img2img', 'outpaint']) {
    for (const stage of ['baseline', 'prefix'])
      test(`${objective}/${mode}: actual Main ${stage} signed dynamic embedding subsets survive caller edits and real staging`, async () => {
        const reference = installedFixture()
        let actual
        await assert.doesNotReject(async () => {
          actual = await produced(reference, stage, objective, mode)
        }, 'Actual image expansion must admit and stage every valid concrete subset.')
        assertActualBatch(
          actual,
          reference,
          objective,
          mode,
          stage === 'baseline' ? fourPairs : fourPairs.slice(0, 2),
          stage === 'prefix',
        )
      })

    test(`${objective}/${mode}: actual Main all-active signed embedding neighbor survives identical caller edits and real staging`, async () => {
      const reference = installedFixture()
      const actual = await produced(reference, 'baseline', objective, mode, { allActive: true })
      assertActualBatch(actual, reference, objective, mode, [fourPairs[3]], false)
    })
  }
