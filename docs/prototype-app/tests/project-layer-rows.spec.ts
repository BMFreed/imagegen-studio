import { expect, test } from '@playwright/test'

test('regional rows keep independent actions and editors when another region is added', async ({
  page,
}) => {
  await page.setViewportSize({ height: 1000, width: 1440 })
  await page.goto('/?prototype=project')
  const first = page
    .locator('.regional-row')
    .filter({ has: page.getByRole('button', { exact: true, name: 'Select Face lighting' }) })
  const firstPrompt = first.getByRole('textbox', { exact: true, name: 'Regional prompt' })
  const original = await firstPrompt.inputValue()
  await page.getByRole('button', { exact: true, name: 'Add Regional Guidance' }).click()
  const second = page
    .locator('.regional-row')
    .filter({ has: page.getByRole('button', { exact: true, name: 'Select Regional Guidance' }) })
  await second.getByRole('button', { exact: true, name: 'Prompt' }).click()
  await second
    .getByRole('textbox', { exact: true, name: 'Regional prompt' })
    .fill('background mist')
  await first.getByRole('button', { exact: true, name: 'Select Face lighting' }).click()
  await expect(second.getByRole('textbox', { exact: true, name: 'Regional prompt' })).toHaveValue(
    'background mist',
  )
  await expect(firstPrompt).toHaveValue(original)
  await second
    .getByRole('button', { exact: true, name: 'Layer actions for Regional Guidance' })
    .click()
  await page.getByText('Delete region', { exact: true }).click()
  await expect(second).toHaveCount(0)
  await expect(firstPrompt).toHaveValue(original)
  await page.getByRole('button', { exact: true, name: 'Undo' }).click()
  await expect(second.getByRole('textbox', { exact: true, name: 'Regional prompt' })).toHaveValue(
    'background mist',
  )
})

test('layer details stay visible and row positions stay stable while selecting different types', async ({
  page,
}) => {
  await page.setViewportSize({ height: 1000, width: 1440 })
  await page.goto('/?prototype=project')
  const region = page.locator('.regional-row')
  const patch = page.locator('.layer-row').filter({ hasText: 'Hand Repair Patch' })
  await expect(region.getByRole('textbox', { exact: true, name: 'Regional prompt' })).toBeVisible()
  await expect(region.getByRole('button', { exact: true, name: 'Reference Image' })).toBeVisible()
  await expect(patch.getByText('Internal size', { exact: true })).toBeVisible()
  const geometry = () =>
    page.locator('.entity-surface').evaluateAll((elements) =>
      elements.map((element) => ({
        height: element.getBoundingClientRect().height,
        top:
          element.getBoundingClientRect().top -
          element.closest('.panel-stack')!.getBoundingClientRect().top,
      })),
    )
  const before = await geometry()
  for (const name of ['Face lighting', 'Hand Repair Patch', 'Highlight Pass', 'Portrait Base']) {
    await page.getByRole('button', { exact: true, name: `Select ${name}` }).click()
    expect(await geometry()).toEqual(before)
    await expect(
      region.getByRole('textbox', { exact: true, name: 'Regional prompt' }),
    ).toBeVisible()
    await expect(patch.getByText('Internal size', { exact: true })).toBeVisible()
  }
  const warning = (await region
    .getByLabel('Regional Guidance compatibility warning')
    .locator('svg')
    .boundingBox())!
  const lock = (await region
    .getByRole('button', { exact: true, name: 'Lock Face lighting' })
    .locator('svg')
    .boundingBox())!
  expect(warning.y + warning.height / 2).toBeCloseTo(lock.y + lock.height / 2, 0)
})

