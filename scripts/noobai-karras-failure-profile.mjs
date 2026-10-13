/** Exact native wrong-EPS refusal; the earlier eight-job pixel qualification remains unchanged. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { validateNoobaiVpredDpmFixture } from './illustrious-dpm-qualification.mjs'
import { noobaiVpredDpmProfile } from './noobai-vpred-dpm-profile.mjs'

export const noobaiKarrasFailureCode = 'GENERATION_UNET_NON_FINITE'
export const noobaiKarrasFailureMessage =
  'The UNet produced non-finite values. Review the checkpoint prediction type and noise settings; Retry uses the original settings.'
const isFailure = (fixture) => fixture.objective === 'v_prediction' && fixture.stage === 'control'
const provisional = (fixture) => fixture.objective === 'epsilon' || isFailure(fixture)
const originalPlan = (fixture) =>
  validateNoobaiVpredDpmFixture({ ...fixture, profile: 'noobai-vpred-dpm' })

export function validateNoobaiKarrasFailureFixture(fixture) {
  assert.equal(fixture?.profile, 'noobai-karras-failure')
  const plan = originalPlan(fixture)
  assert.equal(fixture.schedule, fixture.objective === 'v_prediction' ? 'Karras' : 'Normal')
  return isFailure(fixture)
    ? Object.freeze({ ...plan, expectedCompletions: 0, expectedFailed: 1 })
    : plan
}

/** Retain every native field, excluding only independently validated owner identities. */
export function normalizeNoobaiKarrasFailureInputs(frozen) {
  const inputs = structuredClone(frozen)
  delete inputs.originRequestId
  delete inputs.context.documentId
  delete inputs.context.documentRevision
  return inputs
}

