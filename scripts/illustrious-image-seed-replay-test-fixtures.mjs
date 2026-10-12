/** Test preconditions only; actual preparation/admission/provenance are imported production owners. */
import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readdir, readFile, readlink, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { installedFixture, resource } from './illustrious-dynamic-image-test-fixtures.mjs'
import { openAppDatabase } from '../src/main/db/database.ts'
import { GenerationOrchestrator } from '../src/main/projects/generation-orchestrator.ts'
import { GenerationQueueRepository } from '../src/main/projects/generation-queue.ts'
import {
  prepareNormalGeneration,
  prepareNormalOutpaintGeneration,
} from '../src/main/projects/project-generation-preparation.ts'
import { localProjectRecoveryKey } from '../src/main/projects/project-identity.ts'
import { provenanceFromVerifiedRasterCandidate } from '../src/main/projects/project-generation-provenance.ts'
import { acceptedOutputPngFixture } from '../src/main/projects/test-fixtures/accepted-provenance.ts'
import { outpaintPngFromAlpha } from '../src/main/projects/test-fixtures/outpaint-contribution.ts'
import { createEmptyProjectDocumentV1 } from '../src/shared/projects/project-schema.ts'

export { installedFixture, resource }
const root = path.join(homedir(), '.codex/artifacts/imagegen-studio/runs/image-seed-replay-unit')
const digest = (value) => createHash('sha256').update(value).digest('hex')
const icc = '113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1'
export function envelope(
  stage = 'random',
  objective = 'epsilon',
  mode = 'img2img',
  replaySeed = 37,
) {
  return {
    schemaVersion: 1,
    profile: 'illustrious-image-seed-replay',
    stage,
    objective,
    mode,
    referenceFixture: { path: path.join(root, 'reference.json'), sha256: 'a'.repeat(64) },
    workerBaseline: { path: path.join(root, 'worker.json'), sha256: 'b'.repeat(64) },
    artifacts: path.join(root, `${stage}-${objective}-${mode}`),
    sourceImage: {
      path: path.join(root, 'source.png'),
      byteSize: 100,
      sha256: 'c'.repeat(64),
      pixelSha256: 'd'.repeat(64),
    },
    ...(mode === 'outpaint'
      ? {
          lamaSource: {
            path: path.join(root, 'lama.pt'),
            byteSize: 205669692,
            sha256: '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9',
          },
        }
      : {}),
    ...(stage === 'replay'
      ? {
          replaySeed,
          baseline: {
            reportPath: path.join(root, `random-${objective}-${mode}/report.json`),
            reportSha256: 'e'.repeat(64),
          },
        }
      : {}),
    ...(['crash', 'reuse'].includes(stage)
      ? {
          baseSeed: replaySeed,
          baseline: {
            reportPath: path.join(root, `replay-${objective}-${mode}/report.json`),
            reportSha256: 'e'.repeat(64),
          },
          baselineSourceSnapshots: Object.fromEntries(
            [
              'scripts/installed-dynamic-batch-driver.mjs',
              'scripts/illustrious-image-seed-replay-profile.mjs',
              'scripts/illustrious-image-seed-replay-qualification.mjs',
            ].map((source, index) => [
              source,
              {
                path: path.join(root, 'baseline-harness-sources', path.basename(source)),
                sha256: String(index + 1).repeat(64),
              },
            ]),
          ),
          ...(stage === 'reuse'
            ? {
                crashSource: {
                  reportPath: path.join(root, `crash-${objective}-${mode}/report.json`),
                  reportSha256: 'f'.repeat(64),
                },
              }
            : {}),
        }
      : {}),
  }
}

