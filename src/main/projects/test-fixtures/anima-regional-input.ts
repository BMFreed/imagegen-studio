/**
 * Genuine private Main handoff for ROOT's original-Anima regional probes. Import runs nothing.
 * SQLite/coordinator/Save/reopen/capture/planner/coverage are real. Default authored model metadata
 * and literal masks are setup. Optional trained mode registers three exact read-only files only in
 * the fresh fixture DB and resolves the saved reference through real ModelService. No worker is
 * spawned and no public generation permission is granted. The caller owns the fresh root/cleanup.
 *
 * InvokeAI a61ac4fb: backend/anima/{regional_prompting,conditioning_data}.py and
 * app/invocations/anima/anima_denoise.py; the existing Studio compiler remains the sole parser.
 * Trained registration/loading also consults current
 * app/services/model_records/model_records_sql.py and
 * backend/model_manager/load/model_loaders/anima.py: existing Studio owners retain SQL, exact
 * reference resolution, native qualification and loading; this fixture adds no model owner.
 */
import {
  type AnimaFlowSamplingPlan,
  compileAnimaFlowSamplingPlan,
} from '../../../shared/projects/anima-flow-sampling-plan.js'
import { planGenerationBatch } from '../../../shared/projects/generation-batch-plan.js'
import {
  type IgsProjectDocumentV1,
  type IgsRectV1,
  type IgsRegionalGuidanceV1,
  parseProjectDocumentV1,
} from '../../../shared/projects/project-schema.js'
import type { GenerationPrompt } from '../../../shared/projects/prompt-embeddings.js'

import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { CivitaiClient } from '../../models/civitai-client.js'
import type { CivitaiTokenStore } from '../../models/civitai-token-store.js'

import { openAppDatabase } from '../../db/database.js'
import { ANIMA_QWEN3_0_6B_ENCODER, ANIMA_QWEN_IMAGE_VAE } from '../../models/anima-manifest.js'
import { ModelRepository, type VerifiedModelArtifact } from '../../models/model-repository.js'
import { ModelService, type VerifiedAnimaGenerationBundle } from '../../models/model-service.js'
import { readIgsPackage } from '../igs-package.js'
import { ProjectAutosaveLeaseRegistry } from '../project-autosave.js'
import {
  compileCurrentCanvasAnimaRegionalPrompts,
  type CompiledCurrentCanvasAnimaRegionalPrompt,
} from '../project-current-canvas-anima-regional-input.js'
import {
  type CurrentCanvasRegionalRecipe,
  prepareCurrentCanvasRegionalRecipe,
} from '../project-current-canvas-regional-recipe.js'
import { ProjectIndexRepository } from '../project-index.js'
import { encodeProjectMaskPng } from '../project-mask.js'
import { ProjectService } from '../project-service.js'
import { ProjectShadowStore } from '../project-shadow.js'

const REPO = fileURLToPath(new URL('../../../../', import.meta.url))
const VARIANTS = ['base', 'swapped', 'zero', 'empty', 'inherited'] as const
export type AnimaRegionalFixtureVariant = (typeof VARIANTS)[number]
const REGION_IDS = [
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102',
] as const
const MASK_IDS = [
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000202',
] as const
const REGIONAL_TEXTS = ['(red scarf)1.5, one white cat', '(blue scarf)0.75, one white cat'] as const
const digest = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex')
const prompt = (text: string): GenerationPrompt => ({ embeddingRefs: [], text })
const TRAINED_CHECKPOINT = {
  byteSize: 4_182_275_752,
  sha256: '0fc7507b222e52ac8cc5e2826786bc4caed05223df32d17aeb05a76cb4de9941',
} as const

export interface AnimaRegionalTrainedFile {
  byteSize: number
  path: string
  sha256: string
}

export interface AnimaRegionalTrainedBundle {
  checkpoint: AnimaRegionalTrainedFile
  qwen3Encoder: AnimaRegionalTrainedFile
  vae: AnimaRegionalTrainedFile
}

