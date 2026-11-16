/** Nonshipping current-packaged startup compatibility consumer; no signed-update/recovery adoption. */
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants, createReadStream } from 'node:fs'
import * as fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'

import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
} from '../qualification-resource-limits.mjs'
import { snapshotDatabase } from './application-state-upgrade-fixture.mjs'

const exec = promisify(execFile)
const GiB = 1024 ** 3
async function digest(filename, algorithm = 'sha256') {
  const value = createHash(algorithm)
  for await (const bytes of createReadStream(filename)) value.update(bytes)
  return value.digest(algorithm === 'sha512' ? 'base64' : 'hex')
}
async function witness(filename) {
  const value = await fs.lstat(filename, { bigint: true })
  assert.ok(value.isFile() && !value.isSymbolicLink())
  return {
    dev: String(value.dev),
    ino: String(value.ino),
    mode: String(value.mode),
    nlink: String(value.nlink),
    sizeBytes: Number(value.size),
    mtimeNs: String(value.mtimeNs),
    ctimeNs: String(value.ctimeNs),
    sha256: await digest(filename),
    sha512: await digest(filename, 'sha512'),
  }
}
async function proc(pid) {
  try {
    const text = await fs.readFile(`/proc/${pid}/stat`, 'utf8'),
      parts = text.slice(text.lastIndexOf(')') + 2).split(' ')
    return {
      pid,
      start: parts[19],
      state: parts[0],
      group: (await fs.readFile(`/proc/${pid}/cgroup`, 'utf8')).trim().slice(3),
    }
  } catch (error) {
    if (['ENOENT', 'ESRCH'].includes(error.code)) return null
    throw error
  }
}
async function groupPids(group) {
  try {
    return (await fs.readFile(`/sys/fs/cgroup${group}/cgroup.procs`, 'utf8'))
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(Number)
  } catch (error) {
    if (['ENOENT', 'ESRCH', 'ENODEV'].includes(error.code)) return []
    throw error
  }
}
async function inventory(directory) {
  const result = []
  async function visit(filename) {
    const entry = await fs.lstat(filename)
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      for (const child of (await fs.readdir(filename)).sort())
        await visit(path.join(filename, child))
    } else if (entry.isSymbolicLink())
      result.push({
        path: filename,
        kind: 'symlink',
        target: await fs.readlink(filename),
        dev: entry.dev,
        ino: entry.ino,
        mode: entry.mode,
      })
    else {
      assert.ok(entry.isFile())
      result.push({ path: filename, kind: 'file', ...(await witness(filename)) })
    }
  }
  await visit(directory)
  return result
}
const canonical = (value) =>
  JSON.stringify(value, (_key, field) =>
    field && typeof field === 'object' && !Array.isArray(field)
      ? Object.fromEntries(Object.entries(field).sort(([a], [b]) => a.localeCompare(b)))
      : field,
  )
const rows = (value) => [...value].sort((a, b) => canonical(a).localeCompare(canonical(b)))

/** Account for the ONE known Main startup scan update; preserve every other existing value. */
function compareStartup(before, after, { first, projectId, migrationHash }) {
  assert.equal(after.integrityCheck, 'ok')
  assert.deepEqual(after.foreignKeyCheck, [])
  const beforeNames = Object.keys(before.tables).sort(),
    afterNames = Object.keys(after.tables).sort()
  assert.deepEqual(
    afterNames,
    [...beforeNames, ...(first ? ['model_reference_identity'] : [])].sort(),
  )
  const oldSchema = after.schema.filter(
    (entry) =>
      !['model_reference_identity', 'idx_model_reference_identity_source'].includes(entry.name),
  )
  assert.deepEqual(
    oldSchema,
    before.schema.filter(
      (entry) =>
        !['model_reference_identity', 'idx_model_reference_identity_source'].includes(entry.name),
    ),
  )
  const migrations = after.schemaMigrations
  assert.equal(migrations.length, 30)
  assert.deepEqual(migrations.slice(0, 29), before.schemaMigrations.slice(0, 29))
  assert.equal(migrations[29].name, '0030_model_reference_identity.sql')
  assert.equal(migrations[29].sha256, migrationHash)
  assert.ok(!Number.isNaN(Date.parse(migrations[29].applied_at)))
  if (!first) assert.deepEqual(migrations, before.schemaMigrations)
  assert.deepEqual(after.tables.model_reference_identity.rows, [])
  const table = after.schema.find(
    (entry) => entry.name === 'model_reference_identity' && entry.type === 'table',
  )
  const index = after.schema.find(
    (entry) => entry.name === 'idx_model_reference_identity_source' && entry.type === 'index',
  )
  assert.ok(
    table?.sql.endsWith('STRICT') && index?.sql.includes('(source_key, type, sha256, size_bytes)'),
  )
  assert.ok(
    table.sql.includes("CHECK (source_kind IN ('civitai', 'supported_dependency'))") &&
      table.sql.includes('CHECK (size_bytes > 0)'),
  )
  const deltas = []
  for (const name of beforeNames) {
    assert.deepEqual(after.tables[name].columns, before.tables[name].columns, `${name} columns`)
    if (name === 'schema_migrations') {
      assert.deepEqual(
        rows(
          after.tables[name].rows.filter((row) => row.name !== '0030_model_reference_identity.sql'),
        ),
        rows(
          before.tables[name].rows.filter(
            (row) => row.name !== '0030_model_reference_identity.sql',
          ),
        ),
      )
      continue
    }
    if (name !== 'project_index') {
      assert.deepEqual(
        rows(after.tables[name].rows),
        rows(before.tables[name].rows),
        `${name} rows`,
      )
      continue
    }
    const previous = rows(before.tables[name].rows),
      next = rows(after.tables[name].rows)
    assert.equal(previous.length, next.length)
    for (let i = 0; i < previous.length; i++) {
      const a = previous[i],
        b = next[i]
      assert.equal(a.local_project_key, b.local_project_key)
      const changed = Object.keys(a).filter((key) => canonical(a[key]) !== canonical(b[key]))
      if (changed.length) {
        assert.equal(a.local_project_key, projectId)
        assert.deepEqual(changed, ['indexed_at'])
        assert.ok(!Number.isNaN(Date.parse(b.indexed_at)))
        deltas.push({
          table: name,
          key: projectId,
          column: 'indexed_at',
          before: a.indexed_at,
          after: b.indexed_at,
          owner: 'ProjectService.initialize -> ProjectIndexRepository.scanWorkspace/indexSaved',
        })
      }
    }
  }
  return {
    exactHistoricalTables: beforeNames.length,
    startupDeltas: deltas,
    migrationNamesAndHashesRetained: 29,
    newTableEmpty: true,
    newTableStrictAndChecksPresent: true,
    newSourceIndexPresent: true,
  }
}

