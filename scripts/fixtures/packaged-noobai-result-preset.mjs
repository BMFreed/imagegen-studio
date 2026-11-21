import { expect } from '@playwright/test'
import Database from 'better-sqlite3'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const title = 'Packaged trained noobai-eps-stack-retry'
const layerName = 'Generated 1'
const presetName = 'NoobAI EPS from accepted Raster'
const documentId = 'cc90c48f-d641-437c-b15c-83ef44f777cc'
const revision = '1550cacb-6ef6-4c81-b522-298bf45ea90b'
const layerId = '752d6bfc-d00f-4cd3-9dab-e683e0410e2c'
const pngSha = '16309e1db9c186d7193c45d65a404f6e49b64e678f2e6fa96432a61da610f267'
const presetSource = {
  sha256: '0e5b76d742b068976f9eb3732258d02748bdbfef2024e95b017b4755712a73d6',
  sizeBytes: 361648,
}
const modelFileId = 928571
const vaeFileId = 1494323
const loraFileId = 1165414
const embeddingFileId = 2542976

async function stageProject({ root, appData, ownedRunRoot, identity }) {
  const evidence = path.dirname(root)
  assert.equal(path.dirname(evidence), path.join(ownedRunRoot, 'packaged-noobai-result-preset'))
  assert.match(path.basename(evidence), /^\d{8}(?:-r[1-9]\d*)?$/)
  assert.equal(path.basename(root), 'result-preset')
  assert.equal(appData, path.join(root, 'data/imagegen-studio'))
  assert.equal(await realpath(root), root)

  const original = path.join(
    ownedRunRoot,
    'packaged-installed-engine/20261118/trained-noobai-eps-stack-retry-r5/native/after-restarted-close.igs',
  )
  const workspace = path.join(appData, 'workspaces/Uncategorized')
  const project = path.join(workspace, 'accepted-noobai-eps.igs')
  assert.equal(await realpath(original), original)
  assert.deepEqual(await identity(original), { path: original, ...presetSource })
  await mkdir(workspace, { recursive: true, mode: 0o700 })
  assert.equal(await realpath(workspace), workspace)
  await copyFile(original, project, constants.COPYFILE_EXCL)
  assert.deepEqual(await identity(project), { path: project, ...presetSource })
  const { ino, nlink, uid } = await lstat(project)
  assert.equal(nlink, 1)
  assert.equal(uid, process.getuid())
  assert.notEqual(ino, (await lstat(original)).ino)
  return { original, project, ino }
}

async function archivedConfiguration(filename) {
  const { stdout } = await run('unzip', ['-p', filename, 'project.json'], {
    maxBuffer: 1024 * 1024,
  })
  const project = JSON.parse(stdout)
  assert.equal(project.documentId, documentId)
  assert.equal(project.documentRevision, revision)
  assert.equal(project.title, title)
  assert.equal(project.layers.length, 1)
  const [layer] = project.layers
  assert.equal(layer.id, layerId)
  assert.equal(layer.name, layerName)
  assert.equal(layer.asset.sha256, pngSha)
  assert.equal(layer.asset.path, `assets/layers/${layerId}.png`)
  const { stdout: pixels } = await run('unzip', ['-p', filename, layer.asset.path], {
    encoding: 'buffer',
    maxBuffer: 1024 * 1024,
  })
  assert.equal(pixels.length, 119901)
  assert.equal(createHash('sha256').update(pixels).digest('hex'), pngSha)
  const recorded = layer.generationProvenance.generationConfiguration
  const draft = project.generationDraft
  assert.equal(recorded.mode, 'txt2img')
  assert.equal(recorded.model.civitaiFileId, modelFileId)
  assert.equal(recorded.model.predictionType, 'epsilon')
  assert.equal(recorded.vae.civitaiFileId, vaeFileId)
  assert.equal(recorded.loras.length, 1)
  assert.equal(recorded.loras[0].resource.civitaiFileId, loraFileId)
  assert.equal(recorded.loras[0].enabled, true)
  assert.equal(recorded.loras[0].weight, -0.5)
  assert.equal(recorded.negativePrompt.embeddingRefs.length, 1)
  assert.equal(recorded.negativePrompt.embeddingRefs[0].resource.civitaiFileId, embeddingFileId)
  assert.equal(recorded.sampling.actualSeed, 0)
  assert.deepEqual(draft.seed, { policy: 'fixed', value: 23 })
  assert.notEqual(draft.positivePrompt.text, recorded.positivePrompt.text)
  assert.deepEqual(draft.negativePrompt.embeddingRefs, [])
  assert.deepEqual(draft.loras, [])
  assert.equal(draft.vae, null)
  return { draft, recorded }
}

