import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import { defaultIllustriousNoiseProfile } from '../../shared/projects/illustrious-noise-profile.js'
import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import type { OutpaintInfillResolver } from '../runtime/inference-auxiliary-resources.js'
import type { GenerationWorkerRequest, GenerationWorkerTransport } from './generation-processor.js'
import type { GenerationQueueTestHooks, PreparedOutpaintGeneration } from './generation-queue.js'
import type { InferenceWorkerReady } from './illustrious-txt2img-job.js'
import type { OutpaintConsumerFixture } from './test-fixtures/outpaint-consumers.js'
import type { ProjectWorkerClient } from './worker-client.js'

import { ProjectGenerationActionController } from './generation-action-controller.js'
import { GenerationDispatchCoordinator } from './generation-dispatch-coordinator.js'
import { GenerationOrchestrator } from './generation-orchestrator.js'
import { GenerationProcessor } from './generation-processor.js'
import { GenerationQueueRepository, isQueuedOutpaint } from './generation-queue.js'
import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import { ProjectIndexRepository } from './project-index.js'
import { readProjectPlaceholders } from './project-placeholders.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
import { ANIMA_BATCH_READY } from './test-fixtures/anima-batch.js'
import { withOutpaintConsumerFixture } from './test-fixtures/outpaint-consumers.js'
import { OUTPAINT_READY } from './test-fixtures/outpaint-ready.js'

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
type CapturedProjectInput = Parameters<
  Parameters<ProjectService['withCapturedNormalGenerationInput']>[1]
>[0]

/**
 * Composition and numerical inference are explicit substitutes. Main's real Project capture, source
 * leases, exact tiny family-file resolvers, queue/files/SQL, dispatch, staging and immutable
 * receipts remain the tested production owners. The LaMa resolver supplies the fixed metadata only;
 * these tests make no trained-resource, installed-engine or release claim.
 */
class PublicOutpaintRuntime {
  admissionCount = 0
  beforeAdmissionExit: (() => Promise<void>) | null = null
  beforeGenerate: (() => Promise<void>) | null = null
  beforePreparation: (() => Promise<void>) | null = null
  beforePreparationExit: (() => Promise<void>) | null = null
  compositions = 0
  generated: GenerationWorkerRequest[] = []
  ready: InferenceWorkerReady = structuredClone(OUTPAINT_READY)
  private held = false

  constructor(
    private readonly source: Buffer,
    private readonly output: Buffer,
  ) {}

  async getStatus() {
    return null
  }
  async readQualifiedInferenceReady() {
    return structuredClone(this.ready)
  }
  async retryUnconfirmedGenerationExit() {
    return !this.held
  }

  async withGenerationAdmission<T>(
    _scratch: string,
    use: (ready: InferenceWorkerReady) => Promise<T>,
  ) {
    this.admissionCount++
    try {
      return await use(structuredClone(this.ready))
    } finally {
      await this.beforeAdmissionExit?.()
    }
  }

  async withGenerationPreparation<T>(
    _scratch: string,
    use: (preparation: {
      inferenceReady: InferenceWorkerReady
      targetWorker: Pick<ProjectWorkerClient, 'composeTarget'>
    }) => Promise<T>,
  ) {
    const inferenceReady = structuredClone(this.ready)
    await this.beforePreparation?.()
    try {
      return await use({
        inferenceReady,
        targetWorker: {
          composeTarget: async (input) => {
            this.compositions++
            await writeFile(input.targetPngPath, this.source, { flag: 'wx', mode: 0o600 })
            return {
              composite: {
                byteSize: this.source.length,
                colorSpace: 'srgb',
                height: 64,
                iccSha256: IGS_SRGB_ICC_SHA256,
                path: input.targetPngPath,
                sha256: sha(this.source),
                width: 64,
              },
              mode: 'outpaint',
              rect: { ...input.bbox },
            }
          },
        },
      })
    } finally {
      await this.beforePreparationExit?.()
    }
  }

