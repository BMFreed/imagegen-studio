import {
  isProjectGenerationDraftChange,
  isProjectGenerationModelSelection,
} from '../../shared/api.js'
import type { ProjectGenerationDraftChange } from '../../shared/api.js'
import { parsePresetApplicationPayload } from '../../shared/presets/preset-application.js'
import { isAcceptedResultHistoryPage } from '../../shared/projects/accepted-result-history.js'
import { isRasterGenerationData } from '../../shared/projects/generation-settings-comparison.js'
import { defaultIllustriousNoiseProfile } from '../../shared/projects/illustrious-noise-profile.js'
import { isProjectAcceptedResultView } from '../../shared/projects/project-accepted-results.js'
import {
  generationTargetSignature,
  hashGenerationTargetSignature,
} from '../../shared/projects/project-generation-target-state.js'
import {
  createEmptyProjectDocumentV1,
  IGS_SAFETY_CEILINGS,
} from '../../shared/projects/project-schema.js'

import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { acceptedHistoryLayerAvailable } from '../../renderer/components/accepted-history-navigation.js'
import { ProjectDraftSync } from '../../renderer/components/project-draft-sync.js'
import { type AppDatabase, openAppDatabase } from '../db/database.js'
import { CivitaiClient } from '../models/civitai-client.js'
import { CivitaiTokenStore } from '../models/civitai-token-store.js'
import { ModelRepository } from '../models/model-repository.js'
import { ModelService } from '../models/model-service.js'
import { PresetRepository } from '../presets/preset-repository.js'
import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry, type ProjectAutosaveOptions } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { parseProjectLayerImageUrl, streamStagedProjectLayer } from './project-layer-resource.js'
import { readProjectPlaceholders } from './project-placeholders.js'
import { ProjectService } from './project-service.js'
import { ProjectSession } from './project-session.js'
import { ProjectShadowStore } from './project-shadow.js'
import {
  acceptedOutputPngFixture,
  acceptedRasterProvenanceFixture,
} from './test-fixtures/accepted-provenance.js'
import { requireRasterLayer } from './test-fixtures/require-raster-layer.js'
import { ProjectWorkerClient, ProjectWorkerError } from './worker-client.js'

function newProjectResource<K extends 'checkpoint' | 'embedding' | 'lora' | 'vae'>(kind: K) {
  return {
    baseModelFamily: 'illustrious' as const,
    civitaiFileId: 303,
    civitaiModelId: 101,
    civitaiVersionId: 202,
    displayName: `Missing exact ${kind}`,
    fileSha256: 'c'.repeat(64),
    kind,
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: kind === 'checkpoint' ? ('v_prediction' as const) : null,
    versionName: 'Saved version; never the catalog default',
  }
}

test('New Project publishes detached preset settings in its first real package without Apply, history or resource fallback', async () => {
  await withService(async ({ database, modelService, repository, service, shadow }) => {
    const presets = new PresetRepository(database.db)
    const checkpoint = newProjectResource('checkpoint')
    const lora = newProjectResource('lora')
    const embedding = newProjectResource('embedding')
    const vae = newProjectResource('vae')
    const source = await presets.create({
      description: 'Saved source stays independent',
      favorite: true,
      name: 'Initialization source',
      payload: {
        cfgRescale: 0,
        guidance: { cfgScale: 0, steps: 9 },
        loras: [{ enabled: false, resource: lora, weight: -0.75 }],
        model: { ...checkpoint, noiseProfile: defaultIllustriousNoiseProfile() },
        negativePrompt: { embeddingRefs: [], text: 'authored negative' },
        prompt: {
          embeddingRefs: [{ resource: embedding, token: 'chosen' }],
          text: 'chosen studio',
        },
        sampling: { sampler: 'DPM++ 2M', scheduler: 'Karras' },
        seed: { policy: 'fixed', value: 123 },
        size: { height: 768, width: 1024 },
        vae,
        vaePrecision: 'Auto',
      },
      tags: ['source'],
      workflow: 'textToImage',
    })
    const generationPayload = parsePresetApplicationPayload(source.payload, [
      'prompt',
      'negativePrompt',
      'model',
      'loras',
      'size',
      'sampling',
      'guidance',
      'cfgRescale',
      'vae',
      'vaePrecision',
    ])
    generationPayload.prompt!.text = 'chosen customized studio'
    const expected = structuredClone(generationPayload)
    const creating = service.create({
      generationPayload,
      height: 768,
      title: 'Customized initialization',
      width: 1024,
    })
    generationPayload.prompt!.text = 'late caller edit'
    generationPayload.loras![0].weight = 8
    const tab = await creating
    assert.equal(tab.dirty, false)
    assert.equal(tab.canUndo, false)
    assert.equal(tab.canRedo, false)
    assert.deepEqual(tab.primaryBbox, { height: 768, width: 1024, x: 0, y: 0 })
    assert.deepEqual(tab.generationDraft.positivePrompt, expected.prompt)
    assert.deepEqual(tab.generationDraft.negativePrompt, expected.negativePrompt)
    assert.deepEqual(tab.generationDraft.loras, expected.loras)
    assert.deepEqual(tab.generationDraft.model, checkpoint)
    assert.deepEqual(tab.generationDraft.vae, vae)
    assert.equal(tab.generationDraft.cfgRescale, 0)
    assert.equal(tab.generationDraft.vaePrecision, 'Auto')
    assert.equal(tab.generationDraft.sampling.cfgScale, 0)
    assert.equal(tab.generationDraft.sampling.steps, 9)
    assert.equal(tab.generationDraft.sampling.sampler, 'DPM++ 2M')
    assert.equal(tab.generationDraft.sampling.scheduler, 'Karras')
    assert.equal(tab.generationDraft.sampling.denoisingStrength, null)
    assert.deepEqual(tab.generationDraft.seed, { policy: 'random', value: null })
    assert.equal(tab.lastActualSeedSnapshot, null)
    assert.deepEqual(tab.layers, [])
    assert.deepEqual(await modelService.getCatalog({ buildPreviews: false }), [])
    assert.deepEqual(await presets.get(source.id), source)
    const savedPath = (await repository.listProjects())[0].canonicalPath
    const saved = await readIgsPackage(savedPath)
    assert.deepEqual(saved.project.generationDraft, tab.generationDraft)
    assert.deepEqual(saved.project.primaryBbox, tab.primaryBbox)
    assert.equal(saved.manifest.preview.status, 'empty')
    assert.equal(Object.hasOwn(saved.project, 'sourcePresetId'), false)
    assert.equal(
      (await shadow.inspect({ projectPath: savedPath, savedPackage: saved })).status,
      'absent',
    )
    await service.close(tab.id)
    const reopened = await service.open(tab.id)
    assert.equal(reopened.kind, 'opened')
    assert.ok(reopened.kind === 'opened')
    assert.deepEqual(reopened.tab.generationDraft, tab.generationDraft)
    assert.equal(reopened.tab.canUndo, false)
    await service.close(reopened.tab.id)
    const neighbor = await service.create({ height: 64, title: 'No preset neighbor', width: 64 })
    assert.deepEqual(neighbor.generationDraft.seed, { policy: 'random', value: null })
    assert.deepEqual(neighbor.generationDraft.positivePrompt, { embeddingRefs: [], text: '' })
    assert.equal(neighbor.generationDraft.sampling.steps, null)
    assert.equal(neighbor.generationDraft.model, null)
    await service.close(neighbor.id)
  })
})

test('New Project retains explicit Fixed zero and Reuse without inheriting a cursor', async () => {
  await withService(async ({ repository, service }) => {
    for (const seed of [{ policy: 'fixed', value: 0 }, { policy: 'reuse' }] as const) {
      const tab = await service.create({
        generationPayload: { sampling: { animaMethod: 'heun' }, seed, vae: null },
        height: 64,
        title: `Explicit ${seed.policy}`,
        width: 64,
      })
      const expected = { policy: seed.policy, value: seed.policy === 'fixed' ? 0 : null }
      assert.deepEqual(tab.generationDraft.seed, expected)
      assert.equal(tab.lastActualSeedSnapshot, null)
      assert.equal(tab.generationDraft.sampling.animaMethod, 'heun')
      assert.equal(tab.generationDraft.sampling.sampler, null)
      assert.equal(tab.generationDraft.sampling.scheduler, null)
      const savedPath = (await repository.listProjects()).find(
        (row) => row.localProjectKey === tab.id,
      )!.canonicalPath
      assert.deepEqual((await readIgsPackage(savedPath)).project.generationDraft.seed, expected)
      await service.close(tab.id)
    }
  })
})

test('invalid New Project payloads refuse before managed directories, package or index publication', async () => {
  await withService(async ({ database, dataRoot, repository, service }) => {
    const files = (await readdir(dataRoot)).sort()
    const invalid: unknown[] = [
      { height: 64, sourcePresetId: randomUUID(), title: 'Invalid', width: 64 },
      { generationPayload: { denoisingStrength: 0.4 }, height: 64, title: 'Invalid', width: 64 },
      {
        generationPayload: { size: { height: 64, width: 128 } },
        height: 64,
        title: 'Invalid',
        width: 64,
      },
      {
        generationPayload: { prompt: { text: 'missing sidecars' } },
        height: 64,
        title: 'Invalid',
        width: 64,
      },
      {
        generationPayload: { guidance: { cfgScale: 0, steps: null } },
        height: 64,
        title: 'Invalid',
        width: 64,
      },
      {
        generationPayload: { model: { ...newProjectResource('vae'), kind: 'vae' } },
        height: 64,
        title: 'Invalid',
        width: 64,
      },
      { generationPayload: { layers: [] }, height: 64, title: 'Invalid', width: 64 },
    ]
    for (const input of invalid) {
      await assert.rejects(service.create(input as never), { code: 'PROJECT_INVALID_INPUT' })
      assert.deepEqual((await readdir(dataRoot)).sort(), files)
      assert.deepEqual(await repository.listProjects(), [])
      assert.deepEqual(await database.db.selectFrom('project_workspace').selectAll().execute(), [])
      assert.deepEqual(service.getOpenTabs(), [])
    }
    const valid = await service.create({
      generationPayload: {},
      height: 64,
      title: 'Valid neighbor',
      width: 64,
    })
    assert.equal(valid.dirty, false)
    assert.equal((await repository.listProjects()).length, 1)
    await service.close(valid.id)
  })
})

test('preset Apply copies selected values in one Main undo step, preserving saved source and neighboring Project', async () => {
  await withService(async ({ database, modelService, repository, service }) => {
    const presets = new PresetRepository(database.db)
    const source = await presets.create({
      description: '',
      favorite: false,
      name: 'Apply source',
      payload: {
        cfgRescale: 0,
        denoisingStrength: 0.4,
        guidance: { cfgScale: 6, steps: 32 },
        loras: [],
        negativePrompt: { embeddingRefs: [], text: 'source negative' },
        prompt: { embeddingRefs: [], text: 'saved source prompt' },
        sampling: { animaMethod: 'heun' },
        seed: { policy: 'fixed', value: 0 },
        size: { height: 832, width: 1440 },
        vae: null,
        vaePrecision: 'Auto',
      },
      tags: [],
      workflow: 'imageToImage',
    })
    const created = await service.create({ height: 64, title: 'Apply target', width: 64 })
    const neighbor = await service.create({ height: 64, title: 'Neighbor', width: 64 })
    const entries = await repository.listProjects()
    const targetPath = entries.find((row) => row.localProjectKey === created.id)!.canonicalPath
    const neighborPath = entries.find((row) => row.localProjectKey === neighbor.id)!.canonicalPath
    const originalBytes = await readFile(targetPath)
    const neighborBytes = await readFile(neighborPath)
    const current = structuredClone(created)
    const payload = structuredClone(source.payload)
    payload.prompt!.text = 'temporary customized prompt'
    const applied = await service.applyPreset(
      created.id,
      {
        documentId: created.documentId,
        payload,
        selectedSections: [
          'prompt',
          'guidance',
          'sampling',
          'cfgRescale',
          'loras',
          'vae',
          'vaePrecision',
          'denoisingStrength',
        ],
        sourcePresetId: source.id,
      },
      (request, target) => modelService.verifyPresetApplication(request, target),
    )
    assert.equal(applied.generationDraft.positivePrompt.text, 'temporary customized prompt')
    assert.equal(applied.generationDraft.sampling.steps, 32)
    assert.equal(applied.generationDraft.sampling.animaMethod, 'heun')
    assert.equal(applied.generationDraft.cfgRescale, 0)
    assert.equal(applied.generationDraft.sampling.denoisingStrength, 0.4)
    assert.equal(applied.generationDraft.sampling.sampler, current.generationDraft.sampling.sampler)
    assert.equal(
      applied.generationDraft.sampling.scheduler,
      current.generationDraft.sampling.scheduler,
    )
    assert.deepEqual(applied.primaryBbox, current.primaryBbox)
    assert.deepEqual(applied.generationDraft.seed, current.generationDraft.seed)
    assert.deepEqual(applied.generationDraft.negativePrompt, current.generationDraft.negativePrompt)
    assert.deepEqual(applied.layers, current.layers)
    assert.deepEqual(await presets.get(source.id), source)
    await service.flushAutosave(created.id)
    assert.ok(
      (await readFile(targetPath)).equals(originalBytes),
      'Apply only writes recovery before Save',
    )
    const undone = await service.undo(created.id)
    assert.equal(undone.canUndo, false, 'all copied sections are one undo operation')
    assert.deepEqual(undone.generationDraft, current.generationDraft)
    assert.deepEqual(undone.primaryBbox, current.primaryBbox)
    const redone = await service.redo(created.id)
    assert.deepEqual(redone.generationDraft, applied.generationDraft)
    const saved = await service.save(created.id)
    assert.equal(saved.tab.dirty, false)
    assert.deepEqual(
      (await readIgsPackage(targetPath)).project.generationDraft,
      applied.generationDraft,
    )
    assert.deepEqual(await presets.get(source.id), source)
    assert.deepEqual(
      service.getOpenTabs().find((tab) => tab.id === neighbor.id),
      neighbor,
    )
    assert.ok(
      (await readFile(neighborPath)).equals(neighborBytes),
      'neighbor saved package unchanged',
    )
    assert.deepEqual(
      await service.applyPreset(
        created.id,
        {
          documentId: created.documentId,
          payload: { prompt: payload.prompt },
          selectedSections: ['prompt'],
          sourcePresetId: source.id,
        },
        (request, target) => modelService.verifyPresetApplication(request, target),
      ),
      saved.tab,
      'no-op Apply creates no history',
    )
    await service.close(created.id)
    await service.close(neighbor.id)
  })
})

test('preset Apply rejects failed verification and asynchronous changed or closed destination without publishing', async () => {
  await withService(async ({ service }) => {
    const created = await service.create({ height: 64, title: 'Apply races', width: 64 })
    const request = {
      documentId: created.documentId,
      payload: { prompt: { embeddingRefs: [], text: 'must not publish' } },
      selectedSections: ['prompt'] as const,
      sourcePresetId: randomUUID(),
    }
    const input = { ...request, selectedSections: [...request.selectedSections] }
    await assert.rejects(
      service.applyPreset(created.id, input, async () => {
        throw new Error('verification failed')
      }),
      /verification failed/,
    )
    assert.deepEqual(service.getOpenTabs()[0], created)
    let release!: () => void
    const verifyPending = new Promise<void>((resolve) => {
      release = resolve
    })
    const pending = service.applyPreset(created.id, input, () => verifyPending)
    const rejection = assert.rejects(pending, { code: 'EDIT_CONFLICT' })
    input.payload.prompt.text = 'caller changed during await'
    const edited = await service.updateGenerationDraft(created.id, {
      kind: 'sampling-steps',
      value: 24,
    })
    release()
    await rejection
    assert.deepEqual(service.getOpenTabs()[0], edited)
    const undone = await service.undo(created.id)
    assert.equal(undone.canUndo, false, 'rejected Apply added no undo entry')
    assert.equal(
      undone.generationDraft.positivePrompt.text,
      created.generationDraft.positivePrompt.text,
    )
    const closePending = new Promise<void>((resolve) => {
      release = resolve
    })
    const late = service.applyPreset(
      created.id,
      { ...input, payload: request.payload },
      () => closePending,
    )
    const lateRejection = assert.rejects(late, { code: 'EDIT_CONFLICT' })
    await service.close(created.id)
    release()
    await lateRejection
    assert.equal(service.getOpenTabs().length, 0)
  })
})

test('preset Apply captures immutable selected data, ignores unselected invalid data and rejects wrong identity', async () => {
  await withService(async ({ service }) => {
    const created = await service.create({ height: 64, title: 'Apply capture', width: 64 })
    const input = {
      documentId: created.documentId,
      payload: {
        guidance: { cfgScale: -1, steps: -1 },
        prompt: { embeddingRefs: [], text: 'captured' },
      },
      selectedSections: ['prompt'] as 'prompt'[],
      sourcePresetId: randomUUID(),
    }
    let release!: () => void
    const paused = new Promise<void>((resolve) => {
      release = resolve
    })
    const operation = service.applyPreset(created.id, input, async (request, current) => {
      request.payload.prompt!.text = 'verifier mutation'
      current.generationDraft.positivePrompt.text = 'verifier mutation'
      await paused
    })
    input.payload.prompt.text = 'caller mutation'
    release()
    const applied = await operation
    assert.equal(applied.generationDraft.positivePrompt.text, 'captured')
    assert.deepEqual(applied.generationDraft.sampling, created.generationDraft.sampling)
    await assert.rejects(
      service.applyPreset(
        created.id,
        { ...input, documentId: randomUUID() },
        async () => undefined,
      ),
      { code: 'EDIT_CONFLICT' },
    )
    await service.undo(created.id)
    await service.close(created.id)
  })
})

test('native draft choices and clear cross Main history, real shadow recovery and explicit package Save', async () => {
  await withService(async ({ dataRoot, modelService, repository, service, shadow }) => {
    const created = await service.create({
      height: 512,
      title: 'Anima authored methods',
      width: 512,
    })
    const savedPath = (await repository.listProjects())[0].canonicalPath
    const original = await readFile(savedPath)
    assert.equal(Object.hasOwn(created.generationDraft.sampling, 'animaMethod'), false)
    const baseline = structuredClone(created.generationDraft)
    const model = {
      baseModelFamily: 'illustrious' as const,
      civitaiFileId: null,
      civitaiModelId: null,
      civitaiVersionId: null,
      displayName: 'Saved authoring fixture',
      fileSha256: 'a'.repeat(64),
      kind: 'checkpoint' as const,
      localModelId: randomUUID(),
      localVersionId: randomUUID(),
      predictionType: 'epsilon' as const,
      versionName: 'Exact authoring snapshot',
    }
    await service.setGenerationModel(created.id, model)
    const nativeModel = {
      ...model,
      baseModelFamily: 'anima' as const,
      fileSha256: 'b'.repeat(64),
      localModelId: randomUUID(),
      localVersionId: randomUUID(),
      predictionType: null,
    }
    await service.updateGenerationDraft(created.id, {
      kind: 'sampling-pair',
      sampler: 'Euler a',
      scheduler: 'Normal',
    })
    for (const value of ['euler', 'heun', 'dpmpp_2m', 'dpmpp_2m_sde', 'er_sde', 'lcm'] as const) {
      const selected = await service.updateGenerationDraft(created.id, {
        kind: 'anima-method',
        value,
      })
      assert.equal(selected.generationDraft.sampling.animaMethod, value)
      assert.equal(selected.generationDraft.sampling.sampler, 'Euler a')
      assert.equal(selected.generationDraft.sampling.scheduler, 'Normal')
      assert.deepEqual(selected.generationDraft.seed, baseline.seed)
      assert.deepEqual(selected.generationDraft.positivePrompt, baseline.positivePrompt)
      assert.deepEqual(
        await service.updateGenerationDraft(created.id, { kind: 'anima-method', value }),
        selected,
      )
    }
    const cleared = await service.updateGenerationDraft(created.id, {
      kind: 'anima-method',
      value: null,
    })
    assert.equal(Object.hasOwn(cleared.generationDraft.sampling, 'animaMethod'), false)
    assert.equal((await service.undo(created.id)).generationDraft.sampling.animaMethod, 'lcm')
    assert.equal(
      Object.hasOwn((await service.redo(created.id)).generationDraft.sampling, 'animaMethod'),
      false,
    )
    const selected = await service.updateGenerationDraft(created.id, {
      kind: 'anima-method',
      value: 'er_sde',
    })
    for (const next of [nativeModel, null, model]) {
      const switched = await service.setGenerationModel(created.id, next)
      assert.deepEqual(switched.generationDraft.sampling, selected.generationDraft.sampling)
    }
    const authoredAnima = await service.setGenerationModel(created.id, nativeModel)
    let targetCalls = 0
    await assert.rejects(
      service.prepareNormalGenerationContext(
        created.id,
        {
          composeTarget: async () => {
            targetCalls += 1
            throw new Error('Anima must refuse before composition')
          },
        },
        modelService,
      ),
      { code: 'GENERATION_MODEL_UNSUPPORTED' },
    )
    assert.equal(targetCalls, 0)
    for (const value of ['Euler', 'euler_a', 'turbo', 1, undefined]) {
      await assert.rejects(
        service.updateGenerationDraft(created.id, {
          kind: 'anima-method',
          value,
        } as unknown as ProjectGenerationDraftChange),
        { code: 'PROJECT_INVALID_INPUT' },
      )
      assert.deepEqual(service.getOpenTabs()[0].generationDraft, authoredAnima.generationDraft)
    }
    await service.flushAutosave(created.id)
    assert.deepEqual(await readFile(savedPath), original, 'shadow cannot rewrite the saved .igs')
    const restarted = new ProjectService({
      autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow,
    })
    assert.equal((await restarted.open(created.id)).kind, 'recovery-required')
    const recovered = await restarted.resolveRecovery(created.id, 'recover')
    assert.deepEqual(recovered.generationDraft, authoredAnima.generationDraft)
    assert.deepEqual(await readFile(savedPath), original)
    assert.equal((await restarted.save(created.id)).tab.dirty, false)
    assert.deepEqual(
      (await readIgsPackage(savedPath)).project.generationDraft,
      authoredAnima.generationDraft,
    )
    await restarted.close(created.id)
    const reopened = await restarted.open(created.id)
    assert.equal(reopened.kind, 'opened')
    if (reopened.kind !== 'opened') {
      throw new Error('Expected explicit Save reopen')
    }
    assert.deepEqual(reopened.tab.generationDraft, authoredAnima.generationDraft)
    const noOp = await restarted.updateGenerationDraft(created.id, {
      kind: 'anima-method',
      value: 'er_sde',
    })
    assert.equal(noOp.dirty, false)
    assert.equal(noOp.canUndo, false)
    const promptGroup = randomUUID()
    await restarted.updateGenerationDraft(
      created.id,
      { kind: 'positive-prompt', text: 'first grouped edit' },
      promptGroup,
    )
    await restarted.updateGenerationDraft(created.id, { kind: 'anima-method', value: 'er_sde' })
    await restarted.updateGenerationDraft(
      created.id,
      { kind: 'positive-prompt', text: 'second grouped edit' },
      promptGroup,
    )
    const undonePrompt = await restarted.undo(created.id)
    assert.equal(undonePrompt.generationDraft.positivePrompt.text, '')
    assert.equal(undonePrompt.canUndo, false, 'a native no-op must not seal a grouped prompt edit')
    assert.equal(undonePrompt.dirty, false)
    const clearedSaved = await restarted.updateGenerationDraft(created.id, {
      kind: 'anima-method',
      value: null,
    })
    assert.equal(Object.hasOwn(clearedSaved.generationDraft.sampling, 'animaMethod'), false)
    assert.equal(
      Object.hasOwn(
        (await restarted.updateGenerationDraft(created.id, { kind: 'anima-method', value: null }))
          .generationDraft.sampling,
        'animaMethod',
      ),
      false,
    )
    assert.equal(
      (await restarted.undo(created.id)).generationDraft.sampling.animaMethod,
      'er_sde',
      'clear no-op must not insert a history step',
    )
    await restarted.redo(created.id)
    await restarted.save(created.id)
    await restarted.close(created.id)
    const absent = await restarted.open(created.id)
    assert.equal(absent.kind, 'opened')
    if (absent.kind !== 'opened') {
      throw new Error('Expected cleared saved Project')
    }
    assert.equal(Object.hasOwn(absent.tab.generationDraft.sampling, 'animaMethod'), false)
    await restarted.close(created.id)
  })
})

const migrations = path.resolve('src/main/db/migrations')
const placeholdersDir = path.resolve('src/main/projects/placeholders')

async function publishExternalProjectVae(
  repository: ModelRepository,
  dataRoot: string,
  options: {
    bytes?: Buffer
    displayName?: string
    modelId?: number
    versionId?: number
  } = {},
) {
  const versionId = options.versionId ?? 7001
  const bytes = options.bytes ?? Buffer.from(`exact authoring VAE ${versionId}`)
  const managedPath = path.join(dataRoot, `external-vae-${versionId}.safetensors`)
  await writeFile(managedPath, bytes)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const ids = await repository.publishVerifiedInstallation({
    primary: {
      file: {
        managedPath,
        originalFilename: path.basename(managedPath),
        sha256,
        sizeBytes: bytes.length,
        verifiedAt: new Date().toISOString(),
      },
      resource: {
        displayName: options.displayName ?? 'External VAE',
        source: { kind: 'civitai', modelId: options.modelId ?? 7000 },
        sourceMetadata: { baseModel: 'SDXL 1.0' },
        type: 'vae',
      },
      version: {
        baseModelFamily: 'illustrious',
        format: 'SafeTensor',
        name: `${options.displayName ?? 'External VAE'} v${versionId}`,
        predictionType: null,
        source: {
          expectedSha256: sha256,
          fileId: versionId + 100,
          kind: 'civitai',
          versionId,
        },
        sourceMetadata: { baseModel: 'SDXL 1.0' },
      },
    },
  })
  return { ...ids, managedPath, sha256 }
}

