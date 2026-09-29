import {
  isProjectGenerationDraftChange,
  isProjectGenerationModelSelection,
} from '../../shared/api.js'
import {
  createEmptyProjectDocumentV1,
  IGS_SAFETY_CEILINGS,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { ProjectDraftSync } from '../../renderer/components/project-draft-sync.js'
import { openAppDatabase } from '../db/database.js'
import { CivitaiClient } from '../models/civitai-client.js'
import { CivitaiTokenStore } from '../models/civitai-token-store.js'
import { ModelRepository } from '../models/model-repository.js'
import { ModelService } from '../models/model-service.js'
import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { parseProjectLayerImageUrl, streamStagedProjectLayer } from './project-layer-resource.js'
import { readProjectPlaceholders } from './project-placeholders.js'
import { ProjectService } from './project-service.js'
import { ProjectSession } from './project-session.js'
import { ProjectShadowStore } from './project-shadow.js'
import { ProjectWorkerClient, ProjectWorkerError } from './worker-client.js'

const migrations = path.resolve('src/main/db/migrations')
const placeholdersDir = path.resolve('src/main/projects/placeholders')
const devPython = path.resolve('worker-python/.venv/bin/python')
const rasterPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGO06bnDwMDAxMDAwMDAAAATOgGonVuaBAAAAABJRU5ErkJggg==',
  'base64',
)
const previewWebp = Buffer.from(
  'UklGRjoAAABXRUJQVlA4IC4AAADwAQCdASoCAAIAAUAmJaACdLoB+AAETAAA/q4X/0mzxNnibPkkf/OwbEu14AAA',
  'base64',
)

function devRuntimeRoot(): string | null {
  if (!existsSync(devPython)) {
    return null
  }
  const executableParts = realpathSync(devPython).split(path.sep)
  const requestedParts = devPython.split(path.sep)
  let common = 0
  while (
    common < executableParts.length &&
    common < requestedParts.length &&
    executableParts[common] === requestedParts[common]
  ) {
    common++
  }
  const root = requestedParts.slice(0, common).join(path.sep) || path.sep
  return root === path.sep ? null : root
}

function rasterImportWorker(): Pick<ProjectWorkerClient, 'normalizeImport'> {
  return {
    normalizeImport: async ({ normalizedPngPath }) => {
      await writeFile(normalizedPngPath, rasterPng)
      return {
        normalized: {
          byteSize: rasterPng.length,
          colorSpace: 'srgb',
          height: 2,
          iccSha256: '113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1',
          path: normalizedPngPath,
          sha256: createHash('sha256').update(rasterPng).digest('hex'),
          width: 2,
        },
        originalIcc: null,
        sourceFormat: 'PNG',
      }
    },
  }
}

/** Write actual worker output files so the service must ingest them through the production path. */
function previewWorker(
  afterInput?: () => Promise<void>,
): Pick<ProjectWorkerClient, 'composePreview'> {
  return {
    composePreview: async ({ layers, mergedPngPath, thumbnailWebpPath }) => {
      assert.equal(layers.length, 2)
      for (const layer of layers) {
        assert.deepEqual(await readFile(layer.path), rasterPng)
      }
      await afterInput?.()
      await Promise.all([
        writeFile(mergedPngPath, rasterPng),
        writeFile(thumbnailWebpPath, previewWebp),
      ])
      return {
        merged: {
          byteSize: rasterPng.length,
          colorSpace: 'srgb',
          height: 2,
          iccSha256: '113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1',
          path: mergedPngPath,
          sha256: createHash('sha256').update(rasterPng).digest('hex'),
          width: 2,
        },
        rect: { height: 2, width: 2, x: 0, y: 0 },
        status: 'rendered',
        thumbnail: {
          byteSize: previewWebp.length,
          colorSpace: 'srgb',
          height: 2,
          iccSha256: '113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1',
          path: thumbnailWebpPath,
          sha256: createHash('sha256').update(previewWebp).digest('hex'),
          width: 2,
        },
      }
    },
  }
}

/** Seed a real portable .igs, then enter the Project service through its public import flow. */
async function openTwoLayerProject(
  dataRoot: string,
  repository: ProjectIndexRepository,
  service: ProjectService,
): Promise<{ filePath: string; layerIds: [string, string]; tabId: string }> {
  const externalPath = path.join(dataRoot, 'Raster fixture.igs')
  const layerIds: [string, string] = [randomUUID(), randomUUID()]
  const sha256 = createHash('sha256').update(rasterPng).digest('hex')
  const assetPaths = layerIds.map((id) => `assets/layers/${id}.png`)
  const project = createEmptyProjectDocumentV1({ title: 'Raster editing' })
  const placeholders = await readProjectPlaceholders(placeholdersDir, 'unavailable')
  await saveIgsPackage(externalPath, {
    assets: Object.fromEntries(assetPaths.map((assetPath) => [assetPath, { bytes: rasterPng }])),
    preview: {
      ...placeholders,
      rect: { height: 2, width: 6, x: 0, y: 0 },
      status: 'unavailable',
    },
    project: {
      ...project,
      layers: layerIds.map((id, index) => ({
        asset: { bytes: rasterPng.length, height: 2, path: assetPaths[index], sha256, width: 2 },
        blendMode: 'normal' as const,
        id,
        kind: 'raster' as const,
        locked: false,
        name: index === 0 ? 'Top' : 'Bottom',
        opacity: 1,
        transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: index * 4, y: 0 },
        visible: true,
      })),
    },
  })
  const selected = await service.selectImport(externalPath)
  assert.equal(selected.kind, 'transfer-required')
  if (selected.kind !== 'transfer-required') {
    throw new Error('Fixture import did not request a transfer.')
  }
  const imported = await service.finishImport(selected.importId, 'copy')
  assert.equal(imported.result.kind, 'opened')
  if (imported.result.kind !== 'opened') {
    throw new Error('Fixture import did not open the Project.')
  }
  const indexed = await repository.listProjects()
  assert.equal(indexed.length, 1)
  return { filePath: indexed[0].canonicalPath, layerIds, tabId: imported.result.tab.id }
}

async function withService(
  run: (context: {
    dataRoot: string
    modelRepository: ModelRepository
    modelService: ModelService
    repository: ProjectIndexRepository
    service: ProjectService
    shadow: ProjectShadowStore
  }) => Promise<void>,
): Promise<void> {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'igs-service-'))
  const database = openAppDatabase(dataRoot, migrations)
  const modelRepository = new ModelRepository(database.db)
  const modelService = new ModelService(
    modelRepository,
    new CivitaiClient(),
    new CivitaiTokenStore(
      {
        decryptStringAsync: async () => ({ result: '', shouldReEncrypt: false }),
        encryptStringAsync: async () => Buffer.alloc(0),
        getSelectedStorageBackend: () => 'gnome_libsecret',
        isAsyncEncryptionAvailable: async () => true,
      },
      dataRoot,
    ),
  )
  const repository = new ProjectIndexRepository(database.db)
  const shadow = new ProjectShadowStore(path.join(dataRoot, 'autosave'))
  const service = new ProjectService({
    autosaveOptions: { debounceMs: 0, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    dataRoot,
    repository,
    roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
    shadow,
  })
  try {
    await run({ dataRoot, modelRepository, modelService, repository, service, shadow })
  } finally {
    await database.close()
    await rm(dataRoot, { force: true, recursive: true })
  }
}

async function publishPortableResource(
  repository: ModelRepository,
  dataRoot: string,
  bytes: Buffer,
  displayName: string,
  predictionType: 'epsilon' | 'v_prediction',
  resourceType: 'checkpoint' | 'lora' = 'checkpoint',
  modelId = 927,
) {
  const managedPath = path.join(dataRoot, `portable-${resourceType}-${modelId}.safetensors`)
  await writeFile(managedPath, bytes)
  const digest = createHash('sha256').update(bytes).digest('hex')
  return await repository.publishVerifiedInstallation({
    primary: {
      file: {
        managedPath,
        originalFilename: path.basename(managedPath),
        sha256: digest,
        sizeBytes: bytes.length,
        verifiedAt: new Date().toISOString(),
      },
      resource: {
        displayName,
        source: { kind: 'civitai', modelId },
        sourceMetadata: {},
        type: resourceType,
      },
      version: {
        baseModelFamily: 'illustrious',
        format: 'SafeTensor',
        name: `${displayName} version`,
        predictionType,
        source: {
          expectedSha256: digest,
          fileId: modelId + 2,
          kind: 'civitai',
          versionId: modelId + 1,
        },
        sourceMetadata: {},
      },
    },
  })
}

test(
  'Project service freezes an unsaved Raster Layer and bbox before a later edit',
  { skip: !devRuntimeRoot() },
  async () => {
    await withService(async ({ dataRoot, repository, service }) => {
      const { filePath, tabId } = await openTwoLayerProject(dataRoot, repository, service)
      const bbox = { height: 2, width: 3, x: 8, y: -1 }
      await service.setPrimaryBbox(tabId, bbox)
      const sourcePath = path.join(dataRoot, 'frozen foreground.png')
      await writeFile(sourcePath, rasterPng)
      const imported = await service.importRasterImage(tabId, sourcePath, rasterImportWorker())
      assert.equal(imported.layers[0].transform.x, bbox.x)
      const savedRevision = (await readIgsPackage(filePath)).project.documentRevision

      const stagingBasePath = path.join(dataRoot, 'scratch')
      await mkdir(stagingBasePath, { recursive: true })
      const worker = await ProjectWorkerClient.start(
        {
          pythonExecutable: devPython,
          runtimeRoot: devRuntimeRoot()!,
          stagingBasePath,
        },
        { requestTimeoutMs: 15_000 },
      )
      try {
        const target = await service.prepareNormalGenerationInput(tabId, {
          composeTarget: async (input) => {
            assert.deepEqual(input.bbox, bbox)
            assert.equal(input.layers.length, 3)
            for (const layer of input.layers) {
              assert.deepEqual(await readFile(layer.path), rasterPng)
            }
            await service.setPrimaryBbox(tabId, { height: 2, width: 3, x: 50, y: 50 })
            return await worker.composeTarget(input)
          },
        })
        assert.deepEqual(target.bbox, bbox)
        assert.equal(target.mode, 'outpaint')
        assert.equal(target.composite.width, bbox.width)
        assert.equal(target.composite.height, bbox.height)
        assert.equal(target.composite.byteSize, target.composite.bytes.length)
        assert.equal(
          target.composite.sha256,
          createHash('sha256').update(target.composite.bytes).digest('hex'),
        )
        assert.notEqual(target.documentRevision, savedRevision)
        assert.deepEqual(service.getOpenTabs()[0].primaryBbox, {
          height: 2,
          width: 3,
          x: 50,
          y: 50,
        })
        assert.equal(
          (await readdir(stagingBasePath)).some((entry) => entry.startsWith('project-target-')),
          false,
        )
      } finally {
        await worker.close()
      }
    })
  },
)

test('Project service creates, edits, saves and reopens an actual .igs with independent bbox coordinates', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const created = await service.create({
      height: 1152,
      title: '   Portrait board   ',
      width: 768,
    })
    assert.equal(created.title, 'Portrait board')
    assert.deepEqual(created.primaryBbox, { height: 1152, width: 768, x: 0, y: 0 })
    assert.equal(created.dirty, false)
    const indexed = (await repository.listProjects())[0]
    assert.equal(indexed.localProjectKey, created.id)
    assert.equal(indexed.previewStatus, 'empty')
    assert.ok((await service.list())[0]?.thumbnailUrl?.startsWith('igs-preview://thumbnail/'))
    assert.equal((await readIgsPackage(indexed.canonicalPath)).project.primaryBbox.width, 768)

    const changed = await service.setPrimaryBbox(created.id, {
      height: 640,
      width: 1024,
      x: -320,
      y: 96,
    })
    assert.equal(changed.dirty, true)
    assert.equal(service.hasDirtyTabs(), true)
    await service.flushAutosave(created.id)
    assert.equal((await readIgsPackage(indexed.canonicalPath)).project.primaryBbox.x, 0)
    assert.equal((await service.list())[0]?.recoveryStatus, 'none')

    const saved = await service.save(created.id)
    assert.equal(saved.committed, true)
    assert.equal(saved.recoveryStatus, 'clean')
    assert.equal(saved.tab.dirty, false)
    assert.equal(service.hasDirtyTabs(), false)
    await service.close(created.id)
    assert.deepEqual(service.getOpenTabs(), [])

    const restarted = new ProjectService({
      autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow,
    })
    const opened = await restarted.open(created.id)
    assert.equal(opened.kind, 'opened')
    if (opened.kind === 'opened') {
      assert.deepEqual(opened.tab.primaryBbox, {
        height: 640,
        width: 1024,
        x: -320,
        y: 96,
      })
      assert.equal(opened.tab.dirty, false)
      assert.deepEqual(await restarted.open(created.id), opened)
      await restarted.close(created.id)
    }
    assert.deepEqual((await service.list())[0]?.bbox, { height: 640, width: 1024 })
  })
})

