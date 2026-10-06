import { ANIMA_SAMPLING_METHOD_KEYS } from '../../shared/projects/anima-sampling-method.js'
import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import type { GenerationWorkerRequest, GenerationWorkerTransport } from './generation-processor.js'
import type { GenerationQueueTestHooks } from './generation-queue.js'
import type { InferenceWorkerReady } from './illustrious-txt2img-job.js'
import type { AnimaProjectPreparationFixture } from './test-fixtures/anima-project-preparation.js'
import type { ProjectWorkerClient } from './worker-client.js'

import {
  ProjectGenerationActionController,
  toProjectGenerationActionApiError,
} from './generation-action-controller.js'
import { GenerationDispatchCoordinator } from './generation-dispatch-coordinator.js'
import { GenerationOrchestrator } from './generation-orchestrator.js'
import { GenerationProcessor } from './generation-processor.js'
import { GenerationQueueRepository } from './generation-queue.js'
import { readIgsPackage } from './igs-package.js'
import { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import { ProjectIndexRepository } from './project-index.js'
import { acceptedOutputPngFixture } from './test-fixtures/accepted-provenance.js'
import { ANIMA_BATCH_READY } from './test-fixtures/anima-batch.js'
import {
  animaProjectComposerAvailable,
  withAnimaProjectPreparationFixture,
} from './test-fixtures/anima-project-preparation.js'

type PublicOwner = Awaited<ReturnType<typeof publicOwner>>

/**
 * Only inference and its readiness/exit are controlled. Composition uses the real derivatives
 * worker; Project capture, SQL/model files, registry qualification, queue, processor, staging and
 * receipts remain real. The fixture's tiny trusted companions/structural qualifier are named
 * substitutions and do not prove model quality, numerical inference or CUDA/runtime ownership.
 */
class ControlledAnimaRuntime {
  available = true
  beforeGenerate: (() => Promise<void>) | null = null
  beforePreparation: (() => Promise<void>) | null = null
  compositions = 0
  generated: GenerationWorkerRequest[] = []
  leases = 0
  preparations = 0
  ready: InferenceWorkerReady = structuredClone(ANIMA_BATCH_READY)
  private held = false

  constructor(
    private readonly fixture: AnimaProjectPreparationFixture,
    private readonly output: Buffer,
  ) {}

  async getStatus() {
    return null
  }
  async readQualifiedInferenceReady() {
    return this.available ? structuredClone(this.ready) : null
  }
  async retryUnconfirmedGenerationExit() {
    return !this.held
  }

  async withGenerationAdmission<T>(
    _scratch: string,
    use: (ready: InferenceWorkerReady) => Promise<T>,
  ) {
    return this.available ? await use(structuredClone(this.ready)) : null
  }

  async withGenerationPreparation<T>(
    _scratch: string,
    use: (input: {
      inferenceReady: InferenceWorkerReady
      targetWorker: Pick<ProjectWorkerClient, 'composeTarget'>
    }) => Promise<T>,
  ): Promise<T | null> {
    if (!this.available) {
      return null
    }
    this.preparations++
    const inferenceReady = structuredClone(this.ready)
    await this.beforePreparation?.()
    return await use({
      inferenceReady,
      targetWorker: {
        composeTarget: async (input) => {
          this.compositions++
          return await this.fixture.worker.composeTarget(input)
        },
      },
    })
  }

  async withGenerationWorker<T>(
    _scratch: string,
    use: (worker: GenerationWorkerTransport) => Promise<T>,
  ) {
    if (!this.available) {
      return null
    }
    assert.equal(this.held, false, 'the controlled inference peer has one borrowed transport')
    this.held = true
    this.leases++
    const stopped = signal()
    let closed = false
    const close = async () => {
      closed = true
      stopped.resolve()
    }
    try {
      return await use({
        close,
        generate: async (request, onProgress) => {
          assert.ok(
            request.type === 'generate-anima-txt2img' || request.type === 'generate-anima-img2img',
          )
          this.generated.push(structuredClone(request))
          await Promise.race([this.beforeGenerate?.() ?? Promise.resolve(), stopped.promise])
          if (closed) {
            throw new Error('Controlled peer exit confirmed')
          }
          if (request.job.sampling.totalSteps > 0) {
            onProgress?.({
              step: request.job.sampling.totalSteps,
              totalSteps: request.job.sampling.totalSteps,
            })
          }
          await writeFile(request.job.output.pngPath, this.output, { flag: 'wx', mode: 0o600 })
          return {
            outputPath: request.job.output.pngPath,
            protocolVersion: '1',
            requestId: request.requestId,
            seed: request.job.sampling.seed,
            type: 'generation-done',
          }
        },
        ready: structuredClone(this.ready),
      })
    } finally {
      await close()
      this.held = false
    }
  }
}

function signal() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function publicOwner(
  fixture: AnimaProjectPreparationFixture,
  hooks: GenerationQueueTestHooks = {},
) {
  const queue = new GenerationQueueRepository(fixture.database.db, fixture.root, hooks)
  await queue.recoverAfterRestart()
  const runtime = new ControlledAnimaRuntime(fixture, await acceptedOutputPngFixture(64, 64))
  const processor = new GenerationProcessor(
    queue,
    fixture.staging,
    fixture.modelService,
    fixture.scratch,
  )
  const orchestrator = new GenerationOrchestrator(
    fixture.service,
    new ProjectIndexRepository(fixture.database.db),
    fixture.modelService,
    queue,
    fixture.staging,
    processor,
    fixture.scratch,
  )
  const dispatch = new GenerationDispatchCoordinator(
    runtime,
    orchestrator,
    processor,
    fixture.scratch,
  )
  const controller = new ProjectGenerationActionController({
    dispatch,
    gate: new ProjectGenerationOperationGate(),
    models: fixture.modelService,
    orchestrator,
    processor,
    projects: fixture.service,
    queue,
    runtime,
    scratchBasePath: fixture.scratch,
    staging: fixture.staging,
  })
  return { controller, orchestrator, processor, queue, runtime }
}

async function queued(owner: PublicOwner, tabId: string, documentId: string, iterations = 1) {
  const result = await owner.controller.generate(tabId, { documentId, iterations })
  assert.equal(result.kind, 'queued')
  if (result.kind !== 'queued') {
    throw new Error('Expected a durable batch')
  }
  return result
}

/** Wait for the real owner's terminal transition rather than sleeping before asserting absence. */
async function settled(owner: PublicOwner, jobIds: readonly string[]) {
  const expected = new Set(jobIds)
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Actual generation did not settle'))
    }, 15_000)
    let reading = false
    let again = false
    const cleanup = () => {
      clearTimeout(timeout)
      unsubscribe()
    }
    const read = async () => {
      if (reading) {
        again = true
        return
      }
      reading = true
      do {
        again = false
        const rows = (await owner.queue.listManagerPage()).items.filter((entry) =>
          expected.has(entry.id),
        )
        if (
          rows.length === expected.size &&
          rows.every((row) => row.status !== 'running' && row.status !== 'pending')
        ) {
          cleanup()
          resolve()
          return
        }
      } while (again)
      reading = false
    }
    const unsubscribe = owner.processor.onChanged(() => {
      void read().catch((error: unknown) => {
        cleanup()
        reject(error)
      })
    })
    void read().catch((error: unknown) => {
      cleanup()
      reject(error)
    })
  })
}

