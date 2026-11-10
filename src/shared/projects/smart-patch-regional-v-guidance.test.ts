import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import type { ProjectGenerationActionState } from './project-generation-actions.js'

import { ANIMA_BATCH_READY } from '../../main/projects/test-fixtures/anima-batch.js'
import { literalSmartPatchPreparedInput } from '../../main/projects/test-fixtures/smart-patch-input-material.js'
import { generationQueueRetryReason } from '../../renderer/components/generation-queue-retry.js'
import {
  supportsInferenceIllustriousSmartPatchRegionalMode,
  supportsInferenceSmartPatchRegionalMode,
} from './inference-worker-capabilities.js'
import { isProjectGenerationActionState } from './project-generation-actions.js'
import { getSmartPatchRegionalGenerationUnavailableReason } from './smart-patch-regional-guidance.js'

const modes = ['txt2img', 'img2img', 'inpaint', 'outpaint'] as const
const flags = {
  img2img: 'illustriousSmartPatchRegionalVPredictionImg2ImgSupported',
  inpaint: 'illustriousSmartPatchRegionalVPredictionSupported',
  outpaint: 'illustriousSmartPatchRegionalVPredictionOutpaintSupported',
  txt2img: 'illustriousSmartPatchRegionalVPredictionTxt2ImgSupported',
} as const

for (const mode of modes) {
  test(`Smart V ${mode} requires its exact objective/mode grant and keeps EPS independent`, () => {
    const common = {
      ...ANIMA_BATCH_READY,
      capabilities: [
        ...ANIMA_BATCH_READY.capabilities,
        'illustrious-euler',
        'illustrious-outpaint',
        'illustrious-noise-profile',
        'smart-patch-execution',
        'smart-patch-seed-confirmation',
      ],
      workerVersion: '0.14.0',
    }
    const eps = {
      ...common,
      capabilities: [...common.capabilities, `illustrious-smart-patch-regional-${mode}-v1`],
    }
    const v = {
      ...common,
      capabilities: [
        ...common.capabilities,
        `illustrious-smart-patch-regional-v-prediction-${mode}-v1`,
      ],
    }
    assert.equal(supportsInferenceIllustriousSmartPatchRegionalMode(eps, mode), true)
    assert.equal(
      supportsInferenceIllustriousSmartPatchRegionalMode(eps, mode, 'v_prediction'),
      false,
    )
    assert.equal(supportsInferenceIllustriousSmartPatchRegionalMode(v, mode), false)
    assert.equal(
      supportsInferenceSmartPatchRegionalMode(v, 'illustrious', mode, 'v_prediction'),
      true,
    )
    assert.equal(supportsInferenceSmartPatchRegionalMode(v, 'illustrious', mode, 'unknown'), false)
    assert.equal(
      supportsInferenceSmartPatchRegionalMode(
        { ...v, workerVersion: '0.13.0' },
        'illustrious',
        mode,
        'v_prediction',
      ),
      false,
    )
    for (const other of modes.filter((value) => value !== mode)) {
      assert.equal(
        supportsInferenceSmartPatchRegionalMode(v, 'illustrious', other, 'v_prediction'),
        false,
      )
    }
  })

  test(`frozen Smart V ${mode} Retry ignores EPS and other V-mode grants`, () => {
    const peer = {
      illustriousSmartPatchRegionalImg2ImgSupported: true,
      illustriousSmartPatchRegionalOutpaintSupported: true,
      illustriousSmartPatchRegionalSupported: true,
      illustriousSmartPatchRegionalTxt2ImgSupported: true,
      ...Object.fromEntries(Object.values(flags).map((flag) => [flag, flag !== flags[mode]])),
      smartPatchSupported: true,
    }
    const reason = (state: typeof peer) =>
      generationQueueRetryReason(
        'illustrious-smart-patch',
        state,
        'Euler',
        false,
        false,
        0,
        null,
        'v_prediction',
        true,
        mode === 'outpaint',
        mode === 'txt2img',
        mode === 'img2img',
      )
    assert.match(reason(peer)!, /Illustrious V.*Regional Guidance/u)
    assert.equal(reason({ ...peer, [flags[mode]]: true }), null)
    assert.equal(generationQueueRetryReason('illustrious-smart-patch', peer), null)
  })
}

test('Smart metadata allows saved V/null hints while the resolver owns definitive admission', () => {
  const { context } = literalSmartPatchPreparedInput('illustrious').prepared
  const patch = {
    boundingBox: context.bbox,
    generationDraft: context.generationDraft,
    internalResolution: context.internalResolution,
  }
  const document = {
    regionalGuidance: [
      {
        enabled: true,
        id: randomUUID(),
        locked: false,
        mask: { asset: null, id: randomUUID(), revision: 0 },
        name: 'Owned region',
        overlayOpacity: 0.5,
      },
    ],
  }
  for (const predictionType of ['epsilon', 'v_prediction', null] as const) {
    patch.generationDraft.model!.predictionType = predictionType
    assert.equal(getSmartPatchRegionalGenerationUnavailableReason({ document, patch }), null)
    assert.match(
      getSmartPatchRegionalGenerationUnavailableReason({
        document,
        patch,
        runtimeSupported: false,
      })!,
      /engine/u,
    )
  }
  patch.generationDraft.vaePrecision = 'FP32'
  assert.match(getSmartPatchRegionalGenerationUnavailableReason({ document, patch })!, /Auto VAE/u)
})

test('IPC accepts optional V grants only as booleans and preserves absent-grant compatibility', () => {
  const state: ProjectGenerationActionState = {
    cfgRescaleSupported: false,
    documentId: randomUUID(),
    embeddingsSupported: false,
    error: null,
    externalVaeSupported: false,
    img2imgSupported: false,
    jobs: [],
    phase: 'idle',
    runningJobId: null,
    vaePrecisionSupported: false,
  }
  assert.equal(isProjectGenerationActionState(state), true)
  for (const flag of Object.values(flags)) {
    assert.equal(isProjectGenerationActionState({ ...state, [flag]: true }), true)
    assert.equal(isProjectGenerationActionState({ ...state, [flag]: 'true' }), false)
  }
})