test('an open Project reports the replacement document identity when its .igs path is reused', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const created = await service.create({ height: 64, title: 'Original', width: 64 })
    const originalDocumentId = service.getOpenDocumentId(created.id)
    assert.ok(originalDocumentId)
    assert.equal(service.getOpenDocumentId('invalid-project-key'), null)
    const savedPath = (await repository.listProjects())[0].canonicalPath
    await service.close(created.id)
    assert.equal(service.getOpenDocumentId(created.id), null)

    const replacement = createEmptyProjectDocumentV1({ title: 'Replacement' })
    const placeholders = await readProjectPlaceholders(placeholdersDir, 'empty')
    const replacementPath = path.join(dataRoot, 'replacement.igs')
    await saveIgsPackage(replacementPath, {
      assets: {},
      preview: { ...placeholders, rect: null, status: 'empty' },
      project: replacement,
    })
    await rename(replacementPath, savedPath)

    const reopened = await service.open(created.id)
    assert.equal(reopened.kind, 'opened')
    assert.equal(service.getOpenDocumentId(created.id), replacement.documentId)
    assert.notEqual(service.getOpenDocumentId(created.id), originalDocumentId)
    await service.close(created.id)
  })
})

test('Project service asks before recovery and restores dirty document without replacing saved .igs', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const created = await service.create({ height: 512, title: 'Recovery', width: 512 })
    const savedPath = (await repository.listProjects())[0].canonicalPath
    await service.setPrimaryBbox(created.id, { height: 896, width: 640, x: -44, y: 12 })
    await service.flushAutosave(created.id)
    assert.equal((await readIgsPackage(savedPath)).project.primaryBbox.x, 0)

    // A new lease registry models the next main process after a crash. The first service stays
    // dirty and does not perform a graceful close or erase the recovery shadow.
    const restarted = new ProjectService({
      autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow,
    })
    const summary = (await restarted.list())[0]
    assert.equal(summary.recoveryStatus, 'recoverable')
    const choice = await restarted.open(created.id)
    assert.equal(choice.kind, 'recovery-required')
    if (choice.kind === 'recovery-required') {
      assert.equal(choice.recoveryStatus, 'recoverable')
    }
    assert.equal((await readIgsPackage(savedPath)).project.primaryBbox.x, 0)

    const recovered = await restarted.resolveRecovery(created.id, 'recover')
    assert.equal(recovered.dirty, true)
    assert.equal(recovered.primaryBbox.x, -44)
    assert.equal((await readIgsPackage(savedPath)).project.primaryBbox.x, 0)
    assert.equal((await restarted.save(created.id)).recoveryStatus, 'clean')
    assert.equal((await readIgsPackage(savedPath)).project.primaryBbox.x, -44)
    await restarted.close(created.id)
  })
})

test('Project prompt and seed edits survive shadow recovery, Save and reopen without changing the actual seed cursor', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const created = await service.create({ height: 512, title: 'Draft persistence', width: 512 })
    const savedPath = (await repository.listProjects())[0].canonicalPath
    assert.equal(created.lastActualSeedSnapshot, null)
    assert.deepEqual(created.generationDraft.seed, { policy: 'random', value: null })

    const prompted = await service.updateGenerationDraft(created.id, {
      kind: 'positive-prompt',
      text: 'a blue lantern',
    })
    assert.equal(prompted.dirty, true)
    assert.equal(prompted.generationDraft.positivePrompt.text, 'a blue lantern')
    await service.updateGenerationDraft(created.id, {
      kind: 'negative-prompt',
      text: 'blur',
    })
    const seeded = await service.updateGenerationDraft(created.id, {
      kind: 'seed',
      policy: 'fixed',
      value: 0xff_ff_ff_ff,
    })
    assert.deepEqual(seeded.generationDraft.seed, { policy: 'fixed', value: 0xff_ff_ff_ff })
    assert.equal(seeded.lastActualSeedSnapshot, null)
    await service.flushAutosave(created.id)
    assert.equal((await readIgsPackage(savedPath)).project.generationDraft.positivePrompt.text, '')

    const restarted = new ProjectService({
      autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow,
    })
    assert.equal((await restarted.open(created.id)).kind, 'recovery-required')
    const recovered = await restarted.resolveRecovery(created.id, 'recover')
    assert.equal(recovered.dirty, true)
    assert.equal(recovered.generationDraft.positivePrompt.text, 'a blue lantern')
    assert.equal(recovered.generationDraft.negativePrompt.text, 'blur')
    assert.deepEqual(recovered.generationDraft.seed, { policy: 'fixed', value: 0xff_ff_ff_ff })
    assert.equal(recovered.lastActualSeedSnapshot, null)

    const saved = await restarted.save(created.id)
    assert.equal(saved.tab.dirty, false)
    assert.deepEqual(
      (await readIgsPackage(savedPath)).project.generationDraft,
      recovered.generationDraft,
    )
    await restarted.close(created.id)
    const reopened = await restarted.open(created.id)
    assert.equal(reopened.kind, 'opened')
    if (reopened.kind !== 'opened') {
      throw new Error('Saved Project did not reopen.')
    }
    assert.deepEqual(reopened.tab.generationDraft, recovered.generationDraft)
    assert.equal(
      (
        await restarted.updateGenerationDraft(created.id, {
          kind: 'positive-prompt',
          text: 'a blue lantern',
        })
      ).dirty,
      false,
    )
    assert.equal(
      (
        await restarted.updateGenerationDraft(created.id, {
          kind: 'seed',
          policy: 'fixed',
          value: 0xff_ff_ff_ff,
        })
      ).dirty,
      false,
    )
    await restarted.close(created.id)
  })
})

test('Project sampling edits survive shadow recovery, Save and reopen independently', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const created = await service.create({ height: 512, title: 'Sampling persistence', width: 512 })
    const savedPath = (await repository.listProjects())[0].canonicalPath
    const originalSampling = created.generationDraft.sampling
    assert.deepEqual(originalSampling, {
      cfgScale: null,
      denoisingStrength: null,
      sampler: null,
      scheduler: null,
      steps: null,
    })

    const steps = await service.updateGenerationDraft(created.id, {
      kind: 'sampling-steps',
      value: 35,
    })
    assert.equal(steps.dirty, true)
    assert.deepEqual(steps.generationDraft.sampling, { ...originalSampling, steps: 35 })
    const cfgScale = await service.updateGenerationDraft(created.id, {
      kind: 'sampling-cfg-scale',
      value: 7.5,
    })
    assert.deepEqual(cfgScale.generationDraft.sampling, {
      ...originalSampling,
      cfgScale: 7.5,
      steps: 35,
    })
    const partialPair = await service.updateGenerationDraft(created.id, {
      kind: 'sampling-pair',
      sampler: 'DPM++ 2M',
      scheduler: null,
    })
    assert.equal(partialPair.generationDraft.sampling.scheduler, null)
    const selectedPair = await service.updateGenerationDraft(created.id, {
      kind: 'sampling-pair',
      sampler: 'DPM++ 2M',
      scheduler: 'Karras',
    })
    assert.deepEqual(selectedPair.generationDraft.sampling, {
      ...cfgScale.generationDraft.sampling,
      sampler: 'DPM++ 2M',
      scheduler: 'Karras',
    })
    await service.flushAutosave(created.id)
    assert.deepEqual(
      (await readIgsPackage(savedPath)).project.generationDraft.sampling,
      originalSampling,
    )

    const restarted = new ProjectService({
      autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow,
    })
    assert.equal((await restarted.open(created.id)).kind, 'recovery-required')
    const recovered = await restarted.resolveRecovery(created.id, 'recover')
    assert.equal(recovered.dirty, true)
    assert.deepEqual(recovered.generationDraft.sampling, selectedPair.generationDraft.sampling)
    assert.deepEqual(
      (await readIgsPackage(savedPath)).project.generationDraft.sampling,
      originalSampling,
    )

    assert.equal((await restarted.save(created.id)).tab.dirty, false)
    assert.deepEqual(
      (await readIgsPackage(savedPath)).project.generationDraft.sampling,
      selectedPair.generationDraft.sampling,
    )
    await restarted.close(created.id)
    const reopened = await restarted.open(created.id)
    assert.equal(reopened.kind, 'opened')
    if (reopened.kind !== 'opened') {
      throw new Error('Saved Project did not reopen.')
    }
    assert.deepEqual(reopened.tab.generationDraft.sampling, selectedPair.generationDraft.sampling)
    assert.equal(
      (
        await restarted.updateGenerationDraft(created.id, {
          kind: 'sampling-pair',
          sampler: 'DPM++ 2M',
          scheduler: 'Karras',
        })
      ).dirty,
      false,
    )
    assert.equal(
      (
        await restarted.updateGenerationDraft(created.id, {
          kind: 'sampling-steps',
          value: 35,
        })
      ).dirty,
      false,
    )
    assert.equal(
      (
        await restarted.updateGenerationDraft(created.id, {
          kind: 'sampling-cfg-scale',
          value: 7.5,
        })
      ).dirty,
      false,
    )

    const clearedPair = await restarted.updateGenerationDraft(created.id, {
      kind: 'sampling-pair',
      sampler: null,
      scheduler: null,
    })
    assert.equal(clearedPair.dirty, true)
    const clearedSteps = await restarted.updateGenerationDraft(created.id, {
      kind: 'sampling-steps',
      value: null,
    })
    assert.deepEqual(clearedSteps.generationDraft.sampling, {
      ...originalSampling,
      cfgScale: 7.5,
    })
    await restarted.save(created.id)
    await restarted.close(created.id)
    const reopenedAfterClear = await restarted.open(created.id)
    assert.equal(reopenedAfterClear.kind, 'opened')
    if (reopenedAfterClear.kind !== 'opened') {
      throw new Error('Saved Project did not reopen after clearing Steps.')
    }
    assert.deepEqual(
      reopenedAfterClear.tab.generationDraft.sampling,
      clearedSteps.generationDraft.sampling,
    )
    const clearedCfgScale = await restarted.updateGenerationDraft(created.id, {
      kind: 'sampling-cfg-scale',
      value: null,
    })
    assert.equal(clearedCfgScale.dirty, true)
    assert.deepEqual(clearedCfgScale.generationDraft.sampling, originalSampling)
    await restarted.save(created.id)
    assert.deepEqual(
      (await readIgsPackage(savedPath)).project.generationDraft.sampling,
      originalSampling,
    )
    await restarted.close(created.id)
  })
})

