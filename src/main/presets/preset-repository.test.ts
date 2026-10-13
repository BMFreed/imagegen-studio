import type { PresetDefinition, PresetPayload } from '../../shared/presets/preset-schema.js'

import type { KyselyPlugin } from 'kysely'

import Database from 'better-sqlite3'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { AppDatabase } from '../db/database.js'

import { openAppDatabase } from '../db/database.js'
import { PresetRepository, PresetRepositoryError } from './preset-repository.js'

const migrations = path.resolve('src/main/db/migrations')
const createdAt = '2026-10-13T10:00:00.000Z'
const expiresAt = '2026-11-12T10:00:00.000Z'

interface Fixture {
  clock: { calls: number; epoch: number }
  readonly database: AppDatabase
  reopen: () => Promise<void>
  repository: (options?: { id?: () => string; plugin?: KyselyPlugin }) => PresetRepository
  root: string
}

async function withFixture(action: (fixture: Fixture) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-preset-repository-'))
  let database = openAppDatabase(root, migrations)
  const clock = { calls: 0, epoch: Date.parse(createdAt) }
  try {
    await action({
      clock,
      get database() {
        return database
      },
      reopen: async () => {
        await database.close()
        database = openAppDatabase(root, migrations)
      },
      repository: (options = {}) =>
        new PresetRepository(
          options.plugin ? database.db.withPlugin(options.plugin) : database.db,
          {
            id: options.id,
            now: () => {
              clock.calls += 1
              return new Date(clock.epoch)
            },
          },
        ),
      root,
    })
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

function definition(
  payload: PresetPayload = { prompt: { embeddingRefs: [], text: 'a quiet studio' } },
): PresetDefinition {
  return {
    description: 'User-authored settings',
    favorite: true,
    name: 'Studio',
    payload,
    tags: ['portrait', 'local'],
    workflow: 'imageToImage',
  }
}

function resource(kind: 'checkpoint' | 'embedding' | 'lora' | 'vae') {
  return {
    baseModelFamily: 'illustrious' as const,
    civitaiFileId: 33,
    civitaiModelId: 11,
    civitaiVersionId: 22,
    displayName: `Copied ${kind}`,
    fileSha256: 'a'.repeat(64),
    kind,
    localModelId: '436b5c44-b619-4aad-879d-d9027fd83bd1',
    localVersionId: 'aef4765c-c1b6-47cd-aa01-cb62744727b7',
    predictionType: kind === 'checkpoint' ? ('v_prediction' as const) : null,
    versionName: 'exact version',
  }
}

function rejectCode(code: PresetRepositoryError['code']) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof PresetRepositoryError)
    assert.equal(error.code, code)
    return true
  }
}

/** Hold a genuine SQLite SELECT result; release is the observed async boundary, not a sleep. */
function heldRead() {
  let armed = false
  let entered!: () => void
  let release!: () => void
  const reading = new Promise<void>((resolve) => {
    entered = resolve
  })
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const plugin: KyselyPlugin = {
    transformQuery: ({ node }) => node,
    transformResult: async ({ result }) => {
      if (armed && result.rows.some((row) => 'payload_json' in row)) {
        armed = false
        entered()
        await held
      }
      return result
    },
  }
  return {
    arm: () => {
      armed = true
    },
    plugin,
    reading,
    release,
  }
}