const options = { skip: !animaProjectComposerAvailable(), timeout: 30_000 }

for (const method of ANIMA_SAMPLING_METHOD_KEYS) {
  test(
    `public Anima Generate → exact native ${method} queue → real staging, without changing Project or .igs`,
    options,
    async () => {
      await withAnimaProjectPreparationFixture(async (fixture) => {
        const project = await fixture.importProject({
          draft: {
            sampling: {
              animaMethod: method,
              cfgScale: 5,
              denoisingStrength: null,
              sampler: 'inactive pair',
              scheduler: 'inactive schedule',
              steps: 4,
            },
          },
        })
        const owner = await publicOwner(fixture)
        const before = await readFile(project.packagePath)
        const document = structuredClone(
          fixture.service.getOpenDocumentForAcceptance(project.tabId)!.document,
        )
        const scratch = await readdir(fixture.scratch)
        try {
          assert.equal((await owner.controller.getState(project.tabId)).animaSupported, true)
          const result = await queued(owner, project.tabId, project.document.documentId, 2)
          assert.equal(result.jobIds.length, 4)
          await settled(owner, result.jobIds)
          const candidates = await fixture.staging.listVerifiedCandidates(project.tabId)
          assert.equal(candidates.length, 4)
          assert.deepEqual(
            owner.runtime.generated.map((request) => request.job.sampling.seed),
            [0xff_ff_ff_ff, 0, 0xff_ff_ff_ff, 0],
          )
          assert.deepEqual(
            owner.runtime.generated.map((request) => request.job.sampling.scheduler),
            [method, method, method, method],
          )
          for (const candidate of candidates) {
            const saved = await owner.queue.loadVerifiedRetryInput(candidate.queueItemId)
            assert.equal(saved.payload.kind, 'anima-txt2img')
            if (saved.payload.kind !== 'anima-txt2img') {
              throw new Error('Expected captured native record')
            }
            assert.equal(saved.payload.context.model.architecture, 'anima-base-1.0')
            assert.equal(
              saved.payload.context.model.checkpoint.reference.fileSha256,
              fixture.first.reference.fileSha256,
            )
            assert.equal(
              saved.payload.context.model.qwen3Encoder.managedPath,
              fixture.qwen.managedPath,
            )
            assert.equal(saved.payload.context.model.vae.managedPath, fixture.vae.managedPath)
            assert.equal(saved.payload.context.sampling.animaMethod, method)
            assert.equal(saved.payload.workerJob.sampling.scheduler, method)
            assert.equal(saved.payload.context.loras[0].weight, -0.5)
            assert.equal(
              saved.payload.context.loras[0].reference.fileSha256,
              fixture.lora.reference.fileSha256,
            )
            assert.ok(
              saved.payload.workerJob.prompts.positive.spans.some((span) => span.weight === 1.5),
            )
            assert.ok(
              saved.payload.workerJob.prompts.negative.spans.some((span) => span.weight === 0.5),
            )
            assert.ok(!/[{}]/.test(saved.payload.context.prompts.positive))
            assert.deepEqual(
              await fixture.staging.readVerifiedCandidatePng({
                candidateId: candidate.candidateId,
                imageSha256: candidate.image.sha256,
                localProjectKey: project.tabId,
                stagingSessionId: candidate.stagingSessionId,
              }),
              await acceptedOutputPngFixture(64, 64),
            )
          }
          assert.equal(
            await fixture.staging.readLastActualSeed(project.tabId, project.document.documentId),
            0,
          )
          assert.deepEqual(
            fixture.service.getOpenDocumentForAcceptance(project.tabId)!.document,
            document,
          )
          assert.deepEqual(await readFile(project.packagePath), before)
          assert.deepEqual((await readIgsPackage(project.packagePath)).project, project.document)
          await owner.controller.shutdown()
          assert.deepEqual(await readdir(fixture.scratch), scratch)
        } finally {
          await owner.controller.shutdown()
        }
      })
    },
  )
}

