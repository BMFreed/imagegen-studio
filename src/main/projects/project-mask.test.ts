import assert from 'node:assert/strict'
import test from 'node:test'
import { crc32, deflateSync, inflateSync } from 'node:zlib'

import { validateSrgbPngStream } from './igs-package.js'
import { applyProjectMaskEdit, decodeProjectMaskPng, encodeProjectMaskPng } from './project-mask.js'

test('one-pixel brush at an integer corner paints four world samples, with independent owned bytes', () => {
  const result = applyProjectMaskEdit(null, {
    diameter: 1,
    kind: 'brush',
    operation: 'add',
    points: [{ x: -4, y: 7 }],
  })
  assert.ok(result)
  assert.deepEqual(result.bounds, { height: 2, width: 2, x: -5, y: 6 })
  assert.deepEqual([...result.alpha], [75, 75, 75, 75])
  const snapshot = [...result.alpha]
  const erased = applyProjectMaskEdit(result, {
    diameter: 1,
    kind: 'brush',
    operation: 'subtract',
    points: [{ x: -4, y: 7 }],
  })
  assert.ok(erased)
  assert.deepEqual([...erased.alpha], [53, 53, 53, 53])
  assert.deepEqual([...result.alpha], snapshot)
})

test('brush paints the complete continuous capsule rather than only supplied pointer positions', () => {
  const result = applyProjectMaskEdit(null, {
    diameter: 2,
    kind: 'brush',
    operation: 'add',
    points: [
      { x: -0.5, y: 0.5 },
      { x: 3.5, y: 0.5 },
    ],
  })
  assert.ok(result)
  assert.deepEqual(result.bounds, { height: 3, width: 7, x: -2, y: -1 })
  assert.deepEqual(
    [...result.alpha],
    [
      22, 128, 128, 128, 128, 128, 22, 128, 255, 255, 255, 255, 255, 128, 22, 128, 128, 128, 128,
      128, 22,
    ],
  )
})

test('polygon coverage follows even-odd fill, soft boundary samples and world-space cropping', () => {
  const result = applyProjectMaskEdit(null, {
    kind: 'polygon',
    operation: 'add',
    points: [
      { x: -3, y: 2 },
      { x: 1, y: 2 },
      { x: 1, y: 4 },
      { x: -3, y: 4 },
    ],
  })
  assert.ok(result)
  assert.deepEqual(result.bounds, { height: 2, width: 4, x: -3, y: 2 })
  assert.deepEqual([...result.alpha], [255, 255, 255, 255, 255, 255, 255, 255])
  const cropped = applyProjectMaskEdit(result, {
    kind: 'polygon',
    operation: 'subtract',
    points: [
      { x: -3, y: 2 },
      { x: -1, y: 2 },
      { x: -1, y: 4 },
      { x: -3, y: 4 },
    ],
  })
  assert.ok(cropped)
  assert.deepEqual(cropped.bounds, { height: 2, width: 2, x: -1, y: 2 })
  assert.deepEqual([...cropped.alpha], [255, 255, 255, 255])
  const triangle = applyProjectMaskEdit(null, {
    kind: 'polygon',
    operation: 'add',
    points: [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 2 },
    ],
  })
  assert.ok(triangle)
  assert.deepEqual([...triangle.alpha], [255, 64, 64, 0])
  assert.equal(
    applyProjectMaskEdit(null, {
      kind: 'polygon',
      operation: 'add',
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
        { x: 0, y: 2 },
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
        { x: 0, y: 2 },
      ],
    }),
    null,
  )
})

test('eraser cannot expand coverage and complete erase/clear returns the canonical empty state', () => {
  const current = {
    alpha: Uint8Array.from([255, 255, 255, 255]),
    bounds: { height: 2, width: 2, x: -9, y: 13 },
  }
  assert.deepEqual(
    applyProjectMaskEdit(current, {
      diameter: 50,
      kind: 'brush',
      operation: 'subtract',
      points: [{ x: 1000, y: 1000 }],
    }),
    current,
  )
  assert.equal(
    applyProjectMaskEdit(current, {
      kind: 'polygon',
      operation: 'subtract',
      points: [
        { x: -9, y: 13 },
        { x: -7, y: 13 },
        { x: -7, y: 15 },
        { x: -9, y: 15 },
      ],
    }),
    null,
  )
  assert.equal(applyProjectMaskEdit(current, { kind: 'clear' }), null)
  assert.equal(applyProjectMaskEdit(null, { kind: 'clear' }), null)
})

