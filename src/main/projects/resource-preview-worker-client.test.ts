import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { crc32, deflateSync } from 'node:zlib'

import { ProjectWorkerClient, type ResourcePreviewInput } from './worker-client.js'

const root = path.resolve(import.meta.dirname, '../../..')
const python = path.join(root, 'worker-python/.venv/bin/python')
const outputFixture = path.join(import.meta.dirname, 'test-fixtures/candidate-thumbnail-64x64.webp')
const adobeProfile = path.join(root, 'worker-python/tests/fixtures/AdobeRGB1998.icc')
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

function pngChunk(kind: string, payload: Buffer): Buffer {
  const encodedKind = Buffer.from(kind)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(payload.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([encodedKind, payload])))
  return Buffer.concat([length, encodedKind, payload, checksum])
}

/** Native PNG fixture; the worker action under test is never used to build its own input. */
function sourcePng(): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(128, 0)
  header.writeUInt32BE(64, 4)
  header[8] = 8
  header[9] = 6
  const rows = Buffer.alloc((128 * 4 + 1) * 64)
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 128; x++) {
      const offset = y * (128 * 4 + 1) + 1 + x * 4
      rows.set([20, 60, 140, 100], offset)
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function replaceWebpProfile(bytes: Buffer, replacement: Buffer): Buffer {
  const chunks: Buffer[] = []
  let cursor = 12
  while (cursor + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(cursor + 4)
    const next = cursor + 8 + length + (length % 2)
    if (bytes.toString('ascii', cursor, cursor + 4) === 'ICCP') {
      const header = Buffer.alloc(8)
      header.write('ICCP', 0)
      header.writeUInt32LE(replacement.length, 4)
      chunks.push(header, replacement, Buffer.alloc(replacement.length % 2))
    } else {
      chunks.push(bytes.subarray(cursor, next))
    }
    cursor = next
  }
  const result = Buffer.concat([bytes.subarray(0, 12), ...chunks])
  result.writeUInt32LE(result.length - 8, 4)
  return result
}

async function peer(directory: string): Promise<string> {
  const executable = path.join(directory, 'peer-python')
  await writeFile(
    executable,
    String.raw`#!${process.execPath}
const fs = require('node:fs')
const crypto = require('node:crypto')
if (process.argv.slice(2).join(' ') !== '-I -m imagegen_worker') process.exit(21)
const mode = process.env.RESOURCE_PEER_MODE
const capabilities = ['image-derivatives', 'import-normalization', 'self-test']
if (mode !== 'old-worker') capabilities.push('resource-preview')
process.stdout.write(JSON.stringify({type:'ready',protocolVersion:'1',workerVersion:'0.1.0',
  pythonVersion:'3.12.13',runtimeProfile:'derivatives-only',capabilities})+'\n')
let pending = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => {
  pending += chunk
  while (pending.includes('\n')) {
    const newline = pending.indexOf('\n')
    const request = JSON.parse(pending.slice(0,newline)); pending = pending.slice(newline+1)
    fs.appendFileSync(process.env.RESOURCE_REQUEST_MARKER, request.type+'\n')
    if (request.type === 'self-test') {
      process.stdout.write(JSON.stringify({type:'self-test-result',protocolVersion:'1',
        requestId:request.requestId,runtimeProfile:'derivatives-only',checks:{pillowVersion:'12.2.0',
        imageCodecs:['PNG','WEBP'],colorConversion:'srgb'}})+'\n')
      continue
    }
    if (request.type !== 'create-resource-preview') process.exit(22)
    if (mode === 'crash') process.exit(7)
    if (mode === 'timeout') continue
    const bytes = Buffer.from(process.env.RESOURCE_OUTPUT_BYTES,'base64')
    const metadata = {
      byteSize:bytes.length,colorSpace:'srgb',width:64,height:64,
      sha256:crypto.createHash('sha256').update(bytes).digest('hex')
    }
    fs.writeFileSync(request.output.previewWebpPath,bytes,{flag:'wx'})
    if (mode !== 'missing-thumbnail') fs.writeFileSync(request.output.thumbnailWebpPath,bytes,{flag:'wx'})
    const thumbnail = {...metadata}
    if (mode === 'false-sha') thumbnail.sha256 = '0'.repeat(64)
    process.stdout.write(JSON.stringify({type:'resource-preview-done',protocolVersion:'1',
      requestId:request.requestId,preview:metadata,thumbnail})+'\n')
  }
})
process.stdin.on('end',()=>process.exit(0))
`,
    { mode: 0o700 },
  )
  await chmod(executable, 0o700)
  return executable
}

async function fixture(mode: string, bytes?: Buffer) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-resource-worker-'))
  const scratch = path.join(directory, 'scratch')
  const stage = path.join(scratch, 'request')
  await mkdir(stage, { recursive: true })
  const source = path.join(directory, 'source.png')
  const inputBytes = sourcePng()
  await writeFile(source, inputBytes)
  const marker = path.join(directory, 'requests')
  const client = await ProjectWorkerClient.start(
    { pythonExecutable: await peer(directory), runtimeRoot: directory, stagingBasePath: scratch },
    {
      environment: {
        RESOURCE_OUTPUT_BYTES: (bytes ?? (await readFile(outputFixture))).toString('base64'),
        RESOURCE_PEER_MODE: mode,
        RESOURCE_REQUEST_MARKER: marker,
      },
      requestTimeoutMs: 100,
      startupTimeoutMs: 10_000,
    },
  )
  const input: ResourcePreviewInput = {
    inputPath: source,
    inputSha256: digest(inputBytes),
    previewMaxSide: 512,
    previewWebpPath: path.join(stage, 'preview.webp'),
    stagingRoot: stage,
    thumbnailMaxSide: 96,
    thumbnailWebpPath: path.join(stage, 'thumbnail.webp'),
  }
  return {
    async cleanup() {
      await client.close()
      await rm(directory, { force: true, recursive: true })
    },
    client,
    directory,
    input,
    marker,
  }
}

