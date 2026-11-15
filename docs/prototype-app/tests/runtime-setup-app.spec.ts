import type { ApiResult, RuntimeStatus } from '../../../src/shared/api.js'
import type { RuntimeSetupMode, RuntimeSetupReview } from '../../../src/shared/runtime-setup.js'

import { expect, type Locator, type Page, test } from '@playwright/test'
import path from 'node:path'

type PreviewBehavior = 'hold' | 'ready' | 'unavailable' | 'wrong-mode'
type OperationBehavior = 'hold' | 'ready' | 'stale'

interface SetupOptions {
  discardHeld?: boolean
  operation?: OperationBehavior
  outpaintReused?: boolean
  preview?: PreviewBehavior
  releaseId?: string
  status?: 'needs-repair' | 'not-installed'
}

interface SetupSnapshot {
  discards: number
  operations: { mode: RuntimeSetupMode; token: string | null }[]
  previews: { mode: RuntimeSetupMode; token: string }[]
  returnedPreviews: number
}

interface SetupFixture extends SetupSnapshot {
  discardHeld: boolean
  operation: OperationBehavior
  preview: PreviewBehavior
  releaseDiscard: () => void
  releaseOperation: () => void
  releasePreview: () => void
  unmount: () => void
}

type SetupGlobal = { runtimeSetupFixture: SetupFixture } & typeof globalThis

const sourceRoot = `/@fs${path.resolve(import.meta.dirname, '../../../src/renderer')}`
const unavailableMessage =
  'Verified release artifacts and a complete setup preview are not available in this build.'

/**
 * Actual production App and modal, with explicit API ports replacing IPC/Main. These tests qualify
 * renderer intent, presentation and late-response handling, never installation, persistence,
 * download, native inference or shipping release trust.
 */
