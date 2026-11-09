import { compileAnimaPromptWeighting } from '../../shared/projects/anima-prompt-weighting.js'
import type {
  GenerationPrompt,
  PromptEmbeddingRef,
} from '../../shared/projects/prompt-embeddings.js'

import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { CurrentCanvasRegionalRecipe } from './project-current-canvas-regional-recipe.js'

import {
  compileCurrentCanvasAnimaRegionalPrompts,
  CurrentCanvasAnimaRegionalInputError,
  hasCompiledAnimaRegionalNegative,
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
      assert.equal(Object.hasOwn(fixture, 'verifiedBundle'), false)
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

test('genuine Anima fixture preserves explicit useful steps and CFG in saved Main authoring and plan', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-anima-regional-sampling-'))
  try {
    const fixture = await produceAnimaRegionalInputFixture(root, {
      guidanceScale: 5,
      steps: 20,
    })
    assert.equal(fixture.sampling.totalSteps, 20)
    assert.equal(fixture.sampling.guidanceScale, 5)
    assert.equal(fixture.authoredDocument.generationDraft.sampling.steps, 20)
    assert.equal(fixture.authoredDocument.generationDraft.sampling.cfgScale, 5)
    assert.equal(fixture.durablePreservation.modelMetadataOnly, true)
    assert.equal(Object.hasOwn(fixture, 'verifiedBundle'), false)
    assert.equal(fixture.durablePreservation.durableUnchanged, true)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

for (const options of [
  { steps: 0 },
  { steps: 201 },
  { steps: 1.5 },
  { guidanceScale: 0 },
  { guidanceScale: 31 },
  { guidanceScale: Number.NaN },
]) {
  test(`Anima fixture sampling rejects invalid ${JSON.stringify(options)} before creating durable state`, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'igs-anima-regional-invalid-'))
    try {
      await assert.rejects(produceAnimaRegionalInputFixture(path.join(root, 'uncreated'), options))
      assert.deepEqual(await readdir(root), [])
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })
}

test('trained Anima fixture rejects a nonqualified checkpoint descriptor before any file or SQL work', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-anima-regional-trained-invalid-'))
  try {
    await assert.rejects(
      produceAnimaRegionalInputFixture(path.join(root, 'uncreated'), {
        trainedBundle: {
          checkpoint: {
            byteSize: 4_182_275_752,
            path: path.join(root, 'unread-checkpoint.safetensors'),
            sha256: '0'.repeat(64),
          },
          qwen3Encoder: {
            byteSize: 1_192_135_096,
            path: path.join(root, 'unread-qwen.safetensors'),
            sha256: 'cd2a512003e2f9f3cd3c32a9c3573f820bb28c940f73c57b1ddaa983d9223eba',
          },
          vae: {
            byteSize: 253_806_246,
            path: path.join(root, 'unread-vae.safetensors'),
            sha256: 'a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f',
          },
        },
      }),
      /0fc7507b222e52ac8cc5e2826786bc4caed05223df32d17aeb05a76cb4de9941/u,
    )
    assert.deepEqual(await readdir(root), [])
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

const SCENE_CONTEXT_TEXTS = [
  '(red scarf)1.5, one white cat on one bench',
  '(blue scarf)0.75, one white cat on one bench',
] as const

for (const variant of ['base', 'swapped'] as const) {
  test(`genuine Anima ${variant} fixture saves and consumes explicit regional scene text without changing other inputs`, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'igs-anima-regional-scene-'))
    try {
      const baseline = await produceAnimaRegionalInputFixture(path.join(root, 'default'), {
        variant,
      })
      const fixture = await produceAnimaRegionalInputFixture(path.join(root, 'custom'), {
        regionalTexts: SCENE_CONTEXT_TEXTS,
        variant,
      })
      const expectedTexts =
        variant === 'swapped' ? [...SCENE_CONTEXT_TEXTS].reverse() : SCENE_CONTEXT_TEXTS
      assert.equal(fixture.schema, baseline.schema)
      assert.deepEqual(fixture.sampling, baseline.sampling)
      assert.deepEqual(fixture.recipe.bbox, baseline.recipe.bbox)
      assert.deepEqual(fixture.recipe.globalPrompts, baseline.recipe.globalPrompts)
      assert.deepEqual(fixture.compiledPrompts.slice(0, 2), baseline.compiledPrompts.slice(0, 2))
      assert.deepEqual(
        fixture.authoredDocument.generationDraft.positivePrompt,
        baseline.authoredDocument.generationDraft.positivePrompt,
      )
      assert.deepEqual(
        fixture.authoredDocument.generationDraft.negativePrompt,
        baseline.authoredDocument.generationDraft.negativePrompt,
      )
      assert.equal(Object.hasOwn(fixture, 'regionalTexts'), false)
      assert.equal(Object.hasOwn(fixture.recipe, 'regionalTexts'), false)
      const authored = fixture.authoredDocument.regionalGuidance!
      const defaultAuthored = baseline.authoredDocument.regionalGuidance!
      assert.equal(authored.length, 2)
      assert.equal(fixture.recipe.regions.length, 2)
      for (const index of [0, 1] as const) {
        const text = expectedTexts[index]
        const effective = fixture.recipe.regions[index]
        const original = baseline.recipe.regions[index]
        assert.deepEqual(authored[index].prompts!.positive, prompt(text))
        assert.deepEqual(authored[index].mask, defaultAuthored[index].mask)
        assert.equal(authored[index].id, defaultAuthored[index].id)
        assert.equal(authored[index].enabled, defaultAuthored[index].enabled)
        assert.equal(authored[index].locked, defaultAuthored[index].locked)
        assert.equal(authored[index].overlayOpacity, defaultAuthored[index].overlayOpacity)
        assert.deepEqual(
          authored[index].prompts!.negative,
          defaultAuthored[index].prompts!.negative,
        )
        assert.equal(
          authored[index].prompts!.useGlobalNegativePrompt,
          defaultAuthored[index].prompts!.useGlobalNegativePrompt,
        )
        assert.deepEqual(effective.positive, prompt(text))
        assert.deepEqual(effective.authoredPrompts?.positive, prompt(text))
        assert.deepEqual(effective.coverage, original.coverage)
        assert.deepEqual(effective.negative, original.negative)
        assert.equal(effective.regionId, original.regionId)
        assert.equal(effective.maskId, original.maskId)
        assert.equal(effective.maskRevision, original.maskRevision)
        assert.deepEqual(fixture.compiledPrompts[index + 2], {
          polarity: 'positive',
          prompt: compileAnimaPromptWeighting(text),
          sourceId: effective.regionId,
          text,
        })
      }
      assert.equal(fixture.durablePreservation.savedAndReopened, true)
      assert.equal(fixture.durablePreservation.durableUnchanged, true)
      assert.equal(fixture.durablePreservation.historyAndSeedCursorUnchanged, true)
      assert.equal(fixture.durablePreservation.captureCalls, 1)
      assert.ok(
        (await readFile(fixture.paths.handoff)).equals(
          Buffer.from(`${JSON.stringify(fixture, null, 2)}\n`),
        ),
      )
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })
}

for (const variant of ['zero', 'empty', 'inherited'] as const) {
  test(`explicit Anima regional text preserves the ${variant} fixture branch`, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'igs-anima-regional-scene-branch-'))
    try {
      const fixture = await produceAnimaRegionalInputFixture(root, {
        regionalTexts: SCENE_CONTEXT_TEXTS,
        variant,
      })
      const authored = fixture.authoredDocument.regionalGuidance!
      assert.equal(authored.length, 2)
      assert.deepEqual(
        fixture.authoredDocument.generationDraft.positivePrompt,
        prompt('(two white cats)1.25 on one bench'),
      )
      assert.deepEqual(
        fixture.authoredDocument.generationDraft.negativePrompt,
        prompt(variant === 'inherited' ? '' : '(blur)0.75, noise'),
      )
      if (variant === 'empty') {
        assert.deepEqual(
          authored.map((region) => region.prompts!.positive),
          [prompt(''), null],
        )
        assert.deepEqual(
          fixture.recipe.regions.map((region) => region.positive),
          [prompt(''), null],
        )
        assert.equal(fixture.compiledPrompts.length, 3)
        assert.equal(fixture.compiledPrompts[2].text, '')
      } else {
        assert.deepEqual(
          authored.map((region) => region.prompts!.positive),
          SCENE_CONTEXT_TEXTS.map((text) => prompt(text)),
        )
        assert.ok(authored.every((region) => region.enabled === (variant !== 'zero')))
        if (variant === 'zero') {
          assert.equal(fixture.recipe.regions.length, 0)
          assert.equal(fixture.compiledPrompts.length, 2)
        } else {
          assert.ok(authored.every((region) => region.prompts!.useGlobalNegativePrompt))
          assert.ok(
            authored.every(
              (region) =>
                region.prompts!.negative!.text === 'dormant {not|selected} local negative',
            ),
          )
          assert.ok(
            fixture.recipe.regions.every((region) => region.negative.source === 'current-canvas'),
          )
          assert.deepEqual(
            fixture.compiledPrompts.slice(2).map((entry) => entry.text),
            SCENE_CONTEXT_TEXTS,
          )
        }
      }
      assert.equal(fixture.durablePreservation.savedAndReopened, true)
      assert.equal(fixture.durablePreservation.durableUnchanged, true)
      assert.equal(fixture.durablePreservation.historyAndSeedCursorUnchanged, true)
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })
}