function readDatabase(filename) {
  const db = new Database(filename, { readonly: true, fileMustExist: true })
  try {
    return {
      projects: db
        .prepare(
          `SELECT local_project_key AS id, canonical_path AS filename,
                                   document_id AS documentId, document_revision AS revision
                            FROM project_index ORDER BY local_project_key`,
        )
        .all(),
      accepted: db
        .prepare(
          `SELECT local_project_key AS projectId, layer_id AS layerId,
                                   document_revision AS revision, model_file_sha256 AS modelSha,
                                   asset_sha256 AS pngSha, actual_seed AS seed
                            FROM project_accepted_result_index ORDER BY local_project_key, layer_id`,
        )
        .all(),
      sideEffects: db
        .prepare(
          `SELECT
        (SELECT count(*) FROM generation_queue_item) AS jobs,
        (SELECT count(*) FROM generation_candidate_receipt) AS receipts,
        (SELECT count(*) FROM generation_seed_cursor) AS seeds,
        (SELECT count(*) FROM model_resource_version) AS modelVersions`,
        )
        .get(),
      presets: db.prepare('SELECT * FROM presets ORDER BY id').all(),
    }
  } finally {
    db.close()
  }
}

async function getPort(page, name, method, ...args) {
  const reply = await page.evaluate(({ name, method, args }) => window.api[name][method](...args), {
    name,
    method,
    args,
  })
  assert.equal(
    reply.ok,
    true,
    `${name}.${method} failed: ${reply.error?.code ?? 'unexpected reply'}`,
  )
  return reply.value
}

