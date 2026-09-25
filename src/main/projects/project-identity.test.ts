import assert from 'node:assert/strict'
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  canonicalProjectPath,
  localProjectRecoveryKey,
  ProjectIdentityError,
} from './project-identity.js'

test('a copied portable document has a separate local recovery identity', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-identity-'))
  try {
    const first = path.join(root, 'first.igs')
    const copy = path.join(root, 'copy.igs')
    await writeFile(first, 'same portable document id')
    await writeFile(copy, 'same portable document id')

    const canonicalFirst = await canonicalProjectPath(first)
    const canonicalCopy = await canonicalProjectPath(copy)
    assert.notEqual(localProjectRecoveryKey(canonicalFirst), localProjectRecoveryKey(canonicalCopy))

    const alias = path.join(root, 'alias.igs')
    await symlink(first, alias)
    assert.equal(await canonicalProjectPath(alias), canonicalFirst)
    assert.equal(
      localProjectRecoveryKey(await canonicalProjectPath(alias)),
      localProjectRecoveryKey(canonicalFirst),
    )
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('a new project resolves its existing workspace but refuses a dangling symlink', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-identity-'))
  try {
    const newPath = path.join(root, 'new.igs')
    assert.equal(await canonicalProjectPath(newPath, { allowNewFile: true }), newPath)
    await assert.rejects(canonicalProjectPath(newPath), (error: unknown) => {
      assert.ok(error instanceof ProjectIdentityError)
      return error.code === 'PROJECT_PATH_UNAVAILABLE'
    })

    await symlink(path.join(root, 'missing.igs'), newPath)
    await assert.rejects(canonicalProjectPath(newPath, { allowNewFile: true }))
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})
