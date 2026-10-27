/**
 * ROOT-only producer for the immutable apple/mug experiment. Importing this module runs nothing.
 * ROOT owns provisioning, execution, process supervision, qualification and cleanup. This helper
 * grants no public generation admission and performs no native denoising or trained-weight writes.
 *
 * CLI: pnpm exec tsx src/main/projects/test-fixtures/regional-guidance-natural-text-probe.ts --run
 * EXACT_RUN --source EXACT_SOURCE ROOT must explicitly select its already provisioned derivatives
 * worker with IGS_TRAINED_PROBE_PYTHON and IGS_TRAINED_PROBE_RUNTIME_ROOT; neither has a fallback.
 *
 * Frozen consumer API: authoredDocument is the COMPLETE detached saved/reopened document, with
 * ordered regionalGuidance[2] in every case. Baseline disables both; assignment/swapped enable
 * both. Swap changes only prompts.positive.text. Only seed/enabled/text and documentRevision differ
 * across documents. checkpoint.resolved is the actual Main resolver result. Complete recipes are
 * detached without rewriting; Uint8Array uses `{ __test_alpha8_b64__: string }` only.
 */
import { IGS_SRGB_ICC_SHA256 } from '../../../shared/projects/color-profile.js'
import { planGenerationBatch } from '../../../shared/projects/generation-batch-plan.js'
import { resolveIllustriousScheduler } from '../../../shared/projects/illustrious-scheduler.js'
import {
  type IgsProjectDocumentV1,
  type IgsRectV1,
  type IgsRegionalGuidanceV1,
  parseProjectDocumentV1,
} from '../../../shared/projects/project-schema.js'
import type { GenerationPrompt } from '../../../shared/projects/prompt-embeddings.js'

import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { inflateSync } from 'node:zlib'

import { openAppDatabase } from '../../db/database.js'
import { CivitaiClient } from '../../models/civitai-client.js'
import { CivitaiTokenStore } from '../../models/civitai-token-store.js'
import { CHECKPOINT_COMPATIBILITY_MANIFEST } from '../../models/model-compatibility-manifest.js'
import { ModelRepository } from '../../models/model-repository.js'
import { ModelService } from '../../models/model-service.js'
import { type IgsAssetSource, readIgsPackage, validateSrgbPngStream } from '../igs-package.js'
import { ProjectAutosaveLeaseRegistry } from '../project-autosave.js'
import {
  type CurrentCanvasRegionalRecipe,
  prepareCurrentCanvasRegionalRecipe,
} from '../project-current-canvas-regional-recipe.js'
import { ProjectIndexRepository } from '../project-index.js'
import { encodeProjectMaskPng } from '../project-mask.js'
import { ProjectService } from '../project-service.js'
import { ProjectShadowStore } from '../project-shadow.js'
import { classifyTargetPngAlpha } from '../target-png-mode.js'
import { ProjectWorkerClient } from '../worker-client.js'

const REPO = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/\/$/, '')
const EXACT_RUN =
  '/home/user/.codex/artifacts/imagegen-studio/runs/regional-guidance-visual/20261027-apple-mug'
const EXACT_SOURCE =
  '/home/user/.codex/artifacts/imagegen-studio/shared/illustrious-epsilon-source-20261026/Illustrious-XL-v0.1.safetensors'
const BASE = '166ecdd4ceaedbe0905e1a2ce310141707c9df5c'
const CONTRACT_SHA256 = 'd97bfe4944659c956be0c30d66f5e77ce533026192836d6f4aa3578917b4495c'
const CHECKPOINT_SHA256 = '3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9'
const CHECKPOINT_BYTES = 6_938_040_760
const BBOX: IgsRectV1 = { height: 1024, width: 1024, x: -13, y: 5 }
const GLOBAL_POSITIVE =
  'a still life of a red apple and a blue ceramic mug on a plain table, two separate objects, soft studio lighting'
const LEFT_POSITIVE = 'a single red apple'
const RIGHT_POSITIVE = 'a single blue ceramic mug'
const CONDITIONS = ['baseline', 'assignment', 'swapped'] as const
const SEEDS = [123, 124] as const
type Condition = (typeof CONDITIONS)[number]
type VariantName = `seed${(typeof SEEDS)[number]}-${Condition}`
type Resolution = Awaited<ReturnType<ModelService['resolveVerifiedGenerationCheckpointForPlan']>>
type Capture = Parameters<Parameters<ProjectService['withCapturedRegionalGuidanceInput']>[1]>[0]

