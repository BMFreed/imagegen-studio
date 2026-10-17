import assert from 'node:assert/strict'
import test from 'node:test'
import { deflateSync } from 'node:zlib'

import {
  assertSmartPatchQualificationAlpha,
  assertSmartPatchQualificationRgbPair,
  decodeSmartPatchQualificationPng,
  expectedSmartPatchQualificationAlpha,
} from './smart-patch-qualification-oracles.mjs'

// Small test-only PNG writer. Scanline residuals below are literal fixtures, not
// computed by the decoder's predictors or by an imported production PNG writer.
function pngChunk(type, data) {
  const label = Buffer.from(type)
  const payload = Buffer.concat([label, data])
  let crc = 0xffffffff
  for (const byte of payload) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  const result = Buffer.alloc(data.length + 12)
  result.writeUInt32BE(data.length)
  payload.copy(result, 4)
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4)
  return result
}

function pngFor(
  scanlines,
  { width = 3, height = 5, colorType = 6, depth = 8, interlace = 0 } = {},
) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = depth
  header[9] = colorType
  header[12] = interlace
  const compressed = deflateSync(Buffer.from(scanlines))
  const split = Math.floor(compressed.length / 2)
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('tEXt', Buffer.from('Fixture\0raw bytes, no color conversion')),
    pngChunk('IDAT', compressed.subarray(0, split)),
    pngChunk('IDAT', compressed.subarray(split)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

const filteredRgbaRows = [
  [0, 9, 21, 37, 0, 250, 128, 64, 255, 3, 10, 200, 128],
  [1, 15, 30, 45, 255, 246, 170, 45, 1, 215, 76, 167, 254],
  [2, 235, 227, 155, 2, 13, 98, 1, 128, 36, 235, 129, 2],
  [3, 138, 211, 189, 0, 228, 138, 98, 191, 236, 129, 105, 0],
  [4, 48, 89, 225, 255, 17, 247, 195, 1, 253, 19, 40, 128],
]
const literalRgba = Buffer.from([
  9, 21, 37, 0, 250, 128, 64, 255, 3, 10, 200, 128, 15, 30, 45, 255, 5, 200, 90, 0, 220, 20, 1, 254,
  250, 1, 200, 1, 18, 42, 91, 128, 0, 255, 130, 0, 7, 211, 33, 0, 240, 8, 160, 255, 100, 4, 250,
  127, 55, 44, 2, 255, 1, 255, 99, 0, 254, 18, 200, 128,
])

test('PNG decoder reconstructs all five filters and preserves nonzero RGB under alpha0', () => {
  const actual = decodeSmartPatchQualificationPng(pngFor(filteredRgbaRows.flat()))
  assert.equal(actual.width, 3)
  assert.equal(actual.height, 5)
  assert.equal(actual.channels, 4)
  assert.deepEqual(actual.data, literalRgba)
  assert.deepEqual([...actual.data.subarray(0, 4)], [9, 21, 37, 0])
})

test('PNG RGB decoding adds opaque alpha without changing three-channel filter stride', () => {
  const actual = decodeSmartPatchQualificationPng(
    pngFor([0, 50, 60, 70, 200, 210, 220, 1, 6, 5, 4, 253, 253, 253], {
      width: 2,
      height: 2,
      colorType: 2,
    }),
  )
  assert.deepEqual(
    [...actual.data],
    [50, 60, 70, 255, 200, 210, 220, 255, 6, 5, 4, 255, 3, 2, 1, 255],
  )
})

test('PNG decoder refuses truncated or corrupt chunks and unsupported sample topology', () => {
  const valid = pngFor(filteredRgbaRows.flat())
  assert.throws(() => decodeSmartPatchQualificationPng(valid.subarray(0, -1)), /incomplete/)
  const corrupt = Buffer.from(valid)
  corrupt[29] ^= 1
  assert.throws(() => decodeSmartPatchQualificationPng(corrupt), /CRC/)
  for (const [options, message] of [
    [{ width: 257 }, /bounds/],
    [{ depth: 16 }, /eight-bit/],
    [{ colorType: 0 }, /RGB8 or RGBA8/],
    [{ interlace: 1 }, /Interlaced/],
  ])
    assert.throws(
      () => decodeSmartPatchQualificationPng(pngFor(filteredRgbaRows.flat(), options)),
      message,
    )
})

test('PNG decoder bounds inflation and rejects incomplete scanlines or invalid row filters', () => {
  const options = { width: 1, height: 1 }
  assert.throws(() => decodeSmartPatchQualificationPng(pngFor([0, 1, 2, 3], options)), /incomplete/)
  assert.throws(() => decodeSmartPatchQualificationPng(pngFor([5, 1, 2, 3, 4], options)), /filter/)
  assert.throws(
    () => decodeSmartPatchQualificationPng(pngFor(new Uint8Array(10_000), options)),
    /larger|length|size/i,
  )
})

// Test inputs use their own coordinate predicates, not the expected-array helper.
function rgbaFor(predicate) {
  const data = new Uint8Array(128 * 128 * 4)
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const offset = (y * 128 + x) * 4
      data[offset] = x
      data[offset + 1] = y
      data[offset + 2] = (x * 7 + y * 11) % 256
      data[offset + 3] = predicate(x, y) ? 255 : 0
    }
  }
  return { channels: 4, data, height: 128, width: 128 }
}

