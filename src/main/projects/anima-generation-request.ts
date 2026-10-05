import {
  type AnimaWorkerRequest,
  buildAnimaWorkerRequest,
} from '../../shared/projects/anima-worker-request.js'
import { supportsInferenceAnima } from '../../shared/projects/inference-worker-capabilities.js'

import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, mkdtemp, open, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import {
  prepareAnimaGenerationBatch,
  type PreparedAnimaGenerationBatch,
} from './anima-generation-batch.js'
import {
  type AnimaGenerationModelResolver,
  reverifyFrozenAnimaGeneration,
} from './anima-generation-preparation.js'
import { validateSrgbPngStream } from './igs-package.js'

const MAX_TARGET_BYTES = 32 * 1024 * 1024

export class AnimaGenerationRequestError extends Error {
  constructor(
    readonly code: 'GENERATION_INPUT_CHANGED' | 'INFERENCE_UNAVAILABLE' | 'INVALID_STAGING_ROOT',
    message: string,
  ) {
    super(message)
    this.name = 'AnimaGenerationRequestError'
  }
}

/**
 * Lease one exact target and distinct provisional result paths to a complete qualified batch. Every
 * command passes the existing immutable wire compiler and its 64 KiB line check before the consumer
 * runs. The callback must consume results before returning; cleanup owns only its private stage.
 * This is deliberately separate from public queue/admission and provenance.
 */
export async function withAnimaGenerationBatchRequests<T>(input: {
  modelService: AnimaGenerationModelResolver
  prepared: PreparedAnimaGenerationBatch
  ready: unknown
  scratchBasePath: string
  use: (requests: readonly AnimaWorkerRequest[]) => Promise<T>
}): Promise<T> {
  // Capture every caller-owned value before the first await, including the peer advertisement,
  // supplied compiler results and Buffer. Replanning detects omitted/reordered/injected items.
  const context = structuredClone(input.prepared.context)
  const targetPngBytes = Buffer.from(input.prepared.targetPngBytes)
  const items = structuredClone(input.prepared.items)
  const iterations = input.prepared.iterations
  const truncated = input.prepared.truncated
  const ready = structuredClone(input.ready)
  const { modelService, scratchBasePath, use } = input
  const batch = prepareAnimaGenerationBatch({
    iterations,
    prepared: { context, targetPngBytes },
  })
  if (truncated !== batch.truncated || !isDeepStrictEqual(items, batch.items)) {
    throw new AnimaGenerationRequestError(
      'GENERATION_INPUT_CHANGED',
      'The Anima batch differs from its captured prompts, seed schedule or compiled plans.',
    )
  }
  if (!supportsInferenceAnima(ready)) {
    throw new AnimaGenerationRequestError(
      'INFERENCE_UNAVAILABLE',
      'The worker has not qualified the original Anima pipeline.',
    )
  }
  await validateSrgbPngStream(
    (async function* () {
      yield targetPngBytes
    })(),
    'target.png',
    MAX_TARGET_BYTES,
    Math.max(context.bbox.width, context.bbox.height),
  )
  await reverifyFrozenAnimaGeneration(context, modelService)
  const base = await canonicalScratchBase(scratchBasePath)
  const stage = await mkdtemp(path.join(base, 'anima-request-'))
  try {
    const targetPath = path.join(stage, 'target.png')
    await writeFile(targetPath, targetPngBytes, { flag: 'wx', mode: 0o600 })
    // Files and registry links may change while writing the target; use captured identities only.
    await reverifyFrozenAnimaGeneration(context, modelService)
    // Verify after the final model await too; a replaced target cannot escape into the consumer.
    await verifyMaterializedTarget(targetPath, context.target.byteSize, context.target.sha256)
    const { model } = context
    const requests = batch.items.map((item, index) => {
      const request = buildAnimaWorkerRequest(
        {
          bbox: { ...context.bbox },
          loras: context.loras.map((entry) => ({
            byteSize: entry.byteSize,
            path: entry.managedPath,
            sha256: entry.reference.fileSha256,
            weight: entry.weight,
          })),
          mode: context.mode,
          model: {
            architecture: model.architecture,
            checkpoint: {
              byteSize: model.checkpoint.byteSize,
              path: model.checkpoint.managedPath,
              sha256: model.checkpoint.reference.fileSha256,
            },
            qwen3Encoder: {
              byteSize: model.qwen3Encoder.byteSize,
              path: model.qwen3Encoder.managedPath,
              sha256: model.qwen3Encoder.sha256,
            },
            vae: {
              byteSize: model.vae.byteSize,
              path: model.vae.managedPath,
              sha256: model.vae.sha256,
            },
          },
          output: { pngPath: path.join(stage, `result-${index}.png`), stagingRoot: stage },
          prompts: { ...item.prompts },
          requestId: randomUUID(),
          sampling: {
            guidanceScale: context.sampling.cfgScale,
            scheduler: context.sampling.animaMethod,
            seed: item.seed,
            steps: context.sampling.steps,
            strength: context.sampling.denoisingStrength,
          },
          target: {
            byteSize: context.target.byteSize,
            height: context.target.height,
            iccSha256: context.target.iccSha256,
            path: targetPath,
            sha256: context.target.sha256,
            width: context.target.width,
          },
        },
        ready,
      )
      if (
        !isDeepStrictEqual(request.job.prompts, item.compiledPrompts) ||
        !isDeepStrictEqual(request.job.sampling, item.samplingPlan)
      ) {
        throw new AnimaGenerationRequestError(
          'GENERATION_INPUT_CHANGED',
          'The Anima worker command differs from its compiled batch item.',
        )
      }
      return request
    })
    return await use(Object.freeze(requests))
  } finally {
    await rm(stage, { force: true, recursive: true })
  }
}

