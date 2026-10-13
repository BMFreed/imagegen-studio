import type { PresetDefinition } from '../../shared/presets/preset-schema.js'

import type { KyselyPlugin } from 'kysely'

import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { AppDatabase } from '../db/database.js'

import { openAppDatabase } from '../db/database.js'
import {
  PRESET_RETENTION_MS,
  PresetRepository,
  PresetRepositoryError,
} from './preset-repository.js'
import {
  PRESET_PURGE_INTERVAL_MS,
  PresetService,
  PresetUnavailableError,
} from './preset-service.js'

const migrations = path.resolve('src/main/db/migrations')
const initialEpoch = Date.parse('2026-10-13T10:00:00.000Z')

interface Fixture {
  clock: { epoch: number }
  close: () => Promise<void>
  readonly database: AppDatabase
  reopen: () => Promise<void>
  repository: (plugin?: KyselyPlugin) => PresetRepository
}

function definition(name = 'Studio'): PresetDefinition {
  return {
    description: '',
    favorite: false,
    name,
    payload: { prompt: { embeddingRefs: [], text: 'a quiet studio' } },
    tags: [],
    workflow: 'textToImage',
  }
}

async function withFixture(run: (fixture: Fixture) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-preset-service-'))
  let database: AppDatabase | null = openAppDatabase(root, migrations)
  const clock = { epoch: initialEpoch }
  const close = async () => {
    if (database) {
      await database.close()
      database = null
    }
  }
  try {
    await run({
      clock,
      close,
      get database() {
        assert.ok(database)
        return database
      },
      reopen: async () => {
        await close()
        database = openAppDatabase(root, migrations)
      },
      repository: (plugin) => {
        assert.ok(database)
        return new PresetRepository(plugin ? database.db.withPlugin(plugin) : database.db, {
          now: () => new Date(clock.epoch),
        })
      },
    })
  } finally {
    await close()
    await rm(root, { force: true, recursive: true })
  }
}

function signal() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/** Pause one actual SQLite result before the repository commits its transaction. */
function heldPresetRead() {
  let armed = false
  const entered = signal()
  const released = signal()
  const plugin: KyselyPlugin = {
    transformQuery: ({ node }) => node,
    transformResult: async ({ result }) => {
      if (armed && result.rows.some((row) => 'payload_json' in row)) {
        armed = false
        entered.resolve()
        await released.promise
      }
      return result
    },
  }
  return {
    arm: () => {
      armed = true
    },
    entered: entered.promise,
    plugin,
    release: released.resolve,
  }
}

test('shutdown rejects all later admissions and drains a genuine SQLite transaction before database close', async () => {
  await withFixture(async (fixture) => {
    const held = heldPresetRead()
    const service = new PresetService(fixture.repository(held.plugin), {
      schedule: () => () => undefined,
    })
    await service.start()
    held.arm()
    const input = definition()
    const creating = service.create(input)
    input.name = 'Late caller mutation'
    input.payload.prompt!.text = 'late prompt'
    await held.entered
    let databaseClosed = false
    const closing = service.shutdown().then(async () => {
      await fixture.close()
      databaseClosed = true
    })
    assert.strictEqual(
      service.shutdown(),
      service.shutdown(),
      'shutdown has one shared drain operation',
    )
    const missing = '533a0b45-cd81-447b-a02f-94f17ebbac4a'
    try {
      for (const attempt of [
        () => service.create(definition()),
        () => service.get(missing),
        () => service.list(),
        () => service.update(missing, definition()),
        () => service.duplicate(missing),
        () => service.softDelete(missing),
        () => service.restore(missing),
      ]) {
        await assert.rejects(attempt(), (error: unknown) => {
          assert.ok(error instanceof PresetUnavailableError)
          assert.equal(error.code, 'PRESET_UNAVAILABLE')
          return true
        })
      }
      assert.equal(
        databaseClosed,
        false,
        'accepted transaction keeps SQLite alive until its actual result is released',
      )
    } finally {
      held.release()
    }
    const created = await creating
    await closing
    assert.equal(databaseClosed, true)
    await fixture.reopen()
    assert.deepEqual(await fixture.repository().get(created.id), created)
    assert.equal(created.name, 'Studio')
    assert.equal(created.payload.prompt!.text, 'a quiet studio')
    assert.equal((await fixture.repository().list()).length, 1)
  })
})

