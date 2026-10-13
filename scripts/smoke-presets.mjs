/** Built Electron preset storage/IPC qualification. No Preset UI, Apply, worker or ML claim. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { _electron as electron, expect } from '@playwright/test'
import { sql } from 'kysely'

import { openAppDatabase } from '../src/main/db/database.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
} from './qualification-resource-limits.mjs'

assert.equal(process.argv.length, 4, 'Use --report-file ABSOLUTE_NEW_OWNED_REPORT')
assert.equal(process.argv[2], '--report-file')
const reportFile = process.argv[3]
assert.ok(path.isAbsolute(reportFile) && path.resolve(reportFile) === reportFile)
assert.equal(existsSync(reportFile), false, 'Report destination must be new')
const evidenceRoot = path.dirname(reportFile)
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const relativeEvidence = path.relative(artifactRoot, evidenceRoot)
assert.ok(
  relativeEvidence && !relativeEvidence.startsWith('..') && !path.isAbsolute(relativeEvidence),
)
assert.equal(realpathSync(evidenceRoot), evidenceRoot)
assert.ok(lstatSync(evidenceRoot).isDirectory() && !lstatSync(evidenceRoot).isSymbolicLink())

const fixtureRoot = mkdtempSync(path.join(evidenceRoot, 'native-preset-payload-'))
const appDataRoot = path.join(fixtureRoot, 'data/imagegen-studio')
mkdirSync(appDataRoot, { recursive: true, mode: 0o700 })
const nativeExec = promisify(execFile)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hashFiles = (files) =>
  Object.fromEntries(files.map((file) => [file, digest(readFileSync(file))]))
const report = {
  outcome: 'running',
  fixtureRoot,
  payloads: [fixtureRoot],
  checks: [],
  pageErrors: [],
  resourceLimitChecks: [],
  nativeClosures: [],
  sourceSha256: hashFiles([
    'scripts/smoke-presets.mjs',
    'scripts/native-smoke-window.mjs',
    'scripts/qualification-resource-limits.mjs',
    'src/main/index.ts',
    'src/preload/index.ts',
    'src/shared/api.ts',
    'src/shared/presets/preset-schema.ts',
    'src/main/presets/preset-repository.ts',
    'src/main/presets/preset-service.ts',
    'src/main/presets/preset-ipc.ts',
    'src/main/db/migrations/0017_presets.sql',
  ]),
  bundleSha256: hashFiles([
    'dist/main/main.cjs',
    'dist/preload/preload.cjs',
    'dist/renderer/index.html',
    ...readdirSync('dist/renderer/assets')
      .filter((name) => /\.(?:js|css)$/.test(name))
      .map((name) => `dist/renderer/assets/${name}`),
  ]),
  boundary: {
    actual:
      'Built Electron renderer window.api.presets → production preload validation → Main handlers → real SQLite CRUD/soft-delete/restore, physical process restart and startup expiry purge. Real Project creation, .igs writer/loader and unchanged neighboring database rows remain intact.',
    fixtures:
      'Portable plain-text prompt definitions with deliberately missing exact checkpoint/embedding IDs; one app_metadata marker and an empty Project created through real IPC. One tombstone is aged to 31 days in the isolated SQLite database only after confirmed physical native exit. No model files, worker, inference or download.',
    limits:
      'Existing process/cgroup helper applies a 2 GiB native cap, zero swap and a finite 300-second deadline. The launching actor must already have bounded aggregate RAM and zero swap.',
    notQualified:
      'Preset UI/Apply/result-to-preset/import/export, hourly timer scheduling (separate owner tests), unavailable disk or arbitrary corruption, trained inference and release packaging are not exercised here. Rebuildable Home indexes can change across restart; all tables are compared within each operation, and durable neighboring tables are compared across restart.',
    cleanup:
      'Payload is retained under the owned run root for root-controlled cleanup after actual process exit; this script never deletes external data.',
  },
}
let application
let window
let nativeChecks = []
let database
let projectId
let packagePath
let packageBytes
let original
let duplicate
let freshDeleted
let expiredDeleted
let durableNeighbors

function writeReport() {
  writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
}
function check(name, evidence = {}) {
  report.checks.push({ name, ...evidence })
  writeReport()
  console.log(`PASS ${name}`)
}
writeReport()

async function limitCheck(label) {
  const value = await boundQualificationProcess(application.process().pid, {
    deadlineSeconds: 300,
    execute: (file, args, options) =>
      nativeExec(
        file,
        args.map((item) => (item === 'MemoryMax=12G' ? 'MemoryMax=2G' : item)),
        options,
      ),
  })
  nativeChecks.push(value)
  report.resourceLimitChecks.push({ ...value, label })
  writeReport()
}
async function launch(label) {
  const environment = {
    ...process.env,
    CUDA_VISIBLE_DEVICES: '',
    NODE_ENV: 'test',
    XDG_CONFIG_HOME: path.join(fixtureRoot, 'config'),
    XDG_DATA_HOME: path.join(fixtureRoot, 'data'),
  }
  delete environment.ELECTRON_RUN_AS_NODE
  delete environment.IMAGEGEN_DEV_SERVER_URL
  delete environment.IMAGEGEN_TEST_IMAGE_WORKER
  nativeChecks = []
  application = await electron.launch({
    args:
      process.env.IMAGEGEN_SMOKE_OZONE_PLATFORM === 'x11' ? ['--ozone-platform=x11', '.'] : ['.'],
    cwd: process.cwd(),
    env: environment,
    timeout: 30_000,
  })
  await limitCheck(`${label}-launch`)
  window = await isolateNativeSmokeWindow(application)
  window.setDefaultTimeout(10_000)
  window.on('pageerror', (error) => report.pageErrors.push(error.message))
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  await window.waitForFunction(() => typeof window.api?.presets?.list === 'function')
  assert.equal((await api('runtime', 'getStatus')).kind, 'not-installed')
  // Complete the real initial Home catalog read before capturing mutable derived index rows.
  await api('projects', 'list')
  database = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
}
async function closeNative(label) {
  if (!application) return
  if (database) {
    await database.close()
    database = null
  }
  await limitCheck(`${label}-before-close`)
  await application.close()
  const closure = await confirmQualificationProcessExit(nativeChecks)
  report.nativeClosures.push({ label, ...closure })
  application = null
  window = null
  writeReport()
}
async function rawApi(scope, method, ...args) {
  return await window.evaluate(({ scope, method, args }) => window.api[scope][method](...args), {
    scope,
    method,
    args,
  })
}
async function api(scope, method, ...args) {
  const result = await rawApi(scope, method, ...args)
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}
async function rows(includePresets = false, durable = false) {
  const tables = (
    await sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`.execute(
      database.db,
    )
  ).rows
  const result = {}
  for (const { name } of tables) {
    if (
      (!includePresets && name === 'presets') ||
      (durable && ['project_index', 'project_accepted_result_index'].includes(name))
    )
      continue
    const entries = await database.db.selectFrom(name).selectAll().execute()
    result[name] = entries.sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    )
  }
  return result
}
async function neighboringState() {
  return { database: await rows(), project: (await api('projects', 'open', projectId)).tab }
}
async function unchangedNeighbors(before) {
  assert.deepEqual(await neighboringState(), before)
  assert.equal(
    readFileSync(packagePath).equals(packageBytes),
    true,
    'Preset storage changed .igs bytes',
  )
}
async function operation(run) {
  const before = await neighboringState()
  const value = await run()
  await unchangedNeighbors(before)
  return value
}
function definition(record) {
  const { description, favorite, name, payload, tags, workflow } = record
  return { description, favorite, name, payload, tags, workflow }
}
function missingRef(kind, letter) {
  return {
    baseModelFamily: 'illustrious',
    civitaiFileId: null,
    civitaiModelId: null,
    civitaiVersionId: null,
    displayName: `Unavailable ${kind}`,
    fileSha256: letter.repeat(64),
    kind,
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: kind === 'checkpoint' ? 'epsilon' : null,
    versionName: 'Exact absent version',
  }
}
const portable = {
  description: 'Plain text remains literal; resource references are descriptive snapshots.',
  favorite: false,
  name: '  Portable preset  ',
  payload: {
    prompt: {
      text: '(soft light:1.2), <missing-vector>\n{red|blue}, literal 日本語',
      embeddingRefs: [{ token: '<missing-vector>', resource: missingRef('embedding', 'b') }],
    },
    negativePrompt: { text: 'low quality, (bad hands:0.8)', embeddingRefs: [] },
    model: missingRef('checkpoint', 'a'),
    loras: [],
    seed: { policy: 'fixed', value: 0 },
    vae: null,
    vaePrecision: 'FP32',
    cfgRescale: 0,
    denoisingStrength: 0.7,
  },
  tags: ['native', 'portable'],
  workflow: 'textToImage',
}

try {
  const prepared = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  try {
    await prepared.db
      .insertInto('app_metadata')
      .values({ key: 'preset-neighbor', value: 'Preserved independently of preset storage' })
      .execute()
  } finally {
    await prepared.close()
  }
  await launch('crud')
  const project = await api('projects', 'create', {
    title: 'Preset storage neighbor',
    width: 640,
    height: 512,
  })
  projectId = project.id
  assert.equal(project.dirty, false)
  const indexed = await database.db
    .selectFrom('project_index')
    .select('canonical_path')
    .where('local_project_key', '=', projectId)
    .executeTakeFirstOrThrow()
  packagePath = indexed.canonical_path
  const relativePackage = path.relative(fixtureRoot, packagePath)
  assert.ok(
    relativePackage && !relativePackage.startsWith('..') && !path.isAbsolute(relativePackage),
  )
  packageBytes = readFileSync(packagePath)
  assert.equal((await readIgsPackage(packagePath)).project.documentId, project.documentId)
  assert.deepEqual(await api('models', 'getCatalog'), [])
  assert.deepEqual(await api('presets', 'list'), [])
  const created = await operation(() => api('presets', 'create', portable))
  const expectedCreated = structuredClone(portable)
  expectedCreated.name = 'Portable preset'
  delete expectedCreated.payload.denoisingStrength
  assert.deepEqual(definition(created), expectedCreated)
  assert.equal(created.deletedAt, null)
  assert.equal(created.expiresAt, null)
  assert.deepEqual(await operation(() => api('presets', 'get', created.id)), created)
  check(
    'Native create/get preserves literal prompts, missing exact refs, fixed seed 0, explicit Embedded VAE and empty LoRAs',
    {
      presetId: created.id,
      projectId,
      packageSha256: digest(packageBytes),
    },
  )

  const updatedDefinition = {
    ...expectedCreated,
    name: 'Updated portable preset',
    favorite: true,
    workflow: 'imageToImage',
    payload: { ...expectedCreated.payload, denoisingStrength: 0.35 },
  }
  original = await operation(() => api('presets', 'update', created.id, updatedDefinition))
  assert.deepEqual(definition(original), updatedDefinition)
  duplicate = await operation(() => api('presets', 'duplicate', original.id))
  assert.notEqual(duplicate.id, original.id)
  assert.deepEqual(definition(duplicate), { ...updatedDefinition, name: `${original.name} (copy)` })
  const editedCopy = {
    ...definition(duplicate),
    description: 'The copy can change independently',
    payload: { seed: { policy: 'random' } },
  }
  duplicate = await operation(() => api('presets', 'update', duplicate.id, editedCopy))
  assert.deepEqual(definition(duplicate), editedCopy)
  assert.deepEqual(await operation(() => api('presets', 'get', original.id)), original)
  assert.deepEqual(
    (await operation(() => api('presets', 'list'))).map((item) => item.id).sort(),
    [original.id, duplicate.id].sort(),
  )
  check(
    'Native update/duplicate/list replace only explicit definitions and keep the original independent',
  )

  const invalidCases = [
    ['create', [{ ...portable, unknown: true }]],
    ['create', [{ ...portable, payload: { ...portable.payload, regionalGuidance: [] } }]],
    [
      'create',
      [{ ...portable, payload: { prompt: { ...portable.payload.prompt, tokenMetadata: [] } } }],
    ],
    ['update', [original.id, { ...updatedDefinition, unknown: true }]],
    ['get', [original.id, { includeDeleted: true, unknown: true }]],
    ['list', [{ deleted: false, unknown: true }]],
    ['duplicate', [original.id, { name: 'Wrong type', unknown: true }]],
    ['restore', ['not-a-uuid']],
  ]
  for (const [method, args] of invalidCases) {
    const before = await rows(true)
    const rejected = await rawApi('presets', method, ...args)
    assert.equal(rejected.ok, false, JSON.stringify(rejected))
    assert.equal(rejected.error.code, 'PRESET_INPUT_INVALID')
    assert.deepEqual(await rows(true), before)
    assert.equal(readFileSync(packagePath).equals(packageBytes), true)
  }
  check(
    'Unknown definition/payload/prompt/option keys and malformed requests reject without any SQLite or .igs write',
    { rejectedCases: invalidCases.length },
  )

  duplicate = await operation(() => api('presets', 'softDelete', duplicate.id))
  assert.ok(duplicate.deletedAt)
  assert.equal(
    Date.parse(duplicate.expiresAt) - Date.parse(duplicate.deletedAt),
    30 * 24 * 60 * 60 * 1000,
  )
  assert.deepEqual(await operation(() => api('presets', 'softDelete', duplicate.id)), duplicate)
  assert.equal(await operation(() => api('presets', 'get', duplicate.id)), null)
  assert.deepEqual(
    await operation(() => api('presets', 'get', duplicate.id, { includeDeleted: true })),
    duplicate,
  )
  assert.deepEqual(await operation(() => api('presets', 'list', { deleted: true })), [duplicate])
  assert.deepEqual(await operation(() => api('presets', 'list')), [original])
  durableNeighbors = await rows(false, true)
  check(
    'Native soft-delete hides the copy, exposes its recovery record and repeated Delete preserves the 30-day deadline',
  )
  await closeNative('crud')

  await launch('restart')
  assert.deepEqual(await rows(false, true), durableNeighbors)
  const reopened = await api('projects', 'open', projectId)
  assert.equal(reopened.kind, 'opened')
  assert.equal(reopened.tab.dirty, false)
  assert.deepEqual(await operation(() => api('presets', 'get', original.id)), original)
  assert.deepEqual(
    await operation(() => api('presets', 'get', duplicate.id, { includeDeleted: true })),
    duplicate,
  )
  duplicate = await operation(() => api('presets', 'restore', duplicate.id))
  assert.equal(duplicate.deletedAt, null)
  assert.equal(duplicate.expiresAt, null)
  assert.deepEqual(definition(duplicate), editedCopy)
  check(
    'Physical Electron restart retains exact active/deleted payloads and real restore keeps neighboring Project/model/database state',
  )

  freshDeleted = await operation(() =>
    api('presets', 'create', { ...expectedCreated, name: 'Fresh tombstone control' }),
  )
  expiredDeleted = await operation(() =>
    api('presets', 'create', { ...expectedCreated, name: 'Expired tombstone subject' }),
  )
  freshDeleted = await operation(() => api('presets', 'softDelete', freshDeleted.id))
  expiredDeleted = await operation(() => api('presets', 'softDelete', expiredDeleted.id))
  durableNeighbors = await rows(false, true)
  await closeNative('restart')

  // The prior session's physical exit has been confirmed before this fixture changes SQLite.
  const agedDatabase = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  const agedDeletedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
  try {
    const changed = await agedDatabase.db
      .updateTable('presets')
      .set({ deleted_at: agedDeletedAt, updated_at: agedDeletedAt })
      .where('id', '=', expiredDeleted.id)
      .where('deleted_at', '=', expiredDeleted.deletedAt)
      .executeTakeFirstOrThrow()
    assert.equal(changed.numUpdatedRows, 1n)
    const old = await agedDatabase.db
      .selectFrom('presets')
      .selectAll()
      .where('id', '=', expiredDeleted.id)
      .executeTakeFirstOrThrow()
    assert.equal(old.deleted_at, agedDeletedAt)
    check('Physically closed fixture ages only the owned expired tombstone to 31 days', {
      expiredId: expiredDeleted.id,
      freshId: freshDeleted.id,
      agedDeletedAt,
    })
  } finally {
    await agedDatabase.close()
  }

  await launch('startup-purge')
  assert.deepEqual(await rows(false, true), durableNeighbors)
  const finalProject = await api('projects', 'open', projectId)
  assert.equal(finalProject.kind, 'opened')
  assert.equal(finalProject.tab.dirty, false)
  assert.equal(
    await operation(() => api('presets', 'get', expiredDeleted.id, { includeDeleted: true })),
    null,
  )
  assert.equal(
    await database.db
      .selectFrom('presets')
      .select('id')
      .where('id', '=', expiredDeleted.id)
      .executeTakeFirst(),
    undefined,
  )
  assert.deepEqual(
    await operation(() => api('presets', 'get', freshDeleted.id, { includeDeleted: true })),
    freshDeleted,
  )
  assert.deepEqual(await operation(() => api('presets', 'get', original.id)), original)
  const restoredFresh = await operation(() => api('presets', 'restore', freshDeleted.id))
  assert.equal(restoredFresh.deletedAt, null)
  assert.deepEqual(definition(restoredFresh), definition(freshDeleted))
  const missing = await rawApi('presets', 'restore', expiredDeleted.id)
  assert.equal(missing.ok, false)
  assert.equal(missing.error.code, 'PRESET_NOT_FOUND')
  assert.equal(readFileSync(packagePath).equals(packageBytes), true)
  check(
    'Real startup permanently purges the expired tombstone while the fresh tombstone remains restorable and active presets survive',
  )
  await closeNative('startup-purge')
  assert.equal(report.nativeClosures.length, 3)
  assert.deepEqual(report.pageErrors, [])
  report.outcome = 'passed'
} catch (error) {
  report.outcome = 'failed'
  report.failure = { message: error.message, stack: error.stack }
  throw error
} finally {
  if (application) {
    try {
      await closeNative('failure-cleanup')
    } catch (error) {
      report.cleanupFailure = { message: error.message, stack: error.stack }
      report.outcome = 'failed'
    }
  }
  writeReport()
  console.log(
    JSON.stringify({
      report: reportFile,
      outcome: report.outcome,
      checks: report.checks.length,
      fixtureRoot,
    }),
  )
}