// Relevant unchanged Main dependencies, not the author's file or the Python owner's work.
const SOURCE_PINS: Readonly<Record<string, string>> = {
  'src/main/db/database.ts': 'cf505e68087f72226a03dc28c3ff0d985f8a297a9067d5b139427cda75e4cb9c',
  'src/main/models/civitai-client.ts':
    'd3cfe63a0cc3f6aa77bfc765f8b0a03e10ae6ad55a2e5b0c413808b72460f82f',
  'src/main/models/civitai-token-store.ts':
    'b86c2aec19570f2cad39bcbbd059f0556302a39b0fc72adc55d192fc5c68f00c',
  'src/main/models/model-compatibility-manifest.ts':
    'ca655e0447f743ca3691c8d50acfef682dd29b987d4fdc20220d8741a397fe29',
  'src/main/models/model-repository.ts':
    '05062c27e4707ee489a3facb0d6b1cf47cc87902cc986531528c31fe5e13b28a',
  'src/main/models/model-service.ts':
    'bebe21d7417d94a649c8236e6697505c13922959b24a2bebfcc12f6ef1f87d6a',
  'src/main/models/sdxl-checkpoint-qualification.ts':
    '0d164b3e483404a6f0a6c2c28da7b45909cf834ab7f99b0ac2f56216803d170e',
  'src/main/projects/igs-package.ts':
    '91520b438362e78fd88b14da387ea20be020bdbbb2c57449ceba1b4b72eed3e4',
  'src/main/projects/project-autosave.ts':
    '8d0af189cc3af0b0c3cd21f99e3ca8353138b56384f5db0b74263f9137f342d1',
  'src/main/projects/project-current-canvas-regional-recipe.ts':
    'ba9f24e8abcfb4ee459ca2cf9408beec3d84541457162cb3a1f00963578d5a75',
  'src/main/projects/project-generation-target.ts':
    '9784f488878af81053b1782e1d56415944f1cc931e9808ac49facaa4a9d18d52',
  'src/main/projects/project-index.ts':
    '0fa6ea107d5bf12e5721b46f866b3685a7211ac7b239a7486f7a8f12e503a7c4',
  'src/main/projects/project-mask.ts':
    'f7d4ab3516d3c0906d4c787227797be3d67553f4b7b5a25ffc06d1ba5a80ca6c',
  'src/main/projects/project-raster-snapshot.ts':
    'd3b0aa93e427e8b49b4145a2d83bbeca196447e4dabbfc6e1da44857c08b48fc',
  'src/main/projects/project-regional-guidance-coverage.ts':
    'ee71fd5e7f2b8af83a03ad5fc929cf76e819800f39db955ef3772486d9b82e31',
  'src/main/projects/project-regional-guidance-input.ts':
    '106105d74c2d8d495dc44c794d2897d1276e4d8b947cf2fc4003c523e0aa3a7b',
  'src/main/projects/project-service.ts':
    'c63584110abd6a95cd679de7e3baf8f2ff3b1ab87acca86fab504cc4d22cac10',
  'src/main/projects/project-session.ts':
    'cdbdfcb30d165243a3bef9cd6a53e1d4da6e381ebb153bce50ba6514dd7877b0',
  'src/main/projects/project-shadow.ts':
    'e9cc7016fa1d7240120a260cdb6851b68af9fb6db43a6e80359faaedd45239a7',
  'src/main/projects/target-png-mode.ts':
    '3ebb6abcacbf630bd6646cd31794b3b0a93b21fbeb8a8877e26d8e30afc2335a',
  'src/main/projects/worker-client.ts':
    '3908530c56a49baf1bec0cfb8869a04c732f6d7dec8bab503888e346fe2f3d89',
  'src/shared/projects/color-profile.ts':
    '8cedfbe3dd2c71bb9426aa8b01e957342dc36f8f8583d607aa401d6c21d2d212',
  'src/shared/projects/generation-batch-plan.ts':
    '7a09eb5ef914f93629857524baa173dab846a143b164979d55daa478839eef67',
  'src/shared/projects/illustrious-noise-profile.ts':
    '5a5f70ff64821ac693779b51c8f2a733ffe4f51f56dce807438263799c51385f',
  'src/shared/projects/illustrious-scheduler.ts':
    '0347df28475ebe691663d0291420a205527d122c56be8399fb77cc45738daeb3',
  'src/shared/projects/project-schema.ts':
    'f33e7fe87380574e78bd02537121c19328878d93dc97485e997ed6e4508be112',
  'src/shared/projects/prompt-embeddings.ts':
    '17bbec6bafdc632776989207dce8976346679b24d009408fa2699baaa5cc4d4d',
}
const MIGRATION_PINS: Readonly<Record<string, string>> = {
  '0001_app_metadata.sql': '669962741a9de6f42386d0454b77c6954b2acfc4a866a3ddfbe23c7d99d7d165',
  '0002_models.sql': '782b38312e1975fcc59e78046a8f2d7fd8c5a01d273e7cba5dde93efde0b0d73',
  '0003_projects.sql': 'ea2ed500c83f0bdcc36138ed1ae65783c67ed3e0399d305718c5d56e31fd5d83',
  '0004_project_thumbnails.sql': '698545759b6ae89c907d80dbb23e2e88893128eb22aa704d2f75d66178fadb55',
  '0005_generation_queue.sql': '947beb8f5dc053de6108b90900b8ca1c53ae629d5663b3a46fd64fddaa7b4d77',
  '0006_generation_staging.sql': '109601391b618696788cd41c37999640134ae865f845d4cfb704f892f352030e',
  '0007_checkpoint_prediction_override.sql':
    '1c8c15c53ac28607ae7e2e409867e6a39b1841b311f88d86eda791134116346b',
  '0008_generation_staging_discard.sql':
    '49af5f31bdab37cbe42adaccc07d4fa6fd174fb9d44ea3de868ab4dc8f768974',
  '0009_generation_seed_document.sql':
    '9b36ac5d0be7ca0dc42158ea667e84502cec08c20f49a794fccf9dd88c8fe98c',
  '0010_generation_acceptance_journal.sql':
    'ea22f7d43c6bde7c0ad9542d27cc5af5f88ba81e8731fdc97510873d16d38a24',
  '0011_saved_accepted_result_index.sql':
    'a49deada2802d42d1d409472c9cdb154b379b0ae47b843c12e68b4c365144b32',
  '0012_accepted_result_catalog_order.sql':
    'bab9b78dd769f053ff5854866028aa1610036a768bf49b976988792b411382aa',
  '0013_illustrious_img2img_queue.sql':
    '69fdecee1e12c5e7359e4440b9b2381c42c772d3d4453f1a15f3949dbf871472',
  '0014_anima_generation_queue.sql':
    'a00bacbf1fe441888ed8852151c7552902a7e9d4f02d084d094f5ba5070d5abe',
  '0015_outpaint_generation_queue.sql':
    '60e5cbfd28bcafed618b72950e78559f7f2e6f4f128d8986010406a7e9979980',
  '0016_checkpoint_noise_profile_override.sql':
    'de93960515810663a010044ba8772581d694ecaf80efc185e06f007c1db2824a',
  '0017_presets.sql': 'a47862df5f54b57b1822bb1ae74ca9628ba82e4db91bfa54becfd7ac5f6e5dbd',
  '0018_smart_patch_generation_queue.sql':
    'aca2d6d4bc853d4e42437bc37f22657cf0ba4ba40e5a68797ee146d5c698a13f',
  '0019_smart_patch_raster_history_geometry.sql':
    'e16ae1c459c552476d4a9ac2cb530aebfc5fe02135f5e637016485860d65f0ca',
}

const digest = (bytes: string | Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex')
const prompt = (text: string): GenerationPrompt => ({ embeddingRefs: [], text })
const encodeTransport = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    item instanceof Uint8Array
      ? { __test_alpha8_b64__: Buffer.from(item).toString('base64') }
      : item,
  )
const sameBytes = (actual: Uint8Array, expected: Uint8Array, message: string): void => {
  assert.ok(Buffer.from(actual).equals(Buffer.from(expected)), message)
}

interface TargetMode {
  alphaClassification: 'all-zero'
  bbox: IgsRectV1
  byteSize: number
  colorSpace: 'srgb'
  documentId: string
  documentRevision: string
  height: number
  iccSha256: string
  independentAlphaSha256: string
  independentRgbaSha256: string
  mode: 'txt2img'
  relativePng: string
  sha256: string
  width: number
}

