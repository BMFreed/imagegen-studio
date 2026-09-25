import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { crc32, deflateSync } from 'node:zlib'

import { readIgsPackage } from './igs-package.js'
import { ProjectAutosaveCoordinator } from './project-autosave.js'
import { ProjectSession } from './project-session.js'
import { ProjectShadowStore } from './project-shadow.js'
import { importRasterLayer } from './raster-import.js'
import { ProjectWorkerClient } from './worker-client.js'

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../../..')
const DEV_PYTHON = path.join(REPOSITORY_ROOT, 'worker-python/.venv/bin/python')
const ADOBE_ICC = path.join(REPOSITORY_ROOT, 'worker-python/tests/fixtures/AdobeRGB1998.icc')
const SOURCE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGO06bnDwMDAxMDAwMDAAAATOgGonVuaBAAAAABJRU5ErkJggg==',
  'base64',
)
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

async function withProject(
  run: (context: {
    directory: string
    projectPath: string
    roots: { placeholdersDir: string; scratchDir: string }
    session: ProjectSession
    shadow: ProjectShadowStore
    stagingBasePath: string
  }) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-raster-import-'))
  try {
    const workspace = path.join(directory, 'workspace')
    const stagingBasePath = path.join(directory, 'staging')
    await mkdir(workspace)
    await mkdir(stagingBasePath)
    const projectPath = path.join(workspace, 'project.igs')
    const roots = {
      placeholdersDir: path.join(REPOSITORY_ROOT, 'src/main/projects/placeholders'),
      scratchDir: path.join(directory, 'scratch'),
    }
    const session = await ProjectSession.create(projectPath, 'Before import', roots)
    const shadow = new ProjectShadowStore(path.join(directory, 'autosave'))
    await run({ directory, projectPath, roots, session, shadow, stagingBasePath })
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

function insertIcc(png: Buffer, profile: Buffer): Buffer {
  const type = Buffer.from('iCCP', 'ascii')
  const payload = Buffer.concat([Buffer.from('source\0\0', 'ascii'), deflateSync(profile)])
  const chunk = Buffer.alloc(12 + payload.length)
  chunk.writeUInt32BE(payload.length, 0)
  type.copy(chunk, 4)
  payload.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(Buffer.concat([type, payload])), 8 + payload.length)
  return Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)])
}

function devRuntimeRoot(): string | null {
  if (!existsSync(DEV_PYTHON)) {
    return null
  }
  const executable = realpathSync(DEV_PYTHON)
  const partsA = DEV_PYTHON.split(path.sep)
  const partsB = executable.split(path.sep)
  let shared = 0
  while (partsA[shared] === partsB[shared] && shared < partsA.length && shared < partsB.length) {
    shared++
  }
  const root = partsA.slice(0, shared).join(path.sep) || path.sep
  return root === path.sep ? null : root
}

function testImportWorker() {
  return {
    normalizeImport: async (input: { normalizedPngPath: string }) => {
      await writeFile(input.normalizedPngPath, SOURCE_PNG)
      return {
        normalized: {
          byteSize: SOURCE_PNG.length,
          colorSpace: 'srgb' as const,
          height: 2,
          iccSha256: sha256(SOURCE_PNG),
          path: input.normalizedPngPath,
          sha256: sha256(SOURCE_PNG),
          width: 2,
        },
        originalIcc: null,
        sourceFormat: 'PNG' as const,
      }
    },
  }
}

