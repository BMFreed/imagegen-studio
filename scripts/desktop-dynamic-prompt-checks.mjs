import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { expect } from '@playwright/test'

import { readIgsPackage } from '../src/main/projects/igs-package.ts'

const CHANGED_SETTINGS = { maxPrompts: 3, seedBehavior: 'per-prompt' }

async function openTab(window, projectId) {
  const result = await window.evaluate((id) => window.api.projects.open(id), projectId)
  assert.equal(result.ok, true)
  assert.equal(result.value.kind, 'opened')
  return result.value.tab
}

async function waitForDraft(window, projectId, predicate) {
  await expect
    .poll(async () => predicate((await openTab(window, projectId)).generationDraft))
    .toBe(true)
}

async function openPreview(card, window) {
  await card.getByRole('button', { name: 'Preview dynamic prompt' }).click()
  const dialog = window.getByRole('dialog', { name: 'Dynamic Prompt Preview' })
  await expect(dialog).toBeVisible()
  return dialog
}

async function closePreview(dialog) {
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toBeHidden()
}

async function expectPairs(dialog, pairs) {
  const articles = dialog.locator('article')
  await expect(articles).toHaveCount(pairs.length)
  for (const [index, positive, negative] of pairs.map((pair, index) => [index, ...pair])) {
    await expect(articles.nth(index)).toContainText(positive)
    await expect(articles.nth(index)).toContainText(negative)
  }
}

async function expectInsideViewport(window, locator, label) {
  await expect(locator).toBeVisible()
  const box = await locator.boundingBox()
  assert.ok(box, `${label} has no visible box`)
  const viewport = await window.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  assert.ok(box.x >= 0 && box.y >= 0, `${label} starts outside the viewport`)
  assert.ok(
    box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1,
    `${label} is clipped at ${viewport.width} × ${viewport.height}`,
  )
}

/**
 * Native renderer → typed IPC → Project → real .igs checks. The caller has just saved its prompt
 * action baseline; restore those prompt strings before returning to keep later smoke independent.
 */
