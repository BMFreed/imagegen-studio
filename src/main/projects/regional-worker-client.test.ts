import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import type { GenerationDenoisingProgress } from '../../shared/projects/generation-progress.js'

import type { ChildProcessWithoutNullStreams } from 'node:child_process'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { chmod, lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { crc32, deflateSync } from 'node:zlib'

import type { GenerationWorkerRequest } from './generation-processor.js'
import type { CurrentCanvasRegionalRecipe } from './project-current-canvas-regional-recipe.js'
import type { RegionalWorkerInput } from './regional-worker-request.js'

import { GenerationWorkerClient } from './generation-worker-client.js'
import { OUTPAINT_READY } from './test-fixtures/outpaint-ready.js'

const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

interface ChildMarker {
  bundlePath: string
  pid: number
  reportProgress?: boolean
  requestId: string
  stagingRoot: string
  wireBytes: number
  wireKeys: string[]
  wireType: string
}

interface Observation {
  alphaHashes: string[]
  bundle: {
    layout: string
    negativePooledSourceId: string
    positivePooledSourceId: string
    recipe: {
      bbox: CurrentCanvasRegionalRecipe['bbox']
      documentId: string
      documentRevision: string
      globalPrompts: CurrentCanvasRegionalRecipe['globalPrompts']
      item: CurrentCanvasRegionalRecipe['item']
      regions: { positive: { text: string }; regionId: string }[]
    }
    request: RegionalWorkerInput['request']
    schemaVersion: number
  }
  sourceAbsent: boolean
  targetSha256: string
}

interface Fixture {
  client: GenerationWorkerClient
  gate: string
  globalAlpha: Uint8Array
  input: RegionalWorkerInput
  marker: string
  observation: string
  regionAlpha: Uint8Array
  restart: () => Promise<GenerationWorkerClient>
  rgb: Buffer
  scratch: string
  sourceStage: string
  termObservation: string
}

/** Literal PNGs and a real OS child with a fake native peer: these tests prove IPC, not ML. */
function png(width: number, height: number, rgb: boolean, profile: Buffer): Buffer {
  const chunk = (name: string, data: Buffer): Buffer => {
    const bytes = Buffer.alloc(data.length + 12)
    bytes.writeUInt32BE(data.length)
    bytes.write(name, 4)
    data.copy(bytes, 8)
    bytes.writeUInt32BE(crc32(bytes.subarray(4, -4)), bytes.length - 4)
    return bytes
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = rgb ? 2 : 6
  const channels = rgb ? 3 : 4
  const stride = width * channels
  const rows = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      rows.set(rgb ? [32, 64, 96] : [17, 59, 133, 0], y * (stride + 1) + 1 + x * channels)
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('iCCP', Buffer.concat([Buffer.from('srgb\0\0'), deflateSync(profile)])),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

async function record<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T
}

async function waitForRecord<T>(file: string): Promise<T> {
  for (let attempt = 0; attempt < 1000; attempt++) {
    try {
      return await record<T>(file)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
      await delay(5)
    }
  }
  assert.fail(`The child did not publish its observation: ${path.basename(file)}`)
}

async function withClient(
  mode: string,
  run: (fixture: Fixture) => Promise<void>,
  requestTimeoutMs = 2000,
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-regional-client-'))
  let client: GenerationWorkerClient | undefined
  try {
    const runtime = path.join(root, 'runtime')
    const scratch = path.join(root, 'scratch')
    const sourceStage = path.join(scratch, 'source-lease')
    await mkdir(runtime)
    await mkdir(sourceStage, { mode: 0o700, recursive: true })
    const profile = await readFile(
      new URL('../../../worker-python/src/imagegen_worker/srgb.icc', import.meta.url),
    )
    assert.equal(sha(profile), IGS_SRGB_ICC_SHA256)
    const target = png(64, 64, false, profile)
    const rgb = png(64, 64, true, profile)
    const checkpoint = path.join(root, 'checkpoint.safetensors')
    const targetPath = path.join(sourceStage, 'target.png')
    await writeFile(checkpoint, 'explicit fake native checkpoint')
    await writeFile(targetPath, target)
    const bbox = { height: 64, width: 64, x: -13, y: 5 }
    const documentId = randomUUID()
    const documentRevision = randomUUID()
    const regionId = randomUUID()
    const seed = 0xff_ff_ff_ff
    const prompts = { negative: 'global negative', positive: 'global positive' }
    const prompt = (text: string) => ({ embeddingRefs: [], text })
    const regionAlpha = Uint8Array.from({ length: 64 * 64 }, (_, i) => [0, 127, 128, 255][i % 4])
    const globalAlpha = Uint8Array.from({ length: 8 * 8 }, (_, i) => [255, 128, 127, 0][i % 4])
    const input: RegionalWorkerInput = {
      globalNegativeCoverage: { kind: 'everywhere' },
      globalPositiveCoverage: { alpha: globalAlpha, height: 8, kind: 'alpha8', width: 8 },
      layout: 'cfg-negative-first',
      negativePooledSourceId: 'current-canvas',
      positivePooledSourceId: regionId,
      recipe: {
        bbox,
        documentId,
        documentRevision,
        family: 'illustrious',
        globalEmbeddings: { negative: [], positive: [] },
        globalPrompts: { negative: prompt(prompts.negative), positive: prompt(prompts.positive) },
        item: { iteration: 0, promptPairIndex: 0, prompts, seed },
        kind: 'current-canvas-regional-recipe',
        regions: [
          {
            coverage: {
              alpha: regionAlpha,
              bounds: { ...bbox },
              intersection: { ...bbox },
              kind: 'covered',
            },
            embeddings: { negative: [], positive: [] },
            maskId: randomUUID(),
            maskRevision: 3,
            negative: { prompt: prompt(prompts.negative), source: 'current-canvas' },
            positive: prompt('regional positive'),
            regionId,
          },
        ],
      },
      request: {
        job: {
          bbox: { ...bbox },
          checkpoint: {
            path: checkpoint,
            predictionType: 'epsilon',
            sha256: sha(Buffer.from('explicit fake native checkpoint')),
          },
          output: {
            pngPath: path.join(sourceStage, 'unused-result.png'),
            stagingRoot: sourceStage,
          },
          prompts: { ...prompts },
          sampling: {
            cfgRescale: 0,
            cfgScale: 5,
            noiseProfile: {
              baseSchedule: 'sdxl-scaled-linear-v1',
              rescaleBetasZeroSnr: false,
              schemaVersion: 1,
              timestepSpacing: 'leading',
            },
            scheduler: 'euler',
            seed,
            steps: 2,
          },
          schemaVersion: 1,
          target: {
            byteSize: target.length,
            height: 64,
            iccSha256: IGS_SRGB_ICC_SHA256,
            path: targetPath,
            sha256: sha(target),
            width: 64,
          },
          vaePrecision: 'FP16',
        },
        protocolVersion: '1',
        requestId: randomUUID(),
        type: 'generate-illustrious-txt2img',
      },
    }
    const marker = path.join(root, 'received.json')
    const observation = path.join(root, 'consumed.json')
    const termObservation = path.join(root, 'term.json')
    const gate = path.join(root, 'read-gate')
    const executable = path.join(runtime, 'python')
    const output =
      mode === 'bad-png'
        ? Buffer.from('not a PNG despite a correlated completion')
        : png(
            mode === 'wrong-dimensions' ? 32 : 64,
            64,
            mode !== 'rgba',
            mode === 'bad-icc' ? Buffer.from('different image profile') : profile,
          )
    const capabilities = [
      ...(process.platform === 'linux' ? ['linux-owned-inference-v1'] : []),
      ...OUTPAINT_READY.capabilities,
      'illustrious-euler',
      'illustrious-noise-profile',
      ...(mode === 'old' ? [] : ['private-current-canvas-regional-v1']),
      ...(mode.startsWith('progress-') && mode !== 'progress-no-capability'
        ? ['illustrious-regional-progress-v1']
        : []),
    ]
    const script = String.raw`#!${process.execPath}
const fs=require('node:fs'),crypto=require('node:crypto'),rl=require('node:readline'),path=require('node:path');
// Explicit protocol substitute: validates the operational argv; this fake does not arm a kernel guard.
const inferenceArgs = process.argv.slice(2)
const inferenceArgsValid = process.platform === 'linux'
  ? inferenceArgs.length === 7 && JSON.stringify(inferenceArgs.slice(0, 6)) === JSON.stringify(['-I', '-m', 'imagegen_worker.owned_inference', '--parent-pid', String(process.ppid), '--scratch-base']) && require('node:path').isAbsolute(inferenceArgs[6]) && require('node:path').resolve(inferenceArgs[6]) === inferenceArgs[6]
  : inferenceArgs.join(' ') === '-I -m imagegen_worker.inference_main'
if (!inferenceArgsValid) process.exit(21)
const mode=${JSON.stringify(mode)},marker=${JSON.stringify(marker)},observation=${JSON.stringify(observation)},gate=${JSON.stringify(gate)},term=${JSON.stringify(termObservation)},originalTarget=${JSON.stringify(targetPath)};
const output=Buffer.from(${JSON.stringify(output.toString('base64'))},'base64');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const writeRecord=(file,value)=>{fs.writeFileSync(file+'.tmp',JSON.stringify(value),{flag:'wx'});fs.renameSync(file+'.tmp',file);};
const expectedAlpha=${JSON.stringify([sha(regionAlpha), sha(globalAlpha)].sort())};
let active=null,previousProgressRequestId=null;
if(mode.startsWith('hang')){
 process.on('SIGTERM',()=>writeRecord(term,{bundleAlive:!!active&&fs.existsSync(active.bundle.path),stageAlive:!!active&&fs.existsSync(active.stagingRoot)}));
 setInterval(()=>{},1000);
}
process.stdout.write(JSON.stringify({type:'ready',protocolVersion:'1',runtimeProfile:'linux-nvidia',workerVersion:'0.14.0',pythonVersion:'3.12.13',capabilities:${JSON.stringify(capabilities)}})+'\n');
function consume(r){
 const bytes=fs.readFileSync(r.bundle.path);
 if(bytes.length!==r.bundle.byteSize||digest(bytes)!==r.bundle.sha256)throw Error('wire bundle snapshot differs');
 const bundle=JSON.parse(bytes),alphaHashes=[];
 function walk(value){
  if(!value||typeof value!=='object')return;
  if(value.$alpha8){const ref=value.$alpha8,alpha=fs.readFileSync(ref.path);if(alpha.length!==ref.byteSize||digest(alpha)!==ref.sha256)throw Error('alpha snapshot differs');if(path.dirname(ref.path)!==r.stagingRoot)throw Error('alpha is not owned');alphaHashes.push(digest(alpha));return;}
  for(const child of Object.values(value))walk(child);
 }
 walk(bundle);
 if(JSON.stringify(alphaHashes.sort())!==JSON.stringify(expectedAlpha))throw Error('caller alpha changed');
 const target=fs.readFileSync(bundle.request.job.target.path);
 if(digest(target)!==${JSON.stringify(sha(target))})throw Error('target snapshot differs');
 if(bundle.request.job.target.path===originalTarget)throw Error('target was not detached');
 writeRecord(observation,{alphaHashes,bundle,sourceAbsent:!fs.existsSync(originalTarget),targetSha256:digest(target)});
 if(mode.startsWith('hang'))return;
 if(mode.startsWith('progress-')){
  if(mode==='progress-no-capability'||mode==='progress-no-callback'){
   if(Object.hasOwn(r,'reportProgress'))throw Error('legacy regional wire was changed');
  }else{
   if(r.reportProgress!==true)throw Error('regional progress was not explicitly requested');
   const progress=(step,totalSteps=2,extra={})=>process.stdout.write(JSON.stringify({type:'generation-progress',protocolVersion:'1',requestId:r.requestId,step,totalSteps,...extra})+'\n');
   if(mode.startsWith('progress-worker-fault-')&&!fs.existsSync(gate)){
    progress(1);
    if(mode==='progress-worker-fault-final')progress(2);
    return;
   }
   if(mode==='progress-wrong-id')progress(1,2,{requestId:crypto.randomUUID()});
   else if(mode==='progress-zero')progress(0);
   else if(mode==='progress-over-total')progress(3);
   else if(mode==='progress-wrong-total')progress(1,1);
   else if(mode==='progress-changed-total'){progress(1);progress(1,1);}
   else if(mode==='progress-extra-field')progress(1,2,{outputPath:'/not-progress'});
   else{
    if(mode==='progress-stale'&&previousProgressRequestId)progress(2,2,{requestId:previousProgressRequestId});
    progress(1);progress(1);progress(2);progress(1);
   }
   if(mode==='progress-held'||mode==='progress-no-done')return;
  }
 }
 fs.writeFileSync(bundle.request.job.output.pngPath,output,{flag:'wx'});
 const response={type:'generation-done',protocolVersion:'1',requestId:r.requestId,outputPath:bundle.request.job.output.pngPath,seed:bundle.request.job.sampling.seed};
 if(mode==='wrong-id')response.requestId='00000000-0000-4000-8000-000000000001';
 if(mode==='wrong-output')response.outputPath=path.join(r.stagingRoot,'other.png');
 if(mode==='wrong-seed')response.seed=(response.seed+1)%4294967296;
 process.stdout.write(JSON.stringify(response)+'\n');
 if(mode==='progress-stale'){
  process.stdout.write(JSON.stringify({type:'generation-progress',protocolVersion:'1',requestId:r.requestId,step:2,totalSteps:2})+'\n');
  previousProgressRequestId=r.requestId;
 }
}
rl.createInterface({input:process.stdin}).on('line',line=>{
 const r=JSON.parse(line);active=r;
 if(r.type!=='execute-current-canvas-regional')throw Error('not the private regional dispatch');
 writeRecord(marker,{bundlePath:r.bundle.path,pid:process.pid,reportProgress:r.reportProgress,requestId:r.requestId,stagingRoot:r.stagingRoot,wireBytes:Buffer.byteLength(line+'\n'),wireKeys:Object.keys(r).sort(),wireType:r.type});
 if(mode==='detached'){
  const poll=setInterval(()=>{if(fs.existsSync(gate)){clearInterval(poll);consume(r);}},5);
 }else consume(r);
});
`
    await writeFile(executable, script)
    await chmod(executable, 0o700)
    const startClient = () =>
      GenerationWorkerClient.start(
        { pythonExecutable: executable, runtimeRoot: runtime, scratchBasePath: scratch },
        { requestTimeoutMs, shutdownWaitMs: 60 },
      )
    client = await startClient()
    await run({
      client,
      gate,
      globalAlpha,
      input,
      marker,
      observation,
      regionAlpha,
      restart: async () => {
        await client?.close()
        client = await startClient()
        return client
      },
      rgb,
      scratch,
      sourceStage,
      termObservation,
    })
  } finally {
    // An unconfirmed exit must retain the fixture; close failure deliberately skips deletion.
    await client?.close()
    await rm(root, { force: true, recursive: true })
  }
}

async function assertStageReleased(marker: ChildMarker): Promise<void> {
  await assert.rejects(lstat(marker.stagingRoot), { code: 'ENOENT' })
}

test('private regional transport consumes detached bundle and alpha after the original source lease ends', async () => {
  await withClient('detached', async (f) => {
    const before = structuredClone(f.input)
    const pending = f.client.executeCurrentCanvasRegional(f.input)
    void pending.catch(() => undefined)
    const marker = await waitForRecord<ChildMarker>(f.marker)
    assert.equal(marker.wireType, 'execute-current-canvas-regional')
    assert.deepEqual(marker.wireKeys, [
      'bundle',
      'protocolVersion',
      'requestId',
      'stagingRoot',
      'type',
    ])
    assert.ok(marker.wireBytes <= 64 * 1024)
    assert.notEqual(marker.stagingRoot, f.sourceStage)
    await rm(f.sourceStage, { recursive: true })
    f.regionAlpha.fill(17)
    f.globalAlpha.fill(18)
    f.input.recipe.globalPrompts.positive.text = 'later caller prompt'
    f.input.recipe.regions[0].positive!.text = 'later regional prompt'
    f.input.request.job.sampling.seed = 19
    await writeFile(f.gate, 'capture has ended')
    const result = await pending
    const seen = await record<Observation>(f.observation)
    assert.equal(seen.sourceAbsent, true)
    assert.equal(before.globalPositiveCoverage.kind, 'alpha8')
    assert.deepEqual(
      seen.alphaHashes,
      [
        sha(before.recipe.regions[0].coverage.alpha),
        sha(before.globalPositiveCoverage.alpha),
      ].sort(),
    )
    assert.equal(seen.bundle.schemaVersion, 1)
    assert.deepEqual(seen.bundle.recipe.bbox, before.recipe.bbox)
    assert.equal(seen.bundle.recipe.documentId, before.recipe.documentId)
    assert.equal(seen.bundle.recipe.documentRevision, before.recipe.documentRevision)
    assert.deepEqual(seen.bundle.recipe.item, before.recipe.item)
    assert.deepEqual(seen.bundle.recipe.globalPrompts, before.recipe.globalPrompts)
    assert.equal(seen.bundle.recipe.regions[0].positive.text, 'regional positive')
    assert.equal(seen.bundle.negativePooledSourceId, before.negativePooledSourceId)
    assert.equal(seen.bundle.positivePooledSourceId, before.positivePooledSourceId)
    assert.equal(seen.bundle.layout, before.layout)
    assert.equal(seen.bundle.request.type, 'generate-illustrious-txt2img')
    assert.equal(result.seed, before.request.job.sampling.seed)
    assert.deepEqual(result.pngBytes, f.rgb)
    assert.deepEqual(result.output, {
      byteSize: f.rgb.length,
      colorSpace: 'srgb',
      height: 64,
      iccSha256: IGS_SRGB_ICC_SHA256,
      path: seen.bundle.request.job.output.pngPath,
      sha256: sha(f.rgb),
      width: 64,
    })
    await assertStageReleased(marker)
    await assert.rejects(lstat(result.output.path), { code: 'ENOENT' })
    assert.deepEqual(await readdir(f.scratch), [])
  })
})

test('regional output bytes and metadata remain owned after private-stage cleanup without changing the public request union', async () => {
  const privateTypeIsPublic: 'execute-current-canvas-regional' extends GenerationWorkerRequest['type']
    ? true
    : false = false
  assert.equal(privateTypeIsPublic, false)
  await withClient('done', async (f) => {
    const before = structuredClone(f.input)
    const result = await f.client.executeCurrentCanvasRegional(f.input)
    assert.deepEqual(f.input, before)
    assert.equal(result.seed, 0xff_ff_ff_ff)
    assert.deepEqual(result.pngBytes, f.rgb)
    assert.equal(result.output.sha256, sha(result.pngBytes))
    assert.equal(result.output.iccSha256, IGS_SRGB_ICC_SHA256)
    await assertStageReleased(await record<ChildMarker>(f.marker))
    assert.deepEqual(await readdir(f.scratch), ['source-lease'])
    assert.ok(await readFile(f.input.request.job.target.path))
  })
})

test('an older private peer refuses regional work before creating an owned stage or writing JSONL', async () => {
  await withClient('old', async (f) => {
    const before = await readdir(f.scratch)
    await assert.rejects(f.client.executeCurrentCanvasRegional(f.input), {
      code: 'WORKER_VERSION_MISMATCH',
    })
    await assert.rejects(readFile(f.marker), { code: 'ENOENT' })
    assert.deepEqual(await readdir(f.scratch), before)
  })
})

for (const mode of ['wrong-id', 'wrong-output', 'wrong-seed']) {
  test(`regional JSONL rejects ${mode} despite a real RGB output and confirms exit before cleanup`, async () => {
    await withClient(mode, async (f) => {
      await assert.rejects(f.client.executeCurrentCanvasRegional(f.input), {
        code: mode === 'wrong-seed' ? 'OUTPUT_MISMATCH' : 'PROTOCOL_ERROR',
      })
      const marker = await record<ChildMarker>(f.marker)
      assert.throws(() => process.kill(marker.pid, 0), { code: 'ESRCH' })
      await assertStageReleased(marker)
      assert.equal(
        (await record<Observation>(f.observation)).bundle.request.type,
        'generate-illustrious-txt2img',
      )
      assert.ok(await readFile(f.input.request.job.target.path))
    })
  })
}

for (const mode of ['bad-png', 'bad-icc', 'wrong-dimensions', 'rgba']) {
  test(`regional completion cannot certify ${mode} by naming the expected output path`, async () => {
    await withClient(mode, async (f) => {
      await assert.rejects(f.client.executeCurrentCanvasRegional(f.input), {
        code: 'OUTPUT_MISMATCH',
      })
      const marker = await record<ChildMarker>(f.marker)
      assert.throws(() => process.kill(marker.pid, 0), { code: 'ESRCH' })
      await assertStageReleased(marker)
      assert.ok(await readFile(f.input.request.job.target.path))
    })
  })
}

test('a held regional call owns the single request slot and close waits for resistant child exit', async () => {
  await withClient('hang-close', async (f) => {
    const pending = f.client.executeCurrentCanvasRegional(f.input)
    void pending.catch(() => undefined)
    const marker = await waitForRecord<ChildMarker>(f.marker)
    await waitForRecord<Observation>(f.observation)
    await assert.rejects(f.client.executeCurrentCanvasRegional(f.input), { code: 'BUSY' })
    assert.ok(await readFile(marker.bundlePath))
    const closing = f.client.close()
    await assert.rejects(pending, { code: 'CLOSED' })
    await closing
    assert.deepEqual(await record(f.termObservation), { bundleAlive: true, stageAlive: true })
    assert.throws(() => process.kill(marker.pid, 0), { code: 'ESRCH' })
    await assertStageReleased(marker)
    assert.ok(await readFile(f.input.request.job.target.path))
  })
})

test('regional timeout keeps the input bundle until SIGKILL confirms physical exit', async () => {
  await withClient(
    'hang-timeout',
    async (f) => {
      await assert.rejects(f.client.executeCurrentCanvasRegional(f.input), {
        code: 'REQUEST_TIMEOUT',
      })
      const marker = await record<ChildMarker>(f.marker)
      assert.deepEqual(await record(f.termObservation), { bundleAlive: true, stageAlive: true })
      assert.throws(() => process.kill(marker.pid, 0), { code: 'ESRCH' })
      await assertStageReleased(marker)
      assert.deepEqual(await readdir(f.scratch), ['source-lease'])
    },
    150,
  )
})

test('unconfirmed regional exit retains the owned stage until an explicit close retry observes exit', async () => {
  await withClient(
    'hang-unconfirmed',
    async (f) => {
      const child = (f.client as unknown as { child: ChildProcessWithoutNullStreams }).child
      const actualKill = child.kill.bind(child)
      child.kill = () => true
      try {
        await assert.rejects(f.client.executeCurrentCanvasRegional(f.input), {
          code: 'WORKER_EXIT_UNCONFIRMED',
        })
        const marker = await record<ChildMarker>(f.marker)
        assert.ok(await readFile(marker.bundlePath))
        assert.ok(await lstat(marker.stagingRoot))
        await assert.rejects(f.client.executeCurrentCanvasRegional(f.input), { code: 'CLOSED' })
      } finally {
        child.kill = actualKill
        await f.client.close()
      }
      const marker = await record<ChildMarker>(f.marker)
      assert.throws(() => process.kill(marker.pid, 0), { code: 'ESRCH' })
      await assertStageReleased(marker)
      assert.ok(await readFile(f.input.request.job.target.path))
    },
    150,
  )
})

test('a fresh regional client succeeds after a prior peer failed actual PNG verification', async () => {
  await withClient('bad-png', async (f) => {
    await assert.rejects(f.client.executeCurrentCanvasRegional(f.input), {
      code: 'OUTPUT_MISMATCH',
    })
    await assertStageReleased(await record<ChildMarker>(f.marker))
  })
  await withClient('done', async (f) => {
    const result = await f.client.executeCurrentCanvasRegional(f.input)
    assert.deepEqual(result.pngBytes, f.rgb)
    assert.equal(result.seed, f.input.request.job.sampling.seed)
    await assertStageReleased(await record<ChildMarker>(f.marker))
  })
})

test('qualified regional progress opts in only on the local JSONL header and preserves native completion ownership', async () => {
  await withClient('progress-done', async (f) => {
    const before = structuredClone(f.input)
    const seen: GenerationDenoisingProgress[] = []
    const result = await f.client.executeCurrentCanvasRegional(f.input, (progress) => {
      assert.equal(Object.isFrozen(progress), true)
      seen.push(progress)
      throw new Error('A presentation subscriber cannot reject valid regional completion.')
    })
    assert.deepEqual(seen, [
      { step: 1, totalSteps: 2 },
      { step: 2, totalSteps: 2 },
    ])
    assert.deepEqual(f.input, before)
    const marker = await record<ChildMarker>(f.marker)
    assert.equal(marker.reportProgress, true)
    assert.equal(marker.requestId, before.request.requestId)
    assert.deepEqual(marker.wireKeys, [
      'bundle',
      'protocolVersion',
      'reportProgress',
      'requestId',
      'stagingRoot',
      'type',
    ])
    const consumed = await record<Observation>(f.observation)
    assert.equal(Object.hasOwn(consumed.bundle, 'reportProgress'), false)
    assert.equal(Object.hasOwn(consumed.bundle.request, 'reportProgress'), false)
    assert.deepEqual(result.pngBytes, f.rgb)
    assert.equal(result.seed, before.request.job.sampling.seed)
    await assertStageReleased(marker)
  })
})

for (const mode of ['progress-no-capability', 'progress-no-callback']) {
  test(`${mode} retains the exact legacy regional header and emits no telemetry`, async () => {
    await withClient(mode, async (f) => {
      const seen: GenerationDenoisingProgress[] = []
      const result = await f.client.executeCurrentCanvasRegional(
        f.input,
        mode === 'progress-no-callback' ? undefined : (progress) => seen.push(progress),
      )
      const marker = await record<ChildMarker>(f.marker)
      assert.equal(Object.hasOwn(marker, 'reportProgress'), false)
      assert.deepEqual(marker.wireKeys, [
        'bundle',
        'protocolVersion',
        'requestId',
        'stagingRoot',
        'type',
      ])
      assert.deepEqual(seen, [])
      assert.deepEqual(result.pngBytes, f.rgb)
      await assertStageReleased(marker)
    })
  })
}

test('settled regional progress cannot cross into a second active request or move its counter backwards', async () => {
  await withClient('progress-stale', async (f) => {
    const first: GenerationDenoisingProgress[] = []
    const second: GenerationDenoisingProgress[] = []
    const firstResult = await f.client.executeCurrentCanvasRegional(f.input, (progress) =>
      first.push(progress),
    )
    const next = structuredClone(f.input)
    next.request.requestId = randomUUID()
    const secondResult = await f.client.executeCurrentCanvasRegional(next, (progress) =>
      second.push(progress),
    )
    const expected = [
      { step: 1, totalSteps: 2 },
      { step: 2, totalSteps: 2 },
    ]
    assert.deepEqual(first, expected)
    assert.deepEqual(second, expected)
    assert.deepEqual(firstResult.pngBytes, f.rgb)
    assert.deepEqual(secondResult.pngBytes, f.rgb)
    assert.equal((await record<ChildMarker>(f.marker)).requestId, next.request.requestId)
    await assertStageReleased(await record<ChildMarker>(f.marker))
  })
})

for (const mode of [
  'progress-wrong-id',
  'progress-zero',
  'progress-over-total',
  'progress-wrong-total',
  'progress-changed-total',
  'progress-extra-field',
]) {
  test(`regional opted-in JSONL rejects ${mode} through the actual exchange`, async () => {
    await withClient(mode, async (f) => {
      const seen: GenerationDenoisingProgress[] = []
      await assert.rejects(
        f.client.executeCurrentCanvasRegional(f.input, (progress) => seen.push(progress)),
        { code: 'PROTOCOL_ERROR' },
      )
      assert.deepEqual(seen, mode === 'progress-changed-total' ? [{ step: 1, totalSteps: 2 }] : [])
      const marker = await record<ChildMarker>(f.marker)
      assert.equal(marker.reportProgress, true)
      assert.throws(() => process.kill(marker.pid, 0), { code: 'ESRCH' })
      await assertStageReleased(marker)
      assert.ok(await readFile(f.input.request.job.target.path))
    })
  })
}

test('regional N/N progress retains the request slot until completion or confirmed close', async () => {
  await withClient('progress-held', async (f) => {
    let atLastStep!: () => void
    const lastStep = new Promise<void>((resolve) => {
      atLastStep = resolve
    })
    let settled = false
    const pending = f.client.executeCurrentCanvasRegional(f.input, (progress) => {
      if (progress.step === progress.totalSteps) {
        atLastStep()
      }
    })
    void pending.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      },
    )
    await Promise.race([
      lastStep,
      pending.then(() => assert.fail('Progress must precede any regional completion.')),
    ])
    const marker = await record<ChildMarker>(f.marker)
    assert.equal(settled, false)
    assert.ok(await readFile(marker.bundlePath))
    await assert.rejects(
      f.client.executeCurrentCanvasRegional(f.input, () => {}),
      {
        code: 'BUSY',
      },
    )
    await assert.rejects(
      lstat((await record<Observation>(f.observation)).bundle.request.job.output.pngPath),
      {
        code: 'ENOENT',
      },
    )
    const closing = f.client.close()
    await assert.rejects(pending, { code: 'CLOSED' })
    await closing
    assert.throws(() => process.kill(marker.pid, 0), { code: 'ESRCH' })
    await assertStageReleased(marker)
  })
})

