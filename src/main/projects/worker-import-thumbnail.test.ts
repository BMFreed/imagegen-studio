import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { crc32, deflateSync } from 'node:zlib'

import { type ImportThumbnailInput, ProjectWorkerClient } from './worker-client.js'

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../../..')
const DEV_PYTHON = path.join(REPOSITORY_ROOT, 'worker-python/.venv/bin/python')
const SOURCE_WEBP = Buffer.from(
  'UklGRjoAAABXRUJQVlA4IC4AAADwAQCdASoCAAIAAUAmJaACdLoB+AAETAAA/q4X/0mzxNnibPkkf/OwbEu14AAA',
  'base64',
)
const digest = (data: Buffer): string => createHash('sha256').update(data).digest('hex')

function pngChunk(tag: string, data: Buffer): Buffer {
  const type = Buffer.from(tag)
  const header = Buffer.alloc(8)
  header.writeUInt32BE(data.length)
  type.copy(header, 4)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([type, data])))
  return Buffer.concat([header, data, checksum])
}

function canonicalPng(profile: Buffer | null, width = 2, height = 2): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  // Keep every pixel transparent; dimensions, rather than visible-alpha bounds, own the frame.
  const pixels = Buffer.alloc((width * 4 + 1) * height)
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    ...(profile
      ? [pngChunk('iCCP', Buffer.concat([Buffer.from('canonical\0\0'), deflateSync(profile)]))]
      : []),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function taggedWebp(profile: Buffer): Buffer {
  const extended = Buffer.alloc(18)
  extended.write('VP8X')
  extended.writeUInt32LE(10, 4)
  extended[8] = 0x20
  extended.writeUIntLE(1, 12, 3)
  extended.writeUIntLE(1, 15, 3)
  const icc = Buffer.alloc(8)
  icc.write('ICCP')
  icc.writeUInt32LE(profile.length, 4)
  const body = Buffer.concat([
    Buffer.from('WEBP'),
    extended,
    icc,
    profile,
    Buffer.alloc(profile.length & 1),
    SOURCE_WEBP.subarray(12),
  ])
  const header = Buffer.alloc(8)
  header.write('RIFF')
  header.writeUInt32LE(body.length, 4)
  return Buffer.concat([header, body])
}

