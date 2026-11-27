import type {
  ApiResult,
  ProjectHomeCatalog,
  ProjectSummary,
  ProjectTab,
} from '../../../src/shared/api.js'

import { expect, type Page, test } from '@playwright/test'
import path from 'node:path'

type CatalogScenario =
  | 'early-results'
  | 'fallback'
  | 'late-error'
  | 'missing-removal'
  | 'trash-project'
  | 'workspace-navigation'

interface HomeCatalogFixture {
  cancelPendingLocate: () => void
  catalogScopes: (string | null)[]
  finishPendingCatalog: () => Promise<void>
  locateProjectIds: string[]
  observeExternalFileChange: () => void
  openedProjectIds: string[]
  publishInitialCatalog: () => Promise<boolean>
  requests: { catalog: number; projects: number; workspaces: number }
  trashRequests: number
}

type HomeCatalogGlobal = { homeCatalogFixture: HomeCatalogFixture } & typeof globalThis

const sourceRoot = `/@fs${path.resolve(import.meta.dirname, '../../../src')}`
const workspaceError = 'Controlled workspace read failure.'

async function mountHome(page: Page, scenario: CatalogScenario) {
  await page.goto('/')
  await page.evaluate(
    async ({ root, scenario, workspaceError }) => {
      const loadModule = (url: string) => import(url)
      const [{ createApp }, { default: App }, { createEmptyProjectDocumentV1 }] = await Promise.all(
        [
          loadModule('/@id/vue'),
          loadModule(`${root}/renderer/App.vue`),
          loadModule(`${root}/shared/projects/project-schema.ts`),
          loadModule(`${root}/renderer/styles/global.css`),
        ],
      )
      const original = document.getElementById('app') as HTMLElement & {
        __vue_app__?: { unmount: () => void }
      }
      original?.__vue_app__?.unmount()
      const host = document.createElement('div')
      host.id = 'app'
      document.body.replaceChildren(host)

      const project = (title: string): ProjectSummary => ({
        bbox: { height: 64, width: 64 },
        health: 'ready',
        id: `project-v1-${'a'.repeat(64)}`,
        previewStatus: 'empty',
        recoveryStatus: 'none',
        thumbnailUrl: null,
        title,
        workspaceId: 'uncategorized',
      })
      const missing: ProjectSummary = {
        ...project('Missing sketch'),
        fileName: 'Missing sketch.igs',
        health: 'missing',
        id: `project-v1-${'b'.repeat(64)}`,
      }
      const trashTarget: ProjectSummary = { ...missing, health: 'ready', title: 'Old sketch' }
      const workspaces = [
        {
          availability: 'available' as const,
          color: 'green',
          directoryPath: '/fixture/workspace',
          displayName: 'Current workspace',
          id: 'uncategorized',
          isDefault: true,
          projectCount: 1,
          writable: true,
        },
      ]
      const secondWorkspace = {
        ...workspaces[0]!,
        directoryPath: '/fixture/linked-workspace',
        displayName: 'Other workspace',
        id: '93ec4b82-7a6b-4ff2-8e0b-58b1591749f5',
        isDefault: false,
      }
      const initialProject: ProjectSummary = {
        ...project('First sketch'),
        previewStatus: 'rendered',
        previewUrl: `data:image/svg+xml,${encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="red"/></svg>',
        )}`,
      }
      const linkedProject: ProjectSummary = {
        ...project('Linked sketch'),
        id: `project-v1-${'c'.repeat(64)}`,
        workspaceId: secondWorkspace.id,
      }
      const initialDocument = createEmptyProjectDocumentV1({
        primaryBbox: { height: 64, width: 64, x: 0, y: 0 },
        title: initialProject.title,
      })
      const initialTab: ProjectTab = {
        ...initialDocument,
        acceptedResults: [],
        autosaveError: null,
        canRedo: false,
        canUndo: false,
        dirty: false,
        id: initialProject.id,
        layers: [],
        workspaceId: initialProject.workspaceId,
      }
      let removed = false
      let externalFileChanged = false
      const batchError = {
        error: { code: 'PROJECT_INTERNAL_ERROR', message: 'Controlled combined read failure.' },
        ok: false,
      } as const
      const requests = { catalog: 0, projects: 0, workspaces: 0 }
      let resolvePending!: (result: ApiResult<ProjectHomeCatalog>) => void
      let initialListener: ((catalog: ProjectHomeCatalog) => void) | undefined
      const pending = new Promise<ApiResult<ProjectHomeCatalog>>((resolve) => {
        resolvePending = resolve
      })
      let cancelLocate: (() => void) | undefined
      const fixture: HomeCatalogFixture = {
        cancelPendingLocate() {
          if (!cancelLocate) {
            throw new Error('The fixture has no pending Locate to cancel.')
          }
          cancelLocate()
          cancelLocate = undefined
        },
        catalogScopes: [],
        async finishPendingCatalog() {
          // Wait a renderer frame after settling the response so the old continuations can run.
          resolvePending(
            scenario === 'early-results'
              ? {
                  ok: true,
                  value: {
                    projects: [initialProject, linkedProject],
                    workspaces: [...workspaces, secondWorkspace],
                  },
                }
              : batchError,
          )
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        },
        locateProjectIds: [],
        observeExternalFileChange() {
          externalFileChanged = true
        },
        openedProjectIds: [],
        async publishInitialCatalog() {
          initialListener?.({ projects: [initialProject], workspaces })
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
          return Boolean(initialListener)
        },
        requests,
        trashRequests: 0,
      }
      const unsubscribe = () => () => undefined
      ;(globalThis as { api: unknown } & typeof globalThis).api = {
        models: {
          getCatalog: async () => ({ ok: true, value: [] }),
          onCatalogChanged: unsubscribe,
          onInstallChanged: unsubscribe,
        },
        presets: { list: async () => ({ ok: true, value: [] }) },
        projects: {
          getGenerationProgress: async () => ({
            ok: true,
            value: { current: null, revision: 0 },
          }),
          getGenerationState: async () => ({
            ok: true,
            value: {
              cfgRescaleSupported: false,
              documentId: initialTab.documentId,
              embeddingsSupported: false,
              error: null,
              externalVaeSupported: false,
              img2imgSupported: false,
              jobs: [],
              phase: 'idle',
              runningJobId: null,
              vaePrecisionSupported: false,
            },
          }),
          list: async () => {
            requests.projects++
            return {
              ok: true,
              value: [project(scenario === 'fallback' ? 'Readable sketch' : 'Stale sketch')],
            }
          },
          listGenerationResults: async () => ({
            ok: true,
            value: {
              candidates: [],
              lastActualSeed: null,
              recoveryUnavailable: false,
              unfinishedSiblingJobIds: [],
            },
          }),
          listHomeCatalog: async (
            workspaceId?: string,
            onInitial?: (catalog: ProjectHomeCatalog) => void,
          ): Promise<ApiResult<ProjectHomeCatalog>> => {
            requests.catalog++
            fixture.catalogScopes.push(workspaceId ?? null)
            if (scenario === 'workspace-navigation') {
              const secondProject = {
                ...project(externalFileChanged ? 'Updated linked sketch' : 'Linked sketch'),
                id: `project-v1-${'c'.repeat(64)}`,
                workspaceId: secondWorkspace.id,
              }
              return {
                ok: true,
                value: {
                  projects: [project('Current sketch'), secondProject].filter(
                    (item) => workspaceId === undefined || item.workspaceId === workspaceId,
                  ),
                  workspaces: [...workspaces, secondWorkspace],
                },
              }
            }
            if (scenario === 'fallback') {
              return batchError
            }
            if (scenario === 'missing-removal' || scenario === 'trash-project') {
              const target = scenario === 'missing-removal' ? missing : trashTarget
              const projects = removed
                ? [project('Current sketch')]
                : [target, project('Current sketch')]
              return {
                ok: true,
                value: {
                  projects,
                  workspaces: [{ ...workspaces[0]!, projectCount: projects.length }],
                },
              }
            }
            if (requests.catalog === 1) {
              initialListener = onInitial
              return await pending
            }
            if (scenario === 'early-results') {
              return await pending
            }
            return {
              ok: true,
              value: {
                projects: [project('Current sketch')],
                workspaces,
              },
            }
          },
          listSmartPatchGenerationResults: async () => ({
            ok: true,
            value: {
              candidates: [],
              documentId: initialTab.documentId,
              documentRevision: initialTab.documentRevision,
              kind: 'smart-patch-results',
              lastActualSeed: null,
              recoveryUnavailable: false,
              targets: [],
            },
          }),
          listTrash: async () => {
            fixture.trashRequests++
            return { ok: true, value: [] }
          },
          listWorkspaces: async () => {
            requests.workspaces++
            return { error: { code: 'PROJECT_INTERNAL_ERROR', message: workspaceError }, ok: false }
          },
          locateProject: async (id: string) => {
            if (scenario !== 'missing-removal' || id !== missing.id || removed) {
              throw new Error('The fixture expected Locate of Missing sketch.')
            }
            fixture.locateProjectIds.push(id)
            return await new Promise<ApiResult<boolean>>((resolve) => {
              cancelLocate = () => resolve({ ok: true, value: false })
            })
          },
          onBeforeWindowClose: unsubscribe,
          onGenerationChanged: unsubscribe,
          onGenerationProgress: unsubscribe,
          onTabsChanged: unsubscribe,
          open: async (id: string) => {
            fixture.openedProjectIds.push(id)
            if (scenario !== 'early-results' || id !== initialTab.id) {
              throw new Error('The fixture expected Open of the first checked Project.')
            }
            return { ok: true, value: { kind: 'opened', tab: initialTab } }
          },
          removeMissingProject: async (id: string, confirmed: boolean) => {
            if (scenario !== 'missing-removal' || id !== missing.id || !confirmed || removed) {
              throw new Error('The fixture expected one confirmed removal of Missing sketch.')
            }
            removed = true
            return { ok: true, value: null }
          },
          sealPromptHistory: async (id: string) => {
            if (id !== initialTab.id || !fixture.openedProjectIds.includes(id)) {
              throw new Error('The fixture expected the open Project before switching Home.')
            }
            return { ok: true, value: initialTab }
          },
          trashProject: async (id: string) => {
            if (scenario !== 'trash-project' || id !== trashTarget.id || removed) {
              throw new Error('The fixture expected one Move to Trash of Old sketch.')
            }
            removed = true
            return { ok: true, value: null }
          },
        },
        runtime: {
          getStatus: async () => ({ ok: true, value: { detail: '', kind: 'missing' } }),
          onStatusChanged: unsubscribe,
        },
      }
      ;(globalThis as HomeCatalogGlobal).homeCatalogFixture = fixture
      createApp(App).mount(host)
    },
    { root: sourceRoot, scenario, workspaceError },
  )
  return page.getByRole('region', { exact: true, name: 'Home' })
}

