import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { ProjectIndexRepository } from './project-index.js'
import {
  parseProjectMergedPreviewImageUrl,
  parseProjectThumbnailImageUrl,
  projectMergedPreviewImageUrl,
  projectThumbnailImageUrl,
  readProjectMergedPreview,
  readProjectThumbnail,
} from './project-preview-resource.js'
import { ProjectSession } from './project-session.js'

const migrations = path.resolve('src/main/db/migrations')
const placeholdersDir = path.resolve('src/main/projects/placeholders')

test('Home merged URL binds the package version and media domain without exposing a filesystem path', () => {
  const projectId = `project-v1-${'a'.repeat(64)}`
  const thumbnailSha256 = 'b'.repeat(64)
  const fingerprint = '1:2:3:4:5'
  const url = projectMergedPreviewImageUrl(projectId, thumbnailSha256, fingerprint)
  const resource = parseProjectMergedPreviewImageUrl(url)
  assert.deepEqual(resource, {
    fileFingerprintSha256: createHash('sha256').update(fingerprint).digest('hex'),
    projectId,
    thumbnailSha256,
  })
  assert.equal(url.includes('/home/'), false)
  assert.equal(url.includes(fingerprint), false)
  assert.equal(parseProjectThumbnailImageUrl(url), null)
  const thumbnailUrl = projectThumbnailImageUrl(projectId, thumbnailSha256)
  assert.equal(parseProjectMergedPreviewImageUrl(thumbnailUrl), null)
  const thumbnailMac = new URL(thumbnailUrl).pathname.split('/').at(-1)!.slice(0, -5)
  const mergedMac = new URL(url).pathname.split('/').at(-1)!.slice(0, -4)
  assert.equal(parseProjectMergedPreviewImageUrl(url.replace(mergedMac, thumbnailMac)), null)
  const lastMacDigit = url.at(-5)
  assert.equal(
    parseProjectMergedPreviewImageUrl(`${url.slice(0, -5)}${lastMacDigit === '0' ? '1' : '0'}.png`),
    null,
  )
  assert.ok(resource)
  for (const malformed of [
    url.replace(thumbnailSha256, 'c'.repeat(64)),
    url.replace(resource.fileFingerprintSha256, 'd'.repeat(64)),
    url.replace('merged/', 'thumbnail/'),
    url.replace('merged/', 'user@merged/'),
    url.replace('merged/', 'merged:80/'),
    url.replace('igs-preview:', 'file:'),
    url.replace('.png', '.webp'),
    `${url}?file=/etc/passwd`,
    `${url}#old`,
    'not a URL',
  ]) {
    assert.equal(parseProjectMergedPreviewImageUrl(malformed), null, malformed)
  }
  assert.throws(() => projectMergedPreviewImageUrl(projectId, thumbnailSha256, ''))
})

test('Home merged preview serves exact saved PNG without a new cache or Project mutation', async () => {
  await withMergedPreviewFixture(async ({ directory, filePath, repository }) => {
    const record = await repository.getProjectForPreview(
      (await repository.listProjects())[0].localProjectKey,
    )
    assert.ok(record?.thumbnailSha256 && record.fileFingerprint)
    const original = await readFile(filePath)
    const archive = await readIgsPackage(filePath)
    const expected = await archive.readMember('preview/merged.png')
    const resource = parseProjectMergedPreviewImageUrl(
      projectMergedPreviewImageUrl(
        record.localProjectKey,
        record.thumbnailSha256,
        record.fileFingerprint,
      ),
    )
    assert.ok(resource)
    const response = await readProjectMergedPreview(resource, repository)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'image/png')
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected)
    assert.deepEqual(await readFile(filePath), original)
    assert.deepEqual(await repository.getProjectForPreview(record.localProjectKey), record)
    await assert.rejects(lstat(path.join(directory, 'previews')), { code: 'ENOENT' })
    assert.equal(
      (
        await readProjectMergedPreview(
          { ...resource, fileFingerprintSha256: '0'.repeat(64) },
          repository,
        )
      ).status,
      404,
    )
    assert.equal(
      (
        await readProjectMergedPreview(
          { ...resource, fileFingerprintSha256: 'invalid' },
          repository,
        )
      ).status,
      404,
    )
  })
})

