import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import {
  isProjectEmbeddingIdentity,
  isProjectGenerationDraftChange,
  isPromptEmbeddingSelection,
} from '../api.js'
import { IGS_SAFETY_CEILINGS } from './project-schema.js'

test('prompt embedding IPC accepts IDs plus a bounded literal and refuses forged resource metadata', () => {
  const selection = { resourceId: randomUUID(), token: '<face>', versionId: randomUUID() }
  assert.equal(isPromptEmbeddingSelection(selection), true)
  for (const kind of ['positive-prompt', 'negative-prompt']) {
    assert.equal(isProjectGenerationDraftChange({ kind, text: '<face>' }), true)
    assert.equal(
      isProjectGenerationDraftChange({ embeddingSelection: selection, kind, text: '<face>' }),
      true,
    )
    for (const invalid of [
      { ...selection, managedPath: '/private/embedding.safetensors' },
      { ...selection, resource: { kind: 'embedding' } },
      { ...selection, resourceId: 'foreign-portable-id' },
      { ...selection, versionId: '' },
      { ...selection, token: '' },
      { ...selection, token: '   ' },
      { ...selection, token: 'é'.repeat(IGS_SAFETY_CEILINGS.titleBytes) },
      null,
      undefined,
      [],
    ]) {
      assert.equal(isPromptEmbeddingSelection(invalid), false)
      assert.equal(
        isProjectGenerationDraftChange({ embeddingSelection: invalid, kind, text: '<face>' }),
        false,
      )
    }
    assert.equal(
      isProjectGenerationDraftChange({
        embeddingRefs: [],
        embeddingSelection: selection,
        kind,
        text: '<face>',
      }),
      false,
    )
  }
})

test('embedding Link IPC addresses stored portable IDs, literal and polarity without accepting metadata', () => {
  const identity = {
    polarity: 'positive',
    resourceId: 'foreign model',
    token: 'face',
    versionId: 'v1',
  }
  assert.equal(isProjectEmbeddingIdentity(identity), true)
  assert.equal(isProjectEmbeddingIdentity({ ...identity, polarity: 'negative' }), true)
  for (const invalid of [
    { ...identity, polarity: 'both' },
    { ...identity, polarity: undefined },
    { ...identity, resourceId: '' },
    { ...identity, versionId: '  ' },
    { ...identity, token: '' },
    { ...identity, token: 'é'.repeat(IGS_SAFETY_CEILINGS.titleBytes) },
    { ...identity, fileSha256: 'a'.repeat(64) },
    { ...identity, resource: { kind: 'embedding' } },
    null,
    [],
  ]) {
    assert.equal(isProjectEmbeddingIdentity(invalid), false)
  }
})
