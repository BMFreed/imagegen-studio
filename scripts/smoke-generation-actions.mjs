/**
 * Native renderer → preload → main Generate and Queue Manager acceptance. Run with `pnpm exec tsx`
 * after app:build. Only the app-owned executable and deterministic output pixels are substituted.
 * RuntimeManager qualification/exit, model hash/header checks, target verification, SQLite and
 * staging are real. This is neither a CUDA test nor proof that the miniature checkpoint loads in an
 * inference engine.
 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  cpSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

import { _electron as electron, expect } from '@playwright/test'

import { openAppDatabase } from '../src/main/db/database.ts'
import { ModelRepository } from '../src/main/models/model-repository.ts'
import { qualifySdxlCheckpoint } from '../src/main/models/sdxl-checkpoint-qualification.ts'
import { readIgsPackage, saveIgsPackage } from '../src/main/projects/igs-package.ts'
import { createRuntimeRoots } from '../src/main/runtime/index.ts'
import { IGS_SRGB_ICC_SHA256 } from '../src/shared/projects/color-profile.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'

const artifacts = path.resolve(
  process.env.IMAGEGEN_GENERATE_ACTIONS_ARTIFACTS ??
    mkdtempSync(path.join(os.tmpdir(), 'igs-generate-actions-evidence-')),
)
mkdirSync(artifacts, { mode: 0o700, recursive: true })
const runId = randomUUID()
const fixtureRoot = path.join(artifacts, `fixture-${runId}`)
const appDataRoot = path.join(fixtureRoot, 'data', 'imagegen-studio')
mkdirSync(appDataRoot, { mode: 0o700, recursive: true })
const peerRequests = path.join(fixtureRoot, 'peer-requests.jsonl')
const peerLaunches = path.join(fixtureRoot, 'peer-launches.jsonl')
const peerProgress = path.join(fixtureRoot, 'peer-progress.jsonl')
const peerExits = path.join(fixtureRoot, 'peer-exits.jsonl')
const projectTitle = 'Native Generate actions'
const checkpointName = 'Native structural checkpoint fixture'
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const environment = {
  ...process.env,
  IMAGEGEN_TEST_IMAGE_WORKER: '1',
  NODE_ENV: 'test',
  XDG_CONFIG_HOME: path.join(fixtureRoot, 'config'),
  XDG_DATA_HOME: path.join(fixtureRoot, 'data'),
}
delete environment.ELECTRON_RUN_AS_NODE
delete environment.IMAGEGEN_DEV_SERVER_URL
const report = {
  boundaries: [
    'Actual built production Electron window, typed preload IPC and production Generate/controller/drain; not a release package.',
    'Actual RuntimeManager pointer ownership, live JSONL qualification and confirmed child exit.',
    'Actual managed model hash and SDXL anchor-header qualification; zero-weight miniature fixture.',
    'Actual target PNG/ICC/hash verification, queue SQLite, staging publication and resource delivery.',
    'Actual Queue Manager list/retry/cancel/delete/prune through renderer, typed preload and main; failed/pending display preconditions are seeded with independent valid frozen input files.',
    'Actual Retry admission during a held generation: only frozen inputs and queue metadata are copied, with no extra child, target composition or change to the running request/progress.',
    'Actual new Generate admission while another inference is held: one CPU-only derivatives child from the same app-owned runtime composes the frozen target and confirms exit; the active CUDA lease remains owned by its original job.',
    'Actual transient JSONL denoising progress, typed preload event/getter, Project indicator and Queue Manager projection; held controlled inference prevents progress from being confused with completed publication.',
    'Actual optional worker WEBP publication, signed thumbnail resource and thumbnail-only result strip; damaged derivative cache cannot remove the full candidate.',
    'Actual Queue Manager cached/placeholder result context and View result navigation through the production App/Canvas; navigation preserves acceptance selection and durable Project state.',
    'Actual contextual Denoising Strength control and opaque accepted Raster → img2img queue → later draft edit → Add → Save/reopen/comparison; partial-alpha neighboring target is visibly refused.',
    'Controlled Node executable replaces Python/CUDA/model loading/composition/inference only.',
    'IMAGEGEN_TEST_IMAGE_WORKER uses the existing development image worker for Project previews.',
    'No GPU, installed-runtime compatibility or complete checkpoint loadability claim.',
  ],
  checks: [],
  pageErrors: [],
  runId,
  screenshots: [],
  viewportChecks: [],
}
let application
let window
let mainStderr = ''
let liveDatabase
let nextProgressMarker = 0

function checked(name, evidence = {}) {
  report.checks.push({ evidence, name })
  console.log(`PASS ${name}`)
}

function lines(file) {
  return existsSync(file)
    ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
    : []
}

function generations() {
  return lines(peerRequests).filter((entry) =>
    ['generate-illustrious-txt2img', 'generate-illustrious-img2img'].includes(entry.request.type),
  )
}

function inferenceLaunches() {
  return lines(peerLaunches).filter(({ role }) => role === 'inference')
}

function derivativeLaunches() {
  return lines(peerLaunches).filter(({ role }) => role === 'derivatives')
}

async function settleFiniteAnimations() {
  // A visible modal can still be entering. Capture its settled native layout, including Naive's
  // finite scale/fade transitions, without waiting for unrelated infinite loading animations.
  await window.evaluate(async () => {
    const animations = document
      .getAnimations()
      .filter(
        (animation) =>
          animation.playState === 'running' &&
          animation.effect?.getComputedTiming().iterations !== Infinity,
      )
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)))
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
}

async function screenshot(name) {
  const file = path.join(artifacts, `${name}.png`)
  await settleFiniteAnimations()
  await window.screenshot({ path: file })
  report.screenshots.push(file)
}

async function resizeNativeWindow(width, height) {
  await application.evaluate(
    ({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height)
    },
    { height, width },
  )
  await expect
    .poll(
      async () =>
        await window.evaluate(() => ({
          height: innerHeight,
          width: innerWidth,
        })),
    )
    .toEqual({ height, width })
}

async function screenshotManagerAtViewport(width, height, name = '08-native-queue-manager') {
  await resizeNativeWindow(width, height)
  // Missing-thumbnail state has no image decode to outlast the modal entrance transition.
  // Measure the settled layout, just as screenshot() does, rather than its temporary scale.
  await settleFiniteAnimations()
  const bounds = await window.locator('[data-testid="queue-manager"]').boundingBox()
  assert.ok(bounds)
  assert.ok(bounds.x >= 0 && bounds.y >= 0)
  assert.ok(bounds.x + bounds.width <= width && bounds.y + bounds.height <= height)
  const horizontalOverflow = await window
    .locator('[data-testid="queue-manager"]')
    .evaluate((element) => element.scrollWidth > element.clientWidth)
  assert.equal(horizontalOverflow, false)
  await screenshot(`${name}-${width}x${height}`)
  report.viewportChecks.push({ bounds, height, horizontalOverflow, name, width })
}

async function resultVisibleOnCanvas() {
  return await window.evaluate(() =>
    [...document.querySelectorAll('[aria-label="Project Canvas"] canvas')].some((canvas) => {
      const context = canvas.getContext('2d')
      if (!context) return false
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
      for (let offset = 0; offset < data.length; offset += 4) {
        if (
          data[offset] === 37 &&
          data[offset + 1] === 94 &&
          data[offset + 2] === 181 &&
          data[offset + 3] === 255
        )
          return true
      }
      return false
    }),
  )
}

async function launch() {
  application = await electron.launch({ args: ['.'], cwd: process.cwd(), env: environment })
  await isolateNativeSmokeWindow(application)
  application.process().stderr.on('data', (chunk) => {
    mainStderr += chunk.toString()
  })
  window = await application.firstWindow()
  window.on('pageerror', (error) => report.pageErrors.push(error.message))
  await window.getByRole('tab', { name: 'Home', exact: true }).waitFor()
}

async function api(method, ...args) {
  const response = await apiResult(method, ...args)
  assert.equal(response.ok, true, JSON.stringify(response))
  return response.value
}

async function apiResult(method, ...args) {
  return await window.evaluate(
    async ({ method, args }) => await window.api.projects[method](...args),
    { args, method },
  )
}

async function tab(id) {
  const response = await api('open', id)
  assert.equal(response.kind, 'opened')
  return response.tab
}

async function rows(id) {
  return await liveDatabase.db
    .selectFrom('generation_queue_item')
    .selectAll()
    .where('local_project_key', '=', id)
    .orderBy('created_at')
    .orderBy('id')
    .execute()
}

async function managerItems() {
  const items = []
  let cursor = null
  do {
    const page = await api('getGenerationQueue', cursor)
    items.push(...page.items)
    cursor = page.nextCursor
    assert.ok(items.length <= 1000, 'Queue pagination did not terminate')
  } while (cursor)
  assert.equal(new Set(items.map(({ id }) => id)).size, items.length)
  return items
}

/** Observe the production event channels rather than treating an API snapshot as UI evidence. */
async function watchProgress() {
  await window.evaluate(() => {
    const evidence = { events: [], queueInvalidations: 0 }
    window.__igsNativeProgress = evidence
    evidence.stopProgress = window.api.projects.onGenerationProgress((snapshot) => {
      evidence.events.push(snapshot)
    })
    evidence.stopQueue = window.api.projects.onGenerationChanged(() => {
      evidence.queueInvalidations += 1
    })
  })
}

async function progressEvidence() {
  return await window.evaluate(() => ({
    events: window.__igsNativeProgress.events,
    queueInvalidations: window.__igsNativeProgress.queueInvalidations,
  }))
}

async function stopWatchingProgress() {
  const evidence = await progressEvidence()
  await window.evaluate(() => {
    window.__igsNativeProgress.stopProgress()
    window.__igsNativeProgress.stopQueue()
    delete window.__igsNativeProgress
  })
  return evidence
}

/** Marker files drive only the substituted peer; app state continues through its real owners. */
function sendProgress(entry, step, totalSteps = 2) {
  const marker = `progress-${entry.request.requestId}-${String(nextProgressMarker++).padStart(6, '0')}.json`
  const pendingMarker = path.join(fixtureRoot, `.${marker}.tmp`)
  writeFileSync(pendingMarker, JSON.stringify({ step, totalSteps }))
  renameSync(pendingMarker, path.join(fixtureRoot, marker))
  return marker
}

async function waitForProgress(entry, job, step) {
  await expect
    .poll(async () => (await api('getGenerationProgress')).current)
    .toEqual({
      documentId: job.document_id,
      jobId: job.id,
      projectKey: job.local_project_key,
      statusSequence: job.status_sequence,
      step,
      totalSteps: 2,
    })
  const snapshot = await api('getGenerationProgress')
  assert.ok(snapshot.revision > 0)
  assert.equal(entry.request.job.sampling.steps, 2)
  return snapshot
}

async function progressDurableState(projectId, packagePath) {
  return {
    candidates: await api('listGenerationResults', projectId),
    document: await tab(projectId),
    generationState: await api('getGenerationState', projectId),
    packageSha256: digest(readFileSync(packagePath)),
    queueItems: await managerItems(),
    queueRows: await rows(projectId),
    receipts: await liveDatabase.db
      .selectFrom('generation_candidate_receipt')
      .selectAll()
      .where('local_project_key', '=', projectId)
      .orderBy('completion_order')
      .execute(),
    seedCursor: await liveDatabase.db
      .selectFrom('generation_seed_cursor')
      .selectAll()
      .where('local_project_key', '=', projectId)
      .execute(),
  }
}

