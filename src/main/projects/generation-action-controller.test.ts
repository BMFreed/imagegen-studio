import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import { GenerationBatchPlanError } from '../../shared/projects/generation-batch-plan.js'
import type { ProjectGenerationActionState } from '../../shared/projects/project-generation-actions.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { crc32, deflateSync } from 'node:zlib'

import type { AppDatabase } from '../db/database.js'
import type { GenerationWorkerTransport } from './generation-processor.js'
import type { GenerationQueueTestHooks } from './generation-queue.js'
import type { GenerationWorkerClient } from './generation-worker-client.js'
import type { IllustriousTxt2ImgRequestV1 } from './illustrious-txt2img-job.js'
import type { ProjectWorkerClient } from './worker-client.js'

import { openAppDatabase } from '../db/database.js'
import { CivitaiClient } from '../models/civitai-client.js'
import { CivitaiTokenStore, type SafeStorageAdapter } from '../models/civitai-token-store.js'
import { ModelRepository } from '../models/model-repository.js'
import { ModelService } from '../models/model-service.js'
import {
  ProjectGenerationActionController,
  toProjectGenerationActionApiError,
} from './generation-action-controller.js'
import { GenerationDispatchCoordinator } from './generation-dispatch-coordinator.js'
import { GenerationOrchestrator } from './generation-orchestrator.js'
import { GenerationProcessor } from './generation-processor.js'
import { GenerationQueueRepository } from './generation-queue.js'
import { GenerationStagingRepository } from './generation-staging.js'
import { IllustriousJobError } from './illustrious-txt2img-job.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectGenerationClose } from './project-generation-close.js'
import { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import { GenerationPreparationError } from './project-generation-preparation.js'
import { ProjectIndexRepository } from './project-index.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'

const migrations = path.resolve('src/main/db/migrations')
const placeholders = path.resolve('src/main/projects/placeholders')
const iccPath = path.resolve('worker-python/src/imagegen_worker/srgb.icc')
const storage: SafeStorageAdapter = {
  decryptStringAsync: async () => ({ result: '', shouldReEncrypt: false }),
  encryptStringAsync: async () => Buffer.alloc(0),
  getSelectedStorageBackend: () => 'gnome_libsecret',
  isAsyncEncryptionAvailable: async () => true,
}

type ControlledWorker = GenerationWorkerTransport &
  Pick<ProjectWorkerClient, 'composeTarget'> & { ready: GenerationWorkerClient['ready'] }

type Fixture = {
  closeOwner: ProjectGenerationClose
  controller: ProjectGenerationActionController
  database: AppDatabase
  documentId: string
  packagePath: string
  projects: ProjectService
  queue: GenerationQueueRepository
  root: string
  runtime: ControlledRuntime
  staging: GenerationStagingRepository
  tabId: string
}

class ControlledRuntime {
  available = true
  beforeCompose: (() => Promise<void>) | null = null
  beforeGenerate: (() => Promise<void>) | null = null
  closedCount = 0
  closeFailures = 0
  generated: IllustriousTxt2ImgRequestV1[] = []
  leaseCount = 0
  private held = false

  constructor(
    private readonly target: Buffer,
    private readonly output: Buffer,
  ) {}

  async retryUnconfirmedGenerationExit(): Promise<boolean> {
    return !this.held
  }

  async withGenerationWorker<T>(
    _scratchBasePath: string,
    use: (worker: ControlledWorker) => Promise<T>,
  ): Promise<T | null> {
    if (!this.available) {
      return null
    }
    assert.equal(this.held, false, 'composition and dispatch must not nest runtime leases')
    this.held = true
    this.leaseCount += 1
    let closed = false
    const worker: ControlledWorker = {
      close: async () => {
        if (!closed && this.closeFailures > 0) {
          this.closeFailures -= 1
          throw Object.assign(new Error('controlled unconfirmed worker exit'), {
            code: 'WORKER_EXIT_UNCONFIRMED',
          })
        }
        if (!closed) {
          closed = true
          this.closedCount += 1
          this.held = false
        }
      },
      composeTarget: async (input) => {
        await this.beforeCompose?.()
        await writeFile(input.targetPngPath, this.target, { flag: 'wx', mode: 0o600 })
        return {
          composite: {
            byteSize: this.target.length,
            colorSpace: 'srgb',
            height: 64,
            iccSha256: IGS_SRGB_ICC_SHA256,
            path: input.targetPngPath,
            sha256: sha256(this.target),
            width: 64,
          },
          mode: 'txt2img',
          rect: { ...input.bbox },
        }
      },
      generate: async (request) => {
        this.generated.push(request)
        await this.beforeGenerate?.()
        await writeFile(request.job.output.pngPath, this.output, { flag: 'wx', mode: 0o600 })
        return {
          outputPath: request.job.output.pngPath,
          protocolVersion: '1',
          requestId: request.requestId,
          seed: request.job.sampling.seed,
          type: 'generation-done',
        }
      },
      ready: {
        capabilities: ['illustrious-txt2img', 'target-composition'],
        protocolVersion: '1',
        pythonVersion: '3.12.0',
        runtimeProfile: 'linux-nvidia',
        workerVersion: '0.2.0',
      },
    }
    try {
      return await use(worker)
    } finally {
      await worker.close()
      this.held = false
    }
  }
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function chunk(name: string, data: Buffer): Buffer {
  const tag = Buffer.from(name, 'ascii')
  const result = Buffer.alloc(data.length + 12)
  result.writeUInt32BE(data.length, 0)
  tag.copy(result, 4)
  data.copy(result, 8)
  result.writeUInt32BE(crc32(Buffer.concat([tag, data])), data.length + 8)
  return result
}

async function png(opaque: boolean): Promise<Buffer> {
  const profile = await readFile(iccPath)
  assert.equal(sha256(profile), IGS_SRGB_ICC_SHA256)
  const header = Buffer.alloc(13)
  header.writeUInt32BE(64, 0)
  header.writeUInt32BE(64, 4)
  header[8] = 8
  header[9] = 6
  const rows = Buffer.alloc(64 * (1 + 64 * 4))
  if (opaque) {
    for (let row = 0; row < 64; row += 1) {
      for (let column = 0; column < 64; column += 1) {
        const pixel = row * 257 + 1 + column * 4
        rows[pixel] = 36
        rows[pixel + 1] = 93
        rows[pixel + 2] = 180
        rows[pixel + 3] = 255
      }
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('iCCP', Buffer.concat([Buffer.from('sRGB\0\0'), deflateSync(profile)])),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function signal() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function withFixture(
  run: (fixture: Fixture) => Promise<void>,
  queueHooks: GenerationQueueTestHooks = {},
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-actions-'))
  const database = openAppDatabase(root, migrations)
  let controller: ProjectGenerationActionController | undefined
  try {
    const scratch = path.join(root, 'scratch')
    await mkdir(scratch, { mode: 0o700 })
    const index = new ProjectIndexRepository(database.db)
    const projects = new ProjectService({
      autosaveOptions: { debounceMs: 0, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot: root,
      repository: index,
      roots: { placeholdersDir: placeholders, scratchDir: scratch },
      shadow: new ProjectShadowStore(path.join(root, 'autosave')),
    })
    const models = new ModelRepository(database.db)
    // ModelService still rehashes exact managed bytes; this fixture substitutes only the heavy
    // structural SDXL tensor qualification, which has independent production tests.
    const modelService = new ModelService(
      models,
      new CivitaiClient(),
      new CivitaiTokenStore(storage, root),
      undefined,
      undefined,
      async () => {},
    )
    const checkpoint = Buffer.from('exact local checkpoint for action-controller tests')
    const managedPath = path.join(root, 'checkpoint.safetensors')
    await writeFile(managedPath, checkpoint)
    const installed = await models.publishVerifiedInstallation({
      primary: {
        file: {
          managedPath,
          originalFilename: 'checkpoint.safetensors',
          sha256: sha256(checkpoint),
          sizeBytes: checkpoint.length,
          verifiedAt: '2026-09-30T00:00:00.000Z',
        },
        resource: {
          displayName: 'Controller checkpoint',
          source: { kind: 'civitai', modelId: 42 },
          sourceMetadata: {},
          type: 'checkpoint',
        },
        version: {
          baseModelFamily: 'illustrious',
          format: 'safetensors',
          name: 'v1',
          predictionType: 'epsilon',
          source: {
            expectedSha256: sha256(checkpoint),
            fileId: 22,
            kind: 'civitai',
            versionId: 21,
          },
          sourceMetadata: {},
        },
      },
    })
    const tab = await projects.create({ height: 64, title: 'Generate actions', width: 64 })
    const reference = await modelService.resolveGenerationCheckpoint(
      installed.resourceId,
      installed.versionId,
    )
    await projects.setGenerationModel(tab.id, reference)
    await projects.updateGenerationDraft(tab.id, {
      kind: 'positive-prompt',
      text: '{red|blue} lantern',
    })
    await projects.updateGenerationDraft(tab.id, {
      kind: 'negative-prompt',
      text: '{blur|noise}',
    })
    await projects.updateGenerationDraft(tab.id, {
      kind: 'sampling-pair',
      sampler: 'DPM++ 2M',
      scheduler: 'Karras',
    })
    await projects.updateGenerationDraft(tab.id, { kind: 'sampling-steps', value: 24 })
    await projects.updateGenerationDraft(tab.id, { kind: 'sampling-cfg-scale', value: 7.5 })
    await projects.updateGenerationDraft(tab.id, { kind: 'seed', policy: 'fixed', value: 42 })
    await projects.updateGenerationDraft(tab.id, {
      kind: 'dynamic-prompt',
      value: { maxPrompts: 100, seedBehavior: 'per-prompt' },
    })
    await projects.save(tab.id)
    const packagePath = (await index.listProjects())[0].canonicalPath
    const documentId = projects.getOpenDocumentId(tab.id)
    assert.ok(documentId)
    const queue = new GenerationQueueRepository(database.db, root, queueHooks)
    const staging = new GenerationStagingRepository(database.db, root)
    await queue.recoverAfterRestart()
    await staging.recoverAfterRestart()
    const processor = new GenerationProcessor(queue, staging, modelService, scratch)
    const orchestrator = new GenerationOrchestrator(
      projects,
      index,
      modelService,
      queue,
      staging,
      processor,
      scratch,
    )
    const runtime = new ControlledRuntime(await png(false), await png(true))
    const dispatch = new GenerationDispatchCoordinator(runtime, orchestrator, processor, scratch)
    const gate = new ProjectGenerationOperationGate()
    const closeOwner = new ProjectGenerationClose(projects, { orchestrator, queue, staging }, gate)
    controller = new ProjectGenerationActionController({
      dispatch,
      gate,
      models: modelService,
      orchestrator,
      processor,
      projects,
      queue,
      runtime,
      scratchBasePath: scratch,
      staging,
    })
    await run({
      closeOwner,
      controller,
      database,
      documentId,
      packagePath,
      projects,
      queue,
      root,
      runtime,
      staging,
      tabId: tab.id,
    })
  } finally {
    await controller?.shutdown()
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

async function waitForState(
  controller: ProjectGenerationActionController,
  tabId: string,
  condition: (state: ProjectGenerationActionState) => boolean,
): Promise<ProjectGenerationActionState> {
  return await new Promise<ProjectGenerationActionState>((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe()
      reject(new Error('Expected Generate state transition was not published.'))
    }, 10_000)
    const inspect = async () => {
      try {
        const state = await controller.getState(tabId)
        if (condition(state)) {
          clearTimeout(timer)
          unsubscribe()
          resolve(state)
        }
      } catch (error) {
        clearTimeout(timer)
        unsubscribe()
        reject(error)
      }
    }
    const unsubscribe = controller.onChanged(() => void inspect())
    void inspect()
  })
}

test('Generate freezes expanded pairs, drains real queue to staging, and does not write .igs', async () => {
  await withFixture(async (fixture) => {
    const before = await readFile(fixture.packagePath)
    const entered = signal()
    const release = signal()
    fixture.runtime.beforeGenerate = async () => {
      entered.resolve()
      await release.promise
    }
    const result = await fixture.controller.generate(fixture.tabId, {
      documentId: fixture.documentId,
      iterations: 1,
    })
    assert.equal(result.kind, 'queued')
    if (result.kind !== 'queued') {
      return
    }
    assert.equal(result.jobIds.length, 4)
    await entered.promise
    const during = await waitForState(
      fixture.controller,
      fixture.tabId,
      (state) => state.runningJobId === result.jobIds[0] && state.jobs.length === 4,
    )
    assert.equal(during.jobs[0].status, 'running')
    assert.deepEqual(
      during.jobs.slice(1).map((job) => [job.status, job.statusSequence]),
      [
        ['pending', 0],
        ['pending', 0],
        ['pending', 0],
      ],
    )
    assert.deepEqual(
      during.jobs.map((job) => job.seed),
      [42, 43, 44, 45],
    )
    assert.deepEqual(
      during.jobs.map((job) => job.prompt),
      ['red lantern', 'red lantern', 'blue lantern', 'blue lantern'],
    )
    const frozen = await Promise.all(result.jobIds.map((id) => fixture.queue.loadVerifiedInput(id)))
    assert.deepEqual(
      frozen.map((item) => item.payload.context.prompts.negative),
      ['blur', 'noise', 'blur', 'noise'],
    )
    assert.deepEqual(await readFile(fixture.packagePath), before)
    release.resolve()
    await waitForState(
      fixture.controller,
      fixture.tabId,
      (state) => state.phase === 'idle' && state.jobs.length === 0,
    )
    const candidates = await fixture.staging.listVerifiedCandidates(fixture.tabId)
    assert.equal(candidates.length, 4)
    assert.equal(fixture.runtime.generated.length, 4)
    assert.equal(fixture.runtime.closedCount, fixture.runtime.leaseCount)
    assert.deepEqual(await readFile(fixture.packagePath), before)
  })
})

test('Keep preserves candidates and exact reviewed replacement tombstones only those sessions', async () => {
  await withFixture(async (fixture) => {
    const request = { documentId: fixture.documentId, iterations: 1 }
    const first = await fixture.controller.generate(fixture.tabId, request)
    assert.equal(first.kind, 'queued')
    await waitForState(
      fixture.controller,
      fixture.tabId,
      (state) => state.phase === 'idle' && state.jobs.length === 0,
    )
    const original = await fixture.staging.listVerifiedCandidates(fixture.tabId)
    assert.equal(original.length, 4)
    const review = await fixture.controller.generate(fixture.tabId, request)
    assert.equal(review.kind, 'confirmation-required')
    if (review.kind !== 'confirmation-required') {
      return
    }
    assert.deepEqual(review.candidateIds, original.map((item) => item.candidateId).sort())
    assert.deepEqual(review.unfinishedJobIds, [])
    assert.equal((await fixture.staging.listVerifiedCandidates(fixture.tabId)).length, 4)
    const stale = await fixture.controller.generate(fixture.tabId, {
      ...request,
      confirmation: { candidateIds: [randomUUID()], unfinishedJobIds: [] },
    })
    assert.deepEqual(stale, review)
    await fixture.projects.updateGenerationDraft(fixture.tabId, {
      kind: 'sampling-pair',
      sampler: 'DPM++ 2M',
      scheduler: null,
    })
    await assert.rejects(
      fixture.controller.generate(fixture.tabId, {
        ...request,
        confirmation: {
          candidateIds: review.candidateIds,
          unfinishedJobIds: review.unfinishedJobIds,
        },
      }),
      { code: 'GENERATION_SAMPLING_UNSUPPORTED' },
    )
    assert.deepEqual(
      (await fixture.staging.listVerifiedCandidates(fixture.tabId)).map((item) => item.candidateId),
      original.map((item) => item.candidateId),
      'failed preparation must not delete reviewed temporary results',
    )
    await fixture.projects.updateGenerationDraft(fixture.tabId, {
      kind: 'sampling-pair',
      sampler: 'DPM++ 2M',
      scheduler: 'Karras',
    })
    const replaced = await fixture.controller.generate(fixture.tabId, {
      ...request,
      confirmation: {
        candidateIds: review.candidateIds,
        unfinishedJobIds: review.unfinishedJobIds,
      },
    })
    assert.equal(replaced.kind, 'queued')
    await waitForState(
      fixture.controller,
      fixture.tabId,
      (state) => state.phase === 'idle' && state.jobs.length === 0,
    )
    const now = await fixture.staging.listVerifiedCandidates(fixture.tabId)
    assert.equal(now.length, 4)
    assert.ok(now.every((item) => !review.candidateIds.includes(item.candidateId)))
  })
})

test('a known queue publication refusal retains the exact reviewed PNG and candidate', async () => {
  let batchCommit = 0
  await withFixture(
    async (fixture) => {
      const request = { documentId: fixture.documentId, iterations: 1 }
      const first = await fixture.controller.generate(fixture.tabId, request)
      assert.equal(first.kind, 'queued')
      await waitForState(
        fixture.controller,
        fixture.tabId,
        (state) => state.phase === 'idle' && state.jobs.length === 0,
      )
      const original = await fixture.staging.listVerifiedCandidates(fixture.tabId)
      assert.equal(original.length, 4)
      const pngBefore = await readFile(original[0].assetPath)
      const review = await fixture.controller.generate(fixture.tabId, request)
      assert.equal(review.kind, 'confirmation-required')
      if (review.kind !== 'confirmation-required') {
        return
      }
      await assert.rejects(
        fixture.controller.generate(fixture.tabId, {
          ...request,
          confirmation: {
            candidateIds: review.candidateIds,
            unfinishedJobIds: review.unfinishedJobIds,
          },
        }),
      )
      assert.deepEqual(
        (await fixture.staging.listVerifiedCandidates(fixture.tabId)).map(
          (item) => item.candidateId,
        ),
        original.map((item) => item.candidateId),
      )
      assert.deepEqual(await readFile(original[0].assetPath), pngBefore)
      assert.deepEqual(
        await fixture.queue.listUnfinishedByProjectDocument(fixture.tabId, fixture.documentId),
        [],
      )
    },
    {
      beforeBatchCommit: async () => {
        batchCommit += 1
        if (batchCommit === 2) {
          throw new Error('known queue refusal before batch commit')
        }
      },
    },
  )
})

test('failed old-result cleanup cancels the newly admitted batch and fences another Generate', async () => {
  await withFixture(async (fixture) => {
    const request = { documentId: fixture.documentId, iterations: 1 }
    await fixture.controller.generate(fixture.tabId, request)
    await waitForState(
      fixture.controller,
      fixture.tabId,
      (state) => state.phase === 'idle' && state.jobs.length === 0,
    )
    const original = await fixture.staging.listVerifiedCandidates(fixture.tabId)
    const review = await fixture.controller.generate(fixture.tabId, request)
    assert.equal(review.kind, 'confirmation-required')
    if (review.kind !== 'confirmation-required') {
      return
    }
    fixture.staging.discardSessions = async () => {
      throw new Error('simulated staging cleanup failure')
    }
    await assert.rejects(
      fixture.controller.generate(fixture.tabId, {
        ...request,
        confirmation: {
          candidateIds: review.candidateIds,
          unfinishedJobIds: review.unfinishedJobIds,
        },
      }),
      { code: 'GENERATION_REPLACEMENT_UNCERTAIN' },
    )
    const state = await fixture.controller.getState(fixture.tabId)
    assert.equal(state.phase, 'blocked')
    assert.deepEqual(state.jobs, [])
    assert.deepEqual(
      (await fixture.staging.listVerifiedCandidates(fixture.tabId)).map((item) => item.candidateId),
      original.map((item) => item.candidateId),
    )
    await assert.rejects(fixture.controller.generate(fixture.tabId, request), {
      code: 'GENERATION_BLOCKED',
    })
  })
})

test('Project edits during a paused runtime lease cannot replace the captured draft', async () => {
  await withFixture(async (fixture) => {
    const entered = signal()
    const release = signal()
    fixture.runtime.beforeCompose = async () => {
      entered.resolve()
      await release.promise
    }
    const pending = fixture.controller.generate(fixture.tabId, {
      documentId: fixture.documentId,
      iterations: 1,
    })
    await entered.promise
    await fixture.projects.updateGenerationDraft(fixture.tabId, {
      kind: 'positive-prompt',
      text: 'a later edited prompt',
    })
    await fixture.projects.updateGenerationDraft(fixture.tabId, {
      kind: 'dynamic-prompt',
      value: { maxPrompts: 1, seedBehavior: 'per-iteration' },
    })
    release.resolve()
    const result = await pending
    assert.equal(result.kind, 'queued')
    if (result.kind !== 'queued') {
      return
    }
    assert.equal(result.jobIds.length, 4, 'the captured dynamic settings remain effective')
    const frozen = await Promise.all(result.jobIds.map((id) => fixture.queue.loadVerifiedInput(id)))
    assert.deepEqual(
      frozen.map((item) => item.payload.context.prompts.positive),
      ['red lantern', 'red lantern', 'blue lantern', 'blue lantern'],
    )
    assert.deepEqual(
      frozen.map((item) => item.payload.context.sampling.seed),
      [42, 43, 44, 45],
    )
  })
})

test('Project input is captured before an asynchronous replacement-impact read', async () => {
  await withFixture(async (fixture) => {
    const entered = signal()
    const release = signal()
    const readUnfinished = fixture.queue.listUnfinishedByProjectDocument.bind(fixture.queue)
    fixture.queue.listUnfinishedByProjectDocument = async (...args) => {
      entered.resolve()
      await release.promise
      return await readUnfinished(...args)
    }
    const pending = fixture.controller.generate(fixture.tabId, {
      documentId: fixture.documentId,
      iterations: 1,
    })
    await entered.promise
    await fixture.projects.updateGenerationDraft(fixture.tabId, {
      kind: 'positive-prompt',
      text: 'edited while results were being read',
    })
    release.resolve()
    const result = await pending
    assert.equal(result.kind, 'queued')
    if (result.kind !== 'queued') {
      return
    }
    const frozen = await fixture.queue.loadVerifiedInput(result.jobIds[0])
    assert.equal(frozen.payload.context.prompts.positive, 'red lantern')
  })
})

test('current Cancel requires its exact running ID and awaits worker exit', async () => {
  await withFixture(async (fixture) => {
    const entered = signal()
    fixture.runtime.beforeGenerate = async () => {
      entered.resolve()
      await new Promise<void>(() => undefined)
    }
    const result = await fixture.controller.generate(fixture.tabId, {
      documentId: fixture.documentId,
      iterations: 1,
    })
    assert.equal(result.kind, 'queued')
    await entered.promise
    const running = await waitForState(
      fixture.controller,
      fixture.tabId,
      (state) => state.runningJobId !== null,
    )
    await assert.rejects(
      fixture.controller.cancelCurrent(fixture.tabId, fixture.documentId, randomUUID()),
      { code: 'GENERATION_NO_CURRENT_JOB' },
    )
    assert.equal(fixture.runtime.closedCount, 1, 'admission worker already exited')
    const canceled = await fixture.controller.cancelCurrent(
      fixture.tabId,
      fixture.documentId,
      running.runningJobId!,
    )
    assert.ok(canceled.jobs.every((job) => job.id !== running.runningJobId))
    assert.ok(fixture.runtime.closedCount >= 2, 'cancel awaited inference worker exit')
    assert.equal((await fixture.staging.listVerifiedCandidates(fixture.tabId)).length, 0)
  })
})

test('unavailable runtime refuses safely without publishing or deleting prior results', async () => {
  await withFixture(async (fixture) => {
    fixture.runtime.available = false
    await assert.rejects(
      fixture.controller.generate(fixture.tabId, {
        documentId: fixture.documentId,
        iterations: 1,
      }),
      { code: 'GENERATION_RUNTIME_UNAVAILABLE' },
    )
    const state = await fixture.controller.getState(fixture.tabId)
    assert.equal(state.phase, 'idle')
    assert.equal(state.error?.code, 'GENERATION_RUNTIME_UNAVAILABLE')
    assert.deepEqual(state.jobs, [])
    assert.deepEqual(await fixture.staging.listVerifiedCandidates(fixture.tabId), [])
  })
})

test('generation state never echoes worker paths from a failed request', async () => {
  await withFixture(async (fixture) => {
    fixture.runtime.beforeCompose = async () => {
      throw Object.assign(new Error('private path /home/person/secret.safetensors'), {
        code: 'WORKER_REQUEST_FAILED',
      })
    }
    await assert.rejects(
      fixture.controller.generate(fixture.tabId, {
        documentId: fixture.documentId,
        iterations: 1,
      }),
      { code: 'WORKER_REQUEST_FAILED' },
    )
    const state = await fixture.controller.getState(fixture.tabId)
    assert.equal(state.phase, 'idle')
    assert.equal(state.error?.code, 'WORKER_REQUEST_FAILED')
    assert.ok(!state.error?.message.includes('/home/person/'))
    assert.deepEqual(state.jobs, [])
  })
})

test('Generate IPC error projection retains actionable owned refusals and hides arbitrary paths', () => {
  assert.deepEqual(
    toProjectGenerationActionApiError(
      new GenerationBatchPlanError('BATCH_TOO_LARGE', 'The planned jobs exceed the limit.'),
    ),
    { code: 'BATCH_TOO_LARGE', message: 'The planned jobs exceed the limit.' },
  )
  assert.deepEqual(
    toProjectGenerationActionApiError(
      new GenerationPreparationError('GENERATION_SAMPLING_UNSUPPORTED', 'Choose a sampler.'),
    ),
    { code: 'GENERATION_SAMPLING_UNSUPPORTED', message: 'Choose a sampler.' },
  )
  assert.deepEqual(
    toProjectGenerationActionApiError(
      new IllustriousJobError('GENERATION_TARGET_UNSUPPORTED', 'Use a supported target.'),
    ),
    { code: 'GENERATION_TARGET_UNSUPPORTED', message: 'Use a supported target.' },
  )
  assert.deepEqual(
    toProjectGenerationActionApiError(
      Object.assign(new Error('private /home/person/weights.safetensors'), {
        code: 'WORKER_REQUEST_FAILED',
      }),
    ),
    {
      code: 'WORKER_REQUEST_FAILED',
      message: 'The image runtime could not complete this generation request.',
    },
  )
  assert.deepEqual(
    toProjectGenerationActionApiError(new Error('private /home/person/weights.safetensors')),
    {
      code: 'GENERATION_FAILED',
      message: 'Generation could not continue. Review the settings and try again.',
    },
  )
})

test('shutdown fences a paused preparation before any queue publication', async () => {
  await withFixture(async (fixture) => {
    const entered = signal()
    const release = signal()
    fixture.runtime.beforeCompose = async () => {
      entered.resolve()
      await release.promise
    }
    const pending = fixture.controller.generate(fixture.tabId, {
      documentId: fixture.documentId,
      iterations: 1,
    })
    await entered.promise
    const stopping = fixture.controller.shutdown()
    release.resolve()
    await assert.rejects(pending, { code: 'GENERATION_CLOSED' })
    await stopping
    assert.deepEqual(
      await fixture.queue.listUnfinishedByProjectDocument(fixture.tabId, fixture.documentId),
      [],
    )
    assert.equal((await fixture.controller.getState(fixture.tabId)).phase, 'closed')
  })
})

async function makeFailedSource(fixture: Fixture) {
  fixture.runtime.beforeGenerate = async () => {
    if (fixture.runtime.generated.length === 1) {
      throw new Error('controlled first-job failure')
    }
  }
  const result = await fixture.controller.generate(fixture.tabId, {
    documentId: fixture.documentId,
    iterations: 1,
  })
  assert.equal(result.kind, 'queued')
  await waitForState(
    fixture.controller,
    fixture.tabId,
    (state) => state.phase === 'idle' && state.jobs.length === 0,
  )
  const page = await fixture.controller.getQueue()
  assert.equal(page.counts.failed, 1)
  assert.equal(page.counts.completed, 3)
  const source = page.items.find((item) => item.status === 'failed')!
  fixture.runtime.beforeGenerate = null
  return { id: source.id, statusSequence: source.statusSequence }
}

test('Queue Manager Retry uses frozen operation and preserves old candidates and saved document', async () => {
  await withFixture(async (fixture) => {
    const review = await makeFailedSource(fixture)
    const before = await fixture.staging.listVerifiedCandidates(fixture.tabId)
    const saved = await readFile(fixture.packagePath)
    await fixture.projects.updateGenerationDraft(fixture.tabId, {
      kind: 'positive-prompt',
      text: 'current edited prompt',
    })
    await fixture.projects.updateGenerationDraft(fixture.tabId, {
      kind: 'seed',
      policy: 'fixed',
      value: 99,
    })
    await fixture.controller.retryJob(review)
    await waitForState(
      fixture.controller,
      fixture.tabId,
      (state) => state.phase === 'idle' && state.jobs.length === 0,
    )
    const retried = fixture.runtime.generated.at(-1)!
    assert.equal(retried.job.prompts.positive, 'red lantern')
    assert.equal(retried.job.sampling.seed, 42)
    assert.deepEqual(retried.job.bbox, { height: 64, width: 64, x: 0, y: 0 })
    const candidates = await fixture.staging.listVerifiedCandidates(fixture.tabId)
    assert.equal(candidates.length, 4)
    assert.ok(
      before.every((old) => candidates.some((item) => item.candidateId === old.candidateId)),
    )
    assert.deepEqual(await readFile(fixture.packagePath), saved)
    assert.equal(
      fixture.projects.getOpenTabs()[0].generationDraft.positivePrompt.text,
      'current edited prompt',
    )
    const page = await fixture.controller.getQueue()
    assert.equal(page.counts.failed, 1, 'retry retains source history')
    assert.equal(page.counts.completed, 4)
    assert.ok(page.items.every((item) => item.projectName === 'Generate actions'))
    await assert.rejects(fixture.controller.retryJob(review), {
      code: 'GENERATION_INVALID_REQUEST',
    })
    assert.equal(
      (await fixture.controller.getQueue()).items.length,
      5,
      'one reviewed source creates one attempt',
    )
  })
})

test('Queue Manager Retry refuses a different document reopened at the same path', async () => {
  await withFixture(async (fixture) => {
    const review = await makeFailedSource(fixture)
    const leases = fixture.runtime.leaseCount
    const original = await fixture.database.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .execute()
    await fixture.projects.close(fixture.tabId)
    const second = await fixture.projects.create({
      height: 64,
      title: 'Replacement document',
      width: 64,
    })
    await fixture.projects.save(second.id)
    const index = new ProjectIndexRepository(fixture.database.db)
    const secondPath = (await index.getProject(second.id))!.canonicalPath
    await copyFile(secondPath, fixture.packagePath)
    const opened = await fixture.projects.open(fixture.tabId)
    assert.equal(opened.kind, 'opened')
    assert.notEqual(fixture.projects.getOpenDocumentId(fixture.tabId), fixture.documentId)
    await assert.rejects(fixture.controller.retryJob(review), {
      code: 'GENERATION_DOCUMENT_CHANGED',
    })
    assert.equal(
      fixture.runtime.leaseCount,
      leases,
      'identity refusal precedes runtime reservation',
    )
    assert.deepEqual(
      await fixture.database.db.selectFrom('generation_queue_item').selectAll().execute(),
      original,
    )
  })
})

test('Queue Manager history and terminal cleanup work without runtime and preserve candidate bytes and seed', async () => {
  await withFixture(async (fixture) => {
    const review = await makeFailedSource(fixture)
    const candidates = await fixture.staging.listVerifiedCandidates(fixture.tabId)
    const pngs = await Promise.all(candidates.map((candidate) => readFile(candidate.assetPath)))
    const seed = await fixture.staging.readLastActualSeed(fixture.tabId, fixture.documentId)
    const document = fixture.projects.getOpenDocumentForAcceptance(fixture.tabId)
    const saved = await readFile(fixture.packagePath)
    fixture.runtime.available = false
    await assert.rejects(fixture.controller.retryJob(review), {
      code: 'GENERATION_RUNTIME_UNAVAILABLE',
    })
    const page = await fixture.controller.getQueue()
    assert.equal(
      page.items.find((item) => item.id === review.id)!.statusSequence,
      review.statusSequence,
    )
    await fixture.controller.deleteJob(review)
    assert.equal(await fixture.controller.pruneQueue(['completed', 'failed', 'canceled']), 3)
    assert.equal((await fixture.controller.getQueue()).items.length, 0)
    assert.deepEqual(
      await fixture.staging.readLastActualSeed(fixture.tabId, fixture.documentId),
      seed,
    )
    assert.deepEqual(fixture.projects.getOpenDocumentForAcceptance(fixture.tabId), document)
    assert.deepEqual(await readFile(fixture.packagePath), saved)
    assert.deepEqual(
      await Promise.all(candidates.map((candidate) => readFile(candidate.assetPath))),
      pngs,
    )
    assert.equal((await fixture.staging.listVerifiedCandidates(fixture.tabId)).length, 3)
  })
})

test('Queue Manager pending Cancel is scoped to the reviewed revision and leaves the running neighbor alive', async () => {
  await withFixture(async (fixture) => {
    const entered = signal()
    fixture.runtime.beforeGenerate = async () => {
      entered.resolve()
      await new Promise<void>(() => undefined)
    }
    await fixture.controller.generate(fixture.tabId, {
      documentId: fixture.documentId,
      iterations: 1,
    })
    await entered.promise
    const page = await fixture.controller.getQueue()
    const pending = page.items.find((item) => item.status === 'pending')!
    const running = page.items.find((item) => item.status === 'running')!
    const leases = fixture.runtime.closedCount
    await fixture.controller.cancelJob({ id: pending.id, statusSequence: pending.statusSequence })
    const after = await fixture.controller.getQueue()
    assert.equal(after.items.find((item) => item.id === pending.id)!.status, 'canceled')
    assert.equal(after.items.find((item) => item.id === running.id)!.status, 'running')
    assert.equal(
      fixture.runtime.closedCount,
      leases,
      'pending cancellation must not close the neighbor worker',
    )
    await assert.rejects(
      fixture.controller.cancelJob({ id: running.id, statusSequence: running.statusSequence - 1 }),
      { code: 'QUEUE_STATUS_CONFLICT' },
    )
    assert.equal(
      (await fixture.controller.getQueue()).items.find((item) => item.id === running.id)!
        .cancelRequested,
      false,
    )
  })
})

test('Queue Manager Retry preflight refusal retains source revision and existing staging', async () => {
  await withFixture(async (fixture) => {
    const review = await makeFailedSource(fixture)
    const before = await fixture.controller.getQueue()
    const candidates = await fixture.staging.listVerifiedCandidates(fixture.tabId)
    // Controlled storage refusal at the subordinate capacity boundary; real retry publication
    // and source CAS remain the subjects, not a fake retry implementation.
    fixture.staging.preflightBatchCapacity = async () => {
      throw Object.assign(new Error('controlled capacity refusal'), {
        code: 'STAGING_CAPACITY_EXCEEDED',
      })
    }
    await assert.rejects(fixture.controller.retryJob(review), { code: 'STAGING_CAPACITY_EXCEEDED' })
    assert.deepEqual(await fixture.controller.getQueue(), before)
    assert.deepEqual(
      (await fixture.staging.listVerifiedCandidates(fixture.tabId)).map((item) => item.candidateId),
      candidates.map((item) => item.candidateId),
    )
  })
})

test('shutdown during durable Retry copy prevents publication and waits admission', async () => {
  const entered = signal()
  const release = signal()
  await withFixture(
    async (fixture) => {
      const review = await makeFailedSource(fixture)
      const before = await fixture.queue.listManagerPage()
      const retry = fixture.controller.retryJob(review)
      await entered.promise
      const stopped = fixture.controller.shutdown()
      release.resolve()
      await assert.rejects(retry, { code: 'QUEUE_PROJECT_CLOSING' })
      await stopped
      assert.deepEqual(await fixture.queue.listManagerPage(), before)
    },
    {
      afterRetryInputPublish: async () => {
        entered.resolve()
        await release.promise
      },
    },
  )
})

test('confirmed Project close shares Retry gate and cancels its late admitted job before closing', async () => {
  const entered = signal()
  const release = signal()
  await withFixture(
    async (fixture) => {
      const review = await makeFailedSource(fixture)
      const saved = await readFile(fixture.packagePath)
      const retry = fixture.controller.retryJob(review)
      await entered.promise
      const closing = fixture.closeOwner.close(fixture.tabId, {
        confirmCloseImpact: true,
        discardDocument: false,
      })
      assert.equal(fixture.projects.getOpenDocumentId(fixture.tabId), fixture.documentId)
      assert.equal(
        (await fixture.staging.listVerifiedCandidates(fixture.tabId)).length,
        3,
        'close must wait the admitted operation',
      )
      release.resolve()
      await retry
      await closing
      assert.equal(fixture.projects.getOpenDocumentId(fixture.tabId), null)
      assert.deepEqual(await fixture.queue.listUnfinishedByProject(fixture.tabId), [])
      assert.deepEqual(await fixture.staging.listVerifiedCandidates(fixture.tabId), [])
      assert.deepEqual(
        await readFile(fixture.packagePath),
        saved,
        'confirmed staging loss still does not Save document changes',
      )
    },
    {
      afterRetryInputPublish: async () => {
        entered.resolve()
        await release.promise
      },
    },
  )
})

test('Retry verifies installed checkpoint again before consuming the reviewed source', async () => {
  await withFixture(async (fixture) => {
    const review = await makeFailedSource(fixture)
    const source = await fixture.queue.loadVerifiedInput(review.id)
    const before = await fixture.controller.getQueue()
    await writeFile(source.payload.context.model.managedPath, 'corrupted replacement weights')
    await assert.rejects(fixture.controller.retryJob(review))
    assert.deepEqual(await fixture.controller.getQueue(), before)
    assert.equal(fixture.runtime.generated.length, 4)
    assert.equal((await fixture.staging.listVerifiedCandidates(fixture.tabId)).length, 3)
  })
})

test('Retry consumes retained verified PNG bytes instead of reopening the display pathname', async () => {
  await withFixture(async (fixture) => {
    const review = await makeFailedSource(fixture)
    const load = fixture.queue.loadVerifiedRetryInput.bind(fixture.queue)
    fixture.queue.loadVerifiedRetryInput = async (id) => ({
      ...(await load(id)),
      targetPath: path.join(fixture.root, 'not-a-retained-file.png'),
    })
    await fixture.controller.retryJob(review)
    await waitForState(
      fixture.controller,
      fixture.tabId,
      (state) => state.phase === 'idle' && state.jobs.length === 0,
    )
    assert.equal(fixture.runtime.generated.at(-1)!.job.prompts.positive, 'red lantern')
    assert.equal((await fixture.staging.listVerifiedCandidates(fixture.tabId)).length, 4)
  })
})

test('Queue Manager may retry cancel after unconfirmed exit without releasing the running slot early', async () => {
  await withFixture(async (fixture) => {
    const entered = signal()
    fixture.runtime.beforeGenerate = async () => {
      entered.resolve()
      await new Promise<void>(() => undefined)
    }
    await fixture.controller.generate(fixture.tabId, {
      documentId: fixture.documentId,
      iterations: 1,
    })
    await entered.promise
    const running = (await fixture.controller.getQueue()).items.find(
      (item) => item.status === 'running',
    )!
    fixture.runtime.closeFailures = 2
    await assert.rejects(
      fixture.controller.cancelJob({ id: running.id, statusSequence: running.statusSequence }),
      { code: 'WORKER_EXIT_UNCONFIRMED' },
    )
    const requested = (await fixture.controller.getQueue()).items.find(
      (item) => item.id === running.id,
    )!
    assert.equal(requested.status, 'running')
    assert.equal(requested.cancelRequested, true)
    assert.equal(
      fixture.runtime.generated.length,
      1,
      'no pending neighbor takes the unconfirmed worker slot',
    )
    await fixture.controller.cancelJob({
      id: requested.id,
      statusSequence: requested.statusSequence,
    })
    assert.equal(
      (await fixture.controller.getQueue()).items.find((item) => item.id === running.id)!.status,
      'canceled',
    )
    assert.equal(fixture.runtime.generated.length, 1)
  })
})
