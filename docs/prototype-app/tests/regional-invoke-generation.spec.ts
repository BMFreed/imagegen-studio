import type { ModelCatalogItem, ProjectTab } from '../../../src/shared/api'
import type {
  GenerationQueueEntry,
  GenerationQueueReview,
} from '../../../src/shared/projects/generation-queue-manager'
import type { ProjectGenerationActionState } from '../../../src/shared/projects/project-generation-actions'

import { expect, type Page, test } from '@playwright/test'
import path from 'node:path'

interface WiringFixture {
  catalog: ModelCatalogItem[]
  epoch: number
  generateCalls: number[]
  holdTarget: boolean
  queueItem: GenerationQueueEntry
  releaseTarget: (() => void) | null
  retryCalls: GenerationQueueReview[]
  selected: string | null
  show: boolean
  smartReason: string | null
  state: ProjectGenerationActionState
  tab: ProjectTab
  targetMode: 'img2img' | 'outpaint' | 'txt2img' | null
  targetReads: number
}

declare global {
  interface Window {
    regionalWiringFixture: WiringFixture
  }
}

test('renderer regional outpaint uses actual target, explicit strength and separate capability', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (cause) => errors.push(cause.message))
  await mountWiring(page, 'project')
  const generate = page.getByRole('button', { exact: true, name: 'Generate' })
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.targetMode = 'outpaint'
    fixture.tab.primaryBbox.x += 8
    fixture.tab.generationDraft.sampling.denoisingStrength = 0.5
    fixture.state.regionalImg2ImgSupported = true
    fixture.state.regionalOutpaintSupported = false
  })
  await expect(generate).toBeDisabled()
  await expect(page.getByText(/outpaint with Regional Guidance/)).toBeVisible()
  await page.evaluate(() => {
    globalThis.window.regionalWiringFixture.state.regionalOutpaintSupported = true
  })
  await expect(generate).toBeEnabled()
  await generate.click()
  expect(await page.evaluate(() => globalThis.window.regionalWiringFixture.generateCalls)).toEqual([
    1,
  ])
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.tab.generationDraft.sampling.denoisingStrength = null
  })
  await expect(generate).toBeDisabled()
  await expect(page.getByText(/Set Denoising Strength from 0 to 1/)).toBeVisible()
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.tab.generationDraft.sampling.denoisingStrength = 0.5
    fixture.state.regionalOutpaintSupported = false
    fixture.targetMode = 'txt2img'
    fixture.tab.primaryBbox.x += 8
  })
  await expect(generate).toBeEnabled()
  expect(errors).toEqual([])
})

test('renderer frozen regional outpaint Retry uses frozen mode despite current authoring', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (cause) => errors.push(cause.message))
  await mountWiring(page, 'queue')
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.queueItem.operation = 'illustrious-regional-outpaint'
    fixture.tab.regionalGuidance = []
    fixture.tab.generationDraft.model!.baseModelFamily = 'anima'
    fixture.state.regionalImg2ImgSupported = true
    fixture.state.regionalOutpaintSupported = false
    fixture.epoch += 1
  })
  const retry = page.getByRole('button', { exact: true, name: 'Retry job' })
  await expect(retry).toBeDisabled()
  await expect(
    page
      .getByRole('region', { name: 'Generation jobs' })
      .getByText(/does not support outpaint with Regional Guidance/),
  ).toBeVisible()
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.state.regionalOutpaintSupported = true
    fixture.epoch += 1
  })
  await expect(retry).toBeEnabled()
  await retry.click()
  await expect
    .poll(() => page.evaluate(() => globalThis.window.regionalWiringFixture.retryCalls.length))
    .toBe(1)
  expect(errors).toEqual([])
})

test('renderer opaque IMG rescale requires the combination capability and preserves zero', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (cause) => errors.push(cause.message))
  await mountWiring(page, 'project')
  const generate = page.getByRole('button', { exact: true, name: 'Generate' })
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.targetMode = 'img2img'
    fixture.tab.primaryBbox.x += 8
    fixture.tab.generationDraft.sampling.denoisingStrength = 0.5
    fixture.tab.generationDraft.cfgRescale = 0.7
    fixture.state.regionalImg2ImgSupported = true
    fixture.state.regionalCfgRescaleSupported = true
    fixture.state.regionalImg2ImgCfgRescaleSupported = false
  })
  await expect(generate).toBeDisabled()
  await expect(
    page.getByText(
      'The current image engine does not support CFG Rescale with opaque regional img2img. Repair or update the runtime.',
    ),
  ).toBeVisible()
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.tab.generationDraft.cfgRescale = 0
  })
  await expect(generate).toBeEnabled()
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.tab.generationDraft.cfgRescale = 0.99
    delete fixture.state.regionalImg2ImgCfgRescaleSupported
  })
  await expect(generate).toBeDisabled()
  await expect(
    page.getByText(/Checking image engine support for CFG Rescale with opaque regional img2img/),
  ).toBeVisible()
  await page.evaluate(() => {
    globalThis.window.regionalWiringFixture.state.regionalImg2ImgCfgRescaleSupported = true
  })
  await expect(generate).toBeEnabled()
  await page.screenshot({ path: testInfo.outputPath('opaque-img-rescale-enabled.png') })
  await generate.click()
  expect(await page.evaluate(() => globalThis.window.regionalWiringFixture.generateCalls)).toEqual([
    1,
  ])
  expect(errors).toEqual([])
})

test('renderer frozen IMG rescale Retry follows frozen settings and the combination capability', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (cause) => errors.push(cause.message))
  await mountWiring(page, 'queue')
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.queueItem.operation = 'illustrious-regional-img2img'
    fixture.queueItem.details!.sampling.cfgRescale = 0.7
    fixture.state.regionalImg2ImgSupported = true
    fixture.state.regionalCfgRescaleSupported = true
    fixture.state.regionalImg2ImgCfgRescaleSupported = false
    fixture.tab.regionalGuidance = []
    fixture.tab.generationDraft.cfgRescale = 0
    fixture.tab.generationDraft.model!.baseModelFamily = 'anima'
    fixture.epoch += 1
  })
  const retry = page.getByRole('button', { exact: true, name: 'Retry job' })
  await expect(retry).toBeDisabled()
  await page.evaluate(() => {
    globalThis.window.regionalWiringFixture.state.regionalImg2ImgCfgRescaleSupported = true
  })
  await expect(retry).toBeEnabled()
  await retry.click()
  expect(await page.evaluate(() => globalThis.window.regionalWiringFixture.retryCalls)).toEqual([
    await page.evaluate(() => ({
      id: globalThis.window.regionalWiringFixture.queueItem.id,
      statusSequence: 3,
    })),
  ])
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.queueItem.details!.sampling.cfgRescale = 0
    fixture.state.regionalImg2ImgCfgRescaleSupported = false
    fixture.epoch += 1
  })
  await expect(retry).toBeEnabled()
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.queueItem.operation = 'illustrious-regional-txt2img'
    fixture.queueItem.details!.sampling.cfgRescale = 0.7
    fixture.epoch += 1
  })
  await expect(retry).toBeEnabled()
  expect(errors).toEqual([])
})

