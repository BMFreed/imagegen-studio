import { compileAnimaPromptWeighting } from '../../shared/projects/anima-prompt-weighting.js'
import type {
  GenerationPrompt,
  PromptEmbeddingRef,
} from '../../shared/projects/prompt-embeddings.js'

import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { CurrentCanvasRegionalRecipe } from './project-current-canvas-regional-recipe.js'

import {
  compileCurrentCanvasAnimaRegionalPrompts,
  CurrentCanvasAnimaRegionalInputError,
} from './project-current-canvas-anima-regional-input.js'
import { produceAnimaRegionalInputFixture } from './test-fixtures/anima-regional-input.js'

type Code = CurrentCanvasAnimaRegionalInputError['code']
const BBOX = { height: 64, width: 64, x: -13, y: 5 }
const id = (suffix: number): string => `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`
const prompt = (text: string, embeddingRefs: PromptEmbeddingRef[] = []): GenerationPrompt => ({
  embeddingRefs,
  text,
})

function input(count = 2): CurrentCanvasRegionalRecipe {
  return {
    bbox: { ...BBOX },
    documentId: id(1),
    documentRevision: id(2),
    family: 'anima',
    globalPrompts: { negative: prompt('(blur)0.75'), positive: prompt('(two cats)1.25') },
    item: {
      iteration: 0,
      promptPairIndex: 0,
      prompts: { negative: '(blur)0.75', positive: '(two cats)1.25' },
      seed: 123,
    },
    kind: 'current-canvas-regional-recipe',
    regions: Array.from({ length: count }, (_, index) => ({
      authoredPrompts: {
        negative: prompt(''),
        positive: prompt(index % 2 === 0 ? '(red scarf)1.5' : '(blue scarf)0.75'),
        useGlobalNegativePrompt: false,
      },
      coverage: {
        alpha: Uint8Array.from({ length: BBOX.width * BBOX.height }, () => 255),
        bounds: { ...BBOX },
        intersection: { ...BBOX },
        kind: 'covered',
      },
      maskId: id(200 + index),
      maskRevision: 1,
      negative: { prompt: prompt(''), source: 'regional' },
      positive: prompt(index % 2 === 0 ? '(red scarf)1.5' : '(blue scarf)0.75'),
      regionId: id(100 + index),
    })),
  }
}

function embedding(token = '<inactive>'): PromptEmbeddingRef {
  return {
    resource: {
      baseModelFamily: 'illustrious',
      civitaiFileId: null,
      civitaiModelId: null,
      civitaiVersionId: null,
      displayName: 'Inactive authored reference',
      fileSha256: 'a'.repeat(64),
      kind: 'embedding',
      localModelId: id(900),
      localVersionId: id(901),
      predictionType: null,
      versionName: 'Dormant metadata',
    },
    token,
  }
}

function refuses(recipe: CurrentCanvasRegionalRecipe, code: Code): void {
  const before = structuredClone(recipe)
  assert.throws(
    () => compileCurrentCanvasAnimaRegionalPrompts(recipe),
    (error: unknown) =>
      error instanceof CurrentCanvasAnimaRegionalInputError && error.code === code,
  )
  assertUnchanged(recipe, before)
}

function assertUnchanged(
  actual: CurrentCanvasRegionalRecipe,
  expected: CurrentCanvasRegionalRecipe,
): void {
  assert.equal(actual.regions.length, expected.regions.length)
  for (let index = 0; index < expected.regions.length; index++) {
    assert.ok(
      Buffer.from(actual.regions[index].coverage.alpha).equals(
        Buffer.from(expected.regions[index].coverage.alpha),
      ),
      `The caller-owned alpha bytes changed for region ${index}`,
    )
  }
  const metadata = (value: CurrentCanvasRegionalRecipe) => ({
    ...value,
    regions: value.regions.map((region) => ({
      ...region,
      coverage: { ...region.coverage, alpha: 'checked independently above' },
    })),
  })
  assert.deepEqual(metadata(actual), metadata(expected), 'Caller-owned recipe metadata changed')
}

