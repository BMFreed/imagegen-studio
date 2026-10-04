import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import type { VerifiedGenerationCandidate } from './generation-staging.js'
import type { FrozenNormalTxt2ImgPreparationV1 } from './project-generation-preparation.js'

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

test('accepted CFG Rescale is projected from frozen inputs including zero without inventing legacy values', async () => {
  const { candidate, imagePngBytes } = await fixture()
  const map = (candidate: VerifiedGenerationCandidate) =>
    provenanceFromVerifiedRasterCandidate({
      acceptedAt: '2026-09-29T12:01:00.000Z',
      candidate,
      imagePngBytes,
    })
  assert.equal(Object.hasOwn(map(candidate).generationConfiguration, 'cfgRescale'), false)
  for (const cfgRescale of [0, 0.3, 0.99]) {
    const recorded = structuredClone(candidate)
    replacePayload(recorded, (payload) => {
      const frozen = payload as {
        context: { sampling: Record<string, unknown> }
        workerJob: { sampling: Record<string, unknown> }
      }
      frozen.context.sampling.cfgRescale = cfgRescale
      frozen.workerJob.sampling.cfgRescale = cfgRescale
    })
    const provenance = map(recorded)
    assert.equal(Object.hasOwn(provenance.generationConfiguration, 'cfgRescale'), true)
    assert.equal(provenance.generationConfiguration.cfgRescale, cfgRescale)
    const mismatch = structuredClone(recorded)
    replacePayload(mismatch, (payload) => {
      const workerJob = payload.workerJob as { sampling: { cfgRescale?: number } }
      workerJob.sampling.cfgRescale = cfgRescale === 0.3 ? 0.4 : 0.3
    })
    assert.throws(() => map(mismatch), { code: 'PROVENANCE_INPUT_INVALID' })
  }
  const neutralLegacyTransport = structuredClone(candidate)
  replacePayload(neutralLegacyTransport, (payload) => {
    const context = payload.context as { sampling: { cfgRescale?: number } }
    context.sampling.cfgRescale = 0
  })
  assert.equal(map(neutralLegacyTransport).generationConfiguration.cfgRescale, 0)
})

test('accepted VAE Precision records frozen policies without inventing legacy or accepting crossed wire values', async () => {
  const { candidate, imagePngBytes } = await fixture()
  const map = (entry: VerifiedGenerationCandidate) =>
    provenanceFromVerifiedRasterCandidate({
      acceptedAt: '2026-10-04T12:01:00.000Z',
      candidate: entry,
      imagePngBytes,
    })
  assert.equal(Object.hasOwn(map(candidate).generationConfiguration, 'vaePrecision'), false)
  for (const precision of ['Auto', 'FP16', 'FP32'] as const) {
    const recorded = structuredClone(candidate)
    replacePayload(recorded, (payload) => {
      Object.assign(payload.context as Record<string, unknown>, { vaePrecision: precision })
      Object.assign(payload.workerJob as Record<string, unknown>, { vaePrecision: precision })
    })
    assert.equal(map(recorded).generationConfiguration.vaePrecision, precision)
    for (const wire of [undefined, precision === 'FP32' ? 'FP16' : 'FP32', null, 'BF16']) {
      const crossed = structuredClone(recorded)
      replacePayload(crossed, (payload) => {
        Object.assign(payload.workerJob as Record<string, unknown>, { vaePrecision: wire })
      })
      assert.throws(() => map(crossed), { code: 'PROVENANCE_INPUT_INVALID' })
    }
  }
})

