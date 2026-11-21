/** Verify ordinary Raster Add history through the packaged toolbar and live recovery owners. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, lstat, open, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { expect } from '@playwright/test'

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const projectKey = /^project-v1-[0-9a-f]{64}$/
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

function stableTab({ documentRevision: _revision, canUndo: _undo, canRedo: _redo, ...tab }) {
  return {
    ...tab,
    layers: tab.layers.map(({ imageUrl: _url, ...layer }) => layer),
    acceptedResults: tab.acceptedResults.map(({ imageUrl: _url, ...result }) => result),
  }
}

async function readOwnedJson(filename) {
  assert.equal(await realpath(filename), filename)
  const handle = await open(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const before = await handle.stat({ bigint: true })
    assert.ok(before.isFile() && before.uid === BigInt(process.getuid()) && before.nlink === 1n)
    assert.ok(before.size > 0n && before.size < 1024n * 1024n)
    const bytes = await handle.readFile()
    assert.equal(BigInt(bytes.length), before.size)
    const after = await handle.stat({ bigint: true })
    for (const field of ['size', 'mtimeNs', 'ctimeNs']) assert.equal(after[field], before[field])
    return { bytes, value: JSON.parse(bytes.toString('utf8')), sha256: sha256(bytes) }
  } finally {
    await handle.close()
  }
}

async function readShadow({
  appData,
  root,
  phase,
  projectId,
  tab,
  expectedLayerId,
  acceptedShadow,
  receipt,
  identity,
}) {
  const directory = path.join(appData, 'autosave', projectId)
  const manifestPath = path.join(directory, 'manifest.json')
  let manifest
  await expect
    .poll(async () => {
      try {
        manifest = await readOwnedJson(manifestPath)
        return manifest.value.documentRevision
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
        return null
      }
    })
    .toBe(tab.documentRevision)
  const { value: metadata, sha256: manifestSha256 } = manifest
  assert.equal(metadata.state, 'dirty')
  assert.equal(metadata.shadowVersion, 1)
  assert.equal(metadata.documentId, tab.documentId)
  assert.equal(metadata.localProjectKey, projectId)
  assert.match(metadata.baseDocumentRevision, uuid)
  assert.match(metadata.snapshotId, uuid)
  if (acceptedShadow) {
    assert.equal(metadata.baseDocumentRevision, acceptedShadow.baseDocumentRevision)
    assert.equal(metadata.baseDocumentHash, acceptedShadow.baseDocumentHash)
    assert.notEqual(metadata.snapshotId, acceptedShadow.snapshotId)
  }
  const snapshot = path.join(directory, 'snapshots', metadata.snapshotId)
  const {
    bytes: documentBytes,
    value: document,
    sha256: documentSha256,
  } = await readOwnedJson(path.join(snapshot, 'project.json'))
  assert.equal(metadata.documentHash, documentSha256)
  assert.equal(document.documentId, tab.documentId)
  assert.equal(document.documentRevision, tab.documentRevision)
  assert.deepEqual(document.generationDraft, tab.generationDraft)
  assert.deepEqual(document.primaryBbox, tab.primaryBbox)
  assert.equal(document.lastActualSeedSnapshot, tab.lastActualSeedSnapshot)
  assert.deepEqual(
    document.layers.map(({ id }) => id),
    tab.layers.map(({ id }) => id),
  )

  let raster
  if (expectedLayerId) {
    const [layer] = document.layers
    assert.equal(layer.id, expectedLayerId)
    assert.equal(layer.kind, 'raster')
    const asset = 'assets/layers/' + expectedLayerId + '.png'
    assert.equal(layer.asset.path, asset)
    assert.equal(layer.asset.sha256, receipt.image_sha256)
    assert.equal(layer.asset.bytes, receipt.image_byte_size)
    assert.deepEqual(metadata.dirtyAssets, [
      { path: asset, bytes: receipt.image_byte_size, sha256: receipt.image_sha256 },
    ])
    const filename = path.join(snapshot, asset)
    assert.equal(await realpath(filename), filename)
    const stat = await lstat(filename)
    assert.ok(stat.isFile() && stat.uid === process.getuid() && stat.nlink === 1)
    assert.deepEqual(await identity(filename), {
      path: filename,
      sizeBytes: receipt.image_byte_size,
      sha256: receipt.image_sha256,
    })
    const execution = layer.generationProvenance.executionResultContext
    assert.equal(execution.queueItemId, receipt.queue_item_id)
    assert.equal(execution.candidateId, receipt.candidate_id)
    assert.equal(execution.output.sha256, receipt.image_sha256)
    assert.equal(execution.output.byteSize, receipt.image_byte_size)
    raster = layer
  } else {
    assert.deepEqual(document.layers, [])
    assert.deepEqual(metadata.dirtyAssets, [])
  }
  const retained = path.join(root, `acceptance-history-${phase}-shadow.json`)
  const retainedDocument = path.join(root, `acceptance-history-${phase}-project.json`)
  await writeFile(retained, manifest.bytes, { flag: 'wx', mode: 0o600 })
  await writeFile(retainedDocument, documentBytes, { flag: 'wx', mode: 0o600 })
  assert.equal((await identity(retained)).sha256, manifestSha256)
  assert.equal((await identity(retainedDocument)).sha256, documentSha256)
  return {
    baseDocumentHash: metadata.baseDocumentHash,
    baseDocumentRevision: metadata.baseDocumentRevision,
    documentSha256,
    manifestSha256,
    retainedManifest: retained,
    retainedDocument,
    snapshotId: metadata.snapshotId,
    ...(raster && { raster }),
  }
}

async function rgbaIdentity(page, url) {
  return await page.evaluate(async (source) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.src = source
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Cannot decode accepted Raster.')
    context.drawImage(image, 0, 0)
    const bytes = context.getImageData(0, 0, canvas.width, canvas.height).data
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return {
      width: canvas.width,
      height: canvas.height,
      rgbaSha256: Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join(''),
    }
  }, url)
}

function operationalRows(snapshot) {
  const names = [
    'generation_queue_item',
    'generation_candidate_receipt',
    'generation_seed_cursor',
    'generation_staging_discarded_session',
    'generation_acceptance_journal',
    'project_accepted_result_index',
  ]
  const { tables } = snapshot()
  return Object.fromEntries(names.map((name) => [name, tables[name].rows]))
}

export async function qualifyPackagedRasterAcceptanceHistory({
  state,
  projectId,
  beforeAdd,
  accepted,
  acceptedData,
  packagePath,
  initialPackage,
  candidate,
  receipt,
  root,
  appData,
  snapshot,
  identity,
  openTab,
  projectCall,
}) {
  assert.match(projectId, projectKey)
  assert.equal(beforeAdd.id, projectId)
  assert.equal(accepted.id, projectId)
  assert.equal(accepted.documentId, beforeAdd.documentId)
  assert.notEqual(accepted.documentRevision, beforeAdd.documentRevision)
  assert.equal(accepted.dirty, true)
  assert.equal(accepted.canUndo, true)
  assert.equal(accepted.canRedo, false)
  assert.equal(
    beforeAdd.dirty,
    true,
    'The initial package precedes unsaved generation draft edits.',
  )
  assert.deepEqual(beforeAdd.layers, [])
  assert.deepEqual(beforeAdd.acceptedResults, [])
  assert.equal(accepted.layers.length, 1)
  assert.equal(accepted.acceptedResults.length, 1)
  const [layer] = accepted.layers
  const [acceptedView] = accepted.acceptedResults
  assert.equal(acceptedView.layerId, layer.id)
  assert.equal(acceptedView.imageUrl, layer.imageUrl)
  assert.equal(acceptedView.seed, candidate.actualSeed)
  assert.equal(receipt.queue_item_id, candidate.queueItemId)
  assert.equal(receipt.candidate_id, candidate.candidateId)
  assert.equal(receipt.actual_seed, candidate.actualSeed)
  assert.equal(acceptedData.layerId, layer.id)
  const candidatePath = path.join(root, 'candidate.png')
  assert.deepEqual(await identity(candidatePath), {
    path: candidatePath,
    sizeBytes: receipt.image_byte_size,
    sha256: receipt.image_sha256,
  })
  const beforeFile = path.join(root, 'before-explicit-save.igs')
  const original = await lstat(packagePath)
  assert.equal(await realpath(packagePath), packagePath)
  assert.ok(original.isFile() && original.uid === process.getuid() && original.nlink === 1)
  await copyFile(packagePath, beforeFile, constants.COPYFILE_EXCL)
  const retainedBefore = await identity(beforeFile)
  assert.deepEqual(retainedBefore, { ...initialPackage, path: beforeFile })

  const { page } = state
  const toolbar = page.getByRole('toolbar', { name: 'Project history', exact: true })
  const undo = toolbar.getByRole('button', { name: 'Undo', exact: true })
  const redo = toolbar.getByRole('button', { name: 'Redo', exact: true })
  const history = page.getByRole('dialog', { name: 'Accepted results', exact: true })
  const historyButton = page.getByRole('button', { name: 'Accepted results', exact: true })
  const assertResults = async () => {
    const results = await projectCall(page, 'listGenerationResults', projectId)
    assert.deepEqual(results, {
      candidates: [],
      lastActualSeed: candidate.actualSeed,
      unfinishedSiblingJobIds: [],
      recoveryUnavailable: false,
    })
  }
  await expect.poll(() => operationalRows(snapshot).generation_acceptance_journal).toEqual([])
  const operational = operationalRows(snapshot)
  const completed = operational.generation_queue_item.find(({ id }) => id === candidate.queueItemId)
  assert.equal(completed?.status, 'completed')
  assert.equal(completed.status_sequence, receipt.expected_status_sequence + 1)
  assert.deepEqual(
    operational.generation_staging_discarded_session.map(
      ({ local_project_key, staging_session_id }) => [local_project_key, staging_session_id],
    ),
    [[projectId, completed.staging_session_id]],
  )
  assert.deepEqual(operational.generation_candidate_receipt, [receipt])
  assert.equal(operational.generation_seed_cursor.length, 1)
  const [cursor] = operational.generation_seed_cursor
  assert.equal(cursor.local_project_key, projectId)
  assert.equal(cursor.candidate_id, candidate.candidateId)
  assert.equal(cursor.actual_seed, candidate.actualSeed)
  assert.equal(cursor.completion_order, receipt.completion_order)
  assert.deepEqual(operational.project_accepted_result_index, [])
  const assertUnchanged = async () => {
    await assertResults()
    assert.deepEqual(operationalRows(snapshot), operational)
    assert.deepEqual(await identity(packagePath), initialPackage)
    const current = await lstat(packagePath)
    assert.ok(current.isFile())
    assert.deepEqual([current.dev, current.ino], [original.dev, original.ino])
  }
  await assertUnchanged()
  const acceptedPixels = await rgbaIdentity(page, layer.imageUrl)
  assert.deepEqual([acceptedPixels.width, acceptedPixels.height], [layer.width, layer.height])
  const shadowInputs = { appData, root, projectId, receipt, identity }
  const added = await readShadow({
    ...shadowInputs,
    phase: 'added',
    tab: accepted,
    expectedLayerId: layer.id,
  })
  assert.deepEqual(
    added.raster.generationProvenance.generationConfiguration,
    acceptedData.generationConfiguration,
  )

  await expect(undo).toBeEnabled()
  await undo.click()
  await expect.poll(async () => (await openTab(page, projectId)).layers).toEqual(beforeAdd.layers)
  const undone = await openTab(page, projectId)
  assert.deepEqual(stableTab(undone), stableTab(beforeAdd))
  assert.notEqual(undone.documentRevision, accepted.documentRevision)
  assert.notEqual(undone.documentRevision, beforeAdd.documentRevision)
  assert.equal(undone.canRedo, true)
  await expect(redo).toBeEnabled()
  await historyButton.click()
  await expect(history.getByText('No accepted results yet', { exact: true })).toBeVisible()
  await expect(history.getByRole('listitem')).toHaveCount(0)
  await history.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(history).toBeHidden()
  const removed = await readShadow({
    ...shadowInputs,
    phase: 'undone',
    tab: undone,
    acceptedShadow: added,
  })
  await assertUnchanged()

  await redo.click()
  await expect
    .poll(async () => (await openTab(page, projectId)).layers.map(({ id }) => id))
    .toEqual([layer.id])
  const redone = await openTab(page, projectId)
  assert.deepEqual(stableTab(redone), stableTab(accepted))
  assert.equal(redone.canUndo, true)
  assert.equal(redone.canRedo, false)
  assert.notEqual(redone.documentRevision, accepted.documentRevision)
  assert.notEqual(redone.documentRevision, undone.documentRevision)
  const [redoneLayer] = redone.layers
  assert.notEqual(redoneLayer.imageUrl, layer.imageUrl)
  assert.equal(redone.acceptedResults[0].imageUrl, redoneLayer.imageUrl)
  await expect(redo).toBeDisabled()
  const [redoneData, redonePixels] = await Promise.all([
    projectCall(page, 'getRasterGenerationData', projectId, redone.documentId, layer.id),
    rgbaIdentity(page, redoneLayer.imageUrl),
  ])
  assert.equal(redoneData.documentId, acceptedData.documentId)
  assert.equal(redoneData.layerId, acceptedData.layerId)
  assert.deepEqual(redoneData.generationConfiguration, acceptedData.generationConfiguration)
  assert.deepEqual(redonePixels, acceptedPixels)
  await historyButton.click()
  const item = history.getByRole('listitem')
  await expect(item).toHaveCount(1)
  await expect(item).toHaveAttribute('data-layer-id', layer.id)
  await history.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(history).toBeHidden()
  const replayed = await readShadow({
    ...shadowInputs,
    phase: 'redone',
    tab: redone,
    expectedLayerId: layer.id,
    acceptedShadow: added,
  })
  assert.deepEqual(replayed.raster, added.raster)
  assert.notEqual(replayed.snapshotId, removed.snapshotId)
  await assertUnchanged()
  const compact = ({ raster: _raster, ...witness }) => witness
  return {
    redone,
    report: {
      documentId: accepted.documentId,
      revisions: {
        beforeAdd: beforeAdd.documentRevision,
        added: accepted.documentRevision,
        undone: undone.documentRevision,
        redone: redone.documentRevision,
      },
      raster: {
        id: layer.id,
        candidateId: candidate.candidateId,
        sha256: receipt.image_sha256,
        ...redonePixels,
      },
      shadow: { added: compact(added), undone: compact(removed), redone: compact(replayed) },
      beforeExplicitSave: retainedBefore,
      completedQueueItemId: candidate.queueItemId,
      operationalSha256: sha256(JSON.stringify(operational)),
      seed: candidate.actualSeed,
    },
  }
}
