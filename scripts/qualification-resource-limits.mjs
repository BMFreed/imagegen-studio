/** Bound the actual owned native cgroups: KDE can move Electron out of its launcher. */
import { execFile } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const memoryCeiling = 12 * 1024 ** 3
const launchedIdentities = new Map()
const deadlineTimers = new Map()

function processStart(stat) {
  const value = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]
  if (!/^\d+$/.test(value ?? '')) throw new Error('Cannot identify the owned native process.')
  return value
}

function cgroupPath(text) {
  const value = text
    .trim()
    .split('\n')
    .find((line) => line.startsWith('0::'))
    ?.slice(3)
  if (!value || !path.isAbsolute(value) || path.normalize(value) !== value || value === '/') {
    throw new Error('Qualification requires a canonical non-root cgroup v2 path.')
  }
  return value
}

function finiteLimit(text, ceiling) {
  return /^\d+$/.test(text.trim()) && BigInt(text.trim()) <= BigInt(ceiling)
}

/**
 * Only a KDE application scope named for the launched Electron PID may be changed. Other groups are
 * read-only and must already have finite limits (e.g. systemd-run). PID is supplied by the owned
 * Electron launch, not an arbitrary user process.
 */
export async function boundQualificationProcess(
  pid,
  { read = readFile, entries = readdir, execute = exec } = {},
) {
  if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error('Invalid owned Electron PID.')
  const processFile = (id, name) => `/proc/${id}/${name}`
  const initialStat = await read(processFile(pid, 'stat'), 'utf8')
  const start = processStart(initialStat)
  if (launchedIdentities.has(pid) && launchedIdentities.get(pid) !== start) {
    throw new Error('Owned Electron PID was reused after launch.')
  }
  launchedIdentities.set(pid, start)

  // Observe Main and existing descendants, including workers retained outside the launcher.
  const parents = new Map()
  for (const name of await entries('/proc')) {
    if (!/^\d+$/.test(name)) continue
    try {
      const status = await read(processFile(name, 'status'), 'utf8')
      const parent = Number(status.match(/^PPid:\s+(\d+)$/m)?.[1])
      if (Number.isSafeInteger(parent)) parents.set(Number(name), parent)
    } catch (error) {
      if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error
    }
  }
  const owned = new Set([pid])
  let changed = true
  while (changed) {
    changed = false
    for (const [child, parent] of parents) {
      if (owned.has(parent) && !owned.has(child)) {
        owned.add(child)
        changed = true
      }
    }
  }
  const groups = new Map()
  const processIdentities = []
  for (const id of owned) {
    try {
      const group = cgroupPath(await read(processFile(id, 'cgroup'), 'utf8'))
      const identity = processStart(await read(processFile(id, 'stat'), 'utf8'))
      groups.set(group, [...(groups.get(group) ?? []), id])
      processIdentities.push({ pid: id, start: identity })
    } catch (error) {
      if (id === pid || !['ENOENT', 'ESRCH'].includes(error.code)) throw error
    }
  }
  const evidence = []
  for (const [group, pids] of groups) {
    const unit = path.basename(group)
    const ownedScope = unit === `app-imagegen\\x2dstudio-${pid}.scope`
    if (ownedScope) {
      const showGroup = async () =>
        (
          await execute(
            'systemctl',
            ['--user', 'show', '--property=ControlGroup', '--value', unit],
            { timeout: 10_000, maxBuffer: 32 * 1024 },
          )
        ).stdout.trim()
      if ((await showGroup()) !== group) {
        throw new Error('Owned scope ControlGroup does not match the observed Electron cgroup.')
      }
      await execute(
        'systemctl',
        ['--user', 'set-property', '--runtime', unit, 'MemoryMax=12G', 'MemorySwapMax=0'],
        { timeout: 10_000, maxBuffer: 32 * 1024 },
      )
      if ((await showGroup()) !== group) {
        throw new Error('Owned scope ControlGroup changed while setting qualification limits.')
      }
    }
    const root = `/sys/fs/cgroup${group}`
    const memoryMax = (await read(`${root}/memory.max`, 'utf8')).trim()
    const swapMax = (await read(`${root}/memory.swap.max`, 'utf8')).trim()
    if (!finiteLimit(memoryMax, memoryCeiling) || swapMax !== '0') {
      throw new Error(
        `Unbounded qualification cgroup: ${unit} (RAM=${memoryMax}, swap=${swapMax}).`,
      )
    }
    evidence.push({
      group,
      pids,
      ownedScope,
      memoryMax,
      swapMax,
      memoryPeak: (await read(`${root}/memory.peak`, 'utf8')).trim(),
    })
    if (ownedScope) {
      // RuntimeMaxSec is immutable on an already active KDE scope. A separate systemd
      // timer survives launcher termination; its action revalidates PID/starttime/unit.
      const key = `${pid}:${start}`
      const timer = `igs-qualification-deadline-${pid}-${start}`
      if (!deadlineTimers.has(key)) {
        await execute(
          'systemd-run',
          [
            '--user',
            `--unit=${timer}`,
            '--on-active=1800s',
            '-p',
            'MemoryMax=128M',
            '-p',
            'MemorySwapMax=0',
            '-p',
            'RuntimeMaxSec=30',
            process.execPath,
            '--max-old-space-size=64',
            fileURLToPath(import.meta.url),
            '--deadline',
            String(pid),
            start,
            group,
          ],
          { timeout: 10_000, maxBuffer: 32 * 1024 },
        )
        deadlineTimers.set(key, timer)
      }
      evidence.at(-1).deadlineTimer = timer
    }
  }
  const finalStat = await read(processFile(pid, 'stat'), 'utf8')
  if (processStart(finalStat) !== start) {
    throw new Error('Owned Electron process identity changed while checking limits.')
  }
  const finalGroup = cgroupPath(await read(processFile(pid, 'cgroup'), 'utf8'))
  if (!groups.has(finalGroup)) throw new Error('Electron moved cgroups during the limit check.')
  return {
    at: new Date().toISOString(),
    nativeIdentity: { pid, start },
    processIdentities,
    memoryCeilingPerGroup: memoryCeiling,
    zeroSwap: true,
    ownedScopeDeadlineSeconds: 1800,
    groups: evidence,
  }
}

