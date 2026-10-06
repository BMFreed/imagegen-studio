import {
  IGS_GENERATION_PNG_MAX_BYTES,
  IGS_SAFETY_CEILINGS,
  type IgsRectV1,
} from '../../shared/projects/project-schema.js'

import { createHash } from 'node:crypto'

import { LAMA_OUTPAINT_ARTIFACT } from '../runtime/lama-manifest.js'
import { decodeTargetPngAlpha } from './target-png-mode.js'

/** Exact Invoke alpha-derived outpaint defaults; this does not advertise an executable capability. */
export const INVOKE_ALPHA_OUTPAINT_POLICY_V1 = Object.freeze({
  edgeRadius: 16,
  fadeDistance: 16,
  infillMethod: 'lama',
  maskBlur: 'gaussian-weighted-max',
  minimumDenoise: 0,
  outputMode: 'contribution',
  version: 1,
} as const)

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
    readonly sha256: string
    readonly width: number
  }
}

export interface PreparedAlphaOutpaintConditioning {
  readonly context: FrozenAlphaOutpaintConditioningV1
  /** Owned raw alpha bytes: 255 keeps the source and 0 permits generation; soft alpha is retained. */
  readonly keepMaskBytes: Buffer
  /** Detached exact source PNG; future materialization must recheck it against the frozen identity. */
  readonly targetPngBytes: Buffer
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
      sha256: sourceTargetSha256,
      width: bbox.width,
    }),
  })
  return { context, keepMaskBytes, targetPngBytes }
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}