async function verifyMaterializedTarget(
  filePath: string,
  byteSize: number,
  sha256: string,
): Promise<void> {
  try {
    const file = await open(
      filePath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    )
    try {
      const before = await file.stat({ bigint: true })
      if (
        !before.isFile() ||
        before.size !== BigInt(byteSize) ||
        before.size > BigInt(MAX_TARGET_BYTES)
      ) {
        throw new Error('The materialized target is not a bounded regular file.')
      }
      // Stop at the captured byte size plus one overflow sentinel, even if a writer keeps growing
      // the file after fstat. The read/allocation bound never follows a later EOF or file size.
      const bytes = Buffer.allocUnsafe(byteSize + 1)
      let readBytes = 0
      while (readBytes < bytes.length) {
        const { bytesRead } = await file.read(bytes, readBytes, bytes.length - readBytes, null)
        if (bytesRead === 0) {
          break
        }
        readBytes += bytesRead
      }
      const after = await file.stat({ bigint: true })
      const atPath = await lstat(filePath, { bigint: true })
      if (
        readBytes !== byteSize ||
        createHash('sha256').update(bytes.subarray(0, readBytes)).digest('hex') !== sha256 ||
        before.dev !== after.dev ||
        before.ino !== after.ino ||
        before.size !== after.size ||
        before.mtimeNs !== after.mtimeNs ||
        before.ctimeNs !== after.ctimeNs ||
        before.dev !== atPath.dev ||
        before.ino !== atPath.ino ||
        atPath.isSymbolicLink()
      ) {
        throw new Error('The materialized target changed during verification.')
      }
    } finally {
      await file.close()
    }
  } catch {
    throw new AnimaGenerationRequestError(
      'GENERATION_INPUT_CHANGED',
      'The materialized Anima target failed verification.',
    )
  }
}

async function canonicalScratchBase(basePath: string): Promise<string> {
  if (!path.isAbsolute(basePath) || path.resolve(basePath) !== basePath) {
    throw new AnimaGenerationRequestError(
      'INVALID_STAGING_ROOT',
      'Scratch storage must be absolute.',
    )
  }
  await mkdir(basePath, { recursive: true })
  const real = await realpath(basePath)
  const stat = await lstat(basePath)
  if (real !== basePath || stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new AnimaGenerationRequestError('INVALID_STAGING_ROOT', 'Scratch storage is unavailable.')
  }
  return real
}
