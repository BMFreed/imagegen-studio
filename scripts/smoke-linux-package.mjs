/**
 * Actual unsigned Linux AppImage -> fused packaged Main -> sandboxed preload -> SQLite/Project.
 * Invoke launcher c267bdb439519216b277a7a8c6ad408b9d79efce supplies AppImage packaging; Studio's
 * existing Main owns storage, explicit Create, runtime refusal and normal close. Chromium CDP does
 * not enable the fused-off Node inspector. Extract-and-run is an explicit local qualification mode:
 * this does not qualify FUSE installation, shipping trust, updates, native ML or full MVP
 * acceptance. All persistent files belong to this fresh owned fixture.
 */
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  unlink,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { chromium, expect } from '@playwright/test'

import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
  stopExpiredQualificationProcess,
} from './qualification-resource-limits.mjs'

const execute = promisify(execFile)
const trainedFixture = process.env.IMAGEGEN_LINUX_PACKAGE_TRAINED_FIXTURE
const nativeMemoryGiB = trainedFixture ? 12 : 4
const nativeDeadlineSeconds = trainedFixture ? 420 : 120
const boundedExecute = (command, args, options) =>
  execute(
    command,
    args.map((value) => (value === 'MemoryMax=12G' ? `MemoryMax=${nativeMemoryGiB}G` : value)),
    options,
  )
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const supplied = process.env.IMAGEGEN_LINUX_PACKAGE_ARTIFACTS
const suppliedPackage = process.env.IMAGEGEN_LINUX_PACKAGE_APPIMAGE
const installedEngineReport = process.env.IMAGEGEN_LINUX_PACKAGE_INSTALLED_ENGINE_REPORT
const historicalFixture = process.env.IMAGEGEN_LINUX_PACKAGE_HISTORICAL_FIXTURE
assert.ok(
  trainedFixture === undefined || (installedEngineReport && historicalFixture === undefined),
)
const updateCheckMode = process.env.IMAGEGEN_LINUX_PACKAGE_UPDATE_CHECK
assert.ok(
  updateCheckMode === undefined ||
    updateCheckMode === 'unavailable' ||
    updateCheckMode === 'feed' ||
    updateCheckMode === 'download' ||
    updateCheckMode === 'signed',
)
const updateReleaseFixturesPath = process.env.IMAGEGEN_LINUX_PACKAGE_UPDATE_RELEASE_FIXTURES
assert.ok(updateCheckMode === 'signed' || updateReleaseFixturesPath === undefined)
const updateFeedPortText = process.env.IMAGEGEN_LINUX_PACKAGE_UPDATE_FEED_PORT
assert.ok(updateFeedPortText === undefined || /^\d+$/.test(updateFeedPortText))
const updateFeedPort = updateFeedPortText === undefined ? 0 : Number(updateFeedPortText)
assert.ok(Number.isSafeInteger(updateFeedPort) && updateFeedPort >= 0 && updateFeedPort <= 65535)
const canonicalAbsolute = (value) =>
  typeof value === 'string' && path.isAbsolute(value) && path.resolve(value) === value
