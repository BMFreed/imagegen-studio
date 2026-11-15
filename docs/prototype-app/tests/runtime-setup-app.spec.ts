import type { ApiResult, RuntimeStatus } from '../../../src/shared/api.js'
import type {
  RuntimeSetupProgress,
  RuntimeSetupProgressSnapshot,
} from '../../../src/shared/runtime-setup-progress.js'
import type { RuntimeSetupMode, RuntimeSetupReview } from '../../../src/shared/runtime-setup.js'

import { expect, type Locator, type Page, test } from '@playwright/test'
import path from 'node:path'

type PreviewBehavior = 'hold' | 'ready' | 'unavailable' | 'wrong-mode'
type OperationBehavior = 'hold' | 'ready' | 'stale'
type CancelOutcome = 'canceled' | 'recovery-required' | 'succeeded'

interface SetupOptions {
  cancelOutcome?: CancelOutcome
  cancelReplyHeld?: boolean
  discardHeld?: boolean
  operation?: OperationBehavior
  operationReplyHeld?: boolean
  outpaintReused?: boolean
  preview?: PreviewBehavior
  progressGetterHeld?: boolean
  releaseId?: string
  resumed?: RuntimeSetupProgress
  runtimeCached?: boolean
  status?: 'needs-repair' | 'not-installed'
}

interface SetupSnapshot {
  cancels: string[]
  discards: number
  operations: { mode: RuntimeSetupMode; token: string | null }[]
  previews: { mode: RuntimeSetupMode; token: string }[]
  progress: RuntimeSetupProgressSnapshot
  returnedPreviews: number
}

