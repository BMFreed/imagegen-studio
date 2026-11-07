import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileAnimaPromptWeighting } from './anima-prompt-weighting.js'
import { planGenerationBatch } from './generation-batch-plan.js'
import { inspectPromptSyntax } from './prompt-diagnostics.js'
import { adjustPromptAttention } from './prompt-text.js'

// Actual authoring helper -> actual compiler/planner. No test-owned attention interpretation.
// Neighbors change family/operator/escape/range. Mutants drop family, implicit level, inner markup,
// literal escapes, decimal precision or refusal; compiler observables distinguish these changes.
function change(source: string, direction: -1 | 1) {
  return adjustPromptAttention(source, { anchor: 0, head: source.length }, direction, 'anima')
}

function weights(source: string) {
  return compileAnimaPromptWeighting(source).spans.flatMap((span) =>
    Array.from({ length: span.end - span.start }, () => span.weight),
  )
}

test('Anima implicit groups start at one positive level and opposite edits restore conditioning', () => {
  for (const source of ['(word)', '(two words)', '((word:2))', '(soft (rim light))']) {
    for (const direction of [-1, 1] as const) {
      const next = change(source, direction)
      assert.equal(next.advisory, undefined)
      assert.equal(
        compileAnimaPromptWeighting(next.text).cleanedText,
        compileAnimaPromptWeighting(source).cleanedText,
      )
      const before = weights(source)
      const after = weights(next.text)
      assert.ok(
        after.every((weight, index) =>
          direction > 0 ? weight > before[index] : weight < before[index],
        ),
      )
      const restored = adjustPromptAttention(
        next.text,
        next.selection,
        direction > 0 ? -1 : 1,
        'anima',
      )
      assert.deepEqual(
        compileAnimaPromptWeighting(restored.text),
        compileAnimaPromptWeighting(source),
      )
    }
  }
  assert.deepEqual(weights(change('(word)', 1).text), Array.from({ length: 4 }).fill(1.1 ** 2))
  assert.deepEqual(
    weights(change('((word:2))', 1).text),
    Array.from({ length: 4 }).fill(2 * 1.1 ** 2),
  )
})

test('explicit and saved numeric forms step by 0.1 without rounding away authored precision', () => {
  for (const [source, scalar] of [
    ['(word:2)', 2],
    ['(word)2.05', 2.05],
    ['(word).5', 0.5],
    ['(word)+0.5', 0.5],
    ['(word:-2)', -2],
    ['(word:0)', 0],
    ['(word:1e2)', 100],
    ['(word:0.2)', 0.2],
  ] as const) {
    for (const direction of [-1, 1] as const) {
      const next = change(source, direction)
      const expected = Number((scalar + direction * 0.1).toFixed(8))
      assert.deepEqual(weights(next.text), Array.from({ length: 4 }).fill(expected), source)
      const restored = adjustPromptAttention(
        next.text,
        next.selection,
        direction > 0 ? -1 : 1,
        'anima',
      )
      assert.deepEqual(
        compileAnimaPromptWeighting(restored.text),
        compileAnimaPromptWeighting(source),
        source,
      )
    }
  }
  const nested = change('((word:3):2)', 1)
  assert.deepEqual(weights(nested.text), Array.from({ length: 4 }).fill(3 * 2.1))
})

test('markers and compound targets preserve inner weights rather than stealing the last word suffix', () => {
  assert.deepEqual(weights(change('word++', 1).text), Array.from({ length: 4 }).fill(1.1 ** 3))
  assert.deepEqual(weights(change('word--', 1).text), Array.from({ length: 4 }).fill(0.9))
  for (const source of ['two words+', 'red (hair:2)', '(red)(hair:2)']) {
    const next = change(source, 1)
    assert.equal(
      compileAnimaPromptWeighting(next.text).cleanedText,
      compileAnimaPromptWeighting(source).cleanedText,
    )
    assert.deepEqual(
      weights(next.text),
      weights(source).map((weight, index) =>
        source === '(red)(hair:2)' && index === 3 ? 1 : weight * 1.1,
      ),
    )
    const restored = adjustPromptAttention(next.text, next.selection, -1, 'anima')
    assert.deepEqual(
      compileAnimaPromptWeighting(restored.text),
      compileAnimaPromptWeighting(source),
    )
  }
  // Wrapping a compound comma target gives the comma its own Invoke fragment.
  // Its newly synthesized boundary is neutral, unlike the authored whitespace.
  const comma = change('word, (hair:2)', 1)
  assert.equal(compileAnimaPromptWeighting(comma.text).cleanedText, 'word , hair')
  assert.deepEqual(weights(comma.text), [1.1, 1.1, 1.1, 1.1, 1, 1.1, 1.1, 2.2, 2.2, 2.2, 2.2])
  const restoredComma = adjustPromptAttention(comma.text, comma.selection, -1, 'anima')
  assert.deepEqual(
    compileAnimaPromptWeighting(restoredComma.text),
    compileAnimaPromptWeighting('word, (hair:2)'),
  )
})

