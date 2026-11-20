import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, lstat, open, readFile, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import { snapshotDatabase } from './application-state-upgrade-fixture.mjs'
import { inspectLegacyAccepted, inspectLegacyQueue } from './packaged-legacy-noobai-ui.mjs'

const canceled = '73e01879-21e0-4b5b-92b7-7371ea61e606'
const completed = '9003959b-3a00-44c0-a68a-9c5481cd079c'
const sourceProject = 'workspaces/Uncategorized/project-9b7f7ebb-e694-4e9f-93b5-e7b8f2411e12.igs'
const targetHash = 'ce15ad2c5a86b4021eeb1f93ea296d88ad34000281491c3a7da431c683b9d015'
const frozenHash = '1c0374cc186d9c92dfa34142a61c65babe6321817852636d3dbecdd8e9ac8bca'
const pins = {
  canceled,
  completed,
  documentId: 'af82bf2d-4033-4e2f-8090-2b4c787ab210',
  documentRevision: '86102003-346b-41c8-80b3-905db285d2bd',
  layerId: '4072db6d-55b0-4fbb-ae17-fb10bc935ae6',
  assetSha256: '0c3540a3117e344829720d2d61c4c6f4c9679b294eb072190af72beae931189d',
  fileSha256: 'edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d',
}
const databaseName = 'database/app.sqlite'
const pinnedFiles = [
  [databaseName, 13123584, '1f3f6e605985b0af67890b58839af28824e5576ad1ee69c38e4bb7d089df7634'],
  [sourceProject, 389775, '0011ae724f9347962371e069cb4fd3e4eeef376fcbbb211ca3d7fbabc0501746'],
  [
    `generation-inputs/${canceled}/manifest.json`,
    291,
    '81828bdbc9f0de8e8affe4a83b56aa802ba12b65ef84b8ec2122100539f8bf36',
  ],
  [`generation-inputs/${canceled}/target.png`, 106723, targetHash],
  [
    `generation-inputs/${completed}/manifest.json`,
    291,
    '1477e5acdc42eba49012437e3a932c0abaab9c1c618a761165c94192521dcb9c',
  ],
  [`generation-inputs/${completed}/target.png`, 106723, targetHash],
]
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

export async function readLegacyNoobaiProfile({
  filename,
  root,
  artifactRoot,
  appImage,
  identity,
}) {
  const run = path.dirname(root)
  assert.ok(run.startsWith(path.join(artifactRoot, 'runs/packaged-legacy-noobai') + path.sep))
  assert.equal(filename, path.join(run, 'legacy-noobai.json'))
  assert.equal(await realpath(filename), filename)
  const descriptor = await lstat(filename)
  assert.ok(descriptor.isFile() && descriptor.uid === process.getuid() && descriptor.size <= 4096)
  const { appData, packageIdentity } = JSON.parse(await readFile(filename, 'utf8'))
  assert.equal(
    appData,
    path.join(artifactRoot, 'shared/illustrious-vpred-worker-012-20261007/data/imagegen-studio'),
  )
  const state = await lstat(path.join(run, 'state'), { bigint: true })
  const mounted = await lstat(appData, { bigint: true })
  assert.ok(state.isDirectory() && state.uid === BigInt(process.getuid()))
  assert.equal(state.mode & 0o777n, 0o700n)
  assert.equal(mounted.dev, state.dev)
  assert.equal(mounted.ino, state.ino)
  assert.deepEqual(await identity(appImage), packageIdentity)
  const inputs = []
  for (const [relative, size, hash] of pinnedFiles) {
    const file = path.join(appData, relative)
    assert.equal(await realpath(file), file)
    const entry = await lstat(file)
    assert.ok(entry.isFile() && entry.nlink === 1 && entry.size === size)
    const observed = await identity(file)
    assert.equal(observed.sha256, hash)
    inputs.push(observed)
  }
  const database = path.join(appData, databaseName)
  const baseline = snapshotDatabase(database, { closed: true })
  const projectFile = path.join(appData, sourceProject)
  const project = baseline.tables.project_index.rows.find(
    (row) => row.canonical_path === projectFile,
  )
  assert.equal(project.document_id, pins.documentId)
  assert.equal(project.document_revision, pins.documentRevision)
  for (const [id, status, sequence] of [
    [canceled, 'canceled', 4],
    [completed, 'completed', 2],
  ]) {
    const row = baseline.tables.generation_queue_item.rows.find((candidate) => candidate.id === id)
    assert.equal(row.status, status)
    assert.equal(row.status_sequence, sequence)
    assert.equal(row.canonical_project_path, projectFile)
    assert.equal(sha256(row.frozen_payload_json), frozenHash)
    const { context, workerJob } = JSON.parse(row.frozen_payload_json)
    assert.ok(!Object.hasOwn(context.sampling, 'noiseProfile'))
    assert.ok(!Object.hasOwn(workerJob.sampling, 'noiseProfile'))
  }
  assert.equal(baseline.schemaMigrations.length, 17)
  assert.equal(baseline.integrityCheck, 'ok')
  assert.deepEqual(baseline.foreignKeyCheck, [])
  assert.equal(baseline.tables.project_index.rows.length, 461)
  assert.deepEqual(await readdir(path.dirname(projectFile)), [path.basename(projectFile)])
  assert.deepEqual((await readdir(path.join(appData, 'generation-inputs'))).sort(), [
    canceled,
    completed,
  ])
  const queueOrder = baseline.tables.generation_queue_item.rows
    .map(({ id, created_at }) => [created_at, id])
    .sort(([leftTime, leftId], [rightTime, rightId]) =>
      (rightTime === leftTime ? rightId > leftId : rightTime > leftTime) ? 1 : -1,
    )
    .map(([, id]) => id)
  return {
    appData,
    database,
    baseline,
    inputs,
    pins: { ...pins, projectKey: project.local_project_key, queueOrder },
  }
}

