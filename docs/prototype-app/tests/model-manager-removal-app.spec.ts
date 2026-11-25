import type { ModelApi, ModelCatalogItem } from '../../../src/shared/api.js'
import type { ModelRemovalReview } from '../../../src/shared/model-removal.js'

import { expect, type Page, test } from '@playwright/test'
import path from 'node:path'

const sourceRoot = `/@fs${path.resolve(import.meta.dirname, '../../../src/renderer')}`
const resourceName = 'Disposable embedding'
const neighborName = 'Neighbor embedding'

interface RemovalFixture {
  finishReview: () => void
  removed: () => boolean
}

type RemovalGlobal = { modelRemovalFixture: RemovalFixture } & typeof globalThis

/** Production manager and real Naive modals with controlled model IPC responses. */
async function mountModelManager(page: Page, deferReview: boolean) {
  await page.setViewportSize({ height: 620, width: 900 })
  await page.goto('/')
  await page.evaluate(
    async ({ deferReview, neighborName, resourceName, root }) => {
      const loadModule = (url: string) => import(url)
      const [
        { createApp, h },
        { darkTheme, NConfigProvider },
        { default: ModelManager },
        { imageGenNaiveTheme },
      ] = await Promise.all([
        loadModule('/@id/vue'),
        loadModule('/@id/naive-ui'),
        loadModule(`${root}/components/ModelManager.vue`),
        loadModule(`${root}/theme/naive-theme.ts`),
        loadModule(`${root}/styles/global.css`),
      ])
      const original = document.getElementById('app') as HTMLElement & {
        __vue_app__?: { unmount: () => void }
      }
      original?.__vue_app__?.unmount()
      const host = document.createElement('div')
      host.id = 'app'
      document.body.replaceChildren(host)

      const resource = (name: string, id: string, versionId: string): ModelCatalogItem => ({
        author: null,
        defaultVersionId: versionId,
        description: null,
        id,
        modelId: null,
        name,
        previewDataUrl: null,
        resourceType: 'embedding',
        sourceUrl: null,
        trainedWords: [],
        versions: [
          {
            baseModelFamily: 'illustrious',
            civitaiFileId: null,
            civitaiVersionId: null,
            dependencyIssues: [],
            fileName: `${name}.safetensors`,
            fileSizeBytes: 16,
            fileStatus: 'ready',
            format: 'safetensors',
            id: versionId,
            installedAt: '2026-11-01T00:00:00.000Z',
            name: 'v1',
            predictionType: null,
            sha256: 'a'.repeat(64),
            trainedWords: [],
          },
        ],
      })
      const target = resource(
        resourceName,
        '70000000-0000-4000-8000-000000000001',
        '70000000-0000-4000-8000-000000000002',
      )
      const neighbor = resource(
        neighborName,
        '70000000-0000-4000-8000-000000000003',
        '70000000-0000-4000-8000-000000000004',
      )
      const review: ModelRemovalReview = {
        fileCount: 1,
        name: target.name,
        pendingJobs: 0,
        resourceId: target.id,
        runningJobs: 0,
        sharedFileCount: 0,
        token: '70000000-0000-4000-8000-000000000005',
        versionCount: 1,
      }
      let removed = false
      let releaseReview: (() => void) | undefined
      const unsubscribe = () => () => undefined
      const models: Pick<
        ModelApi,
        | 'getCatalog'
        | 'getInstallJobs'
        | 'getStorageSummary'
        | 'getTokenStatus'
        | 'onCatalogChanged'
        | 'onInstallChanged'
        | 'removeLocalResource'
        | 'reviewRemoval'
      > = {
        getCatalog: async () => ({ ok: true, value: removed ? [neighbor] : [target, neighbor] }),
        getInstallJobs: async () => ({ ok: true, value: [] }),
        getStorageSummary: async () => ({ ok: true, value: { totalBytes: removed ? 16 : 32 } }),
        getTokenStatus: async () => ({ ok: true, value: { detail: '', kind: 'missing' } }),
        onCatalogChanged: unsubscribe,
        onInstallChanged: unsubscribe,
        removeLocalResource: async (token, cancelPending) => {
          if (token !== review.token || cancelPending !== false || removed) {
            throw new Error('Expected one removal using the reviewed token.')
          }
          removed = true
          return { ok: true, value: undefined }
        },
        reviewRemoval: async (id) => {
          if (id !== target.id || removed) {
            throw new Error('Expected review of the selected disposable embedding.')
          }
          if (deferReview) {
            await new Promise<void>((resolve) => {
              releaseReview = resolve
            })
          }
          return { ok: true, value: review }
        },
      }
      ;(globalThis as { api: unknown } & typeof globalThis).api = { models }
      ;(globalThis as RemovalGlobal).modelRemovalFixture = {
        finishReview() {
          if (!releaseReview) {
            throw new Error('No resource review is pending.')
          }
          releaseReview()
          releaseReview = undefined
        },
        removed: () => removed,
      }
      createApp({
        render: () =>
          h(
            NConfigProvider,
            { theme: darkTheme, themeOverrides: imageGenNaiveTheme },
            {
              default: () => h(ModelManager, { focus: null, show: true }),
            },
          ),
      }).mount(host)
    },
    { deferReview, neighborName, resourceName, root: sourceRoot },
  )
  const manager = page.getByRole('dialog', { exact: true, name: 'Model Manager' })
  const row = (name: string) => manager.locator('.resource-select').filter({ hasText: name })
  const trigger = manager.getByRole('button', { exact: true, name: 'Remove Local Resource' })
  const confirmation = page.getByRole('dialog', { exact: true, name: 'Remove Local Resource' })
  await expect(row(neighborName)).toBeVisible()
  await row(resourceName).press('Enter')
  await trigger.press('Enter')
  if (deferReview) {
    await expect(trigger).toBeDisabled()
    await expect(confirmation).toBeHidden()
    await page.evaluate(() => (globalThis as RemovalGlobal).modelRemovalFixture.finishReview())
  }
  await expect(confirmation).toBeVisible()
  await expect(confirmation.getByRole('button', { exact: true, name: 'Cancel' })).toBeFocused()
  return { confirmation, manager, row, trigger }
}

