import { expect, type Page, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const __dirname = import.meta.dirname;
const screenshotsDir = path.resolve(__dirname, '..', 'screenshots');

const viewports = [
  { height: 1080, name: 'desktop-1920', width: 1920 },
  { height: 900, name: 'laptop-1440', width: 1440 },
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
