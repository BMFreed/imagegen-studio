/**
 * Tiny real filesystem + real Node subprocesses + distribution flock. These tests exercise
 * cooperating update admission and kernel descriptor lifetime, never AppImage execution, ordinary
 * Project ownership, global absence of processes or recovery/cleanup authority.
 */
import assert from 'node:assert/strict'
import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test, type TestContext } from 'node:test'

import {
  acquireApplicationUpdateAdmission,
  ApplicationUpdateAdmissionError,
} from './application-update-admission.js'

const moduleUrl = new URL('./application-update-admission.ts', import.meta.url).href
const childImport = `import { acquireApplicationUpdateAdmission } from ${JSON.stringify(moduleUrl)};`
const supported = process.platform === 'linux' && process.arch === 'x64'
const options = { skip: !supported }
const childOwners = new WeakMap<TestContext, Set<ChildProcess>>()

async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'igs-update-admission-'))
  const applications = path.join(root, 'Applications')
  await fs.mkdir(applications, { mode: 0o700 })
  const currentAppImage = path.join(applications, 'Current.AppImage')
  await fs.writeFile(currentAppImage, 'Owned non-executable update target fixture.', {
    mode: 0o600,
  })
  const lockPath = path.join(
    applications,
    `.igs-app-update-${createHash('sha256').update(path.basename(currentAppImage)).digest('hex').slice(0, 16)}.lock`,
  )
  const owned: ReturnType<typeof acquireApplicationUpdateAdmission>[] = []
  const children = new Set<ChildProcess>()
  childOwners.set(t, children)
  t.after(async () => {
    // Even a failed assertion settles each exact owned process before its fixture is removed.
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        await endChild(child)
      }
    }
    for (const cap of owned) {
      cap.release()
    }
    await fs.rm(root, { force: true, recursive: true })
  })
  const acquire = () => {
    const cap = acquireApplicationUpdateAdmission(currentAppImage)
    owned.push(cap)
    return cap
  }
  return { acquire, applications, currentAppImage, lockPath, root }
}

function refusal(reason: 'BUSY' | 'UNAVAILABLE') {
  return (error: unknown) => {
    assert.ok(error instanceof ApplicationUpdateAdmissionError)
    assert.equal(error.reason, reason)
    assert.equal(
      error.code,
      reason === 'BUSY' ? 'APPLICATION_UPDATE_BUSY' : 'APPLICATION_UPDATE_ADMISSION_UNAVAILABLE',
    )
    assert.equal(
      error.message,
      reason === 'BUSY'
        ? 'Another application update is in progress. Try again after it finishes. Your Projects remain open.'
        : 'Application update installation could not be reserved. Your Projects remain open.',
    )
    return true
  }
}

function tryInChild(currentAppImage: string, dataRoot = 'owned-root-b') {
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      `${childImport}
       try {
         const cap = acquireApplicationUpdateAdmission(process.argv[1]);
         cap.assertHeld(); cap.release();
         console.log(JSON.stringify({result:'acquired'}));
       } catch (error) {
         console.log(JSON.stringify({result:error.code}));
       }`,
      currentAppImage,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, IMAGEGEN_DATA_ROOT: dataRoot },
      shell: false,
      timeout: 10_000,
    },
  )
  assert.equal(result.error, undefined)
  assert.equal(result.signal, null)
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout.trim()) as { result: string }
}

async function holdingChild(t: TestContext, currentAppImage?: string): Promise<ChildProcess> {
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      `${currentAppImage ? childImport : ''}
       ${currentAppImage ? 'const cap = acquireApplicationUpdateAdmission(process.argv[1]); cap.assertHeld();' : ''}
       process.stdin.resume();
       process.send({ready:true});
       process.stdin.on('end',()=>process.exit(0));`,
      ...(currentAppImage ? [currentAppImage] : []),
    ],
    { shell: false, stdio: ['pipe', 'pipe', 'pipe', 'ipc'] },
  )
  childOwners.get(t)!.add(child)
  const failure = once(child, 'exit').then(([code, signal]) => {
    throw new Error(
      `Owned admission child exited before ready (${String(code)}, ${String(signal)}).`,
    )
  })
  const ready = await Promise.race([
    once(child, 'message').then(([message]) => message),
    failure,
    new Promise<never>((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Owned admission child readiness timed out.')),
        10_000,
      )
      timer.unref()
    }),
  ])
  assert.deepEqual(ready, { ready: true })
  return child
}

async function endChild(child: ChildProcess) {
  const exited = once(child, 'exit')
  child.stdin!.end()
  const timer = setTimeout(() => child.kill('SIGKILL'), 3000)
  try {
    return await exited
  } finally {
    clearTimeout(timer)
  }
}

async function stopChild(child: ChildProcess) {
  const [code, signal] = await endChild(child)
  assert.equal(code, 0)
  assert.equal(signal, null)
}