test('private Anima sidecars preserve ordered source, polarity, raw text and existing compiler meaning', () => {
  const recipe = input()
  const before = structuredClone(recipe)
  const actual = compileCurrentCanvasAnimaRegionalPrompts(recipe)
  assert.deepEqual(
    actual.map(({ polarity, sourceId, text }) => ({ polarity, sourceId, text })),
    [
      { polarity: 'positive', sourceId: 'current-canvas', text: '(two cats)1.25' },
      { polarity: 'negative', sourceId: 'current-canvas', text: '(blur)0.75' },
      { polarity: 'positive', sourceId: id(100), text: '(red scarf)1.5' },
      { polarity: 'positive', sourceId: id(101), text: '(blue scarf)0.75' },
    ],
  )
  for (const entry of actual) {
    assert.deepEqual(entry.prompt, compileAnimaPromptWeighting(entry.text))
    assert.ok(
      Object.isFrozen(entry) &&
        Object.isFrozen(entry.prompt) &&
        Object.isFrozen(entry.prompt.spans),
    )
  }
  assertUnchanged(recipe, before)
})

test('compiled Anima sidecars are detached and cannot rewrite saved recipe metadata', () => {
  const recipe = input()
  const actual = compileCurrentCanvasAnimaRegionalPrompts(recipe)
  recipe.regions.reverse()
  recipe.globalPrompts.positive.text = 'later authoring'
  recipe.regions[0].positive!.text = 'different resource owner'
  recipe.regions[0].coverage.alpha.fill(0)
  assert.equal(actual[0].text, '(two cats)1.25')
  assert.equal(actual[2].sourceId, id(100))
  assert.equal(actual[2].prompt.cleanedText, 'red scarf')
  assert.ok(Object.isFrozen(actual))
})

test('zero, absent, exact empty and whitespace positives retain distinct authored associations', () => {
  const zero = input(0)
  assert.equal(compileCurrentCanvasAnimaRegionalPrompts(zero).length, 2)
  const recipe = input()
  recipe.regions[0].positive = prompt('')
  recipe.regions[0].authoredPrompts!.positive = prompt('')
  recipe.regions[1].positive = null
  recipe.regions[1].authoredPrompts!.positive = null
  const actual = compileCurrentCanvasAnimaRegionalPrompts(recipe)
  assert.equal(actual.length, 3)
  assert.deepEqual(actual[2], {
    polarity: 'positive',
    prompt: compileAnimaPromptWeighting(''),
    sourceId: id(100),
    text: '',
  })
  recipe.regions[0].positive = prompt(' ')
  recipe.regions[0].authoredPrompts!.positive = prompt(' ')
  assert.equal(compileCurrentCanvasAnimaRegionalPrompts(recipe)[2].prompt.cleanedText, ' ')
})

test('inherited empty negatives preserve dormant local text and inactive reference metadata', () => {
  const recipe = input()
  recipe.item = { ...recipe.item, prompts: { ...recipe.item.prompts, negative: '' } }
  recipe.globalPrompts.negative = prompt('')
  for (const region of recipe.regions) {
    region.negative = { prompt: prompt(''), source: 'current-canvas' }
    region.authoredPrompts!.negative = prompt('dormant {negative|branch} <inactive>', [embedding()])
    region.authoredPrompts!.useGlobalNegativePrompt = true
    region.authoredPrompts!.positive!.embeddingRefs = [embedding()]
  }
  const before = structuredClone(recipe)
  assert.equal(compileCurrentCanvasAnimaRegionalPrompts(recipe).length, 4)
  assertUnchanged(recipe, before)
})

test('three regional sources retain four positive streams without coalescing equal text', () => {
  const recipe = input(3)
  const result = compileCurrentCanvasAnimaRegionalPrompts(recipe)
  assert.equal(result.length, 5)
  assert.equal(result.filter(({ polarity }) => polarity === 'positive').length, 4)
  assert.equal(result[2].text, result[4].text)
  assert.notEqual(result[2].sourceId, result[4].sourceId)
  assert.notEqual(result[2].prompt, result[4].prompt)
  refuses(input(4), 'REGIONAL_ANIMA_LIMIT')
})

test('Anima sidecars retain the existing exact UTF8 text boundary and Unicode code-point spans', () => {
  const recipe = input(1)
  const text = '😀'.repeat(4096)
  recipe.regions[0].positive = prompt(text)
  recipe.regions[0].authoredPrompts!.positive = prompt(text)
  const actual = compileCurrentCanvasAnimaRegionalPrompts(recipe)[2]
  assert.deepEqual(actual.prompt.spans, [{ end: 4096, start: 0, weight: 1 }])
  recipe.regions[0].positive.text += '😀'
  recipe.regions[0].authoredPrompts!.positive.text += '😀'
  refuses(recipe, 'REGIONAL_ANIMA_LIMIT')
})

