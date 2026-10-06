/**
 * Opt-in trained-model qualification through built Electron, real IPC/Main, installed worker,
 * durable queue/staging, explicit Add and portable Save/reopen. Catalog files are prepared
 * preconditions; this does not qualify CivitAI download, the release installer or model quality.
 * Run with tsx, --fixture <absolute JSON file>. Never part of the ordinary lightweight smoke
 * suite.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import {
  constants,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'

import { _electron as electron, expect as baseExpect } from '@playwright/test'

import { openAppDatabase } from '../src/main/db/database.ts'
import { ModelRepository } from '../src/main/models/model-repository.ts'
import {
  ANIMA_QWEN3_0_6B_ENCODER,
  ANIMA_QWEN_IMAGE_VAE,
} from '../src/main/models/anima-manifest.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'

assert.deepEqual(process.argv.slice(2, 3), ['--fixture'])
assert.ok(
  process.argv.length === 4 || (process.argv.length === 5 && process.argv[4] === '--resume'),
)
const resume = process.argv[4] === '--resume'
const expect = baseExpect.configure({ timeout: 120_000 })
const runId = Date.now().toString(36)
assert.ok(path.isAbsolute(process.argv[3]))
const fixture = JSON.parse(await readFile(process.argv[3], 'utf8'))
const cfgRescaleProfile = fixture.profile === 'cfg-rescale'
assert.equal(fixture.schemaVersion, 1)
for (const value of [fixture.appData, fixture.artifacts]) {
  assert.equal(typeof value, 'string')
  assert.ok(path.isAbsolute(value))
  assert.equal(path.normalize(value), value)
}
assert.equal(path.basename(fixture.appData), 'imagegen-studio')
const fixtureRoot = path.dirname(path.dirname(fixture.appData))
assert.equal(path.basename(path.dirname(fixture.appData)), 'data')
assert.equal(await realpath(fixture.appData), fixture.appData)
const provision = JSON.parse(
  await readFile(path.join(fixture.appData, 'qualification-runtime.json'), 'utf8'),
)
assert.equal(provision.status, 'passed')
// The provisioner creates this marker only in a newly owned qualification directory.
// Do not seed a user's normal model catalog or accept an arbitrary active pointer.
assert.equal(provision.appData, fixture.appData)
const pointer = JSON.parse(
  await readFile(path.join(fixture.appData, 'runtime/current-runtime.json'), 'utf8'),
)
assert.equal(pointer.runtimeId, provision.runtimeId)
async function canonicalDirectory(directory) {
  const entry = await lstat(directory)
  if (!entry.isDirectory() || entry.isSymbolicLink() || (await realpath(directory)) !== directory) {
    throw new Error(`Expected a canonical directory: ${directory}`)
  }
}
async function createCanonicalDirectory(directory) {
  // Validate the parent before mkdir; recursive creation through an alias would already write
  // outside the declared destination before a subsequent realpath check could refuse it.
  await canonicalDirectory(path.dirname(directory))
  try {
    await mkdir(directory, { mode: 0o700 })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
  await canonicalDirectory(directory)
}
await createCanonicalDirectory(path.join(fixture.appData, 'models'))
await createCanonicalDirectory(fixture.artifacts)
// Exclusive creation refuses both existing evidence and symlink targets. Keep this owned file
// descriptor for every checkpoint so a replaced pathname cannot redirect later report writes.
const reportHandle = await open(path.join(fixture.artifacts, 'report.json'), 'wx', 0o600)
const report = {
  status: 'running',
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  workingTree: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }),
  appData: fixture.appData,
  runtimeId: pointer.runtimeId,
  profile: fixture.profile ?? 'default',
  models: [],
  checks: [],
  generations: [],
  pageErrors: [],
  screenshots: [],
  boundary: {
    actual:
      'Built Electron renderer/preload/Main, production model qualification and runtime leases, noneditable installed Python worker, trained CUDA models, SQLite queue/receipts, PNG staging, explicit UI Add, .igs writer/loader and close/reopen.',
    preconditions:
      'Read-only existing source weights copied and SHA-verified into isolated managed catalog; declared model family/prediction type supplied by qualification fixture. No CivitAI download or family inference claim.',
    limits: cfgRescaleProfile
      ? 'Development provisioner, not signed release installer/repair or relocatable bundle. Same-input trained txt2img CFG ablation and opaque img2img nonzero wiring/provenance use healthy installed-runtime Save/reopen. This profile does not exercise missing-runtime Save or Home preview rebuild, independently ablate img2img numerics, or establish full image-quality, maximum-resolution/VRAM or whole-MVP readiness.'
      : 'Development provisioner, not signed release installer/repair or relocatable bundle. No full image-quality, maximum-resolution/VRAM or whole-MVP claim. Healthy Save/rebuild uses the installed runtime; a neighboring missing-runtime Save must preserve accepted pixels/provenance with valid placeholder previews.',
    browser:
      'Existing native _electron system harness exercises genuine Electron IPC and the installed CUDA child. HTTP preview availability is outside this qualification.',
  },
}
async function hashFile(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}
async function checkpointEvidence(final = false) {
  try {
    const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n')
    let offset = 0
    while (offset < bytes.length) {
      const { bytesWritten } = await reportHandle.write(
        bytes,
        offset,
        bytes.length - offset,
        offset,
      )
      if (bytesWritten === 0) throw new Error('The qualification report could not be written.')
      offset += bytesWritten
    }
    await reportHandle.truncate(bytes.length)
    await reportHandle.sync()
  } finally {
    if (final) await reportHandle.close()
  }
}
async function check(name, evidence = {}) {
  report.checks.push({ name, ...evidence })
  console.log(`PASS ${name}`)
  await checkpointEvidence()
}
async function installArtifact(repository, value, id, dependencies) {
  assert.ok(path.isAbsolute(value.path))
  assert.match(value.sha256, /^[0-9a-f]{64}$/)
  const source = await lstat(value.path)
  assert.ok(source.isFile() && !source.isSymbolicLink())
  assert.equal(source.size, value.byteSize)
  const managed = path.join(fixture.appData, 'models', `qualified-${id}.safetensors`)
  if (
    resume &&
    (await lstat(managed).catch((error) => {
      if (error.code === 'ENOENT') return null
      throw error
    }))
  ) {
    assert.equal(await hashFile(managed), value.sha256)
    const existing = await repository.findExactFileDuplicate({ sha256: value.sha256 })
    assert.equal(existing?.status, 'ready')
    assert.equal(existing.managedPath, managed)
    report.models.push({ ...value, managedPath: managed, reusedQualificationPrecondition: true })
    return { resourceId: existing.resourceId, versionId: existing.versionId }
  }
  await copyFile(value.path, managed, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE)
  assert.equal(await hashFile(managed), value.sha256)
  const sourceAfter = await lstat(value.path)
  assert.deepEqual(
    [sourceAfter.size, sourceAfter.mtimeMs, sourceAfter.ctimeMs],
    [source.size, source.mtimeMs, source.ctimeMs],
  )
  report.models.push({ ...value, managedPath: managed, sourceUnchanged: true })
  const supported =
    value.type === 'qwen3_encoder' || (value.type === 'vae' && value.family === 'anima')
  return await repository.publishVerifiedInstallation({
    dependencies,
    primary: {
      file: {
        managedPath: managed,
        originalFilename: path.basename(value.path),
        sha256: value.sha256,
        sizeBytes: source.size,
        verifiedAt: new Date().toISOString(),
      },
      resource: {
        displayName: value.name,
        source: supported
          ? { kind: 'supported_dependency', key: `qualification-${id}` }
          : { kind: 'civitai', modelId: id },
        sourceMetadata: { qualificationPrecondition: true },
        type: value.type,
      },
      version: {
        baseModelFamily: value.family,
        format: 'safetensors',
        name: 'Exact local qualification weights',
        predictionType: value.predictionType ?? null,
        source: supported
          ? {
              kind: 'supported_dependency',
              expectedSha256: value.sha256,
              revision: 'qualification-local-v1',
            }
          : { kind: 'civitai', expectedSha256: value.sha256, versionId: id + 1, fileId: id + 2 },
        sourceMetadata: { qualificationPrecondition: true },
      },
    },
  })
}
let application
let window
let database
let mainLog
const env = {
  ...process.env,
  NODE_ENV: 'production',
  XDG_DATA_HOME: path.join(fixtureRoot, 'data'),
  XDG_CONFIG_HOME: path.join(fixtureRoot, 'config'),
  XDG_CACHE_HOME: path.join(fixtureRoot, 'cache'),
}
for (const name of [
  'ELECTRON_RUN_AS_NODE',
  'IMAGEGEN_TEST_IMAGE_WORKER',
  'IMAGEGEN_DEV_SERVER_URL',
  'PYTHONPATH',
  'PYTHONHOME',
])
  delete env[name]
async function api(method, ...args) {
  const result = await window.evaluate(({ method, args }) => window.api.projects[method](...args), {
    method,
    args,
  })
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}
async function tab(project) {
  const result = await api('open', project.id)
  assert.equal(result.kind, 'opened')
  return result.tab
}
async function setInput(label, value) {
  const input = window.locator(`input[aria-label="${label}"]`)
  await input.fill(String(value))
  await input.press('Tab')
}
async function captureScreenshot(file, surface = null) {
  // Naive popovers/collapse panels can be visible while their finite entrance transition runs.
  // Observe actual completion and painted frames; leave infinite loading animations in place.
  await window.evaluate(async () => {
    const animations = document
      .getAnimations()
      .filter(
        (animation) =>
          (animation.playState === 'running' || animation.pending) &&
          Number.isFinite(animation.effect?.getComputedTiming().endTime),
      )
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)))
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  if (surface) {
    await expect
      .poll(async () =>
        surface.evaluate((element) => {
          for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
            if (Number(getComputedStyle(ancestor).opacity) !== 1) return false
          }
          return true
        }),
      )
      .toBe(true)
  }
  await window.screenshot({ path: file })
}
async function setCfgRescale(project, value) {
  const input = window.locator('input[aria-label="CFG Rescale"]')
  if (!(await input.isVisible())) {
    await window.getByText('Advanced Options', { exact: true }).click()
  }
  await expect(input).toBeEnabled({ timeout: 180_000 })
  if (value === null) {
    // Exercise the actual Reset action and distinguish absent draft data from displayed zero.
    await setInput('CFG Rescale', 0.3)
    await expect.poll(async () => (await tab(project)).generationDraft.cfgRescale).toBe(0.3)
    await window.getByRole('button', { name: 'Reset CFG Rescale', exact: true }).click()
    await expect
      .poll(async () => Object.hasOwn((await tab(project)).generationDraft, 'cfgRescale'))
      .toBe(false)
    await expect(input).toHaveValue('0')
  } else {
    await input.fill('')
    await setInput('CFG Rescale', value)
    await expect.poll(async () => (await tab(project)).generationDraft.cfgRescale).toBe(value)
    assert.ok(Object.hasOwn((await tab(project)).generationDraft, 'cfgRescale'))
  }
}
async function compareCfgRescale(project, layer, captured, caseName) {
  const before = await tab(project)
  await window.getByRole('button', { name: `Layer actions for ${layer.name}`, exact: true }).click()
  await window.getByRole('menuitem', { name: 'Compare generation settings', exact: true }).click()
  const comparison = window.getByRole('dialog', {
    name: 'Compare generation settings',
    exact: true,
  })
  try {
    await expect(comparison).toBeVisible()
    await expect(comparison.locator('.comparison-scroll')).toHaveAttribute('aria-busy', 'false')
    const row = comparison.locator('[data-setting="cfgRescale.value"]')
    await expect(row).toHaveAttribute('data-status', 'Changed')
    await expect(row.locator('.comparison-values p')).toHaveText([String(captured), '0.2'])
    const after = await tab(project)
    assert.equal(after.documentId, before.documentId)
    assert.equal(after.canUndo, before.canUndo)
    assert.equal(after.canRedo, before.canRedo)
    assert.deepEqual(after.primaryBbox, before.primaryBbox)
    assert.deepEqual(after.generationDraft, before.generationDraft)
    assert.deepEqual(after.layers, before.layers)
    assert.equal(after.dirty, before.dirty)
    const screenshot = path.join(fixture.artifacts, `${caseName}-comparison.png`)
    await captureScreenshot(screenshot, comparison)
    report.screenshots.push(screenshot)
    return { captured, current: 0.2, status: 'Changed', screenshot }
  } finally {
    await comparison
      .getByRole('button', { name: 'Close generation settings comparison', exact: true })
      .click()
    await expect(comparison).toBeHidden()
  }
}
async function queueRows(project) {
  return await database.db
    .selectFrom('generation_queue_item')
    .selectAll()
    .where('local_project_key', '=', project.id)
    .execute()
}
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}
async function decodedImage(url) {
  const result = await window.evaluate(async (imageUrl) => {
    // CSP permits data images but intentionally forbids fetch(data:). Local package/target bytes
    // are an inspection input; decode them directly instead of weakening the production policy.
    const inline = imageUrl.match(/^data:(image\/(?:png|webp));base64,(.+)$/)
    const response = inline ? null : await fetch(imageUrl)
    const bytes = inline
      ? Uint8Array.from(atob(inline[2]), (character) => character.charCodeAt(0))
      : new Uint8Array(await response.arrayBuffer())
    const image = new Image()
    // Decode the exact fetched bytes as a local image. Custom app protocols are a distinct origin
    // from the renderer; drawing their URL directly intentionally taints a browser canvas.
    // The genuine protocol response/status/hash is still verified independently below.
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
    }
    image.src = `data:${inline?.[1] ?? response.headers.get('content-type')};base64,${btoa(binary)}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('The actual image could not be decoded.')
    context.drawImage(image, 0, 0)
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data
    let opaquePixels = 0
    let transparentPixels = 0
    for (let index = 3; index < rgba.length; index += 4) {
      if (rgba[index] === 255) opaquePixels += 1
      if (rgba[index] === 0) transparentPixels += 1
    }
    const pixelDigest = new Uint8Array(await crypto.subtle.digest('SHA-256', rgba))
    return {
      encoded: Array.from(bytes),
      height: image.naturalHeight,
      mime: inline?.[1] ?? response.headers.get('content-type'),
      opaquePixels,
      pixelSha256: Array.from(pixelDigest, (byte) => byte.toString(16).padStart(2, '0')).join(''),
      status: response?.status ?? 200,
      transparentPixels,
      width: image.naturalWidth,
    }
  }, url)
  const { encoded, ...metadata } = result
  return { ...metadata, bytes: encoded.length, sha256: sha256(Buffer.from(encoded)) }
}
async function layerSnapshot(layers) {
  // Main deliberately reissues revision-bound capabilities after a draft edit/import. Compare
  // every semantic layer property and the actual served bytes/pixels, rather than temporary URLs.
  return await Promise.all(
    layers.map(async ({ imageUrl, ...layer }) => {
      // Layer capabilities intentionally permit images, not renderer Fetch. Read their actual
      // registered handler through Main's net API; keep renderer CSP/protocol privileges intact.
      const response = await application.evaluate(async ({ net }, url) => {
        const result = await net.fetch(url)
        return {
          status: result.status,
          mime: result.headers.get('content-type'),
          bytes: Array.from(new Uint8Array(await result.arrayBuffer())),
        }
      }, imageUrl)
      assert.equal(response.status, 200)
      const image = await decodedImage(
        `data:${response.mime};base64,${Buffer.from(response.bytes).toString('base64')}`,
      )
      assert.equal(image.width, layer.width)
      assert.equal(image.height, layer.height)
      // Also load the unchanged capability through the same renderer image path as the UI. CORS
      // is already provided by this protocol; anonymous image loading keeps its canvas readable.
      const rendered = await window.evaluate(async (url) => {
        const current = new Image()
        current.crossOrigin = 'anonymous'
        current.src = url
        await current.decode()
        const canvas = document.createElement('canvas')
        canvas.width = current.naturalWidth
        canvas.height = current.naturalHeight
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) throw new Error('The layer image could not be rendered.')
        context.drawImage(current, 0, 0)
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', pixels))
        return {
          width: current.naturalWidth,
          height: current.naturalHeight,
          pixelSha256: Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join(''),
        }
      }, imageUrl)
      assert.deepEqual(rendered, {
        width: image.width,
        height: image.height,
        pixelSha256: image.pixelSha256,
      })
      return { layer, image }
    }),
  )
}
function assertNativePrompt(compiled, raw, weightedText, weight) {
  const authoredGroup = `(${weightedText}:${weight})`
  assert.ok(raw.includes(authoredGroup), 'the UI-authored explicit weight must be exercised')
  const cleanedText = raw.replace(authoredGroup, weightedText)
  const start = Array.from(raw.slice(0, raw.indexOf(authoredGroup))).length
  const end = start + Array.from(weightedText).length
  const length = Array.from(cleanedText).length
  assert.deepEqual(compiled, {
    cleanedText,
    spans: [
      ...(start === 0 ? [] : [{ end: start, start: 0, weight: 1 }]),
      { end, start, weight },
      ...(end === length ? [] : [{ end: length, start: end, weight: 1 }]),
    ],
    version: 'anima-prompt-weighting-v1',
  })
}
async function createProject(model, lora, caseName = '') {
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: 'New Project', exact: true }).first().click()
  const dialog = window.getByRole('dialog', { name: 'New Project', exact: true })
  const title = `Installed ${model.family} qualification ${runId}${caseName ? ` ${caseName}` : ''}`
  await dialog.locator('input[aria-label="Project name"]').fill(title)
  await dialog.locator('input[aria-label="Project width"]').fill(String(fixture.side))
  await dialog.locator('input[aria-label="Project height"]').fill(String(fixture.side))
  await dialog.getByRole('button', { name: 'Create Project', exact: true }).click()
  await window.getByRole('tab', { name: title, exact: true }).waitFor()
  const project = (await api('list')).find((item) => item.title === title)
  assert.ok(project)
  await setInput('Images per click', 1)
  await expect(window.locator('input[aria-label="Images per click"]')).toHaveValue('1')
  await window.locator('[aria-label="Generation model"]').click()
  await window.getByText(model.name, { exact: true }).last().click()
  await expect
    .poll(async () => (await tab(project)).generationDraft.model?.localVersionId)
    .toBe(model.installed.versionId)
  if (model.family === 'anima') {
    await window.locator('[aria-label="Anima method"]').click()
    await window.getByText('Euler', { exact: true }).last().click()
  } else {
    await window.locator('[aria-label="Sampler"]').click()
    await window.getByText('Euler a', { exact: true }).last().click()
    await window.locator('[aria-label="Scheduler"]').click()
    await window.getByText('Normal', { exact: true }).last().click()
  }
  await setInput('Steps', fixture.steps)
  await setInput('CFG scale', 4)
  const random = window.getByRole('switch', { name: 'Random seed switch' })
  if ((await random.getAttribute('aria-checked')) === 'true') await random.click()
  await setInput('Generation seed', 0)
  await window
    .getByRole('textbox', { name: 'Positive prompt', exact: true })
    .fill(
      model.family === 'anima'
        ? 'a (red:1.3) ceramic cup on a wooden table, studio photograph'
        : 'a red ceramic cup on a wooden table, studio photograph',
    )
  await window
    .getByRole('textbox', { name: 'Negative prompt', exact: true })
    .fill(model.family === 'anima' ? '(blurry:0.7), low quality' : 'blurry, low quality')
  if (lora) {
    await window.locator('[aria-label="Add LoRA"]').click()
    await window.getByText(lora.name, { exact: true }).last().click()
    await setInput(`${lora.name} weight`, -0.5)
    await expect
      .poll(async () => (await tab(project)).generationDraft.loras?.[0]?.weight)
      .toBe(-0.5)
  }
  await expect
    .poll(async () => (await tab(project)).generationDraft.sampling.steps)
    .toBe(fixture.steps)
  return project
}
async function generateAndAccept(project, family, mode, qualification = null) {
  // Images-per-click is transient UI state and resets when this script closes/reopens a tab.
  // Set the declared single-job qualification input for every click, including img2img.
  await setInput('Images per click', 1)
  await expect(window.locator('input[aria-label="Images per click"]')).toHaveValue('1')
  const before = await tab(project)
  const capturedCfgRescale = qualification?.cfgRescale ?? 0
  if (qualification) {
    assert.equal(family, 'illustrious')
    assert.equal(
      Object.hasOwn(before.generationDraft, 'cfgRescale'),
      qualification.cfgRescale !== null,
    )
    assert.equal(before.generationDraft.cfgRescale, qualification.cfgRescale ?? undefined)
    if (mode === 'txt2img') assert.deepEqual(before.layers, [])
  }
  const existingLayers = await layerSnapshot(before.layers)
  const workspaceDirectory = path.join(fixture.appData, 'workspaces/Uncategorized')
  let beforePackagePath
  for (const name of await readdir(workspaceDirectory)) {
    if (!name.endsWith('.igs')) continue
    const currentPath = path.join(workspaceDirectory, name)
    if ((await readIgsPackage(currentPath)).project.documentId === before.documentId) {
      beforePackagePath = currentPath
      break
    }
  }
  assert.ok(beforePackagePath)
  const beforePackageSha256 = await hashFile(beforePackagePath)
  const previousRows = await queueRows(project)
  const existingJobIds = new Set(previousRows.map(({ id }) => id))
  const started = Date.now()
  const button = window.getByRole('button', { name: 'Generate', exact: true })
  // These are harness observation deadlines for cold trained weights, not product timeout promises.
  await expect(button).toBeEnabled({ timeout: 180_000 })
  await button.click()
  let admitted
  await expect
    .poll(
      async () => {
        const rows = (await queueRows(project)).filter(({ id }) => !existingJobIds.has(id))
        if (rows.length === 1) admitted = rows[0]
        return rows.length
      },
      { timeout: 180_000 },
    )
    .toBe(1)
  const frozen = JSON.parse(admitted.frozen_payload_json)
  const requestedSeedPolicy = mode === 'txt2img' ? 'fixed' : 'reuse'
  assert.equal(before.generationDraft.seed.policy, requestedSeedPolicy)
  assert.equal(admitted.document_id, before.documentId)
  assert.equal(admitted.operation, `${family}-${mode}`)
  assert.equal(frozen.kind, admitted.operation)
  assert.equal(frozen.context.documentId, admitted.document_id)
  assert.equal(frozen.context.documentRevision, admitted.document_revision)
  assert.deepEqual(frozen.context.bbox, before.primaryBbox)
  assert.deepEqual(frozen.context.prompts, {
    negative: before.generationDraft.negativePrompt.text,
    positive: before.generationDraft.positivePrompt.text,
  })
  assert.equal(frozen.context.sampling.seed, 0)
  assert.equal(frozen.context.sampling.requestedSeedPolicy, requestedSeedPolicy)
  assert.equal(frozen.context.sampling.steps, fixture.steps)
  assert.equal(frozen.context.sampling.cfgScale, 4)
  assert.deepEqual(frozen.context.loraStack, before.generationDraft.loras)
  if (qualification) {
    assert.equal(frozen.context.sampling.cfgRescale, capturedCfgRescale)
    assert.equal(frozen.workerJob.sampling.cfgRescale, capturedCfgRescale)
  }
  const lora = fixture[family === 'anima' ? 'animaLora' : 'illustriousLora']
  assert.equal(frozen.context.loras.length, 1)
  assert.equal(frozen.context.loras[0].reference.fileSha256, lora.sha256)
  assert.equal(frozen.context.loras[0].weight, -0.5)
  assert.equal(frozen.workerJob.loras[0].sha256, lora.sha256)
  assert.equal(frozen.workerJob.loras[0].weight, -0.5)
  let nativePlan = null
  if (family === 'anima') {
    assert.equal(frozen.context.model.checkpoint.reference.fileSha256, fixture.anima.sha256)
    assert.equal(frozen.context.model.checkpoint.reference.predictionType, null)
    assert.equal(frozen.context.model.qwen3Encoder.sha256, fixture.encoder.sha256)
    assert.equal(frozen.context.model.vae.sha256, fixture.vae.sha256)
    assert.equal(frozen.workerJob.model.checkpoint.sha256, fixture.anima.sha256)
    assert.equal(frozen.workerJob.model.qwen3Encoder.sha256, fixture.encoder.sha256)
    assert.equal(frozen.workerJob.model.vae.sha256, fixture.vae.sha256)
    assertNativePrompt(
      frozen.workerJob.prompts.positive,
      frozen.context.prompts.positive,
      'red',
      1.3,
    )
    assertNativePrompt(
      frozen.workerJob.prompts.negative,
      frozen.context.prompts.negative,
      'blurry',
      0.7,
    )
    nativePlan = frozen.workerJob.sampling
    const startStep = mode === 'img2img' ? Math.floor(0.5 * fixture.steps) : 0
    assert.equal(frozen.context.sampling.animaMethod, 'euler')
    assert.equal(nativePlan.version, 'anima-flow-denoising-v1')
    assert.equal(nativePlan.scheduler, 'euler')
    assert.equal(nativePlan.mode, mode)
    assert.equal(nativePlan.steps, fixture.steps)
    assert.equal(nativePlan.seed, 0)
    assert.equal(nativePlan.guidanceScale, 4)
    assert.equal(nativePlan.width, fixture.side)
    assert.equal(nativePlan.height, fixture.side)
    assert.equal(nativePlan.strength, mode === 'img2img' ? 0.5 : null)
    assert.equal(nativePlan.startStep, startStep)
    assert.equal(nativePlan.totalSteps, fixture.steps - startStep)
    assert.equal(nativePlan.timesteps.length, nativePlan.totalSteps)
    assert.equal(nativePlan.sigmas.length, nativePlan.totalSteps + 1)
    assert.equal(nativePlan.sigmas.at(-1), 0)
  } else {
    assert.equal(frozen.context.model.reference.fileSha256, fixture.illustrious.sha256)
    assert.equal(frozen.context.model.reference.predictionType, fixture.illustrious.predictionType)
    assert.equal(frozen.workerJob.checkpoint.sha256, fixture.illustrious.sha256)
    assert.equal(frozen.workerJob.checkpoint.predictionType, fixture.illustrious.predictionType)
    assert.equal(frozen.context.sampling.invokeScheduler, 'euler_a')
    assert.deepEqual(frozen.workerJob.prompts, frozen.context.prompts)
  }
  if (mode === 'img2img') assert.equal(frozen.context.sampling.denoisingStrength, 0.5)
  const targetPath = path.join(fixture.appData, 'generation-inputs', admitted.id, 'target.png')
  const targetEntry = await lstat(targetPath)
  assert.ok(targetEntry.isFile() && !targetEntry.isSymbolicLink())
  const targetBytes = await readFile(targetPath)
  const targetSha256 = sha256(targetBytes)
  assert.equal(targetBytes.length, frozen.context.target.byteSize)
  assert.equal(targetSha256, frozen.context.target.sha256)
  assert.equal(targetSha256, frozen.workerJob.target.sha256)
  const target = await decodedImage(`data:image/png;base64,${targetBytes.toString('base64')}`)
  assert.equal(target.sha256, targetSha256)
  assert.equal(target.width, fixture.side)
  assert.equal(target.height, fixture.side)
  assert.equal(
    mode === 'img2img' ? target.opaquePixels : target.transparentPixels,
    fixture.side * fixture.side,
  )
  if (mode === 'img2img') {
    const previous = report.generations.findLast(
      (generation) =>
        generation.projectKey === project.id &&
        generation.family === family &&
        generation.mode === 'txt2img',
    )
    assert.ok(previous)
    assert.equal(target.pixelSha256, previous.dimensions.pixelSha256)
  }
  // Change current authoring only after durable admission; the accepted record must retain click input.
  const changedPrompt = `${before.generationDraft.positivePrompt.text}, later authoring edit`
  await window.getByRole('textbox', { name: 'Positive prompt', exact: true }).fill(changedPrompt)
  await expect
    .poll(async () => (await tab(project)).generationDraft.positivePrompt.text)
    .toBe(changedPrompt)
  let normalizedInputs = null
  if (qualification) {
    normalizedInputs = structuredClone({ context: frozen.context, workerJob: frozen.workerJob })
    // Different owned Projects require distinct identities; CFG is the sole inference ablation.
    delete normalizedInputs.context.documentId
    delete normalizedInputs.context.documentRevision
    delete normalizedInputs.context.sampling.cfgRescale
    delete normalizedInputs.workerJob.sampling.cfgRescale
    await setCfgRescale(project, 0.2)
    const editedRow = (await queueRows(project)).find(({ id }) => id === admitted.id)
    assert.equal(editedRow.frozen_payload_json, admitted.frozen_payload_json)
  }
  await expect
    .poll(
      async () => {
        const rows = await queueRows(project)
        assert.ok(
          rows.every((row) => row.status !== 'failed'),
          JSON.stringify(rows.map((row) => ({ status: row.status, error: row.error_message }))),
        )
        return (await api('listGenerationResults', project.id)).candidates.length
      },
      { timeout: 600_000, intervals: [1000, 2000, 5000] },
    )
    .toBe(1)
  const results = await api('listGenerationResults', project.id)
  const candidate = results.candidates[0]
  assert.equal(candidate.queueItemId, admitted.id)
  assert.equal(candidate.actualSeed, 0)
  assert.equal(results.lastActualSeed, 0)
  const completedTab = await tab(project)
  assert.deepEqual(
    await layerSnapshot(completedTab.layers),
    existingLayers,
    'completion must preserve all layer properties and exact image bytes/pixels',
  )
  assert.deepEqual(completedTab.primaryBbox, before.primaryBbox)
  assert.equal(completedTab.generationDraft.positivePrompt.text, changedPrompt)
  if (qualification) assert.equal(completedTab.generationDraft.cfgRescale, 0.2)
  const receipt = await database.db
    .selectFrom('generation_candidate_receipt')
    .selectAll()
    .where('candidate_id', '=', candidate.candidateId)
    .executeTakeFirstOrThrow()
  assert.equal(receipt.status, 'completed')
  assert.equal(receipt.queue_item_id, admitted.id)
  assert.equal(receipt.actual_seed, 0)
  assert.equal(receipt.frozen_payload_sha256, sha256(Buffer.from(admitted.frozen_payload_json)))
  const row = await database.db
    .selectFrom('generation_queue_item')
    .selectAll()
    .where('id', '=', candidate.queueItemId)
    .executeTakeFirstOrThrow()
  assert.equal(row.status, 'completed')
  assert.equal(row.frozen_payload_json, admitted.frozen_payload_json)
  const progress = await window.evaluate(
    (jobId) =>
      window.__installedQualificationProgress.filter(({ current }) => current.jobId === jobId),
    admitted.id,
  )
  assert.ok(progress.length > 0, 'the genuine preload must deliver actual denoising progress')
  for (let index = 0; index < progress.length; index += 1) {
    const { current, revision } = progress[index]
    assert.equal(current.documentId, before.documentId)
    assert.equal(current.projectKey, project.id)
    assert.equal(current.statusSequence, receipt.expected_status_sequence)
    assert.equal(current.statusSequence + 1, row.status_sequence)
    if (nativePlan) assert.equal(current.totalSteps, nativePlan.totalSteps)
    else assert.ok(current.totalSteps >= 1 && current.totalSteps <= 2 * fixture.steps)
    if (index > 0) {
      assert.ok(revision > progress[index - 1].revision)
      assert.ok(current.step > progress[index - 1].current.step)
      assert.equal(current.totalSteps, progress[index - 1].current.totalSteps)
    }
  }
  assert.equal(progress.at(-1).current.step, progress.at(-1).current.totalSteps)
  assert.equal(
    await hashFile(beforePackagePath),
    beforePackageSha256,
    'durable trained completion must not save or modify the .igs before explicit Add/Save',
  )
  const pixels = await decodedImage(candidate.imageUrl)
  assert.equal(pixels.status, 200)
  assert.equal(pixels.bytes, receipt.image_byte_size)
  assert.equal(pixels.sha256, receipt.image_sha256)
  assert.equal(pixels.width, fixture.side)
  assert.equal(pixels.height, fixture.side)
  assert.ok(candidate.thumbnailUrl, 'actual worker thumbnail must be published')
  const thumbnail = await decodedImage(candidate.thumbnailUrl)
  assert.equal(thumbnail.status, 200)
  assert.equal(thumbnail.mime, 'image/webp')
  assert.equal(thumbnail.sha256, new URL(candidate.thumbnailUrl).pathname.split('/').at(-2))
  assert.ok(thumbnail.bytes > 0 && thumbnail.width > 0 && thumbnail.height > 0)
  await window.getByRole('button', { name: 'Add 1 as Layer', exact: true }).click()
  await expect.poll(async () => (await tab(project)).layers.length).toBe(before.layers.length + 1)
  const accepted = await tab(project)
  const layer = accepted.layers[0]
  const acceptedData = await api(
    'getRasterGenerationData',
    project.id,
    accepted.documentId,
    layer.id,
  )
  assert.equal(acceptedData.generationConfiguration.sampling.actualSeed, 0)
  assert.equal(
    acceptedData.generationConfiguration.sampling.requestedSeedPolicy,
    requestedSeedPolicy,
  )
  assert.equal(acceptedData.generationConfiguration.model.baseModelFamily, family)
  if (qualification) {
    assert.equal(acceptedData.generationConfiguration.cfgRescale, capturedCfgRescale)
    assert.equal(accepted.generationDraft.cfgRescale, 0.2)
  }
  assert.equal(
    acceptedData.generationConfiguration.positivePrompt.text,
    before.generationDraft.positivePrompt.text,
  )
  assert.equal(acceptedData.generationConfiguration.loras[0].weight, -0.5)
  assert.equal(acceptedData.generationConfiguration.loras[0].resource.fileSha256, lora.sha256)
  assert.equal(
    acceptedData.generationConfiguration.negativePrompt.text,
    frozen.context.prompts.negative,
  )
  assert.equal(accepted.generationDraft.positivePrompt.text, changedPrompt)
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await tab(project)).dirty).toBe(false)
  const directory = path.join(fixture.appData, 'workspaces/Uncategorized')
  let saved
  let packagePath
  for (const name of await readdir(directory)) {
    if (!name.endsWith('.igs')) continue
    const currentPath = path.join(directory, name)
    const current = await readIgsPackage(currentPath)
    if (current.project.documentId === accepted.documentId) {
      saved = current
      packagePath = currentPath
      break
    }
  }
  assert.ok(saved)
  const provenance = saved.project.layers[0].generationProvenance
  assert.equal(provenance.kind, `${family}-${mode}`)
  assert.deepEqual(provenance.generationConfiguration, acceptedData.generationConfiguration)
  assert.equal(provenance.executionResultContext.output.sha256, receipt.image_sha256)
  assert.equal(provenance.executionResultContext.output.byteSize, receipt.image_byte_size)
  assert.equal(provenance.executionResultContext.queueItemId, admitted.id)
  assert.equal(provenance.executionResultContext.candidateId, candidate.candidateId)
  assert.equal(provenance.layerSourceContext.sourceDocumentId, before.documentId)
  assert.equal(provenance.layerSourceContext.sourceDocumentRevision, admitted.document_revision)
  assert.equal(provenance.layerSourceContext.sourceTargetSha256, targetSha256)
  assert.deepEqual(provenance.layerSourceContext.bbox, before.primaryBbox)
  assert.equal(provenance.generationConfiguration.model.fileSha256, fixture[family].sha256)
  if (family === 'anima') {
    const config = provenance.generationConfiguration
    assert.equal(config.sampling.animaMethod, 'euler')
    assert.equal(config.model.predictionType, null)
    assert.equal(config.anima.architecture, 'anima-base-1.0')
    assert.equal(config.anima.checkpointByteSize, fixture.anima.byteSize)
    for (const [key, item] of [
      ['qwen3Encoder', fixture.encoder],
      ['vae', fixture.vae],
    ]) {
      assert.deepEqual(config.anima[key], {
        byteSize: item.byteSize,
        localModelId: item.installed.resourceId,
        localVersionId: item.installed.versionId,
        sha256: item.sha256,
      })
    }
  }
  if (mode === 'img2img')
    assert.equal(provenance.generationConfiguration.sampling.denoisingStrength, 0.5)
  const savedLayer = saved.project.layers.find(({ id }) => id === layer.id)
  assert.ok(savedLayer)
  assert.equal(sha256(await saved.readMember(savedLayer.asset.path)), receipt.image_sha256)
  assert.equal(savedLayer.asset.bytes, receipt.image_byte_size)
  assert.equal(savedLayer.asset.sha256, receipt.image_sha256)
  assert.equal(saved.manifest.preview.status, 'rendered')
  assert.deepEqual(saved.manifest.preview.rect, before.primaryBbox)
  const mergedPreviewBytes = await saved.readMember('preview/merged.png')
  const mergedPreview = await decodedImage(
    `data:image/png;base64,${mergedPreviewBytes.toString('base64')}`,
  )
  assert.equal(mergedPreview.pixelSha256, pixels.pixelSha256)
  const previewThumbnailBytes = await saved.readMember('preview/thumbnail.webp')
  const previewThumbnail = await decodedImage(
    `data:image/webp;base64,${previewThumbnailBytes.toString('base64')}`,
  )
  assert.ok(previewThumbnail.bytes > 0 && previewThumbnail.width > 0 && previewThumbnail.height > 0)
  assert.equal(saved.project.lastActualSeedSnapshot, 0)
  assert.equal(saved.project.generationDraft.positivePrompt.text, changedPrompt)
  if (qualification) {
    assert.equal(provenance.generationConfiguration.cfgRescale, capturedCfgRescale)
    assert.equal(saved.project.generationDraft.cfgRescale, 0.2)
  }
  await window.getByRole('button', { name: `Close ${project.title}`, exact: true }).click()
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: `Open ${project.title}`, exact: true }).click()
  await window.getByRole('tab', { name: project.title, exact: true }).waitFor()
  const reopened = await tab(project)
  assert.equal(reopened.generationDraft.positivePrompt.text, changedPrompt)
  if (qualification) assert.equal(reopened.generationDraft.cfgRescale, 0.2)
  assert.deepEqual(
    (await api('getRasterGenerationData', project.id, reopened.documentId, layer.id))
      .generationConfiguration,
    provenance.generationConfiguration,
  )
  const reopenedPackage = await readIgsPackage(packagePath)
  assert.deepEqual(
    reopenedPackage.project.layers.find(({ id }) => id === layer.id).generationProvenance,
    provenance,
  )
  assert.equal(
    sha256(await reopenedPackage.readMember(savedLayer.asset.path)),
    receipt.image_sha256,
  )
  if (qualification) {
    const input = window.locator('input[aria-label="CFG Rescale"]')
    if (!(await input.isVisible())) {
      await window.getByText('Advanced Options', { exact: true }).click()
    }
    await expect(input).toHaveValue('0.2')
  }
  const caseName = qualification?.caseName ?? `${family}-${mode}`
  const screenshot = path.join(fixture.artifacts, `${caseName}.png`)
  await captureScreenshot(screenshot)
  report.screenshots.push(screenshot)
  const comparison = qualification
    ? await compareCfgRescale(
        project,
        reopened.layers.find(({ id }) => id === layer.id),
        capturedCfgRescale,
        caseName,
      )
    : null
  report.generations.push({
    family,
    mode,
    projectKey: project.id,
    queueItemId: row.id,
    candidateId: candidate.candidateId,
    elapsedMs: Date.now() - started,
    outputSha256: receipt.image_sha256,
    outputBytes: receipt.image_byte_size,
    dimensions: pixels,
    existingLayers,
    thumbnail,
    target: { ...target, path: targetPath },
    nativePlan,
    progress,
    requestedSeedPolicy,
    mergedPreview,
    previewThumbnail,
    provenance,
    packagePath,
    previewState: saved.manifest.preview,
    qualification: qualification
      ? {
          caseName,
          authoredCfgRescale: qualification.cfgRescale,
          capturedCfgRescale,
          currentCfgRescale: reopened.generationDraft.cfgRescale,
          normalizedInputs,
          comparison,
        }
      : null,
  })
  await check(
    `${qualification?.caseName ?? `${family} ${mode}`}: UI Generate -> trained installed worker -> staging -> explicit Add -> Save/reopen${qualification ? '/comparison' : ''}`,
    { queueItemId: row.id },
  )
}
async function prepareImg2Img(project) {
  // Make the previous manual value observably different from the actual completed seed.
  await setInput('Generation seed', 123)
  await expect.poll(async () => (await tab(project)).generationDraft.seed.value).toBe(123)
  await window.getByRole('button', { name: 'Reuse last seed', exact: true }).click()
  await expect.poll(async () => (await tab(project)).generationDraft.seed.policy).toBe('reuse')
  await expect(window.locator('input[aria-label="Generation seed"]')).toHaveValue('0')
  await expect(window.locator('input[aria-label="Denoising Strength"]')).toBeVisible({
    timeout: 90_000,
  })
  await setInput('Denoising Strength', 0.5)
  await expect
    .poll(async () => (await tab(project)).generationDraft.sampling.denoisingStrength)
    .toBe(0.5)
}
async function qualifyCfgRescale() {
  let nonneutralProject
  for (const [caseName, cfgRescale] of [
    ['illustrious-txt2img-cfg-unset', null],
    ['illustrious-txt2img-cfg-zero', 0],
    ['illustrious-txt2img-cfg-nonneutral', 0.7],
  ]) {
    const project = await createProject(fixture.illustrious, fixture.illustriousLora, caseName)
    await setCfgRescale(project, cfgRescale)
    const screenshot = path.join(fixture.artifacts, `${caseName}-authored.png`)
    await captureScreenshot(screenshot)
    report.screenshots.push(screenshot)
    await generateAndAccept(project, 'illustrious', 'txt2img', { caseName, cfgRescale })
    if (cfgRescale === 0.7) nonneutralProject = project
  }
  const [unset, zero, nonneutral] = report.generations
  for (const generation of [zero, nonneutral]) {
    assert.deepEqual(
      generation.qualification.normalizedInputs,
      unset.qualification.normalizedInputs,
    )
    assert.equal(generation.target.pixelSha256, unset.target.pixelSha256)
  }
  assert.equal(
    zero.dimensions.pixelSha256,
    unset.dimensions.pixelSha256,
    'Unset and explicit zero must produce identical decoded RGBA for the same frozen inputs.',
  )
  assert.notEqual(
    nonneutral.dimensions.pixelSha256,
    zero.dimensions.pixelSha256,
    'CFG Rescale 0.7 must change decoded RGBA relative to zero for the same frozen inputs.',
  )
  await check(
    'Same-input trained txt2img decoded RGBA: unset equals zero; CFG Rescale 0.7 changes pixels',
    {
      inputs: unset.qualification.normalizedInputs,
      targetPixelSha256: unset.target.pixelSha256,
      unsetPixelSha256: unset.dimensions.pixelSha256,
      zeroPixelSha256: zero.dimensions.pixelSha256,
      nonneutralPixelSha256: nonneutral.dimensions.pixelSha256,
    },
  )
  assert.ok(nonneutralProject)
  await setCfgRescale(nonneutralProject, 0.7)
  await prepareImg2Img(nonneutralProject)
  await generateAndAccept(nonneutralProject, 'illustrious', 'img2img', {
    caseName: 'illustrious-img2img-cfg-nonneutral',
    cfgRescale: 0.7,
  })
  assert.equal(report.generations.length, 4)
  report.cfgRescaleBoundary =
    'Trained installed same-input txt2img CFG ablation plus opaque img2img nonzero frozen input, Add, Save/reopen and comparison. The img2img case establishes wiring/provenance, not an independent numerical ablation or release-runtime readiness.'
}
async function qualifyMissingRuntimeSaveAndRebuild(project) {
  const latest = report.generations.at(-1)
  assert.ok(latest && latest.family === 'anima' && latest.mode === 'img2img')
  const before = await tab(project)
  const original = await readIgsPackage(latest.packagePath)
  const pointerFile = path.join(fixture.appData, 'runtime/current-runtime.json')
  const heldPointerFile = path.join(
    fixture.appData,
    `runtime/qualification-held-pointer-${process.pid}.json`,
  )
  assert.equal(await lstat(heldPointerFile).catch(() => null), null)
  const pointerBytes = await readFile(pointerFile)
  assert.deepEqual(JSON.parse(pointerBytes.toString('utf8')), pointer)
  await rename(pointerFile, heldPointerFile)
  let fallback
  let fallbackProjectJson
  try {
    const unavailable = await window.evaluate(() => window.api.runtime.getStatus())
    assert.equal(unavailable.ok, true, JSON.stringify(unavailable))
    assert.notEqual(unavailable.value.kind, 'ready')
    const changedPrompt = `${before.generationDraft.positivePrompt.text}, worker unavailable edit`
    await window.getByRole('textbox', { name: 'Positive prompt', exact: true }).fill(changedPrompt)
    await window.getByRole('textbox', { name: 'Negative prompt', exact: true }).focus()
    await expect
      .poll(async () => (await tab(project)).generationDraft.positivePrompt.text)
      .toBe(changedPrompt)
    const save = window.getByRole('button', { name: 'Save Project', exact: true })
    await expect(save).toBeEnabled({ timeout: 90_000 })
    await save.click()
    await expect.poll(async () => (await tab(project)).dirty, { timeout: 90_000 }).toBe(false)
    // Main's durable Save settles before renderer refreshes and clears its pending action. Home
    // switching is deliberately refused during that UI action; observe its actual completion.
    await expect(save).toBeEnabled({ timeout: 90_000 })
    fallback = await readIgsPackage(latest.packagePath)
    fallbackProjectJson = await fallback.readMember('project.json')
    assert.equal(fallback.manifest.preview.status, 'unavailable')
    assert.equal(fallback.project.generationDraft.positivePrompt.text, changedPrompt)
    assert.deepEqual(fallback.project.layers, original.project.layers)
    for (const layer of fallback.project.layers) {
      assert.equal(sha256(await fallback.readMember(layer.asset.path)), layer.asset.sha256)
    }
    assert.deepEqual(
      await fallback.readMember('preview/merged.png'),
      await readFile('dist/main/placeholders/unavailable.png'),
    )
    assert.deepEqual(
      await fallback.readMember('preview/thumbnail.webp'),
      await readFile('dist/main/placeholders/unavailable.webp'),
    )
    await check(
      'Missing installed runtime: actual UI Save keeps edited Project and accepted bytes/provenance',
      {
        documentId: before.documentId,
        packagePath: latest.packagePath,
        preview: fallback.manifest.preview,
        runtime: unavailable.value,
      },
    )
  } finally {
    // Only this disposable owned fixture pointer is touched; restore it even after failed assertions.
    assert.equal(await lstat(pointerFile).catch(() => null), null)
    await rename(heldPointerFile, pointerFile)
    assert.deepEqual(await readFile(pointerFile), pointerBytes)
  }
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  const rebuild = window.getByRole('button', {
    name: `Rebuild preview for ${project.title}`,
    exact: true,
  })
  await expect(rebuild).toBeEnabled({ timeout: 90_000 })
  await rebuild.click()
  await expect
    .poll(async () => (await api('list')).find(({ id }) => id === project.id)?.previewStatus, {
      timeout: 180_000,
    })
    .toBe('rendered')
  const rebuilt = await readIgsPackage(latest.packagePath)
  assert.equal(rebuilt.manifest.preview.status, 'rendered')
  assert.deepEqual(await rebuilt.readMember('project.json'), fallbackProjectJson)
  for (const layer of rebuilt.project.layers) {
    assert.equal(sha256(await rebuilt.readMember(layer.asset.path)), layer.asset.sha256)
  }
  const mergedBytes = await rebuilt.readMember('preview/merged.png')
  const merged = await decodedImage(`data:image/png;base64,${mergedBytes.toString('base64')}`)
  assert.equal(merged.pixelSha256, latest.dimensions.pixelSha256)
  const screenshot = path.join(fixture.artifacts, 'installed-runtime-preview-rebuild.png')
  await captureScreenshot(screenshot)
  report.screenshots.push(screenshot)
  await check('Restored installed runtime: actual Home Rebuild Preview changes derivatives only', {
    documentId: before.documentId,
    packagePath: latest.packagePath,
    preview: rebuilt.manifest.preview,
    merged,
  })
}
async function qualifyInstalledImport(project) {
  const latest = report.generations.at(-1)
  const savedBefore = await readIgsPackage(latest.packagePath)
  const sourceLayer = savedBefore.project.layers[0]
  const importPath = path.join(fixture.artifacts, 'import-source.png')
  await writeFile(importPath, await savedBefore.readMember(sourceLayer.asset.path), { flag: 'wx' })
  await window.getByRole('button', { name: `Open ${project.title}`, exact: true }).click()
  await window.getByRole('tab', { name: project.title, exact: true }).waitFor()
  const before = await tab(project)
  const existingLayers = await layerSnapshot(before.layers)
  // Only the nondeterministic OS file chooser is controlled. UI, Main import/normalization,
  // installed CPU worker, document mutation and package writer/loader remain genuine.
  await application.evaluate(({ dialog }, selectedPath) => {
    globalThis.__qualificationOpenDialog = dialog.showOpenDialog
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] })
  }, importPath)
  try {
    await window.getByRole('button', { name: 'Import image as Raster Layer', exact: true }).click()
    await expect.poll(async () => (await tab(project)).layers.length).toBe(before.layers.length + 1)
  } finally {
    await application.evaluate(({ dialog }) => {
      dialog.showOpenDialog = globalThis.__qualificationOpenDialog
      delete globalThis.__qualificationOpenDialog
    })
  }
  const imported = await tab(project)
  assert.deepEqual(imported.primaryBbox, before.primaryBbox)
  assert.equal(imported.layers[0].transform.x, before.primaryBbox.x)
  assert.equal(imported.layers[0].transform.y, before.primaryBbox.y)
  assert.deepEqual(
    await layerSnapshot(imported.layers.slice(1)),
    existingLayers,
    'import must preserve previous layer properties and exact image bytes/pixels',
  )
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await tab(project)).dirty).toBe(false)
  const saved = await readIgsPackage(latest.packagePath)
  assert.equal(saved.manifest.preview.status, 'rendered')
  assert.equal(saved.project.layers[0].generationProvenance, undefined)
  assert.equal(saved.project.lastActualSeedSnapshot, 0)
  assert.deepEqual(saved.project.layers.slice(1), savedBefore.project.layers)
  const normalized = await decodedImage(
    `data:image/png;base64,${(await saved.readMember(saved.project.layers[0].asset.path)).toString('base64')}`,
  )
  assert.equal(normalized.pixelSha256, latest.dimensions.pixelSha256)
  await check(
    'Installed CPU worker: UI Raster import at bbox origin -> normalized pixels -> Save',
    {
      controlled: 'OS chooser returns the recorded real PNG source only',
      importedLayerId: imported.layers[0].id,
      existingLayers,
      normalized,
      preview: saved.manifest.preview,
    },
  )
}
try {
  assert.ok(
    !Object.hasOwn(fixture, 'profile') || fixture.profile === 'cfg-rescale',
    'Qualification profile must be omitted or exactly cfg-rescale.',
  )
  assert.ok(
    Number.isInteger(fixture.side) &&
      fixture.side >= 64 &&
      fixture.side <= 2048 &&
      fixture.side % 8 === 0,
    'Qualification image side must be an integer multiple of 8 from 64 to 2048.',
  )
  assert.ok(Number.isInteger(fixture.steps) && fixture.steps >= 1 && fixture.steps <= 200)
  if (cfgRescaleProfile) {
    assert.equal(fixture.steps, 3, 'CFG Rescale qualification requires exactly 3 authored steps.')
  }
  const families = cfgRescaleProfile ? ['illustrious'] : ['illustrious', 'anima']
  const allModelKeys = ['encoder', 'vae', 'anima', 'illustrious', 'animaLora', 'illustriousLora']
  const modelKeys = cfgRescaleProfile ? ['illustrious', 'illustriousLora'] : allModelKeys
  for (const family of families) {
    assert.equal(fixture[family]?.type, 'checkpoint')
    assert.equal(fixture[family]?.family, family)
    const lora = fixture[family === 'anima' ? 'animaLora' : 'illustriousLora']
    assert.equal(lora?.type, 'lora', 'this qualification requires one real LoRA for each family')
    assert.equal(lora.family, family)
  }
  report.sourceSha256 = {
    script: await hashFile('scripts/qualify-installed-generation.mjs'),
    workerLock: await hashFile('worker-python/uv.lock'),
  }
  report.bundleSha256 = Object.fromEntries(
    await Promise.all(
      [
        'dist/main/main.cjs',
        'dist/preload/preload.cjs',
        'dist/renderer/index.html',
        ...(await readdir('dist/renderer/assets'))
          .filter((name) => /\.(js|css)$/.test(name))
          .map((name) => `dist/renderer/assets/${name}`),
      ].map(async (file) => [file, await hashFile(file)]),
    ),
  )
  database = openAppDatabase(fixture.appData, path.resolve('src/main/db/migrations'))
  const repository = new ModelRepository(database.db)
  const catalog = await repository.listInstalled()
  if (!resume) assert.equal(catalog.length, 0, 'qualification catalog must initially be empty')
  else {
    // A CFG fixture may declare the previous six-resource qualification catalog while executing
    // only Illustrious. Unlisted installed identities still refuse; no extra resources are copied.
    const hashes = new Set(
      allModelKeys.filter((key) => fixture[key]).map((key) => fixture[key].sha256),
    )
    assert.ok(
      catalog.every((model) => model.versions.every((version) => hashes.has(version.file.sha256))),
      'resume may only reuse the same isolated qualification catalog',
    )
  }
  if (!cfgRescaleProfile) {
    for (const [key, pin] of [
      ['encoder', ANIMA_QWEN3_0_6B_ENCODER],
      ['vae', ANIMA_QWEN_IMAGE_VAE],
    ]) {
      assert.equal(fixture[key].sha256, pin.sha256)
      assert.equal(fixture[key].byteSize, pin.sizeBytes)
    }
    const encoder = await installArtifact(repository, fixture.encoder, 700_010)
    const vae = await installArtifact(repository, fixture.vae, 700_020)
    fixture.encoder.installed = encoder
    fixture.vae.installed = vae
    fixture.anima.installed = await installArtifact(repository, fixture.anima, 700_030, [
      { role: 'qwen3_encoder', existingVersionId: encoder.versionId },
      { role: 'vae', existingVersionId: vae.versionId },
    ])
  }
  fixture.illustrious.installed = await installArtifact(repository, fixture.illustrious, 700_040)
  for (const [key, id] of [
    ['animaLora', 700_050],
    ['illustriousLora', 700_060],
  ]) {
    if (modelKeys.includes(key) && fixture[key])
      fixture[key].installed = await installArtifact(repository, fixture[key], id)
  }
  await check('Real exact model files copied, verified and cataloged; source weights unchanged')
  application = await electron.launch({ args: ['.'], cwd: process.cwd(), env })
  mainLog = createWriteStream(path.join(fixture.artifacts, 'electron-main.log'), { flags: 'wx' })
  application.process().stderr.pipe(mainLog, { end: false })
  application.process().on('exit', (code, signal) => {
    report.nativeExit = { code, signal, at: new Date().toISOString() }
  })
  await application.evaluate(({ app }) => {
    app.on('before-quit', () => console.error('QUALIFICATION before-quit'))
    const quit = app.quit.bind(app)
    app.quit = () => {
      console.error('QUALIFICATION app.quit', new Error().stack)
      quit()
    }
  })
  window = await isolateNativeSmokeWindow(application)
  await application.evaluate(({ BrowserWindow }) => {
    for (const nativeWindow of BrowserWindow.getAllWindows()) {
      nativeWindow.on('close', () => console.error('QUALIFICATION window close'))
      nativeWindow.on('closed', () => console.error('QUALIFICATION window closed'))
      nativeWindow.webContents.on('render-process-gone', (_event, details) =>
        console.error('QUALIFICATION renderer gone', details),
      )
    }
  })
  // Long CUDA qualification must not compete with the user's desktop focus or window controls.
  // The actual native renderer/compositor and public IPC remain in use for all interactions.
  await application.evaluate(({ BrowserWindow }) => {
    for (const nativeWindow of BrowserWindow.getAllWindows()) nativeWindow.hide()
  })
  report.nativeWindowIsolation = 'Hidden native Electron window; real renderer and IPC'
  window.on('crash', () => console.error('QUALIFICATION renderer crash'))
  window.on('close', () => console.error('QUALIFICATION renderer page close'))
  window.on('pageerror', (error) => report.pageErrors.push(String(error)))
  await window.getByRole('tab', { name: 'Home', exact: true }).waitFor()
  // Observe genuine public preload notifications before any admitted job can emit progress.
  await window.evaluate(() => {
    window.__installedQualificationProgress = []
    window.api.projects.onGenerationProgress((snapshot) => {
      if (snapshot.current) window.__installedQualificationProgress.push(snapshot)
    })
  })
  const runtime = await window.evaluate(() => window.api.runtime.getStatus())
  assert.equal(runtime.ok, true, JSON.stringify(runtime))
  assert.equal(runtime.value.kind, 'ready')
  assert.equal(runtime.value.runtimeId, pointer.runtimeId)
  await check('Unmodified production Main qualifies activated real Linux/NVIDIA runtime', {
    runtime: runtime.value,
  })
  if (cfgRescaleProfile) {
    await qualifyCfgRescale()
  } else {
    let lastProject
    for (const [family, loraKey] of [
      ['illustrious', 'illustriousLora'],
      ['anima', 'animaLora'],
    ]) {
      const project = await createProject(fixture[family], fixture[loraKey])
      lastProject = project
      await generateAndAccept(project, family, 'txt2img')
      await prepareImg2Img(project)
      await generateAndAccept(project, family, 'img2img')
    }
    await qualifyMissingRuntimeSaveAndRebuild(lastProject)
    await qualifyInstalledImport(lastProject)
  }
  assert.deepEqual(report.pageErrors, [])
  // Observational closure only: neither source files nor the active runtime is rewritten.
  for (const model of report.models) assert.equal(await hashFile(model.managedPath), model.sha256)
  assert.deepEqual(
    JSON.parse(await readFile(path.join(fixture.appData, 'runtime/current-runtime.json'), 'utf8')),
    pointer,
  )
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'
  report.error = String(error.stack ?? error)
  throw error
} finally {
  if (application) await application.close()
  if (database) await database.close()
  if (mainLog) await new Promise((resolve) => mainLog.end(resolve))
  await checkpointEvidence(true)
}