test('renderer opaque IMG Euler a requires the combination capability and keeps CFG Rescale separate', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (cause) => errors.push(cause.message))
  await mountWiring(page, 'project')
  const generate = page.getByRole('button', { exact: true, name: 'Generate' })
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.targetMode = 'img2img'
    fixture.tab.primaryBbox.x += 8
    fixture.tab.generationDraft.sampling.sampler = 'Euler a'
    fixture.tab.generationDraft.sampling.denoisingStrength = 0.5
    fixture.state.regionalImg2ImgSupported = true
    fixture.state.regionalInvokeInitializationSupported = true
  })
  await expect(generate).toBeDisabled()
  await expect(
    page.getByText(/Checking image engine support for Euler a with opaque regional img2img/),
  ).toBeVisible()
  await page.evaluate(() => {
    globalThis.window.regionalWiringFixture.state.regionalImg2ImgEulerASupported = false
  })
  await expect(generate).toBeDisabled()
  await expect(
    page.getByText(
      'The current image engine does not support Euler a with opaque regional img2img. Repair or update the runtime.',
    ),
  ).toBeVisible()
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.state.regionalImg2ImgEulerASupported = true
  })
  await expect(generate).toBeEnabled()
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.tab.generationDraft.cfgRescale = 0.7
    fixture.state.regionalCfgRescaleSupported = true
    fixture.state.regionalImg2ImgCfgRescaleSupported = false
  })
  await expect(generate).toBeDisabled()
  await expect(
    page.getByText(/does not support CFG Rescale with opaque regional img2img/),
  ).toBeVisible()
  await page.evaluate(() => {
    globalThis.window.regionalWiringFixture.state.regionalImg2ImgCfgRescaleSupported = true
  })
  await expect(generate).toBeEnabled()
  expect(
    await page.evaluate(
      () => globalThis.window.regionalWiringFixture.tab.generationDraft.sampling.sampler,
    ),
  ).toBe('Euler a')
  await page.screenshot({ path: testInfo.outputPath('opaque-img-euler-a-enabled.png') })
  await generate.click()
  expect(await page.evaluate(() => globalThis.window.regionalWiringFixture.generateCalls)).toEqual([
    1,
  ])
  expect(errors).toEqual([])
})

test('renderer frozen IMG Euler a Retry follows frozen sampler rather than saved Euler draft', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (cause) => errors.push(cause.message))
  await mountWiring(page, 'queue')
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.queueItem.operation = 'illustrious-regional-img2img'
    fixture.queueItem.details!.sampling.sampler = 'Euler a'
    fixture.queueItem.details!.sampling.denoisingStrength = 0.5
    fixture.state.regionalImg2ImgSupported = true
    fixture.state.regionalInvokeInitializationSupported = true
    fixture.state.regionalImg2ImgEulerASupported = false
    fixture.tab.regionalGuidance = []
    fixture.tab.generationDraft.sampling.sampler = 'Euler'
    fixture.tab.generationDraft.model!.baseModelFamily = 'anima'
    fixture.epoch += 1
  })
  const retry = page.getByRole('button', { exact: true, name: 'Retry job' })
  await expect(retry).toBeDisabled()
  await page.evaluate(() => {
    globalThis.window.regionalWiringFixture.state.regionalImg2ImgEulerASupported = true
  })
  await expect(retry).toBeEnabled()
  await retry.click()
  expect(await page.evaluate(() => globalThis.window.regionalWiringFixture.retryCalls)).toEqual([
    await page.evaluate(() => ({
      id: globalThis.window.regionalWiringFixture.queueItem.id,
      statusSequence: 3,
    })),
  ])
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.queueItem.details!.sampling.sampler = 'Euler'
    delete fixture.state.regionalImg2ImgEulerASupported
    fixture.epoch += 1
  })
  await expect(retry).toBeEnabled()
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.queueItem.operation = 'illustrious-regional-txt2img'
    fixture.queueItem.details!.sampling.sampler = 'Euler a'
    fixture.epoch += 1
  })
  await expect(retry).toBeEnabled()
  expect(errors).toEqual([])
})

const sourceRoot = `/@fs${path.resolve(import.meta.dirname, '../../../src')}`