function assertHistory(baseline, current, projectKey, migrations) {
  assert.equal(current.integrityCheck, 'ok')
  assert.deepEqual(current.foreignKeyCheck, [])
  assert.ok(isDeepStrictEqual(current.schemaMigrations.slice(0, 17), baseline.schemaMigrations))
  assert.deepEqual(
    current.schemaMigrations.map(({ name, sha256: hash }) => [name, hash]),
    migrations,
  )
  for (const [table, count] of [
    ['generation_queue_item', 1329],
    ['generation_candidate_receipt', 1228],
    ['project_accepted_result_index', 1139],
  ]) {
    assert.equal(current.tables[table].rows.length, count)
    assert.ok(
      isDeepStrictEqual(current.tables[table].rows, baseline.tables[table].rows),
      `${table} changed`,
    )
  }
  const previous = baseline.tables.project_index.rows
  const next = current.tables.project_index.rows
  assert.equal(next.length, previous.length)
  const scanned = new Set([
    'diagnostic_code',
    'file_health',
    'file_fingerprint',
    'file_mtime_ns',
    'file_size_bytes',
    'indexed_at',
    'last_opened_at',
    'preview_thumbnail_sha256',
  ])
  for (const [index, row] of next.entries()) {
    for (const key of Object.keys(row).filter((key) => !scanned.has(key))) {
      assert.ok(row[key] === previous[index][key], `Project index field ${key} changed`)
    }
    if (row.local_project_key === projectKey) {
      assert.equal(row.file_health, 'ready')
      assert.equal(row.diagnostic_code, null)
    } else {
      assert.equal(row.file_health, 'missing')
      assert.equal(row.diagnostic_code, 'FILE_MISSING')
      assert.equal(row.file_fingerprint, null)
    }
  }
}

