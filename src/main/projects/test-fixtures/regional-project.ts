import { IGS_SRGB_ICC_SHA256 } from '../../../shared/projects/color-profile.js'
import { defaultIllustriousNoiseProfile } from '../../../shared/projects/illustrious-noise-profile.js'
import type {
  IgsProjectDocumentV1,
  IgsRegionalGuidanceV1,
} from '../../../shared/projects/project-schema.js'
import type { PromptEmbeddingRef } from '../../../shared/projects/prompt-embeddings.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { GenerationQueueTestHooks } from '../generation-queue.js'
import type { GenerationStagingTestHooks } from '../generation-staging.js'
import type { GenerationModelResolver } from '../illustrious-generation-loras.js'
import type { RegionalGenerationTransport } from '../regional-generation-processor.js'
import type {
  OperationalRegionalWorkerInput,
  RegionalWorkerResult,
} from '../regional-worker-request.js'
import type { ProjectWorkerClient } from '../worker-client.js'

import { openAppDatabase } from '../../db/database.js'
import { GenerationOrchestrator } from '../generation-orchestrator.js'
import { GenerationProcessor } from '../generation-processor.js'
import { GenerationQueueRepository } from '../generation-queue.js'
import { GenerationStagingRepository } from '../generation-staging.js'
import { readIgsPackage } from '../igs-package.js'
import { ProjectAutosaveLeaseRegistry } from '../project-autosave.js'
import { ProjectGenerationClose } from '../project-generation-close.js'
import { ProjectGenerationOperationGate } from '../project-generation-operation-gate.js'
import { ProjectGenerationStagingLifecycle } from '../project-generation-staging-lifecycle.js'
import { ProjectIndexRepository } from '../project-index.js'
import { encodeProjectMaskPng } from '../project-mask.js'
import { ProjectRegionalGenerationCoordinator } from '../project-regional-generation-coordinator.js'
import { ProjectService } from '../project-service.js'
import { ProjectShadowStore } from '../project-shadow.js'
import { REGIONAL_QUEUE_READY } from './regional-queue.js'
import { literalSmartPatchColorPng } from './smart-patch-input-material.js'

export const regionalProjectDigest = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex')

export type RegionalProjectFixture = Awaited<ReturnType<typeof createRegionalProjectFixture>>

type Document = IgsProjectDocumentV1
export function regionalProjectDeferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/**
 * Real Service, Save/reopen, SQL migrations, queue, staging and both dispatch owners. Only the
 * model qualifier and target/numerical worker are small, explicit substitutes. No prepared context
 * or regional recipe is supplied by this fixture. InvokeAI source consulted at
 * a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd: session_queue_default.py and its API router,
 * session_processor_default.py (saved execution, owner cancellation and stop).
 */