test('nested saved numeric suffix hands the parent colon to its own group without changing old top-level refusal', () => {
  for (const source of [
    '((word).5)',
    '((word)+0.5)',
    '((word)2.05)',
    '((word).5:2)',
    '((word)+0.5:-2)',
  ]) {
    for (const direction of [-1, 1] as const) {
      const next = change(source, direction)
      assert.equal(next.advisory, undefined)
      assert.equal(compileAnimaPromptWeighting(next.text).cleanedText, 'word')
      const restored = adjustPromptAttention(
        next.text,
        next.selection,
        direction > 0 ? -1 : 1,
        'anima',
      )
      assert.deepEqual(
        compileAnimaPromptWeighting(restored.text),
        compileAnimaPromptWeighting(source),
      )
    }
  }
  assert.deepEqual(weights('((word).5:2)'), Array.from({ length: 4 }).fill(1))
  assert.deepEqual(weights('((word)+0.5:-2)'), Array.from({ length: 4 }).fill(-1))
  assert.throws(() => compileAnimaPromptWeighting('(word).5:foo'))
  assert.throws(() => compileAnimaPromptWeighting('(word)+0.5:1'))
})

test('literal markers, colons, URLs and Unicode survive both attention directions', () => {
  for (const source of [
    String.raw`word\+`,
    String.raw`word\-`,
    String.raw`\(literal\)`,
    String.raw`escaped\, comma`,
    'time: noon',
    'https://example.org noon',
    '👩🏽‍🎨 artist',
    String.raw`even\\+`,
    String.raw`odd\\\+`,
    '+',
    '-',
    '++',
    '---',
  ]) {
    for (const direction of [-1, 1] as const) {
      const next = change(source, direction)
      assert.equal(
        compileAnimaPromptWeighting(next.text).cleanedText,
        compileAnimaPromptWeighting(source).cleanedText,
        source,
      )
      const restored = adjustPromptAttention(
        next.text,
        next.selection,
        direction > 0 ? -1 : 1,
        'anima',
      )
      assert.deepEqual(
        compileAnimaPromptWeighting(restored.text),
        compileAnimaPromptWeighting(source),
        source,
      )
    }
  }
  for (const source of [
    'word\\',
    'word\\\\',
    'word\\\\\\',
    'two words\\',
    String.raw`word\q`,
    String.raw`two \q words`,
  ]) {
    for (const direction of [-1, 1] as const) {
      const next = change(source, direction)
      assert.equal(
        compileAnimaPromptWeighting(next.text).cleanedText,
        compileAnimaPromptWeighting(source).cleanedText,
        source,
      )
      const restored = adjustPromptAttention(
        next.text,
        next.selection,
        direction > 0 ? -1 : 1,
        'anima',
      )
      assert.deepEqual(
        compileAnimaPromptWeighting(restored.text),
        compileAnimaPromptWeighting(source),
        source,
      )
    }
  }
})

test('dynamic authored groups remain authored and real concrete expansions keep weighting semantics', () => {
  const expand = (positivePrompt: string) =>
    planGenerationBatch({
      baseSeed: 0,
      iterations: 1,
      maxJobs: 32,
      maxPrompts: 32,
      negativePrompt: '',
      positivePrompt,
      seedBehavior: 'per-prompt',
    }).items.map((item) => compileAnimaPromptWeighting(item.prompts.positive))
  for (const source of [
    '{red|blue}',
    '({red|blue})',
    '({red|blue}:2)',
    '{red: noon|blue: night}',
    '{(red:2)|blue} light',
  ]) {
    for (const direction of [-1, 1] as const) {
      const next = change(source, direction)
      assert.ok(next.text.includes('{'))
      assert.ok(next.text.includes('|'))
      assert.deepEqual(
        expand(next.text).map((compiled) => compiled.cleanedText),
        expand(source).map((compiled) => compiled.cleanedText),
      )
      const restored = adjustPromptAttention(
        next.text,
        next.selection,
        direction > 0 ? -1 : 1,
        'anima',
      )
      assert.deepEqual(expand(restored.text), expand(source))
    }
  }
})