export async function checkDynamicPromptPreview({
  application,
  packagePath,
  projectId,
  projectRegion,
  projectTitle,
  window,
}) {
  const positive = projectRegion.getByRole('textbox', { name: 'Positive prompt', exact: true })
  const negative = projectRegion.getByRole('textbox', { name: 'Negative prompt', exact: true })
  const positiveCard = projectRegion.getByRole('region', {
    name: 'Positive prompt editor',
    exact: true,
  })
  const negativeCard = projectRegion.getByRole('region', {
    name: 'Negative prompt editor',
    exact: true,
  })
  const history = projectRegion.getByRole('toolbar', { name: 'Project history' })
  const originalPositive = (await positive.textContent()) ?? ''
  const originalNegative = (await negative.textContent()) ?? ''
  const savedBytes = readFileSync(packagePath)
  const startingTab = await openTab(window, projectId)
  assert.equal(startingTab.dirty, false)
  let dialog = await openPreview(positiveCard, window)
  await closePreview(dialog)
  const cleanPreviewTab = await openTab(window, projectId)
  assert.deepEqual(cleanPreviewTab.generationDraft, startingTab.generationDraft)
  assert.equal(cleanPreviewTab.dirty, false)
  assert.equal(cleanPreviewTab.canUndo, startingTab.canUndo)
  assert.equal(cleanPreviewTab.canRedo, startingTab.canRedo)
  assert.deepEqual(cleanPreviewTab.lastActualSeedSnapshot, startingTab.lastActualSeedSnapshot)
  assert.deepEqual(readFileSync(packagePath), savedBytes)

  await positive.fill('{red|blue} lantern')
  await negative.fill('{blur|noise}')
  await waitForDraft(
    window,
    projectId,
    (draft) =>
      draft.positivePrompt.text === '{red|blue} lantern' &&
      draft.negativePrompt.text === '{blur|noise}',
  )
  const beforePreview = await openTab(window, projectId)
  assert.equal(beforePreview.dirty, true)
  assert.deepEqual(readFileSync(packagePath), savedBytes, 'Preview source edits require Save')

  dialog = await openPreview(positiveCard, window)
  await expect(dialog).toContainText('4 concrete prompt pairs')
  await expect(dialog).toContainText('4 jobs · 1 iteration · limit 32')
  const fourPairs = [
    ['red lantern', 'blur'],
    ['red lantern', 'noise'],
    ['blue lantern', 'blur'],
    ['blue lantern', 'noise'],
  ]
  await expectPairs(dialog, fourPairs)
  await closePreview(dialog)
  const afterPreview = await openTab(window, projectId)
  assert.deepEqual(afterPreview.generationDraft, beforePreview.generationDraft)
  assert.equal(afterPreview.dirty, beforePreview.dirty)
  assert.equal(afterPreview.canUndo, beforePreview.canUndo)
  assert.equal(afterPreview.canRedo, beforePreview.canRedo)
  assert.deepEqual(afterPreview.lastActualSeedSnapshot, beforePreview.lastActualSeedSnapshot)
  assert.deepEqual(readFileSync(packagePath), savedBytes)

  dialog = await openPreview(negativeCard, window)
  await expectPairs(dialog, fourPairs)
  const maxPrompts = dialog.locator('input[aria-label="Maximum dynamic prompts"]')
  await maxPrompts.fill('3')
  await maxPrompts.press('Enter')
  await waitForDraft(window, projectId, (draft) => draft.dynamicPrompt?.maxPrompts === 3)
  await dialog.locator('[aria-label="Dynamic prompt seed behavior"]').click()
  await window.getByText('Per prompt', { exact: true }).last().click()
  await waitForDraft(
    window,
    projectId,
    (draft) =>
      draft.dynamicPrompt?.maxPrompts === 3 && draft.dynamicPrompt.seedBehavior === 'per-prompt',
  )
  await expect(dialog).toContainText('3 concrete prompt pairs')
  await expect(dialog).toContainText('3 jobs · 1 iteration · limit 32')
  await expect(dialog.getByText('Preview truncated at the configured maximum')).toBeVisible()
  await expectPairs(dialog, fourPairs.slice(0, 3))
  await closePreview(dialog)

  await history.getByRole('button', { name: 'Undo' }).click()
  await waitForDraft(
    window,
    projectId,
    (draft) => draft.dynamicPrompt?.seedBehavior === 'per-iteration',
  )
  await history.getByRole('button', { name: 'Undo' }).click()
  await waitForDraft(window, projectId, (draft) => draft.dynamicPrompt?.maxPrompts === 100)
  await history.getByRole('button', { name: 'Redo' }).click()
  await waitForDraft(window, projectId, (draft) => draft.dynamicPrompt?.maxPrompts === 3)
  await history.getByRole('button', { name: 'Redo' }).click()
  await waitForDraft(
    window,
    projectId,
    (draft) => draft.dynamicPrompt?.seedBehavior === 'per-prompt',
  )
  assert.deepEqual(
    (await openTab(window, projectId)).generationDraft.dynamicPrompt,
    CHANGED_SETTINGS,
  )

  await positive.fill('{red|')
  await negative.fill('noise')
  dialog = await openPreview(positiveCard, window)
  await expect(dialog.getByText('Could not expand prompts')).toBeVisible()
  await expect(positive).toHaveText('{red|')
  await closePreview(dialog)

  await positive.fill('{p1|p2|p3|p4|p5|p6|p7|p8|p9}')
  await negative.fill('{n1|n2|n3|n4}')
  dialog = await openPreview(negativeCard, window)
  await maxPrompts.fill('100')
  await maxPrompts.press('Enter')
  await waitForDraft(window, projectId, (draft) => draft.dynamicPrompt?.maxPrompts === 100)
  await expect(dialog.getByText('Too many generation jobs')).toBeVisible()
  await expect(negative).toHaveText('{n1|n2|n3|n4}')
  await closePreview(dialog)

  const longAlternatives = Array.from({ length: 8 }, (_, index) =>
    `long positive alternative ${index + 1} ${'lantern light '.repeat(12)}`.trim(),
  )
  await positive.fill(`{${longAlternatives.join('|')}}`)
  dialog = await openPreview(positiveCard, window)
  await expect(dialog).toContainText('32 concrete prompt pairs')
  await expect(dialog).toContainText('32 jobs · 1 iteration · limit 32')
  await expectPairs(dialog, [
    ...longAlternatives
      .map((positiveText) =>
        ['n1', 'n2', 'n3', 'n4'].map((negativeText) => [positiveText, negativeText]),
      )
      .flat(),
  ])
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(900, 620),
  )
  try {
    await window.waitForFunction(() => innerWidth === 900)
    await expectInsideViewport(window, dialog, 'Dynamic prompt dialog')
    await expectInsideViewport(window, maxPrompts, 'Maximum dynamic prompts')
    await expectInsideViewport(
      window,
      dialog.locator('[aria-label="Dynamic prompt seed behavior"]'),
      'Seed behavior selector',
    )
    await expectInsideViewport(
      window,
      dialog.getByRole('button', { name: 'Close', exact: true }),
      'Close button',
    )
    await dialog.locator('article').last().scrollIntoViewIfNeeded()
    await expect(dialog.locator('article').last()).toBeInViewport()
    if (process.env.IMAGEGEN_SMOKE_DYNAMIC_SCREENSHOT) {
      await window.waitForTimeout(350)
      await window.screenshot({
        path: process.env.IMAGEGEN_SMOKE_DYNAMIC_SCREENSHOT.replace('.png', '-small.png'),
      })
    }
  } finally {
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1380, 900),
    )
    await window.waitForFunction(() => innerWidth === 1380)
  }
  if (process.env.IMAGEGEN_SMOKE_DYNAMIC_SCREENSHOT) {
    await window.waitForTimeout(350)
    await window.screenshot({ path: process.env.IMAGEGEN_SMOKE_DYNAMIC_SCREENSHOT })
  }
  await closePreview(dialog)

  // Persist authored source and settings through the real package writer and loader.
  await positive.fill('{red|blue} lantern')
  await negative.fill('{blur|noise}')
  dialog = await openPreview(negativeCard, window)
  await maxPrompts.fill('3')
  await maxPrompts.press('Enter')
  await waitForDraft(window, projectId, (draft) => draft.dynamicPrompt?.maxPrompts === 3)
  await closePreview(dialog)
  assert.deepEqual(readFileSync(packagePath), savedBytes, 'The .igs changed before explicit Save')
  await projectRegion.getByRole('button', { name: 'Save Project' }).click()
  await projectRegion.getByText('Saved', { exact: true }).waitFor()
  const persisted = await readIgsPackage(packagePath)
  assert.equal(persisted.project.generationDraft.positivePrompt.text, '{red|blue} lantern')
  assert.equal(persisted.project.generationDraft.negativePrompt.text, '{blur|noise}')
  assert.deepEqual(persisted.project.generationDraft.dynamicPrompt, CHANGED_SETTINGS)
  await window.getByRole('button', { name: `Close ${projectTitle}` }).click()
  await window.getByRole('tab', { name: projectTitle }).waitFor({ state: 'detached' })
  await window.getByRole('button', { name: `Open ${projectTitle}` }).click()
  await expect(positive).toHaveText('{red|blue} lantern')
  await expect(negative).toHaveText('{blur|noise}')
  assert.deepEqual(
    (await openTab(window, projectId)).generationDraft.dynamicPrompt,
    CHANGED_SETTINGS,
  )
  dialog = await openPreview(positiveCard, window)
  await expect(dialog).toContainText('3 concrete prompt pairs')
  await closePreview(dialog)
  assert.equal((await openTab(window, projectId)).dirty, false)

  // The caller's later prompt checks still start from their known authored baseline.
  await positive.fill(originalPositive)
  await negative.fill(originalNegative)
  await waitForDraft(
    window,
    projectId,
    (draft) =>
      draft.positivePrompt.text === originalPositive &&
      draft.negativePrompt.text === originalNegative,
  )
  await projectRegion.getByRole('button', { name: 'Save Project' }).click()
  await projectRegion.getByText('Saved', { exact: true }).waitFor()
  assert.deepEqual(
    (await readIgsPackage(packagePath)).project.generationDraft.dynamicPrompt,
    CHANGED_SETTINGS,
  )
}
