/** Actual guard boundary against controlled proc/kernel/systemd transports; no ML processes. */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
  signalQualificationMain,
  stopExpiredQualificationProcess,
  stopOwnedQualificationScope,
} from './qualification-resource-limits.mjs'

let nextPid = 900_000
function fixture({
  unrelated = false,
  childGroup = null,
  swap = '0',
  memory = '12884901888',
} = {}) {
  const pid = nextPid++
  const group = `/user.slice/user-1000.slice/user@1000.service/app.slice/${
    unrelated ? 'app-com.t3tools.T3Code-4175.scope' : `app-imagegen\\x2dstudio-${pid}.scope`
  }`
  let start = '14256666'
  let shown = group
  const commands = []
  const files = new Map([
    [`/proc/${pid}/status`, 'PPid:\t1\n'],
    [`/proc/${pid + 100}/status`, `PPid:\t${pid}\n`],
    [`/proc/${pid}/cgroup`, `0::${group}\n`],
    [`/proc/${pid + 100}/cgroup`, `0::${childGroup ?? group}\n`],
    [`/sys/fs/cgroup${group}/memory.max`, memory],
    [`/sys/fs/cgroup${group}/memory.swap.max`, swap],
    [`/sys/fs/cgroup${group}/memory.peak`, '62345678'],
  ])
  const dependencies = {
    entries: async () => [String(pid), String(pid + 100), 'self', 'sys'],
    read: async (file) => {
      if (file === `/proc/${pid}/stat`)
        return `${pid} (electron name) S ${'0 '.repeat(18)}${start} 0`
      if (file === `/proc/${pid + 100}/stat`)
        return `${pid + 100} (worker) S ${'0 '.repeat(18)}15256666 0`
      if (!files.has(file)) throw Object.assign(new Error(`Missing ${file}`), { code: 'ENOENT' })
      return files.get(file)
    },
    execute: async (program, args, options) => {
      commands.push({ program, args, options })
      if (program === 'systemctl' && args.some((arg) => arg.startsWith('RuntimeMaxSec='))) {
        throw new Error('Active scope RuntimeMaxSec is immutable.')
      }
      return { stdout: args.includes('show') ? `${shown}\n` : '' }
    },
  }
  return {
    pid,
    group,
    files,
    commands,
    dependencies,
    reusePid: () => {
      start = '17259999'
    },
    wrongScope: () => {
      shown = '/user.slice/someone-else.scope'
    },
  }
}

function mainDeathFixture() {
  const f = fixture({ memory: '10737418240' })
  let mainGone = false,
    workerStart = '15256666',
    inode = 87654321n
  let members = [f.pid, f.pid + 100]
  const read = f.dependencies.read
  const dependencies = {
    ...f.dependencies,
    inspect: async () => ({
      dev: 27n,
      ino: inode,
      isDirectory: () => true,
      isSymbolicLink: () => false,
    }),
    read: async (file) => {
      if (file === `/proc/${f.pid}/stat` && mainGone)
        throw Object.assign(new Error('Original Main exited'), { code: 'ENOENT' })
      if (file === `/proc/${f.pid + 100}/stat`)
        return `${f.pid + 100} (worker) S ${'0 '.repeat(18)}${workerStart} 0`
      if (file === `/sys/fs/cgroup${f.group}/cgroup.procs`) return members.join('\n') + '\n'
      return read(file)
    },
  }
  return {
    ...f,
    dependencies,
    mainExited: () => {
      mainGone = true
      members = [f.pid + 100]
    },
    replaceScope: () => {
      inode++
    },
    reuseWorker: () => {
      workerStart = '19256666'
    },
    addUnknown: () => {
      members.push(f.pid + 200)
    },
    empty: () => {
      mainGone = true
      members = []
    },
  }
}