test('renderer Anima regional Generate uses its own capability and explicit local-empty negative without changing authoring', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (cause) => errors.push(cause.message))
  await mountWiring(page, 'project')
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    const draft = fixture.tab.generationDraft
    draft.model!.baseModelFamily = 'anima'
    draft.model!.predictionType = null
    fixture.catalog[0]!.versions[0]!.baseModelFamily = 'anima'
    fixture.catalog[0]!.versions[0]!.predictionType = null
    draft.sampling.animaMethod = 'euler'
    draft.vaePrecision = 'Auto'
    draft.positivePrompt.text = '(white cat)0'
    fixture.tab.primaryBbox.width = 256
    fixture.tab.primaryBbox.height = 256
    fixture.tab.regionalGuidance![0]!.prompts = {
      negative: null,
      positive: { embeddingRefs: [], text: '(red scarf)1.5' },
      useGlobalNegativePrompt: true,
    }
    fixture.state.animaRegionalSupported = false
    fixture.state.animaSupported = true
    fixture.state.regionalSupported = true
  })
  const generate = page.getByRole('button', { exact: true, name: 'Generate' })
  await expect(generate).toBeDisabled()
  await expect(page.getByText(/does not support Anima Regional Guidance/)).toBeVisible()
  await page.evaluate(() => {
    globalThis.window.regionalWiringFixture.state.animaRegionalSupported = true
  })
  await expect(generate).toBeEnabled()
  await page.evaluate(() => {
    globalThis.window.regionalWiringFixture.tab.generationDraft.negativePrompt.text = 'bad anatomy'
  })
  await expect(generate).toBeDisabled()
  await expect(page.getByText(/turn off Use global negative prompt/)).toBeVisible()
  await page.evaluate(() => {
    const prompts = globalThis.window.regionalWiringFixture.tab.regionalGuidance![0]!.prompts!
    prompts.useGlobalNegativePrompt = false
    prompts.negative = { embeddingRefs: [], text: '' }
  })
  await expect(generate).toBeEnabled()
  await generate.click()
  expect(await page.evaluate(() => globalThis.window.regionalWiringFixture.generateCalls)).toEqual([
    1,
  ])
  expect(
    await page.evaluate(
      () => globalThis.window.regionalWiringFixture.tab.generationDraft.negativePrompt.text,
    ),
  ).toBe('bad anatomy')
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.targetMode = 'img2img'
    fixture.tab.primaryBbox.x += 8
  })
  await expect(generate).toBeDisabled()
  await expect(page.getByText(/img2img requires Denoising Strength from 0 to 1/)).toBeVisible()
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.tab.generationDraft.sampling.denoisingStrength = 0.5
    fixture.state.animaRegionalImg2ImgSupported = false
  })
  await expect(generate).toBeDisabled()
  await expect(page.getByText(/does not support Anima Regional Guidance img2img/)).toBeVisible()
  await page.evaluate(() => {
    globalThis.window.regionalWiringFixture.state.animaRegionalImg2ImgSupported = true
  })
  await expect(generate).toBeEnabled()
  await generate.click()
  expect(await page.evaluate(() => globalThis.window.regionalWiringFixture.generateCalls)).toEqual([
    1, 1,
  ])
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.targetMode = 'outpaint'
    fixture.tab.primaryBbox.x += 8
  })
  await expect(generate).toBeDisabled()
  await expect(page.getByText(/support for Anima Regional Guidance outpaint/)).toBeVisible()
  await page.evaluate(() => {
    globalThis.window.regionalWiringFixture.state.animaRegionalOutpaintSupported = false
  })
  await expect(generate).toBeDisabled()
  await expect(page.getByText(/does not support Anima Regional Guidance outpaint/)).toBeVisible()
  await page.evaluate(() => {
    globalThis.window.regionalWiringFixture.state.animaRegionalOutpaintSupported = true
  })
  await expect(generate).toBeDisabled()
  await expect(
    page.getByLabel('Generation actions').getByText(/does not support outpaint for Anima/),
  ).toBeVisible()
  await page.evaluate(() => {
    globalThis.window.regionalWiringFixture.state.animaOutpaintSupported = true
  })
  await expect(generate).toBeEnabled()
  await generate.click()
  expect(await page.evaluate(() => globalThis.window.regionalWiringFixture.generateCalls)).toEqual([
    1, 1, 1,
  ])
  expect(errors).toEqual([])
})

test('renderer frozen Anima regional Retry ignores later draft family and requires separate regional support', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (cause) => errors.push(cause.message))
  await mountWiring(page, 'queue')
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.queueItem.operation = 'anima-regional-txt2img'
    fixture.tab.regionalGuidance = []
    fixture.tab.generationDraft.positivePrompt.text = 'later Illustrious text'
    fixture.state.animaRegionalSupported = false
    fixture.state.animaSupported = true
    fixture.state.regionalSupported = true
    fixture.epoch += 1
  })
  const retry = page.getByRole('button', { exact: true, name: 'Retry job' })
  await expect(retry).toBeDisabled()
  await expect(
    page
      .getByRole('region', { name: 'Generation jobs' })
      .getByText(/does not support Anima Regional Guidance/),
  ).toBeVisible()
  await page.evaluate(() => {
    const state = globalThis.window.regionalWiringFixture.state
    state.animaRegionalSupported = true
    state.animaSupported = false
    state.regionalSupported = false
  })
  await expect(retry).toBeEnabled()
  await retry.click()
  await expect
    .poll(() => page.evaluate(() => globalThis.window.regionalWiringFixture.retryCalls.length))
    .toBe(1)
  expect(errors).toEqual([])
})