/** Seed display/cancel preconditions only; every observed action still enters through the UI. */
async function seedQueueFixture(source, status) {
  assert.ok(status === 'failed' || status === 'pending')
  const id = randomUUID()
  const sourceInputs = path.join(appDataRoot, 'generation-inputs', source.id)
  const ownedInputs = path.join(appDataRoot, 'generation-inputs', id)
  cpSync(sourceInputs, ownedInputs, { recursive: true })
  const manifestPath = path.join(ownedInputs, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  assert.equal(manifest.queueItemId, source.id)
  writeFileSync(manifestPath, JSON.stringify({ ...manifest, queueItemId: id }), { mode: 0o600 })
  for (const file of [
    path.join(ownedInputs, 'target.png'),
    manifestPath,
    ownedInputs,
    path.dirname(ownedInputs),
  ]) {
    const descriptor = openSync(file, 'r')
    try {
      fsyncSync(descriptor)
    } finally {
      closeSync(descriptor)
    }
  }
  const now = new Date().toISOString()
  const entry = {
    ...source,
    batch_id: randomUUID(),
    created_at: now,
    error_code: status === 'failed' ? 'GENERATION_WORKER_FAILED' : null,
    error_message: status === 'failed' ? 'Controlled fixture failure' : null,
    finished_at: status === 'failed' ? now : null,
    id,
    staging_session_id: randomUUID(),
    started_at: status === 'failed' ? now : null,
    status,
    status_sequence: status === 'failed' ? 2 : 0,
    updated_at: now,
  }
  await liveDatabase.db.insertInto('generation_queue_item').values(entry).execute()
  return entry
}

/** Fixture format only, copied from the existing pinned-header qualification test pattern. */
function miniatureCheckpoint() {
  const official = JSON.parse(
    gunzipSync(readFileSync('src/main/models/test-fixtures/illustrious-v01-safetensors-header.gz'))
      .subarray(8)
      .toString(),
  )
  const keys = [
    'model.diffusion_model.input_blocks.0.0.weight',
    'model.diffusion_model.input_blocks.4.1.transformer_blocks.0.attn2.to_k.weight',
    'model.diffusion_model.out.2.weight',
    'conditioner.embedders.0.transformer.text_model.encoder.layers.0.layer_norm1.weight',
    'conditioner.embedders.1.model.ln_final.weight',
    'first_stage_model.encoder.conv_in.weight',
    'first_stage_model.decoder.conv_out.weight',
  ]
  let offset = 0
  const header = { __metadata__: official.__metadata__ }
  for (const key of keys) {
    const tensor = official[key]
    assert.ok(tensor)
    const length =
      tensor.shape.reduce((product, dimension) => product * dimension, 1) *
      (tensor.dtype === 'F32' ? 4 : 2)
    header[key] = {
      data_offsets: [offset, offset + length],
      dtype: tensor.dtype,
      shape: tensor.shape,
    }
    offset += length
  }
  const json = Buffer.from(JSON.stringify(header))
  const bytes = Buffer.alloc(8 + json.length + offset)
  bytes.writeBigUInt64LE(BigInt(json.length))
  json.copy(bytes, 8)
  return bytes
}

async function seedCheckpoint() {
  const managedPath = path.join(appDataRoot, 'models', 'native-structural.safetensors')
  mkdirSync(path.dirname(managedPath), { mode: 0o700, recursive: true })
  const bytes = miniatureCheckpoint()
  writeFileSync(managedPath, bytes, { mode: 0o600 })
  await qualifySdxlCheckpoint(managedPath)
  const database = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  try {
    return await new ModelRepository(database.db).publishVerifiedInstallation({
      primary: {
        file: {
          managedPath,
          originalFilename: path.basename(managedPath),
          sha256: digest(bytes),
          sizeBytes: bytes.length,
          verifiedAt: new Date().toISOString(),
        },
        resource: {
          creator: 'Native smoke fixture',
          displayName: checkpointName,
          source: { kind: 'civitai', modelId: 90001 },
          sourceMetadata: { source: 'native smoke fixture' },
          type: 'checkpoint',
        },
        version: {
          baseModelFamily: 'illustrious',
          format: 'safetensors',
          name: 'Structural fixture v1',
          predictionType: 'epsilon',
          source: {
            expectedSha256: digest(bytes),
            fileId: 90003,
            kind: 'civitai',
            versionId: 90002,
          },
          sourceMetadata: { source: 'native smoke fixture' },
        },
      },
    })
  } finally {
    await database.close()
  }
}

async function installControlledRuntime() {
  const roots = await createRuntimeRoots(appDataRoot)
  const runtimeId = 'native-smoke-linux-nvidia'
  const ownedEnvironment = path.join(roots.environmentsDir, runtimeId)
  const executable = path.join(ownedEnvironment, 'bin', 'python')
  const config = path.join(ownedEnvironment, 'resources', 'sdxl-config')
  mkdirSync(path.dirname(executable), { mode: 0o700, recursive: true })
  mkdirSync(config, { mode: 0o700, recursive: true })
  writeFileSync(path.join(config, 'model_index.json'), '{"fixture":"controlled inference peer"}')
  const profile = readFileSync('worker-python/src/imagegen_worker/srgb.icc')
  assert.equal(digest(profile), IGS_SRGB_ICC_SHA256)
  // Precomputed with Pillow 12.2.0: lossless 96 × 64 RGB (37, 94, 181), pinned worker ICC.
  // These supplied peer pixels are a fixture, not renderer-side thumbnail generation.
  const thumbnail = Buffer.from(
    'UklGRooCAABXRUJQVlA4WAoAAAAgAAAAXwAAPwAASUNDUEwCAAAAAAJMbGNtcwRAAABtbnRyUkdCIFhZWiAH6gAJABkAEgA3ADthY3NwQVBQTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA9tYAAQAAAADTLWxjbXMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAtkZXNjAAABCAAAADZjcHJ0AAABQAAAAEx3dHB0AAABjAAAABRjaGFkAAABoAAAACxyWFlaAAABzAAAABRiWFlaAAAB4AAAABRnWFlaAAAB9AAAABRyVFJDAAACCAAAACBnVFJDAAACCAAAACBiVFJDAAACCAAAACBjaHJtAAACKAAAACRtbHVjAAAAAAAAAAEAAAAMZW5VUwAAABoAAAAcAHMAUgBHAEIAIABiAHUAaQBsAHQALQBpAG4AAG1sdWMAAAAAAAAAAQAAAAxlblVTAAAAMAAAABwATgBvACAAYwBvAHAAeQByAGkAZwBoAHQALAAgAHUAcwBlACAAZgByAGUAZQBsAHlYWVogAAAAAAAA9tYAAQAAAADTLXNmMzIAAAAAAAEMQgAABd7///MlAAAHkwAA/ZD///uh///9ogAAA9wAAMBuWFlaIAAAAAAAAG+gAAA49QAAA5BYWVogAAAAAAAAJJ8AAA+EAAC2w1hZWiAAAAAAAABilwAAt4cAABjZcGFyYQAAAAAAAwAAAAJmZgAA8qcAAA1ZAAAT0AAACltjaHJtAAAAAAADAAAAAKPXAABUewAATM0AAJmaAAAmZgAAD1xWUDhMFwAAAC9fwA8AB1CvlrS2/wEgIfyfL0X0P/UHAA==',
    'base64',
  )
  assert.equal(
    digest(thumbnail),
    'eb8d91356840de4706359bcbed436e0c632281ca2bb9a25aaa211f650a98185d',
  )
  const widerThumbnail = Buffer.from(
    'UklGRooCAABXRUJQVlA4WAoAAAAgAAAAZwAAPwAASUNDUEwCAAAAAAJMbGNtcwRAAABtbnRyUkdCIFhZWiAH6gAJABkAEgA3ADthY3NwQVBQTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA9tYAAQAAAADTLWxjbXMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAtkZXNjAAABCAAAADZjcHJ0AAABQAAAAEx3dHB0AAABjAAAABRjaGFkAAABoAAAACxyWFlaAAABzAAAABRiWFlaAAAB4AAAABRnWFlaAAAB9AAAABRyVFJDAAACCAAAACBnVFJDAAACCAAAACBiVFJDAAACCAAAACBjaHJtAAACKAAAACRtbHVjAAAAAAAAAAEAAAAMZW5VUwAAABoAAAAcAHMAUgBHAEIAIABiAHUAaQBsAHQALQBpAG4AAG1sdWMAAAAAAAAAAQAAAAxlblVTAAAAMAAAABwATgBvACAAYwBvAHAAeQByAGkAZwBoAHQALAAgAHUAcwBlACAAZgByAGUAZQBsAHlYWVogAAAAAAAA9tYAAQAAAADTLXNmMzIAAAAAAAEMQgAABd7///MlAAAHkwAA/ZD///uh///9ogAAA9wAAMBuWFlaIAAAAAAAAG+gAAA49QAAA5BYWVogAAAAAAAAJJ8AAA+EAAC2w1hZWiAAAAAAAABilwAAt4cAABjZcGFyYQAAAAAAAwAAAAJmZgAA8qcAAA1ZAAAT0AAACltjaHJtAAAAAAADAAAAAKPXAABUewAATM0AAJmaAAAmZgAAD1xWUDhMFwAAAC9nwA8AB1CvlrS2/wEgIfy/r0T0P/UBAA==',
    'base64',
  )
  assert.equal(
    digest(widerThumbnail),
    '63b9088f54f54162f37ad74e26b81b25a5856f1fd5f051b55b566e7644568057',
  )
  // This executable is an external peer fixture. It does not implement or replace any main code.
  const script = String.raw`#!${process.execPath}
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const {crc32, deflateSync} = require('node:zlib')
const requestLog = ${JSON.stringify(peerRequests)}
const launchLog = ${JSON.stringify(peerLaunches)}
const progressLog = ${JSON.stringify(peerProgress)}
const fixtureRoot = ${JSON.stringify(fixtureRoot)}
const expectedConfig = ${JSON.stringify(config)}
const expectedCache = ${JSON.stringify(roots.cacheDir)}
const profile = Buffer.from(${JSON.stringify(profile.toString('base64'))}, 'base64')
const thumbnail96 = Buffer.from(${JSON.stringify(thumbnail.toString('base64'))}, 'base64')
const thumbnail104 = Buffer.from(${JSON.stringify(widerThumbnail.toString('base64'))}, 'base64')
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const exitLog = ${JSON.stringify(peerExits)}
const args = process.argv.slice(2)
const role = args.join(' ') === '-I -m imagegen_worker.inference_main' ? 'inference'
  : args.join(' ') === '-I -m imagegen_worker' ? 'derivatives' : null
if (!role) process.exit(21)
if (process.env.IGS_SDXL_CONFIG_DIR !== expectedConfig || process.env.HF_HOME !== expectedCache) process.exit(22)
if (['HF_HUB_OFFLINE', 'TRANSFORMERS_OFFLINE', 'HF_DATASETS_OFFLINE'].some(key => process.env[key] !== '1')) process.exit(23)
if (role === 'derivatives' && process.env.CUDA_VISIBLE_DEVICES !== '') process.exit(29)
fs.appendFileSync(launchLog, JSON.stringify({pid:process.pid, args, role, executable:process.argv[1],
  cudaVisibleDevices:process.env.CUDA_VISIBLE_DEVICES ?? null, offline:true}) + '\n')
process.on('exit', code => fs.appendFileSync(exitLog, JSON.stringify({pid:process.pid,role,code})+'\n'))
function chunk(type, data) {
  const header = Buffer.alloc(8); header.writeUInt32BE(data.length); header.write(type,4,'ascii')
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type),data])))
  return Buffer.concat([header,data,checksum])
}
function png(width,height,opaque) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height,4); header[8]=8; header[9]=6
  const pixels = Buffer.alloc(height*(1+width*4))
  if (opaque) for (let y=0;y<height;y++) for(let x=0;x<width;x++) pixels.set([37,94,181,255],y*(1+width*4)+1+x*4)
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'), chunk('IHDR',header),
    chunk('iCCP',Buffer.concat([Buffer.from('srgb\0\0'),deflateSync(profile)])),
    chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))])
}
process.on('SIGTERM',()=>process.exit(0))
process.stdin.on('end',()=>process.exit(0))
process.stdout.write(JSON.stringify(role === 'inference'
  ? {type:'ready',protocolVersion:'1',pythonVersion:'3.12.13',workerVersion:'0.6.0',
    runtimeProfile:'linux-nvidia',capabilities:['illustrious-txt2img','target-composition','denoising-progress','candidate-thumbnails','illustrious-cfg-rescale','illustrious-img2img']}
  : {type:'ready',protocolVersion:'1',pythonVersion:'3.12.13',workerVersion:'0.1.0',
    runtimeProfile:'derivatives-only',capabilities:['image-derivatives','import-normalization','preview-composition','self-test','target-composition']})+'\n')
process.stdin.setEncoding('utf8')
let buffer=''
process.stdin.on('data',data=>{
  buffer+=data
  while(buffer.includes('\n')) {
    const end=buffer.indexOf('\n'); const request=JSON.parse(buffer.slice(0,end)); buffer=buffer.slice(end+1)
    fs.appendFileSync(requestLog,JSON.stringify({pid:process.pid,role,request})+'\n')
    if(request.type==='compose-target') {
      // The added img2img scenario has a top opaque layer exactly covering the bbox.
      // Other geometry remains outside this controlled peer's explicit fixture domain.
      const top=request.layers[0]
      if(top && (top.width!==request.bbox.width || top.height!==request.bbox.height
        || top.opacity!==1 || top.blendMode!=='normal'
        || top.transform.x!==request.bbox.x || top.transform.y!==request.bbox.y
        || top.transform.scaleX!==1 || top.transform.scaleY!==1 || top.transform.rotationDegrees!==0
        || hash(fs.readFileSync(top.path))!==top.sha256)) process.exit(25)
      const respond=()=>{
        const bytes=top ? fs.readFileSync(top.path) : png(request.bbox.width,request.bbox.height,false)
        fs.writeFileSync(request.output.targetPngPath,bytes,{flag:'wx',mode:0o600})
        process.stdout.write(JSON.stringify({type:'target-done',protocolVersion:'1',requestId:request.requestId,
          mode:top ? 'img2img' : 'txt2img',rect:request.bbox,composite:{byteSize:bytes.length,colorSpace:'srgb',
          width:request.bbox.width,height:request.bbox.height,sha256:hash(bytes)}})+'\n')
      }
      if(role==='derivatives' && fs.existsSync(path.join(fixtureRoot,'hold-cpu-compose'))) {
        const timer=setInterval(()=>{
          if(!fs.existsSync(path.join(fixtureRoot,'release-compose-'+request.requestId))) return
          clearInterval(timer)
          respond()
        },10)
      } else respond()
    } else if(['generate-illustrious-txt2img','generate-illustrious-img2img'].includes(request.type)) {
      if (role !== 'inference') process.exit(30)
      if(hash(fs.readFileSync(request.job.target.path))!==request.job.target.sha256) process.exit(26)
      if(hash(fs.readFileSync(request.job.checkpoint.path))!==request.job.checkpoint.sha256) process.exit(27)
      const emitProgress = (progress, source, prefix='') => {
        const message = {type:'generation-progress',protocolVersion:'1',requestId:request.requestId,...progress}
        fs.appendFileSync(progressLog,JSON.stringify({message,pid:process.pid,source})+'\n')
        process.stdout.write(prefix+JSON.stringify(message)+'\n')
      }
      const timer=setInterval(()=>{
        for(const marker of fs.readdirSync(fixtureRoot).filter(name=>name.startsWith('progress-'+request.requestId+'-')).sort()) {
          const markerPath=path.join(fixtureRoot,marker)
          const progress=JSON.parse(fs.readFileSync(markerPath,'utf8'))
          fs.unlinkSync(markerPath)
          emitProgress(progress,marker)
        }
        if(!fs.existsSync(path.join(fixtureRoot,'release-'+request.requestId))) return
        clearInterval(timer)
        const bytes=png(request.job.bbox.width,request.job.bbox.height,true)
        fs.writeFileSync(request.job.output.pngPath,bytes,{flag:'wx',mode:0o600})
        if(request.job.bbox.height!==64 || ![96,104].includes(request.job.bbox.width)) process.exit(28)
        const thumbnail=request.job.bbox.width===104 ? thumbnail104 : thumbnail96
        const thumbnailPath=request.job.output.pngPath+'.thumb.webp'
        fs.writeFileSync(thumbnailPath,thumbnail,{flag:'wx',mode:0o600})
        const terminalLine=JSON.stringify({type:'generation-done',protocolVersion:'1',requestId:request.requestId,
          outputPath:request.job.output.pngPath,seed:request.job.sampling.seed,
          thumbnail:{outputPath:thumbnailPath,byteSize:thumbnail.length,sha256:hash(thumbnail),width:request.job.bbox.width,height:64}})+'\n'
        if(fs.existsSync(path.join(fixtureRoot,'late-progress-'+request.requestId))) {
          emitProgress({step:1,totalSteps:2},'after-terminal',terminalLine)
        } else process.stdout.write(terminalLine)
      },10)
    } else if(request.type==='self-test' && role==='derivatives') {
      process.stdout.write(JSON.stringify({type:'self-test-result',protocolVersion:'1',
        requestId:request.requestId,runtimeProfile:'derivatives-only',
        checks:{pillowVersion:'12.2.0',imageCodecs:['PNG','WEBP'],colorConversion:'srgb'}})+'\n')
    } else process.exit(24)
  }
})
`
  writeFileSync(executable, script, { mode: 0o700 })
  chmodSync(executable, 0o700)
  writeFileSync(
    roots.pointerFile,
    JSON.stringify({ schemaVersion: 1, runtimeId, pythonExecutable: executable }),
    { mode: 0o600 },
  )
}

function release(entry) {
  writeFileSync(
    path.join(fixtureRoot, `release-${entry.request.requestId}`),
    'release fixture inference',
  )
}

/** New fixtures are created, configured and saved through the production UI, not main setters. */
async function createConfiguredProject(title, prompt, seed, generationWidth, checkpointVersionId) {
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: 'New Project', exact: true }).first().click()
  const dialog = window.getByRole('dialog', { name: 'New Project', exact: true })
  await dialog.locator('input[aria-label="Project name"]').fill(title)
  await dialog.locator('input[aria-label="Project width"]').fill('64')
  await dialog.locator('input[aria-label="Project height"]').fill('64')
  await dialog.getByRole('button', { name: 'Create Project', exact: true }).click()
  await window.getByRole('tab', { name: title, exact: true }).waitFor()
  const project = (await api('list')).find((candidate) => candidate.title === title)
  assert.ok(project)
  const region = window.getByRole('region', { name: 'Project ' + title, exact: true })
  await region.locator('[aria-label="Generation model"]').click()
  await window.getByText(checkpointName, { exact: true }).last().click()
  await expect
    .poll(async () => (await tab(project.id)).generationDraft.model?.localVersionId)
    .toBe(checkpointVersionId)
  await window.locator('[aria-label="Sampler"]').click()
  await window.getByText('Euler a', { exact: true }).last().click()
  await window.locator('[aria-label="Scheduler"]').click()
  await window.getByText('Normal', { exact: true }).last().click()
  await window.locator('input[aria-label="Steps"]').fill('2')
  await window.locator('input[aria-label="CFG scale"]').fill('5')
  const iterations = window.locator('input[aria-label="Images per click"]')
  await iterations.fill('1')
  await iterations.press('Enter')
  await expect(iterations).toHaveValue('1')
  await window.getByRole('switch', { name: 'Random seed switch' }).click()
  await window.locator('input[aria-label="Generation seed"]').fill(String(seed))
  await region.getByRole('textbox', { name: 'Positive prompt', exact: true }).fill(prompt)
  const width = window.locator('input[aria-label="Generation area width"]')
  await width.fill(String(generationWidth))
  await width.press('Enter')
  await expect.poll(async () => (await tab(project.id)).primaryBbox.width).toBe(generationWidth)
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await tab(project.id)).dirty).toBe(false)
  const document = await tab(project.id)
  assert.equal(document.generationDraft.positivePrompt.text, prompt)
  assert.equal(document.generationDraft.seed.value, seed)
  assert.equal(document.generationDraft.sampling.steps, 2)
  const directory = path.join(appDataRoot, 'workspaces', 'Uncategorized')
  let packagePath = null
  for (const name of readdirSync(directory).filter((entry) => entry.endsWith('.igs'))) {
    const candidatePath = path.join(directory, name)
    if ((await readIgsPackage(candidatePath)).project.documentId === document.documentId) {
      packagePath = candidatePath
      break
    }
  }
  assert.ok(packagePath)
  return { document, id: project.id, packagePath, region, title }
}

