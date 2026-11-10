import type { ProjectGenerateOptions } from '../../shared/projects/project-generation-actions.js'
import { REGIONAL_REFERENCE_INFERENCE_PROFILE } from '../../shared/projects/regional-reference-inference.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { setImmediate } from 'node:timers/promises'

import type { VerifiedRegionalReferenceResources } from '../runtime/inference-auxiliary-resources.js'
import type { RegionalWorkerInput } from './regional-worker-request.js'
import type { RegionalProjectFixture } from './test-fixtures/regional-project.js'

import { ProjectGenerationActionController } from './generation-action-controller.js'
import { GenerationDispatchCoordinator } from './generation-dispatch-coordinator.js'
import { ProjectRegionalGenerationCoordinator } from './project-regional-generation-coordinator.js'
import { regionalProjectDigest } from './test-fixtures/regional-project.js'
import { createRegionalProjectFixture } from './test-fixtures/regional-project.js'

type ActionRuntime = ConstructorParameters<typeof ProjectGenerationActionController>[0]['runtime']
type WorkerRuntime = ConstructorParameters<typeof GenerationDispatchCoordinator>[0]
type Fixture = Awaited<ReturnType<typeof publicActionsFixture>>

/**
 * Real public controller/capture/queue/dispatch/staging; only runtime/model/PNG computation is
 * controlled.
 */
async function publicActionsFixture() {
  const f = await createRegionalProjectFixture()
  const referenceResources = {} as VerifiedRegionalReferenceResources
  for (const [key, role, filename] of [
    ['adapter', 'regional-reference-adapter', 'adapter.safetensors'],
    ['visionConfig', 'regional-reference-vision-config', 'config.json'],
    ['visionModel', 'regional-reference-vision-model', 'vision.safetensors'],
  ] as const) {
    const bytes = Buffer.from(`Explicit Main-only auxiliary fixture ${key}`)
    const managedPath = path.join(f.root, filename)
    await writeFile(managedPath, bytes)
    Object.assign(referenceResources, {
      [key]: { byteSize: bytes.length, managedPath, role, sha256: regionalProjectDigest(bytes) },
    })
  }
  let resourceReads = 0
  const coordinator = new ProjectRegionalGenerationCoordinator({
    compositionProfile: 'invoke-canvas-v1',
    gate: f.gate,
    models: f.models,
    orchestrator: f.orchestrator,
    projects: f.projects,
    regionalReferenceResources: {
      resolveVerifiedRegionalReferenceResources: async () => {
        resourceReads++
        for (const resource of Object.values(referenceResources)) {
          const bytes = await readFile(resource.managedPath)
          assert.equal(bytes.length, resource.byteSize)
          assert.equal(regionalProjectDigest(bytes), resource.sha256)
        }
        return structuredClone(referenceResources)
      },
    },
    scratchBasePath: f.scratch,
  })
  const controls: {
    afterPreparation?: () => Promise<void>
    beforePreparation?: () => Promise<void>
    beforeWorker?: () => Promise<void>
    failInference?: boolean
    ready: ReturnType<RegionalProjectFixture['input']>['ready']
  } = {
    ready: {
      ...f.input().ready,
      capabilities: [
        ...f.input().ready.capabilities,
        'illustrious-regional-invoke-v1',
        'illustrious-regional-reference-txt2img-v1',
      ],
    },
  }
  const consumed: RegionalWorkerInput[] = []
  const counters = { admission: 0, preparation: 0, worker: 0 }
  const runtime: ActionRuntime & WorkerRuntime = {
    getStatus: async () => null,
    readQualifiedInferenceReady: async () => structuredClone(controls.ready),
    retryUnconfirmedGenerationExit: async () => true,
    withGenerationAdmission: async (_scratch, use) => {
      counters.admission++
      return await use(structuredClone(controls.ready))
    },
    withGenerationPreparation: async (_scratch, use) => {
      counters.preparation++
      await controls.beforePreparation?.()
      const result = await use({
        inferenceReady: structuredClone(controls.ready),
        targetWorker: f.compositionWorker,
      })
      await controls.afterPreparation?.()
      return result
    },
    withGenerationWorker: async (_scratch, use) => {
      counters.worker++
      await controls.beforeWorker?.()
      return await use({
        ...f.transport({
          executeCurrentCanvasRegional: async (input) => {
            assert.ok(input.compositionProfile !== 'invoke-krea2-global-support-v1')
            consumed.push(structuredClone(input))
            if (controls.failInference) {
              throw new Error('Controlled first regional inference refusal')
            }
            return f.resultFor(input)
          },
          ready: structuredClone(controls.ready),
        }),
        generate: async () => assert.fail('Public regional work cannot enter the ordinary worker.'),
      })
    },
  }
  const dispatch = new GenerationDispatchCoordinator(
    runtime,
    f.orchestrator,
    f.processor,
    f.scratch,
    undefined,
    coordinator,
  )
  const actions = new ProjectGenerationActionController({
    dispatch,
    gate: f.gate,
    models: f.models,
    orchestrator: f.orchestrator,
    processor: f.processor,
    projects: f.projects,
    queue: f.queue,
    regional: coordinator,
    runtime,
    scratchBasePath: f.scratch,
    staging: f.staging,
  })
  const thumbnail = await readFile(
    path.resolve('src/main/projects/test-fixtures/candidate-thumbnail-64x64.webp'),
  )
  const owner = f.projects.getOpenDocumentForAcceptance(f.tabId)!
  const document = structuredClone(owner.document)
  const sources: Record<string, { bytes: Buffer }> = {}
  document.generationDraft.negativePrompt = { embeddingRefs: [], text: '' }
  delete document.regionalGuidance![0].prompts
  document.regionalGuidance![0].referenceImages = [0, 1].map(() => {
    const id = randomUUID()
    const asset = {
      bytes: f.outputBytes.length,
      height: 64,
      path: `assets/regional-references/${id}/${regionalProjectDigest(f.outputBytes)}.png`,
      sha256: regionalProjectDigest(f.outputBytes),
      width: 64,
    }
    const preview = {
      bytes: thumbnail.length,
      height: 64,
      path: `assets/regional-references/${id}/${regionalProjectDigest(thumbnail)}.webp`,
      sha256: regionalProjectDigest(thumbnail),
      width: 64,
    }
    sources[asset.path] = { bytes: f.outputBytes }
    sources[preview.path] = { bytes: thumbnail }
    return {
      asset,
      id,
      name: 'Original reference',
      sourceFormat: 'PNG' as const,
      thumbnail: preview,
    }
  })
  await owner.applyDocument(document, sources)
  await f.projects.save(f.tabId)
  return {
    ...f,
    actions,
    consumed,
    controls,
    counters,
    publicCoordinator: coordinator,
    referenceResources,
    resourceReads: () => resourceReads,
  }
}

