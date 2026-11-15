/**
 * Built production renderer -> sandboxed preload -> actual runtime-setup IPC owner. The Main
 * installation service and unrelated Home APIs are controlled ports. No release provider, signature
 * trust, download, assembly, persistence, worker or native inference is qualified. Invoke4875
 * useInstallActions23/74 and AddModelsView226/249/ModelsNotice374 provide explicit
 * intent/current-owner publication; model_manager946 -> heuristic_import1123 starts work. Invoke
 * has no aggregate signed engine-review token. This consumes Studio's existing owner.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { _electron as electron, expect } from '@playwright/test'
import { build } from 'esbuild'

import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
} from './qualification-resource-limits.mjs'

const execute = promisify(execFile)
const boundedExecute = (command, args, options) =>
  execute(
    command,
    args.map((value) => (value === 'MemoryMax=12G' ? 'MemoryMax=4G' : value)),
    options,
  )

const supplied = process.env.IMAGEGEN_RUNTIME_SETUP_UI_ARTIFACTS
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
assert.ok(
  typeof supplied === 'string' && path.isAbsolute(supplied) && path.resolve(supplied) === supplied,
  'Supply an explicit canonical owned fixture root.',
)
const root = supplied
const relativeRoot = path.relative(artifactRoot, root)
assert.ok(relativeRoot && !relativeRoot.startsWith('..') && !path.isAbsolute(relativeRoot))
assert.equal(await realpath(artifactRoot), artifactRoot)
assert.equal(
  await realpath(path.dirname(root)),
  path.dirname(root),
  'Create the canonical parent first.',
)
try {
  await mkdir(root, { mode: 0o700 })
} catch (error) {
  if (error.code !== 'EEXIST') throw error
}
const rootInfo = await lstat(root)
assert.ok(rootInfo.isDirectory() && !rootInfo.isSymbolicLink())
assert.equal(await realpath(root), root)
assert.deepEqual(await readdir(root), [], 'The fixture root must be new and empty.')

async function filesBelow(directory) {
  const result = []
  for (const name of (await readdir(directory)).sort()) {
    const filename = path.join(directory, name)
    const info = await lstat(filename)
    assert.equal(info.isSymbolicLink(), false, 'Do not follow built asset symlinks.')
    if (info.isDirectory()) result.push(...(await filesBelow(filename)))
    else {
      assert.ok(info.isFile(), 'Expected a regular build artifact.')
      result.push(filename)
    }
  }
  return result
}

const rendererIndex = path.resolve('dist/renderer/index.html')
assert.ok(
  (await readFile(rendererIndex, 'utf8')).includes('assets/'),
  'Build the production renderer first.',
)
const sourcePaths = [
  'scripts/smoke-runtime-setup-ui.mjs',
  'scripts/native-smoke-window.mjs',
  'scripts/qualification-resource-limits.mjs',
  'src/renderer/App.vue',
  'src/renderer/components/RuntimeSetupModal.vue',
  'src/renderer/components/RuntimeNotice.vue',
  'src/main/runtime/runtime-setup-ipc.ts',
  'src/main/runtime/engine-install-plan.ts',
  'src/main/runtime/lama-manifest.ts',
  'src/shared/api.ts',
  'src/shared/runtime-setup.ts',
  'src/preload/index.ts',
  'dist/preload/preload.cjs',
  ...(await filesBelow('dist/renderer')),
]
const freezeSources = async () =>
  await Promise.all(
    sourcePaths.map(async (name) => {
      const body = await readFile(name)
      return {
        path: name,
        sizeBytes: body.length,
        sha256: createHash('sha256').update(body).digest('hex'),
      }
    }),
  )
const sourceBefore = await freezeSources()
await writeFile(path.join(root, 'source-before.json'), JSON.stringify(sourceBefore, null, 2) + '\n')

await writeFile(
  path.join(root, 'package.json'),
  JSON.stringify({ name: 'imagegen-studio', main: 'main.cjs' }) + '\n',
)
const entry = path.join(root, 'main.cjs')
const closeReceipt = path.join(root, 'main-close.json')
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
      import { ipcChannels } from './src/shared/api.ts';
      import { registerRuntimeSetupIpc } from './src/main/runtime/runtime-setup-ipc.ts';
      import { createEngineInstallPlan, ENGINE_OUTPAINT_INFILL_ARTIFACT_ID }
        from './src/main/runtime/engine-install-plan.ts';
      import { LAMA_OUTPAINT_ARTIFACT } from './src/main/runtime/lama-manifest.ts';
      app.setName('ImageGen Studio');
      app.setPath('userData', ${JSON.stringify(path.join(root, 'electron-data'))});
      start().catch(error => { console.error(error); app.exit(1); });
      async function start() {
        await app.whenReady();
        const state = {
          controls: { available:true, holdPreview:false, holdOperation:false, infillReused:false,
            longRelease:false, metadataReview:false, runtimeCached:true,
            statusKind:'not-installed', outpaintInfill:'ready' },
          previews:[], attempts:[], mutations:[], requests:[], discards:0,
          navigationInvalidations:0, disposed:false, pendingPreview:false, pendingOperation:false
        };
        let captured=null;
        let previewResolve=null;
        let operationResolve=null;
        const currentStatus=()=>({kind:state.controls.statusKind,profile:'linux-nvidia',
          detail:'Controlled Main service; no installed runtime qualification.',
          ...(state.controls.statusKind==='ready'
            ? {runtimeId:'controlled-ui-port',outpaintInfill:state.controls.outpaintInfill} : {})});
        const ready=()=>({ok:true,value:currentStatus()});
        const invalid=()=>({ok:false,error:{code:'RUNTIME_INVALID_REVIEW',message:'Controlled core review refusal.'}});
        const execute=async(mode,token)=>{
          state.attempts.push({mode,token});
          if(!captured || captured.mode!==mode || captured.token!==token) return invalid();
          captured=null;
          if(state.controls.holdOperation) {
            state.pendingOperation=true;
            await new Promise(resolve=>operationResolve=resolve);
            state.pendingOperation=false;
          }
          state.mutations.push({mode,token});
          state.controls.statusKind='ready';state.controls.outpaintInfill='ready';
          return ready();
        };
        const service={
          getStatus:async()=>ready(),
          install:async token=>execute('install',token),
          repair:async token=>execute('repair',token),
          previewInstallation:async mode=>{
            const token=randomUUID();
            const review={mode,token};state.previews.push(review);
            if(!state.controls.available) return {ok:false,error:{code:'RUNTIME_INSTALL_UNAVAILABLE',
              message:'Controlled build has no shipping release provider.'}};
            captured=review;
            const common={mode,token,releaseId:state.controls.longRelease
              ? 'controlled-release+'.repeat(6)+'local' : 'controlled-release+local',
              verifiedPayloadBytes:987654,
              ...(state.controls.metadataReview ? {source:'verified-metadata'} : {})};
            const plan=createEngineInstallPlan({runtimeArtifacts:[{id:'python-runtime-transport',
              filename:'runtime-payload.zip',sha256:'a'.repeat(64),sizeBytes:1000000,installedSizeBytes:null}],
              verifiedCachedRuntimeArtifacts:state.controls.runtimeCached
                ? [{id:'python-runtime-transport',filename:'runtime-payload.zip',
                    sha256:'a'.repeat(64),sizeBytes:1000000}] : [],
              verifiedInstalledArtifacts:state.controls.infillReused ? [{id:ENGINE_OUTPAINT_INFILL_ARTIFACT_ID,
                filename:LAMA_OUTPAINT_ARTIFACT.filename,sha256:LAMA_OUTPAINT_ARTIFACT.sha256,
                sizeBytes:LAMA_OUTPAINT_ARTIFACT.sizeBytes,kind:'outpaint-infill'}] : []});
            if(state.controls.holdPreview) {
              state.pendingPreview=true;
              await new Promise(resolve=>previewResolve=resolve);
              state.pendingPreview=false;
            }
            return {ok:true,value:{...common,scope:'engine',requiredFreeBytes:null,
              runtimeRequiredFreeBytes:21474836480,plan,
              transportDirectory:'/controlled-private-cache',trustedKeys:{fixture:'not-a-shipping-key'},
              auxiliaryPlanId:'private-auxiliary-token'}};
          }
        };
        const window=new BrowserWindow({width:1280,height:800,useContentSize:true,minWidth:900,minHeight:620,
          webPreferences:{preload:${JSON.stringify(path.resolve('dist/preload/preload.cjs'))},
            sandbox:true,contextIsolation:true,nodeIntegration:false}});
        const caller=window.webContents;
        const registrar={handle:(channel,handler)=>ipcMain.handle(channel,(event,...args)=>{
          state.requests.push(channel);
          if(channel===ipcChannels.runtime.discardInstallationReview) state.discards++;
          return handler(event,...args);
        }),removeHandler:channel=>ipcMain.removeHandler(channel)};
        const owner=registerRuntimeSetupIpc(registrar,caller,service);
        const empty=()=>({ok:true,value:[]});
        const homeChannels=[ipcChannels.models.getCatalog,ipcChannels.projects.list,
          ipcChannels.projects.listTrash,ipcChannels.projects.listWorkspaces,ipcChannels.presets.list];
        for(const channel of homeChannels) ipcMain.handle(channel,()=>{state.requests.push(channel);return empty();});
        ipcMain.handle(ipcChannels.projects.getGenerationProgress,()=>{
          state.requests.push(ipcChannels.projects.getGenerationProgress);
          return {ok:true,value:{current:null,revision:0}};
        });
        const invalidateOnNavigation=(_event,_url,_inPlace,isMainFrame)=>{
          if(isMainFrame){state.navigationInvalidations++;owner.invalidateReview();}
        };
        caller.on('did-start-navigation',invalidateOnNavigation);
        caller.on('render-process-gone',owner.invalidateReview);
        window.on('closed',()=>{
          owner.dispose();state.disposed=true;
          caller.removeListener('did-start-navigation',invalidateOnNavigation);
          caller.removeListener('render-process-gone',owner.invalidateReview);
          for(const channel of [...homeChannels,ipcChannels.projects.getGenerationProgress]) ipcMain.removeHandler(channel);
        });
        app.on('will-quit',()=>writeFileSync(${JSON.stringify(closeReceipt)},JSON.stringify(state,null,2)+'\\n'));
        app.on('window-all-closed',()=>app.quit());
        globalThis.setupUiProbe={state,
          controls:patch=>Object.assign(state.controls,patch),
          publishStatus:()=>caller.send(ipcChannels.runtime.statusChanged,currentStatus()),
          resolvePreview:()=>{state.controls.holdPreview=false;const resolve=previewResolve;previewResolve=null;resolve?.();},
          resolveOperation:()=>{state.controls.holdOperation=false;const resolve=operationResolve;operationResolve=null;resolve?.();},
          invalidate:()=>owner.invalidateReview()};
        await window.loadFile(${JSON.stringify(rendererIndex)});
      }
    `,
    resolveDir: process.cwd(),
  },
  target: 'node24',
})

const environment = {
  ...process.env,
  XDG_CACHE_HOME: path.join(root, 'cache'),
  XDG_CONFIG_HOME: path.join(root, 'config'),
  XDG_DATA_HOME: path.join(root, 'data'),
}
delete environment.ELECTRON_RUN_AS_NODE
delete environment.IMAGEGEN_DEV_SERVER_URL
delete environment.IMAGEGEN_TEST_IMAGE_WORKER

let application
let electronProcess
let result
const records = []
const screenshots = []
const resourceChecks = []
try {
  application = await electron.launch({ args: [root], cwd: process.cwd(), env: environment })
  electronProcess = application.process()
  electronProcess.stderr?.on('data', (chunk) => process.stderr.write(chunk))
  resourceChecks.push(
    await boundQualificationProcess(electronProcess.pid, {
      deadlineSeconds: 120,
      execute: boundedExecute,
    }),
  )
  for (const { memoryMax, swapMax } of resourceChecks[0].groups) {
    assert.ok(/^\d+$/.test(memoryMax) && BigInt(memoryMax) <= 4n * 1024n ** 3n)
    assert.equal(swapMax, '0')
  }
  const cgroup = await readFile(`/proc/${electronProcess.pid}/cgroup`, 'utf8')
  const group = cgroup
    .trim()
    .split('\n')
    .find((line) => line.startsWith('0::'))
    ?.slice(3)
  assert.ok(group && path.isAbsolute(group) && group !== '/' && path.normalize(group) === group)
  const groupRoot = `/sys/fs/cgroup${group}`
  const memoryMax = (await readFile(`${groupRoot}/memory.max`, 'utf8')).trim()
  const swapMax = (await readFile(`${groupRoot}/memory.swap.max`, 'utf8')).trim()
  assert.ok(
    /^\d+$/.test(memoryMax) && BigInt(memoryMax) <= 4n * 1024n ** 3n,
    'Actual Electron scope must share the bounded 4 GiB UI envelope.',
  )
  assert.equal(swapMax, '0')
  const page = await isolateNativeSmokeWindow(application)
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const snapshot = async () => await application.evaluate(() => globalThis.setupUiProbe.state)
  const controls = async (patch) =>
    await application.evaluate((_, next) => globalThis.setupUiProbe.controls(next), patch)
  const publishStatus = async (patch) => {
    await controls(patch)
    await application.evaluate(() => globalThis.setupUiProbe.publishStatus())
  }
  const invoke = async (method, ...args) =>
    await page.evaluate(({ method, args }) => globalThis.api.runtime[method](...args), {
      method,
      args,
    })
  const notice = page.getByRole('region', { name: 'Image generation status' })
  const setupButton = notice.getByRole('button', { name: /^(loading )?Set up$/ })
  const repairButton = notice.getByRole('button', { exact: true, name: 'Repair' })
  const installDialog = page.getByRole('dialog', { exact: true, name: 'Set up image generation' })
  const repairDialog = page.getByRole('dialog', { exact: true, name: 'Repair image generation' })
  const capture = async (name) => {
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    await page.mouse.move(0, 0)
    await page.evaluate(async () => {
      await Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => undefined)),
      )
    })
    await page.screenshot({ path: path.join(root, name) })
    screenshots.push({
      name,
      viewport: await page.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
        dpr: devicePixelRatio,
      })),
    })
  }
  const lastReview = async () => (await snapshot()).previews.at(-1)
  const counts = async () => {
    const state = await snapshot()
    return { attempts: state.attempts.length, mutations: state.mutations.length }
  }
  const assertCounts = async (attempts, mutations = attempts) =>
    assert.deepEqual(await counts(), { attempts, mutations })
  const refusedToken = async (name, review, attempts, mutations = attempts) => {
    const response = await invoke(review.mode, review.token)
    assert.equal(response.ok, false, name)
    assert.equal(response.error.code, 'RUNTIME_INVALID_REVIEW', name)
    await assertCounts(attempts, mutations)
    records.push({ name, code: response.error.code, reachedCore: false })
  }
  const waitReview = async (dialog) => {
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Peak free space required', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { exact: true, name: 'Cancel' })).toBeEnabled()
    await expect
      .poll(() => dialog.evaluate((element) => getComputedStyle(element).transform))
      .toBe('none')
  }

  await expect(page.getByRole('region', { exact: true, name: 'Home' })).toBeVisible()
  await expect(page.getByText('No projects yet', { exact: true })).toBeVisible()
  await expect(setupButton).toBeEnabled()
  assert.equal(await page.evaluate(() => location.protocol), 'file:')
  records.push({
    name: 'built production App starts through real preload with controlled empty Home ports',
  })

  await controls({ metadataReview: true, runtimeCached: false })
  await setupButton.click()
  await waitReview(installDialog)
  await expect(installDialog).toContainText(
    'The runtime download is included in this review. Installation creates a new runtime.',
  )
  await expect(installDialog).not.toContainText('The runtime download is already cached.')
  const metadataSource = await lastReview()
  const publicMetadata = await invoke('previewInstallation', 'install')
  assert.equal(publicMetadata.ok, true)
  assert.equal(publicMetadata.value.source, 'verified-metadata')
  assert.equal(publicMetadata.value.runtimeSourceCached, false)
  // The separate protocol probe superseded the visible review; neither can mutate without consent.
  await refusedToken(
    'uncached metadata review does not authorize the superseded token',
    metadataSource,
    0,
  )
  await capture('metadata-uncached-review-1280x800.png')
  await assertCounts(0)
  await installDialog.getByRole('button', { exact: true, name: 'Cancel' }).click()
  await expect(setupButton).toBeEnabled()
  await refusedToken('metadata Cancel revokes the current public review', publicMetadata.value, 0)
  records.push({
    name: 'uncached metadata projection reaches built review before any controlled operation',
    fullDownloadBytes: publicMetadata.value.downloadBytes,
  })
  await controls({ metadataReview: false, runtimeCached: true })

  await setupButton.click()
  await waitReview(installDialog)
  await expect(installDialog.getByText('Unknown', { exact: true })).toHaveCount(3)
  await expect(installDialog).toContainText('20.0 GiB')
  await expect(installDialog).toContainText('The runtime download is already cached.')
  await expect(installDialog).toContainText('Installation still creates a new runtime.')
  await expect(installDialog).toContainText(
    'The outpainting resource will be installed with the engine.',
  )
  await assertCounts(0)
  const canceled = await lastReview()
  await capture('install-review-1280x800.png')
  records.push({
    name: 'loaded install review preserves unknown sizes, separate runtime floor, cache/new-slot meaning; no operation',
  })
  const discardsBeforeCancel = (await snapshot()).discards
  await installDialog.getByRole('button', { exact: true, name: 'Cancel' }).click()
  await expect(installDialog).not.toBeVisible()
  await expect(setupButton).toBeEnabled()
  assert.equal((await snapshot()).discards, discardsBeforeCancel + 1)
  await refusedToken('loaded Cancel revokes Main authority', canceled, 0)

  await setupButton.click()
  await waitReview(installDialog)
  const escaped = await lastReview()
  await page.keyboard.press('Escape')
  await expect(installDialog).not.toBeVisible()
  await expect(setupButton).toBeEnabled()
  await refusedToken('loaded Escape revokes Main authority', escaped, 0)

  await controls({ holdPreview: true })
  await setupButton.click()
  await expect(installDialog.getByRole('status')).toContainText('Preparing installation review…')
  await expect(installDialog.getByRole('button', { name: /^(loading )?Install$/ })).toBeDisabled()
  await expect.poll(async () => (await snapshot()).pendingPreview).toBe(true)
  const pendingReview = await lastReview()
  await installDialog.getByRole('button', { exact: true, name: 'Cancel' }).click()
  await expect(installDialog).not.toBeVisible()
  await expect(setupButton).toBeDisabled()
  await application.evaluate(() => globalThis.setupUiProbe.resolvePreview())
  await expect.poll(async () => (await snapshot()).pendingPreview).toBe(false)
  await expect(setupButton).toBeEnabled()
  await expect(installDialog).not.toBeVisible()
  await refusedToken(
    'Cancel pending preview prevents late reopening and revokes token',
    pendingReview,
    0,
  )

  await setupButton.click()
  await waitReview(installDialog)
  const previousDocument = await lastReview()
  const navigationBefore = (await snapshot()).navigationInvalidations
  await page.reload({ waitUntil: 'load' })
  await expect(setupButton).toBeEnabled()
  await expect(installDialog).not.toBeVisible()
  const navigationAfter = (await snapshot()).navigationInvalidations
  assert.ok(navigationAfter > navigationBefore)
  await refusedToken('actual document reload revokes old review', previousDocument, 0)

  await controls({ longRelease: true })
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(900, 620),
  )
  await expect
    .poll(() => page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
    .toEqual({ width: 900, height: 620 })
  await setupButton.click()
  await waitReview(installDialog)
  await expect(installDialog.getByRole('button', { exact: true, name: 'Install' })).toBeVisible()
  const compactGeometry = await installDialog.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return {
      x: rect.x,
      y: rect.y,
      right: rect.right,
      bottom: rect.bottom,
      width: innerWidth,
      height: innerHeight,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }
  })
  assert.ok(compactGeometry.x >= 0 && compactGeometry.y >= 0)
  assert.ok(
    compactGeometry.right <= compactGeometry.width &&
      compactGeometry.bottom <= compactGeometry.height,
  )
  assert.ok(compactGeometry.scrollWidth <= compactGeometry.clientWidth)
  await capture('install-long-release-900x620.png')
  records.push({
    name: 'native minimum window keeps long release review and actions within viewport',
    geometry: compactGeometry,
  })
  await installDialog.getByRole('button', { exact: true, name: 'Cancel' }).click()
  await expect(setupButton).toBeEnabled()
  await controls({ longRelease: false, holdOperation: true })
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1280, 800),
  )
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1280)

  await setupButton.click()
  await waitReview(installDialog)
  const install = await lastReview()
  await installDialog.getByRole('button', { exact: true, name: 'Install' }).evaluate((button) => {
    button.click()
    button.click()
  })
  await expect.poll(async () => (await snapshot()).pendingOperation).toBe(true)
  await expect(installDialog.getByRole('status')).toContainText('Installing…')
  await expect(installDialog.getByRole('button', { name: /^(loading )?Install$/ })).toBeDisabled()
  await expect(installDialog.getByRole('button', { exact: true, name: 'Cancel' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(installDialog).toBeVisible()
  await assertCounts(1, 0)
  assert.deepEqual((await snapshot()).attempts[0], install)
  await capture('install-pending-1280x800.png')
  records.push({
    name: 'two synchronous DOM confirmation events reach Install once; pending Cancel and Escape remain disabled',
  })
  await application.evaluate(() => globalThis.setupUiProbe.resolveOperation())
  await expect(installDialog).not.toBeVisible()
  await expect(notice).not.toBeVisible()
  await assertCounts(1)
  await refusedToken('successful install token cannot replay', install, 1)

  await publishStatus({ statusKind: 'ready', outpaintInfill: 'needs-repair', infillReused: true })
  await expect(
    notice.getByRole('heading', { exact: true, name: 'Outpainting needs repair' }),
  ).toBeVisible()
  await repairButton.click()
  await waitReview(repairDialog)
  await expect(repairDialog.getByText('0 B', { exact: true })).toBeVisible()
  await expect(repairDialog).toContainText(
    'The existing outpainting resource will be verified and reused.',
  )
  const repair = await lastReview()
  await assertCounts(1)
  await capture('repair-reused-resource-1280x800.png')
  await repairDialog.getByRole('button', { exact: true, name: 'Repair' }).click()
  await expect(repairDialog).not.toBeVisible()
  await expect(notice).not.toBeVisible()
  await assertCounts(2)
  assert.deepEqual((await snapshot()).attempts[1], repair)
  records.push({
    name: 'explicit reviewed partial-resource Repair uses exact repair token and zero-transfer reuse projection',
  })

  await publishStatus({ statusKind: 'needs-repair', infillReused: false })
  await expect(repairButton).toBeEnabled()
  await repairButton.click()
  await waitReview(repairDialog)
  const stale = await lastReview()
  await application.evaluate(() => globalThis.setupUiProbe.invalidate())
  await repairDialog.getByRole('button', { exact: true, name: 'Repair' }).click()
  await expect(repairDialog).not.toBeVisible()
  await expect(notice.getByRole('alert')).toContainText(
    'Review runtime setup again before continuing.',
  )
  await expect(repairButton).toBeEnabled()
  await assertCounts(2)
  const previewCountAfterStale = (await snapshot()).previews.length
  await refusedToken('stale confirmation cannot reach core or automatically retry', stale, 2)
  assert.equal((await snapshot()).previews.length, previewCountAfterStale)
  await repairButton.click()
  await waitReview(repairDialog)
  const refreshed = await lastReview()
  assert.notEqual(refreshed.token, stale.token)
  assert.equal((await snapshot()).previews.length, previewCountAfterStale + 1)
  await assertCounts(2)
  await repairDialog.getByRole('button', { exact: true, name: 'Repair' }).click()
  await expect(repairDialog).not.toBeVisible()
  await expect(notice).not.toBeVisible()
  await assertCounts(3)
  assert.deepEqual((await snapshot()).attempts[2], refreshed)
  records.push({
    name: 'rejected stale review requires a fresh visible preview and another explicit confirmation',
  })

  await publishStatus({ available: false, statusKind: 'ready', outpaintInfill: 'needs-repair' })
  await expect(repairButton).toBeEnabled()
  await repairButton.click()
  await expect(repairDialog).not.toBeVisible()
  await expect(notice.getByRole('alert')).toContainText(
    'Verified release artifacts and a complete setup preview are not available in this build.',
  )
  await expect(
    notice.getByRole('heading', { exact: true, name: 'Outpainting needs repair' }),
  ).toBeVisible()
  await expect(repairButton).toBeEnabled()
  await assertCounts(3)
  await capture('unavailable-partial-repair-1280x800.png')
  records.push({
    name: 'controlled missing-provider review refusal remains visible beside partial outpaint readiness; no operation',
  })

  assert.deepEqual(pageErrors, [], 'The actual production renderer must not throw.')
  const finalState = await snapshot()
  assert.deepEqual(
    finalState.attempts.map(({ mode }) => mode),
    ['install', 'repair', 'repair'],
  )
  assert.deepEqual(finalState.mutations, finalState.attempts)
  assert.equal(finalState.pendingPreview, false)
  assert.equal(finalState.pendingOperation, false)
  const sourceAfter = await freezeSources()
  assert.deepEqual(
    sourceAfter,
    sourceBefore,
    'Actual source and built consumers must remain frozen.',
  )
  await writeFile(path.join(root, 'source-after.json'), JSON.stringify(sourceAfter, null, 2) + '\n')
  result = {
    schemaVersion: 1,
    outcome: 'PASS',
    scope:
      'Built production renderer and sandboxed preload, real setup IPC owner, controlled Main service and empty Home APIs.',
    sourceBasis: {
      invokeRevision: '4875d96531ca6712b288f6e660fcbb34143408c1',
      callerPaths: [
        'invokeai/frontend/webv2/src/features/models/ui/add-models/useInstallActions.ts:23,74',
        'invokeai/frontend/webv2/src/features/models/ui/add-models/AddModelsView.tsx:226,249',
        'invokeai/frontend/webv2/src/features/models/ui/launchpad/ModelsNotice.tsx:374',
        'invokeai/app/api/routers/model_manager.py:946,1006',
        'invokeai/app/services/model_install/model_install_default.py:1123,1138',
      ],
    },
    sourceBefore,
    sourceAfter,
    records,
    screenshots,
    authorizedCoreAttempts: finalState.attempts,
    controlledMutations: finalState.mutations,
    nativeReloadRevocation: { before: navigationBefore, after: navigationAfter },
    unavailableProviderControl:
      'Controlled service refusal; not default production Main or shipping provider qualification.',
    releaseTrustQualified: false,
    runtimeAssemblyQualified: false,
    nativeInferenceQualified: false,
    shippingProviderQualified: false,
    productionRendererExercised: true,
    wholeProductionMainExercised: false,
    persistenceQualified: false,
    pageErrors,
    electronPid: electronProcess.pid,
    cgroup,
    actualScopeLimits: {
      memoryMax,
      swapMax,
      memoryPeak: (await readFile(`${groupRoot}/memory.peak`, 'utf8')).trim(),
      memoryStat: await readFile(`${groupRoot}/memory.stat`, 'utf8'),
    },
  }
} catch (error) {
  await writeFile(
    path.join(root, 'failure.json'),
    JSON.stringify(
      {
        outcome: 'FAIL',
        message: error.message,
        stack: error.stack,
        records,
      },
      null,
      2,
    ) + '\n',
  )
  throw error
} finally {
  await application?.close()
  const scopeExit = resourceChecks.length
    ? await confirmQualificationProcessExit(resourceChecks)
    : null
  if (electronProcess) {
    assert.throws(() => process.kill(electronProcess.pid, 0), { code: 'ESRCH' })
    await writeFile(
      path.join(root, 'physical-exit.json'),
      JSON.stringify(
        {
          electronPid: electronProcess.pid,
          exitCode: electronProcess.exitCode,
          signalCode: electronProcess.signalCode,
          scopeExit,
        },
        null,
        2,
      ) + '\n',
    )
  }
  if (result) {
    result.resourceChecks = resourceChecks
    result.scopeExit = scopeExit
    assert.equal(electronProcess.exitCode, 0, 'Electron must close normally without a forced kill.')
    assert.equal(electronProcess.signalCode, null)
    assert.throws(() => process.kill(electronProcess.pid, 0), { code: 'ESRCH' })
    const closed = JSON.parse(await readFile(closeReceipt, 'utf8'))
    assert.equal(
      closed.disposed,
      true,
      'Captured WebContents cleanup must dispose the public owner.',
    )
    assert.equal(closed.pendingPreview, false)
    assert.equal(closed.pendingOperation, false)
    assert.deepEqual(closed.attempts, result.authorizedCoreAttempts)
    assert.deepEqual(closed.mutations, result.controlledMutations)
    result.electronExitCode = 0
    result.electronSignalCode = null
    result.electronPhysicallyExited = true
    result.publicOwnerDisposedOnClose = true
    result.mainCloseReceipt = 'main-close.json'
    await writeFile(path.join(root, 'report.json'), JSON.stringify(result, null, 2) + '\n')
    console.log(
      'PASS built setup/repair confirmation UI, actual preload/IPC authority, dismissal/reload/stale refusal and normal physical close',
    )
  }
}
