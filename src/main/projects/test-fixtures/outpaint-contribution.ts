import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { crc32, deflateSync } from 'node:zlib'

/** Real bounded PNG fixture encoder; production stream/alpha verifiers remain the subjects. */
export async function outpaintPngFromAlpha(
  alpha: Buffer,
  width: number,
  height: number,
  options: { channels?: 3 | 4; icc?: boolean } = {},
): Promise<Buffer> {
  if (alpha.length !== width * height) {
    throw new Error('Invalid PNG fixture alpha.')
  }
  const channels = options.channels ?? 4
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = channels === 4 ? 6 : 2
  const stride = width * channels + 1
  const pixels = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * stride + 1 + x * channels
      pixels[i] = (x * 7 + y) % 256
      pixels[i + 1] = (y * 11 + x) % 256
      pixels[i + 2] = (x + y * 3) % 256
      if (channels === 4) {
        pixels[i + 3] = alpha[y * width + x]
      }
    }
  }
  const parts = [Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header)]
  if (options.icc !== false) {
    const icc = await readFile(path.resolve('worker-python/src/imagegen_worker/srgb.icc'))
    parts.push(chunk('iCCP', Buffer.concat([Buffer.from('sRGB\0\0'), deflateSync(icc)])))
  }
  parts.push(chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0)))
  return Buffer.concat(parts)
}

function chunk(tag: string, data: Buffer): Buffer {
  const name = Buffer.from(tag, 'ascii')
  const result = Buffer.alloc(data.length + 12)
  result.writeUInt32BE(data.length, 0)
  name.copy(result, 4)
  data.copy(result, 8)
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8)
  return result
}
