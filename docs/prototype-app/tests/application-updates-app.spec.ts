import type { ApiResult } from '../../../src/shared/api.js'
import type { ApplicationUpdateSnapshot } from '../../../src/shared/application-updates.js'
import { isApplicationUpdateSnapshot } from '../../../src/shared/application-updates.js'

import { expect, type Page, test } from '@playwright/test'
import path from 'node:path'

interface CheckPlan {
  hold?: boolean
  kind?: 'public-error' | 'snapshot' | 'throw'
  snapshot?: ApplicationUpdateSnapshot
}

interface UpdatesOptions {
  checks?: CheckPlan[]
  downloads?: CheckPlan[]
  omitDomain?: boolean
  status?: ApplicationUpdateSnapshot
  statusFailure?: 'public-error' | 'throw'
  statusFailures?: number[]
  statusHeld?: boolean
  statusHolds?: number[]
}

interface UpdatesFixture {
  checkCalls: number
  downloadVersions: string[]
  mutationCalls: string[]
  releaseCheck: (id: number) => void
  releaseDownload: (id: number) => void
  releaseStatus: (id?: number) => void
  returnedChecks: number
  returnedDownloads: number
  returnedStatuses: number
  setStatus: (snapshot: ApplicationUpdateSnapshot) => void
  statusCalls: number
}

type UpdatesGlobal = { applicationUpdatesFixture: UpdatesFixture } & typeof globalThis

const sourceRoot = `/@fs${path.resolve(import.meta.dirname, '../../../src/renderer')}`
const currentVersion = '0.1.0-dev.1'
const publicFailure = 'The update service is unavailable. Try again.'
const genericFailure = 'The application could not check for updates. Please try again.'

function snapshot(status: ApplicationUpdateSnapshot['status']): ApplicationUpdateSnapshot {
  return {
    availableVersion: null,
    currentVersion,
    downloadedBytes: null,
    notesTruncated: false,
    releaseNotes: null,
    status,
    totalBytes: null,
  }
}

function available(
  version: string,
  notes = 'A newer application version.',
): ApplicationUpdateSnapshot {
  return {
    ...snapshot('available'),
    availableVersion: version,
    releaseNotes: notes,
  }
}

function downloadStatus(
  status: 'download-error' | 'downloaded' | 'downloading',
  downloadedBytes: number | null = null,
  totalBytes: number | null = null,
): ApplicationUpdateSnapshot {
  return { ...available('0.2.0'), downloadedBytes, status, totalBytes }
}

/**
 * Actual production App/chrome/modal with explicit API ports replacing preload/Main. These cases
 * qualify manual renderer intent, literal presentation and late-reply isolation, never network,
 * update trust, actual transfer, installation, persistence, restart or native package behavior.
 */
