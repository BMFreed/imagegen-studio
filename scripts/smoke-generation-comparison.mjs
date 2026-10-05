/** Real saved provenance → compiled Electron layer menu → typed read → read-only comparison. */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { _electron as electron, expect } from '@playwright/test'

import { openAppDatabase } from '../src/main/db/database.ts'
import { ModelRepository } from '../src/main/models/model-repository.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { ProjectSession } from '../src/main/projects/project-session.ts'
import {
  acceptedOutputPngFixture,
  acceptedAnimaProvenanceFixture,
  acceptedRasterProvenanceFixture,
} from '../src/main/projects/test-fixtures/accepted-provenance.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'

const expectRed = process.argv.includes('--expect-red')
const nativeAnima = process.argv.includes('--anima')
assert.ok(process.argv.slice(2).every((arg) => ['--expect-red', '--anima'].includes(arg)))
assert.ok(!(expectRed && nativeAnima))
const artifacts = path.resolve(
  process.env.IMAGEGEN_COMPARISON_ARTIFACTS ??
    mkdtempSync(path.join(os.tmpdir(), 'igs-comparison-evidence-')),
)
mkdirSync(artifacts, { mode: 0o700, recursive: true })
const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'igs-comparison-smoke-'))
const appDataRoot = path.join(fixtureRoot, 'data', 'imagegen-studio')
const projectRoot = path.join(appDataRoot, 'workspaces', 'Uncategorized')
mkdirSync(projectRoot, { recursive: true })
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const sourceFiles = [
  'scripts/smoke-generation-comparison.mjs',
  'scripts/native-smoke-window.mjs',
  'src/main/projects/project-session.ts',
  'src/main/projects/test-fixtures/accepted-provenance.ts',
]
const bundleFiles = [
  'dist/main/main.cjs',
  'dist/preload/preload.cjs',
  'dist/renderer/index.html',
  ...readdirSync('dist/renderer/assets')
    .filter((name) => /\.(?:js|css)$/.test(name))
    .map((name) => `dist/renderer/assets/${name}`),
  ...readdirSync('dist/main/migrations').map((name) => `dist/main/migrations/${name}`),
]
const hashes = (files) =>
  Object.fromEntries(files.map((file) => [file, digest(readFileSync(file))]))
const report = {
  checks: [],
  pageErrors: [],
  screenshots: [],
  mode: expectRed ? 'expect-red' : 'green',
  family: nativeAnima ? 'anima' : 'illustrious',
  sourceSha256: hashes(sourceFiles),
  bundleSha256: hashes(bundleFiles),
  boundary: {
    actual:
      'Real .igs/SQLite/CPU composition, built Electron/main/preload, layer context menu and read-only settings projection.',
    fixtures:
      'Real ProjectSession creates accepted and imported Raster layers. Small opaque ICC PNGs and frozen inference metadata are fixture inputs; repository-installed dummy checkpoint bytes prove catalog identity only, not inference.',
    input: 'Canonical native helper blocks physical typing; CDP drives actual renderer controls.',
  },
}
const environment = {
  ...process.env,
  IMAGEGEN_TEST_IMAGE_WORKER: '1',
  NODE_ENV: 'test',
  XDG_CONFIG_HOME: path.join(fixtureRoot, 'config'),
  XDG_DATA_HOME: path.join(fixtureRoot, 'data'),
}
delete environment.ELECTRON_RUN_AS_NODE
delete environment.IMAGEGEN_DEV_SERVER_URL
let application
let window
let fixture
const dialog = () =>
  window.getByRole('dialog', { name: 'Compare generation settings', exact: true })