assert.ok(canonicalAbsolute(supplied), 'Supply a canonical IMAGEGEN_LINUX_PACKAGE_ARTIFACTS.')
assert.ok(canonicalAbsolute(suppliedPackage), 'Supply a canonical IMAGEGEN_LINUX_PACKAGE_APPIMAGE.')
if (historicalFixture !== undefined) {
  assert.ok(
    canonicalAbsolute(historicalFixture) && installedEngineReport,
    'A historical package fixture requires a canonical descriptor and an installed engine report.',
  )
}
if (updateCheckMode === 'signed') {
  assert.ok(
    canonicalAbsolute(updateReleaseFixturesPath),
    'Supply canonical IMAGEGEN_LINUX_PACKAGE_UPDATE_RELEASE_FIXTURES for signed admission.',
  )
}
const root = supplied
const appImage = suppliedPackage
const ownedRunRoot = path.join(artifactRoot, 'runs')
function strictDescendant(parent, child) {
  return canonicalAbsolute(child) && child.startsWith(`${parent}${path.sep}`)
}
async function installedEngineFixture() {
  if (!installedEngineReport) return null
  assert.equal(updateCheckMode, undefined, 'Use a separate application update fixture.')
  assert.ok(strictDescendant(ownedRunRoot, installedEngineReport))
  assert.equal(await realpath(installedEngineReport), installedEngineReport)
  const reportStat = await lstat(installedEngineReport)
  assert.ok(reportStat.isFile() && reportStat.size <= 8 * 1024 * 1024)
  const reportBefore = await identity(installedEngineReport)
  const report = JSON.parse(await readFile(installedEngineReport, 'utf8'))
  assert.deepEqual(await identity(installedEngineReport), reportBefore)
  const run = path.dirname(installedEngineReport)
  assert.ok(strictDescendant(ownedRunRoot, run))
  assert.ok(strictDescendant(run, root), 'Package evidence must stay inside the engine run.')
  assert.equal(report.outcome, 'PASS')
  assert.equal(report.qualification, 'actual-signed-full-engine-install-native-qualification')
  assert.equal(report.fullProfileQualified.nativeLamaComputeQualified, true)
  assert.equal(report.assembledSlots.length, 1)
  assert.ok(strictDescendant(path.join(run, 'payloads'), report.payloadRoot))
  const dataRoot = path.join(report.payloadRoot, 'data', 'imagegen-studio')
  assert.equal(report.roots.appDataDir, dataRoot)
  assert.deepEqual(report.packagedAppData, {
    dataRoot,
    xdgDataHome: path.dirname(dataRoot),
  })
  assert.equal(await realpath(dataRoot), dataRoot)
  const runtimeId = report.assembledSlots[0].runtimeId
  assert.match(runtimeId, /^release-[0-9a-f-]{36}$/)
  assert.equal(report.activatedPointer.runtimeId, runtimeId)
  assert.equal(report.fullProfileQualified.runtimeId, runtimeId)
  assert.equal(report.reopenedStatus.runtimeId, runtimeId)
  const pointer = path.join(dataRoot, 'runtime', 'current-runtime.json')
  assert.equal(pointer, report.roots.pointerFile)
  const provenance = path.join(
    dataRoot,
    'runtime',
    'environments',
    runtimeId,
    'runtime-installation.json',
  )
  assert.equal(provenance, report.installationProvenance.path)
  for (const file of [pointer, provenance]) {
    assert.equal(await realpath(file), file)
    assert.ok((await lstat(file)).isFile())
  }
  assert.deepEqual(JSON.parse(await readFile(pointer, 'utf8')), report.activatedPointer)
  const provenanceBefore = await identity(provenance)
  assert.equal(provenanceBefore.sha256, report.installationProvenance.sha256)
  const installation = JSON.parse(await readFile(provenance, 'utf8'))
  const workerRoot = report.installedInspection.workerRoot
  assert.ok(strictDescendant(path.dirname(provenance), workerRoot))
  assert.equal(await realpath(workerRoot), workerRoot)
  assert.deepEqual(installation.workerFiles, report.installedInspection.workerFiles)
  const workerMembers = Object.entries(installation.workerFiles)
  assert.ok(workerMembers.length > 0 && workerMembers.length <= 256)
  const workerInputs = await Promise.all(
    workerMembers.map(async ([name, witness]) => {
      const file = path.join(workerRoot, name)
      assert.ok(!path.isAbsolute(name) && path.normalize(name) === name)
      assert.ok(strictDescendant(workerRoot, file))
      assert.equal(await realpath(file), file)
      assert.ok((await lstat(file)).isFile())
      const actual = await identity(file)
      assert.equal(actual.sizeBytes, witness.bytes)
      assert.equal(actual.sha256, witness.sha256)
      return actual
    }),
  )
  if (historicalFixture === undefined && trainedFixture === undefined) {
    await assert.rejects(lstat(path.join(dataRoot, 'database', 'app.sqlite')), { code: 'ENOENT' })
  }
  return {
    dataRoot,
    run,
    runtimeId,
    pythonExecutable: report.activatedPointer.pythonExecutable,
    inputs: [reportBefore, await identity(pointer), provenanceBefore, ...workerInputs],
  }
}
const engine = await installedEngineFixture()
const historical =
  historicalFixture === undefined
    ? null
    : await import('./fixtures/packaged-installed-engine-upgrade.mjs')
const history = await historical?.readHistoricalUpgrade({
  filename: historicalFixture,
  engine,
  outputRoot: root,
  appImage,
  identity,
})
const trainedProfile =
  trainedFixture === undefined
    ? null
    : await import('./fixtures/packaged-installed-trained-generation.mjs')
const trained = await trainedProfile?.readTrainedGeneration({
  filename: trainedFixture,
  engine,
  outputRoot: root,
  appImage,
  identity,
})
const relative = path.relative(artifactRoot, root)
assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
assert.equal(await realpath(artifactRoot), artifactRoot)
assert.equal(await realpath(path.dirname(root)), path.dirname(root))
try {
  await mkdir(root, { mode: 0o700 })
} catch (error) {
  if (error.code !== 'EEXIST') throw error
}
assert.ok((await lstat(root)).isDirectory() && !(await lstat(root)).isSymbolicLink())
assert.equal(await realpath(root), root)
assert.deepEqual(await readdir(root), [], 'Use a fresh empty fixture, never live app data.')
assert.equal(await realpath(appImage), appImage)
assert.ok((await lstat(appImage)).isFile() && !(await lstat(appImage)).isSymbolicLink())

