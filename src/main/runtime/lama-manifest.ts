/**
 * Shared outpaint infill artifact used by Invoke's Canvas graph. This is a pinned resource
 * descriptor for the future Main-owned engine installer, not an installed-runtime claim. The
 * release API provides the size; SHA-256 was measured from the downloaded release asset.
 */
export const LAMA_OUTPAINT_ARTIFACT = Object.freeze({
  assetId: 49_462_813,
  filename: 'big-lama.pt',
  role: 'outpaint-infill' as const,
  sha256: '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9',
  sizeBytes: 205_669_692,
  sourceRelease: 'https://github.com/Sanster/models/releases/tag/add_big_lama',
  url: 'https://github.com/Sanster/models/releases/download/add_big_lama/big-lama.pt',
})