async function mountSetupApp(page: Page, options: SetupOptions = {}) {
  const mutation = process.env['IGS_RUNTIME_SETUP_UI_MUTATION']
  if (mutation) {
    // Mutate this isolated Vite response only. The delivered App source and on-disk rollback
    // state remain untouched; assertions still consume actual App handlers and modal events.
    const replacement =
      mutation === 'exact-token'
        ? {
            after:
              "const result = await runtimeApi[review.mode]('ffffffff-ffff-4fff-8fff-ffffffffffff')",
            before: 'const result = await runtimeApi[review.mode](review.token)',
          }
        : mutation === 'dismissal-wait'
          ? { after: 'void previewSettled', before: 'await previewSettled' }
          : null
    if (!replacement) {
      throw new Error(`Unknown Setup UI mutation: ${mutation}`)
    }
    await page.route('**/src/renderer/App.vue', async (route) => {
      const response = await route.fetch()
      const body = await response.text()
      expect(body.split(replacement.before)).toHaveLength(2)
      await route.fulfill({
        body: body.replace(replacement.before, replacement.after),
        response,
      })
    })
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
      const application = createApp(App)
      const pendingPreviews: (() => void)[] = []
      const pendingDiscards: (() => void)[] = []
      const pendingOperations: (() => void)[] = []
      let status: RuntimeStatus = {
        detail: 'Controlled renderer API port; no native runtime qualification.',
        kind: initial.status ?? 'not-installed',
        profile: 'linux-nvidia',
        runtimeId: 'renderer-api-fixture',
      }
      const state: SetupFixture = {
        discardHeld: initial.discardHeld ?? false,
        discards: 0,
        operation: initial.operation ?? 'ready',
        operations: [],
        preview: initial.preview ?? 'ready',
        previews: [],
        releaseDiscard: () => pendingDiscards.shift()?.(),
        releaseOperation: () => pendingOperations.shift()?.(),
        releasePreview: () => pendingPreviews.shift()?.(),
        returnedPreviews: 0,
        unmount: () => application.unmount(),
      }
      const readyStatus = (): RuntimeStatus => ({ ...status, kind: 'ready' })
      const operate = async (
        mode: RuntimeSetupMode,
        token?: string,
      ): Promise<ApiResult<RuntimeStatus>> => {
        state.operations.push({ mode, token: token ?? null })
        const behavior = state.operation
        if (behavior === 'hold') {
          await new Promise<void>((resolve) => pendingOperations.push(resolve))
        }
        if (behavior === 'stale') {
          return {
            error: {
              code: 'RUNTIME_INVALID_REVIEW',
              message: 'Review runtime setup again before continuing.',
            },
            ok: false,
          }
        }
        status = readyStatus()
        return { ok: true, value: status }
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
          list: async () => ({ ok: true, value: [] }),
          listTrash: async () => ({ ok: true, value: [] }),
          listWorkspaces: async () => ({ ok: true, value: [] }),
          onBeforeWindowClose: unsubscribe,
          onGenerationChanged: unsubscribe,
          onGenerationProgress: unsubscribe,
          onTabsChanged: unsubscribe,
        },
        runtime: {
          discardInstallationReview: async (): Promise<ApiResult<null>> => {
            state.discards++
            if (state.discardHeld) {
              await new Promise<void>((resolve) => pendingDiscards.push(resolve))
            }
            return { ok: true, value: null }
          },
          getStatus: async (): Promise<ApiResult<RuntimeStatus>> => ({ ok: true, value: status }),
          install: async (token?: string) => await operate('install', token),
          onStatusChanged: unsubscribe,
          previewInstallation: async (
            mode: RuntimeSetupMode,
          ): Promise<ApiResult<RuntimeSetupReview>> => {
            const behavior = state.preview
            const token = `00000000-0000-4000-8000-${(state.previews.length + 1)
              .toString(16)
              .padStart(12, '0')}`
            state.previews.push({ mode, token })
            if (behavior === 'hold') {
              await new Promise<void>((resolve) => pendingPreviews.push(resolve))
            }
            state.returnedPreviews++
            if (behavior === 'unavailable') {
              return {
                error: {
                  code: 'RUNTIME_INSTALL_UNAVAILABLE',
                  message:
                    'Verified release artifacts and a complete setup preview are not available in this build.',
                },
                ok: false,
              }
            }
            return {
              ok: true,
              value: {
                additionalInstalledBytes: null,
                downloadBytes: 0,
                installedBytes: null,
                mode:
                  behavior === 'wrong-mode' ? (mode === 'install' ? 'repair' : 'install') : mode,
                outpaintInfillReused: initial.outpaintReused ?? false,
                releaseId: initial.releaseId ?? 'renderer-review+cached',
                requiredFreeBytes: null,
                runtimeRequiredFreeBytes: 21_474_836_480,
                runtimeSourceCached: true,
                scope: 'engine',
                source: 'verified-local-cache',
                token,
              },
            }
          },
          repair: async (token?: string) => await operate('repair', token),
        },
      }
      ;(globalThis as SetupGlobal).runtimeSetupFixture = state
      application.mount(host)
    },
    { initial: options, root: sourceRoot },
  )
  await expect(
    notice(page).getByRole('button', { exact: true, name: setupAction(options) }),
  ).toBeEnabled()
}

const notice = (page: Page) => page.getByRole('region', { name: 'Image generation status' })
const dialog = (page: Page, mode: RuntimeSetupMode = 'install') =>
  page.getByRole('dialog', {
    exact: true,
    name: mode === 'install' ? 'Set up image generation' : 'Repair image generation',
  })
const setupAction = (options: SetupOptions) =>
  options.status === 'needs-repair' ? 'Repair' : 'Set up'

async function snapshot(page: Page): Promise<SetupSnapshot> {
  return await page.evaluate(() => {
    const { discards, operations, previews, returnedPreviews } = (globalThis as SetupGlobal)
      .runtimeSetupFixture
    return { discards, operations, previews, returnedPreviews }
  })
}

