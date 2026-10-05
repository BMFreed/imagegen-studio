/**
 * Built native resource handoff: renderer/Main/SQLite and the real .igs writer/loader remain real.
 * The caller seeds catalog-only checkpoint/LoRA/VAE/embedding files. Removing/restoring those exact
 * bytes simulates a completed external repair; this does not test download, repair installation,
 * inference compatibility, trained weights or GPU execution.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { expect } from '@playwright/test'

import { readIgsPackage } from '../src/main/projects/igs-package.ts'

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const typeLabels = { checkpoint: 'Checkpoints', embedding: 'Embeddings', lora: 'LoRA', vae: 'VAE' }

export async function checkModelResourceHandoff({
  application,
  checkpointVersions: fixture,
  packagePath,
  projectId,
  projectTitle,
  window,
}) {
  const artifacts = path.resolve(
    process.env.IMAGEGEN_MODEL_HANDOFF_ARTIFACTS ??
      mkdtempSync(path.join(os.tmpdir(), 'igs-model-handoff-evidence-')),
  )
  mkdirSync(artifacts, { recursive: true, mode: 0o700 })
  const reportPath = path.join(artifacts, 'report.json')
  const hashFiles = (files) =>
    Object.fromEntries(files.map((file) => [file, digest(readFileSync(file))]))
  const report = {
    checks: [],
    pageErrors: [],
    screenshots: [],
    sourceSha256: hashFiles([
      'scripts/desktop-model-handoff-checks.mjs',
      'scripts/smoke-desktop.mjs',
      'package.json',
    ]),
    bundleSha256: hashFiles([
      'dist/main/main.cjs',
      'dist/preload/preload.cjs',
      'dist/renderer/index.html',
      ...readdirSync('dist/renderer/assets')
        .filter((name) => /\.(?:js|css)$/.test(name))
        .map((name) => `dist/renderer/assets/${name}`),
    ]),
    boundary: {
      actual:
        'Built native Electron renderer/preload/Main, SQLite catalog/default, exact resource authoring, Project history, real .igs Save/readback and close/reopen, keyboard focus and tab selection.',
      fixtures:
        'Existing isolated desktop-smoke catalog-only bytes and development derivatives worker. Exact file loss/restoration is a controlled filesystem collaborator, not a CivitAI download/repair operation. No inference or GPU work.',
    },
  }
  const errors = []
  const onPageError = (error) => report.pageErrors.push(String(error))
  window.on('pageerror', onPageError)
  const region = window.getByRole('region', { name: `Project ${projectTitle}`, exact: true })
  const manager = window.getByRole('dialog', { name: 'Model Manager', exact: true })
  const positive = region.getByRole('textbox', { name: 'Positive prompt', exact: true })
  const loras = region.getByRole('region', { name: 'LoRAs', exact: true })
  const savedEmbeddingBytes = readFileSync(fixture.embeddingPath)
  const savedVaeBytes = readFileSync(fixture.vaePath)
  async function tab() {
    const result = await window.evaluate((id) => window.api.projects.open(id), projectId)
    assert.equal(result.ok, true, JSON.stringify(result))
    assert.equal(result.value.kind, 'opened')
    return result.value.tab
  }
  async function catalog() {
    const result = await window.evaluate(() => window.api.models.getCatalog())
    assert.equal(result.ok, true, JSON.stringify(result))
    return result.value
  }
  async function operationalSeed() {
    const result = await window.evaluate(
      (id) => window.api.projects.listGenerationResults(id),
      projectId,
    )
    assert.equal(result.ok, true, JSON.stringify(result))
    assert.equal(Object.hasOwn(result.value, 'lastActualSeed'), true)
    return result.value.lastActualSeed
  }
  async function screenshot(name) {
    const file = path.join(artifacts, `${name}.png`)
    await window.mouse.move(1, 1)
    await expect(
      window.locator('.n-popover').filter({ hasText: 'Browse prompt suggestions' }),
    ).toBeHidden()
    await window.screenshot({ animations: 'disabled', path: file })
    report.screenshots.push(file)
  }
  async function check(name, run) {
    try {
      await run()
      report.checks.push({ name, status: 'passed' })
      console.log(`PASS model handoff: ${name}`)
    } catch (error) {
      report.checks.push({ name, status: 'failed', error: String(error) })
      errors.push(error)
      await screenshot(`failed-${report.checks.length}`)
    }
  }
  const projectState = (value) => ({
    canUndo: value.canUndo,
    canRedo: value.canRedo,
    dirty: value.dirty,
    documentId: value.documentId,
    generationDraft: value.generationDraft,
    lastActualSeedSnapshot: value.lastActualSeedSnapshot,
    layers: value.layers,
    primaryBbox: value.primaryBbox,
  })
  async function roundtrip({
    label,
    button,
    type,
    selected,
    close = 'button',
    inside,
    afterCheck,
  }) {
    const before = projectState(await tab())
    const seedBefore = await operationalSeed()
    const packageBytes = readFileSync(packagePath)
    const savedDraft = (await readIgsPackage(packagePath)).project.generationDraft
    await check(`${label}: opens ${type} and exact selected version`, async () => {
      await expect(button).toHaveCount(1, { timeout: 1500 })
      await button.focus()
      await button.click()
      await expect(manager).toBeVisible()
      const filters = manager.getByRole('complementary', { name: 'Model filters', exact: true })
      await expect(
        filters.getByRole('button', { name: new RegExp(`^${typeLabels[type]} `) }),
      ).toHaveAttribute('aria-pressed', 'true')
      await expect(filters.getByRole('button', { name: /^All Models / })).toHaveAttribute(
        'aria-pressed',
        'false',
      )
      await expect(manager.getByPlaceholder('Search installed models')).toHaveValue('')
      await expect(filters.getByRole('button', { name: /^All \d/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await expect(manager.locator('.toolbar-field--family')).toContainText('All')
      if (selected) {
        const row = manager.locator('.version-row--project')
        await expect(row).toHaveCount(1)
        await expect(row).toContainText(selected.versionName)
        await expect(row).toContainText('Selected in Project')
        await expect(
          manager.getByRole('complementary', { name: 'Model details' }).locator('h2'),
        ).toHaveText(selected.name)
        await expect(manager.locator('.metadata-list dd').first()).toHaveText(selected.versionName)
      }
      await inside?.()
      if (selected) {
        await expect(manager.locator('.version-row--project')).toContainText(selected.versionName)
        await expect(manager.locator('.metadata-list dd').first()).toHaveText(selected.versionName)
      }
      await screenshot(label.replaceAll(' ', '-'))
      await afterCheck?.()
    })
    if (await manager.count()) {
      if (close === 'escape') await manager.press('Escape')
      else await manager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
      await expect(manager).toHaveCount(0)
      await check(`${label}: ${close} restores focus/tab and preserves Project/file`, async () => {
        await expect(button).toBeFocused()
        await expect(window.getByRole('tab', { name: projectTitle, exact: true })).toHaveAttribute(
          'aria-selected',
          'true',
        )
        assert.deepEqual(projectState(await tab()), before)
        assert.equal(await operationalSeed(), seedBefore)
        assert.deepEqual(readFileSync(packagePath), packageBytes)
        assert.deepEqual((await readIgsPackage(packagePath)).project.generationDraft, savedDraft)
      })
    }
  }
  const initial = await tab()
  async function save() {
    await region.getByRole('button', { name: 'Save Project', exact: true }).click()
    await expect.poll(async () => (await tab()).dirty).toBe(false)
    assert.deepEqual(
      (await readIgsPackage(packagePath)).project.generationDraft,
      (await tab()).generationDraft,
    )
  }
  async function setDefaultInManager(second) {
    const catalogResource = (await catalog()).find((resource) => resource.id === second.resourceId)
    const versionName = catalogResource.versions.find(
      (version) => version.id === second.versionId,
    ).name
    const versionRow = manager.locator('.version-row').filter({ hasText: versionName })
    await versionRow.getByRole('button', { name: 'Set Default', exact: true }).click()
    await expect(versionRow).toContainText('Default')
    await expect
      .poll(
        async () =>
          (await catalog()).find((resource) => resource.id === second.resourceId).defaultVersionId,
      )
      .toBe(second.versionId)
  }
  async function restoreInitialFixture() {
    // Restore this isolated handoff fixture through real authoring APIs and genuine Save/reopen.
    for (const lora of (await tab()).generationDraft.loras) {
      const result = await window.evaluate(
        ({ projectId, lora }) =>
          window.api.projects.removeGenerationLora(projectId, {
            resourceId: lora.resource.localModelId,
            versionId: lora.resource.localVersionId,
          }),
        { projectId, lora },
      )
      assert.equal(result.ok, true)
    }
    for (const [method, selection] of [
      ['setGenerationVae', null],
      ['setGenerationModel', null],
    ]) {
      const result = await window.evaluate(
        ({ method, projectId, selection }) => window.api.projects[method](projectId, selection),
        { method, projectId, selection },
      )
      assert.equal(result.ok, true)
    }
    await positive.fill(initial.generationDraft.positivePrompt.text)
    await positive.press('Tab')
    await expect.poll(async () => (await tab()).generationDraft).toEqual(initial.generationDraft)
    await save()
    for (const first of [fixture.first, fixture.lora, fixture.vae, fixture.embedding]) {
      const result = await window.evaluate(
        ({ resourceId, versionId }) => window.api.models.setDefaultVersion(resourceId, versionId),
        first,
      )
      assert.equal(result.ok, true)
    }
    await window.getByRole('button', { name: `Close ${projectTitle}`, exact: true }).click()
    await window.getByRole('button', { name: `Open ${projectTitle}`, exact: true }).click()
    await expect(region).toBeVisible()
    const restored = await tab()
    assert.deepEqual(restored.generationDraft, initial.generationDraft)
    assert.equal(restored.dirty, false)
    assert.equal(restored.canUndo, false)
    assert.equal(restored.canRedo, false)
  }
  try {
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1380, 900),
    )
    await check('Home keeps the general All Models entry point', async () => {
      const before = projectState(await tab())
      const bytes = readFileSync(packagePath)
      await window.getByRole('tab', { name: 'Home', exact: true }).click()
      const homeTrigger = window.getByRole('button', { name: 'Manage Models', exact: true })
      await homeTrigger.click()
      await expect(manager).toBeVisible()
      await expect(
        manager
          .getByRole('complementary', { name: 'Model filters', exact: true })
          .getByRole('button', { name: /^All Models / }),
      ).toHaveAttribute('aria-pressed', 'true')
      await expect(manager.locator('.version-row--project')).toHaveCount(0)
      await manager.press('Escape')
      await expect(manager).toHaveCount(0)
      await expect(homeTrigger).toBeFocused()
      await expect(window.getByRole('tab', { name: 'Home', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      await window.getByRole('tab', { name: projectTitle, exact: true }).click()
      assert.deepEqual(projectState(await tab()), before)
      assert.deepEqual(readFileSync(packagePath), bytes)
    })
    await roundtrip({
      label: 'empty checkpoint',
      button: region.getByRole('button', { name: 'Manage Models', exact: true }),
      type: 'checkpoint',
    })
    await roundtrip({
      label: 'LoRA header',
      button: loras.getByRole('button', { name: 'Manage LoRAs', exact: true }),
      type: 'lora',
      close: 'escape',
    })
    await region.getByText('Advanced Options', { exact: true }).click()
    await roundtrip({
      label: 'Embedded VAE',
      button: region.getByRole('button', { name: 'Open VAE in Models', exact: true }),
      type: 'vae',
      close: 'escape',
    })
    // Independent failures above establish the missing controls/filter behavior on the old bundle.
    if (errors.length) throw new AggregateError(errors, 'Empty resource handoff contract failed.')

    await region.locator('[aria-label="Generation model"]').click()
    await window.getByText('Illustrious Smoke Checkpoint', { exact: true }).last().click()
    await expect
      .poll(async () => (await tab()).generationDraft.model?.localVersionId)
      .toBe(fixture.first.versionId)
    await loras.locator('[aria-label="Add LoRA"]').click()
    await window.getByText('trigger 905', { exact: true }).last().click()
    await expect
      .poll(async () => (await tab()).generationDraft.loras[0]?.resource.localVersionId)
      .toBe(fixture.lora.versionId)
    await region.locator('[aria-label="VAE"]').first().click()
    await window
      .locator('.model-option')
      .filter({ hasText: 'Smoke External VAE' })
      .filter({ hasText: 'v907' })
      .click()
    await expect
      .poll(async () => (await tab()).generationDraft.vae?.localVersionId)
      .toBe(fixture.vae.versionId)
    await positive.fill('<smoke-checkpoint-v909>, handoff baseline')
    await positive.press('Tab')
    await expect
      .poll(
        async () =>
          (await tab()).generationDraft.positivePrompt.embeddingRefs[0]?.resource.localVersionId,
      )
      .toBe(fixture.embedding.versionId)
    await save()
    const beforeHandoffText = '<smoke-checkpoint-v909>, handoff baseline'
    const editedHandoffText = '<smoke-checkpoint-v909>, authored edit before manager'
    await positive.fill(editedHandoffText)
    await positive.press('Tab')
    await expect
      .poll(async () => (await tab()).generationDraft.positivePrompt.text)
      .toBe(editedHandoffText)

    await check('Project LoRA manager actions fit both supported viewports', async () => {
      for (const [width, height] of [
        [1380, 900],
        [900, 620],
      ]) {
        await application.evaluate(
          ({ BrowserWindow }, size) =>
            BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height),
          { width, height },
        )
        await expect
          .poll(() => window.evaluate(() => [innerWidth, innerHeight]))
          .toEqual([width, height])
        await loras.scrollIntoViewIfNeeded()
        await loras.getByRole('button', { name: 'Manage LoRAs', exact: true }).focus()
        const row = loras.getByRole('article', { name: 'LoRA Smoke Detail LoRA', exact: true })
        const actions = [
          loras.getByRole('button', { name: 'Manage LoRAs', exact: true }),
          row.getByRole('button', { name: 'Open Smoke Detail LoRA in Models', exact: true }),
          row.getByRole('button', { name: 'Remove Smoke Detail LoRA', exact: true }),
        ]
        for (const action of actions) {
          await expect(action).toBeVisible()
          const bounds = await action.boundingBox()
          assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1)
        }
        const rowGeometry = await row.evaluate((element) => ({
          left: element.getBoundingClientRect().left,
          right: element.getBoundingClientRect().right,
          actions: [...element.querySelectorAll('button')].map((button) => ({
            left: button.getBoundingClientRect().left,
            right: button.getBoundingClientRect().right,
          })),
        }))
        assert.ok(
          rowGeometry.actions.every(
            (action) =>
              action.left >= rowGeometry.left - 1 && action.right <= rowGeometry.right + 1,
          ),
        )
        await screenshot(`project-lora-entry-${width}x${height}`)
      }
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(1380, 900),
      )
    })

    await roundtrip({
      label: 'selected checkpoint',
      button: region.getByRole('button', { name: 'Manage Models', exact: true }),
      type: 'checkpoint',
      selected: { name: 'Illustrious Smoke Checkpoint', versionName: 'v901' },
      inside: () => setDefaultInManager(fixture.second, 'model'),
      afterCheck: async () => {
        const filters = manager.getByRole('complementary', { name: 'Model filters', exact: true })
        await filters.getByRole('button', { name: /^LoRA / }).click()
        await filters.getByRole('button', { name: /^Needs Attention / }).click()
        await manager.locator('.toolbar-field--family .n-base-selection').click()
        await window.getByText('Anima', { exact: true }).last().click()
        await manager
          .getByPlaceholder('Search installed models')
          .fill('deliberately absent checkpoint')
        await expect(manager).toContainText('No models match these filters')
      },
    })
    await roundtrip({
      label: 'checkpoint pinned after Default change',
      button: region.getByRole('button', { name: 'Manage Models', exact: true }),
      type: 'checkpoint',
      selected: { name: 'Illustrious Smoke Checkpoint', versionName: 'v901' },
      close: 'escape',
    })
    await roundtrip({
      label: 'selected LoRA',
      button: loras.getByRole('button', { name: 'Open Smoke Detail LoRA in Models', exact: true }),
      type: 'lora',
      selected: { name: 'Smoke Detail LoRA', versionName: 'v905' },
      close: 'escape',
      inside: () => setDefaultInManager(fixture.loraSecond, 'loras'),
    })
    await roundtrip({
      label: 'selected external VAE',
      button: region.getByRole('button', { name: 'Open VAE in Models', exact: true }),
      type: 'vae',
      selected: { name: 'Smoke External VAE', versionName: 'v907' },
      inside: () => setDefaultInManager(fixture.vaeSecond, 'vae'),
    })

    rmSync(fixture.embeddingPath)
    rmSync(fixture.vaePath)
    await region.getByRole('button', { name: 'Refresh models', exact: true }).click()
    await expect(region.getByRole('region', { name: 'VAE settings', exact: true })).toContainText(
      'Exact VAE version unavailable',
    )
    const token = '<smoke-checkpoint-v909>'
    await expect(
      region.getByRole('region', { name: 'Positive prompt embedding diagnostics', exact: true }),
    ).toContainText('The exact embedding is missing.')
    await roundtrip({
      label: 'missing selected embedding',
      button: region.getByRole('button', { name: `Manage embedding ${token}`, exact: true }),
      type: 'embedding',
      selected: { name: 'Smoke Prompt Embedding', versionName: 'v909' },
      close: 'escape',
      inside: async () => {
        const secondRow = manager.locator('.version-row').filter({ hasText: 'v910' })
        await secondRow.getByRole('button', { name: 'Set Default', exact: true }).click()
        await expect(secondRow).toContainText('Default')
      },
    })
    await roundtrip({
      label: 'missing external VAE repaired in manager',
      button: region.getByRole('button', { name: 'Open VAE in Models', exact: true }),
      type: 'vae',
      selected: { name: 'Smoke External VAE', versionName: 'v907' },
      close: 'escape',
      inside: async () => {
        await expect(manager.locator('.version-row--project')).toContainText('missing')
        writeFileSync(fixture.embeddingPath, savedEmbeddingBytes)
        writeFileSync(fixture.vaePath, savedVaeBytes)
      },
    })
    await check(
      'return catalog refresh observes repaired exact files without replacing saved selections',
      async () => {
        await expect(
          region.getByRole('region', {
            name: 'Positive prompt embedding diagnostics',
            exact: true,
          }),
        ).toHaveCount(0)
        await expect(
          region.getByRole('region', { name: 'VAE settings', exact: true }),
        ).not.toContainText('Exact VAE version unavailable')
        const after = await tab()
        assert.equal(
          after.generationDraft.positivePrompt.embeddingRefs[0].resource.localVersionId,
          fixture.embedding.versionId,
        )
        assert.equal(after.generationDraft.vae.localVersionId, fixture.vae.versionId)
        assert.equal(after.dirty, true)
        await region.locator('[aria-label="VAE"]').first().click()
        const repaired = window
          .locator('.model-option')
          .filter({ hasText: 'Smoke External VAE' })
          .filter({ hasText: 'v907' })
        const currentDefault = window
          .locator('.model-option')
          .filter({ hasText: 'Smoke External VAE' })
          .filter({ hasText: 'v908' })
        await expect(repaired).toContainText('Installed')
        await expect(currentDefault).toContainText('Default')
        await region.locator('[aria-label="VAE"]').first().press('Escape')
        await screenshot('return-repaired-resource-catalog')
      },
    )
    await check(
      'Undo and Redo still address the last authored prompt after every manager roundtrip',
      async () => {
        const before = (await tab()).generationDraft
        const history = region.getByRole('toolbar', { name: 'Project history', exact: true })
        await history.getByRole('button', { name: 'Undo', exact: true }).click()
        await expect
          .poll(async () => (await tab()).generationDraft.positivePrompt.text)
          .toBe(beforeHandoffText)
        await history.getByRole('button', { name: 'Redo', exact: true }).click()
        await expect.poll(async () => (await tab()).generationDraft).toEqual(before)
      },
    )
    await save()
    await check(
      'real close/reopen preserves exact references and restored authoring baseline',
      async () => {
        const savedDraft = (await tab()).generationDraft
        await window.getByRole('button', { name: `Close ${projectTitle}`, exact: true }).click()
        await expect(window.getByRole('tab', { name: projectTitle, exact: true })).toHaveCount(0)
        await window.getByRole('button', { name: `Open ${projectTitle}`, exact: true }).click()
        assert.deepEqual((await tab()).generationDraft, savedDraft)
        assert.deepEqual((await readIgsPackage(packagePath)).project.generationDraft, savedDraft)
      },
    )
    await check(
      'original one-project handoff fixture is restored after the checks',
      restoreInitialFixture,
    )
    if (errors.length)
      throw new AggregateError(errors, 'Selected resource handoff contract failed.')
    assert.deepEqual(report.pageErrors, [])
    report.status = 'passed'
  } catch (error) {
    report.status = 'failed'
    report.error = String(error)
    throw error
  } finally {
    writeFileSync(fixture.embeddingPath, savedEmbeddingBytes)
    writeFileSync(fixture.vaePath, savedVaeBytes)
    window.off('pageerror', onPageError)
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`Model handoff evidence: ${reportPath}`)
  }
  return report
}
