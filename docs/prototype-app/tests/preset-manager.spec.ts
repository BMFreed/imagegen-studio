import { expect, type Page, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const __dirname = import.meta.dirname
const screenshotsDir = path.resolve(__dirname, '..', 'screenshots')

const viewports = [
  { height: 1080, name: 'desktop-1920', width: 1920 },
  { height: 900, name: 'laptop-1440', width: 1440 },
  { height: 800, name: 'compact-1280', width: 1280 },
]

test.beforeAll(async () => {
  await mkdir(screenshotsDir, { recursive: true })
})

async function openPresetManager(page: Page) {
  await page.goto('/?prototype=preset-manager')
  await expect(page.getByRole('heading', { name: 'Preset Manager' })).toBeVisible()
  await expect(page.locator('.manager-shell')).toHaveCSS('transform', 'none')
  await expect(
    page.getByRole('button', { name: 'Select Studio Portrait Soft Light' }),
  ).toBeVisible()
}

test.describe('Preset Manager prototype', () => {
  test('enters through the native modal transition', async ({ page }) => {
    await page.addInitScript(() => {
      const state = globalThis as { managerEnteredFromScale?: boolean } & typeof globalThis
      new MutationObserver(() => {
        const manager = document.querySelector('.manager-shell')
        if (manager && getComputedStyle(manager).transform !== 'none') {
          state.managerEnteredFromScale = true
        }
      }).observe(document, { childList: true, subtree: true })
    })

    await openPresetManager(page)
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (globalThis as { managerEnteredFromScale?: boolean } & typeof globalThis)
              .managerEnteredFromScale,
        ),
      )
      .toBe(true)
  })

  for (const viewport of viewports) {
    test(`captures ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ height: viewport.height, width: viewport.width })
      await openPresetManager(page)

      const hasHorizontalOverflow = await page
        .locator('.manager-body')
        .evaluate((element) => element.scrollWidth > element.clientWidth)
      expect(hasHorizontalOverflow).toBe(false)

      await page.screenshot({
        fullPage: false,
        path: path.join(screenshotsDir, `preset-manager-${viewport.name}.png`),
      })
    })
  }

  test('filters presets and resets without shifting the toolbar', async ({ page }) => {
    await openPresetManager(page)
    const reset = page.getByRole('button', { name: 'Reset filters' })
    await expect(reset).toBeDisabled()

    await page.getByText('Image to Image', { exact: true }).first().click()
    await expect(page.getByRole('button', { name: 'Select Cinematic Img2Img Pass' })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Select Studio Portrait Soft Light' }),
    ).toBeHidden()
    await expect(reset).toBeEnabled()

    await reset.click()
    await page.getByRole('button', { name: 'Favorites' }).click()
    await expect(
      page.getByRole('button', { name: 'Select Studio Portrait Soft Light' }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Select Cinematic Img2Img Pass' })).toBeHidden()

    await reset.click()
    await page.getByRole('button', { name: 'Needs Attention' }).click()
    await expect(page.getByRole('button', { name: 'Select Texture Detailer' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Select Anime Clean Lines' })).toBeHidden()

    await reset.click()
    await page.getByPlaceholder('Search presets').fill('soft detailer')
    await expect(page.getByRole('button', { name: 'Select Cinematic Img2Img Pass' })).toBeVisible()
  })

  test('supports keyboard selection and explicit save', async ({ page }) => {
    await openPresetManager(page)

    const cinematic = page.getByRole('button', { name: 'Select Cinematic Img2Img Pass' })
    await expect(cinematic).toHaveClass(/n-button/)
    await expect(cinematic).toHaveCSS('padding-left', '12px')
    await expect(cinematic).toHaveCSS('padding-right', '12px')
    await cinematic.focus()
    await page.keyboard.press('Space')
    await expect(page.getByLabel('Preset name')).toHaveValue('Cinematic Img2Img Pass')

    await page.getByLabel('Preset name').fill('Cinematic Portrait Pass')
    const save = page.getByRole('button', { name: 'Save Changes' })
    await expect(save).toBeEnabled()
    await save.click()
    await expect(save).toBeDisabled()
    await expect(page.getByText('Preset saved')).toBeVisible()
  })

  test('selects and saves an exact installed model version', async ({ page }) => {
    await openPresetManager(page)

    const modelSection = page
      .locator('.preset-editor .n-collapse-item')
      .filter({ hasText: /^Model/ })
    const modelSelect = modelSection.getByLabel('Model', { exact: true })
    await expect(modelSelect).toContainText('Illustrious XL · v1.1 main')
    await expect(modelSection.getByRole('textbox', { name: 'Model version' })).toHaveCount(0)

    await modelSelect.click()
    const versions = page.getByRole('listbox', { name: 'Model options' })
    await versions.getByRole('option', { name: /Illustrious XL.*v1\.0 archive/ }).click()
    await expect(modelSelect).toContainText('Illustrious XL · v1.0 archive')
    await page.getByRole('button', { name: 'Save Changes' }).click()
    const savedModel = await page.evaluate(async () => {
      const loadModule = (path: string) => import(path)
      const { presetCatalog } = (await loadModule(
        '/src/prototypes/presets/presets.catalog.ts',
      )) as typeof import('../src/prototypes/presets/presets.catalog')
      return presetCatalog.value.find((preset) => preset.id === 'studio-portrait-soft-light')
        ?.payload.model
    })
    expect(savedModel).toMatchObject({ id: 'illustrious-xl-v1-0', version: 'v1.0 archive' })

    await page.getByRole('button', { name: 'Select Cinematic Img2Img Pass' }).click()
    await page.getByRole('button', { name: 'Select Studio Portrait Soft Light' }).click()
    await expect(modelSelect).toContainText('Illustrious XL · v1.0 archive')
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
  })

  test('keeps a missing exact model version visible until it is replaced', async ({ page }) => {
    await openPresetManager(page)
    await page.evaluate(async () => {
      const loadModule = (path: string) => import(path)
      const { presetCatalog } = (await loadModule(
        '/src/prototypes/presets/presets.catalog.ts',
      )) as typeof import('../src/prototypes/presets/presets.catalog')
      const preset = presetCatalog.value.find((item) => item.id === 'anime-clean-lines')!
      preset.payload.model = {
        baseModel: 'Illustrious',
        id: 'uninstalled-xl-v9',
        missing: true,
        name: 'Uninstalled XL',
        predictionType: 'v-pred',
        version: 'v9',
      }
    })

    await page.getByRole('button', { name: 'Select Anime Clean Lines' }).click()
    const modelSection = page
      .locator('.preset-editor .n-collapse-item')
      .filter({ hasText: /^Model/ })
    const modelSelect = modelSection.getByLabel('Model', { exact: true })
    await expect(
      page.getByText('One or more resources used by this preset are not installed.'),
    ).toBeVisible()
    await expect(modelSelect).toContainText('Uninstalled XL · v9')

    await modelSelect.click()
    const versions = page.getByRole('listbox', { name: 'Model options' })
    await expect(
      versions.getByRole('option', { name: /Uninstalled XL.*v9.*Missing/ }),
    ).toHaveAttribute('aria-disabled', 'true')
    await versions.getByRole('option', { name: /Illustrious XL.*v1\.1 main/ }).click()
    await expect(modelSelect).toContainText('Illustrious XL · v1.1 main')
    await expect(
      page.getByText('One or more resources used by this preset are not installed.'),
    ).toBeHidden()
  })

  test('resizes navigation and preset editor panes', async ({ page }) => {
    await page.setViewportSize({ height: 900, width: 1440 })
    await openPresetManager(page)

    const navigation = page.locator('.manager-column--navigation')
    const navigationBefore = await navigation.boundingBox()
    const navigationHandle = page.locator('.manager-body > .n-split__resize-trigger-wrapper')
    const navigationHandleBox = await navigationHandle.boundingBox()
    expect(navigationBefore).not.toBeNull()
    expect(navigationHandleBox).not.toBeNull()
    await page.mouse.move(navigationHandleBox!.x, navigationHandleBox!.y + 100)
    await page.mouse.down()
    await page.mouse.move(navigationHandleBox!.x + 48, navigationHandleBox!.y + 100)
    await page.mouse.up()
    await expect
      .poll(async () => (await navigation.boundingBox())!.width)
      .toBeGreaterThan(navigationBefore!.width + 30)

    const editor = page.locator('.manager-column--editor')
    const editorBefore = await editor.boundingBox()
    const editorHandle = page.locator('.manager-content-split > .n-split__resize-trigger-wrapper')
    const editorHandleBox = await editorHandle.boundingBox()
    expect(editorBefore).not.toBeNull()
    expect(editorHandleBox).not.toBeNull()
    await page.mouse.move(editorHandleBox!.x, editorHandleBox!.y + 100)
    await page.mouse.down()
    await page.mouse.move(editorHandleBox!.x - 48, editorHandleBox!.y + 100)
    await page.mouse.up()
    await expect
      .poll(async () => (await editor.boundingBox())!.width)
      .toBeGreaterThan(editorBefore!.width + 30)
  })

  test('keeps the preset list and editor scrollable in a short viewport', async ({ page }) => {
    await page.setViewportSize({ height: 600, width: 1280 })
    await openPresetManager(page)

    const shell = await page.locator('.manager-shell').boundingBox()
    const body = await page.locator('.manager-body').boundingBox()
    const presetContent = await page.locator('.preset-content').boundingBox()
    const editor = await page.locator('.manager-column--editor').boundingBox()
    expect(shell!.y).toBeGreaterThanOrEqual(15)
    expect(shell!.y + shell!.height).toBeLessThanOrEqual(585)
    expect(presetContent!.y + presetContent!.height).toBeCloseTo(body!.y + body!.height, 0)
    expect(editor!.y + editor!.height).toBeCloseTo(body!.y + body!.height, 0)

    const listScrolls = await page
      .locator('.preset-scroll .n-scrollbar-container')
      .evaluateAll((containers) =>
        containers.map((container) => container.scrollHeight > container.clientHeight),
      )
    expect(listScrolls.some(Boolean)).toBe(true)
    const editorScrolls = await page
      .locator('.editor-scroll .n-scrollbar-container')
      .evaluateAll((containers) =>
        containers.map((container) => container.scrollHeight > container.clientHeight),
      )
    expect(editorScrolls.some(Boolean)).toBe(true)
  })

  test('guards preset switching when there are unsaved changes', async ({ page }) => {
    await openPresetManager(page)
    await page.getByLabel('Preset description').fill('Unsaved description')
    await page.getByRole('button', { name: 'Select Cinematic Img2Img Pass' }).click()

    const unsavedDialog = page.getByRole('dialog', { name: 'Unsaved preset changes' })
    await expect(unsavedDialog).toBeVisible()
    await unsavedDialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByLabel('Preset name')).toHaveValue('Studio Portrait Soft Light')

    await page.getByRole('button', { name: 'Select Cinematic Img2Img Pass' }).click()
    await page
      .getByRole('dialog', { name: 'Unsaved preset changes' })
      .getByRole('button', { name: 'Discard' })
      .click()
    await expect(page.getByLabel('Preset name')).toHaveValue('Cinematic Img2Img Pass')
  })

  test('duplicates and deletes a preset', async ({ page }) => {
    await openPresetManager(page)
    await page.getByRole('button', { name: 'Duplicate' }).click()
    await expect(page.getByLabel('Preset name')).toHaveValue('Studio Portrait Soft Light Copy')

    await page.getByRole('button', { name: 'Delete' }).click()
    const deleteDialog = page.getByRole('dialog').filter({ hasText: 'Delete preset' })
    await expect(deleteDialog).toBeVisible()
    await deleteDialog.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByLabel('Preset name')).toHaveValue('Cinematic Img2Img Pass')
  })

  test('creates a minimal manual preset from a pinned draft', async ({ page }) => {
    await openPresetManager(page)
    const allPresets = page.locator('.menu-label').filter({ hasText: 'All Presets' })
    await expect(allPresets).toContainText('6')

    await page.getByRole('button', { name: 'New Preset' }).click()
    const draftRow = page.getByRole('button', { name: 'Select draft preset' })
    await expect(draftRow).toBeVisible()
    await expect(draftRow).toHaveClass(/n-button/)
    await expect(page.getByLabel('Preset name')).toBeFocused()
    await expect(page.getByLabel('Preset name')).toHaveValue('')
    await expect(page.getByRole('button', { name: 'Create Preset' })).toBeDisabled()
    await expect(allPresets).toContainText('6')

    const promptSection = page.locator('.n-collapse-item').filter({ hasText: /^Prompt/ })
    const negativeSection = page.locator('.n-collapse-item').filter({ hasText: /^Negative Prompt/ })
    await expect(promptSection.getByRole('checkbox', { name: 'Included' })).toBeChecked()
    await expect(negativeSection.getByRole('checkbox', { name: 'Included' })).not.toBeChecked()

    await page.getByRole('button', { name: 'Favorites' }).click()
    await expect(page.getByRole('button', { name: 'Select draft preset' })).toBeVisible()
    await page.getByLabel('Preset name').fill('Minimal Prompt')
    await page.getByRole('button', { name: 'Create Preset' }).click()

    await expect(page.getByText('Preset created')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Select draft preset' })).toBeHidden()
    await page.getByRole('button', { name: 'Favorites' }).click()
    await expect(page.getByRole('button', { name: 'Select Minimal Prompt' })).toBeVisible()
    await expect(allPresets).toContainText('7')
  })

  test('guards draft navigation and cancel returns to the previous preset', async ({ page }) => {
    await openPresetManager(page)
    await page.getByRole('button', { name: 'New Preset' }).click()
    await page.getByLabel('Preset name').fill('Temporary Draft')
    await page.getByRole('button', { name: 'Select Cinematic Img2Img Pass' }).click()

    const guard = page.getByRole('dialog', { name: 'Unsaved preset changes' })
    await expect(guard.getByRole('heading', { name: 'Unsaved preset' })).toBeVisible()
    await guard.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByLabel('Preset name')).toHaveValue('Temporary Draft')
    await expect(guard).toBeHidden()

    await page
      .getByLabel('Preset Manager prototype')
      .getByRole('button', { exact: true, name: 'Cancel' })
      .click()
    await expect(page.getByLabel('Preset name')).toHaveValue('Studio Portrait Soft Light')
    await expect(page.getByRole('button', { name: 'Select draft preset' })).toBeHidden()
  })

  test('uses payload presence for Included and shows workflow-specific fields', async ({
    page,
  }) => {
    await openPresetManager(page)

    const promptSection = page.locator('.n-collapse-item').filter({ hasText: /^Prompt/ })
    await promptSection.getByRole('checkbox', { name: 'Included' }).uncheck()
    await expect(
      promptSection.getByText('This section will not be saved in the preset.'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Save Changes' }).click()

    await page.getByLabel('Workflow', { exact: true }).click()
    await page.locator('.n-base-select-option').filter({ hasText: 'Image to Image' }).click()
    await expect(
      page.locator('.preset-editor .n-collapse-item').filter({ hasText: /^Denoising Strength/ }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Select Hand Repair Smart Patch' }).click()
    const unsavedDialog = page.getByRole('dialog', { name: 'Unsaved preset changes' })
    await unsavedDialog.getByRole('button', { name: 'Discard' }).click()
    const seedSection = page.locator('.n-collapse-item').filter({ hasText: /^Seed/ })
    await seedSection.locator('.n-collapse-item__header').click()
    await seedSection.getByLabel('Seed policy').click()
    await page.locator('.n-base-select-option').filter({ hasText: 'Fixed' }).click()
    await expect(seedSection.getByRole('textbox', { name: 'Seed value' })).toBeVisible()
  })

  test('captures dirty state', async ({ page }) => {
    await page.setViewportSize({ height: 1080, width: 1920 })
    await openPresetManager(page)
    await page.getByLabel('Preset name').fill('Studio Portrait Soft Light Updated')
    await page.screenshot({
      fullPage: false,
      path: path.join(screenshotsDir, 'preset-manager-dirty-1920.png'),
    })
  })
})

test.describe('Editable Apply Preset', () => {
  test('edits, resets, validates, and applies an application draft', async ({ page }) => {
    await page.goto('/?prototype=apply-preset')
    const dialog = page.getByRole('dialog', { name: 'Apply Preset: Cinematic Img2Img Pass' })
    await expect(dialog).toBeVisible()

    const selectAll = dialog.getByRole('checkbox', { name: 'Select all sections' })
    await expect(selectAll).toHaveAttribute('aria-checked', 'mixed')
    await expect(dialog.getByRole('button', { exact: true, name: 'Apply' })).toBeDisabled()
    await expect(dialog.getByText(/Current:.*CFG 5.5/)).toBeVisible()
    await expect(dialog.getByText(/Apply:.*CFG 4.5/)).toBeVisible()

    const promptInput = dialog.getByRole('textbox', { exact: true, name: 'Prompt' })
    await expect(promptInput).toBeHidden()
    await dialog.getByRole('button', { name: 'Expand all' }).click()
    await expect(promptInput).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Collapse all' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Collapse all' }).click()
    await expect(promptInput).toBeHidden()
    await expect(dialog.getByRole('button', { name: 'Expand all' })).toBeVisible()

    const guidanceSection = dialog.locator('.n-collapse-item').filter({ hasText: /^Steps & CFG/ })
    await guidanceSection.locator('.n-collapse-item__header').click()
    const cfgInput = guidanceSection.getByRole('textbox', { name: 'CFG' })
    await cfgInput.fill('6.2')
    await expect(guidanceSection.getByText(/Apply:.*CFG 6.2/)).toBeVisible()
    await guidanceSection.getByRole('button', { name: 'Reset Steps & CFG' }).click()
    await expect(cfgInput).toHaveValue('4.5')

    const sizeCheckbox = dialog.getByRole('checkbox', { name: 'Apply Size' })
    await expect(sizeCheckbox).not.toBeChecked()
    await cfgInput.fill('6.4')
    await dialog.getByRole('button', { name: 'Reset all' }).click()
    await expect(cfgInput).toHaveValue('4.5')
    await expect(sizeCheckbox).not.toBeChecked()

    const loraSection = dialog.locator('.n-collapse-item').filter({ hasText: /^LoRA/ })
    await loraSection.locator('.n-collapse-item__header').click()
    await loraSection.getByRole('button', { name: 'Remove Soft Detailer' }).click()
    await expect(dialog.getByRole('button', { exact: true, name: 'Apply' })).toBeEnabled()
    await dialog.getByRole('button', { exact: true, name: 'Apply' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('Preset applied')).toBeVisible()
  })

  test('missing resources only block selected sections', async ({ page }) => {
    await page.goto('/?prototype=apply-preset')
    const dialog = page.getByRole('dialog', { name: 'Apply Preset: Cinematic Img2Img Pass' })
    const apply = dialog.getByRole('button', { exact: true, name: 'Apply' })
    await expect(apply).toBeDisabled()
    await dialog.getByRole('checkbox', { name: 'Apply LoRA' }).uncheck()
    await expect(apply).toBeEnabled()
    await dialog.getByRole('checkbox', { name: 'Apply LoRA' }).check()
    await expect(apply).toBeDisabled()
    await dialog.getByRole('checkbox', { name: 'Select all sections' }).uncheck()
    await expect(apply).toBeDisabled()
  })

  test('explains temporary changes and opens the original preset', async ({ page }) => {
    await page.goto('/?prototype=apply-preset')
    const dialog = page.getByRole('dialog', { name: 'Apply Preset: Cinematic Img2Img Pass' })
    await expect(dialog.getByText(/The saved preset will not change/)).toBeVisible()

    await dialog.getByRole('button', { name: 'About Apply Preset' }).hover()
    await expect(
      page.getByText('Apply copies selected settings into the current project.'),
    ).toBeVisible()
    await expect(page.getByText('Changes made here do not update the saved preset.')).toBeVisible()

    await dialog.getByRole('button', { name: 'Edit original' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('heading', { name: 'Preset Manager' })).toBeVisible()
    await expect(page.getByLabel('Preset name')).toHaveValue('Cinematic Img2Img Pass')
  })

  test('guards Edit original when the application draft changed', async ({ page }) => {
    await page.goto('/?prototype=apply-preset')
    const dialog = page.getByRole('dialog', { name: 'Apply Preset: Cinematic Img2Img Pass' })
    const guidanceSection = dialog.locator('.n-collapse-item').filter({ hasText: /^Steps & CFG/ })
    await guidanceSection.locator('.n-collapse-item__header').click()
    await guidanceSection.getByRole('textbox', { name: 'CFG' }).fill('6.2')
    await dialog.getByRole('button', { name: 'Edit original' }).click()

    const guard = page.getByRole('dialog', { name: 'Edit saved preset' })
    await expect(guard.getByText(/temporary Apply changes will be discarded/)).toBeVisible()
    await guard.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeVisible()
    await expect(guard).toBeHidden()

    await dialog.getByRole('button', { name: 'Edit original' }).click()
    await guard.getByRole('button', { name: 'Discard & Edit Original' }).click()
    await expect(page.getByRole('heading', { name: 'Preset Manager' })).toBeVisible()
    await expect(page.getByLabel('Preset name')).toHaveValue('Cinematic Img2Img Pass')
  })

  for (const viewport of viewports) {
    test(`captures ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ height: viewport.height, width: viewport.width })
      await page.goto('/?prototype=apply-preset')
      const dialog = page.getByRole('dialog', {
        name: 'Apply Preset: Cinematic Img2Img Pass',
      })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText('Selected resource is missing')).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible()
      await expect(dialog.getByRole('button', { exact: true, name: 'Apply' })).toBeVisible()

      const hasHorizontalOverflow = await dialog.evaluate(
        (element) => element.scrollWidth > element.clientWidth,
      )
      expect(hasHorizontalOverflow).toBe(false)
      await page.screenshot({
        animations: 'disabled',
        fullPage: false,
        path: path.join(screenshotsDir, `apply-preset-${viewport.name}.png`),
      })
    })
  }
})