test(
  'public opaque Anima Generate uses captured target/strength and exact original checkpoint despite later edits',
  options,
  async () => {
    await withAnimaProjectPreparationFixture(async (fixture) => {
      const project = await fixture.importProject({ raster: true })
      const owner = await publicOwner(fixture)
      const before = await readFile(project.packagePath)
      const entered = signal()
      const release = signal()
      owner.runtime.beforePreparation = async () => {
        entered.resolve()
        await release.promise
      }
      try {
        const pending = owner.controller.generate(project.tabId, {
          documentId: project.document.documentId,
          iterations: 1,
        })
        await entered.promise
        await fixture.service.updateGenerationDraft(project.tabId, {
          kind: 'positive-prompt',
          text: 'later prompt',
        })
        await fixture.service.updateGenerationDraft(project.tabId, {
          kind: 'seed',
          policy: 'fixed',
          value: 123,
        })
        await fixture.service.updateGenerationDraft(project.tabId, {
          kind: 'anima-method',
          value: 'euler',
        })
        await fixture.service.setGenerationModel(project.tabId, fixture.second.reference)
        await fixture.service.setPrimaryBbox(project.tabId, {
          height: 64,
          width: 64,
          x: 800,
          y: 900,
        })
        release.resolve()
        const result = await pending
        assert.equal(result.kind, 'queued')
        if (result.kind !== 'queued') {
          throw new Error('Expected captured batch')
        }
        await settled(owner, result.jobIds)
        assert.equal(owner.runtime.generated.length, 2)
        for (const request of owner.runtime.generated) {
          assert.equal(request.type, 'generate-anima-img2img')
          assert.equal(request.job.sampling.scheduler, 'heun')
          assert.equal(request.job.sampling.strength, 0.5)
          assert.equal(request.job.sampling.seed, 0xff_ff_ff_ff)
          assert.equal(request.job.model.checkpoint.sha256, fixture.first.reference.fileSha256)
          assert.deepEqual(request.job.bbox, project.document.primaryBbox)
          assert.match(request.job.prompts.positive.cleanedText, /lantern/)
          assert.doesNotMatch(request.job.prompts.positive.cleanedText, /later/)
        }
        assert.equal(
          fixture.service.getOpenDocumentForAcceptance(project.tabId)!.document.generationDraft
            .positivePrompt.text,
          'later prompt',
        )
        assert.deepEqual(await readFile(project.packagePath), before)
      } finally {
        release.resolve()
        await owner.controller.shutdown()
      }
    })
  },
)