async function patchFixture(
  page: Page,
  patch: Partial<Pick<SetupFixture, 'discardHeld' | 'operation' | 'preview'>>,
) {
  await page.evaluate((next) => {
    Object.assign((globalThis as SetupGlobal).runtimeSetupFixture, next)
  }, patch)
}

async function release(page: Page, kind: 'discard' | 'operation' | 'preview') {
  await page.evaluate((which) => {
    const fixture = (globalThis as SetupGlobal).runtimeSetupFixture
    if (which === 'preview') {
      fixture.releasePreview()
    } else if (which === 'operation') {
      fixture.releaseOperation()
    } else {
      fixture.releaseDiscard()
    }
  }, kind)
}

function valueFor(review: Locator, label: string) {
  return review
    .locator('dt')
    .filter({ hasText: new RegExp(`^${label}$`) })
    .locator('+ dd')
}

test('production Setup reviews complete bytes and unknown peak, then submits its exact token once', async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await mountSetupApp(page, { operation: 'hold' })
  await notice(page).getByRole('button', { exact: true, name: 'Set up' }).click()
  const review = dialog(page)
  await expect(review).toBeVisible()
  await expect(valueFor(review, 'Total download')).toHaveText('0 B')
  await expect(valueFor(review, 'Installed size')).toHaveText('Unknown')
  await expect(valueFor(review, 'Additional installed size')).toHaveText('Unknown')
  await expect(valueFor(review, 'Runtime minimum free space')).toHaveText('20.0 GiB')
  await expect(valueFor(review, 'Peak free space required')).toHaveText('Unknown')
  await expect(review).toContainText('shared outpainting resource')
  await expect(review).toContainText('Installation still creates a new runtime.')
  await expect(review).toContainText('The outpainting resource will be installed with the engine.')
  const before = await snapshot(page)
  expect(before.previews.map(({ mode }) => mode)).toEqual(['install'])
  expect(before.operations).toEqual([])
  await expect(review).not.toContainText(before.previews[0]!.token)
  // Focus static review text so Enter is not an activation of either footer button.
  await review
    .locator('dt')
    .filter({ hasText: /^Total download$/ })
    .evaluate((element) => {
      ;(element as HTMLElement).tabIndex = -1
      ;(element as HTMLElement).focus()
    })
  await page.keyboard.press('Enter')
  expect((await snapshot(page)).operations).toEqual([])
  await expect.poll(() => review.evaluate((el) => getComputedStyle(el).transform)).toBe('none')
  await page.screenshot({ path: testInfo.outputPath('setup-review.png') })
  await review.getByRole('button', { exact: true, name: 'Install' }).click()
  await expect(review.getByRole('status')).toHaveText('Installing…')
  await expect(review.getByRole('button', { name: /^(loading )?Install$/ })).toBeDisabled()
  await expect(review.getByRole('button', { exact: true, name: 'Cancel' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(review).toBeVisible()
  expect((await snapshot(page)).operations).toEqual([
    { mode: 'install', token: before.previews[0]!.token },
  ])
  expect((await snapshot(page)).discards).toBe(0)
  await release(page, 'operation')
  await expect(review).toHaveCount(0)
  await expect(notice(page)).toHaveCount(0)
  expect((await snapshot(page)).operations).toHaveLength(1)
  expect(pageErrors).toEqual([])
})

test('production Repair confirms the repair mode and shows verified outpaint reuse', async ({
  page,
}) => {
  await mountSetupApp(page, { outpaintReused: true, status: 'needs-repair' })
  await notice(page).getByRole('button', { exact: true, name: 'Repair' }).click()
  const review = dialog(page, 'repair')
  await expect(review).toBeVisible()
  await expect(review).toContainText(
    'The existing outpainting resource will be verified and reused.',
  )
  expect((await snapshot(page)).operations).toEqual([])
  const token = (await snapshot(page)).previews[0]!.token
  await review.getByRole('button', { exact: true, name: 'Repair' }).click()
  await expect(review).toHaveCount(0)
  expect((await snapshot(page)).operations).toEqual([{ mode: 'repair', token }])
})

test('Cancel and Escape revoke loaded consent without installation, and reopening obtains a new token', async ({
  page,
}) => {
  await mountSetupApp(page)
  const setup = notice(page).getByRole('button', { name: /^(loading )?Set up$/ })
  await setup.click()
  await expect(dialog(page).getByRole('button', { exact: true, name: 'Install' })).toBeEnabled()
  await dialog(page).getByRole('button', { exact: true, name: 'Cancel' }).click()
  await expect(dialog(page)).toHaveCount(0)
  await expect.poll(async () => (await snapshot(page)).discards).toBe(1)
  await setup.click()
  await expect(dialog(page).getByRole('button', { exact: true, name: 'Install' })).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  const observed = await snapshot(page)
  expect(observed.discards).toBe(2)
  expect(observed.operations).toEqual([])
  expect(observed.previews).toHaveLength(2)
  expect(observed.previews[0]!.token).not.toBe(observed.previews[1]!.token)
})

test('dismissed pending review cannot reopen on its late response, and dismissal settles before new consent', async ({
  page,
}) => {
  await mountSetupApp(page, { discardHeld: true, preview: 'hold' })
  const setup = notice(page).getByRole('button', { name: /^(loading )?Set up$/ })
  await setup.click()
  await expect(dialog(page).getByRole('status')).toContainText('Preparing installation review…')
  await expect(dialog(page).getByRole('button', { exact: true, name: 'Install' })).toBeDisabled()
  await dialog(page).getByRole('button', { exact: true, name: 'Cancel' }).click()
  await expect(dialog(page)).toHaveCount(0)
  await expect.poll(async () => (await snapshot(page)).discards).toBe(1)
  await expect(setup).toBeDisabled()
  await release(page, 'preview')
  await expect.poll(async () => (await snapshot(page)).returnedPreviews).toBe(1)
  await expect(dialog(page)).toHaveCount(0)
  await expect(setup).toBeDisabled()
  await patchFixture(page, { discardHeld: false, preview: 'ready' })
  await release(page, 'discard')
  await expect(setup).toBeEnabled()
  await setup.click()
  await expect(dialog(page).getByRole('button', { exact: true, name: 'Install' })).toBeEnabled()
  expect((await snapshot(page)).operations).toEqual([])
  await dialog(page).getByRole('button', { exact: true, name: 'Cancel' }).click()
})

test('dismissal acknowledgment cannot enable new consent while the earlier preview is still pending', async ({
  page,
}) => {
  await mountSetupApp(page, { discardHeld: true, preview: 'hold' })
  const setup = notice(page).getByRole('button', { name: /^(loading )?Set up$/ })
  await setup.click()
  await expect(dialog(page).getByRole('status')).toContainText('Preparing installation review…')
  await dialog(page).getByRole('button', { exact: true, name: 'Cancel' }).click()
  await expect(dialog(page)).toHaveCount(0)
  await expect.poll(async () => (await snapshot(page)).discards).toBe(1)
  await release(page, 'discard')
  // Cross a browser paint after the explicit discard acknowledgement, without a fixed sleep.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  await expect(setup).toBeDisabled()
  expect((await snapshot(page)).returnedPreviews).toBe(0)
  await release(page, 'preview')
  await expect.poll(async () => (await snapshot(page)).returnedPreviews).toBe(1)
  await expect(setup).toBeEnabled()
  await expect(dialog(page)).toHaveCount(0)
  expect((await snapshot(page)).operations).toEqual([])
})

test('an unavailable release preview shows its failure without submitting a legacy zero-argument install', async ({
  page,
}) => {
  await mountSetupApp(page, { preview: 'unavailable' })
  await notice(page).getByRole('button', { exact: true, name: 'Set up' }).click()
  await expect(notice(page).getByRole('alert')).toContainText(unavailableMessage)
  await expect(dialog(page)).toHaveCount(0)
  expect((await snapshot(page)).previews).toHaveLength(1)
  expect((await snapshot(page)).operations).toEqual([])
})

test('a mismatched review mode cannot authorize an operation', async ({ page }) => {
  await mountSetupApp(page, { preview: 'wrong-mode' })
  await notice(page).getByRole('button', { exact: true, name: 'Set up' }).click()
  await expect(notice(page).getByRole('alert')).toBeVisible()
  await expect(dialog(page)).toHaveCount(0)
  expect((await snapshot(page)).operations).toEqual([])
})

test('an expired operation review requires fresh explicit review and confirmation', async ({
  page,
}) => {
  await mountSetupApp(page, { operation: 'stale' })
  const setup = notice(page).getByRole('button', { name: /^(loading )?Set up$/ })
  await setup.click()
  await dialog(page).getByRole('button', { exact: true, name: 'Install' }).click()
  await expect(dialog(page)).toHaveCount(0)
  await expect(notice(page).getByRole('alert')).toContainText(
    'Review runtime setup again before continuing.',
  )
  expect((await snapshot(page)).operations).toHaveLength(1)
  await patchFixture(page, { operation: 'ready' })
  await setup.click()
  await expect(dialog(page).getByRole('button', { exact: true, name: 'Install' })).toBeEnabled()
  expect((await snapshot(page)).operations).toHaveLength(1)
  await dialog(page).getByRole('button', { exact: true, name: 'Install' }).click()
  await expect(dialog(page)).toHaveCount(0)
  const observed = await snapshot(page)
  expect(observed.operations).toEqual(observed.previews)
  expect(observed.previews[0]!.token).not.toBe(observed.previews[1]!.token)
})

test('unmount invalidates a pending renderer review before its API response returns', async ({
  page,
}) => {
  await mountSetupApp(page, { preview: 'hold' })
  await notice(page).getByRole('button', { exact: true, name: 'Set up' }).click()
  await expect(dialog(page).getByRole('status')).toContainText('Preparing installation review…')
  await page.evaluate(() => (globalThis as SetupGlobal).runtimeSetupFixture.unmount())
  await release(page, 'preview')
  await expect.poll(async () => (await snapshot(page)).returnedPreviews).toBe(1)
  await expect(dialog(page)).toHaveCount(0)
  expect((await snapshot(page)).operations).toEqual([])
})

for (const viewport of [
  { height: 620, width: 900 },
  { height: 800, width: 1280 },
]) {
  test(`setup review keeps long release and footer reachable at ${viewport.width}×${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport)
    await mountSetupApp(page, { releaseId: `release-${'bounded.'.repeat(15)}` })
    await notice(page).getByRole('button', { exact: true, name: 'Set up' }).click()
    const review = dialog(page)
    await expect(review.getByRole('button', { exact: true, name: 'Install' })).toBeEnabled()
    await page.mouse.move(0, 0)
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    await expect.poll(() => review.evaluate((el) => getComputedStyle(el).transform)).toBe('none')
    const bounds = await review.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.y).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height)
    const overflow = await review.evaluate((element) => element.scrollWidth > element.clientWidth)
    expect(overflow).toBe(false)
    await review.getByRole('button', { exact: true, name: 'Cancel' }).scrollIntoViewIfNeeded()
    await expect(review.getByRole('button', { exact: true, name: 'Cancel' })).toBeInViewport()
    await expect(review.getByRole('button', { exact: true, name: 'Install' })).toBeInViewport()
    await page.screenshot({
      path: testInfo.outputPath(`setup-${viewport.width}x${viewport.height}.png`),
    })
    await review.getByRole('button', { exact: true, name: 'Cancel' }).click()
    await expect(review).toHaveCount(0)
    expect((await snapshot(page)).operations).toEqual([])
  })
}