test('external VAE selection preserves exact identity and unrelated settings through Undo, shadow recovery, Save and defaults', async () => {
  await withService(
    async ({ dataRoot, modelRepository, modelService, repository, service, shadow }) => {
      const installed = await publishExternalProjectVae(modelRepository, dataRoot)
      const newer = await publishExternalProjectVae(modelRepository, dataRoot, { versionId: 7002 })
      const ref = await modelService.resolveGenerationVae(installed.resourceId, installed.versionId)
      const created = await service.create({ height: 64, title: 'External VAE storage', width: 64 })
      const neighbor = await service.create({ height: 64, title: 'Neighbor VAE', width: 64 })
      const filePath = (await repository.getProject(created.id))!.canonicalPath
      await service.updateGenerationDraft(created.id, { kind: 'positive-prompt', text: 'portrait' })
      await service.updateGenerationDraft(created.id, { kind: 'seed', policy: 'fixed', value: 0 })
      const baseline = await service.updateGenerationDraft(created.id, {
        kind: 'vae-precision',
        value: 'FP32',
      })
      await service.save(created.id)
      const savedBytes = await readFile(filePath)
      const selected = await service.setGenerationVae(created.id, () =>
        modelService.resolveGenerationVae(installed.resourceId, installed.versionId),
      )
      assert.equal(selected.dirty, true)
      assert.deepEqual(selected.generationDraft, { ...baseline.generationDraft, vae: ref })
      assert.equal((await service.undo(created.id)).generationDraft.vae, null)
      assert.equal(service.getOpenTabs().find((tab) => tab.id === created.id)?.dirty, false)
      assert.deepEqual((await service.redo(created.id)).generationDraft.vae, ref)
      await service.flushAutosave(created.id)
      assert.deepEqual(await readFile(filePath), savedBytes)
      const recovery = await shadow.inspect({
        projectPath: filePath,
        savedPackage: await readIgsPackage(filePath),
      })
      assert.equal(recovery.status, 'recoverable')
      if (recovery.status !== 'recoverable') {
        throw new Error('External VAE selection did not reach real recovery storage.')
      }
      assert.deepEqual(recovery.document.generationDraft.vae, ref)
      const restarted = new ProjectService({
        autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
        dataRoot,
        repository,
        roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
        shadow,
      })
      assert.equal((await restarted.open(created.id)).kind, 'recovery-required')
      const recovered = await restarted.resolveRecovery(created.id, 'recover')
      assert.deepEqual(recovered.generationDraft, selected.generationDraft)
      await restarted.save(created.id)
      assert.deepEqual((await readIgsPackage(filePath)).project.generationDraft.vae, ref)
      await modelService.setDefaultVersion(newer.resourceId, newer.versionId)
      await restarted.close(created.id)
      const reopened = await restarted.open(created.id)
      assert.equal(reopened.kind, 'opened')
      if (reopened.kind !== 'opened') {
        throw new Error('Saved external VAE Project did not reopen.')
      }
      assert.deepEqual(reopened.tab.generationDraft.vae, ref)
      const verifiedNoop = await restarted.setGenerationVae(created.id, async () => ({
        ...(await modelService.resolveGenerationVae(installed.resourceId, installed.versionId)),
        displayName: 'Refreshed library display metadata',
        versionName: 'Refreshed library version metadata',
      }))
      assert.equal(verifiedNoop.dirty, false)
      assert.equal(verifiedNoop.canUndo, false)
      assert.deepEqual(verifiedNoop.generationDraft.vae, ref)
      const checkpoint = await publishPortableResource(
        modelRepository,
        dataRoot,
        Buffer.from('neighbor checkpoint'),
        'Neighbor checkpoint',
        'epsilon',
      )
      await restarted.setGenerationModel(
        created.id,
        await modelService.resolveGenerationCheckpoint(checkpoint.resourceId, checkpoint.versionId),
      )
      assert.deepEqual(restarted.getOpenTabs()[0].generationDraft.vae, ref)
      assert.deepEqual(
        (await restarted.setGenerationModel(created.id, null)).generationDraft.vae,
        ref,
      )
      const cleared = await restarted.setGenerationVae(created.id, null)
      assert.deepEqual(cleared.generationDraft, { ...baseline.generationDraft, vae: null })
      assert.deepEqual((await restarted.undo(created.id)).generationDraft.vae, ref)
      assert.equal((await restarted.redo(created.id)).generationDraft.vae, null)
      await restarted.save(created.id)
      await restarted.close(created.id)
      const clearedReopened = await restarted.open(created.id)
      assert.equal(clearedReopened.kind, 'opened')
      if (clearedReopened.kind === 'opened') {
        assert.equal(clearedReopened.tab.generationDraft.vae, null)
        const clearNoop = await restarted.setGenerationVae(created.id, null)
        assert.equal(clearNoop.dirty, false)
        assert.equal(clearNoop.canUndo, false)
        await restarted.close(created.id)
      }
      assert.equal(service.getOpenTabs().find((tab) => tab.id === neighbor.id)?.dirty, false)
    },
  )
})

test('external VAE selection refuses wrong kinds and families plus changed or missing managed bytes without rewriting the saved choice', async () => {
  await withService(async ({ dataRoot, modelRepository, modelService, repository, service }) => {
    const installed = await publishExternalProjectVae(modelRepository, dataRoot)
    const created = await service.create({ height: 64, title: 'VAE refusal', width: 64 })
    const filePath = (await repository.getProject(created.id))!.canonicalPath
    const ref = await modelService.resolveGenerationVae(installed.resourceId, installed.versionId)
    for (const invalid of [
      { ...ref, kind: 'checkpoint' as const },
      { ...ref, kind: 'lora' as const },
      { ...ref, baseModelFamily: 'anima' as const },
      { ...ref, baseModelFamily: null },
    ]) {
      await assert.rejects(
        service.setGenerationVae(created.id, async () => invalid),
        {
          code: 'PROJECT_INVALID_INPUT',
        },
      )
      assert.equal(service.getOpenTabs()[0].dirty, false)
      assert.equal(service.getOpenTabs()[0].canUndo, false)
      assert.equal(service.getOpenTabs()[0].generationDraft.vae, null)
    }
    await service.setGenerationVae(created.id, () =>
      modelService.resolveGenerationVae(installed.resourceId, installed.versionId),
    )
    await service.save(created.id)
    const savedBytes = await readFile(filePath)
    await writeFile(installed.managedPath, Buffer.from('tampered external VAE bytes'))
    await assert.rejects(
      service.setGenerationVae(created.id, () =>
        modelService.resolveGenerationVae(installed.resourceId, installed.versionId),
      ),
      { code: 'MODEL_FILE_CORRUPT' },
    )
    await assert.rejects(
      service.relinkGenerationVae(created.id, (saved) =>
        modelService.resolvePortableGenerationVae(saved),
      ),
      { code: 'MODEL_FILE_CORRUPT' },
    )
    assert.deepEqual(service.getOpenTabs()[0].generationDraft.vae, ref)
    assert.equal(service.getOpenTabs()[0].dirty, false)
    await service.close(created.id)
    await rm(installed.managedPath)
    const reopened = await service.open(created.id)
    assert.equal(reopened.kind, 'opened')
    if (reopened.kind !== 'opened') {
      throw new Error('Missing VAE must not prevent Project authoring.')
    }
    assert.deepEqual(reopened.tab.generationDraft.vae, ref)
    await assert.rejects(
      service.setGenerationVae(created.id, () =>
        modelService.resolveGenerationVae(installed.resourceId, installed.versionId),
      ),
      { code: 'MODEL_FILE_MISSING' },
    )
    await assert.rejects(
      service.relinkGenerationVae(created.id, (saved) =>
        modelService.resolvePortableGenerationVae(saved),
      ),
      { code: 'MODEL_FILE_MISSING' },
    )
    assert.deepEqual(await readFile(filePath), savedBytes)
    const clear = await service.setGenerationVae(created.id, null)
    assert.equal(clear.generationDraft.vae, null)
    assert.equal(clear.dirty, true)
    await service.save(created.id)
    await service.close(created.id)
  })
})

test('external VAE portable relink changes only local IDs through Undo, shadow, Save and reopen', async () => {
  const bytes = Buffer.from('same exact VAE in two managed installations')
  await withService(async (origin) => {
    const original = await publishExternalProjectVae(origin.modelRepository, origin.dataRoot, {
      bytes,
      displayName: 'Original VAE',
    })
    const ref = await origin.modelService.resolveGenerationVae(
      original.resourceId,
      original.versionId,
    )
    const created = await origin.service.create({ height: 64, title: 'Portable VAE', width: 64 })
    let resolvedWithoutSelection = false
    await assert.rejects(
      origin.service.relinkGenerationVae(created.id, async () => {
        resolvedWithoutSelection = true
        return ref
      }),
      { code: 'PROJECT_VAE_NOT_SELECTED' },
    )
    assert.equal(resolvedWithoutSelection, false)
    await origin.service.setGenerationVae(created.id, () =>
      origin.modelService.resolveGenerationVae(original.resourceId, original.versionId),
    )
    await origin.service.save(created.id)
    const originPath = (await origin.repository.getProject(created.id))!.canonicalPath
    const portableBytes = await readFile(originPath)
    await origin.service.close(created.id)
    await withService(async (destination) => {
      const local = await publishExternalProjectVae(
        destination.modelRepository,
        destination.dataRoot,
        {
          bytes,
          displayName: 'Different destination VAE',
        },
      )
      assert.notEqual(local.resourceId, original.resourceId)
      assert.notEqual(local.versionId, original.versionId)
      const incomingPath = path.join(destination.dataRoot, 'portable-vae.igs')
      await writeFile(incomingPath, portableBytes)
      const selection = await destination.service.selectImport(incomingPath)
      assert.equal(selection.kind, 'transfer-required')
      if (selection.kind !== 'transfer-required') {
        throw new Error('Expected a portable VAE import choice.')
      }
      const imported = await destination.service.finishImport(selection.importId, 'copy')
      assert.equal(imported.result.kind, 'opened')
      if (imported.result.kind !== 'opened') {
        throw new Error('Expected the copied VAE Project to open.')
      }
      const tabId = imported.result.tab.id
      const filePath = (await destination.repository.getProject(tabId))!.canonicalPath
      const savedBytes = await readFile(filePath)
      const resolved = await destination.modelService.resolvePortableGenerationVae(ref)
      for (const patch of [
        { kind: 'checkpoint' as const },
        { baseModelFamily: 'anima' as const },
        { civitaiModelId: ref.civitaiModelId! + 1 },
        { civitaiVersionId: ref.civitaiVersionId! + 1 },
        { civitaiFileId: ref.civitaiFileId! + 1 },
        { fileSha256: 'f'.repeat(64) },
      ]) {
        await assert.rejects(
          destination.service.relinkGenerationVae(tabId, async () => ({ ...resolved, ...patch })),
          { code: 'PROJECT_VAE_RELINK_MISMATCH' },
        )
        assert.deepEqual(destination.service.getOpenTabs()[0].generationDraft.vae, ref)
        assert.equal(destination.service.getOpenTabs()[0].dirty, false)
      }
      const linked = await destination.service.relinkGenerationVae(tabId, async (saved) => {
        saved.displayName = 'Mutated resolver copy'
        return {
          ...(await destination.modelService.resolvePortableGenerationVae(saved)),
          displayName: 'New destination metadata',
          predictionType: 'v_prediction',
          versionName: 'New destination version',
        }
      })
      const expected = { ...ref, localModelId: local.resourceId, localVersionId: local.versionId }
      assert.deepEqual(linked.generationDraft.vae, expected)
      assert.equal(linked.dirty, true)
      assert.deepEqual((await destination.service.undo(tabId)).generationDraft.vae, ref)
      assert.deepEqual((await destination.service.redo(tabId)).generationDraft.vae, expected)
      await destination.service.flushAutosave(tabId)
      assert.deepEqual(await readFile(filePath), savedBytes)
      const recovery = await destination.shadow.inspect({
        projectPath: filePath,
        savedPackage: await readIgsPackage(filePath),
      })
      assert.equal(recovery.status, 'recoverable')
      if (recovery.status === 'recoverable') {
        assert.deepEqual(recovery.document.generationDraft.vae, expected)
      }
      await destination.service.save(tabId)
      assert.deepEqual((await readIgsPackage(filePath)).project.generationDraft.vae, expected)
      await destination.service.close(tabId)
      const reopened = await destination.service.open(tabId)
      assert.equal(reopened.kind, 'opened')
      if (reopened.kind !== 'opened') {
        throw new Error('Linked VAE Project did not reopen.')
      }
      assert.deepEqual(reopened.tab.generationDraft.vae, expected)
      const noop = await destination.service.relinkGenerationVae(tabId, (saved) =>
        destination.modelService.resolvePortableGenerationVae(saved),
      )
      assert.equal(noop.dirty, false)
      assert.equal(noop.canUndo, false)
      await destination.service.close(tabId)
    })
  })
})

test('external VAE authoring preserves unsupported saved families but refuses relink before resolving them', async () => {
  for (const invalid of [{ baseModelFamily: 'anima' as const }, { baseModelFamily: null }]) {
    await withService(async ({ dataRoot, modelRepository, modelService, repository, service }) => {
      const installed = await publishExternalProjectVae(modelRepository, dataRoot)
      const ref = await modelService.resolveGenerationVae(installed.resourceId, installed.versionId)
      const savedRef = { ...ref, ...invalid }
      const document = createEmptyProjectDocumentV1({ title: 'Unsupported saved VAE' })
      document.generationDraft.vae = savedRef
      const incomingPath = path.join(dataRoot, 'unsupported-vae.igs')
      const placeholders = await readProjectPlaceholders(placeholdersDir, 'empty')
      await saveIgsPackage(incomingPath, {
        assets: {},
        preview: { ...placeholders, rect: null, status: 'empty' },
        project: document,
      })
      const selection = await service.selectImport(incomingPath)
      assert.equal(selection.kind, 'transfer-required')
      if (selection.kind !== 'transfer-required') {
        throw new Error('Expected a saved unsupported VAE import choice.')
      }
      const imported = await service.finishImport(selection.importId, 'copy')
      assert.equal(imported.result.kind, 'opened')
      if (imported.result.kind !== 'opened') {
        throw new Error('Unsupported VAE must not prevent opening a Project.')
      }
      const tabId = imported.result.tab.id
      assert.deepEqual(imported.result.tab.generationDraft.vae, savedRef)
      let resolverCalled = false
      await assert.rejects(
        service.relinkGenerationVae(tabId, async () => {
          resolverCalled = true
          return ref
        }),
        { code: 'PROJECT_INVALID_INPUT' },
      )
      assert.equal(resolverCalled, false)
      assert.equal(service.getOpenTabs()[0].dirty, false)
      assert.deepEqual(service.getOpenTabs()[0].generationDraft.vae, savedRef)
      assert.equal((await service.setGenerationVae(tabId, null)).generationDraft.vae, null)
      await service.save(tabId)
      const filePath = (await repository.getProject(tabId))!.canonicalPath
      assert.equal((await readIgsPackage(filePath)).project.generationDraft.vae, null)
      await service.close(tabId)
    })
  }
})

for (const operation of ['select', 'relink'] as const) {
  for (const change of ['edit', 'undo', 'close-reopen', 'newer-selection'] as const) {
    test(`external VAE ${operation} rejects a late verified response after ${change}`, async () => {
      await withService(
        async ({ dataRoot, modelRepository, modelService, repository, service }) => {
          const installed = await publishExternalProjectVae(modelRepository, dataRoot)
          const ref = await modelService.resolveGenerationVae(
            installed.resourceId,
            installed.versionId,
          )
          const created = await service.create({ height: 64, title: 'Late VAE', width: 64 })
          if (operation === 'relink' || change === 'edit' || change === 'close-reopen') {
            await service.setGenerationVae(created.id, () =>
              modelService.resolveGenerationVae(installed.resourceId, installed.versionId),
            )
            await service.save(created.id)
          }
          const filePath = (await repository.getProject(created.id))!.canonicalPath
          const savedBytes = await readFile(filePath)
          let release!: () => void
          let signalStarted!: () => void
          const gate = new Promise<void>((resolve) => {
            release = resolve
          })
          const started = new Promise<void>((resolve) => {
            signalStarted = resolve
          })
          const verify = async () => {
            signalStarted()
            await gate
            return modelService.resolveGenerationVae(installed.resourceId, installed.versionId)
          }
          const pending =
            operation === 'select'
              ? service.setGenerationVae(created.id, verify)
              : service.relinkGenerationVae(created.id, verify)
          await started
          if (change === 'edit' || change === 'undo') {
            await service.updateGenerationDraft(created.id, {
              kind: 'positive-prompt',
              text: 'newer edit',
            })
            if (change === 'undo') {
              await service.undo(created.id)
            }
          } else if (change === 'close-reopen') {
            await service.close(created.id)
            assert.equal((await service.open(created.id)).kind, 'opened')
          } else {
            const newer = await publishExternalProjectVae(modelRepository, dataRoot, {
              modelId: 7100,
              versionId: 7101,
            })
            await service.setGenerationVae(created.id, () =>
              modelService.resolveGenerationVae(newer.resourceId, newer.versionId),
            )
          }
          const newerTab = structuredClone(service.getOpenTabs()[0])
          release()
          await assert.rejects(pending, { code: 'EDIT_CONFLICT' })
          assert.deepEqual(service.getOpenTabs()[0], newerTab)
          assert.deepEqual(await readFile(filePath), savedBytes)
          if (change === 'edit') {
            assert.deepEqual(service.getOpenTabs()[0].generationDraft.vae, ref)
            assert.equal(service.getOpenTabs()[0].generationDraft.positivePrompt.text, 'newer edit')
          }
          await service.save(created.id)
          await service.close(created.id)
        },
      )
    })
  }
}

test('VAE Precision typed edits preserve explicit policy through real shadow recovery, Undo, Save and reopen', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const created = await service.create({ height: 64, title: 'VAE precision storage', width: 64 })
    const neighbor = await service.create({ height: 64, title: 'Neighbor', width: 64 })
    const filePath = (await repository.getProject(created.id))!.canonicalPath
    assert.equal('vaePrecision' in created.generationDraft, false)
    const unchanged = await service.updateGenerationDraft(created.id, {
      kind: 'vae-precision',
      value: null,
    })
    assert.equal(unchanged.dirty, false)
    assert.equal(unchanged.canUndo, false)
    for (const value of ['Auto', 'FP16', 'FP32'] as const) {
      const edited = await service.updateGenerationDraft(created.id, {
        kind: 'vae-precision',
        value,
      })
      assert.equal(edited.generationDraft.vaePrecision, value)
      await service.save(created.id)
      assert.equal((await readIgsPackage(filePath)).project.generationDraft.vaePrecision, value)
    }
    const saved = await readFile(filePath)
    await service.updateGenerationDraft(created.id, { kind: 'vae-precision', value: 'FP16' })
    await service.flushAutosave(created.id)
    assert.deepEqual(await readFile(filePath), saved)
    const restarted = new ProjectService({
      autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow,
    })
    assert.equal((await restarted.open(created.id)).kind, 'recovery-required')
    const recovered = await restarted.resolveRecovery(created.id, 'recover')
    assert.equal(recovered.generationDraft.vaePrecision, 'FP16')
    const reset = await restarted.updateGenerationDraft(created.id, {
      kind: 'vae-precision',
      value: null,
    })
    assert.equal('vaePrecision' in reset.generationDraft, false)
    assert.equal((await restarted.undo(created.id)).generationDraft.vaePrecision, 'FP16')
    assert.equal('vaePrecision' in (await restarted.redo(created.id)).generationDraft, false)
    await restarted.save(created.id)
    assert.equal('vaePrecision' in (await readIgsPackage(filePath)).project.generationDraft, false)
    await restarted.close(created.id)
    const reopened = await restarted.open(created.id)
    assert.equal(reopened.kind, 'opened')
    if (reopened.kind !== 'opened') {
      throw new Error('Saved VAE precision Project did not reopen')
    }
    assert.equal('vaePrecision' in reopened.tab.generationDraft, false)
    assert.equal(service.getOpenTabs().find((tab) => tab.id === neighbor.id)?.dirty, false)
    await restarted.close(created.id)
  })
})

test('VAE Precision typed IPC refuses unknown policies without changing document, history or saved bytes', async () => {
  await withService(async ({ repository, service }) => {
    const created = await service.create({ height: 64, title: 'VAE precision guard', width: 64 })
    const filePath = (await repository.getProject(created.id))!.canonicalPath
    const saved = await readFile(filePath)
    for (const value of ['auto', 'fp16', 'BF16', '', undefined, false, 16, NaN, {}]) {
      const invalid = { kind: 'vae-precision', value }
      assert.equal(isProjectGenerationDraftChange(invalid), false)
      await assert.rejects(service.updateGenerationDraft(created.id, invalid as never), {
        code: 'PROJECT_INVALID_INPUT',
      })
    }
    const extra = { extra: true, kind: 'vae-precision', value: 'FP32' }
    assert.equal(isProjectGenerationDraftChange(extra), false)
    await assert.rejects(service.updateGenerationDraft(created.id, extra as never), {
      code: 'PROJECT_INVALID_INPUT',
    })
    const current = service.getOpenTabs().find((tab) => tab.id === created.id)!
    assert.equal(current.dirty, false)
    assert.equal(current.canUndo, false)
    assert.equal('vaePrecision' in current.generationDraft, false)
    assert.deepEqual(await readFile(filePath), saved)
  })
})

test('VAE Precision optimistic draft serializes manual edits and reset through real service before Save', async () => {
  await withService(async ({ repository, service }) => {
    let acknowledged = await service.create({ height: 64, title: 'VAE precision sync', width: 64 })
    const filePath = (await repository.getProject(acknowledged.id))!.canonicalPath
    const overlays: (typeof acknowledged.generationDraft | null)[] = []
    const sent: ProjectGenerationDraftChange[] = []
    let release: (() => void) | undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const sync = new ProjectDraftSync({
      onAcknowledged: (tab) => {
        acknowledged = tab
      },
      onError: () => assert.fail('Unexpected precision draft error'),
      onOverlay: (_id, draft) => overlays.push(draft),
      send: async (id, change) => {
        sent.push(change)
        if (sent.length === 1) {
          await held
        }
        return service.updateGenerationDraft(id, change)
      },
    })
    sync.change(acknowledged, { kind: 'vae-precision', value: 'FP16' })
    sync.change(acknowledged, { kind: 'vae-precision', value: 'FP32' })
    assert.equal(overlays.at(-1)?.vaePrecision, 'FP32')
    const flushed = sync.flush(acknowledged.id)
    release?.()
    await flushed
    await service.save(acknowledged.id)
    assert.equal((await readIgsPackage(filePath)).project.generationDraft.vaePrecision, 'FP32')
    sync.change(acknowledged, { kind: 'vae-precision', value: null })
    assert.equal('vaePrecision' in overlays.at(-1)!, false)
    await sync.flush(acknowledged.id)
    await service.save(acknowledged.id)
    assert.equal('vaePrecision' in (await readIgsPackage(filePath)).project.generationDraft, false)
    assert.deepEqual(sent, [
      { kind: 'vae-precision', value: 'FP16' },
      { kind: 'vae-precision', value: 'FP32' },
      { kind: 'vae-precision', value: null },
    ])
  })
})

test('standalone target reports unavailable CPU pixels without requiring a result layer or mutating the document', async () => {
  await withService(async ({ service }) => {
    const tab = await service.create({ height: 64, title: 'Standalone target', width: 64 })
    const key = await hashGenerationTargetSignature(generationTargetSignature(tab)!)
    const result = await service.getGenerationTargetState(tab.id, tab.documentId, key)
    assert.equal(result.mode, null)
    assert.match(result.unavailableReason!, /unavailable/)
    assert.deepEqual(service.getOpenTabs()[0], tab)
  })
})

test('Denoising Strength typed edits, explicit zero and unset survive real recovery, Undo and Save', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const tab = await service.create({ height: 64, title: 'Denoising storage', width: 64 })
    const neighbor = await service.create({ height: 64, title: 'Neighbor', width: 64 })
    const filePath = (await repository.getProject(tab.id))!.canonicalPath
    const savedBytes = await readFile(filePath)
    assert.equal(tab.generationDraft.sampling.denoisingStrength, null)
    const unchanged = await service.updateGenerationDraft(tab.id, {
      kind: 'denoising-strength',
      value: null,
    })
    assert.equal(unchanged.dirty, false)
    assert.equal(unchanged.canUndo, false)
    for (const value of [-0.01, 1.001, NaN, Infinity, undefined, '0']) {
      const invalid = { kind: 'denoising-strength', value }
      assert.equal(isProjectGenerationDraftChange(invalid), false)
      await assert.rejects(service.updateGenerationDraft(tab.id, invalid as never), {
        code: 'PROJECT_INVALID_INPUT',
      })
    }
    assert.equal(
      isProjectGenerationDraftChange({ extra: true, kind: 'denoising-strength', value: 0 }),
      false,
    )
    assert.equal(service.getOpenTabs().find((item) => item.id === tab.id)!.canUndo, false)
    await service.updateGenerationDraft(tab.id, { kind: 'denoising-strength', value: 0.75 })
    const zero = await service.updateGenerationDraft(tab.id, {
      kind: 'denoising-strength',
      value: 0,
    })
    assert.equal(zero.generationDraft.sampling.denoisingStrength, 0)
    await service.flushAutosave(tab.id)
    assert.deepEqual(await readFile(filePath), savedBytes)
    const restarted = new ProjectService({
      autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow,
    })
    assert.equal((await restarted.open(tab.id)).kind, 'recovery-required')
    const recovered = await restarted.resolveRecovery(tab.id, 'recover')
    assert.equal(recovered.generationDraft.sampling.denoisingStrength, 0)
    await restarted.updateGenerationDraft(tab.id, { kind: 'denoising-strength', value: 1 })
    assert.equal((await restarted.undo(tab.id)).generationDraft.sampling.denoisingStrength, 0)
    assert.equal((await restarted.redo(tab.id)).generationDraft.sampling.denoisingStrength, 1)
    await restarted.save(tab.id)
    assert.equal(
      (await readIgsPackage(filePath)).project.generationDraft.sampling.denoisingStrength,
      1,
    )
    await restarted.close(tab.id)
    const opened = await restarted.open(tab.id)
    assert.equal(opened.kind, 'opened')
    if (opened.kind !== 'opened') {
      throw new Error('Saved denoising draft did not reopen')
    }
    assert.equal(opened.tab.generationDraft.sampling.denoisingStrength, 1)
    await restarted.updateGenerationDraft(tab.id, { kind: 'denoising-strength', value: null })
    await restarted.save(tab.id)
    assert.equal(
      (await readIgsPackage(filePath)).project.generationDraft.sampling.denoisingStrength,
      null,
    )
    assert.equal(service.getOpenTabs().find((item) => item.id === neighbor.id)?.dirty, false)
    await restarted.close(tab.id)
  })
})