test('resource preview client checks actual WebP bytes and rejects dishonest peer output', async (t) => {
  // Boundary: production Main client with actual JSON-lines subprocess and actual output files.
  // Neighbor: truthful media/hash. Mutations: trust metadata, skip ICC verification, or skip caps.
  const normal = await readFile(outputFixture)
  for (const [mode, bytes, expected] of [
    ['truthful', normal, null],
    ['false-sha', normal, 'OUTPUT_MISMATCH'],
    [
      'foreign-profile',
      replaceWebpProfile(normal, await readFile(adobeProfile)),
      'OUTPUT_MISMATCH',
    ],
    ['png-substitute', sourcePng(), 'OUTPUT_MISMATCH'],
    ['missing-thumbnail', normal, 'OUTPUT_MISMATCH'],
    ['smaller-requested-side', normal, 'OUTPUT_MISMATCH'],
    ['crash', normal, 'WORKER_EXITED'],
    ['timeout', normal, 'REQUEST_TIMEOUT'],
  ] as const) {
    await t.test(mode, async () => {
      const f = await fixture(mode, bytes)
      try {
        if (mode === 'smaller-requested-side') {
          f.input.thumbnailMaxSide = 32
        }
        if (expected) {
          await assert.rejects(f.client.createResourcePreview(f.input), { code: expected })
        } else {
          const result = await f.client.createResourcePreview(f.input)
          assert.equal(result.preview.width, 64)
          assert.equal(result.thumbnail.height, 64)
          assert.equal(result.preview.iccSha256, IGS_SRGB_ICC_SHA256)
          assert.equal(result.thumbnail.sha256, digest(normal))
          assert.ok(
            (await readFile(result.preview.path)).equals(normal),
            'Real preview bytes differ',
          )
          assert.ok(
            (await readFile(result.thumbnail.path)).equals(normal),
            'Real thumbnail bytes differ',
          )
        }
        assert.equal(await readFile(f.marker, 'utf8'), 'create-resource-preview\n')
      } finally {
        await f.cleanup()
      }
    })
  }
})

