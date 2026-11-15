import type { RuntimeStatus } from '../../../src/shared/api.js'

import { expect, type Page, test } from '@playwright/test'
import path from 'node:path'

interface RuntimeNoticeState {
  checks: number
  error: string | null
  installs: number
  pending: 'check' | 'install' | 'repair' | null
  repairs: number
  status: RuntimeStatus | null
}

type RuntimeNoticeGlobal = { runtimeNoticeFixture: RuntimeNoticeState } & typeof globalThis

const sourceRoot = `/@fs${path.resolve(import.meta.dirname, '../../../src/renderer')}`

/** Production Vue/Naive presentation with explicit state inputs; no IPC/runtime qualification. */
async function mountRuntimeNotice(page: Page) {
  await page.goto('/')
  await page.evaluate(async (root) => {
    const loadModule = (url: string) => import(url)
    const [
      { createApp, h, reactive },
      { darkTheme, NConfigProvider },
      { default: RuntimeNotice },
      { imageGenNaiveTheme },
    ] = await Promise.all([
      loadModule('/@id/vue'),
      loadModule('/@id/naive-ui'),
      loadModule(`${root}/components/RuntimeNotice.vue`),
      loadModule(`${root}/theme/naive-theme.ts`),
    ])
    const original = document.getElementById('app') as HTMLElement & {
      __vue_app__?: { unmount: () => void }
    }
    original?.__vue_app__?.unmount()
    const host = document.createElement('div')
    document.body.replaceChildren(host)
    const state: RuntimeNoticeState = reactive({
      checks: 0,
      error: null,
      installs: 0,
      pending: null,
      repairs: 0,
      status: {
        detail: 'The image runtime is starting; a separate status probe is deferred.',
        kind: 'checking',
        profile: 'linux-nvidia',
        runtimeId: 'presentation-fixture',
      },
    })
    ;(globalThis as RuntimeNoticeGlobal).runtimeNoticeFixture = state
    createApp({
      render: () =>
        h(
          NConfigProvider,
          { theme: darkTheme, themeOverrides: imageGenNaiveTheme },
          {
            default: () =>
              h('main', { 'data-testid': 'runtime-notice-fixture' }, [
                // Match App.vue: ready hides the notice unless outpainting or an action needs attention.
                state.status?.kind !== 'ready' ||
                state.status.outpaintInfill === 'needs-repair' ||
                state.error !== null
                  ? h(RuntimeNotice, {
                      error: state.error,
                      onCheck: () => state.checks++,
                      onInstall: () => state.installs++,
                      onRepair: () => state.repairs++,
                      pending: state.pending,
                      status: state.status,
                    })
                  : null,
                h('p', 'Project editing stays available while the image engine starts.'),
              ]),
          },
        ),
    }).mount(host)
  }, sourceRoot)
  await expect(page.getByRole('region', { name: 'Image generation status' })).toBeVisible()
}

async function updateRuntimeNotice(page: Page, patch: Partial<RuntimeNoticeState>) {
  await page.evaluate((next) => {
    Object.assign((globalThis as RuntimeNoticeGlobal).runtimeNoticeFixture, next)
  }, patch)
}

const runtimeStatus = (kind: RuntimeStatus['kind']): RuntimeStatus => ({
  detail:
    kind === 'needs-repair'
      ? 'The installed Linux/NVIDIA image runtime failed its worker self-test.'
      : 'Controlled presentation state.',
  kind,
  profile: 'linux-nvidia',
  runtimeId: 'presentation-fixture',
})

test('ordinary startup shows progress without Repair and a ready event removes the notice', async ({
  page,
}, testInfo) => {
  await mountRuntimeNotice(page)
  const notice = page.getByRole('region', { name: 'Image generation status' })
  await expect(notice.getByRole('heading', { name: 'Starting image generation' })).toBeVisible()
  await expect(
    notice.getByText('The image engine is starting. Queued work will continue when it is ready.'),
  ).toBeVisible()
  await expect(notice.locator('.n-spin')).toBeVisible()
  await expect(notice.getByRole('button', { name: 'Repair' })).toHaveCount(0)
  await expect(notice.getByRole('button', { name: 'Set up' })).toHaveCount(0)
  await expect(notice).toHaveAttribute('aria-live', 'polite')
  await page.screenshot({ fullPage: true, path: testInfo.outputPath('checking.png') })

  await updateRuntimeNotice(page, { status: runtimeStatus('ready') })
  await expect(notice).toHaveCount(0)
  await expect(
    page.getByText('Project editing stays available while the image engine starts.'),
  ).toBeVisible()
  expect(
    await page.evaluate(() => (globalThis as RuntimeNoticeGlobal).runtimeNoticeFixture.checks),
  ).toBe(0)
})

