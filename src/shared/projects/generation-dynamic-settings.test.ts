import assert from 'node:assert/strict'
import test from 'node:test'

import {
  GENERATION_DYNAMIC_PROMPT_DEFAULTS,
  GENERATION_DYNAMIC_PROMPT_MAX_PROMPTS,
  getEffectiveDynamicPromptSettings,
  isGenerationDynamicPromptSettings,
} from './generation-dynamic-settings.js'

test('effective dynamic settings return owned values without mutating absent or explicit input', () => {
  assert.equal(GENERATION_DYNAMIC_PROMPT_MAX_PROMPTS, 100)
  assert.ok(Object.isFrozen(GENERATION_DYNAMIC_PROMPT_DEFAULTS))
  const defaults = getEffectiveDynamicPromptSettings()
  assert.deepEqual(defaults, { maxPrompts: 100, seedBehavior: 'per-iteration' })
  defaults.maxPrompts = 1
  assert.deepEqual(getEffectiveDynamicPromptSettings(), {
    maxPrompts: 100,
    seedBehavior: 'per-iteration',
  })
  const explicit = { maxPrompts: 32, seedBehavior: 'per-prompt' as const }
  const effective = getEffectiveDynamicPromptSettings(explicit)
  effective.maxPrompts = 100
  assert.deepEqual(explicit, { maxPrompts: 32, seedBehavior: 'per-prompt' })
})

test('dynamic settings guard accepts the authored envelope independently of the job cap', () => {
  for (const maxPrompts of [1, 32, GENERATION_DYNAMIC_PROMPT_MAX_PROMPTS]) {
    for (const seedBehavior of ['per-iteration', 'per-prompt']) {
      assert.equal(isGenerationDynamicPromptSettings({ maxPrompts, seedBehavior }), true)
    }
  }
  for (const input of [
    undefined,
    null,
    [],
    {},
    { maxPrompts: 1 },
    { maxPrompts: 0, seedBehavior: 'per-iteration' },
    { maxPrompts: GENERATION_DYNAMIC_PROMPT_MAX_PROMPTS + 1, seedBehavior: 'per-iteration' },
    { maxPrompts: 1.5, seedBehavior: 'per-iteration' },
    { maxPrompts: NaN, seedBehavior: 'per-iteration' },
    { maxPrompts: Infinity, seedBehavior: 'per-iteration' },
    { maxPrompts: '1', seedBehavior: 'per-iteration' },
    { maxPrompts: 1, seedBehavior: 'unknown' },
    { iterations: 1, maxPrompts: 1, seedBehavior: 'per-prompt' },
  ]) {
    assert.equal(isGenerationDynamicPromptSettings(input), false)
  }
})
