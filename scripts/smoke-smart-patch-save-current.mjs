/**
 * ROOT-ONLY, after a fresh app build: pnpm exec tsx scripts/smoke-smart-patch-save-current.mjs
 * --report-file ABSOLUTE_NEW_REPORT. Preparation/node --check/Prettier is not native PASS.
 *
 * Twelve finite checks, <=300s semantic wall time; launcher RuntimeMaxSec<=300, stop<=60s,
 * <=2GiB/zero swap/KillMode=control-group. Each serial native owner has a <=300s timer, <=2GiB/zero
 * swap; aggregate unique launcher/native limits <=4GiB. Root alone executes, inspects screenshots
 * and owns exact cleanup under runs/smart-patch-current-preset/20261023-draft. No downloads,
 * provisioning, ML, installed catalog, Generate, acceptance or preset injection. Literal portable
 * accepted PNG/provenance/.igs/shadow fixtures are declared preconditions. Capture is the built
 * renderer's synchronous acknowledged ProjectTab path, never a fabricated Main source endpoint.
 * Existing Main calls pass through an observer unchanged. Controlled delivery gates hold ORIGINAL
 * successful replies (draft acknowledgement, empty catalog and the probe's queue read). Optional
 * --scenario owner-validity runs only the raw-buffer regression. Its declared controlled
 * readiness/target metadata invokes originals first and retains both replies; all three adapters
 * restore before an original offline metadata bootstrap. All gates/observers and the exact owned
 * SQLite failure trigger are restored before shutdown. Full PNG/.igs/autosave and standalone SQLite
 * checkpoints survive disposable payload removal. No live SQLite/WAL copying, runner deletion, or
 * independent visual qualification claim.
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
import { isDeepStrictEqual, promisify } from 'node:util'

import { _electron as electron, expect } from '@playwright/test'
import Database from 'better-sqlite3'

import { openAppDatabase } from '../src/main/db/database.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { encodeProjectMaskPng } from '../src/main/projects/project-mask.ts'
import { ProjectSession } from '../src/main/projects/project-session.ts'
import { ProjectShadowStore } from '../src/main/projects/project-shadow.ts'
import { literalSmartPatchColorPng } from '../src/main/projects/test-fixtures/smart-patch-input-material.ts'
import { smartPatchVariantMetadataFixture } from '../src/main/projects/test-fixtures/smart-patch-variant.ts'
import { parsePresetDefinition } from '../src/shared/presets/preset-schema.ts'
import { parseSmartPatchGenerationProvenanceV1 } from '../src/shared/projects/project-schema.ts'
import { isProjectSmartPatchGenerationTargetState } from '../src/shared/projects/smart-patch-public-generation.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
  stopExpiredQualificationProcess,
} from './qualification-resource-limits.mjs'

assert.ok(
  [4, 6].includes(process.argv.length),
  'Use --report-file ABSOLUTE_NEW_REPORT [--scenario owner-validity]',
)
assert.equal(process.argv[2], '--report-file')
const scenario = process.argv.length === 6 ? process.argv[5] : 'full'
if (process.argv.length === 6) {
  assert.equal(process.argv[4], '--scenario')
  assert.equal(scenario, 'owner-validity')
}
const root = realpathSync(process.cwd())
const reportFile = process.argv[3]
assert.ok(path.isAbsolute(reportFile) && path.resolve(reportFile) === reportFile)
assert.equal(existsSync(reportFile), false, 'Never overwrite evidence')
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const ownedRun = path.join(artifactRoot, 'runs/smart-patch-current-preset/20261023-draft')
const evidenceParent = path.dirname(reportFile)
const relativeParent = path.relative(ownedRun, evidenceParent)
assert.ok(!relativeParent.startsWith('..') && !path.isAbsolute(relativeParent))
assert.equal(realpathSync(evidenceParent), evidenceParent, 'Canonical existing parent required')
assert.ok(lstatSync(evidenceParent).isDirectory() && !lstatSync(evidenceParent).isSymbolicLink())
assert.equal(realpathSync(artifactRoot), artifactRoot)
const evidenceRoot = `${reportFile}.artifacts`
assert.equal(existsSync(evidenceRoot), false)
writeFileSync(reportFile, '{}\n', { flag: 'wx', mode: 0o600 })
mkdirSync(evidenceRoot, { mode: 0o700 })
const fixtureRoot = mkdtempSync(path.join(evidenceRoot, 'current-preset-payload-'))
const appDataRoot = path.join(fixtureRoot, 'data/imagegen-studio')
const workspace = path.join(appDataRoot, 'workspaces/Uncategorized')
mkdirSync(workspace, { recursive: true, mode: 0o700 })
// Chromium's Unix sockets need a short path. Root owns this declared companion too.
const temporaryDirectory = mkdtempSync(path.join(artifactRoot, 'sp-cur-tmp-'))
const previousTemporaryDirectory = process.env.TMPDIR
process.env.TMPDIR = temporaryDirectory
const nativeDeadlineSeconds = 300
const nativeExec = promisify(execFile)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const projectTitle = 'Current authored Smart presets'
const roots = {
  placeholdersDir: path.join(root, 'dist/main/placeholders'),
  scratchDir: path.join(fixtureRoot, 'writer-scratch'),
}
const nativeChecks = [],
  observed = new Map(),
  created = []
let application, window, nativeProcess, sampler, fixture, sourceFiles, bundleFiles
let sampling = Promise.resolve()
let observerInstalled = false
let capabilityProbeInstalled = false
let createFailureTriggerInstalled = false,
  createFailureSchema
const createFailureTriggerName = 'igs_smart_current_preset_owned_failure'
const createFailureTriggerSql = `CREATE TRIGGER ${createFailureTriggerName} BEFORE INSERT ON presets BEGIN SELECT RAISE(ABORT, 'Owned Smart Current Preset INSERT failure'); END`
const report = {
  schemaVersion: 1,
  scenario,
  qualificationScope: scenario === 'full' ? 'finite-current-preset' : 'focused-owner-validity-only',
  fullQualification: false,
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
  databaseCheckpoints: [],
  stateCheckpoints: [],
  witnesses: [],
  expectedActions: [],
  layoutChecks: [],
  viewportChecks: [],
  pageErrors: [],
  nativeLogs: [],
  resourceLimitChecks: [],
  nativeClosures: [],
  boundary: {
    actual:
      'Built Save Current as Preset -> synchronous acknowledged selected Patch snapshot -> detached shared Manager -> original preload/Main Create -> SQLite, controlled INSERT failure/retry and two physical native lifetimes.',
    preconditions:
      'Production ProjectSession/.igs/ShadowStore prepare literal accepted Illustrious/Anima PNG/provenance, authored masks, seed0 cursor and three distinct authored drafts. Recovery and later authoring are setup actions; neither inference nor acceptance is qualified.',
    ownerValidityCollaborator:
      'Only the raw-buffer ownership fault probe invokes original readiness/target Main handlers and adapts their successful metadata replies: runtime ready, smartPatchSupported true, target mode inpaint/unavailableReason null. Exact original responses and document/revision/layer envelope survive. Its same-owner queue refresh holds the original successful state reply long enough to observe the actual renderer loading state, releases it unchanged, and requires the visible loading-to-idle transition before raw-buffer assertions. No ProjectTab/draft/preset/source/Generate substitution. Renderer reloads before and after are metadata-bootstrap boundaries outside the same-owner invalid-buffer control. All three handlers restore immediately; full normal cases resume actual not-installed/empty-catalog replies. This is not installed runtime/native inference qualification.',
    oracle:
      'Independent explicit authored-field projection, original Create payload/reply, all SQL tables/schema, full live/saved documents and every product-owned byte. Historical noise hints never stand in for an absent current catalog. Navigation/authoring/Undo/close seals have separate witnesses; capture itself issues no flush/seal/mutation.',
    limits:
      'Semantic result <=300s; launcher <=2GiB/zero swap/RuntimeMaxSec<=300/TimeoutStopSec<=60/KillMode=control-group; serial native actors <=2GiB/zero swap/300s timers; when native remains in the launcher group the verified global <=300s timer supplies its physical deadline; unique aggregate <=4GiB.',
    excluded:
      'ML/catalog provisioning, installed resolution, inference/acceptance, result-to-preset, Apply, new endpoints, release/full PP readiness and independent screenshot review. Root must inspect screenshots.',
    cleanup:
      'No deletion. Root retains payloads until physical exit, probe/trigger restoration and independent retained-byte verification. Explicit owned Project discard restores the prepared saved source before restart; source .igs never changes.',
  },
}
const lifecycle = {
  schemaVersion: 1,
  owner: { repository: root, task: 'smart-patch-current-preset', run: reportFile },
  state: 'running',
  lastUsedAt: report.startedAt,
  evidence: [reportFile, evidenceRoot],
  payloads: [fixtureRoot, temporaryDirectory],
  dependsOn: [],
  usedBy: [],
  pins: [fixtureRoot, temporaryDirectory].map((file) => ({
    path: file,
    reason:
      'Root releases after physical exit, restoration and complete retained dependency verification',
  })),
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
  assert.ok(report.checks.length < 12, 'Finite twelve-check owner')
  assert.ok(Date.now() - Date.parse(report.startedAt) <= 300_000, 'Semantic run exceeded 300s')
  report.checks.push({ name, at: new Date().toISOString(), ...evidence })
  checkpoint()
  console.log(`PASS ${name}`)
}

// Final root contract is localized here. No dynamic source API or implementation mapper oracle.
const adapter = {
  kind: 'smart-patch-draft',
  saveLabel: 'Save Current as Preset',
  bannerLabel: 'Source Smart Patch',
  projectBannerLabel: 'Source project',
  pendingReason: 'Wait for the current settings to finish updating before saving them as a preset.',
  defaultName: (patch) => `${patch.name} Baseline`,
  summary: (patch) => patch.generationDraft.model?.displayName ?? 'No model',
  banner: () => manager().getByRole('alert', { name: adapter.bannerLabel, exact: true }),
  trigger: () => projectView().getByRole('button', { name: adapter.saveLabel, exact: true }),
  select: (layer) =>
    projectView().getByRole('button', { name: `Select ${layer.name}`, exact: true }),
  steps: () => projectView().getByLabel('Steps', { exact: true }),
  denoising: () => projectView().getByRole('textbox', { name: 'Denoising Strength', exact: true }),
  resetDenoising: () =>
    projectView().getByRole('button', { name: 'Reset Denoising Strength', exact: true }),
  draftChannel: 'projects:update-generation-draft',
  catalogChannel: 'models:get-catalog',
}
const projectView = () => window.getByLabel(`Project ${projectTitle}`, { exact: true })
const canvas = () => projectView().getByRole('region', { name: 'Project Canvas', exact: true })
const manager = () => window.getByRole('dialog', { name: 'Preset Manager', exact: true })
const footer = () => manager().getByLabel('Preset editor actions', { exact: true })
const nameInput = () => manager().getByRole('textbox', { name: 'Preset name', exact: true })
const promptEditor = () => manager().getByRole('textbox', { name: 'Preset prompt', exact: true })
const included = (name) => manager().getByRole('checkbox', { name: `Include ${name}`, exact: true })
async function frames() {
  await window.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
}
async function api(scope, method, ...args) {
  const result = await window.evaluate(
    ({ scope, method, args }) => window.api[scope][method](...args),
    { scope, method, args },
  )
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}
async function current() {
  const result = await api('projects', 'open', fixture.key)
  assert.equal(result.kind, 'opened')
  return result.tab
}
async function expectPrompt(editor, value) {
  await expect
    .poll(async () => (await editor.locator('.cm-line').allTextContents()).join('\n'))
    .toBe(value)
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
    versionName: 'Exact absent authored version',
  }
}
function authoredDraft(base, family, label, index) {
  const positiveToken = `<current-${index}>`,
    negativeToken = `<negative-${index}>`
  const draft = {
    ...structuredClone(base),
    model: reference(family, 'checkpoint', `${label} current model`),
    positivePrompt: {
      text: `${label} authored {blue|red} ${positiveToken}\n(soft light:-0.25), literal 日本語`,
      embeddingRefs: [
        {
          token: positiveToken,
          resource: reference(family, 'embedding', `${label} positive binding`),
        },
      ],
    },
    negativePrompt: {
      text: `${label} negative {soft|hard} ${negativeToken}`,
      embeddingRefs: [
        {
          token: negativeToken,
          resource: reference(family, 'embedding', `${label} negative binding`),
        },
      ],
    },
    loras: [
      {
        enabled: true,
        weight: -0.35,
        resource: reference(family, 'lora', `${label} signed enabled LoRA`),
      },
      {
        enabled: false,
        weight: 0,
        resource: reference(family, 'lora', `${label} disabled zero LoRA`),
      },
    ],
    seed: { policy: 'fixed', value: 918270 + index },
    dynamicPrompt: { maxPrompts: 3 + index, seedBehavior: 'per-prompt' },
    clipSkip: 2 + index,
    sampling: {
      steps: 31 + index,
      cfgScale: 6.75 + index,
      denoisingStrength: index === 1 ? null : 0.47,
      sampler: family === 'anima' ? null : 'DPM++ SDE',
      scheduler: family === 'anima' ? null : 'Karras',
      ...(family === 'anima' ? { animaMethod: 'heun' } : {}),
    },
    vae: family === 'illustrious' ? reference(family, 'vae', `${label} external VAE`) : null,
  }
  delete draft.cfgRescale
  delete draft.vaePrecision
  if (family === 'illustrious') Object.assign(draft, { cfgRescale: 0, vaePrecision: 'FP32' })
  return draft
}
async function prepare() {
  const packagePath = path.join(workspace, `${projectTitle}.igs`)
  const session = await ProjectSession.create(packagePath, projectTitle, roots)
  const patches = [],
    inputs = []
  for (const [index, family] of ['illustrious', 'anima'].entries()) {
    const variant = smartPatchVariantMetadataFixture(family)
    const bytes = literalSmartPatchColorPng(
      7,
      5,
      Array.from({ length: 35 }, () => [50 + index * 40, 110, 185, 255]).flat(),
      4,
    )
    Object.assign(variant.asset, { bytes: bytes.length, sha256: digest(bytes) })
    const maskId = randomUUID(),
      maskBytes = encodeProjectMaskPng(Uint8Array.from([0, 64, 128, 255]), 2, 2),
      maskSha = digest(maskBytes)
    const patch = {
      id: randomUUID(),
      kind: 'smart-patch',
      name: index ? 'Anima hidden locked' : 'Illustrious authored',
      visible: index === 0,
      locked: index === 1,
      opacity: 0.8,
      blendMode: 'normal',
      boundingBox: { x: -73 + index * 128, y: 51, width: 512, height: 384 },
      internalResolution: { width: 256, height: 192 },
      generationDraft: authoredDraft(
        session.document.generationDraft,
        family,
        `PATCH ${index}`,
        index,
      ),
      mask: {
        id: maskId,
        revision: 3 + index,
        asset: {
          path: `assets/masks/${maskId}/${maskSha}.png`,
          bytes: maskBytes.length,
          width: 2,
          height: 2,
          sha256: maskSha,
        },
        bounds: { x: -9, y: 13, width: 2, height: 2 },
      },
      maskSettings: { blur: 9 + index, padding: 4 + index },
      coherenceSettings: { edgeSize: 16, minimumDenoise: 0, mode: 'Gaussian Blur' },
      activeRasterSubLayerId: variant.id,
      rasterSubLayers: [variant],
    }
    const provenance = variant.generationProvenance
    Object.assign(provenance.layerSourceContext, {
      layerId: patch.id,
      sourceDocumentId: session.document.documentId,
      sourceDocumentRevision: session.document.documentRevision,
    })
    Object.assign(provenance.executionResultContext.output, {
      byteSize: bytes.length,
      sha256: digest(bytes),
    })
    provenance.executionResultContext.output.contributionAlpha8.sha256 = digest(
      Buffer.alloc(35, 255),
    )
    if (family === 'illustrious')
      provenance.generationConfiguration.sampling.noiseProfile = {
        baseSchedule: 'sdxl-scaled-linear-v1',
        rescaleBetasZeroSnr: true,
        schemaVersion: 1,
        timestepSpacing: 'trailing',
      }
    parseSmartPatchGenerationProvenanceV1(provenance)
    patches.push(patch)
    inputs.push({
      member: variant.asset.path,
      bytes,
      kind: 'accepted-contribution',
      ownerId: patch.id,
    })
    inputs.push({
      member: patch.mask.asset.path,
      bytes: maskBytes,
      kind: 'authored-mask',
      ownerId: patch.id,
    })
  }
  const ordinary = {
    id: randomUUID(),
    kind: 'raster',
    name: 'Ordinary Canvas control',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 104, y: -42, scaleX: 1, scaleY: 1, rotationDegrees: 0 },
    asset: { ...patches[0].rasterSubLayers[0].asset, path: `assets/layers/${randomUUID()}.png` },
  }
  inputs.push({
    member: ordinary.asset.path,
    bytes: inputs[0].bytes,
    kind: 'ordinary-raster',
    ownerId: ordinary.id,
  })
  const projectDraft = authoredDraft(session.document.generationDraft, 'illustrious', 'PROJECT', 2)
  session.applyDocument({
    ...session.document,
    generationDraft: projectDraft,
    primaryBbox: { x: -301, y: 207, width: 640, height: 448 },
    lastActualSeedSnapshot: 0,
    layers: [...patches, ordinary],
  })
  await session.save({
    lastActualSeedSnapshot: 0,
    assets: Object.fromEntries(inputs.map(({ member, bytes }) => [member, { bytes }])),
  })
  const loaded = await readIgsPackage(packagePath),
    saved = loaded.project
  const recovered = structuredClone(saved)
  recovered.layers[0].generationDraft.positivePrompt.text += '\nUnsaved current {day|night}'
  session.applyDocument(recovered)
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
    patches: session.document.layers.filter((layer) => layer.kind === 'smart-patch'),
    ordinary,
    inputs,
    originalPackageSha256: digest(readFileSync(packagePath)),
  }
  const database = openAppDatabase(appDataRoot, path.join(root, 'src/main/db/migrations'))
  try {
    await database.db
      .insertInto('generation_seed_cursor')
      .values({
        actual_seed: 0,
        candidate_id: randomUUID(),
        completion_order: 1,
        document_id: saved.documentId,
        local_project_key: fixture.key,
        updated_at: '2026-10-23T00:00:00.000Z',
      })
      .execute()
  } finally {
    await database.close()
  }
  for (const [index, input] of inputs.entries()) {
    assert.ok(
      (await loaded.readMember(input.member)).equals(input.bytes),
      'Prepared package PNG differs',
    )
    const file = path.join(fixtureRoot, `source-${index}.png`)
    writeFileSync(file, input.bytes, { flag: 'wx', mode: 0o600 })
    input.retained = retain(file, `prepared/inputs/${index}.png`)
  }
  retain(packagePath, 'prepared/source.igs')
  for (const file of filesBelow(path.join(appDataRoot, 'autosave')))
    retain(file, `prepared/${path.relative(appDataRoot, file)}`)
  retainJson('prepared/fixture.json', {
    key: fixture.key,
    saved,
    recovered: fixture.recovered,
    inputs: inputs.map(({ bytes, ...value }) => ({
      ...value,
      sha256: digest(bytes),
      byteSize: bytes.length,
    })),
    precondition: report.boundary.preconditions,
  })
}

// This oracle copies only the stated authored fields, independently of the production helper.
function expectedPayload(patch) {
  const draft = patch.generationDraft
  const payload = {
    guidance: { cfgScale: draft.sampling.cfgScale, steps: draft.sampling.steps },
    loras: structuredClone(draft.loras),
    negativePrompt: structuredClone(draft.negativePrompt),
    prompt: structuredClone(draft.positivePrompt),
    vae: structuredClone(draft.vae),
  }
  if (draft.model !== null) payload.model = structuredClone(draft.model)
  const sampling = {}
  for (const key of ['sampler', 'scheduler', 'animaMethod'])
    if (draft.sampling[key] != null) sampling[key] = draft.sampling[key]
  if (Object.keys(sampling).length) payload.sampling = sampling
  for (const key of ['cfgRescale', 'vaePrecision'])
    if (draft[key] !== undefined) payload[key] = draft[key]
  if (draft.sampling.denoisingStrength !== null)
    payload.denoisingStrength = draft.sampling.denoisingStrength
  return payload
}
function portableOnly(payload) {
  for (const key of [
    'seed',
    'size',
    'dynamicPrompt',
    'clipSkip',
    'batch',
    'boundingBox',
    'internalResolution',
    'mask',
    'sourceTarget',
    'layerSourceContext',
    'generationProvenance',
    'executionResultContext',
  ])
    assert.equal(Object.hasOwn(payload, key), false, `${key} leaked into captured payload`)
  if (payload.model)
    assert.equal(
      Object.hasOwn(payload.model, 'noiseProfile'),
      false,
      'Missing current catalog must not borrow historical noise hints',
    )
}
async function assertEditorSource(patch) {
  await expect(manager()).toBeVisible()
  await expect(manager().getByRole('article', { name: 'Preset draft', exact: true })).toBeVisible()
  await expect(adapter.banner()).toHaveAccessibleName(adapter.bannerLabel)
  await expect(adapter.banner().getByText(adapter.bannerLabel, { exact: true })).toBeVisible()
  await expect(adapter.banner().locator('strong')).toHaveText(patch.name)
  await expect(adapter.banner()).toContainText(projectTitle)
  await expect(adapter.banner()).toContainText(adapter.summary(patch))
  for (const dimensions of ['512 × 384', '256 × 192', '640 × 448'])
    await expect(adapter.banner()).not.toContainText(dimensions)
  await expect(manager().getByLabel('Preset workflow', { exact: true })).toContainText(
    'Smart Patch',
  )
  await expect(nameInput()).toHaveValue(adapter.defaultName(patch))
  await expectPrompt(promptEditor(), patch.generationDraft.positivePrompt.text)
  await manager()
    .locator('[data-preset-section="negativePrompt"]')
    .getByText('Negative Prompt', { exact: true })
    .click()
  await expectPrompt(
    manager().getByRole('textbox', { name: 'Preset negative prompt', exact: true }),
    patch.generationDraft.negativePrompt.text,
  )
  await expect(included('Size')).not.toBeChecked()
  await expect(included('Seed')).not.toBeChecked()
  await expect(footer().getByRole('button', { name: 'Create Preset', exact: true })).toBeEnabled()
}
async function openSource(patch, keyboard = false) {
  const before = await witness(),
    rows = storedPresets(),
    writes = await presetWrites()
  await adapter.trigger().scrollIntoViewIfNeeded()
  if (keyboard) {
    await adapter.trigger().focus()
    await adapter.trigger().press('Enter')
  } else await adapter.trigger().click()
  await assertEditorSource(patch)
  await unchanged(before, 'Capture and Manager opening issue no source write, flush or seal')
  assert.deepEqual(storedPresets(), rows)
  assert.deepEqual(await presetWrites(), writes)
  return { before, rows, writes, banner: await adapter.banner().innerText() }
}
async function cancelDraft(before, sameContext = true) {
  await footer().getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(manager()).toHaveCount(0)
  if (sameContext) await expect(adapter.trigger()).toBeFocused()
  if (before)
    await unchanged(before, 'Detached edits and Cancel never mutate source or seal history')
}
async function closeManager() {
  await manager().getByRole('button', { name: 'Close Preset Manager', exact: true }).click()
  await expect(manager()).toHaveCount(0)
}
async function openProject(recover = false) {
  await window.getByRole('button', { name: `Open ${projectTitle}`, exact: true }).click()
  if (recover) {
    const dialog = window.getByRole('dialog', { name: 'Recovery available', exact: true })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Recover', exact: true }).click()
  }
  await expect(projectView()).toBeVisible()
  await expect(canvas().locator('.canvas-area')).toHaveAttribute('data-scene-ready', 'true')
  await canvas().getByRole('button', { name: 'Fit View', exact: true }).click()
}

// Helper implementation continues below. No top-level native work until run() at the end.

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
    'generation-staging',
    'inference-resources',
    'models',
    'previews',
    'recovery',
    'runtime',
    'staging',
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
  assert.ok(
    runtimeSeconds > 0 && runtimeSeconds <= nativeDeadlineSeconds,
    'Launcher physical deadline must also bound native actors that remain in the launcher group',
  )
  assert.ok(stopSeconds >= 0 && stopSeconds <= 60)
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
      calls: await application.evaluate(() => globalThis.igsSmartCurrentCalls ?? []),
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
  window.setDefaultTimeout(10_000)
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

async function captureEditor(label) {
  const scroll = manager().locator('.editor-scroll .n-scrollbar-container')
  await scroll.evaluate((node) => {
    node.scrollTop = 0
  })
  await adapter.banner().scrollIntoViewIfNeeded()
  await layout(adapter.banner(), `${label}-source-glyphs`)
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
// Observe real handlers. A gate delays delivery only, after the original handler has completed.
async function installObserver() {
  await application.evaluate(({ ipcMain }) => {
    globalThis.igsSmartCurrentCalls = []
    globalThis.igsSmartCurrentOriginals = new Map()
    globalThis.igsSmartCurrentObservers = new Map()
    globalThis.igsSmartCurrentGates = new Map()
    for (const [channel, original] of ipcMain._invokeHandlers) {
      if (!/^(projects|presets|models|runtime):/.test(channel)) continue
      const observed = async (event, ...args) => {
        const call = {
          id: globalThis.igsSmartCurrentCalls.length,
          channel,
          args: structuredClone(args),
          finished: false,
          delivered: false,
        }
        globalThis.igsSmartCurrentCalls.push(call)
        try {
          const response = await original(event, ...args)
          call.ok = response?.ok ?? null
          // Reads are frequent; source/document values have independent witnesses below.
          if (channel === 'presets:create') call.response = structuredClone(response)
          call.finished = true
          const gate = [...globalThis.igsSmartCurrentGates.values()].find(
            (gate) =>
              !gate.held &&
              gate.channel === channel &&
              (gate.layerId === undefined ||
                (args[0] === gate.tabId &&
                  args[1]?.kind === 'sampling-steps' &&
                  args[1].value === gate.steps &&
                  args[3] === gate.layerId)),
          )
          if (gate) {
            gate.held = true
            gate.callId = call.id
            gate.args = structuredClone(args)
            gate.response = structuredClone(response)
            gate.completed = true
            await gate.delivery
            gate.delivered = true
          }
          call.delivered = true
          return response
        } finally {
          call.finished = true
        }
      }
      globalThis.igsSmartCurrentOriginals.set(channel, original)
      globalThis.igsSmartCurrentObservers.set(channel, observed)
      ipcMain._invokeHandlers.set(channel, observed)
    }
  })
  observerInstalled = true
}
async function calls() {
  return application.evaluate(() => structuredClone(globalThis.igsSmartCurrentCalls))
}
async function mutationCalls() {
  return (await calls()).filter(({ channel }) => {
    if (channel.startsWith('presets:')) return false // Checked separately, including failed Create.
    if (
      /^(?:projects:(?:get-|list(?:-|$)|open$|review-accepted-result$)|models:get-|runtime:get-)/.test(
        channel,
      )
    )
      return false
    return true
  })
}
async function presetWrites() {
  return (await calls()).filter(
    ({ channel }) => channel.startsWith('presets:') && !/^presets:(get|list)$/.test(channel),
  )
}
async function armGate(name, contract) {
  await application.evaluate(
    (_, { name, contract }) => {
      if (globalThis.igsSmartCurrentGates.has(name)) throw new Error('Gate already exists')
      const gate = { ...contract, held: false, completed: false, delivered: false }
      gate.delivery = new Promise((resolve) => {
        gate.release = resolve
      })
      globalThis.igsSmartCurrentGates.set(name, gate)
    },
    { name, contract },
  )
}
async function gateState(name) {
  return application.evaluate((_, name) => {
    const gate = globalThis.igsSmartCurrentGates.get(name)
    if (!gate) throw new Error(`Missing owned gate ${name}`)
    const { held, completed, delivered, channel, args, response, callId } = gate
    return { held, completed, delivered, channel, args, response, callId }
  }, name)
}
async function releaseGate(name) {
  if (!application) return
  const present = await application.evaluate((_, name) => {
    const gate = globalThis.igsSmartCurrentGates.get(name)
    if (!gate) return false
    gate.release()
    return true
  }, name)
  if (!present) return
  const state = await gateState(name)
  if (state.held) await expect.poll(async () => (await gateState(name)).delivered).toBe(true)
  report.deliveryGates ??= []
  report.deliveryGates.push({ name, ...(await gateState(name)) })
  await application.evaluate((_, name) => globalThis.igsSmartCurrentGates.delete(name), name)
  checkpoint()
}
async function restoreObserver() {
  if (!observerInstalled || !application) return
  await restoreCapabilityProbe()
  const names = await application.evaluate(() => [...globalThis.igsSmartCurrentGates.keys()])
  for (const name of names) await releaseGate(name)
  const restored = await application.evaluate(({ ipcMain }) => {
    const restored = []
    for (const [channel, original] of globalThis.igsSmartCurrentOriginals) {
      if (ipcMain._invokeHandlers.get(channel) !== globalThis.igsSmartCurrentObservers.get(channel))
        throw new Error(`Observer owner changed: ${channel}`)
      ipcMain._invokeHandlers.set(channel, original)
      if (ipcMain._invokeHandlers.get(channel) !== original)
        throw new Error(`Restoration failed: ${channel}`)
      restored.push(channel)
    }
    return {
      restored,
      allOriginalHandlersRestored: true,
      remainingGates: globalThis.igsSmartCurrentGates.size,
    }
  })
  assert.equal(restored.remainingGates, 0)
  report.observerRestorations ??= []
  report.observerRestorations.push(restored)
  observerInstalled = false
  checkpoint()
}
async function installCapabilityProbe() {
  assert.equal(capabilityProbeInstalled, false)
  await application.evaluate(
    ({ ipcMain }, owner) => {
      globalThis.igsSmartCurrentCapabilityCalls = []
      globalThis.igsSmartCurrentCapabilityOriginals = new Map()
      globalThis.igsSmartCurrentCapabilityAdapters = new Map()
      globalThis.igsSmartCurrentCapabilityActive = true
      globalThis.igsSmartCurrentCapabilityInFlight = 0
      const channels = [
        'runtime:get-status',
        'projects:get-generation-state',
        'projects:get-smart-patch-generation-target-state',
      ]
      for (const channel of channels)
        if (typeof ipcMain._invokeHandlers.get(channel) !== 'function')
          throw new Error(`Missing original metadata handler ${channel}`)
      for (const channel of channels) {
        const original = ipcMain._invokeHandlers.get(channel)
        if (typeof original !== 'function')
          throw new Error(`Missing original metadata handler ${channel}`)
        const controlled = async (event, ...args) => {
          globalThis.igsSmartCurrentCapabilityInFlight += 1
          try {
            const response = await original(event, ...args)
            const record = {
              channel,
              args: structuredClone(args),
              owner,
              original: structuredClone(response),
              controlled: null,
              adapted: globalThis.igsSmartCurrentCapabilityActive,
            }
            globalThis.igsSmartCurrentCapabilityCalls.push(record)
            if (response?.ok !== true)
              throw new Error(
                `Metadata prerequisite requires original successful reply: ${channel}`,
              )
            if (!globalThis.igsSmartCurrentCapabilityActive) {
              record.controlled = structuredClone(response)
              return response
            }
            const adapted = structuredClone(response)
            if (channel === 'runtime:get-status')
              adapted.value = {
                kind: 'ready',
                profile: null,
                detail:
                  'Declared controlled readiness prerequisite for the raw-buffer owner probe only; no installed runtime or inference.',
              }
            else if (channel === 'projects:get-generation-state') {
              if (args[0] !== owner.tabId || response.value.documentId !== owner.documentId)
                throw new Error('Generation-state original owner mismatch')
              adapted.value.smartPatchSupported = true
            } else {
              if (
                args[0] !== owner.tabId ||
                args[1] !== response.value.documentId ||
                args[2] !== response.value.documentRevision ||
                args[3] !== response.value.layerId ||
                response.value.documentId !== owner.documentId
              )
                throw new Error('Target original owner envelope mismatch')
              adapted.value.mode = 'inpaint'
              adapted.value.unavailableReason = null
            }
            record.controlled = structuredClone(adapted)
            return adapted
          } finally {
            globalThis.igsSmartCurrentCapabilityInFlight -= 1
          }
        }
        globalThis.igsSmartCurrentCapabilityOriginals.set(channel, original)
        globalThis.igsSmartCurrentCapabilityAdapters.set(channel, controlled)
        ipcMain._invokeHandlers.set(channel, controlled)
      }
    },
    { tabId: (await current()).id, documentId: fixture.saved.documentId },
  )
  capabilityProbeInstalled = true
  report.capabilityProbe = { scope: report.boundary.ownerValidityCollaborator, installed: true }
  checkpoint()
}
async function restoreCapabilityProbe() {
  if (!capabilityProbeInstalled || !application) return
  const value = await application.evaluate(({ ipcMain }) => {
    globalThis.igsSmartCurrentCapabilityActive = false
    const restored = []
    for (const [channel, original] of globalThis.igsSmartCurrentCapabilityOriginals) {
      if (
        ipcMain._invokeHandlers.get(channel) !==
        globalThis.igsSmartCurrentCapabilityAdapters.get(channel)
      )
        throw new Error(`Metadata adapter owner changed: ${channel}`)
      ipcMain._invokeHandlers.set(channel, original)
      if (ipcMain._invokeHandlers.get(channel) !== original)
        throw new Error(`Metadata handler restoration failed: ${channel}`)
      restored.push(channel)
    }
    return { restored }
  })
  capabilityProbeInstalled = false
  await expect
    .poll(() => application.evaluate(() => globalThis.igsSmartCurrentCapabilityInFlight))
    .toBe(0)
  value.calls = await application.evaluate(() =>
    structuredClone(globalThis.igsSmartCurrentCapabilityCalls),
  )
  report.capabilityProbe = { ...report.capabilityProbe, ...value, restored: true }
  retainJson('owner-validity-original-controlled-metadata.json', report.capabilityProbe)
  for (const entry of value.calls) {
    assert.equal(entry.original.ok, true)
    assert.equal(entry.controlled.ok, true)
    if (!entry.adapted) {
      assert.deepEqual(
        entry.controlled,
        entry.original,
        'A late original read after restoration was adapted',
      )
      continue
    }
    if (entry.channel === 'runtime:get-status') {
      assert.equal(entry.original.value.kind, 'not-installed')
      assert.equal(entry.controlled.value.kind, 'ready')
      assert.equal(entry.controlled.value.profile, null)
    } else if (entry.channel === 'projects:get-generation-state') {
      assert.deepEqual(entry.controlled.value, {
        ...entry.original.value,
        smartPatchSupported: true,
      })
    } else {
      assert.equal(isProjectSmartPatchGenerationTargetState(entry.controlled.value), true)
      assert.deepEqual(entry.controlled.value, {
        ...entry.original.value,
        mode: 'inpaint',
        unavailableReason: null,
      })
    }
  }
  checkpoint()
}
async function metadataBootstrap(label, controlled) {
  const before = await witness(),
    offset = (await mutationCalls()).length
  // Keep the complete raw SQL here, including presets and the entire schema. sourceSql()
  // intentionally omits preset writes for ordinary capture witnesses and is insufficient for
  // this test-environment bootstrap comparison.
  const beforeSql = sourceRows()
  const bootstrap = {
    label,
    controlled,
    before,
    rawSql: { before: beforeSql, after: null },
    reviewedProjectRow: {
      local_project_key: fixture.key,
      canonical_path: fixture.path,
      document_id: fixture.saved.documentId,
    },
    allowedSqlDelta: [],
    notSubject:
      'Declared renderer test-environment metadata refresh, outside same-owner raw-buffer control',
  }
  report.metadataBootstraps ??= []
  report.metadataBootstraps.push(bootstrap)
  checkpoint()
  await window.reload({ waitUntil: 'domcontentloaded' })
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  const status = await api('runtime', 'getStatus')
  bootstrap.status = status
  checkpoint()
  await expect.poll(async () => (await api('projects', 'list')).length).toBe(1)
  await openProject(false)
  const after = await witness()
  const afterSql = sourceRows()
  bootstrap.after = after
  bootstrap.rawSql.after = afterSql
  bootstrap.mutationDelta = (await mutationCalls()).slice(offset)
  checkpoint()

  const isReviewedRow = (row) =>
    Object.entries(bootstrap.reviewedProjectRow).every(([key, value]) => row[key] === value)
  const beforeRows = beforeSql.tables.project_index.filter(isReviewedRow)
  const afterRows = afterSql.tables.project_index.filter(isReviewedRow)
  const normalizedAfterSql = structuredClone(afterSql)
  if (beforeRows.length === 1 && afterRows.length === 1) {
    const beforeRow = beforeRows[0],
      afterRow = afterRows[0]
    const otherColumnsExact = isDeepStrictEqual(
      { ...beforeRow, indexed_at: null },
      { ...afterRow, indexed_at: null },
    )
    const oldTime = Date.parse(beforeRow.indexed_at),
      newTime = Date.parse(afterRow.indexed_at)
    const timestampAdvanced =
      Number.isFinite(oldTime) && Number.isFinite(newTime) && newTime >= oldTime
    bootstrap.indexRefreshCandidate = {
      before: beforeRow.indexed_at,
      after: afterRow.indexed_at,
      otherColumnsExact,
      timestampAdvanced,
    }
    if (beforeRow.indexed_at !== afterRow.indexed_at && otherColumnsExact && timestampAdvanced) {
      normalizedAfterSql.tables.project_index.find(isReviewedRow).indexed_at = beforeRow.indexed_at
      bootstrap.allowedSqlDelta.push({
        table: 'project_index',
        row: bootstrap.reviewedProjectRow,
        column: 'indexed_at',
        before: beforeRow.indexed_at,
        after: afterRow.indexed_at,
        allOtherColumnsExact: true,
        reason: 'Allowed test-environment bootstrap projects.list read-index refresh only',
      })
    }
  }
  bootstrap.sqlComparison = {
    reviewedBeforeRowCount: beforeRows.length,
    reviewedAfterRowCount: afterRows.length,
    normalizedAfterSql,
    scope:
      'Only this metadata bootstrap may normalize the reviewed row indexed_at; capture unchanged() remains exact',
  }
  // Preserve both raw states and the exact proposed allowance before any comparison can fail.
  retainJson(`metadata-bootstraps/${report.metadataBootstraps.length}-${label}.json`, bootstrap)
  checkpoint()

  assert.equal(status.kind, controlled ? 'ready' : 'not-installed')
  // Reload consumes startup's normal runtime.getStatus, not an injected renderer status/tab.
  if (controlled)
    await expect(window.getByLabel('Image generation status', { exact: true })).toHaveCount(0)
  else
    await expect(window.getByLabel('Image generation status', { exact: true })).toContainText(
      'Set up image generation',
    )
  assert.equal(beforeRows.length, 1, 'Bootstrap reviewed Project row was not uniquely identified')
  assert.equal(
    afterRows.length,
    1,
    'Bootstrap reviewed Project row changed identity or disappeared',
  )
  assert.deepEqual(
    after.liveDocument,
    before.liveDocument,
    'Metadata bootstrap altered Main-owned document',
  )
  assert.deepEqual(after.savedDocument, before.savedDocument)
  assert.equal(after.packageSha256, before.packageSha256)
  assert.deepEqual(after.files, before.files)
  assert.deepEqual(
    normalizedAfterSql,
    beforeSql,
    'Metadata bootstrap changed schema or SQL beyond the reviewed Project indexed_at refresh',
  )
  assert.deepEqual(bootstrap.mutationDelta, [], 'Metadata reload issued a source mutation/seal')
  bootstrap.comparisonsPassed = true
  checkpoint()
}
async function ownerValidityProbe() {
  let causalError
  try {
    await installCapabilityProbe()
    await metadataBootstrap('controlled-prerequisites-before-owner-probe', true)
    await ownerValidity()
  } catch (error) {
    causalError = error
  }
  try {
    await restoreCapabilityProbe()
  } catch (error) {
    report.capabilityRestorationFailure = String(error)
    causalError ??= error
  }
  if (!capabilityProbeInstalled) {
    try {
      await metadataBootstrap('original-not-installed-after-metadata-handler-restoration', false)
      await noRuntime()
      report.originalMetadataRestored = true
      await snapshot('01a-original-offline-metadata-restored-after-owner-probe')
    } catch (error) {
      report.originalMetadataRefreshFailure = String(error)
      causalError ??= error
    }
  }
  if (causalError) throw causalError
}
function sourceSql() {
  const state = sourceRows()
  // The preset table is this flow's sole intentional storage mutation. The one exact owned
  // trigger has its own schema-byte restoration proof; retain full state in every SQL backup.
  delete state.tables.presets
  state.schema = state.schema.filter(({ name }) => name !== createFailureTriggerName)
  return state
}
async function witness() {
  await frames()
  const tab = await current(),
    saved = await readIgsPackage(fixture.path)
  let shadow
  const store = new ProjectShadowStore(path.join(appDataRoot, 'autosave'))
  await expect
    .poll(async () => {
      shadow = await store.inspect({ projectPath: fixture.path, savedPackage: saved })
      return tab.dirty
        ? shadow.status === 'recoverable' &&
            shadow.document.documentRevision === tab.documentRevision
        : ['absent', 'clean'].includes(shadow.status)
    })
    .toBe(true)
  const liveDocument = tab.dirty ? shadow.document : saved.project
  assert.equal(liveDocument.documentRevision, tab.documentRevision)
  const ui = await canvas()
    .locator('.canvas-area')
    .evaluate((area) => ({
      camera: { x: area.dataset.cameraX, y: area.dataset.cameraY, scale: area.dataset.cameraScale },
      selected: [...document.querySelectorAll('.entity-select[aria-pressed="true"]')]
        .map((node) => node.getAttribute('aria-label'))
        .sort(),
    }))
  assert.ok(
    Object.values(ui.camera).every(
      (value) => value !== undefined && Number.isFinite(Number(value)),
    ),
  )
  return {
    tab,
    liveDocument,
    savedDocument: saved.project,
    packageSha256: digest(readFileSync(fixture.path)),
    files: dataHashes(),
    sql: sourceSql(),
    ui,
    mutations: await mutationCalls(),
  }
}
async function unchanged(before, label, camera = true) {
  const after = await witness()
  const comparable = (value) => (camera ? value : { ...value, ui: { ...value.ui, camera: null } })
  assert.deepEqual(
    comparable(after),
    comparable(before),
    `${label}: source/document/history/seed/library/package/autosave/selection changed`,
  )
  report.witnesses.push({ label, before, after, compareCamera: camera })
  checkpoint()
  return after
}
function mutationDelta(before, after, expected, label) {
  assert.deepEqual(after.mutations.slice(0, before.mutations.length), before.mutations)
  const delta = after.mutations.slice(before.mutations.length)
  assert.deepEqual(
    delta.map(({ channel }) => channel),
    expected,
    label,
  )
  assert.ok(
    delta.every(({ finished, delivered, ok }) => finished && delivered && ok === true),
    label,
  )
  report.expectedActions.push({ label, delta, before, after })
  checkpoint()
  return delta
}
async function selectLayer(layer, underModal = false) {
  if ((await adapter.select(layer).getAttribute('aria-pressed')) === 'true') return
  const before = await witness()
  if (underModal) await adapter.select(layer).evaluate((button) => button.click())
  else {
    await adapter.select(layer).scrollIntoViewIfNeeded()
    await adapter.select(layer).click()
  }
  await expect(adapter.select(layer)).toHaveAttribute('aria-pressed', 'true')
  const after = await witness()
  const delta = mutationDelta(
    before,
    after,
    ['projects:seal-prompt-history'],
    'Intentional selected-layer navigation seal, separate from capture',
  )
  assert.deepEqual(delta[0].args, [before.tab.id, null])
  assert.deepEqual({ ...after, ui: before.ui, mutations: [] }, { ...before, mutations: [] })
  assert.deepEqual(after.ui, { ...before.ui, selected: [`Select ${layer.name}`] })
}
function immutableSource(document) {
  // Authored draft changes and revision adoption are independently witnessed setup actions.
  const copy = structuredClone(document)
  delete copy.documentRevision
  delete copy.generationDraft
  for (const layer of copy.layers) if (layer.kind === 'smart-patch') delete layer.generationDraft
  return copy
}
async function invariants() {
  const value = await witness()
  assert.equal(value.packageSha256, fixture.originalPackageSha256, 'Source .igs was rewritten')
  assert.deepEqual(value.savedDocument, fixture.saved)
  assert.deepEqual(
    immutableSource(value.liveDocument),
    immutableSource(fixture.recovered),
    'Accepted PNG/provenance/mask/geometry/active variant/seed context changed',
  )
  assert.deepEqual(
    value.tab.generationDraft,
    fixture.recovered.generationDraft,
    'Project authoring changed',
  )
  assert.equal(value.sql.tables.generation_seed_cursor.length, 1)
  assert.equal(value.sql.tables.generation_seed_cursor[0].actual_seed, 0)
  for (const table of [
    'generation_queue_item',
    'generation_candidate_receipt',
    'generation_acceptance_journal',
    'model_resource',
    'model_resource_version',
    'local_model_file',
    'checkpoint_prediction_override',
    'checkpoint_noise_profile_override',
  ])
    assert.deepEqual(value.sql.tables[table], [], `${table} changed`)
  const loaded = await readIgsPackage(fixture.path)
  for (const input of fixture.inputs)
    assert.ok(
      (await loaded.readMember(input.member)).equals(input.bytes),
      'Accepted/mask PNG bytes changed',
    )
  return value
}
async function retainDatabase(label, afterNativeExit = false) {
  if (afterNativeExit) {
    assert.equal(application, null, 'Physical-exit checkpoint cannot have a live native owner')
    assert.ok(
      report.nativeClosures.length > 0 && report.nativeClosures.every(({ confirmed }) => confirmed),
    )
  }
  const directory = path.join(evidenceRoot, label)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const file = path.join(directory, 'app.sqlite')
  assert.equal(existsSync(file), false)
  const source = new Database(path.join(appDataRoot, 'database/app.sqlite'), {
    readonly: true,
    fileMustExist: true,
  })
  try {
    await source.backup(file)
  } finally {
    source.close()
  }
  report.snapshots.push({
    path: file,
    bytes: lstatSync(file).size,
    sha256: digest(readFileSync(file)),
  })
  checkpoint() // Register bytes even if integrity/readback fails.
  const copy = new Database(file, { readonly: true, fileMustExist: true })
  let state
  try {
    assert.deepEqual(copy.prepare('PRAGMA integrity_check').all(), [{ integrity_check: 'ok' }])
    state = databaseState(copy)
  } finally {
    copy.close()
  }
  const record = { label, path: file, afterNativeExit, integrity: 'ok', state }
  report.databaseCheckpoints.push(record)
  checkpoint()
  return record
}
async function snapshot(label, { closed = false, afterNativeExit = false } = {}) {
  const database = await retainDatabase(label, afterNativeExit)
  const expected = sourceRows(),
    filesBefore = dataHashes()
  assert.deepEqual(database.state, expected, 'SQL changed during checkpoint')
  const retainedFiles = dataFiles().map((file) => ({
    original: file,
    path: retain(file, `${label}/data/${path.relative(appDataRoot, file)}`),
    sha256: digest(readFileSync(file)),
  }))
  assert.deepEqual(sourceRows(), expected)
  assert.deepEqual(dataHashes(), filesBefore)
  retainJson(`${label}/readback.json`, {
    database: database.path,
    tab: closed ? null : await current(),
    retainedFiles,
    inputs: fixture.inputs.map(({ bytes, ...input }) => ({
      ...input,
      sha256: digest(bytes),
      byteSize: bytes.length,
    })),
  })
  report.stateCheckpoints.push({
    label,
    afterNativeExit,
    database: database.path,
    retainedFiles,
  })
  checkpoint()
}
async function noRuntime() {
  assert.equal((await api('runtime', 'getStatus')).kind, 'not-installed')
  assert.deepEqual(await api('models', 'getCatalog'), [])
  assert.deepEqual(sourceRows().tables.generation_queue_item, [])
}
async function undoSetup(label, patch, expectedDraft) {
  const before = await witness()
  await window.getByRole('button', { name: 'Edit menu', exact: true }).click()
  await window.getByText('Undo · Ctrl+Z', { exact: true }).click()
  await expect(window.getByRole('menuitem')).toHaveCount(0)
  await expect
    .poll(async () => (await current()).layers.find(({ id }) => id === patch.id).generationDraft)
    .toEqual(expectedDraft)
  const after = await witness()
  mutationDelta(
    before,
    after,
    ['projects:seal-prompt-history', 'projects:undo'],
    `${label}: authorized Undo and its seal`,
  )
  assert.deepEqual(immutableSource(after.liveDocument), immutableSource(before.liveDocument))
  assert.equal(after.packageSha256, before.packageSha256)
  assert.deepEqual(after.sql, before.sql)
  return after
}
async function ownerValidity() {
  const [patchA, patchB] = fixture.patches
  assert.equal(patchA.locked, false)
  assert.equal(patchB.locked, true)
  assert.equal(patchB.visible, false)
  await selectLayer(patchA)
  const before = await witness()
  await adapter.denoising().scrollIntoViewIfNeeded()
  report.ownerValidity = {
    stage: 'editable-A-precondition',
    selectors: {
      input: 'textbox: Denoising Strength',
      reset: 'button: Reset Denoising Strength',
      selectedA: `button: Select ${patchA.name}`,
      selectedB: `button: Select ${patchB.name}`,
      source: `button: ${adapter.saveLabel}`,
      banner: `alert: ${adapter.bannerLabel}`,
    },
    patchA: {
      id: patchA.id,
      locked: patchA.locked,
      visible: patchA.visible,
      draft: patchA.generationDraft,
    },
    patchB: {
      id: patchB.id,
      locked: patchB.locked,
      visible: patchB.visible,
      draft: patchB.generationDraft,
    },
    inputInitiallyEnabled: await adapter.denoising().isEnabled(),
    inputInitially: await adapter.denoising().inputValue(),
  }
  checkpoint()
  // Controlled readiness/target metadata is the declared prerequisite collaborator. The normal
  // rendered input must become enabled; removing disabled or injecting raw state is forbidden.
  await expect(
    adapter.denoising(),
    'R1P2 precondition: A Denoising Strength must be actually editable',
  ).toBeEnabled()
  await adapter.denoising().fill('-')
  await expect(adapter.denoising()).toHaveValue('-')
  await expect(
    projectView().getByText('Enter Denoising Strength from 0 to 1, or leave it unset.', {
      exact: true,
    }),
  ).toBeVisible()
  await unchanged(
    before,
    "A literal '-' is raw invalid input, not a published generationDraft mutation",
  )
  const afterRaw = await current()
  assert.deepEqual(
    afterRaw.layers.find(({ id }) => id === patchA.id).generationDraft,
    patchA.generationDraft,
  )
  report.ownerValidity.stage = 'A-invalid-not-published'
  await screenshot('owner-validity-A-raw-invalid-unpublished')
  const refreshOffset = (await calls()).length
  const queue = projectView().getByRole('button', { name: 'Generation queue', exact: true })
  const queuePanel = window.getByLabel('Project generation queue', { exact: true })
  const refresh = {
    stage: 'waiting-for-renderer-loading',
    noReload: true,
    adoptionBoundary:
      'ProjectView queue opening calls App.refreshGenerationState; its current request adopts the state before finally clearing loading. ProjectQueuePanel status must visibly change from Loading to the empty idle message while the queue remains open.',
  }
  report.ownerValidity.sameOwnerRefresh = refresh
  checkpoint()
  // The original Main read finishes normally. Hold only its reply delivery so the real
  // renderer loading state cannot flash past the probe, then require actual UI adoption.
  await armGate('owner-queue-refresh', { channel: 'projects:get-generation-state' })
  try {
    await queue.click()
    await expect(queuePanel).toBeVisible()
    await expect(queuePanel.getByRole('status')).toHaveText('Loading project queue…')
    refresh.loadingText = await queuePanel.getByRole('status').innerText()
    refresh.stage = 'renderer-loading-observed'
    checkpoint()
    await expect.poll(async () => (await gateState('owner-queue-refresh')).completed).toBe(true)
    const held = await gateState('owner-queue-refresh')
    refresh.originalHeldRead = held
    assert.equal(held.response.ok, true)
    assert.deepEqual(held.args, [before.tab.id])
    assert.equal(held.response.value.documentId, before.tab.documentId)
    await releaseGate('owner-queue-refresh')
    // Main's observer marks delivery before the renderer resumes. This visible status is
    // the renderer barrier: App clears loading only after its newest request adopts the state.
    await expect(queuePanel.getByRole('status')).toHaveText(
      'No pending or running jobs in this project.',
    )
    await expect(queuePanel.getByRole('alert')).toHaveCount(0)
    const settledReads = (await calls())
      .slice(refreshOffset)
      .filter(({ channel }) => channel === 'projects:get-generation-state')
    refresh.settledReads = settledReads
    refresh.settledText = await queuePanel.getByRole('status').innerText()
    refresh.stage = 'renderer-state-adopted-queue-still-open'
    checkpoint()
    assert.equal(settledReads.length, 1, 'Queue refresh must have one known newest state read')
    assert.equal(settledReads[0].id, held.callId)
    assert.equal(settledReads[0].finished, true)
    assert.equal(settledReads[0].delivered, true)
    assert.equal(settledReads[0].ok, true)
    // Same owner refresh must preserve the user's invalid buffer. No reload or owner
    // navigation occurs here; broad resets on metadata refresh must fail this control.
    await expect(adapter.denoising()).toHaveValue('-')
    await expect(
      projectView().getByText('Enter Denoising Strength from 0 to 1, or leave it unset.', {
        exact: true,
      }),
    ).toBeVisible()
    await expect(adapter.trigger()).toBeDisabled()
    await unchanged(
      before,
      'Renderer-adopted same-owner queue refresh preserves raw invalidity and publishes no draft/seal',
    )
    refresh.rawText = await adapter.denoising().inputValue()
    refresh.passed = true
    refresh.stage = 'passed-after-renderer-adoption'
    checkpoint()
  } finally {
    await releaseGate('owner-queue-refresh')
  }
  await window.getByRole('button', { name: 'Close project queue', exact: true }).click()
  await expect(queuePanel).toHaveCount(0)
  await unchanged(before, 'Closing the same-owner queue preserves exact source state')
  checkpoint()
  await selectLayer(patchB)
  const selected = await witness(),
    selectedB = selected.tab.layers.find(({ id }) => id === patchB.id)
  assert.deepEqual(selectedB.generationDraft, patchB.generationDraft)
  assert.equal(selectedB.locked, true)
  assert.equal(selectedB.visible, false)
  const validB = parsePresetDefinition({
    name: adapter.defaultName(selectedB),
    description: '',
    favorite: false,
    tags: ['project'],
    workflow: 'smartPatch',
    payload: expectedPayload(selectedB),
  })
  await expect(adapter.denoising()).toBeDisabled()
  const resetCount = await adapter.resetDenoising().count()
  report.ownerValidity = {
    ...report.ownerValidity,
    stage: 'causal-valid-B-save-current-enabled',
    validB,
    rawTextOnB: await adapter.denoising().inputValue(),
    resetOnB: {
      count: resetCount,
      disabled: resetCount ? !(await adapter.resetDenoising().isEnabled()) : null,
    },
    saveCurrentOnB: { enabled: await adapter.trigger().isEnabled() },
    sourceBeforeBLaunch: selected,
    causalBoundary:
      'Valid hidden+locked B must copy independently of unpublished raw invalidity on A. Only the separately recorded layer-navigation seal is allowed.',
  }
  retainJson('owner-validity-before-causal-assertion.json', report.ownerValidity)
  await adapter.trigger().scrollIntoViewIfNeeded()
  await screenshot('owner-validity-valid-locked-B-before-source')
  checkpoint()
  // Intentionally fails on the unkeyed denoising owner leak. No skip, force-click or fallback.
  await expect(
    adapter.trigger(),
    'R1P2: valid locked B must not inherit A raw invalidity',
  ).toBeEnabled()
  await expect(adapter.denoising()).toHaveValue(
    patchB.generationDraft.sampling.denoisingStrength === null
      ? ''
      : String(patchB.generationDraft.sampling.denoisingStrength),
  )
  const opened = await openSource(patchB)
  await cancelDraft(opened.before)
  assert.deepEqual(storedPresets(), opened.rows)
  assert.deepEqual(await presetWrites(), opened.writes)
  await unchanged(
    selected,
    'Valid locked B source/Cancel changes nothing beyond preceding authorized navigation',
  )
  report.ownerValidity.stage = 'passed-actual-valid-B-source-and-cancel'
  report.ownerValidity.passed = true
  checkpoint()
  await selectLayer(patchA)
}
async function pendingAcknowledgement() {
  const patch = fixture.patches[0]
  await selectLayer(patch)
  const before = await witness(),
    steps = patch.generationDraft.sampling.steps + 6
  await armGate('draft-ack', {
    channel: adapter.draftChannel,
    tabId: before.tab.id,
    layerId: patch.id,
    steps,
  })
  try {
    await adapter.steps().fill(String(steps))
    await expect.poll(async () => (await gateState('draft-ack')).completed).toBe(true)
    const held = await gateState('draft-ack')
    assert.equal(held.response.ok, true, 'Original Main draft update must succeed')
    assert.equal(held.args[3], patch.id)
    assert.equal(
      (await current()).layers.find(({ id }) => id === patch.id).generationDraft.sampling.steps,
      steps,
    )
    await expect(adapter.trigger()).toBeDisabled()
    const rows = storedPresets(),
      writes = await presetWrites(),
      mutations = await mutationCalls()
    // Disabled DOM click is a refusal probe, not a mapper or App-state injection.
    await adapter.trigger().evaluate((button) => button.click())
    await projectView().getByRole('group', { name: adapter.saveLabel, exact: true }).hover()
    await expect(window.getByText(adapter.pendingReason, { exact: true })).toBeVisible()
    await frames()
    await expect(manager()).toHaveCount(0)
    assert.deepEqual(await mutationCalls(), mutations, 'Pending capture flushed/sealed a draft')
    assert.deepEqual(storedPresets(), rows)
    assert.deepEqual(await presetWrites(), writes)
  } finally {
    await releaseGate('draft-ack')
  }
  await expect(adapter.trigger()).toBeEnabled()
  const acknowledged = (await current()).layers.find(({ id }) => id === patch.id)
  const opened = await openSource(acknowledged)
  await cancelDraft(opened.before)
  const changed = await witness()
  mutationDelta(
    before,
    changed,
    [adapter.draftChannel],
    'One actual UI authoring precondition, no capture mutation',
  )
  await undoSetup('Restore sync-pending precondition', patch, patch.generationDraft)
  await invariants()
  check(
    '02 Pending real Main acknowledgement disables capture with an explanation; unchanged reply enables exact acknowledged capture; no flush/seal/allocation; setup Undo is separate',
  )
}
async function canvasControl() {
  await selectLayer(fixture.ordinary)
  const before = await witness(),
    rows = storedPresets(),
    writes = await presetWrites()
  await adapter.trigger().click()
  await expect(manager()).toBeVisible()
  const banner = manager().getByRole('alert', { name: adapter.projectBannerLabel, exact: true })
  await expect(banner).toContainText(projectTitle)
  await expect(adapter.banner()).toHaveCount(0)
  await expectPrompt(promptEditor(), before.tab.generationDraft.positivePrompt.text)
  await expect(included('Size')).toBeChecked()
  await expect(included('Seed')).not.toBeChecked()
  await expect(nameInput()).toHaveValue(`${projectTitle} Baseline`)
  await expect(footer().getByRole('button', { name: 'Create Preset', exact: true })).toBeDisabled()
  await expect(banner).toContainText('Choose a workflow')
  await cancelDraft(before)
  assert.deepEqual(storedPresets(), rows)
  assert.deepEqual(await presetWrites(), writes)
  await selectLayer(fixture.patches[0])
  check(
    '03 Ordinary Raster selection keeps the existing Canvas source, Project draft/Size and explicit unknown nonempty workflow; Cancel allocates nothing',
  )
}
async function detachedCancel() {
  const patch = fixture.patches[0],
    opened = await openSource(patch)
  const initialPayload = expectedPayload(patch)
  portableOnly(initialPayload)
  await nameInput().fill('Edited detached name')
  await manager()
    .getByRole('textbox', { name: 'Preset description', exact: true })
    .fill('Detached editable description')
  await promptEditor().fill('Detached {edited|template}; source stays exact')
  await included('Size').check()
  await included('Seed').check()
  await expect(included('Size')).toBeChecked()
  await expect(included('Seed')).toBeChecked()
  await expect(adapter.banner()).toHaveText(opened.banner, { useInnerText: true })
  await cancelDraft(opened.before)
  assert.deepEqual(storedPresets(), opened.rows)
  assert.deepEqual(await presetWrites(), opened.writes)
  const reopened = await openSource(patch)
  await expect(nameInput()).toHaveValue(adapter.defaultName(patch))
  await expectPrompt(promptEditor(), patch.generationDraft.positivePrompt.text)
  await cancelDraft(reopened.before)
  check(
    '04 Authored templates/exact bindings/refs/signed LoRAs remain detached; Size and Seed start omitted but permit explicit editor inclusion; edited Cancel has no identity, row or source write',
  )
}
async function layoutAndFocus() {
  for (const [width, height] of [
    [1440, 900],
    [900, 620],
  ]) {
    await setNativeSize(width, height)
    await adapter.trigger().scrollIntoViewIfNeeded()
    await layout(adapter.trigger(), `save-current-${width}x${height}`, 'icon')
    const opened = await openSource(fixture.patches[0], true)
    await captureEditor(`smart-current-${width}x${height}`)
    await cancelDraft(opened.before)
    await layout(adapter.trigger(), `restored-save-current-${width}x${height}`, 'icon')
    await screenshot(`restored-source-${width}x${height}`)
    assert.deepEqual(storedPresets(), opened.rows)
    assert.deepEqual(await presetWrites(), opened.writes)
  }
  await setNativeSize(1440, 900)
  check(
    '05 Real 1440x900 and native minimum 900x620: keyboard activation, source/footer glyph bounds, SVG/hit targets, independent editor scrolling, Cancel and same-context focus return',
  )
}
async function frozenOpening() {
  const patch = fixture.patches[0],
    before = await witness(),
    rows = storedPresets(),
    writes = await presetWrites()
  await armGate('catalog', { channel: adapter.catalogChannel })
  try {
    await adapter.trigger().click()
    await expect.poll(async () => (await gateState('catalog')).completed).toBe(true)
    const held = await gateState('catalog')
    assert.equal(held.response.ok, true)
    assert.deepEqual(held.response.value, [], 'Only the original empty catalog reply may be held')
    await unchanged(before, 'Synchronous Patch snapshot before async catalog has no mutation/seal')
    // Drive the real built input handler under the modal mask. This is deliberate subsequent
    // authoring, never a direct ProjectTab/session/preset replacement.
    const steps = patch.generationDraft.sampling.steps + 11
    await adapter.steps().evaluate((input, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
        input,
        String(value),
      )
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }, steps)
    await expect
      .poll(
        async () =>
          (await current()).layers.find(({ id }) => id === patch.id).generationDraft.sampling.steps,
      )
      .toBe(steps)
    await expect(adapter.steps()).toHaveValue(String(steps))
    const authored = await witness()
    mutationDelta(
      before,
      authored,
      [adapter.draftChannel],
      'Later real authoring is an explicit setup action',
    )
    assert.deepEqual(immutableSource(authored.liveDocument), immutableSource(before.liveDocument))
    assert.deepEqual(authored.sql, before.sql)
    assert.equal(authored.packageSha256, before.packageSha256)
    await selectLayer(fixture.patches[1], true)
  } finally {
    await releaseGate('catalog')
  }
  await assertEditorSource(patch)
  assert.deepEqual(storedPresets(), rows)
  assert.deepEqual(await presetWrites(), writes)
  const frozen = {
    patch: structuredClone(patch),
    before: await witness(),
    rows,
    writes,
    banner: await adapter.banner().innerText(),
  }
  check(
    '06 Original catalog reply and later real Patch authoring/selection cannot replace the synchronously captured authored source; no synthetic mapper or source endpoint',
  )
  return frozen
}
async function failCreate(frozen) {
  const { patch } = frozen
  await nameInput().fill('Illustrious captured recipe')
  await manager()
    .getByRole('textbox', { name: 'Preset description', exact: true })
    .fill('Edited before SQLite failure; keep for retry')
  report.createRetry = { beforeRows: frozen.rows, expectedPayload: expectedPayload(patch) }
  installCreateFailureTrigger()
  try {
    await footer().getByRole('button', { name: 'Create Preset', exact: true }).click()
    await expect(
      manager().getByRole('alert', { name: 'Preset action failed', exact: true }),
    ).toContainText('PRESET_STORAGE_FAILED')
    await expect(nameInput()).toHaveValue('Illustrious captured recipe')
    await expect(
      manager().getByRole('textbox', { name: 'Preset description', exact: true }),
    ).toHaveValue('Edited before SQLite failure; keep for retry')
    await expect(
      manager().getByRole('article', { name: 'Preset draft', exact: true }),
    ).toBeVisible()
    await expect(adapter.banner()).toHaveText(frozen.banner, { useInnerText: true })
    await expectPrompt(promptEditor(), patch.generationDraft.positivePrompt.text)
    await expect(footer().getByRole('button', { name: 'Create Preset', exact: true })).toBeEnabled()
    const writes = (await presetWrites()).slice(frozen.writes.length)
    assert.equal(writes.length, 1)
    assert.equal(writes[0].channel, 'presets:create')
    assert.equal(writes[0].response.ok, false)
    assert.equal(writes[0].response.error.code, 'PRESET_STORAGE_FAILED')
    assert.equal(Object.hasOwn(writes[0].response, 'value'), false, 'Failed Create published an ID')
    assert.deepEqual(writes[0].args[0].payload, expectedPayload(patch))
    assert.equal(writes[0].args[0].workflow, 'smartPatch')
    portableOnly(writes[0].args[0].payload)
    assert.deepEqual(storedPresets(), frozen.rows)
    await unchanged(
      frozen.before,
      'Real failed Create preserves captured source/current later authoring/selection/history',
    )
    report.createRetry.failedCall = writes[0]
    await screenshot('actual-sqlite-create-failure')
    await snapshot('02-create-insert-failure')
  } finally {
    removeCreateFailureTrigger()
  }
  await snapshot('03-trigger-restored-before-retry')
  check(
    '07 Real SQLite INSERT failure publishes no record/ID and keeps editable metadata, authored draft and frozen source; exact owned trigger schema restored',
  )
}
async function createUi(patch, name, before) {
  const rows = storedPresets(),
    writes = await presetWrites()
  await nameInput().fill(name)
  await footer().getByRole('button', { name: 'Create Preset', exact: true }).click()
  await expect(
    manager().getByRole('button', { name: `Select preset ${name}`, exact: true }),
  ).toBeVisible()
  await expect(adapter.banner()).toHaveCount(0)
  const delta = (await presetWrites()).slice(writes.length)
  assert.equal(delta.length, 1)
  assert.equal(delta[0].channel, 'presets:create')
  assert.equal(delta[0].response.ok, true)
  assert.deepEqual(delta[0].args[0].payload, expectedPayload(patch))
  assert.equal(delta[0].args[0].workflow, 'smartPatch')
  portableOnly(delta[0].args[0].payload)
  const matches = (await api('presets', 'list')).filter((record) => record.name === name)
  assert.equal(matches.length, 1)
  const record = matches[0]
  assert.deepEqual(record, delta[0].response.value)
  assert.deepEqual(record.payload, expectedPayload(patch))
  assert.equal(record.workflow, 'smartPatch')
  const sql = storedPresets()
  assert.equal(sql.length, rows.length + 1)
  assert.deepEqual(
    sql.filter(({ id }) => id !== record.id),
    rows,
  )
  assert.ok(sql.some(({ id }) => id === record.id))
  for (const id of [fixture.key, fixture.saved.documentId, ...fixture.patches.map(({ id }) => id)])
    assert.equal(
      JSON.stringify(record).includes(id),
      false,
      'Source identity leaked into persisted recipe',
    )
  await unchanged(before, 'Explicit Create writes only a detached preset row')
  created.push(record)
  await closeManager()
  return record
}
async function retryCreate(frozen) {
  const record = await createUi(frozen.patch, 'Illustrious captured recipe', frozen.before)
  assert.equal(record.description, 'Edited before SQLite failure; keep for retry')
  report.createRetry.retryRecord = record
  await snapshot('04-first-persisted-recipe')
  await selectLayer(fixture.patches[0])
  await undoSetup(
    'Restore later authoring precondition',
    fixture.patches[0],
    fixture.patches[0].generationDraft,
  )
  await invariants()
  check(
    '08 Explicit retry persists exactly one Illustrious recipe from the original capture, including templates/sidecars/ref snapshots and optional zero/FP32/external VAE; later setup authoring restored',
  )
}
async function animaCreate() {
  const patch = fixture.patches[1]
  assert.equal(patch.visible, false)
  assert.equal(patch.locked, true)
  await selectLayer(patch)
  const opened = await openSource(patch)
  assert.equal(Object.hasOwn(expectedPayload(patch), 'denoisingStrength'), false)
  assert.equal(Object.hasOwn(expectedPayload(patch), 'cfgRescale'), false)
  assert.equal(Object.hasOwn(expectedPayload(patch), 'vaePrecision'), false)
  await createUi(patch, 'Anima hidden locked recipe', opened.before)
  await invariants()
  await snapshot('05-two-persisted-recipes')
  check(
    '09 Hidden AND locked selected Anima Patch remains read-copy eligible; smartPatch workflow is independent of worker/mode; absent optional/denoise values stay absent; second explicit Create persists exact authored fields',
  )
}
async function closeProject(discard = false) {
  const before = await witness(),
    start = (await mutationCalls()).length
  await window.getByRole('button', { name: `Close ${projectTitle}`, exact: true }).click()
  if (discard) {
    const dialog = window.getByRole('dialog', { name: 'Close Project', exact: true })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Discard Changes', exact: true }).click()
  }
  await expect(window.getByRole('tab', { name: projectTitle, exact: true })).toHaveCount(0)
  const delta = (await mutationCalls()).slice(start)
  assert.ok(
    delta.every(({ channel }) =>
      ['projects:seal-prompt-history', 'projects:close', 'projects:discard-and-close'].includes(
        channel,
      ),
    ),
    `Unexpected close mutation: ${JSON.stringify(delta)}`,
  )
  assert.equal(digest(readFileSync(fixture.path)), fixture.originalPackageSha256)
  report.expectedActions.push({
    label: discard
      ? 'Explicit owned unsaved discard/close restores prepared saved source'
      : 'Final clean Project close',
    before,
    delta,
  })
  checkpoint()
}
async function restart() {
  await invariants()
  assert.equal(storedPresets().length, 2)
  await snapshot('06-before-explicit-discard-and-restart')
  const rows = storedPresets(),
    durable = sourceSql()
  await closeProject(true)
  await snapshot('07-after-explicit-discard-before-exit', { closed: true })
  await restoreObserver()
  await closeNative('first-native-owner')
  await snapshot('08-first-physical-exit', { closed: true, afterNativeExit: true })
  check(
    '10 Capture/Create preserves full accepted bytes/provenance/geometry/seed0 and source .igs; complete unsaved shadow retained before explicit discard; first actual native owner physically exits',
  )
  await launch()
  await noRuntime()
  assert.deepEqual(storedPresets(), rows, 'Restart changed persisted recipe rows')
  for (const table of [
    'generation_seed_cursor',
    'checkpoint_prediction_override',
    'checkpoint_noise_profile_override',
    'model_resource',
    'model_resource_version',
    'local_model_file',
  ])
    assert.deepEqual(sourceSql().tables[table], durable.tables[table])
  await openProject(false)
  const before = await witness()
  assert.equal(before.tab.dirty, false)
  assert.equal(before.tab.canUndo, false)
  assert.deepEqual(
    before.liveDocument,
    fixture.saved,
    'Restart must open the exact unchanged prepared .igs',
  )
  await projectView().getByRole('button', { name: 'Manage Presets', exact: true }).click()
  await expect(manager()).toBeVisible()
  for (const record of created) {
    await manager()
      .getByRole('button', { name: `Select preset ${record.name}`, exact: true })
      .click()
    await expect(nameInput()).toHaveValue(record.name)
    await expect(adapter.banner()).toHaveCount(0)
    assert.deepEqual(await api('presets', 'get', record.id), record)
    await expectPrompt(promptEditor(), record.payload.prompt.text)
  }
  await screenshot('actual-restart-two-persisted-recipes')
  await closeManager()
  await unchanged(before, 'Ordinary restarted Manager reads do not attach source or mutate Project')
  await snapshot('09-actual-restart-two-recipes')
  check(
    '11 Actual second Electron lifetime restores exactly two SQLite recipes through ordinary Manager; source banner is gone and saved Project/package/accepted inputs/cursor survive unchanged',
  )
}
function verifyRetainedBytes() {
  for (const item of report.snapshots) {
    assert.ok(lstatSync(item.path).isFile() && !lstatSync(item.path).isSymbolicLink())
    const bytes = readFileSync(item.path)
    assert.equal(bytes.length, item.bytes)
    assert.equal(digest(bytes), item.sha256)
  }
  for (const input of fixture.inputs)
    assert.ok(
      readFileSync(input.retained).equals(input.bytes),
      'Full retained input PNG is required',
    )
  for (const entry of report.databaseCheckpoints) {
    const database = new Database(entry.path, { readonly: true, fileMustExist: true })
    try {
      assert.deepEqual(database.prepare('PRAGMA integrity_check').all(), [
        { integrity_check: 'ok' },
      ])
      assert.deepEqual(databaseState(database), entry.state)
    } finally {
      database.close()
    }
  }
}
async function finish() {
  await closeProject()
  await restoreObserver()
  await closeNative('second-native-owner')
  // Independent SQL first, after the last UI action and physical exit; no source witness needed.
  await retainDatabase('10-final-after-last-ui-and-physical-exit', true)
  report.finalDatabaseAfterLastUiAndNativeExit = true
  await snapshot('11-final-full-payload-after-physical-exit', {
    closed: true,
    afterNativeExit: true,
  })
  verifyRetainedBytes()
  assert.deepEqual(report.pageErrors, [])
  assert.equal(report.samplerError, undefined)
  assert.equal(report.nativeClosures.length, 2)
  assert.ok(report.nativeClosures.every(({ confirmed, aborted }) => confirmed && !aborted))
  assert.equal(createFailureTriggerInstalled, false)
  assert.equal(observerInstalled, false)
  assert.equal(capabilityProbeInstalled, false)
  assert.equal(report.originalMetadataRestored, true)
  const capturedCalls = report.ipcCalls.flatMap(({ calls }) => calls)
  assert.equal(
    capturedCalls.some(({ channel }) => /get-(smart-result|raster)-preset-data/.test(channel)),
    false,
    'Current authoring must not use accepted-result extraction',
  )
  assert.deepEqual(hashes(sourceFiles), report.sourceSha256, 'Source changed during qualification')
  assert.deepEqual(hashes(bundleFiles), report.bundleSha256, 'Build changed during qualification')
  check(
    '12 Full source PNGs/.igs/autosaves and consistent before/after/final standalone SQLite retained; final SQL follows last UI and two physical exits; exact handlers/gates/trigger restored; source/build/script map and PID/start/cgroup proof; no cleanup',
  )
}
async function finishFocusedOwnerValidity() {
  await snapshot('focused-after-valid-B-capture')
  await closeProject(true)
  await restoreObserver()
  await closeNative('focused-owner-validity')
  await retainDatabase('focused-final-after-last-ui-and-physical-exit', true)
  report.finalDatabaseAfterLastUiAndNativeExit = true
  await snapshot('focused-final-full-payload-after-physical-exit', {
    closed: true,
    afterNativeExit: true,
  })
  verifyRetainedBytes()
  assert.equal(storedPresets().length, 0, 'Focused regression never explicitly creates a preset')
  assert.equal(report.nativeClosures.length, 1)
  assert.equal(report.nativeClosures[0].confirmed, true)
  assert.equal(capabilityProbeInstalled, false)
  assert.equal(report.originalMetadataRestored, true)
  assert.deepEqual(report.pageErrors, [])
  assert.equal(report.samplerError, undefined)
  assert.deepEqual(hashes(sourceFiles), report.sourceSha256)
  assert.deepEqual(hashes(bundleFiles), report.bundleSha256)
  check(
    'Focused owner-validity only: unpublished raw-invalid A -> separately sealed navigation -> valid hidden+locked B Save Current -> real Source Smart Patch/Cancel; no preset rows; independent final SQL and physical exit',
  )
  report.outcome = 'focused-passed'
  report.fullQualification = false
}
async function diagnostics() {
  if (window && !window.isClosed()) {
    for (const [name, read] of [
      ['failure.aria.txt', () => window.locator('body').ariaSnapshot()],
      ['failure.html', () => window.content()],
    ]) {
      try {
        const file = path.join(evidenceRoot, name)
        writeFileSync(file, await read(), { flag: 'wx', mode: 0o600 })
        report.snapshots.push({
          path: file,
          bytes: lstatSync(file).size,
          sha256: digest(readFileSync(file)),
        })
      } catch (error) {
        ;(report.diagnosticErrors ??= []).push({ name, error: String(error) })
      }
    }
    await screenshot('failure').catch((error) => {
      report.failureScreenshotError = String(error)
    })
  }
  if (existsSync(path.join(appDataRoot, 'database/app.sqlite')))
    await retainDatabase('failure-before-exit').catch((error) => {
      report.failureSnapshotError = String(error)
    })
}
async function run() {
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
      ...['src', 'docs/prototype-app/src'].flatMap((directory) =>
        filesBelow(path.join(root, directory)),
      ),
      ...[
        'scripts/smoke-smart-patch-save-current.mjs',
        'scripts/smoke-preset-save-current.mjs',
        'scripts/smoke-smart-patch-result-preset.mjs',
        'scripts/smoke-smart-patch-preset-apply.mjs',
        'scripts/native-smoke-window.mjs',
        'scripts/qualification-resource-limits.mjs',
        'package.json',
        'pnpm-lock.yaml',
        'vite.desktop.config.ts',
        'worker-python/src/imagegen_worker/srgb.icc',
      ].map((file) => path.join(root, file)),
    ]),
  ].sort()
  bundleFiles = ['dist/main/main.cjs', 'dist/preload/preload.cjs', 'dist/renderer/index.html'].map(
    (file) => path.join(root, file),
  )
  bundleFiles.push(
    ...['dist/renderer/assets', 'dist/main/migrations', 'dist/main/placeholders'].flatMap(
      (directory) => filesBelow(path.join(root, directory)),
    ),
  )
  report.sourceSha256 = hashes(sourceFiles)
  report.bundleSha256 = hashes(bundleFiles)
  retainJson('source-build-script-map.json', {
    source: report.sourceSha256,
    build: report.bundleSha256,
    contract: adapter.kind,
    freshBuild:
      'Root precondition: rebuild after final source changes, before execution; paired hashes alone do not establish build causality.',
  })
  retain(
    path.join(root, 'scripts/smoke-smart-patch-save-current.mjs'),
    'source/smoke-smart-patch-save-current.mjs',
  )
  await prepare()
  await snapshot('00-prepared-before-native', { closed: true })
  await launch()
  await noRuntime()
  await openProject(true)
  const initial = await invariants()
  assert.deepEqual(initial.liveDocument.generationDraft, fixture.recovered.generationDraft)
  for (const patch of fixture.patches)
    assert.deepEqual(
      initial.liveDocument.layers.find(({ id }) => id === patch.id).generationDraft,
      patch.generationDraft,
    )
  assert.equal(initial.tab.canUndo, false)
  assert.equal(initial.tab.dirty, true)
  report.baseline = initial
  await snapshot('01-native-recovered-before-capture')
  await ownerValidityProbe()
  if (scenario === 'owner-validity') {
    await finishFocusedOwnerValidity()
    return
  }
  check(
    '01 Real Main recovers portable accepted fixtures/distinct authored drafts; early raw-invalid A -> valid locked B source regression passes with no publication/capture mutation; full PNG/provenance/.igs/shadow/seed0 retained under finite no-ML/no-catalog bounds',
  )
  await pendingAcknowledgement()
  await canvasControl()
  await detachedCancel()
  await layoutAndFocus()
  const frozen = await frozenOpening()
  await failCreate(frozen)
  await retryCreate(frozen)
  await animaCreate()
  await restart()
  await finish()
  assert.equal(report.checks.length, 12)
  report.fullQualification = true
  report.outcome = 'passed'
}
checkpoint()
try {
  await run()
} catch (error) {
  process.exitCode = 1
  report.outcome = 'failed'
  report.failure = { message: error.message, stack: error.stack }
  checkpoint()
  await diagnostics().catch((error) => {
    report.diagnosticsFailure = String(error)
  })
} finally {
  // Every restoration is independent: one failing witness must not suppress the others.
  for (const [label, action] of [
    ['capabilityRestorationFailure', () => restoreCapabilityProbe()],
    ['observerRestorationFailure', () => restoreObserver()],
    ['triggerRestorationFailure', () => removeCreateFailureTrigger()],
    [
      'physicalExitFailure',
      () => (application ? closeNative('failure-owned-actor', true) : undefined),
    ],
  ]) {
    try {
      await action()
    } catch (error) {
      report[label] = String(error)
      process.exitCode = 1
      report.outcome = 'failed'
    }
  }
  clearInterval(sampler)
  const physicallyExited =
    (report.nativeLaunchAttempts ?? 0) > 0 &&
    !application &&
    !report.nativeLaunchError &&
    report.nativeClosures.length === (report.nativeLaunchAttempts ?? 0) &&
    report.nativeClosures.every(({ confirmed }) => confirmed)
  if (
    existsSync(path.join(appDataRoot, 'database/app.sqlite')) &&
    !report.finalDatabaseAfterLastUiAndNativeExit
  ) {
    // No snapshot()/witness()/renderer dependency here. Keep final SQL even if those failed.
    try {
      await retainDatabase(
        physicallyExited
          ? 'failure-final-after-last-ui-and-physical-exit'
          : 'failure-final-exit-unconfirmed',
        physicallyExited,
      )
      report.failureFinalDatabaseRetained = physicallyExited
      if (!physicallyExited) report.finalDatabaseNeedsRootPhysicalExitCheckpoint = true
    } catch (error) {
      report.failureFinalDatabaseError = String(error)
    }
    try {
      report.failureFinalRetainedPayloads = dataFiles().map((file) =>
        retain(file, `failure-final-payload/data/${path.relative(appDataRoot, file)}`),
      )
    } catch (error) {
      report.failureFinalPayloadError = String(error)
    }
  }
  lifecycle.state = 'retained'
  lifecycle.disposition = {
    owner: 'root',
    deletedBytes: 0,
    retainedEvidence: evidenceRoot,
    disposablePayloads: [fixtureRoot, temporaryDirectory],
    physicalExitConfirmed: physicallyExited,
    observerRestored: !observerInstalled && !report.observerRestorationFailure,
    capabilityMetadataRestored: !capabilityProbeInstalled && !report.capabilityRestorationFailure,
    originalOfflineMetadataRefreshed: report.originalMetadataRestored === true,
    triggerRestored: !createFailureTriggerInstalled && !report.triggerRestorationFailure,
    finalDatabaseRetained:
      report.finalDatabaseAfterLastUiAndNativeExit === true ||
      report.failureFinalDatabaseRetained === true,
    releaseCondition:
      'Root verifies retained full PNG/.igs/autosave/input dependencies, every consistent standalone SQLite backup, original handlers/gates/trigger restoration and PID/start/cgroup physical exit before disposing only declared payloads/TMPDIR. No runner deletion.',
  }
  report.finishedAt = new Date().toISOString()
  if (previousTemporaryDirectory === undefined) delete process.env.TMPDIR
  else process.env.TMPDIR = previousTemporaryDirectory
  checkpoint()
  console.log(`${report.outcome.toUpperCase()} ${reportFile}`)
}
