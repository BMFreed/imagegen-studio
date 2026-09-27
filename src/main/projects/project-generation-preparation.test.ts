import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import {
  createEmptyProjectDocumentV1,
  type IgsProjectDocumentV1,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { CivitaiClient } from '../models/civitai-client.js'
import { CivitaiTokenStore } from '../models/civitai-token-store.js'
import { ModelRepository } from '../models/model-repository.js'
import { ModelService } from '../models/model-service.js'
import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { prepareNormalTxt2Img } from './project-generation-preparation.js'
import { ProjectIndexRepository } from './project-index.js'
import { readProjectPlaceholders } from './project-placeholders.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
import { ProjectWorkerClient } from './worker-client.js'

const migrations = path.resolve('src/main/db/migrations')
const placeholdersDir = path.resolve('src/main/projects/placeholders')
const devPython = path.resolve('worker-python/.venv/bin/python')
const sourcePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGO06bnDwMDAxMDAwMDAAAATOgGonVuaBAAAAABJRU5ErkJggg==',
  'base64',
)
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
type ExactRef = NonNullable<IgsProjectDocumentV1['generationDraft']['model']>

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

async function withService(
  run: (context: {
    dataRoot: string
    modelRepository: ModelRepository
    modelService: ModelService
    projectRepository: ProjectIndexRepository
    service: ProjectService
    worker: ProjectWorkerClient
  }) => Promise<void>,
): Promise<void> {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-preparation-'))
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
  const projectRepository = new ProjectIndexRepository(database.db)
  const service = new ProjectService({
    autosaveOptions: { debounceMs: 0, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    dataRoot,
    repository: projectRepository,
    roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
    shadow: new ProjectShadowStore(path.join(dataRoot, 'autosave')),
  })
  let worker: ProjectWorkerClient | undefined
  try {
    await mkdir(path.join(dataRoot, 'scratch'))
    worker = await ProjectWorkerClient.start(
      {
        pythonExecutable: devPython,
        runtimeRoot: devRuntimeRoot()!,
        stagingBasePath: path.join(dataRoot, 'scratch'),
      },
      { requestTimeoutMs: 15_000 },
    )
    await run({ dataRoot, modelRepository, modelService, projectRepository, service, worker })
  } finally {
    await worker?.close()
    await database.close()
    await rm(dataRoot, { force: true, recursive: true })
  }
}

async function publishResource(
  repository: ModelRepository,
  dataRoot: string,
  input: {
    bytes: Buffer
    civitaiModelId: number
    civitaiVersionId: number
    kind: 'checkpoint' | 'embedding' | 'lora' | 'vae'
  },
) {
  const managedPath = path.join(
    dataRoot,
    `${input.kind}-${input.civitaiModelId}-${input.civitaiVersionId}.safetensors`,
  )
  await writeFile(managedPath, input.bytes)
  const digest = sha256(input.bytes)
  const supportedDependency = input.kind === 'vae'
  const published = await repository.publishVerifiedInstallation({
    primary: {
      file: {
        managedPath,
        originalFilename: path.basename(managedPath),
        sha256: digest,
        sizeBytes: input.bytes.length,
        verifiedAt: new Date().toISOString(),
      },
      resource: {
        displayName: `${input.kind} ${input.civitaiModelId}`,
        source: supportedDependency
          ? { key: `anima/${input.kind}-${input.civitaiModelId}`, kind: 'supported_dependency' }
          : { kind: 'civitai', modelId: input.civitaiModelId },
        sourceMetadata: {},
        type: input.kind,
      },
      version: {
        baseModelFamily: supportedDependency ? 'anima' : 'illustrious',
        format: 'SafeTensor',
        name: `v${input.civitaiVersionId}`,
        predictionType: input.kind === 'checkpoint' ? 'epsilon' : null,
        source: supportedDependency
          ? {
              expectedSha256: digest,
              kind: 'supported_dependency',
              revision: `v${input.civitaiVersionId}`,
            }
          : {
              expectedSha256: digest,
              fileId: input.civitaiVersionId + 1000,
              kind: 'civitai',
              versionId: input.civitaiVersionId,
            },
        sourceMetadata: {},
      },
    },
  })
  const reference: ExactRef = {
    baseModelFamily: supportedDependency ? 'anima' : 'illustrious',
    civitaiFileId: supportedDependency ? null : input.civitaiVersionId + 1000,
    civitaiModelId: supportedDependency ? null : input.civitaiModelId,
    civitaiVersionId: supportedDependency ? null : input.civitaiVersionId,
    displayName: `${input.kind} ${input.civitaiModelId}`,
    fileSha256: digest,
    kind: input.kind,
    localModelId: published.resourceId,
    localVersionId: published.versionId,
    predictionType: input.kind === 'checkpoint' ? 'epsilon' : null,
    versionName: `v${input.civitaiVersionId}`,
  }
  return { managedPath, published, reference }
}

/** A real portable package enters through ProjectService's public Copy import path. */
async function importProject(
  service: ProjectService,
  dataRoot: string,
  input: {
    draft?: Partial<IgsProjectDocumentV1['generationDraft']>
    model: ExactRef
    name: string
    raster?: boolean
  },
): Promise<{ document: IgsProjectDocumentV1; tabId: string }> {
  const empty = createEmptyProjectDocumentV1({
    primaryBbox: { height: 2, width: 2, x: 7, y: -3 },
    title: input.name,
  })
  const layerId = randomUUID()
  const assetPath = `assets/layers/${layerId}.png`
  const document: IgsProjectDocumentV1 = {
    ...empty,
    generationDraft: {
      ...empty.generationDraft,
      model: input.model,
      negativePrompt: { embeddingRefs: [], text: 'low quality' },
      positivePrompt: { embeddingRefs: [], text: 'blue lantern' },
      sampling: { ...empty.generationDraft.sampling, cfgScale: 7.5, steps: 24 },
      seed: { policy: 'fixed', value: 0xff_ff_ff_ff },
      ...input.draft,
    },
    layers: input.raster
      ? [
          {
            asset: {
              bytes: sourcePng.length,
              height: 2,
              path: assetPath,
              sha256: sha256(sourcePng),
              width: 2,
            },
            blendMode: 'normal',
            id: layerId,
            kind: 'raster',
            locked: false,
            name: 'Opaque source',
            opacity: 1,
            transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 7, y: -3 },
            visible: true,
          },
        ]
      : [],
  }
  const externalPath = path.join(dataRoot, `${input.name}.igs`)
  const placeholders = await readProjectPlaceholders(
    placeholdersDir,
    input.raster ? 'unavailable' : 'empty',
  )
  await saveIgsPackage(externalPath, {
    assets: input.raster ? { [assetPath]: { bytes: sourcePng } } : {},
    preview: {
      ...placeholders,
      rect: input.raster ? { height: 2, width: 2, x: 7, y: -3 } : null,
      status: input.raster ? 'unavailable' : 'empty',
    },
    project: document,
  })
  const selected = await service.selectImport(externalPath)
  assert.equal(selected.kind, 'transfer-required')
  if (selected.kind !== 'transfer-required') {
    throw new Error('Fixture import did not request a transfer.')
  }
  const transferred = await service.finishImport(selected.importId, 'copy')
  assert.equal(transferred.result.kind, 'opened')
  if (transferred.result.kind !== 'opened') {
    throw new Error('Fixture Project was not opened.')
  }
  return { document, tabId: transferred.result.tab.id }
}

