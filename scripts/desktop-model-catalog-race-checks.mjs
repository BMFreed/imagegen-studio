/**
 * Native Model Manager read ordering. The real built renderer/preload/Main/SQLite stay intact. The
 * IPC collaborator delays an unchanged real result; a transport-failure control sends an invalid
 * argument to the original Main validator. The event control re-delivers a genuine Main DTO after
 * preparing its rows through real ModelRepository. Catalog-only bytes do not qualify inference,
 * CivitAI download or release installation.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { expect } from '@playwright/test'

import { openAppDatabase } from '../src/main/db/database.ts'
import { ModelRepository } from '../src/main/models/model-repository.ts'

export async function checkModelCatalogRace({
  application,
  checkpointVersions: fixture,
  packagePath,
  projectId,
  projectTitle,
  window,
}) {
  const artifacts = path.resolve(
    process.env.IMAGEGEN_MODEL_CATALOG_ARTIFACTS ??
      mkdtempSync(path.join(os.tmpdir(), 'igs-model-catalog-evidence-')),
  )
  mkdirSync(artifacts, { recursive: true, mode: 0o700 })
  const hashFiles = (files) =>
    Object.fromEntries(
      files.map((file) => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]),
    )
  const report = {
    checks: [],
    events: [],
    gates: [],
    pageErrors: [],
    screenshots: [],
    sourceSha256: hashFiles([
      'scripts/desktop-model-catalog-race-checks.mjs',
      'scripts/smoke-desktop.mjs',
      'src/renderer/components/ModelManager.vue',
      'src/renderer/components/model-manager-read-guard.ts',
      'src/renderer/components/model-manager-job-snapshot.ts',
      'package.json',
    ]),
    bundleSha256: hashFiles([
      'dist/main/main.cjs',
      'dist/preload/preload.cjs',
      'dist/renderer/index.html',
      ...readdirSync('dist/renderer/assets')
        .filter((name) => /\.(?:js|css)$/.test(name))
        .map((name) => `dist/renderer/assets/${name}`),
    ]),
    boundary: {
      actual:
        'Built Electron Model Manager lifecycle/read consumers, preload validation, original Main handlers, SQLite catalog/default mutation through UI, Project readback and real .igs bytes.',
      collaborator:
        'Main IPC timing gate snapshots the original real response and holds delivery. Error control adds one invalid argument to the original validator. Two job rows are prepared/updated through real ModelRepository and a genuine Main job DTO is re-delivered through the real install-changed preload event. No renderer/API replacement, synthetic catalog, inference, trained weights or GPU execution.',
      acknowledgement:
        'Original handler awaited, held response explicitly released and wrapper returned; then a subsequent real renderer/preload/Main read crosses the same WebContents IPC stream and two animation-frame checkpoints settle Vue work. This is a renderer transport barrier, not an invented ignored-result DOM event.',
    },
    readScopes: [
      { channel: 'models:get-catalog', success: 'real Default snapshot', staleError: true },
      {
        channel: 'models:get-install-jobs',
        success: 'real two-row snapshot plus later genuine Main job event',
        staleError: true,
      },
      {
        channel: 'models:get-storage-summary',
        success: 'real managed-file byte count',
        staleError: true,
      },
      {
        channel: 'models:get-token-status',
        success: 'actual local secure-storage status',
        staleError: true,
      },
    ],
    limits:
      'Install-changed projection/list interleaving is qualified using re-delivery of a genuine Main DTO; actual installer/coordinator emission, download/cancel and token save/remove mutation ordering are not qualified. No connected-token fixture is created.',
  }
  const errors = []
  const onPageError = (error) => report.pageErrors.push(String(error))
  window.on('pageerror', onPageError)
  const region = window.getByRole('region', { name: `Project ${projectTitle}`, exact: true })
  const opener = region.getByRole('button', { name: 'Manage Models', exact: true })
  const manager = window.getByRole('dialog', { name: 'Model Manager', exact: true })
  const loading = manager.getByText('Loading models…', { exact: true })
  const details = manager.getByRole('complementary', { name: 'Model details', exact: true })
  const resourceName = 'Illustrious Smoke Checkpoint'
  const firstFileBytes = readFileSync(fixture.firstPath)
  let installedProbe = false

  async function currentTab() {
    const result = await window.evaluate((id) => window.api.projects.open(id), projectId)
    assert.equal(result.ok, true, JSON.stringify(result))
    assert.equal(result.value.kind, 'opened')
    return result.value.tab
  }
  async function operationalSeed() {
    const result = await window.evaluate(
      (id) => window.api.projects.listGenerationResults(id),
      projectId,
    )
    assert.equal(result.ok, true, JSON.stringify(result))
    return result.value.lastActualSeed
  }
  const projectState = (tab) => ({
    canUndo: tab.canUndo,
    canRedo: tab.canRedo,
    dirty: tab.dirty,
    documentId: tab.documentId,
    generationDraft: tab.generationDraft,
    lastActualSeedSnapshot: tab.lastActualSeedSnapshot,
    layers: tab.layers,
    primaryBbox: tab.primaryBbox,
  })
  const before = projectState(await currentTab())
  const seedBefore = await operationalSeed()
  const packageBytes = readFileSync(packagePath)

  async function screenshot(name) {
    const file = path.join(artifacts, `${name}.png`)
    await window.mouse.move(1, 1)
    await window.screenshot({ animations: 'disabled', path: file })
    report.screenshots.push(file)
  }
  async function check(name, run) {
    try {
      await run()
      report.checks.push({ name, status: 'passed' })
      console.log(`PASS model catalog ordering: ${name}`)
    } catch (error) {
      report.checks.push({ name, status: 'failed', error: String(error) })
      errors.push(error)
      await screenshot(`failed-${report.checks.length}`)
    }
  }
  async function installProbe() {
    await application.evaluate(({ ipcMain }) => {
      const channels = [
        'models:get-catalog',
        'models:get-install-jobs',
        'models:get-storage-summary',
        'models:get-token-status',
      ]
      const originals = Object.fromEntries(
        channels.map((channel) => {
          const original = ipcMain._invokeHandlers.get(channel)
          if (typeof original !== 'function')
            throw new Error(`Real model read handler is missing: ${channel}`)
          return [channel, original]
        }),
      )
      const probe = { armed: null, calls: [], gates: {}, originals }
      globalThis.igsModelCatalogReadProbe = probe
      for (const channel of channels) {
        const original = originals[channel]
        ipcMain.removeHandler(channel)
        ipcMain.handle(channel, async (event, ...args) => {
          const armed = probe.armed?.channel === channel ? probe.armed : null
          if (armed) probe.armed = null
          const call = {
            index: probe.calls.length,
            channel,
            started: true,
            gate: armed?.id ?? null,
          }
          probe.calls.push(call)
          if (!armed) {
            const result = await original(event, ...args)
            call.readDone = true
            call.returned = true
            return result
          }
          const gate = { id: armed.id, channel, readDone: false, released: false, returned: false }
          probe.gates[armed.id] = gate
          const result = await original(
            event,
            ...(armed.invalidTransport ? ['native-read-timing-invalid-argument'] : args),
          )
          gate.ok = result.ok
          gate.errorCode = result.ok ? null : result.error.code
          gate.result = result
          gate.readDone = true
          call.readDone = true
          await new Promise((resolve) => {
            gate.release = resolve
          })
          gate.returned = true
          call.returned = true
          return result
        })
      }
    })
    installedProbe = true
  }
  async function arm(id, invalidTransport = false, channel = 'models:get-catalog') {
    await application.evaluate(
      (_electron, armed) => {
        const probe = globalThis.igsModelCatalogReadProbe
        if (probe.armed) throw new Error('Another catalog gate is already armed.')
        probe.armed = armed
      },
      { id, invalidTransport, channel },
    )
  }
  async function gateState(id) {
    return await application.evaluate((_electron, id) => {
      const gate = globalThis.igsModelCatalogReadProbe.gates[id]
      if (!gate) return null
      return {
        id: gate.id,
        channel: gate.channel,
        readDone: gate.readDone,
        released: gate.released,
        returned: gate.returned,
        ok: gate.ok,
        errorCode: gate.errorCode,
        totalBytes: gate.ok ? gate.result.value.totalBytes : null,
        catalogDefault:
          gate.ok && Array.isArray(gate.result.value)
            ? gate.result.value.find((resource) => resource.name === 'Illustrious Smoke Checkpoint')
                ?.defaultVersionId
            : null,
      }
    }, id)
  }
  async function held(id) {
    await expect.poll(async () => (await gateState(id))?.readDone).toBe(true)
    const state = await gateState(id)
    assert.equal(state.released, false)
    assert.equal(state.returned, false)
    return state
  }
  async function rendererBarrier() {
    const result = await window.evaluate(async () => {
      const result = await window.api.models.getCatalog()
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      return result
    })
    assert.equal(result.ok, true, JSON.stringify(result))
    return result.value
  }
  async function release(id) {
    await application.evaluate((_electron, id) => {
      const gate = globalThis.igsModelCatalogReadProbe.gates[id]
      if (!gate?.readDone) throw new Error('Cannot release an unread real catalog result.')
      gate.released = true
      gate.release()
    }, id)
    await expect.poll(async () => (await gateState(id))?.returned).toBe(true)
    await rendererBarrier()
    report.gates.push({ ...(await gateState(id)), rendererTransportBarrier: true })
  }
  async function releaseOutstanding() {
    if (!installedProbe) return
    const ids = await application.evaluate(() => {
      const probe = globalThis.igsModelCatalogReadProbe
      probe.armed = null
      return Object.values(probe.gates)
        .filter((gate) => gate.readDone && !gate.released)
        .map((gate) => gate.id)
    })
    for (const id of ids) await release(id)
  }
  async function close() {
    if (await manager.count()) {
      await manager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
      await expect(manager).toHaveCount(0)
    }
    await rendererBarrier()
  }
  async function open() {
    await opener.click()
    await expect(manager).toBeVisible()
  }
  async function ready() {
    await expect(loading).toHaveCount(0)
    await expect(manager.locator('.resource-row').filter({ hasText: resourceName })).toHaveCount(1)
  }
  async function selectResource() {
    await manager
      .locator('.resource-row')
      .filter({ hasText: resourceName })
      .getByRole('button')
      .click()
    await expect(details.locator('h2')).toHaveText(resourceName)
  }
  function versionRow(version) {
    return details
      .locator('.version-row')
      .filter({ has: window.locator('strong').filter({ hasText: version }) })
  }
  async function chooseDefault(versionId, versionName) {
    const row = versionRow(versionName)
    await row.getByRole('button', { name: 'Set Default', exact: true }).click()
    await expect(row.getByText('Default', { exact: true })).toHaveCount(1)
    await expect
      .poll(async () => {
        const result = await window.evaluate(() => window.api.models.getCatalog())
        assert.equal(result.ok, true)
        return result.value.find((resource) => resource.id === fixture.first.resourceId)
          ?.defaultVersionId
      })
      .toBe(versionId)
  }
  async function reset() {
    await releaseOutstanding()
    await close()
    const result = await window.evaluate(
      ({ resourceId, versionId }) => window.api.models.setDefaultVersion(resourceId, versionId),
      fixture.first,
    )
    assert.equal(result.ok, true, JSON.stringify(result))
    await open()
    await ready()
    await selectResource()
    await expect(versionRow('v901').getByText('Default', { exact: true })).toHaveCount(1)
    await close()
  }
  async function prepareInstallRows() {
    const appDataRoot = path.dirname(path.dirname(fixture.firstPath))
    const database = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
    const repository = new ModelRepository(database.db)
    try {
      const rows = []
      for (const [index, name] of [
        'Read-order changed job',
        'Read-order untouched job',
      ].entries()) {
        const fileId = 102_001 + index
        const id = await repository.createInstallJob({
          artifacts: [
            { expectedSizeBytes: 17, role: 'primary', source: { fileId, kind: 'civitai_file' } },
          ],
          baseModelFamily: 'illustrious',
          civitaiFileId: fileId,
          civitaiModelId: 101_001 + index,
          civitaiVersionId: 103_001 + index,
          displayName: name,
          resourceType: 'checkpoint',
          versionName: 'v-read-order',
        })
        rows.push({ id, name })
      }
      return rows
    } finally {
      await database.close()
    }
  }
  async function failPreparedJob(id) {
    const appDataRoot = path.dirname(path.dirname(fixture.firstPath))
    const database = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
    try {
      await new ModelRepository(database.db).updateInstallJob(id, {
        errorCode: 'MODEL_INSTALL_FAILED',
        errorMessage: 'Native pending-list event fixture.',
        status: 'failed',
      })
    } finally {
      await database.close()
    }
    const result = await window.evaluate(() => window.api.models.getInstallJobs())
    assert.equal(result.ok, true, JSON.stringify(result))
    const genuineJob = result.value.find((job) => job.id === id)
    assert.equal(genuineJob?.status, 'failed')
    return genuineJob
  }

  try {
    await installProbe()
    await reset()
    await check(
      'older closed-session catalog cannot undo a later actual UI Default change',
      async () => {
        await arm('closed-catalog')
        await open()
        assert.equal((await held('closed-catalog')).catalogDefault, fixture.first.versionId)
        await close()
        await open()
        await ready()
        await selectResource()
        await chooseDefault(fixture.second.versionId, 'v902')
        await screenshot('new-current-default-before-old-response')
        await release('closed-catalog')
        await expect(versionRow('v902').getByText('Default', { exact: true })).toHaveCount(1)
        await expect(versionRow('v901').getByText('Default', { exact: true })).toHaveCount(0)
        await screenshot('current-default-after-old-response')
      },
    )
    await reset()
    await check(
      'closed-session real validator error cannot appear in a newer healthy manager',
      async () => {
        await arm('closed-error', true)
        await open()
        const heldError = await held('closed-error')
        assert.equal(heldError.ok, false)
        assert.equal(heldError.errorCode, 'IPC_INVALID_CALLER')
        await close()
        await open()
        await ready()
        await release('closed-error')
        await expect(
          manager.getByText('The model request was rejected.', { exact: true }),
        ).toHaveCount(0)
        await expect(
          manager.locator('.resource-row').filter({ hasText: resourceName }),
        ).toHaveCount(1)
        await screenshot('new-current-manager-after-old-error')
      },
    )
    for (const [kind, channel] of [
      ['jobs', 'models:get-install-jobs'],
      ['storage', 'models:get-storage-summary'],
      ['token', 'models:get-token-status'],
    ]) {
      await reset()
      await check(
        `closed-session ${kind} validator error cannot appear in a newer healthy manager`,
        async () => {
          const id = `closed-${kind}-error`
          await arm(id, true, channel)
          await open()
          const heldError = await held(id)
          assert.equal(heldError.ok, false)
          assert.equal(heldError.errorCode, 'IPC_INVALID_CALLER')
          await close()
          await open()
          await ready()
          await release(id)
          await expect(
            manager.getByText('The model request was rejected.', { exact: true }),
          ).toHaveCount(0)
          await screenshot(`new-current-manager-after-old-${kind}-error`)
        },
      )
    }
    await reset()
    await check(
      'current real validator error remains visible rather than being globally suppressed',
      async () => {
        await arm('current-error', true)
        await open()
        await held('current-error')
        await release('current-error')
        await expect(
          manager.getByText('The model request was rejected.', { exact: true }),
        ).toHaveCount(1)
        await expect(loading).toHaveCount(0)
        await screenshot('current-error-neighboring-control')
      },
    )
    await reset()
    await check(
      'older storage snapshot cannot undo the newer actual managed-file byte count',
      async () => {
        const currentSummary = await window.evaluate(() => window.api.models.getStorageSummary())
        assert.equal(currentSummary.ok, true)
        const initialBytes = currentSummary.value.totalBytes
        const remainingBytes = initialBytes - firstFileBytes.length
        assert.ok(remainingBytes > 0 && initialBytes < 1024)
        try {
          await arm('closed-storage', false, 'models:get-storage-summary')
          await open()
          assert.equal((await held('closed-storage')).totalBytes, initialBytes)
          await close()
          rmSync(fixture.firstPath)
          await open()
          await ready()
          await expect(manager.locator('.storage-summary strong')).toHaveText(`${remainingBytes} B`)
          const actualSummary = await window.evaluate(() => window.api.models.getStorageSummary())
          assert.equal(actualSummary.ok, true)
          assert.equal(actualSummary.value.totalBytes, remainingBytes)
          await release('closed-storage')
          await expect(manager.locator('.storage-summary strong')).toHaveText(`${remainingBytes} B`)
          await screenshot('current-storage-after-old-response')
        } finally {
          writeFileSync(fixture.firstPath, firstFileBytes)
        }
      },
    )
    await reset()
    await check('old loadAll completion cannot hide the newer pending-load indicator', async () => {
      await arm('old-loading')
      await open()
      await held('old-loading')
      await close()
      await arm('current-loading')
      await open()
      await held('current-loading')
      await expect(loading).toHaveCount(1)
      await release('old-loading')
      assert.equal((await gateState('current-loading')).released, false)
      await expect(loading).toHaveCount(1)
      await screenshot('current-load-still-pending-after-old-completion')
    })
    await check(
      'current real catalog success clears its own loading indicator and remains usable',
      async () => {
        await release('current-loading')
        await ready()
        await selectResource()
        await expect(versionRow('v901').getByText('Default', { exact: true })).toHaveCount(1)
        await chooseDefault(fixture.second.versionId, 'v902')
        await chooseDefault(fixture.first.versionId, 'v901')
        await screenshot('current-success-neighboring-control')
      },
    )
    await reset()
    await check(
      'a later genuine install event survives an older list without hiding untouched job rows',
      async () => {
        const [changed, untouched] = await prepareInstallRows()
        await arm('event-jobs-snapshot', false, 'models:get-install-jobs')
        await open()
        await held('event-jobs-snapshot')
        const genuineJob = await failPreparedJob(changed.id)
        await application.evaluate(({ BrowserWindow }, job) => {
          BrowserWindow.getAllWindows()[0].webContents.send('models:install-changed', job)
        }, genuineJob)
        await rendererBarrier()
        report.events.push({
          job: genuineJob,
          genuineMainDto: true,
          delivered: true,
          rendererTransportBarrier: true,
        })
        await release('event-jobs-snapshot')
        await ready()
        await manager.getByRole('button', { name: /^Downloading / }).click()
        await expect(manager.locator('.job-row')).toHaveCount(2)
        const changedRow = manager.locator('.job-row').filter({ hasText: changed.name })
        const untouchedRow = manager.locator('.job-row').filter({ hasText: untouched.name })
        await expect(changedRow.locator('.n-tag')).toHaveText('failed')
        await expect(untouchedRow.locator('.n-tag')).toHaveText('waiting')
        await screenshot('genuine-install-event-preserves-untouched-neighbor')
      },
    )
    await close()
    await check(
      'read races preserve Project draft, history, bbox, seed, tab and saved package',
      async () => {
        assert.deepEqual(projectState(await currentTab()), before)
        assert.equal(await operationalSeed(), seedBefore)
        assert.deepEqual(readFileSync(packagePath), packageBytes)
        await expect(window.getByRole('tab', { name: projectTitle, exact: true })).toHaveAttribute(
          'aria-selected',
          'true',
        )
        await expect(opener).toBeFocused()
        assert.deepEqual(report.pageErrors, [])
      },
    )
    if (errors.length)
      throw new AggregateError(errors, 'Model catalog read ordering contract failed.')
    report.status = 'passed'
  } catch (error) {
    report.status = 'failed'
    report.error = String(error)
    throw error
  } finally {
    writeFileSync(fixture.firstPath, firstFileBytes)
    await releaseOutstanding()
    if (installedProbe) {
      report.ipcCalls = await application.evaluate(({ ipcMain }) => {
        const probe = globalThis.igsModelCatalogReadProbe
        for (const [channel, original] of Object.entries(probe.originals)) {
          ipcMain.removeHandler(channel)
          ipcMain.handle(channel, original)
        }
        delete globalThis.igsModelCatalogReadProbe
        return probe.calls
      })
    }
    window.off('pageerror', onPageError)
    const reportPath = path.join(artifacts, 'report.json')
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`Model catalog ordering evidence: ${reportPath}`)
  }
  return report
}
