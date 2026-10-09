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

test('negative-side saturated expansion keeps the whole prefix on the first positive alternative', () => {
  // Boundary: actual parser/planner; maxPrompts bounds negative expansion before pair selection.
  // Neighbor: moving the large product to negative must retain the positive-outer order.
  // Mutation: decrement a saturated negative radix, which assigns the last prefix row to blue.
  const source = input({
    iterations: 2,
    maxJobs: 32,
    maxPrompts: 3,
    negativePrompt: '{soft|hard}'.repeat(128),
    positivePrompt: '{red|blue}',
  })
  const plan = planGenerationBatch(source)
  assert.equal(plan.truncated, true)
  assert.deepEqual(
    plan.items.map(({ iteration, promptPairIndex, prompts, seed }) => ({
      iteration,
      promptPairIndex,
      prompts,
      seed,
    })),
    [
      {
        iteration: 0,
        promptPairIndex: 0,
        prompts: { negative: 'soft'.repeat(128), positive: 'red' },
        seed: 100,
      },
      {
        iteration: 1,
        promptPairIndex: 0,
        prompts: { negative: 'soft'.repeat(128), positive: 'red' },
        seed: 101,
      },
      {
        iteration: 0,
        promptPairIndex: 1,
        prompts: { negative: `${'soft'.repeat(127)}hard`, positive: 'red' },
        seed: 100,
      },
      {
        iteration: 1,
        promptPairIndex: 1,
        prompts: { negative: `${'soft'.repeat(127)}hard`, positive: 'red' },
        seed: 101,
      },
      {
        iteration: 0,
        promptPairIndex: 2,
        prompts: { negative: `${'soft'.repeat(126)}hardsoft`, positive: 'red' },
        seed: 100,
      },
      {
        iteration: 1,
        promptPairIndex: 2,
        prompts: { negative: `${'soft'.repeat(126)}hardsoft`, positive: 'red' },
        seed: 101,
      },
    ],
  )
})

test('asymmetric positive/negative products select the pair prefix before iterations', () => {
  // Different radices expose a swapped-sign index even when symmetric 2×2 examples appear valid.
  const positiveThree = input({
    baseSeed: 0,
    maxJobs: 32,
    maxPrompts: 5,
    negativePrompt: '{soft|hard}',
    positivePrompt: '{red|green|blue}',
    seedBehavior: 'per-prompt',
  })
  const plan = planGenerationBatch(positiveThree)
  assert.equal(plan.truncated, true)
  assert.deepEqual(
    plan.items.map(({ prompts, seed }) => [prompts.positive, prompts.negative, seed]),
    [
      ['red', 'soft', 0],
      ['red', 'hard', 1],
      ['green', 'soft', 2],
      ['green', 'hard', 3],
      ['blue', 'soft', 4],
    ],
  )
  const complete = planGenerationBatch({ ...positiveThree, maxPrompts: 6 })
  assert.equal(complete.truncated, false)
  assert.deepEqual(complete.items.at(-1)?.prompts, { negative: 'hard', positive: 'blue' })

  const negativeFour = planGenerationBatch(
    input({
      iterations: 2,
      maxJobs: 32,
      maxPrompts: 5,
      negativePrompt: '{soft|hard|grain|blur}',
      positivePrompt: '{red|blue}',
    }),
  )
  assert.equal(negativeFour.truncated, true)
  assert.deepEqual(
    negativeFour.items.map(({ prompts, seed }) => [prompts.positive, prompts.negative, seed]),
    [
      ['red', 'soft', 100],
      ['red', 'soft', 101],
      ['red', 'hard', 100],
      ['red', 'hard', 101],
      ['red', 'grain', 100],
      ['red', 'grain', 101],
      ['red', 'blur', 100],
      ['red', 'blur', 101],
      ['blue', 'soft', 100],
      ['blue', 'soft', 101],
    ],
  )
})

test('negative cardinality31/32/33 preserves the cap32 radix with unsaturated neighbors', async (t) => {
  // Boundary: actual bounded count and pair selection at maxPrompts=maxJobs=32.
  // Mutation: subtract Number(negativeCount.truncated) from the negative radix. N33 then maps
  // row32 to blue/n00, while independently checked N31/N32 remain green.
  const alternatives = [
    'n00',
    'n01',
    'n02',
    'n03',
    'n04',
    'n05',
    'n06',
    'n07',
    'n08',
    'n09',
    'n10',
    'n11',
    'n12',
    'n13',
    'n14',
    'n15',
    'n16',
    'n17',
    'n18',
    'n19',
    'n20',
    'n21',
    'n22',
    'n23',
    'n24',
    'n25',
    'n26',
    'n27',
    'n28',
    'n29',
    'n30',
    'n31',
    'n32',
  ]
  const first31 = [
    ['red', 'n00', 0],
    ['red', 'n01', 1],
    ['red', 'n02', 2],
    ['red', 'n03', 3],
    ['red', 'n04', 4],
    ['red', 'n05', 5],
    ['red', 'n06', 6],
    ['red', 'n07', 7],
    ['red', 'n08', 8],
    ['red', 'n09', 9],
    ['red', 'n10', 10],
    ['red', 'n11', 11],
    ['red', 'n12', 12],
    ['red', 'n13', 13],
    ['red', 'n14', 14],
    ['red', 'n15', 15],
    ['red', 'n16', 16],
    ['red', 'n17', 17],
    ['red', 'n18', 18],
    ['red', 'n19', 19],
    ['red', 'n20', 20],
    ['red', 'n21', 21],
    ['red', 'n22', 22],
    ['red', 'n23', 23],
    ['red', 'n24', 24],
    ['red', 'n25', 25],
    ['red', 'n26', 26],
    ['red', 'n27', 27],
    ['red', 'n28', 28],
    ['red', 'n29', 29],
    ['red', 'n30', 30],
  ]
  for (const [negativeCount, last] of [
    [31, ['blue', 'n00', 31]],
    [32, ['red', 'n31', 31]],
    [33, ['red', 'n31', 31]],
  ] as const) {
    await t.test(`negative${negativeCount}: literal row32`, () => {
      const plan = planGenerationBatch(
        input({
          baseSeed: 0,
          iterations: 1,
          maxJobs: 32,
          maxPrompts: 32,
          negativePrompt: `{${alternatives.slice(0, negativeCount).join('|')}}`,
          positivePrompt: '{red|blue}',
          seedBehavior: 'per-prompt',
        }),
      )
      assert.equal(plan.items.length, 32)
      assert.equal(plan.truncated, true)
      assert.deepEqual(
        plan.items.map(({ prompts, seed }) => [prompts.positive, prompts.negative, seed]),
        [...first31, last],
      )
      assert.equal(plan.items[31].promptPairIndex, 31)
      assert.equal(plan.items[31].iteration, 0)
    })
  }
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
