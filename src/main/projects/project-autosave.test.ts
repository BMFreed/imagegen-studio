import { projectAssetReferences } from '../../shared/projects/project-schema.js'
import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
  copyFile,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { ProjectAutosaveCoordinator, ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { localProjectRecoveryKey, refreshProjectLocationRegistry } from './project-identity.js'
import { withProjectPathLock } from './project-path-lock.js'
import { readProjectPlaceholders } from './project-placeholders.js'
import { ProjectSession } from './project-session.js'
import {
  ProjectShadowStore,
  type ProjectShadowWriteInput,
  type ProjectShadowWriteOptions,
} from './project-shadow.js'
import {
  acceptedOutputPngFixture,
  acceptedRasterProvenanceFixture,
} from './test-fixtures/accepted-provenance.js'
import { requireRasterLayer } from './test-fixtures/require-raster-layer.js'

const placeholdersDir = path.resolve('src/main/projects/placeholders')
const raster = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGO06bnDwMDAxMDAwMDAAAATOgGonVuaBAAAAABJRU5ErkJggg==',
  'base64',
)
const transparentRaster = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAC0lEQVR4nGNgQAcAABIAAXfx+gAAAAAASUVORK5CYII=',
  'base64',
)
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

async function withProject(
  run: (context: {
    directory: string
    projectPath: string
    roots: { placeholdersDir: string; scratchDir: string }
    shadow: ProjectShadowStore
  }) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-autosave-'))
  const roots = { placeholdersDir, scratchDir: path.join(directory, 'scratch') }
  const shadow = new ProjectShadowStore(path.join(directory, 'app-data', 'autosave'))
  try {
    const session = await ProjectSession.create(path.join(directory, 'project.igs'), 'Saved', roots)
    await run({ directory, projectPath: session.filePath, roots, shadow })
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

function withRaster(
  document: IgsProjectDocumentV1,
  bytes: Buffer = raster,
  size: { height: number; width: number } = { height: 2, width: 2 },
): {
  assetPath: string
  document: IgsProjectDocumentV1
} {
  const id = randomUUID()
  const assetPath = `assets/layers/${id}.png`
  return {
    assetPath,
    document: {
      ...document,
      layers: [
        {
          asset: {
            bytes: bytes.length,
            height: size.height,
            path: assetPath,
            sha256: sha256(bytes),
            width: size.width,
          },
          blendMode: 'normal',
          id,
          kind: 'raster',
          locked: false,
          name: 'Imported raster',
          opacity: 1,
          transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
          visible: true,
        },
      ],
    },
  }
}

function deferred(): { promise: Promise<void>; release: () => void } {
  let release: () => void = () => undefined
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

async function bindMovedProject(
  database: ReturnType<typeof openAppDatabase>,
  localProjectKey: string,
  destinationPath: string,
  documentId: string,
): Promise<void> {
  await database.db
    .insertInto('project_identity_binding')
    .values({
      canonical_path: destinationPath,
      document_id: documentId,
      local_project_key: localProjectKey,
    })
    .execute()
  refreshProjectLocationRegistry(database.db)
}

/** Real portable metadata publication; Core journal/repoint is tested in its own owner. */
async function commitRenamePackage(
  sourcePath: string,
  destinationPath: string,
  title: string,
): Promise<IgsProjectDocumentV1> {
  const original = await readIgsPackage(sourcePath)
  const document = { ...original.project, documentRevision: randomUUID(), title }
  const assets: Record<string, { bytes: Buffer }> = {}
  for (const member of projectAssetReferences(original.project)) {
    assets[member.path] = { bytes: await original.readMember(member.path) }
  }
  const preview = {
    merged: await original.readMember('preview/merged.png'),
    rect: original.manifest.preview.rect,
    status: original.manifest.preview.status,
    thumbnail: await original.readMember('preview/thumbnail.webp'),
  }
  if (sourcePath !== destinationPath) {
    await rename(sourcePath, destinationPath)
  }
  await saveIgsPackage(destinationPath, { assets, preview, project: document })
  return document
}

test('clean relocation retains Undo, Redo and retained raster sources in the same coordinator', async () => {
  await withProject(async ({ directory, projectPath, roots, shadow }) => {
    const database = openAppDatabase(directory, path.resolve('src/main/db/migrations'))
    try {
      const leases = new ProjectAutosaveLeaseRegistry()
      const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
        leaseRegistry: leases,
      })
      const imported = withRaster(coordinator.document)
      await coordinator.applyDocument(imported.document, {
        [imported.assetPath]: { bytes: raster },
      })
      await coordinator.save()
      await coordinator.applyDocument({ ...coordinator.document, layers: [], title: 'Empty saved' })
      await coordinator.save()
      await coordinator.applyDocument({ ...coordinator.document, title: 'Future title' })
      await coordinator.undo()
      const cleanDocument = coordinator.document
      const cleanEpoch = coordinator.documentEpoch
      assert.equal(coordinator.canUndo, true)
      assert.equal(coordinator.canRedo, true)
      const destination = path.join(directory, 'moved.igs')
      const stableKey = localProjectRecoveryKey(projectPath)
      const reservation = await coordinator.prepareRelocation(destination)
      assert.equal(coordinator.relocationPending, true)
      assert.equal(coordinator.canUndo, false)
      assert.equal(coordinator.canRedo, false)
      await assert.rejects(coordinator.save(), { code: 'SAVE_IN_PROGRESS' })
      await assert.rejects(coordinator.flush(), { code: 'SAVE_IN_PROGRESS' })
      await assert.rejects(coordinator.discardChanges(roots), { code: 'SAVE_IN_PROGRESS' })
      await rename(projectPath, destination)
      await bindMovedProject(database, stableKey, destination, cleanDocument.documentId)
      await reservation.rebind()
      await reservation.rebind()
      reservation.assertCurrent()
      assert.equal(coordinator.filePath, destination)
      assert.equal(coordinator.documentEpoch, cleanEpoch)
      assert.deepEqual(coordinator.document, cleanDocument)
      assert.equal(coordinator.relocationPending, true)
      assert.throws(() => leases.acquire(projectPath), { code: 'PROJECT_ALREADY_OPEN' })
      assert.throws(() => leases.acquire(destination), { code: 'PROJECT_ALREADY_OPEN' })
      reservation.release()
      assert.equal(coordinator.relocationPending, false)
      assert.equal(coordinator.canUndo, true)
      assert.equal(coordinator.canRedo, true)
      const releaseOriginal = leases.acquire(projectPath)
      releaseOriginal()
      await coordinator.redo()
      assert.equal(coordinator.document.title, 'Future title')
      await coordinator.undo()
      await coordinator.undo()
      assert.equal(coordinator.document.layers.length, 1)
      assert.equal((await coordinator.save()).recovery.status, 'clean')
      assert.deepEqual(
        await (await readIgsPackage(destination)).readMember(imported.assetPath),
        raster,
      )
      await assert.rejects(readFile(projectPath), { code: 'ENOENT' })
      await coordinator.close()
      const reopened = await ProjectAutosaveCoordinator.open(destination, roots, shadow, {
        leaseRegistry: leases,
      })
      assert.equal(reopened.document.layers.length, 1)
      await reopened.close()
    } finally {
      await database.close()
    }
  })
})

test('clean Rename rebases only lifecycle title over Undo and Redo and preserves retained raster Save sources', async () => {
  await withProject(async ({ directory, projectPath, roots, shadow }) => {
    const database = openAppDatabase(directory, path.resolve('src/main/db/migrations'))
    const leases = new ProjectAutosaveLeaseRegistry()
    try {
      const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
        leaseRegistry: leases,
      })
      const imported = withRaster(coordinator.document)
      await coordinator.applyDocument(imported.document, {
        [imported.assetPath]: { bytes: raster },
      })
      await coordinator.save()
      await coordinator.applyDocument({ ...coordinator.document, layers: [] })
      await coordinator.save()
      await coordinator.applyDocument({
        ...coordinator.document,
        primaryBbox: { ...coordinator.document.primaryBbox, x: 23 },
      })
      await coordinator.undo()
      const original = coordinator.document
      const epoch = coordinator.documentEpoch
      assert.equal(coordinator.dirty, false)
      assert.equal(coordinator.canUndo, true)
      assert.equal(coordinator.canRedo, true)
      const destination = path.join(directory, 'Renamed.igs')
      const reservation = await coordinator.prepareRelocation(destination, {
        renameTitle: 'Renamed',
      })
      const expected = await commitRenamePackage(projectPath, destination, 'Renamed')
      await bindMovedProject(
        database,
        localProjectRecoveryKey(projectPath),
        destination,
        original.documentId,
      )
      await reservation.rebind(expected)
      assert.equal(coordinator.documentEpoch, epoch + 1)
      assert.equal(coordinator.document.title, 'Renamed')
      assert.equal(coordinator.document.documentRevision, expected.documentRevision)
      assert.equal(coordinator.dirty, false)
      assert.deepEqual(
        {
          ...coordinator.document,
          documentRevision: original.documentRevision,
          title: original.title,
        },
        original,
      )
      await reservation.rebind(structuredClone(expected))
      assert.equal(coordinator.documentEpoch, epoch + 1)
      await assert.rejects(reservation.rebind({ ...expected, documentRevision: randomUUID() }), {
        code: 'EDIT_CONFLICT',
      })
      await assert.rejects(coordinator.undo(), { code: 'SAVE_IN_PROGRESS' })
      assert.throws(() => leases.acquire(projectPath), { code: 'PROJECT_ALREADY_OPEN' })
      assert.throws(() => leases.acquire(destination), { code: 'PROJECT_ALREADY_OPEN' })
      reservation.release()
      assert.equal(coordinator.canUndo, true)
      assert.equal(coordinator.canRedo, true)
      await coordinator.redo()
      assert.equal(coordinator.document.title, 'Renamed')
      assert.equal(coordinator.document.primaryBbox.x, 23)
      await coordinator.undo()
      assert.equal(coordinator.document.title, 'Renamed')
      assert.equal(coordinator.document.documentRevision, expected.documentRevision)
      assert.equal(coordinator.dirty, false)
      await coordinator.undo()
      assert.equal(coordinator.document.title, 'Renamed')
      assert.equal(coordinator.document.layers.length, 1)
      assert.equal((await coordinator.save()).recovery.status, 'clean')
      const saved = await readIgsPackage(destination)
      assert.equal(saved.project.title, 'Renamed')
      assert.deepEqual(await saved.readMember(imported.assetPath), raster)
      await assert.rejects(readFile(projectPath), { code: 'ENOENT' })
      await coordinator.close()
    } finally {
      await database.close()
    }
  })
})

