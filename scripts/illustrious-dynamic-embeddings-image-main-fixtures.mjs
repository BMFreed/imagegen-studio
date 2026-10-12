/**
 * Real Main image preparation/expansion → SQLite/private inputs → staging publication/read →
 * accepted-provenance projection. Exact resource resolvers, Project/index ownership and output
 * pixels are controlled preconditions. No installed weights, ML, Project Add/Undo or Save claim.
 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  installedFixture as imageFixture,
  resource,
} from './illustrious-dynamic-image-test-fixtures.mjs'
import { openAppDatabase } from '../src/main/db/database.ts'
import { GenerationOrchestrator } from '../src/main/projects/generation-orchestrator.ts'
import { GenerationQueueRepository } from '../src/main/projects/generation-queue.ts'
import { GenerationStagingRepository } from '../src/main/projects/generation-staging.ts'
import {
  prepareNormalGeneration,
  prepareNormalOutpaintGeneration,
} from '../src/main/projects/project-generation-preparation.ts'
import { localProjectRecoveryKey } from '../src/main/projects/project-identity.ts'
import { provenanceFromVerifiedRasterCandidate } from '../src/main/projects/project-generation-provenance.ts'
import { acceptedOutputPngFixture } from '../src/main/projects/test-fixtures/accepted-provenance.ts'
import { outpaintPngFromAlpha } from '../src/main/projects/test-fixtures/outpaint-contribution.ts'
import { IGS_SRGB_ICC_SHA256 } from '../src/shared/projects/color-profile.ts'
import { createEmptyProjectDocumentV1 } from '../src/shared/projects/project-schema.ts'

export { resource }

const token = '<illustriousphoto>'
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const ready = {
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

/** Metadata precondition, never a downloaded/verified/trained file assertion. */
export function installedFixture() {
  const fixture = imageFixture()
  return {
    ...fixture,
    embeddingTrained: {
      byteSize: 49736,
      sha256: '91a95b244b8ba01d905d32ced7e3cc20eb74b4da8f519de3764505500d386c36',
      type: 'embedding',
      family: 'illustrious',
      name: 'IllustriousPhoto Embedding',
      versionName: 'WAIv15 1152steps',
      path: path.join(fixture.appData, 'sources', 'illustriousphoto.safetensors'),
      origin: {
        kind: 'civitai-trained',
        modelId: 2360940,
        versionId: 2655289,
        fileId: 2542976,
        url: 'https://civitai.com/api/download/models/2655289?fileId=2542976',
        creator: 'CautionMergeAhead',
        creditRequired: true,
      },
      installed: {
        resourceId: randomUUID(),
        versionId: randomUUID(),
        managedPath: path.join(fixture.appData, 'models', 'qualified-700100.safetensors'),
      },
    },
  }
}

/** Authored source templates are handwritten; no oracle or planner expands them for this input. */
export function authoring(reference, stage, objective, mode) {
  assert.ok(['baseline', 'prefix'].includes(stage))
  assert.ok(['epsilon', 'v_prediction'].includes(objective))
  assert.ok(['img2img', 'outpaint'].includes(mode))
  const ref = { resource: resource(reference, 'embeddingTrained'), token }
  return {
    seed: { policy: 'fixed', value: 0 },
    dynamicPrompt: { maxPrompts: stage === 'baseline' ? 4 : 2, seedBehavior: 'per-iteration' },
    sampling: {
      steps: 3,
      cfgScale: 5,
      sampler: objective === 'epsilon' ? 'Euler a' : 'Euler',
      scheduler: 'Normal',
      denoisingStrength: 0.5,
    },
    model: resource(reference, objective === 'epsilon' ? 'illustriousEpsilon' : 'illustrious'),
    vae: resource(reference, 'externalVaeNative'),
    vaePrecision: 'FP32',
    cfgRescale: 0,
    loras: [{ enabled: true, resource: resource(reference, 'illustriousLora'), weight: -0.5 }],
    positivePrompt: {
      text: '{a ceramic cup on a wooden table, studio photograph|a ceramic cup on a wooden table, studio photograph, (<illustriousphoto>:1.3)}',
      embeddingRefs: [structuredClone(ref)],
    },
    negativePrompt: {
      text: '{low quality|low quality, (<illustriousphoto>:0.7)}',
      embeddingRefs: [structuredClone(ref)],
    },
  }
}

