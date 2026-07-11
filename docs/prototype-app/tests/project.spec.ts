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

  test('uses the compact global density and unified Project surfaces', async ({ page }) => {
    await page.setViewportSize({ height: 800, width: 1280 });
    await openProject(page);

    await expect(page.locator('.app-chrome')).toHaveCSS('height', '32px');
    await expect(page.locator('.document-tabs')).toHaveCSS('height', '34px');
    await expect(page.getByRole('button', { name: 'File' })).toHaveCSS('font-size', '13px');

    const workspace = await page.getByLabel('Project canvas workspace').boundingBox();
    const footer = await page.locator('.viewport-bar').boundingBox();
    expect(footer!.y + footer!.height).toBeCloseTo(workspace!.y + workspace!.height, 0);
    expect(footer!.height).toBeLessThanOrEqual(32);

    const cardWeights = await page
      .locator('.settings-stack .n-card-header__main')
      .evaluateAll((headers) =>
        headers.map((header) => Number(getComputedStyle(header).fontWeight)),
      );
    expect(cardWeights.length).toBeGreaterThan(4);
    expect(cardWeights.every((weight) => weight >= 600)).toBe(true);

    const layer = page.locator('.layer-row').filter({ hasText: 'Portrait Base' });
    const selection = page.getByRole('button', { name: 'Select Portrait Base' });
    await layer.hover();
    await expect(selection).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('.tool-rail').first()).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    await expect(page.locator('.tool-rail .n-button').first()).not.toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    await expect(page.locator('.tool-rail .n-icon').first()).toHaveCSS('font-size', '18px');
    await expect(
      page.getByRole('button', { name: 'Delete Face lighting' }).locator('.n-icon'),
    ).toHaveCSS('font-size', '18px');
  });

  test('keeps generation actions below Create and gives prompts dedicated editor space', async ({
    page,
  }) => {
    await page.setViewportSize({ height: 900, width: 1440 });
    await openProject(page);

    const settings = page.getByLabel('Generate settings');
    const create = await settings.locator('.create-label').boundingBox();
    const actionBar = await settings.locator('.generation-footer').boundingBox();
    const settingsScroll = await settings.locator('.settings-scroll').boundingBox();
    expect(create!.y + create!.height).toBeCloseTo(actionBar!.y, 0);
    expect(actionBar!.y + actionBar!.height).toBeCloseTo(settingsScroll!.y, 0);
    await expect(settings.locator('.generation-footer')).toHaveCSS('display', 'grid');

    const generate = settings.getByRole('button', { name: 'Generate' });
    const queue = settings.getByRole('button', { name: 'Generation queue' });
    const cancel = settings.getByRole('button', { name: 'Cancel current generation' });
    await expect(generate.locator('.n-button__icon')).toBeVisible();
    await expect(queue).toHaveText('');
    await expect(cancel).toHaveText('');
    await expect(queue).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(cancel).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

    const prompt = settings.getByRole('textbox', { exact: true, name: 'Prompt' });
    const negative = settings.getByRole('textbox', { exact: true, name: 'Negative Prompt' });
    await expect(prompt).toHaveAttribute('rows', '9');
    await expect(negative).toHaveAttribute('rows', '4');
    await expect(settings.locator('.prompt-input .n-input-wrapper').nth(0)).toHaveCSS(
      'resize',
      'vertical',
    );
    await expect(settings.locator('.prompt-input .n-input-wrapper').nth(1)).toHaveCSS(
      'resize',
      'vertical',
    );
    await expect(settings.locator('.prompt-meta').first()).toContainText('12 tokens');

    const promptBox = await prompt.boundingBox();
    const actionRail = await settings.locator('.prompt-actions').first().boundingBox();
    expect(actionRail!.x).toBeGreaterThanOrEqual(promptBox!.x + promptBox!.width);
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
    await expect(page.getByText(/Text to Image|Image to Image|Canvas content/)).toHaveCount(0);
    await expect(
      page.getByLabel('Denoising Strength', { exact: true }).locator('input'),
    ).toBeDisabled();
    await expect(
      page.getByText('Available when the generation area contains visible raster content.').first(),
    ).toBeVisible();

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
    const settings = page.getByLabel('Generate settings');
    await expect(
      settings.getByRole('button', { name: /Generation queue, 4 active jobs/ }),
    ).toBeVisible();
    await expect(settings.locator('.generation-queue-badge .n-badge-sup')).toContainText('4');
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
    await page.getByRole('button', { name: /Studio Portrait Soft Light/ }).click();
    await expect(page.getByRole('dialog', { name: /Apply Preset/ })).toBeVisible();
    await page.getByRole('button', { name: 'Close Apply Preset' }).click();

    await page.getByRole('button', { name: 'Manage Presets' }).click();
    await expect(page.getByRole('heading', { name: 'Preset Manager' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Manage Models' }).click();
    await expect(page.getByRole('heading', { name: 'Model Manager' })).toBeVisible();
  });

  test('resizes both side panels without losing their bounds', async ({ page }) => {
    await page.setViewportSize({ height: 900, width: 1440 });
    await openProject(page);
    const panels = page.locator('.project-prototype .n-split__resize-trigger');
    await expect(panels).toHaveCount(2);
    const leftPanel = page.getByLabel('Generate settings');
    const rightPanel = page.getByLabel('Layers and selected item');
    const leftBefore = await leftPanel.boundingBox();
    const leftHandle = await panels.nth(0).boundingBox();
    expect(leftBefore && leftHandle).toBeTruthy();
    await page.mouse.move(leftHandle!.x + 2, leftHandle!.y + 20);
    await page.mouse.down();
    await page.mouse.move(leftHandle!.x + 70, leftHandle!.y + 20, { steps: 8 });
    await page.mouse.up();
    const leftAfter = await leftPanel.boundingBox();
    expect(leftAfter!.width).toBeGreaterThan(leftBefore!.width + 40);
    expect(leftAfter!.width).toBeLessThanOrEqual(545);

    const rightBefore = await rightPanel.boundingBox();
    const rightHandle = await panels.nth(1).boundingBox();
    await page.mouse.move(rightHandle!.x + 2, rightHandle!.y + 20);
    await page.mouse.down();
    await page.mouse.move(rightHandle!.x - 60, rightHandle!.y + 20, { steps: 8 });
    await page.mouse.up();
    const rightAfter = await rightPanel.boundingBox();
    expect(rightAfter!.width).toBeGreaterThan(rightBefore!.width + 35);
    expect(rightAfter!.width).toBeLessThanOrEqual(545);
  });

  test('accepts arbitrary generation counts within the prototype limit', async ({ page }) => {
    await openProject(page, 'empty-project');
    const count = page.getByLabel('Images per click').locator('input');
    await count.fill('7');
    await count.press('Enter');
    await page.getByRole('button', { name: 'Generate' }).click();
    await page.getByLabel('Project prototype').getByLabel('Generation queue').click();
    await expect(page.getByLabel('Project generation queue').locator('.queue-item')).toHaveCount(7);
  });

  test('edits prompt attention and previews dynamic prompt pairs', async ({ page }) => {
    await openProject(page);
    const prompt = page.getByRole('textbox', { exact: true, name: 'Prompt' });
    await prompt.fill('portrait with {red|blue} light');
    await prompt.evaluate((element: HTMLTextAreaElement) => {
      element.setSelectionRange(0, 8);
      element.dispatchEvent(new Event('select', { bubbles: true }));
    });
    await page.getByLabel('Increase prompt attention').first().click();
    await expect(prompt).toHaveValue('(portrait)+ with {red|blue} light');
    await page.getByLabel('Preview dynamic prompt').first().click();
    const preview = page.getByRole('dialog', { name: 'Dynamic Prompt Preview' });
    await expect(preview).toContainText('2 concrete prompt pairs');
    await preview.getByRole('button', { name: 'Close' }).click();
  });

  test('supports aspect presets, locking and compact size actions', async ({ page }) => {
    await openProject(page);
    await page.getByLabel('Aspect ratio', { exact: true }).click();
    await page.locator('.n-base-select-option').filter({ hasText: '16:9' }).click();
    await expect(page.getByLabel('Aspect ratio preview')).toBeVisible();
    await expect(page.getByLabel('Unlock aspect ratio')).toBeVisible();
    await page.getByLabel('Swap canvas dimensions').click();
    await expect(page.getByLabel('Aspect ratio', { exact: true })).toContainText('9:16');
    await page.getByLabel('Fit canvas to visible layers').click();
    await expect(page.getByLabel('Aspect ratio', { exact: true })).toContainText('Free');
  });

  test('reorders layers with pointer drag and keeps move actions in the menu', async ({ page }) => {
    await openProject(page);
    const source = page.getByRole('button', { name: 'Select Highlight Pass' });
    const target = page.getByRole('button', { name: 'Select Portrait Base' });
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    await page.mouse.move(sourceBox!.x + 60, sourceBox!.y + sourceBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox!.x + 60, targetBox!.y + targetBox!.height - 2, { steps: 12 });
    await page.mouse.up();
    const labels = await page
      .getByLabel('Compositing Layers')
      .locator('button[aria-label^="Select "]')
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
    expect(labels.indexOf('Select Highlight Pass')).toBeGreaterThan(
      labels.indexOf('Select Portrait Base'),
    );
    await page.getByLabel('Layer actions for Highlight Pass').click();
    await expect(page.getByText('Move up', { exact: true })).toBeVisible();
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