test('same-path metadata Rename retains its original physical lease through finalize and ordinary close', async () => {
  await withProject(async ({ projectPath, roots, shadow }) => {
    const leases = new ProjectAutosaveLeaseRegistry()
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
      leaseRegistry: leases,
    })
    const initial = coordinator.document
    await coordinator.applyDocument(
      { ...initial, primaryBbox: { ...initial.primaryBbox, x: 13 } },
      {},
      { historyGroupId: 'returned-clean-group' },
    )
    await coordinator.applyDocument(
      { ...coordinator.document, primaryBbox: initial.primaryBbox },
      {},
      { historyGroupId: 'returned-clean-group' },
    )
    assert.equal(coordinator.dirty, false)
    assert.equal(coordinator.canUndo, false)
    await assert.rejects(coordinator.prepareRelocation(projectPath), { code: 'EDIT_CONFLICT' })
    const reservation = await coordinator.prepareRelocation(projectPath, { renameTitle: 'project' })
    const expected = await commitRenamePackage(projectPath, projectPath, 'project')
    await reservation.rebind(expected)
    reservation.release()
    assert.equal(coordinator.document.title, 'project')
    assert.equal(coordinator.dirty, false)
    assert.equal(
      coordinator.canUndo,
      false,
      'A returned-clean prompt baseline must not become a phantom Rename step',
    )
    await coordinator.sealHistoryGroup('returned-clean-group')
    assert.equal(coordinator.canUndo, false)
    assert.equal(coordinator.canRedo, false)
    assert.throws(() => leases.acquire(projectPath), { code: 'PROJECT_ALREADY_OPEN' })
    await coordinator.close()
    const release = leases.acquire(projectPath)
    release()
  })
})

test('Rename conflicts an already-prepared edit and increments its document epoch only once after rebind', async () => {
  await withProject(async ({ directory, projectPath, roots, shadow }) => {
    const database = openAppDatabase(directory, path.resolve('src/main/db/migrations'))
    const entered = deferred()
    const proceed = deferred()
    try {
      const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
        beforeEditCommit: async (document) => {
          if (document.primaryBbox.x === 99) {
            entered.release()
            await proceed.promise
          }
        },
        leaseRegistry: new ProjectAutosaveLeaseRegistry(),
      })
      const captured = coordinator.document
      const epoch = coordinator.documentEpoch
      const stale = coordinator.applyDocument(
        { ...captured, primaryBbox: { ...captured.primaryBbox, x: 99 } },
        {},
        { expectedDocumentEpoch: epoch, expectedDocumentRevision: captured.documentRevision },
      )
      const rejected = assert.rejects(stale, { code: 'EDIT_CONFLICT' })
      await entered.promise
      const destination = path.join(directory, 'Fresh Name.igs')
      const reservation = await coordinator.prepareRelocation(destination, {
        renameTitle: 'Fresh Name',
      })
      const expected = await commitRenamePackage(projectPath, destination, 'Fresh Name')
      await bindMovedProject(
        database,
        localProjectRecoveryKey(projectPath),
        destination,
        captured.documentId,
      )
      await reservation.rebind(expected)
      proceed.release()
      reservation.release()
      await rejected
      assert.equal(coordinator.document.title, 'Fresh Name')
      assert.equal(coordinator.document.primaryBbox.x, captured.primaryBbox.x)
      assert.equal(coordinator.documentEpoch, epoch + 1)
      assert.equal(coordinator.canUndo, false)
      assert.equal(coordinator.canRedo, false)
      await coordinator.close()
    } finally {
      proceed.release()
      await database.close()
    }
  })
})

test('failed Rename rebind holds both leases until exact retry and explicit pending close preserves retained history assets', async () => {
  await withProject(async ({ directory, projectPath, roots, shadow }) => {
    const database = openAppDatabase(directory, path.resolve('src/main/db/migrations'))
    const leases = new ProjectAutosaveLeaseRegistry()
    try {
      const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
        leaseRegistry: leases,
      })
      const imported = withRaster(coordinator.document)
      await coordinator.applyDocument(imported.document, {
        [imported.assetPath]: { bytes: raster },
      })
      await coordinator.save()
      await coordinator.applyDocument({ ...coordinator.document, layers: [] })
      await coordinator.save()
      const retained = (await readdir(roots.scratchDir)).find((entry) =>
        entry.startsWith('igs-save-base-'),
      )
      assert.ok(retained)
      const retainedAsset = path.join(roots.scratchDir, retained, '0.asset')
      const original = coordinator.document
      const epoch = coordinator.documentEpoch
      const destination = path.join(directory, 'Retry Name.igs')
      const reservation = await coordinator.prepareRelocation(destination, {
        renameTitle: 'Retry Name',
      })
      const expected = await commitRenamePackage(projectPath, destination, 'Retry Name')
      await bindMovedProject(
        database,
        localProjectRecoveryKey(projectPath),
        destination,
        original.documentId,
      )
      await assert.rejects(
        reservation.rebind({ ...expected, primaryBbox: { ...expected.primaryBbox, x: 8 } }),
        { code: 'PROJECT_EXTERNAL_CHANGE' },
      )
      assert.deepEqual(coordinator.document, original)
      assert.equal(coordinator.documentEpoch, epoch)
      assert.equal(coordinator.relocationPending, true)
      assert.throws(() => leases.acquire(projectPath), { code: 'PROJECT_ALREADY_OPEN' })
      assert.throws(() => leases.acquire(destination), { code: 'PROJECT_ALREADY_OPEN' })
      await reservation.rebind(expected)
      assert.equal(coordinator.documentEpoch, epoch + 1)
      const waiting = coordinator.applyDocument({
        ...coordinator.document,
        primaryBbox: { ...coordinator.document.primaryBbox, x: 91 },
      })
      const rejected = assert.rejects(waiting, { code: 'COORDINATOR_CLOSED' })
      await reservation.abandonForShutdown()
      await rejected
      assert.deepEqual(await readFile(retainedAsset), raster)
      assert.equal((await readIgsPackage(destination)).project.title, 'Retry Name')
      const releaseSource = leases.acquire(projectPath)
      releaseSource()
      const releaseTarget = leases.acquire(destination)
      releaseTarget()
    } finally {
      await database.close()
    }
  })
})

test('relocation cancellation releases only its destination and waits for unchanged source proof', async () => {
  await withProject(async ({ directory, projectPath, roots, shadow }) => {
    const leases = new ProjectAutosaveLeaseRegistry()
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
      leaseRegistry: leases,
    })
    const destination = path.join(directory, 'moved.igs')
    const reservation = await coordinator.prepareRelocation(destination)
    let committed = false
    const preparedEdit = coordinator
      .applyDocument({ ...coordinator.document, title: 'Queued edit' })
      .then(() => {
        committed = true
      })
    await Promise.resolve()
    assert.equal(committed, false)
    assert.throws(() => leases.acquire(destination), { code: 'PROJECT_ALREADY_OPEN' })
    reservation.release()
    await preparedEdit
    assert.equal(coordinator.document.title, 'Queued edit')
    assert.throws(() => leases.acquire(projectPath), { code: 'PROJECT_ALREADY_OPEN' })
    const releaseDestination = leases.acquire(destination)
    releaseDestination()
    await coordinator.undo()
    await coordinator.close()
  })
})

test('dirty and leased destinations fail before a relocation scope or physical move is published', async () => {
  await withProject(async ({ directory, projectPath, roots, shadow }) => {
    const leases = new ProjectAutosaveLeaseRegistry()
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
      leaseRegistry: leases,
    })
    const destination = path.join(directory, 'moved.igs')
    await coordinator.applyDocument({ ...coordinator.document, title: 'Dirty' })
    await assert.rejects(coordinator.prepareRelocation(destination), { code: 'PROJECT_DIRTY' })
    assert.equal(coordinator.relocationPending, false)
    await coordinator.undo()
    const releaseDestination = leases.acquire(destination)
    await assert.rejects(coordinator.prepareRelocation(destination), {
      code: 'PROJECT_ALREADY_OPEN',
    })
    assert.equal(coordinator.relocationPending, false)
    assert.equal(coordinator.canRedo, true)
    assert.equal((await readIgsPackage(projectPath)).project.title, 'Saved')
    releaseDestination()
    await coordinator.close()
  })
})

