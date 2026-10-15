import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import type { ChildProcessWithoutNullStreams } from 'node:child_process'

import assert from 'node:assert/strict'
import { createHash, pbkdf2, randomUUID } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { crc32, deflateSync } from 'node:zlib'

import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { ProjectSession } from './project-session.js'
import {
  type ComposePreviewInput,
  type ComposeTargetInput,
  ProjectWorkerClient,
  ProjectWorkerError,
} from './worker-client.js'

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../../..')
const DEV_PYTHON = path.join(REPOSITORY_ROOT, 'worker-python/.venv/bin/python')
const ADOBE_ICC = path.join(REPOSITORY_ROOT, 'worker-python/tests/fixtures/AdobeRGB1998.icc')
const SOURCE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGO06bnDwMDAxMDAwMDAAAATOgGonVuaBAAAAABJRU5ErkJggg==',
  'base64',
)
const SOURCE_WEBP = Buffer.from(
  'UklGRjoAAABXRUJQVlA4IC4AAADwAQCdASoCAAIAAUAmJaACdLoB+AAETAAA/q4X/0mzxNnibPkkf/OwbEu14AAA',
  'base64',
)
const sha256 = (value: Buffer): string => createHash('sha256').update(value).digest('hex')

async function withTemp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), 'igs-worker-client-'))
  try {
    await run(directory)
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

async function fakeWorker(directory: string): Promise<string> {
  const executable = path.join(directory, 'fake-python')
  const script = String.raw`#!${process.execPath}
const mode = process.env.FAKE_MODE
if (process.argv.slice(2).join(' ') !== '-I -m imagegen_worker') process.exit(21)
if (process.env.FAKE_SPAWN_MARKER) {
  require('node:fs').appendFileSync(process.env.FAKE_SPAWN_MARKER, String(process.pid) + '\n')
}
const ready = {
  type: 'ready', protocolVersion: '1', workerVersion: mode === 'bad-version' ? '9.9.9' : '0.1.0',
  pythonVersion: '3.12.13', runtimeProfile: 'derivatives-only',
  capabilities: ['image-derivatives', 'import-normalization', 'self-test',
    ...(String(mode).startsWith('preview-') && mode !== 'preview-no-capability'
      ? ['preview-composition'] : []),
    ...(String(mode).startsWith('target-') && mode !== 'target-no-capability'
      ? ['target-composition'] : [])]
}
if (mode === 'delayed-sigterm' || mode === 'ignore-sigterm') {
  process.on('SIGTERM', () => {
    if (mode === 'delayed-sigterm') setTimeout(() => process.exit(0), 75)
  })
  setInterval(() => {}, 1000)
}
if (mode === 'silent') { setInterval(() => {}, 1000) }
else {
  const startup = JSON.stringify(ready) + '\n'
  process.stdout.write(mode === 'unsolicited'
    ? startup + JSON.stringify({type:'self-test-result',protocolVersion:'1',requestId:'unasked'}) + '\n'
    : startup)
  process.stdin.setEncoding('utf8')
  let input = ''
  process.stdin.on('data', chunk => {
    input += chunk
    while (input.includes('\n')) {
      const newline = input.indexOf('\n')
      const request = JSON.parse(input.slice(0, newline)); input = input.slice(newline + 1)
      if (mode === 'hang' || mode === 'delayed-sigterm' || mode === 'ignore-sigterm') continue
      if (mode === 'crash') process.exit(7)
      if (mode === 'invalid-json') { process.stdout.write('{bad\n'); continue }
      if (mode === 'worker-error') {
        process.stdout.write(JSON.stringify({type:'error',protocolVersion:'1',requestId:request.requestId,code:'INPUT_HASH_MISMATCH',message:'Input changed.'}) + '\n')
        continue
      }
      if (mode === 'target-worker-too-large') {
        process.stdout.write(JSON.stringify({type:'error',protocolVersion:'1',requestId:request.requestId,code:'IMAGE_TOO_LARGE',message:'Target is too large.'}) + '\n')
        continue
      }
      if (request.type === 'compose-target') {
        const fs = require('node:fs')
        const crypto = require('node:crypto')
        const bytes = Buffer.from(process.env.FAKE_PNG, 'base64')
        fs.writeFileSync(request.output.targetPngPath, bytes)
        const composite = {
          byteSize: bytes.length, width: 2, height: 2,
          sha256: crypto.createHash('sha256').update(bytes).digest('hex'), colorSpace: 'srgb'
        }
        if (mode === 'target-false-sha') composite.sha256 = '0'.repeat(64)
        const rect = { ...request.bbox }
        if (mode === 'target-wrong-rect') rect.x += 1
        const reportedMode = mode === 'target-invalid-mode' ? 'inpaint'
          : mode === 'target-false-mode' ? 'img2img' : process.env.FAKE_TARGET_MODE
        process.stdout.write(JSON.stringify({
          type:'target-done',protocolVersion:'1',requestId:request.requestId,
          mode:reportedMode,rect,composite
        }) + '\n')
        continue
      }
      if (request.type === 'compose-preview') {
        const fs = require('node:fs')
        const crypto = require('node:crypto')
        if (mode === 'preview-empty-with-output') {
          fs.writeFileSync(request.output.mergedPngPath, Buffer.from(process.env.FAKE_PNG, 'base64'))
        }
        if (mode === 'preview-empty-with-extra') {
          fs.writeFileSync(require('node:path').join(request.output.stagingRoot, 'unexpected.tmp'), 'unexpected')
        }
        if (mode.startsWith('preview-empty')) {
          process.stdout.write(JSON.stringify({type:'preview-done',protocolVersion:'1',requestId:request.requestId,status:'empty',rect:null,merged:null,thumbnail:null}) + '\n')
          continue
        }
        if (mode === 'preview-invalid-status') {
          process.stdout.write(JSON.stringify({type:'preview-done',protocolVersion:'1',requestId:request.requestId,status:'unavailable',rect:null,merged:null,thumbnail:null}) + '\n')
          continue
        }
        const merged = Buffer.from(process.env.FAKE_PNG, 'base64')
        const thumbnail = Buffer.from(process.env.FAKE_WEBP, 'base64')
        fs.writeFileSync(request.output.mergedPngPath, merged)
        fs.writeFileSync(request.output.thumbnailWebpPath, thumbnail)
        const info = (bytes) => ({byteSize:bytes.length,width:2,height:2,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),colorSpace:'srgb'})
        const mergedInfo = info(merged)
        if (mode === 'preview-false-sha') mergedInfo.sha256 = '0'.repeat(64)
        const origin = request.layers[0].transform
        const rect = mode === 'preview-outside-rect'
          ? {x: origin.x + 2,y:origin.y,width:2,height:2}
          : {x:origin.x,y:origin.y,width:2,height:2}
        process.stdout.write(JSON.stringify({type:'preview-done',protocolVersion:'1',requestId:request.requestId,status:'rendered',rect,merged:mergedInfo,thumbnail:info(thumbnail)}) + '\n')
        continue
      }
      if (mode === 'false-merged-sha' || mode === 'false-thumbnail-sha' || mode === 'truthful-derivative') {
        const fs = require('node:fs')
        const crypto = require('node:crypto')
        const merged = Buffer.from(process.env.FAKE_PNG, 'base64')
        const thumbnail = Buffer.from(process.env.FAKE_WEBP, 'base64')
        fs.writeFileSync(request.output.mergedPngPath, merged)
        fs.writeFileSync(request.output.thumbnailWebpPath, thumbnail)
        const info = (bytes) => ({byteSize:bytes.length,width:2,height:2,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),colorSpace:'srgb'})
        const mergedInfo = info(merged)
        const thumbnailInfo = info(thumbnail)
        if (mode === 'false-merged-sha') mergedInfo.sha256 = '0'.repeat(64)
        if (mode === 'false-thumbnail-sha') thumbnailInfo.sha256 = '0'.repeat(64)
        process.stdout.write(JSON.stringify({type:'derivative-done',protocolVersion:'1',requestId:request.requestId,merged:mergedInfo,thumbnail:thumbnailInfo}) + '\n')
        continue
      }
      if (mode === 'dishonest-color') {
        const fs = require('node:fs')
        const crypto = require('node:crypto')
        const normalized = Buffer.from(process.env.FAKE_PNG, 'base64')
        fs.writeFileSync(request.output.normalizedPngPath, normalized)
        process.stdout.write(JSON.stringify({type:'import-done',protocolVersion:'1',requestId:request.requestId,sourceFormat:'PNG',normalized:{byteSize:normalized.length,width:2,height:2,sha256:crypto.createHash('sha256').update(normalized).digest('hex'),colorSpace:'srgb'},originalIcc:null}) + '\n')
        continue
      }
      const requestId = mode === 'wrong-id' ? 'different-id' : request.requestId
      if (request.type === 'self-test') {
        process.stdout.write(JSON.stringify({type:'self-test-result',protocolVersion:'1',requestId,runtimeProfile:'derivatives-only',checks:{pillowVersion:'12.0.0',imageCodecs:['PNG','WEBP'],colorConversion:'srgb'}}) + '\n')
      } else {
        process.stdout.write(JSON.stringify({type:'derivative-done',protocolVersion:'1',requestId,merged:{byteSize:1,width:1,height:1,sha256:'0'.repeat(64),colorSpace:'srgb'},thumbnail:{byteSize:1,width:1,height:1,sha256:'0'.repeat(64),colorSpace:'srgb'}}) + '\n')
      }
    }
  })
}
`
  await writeFile(executable, script)
  await chmod(executable, 0o700)
  return executable
}

function insertPngChunk(png: Buffer, chunkType: string, payload: Buffer): Buffer {
  const type = Buffer.from(chunkType, 'ascii')
  const chunk = Buffer.alloc(12 + payload.length)
  chunk.writeUInt32BE(payload.length, 0)
  type.copy(chunk, 4)
  payload.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(Buffer.concat([type, payload])), 8 + payload.length)
  return Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)])
}