test('Main-death mode captures inode and bounded independent proof timers without changing defaults', async () => {
  const f = mainDeathFixture()
  const options = { ...f.dependencies, surviveMainDeath: true, deadlineSeconds: 60 }
  const first = await boundQualificationProcess(f.pid, options)
  const proof = first.groups[0].scopeProof
  assert.deepEqual(proof.scopeIdentity, { device: '27', inode: '87654321' })
  assert.deepEqual(proof.members, first.processIdentities)
  assert.equal(first.groups[0].memoryMax, '10737418240')
  assert.ok(f.commands.some(({ args }) => args.includes('MemoryMax=10G')))
  assert.equal(first.groups[0].deadlineTimers.length, 1)
  let timers = f.commands.filter(({ program }) => program === 'systemd-run')
  assert.equal(timers.length, 1)
  assert.ok(timers[0].args.includes('--deadline-owned-scope'))
  assert.deepEqual(JSON.parse(timers[0].args.at(-1)), proof)
  await boundQualificationProcess(f.pid, options)
  assert.equal(f.commands.filter(({ program }) => program === 'systemd-run').length, 1)
  f.reuseWorker()
  await boundQualificationProcess(f.pid, options)
  assert.equal(
    f.commands.filter(({ program }) => program === 'systemd-run').length,
    1,
    'Ordinary observations never add deadline timers',
  )
  const cut = await boundQualificationProcess(f.pid, { ...options, refreshMainDeathProof: true })
  assert.equal(cut.groups[0].deadlineTimers.length, 2)
  timers = f.commands.filter(({ program }) => program === 'systemd-run')
  assert.equal(timers.length, 2)
  for (const command of timers) {
    const seconds = Number(
      command.args.find((value) => value.startsWith('--on-active=')).match(/=(\d+)s/)[1],
    )
    assert.ok(seconds > 0 && seconds <= 60)
  }
  assert.equal(JSON.parse(timers[1].args.at(-1)).members[1].start, '19256666')
})

test('captured same-inode scope cleanup works after Main died while its known child remains', async () => {
  const f = mainDeathFixture()
  const bounded = await boundQualificationProcess(f.pid, {
    ...f.dependencies,
    surviveMainDeath: true,
  })
  f.mainExited()
  f.commands.length = 0
  const result = await stopOwnedQualificationScope(bounded.groups[0].scopeProof, f.dependencies)
  assert.equal(result.signalRequested, true)
  assert.equal(result.authority, 'captured-scope-inode')
  assert.equal(Object.hasOwn(result, 'confirmed'), false)
  assert.equal(f.commands.filter(({ args }) => args.includes('kill')).length, 1)
  assert.equal(
    f.commands.some(({ args }) => args.includes('stop')),
    false,
    'Signal acknowledgement cannot cancel a still-needed independent watchdog',
  )
})

test('Main-death mode enforces actual ten-GiB native readback and the original overall deadline', async () => {
  const f = mainDeathFixture(),
    deadlineAt = Date.now() + 5000
  const options = { ...f.dependencies, surviveMainDeath: true, deadlineSeconds: 1800, deadlineAt }
  const first = await boundQualificationProcess(f.pid, options)
  assert.equal(first.groups[0].deadlineAt, deadlineAt)
  const timer = f.commands.find(({ program }) => program === 'systemd-run')
  const seconds = Number(
    timer.args.find((value) => value.startsWith('--on-active=')).match(/=(\d+)s/)[1],
  )
  assert.ok(seconds >= 1 && seconds <= 5)
  await assert.rejects(
    boundQualificationProcess(f.pid, { ...options, deadlineAt: deadlineAt + 1000 }),
    /deadline cannot change/,
  )
  assert.equal(f.commands.filter(({ program }) => program === 'systemd-run').length, 1)
  const other = mainDeathFixture()
  await assert.rejects(
    boundQualificationProcess(other.pid, {
      ...other.dependencies,
      surviveMainDeath: true,
      read: async (file) =>
        file.endsWith('/memory.max') ? '12884901888' : other.dependencies.read(file),
    }),
    /Unbounded qualification cgroup/,
  )
  assert.equal(
    other.commands.some(({ program }) => program === 'systemd-run'),
    false,
  )
})

for (const fault of [
  'scope-replaced',
  'main-reused',
  'worker-reused',
  'foreign-ControlGroup',
  'unknown-child',
  'moved-child',
])
  test(`captured Main-death scope refuses ${fault} without any signal`, async () => {
    const f = mainDeathFixture()
    const bounded = await boundQualificationProcess(f.pid, {
      ...f.dependencies,
      surviveMainDeath: true,
    })
    if (fault === 'main-reused') f.reusePid()
    else f.mainExited()
    if (fault === 'scope-replaced') f.replaceScope()
    if (fault === 'worker-reused') f.reuseWorker()
    if (fault === 'foreign-ControlGroup') f.wrongScope()
    if (fault === 'unknown-child') f.addUnknown()
    if (fault === 'moved-child')
      f.files.set(`/proc/${f.pid + 100}/cgroup`, '0::/user.slice/foreign.scope\n')
    f.commands.length = 0
    await assert.rejects(stopOwnedQualificationScope(bounded.groups[0].scopeProof, f.dependencies))
    assert.equal(
      f.commands.some(({ args }) => args.includes('kill') || args.includes('stop')),
      false,
    )
  })