test('Anima fixture owns explicit regional strings before its first filesystem await', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-anima-regional-scene-owned-'))
  try {
    const regionalTexts: [string, string] = [...SCENE_CONTEXT_TEXTS]
    const options = { regionalTexts }
    const pending = produceAnimaRegionalInputFixture(root, options)
    regionalTexts[0] = 'changed original first'
    regionalTexts[1] = 'changed original second'
    options.regionalTexts = ['replaced first', 'replaced second']
    const fixture = await pending
    assert.deepEqual(
      fixture.authoredDocument.regionalGuidance!.map((region) => region.prompts!.positive),
      SCENE_CONTEXT_TEXTS.map((text) => prompt(text)),
    )
    assert.deepEqual(
      fixture.recipe.regions.map((region) => region.positive),
      SCENE_CONTEXT_TEXTS.map((text) => prompt(text)),
    )
    assert.deepEqual(
      fixture.compiledPrompts.slice(2).map((entry) => entry.text),
      SCENE_CONTEXT_TEXTS,
    )
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

for (const [label, regionalTexts] of [
  ['null', null],
  ['not an array', 'plain text'],
  ['missing text', ['one']],
  ['extra text', ['one', 'two', 'three']],
  ['non-text first', [1, 'two']],
  ['non-text second', ['one', 2]],
  ['empty text', ['', 'two']],
  ['blank text', ['one', ' \t\n']],
  ['unclosed attention', ['one', '(two']],
  ['unsupported resource syntax', ['one', '<embedding>']],
  ['UTF-8 byte overflow', ['one', 'é'.repeat(8193)]],
] as const) {
  test(`Anima fixture refuses ${label} regional text before filesystem or SQL work`, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'igs-anima-regional-scene-invalid-'))
    try {
      const options = { regionalTexts } as unknown as NonNullable<
        Parameters<typeof produceAnimaRegionalInputFixture>[1]
      >
      await assert.rejects(produceAnimaRegionalInputFixture(path.join(root, 'uncreated'), options))
      assert.deepEqual(await readdir(root), [])
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })
}