test('preset records cross the real SQLite writer/reopen boundary with detached metadata and exact seed zero', async () => {
  await withFixture(async (fixture) => {
    const repository = fixture.repository()
    const input = definition({
      cfgRescale: 0,
      denoisingStrength: 0,
      guidance: { cfgScale: 0, steps: 1 },
      loras: [],
      negativePrompt: { embeddingRefs: [], text: '' },
      prompt: { embeddingRefs: [], text: 'studio (свет:1.2)' },
      seed: { policy: 'fixed', value: 0 },
      vae: null,
    })
    const expected = structuredClone(input)
    const creating = repository.create(input)
    input.name = 'Changed after call'
    input.tags.push('late tag')
    input.payload.seed = { policy: 'fixed', value: 99 }
    input.payload.prompt!.text = 'late prompt'
    const created = await creating
    assert.deepEqual(created, {
      ...expected,
      deletedAt: null,
      expiresAt: null,
      id: created.id,
      updatedAt: createdAt,
    })
    assert.equal(
      fixture.clock.calls,
      1,
      'create captures its clock once before asynchronous storage',
    )
    const expectedRecord = structuredClone(created)
    created.tags.length = 0
    created.payload.prompt!.text = 'mutated response'
    assert.deepEqual(await repository.get(created.id), expectedRecord)
    await fixture.reopen()
    const fresh = fixture.repository()
    assert.deepEqual(await fresh.get(created.id), expectedRecord)
    assert.deepEqual(await fresh.list(), [expectedRecord])
    const raw = await fixture.database.db
      .selectFrom('presets')
      .selectAll()
      .executeTakeFirstOrThrow()
    assert.equal(raw.workflow_type, 'img2img')
    assert.equal(raw.created_at, createdAt)
    assert.deepEqual(JSON.parse(raw.payload_json), expected.payload)
  })
})

test('updates replace only the explicit definition, normalize workflow and preserve missing versus empty sections after reopen', async () => {
  await withFixture(async (fixture) => {
    const repository = fixture.repository()
    const original = await repository.create(definition({ denoisingStrength: 0.5, loras: [] }))
    fixture.clock.epoch += 1000
    const input = {
      ...definition({ loras: [], seed: { policy: 'reuse' } }),
      name: '  Updated  ',
      workflow: 'textToImage' as const,
    }
    const updated = await repository.update(original.id, input)
    assert.equal(updated.id, original.id)
    assert.equal(updated.name, 'Updated')
    assert.deepEqual(updated.payload, { loras: [], seed: { policy: 'reuse' } })
    assert.equal('denoisingStrength' in updated.payload, false)
    assert.equal('prompt' in updated.payload, false)
    assert.equal('vae' in updated.payload, false)
    assert.equal(updated.updatedAt, '2026-10-13T10:00:01.000Z')
    assert.equal(
      (
        await fixture.database.db
          .selectFrom('presets')
          .select('created_at')
          .executeTakeFirstOrThrow()
      ).created_at,
      createdAt,
    )
    await fixture.reopen()
    assert.deepEqual(await fixture.repository().get(original.id), updated)
    const normalized = await fixture.repository().update(original.id, {
      ...definition({ denoisingStrength: 0.7, vae: null }),
      workflow: 'textToImage',
    })
    assert.deepEqual(normalized.payload, { vae: null })
  })
})

test('duplicate creates a detached active identity while preserving copied metadata and leaving the source unchanged', async () => {
  await withFixture(async (fixture) => {
    const repository = fixture.repository()
    const original = await repository.create(definition())
    fixture.clock.epoch += 1000
    const copy = await repository.duplicate(original.id)
    assert.notEqual(copy.id, original.id)
    assert.equal(copy.name, 'Studio (copy)')
    assert.equal(copy.favorite, true)
    assert.deepEqual(copy.payload, original.payload)
    assert.deepEqual(copy.tags, original.tags)
    assert.equal(copy.updatedAt, '2026-10-13T10:00:01.000Z')
    assert.deepEqual(await repository.get(original.id), original)
    const named = await repository.duplicate(original.id, '  Named copy  ')
    assert.equal(named.name, 'Named copy')
    copy.payload.prompt!.text = 'only returned copy'
    assert.deepEqual((await repository.get(copy.id))?.payload, original.payload)
    assert.equal((await repository.list()).length, 3)
    await assert.rejects(
      repository.duplicate(original.id, '   '),
      rejectCode('PRESET_INPUT_INVALID'),
    )
    assert.equal((await repository.list()).length, 3)
  })
})