/** Hand-authored source inputs; no oracle plan or producer-expanded template is reused here. */
export function authoring(reference, objective, mode, policy = 'random', seed = null) {
  const key = objective === 'epsilon' ? 'illustriousEpsilon' : 'illustrious'
  return {
    seed: { policy, value: policy === 'reuse' ? null : seed },
    dynamicPrompt: { maxPrompts: 4, seedBehavior: 'per-prompt' },
    sampling: {
      steps: 3,
      cfgScale: 5,
      sampler: objective === 'epsilon' ? 'Euler a' : 'Euler',
      scheduler: 'Normal',
      denoisingStrength: 0.5,
    },
    model: resource(reference, key),
    vae: resource(reference, 'externalVaeNative'),
    vaePrecision: 'FP32',
    cfgRescale: 0,
    loras: [{ enabled: true, resource: resource(reference, 'illustriousLora'), weight: -0.5 }],
    positivePrompt: {
      text: 'a {(red:1.3)|(blue:1.3)} ceramic cup on a wooden table, studio photograph',
      embeddingRefs: [],
    },
    negativePrompt: { text: '{(blurry:0.7)|(noisy:0.7)}, low quality', embeddingRefs: [] },
  }
}
export function lateAuthoring(reference, objective, mode) {
  const draft = authoring(reference, objective, mode, 'fixed', 37)
  draft.dynamicPrompt = { maxPrompts: 3, seedBehavior: 'per-iteration' }
  draft.loras[0].weight = -0.25
  draft.positivePrompt.text = 'a (green:1.1) glass bowl, later authoring edit'
  draft.negativePrompt.text = '(grainy:0.8), later authoring edit'
  return draft
}
function alpha(contribution) {
  const result = Buffer.alloc(65536)
  for (let y = 0; y < 256; y++) {
    if (!contribution) result.fill(255, y * 256, y * 256 + 192)
    else {
      result.set(
        [0, 5, 12, 23, 36, 52, 70, 89, 109, 130, 151, 172, 193, 212, 230, 247],
        y * 256 + 152,
      )
      result.fill(255, y * 256 + 168, (y + 1) * 256)
    }
  }
  return result
}
function modelService(reference, objective) {
  const component = (key) => ({
    byteSize: reference[key].byteSize,
    managedPath: reference[key].installed.managedPath,
    reference: resource(reference, key),
  })
  return {
    assertNoUnboundGenerationEmbeddings: async ({
      modelFamily,
      positivePrompt,
      negativePrompt,
    }) => {
      assert.equal(modelFamily, 'illustrious')
      assert.deepEqual(positivePrompt.embeddingRefs, [])
      assert.deepEqual(negativePrompt.embeddingRefs, [])
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
    resolveVerifiedGenerationEmbeddingForPlan: async () => assert.fail('No embedding input.'),
    resolveVerifiedGenerationAnimaBundleForPlan: async () => assert.fail('No Anima input.'),
    resolveVerifiedAnimaGenerationLoraForPlan: async () => assert.fail('No Anima LoRA input.'),
  }
}
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

/** Real Main preparation → orchestrator → SQLite; no worker inference or Add/Save claim. */
export async function produce(reference, objective, mode, policy, seed = null, options = {}) {
  const batch = options.batch ?? {
    iterations: options.crash === true ? 3 : 2,
    maxPrompts: options.crash === true ? 1 : 4,
    seedBehavior: 'per-prompt',
  }
  const concretePair = options.concretePair === true || options.crash === true
  const document = createEmptyProjectDocumentV1({
    title: 'Image seed/recovery production boundary',
  })
  document.primaryBbox = { x: mode === 'outpaint' ? 64 : 0, y: 0, width: 256, height: 256 }
  document.generationDraft = authoring(reference, objective, mode, policy, seed)
  document.generationDraft.dynamicPrompt = {
    maxPrompts: batch.maxPrompts,
    seedBehavior: batch.seedBehavior,
  }
  if (concretePair) {
    document.generationDraft.positivePrompt.text =
      'a (red:1.3) ceramic cup on a wooden table, studio photograph'
    document.generationDraft.negativePrompt.text = '(blurry:0.7), low quality'
  }
  const bytes =
    mode === 'outpaint'
      ? await outpaintPngFromAlpha(alpha(false), 256, 256)
      : await acceptedOutputPngFixture(256, 256)
  const target = {
    bbox: { ...document.primaryBbox },
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    generationDraft: document.generationDraft,
    lastActualSeedSnapshot: options.lastActualSeedSnapshot ?? null,
    mode,
    composite: {
      bytes,
      byteSize: bytes.length,
      colorSpace: 'srgb',
      height: 256,
      width: 256,
      iccSha256: icc,
      sha256: digest(bytes),
    },
  }
  const models = modelService(reference, objective)
  let picks = 0
  const prepared = await (
    mode === 'outpaint' ? prepareNormalOutpaintGeneration : prepareNormalGeneration
  )({
    target,
    lastActualSeed: options.lastActualSeed ?? null,
    modelService: models,
    randomUint32: () => {
      picks++
      return randomBytes(4).readUInt32LE(0)
    },
  })
  assert.equal(picks, policy === 'random' ? 1 : 0)
  const preparedSeed = prepared.context.sampling.seed
  const temporary = await mkdtemp(path.join(tmpdir(), 'igs-image-seed-replay-producer-'))
  let database
  try {
    database = openAppDatabase(temporary, path.resolve('src/main/db/migrations'))
    const scratch = path.join(temporary, 'scratch')
    await mkdir(scratch, { mode: 0o700 })
    const projectPath = path.join(temporary, 'producer.igs')
    await writeFile(projectPath, 'queue identity fixture', { flag: 'wx', mode: 0o600 })
    const tabId = localProjectRecoveryKey(projectPath)
    const queue = new GenerationQueueRepository(database.db, temporary)
    await queue.recoverAfterRestart()
    let capacityPreflights = 0
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
        assertReadyForPublication: () => undefined,
        preflightBatchCapacity: async () => {
          capacityPreflights++
        },
      },
      {
        cancelAndWait: async () => assert.fail('No cancellation.'),
        runOne: async () => assert.fail('No inference.'),
      },
      scratch,
      {
        resolveVerifiedOutpaintInfill: async () => ({
          byteSize: 205669692,
          role: 'outpaint-infill',
          sha256: '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9',
          managedPath: path.join(reference.appData, 'inference-resources/big-lama.pt'),
        }),
      },
    )
    let edits = 0
    const admissionState = async () => {
      const tables = {}
      for (const [name, order] of [
        ['generation_queue_item', 'id'],
        ['generation_candidate_receipt', 'queue_item_id'],
        ['generation_seed_cursor', 'local_project_key'],
        ['generation_staging_discarded_session', 'staging_session_id'],
        ['generation_acceptance_journal', 'operation_id'],
      ])
        tables[name] = await database.db.selectFrom(name).selectAll().orderBy(order).execute()
      const privateFiles = {}
      const inspect = async (filename, relative) => {
        let metadata
        try {
          metadata = await lstat(filename)
        } catch (error) {
          if (error.code === 'ENOENT') {
            privateFiles[relative] = { kind: 'absent' }
            return
          }
          throw error
        }
        if (metadata.isSymbolicLink()) {
          privateFiles[relative] = { kind: 'symlink', target: await readlink(filename) }
          return
        }
        if (metadata.isDirectory()) {
          privateFiles[relative] = { kind: 'directory' }
          for (const name of (await readdir(filename)).sort())
            await inspect(path.join(filename, name), `${relative}/${name}`)
          return
        }
        assert.ok(metadata.isFile(), 'Admission effects must have an observable regular file kind.')
        privateFiles[relative] = {
          kind: 'file',
          byteSize: metadata.size,
          sha256: digest(await readFile(filename)),
        }
      }
      for (const relative of ['scratch', 'generation-inputs', 'recovery/generation-staging'])
        await inspect(path.join(temporary, relative), relative)
      return {
        tables,
        privateFiles,
        // This physical file supplies queue identity; it is not a valid saved .igs package.
        projectIdentitySha256: digest(await readFile(projectPath)),
        // Caller-owned source document, not a ProjectService/Undo/Save ownership claim.
        document: structuredClone(document),
      }
    }
    const admissionStateBefore =
      options.observeRefusal === true ? await admissionState() : undefined
    let admitted
    try {
      admitted = await (
        mode === 'outpaint'
          ? orchestrator.enqueuePreparedOutpaintBatch.bind(orchestrator)
          : orchestrator.enqueuePreparedBatch.bind(orchestrator)
      )(tabId, prepared, batch, { ready: structuredClone(ready) }, async () => {
        edits++
        document.generationDraft.seed = { policy: 'fixed', value: 37 }
        prepared.context.sampling.seed = 37
        prepared.context.sampling.requestedSeedPolicy = 'fixed'
        document.generationDraft.positivePrompt.text = 'late edit'
      })
    } catch (error) {
      if (options.observeRefusal !== true) throw error
      return {
        refusal: { name: error.name, code: error.code, message: error.message },
        admissionStateBefore,
        admissionStateAfter: await admissionState(),
        preparedSeed,
        picks,
        edits,
        capacityPreflights,
      }
    }
    assert.equal(edits, 1)
    assert.equal(
      admitted.items.length,
      batch.iterations * (concretePair ? 1 : Math.min(4, batch.maxPrompts)),
    )
    const rows = []
    const configs = []
    for (const [index, queued] of admitted.items.entries()) {
      const verified = await queue.loadVerifiedInput(queued.id)
      const frozen = verified.payload
      assert.ok(Buffer.from(await readFile(verified.targetPath)).equals(bytes))
      const payload = JSON.stringify(frozen)
      rows.push({ id: queued.id, frozen_payload_json: payload })
      const imagePngBytes =
        mode === 'outpaint' ? await outpaintPngFromAlpha(alpha(true), 256, 256) : bytes
      // Verified-candidate precondition is supplied; the provenance projection itself is real.
      configs.push(
        provenanceFromVerifiedRasterCandidate({
          acceptedAt: '2026-10-11T11:00:00.000Z',
          imagePngBytes,
          candidate: {
            actualSeed: frozen.context.sampling.seed,
            assetPath: path.join(scratch, 'candidate.png'),
            bbox: frozen.context.bbox,
            candidateId: queued.id,
            completedAt: '2026-10-11T10:59:00.000Z',
            completionOrder: index + 1,
            documentId: frozen.context.documentId,
            documentRevision: frozen.context.documentRevision,
            frozenPayloadJson: payload,
            frozenPayloadSha256: digest(payload),
            image: {
              byteSize: imagePngBytes.length,
              height: 256,
              width: 256,
              iccSha256: icc,
              sha256: digest(imagePngBytes),
            },
            localProjectKey: tabId,
            projectPath,
            queueItemId: queued.id,
            stagingSessionId: randomUUID(),
          },
        }).generationConfiguration,
      )
    }
    return {
      rows,
      configs,
      preparedSeed,
      picks,
      plan: admitted.plan,
      edits,
      capacityPreflights,
      ...(options.observeRefusal === true
        ? {
            refusal: null,
            admissionStateBefore,
            admissionStateAfter: await admissionState(),
          }
        : {}),
    }
  } finally {
    await database?.close()
    await rm(temporary, { force: true, recursive: true })
  }
}
