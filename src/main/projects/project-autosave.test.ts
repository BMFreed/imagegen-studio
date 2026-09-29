import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { readIgsPackage } from './igs-package.js'
import { ProjectAutosaveCoordinator, ProjectAutosaveLeaseRegistry } from './project-autosave.js'
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
    const importedRef = coordinator.document.layers[0]?.asset
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
    accepted.document.layers[0].generationProvenance = provenance
    accepted.document.layers[0].transform.x = provenance.layerSourceContext.bbox.x
    accepted.document.layers[0].transform.y = provenance.layerSourceContext.bbox.y
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
    assert.deepEqual(inspection.document.layers[0].generationProvenance, provenance)
    const shadowAsset = inspection.dirtyAssets[accepted.assetPath]
    assert.ok(shadowAsset && 'sourcePath' in shadowAsset)
    assert.deepEqual(await readFile(shadowAsset.sourcePath), output)

    const recovered = await ProjectAutosaveCoordinator.recover(projectPath, roots, shadow, {
      leaseRegistry: new ProjectAutosaveLeaseRegistry(),
    })
    assert.deepEqual(recovered.document.layers[0].generationProvenance, provenance)
    assert.equal(recovered.dirty, true)
    assert.deepEqual(await readFile(projectPath), oldBytes)

    const saved = await recovered.save()
    assert.equal(saved.committed, true)
    const persisted = await readIgsPackage(projectPath)
    assert.deepEqual(persisted.project.layers[0].generationProvenance, provenance)
    assert.deepEqual(await persisted.readMember(accepted.assetPath), output)

    const portablePath = path.join(directory, 'portable.igs')
    await copyFile(projectPath, portablePath)
    const portable = await ProjectSession.open(portablePath, roots)
    assert.deepEqual(portable.document.layers[0].generationProvenance, provenance)
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
      (await readIgsPackage(projectPath)).project.layers[0]?.asset.path,
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
    const saving = coordinator.save()
    await coordinator.applyDocument({ ...coordinator.document, title: 'Later B' })
    await coordinator.flush()
    await committed.promise
    assert.equal((await readIgsPackage(projectPath)).project.title, 'Save A')
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
    const saving = coordinator.save()
    await coordinator.applyDocument(oldSaved)
    assert.equal(coordinator.dirty, false)
    await coordinator.flush()
    await committed.promise
    assert.equal((await readIgsPackage(projectPath)).project.title, 'Save A')
    const atCrash = await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)
    assert.equal(atCrash.status, 'recoverable')
    if (atCrash.status === 'recoverable') {
      assert.equal(atCrash.document.title, 'Saved')
    }
    gate.release()
    assert.equal((await saving).recovery.status, 'dirty')
    assert.equal(coordinator.document.title, 'Saved')
    assert.equal(coordinator.dirty, true)
    const recovered = await ProjectAutosaveCoordinator.recover(projectPath, roots, shadow, {
      leaseRegistry: new ProjectAutosaveLeaseRegistry(),
    })
    assert.equal(recovered.document.title, 'Saved')
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
    const importedRef = savedWithRaster.layers[0]?.asset
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
      (await readIgsPackage(projectPath)).project.layers[0]?.asset.path,
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
    assert.equal(coordinator.dirty, true)
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
    first.document.layers[0].generationProvenance = acceptedRasterProvenanceFixture(
      before,
      output,
      { height: 8, width: 8, x: 0, y: 0 },
    )
    second.document.layers[0].generationProvenance = acceptedRasterProvenanceFixture(
      before,
      output,
      { height: 8, width: 8, x: 0, y: 0 },
    )
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
      coordinator.document.layers.map((layer) => layer.generationProvenance),
      [
        first.document.layers[0].generationProvenance,
        second.document.layers[0].generationProvenance,
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
    const firstSource = coordinator.getCurrentAssetSource(first.document.layers[0].asset)
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
    const currentSource = coordinator.getCurrentAssetSource(second.document.layers[0].asset)
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
        const source = coordinator.getCurrentAssetSource(next.document.layers[0].asset)
        assert.ok(source && 'sourcePath' in source)
        firstStagedPath = source.sourcePath
      }
    }
    await assert.rejects(readFile(firstStagedPath), { code: 'ENOENT' })
    const currentLayer = coordinator.document.layers[0]
    const currentSource = coordinator.getCurrentAssetSource(currentLayer.asset)
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
