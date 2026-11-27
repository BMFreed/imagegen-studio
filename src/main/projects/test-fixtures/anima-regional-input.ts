/**
 * Genuine private Main handoff for ROOT's original-Anima regional probes. Import runs nothing.
 * SQLite/coordinator/Save/reopen/capture/planner/coverage are real. Default authored model metadata
 * and literal masks are setup. Optional trained mode registers three exact read-only files only in
 * the fresh fixture DB and resolves the saved reference through real ModelService. The IMG visual
 * probe uses the installed CPU worker for Raster import and source composition. The caller owns
 * inference, run retention and cleanup.
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
import { compileAnimaPromptWeighting } from '../../../shared/projects/anima-prompt-weighting.js'
import { planGenerationBatch } from '../../../shared/projects/generation-batch-plan.js'
import {
  type IgsProjectDocumentV1,
  type IgsRectV1,
  type IgsRegionalGuidanceV1,
  parseProjectDocumentV1,
} from '../../../shared/projects/project-schema.js'
import type { GenerationPrompt } from '../../../shared/projects/prompt-embeddings.js'
import { ANIMA_REGIONAL_NEGATIVE_PROFILE } from '../../../shared/projects/regional-invoke-generation.js'

import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { CivitaiClient } from '../../models/civitai-client.js'
import type { CivitaiTokenStore } from '../../models/civitai-token-store.js'
import type { CapturedRegionalGuidanceInput } from '../project-regional-guidance-input.js'

import { openAppDatabase } from '../../db/database.js'
import { ANIMA_QWEN3_0_6B_ENCODER, ANIMA_QWEN_IMAGE_VAE } from '../../models/anima-manifest.js'
import { ModelRepository, type VerifiedModelArtifact } from '../../models/model-repository.js'
import { ModelService, type VerifiedAnimaGenerationBundle } from '../../models/model-service.js'
import { prepareAnimaGenerationBatch } from '../anima-generation-batch.js'
import {
  prepareAnimaGeneration,
  type PreparedAnimaGeneration,
} from '../anima-generation-preparation.js'
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
import { classifyTargetPngAlpha } from '../target-png-mode.js'
import { ProjectWorkerClient } from '../worker-client.js'

const REPO = fileURLToPath(new URL('../../../../', import.meta.url))
const VARIANTS = [
  'base',
  'swapped',
  'zero',
  'ordinary',
  'empty',
  'inherited',
  'negative',
  'negative-neighbor',
  'negative-only',
] as const
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
const COUNTERTOP_SCENE = {
  globalPositive:
    'anime still life illustration, front view, medium wide shot, continuous pale wooden tabletop in front of a plain light blue wall, open display space, even lighting',
  regionalTexts: [
    'a red apple with a small green leaf on a continuous pale wooden tabletop in front of a plain light blue wall',
    'a blue ceramic mug with a loop handle on a continuous pale wooden tabletop in front of a plain light blue wall',
  ],
} as const
const INSTALLED_VISUAL_SCENES = {
  'countertop-gap-closed': COUNTERTOP_SCENE,
  'countertop-global-subjects': {
    ...COUNTERTOP_SCENE,
    globalPositive:
      'anime still life illustration, front view, medium wide shot, continuous pale wooden tabletop in front of a plain light blue wall, one red apple and one blue ceramic mug, even lighting',
  },
  'countertop-scene': COUNTERTOP_SCENE,
  'countertop-separate-subjects': {
    ...COUNTERTOP_SCENE,
    globalPositive:
      'anime still life illustration, front view, medium wide shot, continuous pale wooden tabletop in front of a plain light blue wall, one red apple and one blue ceramic mug, two separate objects with a clear stretch of empty tabletop between them, even lighting',
  },
  'countertop-subject-weight': {
    globalPositive:
      'anime still life illustration, front view, medium wide shot, continuous pale wooden tabletop in front of a plain light blue wall, open display space, even lighting',
    regionalTexts: [
      '(a red apple with a small green leaf)1.5 on a continuous pale wooden tabletop in front of a plain light blue wall',
      '(a blue ceramic mug with a loop handle)1.5 on a continuous pale wooden tabletop in front of a plain light blue wall',
    ],
  },
  'festival-stall': {
    globalPositive:
      'anime illustration of a Japanese festival stall, one continuous wooden display shelf across the lower foreground, open display space, visible backdrop, medium wide shot',
    regionalTexts: [
      'a red paper lantern with curved ribs and a small tassel',
      'a white fox festival mask with pointed ears and red markings',
    ],
  },
} as const
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
  schema: 'main-anima-regional-positive-v1' | 'main-anima-regional-signed-v1'
  variant: AnimaRegionalFixtureVariant
  verifiedBundle?: VerifiedAnimaGenerationBundle
}
interface InstalledVisualInput {
  compiledPrompts: readonly CompiledCurrentCanvasAnimaRegionalPrompt[]
  models: ModelService
  prepared: PreparedAnimaGeneration
  recipe: CurrentCanvasRegionalRecipe
}

type Region = CurrentCanvasRegionalRecipe['regions'][number]

/** Run only under the caller's explicit process/artifact ownership; no implicit execution on import. */
export async function produceAnimaRegionalInputFixture(
  root: string,
  options: {
    guidanceScale?: number
    height?: number
    inheritGlobalNegative?: readonly [boolean, boolean]
    installedVisual?: {
      pythonExecutable: string
      runtimeRoot: string
      useCase: (input: InstalledVisualInput) => Promise<unknown>
    }
    regionalNegativeTexts?: readonly [string, string]
    regionalTexts?: readonly [string, string]
    scene?: keyof typeof INSTALLED_VISUAL_SCENES
    seed?: number
    steps?: number
    trainedBundle?: AnimaRegionalTrainedBundle
    uncoveredBackground?: boolean
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
  const regionalTexts = captureRegionalTexts(options.regionalTexts)
  const trainedBundle =
    options.trainedBundle === undefined ? undefined : captureTrainedBundle(options.trainedBundle)
  assert.ok(VARIANTS.includes(variant), 'The fixture variant must be explicitly supported')
  const { installedVisual, scene: sceneName, uncoveredBackground = false } = options
  assert.ok(sceneName === undefined || Object.hasOwn(INSTALLED_VISUAL_SCENES, sceneName))
  const scene = sceneName && INSTALLED_VISUAL_SCENES[sceneName]
  const closedGap = sceneName === 'countertop-gap-closed'
  if (installedVisual || scene) {
    assert.ok(!installedVisual || trainedBundle)
    assert.ok(variant === 'ordinary' || variant === 'base' || variant === 'swapped')
    assert.deepEqual([width, height, steps, guidanceScale], [512, 512, 20, 4])
    if (scene) {
      assert.ok(seed === 123 || seed === 124)
      assert.ok(!uncoveredBackground)
      assert.deepEqual(regionalTexts, scene.regionalTexts)
    } else {
      assert.equal(seed, 123)
      assert.equal(regionalTexts[0], REGIONAL_TEXTS[0])
      if (regionalTexts[1] !== REGIONAL_TEXTS[1]) {
        assert.ok(uncoveredBackground, 'The matched weight comparison uses the fixed inset masks')
        assert.equal(regionalTexts[1], '(blue scarf)1.5, one white cat')
      }
    }
  } else {
    assert.ok(variant !== 'ordinary' && !uncoveredBackground)
  }
  assert.ok(!uncoveredBackground || variant === 'base' || variant === 'swapped')
  const signed =
    variant === 'negative' || variant === 'negative-neighbor' || variant === 'negative-only'
  assert.ok(
    signed ||
      (options.inheritGlobalNegative === undefined && options.regionalNegativeTexts === undefined),
    'Negative fixture overrides require an explicit signed variant',
  )
  const regionalNegativeTexts = signed
    ? captureNegativeTexts(options.regionalNegativeTexts, [
        variant === 'negative-neighbor' ? '(green scarf)1.5' : '(red scarf)1.5',
        'dormant {not|selected} local negative',
      ])
    : null
  const inheritGlobalNegative = signed
    ? captureNegativeInheritance(options.inheritGlobalNegative)
    : null
  if (signed) {
    for (const index of [0, 1] as const) {
      if (!inheritGlobalNegative![index]) {
        compileAnimaPromptWeighting(regionalNegativeTexts![index])
      }
    }
  }
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
    const maskY = uncoveredBackground || scene ? 64 : 0
    const maskHeight = uncoveredBackground || scene ? 288 : height
    const activeOwners = variant === 'ordinary' ? [] : ([0, 1] as const)
    for (const index of activeOwners) {
      const firstX = scene ? 32 + index * (closedGap ? 224 : 256) : index === 0 ? 0 : middle - 2
      const maskWidth = scene
        ? closedGap
          ? 224
          : 192
        : (index === 0 ? middle + 2 : width) - firstX
      const alpha = Uint8Array.from({ length: maskWidth * maskHeight }, (_, sample) => {
        if (scene) {
          return 255
        }
        const x = firstX + (sample % maskWidth)
        if (index === 0) {
          return x < middle ? 255 : x === middle ? 128 : 127
        }
        return x >= middle ? 255 : x === middle - 1 ? 128 : 127
      })
      const bytes = encodeProjectMaskPng(alpha, maskWidth, maskHeight)
      const sha256 = digest(bytes)
      const member = `assets/masks/${MASK_IDS[index]}/${sha256}.png`
      sources[member] = { bytes }
      const maskPath = path.join(root, `input-mask-${index}.png`)
      await writeFile(maskPath, bytes, { flag: 'wx', mode: 0o600 })
      maskPaths.push(maskPath)
      // Invoke a61ac4fb addRegionalGuidance passes authored regional text verbatim.
      // These fixture inputs add no global-prompt concatenation or inheritance.
      const selectedText = variant === 'swapped' ? regionalTexts[1 - index] : regionalTexts[index]
      regions.push({
        enabled: variant !== 'zero',
        id: REGION_IDS[index],
        locked: index === 0,
        mask: {
          asset: {
            bytes: bytes.length,
            height: maskHeight,
            path: member,
            sha256,
            width: maskWidth,
          },
          bounds: { height: maskHeight, width: maskWidth, x: bbox.x + firstX, y: bbox.y + maskY },
          id: MASK_IDS[index],
          revision: 1,
        },
        name: index === 0 ? 'First independent region' : 'Second independent region',
        overlayOpacity: index === 0 ? 0 : 0.5,
        prompts: {
          negative: signed
            ? prompt(regionalNegativeTexts![index])
            : variant === 'inherited'
              ? prompt('dormant {not|selected} local negative')
              : prompt(''),
          positive:
            variant === 'negative-only'
              ? null
              : variant === 'empty'
                ? index === 0
                  ? prompt('')
                  : null
                : prompt(selectedText),
          useGlobalNegativePrompt: signed ? inheritGlobalNegative![index] : variant === 'inherited',
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
        positivePrompt: prompt(scene?.globalPositive ?? '(two white cats)1.25 on one bench'),
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
    const prepareRegional = async (capture: CapturedRegionalGuidanceInput) => {
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
        compiledPrompts: signed
          ? compileCurrentCanvasAnimaRegionalPrompts(recipe, {
              negativeProfile: 'invoke-anima-regional-negative-v1',
            })
          : compileCurrentCanvasAnimaRegionalPrompts(recipe),
        recipe,
        verifiedBundle,
      }
    }
    const prepared = installedVisual
      ? await service.withCapturedCurrentCanvasRegionalGenerationInput(tab.id, async (capture) => {
          assert.ok(trained)
          const resolved = await prepareRegional(capture.regional)
          capture.assertCurrent()
          const scratch = path.join(root, 'scratch')
          const worker = await ProjectWorkerClient.start(
            {
              pythonExecutable: installedVisual.pythonExecutable,
              runtimeRoot: installedVisual.runtimeRoot,
              stagingBasePath: scratch,
            },
            {
              environment: {
                CUDA_VISIBLE_DEVICES: '',
                LANG: 'C.UTF-8',
                LC_ALL: 'C.UTF-8',
                TMPDIR: scratch,
              },
            },
          )
          const target = await capture.composeTarget(worker).finally(() => worker.close())
          assert.equal(ProjectWorkerClient.hasUnconfirmedExit(), false)
          assert.equal(target.mode, 'txt2img')
          const prepared = await prepareAnimaGeneration({ modelService: trained.models, target })
          assert.equal(prepared.context.mode, 'txt2img')
          assert.deepEqual(prepared.context.bbox, bbox)
          await installedVisual.useCase({
            compiledPrompts: resolved.compiledPrompts,
            models: trained.models,
            prepared,
            recipe: resolved.recipe,
          })
          capture.assertCurrent()
          return resolved
        })
      : await service.withCapturedRegionalGuidanceInput(tab.id, prepareRegional)
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
      schema: signed ? 'main-anima-regional-signed-v1' : 'main-anima-regional-positive-v1',
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

const ANIMA_REGIONAL_NEGATIVE_VISUAL_CASES = [
  { label: 'baseline', negativeSide: null },
  { label: 'negative-left', negativeSide: 'left' },
  { label: 'negative-right', negativeSide: 'right' },
] as const
const ANIMA_APPLE_GLOBAL_NEGATIVE_VISUAL_CASE = {
  label: 'global-negative',
  negativeSide: null,
} as const

export interface AnimaRegionalNegativeVisualUseCase {
  case:
    | (typeof ANIMA_REGIONAL_NEGATIVE_VISUAL_CASES)[number]
    | typeof ANIMA_APPLE_GLOBAL_NEGATIVE_VISUAL_CASE
  compiledPrompts: readonly CompiledCurrentCanvasAnimaRegionalPrompt[]
  models: ModelService
  prepared: PreparedAnimaGeneration
  recipe: CurrentCanvasRegionalRecipe
}

/**
 * InvokeAI 4875d96531ca6712b288f6e660fcbb34143408c1:
 * frontend/webv2/src/features/generation/core/canvas/addRegionalGuidance.ts pairs local text with
 * its mask. app/invocations/anima/anima_denoise.py calls backend/anima/scheduler_driver.py and
 * applies the signed masks using backend/anima/{regional_prompting,anima_transformer_patch}.py. The
 * webv1 buildAnimaGraph.ts and addImageToImage.ts pass the canvas composite to
 * app/invocations/vae/anima_image_to_latents.py, which converts its input before encoding. InvokeAI
 * 64ff2c600f04d220e470fdaeec570bd402af42a7: webv2 core/graph.ts authors the unmasked negative into
 * the CFG collector. The same denoiser keeps that bank image-wide.
 */
export async function produceAnimaRegionalNegativeVisualProbe(options: {
  pythonExecutable: string
  run: string
  runtimeRoot: string
  sourceImage: AnimaRegionalTrainedFile
  trainedBundle: AnimaRegionalTrainedBundle
  useCase: (input: AnimaRegionalNegativeVisualUseCase) => Promise<unknown>
}): Promise<void> {
  const { pythonExecutable, run, runtimeRoot, useCase } = options
  const trainedBundle = captureTrainedBundle(options.trainedBundle)
  const sourceImage = structuredClone(options.sourceImage)
  const runs = path.join(os.homedir(), '.codex/artifacts/imagegen-studio/runs')
  const runParent = path.dirname(run)
  const anchoredBaselineProfile = runParent === path.join(runs, 'anima-apple-negative-anchored')
  const appleGlobalProfile = runParent === path.join(runs, 'anima-apple-negative-global')
  const anchoredAppleProfile =
    anchoredBaselineProfile ||
    appleGlobalProfile ||
    runParent === path.join(runs, 'anima-apple-negative-anchored-spatial')
  const appleProfile = anchoredAppleProfile || runParent === path.join(runs, 'anima-apple-negative')
  if (appleProfile) {
    assert.match(path.basename(run), /^\d{8}-r[1-9]\d*$/)
  } else {
    assert.equal(path.dirname(run), path.join(runs, 'anima-negative-visual'))
    assert.match(path.basename(run), /^20261118-r[1-9]\d*$/)
  }
  assert.equal(await realpath(run), run)
  assert.equal(
    sourceImage.path,
    path.join(run, appleProfile ? 'apple-mug-source.png' : 'cat-scarves-source.png'),
  )
  assert.equal(await realpath(sourceImage.path), sourceImage.path)
  const sourceStat = await lstat(sourceImage.path)
  assert.ok(sourceStat.isFile() && sourceStat.size > 0 && sourceStat.size <= 2 * 1024 ** 2)
  const source = await readFile(sourceImage.path)
  assert.equal(source.length, sourceImage.byteSize)
  assert.equal(digest(source), sourceImage.sha256)
  const bbox: IgsRectV1 = { height: 512, width: 512, x: 0, y: 0 }
  // The native apple source is RGB. Raster import converts it before canvas target validation.
  if (!appleProfile) {
    assert.equal(classifyTargetPngAlpha(source, bbox.width, bbox.height), 'img2img')
  }

  const data = path.join(run, 'anima-main-payload')
  const scratch = path.join(data, 'scratch')
  const artifacts = path.join(run, 'anima-main-inputs')
  for (const directory of [data, scratch, artifacts]) {
    await mkdir(directory, { mode: 0o700 })
  }
  const keep = async (name: string, bytes: Buffer) => {
    const file = path.join(artifacts, name)
    await writeFile(file, bytes, { flag: 'wx', mode: 0o600 })
    return { byteSize: bytes.length, path: file, sha256: digest(bytes) }
  }
  const database = openAppDatabase(data, path.join(REPO, 'src/main/db/migrations'))
  const service = new ProjectService({
    autosaveOptions: { debounceMs: 60_000, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    dataRoot: data,
    repository: new ProjectIndexRepository(database.db),
    roots: {
      placeholdersDir: path.join(REPO, 'src/main/projects/placeholders'),
      scratchDir: scratch,
    },
    shadow: new ProjectShadowStore(path.join(data, 'autosave')),
  })
  const startCpu = () =>
    ProjectWorkerClient.start(
      { pythonExecutable, runtimeRoot, stagingBasePath: scratch },
      {
        environment: {
          CUDA_VISIBLE_DEVICES: '',
          LANG: 'C.UTF-8',
          LC_ALL: 'C.UTF-8',
          TMPDIR: scratch,
        },
      },
    )
  let worker: ProjectWorkerClient | undefined
  let failure: unknown
  try {
    const { models, reference } = await registerTrainedBundle(
      new ModelRepository(database.db),
      trainedBundle,
    )
    const tab = await service.create({
      height: 512,
      title: 'Anima regional negative visual control',
      width: 512,
    })
    const owner = () => {
      const current = service.getOpenDocumentForAcceptance(tab.id)
      assert.ok(current)
      return current
    }
    worker = await startCpu()
    await service.importRasterImage(tab.id, sourceImage.path, worker)
    await worker.close()
    worker = undefined
    assert.equal(ProjectWorkerClient.hasUnconfirmedExit(), false)
    const initial = structuredClone(owner().document)
    assert.deepEqual(initial.primaryBbox, bbox)
    assert.equal(initial.layers.length, 1)
    const sharedPositive = appleProfile
      ? 'a pale wooden tabletop against a plain light blue wall, even lighting'
      : 'one white cat wearing a scarf'
    const positives = anchoredAppleProfile
      ? [
          'a red apple with a small green leaf on a pale wooden tabletop against a plain light blue wall, even lighting',
          'a blue ceramic mug with a loop handle on a pale wooden tabletop against a plain light blue wall, even lighting',
        ]
      : [sharedPositive, sharedPositive]
    const negative = appleProfile ? '(red apple)2.0' : '(red scarf)1.5'
    const globalPositive = appleProfile
      ? 'anime still life illustration, a continuous pale wooden tabletop against a plain light blue wall, front view, even lighting'
      : 'two white cats wearing scarves, illustration, plain light background'
    const maskPng = encodeProjectMaskPng(new Uint8Array(256 * 512).fill(255), 256, 512)
    const maskHash = digest(maskPng)
    const sources: Record<string, { bytes: Buffer }> = {}
    const masks: IgsRegionalGuidanceV1['mask'][] = []
    const sides = ['left', 'right'] as const
    type RetainedFile = Awaited<ReturnType<typeof keep>>
    const coverage: { alpha: Buffer; alphaFile: RetainedFile; maskFile: RetainedFile }[] = []
    for (const [index, side] of sides.entries()) {
      const id = MASK_IDS[index]
      const member = `assets/masks/${id}/${maskHash}.png`
      const bounds = { height: 512, width: 256, x: index * 256, y: 0 }
      const alpha = Buffer.alloc(512 * 512)
      for (let y = 0; y < 512; y++) {
        const start = y * 512 + bounds.x
        alpha.fill(255, start, start + 256)
      }
      sources[member] = { bytes: maskPng }
      masks.push({
        asset: { bytes: maskPng.length, height: 512, path: member, sha256: maskHash, width: 256 },
        bounds,
        id,
        revision: 1,
      })
      coverage.push({
        alpha,
        alphaFile: await keep(`${side}.alpha8`, alpha),
        maskFile: await keep(`mask-${side}.png`, maskPng),
      })
    }

    let targetSha: string | undefined
    const cases = appleGlobalProfile
      ? [ANIMA_APPLE_GLOBAL_NEGATIVE_VISUAL_CASE]
      : anchoredBaselineProfile
        ? [ANIMA_REGIONAL_NEGATIVE_VISUAL_CASES[0]]
        : ANIMA_REGIONAL_NEGATIVE_VISUAL_CASES
    for (const testCase of cases) {
      const regionalGuidance = sides.map((side, index) => ({
        enabled: true,
        id: REGION_IDS[index],
        locked: false,
        mask: masks[index],
        name: `${side} ${appleProfile ? 'tabletop' : 'cat'}`,
        overlayOpacity: 0,
        prompts: {
          negative: prompt(testCase.negativeSide === side ? negative : ''),
          positive: prompt(positives[index]),
          useGlobalNegativePrompt: false,
        },
      }))
      const document = parseProjectDocumentV1({
        ...initial,
        documentRevision: owner().document.documentRevision,
        generationDraft: {
          cfgRescale: 0,
          loras: [],
          model: reference,
          negativePrompt: prompt(
            appleGlobalProfile ? '(blur)0.75, noise, (red apple)2.0' : '(blur)0.75, noise',
          ),
          positivePrompt: prompt(globalPositive),
          sampling: {
            animaMethod: 'heun',
            cfgScale: 4,
            denoisingStrength: appleProfile ? 0.65 : 0.5,
            sampler: null,
            scheduler: null,
            steps: 20,
          },
          seed: { policy: 'fixed', value: 123 },
          vae: null,
          vaePrecision: 'Auto',
        },
        regionalGuidance,
      })
      await owner().applyDocument(document, sources, {
        expectedDocumentEpoch: owner().documentEpoch,
        expectedDocumentRevision: document.documentRevision,
      })
      await service.save(tab.id)
      const packagePath = owner().filePath
      await service.close(tab.id)
      assert.equal((await service.open(tab.id)).kind, 'opened')
      await service.flushAutosave(tab.id)
      assert.equal(owner().dirty, false)
      const authored = structuredClone(owner().document)
      assert.deepEqual(authored.layers, initial.layers)
      assert.deepEqual(authored.regionalGuidance, regionalGuidance)
      const packageFile = await keep(`${testCase.label}.igs`, await readFile(packagePath))
      assert.deepEqual((await readIgsPackage(packageFile.path)).project, authored)

      await service.withCapturedCurrentCanvasRegionalGenerationInput(tab.id, async (capture) => {
        capture.assertCurrent()
        assert.deepEqual(capture.document, authored)
        worker = await startCpu()
        const target = await capture.composeTarget(worker)
        await worker.close()
        worker = undefined
        assert.equal(ProjectWorkerClient.hasUnconfirmedExit(), false)
        assert.equal(target.mode, 'img2img')
        const prepared = await prepareAnimaGeneration({ modelService: models, target })
        assert.equal(prepared.context.mode, 'img2img')
        assert.deepEqual(prepared.context.bbox, bbox)
        targetSha ??= prepared.context.target.sha256
        assert.equal(
          prepared.context.target.sha256,
          targetSha,
          'Every case must consume the same source target',
        )
        const targetFile = await keep(`${testCase.label}.target.png`, prepared.targetPngBytes)
        assert.equal(targetFile.sha256, targetSha)
        const batch = prepareAnimaGenerationBatch({ iterations: 1, prepared })
        assert.equal(batch.truncated, false)
        assert.equal(batch.items.length, 1)
        const { iteration, promptPairIndex, prompts, samplingPlan, seed } = batch.items[0]
        const recipe = await prepareCurrentCanvasRegionalRecipe({
          capture: capture.regional,
          job: {
            bbox,
            documentId: authored.documentId,
            documentRevision: authored.documentRevision,
            family: 'anima',
            item: { iteration, promptPairIndex, prompts, seed },
          },
        })
        const compiledPrompts = compileCurrentCanvasAnimaRegionalPrompts(recipe, {
          negativeProfile: ANIMA_REGIONAL_NEGATIVE_PROFILE,
        })
        assert.equal(recipe.regions.length, 2)
        const regions = recipe.regions.map((region, index) => {
          const { alpha, ...descriptor } = region.coverage
          assert.equal(region.regionId, REGION_IDS[index])
          assert.equal(region.maskId, MASK_IDS[index])
          assert.equal(region.positive?.text, positives[index])
          assert.equal(region.negative.source, 'regional')
          assert.equal(
            region.negative.prompt.text,
            testCase.negativeSide === sides[index] ? negative : '',
          )
          assert.equal(descriptor.kind, 'covered')
          assert.ok(Buffer.from(alpha).equals(coverage[index].alpha))
          return {
            ...region,
            coverage: { ...descriptor, alpha: coverage[index].alphaFile },
            mask: coverage[index].maskFile,
          }
        })
        await keep(
          `${testCase.label}.json`,
          Buffer.from(
            `${JSON.stringify(
              {
                authoredDocument: authored,
                case: testCase,
                compiledPrompts,
                package: packageFile,
                prepared: prepared.context,
                recipe: { ...recipe, regions },
                samplingPlan,
                schema: 'main-anima-regional-negative-visual-img-v1',
                sourceImage,
                target: targetFile,
              },
              null,
              2,
            )}\n`,
          ),
        )
        await useCase({ case: testCase, compiledPrompts, models, prepared, recipe })
        capture.assertCurrent()
        assert.equal(owner().dirty, false)
        assert.deepEqual(owner().document, authored)
        assert.equal(digest(await readFile(packagePath)), packageFile.sha256)
      })
    }
  } catch (error) {
    failure = error
    throw error
  } finally {
    const cleanupErrors: unknown[] = []
    try {
      await worker?.close()
    } catch (error) {
      cleanupErrors.push(error)
    }
    for (const tab of service.getOpenTabs()) {
      try {
        await (tab.dirty ? service.discardAndClose(tab.id) : service.close(tab.id))
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    try {
      await database.close()
    } catch (error) {
      cleanupErrors.push(error)
    }
    if (cleanupErrors.length) {
      throw new AggregateError(
        failure === undefined ? cleanupErrors : [failure, ...cleanupErrors],
        'Anima visual fixture closure failed',
      )
    }
  }
}

function captureNegativeTexts(
  value: unknown,
  defaults: readonly [string, string],
): readonly [string, string] {
  const selected = value === undefined ? defaults : value
  assert.ok(
    Array.isArray(selected) && selected.length === 2,
    'Exactly two regional negative texts are required',
  )
  for (const text of selected) {
    assert.ok(
      typeof text === 'string' &&
        Buffer.from(text, 'utf8').toString('utf8') === text &&
        Buffer.byteLength(text, 'utf8') <= 16 * 1024,
      'Regional negative text must be bounded valid Unicode',
    )
  }
  return Object.freeze([selected[0] as string, selected[1] as string] as const)
}

function captureNegativeInheritance(value: unknown): readonly [boolean, boolean] {
  const selected = value === undefined ? [false, true] : value
  assert.ok(
    Array.isArray(selected) &&
      selected.length === 2 &&
      selected.every((entry) => typeof entry === 'boolean'),
    'Exactly two regional negative inheritance flags are required',
  )
  return Object.freeze([selected[0], selected[1]] as const)
}

function captureRegionalTexts(value: unknown): readonly [string, string] {
  if (value === undefined) {
    return REGIONAL_TEXTS
  }
  assert.ok(Array.isArray(value) && value.length === 2, 'Exactly two regional texts are required')
  const first: unknown = value[0]
  const second: unknown = value[1]
  assert.ok(typeof first === 'string' && first.trim().length > 0, 'Regional text must be nonempty')
  assert.ok(
    typeof second === 'string' && second.trim().length > 0,
    'Regional text must be nonempty',
  )
  compileAnimaPromptWeighting(first)
  compileAnimaPromptWeighting(second)
  return Object.freeze([first, second] as const)
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