const SIGNED_NEGATIVE = { negativeProfile: 'invoke-anima-regional-negative-v1' } as const
function signedInput(): CurrentCanvasRegionalRecipe {
  const value = input()
  const first = value.regions[0]
  first.authoredPrompts!.negative = prompt('(red scarf)1.5')
  first.negative = { prompt: prompt('(red scarf)1.5'), source: 'regional' }
  const second = value.regions[1]
  second.authoredPrompts!.useGlobalNegativePrompt = true
  second.authoredPrompts!.negative = prompt('{dormant|local}')
  second.negative = {
    prompt: structuredClone(value.globalPrompts.negative),
    source: 'current-canvas',
  }
  return value
}

test('explicit signed Anima compiler keeps independent local and inherited negative source records', () => {
  const value = signedInput()
  const before = structuredClone(value)
  const records = compileCurrentCanvasAnimaRegionalPrompts(value, SIGNED_NEGATIVE)
  assert.deepEqual(
    records.map(({ polarity, sourceId, text }) => ({ polarity, sourceId, text })),
    [
      { polarity: 'positive', sourceId: 'current-canvas', text: '(two cats)1.25' },
      { polarity: 'negative', sourceId: 'current-canvas', text: '(blur)0.75' },
      { polarity: 'positive', sourceId: id(100), text: '(red scarf)1.5' },
      { polarity: 'negative', sourceId: id(100), text: '(red scarf)1.5' },
      { polarity: 'positive', sourceId: id(101), text: '(blue scarf)0.75' },
      { polarity: 'negative', sourceId: id(101), text: '(blur)0.75' },
    ],
  )
  for (const record of records) {
    assert.deepEqual(record.prompt, compileAnimaPromptWeighting(record.text))
  }
  assert.equal(hasCompiledAnimaRegionalNegative(records), true)
  assertUnchanged(value, before)
  refuses(value, 'REGIONAL_ANIMA_UNSUPPORTED')
})

