import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  adjustPromptAttention,
  findTopLevelPromptPhraseRange,
  splitTopLevelPromptPhrases,
} from './prompt-text.js'

// Real shared rules, not a test-owned editor model. Neighbor controls vary selection/delimiters.
test('phrase ranges preserve nesting, escapes, surrounding whitespace and caret ownership', () => {
  const text = ' alpha  , (beta, gamma), [delta, epsilon], {red|blue}, escaped\\, comma\nlast '
  assert.deepEqual(
    splitTopLevelPromptPhrases(text).map((range) => text.slice(range.from, range.to)),
    [
      'alpha',
      '(beta, gamma)',
      '[delta, epsilon]',
      '{red|blue}',
      String.raw`escaped\, comma`,
      'last',
    ],
  )
  assert.deepEqual(
    findTopLevelPromptPhraseRange(text, 7),
    { from: 1, to: 6 },
    'trailing whitespace belongs to alpha, not the next phrase',
  )
  assert.deepEqual(findTopLevelPromptPhraseRange('first,   , last', 8), { from: 9, to: 9 })
  assert.deepEqual(findTopLevelPromptPhraseRange(text, text.length), {
    from: text.length - 5,
    to: text.length - 1,
  })
})

test('attention changes only the selection, preserves direction and returns through neutral', () => {
  const before = 'left, two words, right'
  const selected = adjustPromptAttention(before, { anchor: 15, head: 6 }, 1)
  assert.equal(selected.text, 'left, (two words)+, right')
  assert.deepEqual(selected.selection, { anchor: 18, head: 6 })
  const neutral = adjustPromptAttention(selected.text, selected.selection, -1)
  assert.deepEqual(neutral, { selection: { anchor: 15, head: 6 }, text: before })
  assert.equal(adjustPromptAttention('word--', { anchor: 0, head: 6 }, 1).text, 'word-')
  assert.equal(adjustPromptAttention('(word)1.1', { anchor: 0, head: 9 }, -1).text, 'word')
  assert.equal(adjustPromptAttention('(word)0.8', { anchor: 0, head: 9 }, -1).text, '(word)0.7')
})

test('caret attention does not migrate across whitespace to a neighboring phrase', () => {
  assert.equal(
    adjustPromptAttention('first  , second', { anchor: 6, head: 6 }, 1).text,
    'first+  , second',
  )
  assert.equal(
    adjustPromptAttention('first,  , second', { anchor: 7, head: 7 }, 1).text,
    'first,  , second',
  )
  assert.equal(adjustPromptAttention('   ', { anchor: 0, head: 3 }, -1).text, '   ')
})

test('nested multiword attention groups do not acquire extra wrappers on repeated adjustments', () => {
  const text = '(soft (rim light))'
  const increased = adjustPromptAttention(text, { anchor: 0, head: text.length }, 1)
  assert.equal(increased.text, '(soft (rim light))+')
  const neutral = adjustPromptAttention(increased.text, increased.selection, -1)
  assert.equal(neutral.text, 'soft (rim light)')
  assert.equal(adjustPromptAttention(neutral.text, neutral.selection, 1).text, increased.text)
})
