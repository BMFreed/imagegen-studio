import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { inflateSync } from 'node:zlib'

import type { SmartPatchWorldContributionInput } from './project-smart-patch-world-output.js'

import { composeSmartPatchWorldContribution } from './project-smart-patch-world-output.js'
import {
  literalSmartPatchColorPng,
  literalSmartPatchNumericPng,
} from './test-fixtures/smart-patch-input-material.js'
import { ProjectWorkerClient } from './worker-client.js'

const ROOT = path.resolve(import.meta.dirname, '../../..')
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
const ALPHAS = [0, 1, 64, 128, 254, 255]

/** Independent PNG pixel reader, not a resize/composition implementation or an output oracle. */
function actualRgba(png: Buffer, width: number, height: number): Buffer {
  assert.equal(png.readUInt32BE(16), width)
  assert.equal(png.readUInt32BE(20), height)
  assert.equal(png[24], 8)
  assert.equal(png[25], 6)
  const compressed: Buffer[] = []
  let offset = 8
  let actualProfile: Buffer | undefined
  while (offset + 12 <= png.length) {
    const size = png.readUInt32BE(offset)
    const tag = png.toString('ascii', offset + 4, offset + 8)
    const bytes = png.subarray(offset + 8, offset + 8 + size)
    if (tag === 'IDAT') {
      compressed.push(bytes)
    }
    if (tag === 'iCCP') {
      const separator = bytes.indexOf(0)
      assert.ok(separator > 0)
      assert.equal(bytes[separator + 1], 0)
      actualProfile = inflateSync(bytes.subarray(separator + 2), { maxOutputLength: 64 * 1024 })
    }
    offset += size + 12
  }
  assert.ok(actualProfile)
  assert.equal(digest(actualProfile), IGS_SRGB_ICC_SHA256)
  const rowBytes = width * 4
  const scanlines = inflateSync(Buffer.concat(compressed), {
    maxOutputLength: height * (rowBytes + 1),
  })
  assert.equal(scanlines.length, height * (rowBytes + 1))
  const pixels = Buffer.alloc(width * height * 4)
  for (let row = 0; row < height; row++) {
    const filter = scanlines[row * (rowBytes + 1)]
    assert.ok(filter <= 4)
    for (let column = 0; column < rowBytes; column++) {
      const at = row * rowBytes + column
      const left = column >= 4 ? pixels[at - 4] : 0
      const up = row > 0 ? pixels[at - rowBytes] : 0
      const upperLeft = row > 0 && column >= 4 ? pixels[at - rowBytes - 4] : 0
      let predictor = 0
      if (filter === 1) {
        predictor = left
      }
      if (filter === 2) {
        predictor = up
      }
      if (filter === 3) {
        predictor = Math.floor((left + up) / 2)
      }
      if (filter === 4) {
        const target = left + up - upperLeft
        const dl = Math.abs(target - left)
        const du = Math.abs(target - up)
        const dul = Math.abs(target - upperLeft)
        predictor = dl <= du && dl <= dul ? left : du <= dul ? up : upperLeft
      }
      pixels[at] = (scanlines[row * (rowBytes + 1) + 1 + column] + predictor) & 255
    }
  }
  return pixels
}

