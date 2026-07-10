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

async function openHome(page: Page, query = '') {
  await page.goto(`/${query}`);
  await expect(page.getByLabel('Home prototype')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
}

test.describe('Home prototype', () => {
  for (const viewport of viewports) {
    test(`captures ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ height: viewport.height, width: viewport.width });
      await openHome(page);
      const hasOverflow = await page
        .getByLabel('Home prototype')
        .evaluate((element) => element.scrollWidth > element.clientWidth);
      expect(hasOverflow).toBe(false);
      await page.screenshot({
        animations: 'disabled',
        fullPage: false,
        path: path.join(screenshotsDir, `home-${viewport.name}.png`),
      });
    });
  }

  test('captures scenario and interaction states', async ({ page }) => {
    await page.setViewportSize({ height: 900, width: 1440 });

    await openHome(page, '?prototype=home&scenario=first-run');
    await page.screenshot({ path: path.join(screenshotsDir, 'home-first-run.png') });

    await openHome(page, '?prototype=home&scenario=no-model');
    await page.screenshot({ path: path.join(screenshotsDir, 'home-no-model.png') });

    await openHome(page, '?prototype=home&scenario=problems');
    await page.getByRole('button', { name: 'Projects' }).click();
    await page.screenshot({ path: path.join(screenshotsDir, 'home-problems.png') });

    await openHome(page);
    await page.getByRole('button', { name: 'List view' }).click();
    await page.screenshot({ path: path.join(screenshotsDir, 'home-list-view.png') });
    await page.getByRole('button', { name: 'Select Sample Project B' }).click();
    await page.getByRole('button', { name: 'Collapse inspector' }).click();
    await page.screenshot({ path: path.join(screenshotsDir, 'home-collapsed-inspector.png') });

    await page.getByRole('button', { name: 'New Project' }).first().click();
    const newProjectDialog = page.getByRole('dialog', { name: 'New Project' });
    await newProjectDialog.getByLabel('Generation preset').click();
    await page
      .locator('.n-base-select-option')
      .filter({ hasText: 'Texture Detailer' })
      .click();
    await expect(page.locator('.n-base-select-menu').last()).toBeHidden();
    await page.screenshot({ path: path.join(screenshotsDir, 'home-new-project-dialog.png') });
    await newProjectDialog.getByRole('button', { name: 'Cancel' }).click();

    await openHome(page);
    await page.getByRole('button', { name: 'Select Midnight greenhouse' }).click();
    await page.getByRole('button', { name: 'Open Project' }).last().click();
    await page.screenshot({ path: path.join(screenshotsDir, 'home-recovery-dialog.png') });
  });

  test('starts without a selection and browses projects', async ({ page }) => {
    await openHome(page);
    await expect(page.getByRole('button', { name: 'Projects' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Recent' })).toBeHidden();
    await expect(page.getByText('Select a project to preview')).toBeVisible();
    await page.getByRole('button', { name: 'Select Sample Project B' }).click();
    await expect(page.getByRole('heading', { name: 'Sample Project B' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Switch to Project' })).toBeVisible();

    await page.getByRole('button', { name: 'Projects' }).click();
    await expect(page.getByText('Select a project to preview')).toBeVisible();
    await expect(page.getByText('Character studies').last()).toBeVisible();
  });

  test('supports context-menu and modifier open semantics', async ({ page }) => {
    await openHome(page);
    const projectACard = page.locator('article').filter({ hasText: 'Sample Project A' });
    await projectACard.click({ button: 'right' });
    await expect(page.getByRole('heading', { name: 'Sample Project A' })).toBeVisible();
    await expect(page.getByText('Open in New Tab', { exact: true }).last()).toBeVisible();
    await page.keyboard.press('Escape');

    const noob = page.getByRole('button', { name: 'Select NoobAI composition tests' });
    await noob.click({ modifiers: ['Control'] });
    await expect(page.getByRole('tab', { name: 'NoobAI composition tests.igs' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible();
  });

  test('uses Naive card tabs with keyboard navigation', async ({ page }) => {
    await openHome(page);
    const homeTab = page.getByRole('tab', { name: 'Home' });
    await homeTab.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Sample Project B.igs' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Close Sample Project B.igs' })).toBeVisible();
  });

  test('searches by name, filters conditions, and switches view mode', async ({ page }) => {
    await openHome(page);
    await page.getByPlaceholder('Search projects').fill('greenhouse');
    await expect(page.getByRole('button', { name: 'Select Midnight greenhouse' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select Sample Project B' })).toBeHidden();
    await page.getByRole('button', { name: 'Reset filters' }).click();

    await page.getByLabel('Status').click();
    await page.locator('.n-base-select-option').filter({ hasText: 'Recovery available' }).click();
    await expect(page.getByRole('button', { name: 'Select Midnight greenhouse' })).toBeVisible();
    await page.getByRole('button', { name: 'List view' }).click();
    await expect(page.getByLabel('Project list')).toBeVisible();
  });

  test('uses document tab semantics and preserves Home state', async ({ page }) => {
    await openHome(page);
    const projectB = page.getByRole('button', { name: 'Select Sample Project B' });
    await projectB.click();
    await projectB.dblclick();
    await expect(page.getByRole('tab', { name: /Sample Project B/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible();

    await page.getByRole('button', { name: 'Open Home' }).click();
    await expect(page.getByRole('heading', { name: 'Sample Project B' })).toBeVisible();

    const noob = page.getByRole('button', { name: 'Select NoobAI composition tests' });
    await noob.dblclick();
    await expect(page.getByRole('tab', { name: 'Home' })).toBeHidden();
    await page.getByRole('button', { name: 'Open Home' }).click();
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  });

  test('creates a project with a generation preset warning', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'New Project' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New Project' });
    await expect(dialog.getByLabel('Canvas width')).toHaveValue('1024');
    await dialog.getByLabel('Project name').fill('Prototype Project');
    await dialog.getByLabel('Generation preset').click();
    await page
      .locator('.n-base-select-option')
      .filter({ hasText: 'Texture Detailer' })
      .click();
    await expect(dialog.getByText(/missing resource/)).toBeVisible();
    await expect(dialog.getByText(/saved preset will not change/)).toBeVisible();
    await dialog
      .locator('strong')
      .filter({ hasText: /^Prompt$/ })
      .click();
    const prompt = dialog.getByRole('textbox', { exact: true, name: 'Prompt' });
    await expect(prompt).toBeVisible();
    await prompt.fill('customized for this project only');
    await dialog.getByRole('button', { name: 'Create Project' }).click();
    await expect(page.getByText('Project created')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Prototype Project.igs' })).toBeVisible();
  });

  test('moves an external project into the current workspace', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'Import Project' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Import Existing Project' });
    await expect(dialog.getByText('Move', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Move & Import' }).click();
    await expect(page.getByText('Project moved and imported')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Field Notes.igs' })).toBeVisible();
  });

  test('resolves recovery without overwriting the saved project', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'Select Midnight greenhouse' }).click();
    await page.getByRole('button', { name: 'Open Project' }).last().click();
    const dialog = page.getByRole('dialog', { name: 'Recover Project' });
    await expect(dialog.getByText(/will not be overwritten/)).toBeVisible();
    await dialog.getByRole('button', { exact: true, name: 'Recover' }).click();
    await expect(page.getByRole('tab', { name: /Midnight greenhouse/ })).toBeVisible();
    await expect(page.getByLabel('Unsaved changes')).toBeVisible();
  });

  test('shows first-run and problem scenarios', async ({ page }) => {
    await openHome(page, '?prototype=home&scenario=first-run');
    await expect(page.getByText('No generation model installed.')).toBeVisible();
    await expect(page.getByText('No projects in this workspace yet')).toBeVisible();

    await page.goto('/?prototype=home&scenario=problems');
    await page.getByRole('button', { name: 'Projects' }).click();
    await page.getByLabel('Status').click();
    await page.locator('.n-base-select-option').filter({ hasText: 'Needs attention' }).click();
    await expect(page.getByRole('button', { name: 'Select Damaged portrait study' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select Future schema concept' })).toBeVisible();
  });

  test('opens and closes Model Manager over Home', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'Manage Models' }).click();
    await expect(page.getByRole('heading', { name: 'Model Manager' })).toBeVisible();
    await expect(page.getByLabel('Home prototype')).toHaveAttribute('inert', '');
    await page.getByRole('button', { name: 'Close Model Manager' }).click();
    await expect(page.getByRole('heading', { name: 'Model Manager' })).toBeHidden();
    await expect(page.getByLabel('Home prototype')).toBeVisible();

    await page.getByRole('button', { name: 'Manage Models' }).click();
    await expect(page.getByRole('heading', { name: 'Model Manager' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Model Manager' })).toBeHidden();
  });

  test('opens and closes Preset Manager over Home', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'Manage Presets' }).click();
    await expect(page.getByRole('heading', { name: 'Preset Manager' })).toBeVisible();
    await expect(page.getByLabel('Home prototype')).toHaveAttribute('inert', '');
    await page.getByRole('button', { name: 'Close Preset Manager' }).click();
    await expect(page.getByRole('heading', { name: 'Preset Manager' })).toBeHidden();

    await page.getByRole('button', { name: 'Manage Presets' }).click();
    await expect(page.getByRole('heading', { name: 'Preset Manager' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Preset Manager' })).toBeHidden();
  });

  test('manages workspaces and project records', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'Add workspace' }).click();
    const workspaceDialog = page.getByRole('dialog', { name: 'Add Workspace' });
    await workspaceDialog.getByLabel('Workspace name').fill('Environment studies');
    await workspaceDialog.getByRole('button', { name: 'Add Workspace' }).click();
    await expect(page.getByRole('heading', { name: 'Environment studies' })).toBeVisible();

    const uncategorized = page.getByRole('button', { name: /Uncategorized 4/ });
    await uncategorized.click();
    await expect(page.getByRole('button', { name: 'Projects' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(uncategorized).toHaveAttribute('aria-pressed', 'true');
    const noobCard = page.locator('article').filter({ hasText: 'NoobAI composition tests' });
    await noobCard.getByRole('button', { name: 'Project actions' }).click();
    await page.getByText('Rename', { exact: true }).click();
    const renameDialog = page.getByRole('dialog', { name: 'Rename Project' });
    await renameDialog.getByLabel('Project name').fill('NoobAI layout tests');
    await renameDialog.getByRole('button', { name: 'Rename' }).click();
    await expect(page.getByRole('button', { name: 'Select NoobAI layout tests' })).toBeVisible();

    const renamedCard = page.locator('article').filter({ hasText: 'NoobAI layout tests' });
    await renamedCard.getByRole('button', { name: 'Project actions' }).click();
    await page.getByText('Move to Workspace', { exact: true }).click();
    const moveDialog = page.getByRole('dialog', { name: 'Move Project' });
    await moveDialog.getByLabel('Destination workspace').click();
    await page.locator('.n-base-select-option').filter({ hasText: 'Character studies' }).click();
    await moveDialog.getByRole('button', { name: 'Move Project' }).click();
    await expect(page.getByRole('button', { name: 'Select NoobAI layout tests' })).toBeHidden();
  });

  test('moves a closed project to Trash and blocks an open project', async ({ page }) => {
    await openHome(page);
    const noobCard = page.locator('article').filter({ hasText: 'NoobAI composition tests' });
    await noobCard.getByRole('button', { name: 'Project actions' }).click();
    await page.getByText('Move to Trash', { exact: true }).click();
    const trashDialog = page.getByRole('dialog', { name: 'Move Project to Trash' });
    await trashDialog.getByRole('button', { name: 'Move to Trash' }).click();
    await expect(
      page.getByRole('button', { name: 'Select NoobAI composition tests' }),
    ).toBeHidden();

    await page.getByRole('button', { name: /Trash 1/ }).click();
    await expect(
      page.getByRole('button', { name: 'Select NoobAI composition tests' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Select NoobAI composition tests' }).click();
    await page.getByRole('button', { name: 'Restore Project' }).click();
    await expect(page.getByText('Trash is empty')).toBeVisible();

    await page.getByRole('button', { name: 'Projects' }).click();

    const projectBCard = page.locator('article').filter({ hasText: 'Sample Project B' });
    await projectBCard.getByRole('button', { name: 'Project actions' }).click();
    await page.getByText('Move to Trash', { exact: true }).click();
    await expect(page.getByText(/is open/)).toBeVisible();
    await expect(
      page.getByRole('dialog', { name: 'Move Project to Trash' }).getByRole('button', {
        name: 'Switch to Project',
      }),
    ).toBeVisible();
  });

  test('permanently deletes a project from app-managed Trash', async ({ page }) => {
    await openHome(page);
    const noobCard = page.locator('article').filter({ hasText: 'NoobAI composition tests' });
    await noobCard.getByRole('button', { name: 'Project actions' }).click();
    await page.getByText('Move to Trash', { exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Move Project to Trash' })
      .getByRole('button', { name: 'Move to Trash' })
      .click();
    await page.getByRole('button', { name: /Trash 1/ }).click();
    await page.getByRole('button', { name: 'Select NoobAI composition tests' }).click();
    await page.getByRole('button', { name: 'Delete Permanently' }).click();
    await page
      .getByRole('dialog')
      .last()
      .getByRole('button', { name: 'Delete Permanently' })
      .click();
    await expect(page.getByText('Trash is empty')).toBeVisible();
  });

  test('renders opaque status tags over project previews', async ({ page }) => {
    await openHome(page);
    const openTag = page.locator('.condition-stack .n-tag').filter({ hasText: 'Open' }).first();
    const background = await openTag.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    expect(background).toBe('rgb(23, 77, 39)');
  });

  test('keeps dense Home geometry and the full card surface interactive', async ({ page }) => {
    await page.setViewportSize({ height: 900, width: 1440 });
    await openHome(page);

    const leading = page.locator('.tab-leading').first();
    await expect(leading).toHaveCSS('width', '18px');

    for (const label of [
      page.locator('.tab-title').filter({ hasText: 'Sample Project B.igs' }),
      page.locator('.home-sidebar .workspace-name').filter({ hasText: 'Regional guidance drafts' }),
      page.locator('.card-body strong').filter({ hasText: 'Midnight greenhouse' }),
    ]) {
      const lineMetrics = await label.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fontSize: Number.parseFloat(style.fontSize),
          lineHeight: Number.parseFloat(style.lineHeight),
        };
      });
      expect(lineMetrics.lineHeight).toBeGreaterThan(lineMetrics.fontSize);
    }

    const titleBox = await page.getByRole('heading', { name: 'Projects' }).boundingBox();
    const countBox = await page.getByText('9 projects', { exact: true }).boundingBox();
    expect(titleBox).not.toBeNull();
    expect(countBox).not.toBeNull();
    const titleCenter = titleBox!.y + titleBox!.height / 2;
    const countCenter = countBox!.y + countBox!.height / 2;
    expect(Math.abs(titleCenter - countCenter)).toBeLessThan(6);

    const archiveCard = page.locator('article').filter({ hasText: 'Archive character sheet' });
    const archiveTags = archiveCard.locator('.condition-stack .n-tag');
    await expect(archiveTags).toHaveCount(2);
    const firstTag = await archiveTags.nth(0).boundingBox();
    const secondTag = await archiveTags.nth(1).boundingBox();
    expect(firstTag).not.toBeNull();
    expect(secondTag).not.toBeNull();
    expect(secondTag!.y).toBeGreaterThan(firstTag!.y + firstTag!.height - 1);

    const noobCard = page.locator('article').filter({ hasText: 'NoobAI composition tests' });
    const cardBox = await noobCard.boundingBox();
    expect(cardBox).not.toBeNull();
    const footerCursor = await page.evaluate(
      ({ x, y }) => globalThis.getComputedStyle(document.elementFromPoint(x, y)!).cursor,
      { x: cardBox!.x + cardBox!.width / 2, y: cardBox!.y + cardBox!.height - 6 },
    );
    expect(footerCursor).toBe('pointer');
    await page.mouse.click(cardBox!.x + cardBox!.width / 2, cardBox!.y + cardBox!.height - 6);
    await expect(page.getByRole('heading', { name: 'NoobAI composition tests' })).toBeVisible();
  });

  test('bounds compact and preset New Project layouts', async ({ page }) => {
    await page.setViewportSize({ height: 900, width: 1440 });
    await openHome(page);
    await page.getByRole('button', { name: 'New Project' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New Project' });
    await expect(dialog.getByText('Project name is required')).toBeHidden();
    await dialog.getByLabel('Project name').fill('Temporary');
    await dialog.getByLabel('Project name').fill('');
    await expect(dialog.getByText('Project name is required')).toBeVisible();

    await dialog.getByLabel('Workspace').click();
    const workspaceMenu = page.locator('.n-base-select-menu');
    await expect(workspaceMenu).toBeVisible();
    await expect(workspaceMenu.getByText('New workspace', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    const compactBox = await dialog.boundingBox();
    const nameBox = await dialog.getByLabel('Project name').boundingBox();
    const workspaceBox = await dialog.getByLabel('Workspace').boundingBox();
    expect(compactBox).not.toBeNull();
    expect(compactBox!.width).toBeLessThanOrEqual(700);
    expect(nameBox!.width).toBeGreaterThan(workspaceBox!.width * 1.8);

    await dialog.getByLabel('Generation preset').click();
    await page
      .locator('.n-base-select-option')
      .filter({ hasText: 'Studio Portrait Soft Light' })
      .click();
    await expect(page.locator('.n-base-select-menu').last()).toBeHidden();
    const presetBox = await dialog.boundingBox();
    expect(presetBox).not.toBeNull();
    expect(presetBox!.width).toBeLessThanOrEqual(840);
    expect(presetBox!.height).toBeLessThanOrEqual(760);
    expect(presetBox!.y).toBeGreaterThanOrEqual(40);
    await expect(dialog.getByRole('textbox', { exact: true, name: 'Prompt' })).toBeHidden();

    await dialog.getByRole('button', { name: 'Expand all' }).click();
    const contentScroller = dialog.locator('.n-card__content-scrollbar .n-scrollbar-container');
    await expect
      .poll(() =>
        contentScroller.evaluate((element) => element.scrollHeight > element.clientHeight),
      )
      .toBe(true);
    await contentScroller.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
    await expect
      .poll(() => contentScroller.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
  });

  test('collapses the inspector and controls the preview viewport', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'Select Sample Project B' }).click();
    await expect(page.getByText('72%')).toBeVisible();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(page.getByText('82%')).toBeVisible();
    await page.getByRole('button', { name: 'Reset view' }).click();
    await expect(page.locator('.zoom-value').getByText('100%', { exact: true })).toBeVisible();

    const navigation = page.getByLabel('Home navigation');
    const navigationBefore = await navigation.boundingBox();
    const navigationHandle = page.locator('.home-shell-split > .n-split__resize-trigger-wrapper');
    const navigationHandleBox = await navigationHandle.boundingBox();
    expect(navigationBefore).not.toBeNull();
    expect(navigationHandleBox).not.toBeNull();
    await page.mouse.move(navigationHandleBox!.x, navigationHandleBox!.y + 100);
    await page.mouse.down();
    await page.mouse.move(navigationHandleBox!.x + 40, navigationHandleBox!.y + 100);
    await page.mouse.up();
    await expect
      .poll(async () => (await navigation.boundingBox())!.width)
      .toBeGreaterThan(navigationBefore!.width + 24);

    const inspector = page.getByLabel('Project inspector');
    const inspectorBefore = await inspector.boundingBox();
    const inspectorHandle = page.locator('.home-content-split > .n-split__resize-trigger-wrapper');
    const inspectorHandleBox = await inspectorHandle.boundingBox();
    expect(inspectorBefore).not.toBeNull();
    expect(inspectorHandleBox).not.toBeNull();
    await page.mouse.move(inspectorHandleBox!.x, inspectorHandleBox!.y + 100);
    await page.mouse.down();
    await page.mouse.move(inspectorHandleBox!.x - 40, inspectorHandleBox!.y + 100);
    await page.mouse.up();
    await expect
      .poll(async () => (await inspector.boundingBox())!.width)
      .toBeGreaterThan(inspectorBefore!.width + 24);

    await page.getByRole('button', { name: 'Collapse inspector' }).click();
    await expect(page.getByRole('button', { name: 'Expand inspector' })).toBeVisible();
    await expect(inspectorHandle).toBeHidden();
  });
});
