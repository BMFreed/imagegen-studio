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
  omitDomain?: boolean
  status?: ApplicationUpdateSnapshot
  statusFailure?: 'public-error' | 'throw'
  statusHeld?: boolean
}

interface UpdatesFixture {
  checkCalls: number
  mutationCalls: string[]
  releaseCheck: (id: number) => void
  releaseStatus: () => void
  returnedChecks: number
  returnedStatuses: number
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
    notesTruncated: false,
    releaseNotes: null,
    status,
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

/**
 * Actual production App/chrome/modal with explicit API ports replacing preload/Main. These cases
 * qualify manual renderer intent, literal presentation and late-reply isolation, never network,
 * update trust, download, installation, persistence, restart or native package behavior.
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
  for (const plan of options.checks ?? []) {
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
        notesTruncated: false,
        releaseNotes: null,
        status: 'idle',
      }
      const pendingChecks = new Map<number, () => void>()
      let pendingStatus: (() => void) | null = null
      const state: UpdatesFixture = {
        checkCalls: 0,
        mutationCalls: [],
        releaseCheck: (id) => {
          const resolve = pendingChecks.get(id)
          if (!resolve) {
            throw new Error(`No controlled pending check ${id}.`)
          }
          pendingChecks.delete(id)
          resolve()
        },
        releaseStatus: () => {
          if (!pendingStatus) {
            throw new Error('No controlled pending status read.')
          }
          pendingStatus()
          pendingStatus = null
        },
        returnedChecks: 0,
        returnedStatuses: 0,
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
                  return plan.kind === 'public-error'
                    ? publicError()
                    : { ok: true, value: structuredClone(plan.snapshot ?? initialStatus) }
                },
                download: async () => state.mutationCalls.push('app-download'),
                getStatus: async (): Promise<ApiResult<ApplicationUpdateSnapshot>> => {
                  const id = ++state.statusCalls
                  const captured = structuredClone(initialStatus)
                  if (initial.statusHeld && id === 1) {
                    await new Promise<void>((resolve) => {
                      pendingStatus = resolve
                    })
                  }
                  state.returnedStatuses++
                  if (id === 1 && initial.statusFailure === 'throw') {
                    throw new Error('Unexpected native failure at /private/fixture/update-source.')
                  }
                  return id === 1 && initial.statusFailure === 'public-error'
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
    const { checkCalls, mutationCalls, returnedChecks, returnedStatuses, statusCalls } = (
      globalThis as UpdatesGlobal
    ).applicationUpdatesFixture
    return { checkCalls, mutationCalls, returnedChecks, returnedStatuses, statusCalls }
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
    await expect(dialog(page)).toContainText(
      'Download and installation are not available in this build.',
    )
    await expect(dialog(page).getByRole('button', { name: /download|install/i })).toHaveCount(0)
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