const invalidCases: readonly [string, (recipe: CurrentCanvasRegionalRecipe) => void, Code][] = [
  [
    'family',
    (recipe) => {
      recipe.family = 'illustrious'
    },
    'REGIONAL_ANIMA_UNSUPPORTED',
  ],
  [
    'concrete global text',
    (recipe) => {
      recipe.globalPrompts.positive.text = 'other'
    },
    'REGIONAL_ANIMA_INPUT_INVALID',
  ],
  [
    'regional negative',
    (recipe) => {
      recipe.regions[1].negative.prompt.text = 'nonempty negative'
    },
    'REGIONAL_ANIMA_UNSUPPORTED',
  ],
  [
    'inherited source',
    (recipe) => {
      recipe.regions[1].negative.source = 'current-canvas'
    },
    'REGIONAL_ANIMA_INPUT_INVALID',
  ],
  [
    'local source switch',
    (recipe) => {
      recipe.regions[1].authoredPrompts!.useGlobalNegativePrompt = true
    },
    'REGIONAL_ANIMA_INPUT_INVALID',
  ],
  [
    'authored positive',
    (recipe) => {
      recipe.regions[1].authoredPrompts!.positive!.text = 'other'
    },
    'REGIONAL_ANIMA_INPUT_INVALID',
  ],
  [
    'authored local negative',
    (recipe) => {
      recipe.regions[1].authoredPrompts!.negative!.text = 'other'
    },
    'REGIONAL_ANIMA_INPUT_INVALID',
  ],
  [
    'duplicate source ID',
    (recipe) => {
      recipe.regions[1].regionId = recipe.regions[0].regionId
    },
    'REGIONAL_ANIMA_INPUT_INVALID',
  ],
  [
    'shared mask ID',
    (recipe) => {
      recipe.regions[1].maskId = recipe.regions[0].maskId
    },
    'REGIONAL_ANIMA_INPUT_INVALID',
  ],
  [
    'coverage bounds',
    (recipe) => {
      recipe.regions[1].coverage.bounds.x += 1
    },
    'REGIONAL_ANIMA_INPUT_INVALID',
  ],
  [
    'coverage bytes',
    (recipe) => {
      recipe.regions[1].coverage.alpha = new Uint8Array(1)
    },
    'REGIONAL_ANIMA_INPUT_INVALID',
  ],
  [
    'global TI',
    (recipe) => {
      recipe.globalPrompts.positive.embeddingRefs.push(embedding())
    },
    'REGIONAL_ANIMA_UNSUPPORTED',
  ],
  [
    'regional TI',
    (recipe) => {
      recipe.regions[1].positive!.embeddingRefs.push(embedding())
    },
    'REGIONAL_ANIMA_UNSUPPORTED',
  ],
  [
    'negative TI',
    (recipe) => {
      recipe.regions[1].negative.prompt.embeddingRefs.push(embedding())
    },
    'REGIONAL_ANIMA_UNSUPPORTED',
  ],
  [
    'resolved global resources',
    (recipe) => {
      Object.assign(recipe, { globalEmbeddings: undefined })
    },
    'REGIONAL_ANIMA_UNSUPPORTED',
  ],
  [
    'resolved regional resources',
    (recipe) => {
      Object.assign(recipe.regions[1], { embeddings: undefined })
    },
    'REGIONAL_ANIMA_UNSUPPORTED',
  ],
  [
    'regional image reference',
    (recipe) => {
      Object.assign(recipe.regions[1], { referenceImages: [{}] })
    },
    'REGIONAL_ANIMA_UNSUPPORTED',
  ],
  [
    'extra LoRA material',
    (recipe) => {
      Object.assign(recipe, { loras: [] })
    },
    'REGIONAL_ANIMA_INPUT_INVALID',
  ],
  [
    'bool seed',
    (recipe) => {
      Object.assign(recipe.item, { seed: true })
    },
    'REGIONAL_ANIMA_INPUT_INVALID',
  ],
  [
    'nonmultiple dimension',
    (recipe) => {
      recipe.bbox.width = 65
    },
    'REGIONAL_ANIMA_INPUT_INVALID',
  ],
  [
    'dynamic source',
    (recipe) => {
      recipe.regions[1].positive!.text = '{one|two}'
    },
    'REGIONAL_ANIMA_INPUT_INVALID',
  ],
  [
    'unpaired surrogate',
    (recipe) => {
      recipe.regions[1].positive!.text = '\uD800'
    },
    'REGIONAL_ANIMA_INPUT_INVALID',
  ],
]
for (const [name, change, code] of invalidCases) {
  test(`private Anima preflight refuses ${name} without caller mutation`, () => {
    const recipe = input()
    change(recipe)
    refuses(recipe, code)
  })
}

