/**
 * Native, explicit orphan Smart Patch → Raster qualification. Run only after a fresh app:build:
 * pnpm exec tsx scripts/smoke-smart-patch-orphan-raster.mjs --report-file ABSOLUTE_NEW_REPORT
 *
 * Root owns the run/cleanup under runs/smart-patch-orphan-raster/20261022-explicit. Prerequisites:
 * graphical Linux; existing repository dependencies; root launcher MemoryMax<=2G, MemorySwapMax=0,
 * RuntimeMaxSec<=600, TimeoutStopSec<=90, KillMode=control-group. Each native actor is
 * independently bounded to <=2G/zero swap with a finite owned KDE timer.
 *
 * PRECONDITION ONLY: literal prepared inputs, exact-file resolver and literal ICC PNG bytes go
 * through real queue admission/claim/publication/receipts. This does NOT exercise inference or
 * actual CPU mask preparation. No runtime/model catalog/ML provisioning is installed. The tiny
 * declared resource is removed before native conversion. Save uses production's unavailable-
 * preview placeholder path; real layer assets, provenance, shadow, writer and loader stay real.
 *
 * SUBJECT: built renderer secondary menu/confirmation → actual preload/IPC/Main → durable Raster
 * Add, target-local cancellation/disposal, Undo/Redo, unsaved crash/shadow recovery, Save/reopen. A
 * passive Main IPC observer delegates to the original registered handlers without changing
 * requests/replies. Root must inspect screenshots; DOM assertions alone do not prove appearance.
 * Payloads are retained for root disposal only after all recorded physical exits are confirmed.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { inflateSync } from 'node:zlib'

import { _electron as electron, expect } from '@playwright/test'
import Database from 'better-sqlite3'

import { openAppDatabase } from '../src/main/db/database.ts'
import { GenerationQueueRepository } from '../src/main/projects/generation-queue.ts'
import { GenerationStagingRepository } from '../src/main/projects/generation-staging.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { withIllustriousTxt2ImgRequest } from '../src/main/projects/illustrious-txt2img-job.ts'
import { encodeProjectMaskPng } from '../src/main/projects/project-mask.ts'
import { ProjectSession } from '../src/main/projects/project-session.ts'
import { captureSmartPatchInputMaterial } from '../src/main/projects/smart-patch-frozen-input.ts'
import { SmartPatchGenerationStagingRepository } from '../src/main/projects/smart-patch-generation-staging.ts'
import {
  literalSmartPatchColorPng,
  literalSmartPatchNumericPng,
  literalSmartPatchPreparedInput,
} from '../src/main/projects/test-fixtures/smart-patch-input-material.ts'
import { ANIMA_BATCH_READY } from '../src/main/projects/test-fixtures/anima-batch.ts'
import { IGS_SRGB_ICC_SHA256 } from '../src/shared/projects/color-profile.ts'
import { defaultIllustriousNoiseProfile } from '../src/shared/projects/illustrious-noise-profile.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
  stopExpiredQualificationProcess,
} from './qualification-resource-limits.mjs'

assert.equal(process.argv.length, 4, 'Use --report-file ABSOLUTE_NEW_REPORT')
assert.equal(process.argv[2], '--report-file')
const reportFile = process.argv[3]
assert.ok(path.isAbsolute(reportFile) && path.resolve(reportFile) === reportFile)
assert.equal(existsSync(reportFile), false, 'Never overwrite earlier evidence')
const root = process.cwd()
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const runRoot = path.join(artifactRoot, 'runs/smart-patch-orphan-raster/20261022-explicit')
const evidenceParent = path.dirname(reportFile)
const withinRun = path.relative(runRoot, evidenceParent)
assert.ok(!withinRun.startsWith('..') && !path.isAbsolute(withinRun))
assert.equal(realpathSync(evidenceParent), evidenceParent)
assert.ok(lstatSync(evidenceParent).isDirectory() && !lstatSync(evidenceParent).isSymbolicLink())
const evidenceRoot = path.join(evidenceParent, `${path.basename(reportFile)}.artifacts`)
assert.equal(existsSync(evidenceRoot), false)
writeFileSync(reportFile, '{}\n', { flag: 'wx', mode: 0o600 })
mkdirSync(evidenceRoot, { mode: 0o700 })
const fixtureRoot = mkdtempSync(
  path.join(evidenceParent, `${path.basename(reportFile)}.orphan-raster-payload-`),
)
const lifecycleFile = path.join(evidenceRoot, 'artifact-lifecycle.json')
const appDataRoot = path.join(fixtureRoot, 'data/imagegen-studio')
const workspace = path.join(appDataRoot, 'workspaces/Uncategorized')
const scratch = path.join(appDataRoot, 'scratch')
const title = 'Explicit orphan Raster'
const packagePath = path.join(workspace, `${title}.igs`)
const modelPath = path.join(fixtureRoot, 'declared-exact-resource.safetensors')
const modelBytes = Buffer.from('Declared admission resource only. Not trained model weights.')
const nativeExec = promisify(execFile)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
// Non-eight-aligned world size is intentional: internal processing remains 64×64.
const frozenRect = { height: 127, width: 129, x: 160, y: 120 }
const neighborRect = { height: 128, width: 128, x: 352, y: 96 }
const lowerColor = [65, 74, 86, 255]
const resultColor = [40, 180, 90]
const alphaValues = [0, 64, 128, 192, 255]
const conversionChannel = 'projects:accept-smart-patch-raster'
const nativeChecks = []
const observed = new Map()
let application, window, nativeProcess, sampler
let database, fixtureQueue, smartStaging, normalStaging
let projectId, patchId, neighborPatchId, savedBaseline, initialTab, lower
let targetMaterial, models, targetSessionId, targetCandidates, smartNeighbor, normalNeighbor
let pendingSibling, freshRetrySibling, acceptedLayerId, acceptedProvenance, adoptedDocument
let sampling = Promise.resolve()
const report = {
  schemaVersion: 1,
  outcome: 'running',
  startedAt: new Date().toISOString(),
  fixtureRoot,
  payloads: [fixtureRoot],
  checks: [],
  screenshots: [],
  canvasPixels: [],
  pageErrors: [],
  ipcCalls: [],
  resourceLimitChecks: [],
  nativeClosures: [],
  nativeLogs: [],
  byteSnapshots: [],
  boundary: {
    actual:
      'Built Electron secondary menu and confirmation; original Main IPC handlers; SQLite queue/receipts; signed PNG reads; durable Raster Add/shadow; one Undo/Redo; deliberate crash and real recovery; explicit Save/ZIP loader/native reopen.',
    precondition:
      'Literal prepared input planes and numerical world PNGs enter production queue admission/claim/staging/recovery. Exact-file resolver is declared; no inference, actual CPU preparation or trained-model claim. Target deletion is a direct writer setup edit before native startup.',
    oracle:
      'Literal whole RGBA including hidden RGB, alpha stripes, non-eight-aligned frozen bbox, exact PNG bytes, frozen payload fields, independent .igs loader, committed shadow/SQLite snapshots, real Konva samples and neighboring sessions.',
    resources:
      'No runtime, worker, model catalog or downloads. The declaration-only admission file is removed before conversion. Production Save may use placeholder preview; accepted assets/provenance remain real.',
    limits:
      'Root service <=2GiB/zero swap/<=600s plus <=90s stop; native groups <=2GiB/zero swap/240s owned KDE timers; aggregate unique live groups <=4GiB. Serial native actors, each physically exited before restart.',
    excluded:
      'ML inference/quality, CPU preparation, generated preview composition, installed runtime/resource qualification, full Smart Patch MVP, arbitrary resource/capacity matrix and release. Root visually reviews saved screenshots.',
    cleanup:
      'Root alone disposes fixtureRoot after recorded PID/start and owned-scope physical exit. Runner retains compact evidence and payloads and never touches user data or global caches.',
  },
}
const lifecycle = {
  schemaVersion: 1,
  owner: { repository: root, task: 'smart-patch-orphan-raster', run: reportFile },
  state: 'running',
  lastUsedAt: report.startedAt,
  evidence: [reportFile, evidenceRoot],
  payloads: [fixtureRoot],
  dependsOn: [],
  usedBy: [],
  pins: [
    { path: fixtureRoot, reason: 'Root disposal after all physical exits and evidence capture.' },
  ],
}
function checkpoint() {
  lifecycle.lastUsedAt = new Date().toISOString()
  writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  writeFileSync(lifecycleFile, JSON.stringify(lifecycle, null, 2) + '\n', { mode: 0o600 })
}
function check(name, evidence = {}) {
  report.checks.push({ name, ...evidence })
  checkpoint()
  console.log(`PASS ${name}`)
}
function filesBelow(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const file = path.join(directory, entry.name)
      assert.equal(entry.isSymbolicLink(), false, `Do not follow symlink ${file}`)
      return entry.isDirectory() ? filesBelow(file) : [file]
    })
    .sort()
}
const hashes = (files) =>
  Object.fromEntries(files.map((file) => [file, digest(readFileSync(file))]))
// Retain only referenced fixture bytes. These operational evidence allowances never affect
// production limits; in particular no model/environment/dependency tree is traversed or copied.
const snapshotFileLimit = 16 * 1024 ** 2
const snapshotTotalLimit = 128 * 1024 ** 2
const snapshotTables = [
  'generation_queue_item',
  'generation_candidate_receipt',
  'generation_staging_discarded_session',
  'generation_acceptance_journal',
  'generation_seed_cursor',
  'project_accepted_result_index',
  'project_index',
]
function ownedSnapshotPath(base, file) {
  assert.equal(path.resolve(file), file)
  const relative = path.relative(base, file)
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
  let current = base
  const parts = relative.split(path.sep)
  for (const [index, part] of ['', ...parts].entries()) {
    if (part) current = path.join(current, part)
    const entry = lstatSync(current, { bigint: true })
    assert.equal(entry.isSymbolicLink(), false, `Evidence must not dereference ${current}`)
    assert.equal(entry.uid, BigInt(process.getuid()))
    if (index < parts.length) assert.equal(entry.isDirectory(), true)
    else assert.equal(entry.isFile(), true)
  }
  return lstatSync(file, { bigint: true })
}
function snapshotStamp(entry) {
  return Object.fromEntries(
    ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].map((key) => [key, String(entry[key])]),
  )
}
function readSnapshotSource(base, file) {
  const before = ownedSnapshotPath(base, file)
  assert.ok(
    before.size <= BigInt(snapshotFileLimit),
    `Unexpectedly large compact evidence file: ${file}`,
  )
  const descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    assert.deepEqual(snapshotStamp(fstatSync(descriptor, { bigint: true })), snapshotStamp(before))
    const bytes = readFileSync(descriptor)
    assert.deepEqual(snapshotStamp(fstatSync(descriptor, { bigint: true })), snapshotStamp(before))
    assert.deepEqual(snapshotStamp(ownedSnapshotPath(base, file)), snapshotStamp(before))
    return bytes
  } finally {
    closeSync(descriptor)
  }
}
function evidenceDirectory(directory) {
  const relative = path.relative(evidenceRoot, directory)
  assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative))
  let current = evidenceRoot
  for (const part of ['', ...relative.split(path.sep).filter(Boolean)]) {
    if (part) current = path.join(current, part)
    if (!existsSync(current)) mkdirSync(current, { mode: 0o700 })
    const entry = lstatSync(current)
    assert.ok(entry.isDirectory() && !entry.isSymbolicLink())
    assert.equal(entry.uid, process.getuid())
  }
}
function retainSnapshotBytes(snapshot, relativePath, bytes, role, sourcePath = null) {
  const destination = path.resolve(snapshot.directory, relativePath)
  assert.ok(
    path.relative(snapshot.directory, destination) &&
      !path.relative(snapshot.directory, destination).startsWith('..'),
  )
  assert.ok(bytes.length <= snapshotFileLimit)
  const retained = report.byteSnapshots
    .flatMap(({ files }) => files)
    .reduce((sum, file) => sum + file.byteSize, 0)
  assert.ok(retained + bytes.length <= snapshotTotalLimit, 'Compact snapshot allowance exceeded')
  evidenceDirectory(path.dirname(destination))
  writeFileSync(destination, bytes, { flag: 'wx', mode: 0o600 })
  assert.ok(readSnapshotSource(evidenceRoot, destination).equals(bytes))
  snapshot.files.push({
    relativePath: path.relative(evidenceRoot, destination),
    byteSize: bytes.length,
    sha256: digest(bytes),
    role,
    ...(sourcePath
      ? { sourcePath, sourceRelativeToPayload: path.relative(fixtureRoot, sourcePath) }
      : {}),
  })
  return bytes
}
function retainSnapshotFile(
  snapshot,
  sourcePath,
  role,
  expectedSha256 = null,
  expectedBytes = null,
) {
  const relative = path.relative(appDataRoot, sourcePath)
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
  const bytes = readSnapshotSource(fixtureRoot, sourcePath)
  if (expectedSha256 !== null) assert.equal(digest(bytes), expectedSha256)
  if (expectedBytes !== null) assert.equal(bytes.length, expectedBytes)
  return retainSnapshotBytes(snapshot, path.join('app-data', relative), bytes, role, sourcePath)
}
async function retainSqliteBackup(snapshot) {
  // SQLite alone reads the live database/WAL. Never read or copy their raw descriptors here.
  const sourceIdentity = ownedSnapshotPath(fixtureRoot, database.filePath)
  const destination = path.join(snapshot.directory, 'database.sqlite')
  assert.equal(existsSync(destination), false)
  const source = new Database(database.filePath, {
    readonly: true,
    fileMustExist: true,
    timeout: 5000,
  })
  let progress
  try {
    assert.equal(ownedSnapshotPath(fixtureRoot, database.filePath).ino, sourceIdentity.ino)
    const pageSize = source.pragma('page_size', { simple: true })
    assert.ok(source.pragma('page_count', { simple: true }) * pageSize <= snapshotFileLimit)
    const deadline = Date.now() + 10_000
    progress = await source.backup(destination, {
      progress: ({ totalPages }) => {
        assert.ok(Date.now() < deadline, 'SQLite evidence backup exceeded10s')
        assert.ok(totalPages * pageSize <= snapshotFileLimit)
        return 100
      },
    })
  } finally {
    source.close()
  }
  assert.equal(progress.remainingPages, 0)
  ownedSnapshotPath(evidenceRoot, destination)
  chmodSync(destination, 0o600)
  const copy = new Database(destination, { fileMustExist: true, timeout: 5000 })
  let witnesses
  try {
    // Normalize only the completed backup to a self-contained SQLite file, using SQLite APIs.
    // This avoids depending on disposable backup-side WAL/SHM files after archive extraction.
    assert.equal(copy.pragma('journal_mode = DELETE', { simple: true }), 'delete')
    assert.deepEqual(copy.pragma('integrity_check'), [{ integrity_check: 'ok' }])
    witnesses = copy.transaction(() =>
      Object.fromEntries(
        snapshotTables.map((table) => [
          table,
          copy
            .prepare(`SELECT * FROM ${table} WHERE local_project_key = ?`)
            .all(projectId)
            .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
        ]),
      ),
    )()
    snapshot.sqlite = {
      method: 'better-sqlite3.Database.backup',
      progress,
      journalMode: 'delete',
      sqliteVersion: copy.prepare('SELECT sqlite_version() AS version').get().version,
      witnessesRelativePath: path.relative(
        evidenceRoot,
        path.join(snapshot.directory, 'sqlite-witnesses.json'),
      ),
    }
  } finally {
    copy.close()
  }
  for (const suffix of ['-wal', '-shm', '-journal'])
    assert.equal(existsSync(destination + suffix), false)
  const bytes = readSnapshotSource(evidenceRoot, destination)
  assert.ok(
    report.byteSnapshots
      .flatMap(({ files }) => files)
      .reduce((sum, file) => sum + file.byteSize, bytes.length) <= snapshotTotalLimit,
  )
  snapshot.files.push({
    relativePath: path.relative(evidenceRoot, destination),
    byteSize: bytes.length,
    sha256: digest(bytes),
    role: 'consistent-sqlite-backup',
    sourcePath: database.filePath,
  })
  retainSnapshotBytes(
    snapshot,
    'sqlite-witnesses.json',
    Buffer.from(JSON.stringify(witnesses, null, 2) + '\n'),
    'rows-from-consistent-sqlite-backup',
  )
  return witnesses
}
function retainStagingInputs(snapshot, queueRows) {
  for (const fixture of [...targetCandidates, smartNeighbor]) {
    const candidate = fixture.candidate
    const directory = path.dirname(candidate.assetPath)
    const manifestBytes = retainSnapshotFile(
      snapshot,
      path.join(directory, 'manifest.json'),
      'smart-candidate-manifest',
    )
    const manifest = JSON.parse(manifestBytes)
    assert.equal(manifest.candidateId, candidate.candidateId)
    assert.equal(manifest.frozenPayloadSha256, candidate.frozenPayloadSha256)
    assert.equal(digest(Buffer.from(manifest.frozenPayloadJson)), candidate.frozenPayloadSha256)
    const image = retainSnapshotFile(
      snapshot,
      candidate.assetPath,
      'smart-world-contribution',
      candidate.image.sha256,
      candidate.image.byteSize,
    )
    assertPixels(image, fixture)
    retainSnapshotFile(
      snapshot,
      candidate.finalContributionMask.path,
      'smart-final-contribution-mask',
      candidate.finalContributionMask.sha256,
      candidate.finalContributionMask.byteSize,
    )
  }
  const bundles = new Set()
  for (const row of queueRows.filter(
    ({ operation }) => operation === 'illustrious-smart-patch' || operation === 'anima-smart-patch',
  )) {
    const payload = JSON.parse(row.frozen_payload_json)
    const directory = path.join(
      appDataRoot,
      'generation-queued-inputs/smart-patch',
      payload.bundle.id,
    )
    if (bundles.has(directory)) continue
    bundles.add(directory)
    const manifestBytes = retainSnapshotFile(
      snapshot,
      path.join(directory, 'manifest.json'),
      'frozen-full-input-manifest',
      payload.bundle.manifestSha256,
    )
    const manifest = JSON.parse(manifestBytes)
    for (const [name, metadata] of Object.entries(manifest.files)) {
      assert.ok(
        [
          'authored-mask.png',
          'final-contribution-mask.png',
          'latent-keep-mask.png',
          'model-source.png',
          'source.png',
        ].includes(name),
      )
      retainSnapshotFile(
        snapshot,
        path.join(directory, name),
        'frozen-full-input-plane',
        metadata.sha256,
        metadata.byteSize,
      )
    }
  }
  const fresh = queueRows.find(({ id }) => id === freshRetrySibling.id)
  assert.ok(
    fresh &&
      bundles.has(
        path.join(
          appDataRoot,
          'generation-queued-inputs/smart-patch',
          JSON.parse(fresh.frozen_payload_json).bundle.id,
        ),
      ),
  )
  const candidate = normalNeighbor.candidate
  const directory = path.join(
    appDataRoot,
    'recovery/generation-staging',
    projectId,
    candidate.stagingSessionId,
  )
  const ordinaryManifest = JSON.parse(
    retainSnapshotFile(
      snapshot,
      path.join(directory, 'manifest.json'),
      'ordinary-neighbor-manifest',
    ),
  )
  assert.ok(
    ordinaryManifest.candidates.some(({ candidateId }) => candidateId === candidate.candidateId),
  )
  assert.ok(
    retainSnapshotFile(
      snapshot,
      candidate.assetPath,
      'ordinary-neighbor-candidate',
      candidate.image.sha256,
      candidate.image.byteSize,
    ).equals(normalNeighbor.bytes),
  )
  const ordinaryRow = queueRows.find(({ id }) => id === candidate.queueItemId)
  assert.ok(ordinaryRow)
  const ordinaryPayload = JSON.parse(ordinaryRow.frozen_payload_json)
  const ordinaryInputDirectory = path.join(appDataRoot, 'generation-inputs', candidate.queueItemId)
  const ordinaryInputManifest = JSON.parse(
    retainSnapshotFile(
      snapshot,
      path.join(ordinaryInputDirectory, 'manifest.json'),
      'ordinary-neighbor-input-manifest',
    ),
  )
  assert.deepEqual(ordinaryInputManifest, {
    payloadSha256: digest(Buffer.from(ordinaryRow.frozen_payload_json)),
    queueInputVersion: 1,
    queueItemId: candidate.queueItemId,
    targetByteSize: ordinaryPayload.workerJob.target.byteSize,
    targetFile: 'target.png',
    targetSha256: ordinaryPayload.workerJob.target.sha256,
  })
  retainSnapshotFile(
    snapshot,
    path.join(ordinaryInputDirectory, 'target.png'),
    'ordinary-neighbor-frozen-target',
    ordinaryInputManifest.targetSha256,
    ordinaryInputManifest.targetByteSize,
  )
  snapshot.fullInputBundleCount = bundles.size
  snapshot.freshRetryBundleRetained = true
}
async function retainShadowBytes(snapshot, expected) {
  const manifestPath = path.join(appDataRoot, 'autosave', projectId, 'manifest.json')
  const manifestBytes = retainSnapshotFile(snapshot, manifestPath, 'autosave-manifest')
  const manifest = JSON.parse(manifestBytes)
  assert.equal(manifest.state, 'dirty')
  assert.equal(manifest.documentRevision, expected.document.documentRevision)
  assert.equal(manifest.snapshotId, expected.manifest.snapshotId)
  const snapshotDirectory = path.join(path.dirname(manifestPath), 'snapshots', manifest.snapshotId)
  const projectBytes = retainSnapshotFile(
    snapshot,
    path.join(snapshotDirectory, 'project.json'),
    'autosave-snapshot-document',
    manifest.documentHash,
  )
  assert.deepEqual(JSON.parse(projectBytes), expected.document)
  for (const asset of manifest.dirtyAssets) {
    assert.ok(asset.path.startsWith('assets/') && !asset.path.split('/').includes('..'))
    retainSnapshotFile(
      snapshot,
      path.join(snapshotDirectory, asset.path),
      'autosave-snapshot-asset',
      asset.sha256,
      asset.bytes,
    )
  }
  const base = await readIgsPackage(packagePath)
  assert.equal(digest(Buffer.from(JSON.stringify(base.project))), manifest.baseDocumentHash)
  assert.ok(
    readSnapshotSource(fixtureRoot, manifestPath).equals(manifestBytes),
    'Shadow changed during compact byte capture',
  )
  snapshot.shadow = {
    snapshotId: manifest.snapshotId,
    documentRevision: manifest.documentRevision,
    baseDocumentRevision: manifest.baseDocumentRevision,
    dirtyAssetCount: manifest.dirtyAssets.length,
  }
}
async function retainEvidenceCheckpoint(phase, { staging = false, shadow = null } = {}) {
  assert.match(phase, /^[a-z0-9-]+$/)
  const snapshot = {
    phase,
    directory: path.join(evidenceRoot, 'checkpoints', phase),
    startedAt: new Date().toISOString(),
    outcome: 'capturing',
    files: [],
  }
  assert.equal(existsSync(snapshot.directory), false)
  evidenceDirectory(snapshot.directory)
  report.byteSnapshots.push(snapshot)
  checkpoint()
  try {
    const before = await witness()
    const witnesses = await retainSqliteBackup(snapshot)
    for (const [table, key] of [
      ['generation_queue_item', 'queue'],
      ['generation_candidate_receipt', 'receipts'],
      ['generation_staging_discarded_session', 'discarded'],
      ['generation_acceptance_journal', 'journal'],
      ['project_accepted_result_index', 'savedIndex'],
    ])
      assert.deepEqual(
        witnesses[table],
        before[key],
        `${phase}: SQLite backup must match the observed checkpoint`,
      )
    retainSnapshotFile(snapshot, packagePath, 'paired-saved-project', before.packageSha256)
    if (staging) retainStagingInputs(snapshot, witnesses.generation_queue_item)
    if (shadow) await retainShadowBytes(snapshot, shadow)
    assert.deepEqual(
      await witness(),
      before,
      `${phase}: evidence capture changed or raced the checkpoint`,
    )
    snapshot.outcome = 'retained-and-verified'
  } catch (error) {
    snapshot.outcome = 'failed-partial-capture'
    snapshot.error = String(error)
    throw error
  } finally {
    snapshot.completedAt = new Date().toISOString()
    snapshot.totalBytes = snapshot.files.reduce((sum, file) => sum + file.byteSize, 0)
    const manifestFile = path.join(snapshot.directory, 'manifest.json')
    const manifestBytes = Buffer.from(JSON.stringify(snapshot, null, 2) + '\n')
    writeFileSync(manifestFile, manifestBytes, { flag: 'wx', mode: 0o600 })
    snapshot.manifestFile = manifestFile
    snapshot.manifestSha256 = digest(manifestBytes)
    checkpoint()
  }
}
function verifyRetainedSnapshots() {
  assert.deepEqual(
    report.byteSnapshots.map(({ phase }) => phase),
    [
      'before-confirmed-add',
      'unsaved-before-crash',
      'after-shadow-recovery',
      'after-explicit-save',
    ],
  )
  for (const snapshot of report.byteSnapshots) {
    assert.equal(snapshot.outcome, 'retained-and-verified')
    assert.equal(
      digest(readSnapshotSource(evidenceRoot, snapshot.manifestFile)),
      snapshot.manifestSha256,
    )
    for (const file of snapshot.files) {
      const bytes = readSnapshotSource(evidenceRoot, path.join(evidenceRoot, file.relativePath))
      assert.equal(bytes.length, file.byteSize)
      assert.equal(digest(bytes), file.sha256)
    }
  }
  report.byteArchiveVerification = {
    verifiedAt: new Date().toISOString(),
    snapshotCount: report.byteSnapshots.length,
    fileCount: report.byteSnapshots.reduce((sum, snapshot) => sum + snapshot.files.length, 0),
    totalBytes: report.byteSnapshots.reduce((sum, snapshot) => sum + snapshot.totalBytes, 0),
    payloadRequiredForRetainedSnapshots: false,
  }
  checkpoint()
}
const sourceFiles = [
  'scripts/smoke-smart-patch-orphan-raster.mjs',
  'scripts/native-smoke-window.mjs',
  'scripts/qualification-resource-limits.mjs',
  ...['src/main', 'src/preload', 'src/shared', 'src/renderer'].flatMap((directory) =>
    filesBelow(directory).filter((file) => /\.(?:ts|vue|css|sql)$/.test(file)),
  ),
]
const bundleFiles = [
  'dist/main/main.cjs',
  'dist/preload/preload.cjs',
  'dist/renderer/index.html',
  ...filesBelow('dist/main/migrations'),
  ...filesBelow('dist/renderer/assets').filter((file) => /\.(?:js|css)$/.test(file)),
]
function identity(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    return { pid, start: stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] }
  } catch (error) {
    if (['ENOENT', 'ESRCH'].includes(error.code)) return null
    throw error
  }
}
function physicallyExited(value) {
  return identity(value.pid)?.start !== value.start
}
function sampleDescendants() {
  const parents = new Map()
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue
    try {
      const text = readFileSync(`/proc/${entry}/status`, 'utf8')
      parents.set(Number(entry), Number(text.match(/^PPid:\s+(\d+)$/m)?.[1]))
    } catch (error) {
      if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error
    }
  }
  const ids = new Set([nativeProcess.pid])
  for (let changed = true; changed;) {
    changed = false
    for (const [child, parent] of parents) {
      if (ids.has(parent) && !ids.has(child)) {
        ids.add(child)
        changed = true
      }
    }
  }
  for (const pid of ids) {
    const value = identity(pid)
    if (value) observed.set(`${pid}:${value.start}`, value)
  }
}
function launcherBound() {
  const group = readFileSync('/proc/self/cgroup', 'utf8')
    .trim()
    .split('\n')
    .find((line) => line.startsWith('0::'))
    ?.slice(3)
  assert.ok(group?.startsWith('/') && group !== '/')
  const directory = `/sys/fs/cgroup${group}`
  const memoryMax = readFileSync(`${directory}/memory.max`, 'utf8').trim()
  assert.match(memoryMax, /^\d+$/)
  assert.ok(BigInt(memoryMax) <= 2n * 1024n ** 3n)
  assert.equal(readFileSync(`${directory}/memory.swap.max`, 'utf8').trim(), '0')
  return { group, memoryMax, swapMax: '0' }
}
function durationSeconds(value) {
  const text = value.replace(/\s+/g, '')
  if (text === '0') return 0
  const token = /(\d+(?:\.\d+)?)(us|ms|min|s|h|d)/g
  assert.equal(text.replace(token, ''), '', `Unrecognized duration ${value}`)
  const scale = { us: 0.000001, ms: 0.001, s: 1, min: 60, h: 3600, d: 86400 }
  return [...text.matchAll(token)].reduce(
    (sum, match) => sum + Number(match[1]) * scale[match[2]],
    0,
  )
}
async function verifyLauncherDeadline() {
  const value = launcherBound()
  const unit = path.basename(value.group)
  const { stdout } = await nativeExec(
    'systemctl',
    ['--user', 'show', '--property=ControlGroup,RuntimeMaxUSec,TimeoutStopUSec,KillMode', unit],
    { timeout: 10_000, maxBuffer: 16 * 1024 },
  )
  const properties = Object.fromEntries(
    stdout
      .trim()
      .split('\n')
      .map((line) => {
        const at = line.indexOf('=')
        return [line.slice(0, at), line.slice(at + 1)]
      }),
  )
  assert.equal(properties.ControlGroup, value.group)
  assert.equal(properties.KillMode, 'control-group')
  const runtimeSeconds = durationSeconds(properties.RuntimeMaxUSec)
  const stopSeconds = durationSeconds(properties.TimeoutStopUSec)
  assert.ok(runtimeSeconds > 0 && runtimeSeconds <= 600)
  assert.ok(stopSeconds >= 0 && stopSeconds <= 90)
  return { ...value, unit, properties, runtimeSeconds, stopSeconds }
}
async function bounds(label) {
  const value = await boundQualificationProcess(nativeProcess.pid, {
    deadlineSeconds: 240,
    execute: (file, args, options) =>
      nativeExec(
        file,
        args.map((item) => (item === 'MemoryMax=12G' ? 'MemoryMax=2G' : item)),
        options,
      ),
  })
  const launcher = launcherBound()
  assert.equal(launcher.group, report.launcher.group)
  const groups = new Map(value.groups.map((group) => [group.group, BigInt(group.memoryMax)]))
  groups.set(launcher.group, BigInt(launcher.memoryMax))
  assert.ok(value.groups.every((group) => BigInt(group.memoryMax) <= 2n * 1024n ** 3n))
  const uniqueTotalMax = [...groups.values()].reduce((sum, size) => sum + size, 0n)
  assert.ok(uniqueTotalMax <= 4n * 1024n ** 3n)
  for (const group of value.groups) {
    assert.equal(group.swapMax, '0')
    assert.ok((group.ownedScope && group.deadlineTimer) || group.group === launcher.group)
  }
  const memorySamples = [...groups.keys()].map((group) => {
    const directory = `/sys/fs/cgroup${group}`
    const stat = Object.fromEntries(
      readFileSync(`${directory}/memory.stat`, 'utf8')
        .trim()
        .split('\n')
        .map((line) => line.split(' ')),
    )
    assert.match(stat.anon, /^\d+$/)
    assert.match(stat.file, /^\d+$/)
    return {
      group,
      memoryCurrent: readFileSync(`${directory}/memory.current`, 'utf8').trim(),
      memoryPeak: readFileSync(`${directory}/memory.peak`, 'utf8').trim(),
      memoryStat: { anon: stat.anon, file: stat.file, kernel: stat.kernel, slab: stat.slab },
    }
  })
  nativeChecks.push(value)
  report.resourceLimitChecks.push({
    label,
    ...value,
    memorySamples,
    uniqueTotalMax: String(uniqueTotalMax),
  })
  checkpoint()
}

function stripeAlpha(rect) {
  return Uint8Array.from(
    { length: rect.width * rect.height },
    (_, index) => alphaValues[Math.min(4, Math.floor(((index % rect.width) * 5) / rect.width))],
  )
}
function colorPng(rect, color, alpha = null) {
  return literalSmartPatchColorPng(
    rect.width,
    rect.height,
    Array.from({ length: rect.width * rect.height }, (_, index) => [
      ...color.slice(0, 3),
      alpha ? alpha[index] : color[3],
    ]).flat(),
    4,
  )
}
function colorPlane(bytes, rect) {
  return {
    bytes,
    byteSize: bytes.length,
    colorSpace: 'srgb',
    height: rect.height,
    iccSha256: IGS_SRGB_ICC_SHA256,
    sha256: digest(bytes),
    width: rect.width,
  }
}
function imageMetadata(bytes, rect) {
  const { bytes: _bytes, ...metadata } = colorPlane(bytes, rect)
  return metadata
}
// Independent decoder for our literal filter-zero PNGs; accepted bytes must be byte-exact first.
function decodeLiteralRgba(bytes, rect) {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.equal(bytes.readUInt32BE(16), rect.width)
  assert.equal(bytes.readUInt32BE(20), rect.height)
  assert.equal(bytes[24], 8)
  assert.equal(bytes[25], 6)
  const chunks = []
  for (let offset = 8; offset < bytes.length;) {
    const size = bytes.readUInt32BE(offset)
    const kind = bytes.toString('ascii', offset + 4, offset + 8)
    if (kind === 'IDAT') chunks.push(bytes.subarray(offset + 8, offset + 8 + size))
    offset += size + 12
  }
  const rows = inflateSync(Buffer.concat(chunks))
  const stride = rect.width * 4
  assert.equal(rows.length, (stride + 1) * rect.height)
  const rgba = Buffer.alloc(rect.width * rect.height * 4)
  for (let row = 0; row < rect.height; row++) {
    assert.equal(rows[row * (stride + 1)], 0)
    rows.copy(rgba, row * stride, row * (stride + 1) + 1, (row + 1) * (stride + 1))
  }
  return rgba
}
function assertPixels(bytes, fixture) {
  assert.ok(bytes.equals(fixture.bytes), 'Original world PNG must remain byte-exact')
  const rgba = decodeLiteralRgba(bytes, fixture.candidate.bbox)
  const expected = Buffer.from(Array.from(fixture.alpha, (a) => [...fixture.color, a]).flat())
  assert.ok(rgba.equals(expected), 'Whole RGBA, including RGB under zero alpha, changed')
  const alpha = Buffer.from(
    Array.from({ length: fixture.alpha.length }, (_, index) => rgba[index * 4 + 3]),
  )
  assert.ok(alpha.equals(Buffer.from(fixture.alpha)), 'Final contribution alpha changed')
  return { pngSha256: digest(bytes), wholeRgbaSha256: digest(rgba), alpha8Sha256: digest(alpha) }
}
function literalPrepared(rect, count) {
  const value = literalSmartPatchPreparedInput('illustrious', 'inpaint')
  const alpha = stripeAlpha(rect)
  // The authored full edit core is the final opaque stripe; fractional stripes are its frozen contribution extension.
  const coreLeft = Math.ceil((rect.width * 4) / 5)
  const core = { ...rect, width: rect.width - coreLeft, x: rect.x + coreLeft }
  const maskPng = encodeProjectMaskPng(
    new Uint8Array(core.width * core.height).fill(255),
    core.width,
    core.height,
  )
  const mask = value.prepared.context.mask
  mask.asset = {
    bytes: maskPng.length,
    height: core.height,
    path: `assets/masks/${mask.id}/${digest(maskPng)}.png`,
    sha256: digest(maskPng),
    width: core.width,
  }
  mask.bounds = core
  value.prepared.maskPngBytes = maskPng
  value.prepared.context.bbox = { ...rect }
  value.prepared.context.generationDraft.model.fileSha256 = digest(modelBytes)
  value.prepared.context.generationDraft.model.predictionType = 'v_prediction'
  value.prepared.source = colorPlane(colorPng(rect, lowerColor), rect)
  const finalBytes = literalSmartPatchNumericPng(alpha, rect.width, rect.height)
  value.prepared.conditioning.finalContributionMask = {
    bytes: finalBytes,
    height: rect.height,
    polarity: 'generate',
    sha256: digest(finalBytes),
    width: rect.width,
  }
  const first = value.executions[0]
  first.request.inference.checkpoint = {
    path: modelPath,
    predictionType: 'v_prediction',
    sha256: digest(modelBytes),
  }
  value.executions = Array.from({ length: count }, (_, index) => {
    const entry = structuredClone(first)
    entry.item.seed = index
    entry.request.inference.sampling.seed = index
    return entry
  })
  return { ...value, alpha, maskPng }
}
async function enqueueSmart(material, stagingSessionId) {
  assert.equal(existsSync(modelPath), false)
  writeFileSync(modelPath, modelBytes, { flag: 'wx', mode: 0o600 })
  try {
    return await fixtureQueue.enqueuePreparedSmartPatchBatch({
      assertCurrent: () => undefined,
      material,
      modelService: models,
      projectPath: packagePath,
      stagingSessionId,
    })
  } finally {
    rmSync(modelPath)
  }
}
async function publishSmart(material, stagingSessionId, alpha, baseColor) {
  const queued = await enqueueSmart(material, stagingSessionId)
  const fixtures = []
  for (const row of queued) {
    const claimed = await fixtureQueue.claimNextPendingSmartPatch()
    assert.equal(claimed?.item.id, row.id)
    const rect = claimed.payload.context.bbox
    const color = baseColor.map(
      (channel, index) => channel + (index === 0 ? claimed.payload.item.item.seed : 0),
    )
    const bytes = colorPng(rect, [...color, 255], alpha)
    const provisionalRoot = mkdtempSync(path.join(scratch, 'smart-patch-request-'))
    const outputPath = path.join(provisionalRoot, 'world-result.png')
    writeFileSync(outputPath, bytes, { flag: 'wx', mode: 0o600 })
    const candidate = await smartStaging.publishGenerationCandidate({
      actualSeed: claimed.payload.item.item.seed,
      expectedProvisionalRoot: provisionalRoot,
      expectedStatusSequence: claimed.item.statusSequence,
      output: { ...imageMetadata(bytes, rect), path: outputPath },
      provisionalOutputPath: outputPath,
      queueItemId: row.id,
    })
    const fixture = { alpha, bytes, candidate, color }
    const proof = assertPixels(bytes, fixture)
    writeFileSync(path.join(evidenceRoot, `world-${candidate.candidateId}.png`), bytes, {
      flag: 'wx',
      mode: 0o600,
    })
    fixtures.push(fixture)
    report.staged ??= []
    report.staged.push({ candidate, pixels: proof })
  }
  return fixtures
}
async function stageOrdinaryNeighbor(document, reference) {
  const rect = { height: 64, width: 64, x: 384, y: 352 }
  const target = colorPng(rect, [0, 0, 0, 0])
  const output = colorPng(rect, [150, 70, 180, 255])
  const prepared = {
    context: {
      bbox: rect,
      documentId: document.documentId,
      documentRevision: document.documentRevision,
      kind: 'normal-txt2img-preparation',
      model: { managedPath: modelPath, reference },
      prompts: { negative: '', positive: 'untouched ordinary neighbor' },
      sampling: {
        cfgScale: 7.5,
        invokeScheduler: 'dpmpp_2m_k',
        requestedSeedPolicy: 'fixed',
        sampler: 'DPM++ 2M',
        scheduler: 'Karras',
        seed: 42,
        steps: 24,
      },
      schemaVersion: 1,
      target: { ...imageMetadata(target, rect), format: 'png' },
    },
    targetPngBytes: target,
  }
  writeFileSync(modelPath, modelBytes, { flag: 'wx', mode: 0o600 })
  try {
    let candidate
    await withIllustriousTxt2ImgRequest({
      modelService: models,
      prepared,
      // Declared admission collaborator for the ordinary neighbor precondition, not a live runtime.
      ready: structuredClone(ANIMA_BATCH_READY),
      scratchBasePath: scratch,
      use: async (request) => {
        const queued = await fixtureQueue.enqueueIllustriousTxt2Img({
          prepared,
          projectPath: packagePath,
          request,
          stagingSessionId: randomUUID(),
        })
        const claim = await fixtureQueue.claimNextPending()
        assert.equal(claim?.item.id, queued.id)
        writeFileSync(request.job.output.pngPath, output, { flag: 'wx', mode: 0o600 })
        candidate = await normalStaging.publishIllustriousTxt2Img({
          actualSeed: 42,
          expectedProvisionalRoot: request.job.output.stagingRoot,
          expectedStatusSequence: claim.item.statusSequence,
          provisionalOutputPath: request.job.output.pngPath,
          queueItemId: queued.id,
        })
      },
    })
    return { bytes: output, candidate }
  } finally {
    rmSync(modelPath)
  }
}
async function prepare() {
  mkdirSync(workspace, { recursive: true, mode: 0o700 })
  mkdirSync(scratch, { recursive: true, mode: 0o700 })
  const session = await ProjectSession.create(
    packagePath,
    title,
    {
      placeholdersDir: path.resolve('dist/main/placeholders'),
      scratchDir: path.join(fixtureRoot, 'writer-scratch'),
    },
    { height: 512, width: 512, x: 0, y: 0 },
  )
  projectId = session.localRecoveryKey
  const target = literalPrepared(frozenRect, 3)
  const neighbor = literalPrepared(neighborRect, 1)
  patchId = target.prepared.context.layerId
  neighborPatchId = neighbor.prepared.context.layerId
  const lowerId = randomUUID()
  const lowerRect = { height: 512, width: 512, x: 0, y: 0 }
  const lowerBytes = colorPng(lowerRect, lowerColor)
  lower = {
    asset: {
      bytes: lowerBytes.length,
      height: 512,
      path: `assets/layers/${lowerId}.png`,
      sha256: digest(lowerBytes),
      width: 512,
    },
    blendMode: 'normal',
    id: lowerId,
    kind: 'raster',
    locked: false,
    name: 'Untouched opaque lower source',
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
    visible: true,
  }
  const patch = (input, name) => ({
    activeRasterSubLayerId: null,
    blendMode: 'normal',
    boundingBox: { ...input.prepared.context.bbox },
    coherenceSettings: { ...input.prepared.context.coherenceSettings },
    generationDraft: structuredClone(input.prepared.context.generationDraft),
    id: input.prepared.context.layerId,
    internalResolution: { ...input.prepared.context.internalResolution },
    kind: 'smart-patch',
    locked: false,
    mask: structuredClone(input.prepared.context.mask),
    maskSettings: { ...input.prepared.context.maskSettings },
    name,
    opacity: 1,
    rasterSubLayers: [],
    visible: true,
  })
  session.applyDocument({
    ...session.document,
    layers: [
      lower,
      patch(target, 'Deleted original target'),
      patch(neighbor, 'Untouched Smart neighbor'),
    ],
  })
  await session.save({
    assets: {
      [lower.asset.path]: { bytes: lowerBytes },
      [target.prepared.context.mask.asset.path]: { bytes: target.maskPng },
      [neighbor.prepared.context.mask.asset.path]: { bytes: neighbor.maskPng },
    },
  })
  const targetBearing = structuredClone(session.document)
  const originalPackage = path.join(evidenceRoot, 'original-target-bearing.igs')
  writeFileSync(originalPackage, readFileSync(packagePath), { flag: 'wx', mode: 0o600 })
  assert.deepEqual((await readIgsPackage(originalPackage)).project, targetBearing)
  const unused = async () => {
    throw new Error('Unselected resource resolver must not run')
  }
  models = {
    assertNoUnboundGenerationEmbeddings: async () => undefined,
    resolveVerifiedAnimaGenerationLoraForPlan: unused,
    resolveVerifiedGenerationAnimaBundleForPlan: unused,
    resolveVerifiedGenerationCheckpointForPlan: async (reference) => {
      assert.equal(digest(readFileSync(modelPath)), reference.fileSha256)
      return {
        managedPath: modelPath,
        noiseProfile: defaultIllustriousNoiseProfile(),
        reference: structuredClone(reference),
      }
    },
    resolveVerifiedGenerationEmbeddingForPlan: unused,
    resolveVerifiedGenerationLoraForPlan: unused,
    resolveVerifiedGenerationVaeForPlan: unused,
  }
  database = openAppDatabase(appDataRoot, path.resolve('dist/main/migrations'))
  fixtureQueue = new GenerationQueueRepository(database.db, appDataRoot)
  smartStaging = new SmartPatchGenerationStagingRepository(database.db, appDataRoot)
  normalStaging = new GenerationStagingRepository(database.db, appDataRoot)
  await fixtureQueue.recoverAfterRestart()
  await smartStaging.recoverAfterRestart()
  await normalStaging.recoverAfterRestart()
  for (const fixture of [target, neighbor]) {
    Object.assign(fixture.prepared.context, {
      documentId: targetBearing.documentId,
      documentRevision: targetBearing.documentRevision,
      projectKey: projectId,
      sourceLayerIds: [lower.id],
    })
  }
  targetMaterial = await captureSmartPatchInputMaterial(target.prepared, target.executions)
  const neighborMaterial = await captureSmartPatchInputMaterial(
    neighbor.prepared,
    neighbor.executions,
  )
  targetSessionId = randomUUID()
  targetCandidates = await publishSmart(targetMaterial, targetSessionId, target.alpha, resultColor)
  ;[smartNeighbor] = await publishSmart(
    neighborMaterial,
    randomUUID(),
    neighbor.alpha,
    [180, 100, 35],
  )
  normalNeighbor = await stageOrdinaryNeighbor(
    targetBearing,
    target.prepared.context.generationDraft.model,
  )
  session.applyDocument({
    ...session.document,
    layers: session.document.layers.filter(({ id }) => id !== patchId),
  })
  await session.save()
  savedBaseline = structuredClone((await readIgsPackage(packagePath)).project)
  assert.equal(
    savedBaseline.layers.some(({ id }) => id === patchId),
    false,
  )
  assert.equal(savedBaseline.layers.length, 2)
  assert.deepEqual(savedBaseline.layers[0], lower)
  report.fixture = {
    projectId,
    packagePath,
    patchId,
    neighborPatchId,
    targetSessionId,
    originalPackage,
    targetBearingDocument: targetBearing,
    orphanSavedDocument: savedBaseline,
    orphanPackageSha256: digest(readFileSync(packagePath)),
    candidateIds: targetCandidates.map(({ candidate }) => candidate.candidateId),
    normalNeighborId: normalNeighbor.candidate.candidateId,
    smartNeighborId: smartNeighbor.candidate.candidateId,
    declarationResourceSha256: digest(modelBytes),
  }
  writeFileSync(path.join(evidenceRoot, 'orphan-saved-before-add.igs'), readFileSync(packagePath), {
    flag: 'wx',
    mode: 0o600,
  })
  check(
    'Declared literal inputs entered real queue/staging; target-bearing Save then target deletion/Save retain recoverable temporary candidates without acceptance',
  )
}

async function rawApi(method, ...args) {
  return window.evaluate(({ method, args }) => window.api.projects[method](...args), {
    method,
    args,
  })
}
async function api(method, ...args) {
  const result = await rawApi(method, ...args)
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}
async function current() {
  const result = await api('open', projectId)
  assert.equal(result.kind, 'opened')
  return result.tab
}
const results = () => api('listSmartPatchGenerationResults', projectId)
const ordinaryResults = () => api('listGenerationResults', projectId)
const canvas = () => window.getByRole('region', { name: 'Project Canvas', exact: true })
const tray = () =>
  window.getByRole('region', { name: 'Smart Patch Generation Results', exact: true })
const confirmation = () =>
  window.getByRole('dialog', { name: 'Review Smart Patch results', exact: true })
const card = (id) => tray().locator(`[data-smart-candidate-id="${id}"]`)
async function screenshot(name) {
  await window.evaluate(() =>
    document.fonts.ready.then(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    ),
  )
  const file = path.join(evidenceRoot, `${name}.png`)
  await window.mouse.move(0, 0)
  await window.screenshot({ path: file, animations: 'disabled' })
  report.screenshots.push(file)
  checkpoint()
}
async function setNativeSize(width, height, label) {
  await application.evaluate(
    ({ BrowserWindow }, [width, height]) => {
      BrowserWindow.getAllWindows()[0].setSize(width, height)
    },
    [width, height],
  )
  await expect
    .poll(() => window.evaluate(() => ({ width: innerWidth, height: innerHeight })))
    .toEqual({ width, height })
  const native = await application.evaluate(({ BrowserWindow }) => {
    const owned = BrowserWindow.getAllWindows()[0]
    return {
      size: owned.getSize(),
      contentSize: owned.getContentSize(),
      minimumSize: owned.getMinimumSize(),
      visible: owned.isVisible(),
    }
  })
  assert.deepEqual(native.size, [width, height])
  assert.deepEqual(native.contentSize, [width, height])
  assert.deepEqual(native.minimumSize, [900, 620])
  assert.equal(native.visible, true)
  report.viewportChecks ??= []
  report.viewportChecks.push({
    label,
    native,
    renderer: await window.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      dpr: devicePixelRatio,
    })),
  })
  checkpoint()
}
async function assertUnclippedContent(scope, label) {
  await expect(scope).toBeVisible()
  await window.evaluate(() => document.fonts.ready.then(() => undefined))
  let geometry
  await expect
    .poll(
      async () => {
        geometry = await scope.evaluate((surface) => {
          const box = (rect) => ({
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          })
          const viewport = { width: innerWidth, height: innerHeight }
          const violations = []
          const controls = []
          const text = []
          const checkBox = (rect, node, description) => {
            const clipped = []
            if (
              rect.left < -1 ||
              rect.top < -1 ||
              rect.right > innerWidth + 1 ||
              rect.bottom > innerHeight + 1
            )
              clipped.push('viewport')
            for (
              let ancestor = node;
              ancestor instanceof HTMLElement;
              ancestor = ancestor.parentElement
            ) {
              const style = getComputedStyle(ancestor)
              const clipsX = /^(hidden|clip|auto|scroll)$/.test(style.overflowX)
              const clipsY = /^(hidden|clip|auto|scroll)$/.test(style.overflowY)
              if (!clipsX && !clipsY) continue
              const outer = ancestor.getBoundingClientRect()
              const left = outer.left + ancestor.clientLeft
              const top = outer.top + ancestor.clientTop
              if (
                (clipsX &&
                  (rect.left < left - 1 || rect.right > left + ancestor.clientWidth + 1)) ||
                (clipsY && (rect.top < top - 1 || rect.bottom > top + ancestor.clientHeight + 1))
              )
                clipped.push(`${ancestor.tagName.toLowerCase()}.${ancestor.className}`)
            }
            if (clipped.length) violations.push({ description, rect: box(rect), clipped })
          }
          checkBox(surface.getBoundingClientRect(), surface.parentElement, 'surface')
          const interactive = [
            ...(surface.matches('button, [role="menuitem"]') ? [surface] : []),
            ...surface.querySelectorAll('button, [role="menuitem"]'),
          ]
          for (const control of interactive) {
            const rect = control.getBoundingClientRect()
            const style = getComputedStyle(control)
            if (!rect.width || !rect.height || style.visibility !== 'visible') continue
            const description = control.getAttribute('aria-label') ?? control.textContent.trim()
            checkBox(rect, control.parentElement, description)
            const hit = document.elementFromPoint(
              rect.left + rect.width / 2,
              rect.top + rect.height / 2,
            )
            const centerReachable = hit !== null && (hit === control || control.contains(hit))
            const disabled =
              control.matches(':disabled') || control.getAttribute('aria-disabled') === 'true'
            if (!disabled && !centerReachable)
              violations.push({ description, rect: box(rect), obscured: true })
            controls.push({ description, rect: box(rect), disabled, centerReachable })
          }
          const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT)
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!node.textContent.trim()) continue
            const owner = node.parentElement
            if (!owner || getComputedStyle(owner).visibility !== 'visible') continue
            const range = document.createRange()
            range.selectNodeContents(node)
            const rects = [...range.getClientRects()].filter(
              (rect) => rect.width > 0 && rect.height > 0,
            )
            for (const rect of rects) checkBox(rect, owner, node.textContent.trim())
            if (rects.length) text.push({ value: node.textContent.trim(), rects: rects.map(box) })
          }
          return {
            viewport,
            surface: box(surface.getBoundingClientRect()),
            controls,
            text,
            violations,
          }
        })
        return geometry.violations
      },
      { message: `${label}: text/control clipping or obscured controls` },
    )
    .toEqual([])
  assert.ok(geometry.text.length > 0, `${label}: actual text glyph boxes required`)
  assert.ok(geometry.controls.length > 0, `${label}: actual controls required`)
  report.layoutChecks ??= []
  report.layoutChecks.push({ label, ...geometry })
  checkpoint()
}
async function installIpcObserver() {
  await application.evaluate(({ ipcMain }, conversionChannel) => {
    const handlers = ipcMain._invokeHandlers
    if (!(handlers instanceof Map))
      throw new Error('Actual Electron IPC handler registry unavailable')
    globalThis.igsOrphanRasterCalls = []
    for (const channel of [conversionChannel, 'projects:save', 'projects:undo', 'projects:redo']) {
      const original = handlers.get(channel)
      if (typeof original !== 'function')
        throw new Error(`Actual built Main handler missing: ${channel}`)
      handlers.set(channel, async (event, ...args) => {
        const entry = {
          channel,
          args: JSON.parse(JSON.stringify(args)),
          startedAt: new Date().toISOString(),
        }
        globalThis.igsOrphanRasterCalls.push(entry)
        try {
          const reply = await original(event, ...args)
          entry.ok = reply?.ok
          entry.error = reply?.error
          entry.completedAt = new Date().toISOString()
          return reply
        } catch (error) {
          entry.thrown = String(error)
          throw error
        }
      })
    }
  }, conversionChannel)
}
async function ipcCalls() {
  return application.evaluate(() => globalThis.igsOrphanRasterCalls ?? [])
}
async function assertNoRuntime(label) {
  const status = await window.evaluate(async () => ({
    runtime: await window.api.runtime.getStatus(),
    models: await window.api.models.getCatalog(),
  }))
  assert.equal(status.runtime.ok, true)
  assert.equal(status.runtime.value.kind, 'not-installed')
  assert.deepEqual(status.models, { ok: true, value: [] })
  assert.equal(existsSync(modelPath), false)
  report.runtimeChecks ??= []
  report.runtimeChecks.push({ label, ...status })
  checkpoint()
}
async function launch(recover = false) {
  const environment = {
    ...process.env,
    NODE_ENV: 'production',
    CUDA_VISIBLE_DEVICES: '',
    PYTHONDONTWRITEBYTECODE: '1',
    XDG_CONFIG_HOME: path.join(fixtureRoot, 'config'),
    XDG_DATA_HOME: path.join(fixtureRoot, 'data'),
    XDG_CACHE_HOME: path.join(fixtureRoot, 'cache'),
  }
  for (const key of [
    'ELECTRON_RUN_AS_NODE',
    'IMAGEGEN_TEST_IMAGE_WORKER',
    'IMAGEGEN_DEV_SERVER_URL',
    'PYTHONPATH',
    'PYTHONHOME',
  ])
    delete environment[key]
  try {
    application = await electron.launch({
      args: ['--ozone-platform=x11', '.'],
      cwd: root,
      env: environment,
      timeout: 30_000,
    })
  } catch (error) {
    report.nativeLaunchError = String(error)
    throw error
  }
  nativeProcess = application.process()
  const launched = identity(nativeProcess.pid)
  assert.ok(launched)
  nativeChecks.push({ processIdentities: [launched], groups: [] })
  await bounds('launch')
  sampleDescendants()
  sampler = setInterval(() => {
    sampling = sampling.then(sampleDescendants).catch((error) => {
      report.samplerError = String(error)
    })
  }, 50)
  const log = { pid: nativeProcess.pid, text: '' }
  report.nativeLogs.push(log)
  for (const stream of [nativeProcess.stdout, nativeProcess.stderr])
    stream?.on('data', (bytes) => {
      if (log.text.length < 96 * 1024)
        log.text += String(bytes).slice(0, 96 * 1024 - log.text.length)
    })
  window = await isolateNativeSmokeWindow(application)
  window.setDefaultTimeout(15_000)
  window.on('pageerror', (error) => report.pageErrors.push(String(error)))
  await application.evaluate(({ BrowserWindow }) => {
    const native = BrowserWindow.getAllWindows()[0]
    native.setSize(1440, 900)
    native.show()
    native.focus()
  })
  await installIpcObserver()
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  await expect.poll(async () => (await api('list')).some(({ id }) => id === projectId)).toBe(true)
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await window.getByRole('button', { name: `Open ${title}`, exact: true }).click()
  // Retained temporary results require explicit Recover even when the saved document is clean.
  const dialog = window.getByRole('dialog', { name: 'Recovery available', exact: true })
  await expect(dialog).toBeVisible()
  await screenshot(
    recover ? '08-unsaved-shadow-recovery-confirmation' : '00-saved-temporary-results-recovery',
  )
  await dialog.getByRole('button', { name: 'Recover', exact: true }).click()
  await expect(window.getByRole('tab', { name: title, exact: true })).toBeVisible()
  await canvas().getByRole('button', { name: 'Fit View', exact: true }).click()
  report.viewports ??= []
  report.viewports.push(
    await window.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      dpr: devicePixelRatio,
    })),
  )
  assert.equal(
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
    true,
  )
  await assertNoRuntime(recover ? 'shadow-reopened' : 'opened')
}
async function chooseTarget(label) {
  await window.getByLabel('Generation results target', { exact: true }).click()
  await window.locator('.n-base-select-menu').getByText(label, { exact: true }).click()
  await expect(tray()).toBeVisible()
}
async function rows(table) {
  const values = await database.db
    .selectFrom(table)
    .selectAll()
    .where('local_project_key', '=', projectId)
    .execute()
  return values.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}
function shadowFiles() {
  const directory = path.join(appDataRoot, 'autosave', projectId)
  return hashes(filesBelow(directory))
}
function semanticLayers(layers) {
  return JSON.parse(
    JSON.stringify(layers, (key, value) => {
      if ((key === 'imageUrl' || key === 'maskImageUrl') && typeof value === 'string') {
        const url = new URL(value)
        assert.ok(['igs-layer:', 'igs-mask:'].includes(url.protocol))
        const parts = url.pathname.split('/')
        assert.ok(parts.length >= 6)
        // Only signed, document-revision-derived capability tokens change across history.
        // Asset hash, owning layer/mask identities and every authored field remain compared.
        parts[2] = '<document-revision>'
        parts[parts.length - 1] = '<signature>'
        return `${url.protocol}//${url.host}${parts.join('/')}`
      }
      return value
    }),
  )
}
async function witness() {
  return {
    tab: await current(),
    smart: await results(),
    ordinary: await ordinaryResults(),
    queue: await rows('generation_queue_item'),
    receipts: await rows('generation_candidate_receipt'),
    discarded: await rows('generation_staging_discarded_session'),
    journal: await rows('generation_acceptance_journal'),
    savedIndex: await rows('project_accepted_result_index'),
    shadow: shadowFiles(),
    packageSha256: digest(readFileSync(packagePath)),
  }
}
function requestFor(snapshot, candidateId, unfinishedJobIds = null) {
  const candidate = snapshot.candidates.find((entry) => entry.candidateId === candidateId)
  assert.ok(candidate)
  const target = snapshot.targets.find(
    (entry) => entry.documentId === candidate.documentId && entry.layerId === candidate.layerId,
  )
  assert.ok(target)
  return {
    candidateIds: [candidateId],
    documentId: snapshot.documentId,
    documentRevision: snapshot.documentRevision,
    expectedAvailableIds: snapshot.candidates
      .filter(
        (entry) => entry.layerId === candidate.layerId && entry.documentId === candidate.documentId,
      )
      .map((entry) => entry.candidateId),
    expectedUnfinishedJobIds: unfinishedJobIds ?? [...target.unfinishedJobIds],
    focusedCandidateId: candidateId,
    kind: 'smart-patch-raster',
    layerId: candidate.layerId,
  }
}
async function refuse(request, label) {
  const before = await witness()
  const beforeCount = (await ipcCalls()).filter(
    ({ channel }) => channel === conversionChannel,
  ).length
  const result = await rawApi('acceptSmartPatchRaster', projectId, request)
  assert.equal(result.ok, false, `${label}: request unexpectedly succeeded`)
  const calls = (await ipcCalls()).filter(({ channel }) => channel === conversionChannel)
  assert.equal(calls.length, beforeCount + 1, `${label}: refusal must reach actual Main IPC`)
  assert.equal(calls.at(-1).ok, false)
  assert.deepEqual(calls.at(-1).args, [projectId, request])
  assert.deepEqual(
    await witness(),
    before,
    `${label}: refused request changed durable or live state`,
  )
  check(label, { error: result.error })
}
async function openConversion(candidateId, screenshotName, layoutLabel = null) {
  const candidate = card(candidateId)
  await candidate.getByRole('button', { name: /^Preview Smart Patch candidate / }).click()
  const trigger = candidate.getByRole('button', { name: /^Smart Patch result \d+ actions$/ })
  if (layoutLabel) await assertUnclippedContent(trigger, `${layoutLabel}-result-actions`)
  await trigger.click()
  const item = window.getByRole('menuitem', { name: 'Add as Raster Layer', exact: true })
  await expect(item).toBeVisible()
  assert.notEqual(await item.getAttribute('aria-disabled'), 'true')
  await expect(
    window.getByRole('menuitem', { name: 'Save Candidate Image', exact: true }),
  ).toBeVisible()
  if (layoutLabel) {
    await assertUnclippedContent(
      window.getByRole('menu').filter({ has: item }),
      `${layoutLabel}-orphan-menu`,
    )
    await item.click({ trial: true })
  }
  if (screenshotName) await screenshot(screenshotName)
  await item.click()
  await expect(confirmation()).toBeVisible()
  await expect(confirmation().getByText('Add as Raster Layer?', { exact: true })).toBeVisible()
  if (layoutLabel) {
    await assertUnclippedContent(confirmation(), `${layoutLabel}-review-dialog`)
    for (const name of ['Add as Raster Layer', 'Keep results']) {
      const button = confirmation().getByRole('button', { name, exact: true })
      await expect(button).toBeEnabled()
      await button.click({ trial: true })
    }
  }
}
async function waitShadow(layerId, expectedPresent = true) {
  const directory = path.join(appDataRoot, 'autosave', projectId)
  let found
  await expect
    .poll(() => {
      try {
        const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8'))
        if (manifest.state !== 'dirty') return false
        const snapshotDirectory = path.join(directory, 'snapshots', manifest.snapshotId)
        const document = JSON.parse(
          readFileSync(path.join(snapshotDirectory, 'project.json'), 'utf8'),
        )
        const present = document.layers.some(({ id }) => id === layerId)
        if (document.documentRevision !== manifest.documentRevision || present !== expectedPresent)
          return false
        found = { directory: snapshotDirectory, document, manifest }
        return true
      } catch (error) {
        if (error.code === 'ENOENT') return false
        throw error
      }
    })
    .toBe(true)
  return found
}
function assertFrozenProvenance(layer, fixture) {
  const { candidate, alpha } = fixture
  const { context, files, item, mode, kind } = candidate.payload
  const draft = context.generationDraft
  const acceptedAt = layer.generationProvenance.executionResultContext.acceptedAt
  assert.equal(new Date(acceptedAt).toISOString(), acceptedAt)
  const expected = {
    executionResultContext: {
      acceptedAt,
      candidateId: candidate.candidateId,
      completedAt: candidate.completedAt,
      output: {
        ...candidate.image,
        colorSpace: 'srgb',
        contributionAlpha8: {
          byteSize: alpha.length,
          height: candidate.bbox.height,
          sha256: digest(alpha),
          width: candidate.bbox.width,
        },
        format: 'png',
        outputMode: 'contribution',
      },
      queueItemId: candidate.queueItemId,
    },
    generationConfiguration: {
      cfgRescale: 0,
      loras: [],
      mode,
      model: { ...draft.model, predictionType: 'v_prediction' },
      negativePrompt: { embeddingRefs: [], text: item.item.prompts.negative },
      positivePrompt: { embeddingRefs: [], text: item.item.prompts.positive },
      sampling: {
        actualSeed: candidate.actualSeed,
        denoisingStrength: 0.5,
        requestedSeedPolicy: 'fixed',
        cfgScale: 4,
        invokeScheduler: 'euler',
        noiseProfile: item.inference.sampling.noiseProfile,
        sampler: 'Euler',
        scheduler: 'Normal',
        steps: 3,
      },
      vae: draft.vae,
      vaePrecision: 'Auto',
    },
    kind,
    layerSourceContext: {
      bbox: context.bbox,
      coherenceSettings: context.coherenceSettings,
      generationDraft: draft,
      internalResolution: context.internalResolution,
      layerId: context.layerId,
      mask: context.mask,
      maskBlur: context.maskSettings.blur,
      preparedInputs: {
        finalContributionMask: files['final-contribution-mask.png'],
        latentKeepMask: files['latent-keep-mask.png'],
        modelSource: files['model-source.png'],
      },
      sourceDocumentId: context.documentId,
      sourceDocumentRevision: context.documentRevision,
      sourceLayerIds: context.sourceLayerIds,
      sourceTarget: files['source.png'],
    },
    schemaVersion: 1,
  }
  assert.deepEqual(
    layer.generationProvenance,
    expected,
    'Frozen Smart provenance must remain Smart provenance on the Raster',
  )
  assert.deepEqual(layer.transform, {
    rotationDegrees: 0,
    scaleX: 1,
    scaleY: 1,
    x: frozenRect.x,
    y: frozenRect.y,
  })
  assert.equal(layer.asset.width, frozenRect.width)
  assert.equal(layer.asset.height, frozenRect.height)
  assert.equal(layer.asset.sha256, digest(fixture.bytes))
  assert.equal(layer.kind, 'raster')
  assert.equal(layer.visible, true)
  assert.equal(layer.opacity, 1)
  assert.equal(layer.blendMode, 'normal')
  return expected
}
async function fetchBytes(url) {
  const result = await application.evaluate(async ({ net }, url) => {
    const response = await net.fetch(url)
    return { status: response.status, bytes: [...new Uint8Array(await response.arrayBuffer())] }
  }, url)
  assert.equal(result.status, 200)
  return Buffer.from(result.bytes)
}
async function assertNeighbors(reference) {
  const snapshot = await results()
  assert.deepEqual(
    snapshot.candidates.filter(
      ({ candidateId }) => candidateId === smartNeighbor.candidate.candidateId,
    ),
    reference.smart,
  )
  assert.deepEqual((await ordinaryResults()).candidates, reference.ordinary)
  const originalIds = new Set([
    smartNeighbor.candidate.queueItemId,
    normalNeighbor.candidate.queueItemId,
  ])
  assert.deepEqual(
    (await rows('generation_queue_item')).filter(({ id }) => originalIds.has(id)),
    reference.queue,
  )
  assert.deepEqual(
    (await rows('generation_candidate_receipt')).filter(({ queue_item_id }) =>
      originalIds.has(queue_item_id),
    ),
    reference.receipts,
  )
  assert.ok(
    (
      await fetchBytes(
        snapshot.candidates.find(
          ({ candidateId }) => candidateId === smartNeighbor.candidate.candidateId,
        ).imageUrl,
      )
    ).equals(smartNeighbor.bytes),
  )
  assert.ok(
    (await fetchBytes((await ordinaryResults()).candidates[0].imageUrl)).equals(
      normalNeighbor.bytes,
    ),
  )
}
async function canvasAlphaSamples(fixture, label) {
  await canvas().getByRole('button', { name: 'Fit View', exact: true }).click()
  const alpha = [0, 64, 128, 192, 255]
  for (let stripe = 0; stripe < 5; stripe++) {
    const point = {
      x: frozenRect.x + Math.floor(((stripe + 0.5) * frozenRect.width) / 5),
      y: frozenRect.y + Math.floor(frozenRect.height / 2),
    }
    const expected = fixture.color.map((channel, index) =>
      Math.round((channel * alpha[stripe]) / 255 + lowerColor[index] * (1 - alpha[stripe] / 255)),
    )
    let actual
    await expect
      .poll(async () => {
        actual = await canvas()
          .locator('.canvas-area')
          .evaluate((host, point) => {
            const bitmap = host.querySelector('.konvajs-content canvas')
            if (!(bitmap instanceof HTMLCanvasElement))
              throw new Error('Actual Konva Canvas missing')
            const rect = bitmap.getBoundingClientRect()
            const scale = Number(host.dataset.cameraScale)
            const x = ((Number(host.dataset.cameraX) + point.x * scale) * bitmap.width) / rect.width
            const y =
              ((Number(host.dataset.cameraY) + point.y * scale) * bitmap.height) / rect.height
            if (x < 0 || y < 0 || x >= bitmap.width || y >= bitmap.height)
              throw new Error('Frozen sample outside visible Canvas')
            return {
              point,
              rgba: [
                ...bitmap.getContext('2d').getImageData(Math.floor(x), Math.floor(y), 1, 1).data,
              ],
            }
          }, point)
        return (
          actual.rgba[3] === 255 &&
          expected.every((channel, index) => Math.abs(actual.rgba[index] - channel) <= 2)
        )
      })
      .toBe(true)
    report.canvasPixels.push({
      label,
      stripe,
      alpha: alpha[stripe],
      expected: [...expected, 255],
      ...actual,
    })
  }
  checkpoint()
}
async function closeProject() {
  if (!window || window.isClosed()) return
  await window.keyboard.press('Escape')
  const tab = window.getByRole('tab', { name: title, exact: true })
  if (!(await tab.count())) return
  await window.getByRole('button', { name: `Close ${title}`, exact: true }).click()
  const dialog = window.getByRole('dialog', { name: 'Close Project', exact: true })
  await expect
    .poll(async () =>
      (await tab.count()) === 0 ? 'closed' : (await dialog.isVisible()) ? 'decision' : 'waiting',
    )
    .not.toBe('waiting')
  if (await dialog.isVisible()) {
    const discard = dialog.getByRole('button', { name: 'Discard Changes', exact: true })
    if (await discard.count()) await discard.click()
    else
      await dialog
        .getByRole('button', {
          name: /^(Discard Candidates and Close|Cancel Jobs and Close|Close and Keep Recovery)$/,
        })
        .click()
  }
  await expect(tab).toHaveCount(0)
}
async function closeNative(label, crash = false) {
  if (!application) return
  let boundError
  try {
    await bounds(`${label}-before-exit`)
  } catch (error) {
    boundError = error
  }
  clearInterval(sampler)
  await sampling
  sampleDescendants()
  report.ipcCalls.push(...(await ipcCalls()))
  for (const value of observed.values())
    nativeChecks.push({ processIdentities: [value], groups: [] })
  const child = nativeProcess
  const native = application
  let timer
  const exitPromise = new Promise((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal })),
  )
  try {
    if (crash) assert.equal(child.kill('SIGKILL'), true)
    else
      await Promise.race([
        native.close(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Native close exceeded10s')), 10_000)
        }),
      ])
  } catch (error) {
    const latest = nativeChecks.findLast((value) => value.nativeIdentity)
    const owned = latest?.groups.find(
      ({ ownedScope, pids }) => ownedScope && pids.includes(child.pid),
    )
    if (!owned) throw error
    report.forcedFailureCleanup = await stopExpiredQualificationProcess({
      ...latest.nativeIdentity,
      group: owned.group,
    })
    report.closeUiError = String(error)
  } finally {
    clearTimeout(timer)
  }
  const exit = await confirmQualificationProcessExit(nativeChecks)
  assert.equal(exit.confirmed, true)
  const actualExit =
    child.exitCode !== null || child.signalCode !== null
      ? { code: child.exitCode, signal: child.signalCode }
      : await exitPromise
  report.nativeClosures.push({ label, intentionalCrash: crash, ...exit, ...actualExit })
  // Exit evidence remains in nativeClosures/resourceLimitChecks. Do not ask a later restart
  // to stop an already-released transient KDE timer a second time.
  nativeChecks.length = 0
  application = null
  window = null
  checkpoint()
  if (crash) assert.equal(actualExit.signal, 'SIGKILL')
  else {
    assert.equal(actualExit.code, 0, 'Unexpected forced exit fails qualification')
    assert.equal(actualExit.signal, null)
  }
  if (boundError) throw boundError
}

try {
  report.launcher = await verifyLauncherDeadline()
  const inventory = await Promise.all([
    nativeExec('du', ['-sk', artifactRoot], { timeout: 15_000, maxBuffer: 16 * 1024 }),
    nativeExec('df', ['-Pk', artifactRoot], { timeout: 10_000, maxBuffer: 16 * 1024 }),
    nativeExec('git', ['rev-parse', 'HEAD'], { timeout: 10_000, maxBuffer: 16 * 1024 }),
    nativeExec('git', ['status', '--short'], { timeout: 10_000, maxBuffer: 32 * 1024 }),
  ])
  report.inventory = {
    diskUsage: inventory[0].stdout.trim(),
    filesystem: inventory[1].stdout.trim(),
    revision: inventory[2].stdout.trim(),
    workingTree: inventory[3].stdout,
  }
  report.sourceSha256 = hashes(sourceFiles)
  report.bundleSha256 = hashes(bundleFiles)
  assert.ok(
    readFileSync('dist/main/main.cjs', 'utf8').includes(conversionChannel),
    'Fresh built Main conversion handler required',
  )
  await prepare()
  await launch()
  await expect.poll(async () => (await results()).candidates.length).toBe(4)
  initialTab = await current()
  assert.equal(initialTab.dirty, false)
  assert.equal(initialTab.canUndo, false)
  assert.equal(initialTab.canRedo, false)
  assert.equal(initialTab.layers.length, 2)
  assert.deepEqual(initialTab.primaryBbox, savedBaseline.primaryBbox)
  const recovered = await results()
  assert.equal(recovered.recoveryUnavailable, false)
  for (const fixture of targetCandidates) {
    const candidate = recovered.candidates.find(
      ({ candidateId }) => candidateId === fixture.candidate.candidateId,
    )
    assert.equal(candidate.disposition, 'orphaned')
    assert.equal(candidate.rasterConversionUnavailableReason, null)
    assert.deepEqual(candidate.bbox, frozenRect)
    assertPixels(await fetchBytes(candidate.imageUrl), fixture)
  }
  assert.equal(digest(readFileSync(packagePath)), report.fixture.orphanPackageSha256)
  await chooseTarget('Missing Smart Patch')
  await expect(tray().getByText(/Orphaned result/)).toBeVisible()
  await expect(tray().getByRole('button', { name: /^Add \d+ as Variants?$/ })).toBeDisabled()
  await screenshot('01-recovered-orphan-before-add')
  check(
    'Actual saved-project open recovers exact orphan world PNGs and frozen non-eight geometry with Add as Variant disabled and no auto Add or Save',
  )

  // Keep the reconciled fixture queue instance from before startup. Do not run restart recovery
  // against a live app. Direct enqueue/cancel/Retry are declared unfinished-sibling setup only.
  const pendingMaterial = {
    manifest: structuredClone(targetMaterial.manifest),
    files: Object.fromEntries(
      Object.entries(targetMaterial.files).map(([name, bytes]) => [name, Buffer.from(bytes)]),
    ),
  }
  pendingMaterial.manifest.items = [pendingMaterial.manifest.items[0]]
  ;[pendingSibling] = await enqueueSmart(pendingMaterial, targetSessionId)
  assert.equal(pendingSibling.status, 'pending')
  // Retry creates a new session without any completed candidate. Its unfinished job must join
  // the target-wide reviewed cancellation set even though candidate discovery cannot name it.
  const retrySourceSessionId = randomUUID()
  const [retrySourcePending] = await enqueueSmart(pendingMaterial, retrySourceSessionId)
  const retrySource = await fixtureQueue.cancel(
    retrySourcePending.id,
    retrySourcePending.statusSequence,
  )
  assert.equal(retrySource.status, 'canceled')
  assert.equal(existsSync(modelPath), false)
  writeFileSync(modelPath, modelBytes, { flag: 'wx', mode: 0o600 })
  try {
    freshRetrySibling = await fixtureQueue.retryPreparedSmartPatchTerminal(
      retrySource.id,
      retrySource.statusSequence,
      { assertCurrent: () => undefined, modelService: models },
    )
  } finally {
    rmSync(modelPath)
  }
  assert.equal(freshRetrySibling.status, 'pending')
  assert.notEqual(freshRetrySibling.id, retrySource.id)
  assert.notEqual(freshRetrySibling.stagingSessionId, retrySourceSessionId)
  assert.notEqual(freshRetrySibling.stagingSessionId, targetSessionId)
  const retrySourceWitness = (await rows('generation_queue_item')).find(
    ({ id }) => id === retrySource.id,
  )
  assert.equal(retrySourceWitness.status, 'canceled')
  assert.equal(retrySourceWitness.status_sequence, retrySource.statusSequence + 1)
  assert.deepEqual(
    (await rows('generation_candidate_receipt')).filter(
      ({ staging_session_id }) => staging_session_id === freshRetrySibling.stagingSessionId,
    ),
    [],
  )
  report.pendingFixture = {
    sameSessionJob: pendingSibling,
    canceledRetrySource: retrySourceWitness,
    freshSessionJob: freshRetrySibling,
    freshSessionHasCompletedCandidate: false,
    precondition:
      'Production queue enqueue/cancel/retryPreparedSmartPatchTerminal; no inference or worker.',
  }
  await tray().getByRole('button', { name: 'Refresh Smart Patch results', exact: true }).click()
  await expect
    .poll(async () =>
      (await results()).targets
        .find(({ layerId }) => layerId === patchId)
        .unfinishedJobIds.slice()
        .sort(),
    )
    .toEqual([pendingSibling.id, freshRetrySibling.id].sort())
  const readySnapshot = await results()
  assert.equal(
    readySnapshot.candidates.some(
      ({ stagingSessionId }) => stagingSessionId === freshRetrySibling.stagingSessionId,
    ),
    false,
    'The fresh Retry session must have no completed candidate to exercise job-only scope capture',
  )
  assert.equal(existsSync(modelPath), false)
  const chosen = targetCandidates[1]
  const request = requestFor(readySnapshot, chosen.candidate.candidateId)
  await refuse(
    { ...request, documentRevision: randomUUID() },
    'Stale reviewed document refuses before cancellation or mutation',
  )
  await refuse(
    { ...request, expectedAvailableIds: request.expectedAvailableIds.slice(1) },
    'Stale reviewed available set refuses with exact staging queue shadow and saved-file preservation',
  )
  await refuse(
    {
      ...request,
      candidateIds: [smartNeighbor.candidate.candidateId],
      expectedAvailableIds: [...request.expectedAvailableIds, smartNeighbor.candidate.candidateId],
      focusedCandidateId: smartNeighbor.candidate.candidateId,
    },
    'Other-Patch selected candidate refuses without crossing its target boundary',
  )

  const ids = new Set([smartNeighbor.candidate.queueItemId, normalNeighbor.candidate.queueItemId])
  const neighbors = {
    smart: readySnapshot.candidates.filter(
      ({ candidateId }) => candidateId === smartNeighbor.candidate.candidateId,
    ),
    ordinary: (await ordinaryResults()).candidates,
    queue: (await rows('generation_queue_item')).filter(({ id }) => ids.has(id)),
    receipts: (await rows('generation_candidate_receipt')).filter(({ queue_item_id }) =>
      ids.has(queue_item_id),
    ),
  }
  await setNativeSize(1440, 900, 'default-before-review')
  const beforeCancel = await witness()
  const callsBeforeCancel = (await ipcCalls()).filter(
    ({ channel }) => channel === conversionChannel,
  ).length
  await openConversion(chosen.candidate.candidateId, '02-orphan-secondary-menu', 'default-1440x900')
  await expect(confirmation()).toContainText(/discards\s+2\s+unchecked results/)
  await expect(confirmation()).toContainText(/cancels\s+2\s+unfinished jobs/)
  await expect(confirmation()).toContainText(
    'Other Smart Patches and Project Canvas results are kept.',
  )
  await screenshot('03-reviewed-discard-and-cancel-confirmation')
  await confirmation().getByRole('button', { name: 'Keep results', exact: true }).click()
  await expect(confirmation()).toHaveCount(0)
  assert.deepEqual(await witness(), beforeCancel)
  assert.equal(
    (await ipcCalls()).filter(({ channel }) => channel === conversionChannel).length,
    callsBeforeCancel,
  )
  await screenshot('04-confirmation-canceled-results-retained')
  check(
    'Real secondary menu opens exact single-candidate review; Keep results preserves all candidates pending work history shadow and saved bytes without calling conversion IPC',
  )

  const beforeMinimumReview = await witness()
  const callsBeforeMinimumReview = (await ipcCalls()).filter(
    ({ channel }) => channel === conversionChannel,
  ).length
  await setNativeSize(900, 620, 'minimum-before-review')
  await openConversion(
    chosen.candidate.candidateId,
    '04a-minimum-900x620-orphan-menu',
    'minimum-900x620',
  )
  await expect(confirmation()).toContainText(/discards\s+2\s+unchecked results/)
  await expect(confirmation()).toContainText(/cancels\s+2\s+unfinished jobs/)
  const minimumScale = Number(
    await canvas().locator('.canvas-area').getAttribute('data-camera-scale'),
  )
  report.minimumPreview = {
    cameraScale: minimumScale,
    worldWidth: frozenRect.width,
    worldHeight: frozenRect.height,
    displayedWidth: minimumScale * frozenRect.width,
    displayedHeight: minimumScale * frozenRect.height,
  }
  assert.ok(report.minimumPreview.displayedWidth >= 32)
  assert.ok(report.minimumPreview.displayedHeight >= 32)
  await screenshot('04b-minimum-900x620-review-dialog')
  await confirmation().getByRole('button', { name: 'Keep results', exact: true }).click()
  await expect(confirmation()).toHaveCount(0)
  assert.deepEqual(await witness(), beforeMinimumReview)
  assert.equal(
    (await ipcCalls()).filter(({ channel }) => channel === conversionChannel).length,
    callsBeforeMinimumReview,
  )
  await setNativeSize(1440, 900, 'default-restored-before-explicit-add')
  check(
    'Actual 900x620 minimum native window and 1440x900 default retain unclipped orphan menu/review text and reachable controls; Keep results preserves both pending jobs and default size is restored',
  )

  await assertNoRuntime('immediately-before-conversion')
  await openConversion(chosen.candidate.candidateId)
  await retainEvidenceCheckpoint('before-confirmed-add', { staging: true })
  await confirmation().getByRole('button', { name: 'Add as Raster Layer', exact: true }).click()
  await expect(confirmation()).toHaveCount(0)
  await expect.poll(async () => (await current()).layers.length).toBe(3)
  const added = await current()
  assert.equal(added.dirty, true)
  assert.equal(added.canUndo, true)
  assert.equal(added.canRedo, false)
  const previousIds = new Set(initialTab.layers.map(({ id }) => id))
  const newLayers = added.layers.filter(({ id }) => !previousIds.has(id))
  assert.equal(newLayers.length, 1)
  acceptedLayerId = newLayers[0].id
  assert.deepEqual(
    semanticLayers(added.layers.filter(({ id }) => previousIds.has(id))),
    semanticLayers(initialTab.layers),
  )
  assert.deepEqual(added.generationDraft, initialTab.generationDraft)
  assert.deepEqual(added.primaryBbox, initialTab.primaryBbox)
  const shadow = await waitShadow(acceptedLayerId)
  adoptedDocument = shadow.document
  const raster = shadow.document.layers.find(({ id }) => id === acceptedLayerId)
  acceptedProvenance = assertFrozenProvenance(raster, chosen)
  assertPixels(readFileSync(path.join(shadow.directory, raster.asset.path)), chosen)
  assert.deepEqual(
    shadow.document.layers.filter(({ id }) => id !== acceptedLayerId),
    savedBaseline.layers,
  )
  const successCalls = (await ipcCalls()).filter(
    ({ channel, ok }) => channel === conversionChannel && ok === true,
  )
  assert.equal(successCalls.length, 1)
  assert.deepEqual(successCalls[0].args, [projectId, request])
  const queueAfterAdd = await rows('generation_queue_item')
  for (const sibling of [pendingSibling, freshRetrySibling]) {
    const row = queueAfterAdd.find(({ id }) => id === sibling.id)
    assert.equal(row.status, 'canceled')
    assert.equal(row.error_code, 'USER_CANCELED')
    assert.equal(row.status_sequence, sibling.statusSequence + 1)
  }
  assert.deepEqual(
    queueAfterAdd.find(({ id }) => id === retrySource.id),
    retrySourceWitness,
    'Acceptance must retain the consumed terminal Retry source unchanged',
  )
  assert.equal(
    (await results()).targets.some(
      ({ layerId, unfinishedJobIds }) => layerId === patchId && unfinishedJobIds.length > 0,
    ),
    false,
  )
  report.pendingFixture.canceledAfterExplicitAdd = queueAfterAdd.filter(
    ({ id }) => id === pendingSibling.id || id === freshRetrySibling.id,
  )
  assert.deepEqual(
    (await results()).candidates.map(({ candidateId }) => candidateId),
    [smartNeighbor.candidate.candidateId],
  )
  assert.equal(
    (await rows('generation_staging_discarded_session')).some(
      ({ staging_session_id }) => staging_session_id === targetSessionId,
    ),
    true,
  )
  assert.deepEqual(await rows('generation_acceptance_journal'), [])
  assert.deepEqual(await rows('project_accepted_result_index'), [])
  assert.equal(digest(readFileSync(packagePath)), report.fixture.orphanPackageSha256)
  assert.equal((await ipcCalls()).filter(({ channel }) => channel === 'projects:save').length, 0)
  await assertNeighbors(neighbors)
  assertPixels(await fetchBytes(newLayers[0].imageUrl), chosen)
  const hidePreview = tray().getByRole('button', { name: 'Hide Smart Patch preview', exact: true })
  if (await hidePreview.isVisible()) await hidePreview.click()
  await canvasAlphaSamples(chosen, 'accepted-raster')
  await screenshot('05-explicit-raster-add-before-save')
  report.accepted = {
    layerId: acceptedLayerId,
    provenance: acceptedProvenance,
    shadowDocument: adoptedDocument,
    pixels: assertPixels(chosen.bytes, chosen),
  }
  check(
    'Actual menu confirmation calls real Main once: one durable Raster preserves world RGBA alpha frozen bbox and Smart provenance; both existing-session and candidate-free fresh-Retry-session jobs cancel with target-local unselected disposal and no implicit Save',
  )

  assert.equal(newLayers[0].generationSettingsUnavailableReason, undefined)
  assert.equal(newLayers[0].resultComparisonSourceKind, 'smart-patch')
  assert.equal(newLayers[0].resultPresetSourceKind, 'smart-patch')
  const beforeUnsupportedRead = await witness()
  for (const method of ['getRasterGenerationData', 'getRasterPresetData']) {
    const unsupported = await rawApi(method, projectId, added.documentId, acceptedLayerId)
    assert.equal(unsupported.ok, false)
    assert.equal(unsupported.error.code, 'PROJECT_COMPARISON_UNSUPPORTED')
    assert.match(unsupported.error.message, /Smart Patch.*Compare\./)
  }
  assert.deepEqual(await witness(), beforeUnsupportedRead)
  const presetSource = await rawApi('getSmartResultPresetData', projectId, {
    assetSha256: raster.asset.sha256,
    documentId: added.documentId,
    documentRevision: added.documentRevision,
    owner: { kind: 'raster', layerId: acceptedLayerId },
  })
  assert.equal(presetSource.ok, true)
  assert.equal(presetSource.value.workflow, 'smartPatch')
  assert.equal(Object.hasOwn(presetSource.value.payload, 'size'), false)
  assert.equal(Object.hasOwn(presetSource.value.payload, 'seed'), false)
  assert.deepEqual(await witness(), beforeUnsupportedRead)
  const comparisonSource = await rawApi('getSmartResultComparisonData', projectId, {
    assetSha256: raster.asset.sha256,
    documentId: added.documentId,
    documentRevision: added.documentRevision,
    owner: { kind: 'raster', layerId: acceptedLayerId },
  })
  assert.equal(comparisonSource.ok, true)
  assert.deepEqual(
    comparisonSource.value.generationConfiguration,
    raster.generationProvenance.generationConfiguration,
  )
  assert.equal(Object.hasOwn(comparisonSource.value.generationConfiguration, 'size'), false)
  assert.deepEqual(await witness(), beforeUnsupportedRead)
  check(
    'Converted Raster has independent Smart comparison and preset reads; ordinary readers stay isolated, neither dedicated source read mutates the result or invents Size',
  )
  await setNativeSize(900, 620, 'minimum-accepted-raster-actions')
  const rasterActions = window.getByRole('button', {
    name: `Layer actions for ${newLayers[0].name}`,
    exact: true,
  })
  await rasterActions.click({ trial: true })
  await rasterActions.click()
  const compareItem = window.getByRole('menuitem', {
    name: 'Compare generation settings',
    exact: true,
  })
  const presetItem = window.getByRole('menuitem', {
    name: 'Save Preset from Result',
    exact: true,
  })
  await expect(compareItem).toBeVisible()
  await expect(compareItem).toHaveAttribute('aria-disabled', 'false')
  await expect(presetItem).toBeVisible()
  assert.notEqual(await presetItem.getAttribute('aria-disabled'), 'true')
  const rasterMenu = window.getByRole('menu').filter({ has: compareItem })
  await screenshot('05a-minimum-900x620-accepted-raster-result-actions')
  await assertUnclippedContent(rasterMenu, 'minimum-900x620-accepted-raster-result-actions')
  await window.keyboard.press('Escape')
  await expect(rasterMenu).toBeHidden()
  await setNativeSize(1440, 900, 'default-restored-after-accepted-raster-actions')
  assert.deepEqual(await witness(), beforeUnsupportedRead)
  check(
    'Actual accepted Raster row menu at900x620 exposes disabled Compare with its full reason and enabled Save Preset from Result unclipped, without changing state; default native size restored',
  )

  await refuse(
    request,
    'Duplicate completed conversion review refuses with no second layer or durable change',
  )
  await canvas().getByRole('button', { name: 'Undo', exact: true }).click()
  await expect
    .poll(async () => (await current()).layers.map(({ id }) => id))
    .toEqual(initialTab.layers.map(({ id }) => id))
  const undone = await current()
  assert.deepEqual(semanticLayers(undone.layers), semanticLayers(initialTab.layers))
  assert.equal(undone.canUndo, false)
  assert.equal(undone.canRedo, true)
  assert.equal(undone.dirty, false)
  assert.deepEqual(
    (await results()).candidates.map(({ candidateId }) => candidateId),
    [smartNeighbor.candidate.candidateId],
  )
  await screenshot('06-one-undo-removes-raster-without-recreating-staging')
  await canvas().getByRole('button', { name: 'Redo', exact: true }).click()
  await expect
    .poll(async () => (await current()).layers.some(({ id }) => id === acceptedLayerId))
    .toBe(true)
  const redoneShadow = await waitShadow(acceptedLayerId)
  const redone = redoneShadow.document.layers.find(({ id }) => id === acceptedLayerId)
  assert.deepEqual(redone, raster)
  assert.deepEqual(redone.generationProvenance, acceptedProvenance)
  assertPixels(readFileSync(path.join(redoneShadow.directory, redone.asset.path)), chosen)
  assert.equal(digest(readFileSync(packagePath)), report.fixture.orphanPackageSha256)
  await assertNeighbors(neighbors)
  await canvasAlphaSamples(chosen, 'redone-raster')
  await screenshot('07-one-redo-restores-exact-raster')
  check(
    'Exactly one Undo/Redo owns conversion, preserves unrelated layers and exact durable asset/provenance, and never recreates disposed candidates or saves the package',
  )

  // The shadow manifest/revision and original .igs hash above are the durable crash precondition.
  await retainEvidenceCheckpoint('unsaved-before-crash', { shadow: redoneShadow })
  await closeNative('deliberate-unsaved-recovery-crash', true)
  await launch(true)
  const recoveredTab = await current()
  assert.equal(recoveredTab.dirty, true)
  assert.equal(recoveredTab.layers.length, 3)
  const recoveredRaster = recoveredTab.layers.find(({ id }) => id === acceptedLayerId)
  assert.ok(recoveredRaster)
  assertPixels(await fetchBytes(recoveredRaster.imageUrl), chosen)
  const recoveredShadow = await waitShadow(acceptedLayerId)
  assert.deepEqual(
    recoveredShadow.document.layers.find(({ id }) => id === acceptedLayerId),
    raster,
  )
  assert.equal(digest(readFileSync(packagePath)), report.fixture.orphanPackageSha256)
  assert.deepEqual(
    (await results()).candidates.map(({ candidateId }) => candidateId),
    [smartNeighbor.candidate.candidateId],
  )
  assert.equal(
    (await ordinaryResults()).candidates[0].candidateId,
    normalNeighbor.candidate.candidateId,
  )
  await canvasAlphaSamples(chosen, 'recovered-raster')
  await screenshot('09-shadow-recovered-raster-still-unsaved')
  await retainEvidenceCheckpoint('after-shadow-recovery', { shadow: recoveredShadow })
  check(
    'Intentional native crash has physical-exit proof; actual recovery restores the unsaved Raster shadow and exact PNG/provenance without changing original .igs or adopting neighbor candidates',
  )

  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await current()).dirty).toBe(false)
  await expect(window.locator('.document-state')).toHaveText('Saved')
  const saved = await readIgsPackage(packagePath)
  const savedRaster = saved.project.layers.find(({ id }) => id === acceptedLayerId)
  assert.deepEqual(savedRaster, raster)
  assertPixels(await saved.readMember(savedRaster.asset.path), chosen)
  assert.deepEqual(
    saved.project.layers.filter(({ id }) => id !== acceptedLayerId),
    savedBaseline.layers,
  )
  assert.deepEqual(saved.project.generationDraft, savedBaseline.generationDraft)
  assert.deepEqual(saved.project.primaryBbox, savedBaseline.primaryBbox)
  const index = await rows('project_accepted_result_index')
  assert.equal(index.length, 1)
  assert.equal(index[0].layer_id, acceptedLayerId)
  assert.equal(index[0].asset_sha256, digest(chosen.bytes))
  assert.equal(index[0].asset_width, frozenRect.width)
  assert.equal(index[0].asset_height, frozenRect.height)
  assert.equal(index[0].actual_seed, chosen.candidate.actualSeed)
  assert.deepEqual(await rows('generation_acceptance_journal'), [])
  const exportCopy = path.join(evidenceRoot, 'accepted-explicitly-saved.igs')
  writeFileSync(exportCopy, readFileSync(packagePath), { flag: 'wx', mode: 0o600 })
  report.saved = {
    packageSha256: digest(readFileSync(packagePath)),
    evidencePackage: exportCopy,
    document: saved.project,
    index,
  }
  await retainEvidenceCheckpoint('after-explicit-save')
  await assertNoRuntime('after-explicit-save')
  await screenshot('10-explicit-save-verified-by-real-loader')
  check(
    'Explicit native Save commits exact original PNG and Smart provenance to .igs and saved SQLite projection through the real writer/loader, without runtime or current resources',
  )
  await closeProject()
  await window.getByRole('button', { name: `Open ${title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: title, exact: true })).toBeVisible()
  const reopened = await current()
  assert.equal(reopened.dirty, false)
  assert.equal(reopened.canUndo, false)
  const portableRaster = reopened.layers.find(({ id }) => id === acceptedLayerId)
  assert.ok(portableRaster)
  assertPixels(await fetchBytes(portableRaster.imageUrl), chosen)
  assert.deepEqual(
    (await readIgsPackage(packagePath)).project.layers.find(({ id }) => id === acceptedLayerId)
      .generationProvenance,
    acceptedProvenance,
  )
  await canvasAlphaSamples(chosen, 'saved-reopened-raster')
  await screenshot('11-saved-native-reopen')
  await assertNoRuntime('saved-native-reopen')
  check(
    'Native close/reopen reads the saved ordinary Raster at original world contribution pixels and geometry with unchanged Smart provenance and clean history',
  )
  assert.deepEqual(report.pageErrors, [])
  assert.equal(report.samplerError, undefined)
  assert.deepEqual(
    hashes(sourceFiles),
    report.sourceSha256,
    'Source changed during native qualification',
  )
  assert.deepEqual(
    hashes(bundleFiles),
    report.bundleSha256,
    'Bundle changed during native qualification',
  )
  verifyRetainedSnapshots()
  await closeProject()
  await closeNative('completed-orphan-raster-qualification')
  report.outcome = 'passed'
} catch (error) {
  report.outcome = 'failed'
  report.error = { name: error.name, message: error.message, stack: error.stack }
  if (window && !window.isClosed()) {
    try {
      report.failureWitness = await witness()
    } catch (diagnosticError) {
      report.diagnosticError = String(diagnosticError)
    }
    await screenshot('failure-before-cleanup').catch(() => undefined)
  }
  process.exitCode = 1
} finally {
  if (application) {
    try {
      await closeProject()
    } catch (error) {
      report.uiCleanupError = String(error)
    }
    try {
      await closeNative('failure-cleanup')
    } catch (error) {
      report.cleanupError = String(error)
      report.outcome = 'failed'
      process.exitCode = 1
    }
  }
  clearInterval(sampler)
  await sampling
  if (database) await database.close()
  report.observedProcesses = [...observed.values()].map((value) => ({
    ...value,
    physicalExit: physicallyExited(value),
  }))
  report.completedAt = new Date().toISOString()
  report.checkCount = report.checks.length
  report.cleanup = {
    owner: 'root',
    payloads: [fixtureRoot],
    removedByRunner: [],
    physicalExitConfirmed:
      !report.nativeLaunchError &&
      !report.cleanupError &&
      !application &&
      report.nativeClosures.length > 0 &&
      report.observedProcesses.every(({ physicalExit }) => physicalExit),
    resourceRestorationConfirmed: !existsSync(modelPath),
  }
  if (!report.cleanup.physicalExitConfirmed || !report.cleanup.resourceRestorationConfirmed) {
    report.outcome = 'failed'
    process.exitCode = 1
  }
  lifecycle.state = 'retained'
  checkpoint()
  console.log(
    JSON.stringify({
      outcome: report.outcome,
      checkCount: report.checkCount,
      reportFile,
      payloads: report.payloads,
    }),
  )
}
