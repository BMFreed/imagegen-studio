/**
 * Native embedding authoring through built renderer/preload/Main, Project history and .igs. Catalog
 * weights and the ready worker peer are fixtures; no textual-inversion inference is claimed.
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
  process.env.IMAGEGEN_PROJECT_EMBEDDINGS_ARTIFACTS ??
    mkdtempSync(path.join(os.tmpdir(), 'igs-project-embeddings-evidence-')),
)
mkdirSync(artifacts, { mode: 0o700, recursive: true })
const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'igs-project-embeddings-smoke-'))
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
  hoverChecks: [],
  sourceSha256: hashFiles([
    'scripts/smoke-project-embeddings.mjs',
    'scripts/native-smoke-window.mjs',
  ]),
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
      'Built Electron renderer/Main/preload, CodeMirror completion effects, SQLite catalog/default, verified exact embedding selection, prompt reconciliation, Project Undo/Redo, explicit .igs Save/reopen, native Copy and Open/relink, Model Manager focus and authoritative Generate refusal.',
    fixtures:
      'Catalog-only checkpoint/embedding bytes, a separately prepared copied .igs with foreign local embedding IDs, an app-owned ready 0.9 JSONL executable, and development image derivatives. Catalog rename is a controlled SQLite fixture change because the product has no rename endpoint. No CUDA, installed ML textual-inversion tensor or inference is exercised.',
    browser:
      'T3 preview_status was available on about:blank, but its HTTP browser cannot exercise native Electron preload/IPC/.igs. The existing checked-in _electron harness exercises the required production boundary.',
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
let liveDatabase
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
async function screenshot(name, locator, width = 1380, height = 900) {
  await resize(width, height)
  await locator.scrollIntoViewIfNeeded()
  await window.mouse.move(Math.min(width - 1, 550), 75)
  await window.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.playState === 'running' &&
            animation.effect?.getComputedTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => undefined)),
    )
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  const geometry = await locator.evaluate((element) => {
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
const editor = (polarity) =>
  window.getByRole('textbox', {
    name: polarity === 'positive' ? 'Positive prompt' : 'Negative prompt',
    exact: true,
  })
const promptRegion = (polarity) =>
  window.getByRole('region', {
    name: polarity === 'positive' ? 'Positive prompt editor' : 'Negative prompt editor',
    exact: true,
  })
const promptField = (polarity) => (polarity === 'positive' ? 'positivePrompt' : 'negativePrompt')
async function prompt(polarity, id = fixture.project.key) {
  return (await tab(id)).generationDraft[promptField(polarity)]
}
async function seal(polarity) {
  await editor(polarity).press('Tab')
  await expect(editor(polarity)).not.toBeFocused()
}
async function edit(polarity, text, id = fixture.project.key) {
  await editor(polarity).fill(text)
  await expect.poll(async () => (await prompt(polarity, id)).text).toBe(text)
  await seal(polarity)
}
async function browse(polarity) {
  await promptRegion(polarity)
    .getByRole('button', { name: 'Browse prompt suggestions', exact: true })
    .click()
}
const option = (token, detail) =>
  window.getByRole('option').filter({ hasText: token }).filter({ hasText: detail })
async function complete(polarity, beforeCaret, afterCaret, token, detail, snapshots = false) {
  const control = editor(polarity)
  await control.fill(beforeCaret + afterCaret)
  await control.press('Control+Home')
  for (let index = 0; index < beforeCaret.length; index += 1) {
    await control.press('ArrowRight')
  }
  await browse(polarity)
  const target = option(token, detail)
  await expect(target).toBeVisible()
  if (snapshots) {
    await screenshot('01-positive-completion', target)
    await control.press('Escape')
    await resize(900, 620)
    await control.scrollIntoViewIfNeeded()
    await browse(polarity)
    await expect(target).toBeVisible()
    await screenshot('01-positive-completion', target, 900, 620)
  }
  await target.click()
  await expect(control).toHaveText(
    beforeCaret.replace(/[^,]*$/, (fragment) => `${fragment.match(/^\s*/)?.[0] ?? ''}${token}`) +
      afterCaret,
  )
  await seal(polarity)
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
async function prepareFixture() {
  const database = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  const repository = new ModelRepository(database.db)
  const publish = async (type, modelId, versionId, name, filename, family = 'illustrious') => {
    const bytes = Buffer.from(`Catalog-only ${type} ${modelId} ${versionId}; not ML weights.`)
    const managedPath = path.join(appDataRoot, 'models', `${type}-${versionId}.safetensors`)
    mkdirSync(path.dirname(managedPath), { recursive: true })
    writeFileSync(managedPath, bytes, { mode: 0o600 })
    const versionName = `${type === 'checkpoint' ? 'Checkpoint' : 'Embedding'} v${versionId % 10}`
    const result = await repository.publishVerifiedInstallation({
      primary: {
        file: {
          managedPath,
          originalFilename: filename,
          sha256: digest(bytes),
          sizeBytes: bytes.length,
          verifiedAt: new Date().toISOString(),
        },
        resource: {
          creator: 'Native embedding fixture',
          displayName: name,
          source: { kind: 'civitai', modelId },
          sourceMetadata: { fixture: true },
          type,
        },
        version: {
          baseModelFamily: family,
          format: 'safetensors',
          name: versionName,
          predictionType: type === 'checkpoint' ? 'epsilon' : null,
          source: {
            kind: 'civitai',
            fileId: versionId + 100,
            versionId,
            expectedSha256: digest(bytes),
          },
          // Deliberately differs from the activation token and does not invent a negative alias.
          sourceMetadata: { fixture: true, trainedWords: ['unrelated training phrase'] },
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
        versionName,
      },
    }
  }
  let checkpoint, first, second, negative, ambiguousA, ambiguousB, incompatible
  try {
    checkpoint = await publish(
      'checkpoint',
      99400,
      99401,
      'Native embedding checkpoint',
      'checkpoint.safetensors',
    )
    first = await publish('embedding', 99500, 99501, 'Native Detail', 'native-detail.safetensors')
    second = await publish(
      'embedding',
      99500,
      99502,
      'Native Detail',
      'native-detail-v2.safetensors',
    )
    negative = await publish(
      'embedding',
      99600,
      99601,
      'Native Negative',
      'native-negative.safetensors',
    )
    ambiguousA = await publish(
      'embedding',
      99700,
      99701,
      'Ambiguity A',
      'native-ambiguous.safetensors',
    )
    ambiguousB = await publish(
      'embedding',
      99800,
      99801,
      'Ambiguity B',
      'native-ambiguous.safetensors',
    )
    incompatible = await publish(
      'embedding',
      99900,
      99901,
      'Anima neighboring embedding',
      'anima-neighbor.safetensors',
      'anima',
    )
    await repository.setDefaultVersion(first.resourceId, first.versionId)
  } finally {
    await database.close()
  }
  const project = async (title, directory, positivePrompt) => {
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
        positivePrompt,
        negativePrompt: { embeddingRefs: [], text: '' },
        sampling: {
          cfgScale: 5,
          denoisingStrength: null,
          sampler: 'Euler a',
          scheduler: 'Normal',
          steps: 2,
        },
        seed: { policy: 'fixed', value: 0 },
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
    negative,
    ambiguousA,
    ambiguousB,
    incompatible,
    foreign,
    project: await project('Native embedding authoring', projectRoot, {
      embeddingRefs: [],
      text: '',
    }),
    copied: await project('Copied embedding authoring', fixtureRoot, {
      embeddingRefs: [{ resource: foreign, token: '<native-detail>' }],
      text: 'copied, <native-detail>, untouched',
    }),
  }
}
async function installRuntimePeer() {
  const roots = await createRuntimeRoots(appDataRoot)
  const runtimeId = 'native-embedding-authoring-linux-nvidia'
  const runtime = path.join(roots.environmentsDir, runtimeId)
  const executable = path.join(runtime, 'bin', 'python')
  const config = path.join(runtime, 'resources', 'sdxl-config')
  mkdirSync(path.dirname(executable), { recursive: true })
  mkdirSync(config, { recursive: true })
  writeFileSync(path.join(config, 'model_index.json'), '{"fixture":"embedding authoring peer"}')
  const profile = readFileSync('worker-python/src/imagegen_worker/srgb.icc').toString('base64')
  const script = String.raw`#!${process.execPath}
