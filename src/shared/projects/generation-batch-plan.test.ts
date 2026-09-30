import assert from 'node:assert/strict'
import { test } from 'node:test'

import { type GenerationBatchPlanInput, planGenerationBatch } from './generation-batch-plan.js'

function input(overrides: Partial<GenerationBatchPlanInput> = {}): GenerationBatchPlanInput {
  return {
    baseSeed: 100,
    iterations: 1,
    maxJobs: 64,
    maxPrompts: 64,
    negativePrompt: '',
    positivePrompt: '',
    seedBehavior: 'per-iteration',
    ...overrides,
  }
}

test('plain and empty prompts create one owned immutable plan without rewriting text', () => {
  for (const positivePrompt of ['', '  (soft light:1.2), $&, $`, $$  ']) {
    const source = input({ positivePrompt })
    const plan = planGenerationBatch(source)
    assert.deepEqual(plan, {
      items: [
        {
          iteration: 0,
          promptPairIndex: 0,
          prompts: { negative: '', positive: positivePrompt },
          seed: 100,
        },
      ],
      truncated: false,
    })
    source.positivePrompt = 'changed after planning'
    assert.equal(plan.items[0].prompts.positive, positivePrompt)
    assert.ok(Object.isFrozen(plan))
    assert.ok(Object.isFrozen(plan.items))
    assert.ok(Object.isFrozen(plan.items[0]))
    assert.ok(Object.isFrozen(plan.items[0].prompts))
  }
})

test('Cartesian groups use the last group fastest and positive outer negative inner pair order', () => {
  const plan = planGenerationBatch(
    input({
      iterations: 2,
      negativePrompt: '{soft|hard}',
      positivePrompt: '{red|blue} {small|large}',
    }),
  )
  const pairs = [
    ['red small', 'soft'],
    ['red small', 'hard'],
    ['red large', 'soft'],
    ['red large', 'hard'],
    ['blue small', 'soft'],
    ['blue small', 'hard'],
    ['blue large', 'soft'],
    ['blue large', 'hard'],
  ]
  assert.deepEqual(
    plan.items,
    pairs.flatMap(([positive, negative], promptPairIndex) =>
      [0, 1].map((iteration) => ({
        iteration,
        promptPairIndex,
        prompts: { negative, positive },
        seed: 100 + iteration,
      })),
    ),
  )
  assert.equal(plan.truncated, false)
})

test('per-iteration seeds share the iteration across pairs with uint32 wrap and seed zero', () => {
  const source = input({ baseSeed: 0xff_ff_ff_ff, iterations: 2, positivePrompt: '{a|b}' })
  assert.deepEqual(
    planGenerationBatch(source).items.map((item) => item.seed),
    [0xff_ff_ff_ff, 0, 0xff_ff_ff_ff, 0],
  )
  assert.deepEqual(
    planGenerationBatch(input({ baseSeed: 0, iterations: 2 })).items.map((item) => item.seed),
    [0, 1],
  )
})

test('per-prompt neighboring control advances every pair iteration independently with uint32 wrap', () => {
  const source = input({ baseSeed: 0xff_ff_ff_ff, iterations: 2, positivePrompt: '{a|b}' })
  assert.deepEqual(
    planGenerationBatch({ ...source, seedBehavior: 'per-prompt' }).items.map((item) => item.seed),
    [0xff_ff_ff_ff, 0, 1, 2],
  )
  assert.deepEqual(
    planGenerationBatch(input({ baseSeed: 0, iterations: 2 })).items.map((item) => item.seed),
    [0, 1],
  )
})

test('maxPrompts truncates the pair prefix before iterations while exact limits are untruncated', () => {
  const source = input({
    iterations: 2,
    maxPrompts: 3,
    negativePrompt: '{soft|hard}',
    positivePrompt: '{red|blue}',
  })
  const plan = planGenerationBatch(source)
  assert.deepEqual(
    plan.items.map((item) => item.prompts),
    [
      { negative: 'soft', positive: 'red' },
      { negative: 'soft', positive: 'red' },
      { negative: 'hard', positive: 'red' },
      { negative: 'hard', positive: 'red' },
      { negative: 'soft', positive: 'blue' },
      { negative: 'soft', positive: 'blue' },
    ],
  )
  assert.equal(plan.truncated, true)
  assert.equal(planGenerationBatch({ ...source, maxPrompts: 4 }).truncated, false)
  assert.equal(planGenerationBatch({ ...source, maxPrompts: 1 }).items.length, 2)
})

test('duplicate alternatives remain separate jobs and trimming is local to group alternatives', () => {
  const plan = planGenerationBatch(input({ positivePrompt: '  before { a | a | b } after  ' }))
  assert.deepEqual(
    plan.items.map((item) => item.prompts.positive),
    ['  before a after  ', '  before a after  ', '  before b after  '],
  )
  assert.equal(plan.truncated, false)
})