test('failed live rebind keeps both leases and edits fenced until exact repaired retry finalizes', async () => {
  await withProject(async ({ directory, projectPath, roots, shadow }) => {
    const database = openAppDatabase(directory, path.resolve('src/main/db/migrations'))
    try {
      const leases = new ProjectAutosaveLeaseRegistry()
      const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
        leaseRegistry: leases,
      })
      const destination = path.join(directory, 'moved.igs')
      const stableKey = localProjectRecoveryKey(projectPath)
      const reservation = await coordinator.prepareRelocation(destination)
      await rename(projectPath, destination)
      await assert.rejects(reservation.rebind(), { code: 'PROJECT_EXTERNAL_CHANGE' })
      assert.throws(() => reservation.release(), { code: 'ENOENT' })
      assert.equal(coordinator.filePath, projectPath)
      assert.equal(coordinator.relocationPending, true)
      assert.throws(() => leases.acquire(projectPath), { code: 'PROJECT_ALREADY_OPEN' })
      assert.throws(() => leases.acquire(destination), { code: 'PROJECT_ALREADY_OPEN' })
      let committed = false
      const preparedEdit = coordinator
        .applyDocument({ ...coordinator.document, title: 'After finalize' })
        .then(() => {
          committed = true
        })
      await bindMovedProject(database, stableKey, destination, coordinator.document.documentId)
      await reservation.rebind()
      await Promise.resolve()
      assert.equal(committed, false)
      assert.equal(coordinator.document.title, 'Saved')
      assert.equal(coordinator.relocationPending, true)
      reservation.release()
      await preparedEdit
      assert.equal(coordinator.document.title, 'After finalize')
      await coordinator.save()
      assert.equal((await readIgsPackage(destination)).project.title, 'After finalize')
      await coordinator.close()
    } finally {
      await database.close()
    }
  })
})

test('explicit shutdown abandons a failed move without old-path writes or retained-source cleanup', async () => {
  await withProject(async ({ directory, projectPath, roots, shadow }) => {
    const leases = new ProjectAutosaveLeaseRegistry()
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
      leaseRegistry: leases,
    })
    const imported = withRaster(coordinator.document)
    await coordinator.applyDocument(imported.document, { [imported.assetPath]: { bytes: raster } })
    await coordinator.save()
    await coordinator.applyDocument({ ...coordinator.document, layers: [] })
    await coordinator.save()
    const retained = (await readdir(roots.scratchDir)).find((entry) =>
      entry.startsWith('igs-save-base-'),
    )
    assert.ok(retained)
    const retainedAsset = path.join(roots.scratchDir, retained, '0.asset')
    assert.deepEqual(await readFile(retainedAsset), raster)
    const destination = path.join(directory, 'moved.igs')
    const reservation = await coordinator.prepareRelocation(destination)
    await rename(projectPath, destination)
    await assert.rejects(reservation.rebind(), { code: 'PROJECT_EXTERNAL_CHANGE' })
    const waitingEdit = coordinator.applyDocument({
      ...coordinator.document,
      title: 'Must not publish',
    })
    const rejectedEdit = assert.rejects(waitingEdit, { code: 'COORDINATOR_CLOSED' })
    await reservation.abandonForShutdown()
    await rejectedEdit
    assert.equal(coordinator.relocationPending, false)
    assert.equal(coordinator.canUndo, false)
    assert.equal(coordinator.canRedo, false)
    assert.deepEqual(await readFile(retainedAsset), raster)
    await assert.rejects(readFile(projectPath), { code: 'ENOENT' })
    assert.equal((await readIgsPackage(destination)).project.title, 'Saved')
    const releaseOriginal = leases.acquire(projectPath)
    const releaseDestination = leases.acquire(destination)
    releaseOriginal()
    releaseDestination()
  })
})

test('debounced dirty document recovers after restart without changing saved .igs', async () => {
  await withProject(async ({ projectPath, roots, shadow }) => {
    const restartedProcess = new ProjectAutosaveLeaseRegistry()
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
      debounceMs: 10,
    })
    const original = await readFile(projectPath)
    await coordinator.applyDocument({ ...coordinator.document, title: 'Recovered edit' })
    const committed = await coordinator.flush()
    assert.equal(committed?.documentRevision, coordinator.document.documentRevision)
    assert.equal(coordinator.dirty, true)
    assert.deepEqual(await readFile(projectPath), original)
    assert.equal(
      (await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)).status,
      'recoverable',
    )
    await assert.rejects(
      ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
        leaseRegistry: restartedProcess,
      }),
      { code: 'RECOVERY_DECISION_REQUIRED' },
    )

    const recovered = await ProjectAutosaveCoordinator.recover(
      projectPath,
      roots,
      new ProjectShadowStore(path.join(path.dirname(projectPath), 'app-data', 'autosave')),
      { leaseRegistry: restartedProcess },
    )
    assert.equal(recovered.document.title, 'Recovered edit')
    assert.equal(recovered.dirty, true)
    assert.equal(recovered.canUndo, false)
    assert.equal(recovered.canRedo, false)
    assert.equal((await readIgsPackage(projectPath)).project.title, 'Saved')
    const saved = await recovered.save()
    assert.equal(saved.committed, true)
    assert.equal(saved.recovery.status, 'clean')
    assert.equal((await readIgsPackage(projectPath)).project.title, 'Recovered edit')
    assert.equal(
      (await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)).status,
      'clean',
    )
  })
})

test('Save-only seed snapshot stays out of dirty state, shadow autosave, and Undo history', async () => {
  await withProject(async ({ projectPath, roots, shadow }) => {
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow)
    const revision = coordinator.document.documentRevision
    const saved = await coordinator.save({ lastActualSeedSnapshot: 17 })
    assert.equal(saved.recovery.status, 'clean')
    assert.equal(coordinator.dirty, false)
    assert.equal(coordinator.canUndo, false)
    assert.equal(coordinator.document.documentRevision, revision)
    assert.equal(coordinator.document.lastActualSeedSnapshot, 17)
    assert.equal((await readIgsPackage(projectPath)).project.lastActualSeedSnapshot, 17)
    assert.equal(
      (await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)).status,
      'absent',
    )

    await coordinator.applyDocument({ ...coordinator.document, lastActualSeedSnapshot: null })
    await coordinator.flush()
    assert.equal(coordinator.dirty, false)
    assert.equal(coordinator.canUndo, false)
    assert.equal(coordinator.document.lastActualSeedSnapshot, 17)
    assert.equal(
      (await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)).status,
      'absent',
    )

    await coordinator.applyDocument({ ...coordinator.document, title: 'Editable change' })
    assert.equal(coordinator.canUndo, true)
    await coordinator.save({ lastActualSeedSnapshot: 23 })
    await coordinator.undo()
    assert.equal(coordinator.document.title, 'Saved')
    assert.equal(coordinator.document.lastActualSeedSnapshot, 23)
    assert.equal(coordinator.dirty, true)
    await coordinator.redo()
    assert.equal(coordinator.document.title, 'Editable change')
    assert.equal(coordinator.document.lastActualSeedSnapshot, 23)
    assert.equal(coordinator.dirty, false)
    assert.equal((await readIgsPackage(projectPath)).project.lastActualSeedSnapshot, 23)
  })
})

test('a later edit remains recoverable across a metadata-only seed Save commit', async () => {
  await withProject(async ({ projectPath, roots, shadow }) => {
    const locked = deferred()
    const releaseLock = deferred()
    const blocker = withProjectPathLock(projectPath, async () => {
      locked.release()
      await releaseLock.promise
    })
    await locked.promise
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow)
    const savedRevision = coordinator.document.documentRevision
    const saving = coordinator.save({ lastActualSeedSnapshot: 81 })
    let editFailure: unknown
    try {
      await coordinator.applyDocument({ ...coordinator.document, title: 'Later edit' })
      await coordinator.flush()
    } catch (error) {
      editFailure = error
    } finally {
      releaseLock.release()
    }
    await blocker
    const outcome = await saving
    if (editFailure) {
      throw editFailure
    }
    assert.equal(outcome.recovery.status, 'dirty')
    const packageAfterSave = await readIgsPackage(projectPath)
    assert.equal(packageAfterSave.project.documentRevision, savedRevision)
    assert.equal(packageAfterSave.project.lastActualSeedSnapshot, 81)
    assert.equal(packageAfterSave.project.title, 'Saved')
    assert.equal(coordinator.document.lastActualSeedSnapshot, 81)
    const inspection = await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)
    assert.equal(inspection.status, 'recoverable')
    if (inspection.status === 'recoverable') {
      assert.equal(inspection.document.title, 'Later edit')
    }
  })
})