test('captured scope replacement during final revalidation cannot authorize cleanup', async () => {
  const f = mainDeathFixture()
  const bounded = await boundQualificationProcess(f.pid, {
    ...f.dependencies,
    surviveMainDeath: true,
  })
  f.mainExited()
  f.commands.length = 0
  let inspections = 0
  await assert.rejects(
    stopOwnedQualificationScope(bounded.groups[0].scopeProof, {
      ...f.dependencies,
      inspect: async (...args) => {
        if (++inspections === 2) f.replaceScope()
        return f.dependencies.inspect(...args)
      },
    }),
    /replaced/,
  )
  assert.equal(
    f.commands.some(({ args }) => args.includes('kill')),
    false,
  )
})

test('a zombie Main cannot authorize an unobserved member in the captured scope', async () => {
  const f = mainDeathFixture()
  const bounded = await boundQualificationProcess(f.pid, {
    ...f.dependencies,
    surviveMainDeath: true,
  })
  f.addUnknown()
  f.commands.length = 0
  await assert.rejects(
    stopOwnedQualificationScope(bounded.groups[0].scopeProof, {
      ...f.dependencies,
      read: async (file) =>
        file === `/proc/${f.pid}/stat`
          ? `${f.pid} (electron name) Z ${'0 '.repeat(18)}14256666 0`
          : f.dependencies.read(file),
    }),
    /unobserved process/,
  )
  assert.equal(
    f.commands.some(({ args }) => args.includes('kill')),
    false,
  )
})

test('an empty captured scope receives no signal and its timer remains until actual exit confirmation', async () => {
  const f = mainDeathFixture()
  const bounded = await boundQualificationProcess(f.pid, {
    ...f.dependencies,
    surviveMainDeath: true,
  })
  f.empty()
  f.commands.length = 0
  assert.deepEqual(
    await stopOwnedQualificationScope(bounded.groups[0].scopeProof, f.dependencies),
    { signalRequested: false },
  )
  assert.equal(
    f.commands.some(({ args }) => args.includes('kill') || args.includes('stop')),
    false,
  )
  const exited = await confirmQualificationProcessExit([bounded], {
    ...f.dependencies,
    read: async (file) => {
      if (file.startsWith('/proc/')) throw Object.assign(new Error('Gone'), { code: 'ENOENT' })
      if (file.endsWith('/cgroup.events')) return 'populated 0\nfrozen 0\n'
      return f.dependencies.read(file)
    },
  })
  assert.deepEqual(exited.stoppedDeadlineTimers, bounded.groups[0].deadlineTimers)
})

test('Main-only fault invokes the pidfd transport with exactly the captured identity', async () => {
  const f = fixture(),
    identity = { pid: f.pid, start: '14256666', group: f.group }
  let calls = 0
  const result = await signalQualificationMain(identity, {
    execute: async (program, args) => {
      calls++
      assert.equal(program, '/usr/bin/python3')
      assert.deepEqual(args.slice(0, 3), ['-I', '-B', '-c'])
      assert.ok(args[3].includes('os.pidfd_open') && args[3].includes('signal.pidfd_send_signal'))
      assert.deepEqual(args.slice(4), [String(identity.pid), identity.start, identity.group])
      return {
        stdout: JSON.stringify({
          ...identity,
          pidfd: true,
          signalRequested: true,
          signal: 'SIGKILL',
        }),
      }
    },
  })
  assert.equal(calls, 1)
  assert.equal(result.pidfd, true)
  await assert.rejects(
    signalQualificationMain(
      { ...identity, group: '/user.slice/foreign.scope' },
      { execute: async () => assert.fail('Foreign authority must not reach a signal transport') },
    ),
  )
  await assert.rejects(
    signalQualificationMain(identity, { execute: async () => ({ stdout: '{}' }) }),
    /not acknowledged exactly/,
  )
})