function insertIcc(png: Buffer, profile: Buffer): Buffer {
  return insertPngChunk(
    png,
    'iCCP',
    Buffer.concat([Buffer.from('source\0\0', 'ascii'), deflateSync(profile)]),
  )
}

function rgbaPng(alphas: readonly number[]): Buffer {
  assert.equal(alphas.length, 4)
  const pngChunk = (tag: string, payload: Buffer): Buffer => {
    const header = Buffer.alloc(8)
    header.writeUInt32BE(payload.length, 0)
    header.write(tag, 4, 'ascii')
    const checksum = Buffer.alloc(4)
    checksum.writeUInt32BE(crc32(Buffer.concat([Buffer.from(tag, 'ascii'), payload])))
    return Buffer.concat([header, payload, checksum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(2, 0)
  header.writeUInt32BE(2, 4)
  header[8] = 8
  header[9] = 6
  const pixels = Buffer.from([
    0,
    20,
    30,
    40,
    alphas[0],
    50,
    60,
    70,
    alphas[1],
    0,
    80,
    90,
    100,
    alphas[2],
    110,
    120,
    130,
    alphas[3],
  ])
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function webpWithIcc(profile: Buffer, iccFirst: boolean): Buffer {
  const chunk = (tag: string, payload: Buffer): Buffer => {
    const header = Buffer.alloc(8)
    header.write(tag, 0, 'ascii')
    header.writeUInt32LE(payload.length, 4)
    return Buffer.concat([header, payload, Buffer.alloc(payload.length & 1)])
  }
  const extended = Buffer.alloc(10)
  extended[0] = 0x20
  extended.writeUIntLE(1, 4, 3)
  extended.writeUIntLE(1, 7, 3)
  const chunks = iccFirst
    ? [chunk('ICCP', profile), SOURCE_WEBP.subarray(12)]
    : [chunk('VP8X', extended), chunk('ICCP', profile), SOURCE_WEBP.subarray(12)]
  const payload = Buffer.concat([Buffer.from('WEBP'), ...chunks])
  const riff = Buffer.alloc(8)
  riff.write('RIFF', 0, 'ascii')
  riff.writeUInt32LE(payload.length, 4)
  return Buffer.concat([riff, payload])
}

function corruptIdat(png: Buffer, kind: 'checksum' | 'compressed-data'): Buffer {
  const corrupted = Buffer.from(png)
  let offset = 8
  while (offset + 12 <= corrupted.length) {
    const length = corrupted.readUInt32BE(offset)
    const tag = corrupted.toString('ascii', offset + 4, offset + 8)
    if (tag === 'IDAT') {
      if (kind === 'checksum') {
        corrupted[offset + 8 + length] ^= 1
      } else {
        corrupted[offset + 8] = 0xff
        corrupted.writeUInt32BE(
          crc32(corrupted.subarray(offset + 4, offset + 8 + length)),
          offset + 8 + length,
        )
      }
      return corrupted
    }
    offset += 12 + length
  }
  throw new Error('The PNG fixture has no IDAT chunk.')
}

function devRuntimeRoot(): string | null {
  if (!existsSync(DEV_PYTHON)) {
    return null
  }
  const executable = realpathSync(DEV_PYTHON)
  const partsA = DEV_PYTHON.split(path.sep)
  const partsB = executable.split(path.sep)
  let shared = 0
  while (partsA[shared] === partsB[shared] && shared < partsA.length && shared < partsB.length) {
    shared++
  }
  const root = partsA.slice(0, shared).join(path.sep) || path.sep
  // The broad common root is acceptable only in this explicit development integration test.
  return root === path.sep ? null : root
}

test('fixed executable path, handshake, self-test and protocol failures', async () => {
  await withTemp(async (directory) => {
    const runtimeRoot = path.join(directory, 'runtime')
    const stagingBasePath = path.join(directory, 'staging')
    await mkdir(runtimeRoot)
    await mkdir(stagingBasePath)
    const pythonExecutable = await fakeWorker(runtimeRoot)
    const location = { pythonExecutable, runtimeRoot, stagingBasePath }
    const client = await ProjectWorkerClient.start(location, {
      environment: { FAKE_MODE: 'valid' },
    })
    try {
      assert.equal(client.ready.runtimeProfile, 'derivatives-only')
      assert.deepEqual((await client.selfTest()).imageCodecs, ['PNG', 'WEBP'])
    } finally {
      await client.close()
    }
    await assert.rejects(
      ProjectWorkerClient.start(location, { environment: { FAKE_MODE: 'bad-version' } }),
      { code: 'WORKER_VERSION_MISMATCH' },
    )
    await assert.rejects(
      ProjectWorkerClient.start(location, { environment: { FAKE_MODE: 'unsolicited' } }),
      { code: 'PROTOCOL_ERROR' },
    )
    await assert.rejects(
      ProjectWorkerClient.start(location, {
        environment: { FAKE_MODE: 'silent' },
        startupTimeoutMs: 50,
      }),
      { code: 'STARTUP_TIMEOUT' },
    )
    const escaped = path.join(directory, 'escaped-python')
    await symlink(pythonExecutable, escaped)
    await assert.rejects(ProjectWorkerClient.start({ ...location, pythonExecutable: escaped }), {
      code: 'INVALID_PATH',
    })
    await assert.rejects(ProjectWorkerClient.start({ ...location, pythonExecutable: 'python3' }), {
      code: 'INVALID_PATH',
    })
  })
})

test('preparation request failure confirms resistant child exit before the input lease may clean up', async () => {
  await withTemp(async (directory) => {
    const runtimeRoot = path.join(directory, 'runtime')
    const stagingBasePath = path.join(directory, 'staging')
    await mkdir(runtimeRoot)
    await mkdir(stagingBasePath)
    const pythonExecutable = await fakeWorker(runtimeRoot)
    const client = await ProjectWorkerClient.start(
      { pythonExecutable, runtimeRoot, stagingBasePath },
      { environment: { FAKE_MODE: 'ignore-sigterm' }, requestTimeoutMs: 60, shutdownWaitMs: 30 },
    )
    const child = (client as unknown as { child: ChildProcessWithoutNullStreams }).child
    try {
      await assert.rejects(client.selfTest(), { code: 'REQUEST_TIMEOUT' })
      assert.equal(
        child.signalCode,
        'SIGKILL',
        'The admitted preparation must physically exit before its promise settles',
      )
      assert.throws(() => process.kill(child.pid!, 0), { code: 'ESRCH' })
    } finally {
      await client.close()
    }
  })
})

test('close rejects an active request and waits for the real child to exit after SIGTERM', async () => {
  await withTemp(async (directory) => {
    const runtimeRoot = path.join(directory, 'runtime')
    const stagingBasePath = path.join(directory, 'staging')
    await mkdir(runtimeRoot)
    await mkdir(stagingBasePath)
    const pythonExecutable = await fakeWorker(runtimeRoot)
    const client = await ProjectWorkerClient.start(
      { pythonExecutable, runtimeRoot, stagingBasePath },
      { environment: { FAKE_MODE: 'delayed-sigterm' } },
    )
    const child = (client as unknown as { child: ChildProcessWithoutNullStreams }).child
    let exitObserved = false
    child.once('exit', () => {
      exitObserved = true
    })
    const activeRequest = assert.rejects(client.selfTest(), { code: 'CLOSED' })
    await client.close()
    await activeRequest
    assert.equal(exitObserved, true)
    assert.equal(child.exitCode, 0)
  })
})

test(
  'close waits for observed exit after escalating a SIGTERM-resistant real child to SIGKILL',
  { timeout: 8000 },
  async () => {
    await withTemp(async (directory) => {
      const runtimeRoot = path.join(directory, 'runtime')
      const stagingBasePath = path.join(directory, 'staging')
      await mkdir(runtimeRoot)
      await mkdir(stagingBasePath)
      const pythonExecutable = await fakeWorker(runtimeRoot)
      const client = await ProjectWorkerClient.start(
        { pythonExecutable, runtimeRoot, stagingBasePath },
        { environment: { FAKE_MODE: 'ignore-sigterm' } },
      )
      const child = (client as unknown as { child: ChildProcessWithoutNullStreams }).child
      let exitObserved = false
      child.once('exit', () => {
        exitObserved = true
      })
      try {
        const activeRequest = assert.rejects(client.selfTest(), { code: 'CLOSED' })
        const firstClose = client.close()
        const secondClose = client.close()
        assert.equal(exitObserved, false)
        await Promise.all([firstClose, secondClose, activeRequest])
        assert.equal(exitObserved, true)
        assert.equal(child.signalCode, 'SIGKILL')
      } finally {
        if (!exitObserved) {
          const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
          child.kill('SIGKILL')
          await exited
        }
      }
    })
  },
)

test(
  'failed spawn closes after its close event without an exit event',
  { timeout: 5000 },
  async () => {
    await withTemp(async (directory) => {
      const runtimeRoot = path.join(directory, 'runtime')
      const stagingBasePath = path.join(directory, 'staging')
      await mkdir(runtimeRoot)
      await mkdir(stagingBasePath)
      const pythonExecutable = path.join(runtimeRoot, 'broken-python')
      await writeFile(pythonExecutable, '#!/nonexistent/imagegen-python\n')
      await chmod(pythonExecutable, 0o700)
      await assert.rejects(
        ProjectWorkerClient.start({ pythonExecutable, runtimeRoot, stagingBasePath }),
        {
          code: 'WORKER_EXITED',
        },
      )
    })
  },
)

test(
  'close rejects unconfirmed termination and can retry after a failed SIGKILL',
  { timeout: 10_000 },
  async () => {
    await withTemp(async (directory) => {
      const runtimeRoot = path.join(directory, 'runtime')
      const stagingBasePath = path.join(directory, 'staging')
      await mkdir(runtimeRoot)
      await mkdir(stagingBasePath)
      const pythonExecutable = await fakeWorker(runtimeRoot)
      const spawnMarker = path.join(directory, 'spawns')
      const client = await ProjectWorkerClient.start(
        { pythonExecutable, runtimeRoot, stagingBasePath },
        {
          environment: { FAKE_MODE: 'ignore-sigterm', FAKE_SPAWN_MARKER: spawnMarker },
          shutdownWaitMs: 25,
        },
      )
      const child = (client as unknown as { child: ChildProcessWithoutNullStreams }).child
      const originalKill = child.kill.bind(child)
      let exitObserved = false
      child.once('exit', () => {
        exitObserved = true
      })
      child.kill = (signal) => (signal === 'SIGKILL' ? false : originalKill(signal))
      try {
        const activeRequest = assert.rejects(client.selfTest(), { code: 'WORKER_EXIT_UNCONFIRMED' })
        await assert.rejects(client.close(), { code: 'WORKER_EXIT_UNCONFIRMED' })
        await activeRequest
        assert.equal(exitObserved, false)
        assert.equal(ProjectWorkerClient.hasUnconfirmedExit(), true)
        await assert.rejects(
          ProjectWorkerClient.start(
            { pythonExecutable, runtimeRoot, stagingBasePath },
            { environment: { FAKE_SPAWN_MARKER: spawnMarker } },
          ),
          { code: 'WORKER_EXIT_UNCONFIRMED' },
        )
        assert.equal((await readFile(spawnMarker, 'utf8')).trim().split('\n').length, 1)
        child.kill = originalKill
        await client.close()
        assert.equal(exitObserved, true)
        assert.equal(child.signalCode, 'SIGKILL')
        assert.equal(ProjectWorkerClient.hasUnconfirmedExit(), false)
        const resumed = await ProjectWorkerClient.start(
          { pythonExecutable, runtimeRoot, stagingBasePath },
          { environment: { FAKE_SPAWN_MARKER: spawnMarker } },
        )
        await resumed.close()
        assert.equal((await readFile(spawnMarker, 'utf8')).trim().split('\n').length, 2)
      } finally {
        child.kill = originalKill
        if (!exitObserved) {
          const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
          child.kill('SIGKILL')
          await exited
        }
      }
    })
  },
)

test(
  'established close failure during real path inspection is fenced before the next image spawn',
  { timeout: 10_000 },
  async () => {
    await withTemp(async (directory) => {
      const runtimeRoot = path.join(directory, 'runtime')
      const stagingBasePath = path.join(directory, 'staging')
      await mkdir(runtimeRoot)
      await mkdir(stagingBasePath)
      const pythonExecutable = await fakeWorker(runtimeRoot)
      const spawnMarker = path.join(directory, 'spawns')
      const location = { pythonExecutable, runtimeRoot, stagingBasePath }
      const client = await ProjectWorkerClient.start(location, {
        environment: { FAKE_MODE: 'ignore-sigterm', FAKE_SPAWN_MARKER: spawnMarker },
        shutdownWaitMs: 1,
      })
      const child = (client as unknown as { child: ChildProcessWithoutNullStreams }).child
      const originalKill = child.kill.bind(child)
      child.kill = (signal) => (signal === 'SIGKILL' ? false : originalKill(signal))
      // Queue real filesystem inspection behind CPU-only libuv work. Close's OS/timer path can
      // fail while the new startup is awaiting canonical paths, after its initial global check.
      const inspections = Array.from(
        { length: Number(process.env.UV_THREADPOOL_SIZE ?? 4) },
        () =>
          new Promise<void>((resolve, reject) => {
            pbkdf2('path-inspection-control', 'salt', 200_000, 32, 'sha256', (error) => {
              if (error) {
                reject(error)
              } else {
                resolve()
              }
            })
          }),
      )
      let unexpected: ProjectWorkerClient | undefined
      try {
        const closing = assert.rejects(client.close(), { code: 'WORKER_EXIT_UNCONFIRMED' })
        assert.equal(
          ProjectWorkerClient.hasUnconfirmedExit(),
          false,
          'the late fence is not yet set',
        )
        const next = await ProjectWorkerClient.start(location, {
          environment: { FAKE_SPAWN_MARKER: spawnMarker },
        }).then(
          (value) => ({ client: value, error: undefined }),
          (error: unknown) => ({ client: undefined, error }),
        )
        unexpected = next.client
        if (unexpected) {
          await unexpected.close()
        }
        await closing
        assert.equal((await readFile(spawnMarker, 'utf8')).trim().split('\n').length, 1)
        assert.ok(next.error instanceof ProjectWorkerError)
        assert.equal(next.error.code, 'WORKER_EXIT_UNCONFIRMED')
      } finally {
        await Promise.all(inspections)
        child.kill = originalKill
        if (child.exitCode === null && child.signalCode === null) {
          const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
          child.kill('SIGKILL')
          await exited
        }
        await client.close()
        if (unexpected) {
          await unexpected.close()
        }
      }
    })
  },
)

test('wrong request ID, malformed JSON, crash and deadline reject the active request', async () => {
  await withTemp(async (directory) => {
    const runtimeRoot = path.join(directory, 'runtime')
    const stagingBasePath = path.join(directory, 'staging')
    await mkdir(runtimeRoot)
    await mkdir(stagingBasePath)
    const pythonExecutable = await fakeWorker(runtimeRoot)
    for (const [mode, code] of [
      ['wrong-id', 'PROTOCOL_ERROR'],
      ['invalid-json', 'PROTOCOL_ERROR'],
      ['crash', 'WORKER_EXITED'],
      ['hang', 'REQUEST_TIMEOUT'],
    ] as const) {
      const client = await ProjectWorkerClient.start(
        { pythonExecutable, runtimeRoot, stagingBasePath },
        { environment: { FAKE_MODE: mode }, requestTimeoutMs: 80 },
      )
      try {
        await assert.rejects(client.selfTest(), { code })
      } finally {
        await client.close()
      }
    }
    const client = await ProjectWorkerClient.start(
      { pythonExecutable, runtimeRoot, stagingBasePath },
      { environment: { FAKE_MODE: 'worker-error' } },
    )
    try {
      await assert.rejects(client.selfTest(), (error: unknown) => {
        assert.ok(error instanceof ProjectWorkerError)
        assert.equal(error.code, 'WORKER_REQUEST_FAILED')
        assert.equal(error.workerCode, 'INPUT_HASH_MISMATCH')
        return true
      })
    } finally {
      await client.close()
    }
  })
})

test('worker metadata cannot substitute for missing output or escaped staging path', async () => {
  await withTemp(async (directory) => {
    const runtimeRoot = path.join(directory, 'runtime')
    const stagingBasePath = path.join(directory, 'staging')
    const requestStaging = path.join(stagingBasePath, 'request')
    await mkdir(runtimeRoot)
    await mkdir(stagingBasePath)
    await mkdir(requestStaging)
    const pythonExecutable = await fakeWorker(runtimeRoot)
    const source = path.join(directory, 'source.png')
    await writeFile(source, SOURCE_PNG)
    const client = await ProjectWorkerClient.start(
      { pythonExecutable, runtimeRoot, stagingBasePath },
      { environment: { FAKE_MODE: 'valid' } },
    )
    const input = {
      inputPath: source,
      inputSha256: sha256(SOURCE_PNG),
      mergedPngPath: path.join(requestStaging, 'merged.png'),
      stagingRoot: requestStaging,
      thumbnailMaxSide: 64,
      thumbnailWebpPath: path.join(requestStaging, 'thumbnail.webp'),
    }
    try {
      await assert.rejects(
        client.deriveImage({ ...input, mergedPngPath: path.join(directory, 'outside.png') }),
        { code: 'INVALID_PATH' },
      )
      await assert.rejects(client.deriveImage(input), { code: 'OUTPUT_MISMATCH' })
    } finally {
      await client.close()
    }
  })
})

test('main rejects false SHA-256 metadata for each actual worker output file', async () => {
  await withTemp(async (directory) => {
    const runtimeRoot = path.join(directory, 'runtime')
    const stagingBasePath = path.join(directory, 'staging')
    await mkdir(runtimeRoot)
    await mkdir(stagingBasePath)
    const pythonExecutable = await fakeWorker(runtimeRoot)
    const source = path.join(directory, 'source.png')
    await writeFile(source, SOURCE_PNG)
    const profile = await readFile(
      path.join(REPOSITORY_ROOT, 'worker-python/src/imagegen_worker/srgb.icc'),
    )
    // Both files are valid sRGB outputs; only the reported digest changes below.
    const merged = insertIcc(SOURCE_PNG, profile)
    const thumbnail = webpWithIcc(profile, false)
    const requestFor = (stagingRoot: string) => ({
      inputPath: source,
      inputSha256: sha256(SOURCE_PNG),
      mergedPngPath: path.join(stagingRoot, 'merged.png'),
      stagingRoot,
      thumbnailMaxSide: 64,
      thumbnailWebpPath: path.join(stagingRoot, 'thumbnail.webp'),
    })
    for (const mode of ['false-merged-sha', 'false-thumbnail-sha']) {
      const stagingRoot = path.join(stagingBasePath, mode)
      await mkdir(stagingRoot)
      const client = await ProjectWorkerClient.start(
        { pythonExecutable, runtimeRoot, stagingBasePath },
        {
          environment: {
            FAKE_MODE: mode,
            FAKE_PNG: merged.toString('base64'),
            FAKE_WEBP: thumbnail.toString('base64'),
          },
        },
      )
      try {
        await assert.rejects(client.deriveImage(requestFor(stagingRoot)), {
          code: 'OUTPUT_MISMATCH',
          message: 'The worker image does not match its metadata.',
        })
        assert.deepEqual(await readFile(path.join(stagingRoot, 'merged.png')), merged)
        assert.deepEqual(await readFile(path.join(stagingRoot, 'thumbnail.webp')), thumbnail)
      } finally {
        await client.close()
      }
    }

    const validStaging = path.join(stagingBasePath, 'valid')
    await mkdir(validStaging)
    const control = await ProjectWorkerClient.start(
      { pythonExecutable, runtimeRoot, stagingBasePath },
      {
        environment: {
          FAKE_MODE: 'truthful-derivative',
          FAKE_PNG: merged.toString('base64'),
          FAKE_WEBP: thumbnail.toString('base64'),
        },
      },
    )
    try {
      const result = await control.deriveImage(requestFor(validStaging))
      assert.equal(result.merged.sha256, sha256(merged))
      assert.equal(result.thumbnail.sha256, sha256(thumbnail))
    } finally {
      await control.close()
    }
  })
})

test('preview client verifies frozen source identity and accepts bounded rendered or empty results', async () => {
  await withTemp(async (directory) => {
    const runtimeRoot = path.join(directory, 'runtime')
    const stagingBasePath = path.join(directory, 'staging')
    await mkdir(runtimeRoot)
    await mkdir(stagingBasePath)
    const pythonExecutable = await fakeWorker(runtimeRoot)
    const profile = await readFile(
      path.join(REPOSITORY_ROOT, 'worker-python/src/imagegen_worker/srgb.icc'),
    )
    const sourceBytes = insertIcc(SOURCE_PNG, profile)
    const sourcePath = path.join(directory, 'source.png')
    await writeFile(sourcePath, sourceBytes)
    const merged = insertIcc(SOURCE_PNG, profile)
    const thumbnail = webpWithIcc(profile, false)
    const requestFor = (stagingRoot: string): ComposePreviewInput => ({
      layers: [
        {
          blendMode: 'normal',
          height: 2,
          opacity: 1,
          path: sourcePath,
          sha256: sha256(sourceBytes),
          transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 17, y: -3 },
          width: 2,
        },
      ],
      mergedPngPath: path.join(stagingRoot, 'merged.png'),
      stagingRoot,
      thumbnailMaxSide: 64,
      thumbnailWebpPath: path.join(stagingRoot, 'thumbnail.webp'),
    })
    const renderedRoot = path.join(stagingBasePath, 'rendered')
    await mkdir(renderedRoot)
    const renderedClient = await ProjectWorkerClient.start(
      { pythonExecutable, runtimeRoot, stagingBasePath },
      {
        environment: {
          FAKE_MODE: 'preview-rendered',
          FAKE_PNG: merged.toString('base64'),
          FAKE_WEBP: thumbnail.toString('base64'),
        },
      },
    )
    try {
      const request = requestFor(renderedRoot)
      await assert.rejects(
        renderedClient.composePreview({
          ...request,
          layers: [{ ...request.layers[0], sha256: '0'.repeat(64) }],
        }),
        { code: 'INVALID_REQUEST' },
      )
      await assert.rejects(
        renderedClient.composePreview({
          ...request,
          layers: [
            { ...request.layers[0], transform: { ...request.layers[0].transform, scaleX: 0 } },
          ],
        }),
        { code: 'INVALID_REQUEST' },
      )
      await assert.rejects(
        renderedClient.composePreview({
          ...request,
          layers: Array.from({ length: 3 }, () => ({
            ...request.layers[0],
            height: 8000,
            width: 8000,
          })),
        }),
        { code: 'INVALID_REQUEST' },
      )
      const result = await renderedClient.composePreview(request)
      assert.equal(result.status, 'rendered')
      assert.deepEqual(result.rect, { height: 2, width: 2, x: 17, y: -3 })
      assert.equal(result.merged?.sha256, sha256(merged))
      assert.equal(result.thumbnail?.sha256, sha256(thumbnail))
    } finally {
      await renderedClient.close()
    }

    const webpSource = webpWithIcc(profile, false)
    const webpPath = path.join(directory, 'source.webp')
    await writeFile(webpPath, webpSource)
    const emptyRoot = path.join(stagingBasePath, 'empty')
    await mkdir(emptyRoot)
    const emptyClient = await ProjectWorkerClient.start(
      { pythonExecutable, runtimeRoot, stagingBasePath },
      { environment: { FAKE_MODE: 'preview-empty' } },
    )
    try {
      const request = requestFor(emptyRoot)
      const result = await emptyClient.composePreview({
        ...request,
        layers: [{ ...request.layers[0], path: webpPath, sha256: sha256(webpSource) }],
      })
      assert.deepEqual(result, { merged: null, rect: null, status: 'empty', thumbnail: null })
      assert.equal(existsSync(request.mergedPngPath), false)
      assert.equal(existsSync(request.thumbnailWebpPath), false)
    } finally {
      await emptyClient.close()
    }

    const legacyRoot = path.join(stagingBasePath, 'legacy')
    await mkdir(legacyRoot)
    const legacyClient = await ProjectWorkerClient.start(
      { pythonExecutable, runtimeRoot, stagingBasePath },
      { environment: { FAKE_MODE: 'preview-no-capability' } },
    )
    try {
      await assert.rejects(legacyClient.composePreview(requestFor(legacyRoot)), {
        code: 'WORKER_VERSION_MISMATCH',
      })
      assert.deepEqual((await legacyClient.selfTest()).imageCodecs, ['PNG', 'WEBP'])
    } finally {
      await legacyClient.close()
    }

    for (const [mode, code] of [
      ['preview-outside-rect', 'OUTPUT_MISMATCH'],
      ['preview-false-sha', 'OUTPUT_MISMATCH'],
      ['preview-empty-with-output', 'OUTPUT_MISMATCH'],
      ['preview-empty-with-extra', 'OUTPUT_MISMATCH'],
      ['preview-invalid-status', 'PROTOCOL_ERROR'],
    ] as const) {
      const stagingRoot = path.join(stagingBasePath, mode)
      await mkdir(stagingRoot)
      const client = await ProjectWorkerClient.start(
        { pythonExecutable, runtimeRoot, stagingBasePath },
        {
          environment: {
            FAKE_MODE: mode,
            FAKE_PNG: merged.toString('base64'),
            FAKE_WEBP: thumbnail.toString('base64'),
          },
        },
      )
      try {
        await assert.rejects(client.composePreview(requestFor(stagingRoot)), { code }, mode)
      } finally {
        await client.close()
      }
    }
  })
})

test('target client freezes sources and verifies the pixel-derived mode for each alpha state', async () => {
  await withTemp(async (directory) => {
    const runtimeRoot = path.join(directory, 'runtime')
    const stagingBasePath = path.join(directory, 'staging')
    await mkdir(runtimeRoot)
    await mkdir(stagingBasePath)
    const pythonExecutable = await fakeWorker(runtimeRoot)
    const profile = await readFile(
      path.join(REPOSITORY_ROOT, 'worker-python/src/imagegen_worker/srgb.icc'),
    )
    const sourceBytes = insertIcc(SOURCE_PNG, profile)
    const sourcePath = path.join(directory, 'source.png')
    await writeFile(sourcePath, sourceBytes)
    const sourceLayer: ComposeTargetInput['layers'][number] = {
      blendMode: 'normal',
      height: 2,
      opacity: 1,
      path: sourcePath,
      sha256: sha256(sourceBytes),
      transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -5, y: 7 },
      width: 2,
    }
    const requestFor = (stagingRoot: string): ComposeTargetInput => ({
      bbox: { height: 2, width: 2, x: -5, y: 7 },
      layers: [sourceLayer],
      stagingRoot,
      targetPngPath: path.join(stagingRoot, 'target.png'),
    })
    for (const [name, alphas, expected] of [
      ['transparent', [0, 0, 0, 0], 'txt2img'],
      ['mixed', [255, 0, 255, 0], 'outpaint'],
      ['antialiased', [255, 128, 255, 255], 'outpaint'],
      ['opaque', [255, 255, 255, 255], 'img2img'],
    ] as const) {
      const stagingRoot = path.join(stagingBasePath, name)
      await mkdir(stagingRoot)
      const target = insertIcc(rgbaPng(alphas), profile)
      const client = await ProjectWorkerClient.start(
        { pythonExecutable, runtimeRoot, stagingBasePath },
        {
          environment: {
            FAKE_MODE: 'target-rendered',
            FAKE_PNG: target.toString('base64'),
            FAKE_TARGET_MODE: expected,
          },
        },
      )
      try {
        const request = requestFor(stagingRoot)
        if (name === 'transparent') {
          await assert.rejects(
            client.composeTarget({
              ...request,
              layers: [{ ...sourceLayer, sha256: '0'.repeat(64) }],
            }),
            { code: 'INVALID_REQUEST' },
          )
          await assert.rejects(
            client.composeTarget({ ...request, bbox: { ...request.bbox, width: 2049 } }),
            { code: 'IMAGE_TOO_LARGE' },
          )
          await assert.rejects(
            client.composeTarget({
              ...request,
              bbox: { ...request.bbox, height: 2048, width: 2048 },
            }),
            { code: 'IMAGE_TOO_LARGE' },
          )
          await assert.rejects(
            client.composeTarget({
              ...request,
              targetPngPath: path.join(directory, 'escaped.png'),
            }),
            { code: 'INVALID_PATH' },
          )
        }
        const result = await client.composeTarget(request)
        assert.equal(result.mode, expected)
        assert.deepEqual(result.rect, request.bbox)
        assert.equal(result.composite.sha256, sha256(target))
        assert.equal(result.composite.iccSha256, IGS_SRGB_ICC_SHA256)
        assert.deepEqual([result.composite.width, result.composite.height], [2, 2])
      } finally {
        await client.close()
      }
    }
  })
})

test('target client rejects dishonest bounds, pixels, color mode and worker capability', async () => {
  await withTemp(async (directory) => {
    const runtimeRoot = path.join(directory, 'runtime')
    const stagingBasePath = path.join(directory, 'staging')
    await mkdir(runtimeRoot)
    await mkdir(stagingBasePath)
    const pythonExecutable = await fakeWorker(runtimeRoot)
    const profile = await readFile(
      path.join(REPOSITORY_ROOT, 'worker-python/src/imagegen_worker/srgb.icc'),
    )
    const target = insertIcc(rgbaPng([255, 0, 255, 0]), profile)
    for (const [mode, bytes, code, width] of [
      ['target-wrong-rect', target, 'OUTPUT_MISMATCH', 2],
      ['target-false-sha', target, 'OUTPUT_MISMATCH', 2],
      ['target-false-mode', target, 'OUTPUT_MISMATCH', 2],
      ['target-invalid-mode', target, 'PROTOCOL_ERROR', 2],
      ['target-wrong-dimensions', target, 'OUTPUT_MISMATCH', 3],
      ['target-rgb', insertIcc(SOURCE_PNG, profile), 'OUTPUT_MISMATCH', 2],
      ['target-no-capability', target, 'WORKER_VERSION_MISMATCH', 2],
      ['target-worker-too-large', target, 'IMAGE_TOO_LARGE', 2],
    ] as const) {
      const stagingRoot = path.join(stagingBasePath, mode)
      await mkdir(stagingRoot)
      const client = await ProjectWorkerClient.start(
        { pythonExecutable, runtimeRoot, stagingBasePath },
        {
          environment: {
            FAKE_MODE: mode,
            FAKE_PNG: bytes.toString('base64'),
            FAKE_TARGET_MODE: 'outpaint',
          },
        },
      )
      try {
        await assert.rejects(
          client.composeTarget({
            bbox: { height: 2, width, x: 12, y: -8 },
            layers: [],
            stagingRoot,
            targetPngPath: path.join(stagingRoot, 'target.png'),
          }),
          { code },
          mode,
        )
      } finally {
        await client.close()
      }
    }
  })
})

test('worker WebP acceptance matches package Save for a truthful ICC-first output', async () => {
  await withTemp(async (directory) => {
    const runtimeRoot = path.join(directory, 'runtime')
    const stagingBasePath = path.join(directory, 'staging')
    await mkdir(runtimeRoot)
    await mkdir(stagingBasePath)
    const pythonExecutable = await fakeWorker(runtimeRoot)
    const source = path.join(directory, 'source.png')
    await writeFile(source, SOURCE_PNG)
    const profile = await readFile(
      path.join(REPOSITORY_ROOT, 'worker-python/src/imagegen_worker/srgb.icc'),
    )
    const merged = insertIcc(SOURCE_PNG, profile)
    const project = createEmptyProjectDocumentV1({ title: 'WebP parity' })

    for (const iccFirst of [false, true]) {
      const label = iccFirst ? 'icc-first' : 'vp8x-first'
      const stagingRoot = path.join(stagingBasePath, label)
      await mkdir(stagingRoot)
      const thumbnail = webpWithIcc(profile, iccFirst)
      const client = await ProjectWorkerClient.start(
        { pythonExecutable, runtimeRoot, stagingBasePath },
        {
          environment: {
            FAKE_MODE: 'truthful-derivative',
            FAKE_PNG: merged.toString('base64'),
            FAKE_WEBP: thumbnail.toString('base64'),
          },
        },
      )
      const request = {
        inputPath: source,
        inputSha256: sha256(SOURCE_PNG),
        mergedPngPath: path.join(stagingRoot, 'merged.png'),
        stagingRoot,
        thumbnailMaxSide: 64,
        thumbnailWebpPath: path.join(stagingRoot, 'thumbnail.webp'),
      }
      try {
        if (iccFirst) {
          await assert.rejects(client.deriveImage(request), { code: 'OUTPUT_MISMATCH' })
          await assert.rejects(
            saveIgsPackage(path.join(directory, `${label}.igs`), {
              preview: { merged, rect: null, status: 'empty', thumbnail },
              project,
            }),
            { code: 'INVALID_IMAGE' },
          )
        } else {
          const result = await client.deriveImage(request)
          assert.equal(result.thumbnail.sha256, sha256(thumbnail))
          const target = path.join(directory, `${label}.igs`)
          await saveIgsPackage(target, {
            preview: { merged, rect: null, status: 'empty', thumbnail },
            project,
          })
          assert.deepEqual((await readIgsPackage(target)).manifest.preview.status, 'empty')
        }
      } finally {
        await client.close()
      }
    }
  })
})

test('main rejects AdobeRGB output even when the worker truthfully reports its file hash', async () => {
  await withTemp(async (directory) => {
    const runtimeRoot = path.join(directory, 'runtime')
    const stagingBasePath = path.join(directory, 'staging')
    const requestStaging = path.join(stagingBasePath, 'request')
    await mkdir(runtimeRoot)
    await mkdir(stagingBasePath)
    await mkdir(requestStaging)
    const pythonExecutable = await fakeWorker(runtimeRoot)
    const source = path.join(directory, 'source.png')
    await writeFile(source, SOURCE_PNG)
    const adobeProfile = await readFile(ADOBE_ICC)
    const client = await ProjectWorkerClient.start(
      { pythonExecutable, runtimeRoot, stagingBasePath },
      {
        environment: {
          FAKE_MODE: 'dishonest-color',
          FAKE_PNG: insertIcc(SOURCE_PNG, adobeProfile).toString('base64'),
        },
      },
    )
    try {
      await assert.rejects(
        client.normalizeImport({
          inputPath: source,
          inputSha256: sha256(SOURCE_PNG),
          normalizedPngPath: path.join(requestStaging, 'normalized.png'),
          originalIccPath: path.join(requestStaging, 'original.icc'),
          stagingRoot: requestStaging,
        }),
        { code: 'OUTPUT_MISMATCH' },
      )
    } finally {
      await client.close()
    }
  })
})

test('main rejects Display-P3 cICP even when the embedded ICC is pinned sRGB', async () => {
  await withTemp(async (directory) => {
    const runtimeRoot = path.join(directory, 'runtime')
    const stagingBasePath = path.join(directory, 'staging')
    const requestStaging = path.join(stagingBasePath, 'request')
    await mkdir(runtimeRoot)
    await mkdir(stagingBasePath)
    await mkdir(requestStaging)
    const pythonExecutable = await fakeWorker(runtimeRoot)
    const source = path.join(directory, 'source.png')
    await writeFile(source, SOURCE_PNG)
    const pinnedProfile = await readFile(
      path.join(REPOSITORY_ROOT, 'worker-python/src/imagegen_worker/srgb.icc'),
    )
    const misleading = insertPngChunk(
      insertIcc(SOURCE_PNG, pinnedProfile),
      'cICP',
      Buffer.from([12, 13, 0, 1]),
    )
    const client = await ProjectWorkerClient.start(
      { pythonExecutable, runtimeRoot, stagingBasePath },
      { environment: { FAKE_MODE: 'dishonest-color', FAKE_PNG: misleading.toString('base64') } },
    )
    try {
      await assert.rejects(
        client.normalizeImport({
          inputPath: source,
          inputSha256: sha256(SOURCE_PNG),
          normalizedPngPath: path.join(requestStaging, 'normalized.png'),
          originalIccPath: path.join(requestStaging, 'original.icc'),
          stagingRoot: requestStaging,
        }),
        { code: 'OUTPUT_MISMATCH' },
      )
    } finally {
      await client.close()
    }

    const compatibleStaging = path.join(stagingBasePath, 'compatible')
    await mkdir(compatibleStaging)
    const compatible = insertPngChunk(
      insertIcc(SOURCE_PNG, pinnedProfile),
      'cICP',
      Buffer.from([1, 13, 0, 1]),
    )
    const control = await ProjectWorkerClient.start(
      { pythonExecutable, runtimeRoot, stagingBasePath },
      { environment: { FAKE_MODE: 'dishonest-color', FAKE_PNG: compatible.toString('base64') } },
    )
    try {
      const result = await control.normalizeImport({
        inputPath: source,
        inputSha256: sha256(SOURCE_PNG),
        normalizedPngPath: path.join(compatibleStaging, 'normalized.png'),
        originalIccPath: path.join(compatibleStaging, 'original.icc'),
        stagingRoot: compatibleStaging,
      })
      assert.equal(result.normalized.iccSha256, IGS_SRGB_ICC_SHA256)
    } finally {
      await control.close()
    }
  })
})

test('main rejects malformed PNG pixels before an imported layer can enter the Project', async () => {
  await withTemp(async (directory) => {
    const runtimeRoot = path.join(directory, 'runtime')
    const stagingBasePath = path.join(directory, 'staging')
    await mkdir(runtimeRoot)
    await mkdir(stagingBasePath)
    const pythonExecutable = await fakeWorker(runtimeRoot)
    const source = path.join(directory, 'source.png')
    await writeFile(source, SOURCE_PNG)
    const pinnedProfile = await readFile(
      path.join(REPOSITORY_ROOT, 'worker-python/src/imagegen_worker/srgb.icc'),
    )
    const valid = insertIcc(SOURCE_PNG, pinnedProfile)
    for (const [name, png] of [
      ['valid control', valid],
      ['bad IDAT checksum', corruptIdat(valid, 'checksum')],
      ['bad compressed pixels with a valid checksum', corruptIdat(valid, 'compressed-data')],
    ] as const) {
      const stagingRoot = path.join(stagingBasePath, randomUUID())
      await mkdir(stagingRoot)
      const client = await ProjectWorkerClient.start(
        { pythonExecutable, runtimeRoot, stagingBasePath },
        { environment: { FAKE_MODE: 'dishonest-color', FAKE_PNG: png.toString('base64') } },
      )
      try {
        const request = {
          inputPath: source,
          inputSha256: sha256(SOURCE_PNG),
          normalizedPngPath: path.join(stagingRoot, 'normalized.png'),
          originalIccPath: path.join(stagingRoot, 'original.icc'),
          stagingRoot,
        }
        if (name === 'valid control') {
          assert.equal(
            (await client.normalizeImport(request)).normalized.iccSha256,
            IGS_SRGB_ICC_SHA256,
          )
        } else {
          await assert.rejects(client.normalizeImport(request), { code: 'OUTPUT_MISMATCH' }, name)
        }
      } finally {
        await client.close()
      }
    }
  })
})

test(
  'development worker round-trips real derivatives and preserves original ICC bytes',
  {
    skip: !devRuntimeRoot() || !existsSync(ADOBE_ICC),
  },
  async () => {
    await withTemp(async (directory) => {
      const stagingBasePath = path.join(directory, 'staging')
      const deriveRoot = path.join(stagingBasePath, 'derive')
      const importRoot = path.join(stagingBasePath, 'import')
      const composeRoot = path.join(stagingBasePath, 'compose')
      const targetRoot = path.join(stagingBasePath, 'target')
      const emptyTargetRoot = path.join(stagingBasePath, 'empty-target')
      const untaggedPngRoot = path.join(stagingBasePath, 'untagged-png')
      const untaggedWebpRoot = path.join(stagingBasePath, 'untagged-webp')
      const emptyRoot = path.join(stagingBasePath, 'empty')
      await mkdir(stagingBasePath)
      await mkdir(deriveRoot)
      await mkdir(importRoot)
      await mkdir(composeRoot)
      await mkdir(targetRoot)
      await mkdir(emptyTargetRoot)
      await mkdir(untaggedPngRoot)
      await mkdir(untaggedWebpRoot)
      await mkdir(emptyRoot)
      const client = await ProjectWorkerClient.start(
        {
          pythonExecutable: DEV_PYTHON,
          runtimeRoot: devRuntimeRoot()!,
          stagingBasePath,
        },
        { requestTimeoutMs: 15_000 },
      )
      try {
        const selfTest = await client.selfTest()
        assert.equal(selfTest.colorConversion, 'srgb')

        const source = path.join(directory, 'source.png')
        await writeFile(source, SOURCE_PNG)
        const derived = await client.deriveImage({
          inputPath: source,
          inputSha256: sha256(SOURCE_PNG),
          mergedPngPath: path.join(deriveRoot, 'merged.png'),
          stagingRoot: deriveRoot,
          thumbnailMaxSide: 64,
          thumbnailWebpPath: path.join(deriveRoot, 'thumbnail.webp'),
        })
        assert.equal(derived.merged.width, 2)
        assert.equal(derived.thumbnail.height, 2)
        assert.equal(derived.merged.iccSha256, derived.thumbnail.iccSha256)
        assert.equal(derived.merged.iccSha256, IGS_SRGB_ICC_SHA256)
        assert.equal(sha256(await readFile(derived.merged.path)), derived.merged.sha256)

        const previewLayer: ComposePreviewInput['layers'][number] = {
          blendMode: 'normal',
          height: derived.merged.height,
          opacity: 1,
          path: derived.merged.path,
          sha256: derived.merged.sha256,
          transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 7, y: -4 },
          width: derived.merged.width,
        }
        const preview = await client.composePreview({
          layers: [previewLayer],
          mergedPngPath: path.join(composeRoot, 'merged.png'),
          stagingRoot: composeRoot,
          thumbnailMaxSide: 64,
          thumbnailWebpPath: path.join(composeRoot, 'thumbnail.webp'),
        })
        assert.equal(preview.status, 'rendered')
        assert.deepEqual(preview.rect, { height: 2, width: 2, x: 7, y: -4 })
        assert.equal(preview.merged?.iccSha256, IGS_SRGB_ICC_SHA256)
        assert.equal(preview.thumbnail?.iccSha256, IGS_SRGB_ICC_SHA256)
        const generationTarget = await client.composeTarget({
          bbox: { height: 2, width: 3, x: 7, y: -4 },
          layers: [previewLayer],
          stagingRoot: targetRoot,
          targetPngPath: path.join(targetRoot, 'target.png'),
        })
        assert.equal(generationTarget.mode, 'outpaint')
        assert.deepEqual(generationTarget.rect, { height: 2, width: 3, x: 7, y: -4 })
        assert.deepEqual(
          [generationTarget.composite.width, generationTarget.composite.height],
          [3, 2],
        )
        assert.equal(generationTarget.composite.iccSha256, IGS_SRGB_ICC_SHA256)
        assert.equal(
          sha256(await readFile(generationTarget.composite.path)),
          generationTarget.composite.sha256,
        )
        const emptyTarget = await client.composeTarget({
          bbox: { height: 2, width: 2, x: -100, y: 100 },
          layers: [],
          stagingRoot: emptyTargetRoot,
          targetPngPath: path.join(emptyTargetRoot, 'target.png'),
        })
        assert.equal(emptyTarget.mode, 'txt2img')
        assert.equal(emptyTarget.composite.iccSha256, IGS_SRGB_ICC_SHA256)
        for (const [inputBytes, inputPath, stagingRoot] of [
          [SOURCE_PNG, source, untaggedPngRoot],
          [SOURCE_WEBP, path.join(directory, 'untagged.webp'), untaggedWebpRoot],
        ] as const) {
          await writeFile(inputPath, inputBytes)
          const untagged = await client.composePreview({
            layers: [{ ...previewLayer, path: inputPath, sha256: sha256(inputBytes) }],
            mergedPngPath: path.join(stagingRoot, 'merged.png'),
            stagingRoot,
            thumbnailMaxSide: 64,
            thumbnailWebpPath: path.join(stagingRoot, 'thumbnail.webp'),
          })
          assert.equal(untagged.status, 'rendered')
          assert.deepEqual(untagged.rect, preview.rect)
          assert.equal(untagged.merged?.iccSha256, IGS_SRGB_ICC_SHA256)
          assert.equal(untagged.thumbnail?.iccSha256, IGS_SRGB_ICC_SHA256)
        }
        const empty = await client.composePreview({
          layers: [
            {
              ...previewLayer,
              opacity: 0,
              path: derived.thumbnail.path,
              sha256: derived.thumbnail.sha256,
            },
          ],
          mergedPngPath: path.join(emptyRoot, 'merged.png'),
          stagingRoot: emptyRoot,
          thumbnailMaxSide: 64,
          thumbnailWebpPath: path.join(emptyRoot, 'thumbnail.webp'),
        })
        assert.equal(empty.status, 'empty')
        assert.equal(empty.rect, null)
        assert.equal(empty.merged, null)
        assert.equal(empty.thumbnail, null)

        const adobeProfile = await readFile(ADOBE_ICC)
        const taggedInput = insertIcc(SOURCE_PNG, adobeProfile)
        const taggedPath = path.join(directory, 'tagged.png')
        await writeFile(taggedPath, taggedInput)
        const imported = await client.normalizeImport({
          inputPath: taggedPath,
          inputSha256: sha256(taggedInput),
          normalizedPngPath: path.join(importRoot, 'layer.png'),
          originalIccPath: path.join(importRoot, 'source.icc'),
          stagingRoot: importRoot,
        })
        assert.equal(imported.sourceFormat, 'PNG')
        assert.equal(imported.normalized.colorSpace, 'srgb')
        assert.equal(imported.normalized.iccSha256, IGS_SRGB_ICC_SHA256)
        assert.equal(imported.normalized.width, 2)
        assert.ok(imported.originalIcc)
        assert.deepEqual(await readFile(imported.originalIcc.path), adobeProfile)
        assert.equal(imported.originalIcc.sha256, sha256(adobeProfile))
        assert.equal((await lstat(imported.normalized.path)).isFile(), true)

        // Main-process integration harness: worker output -> explicit Project Save -> real ZIP reopen.
        // This does not exercise the renderer, file picker, autosave or production runtime installer.
        const workspace = path.join(directory, 'workspace')
        await mkdir(workspace)
        const projectPath = path.join(workspace, 'imported.igs')
        const session = await ProjectSession.create(projectPath, 'Imported image', {
          placeholdersDir: path.join(REPOSITORY_ROOT, 'src/main/projects/placeholders'),
          scratchDir: path.join(directory, 'scratch'),
        })
        const layerId = randomUUID()
        const layerPath = `assets/layers/${layerId}.png`
        const profilePath = `assets/profiles/${imported.originalIcc.sha256}.icc`
        session.applyDocument({
          ...session.document,
          layers: [
            {
              asset: {
                bytes: imported.normalized.byteSize,
                height: imported.normalized.height,
                path: layerPath,
                sha256: imported.normalized.sha256,
                width: imported.normalized.width,
              },
              blendMode: 'normal',
              id: layerId,
              kind: 'raster',
              locked: false,
              name: 'Adobe RGB source',
              opacity: 1,
              sourceIccProfile: {
                bytes: imported.originalIcc.byteSize,
                path: profilePath,
                sha256: imported.originalIcc.sha256,
              },
              transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
              visible: true,
            },
          ],
        })
        const saved = await session.save({
          assets: {
            [layerPath]: { sourcePath: imported.normalized.path },
            [profilePath]: { sourcePath: imported.originalIcc.path },
          },
        })
        assert.equal(saved.committed, true)
        const reopened = await readIgsPackage(projectPath)
        assert.equal(reopened.project.colorSpace, 'srgb')
        assert.deepEqual(await reopened.readMember(profilePath), adobeProfile)
        assert.equal(sha256(await reopened.readMember(layerPath)), imported.normalized.sha256)
      } finally {
        await client.close()
      }
    })
  },
)