async function requests(page: Page) {
  return await page.evaluate(() => (globalThis as HomeCatalogGlobal).homeCatalogFixture.requests)
}

test('production Home shows available projects when the workspace fallback fails', async ({
  page,
}) => {
  const home = await mountHome(page, 'fallback')
  await expect(
    home.getByRole('button', { exact: true, name: 'Select Readable sketch' }),
  ).toBeVisible()
  await expect(home.getByText('Workspace list unavailable', { exact: true })).toBeVisible()
  await expect(home.getByText(workspaceError, { exact: false })).toBeVisible()
  await expect(home.getByText('Project action failed', { exact: true })).toHaveCount(0)
  expect(await requests(page)).toEqual({ catalog: 1, projects: 1, workspaces: 1 })
})

test('production Home skips fallbacks when a superseded combined read fails', async ({ page }) => {
  const home = await mountHome(page, 'late-error')
  await expect.poll(() => requests(page)).toEqual({ catalog: 1, projects: 0, workspaces: 0 })
  await home.getByRole('button', { exact: true, name: 'Projects' }).click()

  const current = home.getByRole('button', { exact: true, name: 'Select Current sketch' })
  const workspace = home.getByRole('button', { name: /Current workspace\s*1/ })
  await expect(current).toBeVisible()
  await expect(workspace).toBeVisible()
  expect(
    await page.evaluate(() =>
      (globalThis as HomeCatalogGlobal).homeCatalogFixture.publishInitialCatalog(),
    ),
  ).toBe(true)
  await expect(home.getByRole('button', { exact: true, name: 'Select First sketch' })).toHaveCount(
    0,
  )
  await page.evaluate(
    async () => await (globalThis as HomeCatalogGlobal).homeCatalogFixture.finishPendingCatalog(),
  )

  expect(await requests(page)).toEqual({ catalog: 2, projects: 0, workspaces: 0 })
  await expect(current).toBeVisible()
  await expect(workspace).toBeVisible()
  await expect(home.getByRole('button', { exact: true, name: 'Select Stale sketch' })).toHaveCount(
    0,
  )
  await expect(home.getByText('Workspace list unavailable', { exact: true })).toHaveCount(0)
})

