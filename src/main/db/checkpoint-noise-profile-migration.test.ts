import assert from 'node:assert/strict'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from './database.js'

test('noise policy migration preserves existing prediction decisions and app metadata through upgrade and actual reopen', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-noise-migration-'))
  const migrations = path.resolve('src/main/db/migrations')
  const legacy = path.join(root, 'legacy-migrations')
  await cp(migrations, legacy, { recursive: true })
  await rm(path.join(legacy, '0016_checkpoint_noise_profile_override.sql'))
  try {
    const before = openAppDatabase(root, legacy)
    const prediction = {
      prediction_type: 'v_prediction',
      sha256: 'a'.repeat(64),
      size_bytes: 123,
      updated_at: '2026-10-07T00:00:00.000Z',
    }
    await before.db.insertInto('checkpoint_prediction_override').values(prediction).execute()
    await before.db.insertInto('app_metadata').values({ key: 'existing', value: 'kept' }).execute()
    await before.close()
    const upgraded = openAppDatabase(root, migrations)
    assert.deepEqual(
      await upgraded.db.selectFrom('checkpoint_prediction_override').selectAll().execute(),
      [prediction],
    )
    assert.equal(
      (
        await upgraded.db
          .selectFrom('app_metadata')
          .select('value')
          .where('key', '=', 'existing')
          .executeTakeFirstOrThrow()
      ).value,
      'kept',
    )
    assert.deepEqual(
      await upgraded.db.selectFrom('checkpoint_noise_profile_override').selectAll().execute(),
      [],
    )
    const noise = {
      rescale_betas_zero_snr: 1,
      sha256: prediction.sha256,
      size_bytes: prediction.size_bytes,
      timestep_spacing: null,
      updated_at: prediction.updated_at,
    }
    await upgraded.db.insertInto('checkpoint_noise_profile_override').values(noise).execute()
    await upgraded.close()
    const reopened = openAppDatabase(root, migrations)
    assert.deepEqual(
      await reopened.db.selectFrom('checkpoint_noise_profile_override').selectAll().execute(),
      [noise],
    )
    assert.deepEqual(
      await reopened.db.selectFrom('checkpoint_prediction_override').selectAll().execute(),
      [prediction],
    )
    await reopened.close()
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})