interface Variant {
  authoredDocument: IgsProjectDocumentV1
  captureAssetDescriptors: {
    member: Capture['assets'][number]['member']
    regionId: string
    role: 'mask'
  }[]
  checkpointResolution: Resolution
  durableStateSha256: string
  durableUnchanged: true
  packageManifest: Awaited<ReturnType<typeof readIgsPackage>>['manifest']
  packageMembers: Record<string, string>
  packageSha256: string
  recipe: CurrentCanvasRegionalRecipe
  recipeSha256: string
  targetMode: TargetMode
}

/** Execute only under ROOT's explicit experiment/process/lifecycle ownership. */
export async function produceRegionalGuidanceNaturalTextProbe(options: {
  run: string
  source: string
}): Promise<void> {
  assert.equal(options.run, EXACT_RUN, 'The immutable experiment requires the exact explicit --run')
  assert.equal(
    options.source,
    EXACT_SOURCE,
    'The immutable experiment requires the exact explicit --source',
  )
  const { run, source } = options
  await canonicalDirectory(run)
  await canonicalDirectory(REPO)
  const sourceStat = await lstat(source)
  assert.ok(sourceStat.isFile() && !sourceStat.isSymbolicLink())
  assert.equal(await realpath(source), source)
  assert.equal(sourceStat.size, CHECKPOINT_BYTES)
  const contractBytes = await readFile(path.join(run, 'experiment-contract.json'))
  assert.equal(digest(contractBytes), CONTRACT_SHA256)
  const contract: unknown = JSON.parse(contractBytes.toString('utf8'))
  assert.ok(contract && typeof contract === 'object')
  for (const [key, expected] of Object.entries({
    base: BASE,
    cfg: 5,
    checkpointSha256: CHECKPOINT_SHA256,
    fixedBeforeNativeExecution: true,
    geometry: BBOX,
    globalCoverage: 'Everywhere for both signs, explicit experiment input, not product default',
    globalNegative: '',
    globalPositive: GLOBAL_POSITIVE,
    layout: 'cfg-negative-first',
    leftPrompt: LEFT_POSITIVE,
    pooledSources: 'current-canvas for both signs',
    prediction: 'epsilon',
    regionalNegative: 'explicit local empty',
    rightPrompt: RIGHT_POSITIVE,
    sampler: 'euler',
    schema: 'regional-natural-text-visual-experiment-v1',
    seeds: SEEDS,
    steps: 30,
    variants: CONDITIONS,
  })) {
    assert.deepEqual(Reflect.get(contract, key), expected, `Immutable scene mismatch: ${key}`)
  }
  const sourcePins = await verifySources()
  const manifest = CHECKPOINT_COMPATIBILITY_MANIFEST.filter(
    (record) => record.sha256 === CHECKPOINT_SHA256 && record.sizeBytes === CHECKPOINT_BYTES,
  )
  assert.equal(manifest.length, 1)
  assert.equal(manifest[0].baseModelFamily, 'illustrious')
  assert.equal(manifest[0].predictionType, 'epsilon')

  const pythonExecutable = process.env.IGS_TRAINED_PROBE_PYTHON
  const runtimeRoot = process.env.IGS_TRAINED_PROBE_RUNTIME_ROOT
  assert.ok(
    pythonExecutable && path.isAbsolute(pythonExecutable),
    'ROOT must select IGS_TRAINED_PROBE_PYTHON',
  )
  assert.ok(
    runtimeRoot && path.isAbsolute(runtimeRoot),
    'ROOT must select IGS_TRAINED_PROBE_RUNTIME_ROOT',
  )
  await canonicalDirectory(runtimeRoot)
  // Refuse any old/partial output before creating either fresh producer subtree.
  const outputRoot = path.join(run, 'main-natural')
  const payloadParent = path.join(run, 'payloads')
  const data = path.join(payloadParent, 'main-natural')
  await assertAbsent(outputRoot)
  await assertAbsent(data)
  try {
    await mkdir(payloadParent, { mode: 0o700 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error
    }
  }
  await canonicalDirectory(payloadParent)
  await mkdir(data, { mode: 0o700 })
  await canonicalDirectory(data)
  await mkdir(outputRoot, { mode: 0o700 })
  await canonicalDirectory(outputRoot)
  const targetsRoot = path.join(outputRoot, 'targets')
  await mkdir(targetsRoot)
  const scratch = path.join(data, 'scratch')
  const shadowRoot = path.join(data, 'autosave')
  await mkdir(scratch)
  const database = openAppDatabase(data, path.join(REPO, 'src/main/db/migrations'))
  const service = new ProjectService({
    autosaveOptions: { debounceMs: 60_000, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    dataRoot: data,
    repository: new ProjectIndexRepository(database.db),
    roots: {
      placeholdersDir: path.join(REPO, 'src/main/projects/placeholders'),
      scratchDir: scratch,
    },
    shadow: new ProjectShadowStore(shadowRoot),
  })
  const repository = new ModelRepository(database.db)
  let networkAttempts = 0
  const offline = async (): Promise<never> => {
    networkAttempts++
    throw new Error('The ROOT-only natural-text producer cannot access the network')
  }
  const tokenStore = new CivitaiTokenStore(
    {
      decryptStringAsync: async () => {
        throw new Error('This producer cannot read tokens')
      },
      encryptStringAsync: async () => {
        throw new Error('This producer cannot write tokens')
      },
      getSelectedStorageBackend: () => 'test-only-storage',
      isAsyncEncryptionAvailable: async () => false,
    },
    data,
  )
  // No fake qualification, manifest injection, model repair or embedding catalog.
  const models = new ModelService(repository, new CivitaiClient(offline), tokenStore)
  const variants: Partial<Record<VariantName, Variant>> = {}
  const orderedVariantLabels: VariantName[] = []
  let worker: ProjectWorkerClient | undefined
  let workerReady: unknown
  let checkpoint:
    | {
        byteSize: number
        reference: Resolution['reference']
        resolved: Resolution
        sha256: string
        sourcePath: string
      }
    | undefined
  let retainedPackagePath = ''
  let savedReopenedStates = 0
  let regionalCaptures = 0
  let targetCaptures = 0
  let closedServiceAndDatabase = false
  let firstPng: Buffer | undefined
  let firstRgba: Buffer | undefined
  let finalPackageSha256 = ''
  try {
    const migrations = await database.db
      .selectFrom('schema_migrations')
      .select(['name', 'sha256'])
      .orderBy('name')
      .execute()
    assert.deepEqual(
      migrations,
      Object.entries(MIGRATION_PINS).map(([name, sha256]) => ({ name, sha256 })),
    )
    // Registration points to the original exact file. Real ModelService verifies bytes/structure.
    const installed = await repository.publishVerifiedInstallation({
      primary: {
        file: {
          managedPath: source,
          originalFilename: 'Illustrious-XL-v0.1.safetensors',
          sha256: CHECKPOINT_SHA256,
          sizeBytes: CHECKPOINT_BYTES,
          verifiedAt: '2026-10-27T00:00:00.000Z',
        },
        resource: {
          displayName: 'Illustrious XL v0.1 (official pinned epsilon)',
          source: { kind: 'civitai', modelId: 795_765 },
          sourceMetadata: { testOnlyCatalog: true },
          type: 'checkpoint',
        },
        version: {
          baseModelFamily: 'illustrious',
          format: 'safetensors',
          name: 'v0.1',
          source: {
            expectedSha256: CHECKPOINT_SHA256,
            fileId: 798_303,
            kind: 'civitai',
            versionId: 889_818,
          },
          sourceMetadata: {},
        },
      },
    })
    const reference = await models.resolveGenerationCheckpoint(
      installed.resourceId,
      installed.versionId,
    )
    assert.equal(reference.fileSha256, CHECKPOINT_SHA256)
    assert.equal(reference.baseModelFamily, 'illustrious')
    assert.equal(reference.predictionType, 'epsilon')
    assert.equal(reference.civitaiModelId, 795_765)
    assert.equal(reference.civitaiVersionId, 889_818)
    assert.equal(reference.civitaiFileId, 798_303)
    const tab = await service.create({
      height: 1024,
      title: 'Natural text: red apple and blue mug',
      width: 1024,
    })
    const id = tab.id
    const co = () => {
      const coordinator = service.getOpenDocumentForAcceptance(id)
      assert.ok(coordinator)
      return coordinator
    }
    retainedPackagePath = co().filePath
    assert.ok(retainedPackagePath.startsWith(`${data}${path.sep}`))
    const initial = co().document
    assert.deepEqual(initial.layers, [])
    const sources: Record<string, IgsAssetSource> = {}
    const regions: IgsRegionalGuidanceV1[] = [LEFT_POSITIVE, RIGHT_POSITIVE].map((text, index) => {
      const maskId = randomUUID()
      // Tight opaque halves project to full-target binary x<512 / x>=512. World translation is
      // encoded in the actual saved masks, not supplied by a later Python reconstruction.
      const bounds = { ...BBOX, width: 512, x: BBOX.x + index * 512 }
      const png = encodeProjectMaskPng(new Uint8Array(512 * 1024).fill(255), 512, 1024)
      const member = `assets/masks/${maskId}/${digest(png)}.png`
      sources[member] = { bytes: png }
      return {
        enabled: true,
        id: randomUUID(),
        locked: false,
        mask: {
          asset: { bytes: png.length, height: 1024, path: member, sha256: digest(png), width: 512 },
          bounds,
          id: maskId,
          revision: 1,
        },
        name: index === 0 ? 'Left object' : 'Right object',
        overlayOpacity: 0,
        prompts: { negative: prompt(''), positive: prompt(text), useGlobalNegativePrompt: false },
      }
    })
    assert.equal(new Set(regions.flatMap((region) => [region.id, region.mask.id])).size, 4)
    const authored = parseProjectDocumentV1({
      ...initial,
      generationDraft: {
        loras: [],
        model: reference,
        negativePrompt: prompt(''),
        positivePrompt: prompt(GLOBAL_POSITIVE),
        sampling: {
          cfgScale: 5,
          denoisingStrength: null,
          sampler: 'Euler',
          scheduler: 'Normal',
          steps: 30,
        },
        seed: { policy: 'fixed', value: 123 },
        vae: null,
        vaePrecision: 'FP16',
      },
      primaryBbox: BBOX,
      regionalGuidance: regions,
    })
    assert.deepEqual(
      resolveIllustriousScheduler(
        authored.generationDraft.sampling.sampler,
        authored.generationDraft.sampling.scheduler,
      ),
      { key: 'euler', kind: 'supported' },
    )
    assertEmptyResources(authored)
    const coverageOracle = [0, 1].map((side) =>
      Uint8Array.from({ length: 1024 * 1024 }, (_, index) =>
        (index % 1024 < 512 ? 0 : 1) === side ? 255 : 0,
      ),
    )

    worker = await ProjectWorkerClient.start(
      { pythonExecutable, runtimeRoot, stagingBasePath: scratch },
      { environment: { LANG: 'C.UTF-8', PYTHONDONTWRITEBYTECODE: '1', TMPDIR: scratch } },
    )
    workerReady = structuredClone(worker.ready)

    async function state() {
      const coordinator = co()
      assert.ok(Array.isArray(Reflect.get(coordinator, 'past')))
      assert.ok(Array.isArray(Reflect.get(coordinator, 'future')))
      const schema = (
        await sql<{ name: string; sql: string | null; tbl_name: string; type: string }>`
        select type, name, tbl_name, sql from sqlite_master order by type,name`.execute(database.db)
      ).rows
      const tables: Record<string, Record<string, unknown>[]> = {}
      for (const entry of schema.filter((row) => row.type === 'table')) {
        tables[entry.name] = (
          await sql<Record<string, unknown>>`select * from ${sql.table(entry.name)}`.execute(
            database.db,
          )
        ).rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
        if (
          /queue|acceptance|accepted|seed_cursor|staging|install_job|install_artifact/.test(
            entry.name,
          )
        ) {
          assert.equal(
            tables[entry.name].length,
            0,
            `Unexpected work/result/seed rows: ${entry.name}`,
          )
        }
      }
      const reopened = await readIgsPackage(coordinator.filePath)
      assert.deepEqual(reopened.project, coordinator.document)
      const members: Record<string, string> = {}
      for (const member of reopened.manifest.members) {
        const bytes = await reopened.readMember(member.path)
        assert.equal(bytes.length, member.bytes)
        assert.equal(digest(bytes), member.sha256)
        members[member.path] = digest(bytes)
      }
      return {
        dirty: coordinator.dirty,
        document: structuredClone(coordinator.document),
        epoch: coordinator.documentEpoch,
        history: {
          canRedo: coordinator.canRedo,
          canUndo: coordinator.canUndo,
          epoch: Reflect.get(coordinator, 'historyEpoch') as unknown,
          future: structuredClone(Reflect.get(coordinator, 'future')) as unknown,
          group: structuredClone(Reflect.get(coordinator, 'historyGroup')) as unknown,
          past: structuredClone(Reflect.get(coordinator, 'past')) as unknown,
        },
        members,
        packageHash: digest(await readFile(coordinator.filePath)),
        packageManifest: reopened.manifest,
        scratch: await tree(scratch),
        seed: {
          draft: structuredClone(coordinator.document.generationDraft.seed),
          lastActual: coordinator.document.lastActualSeedSnapshot,
        },
        shadow: await tree(shadowRoot),
        sql: { schema, tables },
        tab: service.getOpenTabs().find((open) => open.id === id),
      }
    }

    for (const seed of SEEDS) {
      for (const condition of CONDITIONS) {
        const name: VariantName = `seed${seed}-${condition}`
        orderedVariantLabels.push(name)
        const desired = structuredClone(authored)
        desired.documentRevision = co().document.documentRevision
        desired.generationDraft.seed = { policy: 'fixed', value: seed }
        for (const [index, region] of desired.regionalGuidance!.entries()) {
          region.enabled = condition !== 'baseline'
          assert.ok(region.prompts?.positive)
          region.prompts.positive.text =
            condition === 'swapped'
              ? [RIGHT_POSITIVE, LEFT_POSITIVE][index]
              : [LEFT_POSITIVE, RIGHT_POSITIVE][index]
        }
        await co().applyDocument(parseProjectDocumentV1(desired), sources, {
          expectedDocumentEpoch: co().documentEpoch,
          expectedDocumentRevision: co().document.documentRevision,
        })
        await service.save(id)
        await service.close(id)
        assert.equal((await service.open(id)).kind, 'opened')
        await service.flushAutosave(id)
        savedReopenedStates++
        assert.equal(co().filePath, retainedPackagePath)
        assert.equal(co().dirty, false)
        assert.deepEqual(documentSemantics(co().document), documentSemantics(desired))
        assert.deepEqual(co().document.generationDraft.model, reference)
        assert.equal(co().document.lastActualSeedSnapshot, initial.lastActualSeedSnapshot)
        assertEmptyResources(co().document)
        const before = await state()

        const prepared = await service.withCapturedRegionalGuidanceInput(id, async (capture) => {
          regionalCaptures++
          assert.equal(capture.snapshot.documentId, before.document.documentId)
          assert.equal(capture.snapshot.documentRevision, before.document.documentRevision)
          assert.deepEqual(capture.snapshot.generationDraft, before.document.generationDraft)
          assert.deepEqual(capture.snapshot.regionalGuidance, before.document.regionalGuidance)
          assert.deepEqual(capture.snapshot.primaryBbox, BBOX)
          assert.equal(
            capture.snapshot.lastActualSeedSnapshot,
            before.document.lastActualSeedSnapshot,
          )
          assert.equal(capture.assets.length, 2)
          const capturedAssets: Variant['captureAssetDescriptors'] = []
          for (const [index, asset] of capture.assets.entries()) {
            assert.equal(asset.role, 'mask')
            assert.equal(asset.regionId, regions[index].id)
            assert.deepEqual(asset.member, regions[index].mask.asset)
            const bytes = await capture.readAsset(asset.member.path)
            assert.equal(bytes.length, asset.member.bytes)
            assert.equal(digest(bytes), asset.member.sha256)
            const sourceAsset = sources[asset.member.path]
            assert.ok('bytes' in sourceAsset)
            sameBytes(bytes, sourceAsset.bytes, `${name}: captured owned mask bytes changed`)
            capturedAssets.push({
              member: structuredClone(asset.member),
              regionId: asset.regionId,
              role: 'mask',
            })
          }
          const savedModel = capture.snapshot.generationDraft.model
          assert.ok(savedModel)
          assert.deepEqual(savedModel, reference)
          const resolved = await models.resolveVerifiedGenerationCheckpointForPlan(savedModel)
          assert.deepEqual(Object.keys(resolved).sort(), [
            'managedPath',
            'noiseProfile',
            'reference',
          ])
          assert.equal(resolved.managedPath, source)
          assert.deepEqual(resolved.reference, savedModel)
          assert.deepEqual(resolved.noiseProfile, {
            baseSchedule: 'sdxl-scaled-linear-v1',
            rescaleBetasZeroSnr: false,
            schemaVersion: 1,
            timestepSpacing: 'leading',
          })
          assert.deepEqual(await repository.listPredictionOverrides(), [])
          assert.deepEqual(await repository.listNoiseProfileOverrides(), [])
          if (!checkpoint) {
            checkpoint = {
              byteSize: CHECKPOINT_BYTES,
              reference: structuredClone(savedModel),
              resolved: structuredClone(resolved),
              sha256: CHECKPOINT_SHA256,
              sourcePath: source,
            }
          }
          assert.deepEqual(resolved, checkpoint.resolved)
          assert.deepEqual(capture.snapshot.generationDraft.seed, { policy: 'fixed', value: seed })
          const plan = planGenerationBatch({
            baseSeed: seed,
            iterations: 1,
            maxJobs: 1,
            maxPrompts: 1,
            negativePrompt: capture.snapshot.generationDraft.negativePrompt.text,
            positivePrompt: capture.snapshot.generationDraft.positivePrompt.text,
            seedBehavior: 'per-prompt',
          })
          assert.equal(plan.truncated, false)
          assert.equal(plan.items.length, 1)
          const item = plan.items[0]
          const produced = await prepareCurrentCanvasRegionalRecipe({
            capture,
            job: {
              bbox: capture.snapshot.primaryBbox,
              documentId: capture.snapshot.documentId,
              documentRevision: capture.snapshot.documentRevision,
              family: 'illustrious',
              item,
            },
            models,
          })
          // Detach the WHOLE producer output at the lease boundary. Never edit its fields for handoff.
          const recipe = structuredClone(produced)
          assert.equal(digest(encodeTransport(recipe)), digest(encodeTransport(produced)))
          assert.equal(recipe.kind, 'current-canvas-regional-recipe')
          assert.equal(recipe.family, 'illustrious')
          assert.equal(recipe.documentId, before.document.documentId)
          assert.equal(recipe.documentRevision, before.document.documentRevision)
          assert.deepEqual(recipe.item, item)
          assert.deepEqual(recipe.item, {
            iteration: 0,
            promptPairIndex: 0,
            prompts: { negative: '', positive: GLOBAL_POSITIVE },
            seed,
          })
          assert.deepEqual(recipe.bbox, BBOX)
          assert.deepEqual(recipe.globalPrompts, {
            negative: prompt(''),
            positive: prompt(GLOBAL_POSITIVE),
          })
          assert.deepEqual(recipe.globalEmbeddings, { negative: [], positive: [] })
          assert.equal(recipe.regions.length, condition === 'baseline' ? 0 : 2)
          for (const [index, region] of recipe.regions.entries()) {
            const owner = desired.regionalGuidance![index]
            assert.equal(region.regionId, owner.id)
            assert.equal(region.maskId, owner.mask.id)
            assert.equal(region.maskRevision, 1)
            assert.deepEqual(region.authoredPrompts, owner.prompts)
            assert.deepEqual(region.positive, owner.prompts!.positive)
            assert.deepEqual(region.negative, { prompt: prompt(''), source: 'regional' })
            assert.equal(region.referenceImages, undefined)
            assert.deepEqual(region.embeddings, { negative: [], positive: [] })
            assert.equal(region.coverage.kind, 'covered')
            assert.deepEqual(region.coverage.bounds, BBOX)
            assert.ok('bounds' in owner.mask)
            assert.deepEqual(region.coverage.intersection, owner.mask.bounds)
            sameBytes(
              region.coverage.alpha,
              coverageOracle[index],
              `${name}: half-mask projection changed`,
            )
          }
          return { capturedAssets, recipe, resolved: structuredClone(resolved) }
        })
        assert.deepEqual(
          await state(),
          before,
          `${name}: capture/resolver/recipe changed durable state`,
        )
        const target = await service.withCapturedNormalGenerationInput(id, async (capture) => {
          targetCaptures++
          assert.deepEqual(capture.document, before.document)
          assert.ok(worker)
          return await capture.composeTarget(worker)
        })
        assert.equal(target.documentId, prepared.recipe.documentId)
        assert.equal(target.documentRevision, prepared.recipe.documentRevision)
        assert.deepEqual(target.bbox, BBOX)
        assert.deepEqual(target.generationDraft, before.document.generationDraft)
        assert.equal(target.lastActualSeedSnapshot, before.document.lastActualSeedSnapshot)
        assert.equal(target.mode, 'txt2img')
        assert.equal(target.composite.sha256, digest(target.composite.bytes))
        assert.equal(target.composite.byteSize, target.composite.bytes.length)
        assert.equal(target.composite.width, 1024)
        assert.equal(target.composite.height, 1024)
        assert.equal(target.composite.colorSpace, 'srgb')
        assert.equal(target.composite.iccSha256, IGS_SRGB_ICC_SHA256)
        await validateSrgbPngStream(
          (async function* () {
            yield target.composite.bytes
          })(),
          'target.png',
          32 * 1024 * 1024,
          1024,
        )
        const decoded = independentPng(target.composite.bytes)
        assert.ok(
          decoded.alpha.every((value) => value === 0),
          `${name}: target alpha is not independently all-zero`,
        )
        assert.equal(classifyTargetPngAlpha(target.composite.bytes, 1024, 1024), 'txt2img')
        if (!firstPng) {
          firstPng = Buffer.from(target.composite.bytes)
        }
        if (!firstRgba) {
          firstRgba = Buffer.from(decoded.rgba)
        }
        sameBytes(target.composite.bytes, firstPng, `${name}: composed PNG differs`)
        sameBytes(decoded.rgba, firstRgba, `${name}: composed RGBA differs`)
        assert.deepEqual(
          await state(),
          before,
          `${name}: target capture/composition changed durable state`,
        )
        const relativePng = `targets/${name}.png`
        await writeFile(path.join(outputRoot, relativePng), target.composite.bytes, { flag: 'wx' })
        const retainedPng = await readFile(path.join(outputRoot, relativePng))
        sameBytes(retainedPng, target.composite.bytes, `${name}: retained target differs`)
        variants[name] = {
          authoredDocument: structuredClone(before.document),
          captureAssetDescriptors: structuredClone(prepared.capturedAssets),
          checkpointResolution: prepared.resolved,
          durableStateSha256: digest(encodeTransport(before)),
          durableUnchanged: true,
          packageManifest: structuredClone(before.packageManifest),
          packageMembers: { ...before.members },
          packageSha256: before.packageHash,
          recipe: prepared.recipe,
          recipeSha256: digest(encodeTransport(prepared.recipe)),
          targetMode: {
            alphaClassification: 'all-zero',
            bbox: structuredClone(target.bbox),
            byteSize: retainedPng.length,
            colorSpace: 'srgb',
            documentId: target.documentId,
            documentRevision: target.documentRevision,
            height: 1024,
            iccSha256: IGS_SRGB_ICC_SHA256,
            independentAlphaSha256: digest(decoded.alpha),
            independentRgbaSha256: digest(decoded.rgba),
            mode: 'txt2img',
            relativePng,
            sha256: digest(retainedPng),
            width: 1024,
          },
        }
      }
    }

    const base = variants['seed123-assignment']!
    assert.ok(base)
    for (const seed of SEEDS) {
      for (const condition of CONDITIONS) {
        const name: VariantName = `seed${seed}-${condition}`
        const variant = variants[name]!
        assert.ok(variant)
        const expectedDocument = structuredClone(base.authoredDocument)
        expectedDocument.generationDraft.seed.value = seed
        for (const [index, region] of expectedDocument.regionalGuidance!.entries()) {
          region.enabled = condition !== 'baseline'
          assert.ok(region.prompts?.positive)
          if (condition === 'swapped') {
            region.prompts.positive.text = [RIGHT_POSITIVE, LEFT_POSITIVE][index]!
          }
        }
        assert.deepEqual(
          documentSemantics(variant.authoredDocument),
          documentSemantics(expectedDocument),
          `${name}: unexpected saved document difference beyond revision/seed/enable/positive text`,
        )
        const expectedRecipe = structuredClone(base.recipe)
        expectedRecipe.item = { ...expectedRecipe.item, seed }
        if (condition === 'baseline') {
          expectedRecipe.regions = []
        } else if (condition === 'swapped') {
          for (const [index, region] of expectedRecipe.regions.entries()) {
            assert.ok(region.positive && region.authoredPrompts?.positive)
            region.positive.text = [RIGHT_POSITIVE, LEFT_POSITIVE][index]!
            region.authoredPrompts.positive.text = [RIGHT_POSITIVE, LEFT_POSITIVE][index]!
          }
        }
        assert.deepEqual(
          recipeSemantics(variant.recipe),
          recipeSemantics(expectedRecipe),
          `${name}: unexpected recipe difference`,
        )
        assert.deepEqual(variant.captureAssetDescriptors, base.captureAssetDescriptors)
        assert.deepEqual(variant.checkpointResolution, base.checkpointResolution)
        assert.equal(variant.targetMode.sha256, base.targetMode.sha256)
        assert.equal(
          variant.recipeSha256,
          digest(encodeTransport(variant.recipe)),
          `${name}: complete recipe mutated after preparation`,
        )
      }
    }
    assert.equal(savedReopenedStates, 6)
    assert.equal(regionalCaptures, 6)
    assert.equal(targetCaptures, 6)
    assert.equal(
      new Set(Object.values(variants).map((value) => value.authoredDocument.documentRevision)).size,
      6,
    )
    const catalog = await repository.listInstalled()
    assert.equal(catalog.length, 1)
    assert.equal(catalog[0].type, 'checkpoint')
    assert.equal(catalog[0].versions.length, 1)
    assert.equal((await database.db.selectFrom('local_model_file').selectAll().execute()).length, 1)
    assert.deepEqual(await repository.listPredictionOverrides(), [])
    assert.deepEqual(await repository.listNoiseProfileOverrides(), [])
    assert.equal(networkAttempts, 0)
    finalPackageSha256 = digest(await readFile(retainedPackagePath))
    assert.equal(finalPackageSha256, variants['seed124-swapped']!.packageSha256)
  } finally {
    // No sweeps/removal: ROOT alone owns retained dependencies and disposal after physical exit.
    try {
      if (worker) {
        await worker.close()
      }
    } finally {
      try {
        for (const tab of service.getOpenTabs()) {
          await service.close(tab.id)
        }
      } finally {
        await database.close()
      }
    }
    closedServiceAndDatabase = true
  }
  assert.ok(checkpoint)
  assert.equal(closedServiceAndDatabase, true)
  assert.equal(ProjectWorkerClient.hasUnconfirmedExit(), false)
  assert.equal(digest(await readFile(retainedPackagePath)), finalPackageSha256)
  // Recheck unchanged producers and the sealed contract before publishing the sole JSON result.
  assert.deepEqual(await verifySources(), sourcePins)
  assert.equal(digest(await readFile(path.join(run, 'experiment-contract.json'))), CONTRACT_SHA256)
  const summary = {
    activeEmbeddingBindings: 0,
    closedServiceAndDatabase,
    copiedCheckpointFiles: 0,
    exactTiFiles: 0,
    lifecycleOwner: 'ROOT',
    mainRecipes: 6,
    nativeQualification: 'NOT_RUN_BY_THIS_PROBE',
    networkAttempts,
    projects: 1,
    regionalCaptures,
    registeredCheckpointFiles: 1,
    result: 'MAIN_RECIPES_PREPARED',
    retainedIgsPackages: 1,
    savedReopenedStates,
    targetCaptures,
    targetPngs: 6,
  }
  const output = {
    base: BASE,
    bbox: BBOX,
    builtinCheckpointCompatibility: structuredClone(manifest[0]),
    checkpoint,
    exactResources: {},
    experimentContract: contract,
    experimentContractSha256: CONTRACT_SHA256,
    finalPackageSha256,
    latent: { height: 128, width: 128 },
    maskOracle: {
      left: '255 iff local x in [0,512); otherwise 0, every row',
      localHeight: 1024,
      localSplitX: 512,
      localWidth: 1024,
      right: '255 iff local x in [512,1024); otherwise 0, every row',
      source:
        'Saved owned masks projected by actual Main capture; Python must consume recipe coverage.',
      worldBbox: BBOX,
    },
    migrationPins: MIGRATION_PINS,
    nativeHandoff: {
      cfg: 5,
      effectiveEmbeddingBindings: 0,
      exactResources: {},
      globalCoverage: { negative: 'Everywhere', positive: 'Everywhere' },
      layout: 'cfg-negative-first',
      pooledSources: { negative: 'current-canvas', positive: 'current-canvas' },
      prediction: 'epsilon',
      publicAdmission: 'UNCHANGED',
      readinessPromotion: false,
      recipePolicy:
        'Consume unchanged complete recipes and retained targets. No reconstructed masks or TI loads for zero effective refs.',
      recipeProfile: 'ordinary-canvas-static-dualclip-exact-ti-shared-readonly-cuda-fp16-v1',
      sampler: 'euler',
      steps: 30,
      textualInversionLoadsExpected: 0,
    },
    orderedVariantLabels,
    retainedPackagePath,
    schema: 'main-natural-text-visual-v1',
    semanticAxes: {
      baseline: 'Only both saved regionalGuidance[].enabled flags become false.',
      revisions:
        'Actual Main edits assign documentRevision and Save retains it; recipe and target bind that saved revision. No other revision difference.',
      seed124:
        'Only generationDraft.seed.value changes from 123 to 124 within equivalent conditions.',
      swapped: 'Only both saved regionalGuidance[i].prompts.positive.text values are exchanged.',
    },
    sourceExpectations: {
      checkpointResolver: 'ModelService.resolveVerifiedGenerationCheckpointForPlan(savedRef)',
      readHead: BASE,
      recipe: 'prepareCurrentCanvasRegionalRecipe({capture,job,models})',
      resolverResultFields: ['managedPath', 'reference', 'noiseProfile'],
      rootSuppliedArchivedBaselineFiles: 1385,
      target:
        'ProjectService.withCapturedNormalGenerationInput -> capture.composeTarget(ProjectWorkerClient)',
      transport: 'Unmodified complete detached recipes; Uint8Array only uses __test_alpha8_b64__.',
    },
    sourcePins,
    summary,
    variants,
    workerReady,
  }
  const jsonPath = path.join(outputRoot, 'main-natural-recipes.json')
  await writeFile(jsonPath, `${JSON.stringify(JSON.parse(encodeTransport(output)), null, 2)}\n`, {
    flag: 'wx',
  })
  process.stdout.write(`${JSON.stringify(summary)}\n`)
}

async function canonicalDirectory(directory: string): Promise<void> {
  assert.ok(path.isAbsolute(directory))
  assert.equal(path.resolve(directory), directory)
  const stat = await lstat(directory)
  assert.ok(
    stat.isDirectory() && !stat.isSymbolicLink(),
    `Expected regular directory: ${directory}`,
  )
  assert.equal(await realpath(directory), directory)
}

async function assertAbsent(member: string): Promise<void> {
  try {
    await lstat(member)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return
    }
    throw error
  }
  throw new Error(`ROOT must release the previous producer output before reuse: ${member}`)
}

async function tree(directory: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  async function visit(current: string): Promise<void> {
    let names: string[]
    try {
      names = (await readdir(current)).sort()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return
      }
      throw error
    }
    for (const name of names) {
      const member = path.join(current, name)
      const stat = await lstat(member)
      assert.equal(stat.isSymbolicLink(), false)
      if (stat.isDirectory()) {
        result[`${path.relative(directory, member)}/`] = 'directory'
        await visit(member)
      } else {
        assert.ok(stat.isFile())
        result[path.relative(directory, member)] = digest(await readFile(member))
      }
    }
  }
  await visit(directory)
  return result
}

