import { LAMA_OUTPAINT_IDENTITY_V1 } from '../../shared/projects/alpha-outpaint.js'
import {
  type AnimaWorkerRequest,
  captureCompiledAnimaWorkerRequest,
} from '../../shared/projects/anima-worker-request.js'
import {
  IllustriousNoiseProfileV1Schema,
  isDefaultIllustriousNoiseProfile,
  supportsIllustriousNoiseProfile,
} from '../../shared/projects/illustrious-noise-profile.js'
import {
  supportsInferenceAnimaOutpaint,
  supportsInferenceEuler,
  supportsInferenceIllustriousNoiseProfile,
  supportsInferenceOutpaint,
} from '../../shared/projects/inference-worker-capabilities.js'

import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import * as v from 'valibot'

import type { VerifiedOutpaintInfill } from '../runtime/inference-auxiliary-resources.js'
import type { IllustriousImg2ImgRequestV1 } from './illustrious-txt2img-job.js'

import {
  type FrozenQueuedOutpaintV1,
  Img2ImgSourceRequestSchema,
  isQueuedOutpaint,
  parseFrozenGenerationPayloadV1,
} from './generation-queue.js'
import {
  type FrozenAlphaOutpaintConditioningV1,
  parseFrozenAlphaOutpaintConditioningV1,
} from './outpaint-conditioning.js'

export interface IllustriousOutpaintRequestV1 extends Omit<
  IllustriousImg2ImgRequestV1,
  'job' | 'type'
> {
  job: IllustriousImg2ImgRequestV1['job'] & OutpaintFields
  type: 'generate-illustrious-outpaint'
}
export type AnimaOutpaintRequestV1 = Omit<
  Extract<AnimaWorkerRequest, { type: 'generate-anima-img2img' }>,
  'job' | 'type'
> & {
  job: Extract<AnimaWorkerRequest, { type: 'generate-anima-img2img' }>['job'] & OutpaintFields
  type: 'generate-anima-outpaint'
}
export type OutpaintWorkerRequest = AnimaOutpaintRequestV1 | IllustriousOutpaintRequestV1
type OutpaintFields = {
  conditioning: FrozenAlphaOutpaintConditioningV1
  infillResource: { byteSize: number; path: string; role: 'outpaint-infill'; sha256: string }
}

export function isOutpaintWorkerRequest(value: { type: string }): value is OutpaintWorkerRequest {
  return value.type === 'generate-anima-outpaint' || value.type === 'generate-illustrious-outpaint'
}

