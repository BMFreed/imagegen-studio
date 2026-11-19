import type { ApiResult } from '../../../src/shared/api.js'
import type {
  ApplicationUpdateRecoverySnapshot,
  ApplicationUpdateSnapshot,
} from '../../../src/shared/application-updates.js'
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
  recoveries?: RecoveryPlan[]
  recoverySaves?: RecoverySavePlan[]
  status?: ApplicationUpdateSnapshot
  statusFailure?: 'public-error' | 'throw'
  statusFailures?: number[]
  statusHeld?: boolean
  statusHolds?: number[]
}

interface RecoveryPlan {
  hold?: boolean
  kind?: 'malformed' | 'public-error' | 'throw'
  snapshot?: ApplicationUpdateRecoverySnapshot
}

interface RecoverySavePlan {
  hold?: boolean
  result: 'canceled' | 'public-error' | 'saved' | 'throw'
}

interface UpdatesFixture {
  checkCalls: number
  downloadVersions: string[]
  mutationCalls: string[]
  recoveryCalls: number
  recoverySaveVersions: string[]
  releaseCheck: (id: number) => void
  releaseDownload: (id: number) => void
  releaseRecovery: (id: number) => void
  releaseRecoverySave: (id: number) => void
  releaseStatus: (id?: number) => void
  returnedChecks: number
  returnedDownloads: number
  returnedRecoveries: number
  returnedRecoverySaves: number
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
    verification: null,
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
    verification: 'metadata-only',
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
        verification: null,
      }
      const pendingChecks = new Map<number, () => void>()
      const pendingDownloads = new Map<number, () => void>()
      const pendingRecoveries = new Map<number, () => void>()
      const pendingRecoverySaves = new Map<number, () => void>()
      const pendingStatuses = new Map<number, () => void>()
      let currentStatus = structuredClone(initialStatus)
      const state: UpdatesFixture = {
        checkCalls: 0,
        downloadVersions: [],
        mutationCalls: [],
        recoveryCalls: 0,
        recoverySaveVersions: [],
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
        releaseRecovery: (id) => {
          const resolve = pendingRecoveries.get(id)
          if (!resolve) {
            throw new Error(`No controlled pending recovery status ${id}.`)
          }
          pendingRecoveries.delete(id)
          resolve()
        },
        releaseRecoverySave: (id) => {
          const resolve = pendingRecoverySaves.get(id)
          if (!resolve) {
            throw new Error(`No controlled pending recovery save ${id}.`)
          }
          pendingRecoverySaves.delete(id)
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
        returnedRecoveries: 0,
        returnedRecoverySaves: 0,
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
                    snapshot: { ...initialStatus, status: 'up-to-date', verification: null },
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
                getRecoveryStatus: async (): Promise<
                  ApiResult<ApplicationUpdateRecoverySnapshot>
                > => {
                  const id = ++state.recoveryCalls
                  const plan = initial.recoveries?.[id - 1] ?? {
                    snapshot: { status: 'not-checked' as const },
                  }
                  if (plan.hold) {
                    await new Promise<void>((resolve) => pendingRecoveries.set(id, resolve))
                  }
                  state.returnedRecoveries++
                  if (plan.kind === 'throw') {
                    throw new Error('Unexpected recovery detail at /private/fixture/recovery.')
                  }
                  if (plan.kind === 'public-error') {
                    return {
                      error: { code: 'IPC_INVALID_RESPONSE', message: 'Recovery unavailable.' },
                      ok: false,
                    }
                  }
                  return {
                    ok: true,
                    value:
                      plan.kind === 'malformed'
                        ? ({
                            privatePath: '/private/fixture/recovery',
                            status: 'clear',
                          } as unknown as ApplicationUpdateRecoverySnapshot)
                        : structuredClone(plan.snapshot ?? { status: 'not-checked' }),
                  }
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
                reviewInstallation: async (availableVersion: string) => {
                  state.mutationCalls.push('app-review')
                  return {
                    ok: true,
                    value: {
                      activeModelInstallCount: 0,
                      availableVersion,
                      generationStorageUnavailable: false,
                      installationAvailable: true,
                      openProjectCount: 0,
                      preparingModelInstallCount: 0,
                      resourceRemovalActive: false,
                      unacceptedResultCount: 0,
                      unfinishedJobCount: 0,
                      unsavedProjectCount: 0,
                    },
                  }
                },
                saveRecovery: async (
                  version: string,
                ): Promise<ApiResult<{ status: 'canceled' | 'saved' }>> => {
                  const id = state.recoverySaveVersions.push(version)
                  state.mutationCalls.push('app-save-recovery')
                  const plan = initial.recoverySaves?.[id - 1] ?? { result: 'saved' as const }
                  if (plan.hold) {
                    await new Promise<void>((resolve) => pendingRecoverySaves.set(id, resolve))
                  }
                  state.returnedRecoverySaves++
                  if (plan.result === 'throw') {
                    throw new Error('Unexpected native failure at /private/fixture/recovery.')
                  }
                  if (plan.result === 'public-error') {
                    return {
                      error: {
                        code: 'APP_UPDATE_RECOVERY_DESTINATION_EXISTS',
                        message: 'Choose a new AppImage name.',
                      },
                      ok: false,
                    }
                  }
                  return { ok: true, value: { status: plan.result } }
                },
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
      recoveryCalls,
      recoverySaveVersions,
      returnedChecks,
      returnedDownloads,
      returnedRecoveries,
      returnedRecoverySaves,
      returnedStatuses,
      statusCalls,
    } = (globalThis as UpdatesGlobal).applicationUpdatesFixture
    return {
      checkCalls,
      downloadVersions,
      mutationCalls,
      recoveryCalls,
      recoverySaveVersions,
      returnedChecks,
      returnedDownloads,
      returnedRecoveries,
      returnedRecoverySaves,
      returnedStatuses,
      statusCalls,
    }
  })
}