test('optimistic denoising draft reaches real Save in order including zero and unset', async () => {
  await withService(async ({ repository, service }) => {
    let tab = await service.create({ height: 64, title: 'Denoising sync', width: 64 })
    const overlays: (typeof tab.generationDraft | null)[] = []
    const changes: ProjectGenerationDraftChange[] = []
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const sync = new ProjectDraftSync({
      onAcknowledged: (ack) => {
        tab = ack
      },
      onError: () => assert.fail('Unexpected draft error'),
      onOverlay: (_id, draft) => overlays.push(draft),
      send: async (id, change) => {
        changes.push(change)
        if (changes.length === 1) {
          await held
        }
        return service.updateGenerationDraft(id, change)
      },
    })
    sync.change(tab, { kind: 'denoising-strength', value: 0.75 })
    sync.change(tab, { kind: 'denoising-strength', value: 0 })
    assert.equal(overlays.at(-1)?.sampling.denoisingStrength, 0)
    release()
    await sync.flush(tab.id)
    await service.save(tab.id)
    const filePath = (await repository.getProject(tab.id))!.canonicalPath
    assert.equal(
      (await readIgsPackage(filePath)).project.generationDraft.sampling.denoisingStrength,
      0,
    )
    sync.change(tab, { kind: 'denoising-strength', value: null })
    assert.equal(overlays.at(-1)?.sampling.denoisingStrength, null)
    await sync.flush(tab.id)
    await service.save(tab.id)
    assert.equal(
      (await readIgsPackage(filePath)).project.generationDraft.sampling.denoisingStrength,
      null,
    )
    assert.deepEqual(changes, [
      { kind: 'denoising-strength', value: 0.75 },
      { kind: 'denoising-strength', value: 0 },
      { kind: 'denoising-strength', value: null },
    ])
  })
})

test('CFG Rescale draft zero, upper bound and unset survive real shadow recovery and explicit Save', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const created = await service.create({ height: 64, title: 'CFG Rescale storage', width: 64 })
    const filePath = (await repository.listProjects())[0].canonicalPath
    const zero = await service.updateGenerationDraft(created.id, { kind: 'cfg-rescale', value: 0 })
    assert.equal(zero.generationDraft.cfgRescale, 0)
    assert.equal(zero.dirty, true)
    await service.save(created.id)
    assert.equal((await readIgsPackage(filePath)).project.generationDraft.cfgRescale, 0)
    const savedZero = await readFile(filePath)
    await service.updateGenerationDraft(created.id, { kind: 'cfg-rescale', value: 0.99 })
    await service.flushAutosave(created.id)
    assert.deepEqual(await readFile(filePath), savedZero)
    const restarted = new ProjectService({
      autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow,
    })
    assert.equal((await restarted.open(created.id)).kind, 'recovery-required')
    const recovered = await restarted.resolveRecovery(created.id, 'recover')
    assert.equal(recovered.generationDraft.cfgRescale, 0.99)
    await restarted.save(created.id)
    await restarted.close(created.id)
    const reopened = await restarted.open(created.id)
    assert.equal(reopened.kind, 'opened')
    if (reopened.kind !== 'opened') {
      throw new Error('Saved CFG Rescale Project did not reopen')
    }
    assert.equal(reopened.tab.generationDraft.cfgRescale, 0.99)
    const cleared = await restarted.updateGenerationDraft(created.id, {
      kind: 'cfg-rescale',
      value: null,
    })
    assert.equal('cfgRescale' in cleared.generationDraft, false)
    assert.equal((await restarted.undo(created.id)).generationDraft.cfgRescale, 0.99)
    assert.equal('cfgRescale' in (await restarted.redo(created.id)).generationDraft, false)
    await restarted.save(created.id)
    assert.equal('cfgRescale' in (await readIgsPackage(filePath)).project.generationDraft, false)
    await restarted.close(created.id)
  })
})

test('CFG Rescale typed IPC refuses invalid values without changing real document, history or saved bytes', async () => {
  await withService(async ({ repository, service }) => {
    const created = await service.create({ height: 64, title: 'CFG Rescale guard', width: 64 })
    const savedPath = (await repository.listProjects())[0].canonicalPath
    const before = await readFile(savedPath)
    const neighbor = await service.create({ height: 64, title: 'Neighbor', width: 64 })
    for (const value of [-0.01, 0.990_01, 1, NaN, Infinity, '0', undefined]) {
      const invalid = { kind: 'cfg-rescale', value }
      assert.equal(isProjectGenerationDraftChange(invalid), false)
      await assert.rejects(service.updateGenerationDraft(created.id, invalid as never), {
        code: 'PROJECT_INVALID_INPUT',
      })
    }
    assert.equal(
      isProjectGenerationDraftChange({ foreign: true, kind: 'cfg-rescale', value: 0 }),
      false,
    )
    assert.equal(isProjectGenerationDraftChange({ kind: 'cfg-rescale', value: null }), true)
    assert.equal(isProjectGenerationDraftChange({ kind: 'cfg-rescale', value: 0.99 }), true)
    const current = service.getOpenTabs().find((tab) => tab.id === created.id)!
    assert.equal(current.dirty, false)
    assert.equal(current.canUndo, false)
    assert.equal('cfgRescale' in current.generationDraft, false)
    assert.equal(service.getOpenTabs().find((tab) => tab.id === neighbor.id)?.dirty, false)
    assert.deepEqual(await readFile(savedPath), before)
    const noOp = await service.updateGenerationDraft(created.id, {
      kind: 'cfg-rescale',
      value: null,
    })
    assert.equal(noOp.dirty, false)
    assert.equal(noOp.canUndo, false)
  })
})

test('CFG Rescale optimistic draft serializes through the real service before Save, including explicit zero and unset', async () => {
  await withService(async ({ repository, service }) => {
    let acknowledged = await service.create({ height: 64, title: 'CFG Rescale sync', width: 64 })
    const neighbor = await service.create({ height: 64, title: 'Neighbor', width: 64 })
    const filePath = (await repository.listProjects()).find(
      (record) => record.localProjectKey === acknowledged.id,
    )!.canonicalPath
    const overlays: (typeof acknowledged.generationDraft | null)[] = []
    const sent: ProjectGenerationDraftChange[] = []
    let releaseFirst: (() => void) | undefined
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const sync = new ProjectDraftSync({
      onAcknowledged: (tab) => {
        acknowledged = tab
      },
      onError: () => assert.fail('Unexpected draft error'),
      onOverlay: (_id, draft) => overlays.push(draft),
      send: async (id, change) => {
        sent.push(change)
        if (sent.length === 1) {
          await first
        }
        return service.updateGenerationDraft(id, change)
      },
    })
    sync.change(acknowledged, { kind: 'cfg-rescale', value: 0.7 })
    sync.change(acknowledged, { kind: 'cfg-rescale', value: 0 })
    assert.equal(overlays.at(-1)?.cfgRescale, 0)
    const flush = sync.flush(acknowledged.id)
    releaseFirst?.()
    await flush
    await service.save(acknowledged.id)
    assert.equal((await readIgsPackage(filePath)).project.generationDraft.cfgRescale, 0)
    sync.change(acknowledged, { kind: 'cfg-rescale', value: null })
    assert.equal('cfgRescale' in overlays.at(-1)!, false)
    await sync.flush(acknowledged.id)
    await service.save(acknowledged.id)
    assert.equal('cfgRescale' in (await readIgsPackage(filePath)).project.generationDraft, false)
    assert.deepEqual(sent, [
      { kind: 'cfg-rescale', value: 0.7 },
      { kind: 'cfg-rescale', value: 0 },
      { kind: 'cfg-rescale', value: null },
    ])
    assert.equal(service.getOpenTabs().find((tab) => tab.id === neighbor.id)?.dirty, false)
  })
})
const devPython = path.resolve('worker-python/.venv/bin/python')
const rasterPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGO06bnDwMDAxMDAwMDAAAATOgGonVuaBAAAAABJRU5ErkJggg==',
  'base64',
)
const previewWebp = Buffer.from(
  'UklGRjoAAABXRUJQVlA4IC4AAADwAQCdASoCAAIAAUAmJaACdLoB+AAETAAA/q4X/0mzxNnibPkkf/OwbEu14AAA',
  'base64',
)

function devRuntimeRoot(): string | null {
  if (!existsSync(devPython)) {
    return null
  }
  const executableParts = realpathSync(devPython).split(path.sep)
  const requestedParts = devPython.split(path.sep)
  let common = 0
  while (
    common < executableParts.length &&
    common < requestedParts.length &&
    executableParts[common] === requestedParts[common]
  ) {
    common++
  }
  const root = requestedParts.slice(0, common).join(path.sep) || path.sep
  return root === path.sep ? null : root
}

function rasterImportWorker(): Pick<ProjectWorkerClient, 'normalizeImport'> {
  return {
    normalizeImport: async ({ normalizedPngPath }) => {
      await writeFile(normalizedPngPath, rasterPng)
      return {
        normalized: {
          byteSize: rasterPng.length,
          colorSpace: 'srgb',
          height: 2,
          iccSha256: '113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1',
          path: normalizedPngPath,
          sha256: createHash('sha256').update(rasterPng).digest('hex'),
          width: 2,
        },
        originalIcc: null,
        sourceFormat: 'PNG',
      }
    },
  }
}

/** Write actual worker output files so the service must ingest them through the production path. */
function previewWorker(
  afterInput?: () => Promise<void>,
): Pick<ProjectWorkerClient, 'composePreview'> {
  return {
    composePreview: async ({ layers, mergedPngPath, thumbnailWebpPath }) => {
      assert.equal(layers.length, 2)
      for (const layer of layers) {
        assert.deepEqual(await readFile(layer.path), rasterPng)
      }
      await afterInput?.()
      await Promise.all([
        writeFile(mergedPngPath, rasterPng),
        writeFile(thumbnailWebpPath, previewWebp),
      ])
      return {
        merged: {
          byteSize: rasterPng.length,
          colorSpace: 'srgb',
          height: 2,
          iccSha256: '113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1',
          path: mergedPngPath,
          sha256: createHash('sha256').update(rasterPng).digest('hex'),
          width: 2,
        },
        rect: { height: 2, width: 2, x: 0, y: 0 },
        status: 'rendered',
        thumbnail: {
          byteSize: previewWebp.length,
          colorSpace: 'srgb',
          height: 2,
          iccSha256: '113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1',
          path: thumbnailWebpPath,
          sha256: createHash('sha256').update(previewWebp).digest('hex'),
          width: 2,
        },
      }
    },
  }
}

/** Seed a real portable .igs, then enter the Project service through its public import flow. */
async function openTwoLayerProject(
  dataRoot: string,
  repository: ProjectIndexRepository,
  service: ProjectService,
): Promise<{ filePath: string; layerIds: [string, string]; tabId: string }> {
  const externalPath = path.join(dataRoot, 'Raster fixture.igs')
  const layerIds: [string, string] = [randomUUID(), randomUUID()]
  const sha256 = createHash('sha256').update(rasterPng).digest('hex')
  const assetPaths = layerIds.map((id) => `assets/layers/${id}.png`)
  const project = createEmptyProjectDocumentV1({ title: 'Raster editing' })
  const placeholders = await readProjectPlaceholders(placeholdersDir, 'unavailable')
  await saveIgsPackage(externalPath, {
    assets: Object.fromEntries(assetPaths.map((assetPath) => [assetPath, { bytes: rasterPng }])),
    preview: {
      ...placeholders,
      rect: { height: 2, width: 6, x: 0, y: 0 },
      status: 'unavailable',
    },
    project: {
      ...project,
      layers: layerIds.map((id, index) => ({
        asset: { bytes: rasterPng.length, height: 2, path: assetPaths[index], sha256, width: 2 },
        blendMode: 'normal' as const,
        id,
        kind: 'raster' as const,
        locked: false,
        name: index === 0 ? 'Top' : 'Bottom',
        opacity: 1,
        transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: index * 4, y: 0 },
        visible: true,
      })),
    },
  })
  const selected = await service.selectImport(externalPath)
  assert.equal(selected.kind, 'transfer-required')
  if (selected.kind !== 'transfer-required') {
    throw new Error('Fixture import did not request a transfer.')
  }
  const imported = await service.finishImport(selected.importId, 'copy')
  assert.equal(imported.result.kind, 'opened')
  if (imported.result.kind !== 'opened') {
    throw new Error('Fixture import did not open the Project.')
  }
  const indexed = await repository.listProjects()
  assert.equal(indexed.length, 1)
  return { filePath: indexed[0].canonicalPath, layerIds, tabId: imported.result.tab.id }
}

async function withService(
  run: (context: {
    database: AppDatabase
    dataRoot: string
    modelRepository: ModelRepository
    modelService: ModelService
    repository: ProjectIndexRepository
    service: ProjectService
    shadow: ProjectShadowStore
  }) => Promise<void>,
  autosaveOptions: Pick<ProjectAutosaveOptions, 'beforeEditCommit'> = {},
  readLastActualSeed?: (localProjectKey: string, documentId: string) => Promise<number | null>,
): Promise<void> {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'igs-service-'))
  const database = openAppDatabase(dataRoot, migrations)
  const modelRepository = new ModelRepository(database.db)
  const modelService = new ModelService(
    modelRepository,
    new CivitaiClient(),
    new CivitaiTokenStore(
      {
        decryptStringAsync: async () => ({ result: '', shouldReEncrypt: false }),
        encryptStringAsync: async () => Buffer.alloc(0),
        getSelectedStorageBackend: () => 'gnome_libsecret',
        isAsyncEncryptionAvailable: async () => true,
      },
      dataRoot,
    ),
  )
  const repository = new ProjectIndexRepository(database.db)
  const shadow = new ProjectShadowStore(path.join(dataRoot, 'autosave'))
  const service = new ProjectService({
    autosaveOptions: {
      ...autosaveOptions,
      debounceMs: 0,
      leaseRegistry: new ProjectAutosaveLeaseRegistry(),
    },
    dataRoot,
    readLastActualSeed,
    repository,
    roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
    shadow,
  })
  try {
    await run({ database, dataRoot, modelRepository, modelService, repository, service, shadow })
  } finally {
    await database.close()
    await rm(dataRoot, { force: true, recursive: true })
  }
}

async function openLegacyDynamicDraft(dataRoot: string, service: ProjectService) {
  const document = createEmptyProjectDocumentV1({ title: 'Legacy dynamic draft' })
  delete document.generationDraft.dynamicPrompt
  const source = path.join(dataRoot, 'legacy-dynamic-draft.igs')
  const placeholders = await readProjectPlaceholders(placeholdersDir, 'empty')
  await saveIgsPackage(source, {
    assets: {},
    preview: { ...placeholders, rect: null, status: 'empty' },
    project: document,
  })
  const selection = await service.selectImport(source)
  assert.equal(selection.kind, 'transfer-required')
  if (selection.kind !== 'transfer-required') {
    throw new Error('Expected legacy Project import choice.')
  }
  const imported = await service.finishImport(selection.importId, 'copy')
  assert.equal(imported.result.kind, 'opened')
  if (imported.result.kind !== 'opened') {
    throw new Error('Expected legacy Project to open.')
  }
  return imported.result.tab
}

test('dynamic draft legacy defaults are clean no-ops and real edits survive Undo, Save and reopen', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const created = await openLegacyDynamicDraft(dataRoot, service)
    const savedPath = (await repository.listProjects())[0].canonicalPath
    const beforeBytes = await readFile(savedPath)
    const beforeDocument = structuredClone(
      service.getOpenDocumentForAcceptance(created.id)!.document,
    )
    assert.equal(Object.hasOwn(created.generationDraft, 'dynamicPrompt'), false)
    const noop = await service.updateGenerationDraft(created.id, {
      kind: 'dynamic-prompt',
      value: { maxPrompts: 100, seedBehavior: 'per-iteration' },
    })
    assert.deepEqual(noop, created)
    assert.deepEqual(service.getOpenDocumentForAcceptance(created.id)!.document, beforeDocument)
    await service.flushAutosave(created.id)
    assert.deepEqual(await readFile(savedPath), beforeBytes)

    const settings = { maxPrompts: 17, seedBehavior: 'per-prompt' as const }
    const edited = await service.updateGenerationDraft(created.id, {
      kind: 'dynamic-prompt',
      value: settings,
    })
    assert.equal(edited.dirty, true)
    assert.deepEqual(edited.generationDraft.dynamicPrompt, settings)
    assert.notEqual(
      service.getOpenDocumentForAcceptance(created.id)!.document.documentRevision,
      beforeDocument.documentRevision,
    )
    const undone = await service.undo(created.id)
    assert.equal(undone.dirty, false)
    assert.equal(Object.hasOwn(undone.generationDraft, 'dynamicPrompt'), false)
    assert.equal(undone.canUndo, false)
    const redone = await service.redo(created.id)
    assert.deepEqual(redone.generationDraft.dynamicPrompt, settings)
    assert.deepEqual(redone.generationDraft.positivePrompt, created.generationDraft.positivePrompt)
    assert.deepEqual(redone.generationDraft.seed, created.generationDraft.seed)
    assert.deepEqual(redone.generationDraft.sampling, created.generationDraft.sampling)
    await service.flushAutosave(created.id)
    assert.deepEqual(await readFile(savedPath), beforeBytes)
    const saved = await service.save(created.id)
    assert.equal(saved.tab.dirty, false)
    assert.deepEqual(
      (await readIgsPackage(savedPath)).project.generationDraft.dynamicPrompt,
      settings,
    )
    await service.close(created.id)
    const reopened = await service.open(created.id)
    assert.equal(reopened.kind, 'opened')
    if (reopened.kind !== 'opened') {
      throw new Error('Saved dynamic settings did not reopen.')
    }
    assert.deepEqual(reopened.tab.generationDraft.dynamicPrompt, settings)
    const secondNoop = await service.updateGenerationDraft(created.id, {
      kind: 'dynamic-prompt',
      value: { ...settings },
    })
    assert.deepEqual(secondNoop, reopened.tab)
    await service.close(created.id)
  })
})

test('dynamic draft guards reject forged nested IPC settings before dirty/history/storage changes', async () => {
  await withService(async ({ repository, service }) => {
    const created = await service.create({ height: 64, title: 'Dynamic guards', width: 64 })
    const savedPath = (await repository.listProjects())[0].canonicalPath
    const before = structuredClone(service.getOpenDocumentForAcceptance(created.id)!.document)
    const bytes = await readFile(savedPath)
    for (const value of [
      null,
      {},
      { maxPrompts: 0, seedBehavior: 'per-iteration' },
      { maxPrompts: 101, seedBehavior: 'per-iteration' },
      { maxPrompts: 1.5, seedBehavior: 'per-iteration' },
      { maxPrompts: NaN, seedBehavior: 'per-iteration' },
      { maxPrompts: 10, seedBehavior: 'unknown' },
      { baseSeed: 0, maxPrompts: 10, seedBehavior: 'per-prompt' },
    ]) {
      const change = { kind: 'dynamic-prompt', value }
      assert.equal(isProjectGenerationDraftChange(change), false)
      await assert.rejects(service.updateGenerationDraft(created.id, change as never), {
        code: 'PROJECT_INVALID_INPUT',
      })
    }
    const valid = {
      kind: 'dynamic-prompt' as const,
      value: { maxPrompts: 100, seedBehavior: 'per-prompt' as const },
    }
    assert.equal(isProjectGenerationDraftChange(valid), true)
    assert.equal(isProjectGenerationDraftChange({ ...valid, iterations: 2 }), false)
    await assert.rejects(service.updateGenerationDraft(created.id, valid, randomUUID()), {
      code: 'PROJECT_INVALID_INPUT',
    })
    assert.deepEqual(service.getOpenDocumentForAcceptance(created.id)!.document, before)
    assert.deepEqual(service.getOpenTabs()[0], created)
    assert.deepEqual(await readFile(savedPath), bytes)
    await service.close(created.id)
  })
})

test('dynamic draft edits recover from shadow without rewriting the saved portable Project', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const created = await service.create({ height: 64, title: 'Dynamic recovery', width: 64 })
    const savedPath = (await repository.listProjects())[0].canonicalPath
    const bytes = await readFile(savedPath)
    const settings = { maxPrompts: 1, seedBehavior: 'per-prompt' as const }
    await service.updateGenerationDraft(created.id, { kind: 'dynamic-prompt', value: settings })
    await service.flushAutosave(created.id)
    assert.deepEqual(await readFile(savedPath), bytes)
    const restarted = new ProjectService({
      autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow,
    })
    assert.equal((await restarted.open(created.id)).kind, 'recovery-required')
    const recovered = await restarted.resolveRecovery(created.id, 'recover')
    assert.equal(recovered.dirty, true)
    assert.deepEqual(recovered.generationDraft.dynamicPrompt, settings)
    assert.deepEqual(await readFile(savedPath), bytes)
    const saved = await restarted.save(created.id)
    assert.equal(saved.tab.dirty, false)
    assert.deepEqual(
      (await readIgsPackage(savedPath)).project.generationDraft.dynamicPrompt,
      settings,
    )
    await restarted.close(created.id)
    const reopened = await restarted.open(created.id)
    assert.equal(reopened.kind, 'opened')
    if (reopened.kind === 'opened') {
      assert.deepEqual(reopened.tab.generationDraft.dynamicPrompt, settings)
    }
    await restarted.close(created.id)
  })
})

test('dynamic draft synchronization snapshots caller values and flushes the real service before Save', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    let acknowledged = await service.create({ height: 64, title: 'Dynamic sync', width: 64 })
    const neighbor = await service.create({ height: 64, title: 'Untouched neighbor', width: 64 })
    const savedPath = (await repository.listProjects()).find(
      (project) => project.localProjectKey === acknowledged.id,
    )!.canonicalPath
    const beforeBytes = await readFile(savedPath)
    const overlays: (typeof acknowledged.generationDraft | null)[] = []
    const sent: ProjectGenerationDraftChange[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const sync = new ProjectDraftSync({
      onAcknowledged: (tab) => {
        acknowledged = tab
      },
      onError: (_tabId, error) => assert.fail(String(error)),
      onOverlay: (_tabId, draft) => overlays.push(draft),
      send: async (id, change) => {
        sent.push(structuredClone(change))
        if (sent.length === 1) {
          await gate
        }
        return service.updateGenerationDraft(id, change)
      },
    })
    const first = {
      kind: 'dynamic-prompt' as const,
      value: { maxPrompts: 10, seedBehavior: 'per-iteration' as const },
    }
    sync.change(acknowledged, first)
    first.value.maxPrompts = 99
    sync.change(acknowledged, {
      kind: 'dynamic-prompt',
      value: { maxPrompts: 20, seedBehavior: 'per-iteration' },
    })
    const latest = {
      kind: 'dynamic-prompt' as const,
      value: { maxPrompts: 30, seedBehavior: 'per-prompt' as const },
    }
    sync.change(acknowledged, latest)
    latest.value.maxPrompts = 98
    sync.change(acknowledged, { kind: 'positive-prompt', text: 'neighbor prompt' })
    assert.deepEqual(overlays.at(-1)?.dynamicPrompt, { maxPrompts: 30, seedBehavior: 'per-prompt' })
    assert.deepEqual(
      service.getOpenTabs().find((tab) => tab.id === neighbor.id),
      neighbor,
    )
    assert.deepEqual(await readFile(savedPath), beforeBytes)
    const flushed = sync.flush(acknowledged.id)
    release()
    await flushed
    assert.deepEqual(sent, [
      { kind: 'dynamic-prompt', value: { maxPrompts: 10, seedBehavior: 'per-iteration' } },
      { kind: 'dynamic-prompt', value: { maxPrompts: 30, seedBehavior: 'per-prompt' } },
      { kind: 'positive-prompt', text: 'neighbor prompt' },
    ])
    assert.equal(overlays.at(-1), null)
    const undoPrompt = await service.undo(acknowledged.id)
    assert.equal(undoPrompt.generationDraft.positivePrompt.text, '')
    assert.deepEqual(undoPrompt.generationDraft.dynamicPrompt, {
      maxPrompts: 30,
      seedBehavior: 'per-prompt',
    })
    const undoSettings = await service.undo(acknowledged.id)
    assert.deepEqual(undoSettings.generationDraft.dynamicPrompt, {
      maxPrompts: 10,
      seedBehavior: 'per-iteration',
    })
    await service.redo(acknowledged.id)
    await service.redo(acknowledged.id)
    await service.flushAutosave(acknowledged.id)
    assert.deepEqual(await readFile(savedPath), beforeBytes)
    const expectedDraft = structuredClone(
      service.getOpenTabs().find((tab) => tab.id === acknowledged.id)!.generationDraft,
    )
    const restarted = new ProjectService({
      autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow,
    })
    assert.equal((await restarted.open(acknowledged.id)).kind, 'recovery-required')
    const recovered = await restarted.resolveRecovery(acknowledged.id, 'recover')
    assert.equal(recovered.dirty, true)
    assert.deepEqual(recovered.generationDraft, expectedDraft)
    assert.deepEqual(recovered.generationDraft.dynamicPrompt, {
      maxPrompts: 30,
      seedBehavior: 'per-prompt',
    })
    assert.deepEqual(await readFile(savedPath), beforeBytes)
    const saved = await restarted.save(acknowledged.id)
    assert.equal(saved.tab.dirty, false)
    const portable = (await readIgsPackage(savedPath)).project.generationDraft
    assert.deepEqual(portable.dynamicPrompt, { maxPrompts: 30, seedBehavior: 'per-prompt' })
    assert.equal(portable.positivePrompt.text, 'neighbor prompt')
    assert.deepEqual(portable, expectedDraft)
    assert.deepEqual(
      service.getOpenTabs().find((tab) => tab.id === neighbor.id),
      neighbor,
    )
    await restarted.close(acknowledged.id)
    const reopened = await restarted.open(acknowledged.id)
    assert.equal(reopened.kind, 'opened')
    if (reopened.kind === 'opened') {
      assert.deepEqual(reopened.tab.generationDraft, expectedDraft)
    }
    await restarted.close(acknowledged.id)
    await service.close(neighbor.id)
  })
})