function sourceAlpha() {
  const alpha = Buffer.alloc(256 * 256)
  for (let row = 0; row < 256; row++) alpha.fill(255, row * 256, row * 256 + 192)
  return alpha
}

/** Literal output-alpha precondition. Production independently verifies it from actual source. */
function contributionAlpha() {
  const alpha = Buffer.alloc(256 * 256)
  for (let row = 0; row < 256; row++) {
    alpha.set(
      [0, 5, 12, 23, 36, 52, 70, 89, 109, 130, 151, 172, 193, 212, 230, 247],
      row * 256 + 152,
    )
    alpha.fill(255, row * 256 + 168, (row + 1) * 256)
  }
  return alpha
}

function controlledResourceResolvers(reference, objective, bindingChecks) {
  const component = (key) => ({
    byteSize: reference[key].byteSize,
    managedPath: reference[key].installed.managedPath,
    reference: resource(reference, key),
  })
  return {
    // Missing/unbound catalog diagnostics are outside this subject. Record what real preparation
    // and expansion pass to that collaborator; do not compute or repair an effective subset here.
    assertNoUnboundGenerationEmbeddings: async (input) => {
      assert.equal(input.modelFamily, 'illustrious')
      bindingChecks.push(structuredClone(input))
    },
    resolveVerifiedGenerationCheckpointForPlan: async (selected) => {
      const key = objective === 'epsilon' ? 'illustriousEpsilon' : 'illustrious'
      assert.deepEqual(selected, resource(reference, key))
      return {
        managedPath: reference[key].installed.managedPath,
        reference: resource(reference, key),
        noiseProfile: {
          schemaVersion: 1,
          baseSchedule: 'sdxl-scaled-linear-v1',
          rescaleBetasZeroSnr: objective === 'v_prediction',
          timestepSpacing: 'leading',
        },
      }
    },
    resolveVerifiedGenerationLoraForPlan: async (selected) => {
      assert.deepEqual(selected, resource(reference, 'illustriousLora'))
      return component('illustriousLora')
    },
    resolveVerifiedGenerationVaeForPlan: async (selected) => {
      assert.deepEqual(selected, resource(reference, 'externalVaeNative'))
      return component('externalVaeNative')
    },
    resolveVerifiedGenerationEmbeddingForPlan: async (selected) => {
      assert.deepEqual(selected, resource(reference, 'embeddingTrained'))
      return component('embeddingTrained')
    },
    resolveVerifiedGenerationAnimaBundleForPlan: async () => assert.fail('No Anima input.'),
    resolveVerifiedAnimaGenerationLoraForPlan: async () => assert.fail('No Anima LoRA input.'),
  }
}

/**
 * Actual handwritten templates enter production preparation and orchestrator expansion. Staging
 * owns real receipts, candidate files, verification and cursor; accepted settings use its bytes.
 * `allActive` changes only source text to the concrete both-active neighboring pair. Everything
 * else, including two full refs, resource policy and late retained-caller mutation, stays equal.
 */