export type SerializedAnimaRegionalRecipe = Omit<CurrentCanvasRegionalRecipe, 'regions'> & {
  regions: (Omit<Region, 'coverage'> & {
    coverage: Omit<Region['coverage'], 'alpha'> & { alpha: number[] }
  })[]
}
export interface AnimaRegionalInputFixture {
  authoredDocument: IgsProjectDocumentV1
  compiledPrompts: readonly CompiledCurrentCanvasAnimaRegionalPrompt[]
  durablePreservation: {
    captureCalls: 1
    documentSha256: string
    durableUnchanged: true
    historyAndSeedCursorUnchanged: true
    modelMetadataOnly: boolean
    packageSha256: string
    savedAndReopened: true
    sqlSha256: string
  }
  paths: {
    database: string
    handoff: string
    masks: string[]
    package: string
    root: string
  }
  recipe: SerializedAnimaRegionalRecipe
  sampling: AnimaFlowSamplingPlan
  schema: 'main-anima-regional-positive-v1'
  variant: AnimaRegionalFixtureVariant
  verifiedBundle?: VerifiedAnimaGenerationBundle
}

type Region = CurrentCanvasRegionalRecipe['regions'][number]

/** Run only under the caller's explicit process/artifact ownership; no implicit execution on import. */
export async function produceAnimaRegionalInputFixture(
  root: string,
  options: {
    guidanceScale?: number
    height?: number
    seed?: number
    steps?: number
    trainedBundle?: AnimaRegionalTrainedBundle
    variant?: AnimaRegionalFixtureVariant
    width?: number
  } = {},
): Promise<AnimaRegionalInputFixture> {
  const {
    guidanceScale = 4,
    height = 72,
    seed = 123,
    steps = 2,
    variant = 'base',
    width = 104,
  } = options
  const trainedBundle =
    options.trainedBundle === undefined ? undefined : captureTrainedBundle(options.trainedBundle)
  assert.ok(VARIANTS.includes(variant), 'The fixture variant must be explicitly supported')
  const sampling = compileAnimaFlowSamplingPlan({
    guidanceScale,
    height,
    mode: 'txt2img',
    scheduler: 'euler',
    seed,
    steps,
    strength: null,
    width,
  })
  assert.ok(
    path.isAbsolute(root) && path.resolve(root) === root,
    'A canonical absolute root is required',
  )
  await mkdir(root, { mode: 0o700, recursive: true })
  const entry = await lstat(root)
  assert.ok(entry.isDirectory() && !entry.isSymbolicLink())
  assert.equal(await realpath(root), root)
  assert.deepEqual(await readdir(root), [], 'The fixture must own a fresh empty root')
  const bbox: IgsRectV1 = { height, width, x: -13, y: 5 }
  const database = openAppDatabase(root, path.join(REPO, 'src/main/db/migrations'))
  const shadowRoot = path.join(root, 'autosave')
  const service = new ProjectService({
    autosaveOptions: { debounceMs: 60_000, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    dataRoot: root,
    repository: new ProjectIndexRepository(database.db),
    roots: {
      placeholdersDir: path.join(REPO, 'src/main/projects/placeholders'),
      scratchDir: path.join(root, 'scratch'),
    },
    shadow: new ProjectShadowStore(shadowRoot),
  })
  let result: AnimaRegionalInputFixture | undefined
  try {
    const trained = trainedBundle
      ? await registerTrainedBundle(new ModelRepository(database.db), trainedBundle)
      : undefined
    const tab = await service.create({
      height,
      title: 'Private Anima positive regional input',
      width,
    })
    const coordinator = () => {
      const current = service.getOpenDocumentForAcceptance(tab.id)
      assert.ok(current)
      return current
    }
    const sources: Record<string, { bytes: Buffer }> = {}
    const maskPaths: string[] = []
    const middle = Math.floor(width / 2)
    const regions: IgsRegionalGuidanceV1[] = []
    for (const index of [0, 1] as const) {
      const firstX = index === 0 ? 0 : middle - 2
      const lastX = index === 0 ? middle + 2 : width
      const maskWidth = lastX - firstX
      const alpha = Uint8Array.from({ length: maskWidth * height }, (_, sample) => {
        const x = firstX + (sample % maskWidth)
        if (index === 0) {
          return x < middle ? 255 : x === middle ? 128 : 127
        }
        return x >= middle ? 255 : x === middle - 1 ? 128 : 127
      })
      const bytes = encodeProjectMaskPng(alpha, maskWidth, height)
      const sha256 = digest(bytes)
      const member = `assets/masks/${MASK_IDS[index]}/${sha256}.png`
      sources[member] = { bytes }
      const maskPath = path.join(root, `input-mask-${index}.png`)
      await writeFile(maskPath, bytes, { flag: 'wx', mode: 0o600 })
      maskPaths.push(maskPath)
      const selectedText = variant === 'swapped' ? REGIONAL_TEXTS[1 - index] : REGIONAL_TEXTS[index]
      regions.push({
        enabled: variant !== 'zero',
        id: REGION_IDS[index],
        locked: index === 0,
        mask: {
          asset: { bytes: bytes.length, height, path: member, sha256, width: maskWidth },
          bounds: { height, width: maskWidth, x: bbox.x + firstX, y: bbox.y },
          id: MASK_IDS[index],
          revision: 1,
        },
        name: index === 0 ? 'First independent region' : 'Second independent region',
        overlayOpacity: index === 0 ? 0 : 0.5,
        prompts: {
          negative:
            variant === 'inherited' ? prompt('dormant {not|selected} local negative') : prompt(''),
          positive: variant === 'empty' ? (index === 0 ? prompt('') : null) : prompt(selectedText),
          useGlobalNegativePrompt: variant === 'inherited',
        },
      })
    }
    const current = coordinator().document
    const authored = parseProjectDocumentV1({
      ...current,
      generationDraft: {
        ...current.generationDraft,
        loras: [],
        model: trained?.reference ?? {
          baseModelFamily: 'anima',
          civitaiFileId: null,
          civitaiModelId: null,
          civitaiVersionId: null,
          displayName: 'Original Anima Base authored metadata',
          fileSha256: 'a'.repeat(64),
          kind: 'checkpoint',
          localModelId: '00000000-0000-4000-8000-000000000301',
          localVersionId: '00000000-0000-4000-8000-000000000302',
          predictionType: null,
          versionName: 'Synthetic identity; no installed weight claim',
        },
        negativePrompt: prompt(variant === 'inherited' ? '' : '(blur)0.75, noise'),
        positivePrompt: prompt('(two white cats)1.25 on one bench'),
        sampling: {
          ...current.generationDraft.sampling,
          animaMethod: 'euler',
          cfgScale: guidanceScale,
          denoisingStrength: null,
          steps,
        },
        seed: { policy: 'fixed', value: seed },
        vae: null,
      },
      primaryBbox: bbox,
      regionalGuidance: regions,
    })
    await coordinator().applyDocument(authored, sources)
    await service.save(tab.id)
    const savedPath = coordinator().filePath
    await service.close(tab.id)
    assert.equal((await service.open(tab.id)).kind, 'opened')
    const loaded = await readIgsPackage(savedPath)
    assert.deepEqual(loaded.project, coordinator().document)
    for (const [member, source] of Object.entries(sources)) {
      assert.ok((await loaded.readMember(member)).equals(source.bytes), 'Saved mask bytes differ')
    }
    await service.flushAutosave(tab.id)
    const sqlSnapshot = async (): Promise<string> => {
      const schema = await sql<{
        name: string
      }>`select name from sqlite_master where type = 'table' order by name`.execute(database.db)
      const tables: Record<string, unknown[]> = {}
      for (const { name } of schema.rows) {
        const rows = (await sql`select * from ${sql.table(name)}`.execute(database.db)).rows
        tables[name] = rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      }
      return digest(JSON.stringify(tables))
    }
    const documentBefore = structuredClone(coordinator().document)
    const packageBefore = await readFile(savedPath)
    const sqlBefore = await sqlSnapshot()
    const tabBefore = service.getOpenTabs().find(({ id }) => id === tab.id)!
    const historyBefore = {
      canRedo: tabBefore.canRedo,
      canUndo: tabBefore.canUndo,
      dirty: tabBefore.dirty,
      epoch: coordinator().documentEpoch,
    }
    const prepared = await service.withCapturedRegionalGuidanceInput(tab.id, async (capture) => {
      let verifiedBundle: VerifiedAnimaGenerationBundle | undefined
      if (trained) {
        const saved = capture.snapshot.generationDraft.model
        assert.ok(saved)
        assert.deepEqual(saved, trained.reference)
        verifiedBundle = await trained.models.resolveVerifiedGenerationAnimaBundleForPlan(saved)
        assert.deepEqual(verifiedBundle.checkpoint.reference, saved)
      }
      const items = planGenerationBatch({
        baseSeed: seed,
        iterations: 1,
        maxJobs: 1,
        maxPrompts: 1,
        negativePrompt: capture.snapshot.generationDraft.negativePrompt.text,
        positivePrompt: capture.snapshot.generationDraft.positivePrompt.text,
        seedBehavior: 'per-prompt',
      }).items
      assert.equal(items.length, 1)
      const recipe = await prepareCurrentCanvasRegionalRecipe({
        capture,
        job: {
          bbox: structuredClone(capture.snapshot.primaryBbox),
          documentId: capture.snapshot.documentId,
          documentRevision: capture.snapshot.documentRevision,
          family: 'anima',
          item: items[0],
        },
      })
      assert.equal(Object.hasOwn(recipe, 'globalEmbeddings'), false)
      return {
        compiledPrompts: compileCurrentCanvasAnimaRegionalPrompts(recipe),
        recipe,
        verifiedBundle,
      }
    })
    assert.deepEqual(coordinator().document, documentBefore)
    assert.ok(
      (await readFile(savedPath)).equals(packageBefore),
      'Capture rewrote the saved package',
    )
    assert.equal(await sqlSnapshot(), sqlBefore, 'Capture changed durable SQL rows')
    const tabAfter = service.getOpenTabs().find(({ id }) => id === tab.id)!
    assert.deepEqual(
      {
        canRedo: tabAfter.canRedo,
        canUndo: tabAfter.canUndo,
        dirty: tabAfter.dirty,
        epoch: coordinator().documentEpoch,
      },
      historyBefore,
    )
    result = {
      authoredDocument: documentBefore,
      compiledPrompts: prepared.compiledPrompts,
      durablePreservation: {
        captureCalls: 1,
        documentSha256: digest(JSON.stringify(documentBefore)),
        durableUnchanged: true,
        historyAndSeedCursorUnchanged: true,
        modelMetadataOnly: trained === undefined,
        packageSha256: digest(packageBefore),
        savedAndReopened: true,
        sqlSha256: sqlBefore,
      },
      paths: {
        database: database.filePath,
        handoff: path.join(root, 'anima-regional-input.json'),
        masks: maskPaths,
        package: savedPath,
        root,
      },
      recipe: {
        ...structuredClone(prepared.recipe),
        regions: prepared.recipe.regions.map((region) => ({
          ...structuredClone(region),
          coverage: { ...structuredClone(region.coverage), alpha: [...region.coverage.alpha] },
        })),
      },
      sampling,
      schema: 'main-anima-regional-positive-v1',
      variant,
      ...(prepared.verifiedBundle
        ? { verifiedBundle: structuredClone(prepared.verifiedBundle) }
        : {}),
    }
  } finally {
    try {
      for (const tab of service.getOpenTabs()) {
        await service.discardAndClose(tab.id)
      }
    } finally {
      await database.close()
    }
  }
  assert.ok(result)
  await writeFile(result.paths.handoff, `${JSON.stringify(result, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  })
  return result
}

/** Descriptor semantics are captured before mkdir/database/file collaborators can run. */
function captureTrainedBundle(input: AnimaRegionalTrainedBundle): AnimaRegionalTrainedBundle {
  assert.ok(input !== null && typeof input === 'object' && !Array.isArray(input))
  assert.deepEqual(Object.keys(input).sort(), ['checkpoint', 'qwen3Encoder', 'vae'])
  const expected = {
    checkpoint: TRAINED_CHECKPOINT,
    qwen3Encoder: {
      byteSize: ANIMA_QWEN3_0_6B_ENCODER.sizeBytes,
      sha256: ANIMA_QWEN3_0_6B_ENCODER.sha256,
    },
    vae: { byteSize: ANIMA_QWEN_IMAGE_VAE.sizeBytes, sha256: ANIMA_QWEN_IMAGE_VAE.sha256 },
  }
  const captured = structuredClone(input)
  for (const role of ['checkpoint', 'qwen3Encoder', 'vae'] as const) {
    const file = captured[role]
    assert.ok(file !== null && typeof file === 'object' && !Array.isArray(file))
    assert.deepEqual(Object.keys(file).sort(), ['byteSize', 'path', 'sha256'])
    assert.equal(file.byteSize, expected[role].byteSize)
    assert.equal(file.sha256, expected[role].sha256)
    assert.ok(
      typeof file.path === 'string' &&
        path.isAbsolute(file.path) &&
        path.resolve(file.path) === file.path &&
        !file.path.includes('\0'),
      'Trained qualification requires canonical absolute component paths',
    )
  }
  assert.equal(new Set(Object.values(captured).map((file) => file.path)).size, 3)
  return captured
}

/**
 * Fixture setup, not an installation claim: callers already verified these exact file descriptors.
 * The real resolver independently hashes all three files and qualifies the checkpoint after Save/
 * reopen. Only this fixture's database receives registrations; source weight files are never copied
 * or modified. Missing/changed bytes therefore fail the same existing ModelService owner.
 */
async function registerTrainedBundle(
  repository: ModelRepository,
  bundle: AnimaRegionalTrainedBundle,
): Promise<{
  models: ModelService
  reference: NonNullable<IgsProjectDocumentV1['generationDraft']['model']>
}> {
  const verifiedAt = new Date().toISOString()
  const local = (file: AnimaRegionalTrainedFile) => ({
    managedPath: file.path,
    originalFilename: path.basename(file.path),
    sha256: file.sha256,
    sizeBytes: file.byteSize,
    verifiedAt,
  })
  const dependency = (
    role: 'qwen3_encoder' | 'vae',
    file: AnimaRegionalTrainedFile,
    manifest: typeof ANIMA_QWEN3_0_6B_ENCODER,
  ): VerifiedModelArtifact => ({
    file: local(file),
    resource: {
      displayName: `Exact original Anima ${role}`,
      source: { key: manifest.url, kind: 'supported_dependency' },
      sourceMetadata: { fixtureLocalRegistration: true, origin: manifest },
      type: role,
    },
    version: {
      baseModelFamily: 'anima',
      format: 'SafeTensor',
      name: manifest.revision,
      predictionType: null,
      source: {
        expectedSha256: manifest.sha256,
        kind: 'supported_dependency',
        revision: manifest.revision,
      },
      sourceMetadata: { fixtureLocalRegistration: true, origin: manifest },
    },
  })
  const installed = await repository.publishVerifiedInstallation({
    dependencies: [
      {
        artifact: dependency('qwen3_encoder', bundle.qwen3Encoder, ANIMA_QWEN3_0_6B_ENCODER),
        role: 'qwen3_encoder',
      },
      { artifact: dependency('vae', bundle.vae, ANIMA_QWEN_IMAGE_VAE), role: 'vae' },
    ],
    primary: {
      file: local(bundle.checkpoint),
      resource: {
        creator: 'Knightus_Ai',
        displayName: 'Cyberfalafel Anima exact trained qualification',
        source: { kind: 'civitai', modelId: 1_147_756 },
        sourceMetadata: { fixtureLocalRegistration: true },
        type: 'checkpoint',
      },
      version: {
        baseModelFamily: 'anima',
        format: 'SafeTensor',
        name: 'Cyberfalafel Anima V1.0 exact historical file',
        predictionType: null,
        source: {
          expectedSha256: bundle.checkpoint.sha256,
          fileId: 3_000_817,
          kind: 'civitai',
          versionId: 3_120_487,
        },
        sourceMetadata: { fixtureLocalRegistration: true },
      },
    },
  })
  const unavailable = new Proxy(
    {},
    {
      get() {
        throw new Error('Offline trained fixture must not access CivitAI or credential storage')
      },
    },
  )
  return {
    models: new ModelService(
      repository,
      unavailable as CivitaiClient,
      unavailable as CivitaiTokenStore,
    ),
    reference: {
      baseModelFamily: 'anima',
      civitaiFileId: 3_000_817,
      civitaiModelId: 1_147_756,
      civitaiVersionId: 3_120_487,
      displayName: 'Cyberfalafel Anima exact trained qualification',
      fileSha256: bundle.checkpoint.sha256,
      kind: 'checkpoint',
      localModelId: installed.resourceId,
      localVersionId: installed.versionId,
      predictionType: null,
      versionName: 'Cyberfalafel Anima V1.0 exact historical file',
    },
  }
}
