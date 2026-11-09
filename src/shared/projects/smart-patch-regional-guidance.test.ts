import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import type { IgsProjectDocumentV1, IgsSmartPatchLayerV1 } from './project-schema.js'

import { ANIMA_BATCH_READY } from '../../main/projects/test-fixtures/anima-batch.js'
import { literalSmartPatchPreparedInput } from '../../main/projects/test-fixtures/smart-patch-input-material.js'
import { generationQueueRetryReason } from '../../renderer/components/generation-queue-retry.js'
import { supportsInferenceAnimaSmartPatchRegional } from './inference-worker-capabilities.js'
import { getSmartPatchRegionalGenerationUnavailableReason as reason } from './smart-patch-regional-guidance.js'

function fixture() {
  const { context } = literalSmartPatchPreparedInput('anima').prepared
  const patch: IgsSmartPatchLayerV1 = {
    activeRasterSubLayerId: null,
    blendMode: 'normal',
    boundingBox: context.bbox,
    coherenceSettings: context.coherenceSettings,
    generationDraft: context.generationDraft,
    id: context.layerId,
    internalResolution: context.internalResolution,
    kind: 'smart-patch',
    locked: false,
    mask: context.mask,
    maskSettings: context.maskSettings,
    name: 'Selected Patch',
    opacity: 1,
    rasterSubLayers: [],
    visible: true,
  }
  const document: Pick<IgsProjectDocumentV1, 'regionalGuidance'> = {
    regionalGuidance: [
      {
        enabled: true,
        id: randomUUID(),
        locked: false,
        mask: { asset: null, id: randomUUID(), revision: 0 },
        name: 'Owned region',
        overlayOpacity: 0.5,
        prompts: {
          negative: { embeddingRefs: [], text: '{dormant|local}' },
          positive: { embeddingRefs: [], text: '(red scarf)1.5' },
          useGlobalNegativePrompt: true,
        },
      },
    ],
  }
  return { document, iterations: 1, patch, runtimeSupported: true }
}

test('Smart regional eligibility consumes selected Patch and effective signed prompts', () => {
  const input = fixture()
  assert.equal(reason(input), null)
  input.document.regionalGuidance![0].prompts!.useGlobalNegativePrompt = false
  assert.match(reason(input)!, /static/u)
  input.document.regionalGuidance![0].prompts!.negative!.text = 'local exclusion'
  assert.equal(reason(input), null)
  input.patch.generationDraft.negativePrompt.text = '{active|global}'
  assert.match(reason(input)!, /static/u)
})

test('disabled regions keep ordinary Smart eligibility independent of new capability', () => {
  const input = fixture()
  input.runtimeSupported = false
  assert.match(reason(input)!, /engine/u)
  input.document.regionalGuidance![0].enabled = false
  input.patch.generationDraft.model!.baseModelFamily = 'illustrious'
  assert.equal(reason(input), null)
})

for (const [name, change, expected] of [
  [
    'family',
    (x: ReturnType<typeof fixture>) => {
      x.patch.generationDraft.model!.baseModelFamily = 'illustrious'
    },
    /original Anima/u,
  ],
  [
    'batch',
    (x: ReturnType<typeof fixture>) => {
      x.iterations = 2
    },
    /one static/u,
  ],
  [
    'processing',
    (x: ReturnType<typeof fixture>) => {
      x.patch.internalResolution.width = 520
    },
    /dimensions/u,
  ],
  [
    'processing-padding',
    (x: ReturnType<typeof fixture>) => {
      x.patch.internalResolution.width = 65
    },
    /dimensions/u,
  ],
  [
    'world',
    (x: ReturnType<typeof fixture>) => {
      x.patch.boundingBox.height = 2049
    },
    /dimensions/u,
  ],
  [
    'method',
    (x: ReturnType<typeof fixture>) => {
      x.patch.generationDraft.sampling.animaMethod = 'lcm'
    },
    /Euler or Heun/u,
  ],
  [
    'vae',
    (x: ReturnType<typeof fixture>) => {
      x.patch.generationDraft.vaePrecision = 'FP32'
    },
    /Auto VAE/u,
  ],
  [
    'global-positive',
    (x: ReturnType<typeof fixture>) => {
      x.patch.generationDraft.positivePrompt.text = '{a|b}'
    },
    /static/u,
  ],
  [
    'rows',
    (x: ReturnType<typeof fixture>) => {
      x.document.regionalGuidance = Array.from({ length: 4 }, () =>
        structuredClone(x.document.regionalGuidance![0]),
      )
    },
    /three regions/u,
  ],
  [
    'text',
    (x: ReturnType<typeof fixture>) => {
      x.patch.generationDraft.positivePrompt.text = 'x'.repeat(16_385)
    },
    /budget/u,
  ],
] as const) {
  test(`Smart regional ${name} refuses before any consumer`, () => {
    const input = fixture()
    change(input)
    assert.match(reason(input)!, expected)
  })
}

test('worker requires independently qualified Smart/regional combination, not existing names', () => {
  const ready = {
    ...ANIMA_BATCH_READY,
    capabilities: [
      ...ANIMA_BATCH_READY.capabilities,
      'illustrious-outpaint',
      'anima-outpaint',
      'smart-patch-execution',
      'smart-patch-seed-confirmation',
      'anima-smart-patch-regional-inpaint-v1',
    ],
    workerVersion: '0.14.0',
  }
  assert.equal(supportsInferenceAnimaSmartPatchRegional(ready), true)
  for (const cap of [
    'smart-patch-execution',
    'smart-patch-seed-confirmation',
    'anima-smart-patch-regional-inpaint-v1',
    'anima-flow-sampling',
  ]) {
    assert.equal(
      supportsInferenceAnimaSmartPatchRegional({
        ...ready,
        capabilities: ready.capabilities.filter((x) => x !== cap),
      }),
      false,
      cap,
    )
  }
  assert.equal(
    supportsInferenceAnimaSmartPatchRegional({ ...ready, workerVersion: '0.13.0' }),
    false,
  )
})

test('Retry capability requirement follows frozen Smart metadata rather than current authoring', () => {
  const state = {
    animaSmartPatchRegionalSupported: false,
    animaSupported: true,
    smartPatchSupported: true,
  }
  assert.equal(generationQueueRetryReason('anima-smart-patch', state), null)
  assert.match(
    generationQueueRetryReason(
      'anima-smart-patch',
      state,
      null,
      false,
      false,
      0,
      'heun',
      null,
      true,
    )!,
    /Regional Guidance/u,
  )
  assert.equal(
    generationQueueRetryReason(
      'anima-smart-patch',
      { ...state, animaSmartPatchRegionalSupported: true },
      null,
      false,
      false,
      0,
      'heun',
      null,
      true,
    ),
    null,
  )
})
