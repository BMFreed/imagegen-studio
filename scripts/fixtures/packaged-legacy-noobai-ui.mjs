import assert from 'node:assert/strict'

import { expect } from '@playwright/test'

const queueCounts = { pending: 0, running: 0, completed: 1228, failed: 2, canceled: 99 }
const queueTotal = 1329
const queuePages = 27
const pageSize = 50
const frozenSampling = {
  seed: 0,
  steps: 3,
  sampler: 'Euler a',
  scheduler: 'Normal',
  predictionType: 'v_prediction',
}

// Playwright failures can embed the accessibility tree, including archived prompts.
async function inspectPublicScreen(name, inspect) {
  try {
    return await inspect()
  } catch {
    throw new Error(`The packaged legacy fixture did not verify ${name}.`)
  }
}

export async function inspectLegacyQueue(page, pins) {
  assert.notEqual(pins.canceled, pins.completed)
  const selected = new Map()
  const seen = new Set()
  const pages = []
  let cursor = null
  for (let index = 0; index < queuePages; index++) {
    const observed = await page.evaluate(
      async ({ cursor, ids }) => {
        const response = await window.api.projects.getGenerationQueue(cursor)
        if (!response.ok) return { error: response.error.code }
        const { counts, items, nextCursor } = response.value
        return {
          counts,
          ids: items.map(({ id }) => id),
          selected: items
            .filter(({ id }) => ids.includes(id))
            .map(({ id, status, statusSequence, operation, documentId, projectKey, details }) => ({
              id,
              status,
              statusSequence,
              operation,
              documentId,
              projectKey,
              modelName: details?.modelName,
              modelVersion: details?.modelVersion,
              sampling: details && {
                seed: details.sampling.seed,
                steps: details.sampling.steps,
                sampler: details.sampling.sampler,
                scheduler: details.sampling.scheduler,
                predictionType: details.sampling.predictionType,
              },
            })),
          nextCursor,
        }
      },
      { cursor, ids: [pins.canceled, pins.completed] },
    )
    assert.equal(observed.error, undefined, 'Packaged queue IPC')
    assert.deepEqual(observed.counts, queueCounts)
    const remaining = queueTotal - seen.size
    assert.equal(observed.ids.length, Math.min(pageSize, remaining))
    for (const id of observed.ids) {
      assert.ok(!seen.has(id), 'Queue cursors must not repeat a job')
      seen.add(id)
    }
    for (const item of observed.selected) selected.set(item.id, { item, page: index })
    pages.push(observed.ids)
    cursor = observed.nextCursor
    assert.equal(Boolean(cursor), seen.size < queueTotal)
    if (cursor) assert.equal(cursor.id, observed.ids.at(-1))
  }
  assert.equal(seen.size, queueTotal)
  assert.deepEqual(pages.flat(), pins.queueOrder, 'Packaged queue matches the retained DB17 order')
  const jobs = []
  for (const [status, sequence] of [
    ['canceled', 4],
    ['completed', 2],
  ]) {
    const result = selected.get(pins[status])
    assert.ok(result, `Missing historical ${status} job`)
    const { item } = result
    assert.equal(item.status, status)
    assert.equal(item.statusSequence, sequence)
    assert.equal(item.operation, 'illustrious-img2img')
    assert.equal(item.projectKey, pins.projectKey)
    assert.equal(item.documentId, pins.documentId)
    assert.deepEqual(item.sampling, frozenSampling)
    assert.ok(item.modelName && item.modelVersion)
    jobs.push(item)
  }
  const visibleThrough = Math.max(...Array.from(selected.values(), ({ page }) => page))
  const manager = page.getByRole('dialog', { name: 'Queue Manager', exact: true })
  await inspectPublicScreen('queue pagination', async () => {
    await page.getByRole('button', { name: 'Open Queue Manager', exact: true }).click()
    const rows = manager.getByTestId('queue-job-row')
    let expectedIds = []
    for (let index = 0; index <= visibleThrough; index++) {
      if (index > 0)
        await manager.getByRole('button', { name: 'Load older jobs', exact: true }).click()
      expectedIds = expectedIds.concat(pages[index])
      await expect
        .poll(() => rows.evaluateAll((entries) => entries.map((entry) => entry.dataset.jobId)))
        .toEqual(expectedIds)
    }
  })
  for (const job of jobs) {
    const row = manager
      .getByTestId('queue-job-row')
      .and(manager.locator(`[data-job-id="${job.id}"]`))
    await inspectPublicScreen(`the ${job.status} queue row`, async () => {
      await expect(row).toHaveAttribute('data-status', job.status)
      await row.getByRole('button', { name: 'Show job details', exact: true }).click()
    })
    const details = manager.getByTestId('queue-job-details')
    await inspectPublicScreen(`the ${job.status} job's frozen model`, async () => {
      const model = details.locator('section').filter({
        has: page.getByRole('heading', { name: 'Frozen model', exact: true }),
      })
      await expect(model.getByText(job.modelName, { exact: true })).toBeVisible()
      await expect(model.getByText(job.modelVersion, { exact: true })).toBeVisible()
    })
    for (const [label, value] of [
      ['Seed', '0'],
      ['Steps', '3'],
      ['Sampler', 'Euler a'],
      ['Scheduler', 'Normal'],
      ['Prediction', 'v_prediction'],
    ]) {
      await inspectPublicScreen(`the ${job.status} job's frozen ${label}`, async () => {
        const row = details
          .locator('.settings-grid > div')
          .filter({ has: page.getByText(label, { exact: true }) })
        await expect(row.locator('dd')).toHaveText(value)
      })
    }
  }
  await inspectPublicScreen('closing Queue Manager', async () => {
    await manager.getByRole('button', { name: 'Close Queue Manager', exact: true }).click()
    await expect(manager).toBeHidden()
  })
  return {
    counts: queueCounts,
    pages: pages.length,
    total: seen.size,
    visiblePages: visibleThrough + 1,
    jobs,
  }
}