const fs=require('node:fs'), crypto=require('node:crypto'), zlib=require('node:zlib')
const profile=Buffer.from(${JSON.stringify(profile)},'base64')
const log=${JSON.stringify(peerRequests)}
const role=process.argv.slice(2).join(' ')==='-I -m imagegen_worker.inference_main'?'inference':'derivatives'
const ready=role==='inference'
  ? {type:'ready',protocolVersion:'1',pythonVersion:'3.12.13',workerVersion:'0.9.0',runtimeProfile:'linux-nvidia',capabilities:['illustrious-txt2img','target-composition','denoising-progress','candidate-thumbnails','illustrious-cfg-rescale','illustrious-img2img','illustrious-lora','illustrious-vae-precision','illustrious-external-vae']}
  : {type:'ready',protocolVersion:'1',pythonVersion:'3.12.13',workerVersion:'0.1.0',runtimeProfile:'derivatives-only',capabilities:['image-derivatives','import-normalization','preview-composition','self-test','target-composition']}
process.stdout.write(JSON.stringify(ready)+'\n')
process.on('SIGTERM',()=>process.exit(0));process.stdin.on('end',()=>process.exit(0))
function chunk(type,data){const header=Buffer.alloc(8);header.writeUInt32BE(data.length);header.write(type,4,'ascii');const checksum=Buffer.alloc(4);checksum.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type),data])));return Buffer.concat([header,data,checksum])}
function png(w,h){const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('iCCP',Buffer.concat([Buffer.from('srgb\0\0'),zlib.deflateSync(profile)])),chunk('IDAT',zlib.deflateSync(Buffer.alloc(h*(1+w*4)))),chunk('IEND',Buffer.alloc(0))])}
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',value=>{input+=value;while(input.includes('\n')){const end=input.indexOf('\n'),request=JSON.parse(input.slice(0,end));input=input.slice(end+1);fs.appendFileSync(log,JSON.stringify({role,request})+'\n');if(request.type==='compose-target'){const bytes=png(request.bbox.width,request.bbox.height);fs.writeFileSync(request.output.targetPngPath,bytes,{flag:'wx',mode:0o600});process.stdout.write(JSON.stringify({type:'target-done',protocolVersion:'1',requestId:request.requestId,mode:'txt2img',rect:request.bbox,composite:{byteSize:bytes.length,colorSpace:'srgb',width:request.bbox.width,height:request.bbox.height,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}})+'\n')}else if(request.type==='self-test')process.stdout.write(JSON.stringify({type:'self-test-result',protocolVersion:'1',requestId:request.requestId,runtimeProfile:'derivatives-only',checks:{pillowVersion:'12.2.0',imageCodecs:['PNG','WEBP'],colorConversion:'srgb'}})+'\n');else process.exit(34)}})
`
  writeFileSync(executable, script, { mode: 0o700 })
  writeFileSync(
    roots.pointerFile,
    JSON.stringify({ schemaVersion: 1, runtimeId, pythonExecutable: executable }),
    { mode: 0o600 },
  )
}
async function observePromptIpc() {
  await application.evaluate(({ ipcMain }) => {
    const channel = 'projects:update-generation-draft'
    const original = ipcMain._invokeHandlers.get(channel)
    if (typeof original !== 'function') throw new Error('Real prompt edit handler is missing.')
    globalThis.igsEmbeddingPromptProbe = { original, calls: [] }
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (event, ...args) => {
      globalThis.igsEmbeddingPromptProbe.calls.push(structuredClone(args))
      return await original(event, ...args)
    })
  })
}
async function selectedCalls() {
  return await application.evaluate(() =>
    globalThis.igsEmbeddingPromptProbe.calls.filter((args) => args[1]?.embeddingSelection),
  )
}
async function refusedGenerate(id, expectedCode = 'GENERATION_EMBEDDING_UNSUPPORTED') {
  const before = await api('getGenerationQueue')
  const previousRequests = existsSync(peerRequests)
    ? readFileSync(peerRequests, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
    : []
  const current = await tab(id)
  const result = await window.evaluate(
    ({ key, documentId }) => window.api.projects.generate(key, { documentId, iterations: 1 }),
    { key: id, documentId: current.documentId },
  )
  assert.equal(result.ok, false)
  assert.equal(result.error.code, expectedCode)
  assert.deepEqual(await api('getGenerationQueue'), before)
  const requests = existsSync(peerRequests)
    ? readFileSync(peerRequests, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
    : []
  assert.equal(
    requests.some(({ request }) => request.type.startsWith('generate-')),
    false,
  )
  assert.equal(
    requests.filter(({ request }) => request.type === 'compose-target').length,
    previousRequests.filter(({ request }) => request.type === 'compose-target').length,
  )
  return result.error
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
  const runtime = await window.evaluate(() => window.api.runtime.getStatus())
  assert.equal(runtime.ok, true)
  assert.equal(runtime.value.kind, 'ready')
  await observePromptIpc()
  const initial = await prompt('positive')
  await editor('positive').click()
  await editor('positive').press('Control+Space')
  await expect(window.getByRole('option')).toHaveCount(5)
  await expect(
    window.getByRole('option').filter({ hasText: 'Anima neighboring embedding' }),
  ).toHaveCount(0)
  await editor('positive').press('Escape')
  const firstUseHelp = window.getByRole('button', { name: 'Close prompt help', exact: true })
  if (await firstUseHelp.isVisible()) await firstUseHelp.click()
  check(
    'Native keyboard completion exposes only available Illustrious embedding versions; Anima neighbor is excluded',
  )

  await complete(
    'positive',
    'portrait, native-det',
    ', untouched',
    '<native-detail>',
    'Native Detail · Embedding v1',
    true,
  )
  await expect
    .poll(async () => (await prompt('positive')).embeddingRefs)
    .toEqual([{ resource: fixture.first.portable, token: '<native-detail>' }])
  const completed = await prompt('positive')
  const readyDecoration = editor('positive').locator('.cm-prompt-embedding')
  await expect(readyDecoration).toHaveText('<native-detail>')
  await readyDecoration.scrollIntoViewIfNeeded()
  const hoverGeometry = await readyDecoration.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(element)
    const segments = [...range.getClientRects()].map((rect) => ({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    }))
    const center = document.elementFromPoint(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    )
    return {
      bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      segments,
      centerTarget: { tag: center?.tagName, class: center?.className },
    }
  })
  report.hoverChecks.push(hoverGeometry)
  // Committing with Tab focuses Browse, whose keyboard tooltip can cover the prompt text.
  // Return focus to the real editor, then hover a rendered segment even if the token wraps.
  await editor('positive').focus()
  await window.mouse.move(550, 75)
  await expect(
    window.getByText('Browse prompt suggestions (Ctrl/Cmd+Space)', { exact: true }),
  ).toBeHidden()
  const hoverSegment = hoverGeometry.segments.find((rect) => rect.width > 0 && rect.height > 0)
  assert.ok(hoverSegment)
  await window.mouse.move(
    hoverSegment.x + hoverSegment.width / 2,
    hoverSegment.y + hoverSegment.height / 2,
  )
  await expect(window.locator('.prompt-resource-tooltip')).toContainText(
    'Embedding · Native Detail · Embedding v1',
  )
  await expect(window.locator('.prompt-resource-tooltip')).toContainText(
    'Activation: <native-detail> · Status: ready',
  )
  const calls = await selectedCalls()
  assert.ok(calls.length > 0)
  const choice = calls.at(-1)[1].embeddingSelection
  assert.deepEqual(choice, {
    resourceId: fixture.first.resourceId,
    token: '<native-detail>',
    versionId: fixture.first.versionId,
  })
  assert.deepEqual(Object.keys(choice).sort(), ['resourceId', 'token', 'versionId'])
  assert.equal(completed.text, 'portrait, <native-detail>, untouched')
  check(
    'Positive completion drives ID-only resource/token selection through real IPC; Main copies exact registry metadata without changing neighboring text',
  )

  const history = window.getByRole('toolbar', { name: 'Project history', exact: true })
  await history.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(async () => await prompt('positive')).toEqual(initial)
  await history.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect.poll(async () => await prompt('positive')).toEqual(completed)
  check(
    'Production Project Undo/Redo restores prompt text and its exact embedding sidecar together',
  )

  await complete(
    'negative',
    'blur, native-det',
    '',
    '<native-detail>',
    'Native Detail · Embedding v1',
  )
  await expect
    .poll(async () => (await prompt('negative')).embeddingRefs)
    .toEqual([{ resource: fixture.first.portable, token: '<native-detail>' }])
  assert.equal((await prompt('negative')).text, 'blur, <native-detail>')
  check(
    'Negative completion uses the same stable filename activation token and verified version, without inventing polarity aliases from trainedWords',
  )

  await edit('positive', 'portrait')
  assert.deepEqual((await prompt('positive')).embeddingRefs, [])
  await edit('positive', 'portrait, <native-detail>, <native-detail>')
  await expect
    .poll(async () => (await prompt('positive')).embeddingRefs)
    .toEqual([{ resource: fixture.first.portable, token: '<native-detail>' }])
  const repeated = await prompt('positive')
  await expect(editor('positive').locator('.cm-prompt-embedding')).toHaveCount(2)
  await edit('positive', 'portrait, <native-detail>')
  assert.deepEqual((await prompt('positive')).embeddingRefs, repeated.embeddingRefs)
  await edit('positive', 'portrait')
  assert.deepEqual((await prompt('positive')).embeddingRefs, [])
  await history.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect
    .poll(async () => await prompt('positive'))
    .toEqual({ ...repeated, text: 'portrait, <native-detail>' })
  await history.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect
    .poll(async () => await prompt('positive'))
    .toEqual({ embeddingRefs: [], text: 'portrait' })
  await edit('positive', 'portrait, <native-detail>')
  await edit('negative', 'blur, <native-negative>, <native-negative>')
  await expect
    .poll(async () => (await prompt('negative')).embeddingRefs)
    .toEqual([{ resource: fixture.negative.portable, token: '<native-negative>' }])
  check(
    'Unique manual literals auto-link through Main; repeated occurrences deduplicate, removing the last occurrence prunes, and Undo/Redo restores both entities',
  )

  const saved = await save(fixture.project.key, fixture.project.path)
  const exactDraft = structuredClone(saved.generationDraft)
  const savedBytes = readFileSync(fixture.project.path)
  const changedDefault = await window.evaluate(
    ({ resourceId, versionId }) => window.api.models.setDefaultVersion(resourceId, versionId),
    { resourceId: fixture.second.resourceId, versionId: fixture.second.versionId },
  )
  assert.equal(changedDefault.ok, true)
  liveDatabase = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  await liveDatabase.db
    .updateTable('model_resource')
    .set({ display_name: 'Renamed Native Detail' })
    .where('id', '=', fixture.first.resourceId)
    .execute()
  await window.getByRole('button', { name: 'Refresh models', exact: true }).click()
  const catalog = await window.evaluate(() => window.api.models.getCatalog())
  assert.equal(catalog.ok, true)
  const entry = catalog.value.find((item) => item.id === fixture.first.resourceId)
  assert.equal(entry.defaultVersionId, fixture.second.versionId)
  assert.equal(entry.name, 'Renamed Native Detail')
  const reopened = await reopen(fixture.project)
  assert.deepEqual(reopened.generationDraft, exactDraft)
  assert.equal(reopened.dirty, false)
  assert.deepEqual(readFileSync(fixture.project.path), savedBytes)
  check(
    'Save/reopen keeps exact v1 prompt literals and captured metadata across actual Default v2 and a disclosed SQLite catalog rename fixture; opening does not rewrite the .igs',
  )

  await expect(window.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled()
  await expect(
    window
      .getByText(
        'This image engine does not support embeddings yet. Remove their activation tokens to generate.',
        { exact: true },
      )
      .first(),
  ).toBeVisible()
  const refused = await refusedGenerate(fixture.project.key)
  check(
    'Valid linked refs stay visibly unsupported by worker 0.9; raw preload Generate refuses before target composition or queue publication',
    { error: refused },
  )

  await edit('negative', '')
  await edit('positive', 'portrait, <native-ambiguous>')
  assert.deepEqual((await prompt('positive')).embeddingRefs, [])
  await expect(
    window
      .getByRole('region', { name: 'Positive prompt embedding diagnostics', exact: true })
      .getByText(/Embedding <native-ambiguous>:/),
  ).toBeVisible()
  const ambiguityError = await refusedGenerate(fixture.project.key, 'MODEL_EMBEDDING_UNBOUND')
  await editor('positive').click()
  await editor('positive').press('Control+End')
  await browse('positive')
  const ambiguousOption = option('<native-ambiguous>', 'Ambiguity A · Embedding v1')
  await expect(ambiguousOption).toBeVisible()
  await expect(option('<native-ambiguous>', 'Ambiguity B · Embedding v1')).toBeVisible()
  await screenshot('02-ambiguous-token-options', ambiguousOption, 900, 620)
  await ambiguousOption.click()
  await seal('positive')
  await expect
    .poll(async () => (await prompt('positive')).embeddingRefs)
    .toEqual([{ resource: fixture.ambiguousA.portable, token: '<native-ambiguous>' }])
  assert.equal((await prompt('positive')).text, 'portrait, <native-ambiguous>')
  check(
    'Ambiguous manually typed token remains unbound and blocks Generate; explicit exact-version completion resolves the collision without duplicating or rewriting the literal',
    { ambiguityError },
  )
  await save(fixture.project.key, fixture.project.path)

  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  const originalBytes = readFileSync(fixture.copied.path)
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
  assert.deepEqual((await prompt('positive', imported.id)).embeddingRefs, [
    { resource: fixture.foreign, token: '<native-detail>' },
  ])
  assert.equal((await tab(imported.id)).dirty, false)
  const relink = window.getByRole('button', {
    name: 'Link installed embedding <native-detail>',
    exact: true,
  })
  await expect(relink).toBeVisible()
  await screenshot('03-copied-embedding-relink', relink, 900, 620)
  await relink.click()
  const locallyBound = {
    ...fixture.foreign,
    localModelId: fixture.first.resourceId,
    localVersionId: fixture.first.versionId,
  }
  await expect
    .poll(async () => (await prompt('positive', imported.id)).embeddingRefs)
    .toEqual([{ resource: locallyBound, token: '<native-detail>' }])
  assert.equal(
    (await prompt('positive', imported.id)).text,
    fixture.copied.document.generationDraft.positivePrompt.text,
  )
  assert.deepEqual(readFileSync(fixture.copied.path), originalBytes)
  const importedPath = readdirSync(projectRoot)
    .filter((name) => name.endsWith('.igs'))
    .map((name) => path.join(projectRoot, name))
    .find((file) => file !== fixture.project.path)
  assert.ok(importedPath)
  assert.deepEqual(
    (await save(imported.id, importedPath)).generationDraft.positivePrompt.embeddingRefs,
    [{ resource: locallyBound, token: '<native-detail>' }],
  )
  const relinkedReopen = await reopen({ key: imported.id, title: fixture.copied.title })
  assert.deepEqual(relinkedReopen.generationDraft.positivePrompt.embeddingRefs, [
    { resource: locallyBound, token: '<native-detail>' },
  ])
  check(
    'Actual Copy and Open preserves foreign IDs; explicit relink finds exact installed v1 despite Default v2, changes only local binding IDs, and genuine Save/reopen preserves original source file',
  )

  rmSync(fixture.first.managedPath)
  await window.getByRole('button', { name: 'Refresh models', exact: true }).click()
  const missing = window
    .getByRole('region', { name: 'Positive prompt embedding diagnostics', exact: true })
    .getByText(/Embedding <native-detail>:/)
  await expect(missing).toBeVisible()
  await expect(missing).toHaveText(
    'Embedding <native-detail>: The exact embedding is missing. Restore it in Model Manager.',
  )
  assert.deepEqual((await prompt('positive', imported.id)).embeddingRefs, [
    { resource: locallyBound, token: '<native-detail>' },
  ])
  assert.equal((await tab(imported.id)).dirty, false)
  const manage = window.getByRole('button', {
    name: 'Manage embedding <native-detail>',
    exact: true,
  })
  await expect(manage).toBeVisible()
  await screenshot('04-missing-exact-embedding', manage)
  await screenshot('04-missing-exact-embedding', manage, 900, 620)
  await manage.click()
  const manager = window.getByRole('dialog', { name: 'Model Manager', exact: true })
  await expect(manager).toBeVisible()
  await expect(manager).toContainText('Renamed Native Detail')
  await expect(manager.locator('.version-row--project')).toContainText('Embedding v1')
  await expect(manager.locator('.version-row--project')).toContainText('Selected in Project')
  await expect(manager.locator('.version-row--project')).not.toContainText('Embedding v2')
  await screenshot(
    '05-missing-embedding-model-manager',
    manager.getByRole('button', { name: 'Close Model Manager', exact: true }),
    900,
    620,
  )
  await manager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await edit('positive', 'copied, <native-detail>, untouched, still linked', imported.id)
  assert.deepEqual((await prompt('positive', imported.id)).embeddingRefs, [
    { resource: locallyBound, token: '<native-detail>' },
  ])
  assert.deepEqual(
    (await save(imported.id, importedPath)).generationDraft.positivePrompt.embeddingRefs,
    [{ resource: locallyBound, token: '<native-detail>' }],
  )
  check(
    'Missing exact bytes keep the saved sidecar and actionable diagnostic; Manage opens the exact v1 in production Model Manager, unrelated editing and Save never substitute Default v2',
  )

  assert.deepEqual(report.pageErrors, [])
  report.peerRequests = existsSync(peerRequests)
    ? readFileSync(peerRequests, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(JSON.parse)
        .map(({ role, request }) => ({ role, type: request.type }))
    : []
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
  if (application) {
    let closeTimer
    const close = application.close()
    try {
      await Promise.race([
        close,
        new Promise((_, reject) => {
          closeTimer = setTimeout(() => reject(new Error('Owned fixture close timed out')), 15000)
        }),
      ])
    } catch (error) {
      report.cleanup = { message: error.message, ownedPid: application.process().pid }
      application.process().kill('SIGKILL')
      void close.catch(() => undefined)
      if (report.outcome === 'passed') {
        report.outcome = 'failed'
        report.failure = { message: error.message, stack: error.stack }
        process.exitCode = 1
      }
    } finally {
      clearTimeout(closeTimer)
    }
  }
  await liveDatabase?.close()
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