async function witness(filename: string) {
  const info = await fs.lstat(filename, { bigint: true })
  return {
    bytes: await fs.readFile(filename),
    ctimeNs: info.ctimeNs,
    dev: info.dev,
    gid: info.gid,
    ino: info.ino,
    mode: info.mode,
    mtimeNs: info.mtimeNs,
    nlink: info.nlink,
    uid: info.uid,
  }
}

async function ownedDescriptors(root: string) {
  const entries = await fs.readdir('/proc/self/fd')
  const targets = await Promise.all(
    entries.map((fd) => fs.readlink(`/proc/self/fd/${fd}`).catch(() => '')),
  )
  return targets.filter((target) => target.startsWith(root + path.sep)).length
}

test(
  'explicit admission creates only a stable empty lock and freezes its capability',
  options,
  async (t) => {
    const f = await fixture(t)
    assert.deepEqual(await fs.readdir(f.applications), ['Current.AppImage'])
    assert.equal(await ownedDescriptors(f.root), 0)
    const cap = f.acquire()
    assert.equal(Object.isFrozen(cap), true)
    assert.equal(cap.currentAppImage, f.currentAppImage)
    cap.assertHeld()
    assert.deepEqual(
      (await fs.readdir(f.applications)).sort(),
      [path.basename(f.lockPath), 'Current.AppImage'].sort(),
    )
    const info = await fs.lstat(f.lockPath)
    assert.equal(info.mode & 0o7777, 0o600)
    assert.equal(info.nlink, 1)
    assert.equal(info.uid, process.geteuid!())
    assert.equal(info.size, 0)
    assert.equal(await ownedDescriptors(f.root), 2)
  },
)

test(
  'real flock child exit leaves cross-dataRoot admission busy until explicit release',
  options,
  async (t) => {
    const f = await fixture(t)
    const cap = f.acquire()
    const before = await witness(f.lockPath)
    assert.deepEqual(tryInChild(f.currentAppImage, path.join(f.root, 'other-data-root')), {
      result: 'APPLICATION_UPDATE_BUSY',
    })
    assert.deepEqual(await witness(f.lockPath), before)
    cap.assertHeld()
    cap.release()
    cap.release()
    assert.deepEqual(tryInChild(f.currentAppImage), { result: 'acquired' })
    assert.deepEqual(await witness(f.lockPath), before)
    assert.equal(await ownedDescriptors(f.root), 0)
    assert.throws(() => cap.assertHeld(), refusal('UNAVAILABLE'))
  },
)

test(
  'same-process independent descriptors contend and reacquire the same stable inode',
  options,
  async (t) => {
    const f = await fixture(t)
    const first = f.acquire()
    const before = await witness(f.lockPath)
    assert.throws(() => f.acquire(), refusal('BUSY'))
    assert.equal(await ownedDescriptors(f.root), 2)
    first.release()
    const second = f.acquire()
    second.assertHeld()
    assert.deepEqual(await witness(f.lockPath), before)
  },
)

test(
  'physical owning Node exit releases admission without deleting its stable lock',
  options,
  async (t) => {
    const f = await fixture(t)
    const child = await holdingChild(t, f.currentAppImage)
    const before = await witness(f.lockPath)
    assert.throws(() => f.acquire(), refusal('BUSY'))
    await stopChild(child)
    const cap = f.acquire()
    cap.assertHeld()
    assert.deepEqual(await witness(f.lockPath), before)
  },
)

test('unrelated child cannot inherit and pin the admission descriptor', options, async (t) => {
  const f = await fixture(t)
  const cap = f.acquire()
  const unrelated = await holdingChild(t)
  cap.release()
  assert.equal(unrelated.exitCode, null)
  assert.deepEqual(tryInChild(f.currentAppImage), { result: 'acquired' })
  await stopChild(unrelated)
})

test('independent canonical AppImage targets have independent admission', options, async (t) => {
  const f = await fixture(t)
  const cap = f.acquire()
  const other = acquireApplicationUpdateAdmission(path.join(f.applications, 'Other.AppImage'))
  try {
    cap.assertHeld()
    other.assertHeld()
    assert.deepEqual(tryInChild(other.currentAppImage), { result: 'APPLICATION_UPDATE_BUSY' })
  } finally {
    other.release()
  }
})

test('unrelated sibling changes do not invalidate the held parent identity', options, async (t) => {
  const f = await fixture(t)
  const cap = f.acquire()
  await fs.writeFile(path.join(f.applications, 'unrelated-owned-file'), 'Owned sibling.')
  cap.assertHeld()
  await fs.unlink(path.join(f.applications, 'unrelated-owned-file'))
  cap.assertHeld()
})

test('unsafe or noncanonical target parents refuse before creating a lock', options, async (t) => {
  const f = await fixture(t)
  for (const mode of [0o775, 0o702, 0o500]) {
    await fs.chmod(f.applications, mode)
    assert.throws(() => f.acquire(), refusal('UNAVAILABLE'))
    assert.deepEqual(await fs.readdir(f.applications), ['Current.AppImage'])
  }
  await fs.chmod(f.applications, 0o700)
  for (const filename of [
    'Current.AppImage',
    '/',
    `${f.applications}/../Applications/Current.AppImage`,
    `${f.currentAppImage}\0`,
  ]) {
    assert.throws(() => acquireApplicationUpdateAdmission(filename), refusal('UNAVAILABLE'))
  }
  const alias = path.join(f.root, 'alias')
  await fs.symlink(f.applications, alias)
  assert.throws(
    () => acquireApplicationUpdateAdmission(path.join(alias, 'Current.AppImage')),
    refusal('UNAVAILABLE'),
  )
  assert.equal(await ownedDescriptors(f.root), 0)
})