test('crash after a metadata-only seed Save commit reopens the concurrent edit', async () => {
  await withProject(async ({ projectPath, roots, shadow }) => {
    const locked = deferred()
    const releaseLock = deferred()
    const blocker = withProjectPathLock(projectPath, async () => {
      locked.release()
      await releaseLock.promise
    })
    await locked.promise
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
      afterSaveCommit: async () => {
        throw new Error('Simulated crash before shadow rebase')
      },
    })
    const saving = coordinator.save({ lastActualSeedSnapshot: 82 })
    try {
      await coordinator.applyDocument({ ...coordinator.document, title: 'Recover after crash' })
      await coordinator.flush()
    } finally {
      releaseLock.release()
    }
    await blocker
    const outcome = await saving
    assert.equal(outcome.recovery.status, 'failed')
    assert.equal((await readIgsPackage(projectPath)).project.lastActualSeedSnapshot, 82)
    const atCrash = await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)
    assert.equal(atCrash.status, 'recoverable')
    const restarted = await ProjectAutosaveCoordinator.recover(projectPath, roots, shadow, {
      leaseRegistry: new ProjectAutosaveLeaseRegistry(),
    })
    assert.equal(restarted.document.title, 'Recover after crash')
    assert.equal(restarted.document.lastActualSeedSnapshot, 82)
    assert.equal(restarted.dirty, true)
  })
})

test('a prepared edit crosses a seed-only Save without reverting its snapshot', async () => {
  await withProject(async ({ projectPath, roots, shadow }) => {
    const staged = deferred()
    const releaseEdit = deferred()
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
      beforeEditCommit: async (document) => {
        if (document.title === 'Prepared edit') {
          staged.release()
          await releaseEdit.promise
        }
      },
    })
    const editing = coordinator.applyDocument({ ...coordinator.document, title: 'Prepared edit' })
    await staged.promise
    const saved = await coordinator.save({ lastActualSeedSnapshot: 99 })
    assert.equal(saved.recovery.status, 'clean')
    releaseEdit.release()
    await editing
    await coordinator.flush()
    assert.equal(coordinator.document.title, 'Prepared edit')
    assert.equal(coordinator.document.lastActualSeedSnapshot, 99)
    assert.equal(coordinator.dirty, true)
    assert.equal(coordinator.canUndo, true)
    assert.equal((await readIgsPackage(projectPath)).project.lastActualSeedSnapshot, 99)
    assert.equal(
      (await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)).status,
      'recoverable',
    )
  })
})

test('a live Project tab blocks duplicate opens and destructive recovery decisions for its canonical path', async () => {
  await withProject(async ({ directory, projectPath, roots, shadow }) => {
    const leases = new ProjectAutosaveLeaseRegistry()
    const first = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
      leaseRegistry: leases,
    })
    await first.applyDocument({ ...first.document, title: 'Keep this edit' })
    await first.flush()
    const alias = path.join(directory, 'project-alias.igs')
    await symlink(projectPath, alias)
    await assert.rejects(
      ProjectAutosaveCoordinator.open(alias, roots, shadow, { leaseRegistry: leases }),
      { code: 'PROJECT_ALREADY_OPEN' },
    )
    const secondSession = await ProjectSession.open(projectPath, roots)
    await assert.rejects(
      ProjectAutosaveCoordinator.attach(secondSession, roots, shadow, { leaseRegistry: leases }),
      { code: 'PROJECT_ALREADY_OPEN' },
    )
    await assert.rejects(
      ProjectAutosaveCoordinator.recover(projectPath, roots, shadow, { leaseRegistry: leases }),
      { code: 'PROJECT_ALREADY_OPEN' },
    )
    await assert.rejects(
      ProjectAutosaveCoordinator.discardRecovery(projectPath, roots, shadow, {
        leaseRegistry: leases,
      }),
      { code: 'PROJECT_ALREADY_OPEN' },
    )
    const inspection = await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)
    assert.equal(inspection.status, 'recoverable')
    if (inspection.status === 'recoverable') {
      assert.equal(inspection.document.title, 'Keep this edit')
    }

    const replacement = await first.discardChanges(roots)
    await assert.rejects(
      ProjectAutosaveCoordinator.open(projectPath, roots, shadow, { leaseRegistry: leases }),
      { code: 'PROJECT_ALREADY_OPEN' },
    )
    assert.equal(replacement.document.title, 'Saved')
    await replacement.close()
    const reopened = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
      leaseRegistry: leases,
    })
    await reopened.close()
  })
})

test('failed recovery and failed discard release their lease for the next open', async () => {
  await withProject(async ({ directory, projectPath, roots, shadow }) => {
    const leases = new ProjectAutosaveLeaseRegistry()
    await assert.rejects(
      ProjectAutosaveCoordinator.recover(projectPath, roots, shadow, { leaseRegistry: leases }),
      { code: 'RECOVERY_NOT_AVAILABLE' },
    )
    class FailingDiscardShadow extends ProjectShadowStore {
      override async discard(): Promise<void> {
        throw new Error('Injected discard failure')
      }
    }
    await assert.rejects(
      ProjectAutosaveCoordinator.discardRecovery(
        projectPath,
        roots,
        new FailingDiscardShadow(path.join(directory, 'app-data', 'autosave')),
        { leaseRegistry: leases },
      ),
      /Injected discard failure/,
    )
    const opened = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
      leaseRegistry: leases,
    })
    await opened.close()
  })
})

test('a failed recovery write keeps the original shadow and releases the new-process lease', async () => {
  await withProject(async ({ directory, projectPath, roots, shadow }) => {
    const original = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow)
    await original.applyDocument({ ...original.document, title: 'Protected edit' })
    await original.flush()
    const restartedProcess = new ProjectAutosaveLeaseRegistry()
    class FailingWriteShadow extends ProjectShadowStore {
      override async write(): Promise<never> {
        throw new Error('Injected recovery write failure')
      }
    }
    await assert.rejects(
      ProjectAutosaveCoordinator.recover(
        projectPath,
        roots,
        new FailingWriteShadow(path.join(directory, 'app-data', 'autosave')),
        { leaseRegistry: restartedProcess },
      ),
      /Injected recovery write failure/,
    )
    const inspection = await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)
    assert.equal(inspection.status, 'recoverable')
    if (inspection.status === 'recoverable') {
      assert.equal(inspection.document.title, 'Protected edit')
    }
    const recovered = await ProjectAutosaveCoordinator.recover(projectPath, roots, shadow, {
      leaseRegistry: restartedProcess,
    })
    assert.equal(recovered.document.title, 'Protected edit')
    await recovered.save()
    await recovered.close()
  })
})

test('the debounce publishes a real shadow without an explicit flush', async () => {
  await withProject(async ({ directory, projectPath, roots }) => {
    const published = deferred()
    class ObservedShadow extends ProjectShadowStore {
      override async write(input: ProjectShadowWriteInput, options?: ProjectShadowWriteOptions) {
        const result = await super.write(input, options)
        published.release()
        return result
      }
    }
    const shadow = new ObservedShadow(path.join(directory, 'app-data', 'autosave'))
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
      debounceMs: 10,
    })
    await coordinator.applyDocument({ ...coordinator.document, title: 'Debounced edit' })
    const timeout = setTimeout(() => published.release(), 2000)
    try {
      await published.promise
    } finally {
      clearTimeout(timeout)
    }
    const inspection = await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)
    assert.equal(inspection.status, 'recoverable')
    if (inspection.status === 'recoverable') {
      assert.equal(inspection.document.title, 'Debounced edit')
    }
  })
})

test('pending imported raster survives caller staging disposal, shadow publication and Save', async () => {
  await withProject(async ({ directory, projectPath, roots, shadow }) => {
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow)
    const sourcePath = path.join(directory, 'caller-import.png')
    await writeFile(sourcePath, raster)
    const edit = withRaster(coordinator.document)
    await assert.rejects(coordinator.applyDocument(edit.document), {
      code: 'ASSET_SOURCE_MISSING',
    })
    assert.equal(coordinator.dirty, false)
    await coordinator.applyDocument(edit.document, {
      [edit.assetPath]: { sourcePath },
    })
    await rm(sourcePath)
    const importedRef = requireRasterLayer(coordinator.document.layers[0])?.asset
    assert.ok(importedRef)
    const activeSource = coordinator.getCurrentAssetSource(importedRef)
    assert.ok(activeSource && 'sourcePath' in activeSource)
    assert.notEqual(activeSource.sourcePath, sourcePath)
    assert.deepEqual(await readFile(activeSource.sourcePath), raster)
    assert.equal(
      coordinator.getCurrentAssetSource({ ...importedRef, sha256: '0'.repeat(64) }),
      null,
    )
    await coordinator.applyDocument({ ...coordinator.document, title: 'Imported and renamed' })
    await coordinator.flush()
    const inspection = await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)
    assert.equal(inspection.status, 'recoverable')
    if (inspection.status === 'recoverable') {
      const asset = inspection.dirtyAssets[edit.assetPath]
      assert.ok(asset && 'sourcePath' in asset)
      assert.deepEqual(await readFile(asset.sourcePath), raster)
    }
    const saved = await coordinator.save()
    assert.equal(saved.recovery.status, 'clean')
    const packageResult = await readIgsPackage(projectPath)
    assert.equal(packageResult.project.title, 'Imported and renamed')
    assert.deepEqual(await packageResult.readMember(edit.assetPath), raster)
    assert.equal(coordinator.getCurrentAssetSource(importedRef), null)
  })
})