test('Project keeps a registry-selected exact checkpoint through shadow, Save, default change and missing file', async () => {
  await withService(
    async ({ dataRoot, modelRepository, modelService, repository, service, shadow }) => {
      const created = await service.create({ height: 512, title: 'Exact model', width: 512 })
      const savedPath = (await repository.listProjects())[0].canonicalPath
      const publishVersion = async (versionId: number) => {
        const bytes = Buffer.from(`verified checkpoint v${versionId}`)
        const managedPath = path.join(dataRoot, `checkpoint-${versionId}.safetensors`)
        await writeFile(managedPath, bytes)
        const digest = createHash('sha256').update(bytes).digest('hex')
        const published = await modelRepository.publishVerifiedInstallation({
          primary: {
            file: {
              managedPath,
              originalFilename: `checkpoint-${versionId}.safetensors`,
              sha256: digest,
              sizeBytes: bytes.length,
              verifiedAt: new Date().toISOString(),
            },
            resource: {
              displayName: 'Portrait checkpoint',
              source: { kind: 'civitai', modelId: 42 },
              sourceMetadata: {},
              type: 'checkpoint',
            },
            version: {
              baseModelFamily: 'illustrious',
              format: 'SafeTensor',
              name: `v${versionId}`,
              predictionType: null,
              source: {
                expectedSha256: digest,
                fileId: versionId + 700,
                kind: 'civitai',
                versionId,
              },
              sourceMetadata: {},
            },
          },
        })
        return { managedPath, published, sha256: digest }
      }
      const first = await publishVersion(7)
      const second = await publishVersion(8)
      assert.equal(first.published.resourceId, second.published.resourceId)

      const selection = {
        resourceId: first.published.resourceId,
        versionId: first.published.versionId,
      }
      assert.equal(isProjectGenerationModelSelection(selection), true)
      assert.equal(
        isProjectGenerationModelSelection({ ...selection, fileSha256: first.sha256 }),
        false,
      )
      assert.equal(
        isProjectGenerationModelSelection({ ...selection, managedPath: first.managedPath }),
        false,
      )
      assert.equal(isProjectGenerationModelSelection(null), true)
      const exactRef = await modelService.resolveGenerationCheckpoint(
        selection.resourceId,
        selection.versionId,
      )
      assert.deepEqual(exactRef, {
        baseModelFamily: 'illustrious',
        civitaiFileId: 707,
        civitaiModelId: 42,
        civitaiVersionId: 7,
        displayName: 'Portrait checkpoint',
        fileSha256: first.sha256,
        kind: 'checkpoint',
        localModelId: selection.resourceId,
        localVersionId: selection.versionId,
        predictionType: 'epsilon',
        versionName: 'v7',
      })
      const selected = await service.setGenerationModel(created.id, exactRef)
      assert.equal(selected.dirty, true)
      assert.deepEqual(selected.generationDraft.model, exactRef)
      assert.deepEqual(selected.generationDraft.seed, { policy: 'random', value: null })
      await service.flushAutosave(created.id)
      const oldSaved = await readIgsPackage(savedPath)
      assert.equal(oldSaved.project.generationDraft.model, null)
      const recovery = await shadow.inspect({ projectPath: savedPath, savedPackage: oldSaved })
      assert.equal(recovery.status, 'recoverable')
      if (recovery.status !== 'recoverable') {
        throw new Error('The exact model did not reach the recovery shadow.')
      }
      assert.deepEqual(recovery.document.generationDraft.model, exactRef)

      const saved = await service.save(created.id)
      assert.equal(saved.tab.dirty, false)
      assert.deepEqual((await readIgsPackage(savedPath)).project.generationDraft.model, exactRef)
      await modelService.setDefaultVersion(second.published.resourceId, second.published.versionId)
      assert.equal(
        (await modelRepository.listInstalled())[0].defaultVersionId,
        second.published.versionId,
      )
      await service.close(created.id)
      const reopened = await service.open(created.id)
      assert.equal(reopened.kind, 'opened')
      if (reopened.kind !== 'opened') {
        throw new Error('The saved Project did not reopen.')
      }
      assert.deepEqual(reopened.tab.generationDraft.model, exactRef)
      assert.equal((await service.setGenerationModel(created.id, exactRef)).dirty, false)

      await service.close(created.id)
      await rm(first.managedPath)
      const withMissingFile = await service.open(created.id)
      assert.equal(withMissingFile.kind, 'opened')
      if (withMissingFile.kind !== 'opened') {
        throw new Error('The Project with a missing model did not open.')
      }
      assert.deepEqual(withMissingFile.tab.generationDraft.model, exactRef)
      await assert.rejects(
        modelService.resolveGenerationCheckpoint(selection.resourceId, selection.versionId),
        { code: 'MODEL_FILE_MISSING' },
      )
      assert.equal(service.getOpenTabs()[0].dirty, false)
      assert.equal((await service.setGenerationModel(created.id, null)).dirty, true)
      assert.equal((await service.setGenerationModel(created.id, null)).generationDraft.model, null)
      await service.save(created.id)
      await service.close(created.id)
      const cleared = await service.open(created.id)
      assert.equal(cleared.kind, 'opened')
      if (cleared.kind === 'opened') {
        assert.equal(cleared.tab.generationDraft.model, null)
        assert.equal((await service.setGenerationModel(created.id, null)).dirty, false)
        await service.close(created.id)
      }
    },
  )
})

test('a copied .igs explicitly links the same installed checkpoint across local libraries without rewriting frozen metadata', async () => {
  const bytes = Buffer.from('one exact portable checkpoint in two managed libraries')
  await withService(async (origin) => {
    const originInstalled = await publishPortableResource(
      origin.modelRepository,
      origin.dataRoot,
      bytes,
      'Original name',
      'epsilon',
    )
    const created = await origin.service.create({
      height: 512,
      title: 'Portable model',
      width: 512,
    })
    const originalRef = await origin.modelService.resolveGenerationCheckpoint(
      originInstalled.resourceId,
      originInstalled.versionId,
    )
    let resolvedWithoutSelection = false
    await assert.rejects(
      origin.service.relinkGenerationModel(created.id, async () => {
        resolvedWithoutSelection = true
        return originalRef
      }),
      { code: 'PROJECT_MODEL_NOT_SELECTED' },
    )
    assert.equal(resolvedWithoutSelection, false)
    assert.equal(origin.service.getOpenTabs()[0].dirty, false)
    await origin.service.setGenerationModel(created.id, originalRef)
    await origin.service.save(created.id)
    const originPath = (await origin.repository.listProjects())[0].canonicalPath
    const portableBytes = await readFile(originPath)
    await origin.service.close(created.id)

    await withService(async (destination) => {
      const destinationInstalled = await publishPortableResource(
        destination.modelRepository,
        destination.dataRoot,
        bytes,
        'Different local name',
        'v_prediction',
      )
      assert.notEqual(destinationInstalled.resourceId, originInstalled.resourceId)
      assert.notEqual(destinationInstalled.versionId, originInstalled.versionId)
      const incomingPath = path.join(destination.dataRoot, 'From another computer.igs')
      await writeFile(incomingPath, portableBytes)
      const selection = await destination.service.selectImport(incomingPath)
      assert.equal(selection.kind, 'transfer-required')
      if (selection.kind !== 'transfer-required') {
        throw new Error('Expected a portable Project import choice.')
      }
      const imported = await destination.service.finishImport(selection.importId, 'copy')
      assert.equal(imported.result.kind, 'opened')
      if (imported.result.kind !== 'opened') {
        throw new Error('Expected the imported Project to open.')
      }
      const tabId = imported.result.tab.id
      const savedPath = (await destination.repository.listProjects())[0]?.canonicalPath
      assert.ok(savedPath)
      assert.equal(imported.result.tab.dirty, false)
      assert.deepEqual(imported.result.tab.generationDraft.model, originalRef)
      assert.deepEqual((await readIgsPackage(savedPath)).project.generationDraft.model, originalRef)

      await assert.rejects(
        destination.service.relinkGenerationModel(tabId, async (saved) => ({
          ...(await destination.modelService.resolvePortableGenerationCheckpoint(saved)),
          civitaiVersionId: 999,
        })),
        { code: 'PROJECT_MODEL_RELINK_MISMATCH' },
      )
      assert.equal(destination.service.getOpenTabs()[0].dirty, false)

      let releaseResolver!: () => void
      let signalResolverStarted!: () => void
      const resolverGate = new Promise<void>((resolve) => {
        releaseResolver = resolve
      })
      const resolverStarted = new Promise<void>((resolve) => {
        signalResolverStarted = resolve
      })
      const staleRelink = destination.service.relinkGenerationModel(tabId, async (saved) => {
        signalResolverStarted()
        await resolverGate
        return await destination.modelService.resolvePortableGenerationCheckpoint(saved)
      })
      await resolverStarted
      await destination.service.updateGenerationDraft(tabId, {
        kind: 'positive-prompt',
        text: 'An edit made while the exact file is being verified',
      })
      releaseResolver()
      await assert.rejects(staleRelink, { code: 'EDIT_CONFLICT' })
      assert.deepEqual(destination.service.getOpenTabs()[0].generationDraft.model, originalRef)

      const linked = await destination.service.relinkGenerationModel(tabId, async (saved) => ({
        ...(await destination.modelService.resolvePortableGenerationCheckpoint(saved)),
        displayName: 'Untrusted destination title',
        predictionType: 'sample',
        versionName: 'Untrusted destination version',
      }))
      const linkedRef = {
        ...originalRef,
        localModelId: destinationInstalled.resourceId,
        localVersionId: destinationInstalled.versionId,
      }
      assert.equal(linked.dirty, true)
      assert.deepEqual(linked.generationDraft.model, linkedRef)
      assert.equal(linked.generationDraft.model?.predictionType, 'epsilon')
      assert.equal(
        linked.generationDraft.positivePrompt.text,
        'An edit made while the exact file is being verified',
      )
      assert.deepEqual((await readIgsPackage(savedPath)).project.generationDraft.model, originalRef)
      await destination.service.flushAutosave(tabId)
      const recovery = await destination.shadow.inspect({
        projectPath: savedPath,
        savedPackage: await readIgsPackage(savedPath),
      })
      assert.equal(recovery.status, 'recoverable')
      if (recovery.status === 'recoverable') {
        assert.deepEqual(recovery.document.generationDraft.model, linkedRef)
      }
      await destination.service.save(tabId)
      assert.deepEqual((await readIgsPackage(savedPath)).project.generationDraft.model, linkedRef)
      await destination.service.close(tabId)
      const reopened = await destination.service.open(tabId)
      assert.equal(reopened.kind, 'opened')
      if (reopened.kind === 'opened') {
        assert.deepEqual(reopened.tab.generationDraft.model, linkedRef)
        assert.equal(reopened.tab.dirty, false)
        assert.equal(
          (
            await destination.service.relinkGenerationModel(tabId, (saved) =>
              destination.modelService.resolvePortableGenerationCheckpoint(saved),
            )
          ).dirty,
          false,
        )
        let releaseNoop!: () => void
        let signalNoopStarted!: () => void
        const noopGate = new Promise<void>((resolve) => {
          releaseNoop = resolve
        })
        const noopStarted = new Promise<void>((resolve) => {
          signalNoopStarted = resolve
        })
        const staleNoop = destination.service.relinkGenerationModel(tabId, async (saved) => {
          signalNoopStarted()
          await noopGate
          return await destination.modelService.resolvePortableGenerationCheckpoint(saved)
        })
        await noopStarted
        await destination.service.updateGenerationDraft(tabId, {
          kind: 'negative-prompt',
          text: 'Newer edit before a no-op relink resolves',
        })
        releaseNoop()
        await assert.rejects(staleNoop, { code: 'EDIT_CONFLICT' })
        assert.deepEqual(destination.service.getOpenTabs()[0].generationDraft.model, linkedRef)
        await destination.service.save(tabId)
        await destination.service.close(tabId)
      }
    })
  })
})

test('Project prompt text retains only pre-existing embedding refs whose literal token remains', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const externalPath = path.join(dataRoot, 'Embedded prompt.igs')
    const document = createEmptyProjectDocumentV1({ title: 'Embedded prompt' })
    const ref = {
      resource: {
        baseModelFamily: 'illustrious' as const,
        civitaiFileId: null,
        civitaiModelId: null,
        civitaiVersionId: null,
        displayName: 'Face embedding',
        fileSha256: 'a'.repeat(64),
        kind: 'embedding' as const,
        localModelId: 'face',
        localVersionId: 'v1',
        predictionType: null,
        versionName: '1',
      },
      token: 'face',
    }
    document.generationDraft.positivePrompt = { embeddingRefs: [ref], text: 'face' }
    document.generationDraft.negativePrompt = { embeddingRefs: [ref], text: 'face' }
    document.generationDraft.sampling.cfgScale = 7.5
    const placeholders = await readProjectPlaceholders(placeholdersDir, 'empty')
    await saveIgsPackage(externalPath, {
      assets: {},
      preview: { ...placeholders, rect: null, status: 'empty' },
      project: document,
    })
    const selected = await service.selectImport(externalPath)
    assert.equal(selected.kind, 'transfer-required')
    if (selected.kind !== 'transfer-required') {
      throw new Error('Expected transfer choice.')
    }
    const imported = await service.finishImport(selected.importId, 'copy')
    assert.equal(imported.result.kind, 'opened')
    if (imported.result.kind !== 'opened') {
      throw new Error('Expected imported Project to open.')
    }
    const tabId = imported.result.tab.id
    const loraResource = { ...ref.resource, kind: 'lora' as const, localModelId: 'lora-face' }
    const loraIdentity = {
      resourceId: loraResource.localModelId,
      versionId: loraResource.localVersionId,
    }
    const addedLora = await service.addGenerationLora(tabId, loraResource)
    const weightedLora = await service.updateGenerationDraft(tabId, {
      ...loraIdentity,
      kind: 'lora-weight',
      value: 0.4,
    })
    const disabledLora = await service.updateGenerationDraft(tabId, {
      ...loraIdentity,
      kind: 'lora-enabled',
      value: false,
    })
    const removedLora = await service.removeGenerationLora(tabId, loraIdentity)
    for (const tab of [addedLora, weightedLora, disabledLora, removedLora]) {
      assert.deepEqual(tab.generationDraft.positivePrompt, document.generationDraft.positivePrompt)
      assert.deepEqual(tab.generationDraft.negativePrompt, document.generationDraft.negativePrompt)
    }
    const retained = await service.updateGenerationDraft(tabId, {
      kind: 'positive-prompt',
      text: 'xface face!',
    })
    assert.deepEqual(retained.generationDraft.positivePrompt.embeddingRefs, [ref])
    assert.deepEqual(retained.generationDraft.negativePrompt.embeddingRefs, [ref])
    assert.equal(retained.generationDraft.sampling.cfgScale, 7.5)
    const removed = await service.updateGenerationDraft(tabId, {
      kind: 'positive-prompt',
      text: 'xface facey',
    })
    assert.deepEqual(removed.generationDraft.positivePrompt.embeddingRefs, [])
    assert.deepEqual(removed.generationDraft.negativePrompt.embeddingRefs, [ref])
    assert.equal(removed.generationDraft.sampling.cfgScale, 7.5)
    await service.save(tabId)
    const savedPath = (await repository.listProjects())[0].canonicalPath
    assert.deepEqual(
      (await readIgsPackage(savedPath)).project.generationDraft.positivePrompt.embeddingRefs,
      [],
    )
    await service.close(tabId)
  })
})