/** Real renderer components, explicit mock IPC. These tests make no inference/runtime claim. */
async function mountWiring(page: Page, kind: 'project' | 'queue') {
  await page.goto('/?prototype=project')
  await page.evaluate(
    async ({ kind, sourceRoot }) => {
      const loadModule = (url: string) => import(url)
      const [{ createApp, h, reactive }, { createEmptyProjectDocumentV1 }, { default: Component }] =
        await Promise.all([
          loadModule('/@id/vue'),
          loadModule(`${sourceRoot}/shared/projects/project-schema.ts`),
          loadModule(
            `${sourceRoot}/renderer/components/${kind === 'project' ? 'ProjectView' : 'GenerationQueueManager'}.vue`,
          ),
        ])
      const documentValue = createEmptyProjectDocumentV1({ title: 'Regional wiring fixture' })
      const model: NonNullable<ProjectTab['generationDraft']['model']> = {
        baseModelFamily: 'illustrious',
        civitaiFileId: null,
        civitaiModelId: null,
        civitaiVersionId: null,
        displayName: 'Fixture Illustrious',
        fileSha256: 'a'.repeat(64),
        kind: 'checkpoint',
        localModelId: crypto.randomUUID(),
        localVersionId: crypto.randomUUID(),
        predictionType: 'epsilon',
        versionName: 'Fixture version',
      }
      documentValue.generationDraft.model = model
      documentValue.generationDraft.sampling = {
        cfgScale: 5,
        denoisingStrength: null,
        sampler: 'Euler',
        scheduler: 'Normal',
        steps: 30,
      }
      documentValue.generationDraft.vaePrecision = 'FP16'
      documentValue.regionalGuidance = [
        {
          enabled: true,
          id: crypto.randomUUID(),
          locked: false,
          mask: { asset: null, id: crypto.randomUUID(), revision: 0 },
          name: 'Fixture region',
          overlayOpacity: 0,
        },
      ]
      const tab: ProjectTab = {
        ...documentValue,
        acceptedResults: [],
        autosaveError: null,
        canRedo: false,
        canUndo: false,
        dirty: false,
        id: `project-v1-${'b'.repeat(64)}`,
        layers: [],
      }
      const modelCatalog: ModelCatalogItem[] = [
        {
          author: null,
          defaultVersionId: model.localVersionId,
          description: null,
          id: model.localModelId,
          modelId: null,
          name: model.displayName,
          previewDataUrl: null,
          resourceType: 'checkpoint',
          sourceUrl: null,
          trainedWords: [],
          versions: [
            {
              baseModelFamily: 'illustrious',
              civitaiFileId: null,
              civitaiVersionId: null,
              dependencyIssues: [],
              fileName: 'fixture.safetensors',
              fileSizeBytes: 1,
              fileStatus: 'ready',
              format: 'SafeTensor',
              id: model.localVersionId,
              installedAt: '2026-11-03T00:00:00.000Z',
              name: model.versionName,
              predictionType: 'epsilon',
              sha256: model.fileSha256,
              trainedWords: [],
            },
          ],
        },
      ]
      const state: WiringFixture = reactive({
        catalog: modelCatalog,
        epoch: 0,
        generateCalls: [],
        holdTarget: false,
        queueItem: {
          batchId: crypto.randomUUID(),
          cancelRequested: false,
          createdAt: '2026-11-03T00:00:00.000Z',
          details: {
            modelName: model.displayName,
            modelVersion: model.versionName,
            negativePrompt: '',
            prompt: 'Frozen regional prompt',
            sampling: {
              cfgScale: 5,
              predictionType: 'epsilon',
              sampler: 'Euler',
              scheduler: 'Normal',
              seed: 42,
              steps: 30,
            },
            size: { height: 1024, width: 1024 },
          },
          documentId: tab.documentId,
          error: { code: 'FIXTURE_FAILURE', message: 'Mock failure' },
          finishedAt: '2026-11-03T00:00:01.000Z',
          id: crypto.randomUUID(),
          operation: 'illustrious-regional-txt2img',
          projectKey: tab.id,
          projectName: tab.title,
          publicationPending: false,
          stagingSessionId: crypto.randomUUID(),
          startedAt: '2026-11-03T00:00:00.000Z',
          status: 'failed',
          statusSequence: 3,
        },
        releaseTarget: null,
        retryCalls: [],
        selected: null,
        show: true,
        smartReason: null,
        state: {
          animaSupported: true,
          cfgRescaleSupported: true,
          documentId: tab.documentId,
          embeddingsSupported: true,
          error: null,
          externalVaeSupported: true,
          img2imgSupported: true,
          jobs: [],
          outpaintSupported: true,
          phase: 'idle',
          regionalSupported: true,
          runningJobId: null,
          smartPatchSupported: true,
          vaePrecisionSupported: true,
        },
        tab,
        targetMode: 'txt2img',
        targetReads: 0,
      })
      globalThis.window.regionalWiringFixture = state
      Object.defineProperty(globalThis, 'api', {
        configurable: true,
        value: {
          projects: {
            getGenerationQueue: async () => ({
              ok: true,
              value: {
                counts: { canceled: 0, completed: 0, failed: 1, pending: 0, running: 0 },
                items: [state.queueItem],
                nextCursor: null,
              },
            }),
            getGenerationTargetState: async (
              _projectKey: string,
              documentId: string,
              targetKey: string,
            ) => {
              state.targetReads += 1
              if (state.holdTarget) {
                await new Promise<void>((resolve) => {
                  state.releaseTarget = resolve
                })
              }
              return {
                ok: true,
                value: {
                  documentId,
                  mode: state.targetMode,
                  targetKey,
                  unavailableReason:
                    state.targetMode === null ? 'Fixture target is unavailable.' : null,
                },
              }
            },
            getSmartPatchGenerationTargetState: async (
              _projectKey: string,
              documentId: string,
              documentRevision: string,
              layerId: string,
            ) => ({
              ok: true,
              value: {
                documentId,
                documentRevision,
                layerId,
                mode: state.smartReason ? null : 'inpaint',
                unavailableReason: state.smartReason,
              },
            }),
            retryGenerationJob: async (review: GenerationQueueReview) => {
              state.retryCalls.push(review)
              return { ok: true, value: undefined }
            },
          },
        },
      })
      const original = document.getElementById('app') as HTMLElement & {
        __vue_app__?: { unmount: () => void }
      }
      original?.__vue_app__?.unmount()
      const host = document.createElement('div')
      host.id = 'regional-wiring-fixture'
      document.body.replaceChildren(host)
      createApp({
        render: () =>
          kind === 'project'
            ? h(Component, {
                acceptedHistoryFocus: null,
                busy: false,
                draftPending: false,
                error: null,
                exportFeedback: null,
                generationCanceling: false,
                generationDraft: state.tab.generationDraft,
                generationError: null,
                generationNotice: null,
                generationProgress: { current: null, revision: 0 },
                generationResultFocus: null,
                generationResults: null,
                generationResultsError: null,
                generationResultsLoading: false,
                generationState: state.state,
                generationStateLoading: false,
                generationSubmitting: false,
                imagesPerClick: 1,
                modelCatalog: state.catalog,
                modelCatalogError: null,
                modelCatalogLoaded: true,
                modelCatalogLoading: false,
                onGenerate: (iterations: number) => state.generateCalls.push(iterations),
                'onUpdate:selectedLayerId': (id: string | null) => {
                  state.selected = id
                },
                patchFreshness: { error: null, inspection: null, loading: false, owner: null },
                pending: null,
                presets: [],
                presetsError: null,
                presetsLoading: false,
                projectGenerationDraft: state.tab.generationDraft,
                promptHistoryEpoch: 0,
                reloadRequired: false,
                runtimeUnavailableReason: null,
                saveNotice: null,
                selectedLayerId: state.selected,
                smartPatchResults: null,
                smartPatchResultsError: null,
                smartPatchResultsLoading: false,
                tab: state.tab,
                variantDiagnosticsEpoch: 0,
                variantDiagnosticsPending: false,
              })
            : h(Component, {
                appBusy: false,
                generationErrors: {},
                generationLoading: {},
                generationProgress: { current: null, revision: 0 },
                generationStates: { [state.tab.id]: state.state },
                'onUpdate:show': (value: boolean) => {
                  state.show = value
                },
                projectTabs: [state.tab],
                refreshEpoch: state.epoch,
                reloadRequiredIds: new Set(),
                resultErrors: {},
                resultLoading: {},
                resultNavigationError: null,
                resultOpeningId: null,
                resultSnapshots: {},
                runtimeUnavailableReason: null,
                show: state.show,
                smartResultErrors: {},
                smartResultLoading: {},
                smartResultSnapshots: {},
              }),
      }).mount(host)
    },
    { kind, sourceRoot },
  )
}