test('accepted raster provenance survives dirty shadow recovery and portable Save without rewriting the old package early', async () => {
  await withProject(async ({ directory, projectPath, roots, shadow }) => {
    const oldPackage = await readIgsPackage(projectPath)
    assert.equal(oldPackage.project.layers.length, 0)
    const oldBytes = await readFile(projectPath)
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow)
    const sourceDocument = coordinator.document
    const output = await acceptedOutputPngFixture()
    const accepted = withRaster(sourceDocument, output, { height: 8, width: 8 })
    const provenance = acceptedRasterProvenanceFixture(sourceDocument, output, {
      height: 8,
      width: 8,
      x: 64,
      y: -32,
    })
    requireRasterLayer(accepted.document.layers[0]).generationProvenance = provenance
    requireRasterLayer(accepted.document.layers[0]).transform.x =
      provenance.layerSourceContext.bbox.x
    requireRasterLayer(accepted.document.layers[0]).transform.y =
      provenance.layerSourceContext.bbox.y
    const candidatePath = path.join(directory, 'accepted-output.png')
    await writeFile(candidatePath, output)

    await coordinator.applyDocument(accepted.document, {
      [accepted.assetPath]: { sourcePath: candidatePath },
    })
    await rm(candidatePath)
    await coordinator.flush()

    assert.deepEqual(await readFile(projectPath), oldBytes)
    const inspection = await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)
    assert.equal(inspection.status, 'recoverable')
    if (inspection.status !== 'recoverable') {
      return
    }
    assert.deepEqual(
      requireRasterLayer(inspection.document.layers[0]).generationProvenance,
      provenance,
    )
    const shadowAsset = inspection.dirtyAssets[accepted.assetPath]
    assert.ok(shadowAsset && 'sourcePath' in shadowAsset)
    assert.deepEqual(await readFile(shadowAsset.sourcePath), output)

    const recovered = await ProjectAutosaveCoordinator.recover(projectPath, roots, shadow, {
      leaseRegistry: new ProjectAutosaveLeaseRegistry(),
    })
    assert.deepEqual(
      requireRasterLayer(recovered.document.layers[0]).generationProvenance,
      provenance,
    )
    assert.equal(recovered.dirty, true)
    assert.deepEqual(await readFile(projectPath), oldBytes)

    const saved = await recovered.save()
    assert.equal(saved.committed, true)
    const persisted = await readIgsPackage(projectPath)
    assert.deepEqual(
      requireRasterLayer(persisted.project.layers[0]).generationProvenance,
      provenance,
    )
    assert.deepEqual(await persisted.readMember(accepted.assetPath), output)

    const portablePath = path.join(directory, 'portable.igs')
    await copyFile(projectPath, portablePath)
    const portable = await ProjectSession.open(portablePath, roots)
    assert.deepEqual(
      requireRasterLayer(portable.document.layers[0]).generationProvenance,
      provenance,
    )
    assert.deepEqual(
      await (await readIgsPackage(portablePath)).readMember(accepted.assetPath),
      output,
    )
  })
})

test('an attached import session transfers caller-held asset sources before staging disposal', async () => {
  await withProject(async ({ directory, projectPath, roots, shadow }) => {
    const session = await ProjectSession.open(projectPath, roots)
    const coordinator = await ProjectAutosaveCoordinator.attach(session, roots, shadow)
    const sourcePath = path.join(directory, 'import-owned.png')
    await writeFile(sourcePath, raster)
    const imported = withRaster(session.document)
    session.applyDocument(imported.document)
    await coordinator.adoptCurrentEdit({ [imported.assetPath]: { sourcePath } })
    await rm(sourcePath)
    await coordinator.flush()
    assert.equal(
      (await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)).status,
      'recoverable',
    )
    assert.equal((await coordinator.save()).recovery.status, 'clean')
    assert.deepEqual(
      requireRasterLayer((await readIgsPackage(projectPath)).project.layers[0])?.asset.path,
      imported.assetPath,
    )
  })
})

test('a slower older asset edit cannot overwrite a newer document edit', async () => {
  await withProject(async ({ directory, projectPath, roots, shadow }) => {
    const stagedOlder = deferred()
    const releaseOlder = deferred()
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
      beforeEditCommit: async (document) => {
        if (document.title === 'Older') {
          stagedOlder.release()
          await releaseOlder.promise
        }
      },
    })
    const sourcePath = path.join(directory, 'older.png')
    await writeFile(sourcePath, raster)
    const older = withRaster({ ...coordinator.document, title: 'Older' })
    const applyingOlder = coordinator.applyDocument(older.document, {
      [older.assetPath]: { sourcePath },
    })
    await stagedOlder.promise
    await coordinator.applyDocument({ ...coordinator.document, title: 'Newer' })
    releaseOlder.release()
    await assert.rejects(applyingOlder, { code: 'EDIT_CONFLICT' })
    assert.equal(coordinator.document.title, 'Newer')
    assert.equal(coordinator.document.layers.length, 0)
    await coordinator.flush()
    const inspection = await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)
    assert.equal(inspection.status, 'recoverable')
    if (inspection.status === 'recoverable') {
      assert.equal(inspection.document.title, 'Newer')
    }
  })
})

test('Save preflight waits out an already-staging edit before that edit reaches the session', async () => {
  await withProject(async ({ projectPath, roots, shadow }) => {
    const stagedB = deferred()
    const releaseB = deferred()
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
      beforeEditCommit: async (document) => {
        if (document.title === 'Later B') {
          stagedB.release()
          await releaseB.promise
        }
      },
    })
    await coordinator.applyDocument({ ...coordinator.document, title: 'Save A' })
    const applyingB = coordinator.applyDocument({ ...coordinator.document, title: 'Later B' })
    await stagedB.promise
    const savingA = coordinator.save()
    releaseB.release()
    await applyingB
    const saved = await savingA
    assert.equal(saved.committed, true)
    assert.equal((await readIgsPackage(projectPath)).project.title, 'Save A')
    assert.equal(coordinator.document.title, 'Later B')
    assert.equal(coordinator.dirty, true)
  })
})

test('clean close releases retained import staging while dirty close preserves recovery', async () => {
  await withProject(async ({ directory, projectPath, roots, shadow }) => {
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow)
    const sourcePath = path.join(directory, 'caller.png')
    await writeFile(sourcePath, raster)
    const imported = withRaster(coordinator.document)
    await coordinator.applyDocument(imported.document, {
      [imported.assetPath]: { sourcePath },
    })
    await rm(sourcePath)
    await coordinator.flush()
    await assert.rejects(coordinator.close(), { code: 'RECOVERY_DECISION_REQUIRED' })
    assert.equal(
      (await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)).status,
      'recoverable',
    )
    assert.equal((await coordinator.save()).recovery.status, 'clean')
    assert.ok((await readdir(roots.scratchDir)).some((name) => name.startsWith('igs-pending-')))
    await coordinator.close()
    assert.deepEqual(await readdir(roots.scratchDir), [])
    await assert.rejects(
      coordinator.applyDocument({ ...coordinator.document, title: 'Too late' }),
      {
        code: 'COORDINATOR_CLOSED',
      },
    )
  })
})

test('Save A keeps later B dirty and rebases its recovery shadow on committed A', async () => {
  await withProject(async ({ projectPath, roots, shadow }) => {
    const gate = deferred()
    const committed = deferred()
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
      afterSaveCommit: async () => {
        committed.release()
        await gate.promise
      },
    })
    await coordinator.applyDocument({ ...coordinator.document, title: 'Save A' })
    await coordinator.flush()
    const saving = coordinator.save()
    assert.equal(coordinator.canUndo, false)
    await assert.rejects(coordinator.undo(), { code: 'SAVE_IN_PROGRESS' })
    await coordinator.applyDocument({ ...coordinator.document, title: 'Later B' })
    await committed.promise
    assert.equal((await readIgsPackage(projectPath)).project.title, 'Save A')
    assert.equal(coordinator.document.title, 'Later B')
    gate.release()
    const outcome = await saving
    assert.equal(coordinator.canUndo, true)
    assert.equal(outcome.recovery.status, 'dirty')
    assert.equal(coordinator.dirty, true)
    const inspection = await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)
    assert.equal(inspection.status, 'recoverable')
    if (inspection.status === 'recoverable') {
      assert.equal(inspection.document.title, 'Later B')
    }
    const restarted = await ProjectAutosaveCoordinator.recover(projectPath, roots, shadow, {
      leaseRegistry: new ProjectAutosaveLeaseRegistry(),
    })
    assert.equal(restarted.document.title, 'Later B')
    assert.equal((await readIgsPackage(projectPath)).project.title, 'Save A')
  })
})

test('a crash after Save A commit still recovers B through its exact committing base', async () => {
  await withProject(async ({ projectPath, roots, shadow }) => {
    const gate = deferred()
    const committed = deferred()
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
      afterSaveCommit: async () => {
        committed.release()
        await gate.promise
      },
    })
    await coordinator.applyDocument({ ...coordinator.document, title: 'Save A' })
    const saving = coordinator.save({ lastActualSeedSnapshot: 901 })
    await coordinator.applyDocument({ ...coordinator.document, title: 'Later B' })
    await coordinator.flush()
    await committed.promise
    assert.equal((await readIgsPackage(projectPath)).project.title, 'Save A')
    assert.equal((await readIgsPackage(projectPath)).project.lastActualSeedSnapshot, 901)
    const atCrash = await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)
    assert.equal(atCrash.status, 'recoverable')
    if (atCrash.status === 'recoverable') {
      assert.equal(atCrash.document.title, 'Later B')
    }
    gate.release()
    assert.equal((await saving).recovery.status, 'dirty')
    assert.equal(
      (await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)).status,
      'recoverable',
    )
    assert.equal(coordinator.document.lastActualSeedSnapshot, 901)
    const restarted = await ProjectAutosaveCoordinator.recover(projectPath, roots, shadow, {
      leaseRegistry: new ProjectAutosaveLeaseRegistry(),
    })
    assert.equal(restarted.document.title, 'Later B')
    assert.equal(restarted.document.lastActualSeedSnapshot, 901)
  })
})

