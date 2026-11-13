import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { crc32, deflateSync } from 'node:zlib'

import { literalSmartPatchColorPng } from './test-fixtures/smart-patch-input-material.js'
import {
  type ComposeExportInput,
  type ComposeExportPayload,
  composeExportWithTransport,
  ProjectWorkerClient,
} from './worker-client.js'

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const rgba = (width = 2) =>
  literalSmartPatchColorPng(
    width,
    1,
    Array.from({ length: width }, () => [7, 11, 17, 255]).flat(),
    4,
  )

async function fixture(
  use: (input: ComposeExportInput, base: string, root: string) => Promise<void>,
) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-export-worker-'))
  try {
    const base = path.join(root, 'staging')
    const stagingRoot = path.join(base, 'request')
    await mkdir(stagingRoot, { recursive: true })
    const bytes = rgba()
    const sourcePath = path.join(root, 'source.png')
    await writeFile(sourcePath, bytes)
    const input: ComposeExportInput = {
      compositePngPath: path.join(stagingRoot, 'export.png'),
      layers: [
        {
          blendMode: 'normal',
          height: 1,
          opacity: 1,
          path: sourcePath,
          sha256: digest(bytes),
          transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -4, y: 3 },
          width: 2,
        },
      ],
      stagingRoot,
    }
    await use(input, base, root)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

async function rendered(
  payload: ComposeExportPayload,
  bytes = rgba(),
): Promise<Record<string, unknown>> {
  await writeFile(payload.output.compositePngPath, bytes, { flag: 'wx' })
  return {
    composite: {
      byteSize: bytes.length,
      colorSpace: 'srgb',
      height: 1,
      sha256: digest(bytes),
      width: 2,
    },
    rect: payload.bbox ?? { height: 1, width: 2, x: -4, y: 3 },
    status: 'rendered',
  }
}

test('exact content export verifies its nominated canonical RGBA file and rect', async () => {
  await fixture(async (input, base) => {
    const before = structuredClone(input)
    const result = await composeExportWithTransport(input, base, async (payload) => {
      assert.equal(Object.hasOwn(payload, 'bbox'), false)
      return rendered(payload)
    })
    assert.equal(result.status, 'rendered')
    assert.deepEqual(result.rect, { height: 1, width: 2, x: -4, y: 3 })
    assert.deepEqual(input, before)
    assert.equal(result.composite?.sha256, digest(await readFile(input.compositePngPath)))
  })
})

test('export bbox freezes caller inputs before awaits and preserves exact requested world rect', async () => {
  await fixture(async (input, base) => {
    input.bbox = { height: 1, width: 2, x: -10, y: 2 }
    const operation = composeExportWithTransport(input, base, async (payload) => {
      assert.deepEqual(payload.bbox, { height: 1, width: 2, x: -10, y: 2 })
      assert.equal(payload.layers[0].transform.x, -4)
      return rendered(payload)
    })
    input.bbox.x = 1000
    input.layers[0].transform.x = 1000
    assert.deepEqual((await operation).rect, { height: 1, width: 2, x: -10, y: 2 })
  })
})

test('export accepts full-resolution width above generation and preview limits', async () => {
  await fixture(async (input, base) => {
    const bytes = rgba(2051)
    input.layers[0].width = 2051
    input.layers[0].sha256 = digest(bytes)
    await writeFile(input.layers[0].path, bytes)
    const result = await composeExportWithTransport(input, base, async (payload) => {
      const response = await rendered(payload, bytes)
      return {
        ...response,
        composite: {
          byteSize: bytes.length,
          colorSpace: 'srgb',
          height: 1,
          sha256: digest(bytes),
          width: 2051,
        },
        rect: { height: 1, width: 2051, x: -4, y: 3 },
      }
    })
    assert.equal(result.composite?.width, 2051)
    assert.equal(result.rect?.width, 2051)
  })
})