test('regional N/N without a terminal response still reaches the original request deadline', async () => {
  await withClient(
    'progress-no-done',
    async (f) => {
      const seen: GenerationDenoisingProgress[] = []
      await assert.rejects(
        f.client.executeCurrentCanvasRegional(f.input, (progress) => seen.push(progress)),
        { code: 'REQUEST_TIMEOUT' },
      )
      assert.deepEqual(seen, [
        { step: 1, totalSteps: 2 },
        { step: 2, totalSteps: 2 },
      ])
      const marker = await record<ChildMarker>(f.marker)
      assert.throws(() => process.kill(marker.pid, 0), { code: 'ESRCH' })
      await assertStageReleased(marker)
    },
    150,
  )
})

// A genuine OS child is killed; only its ML computation is a declared protocol substitute.
// Native installed qualification separately establishes the trained-worker consumer boundary.
for (const step of [1, 2]) {
  test(`regional worker SIGKILL after ${step}/2 clears the real exchange and a fresh client keeps the frozen input`, async () => {
    await withClient(
      step === 1 ? 'progress-worker-fault-intermediate' : 'progress-worker-fault-final',
      async (f) => {
        const before = structuredClone(f.input)
        const child = (f.client as unknown as { child: ChildProcessWithoutNullStreams }).child
        const seen: GenerationDenoisingProgress[] = []
        let reached!: () => void
        const atProgress = new Promise<void>((resolve) => {
          reached = resolve
        })
        const pending = f.client.executeCurrentCanvasRegional(f.input, (progress) => {
          seen.push(progress)
          if (progress.step === step) {
            reached()
          }
        })
        void pending.catch(() => undefined)
        await Promise.race([
          atProgress,
          pending.then(() => assert.fail('Completed-step evidence must precede worker death.')),
        ])
        const marker = await record<ChildMarker>(f.marker)
        const first = await record<Observation>(f.observation)
        assert.equal(marker.pid, child.pid)
        assert.equal(marker.requestId, before.request.requestId)
        assert.equal(marker.reportProgress, true)
        assert.equal(child.exitCode, null)
        assert.equal(child.signalCode, null)
        assert.ok(await readFile(marker.bundlePath))
        await assert.rejects(lstat(first.bundle.request.job.output.pngPath), { code: 'ENOENT' })
        const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
          (resolve) => child.once('close', (code, signal) => resolve({ code, signal })),
        )
        assert.equal(child.kill('SIGKILL'), true)
        await assert.rejects(pending, { code: 'WORKER_EXITED' })
        assert.deepEqual(await closed, { code: null, signal: 'SIGKILL' })
        assert.throws(() => process.kill(marker.pid, 0), { code: 'ESRCH' })
        await assertStageReleased(marker)
        assert.deepEqual(
          seen,
          Array.from({ length: step }, (_, index) => ({ step: index + 1, totalSteps: 2 })),
        )
        assert.deepEqual(f.input, before)
        assert.ok(await readFile(before.request.job.target.path))
        await assert.rejects(f.client.executeCurrentCanvasRegional(f.input), { code: 'CLOSED' })

        // Release only the fake peer's fault condition; transport/PNG consumers remain original.
        await writeFile(f.gate, 'explicit healthy peer after confirmed physical exit')
        const recovered = await f.restart()
        const next = structuredClone(before)
        next.request.requestId = randomUUID()
        assert.notEqual(next.request.requestId, marker.requestId)
        const nextProgress: GenerationDenoisingProgress[] = []
        const done = await recovered.executeCurrentCanvasRegional(next, (progress) =>
          nextProgress.push(progress),
        )
        const second = await record<Observation>(f.observation)
        const fresh = await record<ChildMarker>(f.marker)
        assert.notEqual(fresh.pid, marker.pid)
        assert.equal(fresh.requestId, next.request.requestId)
        const recipeForLease = (
          recipe: Observation['bundle']['recipe'],
          stagingRoot: string,
        ): unknown =>
          JSON.parse(
            JSON.stringify(recipe, (key, value: unknown) =>
              key === 'path' && typeof value === 'string' && path.dirname(value) === stagingRoot
                ? `$lease/${path.basename(value)}`
                : value,
            ),
          )
        assert.notEqual(fresh.stagingRoot, marker.stagingRoot)
        assert.deepEqual(
          recipeForLease(second.bundle.recipe, fresh.stagingRoot),
          recipeForLease(first.bundle.recipe, marker.stagingRoot),
        )
        assert.deepEqual(second.bundle.request.job.sampling, first.bundle.request.job.sampling)
        assert.deepEqual(second.alphaHashes, first.alphaHashes)
        assert.equal(second.targetSha256, first.targetSha256)
        assert.deepEqual(nextProgress, [
          { step: 1, totalSteps: 2 },
          { step: 2, totalSteps: 2 },
        ])
        assert.deepEqual(
          seen,
          Array.from({ length: step }, (_, index) => ({ step: index + 1, totalSteps: 2 })),
        )
        assert.deepEqual(done.pngBytes, f.rgb)
        assert.equal(done.seed, before.request.job.sampling.seed)
        await assertStageReleased(fresh)
      },
    )
  })
}
