/**
 * Built Electron authoring → real preload/IPC/Main → Project history/shadow → explicit .igs. Saved
 * Anima refs and catalog bytes are named preconditions, not model qualification or ML. The ready
 * JSONL peer advertises 0.11 capabilities but refuses every inference command.
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
import { execFileSync } from 'node:child_process'

import { _electron as electron, expect } from '@playwright/test'

import { openAppDatabase } from '../src/main/db/database.ts'
import { ModelRepository } from '../src/main/models/model-repository.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { ProjectSession } from '../src/main/projects/project-session.ts'
import { ProjectShadowStore } from '../src/main/projects/project-shadow.ts'
import { acceptedOutputPngFixture } from '../src/main/projects/test-fixtures/accepted-provenance.ts'
import { createRuntimeRoots } from '../src/main/runtime/index.ts'
import { compileAnimaPromptWeighting } from '../src/shared/projects/anima-prompt-weighting.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'

assert.equal(process.argv.length, 2)
const artifacts = path.resolve(
  process.env.IMAGEGEN_ANIMA_AUTHORING_ARTIFACTS ??
    mkdtempSync(path.join(os.tmpdir(), 'igs-anima-authoring-evidence-')),
)
mkdirSync(artifacts, { mode: 0o700, recursive: true })
const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'igs-anima-authoring-smoke-'))
const appDataRoot = path.join(fixtureRoot, 'data', 'imagegen-studio')
const projectRoot = path.join(appDataRoot, 'workspaces', 'Uncategorized')
mkdirSync(projectRoot, { recursive: true })
const peerRequests = path.join(fixtureRoot, 'peer-requests.jsonl')
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hashFiles = (files) =>
  Object.fromEntries(files.map((file) => [file, digest(readFileSync(file))]))
// Independent finite acceptance list, captured from pinned Invoke and the product contract.
const methods = [
  ['euler', 'Euler'],
  ['heun', 'Heun'],
  ['dpmpp_2m', 'DPM++ 2M'],
  ['dpmpp_2m_sde', 'DPM++ 2M SDE'],
  ['er_sde', 'ER-SDE'],
  ['lcm', 'LCM'],
]
const sourceFiles = [
  'scripts/smoke-anima-authoring.mjs',
  'scripts/native-smoke-window.mjs',
  'src/shared/api.ts',
  'src/shared/projects/project-schema.ts',
  'src/shared/projects/anima-prompt-weighting.ts',
  'src/shared/projects/anima-prompt-attention.ts',
  'src/shared/projects/anima-sampling-method.ts',
  'src/shared/projects/prompt-text.ts',
  'src/shared/projects/prompt-diagnostics.ts',
  'src/main/projects/project-service.ts',
  'src/main/projects/project-generation-preparation.ts',
  'src/renderer/components/ProjectView.vue',
  'src/renderer/components/PlainPromptEditor.vue',
  'src/renderer/components/prompt-editing-codemirror.ts',
  'src/renderer/components/prompt-diagnostics-codemirror.ts',
  'src/renderer/components/project-draft-sync.ts',
]
const report = {
  checks: [],
  pageErrors: [],
  screenshots: [],
  viewportChecks: [],
  methodPersistence: [],
  promptInterpretations: [],
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  workingTree: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }),
  sourceSha256: hashFiles(sourceFiles),
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
      'Built Electron controls/CodeMirror, native preload/IPC/Main draft mutations, SQLite catalog, real Project Undo/Redo/shadow, explicit writer/loader Save and genuine close/reopen; authoritative public Anima Generate refusal.',
    fixtures:
      'Already-saved exact Anima/Illustrious refs backed by catalog-only bytes, retained inactive advanced fields, and an app-owned ready 0.11 JSONL executable with controlled opaque target composition. A response probe suppresses only the legacy img2img advisory for the Anima tab to test renderer routing; actual Main peer qualification is retained. No companion installation/model-selection qualification, CUDA, trained weights or inference is claimed.',
    browser:
      'T3 native preview is available for prototype inspection; its HTTP tab does not exercise production Electron preload/IPC/.igs. This existing _electron boundary uses the built production renderer, not a standalone browser fallback.',
    input: 'Canonical native helper blocks physical desktop typing; CDP drives real controls.',
  },
}
const environment = {
  ...process.env,
  IMAGEGEN_TEST_IMAGE_WORKER: '1',
  NODE_ENV: 'test',
  XDG_CONFIG_HOME: path.join(fixtureRoot, 'config'),
  XDG_DATA_HOME: path.join(fixtureRoot, 'data'),
  XDG_CACHE_HOME: path.join(fixtureRoot, 'cache'),
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
async function tab(project = fixture.anima) {
  const result = await api('open', project.key)
  assert.equal(result.kind, 'opened')
  return result.tab
}
async function activate(project) {
  const label = window.getByRole('tab', { name: project.title, exact: true })
  if (await label.count()) await label.click()
  else {
    await window.getByRole('tab', { name: 'Home', exact: true }).click()
    await window.getByRole('button', { name: `Open ${project.title}`, exact: true }).click()
  }
  await expect(label).toHaveAttribute('aria-selected', 'true')
  return await tab(project)
}
async function resize(width, height) {
  await application.evaluate(
    ({ BrowserWindow }, size) =>
      BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height),
    { height, width },
  )
  await expect.poll(() => window.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height])
}
async function screenshot(name, anchor, width = 1380, height = 900) {
  await resize(width, height)
  await anchor.scrollIntoViewIfNeeded()
  await window.evaluate(async () => {
    await document.fonts.ready
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
  const geometry = await anchor.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return {
      visible:
        bounds.left >= 0 &&
        bounds.top >= 0 &&
        bounds.right <= innerWidth &&
        bounds.bottom <= innerHeight,
      bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      overflow: document.documentElement.scrollWidth > innerWidth,
      dpr: devicePixelRatio,
    }
  })
  assert.equal(geometry.visible, true)
  assert.equal(geometry.overflow, false)
  const file = path.join(artifacts, `${name}-${width}x${height}.png`)
  await window.screenshot({ animations: 'disabled', path: file })
  report.screenshots.push(file)
  report.viewportChecks.push({ name, width, height, ...geometry })
}
async function save(project = fixture.anima) {
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await tab(project)).dirty).toBe(false)
  return (await readIgsPackage(project.path)).project
}
async function reopen(project = fixture.anima) {
  await window.getByRole('button', { name: `Close ${project.title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: project.title, exact: true })).toHaveCount(0)
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  return await activate(project)
}
async function shadow(project = fixture.anima) {
  return await new ProjectShadowStore(path.join(appDataRoot, 'autosave')).inspect({
    projectPath: project.path,
    savedPackage: await readIgsPackage(project.path),
  })
}
async function choose(control, label) {
  await control.click()
  await window.getByText(label, { exact: true }).last().click()
}
async function blurPrompt() {
  await window.getByRole('heading', { name: 'Generation area', exact: true }).click()
}
async function dismissHelp() {
  const close = window.getByRole('button', { name: 'Close prompt help', exact: true })
  if (await close.isVisible()) await close.click()
}
function interpreted(text, cleaned, weight, label) {
  const compiled = compileAnimaPromptWeighting(text)
  assert.equal(compiled.cleanedText, cleaned)
  assert.ok(compiled.spans.length > 0)
  for (const span of compiled.spans) assert.ok(Math.abs(span.weight - weight) < 1e-12)
  report.promptInterpretations.push({ label, authored: text, compiled, expectedWeight: weight })
}
async function prepareFixture() {
  const database = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  const repository = new ModelRepository(database.db)
  async function publish(type, modelId, versionId, displayName, family) {
    const bytes = Buffer.from(`Catalog-only ${family} ${type} ${versionId}; NOT model weights.`)
    const managedPath = path.join(appDataRoot, 'models', `${type}-${versionId}.safetensors`)
    mkdirSync(path.dirname(managedPath), { recursive: true })
    writeFileSync(managedPath, bytes, { mode: 0o600 })
    const predictionType = type === 'checkpoint' && family === 'illustrious' ? 'epsilon' : null
    const dependencies =
      type === 'checkpoint' && family === 'anima'
        ? ['qwen3_encoder', 'vae'].map((role) => {
            const companion = Buffer.from(`Catalog-only Anima ${role}; NOT pinned model weights.`)
            const companionPath = path.join(
              appDataRoot,
              'models',
              `anima-fixture-${role}.safetensors`,
            )
            writeFileSync(companionPath, companion, { mode: 0o600 })
            return {
              role,
              artifact: {
                file: {
                  managedPath: companionPath,
                  originalFilename: path.basename(companionPath),
                  sha256: digest(companion),
                  sizeBytes: companion.length,
                  verifiedAt: new Date().toISOString(),
                },
                resource: {
                  creator: 'Anima authoring fixture',
                  displayName: `Catalog-only Anima ${role}`,
                  source: { kind: 'supported_dependency', key: `anima/authoring-fixture-${role}` },
                  sourceMetadata: { fixture: true },
                  type: role,
                },
                version: {
                  baseModelFamily: 'anima',
                  format: 'safetensors',
                  name: 'Unqualified fixture',
                  predictionType: null,
                  source: {
                    kind: 'supported_dependency',
                    revision: 'authoring-fixture',
                    expectedSha256: digest(companion),
                  },
                  sourceMetadata: { fixture: true },
                },
              },
            }
          })
        : []
    const installed = await repository.publishVerifiedInstallation({
      dependencies,
      primary: {
        file: {
          managedPath,
          originalFilename: path.basename(managedPath),
          sha256: digest(bytes),
          sizeBytes: bytes.length,
          verifiedAt: new Date().toISOString(),
        },
        resource: {
          creator: 'Anima authoring fixture',
          displayName,
          source: { kind: 'civitai', modelId },
          sourceMetadata: { fixture: true },
          type,
        },
        version: {
          baseModelFamily: family,
          format: 'safetensors',
          name: 'Fixture v1',
          predictionType,
          source: {
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
      ...installed,
      portable: {
        baseModelFamily: family,
        civitaiFileId: versionId + 100,
        civitaiModelId: modelId,
        civitaiVersionId: versionId,
        displayName,
        fileSha256: digest(bytes),
        kind: type,
        localModelId: installed.resourceId,
        localVersionId: installed.versionId,
        predictionType,
        versionName: 'Fixture v1',
      },
    }
  }
  let anima, illustrious, vae
  try {
    anima = await publish('checkpoint', 99500, 99501, 'Saved Anima authoring fixture', 'anima')
    illustrious = await publish(
      'checkpoint',
      99600,
      99601,
      'Illustrious authoring neighbor',
      'illustrious',
    )
    vae = await publish('vae', 99700, 99701, 'Retained Illustrious VAE', 'illustrious')
  } finally {
    await database.close()
  }
  async function project(title, model, advanced) {
    const session = await ProjectSession.create(path.join(projectRoot, `${title}.igs`), title, {
      placeholdersDir: path.resolve('dist/main/placeholders'),
      scratchDir: path.join(fixtureRoot, 'scratch'),
    })
    const image =
      model.portable.baseModelFamily === 'anima' ? await acceptedOutputPngFixture(64, 64) : null
    const layerId = randomUUID()
    const layerPath = `assets/layers/${layerId}.png`
    session.applyDocument({
      ...session.document,
      primaryBbox: { width: 64, height: 64, x: 0, y: 0 },
      layers: image
        ? [
            {
              asset: {
                bytes: image.length,
                height: 64,
                path: layerPath,
                sha256: digest(image),
                width: 64,
              },
              blendMode: 'normal',
              id: layerId,
              kind: 'raster',
              locked: false,
              name: 'Opaque raster input fixture',
              opacity: 1,
              transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
              visible: true,
            },
          ]
        : [],
      generationDraft: {
        ...session.document.generationDraft,
        ...advanced,
        model: model.portable,
        positivePrompt: { embeddingRefs: [], text: 'an authoring baseline' },
        negativePrompt: { embeddingRefs: [], text: 'blur' },
        sampling: {
          cfgScale: 5,
          denoisingStrength: null,
          sampler: 'Euler a',
          scheduler: 'Normal',
          steps: 4,
        },
        seed: { policy: 'fixed', value: 0 },
      },
    })
    await session.save(image ? { assets: { [layerPath]: { bytes: image } } } : {})
    return {
      key: session.localRecoveryKey,
      path: session.filePath,
      title,
      document: session.document,
    }
  }
  const inactive = { cfgRescale: 0.45, clipSkip: 2, vae: vae.portable, vaePrecision: 'FP32' }
  return {
    anima: await project('Anima native authoring', anima, inactive),
    illustrious: await project('Illustrious neighboring authoring', illustrious, {}),
    illustriousModel: illustrious,
    inactive,
  }
}
async function installRuntimePeer() {
  const roots = await createRuntimeRoots(appDataRoot)
  const runtimeId = 'anima-authoring-catalog-only-peer'
  const runtime = path.join(roots.environmentsDir, runtimeId)
  const executable = path.join(runtime, 'bin', 'python')
  const config = path.join(runtime, 'resources', 'sdxl-config')
  mkdirSync(path.dirname(executable), { recursive: true })
  mkdirSync(config, { recursive: true })
  writeFileSync(path.join(config, 'model_index.json'), '{"fixture":"Anima authoring peer"}')
  const profile = readFileSync('worker-python/src/imagegen_worker/srgb.icc').toString('base64')
  const script = String.raw`#!${process.execPath}
const fs=require('node:fs'),crypto=require('node:crypto'),zlib=require('node:zlib')
const log=${JSON.stringify(peerRequests)},profile=Buffer.from(${JSON.stringify(profile)},'base64')
const role=process.argv.slice(2).join(' ')==='-I -m imagegen_worker.inference_main'?'inference':'derivatives'
const ready=role==='inference'
?{type:'ready',protocolVersion:'1',pythonVersion:'3.12.13',workerVersion:'0.11.0',runtimeProfile:'linux-nvidia',capabilities:['illustrious-txt2img','target-composition','denoising-progress','candidate-thumbnails','illustrious-cfg-rescale','illustrious-img2img','illustrious-lora','illustrious-vae-precision','illustrious-external-vae','illustrious-embeddings','anima-txt2img','anima-img2img','anima-prompt-weighting','anima-flow-sampling','anima-lora']}
:{type:'ready',protocolVersion:'1',pythonVersion:'3.12.13',workerVersion:'0.1.0',runtimeProfile:'derivatives-only',capabilities:['image-derivatives','import-normalization','preview-composition','self-test','target-composition']}
process.stdout.write(JSON.stringify(ready)+'\n')
process.on('SIGTERM',()=>process.exit(0));process.stdin.on('end',()=>process.exit(0))
function chunk(type,data){const h=Buffer.alloc(8);h.writeUInt32BE(data.length);h.write(type,4,'ascii');const c=Buffer.alloc(4);c.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type),data])));return Buffer.concat([h,data,c])}
function png(w,h,opaque){const i=Buffer.alloc(13);i.writeUInt32BE(w);i.writeUInt32BE(h,4);i[8]=8;i[9]=6;return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',i),chunk('iCCP',Buffer.concat([Buffer.from('srgb\0\0'),zlib.deflateSync(profile)])),chunk('IDAT',zlib.deflateSync(scanlines(w,h,opaque))),chunk('IEND',Buffer.alloc(0))])}
function scanlines(w,h,opaque){const b=Buffer.alloc(h*(1+w*4));if(opaque)for(let y=0;y<h;y++)for(let x=0;x<w;x++)b[y*(1+w*4)+1+x*4+3]=255;return b}
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',value=>{input+=value;while(input.includes('\n')){const end=input.indexOf('\n'),request=JSON.parse(input.slice(0,end));input=input.slice(end+1);fs.appendFileSync(log,JSON.stringify({role,request})+'\n');if(request.type==='compose-target'){const opaque=request.layers.length>0,bytes=png(request.bbox.width,request.bbox.height,opaque);fs.writeFileSync(request.output.targetPngPath,bytes,{flag:'wx',mode:0o600});process.stdout.write(JSON.stringify({type:'target-done',protocolVersion:'1',requestId:request.requestId,mode:opaque?'img2img':'txt2img',rect:request.bbox,composite:{byteSize:bytes.length,colorSpace:'srgb',width:request.bbox.width,height:request.bbox.height,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}})+'\n')}else if(request.type==='self-test'){process.stdout.write(JSON.stringify({type:'self-test-result',protocolVersion:'1',requestId:request.requestId,runtimeProfile:'derivatives-only',checks:{pillowVersion:'12.2.0',imageCodecs:['PNG','WEBP'],colorConversion:'srgb'}})+'\n')}else process.exit(34)}})
`
  writeFileSync(executable, script, { mode: 0o700 })
  writeFileSync(
    roots.pointerFile,
    JSON.stringify({ schemaVersion: 1, runtimeId, pythonExecutable: executable }),
    { mode: 0o600 },
  )
}

try {
  fixture = await prepareFixture()
  await installRuntimePeer()
  application = await electron.launch({ args: ['.'], cwd: process.cwd(), env: environment })
  window = await isolateNativeSmokeWindow(application)
  window.on('pageerror', (error) => report.pageErrors.push(error.message))
  await window.getByRole('tab', { name: 'Home', exact: true }).waitFor()
  await expect
    .poll(async () => {
      const status = await window.evaluate(() => window.api.runtime.getStatus())
      return status.ok ? status.value.kind : status.error.code
    })
    .toBe('ready')
  await application.evaluate(({ ipcMain }, nativeKey) => {
    const channel = 'projects:get-generation-state'
    const original = ipcMain._invokeHandlers.get(channel)
    if (typeof original !== 'function') throw new Error('Real generation-state handler is missing.')
    globalThis.igsAnimaLegacyCapabilityProbe = { original, observations: [] }
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (event, key) => {
      const response = await original(event, key)
      if (!response.ok || key !== nativeKey) return response
      const state = structuredClone(response)
      globalThis.igsAnimaLegacyCapabilityProbe.observations.push({
        animaSupported: response.value.animaSupported,
        img2imgSupported: response.value.img2imgSupported,
      })
      state.value.img2imgSupported = false
      return state
    })
  }, fixture.anima.key)
  report.runtimeStatus = await window.evaluate(() => window.api.runtime.getStatus())
  await resize(1380, 900)
  await activate(fixture.anima)
  const initial = await tab()
  const control = window.locator('[aria-label="Anima method"]')
  await expect(control).toBeVisible()
  assert.equal(Object.hasOwn(initial.generationDraft.sampling, 'animaMethod'), false)
  assert.equal(initial.dirty, false)
  assert.equal(await window.locator('[aria-label="Scheduler"]').count(), 0)
  check('Viewing an old saved Anima draft does not invent Euler or a separate SD schedule')
  await screenshot('00-unset-anima-method', control)
  await control.click()
  const pending = window.locator('.n-base-select-option--pending')
  await expect(pending).toHaveText('Euler')
  await window.keyboard.press('ArrowDown')
  await expect(pending).toHaveText('Heun')
  await window.keyboard.press('Enter')
  await expect.poll(async () => (await tab()).generationDraft.sampling.animaMethod).toBe('heun')
  await expect(control).toContainText('Heun')
  await window.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect
    .poll(async () => Object.hasOwn((await tab()).generationDraft.sampling, 'animaMethod'))
    .toBe(false)
  check('Native method is keyboard-selectable; Undo restores the previously absent choice')

  for (const [key, label] of methods) {
    await choose(control, label)
    await expect.poll(async () => (await tab()).generationDraft.sampling.animaMethod).toBe(key)
    await expect
      .poll(async () => {
        const state = await shadow()
        return state.status === 'recoverable'
          ? state.document.generationDraft.sampling.animaMethod
          : state.status
      })
      .toBe(key)
    const recoverable = await shadow()
    assert.equal(recoverable.document.generationDraft.sampling.animaMethod, key)
    assert.deepEqual(recoverable.document.generationDraft, (await tab()).generationDraft)
    const saved = await save()
    assert.equal(saved.generationDraft.sampling.animaMethod, key)
    const reopened = await reopen()
    assert.equal(reopened.generationDraft.sampling.animaMethod, key)
    assert.equal(reopened.dirty, false)
    assert.equal(reopened.generationDraft.sampling.sampler, 'Euler a')
    assert.equal(reopened.generationDraft.sampling.scheduler, 'Normal')
    for (const [name, value] of Object.entries(fixture.inactive)) {
      assert.deepEqual(reopened.generationDraft[name], value)
    }
    report.methodPersistence.push({ key, label, documentRevision: saved.documentRevision })
    check(`Native ${label} crosses actual UI/IPC, recovery shadow and writer/loader Save/reopen`)
  }
  await control.click()
  const dropdown = window.locator('.n-base-select-menu').filter({ hasText: 'ER-SDE' })
  await expect(dropdown).toBeVisible()
  assert.equal(await dropdown.locator('.n-base-select-option').count(), methods.length)
  await screenshot('01-six-method-dropdown', control)
  await screenshot('01-six-method-dropdown', control, 900, 620)
  await window.keyboard.press('Escape')
  await resize(1380, 900)
  await control.hover()
  await control.locator('.n-base-clear').click()
  await expect
    .poll(async () => Object.hasOwn((await tab()).generationDraft.sampling, 'animaMethod'))
    .toBe(false)
  await window.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(async () => (await tab()).generationDraft.sampling.animaMethod).toBe('lcm')
  await window.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect
    .poll(async () => Object.hasOwn((await tab()).generationDraft.sampling, 'animaMethod'))
    .toBe(false)
  await expect
    .poll(async () => {
      const state = await shadow()
      return state.status === 'recoverable'
        ? Object.hasOwn(state.document.generationDraft.sampling, 'animaMethod')
        : state.status
    })
    .toBe(false)
  const cleared = await save()
  assert.equal(Object.hasOwn(cleared.generationDraft.sampling, 'animaMethod'), false)
  assert.equal(Object.hasOwn((await reopen()).generationDraft.sampling, 'animaMethod'), false)
  check(
    'Clear deletes the optional method; actual Project Undo/Redo and Save/reopen preserve absence',
  )

  const beforeInvalid = await tab()
  const invalid = await window.evaluate(
    (key) =>
      window.api.projects.updateGenerationDraft(key, { kind: 'anima-method', value: 'Karras' }),
    fixture.anima.key,
  )
  assert.equal(invalid.ok, false)
  assert.deepEqual((await tab()).generationDraft, beforeInvalid.generationDraft)
  check('Unsupported native method is rejected by authoritative IPC without changing the draft', {
    code: invalid.error.code,
  })
  await choose(control, 'Heun')

  const positive = window.getByRole('textbox', { name: 'Positive prompt', exact: true })
  const negative = window.getByRole('textbox', { name: 'Negative prompt', exact: true })
  const positiveCard = window.getByRole('region', { name: 'Positive prompt editor', exact: true })
  const negativeCard = window.getByRole('region', { name: 'Negative prompt editor', exact: true })
  const promptBaseline = (await tab()).generationDraft.positivePrompt.text
  await positive.fill('(long hair)')
  await dismissHelp()
  await positive.press('Control+Home')
  await positive.press('Control+ArrowUp')
  interpreted(
    await positive.textContent(),
    'long hair',
    1.21,
    'Positive keyboard implicit Increase',
  )
  await positiveCard.getByRole('button', { name: 'Decrease prompt attention', exact: true }).click()
  interpreted(await positive.textContent(), 'long hair', 1.1, 'Positive pointer implicit inverse')
  await blurPrompt()
  await window.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(positive).toHaveText(promptBaseline)
  await window.getByRole('button', { name: 'Redo', exact: true }).click()
  interpreted(await positive.textContent(), 'long hair', 1.1, 'Positive focus-session redo')
  check(
    'Actual Anima keyboard/pointer edits change compiled weight; one Project history step owns the focus session',
  )

  await negative.fill('(word:2)')
  await negative.press('Control+End')
  await negative.press('Control+Shift+Home')
  await negativeCard.getByRole('button', { name: 'Increase prompt attention', exact: true }).focus()
  await negativeCard
    .getByRole('button', { name: 'Increase prompt attention', exact: true })
    .press('Enter')
  interpreted(
    await negative.textContent(),
    'word',
    2.1,
    'Negative remembered reversed selection button activation',
  )
  await negative.press('Control+ArrowDown')
  interpreted(await negative.textContent(), 'word', 2, 'Negative explicit inverse')
  await positive.fill('((word:2))')
  await positive.press('Control+Home')
  await positiveCard.getByRole('button', { name: 'Increase prompt attention', exact: true }).click()
  interpreted(await positive.textContent(), 'word', 2.42, 'Nested inherited positive weight')
  await negative.fill('(word)2.05')
  await negative.press('Control+Home')
  await negative.press('Control+ArrowUp')
  interpreted(await negative.textContent(), 'word', 2.15, 'Saved numeric suffix precision')
  await negative.press('Control+ArrowDown')
  interpreted(await negative.textContent(), 'word', 2.05, 'Saved numeric suffix inverse precision')
  await blurPrompt()
  check(
    'Both signs preserve explicit/nested/saved suffix semantics, reversed native selection and authored decimal precision',
  )

  await positive.fill('literal\\')
  await positive.press('Control+Home')
  await positive.press('Control+ArrowUp')
  interpreted(await positive.textContent(), 'literal\\', 1.1, 'Terminal literal backslash')
  await positive.press('Control+ArrowDown')
  interpreted(await positive.textContent(), 'literal\\', 1, 'Terminal literal backslash inverse')
  await blurPrompt()
  check(
    'Attention wrapping preserves a terminal literal backslash without escaping its new operator',
  )

  await positive.fill('(word:2)')
  await positive.press('Control+Home')
  for (let index = 0; index < 3; index += 1) await positive.press('Shift+ArrowRight')
  await positiveCard.getByRole('button', { name: 'Increase prompt attention', exact: true }).click()
  await expect(positive).toHaveText('(word:2)')
  await positiveCard.getByRole('button', { name: /^Positive prompt syntax diagnostics/ }).click()
  await expect(
    window.getByRole('region', { name: 'Positive prompt syntax diagnostics', exact: true }),
  ).toContainText(
    'Cannot adjust Anima attention: the selection cuts an attention operator or escape.',
  )
  await screenshot(
    '02a-selection-advisory',
    window.getByRole('region', { name: 'Positive prompt syntax diagnostics', exact: true }),
  )
  await window.keyboard.press('Escape')
  await positive.press('Control+End')
  await expect(
    positiveCard.getByRole('button', { name: /^Positive prompt syntax diagnostics/ }),
  ).toHaveCount(0)
  check(
    'A grammar-cutting selection is unchanged with a visible transient advisory that clears on selection change',
  )
  await positive.fill('word+')
  await positive.press('Control+End')
  await positive.press('Shift+ArrowLeft')
  await expect.poll(() => window.evaluate(() => getSelection()?.toString())).toBe('+')
  await positive.press('Control+ArrowUp')
  await expect(positive).toHaveText('word+')
  interpreted(await positive.textContent(), 'word', 1.1, 'Lone suffix selection remains authored')
  await positiveCard.getByRole('button', { name: /^Positive prompt syntax diagnostics/ }).click()
  await expect(
    window.getByRole('region', { name: 'Positive prompt syntax diagnostics', exact: true }),
  ).toContainText(
    'Cannot adjust Anima attention: the selection cuts an attention operator or escape.',
  )
  await window.keyboard.press('Escape')
  await positive.press('Control+Home')
  check(
    'Selecting only an existing suffix refuses adjustment without changing cleaned text or weight',
  )

  await positive.fill('(word:2)+')
  await positive.press('Control+Home')
  await positiveCard.getByRole('button', { name: 'Increase prompt attention', exact: true }).click()
  await expect(positive).toHaveText('(word:2)+')
  await positiveCard.getByRole('button', { name: /^Positive prompt syntax diagnostics/ }).click()
  const diagnostic = window.getByRole('region', {
    name: 'Positive prompt syntax diagnostics',
    exact: true,
  })
  await expect(diagnostic).toContainText('Anima attention group has conflicting operators.')
  await expect(
    diagnostic.getByText('Anima attention group has conflicting operators.', { exact: true }),
  ).toHaveCount(1)
  await screenshot('02-malformed-advisory', diagnostic)
  await screenshot('02-malformed-advisory', diagnostic, 900, 620)
  await window.keyboard.press('Escape')
  await resize(1380, 900)
  await positiveCard.getByRole('button', { name: 'Decrease prompt attention', exact: true }).click()
  await expect(positive).toHaveText('(word:2)+')
  await positiveCard.getByRole('button', { name: /^Positive prompt syntax diagnostics/ }).click()
  await expect(
    diagnostic.getByText('Anima attention group has conflicting operators.', { exact: true }),
  ).toHaveCount(1)
  await window.keyboard.press('Escape')
  await negative.fill('word+-')
  await negative.press('Control+Home')
  await negative.press('Control+ArrowDown')
  await expect(negative).toHaveText('word+-')
  await negativeCard.getByRole('button', { name: /^Negative prompt syntax diagnostics/ }).click()
  await expect(
    window.getByRole('region', { name: 'Negative prompt syntax diagnostics', exact: true }),
  ).toContainText('Anima attention suffix mixes increase and decrease markers.')
  await window.keyboard.press('Escape')
  await blurPrompt()
  assert.equal(
    await window.getByRole('button', { name: 'Save Project', exact: true }).isEnabled(),
    true,
  )
  const malformedSaved = await save()
  assert.equal(malformedSaved.generationDraft.positivePrompt.text, '(word:2)+')
  assert.equal(malformedSaved.generationDraft.negativePrompt.text, 'word+-')
  check(
    'Conflicting actions preserve authored text, expose advisory for both signs and remain explicitly saveable',
  )

  await positive.fill('(long hair)')
  await negative.fill('(word:2)')
  await blurPrompt()
  const authored = await save()
  const restored = await reopen()
  assert.equal(restored.generationDraft.sampling.animaMethod, 'heun')
  assert.deepEqual(restored.generationDraft.positivePrompt, authored.generationDraft.positivePrompt)
  assert.deepEqual(restored.generationDraft.negativePrompt, authored.generationDraft.negativePrompt)
  for (const [name, value] of Object.entries(fixture.inactive))
    assert.deepEqual(restored.generationDraft[name], value)
  check(
    'Native method and both authored signs survive actual loader reopen; inactive Illustrious advanced values remain intact',
  )

  await choose(window.locator('[aria-label="Generation model"]'), 'Illustrious authoring neighbor')
  if (!(await window.locator('[aria-label="Sampler"]').count())) {
    await choose(window.locator('[aria-label="Model version"]'), 'Fixture v1')
  }
  await expect(window.locator('[aria-label="Sampler"]')).toBeVisible()
  assert.equal(
    (await tab()).generationDraft.model.localModelId,
    fixture.illustriousModel.resourceId,
  )
  assert.equal(
    (await tab()).generationDraft.model.localVersionId,
    fixture.illustriousModel.versionId,
  )
  assert.equal((await tab()).generationDraft.sampling.animaMethod, 'heun')
  await positive.fill('(long hair)')
  await positive.press('Control+Home')
  await positive.press('Control+ArrowUp')
  await expect(positive).toHaveText('(long hair)+')
  await blurPrompt()
  await window.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(positive).toHaveText('(long hair)')
  await window.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(control).toBeVisible()
  await positive.press('Control+Home')
  await positive.press('Control+ArrowUp')
  interpreted(
    await positive.textContent(),
    'long hair',
    1.21,
    'Keyboard observes current family after Main switch and Undo',
  )
  await blurPrompt()
  await save()
  check(
    'Real Main family switch retains inactive method; the mounted editor keymap uses current family before and after Undo',
  )

  const generation = await window.evaluate(
    ({ key, documentId }) => window.api.projects.generate(key, { documentId, iterations: 1 }),
    { key: fixture.anima.key, documentId: (await tab()).documentId },
  )
  assert.equal(generation.ok, false)
  assert.equal(generation.error.code, 'GENERATION_VAE_UNSUPPORTED')
  assert.match(generation.error.message, /Anima requires its verified pinned companion VAE/)
  const actionState = await window.evaluate(
    (key) => window.api.projects.getGenerationState(key),
    fixture.anima.key,
  )
  assert.equal(actionState.ok, true, JSON.stringify(actionState))
  assert.equal(actionState.value.animaSupported, true)
  assert.equal(actionState.value.img2imgSupported, false)
  const genuineCapabilities = await application.evaluate(
    () => globalThis.igsAnimaLegacyCapabilityProbe.observations,
  )
  assert.ok(
    genuineCapabilities.some(
      (state) => state.animaSupported === true && state.img2imgSupported === true,
    ),
  )
  report.genuineCapabilities = genuineCapabilities
  const strength = window.getByRole('textbox', { name: 'Denoising Strength', exact: true })
  await expect(strength).toBeEnabled()
  await strength.fill('0')
  await strength.press('Enter')
  await expect.poll(async () => (await tab()).generationDraft.sampling.denoisingStrength).toBe(0)
  await screenshot('04-native-strength-zero', strength)
  await window.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(async () => (await tab()).generationDraft.sampling.denoisingStrength).toBe(null)
  check(
    'A controlled IPC advisory probe suppresses legacy img2img while genuine Main qualifies Anima; native Denoising Strength stays editable and preserves zero/Undo',
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
  await expect(window.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled()
  check(
    'Ready 0.11 native capability reaches renderer/IPC; authoritative public Main refuses the retained external VAE before composition/queue/inference',
    { code: generation.error.code },
  )

  await window.getByText('Advanced Options', { exact: true }).click()
  await expect(window.locator('[aria-label="CFG Rescale"]')).toBeDisabled()
  await expect(window.locator('input[aria-label="VAE precision"]')).toBeDisabled()
  await expect(window.getByRole('button', { name: 'Reset CFG Rescale', exact: true })).toBeEnabled()
  await expect(
    window.getByRole('button', { name: 'Reset VAE precision', exact: true }),
  ).toBeEnabled()
  await screenshot(
    '03-retained-inapplicable-advanced',
    window.locator('[aria-label="CFG Rescale"]'),
  )
  await screenshot(
    '03-retained-inapplicable-advanced',
    window.locator('[aria-label="CFG Rescale"]'),
    900,
    620,
  )
  await window.getByRole('button', { name: 'Reset CFG Rescale', exact: true }).click()
  await expect
    .poll(async () => Object.hasOwn((await tab()).generationDraft, 'cfgRescale'))
    .toBe(false)
  await window.getByRole('button', { name: 'Undo', exact: true }).click()
  assert.equal((await tab()).generationDraft.cfgRescale, 0.45)
  check(
    'Inapplicable Advanced fields stay visible/explained and deliberate Reset uses Project history',
  )
  await save()

  await activate(fixture.illustrious)
  const sampler = window.locator('[aria-label="Sampler"]')
  await choose(sampler, 'DPM++ 2M')
  await choose(window.locator('[aria-label="Scheduler"]'), 'Karras')
  await choose(sampler, 'Euler a')
  await expect
    .poll(async () => (await tab(fixture.illustrious)).generationDraft.sampling.scheduler)
    .toBe(null)
  assert.equal(
    Object.hasOwn((await tab(fixture.illustrious)).generationDraft.sampling, 'animaMethod'),
    false,
  )
  await choose(window.locator('[aria-label="Scheduler"]'), 'Normal')
  await positive.fill('long hair')
  await positive.press('Control+Home')
  await positiveCard.getByRole('button', { name: 'Increase prompt attention', exact: true }).click()
  await expect(positive).toHaveText('(long hair)+')
  await negative.fill('blur')
  await negative.press('Control+Home')
  await negative.press('Control+ArrowDown')
  await expect(negative).toHaveText('blur-')
  await blurPrompt()
  const neighborSaved = await save(fixture.illustrious)
  assert.equal(neighborSaved.generationDraft.sampling.sampler, 'Euler a')
  assert.equal(neighborSaved.generationDraft.sampling.scheduler, 'Normal')
  await reopen(fixture.illustrious)
  check(
    'Illustrious pair compatibility and both existing Compel attention actions remain unchanged through Save/reopen',
  )

  const fresh = await api('create', { title: 'Fresh native method absence', width: 64, height: 64 })
  assert.equal(Object.hasOwn(fresh.generationDraft.sampling, 'animaMethod'), false)
  assert.equal(fresh.generationDraft.sampling.sampler, null)
  assert.equal(fresh.generationDraft.sampling.scheduler, null)
  await api('close', fresh.id)
  check('Actual Main New Project creates no native method and preserves unset SD pair defaults')
  assert.deepEqual(report.pageErrors, [])
  report.peerRequests = requests.map(({ role, request }) => ({ role, type: request.type }))
  assert.deepEqual(hashFiles(sourceFiles), report.sourceSha256)
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
  if (application)
    await application
      .evaluate(({ ipcMain }) => {
        const probe = globalThis.igsAnimaLegacyCapabilityProbe
        if (!probe) return
        ipcMain.removeHandler('projects:get-generation-state')
        ipcMain.handle('projects:get-generation-state', probe.original)
        delete globalThis.igsAnimaLegacyCapabilityProbe
      })
      .catch(() => undefined)
  if (application) {
    // Close only this isolated test process; unsaved-fixture confirmation is outside the scenario.
    await application.evaluate(({ app }) => app.exit(0)).catch(() => undefined)
    await application.close().catch(() => undefined)
  }
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
