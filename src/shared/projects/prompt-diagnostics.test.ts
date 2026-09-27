import assert from 'node:assert/strict'
import { test } from 'node:test'

import { inspectPromptSyntax, MAX_PROMPT_DIAGNOSTICS } from './prompt-diagnostics.js'

test('syntax hints accept nested, escaped, dynamic and finite weight forms without rewriting text', () => {
  for (const text of [
    '',
    'portrait, {red|blue}, [soft light], (detailed (eyes))++',
    String.raw`literal \( \] \{ and escaped \:`,
    '(tag:1.2), (tag:-.5), (tag:0), (tag:1e2), (tag)0.7, (tag)++',
    '(https://example.com), [a:b:0.5], (a:b:c), <bad-hands>',
    '(see https://example.com), (soft light). More text.',
    'Привет 🌱, (свет:1.2)',
  ]) {
    assert.deepEqual(inspectPromptSyntax(text), { items: [], truncated: false }, text)
  }
})

test('structure diagnostics identify actual offending ranges, including crossed and escaped brackets', () => {
  const text = '🌱 (light, [detail]}'
  const result = inspectPromptSyntax(text)
  assert.deepEqual(
    result.items.map(({ code, from, severity, to }) => ({ code, from, severity, to })),
    [
      { code: 'unclosed-bracket', from: 3, severity: 'error', to: 4 },
      { code: 'mismatched-close', from: 19, severity: 'error', to: 20 },
    ],
  )
  assert.equal(result.items[1]?.message, 'Unexpected "}"; expected ")".')
  assert.equal(inspectPromptSyntax(')').items[0]?.code, 'unexpected-close')
  assert.deepEqual(
    inspectPromptSyntax('([)]').items.map((item) => item.code),
    ['unclosed-bracket', 'mismatched-close'],
  )
  assert.equal(inspectPromptSyntax(String.raw`\(`).items.length, 0)
  assert.equal(inspectPromptSyntax(String.raw`\\(`).items[0]?.code, 'unclosed-bracket')
})

test('weight diagnostics distinguish suspicious numbers from valid neighboring syntax', () => {
  for (const text of ['(tag:abc)', '(tag:)', '(tag:NaN)', '(tag:1e999)', '(tag)1..2']) {
    const { items } = inspectPromptSyntax(text)
    assert.equal(items.length, 1, text)
    const item = items[0]
    assert.equal(item.code, 'invalid-weight')
    assert.equal(item.severity, 'warning')
    assert.ok(item.from >= 0 && item.to > item.from && item.to <= text.length)
  }
  assert.deepEqual(inspectPromptSyntax('(tag:1.25)').items, [])
  assert.deepEqual(inspectPromptSyntax('(tag)1.25').items, [])
  assert.deepEqual(inspectPromptSyntax(String.raw`(literal\:text)`).items, [])
  assert.match(inspectPromptSyntax('(tag:<img src=x>)').items[0].message, /<img src=x>/)
})

test('diagnostic rendering work is bounded and truncation is explicit without inventing valid-text errors', () => {
  const atLimit = inspectPromptSyntax(')'.repeat(MAX_PROMPT_DIAGNOSTICS))
  assert.equal(atLimit.items.length, MAX_PROMPT_DIAGNOSTICS)
  assert.equal(atLimit.truncated, false)
  const over = inspectPromptSyntax('('.repeat(MAX_PROMPT_DIAGNOSTICS + 1))
  assert.equal(over.items.length, MAX_PROMPT_DIAGNOSTICS)
  assert.equal(over.truncated, true)
  assert.equal(inspectPromptSyntax('plain text '.repeat(10_000)).items.length, 0)
})
