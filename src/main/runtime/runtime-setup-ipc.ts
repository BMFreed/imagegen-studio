/**
 * Invoke4875 shared-resource composition: infill.py134 -> invocation_context.py800 ->
 * model_install_default.py1549. Upstream has no signed Electron engine-review protocol. Adapt
 * Studio's existing trusted-main-frame IPC and RuntimeManager capture; this owner never downloads,
 * installs independently, creates another token, or accepts renderer paths.
 */
import type { ApiError, ApiResult, RuntimeStatus } from '../../shared/api.js'
import { ipcChannels } from '../../shared/api.js'
import type { RuntimeSetupMode, RuntimeSetupReview } from '../../shared/runtime-setup.js'
import {
  isRuntimeSetupMode,
  isRuntimeSetupReview,
  isRuntimeSetupToken,
} from '../../shared/runtime-setup.js'

import { isDeepStrictEqual } from 'node:util'

import type { RuntimeInstallationReview, RuntimeManager } from './index.js'

import {
  createEngineInstallPlan,
  ENGINE_OUTPAINT_INFILL_ARTIFACT_ID,
} from './engine-install-plan.js'
import { LAMA_OUTPAINT_ARTIFACT } from './lama-manifest.js'

type Caller = { mainFrame: unknown }
type Request = { sender: unknown; senderFrame: unknown }
type Registrar = {
  handle: (
    channel: string,
    handler: (event: Request, ...args: unknown[]) => Promise<ApiResult<unknown>>,
  ) => void
  removeHandler?: (channel: string) => void
}
type Service = Pick<RuntimeManager, 'getStatus' | 'install' | 'previewInstallation' | 'repair'>

const failure = <T>(code: string, message: string): ApiResult<T> => ({
  error: { code, message },
  ok: false,
})
const rejected = <T>() => failure<T>('IPC_INVALID_CALLER', 'Runtime request was rejected.')
const stale = <T>() =>
  failure<T>('RUNTIME_INVALID_REVIEW', 'Review runtime setup again before continuing.')
const unavailable = <T>() =>
  failure<T>(
    'RUNTIME_INSTALL_UNAVAILABLE',
    'Verified release artifacts and a complete setup preview are not available in this build.',
  )

/** One public capability, bound to this main frame/document. The core owns every actual mutation. */
export function registerRuntimeSetupIpc(
  registrar: Registrar,
  caller: Caller,
  service: Service,
): { dispose: () => void; invalidateReview: () => void } {
  let disposed = false
  let epoch = {}
  let issued: { mode: RuntimeSetupMode; token: string } | null = null
  let previewActive = false
  const channels: string[] = []

  const invalidateReview = () => {
    epoch = {}
    issued = null
  }
  function register(
    channel: string,
    action: (event: Request, args: unknown[]) => Promise<ApiResult<unknown>>,
  ) {
    channels.push(channel)
    registrar.handle(channel, async (event, ...args) => {
      if (disposed || event.sender !== caller || event.senderFrame !== caller.mainFrame) {
        return rejected()
      }
      try {
        return await action(event, args)
      } catch {
        return failure('RUNTIME_INTERNAL_ERROR', 'Runtime service failed.')
      }
    })
  }

  register(ipcChannels.runtime.getStatus, async (_event, args) =>
    args.length === 0 ? await service.getStatus() : rejected(),
  )
  register(ipcChannels.runtime.previewInstallation, async (event, args) => {
    if (args.length !== 1 || !isRuntimeSetupMode(args[0])) {
      return rejected()
    }
    const mode = args[0]
    invalidateReview()
    // Refuse rather than queue another core preview. The older pending reply is now stale.
    if (previewActive) {
      return failure('RUNTIME_INSTALL_BUSY', 'An image setup review is already in progress.')
    }
    previewActive = true
    const observedEpoch = epoch
    try {
      const result = await service.previewInstallation(mode)
      if (disposed || observedEpoch !== epoch || event.senderFrame !== caller.mainFrame) {
        return stale()
      }
      if (!result.ok) {
        return publicSetupFailure(result.error)
      }
      if (result.value.scope !== 'engine') {
        return unavailable()
      }
      const review = projectEngineReview(result.value, mode)
      if (!review) {
        return failure(
          'RUNTIME_INSTALL_PREPARATION_INVALID',
          'The application could not prepare a complete image setup review.',
        )
      }
      issued = { mode, token: review.token }
      return { ok: true, value: review }
    } finally {
      previewActive = false
    }
  })
  register(ipcChannels.runtime.discardInstallationReview, async (_event, args) => {
    if (args.length !== 0) {
      return rejected()
    }
    invalidateReview()
    // Discarding consent never aborts an operation that the core has already accepted.
    return { ok: true, value: null }
  })
  const run = async (
    mode: RuntimeSetupMode,
    args: unknown[],
  ): Promise<ApiResult<RuntimeStatus>> => {
    if (args.length === 0) {
      invalidateReview()
      return unavailable()
    }
    if (args.length !== 1 || !isRuntimeSetupToken(args[0])) {
      return rejected()
    }
    if (!issued || issued.mode !== mode || issued.token !== args[0]) {
      return stale()
    }
    const token = issued.token
    invalidateReview()
    const result = mode === 'install' ? await service.install(token) : await service.repair(token)
    return result.ok ? result : publicSetupFailure(result.error)
  }
  register(ipcChannels.runtime.install, async (_event, args) => await run('install', args))
  register(ipcChannels.runtime.repair, async (_event, args) => await run('repair', args))

  return {
    dispose: () => {
      disposed = true
      invalidateReview()
      for (const channel of channels) {
        registrar.removeHandler?.(channel)
      }
    },
    invalidateReview,
  }
}