test('renderer Generate requires explicit regional support and retains ordinary and Smart target guards', async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = []
  page.on('pageerror', (cause) => pageErrors.push(cause.message))
  await page.setViewportSize({ height: 900, width: 1440 })
  await mountWiring(page, 'project')
  const generate = page.getByRole('button', { exact: true, name: 'Generate' })
  await expect
    .poll(() => page.evaluate(() => globalThis.window.regionalWiringFixture.targetReads))
    .toBeGreaterThan(0)
  await expect(generate).toBeEnabled()
  await expect(page.getByText('Generation unavailable while this region is enabled.')).toHaveCount(
    0,
  )
  await expect(
    page.getByText('Enabled for Current Canvas. Generate checks model and target compatibility.'),
  ).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('regional-generate.png') })
  await generate.click()
  await expect
    .poll(() => page.evaluate(() => globalThis.window.regionalWiringFixture.generateCalls))
    .toEqual([1])
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.state.embeddingsSupported = false
    fixture.tab.generationDraft.positivePrompt.embeddingRefs = [
      {
        resource: {
          ...fixture.tab.generationDraft.model!,
          kind: 'embedding',
          predictionType: null,
        },
        token: 'dormant_ti',
      },
    ]
  })
  await expect(generate).toBeEnabled()
  await page.evaluate(() => {
    globalThis.window.regionalWiringFixture.tab.generationDraft.positivePrompt.text = 'dormant_ti'
  })
  await expect(generate).toBeDisabled()
  await expect(
    page.getByText(
      'The current image engine does not support global embeddings with Regional Guidance. Repair or update the runtime.',
      { exact: true },
    ),
  ).toBeVisible()
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.state.embeddingsSupported = true
    fixture.tab.generationDraft.positivePrompt = { embeddingRefs: [], text: '' }
  })
  await page.evaluate(() => {
    delete globalThis.window.regionalWiringFixture.state.regionalSupported
  })
  await expect(generate).toBeDisabled()
  await expect(page.getByText(/Checking image engine support for Regional Guidance/)).toBeVisible()
  await page.evaluate(() => {
    globalThis.window.regionalWiringFixture.state.regionalSupported = false
  })
  await expect(generate).toBeDisabled()
  await expect(page.getByText(/does not support Regional Guidance/)).toBeVisible()
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.tab.regionalGuidance![0]!.enabled = false
  })
  await expect(generate).toBeEnabled()
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.state.regionalSupported = true
    fixture.tab.regionalGuidance![0]!.enabled = true
    fixture.targetMode = 'img2img'
    fixture.tab.primaryBbox.x += 8
  })
  await expect(generate).toBeDisabled()
  await expect(page.getByText(/Set Denoising Strength from 0 to 1/)).toBeVisible()
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    const id = crypto.randomUUID()
    fixture.tab.layers = [
      {
        activeRaster: null,
        activeRasterSubLayerId: null,
        blendMode: 'normal',
        boundingBox: { height: 1024, width: 1024, x: 0, y: 0 },
        generationDraft: JSON.parse(JSON.stringify(fixture.tab.generationDraft)),
        id,
        internalResolution: { height: 1024, width: 1024 },
        kind: 'smart-patch',
        locked: false,
        mask: { asset: null, id: crypto.randomUUID(), revision: 0 },
        maskImageUrl: null,
        name: 'Fixture Smart Patch',
        opacity: 1,
        rasterSubLayers: [],
        status: 'empty',
        visible: true,
      },
    ]
    fixture.selected = id
  })
  await expect(generate).toBeDisabled()
  await expect(
    page.getByText(/Disable or delete all enabled regions before generating/),
  ).toBeVisible()
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.tab.regionalGuidance![0]!.enabled = false
    fixture.tab.layers[0]!.locked = true
  })
  await expect(page.getByText('Unlock and show this Smart Patch before generating.')).toBeVisible()
  await page.evaluate(() => {
    const patch = globalThis.window.regionalWiringFixture.tab.layers[0]!
    patch.locked = false
    patch.visible = false
  })
  await expect(generate).toBeDisabled()
  await expect(page.getByText('Unlock and show this Smart Patch before generating.')).toBeVisible()
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.smartReason = 'Fixture Smart target is unavailable.'
    fixture.tab.layers[0]!.visible = true
    fixture.tab.documentRevision = crypto.randomUUID()
  })
  await expect(generate).toBeDisabled()
  await expect(
    page.getByLabel('Generation actions').getByText('Fixture Smart target is unavailable.'),
  ).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => globalThis.window.regionalWiringFixture.generateCalls))
    .toEqual([1])
  expect(pageErrors).toEqual([])
})

test('renderer frozen Retry follows regional operation even after current authoring changes', async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = []
  page.on('pageerror', (cause) => pageErrors.push(cause.message))
  await mountWiring(page, 'queue')
  const retry = page.getByRole('button', { exact: true, name: 'Retry job' })
  await expect(retry).toBeEnabled()
  await page.screenshot({ path: testInfo.outputPath('regional-queue-retry.png') })
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    delete fixture.state.regionalSupported
    fixture.tab.regionalGuidance = []
    fixture.tab.generationDraft.model!.baseModelFamily = 'anima'
    fixture.tab.generationDraft.positivePrompt.text = '{current|authoring}'
  })
  await expect(retry).toBeDisabled()
  await expect(page.getByText(/does not support Regional Guidance/).first()).toBeVisible()
  await page.evaluate(() => {
    globalThis.window.regionalWiringFixture.state.regionalSupported = false
  })
  await expect(retry).toBeDisabled()
  await page.evaluate(() => {
    globalThis.window.regionalWiringFixture.state.regionalSupported = true
  })
  await expect(retry).toBeEnabled()
  await retry.click()
  await expect
    .poll(() => page.evaluate(() => globalThis.window.regionalWiringFixture.retryCalls))
    .toEqual([
      await page.evaluate(() => ({
        id: globalThis.window.regionalWiringFixture.queueItem.id,
        statusSequence: 3,
      })),
    ])
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.state.regionalSupported = false
    fixture.queueItem.operation = 'illustrious-txt2img'
    fixture.epoch += 1
  })
  await expect(retry).toBeEnabled()
  expect(pageErrors).toEqual([])
})