test('KDE-moved Main and worker are checked in their actual scope, with finite kernel readback', async () => {
  const f = fixture()
  const evidence = await boundQualificationProcess(f.pid, f.dependencies)
  assert.equal(evidence.groups.length, 1)
  assert.deepEqual(evidence.groups[0].pids, [f.pid, f.pid + 100])
  assert.equal(evidence.groups[0].memoryMax, '12884901888')
  assert.equal(evidence.groups[0].swapMax, '0')
  assert.equal(evidence.groups[0].memoryPeak, '62345678')
  assert.equal(f.commands.filter(({ args }) => args.includes('set-property')).length, 1)
  assert.ok(
    f.commands.some(
      ({ program, args }) => program === 'systemd-run' && args.includes('--on-active=1800s'),
    ),
  )
})

// Boundary: actual proc/cgroup/systemd guard; transports alone are controlled.
// Mutation: hard-code1800 in the real timer command. Explicit2700 fails; default1800 stays green.
test('explicit2700 schedules the actual owned timer and preserves every RAM/swap bound', async () => {
  for (const seconds of [1800, 2700]) {
    const f = fixture()
    const evidence = await boundQualificationProcess(f.pid, {
      ...f.dependencies,
      ...(seconds === 2700 ? { deadlineSeconds: seconds } : {}),
    })
    assert.equal(evidence.ownedScopeDeadlineSeconds, seconds)
    assert.equal(evidence.memoryCeilingPerGroup, 12 * 1024 ** 3)
    assert.equal(evidence.zeroSwap, true)
    assert.equal(evidence.groups[0].memoryMax, '12884901888')
    assert.equal(evidence.groups[0].swapMax, '0')
    const timers = f.commands.filter(({ program }) => program === 'systemd-run')
    assert.equal(timers.length, 1)
    assert.ok(timers[0].args.includes(`--on-active=${seconds}s`))
    assert.ok(timers[0].args.includes('MemoryMax=128M'))
    assert.ok(timers[0].args.includes('MemorySwapMax=0'))
    assert.ok(timers[0].args.includes('RuntimeMaxSec=30'))
    assert.equal(
      evidence.groups[0].deadlineTimer,
      `igs-qualification-deadline-${f.pid}-${evidence.nativeIdentity.start}`,
    )
    assert.ok(
      f.commands.some(
        ({ program, args }) =>
          program === 'systemctl' &&
          args.includes('MemoryMax=12G') &&
          args.includes('MemorySwapMax=0'),
      ),
    )
  }
})

test('an owned timer can be reobserved but never extended or shortened at the same PID/start', async () => {
  for (const original of [1800, 2700]) {
    const f = fixture()
    const dependencies = { ...f.dependencies, deadlineSeconds: original }
    const first = await boundQualificationProcess(f.pid, dependencies)
    const again = await boundQualificationProcess(f.pid, dependencies)
    assert.equal(again.groups[0].deadlineTimer, first.groups[0].deadlineTimer)
    assert.equal(f.commands.filter(({ program }) => program === 'systemd-run').length, 1)
    f.commands.length = 0
    await assert.rejects(
      boundQualificationProcess(f.pid, {
        ...f.dependencies,
        deadlineSeconds: original === 1800 ? 2700 : 1800,
      }),
      /deadline cannot change for the same PID\/start/,
    )
    assert.deepEqual(f.commands, [], 'A changed allowance must refuse before any unit mutation.')
  }
})

test('invalid explicit deadlines refuse before proc discovery or unit mutation', async () => {
  for (const deadlineSeconds of [0, -1, NaN, Infinity, 2701, 2700.5, '2700', null]) {
    const f = fixture()
    await assert.rejects(
      boundQualificationProcess(f.pid, {
        deadlineSeconds,
        read: async () => assert.fail('Invalid deadline must not read proc/cgroup.'),
        entries: async () => assert.fail('Invalid deadline must not discover processes.'),
        execute: async () => assert.fail('Invalid deadline must not mutate units.'),
      }),
      /deadlineSeconds must be a finite positive integer no larger than 2700/,
    )
  }
})