async function assertModalFits(page: Page) {
  // Bounds during Naive's entering scale transition do not describe the settled dialog.
  await expect
    .poll(() => dialog(page).evaluate((element) => getComputedStyle(element).transform))
    .toBe('none')
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
    await expect(
      dialog(page).getByRole('button', { name: /^Install(?: and restart)?$/i }),
    ).toHaveCount(0)
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
  await expect(dialog(page)).not.toContainText('Publisher signature verified.')
  await expect(dialog(page)).not.toContainText('Compatibility declaration accepted.')
  await expect(dialog(page)).toContainText('Installation is not available in this build.')
  await expect(
    dialog(page).getByRole('button', { name: /^(?:Install(?: and restart)?|Cancel)$/i }),
  ).toHaveCount(0)
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

for (const status of ['available', 'downloaded'] as const) {
  test(`signed ${status} distinguishes the accepted declaration from engine readiness`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ height: 620, width: 900 })
    const signed: ApplicationUpdateSnapshot = {
      ...(status === 'available'
        ? available('0.2.0', 'Signed notes remain plain text.\n'.repeat(400))
        : downloadStatus('downloaded', 4096, 4096)),
      verification: 'signed-release',
    }
    await mountUpdatesApp(
      page,
      status === 'available' ? { checks: [{ snapshot: signed }] } : { status: signed },
    )
    await openUpdates(page)
    await expect(dialog(page)).toContainText('Publisher signature verified.')
    await expect(dialog(page)).toContainText(
      'Compatibility declaration accepted. The image engine will be checked after restart.',
    )
    await expect(dialog(page)).toContainText(
      status === 'downloaded'
        ? 'Review installation availability and what must close before restarting.'
        : 'Download and verify the update before reviewing installation.',
    )
    await expect(dialog(page)).not.toContainText(
      'Publisher authenticity and installation have not been verified.',
    )
    await expect(dialog(page)).not.toContainText('ready to install')
    await expect(
      dialog(page).getByRole('button', { name: /^(?:Install(?: and restart)?|Restart)$/i }),
    ).toHaveCount(0)
    if (status === 'downloaded') {
      await expect(dialog(page)).toContainText(
        'The saved file matches the update metadata checksum.',
      )
      await expect(dialog(page)).toContainText('Installation has not started.')
      await expect(
        dialog(page).getByRole('button', { exact: true, name: 'Download again' }),
      ).toBeEnabled()
    } else {
      await expect(
        dialog(page).getByRole('button', { exact: true, name: 'Download' }),
      ).toBeEnabled()
    }
    expect(await calls(page)).toMatchObject({
      checkCalls: status === 'available' ? 1 : 0,
      downloadVersions: [],
      mutationCalls: [],
      statusCalls: 1,
    })
    await assertModalFits(page)
    await page.screenshot({ path: testInfo.outputPath(`updates-signed-${status}-900x620.png`) })
  })
}