test('accepted VAE is copied from strict frozen context, with known Embedded distinct from legacy absence', async () => {
  const { candidate, imagePngBytes } = await fixture()
  const map = (entry: VerifiedGenerationCandidate) =>
    provenanceFromVerifiedRasterCandidate({
      acceptedAt: '2026-10-04T12:01:00.000Z',
      candidate: entry,
      imagePngBytes,
    })
  assert.equal(Object.hasOwn(map(candidate).generationConfiguration, 'vae'), false)
  const embedded = structuredClone(candidate)
  replacePayload(embedded, (payload) => {
    Object.assign(payload.context as object, { vae: null })
    Object.assign(payload.workerJob as object, { vae: null })
  })
  assert.equal(Object.hasOwn(map(embedded).generationConfiguration, 'vae'), true)
  assert.equal(map(embedded).generationConfiguration.vae, null)
  const external = structuredClone(candidate)
  let reference: NonNullable<FrozenNormalTxt2ImgPreparationV1['vae']>['reference']
  replacePayload(external, (payload) => {
    const context = payload.context as FrozenNormalTxt2ImgPreparationV1
    reference = {
      ...context.model.reference,
      civitaiFileId: 103,
      civitaiModelId: 101,
      civitaiVersionId: 102,
      displayName: 'Frozen external VAE',
      fileSha256: 'b'.repeat(64),
      kind: 'vae',
      localModelId: randomUUID(),
      localVersionId: randomUUID(),
      predictionType: null,
      versionName: 'Exact v2',
    }
    context.vae = {
      byteSize: 256,
      managedPath: '/private/models/external-vae.safetensors',
      reference,
    }
    Object.assign(payload.workerJob as object, {
      vae: { byteSize: 256, path: context.vae.managedPath, sha256: reference.fileSha256 },
    })
  })
  const provenance = map(external)
  assert.deepEqual(provenance.generationConfiguration.vae, reference!)
  assert.equal(JSON.stringify(provenance).includes('/private'), false)
  replacePayload(external, (payload) => {
    const context = payload.context as FrozenNormalTxt2ImgPreparationV1
    context.vae!.reference.displayName = 'Later metadata'
  })
  assert.equal(provenance.generationConfiguration.vae?.displayName, 'Frozen external VAE')
  for (const change of [
    { byteSize: 257 },
    { path: '/private/models/other.safetensors' },
    { sha256: 'c'.repeat(64) },
  ]) {
    const crossed = structuredClone(external)
    replacePayload(crossed, (payload) => {
      Object.assign((payload.workerJob as { vae: object }).vae, change)
    })
    assert.throws(() => map(crossed), { code: 'PROVENANCE_INPUT_INVALID' }, JSON.stringify(change))
  }
  for (const wire of [null, undefined]) {
    const crossed = structuredClone(external)
    replacePayload(crossed, (payload) => {
      Object.assign(payload.workerJob as object, { vae: wire })
    })
    assert.throws(() => map(crossed), { code: 'PROVENANCE_INPUT_INVALID' })
  }
  const img2img = structuredClone(external)
  replacePayload(img2img, (payload) => {
    payload.kind = 'illustrious-img2img'
    const context = payload.context as Record<string, unknown>
    context.kind = 'normal-img2img-preparation'
    Object.assign(context.sampling as object, { denoisingStrength: 0 })
    Object.assign((payload.workerJob as { sampling: object }).sampling, { denoisingStrength: 0 })
  })
  assert.equal(map(img2img).generationConfiguration.vae?.fileSha256, reference!.fileSha256)
})