test('extended2700 still requires actual native PID and cgroup exit before stopping its timer', async () => {
  const f = fixture()
  const bounded = await boundQualificationProcess(f.pid, {
    ...f.dependencies,
    deadlineSeconds: 2700,
  })
  f.commands.length = 0
  await assert.rejects(
    confirmQualificationProcessExit([bounded], {
      read: f.dependencies.read,
      execute: f.dependencies.execute,
      pause: async () => {},
    }),
    /Owned native processes remain alive/,
  )
  assert.deepEqual(f.commands, [], 'A live original PID cannot authorize stopping its deadline.')
  await assert.rejects(
    confirmQualificationProcessExit([bounded], {
      read: exitedNativeRead(f, async () => 'populated 1\nfrozen 0\n'),
      execute: f.dependencies.execute,
      pause: async () => {},
    }),
    /Owned native processes remain alive/,
  )
  assert.deepEqual(f.commands, [], 'Absent tracked PIDs cannot authorize a still-populated scope.')
  const exited = await confirmQualificationProcessExit([bounded], {
    read: exitedNativeRead(f, async () => 'populated 0\nfrozen 0\n'),
    execute: f.dependencies.execute,
    pause: async () => {},
  })
  assert.equal(exited.confirmed, true)
  assert.deepEqual(exited.identities, bounded.processIdentities)
  assert.deepEqual(exited.confirmedOwnedScopeExit, [f.group])
  assert.deepEqual(exited.stoppedDeadlineTimers, [bounded.groups[0].deadlineTimer])
  assert.deepEqual(
    f.commands.map(({ program, args }) => ({ program, args })),
    [
      {
        program: 'systemctl',
        args: ['--user', 'stop', `${bounded.groups[0].deadlineTimer}.timer`],
      },
    ],
  )
})

test('mismatching user-unit ControlGroup refuses before any limit mutation', async () => {
  const f = fixture()
  f.wrongScope()
  await assert.rejects(
    boundQualificationProcess(f.pid, f.dependencies),
    /ControlGroup does not match/,
  )
  assert.equal(f.commands.filter(({ args }) => args.includes('set-property')).length, 0)
})

test('an unrelated unbounded desktop group is refused and never modified', async () => {
  const f = fixture({ unrelated: true, memory: 'max' })
  await assert.rejects(
    boundQualificationProcess(f.pid, f.dependencies),
    /Unbounded qualification cgroup/,
  )
  assert.equal(f.commands.length, 0)
})

test('finite inherited launcher limits need no application scope mutation', async () => {
  const f = fixture({ unrelated: true })
  assert.equal((await boundQualificationProcess(f.pid, f.dependencies)).groups[0].ownedScope, false)
  assert.equal(f.commands.length, 0)
})

for (const [name, options] of [
  ['unlimited memory', { memory: 'max' }],
  ['larger memory cap', { memory: '12884901889' }],
  ['unlimited swap', { swap: 'max' }],
  ['nonzero swap', { swap: '1' }],
]) {
  test(`failed kernel enforcement (${name}) refuses admission despite successful systemctl`, async () => {
    const f = fixture(options)
    await assert.rejects(
      boundQualificationProcess(f.pid, f.dependencies),
      /Unbounded qualification cgroup/,
    )
  })
}

test('a worker in a different unbounded group cannot escape checking Main', async () => {
  const childGroup =
    '/user.slice/user-1000.slice/user@1000.service/app.slice/unbounded-worker.scope'
  const f = fixture({ childGroup })
  for (const [name, value] of [
    ['memory.max', 'max'],
    ['memory.swap.max', '0'],
  ]) {
    f.files.set(`/sys/fs/cgroup${childGroup}/${name}`, value)
  }
  await assert.rejects(boundQualificationProcess(f.pid, f.dependencies), /unbounded-worker.scope/)
  assert.equal(f.commands.filter(({ args }) => args.includes('set-property')).length, 1)
})

test('PID reuse between two admissions cannot transfer scope ownership', async () => {
  const f = fixture()
  await boundQualificationProcess(f.pid, f.dependencies)
  f.commands.length = 0
  f.reusePid()
  await assert.rejects(boundQualificationProcess(f.pid, f.dependencies), /PID was reused/)
  assert.equal(f.commands.length, 0)
})

test('a dead Main does not hide an observed worker that remains physically alive', async () => {
  const f = fixture()
  const check = await boundQualificationProcess(f.pid, f.dependencies)
  assert.equal(check.processIdentities.length, 2)
  await assert.rejects(
    confirmQualificationProcessExit([check], {
      read: async (file) => {
        if (file === `/proc/${f.pid}/stat`)
          throw Object.assign(new Error('Gone'), { code: 'ENOENT' })
        return f.dependencies.read(file)
      },
      pause: async () => {},
      execute: f.dependencies.execute,
    }),
    /Owned native processes remain alive/,
  )
})