test('Project draft IPC shape and service reject forged refs and invalid scalar settings without dirtying', async () => {
  const invalid = [
    { embeddingRefs: [], kind: 'positive-prompt', text: 'face' },
    { kind: 'seed', policy: 'fixed', value: null },
    { kind: 'seed', policy: 'fixed', value: -1 },
    { kind: 'seed', policy: 'fixed', value: 4_294_967_296 },
    { kind: 'seed', policy: 'random', value: 1 },
    { kind: 'seed', policy: 'reuse', value: 3 },
    { kind: 'sampling-steps', value: 0 },
    { kind: 'sampling-steps', value: -1 },
    { kind: 'sampling-steps', value: 1.5 },
    { kind: 'sampling-steps', value: Number.MAX_SAFE_INTEGER + 1 },
    { kind: 'sampling-steps', value: Number.POSITIVE_INFINITY },
    { kind: 'sampling-steps', value: Number.NaN },
    { kind: 'sampling-steps', value: '30' },
    { kind: 'sampling-steps', scheduler: 'forged', value: 30 },
    { kind: 'sampling-cfg-scale', value: -0.1 },
    { kind: 'sampling-cfg-scale', value: Number.POSITIVE_INFINITY },
    { kind: 'sampling-cfg-scale', value: Number.NaN },
    { kind: 'sampling-cfg-scale', value: '7.5' },
    { kind: 'sampling-cfg-scale', loras: [], value: 7.5 },
    { kind: 'sampling-pair', sampler: 'Euler a', scheduler: 'Karras' },
    { kind: 'sampling-pair', sampler: 'DPM++ 2M', scheduler: 'Exponential' },
    { kind: 'sampling-pair', sampler: null, scheduler: 'Normal' },
    { kind: 'sampling-pair', model: 'forged', sampler: 'Euler a', scheduler: null },
    { kind: 'positive-prompt', text: 'é'.repeat(IGS_SAFETY_CEILINGS.textBytes) },
  ]
  for (const change of invalid) {
    assert.equal(isProjectGenerationDraftChange(change), false)
  }
  assert.equal(isProjectGenerationDraftChange({ kind: 'seed', policy: 'fixed', value: 0 }), true)
  assert.equal(isProjectGenerationDraftChange({ kind: 'seed', policy: 'reuse', value: null }), true)
  assert.equal(isProjectGenerationDraftChange({ kind: 'sampling-steps', value: null }), true)
  assert.equal(isProjectGenerationDraftChange({ kind: 'sampling-steps', value: 1 }), true)
  assert.equal(
    isProjectGenerationDraftChange({ kind: 'sampling-steps', value: Number.MAX_SAFE_INTEGER }),
    true,
  )
  assert.equal(isProjectGenerationDraftChange({ kind: 'sampling-cfg-scale', value: null }), true)
  assert.equal(isProjectGenerationDraftChange({ kind: 'sampling-cfg-scale', value: 0 }), true)
  assert.equal(
    isProjectGenerationDraftChange({ kind: 'sampling-pair', sampler: null, scheduler: null }),
    true,
  )
  assert.equal(
    isProjectGenerationDraftChange({ kind: 'sampling-pair', sampler: 'Euler a', scheduler: null }),
    true,
  )
  assert.equal(
    isProjectGenerationDraftChange({
      kind: 'sampling-pair',
      sampler: 'DPM++ SDE',
      scheduler: 'Karras',
    }),
    true,
  )
  assert.equal(
    isProjectGenerationDraftChange({ kind: 'sampling-cfg-scale', value: Number.MAX_VALUE }),
    true,
  )
  await withService(async ({ service }) => {
    const created = await service.create({ height: 512, title: 'Guarded draft', width: 512 })
    for (const change of invalid) {
      await assert.rejects(service.updateGenerationDraft(created.id, change as never), {
        code: 'PROJECT_INVALID_INPUT',
      })
    }
    assert.equal(service.getOpenTabs()[0].dirty, false)
    const reuse = await service.updateGenerationDraft(created.id, {
      kind: 'seed',
      policy: 'reuse',
      value: null,
    })
    assert.deepEqual(reuse.generationDraft.seed, { policy: 'reuse', value: null })
    assert.equal(reuse.lastActualSeedSnapshot, null)
    await service.discardAndClose(created.id)
  })
})

test('Project service rejects unknown IDs and invalid bbox before changing an open document', async () => {
  await withService(async ({ service }) => {
    const created = await service.create({ height: 1024, title: 'Valid', width: 1024 })
    await assert.rejects(service.open('../../outside.igs'), { code: 'PROJECT_INVALID_INPUT' })
    await assert.rejects(service.open(`project-v1-${'0'.repeat(64)}`), {
      code: 'PROJECT_NOT_FOUND',
    })
    await assert.rejects(
      service.setPrimaryBbox(created.id, { height: 512, width: 0, x: 0, y: 0 }),
      { code: 'PROJECT_INVALID_INPUT' },
    )
    assert.equal(service.getOpenTabs()[0].dirty, false)
    assert.deepEqual(service.getOpenTabs()[0].primaryBbox, {
      height: 1024,
      width: 1024,
      x: 0,
      y: 0,
    })
    await service.close(created.id)
  })
})

test('an indexed path swapped to another .igs during recovery inspection cannot open or Save the other file', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const created = await service.create({ height: 512, title: 'Indexed', width: 512 })
    const indexedPath = (await repository.listProjects())[0].canonicalPath
    await service.close(created.id)
    const externalPath = path.join(dataRoot, 'external.igs')
    await ProjectSession.create(externalPath, 'External', {
      placeholdersDir,
      scratchDir: path.join(dataRoot, 'scratch'),
    })
    const externalBefore = await readFile(externalPath)
    let swapped = false
    class SwappingShadow extends ProjectShadowStore {
      override async inspect(input: Parameters<ProjectShadowStore['inspect']>[0]) {
        const inspection = await super.inspect(input)
        if (!swapped) {
          swapped = true
          await rename(indexedPath, `${indexedPath}.original`)
          await symlink(externalPath, indexedPath)
        }
        return inspection
      }
    }
    const restarted = new ProjectService({
      autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow: new SwappingShadow(path.join(dataRoot, 'autosave')),
    })
    await assert.rejects(restarted.open(created.id), { code: 'PROJECT_INVALID_PATH' })
    assert.deepEqual(restarted.getOpenTabs(), [])
    assert.deepEqual(await readFile(externalPath), externalBefore)
  })
})

test('a default workspace redirected before New Project cannot create a file outside the workspace', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    await service.initialize()
    const workspace = await repository.workspaceById('uncategorized')
    const outside = path.join(dataRoot, 'outside')
    await mkdir(outside)
    await rename(workspace.directoryPath, `${workspace.directoryPath}.saved`)
    await symlink(outside, workspace.directoryPath)
    await assert.rejects(service.create({ height: 512, title: 'Outside attempt', width: 512 }), {
      code: 'PROJECT_INVALID_PATH',
    })
    assert.deepEqual(await readdir(outside), [])
  })
})

test('recovery cannot follow an indexed path swapped after shadow inspection', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const created = await service.create({ height: 512, title: 'Recover here', width: 512 })
    const indexedPath = (await repository.listProjects())[0].canonicalPath
    await service.setPrimaryBbox(created.id, { height: 512, width: 512, x: 15, y: 0 })
    await service.flushAutosave(created.id)
    const externalPath = path.join(dataRoot, 'external-recovery.igs')
    await ProjectSession.create(externalPath, 'External', {
      placeholdersDir,
      scratchDir: path.join(dataRoot, 'scratch'),
    })
    const externalBefore = await readFile(externalPath)
    let swapped = false
    class SwappingShadow extends ProjectShadowStore {
      override async inspect(input: Parameters<ProjectShadowStore['inspect']>[0]) {
        const inspection = await super.inspect(input)
        if (!swapped) {
          swapped = true
          await rename(indexedPath, `${indexedPath}.original`)
          await symlink(externalPath, indexedPath)
        }
        return inspection
      }
    }
    const restarted = new ProjectService({
      autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow: new SwappingShadow(path.join(dataRoot, 'autosave')),
    })
    await assert.rejects(restarted.resolveRecovery(created.id, 'recover'), {
      code: 'PROJECT_INVALID_PATH',
    })
    assert.deepEqual(restarted.getOpenTabs(), [])
    assert.deepEqual(await readFile(externalPath), externalBefore)
  })
})

test('a failed Project Save keeps the dirty tab and its valid recovery shadow', async () => {
  await withService(async ({ repository, service, shadow }) => {
    const created = await service.create({ height: 512, title: 'Uncommitted', width: 512 })
    const filePath = (await repository.listProjects())[0].canonicalPath
    await service.setPrimaryBbox(created.id, { height: 512, width: 512, x: 99, y: 0 })
    await service.flushAutosave(created.id)
    // A changed on-disk fingerprint forces the real Save compare-and-replace guard to reject.
    // The package bytes remain valid, so recovery can still be independently inspected.
    await utimes(filePath, new Date('2000-01-01T00:00:00Z'), new Date('2000-01-01T00:00:00Z'))
    await assert.rejects(service.save(created.id), { code: 'PROJECT_EXTERNAL_CHANGE' })
    assert.equal(service.getOpenTabs()[0].dirty, true)
    assert.equal((await readIgsPackage(filePath)).project.primaryBbox.x, 0)
    assert.equal(
      (
        await shadow.inspect({
          projectPath: filePath,
          savedPackage: await readIgsPackage(filePath),
        })
      ).status,
      'recoverable',
    )
  })
})

test('a post-create index failure preserves the new .igs for the next Home scan', async () => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'igs-service-index-'))
  const database = openAppDatabase(dataRoot, migrations)
  try {
    class FailingOnceIndex extends ProjectIndexRepository {
      private failed = false

      override async indexSaved(filePath: string, workspaceId: string) {
        if (!this.failed) {
          this.failed = true
          throw new Error('simulated derived index outage')
        }
        return await super.indexSaved(filePath, workspaceId)
      }
    }
    const repository = new FailingOnceIndex(database.db)
    const service = new ProjectService({
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow: new ProjectShadowStore(path.join(dataRoot, 'autosave')),
    })
    await assert.rejects(service.create({ height: 512, title: 'Still on disk', width: 512 }), {
      code: 'PROJECT_CREATED_NOT_INDEXED',
    })
    const workspace = await repository.workspaceById('uncategorized')
    const files = await readdir(workspace.directoryPath)
    assert.equal(files.length, 1)
    assert.equal(
      (await readIgsPackage(path.join(workspace.directoryPath, files[0]))).project.title,
      'Still on disk',
    )
    const rediscovered = await service.list()
    assert.equal(rediscovered.length, 1)
    assert.equal(rediscovered[0].title, 'Still on disk')
  } finally {
    await database.close()
    await rm(dataRoot, { force: true, recursive: true })
  }
})

test('dirty close preserves the tab; explicit discard removes recovery and reopens saved state', async () => {
  await withService(async ({ repository, service, shadow }) => {
    const created = await service.create({ height: 512, title: 'Keep open', width: 512 })
    await service.setPrimaryBbox(created.id, { height: 512, width: 512, x: 40, y: 0 })
    await service.flushAutosave(created.id)
    await assert.rejects(service.close(created.id), { code: 'PROJECT_DIRTY' })
    assert.equal(service.getOpenTabs().length, 1)
    await service.discardAndClose(created.id)
    assert.deepEqual(service.getOpenTabs(), [])
    const savedPath = (await repository.listProjects())[0].canonicalPath
    assert.equal((await readIgsPackage(savedPath)).project.primaryBbox.x, 0)
    assert.equal(
      (
        await shadow.inspect({
          projectPath: savedPath,
          savedPackage: await readIgsPackage(savedPath),
        })
      ).status,
      'absent',
    )
    const reopened = await service.open(created.id)
    assert.equal(reopened.kind, 'opened')
    if (reopened.kind === 'opened') {
      assert.equal(reopened.tab.dirty, false)
      await service.close(created.id)
    }
  })
})

