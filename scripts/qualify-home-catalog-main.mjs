/** Exercise the Home service, archive readers and SQLite without Electron or inference. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, lstat, mkdir, realpath, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { initializeAppDatabase } from '../src/main/db/database.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { ProjectIndexRepository } from '../src/main/projects/project-index.ts'
import {
  parseProjectMergedPreviewImageUrl,
  parseProjectThumbnailImageUrl,
  readProjectMergedPreview,
} from '../src/main/projects/project-preview-resource.ts'
import { ProjectService } from '../src/main/projects/project-service.ts'
import { ProjectShadowStore } from '../src/main/projects/project-shadow.ts'
import {
  assertSavedState,
  largeRasterFixture,
  prepareWorkspaces,
  stageProject,
  stageProjects,
  writeScaleProject,
} from './fixtures/packaged-home-scale.mjs'

const migrations = fileURLToPath(new URL('../src/main/db/migrations/', import.meta.url))
const placeholdersDir = fileURLToPath(
  new URL('../src/main/projects/placeholders/', import.meta.url),
)
const projectCount = 128

async function identity(filename) {
  const stat = await lstat(filename)
  assert.ok(stat.isFile())
  const sha256 = createHash('sha256')
  for await (const chunk of createReadStream(filename)) {
    sha256.update(chunk)
  }
  return { path: filename, sha256: sha256.digest('hex'), sizeBytes: stat.size }
}

async function writeJson(root, name, body) {
  await writeFile(path.join(root, name), JSON.stringify(body, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  })
}

async function measure(action) {
  const start = performance.now()
  const result = await action()
  return { elapsedMs: performance.now() - start, result }
}

function assertCatalog(catalog, workspaces, files, canvas, missing, workspaceId) {
  const expected = [
    ...files.map((file) => ({ ...file, health: 'ready' })),
    ...(missing ? [{ ...missing.original, health: 'missing' }] : []),
  ]
  const visible = expected.filter((file) => !workspaceId || file.workspaceId === workspaceId)
  assert.deepEqual(
    catalog.workspaces.map(({ id, directoryPath, displayName, availability, projectCount }) => ({
      availability,
      directoryPath,
      displayName,
      id,
      projectCount,
    })),
    workspaces.map(({ id, directoryPath, displayName }) => ({
      availability: 'available',
      directoryPath,
      displayName,
      id,
      projectCount: expected.filter((file) => file.workspaceId === id).length,
    })),
  )
  assert.equal(catalog.projects.length, visible.length)
  const cards = new Map(catalog.projects.map((card) => [card.id, card]))
  assert.equal(cards.size, visible.length)
  for (const file of visible) {
    const card = cards.get(file.id)
    assert.ok(card, file.title)
    assert.equal(card.title, file.title)
    assert.equal(card.workspaceId, file.workspaceId)
    assert.equal(card.fileName, path.basename(file.bytes.path))
    assert.equal(card.recoveryStatus, 'none')
    assert.equal(card.health, file.health)
    assert.equal(card.previewStatus, 'rendered')
    assert.deepEqual(card.bbox, { height: canvas.height, width: canvas.width })
    if (file.health === 'missing') {
      assert.equal(card.thumbnailUrl, null)
      assert.equal(card.previewUrl, null)
    } else {
      assert.equal(parseProjectThumbnailImageUrl(card.thumbnailUrl)?.projectId, file.id)
      assert.equal(parseProjectMergedPreviewImageUrl(card.previewUrl)?.projectId, file.id)
    }
  }
  return cards
}

async function assertPreview(card, repository, raster) {
  const request = parseProjectMergedPreviewImageUrl(card.previewUrl)
  assert.ok(request)
  const response = await readProjectMergedPreview(request, repository)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'image/png')
  const bytes = Buffer.from(await response.arrayBuffer())
  assert.deepEqual(bytes, raster.png)
}

async function exerciseLifetime(dataRoot, run) {
  const open = await measure(() => initializeAppDatabase(dataRoot, migrations))
  const database = open.result
  const repository = new ProjectIndexRepository(database.db)
  const service = new ProjectService({
    dataRoot,
    repository,
    roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
    shadow: new ProjectShadowStore(path.join(dataRoot, 'autosave')),
  })
  try {
    const initialize = await measure(() => service.initialize())
    const first = await measure(() => service.listHomeCatalog())
    return {
      databaseOpenMs: open.elapsedMs,
      firstCatalogMs: first.elapsedMs,
      initializeMs: initialize.elapsedMs,
      ...(await run(first.result, service, repository)),
    }
  } finally {
    assert.deepEqual(service.getOpenTabs(), [])
    await database.close()
  }
}

async function externalChanges(root, workspaces, files, raster) {
  const [first, alpha, beta] = workspaces
  const original = files.find((file) => file.workspaceId === first.id)
  const detachedFile = files.find((file) => file.workspaceId === beta.id)
  assert.equal(original, files[0])
  assert.ok(detachedFile)
  const replacement = await writeScaleProject(
    original.bytes.path,
    1,
    `${original.title} Revised`,
    'e98c6d46-5794-4dbb-9425-000000000001',
    identity,
    raster,
    first.id,
  )
  assert.equal(replacement.id, original.id)
  assert.equal(replacement.documentId, original.documentId)
  assert.notEqual(replacement.revision, original.revision)
  assert.notEqual(replacement.bytes.sha256, original.bytes.sha256)
  const added = await stageProject(alpha, files.length + 1, identity, raster)
  const detachedPath = path.join(root, 'detached.igs')
  await rename(detachedFile.bytes.path, detachedPath)
  const detached = await identity(detachedPath)
  assert.deepEqual(detached, { ...detachedFile.bytes, path: detachedPath })
  const remaining = files.filter((file) => file !== original && file !== detachedFile)
  return {
    added,
    missing: { detached, original: detachedFile },
    ready: [replacement, ...remaining, added],
    replacement,
    unchangedNeighbors: remaining.length,
  }
}

async function verifySample(file, raster) {
  const saved = await readIgsPackage(file.bytes.path)
  const expected = [raster, ...(raster.additionalRasters ?? [])]
  assert.equal(saved.project.layers.length, expected.length)
  for (const [index, layer] of saved.project.layers.entries()) {
    assert.equal(layer.kind, 'raster')
    assert.equal(layer.visible, index === 0)
    assert.equal(layer.asset.sha256, expected[index].pngSha256)
    assert.deepEqual(await saved.readMember(layer.asset.path), expected[index].png)
  }
  assert.deepEqual(await saved.readMember('preview/merged.png'), raster.png)
}

async function runProfile(evidence, payload, raster) {
  await mkdir(evidence, { mode: 0o700 })
  const dataRoot = path.join(payload, 'app-data')
  const databasePath = path.join(dataRoot, 'database/app.sqlite')
  const workspaces = await prepareWorkspaces(dataRoot, projectCount, true)
  const files = await stageProjects(workspaces, identity, raster)
  assert.equal(files.length, projectCount)
  const input = {
    files,
    layerSha256: [raster, ...(raster.additionalRasters ?? [])].map((layer) => layer.pngSha256),
    mergedPreviewSha256: raster.pngSha256,
    totalBytes: files.reduce((sum, { bytes }) => sum + bytes.sizeBytes, 0),
    workspaces,
  }
  assert.equal(new Set(input.layerSha256).size, input.layerSha256.length)
  await writeJson(evidence, 'input.json', input)
  const first = await exerciseLifetime(dataRoot, async (catalog, _service, repository) => {
    const cards = assertCatalog(catalog, workspaces, files, raster.canvas)
    await assertPreview(cards.get(files[0].id), repository, raster)
  })
  const firstState = await assertSavedState(workspaces, databasePath, files, identity)
  await copyFile(databasePath, path.join(evidence, 'first.sqlite'))

  let changed
  const restart = await exerciseLifetime(dataRoot, async (catalog, service, repository) => {
    assertCatalog(catalog, workspaces, files, raster.canvas)
    const unchanged = await measure(() => service.listHomeCatalog())
    const previous = assertCatalog(unchanged.result, workspaces, files, raster.canvas)
    changed = await externalChanges(payload, workspaces, files, raster)
    const refresh = await measure(() => service.listHomeCatalog())
    const current = assertCatalog(
      refresh.result,
      workspaces,
      changed.ready,
      raster.canvas,
      changed.missing,
    )
    const scope = workspaces[1].id
    const scoped = await measure(() => service.listHomeCatalog(scope))
    assertCatalog(scoped.result, workspaces, changed.ready, raster.canvas, changed.missing, scope)
    for (const file of [changed.replacement, changed.missing.original]) {
      const old = parseProjectMergedPreviewImageUrl(previous.get(file.id).previewUrl)
      assert.ok(old)
      assert.equal((await readProjectMergedPreview(old, repository)).status, 404)
    }
    await assertPreview(current.get(changed.replacement.id), repository, raster)
    await assertPreview(current.get(changed.added.id), repository, raster)
    return {
      externalRefreshMs: refresh.elapsedMs,
      scopedRefreshMs: scoped.elapsedMs,
      unchangedRefreshMs: unchanged.elapsedMs,
    }
  })
  assert.ok(changed)
  const finalState = await assertSavedState(
    workspaces,
    databasePath,
    changed.ready,
    identity,
    changed.missing,
  )
  await copyFile(databasePath, path.join(evidence, 'final.sqlite'))
  await verifySample(changed.replacement, raster)
  await copyFile(changed.replacement.bytes.path, path.join(evidence, 'sample.igs'))
  const result = {
    finalState: finalState.database,
    first,
    firstState: firstState.database,
    layers: input.layerSha256.length,
    projectCount,
    refreshedCards: finalState.projects.length,
    restart,
    totalBytes: input.totalBytes,
    unchangedNeighbors: changed.unchangedNeighbors,
  }
  await writeJson(evidence, 'result.json', result)
  await writeJson(evidence, 'external-changes.json', {
    added: changed.added,
    missing: changed.missing,
    replacement: changed.replacement,
  })
  return result
}

const [root, ...extra] = process.argv.slice(2)
const runRoot = path.join(
  homedir(),
  '.codex/artifacts/imagegen-studio/runs/home-catalog-layered-main',
)
assert.ok(root && extra.length === 0 && path.dirname(root) === runRoot)
assert.equal(await realpath(root), root)
const payloads = path.join(root, 'payloads')
await mkdir(payloads, { mode: 0o700 })
const raster = largeRasterFixture()
const profiles = [
  ['single', raster],
  [
    'layered',
    {
      ...raster,
      additionalRasters: [2, 3, 4].map((index) => largeRasterFixture(`Home scale layer ${index}`)),
    },
  ],
]
const results = {}
for (const [profile, fixture] of profiles) {
  results[profile] = await runProfile(
    path.join(root, profile),
    path.join(payloads, profile),
    fixture,
  )
  console.log(profile, results[profile])
}
await writeJson(root, 'result.json', { outcome: 'PASS', profiles: results })