test(
  'public Anima declines incomplete runtime before target composition and keeps no durable inputs',
  options,
  async () => {
    await withAnimaProjectPreparationFixture(async (fixture) => {
      const project = await fixture.importProject()
      const owner = await publicOwner(fixture)
      owner.runtime.ready.capabilities = owner.runtime.ready.capabilities.filter(
        (value) => value !== 'anima-prompt-weighting',
      )
      try {
        assert.equal((await owner.controller.getState(project.tabId)).animaSupported, false)
        await assert.rejects(
          queued(owner, project.tabId, project.document.documentId),
          (error: unknown) => {
            assert.equal(toProjectGenerationActionApiError(error).code, 'INFERENCE_UNAVAILABLE')
            return true
          },
        )
        assert.equal(owner.runtime.compositions, 0)
        assert.equal(owner.runtime.preparations, 0)
        assert.equal((await owner.queue.listManagerPage()).items.length, 0)
        assert.equal((await fixture.staging.listVerifiedCandidates(project.tabId)).length, 0)
      } finally {
        await owner.controller.shutdown()
      }
    })
  },
)

test(
  'public Anima checks the fresh admitted peer separately from advisory readiness',
  options,
  async () => {
    await withAnimaProjectPreparationFixture(async (fixture) => {
      const project = await fixture.importProject()
      const owner = await publicOwner(fixture)
      owner.runtime.readQualifiedInferenceReady = async () => structuredClone(ANIMA_BATCH_READY)
      owner.runtime.ready.capabilities = owner.runtime.ready.capabilities.filter(
        (value) => value !== 'anima-flow-sampling',
      )
      try {
        await assert.rejects(
          queued(owner, project.tabId, project.document.documentId),
          (error: unknown) => {
            assert.equal(toProjectGenerationActionApiError(error).code, 'INFERENCE_UNAVAILABLE')
            return true
          },
        )
        assert.equal(owner.runtime.preparations, 1)
        assert.equal(owner.runtime.compositions, 0)
        assert.equal((await owner.queue.listManagerPage()).items.length, 0)
      } finally {
        await owner.controller.shutdown()
      }
    })
  },
)

test(
  'public Anima rejects native authoring failures before composing or queueing',
  options,
  async (t) => {
    const cases: {
      code: string
      draft: Partial<IgsProjectDocumentV1['generationDraft']>
      name: string
    }[] = [
      {
        code: 'GENERATION_ADVANCED_UNSUPPORTED',
        draft: { cfgRescale: 0.2 },
        name: 'nonzero rescale',
      },
      {
        code: 'GENERATION_ADVANCED_UNSUPPORTED',
        draft: { vaePrecision: 'FP32' },
        name: 'manual precision',
      },
      { code: 'GENERATION_ADVANCED_UNSUPPORTED', draft: { clipSkip: 2 }, name: 'CLIP skip' },
      {
        code: 'GENERATION_SAMPLING_REQUIRED',
        draft: {
          sampling: {
            cfgScale: 5,
            denoisingStrength: null,
            sampler: 'DPM++ 2M',
            scheduler: 'Karras',
            steps: 4,
          },
        },
        name: 'missing native method',
      },
      {
        code: 'GENERATION_PROMPT_UNSUPPORTED',
        draft: { positivePrompt: { embeddingRefs: [], text: '(lantern:NaN)' } },
        name: 'invalid weighting',
      },
    ]
    for (const entry of cases) {
      await t.test(entry.name, async () => {
        await withAnimaProjectPreparationFixture(async (fixture) => {
          const project = await fixture.importProject({ draft: entry.draft })
          const owner = await publicOwner(fixture)
          try {
            await assert.rejects(
              queued(owner, project.tabId, project.document.documentId),
              (error: unknown) => {
                assert.equal(toProjectGenerationActionApiError(error).code, entry.code)
                return true
              },
            )
            assert.equal(owner.runtime.compositions, 0)
            assert.equal(owner.runtime.preparations, 0)
            assert.equal((await owner.queue.listManagerPage()).items.length, 0)
            assert.equal(
              await fixture.staging.readLastActualSeed(project.tabId, project.document.documentId),
              null,
            )
          } finally {
            await owner.controller.shutdown()
          }
        })
      })
    }
  },
)