test('reversed selections, valid partial text and caret ownership preserve untouched neighbors', () => {
  const source = 'left, (word:2), right'
  const selected = adjustPromptAttention(source, { anchor: 14, head: 6 }, 1, 'anima')
  assert.equal(selected.text, 'left, (word:2.1), right')
  assert.deepEqual(selected.selection, { anchor: 16, head: 6 })
  const inside = adjustPromptAttention('(word:2)', { anchor: 1, head: 5 }, 1, 'anima')
  assert.deepEqual(weights(inside.text), Array.from({ length: 4 }).fill(2 * 1.1))
  const letters = adjustPromptAttention('word', { anchor: 0, head: 2 }, 1, 'anima')
  assert.equal(compileAnimaPromptWeighting(letters.text).cleanedText, 'wo rd')
  assert.deepEqual(weights(letters.text), [1.1, 1.1, 1, 1, 1])
  const restored = adjustPromptAttention(letters.text, letters.selection, -1, 'anima')
  assert.equal(restored.text, 'word')
  assert.equal(
    adjustPromptAttention('first  , second', { anchor: 6, head: 6 }, 1, 'anima').text,
    'first+  , second',
  )
  assert.equal(
    adjustPromptAttention('first,  , second', { anchor: 7, head: 7 }, 1, 'anima').text,
    'first,  , second',
  )
})

test('malformed operators and grammar-cutting selections refuse with a family-aware advisory', () => {
  for (const source of [
    '(word:2)+',
    'word+-',
    '(word:abc)',
    '(word',
    '(word)1e2',
    '[word',
    '({word)}',
  ]) {
    const result = change(source, 1)
    assert.equal(result.text, source)
    assert.ok(result.advisory?.message)
    assert.ok(inspectPromptSyntax(source, 'anima').items.length)
  }
  for (const [source, from, to] of [
    [String.raw`word\+`, 4, 5],
    ['(word:2)', 1, 7],
    ['😀 artist', 1, 2],
    ['word+', 4, 5],
    ['word++', 2, 6],
  ] as const) {
    const result = adjustPromptAttention(source, { anchor: from, head: to }, 1, 'anima')
    assert.equal(result.text, source)
    assert.match(result.advisory?.message ?? '', /selection cuts/)
  }
  assert.deepEqual(inspectPromptSyntax('(word:2)+', 'illustrious').items, [])
  assert.deepEqual(inspectPromptSyntax('word+-', null).items, [])
})

test('numeric work handles pathological exponents and million-character finite spellings without generation gating', () => {
  assert.deepEqual(
    weights(change('(word:0e999999999)', 1).text),
    Array.from({ length: 4 }).fill(0.1),
  )
  for (const source of ['(word:1e-999999999)', '(word:1e999999999)', '(word:1e308)']) {
    const result = change(source, 1)
    assert.equal(result.text, source)
    assert.ok(result.advisory)
  }
  for (const raw of [`${'0'.repeat(1_000_000)}2.05`, `2.05${'0'.repeat(1_000_000)}`]) {
    const result = change(`(word:${raw})`, 1)
    assert.deepEqual(weights(result.text), Array.from({ length: 4 }).fill(2.15))
  }
  const long = 'word '.repeat(20_000).trim()
  const result = change(long, 1)
  assert.equal(result.advisory, undefined)
  assert.ok(result.text.includes(long))
})

test('Illustrious, null and unknown families keep existing exact authoring behavior', () => {
  for (const family of ['illustrious', 'unknown', null]) {
    assert.equal(
      adjustPromptAttention('(word:2)', { anchor: 0, head: 8 }, 1, family).text,
      '(word:2)+',
    )
    assert.equal(adjustPromptAttention('(word)', { anchor: 0, head: 6 }, 1, family).text, '(word)+')
  }
})