test('soft deletion hides the whole definition, preserves it in Deleted, and repeated Delete never extends its original deadline', async () => {
  await withFixture(async (fixture) => {
    const repository = fixture.repository()
    const record = await repository.create(
      definition({ loras: [], seed: { policy: 'fixed', value: 0 } }),
    )
    const deleted = await repository.softDelete(record.id)
    assert.equal(deleted.deletedAt, createdAt)
    assert.equal(
      deleted.expiresAt,
      expiresAt,
      'the product recovery window is exactly thirty elapsed UTC days',
    )
    assert.deepEqual(deleted.payload, record.payload)
    assert.equal(await repository.get(record.id), null)
    assert.deepEqual(await repository.get(record.id, { includeDeleted: true }), deleted)
    assert.deepEqual(await repository.list(), [])
    assert.deepEqual(await repository.list({ deleted: true }), [deleted])
    const rowsBefore = await fixture.database.db.selectFrom('presets').selectAll().execute()
    fixture.clock.epoch = Date.parse('2026-10-28T10:00:00.000Z')
    assert.deepEqual(await repository.softDelete(record.id), deleted)
    assert.deepEqual(
      await fixture.database.db.selectFrom('presets').selectAll().execute(),
      rowsBefore,
    )
    await assert.rejects(repository.update(record.id, definition()), rejectCode('PRESET_DELETED'))
    await assert.rejects(repository.duplicate(record.id), rejectCode('PRESET_DELETED'))
    assert.deepEqual(
      await fixture.database.db.selectFrom('presets').selectAll().execute(),
      rowsBefore,
    )
    await fixture.reopen()
    const reopened = fixture.repository()
    assert.deepEqual(await reopened.list({ deleted: true }), [deleted])
    const restored = await reopened.restore(record.id)
    assert.equal(restored.id, record.id)
    assert.deepEqual(restored.payload, record.payload)
    assert.equal(restored.deletedAt, null)
    assert.equal(restored.expiresAt, null)
    assert.deepEqual(await reopened.list({ deleted: true }), [])
    assert.deepEqual(await reopened.list(), [restored])
    await assert.rejects(reopened.restore(record.id), rejectCode('PRESET_NOT_DELETED'))
  })
})

test('restore and purge distinguish one millisecond before the exact deadline from the deadline and after it', async (t) => {
  for (const [offset, allowed] of [
    [-1, true],
    [0, false],
    [1, false],
  ] as const) {
    await t.test(`expiry ${offset >= 0 ? '+' : ''}${offset}ms`, async () => {
      await withFixture(async (fixture) => {
        const repository = fixture.repository()
        const active = await repository.create({ ...definition(), name: 'Active neighbor' })
        const target = await repository.create(definition())
        const deleted = await repository.softDelete(target.id)
        fixture.clock.epoch = Date.parse(expiresAt) + offset
        await fixture.reopen()
        const reopened = fixture.repository()
        assert.deepEqual(await reopened.get(target.id, { includeDeleted: true }), deleted)
        if (allowed) {
          assert.equal(await reopened.purgeExpired(), 0)
          const restored = await reopened.restore(target.id)
          assert.deepEqual(restored.payload, target.payload)
          assert.equal(restored.id, target.id)
          assert.equal(restored.deletedAt, null)
        } else {
          await assert.rejects(reopened.restore(target.id), rejectCode('PRESET_EXPIRED'))
          assert.deepEqual(await reopened.get(target.id, { includeDeleted: true }), deleted)
          assert.equal(await reopened.purgeExpired(), 1)
          assert.equal(await reopened.get(target.id, { includeDeleted: true }), null)
          await assert.rejects(reopened.restore(target.id), rejectCode('PRESET_NOT_FOUND'))
        }
        assert.deepEqual(await reopened.get(active.id), active)
      })
    })
  }
})

test('thirty-day expiry uses elapsed UTC time across a daylight-saving transition and survives application restart', async () => {
  await withFixture(async (fixture) => {
    fixture.clock.epoch = Date.parse('2026-03-15T08:30:00.000Z')
    const repository = fixture.repository()
    const record = await repository.create(definition())
    const deleted = await repository.softDelete(record.id)
    assert.equal(deleted.expiresAt, '2026-04-14T08:30:00.000Z')
    fixture.clock.epoch = Date.parse('2026-04-14T08:29:59.999Z')
    await fixture.reopen()
    assert.equal(await fixture.repository().purgeExpired(), 0)
    fixture.clock.epoch += 1
    await fixture.reopen()
    assert.equal(await fixture.repository().purgeExpired(), 1)
    await fixture.reopen()
    assert.deepEqual(await fixture.repository().list({ deleted: true }), [])
  })
})

