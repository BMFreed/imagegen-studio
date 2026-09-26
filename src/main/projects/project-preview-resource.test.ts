import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { ProjectIndexRepository } from './project-index.js'
import {
  parseProjectThumbnailImageUrl,
  projectThumbnailImageUrl,
  readProjectThumbnail,
} from './project-preview-resource.js'
import { ProjectSession } from './project-session.js'

const migrations = path.resolve('src/main/db/migrations')
const placeholdersDir = path.resolve('src/main/projects/placeholders')

test('Home thumbnail URL is an untampered process capability without a filesystem path', () => {
  const projectId = `project-v1-${'a'.repeat(64)}`
  const sha256 = 'b'.repeat(64)
  const url = projectThumbnailImageUrl(projectId, sha256)
  assert.deepEqual(parseProjectThumbnailImageUrl(url), { projectId, thumbnailSha256: sha256 })
  assert.equal(url.includes('/home/'), false)
  const lastMacDigit = url.at(-6)
  const forged = `${url.slice(0, -6)}${lastMacDigit === '0' ? '1' : '0'}.webp`
  assert.equal(parseProjectThumbnailImageUrl(forged), null)
  assert.equal(parseProjectThumbnailImageUrl(url.replace(sha256, 'c'.repeat(64))), null)
  assert.equal(parseProjectThumbnailImageUrl(`${url}?file=/etc/passwd`), null)
  assert.equal(parseProjectThumbnailImageUrl(`${url}#old`), null)
  assert.equal(parseProjectThumbnailImageUrl(url.replace('igs-preview:', 'file:')), null)
})

test('Home serves embedded thumbnail and repairs a poisoned derived cache', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-home-preview-'))
  const database = openAppDatabase(directory, migrations)
  try {
    const repository = new ProjectIndexRepository(database.db)
    const workspace = await repository.ensureDefaultWorkspace(directory)
    const filePath = path.join(workspace.directoryPath, 'Home Preview.igs')
    await ProjectSession.create(filePath, 'Home Preview', {
      placeholdersDir,
      scratchDir: path.join(directory, 'scratch'),
    })
    const record = await repository.indexSaved(filePath, workspace.id)
    assert.ok(record.thumbnailSha256)
    const archive = await readIgsPackage(filePath)
    const expected = await archive.readMember('preview/thumbnail.webp')
    assert.equal(createHash('sha256').update(expected).digest('hex'), record.thumbnailSha256)
    const resource = parseProjectThumbnailImageUrl(
      projectThumbnailImageUrl(record.localProjectKey, record.thumbnailSha256),
    )
    assert.ok(resource)
    const cacheRoot = path.join(directory, 'previews', 'project-thumbnails')
    const first = await readProjectThumbnail(resource, repository, cacheRoot)
    assert.equal(first.status, 200)
    assert.equal(first.headers.get('content-type'), 'image/webp')
    assert.equal(first.headers.get('cache-control'), 'no-store')
    assert.deepEqual(Buffer.from(await first.arrayBuffer()), expected)
    const cacheFile = path.join(cacheRoot, `${record.thumbnailSha256}.webp`)
    assert.deepEqual(await readFile(cacheFile), expected)

    await writeFile(cacheFile, Buffer.from('poisoned derived cache'))
    const repaired = await readProjectThumbnail(resource, repository, cacheRoot)
    assert.equal(repaired.status, 200)
    assert.deepEqual(Buffer.from(await repaired.arrayBuffer()), expected)
    assert.deepEqual(await readFile(cacheFile), expected)
  } finally {
    await database.close()
    await rm(directory, { force: true, recursive: true })
  }
})