/** A closed CDP channel or dead launcher is insufficient evidence for artifact disposal. */
export async function confirmQualificationProcessExit(
  checks,
  {
    read = readFile,
    execute = exec,
    pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {},
) {
  const identities = new Map()
  for (const check of checks) {
    for (const identity of check.processIdentities) {
      identities.set(`${identity.pid}:${identity.start}`, identity)
    }
  }
  if (identities.size === 0)
    throw new Error('No observed native process identities to confirm exit.')
  const ownedGroups = new Set(
    checks.flatMap(({ groups }) =>
      groups.filter(({ ownedScope }) => ownedScope).map(({ group }) => group),
    ),
  )
  let remaining = []
  for (let attempt = 0; attempt < 20; attempt++) {
    remaining = []
    for (const identity of identities.values()) {
      try {
        if (processStart(await read(`/proc/${identity.pid}/stat`, 'utf8')) === identity.start) {
          remaining.push(identity)
        }
      } catch (error) {
        if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error
      }
    }
    for (const group of ownedGroups) {
      try {
        const events = await read(`/sys/fs/cgroup${group}/cgroup.events`, 'utf8')
        if (!/^populated 0$/m.test(events)) remaining.push({ group, populated: true })
      } catch (error) {
        if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error
      }
    }
    if (remaining.length === 0) {
      const timers = new Set(
        checks.flatMap(({ groups }) =>
          groups.map(({ deadlineTimer }) => deadlineTimer).filter(Boolean),
        ),
      )
      for (const timer of timers) {
        await execute('systemctl', ['--user', 'stop', `${timer}.timer`], {
          timeout: 10_000,
          maxBuffer: 32 * 1024,
        })
      }
      return {
        confirmed: true,
        identities: [...identities.values()],
        stoppedDeadlineTimers: [...timers],
        confirmedOwnedScopeExit: [...ownedGroups],
      }
    }
    await pause(500)
  }
  throw new Error(`Owned native processes remain alive: ${JSON.stringify(remaining)}.`)
}

/** Timer action may stop only the still-existing native identity whose scope was bounded. */
export async function stopExpiredQualificationProcess(
  { pid, start, group },
  { read = readFile, execute = exec } = {},
) {
  const unit = `app-imagegen\\x2dstudio-${pid}.scope`
  if (
    !Number.isSafeInteger(pid) ||
    pid <= 1 ||
    !/^\d+$/.test(start) ||
    path.basename(group) !== unit
  ) {
    throw new Error('Invalid owned deadline identity.')
  }
  try {
    if (processStart(await read(`/proc/${pid}/stat`, 'utf8')) !== start) return { stopped: false }
    if (cgroupPath(await read(`/proc/${pid}/cgroup`, 'utf8')) !== group) return { stopped: false }
  } catch (error) {
    if (['ENOENT', 'ESRCH'].includes(error.code)) return { stopped: false }
    throw error
  }
  const shown = await execute(
    'systemctl',
    ['--user', 'show', '--property=ControlGroup', '--value', unit],
    { timeout: 10_000, maxBuffer: 32 * 1024 },
  )
  if (shown.stdout.trim() !== group)
    throw new Error('Deadline scope no longer matches the owned cgroup.')
  await execute('systemctl', ['--user', 'stop', unit], { timeout: 20_000, maxBuffer: 32 * 1024 })
  return { stopped: true, pid, start, group }
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === '--deadline') {
  if (process.argv.length !== 6) throw new Error('Invalid qualification deadline arguments.')
  const [pid, start, group] = process.argv.slice(3)
  console.log(
    JSON.stringify(await stopExpiredQualificationProcess({ pid: Number(pid), start, group })),
  )
}