test('renderer opaque regional img2img uses actual target and explicit strength', async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = []
  page.on('pageerror', (cause) => pageErrors.push(cause.message))
  await page.setViewportSize({ height: 900, width: 1440 })
  await mountWiring(page, 'project')
  const generate = page.getByRole('button', { exact: true, name: 'Generate' })
  await expect(generate).toBeEnabled()
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.state.regionalImg2ImgSupported = true
    fixture.tab.generationDraft.sampling.denoisingStrength = 0.5
    fixture.targetMode = 'img2img'
    fixture.tab.primaryBbox.x += 8
  })
  await expect
    .poll(() => page.evaluate(() => globalThis.window.regionalWiringFixture.targetReads))
    .toBeGreaterThan(1)
  await expect(page.getByRole('textbox', { exact: true, name: 'Denoising Strength' })).toBeEnabled()
  await page.screenshot({ path: testInfo.outputPath('opaque-regional-generate.png') })
  await expect(generate).toBeEnabled()
  await generate.click()
  await expect
    .poll(() => page.evaluate(() => globalThis.window.regionalWiringFixture.generateCalls))
    .toEqual([1])

  await page.evaluate(() => {
    delete globalThis.window.regionalWiringFixture.state.regionalImg2ImgSupported
  })
  await expect(generate).toBeDisabled()
  await expect(page.getByText(/Checking image engine support for opaque img2img/)).toBeVisible()
  await page.evaluate(() => {
    globalThis.window.regionalWiringFixture.state.regionalImg2ImgSupported = false
  })
  await expect(generate).toBeDisabled()
  await expect(
    page.getByText(/does not support opaque img2img with Regional Guidance/),
  ).toBeVisible()
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.state.regionalImg2ImgSupported = true
    fixture.tab.generationDraft.sampling.denoisingStrength = null
  })
  await expect(generate).toBeDisabled()
  await expect(page.getByText(/Set Denoising Strength from 0 to 1/)).toBeVisible()
  for (const strength of [0, 1, 0.5]) {
    await page.evaluate((value) => {
      globalThis.window.regionalWiringFixture.tab.generationDraft.sampling.denoisingStrength = value
    }, strength)
    await expect(generate).toBeEnabled()
  }
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.state.regionalCfgRescaleSupported = true
    fixture.state.regionalInvokeInitializationSupported = true
    fixture.state.regionalDpmSupported = true
    fixture.state.regionalVaeSupported = true
  })
  for (const sampler of ['DPM++ SDE'] as const) {
    await page.evaluate((value) => {
      globalThis.window.regionalWiringFixture.tab.generationDraft.sampling.sampler = value
    }, sampler)
    await expect(generate).toBeDisabled()
    await expect(
      page.getByText(/Regional img2img requires Euler or Euler a with Normal/),
    ).toBeVisible()
  }
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.tab.generationDraft.sampling.sampler = 'Euler'
    fixture.tab.generationDraft.cfgRescale = 0.7
  })
  await expect(generate).toBeDisabled()
  await expect(
    page.getByText(/Checking image engine support for CFG Rescale with opaque regional img2img/),
  ).toBeVisible()
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.tab.generationDraft.cfgRescale = 0
    fixture.tab.generationDraft.vaePrecision = 'FP32'
  })
  await expect(generate).toBeDisabled()
  await expect(
    page.getByText(
      /Checking image engine support for selected VAE and precision with opaque regional img2img/,
    ),
  ).toBeVisible()
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.tab.generationDraft.vaePrecision = 'FP16'
    fixture.targetMode = 'outpaint'
    fixture.tab.primaryBbox.x += 8
  })
  await expect(page.getByText(/outpaint with Regional Guidance/)).toBeVisible()
  await expect(generate).toBeDisabled()
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.targetMode = null
    fixture.tab.primaryBbox.x += 8
  })
  await expect(
    page.getByLabel('Generation actions').getByText('Fixture target is unavailable.'),
  ).toBeVisible()
  await expect(generate).toBeDisabled()
  expect(await page.evaluate(() => globalThis.window.regionalWiringFixture.generateCalls)).toEqual([
    1,
  ])
  expect(pageErrors).toEqual([])
})

test('renderer regional img2img waits for actual target inspection before enabling Generate', async ({
  page,
}) => {
  await mountWiring(page, 'project')
  const generate = page.getByRole('button', { exact: true, name: 'Generate' })
  await expect(generate).toBeEnabled()
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.holdTarget = true
    fixture.targetMode = 'img2img'
    fixture.state.regionalImg2ImgSupported = true
    fixture.tab.generationDraft.sampling.denoisingStrength = 0.5
    fixture.tab.primaryBbox.x += 8
  })
  await expect
    .poll(() => page.evaluate(() => globalThis.window.regionalWiringFixture.releaseTarget !== null))
    .toBe(true)
  await expect(generate).toBeDisabled()
  await expect(
    page.getByText('Checking Current Canvas pixels for Regional Guidance…'),
  ).toBeVisible()
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.holdTarget = false
    fixture.releaseTarget!()
    fixture.releaseTarget = null
  })
  await expect(page.getByRole('textbox', { exact: true, name: 'Denoising Strength' })).toBeEnabled()
  await expect(generate).toBeEnabled()
  expect(await page.evaluate(() => globalThis.window.regionalWiringFixture.generateCalls)).toEqual(
    [],
  )
})

test('renderer TXT regional options remain independent of opaque image capability', async ({
  page,
}) => {
  await mountWiring(page, 'project')
  const generate = page.getByRole('button', { exact: true, name: 'Generate' })
  await expect(generate).toBeEnabled()
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.state.regionalImg2ImgSupported = false
    fixture.state.regionalInvokeInitializationSupported = true
    fixture.state.regionalDpmSupported = true
    fixture.state.regionalVaeSupported = true
    fixture.state.regionalCfgRescaleSupported = true
    fixture.tab.generationDraft.cfgRescale = 0.7
    fixture.tab.generationDraft.vaePrecision = 'FP32'
    fixture.tab.generationDraft.sampling.sampler = 'Euler a'
  })
  await expect(generate).toBeEnabled()
  await page.evaluate(() => {
    const sampling = globalThis.window.regionalWiringFixture.tab.generationDraft.sampling
    sampling.sampler = 'DPM++ 2M'
    sampling.scheduler = 'Karras'
  })
  await expect(generate).toBeEnabled()
  await generate.click()
  expect(await page.evaluate(() => globalThis.window.regionalWiringFixture.generateCalls)).toEqual([
    1,
  ])
})