/** Separate full-RGBA PNG decoder; it does not use Main's alpha decoder/classifier. */
function independentPng(png: Buffer): { alpha: Buffer; rgba: Buffer } {
  assert.ok(png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
  assert.equal(png.toString('ascii', 12, 16), 'IHDR')
  assert.equal(png.readUInt32BE(16), BBOX.width)
  assert.equal(png.readUInt32BE(20), BBOX.height)
  assert.deepEqual(Array.from(png.subarray(24, 29)), [8, 6, 0, 0, 0])
  const chunks: Buffer[] = []
  let ended = false
  for (let offset = 8; offset + 12 <= png.length;) {
    const length = png.readUInt32BE(offset)
    const tag = png.toString('ascii', offset + 4, offset + 8)
    assert.ok(offset + length + 12 <= png.length)
    if (tag === 'IDAT') {
      chunks.push(png.subarray(offset + 8, offset + 8 + length))
    }
    offset += length + 12
    if (tag === 'IEND') {
      assert.equal(offset, png.length)
      ended = true
      break
    }
  }
  assert.ok(ended && chunks.length > 0)
  const stride = BBOX.width * 4
  const raw = inflateSync(Buffer.concat(chunks), { maxOutputLength: (stride + 1) * BBOX.height })
  assert.equal(raw.length, (stride + 1) * BBOX.height)
  const rgba = Buffer.alloc(stride * BBOX.height)
  for (let y = 0; y < BBOX.height; y++) {
    const filter = raw[y * (stride + 1)]
    assert.ok(filter <= 4)
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x
      const a = x >= 4 ? rgba[at - 4] : 0
      const b = y > 0 ? rgba[at - stride] : 0
      const c = y > 0 && x >= 4 ? rgba[at - stride - 4] : 0
      let predictor = 0
      switch (filter) {
        case 1: {
          predictor = a
          break
        }
        case 2: {
          predictor = b
          break
        }
        case 3: {
          predictor = Math.floor((a + b) / 2)
          break
        }
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a)
          const pb = Math.abs(p - b)
          const pc = Math.abs(p - c)
          predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c

          break
        }
        // No default
      }
      rgba[at] = (raw[y * (stride + 1) + 1 + x] + predictor) & 255
    }
  }
  const alpha = Buffer.alloc(BBOX.width * BBOX.height)
  for (let i = 0; i < alpha.length; i++) {
    alpha[i] = rgba[i * 4 + 3]!
  }
  return { alpha, rgba }
}

