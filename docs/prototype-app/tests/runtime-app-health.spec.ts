import type { ApiResult, RuntimeStatus } from '../../../src/shared/api.js'

import { expect, type Page, test } from '@playwright/test'
import path from 'node:path'

type StatusMode = 'healthy' | 'partial' | 'status-error' | 'transport-error'

interface AvailabilitySnapshot {
  actionError: string | null
  outpaintInfill: RuntimeStatus['outpaintInfill']
  reason: string | null
  runtimeError: string | null
  statusKind: RuntimeStatus['kind'] | undefined
}

interface RuntimeAppHealthFixture {
  checks: number
  installs: number
  mode: StatusMode
  read: () => AvailabilitySnapshot
  repairCode: string
  repairDirect: () => Promise<void>
  repairs: number
}

type RuntimeAppHealthGlobal = {
  runtimeAppHealthFixture: RuntimeAppHealthFixture
} & typeof globalThis

const sourceRoot = `/@fs${path.resolve(import.meta.dirname, '../../../src/renderer')}`
const unavailableMessage =
  'Verified release artifacts and a complete setup preview are not available in this build.'
const blockedReason = 'Check the image generation connection with Check again above.'

/**
 * Real production App action and its computed reason consumed by Generate guards. Unrelated
 * Home/catalog APIs are explicit empty mocks. This does not run a generation request, preload,
 * persistence, a worker or native inference. Setup state is observed without production exports.
 */
async function mountRuntimeApp(page: Page) {
  if (process.env['IGS_RUNTIME_APP_MUTATION'] === 'repair-error-channel') {
    // Root's opt-in sensitivity check mutates only this isolated browser module response.
    // Product source stays unchanged; the actual App action/Generate reason is still consumed.
    await page.route('**/src/renderer/App.vue', async (route) => {
      const response = await route.fetch()
      const body = await response.text()
      const original = 'runtimeActionError.value = result.error.message'
      expect(body.split(original)).toHaveLength(2)
      await route.fulfill({
        body: body.replace(original, 'runtimeError.value = result.error.message'),
        response,
      })
    })
  }
  await page.goto('/')
  await page.evaluate(async (root) => {
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
    const state: RuntimeAppHealthFixture = {
      checks: 0,
      installs: 0,
      mode: 'partial',
      read: () => {
        // Vite's development SFC retains setupState. Read the real computed/ref values; do not
        // replace the availability rule with a presentation fixture or a test-only app export.
        const setup = application._instance?.setupState
        if (!setup || !('runtimeUnavailableReason' in setup)) {
          throw new Error('The production App availability computation is not mounted.')
        }
        return {
          actionError: setup.runtimeActionError ?? null,
          outpaintInfill: setup.status?.outpaintInfill,
          reason: setup.runtimeUnavailableReason,
          runtimeError: setup.runtimeError,
          statusKind: setup.status?.kind,
        }
      },
      repairCode: 'RUNTIME_INSTALL_UNAVAILABLE',
      repairDirect: async () => await application._instance.setupState.runRuntimeAction('repair'),
      repairs: 0,
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
        getStatus: async (): Promise<ApiResult<RuntimeStatus>> => {
          state.checks++
          if (state.mode === 'transport-error') {
            throw new Error('Controlled runtime transport failure.')
          }
          if (state.mode === 'status-error') {
            return {
              error: {
                code: 'RUNTIME_STATUS_UNAVAILABLE',
                message: 'Controlled runtime status read failure.',
              },
              ok: false,
            }
          }
          return {
            ok: true,
            value: {
              detail: 'Controlled Python/GPU readiness; no native qualification.',
              kind: 'ready',
              outpaintInfill: state.mode === 'healthy' ? 'ready' : 'needs-repair',
              profile: 'linux-nvidia',
              runtimeId: 'runtime-app-health-fixture',
            },
          }
        },
        install: async (): Promise<ApiResult<RuntimeStatus>> => {
          state.installs++
          return {
            error: { code: 'RUNTIME_INSTALL_UNAVAILABLE', message: 'Unexpected Install request.' },
            ok: false,
          }
        },
        onStatusChanged: unsubscribe,
        repair: async (): Promise<ApiResult<RuntimeStatus>> => {
          state.repairs++
          return {
            error: {
              code: state.repairCode,
              message:
                state.repairCode === 'RUNTIME_INSTALL_UNAVAILABLE'
                  ? 'Verified release artifacts and a complete setup preview are not available in this build.'
                  : 'Controlled different runtime repair failure.',
            },
            ok: false,
          }
        },
      },
    }
    ;(globalThis as RuntimeAppHealthGlobal).runtimeAppHealthFixture = state
    application.mount(host)
  }, sourceRoot)
  await expect(
    page.getByRole('heading', { exact: true, name: 'Outpainting needs repair' }),
  ).toBeVisible()
}

async function availability(page: Page): Promise<AvailabilitySnapshot> {
  return await page.evaluate(() =>
    (globalThis as RuntimeAppHealthGlobal).runtimeAppHealthFixture.read(),
  )
}