// Existing qualification-only EWMH client from the retained native harness. xdotool windowclose
// destroys X11 windows and is never used. Host Python here is only the ctypes desktop messenger;
// the worker fixture uses its independently pinned Node executable and never SystemPython/ML.
const EWMH = String.raw`import ctypes as c,sys,subprocess,json,os
pid=int(sys.argv[1]);start=sys.argv[2];xid=int(sys.argv[3]);assert pid>1 and xid>0
with open('/proc/'+str(pid)+'/stat') as f:assert f.read().rsplit(') ',1)[1].split()[19]==start
assert int(subprocess.check_output(['/usr/bin/xdotool','getwindowpid',str(xid)],text=True).strip())==pid
class Data(c.Union):_fields_=[('b',c.c_char*20),('s',c.c_short*10),('l',c.c_long*5)]
class Client(c.Structure):_fields_=[('type',c.c_int),('serial',c.c_ulong),('send_event',c.c_int),('display',c.c_void_p),('window',c.c_ulong),('message_type',c.c_ulong),('format',c.c_int),('data',Data)]
class Event(c.Union):_fields_=[('client',Client),('pad',c.c_long*24)]
x=c.CDLL('libX11.so.6');x.XOpenDisplay.argtypes=[c.c_char_p];x.XOpenDisplay.restype=c.c_void_p;x.XDefaultRootWindow.argtypes=[c.c_void_p];x.XDefaultRootWindow.restype=c.c_ulong;x.XInternAtom.argtypes=[c.c_void_p,c.c_char_p,c.c_int];x.XInternAtom.restype=c.c_ulong;x.XSendEvent.argtypes=[c.c_void_p,c.c_ulong,c.c_int,c.c_long,c.POINTER(Event)];x.XSendEvent.restype=c.c_int;x.XSync.argtypes=[c.c_void_p,c.c_int];x.XCloseDisplay.argtypes=[c.c_void_p]
d=x.XOpenDisplay(None);assert d
try:
 e=Event();e.client.type=33;e.client.send_event=1;e.client.display=d;e.client.window=xid;e.client.message_type=x.XInternAtom(d,b'_NET_CLOSE_WINDOW',0);e.client.format=32;e.client.data.l[0]=0;e.client.data.l[1]=2
 assert x.XSendEvent(d,x.XDefaultRootWindow(d),0,(1<<19)|(1<<20),c.byref(e))!=0;x.XSync(d,0)
finally:x.XCloseDisplay(d)
with open('/proc/self/stat') as f:own=f.read().rsplit(') ',1)[1].split()[19]
print(json.dumps({'pid':pid,'start':start,'windowId':xid,'requested':'_NET_CLOSE_WINDOW','forced':False,'helper':{'pid':os.getpid(),'start':own}}))
`