for (const kind of [
  'wrong-rect',
  'downsampled',
  'false-sha',
  'extra-field',
  'invalid-status',
  'rgb',
  'wrong-icc',
] as const) {
  test(`export rejects ${kind} response at the verified consumer`, async () => {
    await fixture(async (input, base) => {
      input.bbox = { height: 1, width: 2, x: -4, y: 3 }
      await assert.rejects(
        composeExportWithTransport(input, base, async (payload) => {
          let bytes =
            kind === 'rgb'
              ? literalSmartPatchColorPng(2, 1, [7, 11, 17, 7, 11, 17], 3)
              : rgba(kind === 'downsampled' ? 1 : 2)
          if (kind === 'wrong-icc') {
            bytes = withIcc(
              bytes,
              await readFile(path.resolve('worker-python/tests/fixtures/AdobeRGB1998.icc')),
            )
          }
          const response = await rendered(payload, bytes)
          if (kind === 'wrong-rect') {
            response.rect = { ...payload.bbox!, x: 1 }
          }
          if (kind === 'downsampled') {
            ;(response.composite as Record<string, unknown>).width = 1
          }
          if (kind === 'false-sha') {
            ;(response.composite as Record<string, unknown>).sha256 = '0'.repeat(64)
          }
          if (kind === 'extra-field') {
            response.unexpected = true
          }
          if (kind === 'invalid-status') {
            response.status = 'ready'
          }
          return response
        }),
      )
    })
  })
}

for (const extraFile of [false, true]) {
  test(`empty export ${extraFile ? 'refuses unexpected files' : 'writes no artifact'}`, async () => {
    await fixture(async (input, base) => {
      const operation = composeExportWithTransport(input, base, async (payload) => {
        if (extraFile) {
          await writeFile(path.join(payload.output.stagingRoot, 'unexpected.tmp'), 'unexpected')
        }
        return { composite: null, rect: null, status: 'empty' }
      })
      if (extraFile) {
        await assert.rejects(operation, { code: 'OUTPUT_MISMATCH' })
      } else {
        assert.deepEqual(await operation, { composite: null, rect: null, status: 'empty' })
      }
    })
  })
}

for (const bbox of [
  { height: 1, width: 16_385, x: 0, y: 0 },
  { height: 8000, width: 8001, x: 0, y: 0 },
]) {
  test(`export refuses capacity ${bbox.width}x${bbox.height} before transport`, async () => {
    await fixture(async (input, base) => {
      input.bbox = bbox
      let called = false
      await assert.rejects(
        composeExportWithTransport(input, base, async () => {
          called = true
          return {}
        }),
        { code: 'IMAGE_TOO_LARGE' },
      )
      assert.equal(called, false)
    })
  })
}

test('changed frozen source is refused before transport even for empty output', async () => {
  await fixture(async (input, base) => {
    input.layers[0].sha256 = '0'.repeat(64)
    let called = false
    await assert.rejects(
      composeExportWithTransport(input, base, async () => {
        called = true
        return {}
      }),
      { code: 'INVALID_REQUEST' },
    )
    assert.equal(called, false)
  })
})

test('old CPU worker without explicit export capability refuses clearly without a request', async () => {
  await fixture(async (input, base, root) => {
    const runtimeRoot = path.join(root, 'runtime')
    await mkdir(runtimeRoot)
    const pythonExecutable = path.join(runtimeRoot, 'fake-python')
    await writeFile(
      pythonExecutable,
      `#!${process.execPath}\nprocess.stdout.write(JSON.stringify({type:'ready',protocolVersion:'1',workerVersion:'0.1.0',pythonVersion:'3.12.13',runtimeProfile:'derivatives-only',capabilities:['image-derivatives','import-normalization','self-test']})+'\\n');process.stdin.resume();process.stdin.on('data',()=>process.exit(23));`,
    )
    await chmod(pythonExecutable, 0o700)
    const client = await ProjectWorkerClient.start({
      pythonExecutable,
      runtimeRoot,
      stagingBasePath: base,
    })
    try {
      await assert.rejects(client.composeExport(input), { code: 'WORKER_VERSION_MISMATCH' })
    } finally {
      await client.close()
    }
  })
})

function withIcc(png: Buffer, profile: Buffer): Buffer {
  const chunks = [png.subarray(0, 8)]
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset)
    const next = offset + length + 12
    if (png.toString('ascii', offset + 4, offset + 8) === 'iCCP') {
      const data = Buffer.concat([Buffer.from('ICC\0\0'), deflateSync(profile)])
      const chunk = Buffer.alloc(data.length + 12)
      chunk.writeUInt32BE(data.length, 0)
      chunk.write('iCCP', 4)
      data.copy(chunk, 8)
      chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4)
      chunks.push(chunk)
    } else {
      chunks.push(png.subarray(offset, next))
    }
    offset = next
  }
  return Buffer.concat(chunks)
}
