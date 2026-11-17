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
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { type AppDatabase, openAppDatabase } from '../../db/database.js'
import { CivitaiClient } from '../../models/civitai-client.js'
import { CivitaiTokenStore } from '../../models/civitai-token-store.js'
import { ModelRepository } from '../../models/model-repository.js'
import { ModelService } from '../../models/model-service.js'
import { readIgsPackage } from '../igs-package.js'
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

interface FilePin {
  byteSize: number
  path: string
  sha256: string
}

interface CapacityProject {
  database: AppDatabase
  models: ModelService
  projectIndex: ProjectIndexRepository
  projects: ProjectService
  referenceIds: { fourth: string; originals: readonly [string, string, string] }
  removeFourth: () => Promise<string>
  root: string
  scratch: string
  tabId: string
}

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

export async function withRegionalReferenceCapacityProject<T>(options: {
  install: { pythonExecutable: string; runtimeDir: string }
  referenceImages: readonly [FilePin, FilePin, FilePin, FilePin]
  run: string
  sourceImage: FilePin
  use: (project: CapacityProject) => Promise<T>
}): Promise<T> {
  const { install, referenceImages, run, sourceImage, use } = options
  assert.equal(path.dirname(run), path.join(ARTIFACT_ROOT, 'runs/regional-reference-capacity'))
  assert.match(path.basename(run), /^20261118-r[1-9]\d*$/u)
  assert.equal(await realpath(run), run)
  const payloads = path.join(run, 'payloads')
  await mkdir(payloads, { mode: 0o700, recursive: true })
  assert.equal(await realpath(payloads), payloads)
  const root = path.join(payloads, 'project')
  await mkdir(root, { mode: 0o700 })
  const scratch = path.join(root, 'scratch')
  await mkdir(scratch, { mode: 0o700 })
  assert.equal(classifyTargetPngAlpha(await verifyImage(sourceImage), 512, 512), 'img2img')
  assert.equal(new Set(referenceImages.map(({ sha256: hash }) => hash)).size, 4)
  for (const image of referenceImages) {
    await verifyImage(image)
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
    const imported: string[] = []
    try {
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

      for (const [index, regionIndex] of REFERENCE_OWNERS.entries()) {
        const region = current().document.regionalGuidance![regionIndex]
        const before = region.referenceImages?.length ?? 0
        const image = referenceImages[index]
        assert.ok(
          await projects.importRegionalGuidanceReferenceImage(
            tabId,
            { ...owner(), regionId: region.id },
            async () => image.path,
            worker,
          ),
        )
        const images = current().document.regionalGuidance![regionIndex].referenceImages!
        assert.equal(images.length, before + 1)
        imported.push(images[before].id)
      }
    } finally {
      await worker.close()
      assert.equal(ProjectWorkerClient.hasUnconfirmedExit(), false)
    }

    const [first, second, third, fourth] = imported
    const referenceIds = { fourth, originals: [first, second, third] as const }
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

    const before = await retainPackage('four-references.igs', [[first, fourth], [second], [third]])
    const removeFourth = async () => {
      // Compare with the authored snapshot after the public refusal. The caller
      // controls the refusal test and cannot silently change the input for the admitted job.
      assert.deepEqual(current().document, before)
      const regionId = before.regionalGuidance![0].id
      await projects.updateRegionalGuidanceReferenceImage(
        tabId,
        { ...owner(), regionId },
        { kind: 'remove', referenceId: fourth },
      )
      const after = await retainPackage('three-references.igs', [[first], [second], [third]])
      assert.deepEqual(after.layers, before.layers)
      assert.deepEqual(after.generationDraft, before.generationDraft)
      assert.deepEqual(
        after.regionalGuidance,
        before.regionalGuidance!.map((region) => ({
          ...region,
          referenceImages: region.referenceImages!.filter(({ id }) => id !== fourth),
        })),
      )
      assert.equal(after.lastActualSeedSnapshot, before.lastActualSeedSnapshot)
      return tabId
    }
    return await use({
      database,
      models,
      projectIndex,
      projects,
      referenceIds,
      removeFourth,
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

async function verifyImage(pin: FilePin): Promise<Buffer> {
  assert.equal(path.resolve(pin.path), pin.path)
  assert.equal(await realpath(pin.path), pin.path)
  const info = await lstat(pin.path)
  assert.ok(info.isFile())
  assert.equal(info.size, pin.byteSize)
  assert.ok(info.size > 0 && info.size <= 32 * 1024 * 1024)
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
