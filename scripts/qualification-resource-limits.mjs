/** Bound the actual owned native cgroups: KDE can move Electron out of its launcher. */
import { execFile } from 'node:child_process'
import { lstat, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const memoryCeiling = 12 * 1024 ** 3
const launchedIdentities = new Map()
const deadlineTimers = new Map()

/** Finite harness allowance; ordinary qualifications retain their 1800-second default. */
export function validateQualificationDeadlineSeconds(value, label = 'deadlineSeconds') {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2700) {
    throw new Error(`${label} must be a finite positive integer no larger than 2700.`)
  }
  return value
}

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
  {
    read = readFile,
    entries = readdir,
    inspect = lstat,
    execute = exec,
    deadlineSeconds = 1800,
    surviveMainDeath = false,
    refreshMainDeathProof = false,
    deadlineAt,
  } = {},
) {
  validateQualificationDeadlineSeconds(deadlineSeconds)
  if (typeof surviveMainDeath !== 'boolean') throw new Error('Invalid Main-death scope mode.')
  if (typeof refreshMainDeathProof !== 'boolean' || (refreshMainDeathProof && !surviveMainDeath)) {
    throw new Error('Invalid Main-death deadline refresh.')
  }
  if (
    deadlineAt !== undefined &&
    (!surviveMainDeath || !Number.isSafeInteger(deadlineAt) || deadlineAt <= Date.now())
  )
    throw new Error('Invalid original Main-death deadline.')
  if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error('Invalid owned Electron PID.')
  const processFile = (id, name) => `/proc/${id}/${name}`
  const initialStat = await read(processFile(pid, 'stat'), 'utf8')
  const start = processStart(initialStat)
  if (launchedIdentities.has(pid) && launchedIdentities.get(pid) !== start) {
    throw new Error('Owned Electron PID was reused after launch.')
  }
  const deadlineKey = `${pid}:${start}`
  const previousDeadline = deadlineTimers.get(deadlineKey)
  if (previousDeadline && previousDeadline.deadlineSeconds !== deadlineSeconds) {
    throw new Error('Owned Electron deadline cannot change for the same PID/start identity.')
  }
  if (previousDeadline && Boolean(previousDeadline.surviveMainDeath) !== surviveMainDeath) {
    throw new Error('Owned Electron deadline mode cannot change for the same PID/start identity.')
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
      if (previousDeadline && previousDeadline.group !== group) {
        throw new Error('Owned Electron deadline scope changed for the same PID/start identity.')
      }
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
        [
          '--user',
          'set-property',
          '--runtime',
          unit,
          surviveMainDeath ? 'MemoryMax=10G' : 'MemoryMax=12G',
          'MemorySwapMax=0',
        ],
        { timeout: 10_000, maxBuffer: 32 * 1024 },
      )
      if ((await showGroup()) !== group) {
        throw new Error('Owned scope ControlGroup changed while setting qualification limits.')
      }
    }
    const root = `/sys/fs/cgroup${group}`
    const memoryMax = (await read(`${root}/memory.max`, 'utf8')).trim()
    const swapMax = (await read(`${root}/memory.swap.max`, 'utf8')).trim()
    const actualCeiling = surviveMainDeath && ownedScope ? 10 * 1024 ** 3 : memoryCeiling
    if (!finiteLimit(memoryMax, actualCeiling) || swapMax !== '0') {
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
      const timer = `igs-qualification-deadline-${pid}-${start}`
      if (surviveMainDeath) {
        const scopeIdentity = await readScopeIdentity(group, inspect)
        const previous = deadlineTimers.get(deadlineKey)
        if (previous && !sameScopeIdentity(previous.scopeIdentity, scopeIdentity)) {
          throw new Error('Owned scope directory identity changed.')
        }
        const members = processIdentities.filter(({ pid: member }) => pids.includes(member))
        const proof = { pid, start, group, scopeIdentity, members }
        validateScopeProof(proof)
        const state = previous ?? {
          deadlineSeconds,
          group,
          surviveMainDeath: true,
          scopeIdentity,
          dueAt: Math.min(Date.now() + deadlineSeconds * 1000, deadlineAt ?? Infinity),
          deadlineAt,
          timers: [],
          fingerprints: [],
        }
        const fingerprint = JSON.stringify(members)
        if (previous && previous.deadlineAt !== deadlineAt) {
          throw new Error('Original Main-death deadline cannot change.')
        }
        if ((!previous || refreshMainDeathProof) && !state.fingerprints.includes(fingerprint)) {
          if (state.timers.length >= 2) throw new Error('Main-death deadline proof bound exceeded.')
          const name = `${timer}-scope-${state.timers.length + 1}`
          const remaining = Math.floor((state.dueAt - Date.now()) / 1000)
          if (remaining < 1) throw new Error('Original Main-death deadline has expired.')
          await execute(
            'systemd-run',
            [
              '--user',
              `--unit=${name}`,
              `--on-active=${remaining}s`,
              '-p',
              'MemoryMax=128M',
              '-p',
              'MemorySwapMax=0',
              '-p',
              'RuntimeMaxSec=30',
              process.execPath,
              '--max-old-space-size=64',
              fileURLToPath(import.meta.url),
              '--deadline-owned-scope',
              JSON.stringify(proof),
            ],
            { timeout: 10_000, maxBuffer: 32 * 1024 },
          )
          state.timers.push(name)
          state.fingerprints.push(fingerprint)
          deadlineTimers.set(deadlineKey, state)
        }
        evidence.at(-1).scopeProof = proof
        evidence.at(-1).deadlineTimers = [...state.timers]
        evidence.at(-1).deadlineAt = state.dueAt
      } else if (!deadlineTimers.has(deadlineKey)) {
        await execute(
          'systemd-run',
          [
            '--user',
            `--unit=${timer}`,
            `--on-active=${deadlineSeconds}s`,
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
        deadlineTimers.set(deadlineKey, { timer, group, deadlineSeconds })
      }
      if (!surviveMainDeath) evidence.at(-1).deadlineTimer = timer
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
    ownedScopeDeadlineSeconds: deadlineSeconds,
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
        if (error.code === 'ENODEV') {
          // A removed kernfs descriptor can fail before its pathname disappears.
          // Keep the scope unconfirmed until a later real empty/absent observation.
          remaining.push({ group, observation: 'unavailable', code: 'ENODEV' })
        } else if (!['ENOENT', 'ESRCH'].includes(error.code)) {
          throw error
        }
      }
    }
    if (remaining.length === 0) {
      const timers = new Set(
        checks.flatMap(({ groups }) =>
          groups.flatMap(({ deadlineTimer, deadlineTimers = [] }) =>
            [deadlineTimer, ...deadlineTimers].filter(Boolean),
          ),
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

function sameScopeIdentity(left, right) {
  return left?.device === right?.device && left?.inode === right?.inode
}

async function readScopeIdentity(group, inspect) {
  const entry = await inspect(`/sys/fs/cgroup${group}`, { bigint: true })
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new Error('Owned scope is not an actual kernel directory.')
  }
  return { device: String(entry.dev), inode: String(entry.ino) }
}

function validateScopeProof(proof) {
  const { pid, start, group, scopeIdentity, members } = proof ?? {}
  if (
    !Number.isSafeInteger(pid) ||
    pid <= 1 ||
    typeof start !== 'string' ||
    !/^[1-9]\d*$/.test(start) ||
    typeof group !== 'string' ||
    cgroupPath(`0::${group}`) !== group ||
    path.basename(group) !== `app-imagegen\\x2dstudio-${pid}.scope` ||
    !scopeIdentity ||
    typeof scopeIdentity.device !== 'string' ||
    typeof scopeIdentity.inode !== 'string' ||
    !/^(0|[1-9]\d*)$/.test(scopeIdentity.device) ||
    !/^[1-9]\d*$/.test(scopeIdentity.inode) ||
    !Array.isArray(members) ||
    members.length === 0 ||
    members.length > 512 ||
    members.some(
      (member) =>
        !Number.isSafeInteger(member.pid) ||
        member.pid <= 1 ||
        typeof member.start !== 'string' ||
        !/^[1-9]\d*$/.test(member.start),
    ) ||
    new Set(members.map(({ pid: member }) => member)).size !== members.length ||
    !members.some((member) => member.pid === pid && member.start === start)
  )
    throw new Error('Invalid captured Main-death scope proof.')
}

/** Test harness fallback only: the original Main may be gone; scope identity never transfers. */
export async function stopOwnedQualificationScope(
  proof,
  { read = readFile, inspect = lstat, execute = exec } = {},
) {
  validateScopeProof(proof)
  const { pid, start, group, scopeIdentity, members } = proof
  const absent = (error) => ['ENOENT', 'ESRCH'].includes(error.code)
  let mainAlive = false
  try {
    const mainStat = await read(`/proc/${pid}/stat`, 'utf8')
    if (processStart(mainStat) !== start) {
      throw new Error('Owned Main PID was reused; scope signal refused.')
    }
    if (cgroupPath(await read(`/proc/${pid}/cgroup`, 'utf8')) !== group) {
      throw new Error('Owned Main moved out of its captured scope.')
    }
    mainAlive = !['Z', 'X', 'x'].includes(
      mainStat.slice(mainStat.lastIndexOf(')') + 2).split(' ')[0],
    )
  } catch (error) {
    if (!absent(error)) throw error
  }
  const assertScope = async () => {
    if (!sameScopeIdentity(await readScopeIdentity(group, inspect), scopeIdentity)) {
      throw new Error('Captured scope was replaced; scope signal refused.')
    }
    const shown = await execute(
      'systemctl',
      ['--user', 'show', '--property=ControlGroup', '--value', path.basename(group)],
      { timeout: 10_000, maxBuffer: 32 * 1024 },
    )
    if (shown.stdout.trim() !== group) throw new Error('Captured scope ControlGroup differs.')
  }
  try {
    await assertScope()
  } catch (error) {
    if (absent(error)) return { signalRequested: false }
    throw error
  }
  const readMembers = async () => {
    const text = (await read(`/sys/fs/cgroup${group}/cgroup.procs`, 'utf8')).trim()
    const values = text ? text.split(/\s+/) : []
    if (
      values.length > 512 ||
      values.some(
        (value) =>
          !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 1,
      ) ||
      new Set(values).size !== values.length
    )
      throw new Error('Captured scope member inventory is invalid.')
    return values.map(Number).sort((left, right) => left - right)
  }
  const pids = await readMembers()
  let unobserved = false
  for (const member of pids) {
    const known = members.find((identity) => identity.pid === member)
    if (!known && !mainAlive) {
      throw new Error('Captured scope contains an unobserved process; signal refused.')
    }
    if (!known) unobserved = true
    try {
      const actualStart = processStart(await read(`/proc/${member}/stat`, 'utf8'))
      if (
        (known && actualStart !== known.start) ||
        cgroupPath(await read(`/proc/${member}/cgroup`, 'utf8')) !== group
      ) {
        throw new Error('Captured scope member identity changed; signal refused.')
      }
    } catch (error) {
      if (!absent(error)) throw error
    }
  }
  if (pids.length === 0) return { signalRequested: false }
  if (
    unobserved &&
    (processStart(await read(`/proc/${pid}/stat`, 'utf8')) !== start ||
      cgroupPath(await read(`/proc/${pid}/cgroup`, 'utf8')) !== group)
  ) {
    throw new Error('Main identity changed before authorizing newly observed scope members.')
  }
  await assertScope()
  if (JSON.stringify(await readMembers()) !== JSON.stringify(pids))
    throw new Error('Captured scope members changed before signal.')
  await execute(
    'systemctl',
    ['--user', 'kill', '--kill-whom=all', '--signal=SIGKILL', path.basename(group)],
    { timeout: 10_000, maxBuffer: 32 * 1024 },
  )
  return { signalRequested: true, signal: 'SIGKILL', authority: 'captured-scope-inode', ...proof }
}

/** Positive Main-only fault uses a Linux pidfd, never a PID after a separate identity read. */
export async function signalQualificationMain({ pid, start, group }, { execute = exec } = {}) {
  if (
    !Number.isSafeInteger(pid) ||
    pid <= 1 ||
    typeof start !== 'string' ||
    !/^[1-9]\d*$/.test(start) ||
    typeof group !== 'string' ||
    path.basename(group) !== `app-imagegen\\x2dstudio-${pid}.scope` ||
    cgroupPath(`0::${group}`) !== group
  )
    throw new Error('Invalid Main-only fault identity.')
  const script = `import json,os,signal,sys
pid=int(sys.argv[1]);start=sys.argv[2];group=sys.argv[3]
fd=os.pidfd_open(pid,0)
try:
 with open('/proc/'+str(pid)+'/stat') as f: value=f.read()
 assert value[value.rfind(')')+2:].split()[19]==start, 'Main PID identity changed'
 with open('/proc/'+str(pid)+'/cgroup') as f: groups=f.read().splitlines()
 assert '0::'+group in groups, 'Main cgroup changed'
 signal.pidfd_send_signal(fd,signal.SIGKILL)
 print(json.dumps({'signalRequested':True,'pidfd':True,'pid':pid,'start':start,'group':group,'signal':'SIGKILL'}))
finally: os.close(fd)
`
  const result = await execute(
    '/usr/bin/python3',
    ['-I', '-B', '-c', script, String(pid), start, group],
    {
      timeout: 10_000,
      maxBuffer: 32 * 1024,
    },
  )
  const evidence = JSON.parse(result.stdout)
  if (
    evidence.signalRequested !== true ||
    evidence.pidfd !== true ||
    evidence.pid !== pid ||
    evidence.start !== start ||
    evidence.group !== group ||
    evidence.signal !== 'SIGKILL'
  ) {
    throw new Error('Main-only pidfd signal was not acknowledged exactly.')
  }
  return evidence
}

/** Signal only the verified expired fixture scope; physical exit requires separate confirmation. */
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
    if (processStart(await read(`/proc/${pid}/stat`, 'utf8')) !== start)
      return { signalRequested: false }
    if (cgroupPath(await read(`/proc/${pid}/cgroup`, 'utf8')) !== group)
      return { signalRequested: false }
  } catch (error) {
    if (['ENOENT', 'ESRCH'].includes(error.code)) return { signalRequested: false }
    throw error
  }
  const shown = await execute(
    'systemctl',
    ['--user', 'show', '--property=ControlGroup', '--value', unit],
    { timeout: 10_000, maxBuffer: 32 * 1024 },
  )
  if (shown.stdout.trim() !== group)
    throw new Error('Deadline scope no longer matches the owned cgroup.')
  // A dirty Electron document may refuse graceful stop until systemd's stop timeout.
  // This fixture already exhausted its deadline; signal only its revalidated scope.
  await execute('systemctl', ['--user', 'kill', '--kill-whom=all', '--signal=SIGKILL', unit], {
    timeout: 10_000,
    maxBuffer: 32 * 1024,
  })
  return { signalRequested: true, signal: 'SIGKILL', pid, start, group }
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === '--deadline') {
  if (process.argv.length !== 6) throw new Error('Invalid qualification deadline arguments.')
  const [pid, start, group] = process.argv.slice(3)
  console.log(
    JSON.stringify(await stopExpiredQualificationProcess({ pid: Number(pid), start, group })),
  )
}
if (
  process.argv[1] === fileURLToPath(import.meta.url) &&
  process.argv[2] === '--deadline-owned-scope'
) {
  if (process.argv.length !== 4) throw new Error('Invalid captured-scope deadline arguments.')
  console.log(JSON.stringify(await stopOwnedQualificationScope(JSON.parse(process.argv[3]))))
}
