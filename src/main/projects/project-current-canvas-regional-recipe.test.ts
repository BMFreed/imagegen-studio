import {
  GENERATION_BATCH_PROMPT_MAX_BYTES,
  planGenerationBatch,
  type PlannedGenerationBatchItem,
} from '../../shared/projects/generation-batch-plan.js'
import { PROJECT_MASK_MAX_COORDINATE } from '../../shared/projects/project-mask.js'
import {
  createEmptyProjectDocumentV1,
  type IgsProjectAssetRefV1,
  type IgsProjectDocumentV1,
  type IgsRectV1,
  type IgsRegionalGuidanceReferenceImageV1,
  type IgsRegionalGuidanceV1,
  type IgsSmartPatchLayerV1,
  parseProjectDocumentV1,
} from '../../shared/projects/project-schema.js'
import {
  type GenerationPrompt,
  getPromptEmbeddingMatches,
  type PromptEmbeddingRef,
} from '../../shared/projects/prompt-embeddings.js'

import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { CapturedRegionalGuidanceInput } from './project-regional-guidance-input.js'

import { openAppDatabase } from '../db/database.js'
import { readIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import {
  CurrentCanvasRegionalRecipeError,
  prepareCurrentCanvasRegionalRecipe,
} from './project-current-canvas-regional-recipe.js'
import { ProjectIndexRepository } from './project-index.js'
import { encodeProjectMaskPng } from './project-mask.js'
import {
  projectRegionalGuidanceCoverage,
  type ProjectRegionalGuidanceCoverage,
} from './project-regional-guidance-coverage.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
import {
  acceptedOutputPngFixture,
  acceptedRasterProvenanceFixture,
} from './test-fixtures/accepted-provenance.js'
import { literalSmartPatchColorPng } from './test-fixtures/smart-patch-input-material.js'
import { smartPatchVariantMetadataFixture } from './test-fixtures/smart-patch-variant.js'

type RecipeInput = Parameters<typeof prepareCurrentCanvasRegionalRecipe>[0]
type Recipe = Awaited<ReturnType<typeof prepareCurrentCanvasRegionalRecipe>>
type RecipeCode = CurrentCanvasRegionalRecipeError['code']
type Family = RecipeInput['job']['family']
type Snapshot = CapturedRegionalGuidanceInput['snapshot']

const TARGET: IgsRectV1 = { height: 2, width: 3, x: -2, y: -2 }
const SOFT_ALPHA = [1, 53, 255, 128, 254, 0]
const OTHER_ALPHA = [255, 127, 2, 3, 0, 64]
const AGGREGATE_ALPHA_SAMPLES = 64 * 1024 * 1024
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

function deferred() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

async function projectionStarted(entered: ReturnType<typeof deferred>, preparing: Promise<Recipe>) {
  await Promise.race([
    entered.promise,
    preparing.then(() => {
      assert.fail('Recipe unexpectedly finished without entering the held projection')
    }),
  ])
}

function model(family: Family = 'illustrious'): NonNullable<Snapshot['generationDraft']['model']> {
  return {
    baseModelFamily: family,
    civitaiFileId: null,
    civitaiModelId: null,
    civitaiVersionId: null,
    displayName: `Unresolved authored ${family} checkpoint`,
    fileSha256: 'a'.repeat(64),
    kind: 'checkpoint',
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: family === 'illustrious' ? 'epsilon' : null,
    versionName: 'Authored metadata only',
  }
}

function embedding(token: string, family: Family = 'illustrious'): PromptEmbeddingRef {
  return {
    resource: {
      ...model(family),
      displayName: `Unresolved ${token}`,
      kind: 'embedding',
      predictionType: null,
    },
    token,
  }
}

function prompt(text: string, embeddingRefs: PromptEmbeddingRef[] = []): GenerationPrompt {
  return { embeddingRefs, text }
}

function region(overrides: Partial<IgsRegionalGuidanceV1> = {}): IgsRegionalGuidanceV1 {
  return {
    enabled: true,
    id: randomUUID(),
    locked: false,
    mask: { asset: null, id: randomUUID(), revision: 0 },
    name: 'Independent regional owner',
    overlayOpacity: 0.5,
    ...overrides,
  }
}

function documentWith(
  regions: IgsRegionalGuidanceV1[] = [region()],
  family: Family = 'illustrious',
  bbox: IgsRectV1 = TARGET,
): IgsProjectDocumentV1 {
  const base = createEmptyProjectDocumentV1({ primaryBbox: bbox, title: 'Private recipe fixture' })
  return parseProjectDocumentV1({
    ...base,
    generationDraft: {
      ...base.generationDraft,
      model: model(family),
      negativePrompt: prompt('Canvas static negative'),
      positivePrompt: prompt('{Canvas day|Canvas night}'),
      seed: { policy: 'fixed', value: 0 },
    },
    lastActualSeedSnapshot: 0,
    regionalGuidance: regions,
  })
}

function snapshotOf(document: IgsProjectDocumentV1): Snapshot {
  return structuredClone({
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    generationDraft: document.generationDraft,
    lastActualSeedSnapshot: document.lastActualSeedSnapshot,
    primaryBbox: document.primaryBbox,
    ...(document.regionalGuidance === undefined
      ? {}
      : { regionalGuidance: document.regionalGuidance }),
  })
}

/** The existing Main planner supplies concrete items; this adapter cannot prove batch membership. */
function concreteItems(snapshot: Snapshot): readonly PlannedGenerationBatchItem[] {
  return planGenerationBatch({
    baseSeed: 0,
    iterations: 1,
    maxJobs: 32,
    maxPrompts: 16,
    negativePrompt: snapshot.generationDraft.negativePrompt.text,
    positivePrompt: 'Concrete global positive',
    seedBehavior: 'per-prompt',
  }).items
}

function jobFor(snapshot: Snapshot, item = concreteItems(snapshot)[0]): RecipeInput['job'] {
  const family = snapshot.generationDraft.model!.baseModelFamily
  assert.ok(family === 'illustrious' || family === 'anima')
  return {
    bbox: structuredClone(snapshot.primaryBbox),
    documentId: snapshot.documentId,
    documentRevision: snapshot.documentRevision,
    family,
    item: structuredClone(item),
  }
}

/**
 * Schema-valid metadata with a controlled projection seam; no capture or resource I/O is mocked as
 * real.
 */
function pureInput(
  document = documentWith(),
  projection?: CapturedRegionalGuidanceInput['projectMask'],
) {
  const calls: { regionId: string; target: IgsRectV1 }[] = []
  const capture: CapturedRegionalGuidanceInput = {
    assets: [],
    projectMask: async (regionId, target) => {
      calls.push({ regionId, target: structuredClone(target) })
      return projection
        ? await projection(regionId, target)
        : projectRegionalGuidanceCoverage(null, target)
    },
    readAsset: async () => {
      assert.fail('Semantic recipe preparation must use the existing projectMask capability only')
    },
    snapshot: snapshotOf(parseProjectDocumentV1(document)),
    stagingRoot: '/private-test-lease-not-a-result',
  }
  const input: RecipeInput = { capture, job: jobFor(capture.snapshot) }
  return { calls, capture, input }
}

async function refused(
  input: RecipeInput,
  code: RecipeCode,
  message = 'The regional recipe must refuse with the expected error',
) {
  await assert.rejects(
    prepareCurrentCanvasRegionalRecipe(input),
    (error: unknown) => {
      assert.ok(error instanceof CurrentCanvasRegionalRecipeError, message)
      assert.equal(error.code, code, message)
      return true
    },
    message,
  )
}

function assertNoLeaseFields(recipe: Recipe, capture: CapturedRegionalGuidanceInput) {
  const visit = (value: unknown) => {
    if (value === null || typeof value !== 'object' || value instanceof Uint8Array) {
      return
    }
    for (const [key, child] of Object.entries(value)) {
      assert.ok(
        !['assets', 'filePath', 'projectMask', 'readAsset', 'stagingRoot'].includes(key),
        key,
      )
      assert.notEqual(child, capture.stagingRoot)
      visit(child)
    }
  }
  visit(recipe)
  assert.deepEqual(Object.keys(recipe).sort(), [
    'bbox',
    'documentId',
    'documentRevision',
    'family',
    'globalPrompts',
    'item',
    'kind',
    'regions',
  ])
}

test('recipe preserves one concrete item and exact Current Canvas context without global-positive composition', async () => {
  const local = prompt('  local subject, (soft:0.5)\n ')
  const f = pureInput(
    documentWith([
      region({
        prompts: {
          negative: null,
          positive: local,
          useGlobalNegativePrompt: true,
        },
      }),
    ]),
  )
  const before = structuredClone(f.capture.snapshot)
  const result = await prepareCurrentCanvasRegionalRecipe(f.input)
  assert.equal(result.kind, 'current-canvas-regional-recipe')
  assert.equal(result.documentId, before.documentId)
  assert.equal(result.documentRevision, before.documentRevision)
  assert.equal(result.family, 'illustrious')
  assert.deepEqual(result.bbox, TARGET)
  assert.deepEqual(result.item, f.input.job.item)
  assert.deepEqual(result.regions[0].positive, local)
  assert.deepEqual(result.regions[0].negative, {
    prompt: prompt('Canvas static negative'),
    source: 'current-canvas',
  })
  assert.deepEqual(f.capture.snapshot, before)
  assertNoLeaseFields(result, f.capture)
})

test('recipe global prompts select exact captured refs for each concrete pair and polarity', async () => {
  const positive = embedding('<positive>')
  const negative = embedding('<negative>')
  const unused = embedding('<unused>')
  const document = documentWith()
  document.generationDraft.positivePrompt = prompt('{<positive>|sun}', [unused, positive])
  document.generationDraft.negativePrompt = prompt('{<negative>|blur}', [unused, negative])
  const f = pureInput(document)
  const before = structuredClone(f.capture.snapshot)
  const items = planGenerationBatch({
    baseSeed: 0,
    iterations: 1,
    maxJobs: 16,
    maxPrompts: 16,
    negativePrompt: document.generationDraft.negativePrompt.text,
    positivePrompt: document.generationDraft.positivePrompt.text,
    seedBehavior: 'per-prompt',
  }).items
  assert.equal(items.length, 4)
  for (const item of items) {
    f.input.job = jobFor(f.capture.snapshot, item)
    const result = await prepareCurrentCanvasRegionalRecipe(f.input)
    assert.deepEqual(result.globalPrompts, {
      negative: prompt(
        item.prompts.negative,
        item.prompts.negative === '<negative>' ? [negative] : [],
      ),
      positive: prompt(
        item.prompts.positive,
        item.prompts.positive === '<positive>' ? [positive] : [],
      ),
    })
    assert.deepEqual(result.item, item)
  }
  assert.deepEqual(f.capture.snapshot, before)
})

test('recipe global prompt ownership remains explicit without regions and with equal polarity literals', async () => {
  const positive = embedding('<same>')
  const negative = embedding('<same>')
  const document = documentWith([])
  document.generationDraft.positivePrompt = prompt('<same>', [positive])
  document.generationDraft.negativePrompt = prompt('<same>', [negative])
  const f = pureInput(document)
  f.input.job = jobFor(f.capture.snapshot, {
    iteration: 0,
    promptPairIndex: 0,
    prompts: { negative: '<same>', positive: '<same>' },
    seed: 0,
  })
  const before = structuredClone(f.capture.snapshot)
  const result = await prepareCurrentCanvasRegionalRecipe(f.input)
  assert.deepEqual(result.regions, [])
  assert.deepEqual(result.globalPrompts, {
    negative: prompt('<same>', [negative]),
    positive: prompt('<same>', [positive]),
  })
  result.globalPrompts.positive.embeddingRefs[0].resource.localVersionId = randomUUID()
  assert.deepEqual(result.globalPrompts.negative, prompt('<same>', [negative]))
  assert.deepEqual(f.capture.snapshot, before)
})

test('recipe global prompts freeze before held projection and own their active ref buffers', async () => {
  const positive = embedding('<positive>')
  const negative = embedding('<negative>')
  const document = documentWith()
  document.generationDraft.positivePrompt = prompt('sun <positive>', [positive])
  document.generationDraft.negativePrompt = prompt('blur <negative>', [negative])
  const entered = deferred()
  const gate = deferred()
  const f = pureInput(document, async (_id, target) => {
    entered.release()
    await gate.promise
    return projectRegionalGuidanceCoverage(null, target)
  })
  f.input.job = jobFor(f.capture.snapshot, {
    iteration: 0,
    promptPairIndex: 0,
    prompts: { negative: 'blur <negative>', positive: 'sun <positive>' },
    seed: 0,
  })
  const preparing = prepareCurrentCanvasRegionalRecipe(f.input)
  await projectionStarted(entered, preparing)
  try {
    const mutable = f.input.job.item as { prompts: { negative: string; positive: string } }
    mutable.prompts.positive = 'changed'
    mutable.prompts.negative = 'changed'
    f.capture.snapshot.generationDraft.positivePrompt.text = 'changed'
    f.capture.snapshot.generationDraft.positivePrompt.embeddingRefs.length = 0
    f.capture.snapshot.generationDraft.negativePrompt.embeddingRefs[0].resource.localVersionId =
      randomUUID()
  } finally {
    gate.release()
  }
  const result = await preparing
  assert.deepEqual(result.globalPrompts, {
    negative: prompt('blur <negative>', [negative]),
    positive: prompt('sun <positive>', [positive]),
  })
  assert.deepEqual(result.regions[0].negative.prompt, result.globalPrompts.negative)
  result.globalPrompts.negative.embeddingRefs[0].resource.localVersionId = randomUUID()
  assert.deepEqual(result.regions[0].negative.prompt, prompt('blur <negative>', [negative]))
})

test('recipe preserves prompt wrapper absence, null positive and explicit empty blocks independently', async () => {
  const dormant = embedding('<dormant>')
  const regions = [
    region(),
    region({ prompts: { negative: prompt(''), positive: null, useGlobalNegativePrompt: false } }),
    region({ prompts: { negative: null, positive: prompt(''), useGlobalNegativePrompt: true } }),
    region({
      prompts: {
        negative: prompt('  dormant {left|right} <dormant>\n', [dormant]),
        positive: prompt(' \n\t '),
        useGlobalNegativePrompt: true,
      },
    }),
  ]
  const f = pureInput(documentWith(regions))
  const { regions: result } = await prepareCurrentCanvasRegionalRecipe(f.input)
  assert.equal(result[0].positive, null)
  assert.equal(Object.hasOwn(result[0], 'authoredPrompts'), false)
  assert.equal(Object.hasOwn(result[0], 'referenceImages'), false)
  assert.equal(result[1].positive, null)
  assert.deepEqual(result[1].negative, { prompt: prompt(''), source: 'regional' })
  assert.deepEqual(result[2].positive, prompt(''))
  assert.deepEqual(result[3].positive, prompt(' \n\t '))
  assert.deepEqual(result[3].negative, {
    prompt: prompt('Canvas static negative'),
    source: 'current-canvas',
  })
  for (let index = 1; index < regions.length; index++) {
    assert.deepEqual(result[index].authoredPrompts, regions[index].prompts)
  }
})

test('recipe preserves an explicitly empty concrete inherited negative without falling back to Canvas template text or refs', async () => {
  const ref = embedding('<canvas>')
  const document = documentWith([region()])
  document.generationDraft.negativePrompt = prompt('Nonempty Canvas <canvas>', [ref])
  const f = pureInput(document)
  f.input.job.item = { ...f.input.job.item, prompts: { ...f.input.job.item.prompts, negative: '' } }
  const result = await prepareCurrentCanvasRegionalRecipe(f.input)
  assert.deepEqual(result.regions[0].negative, { prompt: prompt(''), source: 'current-canvas' })
  assert.deepEqual(
    f.capture.snapshot.generationDraft.negativePrompt,
    document.generationDraft.negativePrompt,
  )
})

test('recipe preserves absent regional collection and explicit empty collection as zero semantic targets', async () => {
  for (const absent of [true, false]) {
    const document = documentWith([])
    if (absent) {
      delete document.regionalGuidance
    }
    const f = pureInput(document)
    const result = await prepareCurrentCanvasRegionalRecipe(f.input)
    assert.deepEqual(result.regions, [])
    assert.equal(f.calls.length, 0)
    assert.equal(Object.hasOwn(f.capture.snapshot, 'regionalGuidance'), !absent)
  }
})

test('recipe keeps enabled document order including locked zero-opacity regions and skips disabled dynamic inputs', async () => {
  const regions = [
    region({
      enabled: false,
      prompts: {
        negative: null,
        positive: prompt('{disabled|dynamic}'),
        useGlobalNegativePrompt: true,
      },
    }),
    region({ locked: true, overlayOpacity: 0 }),
    region({ enabled: false }),
    region({ name: 'Last enabled' }),
  ]
  const f = pureInput(documentWith(regions))
  const result = await prepareCurrentCanvasRegionalRecipe(f.input)
  assert.deepEqual(
    result.regions.map(({ regionId }) => regionId),
    [regions[1].id, regions[3].id],
  )
  assert.deepEqual(
    f.calls.map(({ regionId }) => regionId),
    [regions[1].id, regions[3].id],
  )
  assert.deepEqual(
    result.regions.map(({ maskId, maskRevision }) => ({ maskId, maskRevision })),
    [regions[1], regions[3]].map(({ mask }) => ({
      maskId: mask.id,
      maskRevision: mask.revision,
    })),
  )
})

test('recipe keeps same-token resource identities independent across regions and polarities', async () => {
  const global = embedding('<same>')
  const positiveA = embedding('<same>')
  const negativeA = embedding('<same>')
  const positiveB = embedding('<same>')
  const negativeB = embedding('<same>')
  const regions = [positiveA, positiveB].map((ref, index) =>
    region({
      prompts: {
        negative: prompt('<same>', [index === 0 ? negativeA : negativeB]),
        positive: prompt('<same>', [ref]),
        useGlobalNegativePrompt: false,
      },
    }),
  )
  regions.push(region())
  const document = documentWith(regions)
  document.generationDraft.negativePrompt = prompt('<same>', [global])
  const f = pureInput(document)
  const result = await prepareCurrentCanvasRegionalRecipe(f.input)
  assert.deepEqual(
    result.regions.map(({ positive }) => positive?.embeddingRefs ?? []),
    [[positiveA], [positiveB], []],
  )
  assert.deepEqual(
    result.regions.map(({ negative }) => negative.prompt.embeddingRefs),
    [[negativeA], [negativeB], [global]],
  )
  assert.equal(
    new Set(
      result.regions
        .flatMap(({ negative, positive }) => [
          ...(positive?.embeddingRefs ?? []),
          ...negative.prompt.embeddingRefs,
        ])
        .map(({ resource }) => resource.localModelId),
    ).size,
    5,
  )
})

test('recipe uses existing literal activation ordering, overlap and exact deduplication for static regional prompts', async () => {
  const short = embedding('bird')
  const long = embedding('<bird>')
  const first = embedding('<first>')
  const unused = embedding('<unused>')
  const authored = prompt('  <first> <bird> birdhouse bird\n', [
    short,
    unused,
    long,
    first,
    structuredClone(long),
  ])
  const f = pureInput(
    documentWith([
      region({
        prompts: {
          negative: structuredClone(authored),
          positive: authored,
          useGlobalNegativePrompt: false,
        },
      }),
    ]),
  )
  const result = await prepareCurrentCanvasRegionalRecipe(f.input)
  assert.deepEqual(result.regions[0].positive, prompt(authored.text, [first, long, short]))
  assert.deepEqual(result.regions[0].negative, {
    prompt: prompt(authored.text, [first, long, short]),
    source: 'regional',
  })
  assert.deepEqual(
    result.regions[0].authoredPrompts,
    f.capture.snapshot.regionalGuidance![0].prompts,
  )
})

test('recipe ignores dynamic, oversized and invalid-UTF8 dormant inherited-away local negatives', async () => {
  for (const text of [
    '{dormant|other}',
    String.raw`\{escaped\}`,
    'x'.repeat(GENERATION_BATCH_PROMPT_MAX_BYTES + 1),
    '\uD800',
  ]) {
    const dormant = prompt(text, [embedding('<never-installed>', 'anima')])
    const f = pureInput(
      documentWith([
        region({
          prompts: {
            negative: dormant,
            positive: null,
            useGlobalNegativePrompt: true,
          },
        }),
      ]),
    )
    const result = await prepareCurrentCanvasRegionalRecipe(f.input)
    assert.deepEqual(result.regions[0].authoredPrompts!.negative, dormant)
    assert.deepEqual(result.regions[0].negative, {
      prompt: prompt('Canvas static negative'),
      source: 'current-canvas',
    })
    assert.equal(f.calls.length, 1)
  }
})

test('recipe refuses an active dynamic region anywhere in the collection before projecting an earlier valid owner', async () => {
  for (const polarity of ['positive', 'negative'] as const) {
    const bad = region({
      prompts: {
        negative: prompt('static local'),
        positive: prompt('static subject'),
        useGlobalNegativePrompt: false,
      },
    })
    bad.prompts![polarity]!.text = '{a|b}'
    const f = pureInput(documentWith([region(), bad]))
    await refused(f.input, 'REGIONAL_RECIPE_DYNAMIC_UNSUPPORTED', polarity)
    assert.deepEqual(f.calls, [])
  }
})

test('recipe full-brace conservative checkpoint refuses paired, unmatched, nested and escaped braces in every active prompt', async () => {
  for (const text of [
    '{a|b}',
    '{literal}',
    '{',
    '}',
    '{{a|b}|c}',
    String.raw`\{`,
    String.raw`\}`,
    String.raw`\{a|b\}`,
  ]) {
    for (const owner of [
      'job-positive',
      'job-negative',
      'regional-positive',
      'regional-negative',
    ] as const) {
      const f = pureInput(
        documentWith([
          region({
            prompts: {
              negative: prompt('local negative'),
              positive: prompt('local positive'),
              useGlobalNegativePrompt: false,
            },
          }),
        ]),
      )
      if (owner.startsWith('job-')) {
        const polarity = owner === 'job-positive' ? 'positive' : 'negative'
        f.input.job.item = {
          ...f.input.job.item,
          prompts: { ...f.input.job.item.prompts, [polarity]: text },
        }
      } else {
        const polarity = owner === 'regional-positive' ? 'positive' : 'negative'
        f.capture.snapshot.regionalGuidance![0].prompts![polarity]!.text = text
      }
      await refused(
        f.input,
        'REGIONAL_RECIPE_DYNAMIC_UNSUPPORTED',
        `${owner}: ${JSON.stringify(text)}`,
      )
      assert.deepEqual(f.calls, [])
    }
  }
})

test('recipe static contrast preserves weighting, pipes, backslashes and whitespace without expansion', async () => {
  const text = '  (cat:0.5), dog++ [bird], left|right, \\literal\n\t '
  const f = pureInput(
    documentWith([
      region({
        prompts: {
          negative: prompt(text),
          positive: prompt(text),
          useGlobalNegativePrompt: false,
        },
      }),
    ]),
  )
  f.input.job.item = { ...f.input.job.item, prompts: { negative: text, positive: text } }
  const result = await prepareCurrentCanvasRegionalRecipe(f.input)
  assert.deepEqual(result.item.prompts, { negative: text, positive: text })
  assert.deepEqual(result.regions[0].positive, prompt(text))
  assert.deepEqual(result.regions[0].negative, { prompt: prompt(text), source: 'regional' })
})

test('recipe validates both concrete job prompts even when every region overrides the negative', async () => {
  const f = pureInput(
    documentWith([
      region({
        prompts: {
          negative: prompt('static override'),
          positive: null,
          useGlobalNegativePrompt: false,
        },
      }),
    ]),
  )
  f.input.job.item = {
    ...f.input.job.item,
    prompts: { negative: '{raw|template}', positive: 'concrete' },
  }
  await refused(f.input, 'REGIONAL_RECIPE_DYNAMIC_UNSUPPORTED')
  assert.deepEqual(f.calls, [])
})

test('recipe refuses malformed strict job, item, prompt and bbox containers before projection', async () => {
  const changes: [string, (job: RecipeInput['job']) => unknown][] = [
    ['null job', () => null],
    ['array job', () => []],
    ['primitive job', () => 'job'],
    ['extra job key', (job) => ({ ...job, layerId: randomUUID() })],
    ['missing context', ({ documentRevision: _revision, ...job }) => job],
    ['null item', (job) => ({ ...job, item: null })],
    ['array item', (job) => ({ ...job, item: [] })],
    ['extra item key', (job) => ({ ...job, item: { ...job.item, batchId: randomUUID() } })],
    [
      'missing iteration',
      (job) => ({ ...job, item: { promptPairIndex: 0, prompts: job.item.prompts, seed: 0 } }),
    ],
    ['null prompts', (job) => ({ ...job, item: { ...job.item, prompts: null } })],
    ['array prompts', (job) => ({ ...job, item: { ...job.item, prompts: [] } })],
    [
      'extra prompt key',
      (job) => ({
        ...job,
        item: { ...job.item, prompts: { ...job.item.prompts, embeddingRefs: [] } },
      }),
    ],
    [
      'missing negative',
      (job) => ({ ...job, item: { ...job.item, prompts: { positive: 'static' } } }),
    ],
    [
      'null positive',
      (job) => ({ ...job, item: { ...job.item, prompts: { negative: '', positive: null } } }),
    ],
    [
      'object negative',
      (job) => ({ ...job, item: { ...job.item, prompts: { negative: prompt(''), positive: '' } } }),
    ],
    ['null bbox', (job) => ({ ...job, bbox: null })],
    ['array bbox', (job) => ({ ...job, bbox: [] })],
    ['extra bbox key', (job) => ({ ...job, bbox: { ...job.bbox, rotationDegrees: 0 } })],
  ]
  for (const [name, change] of changes) {
    const f = pureInput()
    ;(f.input as { job: unknown }).job = change(f.input.job)
    await refused(f.input, 'REGIONAL_RECIPE_INPUT_INVALID', name)
    assert.deepEqual(f.calls, [], name)
  }
})

test('recipe requires matching UUID document identity, revision, bbox and recognized Canvas family', async () => {
  const changes: [string, (job: RecipeInput['job']) => unknown][] = [
    ['foreign document', (job) => ({ ...job, documentId: randomUUID() })],
    ['foreign revision', (job) => ({ ...job, documentRevision: randomUUID() })],
    ['non-UUID document', (job) => ({ ...job, documentId: 'document' })],
    ['non-UUID revision', (job) => ({ ...job, documentRevision: 'revision' })],
    ['null identity', (job) => ({ ...job, documentId: null })],
    ['family mismatch', (job) => ({ ...job, family: 'anima' })],
    ...[null, '', 'Illustrious', 'noobai', 'smart-patch', 0].map(
      (family): [string, (job: RecipeInput['job']) => unknown] => [
        `unknown family ${String(family)}`,
        (job) => ({ ...job, family }),
      ],
    ),
    ...(['x', 'y', 'width', 'height'] as const).map(
      (field): [string, (job: RecipeInput['job']) => unknown] => [
        `bbox mismatch ${field}`,
        (job) => ({ ...job, bbox: { ...job.bbox, [field]: job.bbox[field] + 1 } }),
      ],
    ),
  ]
  for (const [name, change] of changes) {
    const f = pureInput()
    ;(f.input as { job: unknown }).job = change(f.input.job)
    await refused(f.input, 'REGIONAL_RECIPE_INPUT_INVALID', name)
    assert.deepEqual(f.calls, [], name)
  }
})

test('recipe refuses absent or unknown Canvas model context without consulting another target', async () => {
  for (const family of ['missing-model', null, 'unsupported']) {
    const f = pureInput()
    if (family === 'missing-model') {
      f.capture.snapshot.generationDraft.model = null
    } else {
      ;(f.capture.snapshot.generationDraft.model as { baseModelFamily: unknown }).baseModelFamily =
        family
    }
    await refused(f.input, 'REGIONAL_RECIPE_INPUT_INVALID')
    assert.deepEqual(f.calls, [])
  }
})

test('recipe rejects invalid iteration, pair index and uint32 seed without coercion', async () => {
  for (const field of ['iteration', 'promptPairIndex', 'seed'] as const) {
    const values: unknown[] = [
      -1,
      0.5,
      NaN,
      Infinity,
      -Infinity,
      Number.MAX_SAFE_INTEGER + 1,
      '0',
      true,
      null,
      undefined,
    ]
    if (field === 'seed') {
      values.push(0x1_00_00_00_00, Number.MAX_SAFE_INTEGER)
    }
    for (const value of values) {
      const f = pureInput()
      f.input.job.item = { ...f.input.job.item, [field]: value }
      await refused(f.input, 'REGIONAL_RECIPE_INPUT_INVALID', `${field}: ${String(value)}`)
      assert.deepEqual(f.calls, [])
    }
  }
})

test('recipe structural item bounds do not pretend to verify caller-owned batch membership or seed history', async () => {
  const f = pureInput()
  // Deliberately not looked up in an external plan/history: trusted Main caller owns membership.
  f.input.job.item = {
    iteration: Number.MAX_SAFE_INTEGER,
    promptPairIndex: Number.MAX_SAFE_INTEGER,
    prompts: { negative: 'Concrete historical negative', positive: '' },
    seed: 0xff_ff_ff_ff,
  }
  const result = await prepareCurrentCanvasRegionalRecipe(f.input)
  assert.deepEqual(result.item, f.input.job.item)
  assert.deepEqual(result.regions[0].negative, {
    prompt: prompt('Concrete historical negative'),
    source: 'current-canvas',
  })
  assert.equal(f.capture.snapshot.lastActualSeedSnapshot, 0)
  assert.deepEqual(f.capture.snapshot.generationDraft.seed, { policy: 'fixed', value: 0 })
})

test('recipe rejects malformed active UTF8 on either job or regional polarity before any projection', async () => {
  for (const text of ['\uD800', '\uDC00', 'x\uD800y', '\uDC00\uD800']) {
    for (const field of [
      'job-positive',
      'job-negative',
      'regional-positive',
      'regional-negative',
    ] as const) {
      const f = pureInput(
        documentWith([
          region({
            prompts: {
              negative: prompt('local'),
              positive: prompt('local'),
              useGlobalNegativePrompt: false,
            },
          }),
        ]),
      )
      const polarity = field.endsWith('positive') ? 'positive' : 'negative'
      if (field.startsWith('job-')) {
        f.input.job.item = {
          ...f.input.job.item,
          prompts: { ...f.input.job.item.prompts, [polarity]: text },
        }
      } else {
        f.capture.snapshot.regionalGuidance![0].prompts![polarity]!.text = text
      }
      await refused(f.input, 'REGIONAL_RECIPE_INPUT_INVALID', field)
      assert.deepEqual(f.calls, [])
    }
  }
})

test('recipe enforces 16KiB by UTF8 bytes independently for every active prompt', async () => {
  for (const text of [
    'x'.repeat(GENERATION_BATCH_PROMPT_MAX_BYTES + 1),
    'é'.repeat(GENERATION_BATCH_PROMPT_MAX_BYTES / 2 + 1),
  ]) {
    for (const field of [
      'job-positive',
      'job-negative',
      'regional-positive',
      'regional-negative',
    ] as const) {
      const f = pureInput(
        documentWith([
          region({
            prompts: {
              negative: prompt('local'),
              positive: prompt('local'),
              useGlobalNegativePrompt: false,
            },
          }),
        ]),
      )
      const polarity = field.endsWith('positive') ? 'positive' : 'negative'
      if (field.startsWith('job-')) {
        f.input.job.item = {
          ...f.input.job.item,
          prompts: { ...f.input.job.item.prompts, [polarity]: text },
        }
      } else {
        f.capture.snapshot.regionalGuidance![0].prompts![polarity]!.text = text
      }
      await refused(f.input, 'REGIONAL_RECIPE_LIMIT', field)
      assert.deepEqual(f.calls, [])
    }
  }
})

test('recipe accepts the exact UTF8 prompt-byte boundary and valid surrogate pairs without trimming', async () => {
  for (const text of [
    'x'.repeat(GENERATION_BATCH_PROMPT_MAX_BYTES),
    'é'.repeat(GENERATION_BATCH_PROMPT_MAX_BYTES / 2),
    '😀'.repeat(GENERATION_BATCH_PROMPT_MAX_BYTES / 4),
  ]) {
    assert.equal(Buffer.byteLength(text, 'utf8'), GENERATION_BATCH_PROMPT_MAX_BYTES)
    const f = pureInput(
      documentWith([
        region({
          prompts: {
            negative: prompt(text),
            positive: prompt(text),
            useGlobalNegativePrompt: false,
          },
        }),
      ]),
    )
    f.input.job.item = { ...f.input.job.item, prompts: { negative: text, positive: text } }
    const result = await prepareCurrentCanvasRegionalRecipe(f.input)
    assert.equal(result.regions[0].positive!.text, text)
    assert.equal(result.regions[0].negative.prompt.text, text)
    assert.deepEqual(result.item.prompts, { negative: text, positive: text })
  }
})

test('recipe validates inconsistent exposed snapshot structure before projection', async () => {
  for (const change of [
    (snapshot: Snapshot) => {
      snapshot.documentId = 'not-a-UUID'
    },
    (snapshot: Snapshot) => {
      snapshot.documentRevision = 'not-a-UUID'
    },
    (snapshot: Snapshot) => {
      snapshot.regionalGuidance![0].mask.id = 'not-a-UUID'
    },
    (snapshot: Snapshot) => {
      snapshot.regionalGuidance![0].id = 'not-a-UUID'
    },
    (snapshot: Snapshot) => {
      snapshot.regionalGuidance!.push(structuredClone(snapshot.regionalGuidance![0]))
    },
    (snapshot: Snapshot) => {
      snapshot.regionalGuidance![0].prompts = {
        negative: null,
        positive: null,
        useGlobalNegativePrompt: true,
      }
    },
  ]) {
    const f = pureInput()
    change(f.capture.snapshot)
    await refused(f.input, 'REGIONAL_RECIPE_INPUT_INVALID')
    assert.deepEqual(f.calls, [])
  }
})

test('recipe refuses valid document bboxes exceeding private CPU side or area bounds before projection', async () => {
  for (const bbox of [
    { ...TARGET, height: 1, width: 2049 },
    { ...TARGET, height: 2049, width: 1 },
    { ...TARGET, height: 2048, width: 2048 },
  ]) {
    const f = pureInput(documentWith([region()], 'illustrious', bbox))
    await refused(f.input, 'REGIONAL_RECIPE_LIMIT')
    assert.deepEqual(f.calls, [])
  }
})

test('recipe refuses noninteger, unsafe or malformed matching bbox metadata before projection', async () => {
  for (const [field, value, code] of [
    ['x', 0.5],
    ['y', NaN],
    ['x', PROJECT_MASK_MAX_COORDINATE + 1, 'REGIONAL_RECIPE_LIMIT'],
    ['y', -PROJECT_MASK_MAX_COORDINATE - 1, 'REGIONAL_RECIPE_LIMIT'],
    ['width', 0],
    ['height', -1],
    ['width', Number.MAX_SAFE_INTEGER + 1],
    ['height', Infinity],
    ['width', '3'],
  ] as const) {
    const f = pureInput()
    Object.assign(f.capture.snapshot.primaryBbox, { [field]: value })
    Object.assign(f.input.job.bbox, { [field]: value })
    await refused(f.input, code ?? 'REGIONAL_RECIPE_INPUT_INVALID', `${field}: ${String(value)}`)
    assert.deepEqual(f.calls, [])
  }
})

test('recipe follows coverage-helper target-origin limits without inventing a far-edge target ceiling', async () => {
  for (const bbox of [
    { height: 1, width: 2048, x: 0, y: 0 },
    { height: 2048, width: 1, x: 0, y: 0 },
    { height: 1, width: 2, x: PROJECT_MASK_MAX_COORDINATE, y: -PROJECT_MASK_MAX_COORDINATE },
  ]) {
    const f = pureInput(documentWith([region()], 'illustrious', bbox))
    const result = await prepareCurrentCanvasRegionalRecipe(f.input)
    assert.deepEqual(result.regions[0].coverage.bounds, bbox)
    assert.equal(result.regions[0].coverage.alpha.length, bbox.width * bbox.height)
  }
})

test('recipe aggregate 64MiB coverage refusal preflights enabled count with schema-valid bounded metadata', async () => {
  const bbox = { height: 1024, width: 1024, x: 0, y: 0 }
  const regions = Array.from({ length: 65 }, () => region())
  assert.ok(regions.length * bbox.width * bbox.height > AGGREGATE_ALPHA_SAMPLES)
  const f = pureInput(documentWith(regions, 'illustrious', bbox), async () => {
    assert.fail('Aggregate refusal must happen before allocation or first projection')
  })
  await refused(f.input, 'REGIONAL_RECIPE_LIMIT')
  assert.deepEqual(f.calls, [])
})

test('recipe exact aggregate boundary and disabled-count neighbor reach projection without allocating coverage payloads', async () => {
  const bbox = { height: 1024, width: 1024, x: 0, y: 0 }
  const sentinel = new Error('Controlled first-projection witness; no large alpha allocation')
  for (const enabledCount of [63, 64]) {
    const regions = [
      ...Array.from({ length: enabledCount }, () => region()),
      ...Array.from({ length: 65 }, () => region({ enabled: false })),
    ]
    assert.ok(enabledCount * bbox.width * bbox.height <= AGGREGATE_ALPHA_SAMPLES)
    const f = pureInput(documentWith(regions, 'illustrious', bbox), async () => {
      throw sentinel
    })
    await assert.rejects(
      prepareCurrentCanvasRegionalRecipe(f.input),
      (error: unknown) => error === sentinel,
    )
    assert.equal(f.calls.length, 1)
    assert.equal(f.calls[0].regionId, regions[0].id)
  }
})

test('recipe preserves all four coverage discriminators and exact independent soft alpha grids', async () => {
  const regions = Array.from({ length: 5 }, () => region({ overlayOpacity: 0 }))
  const intersection = { ...TARGET }
  const coverages: ProjectRegionalGuidanceCoverage[] = [
    { alpha: new Uint8Array(6), bounds: { ...TARGET }, intersection: null, kind: 'empty' },
    { alpha: new Uint8Array(6), bounds: { ...TARGET }, intersection: null, kind: 'outside' },
    {
      alpha: new Uint8Array(6),
      bounds: { ...TARGET },
      intersection: { ...intersection },
      kind: 'intersecting-empty',
    },
    {
      alpha: Uint8Array.from(SOFT_ALPHA),
      bounds: { ...TARGET },
      intersection: { ...intersection },
      kind: 'covered',
    },
    {
      alpha: Uint8Array.from(OTHER_ALPHA),
      bounds: { ...TARGET },
      intersection: { ...intersection },
      kind: 'covered',
    },
  ]
  const f = pureInput(
    documentWith(regions),
    async (id) => coverages[regions.findIndex((entry) => entry.id === id)],
  )
  const result = await prepareCurrentCanvasRegionalRecipe(f.input)
  assert.deepEqual(
    result.regions.map(({ coverage }) => coverage),
    coverages,
  )
  assert.deepEqual([...result.regions[3].coverage.alpha], SOFT_ALPHA)
  assert.deepEqual([...result.regions[4].coverage.alpha], OTHER_ALPHA)
  result.regions[3].coverage.alpha.fill(0)
  assert.deepEqual([...result.regions[4].coverage.alpha], OTHER_ALPHA)
  assert.deepEqual([...coverages[3].alpha], SOFT_ALPHA)
})

test('recipe projects sequentially with a fresh detached target for each owner', async () => {
  const gate = deferred()
  const entered = deferred()
  const targets: IgsRectV1[] = []
  const regions = [region(), region(), region()]
  const f = pureInput(documentWith(regions), async (_id, target) => {
    targets.push(target)
    assert.deepEqual(target, TARGET)
    const original = structuredClone(target)
    if (targets.length === 1) {
      entered.release()
      await gate.promise
      target.x = 999
      target.width = 1
    }
    return projectRegionalGuidanceCoverage(null, original)
  })
  const preparing = prepareCurrentCanvasRegionalRecipe(f.input)
  try {
    await projectionStarted(entered, preparing)
    assert.equal(targets.length, 1)
  } finally {
    gate.release()
  }
  const result = await preparing
  assert.equal(targets.length, 3)
  assert.equal(new Set(targets).size, 3)
  assert.ok(targets.every((target) => target !== f.input.job.bbox))
  assert.deepEqual(result.bbox, TARGET)
  assert.deepEqual(f.input.job.bbox, TARGET)
  assert.deepEqual(
    result.regions.map(({ coverage }) => coverage.bounds),
    [TARGET, TARGET, TARGET],
  )
})

test('recipe detaches complete snapshot and job synchronously before a held first projection', async () => {
  const gate = deferred()
  const entered = deferred()
  const ref = embedding('<local>')
  const document = documentWith([
    region({
      prompts: {
        negative: null,
        positive: prompt('Original <local>', [ref]),
        useGlobalNegativePrompt: true,
      },
    }),
    region(),
  ])
  const f = pureInput(document, async (_id, target) => {
    entered.release()
    await gate.promise
    return projectRegionalGuidanceCoverage(null, target)
  })
  const snapshot = structuredClone(f.capture.snapshot)
  const job = structuredClone(f.input.job)
  const preparing = prepareCurrentCanvasRegionalRecipe(f.input)
  // These mutations occur immediately after invocation, before yielding even one microtask.
  f.capture.snapshot.documentId = randomUUID()
  f.capture.snapshot.documentRevision = randomUUID()
  f.capture.snapshot.primaryBbox.x = 100
  f.capture.snapshot.generationDraft.negativePrompt = prompt('New global')
  f.capture.snapshot.generationDraft.model = model('anima')
  f.capture.snapshot.regionalGuidance![0].prompts!.positive!.text = 'New local'
  f.capture.snapshot.regionalGuidance![0].prompts!.positive!.embeddingRefs[0].resource.localModelId =
    randomUUID()
  f.capture.snapshot.regionalGuidance![0].mask.revision = 99
  f.capture.snapshot.regionalGuidance!.reverse()
  f.input.job.documentRevision = randomUUID()
  f.input.job.bbox.width = 1
  f.input.job.family = 'anima'
  f.input.job.item = {
    iteration: 7,
    promptPairIndex: 8,
    prompts: { negative: 'new', positive: 'new' },
    seed: 9,
  }
  try {
    await projectionStarted(entered, preparing)
  } finally {
    gate.release()
  }
  const result = await preparing
  assert.equal(result.documentId, snapshot.documentId)
  assert.equal(result.documentRevision, snapshot.documentRevision)
  assert.equal(result.family, job.family)
  assert.deepEqual(result.bbox, job.bbox)
  assert.deepEqual(result.item, job.item)
  assert.deepEqual(
    result.regions.map(({ regionId }) => regionId),
    snapshot.regionalGuidance!.map(({ id }) => id),
  )
  assert.deepEqual(result.regions[0].authoredPrompts, snapshot.regionalGuidance![0].prompts)
  assert.deepEqual(result.regions[0].positive, snapshot.regionalGuidance![0].prompts!.positive)
  assert.equal(result.regions[0].maskRevision, 0)
  assert.equal(result.regions[0].negative.prompt.text, job.item.prompts.negative)
})

test('recipe owns returned coverage metadata and alpha views even when a projector reuses mutable scratch bytes', async () => {
  const storage = Uint8Array.from([99, ...SOFT_ALPHA, 99])
  const view = storage.subarray(1, 7)
  const returned: ProjectRegionalGuidanceCoverage[] = []
  const f = pureInput(documentWith([region(), region()]), async (_id, target) => {
    if (returned.length) {
      view.set(OTHER_ALPHA)
    }
    const coverage: ProjectRegionalGuidanceCoverage = {
      alpha: view,
      bounds: { ...target },
      intersection: { ...target },
      kind: 'covered',
    }
    returned.push(coverage)
    return coverage
  })
  const result = await prepareCurrentCanvasRegionalRecipe(f.input)
  assert.deepEqual([...result.regions[0].coverage.alpha], SOFT_ALPHA)
  assert.deepEqual([...result.regions[1].coverage.alpha], OTHER_ALPHA)
  for (const coverage of returned) {
    coverage.alpha.fill(0)
    coverage.bounds.x = 99
    if (coverage.intersection) {
      coverage.intersection.y = 99
    }
  }
  assert.deepEqual([...result.regions[0].coverage.alpha], SOFT_ALPHA)
  assert.deepEqual([...result.regions[1].coverage.alpha], OTHER_ALPHA)
  assert.deepEqual(result.regions[0].coverage.bounds, TARGET)
  assert.deepEqual(result.regions[0].coverage.intersection, TARGET)
  result.regions[0].coverage.alpha.fill(17)
  assert.equal(view[0], 0)
  assert.equal(storage[0], 99)
  assert.equal(storage[7], 99)
})

test('recipe copies leased Buffer alpha views instead of retaining Buffer slice aliases', async () => {
  const storage = Buffer.from([99, ...SOFT_ALPHA, 99])
  const view = storage.subarray(1, 7)
  const f = pureInput(documentWith([region()]), async (_id, target) => ({
    alpha: view,
    bounds: { ...target },
    intersection: { ...target },
    kind: 'covered',
  }))
  const result = await prepareCurrentCanvasRegionalRecipe(f.input)
  view.fill(0)
  assert.deepEqual([...result.regions[0].coverage.alpha], SOFT_ALPHA)
  result.regions[0].coverage.alpha.fill(255)
  assert.deepEqual([...view], [0, 0, 0, 0, 0, 0])
  assert.equal(storage[0], 99)
  assert.equal(storage[7], 99)
})

test('recipe output mutations cannot rewrite captured authoring metadata or the concrete caller item', async () => {
  const ref = embedding('<same>')
  const f = pureInput(
    documentWith([
      region({
        prompts: {
          negative: prompt('<same>', [ref]),
          positive: prompt('<same>', [ref]),
          useGlobalNegativePrompt: false,
        },
      }),
    ]),
  )
  const before = structuredClone(f.capture.snapshot)
  const job = structuredClone(f.input.job)
  const result = await prepareCurrentCanvasRegionalRecipe(f.input)
  result.bbox.x = 99
  // Public planner types are readonly; exercise runtime ownership with a writable test view.
  const mutableItem = result.item as {
    prompts: { negative: string; positive: string }
    seed: number
  }
  mutableItem.seed = 19
  mutableItem.prompts.negative = 'Output mutation'
  result.regions[0].positive!.embeddingRefs[0].resource.localModelId = randomUUID()
  result.regions[0].authoredPrompts!.negative!.text = 'Output mutation'
  result.regions[0].negative.prompt.embeddingRefs.length = 0
  result.regions.reverse()
  assert.deepEqual(f.capture.snapshot, before)
  assert.deepEqual(f.input.job, job)
})

test('recipe projection failure stops later owners without mutating authored or job state', async () => {
  const sentinel = new Error('Controlled existing-lease projection failure')
  let call = 0
  const f = pureInput(documentWith([region(), region(), region()]), async (_id, target) => {
    if (++call === 2) {
      throw sentinel
    }
    return projectRegionalGuidanceCoverage(null, target)
  })
  const before = structuredClone(f.capture.snapshot)
  const job = structuredClone(f.input.job)
  await assert.rejects(
    prepareCurrentCanvasRegionalRecipe(f.input),
    (error: unknown) => error === sentinel,
  )
  assert.equal(f.calls.length, 2)
  assert.deepEqual(f.capture.snapshot, before)
  assert.deepEqual(f.input.job, job)
})

type ServiceFixture = Awaited<ReturnType<typeof serviceFixture>>

async function names(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory)).sort()
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

