import type { ApiResult } from '../../../src/shared/api.js'
import type {
  ApplicationUpdateInstallPreview,
  ApplicationUpdateSnapshot,
} from '../../../src/shared/application-updates.js'

import { expect, type Page, test } from '@playwright/test'
import path from 'node:path'

interface PreviewPlan {
  hold?: boolean
  kind?: 'error' | 'throw'
  preview?: ApplicationUpdateInstallPreview
}

interface PreviewFixtureOptions {
  plans?: PreviewPlan[]
  snapshot?: ApplicationUpdateSnapshot
}

interface PreviewFixture {
  checkCalls: number
  mutationCalls: string[]
  previewVersions: string[]
  releasePreview: (id: number) => void
  returnedPreviews: number
  statusCalls: number
}

type PreviewGlobal = { installPreviewFixture: PreviewFixture } & typeof globalThis
const sourceRoot = `/@fs${path.resolve(import.meta.dirname, '../../../src/renderer')}`
const version = '0.2.0'
const publicFailure = 'Preview unavailable. Try again.'

const downloaded: ApplicationUpdateSnapshot = {
  availableVersion: version,
  currentVersion: '0.1.0-dev.1',
  downloadedBytes: 4096,
  notesTruncated: false,
  releaseNotes: 'A controlled renderer fixture, not a shipped update.',
  status: 'downloaded',
  totalBytes: 4096,
  verification: 'signed-release',
}

const preview: ApplicationUpdateInstallPreview = {
  activeModelInstallCount: 2,
  availableVersion: version,
  generationStorageUnavailable: false,
  openProjectCount: 3,
  preparingModelInstallCount: 1,
  resourceRemovalActive: true,
  unacceptedResultCount: 5,
  unfinishedJobCount: 7,
  unsavedProjectCount: 2,
}

/**
 * Mounts the real production App/chrome/modal using explicit API ports. Counts and update state are
 * controlled renderer inputs; these cases do not qualify native queue/storage, signed release
 * admission, installation, Project persistence, process exit, recovery or a relaunch.
 */
async function mountPreviewApp(page: Page, options: PreviewFixtureOptions = {}) {
  await page.goto('/')
  await page.evaluate(
    async ({ defaultPreview, defaultSnapshot, initial, root }) => {
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
      const currentStatus = initial.snapshot ?? defaultSnapshot
      const pending = new Map<number, () => void>()
      const state: PreviewFixture = {
        checkCalls: 0,
        mutationCalls: [],
        previewVersions: [],
        releasePreview: (id) => {
          const release = pending.get(id)
          if (!release) {
            throw new Error(`No controlled pending preview ${id}.`)
          }
          pending.delete(id)
          release()
        },
        returnedPreviews: 0,
        statusCalls: 0,
      }
      const unsubscribe = () => () => undefined
      const mutate = async (name: string) => {
        state.mutationCalls.push(name)
        return { ok: true, value: undefined }
      }
      const api = {
        applicationUpdates: {
          check: async () => {
            state.checkCalls++
            return { ok: true, value: structuredClone(currentStatus) }
          },
          download: async () => mutate('app-download'),
          getStatus: async () => {
            state.statusCalls++
            return { ok: true, value: structuredClone(currentStatus) }
          },
          install: async () => mutate('app-install'),
          reviewInstallation: async (
            availableVersion: string,
          ): Promise<ApiResult<ApplicationUpdateInstallPreview>> => {
            state.previewVersions.push(availableVersion)
            const id = state.previewVersions.length
            const plan: PreviewPlan = initial.plans?.[id - 1] ?? {
              preview: defaultPreview,
            }
            if (plan.hold) {
              await new Promise<void>((resolve) => pending.set(id, resolve))
            }
            state.returnedPreviews++
            if (plan.kind === 'throw') {
              throw new Error('Unexpected native detail at /private/fixture/install-preview.')
            }
            return plan.kind === 'error'
              ? {
                  error: {
                    code: 'APPLICATION_UPDATE_PREVIEW_FAILED',
                    message: 'Preview unavailable. Try again.',
                  },
                  ok: false,
                }
              : { ok: true, value: structuredClone(plan.preview ?? defaultPreview) }
          },
        },
        models: {
          checkUpdates: async () => mutate('model-update'),
          getCatalog: async () => ({ ok: true, value: [] }),
          onCatalogChanged: unsubscribe,
          onInstallChanged: unsubscribe,
        },
        projects: {
          cancelGeneration: async () => mutate('generation-cancel'),
          close: async () => mutate('project-close'),
          discardAndClose: async () => mutate('project-discard'),
          getGenerationProgress: async () => ({
            ok: true,
            value: { current: null, revision: 0 },
          }),
          list: async () => ({ ok: true, value: [] }),
          listTrash: async () => ({ ok: true, value: [] }),
          listWorkspaces: async () => ({ ok: true, value: [] }),
          onBeforeWindowClose: unsubscribe,
          onGenerationChanged: unsubscribe,
          onGenerationProgress: unsubscribe,
          onTabsChanged: unsubscribe,
          save: async () => mutate('project-save'),
        },
        runtime: {
          getStatus: async () => ({
            ok: true,
            value: {
              detail: 'Controlled renderer port; no runtime qualification.',
              kind: 'not-installed',
              profile: 'linux-nvidia',
              runtimeId: 'renderer-api-fixture',
            },
          }),
          install: async () => mutate('runtime-install'),
          onStatusChanged: unsubscribe,
          repair: async () => mutate('runtime-repair'),
        },
      }
      ;(globalThis as { api: unknown } & typeof globalThis).api = api
      ;(globalThis as PreviewGlobal).installPreviewFixture = state
      createApp(App).mount(host)
    },
    { defaultPreview: preview, defaultSnapshot: downloaded, initial: options, root: sourceRoot },
  )
  await expect(page.getByRole('region', { exact: true, name: 'Home' })).toBeVisible()
}

