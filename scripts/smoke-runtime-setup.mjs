/**
 * Real registerRuntimeSetupIpc -> Electron IPC -> built sandboxed preload. The internal Main
 * service is a controlled port: no release trust, download, assembly, worker or product UI is
 * exercised. Fresh Invoke4875 useInstallActions23/74 (AddModelsView226/ModelsNotice374) scopes
 * explicit intent; model_manager946 -> heuristic_import1123 starts work immediately. Invoke has
 * no signed aggregate review token; this fixture exercises Studio's existing reviewed boundary.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { _electron as electron, expect } from '@playwright/test'
import { build } from 'esbuild'

import { isRuntimeSetupReview } from '../src/shared/runtime-setup.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'

const supplied = process.env.IMAGEGEN_RUNTIME_SETUP_ARTIFACTS
assert.ok(
  typeof supplied === 'string' && path.isAbsolute(supplied) && path.resolve(supplied) === supplied,
  'Supply an explicit canonical owned fixture root.',
)
const root = supplied
await mkdir(root, { mode: 0o700, recursive: true })
const rootInfo = await lstat(root)
assert.ok(rootInfo.isDirectory() && !rootInfo.isSymbolicLink())
assert.equal(await realpath(root), root)
assert.deepEqual(await readdir(root), [], 'The fixture root must be new and empty.')

const sourcePaths = [
  'scripts/smoke-runtime-setup.mjs',
  'src/main/runtime/runtime-setup-ipc.ts',
  'src/main/runtime/engine-install-plan.ts',
  'src/main/runtime/lama-manifest.ts',
  'src/shared/api.ts',
  'src/shared/runtime-setup.ts',
  'src/preload/index.ts',
  'dist/preload/preload.cjs',
]
const freezeSources = async () =>
  await Promise.all(
    sourcePaths.map(async (name) => {
      const body = await readFile(name)
      return { path: name, sizeBytes: body.length, sha256: createHash('sha256').update(body).digest('hex') }
    }),
  )
const sourceBefore = await freezeSources()
const entry = path.join(root, 'main.cjs')
const closeReceipt = path.join(root, 'main-close.json')
const indexFile = path.join(root, 'index.html')
await build({
  bundle: true,
  external: ['electron'],
  format: 'cjs',
  outfile: entry,
  platform: 'node',
  stdin: {
    contents: `
      import { app, BrowserWindow, ipcMain } from 'electron';
      import { randomUUID } from 'node:crypto';
      import { writeFileSync } from 'node:fs';
      import { registerRuntimeSetupIpc } from './src/main/runtime/runtime-setup-ipc.ts';
      import { createEngineInstallPlan } from './src/main/runtime/engine-install-plan.ts';
      app.setPath('userData', ${JSON.stringify(path.join(root, 'electron-data'))});
      start().catch(error => { console.error(error); app.exit(1); });
      async function start() {
        await app.whenReady();
        const state = { controls:{available:true,scope:'engine'}, previews:[], attempts:[], mutations:[],
          navigationInvalidations:0, simulatedInvalidations:0, disposed:false };
        let captured=null;
        const ready=()=>({ok:true,value:{kind:'ready',profile:'linux-nvidia',
          runtimeId:'controlled-main-port',detail:'Controlled Main port; no runtime qualification.'}});
        const invalid=()=>({ok:false,error:{code:'RUNTIME_INVALID_REVIEW',message:'Controlled core review refusal.'}});
        const execute=async(mode,token)=>{
          state.attempts.push({mode,token});
          if(!captured || captured.mode!==mode || captured.token!==token) return invalid();
          captured=null;state.mutations.push({mode,token});return ready();
        };
        const service={
          getStatus:async()=>ready(),
          install:async token=>execute('install',token),
          repair:async token=>execute('repair',token),
          previewInstallation:async mode=>{
            state.previews.push(mode);
            if(!state.controls.available) return {ok:false,error:{code:'RUNTIME_INSTALL_UNAVAILABLE',
              message:'Controlled build has no shipping release provider.'}};
            const common={mode,releaseId:'controlled-release+local',token:randomUUID(),verifiedPayloadBytes:987654};
            captured={mode,token:common.token};
            if(state.controls.scope==='python-runtime-slot') return {ok:true,value:{...common,
              scope:'python-runtime-slot',requiredFreeBytes:21474836480}};
            const plan=createEngineInstallPlan({runtimeArtifacts:[{id:'python-runtime-transport',
              filename:'runtime-payload.zip',sha256:'a'.repeat(64),sizeBytes:1000000,installedSizeBytes:null}],
              verifiedCachedRuntimeArtifacts:[{id:'python-runtime-transport',filename:'runtime-payload.zip',
              sha256:'a'.repeat(64),sizeBytes:1000000}]});
            return {ok:true,value:{...common,scope:'engine',requiredFreeBytes:null,
              runtimeRequiredFreeBytes:21474836480,plan,
              transportDirectory:'/controlled-private-cache',trustedKeys:{fixture:'not-a-shipping-key'},
              auxiliaryPlanId:'private-auxiliary-token'}};
          }
        };
        const window=new BrowserWindow({width:900,height:650,webPreferences:{
          preload:${JSON.stringify(path.resolve('dist/preload/preload.cjs'))},
          sandbox:true,contextIsolation:true,nodeIntegration:false}});
        const overrides=new Map();
        const registrar={handle:(channel,handler)=>ipcMain.handle(channel,(event,...args)=>
          overrides.has(channel) ? overrides.get(channel) : handler(event,...args)),
          removeHandler:channel=>ipcMain.removeHandler(channel)};
        const caller=window.webContents;
        const owner=registerRuntimeSetupIpc(registrar,caller,service);
        const invalidateOnNavigation=(_event,_url,_inPlace,isMainFrame)=>{
          if(isMainFrame){state.navigationInvalidations++;owner.invalidateReview();}
        };
        window.webContents.on('did-start-navigation',invalidateOnNavigation);
        window.webContents.on('render-process-gone',owner.invalidateReview);
        window.on('closed',()=>{
          try { window.webContents.removeListener('unused-close-probe',()=>{}); }
          catch { state.destroyedWindowAccessorRejected=true; }
          owner.dispose();state.disposed=true;
          caller.removeListener('did-start-navigation',invalidateOnNavigation);
          caller.removeListener('render-process-gone',owner.invalidateReview);
        });
        app.on('will-quit',()=>writeFileSync(${JSON.stringify(closeReceipt)},JSON.stringify(state,null,2)+'\\n'));
        globalThis.setupProbe={state,controls:patch=>Object.assign(state.controls,patch),
          override:(channel,value)=>overrides.set(channel,value),clearOverride:channel=>overrides.delete(channel),
          invalidate:()=>{state.simulatedInvalidations++;owner.invalidateReview();}};
        await window.loadFile(${JSON.stringify(indexFile)});
      }
    `,
    resolveDir: process.cwd(),
  },
  target: 'node24',
})
await writeFile(indexFile, '<!doctype html><title>Engine review IPC fixture</title><p>Controlled transport boundary</p>')

const environment = {
  ...process.env,
  XDG_CACHE_HOME: path.join(root, 'cache'),
  XDG_CONFIG_HOME: path.join(root, 'config'),
  XDG_DATA_HOME: path.join(root, 'data'),
}
delete environment.ELECTRON_RUN_AS_NODE
let application
let electronProcess
let result
try {
  application = await electron.launch({ args: [entry], env: environment })
  electronProcess = application.process()
  electronProcess.stderr?.on('data', (chunk) => process.stderr.write(chunk))
  const cgroup = await readFile(`/proc/${electronProcess.pid}/cgroup`, 'utf8')
  const window = await isolateNativeSmokeWindow(application)
  const invoke = async (method, ...args) =>
    await window.evaluate(({ method, args }) => globalThis.api.runtime[method](...args), { method, args })
  const counts = async () =>
    await application.evaluate(() => ({
      attempts: globalThis.setupProbe.state.attempts.length,
      mutations: globalThis.setupProbe.state.mutations.length,
    }))
  const controls = async (patch) =>
    await application.evaluate((_, next) => globalThis.setupProbe.controls(next), patch)
  const records = []
  let authorized = 0
  const refused = async (name, method, args, expectedCode) => {
    const response = await invoke(method, ...args)
    assert.equal(response.ok, false, `${name}: request must be refused.`)
    assert.equal(response.error.code, expectedCode, name)
    assert.deepEqual(await counts(), { attempts: authorized, mutations: authorized }, `${name}: no core operation.`)
    records.push({ name, code: response.error.code, noCoreOperation: true })
  }
  const preview = async (mode) => {
    const response = await invoke('previewInstallation', mode)
    assert.equal(response.ok, true)
    assert.equal(isRuntimeSetupReview(response.value), true)
    assert.equal(response.value.mode, mode)
    assert.equal(response.value.requiredFreeBytes, null)
    assert.equal(response.value.runtimeRequiredFreeBytes, 21474836480)
    assert.equal(response.value.downloadBytes, 205669692)
    assert.equal(response.value.installedBytes, null)
    assert.equal(response.value.runtimeSourceCached, true)
    assert.equal(response.value.outpaintInfillReused, false)
    assert.deepEqual(Object.keys(response.value).sort(), [
      'additionalInstalledBytes', 'downloadBytes', 'installedBytes', 'mode', 'outpaintInfillReused',
      'releaseId', 'requiredFreeBytes', 'runtimeRequiredFreeBytes', 'runtimeSourceCached', 'scope',
      'source', 'token',
    ])
    return response.value
  }

  assert.equal((await invoke('getStatus')).ok, true)
  await refused('legacy zero-argument install', 'install', [], 'RUNTIME_INSTALL_UNAVAILABLE')
  await refused('legacy zero-argument repair', 'repair', [], 'RUNTIME_INSTALL_UNAVAILABLE')
  await controls({ available: false })
  await refused('missing provider preview', 'previewInstallation', ['install'], 'RUNTIME_INSTALL_UNAVAILABLE')
  await controls({ available: true })

  const installation = await preview('install')
  await refused('wrong operation mode', 'repair', [installation.token], 'RUNTIME_INVALID_REVIEW')
  const installed = await invoke('install', installation.token)
  assert.equal(installed.ok, true)
  authorized++
  assert.deepEqual(await counts(), { attempts: 1, mutations: 1 })
  records.push({ name: 'explicit reviewed install', kind: installed.value.kind })
  await refused('one-use install replay', 'install', [installation.token], 'RUNTIME_INVALID_REVIEW')

  const discarded = await preview('install')
  assert.deepEqual(await invoke('discardInstallationReview'), { ok: true, value: null })
  await refused('discarded consent', 'install', [discarded.token], 'RUNTIME_INVALID_REVIEW')
  const legacy = await preview('install')
  await refused('zero-argument request revokes consent', 'install', [], 'RUNTIME_INSTALL_UNAVAILABLE')
  await refused('token after zero-argument request', 'install', [legacy.token], 'RUNTIME_INVALID_REVIEW')
  const replaced = await preview('install')
  const replacement = await preview('install')
  assert.notEqual(replaced.token, replacement.token)
  await refused('replaced preview', 'install', [replaced.token], 'RUNTIME_INVALID_REVIEW')
  assert.deepEqual(await invoke('discardInstallationReview'), { ok: true, value: null })

  const failedPreview = await preview('install')
  await controls({ available: false })
  await refused('failed newer preview', 'previewInstallation', ['install'], 'RUNTIME_INSTALL_UNAVAILABLE')
  await refused('token preceding failed preview', 'install', [failedPreview.token], 'RUNTIME_INVALID_REVIEW')
  await controls({ available: true, scope: 'python-runtime-slot' })
  await refused('private Python-slot review', 'previewInstallation', ['install'], 'RUNTIME_INSTALL_UNAVAILABLE')
  await controls({ scope: 'engine' })

  const beforeReload = await preview('repair')
  const navigationBefore = await application.evaluate(() => globalThis.setupProbe.state.navigationInvalidations)
  await window.reload({ waitUntil: 'load' })
  await expect.poll(() => window.evaluate(() => typeof globalThis.api?.runtime?.previewInstallation)).toBe('function')
  const navigationAfter = await application.evaluate(() => globalThis.setupProbe.state.navigationInvalidations)
  assert.ok(navigationAfter > navigationBefore, 'Native main-frame reload must invalidate document consent.')
  await refused('token from prior renderer document', 'repair', [beforeReload.token], 'RUNTIME_INVALID_REVIEW')
  const repair = await preview('repair')
  const repaired = await invoke('repair', repair.token)
  assert.equal(repaired.ok, true)
  authorized++
  assert.deepEqual(await counts(), { attempts: 2, mutations: 2 })
  records.push({ name: 'explicit reviewed repair', kind: repaired.value.kind })
  await refused('one-use repair replay', 'repair', [repair.token], 'RUNTIME_INVALID_REVIEW')

  const invalidated = await preview('install')
  await application.evaluate(() => globalThis.setupProbe.invalidate())
  await refused('explicit renderer-loss invalidation control', 'install', [invalidated.token], 'RUNTIME_INVALID_REVIEW')
  await refused('malformed review request mode', 'previewInstallation', ['remove'], 'IPC_INVALID_CALLER')
  await refused('malformed operation token', 'install', ['not-a-uuid'], 'IPC_INVALID_CALLER')

  const reviewChannel = 'runtime:preview-installation'
  const invalidReviews = [
    ['wrong scope', { ...installation, scope: 'python-runtime-slot' }],
    ['wrong source', { ...installation, source: 'download-url' }],
    ['wrong mode for request', { ...installation, mode: 'repair' }],
    ['negative bytes', { ...installation, downloadBytes: -1 }],
    ['NaN bytes', { ...installation, downloadBytes: NaN }],
    ['private path', { ...installation, path: '/controlled-private-cache' }],
    ['private keys', { ...installation, trustedKeys: {} }],
    ['null runtime floor', { ...installation, runtimeRequiredFreeBytes: null }],
    ['invented aggregate peak', { ...installation, requiredFreeBytes: 21474836480 }],
    ['uncached runtime', { ...installation, runtimeSourceCached: false }],
    ['malformed token', { ...installation, token: 'not-a-uuid' }],
    ['null reuse', { ...installation, outpaintInfillReused: null }],
    ['null DTO', null],
  ]
  for (const [name, value] of invalidReviews) {
    await application.evaluate((_, { channel, value }) => globalThis.setupProbe.override(channel, value), {
      channel: reviewChannel, value: { ok: true, value },
    })
    try {
      await refused(`preload ${name}`, 'previewInstallation', ['install'], 'IPC_INVALID_RESPONSE')
    } finally {
      await application.evaluate((_, channel) => globalThis.setupProbe.clearOverride(channel), reviewChannel)
    }
  }
  const discardChannel = 'runtime:discard-installation-review'
  const invalidDiscards = [null, { ok: true, value: {} }, { ok: true, value: 0 }, { ok: false, error: { code: 'x' } }]
  for (const value of invalidDiscards) {
    await application.evaluate((_, { channel, value }) => globalThis.setupProbe.override(channel, value), {
      channel: discardChannel, value,
    })
    try {
      await refused('preload malformed discard response', 'discardInstallationReview', [], 'IPC_INVALID_RESPONSE')
    } finally {
      await application.evaluate((_, channel) => globalThis.setupProbe.clearOverride(channel), discardChannel)
    }
  }
  const sourceAfter = await freezeSources()
  assert.deepEqual(sourceAfter, sourceBefore, 'The actual source and built preload must remain frozen.')
  const finalState = await application.evaluate(() => globalThis.setupProbe.state)
  assert.deepEqual(finalState.attempts.map(({ mode }) => mode), ['install', 'repair'])
  assert.deepEqual(finalState.mutations, finalState.attempts)
  result = {
    schemaVersion: 1,
    outcome: 'PASS',
    scope: 'Actual public setup IPC owner and built sandboxed preload, controlled internal Main service.',
    sourceBasis: {
      invokeRevision: '4875d96531ca6712b288f6e660fcbb34143408c1',
      callerPaths: [
        'invokeai/frontend/webv2/src/features/models/ui/add-models/useInstallActions.ts:23,74',
        'invokeai/frontend/webv2/src/features/models/ui/add-models/AddModelsView.tsx:226,249',
        'invokeai/frontend/webv2/src/features/models/ui/launchpad/ModelsNotice.tsx:374',
        'invokeai/app/api/routers/model_manager.py:946',
        'invokeai/app/services/model_install/model_install_default.py:1123,1138,1267',
      ],
    },
    sourceBefore,
    sourceAfter,
    records,
    publicReview: installation,
    malformedReviewCases: invalidReviews.length,
    malformedDiscardCases: invalidDiscards.length,
    authorizedCoreAttempts: finalState.attempts,
    controlledMutations: finalState.mutations,
    nativeReloadRevocation: { before: navigationBefore, after: navigationAfter },
    rendererLossControl: 'Direct invalidateReview call only; no renderer crash qualification.',
    subframeCallerControl: 'Unit-level only; not attempted via an unsafe iframe preload.',
    releaseTrustQualified: false,
    runtimeAssemblyQualified: false,
    nativeInferenceQualified: false,
    shippingProviderQualified: false,
    fullProductUiQualified: false,
    electronPid: electronProcess.pid,
    cgroup,
  }
} finally {
  await application?.close()
  if (result) {
    assert.equal(electronProcess.exitCode, 0, 'Electron must close normally, without a forced kill.')
    assert.equal(electronProcess.signalCode, null)
    assert.throws(() => process.kill(electronProcess.pid, 0), { code: 'ESRCH' })
    const closed = JSON.parse(await readFile(closeReceipt, 'utf8'))
    assert.equal(closed.disposed, true, 'Window close must dispose the public handler owner.')
    assert.equal(closed.destroyedWindowAccessorRejected, true, 'The old post-close window accessor is unavailable; captured caller cleanup succeeds.')
    assert.deepEqual(closed.attempts, result.authorizedCoreAttempts)
    assert.deepEqual(closed.mutations, result.controlledMutations)
    result.electronExitCode = 0
    result.electronSignalCode = null
    result.electronPhysicallyExited = true
    result.publicOwnerDisposedOnClose = true
    result.mainCloseReceipt = 'main-close.json'
    await writeFile(path.join(root, 'report.json'), JSON.stringify(result, null, 2) + '\n')
    console.log('PASS public engine review/token IPC, replay/discard/reload refusal, strict DTO validation and normal physical close')
  }
}