async function fixture(
  width: number,
  height: number,
  use: (value: {
    alpha: Buffer
    client: ProjectWorkerClient
    input: SmartPatchWorldContributionInput
    mask: Buffer
    stage: string
  }) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-patch-world-material-'))
  let client: ProjectWorkerClient | undefined
  try {
    const runtime = path.join(root, 'runtime')
    const scratch = path.join(root, 'scratch')
    const stage = path.join(scratch, 'queued-attempt')
    await mkdir(runtime, { mode: 0o700 })
    await mkdir(stage, { mode: 0o700, recursive: true })
    // The generated processing pixels are a declared input fixture; no native inference is
    // claimed. The CPU JSONL parser, image readers, compositor and exclusive publisher stay real.
    const rgb = literalSmartPatchColorPng(
      64,
      64,
      Array.from({ length: 64 * 64 }, () => [23, 47, 91]).flat(),
      3,
    )
    const alpha = Buffer.from(
      Array.from({ length: width * height }, (_, index) => ALPHAS[index % ALPHAS.length]),
    )
    const mask = literalSmartPatchNumericPng([...alpha], width, height)
    const imagePath = path.join(stage, 'model-result.png')
    const contributionMaskPath = path.join(stage, 'final-contribution-mask.png')
    await writeFile(imagePath, rgb, { flag: 'wx', mode: 0o600 })
    await writeFile(contributionMaskPath, mask, { flag: 'wx', mode: 0o600 })
    const executable = path.join(runtime, 'python')
    await writeFile(
      executable,
      `#!${path.join(ROOT, 'worker-python/.venv/bin/python')}
import sys
assert sys.argv[1:] == ['-I', '-m', 'imagegen_worker']
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'worker-python/src'))})
from imagegen_worker.__main__ import main
raise SystemExit(main())
`,
      { mode: 0o700 },
    )
    await chmod(executable, 0o700)
    client = await ProjectWorkerClient.start(
      { pythonExecutable: executable, runtimeRoot: runtime, stagingBasePath: scratch },
      { requestTimeoutMs: 5000, shutdownWaitMs: 100 },
    )
    const admitted = client
    await use({
      alpha,
      client,
      input: {
        bbox: { height, width, x: -19, y: 37 },
        contributionMaskPath,
        finalContribution: { bytes: mask, height, sha256: digest(mask), width },
        image: {
          byteSize: rgb.length,
          colorSpace: 'srgb',
          height: 64,
          iccSha256: IGS_SRGB_ICC_SHA256,
          path: imagePath,
          sha256: digest(rgb),
          width: 64,
        },
        internalResolution: { height: 64, width: 64 },
        outputPngPath: path.join(stage, 'world-result.png'),
        outputWorker: {
          composeSmartPatchOutput: (input) => admitted.composeSmartPatchOutput(input),
        },
        stagingRoot: stage,
      },
      mask,
      stage,
    })
  } finally {
    // A failed close deliberately prevents deleting files that a child could still access.
    await client?.close()
    await rm(root, { force: true, recursive: true })
  }
}

for (const size of [
  { height: 5, width: 7 },
  { height: 1, width: 1 },
]) {
  test(`narrow world composer returns actual ${size.width}x${size.height} CPU RGBA from processing RGB and final alpha only`, async () => {
    await fixture(size.width, size.height, async ({ alpha, input, mask }) => {
      const originalImage = await readFile(input.image.path)
      const result = await composeSmartPatchWorldContribution(input)
      assert.equal(result.width, size.width)
      assert.equal(result.height, size.height)
      assert.equal(result.byteSize, result.bytes.length)
      assert.equal(result.sha256, digest(result.bytes))
      assert.equal(result.iccSha256, IGS_SRGB_ICC_SHA256)
      const pixels = actualRgba(result.bytes, size.width, size.height)
      for (let index = 0; index < alpha.length; index++) {
        assert.ok(
          pixels.subarray(index * 4, index * 4 + 4).equals(Buffer.from([23, 47, 91, alpha[index]])),
          'Actual RGB survives independently of alpha, including underneath alpha0',
        )
      }
      assert.ok((await readFile(input.image.path)).equals(originalImage))
      assert.ok((await readFile(input.contributionMaskPath)).equals(mask))
      assert.deepEqual(input.bbox, { height: size.height, width: size.width, x: -19, y: 37 })
      assert.deepEqual(input.internalResolution, { height: 64, width: 64 })
    })
  })
}