  async withGenerationWorker<T>(
    _scratch: string,
    use: (transport: GenerationWorkerTransport) => Promise<T>,
  ) {
    assert.equal(this.held, false, 'serial dispatch must hold one inference transport')
    this.held = true
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
            request.type === 'generate-illustrious-outpaint' ||
              request.type === 'generate-anima-outpaint',
          )
          assert.ok(
            (await readFile(request.job.target.path)).equals(this.source),
            'dispatch must retain the exact mixed-alpha source',
          )
          this.generated.push(structuredClone(request))
          await Promise.race([this.beforeGenerate?.() ?? Promise.resolve(), stopped.promise])
          if (closed) {
            throw new Error('Controlled inference exit confirmed')
          }
          const totalSteps =
            'totalSteps' in request.job.sampling
              ? request.job.sampling.totalSteps
              : request.job.sampling.steps
          if (totalSteps > 0) {
            onProgress?.({ step: totalSteps, totalSteps })
          }
          await writeFile(request.job.output.pngPath, this.output, { flag: 'wx', mode: 0o600 })
          return {
            outputPath: request.job.output.pngPath,
            protocolVersion: '1',
            requestId: request.requestId,
            seed: (request.job.sampling.seed + 7) >>> 0,
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

async function withPublicOwner(
  fixture: OutpaintConsumerFixture,
  use: (owner: Awaited<ReturnType<typeof publicOwner>>) => Promise<void>,
  hooks: GenerationQueueTestHooks = {},
) {
  const owner = await publicOwner(fixture, hooks)
  try {
    await use(owner)
  } finally {
    await owner.controller.shutdown()
    for (const tab of owner.projects.getOpenTabs()) {
      await owner.projects.discardAndClose(tab.id)
    }
  }
}

async function publicOwner(fixture: OutpaintConsumerFixture, hooks: GenerationQueueTestHooks) {
  const index = new ProjectIndexRepository(fixture.database.db)
  const projects = new ProjectService({
    autosaveOptions: { debounceMs: 0, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    dataRoot: fixture.root,
    repository: index,
    roots: {
      placeholdersDir: path.resolve('src/main/projects/placeholders'),
      scratchDir: fixture.scratch,
    },
    shadow: new ProjectShadowStore(path.join(fixture.root, 'public-shadow')),
  })
  const document = structuredClone((await readIgsPackage(fixture.projectPath)).project)
  document.generationDraft = structuredClone(fixture.target.generationDraft)
  const assetPath = `assets/layers/${randomUUID()}.png`
  document.layers = [
    {
      asset: {
        bytes: fixture.target.composite.bytes.length,
        height: 64,
        path: assetPath,
        sha256: sha(fixture.target.composite.bytes),
        width: 64,
      },
      blendMode: 'normal',
      id: randomUUID(),
      kind: 'raster',
      locked: false,
      name: 'Captured mixed-alpha source',
      opacity: 1,
      transform: {
        rotationDegrees: 0,
        scaleX: 1,
        scaleY: 1,
        x: document.primaryBbox.x,
        y: document.primaryBbox.y,
      },
      visible: true,
    },
  ]
  await saveIgsPackage(fixture.projectPath, {
    assets: { [assetPath]: { bytes: fixture.target.composite.bytes } },
    preview: {
      ...(await readProjectPlaceholders(
        path.resolve('src/main/projects/placeholders'),
        'unavailable',
      )),
      rect: document.primaryBbox,
      status: 'unavailable',
    },
    project: document,
  })
  const selected = await projects.selectImport(fixture.projectPath)
  assert.equal(selected.kind, 'transfer-required')
  if (selected.kind !== 'transfer-required') {
    throw new Error('Expected imported Project transfer')
  }
  const imported = await projects.finishImport(selected.importId, 'copy')
  assert.equal(imported.result.kind, 'opened')
  if (imported.result.kind !== 'opened') {
    throw new Error('Expected open imported Project')
  }
  const tabId = imported.result.tab.id
  const project = await index.getProject(tabId)
  assert.ok(project)
  const packagePath = project.canonicalPath
  const savedBytes = await readFile(packagePath)
  const queue = new GenerationQueueRepository(fixture.database.db, fixture.root, hooks)
  await queue.recoverAfterRestart()
  const runtime = new PublicOutpaintRuntime(fixture.target.composite.bytes, fixture.outputBytes)
  const infillState = {
    beforeResolve: null as (() => Promise<void>) | null,
    calls: 0,
    unavailable: false,
  }
  const infillResolver: OutpaintInfillResolver = {
    resolveVerifiedOutpaintInfill: async () => {
      infillState.calls++
      await infillState.beforeResolve?.()
      if (infillState.unavailable) {
        throw Object.assign(new Error('Controlled local LaMa refusal'), {
          code: 'GENERATION_RESOURCE_CHANGED',
        })
      }
      return await fixture.infillResolver.resolveVerifiedOutpaintInfill()
    },
  }
  const processor = new GenerationProcessor(
    queue,
    fixture.staging,
    fixture.outpaintModels,
    fixture.scratch,
    infillResolver,
  )
  let documentOverride: string | null | undefined
  const captureState: { beforeExit: (() => Promise<void>) | null } = { beforeExit: null }
  const currentProjects = {
    getOpenDocumentId: (id: string) =>
      documentOverride === undefined ? projects.getOpenDocumentId(id) : documentOverride,
    getOpenTabs: () => projects.getOpenTabs(),
    prepareNormalGenerationContext: projects.prepareNormalGenerationContext.bind(projects),
    withCapturedNormalGenerationInput: async <T>(
      id: string,
      use: (capture: CapturedProjectInput) => Promise<T>,
    ) =>
      await projects.withCapturedNormalGenerationInput(id, async (capture) => {
        // The real snapshot owner still retains/removes its stage in finally. This facade holds
        // the same final callback-exit seam so tests can revoke admission before owner cleanup.
        try {
          return await use(capture)
        } finally {
          await captureState.beforeExit?.()
        }
      }),
  }
  const orchestrator = new GenerationOrchestrator(
    currentProjects,
    index,
    fixture.outpaintModels,
    queue,
    fixture.staging,
    processor,
    fixture.scratch,
    infillResolver,
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
    infillResolver,
    models: fixture.outpaintModels,
    orchestrator,
    processor,
    projects: currentProjects,
    queue,
    runtime,
    scratchBasePath: fixture.scratch,
    staging: fixture.staging,
  })
  return {
    captureState,
    controller,
    document,
    infillState,
    orchestrator,
    packagePath,
    processor,
    projects,
    queue,
    runtime,
    savedBytes,
    setDocumentOverride: (id: string | null) => {
      documentOverride = id
    },
    staging: fixture.staging,
    tabId,
  }
}

async function settle(owner: Awaited<ReturnType<typeof publicOwner>>) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const state = await owner.controller.getState(owner.tabId)
    if (state.phase === 'idle' && state.jobs.length === 0) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.fail('Public outpaint serial drain did not settle')
}

async function reviewedImpact(owner: Awaited<ReturnType<typeof publicOwner>>) {
  const result = await owner.controller.generate(owner.tabId, {
    documentId: owner.document.documentId,
    iterations: 1,
  })
  assert.equal(result.kind, 'confirmation-required')
  if (result.kind !== 'confirmation-required') {
    throw new Error('Expected replacement confirmation')
  }
  return { candidateIds: result.candidateIds, unfinishedJobIds: result.unfinishedJobIds }
}

async function retryPrivateFiles(directory: string): Promise<unknown> {
  const entry = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return null
    }
    throw error
  })
  if (!entry) {
    return null
  }
  assert.equal(entry.isSymbolicLink(), false)
  if (entry.isFile()) {
    const bytes = await readFile(directory)
    return { byteSize: bytes.length, mode: entry.mode, sha256: sha(bytes) }
  }
  assert.equal(entry.isDirectory(), true)
  const children: Record<string, unknown> = {}
  for (const name of (await readdir(directory)).sort()) {
    children[name] = await retryPrivateFiles(path.join(directory, name))
  }
  return { children, mode: entry.mode }
}

