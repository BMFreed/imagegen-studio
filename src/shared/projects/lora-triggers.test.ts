import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  groupLoraTriggers,
  loraCompletionFragment,
  type LoraTriggerSource,
  matchLoraTriggers,
  suggestLoraTriggers,
} from './lora-triggers.js'

const sources: LoraTriggerSource[] = [
  {
    id: 'one',
    name: 'Painter',
    phrases: ['digital art', 'art', 'digital_art', ' ', 'свет', 'a+b'],
  },
  { id: 'two', name: 'Other', phrases: ['DIGITAL_ART', 'soft lighting'] },
]

// Boundary: shared production rules. Controls distinguish alias/case equivalence from a substring.
// Mutations: remove word boundaries, longest-first selection or normalized source aggregation.
test('LoRA context aggregates equivalent sources and matches complete Unicode words literally', () => {
  const text = 'DIGITAL_art, artwork, светлый, СВЕТ, a+b, aaab, soft   lighting'
  const matches = matchLoraTriggers(text, sources)
  assert.deepEqual(
    matches.map((match) => text.slice(match.from, match.to)),
    ['DIGITAL_art', 'СВЕТ', 'a+b', 'soft   lighting'],
  )
  assert.deepEqual(
    matches[0].sources.map((source) => source.id),
    ['one', 'two'],
  )
  assert.equal(
    groupLoraTriggers(sources).filter((group) => group.phrase === 'digital art').length,
    1,
  )
  assert.equal(matchLoraTriggers('nothing matching', sources).length, 0)
  assert.equal(matchLoraTriggers('digital art', []).length, 0)
})

test('the longest overlapping phrase wins even when a shorter phrase starts earlier', () => {
  const [match] = matchLoraTriggers('soft rim lighting', [
    { id: 'x', name: 'X', phrases: ['soft rim', 'rim lighting'] },
  ])
  assert.equal(match?.phrase, 'rim lighting')
  assert.deepEqual([match?.from, match?.to], [5, 17])
})

test('suggestions rank exact then prefix then contains, aggregate names and cap the section at five', () => {
  const source = {
    id: 'x',
    name: 'Lighting',
    phrases: ['b art', 'artist', 'art', 'art 2', 'art 3', 'art 4', 'art 5'],
  }
  assert.deepEqual(
    suggestLoraTriggers('art', [source]).map((item) => item.phrase),
    ['art', 'artist', 'art 2', 'art 3', 'art 4'],
  )
  assert.equal(suggestLoraTriggers('DIGITAL_', sources)[0]?.sources.length, 2)
  assert.equal(suggestLoraTriggers('Painter', sources).length, 4)
  assert.equal(suggestLoraTriggers('absent', sources).length, 0)
  assert.equal(suggestLoraTriggers('', sources).length, 5)
})

test('completion replaces the matching multi-word suffix, preserving surrounding prompt text', () => {
  for (const prefix of ['portrait, soft li', 'portrait soft li', '(soft li', 'portrait, soft_li']) {
    const fragment = loraCompletionFragment(`${prefix}, remaining`, prefix.length, sources)
    assert.equal(fragment.text, prefix.endsWith('soft_li') ? 'soft_li' : 'soft li')
    assert.equal(prefix.slice(0, fragment.from), prefix.slice(0, prefix.indexOf('soft')))
  }
  assert.deepEqual(loraCompletionFragment('portrait, ', 10, sources), { from: 10, text: '' })
})