test('geometry and work refusals leave existing coverage exact; a small-width maximum-point neighbor passes', () => {
  const current = { alpha: Uint8Array.from([255]), bounds: { height: 1, width: 1, x: 0, y: 0 } }
  const points = Array.from({ length: 8192 }, () => ({ x: 0, y: 0 }))
  assert.throws(
    () => applyProjectMaskEdit(current, { diameter: 512, kind: 'brush', operation: 'add', points }),
    { code: 'MASK_LIMIT' },
  )
  assert.throws(
    () =>
      applyProjectMaskEdit(current, {
        diameter: 1,
        kind: 'brush',
        operation: 'add',
        points: [
          { x: -10_000, y: 0 },
          { x: 10_000, y: 0 },
        ],
      }),
    { code: 'MASK_LIMIT' },
  )
  assert.deepEqual(current, {
    alpha: Uint8Array.from([255]),
    bounds: { height: 1, width: 1, x: 0, y: 0 },
  })
  const neighbor = applyProjectMaskEdit(null, {
    diameter: 1,
    kind: 'brush',
    operation: 'add',
    points,
  })
  assert.ok(neighbor)
  assert.deepEqual([...neighbor.alpha], [75, 75, 75, 75])
  assert.throws(
    () =>
      applyProjectMaskEdit(null, {
        kind: 'polygon',
        operation: 'add',
        points: Array.from(
          { length: 8192 },
          (_, index) =>
            [
              { x: 0, y: 0 },
              { x: 1, y: 0 },
              { x: 1, y: 4096 },
              { x: 0, y: 4096 },
            ][index % 4],
        ),
      }),
    { code: 'MASK_LIMIT' },
  )
})

test('ordinary 512-pixel lasso with 100 pointer samples fits the bounded scanline work profile', () => {
  const points = Array.from({ length: 100 }, (_, index) => {
    const position = ((index % 25) * 512) / 25
    return index < 25
      ? { x: position, y: 0 }
      : index < 50
        ? { x: 512, y: position }
        : index < 75
          ? { x: 512 - position, y: 512 }
          : { x: 0, y: 512 - position }
  })
  const result = applyProjectMaskEdit(null, { kind: 'polygon', operation: 'add', points })
  assert.ok(result)
  assert.deepEqual(result.bounds, { height: 512, width: 512, x: 0, y: 0 })
  assert.equal(result.alpha.length, 512 * 512)
  assert.ok(result.alpha.every((value) => value === 255))
})

const alpha = [0, 64, 128, 255]
const filteredRows = [
  [0, 255, 255, 255, 0, 255, 255, 255, 64, 0, 255, 255, 255, 128, 255, 255, 255, 255],
  [1, 255, 255, 255, 0, 0, 0, 0, 64, 1, 255, 255, 255, 128, 0, 0, 0, 127],
  [2, 255, 255, 255, 0, 255, 255, 255, 64, 2, 0, 0, 0, 128, 0, 0, 0, 191],
  [3, 255, 255, 255, 0, 128, 128, 128, 64, 3, 128, 128, 128, 128, 0, 0, 0, 159],
  [4, 255, 255, 255, 0, 0, 0, 0, 64, 4, 0, 0, 0, 128, 0, 0, 0, 127],
]

test('real PNG encoding retains literal linear alpha and white RGB under independent package validation', async () => {
  const png = encodeProjectMaskPng(Uint8Array.from(alpha), 2, 2)
  await validateSrgbPngStream(
    (async function* () {
      yield png
    })(),
    'assets/masks/fixture.png',
    32 * 1024 * 1024,
    4096,
  )
  const idatLength = png.readUInt32BE(33)
  assert.deepEqual([...inflateSync(png.subarray(41, 41 + idatLength))], filteredRows[0])
  assert.deepEqual([...decodeProjectMaskPng(png, { height: 2, width: 2 })], alpha)
})