export async function inspectLegacyAccepted(page, pins) {
  const historyPage = await page.evaluate(async () => {
    const response = await window.api.projects.getAcceptedResultHistory(null)
    return response.ok ? response.value : { error: response.error.code }
  })
  assert.equal(historyPage.error, undefined, 'Packaged saved generations IPC')
  assert.equal(historyPage.totalCount, 1, 'Only the restored Project is eligible to open')
  assert.equal(historyPage.nextCursor, null)
  assert.equal(historyPage.items.length, 1)
  const [result] = historyPage.items
  assert.equal(result.projectKey, pins.projectKey)
  assert.equal(result.layerId, pins.layerId)
  assert.equal(result.documentId, pins.documentId)
  assert.equal(result.documentRevision, pins.documentRevision)
  assert.equal(result.assetSha256, pins.assetSha256)
  assert.equal(result.modelFileSha256, pins.fileSha256)
  assert.equal(result.seed, 0)
  assert.ok(result.imageUrl, 'The saved result must have an image URL')
  const reviewed = await page.evaluate(
    async (reference) => {
      const original = await window.api.projects.reviewAcceptedResult(reference)
      const changed = await window.api.projects.reviewAcceptedResult({
        ...reference,
        assetSha256: '0'.repeat(64),
      })
      return { original, changed }
    },
    {
      projectKey: pins.projectKey,
      documentId: pins.documentId,
      documentRevision: pins.documentRevision,
      layerId: pins.layerId,
      assetSha256: pins.assetSha256,
    },
  )
  assert.deepEqual(reviewed, {
    original: { ok: true, value: true },
    changed: { ok: true, value: false },
  })
  const history = page.getByRole('dialog', { name: 'Saved generations', exact: true })
  const row = history.locator(
    `article[data-project-key="${pins.projectKey}"][data-layer-id="${pins.layerId}"]`,
  )
  await inspectPublicScreen('the exact Saved generations card', async () => {
    await page.getByRole('button', { name: 'Open saved generations', exact: true }).click()
    await expect(row).toBeVisible({ timeout: 15_000 })
    await expect(row.getByText('Seed 0', { exact: true })).toBeVisible()
    await expect(
      row.getByText(`${result.modelName} · ${result.modelVersionName}`, { exact: true }),
    ).toBeVisible()
  })
  await inspectPublicScreen('the saved Raster thumbnail', async () => {
    const thumbnail = row.locator('img')
    await thumbnail.scrollIntoViewIfNeeded()
    await expect(thumbnail).toHaveAttribute('src', result.imageUrl)
    await expect
      .poll(() => thumbnail.evaluate((image) => image.complete && image.naturalWidth > 0))
      .toBe(true)
  })
  await inspectPublicScreen('the Saved generations navigation to Project', async () => {
    await row.getByRole('button').click()
    await expect(history).toBeHidden()
    await expect(page.getByRole('tab', { name: result.projectName, exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })
  await inspectPublicScreen('the accepted Raster selection in the opened Project', async () => {
    const selected = page.locator(`[data-layer-id="${pins.layerId}"] .entity-surface--selected`)
    await expect(selected).toBeVisible()
  })
  const opened = await page.evaluate(async ({ projectKey, layerId }) => {
    const response = await window.api.projects.open(projectKey)
    if (!response.ok) return { error: response.error.code }
    if (response.value.kind !== 'opened') return { kind: response.value.kind }
    const { tab } = response.value
    const visible = tab.layers.find(({ id }) => id === layerId)
    const listed = tab.acceptedResults.find((entry) => entry.layerId === layerId)
    return {
      kind: response.value.kind,
      id: tab.id,
      documentId: tab.documentId,
      documentRevision: tab.documentRevision,
      dirty: tab.dirty,
      comparisonSource: visible?.resultComparisonSourceKind,
      sameImageUrl: Boolean(visible && listed && visible.imageUrl === listed.imageUrl),
      listedSeed: listed?.seed,
      listedCheckpoint: listed?.modelFileSha256,
    }
  }, pins)
  assert.deepEqual(opened, {
    kind: 'opened',
    id: pins.projectKey,
    documentId: pins.documentId,
    documentRevision: pins.documentRevision,
    dirty: false,
    comparisonSource: 'raster',
    sameImageUrl: true,
    listedSeed: 0,
    listedCheckpoint: pins.fileSha256,
  })
  const data = await page.evaluate(async ({ projectKey, documentId, layerId }) => {
    const response = await window.api.projects.getRasterGenerationData(
      projectKey,
      documentId,
      layerId,
    )
    if (!response.ok) return { error: response.error.code }
    const configuration = response.value.generationConfiguration
    if (!configuration) return null
    const { model, sampling } = configuration
    return {
      documentId: response.value.documentId,
      layerId: response.value.layerId,
      currentMode: response.value.currentMode,
      model: {
        civitaiModelId: model.civitaiModelId,
        civitaiVersionId: model.civitaiVersionId,
        civitaiFileId: model.civitaiFileId,
        fileSha256: model.fileSha256,
        predictionType: model.predictionType,
      },
      sampling: {
        seed: sampling.actualSeed,
        steps: sampling.steps,
        sampler: sampling.sampler,
        scheduler: sampling.scheduler,
        predictionType: model.predictionType,
      },
      noiseProfileOmitted: !Object.hasOwn(sampling, 'noiseProfile'),
    }
  }, pins)
  assert.deepEqual(data, {
    documentId: pins.documentId,
    layerId: pins.layerId,
    currentMode: null,
    model: {
      civitaiModelId: 1147756,
      civitaiVersionId: 2679856,
      civitaiFileId: 2566634,
      fileSha256: pins.fileSha256,
      predictionType: 'v_prediction',
    },
    sampling: frozenSampling,
    noiseProfileOmitted: true,
  })
  await inspectPublicScreen('the accepted Raster comparison', async () => {
    await page
      .getByRole('button', { name: `Layer actions for ${result.layerName}`, exact: true })
      .click()
    await page.getByRole('menuitem', { name: 'Compare generation settings', exact: true }).click()
    const comparison = page.getByRole('dialog', {
      name: 'Compare generation settings',
      exact: true,
    })
    await expect(comparison.locator('.comparison-scroll')).toHaveAttribute('aria-busy', 'false')
    await comparison.getByRole('checkbox', { name: 'Show unchanged settings', exact: true }).check()
    const expectedSettings = {
      'model.predictionType': 'v_prediction',
      'sampling.sampler': 'Euler a',
      'sampling.scheduler': 'Normal',
      'guidance.steps': '3',
      'seed.actual': '0',
      'noiseProfile.baseSchedule': 'Unavailable in saved generation data',
      'noiseProfile.rescaleBetasZeroSnr': 'Unavailable in saved generation data',
      'noiseProfile.timestepSpacing': 'Unavailable in saved generation data',
    }
    for (const [key, value] of Object.entries(expectedSettings)) {
      await expect(
        comparison.locator(`[data-setting="${key}"] .comparison-values > div:first-child > p`),
      ).toHaveText(value)
    }
    await comparison
      .getByRole('button', { name: 'Close generation settings comparison', exact: true })
      .click()
    await expect(comparison).toBeHidden()
  })
  return {
    ...data,
    projectKey: pins.projectKey,
    assetSha256: result.assetSha256,
    staleAssetRejected: true,
    thumbnailLoaded: true,
  }
}
