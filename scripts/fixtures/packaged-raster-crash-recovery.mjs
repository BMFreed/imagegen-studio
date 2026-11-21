/** Qualify recovery of a trained Raster accepted into a dirty packaged Project. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { expect } from '@playwright/test'

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const operationalTables = [
  'generation_queue_item',
  'generation_candidate_receipt',
  'generation_seed_cursor',
  'generation_staging_discarded_session',
  'generation_acceptance_journal',
  'project_accepted_result_index',
]

async function readOwned(filename, maxBytes) {
  assert.equal(await realpath(filename), filename)
  const handle = await open(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const before = await handle.stat({ bigint: true })
    assert.ok(before.isFile() && before.uid === BigInt(process.getuid()) && before.nlink === 1n)
    assert.ok(before.size > 0n && before.size <= BigInt(maxBytes))
    const bytes = Buffer.alloc(Number(before.size))
    assert.equal((await handle.read(bytes, 0, bytes.length, 0)).bytesRead, bytes.length)
    const named = await lstat(filename, { bigint: true })
    for (const field of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs']) {
      assert.equal(named[field], before[field])
    }
    return {
      bytes,
      proof: { path: filename, sizeBytes: bytes.length, sha256: sha256(bytes) },
    }
  } finally {
    await handle.close()
  }
}

async function readShadow(directory, tab, receipt) {
  const maxJsonBytes = 1024 * 1024
  const manifest = await readOwned(path.join(directory, 'manifest.json'), maxJsonBytes)
  const metadata = JSON.parse(manifest.bytes.toString('utf8'))
  assert.equal(metadata.state, 'dirty')
  assert.equal(metadata.shadowVersion, 1)
  assert.equal(metadata.localProjectKey, tab.id)
  assert.equal(metadata.documentId, tab.documentId)
  assert.equal(metadata.documentRevision, tab.documentRevision)
  assert.equal(metadata.committingDocument, undefined)
  assert.match(metadata.snapshotId, uuid)
  const snapshot = path.join(directory, 'snapshots', metadata.snapshotId)
  const documentFile = await readOwned(path.join(snapshot, 'project.json'), maxJsonBytes)
  const document = JSON.parse(documentFile.bytes.toString('utf8'))
  assert.equal(metadata.documentHash, documentFile.proof.sha256)
  assert.equal(document.documentId, tab.documentId)
  assert.equal(document.documentRevision, tab.documentRevision)
  assert.equal(document.layers.length, 1)
  const [layer] = document.layers
  assert.equal(layer.kind, 'raster')
  assert.equal(layer.id, tab.layers[0].id)
  assert.match(layer.id, uuid)
  const asset = `assets/layers/${layer.id}.png`
  const dirtyAsset = { path: asset, bytes: receipt.image_byte_size, sha256: receipt.image_sha256 }
  assert.deepEqual(metadata.dirtyAssets, [dirtyAsset])
  assert.deepEqual(layer.asset, {
    ...dirtyAsset,
    width: tab.layers[0].width,
    height: tab.layers[0].height,
  })
  const raster = await readOwned(path.join(snapshot, asset), 32 * 1024 * 1024)
  assert.equal(raster.proof.sizeBytes, dirtyAsset.bytes)
  assert.equal(raster.proof.sha256, dirtyAsset.sha256)
  return {
    document,
    metadata,
    manifest,
    documentFile,
    raster,
    proof: {
      snapshotId: metadata.snapshotId,
      manifest: manifest.proof,
      document: documentFile.proof,
      raster: raster.proof,
    },
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
    if (!context) throw new Error('Cannot decode the recovered Raster.')
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

export async function recoverPackagedRasterAfterCrash({
  state,
  project,
  accepted,
  acceptedData,
  packagePath,
  initialPackage,
  root,
  appData,
  historyEvidence,
  receipt,
  crashForRecovery,
  launch,
  readPorts,
  identity,
  openTab,
  projectCall,
  snapshot,
  retainOwnStore,
}) {
  assert.match(project.id, /^project-v1-[0-9a-f]{64}$/)
  assert.equal(accepted.id, project.id)
  assert.equal(accepted.documentId, historyEvidence.documentId)
  assert.equal(accepted.documentRevision, historyEvidence.revisions.redone)
  assert.equal(accepted.dirty, true)
  assert.equal(accepted.layers.length, 1)
  const [acceptedLayer] = accepted.layers
  assert.equal(acceptedLayer.id, historyEvidence.raster.id)
  const directory = path.join(appData, 'autosave', project.id)

  const assertOriginalPackage = async () => {
    assert.equal(await realpath(packagePath), packagePath)
    const current = await lstat(packagePath)
    assert.ok(current.isFile() && current.uid === process.getuid() && current.nlink === 1)
    assert.deepEqual(await identity(packagePath), initialPackage)
    return { device: current.dev, inode: current.ino, ...initialPackage }
  }
  const original = await assertOriginalPackage()
  const operationalRows = ({ tables }) =>
    Object.fromEntries(operationalTables.map((name) => [name, tables[name].rows]))
  const operational = operationalRows(snapshot())
  assert.equal(sha256(JSON.stringify(operational)), historyEvidence.operationalSha256)
  assert.deepEqual(operational.generation_candidate_receipt, [receipt])

  const beforeCrash = await readShadow(directory, accepted, receipt)
  const redone = historyEvidence.shadow.redone
  assert.equal(beforeCrash.metadata.snapshotId, redone.snapshotId)
  assert.equal(beforeCrash.metadata.baseDocumentHash, redone.baseDocumentHash)
  assert.equal(beforeCrash.metadata.baseDocumentRevision, redone.baseDocumentRevision)
  const priorFiles = [
    [beforeCrash.manifest, redone.retainedManifest, redone.manifestSha256],
    [beforeCrash.documentFile, redone.retainedDocument, redone.documentSha256],
  ]
  for (const [live, retainedPath, expectedHash] of priorFiles) {
    assert.equal(path.dirname(retainedPath), root)
    const retained = await readOwned(retainedPath, live.proof.sizeBytes)
    assert.equal(retained.proof.sha256, expectedHash)
    assert.ok(retained.bytes.equals(live.bytes))
  }

  const crash = await crashForRecovery(state)
  assert.equal(crash.intent.expectedSignal, 'SIGKILL')
  assert.equal(crash.intent.mainOnly, true)
  assert.equal(crash.scopeExit.confirmed, true)
  const savedAtCrash = await retainOwnStore('after-crash-before-recovery')
  assert.deepEqual(savedAtCrash.project, initialPackage)
  const assertUnchanged = async () => {
    const shadow = await readShadow(directory, accepted, receipt)
    assert.deepEqual(shadow.proof, beforeCrash.proof)
    assert.deepEqual(await assertOriginalPackage(), original)
    assert.deepEqual(operationalRows(snapshot()), operational)
    return shadow
  }
  const afterCrash = await assertUnchanged()
  const retain = async (name, { bytes, proof }) => {
    const filename = path.join(root, name)
    await writeFile(filename, bytes, { flag: 'wx', mode: 0o600 })
    const retained = await identity(filename)
    assert.deepEqual(retained, { ...proof, path: filename })
    return retained
  }
  const retainedRaster = await retain('raster-crash-before-recovery.png', afterCrash.raster)

  const saveState = await launch('recovered')
  saveState.discardOwnedProjectId = project.id
  const { page } = saveState
  const ports = await readPorts(saveState)
  assert.deepEqual(
    ports.projects.value.map(({ id, title }) => ({ id, title })),
    [{ id: project.id, title: project.title }],
  )
  const home = page.getByRole('region', { name: 'Home', exact: true })
  const openProject = home.getByRole('button', { name: `Open ${project.title}`, exact: true })
  const projectTab = page.getByRole('tab', { name: project.title, exact: true })
  const dialog = page.getByRole('dialog', { name: 'Recovery available', exact: true })
  const recover = dialog.getByRole('button', { name: 'Recover', exact: true })
  await openProject.click()
  await expect(dialog).toBeVisible()
  await expect(recover).toBeEnabled()
  const beforeCancel = snapshot()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(home).toBeVisible()
  await expect(openProject).toBeVisible()
  await expect(projectTab).toHaveCount(0)
  const afterCancel = await assertUnchanged()
  assert.deepEqual(snapshot(), beforeCancel)

  await openProject.click()
  await expect(dialog).toBeVisible()
  await expect(recover).toBeEnabled()
  await recover.click()
  await expect(dialog).toBeHidden()
  await expect(projectTab).toHaveAttribute('aria-selected', 'true')
  await expect(projectTab.locator('[aria-label="Unsaved changes"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save Project', exact: true })).toBeEnabled()
  const recovered = await openTab(page, project.id)
  assert.equal(recovered.documentId, accepted.documentId)
  assert.equal(recovered.id, accepted.id)
  assert.equal(recovered.dirty, true)
  assert.equal(recovered.autosaveError, null)
  assert.equal(recovered.canUndo, false)
  assert.equal(recovered.canRedo, false)
  assert.match(recovered.documentRevision, uuid)
  assert.notEqual(recovered.documentRevision, beforeCrash.metadata.baseDocumentRevision)
  assert.ok(!Object.values(historyEvidence.revisions).includes(recovered.documentRevision))
  for (const key of ['generationDraft', 'primaryBbox', 'lastActualSeedSnapshot']) {
    assert.deepEqual(recovered[key], accepted[key])
  }
  const withoutUrls = (items) => items.map(({ imageUrl: _url, ...item }) => item)
  assert.deepEqual(withoutUrls(recovered.layers), withoutUrls(accepted.layers))
  assert.deepEqual(withoutUrls(recovered.acceptedResults), withoutUrls(accepted.acceptedResults))
  const [layer] = recovered.layers
  assert.ok(layer.imageUrl)
  assert.equal(recovered.acceptedResults[0].imageUrl, layer.imageUrl)
  const pixels = await rgbaIdentity(page, layer.imageUrl)
  const { width, height, rgbaSha256 } = historyEvidence.raster
  assert.deepEqual(pixels, { width, height, rgbaSha256 })
  const recoveredData = await projectCall(
    page,
    'getRasterGenerationData',
    project.id,
    recovered.documentId,
    layer.id,
  )
  assert.equal(recoveredData.documentId, acceptedData.documentId)
  assert.equal(recoveredData.layerId, acceptedData.layerId)
  assert.deepEqual(recoveredData.generationConfiguration, acceptedData.generationConfiguration)
  assert.deepEqual(await projectCall(page, 'listGenerationResults', project.id), {
    candidates: [],
    lastActualSeed: historyEvidence.seed,
    unfinishedSiblingJobIds: [],
    recoveryUnavailable: false,
  })

  const restored = await readShadow(directory, recovered, receipt)
  assert.deepEqual(restored.document, {
    ...afterCrash.document,
    documentRevision: recovered.documentRevision,
  })
  assert.equal(restored.metadata.baseDocumentHash, redone.baseDocumentHash)
  assert.equal(restored.metadata.baseDocumentRevision, redone.baseDocumentRevision)
  assert.notEqual(restored.metadata.snapshotId, redone.snapshotId)
  assert.ok(restored.raster.bytes.equals(afterCrash.raster.bytes))
  assert.deepEqual(operationalRows(snapshot()), operational)
  assert.deepEqual(await assertOriginalPackage(), original)

  return {
    saveState,
    recovered,
    report: {
      crash,
      savedAtCrash,
      savedPackageBeforeExplicitSave: original,
      operationalSha256: historyEvidence.operationalSha256,
      completedQueueItemId: receipt.queue_item_id,
      candidateId: receipt.candidate_id,
      seed: historyEvidence.seed,
      pixels,
      recoveredRevision: recovered.documentRevision,
      shadow: {
        afterCrash: { ...afterCrash.proof, retainedRaster },
        afterCancel: afterCancel.proof,
        afterRecover: {
          ...restored.proof,
          retainedManifest: await retain('raster-crash-recovered-shadow.json', restored.manifest),
          retainedDocument: await retain(
            'raster-crash-recovered-project.json',
            restored.documentFile,
          ),
        },
      },
    },
  }
}