test('a real failure state retains Repair after startup and forwards exactly one action', async ({
  page,
}, testInfo) => {
  await mountRuntimeNotice(page)
  await updateRuntimeNotice(page, { status: runtimeStatus('needs-repair') })
  const notice = page.getByRole('region', { name: 'Image generation status' })
  await expect(notice.getByRole('heading', { name: 'Image generation needs repair' })).toBeVisible()
  await expect(
    notice.getByText('The image engine cannot start. Repair it to resume generation.'),
  ).toBeVisible()
  await expect(notice.locator('.n-spin')).toHaveCount(0)
  const repair = notice.getByRole('button', { exact: true, name: 'Repair' })
  await expect(repair).toBeEnabled()
  await notice.getByText('Details', { exact: true }).click()
  await expect(
    notice.getByText('The installed Linux/NVIDIA image runtime failed its worker self-test.'),
  ).toBeVisible()
  await page.screenshot({ fullPage: true, path: testInfo.outputPath('needs-repair.png') })
  await repair.click()
  expect(
    await page.evaluate(() => (globalThis as RuntimeNoticeGlobal).runtimeNoticeFixture.repairs),
  ).toBe(1)
  await updateRuntimeNotice(page, { pending: 'repair' })
  await expect(notice.getByRole('button', { name: /Repair/ })).toBeDisabled()
  await updateRuntimeNotice(page, { pending: null, status: runtimeStatus('ready') })
  await expect(notice).toHaveCount(0)
})

for (const kind of ['not-installed', 'unsupported'] as const) {
  test(`the ${kind} neighbor keeps its own message and available action`, async ({ page }) => {
    await mountRuntimeNotice(page)
    await updateRuntimeNotice(page, { status: runtimeStatus(kind) })
    const notice = page.getByRole('region', { name: 'Image generation status' })
    await expect(notice.getByRole('button', { name: 'Repair' })).toHaveCount(0)
    await expect(notice.locator('.n-spin')).toHaveCount(0)
    if (kind === 'not-installed') {
      await expect(notice.getByRole('heading', { name: 'Set up image generation' })).toBeVisible()
      await notice.getByRole('button', { exact: true, name: 'Set up' }).click()
      expect(
        await page.evaluate(
          () => (globalThis as RuntimeNoticeGlobal).runtimeNoticeFixture.installs,
        ),
      ).toBe(1)
    } else {
      await expect(
        notice.getByRole('heading', { name: 'Image generation is unavailable on this computer' }),
      ).toBeVisible()
      await expect(
        notice.getByText('This release requires Linux with a supported NVIDIA GPU.'),
      ).toBeVisible()
      await expect(notice.getByRole('button')).toHaveCount(0)
    }
  })
}

test('an unavailable status keeps Check again distinct from setup and repair', async ({ page }) => {
  await mountRuntimeNotice(page)
  await updateRuntimeNotice(page, {
    error: 'The desktop application connection is unavailable.',
    status: null,
  })
  const notice = page.getByRole('region', { name: 'Image generation status' })
  await expect(
    notice.getByRole('heading', { name: 'Image generation status is unavailable' }),
  ).toBeVisible()
  await expect(notice.getByText('The desktop application connection is unavailable.')).toBeVisible()
  await expect(notice.getByRole('button', { name: 'Repair' })).toHaveCount(0)
  await expect(notice.getByRole('button', { name: 'Set up' })).toHaveCount(0)
  await notice.getByRole('button', { exact: true, name: 'Check again' }).click()
  expect(
    await page.evaluate(() => (globalThis as RuntimeNoticeGlobal).runtimeNoticeFixture.checks),
  ).toBe(1)
})

const outpaintRepairStatus = (): RuntimeStatus => ({
  ...runtimeStatus('ready'),
  detail: 'The shared outpainting resource is unavailable or changed.',
  outpaintInfill: 'needs-repair',
})