function assertEmptyResources(document: IgsProjectDocumentV1): void {
  const draft = document.generationDraft
  assert.deepEqual(document.layers, [])
  assert.deepEqual(draft.loras, [])
  assert.equal(draft.vae, null)
  assert.equal(draft.dynamicPrompt, undefined)
  assert.deepEqual(draft.positivePrompt, prompt(GLOBAL_POSITIVE))
  assert.deepEqual(draft.negativePrompt, prompt(''))
  assert.equal(document.regionalGuidance?.length, 2)
  for (const region of document.regionalGuidance) {
    // The schema permits only absent or nonempty referenceImages; absence means zero references.
    assert.equal(region.referenceImages, undefined)
    assert.ok(region.prompts?.positive)
    assert.deepEqual(region.prompts.positive.embeddingRefs, [])
    assert.deepEqual(region.prompts.negative, prompt(''))
    assert.equal(region.prompts.useGlobalNegativePrompt, false)
  }
}

/** Only revision normalization and byte digests for bounded comparison diagnostics. */
function recipeSemantics(recipe: CurrentCanvasRegionalRecipe) {
  return {
    ...recipe,
    documentRevision: '<per-save revision>',
    regions: recipe.regions.map((region) => ({
      ...region,
      coverage: {
        ...region.coverage,
        alpha: {
          byteSize: region.coverage.alpha.length,
          sha256: digest(region.coverage.alpha),
        },
      },
    })),
  }
}

