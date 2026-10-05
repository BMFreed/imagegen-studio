import type { AnimaWorkerRequest } from '../../shared/projects/anima-worker-request.js'
import { supportsInferenceAnima } from '../../shared/projects/inference-worker-capabilities.js'

import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { buildQueuedAnimaWorkerRequest } from './anima-generation-dispatch.js'
import {
  type AnimaGenerationModelResolver,
  assertAnimaGenerationTarget,
} from './anima-generation-preparation.js'
import {
  AnimaGenerationRequestError,
  canonicalAnimaScratchBase,
  verifyMaterializedAnimaTarget,
} from './anima-generation-request.js'
import {
  type FrozenQueuedAnimaGenerationV1,
  parseFrozenQueuedAnimaGenerationV1,
  reverifyFrozenQueuedAnimaGeneration,
} from './anima-queued-generation.js'
import { validateSrgbPngStream } from './igs-package.js'

/** Qualify a frozen Retry before its queue publication; never read today's draft or choose a seed. */
export async function withQueuedAnimaGenerationRequest<T>(input: {
  modelService: AnimaGenerationModelResolver
  payload: FrozenQueuedAnimaGenerationV1
  ready: unknown
  scratchBasePath: string
  targetPngBytes: Buffer
  use: (request: AnimaWorkerRequest) => Promise<T>
}): Promise<T> {
  const payload = parseFrozenQueuedAnimaGenerationV1(JSON.stringify(input.payload))
  const bytes = Buffer.from(input.targetPngBytes)
  const ready = structuredClone(input.ready)
  const { modelService, scratchBasePath, use } = input
  if (!supportsInferenceAnima(ready)) {
    throw new AnimaGenerationRequestError(
      'INFERENCE_UNAVAILABLE',
      'The worker has not qualified the original Anima pipeline.',
    )
  }
  assertAnimaGenerationTarget(
    payload.context.target,
    payload.context.bbox,
    bytes,
    payload.workerJob.sampling.mode,
  )
  await validateSrgbPngStream(
    (async function* () {
      yield bytes
    })(),
    'target.png',
    32 * 1024 * 1024,
    2048,
  )
  await reverifyFrozenQueuedAnimaGeneration(payload, modelService)
  const base = await canonicalAnimaScratchBase(scratchBasePath)
  const stage = await mkdtemp(path.join(base, 'anima-request-'))
  try {
    const targetPath = path.join(stage, 'target.png')
    await writeFile(targetPath, bytes, { flag: 'wx', mode: 0o600 })
    await reverifyFrozenQueuedAnimaGeneration(payload, modelService)
    await verifyMaterializedAnimaTarget(
      targetPath,
      payload.context.target.byteSize,
      payload.context.target.sha256,
    )
    const request = buildQueuedAnimaWorkerRequest({
      outputPath: path.join(stage, 'result.png'),
      payload,
      provisionalRoot: stage,
      ready,
      requestId: randomUUID(),
      targetPath,
    })
    return await use(request)
  } finally {
    await rm(stage, { force: true, recursive: true })
  }
}
