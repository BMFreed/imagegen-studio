import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { animaDraftGenerationReason, animaEngineReason } from './anima-generation-control.js'

function draft() {
  const value = createEmptyProjectDocumentV1({ title: 'Native authoring advice' }).generationDraft
  value.sampling.animaMethod = 'euler'
  value.sampling.steps = 20
  value.sampling.cfgScale = 5
  return value
}

test('native renderer advice requires explicit engine qualification without inferring it from legacy fields', () => {
  assert.equal(animaEngineReason(true), null)
  assert.match(animaEngineReason(null)!, /Checking/)
  for (const supported of [false, undefined]) {
    assert.match(animaEngineReason(supported)!, /does not support Anima/)
  }
})

test('Anima draft advice retains neutral policies and inactive SD selection while refusing active SD controls', () => {
  const value = draft()
  value.sampling.sampler = 'DPM++ 2M'
  value.sampling.scheduler = 'Karras'
  value.positivePrompt.text = '(weighted)+'
  value.negativePrompt.text = '(blur:0.6)'
  assert.equal(animaDraftGenerationReason(value), null)
  assert.equal(animaDraftGenerationReason({ ...value, cfgRescale: 0, vaePrecision: 'Auto' }), null)
  for (const change of [{ cfgRescale: 0.7 }, { vaePrecision: 'FP32' as const }, { clipSkip: 1 }]) {
    assert.match(animaDraftGenerationReason({ ...value, ...change })!, /Anima does not support/)
  }
  assert.match(
    animaDraftGenerationReason({
      ...value,
      sampling: { ...value.sampling, animaMethod: undefined },
    })!,
    /Choose a native/,
  )
  assert.match(
    animaDraftGenerationReason({ ...value, sampling: { ...value.sampling, steps: null } })!,
    /Set Steps/,
  )
  assert.match(
    animaDraftGenerationReason({ ...value, sampling: { ...value.sampling, cfgScale: null } })!,
    /Set Steps/,
  )
})

test('Anima draft advice rejects retained embedding and external VAE selections rather than silently ignoring them', () => {
  const value = draft()
  const resource = {
    baseModelFamily: 'illustrious' as const,
    civitaiFileId: null,
    civitaiModelId: null,
    civitaiVersionId: null,
    displayName: 'Retained resource',
    fileSha256: 'a'.repeat(64),
    localModelId: '00000000-0000-4000-8000-000000000001',
    localVersionId: '00000000-0000-4000-8000-000000000002',
    predictionType: null,
    versionName: 'v1',
  }
  assert.match(
    animaDraftGenerationReason({ ...value, vae: { ...resource, kind: 'vae' } })!,
    /companion VAE/,
  )
  for (const sign of ['positivePrompt', 'negativePrompt'] as const) {
    assert.match(
      animaDraftGenerationReason({
        ...value,
        [sign]: {
          embeddingRefs: [{ resource: { ...resource, kind: 'embedding' }, token: 'activation' }],
          text: 'activation',
        },
      })!,
      /embeddings are not supported/,
    )
  }
})