async function tree(directory: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  const visit = async (current: string) => {
    for (const name of await names(current)) {
      const filename = path.join(current, name)
      const entry = await lstat(filename)
      assert.equal(entry.isSymbolicLink(), false, 'Fixture trees contain no links')
      if (entry.isDirectory()) {
        await visit(filename)
      } else {
        result[path.relative(directory, filename)] = digest(await readFile(filename))
      }
    }
  }
  await visit(directory)
  return result
}

/**
 * Narrow adaptation of the existing capture fixture: real SQLite/coordinator/shadow/savewriter/
 * loader and Service callback. Literal images and authored resource descriptors are setup only; no
 * installed model, catalog, worker or family execution compatibility is asserted.
 */
async function serviceFixture(family: Family = 'illustrious') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-current-canvas-recipe-'))
  const database = openAppDatabase(root, path.resolve('src/main/db/migrations'))
  const shadowRoot = path.join(root, 'autosave')
  const scratch = path.join(root, 'scratch')
  const service = new ProjectService({
    autosaveOptions: { debounceMs: 60_000, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    dataRoot: root,
    readLastActualSeed: async (tabId, documentId) =>
      (
        await database.db
          .selectFrom('generation_seed_cursor')
          .select('actual_seed')
          .where('local_project_key', '=', tabId)
          .where('document_id', '=', documentId)
          .executeTakeFirst()
      )?.actual_seed ?? null,
    repository: new ProjectIndexRepository(database.db),
    roots: { placeholdersDir: path.resolve('src/main/projects/placeholders'), scratchDir: scratch },
    shadow: new ProjectShadowStore(shadowRoot),
  })
  const dispose = async () => {
    try {
      for (const tab of service.getOpenTabs()) {
        await service.discardAndClose(tab.id)
      }
    } finally {
      await database.close()
      await rm(root, { force: true, recursive: true })
    }
  }
  try {
    const tab = await service.create({ height: 256, title: 'Private regional recipe', width: 256 })
    const id = tab.id
    const co = () => service.getOpenDocumentForAcceptance(id)!
    const document = () => co().document
    const sources = new Map<string, Buffer>()
    const add = <Member extends IgsProjectAssetRefV1>(member: Member, bytes: Buffer): Member => {
      sources.set(member.path, Buffer.from(bytes))
      return member
    }
    const png = await acceptedOutputPngFixture(64, 64)
    const thumbnail = await readFile(
      path.resolve('src/main/projects/test-fixtures/candidate-thumbnail-64x64.webp'),
    )
    const profile = await readFile(path.resolve('worker-python/tests/fixtures/AdobeRGB1998.icc'))
    const reference = (withProfile: boolean): IgsRegionalGuidanceReferenceImageV1 => {
      const referenceId = randomUUID()
      return {
        asset: add(
          {
            bytes: png.length,
            height: 64,
            path: `assets/regional-references/${referenceId}/${digest(png)}.png`,
            sha256: digest(png),
            width: 64,
          },
          png,
        ),
        id: referenceId,
        name: `Ordered raw reference ${sources.size}`,
        sourceFormat: 'JPEG',
        ...(withProfile
          ? {
              sourceIccProfile: add(
                {
                  bytes: profile.length,
                  path: `assets/profiles/${digest(profile)}.icc`,
                  sha256: digest(profile),
                },
                profile,
              ),
            }
          : {}),
        thumbnail: add(
          {
            bytes: thumbnail.length,
            height: 64,
            path: `assets/regional-references/${referenceId}/${digest(thumbnail)}.webp`,
            sha256: digest(thumbnail),
            width: 64,
          },
          thumbnail,
        ),
      }
    }
    const painted = (alpha: number[], bounds: IgsRectV1): IgsRegionalGuidanceV1['mask'] => {
      const maskId = randomUUID()
      const bytes = encodeProjectMaskPng(Uint8Array.from(alpha), bounds.width, bounds.height)
      return {
        asset: add(
          {
            bytes: bytes.length,
            height: bounds.height,
            path: `assets/masks/${maskId}/${digest(bytes)}.png`,
            sha256: digest(bytes),
            width: bounds.width,
          },
          bytes,
        ),
        bounds: structuredClone(bounds),
        id: maskId,
        revision: 4,
      }
    }
    const globalA = embedding('<global-a>')
    const globalB = embedding('<global-b>')
    const unused = embedding('<unused>')
    const local = embedding('<local>')
    const covered = region({
      locked: true,
      mask: painted(SOFT_ALPHA, TARGET),
      overlayOpacity: 0,
      prompts: {
        negative: prompt('  dormant {local-a|local-b} <local>\n', [local]),
        positive: prompt('  (regional:0.5) <local>\n ', [local, unused]),
        useGlobalNegativePrompt: true,
      },
      referenceImages: [reference(true), reference(false)],
    })
    const disabled = region({
      enabled: false,
      locked: true,
      mask: painted(SOFT_ALPHA, { ...TARGET, x: -20 }),
      prompts: {
        negative: prompt('{disabled-a|disabled-b}'),
        positive: prompt(String.raw`\{disabled\}`),
        useGlobalNegativePrompt: false,
      },
      referenceImages: [reference(true)],
    })
    const outside = region({
      mask: painted(SOFT_ALPHA, { ...TARGET, x: 40, y: 50 }),
      prompts: {
        negative: prompt('  static local <local>\n', [local, unused]),
        positive: null,
        useGlobalNegativePrompt: false,
      },
    })
    const hole = region({
      mask: painted([1, 2, 3, 4, 5, 6, 0, 0, 0, 7, 8, 0, 0, 0, 9, 10, 11, 12, 13, 14], {
        height: 4,
        width: 5,
        x: -3,
        y: -3,
      }),
      prompts: { negative: null, positive: prompt(''), useGlobalNegativePrompt: true },
    })
    const empty = region()
    const other = region({
      mask: painted(OTHER_ALPHA, TARGET),
      prompts: {
        negative: prompt(''),
        positive: prompt('Second overlapping owner'),
        useGlobalNegativePrompt: false,
      },
    })
    const rasterId = randomUUID()
    const rasterAsset = add(
      {
        bytes: png.length,
        height: 64,
        path: `assets/layers/${rasterId}.png`,
        sha256: digest(png),
        width: 64,
      },
      png,
    )
    const patches = (['illustrious', 'anima'] as const).map((patchFamily): IgsSmartPatchLayerV1 => {
      const variant = smartPatchVariantMetadataFixture(patchFamily)
      const alpha = Uint8Array.from({ length: 35 }, (_, index) => [0, 64, 128, 255][index % 4])
      const bytes = literalSmartPatchColorPng(
        7,
        5,
        Array.from(alpha, (value) => [23, 47, 91, value]).flat(),
        4,
      )
      Object.assign(variant.asset, { bytes: bytes.length, sha256: digest(bytes) })
      Object.assign(variant.generationProvenance.executionResultContext.output, {
        byteSize: bytes.length,
        contributionAlpha8: { byteSize: alpha.length, height: 5, sha256: digest(alpha), width: 7 },
        sha256: digest(bytes),
      })
      add(variant.asset, bytes)
      return {
        activeRasterSubLayerId: variant.id,
        blendMode: 'normal',
        boundingBox: { height: 64, width: 64, x: 101, y: -201 },
        generationDraft: structuredClone(
          variant.generationProvenance.layerSourceContext.generationDraft,
        ),
        id: randomUUID(),
        internalResolution: { height: 64, width: 64 },
        kind: 'smart-patch',
        locked: false,
        mask: { asset: null, id: randomUUID(), revision: 0 },
        name: `Protected ${patchFamily} Smart result`,
        opacity: 0.75,
        rasterSubLayers: [variant],
        visible: true,
      }
    })
    const authored = parseProjectDocumentV1({
      ...document(),
      generationDraft: {
        ...document().generationDraft,
        model: model(family),
        negativePrompt: prompt('  {bad <global-a>|worse <global-b>} \n', [
          globalB,
          unused,
          globalA,
        ]),
        positivePrompt: prompt('{Canvas day|Canvas night}'),
        seed: { policy: 'fixed', value: 0 },
      },
      lastActualSeedSnapshot: 0,
      layers: [
        {
          asset: rasterAsset,
          blendMode: 'normal',
          generationProvenance: acceptedRasterProvenanceFixture(document(), png, {
            height: 64,
            width: 64,
            x: 0,
            y: 0,
          }),
          id: rasterId,
          kind: 'raster',
          locked: true,
          name: 'Protected accepted Raster',
          opacity: 1,
          transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -7, y: 11 },
          visible: true,
        },
        ...patches,
      ],
      primaryBbox: TARGET,
      regionalGuidance: [covered, disabled, outside, hole, empty, other],
    })
    await co().applyDocument(
      authored,
      Object.fromEntries([...sources].map(([memberPath, bytes]) => [memberPath, { bytes }])),
    )
    // Wire the real operational cursor before Save; portable seed zero alone is not that cursor.
    await database.db
      .insertInto('generation_seed_cursor')
      .values({
        actual_seed: 0,
        candidate_id: randomUUID(),
        completion_order: 1,
        document_id: document().documentId,
        local_project_key: id,
        updated_at: '2026-10-25T12:00:00.000Z',
      })
      .execute()
    await service.save(id)
    const savedPath = co().filePath
    await service.close(id)
    assert.equal((await service.open(id)).kind, 'opened')
    assert.equal(document().lastActualSeedSnapshot, 0)
    const loaded = await readIgsPackage(savedPath)
    assert.deepEqual(loaded.project, document())
    return {
      co,
      database,
      dispose,
      document,
      globalA,
      globalB,
      id,
      ids: {
        covered: covered.id,
        disabled: disabled.id,
        empty: empty.id,
        hole: hole.id,
        other: other.id,
        outside: outside.id,
      },
      local,
      root,
      savedPath,
      scratch,
      service,
      shadowRoot,
      sources,
    }
  } catch (error) {
    await dispose()
    throw error
  }
}