export async function createRegionalProjectFixture(
  options: {
    queueHooks?: GenerationQueueTestHooks
    stagingHooks?: GenerationStagingTestHooks
  } = {},
) {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-regional-project-'))
  const scratch = path.join(root, 'scratch')
  await mkdir(scratch, { mode: 0o700, recursive: true })
  const database = openAppDatabase(root, path.resolve('src/main/db/migrations'))
  const index = new ProjectIndexRepository(database.db)
  const queue = new GenerationQueueRepository(database.db, root, options.queueHooks)
  const staging = new GenerationStagingRepository(database.db, root, options.stagingHooks)
  await queue.recoverAfterRestart()
  await staging.recoverAfterRestart()
  const roots = {
    placeholdersDir: path.resolve('src/main/projects/placeholders'),
    scratchDir: scratch,
  }
  const projects = new ProjectService({
    autosaveOptions: { debounceMs: 60_000, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    dataRoot: root,
    readLastActualSeed: async (tabId, documentId) =>
      await staging.readLastActualSeed(tabId, documentId),
    repository: index,
    roots,
    shadow: new ProjectShadowStore(path.join(root, 'autosave')),
  })
  const modelPath = path.join(root, 'tiny-checkpoint.safetensors')
  const modelBytes = Buffer.from('explicit structural regional Project checkpoint substitute')
  await writeFile(modelPath, modelBytes, { mode: 0o600 })
  const reference: NonNullable<Document['generationDraft']['model']> = {
    baseModelFamily: 'illustrious',
    civitaiFileId: 303,
    civitaiModelId: 101,
    civitaiVersionId: 202,
    displayName: 'Explicit regional Project checkpoint fixture',
    fileSha256: regionalProjectDigest(modelBytes),
    kind: 'checkpoint',
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: 'epsilon',
    versionName: 'Fixture',
  }
  const embeddingBytes = Buffer.from('explicit exact regional TI resolver substitute')
  const embeddingPath = path.join(root, 'tiny-embedding.safetensors')
  await writeFile(embeddingPath, embeddingBytes, { mode: 0o600 })
  const embedding: PromptEmbeddingRef = {
    resource: {
      ...reference,
      fileSha256: regionalProjectDigest(embeddingBytes),
      kind: 'embedding',
      localModelId: randomUUID(),
      localVersionId: randomUUID(),
      predictionType: null,
    },
    token: '<regional-fixture>',
  }
  const calls = {
    checkpoint: 0,
    compose: [] as Parameters<ProjectWorkerClient['composeTarget']>[0][],
    embedding: 0,
  }
  const hooks: {
    checkpoint?: () => Promise<void>
    compose?: () => Promise<void>
  } = {}
  const models: GenerationModelResolver = {
    assertNoUnboundGenerationEmbeddings: async () => {},
    resolveVerifiedGenerationCheckpointForPlan: async (saved) => {
      calls.checkpoint++
      assert.deepEqual(saved, reference)
      assert.ok((await readFile(modelPath)).equals(modelBytes), 'Exact tiny checkpoint bytes')
      await hooks.checkpoint?.()
      return {
        managedPath: modelPath,
        noiseProfile: defaultIllustriousNoiseProfile(),
        reference: structuredClone(reference),
      }
    },
    resolveVerifiedGenerationEmbeddingForPlan: async (saved) => {
      calls.embedding++
      assert.deepEqual(saved, embedding.resource)
      assert.ok((await readFile(embeddingPath)).equals(embeddingBytes), 'Exact tiny TI bytes')
      return {
        byteSize: embeddingBytes.length,
        managedPath: embeddingPath,
        reference: structuredClone(embedding.resource),
      }
    },
    resolveVerifiedGenerationLoraForPlan: async () =>
      assert.fail('No enabled LoRA is supported by this fixture.'),
    resolveVerifiedGenerationVaeForPlan: async () =>
      assert.fail('No external VAE is supported by this fixture.'),
  }
  const bbox = { height: 64, width: 64, x: -13, y: 5 }
  const alpha = Uint8Array.from({ length: 4096 }, (_, i) => [0, 1, 53, 128, 254, 255][i % 6])
  const targetBytes = literalSmartPatchColorPng(
    64,
    64,
    Array.from({ length: 4096 }, () => [0, 0, 0, 0]).flat(),
    4,
  )
  const outputBytes = literalSmartPatchColorPng(
    64,
    64,
    Array.from({ length: 4096 }, () => [23, 47, 91]).flat(),
    3,
  )
  const compositionWorker: Pick<ProjectWorkerClient, 'composeTarget'> = {
    composeTarget: async (input) => {
      calls.compose.push(structuredClone(input))
      await hooks.compose?.()
      assert.deepEqual(input.bbox, bbox)
      assert.equal(input.layers.length, 0, 'Regional masks never become compositing layers.')
      await writeFile(input.targetPngPath, targetBytes, { flag: 'wx', mode: 0o600 })
      return {
        composite: {
          byteSize: targetBytes.length,
          colorSpace: 'srgb',
          height: 64,
          iccSha256: IGS_SRGB_ICC_SHA256,
          path: input.targetPngPath,
          sha256: regionalProjectDigest(targetBytes),
          width: 64,
        },
        mode: 'txt2img',
        rect: { ...bbox },
      }
    },
  }
  const gate = new ProjectGenerationOperationGate()
  const processor = new GenerationProcessor(queue, staging, models, scratch)
  const orchestrator = new GenerationOrchestrator(
    projects,
    index,
    models,
    queue,
    staging,
    processor,
    scratch,
  )
  const coordinator = new ProjectRegionalGenerationCoordinator({
    gate,
    models,
    orchestrator,
    projects,
    scratchBasePath: scratch,
  })
  const lifecycle = new ProjectGenerationStagingLifecycle(staging, {
    discardProject: async () => ({ cleanupDeferred: false, discardedSessionCount: 0 }),
    listVerifiedCandidates: async () => [],
  })
  const generationClose = new ProjectGenerationClose(
    projects,
    {
      orchestrator,
      queue,
      staging: {
        discardProject: async (tabId) => await lifecycle.discardProject(tabId),
        listOwnedCandidates: async (tabId) => await lifecycle.listOwnedCandidates(tabId),
        listVerifiedCandidates: async (tabId) => await lifecycle.listVerifiedCandidates(tabId),
      },
    },
    gate,
  )
  const createProject = async (title = 'Private Regional Project') => {
    const created = await projects.create({ height: 64, title, width: 64 })
    const co = projects.getOpenDocumentForAcceptance(created.id)!
    const maskId = randomUUID()
    const maskBytes = encodeProjectMaskPng(alpha, 64, 64)
    const maskAsset = {
      bytes: maskBytes.length,
      height: 64,
      path: `assets/masks/${maskId}/${regionalProjectDigest(maskBytes)}.png`,
      sha256: regionalProjectDigest(maskBytes),
      width: 64,
    }
    const region: IgsRegionalGuidanceV1 = {
      enabled: true,
      id: randomUUID(),
      locked: false,
      mask: { asset: maskAsset, bounds: { ...bbox }, id: maskId, revision: 1 },
      name: 'Owned soft alpha',
      overlayOpacity: 0,
      prompts: {
        negative: null,
        positive: { embeddingRefs: [], text: 'regional subject' },
        useGlobalNegativePrompt: true,
      },
    }
    const document: Document = {
      ...co.document,
      generationDraft: {
        ...co.document.generationDraft,
        model: structuredClone(reference),
        negativePrompt: { embeddingRefs: [], text: 'global negative' },
        positivePrompt: { embeddingRefs: [], text: 'global positive' },
        sampling: {
          cfgScale: 5,
          denoisingStrength: null,
          sampler: 'Euler',
          scheduler: 'Normal',
          steps: 2,
        },
        seed: { policy: 'fixed', value: 123 },
        vae: null,
        vaePrecision: 'FP16',
      },
      primaryBbox: { ...bbox },
      regionalGuidance: [region],
    }
    await co.applyDocument(document, { [maskAsset.path]: { bytes: maskBytes } })
    await projects.save(created.id)
    const packagePath = co.filePath
    await projects.close(created.id)
    assert.equal((await projects.open(created.id)).kind, 'opened')
    assert.deepEqual(
      (await readIgsPackage(packagePath)).project,
      projects.getOpenDocumentForAcceptance(created.id)!.document,
    )
    return { packagePath, regionId: region.id, tabId: created.id }
  }
  const main = await createProject()
  const document = (tabId = main.tabId) => projects.getOpenDocumentForAcceptance(tabId)!.document
  const owner = (tabId = main.tabId) => ({
    documentId: document(tabId).documentId,
    documentRevision: document(tabId).documentRevision,
  })
  const input = (
    tabId = main.tabId,
  ): Parameters<ProjectRegionalGenerationCoordinator['submit']>[1] => ({
    ...owner(tabId),
    compositionWorker,
    globalNegativeCoverage: { kind: 'everywhere' },
    globalPositiveCoverage: { kind: 'everywhere' },
    layout: 'cfg-negative-first',
    negativePooledSourceId: 'current-canvas',
    optIn: 'private-current-canvas-regional-v1',
    positivePooledSourceId: 'current-canvas',
    ready: structuredClone(REGIONAL_QUEUE_READY),
  })
  const edit = async (change: (next: Document) => void, tabId = main.tabId) => {
    const co = projects.getOpenDocumentForAcceptance(tabId)!
    const next = structuredClone(co.document)
    change(next)
    await co.applyDocument(next)
  }
  const resultFor = (value: OperationalRegionalWorkerInput): RegionalWorkerResult => {
    assert.ok(value.compositionProfile !== 'invoke-krea2-global-support-v1')
    return {
      output: {
        byteSize: outputBytes.length,
        colorSpace: 'srgb',
        height: 64,
        iccSha256: IGS_SRGB_ICC_SHA256,
        path: path.join(root, 'disposed-provisional-result.png'),
        sha256: regionalProjectDigest(outputBytes),
        width: 64,
      },
      pngBytes: Buffer.from(outputBytes),
      seed: value.request.job.sampling.seed,
    }
  }
  const transport = (
    overrides: Partial<RegionalGenerationTransport> = {},
  ): RegionalGenerationTransport => ({
    close: async () => {},
    executeCurrentCanvasRegional: async (value) => resultFor(value),
    ready: structuredClone(REGIONAL_QUEUE_READY),
    ...overrides,
  })
  return {
    ...main,
    alpha,
    bbox,
    calls,
    close: async () => {
      hooks.checkpoint = undefined
      hooks.compose = undefined
      await coordinator.shutdown()
      await processor.stopAndCancelActive()
      for (const tab of projects.getOpenTabs()) {
        await projects.discardAndClose(tab.id)
      }
      await database.close()
      await rm(root, { force: true, recursive: true })
    },
    compositionWorker,
    coordinator,
    createProject,
    database,
    db: database.db,
    document,
    edit,
    embedding,
    gate,
    generationClose,
    hooks,
    index,
    input,
    lifecycle,
    models,
    orchestrator,
    outputBytes,
    owner,
    processor,
    projects,
    queue,
    reference,
    resultFor,
    root,
    roots,
    scratch,
    staging,
    targetBytes,
    transport,
  }
}
