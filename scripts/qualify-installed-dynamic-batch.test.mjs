/** Actual CLI refusals before dependency reads, native launch or evidence publication; no ML. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const repository = path.dirname(import.meta.dirname)
const script = path.join(repository, 'scripts/qualify-installed-dynamic-batch.mjs')
const guardFailure = 'DYNAMIC_BATCH_CLI_BOUNDARY_CROSSED'

// Observe the real entry point's filesystem boundary. The instrumentation is loaded after tsx,
// before the runner: it leaves ordinary module reads alone, records owned-path access and stops
// any application process launch. The tsx import may start its own esbuild compiler while loading
// production TypeScript; that tool is permitted. A rejected forbidden call is still recorded, so
// it cannot pass as a harmless nonzero exit. Trace writes use captured file-descriptor operations.
const guardSource = `
import * as fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = process.env.IGS_DYNAMIC_CLI_GUARD_ROOT
const suppliedFixture = process.env.IGS_DYNAMIC_CLI_GUARD_FIXTURE
const allowFixture = process.env.IGS_DYNAMIC_CLI_GUARD_ALLOW_FIXTURE === '1'
const trace = process.env.IGS_DYNAMIC_CLI_GUARD_TRACE
const originalOpen = fs.default.openSync
const originalWrite = fs.default.writeSync
const originalClose = fs.default.closeSync
function record(entry) {
  const descriptor = originalOpen(trace, 'a')
  const bytes = Buffer.from(JSON.stringify(entry) + '\\n')
  try {
    let offset = 0
    while (offset < bytes.length) offset += originalWrite(descriptor, bytes, offset, bytes.length - offset)
  } finally { originalClose(descriptor) }
}
function inputPath(value) {
  if (value instanceof URL) return value.protocol === 'file:' ? fileURLToPath(value) : null
  if (Buffer.isBuffer(value)) value = value.toString()
  return typeof value === 'string' ? path.resolve(value) : null
}
function check(method, value, writable = false) {
  const filename = inputPath(value)
  if (!filename || (filename !== root && !filename.startsWith(root + path.sep))) return
  const allowed = allowFixture && filename === suppliedFixture && !writable
  record({ method, path: filename, allowed })
  if (!allowed) throw new Error('${guardFailure}: ' + method)
}
const readMethods = ['readFile', 'stat', 'lstat', 'realpath', 'access', 'readdir', 'readlink']
const writeMethods = ['writeFile', 'appendFile', 'mkdir', 'rm', 'rmdir', 'unlink', 'chmod', 'chown', 'truncate', 'rename', 'copyFile', 'cp', 'link', 'symlink']
for (const [target, suffix] of [[fs.default, 'Sync'], [fsPromises, '']]) {
  for (const name of readMethods) {
    for (const method of suffix ? [name, name + suffix] : [name]) {
      const original = target[method]
      if (typeof original !== 'function') continue
      target[method] = function (...args) { check(method, args[0]); return original.apply(this, args) }
    }
  }
  for (const name of writeMethods) {
    for (const method of suffix ? [name, name + suffix] : [name]) {
      const original = target[method]
      if (typeof original !== 'function') continue
      target[method] = function (...args) {
        check(method, args[0], true)
        if (['rename', 'copyFile', 'cp', 'link', 'symlink'].includes(name)) check(method, args[1], true)
        return original.apply(this, args)
      }
    }
  }
  for (const method of suffix ? ['open', 'openSync'] : ['open']) {
    const original = target[method]
    target[method] = function (...args) {
      check(method, args[0], args[1] !== 'r' && args[1] !== fs.constants.O_RDONLY)
      return original.apply(this, args)
    }
  }
}
for (const method of ['createReadStream', 'createWriteStream']) {
  const original = fs.default[method]
  fs.default[method] = function (...args) {
    check(method, args[0], method === 'createWriteStream')
    return original.apply(this, args)
  }
}
for (const method of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
  const original = childProcess[method]
  childProcess[method] = function (...args) {
    const executable = inputPath(args[0])
    if (executable && path.basename(executable) === 'esbuild' && executable.includes(path.sep + 'node_modules' + path.sep)) {
      return original.apply(this, args)
    }
    record({ method, allowed: false, nativeLaunch: true })
    throw new Error('${guardFailure}: ' + method)
  }
}
syncBuiltinESMExports()
`

async function withFixture(use) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'igs-dynamic-cli-refusal-'))
  const appData = path.join(root, 'data/imagegen-studio')
  const artifacts = path.join(root, 'evidence')
  const fixturePath = path.join(root, 'fixture.json')
  const referenceFixture = path.join(root, 'reference.json')
  const guard = path.join(root, 'observe-boundary.mjs')
  const trace = path.join(root, 'access.jsonl')
  const markerPath = path.join(appData, 'qualification-runtime.json')
  const pointerPath = path.join(appData, 'runtime/current-runtime.json')
  const modelPath = path.join(appData, 'models/unread-original.safetensors')
  await fs.mkdir(path.dirname(pointerPath), { recursive: true })
  await fs.mkdir(path.dirname(modelPath), { recursive: true })
  await fs.mkdir(artifacts)
  const preserved = new Map([
    [referenceFixture, 'reference fixture must remain unread'],
    [markerPath, 'provision marker must remain unread'],
    [pointerPath, 'runtime pointer must remain unread'],
    [modelPath, 'model bytes must remain unread'],
    [path.join(artifacts, 'preserved-evidence.txt'), 'existing evidence must remain unchanged'],
  ])
  for (const [filename, contents] of preserved) await fs.writeFile(filename, contents)
  await fs.writeFile(guard, guardSource)
  const ownedPaths = async () => {
    const entries = await fs.readdir(root, { recursive: true })
    return entries.sort()
  }
  async function run(args, allowFixture = false) {
    await fs.writeFile(trace, '')
    const before = await ownedPaths()
    let refusal
    await assert.rejects(
      exec(process.execPath, ['--import', 'tsx', '--import', guard, script, ...args], {
        cwd: repository,
        timeout: 15_000,
        maxBuffer: 256 * 1024,
        env: {
          ...process.env,
          IGS_DYNAMIC_CLI_GUARD_ROOT: root,
          IGS_DYNAMIC_CLI_GUARD_FIXTURE: fixturePath,
          IGS_DYNAMIC_CLI_GUARD_ALLOW_FIXTURE: allowFixture ? '1' : '0',
          IGS_DYNAMIC_CLI_GUARD_TRACE: trace,
        },
      }),
      (error) => {
        assert.equal(error.code, 1, 'CLI refusal must be a normal exit, not a timeout or signal')
        assert.equal(error.killed, false)
        refusal = error
        return true
      },
    )
    assert.doesNotMatch(refusal.stderr, new RegExp(guardFailure))
    assert.match(refusal.stderr, /qualify-installed-dynamic-batch\.mjs/)
    const operations = (await fs.readFile(trace, 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    assert.ok(
      operations.every((entry) => entry.allowed === true),
      'no dependency or launch boundary',
    )
    assert.deepEqual(
      await ownedPaths(),
      before,
      'refusal cannot create output or remove owned files',
    )
    for (const [filename, contents] of preserved)
      assert.equal(await fs.readFile(filename, 'utf8'), contents)
    return { refusal, operations }
  }
  try {
    await use({ root, fixturePath, referenceFixture, appData, artifacts, run })
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

test('actual dynamic qualification CLI refuses malformed argv before reading any fixture', async (t) => {
  await withFixture(async ({ root, fixturePath, run }) => {
    await fs.writeFile(fixturePath, '{ this deliberately invalid JSON must never be read')
    const cases = [
      ['missing arguments', []],
      ['missing fixture value', ['--fixture']],
      ['missing fixture flag', [fixturePath]],
      ['unknown flag', ['--unknown', fixturePath]],
      ['unknown additional flag', ['--fixture', fixturePath, '--resume']],
      ['duplicate fixture flag', ['--fixture', fixturePath, '--fixture', fixturePath]],
      ['relative fixture', ['--fixture', path.relative(repository, fixturePath)]],
      ['nonnormalized absolute fixture', ['--fixture', `${root}/./fixture.json`]],
    ]
    for (const [name, args] of cases) {
      await t.test(name, async () => {
        const { refusal, operations } = await run(args)
        assert.match(refusal.stderr, /AssertionError/)
        assert.doesNotMatch(refusal.stderr, /SyntaxError|ENOENT/)
        assert.deepEqual(
          operations,
          [],
          'invalid arguments must not read even the supplied fixture',
        )
      })
    }
  })
})

test('actual dynamic qualification CLI refuses raw invalid JSON after only its supplied fixture read', async () => {
  await withFixture(async ({ fixturePath, referenceFixture, appData, artifacts, run }) => {
    const incomplete = JSON.stringify({ referenceFixture, appData, artifacts }).slice(0, -1) + ','
    await fs.writeFile(fixturePath, incomplete)
    const { refusal, operations } = await run(['--fixture', fixturePath], true)
    assert.match(refusal.stderr, /SyntaxError/)
    assert.doesNotMatch(refusal.stderr, /ENOENT|provision|qualified runtime|safetensors/i)
    assert.ok(operations.length > 0, 'the real entry point must reach its direct fixture read')
    assert.ok(operations.every((entry) => entry.path === fixturePath))
    assert.ok(
      operations.some((entry) =>
        ['readFile', 'readFileSync', 'open', 'openSync'].includes(entry.method),
      ),
      'a JSON parse refusal must observe actual supplied bytes',
    )
  })
})

test('actual dynamic qualification CLI refuses an incomplete parsed wrapper before dependency reads', async () => {
  await withFixture(async ({ fixturePath, referenceFixture, appData, artifacts, run }) => {
    // Deliberately incomplete, rather than a positive wrapper fixture: this checks validation
    // ordering without attributing refusal to one particular required field.
    await fs.writeFile(fixturePath, JSON.stringify({ referenceFixture, appData, artifacts }))
    const { refusal, operations } = await run(['--fixture', fixturePath], true)
    assert.doesNotMatch(refusal.stderr, /SyntaxError|ENOENT/)
    assert.ok(operations.length > 0)
    assert.ok(operations.every((entry) => entry.path === fixturePath))
  })
})
