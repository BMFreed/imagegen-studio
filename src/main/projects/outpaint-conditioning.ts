import {
  AlphaOutpaintIdentityV1ObjectSchema,
  INVOKE_ALPHA_OUTPAINT_POLICY_V1,
} from '../../shared/projects/alpha-outpaint.js'
import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import {
  IGS_GENERATION_PNG_MAX_BYTES,
  IGS_SAFETY_CEILINGS,
  type IgsRectV1,
} from '../../shared/projects/project-schema.js'

import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import * as v from 'valibot'

import { LAMA_OUTPAINT_ARTIFACT } from '../runtime/lama-manifest.js'
import { validateSrgbPngStream } from './igs-package.js'
import { decodeTargetPngAlpha } from './target-png-mode.js'

export { INVOKE_ALPHA_OUTPAINT_POLICY_V1 } from '../../shared/projects/alpha-outpaint.js'

/** Internal conditioning input, distinct from durable queue jobs and portable accepted provenance. */
export interface FrozenAlphaOutpaintConditioningV1 {
  readonly bbox: Readonly<IgsRectV1>
  readonly infillResource: {
    readonly byteSize: number
    readonly role: 'outpaint-infill'
    readonly sha256: string
  }
  readonly keepMask: {
    readonly byteSize: number
    readonly format: 'alpha8'
    readonly height: number
    readonly polarity: 'keep'
    readonly sha256: string
    readonly width: number
  }
  readonly kind: 'alpha-outpaint-conditioning'
  readonly policy: typeof INVOKE_ALPHA_OUTPAINT_POLICY_V1
  readonly schemaVersion: 1
  readonly sourceTarget: {
    readonly byteSize: number
    readonly format: 'png'
    readonly height: number
    readonly iccSha256: typeof IGS_SRGB_ICC_SHA256
    readonly sha256: string
    readonly width: number
  }
}

const side = v.pipe(
  v.number(),
  v.safeInteger(),
  v.minValue(8),
  v.maxValue(2048),
  v.check((value) => value % 8 === 0),
)
const position = v.pipe(
  v.number(),
  v.safeInteger(),
  v.minValue(-IGS_SAFETY_CEILINGS.coordinateMagnitude),
  v.maxValue(IGS_SAFETY_CEILINGS.coordinateMagnitude),
)

/** Strict operational conditioning identity. Family admission owns its stronger minimum side. */
export const FrozenAlphaOutpaintConditioningSchema = v.pipe(
  v.strictObject({
    ...AlphaOutpaintIdentityV1ObjectSchema.entries,
    bbox: v.strictObject({ height: side, width: side, x: position, y: position }),
    kind: v.literal('alpha-outpaint-conditioning'),
    schemaVersion: v.literal(1),
  }),
  v.check(
    (value) =>
      value.bbox.width * value.bbox.height <= 4_000_000 &&
      value.keepMask.width === value.bbox.width &&
      value.keepMask.height === value.bbox.height &&
      value.keepMask.byteSize === value.bbox.width * value.bbox.height &&
      value.sourceTarget.width === value.bbox.width &&
      value.sourceTarget.height === value.bbox.height,
  ),
)

export interface PreparedAlphaOutpaintConditioning {
  readonly context: FrozenAlphaOutpaintConditioningV1
  /** Owned raw alpha bytes: 255 keeps the source and 0 permits generation; soft alpha is retained. */
  readonly keepMaskBytes: Buffer
  /** Detached exact source PNG; future materialization must recheck it against the frozen identity. */
  readonly targetPngBytes: Buffer
}

/** Detached strict capture for queue reload; it neither reads files nor trusts a mask's pixels. */
export function parseFrozenAlphaOutpaintConditioningV1(
  value: unknown,
): FrozenAlphaOutpaintConditioningV1 {
  const parsed = v.safeParse(FrozenAlphaOutpaintConditioningSchema, value)
  if (!parsed.success) {
    throw new Error('The frozen outpaint conditioning identity is invalid.')
  }
  const captured = parsed.output
  return Object.freeze({
    ...captured,
    bbox: Object.freeze(captured.bbox),
    infillResource: Object.freeze(captured.infillResource),
    keepMask: Object.freeze(captured.keepMask),
    policy: Object.freeze(captured.policy),
    sourceTarget: Object.freeze(captured.sourceTarget),
  })
}