test('physical exit proof accepts absent identities and a reused PID belonging to a new process', async () => {
  const f = fixture()
  const check = await boundQualificationProcess(f.pid, f.dependencies)
  f.reusePid()
  const evidence = await confirmQualificationProcessExit([check], {
    read: async (file) => {
      if (file === `/proc/${f.pid + 100}/stat`)
        throw Object.assign(new Error('Gone'), { code: 'ENOENT' })
      return f.dependencies.read(file)
    },
    pause: async () => {},
    execute: f.dependencies.execute,
  })
  assert.equal(evidence.confirmed, true)
  assert.deepEqual(evidence.identities, check.processIdentities)
  assert.ok(
    f.commands.some(
      ({ args }) => args.includes('stop') && args.some((arg) => arg.endsWith('.timer')),
    ),
  )
})

test('deadline requests SIGKILL only for the exact verified owned scope without claiming physical exit', async () => {
  const f = fixture()
  const { nativeIdentity } = await boundQualificationProcess(f.pid, f.dependencies)
  f.commands.length = 0
  const evidence = await stopExpiredQualificationProcess(
    { ...nativeIdentity, group: f.group },
    f.dependencies,
  )
  assert.deepEqual(evidence, {
    signalRequested: true,
    signal: 'SIGKILL',
    pid: f.pid,
    start: nativeIdentity.start,
    group: f.group,
  })
  assert.deepEqual(
    f.commands.map(({ program, args }) => ({ program, args })),
    [
      {
        program: 'systemctl',
        args: [
          '--user',
          'show',
          '--property=ControlGroup',
          '--value',
          `app-imagegen\\x2dstudio-${f.pid}.scope`,
        ],
      },
      {
        program: 'systemctl',
        args: [
          '--user',
          'kill',
          '--kill-whom=all',
          '--signal=SIGKILL',
          `app-imagegen\\x2dstudio-${f.pid}.scope`,
        ],
      },
    ],
  )
  assert.ok(f.commands.at(-1).options.timeout > 0 && f.commands.at(-1).options.timeout <= 20_000)
  assert.equal(Object.hasOwn(evidence, 'stopped'), false)
  assert.equal(Object.hasOwn(evidence, 'confirmed'), false)
  // A successful transport acknowledgment leaves both original processes alive in this fixture.
  await assert.rejects(
    confirmQualificationProcessExit(
      [
        {
          processIdentities: [nativeIdentity],
          groups: [{ group: f.group, ownedScope: true }],
        },
      ],
      { ...f.dependencies, pause: async () => {} },
    ),
    /Owned native processes remain alive/,
  )
})

test('an expired timer cannot stop a new process that reused its former PID', async () => {
  const f = fixture()
  const { nativeIdentity } = await boundQualificationProcess(f.pid, f.dependencies)
  f.reusePid()
  f.commands.length = 0
  assert.deepEqual(
    await stopExpiredQualificationProcess({ ...nativeIdentity, group: f.group }, f.dependencies),
    { signalRequested: false },
  )
  assert.equal(f.commands.length, 0)
})

for (const code of ['ENOENT', 'ESRCH'])
  test(`missing owned PID (${code}) refuses before any systemctl signal`, async () => {
    const f = fixture()
    const { nativeIdentity } = await boundQualificationProcess(f.pid, f.dependencies)
    f.commands.length = 0
    const evidence = await stopExpiredQualificationProcess(
      { ...nativeIdentity, group: f.group },
      {
        ...f.dependencies,
        read: async (file) => {
          if (file === `/proc/${f.pid}/stat`) throw Object.assign(new Error('Gone'), { code })
          return f.dependencies.read(file)
        },
      },
    )
    assert.deepEqual(evidence, { signalRequested: false })
    assert.equal(f.commands.length, 0)
  })

test('an owned PID moved to another proc cgroup cannot transfer signal authority', async () => {
  const f = fixture()
  const { nativeIdentity } = await boundQualificationProcess(f.pid, f.dependencies)
  f.commands.length = 0
  f.files.set(`/proc/${f.pid}/cgroup`, '0::/user.slice/unrelated.scope\n')
  assert.deepEqual(
    await stopExpiredQualificationProcess({ ...nativeIdentity, group: f.group }, f.dependencies),
    { signalRequested: false },
  )
  assert.equal(f.commands.length, 0)
})

test('a rejected SIGKILL request propagates failure instead of synthesizing exit evidence', async () => {
  const f = fixture()
  const { nativeIdentity } = await boundQualificationProcess(f.pid, f.dependencies)
  f.commands.length = 0
  await assert.rejects(
    stopExpiredQualificationProcess(
      { ...nativeIdentity, group: f.group },
      {
        ...f.dependencies,
        execute: async (program, args, options) => {
          const result = await f.dependencies.execute(program, args, options)
          if (args.includes('kill')) throw new Error('Controlled SIGKILL transport rejection.')
          return result
        },
      },
    ),
    /Controlled SIGKILL transport rejection/,
  )
  assert.equal(f.commands.filter(({ args }) => args.includes('kill')).length, 1)
  assert.equal(
    f.commands.some(({ args }) => args.includes('stop')),
    false,
  )
})