test(
  'public Anima legacy worker refuses outpaint and unavailable Reuse without worker inference',
  options,
  async (t) => {
    for (const failure of ['outpaint', 'reuse'] as const) {
      await t.test(failure, async () => {
        await withAnimaProjectPreparationFixture(async (fixture) => {
          const project = await fixture.importProject({
            draft: failure === 'reuse' ? { seed: { policy: 'reuse', value: null } } : undefined,
            raster: failure === 'outpaint',
          })
          if (failure === 'outpaint') {
            await fixture.service.setPrimaryBbox(project.tabId, {
              height: 64,
              width: 64,
              x: 8,
              y: -3,
            })
          }
          const owner = await publicOwner(fixture)
          const before = await readFile(project.packagePath)
          try {
            await assert.rejects(
              queued(owner, project.tabId, project.document.documentId),
              (error: unknown) => {
                assert.equal(
                  toProjectGenerationActionApiError(error).code,
                  failure === 'reuse'
                    ? 'GENERATION_SEED_UNAVAILABLE'
                    : 'GENERATION_RUNTIME_UNAVAILABLE',
                )
                return true
              },
            )
            assert.equal(owner.runtime.generated.length, 0)
            assert.equal((await owner.queue.listManagerPage()).items.length, 0)
            assert.deepEqual(await readFile(project.packagePath), before)
          } finally {
            await owner.controller.shutdown()
          }
        })
      })
    }
  },
)

test(
  'public Anima close raised after queue input publication prevents the complete SQL batch',
  options,
  async () => {
    await withAnimaProjectPreparationFixture(async (fixture) => {
      const project = await fixture.importProject()
      let owner!: PublicOwner
      let inputs = 0
      // A synchronous queue fence avoids waiting on the operation's own admission barrier.
      // The real close owner's fence performs this same immediate queue mutation before awaiting.
      owner = await publicOwner(fixture, {
        afterInputPublish: async () => {
          inputs++
          owner.queue.fenceProject(project.tabId)
        },
      })
      try {
        await assert.rejects(
          queued(owner, project.tabId, project.document.documentId),
          (error: unknown) => {
            assert.equal(toProjectGenerationActionApiError(error).code, 'QUEUE_PROJECT_CLOSING')
            return true
          },
        )
        assert.ok(inputs > 0)
        assert.equal((await owner.queue.listManagerPage()).items.length, 0)
        assert.equal(owner.runtime.generated.length, 0)
        assert.equal((await fixture.staging.listVerifiedCandidates(project.tabId)).length, 0)
      } finally {
        await owner.controller.shutdown()
      }
    })
  },
)

test(
  'public Anima document closed after inputs are durable rolls back all jobs and files',
  options,
  async () => {
    await withAnimaProjectPreparationFixture(async (fixture) => {
      const project = await fixture.importProject()
      const before = await readFile(project.packagePath)
      let closed = false
      const owner = await publicOwner(fixture, {
        afterInputPublish: async () => {
          if (!closed) {
            closed = true
            await fixture.service.discardAndClose(project.tabId)
          }
        },
      })
      try {
        await assert.rejects(
          queued(owner, project.tabId, project.document.documentId),
          (error: unknown) => {
            assert.equal(toProjectGenerationActionApiError(error).code, 'PROJECT_NOT_OPEN')
            return true
          },
        )
        assert.equal(closed, true)
        assert.equal((await owner.queue.listManagerPage()).items.length, 0)
        assert.equal(owner.runtime.generated.length, 0)
        assert.deepEqual(await readFile(project.packagePath), before)
        assert.deepEqual(await readdir(path.join(fixture.root, 'generation-inputs')), [])
        assert.equal((await fixture.staging.listVerifiedCandidates(project.tabId)).length, 0)
      } finally {
        await owner.controller.shutdown()
      }
    })
  },
)

