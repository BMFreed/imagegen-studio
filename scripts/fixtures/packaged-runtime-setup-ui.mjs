/** Drive the packaged renderer's Runtime Notice and Setup dialog through visible actions. */
import assert from 'node:assert/strict'

import { expect } from '@playwright/test'

const reviewTimeout = 60_000
const operationTimeout = 600_000

const stages = {
  'assembling-runtime': 'Installing engine dependencies',
  'checking-activation': 'Checking activated engine',
  'checking-runtime': 'Checking image engine',
  'copying-runtime': 'Copying engine files',
  'downloading-runtime': 'Downloading image engine',
  'extracting-runtime': 'Unpacking image engine',
  finalizing: 'Finishing setup',
  'installing-outpaint': 'Preparing outpainting resource',
  preparing: 'Preparing setup',
  'preparing-runtime': 'Preparing runtime files',
  'verifying-runtime': 'Verifying engine files',
}

function controls(page, mode) {
  assert.ok(mode === 'install' || mode === 'repair')
  const install = mode === 'install'
  const notice = page.getByRole('region', { exact: true, name: 'Image generation status' })
  const entry = notice.getByRole('button', {
    exact: true,
    name: install ? 'Set up' : 'Repair',
  })
  const dialog = page.getByRole('dialog', {
    exact: true,
    name: install ? 'Set up image generation' : 'Repair image generation',
  })
  const confirm = dialog.getByRole('button', { exact: true, name: install ? 'Install' : 'Repair' })
  const cancel = dialog.getByRole('button', { exact: true, name: 'Cancel' })
  return { cancel, confirm, dialog, entry, notice }
}

function shownBytes(bytes) {
  if (bytes === null) return 'Unknown'
  assert.ok(Number.isSafeInteger(bytes) && bytes >= 0)
  if (bytes < 1024) return `${bytes} B`
  const unit = Math.min(4, Math.floor(Math.log2(bytes) / 10))
  return `${(bytes / 1024 ** unit).toFixed(1)} ${['B', 'KiB', 'MiB', 'GiB', 'TiB'][unit]}`
}

export async function getRuntimeSetupStatus(page) {
  const result = await page.evaluate(() => globalThis.api.runtime.getStatus())
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}

export async function getRuntimeSetupProgress(page) {
  const result = await page.evaluate(() => globalThis.api.runtime.getInstallationProgress())
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}

export async function waitForRuntimeSetupEntry(page, mode) {
  const { entry, notice } = controls(page, mode)
  await expect(
    notice.getByRole('heading', {
      name:
        mode === 'install'
          ? /^Set up image generation$/
          : /^(Outpainting|Image generation) needs repair$/,
    }),
  ).toBeVisible({ timeout: reviewTimeout })
  await expect(entry).toBeEnabled({ timeout: reviewTimeout })
  return entry
}

export async function openRuntimeSetupReview(page, mode, expected) {
  const entry = await waitForRuntimeSetupEntry(page, mode)
  await entry.click()
  // A refused preview may close without offering a confirmation button.
  if (expected === undefined) return
  const { cancel, confirm, dialog } = controls(page, mode)
  await expect(dialog).toBeVisible({ timeout: reviewTimeout })
  await expect(confirm).toBeEnabled({ timeout: reviewTimeout })
  await expect(cancel).toBeEnabled()

  assert.equal(typeof expected.releaseId, 'string')
  assert.equal(typeof expected.runtimeCached, 'boolean')
  assert.equal(typeof expected.outpaintInfillReused, 'boolean')
  const facts = [
    ['Engine release', expected.releaseId],
    ['Total download', shownBytes(expected.downloadBytes)],
    ['Installed size', shownBytes(expected.installedBytes ?? null)],
    ['Additional installed size', shownBytes(expected.additionalInstalledBytes ?? null)],
    ['Runtime minimum free space', shownBytes(expected.runtimeRequiredFreeBytes)],
    ['Peak free space required', 'Unknown'],
  ]
  for (const [label, value] of facts) {
    const term = dialog.getByText(label, { exact: true })
    await expect(term).toBeVisible()
    await expect(term.locator('xpath=following-sibling::*[1][self::dd]')).toHaveText(value)
  }
  const runtimeExplanation = expected.runtimeCached
    ? 'The runtime download is already cached. Installation still creates a new runtime.'
    : 'The runtime download is included in this review. Installation creates a new runtime.'
  const auxiliaryExplanation = expected.outpaintInfillReused
    ? 'The existing outpainting resource will be verified and reused.'
    : 'The outpainting resource will be installed with the engine.'
  await expect(dialog.getByText(runtimeExplanation, { exact: true })).toBeVisible()
  await expect(dialog.getByText(auxiliaryExplanation, { exact: true })).toBeVisible()
}

export async function dismissRuntimeSetupReview(page, mode) {
  const { cancel, confirm, dialog, entry } = controls(page, mode)
  await expect(confirm).toBeEnabled()
  await cancel.click()
  await expect(dialog).toBeHidden()
  await expect(entry).toBeEnabled({ timeout: reviewTimeout })
}

export async function confirmRuntimeSetupReview(page, mode) {
  await controls(page, mode).confirm.click()
}

/** Observe a live stage while the qualification source holds its transfer/operation gate. */
export async function waitForRuntimeSetupProgress(page, mode, { stage, minimumBytes, totalBytes }) {
  const { cancel, confirm, dialog } = controls(page, mode)
  const stageLabel = stages[stage]
  assert.ok(stageLabel)
  await expect(dialog.getByRole('status').getByText(stageLabel, { exact: true })).toBeVisible({
    timeout: operationTimeout,
  })
  await expect(confirm).toHaveCount(0)
  await expect(cancel).toBeEnabled()

  const { operation } = await getRuntimeSetupProgress(page)
  assert.ok(operation)
  assert.equal(operation.mode, mode)
  assert.equal(operation.stage, stage)
  assert.equal(operation.state, 'running')
  if (totalBytes !== undefined) {
    assert.equal(operation.bytesTotal, totalBytes)
    assert.ok(Number.isSafeInteger(operation.bytesDownloaded))
    assert.ok(operation.bytesDownloaded >= (minimumBytes ?? 0))
    assert.ok(operation.bytesDownloaded <= totalBytes)
    await expect(
      dialog.getByText(`${shownBytes(operation.bytesDownloaded)} of ${shownBytes(totalBytes)}`, {
        exact: true,
      }),
    ).toBeVisible()
    await expect(dialog.locator('[aria-label="Current download progress"]')).toBeVisible()
  }
  return operation
}

export async function cancelRuntimeSetupTransfer(page, mode) {
  const { cancel, confirm } = controls(page, mode)
  await expect(confirm).toHaveCount(0)
  await expect(cancel).toBeEnabled()
  await cancel.click()
}

export async function waitForRuntimeSetupCancelled(page, mode) {
  const { dialog } = controls(page, mode)
  await expect(dialog).toBeHidden({ timeout: operationTimeout })
  await expect(page.getByText('Runtime setup was canceled.', { exact: true })).toBeVisible()
  const { operation } = await getRuntimeSetupProgress(page)
  assert.equal(operation?.state, 'canceled')
  assert.equal(operation.mode, mode)
  return operation
}

export async function waitForRuntimeSetupError(page, mode, expectedMessage) {
  const { dialog, notice } = controls(page, mode)
  await expect(dialog).toBeHidden({ timeout: operationTimeout })
  const message = notice.getByText(expectedMessage, { exact: true })
  await expect(message).toBeVisible({ timeout: reviewTimeout })
  return await message.innerText()
}