interface SetupFixture extends SetupSnapshot {
  cancelOutcome: CancelOutcome
  cancelReject: boolean
  cancelReplyHeld: boolean
  discardHeld: boolean
  emitSnapshot: (snapshot: RuntimeSetupProgressSnapshot) => void
  operation: OperationBehavior
  operationReplyHeld: boolean
  preview: PreviewBehavior
  publish: (operation: RuntimeSetupProgress | null, revision?: number) => void
  releaseCancelReply: () => void
  releaseDiscard: () => void
  releaseOperation: () => void
  releaseOperationReply: () => void
  releasePreview: () => void
  releaseProgressGetter: () => void
  remount: () => void
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
          : mutation === 'progress-revision'
            ? { after: 'false', before: 'snapshot.revision <= runtimeSetupProgressRevision' }
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
      let application = createApp(App)
      const pendingPreviews: (() => void)[] = []
      const pendingDiscards: (() => void)[] = []
      const pendingOperations: (() => void)[] = []
      const pendingProgressGetters: (() => void)[] = []
      const pendingCancelReplies: (() => void)[] = []
      const pendingOperationReplies: (() => void)[] = []
      const pendingCancels: ((snapshot: RuntimeSetupProgressSnapshot) => void)[] = []
      const progressListeners = new Set<(snapshot: RuntimeSetupProgressSnapshot) => void>()
      let cancelRequested = false
      let status: RuntimeStatus = {
        detail: 'Controlled renderer API port; no native runtime qualification.',
        kind: initial.status ?? 'not-installed',
        profile: 'linux-nvidia',
        runtimeId: 'renderer-api-fixture',
      }
      const publish = (
        operation: RuntimeSetupProgress | null,
        revision = state.progress.revision + 1,
      ) => {
        state.progress = { operation, revision }
        for (const listener of progressListeners) {
          listener(structuredClone(state.progress))
        }
      }
      const settleProgress = (outcome: CancelOutcome) => {
        const operation = state.progress.operation
        if (operation) {
          if (outcome === 'succeeded') {
            status = { ...status, kind: 'ready' }
          } else if (outcome === 'recovery-required') {
            status = { ...status, kind: 'needs-repair' }
          }
          publish({
            ...operation,
            bytesDownloaded: null,
            bytesTotal: null,
            stage: 'finalizing',
            state: outcome,
          })
        }
        for (const resolve of pendingCancels.splice(0)) {
          resolve(structuredClone(state.progress))
        }
      }
      const state: SetupFixture = {
        cancelOutcome: initial.cancelOutcome ?? 'canceled',
        cancelReject: false,
        cancelReplyHeld: initial.cancelReplyHeld ?? false,
        cancels: [],
        discardHeld: initial.discardHeld ?? false,
        discards: 0,
        emitSnapshot: (snapshot) => {
          for (const listener of progressListeners) {
            listener(structuredClone(snapshot))
          }
        },
        operation: initial.operation ?? 'ready',
        operationReplyHeld: initial.operationReplyHeld ?? false,
        operations: [],
        preview: initial.preview ?? 'ready',
        previews: [],
        progress: { operation: initial.resumed ?? null, revision: initial.resumed ? 1 : 0 },
        publish,
        releaseCancelReply: () => pendingCancelReplies.shift()?.(),
        releaseDiscard: () => pendingDiscards.shift()?.(),
        releaseOperation: () => {
          const resolve = pendingOperations.shift()
          if (resolve) {
            resolve()
          } else {
            settleProgress(cancelRequested ? state.cancelOutcome : 'succeeded')
          }
        },
        releaseOperationReply: () => pendingOperationReplies.shift()?.(),
        releasePreview: () => pendingPreviews.shift()?.(),
        releaseProgressGetter: () => pendingProgressGetters.shift()?.(),
        remount: () => {
          application.unmount()
          application = createApp(App)
          application.mount(host)
        },
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
        cancelRequested = false
        const operationId = token ?? '00000000-0000-4000-8000-000000000000'
        if (behavior !== 'stale') {
          publish({
            bytesDownloaded: null,
            bytesTotal: null,
            mode,
            operationId,
            stage: 'preparing',
            state: 'running',
          })
        }
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
        const outcome = cancelRequested ? state.cancelOutcome : 'succeeded'
        settleProgress(outcome)
        if (state.operationReplyHeld) {
          await new Promise<void>((resolve) => pendingOperationReplies.push(resolve))
        }
        if (outcome === 'canceled' || outcome === 'recovery-required') {
          return {
            error: {
              code:
                outcome === 'canceled'
                  ? 'RUNTIME_INSTALL_CANCELED'
                  : 'RUNTIME_INSTALL_RECOVERY_REQUIRED',
              message:
                outcome === 'canceled'
                  ? 'Runtime setup was canceled.'
                  : 'Runtime setup needs recovery. Controlled exit could not be confirmed.',
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
          cancelInstallation: async (
            operationId: string,
          ): Promise<ApiResult<RuntimeSetupProgressSnapshot>> => {
            state.cancels.push(operationId)
            if (state.cancelReject) {
              return {
                error: {
                  code: 'RUNTIME_INSTALL_FAILED',
                  message: 'Controlled cancellation request failure.',
                },
                ok: false,
              }
            }
            const operation = state.progress.operation
            if (
              !operation ||
              operation.operationId !== operationId ||
              !['cancelling', 'running'].includes(operation.state)
            ) {
              return {
                error: {
                  code: 'RUNTIME_INVALID_OPERATION',
                  message: 'This setup operation is no longer running.',
                },
                ok: false,
              }
            }
            cancelRequested = true
            publish({ ...operation, state: 'cancelling' })
            const settled = await new Promise<RuntimeSetupProgressSnapshot>((resolve) =>
              pendingCancels.push(resolve),
            )
            if (state.cancelReplyHeld) {
              await new Promise<void>((resolve) => pendingCancelReplies.push(resolve))
            }
            return { ok: true, value: settled }
          },
          discardInstallationReview: async (): Promise<ApiResult<null>> => {
            state.discards++
            if (state.discardHeld) {
              await new Promise<void>((resolve) => pendingDiscards.push(resolve))
            }
            return { ok: true, value: null }
          },
          getInstallationProgress: async (): Promise<ApiResult<RuntimeSetupProgressSnapshot>> => {
            const captured = structuredClone(state.progress)
            if (initial.progressGetterHeld) {
              await new Promise<void>((resolve) => pendingProgressGetters.push(resolve))
            }
            return { ok: true, value: captured }
          },
          getStatus: async (): Promise<ApiResult<RuntimeStatus>> => ({ ok: true, value: status }),
          install: async (token?: string) => await operate('install', token),
          onInstallationProgressChanged: (
            listener: (snapshot: RuntimeSetupProgressSnapshot) => void,
          ) => {
            progressListeners.add(listener)
            return () => progressListeners.delete(listener)
          },
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
                downloadBytes: initial.runtimeCached === false ? 2 * 1024 ** 3 : 0,
                installedBytes: null,
                mode:
                  behavior === 'wrong-mode' ? (mode === 'install' ? 'repair' : 'install') : mode,
                outpaintInfillReused: initial.outpaintReused ?? false,
                releaseId: initial.releaseId ?? 'renderer-review+cached',
                requiredFreeBytes: null,
                runtimeRequiredFreeBytes: 21_474_836_480,
                runtimeSourceCached: initial.runtimeCached !== false,
                scope: 'engine',
                source:
                  initial.runtimeCached === false ? 'verified-metadata' : 'verified-local-cache',
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
  await (options.resumed
    ? expect(dialog(page, options.resumed.mode)).toBeVisible()
    : expect(
        notice(page).getByRole('button', { exact: true, name: setupAction(options) }),
      ).toBeEnabled())
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
    const { cancels, discards, operations, previews, progress, returnedPreviews } = (
      globalThis as SetupGlobal
    ).runtimeSetupFixture
    return { cancels, discards, operations, previews, progress, returnedPreviews }
  })
}

async function patchFixture(
  page: Page,
  patch: Partial<
    Pick<
      SetupFixture,
      'cancelOutcome' | 'cancelReject' | 'cancelReplyHeld' | 'discardHeld' | 'operation' | 'preview'
    >
  >,
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
  await expect(review.getByRole('status')).toHaveText('Preparing setup')
  await expect(review.getByRole('button', { name: /^(loading )?Install$/ })).toHaveCount(0)
  await expect(review.getByRole('button', { exact: true, name: 'Cancel' })).toBeEnabled()
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

test('production metadata review shows the full uncached download before explicit confirmation', async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await mountSetupApp(page, { runtimeCached: false })
  await notice(page).getByRole('button', { exact: true, name: 'Set up' }).click()
  const review = dialog(page)
  await expect(review).toBeVisible()
  await expect(valueFor(review, 'Total download')).toHaveText('2.0 GiB')
  await expect(valueFor(review, 'Installed size')).toHaveText('Unknown')
  await expect(valueFor(review, 'Additional installed size')).toHaveText('Unknown')
  await expect(valueFor(review, 'Runtime minimum free space')).toHaveText('20.0 GiB')
  await expect(valueFor(review, 'Peak free space required')).toHaveText('Unknown')
  await expect(review).toContainText(
    'The runtime download is included in this review. Installation creates a new runtime.',
  )
  await expect(review).not.toContainText('The runtime download is already cached.')
  const before = await snapshot(page)
  expect(before.operations).toEqual([])
  expect(before.previews.map(({ mode }) => mode)).toEqual(['install'])
  await expect(review).not.toContainText(before.previews[0]!.token)
  await expect.poll(() => review.evaluate((el) => getComputedStyle(el).transform)).toBe('none')
  await page.screenshot({ path: testInfo.outputPath('metadata-uncached-review.png') })
  await review.getByRole('button', { exact: true, name: 'Install' }).click()
  await expect(review).toHaveCount(0)
  expect((await snapshot(page)).operations).toEqual([
    { mode: 'install', token: before.previews[0]!.token },
  ])
  expect(pageErrors).toEqual([])
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

async function publishSetupProgress(
  page: Page,
  change: Partial<RuntimeSetupProgress>,
  revision?: number,
) {
  await page.evaluate(
    ({ patch, version }) => {
      const fixture = (globalThis as SetupGlobal).runtimeSetupFixture
      const current = fixture.progress.operation
      if (!current) {
        throw new Error('No controlled setup operation is active.')
      }
      fixture.publish({ ...current, ...patch }, version)
    },
    { patch: change, version: revision },
  )
}

test('download bytes and Cancel stay attached to the accepted operation until cancellation settles', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ height: 620, width: 900 })
  await mountSetupApp(page, { operation: 'hold', runtimeCached: false })
  await notice(page).getByRole('button', { exact: true, name: 'Set up' }).click()
  const review = dialog(page)
  await review.getByRole('button', { exact: true, name: 'Install' }).click()
  const token = (await snapshot(page)).operations[0]!.token
  await publishSetupProgress(page, {
    bytesDownloaded: 1024 ** 2,
    bytesTotal: 2 * 1024 ** 2,
    stage: 'downloading-runtime',
  })
  await expect(review.getByRole('status')).toHaveText('Downloading image engine')
  await expect(review.getByText('1.0 MiB of 2.0 MiB', { exact: true })).toBeVisible()
  await expect(review.getByRole('button', { exact: true, name: 'Cancel' })).toBeEnabled()
  await expect.poll(() => review.evaluate((el) => getComputedStyle(el).transform)).toBe('none')
  await page.screenshot({ path: testInfo.outputPath('setup-download-900x620.png') })
  await publishSetupProgress(page, { bytesDownloaded: 2 * 1024 ** 2 })
  await expect(review.getByText('2.0 MiB of 2.0 MiB', { exact: true })).toBeVisible()
  await expect(review.getByText('Setup completed', { exact: true })).toHaveCount(0)
  await review.getByRole('button', { exact: true, name: 'Cancel' }).evaluate((button) => {
    ;(button as HTMLButtonElement).click()
    ;(button as HTMLButtonElement).click()
  })
  await expect(review.getByRole('status')).toHaveText('Cancelling…')
  await expect(review.getByRole('button', { exact: true, name: 'Cancelling…' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(review).toBeVisible()
  expect((await snapshot(page)).cancels).toEqual([token])
  await page.screenshot({ path: testInfo.outputPath('setup-cancelling-900x620.png') })
  await release(page, 'operation')
  await expect(review).toHaveCount(0)
  await expect(page.getByText('Runtime setup was canceled.', { exact: true })).toBeVisible()
  expect((await snapshot(page)).operations).toHaveLength(1)
})

test('stale getter, old terminal and old invoke reply cannot replace a newer setup operation', async ({
  page,
}) => {
  await mountSetupApp(page, {
    operation: 'hold',
    operationReplyHeld: true,
    progressGetterHeld: true,
  })
  await notice(page).getByRole('button', { exact: true, name: 'Set up' }).click()
  await dialog(page).getByRole('button', { exact: true, name: 'Install' }).click()
  const early = (await snapshot(page)).progress
  await publishSetupProgress(page, {
    bytesDownloaded: 50,
    bytesTotal: 100,
    stage: 'downloading-runtime',
  })
  await page.evaluate(() => (globalThis as SetupGlobal).runtimeSetupFixture.releaseProgressGetter())
  await page.evaluate(
    (snapshot) => (globalThis as SetupGlobal).runtimeSetupFixture.emitSnapshot(snapshot),
    early,
  )
  await expect(dialog(page).getByRole('status')).toHaveText('Downloading image engine')
  const old = (await snapshot(page)).progress.operation!
  await release(page, 'operation')
  await expect.poll(async () => (await snapshot(page)).progress.operation?.state).toBe('succeeded')
  const nextId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  await publishSetupProgress(page, {
    bytesDownloaded: null,
    bytesTotal: null,
    mode: 'repair',
    operationId: nextId,
    stage: 'checking-runtime',
    state: 'running',
  })
  await expect(dialog(page, 'repair').getByRole('status')).toHaveText('Checking image engine')
  await page.evaluate(
    (operation) =>
      (globalThis as SetupGlobal).runtimeSetupFixture.publish({
        ...operation,
        bytesDownloaded: null,
        bytesTotal: null,
        stage: 'finalizing',
        state: 'failed',
      }),
    old,
  )
  await page.evaluate(() => (globalThis as SetupGlobal).runtimeSetupFixture.releaseOperationReply())
  await expect(dialog(page, 'repair').getByRole('status')).toHaveText('Checking image engine')
  await expect(
    dialog(page, 'repair').getByRole('button', { exact: true, name: 'Cancel' }),
  ).toBeEnabled()
  await publishSetupProgress(page, {
    bytesDownloaded: null,
    bytesTotal: null,
    mode: 'repair',
    operationId: nextId,
    stage: 'finalizing',
    state: 'canceled',
  })
  await expect(dialog(page, 'repair')).toHaveCount(0)
  await expect(page.getByText('Runtime setup was canceled.', { exact: true })).toBeVisible()
})

test('remount restores accepted setup and cancellation from the current snapshot without a review', async ({
  page,
}) => {
  await mountSetupApp(page, { operation: 'hold' })
  await notice(page).getByRole('button', { exact: true, name: 'Set up' }).click()
  await dialog(page).getByRole('button', { exact: true, name: 'Install' }).click()
  await publishSetupProgress(page, {
    bytesDownloaded: null,
    bytesTotal: null,
    stage: 'extracting-runtime',
  })
  await page.evaluate(() => (globalThis as SetupGlobal).runtimeSetupFixture.remount())
  await expect(dialog(page).getByRole('status')).toHaveText('Unpacking image engine')
  await expect(
    dialog(page).getByText('Preparing installation review…', { exact: true }),
  ).toHaveCount(0)
  await expect(dialog(page).locator('dt')).toHaveCount(0)
  await dialog(page).getByRole('button', { exact: true, name: 'Cancel' }).click()
  await expect(dialog(page).getByRole('status')).toHaveText('Cancelling…')
  await page.evaluate(() => (globalThis as SetupGlobal).runtimeSetupFixture.remount())
  await expect(dialog(page).getByRole('status')).toHaveText('Cancelling…')
  await expect(
    dialog(page).getByRole('button', { exact: true, name: 'Cancelling…' }),
  ).toBeDisabled()
  await release(page, 'operation')
  await expect(dialog(page)).toHaveCount(0)
  await expect(page.getByText('Runtime setup was canceled.', { exact: true })).toBeVisible()
  expect((await snapshot(page)).cancels).toHaveLength(1)
  expect((await snapshot(page)).operations).toHaveLength(1)
})

test('a late Cancel request cannot turn a successful setup into canceled', async ({ page }) => {
  await mountSetupApp(page, { cancelOutcome: 'succeeded', operation: 'hold' })
  await notice(page).getByRole('button', { exact: true, name: 'Set up' }).click()
  await dialog(page).getByRole('button', { exact: true, name: 'Install' }).click()
  await dialog(page).getByRole('button', { exact: true, name: 'Cancel' }).click()
  await expect(dialog(page).getByRole('status')).toHaveText('Cancelling…')
  await release(page, 'operation')
  await expect(dialog(page)).toHaveCount(0)
  await expect(notice(page)).toHaveCount(0)
  await expect(page.getByText('Runtime setup was canceled.', { exact: true })).toHaveCount(0)
  expect((await snapshot(page)).progress.operation?.state).toBe('succeeded')
})

test('recovery failure after Cancel remains a recovery diagnostic rather than ordinary cancellation', async ({
  page,
}) => {
  await mountSetupApp(page, { cancelOutcome: 'recovery-required', operation: 'hold' })
  await notice(page).getByRole('button', { exact: true, name: 'Set up' }).click()
  await dialog(page).getByRole('button', { exact: true, name: 'Install' }).click()
  await dialog(page).getByRole('button', { exact: true, name: 'Cancel' }).click()
  await release(page, 'operation')
  await expect(dialog(page)).toHaveCount(0)
  await expect(notice(page).getByRole('alert')).toContainText('Runtime setup needs recovery.')
  await expect(page.getByText('Runtime setup was canceled.', { exact: true })).toHaveCount(0)
  await notice(page).getByRole('button', { exact: true, name: 'Check again' }).click()
  await expect(
    notice(page).getByRole('heading', { exact: true, name: 'Image generation needs repair' }),
  ).toBeVisible()
})

test('failed cancellation stays visible in the operation dialog and can be retried explicitly', async ({
  page,
}) => {
  await mountSetupApp(page, { operation: 'hold' })
  await notice(page).getByRole('button', { exact: true, name: 'Set up' }).click()
  await dialog(page).getByRole('button', { exact: true, name: 'Install' }).click()
  await patchFixture(page, { cancelReject: true })
  await dialog(page).getByRole('button', { exact: true, name: 'Cancel' }).click()
  await expect(dialog(page).getByRole('alert')).toContainText(
    'Controlled cancellation request failure.',
  )
  await expect(dialog(page).getByRole('button', { exact: true, name: 'Cancel' })).toBeEnabled()
  await patchFixture(page, { cancelReject: false })
  await dialog(page).getByRole('button', { exact: true, name: 'Cancel' }).click()
  await expect(dialog(page).getByRole('alert')).toHaveCount(0)
  await release(page, 'operation')
  await expect(dialog(page)).toHaveCount(0)
  expect((await snapshot(page)).cancels).toHaveLength(2)
})
