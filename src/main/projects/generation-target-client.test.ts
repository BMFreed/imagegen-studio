import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { crc32, deflateSync } from 'node:zlib'

import type { IllustriousTxt2ImgRequestV1 } from './illustrious-txt2img-job.js'
import type { ComposeTargetInput, ComposeTargetMode } from './worker-client.js'

import { openAppDatabase } from '../db/database.js'
import {
  GenerationWorkerClient,
  GenerationWorkerError,
  type GenerationWorkerLocation,
} from './generation-worker-client.js'
import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { readProjectPlaceholders } from './project-placeholders.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
import { requireRasterLayer } from './test-fixtures/require-raster-layer.js'

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../../..')
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

type PeerRequest = Record<string, unknown> & { requestId: string; type: string }
type Fixture = {
  location: GenerationWorkerLocation
  profile: Buffer
  requestMarker: string
  root: string
}

/** Fixture encoder only: actual client PNG/ICC/hash/alpha verification remains in production. */
function rgbaPng(profile: Buffer | null, alphas: readonly number[], width = 2, height = 2): Buffer {
  assert.equal(alphas.length, width * height)
  const chunk = (tag: string, payload: Buffer): Buffer => {
    const header = Buffer.alloc(8)
    header.writeUInt32BE(payload.length)
    header.write(tag, 4, 'ascii')
    const checksum = Buffer.alloc(4)
    checksum.writeUInt32BE(crc32(Buffer.concat([Buffer.from(tag, 'ascii'), payload])))
    return Buffer.concat([header, payload, checksum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  const pixels = Buffer.alloc(height * (width * 4 + 1))
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const offset = row * (width * 4 + 1) + 1 + column * 4
      pixels.set([20, 30, 40, alphas[row * width + column]], offset)
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    ...(profile
      ? [chunk('iCCP', Buffer.concat([Buffer.from('srgb\0\0'), deflateSync(profile)]))]
      : []),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * Real app-owned subprocess and qualified startup. This peer substitutes Python/GPU only; it
 * captures actual requests and returns fixture pixels through the client's actual JSONL parser.
 */
async function withFixture(run: (fixture: Fixture) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-inference-target-'))
  const runtimeRoot = path.join(root, 'runtime')
  const scratchBasePath = path.join(root, 'scratch')
  await mkdir(runtimeRoot)
  await mkdir(scratchBasePath)
  const pythonExecutable = path.join(runtimeRoot, 'python')
  const script = String.raw`#!${process.execPath}
const fs = require('node:fs')
const crypto = require('node:crypto')
if (process.argv.slice(2).join(' ') !== '-I -m imagegen_worker.inference_main') process.exit(21)
if (process.env.HF_HUB_OFFLINE !== '1' || process.env.TRANSFORMERS_OFFLINE !== '1') process.exit(23)
const fault = process.env.PEER_FAULT || ''
if (process.env.PEER_PID_MARKER) fs.writeFileSync(process.env.PEER_PID_MARKER, String(process.pid))
process.on('SIGTERM', () => process.exit(0))
process.stdout.write(JSON.stringify({
  type: 'ready', protocolVersion: '1', workerVersion: '0.2.0',
  runtimeProfile: 'linux-nvidia', pythonVersion: '3.12.13',
  capabilities: ['illustrious-txt2img', ...(fault === 'no-target-capability' ? [] : ['target-composition'])]
}) + '\n')
process.stdin.setEncoding('utf8')
let input = ''
process.stdin.on('data', chunk => {
  input += chunk
  while (input.includes('\n')) {
    const newline = input.indexOf('\n')
    const request = JSON.parse(input.slice(0, newline)); input = input.slice(newline + 1)
    fs.appendFileSync(process.env.PEER_REQUEST_MARKER, JSON.stringify(request) + '\n')
    if (fault === 'hang') continue
    const respond = () => {
      let response
      if (request.type === 'compose-target') {
        const bytes = Buffer.from(process.env.PEER_PNG, 'base64')
        fs.writeFileSync(request.output.targetPngPath, bytes)
        response = {
          type: 'target-done', protocolVersion: '1', requestId: request.requestId,
          mode: process.env.PEER_TARGET_MODE || 'txt2img', rect: {...request.bbox},
          composite: {
            byteSize: bytes.length, colorSpace: 'srgb',
            width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20),
            sha256: crypto.createHash('sha256').update(bytes).digest('hex')
          }
        }
        if (fault === 'false-alpha') response.mode = 'img2img'
        if (fault === 'false-hash') response.composite.sha256 = '0'.repeat(64)
        if (fault === 'wrong-rect') response.rect.x += 1
        if (fault === 'wrong-dimension-metadata') response.composite.width += 1
        if (fault === 'invalid-mode') response.mode = 'inpaint'
        // Keep otherwise-valid target fields: a missing type guard cannot pass by coincidence
        // merely because the shared output validator rejects an incomplete alternate DTO.
        if (fault === 'wrong-type') {
          response.type = 'generation-done'
          response.outputPath = request.output.targetPngPath
          response.seed = 0
        }
      } else if (request.type === 'generate-illustrious-txt2img') {
        response = {
          type: 'generation-done', protocolVersion: '1', requestId: request.requestId,
          outputPath: request.job.output.pngPath, seed: 4294967295
        }
        if (fault === 'target-for-generation') {
          response.type = 'target-done'
          response.mode = 'txt2img'
          response.rect = request.job.bbox
          response.composite = {}
        }
      } else process.exit(22)
      if (fault === 'wrong-id') response.requestId = '00000000-0000-4000-8000-000000000000'
      if (fault === 'worker-error') response = {
        type:'error', protocolVersion:'1', requestId:request.requestId,
        code:'INPUT_HASH_MISMATCH', message:'Input changed.'
      }
      process.stdout.write(JSON.stringify(response) + '\n')
    }
    if (process.env.PEER_RELEASE_MARKER) {
      const timer = setInterval(() => {
        if (fs.existsSync(process.env.PEER_RELEASE_MARKER)) { clearInterval(timer); respond() }
      }, 5)
    } else respond()
  }
})
`
  await writeFile(pythonExecutable, script)
  await chmod(pythonExecutable, 0o700)
  const profile = await readFile(
    path.join(REPOSITORY_ROOT, 'worker-python/src/imagegen_worker/srgb.icc'),
  )
  try {
    await run({
      location: { pythonExecutable, runtimeRoot, scratchBasePath },
      profile,
      requestMarker: path.join(root, 'peer-requests.jsonl'),
      root,
    })
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

function peerOptions(
  fixture: Fixture,
  png: Buffer,
  mode: ComposeTargetMode = 'txt2img',
  environment: Record<string, string> = {},
) {
  return {
    environment: {
      PEER_PNG: png.toString('base64'),
      PEER_REQUEST_MARKER: fixture.requestMarker,
      PEER_TARGET_MODE: mode,
      ...environment,
    },
    requestTimeoutMs: 2000,
    shutdownWaitMs: 100,
    startupTimeoutMs: 2000,
  }
}

async function targetInput(fixture: Fixture): Promise<ComposeTargetInput> {
  const stagingRoot = await mkdtemp(path.join(fixture.location.scratchBasePath, 'target-'))
  return {
    bbox: { height: 2, width: 2, x: -7, y: 11 },
    layers: [],
    stagingRoot,
    targetPngPath: path.join(stagingRoot, 'target.png'),
  }
}

async function capturedRequests(fixture: Fixture): Promise<PeerRequest[]> {
  if (!existsSync(fixture.requestMarker)) {
    return []
  }
  return (await readFile(fixture.requestMarker, 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as PeerRequest)
}

async function waitForRequest(fixture: Fixture): Promise<PeerRequest> {
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    const requests = await capturedRequests(fixture)
    if (requests.length > 0) {
      return requests[0]
    }
    await delay(5)
  }
  assert.fail('The actual child did not witness a request')
}

async function sourceLayer(fixture: Fixture): Promise<ComposeTargetInput['layers'][number]> {
  const bytes = rgbaPng(fixture.profile, [255, 255, 255, 255])
  const sourcePath = path.join(fixture.root, 'source.png')
  await writeFile(sourcePath, bytes)
  return {
    blendMode: 'normal',
    height: 2,
    opacity: 1,
    path: sourcePath,
    sha256: sha256(bytes),
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -7, y: 11 },
    width: 2,
  }
}

/** A transport control, with ML/model loading still supplied by the same controlled peer. */
async function generationRequest(fixture: Fixture): Promise<IllustriousTxt2ImgRequestV1> {
  const stagingRoot = await mkdtemp(path.join(fixture.location.scratchBasePath, 'generation-'))
  const target = rgbaPng(
    fixture.profile,
    Array.from({ length: 64 * 64 }, () => 0),
    64,
    64,
  )
  const targetPath = path.join(stagingRoot, 'target.png')
  const checkpoint = Buffer.from('controlled peer checkpoint')
  const checkpointPath = path.join(fixture.root, 'checkpoint.safetensors')
  await writeFile(targetPath, target)
  await writeFile(checkpointPath, checkpoint)
  return {
    job: {
      bbox: { height: 64, width: 64, x: 0, y: 0 },
      checkpoint: { path: checkpointPath, predictionType: 'epsilon', sha256: sha256(checkpoint) },
      output: { pngPath: path.join(stagingRoot, 'result.png'), stagingRoot },
      prompts: { negative: '', positive: 'transport control' },
      sampling: { cfgScale: 5, scheduler: 'euler_a', seed: 0, steps: 20 },
      schemaVersion: 1,
      target: {
        byteSize: target.length,
        height: 64,
        iccSha256: IGS_SRGB_ICC_SHA256,
        path: targetPath,
        sha256: sha256(target),
        width: 64,
      },
    },
    protocolVersion: '1',
    requestId: randomUUID(),
    type: 'generate-illustrious-txt2img',
  }
}

function expectGenerationDone(response: unknown, request: IllustriousTxt2ImgRequestV1): void {
  assert.deepEqual(response, {
    outputPath: request.job.output.pngPath,
    protocolVersion: '1',
    requestId: request.requestId,
    seed: 0xff_ff_ff_ff,
    type: 'generation-done',
  })
}

test('inference target client verifies actual transparent, partial and opaque RGBA pixels', async () => {
  await withFixture(async (fixture) => {
    for (const [alphas, mode] of [
      [[0, 0, 0, 0], 'txt2img'],
      [[255, 0, 255, 0], 'outpaint'],
      [[255, 128, 255, 255], 'outpaint'],
      [[255, 255, 255, 255], 'img2img'],
    ] as const) {
      const png = rgbaPng(fixture.profile, alphas)
      const client = await GenerationWorkerClient.start(
        fixture.location,
        peerOptions(fixture, png, mode),
      )
      try {
        const input = await targetInput(fixture)
        const result = await client.composeTarget(input)
        assert.deepEqual(result, {
          composite: {
            byteSize: png.length,
            colorSpace: 'srgb',
            height: 2,
            iccSha256: IGS_SRGB_ICC_SHA256,
            path: input.targetPngPath,
            sha256: sha256(png),
            width: 2,
          },
          mode,
          rect: input.bbox,
        })
        assert.deepEqual(await readFile(result.composite.path), png)
      } finally {
        await client.close()
      }
    }
  })
})

test('inference target client rejects dishonest pixels, hash, ICC, rect and dimensions', async () => {
  await withFixture(async (fixture) => {
    const target = rgbaPng(fixture.profile, [0, 0, 0, 0])
    const foreignProfile = await readFile(
      path.join(REPOSITORY_ROOT, 'worker-python/tests/fixtures/AdobeRGB1998.icc'),
    )
    for (const [fault, png, expectedCode] of [
      ['false-alpha', target, 'OUTPUT_MISMATCH'],
      ['false-hash', target, 'OUTPUT_MISMATCH'],
      ['wrong-rect', target, 'OUTPUT_MISMATCH'],
      ['wrong-dimension-metadata', target, 'OUTPUT_MISMATCH'],
      [
        'different-png-dimensions',
        rgbaPng(fixture.profile, [0, 0, 0, 0, 0, 0], 3, 2),
        'OUTPUT_MISMATCH',
      ],
      ['missing-icc', rgbaPng(null, [0, 0, 0, 0]), 'OUTPUT_MISMATCH'],
      ['foreign-icc', rgbaPng(foreignProfile, [0, 0, 0, 0]), 'OUTPUT_MISMATCH'],
      ['invalid-mode', target, 'PROTOCOL_ERROR'],
    ] as const) {
      const client = await GenerationWorkerClient.start(
        fixture.location,
        peerOptions(fixture, png, 'txt2img', { PEER_FAULT: fault }),
      )
      try {
        await assert.rejects(
          client.composeTarget(await targetInput(fixture)),
          { code: expectedCode },
          fault,
        )
        await assert.rejects(
          client.generate(await generationRequest(fixture)),
          { code: 'CLOSED' },
          fault,
        )
      } finally {
        await client.close()
      }
    }
  })
})

test('inference target and generation completions cannot cross request IDs or types', async () => {
  await withFixture(async (fixture) => {
    const png = rgbaPng(fixture.profile, [0, 0, 0, 0])
    for (const fault of ['wrong-id', 'wrong-type', 'target-for-generation']) {
      const client = await GenerationWorkerClient.start(
        fixture.location,
        peerOptions(fixture, png, 'txt2img', { PEER_FAULT: fault }),
      )
      try {
        const pending =
          fault === 'target-for-generation'
            ? client.generate(await generationRequest(fixture))
            : client.composeTarget(await targetInput(fixture))
        await assert.rejects(pending, { code: 'PROTOCOL_ERROR' }, fault)
        await assert.rejects(
          client.composeTarget(await targetInput(fixture)),
          { code: 'CLOSED' },
          fault,
        )
      } finally {
        await client.close()
      }
    }
  })
})

test('an older qualified inference peer refuses target capability before send and still generates', async () => {
  await withFixture(async (fixture) => {
    const png = rgbaPng(fixture.profile, [0, 0, 0, 0])
    const client = await GenerationWorkerClient.start(
      fixture.location,
      peerOptions(fixture, png, 'txt2img', { PEER_FAULT: 'no-target-capability' }),
    )
    try {
      assert.deepEqual(client.ready.capabilities, ['illustrious-txt2img'])
      await assert.rejects(client.composeTarget(await targetInput(fixture)), {
        code: 'WORKER_VERSION_MISMATCH',
      })
      const request = await generationRequest(fixture)
      expectGenerationDone(await client.generate(request), request)
      assert.deepEqual(
        (await capturedRequests(fixture)).map(({ type }) => type),
        ['generate-illustrious-txt2img'],
      )
    } finally {
      await client.close()
    }
  })
})

test('target input bounds, changed or missing source and unsafe outputs refuse before sending', async () => {
  await withFixture(async (fixture) => {
    const png = rgbaPng(fixture.profile, [0, 0, 0, 0])
    const client = await GenerationWorkerClient.start(fixture.location, peerOptions(fixture, png))
    try {
      const input = await targetInput(fixture)
      const layer = await sourceLayer(fixture)
      const missing = path.join(fixture.root, 'missing.png')
      const linked = path.join(fixture.root, 'linked.png')
      await symlink(layer.path, linked)
      for (const [badInput, code] of [
        [{ ...input, bbox: { ...input.bbox, width: 2049 } }, 'IMAGE_TOO_LARGE'],
        [{ ...input, bbox: { ...input.bbox, height: 2048, width: 2048 } }, 'IMAGE_TOO_LARGE'],
        [{ ...input, bbox: { ...input.bbox, x: 0.5 } }, 'INVALID_REQUEST'],
        [{ ...input, layers: [{ ...layer, sha256: '0'.repeat(64) }] }, 'INVALID_REQUEST'],
        [{ ...input, layers: [{ ...layer, path: missing }] }, 'INVALID_PATH'],
        [{ ...input, layers: [{ ...layer, path: linked }] }, 'INVALID_PATH'],
        [{ ...input, targetPngPath: path.join(fixture.root, 'escaped.png') }, 'INVALID_PATH'],
      ] as const) {
        await assert.rejects(client.composeTarget(badInput as ComposeTargetInput), { code })
      }
      const existing = await targetInput(fixture)
      await writeFile(existing.targetPngPath, png)
      await assert.rejects(client.composeTarget(existing), { code: 'INVALID_PATH' })
      const frozenSource = await readFile(layer.path)
      await writeFile(layer.path, rgbaPng(fixture.profile, [255, 128, 255, 255]))
      await assert.rejects(client.composeTarget({ ...input, layers: [layer] }), {
        code: 'INVALID_REQUEST',
      })
      await writeFile(layer.path, frozenSource)
      const valid = { ...input, layers: [layer] }
      await client.composeTarget(valid)
      const witnessed = await capturedRequests(fixture)
      assert.equal(witnessed.length, 1)
      assert.equal(witnessed[0].type, 'compose-target')
      assert.deepEqual(witnessed[0].bbox, valid.bbox)
      assert.deepEqual(witnessed[0].layers, valid.layers)
    } finally {
      await client.close()
    }
  })
})

test('inference target request owns bbox, layer and transform snapshots before asynchronous validation', async () => {
  await withFixture(async (fixture) => {
    const png = rgbaPng(fixture.profile, [255, 0, 255, 0])
    const client = await GenerationWorkerClient.start(
      fixture.location,
      peerOptions(fixture, png, 'outpaint'),
    )
    try {
      const input = await targetInput(fixture)
      input.layers = [await sourceLayer(fixture)]
      const expected = structuredClone(input)
      const pending = client.composeTarget(input)
      input.bbox.x = 900
      input.bbox.width = 3
      input.layers[0].transform.x = 700
      input.layers[0].opacity = 0
      input.layers[0].sha256 = '0'.repeat(64)
      input.layers[0].path = path.join(fixture.root, 'missing.png')
      input.layers.length = 0
      input.stagingRoot = fixture.root
      input.targetPngPath = path.join(fixture.root, 'changed-output.png')
      const result = await pending
      const request = await waitForRequest(fixture)
      assert.deepEqual(request.bbox, expected.bbox)
      assert.deepEqual(request.layers, expected.layers)
      assert.deepEqual(request.output, {
        stagingRoot: expected.stagingRoot,
        targetPngPath: expected.targetPngPath,
      })
      assert.deepEqual(result.rect, expected.bbox)
      assert.equal(result.composite.sha256, sha256(png))
    } finally {
      await client.close()
    }
  })
})

test('composition and generation share serial admission until a witnessed request finishes', async () => {
  for (const first of ['compose-target', 'generate-illustrious-txt2img'] as const) {
    await withFixture(async (fixture) => {
      const png = rgbaPng(fixture.profile, [0, 0, 0, 0])
      const releaseMarker = path.join(fixture.root, 'release')
      const client = await GenerationWorkerClient.start(
        fixture.location,
        peerOptions(fixture, png, 'txt2img', { PEER_RELEASE_MARKER: releaseMarker }),
      )
      try {
        const target = await targetInput(fixture)
        const generation = await generationRequest(fixture)
        const pending =
          first === 'compose-target' ? client.composeTarget(target) : client.generate(generation)
        const witnessed = await waitForRequest(fixture)
        assert.equal(witnessed.type, first)
        await assert.rejects(client.composeTarget(await targetInput(fixture)), { code: 'BUSY' })
        await assert.rejects(client.generate(await generationRequest(fixture)), { code: 'BUSY' })
        await writeFile(releaseMarker, 'release')
        await pending
        if (first === 'compose-target') {
          const next = await generationRequest(fixture)
          expectGenerationDone(await client.generate(next), next)
        } else {
          assert.equal((await client.composeTarget(await targetInput(fixture))).mode, 'txt2img')
        }
        assert.deepEqual(
          (await capturedRequests(fixture)).map(({ type }) => type),
          [first, first === 'compose-target' ? 'generate-illustrious-txt2img' : 'compose-target'],
        )
      } finally {
        await client.close()
      }
    })
  }
})

test('close rejects a witnessed composition and confirms the same child exit', async () => {
  await withFixture(async (fixture) => {
    const png = rgbaPng(fixture.profile, [0, 0, 0, 0])
    const pidMarker = path.join(fixture.root, 'peer-pid')
    const client = await GenerationWorkerClient.start(fixture.location, {
      ...peerOptions(fixture, png, 'txt2img', { PEER_FAULT: 'hang', PEER_PID_MARKER: pidMarker }),
      shutdownWaitMs: 2000,
    })
    try {
      const pending = client.composeTarget(await targetInput(fixture))
      const refused = assert.rejects(pending, { code: 'CLOSED' })
      assert.equal((await waitForRequest(fixture)).type, 'compose-target')
      const peerPid = Number(await readFile(pidMarker, 'utf8'))
      assert.ok(Number.isSafeInteger(peerPid) && peerPid > 0)
      await client.close()
      await refused
      // Graceful EOF and forced termination are both valid; verify OS exit, not a signal callback.
      assert.throws(() => process.kill(peerPid, 0), { code: 'ESRCH' })
      await assert.rejects(client.composeTarget(await targetInput(fixture)), { code: 'CLOSED' })
      assert.equal((await capturedRequests(fixture)).length, 1)
    } finally {
      await client.close()
    }
  })
})

test('target deadlines and correlated worker errors preserve their existing transport refusal', async () => {
  await withFixture(async (fixture) => {
    const png = rgbaPng(fixture.profile, [0, 0, 0, 0])
    for (const [fault, code] of [
      ['hang', 'REQUEST_TIMEOUT'],
      ['worker-error', 'WORKER_REQUEST_FAILED'],
    ] as const) {
      await rm(fixture.requestMarker, { force: true })
      const client = await GenerationWorkerClient.start(fixture.location, {
        ...peerOptions(fixture, png, 'txt2img', { PEER_FAULT: fault }),
        requestTimeoutMs: 100,
      })
      try {
        await assert.rejects(client.composeTarget(await targetInput(fixture)), (error: unknown) => {
          assert.ok(error instanceof GenerationWorkerError)
          assert.equal(error.code, code)
          if (fault === 'worker-error') {
            assert.equal(error.workerCode, 'INPUT_HASH_MISMATCH')
          }
          return true
        })
        assert.equal((await capturedRequests(fixture)).length, 1)
        await assert.rejects(client.generate(await generationRequest(fixture)), { code: 'CLOSED' })
      } finally {
        await client.close()
      }
    }
  })
})

test('an oversized composition envelope refuses before send and leaves generation usable', async () => {
  await withFixture(async (fixture) => {
    const png = rgbaPng(fixture.profile, [0, 0, 0, 0])
    const client = await GenerationWorkerClient.start(fixture.location, peerOptions(fixture, png))
    try {
      const input = await targetInput(fixture)
      const layer = await sourceLayer(fixture)
      const longSource = path.join(fixture.root, `${'source'.repeat(30)}.png`)
      await writeFile(longSource, await readFile(layer.path))
      input.layers = Array.from({ length: 256 }, () => ({
        ...structuredClone(layer),
        path: longSource,
      }))
      assert.ok(Buffer.byteLength(JSON.stringify(input), 'utf8') > 64 * 1024)
      await assert.rejects(client.composeTarget(input), { code: 'INVALID_REQUEST' })
      const generation = await generationRequest(fixture)
      expectGenerationDone(await client.generate(generation), generation)
      assert.deepEqual(
        (await capturedRequests(fixture)).map(({ type }) => type),
        ['generate-illustrious-txt2img'],
      )
      assert.equal(existsSync(input.targetPngPath), false)
    } finally {
      await client.close()
    }
  })
})

test('real Project preparation retains frozen bbox, draft and target bytes without document mutation', async () => {
  await withFixture(async (fixture) => {
    const dataRoot = path.join(fixture.root, 'app-data')
    await mkdir(dataRoot, { mode: 0o700 })
    const database = openAppDatabase(dataRoot, path.join(REPOSITORY_ROOT, 'src/main/db/migrations'))
    const repository = new ProjectIndexRepository(database.db)
    const shadow = new ProjectShadowStore(path.join(dataRoot, 'autosave'))
    const placeholdersDir = path.join(REPOSITORY_ROOT, 'src/main/projects/placeholders')
    const service = new ProjectService({
      autosaveOptions: { debounceMs: 0, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: fixture.location.scratchBasePath },
      shadow,
    })
    const targetBytes = rgbaPng(fixture.profile, [255, 255, 0, 255, 255, 0], 3, 2)
    const releaseMarker = path.join(fixture.root, 'release')
    const client = await GenerationWorkerClient.start(
      fixture.location,
      peerOptions(fixture, targetBytes, 'outpaint', { PEER_RELEASE_MARKER: releaseMarker }),
    )
    try {
      const layerBytes = rgbaPng(fixture.profile, [255, 255, 255, 255])
      const id = randomUUID()
      const memberPath = `assets/layers/${id}.png`
      const document = createEmptyProjectDocumentV1({ title: 'Inference target integration' })
      document.primaryBbox = { height: 2, width: 3, x: -7, y: 11 }
      document.generationDraft.positivePrompt.text = 'frozen lantern'
      document.generationDraft.seed = { policy: 'fixed', value: 0 }
      document.layers = [
        {
          asset: {
            bytes: layerBytes.length,
            height: 2,
            path: memberPath,
            sha256: sha256(layerBytes),
            width: 2,
          },
          blendMode: 'normal',
          id,
          kind: 'raster',
          locked: false,
          name: 'Visible raster',
          opacity: 1,
          transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -7, y: 11 },
          visible: true,
        },
      ]
      const externalPath = path.join(fixture.root, 'source.igs')
      await saveIgsPackage(externalPath, {
        assets: { [memberPath]: { bytes: layerBytes } },
        preview: {
          ...(await readProjectPlaceholders(placeholdersDir, 'unavailable')),
          rect: document.primaryBbox,
          status: 'unavailable',
        },
        project: document,
      })
      const selection = await service.selectImport(externalPath)
      assert.equal(selection.kind, 'transfer-required')
      if (selection.kind !== 'transfer-required') {
        assert.fail('Expected real Project import selection')
      }
      const imported = await service.finishImport(selection.importId, 'copy')
      assert.equal(imported.result.kind, 'opened')
      if (imported.result.kind !== 'opened') {
        assert.fail('Expected imported Project to open')
      }
      const tabId = imported.result.tab.id
      const savedPath = (await repository.listProjects())[0].canonicalPath
      const savedBytes = await readFile(savedPath)
      const frozenDocument = structuredClone(service.getOpenDocumentForAcceptance(tabId)!.document)
      const originalTab = service.getOpenTabs()[0]
      const originalShadow = await shadow.inspect({
        projectPath: savedPath,
        savedPackage: await readIgsPackage(savedPath),
      })
      const pending = service.prepareNormalGenerationInput(tabId, client)
      // Cleanup can close the real child if a later assertion fails before this promise is awaited.
      void pending.catch(() => undefined)
      const witnessed = await waitForRequest(fixture)
      assert.equal(witnessed.type, 'compose-target')
      assert.deepEqual(service.getOpenDocumentForAcceptance(tabId)!.document, frozenDocument)
      assert.deepEqual(service.getOpenTabs()[0], originalTab)
      assert.deepEqual(
        await shadow.inspect({
          projectPath: savedPath,
          savedPackage: await readIgsPackage(savedPath),
        }),
        originalShadow,
      )
      assert.deepEqual(witnessed.bbox, frozenDocument.primaryBbox)
      const layers = witnessed.layers as ComposeTargetInput['layers']
      assert.equal(layers.length, 1)
      assert.deepEqual(layers[0].transform, requireRasterLayer(frozenDocument.layers[0]).transform)
      assert.equal(layers[0].sha256, sha256(layerBytes))
      assert.deepEqual(await readFile(layers[0].path), layerBytes)

      // These are explicit independent edits; preparation must return its preceding snapshot.
      await service.updateGenerationDraft(tabId, { kind: 'positive-prompt', text: 'later prompt' })
      await service.setPrimaryBbox(tabId, { height: 2, width: 2, x: 50, y: 50 })
      await service.flushAutosave(tabId)
      const afterEdits = structuredClone(service.getOpenDocumentForAcceptance(tabId)!.document)
      const afterEditsTab = service.getOpenTabs()[0]
      const afterEditsShadow = await shadow.inspect({
        projectPath: savedPath,
        savedPackage: await readIgsPackage(savedPath),
      })
      assert.equal(afterEditsShadow.status, 'recoverable')
      await writeFile(releaseMarker, 'release')
      const target = await pending
      assert.deepEqual(target.bbox, frozenDocument.primaryBbox)
      assert.deepEqual(target.generationDraft, frozenDocument.generationDraft)
      assert.equal(target.documentId, frozenDocument.documentId)
      assert.equal(target.documentRevision, frozenDocument.documentRevision)
      assert.equal(target.mode, 'outpaint')
      assert.deepEqual(target.composite.bytes, targetBytes)
      assert.equal(target.composite.byteSize, targetBytes.length)
      assert.equal(target.composite.sha256, sha256(targetBytes))
      assert.equal(target.composite.iccSha256, IGS_SRGB_ICC_SHA256)
      assert.deepEqual(service.getOpenDocumentForAcceptance(tabId)!.document, afterEdits)
      assert.deepEqual(service.getOpenTabs()[0], afterEditsTab)
      assert.deepEqual(
        await shadow.inspect({
          projectPath: savedPath,
          savedPackage: await readIgsPackage(savedPath),
        }),
        afterEditsShadow,
      )
      assert.deepEqual(await readFile(savedPath), savedBytes)
      assert.deepEqual((await readIgsPackage(savedPath)).project, frozenDocument)
      assert.deepEqual(
        await database.db.selectFrom('generation_queue_item').selectAll().execute(),
        [],
      )
      assert.equal(
        (await readdir(fixture.location.scratchBasePath)).some((name) =>
          name.startsWith('project-target-'),
        ),
        false,
      )
      await service.discardAndClose(tabId)
    } finally {
      await client.close()
      for (const tab of service.getOpenTabs()) {
        await service.discardAndClose(tab.id)
      }
      await database.close()
    }
  })
})