test('explicit Project Save snapshots the local actual seed without a draft edit or Undo step', async () => {
  let localSeed: number | null = null
  let storageAvailable = true
  await withService(
    async ({ repository, service }) => {
      const created = await service.create({ height: 512, title: 'Seed snapshot', width: 512 })
      const savedPath = (await repository.listProjects())[0].canonicalPath
      const documentId = (await readIgsPackage(savedPath)).project.documentId
      assert.equal(created.lastActualSeedSnapshot, null)
      assert.equal(created.dirty, false)
      assert.equal(created.canUndo, false)

      localSeed = 0
      assert.equal((await readIgsPackage(savedPath)).project.lastActualSeedSnapshot, null)
      const first = await service.save(created.id)
      assert.equal(first.tab.lastActualSeedSnapshot, 0)
      assert.equal(first.tab.dirty, false)
      assert.equal(first.tab.canUndo, false)
      assert.equal((await readIgsPackage(savedPath)).project.lastActualSeedSnapshot, 0)

      localSeed = 42
      assert.equal((await readIgsPackage(savedPath)).project.lastActualSeedSnapshot, 0)
      const second = await service.save(created.id)
      assert.equal(second.tab.lastActualSeedSnapshot, 42)
      assert.equal(second.tab.dirty, false)
      assert.equal(second.tab.canUndo, false)
      assert.equal((await readIgsPackage(savedPath)).project.lastActualSeedSnapshot, 42)

      storageAvailable = false
      const fallback = await service.save(created.id)
      assert.equal(fallback.tab.lastActualSeedSnapshot, 42)
      assert.equal((await readIgsPackage(savedPath)).project.lastActualSeedSnapshot, 42)
      await service.close(created.id)
      const reopened = await service.open(created.id)
      assert.equal(reopened.kind, 'opened')
      if (reopened.kind === 'opened') {
        assert.equal(reopened.tab.lastActualSeedSnapshot, 42)
      }
      assert.equal((await readIgsPackage(savedPath)).project.documentId, documentId)
    },
    {},
    async (localProjectKey, documentId) => {
      assert.match(localProjectKey, /^project-v1-[a-f0-9]{64}$/)
      assert.match(documentId, /^[a-f0-9-]{36}$/)
      if (!storageAvailable) {
        throw new Error('Simulated local recovery failure')
      }
      return localSeed
    },
  )
})

test('Save captures a completion that arrives while its preview worker runs', async () => {
  let localSeed = 1
  await withService(
    async ({ dataRoot, repository, service }) => {
      const { filePath, tabId } = await openTwoLayerProject(dataRoot, repository, service)
      const saved = await service.save(
        tabId,
        previewWorker(async () => {
          localSeed = 2
        }),
      )
      assert.equal(saved.tab.lastActualSeedSnapshot, 2)
      assert.equal((await readIgsPackage(filePath)).project.lastActualSeedSnapshot, 2)
    },
    {},
    async () => localSeed,
  )
})

async function publishPortableResource(
  repository: ModelRepository,
  dataRoot: string,
  bytes: Buffer,
  displayName: string,
  predictionType: 'epsilon' | 'v_prediction',
  resourceType: 'checkpoint' | 'lora' = 'checkpoint',
  modelId = 927,
) {
  const managedPath = path.join(dataRoot, `portable-${resourceType}-${modelId}.safetensors`)
  await writeFile(managedPath, bytes)
  const digest = createHash('sha256').update(bytes).digest('hex')
  return await repository.publishVerifiedInstallation({
    primary: {
      file: {
        managedPath,
        originalFilename: path.basename(managedPath),
        sha256: digest,
        sizeBytes: bytes.length,
        verifiedAt: new Date().toISOString(),
      },
      resource: {
        displayName,
        source: { kind: 'civitai', modelId },
        sourceMetadata: {},
        type: resourceType,
      },
      version: {
        baseModelFamily: 'illustrious',
        format: 'SafeTensor',
        name: `${displayName} version`,
        predictionType,
        source: {
          expectedSha256: digest,
          fileId: modelId + 2,
          kind: 'civitai',
          versionId: modelId + 1,
        },
        sourceMetadata: {},
      },
    },
  })
}

test(
  'Project service freezes an unsaved Raster Layer and bbox before a later edit',
  { skip: !devRuntimeRoot() },
  async () => {
    await withService(async ({ dataRoot, repository, service }) => {
      const { filePath, tabId } = await openTwoLayerProject(dataRoot, repository, service)
      const bbox = { height: 2, width: 3, x: 8, y: -1 }
      await service.setPrimaryBbox(tabId, bbox)
      const sourcePath = path.join(dataRoot, 'frozen foreground.png')
      await writeFile(sourcePath, rasterPng)
      const imported = await service.importRasterImage(tabId, sourcePath, rasterImportWorker())
      assert.equal(requireRasterLayer(imported.layers[0]).transform.x, bbox.x)
      const savedRevision = (await readIgsPackage(filePath)).project.documentRevision

      const stagingBasePath = path.join(dataRoot, 'scratch')
      await mkdir(stagingBasePath, { recursive: true })
      const worker = await ProjectWorkerClient.start(
        {
          pythonExecutable: devPython,
          runtimeRoot: devRuntimeRoot()!,
          stagingBasePath,
        },
        { requestTimeoutMs: 15_000 },
      )
      try {
        const target = await service.prepareNormalGenerationInput(tabId, {
          composeTarget: async (input) => {
            assert.deepEqual(input.bbox, bbox)
            assert.equal(input.layers.length, 3)
            for (const layer of input.layers) {
              assert.deepEqual(await readFile(layer.path), rasterPng)
            }
            await service.setPrimaryBbox(tabId, { height: 2, width: 3, x: 50, y: 50 })
            return await worker.composeTarget(input)
          },
        })
        assert.deepEqual(target.bbox, bbox)
        assert.equal(target.mode, 'outpaint')
        assert.equal(target.composite.width, bbox.width)
        assert.equal(target.composite.height, bbox.height)
        assert.equal(target.composite.byteSize, target.composite.bytes.length)
        assert.equal(
          target.composite.sha256,
          createHash('sha256').update(target.composite.bytes).digest('hex'),
        )
        assert.notEqual(target.documentRevision, savedRevision)
        assert.deepEqual(service.getOpenTabs()[0].primaryBbox, {
          height: 2,
          width: 3,
          x: 50,
          y: 50,
        })
        assert.equal(
          (await readdir(stagingBasePath)).some((entry) => entry.startsWith('project-target-')),
          false,
        )
      } finally {
        await worker.close()
      }
    })
  },
)

test('Project service creates, edits, saves and reopens an actual .igs with independent bbox coordinates', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const created = await service.create({
      height: 1152,
      title: '   Portrait board   ',
      width: 768,
    })
    assert.equal(created.title, 'Portrait board')
    assert.deepEqual(created.primaryBbox, { height: 1152, width: 768, x: 0, y: 0 })
    assert.equal(created.dirty, false)
    const indexed = (await repository.listProjects())[0]
    assert.equal(indexed.localProjectKey, created.id)
    assert.equal(indexed.previewStatus, 'empty')
    assert.ok((await service.list())[0]?.thumbnailUrl?.startsWith('igs-preview://thumbnail/'))
    assert.equal((await readIgsPackage(indexed.canonicalPath)).project.primaryBbox.width, 768)

    const changed = await service.setPrimaryBbox(created.id, {
      height: 640,
      width: 1024,
      x: -320,
      y: 96,
    })
    assert.equal(changed.dirty, true)
    assert.equal(service.hasDirtyTabs(), true)
    await service.flushAutosave(created.id)
    assert.equal((await readIgsPackage(indexed.canonicalPath)).project.primaryBbox.x, 0)
    assert.equal((await service.list())[0]?.recoveryStatus, 'none')

    const saved = await service.save(created.id)
    assert.equal(saved.committed, true)
    assert.equal(saved.recoveryStatus, 'clean')
    assert.equal(saved.tab.dirty, false)
    assert.equal(service.hasDirtyTabs(), false)
    await service.close(created.id)
    assert.deepEqual(service.getOpenTabs(), [])

    const restarted = new ProjectService({
      autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow,
    })
    const opened = await restarted.open(created.id)
    assert.equal(opened.kind, 'opened')
    if (opened.kind === 'opened') {
      assert.deepEqual(opened.tab.primaryBbox, {
        height: 640,
        width: 1024,
        x: -320,
        y: 96,
      })
      assert.equal(opened.tab.dirty, false)
      assert.deepEqual(await restarted.open(created.id), opened)
      await restarted.close(created.id)
    }
    assert.deepEqual((await service.list())[0]?.bbox, { height: 640, width: 1024 })
  })
})

test('an open Project reports the replacement document identity when its .igs path is reused', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const created = await service.create({ height: 64, title: 'Original', width: 64 })
    const originalDocumentId = service.getOpenDocumentId(created.id)
    assert.ok(originalDocumentId)
    assert.equal(service.getOpenDocumentId('invalid-project-key'), null)
    const savedPath = (await repository.listProjects())[0].canonicalPath
    await service.close(created.id)
    assert.equal(service.getOpenDocumentId(created.id), null)

    const replacement = createEmptyProjectDocumentV1({ title: 'Replacement' })
    const placeholders = await readProjectPlaceholders(placeholdersDir, 'empty')
    const replacementPath = path.join(dataRoot, 'replacement.igs')
    await saveIgsPackage(replacementPath, {
      assets: {},
      preview: { ...placeholders, rect: null, status: 'empty' },
      project: replacement,
    })
    await rename(replacementPath, savedPath)

    const reopened = await service.open(created.id)
    assert.equal(reopened.kind, 'opened')
    assert.equal(service.getOpenDocumentId(created.id), replacement.documentId)
    assert.notEqual(service.getOpenDocumentId(created.id), originalDocumentId)
    await service.close(created.id)
  })
})

test('Project service asks before recovery and restores dirty document without replacing saved .igs', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const created = await service.create({ height: 512, title: 'Recovery', width: 512 })
    const savedPath = (await repository.listProjects())[0].canonicalPath
    await service.setPrimaryBbox(created.id, { height: 896, width: 640, x: -44, y: 12 })
    await service.flushAutosave(created.id)
    assert.equal((await readIgsPackage(savedPath)).project.primaryBbox.x, 0)

    // A new lease registry models the next main process after a crash. The first service stays
    // dirty and does not perform a graceful close or erase the recovery shadow.
    const restarted = new ProjectService({
      autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow,
    })
    const summary = (await restarted.list())[0]
    assert.equal(summary.recoveryStatus, 'recoverable')
    const choice = await restarted.open(created.id)
    assert.equal(choice.kind, 'recovery-required')
    if (choice.kind === 'recovery-required') {
      assert.equal(choice.recoveryStatus, 'recoverable')
    }
    assert.equal((await readIgsPackage(savedPath)).project.primaryBbox.x, 0)

    const recovered = await restarted.resolveRecovery(created.id, 'recover')
    assert.equal(recovered.dirty, true)
    assert.equal(recovered.primaryBbox.x, -44)
    assert.equal((await readIgsPackage(savedPath)).project.primaryBbox.x, 0)
    assert.equal((await restarted.save(created.id)).recoveryStatus, 'clean')
    assert.equal((await readIgsPackage(savedPath)).project.primaryBbox.x, -44)
    await restarted.close(created.id)
  })
})

test('Project prompt and seed edits survive shadow recovery, Save and reopen without changing the actual seed cursor', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const created = await service.create({ height: 512, title: 'Draft persistence', width: 512 })
    const savedPath = (await repository.listProjects())[0].canonicalPath
    assert.equal(created.lastActualSeedSnapshot, null)
    assert.deepEqual(created.generationDraft.seed, { policy: 'random', value: null })

    const prompted = await service.updateGenerationDraft(created.id, {
      kind: 'positive-prompt',
      text: 'a blue lantern',
    })
    assert.equal(prompted.dirty, true)
    assert.equal(prompted.generationDraft.positivePrompt.text, 'a blue lantern')
    await service.updateGenerationDraft(created.id, {
      kind: 'negative-prompt',
      text: 'blur',
    })
    const seeded = await service.updateGenerationDraft(created.id, {
      kind: 'seed',
      policy: 'fixed',
      value: 0xff_ff_ff_ff,
    })
    assert.deepEqual(seeded.generationDraft.seed, { policy: 'fixed', value: 0xff_ff_ff_ff })
    assert.equal(seeded.lastActualSeedSnapshot, null)
    await service.flushAutosave(created.id)
    assert.equal((await readIgsPackage(savedPath)).project.generationDraft.positivePrompt.text, '')

    const restarted = new ProjectService({
      autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow,
    })
    assert.equal((await restarted.open(created.id)).kind, 'recovery-required')
    const recovered = await restarted.resolveRecovery(created.id, 'recover')
    assert.equal(recovered.dirty, true)
    assert.equal(recovered.generationDraft.positivePrompt.text, 'a blue lantern')
    assert.equal(recovered.generationDraft.negativePrompt.text, 'blur')
    assert.deepEqual(recovered.generationDraft.seed, { policy: 'fixed', value: 0xff_ff_ff_ff })
    assert.equal(recovered.lastActualSeedSnapshot, null)

    const saved = await restarted.save(created.id)
    assert.equal(saved.tab.dirty, false)
    assert.deepEqual(
      (await readIgsPackage(savedPath)).project.generationDraft,
      recovered.generationDraft,
    )
    await restarted.close(created.id)
    const reopened = await restarted.open(created.id)
    assert.equal(reopened.kind, 'opened')
    if (reopened.kind !== 'opened') {
      throw new Error('Saved Project did not reopen.')
    }
    assert.deepEqual(reopened.tab.generationDraft, recovered.generationDraft)
    assert.equal(
      (
        await restarted.updateGenerationDraft(created.id, {
          kind: 'positive-prompt',
          text: 'a blue lantern',
        })
      ).dirty,
      false,
    )
    assert.equal(
      (
        await restarted.updateGenerationDraft(created.id, {
          kind: 'seed',
          policy: 'fixed',
          value: 0xff_ff_ff_ff,
        })
      ).dirty,
      false,
    )
    await restarted.close(created.id)
  })
})

test('ProjectService groups prompt edits for Undo while keeping later controls and Clear History separate', async () => {
  await withService(async ({ repository, service }) => {
    const created = await service.create({ height: 512, title: 'Prompt history', width: 512 })
    const projectPath = (await repository.listProjects())[0].canonicalPath
    const groupId = randomUUID()
    for (const text of ['a', 'a blue', 'a blue lantern']) {
      const tab = await service.updateGenerationDraft(
        created.id,
        { kind: 'positive-prompt', text },
        groupId,
      )
      assert.equal(tab.generationDraft.positivePrompt.text, text)
    }
    await service.flushAutosave(created.id)
    assert.equal(
      (await readIgsPackage(projectPath)).project.generationDraft.positivePrompt.text,
      '',
    )
    await service.sealPromptHistory(created.id, groupId)
    const seeded = await service.updateGenerationDraft(created.id, {
      kind: 'seed',
      policy: 'fixed',
      value: 42,
    })
    assert.equal(seeded.canUndo, true)
    await assert.rejects(
      service.updateGenerationDraft(
        created.id,
        { kind: 'sampling-steps', value: 35 },
        randomUUID(),
      ),
      { code: 'PROJECT_INVALID_INPUT' },
    )
    const undoSeed = await service.undo(created.id)
    assert.deepEqual(undoSeed.generationDraft.seed, created.generationDraft.seed)
    assert.equal(undoSeed.generationDraft.positivePrompt.text, 'a blue lantern')
    const undoPrompt = await service.undo(created.id)
    assert.equal(undoPrompt.generationDraft.positivePrompt.text, '')
    assert.equal(undoPrompt.canUndo, false)
    assert.equal(undoPrompt.canRedo, true)
    const redoPrompt = await service.redo(created.id)
    assert.equal(redoPrompt.generationDraft.positivePrompt.text, 'a blue lantern')
    const cleared = await service.clearHistory(created.id)
    assert.equal(cleared.generationDraft.positivePrompt.text, 'a blue lantern')
    assert.equal(cleared.canUndo, false)
    assert.equal(cleared.canRedo, false)
    assert.equal(cleared.dirty, true)
  })
})

test('Project sampling edits survive shadow recovery, Save and reopen independently', async () => {
  for (const { sampler, scheduler } of [
    { sampler: 'DPM++ 2M', scheduler: 'Karras' },
    { sampler: 'Euler a', scheduler: 'Normal' },
    { sampler: 'Euler', scheduler: 'Normal' },
  ]) {
    await withService(async ({ dataRoot, repository, service, shadow }) => {
      const created = await service.create({
        height: 512,
        title: 'Sampling persistence',
        width: 512,
      })
      const savedPath = (await repository.listProjects())[0].canonicalPath
      const originalSampling = created.generationDraft.sampling
      assert.deepEqual(originalSampling, {
        cfgScale: null,
        denoisingStrength: null,
        sampler: null,
        scheduler: null,
        steps: null,
      })

      const steps = await service.updateGenerationDraft(created.id, {
        kind: 'sampling-steps',
        value: 35,
      })
      assert.equal(steps.dirty, true)
      assert.deepEqual(steps.generationDraft.sampling, { ...originalSampling, steps: 35 })
      const cfgScale = await service.updateGenerationDraft(created.id, {
        kind: 'sampling-cfg-scale',
        value: 7.5,
      })
      assert.deepEqual(cfgScale.generationDraft.sampling, {
        ...originalSampling,
        cfgScale: 7.5,
        steps: 35,
      })
      const partialPair = await service.updateGenerationDraft(created.id, {
        kind: 'sampling-pair',
        sampler,
        scheduler: null,
      })
      assert.equal(partialPair.generationDraft.sampling.scheduler, null)
      const selectedPair = await service.updateGenerationDraft(created.id, {
        kind: 'sampling-pair',
        sampler,
        scheduler,
      })
      assert.deepEqual(selectedPair.generationDraft.sampling, {
        ...cfgScale.generationDraft.sampling,
        sampler,
        scheduler,
      })
      assert.deepEqual(
        (await service.undo(created.id)).generationDraft.sampling,
        partialPair.generationDraft.sampling,
      )
      assert.deepEqual(
        (await service.redo(created.id)).generationDraft.sampling,
        selectedPair.generationDraft.sampling,
      )
      await service.flushAutosave(created.id)
      assert.deepEqual(
        (await readIgsPackage(savedPath)).project.generationDraft.sampling,
        originalSampling,
      )

      const restarted = new ProjectService({
        autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
        dataRoot,
        repository,
        roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
        shadow,
      })
      assert.equal((await restarted.open(created.id)).kind, 'recovery-required')
      const recovered = await restarted.resolveRecovery(created.id, 'recover')
      assert.equal(recovered.dirty, true)
      assert.deepEqual(recovered.generationDraft.sampling, selectedPair.generationDraft.sampling)
      assert.deepEqual(
        (await readIgsPackage(savedPath)).project.generationDraft.sampling,
        originalSampling,
      )

      assert.equal((await restarted.save(created.id)).tab.dirty, false)
      assert.deepEqual(
        (await readIgsPackage(savedPath)).project.generationDraft.sampling,
        selectedPair.generationDraft.sampling,
      )
      await restarted.close(created.id)
      const reopened = await restarted.open(created.id)
      assert.equal(reopened.kind, 'opened')
      if (reopened.kind !== 'opened') {
        throw new Error('Saved Project did not reopen.')
      }
      assert.deepEqual(reopened.tab.generationDraft.sampling, selectedPair.generationDraft.sampling)
      assert.equal(
        (
          await restarted.updateGenerationDraft(created.id, {
            kind: 'sampling-pair',
            sampler,
            scheduler,
          })
        ).dirty,
        false,
      )
      assert.equal(
        (
          await restarted.updateGenerationDraft(created.id, {
            kind: 'sampling-steps',
            value: 35,
          })
        ).dirty,
        false,
      )
      assert.equal(
        (
          await restarted.updateGenerationDraft(created.id, {
            kind: 'sampling-cfg-scale',
            value: 7.5,
          })
        ).dirty,
        false,
      )

      const clearedPair = await restarted.updateGenerationDraft(created.id, {
        kind: 'sampling-pair',
        sampler: null,
        scheduler: null,
      })
      assert.equal(clearedPair.dirty, true)
      const clearedSteps = await restarted.updateGenerationDraft(created.id, {
        kind: 'sampling-steps',
        value: null,
      })
      assert.deepEqual(clearedSteps.generationDraft.sampling, {
        ...originalSampling,
        cfgScale: 7.5,
      })
      await restarted.save(created.id)
      await restarted.close(created.id)
      const reopenedAfterClear = await restarted.open(created.id)
      assert.equal(reopenedAfterClear.kind, 'opened')
      if (reopenedAfterClear.kind !== 'opened') {
        throw new Error('Saved Project did not reopen after clearing Steps.')
      }
      assert.deepEqual(
        reopenedAfterClear.tab.generationDraft.sampling,
        clearedSteps.generationDraft.sampling,
      )
      const clearedCfgScale = await restarted.updateGenerationDraft(created.id, {
        kind: 'sampling-cfg-scale',
        value: null,
      })
      assert.equal(clearedCfgScale.dirty, true)
      assert.deepEqual(clearedCfgScale.generationDraft.sampling, originalSampling)
      await restarted.save(created.id)
      assert.deepEqual(
        (await readIgsPackage(savedPath)).project.generationDraft.sampling,
        originalSampling,
      )
      await restarted.close(created.id)
    })
  }
})

test('Project keeps a registry-selected exact checkpoint through shadow, Save, default change and missing file', async () => {
  await withService(
    async ({ dataRoot, modelRepository, modelService, repository, service, shadow }) => {
      const created = await service.create({ height: 512, title: 'Exact model', width: 512 })
      const savedPath = (await repository.listProjects())[0].canonicalPath
      const publishVersion = async (versionId: number) => {
        const bytes = Buffer.from(`verified checkpoint v${versionId}`)
        const managedPath = path.join(dataRoot, `checkpoint-${versionId}.safetensors`)
        await writeFile(managedPath, bytes)
        const digest = createHash('sha256').update(bytes).digest('hex')
        const published = await modelRepository.publishVerifiedInstallation({
          primary: {
            file: {
              managedPath,
              originalFilename: `checkpoint-${versionId}.safetensors`,
              sha256: digest,
              sizeBytes: bytes.length,
              verifiedAt: new Date().toISOString(),
            },
            resource: {
              displayName: 'Portrait checkpoint',
              source: { kind: 'civitai', modelId: 42 },
              sourceMetadata: {},
              type: 'checkpoint',
            },
            version: {
              baseModelFamily: 'illustrious',
              format: 'SafeTensor',
              name: `v${versionId}`,
              predictionType: null,
              source: {
                expectedSha256: digest,
                fileId: versionId + 700,
                kind: 'civitai',
                versionId,
              },
              sourceMetadata: {},
            },
          },
        })
        return { managedPath, published, sha256: digest }
      }
      const first = await publishVersion(7)
      const second = await publishVersion(8)
      assert.equal(first.published.resourceId, second.published.resourceId)

      const selection = {
        resourceId: first.published.resourceId,
        versionId: first.published.versionId,
      }
      assert.equal(isProjectGenerationModelSelection(selection), true)
      assert.equal(
        isProjectGenerationModelSelection({ ...selection, fileSha256: first.sha256 }),
        false,
      )
      assert.equal(
        isProjectGenerationModelSelection({ ...selection, managedPath: first.managedPath }),
        false,
      )
      assert.equal(isProjectGenerationModelSelection(null), true)
      const exactRef = await modelService.resolveGenerationCheckpoint(
        selection.resourceId,
        selection.versionId,
      )
      assert.deepEqual(exactRef, {
        baseModelFamily: 'illustrious',
        civitaiFileId: 707,
        civitaiModelId: 42,
        civitaiVersionId: 7,
        displayName: 'Portrait checkpoint',
        fileSha256: first.sha256,
        kind: 'checkpoint',
        localModelId: selection.resourceId,
        localVersionId: selection.versionId,
        predictionType: 'epsilon',
        versionName: 'v7',
      })
      const selected = await service.setGenerationModel(created.id, exactRef)
      assert.equal(selected.dirty, true)
      assert.deepEqual(selected.generationDraft.model, exactRef)
      assert.deepEqual(selected.generationDraft.seed, { policy: 'random', value: null })
      await service.flushAutosave(created.id)
      const oldSaved = await readIgsPackage(savedPath)
      assert.equal(oldSaved.project.generationDraft.model, null)
      const recovery = await shadow.inspect({ projectPath: savedPath, savedPackage: oldSaved })
      assert.equal(recovery.status, 'recoverable')
      if (recovery.status !== 'recoverable') {
        throw new Error('The exact model did not reach the recovery shadow.')
      }
      assert.deepEqual(recovery.document.generationDraft.model, exactRef)

      const saved = await service.save(created.id)
      assert.equal(saved.tab.dirty, false)
      assert.deepEqual((await readIgsPackage(savedPath)).project.generationDraft.model, exactRef)
      await modelService.setDefaultVersion(second.published.resourceId, second.published.versionId)
      assert.equal(
        (await modelRepository.listInstalled())[0].defaultVersionId,
        second.published.versionId,
      )
      await service.close(created.id)
      const reopened = await service.open(created.id)
      assert.equal(reopened.kind, 'opened')
      if (reopened.kind !== 'opened') {
        throw new Error('The saved Project did not reopen.')
      }
      assert.deepEqual(reopened.tab.generationDraft.model, exactRef)
      assert.equal((await service.setGenerationModel(created.id, exactRef)).dirty, false)

      await service.close(created.id)
      await rm(first.managedPath)
      const withMissingFile = await service.open(created.id)
      assert.equal(withMissingFile.kind, 'opened')
      if (withMissingFile.kind !== 'opened') {
        throw new Error('The Project with a missing model did not open.')
      }
      assert.deepEqual(withMissingFile.tab.generationDraft.model, exactRef)
      await assert.rejects(
        modelService.resolveGenerationCheckpoint(selection.resourceId, selection.versionId),
        { code: 'MODEL_FILE_MISSING' },
      )
      assert.equal(service.getOpenTabs()[0].dirty, false)
      assert.equal((await service.setGenerationModel(created.id, null)).dirty, true)
      assert.equal((await service.setGenerationModel(created.id, null)).generationDraft.model, null)
      await service.save(created.id)
      await service.close(created.id)
      const cleared = await service.open(created.id)
      assert.equal(cleared.kind, 'opened')
      if (cleared.kind === 'opened') {
        assert.equal(cleared.tab.generationDraft.model, null)
        assert.equal((await service.setGenerationModel(created.id, null)).dirty, false)
        await service.close(created.id)
      }
    },
  )
})