/** Requalify exact persisted pixels, including CRC/color metadata and the rederived soft mask. */
export async function assertFrozenAlphaOutpaintConditioning(
  inputContext: FrozenAlphaOutpaintConditioningV1,
  inputBytes: Buffer,
): Promise<void> {
  const context = parseFrozenAlphaOutpaintConditioningV1(inputContext)
  if (!Buffer.isBuffer(inputBytes) || inputBytes.length > IGS_GENERATION_PNG_MAX_BYTES) {
    throw new Error('The frozen outpaint source must be a bounded PNG buffer.')
  }
  const bytes = Buffer.from(inputBytes)
  const actual = freezeAlphaOutpaintConditioning({
    bbox: context.bbox,
    sourceTargetSha256: context.sourceTarget.sha256,
    targetPngBytes: bytes,
  })
  if (!isDeepStrictEqual(actual.context, context)) {
    throw new Error('The frozen outpaint conditioning differs from its source pixels.')
  }
  await validateSrgbPngStream(
    (async function* () {
      yield bytes
    })(),
    'target.png',
    IGS_GENERATION_PNG_MAX_BYTES,
    2048,
  )
  // Generic sRGB validation permits absent ICC; frozen generation input requires this actual chunk.
  let hasIcc = false
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const size = bytes.readUInt32BE(offset)
    if (bytes.toString('ascii', offset + 4, offset + 8) === 'iCCP') {
      hasIcc = true
    }
    offset += size + 12
  }
  if (!hasIcc) {
    throw new Error('The frozen outpaint source has no pinned sRGB ICC profile.')
  }
}

/**
 * Freeze alpha-derived conditioning from an already Main-verified target PNG. No models, files,
 * downloads, queue operations or worker capabilities are resolved or published by this factory.
 */
export function freezeAlphaOutpaintConditioning(input: {
  bbox: IgsRectV1
  sourceTargetSha256: string
  targetPngBytes: Buffer
}): PreparedAlphaOutpaintConditioning {
  const bbox = { ...input.bbox }
  // Internal masked-execution inputs use an 8-pixel latent grid. This is not a public capacity claim;
  // the public family generation admission retains its independently qualified minimum dimensions.
  if (
    !Number.isSafeInteger(bbox.width) ||
    !Number.isSafeInteger(bbox.height) ||
    bbox.width < 8 ||
    bbox.height < 8 ||
    bbox.width % 8 !== 0 ||
    bbox.height % 8 !== 0
  ) {
    throw new Error('The outpaint bbox must use dimensions on the supported 8-pixel grid.')
  }
  if (
    !Buffer.isBuffer(input.targetPngBytes) ||
    input.targetPngBytes.length > IGS_GENERATION_PNG_MAX_BYTES
  ) {
    throw new Error('The outpaint source target must be a bounded PNG buffer.')
  }
  const targetPngBytes = Buffer.from(input.targetPngBytes)
  const sourceTargetSha256 = input.sourceTargetSha256
  if (
    !Number.isSafeInteger(bbox.x) ||
    !Number.isSafeInteger(bbox.y) ||
    Math.abs(bbox.x) > IGS_SAFETY_CEILINGS.coordinateMagnitude ||
    Math.abs(bbox.y) > IGS_SAFETY_CEILINGS.coordinateMagnitude ||
    !/^[a-f0-9]{64}$/.test(sourceTargetSha256) ||
    sha256(targetPngBytes) !== sourceTargetSha256
  ) {
    throw new Error('The outpaint source target identity or bbox is invalid.')
  }
  const keepMaskBytes = decodeTargetPngAlpha(targetPngBytes, bbox.width, bbox.height)
  if (
    keepMaskBytes.every((value) => value === 0) ||
    keepMaskBytes.every((value) => value === 255)
  ) {
    throw new Error('Alpha-derived outpaint requires a partially transparent target.')
  }
  const context: FrozenAlphaOutpaintConditioningV1 = Object.freeze({
    bbox: Object.freeze(bbox),
    infillResource: Object.freeze({
      byteSize: LAMA_OUTPAINT_ARTIFACT.sizeBytes,
      role: LAMA_OUTPAINT_ARTIFACT.role,
      sha256: LAMA_OUTPAINT_ARTIFACT.sha256,
    }),
    keepMask: Object.freeze({
      byteSize: keepMaskBytes.length,
      format: 'alpha8',
      height: bbox.height,
      polarity: 'keep',
      sha256: sha256(keepMaskBytes),
      width: bbox.width,
    }),
    kind: 'alpha-outpaint-conditioning',
    policy: INVOKE_ALPHA_OUTPAINT_POLICY_V1,
    schemaVersion: 1,
    sourceTarget: Object.freeze({
      byteSize: targetPngBytes.length,
      format: 'png',
      height: bbox.height,
      iccSha256: IGS_SRGB_ICC_SHA256,
      sha256: sourceTargetSha256,
      width: bbox.width,
    }),
  })
  return { context, keepMaskBytes, targetPngBytes }
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}