/** Strict detached wire capture. Native numeric img2img plans do not change the outer operation. */
export function captureOutpaintWorkerRequest(
  input: unknown,
  ready: unknown,
): OutpaintWorkerRequest {
  if (!supportsInferenceOutpaint(ready)) {
    throw new Error('The active worker has not qualified alpha outpaint contribution inference.')
  }
  const envelope = record(structuredClone(input))
  if (
    !isOutpaintWorkerRequest(envelope as { type: string }) ||
    !sameKeys(envelope, ['job', 'protocolVersion', 'requestId', 'type'])
  ) {
    throw new Error('The outpaint request envelope is invalid.')
  }
  if (envelope.type === 'generate-anima-outpaint' && !supportsInferenceAnimaOutpaint(ready)) {
    throw new Error('The active worker has not qualified Anima outpaint contribution inference.')
  }
  const job = record(envelope.job)
  if (
    envelope.type === 'generate-illustrious-outpaint' &&
    record(job.sampling).scheduler === 'euler' &&
    !supportsInferenceEuler(ready)
  ) {
    throw new Error('The active worker has not qualified ordinary Illustrious Euler.')
  }
  if (
    envelope.type === 'generate-illustrious-outpaint' &&
    record(job.sampling).noiseProfile !== undefined
  ) {
    const sampling = record(job.sampling)
    const profile = v.parse(IllustriousNoiseProfileV1Schema, sampling.noiseProfile)
    if (!supportsIllustriousNoiseProfile(String(sampling.scheduler), profile)) {
      throw new Error('DPM++ SDE does not support ZTSNR in this image engine.')
    }
    if (!supportsInferenceIllustriousNoiseProfile(ready)) {
      if (!isDefaultIllustriousNoiseProfile(profile)) {
        throw new Error('The active worker has not qualified the checkpoint noise profile.')
      }
    }
  }
  const conditioning = parseFrozenAlphaOutpaintConditioningV1(job.conditioning)
  const infill = record(job.infillResource)
  const { path: infillPath, ...identity } = infill
  if (
    !sameKeys(infill, ['byteSize', 'path', 'role', 'sha256']) ||
    !isDeepStrictEqual(identity, LAMA_OUTPAINT_IDENTITY_V1) ||
    !canonical(infillPath)
  ) {
    throw new Error('The exact outpaint infill identity is invalid.')
  }
  const { conditioning: _conditioning, infillResource: _infill, ...numericJob } = job
  const numeric = {
    ...envelope,
    job: numericJob,
    type:
      envelope.type === 'generate-anima-outpaint'
        ? 'generate-anima-img2img'
        : 'generate-illustrious-img2img',
  }
  const captured =
    envelope.type === 'generate-anima-outpaint'
      ? captureCompiledAnimaWorkerRequest(numeric, ready)
      : v.parse(Img2ImgSourceRequestSchema, numeric)
  const { bbox, output, target } = captured.job
  const { path: _targetPath, ...targetIdentity } = target
  const { format: _format, ...expectedTarget } = conditioning.sourceTarget
  if (
    !isDeepStrictEqual(bbox, conditioning.bbox) ||
    !isDeepStrictEqual(targetIdentity, expectedTarget) ||
    bbox.width < 64 ||
    bbox.height < 64 ||
    !canonical(output.stagingRoot) ||
    target.path !== path.join(output.stagingRoot, 'target.png') ||
    output.pngPath !== path.join(output.stagingRoot, 'result.png')
  ) {
    throw new Error('The outpaint source, bbox or disposable paths disagree.')
  }
  const files =
    'model' in captured.job
      ? [
          captured.job.model.checkpoint.path,
          captured.job.model.qwen3Encoder.path,
          captured.job.model.vae.path,
          ...captured.job.loras.map((entry) => entry.path),
        ]
      : [
          captured.job.checkpoint.path,
          ...(captured.job.loras ?? []).map((entry) => entry.path),
          ...(captured.job.vae ? [captured.job.vae.path] : []),
          ...Object.values(captured.job.embeddings ?? {})
            .flat()
            .map((entry) => entry.path),
        ]
  if (
    files.some(
      (file) =>
        !canonical(file) || file === infillPath || file === target.path || file === output.pngPath,
    ) ||
    path.dirname(infillPath) === output.stagingRoot ||
    infillPath === target.path ||
    infillPath === output.pngPath
  ) {
    throw new Error('The outpaint resource paths alias disposable files.')
  }
  const request = {
    ...captured,
    job: { ...captured.job, conditioning, infillResource: { ...identity, path: infillPath } },
    type: envelope.type,
  } as OutpaintWorkerRequest
  if (Buffer.byteLength(JSON.stringify(request), 'utf8') + 1 > 64 * 1024) {
    throw new Error('The outpaint request exceeds the worker message limit.')
  }
  return request
}

/** Rebind only disposable identity/paths after exact family and infill verification by Main. */
export function buildQueuedOutpaintWorkerRequest(input: {
  infill: VerifiedOutpaintInfill
  outputPath: string
  payload: FrozenQueuedOutpaintV1
  provisionalRoot: string
  ready: unknown
  requestId: string
  targetPath: string
}): OutpaintWorkerRequest {
  const payload = parseFrozenGenerationPayloadV1(JSON.stringify(input.payload))
  if (!isQueuedOutpaint(payload)) {
    throw new Error('Expected a frozen outpaint operation.')
  }
  const { managedPath, ...identity } = input.infill
  return captureOutpaintWorkerRequest(
    {
      job: {
        ...payload.workerJob,
        conditioning: payload.context.conditioning,
        infillResource: { ...identity, path: managedPath },
        output: { pngPath: input.outputPath, stagingRoot: input.provisionalRoot },
        target: { ...payload.workerJob.target, path: input.targetPath },
      },
      protocolVersion: '1',
      requestId: input.requestId,
      type:
        payload.kind === 'anima-outpaint'
          ? 'generate-anima-outpaint'
          : 'generate-illustrious-outpaint',
    },
    input.ready,
  )
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid outpaint object.')
  }
  return value as Record<string, unknown>
}
function sameKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}
function canonical(value: unknown): value is string {
  return typeof value === 'string' && path.isAbsolute(value) && path.resolve(value) === value
}