test('old Home capability cannot serve cached pixels after a new embedded preview is saved', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-home-stale-'))
  const database = openAppDatabase(directory, migrations)
  try {
    const repository = new ProjectIndexRepository(database.db)
    const workspace = await repository.ensureDefaultWorkspace(directory)
    const filePath = path.join(workspace.directoryPath, 'Changed Preview.igs')
    await ProjectSession.create(filePath, 'Changed Preview', {
      placeholdersDir,
      scratchDir: path.join(directory, 'scratch'),
    })
    const before = await repository.indexSaved(filePath, workspace.id)
    assert.ok(before.thumbnailSha256)
    const oldResource = parseProjectThumbnailImageUrl(
      projectThumbnailImageUrl(before.localProjectKey, before.thumbnailSha256),
    )
    assert.ok(oldResource)
    const cacheRoot = path.join(directory, 'previews', 'project-thumbnails')
    assert.equal((await readProjectThumbnail(oldResource, repository, cacheRoot)).status, 200)

    const archive = await readIgsPackage(filePath)
    const replacement = await readFile(path.join(placeholdersDir, 'unavailable.webp'))
    await saveIgsPackage(filePath, {
      preview: {
        merged: await archive.readMember('preview/merged.png'),
        rect: null,
        status: 'empty',
        thumbnail: replacement,
      },
      project: archive.project,
    })
    const after = await repository.indexSaved(filePath, workspace.id)
    assert.equal(after.documentRevision, before.documentRevision)
    assert.notEqual(after.thumbnailSha256, before.thumbnailSha256)
    assert.equal((await readProjectThumbnail(oldResource, repository, cacheRoot)).status, 404)
    assert.ok(after.thumbnailSha256)
    const newResource = parseProjectThumbnailImageUrl(
      projectThumbnailImageUrl(after.localProjectKey, after.thumbnailSha256),
    )
    assert.ok(newResource)
    const next = await readProjectThumbnail(newResource, repository, cacheRoot)
    assert.equal(next.status, 200)
    assert.deepEqual(Buffer.from(await next.arrayBuffer()), replacement)

    await writeFile(filePath, Buffer.from('damaged .igs'))
    const damaged = await readProjectThumbnail(newResource, repository, cacheRoot)
    assert.notEqual(damaged.status, 200, 'A cached thumbnail must not mask a changed package.')
    await rm(filePath)
    const missing = await readProjectThumbnail(newResource, repository, cacheRoot)
    assert.notEqual(missing.status, 200, 'A cached thumbnail must not mask a missing package.')
  } finally {
    await database.close()
    await rm(directory, { force: true, recursive: true })
  }
})

test('a symlinked cache directory is ignored while the verified .igs remains readable', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-home-cache-link-'))
  const database = openAppDatabase(directory, migrations)
  try {
    const repository = new ProjectIndexRepository(database.db)
    const workspace = await repository.ensureDefaultWorkspace(directory)
    const filePath = path.join(workspace.directoryPath, 'Safe Project.igs')
    await ProjectSession.create(filePath, 'Safe Project', {
      placeholdersDir,
      scratchDir: path.join(directory, 'scratch'),
    })
    const record = await repository.indexSaved(filePath, workspace.id)
    assert.ok(record.thumbnailSha256)
    const cacheParent = path.join(directory, 'previews')
    const foreign = path.join(directory, 'foreign')
    await mkdir(cacheParent)
    await mkdir(foreign)
    await symlink(foreign, path.join(cacheParent, 'project-thumbnails'))
    const resource = parseProjectThumbnailImageUrl(
      projectThumbnailImageUrl(record.localProjectKey, record.thumbnailSha256),
    )
    assert.ok(resource)
    const response = await readProjectThumbnail(
      resource,
      repository,
      path.join(cacheParent, 'project-thumbnails'),
    )
    assert.equal(response.status, 200)
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      await (await readIgsPackage(filePath)).readMember('preview/thumbnail.webp'),
    )
    await assert.rejects(readFile(path.join(foreign, `${record.thumbnailSha256}.webp`)), {
      code: 'ENOENT',
    })
  } finally {
    await database.close()
    await rm(directory, { force: true, recursive: true })
  }
})