async function mountUpdatesApp(page: Page, options: UpdatesOptions = {}) {
  if (process.env['IGS_APPLICATION_UPDATE_MUTATION'] === 'stale-ui') {
    await page.route('**/src/renderer/App.vue', async (route) => {
      const response = await route.fetch()
      const body = await response.text()
      const guard = 'epoch === applicationUpdatesEpoch'
      expect(body.split(guard)).toHaveLength(2)
      await route.fulfill({ body: body.replace(guard, 'true'), response })
    })
  }
  if (options.status) {
    expect(isApplicationUpdateSnapshot(options.status)).toBe(true)
  }
  for (const plan of [...(options.checks ?? []), ...(options.downloads ?? [])]) {
    if (plan.snapshot) {
      expect(isApplicationUpdateSnapshot(plan.snapshot)).toBe(true)
    }
  }
  await page.goto('/')
  await page.evaluate(
    async ({ initial, root }) => {
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
      const initialStatus: ApplicationUpdateSnapshot = initial.status ?? {
        availableVersion: null,
        currentVersion: '0.1.0-dev.1',
        downloadedBytes: null,
        notesTruncated: false,
        releaseNotes: null,
        status: 'idle',
        totalBytes: null,
      }
      const pendingChecks = new Map<number, () => void>()
      const pendingDownloads = new Map<number, () => void>()
      const pendingStatuses = new Map<number, () => void>()
      let currentStatus = structuredClone(initialStatus)
      const state: UpdatesFixture = {
        checkCalls: 0,
        downloadVersions: [],
        mutationCalls: [],
        releaseCheck: (id) => {
          const resolve = pendingChecks.get(id)
          if (!resolve) {
            throw new Error(`No controlled pending check ${id}.`)
          }
          pendingChecks.delete(id)
          resolve()
        },
        releaseDownload: (id) => {
          const resolve = pendingDownloads.get(id)
          if (!resolve) {
            throw new Error(`No controlled pending download ${id}.`)
          }
          pendingDownloads.delete(id)
          resolve()
        },
        releaseStatus: (id = 1) => {
          const resolve = pendingStatuses.get(id)
          if (!resolve) {
            throw new Error('No controlled pending status read.')
          }
          pendingStatuses.delete(id)
          resolve()
        },
        returnedChecks: 0,
        returnedDownloads: 0,
        returnedStatuses: 0,
        setStatus: (snapshot) => {
          currentStatus = structuredClone(snapshot)
        },
        statusCalls: 0,
      }
      const publicError = (): ApiResult<ApplicationUpdateSnapshot> => ({
        error: {
          code: 'APP_UPDATE_REQUEST_FAILED',
          message: 'The update service is unavailable. Try again.',
        },
        ok: false,
      })
      const unsubscribe = () => () => undefined
      const api = {
        models: {
          checkUpdates: async () => state.mutationCalls.push('model-update'),
          getCatalog: async () => ({ ok: true, value: [] }),
          onCatalogChanged: unsubscribe,
          onInstallChanged: unsubscribe,
        },
        projects: {
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
          install: async () => state.mutationCalls.push('runtime-install'),
          onStatusChanged: unsubscribe,
          repair: async () => state.mutationCalls.push('runtime-repair'),
        },
        ...(initial.omitDomain
          ? {}
          : {
              applicationUpdates: {
                check: async (): Promise<ApiResult<ApplicationUpdateSnapshot>> => {
                  const id = ++state.checkCalls
                  const plan: CheckPlan = initial.checks?.[id - 1] ?? {
                    snapshot: { ...initialStatus, status: 'up-to-date' },
                  }
                  if (plan.hold) {
                    await new Promise<void>((resolve) => pendingChecks.set(id, resolve))
                  }
                  state.returnedChecks++
                  if (plan.kind === 'throw') {
                    throw new Error('Unexpected native failure at /private/fixture/update-source.')
                  }
                  if (plan.snapshot) {
                    currentStatus = structuredClone(plan.snapshot)
                  }
                  return plan.kind === 'public-error'
                    ? publicError()
                    : { ok: true, value: structuredClone(plan.snapshot ?? initialStatus) }
                },
                download: async (
                  version: string,
                ): Promise<ApiResult<ApplicationUpdateSnapshot>> => {
                  state.downloadVersions.push(version)
                  state.mutationCalls.push('app-download')
                  const id = state.downloadVersions.length
                  const plan: CheckPlan = initial.downloads?.[id - 1] ?? {
                    snapshot: {
                      ...currentStatus,
                      downloadedBytes: 4096,
                      status: 'downloaded',
                      totalBytes: 4096,
                    },
                  }
                  currentStatus = {
                    ...currentStatus,
                    downloadedBytes: null,
                    status: 'downloading',
                    totalBytes: null,
                  }
                  if (plan.hold) {
                    await new Promise<void>((resolve) => pendingDownloads.set(id, resolve))
                  }
                  state.returnedDownloads++
                  if (plan.kind === 'throw') {
                    throw new Error('Unexpected download failure at /private/fixture/update-cache.')
                  }
                  if (plan.snapshot) {
                    currentStatus = structuredClone(plan.snapshot)
                  }
                  return plan.kind === 'public-error'
                    ? publicError()
                    : { ok: true, value: structuredClone(plan.snapshot ?? currentStatus) }
                },
                getStatus: async (): Promise<ApiResult<ApplicationUpdateSnapshot>> => {
                  const id = ++state.statusCalls
                  const captured = structuredClone(currentStatus)
                  if ((initial.statusHeld && id === 1) || initial.statusHolds?.includes(id)) {
                    await new Promise<void>((resolve) => {
                      pendingStatuses.set(id, resolve)
                    })
                  }
                  state.returnedStatuses++
                  if (id === 1 && initial.statusFailure === 'throw') {
                    throw new Error('Unexpected native failure at /private/fixture/update-source.')
                  }
                  return (id === 1 && initial.statusFailure === 'public-error') ||
                    initial.statusFailures?.includes(id)
                    ? publicError()
                    : { ok: true, value: captured }
                },
                install: async () => state.mutationCalls.push('app-install'),
              },
            }),
      }
      ;(globalThis as { api: unknown } & typeof globalThis).api = api
      ;(globalThis as UpdatesGlobal).applicationUpdatesFixture = state
      createApp(App).mount(host)
    },
    { initial: options, root: sourceRoot },
  )
  await expect(page.getByRole('region', { exact: true, name: 'Home' })).toBeVisible()
}

