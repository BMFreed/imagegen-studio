/**
 * Root-run portable native qualification, after a fresh app:build: pnpm exec tsx
 * scripts/smoke-smart-patch-result-preset.mjs --report-file ABSOLUTE_NEW_REPORT
 *
 * Authoring this script does not qualify the flow. Literal accepted PNG/provenance fixtures are
 * declared preconditions, written through ProjectSession/.igs/ShadowStore, never inferred ML or
 * acceptance results. No worker, runtime, model catalog, provisioning or repository mutation. Root
 * owns runs/smart-patch-result-preset/20261022-portable and serial execution. Require a <=2 GiB /
 * zero-swap launcher service, RuntimeMaxSec<=600, TimeoutStopSec<=90 and KillMode=control-group.
 * Actual KDE native groups receive <=2 GiB / zero swap and an owned 360-second timer. The launcher
 * bounds both serial native actors together. Fifteen finite checks. All run payloads stay in the
 * new report's .artifacts directory, except a separately declared short artifact-root temporary
 * directory needed for Chromium's Unix socket limit; no runner cleanup. Resource, fixture, snapshot
 * and native geometry patterns reuse smoke-smart-patch-history.mjs; detached manager, source guards
 * and SQLite authoring reuse smoke-preset-save-result.mjs.
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
import { isSmartResultPresetData } from '../src/shared/projects/smart-result-preset.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
  stopExpiredQualificationProcess,
} from './qualification-resource-limits.mjs'

assert.equal(process.argv.length, 4, 'Use --report-file ABSOLUTE_NEW_REPORT')
assert.equal(process.argv[2], '--report-file')
const root = realpathSync(process.cwd())
const reportFile = process.argv[3]
assert.ok(path.isAbsolute(reportFile) && path.resolve(reportFile) === reportFile)
assert.equal(existsSync(reportFile), false, 'Never overwrite an earlier report')
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const ownedRun = path.join(artifactRoot, 'runs/smart-patch-result-preset/20261022-portable')
const evidenceParent = path.dirname(reportFile)
const relativeParent = path.relative(ownedRun, evidenceParent)
assert.ok(!relativeParent.startsWith('..') && !path.isAbsolute(relativeParent))
assert.equal(realpathSync(evidenceParent), evidenceParent, 'Existing canonical parent required')
assert.ok(lstatSync(evidenceParent).isDirectory() && !lstatSync(evidenceParent).isSymbolicLink())
const evidenceRoot = `${reportFile}.artifacts`
assert.equal(existsSync(evidenceRoot), false)
// Reserve the report before creating payloads. Subsequent checkpoints update only this new file.
writeFileSync(reportFile, '{}\n', { flag: 'wx', mode: 0o600 })
mkdirSync(evidenceRoot, { mode: 0o700 })
const fixtureRoot = mkdtempSync(path.join(evidenceRoot, 'result-preset-payload-'))
const appDataRoot = path.join(fixtureRoot, 'data/imagegen-studio')
const workspace = path.join(appDataRoot, 'workspaces/Uncategorized')
mkdirSync(workspace, { recursive: true, mode: 0o700 })
assert.equal(realpathSync(artifactRoot), artifactRoot)
const temporaryDirectory = mkdtempSync(path.join(artifactRoot, 'sp-preset-tmp-'))
const previousTemporaryDirectory = process.env.TMPDIR
// Playwright's launcher-owned temporary directories also belong to this run, not global /tmp.
process.env.TMPDIR = temporaryDirectory
const nativeDeadlineSeconds = 360
const nativeExec = promisify(execFile)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const projectTitle = 'Smart result detached presets'
const roots = {
  placeholdersDir: path.join(root, 'dist/main/placeholders'),
  scratchDir: path.join(fixtureRoot, 'writer-scratch'),
}
const modes = ['txt2img', 'img2img', 'inpaint', 'outpaint']
const nativeChecks = []
const observed = new Map()
const created = []
let application, window, nativeProcess, sampler, fixture, baseline
let sampling = Promise.resolve()
let sourceFiles, bundleFiles
let heldReply = false
let createFailureTriggerInstalled = false
let createFailureSchema
const createFailureTriggerName = 'igs_smart_result_preset_owned_failure'
const createFailureTriggerSql = `CREATE TRIGGER ${createFailureTriggerName} BEFORE INSERT ON presets BEGIN SELECT RAISE(ABORT, 'Owned Smart Result Preset INSERT failure'); END`
const report = {
  schemaVersion: 1,
  outcome: 'running',
  startedAt: new Date().toISOString(),
  command: {
    cwd: root,
    executable: process.execPath,
    execArgv: process.execArgv,
    argv: process.argv,
  },
  evidenceRoot,
  fixtureRoot,
  payloads: [fixtureRoot, temporaryDirectory],
  checks: [],
  screenshots: [],
  snapshots: [],
  witnesses: [],
  layoutChecks: [],
  viewportChecks: [],
  readbacks: [],
  pageErrors: [],
  nativeLogs: [],
  resourceLimitChecks: [],
  nativeClosures: [],
  boundary: {
    actual:
      'Production ProjectSession/.igs/ShadowStore, startup recovery/indexing, original Main IPC/preload, built layer menus and per-variant button, existing detached Preset Manager, real SQLite INSERT failure/explicit retry/Create/Save and physical native restart.',
    precondition:
      'Literal ICC PNGs and strict accepted Illustrious/Anima Smart provenance are prepared inputs, including converted Raster carriers. Their acceptance/inference and conversion are not exercised. Current Project and layer drafts deliberately differ from concrete recorded prompts/settings.',
    oracle:
      'Independent recorded-field projection, exact request echo, actual stored SQLite rows and full source witnesses. Both families/all four recorded modes use smartPatch; geometry/Seed/batch/source/execution/components are excluded. Anima sidecars remain empty and precision Auto as required by its current schema.',
    limits:
      'Launcher <=2GiB/zero swap/RuntimeMaxSec<=600/TimeoutStopSec<=90/KillMode=control-group; actual native groups <=2GiB/zero swap/360s timer; unique launcher/native aggregate <=4GiB. Two serial actors, no worker or catalog.',
    excluded:
      'ML/acceptance/conversion qualification, model installation, Smart Compare implementation, full MVP, release packaging and independent visual PASS. Root must actually inspect the retained full-window screenshots.',
    cleanup:
      'No runner deletion. Exact prepared PNG/provenance/source.igs/autosaves and consistent SQLite backups remain outside disposable fixtureRoot, all within evidenceRoot. Root releases payloads only after physical exit, restored probes and retained-byte verification.',
  },
}
const lifecycle = {
  schemaVersion: 1,
  owner: { repository: root, task: 'smart-patch-result-preset', run: reportFile },
  state: 'running',
  lastUsedAt: report.startedAt,
  evidence: [reportFile, evidenceRoot],
  payloads: [fixtureRoot, temporaryDirectory],
  dependsOn: [],
  usedBy: [],
  pins: [
    { path: fixtureRoot, reason: 'Root disposal after physical exit and retained-byte checks' },
    {
      path: temporaryDirectory,
      reason: 'Short Chromium Unix socket path; root disposal after physical exit',
    },
  ],
}
function checkpoint() {
  lifecycle.lastUsedAt = new Date().toISOString()
  writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  writeFileSync(
    path.join(evidenceRoot, 'artifact-lifecycle.json'),
    JSON.stringify(lifecycle, null, 2) + '\n',
    { mode: 0o600 },
  )
}
function check(name, evidence = {}) {
  assert.ok(report.checks.length < 15, 'Keep this qualification finite')
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
  assert.equal(existsSync(target), false, `Snapshot already exists: ${relativeName}`)
  assert.ok(lstatSync(source).isFile() && !lstatSync(source).isSymbolicLink())
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })
  copyFileSync(source, target)
  const bytes = readFileSync(source)
  assert.ok(readFileSync(target).equals(bytes), 'Retained snapshot differs from source')
  report.snapshots.push({ path: target, bytes: bytes.length, sha256: digest(bytes) })
  return target
}
function retainJson(relativeName, value) {
  const file = path.join(evidenceRoot, relativeName)
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n')
  writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 })
  report.snapshots.push({ path: file, bytes: bytes.length, sha256: digest(bytes) })
}

// Keep all agreed labels/transport assumptions here; no fallback that silently skips a case.
const adapter = {
  method: 'getSmartResultPresetData',
  channel: 'projects:get-smart-result-preset-data',
  saveLabel: 'Save Preset from Result',
  sourceBanner: () => manager().getByRole('alert', { name: 'Source result', exact: true }),
  request: (tab, source) => ({
    documentId: tab.documentId,
    documentRevision: tab.documentRevision,
    owner:
      source.kind === 'variant'
        ? { kind: 'smart-patch-variant', layerId: source.owner.id, variantId: source.value.id }
        : { kind: 'raster', layerId: source.value.id },
    assetSha256: source.value.asset.sha256,
  }),
  parentMenu: (source) =>
    projectView().getByRole('button', {
      name: `Layer actions for ${source.owner?.name ?? source.value.name}`,
      exact: true,
    }),
  inactiveButton: (source) =>
    browser()
      .locator(`[data-smart-patch-variant-id="${source.value.id}"]`)
      .getByRole('button', {
        name: `Save Preset from Result for ${source.value.name}`,
        exact: true,
      }),
  warningText: 'Unavailable or incompatible resources remain saved.',
}
const projectView = () => window.getByLabel(`Project ${projectTitle}`, { exact: true })
const canvas = () => projectView().getByRole('region', { name: 'Project Canvas', exact: true })
const manager = () => window.getByRole('dialog', { name: 'Preset Manager', exact: true })
const browser = () => window.getByRole('dialog', { name: 'Smart Patch variants', exact: true })
const footer = () => manager().getByLabel('Preset editor actions', { exact: true })
const nameInput = () => manager().getByRole('textbox', { name: 'Preset name', exact: true })
async function api(scope, method, ...args) {
  const result = await rawApi(scope, method, ...args)
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}
async function rawApi(scope, method, ...args) {
  return window.evaluate(({ scope, method, args }) => window.api[scope][method](...args), {
    scope,
    method,
    args,
  })
}
async function current() {
  const opened = await api('projects', 'open', fixture.key)
  assert.equal(opened.kind, 'opened')
  return opened.tab
}
function reference(family, kind, label) {
  return {
    baseModelFamily: family,
    civitaiFileId: 10401,
    civitaiModelId: 10501,
    civitaiVersionId: 10601,
    displayName: label,
    fileSha256: digest(Buffer.from(label)),
    kind,
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: kind === 'checkpoint' && family === 'illustrious' ? 'v_prediction' : null,
    versionName: 'Exact recorded absent version',
  }
}
function makeVariant(document, family, mode, index) {
  const value = smartPatchVariantMetadataFixture(family)
  const bbox = { width: 32, height: 24, x: 128 + index * 4, y: 96 }
  const bytes = literalSmartPatchColorPng(
    bbox.width,
    bbox.height,
    Array(bbox.width * bbox.height)
      .fill([40 + index * 7, family === 'anima' ? 70 : 130, 180, 255])
      .flat(),
    4,
  )
  value.name = `${family} recorded ${mode} contribution ${index}`
  value.bbox = bbox
  Object.assign(value.asset, { bytes: bytes.length, height: 24, width: 32, sha256: digest(bytes) })
  const provenance = value.generationProvenance
  const config = provenance.generationConfiguration
  config.mode = mode
  config.model = reference(family, 'checkpoint', `${family} recorded ${mode} checkpoint`)
  config.positivePrompt = {
    text: `Concrete ${family} ${mode}: (blue lantern:-0.5), literal 日本語\nsecond line`,
    embeddingRefs: [],
  }
  config.negativePrompt = {
    text: `Concrete negative ${family} ${mode}: (blur:0.25)`,
    embeddingRefs: [],
  }
  if (family === 'illustrious') {
    for (const [field, token] of [
      ['positivePrompt', '<recorded-vector>'],
      ['negativePrompt', '<negative-vector>'],
    ]) {
      config[field].text += ` ${token}`
      config[field].embeddingRefs = [
        { token, resource: reference(family, 'embedding', `${mode} ${token}`) },
      ]
    }
    config.vae = reference(family, 'vae', `${mode} external recorded VAE`)
    config.vaePrecision = 'FP32'
    Object.assign(config.sampling, {
      sampler: 'DPM++ 2M',
      scheduler: 'Karras',
      invokeScheduler: 'dpmpp_2m_k',
      noiseProfile: {
        baseSchedule: 'sdxl-scaled-linear-v1',
        rescaleBetasZeroSnr: true,
        schemaVersion: 1,
        timestepSpacing: 'trailing',
      },
    })
  } else config.sampling.animaMethod = index % 2 ? 'heun' : 'euler'
  config.loras = [
    {
      enabled: true,
      weight: -0.35,
      resource: reference(family, 'lora', `${family} ${mode} signed LoRA`),
    },
    {
      enabled: false,
      weight: 0.6,
      resource: reference(family, 'lora', `${family} ${mode} disabled LoRA`),
    },
    {
      enabled: true,
      weight: 0,
      resource: reference(family, 'lora', `${family} ${mode} zero LoRA`),
    },
  ]
  Object.assign(config.sampling, {
    actualSeed: index,
    requestedSeedPolicy: 'reuse',
    seedBehavior: 'per-prompt',
    steps: 31 + index,
    cfgScale: 7.25,
  })
  if (mode === 'txt2img') delete config.sampling.denoisingStrength
  else config.sampling.denoisingStrength = mode === 'img2img' ? 0 : 0.65
  // Exercise historical omission versus recorded zero/empty without introducing current defaults.
  if (family === 'illustrious' && mode === 'outpaint')
    for (const field of ['loras', 'vae', 'cfgRescale', 'vaePrecision']) delete config[field]
  if (family === 'anima' && mode === 'txt2img') config.loras = []
  const owner = {
    id: randomUUID(),
    name: `${family} ${mode} source Patch`,
    kind: 'smart-patch',
    activeRasterSubLayerId: value.id,
    blendMode: 'normal',
    boundingBox: { width: 512, height: 512, x: 0, y: 0 },
    internalResolution: { width: 512, height: 512 },
    generationDraft: structuredClone(document.generationDraft),
    mask: { asset: null, id: randomUUID(), revision: 0 },
    locked: family === 'anima',
    visible: family !== 'anima',
    opacity: 1,
    rasterSubLayers: [value],
  }
  owner.generationDraft.positivePrompt = {
    text: 'Authored Patch {red|green} differs from concrete result',
    embeddingRefs: [],
  }
  const source = provenance.layerSourceContext
  Object.assign(source, {
    bbox: { ...bbox },
    layerId: owner.id,
    sourceDocumentId: document.documentId,
    sourceDocumentRevision: document.documentRevision,
  })
  // The historical authored draft owns the exact recorded checkpoint. Current owner/Project
  // drafts deliberately differ; production provenance validators retain their full strength.
  source.generationDraft.model = structuredClone(config.model)
  if (mode === 'txt2img') source.preparedInputs.modelSource = null
  Object.assign(source.sourceTarget, { width: 32, height: 24 })
  Object.assign(source.preparedInputs.finalContributionMask, { width: 32, height: 24 })
  const output = provenance.executionResultContext.output
  Object.assign(output, {
    byteSize: bytes.length,
    width: 32,
    height: 24,
    sha256: digest(bytes),
    contributionAlpha8: {
      byteSize: 32 * 24,
      width: 32,
      height: 24,
      sha256: digest(Buffer.alloc(32 * 24, 255)),
    },
  })
  return { kind: 'variant', family, mode, bytes, value, owner }
}
function raster(name, bytes, generationProvenance) {
  const id = randomUUID()
  const value = {
    id,
    name,
    kind: 'raster',
    visible: true,
    locked: true,
    opacity: 1,
    blendMode: 'normal',
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 128, y: 96 },
    asset: {
      path: `assets/layers/${id}.png`,
      bytes: bytes.length,
      width: 32,
      height: 24,
      sha256: digest(bytes),
    },
    ...(generationProvenance
      ? { generationProvenance: structuredClone(generationProvenance) }
      : {}),
  }
  return { kind: 'raster', bytes, value }
}
async function prepare() {
  const packagePath = path.join(workspace, `${projectTitle}.igs`)
  const session = await ProjectSession.create(packagePath, projectTitle, roots)
  const variants = ['illustrious', 'anima'].flatMap((family, familyIndex) =>
    modes.map((mode, index) =>
      makeVariant(session.document, family, mode, familyIndex * 4 + index),
    ),
  )
  const inactive = makeVariant(session.document, 'illustrious', 'inpaint', 8)
  inactive.owner = variants[0].owner
  inactive.value.generationProvenance.layerSourceContext.layerId = inactive.owner.id
  inactive.owner.rasterSubLayers.push(inactive.value)
  const converted = [variants[2], variants[6]].map((source) => ({
    ...raster(
      `${source.family} converted Smart provenance Raster`,
      source.bytes,
      source.value.generationProvenance,
    ),
    family: source.family,
    mode: source.mode,
  }))
  const ordinary = raster(
    'Ordinary accepted Raster neighbor',
    variants[0].bytes,
    acceptedRasterProvenanceFixture(session.document, variants[0].bytes, {
      width: 32,
      height: 24,
      x: 128,
      y: 96,
    }),
  )
  const imported = raster('Imported no-provenance neighbor', variants[0].bytes)
  const empty = {
    ...structuredClone(variants[0].owner),
    id: randomUUID(),
    mask: { ...variants[0].owner.mask, id: randomUUID() },
    name: 'Empty no-result Patch',
    activeRasterSubLayerId: null,
    rasterSubLayers: [],
  }
  session.applyDocument({
    ...session.document,
    generationDraft: {
      ...session.document.generationDraft,
      positivePrompt: { text: 'Current authored {red|green} Project template', embeddingRefs: [] },
      negativePrompt: { text: 'Current authored negative template', embeddingRefs: [] },
      seed: { policy: 'fixed', value: 918273 },
      sampling: { ...session.document.generationDraft.sampling, cfgScale: 6, steps: 24 },
    },
    lastActualSeedSnapshot: 918273,
    layers: [
      ...variants.map(({ owner }) => owner),
      ...converted.map(({ value }) => value),
      ordinary.value,
      imported.value,
      empty,
    ],
  })
  const inputs = [...variants, inactive, ...converted, ordinary, imported]
  await session.save({
    assets: Object.fromEntries(inputs.map(({ value, bytes }) => [value.asset.path, { bytes }])),
  })
  const saved = (await readIgsPackage(packagePath)).project
  session.applyDocument({
    ...saved,
    generationDraft: {
      ...saved.generationDraft,
      positivePrompt: {
        text: 'Recovered unsaved Project {day|night} draft must survive preset work',
        embeddingRefs: [],
      },
    },
  })
  await new ProjectShadowStore(path.join(appDataRoot, 'autosave')).write({
    document: session.document,
    projectPath: packagePath,
    savedDocument: saved,
  })
  fixture = {
    key: session.localRecoveryKey,
    path: packagePath,
    saved,
    recovered: session.document,
    variants,
    inactive,
    converted,
    ordinary,
    imported,
    empty,
    inputs,
  }
  const loaded = await readIgsPackage(packagePath)
  for (const input of inputs) {
    assert.ok(
      (await loaded.readMember(input.value.asset.path)).equals(input.bytes),
      'Prepared PNG differs in .igs',
    )
    const target = path.join(fixtureRoot, `${input.value.id}.png`)
    writeFileSync(target, input.bytes, { flag: 'wx', mode: 0o600 })
    retain(target, `prepared/inputs/${input.value.id}.png`)
  }
  retain(packagePath, 'prepared/source.igs')
  retainJson('prepared/provenance-and-source.json', {
    projectKey: fixture.key,
    saved,
    recovered: fixture.recovered,
    inputs: inputs.map(({ bytes, ...input }) => ({ ...input, pngSha256: digest(bytes) })),
    boundary: report.boundary.precondition,
  })
  for (const file of filesBelow(path.join(appDataRoot, 'autosave')))
    retain(file, `prepared/${path.relative(appDataRoot, file)}`)
  check(
    '01 Portable input precondition: exact PNG/provenance/.igs and unsaved shadow retained; no acceptance/inference claim',
  )
}

// Independent oracle: do not call the implementation's projection or trust its returned payload.
function expectedPayload(source) {
  const config = source.value.generationProvenance.generationConfiguration
  const payload = {
    prompt: structuredClone(config.positivePrompt),
    negativePrompt: structuredClone(config.negativePrompt),
    model: structuredClone(config.model),
    sampling:
      'anima' in config
        ? { animaMethod: config.sampling.animaMethod }
        : { sampler: config.sampling.sampler, scheduler: config.sampling.scheduler },
    guidance: { cfgScale: config.sampling.cfgScale, steps: config.sampling.steps },
  }
  for (const field of ['loras', 'vae', 'cfgRescale', 'vaePrecision'])
    if (Object.hasOwn(config, field)) payload[field] = structuredClone(config[field])
  if (config.sampling.noiseProfile)
    payload.model.noiseProfile = structuredClone(config.sampling.noiseProfile)
  if (Object.hasOwn(config.sampling, 'denoisingStrength'))
    payload.denoisingStrength = config.sampling.denoisingStrength
  if (!source.value.generationProvenance.kind.endsWith('smart-patch'))
    payload.size = structuredClone(config.size)
  return payload
}
function assertDetached(record, source) {
  const smart = source.value.generationProvenance.kind.endsWith('smart-patch')
  assert.equal(record.workflow, smart ? 'smartPatch' : 'textToImage')
  assert.deepEqual(record.payload, expectedPayload(source), 'Exact recorded projection differs')
  const serialized = JSON.stringify(record)
  const provenance = source.value.generationProvenance
  for (const id of [
    fixture.key,
    fixture.saved.documentId,
    provenance.layerSourceContext.sourceDocumentRevision,
    provenance.executionResultContext.candidateId,
    provenance.executionResultContext.queueItemId,
    source.value.id,
    ...(source.owner ? [source.owner.id] : []),
  ])
    assert.equal(serialized.includes(id), false, `Preset leaked source identity ${id}`)
  for (const key of [
    'seed',
    'batchSize',
    'batch',
    'maxPrompts',
    'dynamicPrompt',
    'mask',
    'bbox',
    'internalResolution',
    'source',
    'sourceId',
    'executionResultContext',
    'layerSourceContext',
    'anima',
    'mode',
    'actualSeed',
    'requestedSeedPolicy',
  ])
    assert.equal(Object.hasOwn(record.payload, key), false, `Preset contains excluded ${key}`)
  if (smart) assert.equal(Object.hasOwn(record.payload, 'size'), false)
  if (provenance.generationConfiguration.anima)
    for (const component of [
      provenance.generationConfiguration.anima.qwen3Encoder,
      provenance.generationConfiguration.anima.vae,
    ])
      assert.equal(serialized.includes(component.sha256), false, 'Anima component identity leaked')
}
async function readSmart(source) {
  const tab = await current()
  const request = adapter.request(tab, source)
  const data = await api('projects', adapter.method, tab.id, request)
  for (const key of ['documentId', 'documentRevision', 'owner', 'assetSha256'])
    assert.deepEqual(data[key], request[key])
  assert.equal(data.resultId, source.value.id)
  assert.equal(data.workflow, 'smartPatch')
  assert.deepEqual(data.payload, expectedPayload(source))
  report.readbacks.push({ request, data })
  return { tab, request, data }
}
function withDatabase(use) {
  const database = new Database(path.join(appDataRoot, 'database/app.sqlite'), {
    readonly: true,
    fileMustExist: true,
  })
  try {
    return use(database)
  } finally {
    database.close()
  }
}
function tableRows(database, table) {
  assert.match(table, /^[a-z_]+$/)
  return database
    .prepare(`SELECT * FROM ${table}`)
    .all()
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}
function storedPresets() {
  return withDatabase((database) => tableRows(database, 'presets'))
}
function schemaDefinitions() {
  return withDatabase((database) =>
    database
      .prepare(
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
      )
      .all(),
  )
}
function installCreateFailureTrigger() {
  assert.equal(createFailureTriggerInstalled, false)
  createFailureSchema = schemaDefinitions()
  assert.equal(
    createFailureSchema.some(({ name }) => name === createFailureTriggerName),
    false,
    'Refuse to replace an existing trigger',
  )
  const database = new Database(path.join(appDataRoot, 'database/app.sqlite'), {
    fileMustExist: true,
  })
  try {
    database.exec(createFailureTriggerSql)
    createFailureTriggerInstalled = true
  } finally {
    database.close()
  }
  const installed = schemaDefinitions().find(({ name }) => name === createFailureTriggerName)
  assert.equal(installed.sql, createFailureTriggerSql)
  report.createRetry.trigger = {
    name: createFailureTriggerName,
    sql: installed.sql,
    originalDefinitions: createFailureSchema,
    originalDefinitionsSha256: digest(Buffer.from(JSON.stringify(createFailureSchema))),
  }
  checkpoint()
}
function removeCreateFailureTrigger() {
  if (!createFailureTriggerInstalled) return
  const currentDefinitions = schemaDefinitions()
  const installed = currentDefinitions.find(({ name }) => name === createFailureTriggerName)
  assert.equal(
    installed?.sql,
    createFailureTriggerSql,
    'Refuse to remove an altered or foreign trigger',
  )
  assert.deepEqual(
    currentDefinitions.filter(({ name }) => name !== createFailureTriggerName),
    createFailureSchema,
    'Unrelated schema definitions changed while the owned trigger was installed',
  )
  const database = new Database(path.join(appDataRoot, 'database/app.sqlite'), {
    fileMustExist: true,
  })
  try {
    database.exec(`DROP TRIGGER ${createFailureTriggerName}`)
    createFailureTriggerInstalled = false
  } finally {
    database.close()
  }
  const restored = schemaDefinitions()
  // DDL can change SQLite's page layout/schema counter. The SQL definition bytes and all
  // preexisting schema objects must return exactly; no claim of a byte-identical database file.
  assert.equal(JSON.stringify(restored), JSON.stringify(createFailureSchema))
  report.createRetry.trigger.restoration = {
    absent: !restored.some(({ name }) => name === createFailureTriggerName),
    definitionsByteExact: true,
    restoredDefinitionsSha256: digest(Buffer.from(JSON.stringify(restored))),
  }
  checkpoint()
}
function sourceRows() {
  return withDatabase((database) =>
    Object.fromEntries(
      [
        'project_index',
        'project_accepted_result_index',
        'generation_seed_cursor',
        'checkpoint_prediction_override',
        'checkpoint_noise_profile_override',
        'model_resource',
        'model_resource_version',
        'local_model_file',
        'model_version_dependency',
        'generation_queue_item',
        'generation_candidate_receipt',
        'generation_acceptance_journal',
      ].map((table) => [table, tableRows(database, table)]),
    ),
  )
}
function shadowHashes() {
  return Object.fromEntries(
    filesBelow(path.join(appDataRoot, 'autosave')).map((file) => [
      path.relative(appDataRoot, file),
      digest(readFileSync(file)),
    ]),
  )
}
async function witness(includeCamera = true) {
  const camera = includeCamera
    ? await canvas()
        .locator('.canvas-area')
        .evaluate((node) => ({
          x: node.dataset.cameraX,
          y: node.dataset.cameraY,
          scale: node.dataset.cameraScale,
        }))
    : undefined
  if (includeCamera)
    assert.ok(
      Object.values(camera).every((value) => value !== undefined && Number.isFinite(Number(value))),
    )
  return {
    tab: await current(),
    camera,
    packageSha256: digest(readFileSync(fixture.path)),
    shadows: shadowHashes(),
    sourceRows: sourceRows(),
    mutations: await mutationCalls(),
  }
}
async function unchanged(before, label, camera = true) {
  const after = await witness()
  const comparable = (value) => (camera ? value : { ...value, camera: undefined })
  assert.deepEqual(
    comparable(after),
    comparable(before),
    `${label}: source/Undo/draft/active result/camera/package/shadow/index/seed/library changed`,
  )
  report.witnesses.push({ label, compareCamera: camera, before, after })
  checkpoint()
}
async function snapshot(label) {
  const directory = path.join(evidenceRoot, label)
  mkdirSync(directory, { mode: 0o700 })
  const file = path.join(directory, 'app.sqlite')
  const source = new Database(path.join(appDataRoot, 'database/app.sqlite'), {
    readonly: true,
    fileMustExist: true,
  })
  let tables, expected
  try {
    tables = source
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map(({ name }) => name)
    expected = Object.fromEntries(tables.map((table) => [table, tableRows(source, table)]))
    await source.backup(file)
  } finally {
    source.close()
  }
  const copy = new Database(file, { readonly: true, fileMustExist: true })
  try {
    assert.deepEqual(copy.prepare('PRAGMA integrity_check').all(), [{ integrity_check: 'ok' }])
    assert.deepEqual(
      Object.fromEntries(tables.map((table) => [table, tableRows(copy, table)])),
      expected,
    )
  } finally {
    copy.close()
  }
  report.snapshots.push({
    path: file,
    bytes: lstatSync(file).size,
    sha256: digest(readFileSync(file)),
  })
  const retainedPackage = retain(fixture.path, `${label}/source.igs`)
  for (const entry of filesBelow(path.join(appDataRoot, 'autosave')))
    retain(entry, `${label}/${path.relative(appDataRoot, entry)}`)
  let tab
  try {
    tab = await current()
  } catch (error) {
    tab = { unavailable: String(error) }
  }
  retainJson(`${label}/readback.json`, {
    tables: expected,
    tab,
    referencedPackages: [{ canonicalPath: fixture.path, retainedPath: retainedPackage }],
    referencedInputs: fixture.inputs.map(({ value }) => ({
      member: value.asset.path,
      sha256: value.asset.sha256,
      retainedPng: path.join(evidenceRoot, `prepared/inputs/${value.id}.png`),
    })),
  })
  checkpoint()
}
async function openProject(recover) {
  await window.getByRole('button', { name: `Open ${projectTitle}`, exact: true }).click()
  if (recover) {
    const dialog = window.getByRole('dialog', { name: 'Recovery available', exact: true })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Recover', exact: true }).click()
  }
  // Keep the normal native expectation; a setup timeout must retain actual DOM/ARIA diagnostics.
  await expect(window.getByRole('tab', { name: projectTitle, exact: true })).toBeVisible()
  await expect(projectView()).toBeVisible()
  await expect(canvas().locator('.canvas-area')).toHaveAttribute('data-scene-ready', 'true')
  await canvas().getByRole('button', { name: 'Fit View', exact: true }).click()
}
async function openMenu(source) {
  const trigger = adapter.parentMenu(source)
  await trigger.scrollIntoViewIfNeeded()
  await trigger.click()
}
async function openSource(source, direct = false) {
  if (direct) {
    await projectView()
      .getByRole('button', { name: `Browse variants for ${source.owner.name}`, exact: true })
      .click()
    await expect(browser()).toBeVisible()
    const action = adapter.inactiveButton(source)
    await action.scrollIntoViewIfNeeded()
    await expect(action).toBeEnabled()
    await action.click()
  } else {
    await openMenu(source)
    await window
      .getByRole('menuitem', { name: adapter.saveLabel, exact: true })
      .and(window.locator('[aria-disabled="false"]'))
      .click()
  }
  await expect(manager()).toBeVisible()
  await expect(manager().getByRole('article', { name: 'Preset draft', exact: true })).toBeVisible()
  await expect(adapter.sourceBanner()).toContainText(projectTitle)
  await expect(adapter.sourceBanner()).toContainText(source.value.name)
  await expect(adapter.sourceBanner()).toContainText('expanded prompts')
  await expect(adapter.sourceBanner()).toContainText('Seed is not included by default')
  const smart = source.value.generationProvenance.kind.endsWith('smart-patch')
  await expect(manager().getByLabel('Preset workflow', { exact: true })).toContainText(
    smart ? 'Smart Patch' : 'Text to Image',
  )
  if (smart) {
    await expect(adapter.sourceBanner()).toContainText(/geometry|bounds|resolution/i)
    assert.equal(
      /\d+\s*[×x]\s*\d+/.test(await adapter.sourceBanner().innerText()),
      false,
      'Smart summary must omit dimensions',
    )
  }
  // Negative Prompt starts collapsed in the shared editor. Expand its real header before reading.
  await manager()
    .locator('[data-preset-section="negativePrompt"]')
    .getByText('Negative Prompt', { exact: true })
    .click()
  for (const [label, field] of [
    ['Preset prompt', 'positivePrompt'],
    ['Preset negative prompt', 'negativePrompt'],
  ]) {
    await expect(manager().getByRole('textbox', { name: label, exact: true })).toBeVisible()
    await expect
      .poll(async () =>
        (
          await manager()
            .getByRole('textbox', { name: label, exact: true })
            .locator('.cm-line')
            .allTextContents()
        ).join('\n'),
      )
      .toBe(source.value.generationProvenance.generationConfiguration[field].text)
  }
  await expect(
    manager().getByRole('checkbox', { name: 'Include Seed', exact: true }),
  ).not.toBeChecked()
  if (smart)
    await expect(
      manager().getByRole('checkbox', { name: 'Include Size', exact: true }),
    ).not.toBeChecked()
  await expect(manager().getByText(adapter.warningText, { exact: false })).toBeVisible()
  await expect(footer().getByRole('button', { name: 'Create Preset', exact: true })).toBeEnabled()
}
async function cancel() {
  await footer().getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(manager()).toHaveCount(0)
}
async function closeManager() {
  await manager().getByRole('button', { name: 'Close Preset Manager', exact: true }).click()
  await expect(manager()).toHaveCount(0)
}
async function failFirstCreate(source, before, previous, name) {
  const writesBefore = await presetWrites()
  const description = manager().getByRole('textbox', { name: 'Preset description', exact: true })
  const editedDescription = 'User-edited draft before actual SQLite INSERT failure'
  await description.fill(editedDescription)
  report.createRetry = {
    outcome: 'pending',
    name,
    beforeRows: previous,
    labels: {
      errorRole: 'alert',
      errorName: 'Preset action failed',
      errorCode: 'PRESET_STORAGE_FAILED',
      name: 'Preset name',
      description: 'Preset description',
      retry: 'Create Preset',
    },
  }
  installCreateFailureTrigger()
  try {
    await footer().getByRole('button', { name: 'Create Preset', exact: true }).click()
    const failure = manager().getByRole('alert', { name: 'Preset action failed', exact: true })
    await expect(failure).toContainText('PRESET_STORAGE_FAILED')
    await expect(
      manager().getByRole('article', { name: 'Preset draft', exact: true }),
    ).toBeVisible()
    await expect(nameInput()).toHaveValue(name)
    await expect(nameInput()).toBeEditable()
    await expect(description).toHaveValue(editedDescription)
    await expect(description).toBeEditable()
    await expect(adapter.sourceBanner()).toContainText(source.value.name)
    await expect(footer().getByRole('button', { name: 'Create Preset', exact: true })).toBeEnabled()
    await expect(
      manager().getByRole('button', { name: `Select preset ${name}`, exact: true }),
    ).toHaveCount(0)
    await expect
      .poll(async () =>
        (
          await manager()
            .getByRole('textbox', { name: 'Preset prompt', exact: true })
            .locator('.cm-line')
            .allTextContents()
        ).join('\n'),
      )
      .toBe(source.value.generationProvenance.generationConfiguration.positivePrompt.text)
    const failedWrites = (await presetWrites()).slice(writesBefore.length)
    assert.equal(failedWrites.length, 1)
    assert.equal(failedWrites[0].channel, 'presets:create')
    assert.equal(failedWrites[0].response.ok, false)
    assert.equal(failedWrites[0].response.error.code, 'PRESET_STORAGE_FAILED')
    assert.equal(
      Object.hasOwn(failedWrites[0].response, 'value'),
      false,
      'Failed Create published a record/ID',
    )
    assert.deepEqual(failedWrites[0].args[0].payload, expectedPayload(source))
    assert.deepEqual(storedPresets(), previous, 'Failed INSERT left a partial preset row/ID')
    assert.equal(
      (await api('presets', 'list')).some((record) => record.name === name),
      false,
    )
    await unchanged(
      before,
      'Actual failed Create preserves source/Undo/draft/active/camera/package/index/seed/library',
    )
    report.createRetry.failure = {
      alert: await failure.innerText(),
      draftName: await nameInput().inputValue(),
      draftDescription: await description.inputValue(),
      rows: storedPresets(),
      originalMainReply: failedWrites[0].response,
      createCall: failedWrites[0],
      storedOrPublishedId: false,
    }
    await screenshot('actual-create-insert-failure-1440x900')
    await snapshot('00a-actual-create-insert-failure')
    const continuedDescription = 'User-edited draft retained after actual SQLite INSERT failure'
    await description.fill(continuedDescription)
    await expect(description).toHaveValue(continuedDescription)
    report.createRetry.retryDescription = continuedDescription
  } finally {
    removeCreateFailureTrigger()
  }
  await snapshot('00b-create-trigger-restored-before-retry')
  return writesBefore.length
}
async function createFrom(source, direct = false) {
  const before = await witness()
  const previous = storedPresets()
  if (source !== fixture.ordinary) await readSmart(source)
  await openSource(source, direct)
  assert.deepEqual(storedPresets(), previous, 'Opening a detached draft allocated a row')
  const name = `Recorded recipe ${created.length + 1}: ${source.value.name}`
  await nameInput().fill(name)
  const retryWritesStart =
    created.length === 0 ? await failFirstCreate(source, before, previous, name) : null
  await footer().getByRole('button', { name: 'Create Preset', exact: true }).click()
  await expect(
    manager().getByRole('button', { name: `Select preset ${name}`, exact: true }),
  ).toBeVisible()
  const records = await api('presets', 'list')
  const record = records.find((value) => value.name === name)
  assert.ok(record)
  assertDetached(record, source)
  const rows = storedPresets()
  assert.equal(rows.length, previous.length + 1)
  assert.deepEqual(
    rows.filter(({ id }) => id !== record.id),
    previous,
  )
  const row = rows.find(({ id }) => id === record.id)
  assert.deepEqual(JSON.parse(row.payload_json), expectedPayload(source))
  assert.equal(row.workflow_type, source === fixture.ordinary ? 'txt2img' : 'inpaint')
  if (retryWritesStart !== null) {
    const writes = (await presetWrites()).slice(retryWritesStart)
    assert.equal(writes.length, 2, 'Require one failed Create and one explicit retry only')
    assert.ok(writes.every(({ channel }) => channel === 'presets:create'))
    assert.equal(writes[1].response.ok, true)
    assert.deepEqual(writes[1].response.value, record)
    assert.equal(record.description, report.createRetry.retryDescription)
    assert.equal(createFailureTriggerInstalled, false)
    report.createRetry.retry = {
      originalMainReply: writes[1].response,
      row,
      addedRows: rows.length - previous.length,
    }
  }
  await expect(adapter.sourceBanner()).toHaveCount(0)
  await closeManager()
  if (direct) {
    await expect(browser()).toBeVisible()
    await expect(adapter.inactiveButton(source)).toBeFocused()
    await window.getByRole('button', { name: 'Close Smart Patch variants', exact: true }).click()
    await expect(browser()).toBeHidden()
  }
  await unchanged(before, name)
  if (retryWritesStart !== null) report.createRetry.outcome = 'passed'
  created.push(record)
  report.created = created
  checkpoint()
}

// Reused native geometry/resource/physical-exit helpers from the history smoke.
async function screenshot(name) {
  await window.evaluate(() =>
    document.fonts.ready.then(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    ),
  )
  const file = path.join(evidenceRoot, `${name}.png`)
  await window.mouse.move(0, 0)
  await window.screenshot({ path: file, animations: 'disabled' })
  const size = await window.evaluate(() => [innerWidth, innerHeight])
  const png = readFileSync(file)
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], size)
  report.screenshots.push({ path: file, width: size[0], height: size[1], sha256: digest(png) })
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
  native.canvasSettlement = await window.evaluate(async () => {
    const samples = []
    let previous = '',
      stableFrames = 0
    for (let frame = 0; frame < 120; frame++) {
      await new Promise((resolve) => requestAnimationFrame(resolve))
      const area = document.querySelector('.canvas-area')
      if (!area) return { canvasAbsent: true }
      const content = area.querySelector('.konvajs-content')
      const sample = {
        width: area.clientWidth,
        height: area.clientHeight,
        stageWidth: content ? Number.parseFloat(content.style.width) : null,
        stageHeight: content ? Number.parseFloat(content.style.height) : null,
        camera: [area.dataset.cameraX, area.dataset.cameraY, area.dataset.cameraScale],
      }
      const current = JSON.stringify(sample)
      const matches =
        content &&
        Math.abs(sample.width - sample.stageWidth) <= 1 &&
        Math.abs(sample.height - sample.stageHeight) <= 1
      stableFrames = matches && current === previous ? stableFrames + 1 : 0
      samples.push(sample)
      if (stableFrames >= 3) return { frameCount: samples.length, final: sample }
      previous = current
    }
    throw new Error(
      `Canvas ResizeObserver did not settle after native resize: ${JSON.stringify(samples.slice(-4))}`,
    )
  })
  report.viewportChecks.push(native)
  checkpoint()
}
// Measure the scrolled, visible row; offscreen list content is intentionally scrollable.
async function layout(scope, label, contentKind = 'text') {
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
      ellipses = [],
      icons = []
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
    for (const svg of surface.querySelectorAll('svg')) {
      const rect = svg.getBoundingClientRect()
      if (!rect.width || !rect.height) continue
      inspect(rect, svg.parentElement, 'visible SVG icon')
      const owner = svg.closest('button')
      if (owner) {
        const button = owner.getBoundingClientRect()
        if (
          rect.left < button.left - 1 ||
          rect.top < button.top - 1 ||
          rect.right > button.right + 1 ||
          rect.bottom > button.bottom + 1
        ) {
          violations.push({ iconOutsideButton: owner.ariaLabel, rect: rectOf(rect) })
        }
      }
      icons.push({ rect: rectOf(rect), buttonLabel: owner?.ariaLabel ?? null })
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
    return {
      rect: rectOf(surface.getBoundingClientRect()),
      text,
      controls,
      ellipses,
      icons,
      violations,
    }
  })
  report.layoutChecks.push({ label, ...result })
  checkpoint()
  if (contentKind === 'icon') {
    assert.ok(result.icons.length > 0, 'A visible SVG icon is required')
    assert.ok(
      result.controls.some(({ label, reachable }) => label && reachable),
      'The icon action needs its accessible label and reachable hit target',
    )
  } else {
    assert.ok(result.text.length > 0, 'Actual text glyph bounds required')
  }
  assert.deepEqual(result.violations, [], `${label}: clipped glyphs or unreachable controls`)
}

async function installObserver() {
  await application.evaluate(({ ipcMain }) => {
    globalThis.igsSmartPresetCalls = []
    for (const [channel, handler] of ipcMain._invokeHandlers) {
      if (!channel.startsWith('projects:') && !channel.startsWith('presets:')) continue
      ipcMain._invokeHandlers.set(channel, async (event, ...args) => {
        const call = { channel, args: JSON.parse(JSON.stringify(args)), finished: false }
        globalThis.igsSmartPresetCalls.push(call)
        try {
          const response = await handler(event, ...args)
          if (channel === 'presets:create') call.response = JSON.parse(JSON.stringify(response))
          return response
        } finally {
          call.finished = true
        }
      })
    }
  })
}
async function mutationCalls(includeSeals = true) {
  return application.evaluate(
    (_, includeSeals) =>
      globalThis.igsSmartPresetCalls.filter(({ channel }) => {
        if (!channel.startsWith('projects:')) return false
        if (/^projects:(?:get-|list|open$|review-accepted-result$)/.test(channel)) return false
        return includeSeals || channel !== 'projects:seal-prompt-history'
      }),
    includeSeals,
  )
}
async function presetWrites() {
  return application.evaluate(() =>
    globalThis.igsSmartPresetCalls.filter(
      ({ channel }) => channel.startsWith('presets:') && !/^presets:(?:get|list)$/.test(channel),
    ),
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
    report.ipcCalls ??= []
    report.ipcCalls.push({
      label,
      calls: await application.evaluate(() => globalThis.igsSmartPresetCalls ?? []),
    })
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
  observed.clear()
  report.nativeLaunchAttempts = (report.nativeLaunchAttempts ?? 0) + 1
  const environment = {
    ...process.env,
    NODE_ENV: 'production',
    CUDA_VISIBLE_DEVICES: '',
    PYTHONDONTWRITEBYTECODE: '1',
    XDG_CONFIG_HOME: path.join(fixtureRoot, 'config'),
    XDG_DATA_HOME: path.join(fixtureRoot, 'data'),
    XDG_CACHE_HOME: path.join(fixtureRoot, 'cache'),
    XDG_STATE_HOME: path.join(fixtureRoot, 'state'),
    TMPDIR: temporaryDirectory,
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
  await expect.poll(async () => (await api('projects', 'list')).length).toBe(1)
  await bounds('native-ui-ready')
}

async function noRuntime() {
  const runtime = await api('runtime', 'getStatus')
  assert.equal(runtime.kind, 'not-installed')
  assert.deepEqual(await api('models', 'getCatalog'), [])
  assert.deepEqual(
    sourceRows().generation_queue_item,
    [],
    'Portable fixtures must not imply queue execution',
  )
  report.runtime = runtime
}
async function captureEditor(label) {
  const scroll = manager().locator('.editor-scroll .n-scrollbar-container')
  await scroll.evaluate((node) => {
    node.scrollTop = 0
  })
  await adapter.sourceBanner().scrollIntoViewIfNeeded()
  await layout(adapter.sourceBanner(), `${label}-source-glyphs`)
  await layout(footer(), `${label}-footer-controls`)
  const geometry = await manager().evaluate((node) => {
    const rect = node.getBoundingClientRect()
    const scrolling = document.scrollingElement
    const editor = node.querySelector('.editor-scroll .n-scrollbar-container')
    return {
      accessibleName: node.getAttribute('aria-label'),
      role: node.getAttribute('role'),
      root: {
        x: rect.x,
        y: rect.y,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
      viewport: [innerWidth, innerHeight],
      rootScroll: {
        top: scrolling.scrollTop,
        left: scrolling.scrollLeft,
        height: scrolling.scrollHeight,
        width: scrolling.scrollWidth,
      },
      editorScroll: { height: editor.clientHeight, content: editor.scrollHeight },
      primaryActions: [...node.querySelectorAll('.editor-actions .n-button--primary-type')].map(
        (button) => button.textContent.trim(),
      ),
    }
  })
  assert.equal(geometry.role, 'dialog')
  assert.equal(geometry.accessibleName, 'Preset Manager')
  assert.ok(
    geometry.root.x >= -1 &&
      geometry.root.y >= -1 &&
      geometry.root.right <= geometry.viewport[0] + 1 &&
      geometry.root.bottom <= geometry.viewport[1] + 1,
  )
  assert.equal(geometry.rootScroll.top, 0)
  assert.equal(geometry.rootScroll.left, 0)
  assert.ok(
    geometry.rootScroll.width <= geometry.viewport[0] + 1 &&
      geometry.rootScroll.height <= geometry.viewport[1] + 1,
  )
  assert.ok(
    geometry.editorScroll.height > 0 &&
      geometry.editorScroll.content > geometry.editorScroll.height,
    'Use actual editor overflow scrolling',
  )
  assert.deepEqual(geometry.primaryActions, ['Create Preset'])
  report.layoutChecks.push({ label, ...geometry })
  await screenshot(`${label}-source`)
  await scroll.evaluate((node) => {
    node.scrollTop = node.scrollHeight
  })
  const bottom = await scroll.evaluate((node) => ({
    top: node.scrollTop,
    maximum: node.scrollHeight - node.clientHeight,
  }))
  assert.ok(bottom.top > 0 && Math.abs(bottom.top - bottom.maximum) <= 1)
  await layout(footer(), `${label}-scrolled-footer`)
  await screenshot(`${label}-scrolled-fields`)
  report.layoutChecks.push({ label: `${label}-scroll-reach`, ...bottom })
  checkpoint()
}
async function disabledNeighborsAndCompare() {
  const before = await witness()
  const presets = storedPresets()
  for (const source of [{ owner: fixture.empty, value: fixture.empty }, fixture.imported]) {
    await openMenu(source)
    await expect(
      window.getByRole('menuitem', { name: /^Save Preset from Result/ }),
    ).toHaveAttribute('aria-disabled', 'true')
    await expect(
      window.getByRole('menuitem', { name: /^Compare generation settings/ }),
    ).toHaveAttribute('aria-disabled', 'true')
    if (source.value === fixture.empty)
      await expect(
        window.getByRole('menuitem', {
          name: 'Save Preset from Result · No generation data',
          exact: true,
        }),
      ).toBeVisible()
    await screenshot(`disabled-${source.value === fixture.empty ? 'empty' : 'imported'}`)
    await window.keyboard.press('Escape')
    await expect(manager()).toHaveCount(0)
  }
  for (const source of [fixture.variants[0], ...fixture.converted]) {
    await openMenu(source)
    await expect(
      window.getByRole('menuitem', { name: adapter.saveLabel, exact: true }),
    ).toHaveAttribute('aria-disabled', 'false')
    await expect(
      window.getByRole('menuitem', { name: /^Compare generation settings/ }),
    ).toHaveAttribute('aria-disabled', 'false')
    await window.keyboard.press('Escape')
  }
  await openMenu(fixture.ordinary)
  await expect(
    window.getByRole('menuitem', { name: adapter.saveLabel, exact: true }),
  ).toHaveAttribute('aria-disabled', 'false')
  await expect(
    window.getByRole('menuitem', { name: 'Compare generation settings', exact: true }),
  ).toHaveAttribute('aria-disabled', 'false')
  await window.keyboard.press('Escape')
  const tab = await current()
  for (const source of fixture.converted) {
    const response = await rawApi(
      'projects',
      'getRasterGenerationData',
      tab.id,
      tab.documentId,
      source.value.id,
    )
    assert.equal(response.ok, false)
    assert.equal(response.error.code, 'PROJECT_COMPARISON_UNSUPPORTED')
  }
  const noProvenance = await rawApi(
    'projects',
    adapter.method,
    tab.id,
    adapter.request(tab, fixture.imported),
  )
  assert.equal(noProvenance.ok, false)
  assert.deepEqual(storedPresets(), presets)
  await unchanged(before, 'Disabled empty/no-provenance and isolated ordinary Compare refusal')
  check(
    '03 Empty/no-provenance actions disable without allocation; active/converted Save and Smart Compare menus are enabled while ordinary readers remain isolated',
  )
}
async function cancelAtBothSizes() {
  const source = fixture.variants[0]
  for (const [width, height] of [
    [1440, 900],
    [900, 620],
  ]) {
    await setNativeSize(width, height)
    await window.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    )
    const before = await witness()
    const presets = storedPresets()
    const writes = await presetWrites()
    await readSmart(source)
    await openSource(source)
    assert.deepEqual(storedPresets(), presets)
    await captureEditor(`cancel-${width}x${height}`)
    await cancel()
    assert.deepEqual(storedPresets(), presets, 'Cancel must allocate no ID or row')
    assert.deepEqual(await presetWrites(), writes, 'Cancel must not call a preset storage mutation')
    await unchanged(before, `Cancel at actual ${width}x${height}`)
  }
  await setNativeSize(1440, 900)
  check(
    '04 Actual 1440x900 and 900x620 source editor: exact prompts, saveable missing-resource warning, omitted Size/Seed, accessible bounds/glyphs/scroll; Cancel allocates nothing',
  )
}

async function restoreReplyProbe() {
  if (!application) return
  const restored = await application.evaluate(({ ipcMain }, channel) => {
    const probe = globalThis.igsSmartPresetReplyProbe
    if (!probe) return null
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, probe.original)
    probe.release?.()
    return { held: probe.held === true }
  }, adapter.channel)
  if (restored?.held) {
    await expect
      .poll(() => application.evaluate(() => globalThis.igsSmartPresetReplyProbe.delivered))
      .toBe(true)
  }
  await application.evaluate(() => {
    delete globalThis.igsSmartPresetReplyProbe
  })
  heldReply = false
  await window.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
}
async function sourceRefusals() {
  const source = fixture.variants[0]
  const before = await witness()
  const rows = storedPresets()
  const { tab, request, data: originalData } = await readSmart(source)
  // Resolve real alternate identities, then change only owner/result in the original envelope.
  // Keep asset hash, payload, document and revision identical to the original request, so those
  // guards cannot mask a missing variant/parent correlation check. The owner/result pair is
  // internally schema-valid; one belongs to this current parent and the other to another parent.
  const alternateIdentities = {
    'valid-same-parent': (await readSmart(fixture.inactive)).data,
    'valid-other-parent': (await readSmart(fixture.variants[1])).data,
  }
  const validCrossed = Object.fromEntries(
    Object.entries(alternateIdentities).map(([mode, data]) => [
      mode,
      {
        ...structuredClone(originalData),
        owner: structuredClone(data.owner),
        resultId: data.resultId,
      },
    ]),
  )
  for (const [mode, data] of Object.entries(validCrossed)) {
    assert.equal(isSmartResultPresetData(data), true, `${mode} is not a valid envelope`)
    assert.equal(data.owner.variantId, data.resultId)
    assert.notEqual(data.resultId, request.owner.variantId)
    assert.equal(data.documentId, request.documentId)
    assert.equal(data.documentRevision, request.documentRevision)
    assert.equal(data.assetSha256, request.assetSha256)
    assert.deepEqual(data.payload, originalData.payload)
  }
  assert.equal(validCrossed['valid-same-parent'].owner.layerId, request.owner.layerId)
  assert.notEqual(validCrossed['valid-other-parent'].owner.layerId, request.owner.layerId)
  const invalid = [
    { ...request, documentId: randomUUID() },
    { ...request, documentRevision: randomUUID() },
    { ...request, assetSha256: '0'.repeat(64) },
    { ...request, owner: { ...request.owner, variantId: fixture.variants[1].value.id } },
  ]
  report.refusals = []
  for (const value of invalid) {
    const response = await rawApi('projects', adapter.method, tab.id, value)
    assert.equal(response.ok, false, 'Stale/crossed/hash-invalid source read must refuse')
    report.refusals.push({ request: value, response })
  }
  // Change only an original successful reply, to exercise the actual preload correlation guard.
  await application.evaluate(
    ({ ipcMain }, { channel, validCrossed }) => {
      const original = ipcMain._invokeHandlers.get(channel)
      if (typeof original !== 'function')
        throw new Error('Actual Smart result-preset handler missing')
      globalThis.igsSmartPresetReplyProbe = { original, mode: null, validCrossed }
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, async (event, ...args) => {
        const response = await original(event, ...args)
        if (!response.ok) return response
        const changed = structuredClone(response)
        const mode = globalThis.igsSmartPresetReplyProbe.mode
        if (mode === 'revision')
          changed.value.documentRevision = '00112233-4455-4677-8899-aabbccddeeff'
        if (mode === 'owner') changed.value.owner.variantId = '00112233-4455-4677-8899-aabbccddeeff'
        if (mode === 'result') changed.value.resultId = '00112233-4455-4677-8899-aabbccddeeff'
        if (mode === 'private') changed.value.payload.model.managedPath = '/private/fixture/model'
        const probe = globalThis.igsSmartPresetReplyProbe
        if (mode in probe.validCrossed) changed.value = structuredClone(probe.validCrossed[mode])
        probe.lastArgs = structuredClone(args)
        probe.lastReply = structuredClone(changed)
        return changed
      })
    },
    { channel: adapter.channel, validCrossed },
  )
  try {
    for (const mode of ['revision', 'owner', 'result', 'private', ...Object.keys(validCrossed)]) {
      await application.evaluate((_, mode) => {
        globalThis.igsSmartPresetReplyProbe.mode = mode
      }, mode)
      const response = await rawApi('projects', adapter.method, tab.id, request)
      assert.equal(response.ok, false, `Preload must reject crossed ${mode}`)
      assert.equal(response.error.code, 'IPC_INVALID_RESPONSE')
      const injected = await application.evaluate(() => ({
        args: globalThis.igsSmartPresetReplyProbe.lastArgs,
        reply: globalThis.igsSmartPresetReplyProbe.lastReply,
      }))
      assert.deepEqual(
        injected.args,
        [tab.id, request],
        'The original request must remain unchanged',
      )
      const schemaValid = isSmartResultPresetData(injected.reply.value)
      if (mode in validCrossed) {
        assert.equal(
          schemaValid,
          true,
          'Crossed valid envelope fell back to a schema-only rejection',
        )
        assert.deepEqual(injected.reply.value, validCrossed[mode])
      }
      report.refusals.push({ mode, response, schemaValid, originalRequest: request, injected })
    }
  } finally {
    await restoreReplyProbe()
  }
  await readSmart(source)
  await unchanged(before, 'Original source guards and preload correlation')
  await application.evaluate(({ ipcMain }, channel) => {
    const original = ipcMain._invokeHandlers.get(channel)
    if (typeof original !== 'function')
      throw new Error('Actual Smart result-preset handler missing')
    let release
    const delivery = new Promise((resolve) => {
      release = resolve
    })
    const probe = { original, release, held: false, delivered: false }
    globalThis.igsSmartPresetReplyProbe = probe
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (event, ...args) => {
      const response = await original(event, ...args)
      if (response.ok && !probe.held) {
        Object.assign(probe, { held: true, args, response })
        await delivery
        probe.delivered = true
      }
      return response
    })
  }, adapter.channel)
  heldReply = true
  try {
    await openMenu(source)
    await window.getByRole('menuitem', { name: adapter.saveLabel, exact: true }).click()
    await expect
      .poll(() => application.evaluate(() => globalThis.igsSmartPresetReplyProbe.held))
      .toBe(true)
    const held = await application.evaluate(() => {
      const probe = globalThis.igsSmartPresetReplyProbe
      return { args: probe.args, response: probe.response }
    })
    assert.deepEqual(held.args, [tab.id, request])
    assert.deepEqual(held.response.value.payload, expectedPayload(source))
    report.staleReply = held
    const callsBeforeNavigation = await application.evaluate(
      () => globalThis.igsSmartPresetCalls.length,
    )
    await window.getByRole('tab', { name: 'Home', exact: true }).click()
    await expect(window.getByRole('tab', { name: 'Home', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect
      .poll(() =>
        application.evaluate((_, offset) => {
          const reads = globalThis.igsSmartPresetCalls
            .slice(offset)
            .filter(({ channel }) => channel === 'projects:list')
          return reads.length > 0 && reads.every(({ finished }) => finished)
        }, callsBeforeNavigation),
      )
      .toBe(true)
    const afterNavigation = await witness(false)
    const navigationMutations = afterNavigation.mutations.slice(before.mutations.length)
    assert.deepEqual(
      navigationMutations,
      [
        {
          channel: 'projects:seal-prompt-history',
          args: [tab.id, null],
          finished: true,
        },
      ],
      'Ordinary Home navigation has exactly its existing prompt-history seal, separate from source extraction',
    )
    const navigationComparable = ({ camera, mutations, sourceRows, ...value }) => ({
      ...value,
      sourceRows: {
        ...sourceRows,
        project_index: sourceRows.project_index.map(({ indexed_at, ...row }) => row),
      },
    })
    assert.deepEqual(
      navigationComparable(afterNavigation),
      navigationComparable(before),
      'Explicit Home navigation preserves the source; only its observed seal and refreshed index timestamp differ',
    )
    report.staleReply.navigation = {
      before,
      afterNavigation,
      navigationMutations,
      ignoredIndexField: 'indexed_at',
    }
    await restoreReplyProbe()
    await expect(manager()).toHaveCount(0)
    assert.deepEqual(storedPresets(), rows)
    assert.deepEqual(
      await witness(false),
      afterNavigation,
      'Late reply itself must add no mutation, preset, index refresh or source change after navigation settles',
    )
    await window.getByRole('tab', { name: projectTitle, exact: true }).click()
    await expect(projectView()).toBeVisible()
    // Home remounts the Canvas; its camera is not a persistence qualification. All ordinary
    // source actions above compare camera in the same mounted view at the same actual size.
    await unchanged(
      afterNavigation,
      'Held original reply after settled Home navigation and return',
      false,
    )
  } finally {
    if (heldReply) await restoreReplyProbe()
  }
  check(
    '14 Real Main rejects foreign/stale/crossed/hash sources; preload rejects schema-valid different variants in the same/other parent plus malformed/private replies; an unchanged late successful reply after Home cannot create a draft or row',
  )
}
async function saveAndRestart() {
  await setNativeSize(1440, 900)
  const before = await witness()
  const first = created[0]
  const beforeEdit = storedPresets()
  await projectView().getByRole('button', { name: 'Manage Presets', exact: true }).click()
  await expect(manager()).toBeVisible()
  await manager()
    .getByRole('button', { name: `Select preset ${first.name}`, exact: true })
    .click()
  await expect(adapter.sourceBanner()).toHaveCount(0)
  const description = 'Detached saved recipe; source remains immutable'
  await manager()
    .getByRole('textbox', { name: 'Preset description', exact: true })
    .fill(description)
  await footer().getByRole('button', { name: 'Save Changes', exact: true }).click()
  await expect(footer().getByRole('button', { name: 'Save Changes', exact: true })).toBeDisabled()
  const saved = await api('presets', 'get', first.id)
  assert.equal(saved.description, description)
  assertDetached(saved, fixture.variants[0])
  created[0] = saved
  assert.deepEqual(
    storedPresets().filter(({ id }) => id !== first.id),
    beforeEdit.filter(({ id }) => id !== first.id),
  )
  await closeManager()
  await unchanged(before, 'Ordinary Save Changes of a detached preset')
  await snapshot('03-created-before-explicit-project-save')
  // This is the only deliberate Project mutation. Earlier source-action witnesses are exact.
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await current()).dirty).toBe(false)
  const loaded = await readIgsPackage(fixture.path)
  assert.deepEqual(loaded.project, {
    ...fixture.recovered,
    documentRevision: before.tab.documentRevision,
  })
  assert.equal(
    (await current()).documentRevision,
    before.tab.documentRevision,
    'Explicit Save preserves the authoritative revision adopted during recovery',
  )
  for (const input of fixture.inputs)
    assert.ok(
      (await loaded.readMember(input.value.asset.path)).equals(input.bytes),
      'Explicit Save changed prepared contribution bytes',
    )
  report.explicitProjectSave = {
    project: loaded.project,
    packageSha256: digest(readFileSync(fixture.path)),
  }
  await snapshot('04-explicit-project-save')
  const beforeRestart = storedPresets()
  const library = sourceRows()
  await window.getByRole('button', { name: `Close ${projectTitle}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: projectTitle, exact: true })).toHaveCount(0)
  await closeNative('create-save')
  await launch()
  await noRuntime()
  assert.deepEqual(storedPresets(), beforeRestart, 'Physical restart changed stored preset rows')
  for (const table of [
    'generation_seed_cursor',
    'checkpoint_prediction_override',
    'checkpoint_noise_profile_override',
    'model_resource',
    'model_resource_version',
    'local_model_file',
    'model_version_dependency',
  ])
    assert.deepEqual(sourceRows()[table], library[table])
  assert.equal(digest(readFileSync(fixture.path)), report.explicitProjectSave.packageSha256)
  await openProject(false)
  const restarted = await current()
  assert.equal(restarted.dirty, false)
  assert.equal(restarted.canUndo, false)
  assert.deepEqual(restarted.generationDraft, fixture.recovered.generationDraft)
  await setNativeSize(1440, 900)
  const restartedBaseline = await witness()
  await projectView().getByRole('button', { name: 'Manage Presets', exact: true }).click()
  await expect(manager()).toBeVisible()
  for (const record of created) {
    await manager()
      .getByRole('button', { name: `Select preset ${record.name}`, exact: true })
      .click()
    await expect(nameInput()).toHaveValue(record.name)
    assert.deepEqual(await api('presets', 'get', record.id), record)
    await expect(adapter.sourceBanner()).toHaveCount(0)
  }
  await screenshot('restart-persisted-recipes-1440x900')
  await closeManager()
  await unchanged(restartedBaseline, 'Ordinary restarted manager read')
  await snapshot('05-restart-recovered-rows')
  const inactive = fixture.inactive
  await projectView()
    .getByRole('button', {
      name: `Browse variants for ${inactive.owner.name}`,
      exact: true,
    })
    .click()
  await expect(browser()).toBeVisible()
  await setNativeSize(900, 620)
  const inactiveAction = adapter.inactiveButton(inactive)
  await inactiveAction.scrollIntoViewIfNeeded()
  await inactiveAction.focus()
  await expect(inactiveAction).toBeFocused()
  const beforeMinimum = await witness()
  const minimumRows = storedPresets()
  const minimumWrites = await presetWrites()
  await readSmart(inactive)
  await layout(inactiveAction, 'minimum-inactive-variant-preset-action', 'icon')
  await screenshot('minimum-inactive-variant-action-before-900x620')
  await inactiveAction.press('Enter')
  await expect(manager()).toBeVisible()
  await expect(adapter.sourceBanner()).toContainText(inactive.value.name)
  await expect(
    manager().getByRole('checkbox', { name: 'Include Size', exact: true }),
  ).not.toBeChecked()
  await expect(
    manager().getByRole('checkbox', { name: 'Include Seed', exact: true }),
  ).not.toBeChecked()
  await captureEditor('minimum-inactive-variant-preset-900x620')
  await cancel()
  await expect(inactiveAction).toBeFocused()
  await layout(inactiveAction, 'minimum-inactive-variant-restored-action', 'icon')
  await screenshot('minimum-inactive-variant-action-restored-900x620')
  assert.deepEqual(storedPresets(), minimumRows)
  assert.deepEqual(await presetWrites(), minimumWrites)
  await unchanged(beforeMinimum, 'Minimum inactive keyboard extraction and Cancel')
  report.minimumInactive = { passed: true, resultId: inactive.value.id, before: beforeMinimum }
  await browser().getByRole('button', { name: 'Close Smart Patch variants', exact: true }).click()
  await expect(browser()).toBeHidden()
  await setNativeSize(1440, 900)
  await window.getByRole('button', { name: `Close ${projectTitle}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: projectTitle, exact: true })).toHaveCount(0)
  await closeNative('restart')
  assert.equal(report.nativeClosures.length, 2)
  assert.deepEqual(report.pageErrors, [])
  assert.equal(report.samplerError, undefined)
  check(
    '15 Real detached Save Changes, explicit .igs Save and two healthy physical native exits; restart restores exactly twelve presets; minimum inactive keyboard extraction/Cancel restores exact focus and source state',
  )
}

async function failureDiagnostics() {
  if (!window || window.isClosed()) return
  report.failureDiagnostics = []
  for (const [name, operation] of [
    ['failure.aria.txt', () => window.locator('body').ariaSnapshot()],
    ['failure.html', () => window.content()],
  ]) {
    try {
      const file = path.join(evidenceRoot, name)
      writeFileSync(file, await operation(), { flag: 'wx', mode: 0o600 })
      report.failureDiagnostics.push({ path: file, sha256: digest(readFileSync(file)) })
    } catch (error) {
      report.failureDiagnostics.push({ name, error: String(error) })
    }
  }
  try {
    await screenshot('failure-native')
  } catch (error) {
    report.failureScreenshotError = String(error)
  }
  if (fixture && existsSync(path.join(appDataRoot, 'database/app.sqlite'))) {
    try {
      await snapshot('failure-consistent-state')
    } catch (error) {
      report.failureSnapshotError = String(error)
    }
  }
}

try {
  const commands = [
    ['du', ['-sk', artifactRoot]],
    ['du', ['-k', '--max-depth=1', artifactRoot]],
    ['df', ['-Pk', artifactRoot]],
    ['git', ['rev-parse', 'HEAD']],
    ['git', ['status', '--short']],
  ]
  report.inventory = await Promise.all(
    commands.map(async ([file, args]) => ({
      command: [file, ...args],
      ...(await nativeExec(file, args, { timeout: 15_000, maxBuffer: 64 * 1024 })),
    })),
  )
  report.launcher = await verifyLauncherDeadline()
  sourceFiles = [
    ...new Set([
      ...[
        'src/main/projects',
        'src/main/db',
        'src/shared/projects',
        'src/shared/presets',
        'src/main/presets',
        'src/renderer/components',
        'docs/prototype-app/src/prototypes/presets',
      ].flatMap((directory) => filesBelow(path.join(root, directory))),
      ...[
        'src/main/index.ts',
        'src/preload/index.ts',
        'src/shared/api.ts',
        'src/renderer/App.vue',
        'scripts/smoke-smart-patch-result-preset.mjs',
        'scripts/smoke-preset-save-result.mjs',
        'scripts/smoke-smart-patch-history.mjs',
        'scripts/native-smoke-window.mjs',
        'scripts/qualification-resource-limits.mjs',
        'package.json',
        'pnpm-lock.yaml',
      ].map((file) => path.join(root, file)),
    ]),
  ].sort()
  bundleFiles = ['dist/main/main.cjs', 'dist/preload/preload.cjs', 'dist/renderer/index.html'].map(
    (file) => path.join(root, file),
  )
  bundleFiles.push(
    ...filesBelow(path.join(root, 'dist/renderer/assets')),
    ...filesBelow(path.join(root, 'dist/main/migrations')),
  )
  report.sourceSha256 = hashes(sourceFiles)
  report.bundleSha256 = hashes(bundleFiles)
  retainJson('source-build-hashes.json', {
    source: report.sourceSha256,
    build: report.bundleSha256,
  })
  checkpoint()
  await prepare()
  await launch()
  await noRuntime()
  assert.deepEqual(await api('presets', 'list'), [])
  await openProject(true)
  assert.equal((await current()).dirty, true)
  assert.deepEqual((await current()).generationDraft, fixture.recovered.generationDraft)
  baseline = await witness()
  report.baseline = baseline
  await snapshot('00-recovered-before-source-actions')
  check(
    '02 Bounded actual native startup and Home Recover preserve the distinct unsaved source; no runtime/catalog/queue or stored presets',
  )
  await disabledNeighborsAndCompare()
  await cancelAtBothSizes()
  for (const [index, source] of fixture.variants.entries()) {
    await createFrom(source)
    check(
      `${String(index + 5).padStart(2, '0')} ${source.family} recorded ${source.mode}: actual active parent menu creates exact detached smartPatch payload and SQLite row${index === 0 ? '; real INSERT failure retains edited draft and explicit retry creates exactly one row' : ''}`,
      {
        resultId: source.value.id,
        payload: expectedPayload(source),
        ...(index === 0 ? { failedCreateRetry: report.createRetry } : {}),
      },
    )
  }
  await snapshot('01-eight-mode-recipes')
  await createFrom(fixture.inactive, true)
  for (const source of fixture.converted) await createFrom(source)
  await createFrom(fixture.ordinary)
  assert.equal(created.length, 12)
  assert.deepEqual(
    (await current()).layers
      .filter(({ kind }) => kind === 'smart-patch')
      .map(({ id, activeRasterSubLayerId }) => ({ id, activeRasterSubLayerId })),
    baseline.tab.layers
      .filter(({ kind }) => kind === 'smart-patch')
      .map(({ id, activeRasterSubLayerId }) => ({ id, activeRasterSubLayerId })),
  )
  await snapshot('02-inactive-converted-ordinary-controls')
  check(
    '13 Direct inactive stored action returns focus without activation; both converted Smart Raster families create smartPatch while the ordinary Raster neighbor retains its own workflow/Size',
  )
  await sourceRefusals()
  await saveAndRestart()
  assert.equal(report.checks.length, 15)
  assert.deepEqual(hashes(sourceFiles), report.sourceSha256, 'Source changed during qualification')
  assert.deepEqual(
    hashes(bundleFiles),
    report.bundleSha256,
    'Built app changed during qualification',
  )
  for (const item of report.snapshots) {
    assert.ok(lstatSync(item.path).isFile() && !lstatSync(item.path).isSymbolicLink())
    const bytes = readFileSync(item.path)
    assert.equal(bytes.length, item.bytes)
    assert.equal(digest(bytes), item.sha256, 'Retained evidence is not self-contained/exact')
  }
  report.created = created
  report.outcome = 'passed'
} catch (error) {
  process.exitCode = 1
  report.outcome = 'failed'
  report.failure = { message: error.message, stack: error.stack }
  checkpoint()
  await failureDiagnostics()
} finally {
  try {
    removeCreateFailureTrigger()
  } catch (error) {
    process.exitCode = 1
    report.outcome = 'failed'
    report.triggerRestorationFailure = String(error)
  }
  if (application) {
    try {
      await restoreReplyProbe()
    } catch (error) {
      process.exitCode = 1
      report.outcome = 'failed'
      report.probeRestorationFailure = String(error)
    }
    try {
      await closeNative('aborted', true)
    } catch (error) {
      process.exitCode = 1
      report.outcome = 'failed'
      report.physicalExitFailure = String(error)
    }
  }
  clearInterval(sampler)
  lifecycle.state = 'retained'
  lifecycle.disposition = {
    retainedEvidence: evidenceRoot,
    disposablePayloads: [fixtureRoot, temporaryDirectory],
    owner: 'root',
    deletedBytes: 0,
    physicalExitConfirmed:
      !application &&
      !report.nativeLaunchError &&
      report.nativeClosures.length === (report.nativeLaunchAttempts ?? 0) &&
      report.nativeClosures.every(({ confirmed }) => confirmed),
    probesRestored:
      !heldReply && !createFailureTriggerInstalled && !report.triggerRestorationFailure,
    releaseCondition:
      'Root verifies compact PNG/provenance/.igs/SQLite/autosave bytes and every native physical exit before deleting only the declared fixture and short temporary directories; no runtime/catalog dependency.',
  }
  report.finishedAt = new Date().toISOString()
  if (previousTemporaryDirectory === undefined) delete process.env.TMPDIR
  else process.env.TMPDIR = previousTemporaryDirectory
  checkpoint()
  console.log(`${report.outcome.toUpperCase()} ${reportFile}`)
}