const check = (name, evidence = {}) => report.checks.push({ name, ...evidence })
async function screenshot(name) {
  const file = path.join(artifacts, `${name}.png`)
  await window.screenshot({ animations: 'disabled', path: file })
  report.screenshots.push(file)
}
async function prepareFixture() {
  const managedPath = path.join(appDataRoot, 'models', 'comparison-checkpoint.safetensors')
  const modelBytes = Buffer.from('Catalog-only comparison checkpoint fixture; not ML weights.')
  mkdirSync(path.dirname(managedPath), { recursive: true })
  writeFileSync(managedPath, modelBytes, { mode: 0o600 })
  const database = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  let installed
  try {
    const repository = new ModelRepository(database.db)
    installed = await repository.publishVerifiedInstallation({
      dependencies: nativeAnima
        ? ['qwen3_encoder', 'vae'].map((role) => {
            const bytes = Buffer.from(`Catalog-only ${role}; not pinned model weights.`)
            const companionPath = path.join(
              path.dirname(managedPath),
              `comparison-${role}.safetensors`,
            )
            writeFileSync(companionPath, bytes, { mode: 0o600 })
            return {
              role,
              artifact: {
                file: {
                  managedPath: companionPath,
                  originalFilename: path.basename(companionPath),
                  sha256: digest(bytes),
                  sizeBytes: bytes.length,
                  verifiedAt: new Date().toISOString(),
                },
                resource: {
                  creator: 'Native comparison fixture',
                  displayName: `Catalog-only ${role}`,
                  source: { kind: 'supported_dependency', key: `anima/comparison-fixture-${role}` },
                  sourceMetadata: { fixture: true },
                  type: role,
                },
                version: {
                  baseModelFamily: 'anima',
                  format: 'safetensors',
                  name: 'Unqualified fixture',
                  predictionType: null,
                  source: {
                    kind: 'supported_dependency',
                    revision: 'comparison-fixture',
                    expectedSha256: digest(bytes),
                  },
                  sourceMetadata: { fixture: true },
                },
              },
            }
          })
        : [],
      primary: {
        file: {
          managedPath,
          originalFilename: path.basename(managedPath),
          sha256: digest(modelBytes),
          sizeBytes: modelBytes.length,
          verifiedAt: new Date().toISOString(),
        },
        resource: {
          creator: 'Native comparison fixture',
          displayName: 'Comparison checkpoint',
          source: { kind: 'civitai', modelId: 98001 },
          sourceMetadata: { fixture: true },
          type: 'checkpoint',
        },
        version: {
          baseModelFamily: nativeAnima ? 'anima' : 'illustrious',
          format: 'safetensors',
          name: 'Fixture v1',
          predictionType: nativeAnima ? null : 'epsilon',
          source: {
            kind: 'civitai',
            fileId: 98003,
            versionId: 98002,
            expectedSha256: digest(modelBytes),
          },
          sourceMetadata: { fixture: true },
        },
      },
    })
    if (!nativeAnima)
      await repository.setPredictionOverride({
        expectedSha256: digest(modelBytes),
        expectedSizeBytes: modelBytes.length,
        predictionType: 'v_prediction',
        resourceId: installed.resourceId,
        versionId: installed.versionId,
      })
  } finally {
    await database.close()
  }
  const title = nativeAnima ? 'Native Anima settings comparison' : 'Native settings comparison'
  const session = await ProjectSession.create(path.join(projectRoot, `${title}.igs`), title, {
    placeholdersDir: path.resolve('dist/main/placeholders'),
    scratchDir: path.join(fixtureRoot, 'scratch'),
  })
  const dimension = nativeAnima ? 64 : 8
  const original = await acceptedOutputPngFixture(dimension, dimension)
  const current = await acceptedOutputPngFixture(dimension * 2, dimension * 2)
  const bbox = { height: dimension, width: dimension, x: 0, y: 0 }
  const provenance = nativeAnima
    ? acceptedAnimaProvenanceFixture(session.document, original, bbox)
    : acceptedRasterProvenanceFixture(session.document, original, bbox)
  if (nativeAnima) provenance.generationConfiguration.anima.checkpointByteSize = modelBytes.length
  Object.assign(provenance.generationConfiguration.model, {
    civitaiFileId: 98003,
    civitaiModelId: 98001,
    civitaiVersionId: 98002,
    displayName: 'Comparison checkpoint',
    fileSha256: digest(modelBytes),
    localModelId: installed.resourceId,
    localVersionId: installed.versionId,
    versionName: 'Fixture v1',
  })
  provenance.generationConfiguration.sampling.actualSeed = 0
  provenance.generationConfiguration.sampling.requestedSeedPolicy = 'fixed'
  provenance.generationConfiguration.sampling.seedBehavior = 'per-iteration'
  const layer = (name, generated, x) => {
    const id = randomUUID()
    return {
      asset: {
        bytes: current.length,
        height: dimension * 2,
        path: `assets/layers/${id}.png`,
        sha256: digest(current),
        width: dimension * 2,
      },
      blendMode: 'normal',
      ...(generated ? { generationProvenance: provenance } : {}),
      id,
      kind: 'raster',
      locked: generated,
      name,
      opacity: 1,
      transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x, y: 0 },
      visible: true,
    }
  }
  const generated = layer('Accepted lantern', true, 0)
  const imported = layer('Imported reference', false, 32)
  const config = provenance.generationConfiguration
  session.applyDocument({
    ...session.document,
    primaryBbox: bbox,
    lastActualSeedSnapshot: 0,
    generationDraft: {
      ...session.document.generationDraft,
      model: structuredClone(config.model),
      ...(nativeAnima ? { cfgRescale: 0, vaePrecision: 'Auto' } : {}),
      negativePrompt: structuredClone(config.negativePrompt),
      positivePrompt: structuredClone(config.positivePrompt),
      sampling: {
        cfgScale: config.sampling.cfgScale,
        denoisingStrength: null,
        sampler: nativeAnima ? 'DPM++ 2M' : config.sampling.sampler,
        scheduler: nativeAnima ? 'Karras' : config.sampling.scheduler,
        ...(nativeAnima ? { animaMethod: config.sampling.animaMethod } : {}),
        steps: config.sampling.steps,
      },
      seed: { policy: 'fixed', value: 0 },
    },
    layers: [generated, imported],
  })
  await session.save({
    assets: {
      [generated.asset.path]: { bytes: current },
      [imported.asset.path]: { bytes: current },
    },
  })
  const saved = (await readIgsPackage(session.filePath)).project
  assert.equal(saved.layers.length, 2)
  return {
    bytes: readFileSync(session.filePath),
    document: saved,
    generated,
    imported,
    key: session.localRecoveryKey,
    path: session.filePath,
    title,
  }
}
async function opened() {
  const result = await window.evaluate((key) => window.api.projects.open(key), fixture.key)
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(result.value.kind, 'opened')
  return result.value.tab
}
async function readData() {
  return await window.evaluate(
    (value) =>
      window.api.projects.getRasterGenerationData(value.key, value.documentId, value.layerId),
    {
      key: fixture.key,
      documentId: fixture.document.documentId,
      layerId: fixture.generated.id,
    },
  )
}
async function openComparison() {
  await window
    .getByRole('button', { name: `Layer actions for ${fixture.generated.name}`, exact: true })
    .click()
  await window.getByRole('menuitem', { name: 'Compare generation settings', exact: true }).click()
  await expect(dialog()).toBeVisible()
  await expect(dialog().locator('.comparison-scroll')).toHaveAttribute('aria-busy', 'false')
  await expect
    .poll(
      async () =>
        await dialog().evaluate((element) => {
          const box = element.getBoundingClientRect()
          return (
            box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight
          )
        }),
    )
    .toBe(true)
}
function setting(key) {
  return dialog().locator(`[data-setting="${key}"]`)
}
async function preloadProbe() {
  await application.evaluate(({ ipcMain }) => {
    const channel = 'projects:get-raster-generation-data'
    const original = ipcMain._invokeHandlers.get(channel)
    assertOriginal(original)
    function assertOriginal(value) {
      if (typeof value !== 'function') throw new Error('Real comparison handler is missing.')
    }
    globalThis.igsComparisonProbe = { original, mode: null }
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (event, ...args) => {
      const response = await original(event, ...args)
      if (!response.ok) return response
      const changed = structuredClone(response)
      const mode = globalThis.igsComparisonProbe.mode
      if (mode === 'document') changed.value.documentId = '00112233-4455-4677-8899-aabbccddeeff'
      if (mode === 'layer') changed.value.layerId = '00112233-4455-4677-8899-aabbccddeeff'
      if (mode === 'private')
        changed.value.generationConfiguration.model.managedPath = '/private/model'
      return changed
    })
  })
  try {
    for (const mode of ['document', 'layer', 'private']) {
      await application.evaluate((_, value) => {
        globalThis.igsComparisonProbe.mode = value
      }, mode)
      assert.equal(await application.evaluate(() => globalThis.igsComparisonProbe.mode), mode)
      const result = await readData()
      assert.equal(result.ok, false, mode)
      assert.equal(result.error.code, 'IPC_INVALID_RESPONSE', mode)
    }
  } finally {
    await application.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('projects:get-raster-generation-data')
      ipcMain.handle('projects:get-raster-generation-data', globalThis.igsComparisonProbe.original)
      delete globalThis.igsComparisonProbe
    })
  }
  assert.equal((await readData()).ok, true)
  check(
    'Actual preload rejects foreign document/layer and private configuration fields; restored real handler remains readable',
  )
}

