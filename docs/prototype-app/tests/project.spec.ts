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

test.beforeAll(async () => mkdir(screenshotsDir, { recursive: true }));

async function openProject(page: Page, scenario = 'default') {
  await page.goto(`/?prototype=project&scenario=${scenario}`);
  await expect(page.getByLabel('Project prototype')).toBeVisible();
  await expect(page.getByLabel('Project canvas workspace')).toBeVisible();
}

test.describe('Project prototype', () => {
  for (const viewport of viewports) {
    test(`captures ${viewport.name} without horizontal overflow`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openProject(page);
      const overflow = await page
        .getByLabel('Project prototype')
        .evaluate((element) => element.scrollWidth > element.clientWidth);
      expect(overflow).toBe(false);
      await page.screenshot({
        animations: 'disabled',
        path: path.join(screenshotsDir, `project-${viewport.name}.png`),
      });
    });
  }

  test('renders default mixed layer architecture with Raster selected', async ({ page }) => {
    await openProject(page);
    await expect(page.getByRole('button', { name: 'Select Portrait Base' })).toBeVisible();
    await expect(page.getByLabel('Compositing Layers')).toContainText('Hand Repair Patch');
    await expect(page.getByRole('region', { name: 'Regional Guidance' })).toContainText(
      'Face lighting',
    );
    await expect(page.getByRole('button', { name: 'Bounding Box' })).toBeHidden();
  });

  test('switches contextual tools for Smart Patch and Regional Guidance', async ({ page }) => {
    await openProject(page, 'smart-patch');
    await expect(page.getByRole('button', { name: 'Bounding Box' })).toBeVisible();
    await expect(page.getByLabel('Mask thumbnail')).toBeVisible();
    await page.getByRole('button', { name: 'Fit Patch BBox to Mask' }).click();
    await expect(page.getByText(/Regenerate to refresh/)).toBeVisible();

    await openProject(page, 'regional-guidance');
    await expect(page.getByRole('button', { name: 'Transform Region' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bounding Box' })).toBeHidden();
  });

  test('shows empty and error generation states', async ({ page }) => {
    await openProject(page, 'empty-project');
    await expect(page.getByText('Text to Image · Empty canvas').first()).toBeVisible();
    await expect(
      page.getByLabel('Denoising Strength', { exact: true }).locator('input'),
    ).toBeDisabled();

    await openProject(page, 'errors');
    await expect(page.getByText('Selected model is missing')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate' })).toBeDisabled();
    await expect(page.getByText('CUDA allocation failed')).toBeVisible();
  });

  test('keeps staging temporary and accepts multiple results as layers', async ({ page }) => {
    await openProject(page, 'staging');
    await expect(page.getByRole('region', { name: 'Generation Results' })).toContainText(
      '2 selected',
    );
    await page.getByRole('button', { name: 'Add 2 as Layers' }).click();
    const dialog = page.getByRole('dialog', { name: 'Accept generation results' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Add selected results' }).click();
    await expect(page.getByRole('region', { name: 'Generation Results' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Select Generated Result 1' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Sample Project B/ })).toContainText(
      'Sample Project B.igs',
    );
  });

  test('simulates queue lifecycle without immediately creating layers', async ({ page }) => {
    await openProject(page, 'empty-project');
    await page.getByRole('button', { name: 'Generate' }).click();
    await expect(page.getByRole('region', { name: 'Generation Results' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select Generated Result 1' })).toBeHidden();
    await expect(page.getByLabel('Select candidate 1')).toBeEnabled({ timeout: 3000 });
    await page.getByLabel('Project prototype').getByLabel('Generation queue').click();
    await expect(page.getByLabel('Project generation queue')).toBeVisible();
  });

  test('edits, undoes, saves, and guards dirty close', async ({ page }) => {
    await openProject(page);
    const prompt = page.getByRole('textbox', { exact: true, name: 'Prompt' });
    await prompt.fill('updated project prompt');
    await prompt.press('Tab');
    await expect(page.getByLabel('Unsaved changes')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.getByRole('button', { name: 'Redo' }).click();
    await page.keyboard.press('Control+s');
    await expect(page.getByText('Project saved')).toBeVisible();

    await prompt.fill('another change');
    await prompt.press('Tab');
    await page.getByRole('button', { name: 'Close Sample Project B.igs' }).click();
    const close = page.getByRole('dialog', { name: 'Close Project' });
    await expect(close).toBeVisible();
    await close.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('[aria-label="Project prototype"]:visible')).toBeVisible();
  });

  test('opens preset and model flows over the mounted Project', async ({ page }) => {
    await openProject(page);
    await page.getByLabel('Apply preset').click();
    await page
      .locator('.n-base-select-option')
      .filter({ hasText: 'Studio Portrait Soft Light' })
      .click();
    await expect(page.getByRole('dialog', { name: /Apply Preset/ })).toBeVisible();
    await page.getByRole('button', { name: 'Close Apply Preset' }).click();

    await page.getByRole('button', { name: 'Manage Presets' }).click();
    await expect(page.getByRole('heading', { name: 'Preset Manager' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Manage Models' }).click();
    await expect(page.getByRole('heading', { name: 'Model Manager' })).toBeVisible();
  });

  test('opens a real Project from Home and preserves tab state', async ({ page }) => {
    await page.goto('/');
    const projectB = page.getByRole('button', { name: 'Select Sample Project B' });
    await projectB.dblclick();
    await expect(page.locator('[aria-label="Project prototype"]:visible')).toBeVisible();
    await page.getByRole('button', { name: 'Open Home' }).click();
    await expect(page.getByLabel('Home prototype')).toBeVisible();
    await page.getByRole('tab', { name: /Sample Project B/ }).click();
    await expect(page.locator('[aria-label="Project prototype"]:visible')).toBeVisible();
  });

  test('captures focused scenario states', async ({ page }) => {
    await page.setViewportSize({ height: 900, width: 1440 });
    for (const scenario of [
      'smart-patch',
      'regional-guidance',
      'staging',
      'empty-project',
      'errors',
    ]) {
      await openProject(page, scenario);
      await page.screenshot({
        animations: 'disabled',
        path: path.join(screenshotsDir, `project-${scenario}.png`),
      });
    }
  });
});
