/**
 * Native renderer → preload → main Generate acceptance. Run with `pnpm exec tsx` after app:build.
 * Only the app-owned executable and deterministic output pixels are substituted. RuntimeManager
 * qualification/exit, model hash/header checks, target verification, SQLite and staging are real.
 * This is neither a CUDA test nor proof that the miniature checkpoint loads in an inference
 * engine.
 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
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
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { createRuntimeRoots } from '../src/main/runtime/index.ts'
import { IGS_SRGB_ICC_SHA256 } from '../src/shared/projects/color-profile.ts'

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
    'Controlled Node executable replaces Python/CUDA/model loading/composition/inference only.',
    'IMAGEGEN_TEST_IMAGE_WORKER uses the existing development image worker for Project previews.',
    'No GPU, installed-runtime compatibility or complete checkpoint loadability claim.',
  ],
  checks: [],
  pageErrors: [],
  runId,
  screenshots: [],
}
let application
let window
let mainStderr = ''
let liveDatabase

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
  return lines(peerRequests).filter(
    (entry) => entry.request.type === 'generate-illustrious-txt2img',
  )
}

async function screenshot(name) {
  const file = path.join(artifacts, `${name}.png`)
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
  await window.screenshot({ path: file })
  report.screenshots.push(file)
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
  application.process().stderr.on('data', (chunk) => {
    mainStderr += chunk.toString()
  })
  window = await application.firstWindow()
  window.on('pageerror', (error) => report.pageErrors.push(error.message))
  await window.getByRole('tab', { name: 'Home', exact: true }).waitFor()
}

async function api(method, ...args) {
  const response = await window.evaluate(
    async ({ method, args }) => await window.api.projects[method](...args),
    { args, method },
  )
  assert.equal(response.ok, true, JSON.stringify(response))
  return response.value
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
  // This executable is an external peer fixture. It does not implement or replace any main code.
  const script = String.raw`#!${process.execPath}
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const {crc32, deflateSync} = require('node:zlib')
const requestLog = ${JSON.stringify(peerRequests)}
const launchLog = ${JSON.stringify(peerLaunches)}
const fixtureRoot = ${JSON.stringify(fixtureRoot)}
const expectedConfig = ${JSON.stringify(config)}
const expectedCache = ${JSON.stringify(roots.cacheDir)}
const profile = Buffer.from(${JSON.stringify(profile.toString('base64'))}, 'base64')
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
if (process.argv.slice(2).join(' ') !== '-I -m imagegen_worker.inference_main') process.exit(21)
if (process.env.IGS_SDXL_CONFIG_DIR !== expectedConfig || process.env.HF_HOME !== expectedCache) process.exit(22)
if (['HF_HUB_OFFLINE', 'TRANSFORMERS_OFFLINE', 'HF_DATASETS_OFFLINE'].some(key => process.env[key] !== '1')) process.exit(23)
fs.appendFileSync(launchLog, JSON.stringify({pid:process.pid, args:process.argv.slice(2), offline:true}) + '\n')
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
process.stdout.write(JSON.stringify({type:'ready',protocolVersion:'1',pythonVersion:'3.12.13',
  workerVersion:'0.2.0',runtimeProfile:'linux-nvidia',capabilities:['illustrious-txt2img','target-composition']})+'\n')
process.stdin.setEncoding('utf8')
let buffer=''
process.stdin.on('data',data=>{
  buffer+=data
  while(buffer.includes('\n')) {
    const end=buffer.indexOf('\n'); const request=JSON.parse(buffer.slice(0,end)); buffer=buffer.slice(end+1)
    fs.appendFileSync(requestLog,JSON.stringify({pid:process.pid,request})+'\n')
    if(request.type==='compose-target') {
      if(request.layers.length) process.exit(25)
      const bytes=png(request.bbox.width,request.bbox.height,false)
      fs.writeFileSync(request.output.targetPngPath,bytes,{flag:'wx',mode:0o600})
      process.stdout.write(JSON.stringify({type:'target-done',protocolVersion:'1',requestId:request.requestId,
        mode:'txt2img',rect:request.bbox,composite:{byteSize:bytes.length,colorSpace:'srgb',
        width:request.bbox.width,height:request.bbox.height,sha256:hash(bytes)}})+'\n')
    } else if(request.type==='generate-illustrious-txt2img') {
      if(hash(fs.readFileSync(request.job.target.path))!==request.job.target.sha256) process.exit(26)
      if(hash(fs.readFileSync(request.job.checkpoint.path))!==request.job.checkpoint.sha256) process.exit(27)
      const timer=setInterval(()=>{
        if(!fs.existsSync(path.join(fixtureRoot,'release-'+request.requestId))) return
        clearInterval(timer)
        const bytes=png(request.job.bbox.width,request.job.bbox.height,true)
        fs.writeFileSync(request.job.output.pngPath,bytes,{flag:'wx',mode:0o600})
        process.stdout.write(JSON.stringify({type:'generation-done',protocolVersion:'1',requestId:request.requestId,
          outputPath:request.job.output.pngPath,seed:request.job.sampling.seed})+'\n')
      },10)
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
      ...rendererEntryAssets,
    ].map((file) => [file, digest(readFileSync(file))]),
  )
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

  await projectRegion
    .getByRole('textbox', { name: 'Positive prompt', exact: true })
    .fill('edited after admission')
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
  assert.equal(second.request.job.prompts.positive, 'native admission snapshot')
  assert.equal(second.request.job.bbox.width, 96)
  assert.deepEqual(readFileSync(packagePath), beforeGenerate)
  release(second)
  await expect
    .poll(async () => (await api('listGenerationResults', projectId)).candidates.length, {
      timeout: 20_000,
    })
    .toBe(1)
  await expect.poll(async () => (await api('getGenerationState', projectId)).phase).toBe('idle')
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
  report.finalRows = finalRows.map(({ batch_id, document_id, id, staging_session_id, status }) => ({
    batch_id,
    document_id,
    id,
    staging_session_id,
    status,
  }))
  for (const entry of lines(peerLaunches)) {
    assert.throws(() => process.kill(entry.pid, 0), { code: 'ESRCH' })
  }
  assert.deepEqual(report.pageErrors, [])
  report.outcome = 'passed'
  console.log('Native Generate acceptance passed; controlled runtime/pixels, no GPU claim.')
} catch (error) {
  report.outcome = 'failed'
  report.error = { message: error.message, stack: error.stack }
  if (window && !window.isClosed()) await screenshot('failure').catch(() => undefined)
  throw error
} finally {
  report.peerRequests = lines(peerRequests)
  report.peerLaunches = lines(peerLaunches)
  writeFileSync(path.join(artifacts, 'native-main-stderr.log'), mainStderr)
  writeFileSync(path.join(artifacts, 'native-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  application?.process().kill('SIGKILL')
  await liveDatabase?.close()
  rmSync(fixtureRoot, { force: true, recursive: true })
}
