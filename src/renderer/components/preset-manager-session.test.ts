import type { PresetApi, PresetApiResult } from '../../shared/api.js'
import type { PresetDefinition } from '../../shared/presets/preset-schema.js'

import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { AppDatabase } from '../../main/db/database.js'

import { openAppDatabase } from '../../main/db/database.js'
import { PresetRepository, PresetRepositoryError } from '../../main/presets/preset-repository.js'
import { PresetManagerSession } from './preset-manager-session.js'

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