test('default startup and hourly cleanup purge only expired rows and cancel the actual registered timer', async (t) => {
  await withFixture(async (fixture) => {
    const repository = fixture.repository()
    const expired = await repository.create(definition('Expired'))
    await repository.softDelete(expired.id)
    const active = await repository.create(definition('Active'))
    fixture.clock.epoch += 1
    const young = await repository.create(definition('One millisecond younger'))
    await repository.softDelete(young.id)
    fixture.clock.epoch = initialEpoch + PRESET_RETENTION_MS
    let callback: (() => void) | null = null
    let timerRegistrations = 0
    let timerCancels = 0
    let unrefCalls = 0
    const timer = {
      unref: () => {
        unrefCalls += 1
      },
    } as unknown as ReturnType<typeof setInterval>
    t.mock.method(globalThis, 'setInterval', (handler: unknown, interval: unknown) => {
      assert.equal(
        interval,
        3_600_000,
        'the production default must schedule hourly, not an arbitrary test interval',
      )
      assert.equal(PRESET_PURGE_INTERVAL_MS, interval)
      assert.equal(typeof handler, 'function')
      callback = handler as () => void
      timerRegistrations += 1
      return timer
    })
    t.mock.method(globalThis, 'clearInterval', (handle: unknown) => {
      assert.strictEqual(handle, timer)
      timerCancels += 1
    })
    const service = new PresetService(repository)
    try {
      await service.start()
      await service.start()
      assert.equal(timerRegistrations, 1)
      assert.equal(unrefCalls, 1)
      assert.equal(await repository.get(expired.id, { includeDeleted: true }), null)
      assert.notEqual(await repository.get(young.id, { includeDeleted: true }), null)
      assert.deepEqual(await service.get(active.id), active)
      fixture.clock.epoch += 1
      const completed = signal()
      const originalPurge = repository.purgeExpired.bind(repository)
      repository.purgeExpired = async () => {
        const count = await originalPurge()
        completed.resolve()
        return count
      }
      assert.ok(callback)
      ;(callback as () => void)()
      await completed.promise
      assert.equal(await service.get(young.id, { includeDeleted: true }), null)
      assert.deepEqual(await service.get(active.id), active)
      await service.shutdown()
      assert.equal(timerCancels, 1)
      await service.shutdown()
      await service.start()
      assert.equal(timerRegistrations, 1)
      assert.equal(timerCancels, 1)
    } finally {
      await service.shutdown()
    }
  })
})

test('overlapping timer callbacks share one real purge and shutdown waits for the pending cleanup', async () => {
  await withFixture(async (fixture) => {
    const held = heldPresetRead()
    const repository = fixture.repository(held.plugin)
    const originalPurge = repository.purgeExpired.bind(repository)
    let purges = 0
    repository.purgeExpired = () => {
      purges += 1
      return originalPurge()
    }
    const deleted = await repository.create(definition())
    await repository.softDelete(deleted.id)
    let scheduled: (() => void) | null = null
    let canceled = 0
    const service = new PresetService(repository, {
      schedule: (callback) => {
        scheduled = callback
        return () => {
          canceled += 1
        }
      },
    })
    await service.start()
    assert.equal(purges, 1)
    fixture.clock.epoch += PRESET_RETENTION_MS
    held.arm()
    assert.ok(scheduled)
    const tick = scheduled as () => void
    tick()
    await held.entered
    tick()
    tick()
    assert.equal(purges, 2, 'three overlapping periodic requests invoke the repository once')
    let finished = false
    const closing = service.shutdown().then(() => {
      finished = true
    })
    try {
      await assert.rejects(service.list(), { code: 'PRESET_UNAVAILABLE' })
      assert.equal(finished, false)
      assert.equal(canceled, 1)
      tick()
      assert.equal(purges, 2, 'a captured callback cannot admit cleanup after shutdown')
    } finally {
      held.release()
    }
    await closing
    assert.equal(finished, true)
    assert.equal(await fixture.repository().get(deleted.id, { includeDeleted: true }), null)
  })
})

test('corrupt deleted data makes cleanup nonfatal and preserves every expired row while ordinary writes remain available', async () => {
  await withFixture(async (fixture) => {
    const repository = fixture.repository()
    const healthyExpired = await repository.create(definition('Healthy expired'))
    const corrupt = await repository.create(definition('Corrupt expired'))
    await repository.softDelete(healthyExpired.id)
    await repository.softDelete(corrupt.id)
    await fixture.database.db
      .updateTable('presets')
      .set({ payload_json: '{"mask":{}}' })
      .where('id', '=', corrupt.id)
      .execute()
    const before = await fixture.database.db
      .selectFrom('presets')
      .selectAll()
      .orderBy('id')
      .execute()
    fixture.clock.epoch += PRESET_RETENTION_MS
    const errors: unknown[] = []
    let scheduled: (() => void) | null = null
    let canceled = 0
    const service = new PresetService(repository, {
      onCleanupError: (error) => {
        errors.push(error)
      },
      schedule: (callback) => {
        scheduled = callback
        return () => {
          canceled += 1
        }
      },
    })
    try {
      await service.start()
      assert.ok(scheduled)
      assert.equal(errors.length, 1)
      assert.ok(errors[0] instanceof PresetRepositoryError)
      assert.equal(errors[0].code, 'PRESET_STORAGE_INVALID')
      assert.deepEqual(
        await fixture.database.db.selectFrom('presets').selectAll().orderBy('id').execute(),
        before,
      )
      const created = await service.create(definition('Still usable'))
      assert.equal((await service.get(created.id))?.name, 'Still usable')
      await service.shutdown()
      assert.equal(canceled, 1)
    } finally {
      await service.shutdown()
    }
  })
})

test('shutdown during startup cleanup drains the actual purge without installing a late timer', async () => {
  await withFixture(async (fixture) => {
    const held = heldPresetRead()
    const repository = fixture.repository(held.plugin)
    const deleted = await repository.create(definition())
    await repository.softDelete(deleted.id)
    fixture.clock.epoch += PRESET_RETENTION_MS
    let schedules = 0
    const service = new PresetService(repository, {
      schedule: () => {
        schedules += 1
        return () => undefined
      },
    })
    held.arm()
    const starting = service.start()
    await held.entered
    const closing = service.shutdown()
    try {
      await assert.rejects(service.create(definition()), { code: 'PRESET_UNAVAILABLE' })
      assert.equal(schedules, 0)
    } finally {
      held.release()
    }
    await Promise.all([starting, closing])
    assert.equal(schedules, 0, 'startup completion cannot publish a timer after shutdown begins')
    assert.equal(await fixture.repository().get(deleted.id, { includeDeleted: true }), null)
  })
})
