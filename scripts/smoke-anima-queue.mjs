/** Built Electron/preload/IPC/SQLite queue details; tiny exact model files are fixtures, no ML. */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { _electron as electron, expect } from '@playwright/test'

import { openAppDatabase } from '../src/main/db/database.ts'
import { prepareAnimaGenerationBatch } from '../src/main/projects/anima-generation-batch.ts'
import { withAnimaGenerationBatchRequests } from '../src/main/projects/anima-generation-request.ts'
import { GenerationQueueRepository } from '../src/main/projects/generation-queue.ts'
import { GenerationStagingRepository } from '../src/main/projects/generation-staging.ts'
import { localProjectRecoveryKey } from '../src/main/projects/project-identity.ts'
import { ProjectSession } from '../src/main/projects/project-session.ts'
import {
  ANIMA_BATCH_READY,
  withAnimaBatchFixture,
} from '../src/main/projects/test-fixtures/anima-batch.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'

assert.equal(process.argv.length, 2)
const artifacts = path.resolve(
  process.env.IMAGEGEN_ANIMA_QUEUE_ARTIFACTS ??
    mkdtempSync(path.join(os.tmpdir(), 'igs-anima-queue-evidence-')),
)
mkdirSync(artifacts, { recursive: true, mode: 0o700 })
const root = mkdtempSync(path.join(os.tmpdir(), 'igs-anima-queue-smoke-'))
const dataRoot = path.join(root, 'data', 'imagegen-studio')
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const sourceFiles = [
  'scripts/smoke-anima-queue.mjs',
  'src/renderer/components/GenerationQueueManager.vue',
  'src/shared/projects/generation-queue-manager.ts',
  'src/main/projects/generation-queue.ts',
  'src/main/projects/anima-queued-generation.ts',
  'src/shared/projects/anima-sampling-method.ts',
]
const hashes = (files) =>
  Object.fromEntries(files.map((file) => [file, digest(readFileSync(file))]))
