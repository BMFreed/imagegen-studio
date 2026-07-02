import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.resolve(__dirname, '..', 'screenshots');

const viewports = [
  { name: 'desktop-1920', width: 1920, height: 1080 },
  { name: 'laptop-1440', width: 1440, height: 900 }
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
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openModelManager(page);

      await page.screenshot({
        path: path.join(screenshotsDir, `model-manager-${viewport.name}.png`),
        fullPage: false
      });
    });
  }

  test('opens CivitAI token popover', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openModelManager(page);

    await page.getByRole('button', { name: /CivitAI connected/ }).click();
    await expect(page.getByText('Change token')).toBeVisible();
    await expect(page.getByText('Check connection')).toBeVisible();
    await expect(page.getByText('Remove token')).toBeVisible();
  });

  test('captures import dialog', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openModelManager(page);

    await page.getByRole('button', { name: 'Add from CivitAI URL' }).click();
    await expect(page.getByRole('dialog', { name: 'Add from CivitAI URL' })).toBeVisible();
    await expect(page.getByText('Soft Ink Detailer')).toBeVisible();
    await page.waitForTimeout(250);

    await page.screenshot({
      path: path.join(screenshotsDir, 'model-manager-import-dialog-1920.png'),
      fullPage: false
    });
  });
});
