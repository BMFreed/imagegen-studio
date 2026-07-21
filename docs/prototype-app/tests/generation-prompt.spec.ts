import { expect, test } from '@playwright/test'

import type {
  GenerationEmbeddingResourceRef,
  GenerationLora,
} from '../src/components/generation/generation.types'

import {
  adjustPromptAttention,
  createGenerationPrompt,
  findTopLevelPromptPhraseRange,
  getPromptEmbeddingMatches,
  getPromptLoraTriggerMatches,
  promptHasAmbiguousEmbedding,
  reconcilePromptEmbeddingRefs,
  splitTopLevelPromptPhrases,
} from '../src/components/generation/generation-prompt.utils'

const embedding: GenerationEmbeddingResourceRef = {
  activationToken: '<detail>',
  id: 'detail',
  name: 'Detail',
}

test.describe('generation prompt utilities', () => {
  test('splits top-level comma and newline delimiters while respecting nesting and escapes', () => {
    const text =
      'first, (inside, round), [inside, square], {red,blue|green}, escaped\\, comma\nlast'
    expect(
      splitTopLevelPromptPhrases(text).map((range) => text.slice(range.from, range.to)),
    ).toEqual([
      'first',
      '(inside, round)',
      '[inside, square]',
      '{red,blue|green}',
      String.raw`escaped\, comma`,
      'last',
    ])
  })

  test('finds semantic phrase ranges at the start, middle, and end', () => {
    const text = '  first  , middle phrase, final  '
    expect(findTopLevelPromptPhraseRange(text, 2)).toEqual({ from: 2, to: 7 })
    expect(findTopLevelPromptPhraseRange(text, 15)).toEqual({ from: 11, to: 24 })
    expect(findTopLevelPromptPhraseRange(text, text.length)).toEqual({ from: 26, to: 31 })
  })

  test('adjusts a selection or caret phrase and returns to neutral without growing brackets', () => {
    const selected = adjustPromptAttention('first phrase, second', { anchor: 0, head: 12 }, 1)
    expect(selected.text).toBe('(first phrase)+, second')
    expect(selected.selection).toEqual({ anchor: 0, head: 15 })

    const neutral = adjustPromptAttention(selected.text, selected.selection, -1)
    expect(neutral.text).toBe('first phrase, second')
    const increasedAgain = adjustPromptAttention(neutral.text, neutral.selection, 1)
    expect(increasedAgain.text).toBe('(first phrase)+, second')

    const caret = adjustPromptAttention('first, second phrase', { anchor: 15, head: 15 }, -1)
    expect(caret.text).toBe('first, (second phrase)-')
  })

  test('auto-resolves unique embeddings and removes refs with deleted text', () => {
    const resolved = reconcilePromptEmbeddingRefs(createGenerationPrompt('a <detail> portrait'), [
      embedding,
    ])
    expect(resolved.embeddingRefs).toEqual([{ resource: embedding, token: '<detail>' }])
    expect(
      reconcilePromptEmbeddingRefs({ ...resolved, text: 'a portrait' }, [embedding]).embeddingRefs,
    ).toEqual([])
  })

  test('reports ambiguity but lets a stored ref resolve the same activation token', () => {
    const other = { ...embedding, id: 'detail-other', name: 'Other Detail' }
    const resources = [embedding, other]
    const unresolved = createGenerationPrompt('<detail>')
    expect(promptHasAmbiguousEmbedding(unresolved, resources)).toBe(true)

    const resolved = createGenerationPrompt('<detail>', [{ resource: other, token: '<detail>' }])
    expect(promptHasAmbiguousEmbedding(resolved, resources)).toBe(false)
    expect(getPromptEmbeddingMatches(resolved, resources)[0]?.ref?.resource.id).toBe('detail-other')
  })

  test('preserves recalled missing refs while their literal token remains', () => {
    const missing = { ...embedding, missing: true }
    const prompt = createGenerationPrompt('<detail>', [{ resource: missing, token: '<detail>' }])
    expect(reconcilePromptEmbeddingRefs(prompt, []).embeddingRefs[0]?.resource.missing).toBe(true)
  })

  test('matches LoRA phrases longest-first and aggregates sources', () => {
    const loras: GenerationLora[] = [
      {
        enabled: true,
        resource: { id: 'one', name: 'One', triggerPhrases: ['digital art', 'art'] },
        weight: 1,
      },
      {
        enabled: true,
        resource: { id: 'two', name: 'Two', triggerPhrases: ['digital_art'] },
        weight: 0.8,
      },
      {
        enabled: false,
        resource: { id: 'off', name: 'Off', triggerPhrases: ['portrait'] },
        weight: 1,
      },
    ]
    const matches = getPromptLoraTriggerMatches('digital art portrait artwork', loras)
    expect(matches).toHaveLength(1)
    expect(matches[0]?.phrase).toBe('digital art')
    expect(matches[0]?.loras.map((lora) => lora.resource.id)).toEqual(['one', 'two'])
  })
})
