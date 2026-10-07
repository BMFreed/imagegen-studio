/** Actual guard boundary against controlled proc/kernel/systemd transports; no ML processes. */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
  stopExpiredQualificationProcess,
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
    execute: async (program, args) => {
      commands.push({ program, args })
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

test('deadline action stops the exact owned scope after rechecking identity and ControlGroup', async () => {
  const f = fixture()
  const { nativeIdentity } = await boundQualificationProcess(f.pid, f.dependencies)
  f.commands.length = 0
  const evidence = await stopExpiredQualificationProcess(
    { ...nativeIdentity, group: f.group },
    f.dependencies,
  )
  assert.equal(evidence.stopped, true)
  assert.equal(f.commands.at(-1).args.at(-1), `app-imagegen\\x2dstudio-${f.pid}.scope`)
})

test('an expired timer cannot stop a new process that reused its former PID', async () => {
  const f = fixture()
  const { nativeIdentity } = await boundQualificationProcess(f.pid, f.dependencies)
  f.reusePid()
  f.commands.length = 0
  assert.equal(
    (await stopExpiredQualificationProcess({ ...nativeIdentity, group: f.group }, f.dependencies))
      .stopped,
    false,
  )
  assert.equal(f.commands.length, 0)
})

test('an unobserved child keeping the owned scope populated prevents disposal despite absent tracked PIDs', async () => {
  const f = fixture()
  const check = await boundQualificationProcess(f.pid, f.dependencies)
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

test('deadline refuses a mismatching ControlGroup without stopping the scope', async () => {
  const f = fixture()
  const { nativeIdentity } = await boundQualificationProcess(f.pid, f.dependencies)
  f.wrongScope()
  f.commands.length = 0
  await assert.rejects(
    stopExpiredQualificationProcess({ ...nativeIdentity, group: f.group }, f.dependencies),
    /Deadline scope no longer matches/,
  )
  assert.equal(
    f.commands.some(({ args }) => args.includes('stop')),
    false,
  )
})