async function lateReplyProbe() {
  await application.evaluate(({ ipcMain }) => {
    const channel = 'projects:get-raster-generation-data'
    const original = ipcMain._invokeHandlers.get(channel)
    if (typeof original !== 'function') throw new Error('Real comparison handler is missing.')
    const probe = { original, held: false, delivered: false, release: null, first: true }
    globalThis.igsComparisonLateProbe = probe
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (event, ...args) => {
      const first = probe.first
      probe.first = false
      const response = await original(event, ...args)
      if (!first || !response.ok) return response
      // Hold a genuine portable response only after the actual read/composition has completed.
      await new Promise((resolve) => {
        probe.release = resolve
        probe.held = true
      })
      const delayed = structuredClone(response)
      delayed.value.currentMode = 'outpaint'
      delayed.value.modeUnavailableReason = null
      probe.delivered = true
      return delayed
    })
  })
  try {
    await window
      .getByRole('button', {
        name: `Layer actions for ${fixture.generated.name}`,
        exact: true,
      })
      .click()
    await window.getByRole('menuitem', { name: 'Compare generation settings', exact: true }).click()
    await expect(dialog().getByText('Reading generation data…', { exact: true })).toBeVisible()
    await expect
      .poll(async () => await application.evaluate(() => globalThis.igsComparisonLateProbe.held))
      .toBe(true)
    await dialog().getByRole('button', { name: 'Close generation settings comparison' }).click()
    await expect(dialog()).toBeHidden()
    await openComparison()
    await expect(setting('context.mode').locator('.comparison-values')).toHaveText(
      /txt2img.*img2img/s,
    )
    await application.evaluate(() => globalThis.igsComparisonLateProbe.release())
    await expect
      .poll(
        async () => await application.evaluate(() => globalThis.igsComparisonLateProbe.delivered),
      )
      .toBe(true)
    // A subsequent real IPC read is a delivery barrier; no fixed sleep is used as evidence.
    assert.equal((await readData()).ok, true)
    await expect(setting('context.mode').locator('.comparison-values')).toHaveText(
      /txt2img.*img2img/s,
    )
    await window.keyboard.press('Escape')
    await expect(dialog()).toBeHidden()
    await expect(
      window.getByRole('button', {
        name: `Layer actions for ${fixture.generated.name}`,
        exact: true,
      }),
    ).toBeFocused()
    check(
      'After close/reopen and a witnessed delayed old response, the newer real mode remains unchanged; Escape restores focus',
    )
  } finally {
    await application.evaluate(({ ipcMain }) => {
      const probe = globalThis.igsComparisonLateProbe
      probe.release?.()
      ipcMain.removeHandler('projects:get-raster-generation-data')
      ipcMain.handle('projects:get-raster-generation-data', probe.original)
      delete globalThis.igsComparisonLateProbe
    })
  }
}

