/** Actual packaged Remove UI with explicitly prepared, no-worker queue controls. */
import assert from 'node:assert/strict'

import { expect } from '@playwright/test'

async function modelsCall(page, method, ...args) {
  return await page.evaluate(({ method, args }) => window.api.models[method](...args), {
    method,
    args,
  })
}

async function review(page, resourceId, pendingJobs, runningJobs) {
  const result = await modelsCall(page, 'reviewRemoval', resourceId)
  assert.equal(result.ok, true, result.error?.message)
  assert.equal(result.value.resourceId, resourceId)
  assert.equal(result.value.pendingJobs, pendingJobs)
  assert.equal(result.value.runningJobs, runningJobs)
  return result.value
}

async function requireRefusal(page, token, cancelPending, code) {
  const result = await modelsCall(page, 'removeLocalResource', token, cancelPending)
  assert.equal(result.ok, false, `Expected packaged Main to refuse with ${code}.`)
  assert.equal(result.error.code, code)
  return result.error.code
}

function assertApprovedCancellation(before, after, affectedIds) {
  assert.deepEqual(
    after.map(({ id }) => id),
    before.map(({ id }) => id),
  )
  for (const original of before) {
    const actual = after.find(({ id }) => id === original.id)
    if (!affectedIds.includes(original.id)) {
      assert.deepEqual(actual, original, original.id)
      continue
    }
    assert.equal(original.status, 'pending')
    assert.ok(Number.isFinite(Date.parse(actual.finished_at)), original.id)
    assert.deepEqual(actual, {
      ...original,
      status: 'canceled',
      error_code: 'USER_CANCELED',
      error_message: 'The job was canceled.',
      status_sequence: original.status_sequence + 1,
      finished_at: actual.finished_at,
      updated_at: actual.finished_at,
    })
  }
}