test('resource disappearance cannot cascade into a preset or rewrite its exact refs, noise snapshot and prompt sidecars', async () => {
  await withFixture(async (fixture) => {
    const now = createdAt
    const model = resource('checkpoint')
    await fixture.database.db
      .insertInto('model_resource')
      .values({
        civitai_model_id: 11,
        created_at: now,
        creator: null,
        default_version_id: null,
        description: null,
        display_name: model.displayName,
        id: model.localModelId,
        preview_url: null,
        source_checked_at: null,
        source_key: 'civitai:11',
        source_kind: 'civitai',
        source_metadata_json: '{}',
        type: 'checkpoint',
        updated_at: now,
      })
      .execute()
    await fixture.database.db
      .insertInto('model_resource_version')
      .values({
        base_model_family: 'illustrious',
        civitai_file_id: 33,
        civitai_model_version_id: 22,
        created_at: now,
        expected_sha256: model.fileSha256,
        format: 'safetensors',
        id: model.localVersionId,
        model_resource_id: model.localModelId,
        prediction_type: 'v_prediction',
        source_metadata_json: '{}',
        source_revision: null,
        updated_at: now,
        version_name: model.versionName,
      })
      .execute()
    const repository = fixture.repository()
    const record = await repository.create(
      definition({
        loras: [{ enabled: false, resource: { ...resource('lora'), kind: 'lora' }, weight: -0.75 }],
        model: {
          ...model,
          kind: 'checkpoint',
          noiseProfile: {
            baseSchedule: 'sdxl-scaled-linear-v1',
            rescaleBetasZeroSnr: true,
            schemaVersion: 1,
            timestepSpacing: 'trailing',
          },
        },
        prompt: {
          embeddingRefs: [
            { resource: { ...resource('embedding'), kind: 'embedding' }, token: '<lamp>' },
          ],
          text: '(a <lamp>:1.2)',
        },
        seed: { policy: 'fixed', value: 0 },
        vae: { ...resource('vae'), kind: 'vae' },
      }),
    )
    await fixture.database.db
      .deleteFrom('model_resource')
      .where('id', '=', model.localModelId)
      .execute()
    assert.deepEqual(
      await fixture.database.db.selectFrom('model_resource_version').selectAll().execute(),
      [],
    )
    assert.deepEqual(await repository.get(record.id), record)
    await fixture.reopen()
    assert.deepEqual(await fixture.repository().get(record.id), record)
    const stored = await fixture.database.db
      .selectFrom('presets')
      .select('payload_json')
      .executeTakeFirstOrThrow()
    assert.deepEqual(JSON.parse(stored.payload_json), record.payload)
  })
})

test('restoring before expiry uses one captured clock even when the genuine SQLite read completes after the deadline', async () => {
  await withFixture(async (fixture) => {
    const plain = fixture.repository()
    const created = await plain.create(definition())
    await plain.softDelete(created.id)
    const hold = heldRead()
    const repository = fixture.repository({ plugin: hold.plugin })
    fixture.clock.epoch = Date.parse(expiresAt) - 1
    const calls = fixture.clock.calls
    hold.arm()
    const restoring = repository.restore(created.id)
    try {
      await hold.reading
      fixture.clock.epoch = Date.parse(expiresAt) + 1
    } finally {
      hold.release()
    }
    const restored = await restoring
    assert.equal(fixture.clock.calls - calls, 1)
    assert.equal(restored.updatedAt, '2026-11-12T09:59:59.999Z')
    assert.equal(restored.deletedAt, null)
    assert.deepEqual(restored.payload, created.payload)
  })
})

