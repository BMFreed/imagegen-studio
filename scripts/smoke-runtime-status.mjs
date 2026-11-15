/**
 * Actual RuntimeManager → IPC → built preload event/getter boundary. The Electron main fixture
 * substitutes app wiring and the controlled Node peer substitutes Python/CUDA. No generation,
 * model, catalog, queue persistence or full renderer qualification is claimed here. Optional
 * IMAGEGEN_RUNTIME_STATUS_LAMA_SOURCE exercises the exact read-only resource resolver. Fresh
 * Invoke4875: infill.py130 → invocation_context.py800 load_remote_model →
 * model_install_default.py1549 download_and_cache_model. Studio preserves explicit installation and
 * exact-byte verification rather than Invoke's inference-time download/cache-first shortcut.
 */
import assert from 'node:assert/strict'
import { constants } from 'node:fs'
import { copyFile, mkdir, open, readFile, symlink, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { _electron as electron, expect } from '@playwright/test'
import { build } from 'esbuild'

import { createRuntimeRoots } from '../src/main/runtime/index.ts'
import { verifyInferenceAuxiliaryFile } from '../src/main/runtime/inference-auxiliary-resources.ts'
import { LAMA_OUTPAINT_ARTIFACT } from '../src/main/runtime/lama-manifest.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'

const root = path.resolve(process.env.IMAGEGEN_RUNTIME_STATUS_ARTIFACTS)
const suppliedLamaSource = process.env.IMAGEGEN_RUNTIME_STATUS_LAMA_SOURCE
const lamaSource = suppliedLamaSource === undefined ? null : suppliedLamaSource
const resources = path.join(root, 'resources')
const ownedLama = path.join(resources, LAMA_OUTPAINT_ARTIFACT.filename)
const verifyLama = async (managedPath) =>
  await verifyInferenceAuxiliaryFile({
    byteSize: LAMA_OUTPAINT_ARTIFACT.sizeBytes,
    managedPath,
    sha256: LAMA_OUTPAINT_ARTIFACT.sha256,
  })
if (lamaSource !== null) {
  assert.ok(
    path.isAbsolute(lamaSource) && path.resolve(lamaSource) === lamaSource,
    'The optional LaMa source must be an explicit canonical absolute path.',
  )
  assert.ok(
    lamaSource !== root && !lamaSource.startsWith(root + path.sep),
    'The protected LaMa source must be outside the owned fixture root.',
  )
  await verifyLama(lamaSource)
}
await mkdir(root, { recursive: true })
if (lamaSource !== null) await mkdir(resources, { mode: 0o700 })
const roots = await createRuntimeRoots(path.join(root, 'data'))
const runtimeId = 'controlled-linux-nvidia'
const environment = path.join(roots.environmentsDir, runtimeId)
const executable = path.join(environment, 'bin', 'python')
const config = path.join(environment, 'resources', 'sdxl-config')
await mkdir(path.dirname(executable), { recursive: true })
await mkdir(config, { recursive: true })
await mkdir(path.join(roots.appDataDir, 'scratch'), { mode: 0o700 })
await writeFile(path.join(config, 'model_index.json'), 'pinned')
await writeFile(
  roots.pointerFile,
  JSON.stringify({
    pythonExecutable: executable,
    runtimeId,
    schemaVersion: 1,
  }),
)
await writeFile(
  executable,
  `#!${process.execPath}
const fs = require('node:fs');
const root = ${JSON.stringify(roots.runtimeDir)};
fs.appendFileSync(root+'/launches', process.pid+'\\n');
process.on('exit',()=>fs.appendFileSync(root+'/exits',process.pid+'\\n'));
process.on('SIGTERM',()=>process.exit(0));
process.stdout.write(JSON.stringify({type:'ready',protocolVersion:'1',pythonVersion:'3.12.13',
 workerVersion:'0.2.0',runtimeProfile:'linux-nvidia',
 capabilities:['illustrious-txt2img','linux-owned-inference-v1']})+'\\n');
process.stdin.resume();
`,
  { mode: 0o700 },
)
const entry = path.join(root, 'main.cjs')
await build({
  bundle: true,
  external: ['electron', 'better-sqlite3'],
  format: 'cjs',
  outfile: entry,
  platform: 'node',
  stdin: {
    contents: `
      import {app, BrowserWindow, ipcMain} from 'electron';
      import {RuntimeManager} from './src/main/runtime/index.ts';
      import {GenerationWorkerClient} from './src/main/projects/generation-worker-client.ts';
      import {InferenceAuxiliaryResources} from './src/main/runtime/inference-auxiliary-resources.ts';
      awaitMain();
      async function awaitMain() {
        app.setPath('userData', ${JSON.stringify(path.join(root, 'electron-data'))});
        await app.whenReady();
        let release, finish;
        const state = {entered:false, callbackEntered:false, settled:false, fail:false, outcome:null};
        const manager = new RuntimeManager(${JSON.stringify(roots)},
          {platform:'linux',arch:'x64'}, async (location, environment) => {
            const child=await GenerationWorkerClient.start(location,{environment});
            state.entered=true;
            await new Promise(resolve=>{release=resolve});
            if(state.fail) {await child.close(); throw new Error('Controlled qualification failure');}
            return child;
          });
        const window=new BrowserWindow({width:1000,height:700,webPreferences:{
          preload:${JSON.stringify(path.resolve('dist/preload/preload.cjs'))},
          contextIsolation:true,nodeIntegration:false,sandbox:true
        }});
        let activeManager=manager, healthManager=null, unsubscribeHealth=null, healthFinish;
        const override={enabled:false,value:null};
        const healthState={entered:false,settled:false,outcome:null};
        ipcMain.handle('runtime:get-status',()=>override.enabled ? override.value : activeManager.getStatus());
        manager.onStatusChanged(status=>window.webContents.send('runtime:status-changed',status));
        globalThis.runtimeProbe={state,release:()=>release(),finish:()=>finish(),
          healthState,
          openHealth:()=>{
            if(!${JSON.stringify(lamaSource !== null)}) throw new Error('The explicit LaMa profile is required.');
            unsubscribeHealth?.();
            healthManager?.preventNewGenerationWork();
            healthManager=new RuntimeManager(${JSON.stringify(roots)},
              {platform:'linux',arch:'x64'},undefined,undefined,
              new InferenceAuxiliaryResources(${JSON.stringify(resources)}));
            activeManager=healthManager;
            unsubscribeHealth=healthManager.onStatusChanged(status=>window.webContents.send('runtime:status-changed',status));
          },
          cpuLocationAvailable:async()=>Boolean(await activeManager.resolveInstalledProjectWorker(
            ${JSON.stringify(path.join(roots.appDataDir, 'scratch'))})),
          startHealthOrdinary:()=>{
            Object.assign(healthState,{entered:false,settled:false,outcome:null});
            const work=new Promise(resolve=>{healthFinish=resolve});
            activeManager.withGenerationWorker(${JSON.stringify(path.join(roots.appDataDir, 'scratch'))},
              async()=>{healthState.entered=true;await work;return 'ordinary-admitted';})
              .then(value=>{healthState.outcome=value;healthState.settled=true},
                error=>{healthState.outcome=error.message;healthState.settled=true});
          },
          finishHealthOrdinary:()=>healthFinish(),
          setStatusOverride:value=>{override.enabled=true;override.value=value;},
          clearStatusOverride:()=>{override.enabled=false;override.value=null;},
          emitStatusFixtures:values=>{
            for(const value of values)window.webContents.send('runtime:status-changed',value);
          },
          start:(fail)=>{
            Object.assign(state,{entered:false,callbackEntered:false,settled:false,fail,outcome:null});
            const work=new Promise(resolve=>{finish=resolve});
            manager.withGenerationWorker(${JSON.stringify(path.join(roots.appDataDir, 'scratch'))},
              async()=>{state.callbackEntered=true; await work; return 'completed';})
              .then(value=>{state.outcome=value;state.settled=true},
                error=>{state.outcome=error.message;state.settled=true});
          }};
        await window.loadFile(${JSON.stringify(path.join(root, 'index.html'))});
      }
    `,
    resolveDir: process.cwd(),
  },
  target: 'node24',
})
await writeFile(
  path.join(root, 'index.html'),
  '<!doctype html><title>Runtime IPC fixture</title><p>Controlled IPC boundary</p>',
)
const launchEnvironment = { ...process.env }
delete launchEnvironment.ELECTRON_RUN_AS_NODE
let application
let result
let electronProcess
try {
  application = await electron.launch({ args: [entry], env: launchEnvironment })
  electronProcess = application.process()
  const cgroup = await readFile(`/proc/${electronProcess.pid}/cgroup`, 'utf8')
  const window = await isolateNativeSmokeWindow(application)
  await window.evaluate(() => {
    globalThis.runtimeStatuses = []
    globalThis.runtimeStatusPayloads = []
    globalThis.api.runtime.onStatusChanged((status) => {
      globalThis.runtimeStatuses.push(status.kind)
      globalThis.runtimeStatusPayloads.push(status)
    })
  })
  const records = []
  for (const fail of [false, true]) {
    await application.evaluate((_, fail) => globalThis.runtimeProbe.start(fail), fail)
    await expect
      .poll(() => application.evaluate(() => globalThis.runtimeProbe.state.entered))
      .toBe(true)
    const starting = await window.evaluate(() => globalThis.api.runtime.getStatus())
    assert.equal(starting.ok, true)
    assert.equal(
      starting.value.kind,
      'checking',
      'The real preload must accept the checking getter.',
    )
    await application.evaluate(() => globalThis.runtimeProbe.release())
    const expected = fail ? 'needs-repair' : 'ready'
    // No second getter: the real lifecycle owner must emit the settled event through preload.
    await expect.poll(() => window.evaluate(() => globalThis.runtimeStatuses.at(-1))).toBe(expected)
    if (!fail) {
      assert.equal(
        await application.evaluate(() => globalThis.runtimeProbe.state.callbackEntered),
        true,
      )
      await application.evaluate(() => globalThis.runtimeProbe.finish())
    }
    await expect
      .poll(() => application.evaluate(() => globalThis.runtimeProbe.state.settled))
      .toBe(true)
    records.push({
      fail,
      getter: starting.value.kind,
      event: expected,
      outcome: await application.evaluate(() => globalThis.runtimeProbe.state.outcome),
    })
  }
  const lines = async (name) =>
    (await readFile(path.join(roots.runtimeDir, name), 'utf8')).trim().split('\n')
  const launches = await lines('launches')
  const exits = await lines('exits')
  assert.equal(
    launches.length,
    3,
    'Healthy run has two children; failing self-test has one, no extra probe.',
  )
  assert.deepEqual(exits.sort(), [...launches].sort())
  let lamaHealth = null
  if (lamaSource !== null) {
    const phases = []
    const childCount = async () => (await lines('launches')).length
    const readHealthPhase = async (phase, expected, expectedChildren, requireEvent = true) => {
      const eventCount = await window.evaluate(() => globalThis.runtimeStatusPayloads.length)
      const response = await window.evaluate(() => globalThis.api.runtime.getStatus())
      assert.equal(response.ok, true, `${phase}: the actual built preload must accept the getter.`)
      assert.equal(
        response.value.kind,
        'ready',
        `${phase}: resource health cannot revoke ordinary readiness.`,
      )
      assert.equal(
        response.value.outpaintInfill,
        expected,
        `${phase}: exact resource health must be current.`,
      )
      let event = null
      if (requireEvent) {
        await expect
          .poll(() => window.evaluate(() => globalThis.runtimeStatusPayloads.length))
          .toBeGreaterThan(eventCount)
        event = await window.evaluate(() => globalThis.runtimeStatusPayloads.at(-1))
        assert.deepEqual(
          event,
          response.value,
          `${phase}: the actual preload event must preserve resource health.`,
        )
      }
      assert.equal(
        await childCount(),
        expectedChildren,
        `${phase}: no unexpected qualification child.`,
      )
      phases.push({
        phase,
        getter: response.value,
        event,
        eventEvidence: requireEvent
          ? 'observed transition'
          : 'first status is a getter-only baseline by RuntimeManager contract',
        childCount: expectedChildren,
      })
      return response.value
    }
    const restoreOwnedLama = async () => {
      await copyFile(lamaSource, ownedLama, constants.COPYFILE_EXCL)
      await verifyLama(ownedLama)
    }
    await restoreOwnedLama()
    await application.evaluate(() => globalThis.runtimeProbe.openHealth())
    const initialBaseline = await window.evaluate(() => globalThis.api.runtime.getStatus())
    assert.equal(initialBaseline.ok, true)
    assert.equal(initialBaseline.value.kind, 'ready')
    assert.equal(initialBaseline.value.outpaintInfill, 'ready')
    assert.equal(await childCount(), 4)
    const cachedAt = Date.now()
    await unlink(ownedLama)
    await readHealthPhase('absent', 'needs-repair', 4)
    await restoreOwnedLama()
    await readHealthPhase('exact', 'ready', 4)
    const changedFile = await open(ownedLama, constants.O_RDWR | constants.O_NOFOLLOW)
    try {
      const original = Buffer.alloc(1)
      assert.equal((await changedFile.read(original, 0, 1, 0)).bytesRead, 1)
      await changedFile.write(Buffer.from([original[0] ^ 1]), 0, 1, 0)
      await changedFile.sync()
      assert.equal((await changedFile.stat()).size, LAMA_OUTPAINT_ARTIFACT.sizeBytes)
    } finally {
      await changedFile.close()
    }
    await readHealthPhase('same-size-changed', 'needs-repair', 4)
    await unlink(ownedLama)
    await restoreOwnedLama()
    await readHealthPhase('restored-before-link', 'ready', 4)
    await unlink(ownedLama)
    await symlink(lamaSource, ownedLama)
    await readHealthPhase('symlink', 'needs-repair', 4)
    await unlink(ownedLama)
    await restoreOwnedLama()
    await readHealthPhase('restored', 'ready', 4)
    assert.ok(
      Date.now() - cachedAt < 60_000,
      'Health transitions must exercise the still-cached GPU status.',
    )
    await unlink(ownedLama)
    await application.evaluate(() => globalThis.runtimeProbe.openHealth())
    await readHealthPhase('reopened-absent', 'needs-repair', 5, false)
    await restoreOwnedLama()
    const healthy = await readHealthPhase('reopened-restored', 'ready', 5)

    // Test-only Main override, never a weakened preload validator. An ordered valid event is the
    // processing barrier: no fixed sleep or immediate absence assertion can pass a late event.
    const malformed = [null, false, 0, 'unrecognized', {}, []]
    const malformedStatuses = malformed.map((outpaintInfill) => ({ ...healthy, outpaintInfill }))
    for (const status of malformedStatuses) {
      await application.evaluate((_, value) => globalThis.runtimeProbe.setStatusOverride(value), {
        ok: true,
        value: status,
      })
      try {
        const response = await window.evaluate(() => globalThis.api.runtime.getStatus())
        assert.equal(response.ok, false)
        assert.equal(response.error.code, 'IPC_INVALID_RESPONSE')
      } finally {
        await application.evaluate(() => globalThis.runtimeProbe.clearStatusOverride())
      }
    }
    const beforeMalformedEvents = await window.evaluate(
      () => globalThis.runtimeStatusPayloads.length,
    )
    const barrier = { ...healthy, detail: 'Ordered preload validation barrier.' }
    await application.evaluate(
      (_, values) => globalThis.runtimeProbe.emitStatusFixtures(values),
      [...malformedStatuses, barrier],
    )
    await expect
      .poll(() => window.evaluate(() => globalThis.runtimeStatusPayloads.at(-1)?.detail))
      .toBe(barrier.detail)
    assert.equal(
      await window.evaluate(() => globalThis.runtimeStatusPayloads.length),
      beforeMalformedEvents + 1,
      'All malformed outpaint health events must be ignored before the valid barrier.',
    )
    assert.equal(await childCount(), 5, 'DTO validation must not launch a qualification child.')

    await unlink(ownedLama)
    const cpuLocationAvailable = await application.evaluate(() =>
      globalThis.runtimeProbe.cpuLocationAvailable(),
    )
    assert.equal(
      cpuLocationAvailable,
      true,
      'Missing infill must preserve installed CPU location admission.',
    )
    await application.evaluate(() => globalThis.runtimeProbe.startHealthOrdinary())
    await expect
      .poll(() => application.evaluate(() => globalThis.runtimeProbe.healthState.entered))
      .toBe(true)
    // The active real controlled-peer generation lease supplies readiness; the status read must
    // still verify the absent auxiliary file without starting another worker.
    await readHealthPhase('ordinary-admitted-without-infill', 'needs-repair', 7)
    await application.evaluate(() => globalThis.runtimeProbe.finishHealthOrdinary())
    await expect
      .poll(() => application.evaluate(() => globalThis.runtimeProbe.healthState.settled))
      .toBe(true)
    assert.equal(
      await application.evaluate(() => globalThis.runtimeProbe.healthState.outcome),
      'ordinary-admitted',
    )
    await restoreOwnedLama()
    await verifyLama(lamaSource)
    const allLaunches = await lines('launches')
    const allExits = await lines('exits')
    assert.equal(
      allLaunches.length,
      7,
      'Legacy3 + two health-manager probes + two ordinary lease children only.',
    )
    assert.deepEqual(
      [...allExits].sort(),
      [...allLaunches].sort(),
      'Every owned child must have confirmed close.',
    )
    for (const pid of allLaunches) {
      assert.match(pid, /^[1-9]\d*$/)
      assert.throws(
        () => process.kill(Number(pid), 0),
        { code: 'ESRCH' },
        `Owned child ${pid} must physically exit.`,
      )
    }
    lamaHealth = {
      schemaVersion: 1,
      profile: 'pinned-lama-advisory-health',
      initialBaseline: {
        getter: initialBaseline.value,
        eventEvidence: 'first status is getter-only',
      },
      phases,
      malformedGetterCases: malformed.length,
      malformedEventsRejected: malformed.length,
      orderedValidEventBarriers: 1,
      gpuCacheDidNotHideResourceChanges: true,
      noUnexpectedChildLaunches: true,
      cpuLocationAvailableWithoutInfill: cpuLocationAvailable,
      cpuProcessExecution: false,
      ordinaryControlledPeerAdmission: true,
      allLaunches,
      allExits,
      allOwnedChildrenPhysicallyExited: true,
      originalSource: {
        path: lamaSource,
        sha256: LAMA_OUTPAINT_ARTIFACT.sha256,
        sizeBytes: LAMA_OUTPAINT_ARTIFACT.sizeBytes,
        verifiedBefore: true,
        verifiedAfter: true,
      },
      ownedResource: { path: ownedLama, exactRestorationVerified: true },
      limits:
        'Real RuntimeManager/resource verifier/IPC/built preload and controlled Node inference peers. One owned pinned LaMa copy only; no runtime/other-model cloning, native CUDA/Python inference, download or full production Main/renderer qualification.',
    }
  }
  result = {
    schemaVersion: 2,
    outcome: 'PASS',
    profile: lamaHealth ? 'pinned-lama-advisory-health' : 'legacy-checking-events',
    sourceBasis: {
      invokeRevision: '4875d96531ca6712b288f6e660fcbb34143408c1',
      callerPaths: [
        'invokeai/app/invocations/infill.py:130',
        'invokeai/app/services/shared/invocation_context.py:800',
        'invokeai/app/services/model_install/model_install_default.py:1549',
      ],
    },
    records,
    launches,
    exits,
    ...(lamaHealth ? { lamaHealth } : {}),
    statuses: await window.evaluate(() => globalThis.runtimeStatuses),
    electronPid: electronProcess.pid,
    cgroup,
    limits: 'Controlled subprocess/real runtime/preload only; no ML or full app generation.',
  }
  console.log(
    lamaHealth
      ? 'PASS real RuntimeManager/pinned LaMa/preload health transitions, malformed DTO refusal and exact seven-child exit'
      : 'PASS real RuntimeManager/preload checking getter, ready/failure events and exact three-child exit',
  )
} finally {
  await application?.close()
  if (result) {
    assert.equal(electronProcess.exitCode, 0, 'Electron must close normally, without a forced kill.')
    assert.equal(electronProcess.signalCode, null)
    result.electronExitCode = electronProcess.exitCode
    result.electronSignalCode = electronProcess.signalCode
    result.electronExited = true
    await writeFile(path.join(root, 'report.json'), JSON.stringify(result, null, 2) + '\n')
  }
}