test('undo to old saved S during Save A is recoverable after A commits', async () => {
  await withProject(async ({ projectPath, roots, shadow }) => {
    const gate = deferred()
    const committed = deferred()
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
      afterSaveCommit: async () => {
        committed.release()
        await gate.promise
      },
    })
    const oldSaved = coordinator.document
    await coordinator.applyDocument({ ...oldSaved, title: 'Save A' })
    const saving = coordinator.save({ lastActualSeedSnapshot: 902 })
    await coordinator.applyDocument(oldSaved)
    assert.equal(coordinator.dirty, false)
    await coordinator.flush()
    await committed.promise
    assert.equal((await readIgsPackage(projectPath)).project.title, 'Save A')
    assert.equal((await readIgsPackage(projectPath)).project.lastActualSeedSnapshot, 902)
    const atCrash = await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)
    assert.equal(atCrash.status, 'recoverable')
    if (atCrash.status === 'recoverable') {
      assert.equal(atCrash.document.title, 'Saved')
    }
    gate.release()
    assert.equal((await saving).recovery.status, 'dirty')
    assert.equal(coordinator.document.title, 'Saved')
    assert.equal(coordinator.document.lastActualSeedSnapshot, 902)
    assert.equal(coordinator.dirty, true)
    const recovered = await ProjectAutosaveCoordinator.recover(projectPath, roots, shadow, {
      leaseRegistry: new ProjectAutosaveLeaseRegistry(),
    })
    assert.equal(recovered.document.title, 'Saved')
    assert.equal(recovered.document.lastActualSeedSnapshot, 902)
    assert.equal((await readIgsPackage(projectPath)).project.title, 'Save A')
  })
})

test('Save A preserves an old raster needed by an in-flight B restoration', async () => {
  await withProject(async ({ directory, projectPath, roots, shadow }) => {
    let gateEnabled = false
    const gate = deferred()
    const committed = deferred()
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
      afterSaveCommit: async () => {
        if (gateEnabled) {
          committed.release()
          await gate.promise
        }
      },
    })
    const sourcePath = path.join(directory, 'original.png')
    await writeFile(sourcePath, raster)
    const imported = withRaster(coordinator.document)
    await coordinator.applyDocument(imported.document, {
      [imported.assetPath]: { sourcePath },
    })
    await rm(sourcePath)
    assert.equal((await coordinator.save()).recovery.status, 'clean')
    const savedWithRaster = coordinator.document

    gateEnabled = true
    await coordinator.applyDocument({ ...savedWithRaster, layers: [], title: 'Remove raster A' })
    const saving = coordinator.save()
    await coordinator.applyDocument({ ...savedWithRaster, title: 'Restore raster B' })
    await coordinator.flush()
    await committed.promise
    const packageAtCrash = await readIgsPackage(projectPath)
    assert.equal(packageAtCrash.project.layers.length, 0)
    const recoveredAtCrash = await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)
    assert.equal(recoveredAtCrash.status, 'recoverable')
    if (recoveredAtCrash.status === 'recoverable') {
      const source = recoveredAtCrash.dirtyAssets[imported.assetPath]
      assert.ok(source && 'sourcePath' in source)
      assert.deepEqual(await readFile(source.sourcePath), raster)
    }
    gate.release()
    assert.equal((await saving).recovery.status, 'dirty')
    const restarted = await ProjectAutosaveCoordinator.recover(projectPath, roots, shadow, {
      leaseRegistry: new ProjectAutosaveLeaseRegistry(),
    })
    assert.equal(restarted.document.layers.length, 1)
    assert.equal((await restarted.save()).recovery.status, 'clean')
    const finalPackage = await readIgsPackage(projectPath)
    assert.deepEqual(await finalPackage.readMember(imported.assetPath), raster)
  })
})

test('undo after a completed Save can restore an asset removed from the package', async () => {
  await withProject(async ({ directory, projectPath, roots, shadow }) => {
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow)
    const sourcePath = path.join(directory, 'original.png')
    await writeFile(sourcePath, raster)
    const imported = withRaster(coordinator.document)
    await coordinator.applyDocument(imported.document, {
      [imported.assetPath]: { sourcePath },
    })
    await rm(sourcePath)
    await coordinator.save()
    const savedWithRaster = coordinator.document
    const importedRef = requireRasterLayer(savedWithRaster.layers[0])?.asset
    assert.ok(importedRef)
    assert.equal(coordinator.getCurrentAssetSource(importedRef), null)
    await coordinator.applyDocument({ ...savedWithRaster, layers: [], title: 'Removed' })
    await coordinator.save()
    assert.equal((await readIgsPackage(projectPath)).project.layers.length, 0)
    await coordinator.applyDocument({ ...savedWithRaster, title: 'Restored by undo' })
    const restoredSource = coordinator.getCurrentAssetSource(importedRef)
    assert.ok(restoredSource && 'sourcePath' in restoredSource)
    assert.deepEqual(await readFile(restoredSource.sourcePath), raster)
    await coordinator.flush()
    assert.equal(
      (await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)).status,
      'recoverable',
    )
    assert.equal((await coordinator.save()).recovery.status, 'clean')
    assert.deepEqual(
      requireRasterLayer((await readIgsPackage(projectPath)).project.layers[0])?.asset.path,
      imported.assetPath,
    )
    assert.equal(coordinator.getCurrentAssetSource(importedRef), null)
  })
})

test('a failed Save leaves its preflight shadow recoverable and the saved package unchanged', async () => {
  await withProject(async ({ projectPath, roots, shadow }) => {
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow)
    await coordinator.applyDocument({ ...coordinator.document, title: 'Unsaved A' })
    await assert.rejects(
      coordinator.save({
        lastActualSeedSnapshot: 71,
        renderedPreview: {
          documentRevision: coordinator.document.documentRevision,
          merged: raster,
          rect: { height: 2, width: 2, x: 0, y: 0 },
          thumbnail: raster,
        },
      }),
      { code: 'PROJECT_INVALID_PREVIEW' },
    )
    assert.equal((await readIgsPackage(projectPath)).project.title, 'Saved')
    assert.equal((await readIgsPackage(projectPath)).project.lastActualSeedSnapshot, null)
    assert.equal(coordinator.dirty, true)
    assert.equal(coordinator.document.lastActualSeedSnapshot, null)
    const inspection = await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)
    assert.equal(inspection.status, 'recoverable')
    if (inspection.status === 'recoverable') {
      assert.equal(inspection.document.title, 'Unsaved A')
    }
  })
})

test('coordinated Save drops stale worker previews but accepts a current empty result', async () => {
  await withProject(async ({ projectPath, roots, shadow }) => {
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow)
    const imported = withRaster(coordinator.document, transparentRaster)
    await coordinator.applyDocument(imported.document, {
      [imported.assetPath]: { bytes: transparentRaster },
    })
    const oldRevision = coordinator.document.documentRevision
    await coordinator.applyDocument({ ...coordinator.document, title: 'After empty result' })
    assert.equal(
      (await coordinator.save({ emptyPreviewRevision: oldRevision })).recovery.status,
      'clean',
    )
    const first = await readIgsPackage(projectPath)
    assert.equal(first.project.title, 'After empty result')
    assert.equal(first.manifest.preview.status, 'unavailable')
    assert.deepEqual(await first.readMember(imported.assetPath), transparentRaster)

    await coordinator.applyDocument({ ...coordinator.document, title: 'After rendered result' })
    const thumbnail = (await readProjectPlaceholders(roots.placeholdersDir, 'unavailable'))
      .thumbnail
    assert.equal(
      (
        await coordinator.save({
          renderedPreview: {
            documentRevision: oldRevision,
            merged: raster,
            rect: { height: 2, width: 2, x: 0, y: 0 },
            thumbnail,
          },
        })
      ).recovery.status,
      'clean',
    )
    const second = await readIgsPackage(projectPath)
    assert.equal(second.project.title, 'After rendered result')
    assert.equal(second.manifest.preview.status, 'unavailable')
    assert.deepEqual(await second.readMember(imported.assetPath), transparentRaster)

    assert.equal(
      (await coordinator.save({ emptyPreviewRevision: coordinator.document.documentRevision }))
        .recovery.status,
      'clean',
    )
    const final = await readIgsPackage(projectPath)
    assert.equal(final.manifest.preview.status, 'empty')
    assert.equal(final.manifest.preview.rect, null)
    assert.deepEqual(await final.readMember(imported.assetPath), transparentRaster)
  })
})

