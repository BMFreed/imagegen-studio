import {
  createEmptyProjectDocumentV1,
  type IgsProjectDocumentV1,
} from '../../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { openAppDatabase } from '../../db/database.js'
import { CivitaiClient } from '../../models/civitai-client.js'
import { CivitaiTokenStore } from '../../models/civitai-token-store.js'
import { ModelRepository } from '../../models/model-repository.js'
import { ModelService } from '../../models/model-service.js'
import { animaLoraFixture } from '../../models/test-fixtures/anima-lora.js'
import { GenerationStagingRepository } from '../generation-staging.js'
import { readIgsPackage, saveIgsPackage } from '../igs-package.js'
import { ProjectAutosaveLeaseRegistry } from '../project-autosave.js'
import { ProjectIndexRepository } from '../project-index.js'
import { readProjectPlaceholders } from '../project-placeholders.js'
import { ProjectService } from '../project-service.js'
import { ProjectShadowStore } from '../project-shadow.js'
import { ProjectWorkerClient } from '../worker-client.js'
import { acceptedOutputPngFixture } from './accepted-provenance.js'

const migrations = path.resolve('src/main/db/migrations')
const placeholdersDir = path.resolve('src/main/projects/placeholders')
const devPython = path.resolve('worker-python/.venv/bin/python')
const checkpointPrefix = Buffer.from('Anima checkpoint structural collaborator fixture')
const qwenBytes = Buffer.from('exact tiny trusted Qwen fixture')
const vaeBytes = Buffer.from('exact tiny trusted Wan fixture')

export type AnimaPublishedFixture = {
  bytes: Buffer
  managedPath: string
  reference: ExactReference
}
export interface AnimaProjectPreparationFixture {
  database: ReturnType<typeof openAppDatabase>
  first: AnimaPublishedFixture
  importProject: (input?: {
    draft?: Partial<IgsProjectDocumentV1['generationDraft']>
    lastActualSeedSnapshot?: number | null
    raster?: boolean
  }) => Promise<{ document: IgsProjectDocumentV1; packagePath: string; tabId: string }>
  lora: AnimaPublishedFixture
  modelRepository: ModelRepository
  modelService: ModelService
  qualificationCalls: string[]
  qwen: { managedPath: string; versionId: string }
  root: string
  scratch: string
  second: AnimaPublishedFixture
  seedReads: { documentId: string; localProjectKey: string }[]
  service: ProjectService
  setQualificationHook: (hook?: (managedPath: string) => Promise<void>) => void
  setSeedReadHook: (hook?: () => Promise<void>) => void
  shadow: ProjectShadowStore
  staging: GenerationStagingRepository
  vae: { managedPath: string; versionId: string }
  worker: ProjectWorkerClient
}

type ExactReference = NonNullable<IgsProjectDocumentV1['generationDraft']['model']>

export function animaFixtureSha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function animaProjectComposerAvailable(): boolean {
  return existsSync(devPython)
}

/**
 * Real SQL/model-file/dependency ownership, portable writer/import/loader and derivatives worker.
 * Only the trusted multi-GB companion identities and checkpoint structural qualifier use tiny
 * substitutes. Ordinary LoRA header qualification is real. This does not prove native inference.
 */