test(
  'real Project, SQLite and worker freeze an exact txt2img context across concurrent edits',
  { skip: !devRuntimeRoot() },
  async () => {
    await withService(
      async ({ dataRoot, modelRepository, modelService, projectRepository, service, worker }) => {
        const first = await publishResource(modelRepository, dataRoot, {
          bytes: Buffer.from('first exact Illustrious checkpoint'),
          civitaiModelId: 610,
          civitaiVersionId: 611,
          kind: 'checkpoint',
        })
        const second = await publishResource(modelRepository, dataRoot, {
          bytes: Buffer.from('second exact Illustrious checkpoint'),
          civitaiModelId: 610,
          civitaiVersionId: 612,
          kind: 'checkpoint',
        })
        const exact = await modelService.resolveGenerationCheckpoint(
          first.published.resourceId,
          first.published.versionId,
        )
        const { document, tabId } = await importProject(service, dataRoot, {
          model: exact,
          name: 'frozen-context',
        })
        const indexed = (await projectRepository.listProjects())[0]
        assert.equal(
          (await readIgsPackage(indexed.canonicalPath)).project.documentRevision,
          document.documentRevision,
        )

        const prepared = await service.prepareNormalTxt2ImgContext(
          tabId,
          {
            composeTarget: async (input) => {
              assert.deepEqual(input.bbox, { height: 2, width: 2, x: 7, y: -3 })
              assert.deepEqual(input.layers, [])
              await service.updateGenerationDraft(tabId, {
                kind: 'positive-prompt',
                text: 'changed after capture',
              })
              await service.updateGenerationDraft(tabId, {
                kind: 'seed',
                policy: 'random',
                value: null,
              })
              await service.updateGenerationDraft(tabId, {
                kind: 'sampling-steps',
                value: 50,
              })
              await service.setPrimaryBbox(tabId, { height: 2, width: 2, x: 31, y: 42 })
              await modelService.setDefaultVersion(
                second.published.resourceId,
                second.published.versionId,
              )
              return await worker.composeTarget(input)
            },
          },
          modelService,
        )

        assert.equal(prepared.context.kind, 'normal-txt2img-preparation')
        assert.equal(prepared.context.documentId, document.documentId)
        assert.equal(prepared.context.documentRevision, document.documentRevision)
        assert.deepEqual(prepared.context.bbox, document.primaryBbox)
        assert.deepEqual(prepared.context.prompts, {
          negative: 'low quality',
          positive: 'blue lantern',
        })
        assert.deepEqual(prepared.context.sampling, {
          cfgScale: 7.5,
          requestedSeedPolicy: 'fixed',
          seed: 0xff_ff_ff_ff,
          steps: 24,
        })
        assert.deepEqual(prepared.context.model, {
          managedPath: first.managedPath,
          reference: exact,
        })
        assert.equal(
          (await modelRepository.listInstalled())[0].defaultVersionId,
          second.published.versionId,
        )
        assert.equal(
          service.getOpenTabs()[0].generationDraft.positivePrompt.text,
          'changed after capture',
        )
        assert.deepEqual(service.getOpenTabs()[0].generationDraft.seed, {
          policy: 'random',
          value: null,
        })
        assert.equal(service.getOpenTabs()[0].generationDraft.sampling.steps, 50)
        assert.deepEqual(service.getOpenTabs()[0].primaryBbox, {
          height: 2,
          width: 2,
          x: 31,
          y: 42,
        })
        assert.equal(
          (await readIgsPackage(indexed.canonicalPath)).project.documentRevision,
          document.documentRevision,
        )
        assert.equal(prepared.context.target.sha256, sha256(prepared.targetPngBytes))
        assert.equal(prepared.context.target.byteSize, prepared.targetPngBytes.length)
        assert.equal(prepared.context.target.iccSha256, IGS_SRGB_ICC_SHA256)
        assert.equal(prepared.context.target.width, 2)
        assert.equal(prepared.context.target.height, 2)
        assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(prepared.context)).target).sort(), [
          'byteSize',
          'colorSpace',
          'format',
          'height',
          'iccSha256',
          'sha256',
          'width',
        ])
        assert.equal(
          (await readdir(path.join(dataRoot, 'scratch'))).some((entry) =>
            entry.startsWith('project-target-'),
          ),
          false,
        )
        assert.ok(
          prepared.targetPngBytes.length > 0,
          'Verified target bytes outlive scratch cleanup',
        )

        const source = await service.prepareNormalGenerationInput(tabId, worker)
        const originalTargetBytes = Buffer.from(source.composite.bytes)
        const originalBbox = { ...source.bbox }
        const originalPrompt = source.generationDraft.positivePrompt.text
        const originalSteps = source.generationDraft.sampling.steps
        const copied = await prepareNormalTxt2Img({
          modelService: {
            resolveVerifiedGenerationCheckpointForPlan: async (saved) => {
              // Mutation during real async file verification must not change the captured plan.
              source.composite.bytes.fill(0)
              source.composite.sha256 = '0'.repeat(64)
              source.composite.width = 999
              source.generationDraft.positivePrompt.text = 'late mutation during verification'
              source.generationDraft.sampling.steps = 123
              source.bbox.x = 999
              return await modelService.resolveVerifiedGenerationCheckpointForPlan(saved)
            },
          },
          randomUint32: () => 7,
          target: source,
        })
        assert.deepEqual(copied.targetPngBytes, originalTargetBytes)
        assert.equal(copied.context.target.sha256, sha256(originalTargetBytes))
        assert.equal(copied.context.target.width, originalBbox.width)
        assert.deepEqual(copied.context.bbox, originalBbox)
        assert.equal(copied.context.prompts.positive, originalPrompt)
        assert.equal(copied.context.sampling.steps, originalSteps)
      },
    )
  },
)