const cwd = path.join(root, 'empty-cwd')
const appData = engine?.dataRoot ?? path.join(root, 'data/imagegen-studio')
const profile = path.join(root, 'chrome-profile')
for (const name of [
  cwd,
  profile,
  path.join(root, 'config'),
  path.join(root, 'data'),
  path.join(root, 'cache'),
]) {
  await mkdir(name, { recursive: true })
}
assert.ok(cwd !== repo && !cwd.startsWith(`${repo}/`), 'Native cwd must be outside the checkout.')
const environment = {
  ...process.env,
  APPIMAGE_EXTRACT_AND_RUN: '1',
  // AppImageLauncher's binfmt integration can otherwise move a test artifact
  // and install host desktop entries before Electron sees isolated XDG paths.
  APPIMAGELAUNCHER_DISABLE: '1',
  XDG_CONFIG_HOME: path.join(root, 'config'),
  XDG_DATA_HOME: path.dirname(appData),
  XDG_CACHE_HOME: path.join(root, 'cache'),
}
for (const key of [
  'ELECTRON_RUN_AS_NODE',
  'IMAGEGEN_DEV_SERVER_URL',
  'IMAGEGEN_TEST_IMAGE_WORKER',
  'NODE_OPTIONS',
])
  delete environment[key]

async function identity(filename) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filename)) hash.update(chunk)
  return { path: filename, sizeBytes: (await lstat(filename)).size, sha256: hash.digest('hex') }
}

async function bounded(promise, milliseconds, label) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} exceeded ${milliseconds} ms.`)),
          milliseconds,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

const sourcePaths = [
  fileURLToPath(import.meta.url),
  path.join(repo, 'scripts/qualification-resource-limits.mjs'),
]
const migrationFile = path.join(repo, 'src/main/db/migrations/0030_model_reference_identity.sql')
const srgbProfile = path.join(repo, 'worker-python/src/imagegen_worker/srgb.icc')
if (history) {
  sourcePaths.push(
    migrationFile,
    srgbProfile,
    ...[
      'application-state-upgrade-fixture.mjs',
      'application-state-upgrade-native.mjs',
      'packaged-installed-engine-upgrade.mjs',
    ].map((file) => path.join(repo, 'scripts/fixtures', file)),
  )
}
if (trained)
  sourcePaths.push(path.join(repo, 'scripts/fixtures/packaged-installed-trained-generation.mjs'))
if (updateCheckMode) sourcePaths.push(path.join(repo, 'scripts/application-update-check-smoke.mjs'))
const sourceBefore = await Promise.all(sourcePaths.map(identity))
const packageBefore = await identity(appImage)
const projectTitle = 'Package qualification'
const records = []
const lifetimes = []
const gpuObservers = new Map()
let projectId
let firstTab
let failed
let applicationUpdateSmoke
let applicationUpdateResult

async function writeJson(name, value) {
  await writeFile(path.join(root, name), `${JSON.stringify(value, null, 2)}\n`)
}

function assertAggregate(checks) {
  const groups = new Map()
  const ownedScopes = new Set(
    checks.flatMap(({ groups }) =>
      groups.filter(({ ownedScope }) => ownedScope).map(({ group }) => group),
    ),
  )
  for (const check of checks) {
    for (const group of check.groups) {
      assert.equal(group.swapMax, '0')
      const limit = trained && !ownedScopes.has(group.group) ? 2 : nativeMemoryGiB
      assert.ok(
        /^\d+$/.test(group.memoryMax) && BigInt(group.memoryMax) <= BigInt(limit) * 1024n ** 3n,
      )
      groups.set(group.group, BigInt(group.memoryMax))
    }
  }
  const aggregate = [...groups.values()].reduce((total, value) => total + value, 0n)
  assert.ok(
    aggregate <= BigInt(trained ? 14 : 8) * 1024n ** 3n,
    'Observed native groups exceed the qualification aggregate bound.',
  )
  return { memoryMaxBytes: String(aggregate), groups: [...groups.keys()], zeroSwap: true }
}

function observeGpuWorker(state) {
  const scope = state.aggregateLimits.groups.find((group) =>
    group.endsWith(`-${state.mainPid}.scope`),
  )
  assert.ok(scope, 'A trained job requires its bounded native scope before Generate.')
  state.gpuSamples = []
  let pending
  const sample = async () => {
    const { stdout } = await execute(
      '/usr/bin/nvidia-smi',
      ['--query-compute-apps=pid,used_gpu_memory', '--format=csv,noheader,nounits'],
      { timeout: 2000 },
    )
    for (const line of stdout.split('\n')) {
      const match = /^\s*(\d+),\s*(\d+)\s*$/.exec(line)
      if (!match) continue
      const pid = Number(match[1])
      try {
        const cgroup = (await readFile(`/proc/${pid}/cgroup`, 'utf8')).trim()
        if (cgroup !== `0::${scope}`) continue
        const args = (await readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0')
        if (!args.includes('imagegen_worker.owned_inference')) continue
        const stat = await readFile(`/proc/${pid}/stat`, 'utf8')
        state.gpuSamples.push({
          pid,
          startTicks: stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19],
          group: scope,
          gpuMiB: Number(match[2]),
        })
      } catch (error) {
        if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error
      }
    }
  }
  const timer = setInterval(() => {
    pending ??= sample()
      .catch((error) => {
        state.gpuObserverError = error.message
      })
      .finally(() => {
        pending = undefined
      })
  }, 1000)
  gpuObservers.set(state, async () => {
    clearInterval(timer)
    await pending
  })
}

async function discoverEndpoint(state) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (state.endpoint) return state.endpoint
    for (const filename of [
      path.join(appData, 'DevToolsActivePort'),
      path.join(profile, 'DevToolsActivePort'),
    ]) {
      try {
        const [port, route] = (await readFile(filename, 'utf8')).trim().split('\n')
        if (/^\d+$/.test(port) && Number(port) > 0 && route?.startsWith('/devtools/browser/')) {
          return `ws://127.0.0.1:${port}${route}`
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
    if (state.closed)
      throw new Error(`AppImage exited before CDP startup: ${JSON.stringify(state.closed)}.`)
    await delay(100)
  }
  throw new Error('Packaged Chromium did not expose its loopback CDP endpoint within 30 seconds.')
}

