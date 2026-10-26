import type {
  PresetPayload,
  PresetRecord,
  PresetSectionKey,
} from '../../shared/presets/preset-schema.js'
import type {
  SmartPatchPresetApplicationRequest,
  SmartPatchPresetApplicationReview,
} from '../../shared/presets/smart-patch-preset-application.js'
import type {
  IgsProjectDocumentV1,
  IgsSmartPatchLayerV1,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { CivitaiClient } from '../models/civitai-client.js'
import { CivitaiTokenStore } from '../models/civitai-token-store.js'
import { ModelRepository } from '../models/model-repository.js'
import { ModelService } from '../models/model-service.js'
import { publishIllustriousEmbeddingFixture } from '../models/test-fixtures/illustrious-embedding.js'
import { PresetRepository } from '../presets/preset-repository.js'
import { readIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry, type ProjectAutosaveOptions } from './project-autosave.js'
import { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import { ProjectIndexRepository } from './project-index.js'
import { encodeProjectMaskPng } from './project-mask.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
import {
  acceptedOutputPngFixture,
  acceptedRasterProvenanceFixture,
} from './test-fixtures/accepted-provenance.js'
import { literalSmartPatchColorPng } from './test-fixtures/smart-patch-input-material.js'
import { smartPatchVariantMetadataFixture } from './test-fixtures/smart-patch-variant.js'

type Family = 'anima' | 'illustrious'
type Verify = Parameters<ProjectService['applySmartPatchPreset']>[2]
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

interface Fixture {
  assets: Record<string, Buffer>
  database: ReturnType<typeof openAppDatabase>
  firstId: string
  modelRepository: ModelRepository
  models: ModelService
  neighborId: string
  patchId: string
  presets: PresetRepository
  rasterId: string
  restart: () => ProjectService
  root: string
  savedPath: string
  service: ProjectService
  setBeforeEdit: (hook?: ProjectAutosaveOptions['beforeEditCommit']) => void
  shadow: ProjectShadowStore
  source: PresetRecord
  tabId: string
  verify: Verify
}

function resource<K extends 'checkpoint' | 'embedding' | 'lora' | 'vae'>(
  kind: K,
  family: Family = 'illustrious',
) {
  return {
    baseModelFamily: family,
    civitaiFileId: 33,
    civitaiModelId: 11,
    civitaiVersionId: 22,
    displayName: `Unavailable exact ${family} ${kind}`,
    fileSha256: 'a'.repeat(64),
    kind,
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: kind === 'checkpoint' && family === 'illustrious' ? ('epsilon' as const) : null,
    versionName: 'Copied version',
  }
}

/** Real owners and portable declared preconditions; no worker, runtime, inference or Add fixture. */
async function withProject(run: (f: Fixture) => Promise<void>, family: Family = 'illustrious') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-smart-preset-apply-'))
  const database = openAppDatabase(root, path.resolve('src/main/db/migrations'))
  const repository = new ProjectIndexRepository(database.db)
  const modelRepository = new ModelRepository(database.db)
  const models = new ModelService(
    modelRepository,
    new CivitaiClient(),
    new CivitaiTokenStore(
      {
        decryptStringAsync: async () => ({ result: '', shouldReEncrypt: false }),
        encryptStringAsync: async () => Buffer.alloc(0),
        getSelectedStorageBackend: () => 'gnome_libsecret',
        isAsyncEncryptionAvailable: async () => true,
      },
      root,
    ),
  )
  const presets = new PresetRepository(database.db)
  const shadow = new ProjectShadowStore(path.join(root, 'autosave'))
  const services: ProjectService[] = []
  let beforeEdit: ProjectAutosaveOptions['beforeEditCommit']
  const restart = () => {
    const service = new ProjectService({
      autosaveOptions: {
        beforeEditCommit: async (document) => {
          await beforeEdit?.(document)
        },
        debounceMs: 60_000,
        leaseRegistry: new ProjectAutosaveLeaseRegistry(),
      },
      dataRoot: root,
      readLastActualSeed: async () => 0,
      repository,
      roots: {
        placeholdersDir: path.resolve('src/main/projects/placeholders'),
        scratchDir: path.join(root, 'scratch'),
      },
      shadow,
    })
    services.push(service)
    return service
  }
  const service = restart()
  try {
    const tab = await service.create({ height: 256, title: 'Exact Smart Apply owner', width: 512 })
    const owner = service.getOpenDocumentForAcceptance(tab.id)!
    const source = await presets.create({
      description: 'Saved recipe remains independent',
      favorite: false,
      name: 'Reusable Smart recipe',
      payload: {
        prompt: { embeddingRefs: [], text: 'saved source prompt' },
        size: { height: 1024, width: 2048 },
      },
      tags: [],
      workflow: 'smartPatch',
    })
    const draft: IgsProjectDocumentV1['generationDraft'] = {
      ...owner.document.generationDraft,
      clipSkip: 2,
      dynamicPrompt: { maxPrompts: 3, seedBehavior: 'per-prompt' },
      loras: [{ enabled: false, resource: resource('lora', family), weight: -0.5 }],
      model: resource('checkpoint', family),
      positivePrompt: { embeddingRefs: [], text: 'Patch B authored prompt' },
      sampling: {
        animaMethod: 'lcm',
        cfgScale: 5,
        denoisingStrength: 0.5,
        sampler: 'Euler',
        scheduler: 'Normal',
        steps: 12,
      },
      seed: { policy: 'fixed', value: 913 },
      vae: family === 'illustrious' ? resource('vae') : null,
    }
    const variant = smartPatchVariantMetadataFixture(family)
    const alpha = Uint8Array.from({ length: 35 }, (_, index) => [0, 64, 128, 255][index % 4])
    const contribution = literalSmartPatchColorPng(
      7,
      5,
      Array.from(alpha, (a) => [12, 34, 56, a]).flat(),
      4,
    )
    Object.assign(variant.asset, { bytes: contribution.length, sha256: digest(contribution) })
    Object.assign(variant.generationProvenance.executionResultContext.output, {
      byteSize: contribution.length,
      contributionAlpha8: { byteSize: alpha.length, height: 5, sha256: digest(alpha), width: 7 },
      sha256: digest(contribution),
    })
    const maskId = randomUUID()
    const maskPng = encodeProjectMaskPng(Uint8Array.of(0, 64, 128, 255), 2, 2)
    const maskPath = `assets/masks/${maskId}/${digest(maskPng)}.png`
    const patch: IgsSmartPatchLayerV1 = {
      activeRasterSubLayerId: variant.id,
      blendMode: 'multiply',
      boundingBox: { height: 64, width: 128, x: 17, y: -23 },
      coherenceSettings: { edgeSize: 31, minimumDenoise: 0.375, mode: 'Box Blur' },
      generationDraft: draft,
      id: randomUUID(),
      internalResolution: { height: 64, width: 64 },
      kind: 'smart-patch',
      locked: false,
      mask: {
        asset: {
          bytes: maskPng.length,
          height: 2,
          path: maskPath,
          sha256: digest(maskPng),
          width: 2,
        },
        bounds: { height: 2, width: 2, x: -1, y: 3 },
        id: maskId,
        revision: 3,
      },
      maskSettings: { blur: 7, padding: 13 },
      name: 'Patch B, exact target',
      opacity: 0.4,
      rasterSubLayers: [variant],
      visible: false,
    }
    const first: IgsSmartPatchLayerV1 = {
      ...structuredClone(patch),
      activeRasterSubLayerId: null,
      generationDraft: {
        ...structuredClone(draft),
        positivePrompt: { embeddingRefs: [], text: 'Patch A unchanged' },
      },
      id: randomUUID(),
      mask: { asset: null, id: randomUUID(), revision: 0 },
      name: 'Patch A neighbor',
      rasterSubLayers: [],
      visible: true,
    }
    const rasterId = randomUUID()
    const rasterPng = await acceptedOutputPngFixture()
    const raster = {
      asset: {
        bytes: rasterPng.length,
        height: 8,
        path: `assets/layers/${rasterId}.png`,
        sha256: digest(rasterPng),
        width: 8,
      },
      blendMode: 'normal' as const,
      generationProvenance: acceptedRasterProvenanceFixture(owner.document, rasterPng, {
        height: 8,
        width: 8,
        x: 0,
        y: 0,
      }),
      id: rasterId,
      kind: 'raster' as const,
      locked: false,
      name: 'Accepted Raster neighbor',
      opacity: 1,
      transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
      visible: true,
    }
    const assets = {
      [maskPath]: maskPng,
      [raster.asset.path]: rasterPng,
      [variant.asset.path]: contribution,
    }
    await owner.applyDocument(
      {
        ...owner.document,
        generationDraft: {
          ...owner.document.generationDraft,
          model: resource('checkpoint', family === 'anima' ? 'illustrious' : 'anima'),
          positivePrompt: { embeddingRefs: [], text: 'Project Canvas unchanged' },
        },
        layers: [first, patch, raster],
      },
      Object.fromEntries(Object.entries(assets).map(([name, bytes]) => [name, { bytes }])),
    )
    await service.save(tab.id)
    await service.clearHistory(tab.id)
    const neighbor = await service.create({
      height: 64,
      title: 'Other Project remains exact',
      width: 64,
    })
    const savedPath = (await repository.listProjects()).find(
      (row) => row.localProjectKey === tab.id,
    )!.canonicalPath
    await database.db
      .insertInto('generation_seed_cursor')
      .values({
        actual_seed: 0,
        candidate_id: randomUUID(),
        completion_order: 1,
        document_id: tab.documentId,
        local_project_key: tab.id,
        updated_at: '2026-10-22T12:00:00.000Z',
      })
      .execute()
    await run({
      assets,
      database,
      firstId: first.id,
      modelRepository,
      models,
      neighborId: neighbor.id,
      patchId: patch.id,
      presets,
      rasterId,
      restart,
      root,
      savedPath,
      service,
      setBeforeEdit: (hook) => {
        beforeEdit = hook
      },
      shadow,
      source,
      tabId: tab.id,
      verify: (request, current) => models.verifyPresetApplication(request, current),
    })
  } finally {
    beforeEdit = undefined
    for (const owner of services.reverse()) {
      for (const tab of owner.getOpenTabs()) {
        await owner.discardAndClose(tab.id)
      }
    }
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

function document(f: Fixture, service = f.service) {
  const owner = service.getOpenDocumentForAcceptance(f.tabId)
  assert.ok(owner)
  return owner.document
}

function patch(document: IgsProjectDocumentV1, id: string): IgsSmartPatchLayerV1 {
  const layer = document.layers.find((layer) => layer.id === id)
  assert.ok(layer?.kind === 'smart-patch')
  return layer
}

function review(f: Fixture, service = f.service, layerId = f.patchId) {
  const current = document(f, service)
  return service.getSmartPatchPresetApplicationReview(f.tabId, {
    documentId: current.documentId,
    documentRevision: current.documentRevision,
    layerId,
  })
}

function application(
  f: Fixture,
  reviewed: SmartPatchPresetApplicationReview,
  payload: PresetPayload = { prompt: { embeddingRefs: [], text: 'Reviewed temporary prompt' } },
  selectedSections: PresetSectionKey[] = ['prompt'],
): SmartPatchPresetApplicationRequest {
  const { generationDraft: _draft, ...identity } = reviewed
  return { ...identity, payload, selectedSections, sourcePresetId: f.source.id }
}

function content(document: IgsProjectDocumentV1) {
  return { ...document, documentRevision: 'content comparison' }
}

function deferred() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

async function editUndo(f: Fixture) {
  const before = document(f)
  await f.service.updateGenerationDraft(f.tabId, {
    kind: 'positive-prompt',
    text: 'intervening edit',
  })
  await f.service.undo(f.tabId)
  assert.equal(
    document(f).documentRevision,
    before.documentRevision,
    'Saved revision establishes real ABA.',
  )
}

test('review is synchronous, detached and replaces only this tab’s previous token', async () => {
  await withProject(async (f) => {
    const before = document(f)
    const saved = await readFile(f.savedPath)
    const first = review(f)
    assert.equal(first instanceof Promise, false)
    assert.deepEqual(first.generationDraft, patch(before, f.patchId).generationDraft)
    first.generationDraft.positivePrompt.text = 'mutated reply'
    const second = review(f)
    assert.notEqual(first.reviewToken, second.reviewToken)
    await assert.rejects(
      f.service.applySmartPatchPreset(f.tabId, application(f, first), f.verify),
      { code: 'EDIT_CONFLICT' },
    )
    assert.deepEqual(document(f), before)
    assert.ok((await readFile(f.savedPath)).equals(saved))
    const neighbor = await f.service.addSmartPatchLayer(f.neighborId)
    const neighborPatch = neighbor.layers.find((layer) => layer.kind === 'smart-patch')!
    const otherReview = f.service.getSmartPatchPresetApplicationReview(neighbor.id, {
      documentId: neighbor.documentId,
      documentRevision: neighbor.documentRevision,
      layerId: neighborPatch.id,
    })
    await f.service.applySmartPatchPreset(f.tabId, application(f, second), f.verify)
    await f.service.applySmartPatchPreset(neighbor.id, application(f, otherReview), f.verify)
  })
})

test('selected sections change only reviewed Patch B in one Undo step and survive explicit real package Save', async () => {
  await withProject(async (f) => {
    const before = document(f)
    const source = await f.presets.get(f.source.id)
    const neighbor = structuredClone(f.service.getOpenTabs().find((tab) => tab.id === f.neighborId))
    const file = await readFile(f.savedPath)
    const cursor = await f.database.db.selectFrom('generation_seed_cursor').selectAll().execute()
    const payload: PresetPayload = {
      cfgRescale: 0,
      denoisingStrength: 0,
      guidance: { cfgScale: 0, steps: 7 },
      loras: [],
      negativePrompt: { embeddingRefs: [], text: '' },
      prompt: { embeddingRefs: [], text: '{authored|template}, (literal:1.5)' },
      sampling: { animaMethod: 'heun' },
      seed: { policy: 'fixed', value: 0 },
      size: { height: 1024, width: 2048 },
      vae: null,
      vaePrecision: 'Auto',
    }
    const request = application(f, review(f), payload, [
      'prompt',
      'negativePrompt',
      'sampling',
      'guidance',
      'cfgRescale',
      'denoisingStrength',
      'loras',
      'seed',
      'vae',
      'vaePrecision',
    ])
    await f.service.applySmartPatchPreset(f.tabId, request, f.verify)
    const expected = structuredClone(before)
    const target = patch(expected, f.patchId).generationDraft
    target.positivePrompt = structuredClone(payload.prompt!)
    target.negativePrompt = structuredClone(payload.negativePrompt!)
    target.loras = []
    target.cfgRescale = 0
    target.vae = null
    target.vaePrecision = 'Auto'
    target.seed = { policy: 'fixed', value: 0 }
    target.sampling = {
      ...target.sampling,
      animaMethod: 'heun',
      cfgScale: 0,
      denoisingStrength: 0,
      steps: 7,
    }
    assert.deepEqual(content(document(f)), content(expected))
    assert.deepEqual(await f.presets.get(f.source.id), source)
    assert.deepEqual(
      f.service.getOpenTabs().find((tab) => tab.id === f.neighborId),
      neighbor,
    )
    assert.deepEqual(
      await f.database.db.selectFrom('generation_seed_cursor').selectAll().execute(),
      cursor,
    )
    await f.service.flushAutosave(f.tabId)
    assert.ok(
      (await readFile(f.savedPath)).equals(file),
      'Apply writes recovery, not the saved package.',
    )
    await assert.rejects(f.service.applySmartPatchPreset(f.tabId, request, f.verify), {
      code: 'EDIT_CONFLICT',
    })
    const undone = await f.service.undo(f.tabId)
    assert.equal(undone.canUndo, false)
    assert.deepEqual(content(document(f)), content(before))
    await f.service.redo(f.tabId)
    assert.deepEqual(content(document(f)), content(expected))
    await f.service.save(f.tabId)
    const saved = await readIgsPackage(f.savedPath)
    assert.deepEqual(content(saved.project), content(expected))
    for (const [name, bytes] of Object.entries(f.assets)) {
      assert.ok((await saved.readMember(name)).equals(bytes), name)
    }
    await f.service.close(f.tabId)
    assert.equal((await f.service.open(f.tabId)).kind, 'opened')
    assert.deepEqual(content(document(f)), content(expected))
  })
})

test('a successful no-op consumes its review without document, history, package or optional-default changes', async () => {
  await withProject(async (f) => {
    const before = document(f)
    const file = await readFile(f.savedPath)
    const prompt = patch(before, f.patchId).generationDraft.positivePrompt
    assert.deepEqual(prompt.embeddingRefs, [])
    const request = application(f, review(f), {
      prompt: { embeddingRefs: [], text: prompt.text },
    })
    const applied = await f.service.applySmartPatchPreset(f.tabId, request, f.verify)
    assert.equal(applied.canUndo, false)
    assert.equal(applied.dirty, false)
    assert.deepEqual(document(f), before)
    assert.equal(
      Object.hasOwn(patch(document(f), f.patchId).generationDraft, 'vaePrecision'),
      false,
    )
    assert.ok((await readFile(f.savedPath)).equals(file))
    await assert.rejects(f.service.applySmartPatchPreset(f.tabId, request, f.verify), {
      code: 'EDIT_CONFLICT',
    })
  })
})

test('selected-resource refusal preserves the exact review token for deselection and consumes it only on success', async () => {
  await withProject(async (f) => {
    const before = document(f)
    const payload: PresetPayload = {
      loras: [{ enabled: false, resource: resource('lora'), weight: -0.5 }],
      prompt: { embeddingRefs: [], text: 'plain text survives missing resource' },
    }
    const request = application(f, review(f), payload, ['prompt', 'loras'])
    await assert.rejects(f.service.applySmartPatchPreset(f.tabId, request, f.verify), {
      code: 'MODEL_PRESET_RESOURCE_UNAVAILABLE',
    })
    assert.deepEqual(document(f), before)
    assert.equal(f.service.getOpenTabs().find((tab) => tab.id === f.tabId)!.canUndo, false)
    const selected = { ...request, selectedSections: ['prompt'] as PresetSectionKey[] }
    const catalog = f.models.getCatalog
    f.models.getCatalog = async () => {
      throw new Error('Plain selected text must not require the catalog.')
    }
    try {
      await f.service.applySmartPatchPreset(f.tabId, selected, f.verify)
    } finally {
      f.models.getCatalog = catalog
    }
    assert.equal(
      patch(document(f), f.patchId).generationDraft.positivePrompt.text,
      payload.prompt!.text,
    )
    assert.deepEqual(
      patch(document(f), f.patchId).generationDraft.loras,
      patch(before, f.patchId).generationDraft.loras,
    )
    await assert.rejects(f.service.applySmartPatchPreset(f.tabId, selected, f.verify), {
      code: 'EDIT_CONFLICT',
    })
  })
})

for (const family of ['illustrious', 'anima'] as const) {
  test(`resource validation receives the reviewed ${family} Patch family, independently of Project Canvas`, async () => {
    await withProject(async (f) => {
      const before = document(f)
      assert.notEqual(before.generationDraft.model!.baseModelFamily, family)
      const request = application(
        f,
        review(f),
        { cfgRescale: 0.25, prompt: { embeddingRefs: [], text: 'family-local prompt' } },
        ['cfgRescale', 'prompt'],
      )
      const verify: Verify = async (request, current) => {
        assert.deepEqual(current.generationDraft, patch(before, f.patchId).generationDraft)
        assert.equal(current.generationDraft.model!.baseModelFamily, family)
        await f.models.verifyPresetApplication(request, current)
      }
      if (family === 'anima') {
        await assert.rejects(f.service.applySmartPatchPreset(f.tabId, request, verify), {
          code: 'MODEL_PRESET_RESOURCE_UNAVAILABLE',
        })
        assert.deepEqual(document(f), before)
        await f.service.applySmartPatchPreset(
          f.tabId,
          { ...request, selectedSections: ['prompt'] },
          verify,
        )
      } else {
        await f.service.applySmartPatchPreset(f.tabId, request, verify)
        assert.equal(patch(document(f), f.patchId).generationDraft.cfgRescale, 0.25)
      }
      assert.deepEqual(document(f).generationDraft, before.generationDraft)
    }, family)
  })
}

test('real embedding verification refuses changed bytes and retries the same review with exact authored sidecars', async () => {
  await withProject(async (f) => {
    const installed = await publishIllustriousEmbeddingFixture(
      f.modelRepository,
      f.root,
      9900,
      9901,
    )
    const prompt = await f.models.resolveGenerationPromptEmbeddings({
      modelFamily: 'illustrious',
      prompt: { embeddingRefs: [], text: '' },
      text: '<clean-style>',
    })
    const installedReference = prompt.embeddingRefs[0].resource
    assert.equal(installedReference.kind, 'embedding')
    const literal = {
      embeddingRefs: [
        {
          resource: {
            ...installedReference,
            displayName: 'Frozen alias',
            kind: 'embedding' as const,
          },
          token: '<saved-alias>',
        },
      ],
      text: '<saved-alias>, negative',
    }
    const request = application(f, review(f), { negativePrompt: literal }, ['negativePrompt'])
    const before = document(f)
    await f.models.verifyPresetApplication(request, {
      generationDraft: patch(before, f.patchId).generationDraft,
      primaryBbox: before.primaryBbox,
    })
    await writeFile(installed.managedPath, Buffer.alloc(installed.bytes.length))
    await assert.rejects(
      f.service.applySmartPatchPreset(f.tabId, request, f.verify),
      (error: unknown) => {
        assert.ok(error && typeof error === 'object' && 'code' in error)
        assert.ok(
          ['MODEL_FILE_CORRUPT', 'MODEL_PRESET_RESOURCE_UNAVAILABLE'].includes(String(error.code)),
        )
        return true
      },
    )
    assert.deepEqual(document(f), before)
    await writeFile(installed.managedPath, installed.bytes)
    await f.service.applySmartPatchPreset(f.tabId, request, f.verify)
    assert.deepEqual(patch(document(f), f.patchId).generationDraft.negativePrompt, literal)
    assert.deepEqual(
      patch(document(f), f.patchId).generationDraft.positivePrompt,
      patch(before, f.patchId).generationDraft.positivePrompt,
    )
  })
})

test('strict Size and selected-only failures leave a review reusable without geometry mutation', async () => {
  await withProject(async (f) => {
    const before = document(f)
    const request = application(
      f,
      review(f),
      {
        prompt: { embeddingRefs: [], text: 'only reviewed text' },
        size: { height: 64, width: 64 },
      },
      ['prompt', 'size'],
    )
    await assert.rejects(f.service.applySmartPatchPreset(f.tabId, request, f.verify), {
      code: 'PROJECT_INVALID_INPUT',
    })
    for (const changed of [
      { layerId: 'bad' },
      { reviewToken: 'bad' },
      { injected: true },
      { selectedSections: [] },
      { selectedSections: ['prompt', 'prompt'] },
    ]) {
      await assert.rejects(
        f.service.applySmartPatchPreset(
          f.tabId,
          { ...request, ...changed } as SmartPatchPresetApplicationRequest,
          f.verify,
        ),
        { code: 'PROJECT_INVALID_INPUT' },
      )
    }
    assert.deepEqual(document(f), before)
    await f.service.applySmartPatchPreset(
      f.tabId,
      {
        ...request,
        payload: {
          guidance: null,
          prompt: request.payload.prompt,
          size: { width: 'unfinished' },
        } as unknown as PresetPayload,
        selectedSections: ['prompt'],
      },
      f.verify,
    )
    const expected = structuredClone(before)
    patch(expected, f.patchId).generationDraft.positivePrompt = structuredClone(
      request.payload.prompt!,
    )
    assert.deepEqual(content(document(f)), content(expected))
  })
})

test('wrong document, revision, token or layer refuses before verification; locked and non-Patch reviews refuse', async () => {
  await withProject(async (f) => {
    const before = document(f)
    const request = application(f, review(f))
    const notCalled: Verify = async () => {
      assert.fail('Stale ownership must refuse before resource verification.')
    }
    for (const changed of [
      { documentId: randomUUID() },
      { documentRevision: randomUUID() },
      { reviewToken: randomUUID() },
      { layerId: f.firstId },
      { layerId: f.rasterId },
      { layerId: randomUUID() },
    ]) {
      await assert.rejects(
        f.service.applySmartPatchPreset(f.tabId, { ...request, ...changed }, notCalled),
        { code: 'EDIT_CONFLICT' },
      )
    }
    assert.deepEqual(document(f), before)
    for (const layerId of [f.rasterId, randomUUID()]) {
      assert.throws(() => review(f, f.service, layerId), { code: 'PROJECT_LAYER_NOT_FOUND' })
    }
    await f.service.updateSmartPatchLayer(f.tabId, f.patchId, { kind: 'lock', locked: true })
    assert.throws(() => review(f), {
      code: 'PROJECT_LAYER_LOCKED',
      message: 'Unlock this Smart Patch before editing it.',
    })
    await assert.rejects(f.service.applySmartPatchPreset(f.tabId, request, notCalled), {
      code: 'EDIT_CONFLICT',
    })
    await f.service.undo(f.tabId)
    const current = review(f)
    const owner = f.service.getOpenDocumentForAcceptance(f.tabId)!
    await owner.applyDocument({
      ...owner.document,
      layers: owner.document.layers.filter((layer) => layer.id !== f.patchId),
    })
    await assert.rejects(
      f.service.applySmartPatchPreset(f.tabId, application(f, current), notCalled),
      { code: 'EDIT_CONFLICT' },
    )
    assert.equal(
      document(f).layers.some((layer) => layer.id === f.patchId),
      false,
    )
  })
})

test('review rejects saved-revision ABA completed before Apply or while waiting for shared gate admission', async () => {
  await withProject(async (f) => {
    const notCalled: Verify = async () => {
      assert.fail('Pre-admission ABA must fail before verification.')
    }
    const direct = application(f, review(f))
    await editUndo(f)
    await assert.rejects(f.service.applySmartPatchPreset(f.tabId, direct, notCalled), {
      code: 'EDIT_CONFLICT',
    })
    const gate = new ProjectGenerationOperationGate()
    const entered = deferred()
    const release = deferred()
    const blocker = gate.run(f.tabId, async () => {
      entered.release()
      await release.promise
    })
    await entered.promise
    const request = application(f, review(f))
    const queued = gate.run(f.tabId, () =>
      f.service.applySmartPatchPreset(f.tabId, request, notCalled),
    )
    const refused = assert.rejects(queued, { code: 'EDIT_CONFLICT' })
    await editUndo(f)
    release.release()
    await blocker
    await refused
    assert.equal(f.service.getOpenTabs().find((tab) => tab.id === f.tabId)!.canUndo, false)
  })
})

for (const phase of ['verification', 'staging'] as const) {
  test(`review refuses edit/Undo ABA and close/reopen during ${phase} without a phantom history entry`, async () => {
    await withProject(async (f) => {
      for (const race of ['edit-undo', 'close-reopen'] as const) {
        const request = application(f, review(f))
        const before = document(f)
        const entered = deferred()
        const release = deferred()
        const pause = async () => {
          entered.release()
          await release.promise
        }
        if (phase === 'staging') {
          f.setBeforeEdit(async (candidate) => {
            if (
              patch(candidate, f.patchId).generationDraft.positivePrompt.text ===
              request.payload.prompt!.text
            ) {
              await pause()
            }
          })
        }
        const operation = f.service.applySmartPatchPreset(
          f.tabId,
          request,
          phase === 'verification' ? pause : f.verify,
        )
        const refused = assert.rejects(operation, { code: 'EDIT_CONFLICT' })
        await entered.promise
        if (race === 'edit-undo') {
          await editUndo(f)
        } else {
          await f.service.close(f.tabId)
          assert.equal((await f.service.open(f.tabId)).kind, 'opened')
        }
        release.release()
        await refused
        f.setBeforeEdit()
        assert.deepEqual(document(f), before)
        assert.equal(f.service.getOpenTabs().find((tab) => tab.id === f.tabId)!.canUndo, false)
      }
    })
  })
}

test('a new synchronous review during staging invalidates the pending commit and stays usable', async () => {
  await withProject(async (f) => {
    const before = document(f)
    const request = application(f, review(f))
    const entered = deferred()
    const release = deferred()
    f.setBeforeEdit(async () => {
      entered.release()
      await release.promise
    })
    const pending = f.service.applySmartPatchPreset(f.tabId, request, f.verify)
    const refused = assert.rejects(pending, { code: 'EDIT_CONFLICT' })
    await entered.promise
    const next = review(f)
    assert.equal(next.documentRevision, request.documentRevision)
    release.release()
    await refused
    f.setBeforeEdit()
    assert.deepEqual(document(f), before)
    await f.service.applySmartPatchPreset(f.tabId, application(f, next), f.verify)
    assert.equal(
      patch(document(f), f.patchId).generationDraft.positivePrompt.text,
      request.payload.prompt!.text,
    )
  })
})

test('captured request and verifier adapter cannot mutate the published selection or owned neighbors', async () => {
  await withProject(async (f) => {
    const request = application(f, review(f))
    const before = document(f)
    const pending = deferred()
    const operation = f.service.applySmartPatchPreset(f.tabId, request, async (copy, current) => {
      copy.payload.prompt!.text = 'verifier mutation'
      current.generationDraft.positivePrompt.text = 'adapter mutation'
      current.primaryBbox.width = 8
      await pending.promise
    })
    request.payload.prompt!.text = 'caller mutation'
    request.selectedSections.push('size')
    pending.release()
    await operation
    const expected = structuredClone(before)
    patch(expected, f.patchId).generationDraft.positivePrompt = {
      embeddingRefs: [],
      text: 'Reviewed temporary prompt',
    }
    assert.deepEqual(content(document(f)), content(expected))
  })
})

test('guarded coordinator publication requires its captured epoch and preserves history on guard refusal', async () => {
  await withProject(async (f) => {
    const owner = f.service.getOpenDocumentForAcceptance(f.tabId)!
    const before = owner.document
    const candidate = { ...before, title: 'Guarded candidate' }
    let guarded = false
    await assert.rejects(
      owner.applyDocument(
        candidate,
        {},
        {
          beforeCommit: () => {
            guarded = true
          },
        },
      ),
      { code: 'EDIT_CONFLICT' },
    )
    assert.equal(guarded, false)
    await assert.rejects(
      owner.applyDocument(
        candidate,
        {},
        {
          beforeCommit: () => {
            guarded = true
            throw new Error('permission revoked')
          },
          expectedDocumentEpoch: owner.documentEpoch,
          expectedDocumentRevision: before.documentRevision,
        },
      ),
      /permission revoked/,
    )
    assert.equal(guarded, true)
    assert.deepEqual(owner.document, before)
    assert.equal(owner.canUndo, false)
  })
})

test('coordinator epoch independently rejects staged saved-revision ABA before the permission callback', async () => {
  await withProject(async (f) => {
    const owner = f.service.getOpenDocumentForAcceptance(f.tabId)!
    const before = owner.document
    const epoch = owner.documentEpoch
    const entered = deferred()
    const release = deferred()
    f.setBeforeEdit(async (candidate) => {
      if (candidate.title === 'Staged epoch control') {
        entered.release()
        await release.promise
      }
    })
    let permissionCalled = false
    const pending = owner.applyDocument(
      { ...before, title: 'Staged epoch control' },
      {},
      {
        beforeCommit: () => {
          permissionCalled = true
        },
        expectedDocumentEpoch: epoch,
        expectedDocumentRevision: before.documentRevision,
      },
    )
    const refused = assert.rejects(pending, { code: 'EDIT_CONFLICT' })
    await entered.promise
    try {
      await editUndo(f)
    } finally {
      release.release()
    }
    await refused
    f.setBeforeEdit()
    assert.equal(
      permissionCalled,
      false,
      'The epoch guard refuses independently of any review-token callback.',
    )
    assert.deepEqual(owner.document, before)
    assert.equal(owner.canUndo, false)
  })
})

test('ordinary Apply retains its Project draft and Size behavior alongside a reviewed Smart owner', async () => {
  await withProject(async (f) => {
    const before = document(f)
    const smart = application(f, review(f))
    await f.service.applyPreset(
      f.tabId,
      {
        documentId: before.documentId,
        payload: {
          prompt: { embeddingRefs: [], text: 'Ordinary Project Apply' },
          size: { height: 832, width: 1216 },
        },
        selectedSections: ['prompt', 'size'],
        sourcePresetId: f.source.id,
      },
      (request, current) => f.models.verifyPresetApplication(request, current),
    )
    const expected = structuredClone(before)
    expected.generationDraft.positivePrompt = { embeddingRefs: [], text: 'Ordinary Project Apply' }
    expected.primaryBbox = { ...expected.primaryBbox, height: 832, width: 1216 }
    assert.deepEqual(content(document(f)), content(expected))
    await assert.rejects(f.service.applySmartPatchPreset(f.tabId, smart, f.verify), {
      code: 'EDIT_CONFLICT',
    })
    const undone = await f.service.undo(f.tabId)
    assert.equal(undone.canUndo, false)
    assert.deepEqual(content(document(f)), content(before))
  })
})

test('dirty real shadow recovery preserves applied settings and assets but never persists a review token', async () => {
  await withProject(async (f) => {
    const before = document(f)
    const file = await readFile(f.savedPath)
    const request = application(f, review(f))
    await f.service.applySmartPatchPreset(f.tabId, request, f.verify)
    const expected = document(f)
    await f.service.flushAutosave(f.tabId)
    const inspected = await f.shadow.inspect({
      projectPath: f.savedPath,
      savedPackage: await readIgsPackage(f.savedPath),
    })
    assert.equal(inspected.status, 'recoverable')
    if (inspected.status !== 'recoverable') {
      throw new Error('Expected genuine dirty shadow.')
    }
    assert.deepEqual(inspected.document, expected)
    assert.ok((await readFile(f.savedPath)).equals(file))
    const restarted = f.restart()
    assert.equal((await restarted.open(f.tabId)).kind, 'recovery-required')
    await restarted.resolveRecovery(f.tabId, 'recover')
    await assert.rejects(restarted.applySmartPatchPreset(f.tabId, request, f.verify), {
      code: 'EDIT_CONFLICT',
    })
    assert.deepEqual(content(document(f, restarted)), content(expected))
    await restarted.save(f.tabId)
    const saved = await readIgsPackage(f.savedPath)
    assert.deepEqual(content(saved.project), content(expected))
    assert.deepEqual(saved.project.generationDraft, before.generationDraft)
    for (const [name, bytes] of Object.entries(f.assets)) {
      assert.ok((await saved.readMember(name)).equals(bytes), name)
    }
    const raw = (await saved.readMember('project.json')).toString('utf8')
    assert.equal(raw.includes(request.reviewToken), false)
    assert.equal(raw.includes('sourcePresetId'), false)
    await restarted.close(f.tabId)
    assert.equal((await restarted.open(f.tabId)).kind, 'opened')
    assert.deepEqual(content(document(f, restarted)), content(expected))
  })
})