const dialog = (page: Page) =>
  page.getByRole('dialog', { exact: true, name: 'Application Updates' })
const review = (page: Page) =>
  dialog(page).getByRole('button', { exact: true, name: 'Review installation' })
const refresh = (page: Page) =>
  dialog(page).getByRole('button', { exact: true, name: 'Refresh preview' })
const later = (page: Page) =>
  dialog(page).getByRole('button', { exact: true, name: 'Install later' })
const impact = (page: Page) =>
  dialog(page).getByRole('region', { exact: true, name: 'Installation preview' })

async function openUpdates(page: Page) {
  await page.getByRole('button', { exact: true, name: 'Help menu' }).click()
  await page.getByText('Check for Updates…', { exact: true }).click()
  await expect(dialog(page)).toBeVisible()
}

async function calls(page: Page) {
  return await page.evaluate(() => {
    const { checkCalls, mutationCalls, previewVersions, returnedPreviews, statusCalls } = (
      globalThis as PreviewGlobal
    ).installPreviewFixture
    return { checkCalls, mutationCalls, previewVersions, returnedPreviews, statusCalls }
  })
}

async function count(page: Page, label: string) {
  return impact(page)
    .getByText(label, { exact: true })
    .evaluate((element) => element.nextElementSibling?.textContent)
}

