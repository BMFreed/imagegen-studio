import type { ApiResult, ProjectHomeCatalog, ProjectSummary } from '../../../src/shared/api.js'

import { expect, type Page, test } from '@playwright/test'
import path from 'node:path'

type CatalogScenario = 'fallback' | 'late-error'

interface HomeCatalogFixture {
  finishPendingCatalog: () => Promise<void>
  requests: { catalog: number; projects: number; workspaces: number }
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
        async finishPendingCatalog() {
          // Wait a renderer frame after settling the response so the old continuations can run.
          resolvePending(batchError)
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        },
        requests,
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
          listHomeCatalog: async (): Promise<ApiResult<ProjectHomeCatalog>> => {
            requests.catalog++
            if (scenario === 'fallback') {
              return batchError
            }
            if (requests.catalog === 1) {
              return await pending
            }
            return {
              ok: true,
              value: {
                projects: [project('Current sketch')],
                workspaces: [
                  {
                    availability: 'available',
                    color: 'green',
                    directoryPath: '/fixture/workspace',
                    displayName: 'Current workspace',
                    id: 'uncategorized',
                    isDefault: true,
                    projectCount: 1,
                    writable: true,
                  },
                ],
              },
            }
          },
          listTrash: async () => ({ ok: true, value: [] }),
          listWorkspaces: async () => {
            requests.workspaces++
            return { error: { code: 'PROJECT_INTERNAL_ERROR', message: workspaceError }, ok: false }
          },
          onBeforeWindowClose: unsubscribe,
          onGenerationChanged: unsubscribe,
          onGenerationProgress: unsubscribe,
          onTabsChanged: unsubscribe,
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
