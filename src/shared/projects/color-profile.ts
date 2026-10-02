/** SHA-256 of the fixed sRGB profile embedded in v1 worker output (srgb.icc). */
export const IGS_SRGB_ICC_SHA256 =
  '113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1'

const PNG_COLOR_CHUNK_LENGTHS = {
  cHRM: 32,
  cICP: 4,
  gAMA: 4,
  sRGB: 1,
} as const

/** The four PNG color chunks that can override or qualify an sRGB interpretation. */
export function pngColorChunkLength(type: string): number | undefined {
  return Object.hasOwn(PNG_COLOR_CHUNK_LENGTHS, type)
    ? PNG_COLOR_CHUNK_LENGTHS[type as keyof typeof PNG_COLOR_CHUNK_LENGTHS]
    : undefined
}

/** PNG-3 sRGB values; cICP uses H.273 BT.709/sRGB/RGB/full-range code points. */
export function isSrgbCompatiblePngColorChunk(type: string, payload: Uint8Array): boolean {
  if (payload.length !== pngColorChunkLength(type)) {
    return false
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  switch (type) {
    case 'cHRM': {
      const chromaticities = [31_270, 32_900, 64_000, 33_000, 30_000, 60_000, 15_000, 6000]
      return chromaticities.every((value, index) => view.getUint32(index * 4, false) === value)
    }
    case 'cICP': {
      return payload[0] === 1 && payload[1] === 13 && payload[2] === 0 && payload[3] === 1
    }
    case 'gAMA': {
      return view.getUint32(0, false) === 45_455
    }
    case 'sRGB': {
      return view.getUint8(0) <= 3
    }
    default: {
      return false
    }
  }
}