async function withService(
  run: (fixture: ServiceFixture) => Promise<void>,
  family: Family = 'illustrious',
) {
  const fixture = await serviceFixture(family)
  try {
    await run(fixture)
  } finally {
    await fixture.dispose()
  }
}

async function durableState(f: ServiceFixture, settle = true) {
  if (settle) {
    await f.service.flushAutosave(f.id)
  }
  const schema = await sql<{
    name: string
    type: string
  }>`select type, name, tbl_name, sql from sqlite_master order by type, name`.execute(f.database.db)
  const tables: Record<string, unknown[]> = {}
  for (const entry of schema.rows.filter(({ type }) => type === 'table')) {
    const result = await sql`select * from ${sql.table(entry.name)}`.execute(f.database.db)
    tables[entry.name] = result.rows.sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    )
  }
  const tab = f.service.getOpenTabs().find(({ id }) => id === f.id)!
  return {
    document: structuredClone(f.document()),
    history: {
      canRedo: tab.canRedo,
      canUndo: tab.canUndo,
      dirty: tab.dirty,
      epoch: f.co().documentEpoch,
    },
    packageBytes: await readFile(f.savedPath),
    shadow: await tree(f.shadowRoot),
    sql: { schema: schema.rows, tables },
  }
}

async function assertDurableUnchanged(
  f: ServiceFixture,
  before: Awaited<ReturnType<typeof durableState>>,
) {
  // Do not force a second flush: that could write a fresh shadow UUID and measure the test itself.
  const after = await durableState(f, false)
  assert.ok(
    after.packageBytes.equals(before.packageBytes),
    'Recipe preparation must not replace saved package bytes',
  )
  const { packageBytes: _beforeBytes, ...expected } = before
  const { packageBytes: _afterBytes, ...actual } = after
  assert.deepEqual(actual, expected)
}