test('an unobserved child keeping the owned scope populated prevents disposal despite absent tracked PIDs', async () => {
  const f = fixture()
  const check = await boundQualificationProcess(f.pid, f.dependencies)
  f.commands.length = 0
  assert.equal(
    (
      await stopExpiredQualificationProcess(
        { ...check.nativeIdentity, group: f.group },
        f.dependencies,
      )
    ).signalRequested,
    true,
  )
  await assert.rejects(
    confirmQualificationProcessExit([check], {
      read: async (file) => {
        if (file.startsWith('/proc/')) throw Object.assign(new Error('Gone'), { code: 'ENOENT' })
        if (file.endsWith('/cgroup.events')) return 'populated 1\nfrozen 0\n'
        return f.dependencies.read(file)
      },
      pause: async () => {},
      execute: f.dependencies.execute,
    }),
    /Owned native processes remain alive/,
  )
  assert.equal(
    f.commands.some(({ args }) => args.includes('stop')),
    false,
  )
})

test('deadline refuses a mismatching ControlGroup without signaling the scope', async () => {
  const f = fixture()
  const { nativeIdentity } = await boundQualificationProcess(f.pid, f.dependencies)
  f.wrongScope()
  f.commands.length = 0
  await assert.rejects(
    stopExpiredQualificationProcess({ ...nativeIdentity, group: f.group }, f.dependencies),
    /Deadline scope no longer matches/,
  )
  assert.equal(
    f.commands.some(({ args }) => args.includes('kill') || args.includes('stop')),
    false,
  )
})

/** Transport double only: the actual exported guard owns every exit decision. */
function exitedNativeRead(f, observeGroup) {
  return async (file) => {
    if ([f.pid, f.pid + 100].some((pid) => file === `/proc/${pid}/stat`)) {
      throw Object.assign(new Error('Observed native identity physically absent'), {
        code: 'ENOENT',
      })
    }
    if (file === `/sys/fs/cgroup${f.group}/cgroup.events`) return observeGroup()
    return f.dependencies.read(file)
  }
}

for (const finalObservation of ['missing', 'empty'])
  test(`a removed cgroup read ENODEV retries until actual ${finalObservation} evidence`, async () => {
    const f = fixture()
    const check = await boundQualificationProcess(f.pid, f.dependencies)
    f.commands.length = 0
    let groupReads = 0
    let pauses = 0
    const result = await confirmQualificationProcessExit([check], {
      read: exitedNativeRead(f, async () => {
        groupReads++
        if (groupReads === 1)
          throw Object.assign(new Error('Open kernfs descriptor was deactivated'), {
            code: 'ENODEV',
          })
        if (finalObservation === 'missing')
          throw Object.assign(new Error('Actual cgroup removed'), { code: 'ENOENT' })
        return 'populated 0\nfrozen 0\n'
      }),
      execute: f.dependencies.execute,
      pause: async () => {
        pauses++
      },
    })
    assert.equal(result.confirmed, true)
    assert.deepEqual(result.identities, check.processIdentities)
    assert.deepEqual(result.confirmedOwnedScopeExit, [f.group])
    assert.ok(groupReads >= 2, 'ENODEV alone cannot establish an empty scope.')
    assert.ok(pauses > 0, 'Confirmation must wait for an independent later observation.')
    assert.equal(
      f.commands.filter(({ args }) => args.includes('stop')).length,
      result.stoppedDeadlineTimers.length,
    )
    assert.ok(result.stoppedDeadlineTimers.length > 0)
    assert.deepEqual(result.stoppedDeadlineTimers, [check.groups[0].deadlineTimer])
    assert.deepEqual(
      f.commands.map(({ program, args }) => ({ program, args })),
      [
        {
          program: 'systemctl',
          args: ['--user', 'stop', `${check.groups[0].deadlineTimer}.timer`],
        },
      ],
    )
    assert.equal(
      f.commands.some(({ args }) => args.includes('kill')),
      false,
    )
  })