test('mask decoder handles every PNG row filter using independently authored filtered byte fixtures', () => {
  for (const rows of filteredRows) {
    assert.deepEqual(
      [...decodeProjectMaskPng(pngWithRows(Buffer.from(rows)), { height: 2, width: 2 })],
      alpha,
    )
  }
})

test('mask PNG admits 256 IDAT chunks but refuses 257 before accumulating their data views', () => {
  const rows = Buffer.alloc(2 * (64 * 4 + 1), 255)
  rows[0] = rows[257] = 0
  const compressed = deflateSync(rows, { level: 0 })
  assert.ok(compressed.length >= 257)
  const header = Buffer.from([0, 0, 0, 64, 0, 0, 0, 2, 8, 6, 0, 0, 0])
  const makePng = (count: number): Buffer =>
    Buffer.concat([
      Buffer.from('89504e470d0a1a0a', 'hex'),
      pngChunk('IHDR', header),
      ...Array.from({ length: count }, (_, index) =>
        pngChunk(
          'IDAT',
          compressed.subarray(
            Math.floor((index * compressed.length) / count),
            Math.floor(((index + 1) * compressed.length) / count),
          ),
        ),
      ),
      pngChunk('IEND', Buffer.alloc(0)),
    ])
  const refused = makePng(257)
  const valid = makePng(256)
  assert.ok(valid.length < 4096 && refused.length < 4096, 'Boundary inputs stay tiny.')
  assert.deepEqual(
    [...decodeProjectMaskPng(valid, { height: 2, width: 64 })],
    Array.from({ length: 128 }, () => 255),
  )
  assert.throws(() => decodeProjectMaskPng(refused, { height: 2, width: 64 }), {
    code: 'MASK_LIMIT',
  })
})

test('mask decoder refuses corrupt and noncanonical PNGs even when their chunk CRCs are valid', () => {
  const rows = Buffer.from(filteredRows[0])
  const black = Buffer.from(rows)
  black[1] = 0
  const blank = Buffer.from(rows)
  for (const index of [4, 8, 13, 17]) {
    blank[index] = 0
  }
  const padded = Buffer.from(rows)
  padded[4] = 0
  padded[8] = 0
  const invalidFilter = Buffer.from(rows)
  invalidFilter[0] = 5
  const original = pngWithRows(rows)
  const badCrc = Buffer.from(original)
  badCrc[29] ^= 1
  for (const [name, png] of [
    ['wrong RGB', pngWithRows(black)],
    ['empty coverage', pngWithRows(blank)],
    ['loose bounds', pngWithRows(padded)],
    ['row filter', pngWithRows(invalidFilter)],
    ['short pixels', pngWithRows(rows.subarray(0, -1))],
    ['extra pixels', pngWithRows(Buffer.concat([rows, Buffer.from([0])]))],
    ['CRC', badCrc],
    ['truncated', original.subarray(0, -1)],
    ['trailing', Buffer.concat([original, Buffer.from([0])])],
    ['ancillary color', pngWithRows(rows, pngChunk('gAMA', Buffer.from([0, 0, 177, 143])))],
    [
      'trailing zlib input',
      pngWithRows(rows, undefined, Buffer.concat([deflateSync(rows), Buffer.from([0])])),
    ],
  ] as const) {
    assert.throws(
      () => decodeProjectMaskPng(png, { height: 2, width: 2 }),
      { code: 'MASK_IMAGE_INVALID' },
      name,
    )
  }
  assert.throws(() => decodeProjectMaskPng(original, { height: 2, width: 3 }), {
    code: 'MASK_IMAGE_INVALID',
  })
})

function pngWithRows(rows: Buffer, extra?: Buffer, compressed = deflateSync(rows)): Buffer {
  const header = Buffer.from([0, 0, 0, 2, 0, 0, 0, 2, 8, 6, 0, 0, 0])
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    ...(extra ? [extra] : []),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function pngChunk(name: string, data: Buffer): Buffer {
  const bytes = Buffer.alloc(data.length + 12)
  bytes.writeUInt32BE(data.length, 0)
  bytes.write(name, 4, 4, 'ascii')
  data.copy(bytes, 8)
  bytes.writeUInt32BE(crc32(bytes.subarray(4, -4)), bytes.length - 4)
  return bytes
}