try {
  const rendererHtml = readFileSync('dist/renderer/index.html', 'utf8')
  const rendererEntryAssets = [
    ...rendererHtml.matchAll(/(?:src|href)="\.\/assets\/([^"/]+\.(?:js|css))"/g),
  ].map((match) => `dist/renderer/assets/${match[1]}`)
  assert.ok(rendererEntryAssets.some((file) => file.endsWith('.js')))
  assert.ok(rendererEntryAssets.some((file) => file.endsWith('.css')))
  report.buildSha256 = Object.fromEntries(
    [
      'dist/main/main.cjs',
      'dist/preload/preload.cjs',
      'dist/renderer/index.html',
      ...readdirSync('dist/renderer/assets')
        .filter((name) => /\.(?:js|css)$/.test(name))
        .map((name) => `dist/renderer/assets/${name}`),
    ].map((file) => [file, digest(readFileSync(file))]),
  )
  report.scriptSha256 = digest(readFileSync('scripts/smoke-generation-actions.mjs'))
  report.windowIsolation = {
    helperSha256: digest(readFileSync('scripts/native-smoke-window.mjs')),
    physicalKeyboardBlocked: true,
    playwrightKeyboardUnchanged: true,
  }
  const installed = await seedCheckpoint()
  await launch()
  const unavailable = await window.evaluate(() => window.api.runtime.getStatus())
  assert.equal(unavailable.ok, true)
  assert.equal(unavailable.value.kind, 'not-installed')
  await window.getByRole('button', { name: 'New Project', exact: true }).first().click()
  const create = window.getByRole('dialog', { name: 'New Project', exact: true })
  await create.locator('input[aria-label="Project name"]').fill(projectTitle)
  await create.locator('input[aria-label="Project width"]').fill('64')
  await create.locator('input[aria-label="Project height"]').fill('64')
  await create.getByRole('button', { name: 'Create Project', exact: true }).click()
  await window.getByRole('tab', { name: projectTitle, exact: true }).waitFor()
  const projects = await api('list')
  const projectId = projects.find((project) => project.title === projectTitle)?.id
  assert.ok(projectId)
  const created = await tab(projectId)
  assert.match(created.documentId, /^[a-f0-9]{8}(?:-[a-f0-9]+){4}$/)
  let projectRegion = window.getByRole('region', { name: `Project ${projectTitle}`, exact: true })
  await projectRegion.locator('[aria-label="Generation model"]').click()
  await window.getByText(checkpointName, { exact: true }).last().click()
  await expect
    .poll(async () => (await tab(projectId)).generationDraft.model?.localVersionId)
    .toBe(installed.versionId)
  await window.locator('[aria-label="Sampler"]').click()
  await window.getByText('Euler a', { exact: true }).last().click()
  await window.locator('[aria-label="Scheduler"]').click()
  await window.getByText('Normal', { exact: true }).last().click()
  await window.locator('input[aria-label="Steps"]').fill('2')
  await window.locator('input[aria-label="CFG scale"]').fill('5')
  await window.getByRole('switch', { name: 'Random seed switch' }).click()
  await window.locator('input[aria-label="Generation seed"]').fill('42')
  await projectRegion
    .getByRole('textbox', { name: 'Positive prompt', exact: true })
    .fill('native admission snapshot')
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await tab(projectId)).dirty).toBe(false)
  const projectDir = path.join(appDataRoot, 'workspaces', 'Uncategorized')
  const packages = readdirSync(projectDir).filter((entry) => entry.endsWith('.igs'))
  assert.equal(packages.length, 1)
  const packagePath = path.join(projectDir, packages[0])
  assert.equal((await readIgsPackage(packagePath)).project.documentId, created.documentId)
  const savedBytes = readFileSync(packagePath)
  const savedTab = await tab(projectId)
  let count = window.locator('input[aria-label="Images per click"]')
  const initialCount = await count.inputValue()
  await count.fill('2')
  await count.press('Enter')
  let generate = window.getByRole('button', { name: 'Generate', exact: true })
  await expect(generate).toBeDisabled()
  await window.getByRole('button', { name: /^Generation queue/ }).click()
  await expect(
    window.getByRole('complementary', { name: 'Project generation queue' }),
  ).toContainText('No pending or running jobs')
  await screenshot('01-runtime-unavailable-queue')
  const transient = await tab(projectId)
  assert.deepEqual(transient, savedTab)
  assert.equal(transient.dirty, false)
  assert.deepEqual(readFileSync(packagePath), savedBytes)
  checked('Unavailable runtime disables Generate; count and empty queue do not change Project', {
    documentId: created.documentId,
    initialCount,
  })
  await window.getByRole('button', { name: 'Close project queue', exact: true }).click()
  await window.getByRole('button', { name: `Close ${projectTitle}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: projectTitle, exact: true })).toHaveCount(0)
  await window.getByRole('button', { name: `Open ${projectTitle}`, exact: true }).click()
  await window.getByRole('tab', { name: projectTitle, exact: true }).waitFor()
  await expect(count).toHaveValue(initialCount)
  assert.equal((await tab(projectId)).documentId, created.documentId)
  checked('Closing and reopening the same document resets transient iterations')
  await application.close()
  application = null

  await installControlledRuntime()
  await launch()
  projectRegion = window.getByRole('region', { name: `Project ${projectTitle}`, exact: true })
  count = window.locator('input[aria-label="Images per click"]')
  generate = window.getByRole('button', { name: 'Generate', exact: true })
  await window.getByRole('button', { name: `Open ${projectTitle}`, exact: true }).click()
  await window.getByRole('tab', { name: projectTitle, exact: true }).waitFor()
  const ready = await window.evaluate(() => window.api.runtime.getStatus())
  assert.equal(ready.ok, true)
  assert.equal(ready.value.kind, 'ready')
  await expect(generate).toBeEnabled({ timeout: 20_000 })
  liveDatabase = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  await window.getByText('Advanced Options', { exact: true }).click()
  const rescaleInput = window.locator('input[aria-label="CFG Rescale"]')
  await expect(rescaleInput).toBeEnabled()
  await rescaleInput.fill('0.7')
  await rescaleInput.press('Enter')
  await expect.poll(async () => (await tab(projectId)).generationDraft.cfgRescale).toBe(0.7)
  await screenshot('01a-native-cfg-rescale-control')
  const width = window.locator('input[aria-label="Generation area width"]')
  await width.fill('0')
  await expect(generate).toBeDisabled()
  await width.fill('96')
  await expect(generate).toBeDisabled()
  assert.equal((await tab(projectId)).primaryBbox.width, 64)
  assert.equal((await rows(projectId)).length, 0)
  const save = window.getByRole('button', { name: 'Save Project', exact: true })
  const positive = projectRegion.getByRole('textbox', { name: 'Positive prompt', exact: true })
  await expect(save).toBeEnabled()
  // The public API alone returns a DTO without reconciling App state. Use the actual editor and
  // its renderer draft-sync acknowledgement, which replaces the tab with a main-owned DTO.
  await positive.fill('native same-bbox acknowledgement')
  await expect
    .poll(async () => (await tab(projectId)).generationDraft.positivePrompt.text)
    .toBe('native same-bbox acknowledgement')
  await window.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  await expect(width).toHaveValue('96')
  await expect(generate).toBeDisabled()
  await expect(save).toBeEnabled()
  await expect(
    projectRegion.getByText('Press Enter to apply the generation area size before generating.', {
      exact: true,
    }),
  ).toBeVisible()
  const acknowledged = await tab(projectId)
  assert.equal(acknowledged.documentId, created.documentId)
  assert.equal(acknowledged.primaryBbox.width, 64)
  checked(
    'Real prompt acknowledgement preserves pending bbox and Generate guard while Save stays available',
    { committedWidth: 64, pendingWidth: 96 },
  )

  await positive.fill('native admission snapshot')
  await expect
    .poll(async () => (await tab(projectId)).generationDraft.positivePrompt.text)
    .toBe('native admission snapshot')
  await expect(width).toHaveValue('96')
  await width.fill('abc')
  await expect(width).toHaveValue('abc')
  await expect(generate).toBeDisabled()
  await expect(save).toBeEnabled()
  await width.press('Control+s')
  await expect.poll(async () => (await tab(projectId)).dirty).toBe(false)
  await expect(projectRegion.getByText('Saved', { exact: true })).toBeVisible()
  await expect(save).toBeEnabled()
  await window.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  const widthAfterSave = await width.inputValue()
  // Disabling a focused Naive input during Save may blur it and restore its last numeric text.
  // Both allowed displays retain this local edit; the committed DTO's width64 must not replace it.
  assert.ok(
    ['abc', '96'].includes(widthAfterSave),
    `Save replaced pending width with ${widthAfterSave}`,
  )
  await expect(generate).toBeDisabled()
  await expect(
    projectRegion.getByText(
      'Enter a valid generation area size and press Enter before generating.',
      { exact: true },
    ),
  ).toBeVisible()
  const savedPending = await tab(projectId)
  assert.equal(savedPending.documentId, created.documentId)
  assert.equal(savedPending.primaryBbox.width, 64)
  assert.equal((await readIgsPackage(packagePath)).project.primaryBbox.width, 64)
  assert.equal((await rows(projectId)).length, 0)
  checked(
    'Focused invalid bbox survives real Save acknowledgement as a Generate refusal; Save commits only the existing bbox',
    { committedWidth: 64, displayedWidth: widthAfterSave },
  )
  await width.fill('96')
  await expect(generate).toBeDisabled()
  await screenshot('02-bbox-enter-guard')
  await width.press('Enter')
  await expect.poll(async () => (await tab(projectId)).primaryBbox.width).toBe(96)
  await expect(generate).toBeEnabled()
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await tab(projectId)).dirty).toBe(false)
  const beforeGenerate = readFileSync(packagePath)
  checked('Invalid and uncommitted bbox disable Generate; Enter commits the reviewed width', {
    width: 96,
  })

  await count.fill('2')
  await count.press('Enter')
  await generate.click()
  await expect.poll(() => generations().length, { timeout: 20_000 }).toBe(1)
  const first = generations()[0]
  const state = await api('getGenerationState', projectId)
  assert.equal(state.phase, 'processing')
  assert.equal(state.jobs.length, 2)
  assert.deepEqual(
    state.jobs.map((job) => job.status),
    ['running', 'pending'],
  )
  assert.equal(state.documentId, created.documentId)
  assert.equal(first.request.job.prompts.positive, 'native admission snapshot')
  assert.equal(first.request.job.bbox.width, 96)
  assert.equal(first.request.job.sampling.cfgRescale, 0.7)
  assert.equal((await readIgsPackage(packagePath)).project.generationDraft.cfgRescale, 0.7)
  const initialRows = await rows(projectId)
  assert.equal(new Set(initialRows.map((row) => row.batch_id)).size, 1)
  assert.equal(new Set(initialRows.map((row) => row.staging_session_id)).size, 1)
  await window.getByRole('button', { name: /^Generation queue/ }).click()
  const queue = window.getByRole('complementary', { name: 'Project generation queue' })
  await expect(queue.getByRole('article')).toHaveCount(2)
  await expect(queue).toContainText('Running')
  await expect(queue).toContainText('Pending')
  await screenshot('03-live-running-pending-queue')
  checked(
    'User Generate atomically publishes a shared batch/session and starts only its first job',
    { jobIds: state.jobs.map((job) => job.id), batchId: initialRows[0].batch_id },
  )

  const firstRunningRow = initialRows.find(({ id }) => id === state.runningJobId)
  assert.ok(firstRunningRow)
  assert.equal((await api('getGenerationProgress')).current, null)
  const beforeProgress = await progressDurableState(projectId, packagePath)
  await watchProgress()
  const firstProgressMarker = sendProgress(first, 1)
  const firstProgressSnapshot = await waitForProgress(first, firstRunningRow, 1)
  const projectProgress = queue.locator('[data-testid="generation-progress"]')
  await expect(projectProgress).toContainText('Denoising step 1 of 2')
  await expect(projectProgress.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
  await screenshot('03a-native-generation-progress-project')
  await window.getByRole('button', { name: 'Open Queue Manager', exact: true }).click()
  const progressManager = window.getByRole('dialog', { name: 'Queue Manager', exact: true })
  const progressManagerRow = progressManager.locator(
    `[data-testid="queue-job-row"][data-job-id="${firstRunningRow.id}"]`,
  )
  await progressManagerRow.getByRole('button', { name: 'Show job details', exact: true }).click()
  const managerProgress = progressManagerRow.locator('[data-testid="generation-progress"]')
  const managerProgressDetails = progressManager
    .locator('[data-testid="queue-job-details"]')
    .locator('[data-testid="generation-progress"]')
  await expect(managerProgress).toContainText('Denoising step 1 of 2')
  await expect(managerProgressDetails).toContainText('Denoising step 1 of 2')
  const secondProgressMarker = sendProgress(first, 2)
  const secondProgressSnapshot = await waitForProgress(first, firstRunningRow, 2)
  assert.ok(secondProgressSnapshot.revision > firstProgressSnapshot.revision)
  await expect(managerProgress).toContainText('Denoising step 2 of 2')
  await expect(managerProgress.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  await expect(managerProgressDetails).toContainText('Denoising step 2 of 2')
  await expect(progressManagerRow).toHaveAttribute('data-status', 'running')
  assert.deepEqual(await progressDurableState(projectId, packagePath), beforeProgress)
  const firstProgressEvents = await stopWatchingProgress()
  assert.equal(firstProgressEvents.queueInvalidations, 0)
  assert.deepEqual(firstProgressEvents.events, [firstProgressSnapshot, secondProgressSnapshot])
  assert.deepEqual(
    lines(peerProgress).map(({ source }) => source),
    [firstProgressMarker, secondProgressMarker],
  )
  report.progressResponseMeasurement = {
    eventCount: firstProgressEvents.events.length,
    queueInvalidations: firstProgressEvents.queueInvalidations,
    serializedUtf8Bytes: Buffer.byteLength(JSON.stringify(secondProgressSnapshot), 'utf8'),
    snapshot: secondProgressSnapshot,
  }
  await screenshot('03b-native-generation-progress-manager')
  for (const [width, height] of [
    [900, 620],
    [1440, 900],
  ]) {
    await screenshotManagerAtViewport(width, height, '03b-native-generation-progress-manager')
  }
  await resizeNativeWindow(1380, 900)
  await window.keyboard.press('Escape')
  await expect(progressManager).toHaveCount(0)
  await expect(projectProgress).toContainText('Denoising step 2 of 2')
  checked(
    'Actual progress updates Project and Queue Manager without durable mutations or queue invalidations; final denoising step remains running until verified completion',
    {
      jobId: firstRunningRow.id,
      packageSha256: beforeProgress.packageSha256,
      progressEvents: firstProgressEvents.events,
      queueInvalidations: firstProgressEvents.queueInvalidations,
    },
  )

  await projectRegion
    .getByRole('textbox', { name: 'Positive prompt', exact: true })
    .fill('edited after admission')
  await rescaleInput.fill('0.2')
  await rescaleInput.press('Enter')
  await expect.poll(async () => (await tab(projectId)).generationDraft.cfgRescale).toBe(0.2)
  await width.fill('104')
  await width.press('Enter')
  await expect.poll(async () => (await tab(projectId)).primaryBbox.width).toBe(104)
  await window.getByRole('button', { name: 'Cancel current generation', exact: true }).click()
  await expect.poll(() => generations().length, { timeout: 20_000 }).toBe(2)
  const second = generations()[1]
  assert.throws(() => process.kill(first.pid, 0), { code: 'ESRCH' })
  const afterCancel = await rows(projectId)
  assert.equal(afterCancel.find((row) => row.id === state.runningJobId)?.status, 'canceled')
  assert.equal(afterCancel.filter((row) => row.status === 'running').length, 1)
  const clearedAfterCancel = await api('getGenerationProgress')
  assert.equal(clearedAfterCancel.current, null)
  assert.ok(clearedAfterCancel.revision > secondProgressSnapshot.revision)
  await expect(projectProgress).toHaveCount(0)
  assert.equal(second.request.job.prompts.positive, 'native admission snapshot')
  assert.equal(second.request.job.bbox.width, 96)
  assert.deepEqual(readFileSync(packagePath), beforeGenerate)
  const secondRunningRow = afterCancel.find(({ status }) => status === 'running')
  assert.ok(secondRunningRow)
  const beforeSiblingProgress = await progressDurableState(projectId, packagePath)
  sendProgress(second, 1)
  const siblingProgressSnapshot = await waitForProgress(second, secondRunningRow, 1)
  assert.ok(siblingProgressSnapshot.revision > clearedAfterCancel.revision)
  assert.notEqual(siblingProgressSnapshot.current.jobId, firstRunningRow.id)
  await expect(projectProgress).toContainText('Denoising step 1 of 2')
  assert.deepEqual(await progressDurableState(projectId, packagePath), beforeSiblingProgress)
  // Same-client, post-terminal progress must be ignored. This peer writes done followed by the
  // old observation before lease close; it does not fabricate a different client's request ID.
  writeFileSync(path.join(fixtureRoot, `late-progress-${second.request.requestId}`), 'late fixture')
  release(second)
  await expect
    .poll(async () => (await api('listGenerationResults', projectId)).candidates.length, {
      timeout: 20_000,
    })
    .toBe(1)
  await expect.poll(async () => (await api('getGenerationState', projectId)).phase).toBe('idle')
  await expect.poll(async () => (await api('getGenerationProgress')).current).toBe(null)
  await expect(projectProgress).toHaveCount(0)
  assert.equal(
    lines(peerProgress).filter(
      ({ message, source }) =>
        message.requestId === second.request.requestId && source === 'after-terminal',
    ).length,
    1,
  )
  const completed = await api('listGenerationResults', projectId)
  assert.equal(completed.lastActualSeed, second.request.job.sampling.seed)
  const candidate = completed.candidates[0]
  const receipt = await liveDatabase.db
    .selectFrom('generation_candidate_receipt')
    .selectAll()
    .where('candidate_id', '=', candidate.candidateId)
    .executeTakeFirstOrThrow()
  assert.equal(receipt.queue_item_id, state.jobs[1].id)
  const resource = await window.evaluate(async (url) => {
    const response = await fetch(url)
    const bytes = new Uint8Array(await response.arrayBuffer())
    const image = new Image()
    image.src = url
    await image.decode()
    return {
      bytes: bytes.length,
      height: image.naturalHeight,
      status: response.status,
      width: image.naturalWidth,
    }
  }, candidate.imageUrl)
  assert.deepEqual(resource, { bytes: receipt.image_byte_size, height: 64, status: 200, width: 96 })
  assert.equal((await tab(projectId)).layers.length, 0)
  await window.getByRole('button', { name: 'Close project queue', exact: true }).click()
  await expect.poll(resultVisibleOnCanvas).toBe(true)
  await screenshot('04-completed-staging-result')
  assert.match(candidate.thumbnailUrl, /^igs-staging:\/\/thumbnail\//)
  assert.notEqual(candidate.thumbnailUrl, candidate.imageUrl)
  const thumbnailButton = window.getByRole('button', { name: 'Preview candidate 1', exact: true })
  const thumbnailImage = thumbnailButton.locator('img')
  await expect(thumbnailImage).toHaveAttribute('src', candidate.thumbnailUrl)
  await expect
    .poll(() =>
      thumbnailImage.evaluate((image) => ({
        height: image.naturalHeight,
        width: image.naturalWidth,
      })),
    )
    .toEqual({ height: 64, width: 96 })
  const thumbnailResource = await window.evaluate(async (url) => {
    const response = await fetch(url)
    const bytes = new Uint8Array(await response.arrayBuffer())
    return {
      bytes: bytes.length,
      contentType: response.headers.get('content-type'),
      status: response.status,
    }
  }, candidate.thumbnailUrl)
  assert.deepEqual(thumbnailResource, { bytes: 658, contentType: 'image/webp', status: 200 })
  checked(
    'Completed result strip loads a distinct signed WEBP while the full PNG remains available',
    {
      fullImage: resource,
      thumbnail: thumbnailResource,
      thumbnailDimensions: { height: 64, width: 96 },
    },
  )

  async function viewCompletedResultFromQueue(hasThumbnail, evidenceName) {
    const beforeNavigation = await progressDurableState(projectId, packagePath)
    const undoRedo = {
      redo: await window.getByRole('button', { name: 'Redo', exact: true }).isEnabled(),
      undo: await window.getByRole('button', { name: 'Undo', exact: true }).isEnabled(),
    }
    await window.getByRole('button', { name: 'Hide candidate preview', exact: true }).click()
    await window.getByRole('button', { name: 'Collapse Generation Results', exact: true }).click()
    await expect(
      window.getByRole('button', { name: 'Preview candidate 1', exact: true }),
    ).toHaveCount(0)
    await window.getByRole('tab', { name: 'Home', exact: true }).click()
    await window.getByRole('button', { name: 'Open Queue Manager', exact: true }).click()
    const resultManager = window.getByRole('dialog', { name: 'Queue Manager', exact: true })
    const resultRow = resultManager.locator(
      `[data-testid="queue-job-row"][data-job-id="${receipt.queue_item_id}"]`,
    )
    await resultRow.getByRole('button', { name: 'Show job details', exact: true }).click()
    const queueRowThumbnail = resultRow.locator('[data-testid="queue-job-thumbnail"]')
    const queueDetailThumbnail = resultManager.locator('[data-testid="queue-result-thumbnail"]')
    for (const [thumbnail, placeholderId] of [
      [queueRowThumbnail, 'queue-job-thumbnail-placeholder'],
      [queueDetailThumbnail, 'queue-result-thumbnail-placeholder'],
    ]) {
      if (hasThumbnail) {
        await expect(thumbnail.locator('img')).toHaveAttribute('src', candidate.thumbnailUrl)
        await expect
          .poll(() =>
            thumbnail.locator('img').evaluate((image) => ({
              height: image.naturalHeight,
              width: image.naturalWidth,
            })),
          )
          .toEqual({ height: 64, width: 96 })
      } else {
        await expect(thumbnail.locator('img')).toHaveCount(0)
        await expect(thumbnail.locator(`[data-testid="${placeholderId}"]`)).toBeVisible()
      }
    }
    const viewResult = resultManager.getByRole('button', { name: 'View result', exact: true })
    await expect(viewResult).toBeEnabled()
    await screenshotManagerAtViewport(900, 620, evidenceName)
    const thumbnailBounds = await queueRowThumbnail.boundingBox()
    assert.ok(thumbnailBounds)
    assert.equal(thumbnailBounds.width, 48)
    assert.equal(thumbnailBounds.height, 48)
    await viewResult.click()
    await expect(resultManager).toHaveCount(0)
    await expect(window.getByRole('tab', { name: projectTitle, exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(
      window.getByRole('button', { name: 'Preview candidate 1', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(
      window.getByRole('button', { name: 'Hide candidate preview', exact: true }),
    ).toBeVisible()
    await expect(
      window.getByRole('button', { name: 'Collapse Generation Results', exact: true }),
    ).toBeVisible()
    await expect(window.getByLabel('Select candidate 1')).toBeChecked()
    await expect.poll(resultVisibleOnCanvas).toBe(true)
    await screenshot(`${evidenceName}-focused-project`)
    assert.deepEqual(await progressDurableState(projectId, packagePath), beforeNavigation)
    assert.deepEqual(
      {
        redo: await window.getByRole('button', { name: 'Redo', exact: true }).isEnabled(),
        undo: await window.getByRole('button', { name: 'Undo', exact: true }).isEnabled(),
      },
      undoRedo,
    )
    await resizeNativeWindow(1380, 900)
    checked(
      hasThumbnail
        ? 'Queue Manager loads bounded row/detail WEBP; View result reopens hidden/collapsed exact candidate without changing Project or selection'
        : 'Queue Manager placeholder keeps View result available; repeated navigation reopens the same full PNG and preserves selection',
      {
        candidateId: candidate.candidateId,
        packageSha256: beforeNavigation.packageSha256,
        queueItemId: receipt.queue_item_id,
        stagingSessionId: candidate.stagingSessionId,
        thumbnailBounds,
      },
    )
  }
  await viewCompletedResultFromQueue(true, '04b-queue-cached-result')

  const cachePath = path.join(
    appDataRoot,
    'recovery',
    'generation-staging',
    projectId,
    candidate.stagingSessionId,
    'thumbnail-cache',
    `${candidate.candidateId}.webp`,
  )
  const cacheBytes = readFileSync(cachePath)
  const beforeDamagedCache = await progressDurableState(projectId, packagePath)
  writeFileSync(cachePath, 'damaged optional derivative', { mode: 0o600 })
  const damagedResource = await window.evaluate(
    async (url) => (await fetch(url, { cache: 'no-store' })).status,
    candidate.thumbnailUrl,
  )
  assert.equal(damagedResource, 404)
  await window.getByRole('button', { name: 'Refresh results', exact: true }).click()
  await expect(thumbnailImage).toHaveCount(0)
  await expect(thumbnailButton.locator('.candidate-placeholder')).toBeVisible()
  await expect(thumbnailButton).toHaveAttribute(
    'title',
    'Thumbnail unavailable. Select to preview the full image.',
  )
  await expect(thumbnailButton).toHaveAttribute('aria-pressed', 'true')
  await expect(window.getByLabel('Select candidate 1')).toBeChecked()
  await thumbnailButton.click()
  await expect.poll(resultVisibleOnCanvas).toBe(true)
  assert.equal(
    await window.evaluate(async (url) => (await fetch(url)).status, candidate.imageUrl),
    200,
  )
  const withoutThumbnail = await api('listGenerationResults', projectId)
  const fullCandidate = { ...candidate }
  delete fullCandidate.thumbnailUrl
  assert.deepEqual(withoutThumbnail, { ...completed, candidates: [fullCandidate] })
  await screenshot('04a-damaged-thumbnail-placeholder')
  await viewCompletedResultFromQueue(false, '04c-queue-placeholder-result')
  await window.getByRole('button', { name: 'Open Queue Manager', exact: true }).click()
  const repairManager = window.getByRole('dialog', { name: 'Queue Manager', exact: true })
  const repairRow = repairManager.locator(
    `[data-testid="queue-job-row"][data-job-id="${receipt.queue_item_id}"]`,
  )
  await repairRow.getByRole('button', { name: 'Show job details', exact: true }).click()
  await expect(repairRow.locator('[data-testid="queue-job-thumbnail"] img')).toHaveCount(0)
  await expect(repairManager.locator('[data-testid="queue-result-thumbnail"] img')).toHaveCount(0)
  writeFileSync(cachePath, cacheBytes, { mode: 0o600 })
  await repairManager.getByRole('button', { name: 'Refresh', exact: true }).click()
  for (const restored of [
    repairRow.locator('[data-testid="queue-job-thumbnail"] img'),
    repairManager.locator('[data-testid="queue-result-thumbnail"] img'),
  ]) {
    await expect(restored).toHaveAttribute('src', candidate.thumbnailUrl)
    await expect.poll(() => restored.evaluate((image) => image.naturalWidth)).toBe(96)
  }
  await screenshotManagerAtViewport(900, 620, '04d-queue-restored-cache')
  await repairManager.getByRole('button', { name: 'Close Queue Manager', exact: true }).click()
  await expect(repairManager).toHaveCount(0)
  await resizeNativeWindow(1380, 900)
  await expect(thumbnailImage).toHaveAttribute('src', candidate.thumbnailUrl)
  assert.deepEqual(await progressDurableState(projectId, packagePath), beforeDamagedCache)
  checked(
    'One Queue Manager Refresh rereads restored cache and retries the same signed WEBP for row and detail',
    {
      candidateId: candidate.candidateId,
      restoredThumbnailUrl: candidate.thumbnailUrl,
    },
  )
  checked(
    'Damaged thumbnail GET is refused; placeholder retains focus, selection, full preview and exact durable state',
    {
      candidateId: candidate.candidateId,
      damagedResourceStatus: damagedResource,
      fullImageStatus: 200,
      packageSha256: beforeDamagedCache.packageSha256,
    },
  )
  checked(
    'UI Cancel confirms actual child exit; frozen sibling drains to verified staging without adding layers',
    {
      canceledJobId: state.runningJobId,
      completedJobId: receipt.queue_item_id,
      candidateId: candidate.candidateId,
      resource,
    },
  )

  await count.fill('1')
  await count.press('Enter')
  const confirmation = window.getByRole('dialog', {
    name: 'Replace temporary generation results',
    exact: true,
  })
  const requestsBeforeConfirmation = lines(peerRequests).length
  const retainedRows = await rows(projectId)
  for (const keep of ['Escape', 'Keep results']) {
    await generate.click()
    await confirmation.waitFor()
    await expect(confirmation).toContainText('1 temporary result')
    if (keep === 'Escape') {
      await screenshot('05-replacement-confirmation')
      await window.keyboard.press('Escape')
    } else await confirmation.getByRole('button', { name: 'Keep results', exact: true }).click()
    await expect(confirmation).toHaveCount(0)
    assert.equal(lines(peerRequests).length, requestsBeforeConfirmation)
    assert.deepEqual(await rows(projectId), retainedRows)
    assert.deepEqual(await api('listGenerationResults', projectId), completed)
  }
  checked('Escape and Keep results preserve exact candidates/jobs and send no worker request')
  await generate.click()
  await confirmation.waitFor()
  await confirmation.getByRole('button', { name: 'Discard and Generate', exact: true }).click()
  await expect.poll(() => generations().length, { timeout: 20_000 }).toBe(3)
  const third = generations()[2]
  assert.equal(third.request.job.bbox.width, 104)
  assert.equal(third.request.job.prompts.positive, 'edited after admission')
  assert.equal((await api('listGenerationResults', projectId)).candidates.length, 0)
  const discarded = await liveDatabase.db
    .selectFrom('generation_staging_discarded_session')
    .selectAll()
    .where('local_project_key', '=', projectId)
    .where('staging_session_id', '=', receipt.staging_session_id)
    .execute()
  assert.equal(discarded.length, 1)
  release(third)
  await expect
    .poll(async () => (await api('listGenerationResults', projectId)).candidates.length, {
      timeout: 20_000,
    })
    .toBe(1)
  await expect.poll(async () => (await api('getGenerationState', projectId)).phase).toBe('idle')
  const replacement = await api('listGenerationResults', projectId)
  assert.notEqual(replacement.candidates[0].candidateId, candidate.candidateId)
  assert.equal((await tab(projectId)).layers.length, 0)
  assert.deepEqual(readFileSync(packagePath), beforeGenerate)
  await screenshot('06-replacement-completed')
  checked(
    'Discard and Generate replaces reviewed staging only after new admission and uses the latest document',
    {
      oldCandidateId: candidate.candidateId,
      newCandidateId: replacement.candidates[0].candidateId,
    },
  )
  const finalRows = await rows(projectId)
  assert.deepEqual(
    finalRows.map((row) => row.status),
    ['canceled', 'completed', 'completed'],
  )
  report.generateFinalRows = finalRows.map(
    ({ batch_id, document_id, id, staging_session_id, status }) => ({
      batch_id,
      document_id,
      id,
      staging_session_id,
      status,
    }),
  )

  // Retry must observe the original admission, even after the ordinary Project editor has
  // acknowledged another seed, prompt and bbox. These edits are intentionally left unsaved.
  await window.locator('input[aria-label="Generation seed"]').fill('99')
  await expect.poll(async () => (await tab(projectId)).generationDraft.seed.value).toBe(99)
  await window.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  const beforeManagerTab = await tab(projectId)
  assert.equal(beforeManagerTab.generationDraft.positivePrompt.text, 'edited after admission')
  assert.equal(beforeManagerTab.primaryBbox.width, 104)
  const queuePackageSha256 = digest(readFileSync(packagePath))
  assert.equal(queuePackageSha256, digest(beforeGenerate))
  const candidateReceipt = await liveDatabase.db
    .selectFrom('generation_candidate_receipt')
    .selectAll()
    .where('candidate_id', '=', replacement.candidates[0].candidateId)
    .executeTakeFirstOrThrow()
  const preservedResults = await api('listGenerationResults', projectId)

  async function assertQueueActionsPreserveProject() {
    assert.deepEqual(await tab(projectId), beforeManagerTab)
    assert.deepEqual(await api('listGenerationResults', projectId), preservedResults)
    assert.equal(digest(readFileSync(packagePath)), queuePackageSha256)
    assert.equal((await readIgsPackage(packagePath)).project.documentId, created.documentId)
  }

  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  const openManager = window.getByRole('button', { name: 'Open Queue Manager', exact: true })
  await openManager.click()
  const manager = window.getByRole('dialog', { name: 'Queue Manager', exact: true })
  const managerRow = (id) => manager.locator(`[data-testid="queue-job-row"][data-job-id="${id}"]`)
  await expect(manager).toBeVisible()
  const initialManagerItems = await managerItems()
  assert.equal(initialManagerItems.length, 3)
  assert.deepEqual(initialManagerItems.map(({ status }) => status).sort(), [
    'canceled',
    'completed',
    'completed',
  ])
  await expect(manager.getByRole('article')).toHaveCount(3)
  await managerRow(receipt.queue_item_id)
    .getByRole('button', { name: 'Show job details', exact: true })
    .click()
  await expect(manager.getByRole('button', { name: 'View result', exact: true })).toHaveCount(0)
  await expect(manager.locator('[data-testid="queue-result-section"]')).toContainText(
    'The local candidate is unavailable. It may have been added or discarded.',
  )
  checked('Discarded completed history retains its row without exposing View result')
  const sourceItem = initialManagerItems.find(({ id }) => id === state.runningJobId)
  assert.ok(sourceItem)
  assert.equal(sourceItem.status, 'canceled')
  assert.equal(sourceItem.documentId, created.documentId)
  assert.equal(sourceItem.projectKey, projectId)
  assert.equal(sourceItem.projectName, projectTitle)
  assert.equal(sourceItem.details.prompt, 'native admission snapshot')
  assert.equal(sourceItem.details.sampling.seed, 42)
  assert.deepEqual(sourceItem.details.size, { height: 64, width: 96 })
  await managerRow(sourceItem.id)
    .getByRole('button', { name: 'Show job details', exact: true })
    .click()
  const details = manager.locator('[data-testid="queue-job-details"]')
  await expect(details).toContainText('native admission snapshot')
  await expect(managerRow(sourceItem.id)).toContainText(projectTitle)
  await expect(details.getByRole('heading', { level: 2 })).toHaveText(projectTitle)
  await expect(details).toContainText('Seed')
  await expect(details).toContainText('42')
  await screenshot('07-native-queue-manager-history')
  await assertQueueActionsPreserveProject()
  checked(
    'App-level Queue Manager opens from Home and displays real terminal history and frozen details',
    {
      candidateId: replacement.candidates[0].candidateId,
      counts: (await api('getGenerationQueue')).counts,
      packageSha256: queuePackageSha256,
    },
  )

  const sourceReview = { id: sourceItem.id, statusSequence: sourceItem.statusSequence }
  await managerRow(sourceItem.id).getByRole('button', { name: 'Retry job', exact: true }).click()
  await expect.poll(() => generations().length, { timeout: 20_000 }).toBe(4)
  const retriedRequest = generations()[3]
  assert.equal(retriedRequest.request.job.prompts.positive, first.request.job.prompts.positive)
  assert.deepEqual(retriedRequest.request.job.prompts, first.request.job.prompts)
  assert.deepEqual(retriedRequest.request.job.sampling, first.request.job.sampling)
  assert.equal(retriedRequest.request.job.sampling.cfgRescale, 0.7)
  assert.equal(beforeManagerTab.generationDraft.cfgRescale, 0.2)
  assert.deepEqual(retriedRequest.request.job.bbox, first.request.job.bbox)
  assert.equal(retriedRequest.request.job.target.sha256, first.request.job.target.sha256)
  const retryRows = await rows(projectId)
  const retriedRow = retryRows.find(({ status }) => status === 'running')
  assert.ok(retriedRow)
  assert.notEqual(retriedRow.id, sourceItem.id)
  assert.notEqual(retriedRow.staging_session_id, finalRows[0].staging_session_id)
  assert.equal(retriedRow.document_id, created.documentId)
  assert.equal(retriedRow.frozen_payload_json, finalRows[0].frozen_payload_json)
  assert.equal(
    retryRows.find(({ id }) => id === sourceItem.id).status_sequence,
    sourceReview.statusSequence + 1,
  )

  await managerRow(retriedRow.id)
    .getByRole('button', { name: 'Show job details', exact: true })
    .click()
  const retriedProgress = managerRow(retriedRow.id).locator('[data-testid="generation-progress"]')
  const beforeRetryProgress = await progressDurableState(projectId, packagePath)
  await watchProgress()
  sendProgress(retriedRequest, 1)
  const retryFirstProgress = await waitForProgress(retriedRequest, retriedRow, 1)
  await expect(retriedProgress).toContainText('Denoising step 1 of 2')
  await expect(details.locator('[data-testid="generation-progress"]')).toContainText(
    'Denoising step 1 of 2',
  )
  sendProgress(retriedRequest, 2)
  const retryFinalProgress = await waitForProgress(retriedRequest, retriedRow, 2)
  assert.ok(retryFinalProgress.revision > retryFirstProgress.revision)
  await expect(retriedProgress).toContainText('Denoising step 2 of 2')
  await expect(retriedProgress.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  await expect(managerRow(retriedRow.id)).toHaveAttribute('data-status', 'running')
  assert.deepEqual(await progressDurableState(projectId, packagePath), beforeRetryProgress)
  const retryProgressEvents = await stopWatchingProgress()
  assert.equal(retryProgressEvents.queueInvalidations, 0)
  assert.deepEqual(retryProgressEvents.events, [retryFirstProgress, retryFinalProgress])
  await assertQueueActionsPreserveProject()
  await screenshot('07a-native-retry-denoising-progress')

  // Hold the genuine retry in its one running slot. Direct fixture publication supplies only
  // the neighboring pending-cancel and failed-display preconditions, with their own verified
  // input directory/manifest identities. It does not substitute any Queue Manager action.
  const pendingFixture = await seedQueueFixture(finalRows[0], 'pending')
  const failedFixture = await seedQueueFixture(finalRows[0], 'failed')
  await window.keyboard.press('Escape')
  await expect(manager).toHaveCount(0)
  await openManager.click()
  await expect(manager.getByRole('article')).toHaveCount(6)
  const fiveStatusResponse = await apiResult('getGenerationQueue')
  assert.equal(fiveStatusResponse.ok, true, JSON.stringify(fiveStatusResponse))
  const fiveStatusPage = fiveStatusResponse.value
  report.queueManagerResponseMeasurement = {
    itemCount: fiveStatusPage.items.length,
    serializedUtf8Bytes: Buffer.byteLength(JSON.stringify(fiveStatusResponse), 'utf8'),
    statuses: fiveStatusPage.counts,
  }
  assert.deepEqual(fiveStatusPage.counts, {
    canceled: 1,
    completed: 2,
    failed: 1,
    pending: 1,
    running: 1,
  })
  assert.deepEqual([...new Set(fiveStatusPage.items.map(({ status }) => status))].sort(), [
    'canceled',
    'completed',
    'failed',
    'pending',
    'running',
  ])
  for (const item of fiveStatusPage.items) {
    await expect(managerRow(item.id)).toHaveAttribute('data-status', item.status)
  }
  await managerRow(failedFixture.id)
    .getByRole('button', { name: 'Show job details', exact: true })
    .click()
  await expect(details).toContainText(
    'The generation worker did not return a valid completed result.',
  )
  await screenshot('08-native-queue-manager-all-statuses')
  for (const [width, height] of [
    [900, 620],
    [1440, 900],
    [1920, 1080],
  ]) {
    await screenshotManagerAtViewport(width, height)
  }
  await resizeNativeWindow(1380, 900)

  // The held generation still owns the actual RuntimeManager child. Retry must publish its
  // independent frozen pending attempt before that child exits, without using a second worker
  // to compose or qualify the runtime. The failed row above is a precondition; this action is
  // deliberately driven through the real Queue Manager rather than direct fixture insertion.
  const beforeBusyRetryRows = await rows(projectId)
  const busyRetryReview = { id: failedFixture.id, statusSequence: failedFixture.status_sequence }
  const beforeBusyRetryRequests = lines(peerRequests)
  const beforeBusyRetryLaunches = lines(peerLaunches)
  const beforeBusyRetrySeedCursor = await liveDatabase.db
    .selectFrom('generation_seed_cursor')
    .selectAll()
    .where('local_project_key', '=', projectId)
    .execute()
  assert.equal((await api('getGenerationState', projectId)).runningJobId, retriedRow.id)
  assert.deepEqual(await api('getGenerationProgress'), retryFinalProgress)
  process.kill(retriedRequest.pid, 0)
  const busyRetryButton = managerRow(failedFixture.id).getByRole('button', {
    name: 'Retry job',
    exact: true,
  })
  await expect(busyRetryButton).toBeEnabled()
  await screenshotManagerAtViewport(900, 620, '08a-native-busy-retry-enabled')
  await busyRetryButton.click()
  await expect.poll(async () => (await rows(projectId)).length).toBe(7)
  const afterBusyRetryRows = await rows(projectId)
  const busyRetryRow = afterBusyRetryRows.find(
    ({ id }) => !beforeBusyRetryRows.some((oldRow) => oldRow.id === id),
  )
  assert.ok(busyRetryRow)
  assert.equal(busyRetryRow.status, 'pending')
  assert.equal(busyRetryRow.status_sequence, 0)
  assert.equal(busyRetryRow.started_at, null)
  assert.equal(busyRetryRow.finished_at, null)
  assert.equal(busyRetryRow.document_id, failedFixture.document_id)
  assert.equal(busyRetryRow.local_project_key, failedFixture.local_project_key)
  assert.notEqual(busyRetryRow.id, failedFixture.id)
  assert.notEqual(busyRetryRow.batch_id, failedFixture.batch_id)
  assert.notEqual(busyRetryRow.staging_session_id, failedFixture.staging_session_id)
  assert.equal(busyRetryRow.frozen_payload_json, failedFixture.frozen_payload_json)
  const busyRetrySource = afterBusyRetryRows.find(({ id }) => id === failedFixture.id)
  assert.equal(busyRetrySource.status, 'failed')
  assert.equal(busyRetrySource.status_sequence, failedFixture.status_sequence + 1)
  assert.deepEqual(
    afterBusyRetryRows.find(({ id }) => id === retriedRow.id),
    beforeBusyRetryRows.find(({ id }) => id === retriedRow.id),
  )
  const busyRetryInputs = path.join(appDataRoot, 'generation-inputs', busyRetryRow.id)
  const failedFixtureInputs = path.join(appDataRoot, 'generation-inputs', failedFixture.id)
  const busyRetryManifest = JSON.parse(
    readFileSync(path.join(busyRetryInputs, 'manifest.json'), 'utf8'),
  )
  const failedFixtureManifest = JSON.parse(
    readFileSync(path.join(failedFixtureInputs, 'manifest.json'), 'utf8'),
  )
  assert.deepEqual(busyRetryManifest, { ...failedFixtureManifest, queueItemId: busyRetryRow.id })
  assert.equal(
    digest(readFileSync(path.join(busyRetryInputs, 'target.png'))),
    digest(readFileSync(path.join(failedFixtureInputs, 'target.png'))),
  )
  await expect(managerRow(busyRetryRow.id)).toHaveAttribute('data-status', 'pending')
  await expect(
    managerRow(busyRetryRow.id).getByRole('button', { name: 'Cancel job', exact: true }),
  ).toBeEnabled()
  await managerRow(busyRetryRow.id)
    .getByRole('button', { name: 'Show job details', exact: true })
    .click()
  await expect(details).toContainText('native admission snapshot')
  await expect(details).toContainText('42')
  await screenshotManagerAtViewport(900, 620, '08b-native-busy-retry-pending')
  assert.deepEqual(lines(peerRequests), beforeBusyRetryRequests)
  assert.deepEqual(lines(peerLaunches), beforeBusyRetryLaunches)
  assert.equal(generations().length, 4)
  process.kill(retriedRequest.pid, 0)
  assert.equal((await api('getGenerationState', projectId)).runningJobId, retriedRow.id)
  assert.deepEqual(await api('getGenerationProgress'), retryFinalProgress)
  await expect(retriedProgress).toContainText('Denoising step 2 of 2')
  await assertQueueActionsPreserveProject()
  assert.deepEqual(
    await liveDatabase.db
      .selectFrom('generation_seed_cursor')
      .selectAll()
      .where('local_project_key', '=', projectId)
      .execute(),
    beforeBusyRetrySeedCursor,
  )
  checked(
    'UI Retry during held worker generation publishes a frozen pending attempt without another child, composition or running-progress change',
    {
      activeJobId: retriedRow.id,
      activePid: retriedRequest.pid,
      activeRequestId: retriedRequest.request.requestId,
      admittedJobId: busyRetryRow.id,
      frozenPayloadSha256: digest(Buffer.from(busyRetryRow.frozen_payload_json)),
      generationRequests: generations().length,
      sourceId: failedFixture.id,
      sourceStatusSequence: busyRetrySource.status_sequence,
      unchangedProgress: retryFinalProgress,
    },
  )

  const staleBusyRetry = await apiResult('retryGenerationJob', busyRetryReview)
  assert.equal(staleBusyRetry.ok, false)
  assert.equal(staleBusyRetry.error.code, 'GENERATION_INVALID_REQUEST')
  assert.deepEqual(await rows(projectId), afterBusyRetryRows)
  assert.deepEqual(lines(peerRequests), beforeBusyRetryRequests)
  assert.deepEqual(lines(peerLaunches), beforeBusyRetryLaunches)
  assert.deepEqual(await api('getGenerationProgress'), retryFinalProgress)
  await assertQueueActionsPreserveProject()
  checked(
    'A duplicate reviewed busy Retry is refused without consuming another row or source revision',
    {
      admittedJobId: busyRetryRow.id,
      errorCode: staleBusyRetry.error.code,
      reviewed: busyRetryReview,
      sourceStatusSequence: busyRetrySource.status_sequence,
    },
  )

  await managerRow(busyRetryRow.id).getByRole('button', { name: 'Cancel job', exact: true }).click()
  await expect
    .poll(async () => (await rows(projectId)).find(({ id }) => id === busyRetryRow.id).status)
    .toBe('canceled')
  await expect(managerRow(busyRetryRow.id)).toHaveAttribute('data-status', 'canceled')
  assert.deepEqual(lines(peerRequests), beforeBusyRetryRequests)
  assert.deepEqual(lines(peerLaunches), beforeBusyRetryLaunches)
  process.kill(retriedRequest.pid, 0)
  assert.equal((await api('getGenerationState', projectId)).runningJobId, retriedRow.id)
  assert.deepEqual(await api('getGenerationProgress'), retryFinalProgress)
  await assertQueueActionsPreserveProject()
  checked(
    'UI Cancel of the busy-admitted pending Retry leaves the active worker and Project intact',
    {
      activeJobId: retriedRow.id,
      activePid: retriedRequest.pid,
      canceledPendingJobId: busyRetryRow.id,
      generationRequests: generations().length,
    },
  )
  await resizeNativeWindow(1380, 900)
  await managerRow(pendingFixture.id)
    .getByRole('button', { name: 'Cancel job', exact: true })
    .click()
  await expect
    .poll(async () => (await rows(projectId)).find(({ id }) => id === pendingFixture.id).status)
    .toBe('canceled')
  await expect(managerRow(pendingFixture.id)).toHaveAttribute('data-status', 'canceled')
  assert.equal(generations().length, 4)
  assert.deepEqual(await api('getGenerationProgress'), retryFinalProgress)
  await expect(retriedProgress).toContainText('Denoising step 2 of 2')
  await managerRow(retriedRow.id).getByRole('button', { name: 'Cancel job', exact: true }).click()
  await expect.poll(async () => (await api('getGenerationState', projectId)).phase).toBe('idle')
  await expect(managerRow(retriedRow.id)).toHaveAttribute('data-status', 'canceled')
  await expect.poll(async () => (await api('getGenerationProgress')).current).toBe(null)
  await expect(retriedProgress).toHaveCount(0)
  assert.throws(() => process.kill(retriedRequest.pid, 0), { code: 'ESRCH' })
  assert.equal(generations().length, 4)
  await assertQueueActionsPreserveProject()
  checked(
    'UI Retry dispatches frozen prompt/seed/bbox; native list shows all five statuses and UI Cancel removes pending/running work',
    {
      currentDraftSeed: beforeManagerTab.generationDraft.seed.value,
      failedFixtureId: failedFixture.id,
      frozenBbox: retriedRequest.request.job.bbox,
      frozenSeed: retriedRequest.request.job.sampling.seed,
      pendingFixtureId: pendingFixture.id,
      progressEvents: retryProgressEvents.events,
      progressQueueInvalidations: retryProgressEvents.queueInvalidations,
      retriedJobId: retriedRow.id,
      seedBeforeAndAfter: preservedResults.lastActualSeed,
    },
  )

  const beforeStaleRows = await rows(projectId)
  const staleRetry = await apiResult('retryGenerationJob', sourceReview)
  assert.equal(staleRetry.ok, false)
  assert.equal(staleRetry.error.code, 'GENERATION_INVALID_REQUEST')
  assert.deepEqual(await rows(projectId), beforeStaleRows)
  assert.equal(generations().length, 4)
  await assertQueueActionsPreserveProject()
  checked(
    'Stale reviewed Retry is refused through native IPC without another job or Project/candidate/seed mutation',
    {
      errorCode: staleRetry.error.code,
      reviewed: sourceReview,
    },
  )

  const deleteConfirmation = window.getByRole('dialog', {
    name: 'Delete queue history',
    exact: true,
  })
  const beforeDeleteRows = await rows(projectId)
  for (const keep of ['Escape', 'Keep history']) {
    await managerRow(candidateReceipt.queue_item_id)
      .getByRole('button', { name: 'Delete job', exact: true })
      .click()
    await deleteConfirmation.waitFor()
    if (keep === 'Escape') {
      await screenshot('09-native-queue-delete-confirmation')
      await window.keyboard.press('Escape')
    } else {
      await deleteConfirmation.getByRole('button', { name: 'Keep history', exact: true }).click()
    }
    await expect(deleteConfirmation).toHaveCount(0)
    await expect(manager).toBeVisible()
    assert.deepEqual(await rows(projectId), beforeDeleteRows)
    await assertQueueActionsPreserveProject()
  }
  await managerRow(candidateReceipt.queue_item_id)
    .getByRole('button', { name: 'Delete job', exact: true })
    .click()
  await deleteConfirmation.getByRole('button', { name: 'Delete job', exact: true }).click()
  await expect(deleteConfirmation).toHaveCount(0)
  await expect(managerRow(candidateReceipt.queue_item_id)).toHaveCount(0)
  await expect.poll(async () => (await rows(projectId)).length).toBe(6)
  assert.equal(
    existsSync(path.join(appDataRoot, 'generation-inputs', candidateReceipt.queue_item_id)),
    false,
  )
  await assertQueueActionsPreserveProject()
  const candidateResourceAfterDelete = await window.evaluate(
    async (url) => (await fetch(url)).status,
    replacement.candidates[0].imageUrl,
  )
  assert.equal(candidateResourceAfterDelete, 200)
  checked(
    'Delete confirmation Escape/Keep preserves history; confirmed completed-row deletion preserves its candidate and resource',
    {
      candidateId: replacement.candidates[0].candidateId,
      deletedJobId: candidateReceipt.queue_item_id,
      resourceStatus: candidateResourceAfterDelete,
    },
  )

  const clearConfirmation = window.getByRole('dialog', { name: 'Clear queue history', exact: true })
  const beforePruneRows = await rows(projectId)
  async function reviewPrune() {
    await manager.getByRole('button', { name: 'Clear queue history', exact: true }).click()
    await window.getByText('All terminal jobs', { exact: true }).click()
    await clearConfirmation.waitFor()
  }
  for (const keep of ['Escape', 'Keep history']) {
    await reviewPrune()
    if (keep === 'Escape') await window.keyboard.press('Escape')
    else await clearConfirmation.getByRole('button', { name: 'Keep history', exact: true }).click()
    await expect(clearConfirmation).toHaveCount(0)
    await expect(manager).toBeVisible()
    assert.deepEqual(await rows(projectId), beforePruneRows)
    await assertQueueActionsPreserveProject()
  }
  await reviewPrune()
  await clearConfirmation.getByRole('button', { name: 'Clear history', exact: true }).click()
  await expect(clearConfirmation).toHaveCount(0)
  await expect.poll(async () => (await rows(projectId)).length).toBe(0)
  await expect(manager.getByRole('article')).toHaveCount(0)
  for (const { id } of beforePruneRows) {
    assert.equal(existsSync(path.join(appDataRoot, 'generation-inputs', id)), false)
  }
  assert.deepEqual((await api('getGenerationQueue')).counts, {
    canceled: 0,
    completed: 0,
    failed: 0,
    pending: 0,
    running: 0,
  })
  await assertQueueActionsPreserveProject()
  assert.equal(
    await window.evaluate(
      async (url) => (await fetch(url)).status,
      replacement.candidates[0].imageUrl,
    ),
    200,
  )
  await screenshot('10-native-queue-manager-cleared-history')
  checked(
    'Clear confirmation Escape/Keep preserves history; confirmed terminal prune preserves candidates, actual seed, draft and exact .igs bytes',
    {
      candidateId: replacement.candidates[0].candidateId,
      packageSha256: queuePackageSha256,
      removedHistoryRows: beforePruneRows.length,
      retainedActualSeed: preservedResults.lastActualSeed,
    },
  )

  // Appending isolates the new admission cases from all earlier queue-history counts. The
  // controlled inference stays held until an actual UI cancellation/replacement or release.
  await manager.getByRole('button', { name: 'Close Queue Manager', exact: true }).click()
  await expect(manager).toHaveCount(0)
  const busyA = await createConfiguredProject(
    'Busy Generate A',
    'running A frozen prompt',
    17,
    96,
    installed.versionId,
  )
  const generationCountBeforeBusyA = generations().length
  await window.getByRole('button', { name: 'Generate', exact: true }).click()
  await expect
    .poll(() => generations().length, { timeout: 20_000 })
    .toBe(generationCountBeforeBusyA + 1)
  const activeA = generations().at(-1)
  const activeARow = (await rows(busyA.id)).find(({ status }) => status === 'running')
  assert.ok(activeA && activeARow)
  sendProgress(activeA, 1)
  let activeAProgress = await waitForProgress(activeA, activeARow, 1)
  const savedABytes = readFileSync(busyA.packagePath)
  const savedA = await tab(busyA.id)
  const inferenceBeforeB = inferenceLaunches()
  const derivativeCountBeforeB = derivativeLaunches().length
  const requestsBeforeB = lines(peerRequests)
  const aRowsBeforeB = await rows(busyA.id)
  const aResultsBeforeB = await api('listGenerationResults', busyA.id)

  const busyB = await createConfiguredProject(
    'Busy Generate B',
    'B queued frozen prompt',
    23,
    104,
    installed.versionId,
  )
  assert.deepEqual(inferenceLaunches(), inferenceBeforeB)
  assert.equal(derivativeLaunches().length, derivativeCountBeforeB)
  const savedBBytes = readFileSync(busyB.packagePath)
  const busyBGenerate = window.getByRole('button', { name: /^(?:loading )?Generate$/ })
  await expect(busyBGenerate).toBeEnabled()
  writeFileSync(path.join(fixtureRoot, 'hold-cpu-compose'), 'hold CPU target before publication')
  await busyBGenerate.click()
  await expect
    .poll(
      () =>
        lines(peerRequests).filter(
          ({ role, request }) => role === 'derivatives' && request.type === 'compose-target',
        ).length,
    )
    .toBe(1)
  const heldBComposition = lines(peerRequests).find(
    ({ role, request }) => role === 'derivatives' && request.type === 'compose-target',
  )
  assert.ok(heldBComposition)
  await expect(busyBGenerate).toBeDisabled()
  assert.equal((await api('getGenerationState', busyB.id)).phase, 'preparing')
  assert.equal((await rows(busyB.id)).length, 0)
  assert.deepEqual(inferenceLaunches(), inferenceBeforeB)
  assert.doesNotThrow(() => process.kill(heldBComposition.pid, 0))
  assert.doesNotThrow(() => process.kill(activeA.pid, 0))
  sendProgress(activeA, 2)
  const progressDuringBPreparation = await waitForProgress(activeA, activeARow, 2)
  assert.ok(progressDuringBPreparation.revision > activeAProgress.revision)
  activeAProgress = progressDuringBPreparation
  await screenshot('10b-native-busy-generate-B-preparing')
  checked(
    'Held CPU target keeps B visibly preparing without a premature queue row while independent A inference progress continues',
    { activeJobId: activeARow.id, activeProgress: activeAProgress, cpuPid: heldBComposition.pid },
  )
  writeFileSync(
    path.join(fixtureRoot, 'release-compose-' + heldBComposition.request.requestId),
    'release the reviewed CPU target',
  )
  rmSync(path.join(fixtureRoot, 'hold-cpu-compose'))
  await expect.poll(async () => (await rows(busyB.id)).length).toBe(1)
  await expect(busyBGenerate).toBeEnabled()
  const pendingB = (await rows(busyB.id))[0]
  assert.equal(pendingB.status, 'pending')
  assert.equal(pendingB.started_at, null)
  assert.equal(pendingB.finished_at, null)
  assert.equal(pendingB.status_sequence, 0)
  assert.equal(pendingB.document_id, busyB.document.documentId)
  const frozenB = JSON.parse(pendingB.frozen_payload_json)
  assert.equal(frozenB.context.prompts.positive, 'B queued frozen prompt')
  assert.equal(frozenB.context.sampling.seed, 23)
  assert.deepEqual(frozenB.context.bbox, busyB.document.primaryBbox)
  assert.equal(frozenB.context.model.reference.localVersionId, installed.versionId)
  const bInputDirectory = path.join(appDataRoot, 'generation-inputs', pendingB.id)
  const bInputManifest = readFileSync(path.join(bInputDirectory, 'manifest.json'))
  const bTargetBytes = readFileSync(path.join(bInputDirectory, 'target.png'))
  assert.equal(digest(bTargetBytes), frozenB.context.target.sha256)
  assert.equal(JSON.parse(bInputManifest).queueItemId, pendingB.id)
  assert.deepEqual(inferenceLaunches(), inferenceBeforeB)
  assert.equal(generations().length, generationCountBeforeBusyA + 1)
  const bDerivative = derivativeLaunches().slice(derivativeCountBeforeB)
  assert.equal(bDerivative.length, 1)
  assert.deepEqual(bDerivative[0].args, ['-I', '-m', 'imagegen_worker'])
  assert.equal(bDerivative[0].executable, inferenceBeforeB.at(-1).executable)
  assert.equal(bDerivative[0].cudaVisibleDevices, '')
  assert.equal(bDerivative[0].offline, true)
  assert.throws(() => process.kill(bDerivative[0].pid, 0), { code: 'ESRCH' })
  assert.ok(lines(peerExits).some(({ pid, code }) => pid === bDerivative[0].pid && code === 0))
  assert.doesNotThrow(() => process.kill(activeA.pid, 0))
  const requestsDuringB = lines(peerRequests).slice(requestsBeforeB.length)
  assert.equal(requestsDuringB.length, 1)
  assert.equal(requestsDuringB[0].role, 'derivatives')
  assert.equal(requestsDuringB[0].request.type, 'compose-target')
  assert.deepEqual(requestsDuringB[0].request.bbox, busyB.document.primaryBbox)
  assert.deepEqual(await rows(busyA.id), aRowsBeforeB)
  assert.deepEqual(await tab(busyA.id), savedA)
  assert.deepEqual(await api('listGenerationResults', busyA.id), aResultsBeforeB)
  assert.deepEqual(await api('getGenerationProgress'), activeAProgress)
  assert.deepEqual(readFileSync(busyA.packagePath), savedABytes)
  assert.deepEqual(readFileSync(busyB.packagePath), savedBBytes)
  await window.getByRole('button', { name: /^Generation queue/ }).click()
  await expect(
    window.getByRole('complementary', { name: 'Project generation queue' }),
  ).toContainText('Pending')
  await screenshot('11-native-busy-generate-B-pending')
  await window.getByRole('button', { name: 'Close project queue', exact: true }).click()
  checked(
    'UI Generate for B admits a durable frozen pending job through one confirmed-exit CPU child while A inference and progress remain intact',
    {
      activeJobId: activeARow.id,
      activePid: activeA.pid,
      activeProgress: activeAProgress,
      admittedJobId: pendingB.id,
      cpuChild: bDerivative[0],
      frozenPayloadSha256: digest(Buffer.from(pendingB.frozen_payload_json)),
      targetSha256: digest(bTargetBytes),
    },
  )

  await busyB.region
    .getByRole('textbox', { name: 'Positive prompt', exact: true })
    .fill('B edited after busy admission')
  const bWidth = window.locator('input[aria-label="Generation area width"]')
  await bWidth.fill('96')
  await bWidth.press('Enter')
  await expect
    .poll(async () => (await tab(busyB.id)).generationDraft.positivePrompt.text)
    .toBe('B edited after busy admission')
  await expect.poll(async () => (await tab(busyB.id)).primaryBbox.width).toBe(96)
  assert.equal((await rows(busyB.id))[0].frozen_payload_json, pendingB.frozen_payload_json)
  assert.deepEqual(readFileSync(path.join(bInputDirectory, 'manifest.json')), bInputManifest)
  assert.deepEqual(readFileSync(path.join(bInputDirectory, 'target.png')), bTargetBytes)
  await openManager.click()
  await expect(manager).toBeVisible()
  await expect(managerRow(pendingB.id)).toHaveAttribute('data-status', 'pending')
  await expect(managerRow(activeARow.id)).toHaveAttribute('data-status', 'running')
  await managerRow(pendingB.id)
    .getByRole('button', { name: 'Show job details', exact: true })
    .click()
  await expect(details).toContainText('B queued frozen prompt')
  await expect(details).toContainText('104 × 64')
  await screenshotManagerAtViewport(900, 620, '12-native-busy-generate-B-frozen')
  await resizeNativeWindow(1380, 900)
  const childLaunchesBeforeCancelB = lines(peerLaunches)
  const requestsBeforeCancelB = lines(peerRequests)
  await managerRow(pendingB.id).getByRole('button', { name: 'Cancel job', exact: true }).click()
  await expect.poll(async () => (await rows(busyB.id))[0].status).toBe('canceled')
  await expect(managerRow(pendingB.id)).toHaveAttribute('data-status', 'canceled')
  assert.deepEqual(lines(peerLaunches), childLaunchesBeforeCancelB)
  assert.deepEqual(lines(peerRequests), requestsBeforeCancelB)
  assert.deepEqual(await rows(busyA.id), aRowsBeforeB)
  assert.deepEqual(await api('getGenerationProgress'), activeAProgress)
  assert.doesNotThrow(() => process.kill(activeA.pid, 0))
  assert.deepEqual(readFileSync(busyB.packagePath), savedBBytes)
  checked(
    'Post-admission UI edits cannot change B frozen input; canceling its pending job leaves A worker, document and progress intact',
    { activeJobId: activeARow.id, canceledJobId: pendingB.id, cpuPid: bDerivative[0].pid },
  )
  await manager.getByRole('button', { name: 'Close Queue Manager', exact: true }).click()
  await expect(manager).toHaveCount(0)
  await window.getByRole('tab', { name: busyA.title, exact: true }).click()
  const aGenerate = window.getByRole('button', { name: 'Generate', exact: true })
  await expect(aGenerate).toBeEnabled()
  const busyReplacementDialog = window.getByRole('dialog', {
    name: 'Replace temporary generation results',
    exact: true,
  })
  const beforeBusyReviewRequests = lines(peerRequests)
  const beforeBusyReviewLaunches = lines(peerLaunches)
  for (const keep of ['Escape', 'Keep results']) {
    await aGenerate.click()
    await busyReplacementDialog.waitFor()
    await expect(busyReplacementDialog).toContainText(
      '1 unfinished generation job will be canceled.',
    )
    if (keep === 'Escape') {
      await screenshot('13-native-busy-generate-A-confirmation')
      await window.keyboard.press('Escape')
    } else {
      await busyReplacementDialog.getByRole('button', { name: 'Keep results', exact: true }).click()
    }
    await expect(busyReplacementDialog).toHaveCount(0)
    assert.deepEqual(await rows(busyA.id), aRowsBeforeB)
    assert.deepEqual(lines(peerRequests), beforeBusyReviewRequests)
    assert.deepEqual(lines(peerLaunches), beforeBusyReviewLaunches)
    assert.deepEqual(await api('getGenerationProgress'), activeAProgress)
    assert.doesNotThrow(() => process.kill(activeA.pid, 0))
    assert.deepEqual(readFileSync(busyA.packagePath), savedABytes)
  }
  checked(
    'Generate on running A presents exact unfinished-job confirmation; Escape and Keep preserve the active job without composing another target',
    { activeJobId: activeARow.id, activePid: activeA.pid },
  )

  await busyA.region
    .getByRole('textbox', { name: 'Positive prompt', exact: true })
    .fill('A replacement frozen prompt')
  const aWidth = window.locator('input[aria-label="Generation area width"]')
  await aWidth.fill('104')
  await aWidth.press('Enter')
  await expect.poll(async () => (await tab(busyA.id)).primaryBbox.width).toBe(104)
  const derivativeCountBeforeAReplacement = derivativeLaunches().length
  await aGenerate.click()
  await busyReplacementDialog.waitFor()
  await busyReplacementDialog
    .getByRole('button', { name: 'Discard and Generate', exact: true })
    .click()
  await expect(busyReplacementDialog).toHaveCount(0)
  await expect
    .poll(() => generations().length, { timeout: 20_000 })
    .toBe(generationCountBeforeBusyA + 2)
  const replacementA = generations().at(-1)
  assert.ok(replacementA)
  assert.notEqual(replacementA.pid, activeA.pid)
  assert.throws(() => process.kill(activeA.pid, 0), { code: 'ESRCH' })
  const replacedARows = await rows(busyA.id)
  assert.equal(replacedARows.find(({ id }) => id === activeARow.id).status, 'canceled')
  const replacementARow = replacedARows.find(({ status }) => status === 'running')
  assert.ok(replacementARow)
  assert.notEqual(replacementARow.id, activeARow.id)
  assert.notEqual(replacementARow.batch_id, activeARow.batch_id)
  assert.notEqual(replacementARow.staging_session_id, activeARow.staging_session_id)
  assert.equal(replacementA.request.job.prompts.positive, 'A replacement frozen prompt')
  assert.equal(replacementA.request.job.bbox.width, 104)
  assert.equal(replacementA.request.job.sampling.seed, 17)
  assert.equal((await rows(busyB.id))[0].status, 'canceled')
  const replacementCpu = derivativeLaunches().slice(derivativeCountBeforeAReplacement)
  assert.equal(replacementCpu.length, 1)
  assert.equal(replacementCpu[0].cudaVisibleDevices, '')
  assert.throws(() => process.kill(replacementCpu[0].pid, 0), { code: 'ESRCH' })
  assert.equal((await api('getGenerationProgress')).current, null)
  assert.deepEqual(readFileSync(busyA.packagePath), savedABytes)
  await screenshot('14-native-busy-generate-A-replacement-running')
  release(replacementA)
  await expect
    .poll(async () => (await api('listGenerationResults', busyA.id)).candidates.length, {
      timeout: 20_000,
    })
    .toBe(1)
  await expect.poll(async () => (await api('getGenerationState', busyA.id)).phase).toBe('idle')
  const completedReplacement = await api('listGenerationResults', busyA.id)
  assert.equal(completedReplacement.candidates[0].queueItemId, replacementARow.id)
  assert.equal(completedReplacement.lastActualSeed, 17)
  assert.equal((await tab(busyA.id)).layers.length, 0)
  assert.deepEqual(readFileSync(busyA.packagePath), savedABytes)
  assert.deepEqual(readFileSync(busyB.packagePath), savedBBytes)
  checked(
    'Confirmed busy Generate replaces only reviewed A work and runs the new frozen attempt after old inference exit, without saving or accepting any candidate',
    {
      oldJobId: activeARow.id,
      oldPid: activeA.pid,
      replacementCpuPid: replacementCpu[0].pid,
      replacementJobId: replacementARow.id,
      replacementPid: replacementA.pid,
      resultCandidateId: completedReplacement.candidates[0].candidateId,
    },
  )

  report.finalRows = await rows(projectId)
  report.busyGenerateFinalRows = { a: await rows(busyA.id), b: await rows(busyB.id) }
  const cfgProject = await createConfiguredProject(
    'CFG Rescale acceptance',
    'frozen CFG Rescale acceptance',
    42,
    96,
    installed.versionId,
  )
  await window.getByText('Advanced Options', { exact: true }).click()
  const cfgControl = window.locator('input[aria-label="CFG Rescale"]')
  await cfgControl.fill('0.7')
  await cfgControl.press('Enter')
  await expect.poll(async () => (await tab(cfgProject.id)).generationDraft.cfgRescale).toBe(0.7)
  const previousRequestCount = generations().length
  await window.getByRole('button', { name: 'Generate', exact: true }).click()
  await expect.poll(() => generations().length, { timeout: 20_000 }).toBe(previousRequestCount + 1)
  const cfgRequest = generations().at(-1)
  assert.equal(cfgRequest.request.job.sampling.cfgRescale, 0.7)
  await cfgControl.fill('0.2')
  await cfgControl.press('Enter')
  await expect.poll(async () => (await tab(cfgProject.id)).generationDraft.cfgRescale).toBe(0.2)
  release(cfgRequest)
  await expect
    .poll(async () => (await api('listGenerationResults', cfgProject.id)).candidates.length, {
      timeout: 20_000,
    })
    .toBe(1)
  await expect.poll(async () => (await api('getGenerationState', cfgProject.id)).phase).toBe('idle')
  await window.getByRole('button', { name: 'Add 1 as Layer', exact: true }).click()
  await expect.poll(async () => (await tab(cfgProject.id)).layers.length).toBe(1)
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await tab(cfgProject.id)).dirty).toBe(false)
  const cfgSaved = (await readIgsPackage(cfgProject.packagePath)).project
  assert.equal(cfgSaved.generationDraft.cfgRescale, 0.2)
  assert.equal(cfgSaved.layers[0].generationProvenance.generationConfiguration.cfgRescale, 0.7)
  await window.getByRole('button', { name: 'Close CFG Rescale acceptance', exact: true }).click()
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: 'Open CFG Rescale acceptance', exact: true }).click()
  await window.getByRole('tab', { name: 'CFG Rescale acceptance', exact: true }).waitFor()
  assert.equal((await tab(cfgProject.id)).generationDraft.cfgRescale, 0.2)
  await window
    .getByRole('button', { name: `Layer actions for ${cfgSaved.layers[0].name}`, exact: true })
    .click()
  await window.getByRole('menuitem', { name: 'Compare generation settings', exact: true }).click()
  const comparison = window.getByRole('dialog', {
    name: 'Compare generation settings',
    exact: true,
  })
  await expect(comparison.locator('.comparison-scroll')).toHaveAttribute('aria-busy', 'false')
  const cfgRow = comparison.locator('[data-setting="cfgRescale.value"]')
  await expect(cfgRow).toContainText('Changed')
  await expect(cfgRow).toContainText('0.7')
  await expect(cfgRow).toContainText('0.2')
  for (const [width, height] of [
    [1380, 900],
    [900, 620],
  ]) {
    await resizeNativeWindow(width, height)
    await screenshot(`21-cfg-rescale-comparison-${width}x${height}`)
    const bounds = await comparison.boundingBox()
    assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0)
    assert.ok(bounds.x + bounds.width <= width && bounds.y + bounds.height <= height)
  }
  await window.keyboard.press('Escape')
  checked(
    'CFG Rescale control freezes worker input and accepted provenance through Add, Save, reopen and comparison',
    {
      projectId: cfgProject.id,
      documentId: cfgSaved.documentId,
      frozen: 0.7,
      current: 0.2,
      requestId: cfgRequest.request.requestId,
      layerId: cfgSaved.layers[0].id,
    },
  )
  // Prepare a valid legacy v1 file directly; opening/resetting it is the behavior under test.
  await window.getByRole('button', { name: 'Close CFG Rescale acceptance', exact: true }).click()
  const legacyPackage = await readIgsPackage(cfgProject.packagePath)
  const legacyDocument = structuredClone(legacyPackage.project)
  legacyDocument.generationDraft.cfgRescale = 1
  const legacyAssets = {}
  for (const layer of legacyDocument.layers) {
    legacyAssets[layer.asset.path] = { bytes: await legacyPackage.readMember(layer.asset.path) }
  }
  await saveIgsPackage(cfgProject.packagePath, {
    assets: legacyAssets,
    project: legacyDocument,
    preview: {
      merged: await legacyPackage.readMember('preview/merged.png'),
      thumbnail: await legacyPackage.readMember('preview/thumbnail.webp'),
      rect: legacyPackage.manifest.preview.rect,
      status: legacyPackage.manifest.preview.status,
    },
  })
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: 'Open CFG Rescale acceptance', exact: true }).click()
  await window.getByRole('tab', { name: 'CFG Rescale acceptance', exact: true }).waitFor()
  assert.equal((await tab(cfgProject.id)).generationDraft.cfgRescale, 1)
  await window.getByText('Advanced Options', { exact: true }).click()
  await expect(window.locator('input[aria-label="CFG Rescale"]')).toHaveValue('1')
  await expect(window.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled()
  await expect(window.getByRole('alert')).toContainText(
    'This saved value is outside the currently supported range',
  )
  await screenshot('22-legacy-cfg-rescale-open')
  await window
    .getByRole('textbox', { name: 'Positive prompt', exact: true })
    .fill('legacy portable draft remains saveable')
  await expect
    .poll(async () => (await tab(cfgProject.id)).generationDraft.positivePrompt.text)
    .toBe('legacy portable draft remains saveable')
  await expect(window.getByRole('button', { name: 'Save Project', exact: true })).toBeEnabled()
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await tab(cfgProject.id)).dirty).toBe(false)
  assert.equal((await readIgsPackage(cfgProject.packagePath)).project.generationDraft.cfgRescale, 1)
  await window.getByRole('button', { name: 'Reset CFG Rescale', exact: true }).click()
  await expect
    .poll(async () => (await tab(cfgProject.id)).generationDraft.cfgRescale)
    .toBeUndefined()
  const resetDraft = await tab(cfgProject.id)
  await window.locator('input[aria-label="CFG Rescale"]').fill('oops')
  await expect(window.getByRole('button', { name: 'Save Project', exact: true })).toBeDisabled()
  await expect(window.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled()
  assert.deepEqual(await tab(cfgProject.id), resetDraft)
  await window.getByRole('button', { name: 'Reset CFG Rescale', exact: true }).click()
  await expect(window.getByRole('button', { name: 'Save Project', exact: true })).toBeEnabled()
  assert.equal((await readIgsPackage(cfgProject.packagePath)).project.generationDraft.cfgRescale, 1)
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await tab(cfgProject.id)).dirty).toBe(false)
  assert.equal(
    (await readIgsPackage(cfgProject.packagePath)).project.generationDraft.cfgRescale,
    undefined,
  )
  assert.equal(
    (await readIgsPackage(cfgProject.packagePath)).project.layers[0].generationProvenance
      .generationConfiguration.cfgRescale,
    0.7,
  )
  checked(
    'Legacy draft CFG Rescale 1 opens through Main/preload, refuses Generate and resets through ordinary UI without changing accepted provenance',
  )
  // Reuse the real accepted/saved opaque Raster as input. No renderer fixture setter
  // creates the new preparation, queue record, candidate or accepted provenance.
  await resizeNativeWindow(1380, 900)
  const denoising = window.locator('input[aria-label="Denoising Strength"]')
  await denoising.scrollIntoViewIfNeeded()
  await expect(denoising).toBeEnabled()
  await expect(denoising).toHaveValue('')
  await expect(window.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled()
  const unchangedOpaque = await tab(cfgProject.id)
  await denoising.fill('oops')
  await expect(window.getByRole('button', { name: 'Save Project', exact: true })).toBeDisabled()
  assert.deepEqual(await tab(cfgProject.id), unchangedOpaque)
  await denoising.fill('0.75')
  await denoising.press('Enter')
  await expect
    .poll(async () => (await tab(cfgProject.id)).generationDraft.sampling.denoisingStrength)
    .toBe(0.75)
  await expect(window.getByRole('button', { name: 'Generate', exact: true })).toBeEnabled()
  await screenshot('23-img2img-opaque-control-1380x900')
  const beforeImgCount = generations().length
  const beforeImgSaved = readFileSync(cfgProject.packagePath)
  const imgIterations = window.locator('input[aria-label="Images per click"]')
  await imgIterations.fill('1')
  await imgIterations.press('Enter')
  await expect(imgIterations).toHaveValue('1')
  await window.getByRole('button', { name: 'Generate', exact: true }).click()
  await expect.poll(() => generations().length, { timeout: 20_000 }).toBe(beforeImgCount + 1)
  const imgRequest = generations().at(-1)
  assert.equal(imgRequest.request.type, 'generate-illustrious-img2img')
  assert.equal(imgRequest.request.job.sampling.denoisingStrength, 0.75)
  assert.equal(imgRequest.request.job.target.sha256, cfgSaved.layers[0].asset.sha256)
  assert.equal(imgRequest.request.job.sampling.seed, 42)
  const imgRows = await rows(cfgProject.id)
  assert.equal(imgRows.at(-1).operation, 'illustrious-img2img')
  await denoising.fill('0.25')
  await denoising.press('Enter')
  await expect
    .poll(async () => (await tab(cfgProject.id)).generationDraft.sampling.denoisingStrength)
    .toBe(0.25)
  assert.equal(imgRequest.request.job.sampling.denoisingStrength, 0.75)
  assert.deepEqual(readFileSync(cfgProject.packagePath), beforeImgSaved)
  await openManager.click()
  await expect(manager).toBeVisible()
  await managerRow(imgRows.at(-1).id)
    .getByRole('button', { name: 'Show job details', exact: true })
    .click()
  const frozenStrengthDetail = manager
    .locator('[data-testid="queue-job-details"]')
    .getByText('Denoising Strength', { exact: true })
    .locator('..')
  await expect(frozenStrengthDetail).toContainText('0.75')
  await screenshot('23b-img2img-frozen-queue-details')
  await manager.getByRole('button', { name: 'Close Queue Manager', exact: true }).click()
  await expect(manager).toHaveCount(0)
  release(imgRequest)
  await expect
    .poll(async () => (await api('listGenerationResults', cfgProject.id)).candidates.length, {
      timeout: 20_000,
    })
    .toBe(1)
  await expect.poll(async () => (await api('getGenerationState', cfgProject.id)).phase).toBe('idle')
  await window.getByRole('button', { name: 'Add 1 as Layer', exact: true }).click()
  await expect.poll(async () => (await tab(cfgProject.id)).layers.length).toBe(2)
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await tab(cfgProject.id)).dirty).toBe(false)
  const imgSaved = (await readIgsPackage(cfgProject.packagePath)).project
  const imgLayer = imgSaved.layers.find(
    (layer) => layer.generationProvenance?.kind === 'illustrious-img2img',
  )
  assert.ok(imgLayer)
  assert.equal(imgSaved.generationDraft.sampling.denoisingStrength, 0.25)
  assert.equal(imgLayer.generationProvenance.generationConfiguration.mode, 'img2img')
  assert.equal(
    imgLayer.generationProvenance.generationConfiguration.sampling.denoisingStrength,
    0.75,
  )
  assert.equal(
    imgLayer.generationProvenance.layerSourceContext.sourceTargetSha256,
    imgRequest.request.job.target.sha256,
  )
  assert.equal(imgLayer.generationProvenance.generationConfiguration.sampling.actualSeed, 42)
  await window.getByRole('button', { name: 'Close CFG Rescale acceptance', exact: true }).click()
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: 'Open CFG Rescale acceptance', exact: true }).click()
  await window.getByRole('tab', { name: 'CFG Rescale acceptance', exact: true }).waitFor()
  await expect
    .poll(async () => (await tab(cfgProject.id)).generationDraft.sampling.denoisingStrength)
    .toBe(0.25)
  await window
    .getByRole('button', { name: `Layer actions for ${imgLayer.name}`, exact: true })
    .click()
  await window.getByRole('menuitem', { name: 'Compare generation settings', exact: true }).click()
  await expect(comparison.locator('.comparison-scroll')).toHaveAttribute('aria-busy', 'false')
  const strengthRow = comparison.locator('[data-setting="denoisingStrength.value"]')
  await expect(strengthRow).toContainText('Changed')
  await expect(strengthRow).toContainText('0.75')
  await expect(strengthRow).toContainText('0.25')
  for (const [width, height] of [
    [1380, 900],
    [900, 620],
  ]) {
    await resizeNativeWindow(width, height)
    await screenshot(`24-img2img-comparison-${width}x${height}`)
    const bounds = await comparison.boundingBox()
    assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0)
    assert.ok(bounds.x + bounds.width <= width && bounds.y + bounds.height <= height)
  }
  await window.keyboard.press('Escape')
  await denoising.scrollIntoViewIfNeeded()
  await screenshot('25-img2img-opaque-control-900x620')
  const savedImgBytes = readFileSync(cfgProject.packagePath)
  const partialWidth = window.locator('input[aria-label="Generation area width"]')
  await partialWidth.fill('104')
  await partialWidth.press('Enter')
  await expect.poll(async () => (await tab(cfgProject.id)).primaryBbox.width).toBe(104)
  await expect(denoising).toBeDisabled()
  await expect(window.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled()
  await expect(window.locator('.project-settings')).toContainText(/outpaint|partly transparent/i)
  const partialQueue = await rows(cfgProject.id)
  assert.equal(generations().length, beforeImgCount + 1)
  assert.deepEqual(readFileSync(cfgProject.packagePath), savedImgBytes)
  await denoising.scrollIntoViewIfNeeded()
  await screenshot('26-img2img-partial-target-refusal-900x620')
  await partialWidth.fill('96')
  await partialWidth.press('Enter')
  await expect.poll(async () => (await tab(cfgProject.id)).primaryBbox.width).toBe(96)
  await expect(denoising).toBeEnabled()
  assert.deepEqual(await rows(cfgProject.id), partialQueue)
  checked(
    'Opaque Raster input and explicit strength freeze img2img through real queue, Add, Save, reopen and comparison',
    {
      currentStrength: 0.25,
      documentId: imgSaved.documentId,
      frozenStrength: 0.75,
      layerId: imgLayer.id,
      requestId: imgRequest.request.requestId,
      sourceTargetSha256: imgRequest.request.job.target.sha256,
    },
  )
  for (const entry of lines(peerLaunches)) {
    assert.throws(() => process.kill(entry.pid, 0), { code: 'ESRCH' })
  }
  for (const [file, hash] of Object.entries(report.buildSha256)) {
    assert.equal(
      digest(readFileSync(file)),
      hash,
      `Built artifact changed during native run: ${file}`,
    )
  }
  assert.equal(digest(readFileSync('scripts/smoke-generation-actions.mjs')), report.scriptSha256)
  assert.deepEqual(report.pageErrors, [])
  report.outcome = 'passed'
  console.log(
    'Native Generate and Queue Manager acceptance passed; controlled runtime/pixels, no GPU claim.',
  )
} catch (error) {
  report.outcome = 'failed'
  report.error = { message: error.message, stack: error.stack }
  if (window && !window.isClosed()) await screenshot('failure').catch(() => undefined)
  throw error
} finally {
  report.peerRequests = lines(peerRequests)
  report.peerLaunches = lines(peerLaunches)
  report.peerProgress = lines(peerProgress)
  report.peerExits = lines(peerExits)
  writeFileSync(path.join(artifacts, 'native-main-stderr.log'), mainStderr)
  writeFileSync(path.join(artifacts, 'native-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  application?.process().kill('SIGKILL')
  await liveDatabase?.close()
  rmSync(fixtureRoot, { force: true, recursive: true })
}