test('existing lock permissions are refused and never repaired', options, async (t) => {
  const f = await fixture(t)
  await fs.writeFile(f.lockPath, '', { mode: 0o644 })
  const before = await witness(f.lockPath)
  assert.throws(() => f.acquire(), refusal('UNAVAILABLE'))
  assert.deepEqual(await witness(f.lockPath), before)
  assert.equal(await ownedDescriptors(f.root), 0)
})

test('unknown existing lock contents are preserved byte for byte', options, async (t) => {
  const f = await fixture(t)
  await fs.writeFile(f.lockPath, 'Unknown retained owner data.', { mode: 0o600 })
  const before = await witness(f.lockPath)
  assert.throws(() => f.acquire(), refusal('UNAVAILABLE'))
  assert.deepEqual(await witness(f.lockPath), before)
  assert.equal(await ownedDescriptors(f.root), 0)
})

test(
  'symlink and directory lock paths are refused without changing their target',
  options,
  async (t) => {
    const f = await fixture(t)
    const target = path.join(f.root, 'untouched')
    await fs.writeFile(target, 'Owned symlink target.', { mode: 0o600 })
    const before = await witness(target)
    await fs.symlink(target, f.lockPath)
    assert.throws(() => f.acquire(), refusal('UNAVAILABLE'))
    assert.deepEqual(await witness(target), before)
    await fs.unlink(f.lockPath)
    await fs.mkdir(f.lockPath, { mode: 0o700 })
    assert.throws(() => f.acquire(), refusal('UNAVAILABLE'))
    assert.equal((await fs.lstat(f.lockPath)).isDirectory(), true)
    assert.equal(await ownedDescriptors(f.root), 0)
  },
)

test('hardlinked empty lock is refused without changing either name', options, async (t) => {
  const f = await fixture(t)
  await fs.writeFile(f.lockPath, '', { mode: 0o600 })
  const second = path.join(f.root, 'second-lock-name')
  await fs.link(f.lockPath, second)
  const before = await witness(f.lockPath)
  assert.throws(() => f.acquire(), refusal('UNAVAILABLE'))
  assert.deepEqual(await witness(f.lockPath), before)
  assert.deepEqual(await witness(second), before)
})

test(
  'same-byte lock inode substitution is sticky and release preserves both names',
  options,
  async (t) => {
    const f = await fixture(t)
    const cap = f.acquire()
    const original = path.join(f.applications, 'retained-lock')
    await fs.rename(f.lockPath, original)
    await fs.writeFile(f.lockPath, '', { mode: 0o600 })
    const replacement = await witness(f.lockPath)
    const retained = await witness(original)
    assert.throws(() => cap.assertHeld(), refusal('UNAVAILABLE'))
    cap.release()
    assert.deepEqual(await witness(f.lockPath), replacement)
    assert.deepEqual(await witness(original), retained)
    assert.throws(() => cap.assertHeld(), refusal('UNAVAILABLE'))
    assert.equal(await ownedDescriptors(f.root), 0)
  },
)

test('lock content or permission mutation makes held assertion sticky', options, async (t) => {
  const f = await fixture(t)
  const cap = f.acquire()
  await fs.chmod(f.lockPath, 0o644)
  assert.throws(() => cap.assertHeld(), refusal('UNAVAILABLE'))
  await fs.chmod(f.lockPath, 0o600)
  assert.throws(() => cap.assertHeld(), refusal('UNAVAILABLE'))
  cap.release()
  const next = f.acquire()
  await fs.writeFile(f.lockPath, 'Changed while reserved.')
  assert.throws(() => next.assertHeld(), refusal('UNAVAILABLE'))
  assert.equal(await fs.readFile(f.lockPath, 'utf8'), 'Changed while reserved.')
})

test(
  'parent replacement and permission drift refuse while retaining the original lock',
  options,
  async (t) => {
    const f = await fixture(t)
    const cap = f.acquire()
    await fs.chmod(f.applications, 0o775)
    assert.throws(() => cap.assertHeld(), refusal('UNAVAILABLE'))
    await fs.chmod(f.applications, 0o700)
    cap.release()
    const next = f.acquire()
    const moved = path.join(f.root, 'retained-applications')
    await fs.rename(f.applications, moved)
    await fs.mkdir(f.applications, { mode: 0o700 })
    assert.throws(() => next.assertHeld(), refusal('UNAVAILABLE'))
    next.release()
    assert.equal((await fs.lstat(path.join(moved, path.basename(f.lockPath)))).isFile(), true)
    assert.deepEqual(await fs.readdir(f.applications), [])
  },
)