test('old merged capability refuses a resaved package even when its thumbnail and document revision survive', async () => {
  await withMergedPreviewFixture(async ({ directory, filePath, repository }) => {
    const before = (await repository.listProjects())[0]
    assert.ok(before.thumbnailSha256 && before.fileFingerprint)
    const oldResource = parseProjectMergedPreviewImageUrl(
      projectMergedPreviewImageUrl(
        before.localProjectKey,
        before.thumbnailSha256,
        before.fileFingerprint,
      ),
    )
    assert.ok(oldResource)
    assert.equal((await readProjectMergedPreview(oldResource, repository)).status, 200)
    const archive = await readIgsPackage(filePath)
    const changedMerged = await readFile(path.join(placeholdersDir, 'unavailable.png'))
    assert.notDeepEqual(changedMerged, await archive.readMember('preview/merged.png'))
    await saveIgsPackage(filePath, {
      preview: {
        merged: changedMerged,
        rect: null,
        status: 'empty',
        thumbnail: await archive.readMember('preview/thumbnail.webp'),
      },
      project: archive.project,
    })
    assert.equal((await readProjectMergedPreview(oldResource, repository)).status, 404)
    const after = await repository.indexSaved(filePath, before.workspaceId)
    assert.equal(after.thumbnailSha256, before.thumbnailSha256)
    assert.equal(after.documentRevision, before.documentRevision)
    assert.notEqual(after.fileFingerprint, before.fileFingerprint)
    assert.equal((await readProjectMergedPreview(oldResource, repository)).status, 404)
    assert.ok(after.thumbnailSha256 && after.fileFingerprint)
    const fresh = parseProjectMergedPreviewImageUrl(
      projectMergedPreviewImageUrl(
        after.localProjectKey,
        after.thumbnailSha256,
        after.fileFingerprint,
      ),
    )
    assert.ok(fresh)
    const next = await readProjectMergedPreview(fresh, repository)
    assert.equal(next.status, 200)
    assert.deepEqual(Buffer.from(await next.arrayBuffer()), changedMerged)
    const thumbnail = parseProjectThumbnailImageUrl(
      projectThumbnailImageUrl(before.localProjectKey, before.thumbnailSha256),
    )
    assert.ok(thumbnail)
    assert.equal(
      (
        await readProjectThumbnail(
          thumbnail,
          repository,
          path.join(directory, 'previews', 'project-thumbnails'),
        )
      ).status,
      200,
      'The unchanged thumbnail keeps its existing content-hash capability.',
    )
  })
})

test('merged preview refuses changed, corrupt, missing and symlinked saved packages', async () => {
  await withMergedPreviewFixture(async ({ directory, filePath, repository }) => {
    const record = (await repository.listProjects())[0]
    assert.ok(record.thumbnailSha256 && record.fileFingerprint)
    const resource = parseProjectMergedPreviewImageUrl(
      projectMergedPreviewImageUrl(
        record.localProjectKey,
        record.thumbnailSha256,
        record.fileFingerprint,
      ),
    )
    assert.ok(resource)
    const original = await readFile(filePath)
    await writeFile(filePath, Buffer.from('damaged .igs'))
    assert.equal((await readProjectMergedPreview(resource, repository)).status, 404)
    const damaged = await lstat(filePath, { bigint: true })
    const damagedFingerprint = `${damaged.dev}:${damaged.ino}:${damaged.size}:${damaged.mtimeNs}:${damaged.ctimeNs}`
    const damagedRecord = { ...record, fileFingerprint: damagedFingerprint }
    const damagedResource = parseProjectMergedPreviewImageUrl(
      projectMergedPreviewImageUrl(
        record.localProjectKey,
        record.thumbnailSha256,
        damagedFingerprint,
      ),
    )
    assert.ok(damagedResource)
    assert.equal(
      (
        await readProjectMergedPreview(damagedResource, {
          getProject: async () => damagedRecord,
          workspaceById: (id) => repository.workspaceById(id),
        })
      ).status,
      503,
      'A current fingerprint cannot make an invalid archive into a preview.',
    )
    await rm(filePath)
    assert.notEqual((await readProjectMergedPreview(resource, repository)).status, 200)
    const foreign = path.join(directory, 'outside.igs')
    await writeFile(foreign, original)
    await symlink(foreign, filePath)
    assert.notEqual((await readProjectMergedPreview(resource, repository)).status, 200)
    assert.deepEqual(await readFile(foreign), original)
  })
})

