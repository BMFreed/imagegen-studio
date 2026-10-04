/**
 * Native external-VAE authoring: built renderer → preload → main-owned exact resource identity,
 * Project history and explicit .igs Save/reopen. Catalog bytes and the runtime peer are fixtures;
 * this qualified 0.8 peer deliberately refuses external VAE and makes no ML compatibility claim.
 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
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

import { _electron as electron, expect } from '@playwright/test'

import { openAppDatabase } from '../src/main/db/database.ts'
import { ModelRepository } from '../src/main/models/model-repository.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { ProjectSession } from '../src/main/projects/project-session.ts'
import { createRuntimeRoots } from '../src/main/runtime/index.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'

assert.equal(process.argv.length, 2)
const artifacts = path.resolve(
  process.env.IMAGEGEN_PROJECT_VAE_ARTIFACTS ??
    mkdtempSync(path.join(os.tmpdir(), 'igs-project-vae-evidence-')),
)
mkdirSync(artifacts, { mode: 0o700, recursive: true })
const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'igs-project-vae-smoke-'))
const appDataRoot = path.join(fixtureRoot, 'data', 'imagegen-studio')
const projectRoot = path.join(appDataRoot, 'workspaces', 'Uncategorized')
mkdirSync(projectRoot, { recursive: true })
const peerRequests = path.join(fixtureRoot, 'peer-requests.jsonl')
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hashFiles = (files) =>
  Object.fromEntries(files.map((file) => [file, digest(readFileSync(file))]))
const report = {
  checks: [],
  pageErrors: [],
  screenshots: [],
  viewportChecks: [],
  sourceSha256: hashFiles(['scripts/smoke-project-vae.mjs', 'scripts/native-smoke-window.mjs']),
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
      'Built Electron renderer/main/preload, SQLite catalog/default, exact VAE resolution, Project Undo/Redo, explicit .igs Save/reopen, native import/relink, Generate refusal and Queue Manager projection.',
    fixtures:
      'Catalog-only checkpoint/VAE bytes, an independently prepared copied .igs with foreign local VAE IDs, an app-owned ready 0.8 JSONL executable, and development image derivatives. This older qualified peer refuses external VAE; no CUDA or external-VAE ML loading is exercised.',
    browser:
      'T3 preview_status was available on about:blank, but its HTTP browser cannot exercise native Electron preload/IPC/.igs. The existing checked-in _electron verification harness exercises the required production boundary.',
    input: 'Physical typing is blocked by the canonical native helper; CDP drives built controls.',
  },
}
const environment = {
  ...process.env,
  IMAGEGEN_TEST_IMAGE_WORKER: '1',
  NODE_ENV: 'test',
  XDG_CONFIG_HOME: path.join(fixtureRoot, 'config'),
  XDG_DATA_HOME: path.join(fixtureRoot, 'data'),
}
delete environment.ELECTRON_RUN_AS_NODE
delete environment.IMAGEGEN_DEV_SERVER_URL
let application
let window
let fixture
const check = (name, evidence = {}) => {
  report.checks.push({ name, ...evidence })
  console.log(`PASS ${name}`)
}
async function api(method, ...args) {
  const result = await window.evaluate(({ method, args }) => window.api.projects[method](...args), {
    method,
    args,
  })
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}
async function tab(id = fixture.project.key) {
  const result = await api('open', id)
  assert.equal(result.kind, 'opened')
  return result.tab
}
async function resize(width, height) {
  await application.evaluate(
    ({ BrowserWindow }, size) =>
      BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height),
    { height, width },
  )
  await expect.poll(() => window.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height])
}
async function screenshot(name, width = 1380, height = 900) {
  await resize(width, height)
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
  const select = window.locator('[aria-label="VAE"]').first()
  await select.scrollIntoViewIfNeeded()
  const geometry = await select.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return {
      visible:
        bounds.left >= 0 &&
        bounds.top >= 0 &&
        bounds.right <= innerWidth &&
        bounds.bottom <= innerHeight,
      bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      overflow: document.documentElement.scrollWidth > innerWidth,
    }
  })
  assert.equal(geometry.visible, true)
  assert.equal(geometry.overflow, false)
  const file = path.join(artifacts, `${name}-${width}x${height}.png`)
  await window.screenshot({ animations: 'disabled', path: file })
  report.screenshots.push(file)
  report.viewportChecks.push({ name, width, height, ...geometry })
}
async function save(id, file) {
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await tab(id)).dirty).toBe(false)
  return (await readIgsPackage(file)).project
}
async function reopen(project) {
  await window.getByRole('button', { name: `Close ${project.title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: project.title, exact: true })).toHaveCount(0)
  await window.getByRole('button', { name: `Open ${project.title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: project.title, exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  return await tab(project.key)
}
async function expandAdvanced() {
  const select = window.locator('[aria-label="VAE"]').first()
  if (!(await select.isVisible()))
    await window.getByText('Advanced Options', { exact: true }).click()
  await expect(select).toBeVisible()
  return select
}
async function prepareFixture() {
  const database = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  const repository = new ModelRepository(database.db)
  const publish = async (type, modelId, versionId, name, family) => {
    const bytes = Buffer.from(
      `Catalog-only ${type} ${modelId} ${versionId}; not inference weights.`,
    )
    const managedPath = path.join(appDataRoot, 'models', `${type}-${versionId}.safetensors`)
    mkdirSync(path.dirname(managedPath), { recursive: true })
    writeFileSync(managedPath, bytes, { mode: 0o600 })
    const result = await repository.publishVerifiedInstallation({
      primary: {
        file: {
          managedPath,
          originalFilename: path.basename(managedPath),
          sha256: digest(bytes),
          sizeBytes: bytes.length,
          verifiedAt: new Date().toISOString(),
        },
        resource: {
          creator: 'Native VAE fixture',
          displayName: name,
          source:
            family === 'anima'
              ? { key: 'anima/native-vae-neighbor', kind: 'supported_dependency' }
              : { kind: 'civitai', modelId },
          sourceMetadata: { fixture: true },
          type,
        },
        version: {
          baseModelFamily: family,
          format: 'safetensors',
          name: `Fixture v${versionId % 10}`,
          predictionType: type === 'checkpoint' ? 'epsilon' : null,
          source:
            family === 'anima'
              ? {
                  kind: 'supported_dependency',
                  revision: 'native-fixture',
                  expectedSha256: digest(bytes),
                }
              : {
                  kind: 'civitai',
                  fileId: versionId + 100,
                  versionId,
                  expectedSha256: digest(bytes),
                },
          sourceMetadata: { fixture: true },
        },
      },
    })
    return {
      ...result,
      managedPath,
      portable: {
        baseModelFamily: family,
        civitaiFileId: versionId + 100,
        civitaiModelId: modelId,
        civitaiVersionId: versionId,
        displayName: name,
        fileSha256: digest(bytes),
        kind: type,
        localModelId: result.resourceId,
        localVersionId: result.versionId,
        predictionType: type === 'checkpoint' ? 'epsilon' : null,
        versionName: `Fixture v${versionId % 10}`,
      },
    }
  }
  let checkpoint, first, second, incompatible
  try {
    checkpoint = await publish('checkpoint', 99100, 99101, 'Native VAE checkpoint', 'illustrious')
    first = await publish('vae', 99200, 99201, 'Native external VAE', 'illustrious')
    second = await publish('vae', 99200, 99202, 'Native external VAE', 'illustrious')
    incompatible = await publish('vae', 99300, 99301, 'Anima neighboring VAE', 'anima')
    await repository.setDefaultVersion(first.resourceId, first.versionId)
  } finally {
    await database.close()
  }
  const project = async (title, directory, vae) => {
    const session = await ProjectSession.create(path.join(directory, `${title}.igs`), title, {
      placeholdersDir: path.resolve('dist/main/placeholders'),
      scratchDir: path.join(fixtureRoot, 'scratch'),
    })
    session.applyDocument({
      ...session.document,
      primaryBbox: { width: 64, height: 64, x: 0, y: 0 },
      generationDraft: {
        ...session.document.generationDraft,
        model: checkpoint.portable,
        positivePrompt: {
          embeddingRefs: [],
          text: 'a violet lantern, native VAE authoring fixture',
        },
        sampling: {
          cfgScale: 5,
          denoisingStrength: null,
          sampler: 'Euler a',
          scheduler: 'Normal',
          steps: 2,
        },
        seed: { policy: 'fixed', value: 0 },
        vae,
      },
    })
    await session.save()
    return {
      key: session.localRecoveryKey,
      path: session.filePath,
      title,
      document: session.document,
    }
  }
  const foreign = {
    ...first.portable,
    localModelId: `foreign-${randomUUID()}`,
    localVersionId: `foreign-${randomUUID()}`,
  }
  return {
    checkpoint,
    first,
    second,
    incompatible,
    project: await project('Native VAE authoring', projectRoot, null),
    copied: await project('Copied VAE authoring', fixtureRoot, foreign),
    foreign,
  }
}
async function installRuntimePeer() {
  const roots = await createRuntimeRoots(appDataRoot)
  const runtimeId = 'native-vae-authoring-linux-nvidia'
  const runtime = path.join(roots.environmentsDir, runtimeId)
  const executable = path.join(runtime, 'bin', 'python')
  const config = path.join(runtime, 'resources', 'sdxl-config')
  mkdirSync(path.dirname(executable), { recursive: true })
  mkdirSync(config, { recursive: true })
  writeFileSync(path.join(config, 'model_index.json'), '{"fixture":"VAE authoring peer"}')
  const profile = readFileSync('worker-python/src/imagegen_worker/srgb.icc').toString('base64')
  const script = String.raw`#!${process.execPath}
const fs=require('node:fs'), crypto=require('node:crypto'), zlib=require('node:zlib')
const profile=Buffer.from(${JSON.stringify(profile)},'base64')
const log=${JSON.stringify(peerRequests)}
const role=process.argv.slice(2).join(' ')==='-I -m imagegen_worker.inference_main'?'inference':'derivatives'
const ready=role==='inference'
  ? {type:'ready',protocolVersion:'1',pythonVersion:'3.12.13',workerVersion:'0.8.0',runtimeProfile:'linux-nvidia',capabilities:['illustrious-txt2img','target-composition','denoising-progress','candidate-thumbnails','illustrious-cfg-rescale','illustrious-img2img','illustrious-lora','illustrious-vae-precision']}
  : {type:'ready',protocolVersion:'1',pythonVersion:'3.12.13',workerVersion:'0.1.0',runtimeProfile:'derivatives-only',capabilities:['image-derivatives','import-normalization','preview-composition','self-test','target-composition']}
process.stdout.write(JSON.stringify(ready)+'\n')
process.on('SIGTERM',()=>process.exit(0));process.stdin.on('end',()=>process.exit(0))
function chunk(type,data){const header=Buffer.alloc(8);header.writeUInt32BE(data.length);header.write(type,4,'ascii');const checksum=Buffer.alloc(4);checksum.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type),data])));return Buffer.concat([header,data,checksum])}
function png(w,h){const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('iCCP',Buffer.concat([Buffer.from('srgb\0\0'),zlib.deflateSync(profile)])),chunk('IDAT',zlib.deflateSync(Buffer.alloc(h*(1+w*4)))),chunk('IEND',Buffer.alloc(0))])}
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',value=>{input+=value;while(input.includes('\n')){const end=input.indexOf('\n'),request=JSON.parse(input.slice(0,end));input=input.slice(end+1);fs.appendFileSync(log,JSON.stringify({role,request})+'\n');if(request.type==='compose-target'){const bytes=png(request.bbox.width,request.bbox.height);fs.writeFileSync(request.output.targetPngPath,bytes,{flag:'wx',mode:0o600});process.stdout.write(JSON.stringify({type:'target-done',protocolVersion:'1',requestId:request.requestId,mode:'txt2img',rect:request.bbox,composite:{byteSize:bytes.length,colorSpace:'srgb',width:request.bbox.width,height:request.bbox.height,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}})+'\n')}else if(request.type==='self-test'){process.stdout.write(JSON.stringify({type:'self-test-result',protocolVersion:'1',requestId:request.requestId,runtimeProfile:'derivatives-only',checks:{pillowVersion:'12.2.0',imageCodecs:['PNG','WEBP'],colorConversion:'srgb'}})+'\n')}else process.exit(34)}})
`
  writeFileSync(executable, script, { mode: 0o700 })
  writeFileSync(
    roots.pointerFile,
    JSON.stringify({ schemaVersion: 1, runtimeId, pythonExecutable: executable }),
    { mode: 0o600 },
  )
}
async function observeSelectionIpc() {
  await application.evaluate(({ ipcMain }) => {
    const channel = 'projects:set-generation-vae'
    const original = ipcMain._invokeHandlers.get(channel)
    if (typeof original !== 'function') throw new Error('Real VAE selection handler is missing.')
    globalThis.igsVaeSelectionProbe = { original, calls: [] }
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (event, ...args) => {
      globalThis.igsVaeSelectionProbe.calls.push(structuredClone(args))
      return await original(event, ...args)
    })
  })
}
async function selectionCalls() {
  return await application.evaluate(() => globalThis.igsVaeSelectionProbe.calls)
}
async function selectVae(resourceName, versionName) {
  const control = await expandAdvanced()
  await control.click()
  await expect(window.locator('.model-option')).toHaveCount(2)
  await expect(
    window.locator('.model-option').filter({ hasText: 'Anima neighboring VAE' }),
  ).toHaveCount(0)
  await screenshot('00a-vae-dropdown')
  await screenshot('00a-vae-dropdown', 900, 620)
  await window
    .locator('.model-option')
    .filter({ hasText: resourceName })
    .filter({ hasText: versionName })
    .click()
}

try {
  fixture = await prepareFixture()
  await installRuntimePeer()
  application = await electron.launch({ args: ['.'], cwd: process.cwd(), env: environment })
  window = await isolateNativeSmokeWindow(application)
  window.on('pageerror', (error) => report.pageErrors.push(error.message))
  application.process().stderr?.on('data', (chunk) => process.stderr.write(chunk))
  await window.getByRole('tab', { name: 'Home', exact: true }).waitFor()
  await resize(1380, 900)
  await window.getByRole('button', { name: `Open ${fixture.project.title}`, exact: true }).click()
  await expect(
    window.getByRole('tab', { name: fixture.project.title, exact: true }),
  ).toHaveAttribute('aria-selected', 'true')
  const ready = await window.evaluate(() => window.api.runtime.getStatus())
  assert.equal(ready.ok, true)
  assert.equal(ready.value.kind, 'ready')
  assert.equal((await tab()).generationDraft.vae, null)
  await observeSelectionIpc()
  await expandAdvanced()
  await screenshot('00-embedded-vae')

  await selectVae('Native external VAE', 'Fixture v1')
  await expect
    .poll(async () => (await tab()).generationDraft.vae?.localVersionId)
    .toBe(fixture.first.versionId)
  const selected = (await tab()).generationDraft.vae
  assert.deepEqual(selected, fixture.first.portable)
  const calls = await selectionCalls()
  assert.deepEqual(calls.at(-1), [
    fixture.project.key,
    { resourceId: fixture.first.resourceId, versionId: fixture.first.versionId },
  ])
  assert.deepEqual(Object.keys(selected).sort(), Object.keys(fixture.first.portable).sort())
  check(
    'Renderer selects exact VAE with IDs-only IPC; real main supplies portable CivitAI identity and verified hash',
  )
  await screenshot('01-external-vae')
  await screenshot('01-external-vae', 900, 620)

  await window.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(async () => (await tab()).generationDraft.vae).toBe(null)
  await window.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect.poll(async () => (await tab()).generationDraft.vae).toEqual(selected)
  check('VAE selection uses production Project Undo/Redo; original portable reference is restored')
  const saved = await save(fixture.project.key, fixture.project.path)
  assert.deepEqual(saved.generationDraft.vae, selected)
  const savedBytes = readFileSync(fixture.project.path)
  const reopened = await reopen(fixture.project)
  assert.deepEqual(reopened.generationDraft.vae, selected)
  assert.equal(reopened.dirty, false)
  assert.deepEqual(readFileSync(fixture.project.path), savedBytes)
  check('Explicit Save and genuine close/reopen preserve exact VAE and clean document')

  const changedDefault = await window.evaluate(
    ({ resourceId, versionId }) => window.api.models.setDefaultVersion(resourceId, versionId),
    { resourceId: fixture.second.resourceId, versionId: fixture.second.versionId },
  )
  assert.equal(changedDefault.ok, true)
  assert.deepEqual((await tab()).generationDraft.vae, selected)
  assert.deepEqual(readFileSync(fixture.project.path), savedBytes)
  const catalog = await window.evaluate(() => window.api.models.getCatalog())
  assert.equal(catalog.ok, true)
  assert.equal(
    catalog.value.find((entry) => entry.id === fixture.first.resourceId).defaultVersionId,
    fixture.second.versionId,
  )
  check(
    'Changing actual SQLite VAE Default to v2 leaves saved Project at exact v1, with no dirty flag or file rewrite',
  )

  const rejected = await window.evaluate(
    ({ key, resourceId, versionId }) =>
      window.api.projects.setGenerationVae(key, {
        resourceId,
        versionId,
        managedPath: '/private/forged-vae',
        fileSha256: '0'.repeat(64),
      }),
    {
      key: fixture.project.key,
      resourceId: fixture.first.resourceId,
      versionId: fixture.first.versionId,
    },
  )
  assert.equal(rejected.ok, false)
  assert.deepEqual((await tab()).generationDraft.vae, selected)
  check('Forged renderer path/hash fields are rejected; saved exact reference remains unchanged', {
    code: rejected.error.code,
  })

  const generation = await window.evaluate(
    ({ key, documentId }) => window.api.projects.generate(key, { documentId, iterations: 1 }),
    { key: fixture.project.key, documentId: reopened.documentId },
  )
  assert.equal(generation.ok, false)
  assert.equal(generation.error.code, 'INFERENCE_UNAVAILABLE')
  assert.equal(
    generation.error.message,
    'The active worker has not qualified external Illustrious VAE loading.',
  )
  const queue = await api('getGenerationQueue')
  assert.equal(queue.items.length, 0)
  const requests = existsSync(peerRequests)
    ? readFileSync(peerRequests, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
    : []
  assert.equal(
    requests.some(({ request }) => request.type.startsWith('generate-')),
    false,
  )
  await expect(
    window
      .getByText(
        'This image engine does not support external VAE. Update it, or reset VAE to Embedded.',
        { exact: true },
      )
      .first(),
  ).toBeVisible()
  assert.deepEqual(readFileSync(fixture.project.path), savedBytes)
  check(
    'External VAE is visibly unsupported by this worker checkpoint; authoritative Generate refuses without queue item or inference request',
  )

  await expandAdvanced()
  await window.getByRole('button', { name: 'Reset VAE', exact: true }).click()
  await expect.poll(async () => (await tab()).generationDraft.vae).toBe(null)
  await expect(window.getByRole('button', { name: 'Generate', exact: true })).toBeEnabled({
    timeout: 20_000,
  })
  assert.deepEqual((await tab()).generationDraft.model, fixture.checkpoint.portable)
  assert.equal(
    (await tab()).generationDraft.positivePrompt.text,
    fixture.project.document.generationDraft.positivePrompt.text,
  )
  await save(fixture.project.key, fixture.project.path)
  check(
    'Reset restores embedded VAE and generation eligibility without changing checkpoint or prompt',
  )

  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  const foreignBytes = readFileSync(fixture.copied.path)
  await application.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
  }, fixture.copied.path)
  await window.getByRole('button', { name: 'Import Project', exact: true }).click()
  const importDialog = window.getByRole('dialog', { name: 'Import Project', exact: true })
  await expect(importDialog).toBeVisible()
  await importDialog.getByText('Keep the original and copy it here', { exact: true }).click()
  await importDialog.getByRole('button', { name: 'Copy and Open', exact: true }).click()
  await expect(importDialog).toBeHidden()
  await expect(
    window.getByRole('tab', { name: fixture.copied.title, exact: true }),
  ).toHaveAttribute('aria-selected', 'true')
  const imported = (await api('list')).find((project) => project.title === fixture.copied.title)
  assert.ok(imported)
  const importedTab = await tab(imported.id)
  assert.deepEqual(importedTab.generationDraft.vae, fixture.foreign)
  assert.equal(importedTab.dirty, false)
  await expandAdvanced()
  await screenshot('02-copied-vae-relink')
  await screenshot('02-copied-vae-relink', 900, 620)
  await window.getByRole('button', { name: 'Relink VAE', exact: true }).click()
  await expect
    .poll(async () => (await tab(imported.id)).generationDraft.vae?.localVersionId)
    .toBe(fixture.first.versionId)
  assert.deepEqual((await tab(imported.id)).generationDraft.vae, selected)
  assert.deepEqual(readFileSync(fixture.copied.path), foreignBytes)
  const importedPath = readdirSync(projectRoot)
    .filter((name) => name.endsWith('.igs'))
    .map((name) => path.join(projectRoot, name))
    .find((file) => file !== fixture.project.path)
  assert.ok(importedPath)
  assert.deepEqual((await save(imported.id, importedPath)).generationDraft.vae, selected)
  const linkedReopen = await reopen({ key: imported.id, title: fixture.copied.title })
  assert.deepEqual(linkedReopen.generationDraft.vae, selected)
  check(
    'Actual Copy and Open preserves foreign portable metadata; Relink finds exact installed v1 despite Default v2, then Save/reopen keeps local identity and original file untouched',
  )

  await expandAdvanced()
  await window.getByRole('button', { name: 'Open VAE in Models', exact: true }).click()
  const manager = window.getByRole('dialog', { name: 'Model Manager', exact: true })
  await expect(manager).toBeVisible()
  await expect(manager).toContainText('Native external VAE')
  await expect(manager.locator('.version-row--project')).toContainText('Fixture v1')
  await expect(manager.locator('.version-row--project')).toContainText('Selected in Project')
  await expect(manager.locator('.version-row--project')).not.toContainText('Fixture v2')
  const file = path.join(artifacts, '03-vae-model-manager-900x620.png')
  await window.screenshot({ animations: 'disabled', path: file })
  report.screenshots.push(file)
  check(
    'Open in Models reaches the production Model Manager focused on the selected VAE resource/version',
  )
  await manager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await expect(manager).toBeHidden()
  rmSync(fixture.first.managedPath)
  await window.getByRole('button', { name: 'Refresh models', exact: true }).click()
  await expect(
    window
      .getByRole('region', { name: 'VAE settings', exact: true })
      .getByText(
        'Exact VAE version unavailable. Restore it in Model Manager, or reset to Embedded.',
        { exact: true },
      ),
  ).toBeVisible()
  assert.deepEqual((await tab(imported.id)).generationDraft.vae, selected)
  assert.equal((await tab(imported.id)).dirty, false)
  await screenshot('04-missing-exact-vae')
  await screenshot('04-missing-exact-vae', 900, 620)
  check(
    'Removing selected VAE bytes produces an actionable missing exact-version diagnostic without silently changing saved metadata or Default',
  )
  assert.deepEqual(report.pageErrors, [])
  report.peerRequests = requests.map(({ role, request }) => ({ role, type: request.type }))
  report.outcome = 'passed'
} catch (error) {
  report.outcome = 'failed'
  report.failure = { message: error.message, stack: error.stack }
  if (window) {
    const file = path.join(artifacts, 'failure.png')
    await window.screenshot({ path: file }).catch(() => undefined)
    report.screenshots.push(file)
  }
  throw error
} finally {
  if (application) await application.close().catch(() => undefined)
  writeFileSync(
    path.join(artifacts, 'native-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    { mode: 0o600 },
  )
  rmSync(fixtureRoot, { recursive: true, force: true })
  console.log(
    JSON.stringify({
      artifacts,
      checks: report.checks.length,
      pageErrors: report.pageErrors.length,
      outcome: report.outcome,
    }),
  )
}