test('a copied .igs explicitly links the same installed checkpoint across local libraries without rewriting frozen metadata', async () => {
  const bytes = Buffer.from('one exact portable checkpoint in two managed libraries')
  await withService(async (origin) => {
    const originInstalled = await publishPortableResource(
      origin.modelRepository,
      origin.dataRoot,
      bytes,
      'Original name',
      'epsilon',
    )
    const created = await origin.service.create({
      height: 512,
      title: 'Portable model',
      width: 512,
    })
    const originalRef = await origin.modelService.resolveGenerationCheckpoint(
      originInstalled.resourceId,
      originInstalled.versionId,
    )
    let resolvedWithoutSelection = false
    await assert.rejects(
      origin.service.relinkGenerationModel(created.id, async () => {
        resolvedWithoutSelection = true
        return originalRef
      }),
      { code: 'PROJECT_MODEL_NOT_SELECTED' },
    )
    assert.equal(resolvedWithoutSelection, false)
    assert.equal(origin.service.getOpenTabs()[0].dirty, false)
    await origin.service.setGenerationModel(created.id, originalRef)
    await origin.service.save(created.id)
    const originPath = (await origin.repository.listProjects())[0].canonicalPath
    const portableBytes = await readFile(originPath)
    await origin.service.close(created.id)

    await withService(async (destination) => {
      const destinationInstalled = await publishPortableResource(
        destination.modelRepository,
        destination.dataRoot,
        bytes,
        'Different local name',
        'v_prediction',
      )
      assert.notEqual(destinationInstalled.resourceId, originInstalled.resourceId)
      assert.notEqual(destinationInstalled.versionId, originInstalled.versionId)
      const incomingPath = path.join(destination.dataRoot, 'From another computer.igs')
      await writeFile(incomingPath, portableBytes)
      const selection = await destination.service.selectImport(incomingPath)
      assert.equal(selection.kind, 'transfer-required')
      if (selection.kind !== 'transfer-required') {
        throw new Error('Expected a portable Project import choice.')
      }
      const imported = await destination.service.finishImport(selection.importId, 'copy')
      assert.equal(imported.result.kind, 'opened')
      if (imported.result.kind !== 'opened') {
        throw new Error('Expected the imported Project to open.')
      }
      const tabId = imported.result.tab.id
      const savedPath = (await destination.repository.listProjects())[0]?.canonicalPath
      assert.ok(savedPath)
      assert.equal(imported.result.tab.dirty, false)
      assert.deepEqual(imported.result.tab.generationDraft.model, originalRef)
      assert.deepEqual((await readIgsPackage(savedPath)).project.generationDraft.model, originalRef)

      await assert.rejects(
        destination.service.relinkGenerationModel(tabId, async (saved) => ({
          ...(await destination.modelService.resolvePortableGenerationCheckpoint(saved)),
          civitaiVersionId: 999,
        })),
        { code: 'PROJECT_MODEL_RELINK_MISMATCH' },
      )
      assert.equal(destination.service.getOpenTabs()[0].dirty, false)

      let releaseResolver!: () => void
      let signalResolverStarted!: () => void
      const resolverGate = new Promise<void>((resolve) => {
        releaseResolver = resolve
      })
      const resolverStarted = new Promise<void>((resolve) => {
        signalResolverStarted = resolve
      })
      const staleRelink = destination.service.relinkGenerationModel(tabId, async (saved) => {
        signalResolverStarted()
        await resolverGate
        return await destination.modelService.resolvePortableGenerationCheckpoint(saved)
      })
      await resolverStarted
      await destination.service.updateGenerationDraft(tabId, {
        kind: 'positive-prompt',
        text: 'An edit made while the exact file is being verified',
      })
      releaseResolver()
      await assert.rejects(staleRelink, { code: 'EDIT_CONFLICT' })
      assert.deepEqual(destination.service.getOpenTabs()[0].generationDraft.model, originalRef)

      const linked = await destination.service.relinkGenerationModel(tabId, async (saved) => ({
        ...(await destination.modelService.resolvePortableGenerationCheckpoint(saved)),
        displayName: 'Untrusted destination title',
        predictionType: 'sample',
        versionName: 'Untrusted destination version',
      }))
      const linkedRef = {
        ...originalRef,
        localModelId: destinationInstalled.resourceId,
        localVersionId: destinationInstalled.versionId,
      }
      assert.equal(linked.dirty, true)
      assert.deepEqual(linked.generationDraft.model, linkedRef)
      assert.equal(linked.generationDraft.model?.predictionType, 'epsilon')
      assert.equal(
        linked.generationDraft.positivePrompt.text,
        'An edit made while the exact file is being verified',
      )
      assert.deepEqual((await readIgsPackage(savedPath)).project.generationDraft.model, originalRef)
      await destination.service.flushAutosave(tabId)
      const recovery = await destination.shadow.inspect({
        projectPath: savedPath,
        savedPackage: await readIgsPackage(savedPath),
      })
      assert.equal(recovery.status, 'recoverable')
      if (recovery.status === 'recoverable') {
        assert.deepEqual(recovery.document.generationDraft.model, linkedRef)
      }
      await destination.service.save(tabId)
      assert.deepEqual((await readIgsPackage(savedPath)).project.generationDraft.model, linkedRef)
      await destination.service.close(tabId)
      const reopened = await destination.service.open(tabId)
      assert.equal(reopened.kind, 'opened')
      if (reopened.kind === 'opened') {
        assert.deepEqual(reopened.tab.generationDraft.model, linkedRef)
        assert.equal(reopened.tab.dirty, false)
        assert.equal(
          (
            await destination.service.relinkGenerationModel(tabId, (saved) =>
              destination.modelService.resolvePortableGenerationCheckpoint(saved),
            )
          ).dirty,
          false,
        )
        let releaseNoop!: () => void
        let signalNoopStarted!: () => void
        const noopGate = new Promise<void>((resolve) => {
          releaseNoop = resolve
        })
        const noopStarted = new Promise<void>((resolve) => {
          signalNoopStarted = resolve
        })
        const staleNoop = destination.service.relinkGenerationModel(tabId, async (saved) => {
          signalNoopStarted()
          await noopGate
          return await destination.modelService.resolvePortableGenerationCheckpoint(saved)
        })
        await noopStarted
        await destination.service.updateGenerationDraft(tabId, {
          kind: 'negative-prompt',
          text: 'Newer edit before a no-op relink resolves',
        })
        releaseNoop()
        await assert.rejects(staleNoop, { code: 'EDIT_CONFLICT' })
        assert.deepEqual(destination.service.getOpenTabs()[0].generationDraft.model, linkedRef)
        await destination.service.save(tabId)
        await destination.service.close(tabId)
      }
    })
  })
})

test('Project prompt text retains only pre-existing embedding refs whose literal token remains', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const externalPath = path.join(dataRoot, 'Embedded prompt.igs')
    const document = createEmptyProjectDocumentV1({ title: 'Embedded prompt' })
    const ref = {
      resource: {
        baseModelFamily: 'illustrious' as const,
        civitaiFileId: null,
        civitaiModelId: null,
        civitaiVersionId: null,
        displayName: 'Face embedding',
        fileSha256: 'a'.repeat(64),
        kind: 'embedding' as const,
        localModelId: 'face',
        localVersionId: 'v1',
        predictionType: null,
        versionName: '1',
      },
      token: 'face',
    }
    document.generationDraft.positivePrompt = { embeddingRefs: [ref], text: 'face' }
    document.generationDraft.negativePrompt = { embeddingRefs: [ref], text: 'face' }
    document.generationDraft.sampling.cfgScale = 7.5
    const placeholders = await readProjectPlaceholders(placeholdersDir, 'empty')
    await saveIgsPackage(externalPath, {
      assets: {},
      preview: { ...placeholders, rect: null, status: 'empty' },
      project: document,
    })
    const selected = await service.selectImport(externalPath)
    assert.equal(selected.kind, 'transfer-required')
    if (selected.kind !== 'transfer-required') {
      throw new Error('Expected transfer choice.')
    }
    const imported = await service.finishImport(selected.importId, 'copy')
    assert.equal(imported.result.kind, 'opened')
    if (imported.result.kind !== 'opened') {
      throw new Error('Expected imported Project to open.')
    }
    const tabId = imported.result.tab.id
    const loraResource = { ...ref.resource, kind: 'lora' as const, localModelId: 'lora-face' }
    const loraIdentity = {
      resourceId: loraResource.localModelId,
      versionId: loraResource.localVersionId,
    }
    const addedLora = await service.addGenerationLora(tabId, loraResource)
    const weightedLora = await service.updateGenerationDraft(tabId, {
      ...loraIdentity,
      kind: 'lora-weight',
      value: 0.4,
    })
    const disabledLora = await service.updateGenerationDraft(tabId, {
      ...loraIdentity,
      kind: 'lora-enabled',
      value: false,
    })
    const removedLora = await service.removeGenerationLora(tabId, loraIdentity)
    for (const tab of [addedLora, weightedLora, disabledLora, removedLora]) {
      assert.deepEqual(tab.generationDraft.positivePrompt, document.generationDraft.positivePrompt)
      assert.deepEqual(tab.generationDraft.negativePrompt, document.generationDraft.negativePrompt)
    }
    const retained = await service.updateGenerationDraft(tabId, {
      kind: 'positive-prompt',
      text: 'xface face!',
    })
    assert.deepEqual(retained.generationDraft.positivePrompt.embeddingRefs, [ref])
    assert.deepEqual(retained.generationDraft.negativePrompt.embeddingRefs, [ref])
    assert.equal(retained.generationDraft.sampling.cfgScale, 7.5)
    const removed = await service.updateGenerationDraft(tabId, {
      kind: 'positive-prompt',
      text: 'xface facey',
    })
    assert.deepEqual(removed.generationDraft.positivePrompt.embeddingRefs, [])
    assert.deepEqual(removed.generationDraft.negativePrompt.embeddingRefs, [ref])
    assert.equal(removed.generationDraft.sampling.cfgScale, 7.5)
    await service.save(tabId)
    const savedPath = (await repository.listProjects())[0].canonicalPath
    assert.deepEqual(
      (await readIgsPackage(savedPath)).project.generationDraft.positivePrompt.embeddingRefs,
      [],
    )
    await service.close(tabId)
  })
})

test('Project draft IPC shape and service reject forged refs and invalid scalar settings without dirtying', async () => {
  const invalid = [
    { embeddingRefs: [], kind: 'positive-prompt', text: 'face' },
    { kind: 'seed', policy: 'fixed', value: null },
    { kind: 'seed', policy: 'fixed', value: -1 },
    { kind: 'seed', policy: 'fixed', value: 4_294_967_296 },
    { kind: 'seed', policy: 'random', value: 1 },
    { kind: 'seed', policy: 'reuse', value: 3 },
    { kind: 'sampling-steps', value: 0 },
    { kind: 'sampling-steps', value: -1 },
    { kind: 'sampling-steps', value: 1.5 },
    { kind: 'sampling-steps', value: Number.MAX_SAFE_INTEGER + 1 },
    { kind: 'sampling-steps', value: Number.POSITIVE_INFINITY },
    { kind: 'sampling-steps', value: Number.NaN },
    { kind: 'sampling-steps', value: '30' },
    { kind: 'sampling-steps', scheduler: 'forged', value: 30 },
    { kind: 'sampling-cfg-scale', value: -0.1 },
    { kind: 'sampling-cfg-scale', value: Number.POSITIVE_INFINITY },
    { kind: 'sampling-cfg-scale', value: Number.NaN },
    { kind: 'sampling-cfg-scale', value: '7.5' },
    { kind: 'sampling-cfg-scale', loras: [], value: 7.5 },
    { kind: 'sampling-pair', sampler: 'Euler a', scheduler: 'Karras' },
    { kind: 'sampling-pair', sampler: 'Euler', scheduler: 'Karras' },
    { kind: 'sampling-pair', sampler: 'euler', scheduler: 'Normal' },
    { kind: 'sampling-pair', sampler: 'euler_a', scheduler: 'Normal' },
    { kind: 'sampling-pair', sampler: 'Euler A', scheduler: 'Normal' },
    { kind: 'sampling-pair', sampler: 'DPM++ 2M', scheduler: 'Exponential' },
    { kind: 'sampling-pair', sampler: null, scheduler: 'Normal' },
    { kind: 'sampling-pair', model: 'forged', sampler: 'Euler a', scheduler: null },
    { kind: 'positive-prompt', text: 'é'.repeat(IGS_SAFETY_CEILINGS.textBytes) },
  ]
  for (const change of invalid) {
    assert.equal(isProjectGenerationDraftChange(change), false)
  }
  assert.equal(isProjectGenerationDraftChange({ kind: 'seed', policy: 'fixed', value: 0 }), true)
  assert.equal(isProjectGenerationDraftChange({ kind: 'seed', policy: 'reuse', value: null }), true)
  assert.equal(isProjectGenerationDraftChange({ kind: 'sampling-steps', value: null }), true)
  assert.equal(isProjectGenerationDraftChange({ kind: 'sampling-steps', value: 1 }), true)
  assert.equal(
    isProjectGenerationDraftChange({ kind: 'sampling-steps', value: Number.MAX_SAFE_INTEGER }),
    true,
  )
  assert.equal(isProjectGenerationDraftChange({ kind: 'sampling-cfg-scale', value: null }), true)
  assert.equal(isProjectGenerationDraftChange({ kind: 'sampling-cfg-scale', value: 0 }), true)
  assert.equal(
    isProjectGenerationDraftChange({ kind: 'sampling-pair', sampler: null, scheduler: null }),
    true,
  )
  assert.equal(
    isProjectGenerationDraftChange({ kind: 'sampling-pair', sampler: 'Euler a', scheduler: null }),
    true,
  )
  assert.equal(
    isProjectGenerationDraftChange({ kind: 'sampling-pair', sampler: 'Euler', scheduler: null }),
    true,
  )
  assert.equal(
    isProjectGenerationDraftChange({
      kind: 'sampling-pair',
      sampler: 'Euler',
      scheduler: 'Normal',
    }),
    true,
  )
  assert.equal(
    isProjectGenerationDraftChange({
      kind: 'sampling-pair',
      sampler: 'DPM++ SDE',
      scheduler: 'Karras',
    }),
    true,
  )
  assert.equal(
    isProjectGenerationDraftChange({ kind: 'sampling-cfg-scale', value: Number.MAX_VALUE }),
    true,
  )
  await withService(async ({ service }) => {
    const created = await service.create({ height: 512, title: 'Guarded draft', width: 512 })
    for (const change of invalid) {
      await assert.rejects(service.updateGenerationDraft(created.id, change as never), {
        code: 'PROJECT_INVALID_INPUT',
      })
    }
    assert.equal(service.getOpenTabs()[0].dirty, false)
    const reuse = await service.updateGenerationDraft(created.id, {
      kind: 'seed',
      policy: 'reuse',
      value: null,
    })
    assert.deepEqual(reuse.generationDraft.seed, { policy: 'reuse', value: null })
    assert.equal(reuse.lastActualSeedSnapshot, null)
    await service.discardAndClose(created.id)
  })
})

test('Project service rejects unknown IDs and invalid bbox before changing an open document', async () => {
  await withService(async ({ service }) => {
    const created = await service.create({ height: 1024, title: 'Valid', width: 1024 })
    await assert.rejects(service.open('../../outside.igs'), { code: 'PROJECT_INVALID_INPUT' })
    await assert.rejects(service.open(`project-v1-${'0'.repeat(64)}`), {
      code: 'PROJECT_NOT_FOUND',
    })
    await assert.rejects(
      service.setPrimaryBbox(created.id, { height: 512, width: 0, x: 0, y: 0 }),
      { code: 'PROJECT_INVALID_INPUT' },
    )
    assert.equal(service.getOpenTabs()[0].dirty, false)
    assert.deepEqual(service.getOpenTabs()[0].primaryBbox, {
      height: 1024,
      width: 1024,
      x: 0,
      y: 0,
    })
    await service.close(created.id)
  })
})

test('an indexed path swapped to another .igs during recovery inspection cannot open or Save the other file', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const created = await service.create({ height: 512, title: 'Indexed', width: 512 })
    const indexedPath = (await repository.listProjects())[0].canonicalPath
    await service.close(created.id)
    const externalPath = path.join(dataRoot, 'external.igs')
    await ProjectSession.create(externalPath, 'External', {
      placeholdersDir,
      scratchDir: path.join(dataRoot, 'scratch'),
    })
    const externalBefore = await readFile(externalPath)
    let swapped = false
    class SwappingShadow extends ProjectShadowStore {
      override async inspect(input: Parameters<ProjectShadowStore['inspect']>[0]) {
        const inspection = await super.inspect(input)
        if (!swapped) {
          swapped = true
          await rename(indexedPath, `${indexedPath}.original`)
          await symlink(externalPath, indexedPath)
        }
        return inspection
      }
    }
    const restarted = new ProjectService({
      autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow: new SwappingShadow(path.join(dataRoot, 'autosave')),
    })
    await assert.rejects(restarted.open(created.id), { code: 'PROJECT_INVALID_PATH' })
    assert.deepEqual(restarted.getOpenTabs(), [])
    assert.deepEqual(await readFile(externalPath), externalBefore)
  })
})

test('a default workspace redirected before New Project cannot create a file outside the workspace', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    await service.initialize()
    const workspace = await repository.workspaceById('uncategorized')
    const outside = path.join(dataRoot, 'outside')
    await mkdir(outside)
    await rename(workspace.directoryPath, `${workspace.directoryPath}.saved`)
    await symlink(outside, workspace.directoryPath)
    await assert.rejects(service.create({ height: 512, title: 'Outside attempt', width: 512 }), {
      // Destination validation now refuses before the Session can attempt a write.
      code: 'WORKSPACE_UNAVAILABLE',
    })
    assert.deepEqual(await readdir(outside), [])
  })
})

test('recovery cannot follow an indexed path swapped after shadow inspection', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const created = await service.create({ height: 512, title: 'Recover here', width: 512 })
    const indexedPath = (await repository.listProjects())[0].canonicalPath
    await service.setPrimaryBbox(created.id, { height: 512, width: 512, x: 15, y: 0 })
    await service.flushAutosave(created.id)
    const externalPath = path.join(dataRoot, 'external-recovery.igs')
    await ProjectSession.create(externalPath, 'External', {
      placeholdersDir,
      scratchDir: path.join(dataRoot, 'scratch'),
    })
    const externalBefore = await readFile(externalPath)
    let swapped = false
    class SwappingShadow extends ProjectShadowStore {
      override async inspect(input: Parameters<ProjectShadowStore['inspect']>[0]) {
        const inspection = await super.inspect(input)
        if (!swapped) {
          swapped = true
          await rename(indexedPath, `${indexedPath}.original`)
          await symlink(externalPath, indexedPath)
        }
        return inspection
      }
    }
    const restarted = new ProjectService({
      autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow: new SwappingShadow(path.join(dataRoot, 'autosave')),
    })
    await assert.rejects(restarted.resolveRecovery(created.id, 'recover'), {
      code: 'PROJECT_INVALID_PATH',
    })
    assert.deepEqual(restarted.getOpenTabs(), [])
    assert.deepEqual(await readFile(externalPath), externalBefore)
  })
})

test('a failed Project Save keeps the dirty tab and its valid recovery shadow', async () => {
  await withService(async ({ repository, service, shadow }) => {
    const created = await service.create({ height: 512, title: 'Uncommitted', width: 512 })
    const filePath = (await repository.listProjects())[0].canonicalPath
    await service.setPrimaryBbox(created.id, { height: 512, width: 512, x: 99, y: 0 })
    await service.flushAutosave(created.id)
    // A changed on-disk fingerprint forces the real Save compare-and-replace guard to reject.
    // The package bytes remain valid, so recovery can still be independently inspected.
    await utimes(filePath, new Date('2000-01-01T00:00:00Z'), new Date('2000-01-01T00:00:00Z'))
    await assert.rejects(service.save(created.id), { code: 'PROJECT_EXTERNAL_CHANGE' })
    assert.equal(service.getOpenTabs()[0].dirty, true)
    assert.equal((await readIgsPackage(filePath)).project.primaryBbox.x, 0)
    assert.equal(
      (
        await shadow.inspect({
          projectPath: filePath,
          savedPackage: await readIgsPackage(filePath),
        })
      ).status,
      'recoverable',
    )
  })
})

test('a post-create index failure preserves the new .igs for the next Home scan', async () => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'igs-service-index-'))
  const database = openAppDatabase(dataRoot, migrations)
  try {
    class FailingOnceIndex extends ProjectIndexRepository {
      private failed = false

      override async indexSaved(filePath: string, workspaceId: string) {
        if (!this.failed) {
          this.failed = true
          throw new Error('simulated derived index outage')
        }
        return await super.indexSaved(filePath, workspaceId)
      }
    }
    const repository = new FailingOnceIndex(database.db)
    const service = new ProjectService({
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow: new ProjectShadowStore(path.join(dataRoot, 'autosave')),
    })
    await assert.rejects(
      service.create({
        generationPayload: {
          prompt: { embeddingRefs: [], text: 'initialized before the index outage' },
          seed: { policy: 'fixed', value: 0 },
        },
        height: 512,
        title: 'Still on disk',
        width: 512,
      }),
      {
        code: 'PROJECT_CREATED_NOT_INDEXED',
      },
    )
    const workspace = await repository.workspaceById('uncategorized')
    const files = await readdir(workspace.directoryPath)
    assert.equal(files.length, 1)
    assert.equal(
      (await readIgsPackage(path.join(workspace.directoryPath, files[0]))).project.title,
      'Still on disk',
    )
    const survivingDocument = (await readIgsPackage(path.join(workspace.directoryPath, files[0])))
      .project
    assert.equal(
      survivingDocument.generationDraft.positivePrompt.text,
      'initialized before the index outage',
    )
    assert.deepEqual(survivingDocument.generationDraft.seed, { policy: 'fixed', value: 0 })
    const rediscovered = await service.list()
    assert.equal(rediscovered.length, 1)
    assert.equal(rediscovered[0].title, 'Still on disk')
  } finally {
    await database.close()
    await rm(dataRoot, { force: true, recursive: true })
  }
})

test('dirty close preserves the tab; explicit discard removes recovery and reopens saved state', async () => {
  await withService(async ({ repository, service, shadow }) => {
    const created = await service.create({ height: 512, title: 'Keep open', width: 512 })
    await service.setPrimaryBbox(created.id, { height: 512, width: 512, x: 40, y: 0 })
    await service.flushAutosave(created.id)
    await assert.rejects(service.close(created.id), { code: 'PROJECT_DIRTY' })
    assert.equal(service.getOpenTabs().length, 1)
    await service.discardAndClose(created.id)
    assert.deepEqual(service.getOpenTabs(), [])
    const savedPath = (await repository.listProjects())[0].canonicalPath
    assert.equal((await readIgsPackage(savedPath)).project.primaryBbox.x, 0)
    assert.equal(
      (
        await shadow.inspect({
          projectPath: savedPath,
          savedPackage: await readIgsPackage(savedPath),
        })
      ).status,
      'absent',
    )
    const reopened = await service.open(created.id)
    assert.equal(reopened.kind, 'opened')
    if (reopened.kind === 'opened') {
      assert.equal(reopened.tab.dirty, false)
      await service.close(created.id)
    }
  })
})

test('external .igs selection is inert until confirmed and Copy preserves portable document identity', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const externalDirectory = path.join(dataRoot, 'external')
    await mkdir(externalDirectory)
    const sourcePath = path.join(externalDirectory, 'Field Notes.igs')
    await ProjectSession.create(sourcePath, 'Field Notes', {
      placeholdersDir,
      scratchDir: path.join(dataRoot, 'scratch'),
    })
    const originalBytes = await readFile(sourcePath)
    const originalDocument = (await readIgsPackage(sourcePath)).project
    const canceled = await service.selectImport(sourcePath)
    assert.equal(canceled.kind, 'transfer-required')
    if (canceled.kind !== 'transfer-required') {
      return
    }
    assert.equal(canceled.title, 'Field Notes')
    const workspace = await repository.workspaceById('uncategorized')
    assert.deepEqual(await readdir(workspace.directoryPath), [])
    service.cancelImport(canceled.importId)
    await assert.rejects(service.finishImport(canceled.importId, 'move'), {
      code: 'PROJECT_IMPORT_SELECTION_MISSING',
    })
    assert.deepEqual(await readFile(sourcePath), originalBytes)
    assert.deepEqual(await readdir(workspace.directoryPath), [])

    const selected = await service.selectImport(sourcePath)
    assert.equal(selected.kind, 'transfer-required')
    if (selected.kind !== 'transfer-required') {
      return
    }
    const imported = await service.finishImport(selected.importId, 'copy')
    assert.equal(imported.result.kind, 'opened')
    assert.equal(imported.sourceRetained, true)
    assert.equal(imported.warning, undefined)
    assert.deepEqual(await readFile(sourcePath), originalBytes)
    const first = (await repository.listProjects())[0]
    assert.equal(path.basename(first.canonicalPath), 'Field Notes.igs')
    assert.equal(first.documentId, originalDocument.documentId)
    assert.notEqual(first.localProjectKey, selected.importId)
    assert.deepEqual(await readFile(first.canonicalPath), originalBytes)
    if (imported.result.kind === 'opened') {
      assert.equal(imported.result.tab.id, first.localProjectKey)
      await service.close(imported.result.tab.id)
    }

    // A second Copy cannot overwrite the already imported Project and gets its own recovery key.
    const secondSelection = await service.selectImport(sourcePath)
    assert.equal(secondSelection.kind, 'transfer-required')
    if (secondSelection.kind !== 'transfer-required') {
      return
    }
    const second = await service.finishImport(secondSelection.importId, 'copy')
    assert.equal(second.result.kind, 'opened')
    const rows = await repository.listProjects()
    assert.equal(rows.length, 2)
    assert.notEqual(rows[0].localProjectKey, rows[1].localProjectKey)
    assert.deepEqual(
      rows.map((row) => row.documentId),
      [originalDocument.documentId, originalDocument.documentId],
    )
    if (second.result.kind === 'opened') {
      await service.close(second.result.tab.id)
    }
  })
})

