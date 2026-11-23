/**
 * Signed-runtime authoring for the bounded Illustrious regional-reference capacity case. Invoke
 * 4875d96531ca6712b288f6e660fcbb34143408c1: widgets/layers/layerOps.ts,
 * widgets/canvas/invoke/prepareCanvasInvocation.ts, and its compileCanvasGraph.ts /
 * addRegionalGuidance.ts callers preserve independent reference and mask owners. This fixture feeds
 * existing Main owners and leaves inference to its caller.
 */
import { parseProjectDocumentV1 } from '../../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { type AppDatabase, openAppDatabase } from '../../db/database.js'
import { CivitaiClient } from '../../models/civitai-client.js'
import { CivitaiTokenStore } from '../../models/civitai-token-store.js'
import { ModelRepository } from '../../models/model-repository.js'
import { ModelService } from '../../models/model-service.js'
import { type IgsAssetSource, readIgsPackage } from '../igs-package.js'
import { ProjectAutosaveLeaseRegistry } from '../project-autosave.js'
import { ProjectIndexRepository } from '../project-index.js'
import { decodeProjectMaskPng } from '../project-mask.js'
import { ProjectService } from '../project-service.js'
import { ProjectShadowStore } from '../project-shadow.js'
import { classifyTargetPngAlpha } from '../target-png-mode.js'
import { ProjectWorkerClient } from '../worker-client.js'

const REPO = fileURLToPath(new URL('../../../../', import.meta.url))
const ARTIFACT_ROOT = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const CHECKPOINT = {
  byteSize: 6_938_040_760,
  fileId: 798_303,
  filename: 'Illustrious-XL-v0.1.safetensors',
  modelId: 795_765,
  sha256: '3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9',
  versionId: 889_818,
} as const
const CHECKPOINT_DISPLAY = 'Illustrious XL v0.1 (official pinned epsilon)'
const POSITIVE =
  'a simple illustration of one cat head, front view, two pointed ears, two eyes, plain light background'
const BBOX = { height: 512, width: 512, x: 0, y: 0 }
const STRIPES = [
  { end: 128, label: 'left', start: 0 },
  { end: 320, label: 'middle', start: 128 },
  { end: 512, label: 'right', start: 320 },
] as const
const REFERENCE_OWNERS = [0, 1, 2, 0] as const

export interface CapacityOriginalBoundaries {
  dimensionRefusals: readonly [FilePin, FilePin, FilePin]
  normalized: readonly { bytes: number; height: number; sha256: string; width: number }[]
}

export interface CapacityStoredReferences {
  accepted: readonly [FilePin, FilePin, FilePin]
  refused: readonly [FilePin, FilePin, FilePin]
}

interface FilePin {
  byteSize: number
  path: string
  sha256: string
}

interface CapacityProject {
  database: AppDatabase
  models: ModelService
  prepareAccepted: () => Promise<string>
  projectIndex: ProjectIndexRepository
  projects: ProjectService
  referenceIds: { originals: string[]; refused: string }
  root: string
  scratch: string
  tabId: string
}

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