async function withActions(use: (f: Fixture) => Promise<void>) {
  const f = await publicActionsFixture()
  try {
    await use(f)
  } finally {
    f.controls.beforePreparation = undefined
    f.controls.afterPreparation = undefined
    f.controls.beforeWorker = undefined
    await f.actions.shutdown()
    await f.publicCoordinator.shutdown()
    await f.close()
  }
}

const options = (f: Fixture): ProjectGenerateOptions => ({
  documentId: f.document().documentId,
  iterations: 1,
})

async function rows(f: Fixture) {
  return await f.db.selectFrom('generation_queue_item').selectAll().orderBy('created_at').execute()
}

async function queued(f: Fixture, request = options(f)) {
  const result = await f.actions.generate(f.tabId, request)
  assert.equal(result.kind, 'queued')
  if (result.kind !== 'queued') {
    assert.fail('Expected one reviewed public job.')
  }
  assert.equal(result.jobIds.length, 1)
  return result.jobIds[0]
}

/**
 * Completion is evidenced by the exact durable job and the controller's settled drain, never
 * elapsed sleep.
 */
async function settled(f: Fixture, id: string) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const job = await f.queue.getManagerEntry(id)
    const state = await f.actions.getState(f.tabId)
    if (['canceled', 'completed', 'failed'].includes(job.status) && state.phase === 'idle') {
      return job
    }
    if (state.phase === 'blocked') {
      assert.fail(`Public dispatch blocked: ${state.error?.code}: ${state.error?.message}`)
    }
    await setImmediate()
  }
  assert.fail('The exact public job did not settle before the bounded test deadline.')
}

