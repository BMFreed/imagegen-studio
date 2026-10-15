import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { crc32, deflateSync } from 'node:zlib'

import type { SmartPatchOutputCompositionInput } from './worker-client.js'

import { decodeTargetPngAlpha } from './target-png-mode.js'
import { ProjectWorkerClient } from './worker-client.js'

const root = path.resolve(import.meta.dirname, '../../..')
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const alphas = [0, 1, 64, 128, 254, 255]

/** Literal PNG fixture encoder only; no resizing or production compositor lives here. */
function fixturePng(
  width: number,
  height: number,
  channels: 3 | 4,
  profile?: Buffer,
  coverage: readonly number[] = alphas,
): Buffer {
  const chunk = (tag: string, data: Buffer): Buffer => {
    const bytes = Buffer.alloc(data.length + 12)
    bytes.writeUInt32BE(data.length)
    bytes.write(tag, 4)
    data.copy(bytes, 8)
    bytes.writeUInt32BE(crc32(bytes.subarray(4, -4)), bytes.length - 4)
    return bytes
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = channels === 3 ? 2 : 6
  const rows = Buffer.alloc(height * (width * channels + 1))
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      rows.set(
        channels === 3
          ? [32, 64, 96]
          : [255, 255, 255, coverage[(y * width + x) % coverage.length]],
        y * (width * channels + 1) + 1 + x * channels,
      )
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    ...(profile
      ? [chunk('iCCP', Buffer.concat([Buffer.from('srgb\0\0'), deflateSync(profile)]))]
      : []),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

async function withClient(
  mode: 'actual' | 'hang' | 'old' | 'wrong-alpha',
  use: (
    client: ProjectWorkerClient,
    request: SmartPatchOutputCompositionInput,
    marker: string,
  ) => Promise<void>,
) {
  const directory = await mkdtemp(path.join(tmpdir(), 'igs-world-client-'))
  let client: ProjectWorkerClient | undefined
  try {
    const runtime = path.join(directory, 'runtime')
    const scratch = path.join(directory, 'scratch')
    const stage = path.join(scratch, 'operation')
    await mkdir(runtime)
    await mkdir(stage, { mode: 0o700, recursive: true })
    const profile = await readFile(path.join(root, 'worker-python/src/imagegen_worker/srgb.icc'))
    assert.equal(digest(profile), IGS_SRGB_ICC_SHA256)
    const image = fixturePng(8, 8, 3, profile)
    const mask = fixturePng(7, 5, 4)
    const reference = async (name: string, bytes: Buffer, width: number, height: number) => {
      const file = path.join(stage, name)
      await writeFile(file, bytes)
      return { byteSize: bytes.length, height, path: file, sha256: digest(bytes), width }
    }
    const request: SmartPatchOutputCompositionInput = {
      contributionMask: await reference('mask.png', mask, 7, 5),
      image: await reference('image.png', image, 8, 8),
      pngPath: path.join(stage, 'world.png'),
      stagingRoot: stage,
    }
    const marker = path.join(directory, 'request-pid')
    const executable = path.join(runtime, 'python')
    // The actual case bootstraps the checkout's real CPU JSONL entrypoint. This
    // is not an installed-runtime test. Other modes are declared protocol peers.
    const script =
      mode === 'actual'
        ? `#!${path.join(root, 'worker-python/.venv/bin/python')}
import sys
assert sys.argv[1:] == ['-I', '-m', 'imagegen_worker']
sys.path.insert(0, ${JSON.stringify(path.join(root, 'worker-python/src'))})
from imagegen_worker.__main__ import main
raise SystemExit(main())
`
        : String.raw`#!${process.execPath}
const fs=require('node:fs'),crypto=require('node:crypto'),readline=require('node:readline');
if(process.argv.slice(2).join(' ')!=='-I -m imagegen_worker')process.exit(31);
const mode=${JSON.stringify(mode)},marker=${JSON.stringify(marker)};
if(mode==='hang'){process.on('SIGTERM',()=>{});setInterval(()=>{},1000);}
process.stdout.write(JSON.stringify({type:'ready',protocolVersion:'1',runtimeProfile:'derivatives-only',workerVersion:'0.1.0',pythonVersion:'3.12.13',capabilities:['image-derivatives','import-normalization','self-test',...(mode==='old'?[]:['smart-patch-output-composition'])]})+'\n');
readline.createInterface({input:process.stdin}).on('line',line=>{
 const r=JSON.parse(line);fs.writeFileSync(marker,String(process.pid));if(mode==='hang')return;
 const bytes=Buffer.from(${JSON.stringify(fixturePng(7, 5, 4, profile).toString('base64'))},'base64');
 // Truthful file metadata, but deliberately false alpha. The inverse input's
 // first alpha is255; the protocol peer publishes the original plane starting0.
 fs.writeFileSync(r.output.pngPath,bytes,{flag:'wx'});
 process.stdout.write(JSON.stringify({type:'smart-patch-output-composed',protocolVersion:'1',requestId:r.requestId,output:{byteSize:bytes.length,colorSpace:'srgb',width:7,height:5,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}})+'\n');
});
`
    await writeFile(executable, script)
    await chmod(executable, 0o700)
    client = await ProjectWorkerClient.start(
      { pythonExecutable: executable, runtimeRoot: runtime, stagingBasePath: scratch },
      { requestTimeoutMs: 1000, shutdownWaitMs: 40 },
    )
    if (mode === 'wrong-alpha') {
      // Keep a genuine valid numeric input, with an identity updated to its
      // actual bytes; the protocol peer publishes a different valid alpha plane.
      const inverse = fixturePng(
        7,
        5,
        4,
        undefined,
        alphas.map((value) => 255 - value),
      )
      await writeFile(request.contributionMask.path, inverse)
      request.contributionMask.byteSize = inverse.length
      request.contributionMask.sha256 = digest(inverse)
    }
    await use(client, request, marker)
  } finally {
    await client?.close()
    await rm(directory, { force: true, recursive: true })
  }
}

test('real CPU JSONL world composition returns exact world alpha at a nonlatent size', async () => {
  await withClient('actual', async (client, request) => {
    const result = await client.composeSmartPatchOutput(request)
    const bytes = await readFile(result.output.path)
    assert.equal(bytes[25], 6)
    assert.equal(result.output.width, 7)
    assert.equal(result.output.height, 5)
    assert.equal(result.output.iccSha256, IGS_SRGB_ICC_SHA256)
    assert.ok(
      decodeTargetPngAlpha(bytes, 7, 5).equals(
        Buffer.from(Array.from({ length: 35 }, (_, i) => alphas[i % 6])),
      ),
    )
  })
})

test('world composition refuses an older CPU capability before dispatch', async () => {
  await withClient('old', async (client, request, marker) => {
    await assert.rejects(client.composeSmartPatchOutput(request), {
      code: 'WORKER_VERSION_MISMATCH',
    })
    await assert.rejects(readFile(marker), { code: 'ENOENT' })
  })
})

test('world composition rejects truthful output with wrong alpha and confirms child exit', async () => {
  await withClient('wrong-alpha', async (client, request, marker) => {
    await assert.rejects(client.composeSmartPatchOutput(request), { code: 'OUTPUT_MISMATCH' })
    const pid = Number(await readFile(marker, 'utf8'))
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
  })
})

test('world composition timeout confirms resistant child exit before settling', async () => {
  await withClient('hang', async (client, request, marker) => {
    await assert.rejects(client.composeSmartPatchOutput(request), { code: 'REQUEST_TIMEOUT' })
    const pid = Number(await readFile(marker, 'utf8'))
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
    assert.ok(await readFile(request.image.path))
  })
})
