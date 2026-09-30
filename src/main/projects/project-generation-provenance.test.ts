import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import type { VerifiedGenerationCandidate } from './generation-staging.js'

import { provenanceFromVerifiedRasterCandidate } from './project-generation-provenance.js'
import { localProjectRecoveryKey } from './project-identity.js'

const PNG_PATH = path.resolve('src/main/projects/placeholders/empty.png')
const PROJECT_PATH = '/private/projects/portrait.igs'
const MODEL_PATH = '/private/models/illustrious.safetensors'
const bbox = { height: 512, width: 512, x: -24, y: 48 }

function sha256(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

async function fixture(): Promise<{
  candidate: VerifiedGenerationCandidate
  imagePngBytes: Buffer
}> {
  const imagePngBytes = await readFile(PNG_PATH)
  const documentId = randomUUID()
  const documentRevision = randomUUID()
  const queueItemId = randomUUID()
  const targetBytes = Buffer.from('frozen source target')
  const reference = {
    baseModelFamily: 'illustrious',
    civitaiFileId: 30,
    civitaiModelId: 10,
    civitaiVersionId: 20,
    displayName: 'Portrait checkpoint',
    fileSha256: sha256(Buffer.from('checkpoint')),
    kind: 'checkpoint',
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: 'v_prediction',
    versionName: 'v1',
  }
  const prompts = { negative: 'blur', positive: 'blue lantern' }
  const sampling = {
    cfgScale: 7,
    invokeScheduler: 'dpmpp_2m_k',
    requestedSeedPolicy: 'random',
    sampler: 'DPM++ 2M',
    scheduler: 'Karras',
    seed: 42,
    steps: 24,
  }
  const target = {
    byteSize: targetBytes.length,
    colorSpace: 'srgb',
    format: 'png',
    height: bbox.height,
    iccSha256: IGS_SRGB_ICC_SHA256,
    sha256: sha256(targetBytes),
    width: bbox.width,
  }
  const payload = {
    context: {
      bbox,
      documentId,
      documentRevision,
      kind: 'normal-txt2img-preparation',
      model: { managedPath: MODEL_PATH, reference },
      prompts,
      sampling,
      schemaVersion: 1,
      target,
    },
    kind: 'illustrious-txt2img',
    originRequestId: randomUUID(),
    schemaVersion: 1,
    workerJob: {
      bbox,
      checkpoint: {
        path: MODEL_PATH,
        predictionType: reference.predictionType,
        sha256: reference.fileSha256,
      },
      prompts,
      sampling: {
        cfgScale: sampling.cfgScale,
        scheduler: sampling.invokeScheduler,
        seed: sampling.seed,
        steps: sampling.steps,
      },
      schemaVersion: 1,
      target: {
        byteSize: target.byteSize,
        height: target.height,
        iccSha256: target.iccSha256,
        sha256: target.sha256,
        width: target.width,
      },
    },
  }
  const frozenPayloadJson = JSON.stringify(payload)
  const candidate: VerifiedGenerationCandidate = {
    actualSeed: sampling.seed,
    assetPath: '/private/recovery/result.png',
    bbox: { ...bbox },
    candidateId: queueItemId,
    completedAt: '2026-09-29T12:00:00.000Z',
    completionOrder: 1,
    documentId,
    documentRevision,
    frozenPayloadJson,
    frozenPayloadSha256: sha256(frozenPayloadJson),
    image: {
      byteSize: imagePngBytes.length,
      height: bbox.height,
      iccSha256: IGS_SRGB_ICC_SHA256,
      sha256: sha256(imagePngBytes),
      width: bbox.width,
    },
    localProjectKey: localProjectRecoveryKey(PROJECT_PATH),
    projectPath: PROJECT_PATH,
    queueItemId,
    stagingSessionId: randomUUID(),
  }
  return { candidate, imagePngBytes }
}

function replacePayload(
  candidate: VerifiedGenerationCandidate,
  edit: (payload: Record<string, unknown>) => void,
): void {
  const payload = JSON.parse(candidate.frozenPayloadJson) as Record<string, unknown>
  edit(payload)
  candidate.frozenPayloadJson = JSON.stringify(payload)
  candidate.frozenPayloadSha256 = sha256(candidate.frozenPayloadJson)
}

test('accepted Raster provenance projects the real frozen payload and verified PNG without private paths', async () => {
  const { candidate, imagePngBytes } = await fixture()
  const acceptedAt = '2026-09-29T13:00:00.000Z'
  const provenance = provenanceFromVerifiedRasterCandidate({
    acceptedAt,
    candidate,
    imagePngBytes,
  })

  assert.equal(provenance.generationConfiguration.model.predictionType, 'v_prediction')
  assert.deepEqual(provenance.generationConfiguration.positivePrompt, {
    embeddingRefs: [],
    text: 'blue lantern',
  })
  assert.equal(provenance.generationConfiguration.sampling.actualSeed, 42)
  assert.equal(provenance.generationConfiguration.sampling.requestedSeedPolicy, 'random')
  assert.equal(provenance.generationConfiguration.sampling.invokeScheduler, 'dpmpp_2m_k')
  assert.deepEqual(provenance.layerSourceContext.bbox, bbox)
  assert.equal(
    provenance.layerSourceContext.sourceTargetSha256,
    (JSON.parse(candidate.frozenPayloadJson) as { context: { target: { sha256: string } } }).context
      .target.sha256,
  )
  assert.equal(provenance.executionResultContext.output.sha256, sha256(imagePngBytes))
  assert.equal(provenance.executionResultContext.output.byteSize, imagePngBytes.length)
  assert.equal(provenance.executionResultContext.acceptedAt, acceptedAt)
  const serialized = JSON.stringify(provenance)
  assert.equal(serialized.includes(MODEL_PATH), false)
  assert.equal(serialized.includes(candidate.assetPath), false)
  assert.equal(serialized.includes(candidate.projectPath), false)
  assert.equal(serialized.includes('workerJob'), false)
  assert.equal(serialized.includes('regional'), false)

  candidate.bbox.x = 100
  assert.deepEqual(provenance.layerSourceContext.bbox, bbox)
})

test('source identity and full bbox must still match the frozen Project', async () => {
  const { candidate, imagePngBytes } = await fixture()
  const changes: [string, (next: VerifiedGenerationCandidate) => void][] = [
    [
      'queue identity',
      (next) => {
        next.queueItemId = randomUUID()
      },
    ],
    [
      'document identity',
      (next) => {
        next.documentId = randomUUID()
      },
    ],
    [
      'document revision',
      (next) => {
        next.documentRevision = randomUUID()
      },
    ],
    [
      'bbox position',
      (next) => {
        next.bbox.x += 8
      },
    ],
    [
      'bbox size',
      (next) => {
        next.bbox.width -= 8
      },
    ],
    [
      'local project identity',
      (next) => {
        next.localProjectKey = `project-v1-${'a'.repeat(64)}`
      },
    ],
  ]
  for (const [label, edit] of changes) {
    const changed = structuredClone(candidate)
    edit(changed)
    assert.throws(
      () =>
        provenanceFromVerifiedRasterCandidate({
          acceptedAt: '2026-09-29T13:00:00.000Z',
          candidate: changed,
          imagePngBytes,
        }),
      { code: 'PROVENANCE_SOURCE_CHANGED' },
      label,
    )
  }
})

test('frozen payload hash, strict fields and context-worker agreement are required', async () => {
  const { candidate, imagePngBytes } = await fixture()
  const map = (entry: VerifiedGenerationCandidate) =>
    provenanceFromVerifiedRasterCandidate({
      acceptedAt: '2026-09-29T13:00:00.000Z',
      candidate: entry,
      imagePngBytes,
    })

  const changedHash = structuredClone(candidate)
  changedHash.frozenPayloadJson += ' '
  assert.throws(() => map(changedHash), { code: 'PROVENANCE_INPUT_INVALID' })

  const regional = structuredClone(candidate)
  replacePayload(regional, (payload) => {
    payload.regionalGuidance = ['private mask']
  })
  assert.throws(() => map(regional), { code: 'PROVENANCE_INPUT_INVALID' })

  const workerMismatch = structuredClone(candidate)
  replacePayload(workerMismatch, (payload) => {
    const workerJob = payload.workerJob as { sampling: { seed: number } }
    workerJob.sampling.seed = 43
  })
  assert.throws(() => map(workerMismatch), { code: 'PROVENANCE_INPUT_INVALID' })
})

test('valid reported seeds are preserved and invalid seeds or changed output are refused', async () => {
  const { candidate, imagePngBytes } = await fixture()
  const map = (entry: VerifiedGenerationCandidate, bytes = imagePngBytes) =>
    provenanceFromVerifiedRasterCandidate({
      acceptedAt: '2026-09-29T13:00:00.000Z',
      candidate: entry,
      imagePngBytes: bytes,
    })

  for (const actualSeed of [0, 43, 0xff_ff_ff_ff]) {
    const reported = structuredClone(candidate)
    reported.actualSeed = actualSeed
    assert.equal(map(reported).generationConfiguration.sampling.actualSeed, actualSeed)
    assert.equal(JSON.parse(reported.frozenPayloadJson).context.sampling.seed, 42)
  }
  for (const actualSeed of [-1, 0x1_00_00_00_00, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const invalid = structuredClone(candidate)
    invalid.actualSeed = actualSeed
    assert.throws(() => map(invalid), { code: 'PROVENANCE_INPUT_INVALID' })
  }

  const sameSizeChangedBytes = Buffer.from(imagePngBytes)
  sameSizeChangedBytes[0] ^= 1
  assert.throws(() => map(candidate, sameSizeChangedBytes), { code: 'PROVENANCE_OUTPUT_CHANGED' })
  assert.throws(() => map(candidate, imagePngBytes.subarray(1)), {
    code: 'PROVENANCE_OUTPUT_CHANGED',
  })

  const wrongProfile = structuredClone(candidate)
  wrongProfile.image.iccSha256 = 'a'.repeat(64)
  assert.throws(() => map(wrongProfile), { code: 'PROVENANCE_OUTPUT_CHANGED' })

  const wrongSize = structuredClone(candidate)
  wrongSize.image.height -= 8
  assert.throws(() => map(wrongSize), { code: 'PROVENANCE_OUTPUT_CHANGED' })
})

test('noncanonical completion and acceptance times do not enter immutable provenance', async () => {
  const { candidate, imagePngBytes } = await fixture()
  const noncanonicalCompletion = structuredClone(candidate)
  noncanonicalCompletion.completedAt = '2026-09-29T12:00:00Z'
  assert.throws(
    () =>
      provenanceFromVerifiedRasterCandidate({
        acceptedAt: '2026-09-29T13:00:00.000Z',
        candidate: noncanonicalCompletion,
        imagePngBytes,
      }),
    { code: 'PROVENANCE_INPUT_INVALID' },
  )
  assert.throws(
    () =>
      provenanceFromVerifiedRasterCandidate({
        acceptedAt: 'tomorrow',
        candidate,
        imagePngBytes,
      }),
    { code: 'PROVENANCE_INPUT_INVALID' },
  )
})

test('accepted provenance retains planned seed behavior while legacy results remain unspecified', async () => {
  const { candidate, imagePngBytes } = await fixture()
  const legacy = provenanceFromVerifiedRasterCandidate({
    acceptedAt: '2026-09-29T12:01:00.000Z',
    candidate,
    imagePngBytes,
  })
  assert.equal(legacy.generationConfiguration.sampling.seedBehavior, undefined)
  for (const behavior of ['per-iteration', 'per-prompt'] as const) {
    const payload = JSON.parse(candidate.frozenPayloadJson)
    payload.context.sampling.seedBehavior = behavior
    const frozenPayloadJson = JSON.stringify(payload)
    const planned = {
      ...candidate,
      frozenPayloadJson,
      frozenPayloadSha256: sha256(frozenPayloadJson),
    }
    const provenance = provenanceFromVerifiedRasterCandidate({
      acceptedAt: '2026-09-29T12:01:00.000Z',
      candidate: planned,
      imagePngBytes,
    })
    assert.equal(provenance.generationConfiguration.sampling.seedBehavior, behavior)
  }
})