test('explicit Discard Recovery removes only the local shadow and opens the saved package', async () => {
  await withProject(async ({ projectPath, roots, shadow }) => {
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow)
    await coordinator.applyDocument({ ...coordinator.document, title: 'Discard me' })
    await coordinator.flush()
    const reopened = await ProjectAutosaveCoordinator.discardRecovery(projectPath, roots, shadow, {
      leaseRegistry: new ProjectAutosaveLeaseRegistry(),
    })
    assert.equal(reopened.document.title, 'Saved')
    assert.equal(reopened.dirty, false)
    assert.equal(
      (await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)).status,
      'absent',
    )
    assert.equal((await readIgsPackage(projectPath)).project.title, 'Saved')
  })
})

test('one grouped Raster edit undoes and redoes both layers and their provenance across Save', async () => {
  await withProject(async ({ projectPath, roots, shadow }) => {
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow)
    const originalPackage = await readFile(projectPath)
    const before = coordinator.document
    const output = await acceptedOutputPngFixture()
    const first = withRaster(before, output, { height: 8, width: 8 })
    const second = withRaster(before, output, { height: 8, width: 8 })
    requireRasterLayer(first.document.layers[0]).generationProvenance =
      acceptedRasterProvenanceFixture(before, output, { height: 8, width: 8, x: 0, y: 0 })
    requireRasterLayer(second.document.layers[0]).generationProvenance =
      acceptedRasterProvenanceFixture(before, output, { height: 8, width: 8, x: 0, y: 0 })
    await coordinator.applyDocument(
      { ...before, layers: [first.document.layers[0], second.document.layers[0]] },
      { [first.assetPath]: { bytes: output }, [second.assetPath]: { bytes: output } },
    )
    assert.equal(coordinator.document.layers.length, 2)
    assert.equal(coordinator.canUndo, true)
    assert.equal(coordinator.canRedo, false)
    await coordinator.flush()
    assert.deepEqual(await readFile(projectPath), originalPackage)

    await coordinator.undo()
    assert.equal(coordinator.document.layers.length, 0)
    assert.equal(coordinator.dirty, false)
    assert.equal(coordinator.canUndo, false)
    assert.equal(coordinator.canRedo, true)
    await coordinator.redo()
    assert.deepEqual(
      coordinator.document.layers.map((layer) => layer.id),
      [first.document.layers[0].id, second.document.layers[0].id],
    )
    assert.deepEqual(
      coordinator.document.layers.map((layer) => requireRasterLayer(layer).generationProvenance),
      [
        requireRasterLayer(first.document.layers[0]).generationProvenance,
        requireRasterLayer(second.document.layers[0]).generationProvenance,
      ],
    )
    assert.equal(coordinator.canUndo, true)
    assert.equal(coordinator.canRedo, false)

    assert.equal((await coordinator.save()).recovery.status, 'clean')
    await coordinator.undo()
    assert.equal(coordinator.document.layers.length, 0)
    assert.equal(coordinator.dirty, true)
    assert.equal((await coordinator.save()).recovery.status, 'clean')
    assert.equal((await readIgsPackage(projectPath)).project.layers.length, 0)
    await coordinator.redo()
    await coordinator.flush()
    const recovered = await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)
    assert.equal(recovered.status, 'recoverable')
    if (recovered.status === 'recoverable') {
      assert.equal(recovered.document.layers.length, 2)
      const firstSource = recovered.dirtyAssets[first.assetPath]
      const secondSource = recovered.dirtyAssets[second.assetPath]
      assert.ok(firstSource && 'sourcePath' in firstSource)
      assert.ok(secondSource && 'sourcePath' in secondSource)
      assert.deepEqual(await readFile(firstSource.sourcePath), output)
      assert.deepEqual(await readFile(secondSource.sourcePath), output)
    }
    assert.equal((await coordinator.save()).recovery.status, 'clean')
    const saved = await readIgsPackage(projectPath)
    assert.deepEqual(await saved.readMember(first.assetPath), output)
    assert.deepEqual(await saved.readMember(second.assetPath), output)
  })
})

test('no-op and rejected edits keep history, but a new edit after Undo clears Redo', async () => {
  await withProject(async ({ projectPath, roots, shadow }) => {
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow)
    const saved = coordinator.document
    await coordinator.applyDocument({ ...saved, title: 'First' })
    assert.equal(coordinator.canUndo, true)
    await coordinator.undo()
    assert.equal(coordinator.canRedo, true)
    await coordinator.applyDocument(coordinator.document)
    assert.equal(coordinator.canRedo, true)
    await assert.rejects(
      coordinator.applyDocument(
        { ...coordinator.document, title: 'Stale' },
        {},
        {
          expectedDocumentRevision: randomUUID(),
        },
      ),
      { code: 'EDIT_CONFLICT' },
    )
    assert.equal(coordinator.canRedo, true)
    await coordinator.applyDocument({ ...coordinator.document, title: 'Different' })
    assert.equal(coordinator.canRedo, false)
    await coordinator.undo()
    assert.equal(coordinator.document.title, 'Saved')
    assert.equal(coordinator.canUndo, false)
  })
})

test('prompt focus edits update the shadow per keystroke but seal as one Project Undo step', async () => {
  await withProject(async ({ projectPath, roots, shadow }) => {
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow)
    const groupId = randomUUID()
    for (const text of ['a', 'ab', 'abc']) {
      const document = coordinator.document
      await coordinator.applyDocument(
        {
          ...document,
          generationDraft: {
            ...document.generationDraft,
            positivePrompt: { ...document.generationDraft.positivePrompt, text },
          },
        },
        {},
        { historyGroupId: groupId },
      )
      await coordinator.flush()
      const inspection = await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)
      assert.equal(inspection.status, 'recoverable')
      if (inspection.status === 'recoverable') {
        assert.equal(inspection.document.generationDraft.positivePrompt.text, text)
      }
    }
    assert.equal(coordinator.canUndo, true)
    await coordinator.sealHistoryGroup(groupId)
    await coordinator.sealHistoryGroup(groupId)
    await coordinator.undo()
    assert.equal(coordinator.document.generationDraft.positivePrompt.text, '')
    assert.equal(coordinator.canUndo, false)
    assert.equal(coordinator.canRedo, true)
    await coordinator.redo()
    assert.equal(coordinator.document.generationDraft.positivePrompt.text, 'abc')
    assert.equal(coordinator.canRedo, false)
  })
})

test('net-zero prompt focus preserves an older Redo, while ordinary edits and Save seal the focus', async () => {
  await withProject(async ({ projectPath, roots, shadow }) => {
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow)
    await coordinator.applyDocument({ ...coordinator.document, title: 'First' })
    await coordinator.undo()
    assert.equal(coordinator.canRedo, true)
    const revertedGroup = randomUUID()
    for (const text of ['temporary', '']) {
      const document = coordinator.document
      await coordinator.applyDocument(
        {
          ...document,
          generationDraft: {
            ...document.generationDraft,
            positivePrompt: { ...document.generationDraft.positivePrompt, text },
          },
        },
        {},
        { historyGroupId: revertedGroup },
      )
    }
    await coordinator.sealHistoryGroup(revertedGroup)
    assert.equal(coordinator.canUndo, false)
    assert.equal(coordinator.canRedo, true)
    await coordinator.redo()
    assert.equal(coordinator.document.title, 'First')

    const groupId = randomUUID()
    const document = coordinator.document
    await coordinator.applyDocument(
      {
        ...document,
        generationDraft: {
          ...document.generationDraft,
          positivePrompt: { ...document.generationDraft.positivePrompt, text: 'one focus' },
        },
      },
      {},
      { historyGroupId: groupId },
    )
    await coordinator.applyDocument({ ...coordinator.document, title: 'After prompt' })
    await coordinator.undo()
    assert.equal(coordinator.document.title, 'First')
    assert.equal(coordinator.document.generationDraft.positivePrompt.text, 'one focus')
    await coordinator.undo()
    assert.equal(coordinator.document.generationDraft.positivePrompt.text, '')
    await coordinator.redo()
    assert.equal(coordinator.document.generationDraft.positivePrompt.text, 'one focus')

    const next = coordinator.document
    await coordinator.applyDocument(
      {
        ...next,
        generationDraft: {
          ...next.generationDraft,
          positivePrompt: { ...next.generationDraft.positivePrompt, text: 'saved focus' },
        },
      },
      {},
      { historyGroupId: randomUUID() },
    )
    assert.equal((await coordinator.save()).recovery.status, 'clean')
    await coordinator.undo()
    assert.equal(coordinator.document.generationDraft.positivePrompt.text, 'one focus')
    assert.equal(
      (await readIgsPackage(projectPath)).project.generationDraft.positivePrompt.text,
      'saved focus',
    )
  })
})

test('a rejected delayed prompt edit cannot add a phantom group or undo a later Project edit', async () => {
  await withProject(async ({ projectPath, roots, shadow }) => {
    const entered = deferred()
    const release = deferred()
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
      beforeEditCommit: async (document) => {
        if (document.generationDraft.positivePrompt.text === 'late') {
          entered.release()
          await release.promise
        }
      },
    })
    const document = coordinator.document
    const late = coordinator.applyDocument(
      {
        ...document,
        generationDraft: {
          ...document.generationDraft,
          positivePrompt: { ...document.generationDraft.positivePrompt, text: 'late' },
        },
      },
      {},
      { historyGroupId: randomUUID() },
    )
    await entered.promise
    await coordinator.applyDocument({ ...coordinator.document, title: 'Later' })
    release.release()
    await assert.rejects(late, { code: 'EDIT_CONFLICT' })
    await coordinator.undo()
    assert.equal(coordinator.document.title, 'Saved')
    assert.equal(coordinator.document.generationDraft.positivePrompt.text, '')
    assert.equal(coordinator.canUndo, false)
  })
})