test('real Service recipe global refs follow concrete branches without aliasing inherited prompts', async () => {
  await withService(async (f) => {
    const before = await durableState(f)
    await f.service.withCapturedRegionalGuidanceInput(f.id, async (capture) => {
      const expected = [
        prompt('  bad <global-a> \n', [f.globalA]),
        prompt('  worse <global-b> \n', [f.globalB]),
      ]
      const snapshot = structuredClone(capture.snapshot)
      const items = concreteItems(capture.snapshot)
      assert.equal(items.length, 2)
      for (let index = 0; index < items.length; index++) {
        const result = await prepareCurrentCanvasRegionalRecipe({
          capture,
          job: jobFor(capture.snapshot, items[index]),
        })
        assert.deepEqual(result.globalPrompts.negative, expected[index])
        assert.deepEqual(result.globalPrompts.positive, prompt(items[index].prompts.positive))
        const inherited = result.regions.find(({ regionId }) => regionId === f.ids.covered)!
        assert.deepEqual(inherited.negative.prompt, expected[index])
        assert.notEqual(inherited.negative.prompt, result.globalPrompts.negative)
        assert.notEqual(
          inherited.negative.prompt.embeddingRefs,
          result.globalPrompts.negative.embeddingRefs,
        )
        result.globalPrompts.negative.embeddingRefs[0].resource.localVersionId = randomUUID()
        assert.deepEqual(inherited.negative.prompt, expected[index])
        assert.deepEqual(capture.snapshot, snapshot)
      }
    })
    await assertDurableUnchanged(f, before)
  })
})