test('public reference Generate freezes original images in order and Retry retains them after saved removal', async () => {
  await withActions(async (f) => {
    const original = structuredClone(f.document())
    const saved = await readFile(f.packagePath)
    f.controls.failInference = true
    const id = await queued(f)
    assert.equal((await settled(f, id)).status, 'failed')
    assert.equal(f.consumed.length, 1)
    const material = f.consumed[0]
    assert.equal(material.references?.profile, REGIONAL_REFERENCE_INFERENCE_PROFILE)
    assert.equal(
      material.recipe.regions[0].positive,
      null,
      'Image-only region is a genuine consumer.',
    )
    assert.equal(material.recipe.regions[0].negative.prompt.text, '')
    assert.deepEqual(
      material.references.images.map((r) => r.referenceId),
      original.regionalGuidance![0].referenceImages!.map((r) => r.id),
    )
    for (const image of material.references.images) {
      assert.deepEqual(Buffer.from(image.image.bytes), f.outputBytes)
    }
    assert.equal((await f.queue.getManagerEntry(id)).details?.requiresRegionalReferenceImages, true)
    assert.deepEqual(f.document(), original)
    assert.deepEqual(await readFile(f.packagePath), saved, 'Generate does not Add or Save.')
    await f.edit((document) => {
      document.regionalGuidance = []
    })
    await f.projects.save(f.tabId)
    const retryDocument = structuredClone(f.document())
    const retrySaved = await readFile(f.packagePath)
    const entry = await f.queue.getManagerEntry(id)
    f.controls.failInference = false
    await f.actions.retryJob({ id, statusSequence: entry.statusSequence })
    const after = await rows(f)
    assert.equal(after.length, 2)
    const retryId = after.find((r) => r.id !== id)!.id
    assert.equal((await settled(f, retryId)).status, 'completed')
    assert.equal(f.resourceReads(), 1, 'Retry uses the exact frozen resource descriptors.')
    assert.deepEqual(f.consumed[1].references, material.references)
    assert.deepEqual(f.document(), retryDocument, 'Retry does not Add or edit the live Project.')
    assert.deepEqual(await readFile(f.packagePath), retrySaved, 'Retry does not Save.')
  })
})

test('missing reference capability or exact resource refuses public Generate before SQL and never falls back', async () => {
  await withActions(async (f) => {
    f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
      (c) => c !== 'illustrious-regional-reference-txt2img-v1',
    )
    await assert.rejects(f.actions.generate(f.tabId, options(f)), /qualified this regional profile/)
    assert.equal((await rows(f)).length, 0)
    assert.equal(f.resourceReads(), 0)
    assert.equal(f.consumed.length, 0)
    f.controls.ready.capabilities = [
      ...f.controls.ready.capabilities,
      'illustrious-regional-reference-txt2img-v1',
    ]
    await rm(f.referenceResources.visionModel.managedPath)
    await assert.rejects(f.actions.generate(f.tabId, options(f)))
    assert.equal((await rows(f)).length, 0)
    assert.equal(f.consumed.length, 0)
  })
})

test('frozen reference Retry rejects missing capability and changed exact resources before another row', async () => {
  await withActions(async (f) => {
    f.controls.failInference = true
    const id = await queued(f)
    const entry = await settled(f, id)
    assert.equal(entry.status, 'failed')
    f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
      (c) => c !== 'illustrious-regional-reference-txt2img-v1',
    )
    await assert.rejects(
      f.actions.retryJob({ id, statusSequence: entry.statusSequence }),
      /Repair or update/,
    )
    assert.equal((await rows(f)).length, 1)
    f.controls.ready.capabilities = [
      ...f.controls.ready.capabilities,
      'illustrious-regional-reference-txt2img-v1',
    ]
    await writeFile(f.referenceResources.adapter.managedPath, 'Changed exact adapter bytes')
    await assert.rejects(f.actions.retryJob({ id, statusSequence: entry.statusSequence }))
    assert.equal((await rows(f)).length, 1)
    assert.equal(f.consumed.length, 1)
  })
})

test('reference resources changed during final capacity preflight refuse before Generate SQL', async () => {
  await withActions(async (f) => {
    const preflight = f.staging.preflightRegionalBatchCapacity.bind(f.staging)
    f.staging.preflightRegionalBatchCapacity = async (input) => {
      await preflight(input)
      await writeFile(
        f.referenceResources.adapter.managedPath,
        'changed after coherent reference capture',
      )
    }
    await assert.rejects(f.actions.generate(f.tabId, options(f)))
    assert.equal((await rows(f)).length, 0)
    assert.equal(f.consumed.length, 0)
  })
})