test.describe('Create preset from project', () => {
  test('opens an editable manager draft and creates only on confirmation', async ({ page }) => {
    await page.goto('/?prototype=save-preset')
    await expect(page.getByRole('heading', { name: 'Preset Manager' })).toBeVisible()
    await expect(page.locator('.project-context')).toBeVisible()
    await expect(
      page.getByLabel('Preset Manager prototype').getByText('Sample Project B.igs'),
    ).toBeVisible()
    await expect(page.getByText(/Seed is not included by default/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Select draft preset' })).toBeVisible()
    await expect(page.getByLabel('Preset name')).toHaveValue('Sample Portrait Baseline')

    const seedSection = page.locator('.n-collapse-item').filter({ hasText: /^Seed/ })
    await expect(seedSection.getByRole('checkbox', { name: 'Included' })).not.toBeChecked()
    const promptSection = page.locator('.n-collapse-item').filter({ hasText: /^Prompt/ })
    await promptSection.locator('.n-collapse-item__header').click()
    const prompt = page.getByRole('textbox', { exact: true, name: 'Prompt' })
    await prompt.fill('edited before preset creation')
    await page.getByRole('button', { name: 'Create Preset' }).click()
    await expect(page.getByText('Preset created')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Select draft preset' })).toBeHidden()
    await expect(
      page.getByRole('button', { name: 'Select Sample Portrait Baseline' }),
    ).toBeVisible()
  })

  test('cancel returns to the project without creating a record', async ({ page }) => {
    await page.goto('/?prototype=save-preset')
    await page.getByRole('button', { exact: true, name: 'Cancel' }).click()
    await expect(page.getByRole('heading', { name: 'Preset Manager' })).toBeHidden()
    await expect(page.locator('.project-context')).toBeVisible()
    await expect(page.getByText('Preset created')).toBeHidden()
  })

  for (const viewport of viewports) {
    test(`captures ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ height: viewport.height, width: viewport.width })
      await page.goto('/?prototype=save-preset')
      await expect(page.getByRole('heading', { name: 'Preset Manager' })).toBeVisible()

      const hasHorizontalOverflow = await page
        .locator('.manager-body')
        .evaluate((element) => element.scrollWidth > element.clientWidth)
      expect(hasHorizontalOverflow).toBe(false)
      await page.screenshot({
        fullPage: false,
        path: path.join(screenshotsDir, `save-preset-${viewport.name}.png`),
      })
    })
  }
})
