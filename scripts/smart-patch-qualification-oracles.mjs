import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { inflateSync } from 'node:zlib'

const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex')
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})

function chunkCrc(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * Independent bounded decoder for qualification PNGs: raw RGB8/RGBA8, all five PNG filters, no
 * interlacing or color conversion. In particular, alpha0 does not premultiply or erase hidden RGB.
 * Main's production PNG reader is not imported.
 */
export function decodeSmartPatchQualificationPng(input) {
  assert.ok(input instanceof Uint8Array, 'Qualification PNG must be a byte array.')
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength)
  assert.ok(
    bytes.length >= 45 && bytes.length <= 32 * 1024 ** 2,
    'PNG byte limit or length differs.',
  )
  assert.ok(bytes.subarray(0, 8).equals(pngSignature), 'PNG signature differs.')
  let width
  let height
  let channels
  let ended = false
  let idatEnded = false
  const chunks = []
  for (let offset = 8, count = 0; offset < bytes.length; count++) {
    assert.ok(count < 4096 && offset + 12 <= bytes.length, 'PNG chunk header is incomplete.')
    const length = bytes.readUInt32BE(offset)
    const next = offset + length + 12
    assert.ok(next <= bytes.length, 'PNG chunk payload is incomplete.')
    const type = bytes.toString('ascii', offset + 4, offset + 8)
    const body = bytes.subarray(offset + 8, next - 4)
    assert.equal(
      chunkCrc(bytes.subarray(offset + 4, next - 4)),
      bytes.readUInt32BE(next - 4),
      'PNG chunk CRC differs.',
    )
    assert.ok(count !== 0 || type === 'IHDR', 'PNG must begin with IHDR.')
    if (type === 'IHDR') {
      assert.equal(count, 0, 'PNG has a repeated IHDR.')
      assert.equal(length, 13, 'PNG IHDR length differs.')
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      assert.ok(
        width > 0 && height > 0 && width <= 256 && height <= 256,
        'PNG dimensions exceed qualification bounds.',
      )
      assert.equal(body[8], 8, 'PNG must use eight-bit samples.')
      assert.ok(body[9] === 2 || body[9] === 6, 'PNG must be RGB8 or RGBA8.')
      assert.equal(body[10], 0, 'PNG compression method differs.')
      assert.equal(body[11], 0, 'PNG filter method differs.')
      assert.equal(body[12], 0, 'Interlaced qualification PNGs are unsupported.')
      channels = body[9] === 6 ? 4 : 3
    } else if (type === 'IDAT') {
      assert.ok(!idatEnded, 'PNG IDAT chunks must be consecutive.')
      chunks.push(body)
    } else if (type === 'IEND') {
      assert.equal(length, 0, 'PNG IEND must be empty.')
      assert.equal(next, bytes.length, 'PNG has bytes after IEND.')
      ended = true
      break
    } else {
      assert.ok(/^[a-z]/.test(type), `Unsupported critical PNG chunk: ${type}`)
      if (chunks.length) idatEnded = true
    }
    offset = next
  }
  assert.ok(ended && chunks.length, 'PNG must contain IDAT and IEND.')
  const stride = width * channels
  const encoded = inflateSync(Buffer.concat(chunks), { maxOutputLength: (stride + 1) * height })
  assert.equal(encoded.length, (stride + 1) * height, 'PNG scanlines are incomplete.')
  const raw = Buffer.alloc(stride * height)
  const paeth = (a, b, c) => {
    const p = a + b - c
    const x = Math.abs(p - a)
    const y = Math.abs(p - b)
    const z = Math.abs(p - c)
    return x <= y && x <= z ? a : y <= z ? b : c
  }
  for (let y = 0; y < height; y++) {
    const filter = encoded[y * (stride + 1)]
    assert.ok(filter <= 4, 'PNG scanline filter is unsupported.')
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? raw[y * stride + x - channels] : 0
      const up = y ? raw[(y - 1) * stride + x] : 0
      const diagonal = y && x >= channels ? raw[(y - 1) * stride + x - channels] : 0
      const predictor = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, diagonal)][
        filter
      ]
      raw[y * stride + x] = (encoded[y * (stride + 1) + x + 1] + predictor) & 255
    }
  }
  const data = Buffer.alloc(width * height * 4)
  for (let pixel = 0; pixel < width * height; pixel++) {
    raw.copy(data, pixel * 4, pixel * channels, pixel * channels + 3)
    data[pixel * 4 + 3] = channels === 4 ? raw[pixel * 4 + 3] : 255
  }
  return { width, height, channels: 4, data }
}