test('img2img provenance records actual strength including zero and rejects crossed or missing durable values', async () => {
  const { candidate, imagePngBytes } = await fixture()
  const map = (entry: VerifiedGenerationCandidate) =>
    provenanceFromVerifiedRasterCandidate({
      acceptedAt: '2026-10-02T00:00:00.000Z',
      candidate: entry,
      imagePngBytes,
    })
  assert.equal(map(candidate).generationConfiguration.mode, 'txt2img')
  assert.equal('denoisingStrength' in map(candidate).generationConfiguration.sampling, false)
  for (const denoisingStrength of [0, 0.65, 1]) {
    const img = structuredClone(candidate)
    replacePayload(img, (raw) => {
      const payload = raw as unknown as {
        context: { kind: string; sampling: Record<string, unknown> }
        kind: string
        workerJob: { sampling: Record<string, unknown> }
      }
      payload.kind = 'illustrious-img2img'
      payload.context.kind = 'normal-img2img-preparation'
      payload.context.sampling.denoisingStrength = denoisingStrength
      payload.workerJob.sampling.denoisingStrength = denoisingStrength
    })
    const provenance = map(img)
    assert.equal(provenance.kind, 'illustrious-img2img')
    if (provenance.kind !== 'illustrious-img2img') {
      assert.fail('wrong portable kind')
    }
    assert.equal(provenance.generationConfiguration.sampling.denoisingStrength, denoisingStrength)
    assert.equal(
      provenance.layerSourceContext.sourceTargetSha256,
      map(candidate).layerSourceContext.sourceTargetSha256,
    )
    for (const workerStrength of [undefined, denoisingStrength === 0.65 ? 0.4 : 0.65, -0.1, 1.1]) {
      const invalid = structuredClone(img)
      replacePayload(invalid, (raw) => {
        const payload = raw as unknown as { workerJob: { sampling: Record<string, unknown> } }
        if (workerStrength === undefined) {
          delete payload.workerJob.sampling.denoisingStrength
        } else {
          payload.workerJob.sampling.denoisingStrength = workerStrength
        }
      })
      assert.throws(() => map(invalid), { code: 'PROVENANCE_INPUT_INVALID' })
    }
  }
})

test('portable LoRA provenance distinguishes legacy unknown from recorded empty and refuses crossed frozen weights', async () => {
  const { candidate, imagePngBytes } = await fixture()
  const map = (candidate: VerifiedGenerationCandidate) =>
    provenanceFromVerifiedRasterCandidate({
      acceptedAt: '2026-09-29T12:01:00.000Z',
      candidate,
      imagePngBytes,
    })
  assert.equal(Object.hasOwn(map(candidate).generationConfiguration, 'loras'), false)
  const empty = structuredClone(candidate)
  replacePayload(empty, (payload) => {
    Object.assign(payload.context as object, { loras: [], loraStack: [] })
    Object.assign(payload.workerJob as object, { loras: [] })
  })
  assert.deepEqual(map(empty).generationConfiguration.loras, [])
  const recorded = structuredClone(candidate)
  replacePayload(recorded, (payload) => {
    const context = payload.context as FrozenNormalTxt2ImgPreparationV1
    const checkpoint = context.model.reference
    const resource = { ...checkpoint, kind: 'lora' as const, predictionType: null }
    context.loraStack = [
      { enabled: true, resource, weight: 0 },
      {
        enabled: false,
        resource: {
          ...resource,
          baseModelFamily: null,
          civitaiModelId: 999,
          localModelId: 'portable disabled missing model',
          localVersionId: 'portable missing version',
        },
        weight: -0.5,
      },
    ]
    context.loras = [
      {
        byteSize: 32,
        managedPath: '/private/models/lora.safetensors',
        reference: resource,
        weight: 0,
      },
    ]
    Object.assign(payload.workerJob as object, {
      loras: [
        {
          byteSize: 32,
          path: '/private/models/lora.safetensors',
          sha256: resource.fileSha256,
          weight: 0,
        },
      ],
    })
  })
  const provenance = map(recorded)
  assert.deepEqual(
    provenance.generationConfiguration.loras?.map((entry) => [entry.enabled, entry.weight]),
    [
      [true, 0],
      [false, -0.5],
    ],
  )
  assert.equal(
    provenance.generationConfiguration.loras?.[1]?.resource.localModelId,
    'portable disabled missing model',
  )
  assert.equal(JSON.stringify(provenance).includes('/private/models/lora.safetensors'), false)
  const crossed = structuredClone(recorded)
  replacePayload(crossed, (payload) => {
    ;(payload.workerJob as { loras: { weight: number }[] }).loras[0].weight = 0.9
  })
  assert.throws(() => map(crossed), { code: 'PROVENANCE_INPUT_INVALID' })
})