test('external .igs selection is inert until confirmed and Copy preserves portable document identity', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const externalDirectory = path.join(dataRoot, 'external')
    await mkdir(externalDirectory)
    const sourcePath = path.join(externalDirectory, 'Field Notes.igs')
    await ProjectSession.create(sourcePath, 'Field Notes', {
      placeholdersDir,
      scratchDir: path.join(dataRoot, 'scratch'),
    })
    const originalBytes = await readFile(sourcePath)
    const originalDocument = (await readIgsPackage(sourcePath)).project
    const canceled = await service.selectImport(sourcePath)
    assert.equal(canceled.kind, 'transfer-required')
    if (canceled.kind !== 'transfer-required') {
      return
    }
    assert.equal(canceled.title, 'Field Notes')
    const workspace = await repository.workspaceById('uncategorized')
    assert.deepEqual(await readdir(workspace.directoryPath), [])
    service.cancelImport(canceled.importId)
    await assert.rejects(service.finishImport(canceled.importId, 'move'), {
      code: 'PROJECT_IMPORT_SELECTION_MISSING',
    })
    assert.deepEqual(await readFile(sourcePath), originalBytes)
    assert.deepEqual(await readdir(workspace.directoryPath), [])

    const selected = await service.selectImport(sourcePath)
    assert.equal(selected.kind, 'transfer-required')
    if (selected.kind !== 'transfer-required') {
      return
    }
    const imported = await service.finishImport(selected.importId, 'copy')
    assert.equal(imported.result.kind, 'opened')
    assert.equal(imported.sourceRetained, true)
    assert.equal(imported.warning, undefined)
    assert.deepEqual(await readFile(sourcePath), originalBytes)
    const first = (await repository.listProjects())[0]
    assert.equal(path.basename(first.canonicalPath), 'Field Notes.igs')
    assert.equal(first.documentId, originalDocument.documentId)
    assert.notEqual(first.localProjectKey, selected.importId)
    assert.deepEqual(await readFile(first.canonicalPath), originalBytes)
    if (imported.result.kind === 'opened') {
      assert.equal(imported.result.tab.id, first.localProjectKey)
      await service.close(imported.result.tab.id)
    }

    // A second Copy cannot overwrite the already imported Project and gets its own recovery key.
    const secondSelection = await service.selectImport(sourcePath)
    assert.equal(secondSelection.kind, 'transfer-required')
    if (secondSelection.kind !== 'transfer-required') {
      return
    }
    const second = await service.finishImport(secondSelection.importId, 'copy')
    assert.equal(second.result.kind, 'opened')
    const rows = await repository.listProjects()
    assert.equal(rows.length, 2)
    assert.notEqual(rows[0].localProjectKey, rows[1].localProjectKey)
    assert.deepEqual(
      rows.map((row) => row.documentId),
      [originalDocument.documentId, originalDocument.documentId],
    )
    if (second.result.kind === 'opened') {
      await service.close(second.result.tab.id)
    }
  })
})

test('Move removes the selected source only after a valid imported .igs opens', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const externalDirectory = path.join(dataRoot, 'external')
    await mkdir(externalDirectory)
    const sourcePath = path.join(externalDirectory, 'Move Me.igs')
    await ProjectSession.create(sourcePath, 'Move Me', {
      placeholdersDir,
      scratchDir: path.join(dataRoot, 'scratch'),
    })
    const originalBytes = await readFile(sourcePath)
    const selected = await service.selectImport(sourcePath)
    assert.equal(selected.kind, 'transfer-required')
    if (selected.kind !== 'transfer-required') {
      return
    }
    const imported = await service.finishImport(selected.importId, 'move')
    assert.equal(imported.result.kind, 'opened')
    assert.equal(imported.sourceRetained, false)
    assert.equal(imported.warning, undefined)
    await assert.rejects(readFile(sourcePath), { code: 'ENOENT' })
    const row = (await repository.listProjects())[0]
    assert.deepEqual(await readFile(row.canonicalPath), originalBytes)
    if (imported.result.kind === 'opened') {
      await service.close(imported.result.tab.id)
    }
    const reopened = await service.open(row.localProjectKey)
    assert.equal(reopened.kind, 'opened')
    if (reopened.kind === 'opened') {
      await service.close(reopened.tab.id)
    }
  })
})

test('a changed selected source cannot be transferred and leaves the workspace untouched', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const sourcePath = path.join(dataRoot, 'Original.igs')
    await ProjectSession.create(sourcePath, 'Original', {
      placeholdersDir,
      scratchDir: path.join(dataRoot, 'scratch'),
    })
    const selected = await service.selectImport(sourcePath)
    assert.equal(selected.kind, 'transfer-required')
    if (selected.kind !== 'transfer-required') {
      return
    }
    await utimes(sourcePath, new Date('2000-01-01T00:00:00Z'), new Date('2000-01-01T00:00:00Z'))
    await assert.rejects(service.finishImport(selected.importId, 'move'), {
      code: 'PROJECT_IMPORT_SOURCE_CHANGED',
    })
    assert.equal((await readIgsPackage(sourcePath)).project.title, 'Original')
    assert.deepEqual(
      await readdir((await repository.workspaceById('uncategorized')).directoryPath),
      [],
    )
  })
})

test('Move keeps a source changed after destination publication and reports the duplicate', async () => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'igs-service-import-race-'))
  const database = openAppDatabase(dataRoot, migrations)
  try {
    const sourcePath = path.join(dataRoot, 'External.igs')
    await ProjectSession.create(sourcePath, 'External', {
      placeholdersDir,
      scratchDir: path.join(dataRoot, 'scratch'),
    })
    class ChangingSourceIndex extends ProjectIndexRepository {
      private changed = false

      override async indexSaved(filePath: string, workspaceId: string) {
        if (!this.changed) {
          this.changed = true
          await utimes(
            sourcePath,
            new Date('2000-01-01T00:00:00Z'),
            new Date('2000-01-01T00:00:00Z'),
          )
        }
        return await super.indexSaved(filePath, workspaceId)
      }
    }
    const repository = new ChangingSourceIndex(database.db)
    const service = new ProjectService({
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow: new ProjectShadowStore(path.join(dataRoot, 'autosave')),
    })
    const selected = await service.selectImport(sourcePath)
    assert.equal(selected.kind, 'transfer-required')
    if (selected.kind !== 'transfer-required') {
      return
    }
    const imported = await service.finishImport(selected.importId, 'move')
    assert.equal(imported.result.kind, 'opened')
    assert.equal(imported.sourceRetained, true)
    assert.match(imported.warning ?? '', /original file was kept/i)
    assert.equal((await readIgsPackage(sourcePath)).project.title, 'External')
    assert.equal((await repository.listProjects()).length, 1)
    if (imported.result.kind === 'opened') {
      await service.close(imported.result.tab.id)
    }
  } finally {
    await database.close()
    await rm(dataRoot, { force: true, recursive: true })
  }
})

test('failed source removal returns a retained-source warning after a valid destination commits', async () => {
  await withService(async ({ dataRoot, repository, shadow }) => {
    const sourcePath = path.join(dataRoot, 'External.igs')
    await ProjectSession.create(sourcePath, 'External', {
      placeholdersDir,
      scratchDir: path.join(dataRoot, 'scratch'),
    })
    const service = new ProjectService({
      dataRoot,
      removeImportedSource: async () => {
        throw new Error('simulated unlink failure')
      },
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow,
    })
    const selected = await service.selectImport(sourcePath)
    assert.equal(selected.kind, 'transfer-required')
    if (selected.kind !== 'transfer-required') {
      return
    }
    const imported = await service.finishImport(selected.importId, 'move')
    assert.equal(imported.result.kind, 'opened')
    assert.equal(imported.sourceRetained, true)
    assert.match(imported.warning ?? '', /original file was kept/i)
    assert.equal((await repository.listProjects()).length, 1)
    assert.equal((await readIgsPackage(sourcePath)).project.title, 'External')
    if (imported.result.kind === 'opened') {
      await service.close(imported.result.tab.id)
    }
  })
})

test('index failure after import publication keeps both valid files for Home rediscovery', async () => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'igs-service-import-index-'))
  const database = openAppDatabase(dataRoot, migrations)
  try {
    const sourcePath = path.join(dataRoot, 'External.igs')
    await ProjectSession.create(sourcePath, 'External', {
      placeholdersDir,
      scratchDir: path.join(dataRoot, 'scratch'),
    })
    const originalBytes = await readFile(sourcePath)
    class FailingImportIndex extends ProjectIndexRepository {
      private failed = false

      override async indexSaved(filePath: string, workspaceId: string) {
        if (!this.failed) {
          this.failed = true
          throw new Error('simulated index outage after copy')
        }
        return await super.indexSaved(filePath, workspaceId)
      }
    }
    const repository = new FailingImportIndex(database.db)
    const service = new ProjectService({
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow: new ProjectShadowStore(path.join(dataRoot, 'autosave')),
    })
    const selected = await service.selectImport(sourcePath)
    assert.equal(selected.kind, 'transfer-required')
    if (selected.kind !== 'transfer-required') {
      return
    }
    await assert.rejects(service.finishImport(selected.importId, 'move'), {
      code: 'PROJECT_IMPORTED_NOT_INDEXED',
    })
    assert.deepEqual(await readFile(sourcePath), originalBytes)
    assert.deepEqual(service.getOpenTabs(), [])
    const workspace = await repository.workspaceById('uncategorized')
    const files = await readdir(workspace.directoryPath)
    assert.deepEqual(files, ['External.igs'])
    assert.deepEqual(await readFile(path.join(workspace.directoryPath, files[0])), originalBytes)
    assert.equal((await service.list())[0].title, 'External')
  } finally {
    await database.close()
    await rm(dataRoot, { force: true, recursive: true })
  }
})

test('import rejects a symlinked file and a redirected workspace without publishing outside it', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const sourcePath = path.join(dataRoot, 'External.igs')
    await ProjectSession.create(sourcePath, 'External', {
      placeholdersDir,
      scratchDir: path.join(dataRoot, 'scratch'),
    })
    const linkedSource = path.join(dataRoot, 'Linked.igs')
    await symlink(sourcePath, linkedSource)
    await assert.rejects(service.selectImport(linkedSource), {
      code: 'PROJECT_IMPORT_INVALID_SOURCE',
    })
    const selected = await service.selectImport(sourcePath)
    assert.equal(selected.kind, 'transfer-required')
    if (selected.kind !== 'transfer-required') {
      return
    }
    const workspace = await repository.workspaceById('uncategorized')
    const elsewhere = path.join(dataRoot, 'elsewhere')
    await mkdir(elsewhere)
    await rename(workspace.directoryPath, `${workspace.directoryPath}.original`)
    await symlink(elsewhere, workspace.directoryPath)
    await assert.rejects(service.finishImport(selected.importId, 'copy'), {
      code: 'PROJECT_INVALID_PATH',
    })
    assert.deepEqual(await readdir(elsewhere), [])
    assert.equal((await readIgsPackage(sourcePath)).project.title, 'External')
  })
})

test('Raster Layer commands persist top-first order and properties through shadow, Save and reopen', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const { filePath, layerIds, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    const original = await readIgsPackage(filePath)
    assert.deepEqual(
      original.project.layers.map((layer) => layer.id),
      layerIds,
    )
    assert.equal(original.manifest.preview.status, 'unavailable')

    // The public service boundary must change the open document, while the saved .igs stays put
    // until Save. Each property and the list order must survive the independent loader.
    await service.updateRasterLayer(tabId, layerIds[0], { kind: 'visibility', visible: false })
    await service.updateRasterLayer(tabId, layerIds[1], { kind: 'opacity', opacity: 0.4 })
    await service.updateRasterLayer(tabId, layerIds[1], {
      blendMode: 'multiply',
      kind: 'blend-mode',
    })
    const moved = await service.moveRasterLayer(tabId, layerIds[1], 0)
    assert.deepEqual(
      moved.layers.map((layer) => layer.id),
      [layerIds[1], layerIds[0]],
    )
    const locked = await service.updateRasterLayer(tabId, layerIds[1], {
      kind: 'lock',
      locked: true,
    })
    assert.equal(locked.dirty, true)
    assert.deepEqual(
      locked.layers.map(({ blendMode, locked, opacity, visible }) => ({
        blendMode,
        locked,
        opacity,
        visible,
      })),
      [
        { blendMode: 'multiply', locked: true, opacity: 0.4, visible: true },
        { blendMode: 'normal', locked: false, opacity: 1, visible: false },
      ],
    )
    await service.flushAutosave(tabId)
    assert.deepEqual((await readIgsPackage(filePath)).project.layers, original.project.layers)
    const recovery = await shadow.inspect({ projectPath: filePath, savedPackage: original })
    assert.equal(recovery.status, 'recoverable')
    if (recovery.status === 'recoverable') {
      assert.deepEqual(
        recovery.document.layers.map((layer) => layer.id),
        [layerIds[1], layerIds[0]],
      )
      assert.equal(recovery.document.layers[0].blendMode, 'multiply')
      assert.equal(recovery.document.layers[1].visible, false)
    }

    assert.equal((await service.save(tabId)).tab.dirty, false)
    const saved = await readIgsPackage(filePath)
    assert.deepEqual(
      saved.project.layers.map((layer) => layer.id),
      [layerIds[1], layerIds[0]],
    )
    assert.equal(saved.project.layers[0].opacity, 0.4)
    assert.equal(saved.project.layers[0].locked, true)
    assert.equal(saved.project.layers[1].visible, false)
    assert.equal(saved.manifest.preview.status, 'unavailable')
    for (const layer of saved.project.layers) {
      assert.deepEqual(await saved.readMember(layer.asset.path), rasterPng)
    }
    await service.close(tabId)
    const reopened = await service.open(tabId)
    assert.equal(reopened.kind, 'opened')
    if (reopened.kind === 'opened') {
      assert.equal(reopened.tab.dirty, false)
      assert.deepEqual(
        reopened.tab.layers.map((layer) => layer.id),
        [layerIds[1], layerIds[0]],
      )
      assert.equal(reopened.tab.layers[0].blendMode, 'multiply')
      assert.equal(reopened.tab.layers[0].opacity, 0.4)
      assert.equal(reopened.tab.layers[0].locked, true)
      assert.equal(reopened.tab.layers[1].visible, false)
      await service.close(tabId)
    }
  })
})

