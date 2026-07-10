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

async function openModelManager(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Model Manager' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add from CivitAI URL' })).toBeVisible();
  await expect(page.getByText('Illustrious XL').first()).toBeVisible();
}

test.describe('Model Manager prototype', () => {
  for (const viewport of viewports) {
    test(`captures ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ height: viewport.height, width: viewport.width });
      await openModelManager(page);

      const hasHorizontalOverflow = await page
        .locator('.manager-body')
        .evaluate((element) => element.scrollWidth > element.clientWidth);
      expect(hasHorizontalOverflow).toBe(false);

      await page.screenshot({
        fullPage: false,
        path: path.join(screenshotsDir, `model-manager-${viewport.name}.png`),
      });
    });
  }

  test('opens CivitAI token popover', async ({ page }) => {
    await page.setViewportSize({ height: 1080, width: 1920 });
    await openModelManager(page);

    await page.getByRole('button', { name: /CivitAI connected/ }).click();
    await expect(page.getByText('Change token')).toBeVisible();
    await expect(page.getByText('Check connection')).toBeVisible();
    await expect(page.getByText('Remove token')).toBeVisible();
  });

  test('shows the Model Manager description', async ({ page }) => {
    await page.setViewportSize({ height: 1080, width: 1920 });
    await openModelManager(page);

    await page.getByRole('button', { name: 'About Model Manager' }).hover();
    await expect(
      page.getByText('Install, inspect and repair the models used by your projects.'),
    ).toBeVisible();
  });

  test('resets visual filter state', async ({ page }) => {
    await page.setViewportSize({ height: 1080, width: 1920 });
    await openModelManager(page);

    const resetFilters = page.getByRole('button', { name: 'Reset filters' });
    await expect(resetFilters).toBeDisabled();

    await page.getByText('Checkpoints', { exact: true }).click();
    await expect(resetFilters).toBeEnabled();

    await resetFilters.click();
    await expect(resetFilters).toBeDisabled();
  });

  test('selects a resource with the keyboard', async ({ page }) => {
    await page.setViewportSize({ height: 1080, width: 1920 });
    await openModelManager(page);

    const digitalArt = page.getByRole('button', { name: /Digital Art/ });
    await digitalArt.focus();
    await page.keyboard.press('Space');

    await expect(page.locator('h2', { hasText: 'Digital Art' })).toBeVisible();
    await expect(page.getByText('v0.1').last()).toBeVisible();
  });

  test('captures import dialog', async ({ page }) => {
    await page.setViewportSize({ height: 1080, width: 1920 });
    await openModelManager(page);

    await page.getByRole('button', { name: 'Add from CivitAI URL' }).click();
    await expect(page.getByRole('dialog', { name: 'Add from CivitAI URL' })).toBeVisible();
    await expect(page.getByText('Soft Ink Detailer')).toBeVisible();
    await page.waitForTimeout(250);

    await page.screenshot({
      fullPage: false,
      path: path.join(screenshotsDir, 'model-manager-import-dialog-1920.png'),
    });
  });
});
