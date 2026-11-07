import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ANIMA_PROMPT_INTERPRETATION,
  AnimaPromptWeightingError,
  compileAnimaPromptWeighting,
  compileAnimaPromptWeightingForInterpretation,
} from './anima-prompt-weighting.js'
import { planGenerationBatch } from './generation-batch-plan.js'
import { adjustPromptAttention } from './prompt-text.js'

// Boundary: the actual typed compiler, plus real editor/batch callers where relevant.
// Invariant: cleaned text retains literal content and contiguous code-point weights.
// Neighbors vary one operator, escape, Unicode character or limit condition.
// Mutants: discard attention, reset inherited weight, add helper emphasis, use UTF-16 offsets.
function weightsFor(text: string): number[] {
  const compiled = compileAnimaPromptWeighting(text)
  const weights: number[] = []
  let previousEnd = 0
  for (const span of compiled.spans) {
    assert.equal(span.start, previousEnd)
    assert.ok(span.end > span.start)
    assert.ok(Number.isFinite(span.weight))
    weights.push(...Array.from({ length: span.end - span.start }, () => span.weight))
    previousEnd = span.end
  }
  assert.equal(previousEnd, Array.from(compiled.cleanedText).length)
  return weights
}

function refuses(text: unknown): void {
  assert.throws(
    () => compileAnimaPromptWeighting(text as string),
    (error) =>
      error instanceof AnimaPromptWeightingError &&
      error.code === 'GENERATION_PROMPT_UNSUPPORTED' &&
      error.message.length > 0,
  )
}

test('plain, neutral explicit and empty prompts preserve text and use canonical spans', () => {
  assert.deepEqual(compileAnimaPromptWeighting('long hair'), {
    cleanedText: 'long hair',
    spans: [{ end: 9, start: 0, weight: 1 }],
    version: 'anima-prompt-weighting-v1',
  })
  assert.deepEqual(
    compileAnimaPromptWeighting('(long hair:1)'),
    compileAnimaPromptWeighting('long hair'),
  )
  assert.deepEqual(compileAnimaPromptWeighting(''), {
    cleanedText: '',
    spans: [],
    version: 'anima-prompt-weighting-v1',
  })
  assert.equal(compileAnimaPromptWeighting('  long hair\n').cleanedText, '  long hair\n')
})

test('implicit, explicit and mixed nested groups multiply rather than reset ancestors', () => {
  for (const [source, weight] of [
    ['(long hair)', 1.1],
    ['(long hair:2)', 2],
    ['((long hair))', 1.1 ** 2],
    ['((long hair:2))', 2.2],
    ['((long hair):2)', 2.2],
    ['((long hair:3):2)', 6],
  ] as const) {
    assert.equal(compileAnimaPromptWeighting(source).cleanedText, 'long hair')
    assert.deepEqual(weightsFor(source), Array.from({ length: 9 }).fill(weight), source)
  }
  assert.deepEqual(compileAnimaPromptWeighting('a(b:2)c'), {
    cleanedText: 'a b c',
    spans: [
      { end: 2, start: 0, weight: 1 },
      { end: 3, start: 2, weight: 2 },
      { end: 5, start: 3, weight: 1 },
    ],
    version: 'anima-prompt-weighting-v1',
  })
})

test('Compel editor suffixes use measured bases and helper groups carry no implicit multiplier', () => {
  // Independently executed Compel 2.4.0 gave 1.1, .81, 1.1, .5 and 2.2 for these forms.
  for (const [source, cleaned, weight] of [
    ['word+', 'word', 1.1],
    ['word--', 'word', 0.9 ** 2],
    ['(two words)+', 'two words', 1.1],
    ['(word)1.1', 'word', 1.1],
    ['(word).5', 'word', 0.5],
    ['(word)+0.5', 'word', 0.5],
    ['((word)2)+', 'word', 2.2],
    ['(word)-', 'word', 0.9],
  ] as const) {
    assert.equal(compileAnimaPromptWeighting(source).cleanedText, cleaned)
    assert.deepEqual(
      weightsFor(source),
      Array.from({ length: Array.from(cleaned).length }).fill(weight),
    )
  }
})

