import { type ApiResult, ipcChannels } from '../../shared/api.js'
import {
  isPresetRecord,
  type PresetDefinition,
  type PresetRecord,
} from '../../shared/presets/preset-schema.js'

import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { AppDatabase } from '../db/database.js'

import { openAppDatabase } from '../db/database.js'
import { registerPresetIpc } from './preset-ipc.js'
import { PresetRepository } from './preset-repository.js'
import { PresetService } from './preset-service.js'

type Handler = Parameters<Parameters<typeof registerPresetIpc>[0]['handle']>[1]
type Request = Parameters<Handler>[0]
type Channel = keyof typeof ipcChannels.presets
const migrations = path.resolve('src/main/db/migrations')
const timestamp = '2026-10-13T10:00:00.000Z'

interface Fixture {
  caller: Parameters<typeof registerPresetIpc>[1]
  database: AppDatabase
  handlers: Map<string, Handler>
  invoke: (channel: Channel, args: unknown[], request?: Request) => Promise<ApiResult<unknown>>
  repository: PresetRepository
  service: PresetService
}

function definition(name = 'Studio'): PresetDefinition {
  return {
    description: 'Detached authoring',
    favorite: false,
    name,
    payload: { prompt: { embeddingRefs: [], text: 'a quiet studio' } },
    tags: ['local'],
    workflow: 'textToImage',
  }
}

