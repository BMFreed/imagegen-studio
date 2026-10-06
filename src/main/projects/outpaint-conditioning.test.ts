import {
  IGS_GENERATION_PNG_MAX_BYTES,
  IGS_SAFETY_CEILINGS,
  type IgsRectV1,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { crc32, deflateSync } from 'node:zlib'

import { freezeAlphaOutpaintConditioning } from './outpaint-conditioning.js'
import { classifyTargetPngAlpha, decodeTargetPngAlpha } from './target-png-mode.js'

const EXPECTED_ALPHA = Buffer.from([0, 128, 255, 1, 64, 254])
const OUTPAINT_ROWS = Array.from({ length: 8 }, () => [0, 128, 255, 1, 64, 254, 0, 255])
const OUTPAINT_ALPHA = Buffer.from(OUTPAINT_ROWS.flat())
const BBOX: IgsRectV1 = { height: 8, width: 8, x: -20, y: 40 }
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

// Independent wire fixtures for the same two source rows. The fixture does not implement a PNG
// predictor or derive expected pixels using the production decoder. RGB filter bytes are all zero.
const FILTERED_ALPHA_ROWS = [
  [
    [0, 128, 255],
    [1, 64, 254],
  ],
  [
    [0, 128, 127],
    [1, 63, 190],
  ],
  [
    [0, 128, 255],
    [1, 192, 255],
  ],
  [
    [0, 128, 191],
    [1, 0, 95],
  ],
  [
    [0, 128, 127],
    [1, 192, 126],
  ],
] as const

test('real alpha decoder preserves independently specified soft coverage for all five PNG filters', async (t) => {
  for (const [filter, rows] of FILTERED_ALPHA_ROWS.entries()) {
    await t.test(`PNG filter ${filter}`, () => {
      const targetPngBytes = filteredPng(rows, filter)
      assert.deepEqual(decodeTargetPngAlpha(targetPngBytes, 3, 2), EXPECTED_ALPHA)
      assert.equal(classifyTargetPngAlpha(targetPngBytes, 3, 2), 'outpaint')
    })
  }
})

test('actual outpaint factory preserves raw keep coverage and freezes exact Invoke and LaMa identities', () => {
  const targetPngBytes = filteredPng(OUTPAINT_ROWS, 0)
  const sourceTargetSha256 = sha256(targetPngBytes)
  const prepared = freezeAlphaOutpaintConditioning({
    bbox: BBOX,
    sourceTargetSha256,
    targetPngBytes,
  })
  assert.deepEqual(prepared.keepMaskBytes, OUTPAINT_ALPHA)
  assert.deepEqual(prepared.targetPngBytes, targetPngBytes)
  assert.deepEqual(prepared.context, {
    bbox: BBOX,
    infillResource: {
      byteSize: 205_669_692,
      role: 'outpaint-infill',
      sha256: '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9',
    },
    keepMask: {
      byteSize: 64,
      format: 'alpha8',
      height: 8,
      polarity: 'keep',
      sha256: sha256(OUTPAINT_ALPHA),
      width: 8,
    },
    kind: 'alpha-outpaint-conditioning',
    policy: {
      edgeRadius: 16,
      fadeDistance: 16,
      infillMethod: 'lama',
      maskBlur: 'gaussian-weighted-max',
      minimumDenoise: 0,
      outputMode: 'contribution',
      version: 1,
    },
    schemaVersion: 1,
    sourceTarget: {
      byteSize: targetPngBytes.length,
      format: 'png',
      height: 8,
      sha256: sourceTargetSha256,
      width: 8,
    },
  })
})

test('real decoder and existing classifier retain exact transparent, opaque and partial-alpha neighbors', async (t) => {
  for (const [name, rows, expectedMode] of [
    [
      'transparent',
      [
        [0, 0, 0],
        [0, 0, 0],
      ],
      'txt2img',
    ],
    [
      'opaque',
      [
        [255, 255, 255],
        [255, 255, 255],
      ],
      'img2img',
    ],
    [
      'mixed binary alpha',
      [
        [0, 255, 0],
        [255, 0, 255],
      ],
      'outpaint',
    ],
    [
      'uniform soft alpha',
      [
        [128, 128, 128],
        [128, 128, 128],
      ],
      'outpaint',
    ],
    [
      'almost transparent',
      [
        [1, 1, 1],
        [1, 1, 1],
      ],
      'outpaint',
    ],
    [
      'almost opaque',
      [
        [254, 254, 254],
        [254, 254, 254],
      ],
      'outpaint',
    ],
  ] as const) {
    await t.test(name, () => {
      const targetPngBytes = filteredPng(rows, 0)
      assert.equal(classifyTargetPngAlpha(targetPngBytes, 3, 2), expectedMode)
      assert.deepEqual(decodeTargetPngAlpha(targetPngBytes, 3, 2), Buffer.from(rows.flat()))
    })
  }
})

test('actual outpaint factory rejects normal modes and preserves soft coverage on its execution grid', async (t) => {
  for (const [name, row, expectedMode] of [
    ['transparent', [0, 0, 0, 0, 0, 0, 0, 0], 'txt2img'],
    ['opaque', [255, 255, 255, 255, 255, 255, 255, 255], 'img2img'],
    ['binary mixed', [0, 255, 0, 255, 0, 255, 0, 255], 'outpaint'],
    ['uniform soft', [128, 128, 128, 128, 128, 128, 128, 128], 'outpaint'],
    ['almost transparent', [1, 1, 1, 1, 1, 1, 1, 1], 'outpaint'],
    ['almost opaque', [254, 254, 254, 254, 254, 254, 254, 254], 'outpaint'],
  ] as const) {
    await t.test(name, () => {
      const rows = Array.from({ length: 8 }, () => row)
      const targetPngBytes = filteredPng(rows, 0)
      const input = { bbox: BBOX, sourceTargetSha256: sha256(targetPngBytes), targetPngBytes }
      if (expectedMode === 'outpaint') {
        assert.deepEqual(
          freezeAlphaOutpaintConditioning(input).keepMaskBytes,
          Buffer.from(rows.flat()),
        )
      } else {
        assert.throws(
          () => freezeAlphaOutpaintConditioning(input),
          /requires a partially transparent target/,
        )
      }
    })
  }
})

test('outpaint factory owns source and mask bytes and freezes nested identities before retained caller mutations', () => {
  const targetPngBytes = filteredPng(OUTPAINT_ROWS, 0)
  const originalPng = Buffer.from(targetPngBytes)
  const bbox = { ...BBOX }
  const input = { bbox, sourceTargetSha256: sha256(targetPngBytes), targetPngBytes }
  const first = freezeAlphaOutpaintConditioning(input)
  const second = freezeAlphaOutpaintConditioning(input)
  const originalContext = structuredClone(first.context)
  targetPngBytes.fill(0)
  bbox.x = 1000
  bbox.width = 1000
  input.sourceTargetSha256 = '0'.repeat(64)
  assert.deepEqual(first.targetPngBytes, originalPng)
  assert.deepEqual(first.keepMaskBytes, OUTPAINT_ALPHA)
  assert.deepEqual(first.context, originalContext)
  for (const object of [
    first.context,
    first.context.bbox,
    first.context.infillResource,
    first.context.keepMask,
    first.context.policy,
    first.context.sourceTarget,
  ]) {
    assert.equal(Object.isFrozen(object), true)
  }
  assert.equal(Reflect.set(first.context.bbox, 'x', 500), false)
  assert.equal(Reflect.set(first.context.policy, 'edgeRadius', 0), false)
  first.keepMaskBytes.fill(17)
  first.targetPngBytes.fill(23)
  assert.deepEqual(second.keepMaskBytes, OUTPAINT_ALPHA)
  assert.deepEqual(second.targetPngBytes, originalPng)
  assert.deepEqual(second.context, originalContext)
})

test('outpaint capture rejects wrong source SHA and invalid world-space bbox without repairing metadata', async (t) => {
  const targetPngBytes = filteredPng(OUTPAINT_ROWS, 0)
  const input = { bbox: { ...BBOX }, sourceTargetSha256: sha256(targetPngBytes), targetPngBytes }
  for (const [name, changed] of [
    ['wrong exact SHA', { ...input, sourceTargetSha256: '0'.repeat(64) }],
    ['noncanonical SHA', { ...input, sourceTargetSha256: input.sourceTargetSha256.toUpperCase() }],
    ['missing SHA', { ...input, sourceTargetSha256: '' }],
    ['fractional x', { ...input, bbox: { ...BBOX, x: 0.5 } }],
    ['nonfinite y', { ...input, bbox: { ...BBOX, y: Infinity } }],
    [
      'x beyond world bound',
      { ...input, bbox: { ...BBOX, x: IGS_SAFETY_CEILINGS.coordinateMagnitude + 1 } },
    ],
    [
      'y beyond negative bound',
      { ...input, bbox: { ...BBOX, y: -IGS_SAFETY_CEILINGS.coordinateMagnitude - 1 } },
    ],
    ['wrong aligned source width', { ...input, bbox: { ...BBOX, width: 16 } }],
    ['wrong aligned source height', { ...input, bbox: { ...BBOX, height: 16 } }],
  ] as const) {
    await t.test(name, () => assert.throws(() => freezeAlphaOutpaintConditioning(changed)))
  }
  const edgeBbox = {
    ...BBOX,
    x: IGS_SAFETY_CEILINGS.coordinateMagnitude,
    y: -IGS_SAFETY_CEILINGS.coordinateMagnitude,
  }
  assert.deepEqual(
    freezeAlphaOutpaintConditioning({ ...input, bbox: edgeBbox }).context.bbox,
    edgeBbox,
  )
})

test('outpaint factory refuses undersized and unaligned inference dimensions while decoder remains general', async (t) => {
  for (const [width, height] of [
    [3, 2],
    [7, 8],
    [8, 7],
    [9, 8],
    [8, 9],
    [8.5, 8],
    [8, NaN],
  ] as const) {
    await t.test(`${width}x${height}`, () => {
      const rows = Array.from(
        { length: Number.isSafeInteger(height) && height > 0 ? height : 8 },
        () =>
          Array.from({ length: Number.isSafeInteger(width) && width > 0 ? width : 8 }, () => 128),
      )
      const targetPngBytes = filteredPng(rows, 0)
      assert.throws(
        () =>
          freezeAlphaOutpaintConditioning({
            bbox: { ...BBOX, height, width },
            sourceTargetSha256: sha256(targetPngBytes),
            targetPngBytes,
          }),
        /8-pixel grid/,
      )
      assert.deepEqual(
        decodeTargetPngAlpha(targetPngBytes, rows[0].length, rows.length),
        Buffer.from(rows.flat()),
      )
    })
  }
})

test('real alpha decoder refuses malformed rows, RGBA headers, compressed streams and bounds', async (t) => {
  const valid = filteredPng(FILTERED_ALPHA_ROWS[0], 0)
  const badSignature = Buffer.from(valid)
  badSignature[0] = 0
  const rgbOnly = Buffer.from(valid)
  rgbOnly[25] = 2
  const wrongDepth = Buffer.from(valid)
  wrongDepth[24] = 16
  const interlaced = Buffer.from(valid)
  interlaced[28] = 1
  const cases: readonly [string, Buffer, number, number][] = [
    ['bad signature', badSignature, 3, 2],
    ['truncated PNG', valid.subarray(0, -20), 3, 2],
    ['RGB without alpha', rgbOnly, 3, 2],
    ['wrong bit depth', wrongDepth, 3, 2],
    ['interlaced rows', interlaced, 3, 2],
    ['unknown row filter', filteredPng(FILTERED_ALPHA_ROWS[0], 5), 3, 2],
    ['missing pixel chunks', pngWithIdat(null), 3, 2],
    ['invalid compression', pngWithIdat(Buffer.from('invalid zlib stream')), 3, 2],
    ['short decompressed rows', pngWithIdat(deflateSync(Buffer.alloc(25))), 3, 2],
    ['excess decompressed rows', pngWithIdat(deflateSync(Buffer.alloc(27))), 3, 2],
    ['zero width', valid, 0, 2],
    ['negative height', valid, 3, -1],
    ['fractional width', valid, 3.5, 2],
    ['nonfinite height', valid, 3, NaN],
    ['side beyond 2048', valid, 2049, 2],
    ['pixel count beyond 4 million', valid, 2048, 2048],
    ['wrong declared geometry', valid, 2, 2],
  ]
  for (const [name, bytes, width, height] of cases) {
    await t.test(name, () => assert.throws(() => decodeTargetPngAlpha(bytes, width, height)))
  }
})

test('source PNG byte ceiling applies before factory copying or alpha decoding', () => {
  const oversized = Buffer.alloc(IGS_GENERATION_PNG_MAX_BYTES + 1)
  assert.throws(() => decodeTargetPngAlpha(oversized, 3, 2), /bounded PNG decoder limits/)
  assert.throws(
    () =>
      freezeAlphaOutpaintConditioning({
        bbox: BBOX,
        sourceTargetSha256: sha256(oversized),
        targetPngBytes: oversized,
      }),
    /bounded PNG buffer/,
  )
})

test('decoded alpha is detached from original PNG and other decoder calls', () => {
  const bytes = filteredPng(FILTERED_ALPHA_ROWS[0], 0)
  const first = decodeTargetPngAlpha(bytes, 3, 2)
  const second = decodeTargetPngAlpha(bytes, 3, 2)
  bytes.fill(0)
  first.fill(255)
  assert.deepEqual(second, EXPECTED_ALPHA)
})

function filteredPng(rows: readonly (readonly number[])[], filter: number): Buffer {
  const width = rows[0].length
  const rowSize = width * 4 + 1
  const filtered = Buffer.alloc(rowSize * rows.length)
  for (const [row, values] of rows.entries()) {
    assert.equal(values.length, width)
    const offset = row * rowSize
    filtered[offset] = filter
    for (const [column, value] of values.entries()) {
      filtered[offset + 1 + column * 4 + 3] = value
    }
  }
  return pngWithIdat(deflateSync(filtered), width, rows.length)
}

function pngWithIdat(idat: Buffer | null, width = 3, height = 2): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  const chunks = [chunk('IHDR', header)]
  if (idat) {
    const split = Math.floor(idat.length / 2)
    chunks.push(chunk('IDAT', idat.subarray(0, split)), chunk('IDAT', idat.subarray(split)))
  }
  chunks.push(chunk('IEND', Buffer.alloc(0)))
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), ...chunks])
}

function chunk(tag: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8)
  header.writeUInt32BE(payload.length)
  header.write(tag, 4, 'ascii')
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([Buffer.from(tag, 'ascii'), payload])))
  return Buffer.concat([header, payload, checksum])
}