test(
  'authorized ICC raster becomes a dirty sRGB layer, then explicit Save preserves original ICC',
  { skip: !devRuntimeRoot() || !existsSync(ADOBE_ICC) },
  async () => {
    await withProject(
      async ({ directory, projectPath, roots, session, shadow, stagingBasePath }) => {
        const adobeProfile = await readFile(ADOBE_ICC)
        const taggedSource = insertIcc(SOURCE_PNG, adobeProfile)
        const selectedFile = path.join(directory, 'selected.png')
        await writeFile(selectedFile, taggedSource)
        const savedPackageBytes = await readFile(projectPath)
        const originalBbox = session.document.primaryBbox
        const coordinator = await ProjectAutosaveCoordinator.attach(session, roots, shadow)
        const worker = await ProjectWorkerClient.start(
          {
            pythonExecutable: DEV_PYTHON,
            runtimeRoot: devRuntimeRoot()!,
            stagingBasePath,
          },
          { requestTimeoutMs: 15_000 },
        )
        try {
          const imported = await importRasterLayer({
            authorizedSourcePath: selectedFile,
            getDocument: () => session.document,
            insertIndex: 0,
            name: 'Adobe RGB source',
            position: { x: -21, y: 42 },
            stagingBasePath,
            worker,
          })
          assert.equal(session.dirty, false)
          assert.equal(session.document.layers.length, 0)
          assert.deepEqual(session.document.primaryBbox, originalBbox)
          assert.deepEqual(await readFile(projectPath), savedPackageBytes)
          assert.equal(imported.layer.transform.x, -21)
          assert.equal(imported.layer.transform.y, 42)
          assert.equal(imported.layer.asset.width, 2)
          assert.equal(imported.layer.asset.height, 2)
          assert.notEqual(imported.layer.asset.sha256, sha256(taggedSource))
          assert.ok(imported.layer.sourceIccProfile)
          assert.equal(imported.layer.sourceIccProfile.sha256, sha256(adobeProfile))
          const originalProfileSource = imported.assetSources[imported.layer.sourceIccProfile.path]
          assert.ok(originalProfileSource && 'sourcePath' in originalProfileSource)
          assert.deepEqual(await readFile(originalProfileSource.sourcePath), adobeProfile)

          await coordinator.applyDocument(imported.document, imported.assetSources, {
            expectedDocumentRevision: imported.baseDocumentRevision,
          })
          await imported.dispose()
          assert.equal(coordinator.dirty, true)
          assert.equal(coordinator.document.layers.length, 1)
          await coordinator.flush()
          assert.equal(
            (await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)).status,
            'recoverable',
          )
          const saved = await coordinator.save()
          assert.equal(saved.committed, true)
          assert.equal(session.dirty, false)
          const reopened = await readIgsPackage(projectPath)
          assert.equal(reopened.project.colorSpace, 'srgb')
          assert.deepEqual(reopened.project.primaryBbox, originalBbox)
          assert.equal(reopened.project.layers.length, 1)
          assert.deepEqual(
            await reopened.readMember(imported.layer.sourceIccProfile.path),
            adobeProfile,
          )
          assert.equal(
            sha256(await reopened.readMember(imported.layer.asset.path)),
            imported.layer.asset.sha256,
          )
          assert.equal(existsSync(imported.stagingRoot), false)
          assert.equal((await readIgsPackage(projectPath)).project.layers.length, 1)
          await coordinator.close()
        } finally {
          await worker.close()
        }
      },
    )
  },
)

test(
  'invalid embedded ICC leaves Project and saved package untouched and cleans import staging',
  { skip: !devRuntimeRoot() },
  async () => {
    await withProject(async ({ directory, projectPath, session, stagingBasePath }) => {
      const invalidSource = path.join(directory, 'bad-icc.png')
      await writeFile(invalidSource, insertIcc(SOURCE_PNG, Buffer.from('bad ICC')))
      const original = session.document
      const packageBytes = await readFile(projectPath)
      const worker = await ProjectWorkerClient.start(
        {
          pythonExecutable: DEV_PYTHON,
          runtimeRoot: devRuntimeRoot()!,
          stagingBasePath,
        },
        { requestTimeoutMs: 15_000 },
      )
      try {
        await assert.rejects(
          importRasterLayer({
            authorizedSourcePath: invalidSource,
            getDocument: () => session.document,
            insertIndex: 0,
            name: 'Should not appear',
            position: { x: 0, y: 0 },
            stagingBasePath,
            worker,
          }),
          { code: 'WORKER_REQUEST_FAILED', workerCode: 'INVALID_COLOR_PROFILE' },
        )
        assert.deepEqual(session.document, original)
        assert.equal(session.dirty, false)
        assert.deepEqual(await readFile(projectPath), packageBytes)
        assert.deepEqual(await readdir(stagingBasePath), [])
      } finally {
        await worker.close()
      }
    })
  },
)

test('a concurrent Project edit rejects a late import instead of replacing that edit', async () => {
  await withProject(async ({ directory, projectPath, session, stagingBasePath }) => {
    const selectedFile = path.join(directory, 'selected.png')
    await writeFile(selectedFile, SOURCE_PNG)
    const originalPackage = await readFile(projectPath)
    await assert.rejects(
      importRasterLayer({
        authorizedSourcePath: selectedFile,
        getDocument: () => session.document,
        insertIndex: 0,
        name: 'Late image',
        position: { x: 0, y: 0 },
        stagingBasePath,
        worker: {
          normalizeImport: async () => {
            session.applyDocument({ ...session.document, title: 'Edited during import' })
            return {
              normalized: {
                byteSize: SOURCE_PNG.length,
                colorSpace: 'srgb',
                height: 2,
                iccSha256: sha256(SOURCE_PNG),
                path: '/unused',
                sha256: sha256(SOURCE_PNG),
                width: 2,
              },
              originalIcc: null,
              sourceFormat: 'PNG',
            }
          },
        },
      }),
      { code: 'IMPORT_PROJECT_CHANGED' },
    )
    assert.equal(session.document.title, 'Edited during import')
    assert.equal(session.document.layers.length, 0)
    assert.equal(session.dirty, true)
    assert.deepEqual(await readFile(projectPath), originalPackage)
    assert.deepEqual(await readdir(stagingBasePath), [])
  })
})