async function openProject(state, id, { draft, recorded }) {
  const { page } = state
  const home = page.getByRole('region', { name: 'Home', exact: true })
  await home.getByRole('button', { name: `Open ${title}`, exact: true }).click()
  await expect(page.getByRole('tab', { name: title, exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  return await assertProject(state, id, { draft, recorded })
}

async function assertProject({ page }, id, { draft, recorded }) {
  const opened = await getPort(page, 'projects', 'open', id)
  assert.equal(opened.kind, 'opened')
  const { tab } = opened
  assert.equal(tab.documentId, documentId)
  assert.equal(tab.documentRevision, revision)
  assert.equal(tab.dirty, false)
  assert.equal(tab.canUndo, false)
  assert.equal(tab.canRedo, false)
  assert.deepEqual(tab.generationDraft, draft)
  assert.equal(tab.layers.length, 1)
  assert.equal(tab.acceptedResults.length, 1)
  assert.equal(tab.acceptedResults[0].layerId, layerId)
  assert.equal(tab.acceptedResults[0].seed, 0)
  assert.equal(tab.acceptedResults[0].modelFileSha256, recorded.model.fileSha256)
  const saved = await getPort(page, 'projects', 'getRasterPresetData', id, documentId, layerId)
  assert.equal(saved.documentId, documentId)
  assert.equal(saved.layerId, layerId)
  assert.deepEqual(saved.generationConfiguration, recorded)
}

async function layerAction(page, label) {
  await page.getByRole('button', { name: `Layer actions for ${layerName}`, exact: true }).click()
  await page.getByRole('menuitem', { name: label, exact: true }).click()
}

async function verifyComparison(page, { draft, recorded }) {
  await layerAction(page, 'Compare generation settings')
  const compare = page.getByRole('dialog', { name: 'Compare generation settings', exact: true })
  await expect(compare.getByText('Generated with', { exact: true })).toBeVisible()
  await expect(compare.getByText('Current Canvas', { exact: true })).toBeVisible()
  const setting = (key) => compare.locator(`[data-setting="${key}"]`)
  const values = (key) => setting(key).locator('.comparison-values > div > p')
  await expect(setting('seed.actual')).toHaveAttribute('data-status', 'Changed')
  await expect(values('seed.actual')).toHaveText(['0', '23'])
  await expect(values('prompt.text')).toHaveText([
    recorded.positivePrompt.text,
    draft.positivePrompt.text,
  ])
  await expect(values('negativePrompt.text')).toHaveText([
    recorded.negativePrompt.text,
    draft.negativePrompt.text,
  ])
  for (const [key, sha] of [
    ['model.resource', recorded.model.fileSha256],
    ['negativePrompt.embeddings', recorded.negativePrompt.embeddingRefs[0].resource.fileSha256],
    ['loras.stack', recorded.loras[0].resource.fileSha256],
    ['vae.resource', recorded.vae.fileSha256],
  ]) {
    await expect(setting(key)).toHaveAttribute('data-status', 'Missing resource')
    await expect(values(key).first()).toContainText(sha)
  }
  await expect(values('loras.stack').first()).toContainText('Weight -0.5')
  await expect(values('noiseProfile.timestepSpacing')).toHaveText([
    'leading',
    'Unavailable for the current exact checkpoint',
  ])
  await expect(setting('context.mode')).toHaveAttribute('data-status', 'Unavailable')
  await expect(values('context.mode')).toHaveText([
    'txt2img',
    'The current generation mode is unavailable. The image worker could not compose this Canvas.',
  ])
  await compare
    .getByRole('button', { name: 'Close generation settings comparison', exact: true })
    .click()
  await expect(compare).toBeHidden()
}

function managerFor(page) {
  return page.getByRole('dialog', { name: 'Preset Manager', exact: true })
}

async function expectEditorPrompts(manager, { positivePrompt, negativePrompt }) {
  await manager
    .locator('[data-preset-section="negativePrompt"]')
    .getByText('Negative Prompt', { exact: true })
    .click()
  for (const [label, prompt] of [
    ['Preset prompt', positivePrompt],
    ['Preset negative prompt', negativePrompt],
  ]) {
    await expect(
      manager.getByRole('textbox', { exact: true, name: label }).locator('.cm-line'),
    ).toHaveText([prompt.text])
  }
}

async function openResultDraft(page, recorded) {
  await layerAction(page, 'Save Preset from Result')
  const manager = managerFor(page)
  const source = manager.getByRole('alert', { name: 'Source result', exact: true })
  await expect(source).toContainText(title)
  await expect(source).toContainText(layerName)
  await expect(source).toContainText('expanded prompts')
  await expect(source).toContainText('Seed is not included by default')
  await expect(manager.getByLabel('Preset workflow', { exact: true })).toContainText(
    'Text to Image',
  )
  await expect(
    manager.getByRole('checkbox', { name: 'Include Seed', exact: true }),
  ).not.toBeChecked()
  await expectEditorPrompts(manager, recorded)
  return manager.getByLabel('Preset editor actions', { exact: true })
}

function verifyPreset(result, recorded) {
  assert.equal(result.name, presetName)
  assert.equal(result.workflow_type, 'txt2img')
  assert.equal(result.favorite, 0)
  assert.equal(result.deleted_at, null)
  assert.deepEqual(JSON.parse(result.tags_json), ['result'])
  // An exact allowlist from the portable preset contract, independent of the app mapper.
  // No seed, batch, execution identities, regions, geometry, or denoising for TXT.
  const expected = {
    cfgRescale: 0,
    guidance: { cfgScale: 4, steps: 3 },
    loras: recorded.loras,
    model: {
      ...recorded.model,
      noiseProfile: {
        baseSchedule: 'sdxl-scaled-linear-v1',
        rescaleBetasZeroSnr: false,
        schemaVersion: 1,
        timestepSpacing: 'leading',
      },
    },
    negativePrompt: recorded.negativePrompt,
    prompt: recorded.positivePrompt,
    sampling: { sampler: 'Euler', scheduler: 'Normal' },
    size: { width: 256, height: 256 },
    vae: recorded.vae,
    vaePrecision: 'Auto',
  }
  assert.deepEqual(JSON.parse(result.payload_json), expected)
  return expected
}

export async function runPackagedNoobaiResultPreset({
  root,
  appData,
  ownedRunRoot,
  launch,
  readPorts,
  closeNormally,
  retainOwnStore,
  identity,
}) {
  const source = await stageProject({ root, appData, ownedRunRoot, identity })
  const configuration = await archivedConfiguration(source.original)
  const { recorded } = configuration
  const database = path.join(appData, 'database/app.sqlite')
  const first = await launch('result-preset-source')
  const ports = await readPorts(first)
  assert.deepEqual(ports.presets.value, [])
  assert.deepEqual(ports.catalog.value, [])
  assert.equal(ports.runtime.value.kind, 'not-installed')
  assert.equal(ports.projects.value.length, 1)
  const [{ id }] = ports.projects.value
  await openProject(first, id, configuration)
  const expectedStorage = {
    projects: [{ id, filename: source.project, documentId, revision }],
    accepted: [
      { projectId: id, layerId, revision, modelSha: recorded.model.fileSha256, pngSha, seed: 0 },
    ],
    sideEffects: { jobs: 0, receipts: 0, seeds: 0, modelVersions: 0 },
    presets: [],
  }
  const assertUnchanged = async (state, presets = []) => {
    await assertProject(state, id, configuration)
    assert.deepEqual(readDatabase(database), { ...expectedStorage, presets })
    assert.deepEqual(await identity(source.original), { path: source.original, ...presetSource })
    assert.deepEqual(await identity(source.project), { path: source.project, ...presetSource })
    assert.equal((await lstat(source.project)).ino, source.ino)
  }
  await verifyComparison(first.page, configuration)
  await assertUnchanged(first)

  const cancelFooter = await openResultDraft(first.page, recorded)
  await managerFor(first.page)
    .getByRole('textbox', { name: 'Preset name', exact: true })
    .fill('Canceled accepted Raster draft')
  assert.deepEqual(readDatabase(database).presets, [])
  await cancelFooter.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(managerFor(first.page)).toBeHidden()
  await assertUnchanged(first)

  const createFooter = await openResultDraft(first.page, recorded)
  await managerFor(first.page)
    .getByRole('textbox', { name: 'Preset name', exact: true })
    .fill(presetName)
  assert.deepEqual(readDatabase(database).presets, [])
  await createFooter.getByRole('button', { name: 'Create Preset', exact: true }).click()
  await expect(
    managerFor(first.page).getByRole('article', { name: `Preset ${presetName}`, exact: true }),
  ).toBeVisible()
  const rows = readDatabase(database).presets
  assert.equal(rows.length, 1)
  const expectedPayload = verifyPreset(rows[0], recorded)
  const portPresets = await getPort(first.page, 'presets', 'list')
  assert.equal(portPresets.length, 1)
  assert.equal(portPresets[0].id, rows[0].id)
  assert.deepEqual(portPresets[0].payload, expectedPayload)
  await managerFor(first.page)
    .getByRole('button', { name: 'Close Preset Manager', exact: true })
    .click()
  await expect(managerFor(first.page)).toBeHidden()
  await assertUnchanged(first, rows)
  await closeNormally(first)
  const saved = await retainOwnStore('after-created-preset')

  const second = await launch('result-preset-restart')
  assert.deepEqual(await getPort(second.page, 'presets', 'list'), portPresets)
  assert.deepEqual(await getPort(second.page, 'models', 'getCatalog'), [])
  assert.equal((await getPort(second.page, 'runtime', 'getStatus')).kind, 'not-installed')
  await second.page
    .getByRole('region', { name: 'Home', exact: true })
    .getByRole('button', { name: 'Manage Presets', exact: true })
    .click()
  const manager = managerFor(second.page)
  await manager.getByRole('button', { name: `Select preset ${presetName}`, exact: true }).click()
  await expect(manager.getByRole('textbox', { name: 'Preset name', exact: true })).toHaveValue(
    presetName,
  )
  await expect(manager.getByRole('alert', { name: 'Source result', exact: true })).toHaveCount(0)
  await expectEditorPrompts(manager, recorded)
  await manager.getByRole('button', { name: 'Close Preset Manager', exact: true }).click()
  await expect(manager).toBeHidden()
  await openProject(second, id, configuration)
  await verifyComparison(second.page, configuration)
  await assertUnchanged(second, rows)
  await closeNormally(second)
  const restarted = await retainOwnStore('after-preset-restart')
  assert.deepEqual(readDatabase(database), { ...expectedStorage, presets: rows })

  return {
    saved,
    restarted,
    packagedNoobaiResultPreset: {
      original: { path: source.original, ...presetSource },
      documentId,
      revision,
      layerId,
      pngSha,
      presetId: rows[0].id,
      presetName,
      recordedSeed: 0,
      currentSeed: 23,
      resourceFileIds: [modelFileId, vaeFileId, loraFileId, embeddingFileId],
      canceledDraftAllocatedRows: 0,
      storedPresetRows: 1,
      assertUnchangedStore: expectedStorage.sideEffects,
      runtime: 'not-installed',
      normalPhysicalExits: 2,
    },
  }
}