test('actual editor increase/decrease output compiles and neutral round trips restore conditioning', () => {
  for (const source of ['word', 'two words', '👩🏽‍🎨 artist']) {
    const selection = { anchor: 0, head: source.length }
    for (const direction of [-1, 1] as const) {
      const adjusted = adjustPromptAttention(source, selection, direction)
      assert.equal(compileAnimaPromptWeighting(adjusted.text).cleanedText, source)
      assert.deepEqual(
        weightsFor(adjusted.text),
        Array.from({ length: Array.from(source).length }).fill(direction > 0 ? 1.1 : 0.9),
      )
      const restored = adjustPromptAttention(
        adjusted.text,
        adjusted.selection,
        direction > 0 ? -1 : 1,
      )
      assert.deepEqual(
        compileAnimaPromptWeighting(restored.text),
        compileAnimaPromptWeighting(source),
      )
    }
  }
  const saved = adjustPromptAttention('(word)1.1', { anchor: 0, head: 9 }, -1)
  assert.deepEqual(compileAnimaPromptWeighting(saved.text), compileAnimaPromptWeighting('word'))
})

test('zero and signed finite explicit weights remain meaningful with no invented model range', () => {
  assert.deepEqual(weightsFor('(x:0)'), [0])
  assert.deepEqual(weightsFor('(x:-10)'), [-10])
  assert.deepEqual(weightsFor('(x:1e100)'), [1e100])
})

test('signed explicit colon numbers support negative, fractional and finite exponential notation', () => {
  assert.deepEqual(weightsFor('(x:-2)'), [-2])
  assert.deepEqual(weightsFor('(x:+.5)'), [0.5])
  assert.deepEqual(weightsFor('(x:1e2)'), [100])
  assert.deepEqual(weightsFor('((x:0):2)'), [0])
  assert.deepEqual(weightsFor('(x)0'), [0])
  assert.deepEqual(weightsFor('(x:0e-999)'), [0])
  assert.deepEqual(weightsFor('(x:5e-324)'), [5e-324])
  refuses('(x:1e-999)')
  refuses('(x:-1e-999)')
})

test('escaped syntax and ordinary literal content survive without accidentally weighting', () => {
  assert.deepEqual(
    compileAnimaPromptWeighting(String.raw`\(literal\), word\+, \[x\], \{red\|blue\}, \<style\>`),
    {
      cleanedText: '(literal), word+, [x], {red|blue}, <style>',
      spans: [{ end: 42, start: 0, weight: 1 }],
      version: 'anima-prompt-weighting-v1',
    },
  )
  assert.equal(compileAnimaPromptWeighting(String.raw`C:\models, \\`).cleanedText, 'C:\\models, \\')
  assert.deepEqual(weightsFor('hello-world, C++17, 1+1'), Array.from({ length: 23 }).fill(1))
  assert.equal(compileAnimaPromptWeighting('"long hair"').cleanedText, '"long hair"')
  assert.equal(
    compileAnimaPromptWeighting('time: noon, https://example.org').cleanedText,
    'time: noon, https://example.org',
  )
  assert.equal(
    compileAnimaPromptWeighting('(https://example.org)').cleanedText,
    'https://example.org',
  )
})

test('code-point offsets retain emoji, combining marks and escape boundaries independently of UTF-16', () => {
  const source = '😀(é👩🏽‍🎨:2) z'
  assert.deepEqual(compileAnimaPromptWeighting(source), {
    cleanedText: '😀 é👩🏽‍🎨 z',
    spans: [
      { end: 2, start: 0, weight: 1 },
      { end: 8, start: 2, weight: 2 },
      { end: 10, start: 8, weight: 1 },
    ],
    version: 'anima-prompt-weighting-v1',
  })
  assert.deepEqual(weightsFor(source), [1, 1, 2, 2, 2, 2, 2, 2, 1, 1])
})