test(
  'public Anima late indexed-document change cancels only its newly durable batch before dispatch',
  options,
  async () => {
    await withAnimaProjectPreparationFixture(async (fixture) => {
      const project = await fixture.importProject()
      const before = await readFile(project.packagePath)
      const owner = await publicOwner(fixture, {
        afterBatchCommit: async () => {
          await fixture.database.db
            .updateTable('project_index')
            .set({ document_id: randomUUID() })
            .where('local_project_key', '=', project.tabId)
            .execute()
        },
      })
      try {
        await assert.rejects(
          queued(owner, project.tabId, project.document.documentId),
          (error: unknown) => {
            assert.equal(toProjectGenerationActionApiError(error).code, 'PROJECT_DOCUMENT_CHANGED')
            return true
          },
        )
        const rows = (await owner.queue.listManagerPage()).items
        assert.equal(rows.length, 2)
        assert.ok(rows.every((row) => row.status === 'canceled'))
        assert.equal(owner.runtime.generated.length, 0)
        for (const row of rows) {
          const saved = await owner.queue.loadVerifiedRetryInput(row.id)
          assert.equal(saved.payload.context.documentId, project.document.documentId)
        }
        assert.deepEqual(await readFile(project.packagePath), before)
        assert.equal((await fixture.staging.listVerifiedCandidates(project.tabId)).length, 0)
      } finally {
        await owner.controller.shutdown()
      }
    })
  },
)

test(
  'another Project admits Anima while the first inference is running and retains both captured results',
  options,
  async () => {
    await withAnimaProjectPreparationFixture(async (fixture) => {
      const first = await fixture.importProject({
        draft: { positivePrompt: { embeddingRefs: [], text: '(first:1.5)' } },
      })
      const second = await fixture.importProject({
        draft: {
          positivePrompt: { embeddingRefs: [], text: '(second:0.5)' },
          seed: { policy: 'fixed', value: 0 },
        },
      })
      const owner = await publicOwner(fixture)
      const entered = signal()
      const release = signal()
      owner.runtime.beforeGenerate = async () => {
        entered.resolve()
        await release.promise
      }
      try {
        const one = await queued(owner, first.tabId, first.document.documentId)
        await entered.promise
        const two = await queued(owner, second.tabId, second.document.documentId)
        assert.equal(owner.runtime.generated.length, 1)
        assert.equal(owner.runtime.leases, 1)
        assert.equal(owner.runtime.compositions, 2)
        const jobs = (await owner.queue.listManagerPage()).items
        assert.equal(jobs.filter((row) => row.status === 'running').length, 1)
        assert.equal(jobs.filter((row) => row.status === 'pending').length, 1)
        assert.equal(jobs.find((row) => row.projectKey === first.tabId)!.status, 'running')
        release.resolve()
        await settled(owner, [...one.jobIds, ...two.jobIds])
        assert.equal((await fixture.staging.listVerifiedCandidates(first.tabId)).length, 1)
        assert.equal((await fixture.staging.listVerifiedCandidates(second.tabId)).length, 1)
        assert.equal(
          await fixture.staging.readLastActualSeed(second.tabId, second.document.documentId),
          0,
        )
        assert.deepEqual((await readIgsPackage(first.packagePath)).project, first.document)
        assert.deepEqual((await readIgsPackage(second.packagePath)).project, second.document)
      } finally {
        release.resolve()
        await owner.controller.shutdown()
      }
    })
  },
)