test('Raster Layer commands reject invalid or locked edits and preserve a clean document on no-op', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const { filePath, layerIds, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    const before = await readIgsPackage(filePath)
    const beforeTabs = service.getOpenTabs()
    assert.equal(
      (
        await service.updateRasterLayer(tabId, layerIds[0], {
          kind: 'visibility',
          visible: true,
        })
      ).dirty,
      false,
    )
    assert.equal((await service.moveRasterLayer(tabId, layerIds[0], 0)).dirty, false)

    await assert.rejects(
      service.updateRasterLayer(tabId, randomUUID(), { kind: 'visibility', visible: false }),
      { code: 'PROJECT_LAYER_NOT_FOUND' },
    )
    for (const opacity of [-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      await assert.rejects(
        service.updateRasterLayer(tabId, layerIds[0], { kind: 'opacity', opacity }),
        { code: 'PROJECT_INVALID_INPUT' },
      )
    }
    for (const index of [-1, 2, 0.5]) {
      await assert.rejects(service.moveRasterLayer(tabId, layerIds[0], index), {
        code: 'PROJECT_INVALID_INPUT',
      })
    }
    assert.deepEqual(service.getOpenTabs(), beforeTabs)
    await service.flushAutosave(tabId)
    assert.deepEqual((await readIgsPackage(filePath)).project, before.project)
    assert.notEqual(
      (await shadow.inspect({ projectPath: filePath, savedPackage: before })).status,
      'recoverable',
    )

    await service.updateRasterLayer(tabId, layerIds[0], { kind: 'lock', locked: true })
    await assert.rejects(
      service.updateRasterLayer(tabId, layerIds[0], { kind: 'opacity', opacity: 0.5 }),
      { code: 'PROJECT_LAYER_LOCKED' },
    )
    await assert.rejects(service.moveRasterLayer(tabId, layerIds[0], 1), {
      code: 'PROJECT_LAYER_LOCKED',
    })
    assert.equal(service.getOpenTabs()[0].layers[0].opacity, 1)
    assert.deepEqual(
      service.getOpenTabs()[0].layers.map((layer) => layer.id),
      layerIds,
    )
  })
})

test('Save marks an all-hidden or zero-opacity raster Project empty without dropping layer assets', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const { filePath, layerIds, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    await service.updateRasterLayer(tabId, layerIds[0], { kind: 'visibility', visible: false })
    await service.updateRasterLayer(tabId, layerIds[1], { kind: 'opacity', opacity: 0 })
    await service.save(tabId)
    const empty = await readIgsPackage(filePath)
    assert.equal(empty.manifest.preview.status, 'empty')
    assert.ok((await service.list())[0]?.thumbnailUrl?.startsWith('igs-preview://thumbnail/'))
    assert.equal(empty.manifest.preview.rect, null)
    assert.equal(empty.project.layers.length, 2)
    for (const layer of empty.project.layers) {
      assert.deepEqual(await empty.readMember(layer.asset.path), rasterPng)
    }

    // One visible nonzero-opacity layer changes only the preview classification; pixels are still
    // saved intact when the worker is unavailable.
    await service.updateRasterLayer(tabId, layerIds[1], { kind: 'opacity', opacity: 0.01 })
    await service.save(tabId)
    const visible = await readIgsPackage(filePath)
    assert.equal(visible.manifest.preview.status, 'unavailable')
    assert.ok((await service.list())[0]?.thumbnailUrl?.startsWith('igs-preview://thumbnail/'))
    assert.deepEqual(visible.manifest.preview.rect, { height: 2, width: 2, x: 4, y: 0 })
    assert.deepEqual(await visible.readMember(visible.project.layers[1].asset.path), rasterPng)
  })
})

test('Save commits the current Project with placeholder previews when composition fails', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const { filePath, layerIds, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    await service.updateRasterLayer(tabId, layerIds[0], { kind: 'opacity', opacity: 0.5 })
    let called = false
    const saved = await service.save(tabId, {
      composePreview: async () => {
        called = true
        throw new ProjectWorkerError('WORKER_EXITED', 'The image worker exited.')
      },
    })

    assert.equal(called, true)
    assert.equal(saved.committed, true)
    assert.equal(saved.tab.dirty, false)
    const packageAfterFailure = await readIgsPackage(filePath)
    assert.equal(packageAfterFailure.manifest.preview.status, 'unavailable')
    assert.equal(packageAfterFailure.project.layers[0].opacity, 0.5)
    for (const layer of packageAfterFailure.project.layers) {
      assert.deepEqual(await packageAfterFailure.readMember(layer.asset.path), rasterPng)
    }
    assert.equal(
      (await readdir(path.join(dataRoot, 'scratch'))).some((entry) =>
        entry.startsWith('project-preview-'),
      ),
      false,
      'failed composition must not retain a frozen preview staging directory',
    )
  })
})

test('Save cannot classify a newer Raster Layer edit from an older empty worker result', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const { filePath, layerIds, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    const saved = await service.save(tabId, {
      composePreview: async () => {
        await service.updateRasterLayer(tabId, layerIds[0], { kind: 'opacity', opacity: 0.5 })
        return { merged: null, rect: null, status: 'empty', thumbnail: null }
      },
    })

    assert.equal(saved.committed, true)
    assert.equal(saved.tab.dirty, false)
    const reopened = await readIgsPackage(filePath)
    assert.equal(reopened.project.layers[0].opacity, 0.5)
    assert.equal(reopened.manifest.preview.status, 'unavailable')
    assert.deepEqual(await reopened.readMember(reopened.project.layers[0].asset.path), rasterPng)
  })
})

test('Rebuild Preview repairs a closed Project through the real package and index without changing document or assets', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const { filePath, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    await service.close(tabId)
    const before = await readIgsPackage(filePath)
    const documentBytes = await before.readMember('project.json')
    const assetBytes = await Promise.all(
      before.project.layers.map((layer) => before.readMember(layer.asset.path)),
    )
    const beforeIndex = (await repository.listProjects())[0]
    assert.equal(before.manifest.preview.status, 'unavailable')

    const rebuilt = await service.rebuildPreview(tabId, previewWorker())
    assert.equal(rebuilt.committed, true)
    assert.equal(rebuilt.indexWarning, undefined)
    const after = await readIgsPackage(filePath)
    assert.equal(after.manifest.preview.status, 'rendered')
    assert.deepEqual(after.manifest.preview.rect, { height: 2, width: 2, x: 0, y: 0 })
    assert.deepEqual(await after.readMember('preview/merged.png'), rasterPng)
    assert.deepEqual(await after.readMember('preview/thumbnail.webp'), previewWebp)
    assert.deepEqual(after.project, before.project)
    assert.deepEqual(await after.readMember('project.json'), documentBytes)
    for (const [index, layer] of after.project.layers.entries()) {
      assert.deepEqual(await after.readMember(layer.asset.path), assetBytes[index])
    }
    const indexed = (await repository.listProjects())[0]
    assert.equal(indexed.previewStatus, 'rendered')
    assert.equal(indexed.thumbnailSha256, createHash('sha256').update(previewWebp).digest('hex'))
    assert.notEqual(indexed.thumbnailSha256, beforeIndex.thumbnailSha256)
    const home = (await service.list())[0]
    assert.equal(home.previewStatus, 'rendered')
    assert.ok(home.thumbnailUrl?.startsWith('igs-preview://thumbnail/'))
    assert.deepEqual(service.getOpenTabs(), [])
  })
})

test('Rebuild Preview keeps a clean open tab usable for a later edit and Save', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const { filePath, layerIds, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    const before = service.getOpenTabs()[0]
    const revision = (await readIgsPackage(filePath)).project.documentRevision
    const rebuilt = await service.rebuildPreview(tabId, previewWorker())
    assert.equal(rebuilt.committed, true)
    assert.deepEqual(service.getOpenTabs(), [before])
    const previewed = await readIgsPackage(filePath)
    assert.equal(previewed.project.documentRevision, revision)
    assert.equal(previewed.manifest.preview.status, 'rendered')

    await service.updateRasterLayer(tabId, layerIds[0], { kind: 'opacity', opacity: 0.4 })
    const saved = await service.save(tabId)
    assert.equal(saved.committed, true)
    assert.equal(saved.tab.dirty, false)
    const after = await readIgsPackage(filePath)
    assert.equal(after.project.layers[0].opacity, 0.4)
    assert.deepEqual(await after.readMember(after.project.layers[0].asset.path), rasterPng)
    assert.equal((await repository.listProjects())[0].previewStatus, 'unavailable')
  })
})

test('Save and a second rebuild cannot replace a Project while its preview worker is running', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const { filePath, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    const oldPackage = await readFile(filePath)
    let signalStarted: () => void = () => undefined
    let releaseWorker: () => void = () => undefined
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve
    })
    const held = new Promise<void>((resolve) => {
      releaseWorker = resolve
    })
    const rebuilding = service.rebuildPreview(
      tabId,
      previewWorker(async () => {
        signalStarted()
        await held
      }),
    )
    try {
      await started
      await assert.rejects(service.save(tabId), { code: 'PROJECT_REBUILD_IN_PROGRESS' })
      await assert.rejects(service.rebuildPreview(tabId, previewWorker()), {
        code: 'PROJECT_REBUILD_IN_PROGRESS',
      })
      assert.deepEqual(await readFile(filePath), oldPackage)
    } finally {
      releaseWorker()
    }
    await rebuilding
    assert.equal((await readIgsPackage(filePath)).manifest.preview.status, 'rendered')
    assert.equal((await service.save(tabId)).committed, true)
  })
})

test('Rebuild Preview refuses a dirty Project before worker composition and preserves its recovery', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const { filePath, layerIds, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    const before = await readFile(filePath)
    await service.updateRasterLayer(tabId, layerIds[0], { kind: 'opacity', opacity: 0.4 })
    await service.flushAutosave(tabId)
    let composed = false
    await assert.rejects(
      service.rebuildPreview(tabId, {
        composePreview: async () => {
          composed = true
          throw new Error('A dirty Project must never reach the worker.')
        },
      }),
      { code: 'PROJECT_DIRTY' },
    )
    assert.equal(composed, false)
    assert.deepEqual(await readFile(filePath), before)
    assert.equal(service.getOpenTabs()[0].dirty, true)
    assert.equal(
      (
        await shadow.inspect({
          projectPath: filePath,
          savedPackage: await readIgsPackage(filePath),
        })
      ).status,
      'recoverable',
    )
  })
})

test('Rebuild Preview rejects pending recovery after a restart without asking the worker or replacing .igs', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const { filePath, layerIds, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    await service.updateRasterLayer(tabId, layerIds[0], { kind: 'opacity', opacity: 0.4 })
    await service.flushAutosave(tabId)
    const before = await readFile(filePath)
    const restarted = new ProjectService({
      autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow,
    })
    assert.equal((await restarted.list())[0].recoveryStatus, 'recoverable')
    let composed = false
    await assert.rejects(
      restarted.rebuildPreview(tabId, {
        composePreview: async () => {
          composed = true
          throw new Error('Recovery must block composition.')
        },
      }),
      { code: 'PROJECT_RECOVERY_REQUIRED' },
    )
    assert.equal(composed, false)
    assert.deepEqual(await readFile(filePath), before)
    assert.equal(
      (
        await shadow.inspect({
          projectPath: filePath,
          savedPackage: await readIgsPackage(filePath),
        })
      ).status,
      'recoverable',
    )
  })
})

test('Rebuild Preview worker failure leaves a closed Project and Home index unchanged', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const { filePath, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    await service.close(tabId)
    const before = await readFile(filePath)
    const indexBefore = (await repository.listProjects())[0]
    let composed = false
    await assert.rejects(
      service.rebuildPreview(tabId, {
        composePreview: async () => {
          composed = true
          throw new ProjectWorkerError('WORKER_EXITED', 'The preview worker exited.')
        },
      }),
      { code: 'WORKER_EXITED' },
    )
    assert.equal(composed, true)
    assert.deepEqual(await readFile(filePath), before)
    const after = await readIgsPackage(filePath)
    assert.equal(after.manifest.preview.status, 'unavailable')
    const indexAfter = (await repository.listProjects())[0]
    assert.equal(indexAfter.previewStatus, indexBefore.previewStatus)
    assert.equal(indexAfter.thumbnailSha256, indexBefore.thumbnailSha256)
    assert.equal(
      (await readdir(path.join(dataRoot, 'scratch'))).some((entry) =>
        entry.startsWith('project-preview-'),
      ),
      false,
    )
  })
})