test(
  'real Project preparation rejects non-txt2img, unsupported resources/settings and unavailable seeds',
  { skip: !devRuntimeRoot() },
  async () => {
    await withService(async ({ dataRoot, modelRepository, modelService, service, worker }) => {
      const installed = await publishResource(modelRepository, dataRoot, {
        bytes: Buffer.from('one exact model for failure cases'),
        civitaiModelId: 620,
        civitaiVersionId: 621,
        kind: 'checkpoint',
      })
      const model = await modelService.resolveGenerationCheckpoint(
        installed.published.resourceId,
        installed.published.versionId,
      )
      const loraInstalled = await publishResource(modelRepository, dataRoot, {
        bytes: Buffer.from('one LoRA file for active and disabled cases'),
        civitaiModelId: 630,
        civitaiVersionId: 631,
        kind: 'lora',
      })
      const lora = await modelService.resolveGenerationLora(
        loraInstalled.published.resourceId,
        loraInstalled.published.versionId,
      )
      const embedding = await publishResource(modelRepository, dataRoot, {
        bytes: Buffer.from('one installed embedding for a saved prompt sidecar'),
        civitaiModelId: 632,
        civitaiVersionId: 633,
        kind: 'embedding',
      })
      const vae = await publishResource(modelRepository, dataRoot, {
        bytes: Buffer.from('one installed VAE for an unsupported override'),
        civitaiModelId: 634,
        civitaiVersionId: 635,
        kind: 'vae',
      })
      const goodSampling = {
        cfgScale: 7.5,
        denoisingStrength: null,
        sampler: null,
        scheduler: null,
        steps: 24,
      }
      const cases: {
        code: string
        draft?: Partial<IgsProjectDocumentV1['generationDraft']>
        name: string
        raster?: boolean
      }[] = [
        { code: 'GENERATION_MODE_UNSUPPORTED', name: 'opaque-img2img', raster: true },
        {
          code: 'GENERATION_LORA_UNSUPPORTED',
          draft: { loras: [{ enabled: true, resource: lora, weight: 0.7 }] },
          name: 'active-lora',
        },
        {
          code: 'GENERATION_EMBEDDING_UNSUPPORTED',
          draft: {
            positivePrompt: {
              embeddingRefs: [{ resource: embedding.reference, token: '<lamp>' }],
              text: 'blue lantern <lamp>',
            },
          },
          name: 'embedding-ref',
        },
        {
          code: 'GENERATION_ADVANCED_UNSUPPORTED',
          draft: { vae: vae.reference },
          name: 'vae-override',
        },
        {
          code: 'GENERATION_ADVANCED_UNSUPPORTED',
          draft: { cfgRescale: 0.3 },
          name: 'advanced-option',
        },
        {
          code: 'GENERATION_SAMPLING_REQUIRED',
          draft: { sampling: { ...goodSampling, steps: null } },
          name: 'missing-steps',
        },
        {
          code: 'GENERATION_SAMPLING_REQUIRED',
          draft: { sampling: { ...goodSampling, cfgScale: null } },
          name: 'missing-cfg',
        },
        {
          code: 'GENERATION_SAMPLING_UNSUPPORTED',
          draft: { sampling: { ...goodSampling, sampler: 'euler' } },
          name: 'unqualified-sampler',
        },
        {
          code: 'GENERATION_SEED_UNAVAILABLE',
          draft: { seed: { policy: 'reuse', value: null } },
          name: 'reuse-without-cursor',
        },
      ]
      for (const scenario of cases) {
        const { tabId } = await importProject(service, dataRoot, {
          ...scenario,
          model,
        })
        if (scenario.draft) {
          let workerCalled = false
          await assert.rejects(
            service.prepareNormalTxt2ImgContext(
              tabId,
              {
                composeTarget: async () => {
                  workerCalled = true
                  throw new Error('Worker unavailable')
                },
              },
              modelService,
            ),
            { code: scenario.code },
            `${scenario.name} should fail before worker composition`,
          )
          assert.equal(workerCalled, false)
        }
        await assert.rejects(
          service.prepareNormalTxt2ImgContext(tabId, worker, modelService),
          { code: scenario.code },
          scenario.name,
        )
        await service.discardAndClose(tabId)
      }

      // A disabled LoRA is retained in the document but contributes nothing to this first request.
      const disabled = await importProject(service, dataRoot, {
        draft: { loras: [{ enabled: false, resource: lora, weight: 0.7 }] },
        model,
        name: 'disabled-lora-control',
      })
      const disabledPrepared = await service.prepareNormalTxt2ImgContext(
        disabled.tabId,
        worker,
        modelService,
      )
      assert.equal(disabledPrepared.context.model.reference.localVersionId, model.localVersionId)
      await service.discardAndClose(disabled.tabId)

      const random = await importProject(service, dataRoot, {
        draft: { seed: { policy: 'random', value: null } },
        model,
        name: 'random-seed-control',
      })
      const randomPrepared = await service.prepareNormalTxt2ImgContext(
        random.tabId,
        worker,
        modelService,
        () => 0,
      )
      assert.deepEqual(randomPrepared.context.sampling, {
        cfgScale: 7.5,
        requestedSeedPolicy: 'random',
        seed: 0,
        steps: 24,
      })
      await service.discardAndClose(random.tabId)
    })
  },
)