// Named isolated mutation pair for root execution: use raw Canvas negative template instead of
// job.item.prompts.negative in the inherited branch. The concrete-branch boundary must fail;
// the explicit static-local-negative neighbor must remain green. This file executes no mutation.
test('current-canvas recipe mutation boundary: inherited negatives use each concrete global branch and exact active refs', async () => {
  await withService(async (f) => {
    const before = await durableState(f)
    const scratchBefore = await names(f.scratch)
    await f.service.withCapturedRegionalGuidanceInput(f.id, async (capture) => {
      const expected = [
        prompt('  bad <global-a> \n', [f.globalA]),
        prompt('  worse <global-b> \n', [f.globalB]),
      ]
      const items = concreteItems(capture.snapshot)
      assert.equal(items.length, 2)
      for (let index = 0; index < items.length; index++) {
        const job = jobFor(capture.snapshot, items[index])
        const result = await prepareCurrentCanvasRegionalRecipe({ capture, job })
        assert.deepEqual(result.item, items[index])
        assert.equal(result.item.seed, index)
        for (const id of [f.ids.covered, f.ids.hole, f.ids.empty]) {
          const target = result.regions.find(({ regionId }) => regionId === id)!
          assert.deepEqual(target.negative, { prompt: expected[index], source: 'current-canvas' })
        }
        const first = result.regions.find(({ regionId }) => regionId === f.ids.covered)!
        assert.deepEqual(first.positive, prompt('  (regional:0.5) <local>\n ', [f.local]))
        assert.deepEqual(first.authoredPrompts, capture.snapshot.regionalGuidance![0].prompts)
        assert.ok(first.authoredPrompts!.negative!.text.includes('{local-a|local-b}'))
        assertNoLeaseFields(result, capture)
      }
    })
    assert.deepEqual(await names(f.scratch), scratchBefore)
    await assertDurableUnchanged(f, before)
  })
})

test('current-canvas recipe mutation control: static regional negative stays independent of the raw global template', async () => {
  await withService(async (f) => {
    const next = structuredClone(f.document())
    for (const owner of next.regionalGuidance!.filter(({ enabled }) => enabled)) {
      owner.prompts = {
        negative: prompt('  static local <local>\n', [f.local]),
        positive: null,
        useGlobalNegativePrompt: false,
      }
    }
    await f.co().applyDocument(parseProjectDocumentV1(next))
    const before = await durableState(f)
    await f.service.withCapturedRegionalGuidanceInput(f.id, async (capture) => {
      assert.ok(
        capture.snapshot.generationDraft.negativePrompt.text.includes(
          '{bad <global-a>|worse <global-b>}',
        ),
      )
      const job = jobFor(capture.snapshot, concreteItems(capture.snapshot)[1])
      const result = await prepareCurrentCanvasRegionalRecipe({ capture, job })
      assert.equal(result.regions.length, 5)
      for (const target of result.regions) {
        assert.deepEqual(target.negative, {
          prompt: prompt('  static local <local>\n', [f.local]),
          source: 'regional',
        })
        assert.equal(target.positive, null)
      }
    })
    await assertDurableUnchanged(f, before)
  })
})

test('actual Service recipe keeps all four real mask states, document order and overlapping soft masks independently', async () => {
  await withService(async (f) => {
    const before = await durableState(f)
    await f.service.withCapturedRegionalGuidanceInput(f.id, async (capture) => {
      const result = await prepareCurrentCanvasRegionalRecipe({
        capture,
        job: jobFor(capture.snapshot),
      })
      assert.deepEqual(
        result.regions.map(({ regionId }) => regionId),
        [f.ids.covered, f.ids.outside, f.ids.hole, f.ids.empty, f.ids.other],
      )
      assert.deepEqual(
        result.regions.map(({ coverage }) => coverage.kind),
        ['covered', 'outside', 'intersecting-empty', 'empty', 'covered'],
      )
      assert.deepEqual(
        result.regions.map(({ coverage }) => [...coverage.alpha]),
        [SOFT_ALPHA, [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], OTHER_ALPHA],
      )
      assert.deepEqual(
        result.regions.map(({ coverage }) => coverage.intersection),
        [TARGET, null, TARGET, null, TARGET],
      )
      assert.deepEqual(
        result.regions.map(({ coverage }) => coverage.bounds),
        [TARGET, TARGET, TARGET, TARGET, TARGET],
      )
      assert.equal(before.document.regionalGuidance![0].locked, true)
      assert.equal(before.document.regionalGuidance![0].overlayOpacity, 0)
      assert.equal(result.regions[1].positive, null)
      assert.deepEqual(result.regions[2].positive, prompt(''))
      assert.equal(Object.hasOwn(result.regions[3], 'authoredPrompts'), false)
      assert.deepEqual(result.regions[4].negative, { prompt: prompt(''), source: 'regional' })
      for (const target of result.regions) {
        const owner = before.document.regionalGuidance!.find(({ id }) => id === target.regionId)!
        assert.equal(target.maskId, owner.mask.id)
        assert.equal(target.maskRevision, owner.mask.revision)
      }
    })
    await assertDurableUnchanged(f, before)
  })
})

test('actual Service recipe carries ordered raw reference descriptors for both families without granting execution permission', async () => {
  for (const family of ['illustrious', 'anima'] as const) {
    await withService(async (f) => {
      const before = await durableState(f)
      await f.service.withCapturedRegionalGuidanceInput(f.id, async (capture) => {
        const authored = structuredClone(capture.snapshot.regionalGuidance![0].referenceImages!)
        const result = await prepareCurrentCanvasRegionalRecipe({
          capture,
          job: jobFor(capture.snapshot),
        })
        assert.equal(result.family, family)
        assert.deepEqual(result.regions[0].referenceImages, authored)
        assert.equal(authored.length, 2)
        assert.notEqual(authored[0].id, authored[1].id)
        assert.equal(authored[0].asset.sha256, authored[1].asset.sha256)
        assert.notEqual(authored[0].asset.path, authored[1].asset.path)
        assert.ok(Object.hasOwn(result.regions[0].referenceImages[0], 'sourceIccProfile'))
        assert.equal(Object.hasOwn(result.regions[0].referenceImages[1], 'sourceIccProfile'), false)
        assert.ok(
          result.regions.slice(1).every((entry) => !Object.hasOwn(entry, 'referenceImages')),
        )
        assertNoLeaseFields(result, capture)
        if (family === 'anima') {
          assert.deepEqual(
            getPromptEmbeddingMatches(result.regions[0].positive!, [], true, family).map(
              ({ status }) => status,
            ),
            ['unsupported'],
          )
        }
        // New-job regional admission and the post-publication Smart target permission are
        // independent existing boundaries. A semantic recipe changes neither one.
        assert.throws(
          () => f.service.assertNewGenerationAdmission(f.id, before.document.documentId),
          { code: 'GENERATION_REGIONAL_GUIDANCE_UNSUPPORTED' },
        )
        for (const patch of before.document.layers.filter(
          (layer) => layer.kind === 'smart-patch',
        )) {
          assert.doesNotThrow(() =>
            f.service.assertSmartPatchGenerationAdmission(
              f.id,
              before.document.documentId,
              patch.id,
            ),
          )
        }
        result.regions[0].referenceImages[0].name = 'Mutated result reference'
        result.regions[0].referenceImages[0].asset.sha256 = '0'.repeat(64)
        result.regions[0].referenceImages[0].sourceIccProfile!.path = 'Output-only mutation'
        result.regions[0].referenceImages.reverse()
        assert.deepEqual(capture.snapshot.regionalGuidance![0].referenceImages, authored)
      })
      await assertDurableUnchanged(f, before)
    }, family)
  }
})