const dialog = (page: Page) =>
  page.getByRole('dialog', { exact: true, name: 'Application Updates' })

async function openUpdates(page: Page) {
  await page.getByRole('button', { exact: true, name: 'Help menu' }).click()
  await page.getByText('Check for Updates…', { exact: true }).click()
  await expect(dialog(page)).toBeVisible()
}

async function calls(page: Page) {
  return await page.evaluate(() => {
    const {
      checkCalls,
      downloadVersions,
      mutationCalls,
      returnedChecks,
      returnedDownloads,
      returnedStatuses,
      statusCalls,
    } = (globalThis as UpdatesGlobal).applicationUpdatesFixture
    return {
      checkCalls,
      downloadVersions,
      mutationCalls,
      returnedChecks,
      returnedDownloads,
      returnedStatuses,
      statusCalls,
    }
  })
}

async function assertModalFits(page: Page) {
  const bounds = await dialog(page).evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return {
      bottom: rect.bottom,
      clientWidth: element.clientWidth,
      height: window.innerHeight,
      left: rect.left,
      right: rect.right,
      scrollWidth: element.scrollWidth,
      top: rect.top,
      width: window.innerWidth,
    }
  })
  expect(bounds.left).toBeGreaterThanOrEqual(0)
  expect(bounds.top).toBeGreaterThanOrEqual(0)
  expect(bounds.right).toBeLessThanOrEqual(bounds.width)
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.height)
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth + 1)
  for (const name of ['Close', 'Check again']) {
    await expect(dialog(page).getByRole('button', { exact: true, name })).toBeInViewport()
  }
}