const methods = [
  ['euler', 'Euler'],
  ['heun', 'Heun'],
  ['dpmpp_2m', 'DPM++ 2M'],
  ['dpmpp_2m_sde', 'DPM++ 2M SDE'],
  ['er_sde', 'ER-SDE'],
  ['lcm', 'LCM'],
]
const report = {
  boundary:
    'Built renderer → native preload/IPC → actual SQLite frozen queue DTO. Real compiler, queue admission and canceled rows are prepared preconditions; exact-file resolver supplies tiny files. No public Anima Generate, trained weights, CUDA, runtime qualification or accepted provenance claim. T3 preview_open returned available:false; native Electron also exercises IPC unavailable to an HTTP tab.',
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceSha256: hashes(sourceFiles),
  bundleSha256: hashes([
    'dist/main/main.cjs',
    'dist/preload/preload.cjs',
    'dist/renderer/index.html',
    ...readdirSync('dist/renderer/assets')
      .filter((name) => /\.(?:js|css)$/.test(name))
      .map((name) => `dist/renderer/assets/${name}`),
  ]),
  pageErrors: [],
  checks: [],
  screenshots: [],
}
let application, window
try {
  await withAnimaBatchFixture(async (fixture) => {
    const workspaces = path.join(dataRoot, 'workspaces', 'Uncategorized')
    mkdirSync(workspaces, { recursive: true })
    const project = await ProjectSession.create(
      path.join(workspaces, 'Anima queue.igs'),
      'Anima queue',
      { placeholdersDir: path.resolve('dist/main/placeholders'), scratchDir: fixture.scratch },
      fixture.prepared.context.bbox,
    )
    fixture.prepared.context.documentId = project.document.documentId
    fixture.prepared.context.documentRevision = project.document.documentRevision
    // One concrete pair per method; the batch fixture ordinarily expands a 2 × 2 prompt matrix.
    fixture.prepared.context.prompts = { positive: '(cat:2)', negative: '(bad:0.5)' }
    fixture.prepared.context.generationDraft.positivePrompt.text = '(cat:2)'
    fixture.prepared.context.generationDraft.negativePrompt.text = '(bad:0.5)'
    const packageSha256 = digest(readFileSync(project.filePath))
    const database = openAppDatabase(dataRoot, path.resolve('src/main/db/migrations'))
    const ids = []
    try {
      const queue = new GenerationQueueRepository(database.db, dataRoot)
      const staging = new GenerationStagingRepository(database.db, dataRoot)
      await queue.recoverAfterRestart()
      await staging.recoverAfterRestart()
      for (const [method] of methods) {
        fixture.prepared.context.sampling.animaMethod = method
        fixture.prepared.context.generationDraft.sampling.animaMethod = method
        const preparedBatch = prepareAnimaGenerationBatch({
          iterations: 1,
          prepared: fixture.prepared,
        })
        const stagingSessionId = randomUUID()
        const items = await withAnimaGenerationBatchRequests({
          modelService: fixture.modelService,
          prepared: preparedBatch,
          ready: ANIMA_BATCH_READY,
          scratchBasePath: fixture.scratch,
          use: (requests) =>
            queue.enqueuePreparedAnimaGenerationBatch({
              preparedBatch,
              requests,
              projectPath: project.filePath,
              stagingSessionId,
              preflight: (entries) =>
                staging.preflightBatchCapacity({
                  entries,
                  localProjectKey: localProjectRecoveryKey(project.filePath),
                  projectPath: project.filePath,
                  stagingSessionId,
                }),
            }),
        })
        await queue.cancel(items[0].id, items[0].statusSequence)
        ids.push(items[0].id)
      }
    } finally {
      await database.close()
    }
    const environment = {
      ...process.env,
      XDG_DATA_HOME: path.join(root, 'data'),
      XDG_CACHE_HOME: path.join(root, 'cache'),
      XDG_CONFIG_HOME: path.join(root, 'config'),
    }
    delete environment.ELECTRON_RUN_AS_NODE
    delete environment.IMAGEGEN_DEV_SERVER_URL
    application = await electron.launch({ args: ['.'], cwd: process.cwd(), env: environment })
    window = await application.firstWindow()
    await isolateNativeSmokeWindow(application)
    window.on('pageerror', (error) => report.pageErrors.push(error.message))
    await expect(
      window.getByRole('button', { name: 'Open Queue Manager', exact: true }),
    ).toBeVisible()
    const nativePage = await window.evaluate(() => window.api.projects.getGenerationQueue())
    assert.equal(nativePage.ok, true)
    assert.equal(nativePage.value.items.length, methods.length)
    for (let i = 0; i < methods.length; i++) {
      const entry = nativePage.value.items.find((row) => row.id === ids[i])
      assert.equal(entry.operation, 'anima-txt2img')
      assert.equal(entry.details.sampling.animaMethod, methods[i][0])
      assert.equal(entry.details.sampling.seed, 0)
      assert.equal('sampler' in entry.details.sampling, false)
      assert.equal('scheduler' in entry.details.sampling, false)
      assert.equal('predictionType' in entry.details.sampling, false)
    }
    await window.getByRole('button', { name: 'Open Queue Manager', exact: true }).click()
    const manager = window.getByRole('dialog', { name: 'Queue Manager', exact: true })
    const details = manager.locator('[data-testid="queue-job-details"]')
    for (let i = 0; i < methods.length; i++) {
      await manager.locator(`[data-testid="queue-job-row"][data-job-id="${ids[i]}"]`).click()
      await expect(details.getByText('Anima method', { exact: true })).toBeVisible()
      await expect(details.getByText(methods[i][1], { exact: true })).toBeVisible()
      await expect(details.getByText('Sampler', { exact: true })).toHaveCount(0)
      await expect(details.getByText('Scheduler', { exact: true })).toHaveCount(0)
      await expect(details.getByText('Prediction', { exact: true })).toHaveCount(0)
    }
    for (const [width, height] of [
      [1380, 900],
      [900, 620],
    ]) {
      await application.evaluate(
        ({ BrowserWindow }, size) =>
          BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height),
        { width, height },
      )
      await expect
        .poll(() => window.evaluate(() => [innerWidth, innerHeight]))
        .toEqual([width, height])
      await expect(details.getByText('LCM', { exact: true })).toBeVisible()
      await details.getByText('Anima method', { exact: true }).scrollIntoViewIfNeeded()
      await expect(details.getByText('Anima method', { exact: true })).toBeInViewport()
      await expect(details.getByText('LCM', { exact: true })).toBeInViewport()
      assert.equal(
        await details.evaluate((element) => element.scrollWidth > element.clientWidth),
        false,
      )
      const screenshot = path.join(artifacts, `native-anima-queue-${width}x${height}.png`)
      await window.screenshot({ path: screenshot })
      report.screenshots.push(screenshot)
    }
    assert.equal(digest(readFileSync(project.filePath)), packageSha256)
    assert.deepEqual(report.pageErrors, [])
    assert.deepEqual(hashes(sourceFiles), report.sourceSha256)
    report.checks.push(
      'All six native method labels arrived through Main IPC and rendered without SD fields; zero seed and frozen source preserved, two viewport screenshots, no horizontal overflow, .igs unchanged.',
    )
    await application.close()
    application = null
  })
  report.status = 'passed'
  console.log(report.checks[0])
} catch (error) {
  report.status = 'failed'
  report.error = String(error)
  if (window && !window.isClosed())
    await window.screenshot({ path: path.join(artifacts, 'failure.png') }).catch(() => {})
  throw error
} finally {
  await application?.close().catch(() => {})
  writeFileSync(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2))
  rmSync(root, { recursive: true, force: true })
}