test('Move removes the selected source only after a valid imported .igs opens', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const externalDirectory = path.join(dataRoot, 'external')
    await mkdir(externalDirectory)
    const sourcePath = path.join(externalDirectory, 'Move Me.igs')
    await ProjectSession.create(sourcePath, 'Move Me', {
      placeholdersDir,
      scratchDir: path.join(dataRoot, 'scratch'),
    })
    const originalBytes = await readFile(sourcePath)
    const selected = await service.selectImport(sourcePath)
    assert.equal(selected.kind, 'transfer-required')
    if (selected.kind !== 'transfer-required') {
      return
    }
    const imported = await service.finishImport(selected.importId, 'move')
    assert.equal(imported.result.kind, 'opened')
    assert.equal(imported.sourceRetained, false)
    assert.equal(imported.warning, undefined)
    await assert.rejects(readFile(sourcePath), { code: 'ENOENT' })
    const row = (await repository.listProjects())[0]
    assert.deepEqual(await readFile(row.canonicalPath), originalBytes)
    if (imported.result.kind === 'opened') {
      await service.close(imported.result.tab.id)
    }
    const reopened = await service.open(row.localProjectKey)
    assert.equal(reopened.kind, 'opened')
    if (reopened.kind === 'opened') {
      await service.close(reopened.tab.id)
    }
  })
})

test('a changed selected source cannot be transferred and leaves the workspace untouched', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const sourcePath = path.join(dataRoot, 'Original.igs')
    await ProjectSession.create(sourcePath, 'Original', {
      placeholdersDir,
      scratchDir: path.join(dataRoot, 'scratch'),
    })
    const selected = await service.selectImport(sourcePath)
    assert.equal(selected.kind, 'transfer-required')
    if (selected.kind !== 'transfer-required') {
      return
    }
    await utimes(sourcePath, new Date('2000-01-01T00:00:00Z'), new Date('2000-01-01T00:00:00Z'))
    await assert.rejects(service.finishImport(selected.importId, 'move'), {
      code: 'PROJECT_IMPORT_SOURCE_CHANGED',
    })
    assert.equal((await readIgsPackage(sourcePath)).project.title, 'Original')
    assert.deepEqual(
      await readdir((await repository.workspaceById('uncategorized')).directoryPath),
      [],
    )
  })
})

test('Move keeps a source changed after destination publication and reports the duplicate', async () => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'igs-service-import-race-'))
  const database = openAppDatabase(dataRoot, migrations)
  try {
    const sourcePath = path.join(dataRoot, 'External.igs')
    await ProjectSession.create(sourcePath, 'External', {
      placeholdersDir,
      scratchDir: path.join(dataRoot, 'scratch'),
    })
    class ChangingSourceIndex extends ProjectIndexRepository {
      private changed = false

      override async indexSaved(filePath: string, workspaceId: string) {
        if (!this.changed) {
          this.changed = true
          await utimes(
            sourcePath,
            new Date('2000-01-01T00:00:00Z'),
            new Date('2000-01-01T00:00:00Z'),
          )
        }
        return await super.indexSaved(filePath, workspaceId)
      }
    }
    const repository = new ChangingSourceIndex(database.db)
    const service = new ProjectService({
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow: new ProjectShadowStore(path.join(dataRoot, 'autosave')),
    })
    const selected = await service.selectImport(sourcePath)
    assert.equal(selected.kind, 'transfer-required')
    if (selected.kind !== 'transfer-required') {
      return
    }
    const imported = await service.finishImport(selected.importId, 'move')
    assert.equal(imported.result.kind, 'opened')
    assert.equal(imported.sourceRetained, true)
    assert.match(imported.warning ?? '', /original file was kept/i)
    assert.equal((await readIgsPackage(sourcePath)).project.title, 'External')
    assert.equal((await repository.listProjects()).length, 1)
    if (imported.result.kind === 'opened') {
      await service.close(imported.result.tab.id)
    }
  } finally {
    await database.close()
    await rm(dataRoot, { force: true, recursive: true })
  }
})

test('failed source removal returns a retained-source warning after a valid destination commits', async () => {
  await withService(async ({ dataRoot, repository, shadow }) => {
    const sourcePath = path.join(dataRoot, 'External.igs')
    await ProjectSession.create(sourcePath, 'External', {
      placeholdersDir,
      scratchDir: path.join(dataRoot, 'scratch'),
    })
    const service = new ProjectService({
      dataRoot,
      removeImportedSource: async () => {
        throw new Error('simulated unlink failure')
      },
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow,
    })
    const selected = await service.selectImport(sourcePath)
    assert.equal(selected.kind, 'transfer-required')
    if (selected.kind !== 'transfer-required') {
      return
    }
    const imported = await service.finishImport(selected.importId, 'move')
    assert.equal(imported.result.kind, 'opened')
    assert.equal(imported.sourceRetained, true)
    assert.match(imported.warning ?? '', /original file was kept/i)
    assert.equal((await repository.listProjects()).length, 1)
    assert.equal((await readIgsPackage(sourcePath)).project.title, 'External')
    if (imported.result.kind === 'opened') {
      await service.close(imported.result.tab.id)
    }
  })
})

test('index failure after import publication keeps both valid files for Home rediscovery', async () => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'igs-service-import-index-'))
  const database = openAppDatabase(dataRoot, migrations)
  try {
    const sourcePath = path.join(dataRoot, 'External.igs')
    await ProjectSession.create(sourcePath, 'External', {
      placeholdersDir,
      scratchDir: path.join(dataRoot, 'scratch'),
    })
    const originalBytes = await readFile(sourcePath)
    class FailingImportIndex extends ProjectIndexRepository {
      private failed = false

      override async indexSaved(filePath: string, workspaceId: string) {
        if (!this.failed) {
          this.failed = true
          throw new Error('simulated index outage after copy')
        }
        return await super.indexSaved(filePath, workspaceId)
      }
    }
    const repository = new FailingImportIndex(database.db)
    const service = new ProjectService({
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow: new ProjectShadowStore(path.join(dataRoot, 'autosave')),
    })
    const selected = await service.selectImport(sourcePath)
    assert.equal(selected.kind, 'transfer-required')
    if (selected.kind !== 'transfer-required') {
      return
    }
    await assert.rejects(service.finishImport(selected.importId, 'move'), {
      code: 'PROJECT_IMPORTED_NOT_INDEXED',
    })
    assert.deepEqual(await readFile(sourcePath), originalBytes)
    assert.deepEqual(service.getOpenTabs(), [])
    const workspace = await repository.workspaceById('uncategorized')
    const files = await readdir(workspace.directoryPath)
    assert.deepEqual(files, ['External.igs'])
    assert.deepEqual(await readFile(path.join(workspace.directoryPath, files[0])), originalBytes)
    assert.equal((await service.list())[0].title, 'External')
  } finally {
    await database.close()
    await rm(dataRoot, { force: true, recursive: true })
  }
})

test('import rejects a symlinked file and a redirected workspace without publishing outside it', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const sourcePath = path.join(dataRoot, 'External.igs')
    await ProjectSession.create(sourcePath, 'External', {
      placeholdersDir,
      scratchDir: path.join(dataRoot, 'scratch'),
    })
    const linkedSource = path.join(dataRoot, 'Linked.igs')
    await symlink(sourcePath, linkedSource)
    await assert.rejects(service.selectImport(linkedSource), {
      code: 'PROJECT_IMPORT_INVALID_SOURCE',
    })
    const selected = await service.selectImport(sourcePath)
    assert.equal(selected.kind, 'transfer-required')
    if (selected.kind !== 'transfer-required') {
      return
    }
    const workspace = await repository.workspaceById('uncategorized')
    const elsewhere = path.join(dataRoot, 'elsewhere')
    await mkdir(elsewhere)
    await rename(workspace.directoryPath, `${workspace.directoryPath}.original`)
    await symlink(elsewhere, workspace.directoryPath)
    await assert.rejects(service.finishImport(selected.importId, 'copy'), {
      code: 'WORKSPACE_UNAVAILABLE',
    })
    assert.deepEqual(await readdir(elsewhere), [])
    assert.equal((await readIgsPackage(sourcePath)).project.title, 'External')
  })
})

test('Raster Layer commands persist top-first order and properties through shadow, Save and reopen', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const { filePath, layerIds, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    const original = await readIgsPackage(filePath)
    assert.deepEqual(
      original.project.layers.map((layer) => layer.id),
      layerIds,
    )
    assert.equal(original.manifest.preview.status, 'unavailable')

    // The public service boundary must change the open document, while the saved .igs stays put
    // until Save. Each property and the list order must survive the independent loader.
    await service.updateRasterLayer(tabId, layerIds[0], { kind: 'visibility', visible: false })
    await service.updateRasterLayer(tabId, layerIds[1], { kind: 'opacity', opacity: 0.4 })
    await service.updateRasterLayer(tabId, layerIds[1], {
      blendMode: 'multiply',
      kind: 'blend-mode',
    })
    const moved = await service.moveRasterLayer(tabId, layerIds[1], 0)
    assert.deepEqual(
      moved.layers.map((layer) => layer.id),
      [layerIds[1], layerIds[0]],
    )
    const locked = await service.updateRasterLayer(tabId, layerIds[1], {
      kind: 'lock',
      locked: true,
    })
    assert.equal(locked.dirty, true)
    assert.deepEqual(
      locked.layers.map(({ blendMode, locked, opacity, visible }) => ({
        blendMode,
        locked,
        opacity,
        visible,
      })),
      [
        { blendMode: 'multiply', locked: true, opacity: 0.4, visible: true },
        { blendMode: 'normal', locked: false, opacity: 1, visible: false },
      ],
    )
    await service.flushAutosave(tabId)
    assert.deepEqual((await readIgsPackage(filePath)).project.layers, original.project.layers)
    const recovery = await shadow.inspect({ projectPath: filePath, savedPackage: original })
    assert.equal(recovery.status, 'recoverable')
    if (recovery.status === 'recoverable') {
      assert.deepEqual(
        recovery.document.layers.map((layer) => layer.id),
        [layerIds[1], layerIds[0]],
      )
      assert.equal(recovery.document.layers[0].blendMode, 'multiply')
      assert.equal(recovery.document.layers[1].visible, false)
    }

    assert.equal((await service.save(tabId)).tab.dirty, false)
    const saved = await readIgsPackage(filePath)
    assert.deepEqual(
      saved.project.layers.map((layer) => layer.id),
      [layerIds[1], layerIds[0]],
    )
    assert.equal(saved.project.layers[0].opacity, 0.4)
    assert.equal(saved.project.layers[0].locked, true)
    assert.equal(saved.project.layers[1].visible, false)
    assert.equal(saved.manifest.preview.status, 'unavailable')
    for (const layer of saved.project.layers) {
      assert.deepEqual(await saved.readMember(requireRasterLayer(layer).asset.path), rasterPng)
    }
    await service.close(tabId)
    const reopened = await service.open(tabId)
    assert.equal(reopened.kind, 'opened')
    if (reopened.kind === 'opened') {
      assert.equal(reopened.tab.dirty, false)
      assert.deepEqual(
        reopened.tab.layers.map((layer) => layer.id),
        [layerIds[1], layerIds[0]],
      )
      assert.equal(reopened.tab.layers[0].blendMode, 'multiply')
      assert.equal(reopened.tab.layers[0].opacity, 0.4)
      assert.equal(reopened.tab.layers[0].locked, true)
      assert.equal(reopened.tab.layers[1].visible, false)
      await service.close(tabId)
    }
  })
})

test('editing an accepted Euler Raster Layer preserves immutable noise profile and provenance through service, shadow and Save', async () => {
  await withService(async ({ database, dataRoot, repository, service, shadow }) => {
    const originalOutput = await acceptedOutputPngFixture()
    const output = await acceptedOutputPngFixture(16, 16)
    const externalPath = path.join(dataRoot, 'Generated source.igs')
    const empty = createEmptyProjectDocumentV1({ title: 'Generated source' })
    const document = {
      ...empty,
      generationDraft: {
        ...empty.generationDraft,
        seed: { policy: 'fixed' as const, value: 913 },
      },
    }
    const layerId = randomUUID()
    const assetPath = `assets/layers/${layerId}.png`
    const bbox = { height: 8, width: 8, x: 13, y: -17 }
    const provenance = acceptedRasterProvenanceFixture(document, originalOutput, bbox)
    provenance.generationConfiguration.sampling.actualSeed = 0
    Object.assign(provenance.generationConfiguration.sampling, {
      invokeScheduler: 'euler',
      noiseProfile: {
        ...defaultIllustriousNoiseProfile(),
        rescaleBetasZeroSnr: true,
        timestepSpacing: 'trailing',
      },
      sampler: 'Euler',
      scheduler: 'Normal',
    })
    const placeholders = await readProjectPlaceholders(placeholdersDir, 'unavailable')
    await saveIgsPackage(externalPath, {
      assets: { [assetPath]: { bytes: output } },
      preview: { ...placeholders, rect: bbox, status: 'unavailable' },
      project: {
        ...document,
        layers: [
          {
            asset: {
              bytes: output.length,
              height: 16,
              path: assetPath,
              sha256: createHash('sha256').update(output).digest('hex'),
              width: 16,
            },
            blendMode: 'normal',
            generationProvenance: provenance,
            id: layerId,
            kind: 'raster',
            locked: false,
            name: 'Accepted image',
            opacity: 1,
            transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: bbox.x, y: bbox.y },
            visible: true,
          },
        ],
      },
    })

    const selected = await service.selectImport(externalPath)
    assert.equal(selected.kind, 'transfer-required')
    if (selected.kind !== 'transfer-required') {
      return
    }
    const imported = await service.finishImport(selected.importId, 'copy')
    assert.equal(imported.result.kind, 'opened')
    if (imported.result.kind !== 'opened') {
      return
    }
    const tabId = imported.result.tab.id
    const expectedHistory = [
      {
        acceptedAt: provenance.executionResultContext.acceptedAt,
        height: 8,
        imageUrl: requireRasterLayer(imported.result.tab.layers[0]).imageUrl,
        layerId,
        layerName: 'Accepted image',
        modelFileSha256: provenance.generationConfiguration.model.fileSha256,
        modelName: provenance.generationConfiguration.model.displayName,
        modelVersionName: provenance.generationConfiguration.model.versionName,
        seed: 0,
        width: 8,
      },
    ]
    assert.deepEqual(imported.result.tab.acceptedResults, expectedHistory)
    assert.ok(imported.result.tab.acceptedResults.every(isProjectAcceptedResultView))
    assert.equal(requireRasterLayer(imported.result.tab.layers[0]).width, 16)
    assert.equal(requireRasterLayer(imported.result.tab.layers[0]).height, 16)
    const [indexed] = await repository.listProjects()
    assert.ok(indexed)
    const savedBeforeEdit = await readIgsPackage(indexed.canonicalPath)
    assert.deepEqual(
      requireRasterLayer(savedBeforeEdit.project.layers[0]).generationProvenance,
      provenance,
    )
    const durableBeforeEdit = await repository.listSavedAcceptedResults(tabId)
    assert.equal(durableBeforeEdit.length, 1)
    assert.equal(durableBeforeEdit[0].actualSeed, 0)
    assert.deepEqual([durableBeforeEdit[0].outputWidth, durableBeforeEdit[0].outputHeight], [8, 8])
    assert.deepEqual([durableBeforeEdit[0].assetWidth, durableBeforeEdit[0].assetHeight], [16, 16])
    const globalBeforeEdit = await service.getAcceptedResultHistory()
    assert.ok(isAcceptedResultHistoryPage(globalBeforeEdit))
    assert.equal(globalBeforeEdit.totalCount, 1)
    assert.equal(globalBeforeEdit.nextCursor, null)
    const reference = globalBeforeEdit.items[0]
    assert.equal(reference.projectKey, tabId)
    assert.equal(reference.seed, 0)
    assert.equal(reference.imageUrl?.startsWith('igs-history://result/'), true)
    assert.deepEqual([reference.width, reference.height], [8, 8])
    for (const forbidden of [
      'canonicalPath',
      'assetPath',
      'fileFingerprint',
      'generationProvenance',
      'assetBytes',
    ]) {
      assert.equal(forbidden in reference, false)
    }
    const exactReference = {
      assetSha256: reference.assetSha256,
      documentId: reference.documentId,
      documentRevision: reference.documentRevision,
      layerId: reference.layerId,
      projectKey: reference.projectKey,
    }
    assert.equal(await service.reviewAcceptedResult(exactReference), true)
    assert.equal(acceptedHistoryLayerAvailable(imported.result.tab, exactReference), true)
    assert.equal(
      await service.reviewAcceptedResult({ ...exactReference, assetSha256: '0'.repeat(64) }),
      false,
    )
    await assert.rejects(service.reviewAcceptedResult(reference), /invalid/)

    const changed = await service.updateRasterLayer(tabId, layerId, {
      kind: 'opacity',
      opacity: 0.4,
    })
    assert.equal(changed.dirty, true)
    assert.deepEqual(await service.getAcceptedResultHistory(), globalBeforeEdit)
    assert.equal(await service.reviewAcceptedResult(exactReference), true)
    assert.equal(
      acceptedHistoryLayerAvailable(changed, exactReference),
      true,
      'dirty revision with unchanged accepted pixels remains navigable',
    )
    assert.deepEqual(changed.acceptedResults, [
      { ...expectedHistory[0], imageUrl: requireRasterLayer(changed.layers[0]).imageUrl },
    ])
    await service.flushAutosave(tabId)
    const recovery = await shadow.inspect({
      projectPath: indexed.canonicalPath,
      savedPackage: savedBeforeEdit,
    })
    assert.equal(recovery.status, 'recoverable')
    if (recovery.status === 'recoverable') {
      assert.deepEqual(
        requireRasterLayer(recovery.document.layers[0]).generationProvenance,
        provenance,
      )
      assert.equal(recovery.document.layers[0].opacity, 0.4)
    }
    assert.equal((await readIgsPackage(indexed.canonicalPath)).project.layers[0].opacity, 1)
    assert.deepEqual(await repository.listSavedAcceptedResults(tabId), durableBeforeEdit)

    // The source Save commits first; a failed derived insert must leave the prior Home+history
    // snapshot intact and surface a warning. A later real Home refresh repairs it from saved bytes.
    await sql`CREATE TRIGGER reject_service_saved_result BEFORE INSERT ON project_accepted_result_index
      BEGIN SELECT RAISE(ABORT, 'injected saved-history service failure'); END`.execute(database.db)
    const savedWithIndexWarning = await service.save(tabId)
    assert.equal(savedWithIndexWarning.committed, true)
    assert.equal(savedWithIndexWarning.tab.dirty, false)
    assert.match(savedWithIndexWarning.indexWarning ?? '', /saved.*accepted-result indexes/)
    assert.deepEqual(await repository.getProject(tabId), indexed)
    assert.deepEqual(await repository.listSavedAcceptedResults(tabId), durableBeforeEdit)
    const committedBeforeRefresh = await readIgsPackage(indexed.canonicalPath)
    assert.equal(
      await service.reviewAcceptedResult(exactReference),
      false,
      'stale indexed source is refused after committed Save',
    )
    assert.equal(committedBeforeRefresh.project.layers[0].opacity, 0.4)
    await sql`DROP TRIGGER reject_service_saved_result`.execute(database.db)
    await service.list()
    const repairedFromRefresh = await repository.listSavedAcceptedResults(tabId)
    assert.equal(repairedFromRefresh.length, 1)
    assert.equal(
      repairedFromRefresh[0].documentRevision,
      committedBeforeRefresh.project.documentRevision,
    )
    assert.equal(
      (await repository.getProject(tabId))?.documentRevision,
      committedBeforeRefresh.project.documentRevision,
    )
    assert.notEqual(repairedFromRefresh[0].fileFingerprint, durableBeforeEdit[0].fileFingerprint)
    const refreshedPage = await service.getAcceptedResultHistory()
    assert.ok(isAcceptedResultHistoryPage(refreshedPage))
    assert.notEqual(refreshedPage.items[0].documentRevision, exactReference.documentRevision)
    assert.equal(
      repairedFromRefresh[0].assetSha256,
      requireRasterLayer(savedBeforeEdit.project.layers[0]).asset.sha256,
    )

    assert.equal((await service.save(tabId)).committed, true)
    const saved = await readIgsPackage(indexed.canonicalPath)
    assert.equal(saved.project.layers[0].opacity, 0.4)
    assert.deepEqual(requireRasterLayer(saved.project.layers[0]).generationProvenance, provenance)
    assert.deepEqual(await saved.readMember(assetPath), output)
    const durableSaved = await repository.listSavedAcceptedResults(tabId)
    assert.equal(durableSaved.length, 1)
    assert.equal(durableSaved[0].documentRevision, saved.project.documentRevision)
    assert.equal(durableSaved[0].actualSeed, 0)
    assert.deepEqual(
      [
        durableSaved[0].outputWidth,
        durableSaved[0].outputHeight,
        durableSaved[0].assetWidth,
        durableSaved[0].assetHeight,
      ],
      [8, 8, 16, 16],
    )
    const undoAfterSave = await service.undo(tabId)
    assert.equal(undoAfterSave.dirty, true)
    assert.deepEqual(await repository.listSavedAcceptedResults(tabId), durableSaved)
    const redoAfterSave = await service.redo(tabId)
    assert.equal(redoAfterSave.dirty, false)
    assert.deepEqual(await repository.listSavedAcceptedResults(tabId), durableSaved)
    await service.close(tabId)
    const reopened = await service.open(tabId)
    assert.equal(reopened.kind, 'opened')
    if (reopened.kind === 'opened') {
      assert.deepEqual(reopened.tab.acceptedResults, [
        { ...expectedHistory[0], imageUrl: requireRasterLayer(reopened.tab.layers[0]).imageUrl },
      ])
    }
    assert.deepEqual(
      requireRasterLayer((await readIgsPackage(indexed.canonicalPath)).project.layers[0])
        .generationProvenance,
      provenance,
    )
  })
})

test('Raster Layer commands reject invalid or locked edits and preserve a clean document on no-op', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const { filePath, layerIds, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    const before = await readIgsPackage(filePath)
    const beforeTabs = service.getOpenTabs()
    assert.equal(
      (
        await service.updateRasterLayer(tabId, layerIds[0], {
          kind: 'visibility',
          visible: true,
        })
      ).dirty,
      false,
    )
    assert.equal((await service.moveRasterLayer(tabId, layerIds[0], 0)).dirty, false)

    await assert.rejects(
      service.updateRasterLayer(tabId, randomUUID(), { kind: 'visibility', visible: false }),
      { code: 'PROJECT_LAYER_NOT_FOUND' },
    )
    for (const opacity of [-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      await assert.rejects(
        service.updateRasterLayer(tabId, layerIds[0], { kind: 'opacity', opacity }),
        { code: 'PROJECT_INVALID_INPUT' },
      )
    }
    for (const index of [-1, 2, 0.5]) {
      await assert.rejects(service.moveRasterLayer(tabId, layerIds[0], index), {
        code: 'PROJECT_INVALID_INPUT',
      })
    }
    assert.deepEqual(service.getOpenTabs(), beforeTabs)
    await service.flushAutosave(tabId)
    assert.deepEqual((await readIgsPackage(filePath)).project, before.project)
    assert.notEqual(
      (await shadow.inspect({ projectPath: filePath, savedPackage: before })).status,
      'recoverable',
    )

    await service.updateRasterLayer(tabId, layerIds[0], { kind: 'lock', locked: true })
    await assert.rejects(
      service.updateRasterLayer(tabId, layerIds[0], { kind: 'opacity', opacity: 0.5 }),
      { code: 'PROJECT_LAYER_LOCKED' },
    )
    await assert.rejects(service.moveRasterLayer(tabId, layerIds[0], 1), {
      code: 'PROJECT_LAYER_LOCKED',
    })
    assert.equal(service.getOpenTabs()[0].layers[0].opacity, 1)
    assert.deepEqual(
      service.getOpenTabs()[0].layers.map((layer) => layer.id),
      layerIds,
    )
  })
})

test('rejected Project commands never mutate the attached document before revision-guarded commit', async () => {
  let rejectEdit = false
  await withService(
    async ({ dataRoot, repository, service }) => {
      const { layerIds, tabId } = await openTwoLayerProject(dataRoot, repository, service)
      const coordinator = service.getOpenDocumentForAcceptance(tabId)
      assert.ok(coordinator)
      const before = structuredClone(coordinator.document)
      rejectEdit = true

      await assert.rejects(service.moveRasterLayer(tabId, layerIds[1], 0), /injected edit failure/)
      await assert.rejects(
        service.updateRasterLayer(tabId, layerIds[0], { kind: 'visibility', visible: false }),
        /injected edit failure/,
      )
      await assert.rejects(
        service.updateGenerationDraft(tabId, { kind: 'seed', policy: 'fixed', value: 42 }),
        /injected edit failure/,
      )
      assert.deepEqual(coordinator.document, before)
      assert.equal(coordinator.canUndo, false)
    },
    {
      beforeEditCommit: async () => {
        if (rejectEdit) {
          throw new Error('injected edit failure')
        }
      },
    },
  )
})

