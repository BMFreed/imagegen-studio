/**
 * Lower real-owner controls for the finite historical29 -> current30 qualification. Invoke4875
 * sqlite_migrator_impl.run_migrations/_run_migration and database.startup validate history and
 * transact each migration. This calls Studio's actual startup owner, never reimplements its
 * migration loop. All subjects are disposable copies of the closed historical fixture; the native
 * subject and repository sources stay intact.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(path.join(repository, 'package.json'))
const Database = require('better-sqlite3')
const { build } = require('esbuild')
const hash = (body) => createHash('sha256').update(body).digest('hex')
const digest = async (file) => hash(await fs.readFile(file))
async function directory(file) {
  const entry = await fs.lstat(file)
  assert.ok(entry.isDirectory() && !entry.isSymbolicLink())
  assert.equal(entry.uid, process.getuid())
  assert.equal(await fs.realpath(file), file)
}
async function regular(file) {
  const entry = await fs.lstat(file)
  assert.ok(entry.isFile() && !entry.isSymbolicLink())
  assert.equal(entry.uid, process.getuid())
  assert.equal(await fs.realpath(file), file)
}
const quote = (name) => `"${name.replaceAll('"', '""')}"`
const value = (input) =>
  typeof input === 'bigint'
    ? { integer: String(input) }
    : Buffer.isBuffer(input)
      ? { blob: input.toString('base64') }
      : input

/** Closed fixture readback; schema and typed values, not volatile SQLite headers. */
export function snapshotUpgradeDatabase(file) {
  const database = new Database(file, { fileMustExist: true, readonly: true })
  try {
    return database.transaction(() => {
      assert.equal(database.pragma('integrity_check', { simple: true }), 'ok')
      const schema = database
        .prepare(
          "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
        )
        .all()
      const tables = Object.fromEntries(
        schema
          .filter((row) => row.type === 'table')
          .map(({ name }) => {
            const rows = database
              .prepare(`SELECT * FROM ${quote(name)}`)
              .safeIntegers()
              .all()
              .map((row) =>
                Object.fromEntries(Object.entries(row).map(([key, entry]) => [key, value(entry)])),
              )
              .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
            return [name, rows]
          }),
      )
      return { schema, tables }
    })()
  } finally {
    database.close()
  }
}

function assertPreserved(before, after) {
  for (const [name, rows] of Object.entries(before.tables)) {
    if (name !== 'schema_migrations') {
      assert.equal(
        JSON.stringify(after.tables[name]),
        JSON.stringify(rows),
        `Preserve historical table ${name}`,
      )
    }
  }
  for (const record of before.schema) {
    assert.deepEqual(
      after.schema.find((entry) => entry.type === record.type && entry.name === record.name),
      record,
    )
  }
  const migrations = after.tables.schema_migrations
  assert.equal(migrations.length, 30)
  for (const old of before.tables.schema_migrations) {
    assert.deepEqual(
      migrations.find((entry) => entry.name === old.name),
      old,
    )
  }
  assert.deepEqual(after.tables.model_reference_identity, [])
}