test('an update and Delete serialize through real transactions without losing the committed replacement payload', async () => {
  await withFixture(async (fixture) => {
    const hold = heldRead()
    const repository = fixture.repository({ plugin: hold.plugin })
    const record = await repository.create(definition())
    fixture.clock.epoch += 1000
    hold.arm()
    const updating = repository.update(
      record.id,
      definition({ seed: { policy: 'fixed', value: 0 } }),
    )
    let deleting!: ReturnType<PresetRepository['softDelete']>
    try {
      await hold.reading
      fixture.clock.epoch += 1000
      deleting = repository.softDelete(record.id)
    } finally {
      hold.release()
    }
    const [updated, deleted] = await Promise.all([updating, deleting])
    assert.deepEqual(updated.payload, { seed: { policy: 'fixed', value: 0 } })
    assert.deepEqual(deleted.payload, updated.payload)
    assert.equal(deleted.deletedAt, '2026-10-13T10:00:02.000Z')
    assert.deepEqual(await repository.get(record.id, { includeDeleted: true }), deleted)
    assert.equal(await repository.get(record.id), null)
  })
})

test('Delete winning a transaction race cannot be undone by a queued active update', async () => {
  await withFixture(async (fixture) => {
    const hold = heldRead()
    const repository = fixture.repository({ plugin: hold.plugin })
    const record = await repository.create(definition())
    hold.arm()
    const deleting = repository.softDelete(record.id)
    let rejectedUpdate!: Promise<void>
    try {
      await hold.reading
      rejectedUpdate = assert.rejects(
        repository.update(record.id, { ...definition(), name: 'Late update' }),
        rejectCode('PRESET_DELETED'),
      )
    } finally {
      hold.release()
    }
    const deleted = await deleting
    await rejectedUpdate
    assert.deepEqual(await repository.get(record.id, { includeDeleted: true }), deleted)
    assert.equal(deleted.name, record.name)
    assert.equal(await repository.get(record.id), null)
  })
})

test('Restore winning before expiry protects the identity from a queued cleanup at the deadline', async () => {
  await withFixture(async (fixture) => {
    const hold = heldRead()
    const repository = fixture.repository({ plugin: hold.plugin })
    const record = await repository.create(definition())
    await repository.softDelete(record.id)
    fixture.clock.epoch = Date.parse(expiresAt) - 1
    hold.arm()
    const restoring = repository.restore(record.id)
    let purging!: ReturnType<PresetRepository['purgeExpired']>
    try {
      await hold.reading
      fixture.clock.epoch += 1
      purging = repository.purgeExpired()
    } finally {
      hold.release()
    }
    const [restored, count] = await Promise.all([restoring, purging])
    assert.equal(count, 0)
    assert.equal(restored.id, record.id)
    assert.deepEqual(await repository.get(record.id), restored)
  })
})

test('cleanup winning at expiry cannot be followed by resurrection through a queued Restore', async () => {
  await withFixture(async (fixture) => {
    const hold = heldRead()
    const repository = fixture.repository({ plugin: hold.plugin })
    const record = await repository.create(definition())
    await repository.softDelete(record.id)
    fixture.clock.epoch = Date.parse(expiresAt)
    hold.arm()
    const purging = repository.purgeExpired()
    let rejectedRestore!: Promise<void>
    try {
      await hold.reading
      rejectedRestore = assert.rejects(
        repository.restore(record.id),
        rejectCode('PRESET_NOT_FOUND'),
      )
    } finally {
      hold.release()
    }
    await Promise.all([purging.then((count) => assert.equal(count, 1)), rejectedRestore])
    assert.equal(await repository.get(record.id, { includeDeleted: true }), null)
  })
})

test('invalid input, identity collisions and missing IDs cause typed refusals with no partial records', async () => {
  await withFixture(async (fixture) => {
    const id = randomUUID()
    const repository = fixture.repository({ id: () => id })
    const created = await repository.create(definition())
    const before = await fixture.database.db.selectFrom('presets').selectAll().execute()
    await assert.rejects(repository.create(definition()), rejectCode('PRESET_CONFLICT'))
    await assert.rejects(repository.duplicate(created.id), rejectCode('PRESET_CONFLICT'))
    for (const input of [
      { ...definition(), name: ' ' },
      { ...definition(), payload: {} },
      { ...definition(), payload: { path: '/secret/source' } },
    ]) {
      await assert.rejects(repository.create(input), rejectCode('PRESET_INPUT_INVALID'))
      await assert.rejects(repository.update(created.id, input), rejectCode('PRESET_INPUT_INVALID'))
    }
    await assert.rejects(repository.get('not-an-id'), rejectCode('PRESET_INPUT_INVALID'))
    await assert.rejects(repository.softDelete(randomUUID()), rejectCode('PRESET_NOT_FOUND'))
    await assert.rejects(
      repository.update(randomUUID(), definition()),
      rejectCode('PRESET_NOT_FOUND'),
    )
    await assert.rejects(repository.restore(randomUUID()), rejectCode('PRESET_NOT_FOUND'))
    await assert.rejects(repository.duplicate(randomUUID()), rejectCode('PRESET_NOT_FOUND'))
    assert.equal(await repository.get(randomUUID()), null)
    assert.deepEqual(await fixture.database.db.selectFrom('presets').selectAll().execute(), before)
  })
})