test('production Home shows the first checked workspace while the complete catalog is pending', async ({
  page,
}) => {
  const home = await mountHome(page, 'early-results')
  await expect.poll(() => requests(page)).toEqual({ catalog: 1, projects: 0, workspaces: 0 })
  expect(
    await page.evaluate(() =>
      (globalThis as HomeCatalogGlobal).homeCatalogFixture.publishInitialCatalog(),
    ),
  ).toBe(true)

  const first = home.getByRole('button', { exact: true, name: 'Select First sketch' })
  const linked = home.getByRole('button', { exact: true, name: 'Select Linked sketch' })
  const workspace = home.getByRole('button', { name: /^Current workspace\s*1$/ })
  const refresh = home.getByRole('button', { exact: true, name: 'Refresh projects' })
  const inspector = home.getByRole('complementary', { name: 'Project inspector' })
  await expect(refresh).toHaveAttribute('aria-busy', 'true')
  await expect(linked).toHaveCount(0)
  await first.click()
  await expect(first).toHaveAttribute('aria-pressed', 'true')
  await expect(inspector.getByRole('img', { name: 'Project preview canvas' })).toHaveAttribute(
    'data-preview-state',
    'ready',
  )
  await expect(inspector.getByRole('button', { exact: true, name: 'Open Project' })).toBeEnabled()

  await workspace.click()
  await expect(workspace).toHaveAttribute('aria-pressed', 'true')
  await expect(first).toBeVisible()
  const aggregate = home.getByRole('button', { exact: true, name: 'Projects' })
  await aggregate.click()
  await expect(aggregate).toHaveAttribute('aria-pressed', 'true')
  await expect(first).toBeVisible()
  expect(await requests(page)).toEqual({ catalog: 1, projects: 0, workspaces: 0 })

  await home.getByRole('textbox', { exact: true, name: 'Search projects' }).fill('Linked sketch')
  await expect(home.getByRole('status', { name: 'Loading projects' })).toBeVisible()
  await expect(home.getByText('No projects match this search or filter')).toHaveCount(0)
  await workspace.click()
  await expect(workspace).toHaveAttribute('aria-pressed', 'true')
  await page.evaluate(() =>
    (globalThis as HomeCatalogGlobal).homeCatalogFixture.finishPendingCatalog(),
  )
  await expect(refresh).not.toHaveAttribute('aria-busy', 'true')
  await expect(linked).toHaveCount(0)
  await aggregate.click()
  await expect(linked).toBeVisible()
  expect(await requests(page)).toEqual({ catalog: 1, projects: 0, workspaces: 0 })
})