test(
  'Anima replacement declines without exact confirmation and preserves old candidates on known runtime refusal',
  options,
  async () => {
    await withAnimaProjectPreparationFixture(async (fixture) => {
      const project = await fixture.importProject({
        draft: {
          positivePrompt: { embeddingRefs: [], text: 'one' },
          seed: { policy: 'fixed', value: 0 },
        },
      })
      const owner = await publicOwner(fixture)
      try {
        const first = await queued(owner, project.tabId, project.document.documentId)
        await settled(owner, first.jobIds)
        const original = await fixture.staging.listVerifiedCandidates(project.tabId)
        const composed = owner.runtime.compositions
        const review = await owner.controller.generate(project.tabId, {
          documentId: project.document.documentId,
          iterations: 1,
        })
        assert.equal(review.kind, 'confirmation-required')
        if (review.kind !== 'confirmation-required') {
          throw new Error('Expected exact review')
        }
        assert.deepEqual(
          review.candidateIds,
          original.map((candidate) => candidate.candidateId),
        )
        assert.equal(owner.runtime.compositions, composed)
        owner.runtime.ready.capabilities = owner.runtime.ready.capabilities.filter(
          (value) => value !== 'anima-lora',
        )
        await assert.rejects(
          owner.controller.generate(project.tabId, {
            confirmation: {
              candidateIds: review.candidateIds,
              unfinishedJobIds: review.unfinishedJobIds,
            },
            documentId: project.document.documentId,
            iterations: 1,
          }),
          (error: unknown) => {
            assert.equal(toProjectGenerationActionApiError(error).code, 'INFERENCE_UNAVAILABLE')
            return true
          },
        )
        assert.deepEqual(await fixture.staging.listVerifiedCandidates(project.tabId), original)
        assert.equal((await owner.queue.listManagerPage()).items.length, 1)
        assert.equal(owner.runtime.generated.length, 1)
        owner.runtime.ready = structuredClone(ANIMA_BATCH_READY)
        await fixture.service.updateGenerationDraft(project.tabId, {
          kind: 'seed',
          policy: 'reuse',
          value: null,
        })
        const replacement = await owner.controller.generate(project.tabId, {
          confirmation: { candidateIds: review.candidateIds, unfinishedJobIds: [] },
          documentId: project.document.documentId,
          iterations: 1,
        })
        assert.equal(replacement.kind, 'queued')
        if (replacement.kind !== 'queued') {
          throw new Error('Expected reviewed replacement')
        }
        await settled(owner, replacement.jobIds)
        const latest = await owner.queue.loadVerifiedRetryInput(replacement.jobIds[0])
        assert.equal(latest.payload.context.sampling.seed, 0)
        assert.equal(latest.payload.context.sampling.requestedSeedPolicy, 'reuse')
        const candidates = await fixture.staging.listVerifiedCandidates(project.tabId)
        assert.equal(candidates.length, 1)
        assert.notEqual(candidates[0].candidateId, original[0].candidateId)
        assert.equal((await owner.queue.getManagerEntry(first.jobIds[0])).status, 'completed')
        assert.deepEqual((await readIgsPackage(project.packagePath)).project, project.document)
      } finally {
        await owner.controller.shutdown()
      }
    })
  },
)

test(
  'Anima late identity change after request cleanup preserves reviewed old candidates and cancels the new batch',
  options,
  async () => {
    await withAnimaProjectPreparationFixture(async (fixture) => {
      const project = await fixture.importProject({
        draft: { positivePrompt: { embeddingRefs: [], text: 'old candidate' } },
      })
      const owner = await publicOwner(fixture)
      try {
        const first = await queued(owner, project.tabId, project.document.documentId)
        await settled(owner, first.jobIds)
        const original = await fixture.staging.listVerifiedCandidates(project.tabId)
        const enqueue = owner.orchestrator.enqueuePreparedAnimaBatch.bind(owner.orchestrator)
        owner.orchestrator.enqueuePreparedAnimaBatch = async (...args) => {
          // The real admission and request cleanup completed. Only the timing of a external index
          // reassignment is controlled; its real SQL effect precedes the destructive handoff.
          const admitted = await enqueue(...args)
          await fixture.database.db
            .updateTable('project_index')
            .set({ document_id: randomUUID() })
            .where('local_project_key', '=', project.tabId)
            .execute()
          return admitted
        }
        await assert.rejects(
          owner.controller.generate(project.tabId, {
            confirmation: {
              candidateIds: original.map((candidate) => candidate.candidateId),
              unfinishedJobIds: [],
            },
            documentId: project.document.documentId,
            iterations: 1,
          }),
          (error: unknown) => {
            assert.equal(toProjectGenerationActionApiError(error).code, 'PROJECT_DOCUMENT_CHANGED')
            return true
          },
        )
        assert.deepEqual(await fixture.staging.listVerifiedCandidates(project.tabId), original)
        const rows = (await owner.queue.listManagerPage()).items
        assert.equal(rows.length, 2)
        assert.equal(rows.find((row) => row.id === first.jobIds[0])!.status, 'completed')
        assert.equal(rows.find((row) => row.id !== first.jobIds[0])!.status, 'canceled')
        assert.equal(owner.runtime.generated.length, 1)
        assert.deepEqual((await readIgsPackage(project.packagePath)).project, project.document)
      } finally {
        await owner.controller.shutdown()
      }
    })
  },
)

