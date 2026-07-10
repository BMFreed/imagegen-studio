import { expect, type Page, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const __dirname = import.meta.dirname;
const screenshotsDir = path.resolve(__dirname, '..', 'screenshots');

const viewports = [
  { height: 1080, name: 'desktop-1920', width: 1920 },
  { height: 900, name: 'laptop-1440', width: 1440 },
  { height: 800, name: 'compact-1280', width: 1280 },
];

test.beforeAll(async () => {
  await mkdir(screenshotsDir, { recursive: true });
});

async function openPresetManager(page: Page) {
  await page.goto('/?prototype=preset-manager');
  await expect(page.getByRole('heading', { name: 'Preset Manager' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Select Studio Portrait Soft Light' }),
  ).toBeVisible();
}

test.describe('Preset Manager prototype', () => {
  for (const viewport of viewports) {
    test(`captures ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ height: viewport.height, width: viewport.width });
      await openPresetManager(page);

      const hasHorizontalOverflow = await page
        .locator('.manager-body')
        .evaluate((element) => element.scrollWidth > element.clientWidth);
      expect(hasHorizontalOverflow).toBe(false);

      await page.screenshot({
        fullPage: false,
        path: path.join(screenshotsDir, `preset-manager-${viewport.name}.png`),
      });
    });
  }

  test('filters presets and resets without shifting the toolbar', async ({ page }) => {
    await openPresetManager(page);
    const reset = page.getByRole('button', { name: 'Reset filters' });
    await expect(reset).toBeDisabled();

    await page.getByText('Image to Image', { exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Select Cinematic Img2Img Pass' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Select Studio Portrait Soft Light' }),
    ).toBeHidden();
    await expect(reset).toBeEnabled();

    await reset.click();
    await page.getByRole('button', { name: 'Favorites' }).click();
    await expect(
      page.getByRole('button', { name: 'Select Studio Portrait Soft Light' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select Cinematic Img2Img Pass' })).toBeHidden();

    await reset.click();
    await page.getByRole('button', { name: 'Needs Attention' }).click();
    await expect(page.getByRole('button', { name: 'Select Texture Detailer' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select Anime Clean Lines' })).toBeHidden();

    await reset.click();
    await page.getByPlaceholder('Search presets').fill('soft detailer');
    await expect(page.getByRole('button', { name: 'Select Cinematic Img2Img Pass' })).toBeVisible();
  });

  test('supports keyboard selection and explicit save', async ({ page }) => {
    await openPresetManager(page);

    const cinematic = page.getByRole('button', { name: 'Select Cinematic Img2Img Pass' });
    await cinematic.focus();
    await page.keyboard.press('Space');
    await expect(page.getByLabel('Preset name')).toHaveValue('Cinematic Img2Img Pass');

    await page.getByLabel('Preset name').fill('Cinematic Portrait Pass');
    const save = page.getByRole('button', { name: 'Save Changes' });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(save).toBeDisabled();
    await expect(page.getByText('Preset saved')).toBeVisible();
  });

  test('guards preset switching when there are unsaved changes', async ({ page }) => {
    await openPresetManager(page);
    await page.getByLabel('Preset description').fill('Unsaved description');
    await page.getByRole('button', { name: 'Select Cinematic Img2Img Pass' }).click();

    const unsavedDialog = page.getByRole('dialog', { name: 'Unsaved preset changes' });
    await expect(unsavedDialog).toBeVisible();
    await unsavedDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByLabel('Preset name')).toHaveValue('Studio Portrait Soft Light');

    await page.getByRole('button', { name: 'Select Cinematic Img2Img Pass' }).click();
    await page
      .getByRole('dialog', { name: 'Unsaved preset changes' })
      .getByRole('button', { name: 'Discard' })
      .click();
    await expect(page.getByLabel('Preset name')).toHaveValue('Cinematic Img2Img Pass');
  });

  test('duplicates and deletes a preset', async ({ page }) => {
    await openPresetManager(page);
    await page.getByRole('button', { name: 'Duplicate' }).click();
    await expect(page.getByLabel('Preset name')).toHaveValue('Studio Portrait Soft Light Copy');

    await page.getByRole('button', { name: 'Delete' }).click();
    const deleteDialog = page.getByRole('dialog').filter({ hasText: 'Delete preset' });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByLabel('Preset name')).toHaveValue('Cinematic Img2Img Pass');
  });

  test('uses payload presence for Included and shows workflow-specific fields', async ({
    page,
  }) => {
    await openPresetManager(page);

    const promptSection = page.locator('.n-collapse-item').filter({ hasText: /^Prompt/ });
    await promptSection.getByRole('checkbox', { name: 'Included' }).uncheck();
    await expect(
      promptSection.getByText('This section will not be saved in the preset.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Save Changes' }).click();

    await page.getByLabel('Workflow', { exact: true }).click();
    await page.locator('.n-base-select-option').filter({ hasText: 'Image to Image' }).click();
    await expect(
      page.locator('.preset-editor .n-collapse-item').filter({ hasText: /^Denoising Strength/ }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Select Hand Repair Smart Patch' }).click();
    const unsavedDialog = page.getByRole('dialog', { name: 'Unsaved preset changes' });
    await unsavedDialog.getByRole('button', { name: 'Discard' }).click();
    const seedSection = page.locator('.n-collapse-item').filter({ hasText: /^Seed/ });
    await seedSection.locator('.n-collapse-item__header').click();
    await seedSection.getByLabel('Seed policy').click();
    await page.locator('.n-base-select-option').filter({ hasText: 'Fixed' }).click();
    await expect(seedSection.getByRole('textbox', { name: 'Seed value' })).toBeVisible();
  });

  test('captures dirty state', async ({ page }) => {
    await page.setViewportSize({ height: 1080, width: 1920 });
    await openPresetManager(page);
    await page.getByLabel('Preset name').fill('Studio Portrait Soft Light Updated');
    await page.screenshot({
      fullPage: false,
      path: path.join(screenshotsDir, 'preset-manager-dirty-1920.png'),
    });
  });
});

test.describe('Project preset dialogs', () => {
  test('applies only valid selected sections', async ({ page }) => {
    await page.goto('/?prototype=apply-preset');
    const dialog = page.getByRole('dialog', { name: 'Apply Preset: Cinematic Img2Img Pass' });
    await expect(dialog).toBeVisible();

    const selectAll = dialog.getByRole('checkbox', { name: 'Select all sections' });
    await expect(selectAll).toHaveAttribute('aria-checked', 'mixed');
    await expect(dialog.getByRole('button', { exact: true, name: 'Apply' })).toBeDisabled();

    await dialog.getByRole('checkbox', { name: 'LoRA · Soft Detailer' }).uncheck();
    await expect(dialog.getByRole('button', { exact: true, name: 'Apply' })).toBeEnabled();
    await dialog.getByRole('button', { exact: true, name: 'Apply' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Preset applied')).toBeVisible();
  });

  test('captures Apply Preset', async ({ page }) => {
    await page.setViewportSize({ height: 1080, width: 1920 });
    await page.goto('/?prototype=apply-preset');
    await expect(
      page.getByRole('dialog', { name: 'Apply Preset: Cinematic Img2Img Pass' }),
    ).toBeVisible();
    await page.screenshot({
      fullPage: false,
      path: path.join(screenshotsDir, 'apply-preset-desktop-1920.png'),
    });
  });

  test('validates and saves the current project as a preset', async ({ page }) => {
    await page.goto('/?prototype=save-preset');
    const dialog = page.getByRole('dialog', { name: 'Save Current as Preset' });
    const save = dialog.getByRole('button', { exact: true, name: 'Save Preset' });
    await expect(save).toBeEnabled();

    await dialog.getByLabel('Preset name').fill('');
    await expect(save).toBeDisabled();
    await dialog.getByLabel('Preset name').fill('Sample Portrait Baseline');

    for (const checkbox of await dialog.locator('.section-grid [role="checkbox"]').all()) {
      await checkbox.uncheck();
    }
    await expect(save).toBeDisabled();
    await dialog.getByRole('checkbox', { exact: true, name: 'Prompt' }).check();
    await expect(save).toBeEnabled();
    await save.click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Preset saved')).toBeVisible();
  });

  test('captures Save Current as Preset', async ({ page }) => {
    await page.setViewportSize({ height: 1080, width: 1920 });
    await page.goto('/?prototype=save-preset');
    await expect(page.getByRole('dialog', { name: 'Save Current as Preset' })).toBeVisible();
    await page.screenshot({
      fullPage: false,
      path: path.join(screenshotsDir, 'save-preset-desktop-1920.png'),
    });
  });
});