test('Rebuild Preview cannot commit a worker result after a newer Project edit', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const { filePath, layerIds, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    const before = await readFile(filePath)
    await assert.rejects(
      service.rebuildPreview(
        tabId,
        previewWorker(async () => {
          await service.updateRasterLayer(tabId, layerIds[0], { kind: 'opacity', opacity: 0.4 })
        }),
      ),
      { code: 'PROJECT_DIRTY' },
    )
    assert.deepEqual(await readFile(filePath), before)
    assert.equal(service.getOpenTabs()[0].dirty, true)
    assert.equal(service.getOpenTabs()[0].layers[0].opacity, 0.4)
    await service.flushAutosave(tabId)
    assert.equal(
      (
        await shadow.inspect({
          projectPath: filePath,
          savedPackage: await readIgsPackage(filePath),
        })
      ).status,
      'recoverable',
    )
  })
})

test('Project image import adds a top layer at the bbox origin, exposes staged pixels, and survives recovery and Save', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const { filePath, layerIds, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    const bbox = { height: 512, width: 640, x: -40, y: 27 }
    await service.setPrimaryBbox(tabId, bbox)
    await service.save(tabId)
    const before = await readFile(filePath)
    const selectedFile = path.join(dataRoot, '  Foreground \n pass  .png')
    await writeFile(selectedFile, rasterPng)

    const imported = await service.importRasterImage(tabId, selectedFile, rasterImportWorker())
    assert.equal(imported.dirty, true)
    assert.deepEqual(imported.primaryBbox, bbox)
    assert.equal(imported.layers.length, 3)
    assert.deepEqual(
      imported.layers.slice(1).map((layer) => layer.id),
      layerIds,
    )
    const top = imported.layers[0]
    assert.equal(top.name, 'Foreground pass')
    assert.deepEqual(top.transform, {
      rotationDegrees: 0,
      scaleX: 1,
      scaleY: 1,
      x: bbox.x,
      y: bbox.y,
    })
    assert.deepEqual(await readFile(filePath), before, 'import must not replace the saved package')
    const imageRequest = parseProjectLayerImageUrl(top.imageUrl)
    assert.ok(imageRequest)
    const staged = service.getLayerAsset(imageRequest)
    assert.equal(staged?.kind, 'staged')
    if (staged?.kind !== 'staged') {
      throw new Error('Newly imported image has no coordinator-owned staged asset')
    }
    const response = await streamStagedProjectLayer(
      staged.source,
      staged.member,
      path.join(dataRoot, 'layer-responses'),
    )
    assert.equal(response.status, 200)
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), rasterPng)
    assert.equal(
      (await readdir(path.join(dataRoot, 'scratch'))).some((entry) =>
        entry.startsWith('raster-import-'),
      ),
      false,
      'source preparation must be disposed after coordinator adoption',
    )

    await service.flushAutosave(tabId)
    const savedBeforeCommit = await readIgsPackage(filePath)
    assert.equal(savedBeforeCommit.project.layers.length, 2)
    const recovery = await shadow.inspect({
      projectPath: filePath,
      savedPackage: savedBeforeCommit,
    })
    assert.equal(recovery.status, 'recoverable')
    if (recovery.status === 'recoverable') {
      assert.equal(recovery.document.layers[0].id, top.id)
      const pending = recovery.dirtyAssets[staged.member.path]
      assert.ok(pending && 'sourcePath' in pending)
      assert.deepEqual(await readFile(pending.sourcePath), rasterPng)
    }

    const committed = await service.save(tabId)
    assert.equal(committed.tab.dirty, false)
    const saved = await readIgsPackage(filePath)
    assert.deepEqual(saved.project.primaryBbox, bbox)
    assert.deepEqual(
      saved.project.layers.map((layer) => layer.id),
      [top.id, ...layerIds],
    )
    assert.deepEqual(await saved.readMember(staged.member.path), rasterPng)
    assert.equal(saved.manifest.preview.status, 'unavailable')
    assert.equal(service.getLayerAsset(imageRequest)?.kind, 'saved')
    await service.close(tabId)
    const reopened = await service.open(tabId)
    assert.equal(reopened.kind, 'opened')
    if (reopened.kind === 'opened') {
      assert.equal(reopened.tab.dirty, false)
      assert.deepEqual(
        reopened.tab.layers.map((layer) => layer.id),
        [top.id, ...layerIds],
      )
      assert.deepEqual(reopened.tab.primaryBbox, bbox)
      await service.close(tabId)
    }
  })
})

test('Project image import rejects a changed Project without overwriting its newer edit', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const created = await service.create({ height: 512, title: 'Import race', width: 512 })
    const filePath = (await repository.listProjects())[0].canonicalPath
    const savedBytes = await readFile(filePath)
    const selectedFile = path.join(dataRoot, 'late.png')
    await writeFile(selectedFile, rasterPng)
    const newerBbox = { height: 512, width: 512, x: 80, y: -18 }
    const worker = rasterImportWorker()
    await assert.rejects(
      service.importRasterImage(created.id, selectedFile, {
        normalizeImport: async (input) => {
          await service.setPrimaryBbox(created.id, newerBbox)
          return worker.normalizeImport(input)
        },
      }),
      { code: 'IMPORT_PROJECT_CHANGED' },
    )
    assert.deepEqual(service.getOpenTabs()[0].primaryBbox, newerBbox)
    assert.deepEqual(service.getOpenTabs()[0].layers, [])
    assert.deepEqual(await readFile(filePath), savedBytes)
    assert.equal(
      (await readdir(path.join(dataRoot, 'scratch'))).some((entry) =>
        entry.startsWith('raster-import-'),
      ),
      false,
    )
    await service.flushAutosave(created.id)
    const recovery = await shadow.inspect({
      projectPath: filePath,
      savedPackage: await readIgsPackage(filePath),
    })
    assert.equal(recovery.status, 'recoverable')
    if (recovery.status === 'recoverable') {
      assert.deepEqual(recovery.document.primaryBbox, newerBbox)
      assert.deepEqual(recovery.document.layers, [])
    }
  })
})

test('Project image import refuses an unsafe source or worker failure without dirtying the file', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const created = await service.create({ height: 512, title: 'Import failure', width: 512 })
    const filePath = (await repository.listProjects())[0].canonicalPath
    const savedBytes = await readFile(filePath)
    const selectedFile = path.join(dataRoot, 'selected.png')
    const symlinkedFile = path.join(dataRoot, 'selected-link.png')
    await writeFile(selectedFile, rasterPng)
    await symlink(selectedFile, symlinkedFile)
    let workerCalled = false
    await assert.rejects(
      service.importRasterImage(created.id, symlinkedFile, {
        normalizeImport: async () => {
          workerCalled = true
          throw new Error('unsafe path reached worker')
        },
      }),
      { code: 'IMPORT_SOURCE_UNAVAILABLE' },
    )
    assert.equal(workerCalled, false)
    await assert.rejects(
      service.importRasterImage(created.id, selectedFile, {
        normalizeImport: async () => {
          throw new ProjectWorkerError('WORKER_EXITED', 'The image worker exited.')
        },
      }),
      { code: 'WORKER_EXITED' },
    )
    assert.deepEqual(service.getOpenTabs()[0].layers, [])
    assert.equal(service.getOpenTabs()[0].dirty, false)
    assert.deepEqual(await readFile(filePath), savedBytes)
    assert.equal(
      (await readdir(path.join(dataRoot, 'scratch'))).some((entry) =>
        entry.startsWith('raster-import-'),
      ),
      false,
    )
    await assert.rejects(
      service.importRasterImage(`project-v1-${'0'.repeat(64)}`, selectedFile, rasterImportWorker()),
      { code: 'PROJECT_NOT_OPEN' },
    )
  })
})

test('exact LoRA stack edits preserve prompts through autosave recovery, Save, reopen and removal', async () => {
  await withService(
    async ({ dataRoot, modelRepository, modelService, repository, service, shadow }) => {
      const publish = async (modelId: number, versionId: number) => {
        const bytes = Buffer.from(`LoRA ${modelId}/${versionId}`)
        const managedPath = path.join(dataRoot, `lora-${versionId}.safetensors`)
        await writeFile(managedPath, bytes)
        const sha256 = createHash('sha256').update(bytes).digest('hex')
        const ids = await modelRepository.publishVerifiedInstallation({
          primary: {
            file: {
              managedPath,
              originalFilename: path.basename(managedPath),
              sha256,
              sizeBytes: bytes.length,
              verifiedAt: new Date().toISOString(),
            },
            resource: {
              displayName: `LoRA ${modelId}`,
              source: { kind: 'civitai', modelId },
              sourceMetadata: {},
              type: 'lora',
            },
            version: {
              baseModelFamily: 'illustrious',
              format: 'SafeTensor',
              name: `v${versionId}`,
              source: {
                expectedSha256: sha256,
                fileId: versionId + 1000,
                kind: 'civitai',
                versionId,
              },
              sourceMetadata: {},
            },
          },
        })
        return {
          ids: { resourceId: ids.resourceId, versionId: ids.versionId },
          managedPath,
          ref: await modelService.resolveGenerationLora(ids.resourceId, ids.versionId),
        }
      }
      const first = await publish(51, 51)
      const anotherVersion = await publish(51, 52)
      const neighbor = await publish(53, 53)
      const created = await service.create({ height: 512, title: 'LoRA persistence', width: 512 })
      const savedPath = (await repository.listProjects())[0].canonicalPath
      await service.updateGenerationDraft(created.id, {
        kind: 'positive-prompt',
        text: 'trigger phrase, portrait',
      })
      const baseline = await service.updateGenerationDraft(created.id, {
        kind: 'negative-prompt',
        text: 'trigger phrase, blur',
      })
      await service.addGenerationLora(created.id, first.ref)
      await service.addGenerationLora(created.id, neighbor.ref)
      await assert.rejects(service.addGenerationLora(created.id, anotherVersion.ref), {
        code: 'PROJECT_INVALID_INPUT',
      })
      await assert.rejects(
        service.addGenerationLora(created.id, { ...first.ref, kind: 'checkpoint' }),
        { code: 'PROJECT_INVALID_INPUT' },
      )
      let acknowledged = service.getOpenTabs().find((tab) => tab.id === created.id)!
      let release: (() => void) | undefined
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      let firstSend = true
      const sync = new ProjectDraftSync({
        onAcknowledged: (tab) => {
          acknowledged = tab
        },
        onError: (error) => {
          assert.fail(String(error))
        },
        onOverlay: () => {},
        send: async (id, change) => {
          if (firstSend) {
            firstSend = false
            await gate
          }
          return service.updateGenerationDraft(id, change)
        },
      })
      sync.change(acknowledged, { kind: 'lora-weight', ...first.ids, value: 0.25 })
      sync.change(acknowledged, { kind: 'lora-weight', ...neighbor.ids, value: 0.9 })
      sync.change(acknowledged, { kind: 'lora-weight', ...first.ids, value: 0.45 })
      sync.change(acknowledged, { kind: 'lora-enabled', ...first.ids, value: false })
      const flushed = sync.flush(created.id)
      release?.()
      await flushed
      assert.deepEqual(
        acknowledged.generationDraft.loras.map(({ enabled, weight }) => ({ enabled, weight })),
        [
          { enabled: false, weight: 0.45 },
          { enabled: true, weight: 0.9 },
        ],
      )
      await service.updateGenerationDraft(created.id, {
        kind: 'lora-weight',
        ...neighbor.ids,
        value: 0.7,
      })
      const weightChange = { kind: 'lora-weight' as const, ...first.ids, value: -0.35 }
      assert.equal(isProjectGenerationDraftChange(weightChange), true)
      for (const invalid of [
        { ...weightChange, value: NaN },
        { ...weightChange, value: Infinity },
        { ...weightChange, resource: first.ref },
        { ...weightChange, value: '0.3' },
        { ...weightChange, resourceId: '' },
      ]) {
        assert.equal(isProjectGenerationDraftChange(invalid), false)
        await assert.rejects(
          service.updateGenerationDraft(created.id, invalid as typeof weightChange),
          { code: 'PROJECT_INVALID_INPUT' },
        )
      }
      await service.updateGenerationDraft(created.id, weightChange)
      const changed = await service.updateGenerationDraft(created.id, {
        kind: 'lora-enabled',
        ...first.ids,
        value: false,
      })
      assert.deepEqual(changed.generationDraft.loras, [
        { enabled: false, resource: first.ref, weight: -0.35 },
        { enabled: true, resource: neighbor.ref, weight: 0.7 },
      ])
      assert.deepEqual(
        changed.generationDraft.positivePrompt,
        baseline.generationDraft.positivePrompt,
      )
      assert.deepEqual(
        changed.generationDraft.negativePrompt,
        baseline.generationDraft.negativePrompt,
      )
      await modelRepository.setDefaultVersion(first.ids.resourceId, anotherVersion.ids.versionId)
      await service.flushAutosave(created.id)
      assert.deepEqual((await readIgsPackage(savedPath)).project.generationDraft.loras, [])
      const restarted = new ProjectService({
        autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
        dataRoot,
        repository,
        roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
        shadow,
      })
      assert.equal((await restarted.open(created.id)).kind, 'recovery-required')
      const recovered = await restarted.resolveRecovery(created.id, 'recover')
      assert.deepEqual(recovered.generationDraft, changed.generationDraft)
      await restarted.save(created.id)
      const saved = await readIgsPackage(savedPath)
      assert.deepEqual(saved.project.generationDraft, changed.generationDraft)
      // Repeating the same value is a genuine no-op (no new dirty revision).
      assert.equal((await restarted.updateGenerationDraft(created.id, weightChange)).dirty, false)
      await restarted.close(created.id)
      await rm(first.managedPath)
      const reopened = await restarted.open(created.id)
      assert.equal(reopened.kind, 'opened')
      if (reopened.kind !== 'opened') {
        throw new Error('LoRA project did not reopen')
      }
      assert.deepEqual(reopened.tab.generationDraft, changed.generationDraft)
      await assert.rejects(
        restarted.updateGenerationDraft(created.id, {
          ...weightChange,
          versionId: anotherVersion.ids.versionId,
        }),
        { code: 'PROJECT_INVALID_INPUT' },
      )
      const removed = await restarted.removeGenerationLora(created.id, first.ids)
      assert.deepEqual(removed.generationDraft.loras, [
        { enabled: true, resource: neighbor.ref, weight: 0.7 },
      ])
      assert.deepEqual(
        removed.generationDraft.positivePrompt,
        baseline.generationDraft.positivePrompt,
      )
      assert.deepEqual(
        removed.generationDraft.negativePrompt,
        baseline.generationDraft.negativePrompt,
      )
      await assert.rejects(restarted.removeGenerationLora(created.id, first.ids), {
        code: 'PROJECT_INVALID_INPUT',
      })
      await restarted.save(created.id)
      assert.deepEqual(
        (await readIgsPackage(savedPath)).project.generationDraft,
        removed.generationDraft,
      )
      await restarted.close(created.id)
    },
  )
})