test('persistent cgroup ENODEV remains unconfirmed and stops no deadline timers', async () => {
  const f = fixture()
  const check = await boundQualificationProcess(f.pid, f.dependencies)
  f.commands.length = 0
  let groupReads = 0
  await assert.rejects(
    confirmQualificationProcessExit([check], {
      read: exitedNativeRead(f, async () => {
        groupReads++
        assert.ok(groupReads <= 50, 'Unavailable-group confirmation must remain bounded.')
        throw Object.assign(new Error('Cgroup observation remains unavailable'), { code: 'ENODEV' })
      }),
      execute: f.dependencies.execute,
      pause: async () => {},
    }),
    (error) =>
      /Owned native processes remain alive/.test(error.message) && /ENODEV/.test(error.message),
  )
  assert.ok(
    groupReads > 1,
    'Unavailable observations are retried without synthesizing zero population.',
  )
  assert.deepEqual(f.commands, [])
})

test('ENODEV followed by an unobserved child population prevents exit despite absent tracked PIDs', async () => {
  const f = fixture()
  const check = await boundQualificationProcess(f.pid, f.dependencies)
  f.commands.length = 0
  let groupReads = 0
  await assert.rejects(
    confirmQualificationProcessExit([check], {
      read: exitedNativeRead(f, async () => {
        groupReads++
        assert.ok(groupReads <= 50, 'Populated-group confirmation must remain bounded.')
        if (groupReads === 1)
          throw Object.assign(new Error('Deactivated descriptor race'), { code: 'ENODEV' })
        return 'populated 1\nfrozen 0\n'
      }),
      execute: f.dependencies.execute,
      pause: async () => {},
    }),
    /Owned native processes remain alive/,
  )
  assert.ok(groupReads > 1)
  assert.deepEqual(f.commands, [])
})

test('a tracked worker remains a blocker after transient ENODEV and actual cgroup disappearance', async () => {
  const f = fixture()
  const check = await boundQualificationProcess(f.pid, f.dependencies)
  f.commands.length = 0
  let groupReads = 0
  await assert.rejects(
    confirmQualificationProcessExit([check], {
      read: async (file) => {
        if (file === `/proc/${f.pid}/stat`)
          throw Object.assign(new Error('Main physically absent'), { code: 'ENOENT' })
        if (file === `/sys/fs/cgroup${f.group}/cgroup.events`) {
          groupReads++
          assert.ok(groupReads <= 50, 'Live-worker confirmation must remain bounded.')
          throw Object.assign(new Error('Removed group'), {
            code: groupReads === 1 ? 'ENODEV' : 'ENOENT',
          })
        }
        return f.dependencies.read(file)
      },
      execute: f.dependencies.execute,
      pause: async () => {},
    }),
    /Owned native processes remain alive/,
  )
  assert.ok(groupReads > 1)
  assert.deepEqual(f.commands, [])
})

for (const code of ['EACCES', 'EIO'])
  test(`unknown cgroup observation error ${code} propagates unchanged and stops no timers`, async () => {
    const f = fixture()
    const check = await boundQualificationProcess(f.pid, f.dependencies)
    f.commands.length = 0
    const observationFailure = Object.assign(new Error('Actual cgroup observation failed'), {
      code,
    })
    await assert.rejects(
      confirmQualificationProcessExit([check], {
        read: exitedNativeRead(f, async () => {
          throw observationFailure
        }),
        execute: f.dependencies.execute,
        pause: async () => {},
      }),
      (error) => error === observationFailure,
    )
    assert.deepEqual(f.commands, [])
  })

for (const code of ['ENODEV', 'EACCES', 'EIO'])
  test(`native process identity error ${code} remains unknown and cannot borrow cgroup disappearance`, async () => {
    const f = fixture()
    const check = await boundQualificationProcess(f.pid, f.dependencies)
    f.commands.length = 0
    const identityFailure = Object.assign(new Error('Owned native identity cannot be inspected'), {
      code,
    })
    let groupReads = 0
    await assert.rejects(
      confirmQualificationProcessExit([check], {
        read: async (file) => {
          if (file === `/proc/${f.pid}/stat`) throw identityFailure
          if (file.endsWith('/cgroup.events')) {
            groupReads++
            throw Object.assign(new Error('Actual cgroup absent'), { code: 'ENOENT' })
          }
          return f.dependencies.read(file)
        },
        execute: f.dependencies.execute,
        pause: async () => {},
      }),
      (error) => error === identityFailure,
    )
    assert.equal(groupReads, 0)
    assert.deepEqual(f.commands, [])
  })