/**
 * Fixed installed-qualification fixture, independently specified in world pixels. Both native
 * families use the same spatial /8 KEEP grid (channel count differs). This helper neither imports
 * Smart preparation nor reads its computed masks.
 *
 * The source/world bbox is 128x128; processing is 256x256. The INP authored mask is the opaque
 * square [32,64) x [32,64). OUT has opaque source columns [0,64) and transparent columns [64,128),
 * with no authored mask. Coherence edge size, minimum denoise and world mask blur must all be
 * zero.
 *
 * An edge size of zero still reduces processing KEEP with a bilinear filter. The 2x source resize
 * followed by /8 reduction makes each latent cell four world pixels wide. The antialiasing
 * footprint reaches one cell beyond each aligned boundary. Any KEEP below 255 contributes,
 * including the four corner cells. Therefore the INP support is [28,68)^2, not the authored
 * [32,64)^2; OUT starts at x=60, not x=64. No positive fade is applied. Every resulting alpha is
 * 0/255. A separate Pillow-only numeric calculation confirmed these finite coordinates; the
 * qualification oracle below intentionally uses literal geometry instead.
 */
export const SMART_PATCH_QUALIFICATION_GEOMETRY = Object.freeze({
  height: 128,
  internalHeight: 256,
  internalWidth: 256,
  width: 128,
})

const modes = new Set(['txt2img', 'img2img', 'inpaint', 'outpaint'])

export function expectedSmartPatchQualificationAlpha(mode) {
  assert.ok(modes.has(mode), `Unknown Smart Patch qualification mode: ${mode}`)
  const { height, width } = SMART_PATCH_QUALIFICATION_GEOMETRY
  const alpha = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const generates =
        mode === 'txt2img' ||
        mode === 'img2img' ||
        (mode === 'inpaint' && x >= 28 && x < 68 && y >= 28 && y < 68) ||
        (mode === 'outpaint' && x >= 60)
      alpha[y * width + x] = generates ? 255 : 0
    }
  }
  return alpha
}

/** Assert every world alpha byte of a decoded RGBA8 candidate or accepted asset. */
export function assertSmartPatchQualificationAlpha({ channels = 4, data, height, mode, width }) {
  const geometry = SMART_PATCH_QUALIFICATION_GEOMETRY
  assert.equal(
    width,
    geometry.width,
    'Smart Patch contribution must retain the frozen world width.',
  )
  assert.equal(
    height,
    geometry.height,
    'Smart Patch contribution must retain the frozen world height.',
  )
  assert.equal(channels, 4, 'Smart Patch world output must be decoded RGBA8.')
  assert.ok(data instanceof Uint8Array, 'Decoded Smart Patch pixels must be a byte array.')
  assert.equal(data.byteLength, width * height * channels, 'Decoded world RGBA8 is incomplete.')
  const expected = expectedSmartPatchQualificationAlpha(mode)
  const actual = new Uint8Array(expected.length)
  let opaquePixels = 0
  for (let pixel = 0; pixel < expected.length; pixel++) {
    actual[pixel] = data[pixel * channels + 3]
    assert.equal(
      actual[pixel],
      expected[pixel],
      `${mode} world alpha differs at (${pixel % width},${Math.floor(pixel / width)}).`,
    )
    if (actual[pixel] === 255) opaquePixels++
  }
  return {
    alphaSha256: createHash('sha256').update(actual).digest('hex'),
    opaquePixels,
    transparentPixels: actual.length - opaquePixels,
  }
}

/**
 * The caller first proves identical prepared RGB, native inference policy and resource identities.
 * Mask/owner metadata are the intended pair differences. PNG encoding and differing contribution
 * alpha cannot establish this RGB test.
 */
export function assertSmartPatchQualificationRgbPair({ img, inpaint, replay }) {
  assertSmartPatchQualificationAlpha({ ...img, mode: 'img2img' })
  assertSmartPatchQualificationAlpha({ ...inpaint, mode: 'inpaint' })
  assertSmartPatchQualificationAlpha({ ...replay, mode: 'inpaint' })
  const rgb = [img, inpaint, replay].map(({ data }) => {
    const result = new Uint8Array((data.byteLength / 4) * 3)
    for (let pixel = 0; pixel < data.byteLength / 4; pixel++) {
      for (let channel = 0; channel < 3; channel++) {
        result[pixel * 3 + channel] = data[pixel * 4 + channel]
      }
    }
    return result
  })
  let differentChannels = 0
  let differentPixels = 0
  for (let pixel = 0; pixel < img.width * img.height; pixel++) {
    let pixelDiffers = false
    for (let channel = 0; channel < 4; channel++) {
      const offset = pixel * 4 + channel
      assert.equal(
        replay.data[offset],
        inpaint.data[offset],
        `Fixed-seed INP replay differs at pixel ${pixel}, RGBA channel ${channel}.`,
      )
      if (channel < 3 && img.data[offset] !== inpaint.data[offset]) {
        differentChannels++
        pixelDiffers = true
      }
    }
    if (pixelDiffers) differentPixels++
  }
  assert.ok(
    differentChannels > 0,
    'Matched INP and IMG RGB are identical; differing contribution alpha alone does not prove masked inference.',
  )
  const [imgRgbSha256, inpaintRgbSha256, replayRgbSha256] = rgb.map((data) =>
    createHash('sha256').update(data).digest('hex'),
  )
  return {
    differentChannels,
    differentPixels,
    imgRgbSha256,
    inpaintRgbSha256,
    replayRgbSha256,
  }
}