test('invalid or missing verification cannot be a signed public snapshot and a refused check stays visible', async ({
  page,
}) => {
  const original = available('0.2.0')
  const missing: Partial<ApplicationUpdateSnapshot> = { ...original }
  delete missing.verification
  expect(isApplicationUpdateSnapshot(missing)).toBe(false)
  expect(isApplicationUpdateSnapshot({ ...original, verification: 'trusted' })).toBe(false)
  // This renderer fixture replaces preload/Main. It checks the shared DTO guard
  // directly, then presents a controlled public refusal; it does not qualify the
  // actual preload's rejection of malformed native responses.
  await mountUpdatesApp(page, {
    checks: [
      { kind: 'public-error' },
      { snapshot: { ...original, verification: 'signed-release' } },
    ],
  })
  await openUpdates(page)
  await expect(dialog(page)).toContainText(publicFailure)
  await expect(dialog(page)).not.toContainText('Publisher signature verified.')
  await expect(dialog(page).getByRole('button', { exact: true, name: 'Download' })).toHaveCount(0)
  expect(await calls(page)).toMatchObject({
    checkCalls: 1,
    downloadVersions: [],
    mutationCalls: [],
  })
  await dialog(page).getByRole('button', { exact: true, name: 'Check again' }).click()
  await expect(dialog(page)).toContainText('Publisher signature verified.')
  expect(await calls(page)).toMatchObject({
    checkCalls: 2,
    downloadVersions: [],
    mutationCalls: [],
  })
})

const recoveryStates: { name: string; value: ApplicationUpdateRecoverySnapshot }[] = [
  { name: 'not checked', value: { status: 'not-checked' } },
  { name: 'clear', value: { status: 'clear' } },
  {
    name: 'unverified target',
    value: { runtime: 'unverified', status: 'required', target: 'unverified' },
  },
  {
    name: 'verified target',
    value: { runtime: 'unverified', status: 'required', target: 'verified' },
  },
  {
    name: 'matching publisher runtime',
    value: { runtime: 'verified-publisher-declaration', status: 'required', target: 'verified' },
  },
]