async function connect(state) {
  state.browser ??= await chromium.connectOverCDP(await discoverEndpoint(state), {
    timeout: 10_000,
  })
  if (!state.mainPid) {
    const session = await state.browser.newBrowserCDPSession()
    try {
      const info = await session.send('SystemInfo.getProcessInfo')
      const mains = info.processInfo.filter((entry) => entry.type === 'browser')
      assert.equal(mains.length, 1, 'Observe exactly one packaged browser Main process.')
      state.mainPid = mains[0].id
      assert.ok(Number.isSafeInteger(state.mainPid) && state.mainPid > 1)
      state.browserVersion = await session.send('Browser.getVersion')
    } finally {
      await session.detach()
    }
    if (trained) {
      const expectedScope = `app-imagegen\\x2dstudio-${state.mainPid}.scope`
      await expect
        .poll(
          async () => {
            const cgroup = (await readFile(`/proc/${state.mainPid}/cgroup`, 'utf8')).trim()
            return path.posix.basename(cgroup)
          },
          { timeout: 30_000 },
        )
        .toBe(expectedScope)
    }
    state.checks.push(
      await boundQualificationProcess(state.mainPid, {
        deadlineSeconds: nativeDeadlineSeconds,
        execute: boundedExecute,
      }),
    )
    state.aggregateLimits = assertAggregate(state.checks)
  }
  const deadline = Date.now() + 15_000
  while (!state.page && Date.now() < deadline) {
    state.page = state.browser
      .contexts()
      .flatMap((context) => context.pages())
      .find(
        (page) =>
          page.url().startsWith('file:') && page.url().endsWith('/dist/renderer/index.html'),
      )
    if (!state.page) await delay(100)
  }
  assert.ok(state.page, 'Find the actual packaged file renderer, without a source/dev server.')
  state.page.setDefaultTimeout(15_000)
  state.page.on('pageerror', (error) => state.pageErrors.push(error.message))
  return state.page
}

