import { expect, type Locator, test } from '@playwright/test'

async function visibleBox(locator: Locator) {
  await expect(locator).toBeVisible()
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  return box!
}

function expectInside(
  outer: { height: number; width: number; x: number; y: number },
  inner: { height: number; width: number; x: number; y: number },
) {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - 1)
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - 1)
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 1)
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 1)
}

test('New Project and Project use the same preview frame without clipping nearby controls', async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1440 })
  await page.goto('/?prototype=home&scenario=first-run')
  await page.getByRole('button', { name: 'New Project' }).first().click()

  const dialog = page.getByRole('dialog', { name: 'New Project' })
  await expect(dialog).toBeVisible()
  await expect
    .poll(() => dialog.evaluate((element) => getComputedStyle(element).transform))
    .toBe('none')

  const newProject = dialog.locator('.resolution-control')
  await newProject.scrollIntoViewIfNeeded()
  const [newRoot, newFields, newPreview, newRatio, newLock, newWidth, newSwap, newHeight] =
    await Promise.all([
      visibleBox(newProject),
      visibleBox(newProject.locator('.resolution-fields')),
      visibleBox(newProject.getByRole('img', { name: 'Aspect ratio preview' })),
      visibleBox(newProject.getByLabel('Aspect ratio', { exact: true })),
      visibleBox(newProject.getByRole('button', { name: 'Lock aspect ratio' })),
      visibleBox(newProject.getByLabel('Canvas width', { exact: true })),
      visibleBox(newProject.getByRole('button', { name: 'Swap width and height' })),
      visibleBox(newProject.getByLabel('Canvas height', { exact: true })),
    ])

  expectInside(newRoot, newPreview)
  expectInside(await visibleBox(dialog), newPreview)
  expect(newPreview.x).toBeGreaterThanOrEqual(newFields.x + newFields.width)
  expect(newPreview.width).toBeGreaterThanOrEqual(195)
  expect(newPreview.width).toBeLessThanOrEqual(205)
  expect(newPreview.height).toBeGreaterThanOrEqual(130)
  expect(newPreview.height).toBeLessThanOrEqual(134)
  expect(newLock.x).toBeGreaterThanOrEqual(newRatio.x + newRatio.width)
  expect(
    Math.abs(newLock.y + newLock.height / 2 - (newRatio.y + newRatio.height / 2)),
  ).toBeLessThan(6)
  expect(newSwap.x).toBeGreaterThanOrEqual(newWidth.x + newWidth.width - 1)
  expect(newSwap.x + newSwap.width).toBeLessThanOrEqual(newHeight.x + 1)
  expect(
    Math.abs(newSwap.y + newSwap.height / 2 - (newWidth.y + newWidth.height / 2)),
  ).toBeLessThan(6)

  await page.goto('/?prototype=project')
  const project = page.locator('.resolution-control--expanded-preview')
  await project.scrollIntoViewIfNeeded()
  const [
    projectRoot,
    projectPreview,
    projectRatio,
    projectLock,
    projectWidth,
    projectSwap,
    projectHeight,
    fit,
  ] = await Promise.all([
    visibleBox(project),
    visibleBox(project.getByRole('img', { name: 'Aspect ratio preview' })),
    visibleBox(project.getByLabel('Aspect ratio', { exact: true })),
    visibleBox(project.getByRole('button', { name: 'Lock aspect ratio' })),
    visibleBox(project.getByLabel('Canvas width', { exact: true })),
    visibleBox(project.getByRole('button', { name: 'Swap canvas dimensions' })),
    visibleBox(project.getByLabel('Canvas height', { exact: true })),
    visibleBox(page.getByRole('button', { name: 'Fit canvas to visible layers' })),
  ])

  expectInside(projectRoot, projectPreview)
  expectInside(await visibleBox(page.locator('.settings-panel')), projectPreview)
  expect(Math.abs(projectPreview.width - newPreview.width)).toBeLessThan(1)
  expect(Math.abs(projectPreview.height - newPreview.height)).toBeLessThan(1)
  expect(projectPreview.width).toBeLessThan(projectRoot.width - 16)
  expect(
    Math.abs(
      projectPreview.x -
        projectRoot.x -
        (projectRoot.x + projectRoot.width - projectPreview.x - projectPreview.width),
    ),
  ).toBeLessThan(2)
  expect(projectPreview.y + projectPreview.height).toBeLessThan(projectRatio.y)
  expect(fit.y + fit.height).toBeLessThan(projectPreview.y)
  expect(projectLock.x).toBeGreaterThanOrEqual(projectRatio.x + projectRatio.width)
  expect(projectSwap.x).toBeGreaterThanOrEqual(projectWidth.x + projectWidth.width - 1)
  expect(projectSwap.x + projectSwap.width).toBeLessThanOrEqual(projectHeight.x + 1)
  expect(
    Math.abs(projectSwap.y + projectSwap.height / 2 - (projectHeight.y + projectHeight.height / 2)),
  ).toBeLessThan(6)
})