test('an active authored reference cannot disappear from the effective positive binding', () => {
  const recipe = input(1)
  recipe.regions[0].positive = prompt('<active>')
  recipe.regions[0].authoredPrompts!.positive = prompt('<active>', [embedding('<active>')])
  refuses(recipe, 'REGIONAL_ANIMA_UNSUPPORTED')
})

test('late weighted-syntax refusal uses the existing compiler and returns no partial sidecars', () => {
  const recipe = input()
  recipe.regions[1].positive!.text = 'late (unclosed'
  recipe.regions[1].authoredPrompts!.positive!.text = 'late (unclosed'
  const before = structuredClone(recipe)
  assert.throws(() => compileCurrentCanvasAnimaRegionalPrompts(recipe), /unclosed/iu)
  assertUnchanged(recipe, before)
})

for (const variant of ['base', 'swapped', 'zero', 'empty', 'inherited'] as const) {
  test(`genuine saved/reopened Anima ${variant} fixture retains concrete Main capture and durable state`, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'igs-anima-regional-input-'))
    try {
      const fixture = await produceAnimaRegionalInputFixture(root, { variant })
      assert.equal(fixture.schema, 'main-anima-regional-positive-v1')
      assert.equal(fixture.recipe.family, 'anima')
      assert.deepEqual(fixture.recipe.bbox, { height: 72, width: 104, x: -13, y: 5 })
      assert.equal(fixture.recipe.item.seed, fixture.sampling.seed)
      assert.equal(fixture.sampling.scheduler, 'euler')
      assert.equal(fixture.sampling.totalSteps, 2)
      assert.equal(fixture.recipe.documentId, fixture.authoredDocument.documentId)
      assert.equal(fixture.recipe.documentRevision, fixture.authoredDocument.documentRevision)
      assert.equal(
        fixture.compiledPrompts.length,
        variant === 'zero' ? 2 : variant === 'empty' ? 3 : 4,
      )
      assert.equal(fixture.recipe.regions.length, variant === 'zero' ? 0 : 2)
      assert.equal(fixture.durablePreservation.durableUnchanged, true)
      assert.equal(fixture.durablePreservation.savedAndReopened, true)
      assert.equal(fixture.durablePreservation.historyAndSeedCursorUnchanged, true)
      assert.equal(fixture.durablePreservation.modelMetadataOnly, true)
      assert.equal(fixture.durablePreservation.captureCalls, 1)
      assert.equal(Object.hasOwn(fixture.recipe, 'globalEmbeddings'), false)
      assert.equal(fixture.authoredDocument.generationDraft.loras.length, 0)
      assert.equal(fixture.authoredDocument.regionalGuidance!.length, 2)
      if (variant !== 'zero') {
        assert.equal(fixture.recipe.regions[0].coverage.alpha.length, 104 * 72)
        assert.ok(fixture.recipe.regions[0].coverage.alpha.includes(127))
        assert.ok(fixture.recipe.regions[0].coverage.alpha.includes(128))
        assert.equal(fixture.recipe.regions[0].regionId, id(101))
        assert.equal(fixture.recipe.regions[1].regionId, id(102))
        assert.equal(
          fixture.recipe.regions[0].negative.source,
          variant === 'inherited' ? 'current-canvas' : 'regional',
        )
      }
      const retained = await readFile(fixture.paths.handoff)
      assert.ok(
        retained.equals(Buffer.from(`${JSON.stringify(fixture, null, 2)}\n`)),
        'Retained complete handoff bytes differ',
      )
      assert.ok((await readFile(fixture.paths.database)).length > 0)
      assert.ok((await readFile(fixture.paths.package)).length > 0)
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })
}