test('resource removal Escape restores its Model Manager trigger after async review', async ({
  page,
}, testInfo) => {
  const { confirmation, row, trigger } = await mountModelManager(page, true)
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('confirmation.png') })
  await page.keyboard.press('Escape')
  await expect(confirmation).toBeHidden()
  await expect(row(resourceName)).toBeVisible()
  expect(
    await page.evaluate(() => (globalThis as RemovalGlobal).modelRemovalFixture.removed()),
  ).toBe(false)
  await expect(trigger).toBeFocused()
  expect(await trigger.evaluate((button) => button.matches(':focus-visible'))).toBe(true)
})

test('confirmed resource removal moves focus to the Model Manager catalog search', async ({
  page,
}, testInfo) => {
  const { confirmation, manager, row } = await mountModelManager(page, false)
  const confirm = confirmation.getByRole('button', { exact: true, name: 'Remove permanently' })
  const acknowledgment = confirmation.getByRole('checkbox', { name: /referenced settings/ })
  await expect(confirm).toBeDisabled()
  await expect(acknowledgment).not.toBeChecked()
  await acknowledgment.press('Space')
  await expect(confirm).toBeEnabled()
  await confirm.press('Enter')
  await expect(confirmation).toBeHidden()
  await expect(row(resourceName)).toHaveCount(0)
  await expect(row(neighborName)).toBeVisible()
  expect(
    await page.evaluate(() => (globalThis as RemovalGlobal).modelRemovalFixture.removed()),
  ).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('removed.png') })
  const search = manager.getByPlaceholder('Search installed models')
  await expect(search).toBeFocused()
  expect(await search.evaluate((input) => input.matches(':focus-visible'))).toBe(true)
})