for (const viewport of [
  { height: 800, width: 1280 },
  { height: 620, width: 900 },
]) {
  test(`manual app update check shows literal bounded release notes at ${viewport.width}×${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport)
    const notes = (
      `<h1>Release notes</h1> <a href="https://example.invalid">literal text</a>\n` +
      'A long update description without active markup.\n'
    )
      .repeat(160)
      .slice(0, 16_000)
    const version = `0.2.0-dev.${'a'.repeat(96)}`
    await mountUpdatesApp(page, {
      checks: [{ snapshot: { ...available(version, notes), notesTruncated: true } }],
    })
    expect(await calls(page)).toMatchObject({ checkCalls: 0, statusCalls: 0 })
    await openUpdates(page)
    await expect(dialog(page).getByText(currentVersion, { exact: true })).toBeVisible()
    await expect(dialog(page).getByText(version, { exact: true })).toBeVisible()
    const releaseNotes = dialog(page).getByRole('region', { exact: true, name: 'Release notes' })
    await expect(releaseNotes).toHaveText(notes)
    await expect(releaseNotes.locator('a, h1, script, img')).toHaveCount(0)
    await expect(dialog(page)).toContainText('Release notes were shortened for display.')
    await expect(dialog(page)).toContainText('Installation is not available in this build.')
    await expect(dialog(page).getByRole('button', { exact: true, name: 'Download' })).toBeEnabled()
    await expect(dialog(page).getByRole('button', { name: /install/i })).toHaveCount(0)
    expect(await calls(page)).toMatchObject({ checkCalls: 1, mutationCalls: [], statusCalls: 1 })
    await assertModalFits(page)
    await page.screenshot({
      path: testInfo.outputPath(`updates-available-${viewport.width}x${viewport.height}.png`),
    })
    await dialog(page).getByRole('button', { exact: true, name: 'Close' }).click()
    await expect(dialog(page)).toHaveCount(0)
    expect(await calls(page)).toMatchObject({ checkCalls: 1, mutationCalls: [] })
  })
}

test('up-to-date is a manual result without download, install or a model update', async ({
  page,
}) => {
  await mountUpdatesApp(page)
  expect(await calls(page)).toMatchObject({ checkCalls: 0, statusCalls: 0 })
  await openUpdates(page)
  await expect(dialog(page)).toContainText('ImageGen Studio is up to date.')
  await expect(dialog(page)).not.toContainText('Available version')
  expect(await calls(page)).toMatchObject({ checkCalls: 1, mutationCalls: [] })
})

for (const omitDomain of [false, true]) {
  test(`unavailable app updates remain readable with ${omitDomain ? 'an older explicit mock' : 'a refused source'}`, async ({
    page,
  }) => {
    await mountUpdatesApp(page, {
      checks: [{ snapshot: snapshot('unavailable') }],
      omitDomain,
      status: snapshot('unavailable'),
    })
    await openUpdates(page)
    await expect(dialog(page)).toContainText('Update checking is not available in this build.')
    await expect(dialog(page).getByRole('button', { exact: true, name: 'Close' })).toBeEnabled()
    await expect(
      dialog(page).getByRole('button', { exact: true, name: 'Check again' }),
    ).toBeEnabled()
    expect(await calls(page)).toMatchObject({ checkCalls: omitDomain ? 0 : 1, mutationCalls: [] })
  })
}

test('offline/error result permits explicit retry and then reports up to date', async ({
  page,
}) => {
  await mountUpdatesApp(page, {
    checks: [{ snapshot: snapshot('error') }, { snapshot: snapshot('up-to-date') }],
  })
  await openUpdates(page)
  await expect(dialog(page)).toContainText(
    'Could not check for updates. Check your connection and try again.',
  )
  expect(await calls(page)).toMatchObject({ checkCalls: 1, mutationCalls: [] })
  await dialog(page).getByRole('button', { exact: true, name: 'Check again' }).click()
  await expect(dialog(page)).toContainText('ImageGen Studio is up to date.')
  expect(await calls(page)).toMatchObject({ checkCalls: 2, mutationCalls: [] })
})

test('failed status read exposes its public error and does not begin a check until retry', async ({
  page,
}) => {
  await mountUpdatesApp(page, { statusFailure: 'public-error' })
  await openUpdates(page)
  await expect(dialog(page)).toContainText(publicFailure)
  expect(await calls(page)).toMatchObject({ checkCalls: 0, statusCalls: 1 })
  await dialog(page).getByRole('button', { exact: true, name: 'Check again' }).click()
  await expect(dialog(page)).toContainText('ImageGen Studio is up to date.')
  expect(await calls(page)).toMatchObject({ checkCalls: 1, mutationCalls: [] })
})

test('unexpected check exception shows fixed retry copy without native error details', async ({
  page,
}) => {
  await mountUpdatesApp(page, {
    checks: [{ kind: 'throw' }, { snapshot: snapshot('up-to-date') }],
  })
  await openUpdates(page)
  await expect(dialog(page)).toContainText(genericFailure)
  await expect(dialog(page)).not.toContainText('/private/fixture')
  await dialog(page).getByRole('button', { exact: true, name: 'Check again' }).click()
  await expect(dialog(page)).toContainText('ImageGen Studio is up to date.')
})

test('public check error stays visible when the earlier status getter said checking', async ({
  page,
}) => {
  await mountUpdatesApp(page, {
    checks: [{ kind: 'public-error' }, { snapshot: snapshot('up-to-date') }],
    status: snapshot('checking'),
  })
  await openUpdates(page)
  await expect(dialog(page)).toContainText(publicFailure)
  await expect(dialog(page).getByRole('status')).toHaveCount(0)
  await dialog(page).getByRole('button', { exact: true, name: 'Check again' }).click()
  await expect(dialog(page)).toContainText('ImageGen Studio is up to date.')
})

test('duplicate Help selection starts once and pending checks can be closed', async ({ page }) => {
  await mountUpdatesApp(page, { checks: [{ hold: true, snapshot: snapshot('up-to-date') }] })
  await page.getByRole('button', { exact: true, name: 'Help menu' }).click()
  await page.getByText('Check for Updates…', { exact: true }).evaluate((element) => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await expect.poll(async () => (await calls(page)).checkCalls).toBe(1)
  await expect(dialog(page).getByRole('status')).toContainText('Checking for updates…')
  await expect(
    dialog(page).getByRole('button', { exact: true, name: 'Check again' }),
  ).toBeDisabled()
  await expect(dialog(page).getByRole('button', { exact: true, name: 'Close' })).toBeEnabled()
  expect(await calls(page)).toMatchObject({ statusCalls: 1 })
  await dialog(page).getByRole('button', { exact: true, name: 'Close' }).click()
  await page.evaluate(() => (globalThis as UpdatesGlobal).applicationUpdatesFixture.releaseCheck(1))
  await expect.poll(async () => (await calls(page)).returnedChecks).toBe(1)
  await expect(dialog(page)).toHaveCount(0)
  expect(await calls(page)).toMatchObject({ checkCalls: 1, mutationCalls: [] })
})

test('old check response cannot replace the result after Close and reopen', async ({ page }) => {
  await mountUpdatesApp(page, {
    checks: [
      { hold: true, snapshot: available('0.2.0', 'Old result must remain retired.') },
      { snapshot: available('0.3.0', 'Current result.') },
    ],
  })
  await openUpdates(page)
  await expect.poll(async () => (await calls(page)).checkCalls).toBe(1)
  await dialog(page).getByRole('button', { exact: true, name: 'Close' }).click()
  await openUpdates(page)
  await expect(dialog(page).getByText('0.3.0', { exact: true })).toBeVisible()
  await page.evaluate(() => (globalThis as UpdatesGlobal).applicationUpdatesFixture.releaseCheck(1))
  await expect.poll(async () => (await calls(page)).returnedChecks).toBe(2)
  await expect(dialog(page).getByText('0.3.0', { exact: true })).toBeVisible()
  await expect(dialog(page)).not.toContainText('Old result must remain retired.')
  await expect(dialog(page).getByRole('button', { exact: true, name: 'Check again' })).toBeEnabled()
  expect(await calls(page)).toMatchObject({ checkCalls: 2, mutationCalls: [], statusCalls: 2 })
})

test('old check completion cannot clear the newer pending check after reopen', async ({ page }) => {
  await mountUpdatesApp(page, {
    checks: [
      { hold: true, snapshot: available('0.2.0', 'Retired result.') },
      { hold: true, snapshot: available('0.3.0', 'Current result.') },
    ],
  })
  await openUpdates(page)
  await expect.poll(async () => (await calls(page)).checkCalls).toBe(1)
  await dialog(page).getByRole('button', { exact: true, name: 'Close' }).click()
  await openUpdates(page)
  await expect.poll(async () => (await calls(page)).checkCalls).toBe(2)
  await page.evaluate(() => (globalThis as UpdatesGlobal).applicationUpdatesFixture.releaseCheck(1))
  await expect.poll(async () => (await calls(page)).returnedChecks).toBe(1)
  await expect(dialog(page).getByRole('status')).toContainText('Checking for updates…')
  await expect(
    dialog(page).getByRole('button', { exact: true, name: 'Check again' }),
  ).toBeDisabled()
  await expect(dialog(page)).not.toContainText('Retired result.')
  await page.evaluate(() => (globalThis as UpdatesGlobal).applicationUpdatesFixture.releaseCheck(2))
  await expect(dialog(page).getByText('0.3.0', { exact: true })).toBeVisible()
  expect(await calls(page)).toMatchObject({ checkCalls: 2, mutationCalls: [], statusCalls: 2 })
})

test('old status getter cannot start another check after Close and reopen', async ({ page }) => {
  await mountUpdatesApp(page, {
    checks: [{ snapshot: available('0.3.0', 'Current result.') }],
    statusHeld: true,
  })
  await openUpdates(page)
  await expect.poll(async () => (await calls(page)).statusCalls).toBe(1)
  expect(await calls(page)).toMatchObject({ checkCalls: 0 })
  await dialog(page).getByRole('button', { exact: true, name: 'Close' }).click()
  await openUpdates(page)
  await expect(dialog(page).getByText('0.3.0', { exact: true })).toBeVisible()
  await page.evaluate(() => (globalThis as UpdatesGlobal).applicationUpdatesFixture.releaseStatus())
  await expect.poll(async () => (await calls(page)).returnedStatuses).toBe(2)
  await expect(dialog(page).getByText('0.3.0', { exact: true })).toBeVisible()
  expect(await calls(page)).toMatchObject({ checkCalls: 1, mutationCalls: [], statusCalls: 2 })
})

test('Download is explicit, captures the displayed version and shows polled transfer progress', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ height: 620, width: 900 })
  await mountUpdatesApp(page, {
    checks: [{ snapshot: available('0.2.0') }],
    downloads: [{ hold: true, snapshot: downloadStatus('downloaded', 4096, 4096) }],
  })
  expect(await calls(page)).toMatchObject({ checkCalls: 0, downloadVersions: [], statusCalls: 0 })
  await openUpdates(page)
  expect(await calls(page)).toMatchObject({ checkCalls: 1, downloadVersions: [] })
  await dialog(page).getByRole('button', { exact: true, name: 'Download' }).click()
  await expect(dialog(page).getByRole('status')).toContainText('Downloading and verifying…')
  await expect(dialog(page)).toContainText('Closing this dialog leaves the download running.')
  await expect(dialog(page).getByRole('button', { exact: true, name: 'Close' })).toBeEnabled()
  await expect(
    dialog(page).getByRole('button', { exact: true, name: 'Check again' }),
  ).toBeDisabled()
  await page.evaluate(
    (progress) => (globalThis as UpdatesGlobal).applicationUpdatesFixture.setStatus(progress),
    downloadStatus('downloading', 1024, 4096),
  )
  await expect(dialog(page).getByRole('status')).toContainText('1.0 KiB of 4.0 KiB')
  await expect(dialog(page).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25')
  expect(await calls(page)).toMatchObject({
    checkCalls: 1,
    downloadVersions: ['0.2.0'],
    mutationCalls: ['app-download'],
  })
  await assertModalFits(page)
  await page.screenshot({ path: testInfo.outputPath('updates-download-900x620.png') })
  await page.evaluate(() =>
    (globalThis as UpdatesGlobal).applicationUpdatesFixture.releaseDownload(1),
  )
  await expect(dialog(page)).toContainText('Download completed')
  await expect(dialog(page)).toContainText('The saved file matches the update metadata checksum.')
  await expect(dialog(page)).toContainText(
    'Publisher authenticity and installation have not been verified.',
  )
  await expect(dialog(page)).toContainText('Installation is not available in this build.')
  await expect(dialog(page).getByRole('button', { name: /install|cancel/i })).toHaveCount(0)
  await expect(
    dialog(page).getByRole('button', { exact: true, name: 'Download again' }),
  ).toBeEnabled()
  await page.screenshot({ path: testInfo.outputPath('updates-downloaded-900x620.png') })
})

test('download failure remains retryable with the same displayed version and no new check', async ({
  page,
}) => {
  await mountUpdatesApp(page, {
    checks: [{ snapshot: available('0.2.0') }],
    downloads: [
      { snapshot: downloadStatus('download-error') },
      { snapshot: downloadStatus('downloaded', 4096, 4096) },
    ],
  })
  await openUpdates(page)
  await dialog(page).getByRole('button', { exact: true, name: 'Download' }).click()
  await expect(dialog(page)).toContainText('Could not download or verify the update.')
  await expect(dialog(page).getByText('0.2.0', { exact: true })).toBeVisible()
  await dialog(page).getByRole('button', { exact: true, name: 'Retry download' }).click()
  await expect(dialog(page)).toContainText('Download completed')
  expect(await calls(page)).toMatchObject({
    checkCalls: 1,
    downloadVersions: ['0.2.0', '0.2.0'],
    mutationCalls: ['app-download', 'app-download'],
  })
})

test('Close and reopen recovers a running download through read-only status without another check', async ({
  page,
}) => {
  await mountUpdatesApp(page, {
    checks: [{ snapshot: available('0.2.0') }],
    downloads: [{ hold: true, snapshot: downloadStatus('downloaded', 4096, 4096) }],
  })
  await openUpdates(page)
  await dialog(page).getByRole('button', { exact: true, name: 'Download' }).click()
  await expect.poll(async () => (await calls(page)).downloadVersions.length).toBe(1)
  await dialog(page).getByRole('button', { exact: true, name: 'Close' }).click()
  await page.evaluate(
    (progress) => (globalThis as UpdatesGlobal).applicationUpdatesFixture.setStatus(progress),
    downloadStatus('downloading', 2048, 4096),
  )
  await openUpdates(page)
  await expect(dialog(page).getByRole('status')).toContainText('2.0 KiB of 4.0 KiB')
  expect(await calls(page)).toMatchObject({ checkCalls: 1, downloadVersions: ['0.2.0'] })
  await page.evaluate(() =>
    (globalThis as UpdatesGlobal).applicationUpdatesFixture.releaseDownload(1),
  )
  await expect(dialog(page)).toContainText('Download completed')
  expect(await calls(page)).toMatchObject({
    checkCalls: 1,
    downloadVersions: ['0.2.0'],
    mutationCalls: ['app-download'],
  })
})

for (const status of ['downloaded', 'download-error'] as const) {
  test(`reopening ${status} status does not check or download until an explicit action`, async ({
    page,
  }) => {
    await mountUpdatesApp(page, {
      checks: [{ snapshot: available('0.3.0') }],
      status: downloadStatus(
        status,
        status === 'downloaded' ? 4096 : null,
        status === 'downloaded' ? 4096 : null,
      ),
    })
    await openUpdates(page)
    await expect(dialog(page)).toContainText(
      status === 'downloaded' ? 'Download completed' : 'Download failed',
    )
    expect(await calls(page)).toMatchObject({ checkCalls: 0, downloadVersions: [], statusCalls: 1 })
    await dialog(page).getByRole('button', { exact: true, name: 'Check again' }).click()
    await expect(dialog(page).getByText('0.3.0', { exact: true })).toBeVisible()
    expect(await calls(page)).toMatchObject({ checkCalls: 1, downloadVersions: [] })
  })
}

test('a held progress read cannot resurrect downloading after its terminal result', async ({
  page,
}) => {
  await mountUpdatesApp(page, {
    checks: [{ snapshot: available('0.2.0') }],
    downloads: [{ hold: true, snapshot: downloadStatus('downloaded', 4096, 4096) }],
    statusHolds: [2],
  })
  await openUpdates(page)
  await dialog(page).getByRole('button', { exact: true, name: 'Download' }).click()
  await expect.poll(async () => (await calls(page)).statusCalls).toBe(2)
  await page.evaluate(() =>
    (globalThis as UpdatesGlobal).applicationUpdatesFixture.releaseDownload(1),
  )
  await expect(dialog(page)).toContainText('Download completed')
  await page.evaluate(() =>
    (globalThis as UpdatesGlobal).applicationUpdatesFixture.releaseStatus(2),
  )
  await expect.poll(async () => (await calls(page)).returnedStatuses).toBe(2)
  await expect(dialog(page)).toContainText('Download completed')
  await expect(dialog(page).getByRole('status')).toHaveCount(0)
  await expect(
    dialog(page).getByRole('button', { exact: true, name: 'Download again' }),
  ).toBeEnabled()
})

test('old download reply cannot replace a newer selected version after dismissal', async ({
  page,
}) => {
  await mountUpdatesApp(page, {
    checks: [{ snapshot: available('0.2.0') }, { snapshot: available('0.3.0') }],
    downloads: [{ hold: true, snapshot: downloadStatus('downloaded', 4096, 4096) }],
  })
  await openUpdates(page)
  await dialog(page).getByRole('button', { exact: true, name: 'Download' }).click()
  await expect.poll(async () => (await calls(page)).downloadVersions.length).toBe(1)
  await dialog(page).getByRole('button', { exact: true, name: 'Close' }).click()
  // Controlled API replies model a completed Main operation whose old IPC response is held.
  await page.evaluate(
    (value) => (globalThis as UpdatesGlobal).applicationUpdatesFixture.setStatus(value),
    snapshot('idle'),
  )
  await openUpdates(page)
  await expect(dialog(page).getByText('0.3.0', { exact: true })).toBeVisible()
  await page.evaluate(() =>
    (globalThis as UpdatesGlobal).applicationUpdatesFixture.releaseDownload(1),
  )
  await expect.poll(async () => (await calls(page)).returnedDownloads).toBe(1)
  await expect(dialog(page).getByText('0.3.0', { exact: true })).toBeVisible()
  await expect(dialog(page)).not.toContainText('Download completed')
  await expect(dialog(page).getByRole('button', { exact: true, name: 'Download' })).toBeEnabled()
  expect(await calls(page)).toMatchObject({ checkCalls: 2, downloadVersions: ['0.2.0'] })
})

test('successful download clears a transient progress read error', async ({ page }) => {
  await mountUpdatesApp(page, {
    checks: [{ snapshot: available('0.2.0') }],
    downloads: [{ hold: true, snapshot: downloadStatus('downloaded', 4096, 4096) }],
    statusFailures: [2],
  })
  await openUpdates(page)
  await dialog(page).getByRole('button', { exact: true, name: 'Download' }).click()
  await expect(dialog(page)).toContainText(publicFailure)
  await page.evaluate(() =>
    (globalThis as UpdatesGlobal).applicationUpdatesFixture.releaseDownload(1),
  )
  await expect.poll(async () => (await calls(page)).returnedDownloads).toBe(1)
  await expect(dialog(page)).toContainText('Download completed')
  await expect(dialog(page)).not.toContainText(publicFailure)
  expect(await calls(page)).toMatchObject({ checkCalls: 1, downloadVersions: ['0.2.0'] })
})