export async function exerciseQueuedRemoval({
  page,
  controls,
  removeButton,
  dialog,
  reference,
  assertUnchanged,
  retainBefore,
}) {
  const resourceId = reference.localModelId
  const confirm = dialog.getByRole('button', { name: 'Remove permanently', exact: true })
  const referenceAck = dialog.getByRole('checkbox', {
    name: 'I understand that referenced settings will become unavailable',
    exact: true,
  })
  const pendingAck = (count) =>
    dialog.getByRole('checkbox', {
      name: `Cancel these ${count} affected pending jobs before removing the resource`,
      exact: true,
    })
  const describeReview = (stage, value) => ({
    stage,
    pendingJobs: value.pendingJobs,
    runningJobs: value.runningJobs,
  })
  const openReview = async () => {
    await removeButton.click()
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(reference.displayName)
    await expect(dialog).toContainText('1 unshared managed files will be deleted.')
    await expect(referenceAck).not.toBeChecked()
    await expect(confirm).toBeDisabled()
  }
  const dismissReview = async () => {
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toBeHidden()
  }
  const snapshot = async () => ({ rows: await controls.rows(), inputs: await controls.witness() })
  const unchanged = async (expected) => {
    assert.deepEqual(await snapshot(), expected)
    await assertUnchanged()
  }
  const reviews = []
  const refusals = {}

  const raced = await controls.enqueue(true)
  const beforeClaim = await review(page, resourceId, 1, 0)
  reviews.push(describeReview('before affected claim', beforeClaim))
  const claimed = await controls.claim(raced.id)
  assert.equal(claimed.id, raced.id)
  const running = await snapshot()
  assert.equal(running.rows.find(({ id }) => id === raced.id)?.status, 'running')
  refusals.pendingBecameRunning = await requireRefusal(
    page,
    beforeClaim.token,
    true,
    'MODEL_REMOVAL_USAGE_CHANGED',
  )
  await unchanged(running)
  await openReview()
  await expect(dialog).toContainText('1 running jobs use this resource. Removal is blocked.')
  await referenceAck.check()
  await expect(confirm).toBeDisabled()
  await dismissReview()
  await unchanged(running)
  const runningReview = await review(page, resourceId, 0, 1)
  reviews.push(describeReview('fresh affected running review', runningReview))
  refusals.affectedRunning = await requireRefusal(
    page,
    runningReview.token,
    true,
    'MODEL_REMOVAL_USAGE_CHANGED',
  )
  await unchanged(running)

  // Release only the suite's deliberate running claim. This is not removal or cancellation of
  // actual worker execution. The controller also settles its remaining owned claims after proof.
  const runtime = await page.evaluate(() => window.api.runtime.getStatus())
  assert.equal(runtime.ok, true, runtime.error?.message)
  assert.equal(runtime.value.kind, 'not-installed')
  await controls.finish(raced.id)
  assert.equal((await controls.rows()).find(({ id }) => id === raced.id)?.status, 'canceled')

  const unrelatedRunning = await controls.enqueue(false)
  assert.equal((await controls.claim(unrelatedRunning.id)).id, unrelatedRunning.id)
  const affectedOne = await controls.enqueue(true)
  const unrelatedPending = await controls.enqueue(false)
  const pending = await snapshot()
  assert.equal(pending.rows.find(({ id }) => id === unrelatedRunning.id)?.status, 'running')
  assert.equal(pending.rows.find(({ id }) => id === unrelatedPending.id)?.status, 'pending')
  assert.equal(pending.rows.find(({ id }) => id === affectedOne.id)?.status, 'pending')

  await openReview()
  await expect(dialog).toContainText('No running jobs use this resource.')
  await expect(pendingAck(1)).not.toBeChecked()
  await pendingAck(1).check()
  await expect(referenceAck).not.toBeChecked()
  await expect(confirm).toBeDisabled()
  await dismissReview()
  await unchanged(pending)

  const withoutConsent = await review(page, resourceId, 1, 0)
  reviews.push(describeReview('before missing cancellation consent', withoutConsent))
  refusals.withoutCancellationConsent = await requireRefusal(
    page,
    withoutConsent.token,
    false,
    'MODEL_REMOVAL_USAGE_CHANGED',
  )
  await unchanged(pending)
  refusals.consumedToken = await requireRefusal(
    page,
    withoutConsent.token,
    true,
    'MODEL_REMOVAL_STALE',
  )
  await unchanged(pending)

  const stale = await review(page, resourceId, 1, 0)
  reviews.push(describeReview('before new affected job', stale))
  const affectedTwo = await controls.enqueue(true)
  const expanded = await snapshot()
  assert.equal(expanded.rows.find(({ id }) => id === affectedTwo.id)?.status, 'pending')
  assert.deepEqual(
    expanded.rows.filter(({ id }) => id !== affectedTwo.id),
    pending.rows,
  )
  const { [affectedTwo.id]: newInput, ...previousInputs } = expanded.inputs
  assert.ok(newInput)
  assert.deepEqual(previousInputs, pending.inputs)
  refusals.changedAffectedSet = await requireRefusal(
    page,
    stale.token,
    true,
    'MODEL_REMOVAL_USAGE_CHANGED',
  )
  await unchanged(expanded)

  await openReview()
  await expect(dialog).toContainText('No running jobs use this resource.')
  await expect(pendingAck(2)).not.toBeChecked()
  await referenceAck.check()
  await expect(confirm).toBeDisabled()
  await pendingAck(2).check()
  await expect(confirm).toBeEnabled()
  await unchanged(expanded)
  await retainBefore()
  await confirm.click()
  await expect(dialog).toBeHidden()

  const affectedIds = [affectedOne.id, affectedTwo.id]
  const afterRows = await controls.rows()
  assertApprovedCancellation(expanded.rows, afterRows, affectedIds)
  assert.deepEqual(await controls.witness(), expanded.inputs)
  return {
    reviews,
    refusals,
    runningControlId: raced.id,
    unrelatedIds: [unrelatedRunning.id, unrelatedPending.id],
    affectedIds,
    runningRows: running.rows,
    beforeRows: expanded.rows,
    afterRows,
    witness: expanded.inputs,
  }
}
