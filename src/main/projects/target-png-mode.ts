import { inflateSync } from 'node:zlib'

export type TargetPngMode = 'img2img' | 'outpaint' | 'txt2img'

/** Decode only the PNG alpha channel, using its row filters, to verify the worker's mode claim. */
export function classifyTargetPngAlpha(png: Buffer, width: number, height: number): TargetPngMode {
  const alpha = decodeTargetPngAlpha(png, width, height)
  let allTransparent = true
  let allOpaque = true
  for (const value of alpha) {
    if (value !== 0) {
      allTransparent = false
    }
    if (value !== 255) {
      allOpaque = false
    }
  }
  return allTransparent ? 'txt2img' : allOpaque ? 'img2img' : 'outpaint'
}

/**
 * Return owned row-major alpha bytes without thresholding soft coverage. This bounded pixel decoder
 * is not the separate CRC/ICC verifier: callers still qualify the complete target PNG before use.
 */
export function decodeTargetPngAlpha(png: Buffer, width: number, height: number): Buffer {
  if (
    !Buffer.isBuffer(png) ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 2048 ||
    height > 2048 ||
    width * height > 4_000_000 ||
    png.length > 32 * 1024 * 1024
  ) {
    throw new Error('The generation target exceeds the bounded PNG decoder limits.')
  }
  if (png.length < 45 || !png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    throw new Error('The generation target PNG is invalid.')
  }
  const headerLength = png.readUInt32BE(8)
  const header = png.subarray(16, 29)
  if (
    headerLength !== 13 ||
    png.toString('ascii', 12, 16) !== 'IHDR' ||
    header.readUInt32BE(0) !== width ||
    header.readUInt32BE(4) !== height ||
    header[8] !== 8 ||
    header[9] !== 6 ||
    header[10] !== 0 ||
    header[11] !== 0 ||
    header[12] !== 0
  ) {
    throw new Error('Generation target must be 8-bit RGBA PNG.')
  }
  const compressed: Buffer[] = []
  let offset = 8
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset)
    const tag = png.toString('ascii', offset + 4, offset + 8)
    const next = offset + 12 + length
    if (next > png.length) {
      throw new Error('The generation target PNG is truncated.')
    }
    if (tag === 'IDAT') {
      compressed.push(png.subarray(offset + 8, offset + 8 + length))
    }
    if (tag === 'IEND') {
      break
    }
    offset = next
  }
  if (compressed.length === 0) {
    throw new Error('The generation target PNG has no pixels.')
  }
  const rowBytes = width * 4 + 1
  const expected = rowBytes * height
  let decoded: Buffer
  try {
    decoded = inflateSync(Buffer.concat(compressed), { maxOutputLength: expected })
  } catch {
    throw new Error('The generation target pixels are invalid.')
  }
  if (decoded.length !== expected) {
    throw new Error('The generation target pixel count is invalid.')
  }
  let previous = new Uint8Array(width)
  let current = new Uint8Array(width)
  // At most 4 MB in addition to the existing bounded inflated RGBA rows and two predictor rows.
  const alphaBytes = Buffer.alloc(width * height)
  for (let row = 0; row < height; row++) {
    const rowStart = row * rowBytes
    const filter = decoded[rowStart]
    if (filter > 4) {
      throw new Error('The generation target PNG filter is invalid.')
    }
    for (let column = 0; column < width; column++) {
      const left = column === 0 ? 0 : current[column - 1]
      const up = previous[column]
      const upLeft = column === 0 ? 0 : previous[column - 1]
      let predictor = 0
      switch (filter) {
        case 1: {
          predictor = left
          break
        }
        case 2: {
          predictor = up
          break
        }
        case 3: {
          predictor = Math.floor((left + up) / 2)
          break
        }
        case 4: {
          const p = left + up - upLeft
          const leftDistance = Math.abs(p - left)
          const upDistance = Math.abs(p - up)
          const upperLeftDistance = Math.abs(p - upLeft)
          predictor =
            leftDistance <= upDistance && leftDistance <= upperLeftDistance
              ? left
              : upDistance <= upperLeftDistance
                ? up
                : upLeft

          break
        }
        // No default
      }
      const alpha = (decoded[rowStart + 1 + column * 4 + 3] + predictor) & 0xff
      current[column] = alpha
      alphaBytes[row * width + column] = alpha
    }
    ;[previous, current] = [current, previous]
  }
  return alphaBytes
}
