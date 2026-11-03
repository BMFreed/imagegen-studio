import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'

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
let active=null;
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
 fs.writeFileSync(bundle.request.job.output.pngPath,output,{flag:'wx'});
 const response={type:'generation-done',protocolVersion:'1',requestId:r.requestId,outputPath:bundle.request.job.output.pngPath,seed:bundle.request.job.sampling.seed};
 if(mode==='wrong-id')response.requestId='00000000-0000-4000-8000-000000000001';
 if(mode==='wrong-output')response.outputPath=path.join(r.stagingRoot,'other.png');
 if(mode==='wrong-seed')response.seed=(response.seed+1)%4294967296;
 process.stdout.write(JSON.stringify(response)+'\n');
}
rl.createInterface({input:process.stdin}).on('line',line=>{
 const r=JSON.parse(line);active=r;
 if(r.type!=='execute-current-canvas-regional')throw Error('not the private regional dispatch');
 writeRecord(marker,{bundlePath:r.bundle.path,pid:process.pid,stagingRoot:r.stagingRoot,wireBytes:Buffer.byteLength(line+'\n'),wireKeys:Object.keys(r).sort(),wireType:r.type});
 if(mode==='detached'){
  const poll=setInterval(()=>{if(fs.existsSync(gate)){clearInterval(poll);consume(r);}},5);
 }else consume(r);
});
`
    await writeFile(executable, script)
    await chmod(executable, 0o700)
    client = await GenerationWorkerClient.start(
      { pythonExecutable: executable, runtimeRoot: runtime, scratchBasePath: scratch },
      { requestTimeoutMs, shutdownWaitMs: 60 },
    )
    await run({
      client,
      gate,
      globalAlpha,
      input,
      marker,
      observation,
      regionAlpha,
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
