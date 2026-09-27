import assert from 'node:assert/strict'
import { expect } from '@playwright/test'

async function atWindowSizes(application, page, check) {
  const original = await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].getContentSize(),
  )
  try {
    for (const size of [[900, 620], [1440, 900], [1920, 1080]]) {
      await application.evaluate(({ BrowserWindow }, [width, height]) =>
        BrowserWindow.getAllWindows()[0].setContentSize(width, height), size)
      await expect.poll(() => page.evaluate(() => [innerWidth, innerHeight])).toEqual(size)
      await check()
    }
  } finally {
    await application.evaluate(({ BrowserWindow }, [width, height]) =>
      BrowserWindow.getAllWindows()[0].setContentSize(width, height), original)
  }
}

// Production renderer → native Electron window. Geometry is measured after resize, not inferred
// from CSS declarations. Neighboring control: the populated manager and feedback state below.
export async function checkHomeLayout(application, page) {
  const home = page.getByRole('region', { name: 'Home', exact: true })
  await expect(home.getByText('No projects yet', { exact: true })).toBeVisible()
  await atWindowSizes(application, page, async () => {
    const bounds = await home.locator('.browser-state').evaluate((state) => {
      const box = (element) => element.getBoundingClientRect()
      const parent = box(state)
      const elements = ['.n-empty__icon', '.n-empty__description', '.n-empty__extra button']
        .map((selector) => box(state.querySelector(selector)))
      return {
        centers: elements.map((rect) => rect.x + rect.width / 2),
        center: parent.x + parent.width / 2,
        bottom: elements.at(-1).bottom,
        availableBottom: parent.bottom,
      }
    })
    assert.ok(bounds.centers.every((center) => Math.abs(center - bounds.center) < 1),
      'Empty-state icon, message and action must share the browser center')
    assert.ok(bounds.bottom <= bounds.availableBottom, 'The empty-state action must stay reachable')
    await expect(home.locator('.n-button--primary-type')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Set up', exact: true })).not.toHaveClass(/primary-type/)
  })
}

export async function checkModelManagerLayout(application, page) {
  const manager = page.getByRole('dialog', { name: 'Model Manager', exact: true })
  await atWindowSizes(application, page, async () => {
    await expect.poll(() => manager.evaluate((shell) => getComputedStyle(shell).transform)).toBe('none')
    // NModal animates on open. Poll actual geometry so transition timing cannot hide a regression.
    await expect.poll(() => manager.evaluate((shell) => {
      const shellRect = shell.getBoundingClientRect()
      const body = shell.querySelector('.manager-body').getBoundingClientRect()
      return Math.abs(body.bottom - (shellRect.bottom - 1))
    })).toBeLessThan(1)
    const geometry = await manager.evaluate((shell) => {
      const body = shell.querySelector('.manager-body').getBoundingClientRect()
      const panels = ['.manager-navigation', '.resource-panel', '.details-panel']
        .map((selector) => shell.querySelector(selector).getBoundingClientRect())
      return {
        bottom: body.bottom,
        panels: panels.map((rect) => ({ bottom: rect.bottom, width: rect.width })),
        overflow: [...shell.querySelectorAll('.list-toolbar, .details-scroll, .n-card-header')]
          .filter((element) => element.scrollWidth > element.clientWidth + 2)
          .map((element) => element.className),
      }
    })
    assert.ok(geometry.panels.every((panel) => Math.abs(panel.bottom - geometry.bottom) < 1),
      'All manager panes must fill the modal body, with or without feedback')
    assert.ok(geometry.panels[1].width >= 320 && geometry.panels[2].width >= 277,
      'Resizing the window must leave room for list and details controls')
    assert.deepEqual(geometry.overflow, [], 'Manager controls must not overflow their panels')
  })
}

export async function checkNewProjectResolution(page) {
  const dialog = page.getByRole('dialog', { name: 'New Project', exact: true })
  await dialog.getByLabel('Aspect ratio', { exact: true }).click()
  await page.locator('.n-base-select-option').filter({ hasText: /^5:4$/ }).click()
  await dialog.getByLabel('Project width', { exact: true }).fill('640')
  await expect(dialog.getByLabel('Project height', { exact: true })).toHaveValue('512')
  await dialog.getByRole('button', { name: 'Swap width and height', exact: true }).click()
  await expect(dialog.getByLabel('Project height', { exact: true })).toHaveValue('640')
  await expect(dialog.getByLabel('Project width', { exact: true })).toHaveValue('512')
  await expect(dialog.getByLabel('Aspect ratio', { exact: true })).toContainText('4:5')
  await dialog.getByRole('button', { name: 'Swap width and height', exact: true }).click()
  const rect = await dialog.locator('.aspect-preview rect').evaluate((element) => ({
    width: Number(element.getAttribute('width')),
    height: Number(element.getAttribute('height')),
  }))
  assert.ok(Math.abs(rect.width / rect.height - 5 / 4) < 0.001)
  await dialog.getByRole('button', { name: 'Unlock aspect ratio', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Lock aspect ratio', exact: true })).toBeVisible()
  // The closed select must not introduce a scrollable modal root or move the footer.
  assert.equal(await dialog.evaluate((element) => getComputedStyle(element).overflowY), 'visible')
  await expect(dialog.getByRole('button', { name: 'Create Project', exact: true })).toBeInViewport()
}
