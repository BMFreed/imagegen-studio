import {
  type AnimaWorkerRequest,
  captureCompiledAnimaWorkerRequest,
} from '../../shared/projects/anima-worker-request.js'

import {
  type FrozenQueuedAnimaGenerationV1,
  parseFrozenQueuedAnimaGenerationV1,
} from './anima-queued-generation.js'

/** Rebind only disposable transport identity and paths; no resource/default/seed resolution. */
export function buildQueuedAnimaWorkerRequest(input: {
  outputPath: string
  payload: FrozenQueuedAnimaGenerationV1
  provisionalRoot: string
  ready: unknown
  requestId: string
  targetPath: string
}): AnimaWorkerRequest {
  const payload = parseFrozenQueuedAnimaGenerationV1(JSON.stringify(input.payload))
  return captureCompiledAnimaWorkerRequest(
    {
      job: {
        ...payload.workerJob,
        output: { pngPath: input.outputPath, stagingRoot: input.provisionalRoot },
        target: { ...payload.workerJob.target, path: input.targetPath },
      },
      protocolVersion: '1',
      requestId: input.requestId,
      type: payload.kind === 'anima-img2img' ? 'generate-anima-img2img' : 'generate-anima-txt2img',
    },
    input.ready,
  )
}