async function launch(name) {
  // Chromium leaves this discovery file after a normal close. The previous
  // process has settled before launch; never connect a new lifetime to its port.
  for (const directory of [appData, profile]) {
    await unlink(path.join(directory, 'DevToolsActivePort')).catch((error) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
  const state = { name, checks: [], pageErrors: [], stdout: '', stderr: '', forcedCleanup: false }
  lifetimes.push(state)
  if (history || trained) {
    await writeFile(
      path.join(root, `${name}.launch-intent.json`),
      JSON.stringify({ name }) + '\n',
      {
        flag: 'wx',
        mode: 0o600,
      },
    )
  }
  state.child = spawn(
    appImage,
    [
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--ozone-platform=x11',
    ],
    { cwd, env: environment, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  state.wrapperPid = state.child.pid
  state.closePromise = new Promise((resolve) => {
    state.child.once('close', (code, signal) => {
      state.closed = { code, signal }
      resolve(state.closed)
    })
    state.child.once('error', (error) => {
      state.spawnError = error.message
    })
  })
  for (const streamName of ['stdout', 'stderr']) {
    state.child[streamName].on('data', (chunk) => {
      state[streamName] = (state[streamName] + chunk.toString()).slice(-4 * 1024 * 1024)
      const match = state.stderr.match(
        /DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[^\s]+)/,
      )
      if (match) state.endpoint = match[1]
    })
  }
  assert.ok(state.wrapperPid, 'AppImage spawn must yield an owned child PID.')
  const page = await connect(state)
  // Main can move out of the bounded wrapper into a KDE scope. Bind its actual
  // CDP-reported PID first so the wrapper's descendant check sees that finite scope.
  if (state.wrapperPid !== state.mainPid) {
    state.checks.push(
      await boundQualificationProcess(state.wrapperPid, {
        deadlineSeconds: nativeDeadlineSeconds,
        execute: boundedExecute,
      }),
    )
    state.aggregateLimits = assertAggregate(state.checks)
  }
  await expect(page.getByRole('region', { name: 'Home', exact: true })).toBeVisible()
  records.push({
    name: `${name}: packaged Home loads with real preload and IPC`,
    rendererUrl: page.url(),
  })
  return state
}

async function readPorts(state) {
  const result = await state.page.evaluate(async () => ({
    catalog: await globalThis.api.models.getCatalog(),
    presets: await globalThis.api.presets.list(),
    projects: await globalThis.api.projects.list(),
    runtime: await globalThis.api.runtime.getStatus(),
    workspaces: await globalThis.api.projects.listWorkspaces(),
  }))
  for (const entry of Object.values(result)) assert.equal(entry.ok, true, JSON.stringify(entry))
  if (!history && !trained) {
    assert.deepEqual(result.catalog.value, [])
    assert.deepEqual(result.presets.value, [])
  }
  if (engine) {
    assert.equal(result.runtime.value.kind, 'ready', JSON.stringify(result.runtime.value))
    assert.equal(result.runtime.value.profile, 'linux-nvidia')
    assert.equal(result.runtime.value.runtimeId, engine.runtimeId)
    assert.equal(result.runtime.value.outpaintInfill, 'ready')
  } else assert.equal(result.runtime.value.kind, 'not-installed')
  assert.ok(result.workspaces.value.length >= 1)
  return result
}

async function checkUnavailable(state) {
  const notice = state.page.getByRole('region', {
    name: 'Image generation status',
  })
  await expect(notice.getByRole('button', { name: 'Set up', exact: true })).toBeEnabled()
  await notice.getByRole('button', { name: 'Set up', exact: true }).click()
  await expect(notice.getByRole('alert')).toContainText(
    'Verified release artifacts and a complete setup preview are not available in this build.',
  )
  await expect(
    state.page.getByRole('dialog', {
      name: 'Set up image generation',
      exact: true,
    }),
  ).toHaveCount(0)
  await expect(notice.getByRole('button', { name: 'Set up', exact: true })).toBeEnabled()
  const snapshot = await state.page.evaluate(() => globalThis.api.runtime.getInstallationProgress())
  assert.equal(snapshot.ok, true)
  assert.equal(snapshot.value.operation, null)
  records.push({
    name: `${state.name}: default unavailable Setup has no install operation`,
    revision: snapshot.value.revision,
  })
}

async function currentTab(state) {
  // There is no public getTabs method. UI has already created/opened the tab;
  // the existing open owner returns that actual current Main tab, without mocks.
  const result = await state.page.evaluate(async (title) => {
    const listed = await globalThis.api.projects.list()
    if (!listed.ok) return listed
    const summary = listed.value.find((project) => project.title === title)
    if (!summary) throw new Error('The explicitly opened Project is absent from the actual index.')
    return await globalThis.api.projects.open(summary.id)
  }, projectTitle)
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(result.value.kind, 'opened')
  const tab = result.value.tab
  assert.equal(tab.dirty, false)
  assert.equal(tab.autosaveError, null)
  assert.equal(tab.storageWarning, undefined)
  assert.deepEqual(tab.layers, [])
  assert.deepEqual(tab.acceptedResults, [])
  assert.deepEqual(tab.primaryBbox, { x: 0, y: 0, width: 1024, height: 1024 })
  assert.equal(tab.generationDraft.model, null)
  assert.equal(tab.generationDraft.vae, null)
  assert.deepEqual(tab.generationDraft.loras, [])
  return tab
}

async function closeNormally(state) {
  await gpuObservers.get(state)?.()
  gpuObservers.delete(state)
  if (trained && !state.closed && state.aggregateLimits) {
    state.memoryBeforeClose = await Promise.all(
      state.aggregateLimits.groups.map(async (group) => {
        const directory = path.join('/sys/fs/cgroup', group)
        const [peak, events, accounting] = await Promise.all(
          ['memory.peak', 'memory.events', 'memory.stat'].map((name) =>
            readFile(path.join(directory, name), 'utf8'),
          ),
        )
        return {
          group,
          peakBytes: peak.trim(),
          events: events.trim(),
          accounting: accounting.split('\n').filter((line) => /^(anon|file) /.test(line)),
        }
      }),
    )
  }
  if (!state.closed) {
    const page = state.page && !state.page.isClosed() ? state.page : await connect(state)
    try {
      await page.evaluate(() => window.close())
    } catch (error) {
      if (!page.isClosed() && !/Target.*closed|context was destroyed/i.test(error.message))
        throw error
    }
  }
  const closed = await bounded(state.closePromise, 20_000, 'Normal packaged application close')
  assert.equal(closed.code, 0)
  assert.equal(closed.signal, null)
  state.scopeExit = await confirmQualificationProcessExit(state.checks, { execute: boundedExecute })
  assert.equal(state.scopeExit.confirmed, true)
  assert.deepEqual(state.pageErrors, [])
  state.normalPhysicalExit = true
  await state.browser?.close()
  records.push({
    name: `${state.name}: normal close and physical exit confirmed`,
    wrapperPid: state.wrapperPid,
    mainPid: state.mainPid,
  })
}

async function retainOwnStore(name) {
  const workspace = path.join(appData, 'workspaces/Uncategorized')
  const packages = (await readdir(workspace)).filter((entry) => entry.endsWith('.igs'))
  assert.equal(packages.length, 1)
  const packagePath = path.join(workspace, packages[0])
  assert.equal(await realpath(packagePath), packagePath)
  assert.ok((await lstat(packagePath)).isFile() && !(await lstat(packagePath)).isSymbolicLink())
  assert.equal((await readFile(packagePath)).subarray(0, 2).toString(), 'PK')
  await copyFile(packagePath, path.join(root, `${name}.igs`))
  const sqlite = path.join(appData, 'database/app.sqlite')
  assert.equal((await readFile(sqlite)).subarray(0, 16).toString(), 'SQLite format 3\0')
  const databaseFiles = []
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${sqlite}${suffix}`
    try {
      const entry = await lstat(file)
      assert.ok(entry.isFile() && !entry.isSymbolicLink())
      const retained = path.join(root, `${name}.sqlite${suffix}`)
      await copyFile(file, retained)
      databaseFiles.push(await identity(retained))
    } catch (error) {
      if (suffix === '' || error.code !== 'ENOENT') throw error
    }
  }
  return { project: await identity(packagePath), retainedProject: `${name}.igs`, databaseFiles }
}

async function runFreshProfile() {
  const first = await launch('first')
  await applicationUpdateSmoke?.assertStartup(first.page)
  const initial = await readPorts(first)
  assert.deepEqual(initial.projects.value, [])
  if (engine) {
    records.push({
      name: 'Packaged Main qualifies the exact installed native runtime',
      status: initial.runtime.value,
    })
  } else await checkUnavailable(first)
  await first.page.screenshot({
    path: path.join(root, engine ? 'first-home-ready.png' : 'first-home-unavailable.png'),
  })
  await first.page.getByRole('button', { name: 'New Project', exact: true }).first().click()
  const dialog = first.page.getByRole('dialog', {
    name: 'New Project',
    exact: true,
  })
  await expect(dialog).toBeVisible()
  await dialog.locator('input[aria-label="Project name"]').fill(projectTitle)
  await expect(dialog.getByRole('button', { name: 'Create Project', exact: true })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Create Project', exact: true }).click()
  const createdTab = first.page.getByRole('tab', {
    name: projectTitle,
    exact: true,
  })
  const creationFailure = dialog.getByRole('alert', {
    name: 'Project creation failed',
    exact: true,
  })
  let createOutcome
  await expect
    .poll(
      async () => {
        createOutcome = (await createdTab.isVisible())
          ? { kind: 'created' }
          : (await creationFailure.isVisible())
            ? {
                kind: 'error',
                message: (await creationFailure.textContent())?.trim(),
              }
            : { kind: 'pending' }
        return createOutcome.kind
      },
      {
        timeout: 15_000,
        message: 'Observe actual Project creation success or its visible Main error.',
      },
    )
    .not.toBe('pending')
  records.push({
    name: 'Actual packaged Create consumer settles in the UI',
    outcome: createOutcome,
  })
  assert.equal(
    createOutcome.kind,
    'created',
    `Packaged Create failed: ${createOutcome.message ?? 'no project tab'}`,
  )
  firstTab = await currentTab(first)
  const created = await readPorts(first)
  assert.equal(created.projects.value.length, 1)
  const summary = created.projects.value[0]
  assert.equal(summary.title, projectTitle)
  assert.equal(summary.health, 'ready')
  assert.equal(summary.previewStatus, 'empty')
  assert.equal(summary.recoveryStatus, 'none')
  projectId = summary.id
  await first.page.screenshot({
    path: path.join(root, 'first-created-project.png'),
  })
  records.push({
    name: 'Explicit UI Create persists the initial own Project',
    projectId,
    tab: firstTab,
    summary,
  })
  await applicationUpdateSmoke?.run(first.page)
  await closeNormally(first)
  const saved = await retainOwnStore('after-first-close')

  const second = await launch('restarted')
  await applicationUpdateSmoke?.assertRestart(second.page)
  const reopenedPorts = await readPorts(second)
  if (engine) {
    records.push({
      name: 'Restart qualifies the same installed native runtime',
      status: reopenedPorts.runtime.value,
    })
  }
  assert.equal(reopenedPorts.projects.value.length, 1)
  assert.equal(reopenedPorts.projects.value[0].id, projectId)
  assert.equal(reopenedPorts.projects.value[0].title, projectTitle)
  assert.equal(reopenedPorts.projects.value[0].recoveryStatus, 'none')
  const row = second.page.getByRole('listitem').filter({ hasText: projectTitle })
  await expect(row.locator('img')).toBeVisible()
  await second.page.waitForFunction((title) => {
    const element = [...document.querySelectorAll('.project-row')]
      .find((candidate) => candidate.textContent?.includes(title))
      ?.querySelector('img')
    return element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0
  }, projectTitle)
  const thumbnail = await row.locator('img').getAttribute('src')
  assert.ok(thumbnail?.startsWith('igs-preview://thumbnail/'))
  await second.page.screenshot({ path: path.join(root, 'restarted-home.png') })
  await second.page.getByRole('button', { name: `Open ${projectTitle}`, exact: true }).click()
  await expect(second.page.getByRole('tab', { name: projectTitle, exact: true })).toBeVisible()
  const secondTab = await currentTab(second)
  assert.equal(secondTab.id, firstTab.id)
  assert.equal(secondTab.documentId, firstTab.documentId)
  assert.equal(secondTab.documentRevision, firstTab.documentRevision)
  assert.deepEqual(secondTab.generationDraft, firstTab.generationDraft)
  assert.deepEqual(secondTab.primaryBbox, firstTab.primaryBbox)
  await second.page.screenshot({ path: path.join(root, 'restarted-project.png') })
  records.push({
    name: 'Same packaged artifact reopens persisted SQLite/index/Project and reads the actual saved thumbnail',
    projectId,
    tab: secondTab,
    thumbnail,
  })
  await closeNormally(second)
  const restarted = await retainOwnStore('after-restarted-close')
  assert.equal(
    restarted.project.sha256,
    saved.project.sha256,
    'Read/reopen must preserve the Project package bytes.',
  )
  return { saved, restarted }
}

try {
  if (updateCheckMode) {
    const { createApplicationUpdateCheckSmoke } =
      await import('./application-update-check-smoke.mjs')
    applicationUpdateSmoke = await createApplicationUpdateCheckSmoke({
      mode: updateCheckMode,
      port: updateFeedPort,
      root,
      currentVersion: '0.1.0-dev.1',
      releaseFixturesPath: updateReleaseFixturesPath,
    })
  }
  const { saved, restarted, historicalUpgrade, trainedGeneration } = history
    ? await historical.runHistoricalUpgrade({
        history,
        launch,
        readPorts,
        closeNormally,
        retainOwnStore,
        root,
        migrationHash: sourceBefore.find(({ path: file }) => file === migrationFile).sha256,
        iccHash: sourceBefore.find(({ path: file }) => file === srgbProfile).sha256,
        identity,
        records,
      })
    : trained
      ? await trainedProfile.runTrainedGeneration({
          trained,
          launch,
          readPorts,
          closeNormally,
          retainOwnStore,
          root,
          identity,
          records,
          observeGpuWorker,
        })
      : await runFreshProfile()
  assert.deepEqual(await identity(appImage), packageBefore)
  if (trainedGeneration) {
    const jobWorker = trainedGeneration.worker
    assert.ok(
      lifetimes[0].gpuSamples.some(
        ({ gpuMiB, pid, startTicks, group }) =>
          gpuMiB > 0 &&
          pid === jobWorker.pid &&
          startTicks === jobWorker.startTicks &&
          group === jobWorker.group,
      ),
      'Observe the claimed generation worker on CUDA, with exact PID/start/cgroup.',
    )
    const workers = new Map(lifetimes[0].gpuSamples.map(({ pid, startTicks }) => [pid, startTicks]))
    for (const [pid, startTicks] of workers) {
      try {
        const stat = await readFile(`/proc/${pid}/stat`, 'utf8')
        assert.notEqual(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19], startTicks)
      } catch (error) {
        if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error
      }
    }
    for (const state of lifetimes) {
      assert.ok(
        state.memoryBeforeClose.every(
          ({ events }) => /^oom 0$/m.test(events) && /^oom_kill 0$/m.test(events),
        ),
      )
    }
  }
  const sourceAfter = await Promise.all(sourcePaths.map(identity))
  assert.deepEqual(sourceAfter, sourceBefore)
  if (engine) {
    for (const input of engine.inputs) assert.deepEqual(await identity(input.path), input)
  }
  if (applicationUpdateSmoke) {
    assert.equal(lifetimes.length, 2)
    assert.ok(lifetimes.every((state) => state.normalPhysicalExit && !state.forcedCleanup))
    await applicationUpdateSmoke.stop()
    applicationUpdateResult = applicationUpdateSmoke.finalize()
  }
  await writeJson('report.json', {
    schemaVersion: 1,
    outcome: 'PASS',
    scope: trainedGeneration
      ? 'Actual fused AppImage executes one trained installed-worker generation through public Generate, Add, Save and reopen.'
      : historicalUpgrade
        ? 'Actual fused AppImage upgrades an owned historical DB, renders a nonempty Project preview with the installed CPU worker and reopens the saved Project.'
        : engine
          ? 'Actual fused Linux AppImage with exact installed runtime, real Main status qualification and Project create/restart/persistence.'
          : 'Actual fused Linux AppImage outside checkout, real packaged Main/preload/SQLite/migrations/own Project create/restart/persistence. No source worker or service mocks.',
    mode: 'APPIMAGE_EXTRACT_AND_RUN=1; X11; Chromium CDP loopback. FUSE installation and Main Node inspector are not used.',
    packageBefore,
    packageAfter: await identity(appImage),
    sourceBefore,
    sourceAfter,
    cwd,
    appData,
    temporaryRoot: environment.TMPDIR ?? null,
    records,
    ...(applicationUpdateSmoke ? { applicationUpdateCheck: applicationUpdateResult } : {}),
    ...(historicalUpgrade ? { historicalUpgrade } : {}),
    ...(trainedGeneration ? { trainedGeneration } : {}),
    stores: { saved, restarted },
    lifetimes: lifetimes.map(
      ({
        child: _child,
        browser: _browser,
        page: _page,
        closePromise: _promise,
        stdout: _stdout,
        stderr: _stderr,
        ...state
      }) => state,
    ),
    ...(engine
      ? {
          packagedInstalledRuntime: {
            runtimeId: engine.runtimeId,
            unchangedInputs: engine.inputs,
          },
        }
      : { defaultProviderUnavailable: true }),
    nativeInferenceQualified: Boolean(trainedGeneration),
    shippingTrustQualified: false,
    cleanMachineInstallQualified: false,
    applicationUpdateQualified: false,
    fullMvpAccepted: false,
  })
} catch (error) {
  failed = error
  await writeJson('failure.json', {
    outcome: 'FAIL',
    message: error.message,
    stack: error.stack,
    records,
    projectId,
    packageBefore,
    ...(applicationUpdateSmoke
      ? { applicationUpdateCheck: applicationUpdateSmoke.snapshot() }
      : {}),
  })
} finally {
  applicationUpdateSmoke?.releaseHeld()
  for (const state of lifetimes) {
    if (!state.normalPhysicalExit) {
      try {
        await closeNormally(state)
      } catch (error) {
        state.closeFailure = error.message
        // A failed close never becomes PASS. Existing guards own any forced native deadline.
        // Wait for their original finite deadline, then revalidate the exact owned scope only.
        const due = Math.max(
          0,
          ...state.checks.map((check) => Date.parse(check.at) + nativeDeadlineSeconds * 1000),
        )
        while (!state.closed && Date.now() < due) await delay(Math.min(1000, due - Date.now()))
        if (!state.closed) {
          for (const check of state.checks) {
            const group = check.groups.find(
              (entry) => entry.ownedScope && entry.pids.includes(check.nativeIdentity.pid),
            )
            if (group) {
              state.forcedCleanup = true
              state.deadlineCleanup = await stopExpiredQualificationProcess(
                { ...check.nativeIdentity, group: group.group },
                { execute: boundedExecute },
              )
            }
          }
          // This exact spawned child remains a harness-owned wrapper, never an arbitrary PID.
          if (state.child.exitCode === null && state.child.signalCode === null) {
            state.forcedCleanup = true
            state.child.kill('SIGTERM')
          }
        }
        try {
          await bounded(state.closePromise, 15_000, 'Failed-run owned process settlement')
          state.scopeExit = await confirmQualificationProcessExit(state.checks, {
            execute: boundedExecute,
          })
        } catch (physicalError) {
          state.physicalExitFailure = physicalError.message
        }
        await state.browser?.close().catch(() => {})
      }
    }
    await writeFile(path.join(root, `${state.name}.stdout.log`), state.stdout)
    await writeFile(path.join(root, `${state.name}.stderr.log`), state.stderr)
    await writeJson(`${state.name}.physical-exit.json`, {
      wrapperPid: state.wrapperPid,
      mainPid: state.mainPid,
      closed: state.closed,
      normalPhysicalExit: state.normalPhysicalExit ?? false,
      forcedCleanup: state.forcedCleanup,
      closeFailure: state.closeFailure,
      physicalExitFailure: state.physicalExitFailure,
      deadlineCleanup: state.deadlineCleanup,
      checks: state.checks,
      memoryBeforeClose: state.memoryBeforeClose,
      gpuSamples: state.gpuSamples,
      gpuObserverError: state.gpuObserverError,
      scopeExit: state.scopeExit,
    })
  }
  if (applicationUpdateSmoke) {
    try {
      await applicationUpdateSmoke.stop()
    } catch (error) {
      failed ??= error
    }
    await writeJson('application-update-check.json', applicationUpdateSmoke.snapshot())
  }
}
if (failed) throw failed
console.log(
  trained
    ? 'PASS trained generation, explicit Add and Save/reopen, and two normal physical closes'
    : history
      ? 'PASS historical database upgrade, exact backup, installed CPU preview, and two normal physical closes'
      : engine
        ? 'PASS installed runtime readiness, packaged Project reopen and two normal physical closes'
        : 'PASS actual fused AppImage Home/IPC/SQLite/Project persistence, unavailable Setup and two normal physical closes',
)