export async function runStateUpgradeControls({ repo = repository, run }) {
  assert.equal(repo, repository)
  const artifact = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
  assert.ok(
    path.isAbsolute(run) && run.startsWith(`${artifact}/runs/`) && path.resolve(run) === run,
  )
  assert.equal(await fs.realpath(run), run)
  const lifecycle = JSON.parse(await fs.readFile(path.join(run, 'artifact-lifecycle.json'), 'utf8'))
  assert.equal(lifecycle.state, 'running')
  assert.equal(lifecycle.owner.repository, repo)
  assert.equal(lifecycle.evidence, run)
  assert.ok(lifecycle.payloads.includes(path.join(run, 'payloads')))
  const subject = path.join(run, 'payloads/subject')
  const originalFile = path.join(subject, 'data/imagegen-studio/database/app.sqlite')
  for (const file of [
    path.join(run, 'payloads'),
    subject,
    path.join(subject, 'data'),
    path.join(subject, 'data/imagegen-studio'),
    path.dirname(originalFile),
  ]) {
    await directory(file)
  }
  await regular(originalFile)
  const originalHash = await digest(originalFile)
  const before = snapshotUpgradeDatabase(originalFile)
  assert.equal(before.tables.schema_migrations.length, 29)
  assert.equal(before.tables.model_reference_identity, undefined)
  const sentinel = before.tables.app_metadata.find(
    (row) => row.key === 'application-state-upgrade-sentinel',
  )
  assert.ok(sentinel && typeof sentinel.value === 'string')
  const owner = path.join(repo, 'src/main/db/database.ts')
  const ownerHash = await digest(owner)
  const root = path.join(run, 'payloads/controls')
  await fs.mkdir(root, { mode: 0o700 })
  const bundle = path.join(root, 'current-database.cjs')
  await build({
    stdin: {
      contents: `export { initializeAppDatabase } from ${JSON.stringify(owner)}`,
      resolveDir: repo,
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    outfile: bundle,
    plugins: [
      {
        name: 'pinned-native-sqlite',
        setup(builder) {
          builder.onResolve({ filter: /^better-sqlite3$/ }, () => ({
            path: require.resolve('better-sqlite3'),
            external: true,
          }))
        },
      },
    ],
  })
  const { initializeAppDatabase } = require(bundle)
  const migrations = path.join(repo, 'src/main/db/migrations')
  const names = (await fs.readdir(migrations))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
    .sort()
  assert.equal(names.length, 30)
  const finalName = '0030_model_reference_identity.sql'
  assert.equal(names.at(-1), finalName)
  const sourceSql = await fs.readFile(path.join(migrations, finalName), 'utf8')
  const sqlHashes = Object.fromEntries(
    await Promise.all(names.map(async (name) => [name, await digest(path.join(migrations, name))])),
  )
  const results = []

  async function one(name, suffix = '') {
    const directory = path.join(root, name)
    await fs.mkdir(path.join(directory, 'database'), { recursive: true, mode: 0o700 })
    await fs.chmod(directory, 0o700)
    const file = path.join(directory, 'database/app.sqlite')
    await fs.copyFile(originalFile, file, fs.constants.COPYFILE_EXCL)
    await fs.chmod(file, 0o600)
    assert.equal(await digest(file), originalHash)
    const sqlDirectory = path.join(directory, 'sql')
    await fs.mkdir(sqlDirectory, { mode: 0o700 })
    for (const filename of names) {
      await fs.copyFile(
        path.join(migrations, filename),
        path.join(sqlDirectory, filename),
        fs.constants.COPYFILE_EXCL,
      )
    }
    if (suffix) await fs.writeFile(path.join(sqlDirectory, finalName), sourceSql + suffix)
    return { directory, file, sqlDirectory }
  }

  for (const name of ['original', 'mutated', 'restored']) {
    const mutation =
      name === 'mutated'
        ? "\nUPDATE app_metadata SET value = 'lost by controlled migration mutation' WHERE key = 'application-state-upgrade-sentinel';\n"
        : ''
    const item = await one(name, mutation)
    const connection = await initializeAppDatabase(item.directory, item.sqlDirectory)
    await connection.close()
    const after = snapshotUpgradeDatabase(item.file)
    assert.equal(
      after.tables.schema_migrations.length,
      30,
      'Mutation reaches the real migration consumer',
    )
    assert.equal(
      JSON.stringify(after.tables.presets),
      JSON.stringify(before.tables.presets),
      'Neighbor preset control',
    )
    let semanticError = null
    try {
      assertPreserved(before, after)
    } catch (error) {
      assert.equal(error.code, 'ERR_ASSERTION')
      assert.match(error.message, /^Preserve historical table app_metadata(?:\n|$)/)
      semanticError = { code: error.code, message: 'Preserve historical table app_metadata' }
    }
    assert.equal(semanticError !== null, name === 'mutated')
    const mutatedRow = after.tables.app_metadata.find((row) => row.key === sentinel.key)
    assert.equal(
      mutatedRow.value,
      name === 'mutated' ? 'lost by controlled migration mutation' : sentinel.value,
    )
    const semanticSnapshot = structuredClone(after)
    for (const migration of semanticSnapshot.tables.schema_migrations) {
      if (migration.name === finalName) delete migration.applied_at
    }
    const result = {
      name,
      expected: name === 'mutated' ? 'semantic-RED' : 'GREEN',
      semanticError,
      actualMigrationCount: 30,
      neighboringPresetsPreserved: true,
      sqlSha256: await digest(path.join(item.sqlDirectory, finalName)),
      database: item.file,
      snapshotSha256: hash(JSON.stringify(after)),
      semanticSnapshotSha256: hash(JSON.stringify(semanticSnapshot)),
    }
    results.push(result)
    await fs.writeFile(
      path.join(run, `migration-${name}.json`),
      JSON.stringify({ ...result, snapshot: after }, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 },
    )
  }

  const failed = await one(
    'transaction-failure',
    '\nSELECT * FROM qualification_nonexistent_table;\n',
  )
  await assert.rejects(
    () => initializeAppDatabase(failed.directory, failed.sqlDirectory),
    /no such table: qualification_nonexistent_table/,
  )
  const failedAfter = snapshotUpgradeDatabase(failed.file)
  assert.deepEqual(
    failedAfter,
    before,
    'Failed DDL and migration record are rolled back with every old row intact',
  )
  const restore = results.find((entry) => entry.name === 'restored')
  assert.equal(results[0].sqlSha256, results[2].sqlSha256)
  assert.equal(results[0].semanticSnapshotSha256, results[2].semanticSnapshotSha256)
  assert.equal(restore.sqlSha256, sqlHashes[finalName])
  const fixture = JSON.parse(await fs.readFile(path.join(run, 'historical-fixture.json'), 'utf8'))
  assert.equal(fixture.historicalRevision, '6b812f93d2715af2c4f904e70093b3f9c5b09713')
  assert.equal(fixture.historicalDatabaseBundle, path.join(run, 'payloads/historical-owners.cjs'))
  assert.equal(fixture.historicalSource.root, path.join(run, 'payloads/historical-source'))
  await regular(fixture.historicalDatabaseBundle)
  for (const file of ['.', 'src', 'src/main', 'src/main/db', 'src/main/db/migrations']) {
    await directory(path.resolve(fixture.historicalSource.root, file))
  }
  const historical = require(fixture.historicalDatabaseBundle)
  const upgraded = snapshotUpgradeDatabase(restore.database)
  assert.throws(
    () =>
      historical.openAppDatabase(
        path.dirname(path.dirname(restore.database)),
        path.join(fixture.historicalSource.root, 'src/main/db/migrations'),
      ),
    /Missing installed database migration: 0030_model_reference_identity\.sql/,
  )
  assert.deepEqual(
    snapshotUpgradeDatabase(restore.database),
    upgraded,
    'Old owner refuses newer history without downgrading data',
  )
  assert.equal(await digest(originalFile), originalHash)
  assert.equal(await digest(owner), ownerHash)
  for (const [name, expected] of Object.entries(sqlHashes))
    assert.equal(await digest(path.join(migrations, name)), expected)
  const report = {
    outcome: 'PASS',
    actualOwner: { file: owner, sha256: ownerHash, bundle, bundleSha256: await digest(bundle) },
    originalFixtureFile: originalFile,
    originalFixtureSha256: originalHash,
    originalFixtureUnchanged: true,
    repositorySourceAndSqlUnchanged: true,
    sourceSqlSha256: sqlHashes,
    results,
    transactionFailure: {
      database: failed.file,
      historicalSchemaAndRowsPreserved: true,
      migrationCount: 29,
    },
    historicalOwnerRefusal: {
      migrationCount: 30,
      unknownAppliedMigrationRefused: true,
      schemaAndRowsPreserved: true,
    },
    limits: [
      'Real current database owner over copies of exact historical fixture. No packaged process, automatic backup, downgrade or production recovery is qualified by these controls.',
    ],
  }
  await fs.writeFile(
    path.join(run, 'migration-controls.json'),
    JSON.stringify(report, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  )
  return report
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 4)
  assert.equal(process.argv[2], '--artifacts')
  const report = await runStateUpgradeControls({ run: process.argv[3] })
  process.stdout.write(
    JSON.stringify({
      outcome: report.outcome,
      cases: report.results.map(({ name, expected }) => ({ name, expected })),
      transactionFailurePreserved: true,
    }) + '\n',
  )
}