test('stored corruption is refused without silent normalization or automatic deletion, including valid expired neighbors', async (t) => {
  const corruptions = [
    ['payload_json', '{"unknown":true}'],
    ['payload_json', '{malformed'],
    ['tags_json', '[1]'],
    ['name', ' Untrimmed name '],
    ['deleted_at', '2026-02-30T10:00:00.000Z'],
    ['deleted_at', '2026-10-13T10:00:00+03:00'],
    ['workflow_type', 'unknown'],
    ['favorite', 2],
  ] as const
  for (const [column, value] of corruptions) {
    await t.test(`${column}: ${String(value)}`, async () => {
      await withFixture(async (fixture) => {
        const repository = fixture.repository()
        const target = await repository.create(definition())
        const neighbor = await repository.create({
          ...definition(),
          name: 'Healthy expired neighbor',
        })
        await repository.softDelete(target.id)
        await repository.softDelete(neighbor.id)
        const writer = new Database(fixture.database.filePath, { fileMustExist: true })
        try {
          writer.pragma('ignore_check_constraints = ON')
          writer.prepare(`UPDATE presets SET ${column} = ? WHERE id = ?`).run(value, target.id)
        } finally {
          writer.close()
        }
        const before = await fixture.database.db
          .selectFrom('presets')
          .selectAll()
          .orderBy('id')
          .execute()
        fixture.clock.epoch = Date.parse(expiresAt) + 1
        await assert.rejects(
          repository.get(target.id, { includeDeleted: true }),
          rejectCode('PRESET_STORAGE_INVALID'),
        )
        await assert.rejects(
          repository.list({ deleted: true }),
          rejectCode('PRESET_STORAGE_INVALID'),
        )
        await assert.rejects(repository.restore(target.id), rejectCode('PRESET_STORAGE_INVALID'))
        await assert.rejects(repository.purgeExpired(), rejectCode('PRESET_STORAGE_INVALID'))
        assert.deepEqual(
          await fixture.database.db.selectFrom('presets').selectAll().orderBy('id').execute(),
          before,
        )
        assert.equal((await repository.get(neighbor.id, { includeDeleted: true }))?.id, neighbor.id)
        assert.deepEqual(await repository.list(), [])
      })
    })
  }
})

test('a genuine SQLite failure after the first expiry deletion rolls back the whole cleanup and returns a safe error', async () => {
  await withFixture(async (fixture) => {
    const ids = ['10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002']
    const repository = fixture.repository({ id: () => ids.shift()! })
    const first = await repository.create(definition())
    const second = await repository.create({ ...definition(), name: 'Trigger refusal' })
    await repository.softDelete(first.id)
    await repository.softDelete(second.id)
    const before = await fixture.database.db
      .selectFrom('presets')
      .selectAll()
      .orderBy('id')
      .execute()
    const writer = new Database(fixture.database.filePath, { fileMustExist: true })
    try {
      writer.exec(`CREATE TRIGGER refuse_second_preset_delete BEFORE DELETE ON presets
        WHEN OLD.id = '${second.id}'
        BEGIN SELECT RAISE(ABORT, 'private diagnostic /secret/database'); END`)
      fixture.clock.epoch = Date.parse(expiresAt)
      await assert.rejects(repository.purgeExpired(), (error: unknown) => {
        rejectCode('PRESET_STORAGE_FAILED')(error)
        assert.ok(error instanceof Error)
        assert.equal(error.message.includes('private diagnostic'), false)
        assert.equal(error.message.includes('/secret/database'), false)
        return true
      })
      assert.deepEqual(
        await fixture.database.db.selectFrom('presets').selectAll().orderBy('id').execute(),
        before,
      )
      writer.exec('DROP TRIGGER refuse_second_preset_delete')
      assert.equal(await repository.purgeExpired(), 2)
      assert.deepEqual(await repository.list({ deleted: true }), [])
    } finally {
      writer.close()
    }
  })
})

