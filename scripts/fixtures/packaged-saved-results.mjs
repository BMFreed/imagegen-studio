/** Stock AppImage opens portable Raster and Smart Patch owners from Saved generations. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect } from '@playwright/test'
import Database from 'better-sqlite3'

import { readIgsPackage } from '../../src/main/projects/igs-package.ts'
import { ProjectSession } from '../../src/main/projects/project-session.ts'
import {
  assertOfflineProjectDesktop,
  indexSnapshot,
  regularFile,
} from './packaged-noobai-import-chooser.mjs'

const scenario = 'saved-results'
const suite = 'packaged-saved-results'
const fixtureDirectory =
  'smart-patch-variant-history/20261022-navigation/native-r8.json.artifacts/prepared-fixture'
const sources = [
  {
    name: 'project-v1-70503cdb2aad46fce6386dbbba2442693f66247cae0ab7ba503083768de0bbe8.igs',
    title: 'Smart variant accepted history',
    sha256: 'f66f13c1a1c25798087adda02ac5b581f55f4fcb5085a59ca260155140b853a1',
    sizeBytes: 150296,
  },
  {
    name: 'project-v1-e53821eb381bac47aba48fd102eb381e215a9c4b182e5f3f91d579b388b8f257.igs',
    title: 'Smart variant portable copy',
    sha256: '7384a17ab1e6330d3f73190fcafaa7a9c62ccd0fd02dcc03990966c1545f61e5',
    sizeBytes: 150565,
  },
]
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function stage(root, appData, ownedRunRoot, identity) {
  const workspace = path.join(appData, 'workspaces/Uncategorized')
  await mkdir(workspace, { recursive: true, mode: 0o700 })
  assert.equal(await realpath(workspace), workspace)
  const scratchDir = path.join(root, 'project-fixture-scratch')
  await mkdir(scratchDir, { mode: 0o700 })
  const placeholdersDir = fileURLToPath(
    new URL('../../src/main/projects/placeholders/', import.meta.url),
  )
  const projects = []
  for (const [index, source] of sources.entries()) {
    const original = path.join(ownedRunRoot, fixtureDirectory, source.name)
    await regularFile(original)
    const sourceBytes = { path: original, sha256: source.sha256, sizeBytes: source.sizeBytes }
    assert.deepEqual(await identity(original), sourceBytes)
    const filename = path.join(workspace, source.title + '.igs')
    await copyFile(original, filename, constants.COPYFILE_EXCL)
    assert.deepEqual(await identity(filename), { ...sourceBytes, path: filename })
    const input = await readIgsPackage(filename)
    assert.equal(input.project.title, source.title)
    const expectedDocument = structuredClone(input.project)
    if (index === 0) {
      // Give the ordinary Raster a zero seed on the owned synthetic copy.
      const raster = expectedDocument.layers.find(({ kind }) => kind === 'raster')
      assert.equal(raster.generationProvenance.generationConfiguration.sampling.actualSeed, 42)
      raster.generationProvenance.generationConfiguration.sampling.actualSeed = 0
      const session = await ProjectSession.open(filename, { placeholdersDir, scratchDir })
      session.applyDocument(expectedDocument)
      await session.save()
      assert.notEqual(session.document.documentRevision, input.project.documentRevision)
      expectedDocument.documentRevision = session.document.documentRevision
    }
    const stored = await readIgsPackage(filename)
    const { project: document } = stored
    assert.deepEqual(document, expectedDocument)
    const owners = document.layers.flatMap((parent) =>
      parent.kind === 'smart-patch'
        ? parent.rasterSubLayers.map((layer) => ({ layer, parent }))
        : [{ layer: parent, parent: null }],
    )
    assert.equal(owners.length, 17)
    assert.ok(owners.every(({ layer }) => layer.generationProvenance))
    for (const { layer } of owners) {
      const member = await stored.readMember(layer.asset.path)
      assert.equal(digest(member), layer.asset.sha256)
      assert.equal(member.length, layer.asset.bytes)
    }
    projects.push({
      bytes: await identity(filename),
      document,
      id: 'project-v1-' + digest(filename),
      original: sourceBytes,
      owners,
      preview: stored.manifest.preview.status,
    })
  }
  const [original, copy] = projects
  assert.notEqual(original.id, copy.id)
  assert.equal(original.document.documentId, copy.document.documentId)
  assert.notEqual(original.document.documentRevision, copy.document.documentRevision)
  assert.deepEqual(
    original.owners.map(({ layer }) => layer.id),
    copy.owners.map(({ layer }) => layer.id),
  )
  return { projects, workspace }
}

function expectedHistory(projects) {
  return projects.flatMap(({ id, document, owners }) =>
    owners.map(({ layer }) => {
      const { executionResultContext: result, generationConfiguration: generation } =
        layer.generationProvenance
      return {
        acceptedAt: result.acceptedAt,
        assetSha256: layer.asset.sha256,
        documentId: document.documentId,
        documentRevision: document.documentRevision,
        height: result.output.height,
        layerId: layer.id,
        layerName: layer.name,
        modelFileSha256: generation.model.fileSha256,
        modelName: generation.model.displayName,
        modelVersionName: generation.model.versionName,
        projectKey: id,
        projectName: document.title,
        seed: generation.sampling.actualSeed,
        width: result.output.width,
      }
    }),
  )
}

const sortedHistory = (rows) =>
  rows.toSorted(
    (a, b) => a.projectKey.localeCompare(b.projectKey) || a.layerId.localeCompare(b.layerId),
  )

async function chooseHistory(page, project, target, expected) {
  await page.getByRole('button', { name: 'Open saved generations', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Saved generations', exact: true })
  await expect(modal.getByRole('list', { name: 'Saved generations', exact: true })).toHaveAttribute(
    'aria-busy',
    'false',
  )
  await expect(modal.getByRole('listitem')).toHaveCount(expected.length)
  await expect(modal.getByText('34 shown · 34 saved', { exact: true })).toBeVisible()
  const reply = await page.evaluate(() => window.api.projects.getAcceptedResultHistory(null))
  assert.equal(reply.ok, true, JSON.stringify(reply))
  assert.equal(reply.value.nextCursor, null)
  assert.equal(reply.value.totalCount, expected.length)
  assert.deepEqual(
    sortedHistory(
      reply.value.items.map(({ imageUrl, ...entry }) => {
        assert.match(imageUrl, /^igs-history:\/\/result\//)
        return entry
      }),
    ),
    sortedHistory(expected),
  )
  const entry = reply.value.items.find(
    ({ projectKey, layerId }) => projectKey === project.id && layerId === target.id,
  )
  assert.ok(entry)
  const row = modal.locator(
    'article[data-project-key="' + project.id + '"][data-layer-id="' + target.id + '"]',
  )
  const image = row.locator('img')
  await image.scrollIntoViewIfNeeded()
  await expect(row.getByText('Seed ' + entry.seed, { exact: true })).toBeVisible()
  await expect(image).toHaveAttribute('src', entry.imageUrl)
  await expect
    .poll(() =>
      image.evaluate((element) =>
        element.complete ? [element.naturalWidth, element.naturalHeight] : [],
      ),
    )
    .toEqual([target.asset.width, target.asset.height])
  await row
    .getByRole('button', {
      name: 'Open result ' + target.name + ' in ' + project.document.title,
      exact: true,
    })
    .click()
  await expect(modal).toBeHidden()
  await expect(projectTab(page, project)).toHaveAttribute('aria-selected', 'true')
  return entry
}

function projectTab(page, project) {
  return page.getByRole('tab', { name: project.document.title, exact: true })
}

async function assertUnchangedTab(page, project) {
  // UI selection is observed before reading the already open tab.
  const reply = await page.evaluate((id) => window.api.projects.open(id), project.id)
  assert.equal(reply.ok, true, JSON.stringify(reply))
  assert.equal(reply.value.kind, 'opened')
  const { tab } = reply.value
  assert.equal(tab.id, project.id)
  assert.equal(tab.documentId, project.document.documentId)
  assert.equal(tab.documentRevision, project.document.documentRevision)
  assert.equal(tab.dirty, false)
  assert.equal(tab.canUndo, false)
  assert.equal(tab.canRedo, false)
  assert.deepEqual(tab.generationDraft, project.document.generationDraft)
  return tab
}

function selectLayer(page, layer) {
  return page
    .getByLabel('Project layers', { exact: true })
    .locator('[data-layer-id="' + layer.id + '"]')
    .getByRole('button', { name: 'Select ' + layer.name, exact: true })
}

async function runNavigation(page, root, phase, [original, copy], expected) {
  const ordinary = original.owners.find(({ parent }) => parent === null).layer
  const raster = await chooseHistory(page, original, ordinary, expected)
  assert.equal(raster.seed, 0)
  await expect(selectLayer(page, ordinary)).toHaveAttribute('aria-pressed', 'true')
  await assertUnchangedTab(page, original)

  const inactive = copy.owners.find(
    ({ layer, parent }) =>
      parent && parent.locked && !parent.visible && layer.id !== parent.activeRasterSubLayerId,
  )
  assert.ok(inactive)
  const { layer: variant, parent } = inactive
  const smart = await chooseHistory(page, copy, variant, expected)
  await expect(projectTab(page, original)).toHaveAttribute('aria-selected', 'false')
  const variants = page.getByRole('dialog', { name: 'Smart Patch variants', exact: true })
  const variantRow = variants.locator('[data-smart-patch-variant-id="' + variant.id + '"]')
  await expect(variantRow).toBeFocused()
  await expect(variantRow.getByText('From history', { exact: true })).toBeVisible()
  await expect(variants.getByText('From history', { exact: true })).toHaveCount(1)
  await expect(
    variantRow.getByRole('button', {
      name: 'Select variant ' + variant.name,
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'false')
  await page.screenshot({ path: path.join(root, phase + '-inactive-variant.png') })
  await variants.getByRole('button', { name: 'Close Smart Patch variants', exact: true }).click()
  await expect(variants).toBeHidden()
  await expect(selectLayer(page, parent)).toHaveAttribute('aria-pressed', 'true')
  const tab = await assertUnchangedTab(page, copy)
  const owner = tab.layers.find(({ id }) => id === parent.id)
  assert.ok(owner)
  assert.equal(owner.activeRasterSubLayerId, parent.activeRasterSubLayerId)
  assert.equal(owner.visible, false)
  assert.equal(owner.locked, true)
  return { raster, smart, parentId: owner.id, activeVariantId: owner.activeRasterSubLayerId }
}

async function retainClosedIndex(root, appData, phase, projects, expected, identity) {
  const filename = path.join(appData, 'database/app.sqlite')
  const wal = await lstat(filename + '-wal').catch((error) => {
    if (error.code !== 'ENOENT') throw error
    return null
  })
  assert.ok(!wal || wal.size === 0)
  await regularFile(filename)
  const retained = path.join(root, phase + '.sqlite')
  await copyFile(filename, retained, constants.COPYFILE_EXCL)
  const bytes = await identity(retained)
  assert.deepEqual(bytes, { ...(await identity(filename)), path: retained })
  const db = new Database(retained, { readonly: true, fileMustExist: true })
  try {
    assert.equal(db.pragma('quick_check', { simple: true }), 'ok')
    assert.deepEqual(db.pragma('foreign_key_check'), [])
  } finally {
    db.close()
  }
  const index = indexSnapshot(retained)
  assert.deepEqual(
    index.projects,
    projects
      .map(({ id, bytes, document, preview }) => ({
        bytes: bytes.sizeBytes,
        diagnostic: null,
        documentId: document.documentId,
        filename: bytes.path,
        health: 'ready',
        id,
        preview,
        revision: document.documentRevision,
        title: document.title,
        trashedAt: null,
        workspace: 'uncategorized',
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  )
  const assets = new Map(
    projects.flatMap(({ id, owners }) =>
      owners.map(({ layer }) => [id + ':' + layer.id, layer.asset.bytes]),
    ),
  )
  const accepted = sortedHistory(expected).map((item) => ({
    assetBytes: assets.get(item.projectKey + ':' + item.layerId),
    checkpoint: item.modelFileSha256,
    documentId: item.documentId,
    height: item.height,
    id: item.projectKey,
    image: item.assetSha256,
    layerId: item.layerId,
    revision: item.documentRevision,
    seed: item.seed,
    width: item.width,
  }))
  assert.deepEqual(index.accepted, accepted)
  assert.deepEqual([index.jobs, index.receipts, index.seeds], [0, 0, 0])
  for (const project of projects) {
    await regularFile(project.bytes.path)
    assert.deepEqual(await identity(project.bytes.path), project.bytes)
    assert.deepEqual(await identity(project.original.path), project.original)
  }
  return { bytes, ...index }
}

export async function runPackagedSavedResults({
  root,
  appData,
  ownedRunRoot,
  packageBefore,
  launch,
  closeNormally,
  identity,
  keyboard = false,
}) {
  const proof = JSON.parse(
    await readFile(path.join(path.dirname(root), 'package-proof.json'), 'utf8'),
  )
  assert.equal(proof.schemaVersion, 1)
  assert.ok(proof.package.path.startsWith(ownedRunRoot + path.sep))
  await assertOfflineProjectDesktop({
    root,
    ownedRunRoot,
    packageBefore,
    expectedPackage: proof.package,
    scenario,
    suite,
  })
  assert.equal(await realpath(root), root)
  assert.equal(appData, path.join(root, 'data/imagegen-studio'))
  await assert.rejects(lstat(appData), { code: 'ENOENT' })
  const { projects, workspace } = await stage(root, appData, ownedRunRoot, identity)
  const expected = expectedHistory(projects)
  assert.equal(expected.length, 34)
  const lifetimes = []
  const keyboardResults = {}
  for (const phase of ['first', 'reopened']) {
    const state = await launch(phase)
    let visited
    try {
      if (keyboard) {
        const { qualifySavedResultsKeyboard } =
          await import('./packaged-saved-results-keyboard.mjs')
        const evidence = path.join(root, phase + '-keyboard')
        await mkdir(evidence, { mode: 0o700 })
        keyboardResults[phase] = await qualifySavedResultsKeyboard(state, evidence, expected.length)
      }
      visited = await runNavigation(state.page, root, phase, projects, expected)
    } finally {
      await closeNormally(state)
    }
    const index = await retainClosedIndex(root, appData, phase, projects, expected, identity)
    lifetimes.push({ phase, visited, index })
  }
  assert.deepEqual(
    (await readdir(workspace)).sort(),
    projects.map(({ bytes }) => path.basename(bytes.path)).sort(),
  )
  const result = {
    ...(keyboard && { keyboard: keyboardResults }),
    lifetimes,
    projects: projects.map(({ bytes, document, id, original }) => ({
      bytes,
      documentId: document.documentId,
      id,
      original,
      revision: document.documentRevision,
      title: document.title,
    })),
  }
  await writeFile(
    path.join(root, 'saved-results-proof.json'),
    JSON.stringify(result, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  )
  if (keyboard)
    assert.deepEqual(
      Object.values(keyboardResults).flatMap((result) => result.issues),
      [],
      'Saved generations keyboard findings',
    )
  return result
}
