import type { PresetApi, PresetApiResult, ProjectSmartPatchLayerView } from '../../shared/api.js'
import type { PresetDefinition } from '../../shared/presets/preset-schema.js'
import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { AppDatabase } from '../../main/db/database.js'
import type { PresetResultCreateIntent } from './preset-create-intent.js'

import { openAppDatabase } from '../../main/db/database.js'
import { PresetRepository, PresetRepositoryError } from '../../main/presets/preset-repository.js'
import { validatePresetDefinition } from './preset-editor.js'
import { PresetManagerSession } from './preset-manager-session.js'
import { createProjectPresetIntent } from './project-preset-draft.js'
import { captureSmartPatchPresetIntent } from './smart-patch-preset-draft.js'

const migrations = path.resolve('src/main/db/migrations')
const startedAt = Date.parse('2026-10-13T10:00:00.000Z')
const retention = 30 * 24 * 60 * 60 * 1000

interface Fixture {
  api: PresetApi
  clock: { now: number }
  database: AppDatabase
  reopen: () => Promise<void>
  repository: () => PresetRepository
}

/** The subject is the real renderer controller backed by the production SQLite repository. */
async function withFixture(action: (fixture: Fixture) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-preset-manager-'))
  let database = openAppDatabase(root, migrations)
  const clock = { now: startedAt }
  const repository = () => new PresetRepository(database.db, { now: () => new Date(clock.now) })
  const api: PresetApi = {
    create: (definition) => response(() => repository().create(definition)),
    duplicate: (id, name) => response(() => repository().duplicate(id, name)),
    get: (id, options) => response(() => repository().get(id, options)),
    list: (options) => response(() => repository().list(options)),
    restore: (id) => response(() => repository().restore(id)),
    softDelete: (id) => response(() => repository().softDelete(id)),
    update: (id, definition) => response(() => repository().update(id, definition)),
  }
  try {
    await action({
      api,
      clock,
      get database() {
        return database
      },
      reopen: async () => {
        await database.close()
        database = openAppDatabase(root, migrations)
      },
      repository,
    })
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

async function response<T>(action: () => Promise<T>): Promise<PresetApiResult<T>> {
  try {
    return { ok: true, value: await action() }
  } catch (error) {
    if (!(error instanceof PresetRepositoryError)) {
      throw error
    }
    return { error: { code: error.code, message: error.message }, ok: false }
  }
}

function definition(name = 'Studio'): PresetDefinition {
  return {
    description: 'Local authoring',
    favorite: false,
    name,
    payload: {
      loras: [],
      model: {
        baseModelFamily: 'illustrious',
        civitaiFileId: 33,
        civitaiModelId: 11,
        civitaiVersionId: 22,
        displayName: 'Copied checkpoint',
        fileSha256: 'a'.repeat(64),
        kind: 'checkpoint',
        localModelId: 'stored-resource',
        localVersionId: 'exact-version-b',
        noiseProfile: {
          baseSchedule: 'sdxl-scaled-linear-v1',
          rescaleBetasZeroSnr: true,
          schemaVersion: 1,
          timestepSpacing: 'trailing',
        },
        predictionType: 'v_prediction',
        versionName: 'Version B',
      },
      prompt: { embeddingRefs: [], text: 'soft studio lighting' },
      seed: { policy: 'fixed', value: 0 },
      vae: null,
    },
    tags: ['portrait'],
    workflow: 'textToImage',
  }
}

function held<T>() {
  let release!: (value: T) => void
  const promise = new Promise<T>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

function projectIntent() {
  const document = createEmptyProjectDocumentV1({
    primaryBbox: { height: 832, width: 1536, x: 120, y: -45 },
    title: 'Project source',
  })
  document.generationDraft.positivePrompt.text = 'Visible Project prompt'
  document.generationDraft.sampling.steps = 30
  document.generationDraft.sampling.cfgScale = 6
  document.generationDraft.seed = { policy: 'fixed', value: 0 }
  return createProjectPresetIntent({
    mode: 'txt2img',
    project: {
      generationDraft: document.generationDraft,
      layers: [],
      primaryBbox: document.primaryBbox,
      title: document.title,
    },
  })
}

/** A detached result source is input; this suite verifies the real authoring/storage owner. */
function resultIntent(): PresetResultCreateIntent {
  const resultDefinition = definition('Accepted portrait Preset')
  resultDefinition.payload.prompt = { embeddingRefs: [], text: 'expanded portrait in soft light' }
  resultDefinition.payload.negativePrompt = { embeddingRefs: [], text: 'expanded unwanted detail' }
  resultDefinition.payload.size = { height: 1024, width: 768 }
  delete resultDefinition.payload.seed
  return {
    definition: resultDefinition,
    kind: 'result',
    layerName: 'Accepted portrait',
    projectName: 'Result source project',
    projectSummary: '768 × 1024 · Copied checkpoint',
    unavailableSections: ['cfgRescale', 'vaePrecision'],
    workflowUnknown: false,
  }
}

function smartPatchDraftSource(
  family: 'anima' | 'illustrious' = 'illustrious',
  incomplete = false,
) {
  const document = createEmptyProjectDocumentV1({ title: 'Current Smart source.igs' })
  const { noiseProfile: _noiseProfile, ...model } = definition().payload.model!
  const draft = document.generationDraft
  draft.model = {
    ...model,
    baseModelFamily: family,
    predictionType: family === 'anima' ? null : model.predictionType,
  }
  draft.positivePrompt = {
    embeddingRefs: [
      {
        resource: { ...draft.model, kind: 'embedding', predictionType: null },
        token: '<saved-alias>',
      },
    ],
    text: '<saved-alias>, current authored {day|night}',
  }
  draft.negativePrompt.text = 'authored {fog|blur}'
  draft.loras = [
    {
      enabled: false,
      resource: { ...draft.model, kind: 'lora', predictionType: null },
      weight: -0.7,
    },
  ]
  draft.sampling = {
    animaMethod: 'heun',
    cfgScale: 0,
    denoisingStrength: 0,
    sampler: 'Euler',
    scheduler: 'Normal',
    steps: incomplete ? null : 24,
  }
  draft.cfgRescale = 0
  draft.vaePrecision = 'Auto'
  draft.seed = { policy: 'fixed', value: 0 }
  draft.dynamicPrompt = { maxPrompts: 200, seedBehavior: 'per-prompt' }
  const patch: ProjectSmartPatchLayerView = {
    activeRaster: null,
    activeRasterSubLayerId: null,
    blendMode: 'normal',
    boundingBox: { height: 384, width: 512, x: -73, y: 51 },
    generationDraft: draft,
    id: '11111111-1111-4111-8111-111111111111',
    internalResolution: { height: 192, width: 256 },
    kind: 'smart-patch',
    locked: true,
    mask: { asset: null, id: '22222222-2222-4222-8222-222222222222', revision: 0 },
    maskImageUrl: null,
    name: 'Current Patch',
    opacity: 1,
    rasterSubLayers: [],
    status: 'empty',
    visible: false,
  }
  const tab = {
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    id: `project-v1-${'a'.repeat(64)}`,
    layers: [patch],
    title: document.title,
  }
  const captured = captureSmartPatchPresetIntent({
    blocked: false,
    pendingDraft: false,
    selectedLayerId: patch.id,
    tab,
  })
  assert.ok(captured)
  return { ...captured, patch, tab }
}

test('Smart draft capture freezes source before held real catalog reads; edits, Cancel and late reload allocate no record', async () => {
  await withFixture(async ({ api, repository }) => {
    const neighbor = await repository().create(definition('Unrelated recipe'))
    const entered = held<void>()
    const deliver = held<void>()
    let closed = 0
    const session = new PresetManagerSession(
      {
        ...api,
        list: async (options) => {
          const result = await api.list(options)
          entered.release()
          await deliver.promise
          return result
        },
      },
      {
        onClose: () => {
          closed += 1
        },
      },
    )
    const { intent, patch, tab } = smartPatchDraftSource()
    const source = structuredClone(intent)
    const opening = session.openCreate(intent)
    patch.generationDraft.positivePrompt.text = 'Later Patch mutation'
    patch.name = 'Later Patch name'
    tab.title = 'Later Project name'
    intent.patchName = 'Caller changed captured name'
    intent.definition.payload.prompt!.embeddingRefs[0].resource.displayName = 'Caller changed ref'
    await entered.promise
    assert.deepEqual(session.state.createIntent, source)
    assert.deepEqual(session.state.draft, source.definition)
    assert.equal(session.state.creating, true)
    assert.equal(session.state.selectedId, null)
    assert.equal(session.valid, true)
    assert.deepEqual(await repository().list(), [neighbor])
    session.state.draft.name = 'Edited draft name'
    session.state.draft.payload.prompt!.text = 'Edited detached prompt'
    assert.deepEqual(session.state.createIntent, source)
    session.cancelCreate()
    assert.equal(closed, 1)
    assert.equal(session.isOpen, false)
    assert.equal(session.state.createIntent, null)
    deliver.release()
    await opening
    assert.equal(session.state.draft, null)
    assert.equal(session.state.selectedId, null)
    assert.deepEqual(await repository().list(), [neighbor])
  })
})

test('Smart draft real SQLite Create failure preserves source and edits; retry and reload persist only edited settings', async () => {
  for (const family of ['illustrious', 'anima'] as const) {
    await withFixture(async ({ api, database, reopen, repository }) => {
      const neighbor = await repository().create(definition('Unrelated recipe'))
      const { intent, patch, tab } = smartPatchDraftSource(family, true)
      const before = structuredClone({ intent, patch, tab })
      const session = new PresetManagerSession(api)
      await session.openCreate(intent)
      assert.equal(session.valid, false, 'unfinished acknowledged guidance remains editable')
      await session.save()
      assert.equal(session.state.error, null)
      assert.deepEqual(await repository().list(), [neighbor])
      session.state.draft!.payload.guidance!.steps = 24
      assert.equal(
        session.valid,
        true,
        'missing or incompatible authoring refs do not require a catalog',
      )
      session.state.draft!.name = `Reusable ${family} authored settings`
      session.state.draft!.payload.prompt!.text = 'Edited {sunrise|sunset}, <saved-alias>'
      session.state.draft!.payload.loras![0].weight = -1.2
      session.state.draft!.favorite = true
      const edited = structuredClone(session.state.draft!)
      const expected = validatePresetDefinition(edited)
      assert.ok(expected)
      // Fail the actual repository INSERT; the session and production SQLite command stay real.
      await sql`CREATE TRIGGER smart_draft_create_failure BEFORE INSERT ON presets BEGIN SELECT RAISE(ABORT, 'Owned Smart draft Create refusal'); END`.execute(
        database.db,
      )
      session.requestClose()
      await session.save()
      assert.ok(session.state.error)
      assert.equal(session.state.pending?.kind, 'close')
      assert.equal(session.state.busy, false)
      assert.equal(session.dirty, true)
      assert.equal(session.valid, true)
      assert.equal(session.state.selectedId, null)
      assert.deepEqual(session.state.draft, edited)
      assert.deepEqual(session.state.createIntent, intent)
      assert.deepEqual(await repository().list(), [neighbor])
      session.cancelPending()
      await sql`DROP TRIGGER smart_draft_create_failure`.execute(database.db)
      await session.save()
      const id = session.state.selectedId
      assert.ok(id)
      assert.equal(session.state.error, null)
      assert.equal(session.state.createIntent, null)
      assert.equal(session.state.creating, false)
      assert.equal(session.dirty, false)
      const stored = await repository().get(id)
      assert.ok(stored)
      assert.deepEqual(stored.payload, expected.payload)
      assert.equal(stored.name, expected.name)
      assert.equal(stored.workflow, 'smartPatch')
      assert.equal(Object.hasOwn(stored.payload, 'seed'), false)
      assert.equal(Object.hasOwn(stored.payload, 'size'), false)
      assert.equal(Object.hasOwn(stored, 'patchName'), false)
      assert.equal(Object.hasOwn(stored, 'projectName'), false)
      assert.equal(Object.hasOwn(stored, 'owner'), false)
      assert.equal(session.state.records.length, 2)
      assert.deepEqual({ intent, patch, tab }, before)
      session.requestClose()
      assert.equal(session.isOpen, false)
      await reopen()
      assert.deepEqual(await repository().get(id), stored)
      assert.deepEqual(await repository().get(neighbor.id), neighbor)
      const restored = new PresetManagerSession(api)
      await restored.open(id)
      assert.equal(restored.state.selectedId, id)
      assert.deepEqual(restored.state.draft, expected)
      assert.equal(restored.state.createIntent, null)
      assert.equal(restored.dirty, false)
    })
  }
})

test('Smart source banner and geometry exclusions survive detached edits, failed Create and retry without allocating on Cancel', async () => {
  await withFixture(async ({ api, reopen, repository }) => {
    let refuse = false
    const session = new PresetManagerSession({
      ...api,
      create: (input) =>
        refuse
          ? Promise.resolve({
              error: {
                code: 'PRESET_STORAGE_FAILED' as const,
                message: 'Controlled create refusal',
              },
              ok: false as const,
            })
          : api.create(input),
    })
    const source = resultIntent()
    source.definition.workflow = 'smartPatch'
    delete source.definition.payload.size
    source.layerName = 'Patch · Inactive result'
    source.projectSummary = 'Copied checkpoint · Exact version'
    source.smartGeometryExcluded = true
    const before = structuredClone(source)
    await session.openCreate(source)
    session.state.draft!.payload.prompt!.text = 'Detached prompt edit'
    assert.deepEqual(session.state.createIntent, before)
    session.cancelCreate()
    assert.deepEqual(await repository().list(), [])
    await session.openCreate(source)
    session.state.draft!.name = 'Reusable Smart settings'
    session.state.draft!.payload.prompt!.text = 'Explicit edited prompt'
    const edited = structuredClone(session.state.draft)
    refuse = true
    await session.save()
    assert.deepEqual(session.state.draft, edited)
    assert.deepEqual(session.state.createIntent, before)
    assert.equal(session.state.selectedId, null)
    assert.equal(session.dirty, true)
    assert.deepEqual(await repository().list(), [])
    refuse = false
    await session.save()
    const id = session.state.selectedId!
    assert.equal(session.state.createIntent, null)
    await reopen()
    const saved = await repository().get(id)
    assert.equal(saved?.workflow, 'smartPatch')
    assert.equal(saved?.payload.prompt?.text, 'Explicit edited prompt')
    assert.equal(Object.hasOwn(saved.payload, 'size'), false)
    assert.equal(Object.hasOwn(saved.payload, 'seed'), false)
    assert.equal(Object.hasOwn(saved, 'smartGeometryExcluded'), false)
    assert.deepEqual(source, before)
  })
})

test('result create captures its source before catalog await and Cancel never allocates or persists a preset', async () => {
  await withFixture(async ({ api, repository }) => {
    const neighboring = await repository().create(definition('Unrelated saved preset'))
    const entered = held<void>()
    const deliver = held<void>()
    let closed = 0
    const session = new PresetManagerSession(
      {
        ...api,
        list: async (options) => {
          const result = await api.list(options)
          entered.release()
          await deliver.promise
          return result
        },
      },
      {
        onClose: () => {
          closed += 1
        },
      },
    )
    const intent = resultIntent()
    const captured = structuredClone(intent)
    const opening = session.openCreate(intent)
    intent.layerName = 'Caller renamed layer'
    intent.definition.payload.prompt!.text = 'Caller changed current prompt'
    intent.unavailableSections.length = 0
    await entered.promise
    assert.deepEqual(session.state.createIntent, captured)
    assert.equal(session.state.selectedId, null)
    assert.equal(session.state.creating, true)
    assert.equal(session.state.draft?.payload.prompt?.text, 'expanded portrait in soft light')
    assert.equal(Object.hasOwn(session.state.draft.payload, 'seed'), false)
    session.state.draft.name = 'Edited reusable name'
    session.state.draft.payload.prompt.text = 'Explicit preset edit'
    assert.deepEqual(
      session.state.createIntent,
      captured,
      'authoring never edits the source banner',
    )
    session.cancelCreate()
    assert.equal(closed, 1)
    assert.equal(session.isOpen, false)
    assert.equal(session.state.createIntent, null)
    assert.equal(session.state.draft, null)
    deliver.release()
    await opening
    assert.equal(
      session.state.createIntent,
      null,
      'a late catalog cannot resurrect a canceled result',
    )
    assert.deepEqual(await repository().list(), [neighboring])
  })
})

test('result Create refusal retains the detached source and retry persists only edited portable settings across reopen', async () => {
  await withFixture(async (fixture) => {
    const neighboring = await fixture.repository().create(definition('Neighbor'))
    let refuse = true
    const session = new PresetManagerSession({
      ...fixture.api,
      create: (input) =>
        refuse
          ? Promise.resolve({
              error: {
                code: 'PRESET_STORAGE_FAILED' as const,
                message: 'Controlled result refusal',
              },
              ok: false as const,
            })
          : fixture.api.create(input),
    })
    const intent = resultIntent()
    await session.openCreate(intent)
    session.state.draft!.name = 'Reusable expanded portrait'
    session.state.draft!.description = 'Edited only in the authoring dialog'
    const draft = structuredClone(session.state.draft)
    session.requestClose()
    await session.save()
    assert.deepEqual(session.state.createIntent, intent)
    assert.deepEqual(session.state.draft, draft)
    assert.equal(session.state.selectedId, null)
    assert.equal(session.state.pending?.kind, 'close')
    assert.match(session.state.error!, /Controlled result refusal/)
    assert.deepEqual(await fixture.repository().list(), [neighboring])
    session.cancelPending()
    refuse = false
    await session.save()
    const createdId = session.state.selectedId!
    assert.notEqual(createdId, neighboring.id)
    assert.equal(session.state.createIntent, null)
    assert.equal(session.state.creating, false)
    assert.equal(session.dirty, false)
    const stored = await fixture.repository().get(createdId)
    assert.equal(stored?.name, 'Reusable expanded portrait')
    assert.equal(stored?.description, 'Edited only in the authoring dialog')
    assert.equal(stored?.payload.prompt?.text, 'expanded portrait in soft light')
    assert.equal(stored?.payload.negativePrompt?.text, 'expanded unwanted detail')
    assert.deepEqual(stored?.payload.size, { height: 1024, width: 768 })
    assert.equal(Object.hasOwn(stored.payload, 'seed'), false)
    assert.equal(Object.hasOwn(stored, 'layerName'), false)
    assert.deepEqual(await fixture.repository().get(neighboring.id), neighboring)
    assert.equal(session.requestClose(), true)
    await fixture.reopen()
    await session.open(createdId)
    assert.deepEqual(session.state.draft, draft)
    assert.equal(session.state.createIntent, null)
    assert.equal(session.state.records.length, 2)
  })
})

test('project create captures its source before catalog await and Cancel returns without a preset identity or write', async () => {
  await withFixture(async ({ api, repository }) => {
    const entered = held<void>()
    const deliver = held<void>()
    let closed = 0
    const session = new PresetManagerSession(
      {
        ...api,
        list: async (options) => {
          const result = await api.list(options)
          entered.release()
          await deliver.promise
          return result
        },
      },
      {
        onClose: () => {
          closed += 1
        },
      },
    )
    const intent = projectIntent()
    const source = structuredClone(intent)
    const opening = session.openCreate(intent)
    intent.projectName = 'Caller replaced source'
    intent.definition.payload.prompt!.text = 'Caller edited source'
    await entered.promise
    assert.deepEqual(session.state.createIntent, source)
    assert.equal(session.state.draft?.payload.prompt?.text, 'Visible Project prompt')
    assert.equal(session.state.selectedId, null)
    assert.equal(session.state.creating, true)
    assert.equal(session.dirty, true)
    assert.equal(Object.hasOwn(session.state.draft.payload, 'seed'), false)
    assert.deepEqual(await repository().list(), [])
    session.state.draft.name = 'Detached editor name'
    session.state.draft.payload.prompt.text = 'Detached editor prompt'
    assert.deepEqual(session.state.createIntent, source)
    session.cancelCreate()
    assert.equal(closed, 1)
    assert.equal(session.isOpen, false)
    assert.equal(session.state.createIntent, null)
    assert.equal(session.state.draft, null)
    assert.equal(session.state.selectedId, null)
    deliver.release()
    await opening
    assert.equal(session.state.createIntent, null)
    assert.deepEqual(await repository().list(), [])
  })
})

test('project create failure keeps the source and draft retryable; workflow requires choice before persistence', async () => {
  await withFixture(async ({ api, repository }) => {
    let refuse = true
    const session = new PresetManagerSession({
      ...api,
      create: (definition) =>
        refuse
          ? Promise.resolve({
              error: { code: 'PRESET_STORAGE_FAILED' as const, message: 'Controlled refusal' },
              ok: false as const,
            })
          : api.create(definition),
    })
    const intent = projectIntent()
    intent.definition.workflow = null
    intent.workflowUnknown = true
    await session.openCreate(intent)
    assert.equal(session.valid, false)
    await session.save()
    assert.equal(session.state.error, null, 'invalid authoring does not issue a backend command')
    assert.deepEqual(await repository().list(), [])
    session.state.draft!.workflow = 'textToImage'
    const source = structuredClone(session.state.createIntent)
    const draft = structuredClone(session.state.draft)
    session.requestClose()
    await session.save()
    assert.deepEqual(session.state.createIntent, source)
    assert.deepEqual(session.state.draft, draft)
    assert.equal(session.state.pending?.kind, 'close')
    assert.equal(session.dirty, true)
    assert.deepEqual(await repository().list(), [])
    session.cancelPending()
    assert.deepEqual(session.state.createIntent, source)
    refuse = false
    await session.save()
    assert.equal(session.state.creating, false)
    assert.equal(session.state.createIntent, null)
    assert.equal(session.dirty, false)
    const stored = await repository().get(session.state.selectedId!)
    assert.equal(stored?.name, 'Project source Baseline')
    assert.equal(Object.hasOwn(stored.payload, 'seed'), false)
    assert.deepEqual(stored?.payload.size, { height: 832, width: 1536 })
    assert.equal(session.state.records.length, 1)
    session.requestNew()
    assert.equal(session.state.createIntent, null)
    assert.equal(session.state.draft?.name, '')
    session.cancelCreate()
    assert.equal(
      session.state.selectedId,
      stored?.id,
      'manual create still returns to the previous saved selection',
    )
  })
})

test('project draft navigation clears source only after explicit transition; manual New is separately guarded', async () => {
  await withFixture(async ({ api, repository }) => {
    const record = await repository().create(definition())
    const session = new PresetManagerSession(api)
    await session.openCreate(projectIntent())
    const source = structuredClone(session.state.createIntent)
    session.requestSelect(record.id)
    assert.deepEqual(session.state.pending, { id: record.id, kind: 'select' })
    session.cancelPending()
    assert.deepEqual(session.state.createIntent, source)
    session.requestSelect(record.id)
    await session.discardPending()
    assert.equal(session.state.createIntent, null)
    assert.equal(session.state.selectedId, record.id)
    await session.openCreate(projectIntent())
    session.requestNew()
    assert.deepEqual(session.state.pending, { kind: 'new' })
    assert.ok(session.state.createIntent)
    await session.discardPending()
    assert.equal(session.state.createIntent, null)
    assert.equal(session.state.creating, true)
    assert.equal(session.state.draft?.name, '')
    assert.deepEqual(session.state.draft?.payload, { prompt: { embeddingRefs: [], text: '' } })
    assert.equal((await repository().list()).length, 1)
    await session.openCreate(projectIntent())
    session.requestView('deleted')
    await session.discardPending()
    assert.equal(session.state.createIntent, null)
    assert.equal(session.state.view, 'deleted')
    assert.equal(session.state.draft, null)
  })
})

test('a late ordinary catalog open cannot replace a newer Project source draft or its catalog', async () => {
  await withFixture(async ({ api, repository }) => {
    await repository().create(definition('First'))
    let delayed = true
    const entered = held<void>()
    const deliver = held<void>()
    const session = new PresetManagerSession({
      ...api,
      list: async (options) => {
        const result = await api.list(options)
        if (delayed) {
          entered.release()
          await deliver.promise
        }
        return result
      },
    })
    const oldOpen = session.open()
    await entered.promise
    delayed = false
    await repository().create(definition('Second'))
    const intent = projectIntent()
    await session.openCreate(intent)
    const draft = structuredClone(session.state.draft)
    deliver.release()
    await oldOpen
    assert.deepEqual(session.state.draft, draft)
    assert.deepEqual(session.state.createIntent, intent)
    assert.equal(session.state.selectedId, null)
    assert.equal(session.state.creating, true)
    assert.equal(session.state.records.length, 2)
    assert.equal(session.state.loading, false)
    assert.equal(session.dirty, true)
  })
})

test('manager creates and edits detached values through SQLite and survives reopening', async () => {
  await withFixture(async (fixture) => {
    const original = await fixture.repository().create(definition())
    const session = new PresetManagerSession(fixture.api)
    await session.open(original.id)
    const draft = session.state.draft!
    draft.name = 'Edited Studio'
    draft.payload.prompt!.text = 'different lighting'
    assert.equal(session.dirty, true)
    assert.deepEqual(await fixture.repository().get(original.id), original)
    await session.save()
    assert.equal(session.dirty, false)
    const saved = await fixture.repository().get(original.id)
    assert.equal(saved?.name, 'Edited Studio')
    assert.equal(saved?.payload.prompt?.text, 'different lighting')
    assert.deepEqual(saved?.payload.model, original.payload.model)
    assert.deepEqual(saved?.payload.seed, { policy: 'fixed', value: 0 })
    assert.equal(saved?.payload.vae, null)
    assert.deepEqual(saved?.payload.loras, [])

    session.requestNew()
    assert.equal(session.state.creating, true)
    assert.equal(session.state.records.length, 1)
    assert.deepEqual(session.state.draft?.payload, { prompt: { embeddingRefs: [], text: '' } })
    assert.equal(session.valid, false)
    await session.save()
    assert.equal((await fixture.repository().list()).length, 1)
    session.state.draft.name = 'New Preset'
    await session.save()
    const createdId = session.state.selectedId!
    assert.notEqual(createdId, original.id)
    assert.equal(session.state.creating, false)
    assert.equal(session.dirty, false)
    assert.equal(session.requestClose(), true)
    await fixture.reopen()
    await session.open(createdId)
    assert.equal(session.state.draft?.name, 'New Preset')
    assert.equal(session.state.records.length, 2)
  })
})

test('empty catalog stays clean; canceling an invalid manual draft never writes', async () => {
  await withFixture(async ({ api, repository }) => {
    const session = new PresetManagerSession(api)
    await session.open()
    assert.equal(session.state.draft, null)
    assert.equal(session.dirty, false)
    session.requestNew()
    const draft = structuredClone(session.state.draft)
    assert.equal(session.requestClose(), false)
    assert.deepEqual(session.state.pending, { kind: 'close' })
    await session.save()
    assert.deepEqual(session.state.draft, draft)
    assert.equal(session.isOpen, true)
    assert.deepEqual(await repository().list(), [])
    session.cancelPending()
    assert.deepEqual(session.state.draft, draft)
    session.cancelCreate()
    assert.equal(session.state.draft, null)
    assert.equal(session.dirty, false)
    assert.equal(session.requestClose(), true)
  })
})

test('record, view and close guards preserve edits until explicit Save or Discard', async () => {
  await withFixture(async ({ api, repository }) => {
    const first = await repository().create(definition('First'))
    const second = await repository().create(definition('Second'))
    let closed = 0
    let canceledClose = 0
    const session = new PresetManagerSession(api, {
      onClose: () => {
        closed += 1
      },
      onCloseCanceled: () => {
        canceledClose += 1
      },
    })
    await session.open(first.id)
    session.state.draft!.name = 'First edited'
    session.requestSelect(second.id)
    assert.equal(session.state.selectedId, first.id)
    assert.deepEqual(session.state.pending, { id: second.id, kind: 'select' })
    session.cancelPending()
    assert.equal(session.state.draft?.name, 'First edited')
    session.requestSelect(second.id)
    await session.save()
    assert.equal((await repository().get(first.id))?.name, 'First edited')
    assert.equal(session.state.selectedId, second.id)

    session.state.draft.description = 'Discard me'
    session.requestView('deleted')
    assert.equal(session.state.view, 'active')
    await session.discardPending()
    assert.equal(session.state.view, 'deleted')
    assert.equal((await repository().get(second.id))?.description, second.description)
    session.requestView('active')
    session.requestSelect(second.id)
    session.state.draft.name = 'Second edited'
    assert.equal(session.requestClose(), false)
    session.cancelPending()
    assert.equal(canceledClose, 1)
    assert.equal(closed, 0)
    assert.equal(session.state.draft?.name, 'Second edited')
    session.requestClose()
    await session.save()
    assert.equal(closed, 1)
    assert.equal(session.isOpen, false)
    assert.equal((await repository().get(second.id))?.name, 'Second edited')
  })
})

test('failed create and update retain the identical draft and pending close for retry', async () => {
  await withFixture(async ({ api, repository }) => {
    let reject = true
    const failure = {
      error: { code: 'PRESET_STORAGE_FAILED' as const, message: 'Admitted storage refusal' },
      ok: false as const,
    }
    const session = new PresetManagerSession({
      ...api,
      create: (input) => (reject ? Promise.resolve(failure) : api.create(input)),
      update: (id, input) => (reject ? Promise.resolve(failure) : api.update(id, input)),
    })
    await session.open()
    session.requestNew()
    session.state.draft!.name = 'Retry draft'
    const draft = structuredClone(session.state.draft)
    session.requestClose()
    await session.save()
    assert.deepEqual(session.state.draft, draft)
    assert.equal(session.dirty, true)
    assert.equal(session.state.pending?.kind, 'close')
    assert.match(session.state.error!, /PRESET_STORAGE_FAILED/)
    assert.deepEqual(await repository().list(), [])
    reject = false
    await session.save()
    assert.equal(session.isOpen, false)
    const saved = (await repository().list())[0]!
    await session.open(saved.id)
    session.state.draft!.name = 'Retry update'
    const edited = structuredClone(session.state.draft)
    reject = true
    session.requestClose()
    await session.save()
    assert.deepEqual(session.state.draft, edited)
    assert.equal(session.state.pending?.kind, 'close')
    assert.equal((await repository().get(saved.id))?.name, 'Retry draft')
    reject = false
    await session.save()
    assert.equal((await repository().get(saved.id))?.name, 'Retry update')
    assert.equal(session.isOpen, false)
  })
})

test('dirty duplication offers a guard; Save copies edits and Discard copies the saved record', async () => {
  await withFixture(async ({ api, repository }) => {
    const source = await repository().create(definition())
    const session = new PresetManagerSession(api)
    await session.open(source.id)
    session.state.draft!.name = 'Saved first'
    await session.duplicate()
    assert.equal((await repository().list()).length, 1)
    assert.deepEqual(session.state.pending, { kind: 'duplicate' })
    await session.save()
    const copy = await repository().get(session.state.selectedId!)
    assert.equal(copy?.name, 'Saved first (copy)')
    assert.equal((await repository().get(source.id))?.name, 'Saved first')
    assert.deepEqual(copy?.payload, source.payload)
    session.state.draft!.name = 'Discard before copying'
    await session.duplicate()
    await session.discardPending()
    assert.equal(session.state.draft?.name, 'Saved first (copy) (copy)')
    assert.equal((await repository().get(copy.id))?.name, 'Saved first (copy)')
  })
})

test('confirmed delete and restore preserve the exact payload through the Deleted view and expiry', async () => {
  await withFixture(async ({ api, clock, repository }) => {
    const original = await repository().create(definition())
    const session = new PresetManagerSession(api)
    await session.open(original.id)
    await session.softDelete()
    assert.equal(session.state.selectedId, null)
    assert.deepEqual(await repository().list(), [])
    session.requestView('deleted')
    session.requestSelect(original.id)
    assert.equal(session.state.draft, null)
    const deleted = session.state.records.find((record) => record.id === original.id)!
    assert.equal(deleted.expiresAt, new Date(startedAt + retention).toISOString())
    clock.now = startedAt + retention - 1
    await session.restore()
    assert.equal(session.state.view, 'active')
    assert.equal(session.state.selectedId, original.id)
    assert.deepEqual((await repository().get(original.id))?.payload, original.payload)
    await session.softDelete()
    session.requestView('deleted')
    session.requestSelect(original.id)
    const expired = session.state.records.find((record) => record.id === original.id)!
    clock.now = Date.parse(expired.expiresAt!)
    await session.restore()
    assert.match(session.state.error!, /PRESET_EXPIRED/)
    assert.equal(session.state.view, 'deleted')
    assert.equal(session.state.selectedId, original.id)
    assert.deepEqual(
      (await repository().get(original.id, { includeDeleted: true }))?.payload,
      original.payload,
    )
  })
})

test('stale reads cannot overwrite a reopened manager or reset a newer detached draft', async () => {
  await withFixture(async ({ api, repository }) => {
    const original = await repository().create(definition())
    let delay = true
    const entered = held<void>()
    const release = held<void>()
    const session = new PresetManagerSession({
      ...api,
      list: async (options) => {
        const result = await api.list(options)
        if (delay) {
          entered.release()
          await release.promise
        }
        return result
      },
    })
    const firstOpen = session.open(original.id)
    await entered.promise
    assert.equal(session.requestClose(), true)
    delay = false
    const newer = await repository().create(definition('Newest'))
    await session.open(newer.id)
    session.state.draft!.name = 'New session edit'
    const draft = structuredClone(session.state.draft)
    release.release()
    await firstOpen
    assert.deepEqual(session.state.draft, draft)
    assert.equal(session.state.selectedId, newer.id)
    assert.equal(session.state.records.length, 2)
    assert.equal(session.state.draft?.name, 'New session edit')
    assert.equal(session.dirty, true)
  })
})

test('delayed write prevents duplicate commands and snapshots input before the await', async () => {
  await withFixture(async ({ api, repository }) => {
    const original = await repository().create(definition())
    const entered = held<void>()
    const release = held<void>()
    let updates = 0
    const session = new PresetManagerSession({
      ...api,
      update: async (id, input) => {
        updates += 1
        entered.release()
        await release.promise
        return api.update(id, input)
      },
    })
    await session.open(original.id)
    session.state.draft!.name = 'Captured update'
    const write = session.save()
    await entered.promise
    assert.equal(session.state.busy, true)
    await session.save()
    await session.duplicate()
    assert.equal(session.requestClose(), false)
    assert.equal(session.state.pending, null)
    assert.equal(updates, 1)
    // The UI disables editing while busy, but an external mutation must not alter the captured write.
    session.state.draft!.name = 'Too late'
    release.release()
    await write
    assert.equal((await repository().get(original.id))?.name, 'Captured update')
    assert.equal(session.state.draft?.name, 'Captured update')
    assert.equal(session.state.busy, false)
    assert.equal(session.dirty, false)
  })
})

test('a delayed refresh cannot resurrect a row changed by a later successful write', async () => {
  await withFixture(async ({ api, repository }) => {
    const original = await repository().create(definition())
    let delay = false
    const entered = held<void>()
    const release = held<void>()
    const session = new PresetManagerSession({
      ...api,
      list: async (options) => {
        const result = await api.list(options)
        if (delay) {
          entered.release()
          await release.promise
        }
        return result
      },
    })
    await session.open(original.id)
    delay = true
    const refresh = session.reload()
    await entered.promise
    session.state.draft!.name = 'After stale read'
    await session.save()
    release.release()
    await refresh
    assert.equal(
      session.state.records.find((record) => record.id === original.id)?.name,
      'After stale read',
    )
    assert.equal(session.state.draft?.name, 'After stale read')
    assert.equal(session.state.loading, false)
    assert.equal(session.dirty, false)
  })
})

test('raw invalid numeric input protects the unchanged model from Save, Close and record navigation', async () => {
  await withFixture(async ({ api, clock, repository }) => {
    const input = definition('First')
    input.payload.guidance = { cfgScale: 7, steps: 20 }
    const first = await repository().create(input)
    const second = await repository().create(definition('Second'))
    let notifications = 0
    const session = new PresetManagerSession(api, {
      onChange: () => {
        notifications += 1
      },
    })
    await session.open(first.id)
    const draft = structuredClone(session.state.draft)
    const revision = session.state.editorRevision
    const before = notifications
    // The view reports a raw '-' refusal; Naive has deliberately retained the old numeric model.
    session.setEditorValidity(false)
    session.setEditorValidity(false)
    assert.equal(notifications, before + 1)
    assert.equal(session.state.editorRevision, revision)
    assert.deepEqual(session.state.draft, draft)
    assert.equal(session.state.draft?.payload.guidance?.steps, 20)
    assert.equal(session.dirty, true)
    assert.equal(session.valid, false)
    clock.now += 1000
    await session.save()
    assert.deepEqual(await repository().get(first.id), first)
    assert.equal(session.requestClose(), false)
    session.cancelPending()
    assert.deepEqual(session.state.draft, draft)
    assert.equal(session.dirty, true)
    assert.equal(session.valid, false)
    session.requestSelect(second.id)
    assert.equal(session.state.selectedId, first.id)
    await session.discardPending()
    assert.equal(session.state.selectedId, second.id)
    assert.ok(session.state.editorRevision > revision)
    assert.equal(session.dirty, false)
    assert.equal(session.valid, true)
    session.setEditorValidity(false)
    session.requestClose()
    await session.discardPending()
    assert.equal(session.isOpen, false)
    assert.equal(session.dirty, false)
    assert.equal(session.state.pending, null)
    assert.deepEqual(await repository().get(first.id), first)
  })
})

test('corrected numeric input saves the actual value and clears validity before guarded duplication', async () => {
  await withFixture(async ({ api, repository }) => {
    const input = definition()
    input.payload.guidance = { cfgScale: 7, steps: 20 }
    const source = await repository().create(input)
    const session = new PresetManagerSession(api)
    await session.open(source.id)
    session.state.draft!.name = 'Corrected numeric input'
    session.setEditorValidity(false)
    await session.duplicate()
    await session.save()
    assert.deepEqual(session.state.pending, { kind: 'duplicate' })
    assert.equal((await repository().list()).length, 1)
    assert.deepEqual(await repository().get(source.id), source)
    session.state.draft!.payload.guidance!.steps = 21
    session.setEditorValidity(true)
    await session.save()
    const copy = await repository().get(session.state.selectedId!)
    assert.equal(copy?.name, 'Corrected numeric input (copy)')
    assert.equal(copy?.payload.guidance?.steps, 21)
    assert.equal((await repository().get(source.id))?.payload.guidance?.steps, 21)
    assert.equal(session.state.pending, null)
    assert.equal(session.dirty, false)
    assert.equal(session.valid, true)

    // Discarding raw input must reset validity before invoking the pending duplicate command.
    const revision = session.state.editorRevision
    session.setEditorValidity(false)
    await session.duplicate()
    assert.deepEqual(session.state.pending, { kind: 'duplicate' })
    await session.discardPending()
    assert.equal(session.state.draft?.name, 'Corrected numeric input (copy) (copy)')
    assert.ok(session.state.editorRevision > revision)
    assert.equal(session.dirty, false)
    assert.equal(session.valid, true)
    assert.equal((await repository().list()).length, 3)
  })
})

test('native close intent waits for a busy confirmed Delete and never guards the already-discarded draft', async () => {
  await withFixture(async ({ api, repository }) => {
    const original = await repository().create(definition())
    const committed = held<void>()
    const deliver = held<void>()
    const closeAttempted = held<void>()
    let closeIntent = false
    let closed = 0
    const session = new PresetManagerSession(
      {
        ...api,
        softDelete: async (id) => {
          const result = await api.softDelete(id)
          committed.release()
          // Hold transport delivery after the genuine repository operation, not a fabricated outcome.
          await deliver.promise
          return result
        },
      },
      {
        onChange: (state) => {
          if (closeIntent && !state.busy && !state.pending) {
            queueMicrotask(() => {
              if (closeIntent && !session.state.busy && !session.state.pending) {
                session.requestClose()
                closeAttempted.release()
              }
            })
          }
        },
        onClose: () => {
          closeIntent = false
          closed += 1
        },
      },
    )
    await session.open(original.id)
    session.state.draft!.name = 'Unsaved edits explicitly discarded by confirmed Delete'
    assert.equal(session.dirty, true)
    const deletion = session.softDelete()
    await committed.promise
    assert.equal(session.state.busy, true)
    assert.equal(await repository().get(original.id), null)
    const deleted = await repository().get(original.id, { includeDeleted: true })
    assert.equal(deleted?.name, original.name)
    assert.deepEqual(deleted?.payload, original.payload)
    closeIntent = true
    assert.equal(session.requestClose(), false)
    assert.equal(session.state.pending, null)
    deliver.release()
    await deletion
    await closeAttempted.promise
    assert.equal(closed, 1)
    assert.equal(session.isOpen, false)
    assert.equal(session.state.pending, null)
    assert.equal(session.state.draft, null)
    assert.equal(session.dirty, false)
  })
})