test('actual Service recipe semantic refusals perform zero projections and preserve every durable neighbor', async () => {
  await withService(async (f) => {
    const before = await durableState(f)
    const scratchBefore = await names(f.scratch)
    await f.service.withCapturedRegionalGuidanceInput(f.id, async (capture) => {
      let projections = 0
      const project = capture.projectMask
      capture.projectMask = async (id, target) => {
        projections++
        return await project(id, target)
      }
      const job = jobFor(capture.snapshot)
      await refused(
        { capture, job: { ...job, documentRevision: randomUUID() } },
        'REGIONAL_RECIPE_INPUT_INVALID',
      )
      await refused({ capture, job: { ...job, family: 'anima' } }, 'REGIONAL_RECIPE_INPUT_INVALID')
      await refused(
        {
          capture,
          job: {
            ...job,
            item: {
              ...job.item,
              prompts: { ...job.item.prompts, positive: String.raw`\{escaped\}` },
            },
          },
        },
        'REGIONAL_RECIPE_DYNAMIC_UNSUPPORTED',
      )
      await refused(
        {
          capture,
          job: {
            ...job,
            item: { ...job.item, prompts: { ...job.item.prompts, negative: 'é'.repeat(8193) } },
          },
        },
        'REGIONAL_RECIPE_LIMIT',
      )
      const last = capture.snapshot.regionalGuidance!.find(({ id }) => id === f.ids.other)!
      last.prompts!.positive!.text = '{late|dynamic}'
      await refused({ capture, job }, 'REGIONAL_RECIPE_DYNAMIC_UNSUPPORTED')
      assert.equal(projections, 0)
    })
    assert.deepEqual(await names(f.scratch), scratchBefore)
    await assertDurableUnchanged(f, before)
  })
})

test('actual Service recipe detaches reference sidecars and caller item before a held leased projection', async () => {
  await withService(async (f) => {
    const before = await durableState(f)
    await f.service.withCapturedRegionalGuidanceInput(f.id, async (capture) => {
      const gate = deferred()
      const entered = deferred()
      const original = capture.projectMask
      const snapshot = structuredClone(capture.snapshot)
      const job = jobFor(capture.snapshot)
      const expectedJob = structuredClone(job)
      let first = true
      capture.projectMask = async (id, target) => {
        if (first) {
          first = false
          entered.release()
          await gate.promise
        }
        return await original(id, target)
      }
      const preparing = prepareCurrentCanvasRegionalRecipe({ capture, job })
      const publicReference = capture.snapshot.regionalGuidance![0].referenceImages![0]
      publicReference.name = 'Exposed later name'
      publicReference.asset.path = 'assets/layers/exposed-later.png'
      publicReference.sourceIccProfile!.sha256 = '0'.repeat(64)
      capture.snapshot.regionalGuidance![0].referenceImages!.reverse()
      capture.assets[0].member.sha256 = '0'.repeat(64)
      capture.assets[0].filePath = f.savedPath
      capture.assets.length = 0
      job.bbox.x = 999
      ;(job.item.prompts as { negative: string }).negative = 'Exposed later concrete negative'
      try {
        await projectionStarted(entered, preparing)
      } finally {
        gate.release()
      }
      const result = await preparing
      assert.deepEqual(result.bbox, expectedJob.bbox)
      assert.deepEqual(result.item, expectedJob.item)
      assert.deepEqual(
        result.regions[0].referenceImages,
        snapshot.regionalGuidance![0].referenceImages,
      )
      assert.deepEqual([...result.regions[0].coverage.alpha], SOFT_ALPHA)
      assert.deepEqual(result.regions[0].negative, {
        prompt: prompt(expectedJob.item.prompts.negative, [f.globalA]),
        source: 'current-canvas',
      })
      assertNoLeaseFields(result, capture)
    })
    await assertDurableUnchanged(f, before)
  })
})

test('actual saved Service capture remains historical across live edit Save close reopen and closes its lease after recipe return', async () => {
  await withService(async (f) => {
    const originalDocument = structuredClone(f.document())
    const mask = originalDocument.regionalGuidance![0].mask
    assert.ok(mask.asset)
    assert.equal(
      f.co().getCurrentAssetSource(mask.asset),
      null,
      'Use saved package member, not a pending source',
    )
    const scratchBefore = await names(f.scratch)
    let retained!: CapturedRegionalGuidanceInput
    let result!: Recipe
    let beforeRecipe!: Awaited<ReturnType<typeof durableState>>
    await f.service.withCapturedRegionalGuidanceInput(f.id, async (capture) => {
      retained = capture
      const job = jobFor(capture.snapshot)
      const next = structuredClone(f.document())
      next.title = 'Later live Canvas owner'
      next.primaryBbox = { ...TARGET, x: 100, y: 200 }
      next.generationDraft.model = model('anima')
      next.generationDraft.negativePrompt = prompt('Later live negative')
      next.generationDraft.seed = { policy: 'fixed', value: 17 }
      next.regionalGuidance![0].mask = { asset: null, id: mask.id, revision: mask.revision + 1 }
      next.regionalGuidance![0].referenceImages!.reverse()
      await f.co().applyDocument(parseProjectDocumentV1(next))
      await f.service.save(f.id)
      await f.service.close(f.id)
      assert.equal((await f.service.open(f.id)).kind, 'opened')
      assert.equal(f.document().generationDraft.model!.baseModelFamily, 'anima')
      assert.deepEqual(f.document().primaryBbox, next.primaryBbox)
      assert.equal(f.document().regionalGuidance![0].mask.asset, null)
      beforeRecipe = await durableState(f)
      result = await prepareCurrentCanvasRegionalRecipe({ capture, job })
      assert.equal(result.documentRevision, originalDocument.documentRevision)
      assert.equal(result.family, 'illustrious')
      assert.deepEqual(result.bbox, TARGET)
      assert.equal(result.regions[0].maskRevision, mask.revision)
      assert.deepEqual([...result.regions[0].coverage.alpha], SOFT_ALPHA)
      assert.deepEqual(
        result.regions[0].referenceImages,
        originalDocument.regionalGuidance![0].referenceImages,
      )
      assertNoLeaseFields(result, capture)
    })
    const expected = structuredClone(result)
    await assert.rejects(retained.projectMask(f.ids.covered, TARGET))
    await assert.rejects(retained.readAsset(mask.asset.path))
    await assert.rejects(lstat(retained.stagingRoot), { code: 'ENOENT' })
    assert.deepEqual(await names(f.scratch), scratchBefore)
    assert.deepEqual(result, expected)
    await assertDurableUnchanged(f, beforeRecipe)
  })
})

// These collaborators qualify local recipe semantics only. ROOT separately owns actual
// ModelRepository/ModelService/safetensors and native CPU/CUDA execution evidence.
type RecipeModels = NonNullable<RecipeInput['models']>
type RecipeModelPair = Parameters<RecipeModels['assertNoUnboundGenerationEmbeddings']>[0]
type RecipeResolvedEmbedding = Awaited<
  ReturnType<RecipeModels['resolveVerifiedGenerationEmbeddingForPlan']>
>

function exactRecipeEmbedding(token: string): PromptEmbeddingRef {
  const ref = embedding(token)
  Object.assign(ref.resource, { civitaiFileId: 13, civitaiModelId: 11, civitaiVersionId: 12 })
  return ref
}

function recipeResolution(reference: PromptEmbeddingRef['resource']): RecipeResolvedEmbedding {
  return {
    byteSize: 128,
    managedPath: path.resolve('verified', `${reference.localVersionId}.safetensors`),
    reference: structuredClone(reference),
  }
}

function recipeDescriptor(ref: PromptEmbeddingRef) {
  return { ...recipeResolution(ref.resource), token: ref.token }
}

function recipeModelSpies(
  hooks: {
    check?: RecipeModels['assertNoUnboundGenerationEmbeddings']
    resolve?: RecipeModels['resolveVerifiedGenerationEmbeddingForPlan']
  } = {},
) {
  const checked: RecipeModelPair[] = []
  const resolved: PromptEmbeddingRef['resource'][] = []
  const returned: RecipeResolvedEmbedding[] = []
  const models: RecipeModels = {
    assertNoUnboundGenerationEmbeddings: async (pair) => {
      checked.push(structuredClone(pair))
      await hooks.check?.(pair)
    },
    resolveVerifiedGenerationEmbeddingForPlan: async (reference) => {
      resolved.push(structuredClone(reference))
      const result = hooks.resolve ? await hooks.resolve(reference) : recipeResolution(reference)
      returned.push(result)
      return result
    },
  }
  return { checked, models, resolved, returned }
}

test('opt-in recipe binds global and regional polarities and same literals to their own exact resources', async () => {
  const globalPositive = exactRecipeEmbedding('<same>')
  const globalNegative = exactRecipeEmbedding('<same>')
  const localPositive = exactRecipeEmbedding('<same>')
  const localNegative = exactRecipeEmbedding('<same>')
  const document = documentWith([
    region({
      prompts: {
        negative: prompt('<same>', [localNegative]),
        positive: prompt('<same> <same>', [localPositive]),
        useGlobalNegativePrompt: false,
      },
    }),
    region(),
  ])
  document.generationDraft.positivePrompt = prompt('<same>', [globalPositive])
  document.generationDraft.negativePrompt = prompt('<same>', [globalNegative])
  const f = pureInput(document)
  f.input.job.item = { ...f.input.job.item, prompts: { negative: '<same>', positive: '<same>' } }
  const spies = recipeModelSpies()
  f.input.models = spies.models
  const result = await prepareCurrentCanvasRegionalRecipe(f.input)
  assert.deepEqual(result.globalEmbeddings, {
    negative: [recipeDescriptor(globalNegative)],
    positive: [recipeDescriptor(globalPositive)],
  })
  assert.deepEqual(
    result.regions.map(({ embeddings }) => embeddings),
    [
      { negative: [recipeDescriptor(localNegative)], positive: [recipeDescriptor(localPositive)] },
      { negative: [recipeDescriptor(globalNegative)], positive: [] },
    ],
  )
  assert.deepEqual(spies.checked, [
    {
      modelFamily: 'illustrious',
      negativePrompt: prompt('<same>', [globalNegative]),
      positivePrompt: prompt('<same>', [globalPositive]),
    },
    {
      modelFamily: 'illustrious',
      negativePrompt: prompt('<same>', [localNegative]),
      positivePrompt: prompt('<same> <same>', [localPositive]),
    },
    {
      modelFamily: 'illustrious',
      negativePrompt: prompt('<same>', [globalNegative]),
      positivePrompt: prompt(''),
    },
  ])
  assert.deepEqual(
    spies.resolved,
    [globalPositive, globalNegative, localPositive, localNegative, globalNegative].map(
      ({ resource }) => resource,
    ),
  )
  assert.notEqual(result.globalEmbeddings.negative[0], result.regions[1].embeddings!.negative[0])
  assert.notEqual(
    result.globalEmbeddings.negative[0].reference,
    result.regions[1].embeddings!.negative[0].reference,
  )
  assert.deepEqual(
    f.calls.map(({ regionId }) => regionId),
    document.regionalGuidance!.map(({ id }) => id),
  )
})

test('opt-in recipe resolves only effective concrete branches and preserves literal and document order', async () => {
  const first = exactRecipeEmbedding('<first>')
  const second = exactRecipeEmbedding('<second>')
  const negative = exactRecipeEmbedding('<negative>')
  const inactive = embedding('<inactive>', 'anima')
  const document = documentWith([region(), region()])
  document.generationDraft.positivePrompt = prompt('{<second> <first>|plain}', [
    inactive,
    first,
    second,
  ])
  document.generationDraft.negativePrompt = prompt('{<negative>|clear}', [inactive, negative])
  const f = pureInput(document)
  const items = planGenerationBatch({
    baseSeed: 0,
    iterations: 1,
    maxJobs: 16,
    maxPrompts: 16,
    negativePrompt: document.generationDraft.negativePrompt.text,
    positivePrompt: document.generationDraft.positivePrompt.text,
    seedBehavior: 'per-prompt',
  }).items
  assert.equal(items.length, 4)
  for (const item of items) {
    const spies = recipeModelSpies()
    f.input.models = spies.models
    f.input.job = jobFor(f.capture.snapshot, item)
    const result = await prepareCurrentCanvasRegionalRecipe(f.input)
    const positives = item.prompts.positive === 'plain' ? [] : [second, first]
    const negatives = item.prompts.negative === 'clear' ? [] : [negative]
    assert.deepEqual(result.globalEmbeddings, {
      negative: negatives.map(recipeDescriptor),
      positive: positives.map(recipeDescriptor),
    })
    assert.deepEqual(
      spies.resolved,
      [...positives, ...negatives, ...negatives, ...negatives].map(({ resource }) => resource),
    )
    assert.deepEqual(
      result.regions.map(({ negative: value }) => value.prompt),
      [prompt(item.prompts.negative, negatives), prompt(item.prompts.negative, negatives)],
    )
    assert.deepEqual(
      spies.checked.map(({ negativePrompt }) => negativePrompt.text),
      Array.from({ length: 3 }, () => item.prompts.negative),
    )
  }
})