try {
  fixture = await prepareFixture()
  application = await electron.launch({ args: ['.'], cwd: process.cwd(), env: environment })
  window = await isolateNativeSmokeWindow(application)
  window.on('pageerror', (error) => report.pageErrors.push(error.message))
  application.process().stderr?.on('data', (chunk) => process.stderr.write(chunk))
  await window.waitForURL('**/index.html')
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1380, 900),
  )
  await window.getByRole('button', { name: `Open ${fixture.title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: fixture.title, exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(window.getByLabel('Project layers', { exact: true }).locator('article')).toHaveCount(
    2,
  )
  const baseline = await opened()
  assert.equal(baseline.dirty, false)
  assert.equal(baseline.canUndo, false)
  assert.equal(baseline.acceptedResults.length, 1)
  const select = window.getByRole('button', {
    name: `Select ${fixture.generated.name}`,
    exact: true,
  })
  const selectedBefore = await select.getAttribute('aria-pressed')
  check(
    'Built Home opens a valid saved generated locked layer and an imported neighboring layer before testing comparison',
  )
  await screenshot('00-valid-project')
  await window
    .getByRole('button', { name: `Layer actions for ${fixture.generated.name}`, exact: true })
    .click()
  await expect(window.getByText('Move down', { exact: true })).toBeVisible()
  const entry = window.getByRole('menuitem', { name: 'Compare generation settings', exact: true })
  if (expectRed) {
    const exists = await window.getByText('Compare generation settings', { exact: true }).count()
    assert.equal(exists, 0, 'The delivered baseline must lack the new comparison action.')
    const error = new Error('The valid generated layer has no comparison entry point.')
    error.code = 'RASTER_COMPARISON_ENTRYPOINT_MISSING'
    throw error
  }
  await entry.click()
  await expect(dialog()).toBeVisible()
  await expect(dialog().locator('.comparison-scroll')).toHaveAttribute('aria-busy', 'false')
  if (nativeAnima) {
    for (const key of [
      'model.predictionType',
      'sampling.sampler',
      'sampling.scheduler',
      'sampling.invokeScheduler',
    ]) {
      await expect(setting(key)).toHaveCount(0)
    }
    for (const key of ['anima.qwen3Encoder', 'anima.vae']) {
      await expect(setting(key)).toHaveAttribute('data-status', 'Unavailable')
      await expect(setting(key)).toContainText(
        'The exact installed Anima companion bundle is unavailable',
      )
    }
  } else {
    await expect(setting('model.predictionType')).toHaveAttribute('data-status', 'Changed')
    await expect(setting('model.predictionType').locator('.comparison-values')).toHaveText(
      /epsilon.*v_prediction/s,
    )
  }
  await expect(setting('context.mode')).toHaveAttribute('data-status', 'Changed')
  await expect(setting('context.mode').locator('.comparison-values')).toHaveText(
    /txt2img.*img2img/s,
  )
  if (!nativeAnima)
    await expect(setting('loras.stack')).toHaveAttribute('data-status', 'Unavailable')
  await dialog().getByRole('checkbox', { name: 'Show unchanged settings' }).check()
  await expect(setting('guidance.steps')).toHaveAttribute('data-status', 'Same')
  await expect(setting('size.dimensions').locator('.comparison-values')).toHaveText(
    nativeAnima ? /64 × 64.*64 × 64/s : /8 × 8.*8 × 8/s,
  )
  await expect(setting('seed.actual').locator('.comparison-values')).toHaveText(/0.*0/s)
  if (nativeAnima) {
    await expect(setting('sampling.animaMethod')).toHaveAttribute('data-status', 'Same')
    await expect(setting('sampling.animaMethod').locator('.comparison-values')).toHaveText(
      /Heun.*Heun/s,
    )
    await expect(setting('loras.stack')).toHaveAttribute('data-status', 'Same')
    await expect(setting('prompt.text')).toHaveAttribute('data-status', 'Same')
    await expect(setting('negativePrompt.text')).toHaveAttribute('data-status', 'Same')
  }
  await screenshot('01-comparison-normal')
  assert.deepEqual(await opened(), baseline)
  assert.equal(await select.getAttribute('aria-pressed'), selectedBefore)
  assert.deepEqual(readFileSync(fixture.path), fixture.bytes)
  check(
    nativeAnima
      ? 'Saved native provenance traverses genuine preload/IPC into read-only comparison: Heun and weighted signs Same, missing pinned companions Unavailable, seed zero, no SD rows or document/history edits'
      : 'Locked result opens a read-only popover with frozen epsilon versus library v_prediction, actual pixel img2img, original bbox size and seed zero; no layer selection/document/history change',
  )

  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(900, 620),
  )
  await expect
    .poll(
      async () =>
        await dialog().evaluate((element) => {
          const box = element.getBoundingClientRect()
          return (
            box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight
          )
        }),
    )
    .toBe(true)
  const geometry = await dialog().evaluate((element) => {
    const box = element.getBoundingClientRect()
    const scroll = element.querySelector('.comparison-scroll')
    return {
      left: box.left,
      top: box.top,
      right: box.right,
      bottom: box.bottom,
      width: innerWidth,
      height: innerHeight,
      scrollHeight: scroll.scrollHeight,
      clientHeight: scroll.clientHeight,
    }
  })
  assert.ok(
    geometry.left >= 0 &&
      geometry.top >= 0 &&
      geometry.right <= geometry.width &&
      geometry.bottom <= geometry.height,
    JSON.stringify(geometry),
  )
  await expect(dialog().getByRole('checkbox', { name: 'Show unchanged settings' })).toBeInViewport()
  await screenshot('02-comparison-compact')
  await dialog().getByRole('button', { name: 'Close generation settings comparison' }).click()
  await expect(dialog()).toBeHidden()
  await expect(
    window.getByRole('button', {
      name: `Layer actions for ${fixture.generated.name}`,
      exact: true,
    }),
  ).toBeFocused()
  assert.deepEqual(await opened(), baseline)
  check(
    'Native 900×620 popover stays contained with a reachable unchanged toggle; closing restores its layer-menu trigger without edits',
    { geometry },
  )
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1380, 900),
  )

  await window
    .getByRole('button', { name: `Layer actions for ${fixture.imported.name}`, exact: true })
    .click()
  await expect(
    window.getByRole('menuitem', {
      name: 'Compare generation settings · No generation data',
      exact: true,
    }),
  ).toHaveAttribute('aria-disabled', 'true')
  await window.keyboard.press('Escape')
  check('Imported neighboring layer visibly retains a disabled No generation data action')

  const steps = window.getByRole('textbox', { name: 'Steps', exact: true })
  await steps.fill('31')
  await steps.press('Enter')
  await expect.poll(async () => (await opened()).generationDraft.sampling.steps).toBe(31)
  const edited = await opened()
  assert.equal(edited.dirty, true)
  await openComparison()
  await expect(setting('guidance.steps')).toHaveAttribute('data-status', 'Changed')
  await expect(setting('guidance.steps').locator('.comparison-values')).toHaveText(
    nativeAnima ? /4.*31/s : /24.*31/s,
  )
  await screenshot('03-frozen-baseline-versus-current-steps')
  assert.deepEqual(await opened(), edited)
  assert.deepEqual(
    (await readIgsPackage(fixture.path)).project.layers[0].generationProvenance,
    fixture.document.layers[0].generationProvenance,
  )
  await dialog().getByRole('button', { name: 'Close generation settings comparison' }).click()
  await expect(dialog()).toBeHidden()
  check(
    'Actual Steps edit is reflected against immutable saved settings; inspecting a dirty Project adds no Undo/state/Save change',
  )

  await lateReplyProbe()
  await preloadProbe()
  assert.deepEqual(await opened(), edited)
  assert.deepEqual(readFileSync(fixture.path), fixture.bytes)
  if (nativeAnima) {
    await window.locator('[aria-label="Anima method"]').click()
    await window.getByText('LCM', { exact: true }).click()
    await expect.poll(async () => (await opened()).generationDraft.sampling.animaMethod).toBe('lcm')
    const nativeEdited = await opened()
    await openComparison()
    await expect(setting('sampling.animaMethod')).toHaveAttribute('data-status', 'Changed')
    await expect(setting('sampling.animaMethod').locator('.comparison-values')).toHaveText(
      /Heun.*LCM/s,
    )
    await screenshot('04-frozen-native-method-versus-current')
    assert.deepEqual(await opened(), nativeEdited)
    assert.deepEqual(readFileSync(fixture.path), fixture.bytes)
    await dialog().getByRole('button', { name: 'Close generation settings comparison' }).click()
    check(
      'A genuine Main native-method edit changes only current settings; saved Heun baseline and .igs bytes remain immutable',
    )
  }
  assert.deepEqual(hashes(sourceFiles), report.sourceSha256)
  assert.deepEqual(hashes(bundleFiles), report.bundleSha256)
  assert.equal(report.pageErrors.length, 0)
  report.outcome = 'passed'
} catch (error) {
  report.error = { code: error?.code ?? null, message: String(error?.stack ?? error) }
  if (expectRed && error?.code === 'RASTER_COMPARISON_ENTRYPOINT_MISSING') {
    report.outcome = 'expected-red'
  } else {
    report.outcome = 'failed'
    process.exitCode = 1
  }
  console.error(error)
  if (window)
    await screenshot(report.outcome === 'expected-red' ? 'expected-red' : 'failure').catch(() => {})
} finally {
  if (application) {
    const process = application.process()
    const exited = new Promise((resolve) => process.once('exit', resolve))
    if (process.exitCode === null) {
      process.kill('SIGKILL')
      await Promise.race([exited, delay(5000)])
    }
  }
  writeFileSync(
    path.join(artifacts, 'native-comparison-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  rmSync(fixtureRoot, { force: true, recursive: true })
  console.log(
    `Native comparison: ${report.outcome}; ${report.checks.length} checks; ${report.pageErrors.length} page errors; artifacts ${artifacts}`,
  )
}