test('explicit signed compiler keeps old empty-negative record bytes and exact ordering', () => {
  const value = input()
  const legacy = compileCurrentCanvasAnimaRegionalPrompts(value)
  const signed = compileCurrentCanvasAnimaRegionalPrompts(value, SIGNED_NEGATIVE)
  assert.equal(JSON.stringify(signed), JSON.stringify(legacy))
  assert.equal(hasCompiledAnimaRegionalNegative(signed), false)
})

test('negative-only Anima sources are compiled independently before absent-positive continuation', () => {
  const value = signedInput()
  for (const region of value.regions) {
    region.positive = null
    region.authoredPrompts!.positive = null
  }
  const records = compileCurrentCanvasAnimaRegionalPrompts(value, SIGNED_NEGATIVE)
  assert.deepEqual(
    records.slice(2).map(({ polarity, sourceId, text }) => ({ polarity, sourceId, text })),
    [
      { polarity: 'negative', sourceId: id(100), text: '(red scarf)1.5' },
      { polarity: 'negative', sourceId: id(101), text: '(blur)0.75' },
    ],
  )
  assert.equal(hasCompiledAnimaRegionalNegative(records), true)
})

for (const branch of [
  'inherited-text',
  'inherited-refs',
  'local-authored',
  'local-active-refs',
  'late-positive',
] as const) {
  test(`signed Anima compiler refuses ${branch} atomically with no caller mutation`, () => {
    const value = signedInput()
    if (branch === 'inherited-text') {
      value.regions[1].negative.prompt.text += ' changed'
    }
    if (branch === 'inherited-refs') {
      value.regions[1].negative.prompt.embeddingRefs = [embedding()]
    }
    if (branch === 'local-authored') {
      value.regions[0].authoredPrompts!.negative!.text += ' changed'
    }
    if (branch === 'local-active-refs') {
      value.regions[0].authoredPrompts!.negative!.embeddingRefs = [embedding('scarf')]
    }
    if (branch === 'late-positive') {
      value.regions[1].positive!.text += ' changed'
    }
    const before = structuredClone(value)
    assert.throws(
      () => compileCurrentCanvasAnimaRegionalPrompts(value, SIGNED_NEGATIVE),
      CurrentCanvasAnimaRegionalInputError,
    )
    assertUnchanged(value, before)
  })
}

for (const options of [
  null,
  [],
  { negativeProfile: 'other' },
  { negativeProfile: false },
  { unexpected: true },
]) {
  test(`signed Anima compiler refuses unsupported private profile ${JSON.stringify(options)}`, () => {
    const value = input()
    assert.throws(
      () =>
        compileCurrentCanvasAnimaRegionalPrompts(
          value,
          options as unknown as typeof SIGNED_NEGATIVE,
        ),
      CurrentCanvasAnimaRegionalInputError,
    )
  })
}