test('the preset migration upgrades the sixteen-migration database without touching existing ordinary data', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-preset-upgrade-'))
  const legacy = path.join(root, 'legacy-migrations')
  await cp(migrations, legacy, { recursive: true })
  await rm(path.join(legacy, '0017_presets.sql'))
  let application: AppDatabase | null = null
  try {
    application = openAppDatabase(root, legacy)
    await application.db
      .insertInto('app_metadata')
      .values({ key: 'existing', value: 'ordinary state remains' })
      .execute()
    const policy = {
      prediction_type: 'v_prediction',
      sha256: 'a'.repeat(64),
      size_bytes: 123,
      updated_at: createdAt,
    }
    await application.db.insertInto('checkpoint_prediction_override').values(policy).execute()
    const noise = {
      rescale_betas_zero_snr: 1,
      sha256: policy.sha256,
      size_bytes: policy.size_bytes,
      timestep_spacing: 'leading',
      updated_at: createdAt,
    }
    await application.db.insertInto('checkpoint_noise_profile_override').values(noise).execute()
    const before = await application.db
      .selectFrom('schema_migrations')
      .selectAll()
      .orderBy('name')
      .execute()
    assert.equal(before.length, 16)
    await application.close()
    application = null
    application = openAppDatabase(root, migrations)
    assert.deepEqual(
      await application.db.selectFrom('checkpoint_prediction_override').selectAll().execute(),
      [policy],
    )
    assert.deepEqual(
      await application.db.selectFrom('checkpoint_noise_profile_override').selectAll().execute(),
      [noise],
    )
    assert.deepEqual(await application.db.selectFrom('app_metadata').selectAll().execute(), [
      { key: 'existing', value: 'ordinary state remains' },
    ])
    assert.deepEqual(
      await application.db
        .selectFrom('schema_migrations')
        .selectAll()
        .where('name', '!=', '0017_presets.sql')
        .orderBy('name')
        .execute(),
      before,
    )
    assert.deepEqual(await application.db.selectFrom('presets').selectAll().execute(), [])
    const repository = new PresetRepository(application.db, { now: () => new Date(createdAt) })
    const record = await repository.create(definition())
    await application.close()
    application = null
    application = openAppDatabase(root, migrations)
    assert.deepEqual(await new PresetRepository(application.db).get(record.id), record)
    const raw = new Database(application.filePath, { fileMustExist: true })
    try {
      assert.equal(
        raw
          .prepare<[string], { strict: number }>(
            'SELECT strict FROM pragma_table_list WHERE name = ?',
          )
          .get('presets')?.strict,
        1,
      )
      assert.deepEqual(raw.prepare('PRAGMA foreign_key_list(presets)').all(), [])
      const insert = raw.prepare(
        'INSERT INTO presets (id, name, workflow_type, tags_json, favorite, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      const values = [
        randomUUID(),
        'Invalid raw row',
        'txt2img',
        '[]',
        0,
        '{}',
        createdAt,
        createdAt,
      ]
      for (const [index, value] of [
        [2, 'arbitrary'],
        [3, '{}'],
        [3, 'not JSON'],
        [4, 2],
        [5, '[]'],
        [5, 'not JSON'],
      ] as const) {
        const invalid = [...values]
        invalid[index] = value
        assert.throws(() => insert.run(...invalid))
      }
      assert.throws(() =>
        raw
          .prepare('UPDATE presets SET favorite = ? WHERE id = ?')
          .run(Buffer.from([1]), record.id),
      )
    } finally {
      raw.close()
    }
  } finally {
    await application?.close()
    await rm(root, { force: true, recursive: true })
  }
})