test('renderer frozen IMG Retry requires image capability despite current TXT authoring', async ({
  page,
}) => {
  await mountWiring(page, 'queue')
  const retry = page.getByRole('button', { exact: true, name: 'Retry job' })
  await expect(retry).toBeEnabled()
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.queueItem.operation = 'illustrious-regional-img2img'
    fixture.queueItem.details!.sampling.denoisingStrength = 0.5
    fixture.tab.regionalGuidance = []
    fixture.tab.generationDraft.sampling.denoisingStrength = null
    fixture.epoch += 1
  })
  await expect(retry).toBeDisabled()
  await expect(
    page
      .getByTestId('queue-job-row')
      .getByText(/does not support opaque img2img with Regional Guidance/),
  ).toBeVisible()
  await page.evaluate(() => {
    globalThis.window.regionalWiringFixture.state.regionalImg2ImgSupported = true
  })
  await expect(retry).toBeEnabled()
  await retry.click()
  expect(await page.evaluate(() => globalThis.window.regionalWiringFixture.retryCalls)).toEqual([
    await page.evaluate(() => ({
      id: globalThis.window.regionalWiringFixture.queueItem.id,
      statusSequence: 3,
    })),
  ])
})

test('renderer opaque IMG DPM++ 2M requires the combination capability and keeps CFG Rescale separate', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (cause) => errors.push(cause.message))
  await mountWiring(page, 'project')
  const generate = page.getByRole('button', { exact: true, name: 'Generate' })
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.targetMode = 'img2img'
    fixture.tab.primaryBbox.x += 8
    fixture.tab.generationDraft.sampling.sampler = 'DPM++ 2M'
    fixture.tab.generationDraft.sampling.scheduler = 'Karras'
    fixture.tab.generationDraft.sampling.denoisingStrength = 0.5
    fixture.state.regionalImg2ImgSupported = true
    fixture.state.regionalInvokeInitializationSupported = false
    fixture.state.regionalDpmSupported = false
  })
  await expect(generate).toBeDisabled()
  await expect(
    page.getByText(/Checking image engine support for DPM\+\+ 2M with opaque regional img2img/),
  ).toBeVisible()
  await page.evaluate(() => {
    globalThis.window.regionalWiringFixture.state.regionalImg2ImgDpmpp2mSupported = false
  })
  await expect(generate).toBeDisabled()
  await expect(
    page.getByText(
      'The current image engine does not support DPM++ 2M with opaque regional img2img. Repair or update the runtime.',
    ),
  ).toBeVisible()
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.state.regionalImg2ImgDpmpp2mSupported = true
  })
  await expect(generate).toBeEnabled()
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.tab.generationDraft.cfgRescale = 0.7
    fixture.state.regionalCfgRescaleSupported = true
    fixture.state.regionalImg2ImgCfgRescaleSupported = false
  })
  await expect(generate).toBeDisabled()
  await expect(
    page.getByText(/does not support CFG Rescale with opaque regional img2img/),
  ).toBeVisible()
  await page.evaluate(() => {
    globalThis.window.regionalWiringFixture.state.regionalImg2ImgCfgRescaleSupported = true
  })
  await expect(generate).toBeEnabled()
  expect(
    await page.evaluate(
      () => globalThis.window.regionalWiringFixture.tab.generationDraft.sampling.sampler,
    ),
  ).toBe('DPM++ 2M')
  await page.screenshot({ path: testInfo.outputPath('opaque-img-dpmpp-2m-enabled.png') })
  await generate.click()
  expect(await page.evaluate(() => globalThis.window.regionalWiringFixture.generateCalls)).toEqual([
    1,
  ])
  expect(errors).toEqual([])
})

test('renderer frozen IMG DPM++ 2M Retry follows frozen sampler rather than saved Euler draft', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (cause) => errors.push(cause.message))
  await mountWiring(page, 'queue')
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.queueItem.operation = 'illustrious-regional-img2img'
    fixture.queueItem.details!.sampling.sampler = 'DPM++ 2M'
    fixture.queueItem.details!.sampling.denoisingStrength = 0.5
    fixture.state.regionalImg2ImgSupported = true
    fixture.state.regionalInvokeInitializationSupported = false
    fixture.state.regionalDpmSupported = false
    fixture.state.regionalImg2ImgDpmpp2mSupported = false
    fixture.tab.regionalGuidance = []
    fixture.tab.generationDraft.sampling.sampler = 'Euler'
    fixture.tab.generationDraft.model!.baseModelFamily = 'anima'
    fixture.epoch += 1
  })
  const retry = page.getByRole('button', { exact: true, name: 'Retry job' })
  await expect(retry).toBeDisabled()
  await page.evaluate(() => {
    globalThis.window.regionalWiringFixture.state.regionalImg2ImgDpmpp2mSupported = true
  })
  await expect(retry).toBeEnabled()
  await retry.click()
  expect(await page.evaluate(() => globalThis.window.regionalWiringFixture.retryCalls)).toEqual([
    await page.evaluate(() => ({
      id: globalThis.window.regionalWiringFixture.queueItem.id,
      statusSequence: 3,
    })),
  ])
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.queueItem.details!.sampling.sampler = 'Euler'
    delete fixture.state.regionalImg2ImgDpmpp2mSupported
    fixture.epoch += 1
  })
  await expect(retry).toBeEnabled()
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.queueItem.operation = 'illustrious-regional-txt2img'
    fixture.queueItem.details!.sampling.sampler = 'DPM++ 2M'
    fixture.state.regionalDpmSupported = true
    fixture.state.regionalInvokeInitializationSupported = true
    fixture.epoch += 1
  })
  await expect(retry).toBeEnabled()
  expect(errors).toEqual([])
})