test('failed autosave adoption leaves prepared raster unpublished and discards its copied assets', async () => {
  await withProject(async ({ directory, projectPath, roots, session, shadow, stagingBasePath }) => {
    const selectedFile = path.join(directory, 'selected.png')
    await writeFile(selectedFile, SOURCE_PNG)
    const originalDocument = session.document
    const originalPackage = await readFile(projectPath)
    const coordinator = await ProjectAutosaveCoordinator.attach(session, roots, shadow, {
      beforeEditCommit: async () => {
        throw new Error('Injected adoption failure')
      },
    })
    const prepared = await importRasterLayer({
      authorizedSourcePath: selectedFile,
      getDocument: () => session.document,
      insertIndex: 0,
      name: 'Prepared only',
      position: { x: 10, y: -12 },
      stagingBasePath,
      worker: testImportWorker(),
    })
    assert.deepEqual(coordinator.document, originalDocument)
    await assert.rejects(
      coordinator.applyDocument(prepared.document, prepared.assetSources, {
        expectedDocumentRevision: prepared.baseDocumentRevision,
      }),
      /Injected adoption failure/,
    )
    assert.deepEqual(coordinator.document, originalDocument)
    assert.equal(coordinator.dirty, false)
    assert.deepEqual(await readFile(projectPath), originalPackage)
    assert.deepEqual(await readdir(roots.scratchDir), [])
    assert.equal(
      (await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)).status,
      'absent',
    )
    await prepared.dispose()
    assert.deepEqual(await readdir(stagingBasePath), [])
    await coordinator.close()
  })
})

test('a prepared raster cannot replace a newer edit before autosave adoption begins', async () => {
  await withProject(async ({ directory, projectPath, roots, session, shadow, stagingBasePath }) => {
    const selectedFile = path.join(directory, 'selected.png')
    await writeFile(selectedFile, SOURCE_PNG)
    const coordinator = await ProjectAutosaveCoordinator.attach(session, roots, shadow)
    const prepared = await importRasterLayer({
      authorizedSourcePath: selectedFile,
      getDocument: () => session.document,
      insertIndex: 0,
      name: 'Stale raster',
      position: { x: 0, y: 0 },
      stagingBasePath,
      worker: testImportWorker(),
    })
    await assert.rejects(
      coordinator.applyDocument(
        { ...prepared.document, documentRevision: randomUUID() },
        prepared.assetSources,
        { expectedDocumentRevision: prepared.baseDocumentRevision },
      ),
      { code: 'EDIT_CONFLICT' },
    )
    assert.deepEqual(coordinator.document.layers, [])
    await coordinator.applyDocument({ ...coordinator.document, title: 'Newer edit' })
    await assert.rejects(
      coordinator.applyDocument(prepared.document, prepared.assetSources, {
        expectedDocumentRevision: prepared.baseDocumentRevision,
      }),
      { code: 'EDIT_CONFLICT' },
    )
    assert.equal(coordinator.document.title, 'Newer edit')
    assert.deepEqual(coordinator.document.layers, [])
    await prepared.dispose()
    assert.deepEqual(await readdir(stagingBasePath), [])
    await coordinator.flush()
    const inspected = await ProjectAutosaveCoordinator.inspectRecovery(projectPath, shadow)
    assert.equal(inspected.status, 'recoverable')
    if (inspected.status === 'recoverable') {
      assert.equal(inspected.document.title, 'Newer edit')
      assert.deepEqual(inspected.document.layers, [])
    }
    await coordinator.save()
    assert.equal((await readIgsPackage(projectPath)).project.title, 'Newer edit')
    await coordinator.close()
  })
})

test('a symlinked selected source never reaches the worker or changes the Project', async () => {
  await withProject(async ({ directory, session, stagingBasePath }) => {
    const target = path.join(directory, 'source.png')
    const alias = path.join(directory, 'source-alias.png')
    await writeFile(target, SOURCE_PNG)
    await symlink(target, alias)
    let called = false
    await assert.rejects(
      importRasterLayer({
        authorizedSourcePath: alias,
        getDocument: () => session.document,
        insertIndex: 0,
        name: 'Symlink',
        position: { x: 0, y: 0 },
        stagingBasePath,
        worker: {
          normalizeImport: async () => {
            called = true
            throw new Error('must not run')
          },
        },
      }),
      { code: 'IMPORT_SOURCE_UNAVAILABLE' },
    )
    assert.equal(called, false)
    assert.equal(session.dirty, false)
    assert.deepEqual(await readdir(stagingBasePath), [])
  })
})