export async function runStateUpgrade({ repo, run, root, fixture, packageManifest }) {
  const base = path.join(
    os.homedir(),
    '.codex/artifacts/imagegen-studio/runs/application-state-upgrade',
  )
  assert.ok(run.startsWith(base + path.sep) && (await fs.realpath(run)) === run)
  assert.equal(root, path.join(run, 'payloads/subject'))
  assert.equal(await fs.realpath(root), root)
  assert.equal(fixture.root, root)
  assert.equal(fixture.appData, path.join(root, 'data/imagegen-studio'))
  assert.match(packageManifest.revision, /^r[1-9][0-9]*$/)
  const reportPath = path.join(run, `native-result-${packageManifest.revision}.json`)
  await assert.rejects(fs.lstat(reportPath), { code: 'ENOENT' })
  assert.equal(
    JSON.parse(await fs.readFile(path.join(run, 'artifact-lifecycle.json'), 'utf8')).state,
    'running',
  )
  const require = createRequire(path.join(repo, 'package.json')),
    { chromium, expect } = require('@playwright/test')
  const deadline = Date.now() + 540_000
  const launcherGroup = (await fs.readFile('/proc/self/cgroup', 'utf8')).trim().slice(3)
  assert.match(launcherGroup, /\/igs-[^/]+\.service$/)
  assert.equal(
    (await fs.readFile(`/sys/fs/cgroup${launcherGroup}/memory.swap.max`, 'utf8')).trim(),
    '0',
  )
  assert.ok(
    Number((await fs.readFile(`/sys/fs/cgroup${launcherGroup}/memory.max`, 'utf8')).trim()) <= GiB,
  )
  assert.ok(process.env.TMPDIR && (await fs.realpath(process.env.TMPDIR)) === process.env.TMPDIR)
  const scratchRelative = path.relative(path.dirname(path.dirname(base)), process.env.TMPDIR)
  assert.ok(
    scratchRelative && !scratchRelative.startsWith('..') && !path.isAbsolute(scratchRelative),
  )
  const scratchEntry = await fs.lstat(process.env.TMPDIR)
  assert.ok(scratchEntry.isDirectory() && !scratchEntry.isSymbolicLink())
  assert.equal(scratchEntry.uid, process.getuid())
  assert.ok(
    !(await fs.readdir(process.env.TMPDIR)).some((name) =>
      /^appimage_extracted_|^\.mount_Curren/.test(name),
    ),
    'Prior owned runtime scratch must settle; never resume/sweep.',
  )
  async function ownedDirectory(directory) {
    const entry = await fs.lstat(directory)
    assert.ok(entry.isDirectory() && !entry.isSymbolicLink(), directory)
    assert.equal(entry.uid, process.getuid(), directory)
    assert.equal(await fs.realpath(directory), directory)
  }
  for (const directory of [root, path.join(root, 'data'), fixture.appData])
    await ownedDirectory(directory)
  const target = path.join(root, 'Applications/Current.AppImage')
  for (const name of [
    'Applications',
    'config',
    'cache',
    'empty-cwd',
    'chrome-profile-first',
    'chrome-profile-second',
  ]) {
    const directory = path.join(root, name)
    await fs.mkdir(directory, { mode: 0o700, recursive: true })
    await ownedDirectory(directory)
  }
  await fs.writeFile(
    path.join(root, 'native-plan.json'),
    JSON.stringify({ runtime: fixture.runtime, packageVersion: packageManifest.version }) + '\n',
    { flag: 'wx', mode: 0o600 },
  )
  await fs.copyFile(packageManifest.package.path, target, constants.COPYFILE_EXCL)
  await fs.chmod(target, 0o755)
  const targetBefore = await witness(target),
    checkpointBefore = await inventory(fixture.checkpoint29.root)
  const staticRuntime = async () => ({
    pointer: await witness(fixture.runtime.pointerFile),
    program: await witness(fixture.runtime.programPath),
    environment: (await inventory(fixture.runtime.environmentRoot)).filter(
      (entry) => entry.path !== fixture.runtime.logPath,
    ),
    nodeSha256: await digest(fixture.runtime.nodePath),
  })
  const runtimeBefore = await staticRuntime(),
    initialProject = await witness(fixture.project.projectFile)
  assert.equal(runtimeBefore.nodeSha256, fixture.runtime.nodeSha256)
  assert.equal(initialProject.sha256, fixture.project.initialProject.sha256)
  assert.equal(targetBefore.sha256, packageManifest.package.sha256)
  for (const [file, expected] of Object.entries(packageManifest.originals))
    assert.equal(await digest(file), expected)
  for (const [file, expected] of Object.entries(packageManifest.source))
    assert.equal(await digest(path.join(repo, file)), expected)
  const baseline = snapshotDatabase(fixture.database.checkpointFile, { closed: true })
  assert.deepEqual(snapshotDatabase(fixture.database.file), baseline)
  assert.equal(baseline.schemaMigrations.length, 29)
  assert.equal(baseline.tables.model_reference_identity, undefined)
  const migrationHash = await digest(
    path.join(repo, 'src/main/db/migrations/0030_model_reference_identity.sql'),
  )
  const allEvents = async () => {
    try {
      return (await fs.readFile(path.join(root, 'native-events.ndjson'), 'utf8'))
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(JSON.parse)
    } catch (error) {
      if (error.code === 'ENOENT') return []
      throw error
    }
  }
  const logs = async () => {
    try {
      return (await fs.readFile(fixture.runtime.logPath, 'utf8'))
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(JSON.parse)
    } catch (error) {
      if (error.code === 'ENOENT') return []
      throw error
    }
  }
  const phases = [],
    budgets = [],
    executions = [],
    observed = new Map(),
    connected = [],
    outputs = []
  let active = null
  const write = (name, value) =>
    fs.writeFile(path.join(root, name), JSON.stringify(value, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    })
  async function wait(label, predicate, milliseconds = 90_000, checkObservers = true) {
    const until = Math.min(deadline, Date.now() + milliseconds)
    while (Date.now() < until) {
      if (active)
        for (const group of active.groups)
          for (const pid of await groupPids(group)) {
            if (active.launcherBaseline.has(pid)) continue
            const identity = await proc(pid)
            if (identity) observed.set(`${pid}:${identity.start}`, identity)
          }
      if (checkObservers) {
        const error = (await allEvents()).find((entry) =>
          [
            'native-error-box',
            'qualification-observer-error',
            'uncaught-exception-monitor',
            'bootstrap-watchdog',
          ].includes(entry.name),
        )
        if (error) throw new Error(`${label}: ${JSON.stringify(error)}`)
      }
      if (await predicate()) return
      await delay(50)
    }
    throw new Error(`${label} exceeded its finite deadline.`)
  }
  async function recordBudget(label) {
    const groups = [
      ...new Set([
        launcherGroup,
        ...active.checks.flatMap((check) =>
          check.groups.filter((group) => group.ownedScope).map((group) => group.group),
        ),
      ]),
    ]
    const timers = [
      ...new Set(
        active.checks.flatMap((check) =>
          check.groups.flatMap((group) =>
            [group.deadlineTimer, ...(group.deadlineTimers ?? [])].filter(Boolean),
          ),
        ),
      ),
    ]
    assert.ok(timers.length <= 3)
    let total = timers.length * 128 * 1024 ** 2
    const samples = []
    for (const group of groups) {
      const cap = (await fs.readFile(`/sys/fs/cgroup${group}/memory.max`, 'utf8')).trim(),
        swap = (await fs.readFile(`/sys/fs/cgroup${group}/memory.swap.max`, 'utf8')).trim()
      assert.ok(/^\d+$/.test(cap) && Number(cap) <= GiB)
      assert.equal(swap, '0')
      total += Number(cap)
      samples.push({
        group,
        memoryMax: cap,
        swapMax: swap,
        memoryCurrent: (await fs.readFile(`/sys/fs/cgroup${group}/memory.current`, 'utf8')).trim(),
        memoryPeak: (await fs.readFile(`/sys/fs/cgroup${group}/memory.peak`, 'utf8')).trim(),
      })
    }
    assert.ok(total <= (19 * GiB) / 8)
    budgets.push({
      phase: active.phase,
      label,
      groups: samples,
      watchdogTimers: timers,
      watchdogMemoryMaxEach: 128 * 1024 ** 2,
      aggregateMemoryMax: total,
      zeroSwap: true,
      promotionOverheadQualified: false,
    })
  }
  async function bind(identity, refresh = false) {
    active.authorized.add(path.basename(identity.group))
    const execute = async (command, args, options) => {
      const mapped = args.map((value) =>
        value === 'MemoryMax=10G' || value === 'MemoryMax=12G' ? 'MemoryMax=1G' : value,
      )
      if (mapped.join('\0') !== args.join('\0'))
        assert.ok(
          command === 'systemctl' &&
            args.includes('set-property') &&
            args.some((value) => active.authorized.has(value)),
        )
      executions.push({ command, args: mapped })
      return await exec(command, mapped, options)
    }
    const proof = await boundQualificationProcess(identity.pid, {
      execute,
      deadlineSeconds: 600,
      surviveMainDeath: true,
      refreshMainDeathProof: refresh,
      deadlineAt: deadline,
    })
    assert.equal(proof.nativeIdentity.start, identity.start)
    active.checks.push(proof)
    for (const group of proof.groups) active.groups.add(group.group)
    await recordBudget(refresh ? 'refreshed-before-close' : 'startup-admitted')
    return proof
  }
  async function nativeClose(ready) {
    const identity = await proc(ready.pid)
    assert.ok(identity && identity.start === ready.ownProcess.startTicks)
    const result = await exec(
      '/usr/bin/xdotool',
      ['search', '--onlyvisible', '--pid', String(ready.pid)],
      { timeout: 5000 },
    )
    const ids = result.stdout.trim().split(/\s+/).filter(Boolean)
    assert.equal(ids.length, 1)
    const sent = await exec(
      '/usr/bin/python3',
      ['-c', EWMH, String(ready.pid), identity.start, ids[0]],
      { timeout: 5000 },
    )
    const receipt = JSON.parse(sent.stdout)
    assert.equal(receipt.forced, false)
    assert.equal(receipt.pid, ready.pid)
    observed.set(`${receipt.helper.pid}:${receipt.helper.start}`, {
      ...receipt.helper,
      role: 'desktop-EWMH-messenger',
    })
    await fs.appendFile(path.join(root, 'native-close.ndjson'), JSON.stringify(receipt) + '\n', {
      mode: 0o600,
    })
    return receipt
  }
  async function projectCall(page, method, ...args) {
    const result = await page.evaluate(
      async ({ method, args }) => await globalThis.api.projects[method](...args),
      { method, args },
    )
    assert.equal(result.ok, true, JSON.stringify(result))
    return result.value
  }
  async function settleScreen(page, filename) {
    await expect
      .poll(() =>
        page.evaluate(() =>
          [...document.querySelectorAll('[role="dialog"]')]
            .filter((element) => element.getBoundingClientRect().height > 0)
            .every((element) => getComputedStyle(element).transform === 'none'),
        ),
      )
      .toBe(true)
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    )
    await page.screenshot({ path: path.join(root, filename) })
  }
  async function verifyWorkerPhase(phase, entries) {
    const launches = entries.filter((entry) => entry.type === 'launch')
    assert.ok(launches.length >= 1)
    const native = (await allEvents()).filter((entry) => entry.phase === phase)
    for (const launch of launches) {
      const ready = entries.filter((entry) => entry.pid === launch.pid && entry.type === 'ready')
      const signals = entries.filter((entry) => entry.pid === launch.pid && entry.type === 'signal')
      const exits = entries.filter((entry) => entry.pid === launch.pid && entry.type === 'exit')
      assert.equal(ready.length, 1)
      assert.equal(ready[0].record.protocolVersion, '2')
      assert.equal(signals.length, 1)
      assert.equal(signals[0].signal, 'SIGTERM')
      assert.equal(exits.length, 1)
      assert.equal(exits[0].code, 0)
      assert.ok(
        !entries.some((entry) => entry.pid === launch.pid && entry.type === 'unexpected-request'),
      )
      const spawn = native.find(
        (entry) => entry.name === 'worker-spawn' && entry.childPid === launch.pid,
      )
      assert.ok(spawn && spawn.originalCalls === 1)
      assert.deepEqual(spawn.argv, launch.argv)
      const forwarded = native.filter(
        (entry) => entry.name === 'worker-stdout-forwarded' && entry.childPid === launch.pid,
      )
      assert.equal(forwarded.length, 1)
      assert.equal(forwarded[0].originalCalls, 1)
      assert.ok(forwarded[0].originalListenersInvoked >= 1)
      assert.deepEqual(forwarded[0].ready, ready[0].record)
      assert.ok(
        native.some(
          (entry) =>
            entry.name === 'worker-client-kill' &&
            entry.childPid === launch.pid &&
            entry.signal === 'SIGTERM' &&
            entry.originalCalls === 1 &&
            entry.duringOriginalStdoutDispatch,
        ),
      )
      assert.ok(
        native.some(
          (entry) =>
            entry.name === 'worker-close' &&
            entry.childPid === launch.pid &&
            entry.code === 0 &&
            entry.signal === null,
        ),
      )
      const live = await proc(launch.pid)
      assert.ok(!live || live.start !== launch.startTicks)
      observed.set(`${launch.pid}:${launch.startTicks}`, {
        pid: launch.pid,
        start: launch.startTicks,
        role: 'controlled-protocol-fixture',
        module: launch.module,
      })
    }
    return {
      childLifetimes: launches.length,
      modules: [...new Set(launches.map((entry) => entry.module))],
      actualOriginalStdoutConsumerReached: true,
      privateMismatchCode: {
        value: 'WORKER_VERSION_MISMATCH',
        evidence:
          'SOURCE-INFERRED from pinned ProjectWorkerClient/GenerationWorkerClient deterministic protocol branch; not observed as a public/private error inside Main',
      },
      observedPublicRuntimeStatus: 'needs-repair',
      physicalExitConfirmed: true,
    }
  }
  let result = {
    outcome: 'RUNNING',
    baseRevision: JSON.parse(await fs.readFile(path.join(run, 'artifact-lifecycle.json'), 'utf8'))
      .revision,
    packageManifest,
    fixtureDescriptor: path.join(run, 'historical-fixture.json'),
    phases,
    budgets,
    controlledPorts: [
      'Node JSONL incompatible ready fixture only',
      'native startup continuation admission timing',
      'native Save/Close decisions',
      'original transport/IPC/FD observers and CDP/X11 presentation',
    ],
    publicShipping: false,
  }
  try {
    let previous = baseline
    for (const phase of ['first', 'second']) {
      const startLog = (await logs()).length
      const launcherBaseline = new Set(await groupPids(launcherGroup))
      active = {
        phase,
        launcherBaseline,
        groups: new Set([launcherGroup]),
        checks: [],
        authorized: new Set(),
        child: null,
        exit: null,
        ready: null,
        browser: null,
      }
      const environment = {
        ...process.env,
        IGS_STATE_UPGRADE_ROOT: root,
        IGS_STATE_UPGRADE_PHASE: phase,
        APPIMAGELAUNCHER_DISABLE: '1',
        XDG_DATA_HOME: path.join(root, 'data'),
        XDG_CONFIG_HOME: path.join(root, 'config'),
        XDG_CACHE_HOME: path.join(root, 'cache'),
      }
      for (const key of [
        'NODE_OPTIONS',
        'NODE_PATH',
        'ELECTRON_RUN_AS_NODE',
        'NO_CLEANUP',
        'APPIMAGE',
        'APPDIR',
        'IMAGEGEN_DEV_SERVER_URL',
        'IMAGEGEN_TEST_IMAGE_WORKER',
      ])
        delete environment[key]
      const out = await fs.open(path.join(root, `${phase}-app.log`), 'wx', 0o600)
      outputs.push(out)
      const child = spawn(target, ['--appimage-extract-and-run', '--ozone-platform=x11'], {
        cwd: path.join(root, 'empty-cwd'),
        env: environment,
        stdio: ['ignore', out.fd, out.fd],
      })
      active.child = child
      child.once('close', (code, signal) => {
        active && active.child === child && (active.exit = { code, signal })
      })
      child.once('error', (error) => {
        active && active.child === child && (active.spawnError = String(error.message))
      })
      const wrapperIdentity = await proc(child.pid)
      if (wrapperIdentity)
        observed.set(`${wrapperIdentity.pid}:${wrapperIdentity.start}`, wrapperIdentity)
      await wait(`${phase} native ready held`, async () => {
        try {
          await fs.access(path.join(root, `${phase}-startup-held.json`))
          return true
        } catch (error) {
          if (error.code === 'ENOENT') {
            assert.equal(active.spawnError, undefined)
            assert.equal(active.exit, null)
            return false
          }
          throw error
        }
      })
      const held = JSON.parse(
        await fs.readFile(path.join(root, `${phase}-startup-held.json`), 'utf8'),
      )
      active.mainIdentity = { pid: held.pid, start: held.ownProcess.startTicks }
      active.appDir = held.runtimeProof.appDir
      assert.equal(held.originalCalls, 1)
      assert.equal(held.invocation, 1)
      assert.equal(held.productionContinuationHeld, true)
      const firstIdentity = await proc(held.pid)
      assert.ok(firstIdentity && firstIdentity.start === held.ownProcess.startTicks)
      const expectedGroup = path.posix.join(
        path.posix.dirname(launcherGroup),
        `app-imagegen${String.fromCharCode(92)}x2dstudio-${held.pid}.scope`,
      )
      active.groups.add(expectedGroup)
      await wait(
        `${phase} exact native scope promotion`,
        async () => (await proc(held.pid))?.group === expectedGroup,
        30_000,
      )
      const identity = await proc(held.pid)
      assert.equal(identity.start, held.ownProcess.startTicks)
      const proof = await bind(identity),
        admitted = proof.groups.find((entry) => entry.group === expectedGroup)
      assert.ok(admitted?.ownedScope && admitted.scopeProof?.scopeIdentity)
      assert.equal(
        await digest(path.join(held.runtimeProof.appDir, 'resources/app.asar')),
        packageManifest.package.embedded.asarSha256,
      )
      await write(`${phase}-admit.flag`, {
        pid: held.pid,
        start: identity.start,
        group: expectedGroup,
        scopeIdentity: admitted.scopeProof.scopeIdentity,
      })
      await wait(
        `${phase} production renderer ready`,
        async () => {
          try {
            await fs.access(path.join(root, `${phase}-ready.json`))
            return true
          } catch (error) {
            if (error.code === 'ENOENT') return false
            throw error
          }
        },
        180_000,
      )
      const ready = JSON.parse(await fs.readFile(path.join(root, `${phase}-ready.json`), 'utf8'))
      active.ready = ready
      assert.equal(ready.pid, held.pid)
      assert.equal(ready.group, expectedGroup)
      assert.equal(ready.userData, fixture.appData)
      assert.equal(ready.budget.memoryMax, String(GiB))
      assert.equal(ready.budget.swapMax, '0')
      assert.equal(
        await digest(ready.runtimeProof.actualExecutable, 'sha512'),
        packageManifest.package.runtimeFiles.executable.sha512,
      )
      // No explicit UI interaction has happened. The reader holds a readonly SQL transaction in
      // this DRIVER process, never an extra FD/connection inside Main's POSIX lock owner.
      const startupDatabase = snapshotDatabase(fixture.database.file)
      const comparison = compareStartup(previous, startupDatabase, {
        first: phase === 'first',
        projectId: fixture.project.projectId,
        migrationHash,
      })
      await write(`${phase}-startup-database.json`, { snapshot: startupDatabase, comparison })
      const devtools = path.join(fixture.appData, 'DevToolsActivePort')
      await wait(`${phase} CDP`, async () => {
        try {
          return /^\d+\n\/devtools\/browser\//.test(await fs.readFile(devtools, 'utf8'))
        } catch (error) {
          if (error.code === 'ENOENT') return false
          throw error
        }
      })
      const [port, route] = (await fs.readFile(devtools, 'utf8')).trim().split('\n')
      const browser = await chromium.connectOverCDP(`ws://127.0.0.1:${port}${route}`, {
        timeout: 10_000,
      })
      active.browser = browser
      connected.push(browser)
      const session = await browser.newBrowserCDPSession(),
        info = await session.send('SystemInfo.getProcessInfo')
      await session.detach()
      assert.deepEqual(
        info.processInfo.filter((entry) => entry.type === 'browser').map((entry) => entry.id),
        [ready.pid],
      )
      const page = browser
        .contexts()
        .flatMap((context) => context.pages())
        .find((candidate) => candidate.url().endsWith('/dist/renderer/index.html'))
      assert.ok(page)
      page.setDefaultTimeout(20_000)
      const pageErrors = []
      page.on('pageerror', (error) => pageErrors.push(error.message))
      await expect(page.getByRole('region', { name: 'Home', exact: true })).toBeVisible()
      const runtime = await page.evaluate(async () => await globalThis.api.runtime.getStatus())
      assert.equal(runtime.ok, true)
      assert.equal(runtime.value.kind, 'needs-repair')
      assert.equal(
        runtime.value.detail,
        'The installed Linux/NVIDIA image runtime failed its worker self-test.',
      )
      const notice = page.getByRole('region', { name: 'Image generation status', exact: true })
      await expect(notice).toBeVisible()
      await notice.getByText('Details', { exact: true }).click()
      await expect(notice.getByText(runtime.value.detail, { exact: true })).toBeVisible()
      const listed = await projectCall(page, 'list')
      assert.ok(listed.some((project) => project.id === fixture.project.projectId))
      await page
        .getByRole('button', { name: `Open ${fixture.project.projectTitle}`, exact: true })
        .click()
      await expect(
        page.getByRole('tab', { name: fixture.project.projectTitle, exact: true }),
      ).toBeVisible()
      let opened = await projectCall(page, 'open', fixture.project.projectId)
      assert.equal(opened.kind, 'opened')
      assert.equal(
        opened.tab.generationDraft.positivePrompt.text,
        phase === 'first'
          ? fixture.project.initialPrompt
          : fixture.project.initialPrompt + '\nSaved after the current application upgrade.',
      )
      assert.equal(opened.tab.dirty, false)
      let save = null
      if (phase === 'first') {
        const prompt =
          fixture.project.initialPrompt + '\nSaved after the current application upgrade.'
        await page.getByRole('textbox', { name: 'Positive prompt', exact: true }).fill(prompt)
        await expect
          .poll(async () => (await projectCall(page, 'open', fixture.project.projectId)).tab.dirty)
          .toBe(true)
        await page.getByRole('button', { name: 'Save Project', exact: true }).click()
        await wait('actual default Save committed', async () =>
          (await allEvents()).some(
            (event) =>
              event.phase === phase &&
              event.name === 'original-ipc-return' &&
              event.channel === 'projects:save' &&
              event.ok &&
              event.committed,
          ),
        )
        opened = await projectCall(page, 'open', fixture.project.projectId)
        assert.equal(opened.tab.dirty, false)
        assert.equal(opened.tab.generationDraft.positivePrompt.text, prompt)
        save = {
          committed: true,
          dirty: false,
          prompt,
          file: await witness(fixture.project.projectFile),
          documentId: opened.tab.documentId,
        }
        assert.notEqual(save.file.sha256, initialProject.sha256)
      }
      await settleScreen(page, `${phase}-project-runtime-diagnostic.png`)
      const nativeIdentity = await proc(ready.pid)
      assert.equal(nativeIdentity.start, ready.ownProcess.startTicks)
      await bind(nativeIdentity, true)
      const close = await nativeClose(ready)
      await wait(
        `${phase} ordinary native physical exit`,
        async () =>
          !(await proc(ready.pid)) &&
          active.exit !== null &&
          (await Promise.all([...active.groups].map(groupPids)))
            .flat()
            .every((pid) => active.launcherBaseline.has(pid)),
        90_000,
      )
      assert.deepEqual(active.exit, { code: 0, signal: null })
      await out.close()
      const execute = async (command, args, options) => {
        executions.push({ command, args })
        return await exec(command, args, options)
      }
      const physicalExit = await confirmQualificationProcessExit(active.checks, { execute })
      assert.equal(physicalExit.confirmed, true)
      await wait(
        `${phase} extract runtime cleanup`,
        async () => {
          try {
            await fs.lstat(ready.runtimeProof.appDir)
            return false
          } catch (error) {
            if (error.code === 'ENOENT') return true
            throw error
          }
        },
        20_000,
      )
      const workerEntries = (await logs()).slice(startLog),
        workerProof = await verifyWorkerPhase(phase, workerEntries)
      if (phase === 'first') {
        assert.ok(workerProof.modules.includes('imagegen_worker'))
        assert.ok(workerProof.modules.includes('imagegen_worker.owned_inference'))
      }
      const events = (await allEvents()).filter((event) => event.phase === phase)
      assert.equal(
        events.filter(
          (event) => event.name === 'production-main-required' && event.originalCalls === 1,
        ).length,
        1,
      )
      for (const name of ['app-quit', 'process-exit']) {
        const selected = events.filter((event) => event.name === name)
        assert.equal(selected.length, 1)
        assert.equal(selected[0].code, 0)
        assert.equal(selected[0].databaseClosed, true)
        assert.equal(selected[0].databaseCloseCount, 1)
      }
      const archiveBefore = JSON.parse(
        await fs.readFile(path.join(root, `${phase}-archive-before-main.json`), 'utf8'),
      )
      const archiveAfter = events.filter(
        (event) => event.name === 'borrowed-archive-after-main-disposer',
      )
      assert.equal(archiveAfter.length, 1)
      assert.equal(archiveAfter[0].borrowedArchiveFd, archiveBefore.borrowedArchiveFd)
      assert.deepEqual(archiveAfter[0].metadata, archiveBefore.metadata)
      assert.equal(archiveBefore.noBorrowedFdRead, true)
      assert.equal(archiveAfter[0].noBorrowedFdRead, true)
      assert.deepEqual(pageErrors, [])
      const afterCloseDatabase = snapshotDatabase(fixture.database.file)
      phases.push({
        phase,
        wrapperPid: child.pid,
        wrapperIdentity,
        wrapperExit: active.exit,
        ready,
        startupAdmission: {
          held,
          admitted,
          released: JSON.parse(
            await fs.readFile(path.join(root, `${phase}-startup-released.json`), 'utf8'),
          ),
        },
        startupDatabaseComparison: comparison,
        runtimePublicStatus: runtime.value,
        saved: save,
        reopenedTab: opened.tab,
        workers: workerProof,
        workerEntries,
        borrowedArchiveDescriptor: {
          before: archiveBefore,
          afterMainDisposer: archiveAfter[0],
          remainsOpenAtExitObserver: true,
        },
        close,
        checks: active.checks,
        physicalExit,
        afterCloseDatabase,
      })
      previous = afterCloseDatabase
      await browser.close()
      active = null
    }
    assert.deepEqual(await staticRuntime(), runtimeBefore)
    assert.deepEqual(await inventory(fixture.checkpoint29.root), checkpointBefore)
    assert.deepEqual(await witness(target), targetBefore)
    for (const [file, expected] of Object.entries(packageManifest.originals))
      assert.equal(await digest(file), expected)
    for (const [file, expected] of Object.entries(packageManifest.source))
      assert.equal(await digest(path.join(repo, file)), expected)
    result = {
      ...result,
      outcome: 'PASS',
      normalAppProcessExits: 2,
      actualMigrationsBefore: 29,
      actualMigrationsAfter: 30,
      runtimeBefore,
      runtimeAfter: await staticRuntime(),
      checkpointUntouched: true,
      targetUnchanged: true,
      observedProcesses: [...observed.values()],
      executions,
      finalDatabase: previous,
      finalProject: await witness(fixture.project.projectFile),
      limitations: [
        'Current packaged startup compatibility, not a signed outer app update or recovery mutation.',
        'Historical29 application owners executed with pinned current dependencies; no historical Electron or dependency-era ABI acceptance.',
        'Same canonical private subject path with a closed checkpoint copy; no cross-path relocation or automatic production DB backup/rollback claim.',
        'Node program supplies incompatible ready data only. Main, runtime/client owners, Project Save and persistence remain actual. No CPython/GPU/model/ML-runtime delivery qualification.',
        'Private mismatch code is source-inferred in Main; any direct owner control observing that code is separate Root evidence.',
        'Native promotion overhead before exact startup admission remains unqualified; serial launcher1GiB+oneMain1GiB+finite128MiB watchdogs, zero swap.',
        'Known PID/start/cgroup and extraction settlement only; no global process/descriptor absence or all-runtime lease claim.',
      ],
    }
  } catch (error) {
    result = {
      ...result,
      outcome: 'FAIL',
      error: String(error.stack ?? error),
      observedProcesses: [...observed.values()],
      executions,
    }
    await fs.writeFile(
      path.join(root, 'native-abort.flag'),
      'Own ordinary failure close; preserve all data.\n',
      { mode: 0o600 },
    )
    let settled = false
    try {
      if (active) {
        // A startup refusal can precede renderer-ready and scope admission. Discover only the
        // exact Main identity which our bootstrap recorded; never infer exit from its wrapper.
        const entered = (await allEvents()).find(
          (event) => event.phase === active.phase && event.name === 'production-main-enter',
        )
        if (entered) {
          assert.equal(entered.pid, entered.ownProcess.pid)
          active.mainIdentity = { pid: entered.pid, start: entered.ownProcess.startTicks }
          active.appDir = entered.runtimeProof.appDir
          active.groups.add(
            path.posix.join(
              path.posix.dirname(launcherGroup),
              `app-imagegen${String.fromCharCode(92)}x2dstudio-${entered.pid}.scope`,
            ),
          )
          observed.set(`${entered.pid}:${entered.ownProcess.startTicks}`, active.mainIdentity)
        }
      }
      if (active?.ready) await nativeClose(active.ready)
      await wait(
        'own failure physical settlement',
        async () => {
          if (active === null) return true
          if (!active.mainIdentity || active.exit === null) return false
          const live = await proc(active.mainIdentity.pid)
          if (live?.start === active.mainIdentity.start) return false
          if (
            !(await Promise.all([...active.groups].map(groupPids)))
              .flat()
              .every((pid) => active.launcherBaseline.has(pid))
          )
            return false
          for (const identity of observed.values()) {
            const current = await proc(identity.pid)
            if (current?.start === identity.start) return false
          }
          try {
            await fs.lstat(active.appDir)
            return false
          } catch (error) {
            if (error.code !== 'ENOENT') throw error
          }
          return true
        },
        30_000,
        false,
      )
      if (active?.checks.length)
        result.failurePhysicalExit = await confirmQualificationProcessExit(active.checks, {
          execute: (command, args, options) => exec(command, args, options),
        })
      settled =
        active === null ||
        Boolean(
          active.mainIdentity &&
          active.exit !== null &&
          (!active.checks.length || result.failurePhysicalExit?.confirmed),
        )
    } catch (failure) {
      result.failureSettlementError = String(failure.stack ?? failure)
    }
    result.failurePhysicalExitComplete = settled
    result.observedProcesses = [...observed.values()]
    if (!settled) {
      const lifecycle = JSON.parse(
        await fs.readFile(path.join(run, 'artifact-lifecycle.json'), 'utf8'),
      )
      lifecycle.pins.push({
        reason:
          'Native compatibility failure has unresolved owned physical exit; preserve raw subject and scratch.',
        report: path.basename(reportPath),
      })
      await fs.writeFile(
        path.join(run, 'artifact-lifecycle.json'),
        JSON.stringify(lifecycle, null, 2) + '\n',
      )
    }
  } finally {
    for (const browser of connected) await browser.close().catch(() => undefined)
    for (const output of outputs) await output.close().catch(() => undefined)
  }
  await fs.writeFile(reportPath, JSON.stringify(result, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  })
  return result
}