export const noobaiKarrasFailureProfile = Object.freeze({
  ...noobaiVpredDpmProfile,
  profile: 'noobai-karras-failure',
  entrySource: 'scripts/qualify-installed-noobai-karras-failure.mjs',
  adapterSource: 'scripts/noobai-karras-failure-profile.mjs',
  sourceDependencies: [
    ...noobaiVpredDpmProfile.sourceDependencies,
    'scripts/noobai-vpred-dpm-profile.mjs',
  ],
  validateFixture: validateNoobaiKarrasFailureFixture,
  normalizeNativeInputs: normalizeNoobaiKarrasFailureInputs,
  normalizeExecutionInputs: normalizeNoobaiKarrasFailureInputs,
  normalizeReferenceInputs: normalizeNoobaiKarrasFailureInputs,
  provisionalOnly: provisional,
  assertAuthored(draft, reference, fixture, plan) {
    assert.deepEqual(plan, validateNoobaiKarrasFailureFixture(fixture))
    noobaiVpredDpmProfile.assertAuthored(draft, reference, fixture, originalPlan(fixture))
  },
  expectedTerminalFailure: (fixture) =>
    isFailure(fixture)
      ? { code: noobaiKarrasFailureCode, message: noobaiKarrasFailureMessage }
      : null,
  async assertTerminalFailure(ctx) {
    const {
      window,
      expect,
      project,
      plan,
      report,
      admitted,
      terminalFailure,
      beforeEffects,
      afterEffects,
      progress,
      screenshot,
    } = ctx
    assert.equal(isFailure(ctx.fixture), true)
    assert.equal(plan.expectedFailed, 1)
    assert.equal(report.generations.length, 0)
    assert.equal(terminalFailure.error_code, noobaiKarrasFailureCode)
    assert.equal(terminalFailure.error_message, noobaiKarrasFailureMessage)
    assert.deepEqual(
      progress.map(({ current }) => [current.step, current.totalSteps]),
      [
        [1, 4],
        [2, 4],
        [3, 4],
      ],
    )
    for (const { current } of progress) {
      assert.equal(current.jobId, admitted.id)
      assert.equal(current.projectKey, project.id)
      assert.equal(current.documentId, admitted.document_id)
      assert.equal(current.statusSequence, 1)
    }
    const target = report.admissions[0].target
    assert.equal(
      createHash('sha256')
        .update(await readFile(target.path))
        .digest('hex'),
      target.sha256,
    )
    const session = path.join(project.id, admitted.staging_session_id) + path.sep
    for (const tree of afterEffects.effects.privateTrees) {
      if (tree.root.endsWith(path.join('recovery', 'generation-staging')))
        assert.deepEqual(
          tree.entries.filter((entry) => entry.kind === 'file' && entry.path.includes(session)),
          [],
        )
      if (tree.root.endsWith(path.sep + 'scratch')) {
        const oldFiles = new Set(
          beforeEffects.effects.privateTrees
            .find(({ root }) => root === tree.root)
            .entries.filter(({ kind }) => kind === 'file')
            .map(({ path: filename }) => filename),
        )
        assert.deepEqual(
          tree.entries.filter(
            ({ kind, path: filename }) =>
              kind === 'file' && !oldFiles.has(filename) && filename.endsWith('.png'),
          ),
          [],
        )
      }
    }
    await window.getByRole('button', { name: 'Open Queue Manager', exact: true }).click()
    const manager = window.getByRole('dialog', { name: 'Queue Manager', exact: true })
    const row = manager.locator(`[data-testid="queue-job-row"][data-job-id="${admitted.id}"]`)
    await expect(row).toHaveAttribute('data-status', 'failed')
    await row.getByRole('button', { name: 'Show job details', exact: true }).click()
    await expect(manager).toContainText(noobaiKarrasFailureCode)
    await expect(manager.locator('.error-message')).toHaveText(noobaiKarrasFailureMessage)
    await screenshot('expected-unet-failure.png', manager)
    await manager.getByRole('button', { name: 'Close Queue Manager', exact: true }).click()
    return {
      queueItemId: admitted.id,
      outcome: 'qualified-terminal-failure',
      row: terminalFailure,
      errorCode: noobaiKarrasFailureCode,
      errorMessage: noobaiKarrasFailureMessage,
      before: beforeEffects.proof,
      after: afterEffects.proof,
      progress,
      retainedTarget: target,
      actualCandidateCount: 0,
      actualReceiptDelta: 0,
      actualAcceptedDelta: 0,
      lastActualSeed: afterEffects.effects.results.lastActualSeed,
      durableQueueMessageVisible: true,
      workerPhysicallyExited: true,
      pixelRedClaim: false,
      originalHistoricalFailureCauseClaim: false,
    }
  },
  summaryClaims({ fixture, report }) {
    const failed = isFailure(fixture)
    assert.equal(report.generations.length, failed ? 0 : 1)
    assert.ok(report.generations.every(({ accepted }) => accepted === !provisional(fixture)))
    if (failed) assert.equal(report.terminalFailure?.outcome, 'qualified-terminal-failure')
    return {
      algorithm: fixture.algorithm,
      schedule: fixture.schedule,
      mode: fixture.mode,
      case: fixture.case,
      expectedFailedJobs: failed ? 1 : 0,
      trainedUnetNonFiniteRefusalClaim: failed,
      acceptedSavedReopenedClaim: !provisional(fixture),
      provisionalControl: provisional(fixture),
      pixelRedClaim: false,
      originalHistoricalFailureCauseClaim: false,
      fullMvpClaim: false,
    }
  },
  boundary: {
    actual:
      'Existing Model Manager/Prepare/installed worker/Queue Manager; exact UNet failure is a durable failed job, with no candidate/receipt/cursor/accepted publication.',
    preconditions:
      'Same pool0.14 and43 files; V Karras baseline/restored, EPS Normal baseline/control; one prediction-only installed source delta for controls.',
    limits:
      'Five TXT256/N4/CFG4/Fixed0 jobs with DigitalArt−.5/external native VAE FP32 only; no fake pixel RED, recovered original exception, quality, Invoke pixel parity or fullMVP claim.',
  },
})
