/**
 * Finite native accepted-history qualification, after root's fresh app:build: pnpm exec tsx
 * scripts/smoke-smart-patch-history.mjs --report-file ABSOLUTE_NEW_REPORT
 *
 * Root owns runs/smart-patch-variant-history/20261022-navigation and serial execution. Require a
 * <=2 GiB / zero-swap launcher service, RuntimeMaxSec<=600, TimeoutStopSec<=90,
 * KillMode=control-group. KDE native scopes get independent <=2 GiB / zero-swap limits and an owned
 * 360-second full / 240-second focused timer via the existing helper. Full R7 measured 12 checks at
 * 240 seconds; full mode needs a finite extra allowance for the new cross-project witnesses. Add
 * --scenario cross-project for only the focused settled-draft navigation regression. Literal
 * accepted portable variants are an explicitly declared precondition: real
 * ProjectSession/ShadowStore, ICC PNGs, .igs, SQLite, IPC and built native UI; no queue/staging
 * simulation, runtime, catalog installation or inference. Runner retains payloads INSIDE
 * evidenceRoot. Root cleans after physical exit.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  copyFileSync,
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
import Database from 'better-sqlite3'

import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { ProjectSession } from '../src/main/projects/project-session.ts'
import { ProjectShadowStore } from '../src/main/projects/project-shadow.ts'
import { acceptedRasterProvenanceFixture } from '../src/main/projects/test-fixtures/accepted-provenance.ts'
import { literalSmartPatchColorPng } from '../src/main/projects/test-fixtures/smart-patch-input-material.ts'
import { smartPatchVariantMetadataFixture } from '../src/main/projects/test-fixtures/smart-patch-variant.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
  stopExpiredQualificationProcess,
} from './qualification-resource-limits.mjs'

assert.ok(
  [4, 6].includes(process.argv.length),
  'Use --report-file ABSOLUTE_NEW_REPORT [--scenario cross-project]',
)
assert.equal(process.argv[2], '--report-file')
if (process.argv.length === 6) {
  assert.equal(process.argv[4], '--scenario')
  assert.equal(process.argv[5], 'cross-project')
}
const scenario = process.argv.length === 6 ? 'cross-project' : 'full'
const nativeDeadlineSeconds = scenario === 'full' ? 360 : 240
const root = realpathSync(process.cwd())
const reportFile = process.argv[3]
assert.ok(path.isAbsolute(reportFile) && path.resolve(reportFile) === reportFile)
assert.equal(existsSync(reportFile), false, 'Never overwrite an earlier report')
const evidenceParent = path.dirname(reportFile)
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const ownedRun = path.join(artifactRoot, 'runs/smart-patch-variant-history/20261022-navigation')
const relative = path.relative(ownedRun, evidenceParent)
assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative))
assert.equal(realpathSync(evidenceParent), evidenceParent, 'Existing canonical parent required')
assert.ok(lstatSync(evidenceParent).isDirectory())
const evidenceRoot = path.join(evidenceParent, `${path.basename(reportFile)}.artifacts`)
assert.equal(existsSync(evidenceRoot), false)
mkdirSync(evidenceRoot, { mode: 0o700 })
const fixtureRoot = mkdtempSync(path.join(evidenceRoot, 'history-payload-'))
const appDataRoot = path.join(fixtureRoot, 'data/imagegen-studio')
const workspace = path.join(appDataRoot, 'workspaces/Uncategorized')
mkdirSync(workspace, { recursive: true, mode: 0o700 })
const nativeExec = promisify(execFile)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const lifecycleFile = path.join(evidenceRoot, 'artifact-lifecycle.json')
const roots = {
  placeholdersDir: path.join(root, 'dist/main/placeholders'),
  scratchDir: path.join(fixtureRoot, 'writer-scratch'),
}
const nativeChecks = []
const observed = new Map()
let application, window, nativeProcess, sampler, original, portable
let sampling = Promise.resolve()
const report = {
  schemaVersion: 1,
  outcome: 'running',
  scenario,
  qualificationScope:
    scenario === 'full'
      ? 'Full declared history matrix; a passing outcome requires every full-path check and healthy physical exit'
      : 'Focused cross-project settled-draft regression only; this is not a full history qualification',
  nativeDeadlineSeconds,
  nativeDeadlineReason:
    scenario === 'full'
      ? 'Root measured 12 R7 checks consuming the previous 240-second native deadline; 360 seconds gives finite room for final controls and new paired cross-project witnesses'
      : 'Focused regression retains the existing finite 240-second native deadline',
  startedAt: new Date().toISOString(),
  evidenceRoot,
  fixtureRoot,
  payloads: [fixtureRoot],
  checks: [],
  screenshots: [],
  layoutChecks: [],
  viewportChecks: [],
  witnesses: [],
  snapshots: [],
  pageErrors: [],
  nativeLogs: [],
  resourceLimitChecks: [],
  nativeClosures: [],
  boundary: {
    actual:
      scenario === 'full'
        ? 'Production ProjectSession/ShadowStore, ZIP loader, startup SQLite indexing, signed resource protocols, original Main IPC handlers, built Project Accepted results and Saved generations, exact parent/variant focus, Save and reopen.'
        : 'Production portable writer/shadows, startup SQLite and native recovery establish two open tabs; actual Saved rows navigate both ways while exact paired state and original mutation-handler calls are compared. The full matrix, native Save and reopen qualification are not executed.',
    precondition:
      'Literal ICC PNG bytes and strict portable Illustrious/Anima provenance establish accepted variants before startup. ShadowStore establishes one unsaved addition and a separate portable copy with a missing/changed current variant. Acceptance and inference are not exercised.',
    oracle:
      'Existing layerId is the exact variant UUID. Membership is exhaustive over the declared current hierarchy. Exact inactive PNG bytes, current document/Undo/draft/camera, package/shadow/index byte witnesses and original mutation-handler call counts distinguish navigation from activation.',
    limits: `Launcher <=2GiB/zero swap/<=600s plus <=90s stop; native <=2GiB/zero swap/${nativeDeadlineSeconds}s KDE deadline; unique aggregate <=4GiB, PID/start and physical-exit evidence. One serial native actor.`,
    cameras:
      'Only the active ProjectView is mounted. Cross-project camera baselines are measured on each actual active view and compared when that same project is visited again; no inactive fixture is assigned another project’s camera. This fixture does not qualify arbitrary camera persistence across remounts.',
    excluded:
      'Acceptance/inference, trained runtime/catalog, crash recovery, full MVP, release qualification and independent visual PASS. Root must inspect saved screenshots using ui-audit checklist V3/I1/I2.',
    cleanup:
      'No runner cleanup. All payloads belong to evidenceRoot; compact prepared bytes, packages and SQLite backups survive root disposal of fixtureRoot after confirmed physical exit.',
  },
}
const lifecycle = {
  schemaVersion: 1,
  owner: { repository: root, task: 'smart-patch-variant-history', run: reportFile },
  state: 'running',
  lastUsedAt: report.startedAt,
  evidence: [reportFile, evidenceRoot],
  payloads: [fixtureRoot],
  dependsOn: [],
  usedBy: [],
  pins: [{ path: fixtureRoot, reason: 'Root disposal after physical-exit and evidence checks' }],
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
  Object.fromEntries(files.map((file) => [path.relative(root, file), digest(readFileSync(file))]))
function retain(source, relativeName) {
  const target = path.join(evidenceRoot, relativeName)
  const relative = path.relative(evidenceRoot, target)
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
  assert.ok(!existsSync(target), `Snapshot already exists: ${relativeName}`)
  assert.ok(lstatSync(source).isFile() && !lstatSync(source).isSymbolicLink())
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })
  copyFileSync(source, target)
  const bytes = readFileSync(source)
  assert.ok(readFileSync(target).equals(bytes), 'Retained snapshot differs from source')
  report.snapshots.push({ path: target, bytes: bytes.length, sha256: digest(bytes) })
  return target
}

function makeVariant(document, ownerId, family, index, name) {
  const value = smartPatchVariantMetadataFixture(family)
  const bbox = { width: 32, height: 24, x: 128 + index * 4, y: 96 }
  const color =
    family === 'anima' ? [40 + index * 12, 70, 190, 255] : [40, 100 + index * 12, 70, 255]
  const bytes = literalSmartPatchColorPng(
    bbox.width,
    bbox.height,
    Array.from({ length: bbox.width * bbox.height }, () => color).flat(),
    4,
  )
  Object.assign(value, { bbox, name })
  Object.assign(value.asset, {
    bytes: bytes.length,
    height: bbox.height,
    sha256: digest(bytes),
    width: bbox.width,
  })
  const source = value.generationProvenance.layerSourceContext
  Object.assign(source, {
    bbox: { ...bbox },
    layerId: ownerId,
    sourceDocumentId: document.documentId,
    sourceDocumentRevision: document.documentRevision,
  })
  Object.assign(source.sourceTarget, { height: bbox.height, width: bbox.width })
  Object.assign(source.preparedInputs.finalContributionMask, {
    height: bbox.height,
    width: bbox.width,
  })
  const execution = value.generationProvenance.executionResultContext
  execution.acceptedAt = new Date(Date.UTC(2026, 9, 22, 8, 0, index)).toISOString()
  Object.assign(execution.output, {
    byteSize: bytes.length,
    contributionAlpha8: {
      byteSize: bbox.width * bbox.height,
      height: bbox.height,
      sha256: digest(Buffer.alloc(bbox.width * bbox.height, 255)),
      width: bbox.width,
    },
    height: bbox.height,
    sha256: digest(bytes),
    width: bbox.width,
  })
  value.generationProvenance.generationConfiguration.sampling.actualSeed = index
  return { bytes, family, ownerId, value }
}
async function prepare() {
  const title = 'Smart variant accepted history'
  const packagePath = path.join(workspace, `${title}.igs`)
  const session = await ProjectSession.create(packagePath, title, roots)
  const variants = []
  const patches = ['illustrious', 'anima'].map((family) => {
    const id = randomUUID()
    const stored = Array.from({ length: 8 }, (_, index) =>
      makeVariant(
        session.document,
        id,
        family,
        index,
        `${family} ${index === 0 ? 'active' : 'inactive'} contribution ${index + 1}`,
      ),
    )
    variants.push(...stored)
    return {
      activeRasterSubLayerId: stored[0].value.id,
      blendMode: 'normal',
      boundingBox: { height: 512, width: 512, x: 0, y: 0 },
      generationDraft: structuredClone(session.document.generationDraft),
      id,
      internalResolution: { height: 512, width: 512 },
      kind: 'smart-patch',
      locked: family === 'anima',
      mask: { asset: null, id: randomUUID(), revision: 0 },
      name: `${family} ${family === 'anima' ? 'hidden locked' : 'visible editable'} owner`,
      opacity: 1,
      rasterSubLayers: stored.map(({ value }) => value),
      visible: family !== 'anima',
    }
  })
  const neighborBytes = literalSmartPatchColorPng(
    32,
    24,
    Array(32 * 24)
      .fill([200, 70, 50, 255])
      .flat(),
    4,
  )
  const neighborId = randomUUID()
  const neighbor = {
    asset: {
      bytes: neighborBytes.length,
      height: 24,
      path: `assets/layers/${neighborId}.png`,
      sha256: digest(neighborBytes),
      width: 32,
    },
    blendMode: 'normal',
    generationProvenance: acceptedRasterProvenanceFixture(session.document, neighborBytes, {
      width: 32,
      height: 24,
      x: 240,
      y: 96,
    }),
    id: neighborId,
    kind: 'raster',
    locked: false,
    name: 'Ordinary accepted Raster neighbor',
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 240, y: 96 },
    visible: true,
  }
  session.applyDocument({ ...session.document, layers: [...patches, neighbor] })
  await session.save({
    assets: Object.fromEntries([
      ...variants.map(({ value, bytes }) => [value.asset.path, { bytes }]),
      [neighbor.asset.path, { bytes: neighborBytes }],
    ]),
  })
  const saved = (await readIgsPackage(packagePath)).project
  original = {
    title,
    path: packagePath,
    key: session.localRecoveryKey,
    saved,
    variants,
    neighbor,
    neighborBytes,
  }
  const copiedPath = path.join(workspace, 'Smart variant portable copy.igs')
  copyFileSync(packagePath, copiedPath)
  const copied = await ProjectSession.open(copiedPath, roots)
  copied.applyDocument({ ...copied.document, title: 'Smart variant portable copy' })
  await copied.save()
  portable = {
    ...original,
    title: copied.document.title,
    path: copiedPath,
    key: copied.localRecoveryKey,
    saved: copied.document,
  }
  assert.notEqual(original.key, portable.key)
  assert.equal(original.saved.documentId, portable.saved.documentId)
  const extra = makeVariant(saved, patches[0].id, 'illustrious', 8, 'Unsaved accepted variant')
  original.extra = extra
  original.variants = [...variants, extra]
  session.applyDocument({
    ...saved,
    layers: saved.layers.map((layer) =>
      layer.id === extra.ownerId
        ? { ...layer, rasterSubLayers: [...layer.rasterSubLayers, extra.value] }
        : layer,
    ),
  })
  const shadow = new ProjectShadowStore(path.join(appDataRoot, 'autosave'))
  await shadow.write({
    dirtyAssets: { [extra.value.asset.path]: { bytes: extra.bytes } },
    document: session.document,
    projectPath: packagePath,
    savedDocument: saved,
  })
  original.recovered = session.document
  portable.missing = variants[7]
  portable.changed = variants[6]
  const changed = makeVariant(
    portable.saved,
    variants[6].ownerId,
    'illustrious',
    9,
    variants[6].value.name,
  )
  changed.value.id = portable.changed.value.id
  changed.value.asset.path = portable.changed.value.asset.path
  copied.applyDocument({
    ...portable.saved,
    generationDraft: {
      ...portable.saved.generationDraft,
      positivePrompt: {
        embeddingRefs: [],
        text: 'Unsaved portable-copy prompt must survive navigation',
      },
    },
    layers: portable.saved.layers.map((layer) =>
      layer.id === portable.missing.ownerId
        ? {
            ...layer,
            rasterSubLayers: layer.rasterSubLayers
              .filter(({ id }) => id !== portable.missing.value.id)
              .map((value) => (value.id === changed.value.id ? changed.value : value)),
          }
        : layer,
    ),
  })
  portable.recovered = copied.document
  await shadow.write({
    dirtyAssets: { [changed.value.asset.path]: { bytes: changed.bytes } },
    document: copied.document,
    projectPath: copiedPath,
    savedDocument: portable.saved,
  })
  for (const fixture of [original, portable]) {
    const loaded = await readIgsPackage(fixture.path)
    assert.deepEqual(loaded.project, fixture.saved)
    for (const variant of variants)
      assert.ok((await loaded.readMember(variant.value.asset.path)).equals(variant.bytes))
    retain(fixture.path, `prepared-fixture/${fixture.key}.igs`)
  }
  const descriptor = {
    original: {
      ...original,
      variants: original.variants.map(({ bytes, ...rest }) => rest),
      neighborBytes: undefined,
      extra: extra.value,
    },
    portable: {
      ...portable,
      variants: variants.map(({ bytes, ...rest }) => rest),
      neighborBytes: undefined,
      missing: portable.missing.value.id,
      changed: portable.changed.value.id,
    },
  }
  writeFileSync(
    path.join(evidenceRoot, 'prepared-fixture.json'),
    JSON.stringify(descriptor, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  )
  for (const file of filesBelow(path.join(appDataRoot, 'autosave')))
    retain(file, `prepared-fixture/${path.relative(appDataRoot, file)}`)
  // Shadow bytes include the unsaved addition and changed copy, independently of disposable payloads.
  report.fixture = {
    originalKey: original.key,
    portableKey: portable.key,
    documentId: saved.documentId,
    savedPerProject: 17,
    currentOriginal: 18,
    extraId: extra.value.id,
  }
  check(
    'Real writer/loader and shadow fixtures retain exact portable bytes for both families and two distinct path identities',
  )
}

async function api(method, ...args) {
  const result = await window.evaluate(({ method, args }) => window.api.projects[method](...args), {
    method,
    args,
  })
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}
async function current(fixture = original) {
  const result = await api('open', fixture.key)
  assert.equal(result.kind, 'opened')
  return result.tab
}
const canvas = () => window.getByRole('region', { name: 'Project Canvas', exact: true })
const localModal = () => window.getByRole('dialog', { name: 'Accepted results', exact: true })
const savedModal = () => window.getByRole('dialog', { name: 'Saved generations', exact: true })
const browser = () => window.getByRole('dialog', { name: 'Smart Patch variants', exact: true })
// Stable adapters: layerId remains the raster identity for ordinary layers and nested variants.
const localRow = (id) => localModal().locator(`article[data-layer-id="${id}"]`)
const savedRow = (fixture, id) =>
  savedModal().locator(`article[data-project-key="${fixture.key}"][data-layer-id="${id}"]`)
const variantRow = (id) => browser().locator(`[data-smart-patch-variant-id="${id}"]`)
async function openLocal() {
  await window.getByRole('button', { name: 'Accepted results', exact: true }).click()
  await expect(localModal()).toBeVisible()
  await expect
    .poll(() => localModal().evaluate((node) => getComputedStyle(node).transform))
    .toBe('none')
}
async function openSaved() {
  await window.getByRole('button', { name: 'Open saved generations', exact: true }).click()
  await expect(savedModal()).toBeVisible()
  await expect
    .poll(() => savedModal().evaluate((node) => getComputedStyle(node).transform))
    .toBe('none')
  await expect(
    savedModal().getByRole('list', { name: 'Saved generations', exact: true }),
  ).toHaveAttribute('aria-busy', 'false')
  return api('getAcceptedResultHistory')
}
async function closeBrowser() {
  await window.keyboard.press('Escape')
  await expect(browser()).toBeHidden()
}
async function openOriginal() {
  await window.getByRole('button', { name: `Open ${original.title}`, exact: true }).click()
  const dialog = window.getByRole('dialog', { name: 'Recovery available', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Recover', exact: true }).click()
  await expect(window.getByRole('tab', { name: original.title, exact: true })).toBeVisible()
  await canvas().getByRole('button', { name: 'Fit View', exact: true }).click()
}
async function fetchBytes(url) {
  const result = await application.evaluate(async ({ net }, url) => {
    const response = await net.fetch(url)
    return { status: response.status, bytes: [...new Uint8Array(await response.arrayBuffer())] }
  }, url)
  assert.equal(result.status, 200)
  return Buffer.from(result.bytes)
}
function databaseRows() {
  const db = new Database(path.join(appDataRoot, 'database/app.sqlite'), {
    readonly: true,
    fileMustExist: true,
  })
  try {
    return db
      .prepare('SELECT * FROM project_accepted_result_index ORDER BY local_project_key, layer_id')
      .all()
  } finally {
    db.close()
  }
}
function shadowHashes() {
  return Object.fromEntries(
    filesBelow(path.join(appDataRoot, 'autosave')).map((file) => [
      path.relative(appDataRoot, file),
      digest(readFileSync(file)),
    ]),
  )
}
async function witness(fixture = original) {
  const tab = await current(fixture)
  const camera = await canvas()
    .locator('.canvas-area')
    .evaluate((host) => ({
      x: host.dataset.cameraX,
      y: host.dataset.cameraY,
      scale: host.dataset.cameraScale,
    }))
  assert.ok(
    Object.values(camera).every((value) => value !== undefined && Number.isFinite(Number(value))),
  )
  return {
    tab,
    camera,
    packageSha256: digest(readFileSync(fixture.path)),
    shadows: shadowHashes(),
    savedIndex: databaseRows(),
    mutationCalls: await mutationCalls(),
  }
}
async function unchanged(before, fixture, label) {
  const after = await witness(fixture)
  assert.deepEqual(
    after,
    before,
    `${label}: navigation changed document, Undo, camera, draft, package, shadow, saved history or invoked a mutation`,
  )
  report.witnesses.push({ label, before, after })
  checkpoint()
}
async function snapshot(label) {
  const directory = path.join(evidenceRoot, label)
  mkdirSync(directory, { mode: 0o700 })
  const source = new Database(path.join(appDataRoot, 'database/app.sqlite'), {
    readonly: true,
    fileMustExist: true,
  })
  const destination = path.join(directory, 'app.sqlite')
  try {
    await source.backup(destination)
  } finally {
    source.close()
  }
  const copy = new Database(destination, { readonly: true, fileMustExist: true })
  try {
    assert.deepEqual(copy.prepare('PRAGMA integrity_check').all(), [{ integrity_check: 'ok' }])
    assert.deepEqual(
      copy
        .prepare('SELECT * FROM project_accepted_result_index ORDER BY local_project_key, layer_id')
        .all(),
      databaseRows(),
    )
  } finally {
    copy.close()
  }
  report.snapshots.push({
    path: destination,
    bytes: lstatSync(destination).size,
    sha256: digest(readFileSync(destination)),
  })
  for (const fixture of [original, portable]) retain(fixture.path, `${label}/${fixture.key}.igs`)
  for (const file of filesBelow(path.join(appDataRoot, 'autosave')))
    retain(file, `${label}/${path.relative(appDataRoot, file)}`)
  checkpoint()
}
async function assertVariantFocus(variant) {
  await expect(browser()).toBeVisible()
  await expect(variantRow(variant.value.id)).toBeFocused()
  await expect(
    variantRow(variant.value.id).getByText('From history', { exact: true }),
  ).toBeVisible()
  await expect(browser().getByText('From history', { exact: true })).toHaveCount(1)
}
async function settledVariantFocus(variant) {
  await expect(browser().locator('.variants-loading')).toBeHidden()
  await window.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  await assertVariantFocus(variant)
}
async function focused(fixture, variant) {
  await assertVariantFocus(variant)
  const tab = await current(fixture)
  const owner = tab.layers.find((layer) =>
    layer.rasterSubLayers?.some(({ id }) => id === variant.value.id),
  )
  assert.equal(owner.id, variant.ownerId)
  assert.equal(
    owner.activeRasterSubLayerId,
    fixture.saved.layers.find(({ id }) => id === variant.ownerId).activeRasterSubLayerId,
    'The From history marker must preserve the real active variant identity',
  )
  await expect(
    variantRow(variant.value.id).getByRole('button', {
      name: `Select variant ${variant.value.name}`,
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', String(owner.activeRasterSubLayerId === variant.value.id))
  const row = window
    .getByLabel('Project layers', { exact: true })
    .locator(`[data-layer-id="${owner.id}"]`)
  // Variants intentionally replaces the Layers panel through v-show. Selection remains
  // observable in that hidden DOM; visible/reveal geometry belongs after closing Variants.
  await expect(
    row.getByRole('button', { name: `Select ${owner.name}`, exact: true, includeHidden: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  assert.equal(
    await variantRow(variant.value.id).evaluate((node) => {
      const panel = node.closest('.variants-scroll').getBoundingClientRect()
      const rect = node.getBoundingClientRect()
      return rect.top >= panel.top - 1 && rect.bottom <= panel.bottom + 1
    }),
    true,
    'Exact variant must be revealed in the existing browser',
  )
}
async function revealedParent(fixture, variant) {
  const owner = fixture.saved.layers.find(({ id }) => id === variant.ownerId)
  const row = window
    .getByLabel('Project layers', { exact: true })
    .locator(`[data-layer-id="${owner.id}"]`)
  await expect(row).toBeVisible()
  await expect(
    row.getByRole('button', { name: `Select ${owner.name}`, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect
    .poll(
      () =>
        row.evaluate((node) => {
          const panel = node.closest('[aria-label="Project layers"]').getBoundingClientRect()
          const rect = node.getBoundingClientRect()
          return rect.top >= panel.top - 1 && rect.bottom <= panel.bottom + 1
        }),
      {
        message:
          'Owning layer row must be revealed after closing Variants without changing visibility',
      },
    )
    .toBe(true)
}
async function navigateLocal(variant, label, keyboard = false, keepBrowserOpen = false) {
  await openLocal()
  const before = await witness()
  const owner = before.tab.layers.find(({ id }) => id === variant.ownerId)
  const action = localRow(variant.value.id).getByRole('button', {
    name: `Show variant ${variant.value.name} in ${owner.name}`,
    exact: true,
  })
  await activateRow(action, localModal(), label, keyboard)
  await expect(localModal()).toBeHidden()
  await focused(original, variant)
  await unchanged(before, original, label)
  await settledVariantFocus(variant)
  await layout(variantRow(variant.value.id), `${label}-variant`)
  await settledVariantFocus(variant)
  await screenshot(label)
  if (!keepBrowserOpen) {
    await closeBrowser()
    await revealedParent(original, variant)
  }
}
async function navigateSaved(fixture, variant, label, keyboard = false, keepBrowserOpen = false) {
  await openSaved()
  const before = await witness(fixture)
  const action = savedRow(fixture, variant.value.id).getByRole('button')
  await activateRow(action, savedModal(), label, keyboard)
  await expect(savedModal()).toBeHidden()
  await focused(fixture, variant)
  await unchanged(before, fixture, label)
  await settledVariantFocus(variant)
  await layout(variantRow(variant.value.id), `${label}-variant`)
  await settledVariantFocus(variant)
  await screenshot(label)
  if (!keepBrowserOpen) {
    await closeBrowser()
    await revealedParent(fixture, variant)
  }
}
async function activateRow(action, modal, label, keyboard) {
  if (keyboard) {
    await modal.getByRole('button', { name: 'Close', exact: true }).focus()
    let reached = false
    for (let step = 0; step < 48; step += 1) {
      await window.keyboard.press('Shift+Tab')
      if (await action.evaluate((node) => node === document.activeElement)) {
        reached = true
        break
      }
    }
    assert.ok(reached, 'Result must be reachable through the actual modal keyboard order')
    await expect(action).toBeFocused()
  }
  await action.scrollIntoViewIfNeeded()
  await layout(action, `${label}-row`)
  if (await window.evaluate(() => innerWidth === 900)) {
    await layout(modal.getByRole('button', { name: 'Close', exact: true }), `${label}-footer`)
    await screenshot(`${label}-results-row`)
  }
  if (keyboard) await window.keyboard.press('Enter')
  else await action.click()
}
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
async function setNativeSize(width, height) {
  await application.evaluate(
    ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size),
    [width, height],
  )
  await expect.poll(() => window.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height])
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
  report.viewportChecks.push(native)
  checkpoint()
}
// Measure the scrolled, visible row; offscreen list content is intentionally scrollable.
async function layout(scope, label) {
  await expect(scope).toBeVisible()
  await window.evaluate(() => document.fonts.ready.then(() => undefined))
  const result = await scope.evaluate((surface) => {
    const rectOf = (r) => ({
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    })
    const violations = [],
      text = [],
      controls = [],
      ellipses = []
    const inspect = (rect, node, description) => {
      const clipped = []
      if (
        rect.left < -1 ||
        rect.top < -1 ||
        rect.right > innerWidth + 1 ||
        rect.bottom > innerHeight + 1
      )
        clipped.push('viewport')
      for (let outer = node; outer instanceof HTMLElement; outer = outer.parentElement) {
        const style = getComputedStyle(outer),
          bounds = outer.getBoundingClientRect()
        const left = bounds.left + outer.clientLeft,
          top = bounds.top + outer.clientTop
        if (
          /^(hidden|clip|auto|scroll)$/.test(style.overflowX) &&
          (rect.left < left - 1 || rect.right > left + outer.clientWidth + 1)
        )
          clipped.push(`x:${outer.className}`)
        if (
          /^(hidden|clip|auto|scroll)$/.test(style.overflowY) &&
          (rect.top < top - 1 || rect.bottom > top + outer.clientHeight + 1)
        )
          clipped.push(`y:${outer.className}`)
      }
      if (clipped.length) violations.push({ description, rect: rectOf(rect), clipped })
    }
    inspect(surface.getBoundingClientRect(), surface.parentElement, 'surface')
    for (const button of [
      ...(surface.matches('button') ? [surface] : []),
      ...surface.querySelectorAll('button'),
    ]) {
      const rect = button.getBoundingClientRect()
      if (!rect.width || !rect.height) continue
      inspect(rect, button.parentElement, button.ariaLabel || button.textContent.trim())
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      const reachable = hit !== null && (hit === button || button.contains(hit))
      if (!button.disabled && !reachable) violations.push({ obscured: button.ariaLabel })
      controls.push({ label: button.ariaLabel, reachable, disabled: button.disabled })
    }
    const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim() || getComputedStyle(node.parentElement).visibility !== 'visible')
        continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const rawRect of range.getClientRects()) {
        let rect = rawRect
        if (!rect.width || !rect.height) continue
        // Approved name ellipsis with the full title is not glyph-height clipping.
        // Preserve vertical range bounds; constrain only intentionally hidden horizontal text.
        const owner = node.parentElement
        if (
          getComputedStyle(owner).textOverflow === 'ellipsis' &&
          owner.title.trim() === node.textContent.trim()
        ) {
          const bounds = owner.getBoundingClientRect()
          const left = Math.max(rect.left, bounds.left + owner.clientLeft)
          const right = Math.min(rect.right, bounds.left + owner.clientLeft + owner.clientWidth)
          if (left !== rect.left || right !== rect.right) {
            ellipses.push({ title: owner.title, full: rectOf(rect), visibleWidth: right - left })
            rect = { ...rectOf(rect), left, right, width: right - left }
          }
        }
        inspect(rect, node.parentElement, node.textContent.trim())
        text.push({ value: node.textContent.trim(), rect: rectOf(rect) })
      }
    }
    return { rect: rectOf(surface.getBoundingClientRect()), text, controls, ellipses, violations }
  })
  report.layoutChecks.push({ label, ...result })
  checkpoint()
  assert.ok(result.text.length > 0, 'Actual text glyph bounds required')
  assert.deepEqual(result.violations, [], `${label}: clipped glyphs or unreachable controls`)
}

async function installObserver() {
  await application.evaluate(({ ipcMain }) => {
    globalThis.igsSmartHistoryCalls = []
    for (const [channel, handler] of ipcMain._invokeHandlers) {
      if (!channel.startsWith('projects:')) continue
      ipcMain._invokeHandlers.set(channel, async (event, ...args) => {
        const call = { channel, args: JSON.parse(JSON.stringify(args)), finished: false }
        globalThis.igsSmartHistoryCalls.push(call)
        try {
          return await handler(event, ...args)
        } finally {
          call.finished = true
        }
      })
    }
  })
}
async function mutationCalls(includeSeals = false) {
  return application.evaluate(
    (includeSeals) =>
      globalThis.igsSmartHistoryCalls.filter(({ channel }) => {
        if (/^projects:(?:get-|list|open$|review-accepted-result$)/.test(channel)) return false
        return includeSeals || channel !== 'projects:seal-prompt-history'
      }),
    includeSeals,
  )
}

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
    deadlineSeconds: nativeDeadlineSeconds,
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

async function closeNative(label, aborted = false) {
  if (!application) return
  if (aborted) {
    report.outcome = 'failed'
    process.exitCode = 1
    report.abortCleanup = {
      label,
      startedAt: new Date().toISOString(),
      reason:
        'Qualification aborted; explicitly terminate only the owned actor without an unsaved-close decision',
      intentionalSignal: 'SIGKILL',
    }
    checkpoint()
  }
  let boundError
  try {
    await bounds(`${label}-before-exit`)
  } catch (error) {
    boundError = error
  }
  clearInterval(sampler)
  await sampling
  sampleDescendants()
  try {
    report.ipcCalls = await application.evaluate(() => globalThis.igsSmartHistoryCalls ?? [])
  } catch (error) {
    if (!aborted) throw error
    report.abortCleanup.ipcObservationError = String(error)
  }
  for (const value of observed.values())
    nativeChecks.push({ processIdentities: [value], groups: [] })
  const child = nativeProcess
  const native = application
  let timer
  const exitPromise = new Promise((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal })),
  )
  try {
    if (aborted) {
      const known = nativeChecks
        .flatMap(({ processIdentities = [] }) => processIdentities)
        .find(({ pid }) => pid === child.pid)
      assert.ok(known, 'Abort cleanup requires the actor recorded at launch')
      const live = identity(child.pid)
      if (live) {
        assert.deepEqual(live, known, 'Abort cleanup refuses a reused PID')
        const latest = nativeChecks.findLast((value) => value.nativeIdentity)
        const owned = latest?.groups.find(
          ({ ownedScope, pids }) => ownedScope && pids.includes(child.pid),
        )
        // The existing helper revalidates PID/start and the exact owned KDE scope before
        // killing all its descendants. In the launcher cgroup, signal only our own child.
        if (owned)
          report.abortCleanup.termination = await stopExpiredQualificationProcess({
            ...known,
            group: owned.group,
          })
        else {
          assert.equal(child.kill('SIGKILL'), true)
          report.abortCleanup.termination = { ...known, signalRequested: true, signal: 'SIGKILL' }
        }
      } else report.abortCleanup.termination = { ...known, alreadyPhysicallyExited: true }
    } else
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
  report.nativeClosures.push({
    label,
    aborted,
    intentionalSignal: aborted ? 'SIGKILL' : null,
    ...exit,
    ...actualExit,
  })
  // Exit evidence remains in nativeClosures/resourceLimitChecks. Do not ask a later restart
  // to stop an already-released transient KDE timer a second time.
  nativeChecks.length = 0
  application = null
  window = null
  checkpoint()
  if (aborted) {
    report.abortCleanup.physicalExitConfirmed = exit.confirmed
    report.abortCleanup.completedAt = new Date().toISOString()
    if (boundError) report.abortCleanup.boundError = String(boundError)
  } else {
    assert.equal(actualExit.code, 0, 'Unexpected forced exit fails qualification')
    assert.equal(actualExit.signal, null)
  }
  if (boundError && !aborted) throw boundError
}

async function launch() {
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
  }, 100)
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
    const owned = BrowserWindow.getAllWindows()[0]
    owned.show()
    owned.focus()
  })
  await setNativeSize(1440, 900)
  await installObserver()
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  await expect.poll(async () => (await api('list')).length).toBe(2)
  await bounds('native-ui-ready')
}
async function noRuntime() {
  const status = await window.evaluate(async () => ({
    runtime: await window.api.runtime.getStatus(),
    models: await window.api.models.getCatalog(),
  }))
  assert.equal(status.runtime.ok, true)
  assert.equal(status.runtime.value.kind, 'not-installed')
  assert.deepEqual(status.models, { ok: true, value: [] })
  report.runtime = status
}
async function closeProject(fixture, discard = false) {
  await window.getByRole('button', { name: `Close ${fixture.title}`, exact: true }).click()
  if (discard) {
    const dialog = window.getByRole('dialog', { name: 'Close Project', exact: true })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Discard Changes', exact: true }).click()
  }
  await expect(window.getByRole('tab', { name: fixture.title, exact: true })).toHaveCount(0)
}
async function assertImage(row, url, bytes) {
  const image = row.locator('img')
  await image.scrollIntoViewIfNeeded()
  await expect(image).toHaveAttribute('src', url)
  await expect
    .poll(() =>
      image.evaluate(
        (node) => node.complete && node.naturalWidth === 32 && node.naturalHeight === 24,
      ),
    )
    .toBe(true)
  assert.ok(
    (await fetchBytes(url)).equals(bytes),
    'Signed resource returned a different contribution PNG',
  )
}
async function assertScroll(modal, selector) {
  const geometry = await modal
    .locator(selector)
    .evaluate((node) => ({ height: node.clientHeight, content: node.scrollHeight }))
  assert.ok(
    geometry.height > 0 && geometry.content > geometry.height,
    'Declared long list must exercise actual overflow scrolling',
  )
  return geometry
}

async function prepareCameraBaseline(fixture) {
  // Existing refusal/Save notices have already been asserted and captured. Dismiss only
  // this transient banner before baselining view geometry, without switching Home/tabs.
  const notice = window.locator('.global-notice')
  if (await notice.isVisible()) {
    report.cameraSetupNotices ??= []
    report.cameraSetupNotices.push({ projectKey: fixture.key, text: await notice.innerText() })
    await notice.locator('.n-alert__close').click()
    await expect(notice).toHaveCount(0)
  }
  return activeCamera(fixture)
}
async function activeCamera(fixture) {
  const view = window.locator('.project-view')
  await expect(view).toHaveAttribute('aria-label', `Project ${fixture.title}`)
  const host = view.locator('.canvas-area')
  await expect(host).toHaveAttribute('data-scene-ready', 'true')
  await window.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  const value = await host.evaluate((node) => ({
    camera: { x: node.dataset.cameraX, y: node.dataset.cameraY, scale: node.dataset.cameraScale },
    viewport: { width: node.clientWidth, height: node.clientHeight },
  }))
  assert.ok(
    Object.values(value.camera).every(
      (entry) => entry !== undefined && Number.isFinite(Number(entry)),
    ),
  )
  return { projectKey: fixture.key, ...value }
}
async function pairedWitness() {
  const calls = await mutationCalls(true)
  const counts = {}
  for (const { channel } of calls) counts[channel] = (counts[channel] ?? 0) + 1
  return {
    tabs: { [original.key]: await current(original), [portable.key]: await current(portable) },
    packages: Object.fromEntries(
      [original, portable].map((fixture) => [fixture.key, digest(readFileSync(fixture.path))]),
    ),
    shadows: shadowHashes(),
    savedIndex: databaseRows(),
    mutationCounts: Object.fromEntries(
      Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
    ),
    mutationCalls: calls,
  }
}
async function crossProjectSavedStep(from, target, variant, label, expectedCamera) {
  await expect(window.getByRole('tab', { name: from.title, exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await openSaved()
  const attempt = {
    label,
    status: 'started',
    fromProjectKey: from.key,
    toProjectKey: target.key,
    toVariantId: variant.value.id,
    steps: [
      'Both real projects are already open and their recovered drafts are settled',
      'Open Saved generations without a Home/tab click',
      'Click the other project’s exact inactive variant',
      'Require exact focus/From history and unchanged BOTH tabs, Undo/drafts, package/shadow/index and every mutation IPC call including seal-prompt-history',
    ],
    departingCamera: await activeCamera(from),
    expectedTargetCamera: expectedCamera,
    before: await pairedWitness(),
  }
  report.crossProjectTransitions ??= []
  report.crossProjectTransitions.push(attempt)
  checkpoint()
  await activateRow(
    savedRow(target, variant.value.id).getByRole('button'),
    savedModal(),
    label,
    false,
  )
  await expect(savedModal()).toBeHidden()
  await expect(window.getByRole('tab', { name: target.title, exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await focused(target, variant)
  await settledVariantFocus(variant)
  attempt.after = await pairedWitness()
  attempt.targetCamera = await activeCamera(target)
  await snapshot(`${label}-state`)
  // Compare the original Main handler counters first: a seal may leave public Undo flags
  // unchanged yet still close a history group and rotate renderer prompt grouping.
  assert.deepEqual(
    attempt.after.mutationCounts,
    attempt.before.mutationCounts,
    `${label}: cross-project Saved navigation invoked a mutation, including prompt-history sealing, with settled drafts`,
  )
  assert.deepEqual(
    attempt.after.mutationCalls,
    attempt.before.mutationCalls,
    `${label}: original mutation-handler invocations changed`,
  )
  assert.deepEqual(
    attempt.after.tabs,
    attempt.before.tabs,
    `${label}: either current document, Undo/Redo, dirty flag, settings or draft changed`,
  )
  assert.deepEqual(
    attempt.after.packages,
    attempt.before.packages,
    `${label}: either saved package changed`,
  )
  assert.deepEqual(
    attempt.after.shadows,
    attempt.before.shadows,
    `${label}: either exact shadow/history byte set changed`,
  )
  assert.deepEqual(
    attempt.after.savedIndex,
    attempt.before.savedIndex,
    `${label}: saved history changed`,
  )
  assert.deepEqual(
    attempt.targetCamera,
    expectedCamera,
    `${label}: target camera or viewport differs from its own earlier mounted view`,
  )
  await layout(variantRow(variant.value.id), `${label}-variant`)
  await settledVariantFocus(variant)
  await screenshot(label)
  await closeBrowser()
  await revealedParent(target, variant)
  attempt.status = 'passed'
  check(
    `${label}: actual Saved cross-project navigation preserves both documents and every original mutation IPC count`,
    { fromProjectKey: from.key, toProjectKey: target.key, variantId: variant.value.id },
  )
}
async function crossProjectRoundTrip(originalCamera) {
  await expect(window.getByRole('tab', { name: original.title, exact: true })).toBeVisible()
  await expect(window.getByRole('tab', { name: portable.title, exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  const portableCamera = await prepareCameraBaseline(portable)
  report.crossProjectCameraBaselines = {
    [original.key]: originalCamera,
    [portable.key]: portableCamera,
  }
  await snapshot('cross-project-before-navigation')
  await crossProjectSavedStep(
    portable,
    original,
    original.variants[7],
    '12a-cross-project-original-inactive',
    originalCamera,
  )
  await crossProjectSavedStep(
    original,
    portable,
    portable.variants[15],
    '12b-cross-project-portable-hidden-locked',
    portableCamera,
  )
}
async function focusedCrossProjectScenario() {
  await openOriginal()
  const originalCamera = await prepareCameraBaseline(original)
  // Setup may use the current cross-project path, but no claim starts until BOTH tabs
  // exist and the copy has recovered. Historical setup seals remain in the baseline.
  await openSaved()
  await savedRow(portable, portable.variants[15].value.id).getByRole('button').click()
  await expect(savedModal()).toBeHidden()
  const recovery = window.getByRole('dialog', { name: 'Recovery available', exact: true })
  await expect(recovery).toBeVisible()
  await recovery.getByRole('button', { name: 'Recover', exact: true }).click()
  await focused(portable, portable.variants[15])
  await settledVariantFocus(portable.variants[15])
  await closeBrowser()
  await revealedParent(portable, portable.variants[15])
  for (const fixture of [original, portable]) {
    await expect(window.getByRole('tab', { name: fixture.title, exact: true })).toBeVisible()
    assert.equal((await current(fixture)).dirty, true)
  }
  assert.equal(
    (await current(portable)).generationDraft.positivePrompt.text,
    'Unsaved portable-copy prompt must survive navigation',
  )
  check(
    'Focused setup has two real recovered open projects before cross-project witnesses; no full history qualification is claimed',
  )
  await crossProjectRoundTrip(originalCamera)
}

let sourceFiles, bundleFiles
try {
  // No writes/builds/provisioning outside the new owned run. Root executes only after the shared edit phase.
  const inventory = await Promise.all([
    nativeExec('du', ['-sk', artifactRoot], { timeout: 15_000, maxBuffer: 16 * 1024 }),
    nativeExec('du', ['-k', '--max-depth=1', artifactRoot], {
      timeout: 15_000,
      maxBuffer: 32 * 1024,
    }),
    nativeExec('df', ['-Pk', artifactRoot], { timeout: 10_000, maxBuffer: 16 * 1024 }),
    nativeExec('git', ['rev-parse', 'HEAD'], { timeout: 10_000, maxBuffer: 16 * 1024 }),
    nativeExec('git', ['status', '--short'], { timeout: 10_000, maxBuffer: 32 * 1024 }),
  ])
  report.inventory = inventory.map(({ stdout }) => stdout.trim())
  report.launcher = await verifyLauncherDeadline()
  sourceFiles = [
    ...new Set([
      ...filesBelow(path.join(root, 'src/main/projects')),
      ...filesBelow(path.join(root, 'src/main/db')),
      ...filesBelow(path.join(root, 'src/shared/projects')),
      ...filesBelow(path.join(root, 'src/renderer/components')),
      ...[
        'src/main/index.ts',
        'src/preload/index.ts',
        'src/shared/api.ts',
        'src/renderer/App.vue',
        'scripts/smoke-smart-patch-history.mjs',
        'scripts/native-smoke-window.mjs',
        'scripts/qualification-resource-limits.mjs',
        'package.json',
        'pnpm-lock.yaml',
      ].map((file) => path.join(root, file)),
    ]),
  ].sort()
  bundleFiles = [
    path.join(root, 'dist/main/main.cjs'),
    path.join(root, 'dist/preload/preload.cjs'),
    path.join(root, 'dist/renderer/index.html'),
    ...filesBelow(path.join(root, 'dist/renderer/assets')),
    ...filesBelow(path.join(root, 'dist/main/migrations')),
  ]
  report.sourceSha256 = hashes(sourceFiles)
  report.bundleSha256 = hashes(bundleFiles)
  writeFileSync(
    path.join(evidenceRoot, 'source-build-hashes.json'),
    JSON.stringify({ source: report.sourceSha256, build: report.bundleSha256 }, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  )
  checkpoint()
  await prepare()
  await launch()
  await noRuntime()
  if (scenario === 'cross-project') await focusedCrossProjectScenario()
  else {
    let history = await openSaved()
    assert.equal(history.totalCount, 34)
    assert.equal(history.items.length, 34)
    assert.equal(history.nextCursor, null)
    assert.equal(
      history.items.some(({ layerId }) => layerId === original.extra.value.id),
      false,
    )
    assert.equal(databaseRows().length, 34)
    await snapshot('00-saved-before-navigation')
    await savedModal().getByRole('button', { name: 'Close', exact: true }).click()
    await expect(savedModal()).toBeHidden()
    check(
      'Bounded real native startup indexes only 34 saved identities, excluding the unsaved variant; no runtime or catalog',
    )

    await openOriginal()
    const tab = await current()
    assert.equal(tab.dirty, true)
    const expectedIds = [
      ...original.variants.map(({ value }) => value.id),
      original.neighbor.id,
    ].sort()
    assert.deepEqual(tab.acceptedResults.map(({ layerId }) => layerId).sort(), expectedIds)
    await openLocal()
    assert.deepEqual(
      (
        await localModal()
          .locator('article')
          .evaluateAll((rows) => rows.map((row) => row.dataset.layerId))
      ).sort(),
      expectedIds,
    )
    for (const variant of original.variants) {
      const result = tab.acceptedResults.find(({ layerId }) => layerId === variant.value.id)
      assert.equal(result.layerName, variant.value.name)
      assert.equal(
        result.seed,
        variant.value.generationProvenance.generationConfiguration.sampling.actualSeed,
      )
      assert.equal(result.width, 32)
      assert.equal(result.height, 24)
      assert.match(result.imageUrl, /^igs-layer:\/\/asset\//)
      assert.ok(result.imageUrl.includes(`/${variant.value.id}/`))
      assert.ok((await fetchBytes(result.imageUrl)).equals(variant.bytes))
    }
    const inactive = original.variants[7],
      hidden = original.variants[15],
      active = original.variants[0]
    for (const variant of [inactive, hidden]) {
      const result = tab.acceptedResults.find(({ layerId }) => layerId === variant.value.id)
      await assertImage(localRow(variant.value.id), result.imageUrl, variant.bytes)
      const owner = tab.layers.find(({ id }) => id === variant.ownerId)
      const activeFixture = original.variants.find(
        ({ value }) => value.id === owner.activeRasterSubLayerId,
      )
      assert.ok(
        (await fetchBytes(owner.activeRaster.imageUrl)).equals(activeFixture.bytes),
        'Parent-ID active capability must still read the active contribution',
      )
      assert.notEqual(owner.activeRaster.imageUrl, result.imageUrl)
    }
    await screenshot('01-project-all-variants-1440')
    await localModal().getByRole('button', { name: 'Close', exact: true }).click()
    await expect(localModal()).toBeHidden()
    check(
      'Project membership includes every current nested variant and ordinary Raster; inactive signed previews and parent active resources are exact',
    )

    await navigateLocal(inactive, '02-project-inactive-1440')
    await navigateLocal(active, '03-project-active-1440')
    check(
      'Actual Project row clicks focus exact inactive and active variants without mutation or activation',
    )
    await setNativeSize(900, 620)
    await openLocal()
    const localScroll = await assertScroll(
      localModal(),
      '.n-card__content-scrollbar > .n-scrollbar-container',
    )
    await localModal().getByRole('button', { name: 'Close', exact: true }).click()
    await expect(localModal()).toBeHidden()
    await navigateLocal(hidden, '04-project-hidden-locked-900', true)
    check(
      'Actual 900x620 Project list scrolls; keyboard navigation reveals/focuses the hidden locked owner and exact variant with unclipped visible glyphs',
      { localScroll },
    )

    await setNativeSize(1440, 900)
    assert.equal(
      (await api('getAcceptedResultHistory')).items.some(
        ({ layerId }) => layerId === original.extra.value.id,
      ),
      false,
    )
    await window.getByRole('button', { name: 'Save Project', exact: true }).click()
    await expect.poll(async () => (await current()).dirty).toBe(false)
    await expect(window.locator('.document-state')).toHaveText('Saved')
    await expect.poll(async () => (await api('getAcceptedResultHistory')).totalCount).toBe(35)
    const loaded = await readIgsPackage(original.path)
    for (const variant of original.variants) {
      const owner = loaded.project.layers.find(({ id }) => id === variant.ownerId)
      assert.deepEqual(
        owner.rasterSubLayers.find(({ id }) => id === variant.value.id),
        variant.value,
      )
      assert.ok((await loaded.readMember(variant.value.asset.path)).equals(variant.bytes))
    }
    assert.equal(
      (await api('getAcceptedResultHistory')).items.filter(
        ({ layerId }) => layerId === original.extra.value.id,
      ).length,
      1,
    )
    await snapshot('05-explicit-save')
    check(
      'Only explicit native Save publishes the unsaved accepted variant to global history; real ZIP readback retains every exact image and frozen provenance',
    )

    history = await openSaved()
    assert.equal(
      new Set(history.items.map(({ projectKey, layerId }) => `${projectKey}:${layerId}`)).size,
      35,
    )
    for (const fixture of [original, portable]) {
      const variants = fixture === original ? original.variants : portable.variants
      assert.deepEqual(
        history.items
          .filter(({ projectKey }) => projectKey === fixture.key)
          .map(({ layerId }) => layerId)
          .sort(),
        [...variants.map(({ value }) => value.id), fixture.neighbor.id].sort(),
      )
      for (const variant of [inactive, hidden]) {
        const entry = history.items.find(
          ({ projectKey, layerId }) => projectKey === fixture.key && layerId === variant.value.id,
        )
        assert.equal(entry.layerName, variant.value.name)
        assert.equal(entry.documentId, fixture.saved.documentId)
        assert.equal(entry.assetSha256, variant.value.asset.sha256)
        assert.match(entry.imageUrl, /^igs-history:\/\/result\//)
        await assertImage(savedRow(fixture, variant.value.id), entry.imageUrl, variant.bytes)
      }
      const ordinary = history.items.find(
        ({ projectKey, layerId }) => projectKey === fixture.key && layerId === fixture.neighbor.id,
      )
      assert.equal(ordinary.layerName, fixture.neighbor.name)
      assert.ok((await fetchBytes(ordinary.imageUrl)).equals(fixture.neighborBytes))
    }
    await screenshot('06-global-portable-identities-1440')
    await savedModal().getByRole('button', { name: 'Close', exact: true }).click()
    await expect(savedModal()).toBeHidden()
    check(
      'Global Saved generations retains separate portable-copy path identities, every saved nested variant and the ordinary neighbor with exact signed previews',
    )
    await navigateSaved(original, inactive, '07-global-inactive-1440', false, true)
    const sameParent = {
      name: 'Open-browser same-parent control',
      status: 'started',
      fromParentId: inactive.ownerId,
      fromVariantId: inactive.value.id,
      toParentId: original.variants[6].ownerId,
      toVariantId: original.variants[6].value.id,
      steps: [
        'Keep the existing Variants browser open',
        'Open Saved generations',
        'Click another inactive variant of the same owner',
        'Require settled exact article focus, From history and unchanged full state',
      ],
      before: await witness(original),
    }
    report.openBrowserTransitions = [sameParent]
    checkpoint()
    await navigateSaved(
      original,
      original.variants[6],
      '07a-global-open-same-parent-control',
      false,
      true,
    )
    sameParent.status = 'passed'
    check(
      'Saved navigation with Variants already open retains exact focus and state for another variant of the same parent',
    )
    const crossParent = {
      name: 'Open-browser cross-parent regression',
      status: 'started',
      fromParentId: original.variants[6].ownerId,
      fromVariantId: original.variants[6].value.id,
      toParentId: hidden.ownerId,
      toVariantId: hidden.value.id,
      steps: [
        'Keep Patch A Variants browser open after the same-parent control',
        'Open Saved generations without manually closing Patch A',
        'Click Patch B inactive variant in the same project tab',
        'Require Patch B settled article focus and From history; reject a blank sidebar or cleared owner',
        'Require unchanged active identities, document, Undo, camera, package, shadow and saved history',
      ],
      before: await witness(original),
    }
    report.openBrowserTransitions.push(crossParent)
    checkpoint()
    await navigateSaved(original, hidden, '07b-global-open-cross-parent-regression')
    crossParent.status = 'passed'
    check(
      'Saved navigation from an open Patch A browser to Patch B preserves the new owner and exact settled variant focus without activation or other mutation',
    )
    await setNativeSize(900, 620)
    await openSaved()
    const globalScroll = await assertScroll(savedModal(), '.history-scroll')
    await savedModal().getByRole('button', { name: 'Close', exact: true }).click()
    await expect(savedModal()).toBeHidden()
    await navigateSaved(original, hidden, '08-global-hidden-locked-900', true)
    check(
      'Global actual row click and 900x620 keyboard navigation focus exact inactive/hidden/locked variants while preserving full state and reachable scroll controls',
      { globalScroll },
    )

    await setNativeSize(1440, 900)
    await closeProject(original)
    const savedHash = digest(readFileSync(original.path))
    await openSaved()
    await savedRow(original, inactive.value.id).getByRole('button').click()
    await expect(savedModal()).toBeHidden()
    await focused(original, inactive)
    const reopened = await current()
    assert.equal(reopened.dirty, false)
    assert.equal(reopened.canUndo, false)
    assert.equal(
      reopened.layers.find(({ id }) => id === inactive.ownerId).activeRasterSubLayerId,
      active.value.id,
    )
    assert.equal(digest(readFileSync(original.path)), savedHash)
    await settledVariantFocus(inactive)
    await screenshot('09-global-real-reopen')
    await closeBrowser()
    await revealedParent(original, inactive)
    check(
      'Saved-generation UI reopens the closed real package and focuses the exact inactive variant without activating it or dirtying the document',
    )
    const originalCameraForCrossProject = await prepareCameraBaseline(original)

    await window.getByRole('tab', { name: 'Home', exact: true }).click()
    await window.getByRole('button', { name: `Open ${portable.title}`, exact: true }).click()
    const recovery = window.getByRole('dialog', { name: 'Recovery available', exact: true })
    await expect(recovery).toBeVisible()
    await recovery.getByRole('button', { name: 'Recover', exact: true }).click()
    await expect(window.getByRole('tab', { name: portable.title, exact: true })).toBeVisible()
    const recovered = await current(portable)
    assert.equal(recovered.dirty, true)
    assert.equal(
      recovered.generationDraft.positivePrompt.text,
      'Unsaved portable-copy prompt must survive navigation',
    )
    assert.equal(
      recovered.acceptedResults.some(({ layerId }) => layerId === portable.missing.value.id),
      false,
    )
    assert.ok(
      recovered.layers
        .find(({ id }) => id === portable.changed.ownerId)
        .rasterSubLayers.some(({ id }) => id === portable.changed.value.id),
    )
    for (const target of [portable.missing, portable.changed]) {
      await openSaved()
      const before = await witness(portable)
      await savedRow(portable, target.value.id).getByRole('button').click()
      await expect(savedModal()).toBeHidden()
      await expect(
        window.getByText(
          'This saved result is not available in the current project. Your unsaved changes were preserved.',
          { exact: true },
        ),
      ).toBeVisible()
      await expect(browser()).toBeHidden()
      await unchanged(before, portable, `dirty-refusal-${target.value.id}`)
      await screenshot(
        target === portable.missing ? '10-dirty-missing-refusal' : '11-dirty-changed-refusal',
      )
    }
    await snapshot('12-dirty-refusals')
    check(
      'Missing and changed current variants both refuse saved navigation with a visible preservation notice; unsaved copy, settings, Undo, shadow, package and index remain exact',
    )

    await crossProjectRoundTrip(originalCameraForCrossProject)

    await navigateSaved(portable, hidden, '13-dirty-copy-valid-hidden-locked')
    await openSaved()
    const neighborBefore = await witness(portable)
    await savedRow(portable, portable.neighbor.id).getByRole('button').click()
    await expect(savedModal()).toBeHidden()
    await expect(browser()).toBeHidden()
    const ordinaryRow = window
      .getByLabel('Project layers', { exact: true })
      .locator(`[data-layer-id="${portable.neighbor.id}"]`)
    await expect(
      ordinaryRow.getByRole('button', { name: `Select ${portable.neighbor.name}`, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
    await unchanged(neighborBefore, portable, 'ordinary-neighbor-navigation')
    await screenshot('14-ordinary-neighbor-control')
    check(
      'Valid hidden locked variant and ordinary Raster neighbor still navigate inside the dirty portable copy without altering unsaved work',
    )
  }

  await noRuntime()
  assert.deepEqual(report.pageErrors, [])
  assert.equal(report.samplerError, undefined)
  assert.deepEqual(hashes(sourceFiles), report.sourceSha256, 'Source changed during qualification')
  assert.deepEqual(hashes(bundleFiles), report.bundleSha256, 'Build changed during qualification')
  await closeProject(portable, true)
  await closeProject(original, scenario === 'cross-project')
  await closeNative('completed-history-qualification')
  check(
    'Source/build hashes stay fixed; native actor and observed descendants physically exit under owned finite limits',
  )
  report.outcome = 'passed'
} catch (error) {
  report.outcome = 'failed'
  report.error = { message: String(error), stack: error.stack }
  const transition =
    report.crossProjectTransitions?.findLast(({ status }) => status === 'started') ??
    report.openBrowserTransitions?.findLast(({ status }) => status === 'started')
  if (transition) {
    transition.status = 'failed'
    transition.error = String(error)
  }
  process.exitCode = 1
  if (window) {
    try {
      await screenshot('failure')
    } catch (failure) {
      report.screenshotError = String(failure)
    }
  }
} finally {
  if (application) {
    try {
      await closeNative('aborted-qualification-cleanup', true)
    } catch (error) {
      report.cleanupError = String(error)
      process.exitCode = 1
    }
  }
  clearInterval(sampler)
  await sampling
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
  }
  if (!report.cleanup.physicalExitConfirmed) {
    report.outcome = 'failed'
    process.exitCode = 1
  }
  for (const snapshot of report.snapshots) {
    assert.equal(
      digest(readFileSync(snapshot.path)),
      snapshot.sha256,
      'Retained evidence bytes changed',
    )
  }
  report.fullQualificationPassed = scenario === 'full' && report.outcome === 'passed'
  lifecycle.state = 'retained'
  checkpoint()
  console.log(
    JSON.stringify({
      outcome: report.outcome,
      scenario,
      fullQualificationPassed: report.fullQualificationPassed,
      checkCount: report.checkCount,
      reportFile,
      payloads: report.payloads,
    }),
  )
}