test('actual dynamic batch expansion feeds concrete prompts while unexpanded syntax refuses', () => {
  refuses('{red|blue} (hair:2)')
  const batch = planGenerationBatch({
    baseSeed: 0,
    iterations: 1,
    maxJobs: 4,
    maxPrompts: 4,
    negativePrompt: '(blur:0.5)',
    positivePrompt: '{red|blue} (hair:2)',
    seedBehavior: 'per-prompt',
  })
  assert.deepEqual(
    batch.items.map((item) => compileAnimaPromptWeighting(item.prompts.positive).cleanedText),
    ['red hair', 'blue hair'],
  )
  assert.deepEqual(weightsFor(batch.items[0].prompts.negative), Array.from({ length: 4 }).fill(0.5))
})

test('unsupported resources and conditioning operators refuse rather than reaching encoders as text', () => {
  for (const source of [
    '<lora:style:1>',
    '<embedding>',
    '[red:blue:0.5]',
    'word.swap(other)',
    '(a,b).blend(1,1)',
    '(a).and(b)',
    'useLora(style)',
    'withLora(style)',
    '(word).attend(2)',
    `word.swap${' '.repeat(200)}(other)`,
    `useLora${'\t'.repeat(200)}(style)`,
  ]) {
    refuses(source)
  }
  assert.equal(
    compileAnimaPromptWeighting(String.raw`word\.swap\(other\)`).cleanedText,
    'word.swap(other)',
  )
})

test('ambiguous and malformed attention fails clearly without partial interpretation', () => {
  for (const source of [
    '(x',
    'x)',
    '(x:)',
    '(x:no)',
    '(x:1:2)',
    '(x:Infinity)',
    '(x:NaN)',
    '(x:1e999)',
    '(x)-0.5',
    '(x)1e2',
    '(x)1.2tail',
    '(x:2)+',
    'word+-',
    'word-+',
    '(:2)',
  ]) {
    refuses(source)
  }
})

test('UTF-8 byte limit and valid surrogate pairs preserve the existing concrete prompt envelope', () => {
  assert.equal(compileAnimaPromptWeighting('a'.repeat(16 * 1024)).cleanedText.length, 16 * 1024)
  refuses('a'.repeat(16 * 1024 + 1))
  assert.equal(Array.from(compileAnimaPromptWeighting('😀'.repeat(4096)).cleanedText).length, 4096)
  refuses('😀'.repeat(4097))
  refuses('\uD800')
  refuses('\uDC00')
  refuses('x\uD800a')
  refuses(null)
})

test('bounded nesting and non-finite or underflowed compound weights refuse before conditioning', () => {
  const allowed = `${'('.repeat(128)}x${')'.repeat(128)}`
  assert.equal(compileAnimaPromptWeighting(allowed).cleanedText, 'x')
  refuses(`${'('.repeat(129)}x${')'.repeat(129)}`)
  refuses('((x:1e308):2)')
  refuses('((x:1e-308):1e-308)')
  refuses(`x${'+'.repeat(10_000)}`)
  refuses(`x${'-'.repeat(10_000)}`)
})

test('compiled DTO cannot be mutated and adjacent neutral spans are coalesced', () => {
  const compiled = compileAnimaPromptWeighting('a(b:1)c')
  assert.deepEqual(compiled.spans, [{ end: 5, start: 0, weight: 1 }])
  assert.ok(Object.isFrozen(compiled))
  assert.ok(Object.isFrozen(compiled.spans))
  assert.ok(Object.isFrozen(compiled.spans[0]))
  assert.equal(Reflect.set(compiled.spans[0], 'weight', 7), false)
})