async function withFixture(run: (fixture: Fixture) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-preset-ipc-'))
  const database = openAppDatabase(root, migrations)
  const repository = new PresetRepository(database.db, { now: () => new Date(timestamp) })
  const service = new PresetService(repository, { schedule: () => () => undefined })
  const caller = { mainFrame: {} }
  const handlers = new Map<string, Handler>()
  registerPresetIpc(
    {
      handle: (channel, handler) => {
        assert.equal(handlers.has(channel), false, 'channels cannot be registered twice')
        handlers.set(channel, handler)
      },
    },
    caller,
    service,
  )
  try {
    await service.start()
    await run({
      caller,
      database,
      handlers,
      invoke: (channel, args, request = { sender: caller, senderFrame: caller.mainFrame }) => {
        const handler = handlers.get(ipcChannels.presets[channel])
        assert.ok(handler)
        return handler(request, ...args)
      },
      repository,
      service,
    })
  } finally {
    await service.shutdown()
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

function recordValue(result: ApiResult<unknown>): PresetRecord {
  assert.equal(result.ok, true)
  assert.ok(result.ok)
  assert.ok(
    isPresetRecord(result.value),
    'native success must contain an actual validated production record',
  )
  return result.value
}

function refusal(result: ApiResult<unknown>, code: string): void {
  assert.equal(result.ok, false)
  assert.ok(!result.ok)
  assert.equal(result.error.code, code)
  assert.equal(typeof result.error.message, 'string')
  assert.ok(result.error.message.trim().length > 0)
  assert.deepEqual(Object.keys(result).sort(), ['error', 'ok'])
  assert.deepEqual(Object.keys(result.error).sort(), ['code', 'message'])
}

test('registered native preset handlers perform real SQLite create/get/list/update/duplicate/delete/restore', async () => {
  await withFixture(async (fixture) => {
    assert.deepEqual([...fixture.handlers.keys()].sort(), Object.values(ipcChannels.presets).sort())
    assert.equal(fixture.handlers.size, 7)
    assert.equal(
      fixture.handlers.has('presets:purge'),
      false,
      'permanent automatic cleanup has no public endpoint',
    )
    const input = {
      ...definition('  Studio  '),
      payload: { denoisingStrength: 0.25, prompt: { embeddingRefs: [], text: 'lamp' } },
    }
    const created = recordValue(await fixture.invoke('create', [input]))
    assert.equal(created.name, 'Studio')
    assert.deepEqual(created.payload, { prompt: { embeddingRefs: [], text: 'lamp' } })
    assert.deepEqual(await fixture.invoke('get', [created.id, {}]), { ok: true, value: created })
    assert.deepEqual(await fixture.invoke('list', [{}]), { ok: true, value: [created] })
    const editedDefinition: PresetDefinition = {
      ...definition('Edited studio'),
      favorite: true,
      payload: { loras: [], seed: { policy: 'fixed', value: 0 }, vae: null },
      workflow: 'imageToImage',
    }
    const updated = recordValue(await fixture.invoke('update', [created.id, editedDefinition]))
    assert.equal(updated.id, created.id)
    assert.deepEqual(updated.payload, editedDefinition.payload)
    assert.equal(updated.favorite, true)
    const duplicated = recordValue(
      await fixture.invoke('duplicate', [created.id, 'Independent copy']),
    )
    assert.notEqual(duplicated.id, created.id)
    assert.equal(duplicated.name, 'Independent copy')
    assert.deepEqual(duplicated.payload, updated.payload)
    const deleted = recordValue(await fixture.invoke('softDelete', [created.id]))
    assert.equal(deleted.deletedAt, timestamp)
    assert.equal(deleted.expiresAt, '2026-11-12T10:00:00.000Z')
    assert.deepEqual(await fixture.invoke('get', [created.id, {}]), { ok: true, value: null })
    assert.deepEqual(await fixture.invoke('get', [created.id, { includeDeleted: true }]), {
      ok: true,
      value: deleted,
    })
    assert.deepEqual(await fixture.invoke('list', [{ deleted: true }]), {
      ok: true,
      value: [deleted],
    })
    assert.deepEqual(await fixture.invoke('list', [{}]), { ok: true, value: [duplicated] })
    refusal(await fixture.invoke('update', [created.id, definition()]), 'PRESET_DELETED')
    refusal(await fixture.invoke('duplicate', [created.id, undefined]), 'PRESET_DELETED')
    const restored = recordValue(await fixture.invoke('restore', [created.id]))
    assert.equal(restored.deletedAt, null)
    assert.equal(restored.expiresAt, null)
    assert.deepEqual(restored.payload, editedDefinition.payload)
    assert.deepEqual(await fixture.repository.get(restored.id), restored)
    const rows = await fixture.database.db.selectFrom('presets').selectAll().orderBy('id').execute()
    assert.equal(rows.length, 2)
    assert.equal(
      rows.every((row) => row.workflow_type === 'img2img'),
      true,
    )
    assert.equal(
      rows.every((row) => row.deleted_at === null),
      true,
    )
  })
})

test('every preset channel refuses foreign senders and frames before touching actual stored rows', async () => {
  await withFixture(async (fixture) => {
    const created = await fixture.repository.create(definition())
    const before = await fixture.database.db.selectFrom('presets').selectAll().execute()
    const requests: [Channel, unknown[]][] = [
      ['create', [definition()]],
      ['get', [created.id, {}]],
      ['list', [{}]],
      ['update', [created.id, definition('Other')]],
      ['duplicate', [created.id, undefined]],
      ['softDelete', [created.id]],
      ['restore', [created.id]],
    ]
    for (const request of [
      { sender: { mainFrame: fixture.caller.mainFrame }, senderFrame: fixture.caller.mainFrame },
      { sender: fixture.caller, senderFrame: {} },
      { sender: fixture.caller, senderFrame: null },
      { sender: fixture.caller, senderFrame: undefined },
    ]) {
      for (const [channel, args] of requests) {
        refusal(await fixture.invoke(channel, args, request), 'IPC_INVALID_CALLER')
      }
    }
    assert.deepEqual(await fixture.database.db.selectFrom('presets').selectAll().execute(), before)
    assert.deepEqual(
      recordValue(await fixture.invoke('get', [created.id, {}])),
      created,
      'the actual main-frame neighbor remains functional',
    )
  })
})

test('malformed native command shapes and unsupported payloads return typed refusals without SQL changes', async () => {
  await withFixture(async (fixture) => {
    const created = await fixture.repository.create(definition())
    const before = await fixture.database.db.selectFrom('presets').selectAll().execute()
    const requests: [Channel, unknown[]][] = [
      ['create', []],
      ['create', [definition(), 'extra argument']],
      ['create', [{ name: 'Incomplete' }]],
      ['create', [{ ...definition(), payload: { regionalGuidance: [] } }]],
      ['get', [created.id]],
      ['get', ['not-an-id', {}]],
      ['get', [created.id, null]],
      ['get', [created.id, []]],
      ['get', [created.id, { includeDeleted: 'true' }]],
      ['get', [created.id, { deleted: true, includeDeleted: true }]],
      ['list', []],
      ['list', [{ deleted: 1 }]],
      ['list', [{ includeDeleted: true }]],
      ['list', [{ deleted: false }, {}]],
      ['update', [created.id]],
      ['update', ['invalid', definition()]],
      ['update', [created.id, null]],
      [
        'update',
        [created.id, { ...definition(), payload: { seed: { policy: 'reuse', value: 0 } } }],
      ],
      ['duplicate', [created.id]],
      ['duplicate', [created.id, 42]],
      ['duplicate', [created.id, '   ']],
      ['softDelete', [created.id, true]],
      ['softDelete', ['invalid']],
      ['restore', []],
      ['restore', ['invalid']],
    ]
    for (const [channel, args] of requests) {
      refusal(await fixture.invoke(channel, args), 'PRESET_INPUT_INVALID')
      assert.deepEqual(
        await fixture.database.db.selectFrom('presets').selectAll().execute(),
        before,
        `${channel} refusal preserves the persisted catalog`,
      )
    }
    assert.deepEqual(await fixture.invoke('get', [created.id, { includeDeleted: false }]), {
      ok: true,
      value: created,
    })
    assert.deepEqual(await fixture.invoke('list', [{ deleted: false }]), {
      ok: true,
      value: [created],
    })
  })
})

test('corrupt stored definitions keep their bytes and yield safe structured errors through real handlers', async () => {
  await withFixture(async (fixture) => {
    const created = await fixture.repository.create(definition())
    const privatePayload = '{"mask":{"path":"/private/user/model.safetensors"}}'
    await fixture.database.db
      .updateTable('presets')
      .set({ payload_json: privatePayload })
      .where('id', '=', created.id)
      .execute()
    const before = await fixture.database.db.selectFrom('presets').selectAll().execute()
    const result = await fixture.invoke('get', [created.id, {}])
    refusal(result, 'PRESET_STORAGE_INVALID')
    assert.ok(!result.ok)
    assert.equal(result.error.message.includes('/private'), false)
    assert.equal(result.error.message.includes('payload_json'), false)
    assert.deepEqual(await fixture.database.db.selectFrom('presets').selectAll().execute(), before)
    const missing = '533a0b45-cd81-447b-a02f-94f17ebbac4a'
    refusal(await fixture.invoke('update', [missing, definition()]), 'PRESET_NOT_FOUND')
    refusal(await fixture.invoke('restore', [missing]), 'PRESET_NOT_FOUND')
  })
})

test('registered handlers return unavailable after shutdown and preserve the real catalog', async () => {
  await withFixture(async (fixture) => {
    const created = await fixture.repository.create(definition())
    const before = await fixture.database.db.selectFrom('presets').selectAll().execute()
    await fixture.service.shutdown()
    for (const [channel, args] of [
      ['create', [definition()]],
      ['get', [created.id, {}]],
      ['list', [{}]],
      ['update', [created.id, definition('Late')]],
      ['duplicate', [created.id, undefined]],
      ['softDelete', [created.id]],
      ['restore', [created.id]],
    ] satisfies [Channel, unknown[]][]) {
      refusal(await fixture.invoke(channel, args), 'PRESET_UNAVAILABLE')
    }
    assert.deepEqual(await fixture.database.db.selectFrom('presets').selectAll().execute(), before)
  })
})