async function withFixture(
  run: (fixture: {
    directory: string
    input: ImportThumbnailInput
    profile: Buffer
    pythonExecutable: string
    requestLog: string
    runtimeRoot: string
    source: Buffer
    stagingBasePath: string
  }) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), 'igs-import-thumbnail-'))
  try {
    const runtimeRoot = path.join(directory, 'runtime')
    const stagingBasePath = path.join(directory, 'staging')
    const stagingRoot = path.join(stagingBasePath, 'thumbnail')
    await mkdir(runtimeRoot)
    await mkdir(stagingRoot, { recursive: true })
    const profile = await readFile(
      path.join(REPOSITORY_ROOT, 'worker-python/src/imagegen_worker/srgb.icc'),
    )
    const source = canonicalPng(profile)
    const inputPath = path.join(directory, 'canonical.png')
    await writeFile(inputPath, source)
    const pythonExecutable = path.join(runtimeRoot, 'fake-python')
    await writeFile(
      pythonExecutable,
      String.raw`#!${process.execPath}
const fs = require('node:fs')
const crypto = require('node:crypto')
if (process.argv.slice(2).join(' ') !== '-I -m imagegen_worker') process.exit(21)
const mode = process.env.FAKE_MODE
process.stdout.write(JSON.stringify({
  type:'ready',protocolVersion:'1',workerVersion:'0.1.0',pythonVersion:'3.12.13',
  runtimeProfile:'derivatives-only',
  capabilities:['image-derivatives','import-normalization','self-test',
    ...(mode === 'legacy' ? [] : ['import-thumbnail'])]
}) + '\n')
require('node:readline').createInterface({input:process.stdin}).on('line', line => {
  const request = JSON.parse(line)
  fs.appendFileSync(process.env.REQUEST_LOG, line + '\n')
  if (request.type === 'self-test') {
    process.stdout.write(JSON.stringify({
      type:'self-test-result',protocolVersion:'1',requestId:request.requestId,
      runtimeProfile:'derivatives-only',
      checks:{pillowVersion:'12.2.0',imageCodecs:['PNG','WEBP'],colorConversion:'srgb'}
    }) + '\n')
    return
  }
  if (mode === 'source-changed') {
    fs.writeFileSync(request.input.path, 'changed after preflight')
    process.stdout.write(JSON.stringify({
      type:'error',protocolVersion:'1',requestId:request.requestId,
      code:'INPUT_HASH_MISMATCH',message:'Input image changed after it was frozen.'
    }) + '\n')
    return
  }
  const bytes = mode === 'oversize' ? Buffer.alloc(128001) :
    mode === 'corrupt' ? Buffer.from('not a WebP') : Buffer.from(process.env.THUMBNAIL, 'base64')
  fs.writeFileSync(request.output.thumbnailWebpPath, bytes, {flag:'wx'})
  const thumbnail = {
    byteSize:bytes.length,width:mode === 'false-dimensions' ? 129 : 2,height:2,
    sha256:mode === 'false-hash' ? '0'.repeat(64) : crypto.createHash('sha256').update(bytes).digest('hex'),
    colorSpace:'srgb'
  }
  process.stdout.write(JSON.stringify({
    type:mode === 'wrong-response' ? 'derivative-done' : 'import-thumbnail-done',
    protocolVersion:'1',requestId:request.requestId,thumbnail
  }) + '\n')
})
`,
    )
    await chmod(pythonExecutable, 0o700)
    await run({
      directory,
      input: {
        inputPath,
        inputSha256: digest(source),
        stagingRoot,
        thumbnailWebpPath: path.join(stagingRoot, 'thumbnail.webp'),
      },
      profile,
      pythonExecutable,
      requestLog: path.join(directory, 'requests.jsonl'),
      runtimeRoot,
      source,
      stagingBasePath,
    })
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

test('legacy readiness remains accepted; optional thumbnail capability refuses before I/O', async () => {
  await withFixture(async (fixture) => {
    const client = await ProjectWorkerClient.start(fixture, {
      environment: { FAKE_MODE: 'legacy', REQUEST_LOG: fixture.requestLog },
    })
    try {
      assert.equal(client.ready.workerVersion, '0.1.0')
      await assert.rejects(
        client.createImportThumbnail({
          ...fixture.input,
          inputPath: '/missing/canonical.png',
          stagingRoot: '/missing/stage',
        }),
        { code: 'WORKER_VERSION_MISMATCH' },
      )
      assert.equal(existsSync(fixture.requestLog), false)
      assert.equal((await client.selfTest()).pillowVersion, '12.2.0')
    } finally {
      await client.close()
    }
  })
})

test('client captures the request and verifies the nominated WebP through the existing validator', async () => {
  await withFixture(async (fixture) => {
    const thumbnail = taggedWebp(fixture.profile)
    const client = await ProjectWorkerClient.start(fixture, {
      environment: {
        FAKE_MODE: 'valid',
        REQUEST_LOG: fixture.requestLog,
        THUMBNAIL: thumbnail.toString('base64'),
      },
    })
    try {
      const captured = { ...fixture.input }
      const pending = client.createImportThumbnail(fixture.input)
      fixture.input.inputPath = '/mutated/source.png'
      fixture.input.thumbnailWebpPath = '/mutated/output.webp'
      const result = await pending
      assert.deepEqual(result, {
        byteSize: thumbnail.length,
        colorSpace: 'srgb',
        height: 2,
        iccSha256: IGS_SRGB_ICC_SHA256,
        path: captured.thumbnailWebpPath,
        sha256: digest(thumbnail),
        width: 2,
      })
      const request = JSON.parse(await readFile(fixture.requestLog, 'utf8'))
      assert.deepEqual(Object.keys(request).sort(), [
        'input',
        'output',
        'protocolVersion',
        'requestId',
        'type',
      ])
      assert.equal(request.type, 'create-import-thumbnail')
      assert.deepEqual(request.input, {
        colorSpace: 'srgb',
        path: captured.inputPath,
        sha256: captured.inputSha256,
      })
      assert.deepEqual(request.output, {
        stagingRoot: captured.stagingRoot,
        thumbnailWebpPath: captured.thumbnailWebpPath,
      })
      assert.ok((await readFile(captured.inputPath)).equals(fixture.source))
    } finally {
      await client.close()
    }
  })
})

for (const fault of [
  'unprofiled',
  'foreign-profile',
  'non-png',
  'hash',
  'corrupt',
  'source-link',
  'existing',
  'escape',
  'same-path',
] as const) {
  test(`client refuses ${fault} input/path before sending a thumbnail request`, async () => {
    await withFixture(async (fixture) => {
      const input = { ...fixture.input }
      switch (fault) {
        case 'corrupt':
        case 'non-png': {
          const source =
            fault === 'non-png' ? taggedWebp(fixture.profile) : Buffer.from('corrupt PNG')
          await writeFile(input.inputPath, source)
          input.inputSha256 = digest(source)

          break
        }
        case 'escape': {
          input.thumbnailWebpPath = path.join(fixture.directory, 'outside.webp')

          break
        }
        case 'existing': {
          await writeFile(input.thumbnailWebpPath, 'keep')

          break
        }
        case 'foreign-profile':
        case 'unprofiled': {
          const profile =
            fault === 'unprofiled'
              ? null
              : await readFile(
                  path.join(REPOSITORY_ROOT, 'worker-python/tests/fixtures/AdobeRGB1998.icc'),
                )
          const source = canonicalPng(profile)
          await writeFile(input.inputPath, source)
          input.inputSha256 = digest(source)

          break
        }
        case 'hash': {
          input.inputSha256 = '0'.repeat(64)

          break
        }
        case 'source-link': {
          const alias = path.join(fixture.directory, 'alias.png')
          await symlink(input.inputPath, alias)
          input.inputPath = alias

          break
        }
        default: {
          input.inputPath = input.thumbnailWebpPath
          await writeFile(input.inputPath, fixture.source)
        }
      }
      const client = await ProjectWorkerClient.start(fixture, {
        environment: { FAKE_MODE: 'valid', REQUEST_LOG: fixture.requestLog },
      })
      try {
        await assert.rejects(client.createImportThumbnail(input))
        assert.equal(existsSync(fixture.requestLog), false)
        if (fault === 'existing') {
          assert.equal(await readFile(input.thumbnailWebpPath, 'utf8'), 'keep')
        } else if (fault !== 'same-path') {
          assert.equal(existsSync(input.thumbnailWebpPath), false)
        }
      } finally {
        await client.close()
      }
    })
  })
}

for (const mode of [
  'false-hash',
  'false-dimensions',
  'corrupt',
  'oversize',
  'foreign-profile',
  'wrong-response',
  'upscale',
  'crop',
] as const) {
  test(`client refuses ${mode} thumbnail results with independently verified files`, async () => {
    await withFixture(async (fixture) => {
      const input = { ...fixture.input }
      if (mode === 'upscale' || mode === 'crop') {
        const source = canonicalPng(fixture.profile, mode === 'upscale' ? 1 : 4, 2)
        await writeFile(input.inputPath, source)
        input.inputSha256 = digest(source)
      }
      const profile =
        mode === 'foreign-profile'
          ? await readFile(
              path.join(REPOSITORY_ROOT, 'worker-python/tests/fixtures/AdobeRGB1998.icc'),
            )
          : fixture.profile
      const client = await ProjectWorkerClient.start(fixture, {
        environment: {
          FAKE_MODE: mode,
          REQUEST_LOG: fixture.requestLog,
          THUMBNAIL: taggedWebp(profile).toString('base64'),
        },
      })
      try {
        await assert.rejects(client.createImportThumbnail(input), {
          code: mode === 'wrong-response' ? 'PROTOCOL_ERROR' : 'OUTPUT_MISMATCH',
        })
      } finally {
        await client.close()
      }
    })
  })
}

test('worker source-change errors survive the client boundary without a fabricated thumbnail', async () => {
  await withFixture(async (fixture) => {
    const client = await ProjectWorkerClient.start(fixture, {
      environment: { FAKE_MODE: 'source-changed', REQUEST_LOG: fixture.requestLog },
    })
    try {
      await assert.rejects(client.createImportThumbnail(fixture.input), {
        code: 'WORKER_REQUEST_FAILED',
        workerCode: 'INPUT_HASH_MISMATCH',
      })
      assert.equal(existsSync(fixture.input.thumbnailWebpPath), false)
    } finally {
      await client.close()
    }
  })
})

function devRuntimeRoot(): string | null {
  if (!existsSync(DEV_PYTHON)) {
    return null
  }
  const original = DEV_PYTHON.split(path.sep)
  const resolved = realpathSync(DEV_PYTHON).split(path.sep)
  let shared = 0
  while (
    shared < original.length &&
    shared < resolved.length &&
    original[shared] === resolved[shared]
  ) {
    shared++
  }
  const root = original.slice(0, shared).join(path.sep) || path.sep
  return root === path.sep ? null : root
}

test(
  'real CPU client preserves a transparent canonical frame and legacy derivative refusal',
  {
    skip: !devRuntimeRoot(),
  },
  async () => {
    await withFixture(async (fixture) => {
      const client = await ProjectWorkerClient.start({
        pythonExecutable: DEV_PYTHON,
        runtimeRoot: devRuntimeRoot()!,
        stagingBasePath: fixture.stagingBasePath,
      })
      try {
        const result = await client.createImportThumbnail(fixture.input)
        assert.equal(result.width, 2)
        assert.equal(result.height, 2)
        assert.equal(result.iccSha256, IGS_SRGB_ICC_SHA256)
        assert.ok(result.byteSize <= 128_000)
        assert.equal(result.sha256, digest(await readFile(result.path)))
        assert.ok((await readFile(fixture.input.inputPath)).equals(fixture.source))
        await assert.rejects(
          client.deriveImage({
            ...fixture.input,
            mergedPngPath: path.join(fixture.input.stagingRoot, 'merged.png'),
            thumbnailMaxSide: 128,
            thumbnailWebpPath: path.join(fixture.input.stagingRoot, 'legacy.webp'),
          }),
          { workerCode: 'INPUT_COLOR_PROFILE' },
        )
        assert.deepEqual(await readdir(fixture.input.stagingRoot), ['thumbnail.webp'])
      } finally {
        await client.close()
      }
    })
  },
)