// Exact leaf ownership/joining from Invoke a61ac4fb prompt_weighting.py:315-352.
// Spaces synthesized after inherited weighting are neutral; authored spaces are not.
for (const [source, cleaned, weights] of [
  ['(red)2,blue', 'red , blue', [2, 2, 2, 1, 1, 1, 1, 1, 1, 1]],
  ['red,blue+', 'red, blue', [1, 1, 1, 1, 1, 1.1, 1.1, 1.1, 1.1]],
  ['red,blue', 'red,blue', Array.from({ length: 8 }).fill(1)],
  ['(red)1,blue', 'red , blue', Array.from({ length: 10 }).fill(1)],
  ['red+(blue)2', 'red blue', [1.1, 1.1, 1.1, 1, 2, 2, 2, 2]],
  ['(red)2(blue)3', 'red blue', [2, 2, 2, 1, 3, 3, 3, 3]],
  ['((red)2(blue)3)4', 'red blue', [8, 8, 8, 1, 12, 12, 12, 12]],
  ['(a,b)2', 'a , b', [2, 1, 2, 1, 2]],
  ['(red)2 \tblue', 'red \tblue', [2, 2, 2, 1, 1, 1, 1, 1, 1]],
  ['(red, blue)2', 'red , blue', [2, 2, 2, 1, 2, 2, 2, 2, 2, 2]],
  ['(😀)2,猫', '😀 , 猫', [2, 1, 1, 1, 1]],
] as const) {
  test(`Invoke fragment joining preserves exact text and code-point weights: ${source}`, () => {
    assert.equal(compileAnimaPromptWeighting(source).cleanedText, cleaned)
    assert.deepEqual(weightsFor(source), weights)
  })
}

test('the fixed scarf scene inserts neutral comma boundaries without changing authored weights', () => {
  for (const [source, cleaned, weightedLength, weight] of [
    ['(blur)0.75, noise', 'blur , noise', 4, 0.75],
    ['(red scarf)1.5, one white cat', 'red scarf , one white cat', 9, 1.5],
    ['(blue scarf)0.75, one white cat', 'blue scarf , one white cat', 10, 0.75],
  ] as const) {
    const compiled = compileAnimaPromptWeighting(source)
    assert.equal(compiled.cleanedText, cleaned)
    assert.deepEqual(compiled.spans, [
      { end: weightedLength, start: 0, weight },
      { end: Array.from(cleaned).length, start: weightedLength, weight: 1 },
    ])
  }
  assert.equal(
    compileAnimaPromptWeighting('(two white cats)1.25 on one bench').cleanedText,
    'two white cats on one bench',
  )
})

test('unmarked frozen interpretations retain literal legacy spans rather than the new default', () => {
  for (const [source, cleaned, spans] of [
    ['(a,b)2', 'a,b', [{ end: 3, start: 0, weight: 2 }]],
    [
      'a(b:2)c',
      'abc',
      [
        { end: 1, start: 0, weight: 1 },
        { end: 2, start: 1, weight: 2 },
        { end: 3, start: 2, weight: 1 },
      ],
    ],
    [
      '(blur)0.75, noise',
      'blur, noise',
      [
        { end: 4, start: 0, weight: 0.75 },
        { end: 11, start: 4, weight: 1 },
      ],
    ],
    [
      '(😀)2,猫',
      '😀,猫',
      [
        { end: 1, start: 0, weight: 2 },
        { end: 3, start: 1, weight: 1 },
      ],
    ],
  ] as const) {
    assert.deepEqual(compileAnimaPromptWeightingForInterpretation(source), {
      cleanedText: cleaned,
      spans,
      version: 'anima-prompt-weighting-v1',
    })
    assert.deepEqual(
      compileAnimaPromptWeightingForInterpretation(source, ANIMA_PROMPT_INTERPRETATION),
      compileAnimaPromptWeighting(source),
    )
  }
  assert.throws(
    () =>
      compileAnimaPromptWeightingForInterpretation(
        'cat',
        'future' as typeof ANIMA_PROMPT_INTERPRETATION,
      ),
    AnimaPromptWeightingError,
  )
})