test('production Home opens a checked Project without waiting for the rest of the catalog', async ({
  page,
}) => {
  const home = await mountHome(page, 'early-results')
  await expect.poll(() => requests(page)).toEqual({ catalog: 1, projects: 0, workspaces: 0 })
  expect(
    await page.evaluate(() =>
      (globalThis as HomeCatalogGlobal).homeCatalogFixture.publishInitialCatalog(),
    ),
  ).toBe(true)

  await home.getByRole('button', { exact: true, name: 'Select First sketch' }).click()
  await home
    .getByRole('complementary', { name: 'Project inspector' })
    .getByRole('button', { exact: true, name: 'Open Project' })
    .click()

  const opened = page.getByRole('region', { exact: true, name: 'Project First sketch' })
  await expect(page.getByRole('tab', { exact: true, name: 'First sketch' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByRole('tab', { exact: true, name: 'Home' })).toHaveCount(0)
  await expect(opened.getByRole('button', { exact: true, name: 'Save Project' })).toBeEnabled()
  expect(
    await page.evaluate(
      () => (globalThis as HomeCatalogGlobal).homeCatalogFixture.openedProjectIds,
    ),
  ).toEqual([`project-v1-${'a'.repeat(64)}`])
  expect(await requests(page)).toEqual({ catalog: 1, projects: 0, workspaces: 0 })

  await page.getByRole('button', { exact: true, name: 'Open Home' }).click()
  await expect(home).toBeVisible()
  const refresh = home.getByRole('button', { exact: true, name: 'Refresh projects' })
  const linked = home.getByRole('button', { exact: true, name: 'Select Linked sketch' })
  await expect(refresh).toHaveAttribute('aria-busy', 'true')
  await expect(home.getByRole('button', { exact: true, name: 'Select First sketch' })).toBeVisible()
  await expect(linked).toHaveCount(0)
  expect(await requests(page)).toEqual({ catalog: 1, projects: 0, workspaces: 0 })

  await page.evaluate(() =>
    (globalThis as HomeCatalogGlobal).homeCatalogFixture.finishPendingCatalog(),
  )
  await expect(linked).toBeVisible()
  await expect(refresh).not.toHaveAttribute('aria-busy', 'true')
  expect(await requests(page)).toEqual({ catalog: 1, projects: 0, workspaces: 0 })
})

test('production Home restores keyboard focus after canceling Locate Project', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ height: 620, width: 900 })
  const home = await mountHome(page, 'missing-removal')
  const workspace = home.getByRole('button', { name: /^Current workspace\s*2$/ })
  await workspace.press('Enter')
  await expect(workspace).toHaveAttribute('aria-pressed', 'true')
  const missing = home.getByRole('button', { exact: true, name: 'Select Missing sketch' })
  await missing.press('Enter')
  await expect(missing).toHaveAttribute('aria-pressed', 'true')
  const inspector = home.getByRole('complementary', { exact: true, name: 'Project inspector' })
  const locate = inspector.getByRole('button', { exact: true, name: 'Locate Project' })
  const before = await requests(page)

  await locate.press('Enter')
  await expect(locate).toBeDisabled()
  expect(
    await page.evaluate(
      () => (globalThis as HomeCatalogGlobal).homeCatalogFixture.locateProjectIds,
    ),
  ).toEqual([`project-v1-${'b'.repeat(64)}`])
  await page.evaluate(() =>
    (globalThis as HomeCatalogGlobal).homeCatalogFixture.cancelPendingLocate(),
  )

  await expect(locate).toBeEnabled()
  await expect(missing).toHaveAttribute('aria-pressed', 'true')
  await expect(inspector.getByRole('alert').filter({ hasText: 'File missing' })).toBeVisible()
  await expect(workspace).toHaveAttribute('aria-pressed', 'true')
  await expect(
    home.getByRole('button', { exact: true, name: 'Select Current sketch' }),
  ).toBeVisible()
  await expect(page.getByRole('tab')).toHaveCount(1)
  await expect(page.getByRole('tab', { exact: true, name: 'Home' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  expect(await requests(page)).toEqual(before)
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('after-locate-cancel.png'),
  })
  await expect(locate).toBeFocused()
  expect(await locate.evaluate((button) => button.matches(':focus-visible'))).toBe(true)

  await locate.press('Enter')
  await expect(locate).toBeDisabled()
  const fileMenu = page.getByRole('button', { exact: true, name: 'File menu' })
  await fileMenu.focus()
  await expect(fileMenu).toBeFocused()
  await page.evaluate(() =>
    (globalThis as HomeCatalogGlobal).homeCatalogFixture.cancelPendingLocate(),
  )
  await expect(locate).toBeEnabled()
  await expect(fileMenu).toBeFocused()
})

