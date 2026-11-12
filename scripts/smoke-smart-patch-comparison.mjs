/**
 * Root-run native Smart Compare qualification after a fresh app:build: pnpm exec tsx
 * scripts/smoke-smart-patch-comparison.mjs --report-file ABSOLUTE_NEW_REPORT
 *
 * Authoring/syntax checking is NOT execution evidence. Root owns builds, execution, screenshot
 * inspection and disposal in runs/smart-patch-compare/20261022-canvas. No cleanup, provisioning,
 * ML, acceptance, Smart-target Apply, inactive direct Compare, or image comparison is performed.
 * Literal accepted portable fixtures are declared inputs, never evidence of inference/acceptance.
 * Eighteen finite checks, one native actor; <=2GiB/zero swap per actual launcher/native group,
 * native deadline <=360s, launcher <=600s, stop <=90s, KillMode=control-group. Short owned TMPDIR.
 * Exact PNGs, packages, full autosaves and standalone SQLite backups are retained before close, and
 * a final database is captured AFTER the last UI action and physical native exit.
 *
 * The observer wraps original Main handlers; it does not replace their behavior. Reply probes hold
 * genuine completed successes, cross successful replies, and explicitly inject one delayed IPC
 * failure AFTER its unchanged original Main read succeeds. That injected error is not a genuine
 * Main refusal. All probes restore their exact original observed handler. Portable
 * fixtures/resource limits/retention follow smoke-smart-patch-result-preset.mjs;
 * menu/popover/preload correlation follows smoke-generation-comparison.mjs. API assumptions are
 * localized in adapter against the stable smart-result-comparison.ts DTO. No production files are
 * edited. The temporary renderer publication observer is disconnected after the reply probe.
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
import { parseSmartPatchGenerationProvenanceV1 } from '../src/shared/projects/project-schema.ts'
import { isSmartResultComparisonData } from '../src/shared/projects/smart-result-comparison.ts'
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
const ownedRun = path.join(artifactRoot, 'runs/smart-patch-compare/20261022-canvas')
const evidenceParent = path.dirname(reportFile)
const relativeParent = path.relative(ownedRun, evidenceParent)
assert.ok(!relativeParent.startsWith('..') && !path.isAbsolute(relativeParent))
assert.equal(realpathSync(evidenceParent), evidenceParent, 'Existing canonical parent required')
assert.ok(lstatSync(evidenceParent).isDirectory() && !lstatSync(evidenceParent).isSymbolicLink())
assert.equal(realpathSync(artifactRoot), artifactRoot)
const evidenceRoot = `${reportFile}.artifacts`
assert.equal(existsSync(evidenceRoot), false)
writeFileSync(reportFile, '{}\n', { flag: 'wx', mode: 0o600 })
mkdirSync(evidenceRoot, { mode: 0o700 })
const fixtureRoot = mkdtempSync(path.join(evidenceRoot, 'compare-payload-'))
const appDataRoot = path.join(fixtureRoot, 'data/imagegen-studio')
const workspace = path.join(appDataRoot, 'workspaces/Uncategorized')
mkdirSync(workspace, { recursive: true, mode: 0o700 })
const temporaryDirectory = mkdtempSync(path.join(artifactRoot, 'sp-cmp-tmp-'))
const previousTemporaryDirectory = process.env.TMPDIR
process.env.TMPDIR = temporaryDirectory
const nativeDeadlineSeconds = 360
const nativeExec = promisify(execFile)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const projectTitle = 'Smart Compare current Project Canvas'
const roots = {
  placeholdersDir: path.join(root, 'dist/main/placeholders'),
  scratchDir: path.join(fixtureRoot, 'writer-scratch'),
}
const modes = ['txt2img', 'img2img', 'inpaint', 'outpaint']
const nativeChecks = []
const observed = new Map()
let application, window, nativeProcess, sampler, fixture, sourceFiles, bundleFiles
let sampling = Promise.resolve()
let heldReply = false
let probeInstalled = false
let lastOpenWitness
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
  expectedActions: [],
  layoutChecks: [],
  viewportChecks: [],
  readbacks: [],
  refusals: [],
  pageErrors: [],
  nativeLogs: [],
  resourceLimitChecks: [],
  nativeClosures: [],
  boundary: {
    actual:
      'Production ProjectSession/.igs/ShadowStore and recovery/indexing, original Main IPC and strict preload, built active-Patch and converted-Raster menus, shared comparison popover, acknowledged Project Steps edit and explicit active-member navigation.',
    precondition:
      'Literal ICC PNGs and strict accepted Illustrious/Anima provenance for four recorded modes per family; active and converted carriers. Inference, acceptance and conversion are NOT exercised. Project, selected Patch draft and recorded settings deliberately differ.',
    oracle:
      'Exact frozen configuration and independently asserted rendered columns; full Project tab/Undo flags/selection/camera, loader/shadow document and asset bytes, all SQLite tables/schema and all mutation IPC including seals. History flags and complete mutation admission log witness the public history boundary, not an unexposed internal Undo stack.',
    delayedFailureProbe:
      'Check 17 adds one controlled IPC failure after a valid, unchanged original Main read succeeds; the genuine success and injected/delivered error are retained separately. This is failure injection, not an unmodified genuine Main refusal. A deterministic original refusal would require invalid ownership/request or changed source state; both are excluded here. The actual preload and serialized renderer error path remain real, with newest original Main completion held as the progression barrier and transient alert/loading/owner observation.',
    limits:
      'Launcher <=2GiB/zero swap/RuntimeMaxSec<=600/TimeoutStopSec<=90/KillMode=control-group; actual native groups <=2GiB/zero swap and <=360s deadline; aggregate unique launcher/native limits <=4GiB; one native launch.',
    excluded:
      'CPU successful-composition matrix (root service tests own it), ML/runtime/catalog setup, inference/acceptance/conversion qualification, inactive direct Compare, image before/after, Smart-target Apply, full MVP/release and independent visual PASS. Root must inspect actual retained screenshots.',
    cleanup:
      'No runner deletion. Full source PNGs/packages/autosaves/standalone SQLite remain in evidenceRoot outside fixtureRoot. Root releases only declared disposable payloads after physical exit, probe restoration and byte verification.',
  },
}
const lifecycle = {
  schemaVersion: 1,
  owner: { repository: root, task: 'smart-patch-compare', run: reportFile },
  state: 'running',
  lastUsedAt: report.startedAt,
  evidence: [reportFile, evidenceRoot],
  payloads: [fixtureRoot, temporaryDirectory],
  dependsOn: [],
  usedBy: [],
  pins: [
    {
      path: fixtureRoot,
      reason: 'Root disposal after native physical exit and retained-byte verification',
    },
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
  assert.ok(report.checks.length < 18, 'Keep this qualification finite')
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

// Root may adapt these agreed transport/DOM assumptions together after API stabilization.
const adapter = {
  isEnvelope: isSmartResultComparisonData,
  method: 'getSmartResultComparisonData',
  channel: 'projects:get-smart-result-comparison-data',
  label: 'Compare generation settings',
  closeLabel: 'Close generation settings comparison',
  unchangedLabel: 'Show unchanged settings',
  saveLabel: 'Save Preset from Result',
  request: (tab, source) => ({
    documentId: tab.documentId,
    documentRevision: tab.documentRevision,
    owner:
      source.kind === 'variant'
        ? { kind: 'smart-patch-variant', layerId: source.owner.id, variantId: source.value.id }
        : { kind: 'raster', layerId: source.value.id },
    assetSha256: source.value.asset.sha256,
  }),
  resultId: (source) => source.value.id,
  menu: (source) =>
    projectView().getByRole('button', {
      name: `Layer actions for ${source.owner?.name ?? source.value.name}`,
      exact: true,
    }),
  setting: (key) => dialog().locator(`[data-setting="${key}"]`),
  scroll: () => dialog().locator('.comparison-scroll'),
  values: (key) => adapter.setting(key).locator('.comparison-values > div > p'),
  browse: (source) =>
    projectView().getByRole('button', {
      name: `Browse variants for ${source.owner.name}`,
      exact: true,
    }),
}
const projectView = () => window.getByLabel(`Project ${projectTitle}`, { exact: true })
const canvas = () => projectView().getByRole('region', { name: 'Project Canvas', exact: true })
const dialog = () => window.getByRole('dialog', { name: adapter.label, exact: true })
const browser = () => window.getByRole('dialog', { name: 'Smart Patch variants', exact: true })
const closeButton = () => dialog().getByRole('button', { name: adapter.closeLabel, exact: true })
async function rawApi(scope, method, ...args) {
  return window.evaluate(({ scope, method, args }) => window.api[scope][method](...args), {
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
async function current() {
  const opened = await api('projects', 'open', fixture.key)
  assert.equal(opened.kind, 'opened')
  return opened.tab
}
async function frames() {
  await window.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
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
  const bbox = { width: 7, height: 5, x: -19 + index * 4, y: 31 }
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
  Object.assign(value.asset, { bytes: bytes.length, height: 5, width: 7, sha256: digest(bytes) })
  const provenance = value.generationProvenance
  const config = provenance.generationConfiguration
  config.mode = mode
  config.model = reference(family, 'checkpoint', `${family} recorded ${mode} checkpoint`)
  config.positivePrompt = {
    text: `Concrete ${family} ${mode}: (blue lantern:-0.5), literal 日本語\nsecond line: keep raw weighted signs ++ -- and line breaks`,
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
  owner.generationDraft.negativePrompt = {
    text: 'PATCH draft negative differs from current Project',
    embeddingRefs: [],
  }
  owner.generationDraft.sampling.steps = 67
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
  Object.assign(source.sourceTarget, { width: 7, height: 5 })
  Object.assign(source.preparedInputs.finalContributionMask, { width: 7, height: 5 })
  const output = provenance.executionResultContext.output
  Object.assign(output, {
    byteSize: bytes.length,
    width: 7,
    height: 5,
    sha256: digest(bytes),
    contributionAlpha8: {
      byteSize: 7 * 5,
      width: 7,
      height: 5,
      sha256: digest(Buffer.alloc(7 * 5, 255)),
    },
  })
  parseSmartPatchGenerationProvenanceV1(provenance)
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
      width: 7,
      height: 5,
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
  // Same pixels and world geometry, deliberately different immutable settings/variant ID.
  // This discriminates active-member ownership from asset-only invalidation and keeps
  // Fit View's visible bounds unchanged during the separately authorized selection.
  inactive.bytes = Buffer.from(variants[0].bytes)
  inactive.value.bbox = structuredClone(variants[0].value.bbox)
  Object.assign(inactive.value.asset, {
    bytes: inactive.bytes.length,
    sha256: digest(inactive.bytes),
  })
  inactive.value.generationProvenance.layerSourceContext.bbox = structuredClone(inactive.value.bbox)
  Object.assign(inactive.value.generationProvenance.executionResultContext.output, {
    byteSize: inactive.bytes.length,
    sha256: digest(inactive.bytes),
  })
  parseSmartPatchGenerationProvenanceV1(inactive.value.generationProvenance)
  assert.equal(inactive.value.asset.sha256, variants[0].value.asset.sha256)
  assert.notEqual(inactive.value.id, variants[0].value.id)
  assert.notDeepEqual(
    inactive.value.generationProvenance.generationConfiguration,
    variants[0].value.generationProvenance.generationConfiguration,
  )
  inactive.owner.rasterSubLayers.push(inactive.value)
  const converted = variants.map((source) => ({
    ...raster(
      `${source.family} ${source.mode} converted Smart provenance Raster`,
      source.bytes,
      source.value.generationProvenance,
    ),
    family: source.family,
    mode: source.mode,
  }))
  const ordinaryBytes = literalSmartPatchColorPng(
    8,
    8,
    Array(8 * 8)
      .fill([70, 120, 180, 255])
      .flat(),
    4,
  )
  const ordinaryProvenance = acceptedRasterProvenanceFixture(session.document, ordinaryBytes, {
    width: 8,
    height: 8,
    x: 128,
    y: 96,
  })
  ordinaryProvenance.generationConfiguration.sampling.actualSeed = 0
  ordinaryProvenance.generationConfiguration.sampling.steps = 19
  const ordinary = raster('Ordinary accepted Raster neighbor', ordinaryBytes, ordinaryProvenance)
  ordinary.value.asset.width = 8
  ordinary.value.asset.height = 8
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
      model: reference('illustrious', 'checkpoint', 'Current absent Project checkpoint'),
      seed: { policy: 'fixed', value: 0 },
      sampling: { ...session.document.generationDraft.sampling, cfgScale: 6, steps: 24 },
    },
    primaryBbox: { width: 640, height: 384, x: 0, y: 0 },
    lastActualSeedSnapshot: 0,
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
        text: 'Recovered current PROJECT {day|night} differs from Patch and frozen result',
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
    '01 Exact accepted portable inputs retained: both families/all four modes, tiny nonaligned geometry, converted carriers, source package and unsaved shadow; no inference/acceptance claim',
  )
}

// Independent strict envelope check: no production projector creates this oracle. Validate the
// configuration using the existing portable provenance schema with a declared source context.
function validEnvelope(value, source) {
  try {
    assert.deepEqual(
      Object.keys(value).sort(),
      [
        'assetSha256',
        'currentMode',
        'documentId',
        'documentRevision',
        'generationConfiguration',
        'modeUnavailableReason',
        'owner',
        'resultId',
      ].sort(),
    )
    const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i
    for (const key of ['documentId', 'documentRevision', 'resultId']) assert.match(value[key], uuid)
    assert.match(value.assetSha256, /^[a-f\d]{64}$/)
    assert.match(value.owner.layerId, uuid)
    if (value.owner.kind === 'smart-patch-variant') {
      assert.deepEqual(Object.keys(value.owner).sort(), ['kind', 'layerId', 'variantId'])
      assert.match(value.owner.variantId, uuid)
      assert.equal(value.resultId, value.owner.variantId)
    } else {
      assert.equal(value.owner.kind, 'raster')
      assert.deepEqual(Object.keys(value.owner).sort(), ['kind', 'layerId'])
      assert.equal(value.resultId, value.owner.layerId)
    }
    assert.ok([null, 'txt2img', 'img2img', 'outpaint'].includes(value.currentMode))
    if (value.currentMode === null) {
      assert.equal(typeof value.modeUnavailableReason, 'string')
      assert.ok(value.modeUnavailableReason.trim())
    } else assert.equal(value.modeUnavailableReason, null)
    parseSmartPatchGenerationProvenanceV1({
      ...source.value.generationProvenance,
      generationConfiguration: value.generationConfiguration,
    })
    return true
  } catch {
    return false
  }
}
function assertSmartData(data, request, source) {
  assert.equal(
    validEnvelope(data, source),
    true,
    'Independent strict portable Smart comparison envelope',
  )
  assert.equal(adapter.isEnvelope(data), true, 'Actual comparison transport schema')
  for (const key of ['documentId', 'documentRevision', 'owner', 'assetSha256'])
    assert.deepEqual(data[key], request[key], `Request echo ${key}`)
  assert.equal(data.resultId, adapter.resultId(source))
  assert.deepEqual(
    data.generationConfiguration,
    source.value.generationProvenance.generationConfiguration,
  )
  assert.equal(data.currentMode, null, 'No runtime: optional CPU mode must remain unavailable')
  assert.ok(data.modeUnavailableReason.trim())
  assert.equal('size' in data.generationConfiguration, false)
}
async function readSmart(source) {
  const tab = await current()
  const request = adapter.request(tab, source)
  const data = await api('projects', adapter.method, tab.id, request)
  assertSmartData(data, request, source)
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
  assert.match(table, /^[a-z_0-9]+$/)
  return database
    .prepare(`SELECT * FROM "${table}"`)
    .all()
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}
function databaseState(database) {
  const schema = database
    .prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
    )
    .all()
  const tables = schema.filter(({ type }) => type === 'table').map(({ name }) => name)
  return {
    schema,
    tables: Object.fromEntries(tables.map((table) => [table, tableRows(database, table)])),
  }
}
function sourceRows() {
  return withDatabase(databaseState)
}
function dataFiles() {
  // Electron shares userData with the product and creates volatile Chromium files and
  // Singleton symlinks. Product byte witnesses enumerate only durable product owners;
  // database contents are compared independently through all SQL tables/schema.
  return [
    'autosave',
    'generation-inputs',
    'generation-prepared-inputs',
    'generation-queued-inputs',
    'inference-resources',
    'models',
    'previews',
    'recovery',
    'runtime',
    'workspaces',
  ].flatMap((name) => {
    const directory = path.join(appDataRoot, name)
    if (!existsSync(directory)) return []
    const entry = lstatSync(directory)
    assert.ok(entry.isDirectory() && !entry.isSymbolicLink(), `Invalid product owner ${name}`)
    return filesBelow(directory)
  })
}
function dataHashes() {
  return Object.fromEntries(
    dataFiles().map((file) => [path.relative(appDataRoot, file), digest(readFileSync(file))]),
  )
}
// Observe EVERY registered invocation, including library/runtime/window handlers. Unknown channels
// are classified as mutations. This allowlist deliberately never exempts seal/flush operations.
const readChannels = [
  'models:get-catalog',
  'models:get-install-jobs',
  'models:get-storage-summary',
  'models:get-token-status',
  'runtime:get-status',
  'presets:get',
  'presets:list',
  'projects:list',
  'projects:open',
  'projects:get-accepted-result-history',
  'projects:get-close-impact',
  'projects:get-generation-progress',
  'projects:get-generation-queue',
  'projects:get-generation-state',
  'projects:get-generation-target-state',
  'projects:get-raster-generation-data',
  'projects:get-raster-preset-data',
  'projects:get-smart-patch-generation-target-state',
  'projects:get-smart-patch-variants',
  'projects:get-smart-result-preset-data',
  'projects:list-generation-results',
  'projects:list-smart-patch-generation-results',
  'projects:review-accepted-result',
  adapter.channel,
]
async function installObserver() {
  await application.evaluate(
    ({ ipcMain }, { readChannels, comparisonChannel }) => {
      globalThis.igsSmartCompareCalls = []
      globalThis.igsSmartCompareReadChannels = readChannels
      for (const [channel, original] of ipcMain._invokeHandlers) {
        ipcMain._invokeHandlers.set(channel, async (event, ...args) => {
          const call = {
            id: globalThis.igsSmartCompareCalls.length,
            channel,
            args: structuredClone(args),
            finished: false,
          }
          globalThis.igsSmartCompareCalls.push(call)
          try {
            const response = await original(event, ...args)
            if (channel === comparisonChannel || channel === 'projects:get-raster-generation-data')
              call.response = structuredClone(response)
            call.ok = response?.ok ?? null
            return response
          } finally {
            call.finished = true
          }
        })
      }
    },
    { readChannels, comparisonChannel: adapter.channel },
  )
}
async function ipcCalls() {
  return application.evaluate(() => structuredClone(globalThis.igsSmartCompareCalls))
}
async function mutationCalls() {
  return application.evaluate(() =>
    globalThis.igsSmartCompareCalls.filter(
      ({ channel }) => !globalThis.igsSmartCompareReadChannels.includes(channel),
    ),
  )
}
async function witness() {
  await frames()
  const tab = await current()
  const saved = await readIgsPackage(fixture.path)
  const shadowStore = new ProjectShadowStore(path.join(appDataRoot, 'autosave'))
  let shadow
  // Main acknowledges an edit before its debounced autosave. Wait for the independently
  // published revision; reading an older snapshot or sleeping a fixed interval is not evidence.
  await expect
    .poll(
      async () => {
        shadow = await shadowStore.inspect({ projectPath: fixture.path, savedPackage: saved })
        return shadow.status === 'recoverable' ? shadow.document.documentRevision : shadow.status
      },
      { message: 'Wait for the full acknowledged dirty document in durable autosave' },
    )
    .toBe(tab.documentRevision)
  assert.deepEqual(shadow.document.generationDraft, tab.generationDraft)
  const ui = await canvas()
    .locator('.canvas-area')
    .evaluate((node) => ({
      camera: { x: node.dataset.cameraX, y: node.dataset.cameraY, scale: node.dataset.cameraScale },
      selected: [...document.querySelectorAll('.entity-select[aria-pressed="true"]')]
        .map((button) => button.getAttribute('aria-label'))
        .sort(),
    }))
  assert.ok(
    Object.values(ui.camera).every(
      (value) => value !== undefined && Number.isFinite(Number(value)),
    ),
  )
  assert.ok(ui.selected.length <= 1)
  return {
    tab,
    ui,
    liveDocument: shadow.document,
    savedDocument: saved.project,
    packageSha256: digest(readFileSync(fixture.path)),
    files: dataHashes(),
    sourceRows: sourceRows(),
    mutations: await mutationCalls(),
  }
}
async function unchanged(before, label) {
  const after = await witness()
  assert.deepEqual(
    after,
    before,
    `${label}: Project/history/Undo/active/selection/camera/PNG/provenance/package/shadow/seed/index/library or mutation IPC changed`,
  )
  report.witnesses.push({ label, before, after })
  lastOpenWitness = after
  checkpoint()
}
function expectedMutationCalls(before, after, expected, label) {
  assert.deepEqual(
    after.mutations.slice(0, before.mutations.length),
    before.mutations,
    `${label}: earlier mutation witnesses changed`,
  )
  const calls = after.mutations.slice(before.mutations.length)
  assert.deepEqual(
    calls.map(({ channel, args, finished, ok }) => ({ channel, args, finished, ok })),
    expected.map(({ channel, args }) => ({ channel, args, finished: true, ok: true })),
    `${label}: exact intentional mutation channel/scope/order/count required`,
  )
  return calls
}
async function expectedNavigation(label, action, selected) {
  const before = await witness()
  assert.notDeepEqual(before.ui.selected, [`Select ${selected}`])
  await action()
  await expect(
    projectView().getByRole('button', { name: `Select ${selected}`, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await frames()
  const after = await witness()
  assert.deepEqual(after.tab, before.tab)
  assert.deepEqual(after.liveDocument, before.liveDocument)
  assert.deepEqual(after.savedDocument, before.savedDocument)
  assert.equal(after.packageSha256, before.packageSha256)
  assert.deepEqual(after.sourceRows, before.sourceRows)
  assert.deepEqual(after.files, before.files)
  assert.deepEqual(after.ui, { ...before.ui, selected: [`Select ${selected}`] })
  // selectProjectLayer explicitly flushes its current editor and seals this tab's prompt group.
  // This one intentional navigation call is recorded here; unchanged() still includes ALL seals.
  const expected = [{ channel: 'projects:seal-prompt-history', args: [before.tab.id, null] }]
  const mutations = expectedMutationCalls(before, after, expected, label)
  report.expectedActions.push({ label, kind: 'navigation', before, after, expected, mutations })
  checkpoint()
}
async function snapshot(label, closed = false) {
  const beforeFiles = dataHashes()
  const expected = sourceRows()
  const directory = path.join(evidenceRoot, label)
  mkdirSync(directory, { mode: 0o700 })
  const file = path.join(directory, 'app.sqlite')
  const source = new Database(path.join(appDataRoot, 'database/app.sqlite'), {
    readonly: true,
    fileMustExist: true,
  })
  try {
    await source.backup(file)
  } finally {
    source.close()
  }
  const copy = new Database(file, { readonly: true, fileMustExist: true })
  try {
    assert.deepEqual(copy.prepare('PRAGMA integrity_check').all(), [{ integrity_check: 'ok' }])
    assert.deepEqual(databaseState(copy), expected, 'Backup must have all observed rows/schema')
  } finally {
    copy.close()
  }
  report.snapshots.push({
    path: file,
    bytes: lstatSync(file).size,
    sha256: digest(readFileSync(file)),
  })
  // All private app files are small in this no-runtime run. Retain EVERY referenced filesystem
  // payload, including ordinary generation-inputs if a failure unexpectedly creates a queue row.
  // SQLite/wal/shm are replaced by the consistent standalone backup above, never a raw DB copy.
  const retainedFiles = dataFiles().map((entry) => ({
    original: entry,
    retained: retain(entry, `${label}/data/${path.relative(appDataRoot, entry)}`),
    sha256: digest(readFileSync(entry)),
  }))
  assert.deepEqual(dataHashes(), beforeFiles, 'Filesystem changed while retaining checkpoint')
  assert.deepEqual(sourceRows(), expected, 'SQLite changed while retaining checkpoint')
  let tab = null
  if (!closed) tab = await current()
  retainJson(`${label}/readback.json`, {
    afterNativeExit: closed,
    tables: expected,
    tab,
    lastOpenWitness: closed ? lastOpenWitness : undefined,
    retainedFiles,
    referencedInputs: fixture.inputs.map(({ value }) => ({
      member: value.asset.path,
      sha256: value.asset.sha256,
      retainedPng: path.join(evidenceRoot, `prepared/inputs/${value.id}.png`),
    })),
  })
  report.stateCheckpoints ??= []
  report.stateCheckpoints.push({ label, afterNativeExit: closed, database: file, retainedFiles })
  checkpoint()
}
async function openProject() {
  await window.getByRole('button', { name: `Open ${projectTitle}`, exact: true }).click()
  const recovery = window.getByRole('dialog', { name: 'Recovery available', exact: true })
  await expect(recovery).toBeVisible()
  await recovery.getByRole('button', { name: 'Recover', exact: true }).click()
  await expect(projectView()).toBeVisible()
  await expect(canvas().locator('.canvas-area')).toHaveAttribute('data-scene-ready', 'true')
  await canvas().getByRole('button', { name: 'Fit View', exact: true }).click()
}
async function openMenu(source) {
  // Wait for Naive's previous menu owner to leave before another row opens one.
  await expect(window.getByRole('menuitem')).toHaveCount(0)
  const trigger = adapter.menu(source)
  await trigger.scrollIntoViewIfNeeded()
  await trigger.click()
  await expect(window.getByRole('menuitem', { name: adapter.saveLabel, exact: true })).toBeEnabled()
}
async function ready() {
  await expect(dialog()).toBeVisible()
  await expect(adapter.scroll()).toHaveAttribute('aria-busy', 'false')
  await expect(adapter.setting('guidance.steps')).toHaveCount(1)
  await frames()
}
async function beginComparison(source, ordinary = false) {
  const calls = await ipcCalls()
  const tab = await current()
  const request = ordinary ? null : adapter.request(tab, source)
  await openMenu(source)
  await window.getByRole('menuitem', { name: adapter.label, exact: true }).click()
  await expect(dialog()).toBeVisible()
  return { source, ordinary, callOffset: calls.length, tab, request }
}
async function completeComparison({ source, ordinary, callOffset, tab, request }) {
  await ready()
  const channel = ordinary ? 'projects:get-raster-generation-data' : adapter.channel
  let observedCall
  await expect
    .poll(async () => {
      observedCall = (await ipcCalls())
        .slice(callOffset)
        .find(
          (call) =>
            call.channel === channel &&
            call.finished &&
            call.response?.ok &&
            (ordinary
              ? call.args[2] === source.value.id
              : call.args[0] === tab.id &&
                call.args[1]?.documentId === request.documentId &&
                call.args[1]?.documentRevision === request.documentRevision &&
                call.args[1]?.owner?.layerId === request.owner.layerId &&
                call.args[1]?.assetSha256 === request.assetSha256),
        )
      return Boolean(observedCall)
    })
    .toBe(true)
  if (ordinary) {
    assert.deepEqual(observedCall.args, [tab.id, tab.documentId, source.value.id])
    assert.deepEqual(
      observedCall.response.value.generationConfiguration,
      source.value.generationProvenance.generationConfiguration,
    )
  } else {
    assert.deepEqual(observedCall.args, [tab.id, request])
    assertSmartData(observedCall.response.value, request, source)
  }
  report.readbacks.push({ entry: 'actual-layer-menu', channel, call: observedCall })
  return observedCall
}
async function openComparison(source, ordinary = false) {
  return completeComparison(await beginComparison(source, ordinary))
}
async function closeComparison(source, escape = false) {
  if (escape) await window.keyboard.press('Escape')
  else await closeButton().click()
  await expect(dialog()).toBeHidden()
  await expect(adapter.menu(source)).toBeFocused()
}
async function column(key, before, after, status) {
  const row = adapter.setting(key)
  await expect(row).toHaveCount(1)
  await expect(adapter.values(key)).toHaveCount(2)
  await expect(adapter.values(key).nth(0)).toHaveText(before)
  await expect(adapter.values(key).nth(1)).toHaveText(after)
  assert.equal(await adapter.values(key).nth(0).textContent(), before, `${key}: exact frozen text`)
  assert.equal(await adapter.values(key).nth(1).textContent(), after, `${key}: exact Project text`)
  if (status) {
    await expect(row).toHaveAttribute('data-status', status)
    await expect(row.locator('.comparison-row-header')).toContainText(status)
  }
}
async function assertProjection(source, projectDraft) {
  const config = source.value.generationProvenance.generationConfiguration
  await dialog().getByRole('checkbox', { name: adapter.unchangedLabel, exact: true }).check()
  await column(
    'prompt.text',
    config.positivePrompt.text,
    projectDraft.positivePrompt.text,
    'Changed',
  )
  await column(
    'negativePrompt.text',
    config.negativePrompt.text,
    projectDraft.negativePrompt.text,
    'Changed',
  )
  for (const [key, prompt] of [
    ['prompt', config.positivePrompt],
    ['negativePrompt', config.negativePrompt],
  ]) {
    const refs = adapter.values(`${key}.embeddings`).nth(0)
    if (!prompt.embeddingRefs.length) await expect(refs).toHaveText('None')
    else
      for (const ref of prompt.embeddingRefs) {
        await expect(refs).toContainText(ref.token)
        await expect(refs).toContainText(ref.resource.fileSha256)
        await expect(adapter.setting(`${key}.embeddings`)).toHaveAttribute(
          'data-status',
          'Missing resource',
        )
      }
  }
  await column(
    'guidance.steps',
    String(config.sampling.steps),
    String(projectDraft.sampling.steps),
    'Changed',
  )
  await column(
    'guidance.cfg',
    String(config.sampling.cfgScale),
    String(projectDraft.sampling.cfgScale),
    'Changed',
  )
  await column(
    'seed.actual',
    String(config.sampling.actualSeed),
    '0',
    config.sampling.actualSeed === 0 ? 'Same' : 'Changed',
  )
  await expect(adapter.setting('context.mode')).toHaveAttribute('data-status', 'Unavailable')
  await expect(adapter.values('context.mode').nth(0)).toHaveText(source.mode)
  await expect(adapter.values('context.mode').nth(1)).not.toBeEmpty()
  await expect(adapter.setting('model.resource')).toHaveAttribute('data-status', 'Missing resource')
  await expect(adapter.values('model.resource').nth(0)).toContainText(config.model.displayName)
  await expect(adapter.values('model.resource').nth(0)).toContainText(config.model.fileSha256)
  await expect(adapter.values('model.resource').nth(1)).toContainText(
    projectDraft.model.displayName,
  )
  await expect(
    dialog()
      .locator('.comparison-section')
      .filter({ has: dialog().getByRole('heading', { name: 'Size', exact: true }) }),
  ).toHaveCount(0)
  const keys = await dialog()
    .locator('[data-setting]')
    .evaluateAll((rows) => rows.map((row) => row.dataset.setting))
  assert.ok(keys.length > 10)
  assert.equal(
    keys.some((key) =>
      /^(?:size|bbox|mask|geometry|internalResolution|opacity|blend|revision|preparedInputs|layerSourceContext|executionResultContext|regionalGuidance)(?:\.|$)/i.test(
        key,
      ),
    ),
    false,
  )
  for (const name of ['Apply', 'Recall', 'Restore', 'Create Preset', adapter.saveLabel])
    await expect(dialog().getByRole('button', { name, exact: true })).toHaveCount(0)
  assert.equal(
    await dialog().locator('canvas, img, video').count(),
    0,
    'Settings comparison has no image before/after',
  )
  const text = await dialog().innerText()
  for (const privateValue of [
    source.value.generationProvenance.layerSourceContext.layerId,
    source.value.generationProvenance.layerSourceContext.sourceDocumentRevision,
    source.value.generationProvenance.executionResultContext.candidateId,
    source.value.generationProvenance.layerSourceContext.preparedInputs.finalContributionMask
      .sha256,
  ])
    assert.equal(text.includes(privateValue), false, 'Private context escaped into popover')
  if (config.loras !== undefined) {
    const rendered = await adapter.values('loras.stack').nth(0).innerText()
    if (config.loras.length) {
      // Each resource description itself spans lines. Only a newline introducing the next
      // Enabled/Disabled prefix separates entries; attribution and zero must be exact per entry.
      const entries = rendered.split(/\n(?=(?:Enabled|Disabled) · )/)
      assert.equal(entries.length, config.loras.length, 'Exact rendered LoRA entry count')
      for (const [index, lora] of config.loras.entries()) {
        const resource = lora.resource
        const lines = [
          `${lora.enabled ? 'Enabled' : 'Disabled'} · ${resource.displayName} · ${resource.versionName}`,
          `${resource.baseModelFamily ?? 'Family unavailable'} · ${resource.kind} · SHA-256 ${resource.fileSha256}`,
        ]
        if (
          resource.civitaiModelId !== null ||
          resource.civitaiVersionId !== null ||
          resource.civitaiFileId !== null
        )
          lines.push(
            `CivitAI model ${resource.civitaiModelId ?? 'Unavailable'} · version ${resource.civitaiVersionId ?? 'Unavailable'} · file ${resource.civitaiFileId ?? 'Unavailable'}`,
          )
        const expectedEntry = `${lines.join('\n')} · Weight ${String(lora.weight)}`
        assert.equal(
          entries[index],
          expectedEntry,
          `Rendered LoRA ${index}: exact resource/hash/order/enabled state and trailing weight`,
        )
      }
    } else {
      assert.equal(rendered, 'None')
    }
  } else await expect(adapter.setting('loras.stack')).toHaveAttribute('data-status', 'Unavailable')
  if (source.family === 'anima') {
    await expect(adapter.values('sampling.animaMethod').nth(0)).toHaveText(
      config.sampling.animaMethod === 'heun' ? 'Heun' : 'Euler',
    )
    for (const key of [
      'sampling.sampler',
      'sampling.scheduler',
      'sampling.invokeScheduler',
      'model.predictionType',
    ])
      await expect(adapter.setting(key)).toHaveCount(0)
    for (const role of ['qwen3Encoder', 'vae']) {
      await expect(adapter.setting(`anima.${role}`)).toHaveAttribute('data-status', 'Unavailable')
      await expect(adapter.values(`anima.${role}`).nth(0)).toContainText(config.anima[role].sha256)
      await expect(adapter.values(`anima.${role}`).nth(0)).toContainText(
        `${config.anima[role].byteSize} bytes`,
      )
    }
  } else {
    for (const key of ['sampler', 'scheduler', 'invokeScheduler'])
      await expect(adapter.values(`sampling.${key}`).nth(0)).toHaveText(config.sampling[key])
  }
  for (const key of ['cfgRescale', 'vaePrecision']) {
    if (config[key] === undefined)
      await expect(adapter.setting(`${key}.value`)).toHaveAttribute('data-status', 'Unavailable')
    else await expect(adapter.values(`${key}.value`).nth(0)).toHaveText(String(config[key]))
  }
  if (config.sampling.denoisingStrength !== undefined)
    await expect(adapter.values('denoisingStrength.value').nth(0)).toHaveText(
      String(config.sampling.denoisingStrength),
    )
  report.projections ??= []
  report.projections.push({ owner: adapter.request(await current(), source).owner, keys, text })
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
  assert.ok(
    value.groups.some(({ ownedScope, deadlineTimer }) => ownedScope && deadlineTimer) ||
      report.launcher.runtimeSeconds <= nativeDeadlineSeconds,
    'Inherited native groups require launcher deadline <=360s; otherwise an independent owned native deadline is mandatory',
  )
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
      calls: await application.evaluate(() => globalThis.igsSmartCompareCalls ?? []),
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
    sourceRows().tables.generation_queue_item,
    [],
    'Portable fixtures must not imply queue execution',
  )
  report.runtime = runtime
}
// UI-audit V2/V4/V5 + I1/I2/I3: inspect glyph and hit bounds at every scroll position. Scroll
// clipping is intentional only at the scrollport; internal glyph clipping and covered controls
// fail. Every text line must become fully visible in at least one sample. Root still inspects PNGs.
async function inspectLayout(label) {
  await ready()
  await window.evaluate(() => document.fonts.ready.then(() => undefined))
  const scroll = adapter.scroll()
  const dimensions = await scroll.evaluate((node) => ({
    height: node.clientHeight,
    total: node.scrollHeight,
  }))
  assert.ok(dimensions.height > 0 && dimensions.total > dimensions.height, 'Exercise real overflow')
  const positions = []
  for (
    let top = 0;
    top < dimensions.total - dimensions.height;
    top += Math.max(1, Math.floor(dimensions.height / 2))
  )
    positions.push(top)
  positions.push(dimensions.total - dimensions.height)
  assert.ok(positions.length <= 60, 'Finite scroll traversal')
  const allLines = new Set(),
    seenLines = new Set(),
    samples = []
  for (const top of positions) {
    await scroll.evaluate((node, top) => {
      node.scrollTop = top
    }, top)
    await frames()
    const sample = await dialog().evaluate((surface) => {
      const body = surface.querySelector('.comparison-scroll')
      const bodyBox = body.getBoundingClientRect()
      const violations = [],
        allLines = [],
        seenLines = [],
        controls = [],
        glyphs = []
      const rect = (r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })
      const check = (bounds, node, label, bodyContent) => {
        if (
          bounds.left < -1 ||
          bounds.top < -1 ||
          bounds.right > innerWidth + 1 ||
          bounds.bottom > innerHeight + 1
        )
          violations.push({ label, clipped: 'viewport', rect: rect(bounds) })
        for (let owner = node; owner instanceof HTMLElement; owner = owner.parentElement) {
          if (bodyContent && owner === body) continue
          const style = getComputedStyle(owner),
            box = owner.getBoundingClientRect()
          const left = box.left + owner.clientLeft,
            top = box.top + owner.clientTop
          const ellipsis =
            style.textOverflow === 'ellipsis' && owner.title.trim() === owner.textContent.trim()
          if (
            !ellipsis &&
            /^(hidden|clip|scroll|auto)$/.test(style.overflowX) &&
            (bounds.left < left - 1 || bounds.right > left + owner.clientWidth + 1)
          )
            violations.push({ label, clipped: `x:${owner.className}`, rect: rect(bounds) })
          if (
            /^(hidden|clip|scroll|auto)$/.test(style.overflowY) &&
            (bounds.top < top - 1 || bounds.bottom > top + owner.clientHeight + 1)
          )
            violations.push({ label, clipped: `y:${owner.className}`, rect: rect(bounds) })
        }
      }
      check(surface.getBoundingClientRect(), surface.parentElement, 'dialog', false)
      for (const control of surface.querySelectorAll('button,[role="checkbox"]')) {
        const bounds = control.getBoundingClientRect()
        if (!bounds.width || !bounds.height) continue
        check(bounds, control.parentElement, control.ariaLabel || control.textContent.trim(), false)
        const hit = document.elementFromPoint(
          (bounds.left + bounds.right) / 2,
          (bounds.top + bounds.bottom) / 2,
        )
        const reachable = Boolean(hit && (hit === control || control.contains(hit)))
        controls.push({ label: control.ariaLabel || control.textContent.trim(), reachable })
        if (!control.disabled && !reachable)
          violations.push({ coveredControl: control.ariaLabel || control.textContent.trim() })
      }
      for (const svg of surface.querySelectorAll('button svg')) {
        const bounds = svg.getBoundingClientRect()
        if (!bounds.width || !bounds.height) continue
        check(bounds, svg.parentElement, 'visible button icon', false)
        const button = svg.closest('button').getBoundingClientRect()
        if (
          bounds.left < button.left - 1 ||
          bounds.top < button.top - 1 ||
          bounds.right > button.right + 1 ||
          bounds.bottom > button.bottom + 1
        )
          violations.push({ iconOutsideControl: rect(bounds), button: rect(button) })
      }
      const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT)
      let index = 0
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        index++
        if (
          !node.textContent.trim() ||
          getComputedStyle(node.parentElement).visibility !== 'visible'
        )
          continue
        const range = document.createRange()
        range.selectNodeContents(node)
        let line = 0
        for (const bounds of range.getClientRects()) {
          const id = `${index}:${line++}`
          if (!bounds.width || !bounds.height) continue
          allLines.push(id)
          const bodyContent = body.contains(node)
          if (bodyContent && (bounds.top < bodyBox.top - 1 || bounds.bottom > bodyBox.bottom + 1))
            continue
          seenLines.push(id)
          check(bounds, node.parentElement, node.textContent.trim(), bodyContent)
          glyphs.push({ id, text: node.textContent.trim(), rect: rect(bounds) })
        }
      }
      const footer = surface.querySelector('.comparison-same-toggle').getBoundingClientRect()
      return {
        top: body.scrollTop,
        allLines,
        seenLines,
        controls,
        glyphs,
        footer: rect(footer),
        body: rect(bodyBox),
        violations,
      }
    })
    samples.push(sample)
    sample.allLines.forEach((id) => allLines.add(id))
    sample.seenLines.forEach((id) => seenLines.add(id))
  }
  report.layoutChecks.push({ label, dimensions, samples, lineCount: allLines.size })
  checkpoint()
  assert.deepEqual(
    samples.flatMap(({ violations }) => violations),
    [],
    `${label}: clipping or control reachability`,
  )
  assert.ok(allLines.size > 20)
  assert.deepEqual(
    [...allLines].filter((id) => !seenLines.has(id)),
    [],
    'Every text line must be readable during traversal',
  )
  assert.deepEqual(
    samples[0].footer,
    samples.at(-1).footer,
    'Footer remains visible while body scrolls',
  )
  assert.ok(samples.at(-1).top > 0)
  await screenshot(`${label}-scrolled`)
  await scroll.evaluate((node) => {
    node.scrollTop = 0
  })
  await frames()
  await screenshot(`${label}-top`)
  checkpoint()
}
async function selectedPatchCurrentProject() {
  const source = fixture.variants[0]
  await expectedNavigation(
    'Explicitly select a Patch with a distinct authored draft',
    async () => {
      await projectView()
        .getByRole('button', { name: `Select ${source.owner.name}`, exact: true })
        .click()
    },
    source.owner.name,
  )
  await expect(projectView().getByRole('textbox', { name: 'Steps', exact: true })).toHaveValue('67')
  const before = await witness()
  assert.notEqual(before.tab.generationDraft.sampling.steps, 67)
  assert.notEqual(
    before.tab.generationDraft.positivePrompt.text,
    source.owner.generationDraft.positivePrompt.text,
  )
  await openComparison(source)
  await assertProjection(source, before.tab.generationDraft)
  await screenshot('selected-patch-versus-current-project-1440x900')
  await closeComparison(source)
  await unchanged(
    before,
    'Selected Patch menu uses current PROJECT settings; Compare/toggle/Close do not select/activate/seal',
  )
  check(
    '03 Selected Patch draft Steps 67 differs from Project 24 and frozen result 31; actual menu compares Project Canvas, including seed zero and unavailable mode',
  )
}
async function controls() {
  for (const source of [fixture.empty, fixture.imported]) {
    const sourceRef = source === fixture.empty ? { owner: source } : source
    const before = await witness()
    await expect(window.getByRole('menuitem')).toHaveCount(0)
    await adapter.menu(sourceRef).scrollIntoViewIfNeeded()
    await adapter.menu(sourceRef).click()
    await expect(
      window.getByRole('menuitem', { name: `${adapter.label} · No generation data`, exact: true }),
    ).toHaveAttribute('aria-disabled', 'true')
    await expect(
      window.getByRole('menuitem', {
        name:
          source === fixture.empty
            ? `${adapter.saveLabel} · No generation data`
            : adapter.saveLabel,
        exact: true,
      }),
    ).toHaveAttribute('aria-disabled', 'true')
    await window.keyboard.press('Escape')
    await unchanged(before, 'Empty/imported menu leaves No generation data disabled')
  }
  const before = await witness()
  await openComparison(fixture.ordinary, true)
  await dialog().getByRole('checkbox', { name: adapter.unchangedLabel, exact: true }).check()
  await column('size.dimensions', '8 × 8', '640 × 384', 'Changed')
  await column('guidance.steps', '19', String(before.tab.generationDraft.sampling.steps), 'Changed')
  await expect(adapter.values('seed.actual').nth(0)).toHaveText('0')
  await screenshot('ordinary-raster-size-control-1440x900')
  await closeComparison(fixture.ordinary, true)
  await unchanged(
    before,
    'Ordinary Raster retains Size and independent reader; Escape returns trigger focus',
  )
  // Detached source entry remains a separate working action; no Create or preset writes.
  for (const source of [fixture.variants[0], fixture.converted[4], fixture.ordinary]) {
    const before = await witness()
    await openMenu(source)
    await window.getByRole('menuitem', { name: adapter.saveLabel, exact: true }).click()
    const manager = window.getByRole('dialog', { name: 'Preset Manager', exact: true })
    await expect(manager).toBeVisible()
    await expect(manager.getByRole('alert', { name: 'Source result', exact: true })).toBeVisible()
    await expect(manager.getByRole('button', { name: 'Create Preset', exact: true })).toBeVisible()
    const cancel = manager.getByRole('button', { name: 'Cancel', exact: true })
    await cancel.click()
    await expect(manager).toBeHidden()
    await unchanged(before, 'Separate result-to-preset action/Cancel remains read-only')
  }
  check(
    '04 Ordinary Raster Size, empty/imported disabled controls and preserved active/converted/ordinary result-preset entry points/Cancel',
  )
}
async function matrix() {
  for (const [index, source] of fixture.variants.entries()) {
    const converted = fixture.converted[index]
    const before = await witness()
    for (const owner of [source, converted]) {
      await openComparison(owner)
      await assertProjection(owner, before.tab.generationDraft)
      await closeComparison(owner)
      await unchanged(before, `${owner.family}/${owner.mode}/${owner.kind}: exact immutable source`)
    }
    check(
      `${String(index + 5).padStart(2, '0')} ${source.family} recorded ${source.mode}: active Patch and converted Raster use exact frozen configuration, Project current side, no generic Size/private fields`,
      {
        active: source.value.id,
        converted: converted.value.id,
        hidden: !source.owner.visible,
        locked: source.owner.locked,
      },
    )
  }
}
async function layoutAndFocus() {
  const source = fixture.variants[0]
  for (const [width, height] of [
    [1440, 900],
    [900, 620],
  ]) {
    await setNativeSize(width, height)
    const before = await witness()
    await openComparison(source)
    await assertProjection(source, before.tab.generationDraft)
    await inspectLayout(`comparison-${width}x${height}`)
    await closeComparison(source, width === 900)
    await unchanged(
      before,
      `${width}x${height}: real native layout, scroll, footer, Close/Escape focus`,
    )
  }
  await setNativeSize(1440, 900)
  const before = await witness()
  await openComparison(source)
  // Focus a harmless textbox via real pointer input; the outside-dismiss handler must retain it.
  const steps = projectView().getByRole('textbox', { name: 'Steps', exact: true })
  await steps.click()
  await expect(dialog()).toBeHidden()
  await expect(steps).toBeFocused()
  await unchanged(before, 'Outside dismissal retains clicked Steps focus without editing/sealing')
  check(
    '13 Real 1440×900/900×620 BrowserWindow bounds, all glyph lines, hit reachability, scrolling/footer, Close/Escape and outside-dismiss focus',
  )
}
async function editProjectSteps() {
  // Selecting an ordinary Raster makes the visible editor the Project editor, even though Compare
  // is opened from a Patch. fill() focuses/inputs without a pointer outside-dismiss event.
  await expectedNavigation(
    'Explicitly select ordinary Raster for the Project Steps editor',
    async () => {
      const select = projectView().getByRole('button', {
        name: `Select ${fixture.ordinary.value.name}`,
        exact: true,
      })
      await select.scrollIntoViewIfNeeded()
      await select.click()
    },
    fixture.ordinary.value.name,
  )
  const source = fixture.variants[0]
  const before = await witness()
  assert.equal(before.tab.generationDraft.sampling.steps, 24)
  await openComparison(source)
  await assertProjection(source, before.tab.generationDraft)
  const frozen = (await readSmart(source)).data.generationConfiguration
  const previous = (await ipcCalls()).length
  const steps = projectView().getByRole('textbox', { name: 'Steps', exact: true })
  await expect(steps).toHaveValue('24')
  await steps.fill('29')
  await steps.press('Enter')
  await expect.poll(async () => (await current()).generationDraft.sampling.steps).toBe(29)
  let acknowledged
  await expect
    .poll(async () => {
      acknowledged = (await ipcCalls())
        .slice(previous)
        .find((call) => call.channel === 'projects:update-generation-draft' && call.finished)
      return acknowledged?.ok
    })
    .toBe(true)
  assert.equal(acknowledged.args[0], before.tab.id)
  assert.deepEqual(acknowledged.args[1], { kind: 'sampling-steps', value: 29 })
  assert.ok(acknowledged.args[3] == null, 'The deliberate edit must target Project, never Patch')
  await ready()
  await column('guidance.steps', String(frozen.sampling.steps), '29', 'Changed')
  const after = await witness()
  assert.deepEqual(after.tab.generationDraft, {
    ...before.tab.generationDraft,
    sampling: { ...before.tab.generationDraft.sampling, steps: 29 },
  })
  assert.notEqual(after.tab.documentRevision, before.tab.documentRevision)
  assert.equal(after.tab.dirty, true)
  assert.equal(after.tab.canUndo, true)
  // Signed renderer media URLs legitimately rotate with the acknowledged document revision.
  // Compare the full durable owner/asset/provenance document, preserving both raw tab witnesses.
  assert.deepEqual(
    after.liveDocument,
    {
      ...before.liveDocument,
      documentRevision: after.liveDocument.documentRevision,
      generationDraft: {
        ...before.liveDocument.generationDraft,
        sampling: { ...before.liveDocument.generationDraft.sampling, steps: 29 },
      },
    },
    'Only Project Steps/revision may change; Patch drafts, PNGs/provenance/active members remain exact',
  )
  assert.deepEqual(after.ui, before.ui)
  assert.equal(after.packageSha256, before.packageSha256)
  assert.deepEqual(after.savedDocument, before.savedDocument)
  assert.deepEqual(
    after.sourceRows,
    before.sourceRows,
    'Project edit must not alter library/seed/index/queue tables',
  )
  const mutations = after.mutations.slice(before.mutations.length)
  assert.equal(mutations.length, 1, 'Exactly one deliberate edit; no seal, flush or extra mutation')
  assert.equal(mutations[0].channel, 'projects:update-generation-draft')
  assert.deepEqual((await readSmart(source)).data.generationConfiguration, frozen)
  report.expectedActions.push({
    label: 'Acknowledged Project Steps 24→29',
    kind: 'edit',
    before,
    after,
    acknowledged,
  })
  await screenshot('acknowledged-project-steps-versus-frozen-baseline')
  await closeComparison(source)
  await unchanged(
    after,
    'Mounted recompute and Close preserve acknowledged edited state and frozen baseline',
  )
  await snapshot('02-after-project-steps')
  check(
    '14 One real acknowledged Project Steps edit recomputes the mounted current column; separate edit witness proves no Patch draft or frozen baseline change',
  )
}
async function switchActive() {
  const source = fixture.variants[0],
    alternate = fixture.inactive
  const viewport = () =>
    canvas()
      .locator('.canvas-area')
      .evaluate((node) => {
        const { width, height } = node.getBoundingClientRect()
        return { width, height }
      })
  const before = await witness()
  const beforeViewport = await viewport()
  await openComparison(source)
  await assertProjection(source, before.tab.generationDraft)
  // The production browser intentionally dismisses Compare. Use that actual navigation path,
  // then require a new menu request/response bound to the newly active stored member.
  await adapter.browse(source).press('Enter')
  await expect(browser()).toBeVisible()
  await expect(dialog()).toBeHidden()
  await expect(browser().getByRole('button', { name: /Compare generation settings/ })).toHaveCount(
    0,
  )
  const action = browser().getByRole('button', {
    name: `Select variant ${alternate.value.name}`,
    exact: true,
  })
  await action.scrollIntoViewIfNeeded()
  await action.press('Enter')
  await expect
    .poll(
      async () =>
        (await current()).layers.find(({ id }) => id === source.owner.id).activeRasterSubLayerId,
    )
    .toBe(alternate.value.id)
  await browser()
    .getByRole('button', { name: 'Close Smart Patch variants', exact: true })
    .press('Enter')
  await expect(browser()).toBeHidden()
  await openComparison(alternate)
  await assertProjection(alternate, before.tab.generationDraft)
  const after = await witness()
  const expected = [
    { channel: 'projects:seal-prompt-history', args: [before.tab.id, null] },
    {
      channel: 'projects:update-smart-patch-variant',
      args: [
        before.tab.id,
        source.owner.id,
        {
          kind: 'select',
          variantId: alternate.value.id,
          documentId: before.tab.documentId,
          documentRevision: before.tab.documentRevision,
        },
      ],
    },
  ]
  const mutations = expectedMutationCalls(before, after, expected, 'Explicit active-member switch')
  assert.deepEqual(after.tab.generationDraft, before.tab.generationDraft)
  const afterViewport = await viewport()
  assert.deepEqual(afterViewport, beforeViewport)
  assert.deepEqual(after.ui, before.ui)
  assert.deepEqual(after.savedDocument, before.savedDocument)
  assert.equal(after.packageSha256, before.packageSha256)
  assert.deepEqual(after.sourceRows, before.sourceRows)
  const expectedLayers = structuredClone(before.liveDocument.layers)
  expectedLayers.find(({ id }) => id === source.owner.id).activeRasterSubLayerId =
    alternate.value.id
  assert.deepEqual(
    after.liveDocument,
    {
      ...before.liveDocument,
      documentRevision: after.liveDocument.documentRevision,
      layers: expectedLayers,
    },
    'Only the explicitly selected active member and document revision may change',
  )
  assert.equal(after.tab.canUndo, true)
  report.expectedActions.push({
    label: 'Explicit active-member switch via actual variants browser',
    kind: 'active-member',
    before,
    after,
    beforeViewport,
    afterViewport,
    expected,
    mutations,
  })
  await screenshot('active-member-refresh-through-real-menu')
  await closeComparison(alternate)
  await unchanged(
    after,
    'Active-member refresh leaves only the separately witnessed tab seal and exact select mutation',
  )
  check(
    '15 Actual variants-browser selection and reopened source menu refresh the immutable baseline with the newly active member; inactive direct Compare stays absent',
  )
}
async function restoreReplyProbe() {
  if (!application || !probeInstalled) return
  const restored = await application.evaluate(({ ipcMain }, channel) => {
    const probe = globalThis.igsSmartCompareProbe
    if (!probe) throw new Error('Missing owned response probe')
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, probe.original)
    if (ipcMain._invokeHandlers.get(channel) !== probe.original)
      throw new Error('Original comparison handler was not restored exactly')
    // Restore before releasing: a serialized reader may immediately start its pending next read.
    // An already entered wrapper also checks restoring before installing another held reply.
    probe.restoring = true
    const heldReplies = Object.entries(probe.replies ?? {})
      .filter(([, reply]) => reply.held)
      .map(([name]) => name)
    for (const reply of Object.values(probe.replies ?? {})) reply.release?.()
    probe.release?.()
    return { held: probe.held === true, heldReplies, originalHandlerRestored: true }
  }, adapter.channel)
  if (restored.held) {
    await expect
      .poll(() => application.evaluate(() => globalThis.igsSmartCompareProbe.delivered))
      .toBe(true)
  }
  if (restored.heldReplies.length) {
    await expect
      .poll(() =>
        application.evaluate(
          (_, names) =>
            names.every((name) => globalThis.igsSmartCompareProbe.replies[name].delivered),
          restored.heldReplies,
        ),
      )
      .toBe(true)
  }
  await application.evaluate(() => {
    delete globalThis.igsSmartCompareProbe
  })
  probeInstalled = false
  heldReply = false
  report.probeRestorations ??= []
  report.probeRestorations.push({ channel: adapter.channel, ...restored })
  await frames()
}
async function refusals() {
  const source = fixture.inactive // current active member after the separately witnessed switch
  const before = await witness()
  const { tab, request, data } = await readSmart(source)
  const original = fixture.variants[0]
  const other = fixture.variants[1]
  const crossed = {
    'valid-same-parent': {
      ...structuredClone(data),
      owner: {
        kind: 'smart-patch-variant',
        layerId: original.owner.id,
        variantId: original.value.id,
      },
      resultId: original.value.id,
    },
    'valid-other-parent': {
      ...structuredClone(data),
      owner: { kind: 'smart-patch-variant', layerId: other.owner.id, variantId: other.value.id },
      resultId: other.value.id,
    },
    'valid-other-parent-same-result': {
      ...structuredClone(data),
      owner: { ...structuredClone(data.owner), layerId: other.owner.id },
    },
    'valid-raster-owner': {
      ...structuredClone(data),
      owner: { kind: 'raster', layerId: fixture.converted[0].value.id },
      resultId: fixture.converted[0].value.id,
    },
  }
  for (const [name, value] of Object.entries(crossed)) {
    assert.equal(
      validEnvelope(value, source),
      true,
      `${name} must remain internally strict and valid`,
    )
    assert.equal(
      adapter.isEnvelope(value),
      true,
      `${name} must pass the actual production envelope schema`,
    )
    assert.deepEqual(value.generationConfiguration, data.generationConfiguration)
    assert.equal(value.assetSha256, request.assetSha256)
    assert.equal(value.documentId, request.documentId)
    assert.equal(value.documentRevision, request.documentRevision)
    if (name === 'valid-other-parent-same-result') {
      assert.equal(value.owner.kind, request.owner.kind)
      assert.equal(value.owner.variantId, request.owner.variantId)
      assert.equal(value.resultId, request.owner.variantId)
      assert.notEqual(value.owner.layerId, request.owner.layerId)
      assert.notEqual(value.owner.layerId, value.owner.variantId)
      assert.deepEqual(
        value,
        { ...data, owner: { ...data.owner, layerId: other.owner.id } },
        'Only the parent changes; result/variant/configuration/hash/document/revision stay exact',
      )
    } else {
      assert.notEqual(value.resultId, request.owner.variantId)
    }
  }
  // Main must refuse inactive membership even though that exact accepted variant is still stored.
  const invalid = [
    { ...request, documentId: randomUUID() },
    { ...request, documentRevision: randomUUID() },
    { ...request, assetSha256: '0'.repeat(64) },
    { ...request, owner: { ...request.owner, variantId: original.value.id } },
    { ...request, owner: { ...request.owner, variantId: other.value.id } },
  ]
  for (const value of invalid) {
    const response = await rawApi('projects', adapter.method, tab.id, value)
    assert.equal(
      response.ok,
      false,
      'Main must refuse stale/hash-invalid/inactive/cross-parent owners',
    )
    report.refusals.push({ boundary: 'original-Main', request: value, response })
  }
  await application.evaluate(
    ({ ipcMain }, { channel, crossed }) => {
      const original = ipcMain._invokeHandlers.get(channel)
      if (typeof original !== 'function') throw new Error('Actual Smart comparison handler missing')
      const probe = { original, mode: null, crossed }
      globalThis.igsSmartCompareProbe = probe
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, async (event, ...args) => {
        const response = await original(event, ...args)
        if (!response.ok) return response
        const changed = structuredClone(response)
        if (probe.mode in crossed) changed.value = structuredClone(crossed[probe.mode])
        if (probe.mode === 'revision')
          changed.value.documentRevision = '00112233-4455-4677-8899-aabbccddeeff'
        if (probe.mode === 'result') changed.value.resultId = '00112233-4455-4677-8899-aabbccddeeff'
        if (probe.mode === 'private')
          changed.value.generationConfiguration.model.managedPath = '/private/compare/model'
        probe.last = { args: structuredClone(args), response: structuredClone(changed) }
        return changed
      })
    },
    { channel: adapter.channel, crossed },
  )
  probeInstalled = true
  try {
    for (const mode of ['revision', 'result', 'private', ...Object.keys(crossed)]) {
      await application.evaluate((_, mode) => {
        globalThis.igsSmartCompareProbe.mode = mode
      }, mode)
      const response = await rawApi('projects', adapter.method, tab.id, request)
      assert.equal(response.ok, false, `Actual preload must reject ${mode}`)
      assert.equal(response.error.code, 'IPC_INVALID_RESPONSE')
      const injected = await application.evaluate(() => globalThis.igsSmartCompareProbe.last)
      assert.deepEqual(injected.args, [tab.id, request], 'Only the successful reply may be crossed')
      const schemaValid = adapter.isEnvelope(injected.response.value)
      assert.equal(
        schemaValid,
        validEnvelope(injected.response.value, source),
        'Independent/production shape agreement',
      )
      if (mode in crossed) {
        assert.equal(
          schemaValid,
          true,
          'Schema rejection must not hide a missing identity correlation guard',
        )
        assert.deepEqual(injected.response.value, crossed[mode])
      }
      if (mode === 'private') assert.equal(schemaValid, false)
      report.refusals.push({ boundary: 'actual-preload', mode, response, schemaValid, injected })
    }
    await application.evaluate(() => {
      globalThis.igsSmartCompareProbe.mode = 'valid-other-parent-same-result'
    })
    await openMenu(source)
    await window.getByRole('menuitem', { name: adapter.label, exact: true }).click()
    await expect(dialog()).toBeVisible()
    await expect(dialog().getByRole('alert')).toBeVisible()
    await expect(dialog().locator('[data-setting]')).toHaveCount(0)
    await screenshot('crossed-reply-refused-in-actual-popover')
    await closeComparison(source)
  } finally {
    await restoreReplyProbe()
  }
  await openComparison(source)
  await assertProjection(source, before.tab.generationDraft)
  await closeComparison(source)
  await unchanged(before, 'Main/preload refusals, visible error and restored positive control')
  check(
    '16 Main refuses inactive/stale/cross-parent owners; actual preload rejects internally-valid crossed replies including same-result foreign parent and private fields, popover fails closed, restored genuine path passes',
  )
}
// Observe the newest actual dialog before releasing either held response. Mutation records
// include added/removed settings nodes so even a brief publication cleared before the next poll
// is evidence. No model/helper result is used to stand in for the rendered comparison.
async function startPublicationProbe(oldSource) {
  const config = oldSource.value.generationProvenance.generationConfiguration
  await dialog().evaluate(
    (surface, oldPrompts) => {
      if (globalThis.igsSmartComparePublicationProbe)
        throw new Error('A publication observer is already installed')
      const probe = {
        blocked: true,
        samples: [],
        violations: [],
        overflow: false,
        oldPrompts,
        capture: null,
        observer: null,
      }
      const settingsNode = (node) =>
        node instanceof Element &&
        Boolean(
          node.matches('[data-setting]') ||
          node.closest('[data-setting]') ||
          node.querySelector('[data-setting]'),
        )
      probe.capture = (reason, records = []) => {
        const rows = [...surface.querySelectorAll('[data-setting]')]
        const promptBefore =
          surface.querySelector('[data-setting="prompt.text"] .comparison-values > div > p')
            ?.textContent ?? null
        const negativeBefore =
          surface.querySelector('[data-setting="negativePrompt.text"] .comparison-values > div > p')
            ?.textContent ?? null
        const settingsMutation = records.some(
          (record) =>
            settingsNode(
              record.target instanceof Element ? record.target : record.target.parentElement,
            ) || [...record.addedNodes, ...record.removedNodes].some(settingsNode),
        )
        const sample = {
          reason,
          blocked: probe.blocked,
          connected: surface.isConnected,
          keys: rows.map((row) => row.dataset.setting),
          promptBefore,
          negativeBefore,
          mutationCount: records.length,
          settingsMutation,
        }
        if (probe.samples.length < 256) probe.samples.push(sample)
        else probe.overflow = true
        const violation = (reason) => {
          if (probe.violations.length < 256) probe.violations.push({ reason, sample })
          else probe.overflow = true
        }
        if (probe.blocked && (rows.length || settingsMutation))
          violation('Settings published while newest genuine reply was withheld')
        if (
          promptBefore === probe.oldPrompts.positive ||
          negativeBefore === probe.oldPrompts.negative
        )
          violation('Old source prompt published in the newest owner dialog')
      }
      probe.observer = new MutationObserver((records) => probe.capture('mutation', records))
      probe.observer.observe(surface, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['data-setting'],
      })
      globalThis.igsSmartComparePublicationProbe = probe
      probe.capture('newest-dialog-opened-before-old-release')
    },
    { positive: config.positivePrompt.text, negative: config.negativePrompt.text },
  )
}
async function publicationBarrier(label, allowNewest = false) {
  await frames()
  const result = await window.evaluate(
    ({ label, allowNewest }) => {
      const probe = globalThis.igsSmartComparePublicationProbe
      if (!probe) throw new Error('Publication observer is missing')
      probe.capture(label, probe.observer.takeRecords())
      const result = {
        scenario: probe.scenario ?? 'dual-success',
        samples: structuredClone(probe.samples),
        violations: structuredClone(probe.violations),
        overflow: probe.overflow,
      }
      if (allowNewest) probe.blocked = false
      return result
    },
    { label, allowNewest },
  )
  report.lateReplyPublications ??= []
  report.lateReplyPublications.push({ label, ...result })
  checkpoint()
  assert.equal(result.overflow, false, 'Publication observation must remain complete and finite')
  assert.deepEqual(result.violations, [], `${label}: stale or premature settings publication`)
  return result
}
async function stopPublicationProbe() {
  const result = await window.evaluate(() => {
    const probe = globalThis.igsSmartComparePublicationProbe
    if (!probe) return null
    probe.capture('observer-stop', probe.observer.takeRecords())
    probe.observer.disconnect()
    delete globalThis.igsSmartComparePublicationProbe
    return {
      scenario: probe.scenario ?? 'dual-success',
      samples: probe.samples,
      violations: probe.violations,
      overflow: probe.overflow,
    }
  })
  if (result) {
    if (result.scenario === 'delayed-error') report.lateErrorPublicationFinal = result
    else report.lateReplyPublicationFinal = result
    checkpoint()
    assert.equal(result.overflow, false)
    assert.deepEqual(result.violations, [], 'All observed newest-dialog publications must be valid')
  }
}
// The delayed-error case needs more than the success case's settings observer: an obsolete
// catch must not flash an alert or replace the newest owner's loading state, even transiently.
async function startErrorPublicationProbe(expectedOwnerName, failureMessage) {
  await dialog().evaluate(
    (surface, { expectedOwnerName, failureMessage }) => {
      if (globalThis.igsSmartComparePublicationProbe)
        throw new Error('A publication observer is already installed')
      const loader = surface.querySelector('.comparison-loading')
      const heading = surface.querySelector('.comparison-heading strong')
      if (!loader || !heading || heading.textContent !== expectedOwnerName)
        throw new Error('The newest owner must be loading before observing its obsolete error')
      const probe = {
        scenario: 'delayed-error',
        blocked: true,
        samples: [],
        violations: [],
        overflow: false,
        capture: null,
        observer: null,
      }
      const alertSelector = '[role="alert"], .n-alert'
      const alertNode = (node) =>
        node instanceof Element &&
        Boolean(
          node.matches(alertSelector) ||
          node.closest(alertSelector) ||
          node.querySelector(alertSelector),
        )
      const contains = (node, target) =>
        node === target || (node instanceof Element && node.contains(target))
      probe.capture = (reason, records = []) => {
        const touchedNodes = records.flatMap((record) => [
          record.target,
          ...record.addedNodes,
          ...record.removedNodes,
        ])
        const alertMutation = touchedNodes.some(alertNode)
        const loadingRemoved = records.some((record) =>
          [...record.removedNodes].some((node) => contains(node, loader)),
        )
        const loadingStateMutation = records.some(
          (record) => record.type === 'attributes' && record.target === loader,
        )
        const ownerMutation = records.some(
          (record) =>
            contains(heading, record.target) ||
            [...record.addedNodes, ...record.removedNodes].some((node) => contains(node, heading)),
        )
        const errorMarkerMutation =
          touchedNodes.some((node) => node.textContent?.includes(failureMessage)) ||
          records.some((record) => record.oldValue?.includes(failureMessage))
        const currentLoader = surface.querySelector('.comparison-loading')
        const style = currentLoader ? getComputedStyle(currentLoader) : null
        const loadingVisible = Boolean(
          currentLoader &&
          currentLoader === loader &&
          currentLoader.getClientRects().length &&
          style.display !== 'none' &&
          style.visibility !== 'hidden',
        )
        const sample = {
          reason,
          blocked: probe.blocked,
          connected: surface.isConnected,
          ownerHeading: surface.querySelector('.comparison-heading strong')?.textContent ?? null,
          ownerMutation,
          keys: [...surface.querySelectorAll('[data-setting]')].map((row) => row.dataset.setting),
          alertCount: surface.querySelectorAll(alertSelector).length,
          alertMutation,
          loadingPresent: Boolean(currentLoader),
          loadingVisible,
          loadingText: currentLoader?.textContent?.trim() ?? null,
          loadingRemoved,
          loadingStateMutation,
          errorMarkerVisible: surface.textContent.includes(failureMessage),
          errorMarkerMutation,
          mutationCount: records.length,
        }
        if (probe.samples.length < 256) probe.samples.push(sample)
        else probe.overflow = true
        const violation = (reason) => {
          if (probe.violations.length < 256) probe.violations.push({ reason, sample })
          else probe.overflow = true
        }
        if (!sample.connected || sample.ownerHeading !== expectedOwnerName || ownerMutation)
          violation('Newest owner dialog/header was replaced during the obsolete error read')
        if (sample.alertCount || alertMutation || sample.errorMarkerVisible || errorMarkerMutation)
          violation('An alert or obsolete injected error was published in the newest owner dialog')
        if (
          probe.blocked &&
          (!loadingVisible ||
            !sample.loadingText?.includes('Reading generation data…') ||
            loadingRemoved ||
            loadingStateMutation ||
            sample.keys.length)
        )
          violation('Newest loading state was replaced while its genuine reply remained withheld')
      }
      probe.observer = new MutationObserver((records) => probe.capture('mutation', records))
      probe.observer.observe(surface, {
        childList: true,
        subtree: true,
        characterData: true,
        characterDataOldValue: true,
        attributes: true,
        attributeOldValue: true,
      })
      globalThis.igsSmartComparePublicationProbe = probe
      probe.capture('newest-owner-loading-before-releasing-obsolete-injected-error')
    },
    { expectedOwnerName, failureMessage },
  )
}
async function lateReply() {
  const source = fixture.inactive,
    next = fixture.converted[5]
  const before = await witness()
  const oldRequest = adapter.request(before.tab, source)
  const newestRequest = adapter.request(before.tab, next)
  await application.evaluate(
    ({ ipcMain }, { channel, tabId, oldRequest, newestRequest }) => {
      const original = ipcMain._invokeHandlers.get(channel)
      if (typeof original !== 'function') throw new Error('Actual Smart comparison handler missing')
      const probe = {
        original,
        restoring: false,
        arrivals: [],
        replies: {
          older: {
            expected: [tabId, oldRequest],
            started: false,
            held: false,
            delivered: false,
            release: null,
          },
          newest: {
            expected: [tabId, newestRequest],
            started: false,
            held: false,
            delivered: false,
            release: null,
          },
        },
      }
      globalThis.igsSmartCompareProbe = probe
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, async (event, ...args) => {
        const request = args[1]
        const matches = (expected) =>
          args.length === 2 &&
          args[0] === expected[0] &&
          request?.documentId === expected[1].documentId &&
          request?.documentRevision === expected[1].documentRevision &&
          request?.assetSha256 === expected[1].assetSha256 &&
          request?.owner?.kind === expected[1].owner.kind &&
          request?.owner?.layerId === expected[1].owner.layerId &&
          request?.owner?.variantId === expected[1].owner.variantId
        const entry = Object.entries(probe.replies).find(
          ([, reply]) => !reply.started && matches(reply.expected),
        )
        const reply = entry?.[1]
        if (reply) reply.started = true
        probe.arrivals.push({ args: structuredClone(args), slot: entry?.[0] ?? null })
        const response = await original(event, ...args)
        if (!reply || !response.ok) return response
        reply.request = structuredClone(args)
        reply.genuine = structuredClone(response)
        // Both holds happen only AFTER the original handler completed. Newest.held is therefore
        // a positive Main-read barrier reached by the real serialized renderer reader.
        if (!probe.restoring)
          await new Promise((resolve) => {
            reply.release = resolve
            reply.held = true
          })
        reply.deliveredResponse = structuredClone(response)
        reply.delivered = true
        return response // never alter either genuine successful response
      })
    },
    { channel: adapter.channel, tabId: before.tab.id, oldRequest, newestRequest },
  )
  probeInstalled = true
  let publicationInstalled = false
  try {
    const olderContext = await beginComparison(source)
    assert.deepEqual(olderContext.request, oldRequest)
    await expect
      .poll(() => application.evaluate(() => globalThis.igsSmartCompareProbe.replies.older.held))
      .toBe(true)
    heldReply = true
    await expect(dialog().locator('[data-setting]')).toHaveCount(0)
    await closeComparison(source)
    // Reopen without ready(): the production reader serializes, so the older held reply must
    // return before any pending newer read can start. Then supersede that pending source with B.
    await beginComparison(source)
    await expect(dialog().locator('[data-setting]')).toHaveCount(0)
    await closeComparison(source)
    const newestContext = await beginComparison(next)
    assert.deepEqual(newestContext.request, newestRequest)
    await expect(dialog().locator('.comparison-heading strong')).toHaveText(next.value.name)
    await expect(dialog().locator('[data-setting]')).toHaveCount(0)
    await expect(dialog().getByText('Reading generation data…', { exact: true })).toBeVisible()
    publicationInstalled = true
    await startPublicationProbe(source)
    const serialized = await application.evaluate(() => ({
      olderHeld: globalThis.igsSmartCompareProbe.replies.older.held,
      olderDelivered: globalThis.igsSmartCompareProbe.replies.older.delivered,
      newestStarted: globalThis.igsSmartCompareProbe.replies.newest.started,
      newestDelivered: globalThis.igsSmartCompareProbe.replies.newest.delivered,
    }))
    assert.deepEqual(
      serialized,
      {
        olderHeld: true,
        olderDelivered: false,
        newestStarted: false,
        newestDelivered: false,
      },
      'The actual serialized reader must wait for the older reply before starting its newest read',
    )
    report.lateReplySerializedPrecondition = serialized
    await application.evaluate(() => globalThis.igsSmartCompareProbe.replies.older.release())
    await expect
      .poll(() =>
        application.evaluate(() => globalThis.igsSmartCompareProbe.replies.older.delivered),
      )
      .toBe(true)
    // No direct readSmart() can stand in for this barrier: only the renderer's actual pending
    // newest read reaches Main here, after it consumed and discarded the genuine older reply.
    await expect
      .poll(() => application.evaluate(() => globalThis.igsSmartCompareProbe.replies.newest.held))
      .toBe(true)
    const barrier = await application.evaluate(() => {
      const probe = globalThis.igsSmartCompareProbe
      const snapshot = (reply) => ({
        request: reply.request,
        genuine: reply.genuine,
        deliveredResponse: reply.deliveredResponse ?? null,
        held: reply.held,
        delivered: reply.delivered,
      })
      return {
        arrivals: probe.arrivals,
        older: snapshot(probe.replies.older),
        newest: snapshot(probe.replies.newest),
      }
    })
    assert.deepEqual(barrier.older.request, [before.tab.id, oldRequest])
    assert.deepEqual(barrier.newest.request, [before.tab.id, newestRequest])
    assert.equal(barrier.older.delivered, true)
    assert.equal(barrier.newest.held, true)
    assert.equal(barrier.newest.delivered, false)
    assert.deepEqual(barrier.older.deliveredResponse, barrier.older.genuine)
    assertSmartData(barrier.older.genuine.value, oldRequest, source)
    assertSmartData(barrier.newest.genuine.value, newestRequest, next)
    assert.notEqual(barrier.older.genuine.value.resultId, barrier.newest.genuine.value.resultId)
    assert.notEqual(
      barrier.older.genuine.value.generationConfiguration.positivePrompt.text,
      barrier.newest.genuine.value.generationConfiguration.positivePrompt.text,
    )
    report.lateReply = { barrier }
    await publicationBarrier(
      'older-delivered-newest-original-Main-read-complete-and-publication-held',
    )
    await expect(dialog().locator('[data-setting]')).toHaveCount(0)
    await expect(dialog().locator('.comparison-heading strong')).toHaveText(next.value.name)
    await expect(dialog().getByText('Reading generation data…', { exact: true })).toBeVisible()
    await screenshot('genuine-old-reply-suppressed-while-newest-reply-held')
    await publicationBarrier('immediately-before-releasing-newest-genuine-reply', true)
    await application.evaluate(() => globalThis.igsSmartCompareProbe.replies.newest.release())
    await expect
      .poll(() =>
        application.evaluate(() => globalThis.igsSmartCompareProbe.replies.newest.delivered),
      )
      .toBe(true)
    await completeComparison(newestContext)
    await assertProjection(next, before.tab.generationDraft)
    const delivered = await application.evaluate(() => {
      const probe = globalThis.igsSmartCompareProbe
      return {
        older: probe.replies.older.deliveredResponse,
        newest: probe.replies.newest.deliveredResponse,
      }
    })
    assert.deepEqual(delivered.older, barrier.older.genuine)
    assert.deepEqual(delivered.newest, barrier.newest.genuine)
    report.lateReply.delivered = delivered
    await publicationBarrier('newest-genuine-reply-published-with-exact-current-owner')
    await stopPublicationProbe()
    publicationInstalled = false
    await screenshot('genuine-old-reply-does-not-replace-new-owner')
    await closeComparison(next, true)
  } finally {
    try {
      if (publicationInstalled) await stopPublicationProbe()
    } finally {
      await restoreReplyProbe()
    }
  }
  await readSmart(next)
  await unchanged(
    before,
    'Genuine older response is never published after close/reopen/new owner, including while the newest genuine response remains withheld',
  )
  await lateErrorReply()
  check(
    '17 Serialized reader discards obsolete success and explicitly injected IPC error after close/reopen/new owner; newest original Main completion is held as a positive barrier, transient settings/alert/loading/owner publication is observed, both exact latest replies and full no-op witnesses pass',
  )
}
// A valid unchanged source has no deterministic original Main refusal without changing its
// request/ownership or source state. Substitute ONLY an explicit IPC error after the original
// successful read, preserving both separately; this is not evidence of a genuine Main failure.
async function lateErrorReply() {
  const source = fixture.inactive,
    next = fixture.converted[6]
  const before = await witness()
  const oldRequest = adapter.request(before.tab, source)
  const newestRequest = adapter.request(before.tab, next)
  const injectedFailure = {
    ok: false,
    error: {
      code: 'IPC_UNAVAILABLE',
      message: 'Owned smoke injected obsolete comparison IPC failure after original Main success.',
    },
  }
  report.lateErrorReply = {
    origin: 'controlled-ipc-failure-after-original-Main-success',
    boundary: report.boundary.delayedFailureProbe,
    injectedFailure,
    oldRequest,
    newestRequest,
  }
  await application.evaluate(
    ({ ipcMain }, { channel, tabId, oldRequest, newestRequest, injectedFailure }) => {
      const original = ipcMain._invokeHandlers.get(channel)
      if (typeof original !== 'function') throw new Error('Actual Smart comparison handler missing')
      const slot = (request) => ({
        expected: [tabId, request],
        started: false,
        held: false,
        delivered: false,
        release: null,
      })
      const probe = {
        original,
        restoring: false,
        arrivals: [],
        replies: { obsolete: slot(oldRequest), newest: slot(newestRequest) },
      }
      globalThis.igsSmartCompareProbe = probe
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, async (event, ...args) => {
        const request = args[1]
        const matches = (expected) =>
          args.length === 2 &&
          args[0] === expected[0] &&
          request?.documentId === expected[1].documentId &&
          request?.documentRevision === expected[1].documentRevision &&
          request?.assetSha256 === expected[1].assetSha256 &&
          request?.owner?.kind === expected[1].owner.kind &&
          request?.owner?.layerId === expected[1].owner.layerId &&
          request?.owner?.variantId === expected[1].owner.variantId
        const entry = Object.entries(probe.replies).find(
          ([, reply]) => !reply.started && matches(reply.expected),
        )
        const reply = entry?.[1]
        if (reply) reply.started = true
        probe.arrivals.push({ args: structuredClone(args), slot: entry?.[0] ?? null })
        const response = await original(event, ...args) // unchanged valid request and original Main read
        if (!reply || !response.ok) return response
        reply.request = structuredClone(args)
        reply.originalResponse = structuredClone(response)
        const forwarded = entry[0] === 'obsolete' ? structuredClone(injectedFailure) : response
        reply.pendingResponse = structuredClone(forwarded)
        reply.failureInjected = entry[0] === 'obsolete'
        // The error is held only after real Main success. Newest.held independently proves that
        // the serialized renderer consumed that obsolete failure and advanced its actual UI read.
        if (!probe.restoring)
          await new Promise((resolve) => {
            reply.release = resolve
            reply.held = true
          })
        reply.deliveredResponse = structuredClone(forwarded)
        reply.delivered = true
        return forwarded
      })
    },
    { channel: adapter.channel, tabId: before.tab.id, oldRequest, newestRequest, injectedFailure },
  )
  probeInstalled = true
  let publicationInstalled = false
  try {
    const obsoleteContext = await beginComparison(source)
    assert.deepEqual(obsoleteContext.request, oldRequest)
    await expect
      .poll(() => application.evaluate(() => globalThis.igsSmartCompareProbe.replies.obsolete.held))
      .toBe(true)
    heldReply = true
    await closeComparison(source)
    const newestContext = await beginComparison(next)
    assert.deepEqual(newestContext.request, newestRequest)
    await expect(dialog().locator('.comparison-heading strong')).toHaveText(next.value.name)
    await expect(dialog().locator('[data-setting]')).toHaveCount(0)
    await expect(dialog().getByRole('alert')).toHaveCount(0)
    await expect(dialog().getByText('Reading generation data…', { exact: true })).toBeVisible()
    publicationInstalled = true
    await startErrorPublicationProbe(next.value.name, injectedFailure.error.message)
    const serialized = await application.evaluate(() => ({
      obsoleteHeld: globalThis.igsSmartCompareProbe.replies.obsolete.held,
      obsoleteDelivered: globalThis.igsSmartCompareProbe.replies.obsolete.delivered,
      newestStarted: globalThis.igsSmartCompareProbe.replies.newest.started,
      newestDelivered: globalThis.igsSmartCompareProbe.replies.newest.delivered,
    }))
    assert.deepEqual(serialized, {
      obsoleteHeld: true,
      obsoleteDelivered: false,
      newestStarted: false,
      newestDelivered: false,
    })
    report.lateErrorReply.serializedPrecondition = serialized
    await application.evaluate(() => globalThis.igsSmartCompareProbe.replies.obsolete.release())
    await expect
      .poll(() =>
        application.evaluate(() => globalThis.igsSmartCompareProbe.replies.obsolete.delivered),
      )
      .toBe(true)
    // This is the actual renderer's next read, never a direct API call substituted as a barrier.
    // Keep its successful original response withheld so final success cannot mask a stale error.
    await expect
      .poll(() => application.evaluate(() => globalThis.igsSmartCompareProbe.replies.newest.held))
      .toBe(true)
    const barrier = await application.evaluate(() => {
      const probe = globalThis.igsSmartCompareProbe
      const snapshot = (reply) => ({
        request: reply.request,
        originalResponse: reply.originalResponse,
        pendingResponse: reply.pendingResponse,
        deliveredResponse: reply.deliveredResponse ?? null,
        failureInjected: reply.failureInjected,
        held: reply.held,
        delivered: reply.delivered,
      })
      return {
        arrivals: probe.arrivals,
        obsolete: snapshot(probe.replies.obsolete),
        newest: snapshot(probe.replies.newest),
      }
    })
    assert.deepEqual(barrier.obsolete.request, [before.tab.id, oldRequest])
    assert.deepEqual(barrier.newest.request, [before.tab.id, newestRequest])
    assertSmartData(barrier.obsolete.originalResponse.value, oldRequest, source)
    assert.equal(barrier.obsolete.originalResponse.ok, true)
    assert.equal(barrier.obsolete.failureInjected, true)
    assert.deepEqual(barrier.obsolete.pendingResponse, injectedFailure)
    assert.deepEqual(barrier.obsolete.deliveredResponse, injectedFailure)
    assert.equal(barrier.obsolete.delivered, true)
    assert.equal(barrier.newest.failureInjected, false)
    assert.equal(barrier.newest.originalResponse.ok, true)
    assertSmartData(barrier.newest.originalResponse.value, newestRequest, next)
    assert.deepEqual(barrier.newest.pendingResponse, barrier.newest.originalResponse)
    assert.equal(barrier.newest.held, true)
    assert.equal(barrier.newest.delivered, false)
    report.lateErrorReply.barrier = barrier
    await publicationBarrier(
      'obsolete-injected-error-consumed-newest-original-Main-read-complete-publication-held',
    )
    await expect(dialog().locator('.comparison-heading strong')).toHaveText(next.value.name)
    await expect(dialog().getByRole('alert')).toHaveCount(0)
    await expect(dialog().locator('[data-setting]')).toHaveCount(0)
    await expect(dialog().getByText('Reading generation data…', { exact: true })).toBeVisible()
    await screenshot('obsolete-injected-ipc-error-suppressed-while-newest-reply-held')
    await publicationBarrier('obsolete-injected-error-immediately-before-newest-release', true)
    await application.evaluate(() => globalThis.igsSmartCompareProbe.replies.newest.release())
    await expect
      .poll(() =>
        application.evaluate(() => globalThis.igsSmartCompareProbe.replies.newest.delivered),
      )
      .toBe(true)
    await completeComparison(newestContext)
    await assertProjection(next, before.tab.generationDraft)
    await expect(dialog().locator('.comparison-heading strong')).toHaveText(next.value.name)
    await expect(dialog().getByRole('alert')).toHaveCount(0)
    const delivered = await application.evaluate(() => ({
      obsolete: globalThis.igsSmartCompareProbe.replies.obsolete.deliveredResponse,
      newest: globalThis.igsSmartCompareProbe.replies.newest.deliveredResponse,
    }))
    assert.deepEqual(delivered.obsolete, injectedFailure)
    assert.deepEqual(delivered.newest, barrier.newest.originalResponse)
    report.lateErrorReply.delivered = delivered
    await publicationBarrier('exact-newest-owner-published-after-obsolete-injected-error')
    await stopPublicationProbe()
    publicationInstalled = false
    await screenshot('exact-newest-owner-after-obsolete-injected-ipc-error')
    await closeComparison(next, true)
  } finally {
    try {
      if (publicationInstalled) await stopPublicationProbe()
    } finally {
      await restoreReplyProbe()
    }
  }
  await readSmart(next)
  await unchanged(
    before,
    'Delayed controlled IPC error after original Main success: actual newest owner/loading never replaced, original handlers restored, full document/package/history/selection/camera/source/SQLite/all-seals witness unchanged',
  )
}
function verifyRetainedBytes() {
  for (const item of report.snapshots) {
    assert.ok(lstatSync(item.path).isFile() && !lstatSync(item.path).isSymbolicLink())
    const bytes = readFileSync(item.path)
    assert.equal(bytes.length, item.bytes)
    assert.equal(digest(bytes), item.sha256, 'Retained evidence changed')
  }
  const prepared = report.snapshots.filter(({ path: file }) => file.includes('/prepared/inputs/'))
  assert.equal(prepared.length, fixture.inputs.length, 'Every accepted fixture needs its full PNG')
}
async function finishNative() {
  lastOpenWitness = await witness()
  assert.deepEqual(lastOpenWitness.savedDocument, fixture.saved)
  const loaded = await readIgsPackage(fixture.path)
  for (const input of fixture.inputs)
    assert.ok(
      (await loaded.readMember(input.value.asset.path)).equals(input.bytes),
      'Original package PNG changed',
    )
  // Pin all dirty Project/autosave bytes before the explicit Close/Discard can remove its shadow.
  await snapshot('03-final-open-before-close')
  verifyRetainedBytes()
  const callsBefore = await mutationCalls()
  await window.getByRole('button', { name: `Close ${projectTitle}`, exact: true }).click()
  const close = window.getByRole('dialog', { name: 'Close Project', exact: true })
  await expect(close).toBeVisible()
  await close.getByRole('button', { name: 'Discard Changes', exact: true }).click()
  await expect(window.getByRole('tab', { name: projectTitle, exact: true })).toHaveCount(0)
  const closingCalls = (await mutationCalls()).slice(callsBefore.length)
  const allowedClosing = new Set([
    'projects:seal-prompt-history',
    'projects:close',
    'projects:discard-and-close',
  ])
  assert.ok(
    closingCalls.every(
      ({ channel, finished, ok }) => allowedClosing.has(channel) && finished && ok === true,
    ),
  )
  assert.ok(closingCalls.some(({ channel }) => channel === 'projects:discard-and-close'))
  report.expectedActions.push({
    label: 'Explicit Close/Discard after pinning complete dirty autosave',
    kind: 'close',
    closingCalls,
  })
  assert.equal(digest(readFileSync(fixture.path)), lastOpenWitness.packageSha256)
  await closeNative('comparison-complete')
  // This is deliberately AFTER the last UI action and healthy physical Main exit. Earlier native
  // harnesses backed up before final Close/restart, leaving an incomplete final index/DB witness.
  await snapshot('04-final-after-ui-close-and-native-exit', true)
  report.finalDatabaseAfterLastUiAndNativeExit = true
  verifyRetainedBytes()
  assert.deepEqual(report.pageErrors, [])
  assert.equal(report.samplerError, undefined)
  assert.equal(report.nativeClosures.length, 1)
  assert.equal(report.nativeClosures[0].confirmed, true)
  check(
    '18 Full original PNG/package/provenance and final dirty autosave pinned before explicit Close/Discard; final standalone DB captured after last UI action and healthy physical native exit, all retained bytes verified',
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
  await screenshot('failure-native').catch((error) => {
    report.failureScreenshotError = String(error)
  })
  if (fixture && existsSync(path.join(appDataRoot, 'database/app.sqlite')))
    await snapshot('failure-before-exit').catch((error) => {
      report.failureSnapshotError = String(error)
    })
}

try {
  // Inventory before any native or fixture-heavy action; no runtime/catalog is reused/provisioned.
  report.inventory = await Promise.all(
    [
      ['du', ['-sk', artifactRoot]],
      ['du', ['-k', '--max-depth=1', artifactRoot]],
      ['df', ['-Pk', artifactRoot]],
      ['git', ['rev-parse', 'HEAD']],
      ['git', ['status', '--short']],
    ].map(async ([file, args]) => ({
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
      ].flatMap((directory) => filesBelow(path.join(root, directory))),
      ...[
        'src/main/index.ts',
        'src/preload/index.ts',
        'src/shared/api.ts',
        'src/renderer/App.vue',
        'scripts/smoke-smart-patch-comparison.mjs',
        'scripts/smoke-smart-patch-result-preset.mjs',
        'scripts/smoke-generation-comparison.mjs',
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
  await openProject()
  const baseline = await witness()
  assert.equal(baseline.tab.dirty, true)
  assert.deepEqual(baseline.tab.generationDraft, fixture.recovered.generationDraft)
  report.baseline = baseline
  lastOpenWitness = baseline
  await snapshot('00-recovered-before-comparison')
  check(
    '02 Bounded original native startup/Home Recover, strict saved inputs, empty catalog/no runtime/queue/presets, full dirty Project/Undo/seed/library witness',
  )
  await selectedPatchCurrentProject()
  await controls()
  await matrix()
  await snapshot('01-after-readonly-matrix')
  await layoutAndFocus()
  await editProjectSteps()
  await switchActive()
  await refusals()
  await lateReply()
  await finishNative()
  assert.equal(report.checks.length, 18)
  assert.deepEqual(hashes(sourceFiles), report.sourceSha256, 'Source changed during qualification')
  assert.deepEqual(
    hashes(bundleFiles),
    report.bundleSha256,
    'Built app changed during qualification',
  )
  report.outcome = 'passed'
} catch (error) {
  process.exitCode = 1
  report.outcome = 'failed'
  report.failure = { message: error.message, stack: error.stack }
  checkpoint()
  await failureDiagnostics()
} finally {
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
  // A failed run also needs the last database state after the final observed native action.
  if (
    !application &&
    fixture &&
    existsSync(path.join(appDataRoot, 'database/app.sqlite')) &&
    !report.finalDatabaseAfterLastUiAndNativeExit
  ) {
    try {
      await snapshot('failure-final-after-native-exit', true)
      report.failureFinalDatabaseRetained = true
    } catch (error) {
      report.failureFinalDatabaseError = String(error)
    }
  }
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
    probesRestored: !probeInstalled && !heldReply && !report.probeRestorationFailure,
    finalDatabaseRetained:
      report.finalDatabaseAfterLastUiAndNativeExit === true ||
      report.failureFinalDatabaseRetained === true,
    releaseCondition:
      'Root verifies exact retained PNG/provenance/packages/full autosaves/final standalone SQLite, restored probes and every PID/start/cgroup exit before disposing only the declared run payloads and short TMPDIR. No runner cleanup.',
  }
  report.finishedAt = new Date().toISOString()
  if (previousTemporaryDirectory === undefined) delete process.env.TMPDIR
  else process.env.TMPDIR = previousTemporaryDirectory
  checkpoint()
  console.log(`${report.outcome.toUpperCase()} ${reportFile}`)
}