for (const viewport of [
  { height: 800, width: 1280 },
  { height: 620, width: 900 },
]) {
  test(`explicit installation preview reports captured impact and defers without mutation at ${viewport.width}×${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport)
    await mountPreviewApp(page)
    await openUpdates(page)
    await expect(review(page)).toBeEnabled()
    expect(await calls(page)).toMatchObject({
      checkCalls: 0,
      mutationCalls: [],
      previewVersions: [],
      statusCalls: 1,
    })
    await review(page).click()
    await expect(impact(page)).toBeVisible()
    await expect(refresh(page)).toBeEnabled()
    expect(await count(page, 'Open Projects')).toBe('3')
    expect(await count(page, 'Projects with unsaved changes')).toBe('2')
    expect(await count(page, 'Unfinished generation jobs')).toBe('7')
    expect(await count(page, 'Unaccepted results in open Projects')).toBe('5')
    expect(await count(page, 'Active model installations')).toBe('2')
    expect(await count(page, 'Preparing model installations')).toBe('1')
    await expect(impact(page)).toContainText(
      'Resource removal is in progress and must finish before closing.',
    )
    await expect(impact(page)).toContainText('Nothing has been saved, closed or canceled.')
    await expect(impact(page)).toContainText(
      'Current Project state is checked again when you close.',
    )
    await expect(impact(page)).toContainText('Installation is not available in this build.')
    await expect(
      impact(page).getByText('Installation is not available in this build.', { exact: true }),
    ).toBeInViewport()
    await expect(
      dialog(page).getByRole('button', { exact: true, name: 'Check again' }),
    ).toHaveCount(0)
    await expect(dialog(page).getByRole('button', { name: /^Download/ })).toHaveCount(0)
    await expect(
      dialog(page).getByRole('button', { name: /^Install(?: and restart)?$/i }),
    ).toHaveCount(0)
    const bounds = await dialog(page).evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        bottom: rect.bottom,
        clientWidth: element.clientWidth,
        height: innerHeight,
        left: rect.left,
        right: rect.right,
        scrollWidth: element.scrollWidth,
        top: rect.top,
        width: innerWidth,
      }
    })
    expect(bounds.left).toBeGreaterThanOrEqual(0)
    expect(bounds.top).toBeGreaterThanOrEqual(0)
    expect(bounds.right).toBeLessThanOrEqual(bounds.width)
    expect(bounds.bottom).toBeLessThanOrEqual(bounds.height)
    expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth + 1)
    await expect(later(page)).toBeInViewport()
    await expect(refresh(page)).toBeInViewport()
    await page.screenshot({
      path: testInfo.outputPath(`installation-preview-${viewport.width}x${viewport.height}.png`),
    })
    await later(page).click()
    await expect(dialog(page)).toHaveCount(0)
    expect(await calls(page)).toMatchObject({
      checkCalls: 0,
      mutationCalls: [],
      previewVersions: [version],
    })
    await openUpdates(page)
    await expect(review(page)).toBeEnabled()
    await expect(impact(page)).toHaveCount(0)
    expect(await calls(page)).toMatchObject({
      mutationCalls: [],
      previewVersions: [version],
      statusCalls: 2,
    })
  })
}

test('unavailable generation inspection remains unknown rather than claiming an empty queue or result list', async ({
  page,
}) => {
  await mountPreviewApp(page, {
    plans: [
      {
        preview: {
          ...preview,
          generationStorageUnavailable: true,
          unacceptedResultCount: null,
          unfinishedJobCount: null,
        },
      },
    ],
  })
  await openUpdates(page)
  await review(page).click()
  await expect(impact(page)).toContainText('Generation recovery storage unavailable')
  expect(await count(page, 'Unfinished generation jobs')).toBe('Unknown')
  expect(await count(page, 'Unaccepted results in open Projects')).toBe('Unknown')
  expect(await count(page, 'Open Projects')).toBe('3')
  expect(await calls(page)).toMatchObject({ mutationCalls: [], previewVersions: [version] })
})

for (const kind of ['error', 'throw'] as const) {
  test(`preview ${kind} permits an explicit retry without presenting old impact or native details`, async ({
    page,
  }) => {
    await mountPreviewApp(page, { plans: [{ kind }, { preview }] })
    await openUpdates(page)
    await review(page).click()
    await expect(impact(page)).toContainText(
      kind === 'error' ? publicFailure : 'Could not review installation impact. Please try again.',
    )
    await expect(impact(page)).not.toContainText('/private/')
    await expect(impact(page).locator('dl')).toHaveCount(0)
    await expect(later(page)).toBeEnabled()
    await refresh(page).click()
    await expect(impact(page)).not.toContainText(publicFailure)
    expect(await count(page, 'Unfinished generation jobs')).toBe('7')
    expect(await calls(page)).toMatchObject({
      mutationCalls: [],
      previewVersions: [version, version],
    })
  })
}

test('a pending preview can be deferred and its late reply cannot replace the reopened preview', async ({
  page,
}) => {
  const latest = { ...preview, openProjectCount: 1, unfinishedJobCount: 11, unsavedProjectCount: 1 }
  await mountPreviewApp(page, { plans: [{ hold: true, preview }, { preview: latest }] })
  await openUpdates(page)
  await review(page).click()
  await expect(impact(page)).toContainText('Reviewing installation impact…')
  await expect(refresh(page)).toBeDisabled()
  await expect(later(page)).toBeEnabled()
  await later(page).click()
  await expect(dialog(page)).toHaveCount(0)
  await openUpdates(page)
  await expect(review(page)).toBeEnabled()
  await review(page).click()
  expect(await count(page, 'Open Projects')).toBe('1')
  expect(await count(page, 'Unfinished generation jobs')).toBe('11')
  await page.evaluate(() => (globalThis as PreviewGlobal).installPreviewFixture.releasePreview(1))
  await expect.poll(async () => (await calls(page)).returnedPreviews).toBe(2)
  expect(await count(page, 'Open Projects')).toBe('1')
  expect(await count(page, 'Unfinished generation jobs')).toBe('11')
  expect(await calls(page)).toMatchObject({
    mutationCalls: [],
    previewVersions: [version, version],
  })
})

test('refresh replaces the advisory snapshot only after the new preview resolves', async ({
  page,
}) => {
  const latest = {
    ...preview,
    activeModelInstallCount: 0,
    preparingModelInstallCount: 0,
    resourceRemovalActive: false,
    unfinishedJobCount: 0,
  }
  await mountPreviewApp(page, { plans: [{ preview }, { hold: true, preview: latest }] })
  await openUpdates(page)
  await review(page).click()
  expect(await count(page, 'Unfinished generation jobs')).toBe('7')
  await refresh(page).click()
  await expect(impact(page)).toContainText('Reviewing installation impact…')
  await expect(impact(page).locator('dl')).toHaveCount(0)
  await page.evaluate(() => (globalThis as PreviewGlobal).installPreviewFixture.releasePreview(2))
  await expect(refresh(page)).toBeEnabled()
  expect(await count(page, 'Unfinished generation jobs')).toBe('0')
  await expect(impact(page)).not.toContainText('Resource removal is in progress')
  await expect(impact(page)).toContainText('Current Project state is checked again when you close.')
  expect(await calls(page)).toMatchObject({
    mutationCalls: [],
    previewVersions: [version, version],
  })
})

for (const state of [
  { ...downloaded, verification: 'metadata-only' as const },
  { ...downloaded, downloadedBytes: null, status: 'available' as const, totalBytes: null },
  { ...downloaded, downloadedBytes: null, status: 'downloading' as const, totalBytes: null },
]) {
  test(`installation review remains absent for ${state.verification} ${state.status}`, async ({
    page,
  }) => {
    await mountPreviewApp(page, { snapshot: state })
    await openUpdates(page)
    await expect(dialog(page)).toContainText(
      state.status === 'downloading'
        ? 'Downloading and verifying…'
        : 'Installation is not available in this build.',
    )
    await expect(review(page)).toHaveCount(0)
    expect(await calls(page)).toMatchObject({ mutationCalls: [], previewVersions: [] })
  })
}
