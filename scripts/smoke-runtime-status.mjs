/**
 * Actual RuntimeManager → IPC → built preload event/getter boundary. The Electron main fixture
 * substitutes app wiring and the controlled Node peer substitutes Python/CUDA. No generation,
 * model, catalog, queue persistence or full renderer qualification is claimed here.
 */
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { _electron as electron, expect } from '@playwright/test'
import { build } from 'esbuild'

import { createRuntimeRoots } from '../src/main/runtime/index.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'

const root = path.resolve(process.env.IMAGEGEN_RUNTIME_STATUS_ARTIFACTS)
await mkdir(root, { recursive: true })
const roots = await createRuntimeRoots(path.join(root, 'data'))
const runtimeId = 'controlled-linux-nvidia'
const environment = path.join(roots.environmentsDir, runtimeId)
const executable = path.join(environment, 'bin', 'python')
const config = path.join(environment, 'resources', 'sdxl-config')
await mkdir(path.dirname(executable), { recursive: true })
await mkdir(config, { recursive: true })
await mkdir(path.join(roots.appDataDir, 'scratch'), { mode: 0o700 })
await writeFile(path.join(config, 'model_index.json'), 'pinned')
await writeFile(roots.pointerFile, JSON.stringify({
  pythonExecutable: executable, runtimeId, schemaVersion: 1,
}))
await writeFile(executable, `#!${process.execPath}
const fs = require('node:fs');
const root = ${JSON.stringify(roots.runtimeDir)};
fs.appendFileSync(root+'/launches', process.pid+'\\n');
process.on('exit',()=>fs.appendFileSync(root+'/exits',process.pid+'\\n'));
process.on('SIGTERM',()=>process.exit(0));
process.stdout.write(JSON.stringify({type:'ready',protocolVersion:'1',pythonVersion:'3.12.13',
 workerVersion:'0.2.0',runtimeProfile:'linux-nvidia',
 capabilities:['illustrious-txt2img','linux-owned-inference-v1']})+'\\n');
process.stdin.resume();
`, { mode: 0o700 })
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
        ipcMain.handle('runtime:get-status',()=>manager.getStatus());
        manager.onStatusChanged(status=>window.webContents.send('runtime:status-changed',status));
        globalThis.runtimeProbe={state,release:()=>release(),finish:()=>finish(),
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
await writeFile(path.join(root, 'index.html'), '<!doctype html><title>Runtime IPC fixture</title><p>Controlled IPC boundary</p>')
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
    globalThis.api.runtime.onStatusChanged(status => globalThis.runtimeStatuses.push(status.kind))
  })
  const records = []
  for (const fail of [false, true]) {
    await application.evaluate((_, fail) => globalThis.runtimeProbe.start(fail), fail)
    await expect.poll(() => application.evaluate(() => globalThis.runtimeProbe.state.entered)).toBe(true)
    const starting = await window.evaluate(() => globalThis.api.runtime.getStatus())
    assert.equal(starting.ok, true)
    assert.equal(starting.value.kind, 'checking', 'The real preload must accept the checking getter.')
    await application.evaluate(() => globalThis.runtimeProbe.release())
    const expected = fail ? 'needs-repair' : 'ready'
    // No second getter: the real lifecycle owner must emit the settled event through preload.
    await expect.poll(() => window.evaluate(() => globalThis.runtimeStatuses.at(-1))).toBe(expected)
    if (!fail) {
      assert.equal(await application.evaluate(() => globalThis.runtimeProbe.state.callbackEntered), true)
      await application.evaluate(() => globalThis.runtimeProbe.finish())
    }
    await expect.poll(() => application.evaluate(() => globalThis.runtimeProbe.state.settled)).toBe(true)
    records.push({ fail, getter: starting.value.kind, event: expected,
      outcome: await application.evaluate(() => globalThis.runtimeProbe.state.outcome) })
  }
  const lines = async name => (await readFile(path.join(roots.runtimeDir, name), 'utf8')).trim().split('\n')
  const launches = await lines('launches')
  const exits = await lines('exits')
  assert.equal(launches.length, 3, 'Healthy run has two children; failing self-test has one, no extra probe.')
  assert.deepEqual(exits.sort(), [...launches].sort())
  result = {
    records, launches, exits,
    statuses: await window.evaluate(() => globalThis.runtimeStatuses),
    electronPid: electronProcess.pid,
    cgroup,
    limits: 'Controlled subprocess/real runtime/preload only; no ML or full app generation.',
  }
  console.log('PASS real RuntimeManager/preload checking getter, ready/failure events and exact three-child exit')
} finally {
  await application?.close()
  if (result) {
    assert.ok(electronProcess.exitCode !== null || electronProcess.signalCode !== null)
    result.electronExited = true
    await writeFile(path.join(root, 'report.json'), JSON.stringify(result, null, 2) + '\n')
  }
}
