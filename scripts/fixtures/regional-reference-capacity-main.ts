import { IGS_SRGB_ICC_SHA256 } from '../../src/shared/projects/color-profile.js'
import type { GenerationDenoisingProgress } from '../../src/shared/projects/generation-progress.js'
import type { IgsProjectDocumentV1 } from '../../src/shared/projects/project-schema.js'
import { regionalReferenceProfileForMode } from '../../src/shared/projects/regional-reference-inference.js'

import { sql } from 'kysely'
/** Installed worker ports around the existing Main generation owners, for one isolated Project. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstat, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import type { AppDatabase } from '../../src/main/db/database.js'
import type { ModelService } from '../../src/main/models/model-service.js'
import type { GenerationWorkerTransport } from '../../src/main/projects/generation-processor.js'
import type { InferenceWorkerReady } from '../../src/main/projects/illustrious-txt2img-job.js'
import type { CapturedCurrentCanvasRegionalGenerationInput } from '../../src/main/projects/project-current-canvas-regional-generation-input.js'
import type { ProjectIndexRepository } from '../../src/main/projects/project-index.js'
import type { ProjectService } from '../../src/main/projects/project-service.js'
import type { RegionalGenerationTransport } from '../../src/main/projects/regional-generation-processor.js'
import type { RegionalWorkerInput } from '../../src/main/projects/regional-worker-request.js'
import type { RegionalReferenceResourceResolver } from '../../src/main/runtime/inference-auxiliary-resources.js'

import { ProjectGenerationActionController } from '../../src/main/projects/generation-action-controller.js'
import { createGenerationAppContext } from '../../src/main/projects/generation-app-context.js'
import { GenerationDispatchCoordinator } from '../../src/main/projects/generation-dispatch-coordinator.js'
import { GenerationWorkerClient } from '../../src/main/projects/generation-worker-client.js'
import { captureInferenceWorkerOwner } from '../../src/main/projects/inference-worker-ownership.js'
import { ProjectGenerationOperationGate } from '../../src/main/projects/project-generation-operation-gate.js'
import { ProjectRegionalGenerationCoordinator } from '../../src/main/projects/project-regional-generation-coordinator.js'
import { classifyTargetPngAlpha } from '../../src/main/projects/target-png-mode.js'
import { ProjectWorkerClient } from '../../src/main/projects/worker-client.js'
import { children, workerExited } from '../qualify-installed-reference-img-utility.mjs'

interface CapacityProject {
  database: AppDatabase
  models: ModelService
  projectIndex: ProjectIndexRepository
  projects: ProjectService
  referenceIds: { fourth: string; originals: readonly [string, string, string] }
  removeFourth: () => Promise<string>
  root: string
  scratch: string
  tabId: string
}

interface CapacityOptions {
  assertIdle: () => Promise<unknown>
  install: {
    configDir: string
    exactPython: string
    pythonExecutable: string
    ready: InferenceWorkerReady
    runtimeDir: string
    runtimeId: string
  }
  observeGpu: (pid: number) => () => Promise<{
    error: string | null | undefined
    maximumMiB: number | null
    samples: number
  }>
  resources: RegionalReferenceResourceResolver
  run: string
  timeoutMs?: number
}

const bbox = { height: 512, width: 512, x: 0, y: 0 }
const stripes = [0, 128, 320, 512]
const maxReferenceRefusal = {
  code: 'GENERATION_INVALID_REQUEST',
  message:
    'Regional reference images support at most 3 images across enabled regions per generation.',
}
const profile = regionalReferenceProfileForMode('img2img')
const sha = (bytes: string | Buffer | Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex')
const authoredReferences = (doc: IgsProjectDocumentV1) =>
  (doc.regionalGuidance ?? [])
    .filter(({ enabled }) => enabled)
    .flatMap(({ id: regionId, referenceImages }) =>
      (referenceImages ?? []).map(({ asset, id: referenceId }) => ({
        asset,
        referenceId,
        regionId,
      })),
    )

export async function runRegionalReferenceCapacityMain(
  context: CapacityProject,
  options: CapacityOptions,
) {
  const {
    database,
    models,
    projectIndex,
    projects,
    referenceIds,
    removeFourth,
    root,
    scratch,
    tabId,
  } = context
  const { assertIdle, install, observeGpu, resources, run } = options
  const artifactRoot = path.join(run, 'native')
  const end = Date.now() + (options.timeoutMs ?? 420_000)
  assert.equal(await realpath(artifactRoot), artifactRoot)
  const writeJson = async (name: string, value: unknown) =>
    writeFile(path.join(artifactRoot, name), `${JSON.stringify(value, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    })
  const writePng = async (name: string, bytes: Buffer) => {
    const filename = path.join(artifactRoot, name)
    await writeFile(filename, bytes, { flag: 'wx', mode: 0o600 })
    return { byteSize: bytes.length, path: filename, sha256: sha(bytes) }
  }
  const current = () => {
    const open = projects.getOpenDocumentForAcceptance(tabId)
    assert.ok(open && !open.dirty)
    return open
  }
  const workers: {
    closed: boolean
    gpu?: Awaited<ReturnType<ReturnType<CapacityOptions['observeGpu']>>>
    kind: 'cpu' | 'gpu'
    owner: Awaited<ReturnType<typeof captureInferenceWorkerOwner>>
  }[] = []
  const calls = { admission: 0, captured: 0, gpu: 0, native: 0, preparation: 0, resources: 0 }
  const progress: GenerationDenoisingProgress[] = []
  let nativeEvidence: ReturnType<typeof verifyInput> | undefined
  let nativeOutput: Awaited<ReturnType<typeof writePng>> | undefined
  let allowed = false
  const signedGroup = (await readFile('/proc/self/cgroup', 'utf8')).trim()
  const observeChild = async (previous: Set<number>, kind: 'cpu' | 'gpu') => {
    const created = (await children()).filter((pid) => !previous.has(pid))
    assert.equal(created.length, 1)
    const owner = await captureInferenceWorkerOwner(created[0])
    const proc = `/proc/${owner.worker.pid}`
    assert.equal(await realpath(`${proc}/exe`), install.exactPython)
    assert.equal(await realpath(`${proc}/cwd`), install.runtimeDir)
    assert.equal((await readFile(`${proc}/cgroup`, 'utf8')).trim(), signedGroup)
    const receipt: (typeof workers)[number] = { closed: false, kind, owner }
    workers.push(receipt)
    return receipt
  }
  const runtime = {
    getStatus: async () => ({
      kind: 'ready',
      profile: 'linux-nvidia',
      runtimeId: install.runtimeId,
    }),
    readQualifiedInferenceReady: async () => structuredClone(install.ready),
    retryUnconfirmedGenerationExit: async () =>
      await GenerationWorkerClient.retryUnconfirmedStartExit(),
    withGenerationAdmission: async <T>(
      _scratch: string,
      _use: (ready: InferenceWorkerReady) => Promise<T>,
    ): Promise<T> => {
      calls.admission++
      assert.fail('Regional Generate must use the preparation owner.')
    },
    withGenerationPreparation: async <T>(
      base: string,
      use: (input: {
        inferenceReady: InferenceWorkerReady
        targetWorker: Pick<ProjectWorkerClient, 'composeTarget'>
      }) => Promise<T>,
    ) => {
      calls.preparation++
      assert.ok(allowed && calls.preparation === 1)
      assert.equal(base, scratch)
      await assertIdle()
      const previous = new Set(await children())
      const cpu = await ProjectWorkerClient.start(
        {
          pythonExecutable: install.pythonExecutable,
          runtimeRoot: install.runtimeDir,
          stagingBasePath: scratch,
        },
        { environment: { CUDA_VISIBLE_DEVICES: '', LANG: 'C.UTF-8', TMPDIR: scratch } },
      )
      let receipt
      try {
        receipt = await observeChild(previous, 'cpu')
        return await use({ inferenceReady: structuredClone(install.ready), targetWorker: cpu })
      } finally {
        await cpu.close()
        if (receipt) {
          await workerExited(receipt.owner)
          receipt.closed = true
        }
      }
    },
    withGenerationWorker: async <T>(
      base: string,
      use: (worker: GenerationWorkerTransport) => Promise<T>,
    ) => {
      calls.gpu++
      assert.ok(allowed && calls.gpu === 1)
      assert.equal(base, scratch)
      await assertIdle()
      const previous = new Set(await children())
      const remaining = end - Date.now()
      assert.ok(remaining > 0)
      const gpu = await GenerationWorkerClient.start(
        {
          pythonExecutable: install.pythonExecutable,
          runtimeRoot: install.runtimeDir,
          scratchBasePath: scratch,
        },
        {
          environment: {
            HF_HOME: scratch,
            IGS_SDXL_CONFIG_DIR: install.configDir,
            LANG: 'C.UTF-8',
            TMPDIR: scratch,
          },
          requestTimeoutMs: remaining,
          startupTimeoutMs: Math.min(remaining, 120_000),
        },
      )
      let receipt: (typeof workers)[number] | undefined
      try {
        receipt = await observeChild(previous, 'gpu')
        const observed = receipt
        assert.deepEqual(gpu.ready, install.ready)
        const transport: GenerationWorkerTransport & RegionalGenerationTransport = {
          close: gpu.close.bind(gpu),
          executeCurrentCanvasRegional: async (input, onProgress) => {
            assert.ok(input.compositionProfile !== 'invoke-krea2-global-support-v1')
            assert.equal(++calls.native, 1)
            nativeEvidence = verifyInput(input, current().document)
            const target = await readFile(input.request.job.target.path)
            assert.equal(classifyTargetPngAlpha(target, 512, 512), 'img2img')
            assert.equal(sha(target), input.request.job.target.sha256)
            const targetEvidence = await writePng('native-target.png', target)
            await writeJson('native-request.json', { ...nativeEvidence, target: targetEvidence })
            const stop = observeGpu(observed.owner.worker.pid)
            try {
              const result = await gpu.executeCurrentCanvasRegional(input, (update) => {
                assert.deepEqual(update, { step: progress.length + 1, totalSteps: 16 })
                progress.push(update)
                onProgress?.(update)
              })
              assert.equal(progress.length, 16)
              assert.equal(result.output.iccSha256, IGS_SRGB_ICC_SHA256)
              assert.deepEqual([result.output.width, result.output.height], [512, 512])
              assert.equal(result.seed, input.request.job.sampling.seed)
              nativeOutput = await writePng('native-output.png', result.pngBytes)
              assert.equal(nativeOutput.sha256, result.output.sha256)
              assert.equal(nativeOutput.byteSize, result.output.byteSize)
              return result
            } finally {
              observed.gpu = await stop()
            }
          },
          generate: async () => assert.fail('The regional job reached ordinary inference.'),
          ready: gpu.ready,
        }
        return await use(transport)
      } finally {
        await gpu.close()
        if (receipt) {
          await workerExited(receipt.owner)
          receipt.closed = true
        }
      }
    },
  }
  const owner = await createGenerationAppContext({
    database,
    dataRoot: root,
    modelService: models,
    projectIndex,
    projectService: projects,
    scratchBasePath: scratch,
  })
  const { infillResolver, orchestrator, processor, queue, staging } =
    owner.requireRecoveredServices()
  const gate = new ProjectGenerationOperationGate()
  const capturedProjects = new Proxy(projects, {
    get(target, name) {
      if (name === 'withCapturedCurrentCanvasRegionalGenerationInput') {
        return <T>(
          id: string,
          use: (capture: CapturedCurrentCanvasRegionalGenerationInput) => Promise<T>,
        ) => {
          calls.captured++
          return target.withCapturedCurrentCanvasRegionalGenerationInput(id, use)
        }
      }
      const value: unknown = Reflect.get(target, name, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  const regional = new ProjectRegionalGenerationCoordinator({
    compositionProfile: 'invoke-canvas-v1',
    gate,
    models,
    orchestrator,
    projects: capturedProjects,
    regionalReferenceResources: {
      resolveVerifiedRegionalReferenceResources: async () => {
        calls.resources++
        return await resources.resolveVerifiedRegionalReferenceResources()
      },
    },
    scratchBasePath: scratch,
  })
  const dispatch = new GenerationDispatchCoordinator(
    runtime,
    orchestrator,
    processor,
    scratch,
    undefined,
    regional,
  )
  const actions = new ProjectGenerationActionController({
    dispatch,
    gate,
    infillResolver,
    models,
    orchestrator,
    processor,
    projects,
    queue,
    regional,
    runtime,
    scratchBasePath: scratch,
    staging,
  })
  let failure: unknown
  try {
    const snapshot = async () => {
      const { canRedo, canUndo, dirty, document, documentEpoch, filePath } = current()
      return {
        database: await databaseSnapshot(database),
        document: structuredClone(document),
        openTabs: structuredClone(projects.getOpenTabs()),
        owner: { canRedo, canUndo, dirty, documentEpoch },
        packageSha256: sha(await readFile(filePath)),
        scratch: await Promise.all(
          [scratch, path.join(root, 'generation-inputs'), path.join(root, 'recovery')].map(
            scratchSnapshot,
          ),
        ),
      }
    }
    const before = await snapshot()
    assert.deepEqual(before.document.primaryBbox, bbox)
    assert.equal(authoredReferences(before.document).length, 4)
    await assert.rejects(
      actions.generate(tabId, { documentId: before.document.documentId, iterations: 1 }),
      maxReferenceRefusal,
    )
    assert.deepEqual(calls, {
      admission: 0,
      captured: 0,
      gpu: 0,
      native: 0,
      preparation: 0,
      resources: 0,
    })
    assert.deepEqual(await snapshot(), before)
    await writeJson('main-refusal.json', {
      calls,
      rejection: maxReferenceRefusal,
      snapshot: before,
    })
    assert.equal(await removeFourth(), tabId)
    const legal = current()
    const saved = await readFile(legal.filePath)
    const savedDocument = structuredClone(legal.document)
    const savedOwner = {
      canRedo: legal.canRedo,
      canUndo: legal.canUndo,
      documentEpoch: legal.documentEpoch,
    }
    const savedTabs = structuredClone(projects.getOpenTabs())
    const beforeIds = authoredReferences(before.document).map(({ referenceId }) => referenceId)
    const legalIds = authoredReferences(savedDocument).map(({ referenceId }) => referenceId)
    assert.deepEqual(
      legalIds,
      beforeIds.filter((id) => id !== referenceIds.fourth),
    )
    assert.deepEqual(legalIds, referenceIds.originals)
    allowed = true
    const admission = await actions.generate(tabId, {
      documentId: savedDocument.documentId,
      iterations: 1,
    })
    assert.equal(admission.kind, 'queued')
    assert.equal(admission.jobIds.length, 1)
    assert.equal(admission.truncated, false)
    const [id] = admission.jobIds
    for (;;) {
      const entry = await queue.getManagerEntry(id)
      const state = await actions.getState(tabId)
      if (state.phase === 'blocked' || entry.status === 'failed' || entry.status === 'canceled') {
        assert.fail(JSON.stringify({ entry, state }))
      }
      if (entry.status === 'completed' && state.phase === 'idle') {
        break
      }
      assert.ok(Date.now() < end, 'Regional candidate did not settle.')
      await delay(250)
    }
    const frozen = await queue.loadVerifiedRegionalInput(id)
    assert.equal(frozen.payload.kind, 'illustrious-regional-img2img')
    assert.equal(frozen.payload.referenceProfile, profile)
    assert.equal(frozen.item.id, id)
    const exactFrozen = verifyInput(frozen.input, savedDocument)
    assert.ok(nativeEvidence && nativeOutput)
    assert.deepEqual(exactFrozen.masks, nativeEvidence.masks)
    assert.deepEqual(exactFrozen.references, nativeEvidence.references)
    assert.deepEqual(exactFrozen.resources, nativeEvidence.resources)
    assert.deepEqual(exactFrozen.request.job.target, nativeEvidence.request.job.target)
    const rows = await database.db.selectFrom('generation_queue_item').selectAll().execute()
    const receipts = await database.db
      .selectFrom('generation_candidate_receipt')
      .selectAll()
      .execute()
    assert.equal(rows.length, 1)
    assert.equal(receipts.length, 1)
    const [row] = rows
    const [receipt] = receipts
    assert.equal(row.id, id)
    assert.equal(row.status, 'completed')
    assert.equal(row.operation, 'illustrious-regional-img2img')
    assert.equal(receipt.queue_item_id, id)
    assert.equal(receipt.status, 'completed')
    assert.equal(receipt.expected_status_sequence + 1, row.status_sequence)
    assert.equal(receipt.frozen_payload_sha256, sha(row.frozen_payload_json))
    assert.deepEqual(JSON.parse(row.frozen_payload_json), frozen.payload)
    const candidates = await staging.listVerifiedCandidates(tabId)
    assert.equal(candidates.length, 1)
    const [candidate] = candidates
    assert.equal(candidate.candidateId, receipt.candidate_id)
    assert.equal(candidate.queueItemId, id)
    assert.equal(candidate.stagingSessionId, row.staging_session_id)
    assert.equal(candidate.documentRevision, savedDocument.documentRevision)
    assert.equal(candidate.frozenPayloadJson, row.frozen_payload_json)
    const bytes = await staging.readVerifiedCandidatePng({
      candidateId: candidate.candidateId,
      imageSha256: candidate.image.sha256,
      localProjectKey: tabId,
      stagingSessionId: candidate.stagingSessionId,
    })
    assert.ok(bytes)
    assert.equal(sha(bytes), candidate.image.sha256)
    assert.equal(candidate.image.sha256, nativeOutput.sha256)
    assert.equal(bytes.length, receipt.image_byte_size)
    assert.equal(sha(bytes), receipt.image_sha256)
    assert.deepEqual(current().document, savedDocument)
    assert.deepEqual(await readFile(legal.filePath), saved)
    assert.deepEqual(calls, {
      admission: 0,
      captured: 1,
      gpu: 1,
      native: 1,
      preparation: 1,
      resources: 1,
    })
    assert.deepEqual(
      workers.map(({ closed, kind }) => [kind, closed]),
      [
        ['cpu', true],
        ['gpu', true],
      ],
    )
    const gpu = workers[1].gpu
    assert.ok(gpu && !gpu.error && gpu.samples > 0 && (gpu.maximumMiB ?? 0) > 0)
    await assertIdle()
    const staged = await writePng('candidate.png', bytes)
    const discarded = await staging.discardSessions(tabId, [candidate.stagingSessionId])
    assert.deepEqual(discarded, { cleanupDeferred: false, discardedSessionCount: 1 })
    assert.deepEqual(await staging.listVerifiedCandidates(tabId), [])
    assert.deepEqual(current().document, savedDocument)
    assert.deepEqual(await readFile(legal.filePath), saved)
    const settledOwner = current()
    assert.deepEqual(
      {
        canRedo: settledOwner.canRedo,
        canUndo: settledOwner.canUndo,
        documentEpoch: settledOwner.documentEpoch,
      },
      savedOwner,
    )
    assert.deepEqual(projects.getOpenTabs(), savedTabs)
    const report = {
      admission,
      calls,
      candidate: { ...candidate, assetPath: undefined },
      discarded,
      engine: install.runtimeId,
      exactFrozen,
      nativeOutput,
      progress,
      receipt,
      row,
      staged,
      workers,
    }
    await writeJson('main-result.json', report)
    return report
  } catch (error) {
    failure = error
    throw error
  } finally {
    try {
      await actions.shutdown()
      await regional.shutdown()
      owner.shutdown()
      assert.equal(GenerationWorkerClient.hasUnconfirmedStartExit(), false)
      assert.equal(ProjectWorkerClient.hasUnconfirmedExit(), false)
    } finally {
      if (failure) {
        await writeJson('main-failure.json', {
          calls,
          error: failure instanceof Error ? failure.stack : String(failure),
          nativeOutput,
          progress,
          workers,
        })
      }
    }
  }
}

async function databaseSnapshot(database: AppDatabase) {
  return await database.db.transaction().execute(async (transaction) => {
    const names = await sql<{ name: string }>`
      select name from sqlite_schema where type = 'table' and name not like 'sqlite_%' order by name
    `.execute(transaction)
    const tables: Record<string, unknown[]> = {}
    for (const { name } of names.rows) {
      const records = await sql`select * from ${sql.table(name)}`.execute(transaction)
      tables[name] = records.rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    }
    return tables
  })
}

async function scratchSnapshot(root: string) {
  const result: Record<string, string | null> = {}
  const visit = async (filename: string) => {
    let entry
    try {
      entry = await lstat(filename)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
      return
    }
    assert.equal(await realpath(filename), filename)
    if (entry.isDirectory()) {
      result[filename] = null
      for (const child of (await readdir(filename)).sort()) {
        await visit(path.join(filename, child))
      }
    } else {
      assert.ok(entry.isFile() && entry.size <= 32 * 1024 ** 2)
      result[filename] = sha(await readFile(filename))
    }
  }
  await visit(root)
  return result
}

function verifyInput(input: RegionalWorkerInput, document: IgsProjectDocumentV1) {
  const { recipe, references, request } = input
  assert.equal(input.compositionProfile, 'invoke-canvas-v1')
  assert.equal(input.initializationProfile, undefined)
  assert.equal(request.type, 'generate-illustrious-img2img')
  assert.deepEqual(recipe.bbox, bbox)
  assert.deepEqual(request.job.bbox, bbox)
  assert.equal(recipe.documentId, document.documentId)
  assert.equal(recipe.documentRevision, document.documentRevision)
  assert.equal(request.job.checkpoint.predictionType, 'epsilon')
  assert.equal(request.job.checkpoint.sha256, document.generationDraft.model?.fileSha256)
  assert.equal(request.job.vaePrecision, 'FP16')
  assert.deepEqual(
    [
      request.job.sampling.scheduler,
      request.job.sampling.steps,
      request.job.sampling.cfgScale,
      request.job.sampling.denoisingStrength,
    ],
    ['euler', 30, 5, 0.5],
  )
  assert.ok(
    !request.job.vae &&
      !request.job.loras?.length &&
      !request.job.embeddings?.positive.length &&
      !request.job.embeddings?.negative.length,
  )
  assert.equal(references?.profile, profile)
  const expected = authoredReferences(document)
  assert.equal(expected.length, 3)
  assert.deepEqual(
    references.images.map(({ image, referenceId, regionId }) => ({
      byteSize: image.byteSize,
      height: image.height,
      referenceId,
      regionId,
      sha256: sha(image.bytes),
      width: image.width,
    })),
    expected.map(({ asset, referenceId, regionId }) => ({
      byteSize: asset.bytes,
      height: asset.height,
      referenceId,
      regionId,
      sha256: asset.sha256,
      width: asset.width,
    })),
  )
  assert.deepEqual(
    recipe.regions.map(({ regionId }) => regionId),
    expected.map(({ regionId }) => regionId),
  )
  const masks = recipe.regions.map(({ coverage, maskId, regionId }, index) => {
    assert.equal(coverage.alpha.length, 512 ** 2)
    assert.equal(coverage.kind, 'covered')
    assert.ok(
      coverage.alpha.every((pixel, offset) => {
        const x = offset % 512
        return pixel === (x >= stripes[index] && x < stripes[index + 1] ? 255 : 0)
      }),
    )
    return { alphaSha256: sha(coverage.alpha), maskId, regionId }
  })
  return { masks, references: expected, request, resources: references.resources }
}
