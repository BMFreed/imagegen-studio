/** Observe real Remove review while the exact packaged CUDA job keeps running. */
import assert from 'node:assert/strict'

import { expect } from '@playwright/test'

function workerIdentity({ pid, startTicks, group }) {
  return { pid, startTicks, group }
}

export async function observeLiveRemove({
  state,
  reference,
  admitted,
  readRunning,
  assertPrivateEmbedding,
}) {
  const { page } = state
  const embeddingBefore = await assertPrivateEmbedding()
  const manager = page.getByRole('dialog', { name: 'Model Manager', exact: true })
  const dialog = page.getByRole('dialog', { name: 'Remove Local Resource', exact: true })
  const confirm = dialog.getByRole('button', { name: 'Remove permanently', exact: true })
  const acknowledge = dialog.getByRole('checkbox', {
    name: 'I understand that referenced settings will become unavailable',
    exact: true,
  })
  let initial
  async function witness() {
    const observation = await readRunning()
    const { row, worker, gpu } = observation
    assert.equal(row.id, admitted.id)
    assert.equal(row.status, 'running')
    assert.equal(row.frozen_payload_json, admitted.frozen_payload_json)
    assert.ok(gpu.gpuMiB > 0)
    assert.deepEqual(workerIdentity(gpu), workerIdentity(worker))
    if (initial) {
      assert.deepEqual(row, initial.row)
      assert.deepEqual(workerIdentity(worker), workerIdentity(initial.worker))
    } else {
      initial = observation
    }
    return observation
  }

  await page.getByRole('button', { name: 'Models menu', exact: true }).click()
  await page.locator('.n-dropdown-menu').getByText('Manage Models', { exact: true }).click()
  try {
    const row = manager.locator('.resource-row').filter({
      has: page.getByText(reference.displayName, { exact: true }),
    })
    await row.locator('.resource-select').click()
    const details = manager.getByLabel('Model details', { exact: true })
    await expect(details.locator('h2')).toHaveText(reference.displayName)

    const beforeUi = await witness()
    await manager.getByRole('button', { name: 'Remove Local Resource', exact: true }).click()
    await expect(dialog).toContainText(reference.displayName)
    await expect(dialog).toContainText('1 running jobs use this resource. Removal is blocked.')
    await expect(dialog).toContainText('1 unshared managed files will be deleted.')
    await expect(acknowledge).not.toBeChecked()
    await expect(confirm).toBeDisabled()
    await acknowledge.check()
    await expect(acknowledge).toBeChecked()
    await expect(confirm).toBeDisabled()
    const afterUi = await witness()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toBeHidden()

    const beforeReview = await witness()
    const review = await page.evaluate(async (resourceId) => {
      const result = await window.api.models.reviewRemoval(resourceId)
      if (!result.ok) return result
      const { fileCount, name, pendingJobs, runningJobs, sharedFileCount, versionCount } =
        result.value
      return {
        ok: true,
        value: {
          fileCount,
          name,
          pendingJobs,
          resourceId: result.value.resourceId,
          runningJobs,
          sharedFileCount,
          versionCount,
        },
      }
    }, reference.localModelId)
    assert.deepEqual(review, {
      ok: true,
      value: {
        fileCount: 1,
        name: reference.displayName,
        pendingJobs: 0,
        resourceId: reference.localModelId,
        runningJobs: 1,
        sharedFileCount: 0,
        versionCount: 1,
      },
    })
    const afterReview = await witness()
    const embeddingAfter = await assertPrivateEmbedding()
    assert.deepEqual(embeddingAfter, embeddingBefore)
    return {
      beforeUi,
      afterUi,
      beforeReview,
      afterReview,
      review: review.value,
      removeDisabledAfterAcknowledgement: true,
      embeddingBefore,
      embeddingAfter,
    }
  } finally {
    if (await dialog.isVisible()) {
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(dialog).toBeHidden()
    }
    if (await manager.isVisible()) {
      await manager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
      await expect(manager).toBeHidden()
    }
  }
}
