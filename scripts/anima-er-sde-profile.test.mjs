/** Real profile contracts and authoring assertions; no installed UI/GPU evidence. */
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createEmptyProjectDocumentV1 } from '../src/shared/projects/project-schema.ts'

import { animaDynamicBatchProfile as resources } from './anima-dynamic-batch-profile.mjs'
import { animaErSdeProfile as profile } from './anima-er-sde-profile.mjs'
import {
  assertAnimaErSdeConfiguration,
  assertAnimaErSdeFrozen,
  literalAnimaErSdePlan,
  normalizeAnimaErSdeNativeInputs,
  validateAnimaErSdeFixture,
} from './anima-er-sde-qualification.mjs'

const root = path.join(homedir(), '.codex/artifacts/imagegen-studio/runs/er-sde-profile-mechanics')
function fixture(stage = 'baseline', steps = 5) {
  return {
    schemaVersion: 1,
    profile: 'anima-er-sde',
    stage,
    steps,
    referenceFixture: { path: path.join(root, 'reference.json'), sha256: 'a'.repeat(64) },
    workerBaseline: { path: path.join(root, 'entry-sources.json'), sha256: 'b'.repeat(64) },
    artifacts: path.join(root, `output-${stage}-${steps}`),
    ...(stage === 'baseline'
      ? {}
      : {
          baseline: {
            reportPath: path.join(root, `baseline-${steps}/report.json`),
            reportSha256: 'c'.repeat(64),
          },
        }),
    ...(stage === 'control'
      ? {
          mutation: {
            module: 'vendor/er_sde_scheduler.py',
            originalSha256: 'd'.repeat(64),
            mutatedSha256: 'e'.repeat(64),
          },
        }
      : {}),
  }
}

test('ER-SDE profile binds the independent oracle and exact retained Anima resources', () => {
  assert.equal(profile.validateFixture, validateAnimaErSdeFixture)
  assert.equal(profile.assertFrozen, assertAnimaErSdeFrozen)
  assert.equal(profile.assertConfiguration, assertAnimaErSdeConfiguration)
  for (const method of [
    'normalizeNativeInputs',
    'normalizeExecutionInputs',
    'normalizeReferenceInputs',
  ])
    assert.equal(profile[method], normalizeAnimaErSdeNativeInputs)
  for (const method of ['modelKey', 'loraKey', 'originalSourceKeys', 'operation', 'cfgScale'])
    assert.equal(profile[method], resources[method])
  assert.deepEqual(profile.sourceDependencies, [
    'scripts/anima-dynamic-batch-profile.mjs',
    'scripts/anima-dynamic-batch-qualification.mjs',
  ])
  assert.deepEqual(profile.sampling(fixture()), {
    label: 'Anima method',
    draftKey: 'animaMethod',
    value: 'ER-SDE',
    code: 'er_sde',
    editedValue: 'Heun',
    editedCode: 'heun',
  })
  assert.deepEqual(profile.comparisonChanged, resources.comparisonChanged)
  assert.deepEqual(profile.comparisonSame, [
    ...resources.comparisonSame,
    'guidance.steps',
    'guidance.cfg',
  ])
})

test('control is provisional for both3/5, and every stage supplies exactly the authored step count', () => {
  for (const steps of [3, 5])
    for (const stage of ['baseline', 'control', 'restored']) {
      const input = fixture(stage, steps)
      const plan = profile.validateFixture(input)
      assert.equal(plan.items.length, 1)
      assert.equal(plan.items[0].steps, steps)
      assert.equal(profile.inferenceSteps(input), steps)
      assert.equal(profile.provisionalOnly(input), stage === 'control')
      assert.equal(profile.expectedBaselineStage(input), 'baseline')
      assert.deepEqual(profile.baselineMetadataDifferences(input), [])
    }
})

function authoredDraft(steps) {
  const plan = literalAnimaErSdePlan('baseline', steps)
  const reference = {
    anima: {
      sha256: 'a'.repeat(64),
      installed: { resourceId: 'anima-resource', versionId: 'anima-version' },
    },
    animaLora: {
      sha256: 'b'.repeat(64),
      installed: { resourceId: 'myth-resource', versionId: 'myth-version' },
    },
  }
  const document = createEmptyProjectDocumentV1({
    title: 'Authored ER-SDE',
    primaryBbox: { x: 0, y: 0, width: 256, height: 256 },
  })
  const draft = document.generationDraft
  draft.model = {
    localModelId: 'anima-resource',
    localVersionId: 'anima-version',
    fileSha256: reference.anima.sha256,
  }
  draft.loras = [
    {
      enabled: true,
      weight: -0.5,
      resource: {
        localModelId: 'myth-resource',
        localVersionId: 'myth-version',
        fileSha256: reference.animaLora.sha256,
      },
    },
  ]
  draft.seed = { policy: 'fixed', value: 0 }
  draft.dynamicPrompt = { maxPrompts: 1, seedBehavior: 'per-iteration' }
  draft.positivePrompt = { embeddingRefs: [], text: plan.sourcePrompts.positive }
  draft.negativePrompt = { embeddingRefs: [], text: plan.sourcePrompts.negative }
  draft.sampling = { ...draft.sampling, steps, cfgScale: 4, animaMethod: 'er_sde' }
  return { draft, reference, plan }
}

test('actual authored assertion catches steps/method/seed/sign/resource and embedding drift', () => {
  for (const steps of [3, 5]) {
    const { draft, reference, plan } = authoredDraft(steps)
    profile.assertAuthored(draft, reference, fixture('baseline', steps), plan)
    for (const edit of [
      (value) => {
        value.sampling.steps = steps === 3 ? 5 : 3
      },
      (value) => {
        value.sampling.animaMethod = 'euler'
      },
      (value) => {
        value.seed.policy = 'random'
      },
      (value) => {
        value.seed.value = 37
      },
      (value) => {
        value.dynamicPrompt.maxPrompts = 3
      },
      (value) => {
        value.loras[0].weight = 0.5
      },
      (value) => {
        value.loras[0].enabled = false
      },
      (value) => {
        value.loras[0].resource.localVersionId = 'different-version'
      },
      (value) => {
        value.model.fileSha256 = 'f'.repeat(64)
      },
      (value) => {
        value.negativePrompt.text = 'unweighted blurry'
      },
      (value) => {
        value.positivePrompt.embeddingRefs = [{}]
      },
    ]) {
      const changed = structuredClone(draft)
      edit(changed)
      assert.throws(() =>
        profile.assertAuthored(changed, reference, fixture('baseline', steps), plan),
      )
    }
  }
})

test('per-report claims distinguish provisional controls and do not invent correction sensitivity or fullMVP', () => {
  for (const steps of [3, 5]) {
    for (const stage of ['baseline', 'restored', 'control']) {
      const provisional = stage === 'control'
      const summary = profile.summaryClaims({
        fixture: fixture(stage, steps),
        report: { generations: [{ accepted: !provisional }] },
      })
      assert.deepEqual(summary, {
        fiveStepErSdeInferenceClaim: !provisional && steps === 5,
        threeStepNeighborClaim: !provisional && steps === 3,
        order3CorrectionSensitivityClaim: false,
        provisionalMutationControl: provisional,
        fullMvpClaim: false,
      })
    }
    assert.throws(() =>
      profile.summaryClaims({
        fixture: fixture('control', steps),
        report: { generations: [{ accepted: true }] },
      }),
    )
    assert.throws(() =>
      profile.summaryClaims({ fixture: fixture('control', steps), report: { generations: [] } }),
    )
  }
})