for (const recovery of recoveryStates) {
  test(`startup recovery ${recovery.name} is independent of an unavailable publisher`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ height: 620, width: 900 })
    await mountUpdatesApp(page, {
      checks: [{ snapshot: snapshot('unavailable') }],
      recoveries: [{ snapshot: recovery.value }],
    })
    expect(await calls(page)).toMatchObject({ checkCalls: 0, mutationCalls: [], recoveryCalls: 0 })
    await openUpdates(page)
    await expect(dialog(page)).toContainText('Updates unavailable')
    const card = dialog(page).getByRole('region', {
      exact: true,
      name: 'Application update recovery at startup',
    })
    if (recovery.value.status === 'required') {
      await expect(card).toBeVisible()
      await expect(card).toContainText('At app startup')
      await expect(card).toContainText('Installation is blocked while update recovery is required.')
      await expect(card).toContainText(
        recovery.value.target === 'verified'
          ? 'Application file: publisher signature verified.'
          : 'Application file: could not be verified.',
      )
      await expect(card).toContainText(
        recovery.value.runtime === 'verified-publisher-declaration'
          ? 'Runtime files: match the signed publisher declaration.'
          : 'Runtime files: could not be verified.',
      )
      await expect(card).toContainText('These checks do not establish image-engine readiness.')
      await expect(card.getByRole('button')).toHaveCount(0)
    } else {
      await expect(card).toHaveCount(0)
      if (recovery.value.status === 'not-checked') {
        await expect(dialog(page)).toContainText(
          'Application update recovery was not checked at app startup.',
        )
      } else {
        await expect(dialog(page)).not.toContainText('Application update recovery was not checked')
        await expect(dialog(page)).not.toContainText('safe to install')
      }
    }
    await expect(
      dialog(page).getByRole('button', {
        name: /^(?:Review installation|Install and restart|Refresh preview|Save recovery AppImage)$/,
      }),
    ).toHaveCount(0)
    await expect(
      dialog(page).getByRole('button', { exact: true, name: 'Check again' }),
    ).toBeEnabled()
    expect(await calls(page)).toMatchObject({
      checkCalls: 1,
      mutationCalls: [],
      recoveryCalls: 1,
      returnedRecoveries: 1,
      statusCalls: 1,
    })
    await assertModalFits(page)
    await page.screenshot({ path: testInfo.outputPath('startup-recovery-900x620.png') })
  })
}

async function emitInstallationIntents(page: Page, intents = ['reviewInstallation', 'install']) {
  // Controlled Vue intent port: exercise App's guards even when the modal hides its buttons.
  await dialog(page).evaluate((element, intents) => {
    type Instance = {
      emit: (name: string, value: string) => void
      parent: Instance | null
      type: { __name?: string }
    }
    let instance = (element as HTMLElement & { __vueParentComponent?: Instance })
      .__vueParentComponent
    while (instance && instance.type.__name !== 'ApplicationUpdatesModal') {
      instance = instance.parent ?? undefined
    }
    if (!instance) {
      throw new Error('The actual application Updates modal owner was not found.')
    }
    for (const intent of intents) {
      instance.emit(intent, '0.2.0')
    }
  }, intents)
}

test('required startup recovery blocks installation intents while explicit Check and Download remain available', async ({
  page,
}) => {
  const signed = { ...available('0.2.0'), verification: 'signed-release' as const }
  await mountUpdatesApp(page, {
    checks: [{ snapshot: signed }, { snapshot: signed }],
    recoveries: [
      {
        snapshot: {
          runtime: 'verified-publisher-declaration',
          status: 'required',
          target: 'verified',
        },
      },
    ],
  })
  await openUpdates(page)
  await expect(dialog(page).getByRole('button', { exact: true, name: 'Download' })).toBeEnabled()
  const saveRecovery = dialog(page).getByRole('button', {
    exact: true,
    name: 'Save recovery AppImage',
  })
  await expect(saveRecovery).toHaveCount(0)
  await emitInstallationIntents(page, ['saveRecovery'])
  expect(await calls(page)).toMatchObject({ mutationCalls: [] })
  await dialog(page).getByRole('button', { exact: true, name: 'Download' }).click()
  await expect(dialog(page)).toContainText('Download completed')
  await expect(saveRecovery).toBeEnabled()
  await expect(
    dialog(page).getByRole('button', { exact: true, name: 'Download again' }),
  ).toBeEnabled()
  await expect(
    dialog(page).getByRole('button', {
      name: /^(?:Review installation|Install and restart|Refresh preview)$/,
    }),
  ).toHaveCount(0)
  await expect(dialog(page)).not.toContainText(
    'Review installation availability and what must close',
  )
  await emitInstallationIntents(page)
  expect(await calls(page)).toMatchObject({ mutationCalls: ['app-download'], recoveryCalls: 1 })
  await dialog(page).getByRole('button', { exact: true, name: 'Check again' }).click()
  await expect.poll(async () => (await calls(page)).returnedChecks).toBe(2)
  await expect(saveRecovery).toHaveCount(0)
  await expect(
    dialog(page).getByRole('region', {
      exact: true,
      name: 'Application update recovery at startup',
    }),
  ).toBeVisible()
  expect(await calls(page)).toMatchObject({
    checkCalls: 2,
    downloadVersions: ['0.2.0'],
    mutationCalls: ['app-download'],
    recoveryCalls: 1,
  })
})

