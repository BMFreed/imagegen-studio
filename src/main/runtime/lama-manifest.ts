/**
 * Shared outpaint infill artifact used by Invoke's Canvas graph. This is a pinned resource
 * descriptor for the future Main-owned engine installer, not an installed-runtime claim. The
 * release API provides the size; SHA-256 was measured from the downloaded release asset.
 */
import { LAMA_OUTPAINT_IDENTITY_V1 } from '../../shared/projects/alpha-outpaint.js'

export const LAMA_OUTPAINT_ARTIFACT = Object.freeze({
  assetId: 49_462_813,
  filename: 'big-lama.pt',
  role: LAMA_OUTPAINT_IDENTITY_V1.role,
  sha256: LAMA_OUTPAINT_IDENTITY_V1.sha256,
  sizeBytes: LAMA_OUTPAINT_IDENTITY_V1.byteSize,
  sourceRelease: 'https://github.com/Sanster/models/releases/tag/add_big_lama',
  url: 'https://github.com/Sanster/models/releases/download/add_big_lama/big-lama.pt',
})