/** Core diagnostics may contain local paths; public setup exposes only fixed domain messages. */
function publicSetupFailure<T>(error: ApiError): ApiResult<T> {
  const messages: Record<string, string> = {
    RUNTIME_INSTALL_BUSY: 'Finish current image work before runtime setup.',
    RUNTIME_INSTALL_CANCELED:
      'Runtime setup was canceled. Check runtime status before trying again.',
    RUNTIME_INSTALL_POINTER_CHANGED: 'The active runtime changed; review setup again.',
    RUNTIME_INSTALL_PREPARATION_INVALID:
      'The application could not prepare a complete image setup review.',
    RUNTIME_INSTALL_RECOVERY_REQUIRED: 'Recover interrupted runtime setup before continuing.',
    RUNTIME_INSTALL_UNAVAILABLE:
      'Verified release artifacts and a complete setup preview are not available in this build.',
    RUNTIME_INVALID_REVIEW: 'Review runtime setup again before continuing.',
    RUNTIME_TRANSPORT_CHANGED: 'The verified setup sources changed; review setup again.',
    RUNTIME_UNSUPPORTED: 'This release requires Linux x64 with NVIDIA.',
  }
  return Object.hasOwn(messages, error.code)
    ? failure(error.code, messages[error.code])
    : failure(
        'RUNTIME_INSTALL_FAILED',
        'Image setup could not be completed. Check runtime status before trying again.',
      )
}

/** Explicit allowlist; no local paths, release envelopes/keys, auxiliary token or expanded bytes. */
function projectEngineReview(
  review: Extract<RuntimeInstallationReview, { scope: 'engine' }>,
  mode: RuntimeSetupMode,
): RuntimeSetupReview | null {
  try {
    if (review.mode !== mode || review.requiredFreeBytes !== null) {
      return null
    }
    const artifacts = review.plan.artifacts
    if (!Array.isArray(artifacts) || artifacts.length !== 2) {
      return null
    }
    const runtime = artifacts.find((artifact) => artifact.kind === 'runtime')
    const infill = artifacts.find((artifact) => artifact.kind === 'outpaint-infill')
    if (
      !runtime ||
      runtime.id !== 'python-runtime-transport' ||
      !runtime.sourceCached ||
      runtime.reused ||
      !infill ||
      infill.id !== ENGINE_OUTPAINT_INFILL_ARTIFACT_ID ||
      infill.filename !== LAMA_OUTPAINT_ARTIFACT.filename ||
      infill.sha256 !== LAMA_OUTPAINT_ARTIFACT.sha256 ||
      infill.sizeBytes !== LAMA_OUTPAINT_ARTIFACT.sizeBytes ||
      typeof infill.reused !== 'boolean'
    ) {
      return null
    }
    // Reuse the existing planner's strict byte/reuse/cache accounting rather than duplicate it.
    const expected = createEngineInstallPlan({
      runtimeArtifacts: [
        {
          filename: runtime.filename,
          id: runtime.id,
          installedSizeBytes: runtime.installedSizeBytes,
          sha256: runtime.sha256,
          sizeBytes: runtime.sizeBytes,
        },
      ],
      verifiedCachedRuntimeArtifacts: [
        {
          filename: runtime.filename,
          id: runtime.id,
          sha256: runtime.sha256,
          sizeBytes: runtime.sizeBytes,
        },
      ],
      verifiedInstalledArtifacts: infill.reused
        ? [
            {
              filename: LAMA_OUTPAINT_ARTIFACT.filename,
              id: ENGINE_OUTPAINT_INFILL_ARTIFACT_ID,
              kind: 'outpaint-infill',
              sha256: LAMA_OUTPAINT_ARTIFACT.sha256,
              sizeBytes: LAMA_OUTPAINT_ARTIFACT.sizeBytes,
            },
          ]
        : [],
    })
    if (!isDeepStrictEqual(review.plan, expected)) {
      return null
    }
    const projected = {
      additionalInstalledBytes: expected.totals.additionalInstalledBytes,
      downloadBytes: expected.totals.downloadBytes,
      installedBytes: expected.totals.installedBytes,
      mode,
      outpaintInfillReused: infill.reused,
      releaseId: review.releaseId,
      requiredFreeBytes: null,
      runtimeRequiredFreeBytes: review.runtimeRequiredFreeBytes,
      runtimeSourceCached: true,
      scope: 'engine',
      source: 'verified-local-cache',
      token: review.token,
    }
    return isRuntimeSetupReview(projected) ? projected : null
  } catch {
    return null
  }
}