async function setFixture(
  page: Page,
  patch: Partial<Pick<RuntimeAppHealthFixture, 'mode' | 'repairCode'>>,
) {
  await page.evaluate((next) => {
    Object.assign((globalThis as RuntimeAppHealthGlobal).runtimeAppHealthFixture, next)
  }, patch)
}

test('production App keeps unavailable partial Repair separate from blocking status and connection errors', async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await mountRuntimeApp(page)
  const notice = page.getByRole('region', { name: 'Image generation status' })
  const repair = notice.getByRole('button', { exact: true, name: 'Repair' })
  const check = notice.getByRole('button', { exact: true, name: 'Check again' })

  await expect
    .poll(() => availability(page))
    .toEqual({
      actionError: null,
      outpaintInfill: 'needs-repair',
      reason: null,
      runtimeError: null,
      statusKind: 'ready',
    })

  await page.screenshot({ path: testInfo.outputPath('app-outpaint-warning.png') })

  await test.step('explicit unavailable partial Repair shows its error without blocking ordinary availability', async () => {
    await repair.click()
    await expect(notice.getByRole('alert')).toContainText(unavailableMessage)
    await expect
      .poll(() => availability(page))
      .toEqual({
        actionError: unavailableMessage,
        outpaintInfill: 'needs-repair',
        reason: null,
        runtimeError: null,
        statusKind: 'ready',
      })
    await page.screenshot({ path: testInfo.outputPath('app-outpaint-repair-unavailable.png') })
    expect(
      await page.evaluate(
        () => (globalThis as RuntimeAppHealthGlobal).runtimeAppHealthFixture.repairs,
      ),
    ).toBe(1)
  })

  await test.step('a failed status read blocks despite the previous ready slot', async () => {
    await setFixture(page, { mode: 'status-error' })
    await check.click()
    await expect(notice.getByRole('alert')).toContainText('Controlled runtime status read failure.')
    await expect
      .poll(() => availability(page))
      .toEqual({
        actionError: null,
        outpaintInfill: 'needs-repair',
        reason: blockedReason,
        runtimeError: 'Controlled runtime status read failure.',
        statusKind: 'ready',
      })
  })

  await test.step('a stale partial Repair cannot clear a preceding status failure', async () => {
    await expect(
      notice.getByRole('heading', { name: 'Image generation status is unavailable' }),
    ).toBeVisible()
    await expect(notice.getByRole('button', { exact: true, name: 'Repair' })).toHaveCount(0)
    // Simulate a previously queued action at the actual App handler; the current UI correctly
    // exposes only Check again while the connection/status error remains unresolved.
    await page.evaluate(() =>
      (globalThis as RuntimeAppHealthGlobal).runtimeAppHealthFixture.repairDirect(),
    )
    const snapshot = await availability(page)
    expect(snapshot.reason).toBe(blockedReason)
    expect(snapshot.runtimeError).toBe('Controlled runtime status read failure.')
    expect(snapshot.actionError).toBe(unavailableMessage)
  })

  await test.step('a healthy recheck restores partial availability, but a different Repair failure blocks', async () => {
    await setFixture(page, { mode: 'partial', repairCode: 'RUNTIME_INSTALL_FAILED' })
    await check.click()
    await expect(notice.getByRole('alert')).toHaveCount(0)
    await expect.poll(async () => (await availability(page)).reason).toBeNull()
    await repair.click()
    await expect(notice.getByRole('alert')).toContainText(
      'Controlled different runtime repair failure.',
    )
    await expect
      .poll(() => availability(page))
      .toEqual({
        actionError: null,
        outpaintInfill: 'needs-repair',
        reason: blockedReason,
        runtimeError: 'Controlled different runtime repair failure.',
        statusKind: 'ready',
      })
  })

  await test.step('a transport exception remains blocking and cannot borrow stale ready', async () => {
    await setFixture(page, { mode: 'transport-error' })
    await check.click()
    await expect(notice.getByRole('alert')).toContainText('Controlled runtime transport failure.')
    await expect
      .poll(() => availability(page))
      .toEqual({
        actionError: null,
        outpaintInfill: 'needs-repair',
        reason: blockedReason,
        runtimeError: 'Controlled runtime transport failure.',
        statusKind: 'ready',
      })
  })

  await test.step('explicit healthy restoration clears the warning and both error channels', async () => {
    await setFixture(page, { mode: 'healthy' })
    await check.click()
    await expect(notice).toHaveCount(0)
    await expect
      .poll(() => availability(page))
      .toEqual({
        actionError: null,
        outpaintInfill: 'ready',
        reason: null,
        runtimeError: null,
        statusKind: 'ready',
      })
    expect(
      await page.evaluate(
        () => (globalThis as RuntimeAppHealthGlobal).runtimeAppHealthFixture.installs,
      ),
    ).toBe(0)
  })
  expect(pageErrors).toEqual([])
})
