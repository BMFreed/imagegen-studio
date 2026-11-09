/**
 * ROOT-only installed public Illustrious Smart Regional four-mode qualification; authoring is
 * source-only. CLI: pnpm exec tsx scripts/qualify-installed-illustrious-smart-regional.mjs
 * --fixture RUN/options.json --mode txt2img|img2img|inpaint|outpaint --phase prepare|retry --label
 * p1 --report RUN/NEW.json [--resume RUN/PREPARE.json] ROOT first builds the app,
 * refreshes/qualifies the one installed worker and applies the outer deadline/RAM guard. This
 * script never provisions, copies models/envs, replaces workers, writes queue rows, or removes its
 * retained fixture.
 *
 * Mechanism: existing qualify-installed-smart-patch.mjs/native-smoke-window/resource helpers, real
 * public renderer/IPC, RuntimeManager, frozen Smart queue, installed descriptor dispatcher, native
 * inference/world output, journaled explicit Add. Invoke4875d965: compileCanvasGraph grafts the
 * selected source mode before signed regional conditioning; app/invocations/sd/denoise_latents.py
 * keeps signed regional conditioning separate from source/KEEP; its caller is
 * prepareCanvasInvocation.ts.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs'
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  writeFile,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { inflateSync } from 'node:zlib'
const REPO = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const ARTIFACT_ROOT = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const WORLD = { x: -13, y: 5, width: 107, height: 73 }
const PROCESSING = { width: 136, height: 128 }
const POSITIVE = '(two white cats)1.25 on one bench'
const NEGATIVE = '(blur)0.75, noise'
const LOCAL_A = '(red scarf)1.5'
const LOCAL_B = '(green scarf)1.5'
const DEADLINE = 600
const options = {}
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i],
    value = process.argv[i + 1]
  assert.ok(
    ['--fixture', '--mode', '--phase', '--label', '--report', '--resume'].includes(key) &&
      value &&
      !options[key],
    'Unknown/repeated/missing CLI option',
  )
  options[key] = value
}
assert.ok(options['--fixture'] && options['--report'])
const fixturePath = path.resolve(options['--fixture'])
assert.equal(options['--fixture'], fixturePath)
const fixtureEntry = await lstat(fixturePath)
assert.ok(fixtureEntry.isFile() && !fixtureEntry.isSymbolicLink() && fixtureEntry.size <= 65536)
assert.equal(await realpath(fixturePath), fixturePath)
const fixtureBytes = await readFile(fixturePath)
const fixture = JSON.parse(fixtureBytes.toString('utf8'))
assert.deepEqual(Object.keys(fixture).sort(), [
  'modelId',
  'run',
  'schemaVersion',
  'shared',
  'shortRoot',
  'versionId',
])
assert.equal(fixture.schemaVersion, 1)
for (const field of ['run', 'shared', 'shortRoot']) {
  const value = fixture[field]
  assert.ok(
    typeof value === 'string' &&
      path.isAbsolute(value) &&
      path.resolve(value) === value &&
      value.startsWith(`${ARTIFACT_ROOT}${path.sep}`),
    `Noncanonical/outside artifact ${field}`,
  )
}
for (const field of ['modelId', 'versionId'])
  assert.match(
    fixture[field],
    /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
  )
const RUN = fixture.run
const SHARED = fixture.shared
const SHORT = fixture.shortRoot
assert.equal(path.dirname(fixturePath), RUN)
assert.equal(new Set([RUN, SHARED, SHORT]).size, 3)
for (const left of [RUN, SHARED, SHORT])
  for (const right of [RUN, SHARED, SHORT])
    if (left !== right)
      assert.equal(
        left.startsWith(`${right}${path.sep}`),
        false,
        'Evidence/runtime/profile roots must not contain one another',
      )
const APPDATA = path.join(SHARED, 'data/imagegen-studio')
const MODEL_ID = fixture.modelId
const VERSION_ID = fixture.versionId
const MODE = options['--mode']
assert.ok(['txt2img', 'img2img', 'inpaint', 'outpaint'].includes(MODE))
const MASKED = MODE === 'inpaint' || MODE === 'outpaint'
const CURRENT_FUTURE_VISIBLE = MODE === 'txt2img' || MODE === 'outpaint'
const CAPABILITY = `illustrious-smart-patch-regional-${MODE}-v1`
const PROFILE = `invoke-illustrious-smart-regional-${MODE}-v1`
const STATE_CAPABILITY =
  MODE === 'txt2img'
    ? 'illustriousSmartPatchRegionalTxt2ImgSupported'
    : MODE === 'img2img'
      ? 'illustriousSmartPatchRegionalImg2ImgSupported'
      : MODE === 'outpaint'
        ? 'illustriousSmartPatchRegionalOutpaintSupported'
        : 'illustriousSmartPatchRegionalSupported'
const EXPECTED_SOURCE_ALPHA =
  MODE === 'txt2img' ? 'transparent' : MODE === 'outpaint' ? 'mixed' : 'opaque'
const TOTAL_STEPS = MODE === 'txt2img' ? 20 : 10
const phase = options['--phase']
assert.ok(phase === 'prepare' || phase === 'retry')
const label = options['--label']
assert.match(label, /^[a-z][a-z0-9]{0,2}$/)
const reportFile = path.resolve(options['--report'])
assert.equal(path.dirname(reportFile), RUN)
assert.equal(existsSync(reportFile), false)
let previous = null,
  previousPath = null
if (phase === 'retry') {
  assert.ok(options['--resume'])
  previousPath = path.resolve(options['--resume'])
  assert.equal(path.dirname(previousPath), RUN)
  assert.notEqual(previousPath, reportFile)
  const entry = await lstat(previousPath)
  assert.ok(entry.isFile() && !entry.isSymbolicLink() && entry.size <= 16 * 1024 ** 2)
  assert.equal(await realpath(previousPath), previousPath)
  previous = JSON.parse(await readFile(previousPath, 'utf8'))
  assert.equal(previous.profile, 'installed-illustrious-smart-regional-v1')
  assert.equal(previous.mode, MODE)
  assert.equal(previous.phase, 'prepare')
  assert.equal(previous.outcome, 'passed')
  assert.equal(previous.fixture.sha256, createHash('sha256').update(fixtureBytes).digest('hex'))
  assert.equal(previous.model.localModelId, MODEL_ID)
  assert.equal(previous.model.localVersionId, VERSION_ID)
  assert.equal(previous.harness.path, fileURLToPath(import.meta.url))
  assert.equal(
    previous.harness.sha256,
    createHash('sha256')
      .update(await readFile(fileURLToPath(import.meta.url)))
      .digest('hex'),
  )
  assert.ok(
    previous.nativeClosures.length === 1 &&
      previous.nativeClosures.every((x) => x.confirmed && x.normal),
  )
  assert.ok(previous.canceled?.row && previous.editedPackageSha256)
} else assert.equal(options['--resume'], undefined)
const payload = path.join(RUN, 'payloads', label),
  profileRoot = path.join(SHORT, label)
const title = previous?.project.title ?? `Illustrious Smart ${MODE} regional ${label}`
const patchName = `Selected Smart regional ${MODE}`
const packagePath = path.join(APPDATA, 'workspaces/Uncategorized', `${title}.igs`)
if (previous) assert.equal(previous.project.packagePath, packagePath)
const require = createRequire(path.join(REPO, 'package.json'))
const { _electron: electron, expect } = require('@playwright/test')
const load = (relative) => import(pathToFileURL(path.join(REPO, relative)).href)
const nativeExec = promisify(execFile)
const digest = (value) => createHash('sha256').update(value).digest('hex')
const prompt = (text) => ({ text, embeddingRefs: [] })
const report = {
  schemaVersion: 1,
  profile: 'installed-illustrious-smart-regional-v1',
  mode: MODE,
  fixture: { path: fixturePath, sha256: digest(fixtureBytes), ...fixture },
  outcome: 'running',
  phase,
  label,
  startedAt: new Date().toISOString(),
  payload,
  profileRoot,
  appData: APPDATA,
  packagePath,
  checks: [],
  scenarios: [],
  progress: [],
  renderedProgress: [],
  resourceLimitChecks: [],
  nativeClosures: [],
  observedWorkers: [],
  pageErrors: [],
  errors: [],
  memory: {},
  ownedQueueIds: [],
  boundary: {
    actual:
      'Built renderer Generate/Results/Add/Undo/Redo/Save and Queue Manager Retry; public typed IPC authoring/cancellation; real Main coherent capture/preparation, queue/bundle/receipt, installed Illustrious epsilon CUDA descriptor dispatch, world PNG and saved/reopened accepted variant.',
    fixture:
      'One actual portable Project; TXT transparent/null Smart mask, IMG opaque/disjoint Smart mask, INP opaque/covered Smart mask, OUT mixed/covered Smart mask; above-magenta exclusion and initially hidden future opaque source; independently owned regional masks; actual installed Illustrious EPS catalog. No fabricated queue/receipt/runtime/qualifier. Existing managed LaMa is a prerequisite only for OUT.',
    inference:
      phase === 'prepare'
        ? 'Three requests: A/B/progress-canceledA; two successful world PNGs. No prompt/seed search.'
        : 'One renderer frozen Retry of the prior prepare-phase canceledA; exact original output and all bundle bytes.',
    limits:
      'ROOT owns outer aggregate <=12GiB/zero-swap/600s guard; per-launch native helpers below check actual scopes. Visual quality and general product readiness remain unqualified.',
    retention:
      'New payload/profile directories and one new shared managed Project/its real queue rows are retained for ROOT audit/lifecycle. No shared projects, weights, runtime or global caches are removed.',
  },
}
let reportCreated = false
const checkpoint = () => {
  writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
    flag: reportCreated ? 'w' : 'wx',
  })
  reportCreated = true
}
function check(name, detail = {}) {
  report.checks.push({ name, ...detail })
  checkpoint()
  console.log(`PASS ${name}`)
}
async function exclusive(file, bytes) {
  await writeFile(file, bytes, { flag: 'wx', mode: 0o600 })
}
async function json(file, value) {
  await exclusive(file, `${JSON.stringify(value, null, 2)}\n`)
}
async function hashFile(file) {
  const h = createHash('sha256')
  for await (const b of createReadStream(file)) h.update(b)
  return h.digest('hex')
}
async function regular(file) {
  const st = await lstat(file)
  assert.ok(st.isFile() && !st.isSymbolicLink())
  assert.equal(await realpath(file), file)
  return st
}
const within = (root, value) =>
  value === root || (value.startsWith(`${root}${path.sep}`) && path.resolve(value) === value)
let application, window, database, marker, provision
let projectId, documentId, authored, ids, model
let leftExpected, rightExpected, belowRgba
let nativeChecks = [],
  sampler,
  sampling = Promise.resolve()
const memoryGroups = new Map()
const closedProofs = []
let helpers, isolation, oracle, databaseModule, igsModule
let success = false
async function api(method, ...args) {
  const result = await window.evaluate(({ method, args }) => window.api.projects[method](...args), {
    method,
    args,
  })
  assert.equal(result.ok, true, `${method}: ${JSON.stringify(result)}`)
  return result.value
}
async function current() {
  const value = await api('open', projectId)
  assert.equal(value.kind, 'opened')
  return value.tab
}
function patch(tab) {
  const p = tab.layers.find((x) => x.id === ids.patch)
  assert.equal(p?.kind, 'smart-patch')
  return p
}
const tray = () =>
  window.getByRole('region', { name: 'Smart Patch Generation Results', exact: true })
const canvas = () => window.getByRole('region', { name: 'Project Canvas', exact: true })
const patchButton = () =>
  window
    .locator(`[data-layer-id="${ids.patch}"]`)
    .getByRole('button', { name: `Select ${patchName}`, exact: true })
async function results() {
  return await api('listSmartPatchGenerationResults', projectId)
}
async function rows() {
  return await database.db
    .selectFrom('generation_queue_item')
    .selectAll()
    .where('local_project_key', '=', projectId)
    .orderBy('created_at')
    .orderBy('id')
    .execute()
}
async function row(id) {
  return await database.db
    .selectFrom('generation_queue_item')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
}
async function fetchPng(url) {
  const response = await application.evaluate(async ({ net }, value) => {
    const r = await net.fetch(value)
    return { status: r.status, bytes: [...new Uint8Array(await r.arrayBuffer())] }
  }, url)
  assert.equal(response.status, 200)
  return Buffer.from(response.bytes)
}
async function memory(labelAt) {
  for (const [group, role] of memoryGroups) {
    try {
      const p = path.join('/sys/fs/cgroup', group)
      const currentBytes = (await readFile(path.join(p, 'memory.current'), 'utf8')).trim()
      const fields = Object.fromEntries(
        (await readFile(path.join(p, 'memory.stat'), 'utf8'))
          .trim()
          .split('\n')
          .map((line) => line.split(/\s+/)),
      )
      const previous = report.memory[group] ?? {
        role,
        maxCurrent: '0',
        maxAnon: '0',
        maxFile: '0',
        samples: 0,
      }
      for (const [value, maximum] of [
        [currentBytes, 'maxCurrent'],
        [fields.anon, 'maxAnon'],
        [fields.file, 'maxFile'],
      ]) {
        assert.match(value, /^\d+$/)
        if (BigInt(value) > BigInt(previous[maximum])) previous[maximum] = value
      }
      report.memory[group] = {
        ...previous,
        samples: previous.samples + 1,
        last: {
          at: new Date().toISOString(),
          label: labelAt,
          current: currentBytes,
          anon: fields.anon,
          file: fields.file,
        },
      }
    } catch (error) {
      if (!['ENOENT', 'ESRCH', 'ENODEV'].includes(error.code)) throw error
    }
  }
}
async function bounds(labelAt) {
  const proof = await helpers.boundQualificationProcess(application.process().pid, {
    deadlineSeconds: DEADLINE,
    execute: (file, args, options) =>
      nativeExec(
        file,
        args.map((x) => (x === 'MemoryMax=12G' ? 'MemoryMax=10G' : x)),
        options,
      ),
  })
  // Retain the qualified native identity even if the aggregate launcher check below refuses.
  nativeChecks.push(proof)
  const launcher = readFileSync('/proc/self/cgroup', 'utf8')
    .trim()
    .split('\n')
    .find((line) => line.startsWith('0::'))
    ?.slice(3)
  assert.ok(launcher && launcher !== '/')
  const maxima = new Map()
  for (const group of proof.groups) {
    maxima.set(group.group, BigInt(group.memoryMax))
    assert.equal(group.swapMax, '0')
    memoryGroups.set(group.group, 'native')
  }
  const launcherMax = readFileSync(`/sys/fs/cgroup${launcher}/memory.max`, 'utf8').trim()
  assert.match(launcherMax, /^\d+$/)
  assert.equal(readFileSync(`/sys/fs/cgroup${launcher}/memory.swap.max`, 'utf8').trim(), '0')
  maxima.set(launcher, BigInt(launcherMax))
  memoryGroups.set(launcher, 'launcher')
  assert.ok(
    [...maxima.values()].reduce((a, b) => a + b, 0n) <= 12n * 1024n ** 3n,
    'Actual unique native + launcher limits exceed aggregate12GiB',
  )
  report.resourceLimitChecks.push({
    label: labelAt,
    ...proof,
    launcherGroup: launcher,
    launcherMax,
    aggregateMax: String([...maxima.values()].reduce((a, b) => a + b, 0n)),
  })
  await memory(labelAt)
  checkpoint()
}
async function observeWorkers() {
  if (!application) return
  const mainPid = application.process().pid,
    parents = new Map()
  for (const name of await readdir('/proc')) {
    if (!/^\d+$/.test(name)) continue
    try {
      const s = await readFile(`/proc/${name}/status`, 'utf8')
      parents.set(Number(name), Number(s.match(/^PPid:\s+(\d+)$/m)?.[1]))
    } catch (e) {
      if (!['ENOENT', 'ESRCH'].includes(e.code)) throw e
    }
  }
  const owned = new Set([mainPid])
  for (let changed = true; changed;) {
    changed = false
    for (const [pid, pp] of parents)
      if (owned.has(pp) && !owned.has(pid)) {
        owned.add(pid)
        changed = true
      }
  }
  for (const pid of owned) {
    try {
      const command = (await readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0').filter(Boolean)
      const role =
        command.includes('imagegen_worker.inference_main') ||
        command.includes('imagegen_worker.owned_inference')
          ? 'inference'
          : command.includes('imagegen_worker')
            ? 'derivatives'
            : null
      if (!role) continue
      const executable = await readlink(`/proc/${pid}/exe`)
      assert.ok(within(path.join(APPDATA, 'runtime'), executable))
      assert.ok(command.includes('-I') && command.includes('-m'))
      const env = Object.fromEntries(
        (await readFile(`/proc/${pid}/environ`, 'utf8'))
          .split('\0')
          .filter(Boolean)
          .map((x) => {
            const i = x.indexOf('=')
            return [x.slice(0, i), x.slice(i + 1)]
          }),
      )
      assert.equal(env.PYTHONPATH, undefined)
      assert.equal(env.PYTHONHOME, undefined)
      for (const name of ['HF_HUB_OFFLINE', 'TRANSFORMERS_OFFLINE', 'HF_DATASETS_OFFLINE'])
        assert.equal(env[name], '1')
      if (role === 'derivatives') assert.equal(env.CUDA_VISIBLE_DEVICES, '')
      const stat = await readFile(`/proc/${pid}/stat`, 'utf8'),
        start = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]
      if (!report.observedWorkers.some((x) => x.pid === pid && x.start === start))
        report.observedWorkers.push({ pid, start, role, executable, command, offline: true })
    } catch (e) {
      if (!['ENOENT', 'ESRCH'].includes(e.code)) throw e
    }
  }
}
function startSampler() {
  sampler = setInterval(() => {
    sampling = sampling
      .then(async () => {
        await observeWorkers()
        await memory('periodic')
        checkpoint()
      })
      .catch((e) => {
        report.samplerError = String(e.stack ?? e)
        checkpoint()
      })
  }, 500)
}
async function stopSampler() {
  clearInterval(sampler)
  await sampling
}
async function launch() {
  const environment = {
    ...process.env,
    NODE_ENV: 'production',
    OMP_NUM_THREADS: '2',
    MKL_NUM_THREADS: '2',
    OPENBLAS_NUM_THREADS: '2',
    XDG_CONFIG_HOME: path.join(profileRoot, 'config'),
    XDG_DATA_HOME: path.join(SHARED, 'data'),
    XDG_CACHE_HOME: path.join(profileRoot, 'cache'),
    TMPDIR: path.join(profileRoot, 'tmp'),
  }
  for (const key of Object.keys(environment))
    if (
      key.startsWith('IMAGEGEN_TEST_') ||
      [
        'ELECTRON_RUN_AS_NODE',
        'IMAGEGEN_DEV_SERVER_URL',
        'PYTHONPATH',
        'PYTHONHOME',
        'CUDA_VISIBLE_DEVICES',
      ].includes(key)
    )
      delete environment[key]
  const observer = await createProcessingObserver()
  application = await electron.launch({
    args: ['-r', observer, '--ozone-platform=x11', '.'],
    cwd: REPO,
    env: environment,
    timeout: 30_000,
  })
  await bounds('launch')
  window = await isolation.isolateNativeSmokeWindow(application)
  window.setDefaultTimeout(15_000)
  window.on('pageerror', (error) => report.pageErrors.push(String(error)))
  await application.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    w.setSize(1440, 900)
    w.focus()
  })
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  database = databaseModule.openAppDatabase(APPDATA, path.join(REPO, 'src/main/db/migrations'))
  await window.evaluate(() => {
    const root = window
    root.__smartRegionalProgress = []
    root.__smartRegionalRendered = []
    root.__smartRegionalCancel = null
    root.__smartRegionalCancelResult = null
    root.api.projects.onGenerationProgress((value) => {
      root.__smartRegionalProgress.push(value)
      queueMicrotask(() =>
        root.__smartRegionalRendered.push({
          current: value.current,
          text: document.body.innerText.match(/Denoising step \d+ of \d+/)?.[0] ?? null,
        }),
      )
      const target = root.__smartRegionalCancel
      if (
        target &&
        !target.requested &&
        value.current?.jobId === target.id &&
        value.current.step > 0
      ) {
        target.requested = true
        target.progress = value.current
        // This is the real typed public cancellation API, after actual native progress.
        root.api.projects
          .cancelGenerationJob({ id: target.id, statusSequence: value.current.statusSequence })
          .then((result) => {
            root.__smartRegionalCancelResult = result
          })
      }
    })
  })
  startSampler()
  await expect
    .poll(async () => (await api('list')).some((x) => x.id === projectId), { timeout: 30_000 })
    .toBe(true)
  await openProject()
}
async function openProject() {
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await window.getByRole('button', { name: `Open ${title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: title, exact: true })).toBeVisible({
    timeout: 60_000,
  })
  await expect(window.locator('input[aria-label="Images per click"]')).toBeEnabled({
    timeout: 30_000,
  })
  await patchButton().click()
  await expect(patchButton()).toHaveAttribute('aria-pressed', 'true')
  await expect(
    window.getByRole('heading', { name: 'Smart Patch bounds', exact: true }),
  ).toBeVisible()
  const overlay = window.getByRole('button', { name: 'Hide mask overlay', exact: true })
  if (await overlay.isVisible()) await overlay.click()
  const value = await current()
  assert.equal(value.documentId, documentId)
}
async function closeNative(reason) {
  if (!application) return
  await stopSampler()
  try {
    await bounds(`${reason}-before-close`)
  } catch (error) {
    report.closeBoundsError = String(error.stack ?? error)
  }
  const qualified = nativeChecks.length > 0
  const ownedChild = application.process()
  const normalRequired = reason === 'complete'
  if (normalRequired) {
    const value = await current(),
      snapshot = await results(),
      owned = await rows()
    report.preClose = {
      dirty: value.dirty,
      availableCandidates: snapshot.candidates.length,
      unfinishedJobs: owned
        .filter((x) => ['pending', 'running'].includes(x.status))
        .map((x) => x.id),
      confirmationSource:
        'src/main/index.ts: close impact counts unaccepted candidates before synchronous human confirmation; this harness retires its own candidate via the public discard action before closing.',
    }
    assert.equal(report.preClose.dirty, false)
    assert.equal(report.preClose.availableCandidates, 0)
    assert.deepEqual(report.preClose.unfinishedJobs, [])
    checkpoint()
  }
  if (database) {
    await database.close()
    database = null
  }
  let timeout,
    closeFailure = null
  try {
    await Promise.race([
      application.close(),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Owned Electron close exceeded10seconds')),
          10_000,
        )
      }),
    ])
    report.normalClose = { requested: true, completed: true, reason }
  } catch (error) {
    closeFailure = error
    report.closeError = String(error.stack ?? error)
    // A startup qualification failure still owns the automation handle, never an unknown scope.
    if (!qualified) {
      report.unqualifiedClose = { pid: ownedChild.pid, requested: true, completed: false }
      checkpoint()
      throw error
    }
    const latest = nativeChecks.at(-1),
      identity = latest.processIdentities.find((x) => x.pid === application.process().pid)
    const group = latest.groups.find((x) => x.ownedScope && x.pids.includes(identity?.pid))
    assert.ok(identity && group, 'Cannot signal an unqualified process/scope')
    report.forcedOwnedClose = await helpers.stopExpiredQualificationProcess({
      ...identity,
      group: group.group,
    })
  } finally {
    clearTimeout(timeout)
  }
  if (!qualified) {
    report.unqualifiedClose = {
      pid: ownedChild.pid,
      requested: true,
      completed: true,
      exitCode: ownedChild.exitCode,
      signalCode: ownedChild.signalCode,
    }
    application = null
    window = null
    checkpoint()
    throw new Error(
      'Owned Electron closed after startup qualification failure; ROOT full physical-exit audit remains required',
    )
  }
  const proof = await helpers.confirmQualificationProcessExit(nativeChecks)
  report.nativeClosures.push({ reason, normal: closeFailure === null, ...proof })
  closedProofs.push(proof)
  checkpoint()
  assert.equal(proof.confirmed, true)
  nativeChecks = []
  application = null
  window = null
  const idle = await (
    await load('scripts/upgrade-qualification-worker.mjs')
  ).assertRuntimeIdle(APPDATA, provision.installed.basePrefix)
  report.nativeClosures.at(-1).runtimeIdle = idle
  checkpoint()
  if (normalRequired && closeFailure !== null) throw closeFailure
}
async function selectPatch() {
  await patchButton().click()
  await expect(patchButton()).toHaveAttribute('aria-pressed', 'true')
}
async function saveAndRead(name) {
  const value = await current()
  if (value.dirty) {
    await window.getByRole('button', { name: 'Save Project', exact: true }).click()
    await expect.poll(async () => (await current()).dirty, { timeout: 30_000 }).toBe(false)
  }
  const saved = await igsModule.readIgsPackage(packagePath)
  await copyFile(packagePath, path.join(payload, `${name}.igs`), 1)
  return saved
}
async function generate(cancel = false) {
  await selectPatch()
  const prior = new Set((await rows()).map((x) => x.id))
  const count = window.locator('input[aria-label="Images per click"]')
  await count.fill('1')
  await count.press('Enter')
  await expect(window.getByRole('button', { name: 'Generate', exact: true })).toBeEnabled({
    timeout: 120_000,
  })
  await window.getByRole('button', { name: 'Generate', exact: true }).click()
  await expect
    .poll(async () => (await rows()).filter((x) => !prior.has(x.id)).length, {
      timeout: 120_000,
      intervals: [50, 100, 200],
    })
    .toBe(1)
  const created = (await rows()).find((x) => !prior.has(x.id))
  report.ownedQueueIds.push(created.id)
  checkpoint()
  if (cancel)
    await window.evaluate((id) => {
      window.__smartRegionalCancel = { id, requested: false }
    }, created.id)
  return created.id
}
async function capture(labelAt, id, available = true) {
  await expect.poll(async () => (await row(id)).status, { timeout: 150_000 }).toBe('completed')
  await expect
    .poll(async () => (await results()).candidates.some((x) => x.queueItemId === id), {
      timeout: 30_000,
    })
    .toBe(true)
  const candidate = (await results()).candidates.find((x) => x.queueItemId === id)
  assert.equal(candidate.documentId, documentId)
  assert.equal(candidate.layerId, ids.patch)
  assert.equal(candidate.actualSeed, 123)
  if (available) assert.equal(candidate.disposition, 'available')
  const actualRow = await row(id),
    frozen = JSON.parse(actualRow.frozen_payload_json)
  assert.equal(actualRow.operation, 'illustrious-smart-patch')
  assert.equal(frozen.mode, MODE)
  assert.equal(frozen.sourceAlpha, EXPECTED_SOURCE_ALPHA)
  assert.deepEqual(frozen.context.bbox, WORLD)
  assert.deepEqual(frozen.context.internalResolution, PROCESSING)
  assert.equal(frozen.item.item.seed, 123)
  assert.equal(frozen.item.inference.sampling.scheduler, 'euler')
  const samplingPolicy = frozen.item.inference.sampling
  assert.equal(samplingPolicy.steps, 20)
  assert.equal(samplingPolicy.cfgScale, 4)
  assert.equal(samplingPolicy.cfgRescale, 0)
  assert.equal(samplingPolicy.denoisingStrength, MODE === 'txt2img' ? undefined : 0.5)
  assert.deepEqual(samplingPolicy.noiseProfile, {
    schemaVersion: 1,
    baseSchedule: 'sdxl-scaled-linear-v1',
    rescaleBetasZeroSnr: false,
    timestepSpacing: 'leading',
  })
  assert.equal(frozen.item.inference.checkpoint.sha256, model.fileSha256)
  assert.equal(frozen.item.inference.checkpoint.predictionType, 'epsilon')
  assert.equal(frozen.item.inference.vae, null)
  assert.equal(frozen.item.inference.vaePrecision, 'Auto')
  assert.deepEqual(frozen.item.inference.loras, [])
  assert.equal(frozen.regional.profile, PROFILE)
  assert.equal(frozen.regional.recipe.family, 'illustrious')
  assert.equal(frozen.regional.promptInterpretation, undefined)
  assert.equal(frozen.animaPromptInterpretation, undefined)
  const recipe = frozen.regional.recipe
  assert.equal(recipe.layerId, ids.patch)
  assert.equal(recipe.documentId, documentId)
  assert.equal(recipe.globalPrompts.positive.text, POSITIVE)
  assert.equal(recipe.globalPrompts.negative.text, NEGATIVE)
  assert.equal(recipe.regions[1].negative.source, 'smart-patch')
  assert.equal(recipe.regions[1].negative.prompt.text, NEGATIVE)
  assert.equal(recipe.regions[0].negative.prompt.text, labelAt === 'B' ? LOCAL_B : LOCAL_A)
  assert.deepEqual(
    recipe.regions.map((x) => x.regionId),
    [ids.left, ids.right],
  )
  assert.deepEqual(frozen.item.inference.prompts, { positive: POSITIVE, negative: NEGATIVE })
  assert.equal(frozen.regional.compiledPrompts, undefined)
  const receipt = await database.db
    .selectFrom('generation_candidate_receipt')
    .selectAll()
    .where('candidate_id', '=', candidate.candidateId)
    .executeTakeFirstOrThrow()
  assert.equal(receipt.status, 'completed')
  assert.equal(receipt.queue_item_id, id)
  assert.equal(receipt.actual_seed, 123)
  assert.equal(receipt.frozen_payload_sha256, digest(actualRow.frozen_payload_json))
  const caseRoot = path.join(payload, labelAt)
  await mkdir(caseRoot, { mode: 0o700 })
  const bundlePath = path.join(APPDATA, 'generation-queued-inputs/smart-patch', frozen.bundle.id)
  const manifestBytes = await readFile(path.join(bundlePath, 'manifest.json'))
  assert.equal(digest(manifestBytes), frozen.bundle.manifestSha256)
  const manifest = JSON.parse(manifestBytes.toString())
  assert.deepEqual(manifest.regional, frozen.regional)
  await exclusive(path.join(caseRoot, 'manifest.json'), manifestBytes)
  const files = {}
  for (const [name, ref] of Object.entries(frozen.files)) {
    assert.equal(path.basename(name), name)
    const bytes = await readFile(path.join(bundlePath, name))
    assert.equal(bytes.length, ref.byteSize)
    assert.equal(digest(bytes), ref.sha256)
    files[name] = bytes
    await exclusive(path.join(caseRoot, name), bytes)
  }
  assert.deepEqual(
    Object.keys(files)
      .filter((x) => x.startsWith('regional-'))
      .sort(),
    ['regional-0.alpha8', 'regional-1.alpha8'],
  )
  assert.ok(files['regional-0.alpha8'].equals(leftExpected))
  assert.ok(files['regional-1.alpha8'].equals(rightExpected))
  const source = oracle.decodeSmartPatchQualificationPng(files['source.png'])
  assert.deepEqual([source.width, source.height], [107, 73])
  assertSource(source.data, belowRgba)
  const keep = oracle.decodeSmartPatchQualificationPng(files['latent-keep-mask.png'])
  assert.deepEqual([keep.width, keep.height], [17, 16])
  const keepAlpha = Buffer.from(Array.from({ length: 17 * 16 }, (_, i) => keep.data[4 * i + 3]))
  if (MASKED)
    assert.ok(
      keepAlpha.some((value) => value > 0) && keepAlpha.some((value) => value < 255),
      'INP/OUT need independent nontrivial latent KEEP',
    )
  else
    assert.ok(
      keepAlpha.every((value) => value === 0),
      'TXT/IMG latent KEEP must be zero',
    )
  const bytes = await fetchPng(candidate.imageUrl)
  const decoded = oracle.decodeSmartPatchQualificationPng(bytes)
  assert.deepEqual([decoded.width, decoded.height], [107, 73])
  assert.equal(digest(bytes), receipt.image_sha256)
  assert.equal(bytes.length, receipt.image_byte_size)
  assert.equal(pngIccSha(bytes), '113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1')
  const alpha = Buffer.from(
    Array.from({ length: WORLD.width * WORLD.height }, (_, i) => decoded.data[4 * i + 3]),
  )
  const contribution = oracle.decodeSmartPatchQualificationPng(files['final-contribution-mask.png'])
  assert.ok(
    alpha.equals(
      Buffer.from(Array.from({ length: alpha.length }, (_, i) => contribution.data[4 * i + 3])),
    ),
  )
  if (MASKED)
    assert.ok(
      alpha.some((value) => value === 0) && alpha.some((value) => value === 255),
      'INP/OUT contribution must retain protected and generated world pixels',
    )
  else
    assert.ok(
      alpha.every((value) => value === 255),
      'TXT/IMG final contribution must stay fully opaque',
    )
  await exclusive(path.join(caseRoot, 'world.png'), bytes)
  const processing = await processingWitness(caseRoot, frozen, actualRow)
  const worldOracle = await verifyWorld(caseRoot, processing.pngPath, frozen)
  processing.rgbSha256 = worldOracle.processingRgbSha256
  const progress = await window.evaluate(() => window.__smartRegionalProgress)
  const rendered = await window.evaluate(() => window.__smartRegionalRendered)
  const updates = progress.map((x) => x.current).filter((x) => x?.jobId === id)
  assert.ok(
    updates.length &&
      updates.every(
        (x) =>
          x.projectKey === projectId &&
          x.documentId === documentId &&
          x.statusSequence === receipt.expected_status_sequence,
      ),
  )
  assert.ok(updates.every((x) => x.totalSteps === TOTAL_STEPS))
  assert.ok(updates.some((x) => x.step === TOTAL_STEPS))
  assert.ok(updates.some((x) => x.step > 0))
  assert.ok(
    rendered.some(
      (x) =>
        x.current?.jobId === id &&
        x.current.step > 0 &&
        x.text === `Denoising step ${x.current.step} of ${x.current.totalSteps}`,
    ),
  )
  const value = {
    label: labelAt,
    candidate,
    row: actualRow,
    receipt,
    frozen,
    caseRoot,
    bundlePath,
    pngSha256: digest(bytes),
    rgbaSha256: digest(decoded.data),
    alphaSha256: digest(alpha),
    processing,
    worldOracle,
    progress: updates,
  }
  await json(path.join(caseRoot, 'record.json'), value)
  report.scenarios.push(value)
  check(
    `${labelAt}: genuine installed public completion and exact frozen mode/raw/source/independent-KEEP/world associations`,
    { id, pngSha256: value.pngSha256 },
  )
  return { ...value, bytes, decoded, files, alpha }
}
async function changeLocal(text) {
  const value = await current()
  await api(
    'updateRegionalGuidancePrompt',
    projectId,
    { documentId, documentRevision: value.documentRevision, regionId: ids.left },
    { kind: 'text', polarity: 'negative', text },
  )
}
async function discard() {
  const snapshot = await results(),
    target = snapshot.targets.find((x) => x.layerId === ids.patch && x.documentId === documentId)
  assert.ok(target)
  await api('discardSmartPatchGenerationResults', projectId, {
    kind: 'smart-patch',
    documentId,
    documentRevision: snapshot.documentRevision,
    sourceDocumentId: documentId,
    layerId: ids.patch,
    expectedAvailableIds: snapshot.candidates
      .filter((x) => x.layerId === ids.patch)
      .map((x) => x.candidateId),
    expectedUnfinishedJobIds: target.unfinishedJobIds,
  })
  await expect.poll(async () => (await results()).candidates.length).toBe(0)
}
async function acceptA(value) {
  const before = await current(),
    beforePackage = await hashFile(packagePath),
    oldCount = patch(before).rasterSubLayers.length
  assert.equal(before.canUndo, false)
  await tray()
    .getByRole('checkbox', { name: 'Select Smart Patch candidate 1', exact: true })
    .check()
  await tray().getByRole('button', { name: 'Add 1 as Variant', exact: true }).click()
  await expect.poll(async () => patch(await current()).rasterSubLayers.length).toBe(oldCount + 1)
  assert.equal(await hashFile(packagePath), beforePackage, 'Explicit Add must not save')
  await canvas().getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(async () => patch(await current()).rasterSubLayers.length).toBe(oldCount)
  assert.equal((await current()).canUndo, false, 'One Add owns one Undo')
  await canvas().getByRole('button', { name: 'Redo', exact: true }).click()
  await expect.poll(async () => patch(await current()).rasterSubLayers.length).toBe(oldCount + 1)
  const saved = await saveAndRead('accepted-A')
  const owner = saved.project.layers.find((x) => x.id === ids.patch),
    accepted = owner.rasterSubLayers.find(
      (x) =>
        x.generationProvenance.executionResultContext.candidateId === value.candidate.candidateId,
    )
  assert.ok(accepted)
  assert.equal(owner.activeRasterSubLayerId, accepted.id)
  assert.equal(accepted.generationProvenance.kind, 'illustrious-smart-patch')
  assert.ok((await saved.readMember(accepted.asset.path)).equals(value.bytes))
  assert.deepEqual(
    accepted.generationProvenance.layerSourceContext.generationDraft,
    authored.layers.find((x) => x.id === ids.patch).generationDraft,
  )
  const provenanceKeys = (value) =>
    value && typeof value === 'object'
      ? Object.entries(value).flatMap(([key, child]) => [key, ...provenanceKeys(child)])
      : []
  assert.ok(
    !provenanceKeys(accepted.generationProvenance).some((key) =>
      [
        'regional',
        'regionalGuidance',
        'regions',
        'recipe',
        'compiledPrompts',
        'compositionProfile',
      ].includes(key),
    ),
    'Regional operational fields must not leak to accepted provenance',
  )
  assert.equal(accepted.generationProvenance.generationConfiguration.mode, MODE)
  assert.equal(
    accepted.generationProvenance.executionResultContext.output.outputMode,
    'contribution',
  )
  assert.equal(
    accepted.generationProvenance.executionResultContext.output.contributionAlpha8.sha256,
    value.alphaSha256,
  )
  assert.equal(accepted.generationProvenance.generationConfiguration.sampling.actualSeed, 123)
  assert.equal(accepted.generationProvenance.executionResultContext.queueItemId, value.row.id)
  assert.deepEqual(saved.project.generationDraft, authored.generationDraft)
  assert.deepEqual(saved.project.primaryBbox, authored.primaryBbox)
  for (const id of [ids.above, ids.below, ids.future])
    assert.deepEqual(
      saved.project.layers.find((x) => x.id === id),
      authored.layers.find((x) => x.id === id),
    )
  await window.getByRole('button', { name: `Close ${title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: title, exact: true })).toHaveCount(0)
  await openProject()
  assert.ok((await fetchPng(patch(await current()).activeRaster.imageUrl)).equals(value.bytes))
  report.accepted = accepted
  check(
    'A explicit Add/one Undo/Redo/native Save/reopen preserves ordinary-only provenance and neighbors',
  )
}
async function futureEdits() {
  await changeLocal('(future local exclusion)1.25')
  let value = await current()
  await api(
    'updateRegionalGuidance',
    projectId,
    { documentId, documentRevision: value.documentRevision, regionId: ids.left },
    { kind: 'enabled', enabled: false },
  )
  value = await current()
  await api('deleteRegionalGuidance', projectId, {
    documentId,
    documentRevision: value.documentRevision,
    regionId: ids.right,
  })
  for (const change of [
    { kind: 'positive-prompt', text: 'future Smart scene' },
    { kind: 'negative-prompt', text: 'future Smart exclusion' },
    { kind: 'seed', policy: 'fixed', value: 321 },
    { kind: 'sampling-pair', sampler: 'Euler a', scheduler: 'Normal' },
    { kind: 'sampling-steps', value: 4 },
  ])
    await api('updateGenerationDraft', projectId, change, undefined, ids.patch)
  await api('updateSmartPatchLayer', projectId, ids.patch, {
    kind: 'internal-resolution',
    size: { width: 128, height: 128 },
  })
  await api('updateGenerationDraft', projectId, {
    kind: 'negative-prompt',
    text: 'future Canvas exclusion',
  })
  await api('updateGenerationDraft', projectId, { kind: 'seed', policy: 'fixed', value: 1000 })
  await api('setPrimaryBbox', projectId, { x: 200, y: -200, width: 512, height: 512 })
  if (MODE === 'txt2img') {
    value = await current()
    const p = patch(value)
    await api('editSmartPatchMask', projectId, ids.patch, {
      documentId,
      documentRevision: value.documentRevision,
      maskId: p.mask.id,
      maskRevision: p.mask.revision,
      edit: {
        kind: 'brush',
        operation: 'add',
        diameter: 12,
        points: [{ x: WORLD.x + 10, y: WORLD.y + 10 }],
      },
    })
  }
  value = await current()
  const ownedPatch = patch(value)
  await api('editSmartPatchMask', projectId, ids.patch, {
    documentId,
    documentRevision: value.documentRevision,
    maskId: ownedPatch.mask.id,
    maskRevision: ownedPatch.mask.revision,
    edit: { kind: 'clear' },
  })
  value = await current()
  const ownedRegion = value.regionalGuidance.find((x) => x.id === ids.left)
  await api('editRegionalGuidanceMask', projectId, ids.left, {
    documentId,
    documentRevision: value.documentRevision,
    maskId: ownedRegion.mask.id,
    maskRevision: ownedRegion.mask.revision,
    edit: { kind: 'clear' },
  })
  await api('updateRasterLayer', projectId, ids.below, { kind: 'opacity', opacity: 0.25 })
  if (CURRENT_FUTURE_VISIBLE)
    await api('updateRasterLayer', projectId, ids.future, { kind: 'visibility', visible: true })
  const saved = await saveAndRead('edited-after-cancel')
  assert.equal(saved.project.regionalGuidance.length, 1)
  assert.equal(saved.project.regionalGuidance[0].enabled, false)
  assert.equal(saved.project.layers.find((x) => x.id === ids.patch).generationDraft.seed.value, 321)
  assert.equal(saved.project.layers.find((x) => x.id === ids.below).opacity, 0.25)
  assert.equal(
    saved.project.layers.find((x) => x.id === ids.future).visible,
    CURRENT_FUTURE_VISIBLE,
  )
  const oldPatch = authored.layers.find((x) => x.id === ids.patch),
    newPatch = saved.project.layers.find((x) => x.id === ids.patch)
  assert.ok(newPatch.mask.revision > oldPatch.mask.revision)
  report.futureEdits = {
    expectedCurrentSourceAlpha: CURRENT_FUTURE_VISIBLE ? 'opaque' : 'mixed',
    expectedCurrentSmartMode: CURRENT_FUTURE_VISIBLE ? 'img2img' : 'outpaint',
    sourceChange: CURRENT_FUTURE_VISIBLE
      ? 'Initially hidden opaque below-layer is made visible by the real public action'
      : 'Original opaque below-layer opacity changes to0.25',
    sourceModeIsInference: true,
  }
  report.editedPackageSha256 = await hashFile(packagePath)
  check(
    'After Cancel, real IPC edits source opacity, Smart/regional masks, settings and region enable/delete; explicit Save preserves frozen input',
  )
}
function pngIccSha(bytes) {
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset),
      tag = bytes.toString('ascii', offset + 4, offset + 8)
    if (tag === 'iCCP') {
      const body = bytes.subarray(offset + 8, offset + 8 + length),
        split = body.indexOf(0)
      assert.ok(split > 0)
      assert.equal(body[split + 1], 0)
      return digest(inflateSync(body.subarray(split + 2), { maxOutputLength: 1024 * 1024 }))
    }
    offset += length + 12
  }
  assert.fail('Pinned sRGB ICC chunk is missing')
}
async function buildIdentity() {
  const names = [
    'dist/main/main.cjs',
    'dist/preload/preload.cjs',
    'dist/renderer/index.html',
    ...(await readdir(path.join(REPO, 'dist/renderer/assets')))
      .filter((name) => /\.(?:js|css)$/.test(name))
      .map((name) => `dist/renderer/assets/${name}`),
  ]
  return Object.fromEntries(
    await Promise.all(names.map(async (name) => [name, await hashFile(path.join(REPO, name))])),
  )
}
async function verifyProvision() {
  const markerPath = path.join(APPDATA, 'qualification-runtime.json')
  await regular(markerPath)
  marker = JSON.parse(await readFile(markerPath, 'utf8'))
  assert.equal(marker.appData, APPDATA)
  assert.equal(marker.status, 'passed')
  assert.equal(marker.confirmedWorkerExit, true)
  await regular(marker.report)
  provision = JSON.parse(await readFile(marker.report, 'utf8'))
  assert.equal(provision.status, 'activated-qualified')
  assert.equal(provision.appData, APPDATA)
  assert.equal(provision.confirmedWorkerExit, true)
  assert.equal(provision.installed.editable, false)
  assert.equal(provision.pythonExecutable, marker.pythonExecutable)
  assert.equal(provision.runtimeId, marker.runtimeId)
  const upgrade = await load('scripts/upgrade-qualification-worker.mjs')
  const source = await upgrade.treeManifest(path.join(REPO, 'worker-python/src/imagegen_worker'))
  assert.deepEqual(await upgrade.treeManifest(provision.installed.workerRoot), source)
  assert.deepEqual(source, provision.installed.workerFiles)
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(provision.inputs.worker.files).map(([name, identity]) => [
        name.replace(/^imagegen_worker\//, ''),
        identity,
      ]),
    ),
    source,
  )
  assert.equal(
    await hashFile(path.join(REPO, 'worker-python/pyproject.toml')),
    provision.inputs.worker.pyprojectSha256,
  )
  assert.equal(
    await hashFile(path.join(REPO, 'worker-python/uv.lock')),
    provision.inputs.worker.lockSha256,
  )
  const pointer = JSON.parse(
    await readFile(path.join(APPDATA, 'runtime/current-runtime.json'), 'utf8'),
  )
  assert.equal(pointer.runtimeId, marker.runtimeId)
  assert.equal(pointer.pythonExecutable, provision.pythonExecutable)
  report.runtimePointer = pointer
  const ready = provision.ready
  assert.equal(ready.workerVersion, '0.14.0')
  assert.ok(ready.capabilities.includes(CAPABILITY))
  for (const name of [
    'smart-patch-execution',
    'smart-patch-seed-confirmation',
    'illustrious-euler',
    'illustrious-noise-profile',
  ])
    assert.ok(ready.capabilities.includes(name))
  await upgrade.assertRuntimeIdle(APPDATA, provision.installed.basePrefix)
  report.installed = {
    markerPath,
    marker,
    reportSha256: await hashFile(marker.report),
    ready,
    workerTree: source,
  }
  report.builtBundles = await buildIdentity()
  if (MODE === 'outpaint') {
    const auxiliary = await load('src/main/runtime/inference-auxiliary-resources.ts')
    const verified = await new auxiliary.InferenceAuxiliaryResources(
      path.join(APPDATA, 'inference-resources'),
    ).resolveVerifiedOutpaintInfill()
    report.infill = {
      expectedRequired: true,
      verified,
      observation:
        'Read-only prerequisite verification of existing managed pinned LaMa; actual public preparation resolves it again. No installation/download or resolver substitution.',
    }
  } else
    report.infill = {
      expectedRequired: false,
      observation:
        'No infill resolver instrumented; exact classified/frozen mode and source roles are independently checked.',
    }
  check(
    'Canonical noneditable installed worker/current payload; exact family/mode capability; existing OUT infill prerequisite verified',
  )
}
async function prepareFixture() {
  const [modelModule, sessionModule, maskModule, literalModule] = await Promise.all([
    load('src/main/models/model-repository.ts'),
    load('src/main/projects/project-session.ts'),
    load('src/main/projects/project-mask.ts'),
    load('src/main/projects/test-fixtures/smart-patch-input-material.ts'),
  ])
  const db = databaseModule.openAppDatabase(APPDATA, path.join(REPO, 'src/main/db/migrations'))
  try {
    const unfinished = await db.db
      .selectFrom('generation_queue_item')
      .select('id')
      .where('status', 'in', ['pending', 'running'])
      .execute()
    assert.deepEqual(unfinished, [], 'Do not launch against unrelated unfinished shared jobs')
    const repository = new modelModule.ModelRepository(db.db),
      catalog = await repository.listInstalled()
    const resource = catalog.find((x) => x.id === MODEL_ID),
      version = resource?.versions.find((x) => x.id === VERSION_ID)
    assert.equal(resource?.type, 'checkpoint')
    assert.equal(version?.baseModelFamily, 'illustrious')
    assert.equal(version.predictionType, 'epsilon')
    model = {
      kind: 'checkpoint',
      baseModelFamily: 'illustrious',
      predictionType: 'epsilon',
      localModelId: MODEL_ID,
      localVersionId: VERSION_ID,
      displayName: resource.displayName,
      versionName: version.name,
      fileSha256: version.file.sha256,
      civitaiFileId: version.civitaiFileId,
      civitaiModelId: resource.source.kind === 'civitai' ? resource.source.modelId : null,
      civitaiVersionId: version.civitaiVersionId,
    }
    report.model = model
  } finally {
    await db.close()
  }
  const workspace = path.dirname(packagePath)
  const workspaceEntry = await lstat(workspace)
  assert.ok(workspaceEntry.isDirectory() && !workspaceEntry.isSymbolicLink())
  assert.equal(await realpath(workspace), workspace)
  assert.equal(existsSync(packagePath), false)
  const session = await sessionModule.ProjectSession.create(packagePath, title, {
    placeholdersDir: path.join(REPO, 'dist/main/placeholders'),
    scratchDir: path.join(payload, 'writer-scratch'),
  })
  ids = Object.fromEntries(
    [
      'patch',
      'smartMask',
      'left',
      'leftMask',
      'right',
      'rightMask',
      'below',
      'above',
      'future',
    ].map((name) => [name, randomUUID()]),
  )
  const doc = structuredClone(session.document),
    draft = structuredClone(doc.generationDraft),
    assets = {}
  documentId = doc.documentId
  projectId = session.localRecoveryKey
  Object.assign(draft, {
    model,
    positivePrompt: prompt(POSITIVE),
    negativePrompt: prompt(NEGATIVE),
    dynamicPrompt: { maxPrompts: 1, seedBehavior: 'per-prompt' },
    seed: { policy: 'fixed', value: 123 },
    loras: [],
    vae: null,
    vaePrecision: 'Auto',
    cfgRescale: 0,
    sampling: {
      cfgScale: 4,
      denoisingStrength: 0.5,
      sampler: 'Euler',
      scheduler: 'Normal',
      steps: 20,
    },
  })
  delete draft.clipSkip
  const mask = (id, bounds, alpha) => {
    const bytes = maskModule.encodeProjectMaskPng(alpha, bounds.width, bounds.height)
    const asset = {
      path: `assets/masks/${id}/${digest(bytes)}.png`,
      sha256: digest(bytes),
      bytes: bytes.length,
      width: bounds.width,
      height: bounds.height,
    }
    assets[asset.path] = { bytes }
    return { id, revision: 1, asset, bounds }
  }
  const left = Buffer.from(
      Array.from({ length: 70 * 73 }, (_, i) => (i % 70 === 68 ? 127 : i % 70 === 69 ? 128 : 255)),
    ),
    right = Buffer.from(
      Array.from({ length: 60 * 73 }, (_, i) => (i % 60 === 0 ? 127 : i % 60 === 1 ? 128 : 255)),
    )
  leftExpected = Buffer.alloc(107 * 73)
  rightExpected = Buffer.alloc(107 * 73)
  for (let y = 0; y < 73; y++) {
    left.copy(leftExpected, y * 107, y * 70, (y + 1) * 70)
    right.copy(rightExpected, y * 107 + 47, y * 60, (y + 1) * 60)
  }
  const smartAlpha = Buffer.from(
    Array.from({ length: 75 * 41 }, (_, i) =>
      i % 75 === 0 ? 127 : i % 75 === 74 ? 128 : i % 23 === 0 ? 0 : 255,
    ),
  )
  const smart = {
    id: ids.patch,
    kind: 'smart-patch',
    name: patchName,
    boundingBox: WORLD,
    internalResolution: PROCESSING,
    generationDraft: draft,
    mask:
      MODE === 'txt2img'
        ? { id: ids.smartMask, revision: 0, asset: null }
        : mask(
            ids.smartMask,
            {
              x: MASKED ? WORLD.x + 7 : WORLD.x + WORLD.width + 20,
              y: WORLD.y + 9,
              width: 75,
              height: 41,
            },
            smartAlpha,
          ),
    maskSettings: { blur: 0, padding: 0 },
    coherenceSettings: { mode: 'Gaussian Blur', edgeSize: 0, minimumDenoise: 0 },
    opacity: 0.4,
    blendMode: 'normal',
    locked: false,
    visible: true,
    rasterSubLayers: [],
    activeRasterSubLayerId: null,
  }
  belowRgba = sourceFixture()
  const raster = (id, name, rgba) => {
    const bytes = literalModule.literalSmartPatchColorPng(107, 73, [...rgba], 4)
    const asset = {
      path: `assets/layers/${id}.png`,
      bytes: bytes.length,
      width: 107,
      height: 73,
      sha256: digest(bytes),
    }
    assets[asset.path] = { bytes }
    return {
      id,
      kind: 'raster',
      name,
      asset,
      blendMode: 'normal',
      opacity: 1,
      locked: false,
      visible: true,
      transform: { x: -13, y: 5, scaleX: 1, scaleY: 1, rotationDegrees: 0 },
    }
  }
  const future = raster(ids.future, 'Future opaque below source', opaqueSourceFixture())
  future.visible = false
  doc.layers = [
    raster(
      ids.above,
      'Above magenta exclusion control',
      Buffer.from(Array.from({ length: 107 * 73 }, () => [255, 0, 255, 255]).flat()),
    ),
    smart,
    raster(
      ids.below,
      MODE === 'txt2img'
        ? 'Below transparent source'
        : MODE === 'outpaint'
          ? 'Below mixed source gradient'
          : 'Below opaque source gradient',
      belowRgba,
    ),
    future,
  ]
  doc.regionalGuidance = [
    {
      id: ids.left,
      enabled: true,
      locked: false,
      name: 'Local negative owner',
      overlayOpacity: 0,
      mask: mask(ids.leftMask, { ...WORLD, width: 70 }, left),
      prompts: {
        positive: prompt('(red scarf)1.5, one white cat'),
        negative: prompt(LOCAL_A),
        useGlobalNegativePrompt: false,
      },
    },
    {
      id: ids.right,
      enabled: true,
      locked: false,
      name: 'Inherited Smart negative owner',
      overlayOpacity: 0,
      mask: mask(ids.rightMask, { ...WORLD, x: 34, width: 60 }, right),
      prompts: {
        positive: prompt('(blue scarf)1.5, one white cat'),
        negative: prompt('dormant local exclusion'),
        useGlobalNegativePrompt: true,
      },
    },
  ]
  doc.primaryBbox = { x: 100, y: -100, width: 256, height: 256 }
  doc.lastActualSeedSnapshot = 987
  doc.generationDraft.model = {
    ...model,
    baseModelFamily: 'illustrious',
    predictionType: 'epsilon',
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    fileSha256: 'f'.repeat(64),
    displayName: 'Uninstalled Canvas control',
    versionName: 'Canvas only',
  }
  doc.generationDraft.positivePrompt = prompt('unrelated Current Canvas')
  doc.generationDraft.negativePrompt = prompt('canvas haze')
  doc.generationDraft.seed = { policy: 'fixed', value: 987 }
  session.applyDocument(doc)
  await session.save({ assets })
  authored = structuredClone(session.document)
  report.project = {
    projectId,
    documentId,
    ids,
    packagePath,
    title,
    authored,
    originalPackageSha256: await hashFile(packagePath),
  }
  await json(path.join(payload, 'authored-document.json'), authored)
  await copyFile(packagePath, path.join(payload, 'authored.igs'), 1)
  check(
    'One real portable authored Project uses actual catalog ref, unrelated Canvas and separately owned world masks/source layers',
  )
}
/** Generated only when ROOT executes this harness; no worker or protocol is replaced. */
function observerSource(config) {
  return (
    '"use strict";\nconst config = ' +
    JSON.stringify(config) +
    ';\n' +
    String.raw`
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');
const originalSpawn = cp.spawn;
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const demand = (ok, message) => { if (!ok) throw new Error(message); };
function privateDirectory(file) {
  const s = fs.lstatSync(file);
  demand(s.isDirectory() && !s.isSymbolicLink() && s.uid === process.getuid(), 'Observer directory is not owned/canonical');
  demand(fs.realpathSync(file) === file && (s.mode & 0o022) === 0, 'Observer directory is linked/writable');
}
function snapshot(file, maximum) {
  const s = fs.lstatSync(file);
  demand(s.isFile() && !s.isSymbolicLink() && s.uid === process.getuid() && s.nlink === 1 && (s.mode & 0o022) === 0, 'Observer source is not an owned single-link regular file');
  demand(s.size > 0 && s.size <= maximum && fs.realpathSync(file) === file, 'Observer source size/path differs');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    demand(before.isFile() && before.dev === BigInt(s.dev) && before.ino === BigInt(s.ino) && before.size === BigInt(s.size), 'Observer source changed before open');
    const bytes = Buffer.alloc(s.size); let offset = 0;
    while (offset < bytes.length) { const read = fs.readSync(fd, bytes, offset, Math.min(65536, bytes.length - offset), null); demand(read > 0, 'Observer source shortened'); offset += read; }
    demand(fs.readSync(fd, Buffer.alloc(1), 0, 1, null) === 0, 'Observer source grew');
    const after = fs.fstatSync(fd, { bigint: true });
    demand(before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs, 'Observer source mutated during read');
    return bytes;
  } finally { fs.closeSync(fd); }
}
function failure(error, requestId) {
  const file = path.join(config.directory, 'errors.jsonl');
  const line = JSON.stringify({ at: new Date().toISOString(), requestId: requestId || null, message: String(error && error.stack || error).slice(0, 8192) }) + '\n';
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeSync(fd, line); } finally { fs.closeSync(fd); }
}
function observe(value, child, command) {
  demand(value.protocolVersion === '1' && /^[0-9a-f-]{36}$/.test(value.requestId), 'Observer completion identity differs');
  const output = value.output;
  demand(output && Number.isInteger(output.byteSize) && output.byteSize > 0 && output.byteSize <= 33554432 && /^[a-f0-9]{64}$/.test(output.sha256), 'Observer completion descriptor differs');
  demand(output.width === config.width && output.height === config.height && output.colorSpace === 'srgb' && value.actualSeed === 123, 'Observer completion policy differs');
  privateDirectory(config.scratch); privateDirectory(config.directory);
  const names = fs.readdirSync(config.scratch).filter(n => /^smart-patch-request-[A-Za-z0-9_-]+$/.test(n));
  demand(names.length <= 256, 'Observer request-root candidate budget exceeded');
  const found = [];
  for (const name of names) {
    const root = path.join(config.scratch, name), bundlePath = path.join(root, 'smart-regional.json');
    try {
      privateDirectory(root);
      if (!fs.existsSync(bundlePath)) continue;
      const bytes = snapshot(bundlePath, 1048576), bundle = JSON.parse(bytes.toString('utf8'));
      if (bundle.execution && bundle.execution.requestId === value.requestId) found.push({ root, bundlePath, bytes, bundle });
    } catch (error) {
      // A stale unrelated root cannot nominate this completion. The matched
      // current root is mandatory below and is checked again before reading PNG.
      if (error && error.code !== 'ENOENT') continue;
    }
  }
  demand(found.length === 1, 'Observer could not bind completion to one exact owned regional request');
  const bound = found[0], job = bound.bundle;
  demand(job.profile === config.profile && job.recipe.documentId === config.documentId && job.recipe.layerId === config.layerId, 'Observer captured another profile/document/layer');
  demand(job.execution.family === 'illustrious' && job.execution.mode === config.mode && job.execution.output.stagingRoot === bound.root, 'Observer command mode/root differs');
  const sourcePath = job.execution.output.pngPath;
  demand(sourcePath === path.join(bound.root, 'model-result.png'), 'Observer output path is not the original fixed processing role');
  privateDirectory(bound.root);
  const bytes = snapshot(sourcePath, 33554432);
  demand(bytes.length === output.byteSize && digest(bytes) === output.sha256, 'Observer processing bytes differ from original completion');
  demand(bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')), 'Observer processing output is not PNG');
  const prefix = path.join(config.directory, value.requestId), pngPath = prefix + '.png', bundleSnapshotPath = prefix + '.bundle.json';
  fs.writeFileSync(pngPath, bytes, { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(bundleSnapshotPath, bound.bytes, { flag: 'wx', mode: 0o600 });
  const record = { schema: 'passive-smart-processing-snapshot-v1', at: new Date().toISOString(), pid: child.pid, command, sourcePath, pngPath, bundleSnapshotPath, bundlePath: bound.bundlePath, bundleSha256: digest(bound.bytes), response: value, unchangedSpawnArguments: true, identicalChildProcessReturned: true };
  fs.writeFileSync(prefix + '.json', JSON.stringify(record, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
cp.spawn = function (...args) {
  const child = Reflect.apply(originalSpawn, this, args);
  const command = Array.isArray(args[1]) ? args[1] : [];
  if (command.includes('imagegen_worker.owned_inference') || command.includes('imagegen_worker.inference_main')) {
    const decoder = new StringDecoder('utf8'); let pending = '', failed = false;
    child.stdout.on('data', bytes => {
      if (failed) return;
      try {
        pending += decoder.write(bytes);
        demand(Buffer.byteLength(pending) <= 131072, 'Observer stdout buffering limit exceeded');
        for (let newline; (newline = pending.indexOf('\n')) >= 0;) {
          const line = pending.slice(0, newline); pending = pending.slice(newline + 1);
          demand(Buffer.byteLength(line) <= 65536, 'Observer JSONL line limit exceeded');
          if (!line.trim()) continue;
          const value = JSON.parse(line);
          if (value.type === 'smart-patch-executed') observe(value, child, command);
        }
      } catch (error) { failed = true; failure(error); }
    });
  }
  return child;
};
require('node:module').syncBuiltinESMExports();
`
  )
}
const WORLD_ORACLE = String.raw`"""Pillow-only verification; no worker/project/native model imports."""
import hashlib, json, sys
from pathlib import Path
from PIL import Image
root, processing_path, spec = Path(sys.argv[1]), Path(sys.argv[2]), json.loads(sys.argv[3])
sha = lambda b: hashlib.sha256(b).hexdigest()
mode = spec['mode']; assert mode in ('txt2img', 'img2img', 'inpaint', 'outpaint')
masked = mode in ('inpaint', 'outpaint')
processing_bytes = processing_path.read_bytes()
with Image.open(processing_path) as image:
    image.load(); assert image.mode == 'RGB' and image.size == (136, 128)
    processing = image.copy(); processing_rgb = processing.tobytes(); processing_icc = image.info.get('icc_profile')
with Image.open(root / 'world.png') as image:
    image.load(); assert image.mode == 'RGBA' and image.size == (107, 73)
    world = image.copy(); icc = image.info.get('icc_profile'); assert icc
with Image.open(root / 'source.png') as image:
    image.load(); assert image.mode == 'RGBA' and image.size == (107, 73); source = image.copy(); source_icc = image.info.get('icc_profile')
assert processing_icc == source_icc == icc
assert sha(icc) == '113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1'
source_alpha = source.getchannel('A').tobytes()
if mode == 'txt2img': assert set(source_alpha) == {0}
elif mode == 'outpaint': assert min(source_alpha) == 0 and max(source_alpha) == 255 and any(0 < a < 255 for a in source_alpha)
else: assert set(source_alpha) == {255}
with Image.open(root / 'latent-keep-mask.png') as image:
    image.load(); assert image.mode == 'RGBA' and image.size == (17, 16)
    keep = image.getchannel('A').tobytes()
if masked: assert max(keep) > 0 and min(keep) < 255, 'Masked Smart modes require independently nontrivial KEEP'
else: assert set(keep) == {0}, 'TXT/IMG requires zero KEEP'
with Image.open(root / 'final-contribution-mask.png') as image:
    image.load(); assert image.mode == 'RGBA' and image.size == (107, 73); contribution = image.getchannel('A')
if masked: assert contribution.getextrema() == (0, 255), 'Protected and generated WORLD pixels must remain separate'
else: assert contribution.getextrema() == (255, 255), 'TXT/IMG edits the full world target'
model_source_rgb_sha = None
model_source_policy = 'no-source'
if mode == 'txt2img':
    assert not (root / 'model-source.png').exists(), 'TXT acquired a source file'
else:
    with Image.open(root / 'model-source.png') as image:
        image.load(); assert image.mode == 'RGB' and image.size == (136, 128)
        assert image.info.get('icc_profile') == icc
        model_source_rgb_sha = sha(image.tobytes())
        if mode in ('img2img', 'inpaint'):
            expected_source = source.resize((136, 128), Image.Resampling.BICUBIC).convert('RGB')
            assert image.tobytes() == expected_source.tobytes(), 'Prepared RGB changed before the original native VAE'
            model_source_policy = 'independent-exact-bicubic-original-source'
        else: model_source_policy = 'native-prepared-LaMa-bytes-retained-not-independently-repredicted'
expected = processing.resize((107, 73), Image.Resampling.BICUBIC).convert('RGBA')
expected.putalpha(contribution)
assert expected.tobytes() == world.tobytes(), 'Original processing RGB did not produce exact BICUBIC world RGB/frozen alpha'
expected.save(root / 'world-reference.png', icc_profile=icc)
print(json.dumps({'schema': 'independent-smart-regional-world-oracle-v1', 'mode': mode, 'exactWorldRgba': True, 'processingPngSha256': sha(processing_bytes), 'processingRgbSha256': sha(processing_rgb), 'frozenModelSourceRgbSha256': model_source_rgb_sha, 'modelSourcePolicy': model_source_policy, 'worldRgbaSha256': sha(world.tobytes()), 'sourceRgbaSha256': sha(source.tobytes()), 'sourceAlphaCounts': {str(a): source_alpha.count(a) for a in (0, 127, 128, 255)}, 'zeroKeep': not masked, 'keepAlphaSha256': sha(keep), 'editCorePixels': sum(a == 255 for a in contribution.tobytes()), 'protectedPixels': sum(a == 0 for a in contribution.tobytes()), 'fullContributionAlpha': not masked, 'sourcePasteback': False}))
`
function opaqueSourceFixture() {
  return Buffer.from(
    Array.from({ length: WORLD.width * WORLD.height }, (_, i) => {
      const x = i % WORLD.width,
        y = Math.floor(i / WORLD.width)
      return [30 + x, 40 + 2 * y, 70 + ((x + y) % 80), 255]
    }).flat(),
  )
}
function sourceFixture() {
  if (MODE === 'txt2img') return Buffer.alloc(WORLD.width * WORLD.height * 4)
  const rgba = opaqueSourceFixture()
  if (MODE === 'outpaint')
    for (let i = 0; i < WORLD.width * WORLD.height; i++) {
      const x = i % WORLD.width
      if (x >= 45) {
        rgba[4 * i] = 0
        rgba[4 * i + 1] = x < 55 ? 255 : 0
        rgba[4 * i + 2] = 0
      }
      rgba[4 * i + 3] = x < 45 ? 255 : x < 55 ? (x % 2 ? 127 : 128) : 0
    }
  return rgba
}
function assertSource(actual, expected) {
  assert.ok(
    actual.equals(expected),
    'Frozen WORLD source pixels differ from the authored source-only fixture',
  )
  report.sourceComposition = { exactRgba: true, sourceAlpha: EXPECTED_SOURCE_ALPHA, mode: MODE }
}
const observerDirectory = path.join(payload, 'processing-observer')
async function assertObserverClean(expectedCount) {
  const errors = path.join(observerDirectory, 'errors.jsonl')
  assert.equal(
    existsSync(errors),
    false,
    existsSync(errors) ? await readFile(errors, 'utf8') : 'Processing observer failure',
  )
  const records = (await readdir(observerDirectory)).filter((x) => /^[0-9a-f-]{36}\.json$/.test(x))
  if (expectedCount !== undefined)
    assert.equal(
      records.length,
      expectedCount,
      'Every successful native request must have exactly one processing PNG witness',
    )
  return records
}
async function processingWitness(caseRoot, frozen, actualRow) {
  const records = await assertObserverClean(),
    candidates = []
  for (const name of records) {
    const p = path.join(observerDirectory, name),
      value = JSON.parse(await readFile(p, 'utf8'))
    const bundle = JSON.parse(await readFile(value.bundleSnapshotPath, 'utf8'))
    if (bundle.recipe.documentRevision !== frozen.context.documentRevision) continue
    if (bundle.recipe.documentId !== documentId || bundle.recipe.layerId !== ids.patch) continue
    assert.equal(bundle.profile, frozen.regional.profile)
    assert.equal(bundle.execution.mode, MODE)
    assert.equal(bundle.execution.family, 'illustrious')
    assert.equal(bundle.compiledPrompts, undefined)
    assert.equal(frozen.regional.compiledPrompts, undefined)
    assert.deepEqual(bundle.execution.inference, frozen.item.inference)
    for (const [field, role] of [
      ['modelSource', 'model-source.png'],
      ['latentKeepMask', 'latent-keep-mask.png'],
    ]) {
      if (field === 'modelSource' && MODE === 'txt2img') {
        assert.equal(bundle.execution.modelSource, null)
        assert.equal(frozen.files[role], undefined)
        continue
      }
      const { path: inputPath, ...identity } = bundle.execution[field]
      assert.deepEqual(identity, frozen.files[role])
      assert.equal(path.basename(inputPath), role)
      assert.equal(path.dirname(inputPath), path.dirname(value.sourcePath))
    }
    assert.equal(value.response.requestId, bundle.execution.requestId)
    assert.equal(value.response.actualSeed, 123)
    assert.equal(value.sourcePath, bundle.execution.output.pngPath)
    for (const [index, region] of bundle.recipe.regions.entries()) {
      const descriptor = region.coverage.alpha.$alpha8,
        role = `regional-${index}.alpha8`
      assert.equal(region.regionId, frozen.regional.recipe.regions[index].regionId)
      assert.equal(descriptor.sha256, frozen.files[role].sha256)
      assert.equal(descriptor.byteSize, frozen.files[role].byteSize)
    }
    assert.equal(await hashFile(value.pngPath), value.response.output.sha256)
    candidates.push({ ...value, observerRecord: p, queueId: actualRow.id })
  }
  assert.equal(
    candidates.length,
    1,
    'Processing witness must bind uniquely to this exact frozen job/revision',
  )
  const value = candidates[0]
  await copyFile(value.pngPath, path.join(caseRoot, 'processing.png'), 1)
  value.pngPath = path.join(caseRoot, 'processing.png')
  return value
}
async function createProcessingObserver() {
  await mkdir(observerDirectory, { mode: 0o700 })
  const file = path.join(profileRoot, 'processing-observer.cjs')
  const source = observerSource({
    directory: observerDirectory,
    scratch: path.join(APPDATA, 'scratch'),
    documentId,
    layerId: ids.patch,
    mode: MODE,
    profile: PROFILE,
    width: PROCESSING.width,
    height: PROCESSING.height,
  })
  await exclusive(file, source)
  report.processingInstrumentation = {
    kind: 'Passive original-spawn/stdout observer; unchanged spawn arguments/env/identical returned ChildProcess, no response rewriting.',
    sourcePath: file,
    sha256: digest(source),
    bounds: { lineBytes: 65536, requestRoots: 256, metadataBytes: 1048576, pngBytes: 33554432 },
  }
  await exclusive(path.join(payload, 'processing-observer.cjs'), source)
  checkpoint()
  return file
}
async function verifyWorld(caseRoot, processing, frozen) {
  const file = path.join(profileRoot, 'world-oracle.py')
  if (!existsSync(file)) {
    await exclusive(file, WORLD_ORACLE)
    await exclusive(path.join(payload, 'world-oracle.py'), WORLD_ORACLE)
    report.worldOracleSourceSha256 = digest(WORLD_ORACLE)
  }
  const out = await nativeExec(
    provision.pythonExecutable,
    [
      '-I',
      '-B',
      file,
      caseRoot,
      processing,
      JSON.stringify({
        mode: MODE,
        bounds: WORLD,
        processing: PROCESSING,
        mask: frozen.context.mask,
      }),
    ],
    {
      maxBuffer: 1024 * 1024,
      timeout: 30_000,
      env: { PATH: '/usr/bin:/bin', PYTHONDONTWRITEBYTECODE: '1' },
    },
  )
  const value = JSON.parse(out.stdout)
  assert.equal(value.exactWorldRgba, true)
  assert.ok(value.editCorePixels > 0)
  assert.ok(value.processingRgbSha256)
  const witness = await readFile(processing)
  assert.equal(digest(witness), value.processingPngSha256)
  // Save the independently decoded processing RGB identity with the native observer metadata.
  const recordFile = path.join(caseRoot, 'world-oracle.json')
  await json(recordFile, value)
  return value
}
try {
  for (const root of [ARTIFACT_ROOT, RUN, SHORT, SHARED, APPDATA]) {
    const entry = await lstat(root)
    assert.ok(entry.isDirectory() && !entry.isSymbolicLink())
    assert.equal(await realpath(root), root)
  }
  await mkdir(path.join(RUN, 'payloads'), { recursive: true, mode: 0o700 })
  const payloadBase = path.join(RUN, 'payloads')
  const payloadBaseEntry = await lstat(payloadBase)
  assert.ok(
    payloadBaseEntry.isDirectory() &&
      !payloadBaseEntry.isSymbolicLink() &&
      payloadBaseEntry.uid === process.getuid(),
  )
  assert.equal(await realpath(payloadBase), payloadBase)
  await mkdir(payload, { mode: 0o700 })
  await mkdir(profileRoot, { mode: 0o700 })
  for (const child of ['config', 'cache', 'tmp'])
    await mkdir(path.join(profileRoot, child), { mode: 0o700 })
  process.env.TMPDIR = path.join(profileRoot, 'tmp')
  helpers = await load('scripts/qualification-resource-limits.mjs')
  isolation = await load('scripts/native-smoke-window.mjs')
  oracle = await load('scripts/smart-patch-qualification-oracles.mjs')
  databaseModule = await load('src/main/db/database.ts')
  igsModule = await load('src/main/projects/igs-package.ts')
  report.harness = {
    path: fileURLToPath(import.meta.url),
    sha256: await hashFile(fileURLToPath(import.meta.url)),
    authoredExecutionStatus: 'ROOT execution; source author did not import or execute the harness.',
  }
  checkpoint()
  await verifyProvision()
  if (phase === 'prepare') {
    await prepareFixture()
    await launch()
    await expect
      .poll(async () => (await api('getGenerationState', projectId))[STATE_CAPABILITY], {
        timeout: 120_000,
      })
      .toBe(true)
    await saveAndRead('initial-reopened')
    const initialCount = window.locator('input[aria-label="Images per click"]')
    await initialCount.fill('1')
    await initialCount.press('Enter')
    await expect(window.getByRole('button', { name: 'Generate', exact: true })).toBeEnabled({
      timeout: 120_000,
    })
    await window.screenshot({
      path: path.join(payload, '01-selected-smart-regional-flow-ready.png'),
    })
    const A = await capture('A', await generate())
    await window.screenshot({ path: path.join(payload, '02-regional-flow-A.png') })
    assert.equal(
      await hashFile(packagePath),
      report.project.originalPackageSha256,
      'Generate must not implicitly Save',
    )
    await acceptA(A)
    await changeLocal(LOCAL_B)
    await saveAndRead('B-authored')
    const beforeB = await hashFile(packagePath)
    const B = await capture('B', await generate())
    assert.equal(await hashFile(packagePath), beforeB)
    for (const name of Object.keys(A.frozen.files))
      assert.ok(A.files[name].equals(B.files[name]), `A/B changed ${name}`)
    assert.notEqual(
      A.processing.rgbSha256,
      B.processing.rgbSha256,
      'The local-negative change must reach actual native processing RGB',
    )
    const changed = A.alpha.reduce(
      (n, alpha, i) =>
        n +
        (alpha === 255
          ? [0, 1, 2].filter(
              (channel) => A.decoded.data[4 * i + channel] !== B.decoded.data[4 * i + channel],
            ).length
          : 0),
      0,
    )
    assert.ok(changed > 0, 'Local regional-negative B must change actual fully-visible world RGB')
    report.localNegativeVisibleRgbChanges = changed
    await discard()
    await changeLocal(LOCAL_A)
    await saveAndRead('A-reset-before-cancel')
    const canceledId = await generate(true)
    await expect
      .poll(async () => (await row(canceledId)).status, {
        timeout: 120_000,
        intervals: [50, 100, 200],
      })
      .toBe('canceled')
    const cancellation = await window.evaluate(() => ({
      target: window.__smartRegionalCancel,
      result: window.__smartRegionalCancelResult,
    }))
    assert.ok(cancellation.target?.requested && cancellation.target.progress.step > 0)
    assert.equal(cancellation.result?.ok, true)
    assert.equal((await results()).candidates.length, 0)
    await expect
      .poll(async () => (await api('getGenerationState', projectId)).phase, { timeout: 30_000 })
      .toBe('idle')
    const canceled = await row(canceledId),
      canceledPayload = JSON.parse(canceled.frozen_payload_json)
    assert.equal(canceledPayload.mode, MODE)
    assert.equal(canceledPayload.regional.profile, PROFILE)
    assert.equal(canceledPayload.regional.recipe.regions[0].negative.prompt.text, LOCAL_A)
    report.canceled = { row: canceled, payload: canceledPayload, cancellation }
    await json(path.join(payload, 'canceled-A.json'), report.canceled)
    await futureEdits()
    await exclusive(path.join(payload, 'final-edited-package.igs'), await readFile(packagePath))
    check(
      `Prepare phase: genuine ${MODE} A/B, progress Cancel and future source/mask/settings edits are durably saved for later frozen Retry`,
    )
  } else {
    assert.equal(
      await hashFile(packagePath),
      previous.editedPackageSha256,
      'Saved Project changed between qualification phases',
    )
    projectId = previous.project.projectId
    documentId = previous.project.documentId
    ids = previous.project.ids
    authored = previous.project.authored
    model = previous.model
    report.project = previous.project
    report.model = model
    report.previousRun = {
      path: previousPath,
      sha256: await hashFile(previousPath),
      role: 'Passed mode-matched prepare-phase A/B/Cancel/Add/Save evidence; this phase performs one frozen Retry only.',
    }
    const priorA = previous.scenarios.find((x) => x.label === 'A'),
      canceledPayload = previous.canceled.payload
    assert.ok(priorA && previous.localNegativeVisibleRgbChanges > 0)
    const A = {
      ...priorA,
      bytes: await readFile(path.join(priorA.caseRoot, 'world.png')),
      files: {},
    }
    for (const name of Object.keys(priorA.frozen.files))
      A.files[name] = await readFile(path.join(priorA.caseRoot, name))
    leftExpected = A.files['regional-0.alpha8']
    rightExpected = A.files['regional-1.alpha8']
    belowRgba = sourceFixture()
    await launch()
    const currentEdited = await current()
    assert.equal(patch(currentEdited).generationDraft.seed.value, 321)
    assert.equal(currentEdited.regionalGuidance.filter((x) => x.enabled).length, 0)
    assert.equal(currentEdited.layers.find((x) => x.id === ids.below).opacity, 0.25)
    assert.equal(
      currentEdited.layers.find((x) => x.id === ids.future).visible,
      CURRENT_FUTURE_VISIBLE,
    )
    const source = await row(previous.canceled.row.id)
    assert.equal(source.status, 'canceled')
    assert.equal(source.frozen_payload_json, previous.canceled.row.frozen_payload_json)
    const beforeRows = new Set((await rows()).map((x) => x.id))
    await window.getByRole('button', { name: 'Open Queue Manager', exact: true }).click()
    const manager = window.getByRole('dialog', { name: 'Queue Manager', exact: true }),
      job = manager.locator(`[data-job-id="${source.id}"]`)
    await expect(job).toHaveAttribute('data-status', 'canceled')
    await expect(job.getByRole('button', { name: 'Retry job', exact: true })).toBeEnabled({
      timeout: 120_000,
    })
    await window.screenshot({ path: path.join(payload, '03-edited-current-frozen-flow-retry.png') })
    await job.getByRole('button', { name: 'Retry job', exact: true }).click()
    await expect
      .poll(async () => (await rows()).filter((x) => !beforeRows.has(x.id)).length, {
        timeout: 120_000,
      })
      .toBe(1)
    const retry = (await rows()).find((x) => !beforeRows.has(x.id))
    report.ownedQueueIds.push(retry.id)
    checkpoint()
    await manager.getByRole('button', { name: 'Close Queue Manager', exact: true }).click()
    const R = await capture('retry-A', retry.id, false)
    assert.ok(R.bytes.equals(A.bytes), 'Restarted frozen Retry must reproduce A exact PNG bytes')
    assert.equal(R.rgbaSha256, A.rgbaSha256)
    assert.equal(R.processing.rgbSha256, A.processing.rgbSha256)
    assert.notEqual(R.frozen.bundle.id, canceledPayload.bundle.id)
    assert.equal(R.frozen.bundle.itemIndex, canceledPayload.bundle.itemIndex)
    assert.deepEqual(R.frozen.regional, canceledPayload.regional)
    assert.deepEqual(R.frozen.item, canceledPayload.item)
    assert.deepEqual(R.frozen.files, canceledPayload.files)
    for (const name of Object.keys(A.files))
      assert.ok(R.files[name].equals(A.files[name]), `Frozen Retry changed ${name}`)
    assert.equal(
      await hashFile(packagePath),
      previous.editedPackageSha256,
      'Retry must not Save over current edits',
    )
    const edited = await igsModule.readIgsPackage(packagePath)
    assert.equal(
      edited.project.layers.find((x) => x.id === ids.patch).generationDraft.seed.value,
      321,
    )
    assert.equal(edited.project.layers.find((x) => x.id === ids.below).opacity, 0.25)
    assert.equal(
      edited.project.layers.find((x) => x.id === ids.future).visible,
      CURRENT_FUTURE_VISIBLE,
    )
    assert.equal(edited.project.regionalGuidance.length, 1)
    assert.equal(edited.project.regionalGuidance[0].enabled, false)
    await exclusive(path.join(payload, 'final-package.igs'), await readFile(packagePath))
    check(
      `Public renderer frozen ${MODE} Retry consumes exact saved source/no-source/independent-KEEP/raw bytes and reproduces A after actual restart/source/mask/settings edits`,
    )
    const beforeDiscard = await results()
    report.retryRetirement = {
      availableIds: beforeDiscard.candidates.map((x) => x.candidateId),
      reason:
        'Explicit public discard avoids the ordinary synchronous unaccepted-results close confirmation.',
    }
    await discard()
    report.retryRetirement.availableAfter = (await results()).candidates.length
    assert.equal(report.retryRetirement.availableAfter, 0)
    assert.equal(
      await hashFile(packagePath),
      previous.editedPackageSha256,
      'Discarding temporary Retry output must not Save',
    )
    check(
      'Explicit public discard retires only this Retry candidate before normal application close',
    )
  }
  assert.deepEqual(report.pageErrors, [])
  assert.equal(report.samplerError, undefined)
  await assertObserverClean(phase === 'prepare' ? 2 : 1)
  await closeNative('complete')
  assert.ok(
    report.observedWorkers.some((x) => x.role === 'inference') &&
      report.observedWorkers.some((x) => x.role === 'derivatives'),
  )
  assert.deepEqual(
    await buildIdentity(),
    report.builtBundles,
    'Compiled app bytes must remain fixed during this phase',
  )
  assert.ok(closedProofs.length === 1 && closedProofs.every((x) => x.confirmed))
  assert.equal(report.normalClose?.completed, true)
  assert.equal(report.forcedOwnedClose, undefined)
  assert.equal(report.closeError, undefined)
  success = true
  report.outcome = 'passed'
} catch (error) {
  report.outcome = 'failed'
  report.errors.push(String(error.stack ?? error))
  if (window) {
    try {
      report.failureUi = await window.evaluate(() => ({
        text: document.body.innerText.slice(-18000),
        progress: window.__smartRegionalProgress,
        cancellation: window.__smartRegionalCancelResult,
      }))
    } catch {}
  }
  if (database && window) {
    try {
      for (const value of await rows())
        if (['pending', 'running'].includes(value.status))
          await api('cancelGenerationJob', { id: value.id, statusSequence: value.status_sequence })
    } catch (cleanupError) {
      report.cancelOnFailureError = String(cleanupError.stack ?? cleanupError)
    }
  }
  throw error
} finally {
  try {
    await closeNative(success ? 'final-noop' : 'failure')
  } catch (error) {
    report.physicalExitError = String(error.stack ?? error)
    report.outcome = 'failed'
  }
  if (database) {
    await database.close()
    database = null
  }
  report.finishedAt = new Date().toISOString()
  report.retainedSharedProject = {
    projectId,
    documentId,
    packagePath,
    queueIds: report.ownedQueueIds,
    condition:
      'Keep until ROOT retains exact package/bundle/receipt evidence and explicitly resolves these owned qualification rows; runtime/models remain shared protected dependencies.',
  }
  checkpoint()
  if (!success || report.physicalExitError) process.exitCode = 1
}