test('older workers retain existing functions but cannot dispatch the new preview request', async () => {
  const f = await fixture('old-worker')
  try {
    await assert.rejects(f.client.createResourcePreview(f.input), {
      code: 'WORKER_VERSION_MISMATCH',
    })
    assert.equal((await f.client.selfTest()).colorConversion, 'srgb')
    assert.equal(await readFile(f.marker, 'utf8'), 'self-test\n')
    assert.equal(existsSync(f.input.previewWebpPath), false)
  } finally {
    await f.cleanup()
  }
})

test('invalid source identity and unsafe destinations are rejected before worker dispatch', async (t) => {
  for (const failure of [
    'wrong-sha',
    'too-large',
    'symlink',
    'escaped-output',
    'same-output',
    'bounds',
  ]) {
    await t.test(failure, async () => {
      const f = await fixture('truthful')
      try {
        const expected =
          failure === 'wrong-sha' || failure === 'bounds'
            ? 'INVALID_REQUEST'
            : failure === 'too-large'
              ? 'OUTPUT_MISMATCH'
              : 'INVALID_PATH'
        switch (failure) {
          case 'escaped-output': {
            f.input.previewWebpPath = path.join(f.directory, 'escape.webp')
            break
          }
          case 'same-output': {
            f.input.previewWebpPath = f.input.thumbnailWebpPath
            break
          }
          case 'symlink': {
            const link = path.join(f.directory, 'link.png')
            await symlink(f.input.inputPath, link)
            f.input.inputPath = link

            break
          }
          case 'too-large': {
            await writeFile(f.input.inputPath, Buffer.alloc(1_000_001))
            break
          }
          case 'wrong-sha': {
            f.input.inputSha256 = '0'.repeat(64)
            break
          }
          default: {
            f.input.thumbnailMaxSide = 129
          }
        }
        await assert.rejects(f.client.createResourcePreview(f.input), { code: expected })
        assert.equal(existsSync(f.marker), false, 'Unsafe request reached the worker')
        assert.equal(existsSync(f.input.thumbnailWebpPath), false)
      } finally {
        await f.cleanup()
      }
    })
  }
})

function devRuntimeRoot(): string | null {
  if (!existsSync(python)) {
    return null
  }
  const resolved = realpathSync(python).split(path.sep)
  const requested = python.split(path.sep)
  let common = 0
  while (common < requested.length && requested[common] === resolved[common]) {
    common++
  }
  const candidate = requested.slice(0, common).join(path.sep)
  return candidate && candidate !== path.sep ? candidate : null
}

test(
  'real CPU worker produces verified smaller resource images through the Main API',
  { skip: !devRuntimeRoot(), timeout: 20_000 },
  async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-resource-worker-real-'))
    const stage = path.join(directory, 'request')
    await mkdir(stage)
    const source = path.join(directory, 'source.png')
    const bytes = sourcePng()
    await writeFile(source, bytes)
    const client = await ProjectWorkerClient.start(
      { pythonExecutable: python, runtimeRoot: devRuntimeRoot()!, stagingBasePath: directory },
      { requestTimeoutMs: 10_000 },
    )
    try {
      const result = await client.createResourcePreview({
        inputPath: source,
        inputSha256: digest(bytes),
        previewMaxSide: 512,
        previewWebpPath: path.join(stage, 'preview.webp'),
        stagingRoot: stage,
        thumbnailMaxSide: 96,
        thumbnailWebpPath: path.join(stage, 'thumbnail.webp'),
      })
      assert.equal(result.preview.width, 128)
      assert.equal(result.preview.height, 64)
      assert.equal(result.thumbnail.width, 96)
      assert.equal(result.thumbnail.height, 48)
      assert.equal(result.preview.iccSha256, IGS_SRGB_ICC_SHA256)
      assert.equal(result.thumbnail.iccSha256, IGS_SRGB_ICC_SHA256)
      assert.ok((await readFile(source)).equals(bytes), 'Resource source was changed')
    } finally {
      await client.close()
      await rm(directory, { force: true, recursive: true })
    }
  },
)
