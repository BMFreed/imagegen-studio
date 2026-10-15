import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { crc32, deflateSync } from 'node:zlib'

import type { SmartPatchExecutionRequest } from './smart-patch-execution-request.js'

import { GenerationWorkerClient } from './generation-worker-client.js'
import { OUTPAINT_READY } from './test-fixtures/outpaint-ready.js'

const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

/** Literal input fixtures only; the child is explicitly a protocol/exit collaborator, not ML. */
function png(width: number, height: number, rgb: boolean, profile: Buffer): Buffer {
  const chunk = (name: string, data: Buffer): Buffer => {
    const out = Buffer.alloc(data.length + 12)
    out.writeUInt32BE(data.length)
    out.write(name, 4)
    data.copy(out, 8)
    out.writeUInt32BE(crc32(out.subarray(4, -4)), out.length - 4)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = rgb ? 2 : 6
  const stride = width * (rgb ? 3 : 4)
  const rows = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * (stride + 1) + 1 + x * (rgb ? 3 : 4)
      rows.set(rgb ? [32, 64, 96] : [255, 255, 255, 0], at)
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    ...(rgb ? [chunk('iCCP', Buffer.concat([Buffer.from('srgb\0\0'), deflateSync(profile)]))] : []),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

async function withClient(
  mode: string,
  run: (
    client: GenerationWorkerClient,
    request: SmartPatchExecutionRequest,
    marker: string,
  ) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-patch-client-'))
  let client: GenerationWorkerClient | undefined
  try {
    const runtime = path.join(root, 'runtime')
    const scratch = path.join(root, 'scratch')
    const stage = path.join(scratch, 'stage')
    await mkdir(runtime)
    await mkdir(stage, { mode: 0o700, recursive: true })
    const profile = await readFile(
      new URL('../../../worker-python/src/imagegen_worker/srgb.icc', import.meta.url),
    )
    assert.equal(sha(profile), IGS_SRGB_ICC_SHA256)
    const keep = png(8, 8, false, profile)
    const rgb = png(64, 64, true, profile)
    const checkpoint = path.join(root, 'checkpoint.bin')
    const rgbPath = path.join(stage, 'source.png')
    const keepPath = path.join(stage, 'keep.png')
    await writeFile(checkpoint, 'declared fake native checkpoint')
    await writeFile(rgbPath, rgb)
    await writeFile(keepPath, keep)
    const marker = path.join(root, 'marker')
    const executable = path.join(runtime, 'python')
    const capabilities = [
      ...OUTPAINT_READY.capabilities,
      'illustrious-euler',
      'illustrious-noise-profile',
      ...(mode === 'old' ? [] : ['smart-patch-execution']),
    ]
    const script = String.raw`#!${process.execPath}
const fs=require('node:fs'),crypto=require('node:crypto'),rl=require('node:readline');
if(process.argv.slice(2).join(' ')!=='-I -m imagegen_worker.inference_main')process.exit(31);
const mode=${JSON.stringify(mode)},marker=${JSON.stringify(marker)},rgb=Buffer.from(${JSON.stringify(rgb.toString('base64'))},'base64');
if(mode==='hang'){process.on('SIGTERM',()=>{});setInterval(()=>{},1000);}
process.stdout.write(JSON.stringify({type:'ready',protocolVersion:'1',runtimeProfile:'linux-nvidia',workerVersion:'0.14.0',pythonVersion:'3.12.13',capabilities:${JSON.stringify(capabilities)}})+'\n');
rl.createInterface({input:process.stdin}).on('line',line=>{
 const r=JSON.parse(line);fs.writeFileSync(marker,String(process.pid));
 if(mode==='hang')return;
 fs.writeFileSync(r.output.pngPath,rgb,{flag:'wx'});
 const output={byteSize:rgb.length,colorSpace:'srgb',width:64,height:64,sha256:crypto.createHash('sha256').update(rgb).digest('hex')};
 if(mode==='bad-hash')output.sha256='0'.repeat(64);
 process.stdout.write(JSON.stringify({type:'smart-patch-executed',protocolVersion:'1',requestId:r.requestId,output})+'\n');
});
`
    await writeFile(executable, script)
    await chmod(executable, 0o700)
    client = await GenerationWorkerClient.start(
      { pythonExecutable: executable, runtimeRoot: runtime, scratchBasePath: scratch },
      { requestTimeoutMs: 150, shutdownWaitMs: 40 },
    )
    const request: SmartPatchExecutionRequest = {
      family: 'illustrious',
      inference: {
        checkpoint: {
          path: checkpoint,
          predictionType: 'epsilon',
          sha256: sha(Buffer.from('declared fake native checkpoint')),
        },
        prompts: { negative: 'blur', positive: 'portrait' },
        sampling: { cfgScale: 5, denoisingStrength: 0.75, scheduler: 'euler', seed: 0, steps: 3 },
      },
      internalResolution: { height: 64, width: 64 },
      latentKeepMask: {
        byteSize: keep.length,
        height: 8,
        path: keepPath,
        sha256: sha(keep),
        width: 8,
      },
      mode: 'img2img',
      modelSource: { byteSize: rgb.length, height: 64, path: rgbPath, sha256: sha(rgb), width: 64 },
      output: { pngPath: path.join(stage, 'result.png'), stagingRoot: stage },
      protocolVersion: '1',
      requestId: randomUUID(),
      schemaVersion: 1,
      type: 'execute-smart-patch',
    }
    await run(client, request, marker)
  } finally {
    // Confirm physical exit first. An unconfirmed close deliberately retains this fixture.
    await client?.close()
    await rm(root, { force: true, recursive: true })
  }
}

test('private Smart Patch client requires its explicit capability before writing to a child', async () => {
  await withClient('old', async (client, request, marker) => {
    await assert.rejects(client.executeSmartPatch(request), { code: 'WORKER_VERSION_MISMATCH' })
    await assert.rejects(readFile(marker), { code: 'ENOENT' })
  })
})

test('private Smart Patch client consumes actual RGB metadata without a generation-done response', async () => {
  await withClient('done', async (client, request) => {
    // The shared scratch root follows the existing application mkdir contract;
    // only its operation directory must be private (real captures use mkdtemp).
    await chmod(path.dirname(request.output.stagingRoot), 0o775)
    const result = await client.executeSmartPatch(request)
    assert.equal(result.output.path, request.output.pngPath)
    assert.equal(result.output.sha256, sha(await readFile(request.output.pngPath)))
    assert.equal(result.output.iccSha256, IGS_SRGB_ICC_SHA256)
  })
})

test('private Smart Patch client refuses a writable operation directory before sending any work', async () => {
  await withClient('done', async (client, request, marker) => {
    await chmod(request.output.stagingRoot, 0o775)
    await assert.rejects(client.executeSmartPatch(request), { code: 'INVALID_PATH' })
    await assert.rejects(readFile(marker), { code: 'ENOENT' })
  })
})

test('private Smart Patch client rejects corrupted output and confirms child exit before settling', async () => {
  await withClient('bad-hash', async (client, request, marker) => {
    await assert.rejects(client.executeSmartPatch(request), { code: 'OUTPUT_MISMATCH' })
    const pid = Number(await readFile(marker, 'utf8'))
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
  })
})

test('private Smart Patch timeout confirms SIGKILL exit before the input lease may clean up', async () => {
  await withClient('hang', async (client, request, marker) => {
    await assert.rejects(client.executeSmartPatch(request), { code: 'REQUEST_TIMEOUT' })
    const pid = Number(await readFile(marker, 'utf8'))
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
    assert.ok(await readFile(request.latentKeepMask.path))
  })
})