test('portable LoRA relink across two libraries changes only local IDs through recovery and Save', async () => {
  const bytes = Buffer.from('exact portable LoRA bytes')
  await withService(async (origin) => {
    const installed = await publishPortableResource(
      origin.modelRepository,
      origin.dataRoot,
      bytes,
      'Original LoRA',
      'epsilon',
      'lora',
    )
    const neighborInstalled = await publishPortableResource(
      origin.modelRepository,
      origin.dataRoot,
      Buffer.from('neighbor LoRA'),
      'Neighbor',
      'epsilon',
      'lora',
      931,
    )
    const originalRef = await origin.modelService.resolveGenerationLora(
      installed.resourceId,
      installed.versionId,
    )
    const neighbor = await origin.modelService.resolveGenerationLora(
      neighborInstalled.resourceId,
      neighborInstalled.versionId,
    )
    const identity = { resourceId: originalRef.localModelId, versionId: originalRef.localVersionId }
    const created = await origin.service.create({ height: 512, title: 'Portable LoRA', width: 512 })
    await origin.service.addGenerationLora(created.id, originalRef)
    await origin.service.addGenerationLora(created.id, neighbor)
    await origin.service.updateGenerationDraft(created.id, {
      ...identity,
      kind: 'lora-weight',
      value: -0.35,
    })
    await origin.service.updateGenerationDraft(created.id, {
      ...identity,
      kind: 'lora-enabled',
      value: false,
    })
    await origin.service.updateGenerationDraft(created.id, {
      kind: 'positive-prompt',
      text: 'original LoRA trigger, portrait',
    })
    const baseline = await origin.service.updateGenerationDraft(created.id, {
      kind: 'negative-prompt',
      text: 'original LoRA trigger, blur',
    })
    await origin.service.save(created.id)
    const sourcePath = (await origin.repository.listProjects())[0].canonicalPath
    const sourceBytes = await readFile(sourcePath)
    await origin.service.close(created.id)

    await withService(async (destination) => {
      const local = await publishPortableResource(
        destination.modelRepository,
        destination.dataRoot,
        bytes,
        'Renamed at destination',
        'v_prediction',
        'lora',
      )
      const incomingPath = path.join(destination.dataRoot, 'Incoming LoRA.igs')
      await writeFile(incomingPath, sourceBytes)
      const importChoice = await destination.service.selectImport(incomingPath)
      assert.equal(importChoice.kind, 'transfer-required')
      if (importChoice.kind !== 'transfer-required') {
        throw new Error('Expected portable import')
      }
      const imported = await destination.service.finishImport(importChoice.importId, 'copy')
      assert.equal(imported.result.kind, 'opened')
      if (imported.result.kind !== 'opened') {
        throw new Error('Expected open Project')
      }
      const tabId = imported.result.tab.id
      const savedPath = (await destination.repository.listProjects())[0].canonicalPath
      assert.notEqual(local.resourceId, identity.resourceId)
      assert.notEqual(local.versionId, identity.versionId)
      assert.deepEqual(imported.result.tab.generationDraft, baseline.generationDraft)
      const initialCopy = await readFile(savedPath)
      assert.equal(imported.result.tab.dirty, false)
      const resolvedLocal = await destination.modelService.resolveGenerationLora(
        local.resourceId,
        local.versionId,
      )
      await assert.rejects(destination.service.addGenerationLora(tabId, resolvedLocal), {
        code: 'PROJECT_INVALID_INPUT',
      })
      await assert.rejects(
        destination.service.relinkGenerationLora(tabId, identity, async (saved) => ({
          ...(await destination.modelService.resolvePortableGenerationLora(saved)),
          civitaiFileId: 9999,
        })),
        { code: 'PROJECT_LORA_RELINK_MISMATCH' },
      )
      assert.equal(destination.service.getOpenTabs()[0].dirty, false)

      const linked = await destination.service.relinkGenerationLora(
        tabId,
        identity,
        async (saved) => ({
          ...(await destination.modelService.resolvePortableGenerationLora(saved)),
          displayName: 'Must not replace saved name',
          predictionType: 'sample',
          versionName: 'Must not replace version',
        }),
      )
      const expected = {
        ...baseline.generationDraft,
        loras: baseline.generationDraft.loras.map((entry, index) =>
          index === 0
            ? {
                ...entry,
                resource: {
                  ...entry.resource,
                  localModelId: local.resourceId,
                  localVersionId: local.versionId,
                },
              }
            : entry,
        ),
      }
      assert.equal(linked.dirty, true)
      assert.deepEqual(linked.generationDraft, expected)
      await destination.service.flushAutosave(tabId)
      assert.deepEqual(await readFile(savedPath), initialCopy)
      const restarted = new ProjectService({
        autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
        dataRoot: destination.dataRoot,
        repository: destination.repository,
        roots: { placeholdersDir, scratchDir: path.join(destination.dataRoot, 'scratch') },
        shadow: destination.shadow,
      })
      assert.equal((await restarted.open(tabId)).kind, 'recovery-required')
      assert.deepEqual(
        (await restarted.resolveRecovery(tabId, 'recover')).generationDraft,
        expected,
      )
      await restarted.save(tabId)
      assert.deepEqual((await readIgsPackage(savedPath)).project.generationDraft, expected)
      await restarted.close(tabId)
      const reopened = await restarted.open(tabId)
      assert.equal(reopened.kind, 'opened')
      if (reopened.kind !== 'opened') {
        throw new Error('Expected saved Project')
      }
      assert.deepEqual(reopened.tab.generationDraft, expected)
      assert.equal(
        (
          await restarted.relinkGenerationLora(
            tabId,
            { resourceId: local.resourceId, versionId: local.versionId },
            (saved) => destination.modelService.resolvePortableGenerationLora(saved),
          )
        ).dirty,
        false,
      )
      await assert.rejects(
        restarted.relinkGenerationLora(tabId, identity, (saved) =>
          destination.modelService.resolvePortableGenerationLora(saved),
        ),
        { code: 'PROJECT_INVALID_INPUT' },
      )
      assert.deepEqual(await readFile(incomingPath), sourceBytes)
      await restarted.close(tabId)
    })
  })
})

for (const concurrentAction of ['edit', 'remove', 'close-reopen'] as const) {
  test(`LoRA relink rejects completion after ${concurrentAction}, including a no-op match`, async () => {
    await withService(async ({ dataRoot, modelRepository, modelService, service }) => {
      const installed = await publishPortableResource(
        modelRepository,
        dataRoot,
        Buffer.from('LoRA for late relink'),
        'LoRA',
        'epsilon',
        'lora',
      )
      const resource = await modelService.resolveGenerationLora(
        installed.resourceId,
        installed.versionId,
      )
      const identity = { resourceId: resource.localModelId, versionId: resource.localVersionId }
      const created = await service.create({ height: 512, title: 'Late relink', width: 512 })
      await service.addGenerationLora(created.id, resource)
      await service.save(created.id)
      let release!: () => void
      let signalStarted!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const started = new Promise<void>((resolve) => {
        signalStarted = resolve
      })
      const linking = service.relinkGenerationLora(created.id, identity, async (saved) => {
        signalStarted()
        await gate
        return modelService.resolvePortableGenerationLora(saved)
      })
      await started
      if (concurrentAction === 'edit') {
        await service.updateGenerationDraft(created.id, {
          ...identity,
          kind: 'lora-weight',
          value: 0.25,
        })
      } else if (concurrentAction === 'remove') {
        await service.removeGenerationLora(created.id, identity)
      } else {
        await service.close(created.id)
        assert.equal((await service.open(created.id)).kind, 'opened')
      }
      const beforeCompletion = service.getOpenTabs()[0]
      release()
      await assert.rejects(linking, { code: 'EDIT_CONFLICT' })
      assert.deepEqual(service.getOpenTabs()[0], beforeCompletion)
      await service.save(created.id)
      await service.close(created.id)
    })
  })
}

test('LoRA relink refuses an existing portable duplicate without merging rows or dirtying the document', async () => {
  await withService(async ({ dataRoot, modelRepository, modelService, service }) => {
    const local = await publishPortableResource(
      modelRepository,
      dataRoot,
      Buffer.from('duplicate LoRA'),
      'Local name',
      'epsilon',
      'lora',
    )
    const ref = await modelService.resolveGenerationLora(local.resourceId, local.versionId)
    const copied = {
      ...ref,
      displayName: 'Copied name',
      localModelId: randomUUID(),
      localVersionId: randomUUID(),
    }
    const document = createEmptyProjectDocumentV1({ title: 'Duplicate portable references' })
    document.generationDraft.loras = [
      { enabled: false, resource: copied, weight: -0.6 },
      { enabled: true, resource: ref, weight: 0.9 },
    ]
    const input = path.join(dataRoot, 'Duplicate source.igs')
    const preview = await readProjectPlaceholders(placeholdersDir, 'empty')
    await saveIgsPackage(input, {
      assets: {},
      preview: { ...preview, rect: null, status: 'empty' },
      project: document,
    })
    const selection = await service.selectImport(input)
    if (selection.kind !== 'transfer-required') {
      throw new Error('Expected import choice')
    }
    const imported = await service.finishImport(selection.importId, 'copy')
    if (imported.result.kind !== 'opened') {
      throw new Error('Expected copied Project')
    }
    const tabId = imported.result.tab.id
    const copiedIdentity = { resourceId: copied.localModelId, versionId: copied.localVersionId }
    await assert.rejects(
      service.relinkGenerationLora(tabId, copiedIdentity, (saved) =>
        modelService.resolvePortableGenerationLora(saved),
      ),
      { code: 'PROJECT_INVALID_INPUT' },
    )
    assert.deepEqual(service.getOpenTabs()[0], imported.result.tab)
    await service.removeGenerationLora(tabId, {
      resourceId: ref.localModelId,
      versionId: ref.localVersionId,
    })
    const linked = await service.relinkGenerationLora(tabId, copiedIdentity, (saved) =>
      modelService.resolvePortableGenerationLora(saved),
    )
    assert.deepEqual(linked.generationDraft.loras, [
      {
        enabled: false,
        resource: { ...copied, localModelId: ref.localModelId, localVersionId: ref.localVersionId },
        weight: -0.6,
      },
    ])
    await service.save(tabId)
    await service.close(tabId)
  })
})
