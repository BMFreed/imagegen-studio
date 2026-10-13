/** Real profile/envelope/preservation-hook wiring; these CPU checks do not prove trained inference. */
import assert from 'node:assert/strict'
import path from 'node:path'
import { homedir } from 'node:os'
import test from 'node:test'

import { expectedInstalledTerminalFailure } from './installed-dynamic-batch-driver.mjs'
import { noobaiVpredDpmProfile } from './noobai-vpred-dpm-profile.mjs'
import {
  noobaiKarrasFailureCode,
  noobaiKarrasFailureMessage,
  noobaiKarrasFailureProfile as profile,
  normalizeNoobaiKarrasFailureInputs,
} from './noobai-karras-failure-profile.mjs'

const root = path.join(
  homedir(),
  '.codex/artifacts/imagegen-studio/runs/noobai-karras-failure-profile',
)
function fixture(objective, stage) {
  return {
    schemaVersion: 1,
    profile: profile.profile,
    objective,
    stage,
    algorithm: 'dpmpp_2m',
    schedule: objective === 'v_prediction' ? 'Karras' : 'Normal',
    mode: 'txt2img',
    case: 'history',
    artifacts: path.join(root, `${objective}-${stage}`),
    referenceFixture: { path: path.join(root, 'reference.json'), sha256: 'a'.repeat(64) },
    workerBaseline: { path: path.join(root, 'worker.json'), sha256: 'b'.repeat(64) },
    ...(stage === 'baseline'
      ? {}
      : {
          baseline: {
            reportPath: path.join(root, `${objective}-baseline/report.json`),
            reportSha256: 'c'.repeat(64),
          },
        }),
    ...(stage === 'control'
      ? {
          mutation: {
            module: 'inference.py',
            originalSha256: 'd'.repeat(64),
            mutatedSha256: 'e'.repeat(64),
          },
        }
      : {}),
  }
}

// Observable invariant: only the declared V Karras control can complete as a failed job.
// Neighbor: EPS control remains one real provisional completion; old V control stays pixel-only.
// Mutation: classify every control as an expected failure or remove its independent plan counts.
test('five exact DPM scenarios preserve ordinary completion plans and opt in only V Karras control', () => {
  const cases = [
    ['v_prediction', 'baseline', 1, false],
    ['epsilon', 'baseline', 1, true],
    ['v_prediction', 'control', 0, true],
    ['epsilon', 'control', 1, true],
    ['v_prediction', 'restored', 1, false],
  ]
  for (const [objective, stage, completions, provisional] of cases) {
    const input = fixture(objective, stage)
    const plan = profile.validateFixture(input)
    assert.equal(plan.expectedAdmissions, 1)
    assert.equal(plan.expectedCompletions, completions)
    assert.equal(plan.expectedFailed ?? 0, completions ? 0 : 1)
    assert.equal(profile.provisionalOnly(input), provisional)
    assert.equal(Object.isFrozen(plan), true)
    const expectation = expectedInstalledTerminalFailure(profile, input, plan, provisional)
    assert.deepEqual(
      expectation,
      completions ? null : { code: noobaiKarrasFailureCode, message: noobaiKarrasFailureMessage },
    )
    assert.equal(plan.items[0].seed, 0)
    assert.equal(plan.items[0].steps, 4)
    assert.equal(plan.items[0].objective, objective)
  }
  const prior = fixture('v_prediction', 'control')
  prior.profile = 'noobai-vpred-dpm'
  assert.equal(noobaiVpredDpmProfile.validateFixture(prior).expectedCompletions, 1)
  assert.equal(noobaiVpredDpmProfile.expectedTerminalFailure, undefined)
})

test('new failure envelope retains existing strict source/mutation fields and refuses broader cases', () => {
  for (const changes of [
    { profile: 'noobai-vpred-dpm' },
    { schedule: 'Normal' },
    { algorithm: 'dpmpp_sde' },
    { mode: 'img2img' },
    { case: 'neighbor' },
    { stage: 'reuse' },
    { expectedFailure: true },
    {
      mutation: {
        module: 'inference_lora.py',
        originalSha256: 'd'.repeat(64),
        mutatedSha256: 'e'.repeat(64),
      },
    },
  ])
    assert.throws(() =>
      profile.validateFixture({ ...fixture('v_prediction', 'control'), ...changes }),
    )
  assert.throws(() => profile.validateFixture(fixture('epsilon', 'restored')))
  assert.throws(() =>
    profile.validateFixture({ ...fixture('epsilon', 'control'), schedule: 'Karras' }),
  )
})

test('same-input matching keeps the complete DTO and seed/profile fields while excluding only three owners', () => {
  const frozen = {
    schemaVersion: 1,
    kind: 'illustrious-txt2img',
    originRequestId: 'request-owner',
    context: {
      documentId: 'document-owner',
      documentRevision: 'revision-owner',
      sampling: { seed: 0, seedBehavior: 'per-iteration' },
    },
    workerJob: {
      checkpoint: { predictionType: 'v_prediction' },
      sampling: { scheduler: 'dpmpp_2m_k', seed: 0 },
    },
  }
  const retained = structuredClone(frozen)
  const inputs = normalizeNoobaiKarrasFailureInputs(frozen)
  const expected = structuredClone(retained)
  delete expected.originRequestId
  delete expected.context.documentId
  delete expected.context.documentRevision
  assert.deepEqual(inputs, expected)
  assert.deepEqual(frozen, retained)
  inputs.workerJob.checkpoint.predictionType = 'epsilon'
  assert.deepEqual(frozen, retained)
  assert.equal(profile.normalizeNativeInputs, normalizeNoobaiKarrasFailureInputs)
  assert.equal(profile.normalizeReferenceInputs, normalizeNoobaiKarrasFailureInputs)
  assert.equal(profile.authorComponents, noobaiVpredDpmProfile.authorComponents)
  assert.equal(profile.assertFrozen, noobaiVpredDpmProfile.assertFrozen)
  assert.ok(profile.sourceDependencies.includes('scripts/noobai-vpred-dpm-profile.mjs'))
})

test('failure summary refuses a completed mutant and keeps expected failure separate from pixel RED', () => {
  const input = fixture('v_prediction', 'control')
  const summary = profile.summaryClaims({
    fixture: input,
    report: { generations: [], terminalFailure: { outcome: 'qualified-terminal-failure' } },
  })
  assert.equal(summary.expectedFailedJobs, 1)
  assert.equal(summary.trainedUnetNonFiniteRefusalClaim, true)
  assert.equal(summary.acceptedSavedReopenedClaim, false)
  assert.equal(summary.pixelRedClaim, false)
  assert.equal(summary.originalHistoricalFailureCauseClaim, false)
  assert.throws(() =>
    profile.summaryClaims({ fixture: input, report: { generations: [{ accepted: false }] } }),
  )
  assert.throws(() => profile.summaryClaims({ fixture: input, report: { generations: [] } }))
  const epsilon = profile.summaryClaims({
    fixture: fixture('epsilon', 'control'),
    report: { generations: [{ accepted: false }] },
  })
  assert.equal(epsilon.expectedFailedJobs, 0)
  assert.equal(epsilon.trainedUnetNonFiniteRefusalClaim, false)
})