test('narrow world composer owns metadata, mask bytes, paths and worker method before its first await', async () => {
  await fixture(7, 5, async ({ alpha, input, stage }) => {
    const expectedAlpha = Buffer.from(alpha)
    let lateMethodCalled = false
    const result = composeSmartPatchWorldContribution(input)
    input.bbox.width = 128
    input.internalResolution.width = 128
    input.image.path = path.join(stage, 'retargeted.png')
    input.image.sha256 = '0'.repeat(64)
    input.image.width = 128
    input.finalContribution.bytes.fill(0)
    input.finalContribution.sha256 = '0'.repeat(64)
    input.finalContribution.width = 128
    input.contributionMaskPath = path.join(stage, 'wrong-mask.png')
    input.outputPngPath = path.join(stage, 'wrong-result.png')
    input.stagingRoot = path.dirname(stage)
    input.outputWorker.composeSmartPatchOutput = async () => {
      lateMethodCalled = true
      throw new Error('The late output method must not run')
    }
    const completed = await result
    assert.equal(lateMethodCalled, false)
    assert.deepEqual([completed.width, completed.height], [7, 5])
    const pixels = actualRgba(completed.bytes, 7, 5)
    for (let index = 0; index < expectedAlpha.length; index++) {
      assert.equal(pixels[index * 4 + 3], expectedAlpha[index])
    }
  })
})

test('narrow world composer independently refuses truthful actual PNG metadata with wrong alpha outside the adapter', async () => {
  await fixture(7, 5, async ({ alpha, client, input }) => {
    const good = input.outputWorker.composeSmartPatchOutput
    let replaced = false
    input.outputWorker.composeSmartPatchOutput = async (request) => {
      const composed = await client.composeSmartPatchOutput(request)
      const bad = literalSmartPatchColorPng(
        7,
        5,
        Array.from(alpha).flatMap((value) => [23, 47, 91, 255 - value]),
        4,
      )
      await writeFile(request.pngPath, bad)
      replaced = true
      return { output: { ...composed.output, byteSize: bad.length, sha256: digest(bad) } }
    }
    await assert.rejects(composeSmartPatchWorldContribution(input), { code: 'OUTPUT_MISMATCH' })
    assert.equal(
      replaced,
      true,
      'A valid actual wrong-alpha PNG reached independent Main consumption',
    )
    await unlink(input.outputPngPath)
    input.outputWorker.composeSmartPatchOutput = good
    const control = await composeSmartPatchWorldContribution(input)
    const pixels = actualRgba(control.bytes, 7, 5)
    for (let index = 0; index < alpha.length; index++) {
      assert.equal(pixels[index * 4 + 3], alpha[index])
    }
  })
})

test('narrow world composer rejects processing dimensions differing from the frozen internal size before dispatch', async () => {
  await fixture(7, 5, async ({ input }) => {
    let dispatched = false
    input.internalResolution.width = 128
    input.outputWorker.composeSmartPatchOutput = async () => {
      dispatched = true
      throw new Error('The invalid processing size must not dispatch')
    }
    await assert.rejects(composeSmartPatchWorldContribution(input), { code: 'OUTPUT_MISMATCH' })
    assert.equal(dispatched, false)
  })
})

test('narrow world composer binds the actual staged numeric mask to its frozen bytes before dispatch', async () => {
  await fixture(7, 5, async ({ input, mask }) => {
    let dispatched = false
    input.finalContribution.bytes = literalSmartPatchNumericPng(
      Uint8Array.from({ length: 35 }, () => 255),
      7,
      5,
    )
    input.finalContribution.sha256 = digest(input.finalContribution.bytes)
    input.outputWorker.composeSmartPatchOutput = async () => {
      dispatched = true
      throw new Error('The crossed input mask must not dispatch')
    }
    await assert.rejects(composeSmartPatchWorldContribution(input), { code: 'OUTPUT_MISMATCH' })
    assert.equal(dispatched, false)
    assert.ok((await readFile(input.contributionMaskPath)).equals(mask))
  })
})