test('renderer opaque IMG selected VAE and FP32 require the separate encoder/decode capability', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (cause) => errors.push(cause.message))
  await mountWiring(page, 'project')
  const generate = page.getByRole('button', { exact: true, name: 'Generate' })
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.targetMode = 'img2img'
    fixture.tab.primaryBbox.x += 8
    fixture.tab.generationDraft.sampling.denoisingStrength = 0.5
    const model = fixture.tab.generationDraft.model!
    const localModelId = crypto.randomUUID()
    const localVersionId = crypto.randomUUID()
    const catalogModel = fixture.catalog[0]!
    const catalogVersion = catalogModel.versions[0]!
    fixture.catalog.push({
      ...catalogModel,
      defaultVersionId: localVersionId,
      id: localModelId,
      modelId: 77,
      name: 'Fixture VAE',
      resourceType: 'vae',
      versions: [
        {
          ...catalogVersion,
          civitaiFileId: 79,
          civitaiVersionId: 78,
          fileName: 'fixture-vae.safetensors',
          id: localVersionId,
          name: 'Fixture VAE version',
          predictionType: null,
          sha256: 'c'.repeat(64),
        },
      ],
    })
    fixture.tab.generationDraft.vae = {
      ...model,
      civitaiFileId: 79,
      civitaiModelId: 77,
      civitaiVersionId: 78,
      displayName: 'Fixture VAE',
      fileSha256: 'c'.repeat(64),
      kind: 'vae',
      localModelId,
      localVersionId,
      predictionType: null,
      versionName: 'Fixture VAE version',
    }
    fixture.tab.generationDraft.vaePrecision = 'FP32'
    fixture.state.regionalImg2ImgSupported = true
    fixture.state.regionalVaeSupported = true
  })
  await expect(generate).toBeDisabled()
  await expect(
    page.getByText(
      /Checking image engine support for selected VAE and precision with opaque regional img2img/,
    ),
  ).toBeVisible()
  await page.evaluate(() => {
    globalThis.window.regionalWiringFixture.state.regionalImg2ImgVaeSupported = false
  })
  await expect(generate).toBeDisabled()
  await expect(
    page.getByText(
      'The current image engine does not support selected VAE and precision with opaque regional img2img. Repair or update the runtime.',
    ),
  ).toBeVisible()
  await page.evaluate(() => {
    globalThis.window.regionalWiringFixture.state.regionalImg2ImgVaeSupported = true
  })
  await expect(generate).toBeEnabled()
  await generate.click()
  expect(await page.evaluate(() => globalThis.window.regionalWiringFixture.generateCalls)).toEqual([
    1,
  ])
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.tab.generationDraft.vae = null
    fixture.tab.generationDraft.vaePrecision = 'FP16'
    fixture.state.regionalImg2ImgVaeSupported = false
    fixture.state.regionalVaeSupported = false
  })
  await expect(generate).toBeEnabled()
  expect(errors).toEqual([])
})

test('renderer frozen selected IMG VAE Retry ignores the saved Embedded FP16 TXT draft', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (cause) => errors.push(cause.message))
  await mountWiring(page, 'queue')
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.queueItem.operation = 'illustrious-regional-img2img'
    fixture.queueItem.details!.sampling.denoisingStrength = 0.5
    fixture.queueItem.details!.requiresRegionalVae = true
    fixture.state.regionalImg2ImgSupported = true
    fixture.state.regionalVaeSupported = true
    fixture.state.regionalImg2ImgVaeSupported = false
    fixture.tab.regionalGuidance = []
    fixture.tab.generationDraft.vae = null
    fixture.tab.generationDraft.vaePrecision = 'FP16'
    fixture.tab.generationDraft.sampling.denoisingStrength = null
    fixture.epoch += 1
  })
  const retry = page.getByRole('button', { exact: true, name: 'Retry job' })
  await expect(retry).toBeDisabled()
  await expect(
    page
      .getByTestId('queue-job-row')
      .getByText(/selected VAE and precision with opaque regional img2img/),
  ).toBeVisible()
  await page.evaluate(() => {
    globalThis.window.regionalWiringFixture.state.regionalImg2ImgVaeSupported = true
  })
  await expect(retry).toBeEnabled()
  await retry.click()
  expect(await page.evaluate(() => globalThis.window.regionalWiringFixture.retryCalls)).toEqual([
    await page.evaluate(() => ({
      id: globalThis.window.regionalWiringFixture.queueItem.id,
      statusSequence: 3,
    })),
  ])
  await page.evaluate(() => {
    const fixture = globalThis.window.regionalWiringFixture
    fixture.queueItem.operation = 'illustrious-regional-txt2img'
    fixture.state.regionalImg2ImgVaeSupported = false
    fixture.epoch += 1
  })
  await expect(retry).toBeEnabled()
  expect(errors).toEqual([])
})

for (const mode of ['txt2img', 'img2img', 'outpaint'] as const) {
  test(`renderer Anima regional ${mode} forwards authored batch count and global dynamic text with existing overflow refusal`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (cause) => errors.push(cause.message))
    await mountWiring(page, 'project')
    await page.evaluate((targetMode) => {
      const fixture = globalThis.window.regionalWiringFixture
      const draft = fixture.tab.generationDraft
      draft.model!.baseModelFamily = 'anima'
      draft.model!.predictionType = null
      fixture.catalog[0]!.versions[0]!.baseModelFamily = 'anima'
      fixture.catalog[0]!.versions[0]!.predictionType = null
      draft.sampling.animaMethod = 'heun'
      draft.sampling.denoisingStrength = 0.5
      draft.vaePrecision = 'Auto'
      draft.positivePrompt.text = '{white cat|black cat}'
      draft.negativePrompt.text = 'blur'
      draft.dynamicPrompt = { maxPrompts: 2, seedBehavior: 'per-prompt' }
      fixture.tab.primaryBbox.width = 256
      fixture.tab.primaryBbox.height = 256
      fixture.tab.regionalGuidance![0]!.prompts = {
        negative: { embeddingRefs: [], text: '' },
        positive: { embeddingRefs: [], text: '(red scarf)1.5' },
        useGlobalNegativePrompt: false,
      }
      fixture.state.animaRegionalSupported = true
      fixture.state.animaRegionalSamplingSupported = true
      fixture.state.animaRegionalImg2ImgSupported = true
      fixture.state.animaRegionalOutpaintSupported = true
      fixture.state.animaOutpaintSupported = true
      fixture.targetMode = targetMode
      fixture.epoch += 1
    }, mode)
    const count = page.locator('input[aria-label="Images per click"]')
    const generate = page.getByRole('button', { exact: true, name: 'Generate' })
    await count.fill('2')
    await count.press('Tab')
    await expect(generate).toBeEnabled()
    await generate.click()
    expect(
      await page.evaluate(() => globalThis.window.regionalWiringFixture.generateCalls),
    ).toEqual([2])
    expect(
      await page.evaluate(
        () => globalThis.window.regionalWiringFixture.tab.generationDraft.positivePrompt.text,
      ),
    ).toBe('{white cat|black cat}')
    await count.fill('17')
    await count.press('Tab')
    await expect(generate).toBeDisabled()
    await expect(
      page
        .getByLabel('Generation actions')
        .getByText('The planned jobs exceed the supplied batch admission limit.'),
    ).toBeVisible()
    await count.fill('1')
    await count.press('Tab')
    await expect(generate).toBeEnabled()
    expect(errors).toEqual([])
  })
}
