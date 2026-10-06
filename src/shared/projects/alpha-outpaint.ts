import * as v from 'valibot'

import { IGS_SRGB_ICC_SHA256 } from './color-profile.js'
import { IGS_GENERATION_PNG_MAX_BYTES } from './generation-image-limits.js'

/** Frozen Invoke alpha-derived defaults; installation and inference remain separate owners. */
export const INVOKE_ALPHA_OUTPAINT_POLICY_V1 = Object.freeze({
  edgeRadius: 16,
  fadeDistance: 16,
  infillMethod: 'lama',
  maskBlur: 'gaussian-weighted-max',
  minimumDenoise: 0,
  outputMode: 'contribution',
  version: 1,
} as const)

/** The portable identity of the pinned shared infill weights, without a machine-local path. */
export const LAMA_OUTPAINT_IDENTITY_V1 = Object.freeze({
  byteSize: 205_669_692,
  role: 'outpaint-infill',
  sha256: '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9',
} as const)

const side = v.pipe(
  v.number(),
  v.safeInteger(),
  v.minValue(8),
  v.maxValue(2048),
  v.check((value) => value % 8 === 0),
)
const sha = v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/))
const bytes = v.pipe(
  v.number(),
  v.safeInteger(),
  v.minValue(1),
  v.maxValue(IGS_GENERATION_PNG_MAX_BYTES),
)

export const AlphaOutpaintContributionAlpha8V1Schema = v.pipe(
  v.strictObject({
    byteSize: bytes,
    format: v.literal('alpha8'),
    height: side,
    sha256: sha,
    width: side,
  }),
  v.check((value) => value.byteSize === value.width * value.height && value.byteSize <= 4_000_000),
)

/** Shared strict fields; callers bind this identity to their owning frozen bbox. */
export const AlphaOutpaintIdentityV1ObjectSchema = v.strictObject({
  infillResource: v.strictObject({
    byteSize: v.literal(LAMA_OUTPAINT_IDENTITY_V1.byteSize),
    role: v.literal(LAMA_OUTPAINT_IDENTITY_V1.role),
    sha256: v.literal(LAMA_OUTPAINT_IDENTITY_V1.sha256),
  }),
  keepMask: v.strictObject({
    byteSize: bytes,
    format: v.literal('alpha8'),
    height: side,
    polarity: v.literal('keep'),
    sha256: sha,
    width: side,
  }),
  policy: v.strictObject({
    edgeRadius: v.literal(INVOKE_ALPHA_OUTPAINT_POLICY_V1.edgeRadius),
    fadeDistance: v.literal(INVOKE_ALPHA_OUTPAINT_POLICY_V1.fadeDistance),
    infillMethod: v.literal(INVOKE_ALPHA_OUTPAINT_POLICY_V1.infillMethod),
    maskBlur: v.literal(INVOKE_ALPHA_OUTPAINT_POLICY_V1.maskBlur),
    minimumDenoise: v.literal(INVOKE_ALPHA_OUTPAINT_POLICY_V1.minimumDenoise),
    outputMode: v.literal(INVOKE_ALPHA_OUTPAINT_POLICY_V1.outputMode),
    version: v.literal(INVOKE_ALPHA_OUTPAINT_POLICY_V1.version),
  }),
  sourceTarget: v.strictObject({
    byteSize: bytes,
    format: v.literal('png'),
    height: side,
    iccSha256: v.literal(IGS_SRGB_ICC_SHA256),
    sha256: sha,
    width: side,
  }),
})

export const AlphaOutpaintIdentityV1Schema = v.pipe(
  AlphaOutpaintIdentityV1ObjectSchema,
  v.check(
    ({ keepMask, sourceTarget }) =>
      keepMask.width === sourceTarget.width &&
      keepMask.height === sourceTarget.height &&
      keepMask.byteSize === keepMask.width * keepMask.height &&
      keepMask.byteSize <= 4_000_000,
  ),
)

export type IgsAlphaOutpaintIdentityV1 = v.InferOutput<typeof AlphaOutpaintIdentityV1Schema>
export type IgsAlphaOutpaintContributionAlpha8V1 = v.InferOutput<
  typeof AlphaOutpaintContributionAlpha8V1Schema
>
