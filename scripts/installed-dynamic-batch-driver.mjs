/**
 * Shared finite Project UI -> installed worker -> durable batch -> Add/Save/reopen engine. Reuses a
 * qualified isolated catalog; never installs models/runtime. Root's launcher must enforce finite
 * RAM/swap/deadline limits before invoking this runner.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { lstat, mkdir, open, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

import { _electron as electron, expect as baseExpect } from '@playwright/test'

import { openAppDatabase } from '../src/main/db/database.ts'
import { ModelRepository } from '../src/main/models/model-repository.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import {
  animaRegressionModelKeys,
  assertAnimaRegressionCatalog,
  validateAnimaRegressionFixture,
} from './anima-regression-qualification.mjs'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import { componentKeys } from './noobai-components-qualification.mjs'
import { noiseModelKeys } from './noobai-noise-qualification.mjs'
import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
  stopExpiredQualificationProcess,
} from './qualification-resource-limits.mjs'
import { assertUpgradeBounds } from './upgrade-qualification-worker.mjs'

export async function runInstalledDynamicBatchQualification(adapter, fixturePath) {
  const expect = baseExpect.configure({ timeout: 120_000 })
  const fixture = await readJson(fixturePath, 64 * 1024)
  const plan = adapter.validateFixture(fixture)
  assert.equal(fixture.profile, adapter.profile)
  const sampling = adapter.sampling(fixture)
  const selectedModelKey = adapter.modelKey(fixture)
  const selectedLoraKey = adapter.loraKey
  if (fixture.stage === 'reuse')
    assert.ok(
      fixture.baseline,
      'Reuse requires the healthy iteration baseline for its numeric controls.',
    )
  const reference = await readPinnedJson(fixture.referenceFixture)
  assert.equal(reference.profile, 'anima-regression')
  assert.equal(reference.stage, 'sampling', 'Reference must be the strict prior sampling fixture.')
  await canonicalDirectory(reference.appData)
  const appData = reference.appData
  const fixtureRoot = path.dirname(path.dirname(appData))
  assert.ok(
    fixtureRoot.startsWith(path.join(homedir(), '.codex/artifacts/imagegen-studio') + path.sep),
  )
  assert.ok(
    !fixture.artifacts.startsWith(fixtureRoot + path.sep) &&
      !fixtureRoot.startsWith(fixture.artifacts + path.sep) &&
      fixture.artifacts !== fixtureRoot,
    'Evidence must be separate from the reusable runtime/catalog pool.',
  )
  assert.equal(path.basename(appData), 'imagegen-studio')
  assert.equal(path.basename(path.dirname(appData)), 'data')
  const provision = await readJson(path.join(appData, 'qualification-runtime.json'))
  assert.equal(provision.status, 'passed')
  assert.equal(provision.appData, appData)
  const pointer = await readJson(path.join(appData, 'runtime/current-runtime.json'))
  assert.equal(pointer.runtimeId, provision.runtimeId)
  const installed = await readJson(provision.report, 32 * 1024 * 1024)
  assert.equal(installed.status, 'activated-qualified')
  assert.equal(installed.confirmedWorkerExit, true)
  validateAnimaRegressionFixture(reference, installed.ready)
  const launcherBounds = await assertUpgradeBounds()
  const workerRoot = installed.installed.workerRoot
  await canonicalDirectory(workerRoot)
  assert.ok(workerRoot.startsWith(path.join(appData, 'runtime') + path.sep))
  const workerBaseline = await readPinnedJson(fixture.workerBaseline)
  assert.equal(workerBaseline.status, 'passed')
  assert.equal(workerBaseline.workerVersion, '0.14.0')
  assert.equal(Object.keys(workerBaseline.workerFiles).length, 43)

  const sourceFiles = [
    adapter.entrySource,
    'scripts/installed-dynamic-batch-driver.mjs',
    adapter.adapterSource,
    adapter.oracleSource,
    'scripts/anima-regression-qualification.mjs',
    'scripts/noobai-noise-qualification.mjs',
    'scripts/noobai-components-qualification.mjs',
    'scripts/noobai-vae-encoder-qualification.mjs',
    'scripts/noobai-lora-stack-qualification.mjs',
    'scripts/native-smoke-window.mjs',
    'scripts/qualification-resource-limits.mjs',
    'scripts/upgrade-qualification-worker.mjs',
    'worker-python/uv.lock',
  ]
  const sourceSha256 = {}
  for (const file of sourceFiles) sourceSha256[file] = await hashFile(file)
  const bundleSha256 = {}
  for (const file of [
    'dist/main/main.cjs',
    'dist/preload/preload.cjs',
    'dist/renderer/index.html',
    ...(await readdir('dist/renderer/assets'))
      .filter((name) => /\.(js|css)$/.test(name))
      .map((name) => `dist/renderer/assets/${name}`),
  ])
    bundleSha256[file] = await hashFile(file)

  let database, repository, application, window, nativeProcess, mainLog, reportHandle
  let initialCatalog, initialQueue, initialCursors, workerSources, managedFiles, originalSources
  let initialUnfinished = []
  let baseline = null,
    crashSource = null
  const completionById = new Map()
  const report = {
    schemaVersion: 1,
    status: 'running',
    profile: fixture.profile,
    stage: fixture.stage,
    head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    workingTree: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }),
    fixturePath,
    fixtureSha256: await hashFile(fixturePath),
    ...(fixture.objective ? { objective: fixture.objective } : {}),
    referenceFixture: fixture.referenceFixture,
    workerBaseline: fixture.workerBaseline,
    appData,
    runtimeId: pointer.runtimeId,
    installedReady: installed.ready,
    launcherBounds,
    sourceSha256,
    bundleSha256,
    literalPlan: plan,
    checks: [],
    stages: [],
    generations: [],
    admissions: [],
    pageErrors: [],
    screenshots: [],
    resourceLimitChecks: [],
    boundary: adapter.boundary,
  }
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    XDG_DATA_HOME: path.join(fixtureRoot, 'data'),
    XDG_CONFIG_HOME: path.join(fixtureRoot, 'config'),
    XDG_CACHE_HOME: path.join(fixtureRoot, 'cache'),
  }
  for (const name of [
    'ELECTRON_RUN_AS_NODE',
    'IMAGEGEN_TEST_IMAGE_WORKER',
    'IMAGEGEN_DEV_SERVER_URL',
    'PYTHONPATH',
    'PYTHONHOME',
  ])
    delete env[name]

  function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex')
  }
  async function hashFile(file) {
    const digest = createHash('sha256')
    for await (const chunk of createReadStream(file)) digest.update(chunk)
    return digest.digest('hex')
  }
  async function canonicalDirectory(directory) {
    const entry = await lstat(directory)
    assert.ok(entry.isDirectory() && !entry.isSymbolicLink(), 'Expected a canonical directory.')
    assert.equal(await realpath(directory), directory)
  }
  async function readJson(file, limit = 1024 * 1024) {
    const entry = await lstat(file)
    assert.ok(
      entry.isFile() && !entry.isSymbolicLink(),
      'Expected a regular non-symlink JSON file.',
    )
    assert.equal(await realpath(file), file)
    assert.ok(entry.size > 0 && entry.size <= limit, 'JSON exceeds the bounded input envelope.')
    return JSON.parse(await readFile(file, 'utf8'))
  }
  async function readPinnedJson(descriptor) {
    const filename = descriptor.path ?? descriptor.reportPath
    const before = await lstat(filename)
    assert.ok(before.isFile() && !before.isSymbolicLink())
    assert.equal(await realpath(filename), filename)
    assert.ok(before.size > 0 && before.size <= 32 * 1024 * 1024)
    const bytes = await readFile(filename)
    assert.equal(sha256(bytes), descriptor.sha256 ?? descriptor.reportSha256)
    assert.deepEqual(metadata(await lstat(filename)), metadata(before))
    return JSON.parse(bytes.toString('utf8'))
  }
  function metadata(entry) {
    return {
      dev: entry.dev,
      ino: entry.ino,
      mode: entry.mode,
      size: entry.size,
      mtimeMs: entry.mtimeMs,
      ctimeMs: entry.ctimeMs,
    }
  }
  async function fileSnapshot(file, expectedSha = null) {
    const entry = await lstat(file)
    assert.ok(entry.isFile() && !entry.isSymbolicLink())
    assert.equal(await realpath(file), file)
    const digest = await hashFile(file)
    if (expectedSha !== null) assert.equal(digest, expectedSha)
    return { path: file, sha256: digest, ...metadata(entry) }
  }
  async function workerSnapshot() {
    const result = {}
    const visit = async (directory) => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        assert.equal(
          entry.isSymbolicLink(),
          false,
          'Installed worker tree cannot contain symlinks.',
        )
        if (entry.name === '__pycache__' || entry.name.endsWith('.pyc')) continue
        const file = path.join(directory, entry.name)
        if (entry.isDirectory()) await visit(file)
        else if (entry.isFile()) result[path.relative(workerRoot, file)] = await fileSnapshot(file)
      }
    }
    await visit(workerRoot)
    assert.equal(Object.keys(result).length, 43, 'Expected exactly43 installed worker sources.')
    return result
  }
  async function checkpoint() {
    if (!reportHandle) return
    const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n')
    let offset = 0
    while (offset < bytes.length) {
      const { bytesWritten } = await reportHandle.write(
        bytes,
        offset,
        bytes.length - offset,
        offset,
      )
      assert.ok(bytesWritten > 0)
      offset += bytesWritten
    }
    await reportHandle.truncate(bytes.length)
    await reportHandle.sync()
  }
  async function stage(name, evidence = {}) {
    report.stages.push({ name, at: new Date().toISOString(), ...evidence })
    console.log(`STAGE ${name}`)
    await checkpoint()
  }
  async function check(name, evidence = {}) {
    report.checks.push({ name, ...evidence })
    console.log(`PASS ${name}`)
    await checkpoint()
  }
  async function api(method, ...args) {
    const response = await window.evaluate(
      ({ method, args }) => window.api.projects[method](...args),
      { method, args },
    )
    assert.equal(response.ok, true, JSON.stringify(response))
    return response.value
  }
  async function tab(project) {
    const result = await api('open', project.id)
    assert.equal(result.kind, 'opened')
    return result.tab
  }
  async function setInput(label, value) {
    const input = window.locator(`input[aria-label="${label}"]`)
    await input.fill(String(value))
    await input.press('Tab')
  }
  function selectTrigger(control) {
    return control
      .locator(
        'xpath=ancestor-or-self::*[contains(concat(" ", normalize-space(@class), " "), " n-select ")][1]',
      )
      .locator('.n-base-selection')
  }
  async function recordSelection(label, value, phase) {
    const observed = await window.evaluate(
      ({ label, value, phase }) => {
        const control = [...document.querySelectorAll('[aria-label]')].find(
          (element) => element.getAttribute('aria-label') === label,
        )
        const select = control?.closest('.n-select')
        const visible = (element) => {
          const style = getComputedStyle(element)
          const rectangle = element.getBoundingClientRect()
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            rectangle.width > 0 &&
            rectangle.height > 0
          )
        }
        return {
          label,
          value,
          phase,
          controlOuterHTML: control?.outerHTML.slice(0, 32 * 1024) ?? null,
          selectOuterHTML: select?.outerHTML.slice(0, 32 * 1024) ?? null,
          disabled:
            select
              ?.querySelector('.n-base-selection')
              ?.classList.contains('n-base-selection--disabled') ?? null,
          menus: [...document.querySelectorAll('.n-base-select-menu')].map((menu) => ({
            visible: visible(menu),
            outerHTML: menu.outerHTML.slice(0, 32 * 1024),
            options: [...menu.querySelectorAll('.n-base-select-option')].map((option) => ({
              text: option.textContent.replace(/\s+/g, ' ').trim(),
              visible: visible(option),
              disabled: option.classList.contains('n-base-select-option--disabled'),
            })),
          })),
        }
      },
      { label, value, phase },
    )
    report.selectionChecks ??= []
    report.selectionChecks.push({ at: new Date().toISOString(), ...observed })
    await checkpoint()
  }
  async function setSelect(label, value) {
    try {
      await recordSelection(label, value, 'before-ready')
      const control = window.locator(`[aria-label="${label}"]`)
      const trigger = selectTrigger(control)
      await expect(trigger).toHaveCount(1, { timeout: 15_000 })
      await expect(trigger).not.toHaveClass(/n-base-selection--disabled/, { timeout: 15_000 })
      await trigger.scrollIntoViewIfNeeded()
      await trigger.click()
      await recordSelection(label, value, 'after-trigger-click')
      const menu = window.locator('.n-base-select-menu:visible')
      await expect(menu).toHaveCount(1, { timeout: 15_000 })
      const escaped = value
        .trim()
        .split(/\s+/)
        .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('\\s+')
      const option = menu
        .locator('.n-base-select-option')
        .filter({ hasText: new RegExp(`^\\s*${escaped}\\s*$`) })
      await expect(option).toHaveCount(1, { timeout: 15_000 })
      await expect(option).not.toHaveClass(/n-base-select-option--disabled/)
      await option.click()
      await recordSelection(label, value, 'after-option-click')
    } catch (error) {
      await recordSelection(label, value, 'selection-failed')
      await screenshot(`selection-failed-${report.selectionChecks.length}.png`)
      await checkpoint()
      throw error
    }
  }
  async function queueRows(project) {
    return await database.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .where('local_project_key', '=', project.id)
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc')
      .execute()
  }
  async function receiptFor(row) {
    return await database.db
      .selectFrom('generation_candidate_receipt')
      .selectAll()
      .where('queue_item_id', '=', row.id)
      .executeTakeFirst()
  }
  async function packageFor(project) {
    for (const name of await readdir(path.join(appData, 'workspaces/Uncategorized'))) {
      if (!name.endsWith('.igs')) continue
      const filename = path.join(appData, 'workspaces/Uncategorized', name)
      const saved = await readIgsPackage(filename)
      if (saved.project.documentId === project.documentId)
        return { path: filename, saved, sha256: await hashFile(filename) }
    }
    throw new Error('Project package was not found by its actual document identity.')
  }
  async function bounds(phase) {
    const observed = await boundQualificationProcess(nativeProcess.pid)
    report.resourceLimitChecks.push({ phase, ...observed })
    return observed
  }
  function processStart(stat) {
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]
  }
  async function runtimeUsers() {
    const result = []
    for (const entry of await readdir('/proc')) {
      if (!/^\d+$/.test(entry)) continue
      try {
        const command = await readFile(`/proc/${entry}/cmdline`, 'utf8')
        const args = command.split('\0').filter(Boolean)
        if (!args[0]?.startsWith(path.join(appData, 'runtime') + path.sep)) continue
        const start = processStart(await readFile(`/proc/${entry}/stat`, 'utf8'))
        result.push({ pid: Number(entry), start, command: args })
      } catch (error) {
        if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error
      }
    }
    return result
  }
  async function decodedImage(url) {
    const result = await window.evaluate(async (imageUrl) => {
      const inline = imageUrl.match(/^data:(image\/(?:png|webp));base64,(.+)$/)
      const response = inline ? null : await fetch(imageUrl)
      const bytes = inline
        ? Uint8Array.from(atob(inline[2]), (character) => character.charCodeAt(0))
        : new Uint8Array(await response.arrayBuffer())
      const image = new Image()
      let binary = ''
      for (let offset = 0; offset < bytes.length; offset += 8192)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
      image.src = `data:${inline?.[1] ?? response.headers.get('content-type')};base64,${btoa(binary)}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('Cannot decode the actual image.')
      context.drawImage(image, 0, 0)
      const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', rgba))
      let opaquePixels = 0,
        transparentPixels = 0
      for (let index = 3; index < rgba.length; index += 4) {
        if (rgba[index] === 255) opaquePixels += 1
        if (rgba[index] === 0) transparentPixels += 1
      }
      return {
        encoded: Array.from(bytes),
        width: image.naturalWidth,
        height: image.naturalHeight,
        status: response?.status ?? 200,
        mime: inline?.[1] ?? response.headers.get('content-type'),
        pixelSha256: Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join(''),
        opaquePixels,
        transparentPixels,
      }
    }, url)
    const { encoded, ...dimensions } = result
    const bytes = Buffer.from(encoded)
    return { bytes, dimensions: { ...dimensions, bytes: bytes.length, sha256: sha256(bytes) } }
  }
  async function screenshot(name, surface = null) {
    const filename = path.join(fixture.artifacts, name)
    if (surface) await surface.screenshot({ path: filename })
    else {
      const bytes = await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]
          .capturePage(undefined, { stayHidden: true, stayAwake: true })
          .then((image) => Array.from(image.toPNG())),
      )
      await writeFile(filename, Buffer.from(bytes), { flag: 'wx' })
    }
    report.screenshots.push(filename)
    return filename
  }
  async function launch() {
    assert.deepEqual(
      await runtimeUsers(),
      [],
      'No installed inference users may precede this launch.',
    )
    application = await electron.launch({
      args: [
        '--ozone-platform=x11',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '.',
      ],
      cwd: process.cwd(),
      env,
    })
    nativeProcess = application.process()
    report.nativeProcessPid = nativeProcess.pid
    report.nativeExit = null
    nativeProcess.on('exit', (code, signal) => {
      report.nativeExit = { code, signal, at: new Date().toISOString() }
    })
    await bounds('native-launch')
    mainLog = createWriteStream(path.join(fixture.artifacts, 'electron-main.log'), { flags: 'wx' })
    nativeProcess.stderr.pipe(mainLog, { end: false })
    window = await isolateNativeSmokeWindow(application)
    window.on('pageerror', (error) => report.pageErrors.push(String(error)))
    await application.evaluate(({ BrowserWindow, screen }) => {
      const displays = screen.getAllDisplays()
      for (const nativeWindow of BrowserWindow.getAllWindows()) {
        const isolate = () =>
          nativeWindow.setPosition(
            Math.min(...displays.map(({ bounds }) => bounds.x)) -
              nativeWindow.getBounds().width -
              1000,
            Math.min(...displays.map(({ bounds }) => bounds.y)) -
              nativeWindow.getBounds().height -
              1000,
          )
        nativeWindow.setFocusable(false)
        nativeWindow.setSkipTaskbar(true)
        nativeWindow.on('show', isolate)
        isolate()
        nativeWindow.showInactive()
      }
    })
    await window.getByRole('tab', { name: 'Home', exact: true }).waitFor()
    await window.evaluate(() => {
      window.__dynamicQualificationProgress = []
      window.api.projects.onGenerationProgress((snapshot) => {
        if (snapshot.current) window.__dynamicQualificationProgress.push(snapshot)
      })
    })
    const ready = await window.evaluate(() => window.api.runtime.getStatus())
    assert.equal(ready.ok, true, JSON.stringify(ready))
    assert.equal(ready.value.kind, 'ready')
    assert.equal(ready.value.runtimeId, pointer.runtimeId)
    report.runtime = ready.value
    await check('Actual built application qualifies retained installed runtime', {
      runtime: ready.value,
    })
  }
  async function createProject() {
    const title = `Installed ${fixture.objective ?? 'anima'} dynamic ${fixture.stage} ${Date.now().toString(36)}`
    await window.getByRole('button', { name: 'New Project', exact: true }).first().click()
    const dialog = window.getByRole('dialog', { name: 'New Project', exact: true })
    await dialog.locator('input[aria-label="Project name"]').fill(title)
    await dialog.locator('input[aria-label="Project width"]').fill('256')
    await dialog.locator('input[aria-label="Project height"]').fill('256')
    await dialog.getByRole('button', { name: 'Create Project', exact: true }).click()
    await window.getByRole('tab', { name: title, exact: true }).waitFor()
    const listed = (await api('list')).find((item) => item.title === title)
    assert.ok(listed)
    const opened = await tab(listed)
    return { ...listed, documentId: opened.documentId }
  }
  async function author(project, currentPlan) {
    const selected = (await tab(project)).generationDraft.model
    if (
      selected?.localModelId !== reference[selectedModelKey].installed.resourceId ||
      selected?.localVersionId !== reference[selectedModelKey].installed.versionId
    ) {
      await window.locator('[aria-label="Generation model"]').click()
      await window.getByText(reference[selectedModelKey].name, { exact: true }).last().click()
      await expect
        .poll(async () => (await tab(project)).generationDraft.model?.localModelId)
        .toBe(reference[selectedModelKey].installed.resourceId)
      await expect(selectTrigger(window.locator('[aria-label="Model version"]'))).not.toHaveClass(
        /n-base-selection--disabled/,
      )
      await window.locator('[aria-label="Model version"]').click()
      await window
        .getByText(reference[selectedModelKey].versionName, { exact: true })
        .last()
        .click()
      await expect
        .poll(async () => (await tab(project)).generationDraft.model?.localVersionId)
        .toBe(reference[selectedModelKey].installed.versionId)
    }
    await setSelect(sampling.label, sampling.value)
    if (sampling.scheduler) await setSelect('Scheduler', sampling.scheduler)
    await setInput('Steps', 3)
    await setInput('CFG scale', adapter.cfgScale)
    const random = window.getByRole('switch', { name: 'Random seed switch' })
    if ((await random.getAttribute('aria-checked')) === 'true') await random.click()
    await setInput('Generation seed', 0)
    const current = await tab(project)
    if (current.generationDraft.loras.length === 0) {
      await window.locator('[aria-label="Add LoRA"]').click()
      await window.getByText(reference[selectedLoraKey].name, { exact: true }).last().click()
    }
    await setInput(`${reference[selectedLoraKey].name} weight`, -0.5)
    if (adapter.authorComponents)
      await adapter.authorComponents({ window, expect, tab, project, reference, setSelect })
    if (adapter.authorPrompts)
      await adapter.authorPrompts({
        window,
        expect,
        tab,
        project,
        reference,
        currentPlan,
        async recordAuthoringFailure(evidence) {
          report.promptAuthoringFailures ??= []
          report.promptAuthoringFailures.push(evidence)
          await checkpoint()
        },
      })
    else {
      await window
        .getByRole('textbox', { name: 'Positive prompt', exact: true })
        .fill(currentPlan.sourcePrompts.positive)
      await window
        .getByRole('textbox', { name: 'Negative prompt', exact: true })
        .fill(currentPlan.sourcePrompts.negative)
    }
    await setDynamic(project, currentPlan.maxPrompts, currentPlan.seedBehavior)
    await setInput('Images per click', currentPlan.iterations)
    if (currentPlan.requestedSeedPolicy === 'reuse')
      await window.getByRole('button', { name: 'Reuse last seed', exact: true }).click()
    await expect
      .poll(async () => {
        const draft = (await tab(project)).generationDraft
        return {
          positive: draft.positivePrompt.text,
          negative: draft.negativePrompt.text,
          dynamic: draft.dynamicPrompt,
          seedPolicy: draft.seed.policy,
          loraWeight: draft.loras[0]?.weight,
          method: draft.sampling[sampling.draftKey],
        }
      })
      .toEqual({
        positive: currentPlan.sourcePrompts.positive,
        negative: currentPlan.sourcePrompts.negative,
        dynamic: { maxPrompts: currentPlan.maxPrompts, seedBehavior: currentPlan.seedBehavior },
        seedPolicy: currentPlan.requestedSeedPolicy,
        loraWeight: -0.5,
        method: sampling.code,
      })
    if (adapter.assertAuthored)
      adapter.assertAuthored((await tab(project)).generationDraft, reference)
  }
  async function setDynamic(project, maxPrompts, seedBehavior) {
    await window
      .getByRole('region', { name: 'Positive prompt editor', exact: true })
      .getByRole('button', { name: 'Preview dynamic prompt' })
      .click()
    const dialog = window.getByRole('dialog', { name: 'Dynamic Prompt Preview', exact: true })
    await expect(dialog).toBeVisible()
    await dialog.locator('input[aria-label="Maximum dynamic prompts"]').fill(String(maxPrompts))
    await dialog.locator('input[aria-label="Maximum dynamic prompts"]').press('Enter')
    await dialog.locator('[aria-label="Dynamic prompt seed behavior"]').click()
    await window
      .getByText(seedBehavior === 'per-prompt' ? 'Per prompt' : 'Per iteration', { exact: true })
      .last()
      .click()
    await expect
      .poll(async () => (await tab(project)).generationDraft.dynamicPrompt)
      .toEqual({ maxPrompts, seedBehavior })
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(dialog).toBeHidden()
  }
  async function save(project) {
    await window.getByRole('button', { name: 'Save Project', exact: true }).click()
    await expect.poll(async () => (await tab(project)).dirty).toBe(false)
    return await packageFor(project)
  }
  async function mutateCurrentAuthoring(project) {
    await window
      .getByRole('textbox', { name: 'Positive prompt', exact: true })
      .fill('a (green:1.1) glass bowl, later authoring edit')
    await window
      .getByRole('textbox', { name: 'Negative prompt', exact: true })
      .fill('(grainy:0.8), later authoring edit')
    await setSelect(sampling.label, sampling.editedValue)
    if (sampling.scheduler) await setSelect('Scheduler', sampling.scheduler)
    // Reuse disables the numeric input until the real UI changes its policy.
    const random = window.getByRole('switch', { name: 'Random seed switch' })
    if ((await random.getAttribute('aria-checked')) === 'true') await random.click()
    const seedInput = window.locator('input[aria-label="Generation seed"]')
    if (await seedInput.isDisabled()) {
      await random.click()
      await random.click()
    }
    await setInput('Generation seed', 37)
    await setInput(`${reference[selectedLoraKey].name} weight`, -0.25)
    await setDynamic(
      project,
      3,
      plan.seedBehavior === 'per-prompt' ? 'per-iteration' : 'per-prompt',
    )
    await setInput('Images per click', 1)
    await expect
      .poll(async () => (await tab(project)).generationDraft.seed)
      .toEqual({ policy: 'fixed', value: 37 })
    await expect
      .poll(async () => (await tab(project)).generationDraft.sampling[sampling.draftKey])
      .toBe(sampling.editedCode)
    const draft = structuredClone((await tab(project)).generationDraft)
    if (adapter.assertEdited) adapter.assertEdited(draft, reference)
    return draft
  }
  function semanticLayers(layers) {
    return layers.map(({ imageUrl: _imageUrl, thumbnailUrl: _thumbnailUrl, ...layer }) => layer)
  }
  async function settledDirtyShadow(project, currentDraft) {
    await api('sealPromptHistory', project.id)
    const directory = path.join(appData, 'autosave', project.id)
    let verified
    await expect
      .poll(
        async () => {
          try {
            const manifest = await readJson(path.join(directory, 'manifest.json'))
            if (manifest.state !== 'dirty' || typeof manifest.snapshotId !== 'string') return false
            assert.match(manifest.snapshotId, /^[A-Za-z0-9-]+$/)
            const document = await readJson(
              path.join(directory, 'snapshots', manifest.snapshotId, 'project.json'),
              16 * 1024 * 1024,
            )
            if (
              document.documentRevision !== manifest.documentRevision ||
              document.documentId !== project.documentId
            )
              return false
            if (JSON.stringify(document.generationDraft) !== JSON.stringify(currentDraft))
              return false
            verified = {
              manifest,
              documentRevision: document.documentRevision,
              generationDraft: document.generationDraft,
            }
            return true
          } catch (error) {
            if (error.code === 'ENOENT') return false
            throw error
          }
        },
        { timeout: 20_000 },
      )
      .toBe(true)
    return verified
  }
  async function admit(project) {
    const before = await tab(project)
    const previous = new Set((await queueRows(project)).map(({ id }) => id))
    const portable = await packageFor(project)
    // ProjectTab intentionally does not expose a revision. Read the durable document
    // captured before Generate, rather than inventing a DTO field or using the queued answer.
    before.documentRevision = before.dirty
      ? (await settledDirtyShadow(project, before.generationDraft)).documentRevision
      : portable.saved.project.documentRevision
    const button = window.getByRole('button', { name: 'Generate', exact: true })
    await expect(button).toBeEnabled({ timeout: 180_000 })
    await bounds('before-Generate')
    await button.click()
    let admitted
    await expect
      .poll(
        async () => {
          admitted = (await queueRows(project)).filter(({ id }) => !previous.has(id))
          return admitted.length
        },
        { timeout: 180_000 },
      )
      .toBe(plan.expectedAdmissions)
    assert.equal(new Set(admitted.map(({ batch_id }) => batch_id)).size, 1)
    assert.equal(new Set(admitted.map(({ staging_session_id }) => staging_session_id)).size, 1)
    report.admissions = admitted.map((row, index) => ({
      index,
      row,
      frozen: JSON.parse(row.frozen_payload_json),
      expectedItem: plan.items[index],
    }))
    await checkpoint()
    for (const [index, row] of admitted.entries()) {
      const frozen = JSON.parse(row.frozen_payload_json)
      adapter.assertFrozen(frozen, plan.items[index], reference)
      assert.equal(row.document_id, before.documentId)
      assert.equal(row.document_revision, before.documentRevision)
      assert.equal(frozen.context.documentId, before.documentId)
      assert.equal(frozen.context.documentRevision, before.documentRevision)
      assert.equal(row.operation, adapter.operation)
      assert.deepEqual(frozen.context.bbox, before.primaryBbox)
      const targetPath = path.join(appData, 'generation-inputs', row.id, 'target.png')
      const target = await fileSnapshot(targetPath, frozen.context.target.sha256)
      assert.equal(target.size, frozen.context.target.byteSize)
      const decoded = await decodedImage(
        `data:image/png;base64,${(await readFile(targetPath)).toString('base64')}`,
      )
      assert.equal(decoded.dimensions.transparentPixels, 256 * 256)
      report.admissions[index].target = target
    }
    await checkpoint()
    return { before, admitted, portable }
  }
  async function observeCompleted(project, row, expectedItem, before, portable) {
    if (completionById.has(row.id)) return completionById.get(row.id)
    const results = await api('listGenerationResults', project.id)
    const candidate = results.candidates.find(({ queueItemId }) => queueItemId === row.id)
    assert.ok(candidate, 'A completed row must expose its genuine verified public candidate.')
    const receipt = await receiptFor(row)
    assert.equal(receipt?.status, 'completed')
    assert.equal(receipt.actual_seed, expectedItem.seed)
    assert.equal(candidate.actualSeed, expectedItem.seed)
    assert.equal(receipt.frozen_payload_sha256, sha256(Buffer.from(row.frozen_payload_json)))
    const currentRow = (await queueRows(project)).find(({ id }) => id === row.id)
    assert.equal(currentRow.status, 'completed')
    assert.equal(currentRow.frozen_payload_json, row.frozen_payload_json)
    const frozen = JSON.parse(row.frozen_payload_json)
    adapter.assertFrozen(frozen, expectedItem, reference)
    const image = await decodedImage(candidate.imageUrl)
    assert.equal(image.dimensions.status, 200)
    assert.equal(image.dimensions.sha256, receipt.image_sha256)
    assert.equal(image.dimensions.bytes, receipt.image_byte_size)
    assert.equal(image.dimensions.width, 256)
    assert.equal(image.dimensions.height, 256)
    assert.equal(image.dimensions.opaquePixels, 256 * 256)
    assert.ok(candidate.thumbnailUrl)
    const thumbnail = await decodedImage(candidate.thumbnailUrl)
    assert.equal(thumbnail.dimensions.status, 200)
    assert.equal(thumbnail.dimensions.mime, 'image/webp')
    const progress = await window.evaluate(
      (id) => window.__dynamicQualificationProgress.filter(({ current }) => current.jobId === id),
      row.id,
    )
    assert.ok(progress.length > 0, 'Actual public preload must observe native denoising.')
    for (const [index, snapshot] of progress.entries()) {
      assert.equal(snapshot.current.totalSteps, 3)
      assert.equal(snapshot.current.documentId, before.documentId)
      assert.equal(snapshot.current.projectKey, project.id)
      assert.equal(snapshot.current.statusSequence, receipt.expected_status_sequence)
      assert.equal(snapshot.current.statusSequence + 1, currentRow.status_sequence)
      if (index > 0) {
        assert.ok(snapshot.revision > progress[index - 1].revision)
        assert.ok(snapshot.current.step > progress[index - 1].current.step)
      }
    }
    assert.equal(progress.at(-1).current.step, 3)
    assert.equal(
      await hashFile(portable.path),
      portable.sha256,
      'Completion cannot Save the portable project.',
    )
    assert.deepEqual(
      semanticLayers((await tab(project)).layers),
      semanticLayers(before.layers),
      'Completion cannot alter Project layers.',
    )
    const outputPath = path.join(fixture.artifacts, `${row.id}.png`)
    await writeFile(outputPath, image.bytes, { flag: 'wx' })
    const generation = {
      queueItemId: row.id,
      candidateId: candidate.candidateId,
      projectKey: project.id,
      expectedItem,
      frozen,
      row: currentRow,
      receipt,
      dimensions: image.dimensions,
      thumbnail: thumbnail.dimensions,
      progress,
      outputPath,
      qualification: {
        normalizedInputs: adapter.normalizeNativeInputs(frozen),
        beforeExplicitAdd: true,
      },
      accepted: false,
    }
    // Retain a finite provisional completion even when its same-input numerical check fails.
    report.generations.push(generation)
    completionById.set(row.id, generation)
    await checkpoint()
    if (baseline) {
      // Reuse's first pair repeats Fixed0/1 while preserving its different requested metadata.
      // Subsequent pairs use new seeds, so they have no same-input baseline in this finite gate.
      if (fixture.stage !== 'reuse' || expectedItem.promptPairIndex === 0) {
        const normalizer =
          fixture.stage === 'reuse'
            ? adapter.normalizeExecutionInputs
            : adapter.normalizeNativeInputs
        const inputs = normalizer(frozen)
        const matched = baseline.generations.find(
          ({ frozen: retained }) => JSON.stringify(normalizer(retained)) === JSON.stringify(inputs),
        )
        assert.ok(matched, 'A source/bundle-bound healthy same-input baseline is required.')
        generation.baseline = {
          reportPath: fixture.baseline.reportPath,
          reportSha256: fixture.baseline.reportSha256,
          queueItemId: matched.queueItemId,
          beforeExplicitAdd: true,
          expectedPixelSha256: matched.dimensions.pixelSha256,
          actualPixelSha256: generation.dimensions.pixelSha256,
          allowedMetadataDifferences:
            fixture.stage === 'reuse' ? ['requestedSeedPolicy', 'seedBehavior'] : [],
        }
        await checkpoint()
        assert.equal(
          generation.dimensions.pixelSha256,
          matched.dimensions.pixelSha256,
          'Installed dynamic-batch pixels differ from retained healthy same-input reference.',
        )
      }
    }
    return generation
  }
  async function awaitCompletions(project, captured) {
    await expect
      .poll(
        async () => {
          const rows = (await queueRows(project)).filter(({ id }) =>
            captured.admitted.some((item) => item.id === id),
          )
          assert.ok(
            rows.every(({ status }) => !['failed', 'canceled'].includes(status)),
            JSON.stringify(
              rows.map(({ id, status, error_message }) => ({ id, status, error_message })),
            ),
          )
          for (const [index, original] of captured.admitted.entries()) {
            if (rows.find(({ id }) => id === original.id)?.status === 'completed')
              await observeCompleted(
                project,
                original,
                plan.items[index],
                captured.before,
                captured.portable,
              )
          }
          return report.generations.length
        },
        { timeout: 1_200_000, intervals: [1000, 2000, 5000] },
      )
      .toBe(plan.expectedCompletions)
    const results = await api('listGenerationResults', project.id)
    assert.equal(results.lastActualSeed, plan.items.at(-1).seed)
    report.lastActualSeed = results.lastActualSeed
    await expect.poll(async () => (await api('getGenerationState', project.id)).phase).toBe('idle')
    await expect.poll(runtimeUsers).toEqual([])
  }
  async function addAll(project, count) {
    await window.getByRole('button', { name: 'Result selection actions', exact: true }).click()
    await window
      .getByRole('menuitem', { name: 'Select all completed across all sessions', exact: true })
      .click()
    await window
      .getByRole('button', {
        name: `Add ${count} as ${count === 1 ? 'Layer' : 'Layers'}`,
        exact: true,
      })
      .click()
    await expect
      .poll(async () => (await tab(project)).layers.length)
      .toBe(count + (fixture.stage === 'reuse' && count === 8 ? 1 : 0))
  }
  async function compare(project, layer, packagePath, generation = null) {
    const before = await tab(project)
    const portableSha256 = await hashFile(packagePath)
    await window
      .getByRole('button', { name: `Layer actions for ${layer.name}`, exact: true })
      .click()
    await window.getByRole('menuitem', { name: 'Compare generation settings', exact: true }).click()
    const dialog = window.getByRole('dialog', { name: 'Compare generation settings', exact: true })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.comparison-scroll')).toHaveAttribute('aria-busy', 'false')
    await dialog.getByRole('checkbox', { name: 'Show unchanged settings', exact: true }).check()
    for (const key of adapter.comparisonChanged)
      await expect(dialog.locator(`[data-setting="${key}"]`)).toHaveAttribute(
        'data-status',
        'Changed',
      )
    for (const key of adapter.comparisonSame)
      await expect(dialog.locator(`[data-setting="${key}"]`)).toHaveAttribute('data-status', 'Same')
    const additional = adapter.assertComparison
      ? await adapter.assertComparison({
          window,
          expect,
          dialog,
          layer,
          generation,
          reference,
          currentDraft: before.generationDraft,
        })
      : undefined
    const image = await screenshot(
      generation ? `comparison-${generation.queueItemId}.png` : 'comparison.png',
      dialog,
    )
    await dialog
      .getByRole('button', { name: 'Close generation settings comparison', exact: true })
      .click()
    await expect(dialog).toBeHidden()
    const after = await tab(project)
    for (const key of [
      'documentId',
      'generationDraft',
      'layers',
      'primaryBbox',
      'dirty',
      'canUndo',
      'canRedo',
    ])
      assert.deepEqual(after[key], before[key])
    assert.equal(await hashFile(packagePath), portableSha256)
    return {
      readOnly: true,
      screenshot: image,
      ...(generation ? { layerId: layer.id, queueItemId: generation.queueItemId, additional } : {}),
    }
  }
  async function verifySaved(project, currentDraft, extra = []) {
    const accepted = await tab(project)
    const savedPackage = await save(project)
    const evidence = [...extra, ...report.generations]
    assert.equal(savedPackage.saved.project.layers.length, evidence.length)
    assert.equal(savedPackage.saved.project.lastActualSeedSnapshot, plan.items.at(-1).seed)
    assert.deepEqual(savedPackage.saved.project.generationDraft, currentDraft)
    const provenanceById = new Map()
    for (const generation of evidence) {
      const layer = savedPackage.saved.project.layers.find(
        ({ generationProvenance }) =>
          generationProvenance?.executionResultContext.queueItemId === generation.queueItemId,
      )
      assert.ok(layer, 'Every accepted queue item must have one saved layer.')
      const provenance = layer.generationProvenance
      adapter.assertConfiguration(
        provenance.generationConfiguration,
        generation.expectedItem,
        reference,
      )
      const bytes = await savedPackage.saved.readMember(layer.asset.path)
      assert.equal(sha256(bytes), generation.receipt.image_sha256)
      assert.equal(bytes.length, generation.receipt.image_byte_size)
      const pixels = await decodedImage(`data:image/png;base64,${bytes.toString('base64')}`)
      assert.equal(pixels.dimensions.pixelSha256, generation.dimensions.pixelSha256)
      assert.equal(provenance.executionResultContext.candidateId, generation.candidateId)
      assert.equal(provenance.executionResultContext.output.sha256, generation.receipt.image_sha256)
      assert.equal(
        provenance.executionResultContext.output.byteSize,
        generation.receipt.image_byte_size,
      )
      assert.equal(provenance.layerSourceContext.sourceDocumentId, project.documentId)
      generation.accepted = true
      generation.provenance = provenance
      generation.layerId = layer.id
      generation.packagePath = savedPackage.path
      provenanceById.set(layer.id, provenance)
    }
    assert.equal(savedPackage.saved.manifest.preview.status, 'rendered')
    const merged = await decodedImage(
      `data:image/png;base64,${(await savedPackage.saved.readMember('preview/merged.png')).toString('base64')}`,
    )
    assert.equal(merged.dimensions.width, 256)
    assert.equal(merged.dimensions.height, 256)
    assert.equal(merged.dimensions.opaquePixels, 256 * 256)
    await window.getByRole('button', { name: `Close ${project.title}`, exact: true }).click()
    await window.getByRole('tab', { name: 'Home', exact: true }).click()
    await window.getByRole('button', { name: `Open ${project.title}`, exact: true }).click()
    await window.getByRole('tab', { name: project.title, exact: true }).waitFor()
    const reopened = await tab(project)
    assert.equal(reopened.documentId, project.documentId)
    assert.deepEqual(reopened.generationDraft, currentDraft)
    assert.equal(reopened.layers.length, evidence.length)
    const readback = await readIgsPackage(savedPackage.path)
    for (const [layerId, provenance] of provenanceById) {
      assert.deepEqual(
        (await api('getRasterGenerationData', project.id, project.documentId, layerId))
          .generationConfiguration,
        provenance.generationConfiguration,
      )
      assert.deepEqual(
        readback.project.layers.find(({ id }) => id === layerId).generationProvenance,
        provenance,
      )
    }
    assert.equal(await hashFile(savedPackage.path), savedPackage.sha256)
    report.savedPackage = {
      path: savedPackage.path,
      sha256: savedPackage.sha256,
      documentId: project.documentId,
      acceptedLayers: evidence.length,
      lastActualSeedSnapshot: readback.project.lastActualSeedSnapshot,
      mergedPreview: merged.dimensions,
      reopened: true,
    }
    if (adapter.assertComparison) {
      report.comparisons = []
      for (const generation of evidence) {
        const layer = reopened.layers.find(({ id }) => id === generation.layerId)
        assert.ok(layer, 'Every saved generation must retain its own comparison layer.')
        report.comparisons.push(await compare(project, layer, savedPackage.path, generation))
      }
      report.comparison = report.comparisons[0]
    } else report.comparison = await compare(project, reopened.layers[0], savedPackage.path)
    await screenshot('reopened.png')
    assert.equal(accepted.documentId, reopened.documentId)
    await checkpoint()
  }
  async function signalOwnedScope(reason) {
    const observed = await bounds(reason)
    const identity = observed.processIdentities.find(({ pid }) => pid === nativeProcess.pid)
    const group = observed.groups.find(
      ({ ownedScope, pids }) => ownedScope && pids.includes(nativeProcess.pid),
    )
    assert.ok(identity && group, 'SIGKILL requires the exact PID-named verified native scope.')
    const signal = await stopExpiredQualificationProcess({ ...identity, group: group.group })
    assert.equal(signal.signalRequested, true)
    report.nativeSignal = { reason, ...signal }
    await checkpoint()
    report.nativePhysicalExit = await confirmQualificationProcessExit(report.resourceLimitChecks)
    assert.equal(report.nativePhysicalExit.confirmed, true)
    assert.deepEqual(await runtimeUsers(), [])
  }
  async function crash(project, captured, currentDraft) {
    report.crashShadow = await settledDirtyShadow(project, currentDraft)
    let cut
    await expect
      .poll(
        async () => {
          const rows = await queueRows(project)
          assert.ok(rows.every(({ status }) => status !== 'failed'))
          if (rows[0]?.status !== 'completed') return false
          await observeCompleted(
            project,
            captured.admitted[0],
            plan.items[0],
            captured.before,
            captured.portable,
          )
          if (rows[1]?.status !== 'running' || rows[2]?.status !== 'pending') return false
          const children = await runtimeUsers()
          if (!children.length) return false
          assert.equal(
            await receiptFor(rows[1]),
            undefined,
            'Crash cut must precede candidate publication.',
          )
          assert.equal(await receiptFor(rows[2]), undefined)
          cut = { rows, children, at: new Date().toISOString() }
          return true
        },
        { timeout: 600_000, intervals: [100, 250, 500] },
      )
      .toBe(true)
    assert.equal((await api('listGenerationResults', project.id)).lastActualSeed, 0)
    assert.equal((await tab(project)).layers.length, 0)
    assert.deepEqual((await tab(project)).generationDraft, currentDraft)
    report.crashCut = cut
    await checkpoint()
    await signalOwnedScope('intentional-qualified-native-crash')
    const rows = await queueRows(project)
    assert.equal(rows[0].status, 'completed')
    assert.equal(
      rows[1].status,
      'running',
      'A missed crash cut is a failed setup, not a passing recovery case.',
    )
    assert.equal(rows[2].status, 'pending')
    assert.equal(await receiptFor(rows[1]), undefined)
    assert.equal(await receiptFor(rows[2]), undefined)
    const saved = await readIgsPackage(captured.portable.path)
    assert.equal(saved.project.lastActualSeedSnapshot ?? null, null)
    assert.equal(saved.project.layers.length, 0)
    assert.equal(await hashFile(captured.portable.path), captured.portable.sha256)
    report.crash = {
      outcome: 'crash-confirmed',
      projectKey: project.id,
      title: project.title,
      documentId: project.documentId,
      packagePath: captured.portable.path,
      packageSha256: captured.portable.sha256,
      savedSnapshot: null,
      currentDraft,
      rows,
      candidate: report.generations[0],
      physicalExit: report.nativePhysicalExit,
    }
    report.outcome = 'crash-confirmed'
  }
  async function reopenCrashProject() {
    const captured = crashSource.crash
    const project = {
      id: captured.projectKey,
      title: captured.title,
      documentId: captured.documentId,
    }
    assert.equal(await hashFile(captured.packagePath), captured.packageSha256)
    await window.getByRole('button', { name: `Open ${project.title}`, exact: true }).click()
    // Home owns the real recovery decision; do not call a repository or synthesize recovery.
    const recover = window.getByRole('button', { name: 'Recover', exact: true })
    await expect
      .poll(
        async () =>
          (await recover.isVisible()) ||
          (await window.getByRole('tab', { name: project.title, exact: true }).isVisible()),
      )
      .toBe(true)
    if (await recover.isVisible()) await recover.click()
    await window.getByRole('tab', { name: project.title, exact: true }).waitFor()
    const reopened = await tab(project)
    assert.equal(reopened.documentId, project.documentId)
    assert.deepEqual(reopened.layers, [])
    assert.deepEqual(
      reopened.generationDraft,
      captured.currentDraft,
      'Actual Home Recover must restore the committed dirty authoring shadow.',
    )
    const rows = await queueRows(project)
    assert.equal(rows.length, 3)
    for (const [index, row] of rows.entries()) {
      assert.equal(row.frozen_payload_json, captured.rows[index].frozen_payload_json)
      if (index === 0) assert.equal(row.status, 'completed')
      else {
        assert.equal(row.status, 'canceled')
        assert.equal(row.error_code, 'APP_RESTART')
        assert.equal(await receiptFor(row), undefined)
      }
    }
    const results = await api('listGenerationResults', project.id)
    assert.equal(results.candidates.length, 1)
    assert.equal(results.lastActualSeed, 0)
    const candidate = results.candidates[0]
    assert.equal(candidate.candidateId, captured.candidate.candidateId)
    assert.equal(candidate.queueItemId, captured.candidate.queueItemId)
    const pixels = await decodedImage(candidate.imageUrl)
    assert.equal(pixels.dimensions.sha256, captured.candidate.dimensions.sha256)
    assert.equal(pixels.dimensions.pixelSha256, captured.candidate.dimensions.pixelSha256)
    const control = baseline.generations.find(
      ({ frozen }) =>
        JSON.stringify(adapter.normalizeExecutionInputs(frozen)) ===
        JSON.stringify(adapter.normalizeExecutionInputs(captured.candidate.frozen)),
    )
    assert.ok(control, 'Recovered seed0 requires its healthy same-execution control.')
    assert.equal(pixels.dimensions.pixelSha256, control.dimensions.pixelSha256)
    const saved = await readIgsPackage(captured.packagePath)
    assert.equal(saved.project.lastActualSeedSnapshot ?? null, null)
    await addAll(project, 1)
    const accepted = await tab(project)
    const layer = accepted.layers[0]
    assert.ok(layer)
    // Keep genuine recovered pixels/provenance while returning normal target composition to TXT.
    await window.getByRole('button', { name: `Hide ${layer.name}`, exact: true }).click()
    await expect.poll(async () => (await tab(project)).layers[0].visible).toBe(false)
    assert.equal(await hashFile(captured.packagePath), captured.packageSha256)
    assert.equal(
      (await readIgsPackage(captured.packagePath)).project.lastActualSeedSnapshot ?? null,
      null,
    )
    report.recovery = {
      project,
      rows,
      candidateId: candidate.candidateId,
      queueItemId: candidate.queueItemId,
      lastActualSeed: 0,
      portableSnapshot: null,
      recoveredLayerId: layer.id,
      recoveredLayerHidden: true,
      unchangedPackageSha256: captured.packageSha256,
    }
    return { project, recovered: captured.candidate }
  }
  async function preserveInputs() {
    assert.deepEqual(
      await repository.listInstalled(),
      initialCatalog,
      'All nine resources/fourteen versions/defaults must remain unchanged.',
    )
    assertAnimaRegressionCatalog(initialCatalog, reference)
    const rows = await database.db.selectFrom('generation_queue_item').selectAll().execute()
    const restartedIds = new Set(initialUnfinished.map(({ id }) => id))
    for (const original of initialUnfinished) {
      const current = rows.find(({ id }) => id === original.id)
      assert.equal(current.status, 'canceled')
      assert.equal(current.error_code, 'APP_RESTART')
      assert.equal(current.frozen_payload_json, original.frozen_payload_json)
      assert.equal(current.status_sequence, original.status_sequence + 1)
      assert.equal(await receiptFor(current), undefined)
    }
    for (const [id, digest] of initialQueue)
      if (!restartedIds.has(id))
        assert.equal(
          sha256(Buffer.from(JSON.stringify(rows.find((row) => row.id === id)))),
          digest,
          'A prior queue row changed.',
        )
    const cursors = await database.db.selectFrom('generation_seed_cursor').selectAll().execute()
    const mutableProject = fixture.stage === 'reuse' ? crashSource.crash.projectKey : null
    for (const [key, digest] of initialCursors)
      if (key !== mutableProject)
        assert.equal(
          sha256(Buffer.from(JSON.stringify(cursors.find((row) => row.local_project_key === key)))),
          digest,
          'A neighboring seed cursor changed.',
        )
    for (const record of [...managedFiles, ...originalSources])
      assert.deepEqual(await fileSnapshot(record.path, record.sha256), record)
    assert.deepEqual(await workerSnapshot(), workerSources)
    assert.deepEqual(await readJson(path.join(appData, 'runtime/current-runtime.json')), pointer)
    report.catalogReuse = {
      finalResourceCount: 9,
      finalVersionCount: 14,
      newManagedFiles: 0,
      originalRowsUnchanged: true,
      originalManagedFilesUnchanged: true,
      originalSourceFilesUnchanged: true,
      installed43SourcesUnchanged: true,
      neighboringSeedCursorsUnchanged: true,
    }
  }
  async function closeNative() {
    if (!application) return
    if (!report.nativePhysicalExit?.confirmed) {
      if (report.status === 'failed') await signalOwnedScope('failed-qualified-fixture-cleanup')
      else {
        await bounds('before-native-close')
        await application.close()
        report.nativePhysicalExit = await confirmQualificationProcessExit(
          report.resourceLimitChecks,
        )
        assert.deepEqual(await runtimeUsers(), [])
      }
    }
  }

  async function assertReferenceBindings(retained, descriptor, label) {
    assert.deepEqual(retained.bundleSha256, bundleSha256)
    const driver = adapter.entrySource
    assert.ok(
      Object.hasOwn(retained.sourceSha256, 'scripts/installed-dynamic-batch-driver.mjs'),
      'Historical reports from before the shared-driver extraction require a separately qualified baseline.',
    )
    const { [driver]: prior, ...priorDependencies } = retained.sourceSha256
    const { [driver]: current, ...currentDependencies } = sourceSha256
    assert.deepEqual(priorDependencies, currentDependencies)
    if (prior !== current) {
      // The UI qualification client is not the numerical producer. Preserve its
      // exact earlier source; all oracles/dependencies, bundle and native inputs
      // must still match independently. Never rewrite a retained report's hashes.
      const snapshot = await fileSnapshot(
        path.join(path.dirname(descriptor.reportPath), 'qualification-driver.mjs'),
        prior,
      )
      assert.ok(
        snapshot.path.startsWith(
          path.join(homedir(), '.codex/artifacts/imagegen-studio') + path.sep,
        ),
      )
      report.referenceDriverSources ??= {}
      report.referenceDriverSources[label] = {
        retained: snapshot,
        currentSha256: current,
        boundary:
          'Only the UI qualification driver differs; numerical oracles, native dependencies, application bundle and full same-execution inputs remain bound.',
      }
    }
  }

  try {
    database = openAppDatabase(appData, path.resolve('src/main/db/migrations'))
    repository = new ModelRepository(database.db)
    initialCatalog = await repository.listInstalled()
    // Historical source fixtures intentionally omit local identities. Bind every one of
    // the fourteen strict descriptors from this retained real catalog before its guard.
    for (const key of [
      ...noiseModelKeys,
      ...componentKeys,
      'externalVaeEncoderControl',
      'illustriousLoraSecond',
      ...animaRegressionModelKeys,
    ]) {
      const matches = initialCatalog.flatMap((resource) =>
        resource.versions
          .filter((version) => version.file?.sha256 === reference[key].sha256)
          .map((version) => ({ resource, version })),
      )
      assert.equal(matches.length, 1, 'Every exact source must already have one installed version.')
      const { resource, version } = matches[0]
      reference[key].installed = {
        resourceId: resource.id,
        versionId: version.id,
        managedPath: version.file.managedPath,
      }
    }
    assertAnimaRegressionCatalog(initialCatalog, reference)
    assert.equal(initialCatalog.length, 9)
    assert.equal(initialCatalog.flatMap(({ versions }) => versions).length, 14)
    const entryQueue = await database.db.selectFrom('generation_queue_item').selectAll().execute()
    initialUnfinished = entryQueue.filter(({ status }) => ['pending', 'running'].includes(status))
    for (const row of initialUnfinished)
      assert.equal(
        await receiptFor(row),
        undefined,
        'This finite gate requires unpublished restart inputs.',
      )
    initialQueue = new Map(
      entryQueue.map((row) => [row.id, sha256(Buffer.from(JSON.stringify(row)))]),
    )
    initialCursors = new Map(
      (await database.db.selectFrom('generation_seed_cursor').selectAll().execute()).map((row) => [
        row.local_project_key,
        sha256(Buffer.from(JSON.stringify(row))),
      ]),
    )
    workerSources = await workerSnapshot()
    assert.deepEqual(
      Object.keys(workerSources).sort(),
      Object.keys(workerBaseline.workerFiles).sort(),
    )
    report.sourceDelta = []
    for (const [relative, observed] of Object.entries(workerSources)) {
      const original = workerBaseline.workerFiles[relative]
      if (fixture.mutation?.module === relative) {
        assert.equal(original.sha256, fixture.mutation.originalSha256)
        assert.equal(observed.sha256, fixture.mutation.mutatedSha256)
        report.sourceDelta.push({
          module: relative,
          original,
          actual: { bytes: observed.size, sha256: observed.sha256 },
          declaredMutation: fixture.mutation,
        })
      } else {
        assert.equal(
          observed.sha256,
          original.sha256,
          `Undeclared installed worker change: ${relative}`,
        )
        assert.equal(observed.size, original.bytes)
      }
    }
    assert.equal(report.sourceDelta.length, fixture.mutation ? 1 : 0)
    managedFiles = []
    for (const resource of initialCatalog)
      for (const version of resource.versions) {
        const file = await fileSnapshot(version.file.managedPath, version.file.sha256)
        assert.equal(file.size, version.file.sizeBytes)
        managedFiles.push(file)
      }
    originalSources = []
    for (const key of adapter.originalSourceKeys(fixture)) {
      const file = await fileSnapshot(reference[key].path, reference[key].sha256)
      assert.equal(file.size, reference[key].byteSize)
      originalSources.push({ ...file })
    }
    if (fixture.baseline) {
      baseline = await readPinnedJson(fixture.baseline)
      assert.equal(baseline.status, 'passed')
      assert.equal(baseline.stage, 'iteration')
      assert.equal(baseline.profile, fixture.profile)
      assert.equal(baseline.objective, fixture.objective)
      assert.equal(baseline.nativePhysicalExit?.confirmed, true)
      assert.equal(baseline.appData, appData)
      assert.equal(baseline.runtimeId, pointer.runtimeId)
      await assertReferenceBindings(baseline, fixture.baseline, 'baseline')
      report.baseline = fixture.baseline
    }
    if (fixture.crashSource) {
      crashSource = await readPinnedJson(fixture.crashSource)
      assert.equal(crashSource.status, 'passed')
      assert.equal(crashSource.stage, 'crash')
      assert.equal(crashSource.profile, fixture.profile)
      assert.equal(crashSource.objective, fixture.objective)
      assert.equal(crashSource.outcome, 'crash-confirmed')
      assert.equal(crashSource.nativePhysicalExit?.confirmed, true)
      assert.equal(crashSource.appData, appData)
      assert.equal(crashSource.runtimeId, pointer.runtimeId)
      await assertReferenceBindings(crashSource, fixture.crashSource, 'crashSource')
      report.crashSource = fixture.crashSource
    }
    // All identity/precondition checks precede first evidence publication or native launch.
    await canonicalDirectory(path.dirname(fixture.artifacts))
    try {
      await mkdir(fixture.artifacts, { mode: 0o700 })
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
    await canonicalDirectory(fixture.artifacts)
    reportHandle = await open(path.join(fixture.artifacts, 'report.json'), 'wx', 0o600)
    report.entry = {
      catalog: initialCatalog,
      priorQueueRows: [...initialQueue].map(([id, rowSha256]) => ({ id, rowSha256 })),
      priorUnfinishedQueueRows: initialUnfinished,
      priorSeedCursors: [...initialCursors].map(([localProjectKey, rowSha256]) => ({
        localProjectKey,
        rowSha256,
      })),
      installedWorkerRoot: workerRoot,
      installedWorkerSources: workerSources,
      managedFiles,
      originalSources,
    }
    await stage('Canonical installed runtime/catalog/source/bundle preconditions verified')
    await launch()
    let project,
      extra = []
    if (fixture.stage === 'reuse') {
      const recovered = await reopenCrashProject()
      project = recovered.project
      extra = [recovered.recovered]
      report.recoveredGeneration = recovered.recovered
    } else project = await createProject()
    await author(project, plan)
    report.authoredDraft = structuredClone((await tab(project)).generationDraft)
    report.project = project
    if (fixture.stage === 'crash') {
      const saved = await save(project)
      assert.equal(saved.saved.project.lastActualSeedSnapshot ?? null, null)
      assert.equal(saved.saved.project.layers.length, 0)
      report.savedPrecondition = { path: saved.path, sha256: saved.sha256, snapshot: null }
    }
    const captured = await admit(project)
    const currentDraft = await mutateCurrentAuthoring(project)
    report.currentDraftAfterAdmission = currentDraft
    for (const row of captured.admitted)
      assert.equal(
        (await queueRows(project)).find(({ id }) => id === row.id).frozen_payload_json,
        row.frozen_payload_json,
      )
    if (fixture.stage === 'crash') await crash(project, captured, currentDraft)
    else {
      await awaitCompletions(project, captured)
      await addAll(project, plan.expectedCompletions)
      await verifySaved(project, currentDraft, extra)
      report.outcome = 'finite-accepted-saved-reopened'
    }
    assert.deepEqual(report.pageErrors, [])
    await closeNative()
    await preserveInputs()
    report.summary = {
      finiteCompletions: report.generations.length,
      actualAdmissions: report.admissions.length,
      acceptedLayers: fixture.stage === 'crash' ? 0 : report.savedPackage.acceptedLayers,
      crashConfirmed: fixture.stage === 'crash',
      fullMvpClaim: false,
      randomClaim: false,
      uint32WrapClaim: false,
      max32InferenceClaim: false,
    }
    report.status = 'passed'
    await check(
      'Finite installed dynamic-batch stage completed with exact preserved dependencies',
      report.summary,
    )
  } catch (error) {
    report.status = 'failed'
    report.error = String(error.stack ?? error)
    report.summary = {
      finiteCompletions: report.generations.length,
      actualAdmissions: report.admissions.length,
      acceptedLayers: report.generations.filter(({ accepted }) => accepted).length,
      fullMvpClaim: false,
    }
    await checkpoint()
    throw error
  } finally {
    const pendingFailure = report.status === 'failed'
    const failures = []
    const finalize = async (name, use) => {
      try {
        await use()
      } catch (error) {
        failures.push(error)
        report.cleanupErrors ??= []
        report.cleanupErrors.push({ name, error: String(error.stack ?? error) })
        report.status = 'failed'
      }
    }
    await finalize('native physical closure', closeNative)
    await finalize('database close', async () => {
      if (database) await database.close()
    })
    await finalize('native log close', async () => {
      if (mainLog)
        await new Promise((resolve, reject) => {
          mainLog.once('error', reject)
          mainLog.end(resolve)
        })
    })
    await finalize('final evidence', async () => {
      await checkpoint()
      if (reportHandle) await reportHandle.close()
    })
    if (!pendingFailure && failures.length) throw failures[0]
  }
}