test('blur waits for the final in-flight prompt edit before sealing its focus history', async () => {
  await withProject(async ({ projectPath, roots, shadow }) => {
    const entered = deferred()
    const release = deferred()
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
      beforeEditCommit: async (document) => {
        if (document.generationDraft.positivePrompt.text === 'last character') {
          entered.release()
          await release.promise
        }
      },
    })
    const groupId = randomUUID()
    const document = coordinator.document
    const editing = coordinator.applyDocument(
      {
        ...document,
        generationDraft: {
          ...document.generationDraft,
          positivePrompt: { ...document.generationDraft.positivePrompt, text: 'last character' },
        },
      },
      {},
      { historyGroupId: groupId },
    )
    await entered.promise
    const sealing = coordinator.sealHistoryGroup(groupId)
    release.release()
    await Promise.all([editing, sealing])
    await coordinator.undo()
    assert.equal(coordinator.document.generationDraft.positivePrompt.text, '')
    assert.equal(coordinator.canUndo, false)
  })
})

test('Clear History conflicts an older in-flight edit even if its document revision is unchanged', async () => {
  await withProject(async ({ projectPath, roots, shadow }) => {
    const entered = deferred()
    const release = deferred()
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
      beforeEditCommit: async (document) => {
        if (document.title === 'Older edit') {
          entered.release()
          await release.promise
        }
      },
    })
    const editing = coordinator.applyDocument({ ...coordinator.document, title: 'Older edit' })
    await entered.promise
    await coordinator.clearHistory()
    release.release()
    await assert.rejects(editing, { code: 'EDIT_CONFLICT' })
    assert.equal(coordinator.document.title, 'Saved')
    assert.equal(coordinator.canUndo, false)
  })
})

test('Clear History keeps the current document but frees unneeded staged raster copies', async () => {
  await withProject(async ({ directory, projectPath, roots, shadow }) => {
    const sourcePath = path.join(directory, 'raster.png')
    await writeFile(sourcePath, raster)
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow)
    const first = withRaster(coordinator.document)
    await coordinator.applyDocument(first.document, { [first.assetPath]: { sourcePath } })
    const firstSource = coordinator.getCurrentAssetSource(
      requireRasterLayer(first.document.layers[0]).asset,
    )
    assert.ok(firstSource && 'sourcePath' in firstSource)
    const firstStagedPath = firstSource.sourcePath
    const second = withRaster(coordinator.document)
    await coordinator.applyDocument(second.document, { [second.assetPath]: { sourcePath } })
    assert.equal(coordinator.canUndo, true)
    await coordinator.clearHistory()
    assert.equal(coordinator.canUndo, false)
    assert.equal(coordinator.canRedo, false)
    assert.equal(coordinator.document.layers[0].id, second.document.layers[0].id)
    await assert.rejects(readFile(firstStagedPath), { code: 'ENOENT' })
    const currentSource = coordinator.getCurrentAssetSource(
      requireRasterLayer(second.document.layers[0]).asset,
    )
    assert.ok(currentSource && 'sourcePath' in currentSource)
    assert.deepEqual(await readFile(currentSource.sourcePath), raster)
    await coordinator.flush()
    assert.equal(
      (await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)).status,
      'recoverable',
    )
  })
})

test('oldest of 64 retained raster snapshots releases its staged source on overflow', async () => {
  await withProject(async ({ directory, projectPath, roots, shadow }) => {
    const sourcePath = path.join(directory, 'raster.png')
    await writeFile(sourcePath, raster)
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow)
    let firstStagedPath = ''
    for (let index = 0; index < 66; index += 1) {
      const next = withRaster(coordinator.document)
      await coordinator.applyDocument(next.document, { [next.assetPath]: { sourcePath } })
      if (index === 0) {
        const source = coordinator.getCurrentAssetSource(
          requireRasterLayer(next.document.layers[0]).asset,
        )
        assert.ok(source && 'sourcePath' in source)
        firstStagedPath = source.sourcePath
      }
    }
    await assert.rejects(readFile(firstStagedPath), { code: 'ENOENT' })
    const currentLayer = coordinator.document.layers[0]
    const currentSource = coordinator.getCurrentAssetSource(requireRasterLayer(currentLayer).asset)
    assert.ok(currentSource && 'sourcePath' in currentSource)
    assert.deepEqual(await readFile(currentSource.sourcePath), raster)
    for (let index = 0; index < 64; index += 1) {
      await coordinator.undo()
    }
    assert.equal(coordinator.canUndo, false)
    assert.equal(coordinator.document.layers[0].id !== currentLayer.id, true)
  })
})

test('Redo rejects a corrupted retained asset without consuming history or exposing a broken layer', async () => {
  await withProject(async ({ projectPath, roots, shadow }) => {
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow)
    const imported = withRaster(coordinator.document)
    await coordinator.applyDocument(imported.document, {
      [imported.assetPath]: { bytes: raster },
    })
    assert.equal((await coordinator.save()).recovery.status, 'clean')
    await coordinator.undo()
    assert.equal((await coordinator.save()).recovery.status, 'clean')
    const retainedDirectory = (await readdir(roots.scratchDir)).find((entry) =>
      entry.startsWith('igs-save-base-'),
    )
    assert.ok(retainedDirectory)
    const retainedAsset = path.join(roots.scratchDir, retainedDirectory, '0.asset')
    await writeFile(retainedAsset, Buffer.alloc(raster.length))

    await assert.rejects(coordinator.redo(), { code: 'ASSET_SOURCE_MISSING' })
    assert.equal(coordinator.document.layers.length, 0)
    assert.equal(coordinator.canUndo, false)
    assert.equal(coordinator.canRedo, true)
    await writeFile(retainedAsset, raster)
    await coordinator.redo()
    assert.equal(coordinator.document.layers.length, 1)
    assert.equal(coordinator.canRedo, false)
  })
})

test('a concurrent edit cannot consume an outdated Undo snapshot', async () => {
  await withProject(async ({ projectPath, roots, shadow }) => {
    const entered = deferred()
    const release = deferred()
    let pauseUndo = true
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
      beforeEditCommit: async (document) => {
        if (pauseUndo && document.title === 'Saved') {
          entered.release()
          await release.promise
        }
      },
    })
    await coordinator.applyDocument({ ...coordinator.document, title: 'First' })
    const undoing = coordinator.undo()
    await entered.promise
    await coordinator.applyDocument({ ...coordinator.document, title: 'Later' })
    pauseUndo = false
    release.release()
    await assert.rejects(undoing, { code: 'EDIT_CONFLICT' })
    assert.equal(coordinator.document.title, 'Later')
    await coordinator.undo()
    assert.equal(coordinator.document.title, 'First')
    await coordinator.undo()
    assert.equal(coordinator.document.title, 'Saved')
  })
})

test('two open Project coordinators keep independent histories', async () => {
  await withProject(async ({ directory, projectPath, roots, shadow }) => {
    const leases = new ProjectAutosaveLeaseRegistry()
    const secondSession = await ProjectSession.create(
      path.join(directory, 'second.igs'),
      'Second',
      roots,
    )
    const first = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
      leaseRegistry: leases,
    })
    const second = await ProjectAutosaveCoordinator.attach(secondSession, roots, shadow, {
      leaseRegistry: leases,
    })
    await first.applyDocument({ ...first.document, title: 'First edited' })
    await second.applyDocument({ ...second.document, title: 'Second edited' })
    await first.undo()
    assert.equal(first.document.title, 'Saved')
    assert.equal(first.canRedo, true)
    assert.equal(second.document.title, 'Second edited')
    assert.equal(second.canUndo, true)
    assert.equal(second.canRedo, false)
    await second.undo()
    assert.equal(second.document.title, 'Second')
    await first.redo()
    assert.equal(first.document.title, 'First edited')
    assert.equal(second.document.title, 'Second')
  })
})

test('history is limited to 64 steps and belongs only to the open coordinator lifetime', async () => {
  await withProject(async ({ projectPath, roots, shadow }) => {
    const leases = new ProjectAutosaveLeaseRegistry()
    const coordinator = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
      leaseRegistry: leases,
    })
    for (let index = 1; index <= 65; index += 1) {
      await coordinator.applyDocument({ ...coordinator.document, title: `Edit ${index}` })
    }
    for (let index = 0; index < 64; index += 1) {
      assert.equal(coordinator.canUndo, true)
      await coordinator.undo()
    }
    assert.equal(coordinator.document.title, 'Edit 1')
    assert.equal(coordinator.canUndo, false)
    assert.equal(coordinator.canRedo, true)
    for (let index = 0; index < 64; index += 1) {
      await coordinator.redo()
    }
    assert.equal(coordinator.document.title, 'Edit 65')
    assert.equal(coordinator.canRedo, false)
    assert.equal((await coordinator.save()).recovery.status, 'clean')
    await coordinator.close()
    assert.equal(coordinator.canUndo, false)
    const reopened = await ProjectAutosaveCoordinator.open(projectPath, roots, shadow, {
      leaseRegistry: leases,
    })
    assert.equal(reopened.canUndo, false)
    assert.equal(reopened.canRedo, false)
    await reopened.close()
  })
})
