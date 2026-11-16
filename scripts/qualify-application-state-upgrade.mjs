/**
 * Copied-state qualification, not a historical desktop, installer or shipping release.
 *
 * Fresh source basis: InvokeAI4875d96531ca6712b288f6e660fcbb34143408c1,
 * database/startup.py::init_database/_migrator -> sqlite_migrator_impl.py::run_migrations,
 * _backup_db/_run_migration -> Database.backup; api/dependencies.py caller. Historical Studio
 * owners produce real29-migration state; the unchanged current Main applies migration0030. Invoke
 * launcher c267bdb439519216b277a7a8c6ad408b9d79efce, electron-builder.config.ts and package.json
 * package caller supply the existing AppImage/fuse mechanism, adapted by Studio's
 * electron-builder.config.cjs. No updater, new extractor, signing or runtime installer.
 *
 * Prepare and run are separate, fresh-only operations. Existing payloads are never resumed, reset
 * or cleaned here. Root owns budgets, physical-exit review, retention and exact cleanup. CLI:
 * --artifacts <absolute owned RUN> --phase prepare|run [--revision r1]. Prepare requires a
 * caller-scoped ELECTRON_BUILDER_CACHE=<RUN>/payloads/builder-cache, never a global env edit.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const artifactRoot = path.join(os.homedir(), '.codex', 'artifacts', 'imagegen-studio')
const historicalRevision = '6b812f93d2715af2c4f904e70093b3f9c5b09713'
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(repo, 'package.json'))
const supplied = new Map()
const args = process.argv.slice(2)
assert.ok(args.length === 4 || args.length === 6)
for (let index = 0; index < args.length; index += 2) {
  const key = args[index]
  assert.ok(['--artifacts', '--phase', '--revision'].includes(key) && !supplied.has(key))
  assert.ok(args[index + 1])
  supplied.set(key, args[index + 1])
}
const run = supplied.get('--artifacts')
const phase = supplied.get('--phase')
const revision = supplied.get('--revision') ?? 'r1'
assert.ok(typeof run === 'string' && path.isAbsolute(run) && path.normalize(run) === run)
assert.ok(phase === 'prepare' || phase === 'run')
assert.match(revision, /^r[1-9][0-9]*$/)
assert.equal(process.platform, 'linux')
assert.equal(process.arch, 'x64')

function childOf(parent, candidate) {
  const relative = path.relative(parent, candidate)
  assert.ok(
    relative &&
      !relative.startsWith('..' + path.sep) &&
      relative !== '..' &&
      !path.isAbsolute(relative),
  )
}

async function directory(filename) {
  const info = await fs.lstat(filename)
  assert.ok(info.isDirectory() && !info.isSymbolicLink(), filename)
  assert.equal(await fs.realpath(filename), filename)
}

async function absent(filename) {
  await assert.rejects(fs.lstat(filename), { code: 'ENOENT' })
}

async function json(filename) {
  const handle = await fs.open(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    assert.ok((await handle.stat()).isFile(), filename)
    return JSON.parse(await handle.readFile('utf8'))
  } finally {
    await handle.close()
  }
}

async function writeJson(filename, value) {
  const handle = await fs.open(filename, 'wx', 0o600)
  try {
    await handle.writeFile(JSON.stringify(value, null, 2) + '\n')
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function witness(filename) {
  const handle = await fs.open(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const before = await handle.stat({ bigint: true })
    assert.ok(
      before.isFile() && before.size > 0n && before.size <= BigInt(Number.MAX_SAFE_INTEGER),
      filename,
    )
    const sha256 = createHash('sha256')
    const sha512 = createHash('sha512')
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      sha256.update(chunk)
      sha512.update(chunk)
    }
    const after = await handle.stat({ bigint: true })
    const named = await fs.lstat(filename, { bigint: true })
    for (const key of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs']) {
      assert.equal(after[key], before[key], filename)
    }
    assert.ok(named.isFile() && !named.isSymbolicLink())
    assert.equal(named.dev, before.dev)
    assert.equal(named.ino, before.ino)
    return {
      sha256: sha256.digest('hex'),
      sha512: sha512.digest('base64'),
      sizeBytes: Number(before.size),
    }
  } finally {
    await handle.close()
  }
}

const digest = async (filename) => (await witness(filename)).sha256
const descriptor = (observed) => ({ sha512: observed.sha512, sizeBytes: observed.sizeBytes })
const head = () =>
  execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim()

await directory(repo)
await directory(run)
childOf(path.join(artifactRoot, 'runs'), run)
const lifecycle = await json(path.join(run, 'artifact-lifecycle.json'))
assert.equal(lifecycle.owner.repository, repo)
assert.equal(lifecycle.evidence, run)
assert.equal(lifecycle.state, 'running')
assert.equal(lifecycle.revision, head())
await directory(path.join(run, 'payloads'))
const root = path.join(run, 'payloads', 'subject')
const preparationPath = path.join(run, `preparation-${revision}.json`)
const packageManifestPath = path.join(run, `package-manifest-${revision}.json`)
const fixturePath = path.join(run, 'historical-fixture.json')
const nativeResultPath = path.join(run, `native-result-${revision}.json`)

async function verifyPackage(packageManifest) {
  assert.equal(packageManifest.revision, revision)
  assert.equal(packageManifest.publicShipping, false)
  assert.equal(Object.keys(packageManifest.source).length, 42)
  for (const [filename, expected] of Object.entries(packageManifest.source)) {
    childOf(repo, path.resolve(repo, filename))
    assert.equal(await digest(path.join(repo, filename)), expected, filename)
  }
  for (const [filename, expected] of Object.entries(packageManifest.toolSource)) {
    assert.equal(await digest(path.join(repo, filename)), expected, filename)
  }
  for (const [filename, expected] of Object.entries(packageManifest.originals)) {
    assert.equal(await digest(filename), expected, `Original executable changed: ${filename}`)
  }
  const packaged = packageManifest.package
  childOf(path.join(run, 'payloads'), packaged.path)
  assert.deepEqual(await witness(packaged.path), {
    sha256: packaged.sha256,
    sha512: packaged.sha512,
    sizeBytes: packaged.sizeBytes,
  })
  childOf(path.join(run, 'payloads'), packaged.embedded.asarPath)
  const archive = await witness(packaged.embedded.asarPath)
  assert.equal(archive.sha256, packaged.embedded.asarSha256)
  assert.equal(archive.sizeBytes, packaged.embedded.asarSizeBytes)
  assert.deepEqual(descriptor(archive), packaged.runtimeFiles.archive)
  const executablePath = path.join(
    path.dirname(path.dirname(packaged.embedded.asarPath)),
    'imagegen-studio',
  )
  assert.deepEqual(descriptor(await witness(executablePath)), packaged.runtimeFiles.executable)
}

if (phase === 'prepare') {
  await absent(root)
  await absent(fixturePath)
  await absent(preparationPath)
  await absent(packageManifestPath)
  const packageRoot = path.join(run, 'payloads', `package-${revision}`)
  // Exclusive mkdir is the fresh-attempt guard. A partial prior attempt remains inspectable.
  await fs.mkdir(packageRoot, { mode: 0o700 })
  const builderCache = process.env.ELECTRON_BUILDER_CACHE
  assert.equal(builderCache, path.join(run, 'payloads', 'builder-cache'))
  await directory(builderCache)
  const toolPaths = [
    'scripts/qualify-application-state-upgrade.mjs',
    'scripts/fixtures/application-state-upgrade-fixture.mjs',
    'scripts/fixtures/application-state-upgrade-native.mjs',
    'scripts/fixtures/application-state-upgrade-bootstrap.cjs',
    'electron-builder.config.cjs',
    'scripts/build-electron.mjs',
    'package.json',
    'pnpm-lock.yaml',
  ]
  const toolSource = Object.fromEntries(
    await Promise.all(
      toolPaths.map(async (filename) => [filename, await digest(path.join(repo, filename))]),
    ),
  )
  const source = {}
  async function visit(filename) {
    await directory(filename)
    for (const entry of (await fs.readdir(filename, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const child = path.join(filename, entry.name)
      if (entry.isDirectory()) await visit(child)
      else {
        assert.ok(entry.isFile() && !entry.isSymbolicLink(), child)
        if (!child.endsWith('.map')) source[path.relative(repo, child)] = await digest(child)
      }
    }
  }
  for (const item of ['dist/main', 'dist/preload', 'dist/renderer'])
    await visit(path.join(repo, item))
  assert.equal(Object.keys(source).length, 42, 'Pin the complete current desktop dist inventory.')
  for (const item of ['dist/main/main.cjs', 'dist/preload/preload.cjs', 'dist/renderer/index.html'])
    assert.ok(source[item])

  const { build: packageApp, createTargets, Platform } = require('electron-builder')
  const builderRequire = createRequire(require.resolve('electron-builder/package.json'))
  const asarRequire = createRequire(builderRequire.resolve('app-builder-lib/package.json'))
  const { extractFile } = asarRequire('@electron/asar')
  const config = require(path.join(repo, 'electron-builder.config.cjs'))
  const electronVersion = require('electron/package.json').version
  const builderVersion = require('electron-builder/package.json').version
  assert.equal(electronVersion, '44.4.5')
  assert.equal(builderVersion, '26.17.0')
  assert.equal(config.appId, 'studio.imagegen.desktop')
  assert.equal(config.publish, null)
  assert.deepEqual(config.electronFuses, {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
  })
  const localElectron = await fs.realpath(
    path.join(path.dirname(require.resolve('electron/package.json')), 'dist'),
  )
  const sqliteRoot = await fs.realpath(path.dirname(require.resolve('better-sqlite3/package.json')))
  const sqliteBinary = path.join(sqliteRoot, 'prebuilds/linux-x64.node')
  const originals = Object.fromEntries(
    await Promise.all(
      [process.execPath, path.join(localElectron, 'electron'), sqliteBinary].map(
        async (filename) => [filename, await digest(filename)],
      ),
    ),
  )
  const { prepareHistoricalState } =
    await import('./fixtures/application-state-upgrade-fixture.mjs')
  const fixture = await prepareHistoricalState({ repo, run, root })
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.historicalRevision, historicalRevision)
  assert.equal(fixture.root, root)
  assert.equal(fixture.appData, path.join(root, 'data', 'imagegen-studio'))
  assert.deepEqual(await json(fixturePath), fixture)

  const bootstrapName = 'application-state-upgrade-bootstrap.cjs'
  const bootstrapDirectory = path.join(repo, 'scripts', 'fixtures')
  const bootstrapSha256 = toolSource[`scripts/fixtures/${bootstrapName}`]
  const version = require(path.join(repo, 'package.json')).version
  let embedded = null
  let packagedAppDir = null
  const verifyArchive = (archive) => {
    const metadata = JSON.parse(extractFile(archive, 'package.json').toString())
    assert.equal(metadata.version, version)
    assert.equal(metadata.main, bootstrapName)
    assert.equal(
      createHash('sha256').update(extractFile(archive, bootstrapName)).digest('hex'),
      bootstrapSha256,
    )
    for (const [filename, expected] of Object.entries(source)) {
      assert.equal(
        createHash('sha256').update(extractFile(archive, filename)).digest('hex'),
        expected,
        filename,
      )
    }
  }
  const generated = await packageApp({
    projectDir: repo,
    targets: createTargets([Platform.LINUX], 'AppImage', 'x64'),
    publish: 'never',
    config: {
      ...config,
      electronVersion,
      electronDist: localElectron,
      directories: { output: path.join(packageRoot, 'output') },
      files: [...config.files, { from: bootstrapDirectory, to: '.', filter: [bootstrapName] }],
      extraMetadata: { version, main: bootstrapName },
      npmRebuild: false,
      linux: { ...config.linux, artifactName: 'state-upgrade-${version}-${arch}.${ext}' },
      afterPack: async (context) => {
        packagedAppDir = context.appOutDir
        childOf(packageRoot, packagedAppDir)
        const resources = path.join(packagedAppDir, 'resources')
        const asarPath = path.join(resources, 'app.asar')
        verifyArchive(asarPath)
        const archive = await witness(asarPath)
        const nativeSqlite = path.join(
          resources,
          'app.asar.unpacked/node_modules/better-sqlite3/prebuilds/linux-x64.node',
        )
        assert.equal(await digest(nativeSqlite), originals[sqliteBinary])
        await absent(path.join(resources, 'app-update.yml'))
        await absent(path.join(resources, 'app-update-trust.json'))
        embedded = {
          asarPath,
          asarSha256: archive.sha256,
          asarSizeBytes: archive.sizeBytes,
          productionSourceEntriesVerified: Object.keys(source).length,
          bootstrapSha256,
          nativeSqliteSha256: await digest(nativeSqlite),
        }
      },
    },
  })
  const images = generated.filter((filename) => filename.endsWith('.AppImage'))
  assert.equal(images.length, 1)
  assert.ok(embedded && packagedAppDir)
  const image = await fs.realpath(images[0])
  childOf(packageRoot, image)
  // Builder flips executable fuses after afterPack; observe the final app directory afterward.
  verifyArchive(embedded.asarPath)
  assert.equal(await digest(embedded.asarPath), embedded.asarSha256)
  const executable = await witness(path.join(packagedAppDir, 'imagegen-studio'))
  const archive = await witness(embedded.asarPath)
  const packageManifest = {
    schemaVersion: 1,
    revision,
    version,
    package: {
      version,
      path: image,
      ...(await witness(image)),
      embedded,
      runtimeFiles: { archive: descriptor(archive), executable: descriptor(executable) },
      runtimeTupleObservationPhase: 'after-packageApp-resolved',
      containerReadbackPerformed: false,
    },
    source,
    toolSource,
    bootstrapSha256,
    originals,
    electronVersion,
    builderVersion,
    nodeVersion: process.versions.node,
    fuses: config.electronFuses,
    donor: {
      invoke: '4875d96531ca6712b288f6e660fcbb34143408c1',
      launcher: 'c267bdb439519216b277a7a8c6ad408b9d79efce',
      paths: [
        'invokeai/app/services/shared/database/startup.py',
        'invokeai/app/services/shared/sqlite_migrator/sqlite_migrator_impl.py',
        'invokeai/app/services/shared/database/database.py',
        'invokeai/app/api/dependencies.py',
        'electron-builder.config.ts',
        'package.json:package',
      ],
    },
    applicationUpdateFeedConfigured: false,
    publicTrustBundled: false,
    signingPerformed: false,
    publicShipping: false,
    scope:
      'Exact historical29 owner producer with explicitly captured source-compatible host dependencies, not a recreated historical lockfile environment; one current desktop package and two current lifetimes. No historical GUI, automatic AppImage readback, publisher, Python/ML, recovery retirement or shipping acceptance.',
  }
  await verifyPackage(packageManifest)
  assert.equal(head(), lifecycle.revision)
  await writeJson(packageManifestPath, packageManifest)
  await writeJson(preparationPath, {
    schemaVersion: 1,
    revision,
    root,
    fixture,
    fixtureReportSha256: await digest(fixturePath),
    packageManifestPath,
    packageManifestSha256: await digest(packageManifestPath),
    packageManifest,
  })
  console.log(
    JSON.stringify({
      outcome: 'PREPARED',
      revision,
      preparationPath,
      packageManifestPath,
      historicalRevision,
      currentVersion: version,
      productionEntries: 42,
    }),
  )
} else {
  await absent(nativeResultPath)
  const preparationSha256 = await digest(preparationPath)
  const prepared = await json(preparationPath)
  assert.equal(prepared.schemaVersion, 1)
  assert.equal(prepared.revision, revision)
  assert.equal(prepared.root, root)
  assert.equal(prepared.fixture.root, root)
  assert.equal(prepared.fixture.historicalRevision, historicalRevision)
  assert.equal(prepared.packageManifestPath, packageManifestPath)
  assert.equal(await digest(fixturePath), prepared.fixtureReportSha256)
  assert.equal(await digest(packageManifestPath), prepared.packageManifestSha256)
  assert.deepEqual(await json(fixturePath), prepared.fixture)
  assert.deepEqual(await json(packageManifestPath), prepared.packageManifest)
  await verifyPackage(prepared.packageManifest)
  assert.equal(await digest(preparationPath), preparationSha256)
  const { runStateUpgrade } = await import('./fixtures/application-state-upgrade-native.mjs')
  const result = await runStateUpgrade({
    repo,
    run,
    root,
    fixture: prepared.fixture,
    packageManifest: prepared.packageManifest,
  })
  await verifyPackage(prepared.packageManifest)
  assert.equal(await digest(preparationPath), preparationSha256)
  assert.equal(await digest(fixturePath), prepared.fixtureReportSha256)
  const actual = await json(nativeResultPath)
  assert.equal(actual.outcome, 'PASS')
  if (result !== undefined) assert.deepEqual(result, actual)
  console.log(
    JSON.stringify({
      outcome: actual.outcome,
      revision,
      report: nativeResultPath,
      scope:
        'Copied-state native qualification; see the driver create-only result and physical-exit receipts.',
    }),
  )
}