export async function produced(reference, stage, objective, mode, options = {}) {
  const document = createEmptyProjectDocumentV1({ title: 'Image embedding Main boundary' })
  document.primaryBbox = { x: mode === 'outpaint' ? 64 : 0, y: 0, width: 256, height: 256 }
  document.generationDraft = authoring(reference, stage, objective, mode)
  if (options.allActive === true) {
    document.generationDraft.positivePrompt.text =
      'a ceramic cup on a wooden table, studio photograph, (<illustriousphoto>:1.3)'
    document.generationDraft.negativePrompt.text = 'low quality, (<illustriousphoto>:0.7)'
  }
  const authoredDraft = structuredClone(document.generationDraft)
  const sourceBytes =
    mode === 'outpaint'
      ? await outpaintPngFromAlpha(sourceAlpha(), 256, 256)
      : await acceptedOutputPngFixture(256, 256)
  const target = {
    bbox: { ...document.primaryBbox },
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    generationDraft: document.generationDraft,
    lastActualSeedSnapshot: null,
    mode,
    composite: {
      bytes: Buffer.from(sourceBytes),
      byteSize: sourceBytes.length,
      colorSpace: 'srgb',
      height: 256,
      width: 256,
      iccSha256: IGS_SRGB_ICC_SHA256,
      sha256: digest(sourceBytes),
    },
  }
  const bindingChecks = []
  const models = controlledResourceResolvers(reference, objective, bindingChecks)
  const prepared = await (
    mode === 'outpaint' ? prepareNormalOutpaintGeneration : prepareNormalGeneration
  )({
    target,
    modelService: models,
    randomUint32: () => assert.fail('A Fixed0 preparation must never draw a Random seed.'),
  })
  const originalPrepared = structuredClone(prepared.context)
  const batch = {
    iterations: 1,
    maxPrompts: authoredDraft.dynamicPrompt.maxPrompts,
    seedBehavior: 'per-iteration',
  }
  const temporary = await mkdtemp(path.join(tmpdir(), 'igs-image-embedding-main-'))
  let database
  try {
    database = openAppDatabase(temporary, path.resolve('src/main/db/migrations'))
    const scratch = path.join(temporary, 'scratch')
    await mkdir(scratch, { mode: 0o700 })
    const projectPath = path.join(temporary, 'producer.igs')
    // Only a real canonical identity file is needed by this owner; not a saved portable package.
    const projectIdentityBytes = Buffer.from(
      'Explicit Main queue identity file; not an IGS package',
    )
    await writeFile(projectPath, projectIdentityBytes, { flag: 'wx', mode: 0o600 })
    const tabId = localProjectRecoveryKey(projectPath)
    const queue = new GenerationQueueRepository(database.db, temporary)
    const staging = new GenerationStagingRepository(database.db, temporary)
    await queue.recoverAfterRestart()
    await staging.recoverAfterRestart()
    const capacityChecks = []
    const orchestrator = new GenerationOrchestrator(
      {
        getOpenDocumentId: (id) => (id === tabId ? document.documentId : null),
        getOpenTabs: () => [{ id: tabId }],
        prepareNormalGenerationContext: async () => assert.fail('Prepared batch must not reread.'),
      },
      {
        getProject: async () => ({
          canonicalPath: projectPath,
          documentId: document.documentId,
          fileHealth: 'ready',
          localProjectKey: tabId,
        }),
      },
      models,
      queue,
      {
        assertReadyForPublication: () => staging.assertReadyForPublication(),
        preflightBatchCapacity: async (input) => {
          capacityChecks.push(structuredClone(input))
          await staging.preflightBatchCapacity(input)
        },
      },
      {
        cancelAndWait: async () => assert.fail('No cancellation.'),
        runOne: async () => assert.fail('No native inference.'),
      },
      scratch,
      {
        // Exact identity-only collaborator, not downloaded LaMa bytes or an infill invocation.
        resolveVerifiedOutpaintInfill: async () => ({
          byteSize: 205669692,
          role: 'outpaint-infill',
          sha256: '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9',
          managedPath: path.join(reference.appData, 'inference-resources/big-lama.pt'),
        }),
      },
    )
    let edits = 0
    const admitted = await (
      mode === 'outpaint'
        ? orchestrator.enqueuePreparedOutpaintBatch.bind(orchestrator)
        : orchestrator.enqueuePreparedBatch.bind(orchestrator)
    )(tabId, prepared, batch, { ready: structuredClone(ready) }, async () => {
      // Retained caller inputs change after the owner has captured them, before SQL publication.
      edits++
      document.generationDraft.seed = { policy: 'fixed', value: 37 }
      document.generationDraft.positivePrompt = {
        text: 'late ordinary positive',
        embeddingRefs: [],
      }
      document.generationDraft.negativePrompt = {
        text: 'late ordinary negative',
        embeddingRefs: [],
      }
      document.generationDraft.dynamicPrompt = { maxPrompts: 1, seedBehavior: 'per-prompt' }
      prepared.context.sampling.seed = 37
      prepared.context.prompts = {
        positive: 'late prepared positive',
        negative: 'late prepared negative',
      }
      prepared.context.embeddingRefs = { positive: [], negative: [] }
      prepared.context.embeddings = { positive: [], negative: [] }
      for (const polarity of ['positive', 'negative']) {
        prepared.embeddingPool[polarity][0].token = '<late-caller-change>'
        prepared.embeddingPool[polarity][0].reference.displayName = 'Late caller metadata'
      }
      prepared.targetPngBytes.fill(0)
      target.composite.bytes.fill(0)
      batch.maxPrompts = 1
      batch.seedBehavior = 'per-prompt'
    })
    const rows = []
    const configs = []
    const provenance = []
    const publishedCandidates = []
    const outputBytes =
      mode === 'outpaint' ? await outpaintPngFromAlpha(contributionAlpha(), 256, 256) : sourceBytes
    for (const queued of admitted.items) {
      const row = await database.db
        .selectFrom('generation_queue_item')
        .selectAll()
        .where('id', '=', queued.id)
        .executeTakeFirstOrThrow()
      rows.push(row)
      const verified = await queue.loadVerifiedInput(queued.id)
      assert.ok((await readFile(verified.targetPath)).equals(sourceBytes))
      const claimed = await queue.claimNextPending()
      assert.equal(claimed?.item.id, queued.id)
      const provisionalRoot = await mkdtemp(path.join(scratch, 'illustrious-request-'))
      const outputPath = path.join(provisionalRoot, 'result.png')
      // Known PNGs replace inference, not staging's source/payload/receipt/byte verification.
      await writeFile(outputPath, outputBytes, { flag: 'wx', mode: 0o600 })
      const candidate = await staging.publishGenerationCandidate({
        actualSeed: verified.payload.context.sampling.seed,
        expectedStatusSequence: claimed.item.statusSequence,
        expectedProvisionalRoot: provisionalRoot,
        provisionalOutputPath: outputPath,
        queueItemId: queued.id,
      })
      const candidateBytes = await staging.readVerifiedCandidatePng({
        candidateId: candidate.candidateId,
        imageSha256: candidate.image.sha256,
        localProjectKey: tabId,
        stagingSessionId: candidate.stagingSessionId,
      })
      assert.ok(candidateBytes?.equals(outputBytes))
      const mapped = provenanceFromVerifiedRasterCandidate({
        acceptedAt: '2026-10-12T03:00:00.000Z',
        candidate,
        imagePngBytes: candidateBytes,
      })
      publishedCandidates.push(candidate)
      provenance.push(mapped)
      configs.push(mapped.generationConfiguration)
    }
    const candidates = await staging.listVerifiedCandidates(tabId)
    const receiptRows = await database.db
      .selectFrom('generation_candidate_receipt')
      .selectAll()
      .orderBy('completion_order')
      .execute()
    const completedRows = await database.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .orderBy('created_at')
      .orderBy('id')
      .execute()
    assert.ok((await readFile(projectPath)).equals(projectIdentityBytes))
    return {
      rows,
      configs,
      provenance,
      candidates,
      publishedCandidates,
      receipts: receiptRows,
      completedRows,
      cursor: await staging.readLastActualSeed(tabId, document.documentId),
      plan: admitted.plan,
      preparedSeed: originalPrepared.sampling.seed,
      originalPrepared,
      authoredDraft,
      lateDraft: structuredClone(document.generationDraft),
      latePrepared: structuredClone(prepared.context),
      bindingChecks,
      capacityChecks,
      edits,
      capacityPreflights: capacityChecks.length,
      picks: 0,
      sourceIdentity: {
        sha256: digest(sourceBytes),
        byteSize: sourceBytes.length,
        width: 256,
        height: 256,
        iccSha256: IGS_SRGB_ICC_SHA256,
      },
      outputIdentity: { sha256: digest(outputBytes), byteSize: outputBytes.length },
    }
  } finally {
    await database?.close()
    await rm(temporary, { force: true, recursive: true })
  }
}