export async function withAnimaProjectPreparationFixture(
  use: (fixture: AnimaProjectPreparationFixture) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-anima-project-preparation-'))
  const scratch = path.join(root, 'scratch')
  await mkdir(scratch)
  const database = openAppDatabase(root, migrations)
  const modelRepository = new ModelRepository(database.db)
  const projectRepository = new ProjectIndexRepository(database.db)
  const staging = new GenerationStagingRepository(database.db, root)
  await staging.recoverAfterRestart()
  const shadow = new ProjectShadowStore(path.join(root, 'autosave'))
  const qualificationCalls: string[] = []
  const seedReads: { documentId: string; localProjectKey: string }[] = []
  let qualificationHook: ((managedPath: string) => Promise<void>) | undefined
  let seedReadHook: (() => Promise<void>) | undefined
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
      root,
    ),
    undefined,
    undefined,
    undefined,
    undefined,
    {
      checkpointQualifier: async (managedPath) => {
        qualificationCalls.push(managedPath)
        assert.ok(
          (await readFile(managedPath))
            .subarray(0, checkpointPrefix.length)
            .equals(checkpointPrefix),
        )
        await qualificationHook?.(managedPath)
      },
      qwen3Encoder: { sha256: animaFixtureSha256(qwenBytes), sizeBytes: qwenBytes.length },
      vae: { sha256: animaFixtureSha256(vaeBytes), sizeBytes: vaeBytes.length },
    },
  )
  const service = new ProjectService({
    autosaveOptions: { debounceMs: 0, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    dataRoot: root,
    readLastActualSeed: async (localProjectKey, documentId) => {
      seedReads.push({ documentId, localProjectKey })
      await seedReadHook?.()
      return await staging.readLastActualSeed(localProjectKey, documentId)
    },
    repository: projectRepository,
    roots: { placeholdersDir, scratchDir: scratch },
    shadow,
  })
  let worker: ProjectWorkerClient | undefined
  try {
    async function component(role: 'qwen3_encoder' | 'vae', bytes: Buffer) {
      const managedPath = path.join(root, `${role}.safetensors`)
      await writeFile(managedPath, bytes)
      const installed = await modelRepository.publishVerifiedInstallation({
        primary: {
          file: {
            managedPath,
            originalFilename: path.basename(managedPath),
            sha256: animaFixtureSha256(bytes),
            sizeBytes: bytes.length,
            verifiedAt: '2026-10-05T00:00:00.000Z',
          },
          resource: {
            displayName: `Fixture ${role}`,
            source: { key: `anima-fixture:${role}`, kind: 'supported_dependency' },
            sourceMetadata: {},
            type: role,
          },
          version: {
            baseModelFamily: 'anima',
            format: 'safetensors',
            name: 'Pinned fixture',
            predictionType: null,
            source: {
              expectedSha256: animaFixtureSha256(bytes),
              kind: 'supported_dependency',
              revision: 'fixture-v1',
            },
            sourceMetadata: {},
          },
        },
      })
      return { managedPath, versionId: installed.versionId }
    }
    const qwen = await component('qwen3_encoder', qwenBytes)
    const vae = await component('vae', vaeBytes)
    async function publish(
      kind: 'checkpoint' | 'lora',
      version: number,
    ): Promise<AnimaPublishedFixture> {
      const bytes =
        kind === 'lora'
          ? animaLoraFixture()
          : Buffer.concat([checkpointPrefix, Buffer.from(` v${version}`)])
      const managedPath = path.join(root, `${kind}-${version}.safetensors`)
      await writeFile(managedPath, bytes)
      const installed = await modelRepository.publishVerifiedInstallation({
        ...(kind === 'checkpoint'
          ? {
              dependencies: [
                { existingVersionId: qwen.versionId, role: 'qwen3_encoder' as const },
                { existingVersionId: vae.versionId, role: 'vae' as const },
              ],
            }
          : {}),
        primary: {
          file: {
            managedPath,
            originalFilename: path.basename(managedPath),
            sha256: animaFixtureSha256(bytes),
            sizeBytes: bytes.length,
            verifiedAt: '2026-10-05T00:00:00.000Z',
          },
          resource: {
            displayName: `Catalog ${kind}`,
            source: { kind: 'civitai', modelId: kind === 'checkpoint' ? 42 : 43 },
            sourceMetadata: {},
            type: kind,
          },
          version: {
            baseModelFamily: 'anima',
            format: 'safetensors',
            name: `Catalog v${version}`,
            predictionType: null,
            source: {
              expectedSha256: animaFixtureSha256(bytes),
              fileId: version * 100,
              kind: 'civitai',
              versionId: version,
            },
            sourceMetadata: {},
          },
        },
      })
      return {
        bytes,
        managedPath,
        reference: {
          baseModelFamily: 'anima',
          civitaiFileId: version * 100,
          civitaiModelId: kind === 'checkpoint' ? 42 : 43,
          civitaiVersionId: version,
          displayName: `Copied ${kind} label`,
          fileSha256: animaFixtureSha256(bytes),
          kind,
          localModelId: installed.resourceId,
          localVersionId: installed.versionId,
          predictionType: null,
          versionName: `Copied v${version}`,
        },
      }
    }
    const first = await publish('checkpoint', 7)
    const second = await publish('checkpoint', 8)
    const lora = await publish('lora', 9)
    worker = await ProjectWorkerClient.start(
      { pythonExecutable: devPython, runtimeRoot: devRuntimeRoot(), stagingBasePath: scratch },
      { requestTimeoutMs: 15_000 },
    )
    const importProject: AnimaProjectPreparationFixture['importProject'] = async (input = {}) => {
      const document = createEmptyProjectDocumentV1({
        primaryBbox: { height: 64, width: 64, x: 7, y: -3 },
        title: `Anima preparation ${randomUUID()}`,
      })
      document.generationDraft = {
        ...document.generationDraft,
        dynamicPrompt: { maxPrompts: 2, seedBehavior: 'per-iteration' },
        loras: [{ enabled: true, resource: lora.reference, weight: -0.5 }],
        model: first.reference,
        negativePrompt: { embeddingRefs: [], text: '(blur:0.5)' },
        positivePrompt: { embeddingRefs: [], text: '(lantern:1.5) {red|blue}' },
        sampling: {
          animaMethod: 'heun',
          cfgScale: 5,
          denoisingStrength: input.raster ? 0.5 : null,
          sampler: 'DPM++ 2M',
          scheduler: 'Karras',
          steps: 4,
        },
        seed: { policy: 'fixed', value: 0xff_ff_ff_ff },
        ...input.draft,
      }
      document.lastActualSeedSnapshot = input.lastActualSeedSnapshot ?? null
      const bytes = input.raster ? await acceptedOutputPngFixture(64, 64) : undefined
      const id = randomUUID()
      const assetPath = `assets/layers/${id}.png`
      if (bytes) {
        document.layers = [
          {
            asset: {
              bytes: bytes.length,
              height: 64,
              path: assetPath,
              sha256: animaFixtureSha256(bytes),
              width: 64,
            },
            blendMode: 'normal',
            id,
            kind: 'raster',
            locked: false,
            name: 'Exact opaque source',
            opacity: 1,
            transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 7, y: -3 },
            visible: true,
          },
        ]
      }
      const externalPath = path.join(root, `${randomUUID()}.igs`)
      await saveIgsPackage(externalPath, {
        assets: bytes ? { [assetPath]: { bytes } } : {},
        preview: {
          ...(await readProjectPlaceholders(placeholdersDir, bytes ? 'unavailable' : 'empty')),
          rect: bytes ? document.primaryBbox : null,
          status: bytes ? 'unavailable' : 'empty',
        },
        project: document,
      })
      const selected = await service.selectImport(externalPath)
      assert.equal(selected.kind, 'transfer-required')
      if (selected.kind !== 'transfer-required') {
        throw new Error('Expected portable transfer')
      }
      const imported = await service.finishImport(selected.importId, 'copy')
      assert.equal(imported.result.kind, 'opened')
      if (imported.result.kind !== 'opened') {
        throw new Error('Expected imported Project to open')
      }
      const tabId = imported.result.tab.id
      const record = (await projectRepository.listProjects()).find(
        (row) => row.localProjectKey === tabId,
      )
      assert.ok(record)
      assert.deepEqual((await readIgsPackage(record.canonicalPath)).project, document)
      return { document, packagePath: record.canonicalPath, tabId }
    }
    await use({
      database,
      first,
      importProject,
      lora,
      modelRepository,
      modelService,
      qualificationCalls,
      qwen,
      root,
      scratch,
      second,
      seedReads,
      service,
      setQualificationHook: (hook) => {
        qualificationHook = hook
      },
      setSeedReadHook: (hook) => {
        seedReadHook = hook
      },
      shadow,
      staging,
      vae,
      worker,
    })
  } finally {
    for (const tab of service.getOpenTabs()) {
      await service.discardAndClose(tab.id)
    }
    await worker?.close()
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

function devRuntimeRoot(): string {
  const executable = realpathSync(devPython).split(path.sep)
  const requested = devPython.split(path.sep)
  let common = 0
  while (executable[common] === requested[common] && common < requested.length) {
    common++
  }
  const root = requested.slice(0, common).join(path.sep) || path.sep
  assert.notEqual(root, path.sep)
  return root
}