test('explicit recovery AppImage Save shows pending and manual reopen in Updates', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ height: 620, width: 900 })
  await mountUpdatesApp(page, {
    checks: [{ snapshot: { ...available('0.3.0'), verification: 'signed-release' } }],
    recoveries: [
      {
        snapshot: { runtime: 'unverified', status: 'required', target: 'unverified' },
      },
    ],
    recoverySaves: [{ hold: true, result: 'saved' }, { result: 'canceled' }],
    status: { ...downloadStatus('downloaded', 4096, 4096), verification: 'signed-release' },
  })
  await openUpdates(page)
  const modal = dialog(page)
  const save = modal.getByRole('button', { exact: true, name: 'Save recovery AppImage' })
  await expect(save).toBeEnabled()
  await expect(modal).toContainText('Save the verified AppImage to a new location')
  await assertModalFits(page)
  await expect(save).toBeInViewport()
  await page.screenshot({ path: testInfo.outputPath('recovery-appimage-ready-900x620.png') })
  expect(await calls(page)).toMatchObject({ mutationCalls: [], recoverySaveVersions: [] })
  await save.focus()
  await expect(save).toBeFocused()
  await save.press('Enter')
  await expect(modal.getByRole('status')).toContainText('Saving recovery AppImage…')
  await expect(save).toBeDisabled()
  await expect(modal.getByRole('button', { exact: true, name: 'Check again' })).toBeDisabled()
  await expect(modal.getByRole('button', { exact: true, name: 'Close' })).toBeDisabled()
  await expect(modal.getByRole('button', { exact: true, name: 'Download again' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(modal).toBeVisible()
  await emitInstallationIntents(page, ['saveRecovery'])
  expect(await calls(page)).toMatchObject({
    mutationCalls: ['app-save-recovery'],
    recoverySaveVersions: ['0.2.0'],
    returnedRecoverySaves: 0,
  })
  await page.setViewportSize({ height: 800, width: 1280 })
  await assertModalFits(page)
  await page.screenshot({ path: testInfo.outputPath('recovery-appimage-pending-1280x800.png') })
  await page.evaluate(() =>
    (globalThis as UpdatesGlobal).applicationUpdatesFixture.releaseRecoverySave(1),
  )
  await expect(modal).toContainText('Recovery AppImage saved')
  await expect(modal).toContainText('Close ImageGen Studio, then open the AppImage you saved.')
  await expect(modal).toContainText('Application update recovery required')
  await expect(save).toHaveCount(0)
  await expect(modal.getByRole('button', { exact: true, name: 'Install and restart' })).toHaveCount(
    0,
  )
  await expect(modal.getByRole('button', { exact: true, name: 'Check again' })).toBeEnabled()
  await page.setViewportSize({ height: 620, width: 900 })
  await assertModalFits(page)
  await page.screenshot({ path: testInfo.outputPath('recovery-appimage-saved-900x620.png') })

  await modal.getByRole('button', { exact: true, name: 'Check again' }).click()
  await expect(modal.getByText('0.3.0', { exact: true })).toBeVisible()
  await expect(modal).not.toContainText('Recovery AppImage saved')
  await expect(save).toHaveCount(0)
  await modal.getByRole('button', { exact: true, name: 'Download' }).click()
  await expect(save).toBeEnabled()
  await expect(modal).not.toContainText('Recovery AppImage saved')
  await save.click()
  await expect.poll(async () => (await calls(page)).returnedRecoverySaves).toBe(2)
  await expect(save).toBeEnabled()
  await modal.getByRole('button', { exact: true, name: 'Close' }).click()
  await expect(modal).not.toBeVisible()
  await expect(page.getByRole('region', { exact: true, name: 'Home' })).toBeVisible()
  expect(await calls(page)).toMatchObject({
    checkCalls: 1,
    downloadVersions: ['0.3.0'],
    mutationCalls: ['app-save-recovery', 'app-download', 'app-save-recovery'],
    recoverySaveVersions: ['0.2.0', '0.3.0'],
    returnedRecoverySaves: 2,
  })
})

test('recovery AppImage picker cancellation and a refused destination keep explicit retry available', async ({
  page,
}) => {
  await mountUpdatesApp(page, {
    recoveries: [
      {
        snapshot: { runtime: 'unverified', status: 'required', target: 'unverified' },
      },
    ],
    recoverySaves: [{ result: 'canceled' }, { result: 'public-error' }, { result: 'throw' }],
    status: { ...downloadStatus('downloaded', 4096, 4096), verification: 'signed-release' },
  })
  await openUpdates(page)
  const modal = dialog(page)
  const save = modal.getByRole('button', { exact: true, name: 'Save recovery AppImage' })
  await save.click()
  await expect.poll(async () => (await calls(page)).returnedRecoverySaves).toBe(1)
  await expect(save).toBeEnabled()
  await expect(modal.getByText('Recovery AppImage saved', { exact: true })).toHaveCount(0)
  await expect(modal).not.toContainText('Recovery AppImage could not be saved')
  await save.click()
  await expect(modal).toContainText('Recovery AppImage could not be saved')
  await expect(modal).toContainText('Choose a new AppImage name.')
  await expect(save).toBeEnabled()
  await save.click()
  await expect.poll(async () => (await calls(page)).returnedRecoverySaves).toBe(3)
  await expect(modal).toContainText('Recovery AppImage could not be saved')
  await expect(modal).not.toContainText('/private/fixture')
  await expect(save).toBeEnabled()
  expect(await calls(page)).toMatchObject({
    checkCalls: 0,
    mutationCalls: ['app-save-recovery', 'app-save-recovery', 'app-save-recovery'],
    recoverySaveVersions: ['0.2.0', '0.2.0', '0.2.0'],
  })
})

for (const recovery of ['clear', 'required'] as const) {
  test(`Save recovery AppImage requires retained recovery and a verified download (${recovery} control)`, async ({
    page,
  }) => {
    await mountUpdatesApp(page, {
      recoveries: [
        {
          snapshot:
            recovery === 'required'
              ? { runtime: 'unverified', status: 'required', target: 'unverified' }
              : { status: 'clear' },
        },
      ],
      status: {
        ...downloadStatus('downloaded', 4096, 4096),
        verification: recovery === 'required' ? 'metadata-only' : 'signed-release',
      },
    })
    await openUpdates(page)
    await expect(
      dialog(page).getByRole('button', { exact: true, name: 'Save recovery AppImage' }),
    ).toHaveCount(0)
    await expect(
      dialog(page).getByRole('button', { exact: true, name: 'Download again' }),
    ).toBeEnabled()
    await emitInstallationIntents(page, ['saveRecovery'])
    expect(await calls(page)).toMatchObject({ mutationCalls: [], recoverySaveVersions: [] })
  })
}

for (const kind of ['public-error', 'malformed', 'throw'] as const) {
  test(`startup recovery getter ${kind} blocks installation without hiding explicit downloads`, async ({
    page,
  }) => {
    await mountUpdatesApp(page, {
      recoveries: [{ kind }],
      status: { ...downloadStatus('downloaded', 4096, 4096), verification: 'signed-release' },
    })
    await openUpdates(page)
    await expect(dialog(page)).toContainText('Application update recovery status unavailable')
    await expect(dialog(page)).toContainText(
      'Application update recovery status could not be read. Close and reopen this dialog to try again.',
    )
    await expect(dialog(page)).not.toContainText('/private/fixture')
    await expect(dialog(page)).not.toContainText(
      'Application update recovery was not checked at app startup.',
    )
    await expect(
      dialog(page).getByRole('button', { exact: true, name: 'Download again' }),
    ).toBeEnabled()
    await expect(
      dialog(page).getByRole('button', {
        name: /^(?:Review installation|Install and restart|Refresh preview)$/,
      }),
    ).toHaveCount(0)
    await emitInstallationIntents(page)
    expect(await calls(page)).toMatchObject({ checkCalls: 0, mutationCalls: [], recoveryCalls: 1 })
  })
}

for (const first of ['required', 'throw'] as const) {
  test(`late startup recovery ${first} cannot replace the reopened dialog snapshot`, async ({
    page,
  }) => {
    await mountUpdatesApp(page, {
      recoveries: [
        first === 'throw'
          ? { hold: true, kind: 'throw' }
          : {
              hold: true,
              snapshot: { runtime: 'unverified', status: 'required', target: 'unverified' },
            },
        { snapshot: { status: 'clear' } },
      ],
      status: { ...downloadStatus('downloaded', 4096, 4096), verification: 'signed-release' },
    })
    await openUpdates(page)
    await expect(dialog(page)).toContainText('Reading application update recovery status…')
    await expect(
      dialog(page).getByRole('button', { exact: true, name: 'Review installation' }),
    ).toHaveCount(0)
    await emitInstallationIntents(page)
    expect(await calls(page)).toMatchObject({ mutationCalls: [], recoveryCalls: 1 })
    await dialog(page).getByRole('button', { exact: true, name: 'Close' }).click()
    await expect(dialog(page)).not.toBeVisible()
    await openUpdates(page)
    await expect(
      dialog(page).getByRole('button', { exact: true, name: 'Review installation' }),
    ).toBeEnabled()
    await page.evaluate(() =>
      (globalThis as UpdatesGlobal).applicationUpdatesFixture.releaseRecovery(1),
    )
    await expect.poll(async () => (await calls(page)).returnedRecoveries).toBe(2)
    await expect(
      dialog(page).getByRole('button', { exact: true, name: 'Review installation' }),
    ).toBeEnabled()
    await expect(dialog(page)).not.toContainText('Application update recovery required')
    await expect(dialog(page)).not.toContainText('Application update recovery status unavailable')
    expect(await calls(page)).toMatchObject({ mutationCalls: [], recoveryCalls: 2 })
  })
}

test('download progress polling never repeats the immutable startup recovery getter', async ({
  page,
}) => {
  await mountUpdatesApp(page, {
    recoveries: [{ snapshot: { runtime: 'unverified', status: 'required', target: 'verified' } }],
    status: { ...downloadStatus('downloading', 1024, 4096), verification: 'signed-release' },
  })
  await openUpdates(page)
  await expect.poll(async () => (await calls(page)).statusCalls).toBeGreaterThanOrEqual(2)
  expect(await calls(page)).toMatchObject({ checkCalls: 0, mutationCalls: [], recoveryCalls: 1 })
  await page.evaluate(() =>
    (globalThis as UpdatesGlobal).applicationUpdatesFixture.setStatus({
      availableVersion: '0.2.0',
      currentVersion: '0.1.0-dev.1',
      downloadedBytes: 4096,
      notesTruncated: false,
      releaseNotes: 'Controlled download.',
      status: 'downloaded',
      totalBytes: 4096,
      verification: 'signed-release',
    }),
  )
  await expect(dialog(page)).toContainText('Download completed')
  await expect(
    dialog(page).getByRole('region', {
      exact: true,
      name: 'Application update recovery at startup',
    }),
  ).toBeVisible()
  expect(await calls(page)).toMatchObject({ checkCalls: 0, mutationCalls: [], recoveryCalls: 1 })
})