test('whole layer surfaces hover and select while nested controls keep the current selection', async ({
  page,
}) => {
  await page.setViewportSize({ height: 1000, width: 1440 })
  await page.goto('/?prototype=project')
  const row = (name: string) =>
    page
      .locator('.entity-surface')
      .filter({ has: page.getByRole('button', { exact: true, name: `Select ${name}` }) })
  const selected = (name: string) =>
    page.getByRole('button', { exact: true, name: `Select ${name}` })
  const region = row('Face lighting')
  const patch = row('Hand Repair Patch')
  const raster = row('Highlight Pass')
  const regionalDetails = region.locator('.entity-details')
  const regionalDetailsBox = (await regionalDetails.boundingBox())!
  const regionalBottom = { x: 3, y: regionalDetailsBox.height - 3 }
  const idleBackground = await region.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  )

  await regionalDetails.hover({ position: regionalBottom })
  await expect
    .poll(() => region.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe(idleBackground)
  const regionTitle = region.locator('.entity-title')
  const regionTitleColor = await regionTitle.evaluate((element) => getComputedStyle(element).color)
  await expect(region).toHaveCSS('cursor', 'default')
  await selected('Face lighting').hover()
  await page.waitForTimeout(220)
  await expect(selected('Face lighting')).toHaveCSS('cursor', 'default')
  await expect(regionTitle).toHaveCSS('color', regionTitleColor)
  await regionalDetails.click({ position: regionalBottom })
  await expect(selected('Face lighting')).toHaveAttribute('aria-pressed', 'true')

  await selected('Portrait Base').click()
  await region.getByRole('textbox', { exact: true, name: 'Regional prompt' }).click()
  await expect(selected('Portrait Base')).toHaveAttribute('aria-pressed', 'true')
  await region.getByRole('button', { exact: true, name: 'Hide Face lighting' }).click()
  await expect(
    region.getByRole('button', { exact: true, name: 'Show Face lighting' }),
  ).toBeVisible()
  await expect(selected('Portrait Base')).toHaveAttribute('aria-pressed', 'true')

  const patchDetails = patch.locator('.entity-details')
  const patchDetailsBox = (await patchDetails.boundingBox())!
  await patchDetails.hover({ position: { x: 3, y: patchDetailsBox.height - 3 } })
  const patchTitle = patch.locator('.entity-title')
  const patchTitleColor = await patchTitle.evaluate((element) => getComputedStyle(element).color)
  await selected('Hand Repair Patch').hover()
  await page.waitForTimeout(220)
  await expect(selected('Hand Repair Patch')).toHaveCSS('cursor', 'default')
  await expect(patchTitle).toHaveCSS('color', patchTitleColor)
  await patchDetails.click({ position: { x: 3, y: patchDetailsBox.height - 3 } })
  await expect(selected('Hand Repair Patch')).toHaveAttribute('aria-pressed', 'true')
  await raster.click({ position: { x: 1, y: 1 } })
  await expect(selected('Highlight Pass')).toHaveAttribute('aria-pressed', 'true')
  await patch.getByRole('button', { name: /Browse/ }).click()
  await expect(selected('Highlight Pass')).toHaveAttribute('aria-pressed', 'true')
})

test('editing an unselected region changes only that region and shared actions use their own row', async ({
  page,
}) => {
  await page.setViewportSize({ height: 1000, width: 1440 })
  await page.goto('/?prototype=project')
  const globalPrompt = page.getByRole('textbox', { exact: true, name: 'Prompt' })
  const globalText = await globalPrompt.textContent()
  const regionalPrompt = page.getByRole('textbox', { exact: true, name: 'Regional prompt' })
  const original = await regionalPrompt.inputValue()
  await regionalPrompt.fill('local window light')
  await page.locator('.canvas-size-label').click()
  await expect(globalPrompt).toHaveText(globalText!)
  await page.getByRole('button', { exact: true, name: 'Undo' }).click()
  await expect(regionalPrompt).toHaveValue(original)
  for (const name of ['Face lighting', 'Hand Repair Patch', 'Portrait Base']) {
    await page.getByRole('button', { exact: true, name: `Hide ${name}` }).click()
    await expect(page.getByRole('button', { exact: true, name: `Show ${name}` })).toBeVisible()
    await page.getByRole('button', { exact: true, name: 'Undo' }).click()
    await expect(page.getByRole('button', { exact: true, name: `Hide ${name}` })).toBeVisible()
    await page.getByRole('button', { exact: true, name: `Lock ${name}` }).click()
    await expect(page.getByRole('button', { exact: true, name: `Unlock ${name}` })).toBeVisible()
    await page.getByRole('button', { exact: true, name: 'Undo' }).click()
    await expect(page.getByRole('button', { exact: true, name: `Lock ${name}` })).toBeVisible()
  }
})