test('merged preview shares Trash reads and rechecks a concurrent positive delete under its path lock', async () => {
  await withMergedPreviewFixture(async ({ filePath, repository }) => {
    const record = (await repository.listProjects())[0]
    assert.ok(record.thumbnailSha256 && record.fileFingerprint)
    const resource = parseProjectMergedPreviewImageUrl(
      projectMergedPreviewImageUrl(
        record.localProjectKey,
        record.thumbnailSha256,
        record.fileFingerprint,
      ),
    )
    assert.ok(resource)
    const original = await readFile(filePath)
    const workspace = await repository.workspaceById(record.workspaceId)
    await repository.trash.moveToTrash(record, workspace, () => undefined)
    const entry = await repository.trash.get(record.localProjectKey)
    assert.ok(entry)
    assert.equal((await readProjectMergedPreview(resource, repository)).status, 200)
    const denied = await readProjectMergedPreview(resource, {
      getProject: (id) => repository.getProject(id),
      getProjectForPreview: (id) => repository.getProjectForPreview(id),
      workspaceById: async (id) => {
        await repository.trash.beginPermanentDelete(
          record.localProjectKey,
          entry.trashId,
          () => undefined,
        )
        return await repository.workspaceById(id)
      },
    })
    assert.equal(denied.status, 404)
    assert.deepEqual(await readFile(filePath), original)
    assert.equal((await repository.trash.get(record.localProjectKey))!.state, 'deleting')
  })
})

async function withMergedPreviewFixture(
  use: (fixture: {
    directory: string
    filePath: string
    repository: ProjectIndexRepository
  }) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-home-merged-'))
  const database = openAppDatabase(directory, migrations)
  try {
    const repository = new ProjectIndexRepository(database.db)
    const workspace = await repository.ensureDefaultWorkspace(directory)
    const filePath = path.join(workspace.directoryPath, 'Merged Preview.igs')
    await ProjectSession.create(filePath, 'Merged Preview', {
      placeholdersDir,
      scratchDir: path.join(directory, 'scratch'),
    })
    await repository.indexSaved(filePath, workspace.id)
    await use({ directory, filePath, repository })
  } finally {
    await database.close()
    await rm(directory, { force: true, recursive: true })
  }
}

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

test('thumbnail rechecks lifecycle under its file lock after a concurrent positive delete commit', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-home-trash-preview-'))
  const database = openAppDatabase(directory, migrations)
  try {
    const repository = new ProjectIndexRepository(database.db)
    const workspace = await repository.ensureDefaultWorkspace(directory)
    const filePath = path.join(workspace.directoryPath, 'Trash Preview.igs')
    await ProjectSession.create(filePath, 'Trash Preview', {
      placeholdersDir,
      scratchDir: path.join(directory, 'scratch'),
    })
    const record = await repository.indexSaved(filePath, workspace.id)
    assert.ok(record.thumbnailSha256)
    const request = { projectId: record.localProjectKey, thumbnailSha256: record.thumbnailSha256 }
    const cacheRoot = path.join(directory, 'previews', 'project-thumbnails')
    const source = await readFile(filePath)
    await repository.trash.moveToTrash(record, workspace, () => undefined)
    const entry = await repository.trash.get(record.localProjectKey)
    assert.ok(entry)
    assert.equal((await readProjectThumbnail(request, repository, cacheRoot)).status, 200)
    const denied = await readProjectThumbnail(
      request,
      {
        getProject: (id) => repository.getProject(id),
        getProjectForPreview: (id) => repository.getProjectForPreview(id),
        workspaceById: async (id) => {
          // Real commit after the resource's initial authority read, before it takes the lock.
          await repository.trash.beginPermanentDelete(
            record.localProjectKey,
            entry.trashId,
            () => undefined,
          )
          return await repository.workspaceById(id)
        },
      },
      cacheRoot,
    )
    assert.equal(denied.status, 404)
    assert.deepEqual(await readFile(filePath), source)
    assert.equal((await repository.trash.get(record.localProjectKey))!.state, 'deleting')
  } finally {
    await database.close()
    await rm(directory, { force: true, recursive: true })
  }
})