for (const predictionType of ['epsilon', 'v_prediction'] as const) {
  for (const axis of ['prediction', 'zero-snr', 'spacing'] as const) {
    // Boundary: public Retry diagnoses a verified policy change, preserving real SQL/private
    // files and an existing candidate. Numerical ML/composition and tiny-file policy are peers.
    // Mutation: restoring the queue-storage classification must fail the exact public diagnostic.
    test(`illustrious ${predictionType} public outpaint Retry policy ${axis} reports input change and preserves frozen state`, async () => {
      await withOutpaintConsumerFixture('illustrious', async (fixture) => {
        const originalResolver = fixture.outpaintModels.resolveVerifiedGenerationCheckpointForPlan
        assert.ok(fixture.target.generationDraft.model)
        const selectedReference = { ...fixture.target.generationDraft.model, predictionType }
        const baseline = {
          noiseProfile: {
            ...defaultIllustriousNoiseProfile(),
            rescaleBetasZeroSnr: predictionType === 'v_prediction',
          },
          predictionType,
        }
        let policy = structuredClone(baseline)
        fixture.target.generationDraft.model = selectedReference
        fixture.outpaintModels.resolveVerifiedGenerationCheckpointForPlan = async (selected) => {
          // The inherited exact tiny-file resolver expects epsilon metadata. Keep its actual
          // managed-byte verification and change only the explicitly controlled current policy.
          const verified = await originalResolver({ ...selected, predictionType: 'epsilon' })
          return {
            ...verified,
            noiseProfile: structuredClone(policy.noiseProfile),
            reference: { ...verified.reference, predictionType: policy.predictionType },
          }
        }
        await withPublicOwner(fixture, async (owner) => {
          owner.runtime.ready = {
            ...structuredClone(OUTPAINT_READY),
            capabilities: [
              ...OUTPAINT_READY.capabilities,
              'illustrious-euler',
              'illustrious-noise-profile',
            ],
            workerVersion: '0.14.0',
          }
          const held = signal()
          const entered = signal()
          owner.runtime.beforeGenerate = async () => {
            entered.resolve()
            await held.promise
          }
          const admission = await owner.controller.generate(owner.tabId, {
            documentId: owner.document.documentId,
            iterations: 2,
          })
          assert.equal(admission.kind, 'queued')
          if (admission.kind !== 'queued') {
            throw new Error('Expected outpaint source jobs')
          }
          assert.equal(admission.jobIds.length, 2)
          await entered.promise
          const pending = await owner.queue.getManagerEntry(admission.jobIds[1])
          assert.equal(pending.status, 'pending')
          await owner.controller.cancelJob(pending)
          held.resolve()
          await settle(owner)
          owner.runtime.beforeGenerate = null
          const source = await owner.queue.getManagerEntry(pending.id)
          assert.equal(source.status, 'canceled')
          const frozen = await owner.queue.loadVerifiedRetryInput(source.id)
          assert.equal(frozen.payload.kind, 'illustrious-outpaint')
          if (frozen.payload.kind !== 'illustrious-outpaint') {
            throw new Error('Expected frozen Illustrious outpaint')
          }
          assert.equal(frozen.payload.context.model.reference.predictionType, predictionType)
          assert.deepEqual(frozen.payload.context.sampling.noiseProfile, baseline.noiseProfile)
          assert.equal(frozen.payload.context.sampling.seed, 1)
          assert.equal(frozen.payload.context.sampling.denoisingStrength, 0.5)
          assert.ok(frozen.targetPngBytes.equals(fixture.target.composite.bytes))
          const candidates = await owner.staging.listVerifiedCandidates(owner.tabId)
          assert.equal(candidates.length, 1, 'A healthy neighboring completion must already exist')
          assert.equal(candidates[0].actualSeed, 7)
          await owner.projects.updateGenerationDraft(owner.tabId, {
            kind: 'positive-prompt',
            text: 'later policy Retry draft',
          })
          await owner.projects.updateGenerationDraft(owner.tabId, {
            kind: 'denoising-strength',
            value: 0.25,
          })
          await owner.projects.updateGenerationDraft(owner.tabId, {
            kind: 'seed',
            policy: 'fixed',
            value: 123,
          })
          const preserved = async () => ({
            candidates: await owner.staging.listVerifiedCandidates(owner.tabId),
            cursor: await fixture.database.db
              .selectFrom('generation_seed_cursor')
              .selectAll()
              .orderBy('local_project_key')
              .execute(),
            inputs: await retryPrivateFiles(path.join(fixture.root, 'generation-inputs')),
            project: structuredClone(
              owner.projects.getOpenDocumentForAcceptance(owner.tabId)!.document,
            ),
            queue: await fixture.database.db
              .selectFrom('generation_queue_item')
              .selectAll()
              .orderBy('id')
              .execute(),
            receipts: await fixture.database.db
              .selectFrom('generation_candidate_receipt')
              .selectAll()
              .orderBy('candidate_id')
              .execute(),
            savedPackage: sha(await readFile(owner.packagePath)),
            staging: await retryPrivateFiles(
              path.join(fixture.root, 'recovery/generation-staging'),
            ),
            tabs: owner.projects.getOpenTabs(),
          })
          const before = await preserved()
          assert.equal(before.cursor.length, 1)
          assert.equal(before.savedPackage, sha(owner.savedBytes))
          const compositions = owner.runtime.compositions
          const generated = owner.runtime.generated.length
          if (axis === 'prediction') {
            policy.predictionType = predictionType === 'epsilon' ? 'v_prediction' : 'epsilon'
          } else if (axis === 'zero-snr') {
            policy.noiseProfile.rescaleBetasZeroSnr = !baseline.noiseProfile.rescaleBetasZeroSnr
          } else {
            policy.noiseProfile.timestepSpacing = 'trailing'
          }
          await assert.rejects(owner.controller.retryJob(source))
          await settle(owner)
          assert.deepEqual(
            await preserved(),
            before,
            'Refused policy Retry must preserve every durable row, candidate, seed, private file and Project state',
          )
          assert.ok((await readFile(frozen.targetPath)).equals(frozen.targetPngBytes))
          assert.equal(
            owner.runtime.compositions,
            compositions,
            'Refused Retry cannot compose current pixels',
          )
          assert.equal(
            owner.runtime.generated.length,
            generated,
            'Refused Retry cannot dispatch inference',
          )
          assert.deepEqual((await owner.controller.getState(owner.tabId)).error, {
            code: 'GENERATION_INPUT_CHANGED',
            message:
              'The exact checkpoint, prediction type or noise profile changed after preparation.',
          })
          policy = structuredClone(baseline)
          await owner.controller.retryJob(source)
          await settle(owner)
          const page = await owner.queue.listManagerPage()
          const retry = page.items.find((item) => !before.queue.some((old) => old.id === item.id))
          assert.ok(retry)
          assert.equal(retry.status, 'completed')
          const copied = await owner.queue.loadVerifiedRetryInput(retry.id)
          assert.deepEqual(copied.payload, frozen.payload)
          assert.ok(copied.targetPngBytes.equals(frozen.targetPngBytes))
          assert.notEqual(copied.item.stagingSessionId, frozen.item.stagingSessionId)
          assert.equal(
            owner.runtime.compositions,
            compositions,
            'Restored Retry cannot compose the later draft',
          )
          const after = await preserved()
          assert.equal(
            after.queue.find((item) => item.id === retry.id)?.frozen_payload_json,
            before.queue.find((item) => item.id === source.id)?.frozen_payload_json,
          )
          assert.deepEqual(after.project, before.project)
          assert.deepEqual(after.tabs, before.tabs)
          assert.equal(after.savedPackage, before.savedPackage)
          const retainedCandidate = after.candidates.find(
            (candidate) => candidate.candidateId === candidates[0].candidateId,
          )
          assert.deepEqual(retainedCandidate, candidates[0])
          assert.equal(after.candidates.length, 2)
          assert.equal(
            after.candidates.find((candidate) => candidate.queueItemId === retry.id)?.actualSeed,
            8,
          )
          assert.deepEqual(
            after.receipts.filter((receipt) =>
              before.receipts.some((old) => old.candidate_id === receipt.candidate_id),
            ),
            before.receipts,
          )
          const consumed = await owner.queue.getManagerEntry(source.id)
          assert.equal(consumed.status, 'canceled')
          assert.equal(consumed.statusSequence, source.statusSequence + 1)
          assert.ok((await readFile(frozen.targetPath)).equals(frozen.targetPngBytes))
          const executed = owner.runtime.generated.at(-1)!
          if (executed.type !== 'generate-illustrious-outpaint') {
            throw new Error('Expected restored native outpaint request')
          }
          assert.equal(executed.job.checkpoint.predictionType, predictionType)
          assert.deepEqual(executed.job.prompts, frozen.payload.context.prompts)
          assert.equal(executed.job.sampling.seed, 1)
          assert.equal(executed.job.sampling.denoisingStrength, 0.5)
          assert.deepEqual(executed.job.sampling.noiseProfile, baseline.noiseProfile)
          assert.equal((await owner.controller.getState(owner.tabId)).error, null)
        })
      })
    })
  }
}

