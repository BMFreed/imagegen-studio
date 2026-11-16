/**
 * Historical, data-only compatibility fixture. This is not a historical desktop or ML runtime.
 *
 * Fresh Invoke basis (clean 4875d96531ca6712b288f6e660fcbb34143408c1):
 * services/shared/database/startup.py::init_database, api/dependencies.py caller, and
 * services/shared/sqlite_migrator/sqlite_migrator_impl.py::run_migrations/_backup_db. Those owners
 * migrate before consumers and preserve a pre-upgrade state. Here the exact historical Studio
 * DB/Project/preset/model/queue owners produce the closed state; unchanged current Main performs
 * the upgrade. The checkpoint is a qualification copy, not a new product backup or recovery
 * mechanism. The wire child adapts runtime/index.test.mjs's installFakeInferenceRuntime and the
 * current CPU/inference ready validators; no Python, CUDA, model loading, inference, native
 * historical UI or dependency-era ABI claim is made.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import { builtinModules, createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'

const historicalRevision = '6b812f93d2715af2c4f904e70093b3f9c5b09713'
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const moduleRepo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(path.join(moduleRepo, 'package.json'))
const Database = require('better-sqlite3')
const historicalEntries = {
  openAppDatabase: ['src/main/db/database.ts', 'openAppDatabase'],
  ProjectService: ['src/main/projects/project-service.ts', 'ProjectService'],
  ProjectIndexRepository: ['src/main/projects/project-index.ts', 'ProjectIndexRepository'],
  ProjectShadowStore: ['src/main/projects/project-shadow.ts', 'ProjectShadowStore'],
  ProjectAutosaveLeaseRegistry: [
    'src/main/projects/project-autosave.ts',
    'ProjectAutosaveLeaseRegistry',
  ],
  readIgsPackage: ['src/main/projects/igs-package.ts', 'readIgsPackage'],
  PresetRepository: ['src/main/presets/preset-repository.ts', 'PresetRepository'],
  ModelRepository: ['src/main/models/model-repository.ts', 'ModelRepository'],
  GenerationQueueRepository: ['src/main/projects/generation-queue.ts', 'GenerationQueueRepository'],
  withIllustriousTxt2ImgRequest: [
    'src/main/projects/illustrious-txt2img-job.ts',
    'withIllustriousTxt2ImgRequest',
  ],
  createRuntimeRoots: ['src/main/runtime/index.ts', 'createRuntimeRoots'],
  IGS_SRGB_ICC_SHA256: ['src/shared/projects/color-profile.ts', 'IGS_SRGB_ICC_SHA256'],
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function childOf(parent, child) {
  const relative = path.relative(parent, child)
  assert.ok(
    relative && relative !== '..' && !relative.startsWith('../') && !path.isAbsolute(relative),
  )
}

async function directory(filename) {
  const entry = await fs.lstat(filename)
  assert.ok(entry.isDirectory() && !entry.isSymbolicLink(), filename)
  assert.equal(await fs.realpath(filename), filename)
  assert.equal(entry.uid, process.getuid())
}

async function absent(filename) {
  await assert.rejects(fs.lstat(filename), { code: 'ENOENT' })
}

async function writeNew(filename, bytes, mode = 0o600) {
  const file = await fs.open(filename, 'wx', mode)
  try {
    await file.writeFile(bytes)
    await file.sync()
  } finally {
    await file.close()
  }
}

async function witness(filename) {
  const handle = await fs.open(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const before = await handle.stat({ bigint: true })
    assert.ok(before.isFile())
    const bytes = await handle.readFile()
    const after = await handle.stat({ bigint: true })
    const named = await fs.lstat(filename, { bigint: true })
    for (const key of ['dev', 'ino', 'size', 'mode', 'uid', 'nlink', 'mtimeNs', 'ctimeNs']) {
      assert.equal(after[key], before[key], filename)
      assert.equal(named[key], before[key], filename)
    }
    return {
      path: filename,
      sha256: sha256(bytes),
      sizeBytes: bytes.length,
      identity: Object.fromEntries(
        ['dev', 'ino', 'mode', 'uid', 'nlink', 'mtimeNs', 'ctimeNs'].map((key) => [
          key,
          String(before[key]),
        ]),
      ),
    }
  } finally {
    await handle.close()
  }
}

function git(repo, ...args) {
  return execFileSync('git', ['-C', repo, ...args], { maxBuffer: 64 * 1024 * 1024 })
}

function quoteIdentifier(value) {
  return '"' + value.replaceAll('"', '""') + '"'
}

/** Read-only SQL transaction, usable for the closed fixture and a live WAL database. */
export function snapshotDatabase(filename, { closed = false } = {}) {
  let db
  if (closed) {
    // A qualification checkpoint has no live connection and no uncheckpointed pages.
    // Reuse the retained-byte auditor's memory deserialization: readonly WAL connections
    // can write SHM coordination metadata. Never normalize the actual file or ignore WAL.
    for (const suffix of ['-wal', '-journal']) {
      try {
        const sidecar = lstatSync(filename + suffix)
        assert.ok(sidecar.isFile() && !sidecar.isSymbolicLink() && sidecar.size === 0)
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
    const descriptor = openSync(filename, constants.O_RDONLY | constants.O_NOFOLLOW)
    let bytes
    try {
      const before = fstatSync(descriptor, { bigint: true })
      assert.ok(before.isFile())
      bytes = readFileSync(descriptor)
      const after = fstatSync(descriptor, { bigint: true })
      const named = lstatSync(filename, { bigint: true })
      for (const key of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs']) {
        assert.equal(after[key], before[key])
        assert.equal(named[key], before[key])
      }
    } finally {
      closeSync(descriptor)
    }
    assert.equal(bytes.subarray(0, 16).toString('binary'), 'SQLite format 3\0')
    assert.ok((bytes[18] === 1 && bytes[19] === 1) || (bytes[18] === 2 && bytes[19] === 2))
    // Only the private Buffer changes; the empty-WAL source is never opened by SQLite.
    bytes[18] = 1
    bytes[19] = 1
    db = new Database(bytes, { readonly: true })
  } else {
    db = new Database(filename, { fileMustExist: true, readonly: true })
  }
  try {
    return db.transaction(() => {
      const schema = db
        .prepare(
          "SELECT name, type, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
        )
        .all()
      const tables = {}
      const names = db
        .prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name")
        .all()
      for (const { name } of names) {
        const columns = db.prepare('PRAGMA table_info(' + quoteIdentifier(name) + ')').all()
        const ordering = columns.map((column) => quoteIdentifier(column.name)).join(', ')
        const rows = db
          .prepare(
            'SELECT * FROM ' + quoteIdentifier(name) + (ordering ? ' ORDER BY ' + ordering : ''),
          )
          .all()
        tables[name] = { columns, rows: JSON.parse(JSON.stringify(rows)) }
      }
      return {
        schema,
        schemaMigrations: tables.schema_migrations?.rows ?? [],
        tables,
        integrityCheck: db.pragma('integrity_check', { simple: true }),
        foreignKeyCheck: db.pragma('foreign_key_check'),
      }
    })()
  } finally {
    db.close()
  }
}

async function inventory(root) {
  const files = []
  async function visit(directoryPath) {
    for (const name of (await fs.readdir(directoryPath)).sort()) {
      const filename = path.join(directoryPath, name)
      const entry = await fs.lstat(filename)
      if (entry.isDirectory() && !entry.isSymbolicLink()) await visit(filename)
      else if (entry.isSymbolicLink())
        files.push({
          path: path.relative(root, filename),
          kind: 'symlink',
          target: await fs.readlink(filename),
        })
      else {
        assert.ok(entry.isFile(), filename)
        const value = await witness(filename)
        files.push({ ...value, path: path.relative(root, filename), kind: 'file' })
      }
    }
  }
  await visit(root)
  return files
}

async function historicalBundle(repo, run) {
  const sourceRoot = path.join(run, 'payloads/historical-source')
  await absent(sourceRoot)
  const currentRequire = createRequire(path.join(repo, 'package.json'))
  const ts = currentRequire('typescript')
  const esbuild = currentRequire('esbuild')
  const tracked = new Map(
    git(repo, 'ls-tree', '-r', '-z', historicalRevision)
      .toString('utf8')
      .split('\0')
      .filter(Boolean)
      .map((line) => {
        const [metadata, filename] = line.split('\t')
        return [filename, metadata]
      }),
  )
  const selected = new Set()
  const cache = new Map()
  function source(filename) {
    assert.match(tracked.get(filename) ?? '', /^100644 blob [a-f0-9]{40}$/)
    if (!cache.has(filename))
      cache.set(filename, git(repo, 'show', historicalRevision + ':' + filename))
    return cache.get(filename)
  }
  function resolveRelative(importer, specifier) {
    const relative = path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier))
    assert.ok(!relative.startsWith('../') && !path.posix.isAbsolute(relative))
    const stem = relative.endsWith('.js') ? relative.slice(0, -3) : relative
    const possibilities = [relative, stem + '.ts', stem + '.tsx', stem + '.mjs', stem + '/index.ts']
    const found = possibilities.find((candidate) => tracked.has(candidate))
    assert.ok(found, 'Unresolved historical import: ' + importer + ' -> ' + specifier)
    return found
  }
  function add(filename) {
    if (selected.has(filename)) return
    selected.add(filename)
    const bytes = source(filename)
    if (!filename.endsWith('.ts') && !filename.endsWith('.tsx') && !filename.endsWith('.mjs'))
      return
    for (const item of ts.preProcessFile(bytes.toString('utf8'), true, true).importedFiles) {
      if (item.fileName.startsWith('.')) add(resolveRelative(filename, item.fileName))
    }
  }
  for (const [filename] of Object.values(historicalEntries)) add(filename)
  for (const filename of tracked.keys()) {
    if (
      /^src\/main\/db\/migrations\/\d{4}_[a-z0-9_]+\.sql$/.test(filename) ||
      filename.startsWith('src/main/projects/placeholders/')
    )
      add(filename)
  }
  add('package.json')
  add('pnpm-lock.yaml')
  add('worker-python/src/imagegen_worker/srgb.icc')
  const paths = [...selected].sort()
  const migrations = paths.filter((filename) => filename.startsWith('src/main/db/migrations/'))
  assert.equal(migrations.length, 29)
  assert.match(migrations.at(-1), /0029_project_rename\.sql$/)
  await fs.mkdir(sourceRoot, { mode: 0o700 })
  const archivePath = path.join(run, 'payloads/historical-source.tar')
  await writeNew(
    archivePath,
    git(repo, 'archive', '--format=tar', historicalRevision, '--', ...paths),
  )
  execFileSync(
    '/usr/bin/tar',
    [
      '--extract',
      '--file',
      archivePath,
      '--directory',
      sourceRoot,
      '--no-same-owner',
      '--no-same-permissions',
    ],
    { stdio: 'pipe' },
  )
  const graph = []
  for (const filename of paths) {
    const actual = await fs.readFile(path.join(sourceRoot, filename))
    assert.ok(actual.equals(source(filename)), filename)
    graph.push({ path: filename, sha256: sha256(actual), sizeBytes: actual.length })
  }
  const external = new Map()
  const builtin = new Set([...builtinModules, ...builtinModules.map((name) => 'node:' + name)])
  const bundlePath = path.join(run, 'payloads/historical-owners.cjs')
  await absent(bundlePath)
  const entry = Object.entries(historicalEntries)
    .map(
      ([exported, [filename, original]]) =>
        'export { ' +
        original +
        ' as ' +
        exported +
        ' } from ' +
        JSON.stringify(path.join(sourceRoot, filename)),
    )
    .join('\n')
  const built = await esbuild.build({
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node26',
    outfile: bundlePath,
    write: false,
    metafile: true,
    stdin: {
      contents: entry,
      loader: 'ts',
      resolveDir: sourceRoot,
      sourcefile: 'historical-owner-entry.ts',
    },
    plugins: [
      {
        name: 'pinned-current-dependencies',
        setup(build) {
          build.onResolve({ filter: /^[^./]/ }, (args) => {
            if (builtin.has(args.path)) return { path: args.path, external: true }
            const resolved = currentRequire.resolve(args.path)
            external.set(args.path, resolved)
            return { path: resolved, external: true }
          })
        },
      },
    ],
  })
  assert.equal(built.outputFiles.length, 1)
  await writeNew(bundlePath, built.outputFiles[0].contents)
  const oldPackage = JSON.parse(source('package.json').toString('utf8'))
  const currentPackage = JSON.parse(await fs.readFile(path.join(repo, 'package.json'), 'utf8'))
  const usedDependencies = []
  for (const [specifier, resolved] of [...external].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const name = specifier.startsWith('@')
      ? specifier.split('/').slice(0, 2).join('/')
      : specifier.split('/')[0]
    let parent = path.dirname(await fs.realpath(resolved))
    let found
    while (parent !== path.dirname(parent)) {
      try {
        const candidate = JSON.parse(await fs.readFile(path.join(parent, 'package.json'), 'utf8'))
        if (candidate.name === name) {
          found = { candidate, file: path.join(parent, 'package.json') }
          break
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      parent = path.dirname(parent)
    }
    assert.ok(found, 'Dependency package not found: ' + name)
    const historicalDeclared =
      oldPackage.dependencies?.[name] ?? oldPackage.devDependencies?.[name] ?? null
    const currentDeclared =
      currentPackage.dependencies?.[name] ?? currentPackage.devDependencies?.[name] ?? null
    usedDependencies.push({
      name,
      specifier,
      resolved,
      version: found.candidate.version,
      historicalDeclared,
      currentDeclared,
      declarationUnchanged: historicalDeclared === currentDeclared,
      package: await witness(found.file),
      entry: await witness(await fs.realpath(resolved)),
    })
  }
  return {
    root: sourceRoot,
    bundlePath,
    archive: await witness(archivePath),
    bundle: await witness(bundlePath),
    graph,
    migrations: migrations.map((filename) => ({
      name: path.basename(filename),
      sha256: sha256(source(filename)),
    })),
    build: {
      esbuild: esbuild.version,
      typescript: ts.version,
      inputs: Object.keys(built.metafile.inputs).sort(),
      usedDependencies,
    },
    limits: [
      'Exact historical application source and SQL; current pinned dependency binaries and Node ABI.',
      'No historical UI/Electron binary, original dependency-era execution, production backup or ML compatibility claim.',
    ],
  }
}

function pngChunk(name, bytes) {
  const type = Buffer.from(name, 'ascii')
  const output = Buffer.alloc(bytes.length + 12)
  output.writeUInt32BE(bytes.length)
  type.copy(output, 4)
  bytes.copy(output, 8)
  output.writeUInt32BE(crc32(Buffer.concat([type, bytes])), bytes.length + 8)
  return output
}

function transparentPng(profile, profileSha256) {
  assert.equal(sha256(profile), profileSha256)
  const header = Buffer.alloc(13)
  header.writeUInt32BE(64, 0)
  header.writeUInt32BE(64, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('iCCP', Buffer.concat([Buffer.from('sRGB\0\0'), deflateSync(profile)])),
    pngChunk('IDAT', deflateSync(Buffer.alloc(64 * (1 + 64 * 4)))),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

async function wrongProtocolRuntime(owners, appData) {
  const roots = await owners.createRuntimeRoots(appData)
  const runtimeId = 'worker-2-linux-nvidia'
  const environmentRoot = path.join(roots.environmentsDir, runtimeId)
  await fs.mkdir(environmentRoot, { mode: 0o700 })
  await fs.mkdir(path.join(environmentRoot, 'bin'), { mode: 0o700 })
  await fs.mkdir(path.join(environmentRoot, 'resources'), { mode: 0o700 })
  const configDir = path.join(environmentRoot, 'resources/sdxl-config')
  await fs.mkdir(configDir, { mode: 0o700 })
  await writeNew(
    path.join(configDir, 'model_index.json'),
    '{"_class_name":"ControlledProtocolFixture"}\n',
  )
  const nodePath = await fs.realpath(process.execPath)
  assert.ok(path.isAbsolute(nodePath) && !/\s/.test(nodePath))
  const programPath = path.join(roots.pythonDir, 'program')
  const logPath = path.join(appData, 'wrong-protocol-events.jsonl')
  await writeNew(logPath, '')
  const constantsJson = JSON.stringify({
    runtimeRoot: roots.runtimeDir,
    environmentRoot,
    configDir,
    logPath,
    cacheDir: roots.cacheDir,
  })
  const program =
    '#!' +
    nodePath +
    '\n' +
    String.raw`
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const fixture = ` +
    constantsJson +
    String.raw`
const argv = process.argv.slice(2)
const moduleName = argv[2]
const startTicks = fs.readFileSync('/proc/self/stat', 'utf8').split(') ').at(-1).split(' ')[19]
function record(type, details = {}) {
  fs.appendFileSync(fixture.logPath, JSON.stringify({ type, pid: process.pid, parentPid: process.ppid, startTicks, module: moduleName, argv, ...details }) + '\n', { mode: 0o600 })
}
record('launch', { cwd: process.cwd() })
process.on('exit', (code) => record('exit', { code }))
process.on('SIGTERM', () => { record('signal', { signal: 'SIGTERM' }); process.exit(0) })
assert.equal(process.cwd(), fixture.runtimeRoot)
assert.equal(process.env.HF_HOME, fixture.cacheDir)
for (const key of ['HF_HUB_OFFLINE', 'TRANSFORMERS_OFFLINE', 'HF_DATASETS_OFFLINE']) assert.equal(process.env[key], '1')
let ready
if (moduleName === 'imagegen_worker') {
  assert.deepEqual(argv, ['-I', '-m', 'imagegen_worker'])
  assert.equal(process.env.CUDA_VISIBLE_DEVICES, '')
  ready = { type: 'ready', protocolVersion: '2', pythonVersion: '3.12.13', workerVersion: '0.1.0', runtimeProfile: 'derivatives-only', capabilities: ['image-derivatives', 'import-normalization', 'self-test', 'target-composition'] }
} else {
  assert.equal(argv.length, 7)
  assert.deepEqual(argv.slice(0, 6), ['-I', '-m', 'imagegen_worker.owned_inference', '--parent-pid', String(process.ppid), '--scratch-base'])
  assert.ok(path.isAbsolute(argv[6]) && path.resolve(argv[6]) === argv[6])
  assert.equal(process.env.IGS_SDXL_CONFIG_DIR, fixture.configDir)
  assert.equal(JSON.parse(fs.readFileSync(path.join(fixture.configDir, 'model_index.json'), 'utf8'))._class_name, 'ControlledProtocolFixture')
  ready = { type: 'ready', protocolVersion: '2', pythonVersion: '3.12.13', workerVersion: '0.14.0', runtimeProfile: 'linux-nvidia', capabilities: ['illustrious-txt2img', 'denoising-progress', 'candidate-thumbnails', 'illustrious-cfg-rescale', 'illustrious-img2img', 'illustrious-lora', 'illustrious-vae-precision', 'illustrious-external-vae', 'illustrious-embeddings', 'illustrious-outpaint', 'smart-patch-execution', 'smart-patch-seed-confirmation', 'linux-owned-inference-v1'] }
}
record('ready', { record: ready })
process.stdout.write(JSON.stringify(ready) + '\n')
process.stdin.on('data', () => { record('unexpected-request'); process.exitCode = 73 })
process.stdin.resume()
// The incompatible record must be rejected by the real client; its SIGTERM owns normal exit.
setInterval(() => {}, 1000)
`
  await writeNew(programPath, program, 0o700)
  const pythonExecutable = path.join(environmentRoot, 'bin/python')
  await fs.symlink(path.relative(path.dirname(pythonExecutable), programPath), pythonExecutable)
  await writeNew(
    roots.pointerFile,
    JSON.stringify({ schemaVersion: 1, runtimeId, pythonExecutable }) + '\n',
  )
  return {
    runtimeRoot: roots.runtimeDir,
    pointerFile: roots.pointerFile,
    environmentRoot,
    runtimeId,
    programPath,
    pythonExecutable,
    nodePath,
    nodeSha256: (await witness(nodePath)).sha256,
    logPath,
    configDir,
    program: await witness(programPath),
    pointer: await witness(roots.pointerFile),
    protocolVersion: '2',
    expectedProtocolVersion: '1',
    limits:
      'Controlled Node JSONL wire fixture. No Python package, kernel inference ownership, GPU, CUDA, model or inference work.',
  }
}

/** Fresh-only producer. Failures preserve partial owned evidence; there is no resume or cleanup. */
export async function prepareHistoricalState({ repo, run, root }) {
  assert.equal(process.platform, 'linux')
  assert.equal(process.arch, 'x64')
  assert.equal(repo, moduleRepo)
  for (const filename of [repo, run, root])
    assert.ok(path.isAbsolute(filename) && path.normalize(filename) === filename)
  childOf(artifactRoot, run)
  assert.equal(root, path.join(run, 'payloads/subject'))
  await directory(repo)
  await directory(run)
  await directory(path.join(run, 'payloads'))
  const lifecycle = JSON.parse(await fs.readFile(path.join(run, 'artifact-lifecycle.json'), 'utf8'))
  assert.equal(lifecycle.state, 'running')
  assert.equal(lifecycle.evidence, run)
  assert.ok(lifecycle.payloads.includes(path.join(run, 'payloads')))
  await absent(root)
  await absent(path.join(run, 'historical-fixture.json'))
  assert.equal(
    git(repo, 'rev-parse', historicalRevision + '^{commit}')
      .toString('utf8')
      .trim(),
    historicalRevision,
  )
  const historicalSource = await historicalBundle(repo, run)
  const owners = require(historicalSource.bundlePath)
  await fs.mkdir(root, { mode: 0o700 })
  await fs.mkdir(path.join(root, 'data'), { mode: 0o700 })
  const appData = path.join(root, 'data/imagegen-studio')
  await fs.mkdir(appData, { mode: 0o700 })
  const runtime = await wrongProtocolRuntime(owners, appData)
  const database = owners.openAppDatabase(
    appData,
    path.join(historicalSource.root, 'src/main/db/migrations'),
  )
  const projectTitle = 'Upgrade compatibility sample'
  const initialPrompt = 'A blue ceramic cube on a plain table.'
  const sentinel = {
    key: 'application-state-upgrade-sentinel',
    value: 'closed-historical29-' + randomUUID(),
  }
  let project
  let preset
  let model
  let queue
  try {
    const repository = new owners.ProjectIndexRepository(database.db)
    const service = new owners.ProjectService({
      dataRoot: appData,
      repository,
      roots: {
        placeholdersDir: path.join(historicalSource.root, 'src/main/projects/placeholders'),
        scratchDir: path.join(appData, 'scratch'),
      },
      shadow: new owners.ProjectShadowStore(path.join(appData, 'autosave')),
      autosaveOptions: { debounceMs: 0, leaseRegistry: new owners.ProjectAutosaveLeaseRegistry() },
    })
    let tab = await service.create({ width: 64, height: 64, title: projectTitle })
    tab = await service.updateGenerationDraft(tab.id, {
      kind: 'positive-prompt',
      text: initialPrompt,
    })
    await service.save(tab.id)
    const indexed = (await repository.listProjects()).find(
      (entry) => entry.localProjectKey === tab.id,
    )
    assert.ok(indexed)
    const saved = await owners.readIgsPackage(indexed.canonicalPath)
    assert.equal(saved.project.generationDraft.positivePrompt.text, initialPrompt)
    project = {
      projectId: tab.id,
      projectTitle,
      projectFile: indexed.canonicalPath,
      initialPrompt,
      initialProject: await witness(indexed.canonicalPath),
      documentId: saved.project.documentId,
      documentRevision: saved.project.documentRevision,
    }
    await service.close(tab.id)
    preset = await new owners.PresetRepository(database.db).create({
      name: 'Upgrade compatibility preset',
      description: 'Owned compatibility fixture',
      favorite: true,
      tags: ['compatibility'],
      workflow: 'textToImage',
      payload: { prompt: { embeddingRefs: [], text: initialPrompt } },
    })
    const modelsDir = path.join(appData, 'models')
    await fs.mkdir(modelsDir, { mode: 0o700 })
    const managedPath = path.join(modelsDir, 'compatibility-fixture.safetensors')
    const modelBytes = Buffer.from('Controlled catalog identity fixture; not model weights.\n')
    await writeNew(managedPath, modelBytes)
    const artifact = {
      file: {
        managedPath,
        originalFilename: path.basename(managedPath),
        sha256: sha256(modelBytes),
        sizeBytes: modelBytes.length,
        verifiedAt: new Date().toISOString(),
      },
      resource: {
        displayName: 'Compatibility catalog fixture',
        type: 'checkpoint',
        source: { kind: 'civitai', modelId: 900000001 },
        sourceMetadata: { fixture: true },
      },
      version: {
        name: 'Fixture 1',
        format: 'safetensors',
        baseModelFamily: 'illustrious',
        predictionType: 'epsilon',
        source: {
          kind: 'civitai',
          versionId: 900000002,
          fileId: 900000003,
          expectedSha256: sha256(modelBytes),
        },
        sourceMetadata: { fixture: true },
      },
    }
    const published = await new owners.ModelRepository(database.db).publishVerifiedInstallation({
      primary: artifact,
    })
    model = {
      ...published,
      file: await witness(managedPath),
      limits:
        'Catalog/byte identity fixture only; not a usable checkpoint or downloaded CivitAI resource.',
    }
    const reference = {
      baseModelFamily: 'illustrious',
      civitaiModelId: 900000001,
      civitaiVersionId: 900000002,
      civitaiFileId: 900000003,
      displayName: artifact.resource.displayName,
      versionName: artifact.version.name,
      fileSha256: artifact.file.sha256,
      localModelId: published.resourceId,
      localVersionId: published.versionId,
      kind: 'checkpoint',
      predictionType: 'epsilon',
    }
    const png = transparentPng(
      await fs.readFile(
        path.join(historicalSource.root, 'worker-python/src/imagegen_worker/srgb.icc'),
      ),
      owners.IGS_SRGB_ICC_SHA256,
    )
    const prepared = {
      context: {
        bbox: { x: 0, y: 0, width: 64, height: 64 },
        documentId: project.documentId,
        documentRevision: project.documentRevision,
        kind: 'normal-txt2img-preparation',
        schemaVersion: 1,
        model: { managedPath, reference },
        prompts: { positive: initialPrompt, negative: '' },
        sampling: {
          cfgScale: 7.5,
          invokeScheduler: 'dpmpp_2m_k',
          requestedSeedPolicy: 'fixed',
          sampler: 'DPM++ 2M',
          scheduler: 'Karras',
          seed: 42,
          steps: 24,
        },
        target: {
          byteSize: png.length,
          colorSpace: 'srgb',
          format: 'png',
          height: 64,
          width: 64,
          iccSha256: owners.IGS_SRGB_ICC_SHA256,
          sha256: sha256(png),
        },
      },
      targetPngBytes: png,
    }
    const queueOwner = new owners.GenerationQueueRepository(database.db, appData)
    await queueOwner.recoverAfterRestart()
    await fs.mkdir(path.join(appData, 'scratch'), { recursive: true, mode: 0o700 })
    const item = await owners.withIllustriousTxt2ImgRequest({
      prepared,
      ready: {
        protocolVersion: '1',
        runtimeProfile: 'linux-nvidia',
        workerVersion: '0.2.0',
        capabilities: ['illustrious-txt2img'],
      },
      modelService: {
        assertNoUnboundGenerationEmbeddings: async () => {},
        resolveVerifiedGenerationCheckpointForPlan: async (requested) => ({
          managedPath,
          reference: requested,
        }),
        resolveVerifiedGenerationEmbeddingForPlan: async () => {
          throw new Error('No embedding fixture')
        },
        resolveVerifiedGenerationLoraForPlan: async () => {
          throw new Error('No LoRA fixture')
        },
        resolveVerifiedGenerationVaeForPlan: async () => {
          throw new Error('No external VAE fixture')
        },
      },
      scratchBasePath: path.join(appData, 'scratch'),
      use: async (request) =>
        await queueOwner.enqueueIllustriousTxt2Img({
          prepared,
          projectPath: project.projectFile,
          request,
          stagingSessionId: randomUUID(),
        }),
    })
    queue = await queueOwner.cancel(item.id)
    assert.equal(queue.status, 'canceled')
    await database.db.insertInto('app_metadata').values(sentinel).execute()
  } finally {
    await database.close()
  }
  const baseline = snapshotDatabase(database.filePath)
  assert.equal(baseline.integrityCheck, 'ok')
  assert.deepEqual(baseline.foreignKeyCheck, [])
  assert.equal(baseline.schemaMigrations.length, 29)
  assert.equal(baseline.tables.model_reference_identity, undefined)
  const checkpointRoot = path.join(run, 'payloads/checkpoint-29')
  await absent(checkpointRoot)
  await fs.cp(root, checkpointRoot, {
    recursive: true,
    dereference: false,
    errorOnExist: true,
    force: false,
  })
  const checkpointFile = path.join(checkpointRoot, path.relative(root, database.filePath))
  assert.deepEqual(snapshotDatabase(checkpointFile), baseline)
  const descriptor = {
    schemaVersion: 1,
    historicalRevision,
    root,
    appData,
    historicalSource,
    historicalDatabaseBundle: historicalSource.bundlePath,
    project,
    preset,
    model,
    queue,
    sentinel,
    runtime,
    database: { file: database.filePath, checkpointFile, baseline },
    checkpoint29: {
      root: checkpointRoot,
      files: await inventory(checkpointRoot),
      sourceFiles: await inventory(root),
    },
    limits: [
      'Historical owner execution against current pinned dependencies; no historical desktop or dependency-era ABI claim.',
      'Seeded preset/catalog/terminal queue persist through real historical owners. Queue qualification uses the existing test-only model verifier, not ML inference.',
      'Closed pre-upgrade checkpoint retained before current Main; product does not gain automatic backup/rollback from this fixture.',
      'Wrong-protocol Node process substitutes only wire input; a ready diagnostic does not prove Python, GPU, model or engine readiness.',
    ],
  }
  await writeNew(
    path.join(run, 'historical-fixture.json'),
    JSON.stringify(descriptor, null, 2) + '\n',
  )
  return descriptor
}
