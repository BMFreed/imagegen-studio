import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  canonicalProjectPath,
  localProjectRecoveryKey,
  ProjectIdentityError,
} from './project-identity.js'

test('distinct canonical file paths have separate local recovery identities', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-identity-'))
  try {
    const first = path.join(root, 'first.igs')
    const second = path.join(root, 'second.igs')
    await writeFile(first, 'same file bytes')
    await writeFile(second, 'same file bytes')

    const canonicalFirst = await canonicalProjectPath(first)
    const canonicalSecond = await canonicalProjectPath(second)
    assert.notEqual(
      localProjectRecoveryKey(canonicalFirst),
      localProjectRecoveryKey(canonicalSecond),
    )

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

test('projects with the same filename in separate workspaces never share recovery', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-identity-workspaces-'))
  try {
    const firstWorkspace = path.join(root, 'first')
    const secondWorkspace = path.join(root, 'second')
    await mkdir(firstWorkspace)
    await mkdir(secondWorkspace)
    const first = path.join(firstWorkspace, 'Portrait.igs')
    const second = path.join(secondWorkspace, 'Portrait.igs')
    await writeFile(first, 'same portable document id')
    await writeFile(second, 'same portable document id')

    const firstKey = localProjectRecoveryKey(await canonicalProjectPath(first))
    const secondKey = localProjectRecoveryKey(await canonicalProjectPath(second))
    assert.notEqual(firstKey, secondKey)
    assert.equal(localProjectRecoveryKey(await canonicalProjectPath(first)), firstKey)
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