test('opt-in recipe leaves dormant disabled inactive and absent-positive resources unloaded', async () => {
  const active = exactRecipeEmbedding('<active>')
  const dormant = embedding('<dormant>', 'anima')
  const inactive = embedding('<inactive>')
  const document = documentWith([
    region({
      prompts: {
        negative: prompt('{dormant|syntax} <dormant>', [dormant]),
        positive: null,
        useGlobalNegativePrompt: true,
      },
    }),
    region({
      enabled: false,
      prompts: {
        negative: prompt('<dormant>', [dormant]),
        positive: prompt('{disabled|dynamic}', [inactive]),
        useGlobalNegativePrompt: false,
      },
    }),
    region({
      prompts: {
        negative: prompt('', [inactive]),
        positive: prompt('', [inactive]),
        useGlobalNegativePrompt: false,
      },
    }),
    region(),
  ])
  document.generationDraft.negativePrompt = prompt('<active>', [inactive, active])
  const f = pureInput(document)
  const spies = recipeModelSpies()
  f.input.models = spies.models
  const result = await prepareCurrentCanvasRegionalRecipe(f.input)
  assert.equal(result.regions.length, 3)
  assert.deepEqual(spies.resolved, [active.resource, active.resource, active.resource])
  assert.deepEqual(
    result.regions.map(({ embeddings }) => embeddings),
    [
      { negative: [recipeDescriptor(active)], positive: [] },
      { negative: [], positive: [] },
      { negative: [recipeDescriptor(active)], positive: [] },
    ],
  )
  assert.equal(result.regions[0].positive, null)
  assert.deepEqual(result.regions[1].positive, prompt(''))
  assert.equal(result.regions[2].positive, null)
  assert.deepEqual(result.regions[0].authoredPrompts, document.regionalGuidance![0].prompts)
  assert.deepEqual(
    spies.checked.map(({ positivePrompt }) => positivePrompt),
    [prompt('Concrete global positive'), prompt(''), prompt(''), prompt('')],
  )
})

test('opt-in plain recipe checks every concrete signed pair and emits empty descriptor arrays', async () => {
  const f = pureInput(
    documentWith([
      region(),
      region({
        prompts: { negative: prompt(''), positive: prompt(''), useGlobalNegativePrompt: false },
      }),
    ]),
  )
  const spies = recipeModelSpies()
  f.input.models = spies.models
  const result = await prepareCurrentCanvasRegionalRecipe(f.input)
  assert.deepEqual(result.globalEmbeddings, { negative: [], positive: [] })
  assert.deepEqual(
    result.regions.map(({ embeddings }) => embeddings),
    [
      { negative: [], positive: [] },
      { negative: [], positive: [] },
    ],
  )
  assert.equal(spies.checked.length, 3)
  assert.equal(spies.resolved.length, 0)
  assert.deepEqual(spies.checked[2], {
    modelFamily: 'illustrious',
    negativePrompt: prompt(''),
    positivePrompt: prompt(''),
  })
})

test('plain-default recipe shape and family semantics remain exact with no opt-in descriptor keys', async () => {
  for (const family of ['illustrious', 'anima'] as const) {
    const unresolved = embedding('<unqualified>', family)
    const document = documentWith([region(), region(), region(), region()], family)
    document.generationDraft.negativePrompt = prompt('<unqualified>', [unresolved])
    const f = pureInput(document)
    const result = await prepareCurrentCanvasRegionalRecipe(f.input)
    assertNoLeaseFields(result, f.capture)
    assert.equal(Object.hasOwn(result, 'globalEmbeddings'), false)
    assert.equal(result.regions.length, 4)
    for (const owner of result.regions) {
      assert.equal(Object.hasOwn(owner, 'embeddings'), false)
      assert.deepEqual(owner.negative.prompt, prompt('<unqualified>', [unresolved]))
    }
    assert.equal(result.family, family)
  }
  const f = pureInput()
  const original = await prepareCurrentCanvasRegionalRecipe(f.input)
  const opted = await prepareCurrentCanvasRegionalRecipe({
    ...f.input,
    models: recipeModelSpies().models,
  })
  const { globalEmbeddings: _global, regions, ...plain } = opted
  assert.deepEqual(
    { ...plain, regions: regions.map(({ embeddings: _local, ...owner }) => owner) },
    original,
  )
})

test('opt-in recipe refuses non-Illustrious families and malformed collaborators before any call', async () => {
  const anima = pureInput(documentWith([region()], 'anima'))
  const spies = recipeModelSpies()
  anima.input.models = spies.models
  await refused(anima.input, 'REGIONAL_RECIPE_INPUT_INVALID')
  assert.deepEqual(spies.checked, [])
  assert.deepEqual(spies.resolved, [])
  assert.deepEqual(anima.calls, [])
  for (const value of [
    null,
    {},
    { assertNoUnboundGenerationEmbeddings: async () => {} },
    { ...spies.models, resolveVerifiedGenerationEmbeddingForPlan: false },
    { ...spies.models, assertNoUnboundGenerationEmbeddings: null },
  ]) {
    const f = pureInput()
    f.input.models = value as unknown as RecipeModels
    await refused(f.input, 'REGIONAL_RECIPE_INPUT_INVALID')
    assert.deepEqual(f.calls, [])
  }
  assert.deepEqual(spies.checked, [])
  assert.deepEqual(spies.resolved, [])
})

test('opt-in recipe completes late-region semantics and exact-binding preflight before collaborators', async () => {
  for (const kind of ['dynamic', 'utf8', 'inexact'] as const) {
    const valid = exactRecipeEmbedding('<valid>')
    const late = kind === 'inexact' ? embedding('<late>') : exactRecipeEmbedding('<late>')
    const text = kind === 'dynamic' ? '{late|dynamic}' : kind === 'utf8' ? '\uD800' : '<late>'
    const f = pureInput(
      documentWith([
        region({
          prompts: {
            negative: null,
            positive: prompt('<valid>', [valid]),
            useGlobalNegativePrompt: true,
          },
        }),
        region({
          prompts: {
            negative: null,
            positive: prompt(text, [late]),
            useGlobalNegativePrompt: true,
          },
        }),
      ]),
    )
    const spies = recipeModelSpies()
    f.input.models = spies.models
    await refused(
      f.input,
      kind === 'dynamic' ? 'REGIONAL_RECIPE_DYNAMIC_UNSUPPORTED' : 'REGIONAL_RECIPE_INPUT_INVALID',
    )
    assert.deepEqual(spies.checked, [])
    assert.deepEqual(spies.resolved, [])
    assert.deepEqual(f.calls, [])
  }
})

test('opt-in recipe counts duplicate inherited streams at the exact 16-binding aggregate before model calls', async () => {
  const refs = Array.from({ length: 4 }, (_, index) => exactRecipeEmbedding(`<negative-${index}>`))
  const document = documentWith([region(), region(), region()])
  document.generationDraft.negativePrompt = prompt(
    refs.map(({ token }) => token).join(' '),
    [...refs].reverse(),
  )
  const allowed = pureInput(document)
  const allowedSpies = recipeModelSpies()
  allowed.input.models = allowedSpies.models
  const result = await prepareCurrentCanvasRegionalRecipe(allowed.input)
  assert.equal(allowedSpies.resolved.length, 16)
  assert.deepEqual(result.globalEmbeddings!.negative, refs.map(recipeDescriptor))
  assert.deepEqual(
    result.regions.map(({ embeddings }) => embeddings!.negative),
    Array.from({ length: 3 }, () => refs.map(recipeDescriptor)),
  )
  const seventeenth = exactRecipeEmbedding('<seventeenth>')
  document.generationDraft.positivePrompt = prompt('<seventeenth>', [seventeenth])
  const denied = pureInput(document)
  denied.input.job.item = {
    ...denied.input.job.item,
    prompts: { ...denied.input.job.item.prompts, positive: '<seventeenth>' },
  }
  const deniedSpies = recipeModelSpies()
  denied.input.models = deniedSpies.models
  await refused(denied.input, 'REGIONAL_RECIPE_LIMIT')
  assert.deepEqual(deniedSpies.checked, [])
  assert.deepEqual(deniedSpies.resolved, [])
  assert.deepEqual(denied.calls, [])
})

test('opt-in recipe preserves broader Main region capacity and delegates the three-region execution limit', async () => {
  const f = pureInput(documentWith(Array.from({ length: 5 }, () => region())))
  const spies = recipeModelSpies()
  f.input.models = spies.models
  const result = await prepareCurrentCanvasRegionalRecipe(f.input)
  assert.equal(result.regions.length, 5)
  assert.equal(spies.checked.length, 6)
  assert.equal(f.calls.length, 5)
  assert.deepEqual(spies.resolved, [])
})

test('opt-in recipe rejects malformed or mismatched resolved descriptors without projecting or returning a partial recipe', async () => {
  const mutations: { change: (value: RecipeResolvedEmbedding) => unknown; label: string }[] = [
    { change: () => null, label: 'null result' },
    { change: () => undefined, label: 'absent result' },
    { change: () => ({}), label: 'missing descriptor fields' },
    { change: (value) => ({ ...value, token: '<inferred>' }), label: 'extra result field' },
    { change: (value) => ({ ...value, byteSize: 0 }), label: 'zero byte size' },
    { change: (value) => ({ ...value, byteSize: Infinity }), label: 'nonfinite byte size' },
    { change: (value) => ({ ...value, byteSize: 1.5 }), label: 'fractional byte size' },
    { change: (value) => ({ ...value, managedPath: '' }), label: 'empty path' },
    {
      change: (value) => ({ ...value, managedPath: 'relative.safetensors' }),
      label: 'relative path',
    },
    {
      change: (value) => ({
        ...value,
        managedPath: `${path.dirname(value.managedPath)}${path.sep}..${path.sep}embedding.safetensors`,
      }),
      label: 'unnormalized path',
    },
    {
      change: (value) => ({
        ...value,
        reference: { ...value.reference, baseModelFamily: 'anima' },
      }),
      label: 'wrong family',
    },
    {
      change: (value) => ({
        ...value,
        reference: { ...value.reference, predictionType: 'epsilon' },
      }),
      label: 'prediction type',
    },
    {
      change: (value) => ({ ...value, reference: { ...value.reference, kind: 'checkpoint' } }),
      label: 'wrong kind',
    },
    {
      change: (value) => ({
        ...value,
        reference: { ...value.reference, fileSha256: 'b'.repeat(64) },
      }),
      label: 'wrong digest',
    },
    {
      change: (value) => ({
        ...value,
        reference: { ...value.reference, localModelId: randomUUID() },
      }),
      label: 'wrong local model',
    },
    {
      change: (value) => ({
        ...value,
        reference: { ...value.reference, localVersionId: randomUUID() },
      }),
      label: 'wrong local version',
    },
    {
      change: (value) => ({ ...value, reference: { ...value.reference, civitaiModelId: 100 } }),
      label: 'wrong source model',
    },
    {
      change: (value) => ({ ...value, reference: { ...value.reference, civitaiVersionId: 100 } }),
      label: 'wrong source version',
    },
    {
      change: (value) => ({ ...value, reference: { ...value.reference, civitaiFileId: 100 } }),
      label: 'wrong source file',
    },
    {
      change: (value) => ({ ...value, reference: { ...value.reference, unexpected: true } }),
      label: 'extra reference field',
    },
    { change: (value) => ({ ...value, byteSize: () => 128 }), label: 'uncloneable descriptor' },
  ]
  for (const { change, label } of mutations) {
    const good = exactRecipeEmbedding('<good>')
    const bad = exactRecipeEmbedding('<bad>')
    const document = documentWith([
      region({
        prompts: {
          negative: null,
          positive: prompt('<bad>', [bad]),
          useGlobalNegativePrompt: true,
        },
      }),
    ])
    document.generationDraft.positivePrompt = prompt('<good>', [good])
    const f = pureInput(document)
    f.input.job.item = {
      ...f.input.job.item,
      prompts: { ...f.input.job.item.prompts, positive: '<good>' },
    }
    const before = structuredClone({ job: f.input.job, snapshot: f.capture.snapshot })
    const spies = recipeModelSpies({
      resolve: async (reference) => {
        const value = recipeResolution(reference)
        return (
          reference.localVersionId === bad.resource.localVersionId ? change(value) : value
        ) as RecipeResolvedEmbedding
      },
    })
    f.input.models = spies.models
    await refused(f.input, 'REGIONAL_RECIPE_INPUT_INVALID', label)
    assert.equal(spies.resolved.length, 2, label)
    assert.deepEqual(f.calls, [], label)
    assert.deepEqual({ job: f.input.job, snapshot: f.capture.snapshot }, before, label)
  }
})

test('opt-in recipe uses exact identity while preserving saved copied names and detached metadata', async () => {
  const saved = exactRecipeEmbedding('<custom-alias>')
  const document = documentWith([region()])
  document.generationDraft.negativePrompt = prompt('<custom-alias>', [saved])
  const f = pureInput(document)
  const spies = recipeModelSpies({
    resolve: async (reference) => ({
      ...recipeResolution(reference),
      reference: {
        ...reference,
        displayName: 'Later library display',
        versionName: 'Later library version',
      },
    }),
  })
  f.input.models = spies.models
  const result = await prepareCurrentCanvasRegionalRecipe(f.input)
  assert.deepEqual(result.globalEmbeddings!.negative, [recipeDescriptor(saved)])
  assert.deepEqual(result.regions[0].embeddings!.negative, [recipeDescriptor(saved)])
  assert.equal(result.globalEmbeddings!.negative[0].token, '<custom-alias>')
  for (const returned of spies.returned) {
    returned.reference.displayName = 'Changed resolver scratch'
    returned.managedPath = 'changed.safetensors'
  }
  assert.deepEqual(result.globalEmbeddings!.negative, [recipeDescriptor(saved)])
  result.globalEmbeddings!.negative[0].reference.displayName = 'Output-only edit'
  assert.deepEqual(result.regions[0].embeddings!.negative, [recipeDescriptor(saved)])
  assert.deepEqual(
    f.capture.snapshot.generationDraft.negativePrompt,
    prompt('<custom-alias>', [saved]),
  )
})