async function checkLegacyRetry(page, appData) {
  const retry = () =>
    page.evaluate((review) => globalThis.api.projects.retryGenerationJob(review), {
      id: canceled,
      statusSequence: 4,
    })
  const control = await retry()
  assert.equal(control.ok, false)
  assert.equal(control.error.code, 'GENERATION_RUNTIME_UNAVAILABLE')
  const file = path.join(appData, 'generation-inputs', canceled, 'target.png')
  const handle = await open(file, constants.O_RDWR | constants.O_NOFOLLOW)
  try {
    const first = Buffer.alloc(1)
    assert.equal((await handle.read(first, 0, 1, 0)).bytesRead, 1)
    assert.equal(first[0], 137, 'The owned target starts with the PNG signature.')
    let rejected
    try {
      assert.equal((await handle.write(Buffer.from([0]), 0, 1, 0)).bytesWritten, 1)
      await handle.sync()
      rejected = await retry()
      assert.equal(rejected.ok, false)
      assert.equal(rejected.error.code, 'QUEUE_INPUT_INVALID')
      assert.equal(
        rejected.error.message,
        'Generation storage could not be verified. Reopen the Project and try again.',
      )
    } finally {
      assert.equal((await handle.write(first, 0, 1, 0)).bytesWritten, 1)
      await handle.sync()
    }
    assert.equal(sha256(await readFile(file)), targetHash)
    const restored = await retry()
    assert.deepEqual(restored, control)
    return {
      control: control.error.code,
      mutation: rejected.error.code,
      mutationMessage: rejected.error.message,
      restored: restored.error.code,
    }
  } finally {
    await handle.close()
  }
}

async function backupPaths(database) {
  const directory = path.dirname(database)
  const names = (await readdir(directory)).filter((name) => name.startsWith('app_backup_'))
  assert.ok(names.every((name) => /^app_backup_\d{8}-\d{6}(?:-\d+)?\.db$/.test(name)))
  return names.map((name) => path.join(directory, name))
}

export async function runLegacyNoobaiProfile({
  profile,
  launch,
  closeNormally,
  retainOwnStore,
  root,
  repo,
  identity,
}) {
  const { baseline, database, appData, inputs, pins: selection } = profile
  const directory = path.join(repo, 'src/main/db/migrations')
  const migrations = []
  for (const name of (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort()) {
    migrations.push([name, (await identity(path.join(directory, name))).sha256])
  }
  assert.equal(migrations.length, 30)
  const first = await launch('first')
  const verify = async (state) => {
    const status = await state.page.evaluate(() => globalThis.api.runtime.getStatus())
    assert.ok(status.ok)
    assert.equal(status.value.kind, 'not-installed')
    const queue = await inspectLegacyQueue(state.page, selection)
    const accepted = await inspectLegacyAccepted(state.page, selection)
    assertHistory(baseline, snapshotDatabase(database), selection.projectKey, migrations)
    return { queue, accepted }
  }
  const backups = await backupPaths(database)
  assert.equal(backups.length, 1)
  const [backup] = backups
  assert.equal((await lstat(backup)).mode & 0o777, 0o600)
  assert.ok(
    isDeepStrictEqual(snapshotDatabase(backup, { closed: true }), baseline),
    'DB17 backup changed',
  )
  const backupIdentity = await identity(backup)
  const retainedBackup = path.join(root, 'startup-backup-17.sqlite')
  await copyFile(backup, retainedBackup, constants.COPYFILE_EXCL)
  assert.equal((await identity(retainedBackup)).sha256, backupIdentity.sha256)
  const firstRead = await verify(first)
  const retry = await checkLegacyRetry(first.page, appData)
  await closeNormally(first)
  const saved = await retainOwnStore('after-first-close')
  assertHistory(
    baseline,
    snapshotDatabase(database, { closed: true }),
    selection.projectKey,
    migrations,
  )
  assert.deepEqual(saved.project, inputs[1])
  const second = await launch('restarted')
  const secondRead = await verify(second)
  await closeNormally(second)
  const restarted = await retainOwnStore('after-restarted-close')
  assertHistory(
    baseline,
    snapshotDatabase(database, { closed: true }),
    selection.projectKey,
    migrations,
  )
  assert.deepEqual(restarted.project, saved.project)
  assert.deepEqual(await backupPaths(database), backups)
  assert.deepEqual(await identity(backup), backupIdentity)
  for (const input of inputs.slice(1)) assert.deepEqual(await identity(input.path), input)
  return {
    saved,
    restarted,
    legacyNoobai: { migrations: [17, 30], backup: backupIdentity, firstRead, secondRead, retry },
  }
}
