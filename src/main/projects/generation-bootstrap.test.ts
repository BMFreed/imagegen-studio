import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { recoverGenerationRepositories } from './generation-bootstrap.js'

const migrations = path.resolve('src/main/db/migrations')

async function withDatabase(
  run: (dataRoot: string, database: ReturnType<typeof openAppDatabase>) => Promise<void>,
): Promise<void> {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'imagegen-generation-bootstrap-'))
  const database = openAppDatabase(dataRoot, migrations)
  try {
    await run(dataRoot, database)
  } finally {
    await database.close()
    await rm(dataRoot, { force: true, recursive: true })
  }
}

test('bootstrap returns the recovered repository instances used for dispatch and publication', async () => {
  await withDatabase(async (dataRoot, database) => {
    const recovered = await recoverGenerationRepositories(database, dataRoot)
    assert.doesNotThrow(() => recovered.queue.assertReadyForDispatch())
    assert.doesNotThrow(() => recovered.staging.assertReadyForPublication())
    assert.doesNotThrow(() => recovered.smartPatchStaging.assertReadyForPublication())
    assert.equal(await recovered.queue.claimNextPending(), null)
  })
})

test('unsafe staging recovery rejects bootstrap instead of returning a dispatchable pair', async () => {
  await withDatabase(async (dataRoot, database) => {
    const outside = await mkdtemp(path.join(os.tmpdir(), 'imagegen-outside-staging-'))
    try {
      await mkdir(path.join(dataRoot, 'recovery'))
      await symlink(outside, path.join(dataRoot, 'recovery', 'generation-staging'))
      await assert.rejects(recoverGenerationRepositories(database, dataRoot), {
        code: 'STAGING_STORAGE_UNSAFE',
      })
    } finally {
      await rm(outside, { force: true, recursive: true })
    }
  })
})

test('unsafe queue recovery rejects bootstrap before staging is available', async () => {
  await withDatabase(async (dataRoot, database) => {
    const outside = await mkdtemp(path.join(os.tmpdir(), 'imagegen-outside-input-'))
    try {
      await symlink(outside, path.join(dataRoot, 'generation-inputs'))
      await assert.rejects(recoverGenerationRepositories(database, dataRoot), {
        code: 'QUEUE_STORAGE_UNSAFE',
      })
    } finally {
      await rm(outside, { force: true, recursive: true })
    }
  })
})

test('unsafe Smart Patch staging refuses bootstrap before the dedicated owner can dispatch', async () => {
  await withDatabase(async (dataRoot, database) => {
    const outside = await mkdtemp(path.join(os.tmpdir(), 'imagegen-outside-patch-staging-'))
    try {
      await mkdir(path.join(dataRoot, 'recovery'))
      await symlink(outside, path.join(dataRoot, 'recovery', 'smart-patch-staging'))
      await assert.rejects(recoverGenerationRepositories(database, dataRoot), {
        code: 'STAGING_STORAGE_UNSAFE',
      })
    } finally {
      await rm(outside, { force: true, recursive: true })
    }
  })
})