test('production Home restores keyboard focus after removing a missing project from its workspace', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ height: 620, width: 900 })
  const home = await mountHome(page, 'missing-removal')
  const workspace = home.getByRole('button', { name: /^Current workspace\s*2$/ })
  await workspace.press('Enter')
  await expect(workspace).toHaveAttribute('aria-pressed', 'true')
  const missing = home.getByRole('button', { exact: true, name: 'Select Missing sketch' })
  await missing.press('Enter')
  await expect(missing).toHaveAttribute('aria-pressed', 'true')
  const inspector = home.getByRole('complementary', { exact: true, name: 'Project inspector' })
  const remove = inspector.getByRole('button', { exact: true, name: 'Remove from Home' })
  await remove.press('Enter')
  const dialog = page.getByRole('dialog', { exact: true, name: 'Remove from Home' })
  await expect(dialog).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('confirmation.png') })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(remove).toBeFocused()
  await expect(missing).toBeVisible()

  await remove.press('Enter')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { exact: true, name: 'Remove from Home' }).press('Enter')
  await expect(dialog).toBeHidden()
  await expect(missing).toHaveCount(0)
  await expect(
    home.getByRole('button', { exact: true, name: 'Select Current sketch' }),
  ).toBeVisible()
  await expect(home.getByRole('button', { name: /^Current workspace\s*1$/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.screenshot({ path: testInfo.outputPath('after-removal.png') })
  const search = home.getByRole('textbox', { exact: true, name: 'Search projects' })
  await expect(search).toBeFocused()
  expect(await search.evaluate((input) => input.matches(':focus-visible'))).toBe(true)
})

test('production Home restores keyboard focus after moving a project to Trash', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ height: 620, width: 900 })
  const home = await mountHome(page, 'trash-project')
  const workspace = home.getByRole('button', { name: /^Current workspace\s*2$/ })
  await workspace.press('Enter')
  await expect(workspace).toHaveAttribute('aria-pressed', 'true')
  const actions = home.getByRole('button', { exact: true, name: 'Old sketch project actions' })
  const target = home.getByRole('button', { exact: true, name: 'Select Old sketch' })
  const neighbor = home.getByRole('button', { exact: true, name: 'Select Current sketch' })
  const dialog = page.getByRole('dialog', { exact: true, name: 'Move Project to Trash' })
  const moveOption = page.locator('.n-dropdown-option-body').filter({ hasText: /^Move to Trash$/ })
  async function openConfirmation() {
    await actions.press('Enter')
    await expect(moveOption).toBeVisible()
    for (let count = 0; count < 6; count++) {
      await page.keyboard.press('ArrowDown')
      if ((await moveOption.getAttribute('class'))?.includes('n-dropdown-option-body--pending')) {
        break
      }
    }
    await expect(moveOption).toHaveClass(/n-dropdown-option-body--pending/)
    await page.keyboard.press('Enter')
    await expect(dialog).toBeVisible()
  }

  await openConfirmation()
  await expect(dialog.getByRole('button', { exact: true, name: 'Cancel' })).toBeFocused()
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect(moveOption).toBeHidden()
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('move-to-trash-confirmation.png'),
  })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(actions).toBeFocused()
  await expect(target).toBeVisible()

  await openConfirmation()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { exact: true, name: 'Move to Trash' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  await expect(target).toHaveCount(0)
  await expect(neighbor).toHaveAttribute('aria-pressed', 'false')
  await expect(home.getByRole('button', { name: /^Current workspace\s*1$/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  const search = home.getByRole('textbox', { exact: true, name: 'Search projects' })
  await expect(search).toBeFocused()
  expect(await search.evaluate((input) => input.matches(':focus-visible'))).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('after-move-to-trash.png') })
  expect(await page.getByRole('tablist', { name: 'Open documents' }).getByRole('tab').count()).toBe(
    1,
  )
})