function documentSemantics(document: IgsProjectDocumentV1) {
  return { ...document, documentRevision: '<per-save revision>' }
}

async function verifySources(): Promise<Record<string, string>> {
  const pins = { ...SOURCE_PINS }
  const migrations = path.join(REPO, 'src/main/db/migrations')
  assert.deepEqual((await readdir(migrations)).sort(), Object.keys(MIGRATION_PINS).sort())
  assert.equal(Object.keys(MIGRATION_PINS).length, 19)
  for (const [name, sha256] of Object.entries(MIGRATION_PINS)) {
    pins[`src/main/db/migrations/${name}`] = sha256
  }
  for (const [name, sha256] of Object.entries(pins)) {
    assert.equal(
      digest(await readFile(path.join(REPO, name))),
      sha256,
      `Pinned Main API changed: ${name}`,
    )
  }
  assert.equal(ModelService.prototype.resolveVerifiedGenerationCheckpointForPlan.length, 1)
  assert.equal(typeof ProjectService.prototype.withCapturedRegionalGuidanceInput, 'function')
  assert.equal(typeof ProjectService.prototype.withCapturedNormalGenerationInput, 'function')
  return pins
}

function parseCli(args: string[]): { run: string; source: string } {
  assert.equal(args.length, 4, 'Expected exactly --run EXACT_RUN --source EXACT_SOURCE')
  const values = new Map<string, string>()
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]
    assert.ok(key === '--run' || key === '--source', `Unsupported CLI option: ${key}`)
    assert.equal(values.has(key), false, `Repeated CLI option: ${key}`)
    values.set(key, args[index + 1])
  }
  assert.ok(values.has('--run') && values.has('--source'))
  return { run: values.get('--run')!, source: values.get('--source')! }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  void produceRegionalGuidanceNaturalTextProbe(parseCli(process.argv.slice(2))).catch(
    (error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      )
      process.exitCode = 1
    },
  )
}