for (const family of ['illustrious', 'anima'] as const) {
  // Boundary: the public controller through capture, durable queue and actual publication.
  // Neighbor: both original normal operations retain their existing public suites. Mutations
  // routing alpha to ordinary img2img, reading late draft or discarding source must fail here.
  test(`${family} public mixed-alpha Generate freezes concrete prompts, seeds, source and strength through serial RGBA publication`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      await withPublicOwner(fixture, async (owner) => {
        await owner.projects.updateGenerationDraft(owner.tabId, {
          kind: 'positive-prompt',
          text: '{(cat:1.5)|dog}',
        })
        await owner.projects.updateGenerationDraft(owner.tabId, {
          kind: 'negative-prompt',
          text: '{(blur:0.5)|noise}',
        })
        await owner.projects.updateGenerationDraft(owner.tabId, {
          kind: 'dynamic-prompt',
          value: { maxPrompts: 2, seedBehavior: 'per-prompt' },
        })
        let afterEdit: IgsProjectDocumentV1 | undefined
        owner.runtime.beforePreparation = async () => {
          await owner.projects.updateGenerationDraft(owner.tabId, {
            kind: 'positive-prompt',
            text: 'later draft',
          })
          await owner.projects.updateGenerationDraft(owner.tabId, {
            kind: 'denoising-strength',
            value: 0.9,
          })
          await owner.projects.updateGenerationDraft(owner.tabId, {
            kind: 'seed',
            policy: 'fixed',
            value: 99,
          })
          afterEdit = structuredClone(
            owner.projects.getOpenDocumentForAcceptance(owner.tabId)!.document,
          )
        }
        const result = await owner.controller.generate(owner.tabId, {
          documentId: owner.document.documentId,
          iterations: 2,
        })
        assert.equal(result.kind, 'queued')
        if (result.kind !== 'queued') {
          throw new Error('Expected public outpaint queue')
        }
        assert.equal(result.jobIds.length, 4)
        await settle(owner)
        assert.equal(owner.runtime.generated.length, 4)
        assert.deepEqual(
          owner.runtime.generated.map((request) => request.job.sampling.seed),
          [0, 1, 2, 3],
        )
        const candidates = await owner.staging.listVerifiedCandidates(owner.tabId)
        assert.equal(candidates.length, 4)
        for (const id of result.jobIds) {
          const frozen = await owner.queue.loadVerifiedRetryInput(id)
          assert.ok(isQueuedOutpaint(frozen.payload))
          assert.equal(frozen.payload.kind, `${family}-outpaint`)
          assert.equal(frozen.payload.context.sampling.denoisingStrength, 0.5)
          assert.doesNotMatch(frozen.payload.context.prompts.positive, /later/)
          assert.ok(
            frozen.targetPngBytes.equals(fixture.target.composite.bytes),
            'frozen source bytes must match',
          )
          const candidate = candidates.find((entry) => entry.queueItemId === id)!
          assert.equal(candidate.actualSeed, (frozen.payload.context.sampling.seed + 7) >>> 0)
        }
        assert.deepEqual(
          owner.projects.getOpenDocumentForAcceptance(owner.tabId)!.document,
          afterEdit,
        )
        assert.ok(
          (await readFile(owner.packagePath)).equals(owner.savedBytes),
          'Generate cannot replace saved .igs',
        )
      })
    })
  })

  test(`${family} public outpaint replacement capability and local-LaMa refusal preserve reviewed candidates, seed and saved document`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      await withPublicOwner(fixture, async (owner) => {
        await owner.controller.generate(owner.tabId, {
          documentId: owner.document.documentId,
          iterations: 1,
        })
        await settle(owner)
        const confirmation = await reviewedImpact(owner)
        const before = await owner.queue.listManagerPage()
        const candidates = await owner.staging.listVerifiedCandidates(owner.tabId)
        const cursor = await owner.staging.readLastActualSeed(
          owner.tabId,
          owner.document.documentId,
        )
        const calls = owner.infillState.calls
        owner.runtime.ready = {
          ...ANIMA_BATCH_READY,
          capabilities: [
            ...ANIMA_BATCH_READY.capabilities,
            'illustrious-outpaint',
            'anima-outpaint',
          ],
        }
        await assert.rejects(
          owner.controller.generate(owner.tabId, {
            confirmation,
            documentId: owner.document.documentId,
            iterations: 1,
          }),
          { code: 'GENERATION_RUNTIME_UNAVAILABLE' },
        )
        assert.equal(owner.infillState.calls, calls, 'legacy extra strings cannot reach local LaMa')
        owner.runtime.ready = structuredClone(OUTPAINT_READY)
        owner.infillState.unavailable = true
        await assert.rejects(
          owner.controller.generate(owner.tabId, {
            confirmation,
            documentId: owner.document.documentId,
            iterations: 1,
          }),
          { code: 'GENERATION_RESOURCE_CHANGED' },
        )
        assert.deepEqual(await owner.queue.listManagerPage(), before)
        assert.deepEqual(await owner.staging.listVerifiedCandidates(owner.tabId), candidates)
        assert.equal(
          await owner.staging.readLastActualSeed(owner.tabId, owner.document.documentId),
          cursor,
        )
        assert.ok(
          (await readFile(owner.packagePath)).equals(owner.savedBytes),
          'refused replacement must retain saved bytes',
        )
      })
    })
  })

  // Boundary: reviewed Queue Manager Retry must consume the frozen operation and exact inputs.
  // Mutations using ordinary retryTerminal, current draft, unsupported ready or skipped LaMa
  // qualification must change these observed source rows/candidates or fail explicit routing.
  test(`${family} public outpaint Retry uses exact old operation after edits and refuses legacy or missing local LaMa without consuming source`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      await withPublicOwner(fixture, async (owner) => {
        const first = await owner.controller.generate(owner.tabId, {
          documentId: owner.document.documentId,
          iterations: 1,
        })
        assert.equal(first.kind, 'queued')
        await settle(owner)
        const held = signal()
        owner.runtime.beforeGenerate = () => held.promise
        const confirmation = await reviewedImpact(owner)
        const second = await owner.controller.generate(owner.tabId, {
          confirmation,
          documentId: owner.document.documentId,
          iterations: 2,
        })
        assert.equal(second.kind, 'queued')
        if (second.kind !== 'queued') {
          throw new Error('Expected queued source')
        }
        const pending = (await owner.queue.listManagerPage()).items.find(
          (item) => item.id === second.jobIds[1],
        )!
        await owner.controller.cancelJob({ id: pending.id, statusSequence: pending.statusSequence })
        held.resolve()
        await settle(owner)
        owner.runtime.beforeGenerate = null
        const source = await owner.queue.getManagerEntry(pending.id)
        const frozen = await owner.queue.loadVerifiedRetryInput(source.id)
        const candidates = await owner.staging.listVerifiedCandidates(owner.tabId)
        const before = await owner.queue.listManagerPage()
        await owner.projects.updateGenerationDraft(owner.tabId, {
          kind: 'positive-prompt',
          text: 'later retry draft',
        })
        await owner.projects.updateGenerationDraft(owner.tabId, {
          kind: 'denoising-strength',
          value: 0.9,
        })
        await owner.projects.updateGenerationDraft(owner.tabId, {
          kind: 'seed',
          policy: 'fixed',
          value: 123,
        })
        owner.runtime.ready = structuredClone(ANIMA_BATCH_READY)
        const admissionCount = owner.runtime.admissionCount
        const localCalls = owner.infillState.calls
        await assert.rejects(owner.controller.retryJob(source), {
          code: 'GENERATION_RUNTIME_UNAVAILABLE',
        })
        assert.equal(owner.runtime.admissionCount, admissionCount)
        assert.equal(owner.infillState.calls, localCalls)
        owner.runtime.ready = structuredClone(OUTPAINT_READY)
        owner.infillState.unavailable = true
        await assert.rejects(owner.controller.retryJob(source), {
          code: 'GENERATION_RESOURCE_CHANGED',
        })
        assert.deepEqual(await owner.queue.listManagerPage(), before)
        owner.infillState.unavailable = false
        await owner.controller.retryJob(source)
        await settle(owner)
        const page = await owner.queue.listManagerPage()
        const retry = page.items.find((item) => !before.items.some((old) => old.id === item.id))!
        assert.ok(retry)
        const copied = await owner.queue.loadVerifiedRetryInput(retry.id)
        assert.deepEqual(copied.payload, frozen.payload)
        assert.ok(
          copied.targetPngBytes.equals(frozen.targetPngBytes),
          'Retry must keep exact retained PNG',
        )
        assert.notEqual(copied.item.stagingSessionId, frozen.item.stagingSessionId)
        for (const candidate of candidates) {
          assert.ok(
            (await owner.staging.listVerifiedCandidates(owner.tabId)).some(
              (entry) => entry.candidateId === candidate.candidateId,
            ),
          )
        }
        assert.ok(
          (await readFile(owner.packagePath)).equals(owner.savedBytes),
          'Retry cannot replace saved .igs',
        )
      })
    })
  })

  test(`${family} public outpaint admission supplies synchronous document fence at real SQL commit while retaining old work`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      let replaceAtCommit = false
      let ownerAtCommit: Awaited<ReturnType<typeof publicOwner>> | undefined
      await withPublicOwner(
        fixture,
        async (owner) => {
          ownerAtCommit = owner
          await owner.controller.generate(owner.tabId, {
            documentId: owner.document.documentId,
            iterations: 1,
          })
          await settle(owner)
          const confirmation = await reviewedImpact(owner)
          const before = await owner.queue.listManagerPage()
          const candidates = await owner.staging.listVerifiedCandidates(owner.tabId)
          replaceAtCommit = true
          await assert.rejects(
            owner.controller.generate(owner.tabId, {
              confirmation,
              documentId: owner.document.documentId,
              iterations: 2,
            }),
            { code: 'GENERATION_DOCUMENT_CHANGED' },
          )
          assert.deepEqual(await owner.queue.listManagerPage(), before)
          assert.deepEqual(await owner.staging.listVerifiedCandidates(owner.tabId), candidates)
          assert.ok(
            (await readFile(owner.packagePath)).equals(owner.savedBytes),
            'stale admission cannot alter saved document',
          )
        },
        {
          beforeBatchCommit: async () => {
            if (replaceAtCommit) {
              ownerAtCommit!.setDocumentOverride(randomUUID())
            }
          },
        },
      )
    })
  })

  test(`${family} outpaint batch orchestrator snapshots caller-owned preparation and ready before the asynchronous barrier`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      await withPublicOwner(fixture, async (owner) => {
        const prepared: PreparedOutpaintGeneration = structuredClone(fixture.outpaintPrepared)
        prepared.targetPngBytes = Buffer.from(fixture.outpaintPrepared.targetPngBytes)
        prepared.context.documentId = owner.document.documentId
        prepared.context.documentRevision = owner.document.documentRevision
        const options = { iterations: 2, maxPrompts: 100, seedBehavior: 'per-iteration' as const }
        const ready = structuredClone(OUTPAINT_READY)
        const operation = owner.orchestrator.enqueuePreparedOutpaintBatch(
          owner.tabId,
          prepared,
          options,
          { ready },
        )
        prepared.context.prompts.positive = 'mutated caller prompt'
        prepared.context.sampling.denoisingStrength = 0.9
        prepared.targetPngBytes.fill(0)
        ready.capabilities.length = 0
        options.iterations = 7
        const result = await operation
        assert.equal(result.items.length, 2)
        assert.equal(
          owner.runtime.generated.length,
          0,
          'orchestrator admission must not run inference',
        )
        for (const item of result.items) {
          const saved = await owner.queue.loadVerifiedInput(item.id)
          assert.ok(isQueuedOutpaint(saved.payload))
          assert.equal(
            saved.payload.context.prompts.positive,
            fixture.target.generationDraft.positivePrompt.text,
          )
          assert.equal(saved.payload.context.sampling.denoisingStrength, 0.5)
          assert.ok(
            (await readFile(saved.targetPath)).equals(fixture.target.composite.bytes),
            'the pre-await source snapshot must remain exact',
          )
          await owner.processor.cancelAndWait(item.id)
        }
      })
    })
  })

  // Runtime preparation/admission owns a final child-exit await after durable publication.
  // Mutants checking only inside use(), or canceling old IDs instead of new owned IDs, escape
  // these held-wrapper transitions; every case keeps dispatch behind the public action barrier.
  for (const action of ['Generate', 'Retry'] as const) {
    test(`${family} public outpaint ${action} cancels only its new rows when the final runtime exit revokes admission`, async (t) => {
      for (const exitBoundary of action === 'Generate'
        ? (['runtime-exit', 'capture-exit'] as const)
        : (['runtime-exit'] as const)) {
        for (const refusal of [
          'replaced-document',
          'closed-project',
          'shutdown',
          'failed-exit',
        ] as const) {
          await t.test(`${exitBoundary} ${refusal}`, async () => {
            await withOutpaintConsumerFixture(family, async (fixture) => {
              await withPublicOwner(fixture, async (owner) => {
                let source:
                  Awaited<ReturnType<GenerationQueueRepository['getManagerEntry']>> | undefined
                if (action === 'Retry') {
                  owner.runtime.beforeGenerate = async () => {
                    throw new Error('Controlled inference failure creates a durable Retry source')
                  }
                  const failed = await owner.controller.generate(owner.tabId, {
                    documentId: owner.document.documentId,
                    iterations: 1,
                  })
                  assert.equal(failed.kind, 'queued')
                  if (failed.kind !== 'queued') {
                    throw new Error('Expected failed Retry source')
                  }
                  await settle(owner)
                  source = await owner.queue.getManagerEntry(failed.jobIds[0])
                  assert.equal(source.status, 'failed')
                  owner.runtime.beforeGenerate = null
                }
                let confirmation: { candidateIds: string[]; unfinishedJobIds: string[] } | undefined
                if (action === 'Generate') {
                  await owner.controller.generate(owner.tabId, {
                    documentId: owner.document.documentId,
                    iterations: 1,
                  })
                  await settle(owner)
                  const oldPrepared: PreparedOutpaintGeneration = structuredClone(
                    fixture.outpaintPrepared,
                  )
                  oldPrepared.targetPngBytes = Buffer.from(fixture.outpaintPrepared.targetPngBytes)
                  oldPrepared.context.documentId = owner.document.documentId
                  oldPrepared.context.documentRevision = owner.document.documentRevision
                  await owner.orchestrator.enqueuePreparedOutpaintBatch(
                    owner.tabId,
                    oldPrepared,
                    { iterations: 1, maxPrompts: 100, seedBehavior: 'per-iteration' },
                    { ready: owner.runtime.ready },
                  )
                  confirmation = await reviewedImpact(owner)
                  assert.equal(confirmation.candidateIds.length, 1)
                  assert.equal(confirmation.unfinishedJobIds.length, 1)
                }
                const before = await owner.queue.listManagerPage()
                const candidatesBefore = await owner.staging.listVerifiedCandidates(owner.tabId)
                const cursorBefore = await owner.staging.readLastActualSeed(
                  owner.tabId,
                  owner.document.documentId,
                )
                const candidateBytesBefore = await Promise.all(
                  candidatesBefore.map((candidate) => readFile(candidate.assetPath)),
                )
                const workerCalls = owner.runtime.generated.length
                const entered = signal()
                const release = signal()
                const heldExit = async () => {
                  entered.resolve()
                  await release.promise
                  if (refusal === 'failed-exit') {
                    throw Object.assign(new Error('Controlled final worker-exit refusal'), {
                      code: 'WORKER_EXIT_UNCONFIRMED',
                    })
                  }
                }
                if (action === 'Generate' && exitBoundary === 'runtime-exit') {
                  owner.runtime.beforePreparationExit = heldExit
                }
                if (action === 'Generate' && exitBoundary === 'capture-exit') {
                  owner.captureState.beforeExit = heldExit
                }
                if (action === 'Retry') {
                  owner.runtime.beforeAdmissionExit = heldExit
                }
                const operation =
                  action === 'Generate'
                    ? owner.controller.generate(owner.tabId, {
                        confirmation,
                        documentId: owner.document.documentId,
                        iterations: 2,
                      })
                    : owner.controller.retryJob(source!)
                // Attach the expected rejection before releasing the controlled exit so a refusal
                // never creates a transient unhandled rejection in the real test process.
                const refused = assert.rejects(operation, {
                  code:
                    refusal === 'failed-exit'
                      ? 'WORKER_EXIT_UNCONFIRMED'
                      : refusal === 'shutdown'
                        ? 'GENERATION_CLOSED'
                        : 'GENERATION_DOCUMENT_CHANGED',
                })
                void refused.catch(() => undefined)
                await entered.promise
                let owned: Awaited<
                  ReturnType<GenerationQueueRepository['listManagerPage']>
                >['items'] = []
                let stopping: Promise<void> | undefined
                try {
                  const committed = await owner.queue.listManagerPage()
                  owned = committed.items.filter(
                    (item) => !before.items.some((old) => old.id === item.id),
                  )
                  assert.equal(owned.length, action === 'Generate' ? 2 : 1)
                  assert.ok(
                    owned.every((item) => item.status === 'pending'),
                    'final exit must hold dispatch after publication',
                  )
                  assert.deepEqual(
                    await owner.staging.listVerifiedCandidates(owner.tabId),
                    candidatesBefore,
                    'the final wrapper exit must retain reviewed old sessions',
                  )
                  for (const item of before.items) {
                    assert.equal(
                      committed.items.find((entry) => entry.id === item.id)?.status,
                      item.status,
                      'the final wrapper exit must retain reviewed old jobs',
                    )
                  }
                  if (refusal === 'replaced-document') {
                    owner.setDocumentOverride(randomUUID())
                  }
                  if (refusal === 'closed-project') {
                    owner.setDocumentOverride(null)
                  }
                  if (refusal === 'shutdown') {
                    stopping = owner.controller.shutdown()
                  }
                } finally {
                  // Release even when a mutation destroys the old work and the observed invariant
                  // fails: cleanup must not turn that useful assertion into a hung admission.
                  release.resolve()
                }
                await refused
                await stopping
                const after = await owner.queue.listManagerPage()
                for (const item of owned) {
                  assert.equal(
                    after.items.find((entry) => entry.id === item.id)?.status,
                    'canceled',
                    'late refusal must cancel only the newly owned row',
                  )
                }
                for (const item of before.items) {
                  const actual = after.items.find((entry) => entry.id === item.id)!
                  assert.equal(actual.status, item.status, 'old source history must survive')
                }
                assert.equal(
                  owner.runtime.generated.length,
                  workerCalls,
                  'revoked new work cannot enter inference',
                )
                assert.deepEqual(
                  await owner.staging.listVerifiedCandidates(owner.tabId),
                  candidatesBefore,
                  'late refusal must retain the reviewed old candidate',
                )
                assert.equal(
                  await owner.staging.readLastActualSeed(owner.tabId, owner.document.documentId),
                  cursorBefore,
                  'late refusal must retain the actual seed cursor',
                )
                for (const [index, candidate] of candidatesBefore.entries()) {
                  assert.ok(
                    (await readFile(candidate.assetPath)).equals(candidateBytesBefore[index]),
                    'late refusal must retain exact old candidate PNG bytes',
                  )
                }
                assert.ok(
                  (await readFile(owner.packagePath)).equals(owner.savedBytes),
                  'late refusal cannot replace saved bytes',
                )
              })
            })
          })
        }
      }
    })
  }
}
