/**
 * Genuine private Main handoff for ROOT's original-Anima regional probes. Import runs nothing.
 * SQLite/coordinator/Save/reopen/capture/planner/coverage are real. Authored model metadata and
 * literal masks are setup, not installed-checkpoint or trained execution evidence. No worker is
 * spawned and no public generation permission is granted. The caller owns the fresh root/cleanup.
 *
 * InvokeAI a61ac4fb: backend/anima/{regional_prompting,conditioning_data}.py and
 * app/invocations/anima/anima_denoise.py; the existing Studio compiler remains the sole parser.
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

import { openAppDatabase } from '../../db/database.js'
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
    modelMetadataOnly: true
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
}

type Region = CurrentCanvasRegionalRecipe['regions'][number]

/** Run only under the caller's explicit process/artifact ownership; no implicit execution on import. */
export async function produceAnimaRegionalInputFixture(
  root: string,
  options: {
    height?: number
    seed?: number
    variant?: AnimaRegionalFixtureVariant
    width?: number
  } = {},
): Promise<AnimaRegionalInputFixture> {
  const { height = 72, seed = 123, variant = 'base', width = 104 } = options
  assert.ok(VARIANTS.includes(variant), 'The fixture variant must be explicitly supported')
  const sampling = compileAnimaFlowSamplingPlan({
    guidanceScale: 4,
    height,
    mode: 'txt2img',
    scheduler: 'euler',
    seed,
    steps: 2,
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
        model: {
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
          cfgScale: 4,
          denoisingStrength: null,
          steps: 2,
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
      return { compiledPrompts: compileCurrentCanvasAnimaRegionalPrompts(recipe), recipe }
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
        modelMetadataOnly: true,
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
