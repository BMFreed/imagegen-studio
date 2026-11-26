import type { ApiResult, ProjectHomeCatalog, ProjectSummary } from '../../../src/shared/api.js'

import { expect, type Page, test } from '@playwright/test'
import path from 'node:path'

type CatalogScenario =
  'fallback' | 'late-error' | 'missing-removal' | 'trash-project' | 'workspace-navigation'

interface HomeCatalogFixture {
  catalogScopes: (string | null)[]
  finishPendingCatalog: () => Promise<void>
  observeExternalFileChange: () => void
  requests: { catalog: number; projects: number; workspaces: number }
  trashRequests: number
}

type HomeCatalogGlobal = { homeCatalogFixture: HomeCatalogFixture } & typeof globalThis

const sourceRoot = `/@fs${path.resolve(import.meta.dirname, '../../../src/renderer')}`
const workspaceError = 'Controlled workspace read failure.'

async function mountHome(page: Page, scenario: CatalogScenario) {
  await page.goto('/')
  await page.evaluate(
    async ({ root, scenario, workspaceError }) => {
      const loadModule = (url: string) => import(url)
      const [{ createApp }, { default: App }] = await Promise.all([
        loadModule('/@id/vue'),
        loadModule(`${root}/App.vue`),
        loadModule(`${root}/styles/global.css`),
      ])
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
      let removed = false
      let externalFileChanged = false
      const batchError = {
        error: { code: 'PROJECT_INTERNAL_ERROR', message: 'Controlled combined read failure.' },
        ok: false,
      } as const
      const requests = { catalog: 0, projects: 0, workspaces: 0 }
      let resolvePending!: (result: ApiResult<ProjectHomeCatalog>) => void
      const pending = new Promise<ApiResult<ProjectHomeCatalog>>((resolve) => {
        resolvePending = resolve
      })
      const fixture: HomeCatalogFixture = {
        catalogScopes: [],
        async finishPendingCatalog() {
          // Wait a renderer frame after settling the response so the old continuations can run.
          resolvePending(batchError)
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        },
        observeExternalFileChange() {
          externalFileChanged = true
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
        projects: {
          getGenerationProgress: async () => ({
            ok: true,
            value: { current: null, revision: 0 },
          }),
          list: async () => {
            requests.projects++
            return {
              ok: true,
              value: [project(scenario === 'fallback' ? 'Readable sketch' : 'Stale sketch')],
            }
          },
          listHomeCatalog: async (workspaceId?: string): Promise<ApiResult<ProjectHomeCatalog>> => {
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
          listTrash: async () => {
            fixture.trashRequests++
            return { ok: true, value: [] }
          },
          listWorkspaces: async () => {
            requests.workspaces++
            return { error: { code: 'PROJECT_INTERNAL_ERROR', message: workspaceError }, ok: false }
          },
          onBeforeWindowClose: unsubscribe,
          onGenerationChanged: unsubscribe,
          onGenerationProgress: unsubscribe,
          onTabsChanged: unsubscribe,
          removeMissingProject: async (id: string, confirmed: boolean) => {
            if (scenario !== 'missing-removal' || id !== missing.id || !confirmed || removed) {
              throw new Error('The fixture expected one confirmed removal of Missing sketch.')
            }
            removed = true
            return { ok: true, value: null }
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