test('Save marks an all-hidden or zero-opacity raster Project empty without dropping layer assets', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const { filePath, layerIds, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    await service.updateRasterLayer(tabId, layerIds[0], { kind: 'visibility', visible: false })
    await service.updateRasterLayer(tabId, layerIds[1], { kind: 'opacity', opacity: 0 })
    await service.save(tabId)
    const empty = await readIgsPackage(filePath)
    assert.equal(empty.manifest.preview.status, 'empty')
    assert.ok((await service.list())[0]?.thumbnailUrl?.startsWith('igs-preview://thumbnail/'))
    assert.equal(empty.manifest.preview.rect, null)
    assert.equal(empty.project.layers.length, 2)
    for (const layer of empty.project.layers) {
      assert.deepEqual(await empty.readMember(requireRasterLayer(layer).asset.path), rasterPng)
    }

    // One visible nonzero-opacity layer changes only the preview classification; pixels are still
    // saved intact when the worker is unavailable.
    await service.updateRasterLayer(tabId, layerIds[1], { kind: 'opacity', opacity: 0.01 })
    await service.save(tabId)
    const visible = await readIgsPackage(filePath)
    assert.equal(visible.manifest.preview.status, 'unavailable')
    assert.ok((await service.list())[0]?.thumbnailUrl?.startsWith('igs-preview://thumbnail/'))
    assert.deepEqual(visible.manifest.preview.rect, { height: 2, width: 2, x: 4, y: 0 })
    assert.deepEqual(
      await visible.readMember(requireRasterLayer(visible.project.layers[1]).asset.path),
      rasterPng,
    )
  })
})

test('Save commits the current Project with placeholder previews when composition fails', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const { filePath, layerIds, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    await service.updateRasterLayer(tabId, layerIds[0], { kind: 'opacity', opacity: 0.5 })
    let called = false
    const saved = await service.save(tabId, {
      composePreview: async () => {
        called = true
        throw new ProjectWorkerError('WORKER_EXITED', 'The image worker exited.')
      },
    })

    assert.equal(called, true)
    assert.equal(saved.committed, true)
    assert.equal(saved.tab.dirty, false)
    const packageAfterFailure = await readIgsPackage(filePath)
    assert.equal(packageAfterFailure.manifest.preview.status, 'unavailable')
    assert.equal(packageAfterFailure.project.layers[0].opacity, 0.5)
    for (const layer of packageAfterFailure.project.layers) {
      assert.deepEqual(
        await packageAfterFailure.readMember(requireRasterLayer(layer).asset.path),
        rasterPng,
      )
    }
    assert.equal(
      (await readdir(path.join(dataRoot, 'scratch'))).some((entry) =>
        entry.startsWith('project-preview-'),
      ),
      false,
      'failed composition must not retain a frozen preview staging directory',
    )
  })
})

test('Save cannot classify a newer Raster Layer edit from an older empty worker result', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const { filePath, layerIds, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    const saved = await service.save(tabId, {
      composePreview: async () => {
        await service.updateRasterLayer(tabId, layerIds[0], { kind: 'opacity', opacity: 0.5 })
        return { merged: null, rect: null, status: 'empty', thumbnail: null }
      },
    })

    assert.equal(saved.committed, true)
    assert.equal(saved.tab.dirty, false)
    const reopened = await readIgsPackage(filePath)
    assert.equal(reopened.project.layers[0].opacity, 0.5)
    assert.equal(reopened.manifest.preview.status, 'unavailable')
    assert.deepEqual(
      await reopened.readMember(requireRasterLayer(reopened.project.layers[0]).asset.path),
      rasterPng,
    )
  })
})

test('Rebuild Preview repairs a closed Project through the real package and index without changing document or assets', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const { filePath, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    await service.close(tabId)
    const before = await readIgsPackage(filePath)
    const documentBytes = await before.readMember('project.json')
    const assetBytes = await Promise.all(
      before.project.layers.map((layer) => before.readMember(requireRasterLayer(layer).asset.path)),
    )
    const beforeIndex = (await repository.listProjects())[0]
    assert.equal(before.manifest.preview.status, 'unavailable')

    const rebuilt = await service.rebuildPreview(tabId, previewWorker())
    assert.equal(rebuilt.committed, true)
    assert.equal(rebuilt.indexWarning, undefined)
    const after = await readIgsPackage(filePath)
    assert.equal(after.manifest.preview.status, 'rendered')
    assert.deepEqual(after.manifest.preview.rect, { height: 2, width: 2, x: 0, y: 0 })
    assert.deepEqual(await after.readMember('preview/merged.png'), rasterPng)
    assert.deepEqual(await after.readMember('preview/thumbnail.webp'), previewWebp)
    assert.deepEqual(after.project, before.project)
    assert.deepEqual(await after.readMember('project.json'), documentBytes)
    for (const [index, layer] of after.project.layers.entries()) {
      assert.deepEqual(
        await after.readMember(requireRasterLayer(layer).asset.path),
        assetBytes[index],
      )
    }
    const indexed = (await repository.listProjects())[0]
    assert.equal(indexed.previewStatus, 'rendered')
    assert.equal(indexed.thumbnailSha256, createHash('sha256').update(previewWebp).digest('hex'))
    assert.notEqual(indexed.thumbnailSha256, beforeIndex.thumbnailSha256)
    const home = (await service.list())[0]
    assert.equal(home.previewStatus, 'rendered')
    assert.ok(home.thumbnailUrl?.startsWith('igs-preview://thumbnail/'))
    assert.deepEqual(service.getOpenTabs(), [])
  })
})

test('Rebuild Preview keeps a clean open tab usable for a later edit and Save', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const { filePath, layerIds, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    const before = service.getOpenTabs()[0]
    const revision = (await readIgsPackage(filePath)).project.documentRevision
    const rebuilt = await service.rebuildPreview(tabId, previewWorker())
    assert.equal(rebuilt.committed, true)
    assert.deepEqual(service.getOpenTabs(), [before])
    const previewed = await readIgsPackage(filePath)
    assert.equal(previewed.project.documentRevision, revision)
    assert.equal(previewed.manifest.preview.status, 'rendered')

    await service.updateRasterLayer(tabId, layerIds[0], { kind: 'opacity', opacity: 0.4 })
    const saved = await service.save(tabId)
    assert.equal(saved.committed, true)
    assert.equal(saved.tab.dirty, false)
    const after = await readIgsPackage(filePath)
    assert.equal(after.project.layers[0].opacity, 0.4)
    assert.deepEqual(
      await after.readMember(requireRasterLayer(after.project.layers[0]).asset.path),
      rasterPng,
    )
    assert.equal((await repository.listProjects())[0].previewStatus, 'unavailable')
  })
})

test('Save and a second rebuild cannot replace a Project while its preview worker is running', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const { filePath, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    const oldPackage = await readFile(filePath)
    let signalStarted: () => void = () => undefined
    let releaseWorker: () => void = () => undefined
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve
    })
    const held = new Promise<void>((resolve) => {
      releaseWorker = resolve
    })
    const rebuilding = service.rebuildPreview(
      tabId,
      previewWorker(async () => {
        signalStarted()
        await held
      }),
    )
    try {
      await started
      await assert.rejects(service.save(tabId), { code: 'PROJECT_REBUILD_IN_PROGRESS' })
      await assert.rejects(service.rebuildPreview(tabId, previewWorker()), {
        code: 'PROJECT_REBUILD_IN_PROGRESS',
      })
      assert.deepEqual(await readFile(filePath), oldPackage)
    } finally {
      releaseWorker()
    }
    await rebuilding
    assert.equal((await readIgsPackage(filePath)).manifest.preview.status, 'rendered')
    assert.equal((await service.save(tabId)).committed, true)
  })
})

test('Rebuild Preview refuses a dirty Project before worker composition and preserves its recovery', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const { filePath, layerIds, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    const before = await readFile(filePath)
    await service.updateRasterLayer(tabId, layerIds[0], { kind: 'opacity', opacity: 0.4 })
    await service.flushAutosave(tabId)
    let composed = false
    await assert.rejects(
      service.rebuildPreview(tabId, {
        composePreview: async () => {
          composed = true
          throw new Error('A dirty Project must never reach the worker.')
        },
      }),
      { code: 'PROJECT_DIRTY' },
    )
    assert.equal(composed, false)
    assert.deepEqual(await readFile(filePath), before)
    assert.equal(service.getOpenTabs()[0].dirty, true)
    assert.equal(
      (
        await shadow.inspect({
          projectPath: filePath,
          savedPackage: await readIgsPackage(filePath),
        })
      ).status,
      'recoverable',
    )
  })
})

test('Rebuild Preview rejects pending recovery after a restart without asking the worker or replacing .igs', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const { filePath, layerIds, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    await service.updateRasterLayer(tabId, layerIds[0], { kind: 'opacity', opacity: 0.4 })
    await service.flushAutosave(tabId)
    const before = await readFile(filePath)
    const restarted = new ProjectService({
      autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow,
    })
    assert.equal((await restarted.list())[0].recoveryStatus, 'recoverable')
    let composed = false
    await assert.rejects(
      restarted.rebuildPreview(tabId, {
        composePreview: async () => {
          composed = true
          throw new Error('Recovery must block composition.')
        },
      }),
      { code: 'PROJECT_RECOVERY_REQUIRED' },
    )
    assert.equal(composed, false)
    assert.deepEqual(await readFile(filePath), before)
    assert.equal(
      (
        await shadow.inspect({
          projectPath: filePath,
          savedPackage: await readIgsPackage(filePath),
        })
      ).status,
      'recoverable',
    )
  })
})

test('Rebuild Preview worker failure leaves a closed Project and Home index unchanged', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const { filePath, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    await service.close(tabId)
    const before = await readFile(filePath)
    const indexBefore = (await repository.listProjects())[0]
    let composed = false
    await assert.rejects(
      service.rebuildPreview(tabId, {
        composePreview: async () => {
          composed = true
          throw new ProjectWorkerError('WORKER_EXITED', 'The preview worker exited.')
        },
      }),
      { code: 'WORKER_EXITED' },
    )
    assert.equal(composed, true)
    assert.deepEqual(await readFile(filePath), before)
    const after = await readIgsPackage(filePath)
    assert.equal(after.manifest.preview.status, 'unavailable')
    const indexAfter = (await repository.listProjects())[0]
    assert.equal(indexAfter.previewStatus, indexBefore.previewStatus)
    assert.equal(indexAfter.thumbnailSha256, indexBefore.thumbnailSha256)
    assert.equal(
      (await readdir(path.join(dataRoot, 'scratch'))).some((entry) =>
        entry.startsWith('project-preview-'),
      ),
      false,
    )
  })
})

test('Rebuild Preview cannot commit a worker result after a newer Project edit', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const { filePath, layerIds, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    const before = await readFile(filePath)
    await assert.rejects(
      service.rebuildPreview(
        tabId,
        previewWorker(async () => {
          await service.updateRasterLayer(tabId, layerIds[0], { kind: 'opacity', opacity: 0.4 })
        }),
      ),
      { code: 'PROJECT_DIRTY' },
    )
    assert.deepEqual(await readFile(filePath), before)
    assert.equal(service.getOpenTabs()[0].dirty, true)
    assert.equal(service.getOpenTabs()[0].layers[0].opacity, 0.4)
    await service.flushAutosave(tabId)
    assert.equal(
      (
        await shadow.inspect({
          projectPath: filePath,
          savedPackage: await readIgsPackage(filePath),
        })
      ).status,
      'recoverable',
    )
  })
})

test('Project image import adds a top layer at the bbox origin, exposes staged pixels, and survives recovery and Save', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const { filePath, layerIds, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    const bbox = { height: 512, width: 640, x: -40, y: 27 }
    await service.setPrimaryBbox(tabId, bbox)
    await service.save(tabId)
    const before = await readFile(filePath)
    const selectedFile = path.join(dataRoot, '  Foreground \n pass  .png')
    await writeFile(selectedFile, rasterPng)

    const imported = await service.importRasterImage(tabId, selectedFile, rasterImportWorker())
    assert.equal(imported.dirty, true)
    assert.deepEqual(imported.primaryBbox, bbox)
    assert.equal(imported.layers.length, 3)
    assert.deepEqual(
      imported.layers.slice(1).map((layer) => layer.id),
      layerIds,
    )
    const top = imported.layers[0]
    assert.equal(top.name, 'Foreground pass')
    assert.deepEqual(requireRasterLayer(top).transform, {
      rotationDegrees: 0,
      scaleX: 1,
      scaleY: 1,
      x: bbox.x,
      y: bbox.y,
    })
    assert.deepEqual(await readFile(filePath), before, 'import must not replace the saved package')
    const imageRequest = parseProjectLayerImageUrl(requireRasterLayer(top).imageUrl)
    assert.ok(imageRequest)
    const staged = service.getLayerAsset(imageRequest)
    assert.equal(staged?.kind, 'staged')
    if (staged?.kind !== 'staged') {
      throw new Error('Newly imported image has no coordinator-owned staged asset')
    }
    const response = await streamStagedProjectLayer(
      staged.source,
      staged.member,
      path.join(dataRoot, 'layer-responses'),
    )
    assert.equal(response.status, 200)
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), rasterPng)
    assert.equal(
      (await readdir(path.join(dataRoot, 'scratch'))).some((entry) =>
        entry.startsWith('raster-import-'),
      ),
      false,
      'source preparation must be disposed after coordinator adoption',
    )

    await service.flushAutosave(tabId)
    const savedBeforeCommit = await readIgsPackage(filePath)
    assert.equal(savedBeforeCommit.project.layers.length, 2)
    const recovery = await shadow.inspect({
      projectPath: filePath,
      savedPackage: savedBeforeCommit,
    })
    assert.equal(recovery.status, 'recoverable')
    if (recovery.status === 'recoverable') {
      assert.equal(recovery.document.layers[0].id, top.id)
      const pending = recovery.dirtyAssets[staged.member.path]
      assert.ok(pending && 'sourcePath' in pending)
      assert.deepEqual(await readFile(pending.sourcePath), rasterPng)
    }

    const committed = await service.save(tabId)
    assert.equal(committed.tab.dirty, false)
    const saved = await readIgsPackage(filePath)
    assert.deepEqual(saved.project.primaryBbox, bbox)
    assert.deepEqual(
      saved.project.layers.map((layer) => layer.id),
      [top.id, ...layerIds],
    )
    assert.deepEqual(await saved.readMember(staged.member.path), rasterPng)
    assert.equal(saved.manifest.preview.status, 'unavailable')
    assert.equal(service.getLayerAsset(imageRequest)?.kind, 'saved')
    await service.close(tabId)
    const reopened = await service.open(tabId)
    assert.equal(reopened.kind, 'opened')
    if (reopened.kind === 'opened') {
      assert.equal(reopened.tab.dirty, false)
      assert.deepEqual(
        reopened.tab.layers.map((layer) => layer.id),
        [top.id, ...layerIds],
      )
      assert.deepEqual(reopened.tab.primaryBbox, bbox)
      await service.close(tabId)
    }
  })
})

test('Project image import rejects a changed Project without overwriting its newer edit', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const created = await service.create({ height: 512, title: 'Import race', width: 512 })
    const filePath = (await repository.listProjects())[0].canonicalPath
    const savedBytes = await readFile(filePath)
    const selectedFile = path.join(dataRoot, 'late.png')
    await writeFile(selectedFile, rasterPng)
    const newerBbox = { height: 512, width: 512, x: 80, y: -18 }
    const worker = rasterImportWorker()
    await assert.rejects(
      service.importRasterImage(created.id, selectedFile, {
        normalizeImport: async (input) => {
          await service.setPrimaryBbox(created.id, newerBbox)
          return worker.normalizeImport(input)
        },
      }),
      { code: 'IMPORT_PROJECT_CHANGED' },
    )
    assert.deepEqual(service.getOpenTabs()[0].primaryBbox, newerBbox)
    assert.deepEqual(service.getOpenTabs()[0].layers, [])
    assert.deepEqual(await readFile(filePath), savedBytes)
    assert.equal(
      (await readdir(path.join(dataRoot, 'scratch'))).some((entry) =>
        entry.startsWith('raster-import-'),
      ),
      false,
    )
    await service.flushAutosave(created.id)
    const recovery = await shadow.inspect({
      projectPath: filePath,
      savedPackage: await readIgsPackage(filePath),
    })
    assert.equal(recovery.status, 'recoverable')
    if (recovery.status === 'recoverable') {
      assert.deepEqual(recovery.document.primaryBbox, newerBbox)
      assert.deepEqual(recovery.document.layers, [])
    }
  })
})

test('Project image import refuses an unsafe source or worker failure without dirtying the file', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const created = await service.create({ height: 512, title: 'Import failure', width: 512 })
    const filePath = (await repository.listProjects())[0].canonicalPath
    const savedBytes = await readFile(filePath)
    const selectedFile = path.join(dataRoot, 'selected.png')
    const symlinkedFile = path.join(dataRoot, 'selected-link.png')
    await writeFile(selectedFile, rasterPng)
    await symlink(selectedFile, symlinkedFile)
    let workerCalled = false
    await assert.rejects(
      service.importRasterImage(created.id, symlinkedFile, {
        normalizeImport: async () => {
          workerCalled = true
          throw new Error('unsafe path reached worker')
        },
      }),
      { code: 'IMPORT_SOURCE_UNAVAILABLE' },
    )
    assert.equal(workerCalled, false)
    await assert.rejects(
      service.importRasterImage(created.id, selectedFile, {
        normalizeImport: async () => {
          throw new ProjectWorkerError('WORKER_EXITED', 'The image worker exited.')
        },
      }),
      { code: 'WORKER_EXITED' },
    )
    assert.deepEqual(service.getOpenTabs()[0].layers, [])
    assert.equal(service.getOpenTabs()[0].dirty, false)
    assert.deepEqual(await readFile(filePath), savedBytes)
    assert.equal(
      (await readdir(path.join(dataRoot, 'scratch'))).some((entry) =>
        entry.startsWith('raster-import-'),
      ),
      false,
    )
    await assert.rejects(
      service.importRasterImage(`project-v1-${'0'.repeat(64)}`, selectedFile, rasterImportWorker()),
      { code: 'PROJECT_NOT_OPEN' },
    )
  })
})

test('exact LoRA stack edits preserve prompts through autosave recovery, Save, reopen and removal', async () => {
  await withService(
    async ({ dataRoot, modelRepository, modelService, repository, service, shadow }) => {
      const publish = async (modelId: number, versionId: number) => {
        const bytes = Buffer.from(`LoRA ${modelId}/${versionId}`)
        const managedPath = path.join(dataRoot, `lora-${versionId}.safetensors`)
        await writeFile(managedPath, bytes)
        const sha256 = createHash('sha256').update(bytes).digest('hex')
        const ids = await modelRepository.publishVerifiedInstallation({
          primary: {
            file: {
              managedPath,
              originalFilename: path.basename(managedPath),
              sha256,
              sizeBytes: bytes.length,
              verifiedAt: new Date().toISOString(),
            },
            resource: {
              displayName: `LoRA ${modelId}`,
              source: { kind: 'civitai', modelId },
              sourceMetadata: {},
              type: 'lora',
            },
            version: {
              baseModelFamily: 'illustrious',
              format: 'SafeTensor',
              name: `v${versionId}`,
              source: {
                expectedSha256: sha256,
                fileId: versionId + 1000,
                kind: 'civitai',
                versionId,
              },
              sourceMetadata: {},
            },
          },
        })
        return {
          ids: { resourceId: ids.resourceId, versionId: ids.versionId },
          managedPath,
          ref: await modelService.resolveGenerationLora(ids.resourceId, ids.versionId),
        }
      }
      const first = await publish(51, 51)
      const anotherVersion = await publish(51, 52)
      const neighbor = await publish(53, 53)
      const created = await service.create({ height: 512, title: 'LoRA persistence', width: 512 })
      const savedPath = (await repository.listProjects())[0].canonicalPath
      await service.updateGenerationDraft(created.id, {
        kind: 'positive-prompt',
        text: 'trigger phrase, portrait',
      })
      const baseline = await service.updateGenerationDraft(created.id, {
        kind: 'negative-prompt',
        text: 'trigger phrase, blur',
      })
      await service.addGenerationLora(created.id, first.ref)
      await service.addGenerationLora(created.id, neighbor.ref)
      await assert.rejects(service.addGenerationLora(created.id, anotherVersion.ref), {
        code: 'PROJECT_INVALID_INPUT',
      })
      await assert.rejects(
        service.addGenerationLora(created.id, { ...first.ref, kind: 'checkpoint' }),
        { code: 'PROJECT_INVALID_INPUT' },
      )
      let acknowledged = service.getOpenTabs().find((tab) => tab.id === created.id)!
      let release: (() => void) | undefined
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      let firstSend = true
      const sync = new ProjectDraftSync({
        onAcknowledged: (tab) => {
          acknowledged = tab
        },
        onError: (error) => {
          assert.fail(String(error))
        },
        onOverlay: () => {},
        send: async (id, change) => {
          if (firstSend) {
            firstSend = false
            await gate
          }
          return service.updateGenerationDraft(id, change)
        },
      })
      sync.change(acknowledged, { kind: 'lora-weight', ...first.ids, value: 0.25 })
      sync.change(acknowledged, { kind: 'lora-weight', ...neighbor.ids, value: 0.9 })
      sync.change(acknowledged, { kind: 'lora-weight', ...first.ids, value: 0.45 })
      sync.change(acknowledged, { kind: 'lora-enabled', ...first.ids, value: false })
      const flushed = sync.flush(created.id)
      release?.()
      await flushed
      assert.deepEqual(
        acknowledged.generationDraft.loras.map(({ enabled, weight }) => ({ enabled, weight })),
        [
          { enabled: false, weight: 0.45 },
          { enabled: true, weight: 0.9 },
        ],
      )
      await service.updateGenerationDraft(created.id, {
        kind: 'lora-weight',
        ...neighbor.ids,
        value: 0.7,
      })
      const weightChange = { kind: 'lora-weight' as const, ...first.ids, value: -0.35 }
      assert.equal(isProjectGenerationDraftChange(weightChange), true)
      for (const invalid of [
        { ...weightChange, value: NaN },
        { ...weightChange, value: Infinity },
        { ...weightChange, resource: first.ref },
        { ...weightChange, value: '0.3' },
        { ...weightChange, resourceId: '' },
      ]) {
        assert.equal(isProjectGenerationDraftChange(invalid), false)
        await assert.rejects(
          service.updateGenerationDraft(created.id, invalid as typeof weightChange),
          { code: 'PROJECT_INVALID_INPUT' },
        )
      }
      await service.updateGenerationDraft(created.id, weightChange)
      const changed = await service.updateGenerationDraft(created.id, {
        kind: 'lora-enabled',
        ...first.ids,
        value: false,
      })
      assert.deepEqual(changed.generationDraft.loras, [
        { enabled: false, resource: first.ref, weight: -0.35 },
        { enabled: true, resource: neighbor.ref, weight: 0.7 },
      ])
      assert.deepEqual(
        changed.generationDraft.positivePrompt,
        baseline.generationDraft.positivePrompt,
      )
      assert.deepEqual(
        changed.generationDraft.negativePrompt,
        baseline.generationDraft.negativePrompt,
      )
      await modelRepository.setDefaultVersion(first.ids.resourceId, anotherVersion.ids.versionId)
      await service.flushAutosave(created.id)
      assert.deepEqual((await readIgsPackage(savedPath)).project.generationDraft.loras, [])
      const restarted = new ProjectService({
        autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
        dataRoot,
        repository,
        roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
        shadow,
      })
      assert.equal((await restarted.open(created.id)).kind, 'recovery-required')
      const recovered = await restarted.resolveRecovery(created.id, 'recover')
      assert.deepEqual(recovered.generationDraft, changed.generationDraft)
      await restarted.save(created.id)
      const saved = await readIgsPackage(savedPath)
      assert.deepEqual(saved.project.generationDraft, changed.generationDraft)
      // Repeating the same value is a genuine no-op (no new dirty revision).
      assert.equal((await restarted.updateGenerationDraft(created.id, weightChange)).dirty, false)
      await restarted.close(created.id)
      await rm(first.managedPath)
      const reopened = await restarted.open(created.id)
      assert.equal(reopened.kind, 'opened')
      if (reopened.kind !== 'opened') {
        throw new Error('LoRA project did not reopen')
      }
      assert.deepEqual(reopened.tab.generationDraft, changed.generationDraft)
      await assert.rejects(
        restarted.updateGenerationDraft(created.id, {
          ...weightChange,
          versionId: anotherVersion.ids.versionId,
        }),
        { code: 'PROJECT_INVALID_INPUT' },
      )
      const removed = await restarted.removeGenerationLora(created.id, first.ids)
      assert.deepEqual(removed.generationDraft.loras, [
        { enabled: true, resource: neighbor.ref, weight: 0.7 },
      ])
      assert.deepEqual(
        removed.generationDraft.positivePrompt,
        baseline.generationDraft.positivePrompt,
      )
      assert.deepEqual(
        removed.generationDraft.negativePrompt,
        baseline.generationDraft.negativePrompt,
      )
      await assert.rejects(restarted.removeGenerationLora(created.id, first.ids), {
        code: 'PROJECT_INVALID_INPUT',
      })
      await restarted.save(created.id)
      assert.deepEqual(
        (await readIgsPackage(savedPath)).project.generationDraft,
        removed.generationDraft,
      )
      await restarted.close(created.id)
    },
  )
})