test(
  'public native pair-prefix truncation is explicit, while cap32 overflow refuses the whole batch before composition',
  options,
  async (t) => {
    for (const overflow of [false, true]) {
      await t.test(overflow ? 'whole batch cap' : 'pair prefix', async () => {
        await withAnimaProjectPreparationFixture(async (fixture) => {
          const project = await fixture.importProject({
            draft: { dynamicPrompt: { maxPrompts: overflow ? 2 : 1, seedBehavior: 'per-prompt' } },
          })
          const owner = await publicOwner(fixture)
          try {
            if (overflow) {
              await assert.rejects(
                queued(owner, project.tabId, project.document.documentId, 17),
                (error: unknown) => {
                  assert.equal(toProjectGenerationActionApiError(error).code, 'BATCH_TOO_LARGE')
                  return true
                },
              )
              assert.equal(owner.runtime.compositions, 0)
              assert.equal((await owner.queue.listManagerPage()).items.length, 0)
            } else {
              const result = await queued(owner, project.tabId, project.document.documentId)
              assert.equal(result.truncated, true)
              assert.equal(result.jobIds.length, 1)
              await settled(owner, result.jobIds)
              const candidate = (await fixture.staging.listVerifiedCandidates(project.tabId))[0]
              const saved = await owner.queue.loadVerifiedRetryInput(candidate.queueItemId)
              assert.equal(saved.payload.context.prompts.positive, '(lantern:1.5) red')
            }
          } finally {
            await owner.controller.shutdown()
          }
        })
      })
    }
  },
)

test(
  'Anima replacement re-reviews a late completion and preserves its candidate instead of discarding unconfirmed loss',
  options,
  async () => {
    await withAnimaProjectPreparationFixture(async (fixture) => {
      const project = await fixture.importProject({
        draft: { positivePrompt: { embeddingRefs: [], text: 'running original' } },
      })
      const owner = await publicOwner(fixture)
      const entered = signal()
      const release = signal()
      owner.runtime.beforeGenerate = async () => {
        entered.resolve()
        await release.promise
      }
      try {
        const first = await queued(owner, project.tabId, project.document.documentId)
        await entered.promise
        const review = await owner.controller.generate(project.tabId, {
          documentId: project.document.documentId,
          iterations: 1,
        })
        assert.equal(review.kind, 'confirmation-required')
        if (review.kind !== 'confirmation-required') {
          throw new Error('Expected exact running review')
        }
        assert.deepEqual(review.candidateIds, [])
        assert.deepEqual(review.unfinishedJobIds, first.jobIds)
        owner.runtime.beforePreparation = async () => {
          release.resolve()
          await settled(owner, first.jobIds)
        }
        const changed = await owner.controller.generate(project.tabId, {
          confirmation: {
            candidateIds: review.candidateIds,
            unfinishedJobIds: review.unfinishedJobIds,
          },
          documentId: project.document.documentId,
          iterations: 1,
        })
        assert.equal(changed.kind, 'confirmation-required')
        if (changed.kind !== 'confirmation-required') {
          throw new Error('Expected updated loss set')
        }
        const candidates = await fixture.staging.listVerifiedCandidates(project.tabId)
        assert.equal(candidates.length, 1)
        assert.deepEqual(changed.candidateIds, [candidates[0].candidateId])
        assert.deepEqual(changed.unfinishedJobIds, [])
        assert.equal((await owner.queue.listManagerPage()).items.length, 1)
        assert.equal((await owner.queue.getManagerEntry(first.jobIds[0])).status, 'completed')
        assert.equal(owner.runtime.generated.length, 1)
        assert.deepEqual((await readIgsPackage(project.packagePath)).project, project.document)
      } finally {
        release.resolve()
        await owner.controller.shutdown()
      }
    })
  },
)