export async function withRegionalReferenceCapacityProject<T>(options: {
  boundaries?: CapacityOriginalBoundaries
  install: { pythonExecutable: string; runtimeDir: string }
  referenceImages: readonly FilePin[]
  run: string
  sourceImage: FilePin
  storedReferences?: CapacityStoredReferences
  use: (project: CapacityProject) => Promise<T>
}): Promise<T> {
  const { boundaries, install, referenceImages, run, sourceImage, storedReferences, use } = options
  assert.equal(path.dirname(run), path.join(ARTIFACT_ROOT, 'runs/regional-reference-capacity'))
  assert.match(path.basename(run), /^\d{8}-r[1-9]\d*$/u)
  assert.equal(await realpath(run), run)
  const payloads = path.join(run, 'payloads')
  await mkdir(payloads, { mode: 0o700, recursive: true })
  assert.equal(await realpath(payloads), payloads)
  const root = path.join(payloads, 'project')
  await mkdir(root, { mode: 0o700 })
  const scratch = path.join(root, 'scratch')
  await mkdir(scratch, { mode: 0o700 })
  assert.equal(classifyTargetPngAlpha(await verifyImage(sourceImage), 512, 512), 'img2img')
  assert.equal(
    new Set(referenceImages.map(({ sha256: hash }) => hash)).size,
    storedReferences ? 3 : 4,
  )
  for (const image of [...referenceImages, ...(boundaries?.dimensionRefusals ?? [])]) {
    await verifyImage(image, boundaries ? 36 : 32)
  }

  const database = openAppDatabase(root, path.join(REPO, 'src/main/db/migrations'))
  const projectIndex = new ProjectIndexRepository(database.db)
  const projects = new ProjectService({
    autosaveOptions: { debounceMs: 60_000, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    dataRoot: root,
    repository: projectIndex,
    roots: {
      placeholdersDir: path.join(REPO, 'src/main/projects/placeholders'),
      scratchDir: scratch,
    },
    shadow: new ProjectShadowStore(path.join(root, 'autosave')),
  })
  try {
    const { models, reference } = await installCatalogCheckpoint(database)
    const tab = await projects.create({
      height: 512,
      title: 'Regional reference capacity',
      width: 512,
    })
    const tabId = tab.id
    const current = () => {
      const owner = projects.getOpenDocumentForAcceptance(tabId)
      assert.ok(owner)
      return owner
    }
    const owner = () => {
      const { documentId, documentRevision } = current().document
      return { documentId, documentRevision }
    }

    const withWorker = async (work: (worker: ProjectWorkerClient) => Promise<void>) => {
      const worker = await ProjectWorkerClient.start(
        {
          pythonExecutable: install.pythonExecutable,
          runtimeRoot: install.runtimeDir,
          stagingBasePath: scratch,
        },
        {
          environment: {
            CUDA_VISIBLE_DEVICES: '',
            LANG: 'C.UTF-8',
            PYTHONDONTWRITEBYTECODE: '1',
            TMPDIR: scratch,
          },
        },
      )
      try {
        await work(worker)
      } finally {
        await worker.close()
        assert.equal(ProjectWorkerClient.hasUnconfirmedExit(), false)
      }
    }
    const imported: string[] = []
    const importReference = async (worker: ProjectWorkerClient, index: number) => {
      const region = current().document.regionalGuidance![REFERENCE_OWNERS[index]]
      const before = region.referenceImages?.length ?? 0
      assert.ok(
        await projects.importRegionalGuidanceReferenceImage(
          tabId,
          { ...owner(), regionId: region.id },
          async () => referenceImages[index].path,
          worker,
        ),
      )
      const images = current().document.regionalGuidance![REFERENCE_OWNERS[index]].referenceImages!
      assert.equal(images.length, before + 1)
      if (boundaries) {
        const { bytes, height, sha256, width } = images[before].asset
        assert.deepEqual({ bytes, height, sha256, width }, boundaries.normalized[index])
      }
      imported[index] = images[before].id
    }
    await withWorker(async (worker) => {
      await projects.importRasterImage(tabId, sourceImage.path, worker)
      const initial = current().document
      assert.deepEqual(initial.primaryBbox, BBOX)
      assert.equal(initial.layers.length, 1)
      assert.equal(initial.layers[0].kind, 'raster')
      await current().applyDocument(
        parseProjectDocumentV1({
          ...initial,
          generationDraft: {
            ...initial.generationDraft,
            cfgRescale: 0,
            loras: [],
            model: reference,
            negativePrompt: { embeddingRefs: [], text: '' },
            positivePrompt: { embeddingRefs: [], text: POSITIVE },
            sampling: {
              cfgScale: 5,
              denoisingStrength: 0.5,
              sampler: 'Euler',
              scheduler: 'Normal',
              steps: 30,
            },
            seed: { policy: 'fixed', value: 123 },
            vae: null,
            vaePrecision: 'FP16',
          },
        }),
        {},
        {
          expectedDocumentEpoch: current().documentEpoch,
          expectedDocumentRevision: initial.documentRevision,
        },
      )

      for (const { end, label, start } of STRIPES) {
        await projects.addRegionalGuidance(tabId, owner())
        const region = current().document.regionalGuidance!.at(-1)
        assert.ok(region, `Missing ${label} owner`)
        await projects.editRegionalGuidanceMask(tabId, region.id, {
          ...owner(),
          edit: {
            kind: 'polygon',
            operation: 'add',
            points: [
              { x: start, y: 0 },
              { x: end, y: 0 },
              { x: end, y: 512 },
              { x: start, y: 512 },
            ],
          },
          maskId: region.mask.id,
          maskRevision: region.mask.revision,
        })
      }

      if (boundaries) {
        const regionId = current().document.regionalGuidance![0].id
        const snapshot = async () => ({
          document: structuredClone(current().document),
          epoch: current().documentEpoch,
          history: [current().canUndo, current().canRedo],
          packageHash: sha256(await readFile(current().filePath)),
          scratch: await Promise.all(
            (await readdir(scratch, { recursive: true })).sort().map(async (relative) => {
              const file = path.join(scratch, relative)
              const entry = await lstat(file)
              assert.ok(entry.isDirectory() || entry.isFile())
              return { relative, sha256: entry.isFile() ? sha256(await readFile(file)) : null }
            }),
          ),
          tabs: structuredClone(projects.getOpenTabs()),
        })
        const before = await snapshot()
        const rejection = {
          code: 'IMAGE_TOO_LARGE',
          message: 'Image dimensions exceed the worker limit.',
        }
        for (const input of boundaries.dimensionRefusals) {
          await assert.rejects(
            projects.importRegionalGuidanceReferenceImage(
              tabId,
              { ...owner(), regionId },
              async () => input.path,
              worker,
            ),
            rejection,
          )
          assert.deepEqual(await snapshot(), before)
        }
        await writeFile(
          path.join(run, 'import-dimension-refusals.json'),
          `${JSON.stringify({ inputs: boundaries.dimensionRefusals, preserved: before, rejection }, null, 2)}\n`,
          { flag: 'wx', mode: 0o600 },
        )
      }
      const importOrder = boundaries ? [3, 1, 2] : [0, 1, 2]
      if (!boundaries && !storedReferences) {
        importOrder.push(3)
      }
      for (const index of importOrder) {
        await importReference(worker, index)
      }
    })

    const [, second, third] = imported
    const refused = imported[storedReferences ? 0 : 3]
    const referenceIds = {
      get originals() {
        return imported.slice(0, 3)
      },
      refused,
    }
    const retainPackage = async (name: string, expectedByOwner: readonly (readonly string[])[]) => {
      await projects.save(tabId)
      const filePath = current().filePath
      await projects.close(tabId)
      assert.equal((await projects.open(tabId)).kind, 'opened')
      await projects.flushAutosave(tabId)
      assert.equal(current().dirty, false)
      const destination = path.join(run, name)
      await writeFile(destination, await readFile(filePath), { flag: 'wx', mode: 0o600 })
      const packageData = await readIgsPackage(destination)
      assert.deepEqual(packageData.project, current().document)
      assert.deepEqual(packageData.project.primaryBbox, BBOX)
      const regions = packageData.project.regionalGuidance!
      assert.equal(regions.length, STRIPES.length)
      for (const [index, { end, start }] of STRIPES.entries()) {
        const { enabled, mask, referenceImages: committed } = regions[index]
        assert.equal(enabled, true)
        assert.ok(mask.asset)
        assert.deepEqual(mask.bounds, { height: 512, width: end - start, x: start, y: 0 })
        const alpha = decodeProjectMaskPng(
          await packageData.readMember(mask.asset.path),
          mask.asset,
        )
        assert.ok(alpha.every((value) => value === 255))
        assert.deepEqual(
          committed?.map(({ id }) => id),
          expectedByOwner[index],
        )
      }
      return packageData.project
    }

    const applyStoredReferences = async (files: CapacityStoredReferences['accepted']) => {
      const session = current()
      const { document, documentEpoch } = session
      const sources: Record<string, IgsAssetSource> = {}
      const regionalGuidance = document.regionalGuidance!.map((region, index) => {
        const [reference] = region.referenceImages!
        const image = files[index]
        const asset = {
          ...reference.asset,
          bytes: image.byteSize,
          path: `assets/regional-references/${reference.id}/${image.sha256}.png`,
          sha256: image.sha256,
        }
        if (asset.sha256 !== reference.asset.sha256) {
          sources[asset.path] = { sourcePath: image.path }
        }
        return { ...region, referenceImages: [{ ...reference, asset }] }
      })
      await session.applyDocument({ ...document, regionalGuidance }, sources, {
        expectedDocumentEpoch: documentEpoch,
        expectedDocumentRevision: document.documentRevision,
      })
      return regionalGuidance
    }
    if (storedReferences) {
      await applyStoredReferences(storedReferences.refused)
    }
    const byteCase = Boolean(boundaries || storedReferences)
    const before = await retainPackage(
      byteCase ? 'oversized-reference.igs' : 'four-references.igs',
      [byteCase ? [refused] : [imported[0], refused], [second], [third]],
    )
    if (storedReferences) {
      assert.deepEqual(
        before.regionalGuidance!.map((region) => region.referenceImages![0].asset.sha256),
        storedReferences.refused.map((image) => image.sha256),
      )
    }
    const prepareAccepted = async () => {
      // Compare with the authored snapshot after the public refusal. The caller
      // controls the refusal test and cannot silently change the input for the admitted job.
      assert.deepEqual(current().document, before)
      if (storedReferences) {
        const expected = await applyStoredReferences(storedReferences.accepted)
        const after = await retainPackage(
          'three-references.igs',
          imported.map((id) => [id]),
        )
        assert.deepEqual(after.regionalGuidance, expected)
        assert.deepEqual(after.layers, before.layers)
        assert.deepEqual(after.generationDraft, before.generationDraft)
        assert.equal(after.lastActualSeedSnapshot, before.lastActualSeedSnapshot)
        return tabId
      }
      const regionId = before.regionalGuidance![0].id
      await projects.updateRegionalGuidanceReferenceImage(
        tabId,
        { ...owner(), regionId },
        { kind: 'remove', referenceId: refused },
      )
      if (boundaries) {
        await withWorker((worker) => importReference(worker, 0))
      }
      const after = await retainPackage('three-references.igs', [[imported[0]], [second], [third]])
      assert.deepEqual(after.layers, before.layers)
      assert.deepEqual(after.generationDraft, before.generationDraft)
      assert.deepEqual(
        after.regionalGuidance,
        before.regionalGuidance!.map((region, index) => ({
          ...region,
          referenceImages:
            boundaries && index === 0
              ? after.regionalGuidance![0].referenceImages
              : region.referenceImages!.filter(({ id }) => id !== refused),
        })),
      )
      assert.equal(after.lastActualSeedSnapshot, before.lastActualSeedSnapshot)
      return tabId
    }
    return await use({
      database,
      models,
      prepareAccepted,
      projectIndex,
      projects,
      referenceIds,
      root,
      scratch,
      tabId,
    })
  } finally {
    try {
      for (const tab of projects.getOpenTabs()) {
        await (tab.dirty ? projects.discardAndClose(tab.id) : projects.close(tab.id))
      }
    } finally {
      await database.close()
    }
  }
}

async function verifyImage(pin: FilePin, maxMiB = 32): Promise<Buffer> {
  assert.equal(path.resolve(pin.path), pin.path)
  assert.equal(await realpath(pin.path), pin.path)
  const info = await lstat(pin.path)
  assert.ok(info.isFile())
  assert.equal(info.size, pin.byteSize)
  assert.ok(info.size > 0 && info.size <= maxMiB * 1024 * 1024)
  const bytes = await readFile(pin.path)
  assert.equal(bytes.length, pin.byteSize)
  assert.equal(sha256(bytes), pin.sha256)
  return bytes
}

async function installCatalogCheckpoint(database: AppDatabase) {
  const managedPath = path.join(
    ARTIFACT_ROOT,
    'shared/illustrious-epsilon-source-20261026',
    CHECKPOINT.filename,
  )
  assert.equal(await realpath(managedPath), managedPath)
  const stats = await lstat(managedPath)
  assert.ok(stats.isFile())
  assert.equal(stats.size, CHECKPOINT.byteSize)
  const repository = new ModelRepository(database.db)
  const ids = await repository.publishVerifiedInstallation({
    primary: {
      file: {
        managedPath,
        originalFilename: CHECKPOINT.filename,
        sha256: CHECKPOINT.sha256,
        sizeBytes: CHECKPOINT.byteSize,
        verifiedAt: new Date().toISOString(),
      },
      resource: {
        displayName: CHECKPOINT_DISPLAY,
        source: { kind: 'civitai', modelId: CHECKPOINT.modelId },
        sourceMetadata: { testOnlyCatalog: true },
        type: 'checkpoint',
      },
      version: {
        baseModelFamily: 'illustrious',
        format: 'safetensors',
        name: 'v0.1',
        source: {
          expectedSha256: CHECKPOINT.sha256,
          fileId: CHECKPOINT.fileId,
          kind: 'civitai',
          versionId: CHECKPOINT.versionId,
        },
        sourceMetadata: {},
      },
    },
  })
  const denyExternal = async (): Promise<never> => {
    throw new Error('The authored capacity fixture cannot use network or token storage.')
  }
  const tokenStore = new CivitaiTokenStore(
    {
      decryptStringAsync: denyExternal,
      encryptStringAsync: denyExternal,
      getSelectedStorageBackend: () => 'test-only-storage',
      isAsyncEncryptionAvailable: async () => false,
    },
    path.dirname(database.filePath),
  )
  return {
    models: new ModelService(repository, new CivitaiClient(denyExternal), tokenStore),
    // The production generation action verifies the actual checkpoint. Fixture
    // authoring reuses the caller's pinned source identity without reading 6.9 GB.
    reference: {
      baseModelFamily: 'illustrious' as const,
      civitaiFileId: CHECKPOINT.fileId,
      civitaiModelId: CHECKPOINT.modelId,
      civitaiVersionId: CHECKPOINT.versionId,
      displayName: CHECKPOINT_DISPLAY,
      fileSha256: CHECKPOINT.sha256,
      kind: 'checkpoint' as const,
      localModelId: ids.resourceId,
      localVersionId: ids.versionId,
      predictionType: 'epsilon' as const,
      versionName: 'v0.1',
    },
  }
}