test('production Home switches workspaces from a complete catalog and Refresh discovers other folders', async ({
  page,
}) => {
  const home = await mountHome(page, 'workspace-navigation')
  const aggregate = home.getByRole('button', { exact: true, name: 'Projects' })
  const currentWorkspace = home.getByRole('button', { name: /^Current workspace\s*1$/ })
  const otherWorkspace = home.getByRole('button', { name: /^Other workspace\s*1$/ })
  const current = home.getByRole('button', { exact: true, name: 'Select Current sketch' })
  const other = home.getByRole('button', { exact: true, name: 'Select Linked sketch' })
  const updated = home.getByRole('button', { exact: true, name: 'Select Updated linked sketch' })
  const refresh = home.getByRole('button', { exact: true, name: 'Refresh projects' })
  const observed = () =>
    page.evaluate(() => {
      const { catalogScopes, requests, trashRequests } = (globalThis as HomeCatalogGlobal)
        .homeCatalogFixture
      return { catalogScopes, requests, trashRequests }
    })

  await expect(current).toBeVisible()
  await expect(other).toBeVisible()
  await other.click()
  await expect(other).toHaveAttribute('aria-pressed', 'true')
  await otherWorkspace.click()
  await expect(otherWorkspace).toHaveAttribute('aria-pressed', 'true')
  await expect(other).toHaveAttribute('aria-pressed', 'false')
  await expect(current).toHaveCount(0)
  await currentWorkspace.click()
  await expect(current).toBeVisible()
  await expect(other).toHaveCount(0)
  await aggregate.click()
  await expect(other).toBeVisible()
  await currentWorkspace.click()
  expect(await observed()).toEqual({
    catalogScopes: [null],
    requests: { catalog: 1, projects: 0, workspaces: 0 },
    trashRequests: 1,
  })

  await page.evaluate(() =>
    (globalThis as HomeCatalogGlobal).homeCatalogFixture.observeExternalFileChange(),
  )
  await refresh.click()
  await expect.poll(observed).toEqual({
    catalogScopes: [null, null],
    requests: { catalog: 2, projects: 0, workspaces: 0 },
    trashRequests: 2,
  })
  await expect(refresh).not.toHaveAttribute('aria-busy', 'true')
  await expect(updated).toHaveCount(0)
  await aggregate.click()
  await expect(updated).toBeVisible()
  await expect(other).toHaveCount(0)
  await otherWorkspace.click()
  await expect(updated).toBeVisible()
  await expect(current).toHaveCount(0)
  expect((await observed()).requests.catalog).toBe(2)
})