test('portable LoRA relink across two libraries changes only local IDs through recovery and Save', async () => {
  const bytes = Buffer.from('exact portable LoRA bytes')
  await withService(async (origin) => {
    const installed = await publishPortableResource(
      origin.modelRepository,
      origin.dataRoot,
      bytes,
      'Original LoRA',
      'epsilon',
      'lora',
    )
    const neighborInstalled = await publishPortableResource(
      origin.modelRepository,
      origin.dataRoot,
      Buffer.from('neighbor LoRA'),
      'Neighbor',
      'epsilon',
      'lora',
      931,
    )
    const originalRef = await origin.modelService.resolveGenerationLora(
      installed.resourceId,
      installed.versionId,
    )
    const neighbor = await origin.modelService.resolveGenerationLora(
      neighborInstalled.resourceId,
      neighborInstalled.versionId,
    )
    const identity = { resourceId: originalRef.localModelId, versionId: originalRef.localVersionId }
    const created = await origin.service.create({ height: 512, title: 'Portable LoRA', width: 512 })
    await origin.service.addGenerationLora(created.id, originalRef)
    await origin.service.addGenerationLora(created.id, neighbor)
    await origin.service.updateGenerationDraft(created.id, {
      ...identity,
      kind: 'lora-weight',
      value: -0.35,
    })
    await origin.service.updateGenerationDraft(created.id, {
      ...identity,
      kind: 'lora-enabled',
      value: false,
    })
    await origin.service.updateGenerationDraft(created.id, {
      kind: 'positive-prompt',
      text: 'original LoRA trigger, portrait',
    })
    const baseline = await origin.service.updateGenerationDraft(created.id, {
      kind: 'negative-prompt',
      text: 'original LoRA trigger, blur',
    })
    await origin.service.save(created.id)
    const sourcePath = (await origin.repository.listProjects())[0].canonicalPath
    const sourceBytes = await readFile(sourcePath)
    await origin.service.close(created.id)

    await withService(async (destination) => {
      const local = await publishPortableResource(
        destination.modelRepository,
        destination.dataRoot,
        bytes,
        'Renamed at destination',
        'v_prediction',
        'lora',
      )
      const incomingPath = path.join(destination.dataRoot, 'Incoming LoRA.igs')
      await writeFile(incomingPath, sourceBytes)
      const importChoice = await destination.service.selectImport(incomingPath)
      assert.equal(importChoice.kind, 'transfer-required')
      if (importChoice.kind !== 'transfer-required') {
        throw new Error('Expected portable import')
      }
      const imported = await destination.service.finishImport(importChoice.importId, 'copy')
      assert.equal(imported.result.kind, 'opened')
      if (imported.result.kind !== 'opened') {
        throw new Error('Expected open Project')
      }
      const tabId = imported.result.tab.id
      const savedPath = (await destination.repository.listProjects())[0].canonicalPath
      assert.notEqual(local.resourceId, identity.resourceId)
      assert.notEqual(local.versionId, identity.versionId)
      assert.deepEqual(imported.result.tab.generationDraft, baseline.generationDraft)
      const initialCopy = await readFile(savedPath)
      assert.equal(imported.result.tab.dirty, false)
      const resolvedLocal = await destination.modelService.resolveGenerationLora(
        local.resourceId,
        local.versionId,
      )
      await assert.rejects(destination.service.addGenerationLora(tabId, resolvedLocal), {
        code: 'PROJECT_INVALID_INPUT',
      })
      await assert.rejects(
        destination.service.relinkGenerationLora(tabId, identity, async (saved) => ({
          ...(await destination.modelService.resolvePortableGenerationLora(saved)),
          civitaiFileId: 9999,
        })),
        { code: 'PROJECT_LORA_RELINK_MISMATCH' },
      )
      assert.equal(destination.service.getOpenTabs()[0].dirty, false)

      const linked = await destination.service.relinkGenerationLora(
        tabId,
        identity,
        async (saved) => ({
          ...(await destination.modelService.resolvePortableGenerationLora(saved)),
          displayName: 'Must not replace saved name',
          predictionType: 'sample',
          versionName: 'Must not replace version',
        }),
      )
      const expected = {
        ...baseline.generationDraft,
        loras: baseline.generationDraft.loras.map((entry, index) =>
          index === 0
            ? {
                ...entry,
                resource: {
                  ...entry.resource,
                  localModelId: local.resourceId,
                  localVersionId: local.versionId,
                },
              }
            : entry,
        ),
      }
      assert.equal(linked.dirty, true)
      assert.deepEqual(linked.generationDraft, expected)
      await destination.service.flushAutosave(tabId)
      assert.deepEqual(await readFile(savedPath), initialCopy)
      const restarted = new ProjectService({
        autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
        dataRoot: destination.dataRoot,
        repository: destination.repository,
        roots: { placeholdersDir, scratchDir: path.join(destination.dataRoot, 'scratch') },
        shadow: destination.shadow,
      })
      assert.equal((await restarted.open(tabId)).kind, 'recovery-required')
      assert.deepEqual(
        (await restarted.resolveRecovery(tabId, 'recover')).generationDraft,
        expected,
      )
      await restarted.save(tabId)
      assert.deepEqual((await readIgsPackage(savedPath)).project.generationDraft, expected)
      await restarted.close(tabId)
      const reopened = await restarted.open(tabId)
      assert.equal(reopened.kind, 'opened')
      if (reopened.kind !== 'opened') {
        throw new Error('Expected saved Project')
      }
      assert.deepEqual(reopened.tab.generationDraft, expected)
      assert.equal(
        (
          await restarted.relinkGenerationLora(
            tabId,
            { resourceId: local.resourceId, versionId: local.versionId },
            (saved) => destination.modelService.resolvePortableGenerationLora(saved),
          )
        ).dirty,
        false,
      )
      await assert.rejects(
        restarted.relinkGenerationLora(tabId, identity, (saved) =>
          destination.modelService.resolvePortableGenerationLora(saved),
        ),
        { code: 'PROJECT_INVALID_INPUT' },
      )
      assert.deepEqual(await readFile(incomingPath), sourceBytes)
      await restarted.close(tabId)
    })
  })
})

for (const concurrentAction of ['edit', 'remove', 'close-reopen'] as const) {
  test(`LoRA relink rejects completion after ${concurrentAction}, including a no-op match`, async () => {
    await withService(async ({ dataRoot, modelRepository, modelService, service }) => {
      const installed = await publishPortableResource(
        modelRepository,
        dataRoot,
        Buffer.from('LoRA for late relink'),
        'LoRA',
        'epsilon',
        'lora',
      )
      const resource = await modelService.resolveGenerationLora(
        installed.resourceId,
        installed.versionId,
      )
      const identity = { resourceId: resource.localModelId, versionId: resource.localVersionId }
      const created = await service.create({ height: 512, title: 'Late relink', width: 512 })
      await service.addGenerationLora(created.id, resource)
      await service.save(created.id)
      let release!: () => void
      let signalStarted!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const started = new Promise<void>((resolve) => {
        signalStarted = resolve
      })
      const linking = service.relinkGenerationLora(created.id, identity, async (saved) => {
        signalStarted()
        await gate
        return modelService.resolvePortableGenerationLora(saved)
      })
      await started
      if (concurrentAction === 'edit') {
        await service.updateGenerationDraft(created.id, {
          ...identity,
          kind: 'lora-weight',
          value: 0.25,
        })
      } else if (concurrentAction === 'remove') {
        await service.removeGenerationLora(created.id, identity)
      } else {
        await service.close(created.id)
        assert.equal((await service.open(created.id)).kind, 'opened')
      }
      const beforeCompletion = service.getOpenTabs()[0]
      release()
      await assert.rejects(linking, { code: 'EDIT_CONFLICT' })
      assert.deepEqual(service.getOpenTabs()[0], beforeCompletion)
      await service.save(created.id)
      await service.close(created.id)
    })
  })
}

test('LoRA relink refuses an existing portable duplicate without merging rows or dirtying the document', async () => {
  await withService(async ({ dataRoot, modelRepository, modelService, service }) => {
    const local = await publishPortableResource(
      modelRepository,
      dataRoot,
      Buffer.from('duplicate LoRA'),
      'Local name',
      'epsilon',
      'lora',
    )
    const ref = await modelService.resolveGenerationLora(local.resourceId, local.versionId)
    const copied = {
      ...ref,
      displayName: 'Copied name',
      localModelId: randomUUID(),
      localVersionId: randomUUID(),
    }
    const document = createEmptyProjectDocumentV1({ title: 'Duplicate portable references' })
    document.generationDraft.loras = [
      { enabled: false, resource: copied, weight: -0.6 },
      { enabled: true, resource: ref, weight: 0.9 },
    ]
    const input = path.join(dataRoot, 'Duplicate source.igs')
    const preview = await readProjectPlaceholders(placeholdersDir, 'empty')
    await saveIgsPackage(input, {
      assets: {},
      preview: { ...preview, rect: null, status: 'empty' },
      project: document,
    })
    const selection = await service.selectImport(input)
    if (selection.kind !== 'transfer-required') {
      throw new Error('Expected import choice')
    }
    const imported = await service.finishImport(selection.importId, 'copy')
    if (imported.result.kind !== 'opened') {
      throw new Error('Expected copied Project')
    }
    const tabId = imported.result.tab.id
    const copiedIdentity = { resourceId: copied.localModelId, versionId: copied.localVersionId }
    await assert.rejects(
      service.relinkGenerationLora(tabId, copiedIdentity, (saved) =>
        modelService.resolvePortableGenerationLora(saved),
      ),
      { code: 'PROJECT_INVALID_INPUT' },
    )
    assert.deepEqual(service.getOpenTabs()[0], imported.result.tab)
    await service.removeGenerationLora(tabId, {
      resourceId: ref.localModelId,
      versionId: ref.localVersionId,
    })
    const linked = await service.relinkGenerationLora(tabId, copiedIdentity, (saved) =>
      modelService.resolvePortableGenerationLora(saved),
    )
    assert.deepEqual(linked.generationDraft.loras, [
      {
        enabled: false,
        resource: { ...copied, localModelId: ref.localModelId, localVersionId: ref.localVersionId },
        weight: -0.6,
      },
    ])
    await service.save(tabId)
    await service.close(tabId)
  })
})

/** A generated and an imported owner enter comparison through verified ZIP import, not a DTO mock. */
async function openRasterComparisonFixture(dataRoot: string, service: ProjectService) {
  const output = await acceptedOutputPngFixture()
  const project = createEmptyProjectDocumentV1({
    primaryBbox: { height: 8, width: 8, x: 0, y: 0 },
    title: 'Read-only comparison',
  })
  const generatedLayerId = randomUUID()
  const importedLayerId = randomUUID()
  const provenance = acceptedRasterProvenanceFixture(project, output, project.primaryBbox)
  provenance.generationConfiguration.sampling.actualSeed = 0
  const document = {
    ...project,
    lastActualSeedSnapshot: 0,
    layers: [generatedLayerId, importedLayerId].map((id, index) => ({
      asset: {
        bytes: output.length,
        height: 8,
        path: `assets/layers/${id}.png`,
        sha256: createHash('sha256').update(output).digest('hex'),
        width: 8,
      },
      blendMode: 'normal' as const,
      ...(index === 0 ? { generationProvenance: provenance } : {}),
      id,
      kind: 'raster' as const,
      locked: index === 0,
      name: index === 0 ? 'Accepted generated owner' : 'Imported without metadata',
      opacity: 1,
      transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
      visible: index === 0,
    })),
  }
  const sourcePath = path.join(dataRoot, 'Comparison source.igs')
  await saveIgsPackage(sourcePath, {
    assets: Object.fromEntries(
      document.layers.map((layer) => [layer.asset.path, { bytes: output }]),
    ),
    preview: {
      ...(await readProjectPlaceholders(placeholdersDir, 'unavailable')),
      rect: project.primaryBbox,
      status: 'unavailable',
    },
    project: document,
  })
  const selected = await service.selectImport(sourcePath)
  assert.equal(selected.kind, 'transfer-required')
  if (selected.kind !== 'transfer-required') {
    throw new Error('Expected comparison fixture import.')
  }
  const imported = await service.finishImport(selected.importId, 'copy')
  assert.equal(imported.result.kind, 'opened')
  if (imported.result.kind !== 'opened') {
    throw new Error('Expected comparison fixture tab.')
  }
  return { generatedLayerId, importedLayerId, provenance, tab: imported.result.tab }
}

test('Raster comparison reads portable immutable baseline without worker, preserves shadow and prompt history', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const { generatedLayerId, importedLayerId, provenance, tab } =
      await openRasterComparisonFixture(dataRoot, service)
    const projectPath = (await repository.getProject(tab.id))!.canonicalPath
    const savedPackage = await readIgsPackage(projectPath)
    const savedBytes = await readFile(projectPath)
    const groupId = randomUUID()
    await service.updateGenerationDraft(
      tab.id,
      { kind: 'positive-prompt', text: 'first edit' },
      groupId,
    )
    await service.flushAutosave(tab.id)
    const beforeTab = service.getOpenTabs()[0]
    const beforeDocument = service.getOpenDocumentForAcceptance(tab.id)!.document
    const beforeShadow = await shadow.inspect({ projectPath, savedPackage })
    const beforeIndex = await repository.listSavedAcceptedResults(tab.id)
    const result = await service.getRasterGenerationData(tab.id, tab.documentId, generatedLayerId)
    assert.ok(isRasterGenerationData(result))
    assert.deepEqual(result.generationConfiguration, provenance.generationConfiguration)
    assert.equal(result.generationConfiguration.sampling.actualSeed, 0)
    assert.equal(result.currentMode, null)
    assert.match(result.modeUnavailableReason!, /worker/)
    assert.deepEqual(Object.keys(result).sort(), [
      'currentMode',
      'documentId',
      'generationConfiguration',
      'layerId',
      'modeUnavailableReason',
    ])
    assert.equal('executionResultContext' in result, false)
    assert.equal('layerSourceContext' in result, false)
    assert.deepEqual(service.getOpenTabs()[0], beforeTab)
    assert.deepEqual(service.getOpenDocumentForAcceptance(tab.id)!.document, beforeDocument)
    assert.deepEqual(await shadow.inspect({ projectPath, savedPackage }), beforeShadow)
    assert.deepEqual(await readFile(projectPath), savedBytes)
    assert.deepEqual(await repository.listSavedAcceptedResults(tab.id), beforeIndex)
    result.generationConfiguration.positivePrompt.text = 'mutated response'
    assert.deepEqual(service.getOpenDocumentForAcceptance(tab.id)!.document, beforeDocument)
    const imported = await service.getRasterGenerationData(tab.id, tab.documentId, importedLayerId)
    assert.equal(imported.generationConfiguration, null)
    const failed = await service.getRasterGenerationData(
      tab.id,
      tab.documentId,
      generatedLayerId,
      async () => {
        throw new Error(`Private worker failure at ${dataRoot}/runtime`)
      },
    )
    assert.ok(isRasterGenerationData(failed))
    assert.deepEqual(failed.generationConfiguration, provenance.generationConfiguration)
    assert.equal(failed.currentMode, null)
    assert.equal(failed.modeUnavailableReason!.includes(dataRoot), false)
    await service.updateGenerationDraft(
      tab.id,
      { kind: 'positive-prompt', text: 'second edit' },
      groupId,
    )
    const undone = await service.undo(tab.id)
    assert.equal(undone.generationDraft.positivePrompt.text, '')
    assert.equal(undone.canUndo, false, 'comparison must not seal the prompt edit group')
    assert.equal(undone.dirty, false)
    assert.equal(undone.lastActualSeedSnapshot, 0)
  })
})

test('Raster comparison rejects foreign owners, document changes and a closed/reopened coordinator', async () => {
  await withService(async ({ dataRoot, service }) => {
    const { generatedLayerId, tab } = await openRasterComparisonFixture(dataRoot, service)
    await assert.rejects(service.getRasterGenerationData(tab.id, randomUUID(), generatedLayerId), {
      code: 'PROJECT_IDENTITY_MISMATCH',
    })
    await assert.rejects(service.getRasterGenerationData(tab.id, tab.documentId, randomUUID()), {
      code: 'PROJECT_LAYER_NOT_FOUND',
    })
    await assert.rejects(service.getRasterGenerationData(tab.id, 'invalid', generatedLayerId), {
      code: 'PROJECT_INVALID_INPUT',
    })
    await assert.rejects(service.getRasterGenerationData(tab.id, tab.documentId, 'invalid'), {
      code: 'PROJECT_INVALID_INPUT',
    })
    let entered!: () => void
    let release!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const continueWorker = new Promise<void>((resolve) => {
      release = resolve
    })
    let composeCalled = false
    const pending = service.getRasterGenerationData(
      tab.id,
      tab.documentId,
      generatedLayerId,
      async (use) => {
        entered()
        await continueWorker
        return await use({
          composeTarget: async () => {
            composeCalled = true
            throw new Error('Stale comparison must not reach worker composition')
          },
        })
      },
    )
    const rejection = assert.rejects(pending, { code: 'PROJECT_COMPARISON_CHANGED' })
    await started
    await service.setPrimaryBbox(tab.id, { height: 8, width: 8, x: 100, y: 100 })
    release()
    await rejection
    assert.equal(composeCalled, false)
    await service.undo(tab.id)
    await assert.rejects(
      service.getRasterGenerationData(tab.id, tab.documentId, generatedLayerId, async () => {
        await service.setPrimaryBbox(tab.id, { height: 8, width: 8, x: 123, y: 0 })
        await service.undo(tab.id)
        return null
      }),
      { code: 'PROJECT_COMPARISON_CHANGED' },
      'an edit followed by exact saved-revision Undo still invalidates the read',
    )
    await service
      .getRasterGenerationData(tab.id, tab.documentId, generatedLayerId, async () => {
        await service.close(tab.id)
        assert.equal((await service.open(tab.id)).kind, 'opened')
        return null
      })
      .then(
        () => assert.fail('A reopened tab must invalidate the captured coordinator'),
        (error: unknown) => {
          assert.equal((error as { code: string }).code, 'PROJECT_COMPARISON_CHANGED')
        },
      )
    await service.close(tab.id)
  })
})

test(
  'Raster comparison derives current mode from actual CPU composition and refuses an edit during composition',
  { skip: !devRuntimeRoot() },
  async () => {
    await withService(async ({ dataRoot, repository, service }) => {
      const { generatedLayerId, provenance, tab } = await openRasterComparisonFixture(
        dataRoot,
        service,
      )
      const stagingBasePath = path.join(dataRoot, 'scratch')
      await mkdir(stagingBasePath, { recursive: true })
      const worker = await ProjectWorkerClient.start(
        {
          pythonExecutable: devPython,
          runtimeRoot: devRuntimeRoot()!,
          stagingBasePath,
        },
        { requestTimeoutMs: 15_000 },
      )
      const useWorker: NonNullable<Parameters<ProjectService['getRasterGenerationData']>[3]> = (
        use,
      ) => use(worker)
      const savedBytes = await readFile((await repository.getProject(tab.id))!.canonicalPath)
      try {
        const opaque = await service.getRasterGenerationData(
          tab.id,
          tab.documentId,
          generatedLayerId,
          useWorker,
        )
        assert.ok(isRasterGenerationData(opaque))
        assert.equal(opaque.currentMode, 'img2img')
        assert.equal(opaque.modeUnavailableReason, null)
        assert.deepEqual(opaque.generationConfiguration, provenance.generationConfiguration)
        assert.equal(service.getOpenTabs()[0].dirty, false)
        assert.equal(service.getOpenTabs()[0].canUndo, false)
        await service.setPrimaryBbox(tab.id, { height: 8, width: 8, x: 100, y: 0 })
        const outside = await service.getRasterGenerationData(
          tab.id,
          tab.documentId,
          generatedLayerId,
          useWorker,
        )
        assert.equal(
          outside.currentMode,
          'txt2img',
          'a visible layer outside bbox cannot imply img2img',
        )
        await service.setPrimaryBbox(tab.id, { height: 8, width: 8, x: 4, y: 0 })
        const partial = await service.getRasterGenerationData(
          tab.id,
          tab.documentId,
          generatedLayerId,
          useWorker,
        )
        assert.equal(partial.currentMode, 'outpaint')
        const before = service.getOpenTabs()[0]
        const beforeDocument = service.getOpenDocumentForAcceptance(tab.id)!.document
        await service.getRasterGenerationData(tab.id, tab.documentId, generatedLayerId, useWorker)
        assert.deepEqual(service.getOpenTabs()[0], before)
        assert.deepEqual(service.getOpenDocumentForAcceptance(tab.id)!.document, beforeDocument)
        assert.deepEqual(
          await readFile((await repository.getProject(tab.id))!.canonicalPath),
          savedBytes,
        )
        // A changed pixel key must compose again; an unchanged key is intentionally cached.
        await service.setPrimaryBbox(tab.id, { height: 8, width: 8, x: 2, y: 0 })
        await assert.rejects(
          service.getRasterGenerationData(tab.id, tab.documentId, generatedLayerId, (use) =>
            use({
              composeTarget: async (input) => {
                await service.setPrimaryBbox(tab.id, { height: 8, width: 8, x: -4, y: 0 })
                return await worker.composeTarget(input)
              },
            }),
          ),
          { code: 'PROJECT_COMPARISON_CHANGED' },
        )
        while (service.getOpenTabs()[0].canUndo) {
          await service.undo(tab.id)
        }
        assert.equal(service.getOpenTabs()[0].dirty, false)
        const beforeAbaRevision = service.getOpenDocumentForAcceptance(tab.id)!.document
          .documentRevision
        let lateModeReturned = false
        await assert.rejects(
          service.getRasterGenerationData(tab.id, tab.documentId, generatedLayerId, (use) =>
            use({
              composeTarget: async (input) => {
                await service.setPrimaryBbox(tab.id, { height: 8, width: 8, x: 321, y: 0 })
                await service.undo(tab.id)
                assert.equal(
                  service.getOpenDocumentForAcceptance(tab.id)!.document.documentRevision,
                  beforeAbaRevision,
                )
                const mode = await worker.composeTarget(input)
                lateModeReturned = true
                return mode
              },
            }),
          ),
          { code: 'PROJECT_COMPARISON_CHANGED' },
          'a late verified mode after edit/Undo cannot reopen an earlier read',
        )
        assert.equal(lateModeReturned, true, 'the late verified worker response actually completed')
        assert.equal(
          (await readdir(stagingBasePath)).some((entry) => entry.startsWith('project-target-')),
          false,
        )
      } finally {
        await worker.close()
        await service.flushAutosave(tab.id)
      }
    })
  },
)

test(
  'standalone CPU target uses verified pixels, caches editor-only edits and refuses changed or reopened owners',
  { skip: !devRuntimeRoot(), timeout: 30_000 },
  async () => {
    await withService(async ({ dataRoot, repository, service }) => {
      const empty = await service.create({ height: 64, title: 'Empty target', width: 64 })
      const fixture = await openRasterComparisonFixture(dataRoot, service)
      const tab = fixture.tab
      const scratch = path.join(dataRoot, 'scratch')
      await mkdir(scratch, { recursive: true })
      const worker = await ProjectWorkerClient.start(
        { pythonExecutable: devPython, runtimeRoot: devRuntimeRoot()!, stagingBasePath: scratch },
        { requestTimeoutMs: 15_000 },
      )
      let compositions = 0
      const useWorker: NonNullable<Parameters<ProjectService['getGenerationTargetState']>[3]> = (
        use,
      ) =>
        use({
          composeTarget: async (input) => {
            compositions++
            return worker.composeTarget(input)
          },
        })
      const key = async (id: string) =>
        hashGenerationTargetSignature(
          generationTargetSignature(service.getOpenTabs().find((current) => current.id === id)!)!,
        )
      const savedPath = (await repository.getProject(tab.id))!.canonicalPath
      const saved = await readFile(savedPath)
      try {
        assert.equal(
          (
            await service.getGenerationTargetState(
              empty.id,
              empty.documentId,
              await key(empty.id),
              useWorker,
            )
          ).mode,
          'txt2img',
        )
        assert.equal(service.getOpenTabs().find((current) => current.id === empty.id)!.dirty, false)
        const opaqueKey = await key(tab.id)
        const before = service.getOpenTabs().find((current) => current.id === tab.id)!
        assert.equal(
          (await service.getGenerationTargetState(tab.id, tab.documentId, opaqueKey, useWorker))
            .mode,
          'img2img',
        )
        assert.deepEqual(
          service.getOpenTabs().find((current) => current.id === tab.id),
          before,
        )
        assert.deepEqual(await readFile(savedPath), saved)
        await service.updateGenerationDraft(tab.id, {
          kind: 'positive-prompt',
          text: 'Only text changed',
        })
        assert.equal(await key(tab.id), opaqueKey)
        const calls = compositions
        assert.equal(
          (await service.getGenerationTargetState(tab.id, tab.documentId, opaqueKey, useWorker))
            .mode,
          'img2img',
        )
        assert.equal(compositions, calls, 'prompt edits cannot cause another pixel composition')
        await service.setPrimaryBbox(tab.id, { height: 8, width: 8, x: 100, y: 0 })
        await assert.rejects(
          service.getGenerationTargetState(tab.id, tab.documentId, opaqueKey, useWorker),
          { code: 'PROJECT_TARGET_CHANGED' },
        )
        assert.equal(
          (
            await service.getGenerationTargetState(
              tab.id,
              tab.documentId,
              await key(tab.id),
              useWorker,
            )
          ).mode,
          'txt2img',
        )
        await service.setPrimaryBbox(tab.id, { height: 8, width: 8, x: 4, y: 0 })
        assert.equal(
          (
            await service.getGenerationTargetState(
              tab.id,
              tab.documentId,
              await key(tab.id),
              useWorker,
            )
          ).mode,
          'outpaint',
        )
        await service.setPrimaryBbox(tab.id, { height: 8, width: 8, x: 2, y: 0 })
        const changedKey = await key(tab.id)
        await assert.rejects(
          service.getGenerationTargetState(tab.id, tab.documentId, changedKey, (use) =>
            use({
              composeTarget: async (input) => {
                const result = await worker.composeTarget(input)
                await service.setPrimaryBbox(tab.id, { height: 8, width: 8, x: -2, y: 0 })
                return result
              },
            }),
          ),
          { code: 'PROJECT_TARGET_CHANGED' },
        )
        await service.save(tab.id)
        const reopenedKey = await key(tab.id)
        await assert.rejects(
          service.getGenerationTargetState(tab.id, tab.documentId, reopenedKey, (use) =>
            use({
              composeTarget: async (input) => {
                const result = await worker.composeTarget(input)
                await service.close(tab.id)
                assert.equal((await service.open(tab.id)).kind, 'opened')
                return result
              },
            }),
          ),
          { code: 'PROJECT_TARGET_CHANGED' },
        )
        assert.equal(
          (await readdir(scratch)).some((entry) => entry.startsWith('project-target-')),
          false,
        )
        assert.equal(
          service.getOpenTabs().find((current) => current.id === empty.id)!.lastActualSeedSnapshot,
          null,
        )
      } finally {
        await worker.close()
        await service.flushAutosave(tab.id)
      }
    })
  },
)
