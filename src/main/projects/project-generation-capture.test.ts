import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import {
  createEmptyProjectDocumentV1,
  type IgsProjectDocumentV1,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { FrozenGenerationTarget } from './project-generation-target.js'
import type { ComposeTargetInput, ProjectWorkerClient } from './worker-client.js'

import { openAppDatabase } from '../db/database.js'
import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { readProjectPlaceholders } from './project-placeholders.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
import { acceptedOutputPngFixture } from './test-fixtures/accepted-provenance.js'
import { requireRasterLayer } from './test-fixtures/require-raster-layer.js'

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../../..')

type Fixture = {
  database: ReturnType<typeof openAppDatabase>
  packagePath: string
  scratch: string
  service: ProjectService
  shadow: ProjectShadowStore
  sourceBytes: Buffer[]
  tabId: string
}

async function withProject(run: (fixture: Fixture) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-generation-capture-'))
  const database = openAppDatabase(root, path.join(REPOSITORY_ROOT, 'src/main/db/migrations'))
  const repository = new ProjectIndexRepository(database.db)
  const shadow = new ProjectShadowStore(path.join(root, 'autosave'))
  const scratch = path.join(root, 'scratch')
  const placeholdersDir = path.join(REPOSITORY_ROOT, 'src/main/projects/placeholders')
  const service = new ProjectService({
    autosaveOptions: { debounceMs: 0, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    dataRoot: root,
    repository,
    roots: { placeholdersDir, scratchDir: scratch },
    shadow,
  })
  try {
    const document = createEmptyProjectDocumentV1({ title: 'Capture boundary' })
    const sourceBytes = await Promise.all([
      acceptedOutputPngFixture(2, 2),
      acceptedOutputPngFixture(3, 2),
    ])
    document.primaryBbox = { height: 2, width: 2, x: -7, y: 11 }
    document.generationDraft.positivePrompt.text = 'frozen lantern'
    document.generationDraft.negativePrompt.text = 'frozen blur'
    document.generationDraft.seed = { policy: 'fixed', value: 0 }
    document.layers = sourceBytes.map((bytes, index) => {
      const id = randomUUID()
      return {
        asset: {
          bytes: bytes.length,
          height: 2,
          path: `assets/layers/${id}.png`,
          sha256: sha256(bytes),
          width: index + 2,
        },
        blendMode: 'normal',
        id,
        kind: 'raster',
        locked: false,
        name: `Raster ${index + 1}`,
        opacity: 1,
        transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: index === 0 ? -7 : 100, y: 11 },
        visible: true,
      }
    })
    const externalPath = path.join(root, 'source.igs')
    await saveIgsPackage(externalPath, {
      assets: Object.fromEntries(
        document.layers.map((layer, index) => [
          requireRasterLayer(layer).asset.path,
          { bytes: sourceBytes[index] },
        ]),
      ),
      preview: {
        ...(await readProjectPlaceholders(placeholdersDir, 'unavailable')),
        rect: document.primaryBbox,
        status: 'unavailable',
      },
      project: document,
    })
    const selected = await service.selectImport(externalPath)
    if (selected.kind !== 'transfer-required') {
      assert.fail('Expected a real Project import')
    }
    const imported = await service.finishImport(selected.importId, 'copy')
    if (imported.result.kind !== 'opened') {
      assert.fail('Expected imported Project to open')
    }
    const packagePath = (await repository.listProjects())[0].canonicalPath
    await run({
      database,
      packagePath,
      scratch,
      service,
      shadow,
      sourceBytes,
      tabId: imported.result.tab.id,
    })
  } finally {
    for (const tab of service.getOpenTabs()) {
      await service.discardAndClose(tab.id)
    }
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

/**
 * Controlled compositor only; frozen source ownership and actual target PNG/hash/ICC checks are
 * real.
 */
function controlledWorker(
  bytes: Buffer,
  inspect: (input: ComposeTargetInput) => Promise<void>,
): Pick<ProjectWorkerClient, 'composeTarget'> {
  return {
    composeTarget: async (input) => {
      await inspect(input)
      await writeFile(input.targetPngPath, bytes)
      return {
        composite: {
          byteSize: bytes.length,
          colorSpace: 'srgb',
          height: bytes.readUInt32BE(20),
          iccSha256: IGS_SRGB_ICC_SHA256,
          path: input.targetPngPath,
          sha256: sha256(bytes),
          width: bytes.readUInt32BE(16),
        },
        mode: 'img2img',
        rect: { ...input.bbox },
      }
    },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

async function captureFiles(
  scratch: string,
  existingDirectories: string[] = [],
): Promise<{ files: string[]; stagingRoot: string }> {
  const directories = (await readdir(scratch)).filter((name) => !existingDirectories.includes(name))
  assert.equal(directories.length, 1, 'Exactly one main-owned capture lease must exist')
  const stagingRoot = path.join(scratch, directories[0])
  const files = (await readdir(stagingRoot)).map((name) => path.join(stagingRoot, name))
  return { files, stagingRoot }
}

async function assertFrozenBytes(files: string[], expected: Buffer[]): Promise<void> {
  assert.equal(files.length, expected.length)
  const actual = await Promise.all(files.map((file) => readFile(file)))
  assert.deepEqual(actual.map(sha256).sort(), expected.map(sha256).sort())
}

test('captured Project input reaches actual target verification without document or queue publication', async () => {
  await withProject(async (fixture) => {
    const { database, packagePath, scratch, service, shadow, sourceBytes, tabId } = fixture
    const before = structuredClone(service.getOpenDocumentForAcceptance(tabId)!.document)
    const beforeTab = service.getOpenTabs()[0]
    const beforeBytes = await readFile(packagePath)
    const beforeShadow = await shadow.inspect({
      projectPath: packagePath,
      savedPackage: await readIgsPackage(packagePath),
    })
    let stagingRoot = ''
    const target = await service.withCapturedNormalGenerationInput(tabId, async (capture) => {
      assert.deepEqual(capture.document, before)
      return await capture.composeTarget(
        controlledWorker(sourceBytes[0], async (input) => {
          stagingRoot = input.stagingRoot
          assert.deepEqual(input.bbox, before.primaryBbox)
          assert.deepEqual(
            input.layers.map((layer) => layer.sha256),
            before.layers.map((layer) => requireRasterLayer(layer).asset.sha256),
          )
          for (const [index, layer] of input.layers.entries()) {
            assert.deepEqual(await readFile(layer.path), sourceBytes[index])
          }
        }),
      )
    })
    assert.deepEqual(target.bbox, before.primaryBbox)
    assert.deepEqual(target.generationDraft, before.generationDraft)
    assert.deepEqual(target.composite.bytes, sourceBytes[0])
    assert.equal(target.composite.sha256, sha256(sourceBytes[0]))
    assert.equal(existsSync(stagingRoot), false)
    assert.deepEqual(await readdir(scratch), [])
    assert.deepEqual(service.getOpenDocumentForAcceptance(tabId)!.document, before)
    assert.deepEqual(service.getOpenTabs()[0], beforeTab)
    assert.deepEqual(await readFile(packagePath), beforeBytes)
    assert.deepEqual(
      await shadow.inspect({
        projectPath: packagePath,
        savedPackage: await readIgsPackage(packagePath),
      }),
      beforeShadow,
    )
    assert.deepEqual(
      await database.db.selectFrom('generation_queue_item').selectAll().execute(),
      [],
    )
  })
})

test('capture survives later bbox, draft and layer edits while files stay leased through admission', async () => {
  await withProject(async ({ database, packagePath, scratch, service, sourceBytes, tabId }) => {
    const before = structuredClone(service.getOpenDocumentForAcceptance(tabId)!.document)
    const beforeBytes = await readFile(packagePath)
    const entered = deferred<{
      document: IgsProjectDocumentV1
      files: string[]
      stagingRoot: string
    }>()
    const qualified = deferred<void>()
    const composed = deferred<{ stagingRoot: string; target: FrozenGenerationTarget }>()
    const admitted = deferred<void>()
    const pending = service.withCapturedNormalGenerationInput(tabId, async (capture) => {
      const frozen = await captureFiles(scratch)
      await assertFrozenBytes(frozen.files, sourceBytes)
      entered.resolve({ ...frozen, document: structuredClone(capture.document) })
      await qualified.promise
      const target = await capture.composeTarget(
        controlledWorker(sourceBytes[0], async (input) => {
          assert.deepEqual(input.bbox, before.primaryBbox)
          assert.deepEqual(
            input.layers.map((layer) => layer.sha256),
            before.layers.map((layer) => requireRasterLayer(layer).asset.sha256),
          )
          assert.deepEqual(
            input.layers.map((layer) => layer.opacity),
            [1, 1],
          )
          for (const [index, layer] of input.layers.entries()) {
            assert.deepEqual(layer.transform, requireRasterLayer(before.layers[index]).transform)
            assert.deepEqual(await readFile(layer.path), sourceBytes[index])
          }
        }),
      )
      composed.resolve({ stagingRoot: frozen.stagingRoot, target })
      await admitted.promise
      return target
    })
    void pending.catch(() => undefined)
    try {
      // Begin real independent edits immediately after capture invocation, before its first I/O finishes.
      await service.setPrimaryBbox(tabId, { height: 2, width: 2, x: 70, y: 80 })
      await service.updateGenerationDraft(tabId, { kind: 'positive-prompt', text: 'later lantern' })
      await service.updateGenerationDraft(tabId, {
        kind: 'dynamic-prompt',
        value: { maxPrompts: 17, seedBehavior: 'per-prompt' },
      })
      await service.updateRasterLayer(tabId, before.layers[0].id, {
        kind: 'opacity',
        opacity: 0.25,
      })
      await service.updateRasterLayer(tabId, before.layers[1].id, {
        kind: 'visibility',
        visible: false,
      })
      await service.moveRasterLayer(tabId, before.layers[1].id, 0)
      const frozen = await Promise.race([
        entered.promise,
        pending.then(() => assert.fail('Capture settled before the qualification witness')),
      ])
      assert.deepEqual(frozen.document, before)
      await assertFrozenBytes(frozen.files, sourceBytes)
      qualified.resolve()
      const result = await Promise.race([
        composed.promise,
        pending.then(() => assert.fail('Capture settled before the admission witness')),
      ])
      assert.deepEqual(result.target.bbox, before.primaryBbox)
      assert.deepEqual(result.target.generationDraft, before.generationDraft)
      assert.equal(result.target.documentRevision, before.documentRevision)
      assert.deepEqual(result.target.composite.bytes, sourceBytes[0])
      assert.equal(existsSync(frozen.stagingRoot), true)
      await assertFrozenBytes(frozen.files, sourceBytes)
      assert.deepEqual(await readFile(path.join(frozen.stagingRoot, 'target.png')), sourceBytes[0])
      const afterEdits = structuredClone(service.getOpenDocumentForAcceptance(tabId)!.document)
      admitted.resolve()
      assert.equal(await pending, result.target)
      assert.equal(existsSync(result.stagingRoot), false)
      assert.deepEqual(await readdir(scratch), [])
      assert.deepEqual(service.getOpenDocumentForAcceptance(tabId)!.document, afterEdits)
      assert.notDeepEqual(afterEdits, before)
      assert.deepEqual(await readFile(packagePath), beforeBytes)
      assert.deepEqual((await readIgsPackage(packagePath)).project, before)
      assert.deepEqual(
        await database.db.selectFrom('generation_queue_item').selectAll().execute(),
        [],
      )
    } finally {
      qualified.resolve()
      admitted.resolve()
      await pending.catch(() => undefined)
    }
  })
})

test('callback-owned metadata cannot rewrite the private frozen composition snapshot', async () => {
  await withProject(async ({ scratch, service, sourceBytes, tabId }) => {
    const before = structuredClone(service.getOpenDocumentForAcceptance(tabId)!.document)
    const target = await service.withCapturedNormalGenerationInput(tabId, async (capture) => {
      capture.document.primaryBbox.x = 500
      capture.document.generationDraft.positivePrompt.text = 'caller-owned mutation'
      capture.document.layers[0].opacity = 0
      requireRasterLayer(capture.document.layers[0]).transform.x = 900
      return await capture.composeTarget(
        controlledWorker(sourceBytes[0], async (input) => {
          assert.deepEqual(input.bbox, before.primaryBbox)
          assert.equal(input.layers[0].opacity, 1)
          assert.deepEqual(
            input.layers[0].transform,
            requireRasterLayer(before.layers[0]).transform,
          )
        }),
      )
    })
    assert.deepEqual(target.generationDraft, before.generationDraft)
    assert.deepEqual(service.getOpenDocumentForAcceptance(tabId)!.document, before)
    assert.deepEqual(await readdir(scratch), [])
  })
})

test('callback and target-verification failures remove owned capture files without Project publication', async () => {
  for (const phase of ['runtime', 'verification', 'admission'] as const) {
    await withProject(async ({ database, packagePath, scratch, service, sourceBytes, tabId }) => {
      const before = structuredClone(service.getOpenDocumentForAcceptance(tabId)!.document)
      const beforeTab = service.getOpenTabs()[0]
      const beforeBytes = await readFile(packagePath)
      let stage = ''
      const pending = service.withCapturedNormalGenerationInput(tabId, async (capture) => {
        const frozen = await captureFiles(scratch)
        stage = frozen.stagingRoot
        await assertFrozenBytes(frozen.files, sourceBytes)
        if (phase === 'runtime') {
          throw new Error('Controlled runtime qualification failure')
        }
        const worker = controlledWorker(sourceBytes[0], async () => undefined)
        if (phase === 'verification') {
          return await capture.composeTarget({
            composeTarget: async (input) => {
              const result = await worker.composeTarget(input)
              return { ...result, composite: { ...result.composite, sha256: '0'.repeat(64) } }
            },
          })
        }
        await capture.composeTarget(worker)
        await assertFrozenBytes(frozen.files, sourceBytes)
        throw new Error('Controlled admission failure')
      })
      await assert.rejects(
        pending,
        phase === 'verification' ? /target changed while being verified/ : /Controlled .* failure/,
      )
      assert.equal(existsSync(stage), false)
      assert.deepEqual(await readdir(scratch), [])
      assert.deepEqual(service.getOpenDocumentForAcceptance(tabId)!.document, before)
      assert.deepEqual(service.getOpenTabs()[0], beforeTab)
      assert.deepEqual(await readFile(packagePath), beforeBytes)
      assert.deepEqual(
        await database.db.selectFrom('generation_queue_item').selectAll().execute(),
        [],
      )
    })
  }
})

test('a newly imported unsaved Raster remains captured until its callback settles', async () => {
  await withProject(async ({ packagePath, scratch, service, sourceBytes, tabId }) => {
    const beforeBytes = await readFile(packagePath)
    const importedBytes = await acceptedOutputPngFixture(4, 2)
    const sourcePath = path.join(path.dirname(scratch), 'unsaved.png')
    await writeFile(sourcePath, importedBytes)
    await service.importRasterImage(tabId, sourcePath, {
      normalizeImport: async ({ normalizedPngPath }) => {
        await writeFile(normalizedPngPath, importedBytes)
        return {
          normalized: {
            byteSize: importedBytes.length,
            colorSpace: 'srgb',
            height: 2,
            iccSha256: IGS_SRGB_ICC_SHA256,
            path: normalizedPngPath,
            sha256: sha256(importedBytes),
            width: 4,
          },
          originalIcc: null,
          sourceFormat: 'PNG',
        }
      },
    })
    const beforeCapture = structuredClone(service.getOpenDocumentForAcceptance(tabId)!.document)
    const existingDirectories = await readdir(scratch)
    const target = await service.withCapturedNormalGenerationInput(tabId, async (capture) => {
      assert.deepEqual(capture.document, beforeCapture)
      const frozen = await captureFiles(scratch, existingDirectories)
      await assertFrozenBytes(frozen.files, [...sourceBytes, importedBytes])
      return await capture.composeTarget(
        controlledWorker(sourceBytes[0], async (input) => {
          assert.equal(input.layers.length, 3)
          assert.deepEqual(
            input.layers.map((layer) => layer.sha256),
            beforeCapture.layers.map((layer) => requireRasterLayer(layer).asset.sha256),
          )
          assert.deepEqual(await readFile(input.layers[0].path), importedBytes)
        }),
      )
    })
    assert.equal(target.documentRevision, beforeCapture.documentRevision)
    assert.deepEqual(service.getOpenDocumentForAcceptance(tabId)!.document, beforeCapture)
    assert.deepEqual(await readFile(packagePath), beforeBytes)
    assert.deepEqual((await readdir(scratch)).sort(), existingDirectories.sort())
  })
})