test('opt-in recipe keeps same-sign same-literal distinct exact versions and existing exact deduplication', async () => {
  const first = exactRecipeEmbedding('<same>')
  const second = exactRecipeEmbedding('<same>')
  first.resource.localModelId = 'first-exact-model'
  second.resource.localModelId = 'second-exact-model'
  const renamedDuplicate = structuredClone(first)
  renamedDuplicate.resource.displayName = 'Copied name does not create another binding'
  const f = pureInput(
    documentWith([
      region({
        prompts: {
          negative: prompt('<same> <same>', [second, first, renamedDuplicate]),
          positive: prompt('<same>', [second]),
          useGlobalNegativePrompt: false,
        },
      }),
    ]),
  )
  const spies = recipeModelSpies()
  f.input.models = spies.models
  const result = await prepareCurrentCanvasRegionalRecipe(f.input)
  assert.deepEqual(result.regions[0].negative.prompt.embeddingRefs, [first, second])
  assert.deepEqual(result.regions[0].embeddings, {
    negative: [recipeDescriptor(first), recipeDescriptor(second)],
    positive: [recipeDescriptor(second)],
  })
  assert.deepEqual(spies.resolved, [second.resource, first.resource, second.resource])
})

test('opt-in recipe detaches job sidecars and bound methods synchronously before its first model await', async () => {
  const active = exactRecipeEmbedding('<active>')
  const document = documentWith([region()])
  document.generationDraft.negativePrompt = prompt('<active>', [active])
  const f = pureInput(document)
  const before = structuredClone({ job: f.input.job, snapshot: f.capture.snapshot })
  const entered = deferred()
  const gate = deferred()
  const checks: RecipeModelPair[] = []
  const resolutions: PromptEmbeddingRef['resource'][] = []
  let first = true
  const models: RecipeModels = {
    async assertNoUnboundGenerationEmbeddings(pair) {
      assert.equal(this, models)
      checks.push(structuredClone(pair))
      if (first) {
        first = false
        entered.release()
        await gate.promise
      }
    },
    async resolveVerifiedGenerationEmbeddingForPlan(reference) {
      assert.equal(this, models)
      resolutions.push(structuredClone(reference))
      return recipeResolution(reference)
    },
  }
  let projections = 0
  f.capture.projectMask = async function (this: CapturedRegionalGuidanceInput, _id, target) {
    assert.equal(this, f.capture)
    projections++
    return projectRegionalGuidanceCoverage(null, target)
  }
  f.input.models = models
  const preparing = prepareCurrentCanvasRegionalRecipe(f.input)
  try {
    // Mutate immediately after invocation, before waiting for the observed collaborator barrier.
    f.input.job.bbox.x = 999
    f.input.job.item = {
      ...f.input.job.item,
      prompts: { negative: 'changed', positive: 'changed' },
      seed: 999,
    }
    f.capture.snapshot.generationDraft.negativePrompt.embeddingRefs[0].resource.localVersionId =
      randomUUID()
    f.capture.snapshot.generationDraft.negativePrompt.text = 'Changed later Canvas'
    f.capture.snapshot.regionalGuidance!.length = 0
    models.assertNoUnboundGenerationEmbeddings = async () => {
      assert.fail('Replaced checker must not be read after the first await')
    }
    models.resolveVerifiedGenerationEmbeddingForPlan = async () => {
      assert.fail('Replaced resolver must not be read after the first await')
    }
    f.input.models = recipeModelSpies({
      check: async () => {
        assert.fail('Replaced models owner must not be read')
      },
    }).models
    f.capture.projectMask = async () => {
      assert.fail('Replaced projector must not be read after the first await')
    }
    await projectionStarted(entered, preparing)
  } finally {
    gate.release()
  }
  const result = await preparing
  assert.deepEqual(result.item, before.job.item)
  assert.deepEqual(result.bbox, before.job.bbox)
  assert.equal(result.regions.length, 1)
  assert.equal(projections, 1)
  assert.deepEqual(resolutions, [active.resource, active.resource])
  assert.deepEqual(
    checks.map(({ negativePrompt }) => negativePrompt),
    [prompt('<active>', [active]), prompt('<active>', [active])],
  )
  assert.deepEqual(result.globalEmbeddings!.negative, [recipeDescriptor(active)])
  assert.deepEqual(result.regions[0].embeddings!.negative, [recipeDescriptor(active)])
})

test('opt-in recipe immediately owns reused resolution scratch before later calls and a held projection', async () => {
  const positive = exactRecipeEmbedding('<positive>')
  const negative = exactRecipeEmbedding('<negative>')
  const document = documentWith([region(), region()])
  document.generationDraft.positivePrompt = prompt('<positive>', [positive])
  document.generationDraft.negativePrompt = prompt('<negative>', [negative])
  const entered = deferred()
  const gate = deferred()
  const f = pureInput(document, async (_id, target) => {
    entered.release()
    await gate.promise
    return projectRegionalGuidanceCoverage(null, target)
  })
  f.input.job.item = {
    ...f.input.job.item,
    prompts: { negative: '<negative>', positive: '<positive>' },
  }
  const before = structuredClone(f.capture.snapshot)
  const scratch = recipeResolution(positive.resource)
  const spies = recipeModelSpies({
    resolve: async (reference) => {
      const next = recipeResolution(reference)
      scratch.byteSize = next.byteSize
      scratch.managedPath = next.managedPath
      Object.assign(scratch.reference, next.reference)
      return scratch
    },
  })
  f.input.models = spies.models
  const preparing = prepareCurrentCanvasRegionalRecipe(f.input)
  try {
    await projectionStarted(entered, preparing)
    assert.equal(spies.resolved.length, 4)
    scratch.byteSize = 1
    scratch.managedPath = 'Changed while projection was held'
    scratch.reference.fileSha256 = '0'.repeat(64)
    scratch.reference.displayName = 'Changed while projection was held'
  } finally {
    gate.release()
  }
  const result = await preparing
  const expected = structuredClone(result)
  scratch.reference.localVersionId = randomUUID()
  assert.deepEqual(result, expected)
  assert.deepEqual(result.globalEmbeddings, {
    negative: [recipeDescriptor(negative)],
    positive: [recipeDescriptor(positive)],
  })
  assert.deepEqual(
    result.regions.map(({ embeddings }) => embeddings),
    [
      { negative: [recipeDescriptor(negative)], positive: [] },
      { negative: [recipeDescriptor(negative)], positive: [] },
    ],
  )
  result.regions[0].embeddings!.negative[0].reference.displayName = 'One output owner only'
  assert.deepEqual(result.regions[1].embeddings!.negative, [recipeDescriptor(negative)])
  assert.deepEqual(result.globalEmbeddings.negative, [recipeDescriptor(negative)])
  assert.deepEqual(f.capture.snapshot, before)
})

test('opt-in recipe protects signed prompts and exact refs from collaborator argument mutation', async () => {
  const active = exactRecipeEmbedding('<active>')
  const document = documentWith([region()])
  document.generationDraft.negativePrompt = prompt('<active>', [active])
  const f = pureInput(document)
  const before = structuredClone(f.capture.snapshot)
  const spies = recipeModelSpies({
    check: async (pair) => {
      pair.negativePrompt.text = 'Changed collaborator argument'
      pair.negativePrompt.embeddingRefs.length = 0
      pair.positivePrompt.text = 'Changed collaborator argument'
    },
    resolve: async (reference) => {
      const result = recipeResolution(reference)
      reference.localVersionId = randomUUID()
      reference.displayName = 'Changed collaborator argument'
      return result
    },
  })
  f.input.models = spies.models
  const result = await prepareCurrentCanvasRegionalRecipe(f.input)
  assert.deepEqual(result.globalPrompts.negative, prompt('<active>', [active]))
  assert.deepEqual(result.regions[0].negative.prompt, prompt('<active>', [active]))
  assert.deepEqual(result.globalEmbeddings!.negative, [recipeDescriptor(active)])
  assert.deepEqual(result.regions[0].embeddings!.negative, [recipeDescriptor(active)])
  assert.deepEqual(spies.resolved, [active.resource, active.resource])
  assert.deepEqual(f.capture.snapshot, before)
})

test('opt-in recipe propagates unbound and resolution failures without projections partial output or caller mutation', async () => {
  for (const stage of ['unbound', 'resolution'] as const) {
    const global = exactRecipeEmbedding('<global>')
    const local = exactRecipeEmbedding('<local>')
    const document = documentWith([
      region({
        prompts: {
          negative: null,
          positive: prompt('<local>', [local]),
          useGlobalNegativePrompt: true,
        },
      }),
      region(),
    ])
    document.generationDraft.positivePrompt = prompt('<global>', [global])
    const f = pureInput(document)
    f.input.job.item = {
      ...f.input.job.item,
      prompts: { ...f.input.job.item.prompts, positive: '<global>' },
    }
    const before = structuredClone({ job: f.input.job, snapshot: f.capture.snapshot })
    const failure = new Error(`Controlled ${stage} failure`)
    const spies = recipeModelSpies({
      check: async (pair) => {
        if (stage === 'unbound' && pair.positivePrompt.text === '<local>') {
          throw failure
        }
      },
      resolve: async (reference) => {
        if (stage === 'resolution' && reference.localVersionId === local.resource.localVersionId) {
          throw failure
        }
        return recipeResolution(reference)
      },
    })
    f.input.models = spies.models
    await assert.rejects(prepareCurrentCanvasRegionalRecipe(f.input), (error) => error === failure)
    assert.equal(spies.checked.length, 2)
    assert.equal(spies.resolved.length, stage === 'unbound' ? 1 : 2)
    assert.deepEqual(f.calls, [])
    assert.deepEqual({ job: f.input.job, snapshot: f.capture.snapshot }, before)
  }
})

test('opt-in recipe projects only after all resource preparation and rejects projection failure without a partial recipe', async () => {
  const active = exactRecipeEmbedding('<active>')
  const document = documentWith([region(), region()])
  document.generationDraft.negativePrompt = prompt('<active>', [active])
  const failure = new Error('Controlled opt-in projection failure')
  const spies = recipeModelSpies()
  const f = pureInput(document, async () => {
    assert.equal(spies.checked.length, 3)
    assert.equal(spies.resolved.length, 3)
    throw failure
  })
  f.input.models = spies.models
  const before = structuredClone({ job: f.input.job, snapshot: f.capture.snapshot })
  await assert.rejects(prepareCurrentCanvasRegionalRecipe(f.input), (error) => error === failure)
  assert.equal(f.calls.length, 1)
  assert.deepEqual({ job: f.input.job, snapshot: f.capture.snapshot }, before)
})

test('actual Service capture invokes opt-in recipe inside its lease with local model spies and unchanged durable state', async () => {
  await withService(async (f) => {
    const document = structuredClone(f.document())
    const prompts = [
      document.generationDraft.positivePrompt,
      document.generationDraft.negativePrompt,
    ]
    for (const owner of document.regionalGuidance ?? []) {
      for (const value of [owner.prompts?.positive, owner.prompts?.negative]) {
        if (value) {
          prompts.push(value)
        }
      }
    }
    for (const value of prompts) {
      for (const ref of value.embeddingRefs) {
        Object.assign(ref.resource, { civitaiFileId: 13, civitaiModelId: 11, civitaiVersionId: 12 })
      }
    }
    await f.co().applyDocument(parseProjectDocumentV1(document))
    await f.service.save(f.id)
    const before = await durableState(f)
    const spies = recipeModelSpies()
    await f.service.withCapturedRegionalGuidanceInput(f.id, async (capture) => {
      const snapshot = structuredClone(capture.snapshot)
      const job = jobFor(capture.snapshot)
      const result = await prepareCurrentCanvasRegionalRecipe({
        capture,
        job,
        models: spies.models,
      })
      const active = capture.snapshot.generationDraft.negativePrompt.embeddingRefs.find(
        ({ token }) => token === '<global-a>',
      )!
      assert.deepEqual(result.globalEmbeddings!.negative, [recipeDescriptor(active)])
      assert.equal(result.regions.length, 5)
      assert.equal(spies.checked.length, 6)
      assert.equal(spies.resolved.length, 6)
      const covered = result.regions.find(({ regionId }) => regionId === f.ids.covered)!
      assert.deepEqual(covered.embeddings!.negative, result.globalEmbeddings!.negative)
      assert.notEqual(
        covered.embeddings!.negative[0].reference,
        result.globalEmbeddings!.negative[0].reference,
      )
      assert.deepEqual([...covered.coverage.alpha], SOFT_ALPHA)
      assert.deepEqual(capture.snapshot, snapshot)
      const failure = new Error('Controlled real-capture model refusal')
      const failing = recipeModelSpies({
        check: async () => {
          throw failure
        },
      })
      await assert.rejects(
        prepareCurrentCanvasRegionalRecipe({ capture, job, models: failing.models }),
        (error) => error === failure,
      )
      assert.deepEqual(capture.snapshot, snapshot)
      assert.deepEqual(failing.resolved, [])
    })
    await assertDurableUnchanged(f, before)
  })
})