test('TXT and IMG require every world pixel opaque, independently of generated RGB', () => {
  for (const mode of ['txt2img', 'img2img']) {
    const pixels = rgbaFor(() => true)
    const result = assertSmartPatchQualificationAlpha({ ...pixels, mode })
    assert.equal(result.opaquePixels, 16384)
    assert.equal(result.transparentPixels, 0)
    pixels.data.fill(0, 0, 3)
    assertSmartPatchQualificationAlpha({ ...pixels, mode })
    pixels.data[pixels.data.length - 1] = 254
    assert.throws(() => assertSmartPatchQualificationAlpha({ ...pixels, mode }), /127,127/)
  }
})

test('INP checks the full expanded 40x40 world support and rejects the authored-only mask', () => {
  const correct = rgbaFor((x, y) => x > 27 && x <= 67 && y > 27 && y <= 67)
  const result = assertSmartPatchQualificationAlpha({ ...correct, mode: 'inpaint' })
  assert.equal(result.opaquePixels, 1600)
  assert.equal(result.transparentPixels, 14784)
  const authoredOnly = rgbaFor((x, y) => x >= 32 && x < 64 && y >= 32 && y < 64)
  assert.throws(
    () => assertSmartPatchQualificationAlpha({ ...authoredOnly, mode: 'inpaint' }),
    /28,28/,
  )
  // A full-array assertion must observe even the last pixel outside the edit.
  correct.data[correct.data.length - 1] = 1
  assert.throws(
    () => assertSmartPatchQualificationAlpha({ ...correct, mode: 'inpaint' }),
    /127,127/,
  )
})

test('OUT checks the four-pixel protected-side expansion, not raw source transparency', () => {
  const result = assertSmartPatchQualificationAlpha({
    ...rgbaFor((x) => x > 59),
    mode: 'outpaint',
  })
  assert.equal(result.opaquePixels, 8704)
  assert.equal(result.transparentPixels, 7680)
  for (const predicate of [(x) => x >= 64, (x) => x < 60, () => true]) {
    assert.throws(() =>
      assertSmartPatchQualificationAlpha({ ...rgbaFor(predicate), mode: 'outpaint' }),
    )
  }
})

test('processing-size, truncated and RGB-only outputs cannot masquerade as world RGBA', () => {
  const valid = { ...rgbaFor(() => true), mode: 'img2img' }
  assert.throws(() => assertSmartPatchQualificationAlpha({ ...valid, width: 64 }), /world width/)
  assert.throws(() => assertSmartPatchQualificationAlpha({ ...valid, height: 256 }), /world height/)
  assert.throws(() => assertSmartPatchQualificationAlpha({ ...valid, channels: 3 }), /RGBA8/)
  assert.throws(
    () => assertSmartPatchQualificationAlpha({ ...valid, data: valid.data.subarray(0, -1) }),
    /incomplete/,
  )
})

test('expected masks are detached and refuse an unqualified mode', () => {
  const first = expectedSmartPatchQualificationAlpha('inpaint')
  first.fill(17)
  const second = expectedSmartPatchQualificationAlpha('inpaint')
  assert.equal(second[0], 0)
  assert.equal(second[28 * 128 + 28], 255)
  assert.throws(() => expectedSmartPatchQualificationAlpha('regional'), /Unknown/)
})

function matchedPair() {
  const img = rgbaFor(() => true)
  const inpaint = rgbaFor((x, y) => x > 27 && x <= 67 && y > 27 && y <= 67)
  inpaint.data[(40 * 128 + 40) * 4] ^= 1
  const replay = { ...inpaint, data: Buffer.from(inpaint.data) }
  return { img, inpaint, replay }
}

test('matched IMG/INP prove RGB influence and exact replay across byte-array representations', () => {
  const result = assertSmartPatchQualificationRgbPair(matchedPair())
  assert.equal(result.differentPixels, 1)
  assert.equal(result.differentChannels, 1)
  assert.equal(result.inpaintRgbSha256, result.replayRgbSha256)
  assert.notEqual(result.imgRgbSha256, result.inpaintRgbSha256)
  assert.doesNotThrow(() => JSON.stringify(result))
})

test('correct differing alpha cannot hide plain IMG pixels in the INP result', () => {
  const img = rgbaFor(() => true)
  const inpaint = rgbaFor((x, y) => x > 27 && x <= 67 && y > 27 && y <= 67)
  assert.throws(
    () => assertSmartPatchQualificationRgbPair({ img, inpaint, replay: inpaint }),
    /RGB are identical/,
  )
})

test('replay checks RGB under zero contribution alpha as well as the visible edit', () => {
  for (const pixel of [0, 40 * 128 + 40, 128 * 128 - 1]) {
    const pair = matchedPair()
    pair.replay.data[pixel * 4 + 2] ^= 1
    assert.throws(() => assertSmartPatchQualificationRgbPair(pair), /Fixed-seed INP replay differs/)
  }
})