test('ready generation with unavailable outpainting shows a local repair notice and both actions', async ({
  page,
}, testInfo) => {
  await mountRuntimeNotice(page)
  await updateRuntimeNotice(page, { status: outpaintRepairStatus() })
  const notice = page.getByRole('region', { name: 'Image generation status' })
  await expect(notice.getByRole('heading', { name: 'Outpainting needs repair' })).toBeVisible()
  await expect(
    notice.getByText(
      'The outpainting resource is unavailable. Other image generation and project tools remain available.',
    ),
  ).toBeVisible()
  await expect(
    notice.getByText('The image engine cannot start. Repair it to resume generation.'),
  ).toHaveCount(0)
  await expect(notice.locator('.n-spin')).toHaveCount(0)
  await expect(notice.getByRole('button', { name: 'Set up' })).toHaveCount(0)
  const repair = notice.getByRole('button', { exact: true, name: 'Repair' })
  const check = notice.getByRole('button', { exact: true, name: 'Check again' })
  await expect(repair).toBeEnabled()
  await expect(check).toBeEnabled()
  await notice.getByText('Details', { exact: true }).click()
  await expect(
    notice.getByText('The shared outpainting resource is unavailable or changed.'),
  ).toBeVisible()
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('outpainting-needs-repair.png'),
  })
  await repair.click()
  expect(
    await page.evaluate(() => (globalThis as RuntimeNoticeGlobal).runtimeNoticeFixture.repairs),
  ).toBe(1)
  expect(
    await page.evaluate(() => (globalThis as RuntimeNoticeGlobal).runtimeNoticeFixture.installs),
  ).toBe(0)
})

test('partial outpainting health respects pending actions and keeps explicit repair failure recoverable', async ({
  page,
}, testInfo) => {
  await mountRuntimeNotice(page)
  await updateRuntimeNotice(page, { status: outpaintRepairStatus() })
  const notice = page.getByRole('region', { name: 'Image generation status' })
  const repair = notice.getByRole('button', { name: /^(loading )?Repair$/ })
  const check = notice.getByRole('button', { exact: true, name: 'Check again' })
  for (const pending of ['check', 'install', 'repair'] as const) {
    await updateRuntimeNotice(page, { pending })
    await expect(repair).toBeDisabled()
    await expect(check).toBeDisabled()
    await expect(notice.getByRole('heading', { name: 'Outpainting needs repair' })).toBeVisible()
    if (pending === 'repair') {
      await expect(repair).toHaveClass(/n-button--loading/)
    }
  }
  await updateRuntimeNotice(page, {
    error:
      'Verified release artifacts and a complete setup preview are not available in this build.',
    pending: null,
  })
  await expect(repair).toBeEnabled()
  await expect(check).toBeEnabled()
  await expect(notice.getByRole('alert')).toContainText('Action could not be completed')
  await expect(notice.getByRole('alert')).toContainText('Verified release artifacts')
  await expect(notice.getByRole('heading', { name: 'Outpainting needs repair' })).toBeVisible()
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('outpainting-repair-unavailable.png'),
  })
  expect(
    await page.evaluate(() => (globalThis as RuntimeNoticeGlobal).runtimeNoticeFixture.repairs),
  ).toBe(0)
})

test('Check again forwards one refresh and restored outpainting clears the notice', async ({
  page,
}) => {
  await mountRuntimeNotice(page)
  await updateRuntimeNotice(page, { status: outpaintRepairStatus() })
  const notice = page.getByRole('region', { name: 'Image generation status' })
  await notice.getByRole('button', { exact: true, name: 'Check again' }).click()
  expect(
    await page.evaluate(() => (globalThis as RuntimeNoticeGlobal).runtimeNoticeFixture.checks),
  ).toBe(1)
  await updateRuntimeNotice(page, { pending: 'check' })
  await expect(notice.getByRole('button', { exact: true, name: 'Check again' })).toBeDisabled()
  await updateRuntimeNotice(page, {
    pending: null,
    status: { ...runtimeStatus('ready'), outpaintInfill: 'ready' },
  })
  await expect(notice).toHaveCount(0)
  await expect(
    page.getByText('Project editing stays available while the image engine starts.'),
  ).toBeVisible()
  expect(
    await page.evaluate(() => (globalThis as RuntimeNoticeGlobal).runtimeNoticeFixture.repairs),
  ).toBe(0)
})

for (const outpaintInfill of [undefined, 'ready'] as const) {
  test(`ready generation with ${outpaintInfill ?? 'absent'} outpainting health retains the hidden notice`, async ({
    page,
  }) => {
    await mountRuntimeNotice(page)
    await updateRuntimeNotice(page, {
      status: { ...runtimeStatus('ready'), ...(outpaintInfill ? { outpaintInfill } : {}) },
    })
    await expect(page.getByRole('region', { name: 'Image generation status' })).toHaveCount(0)
    await updateRuntimeNotice(page, {
      error: 'The status request could not be completed.',
    })
    const notice = page.getByRole('region', { name: 'Image generation status' })
    await expect(notice).toBeVisible()
    await expect(notice.getByRole('heading', { name: 'Outpainting needs repair' })).toHaveCount(0)
    await expect(notice.getByRole('button', { name: 'Repair' })).toHaveCount(0)
    await expect(notice.getByRole('button', { exact: true, name: 'Check again' })).toBeEnabled()
  })
}