test('backslash escaped braces and pipes stay literal and retain their downstream escape text', () => {
  const escaped = String.raw`\{literal\|group\} {red\|blue|green} tail\\`
  assert.deepEqual(
    planGenerationBatch(input({ positivePrompt: escaped })).items.map(
      (item) => item.prompts.positive,
    ),
    [String.raw`\{literal\|group\} red\|blue tail\\`, String.raw`\{literal\|group\} green tail\\`],
  )
  assert.deepEqual(
    planGenerationBatch(input({ positivePrompt: String.raw`\\{a|b}` })).items.map(
      (item) => item.prompts.positive,
    ),
    [String.raw`\\a`, String.raw`\\b`],
  )
  assert.equal(
    planGenerationBatch(input({ positivePrompt: 'trailing\\' })).items[0].prompts.positive,
    'trailing\\',
  )
  assert.deepEqual(
    planGenerationBatch(input({ positivePrompt: String.raw`{a\{b|c\}}` })).items.map(
      (item) => item.prompts.positive,
    ),
    [String.raw`a\{b`, String.raw`c\}`],
  )
})

test('alternative dollar sequences are literal text rather than JavaScript replacement patterns', () => {
  const plan = planGenerationBatch(input({ positivePrompt: "start {$&|$$|$`|$'} end" }))
  assert.deepEqual(
    plan.items.map((item) => item.prompts.positive),
    ['start $& end', 'start $$ end', 'start $` end', "start $' end"],
  )
})

test('malformed nested and empty alternatives refuse the whole plan including syntax beyond its prefix', () => {
  for (const source of [
    '{a}',
    '{}',
    '{a|}',
    '{|a}',
    '{a||b}',
    '{a|  |b}',
    '{a|{b|c}}',
    '{a|b',
    'a|b}',
    '{a|b} {later|}',
    '{a|b} extra}',
  ]) {
    for (const sign of ['positivePrompt', 'negativePrompt'] as const) {
      assert.throws(() => planGenerationBatch(input({ maxPrompts: 1, [sign]: source })), {
        code: 'PROMPT_INVALID',
      })
    }
  }
})

test('bounded prefix planning handles an astronomical Cartesian product without materializing it', () => {
  const source = '{a|b}'.repeat(256)
  const plan = planGenerationBatch(input({ maxPrompts: 2, positivePrompt: source }))
  assert.deepEqual(
    plan.items.map((item) => item.prompts.positive),
    ['a'.repeat(256), `${'a'.repeat(255)}b`],
  )
  assert.equal(plan.truncated, true)
})

test('caller job bound refuses overflow before returning a partial plan and permits exact capacity', () => {
  const source = input({
    iterations: 2,
    maxJobs: 64,
    positivePrompt: Array.from({ length: 32 }, (_, index) => String(index)).join('|'),
  })
  source.positivePrompt = `{${source.positivePrompt}}`
  assert.equal(planGenerationBatch(source).items.length, 64)
  assert.throws(() => planGenerationBatch({ ...source, iterations: 3 }), {
    code: 'BATCH_TOO_LARGE',
  })
  assert.equal(planGenerationBatch({ ...source, maxJobs: 2, maxPrompts: 1 }).items.length, 2)
  assert.throws(
    () => planGenerationBatch(input({ iterations: Number.MAX_SAFE_INTEGER, maxJobs: 64 })),
    { code: 'BATCH_TOO_LARGE' },
  )
  assert.throws(
    () =>
      planGenerationBatch(
        input({ maxPrompts: Number.MAX_SAFE_INTEGER, positivePrompt: '{a|b}'.repeat(256) }),
      ),
    { code: 'BATCH_TOO_LARGE' },
  )
})

test('source and concrete prompts honor the 16 KiB UTF8 envelope including multibyte text', () => {
  for (const source of ['x'.repeat(16 * 1024), 'é'.repeat(8 * 1024), '😀'.repeat(4 * 1024)]) {
    for (const sign of ['positivePrompt', 'negativePrompt'] as const) {
      const plan = planGenerationBatch(input({ [sign]: source }))
      assert.equal(
        new TextEncoder().encode(
          plan.items[0].prompts[sign === 'positivePrompt' ? 'positive' : 'negative'],
        ).length,
        16 * 1024,
      )
      assert.equal(plan.truncated, false)
      assert.throws(() => planGenerationBatch(input({ [sign]: `${source}x` })), {
        code: 'PROMPT_INVALID',
      })
    }
  }
  assert.equal(
    planGenerationBatch(input({ positivePrompt: '{é|😀}' })).items[1].prompts.positive,
    '😀',
  )
  for (const source of ['\uD800', '\uDC00', 'x\uD800y']) {
    assert.throws(() => planGenerationBatch(input({ positivePrompt: source })), {
      code: 'PROMPT_INVALID',
    })
  }
})

test('runtime input validation rejects invalid numbers strings enums and uint32 seeds', () => {
  for (const key of ['iterations', 'maxJobs', 'maxPrompts'] as const) {
    for (const value of [
      0,
      -1,
      0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      assert.throws(() => planGenerationBatch(input({ [key]: value })), { code: 'INPUT_INVALID' })
    }
  }
  for (const baseSeed of [-1, 0.5, 0x1_00_00_00_00, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => planGenerationBatch(input({ baseSeed })), { code: 'INPUT_INVALID' })
  }
  for (const override of [
    { seedBehavior: 'unknown' },
    { positivePrompt: null },
    { negativePrompt: 42 },
    { maxJobs: '64' },
  ]) {
    assert.throws(() => planGenerationBatch(input(override as Partial<GenerationBatchPlanInput>)), {
      code: 'INPUT_INVALID',
    })
  }
  assert.throws(() => planGenerationBatch(null as unknown as GenerationBatchPlanInput), {
    code: 'INPUT_INVALID',
  })
})