test(
  'preparation refuses a changed worker target and an installed checkpoint with stale bytes',
  { skip: !devRuntimeRoot() },
  async () => {
    await withService(async ({ dataRoot, modelRepository, modelService, service, worker }) => {
      const installed = await publishResource(modelRepository, dataRoot, {
        bytes: Buffer.from('checkpoint whose bytes can change in place'),
        civitaiModelId: 640,
        civitaiVersionId: 641,
        kind: 'checkpoint',
      })
      const model = await modelService.resolveGenerationCheckpoint(
        installed.published.resourceId,
        installed.published.versionId,
      )
      const { tabId } = await importProject(service, dataRoot, {
        model,
        name: 'integrity-guards',
      })
      await assert.rejects(
        service.prepareNormalTxt2ImgContext(
          tabId,
          {
            composeTarget: async (input) => {
              const result = await worker.composeTarget(input)
              const bytes = await readFile(input.targetPngPath)
              bytes[bytes.length - 1] ^= 1
              await writeFile(input.targetPngPath, bytes)
              return result
            },
          },
          modelService,
        ),
        /changed while being verified/,
      )

      const original = await readFile(installed.managedPath)
      const damaged = Buffer.from(original)
      damaged[0] ^= 1
      await writeFile(installed.managedPath, damaged)
      await assert.rejects(service.prepareNormalTxt2ImgContext(tabId, worker, modelService), {
        code: 'MODEL_FILE_CORRUPT',
      })
      assert.equal(service.getOpenTabs()[0].dirty, false)
    })
  },
)