test('signed Anima compilation retains all eight independent streams at the exact UTF8 text envelope', () => {
  const value = input(3)
  const text = 'é'.repeat(8192)
  value.globalPrompts = { negative: prompt(text), positive: prompt(text) }
  ;(value.item as { prompts: { negative: string; positive: string } }).prompts = {
    negative: text,
    positive: text,
  }
  for (const region of value.regions) {
    region.positive = prompt(text)
    region.authoredPrompts!.positive = prompt(text)
    region.authoredPrompts!.useGlobalNegativePrompt = true
    region.negative = { prompt: prompt(text), source: 'current-canvas' }
  }
  const records = compileCurrentCanvasAnimaRegionalPrompts(value, SIGNED_NEGATIVE)
  assert.equal(records.length, 8)
  assert.equal(
    records.reduce((sum, record) => sum + Buffer.byteLength(record.text, 'utf8'), 0),
    128 * 1024,
  )
  assert.equal(
    new Set(
      records.filter((record) => record.polarity === 'negative').map((record) => record.sourceId),
    ).size,
    4,
  )
  value.regions[2].negative.prompt.text += 'é'
  assert.throws(
    () => compileCurrentCanvasAnimaRegionalPrompts(value, SIGNED_NEGATIVE),
    CurrentCanvasAnimaRegionalInputError,
  )
})

for (const variant of ['negative', 'negative-neighbor', 'negative-only'] as const) {
  test(`genuine Main ${variant} fixture preserves signed ownership through Save reopen and read-only capture`, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'igs-anima-signed-main-'))
    try {
      const fixture = await produceAnimaRegionalInputFixture(root, { variant })
      assert.equal(fixture.schema, 'main-anima-regional-signed-v1')
      assert.equal(
        fixture.authoredDocument.generationDraft.negativePrompt.text,
        '(blur)0.75, noise',
      )
      assert.equal(fixture.recipe.regions[0].negative.source, 'regional')
      assert.equal(
        fixture.recipe.regions[0].negative.prompt.text,
        variant === 'negative-neighbor' ? '(green scarf)1.5' : '(red scarf)1.5',
      )
      assert.equal(fixture.recipe.regions[1].negative.source, 'current-canvas')
      assert.deepEqual(
        fixture.recipe.regions[1].negative.prompt,
        fixture.recipe.globalPrompts.negative,
      )
      assert.equal(
        fixture.authoredDocument.regionalGuidance![1].prompts!.negative!.text,
        'dormant {not|selected} local negative',
      )
      const negative = fixture.compiledPrompts.filter(
        (record) => record.sourceId !== 'current-canvas' && record.polarity === 'negative',
      )
      assert.deepEqual(
        negative.map((record) => record.text),
        [fixture.recipe.regions[0].negative.prompt.text, '(blur)0.75, noise'],
      )
      assert.equal(fixture.compiledPrompts.length, variant === 'negative-only' ? 4 : 6)
      if (variant === 'negative-only') {
        assert.ok(fixture.recipe.regions.every((region) => region.positive === null))
      }
      assert.equal(fixture.durablePreservation.savedAndReopened, true)
      assert.equal(fixture.durablePreservation.durableUnchanged, true)
      assert.equal(fixture.durablePreservation.historyAndSeedCursorUnchanged, true)
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })
}

test('signed Main fixture owns negative override tuples before its first filesystem await', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-anima-signed-owned-'))
  try {
    const regionalNegativeTexts: [string, string] = [' ', '']
    const inheritGlobalNegative: [boolean, boolean] = [false, false]
    const pending = produceAnimaRegionalInputFixture(root, {
      inheritGlobalNegative,
      regionalNegativeTexts,
      variant: 'negative',
    })
    regionalNegativeTexts[0] = 'later changed'
    inheritGlobalNegative[0] = true
    const fixture = await pending
    assert.deepEqual(
      fixture.recipe.regions.map((region) => region.negative.prompt.text),
      [' ', ''],
    )
    assert.ok(fixture.recipe.regions.every((region) => region.negative.source === 'regional'))
    assert.deepEqual(
      fixture.compiledPrompts
        .filter((record) => record.polarity === 'negative')
        .map((record) => record.text),
      ['(blur)0.75, noise', ' '],
    )
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('old Main fixture variants reject negative-only override arguments before creating any path', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-anima-signed-old-invalid-'))
  try {
    for (const options of [
      { regionalNegativeTexts: ['', ''] as const },
      { inheritGlobalNegative: [false, true] as const },
    ]) {
      await assert.rejects(
        produceAnimaRegionalInputFixture(path.join(root, 'not-created'), options),
      )
      assert.deepEqual(await readdir(root), [])
    }
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})
