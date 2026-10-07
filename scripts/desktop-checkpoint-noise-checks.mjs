/** Real renderer/IPC/Main/SQLite checks with catalog-only tiny files; no inference or GPU work. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect } from '@playwright/test'
import Database from 'better-sqlite3'

export async function checkCheckpointNoisePolicy({
  checkpointVersions,
  packagePath,
  projectId,
  projectTitle,
  window,
}) {
  const region = window.getByRole('region', { name: `Project ${projectTitle}`, exact: true })
  const manager = window.getByRole('dialog', { name: 'Model Manager', exact: true })
  await region.locator('[aria-label="Generation model"]').click()
  await window.getByText('Illustrious Smoke Checkpoint', { exact: true }).last().click()
  const tab = async () => {
    const result = await window.evaluate((id) => window.api.projects.open(id), projectId)
    assert.equal(result.ok, true)
    return result.value.tab
  }
  await expect
    .poll(async () => (await tab()).generationDraft.model?.localVersionId)
    .toBe(checkpointVersions.first.versionId)
  const before = await tab()
  const packageBefore = readFileSync(packagePath)
  await region.getByRole('button', { name: 'Manage Models', exact: true }).click()
  const first = manager.locator('.version-row--project')
  const second = manager.locator('.version-row').filter({ hasText: 'v902' })
  const ztsnr = first.getByRole('switch', { name: 'ZTSNR for v901', exact: true })
  await expect(ztsnr).not.toBeChecked()
  await expect(first.locator('.checkpoint-noise-controls')).toContainText('Assumed default')
  await ztsnr.click()
  await expect(ztsnr).toBeChecked()
  await expect(
    first.getByRole('button', { name: 'Reset ZTSNR for v901', exact: true }),
  ).toBeVisible()
  await first.locator('[aria-label="Timestep spacing for v901"]').click()
  await window.locator('.n-base-select-menu').getByText('Trailing', { exact: true }).click()
  await expect(first.locator('[aria-label="Timestep spacing for v901"]')).toContainText('Trailing')
  await expect(
    second.getByRole('switch', { name: 'ZTSNR for v902', exact: true }),
  ).not.toBeChecked()
  await expect(second.locator('[aria-label="Timestep spacing for v902"]')).toContainText('Leading')
  if (process.env.IMAGEGEN_MODEL_HANDOFF_ARTIFACTS) {
    await window.screenshot({
      animations: 'disabled',
      path: path.join(
        process.env.IMAGEGEN_MODEL_HANDOFF_ARTIFACTS,
        'checkpoint-noise-override.png',
      ),
    })
  }
  const geometry = await first.evaluate((row) => ({
    row: row.getBoundingClientRect().width,
    controls: row.querySelector('.checkpoint-noise-controls').getBoundingClientRect().width,
  }))
  assert.ok(geometry.controls > geometry.row * 0.8, 'Noise controls use the version card width')
  const catalog = await window.evaluate(() => window.api.models.getCatalog())
  assert.equal(catalog.ok, true)
  const version = catalog.value
    .flatMap((resource) => resource.versions)
    .find((value) => value.id === checkpointVersions.first.versionId)
  assert.deepEqual(version.noiseProfile, {
    effective: {
      schemaVersion: 1,
      baseSchedule: 'sdxl-scaled-linear-v1',
      rescaleBetasZeroSnr: true,
      timestepSpacing: 'trailing',
    },
    rescaleBetasZeroSnrSource: 'override',
    timestepSpacingSource: 'override',
  })
  const appData = path.dirname(path.dirname(checkpointVersions.firstPath))
  const sqlite = new Database(path.join(appData, 'database', 'app.sqlite'), { readonly: true })
  try {
    const stored = sqlite
      .prepare(
        'SELECT rescale_betas_zero_snr, timestep_spacing FROM checkpoint_noise_profile_override WHERE sha256 = ? AND size_bytes = ?',
      )
      .get(version.sha256, version.fileSizeBytes)
    assert.deepEqual(stored, { rescale_betas_zero_snr: 1, timestep_spacing: 'trailing' })
  } finally {
    sqlite.close()
  }
  assert.deepEqual((await tab()).generationDraft, before.generationDraft)
  assert.equal((await tab()).dirty, before.dirty)
  assert.ok(
    readFileSync(packagePath).equals(packageBefore),
    'Library noise edits must preserve explicit Save bytes',
  )
  await manager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await expect(manager).not.toBeVisible()
  await expect(region.getByText('ZTSNR: on · Spacing: trailing', { exact: true })).toBeVisible()
  if (process.env.IMAGEGEN_MODEL_HANDOFF_ARTIFACTS) {
    await window.screenshot({
      animations: 'disabled',
      path: path.join(
        process.env.IMAGEGEN_MODEL_HANDOFF_ARTIFACTS,
        'checkpoint-noise-project-readonly.png',
      ),
    })
  }
  await expect(region.getByRole('switch', { name: /ZTSNR/i })).toHaveCount(0)
  await expect(region.locator('[aria-label^="Timestep spacing for "]')).toHaveCount(0)
  await region.getByRole('button', { name: 'Manage Models', exact: true }).click()
  await expect(ztsnr).toBeChecked()
  await first.getByRole('button', { name: 'Reset ZTSNR for v901', exact: true }).click()
  await expect(ztsnr).not.toBeChecked()
  await expect(first.locator('[aria-label="Timestep spacing for v901"]')).toContainText('Trailing')
  await first.getByRole('button', { name: 'Reset timestep spacing for v901', exact: true }).click()
  await expect(first.locator('[aria-label="Timestep spacing for v901"]')).toContainText('Leading')
  await expect(first.getByRole('button', { name: /Reset (ZTSNR|timestep spacing)/ })).toHaveCount(0)
  await manager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await expect(manager).not.toBeVisible()
  await expect(
    region.getByText('ZTSNR: off (assumed) · Spacing: leading (assumed)', { exact: true }),
  ).toBeVisible()
  console.log(
    'PASS checkpoint noise: native controls → Main → persisted SQLite; independent resets and read-only Project values',
  )
}
