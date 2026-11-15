/**
 * Invoke4875 download_default.py's constituent byte composition and model_install_default.py:
 * download_and_cache_model (infill.py -> invocation_context.py callers). Eager signed engine review
 * is absent upstream; compose existing Studio transport, plan and auxiliary owners.
 */
import { createHash } from 'node:crypto'

import type { AuxiliaryArtifactInstaller } from './inference-auxiliary-installer.js'
import type { RuntimeReleaseSelection } from './runtime-release.js'

import {
  createEngineInstallPlan,
  ENGINE_OUTPAINT_INFILL_ARTIFACT_ID,
} from './engine-install-plan.js'
import { LAMA_OUTPAINT_ARTIFACT } from './lama-manifest.js'
import { RuntimeInstallationError } from './runtime-installation.js'
import { verifyRuntimeTransport } from './runtime-release-transport.js'

/** Already obtained local source only. Public shipping selection/download stays a separate gate. */
export interface EngineInstallationBackend {
  readonly auxiliaryInstaller: Pick<AuxiliaryArtifactInstaller, 'install' | 'preview'>
  readonly transportDirectory: string
}

/** Private Main capture; no auxiliary token, keys or paths belong in the public byte review. */
export type CapturedEngineInstallation = Awaited<ReturnType<typeof reviewEngineInstallation>>

export async function reviewEngineInstallation(
  selection: RuntimeReleaseSelection,
  backend: EngineInstallationBackend,
) {
  const { auxiliaryInstaller, transportDirectory } = backend
  const capturedAuxiliary = {
    install: auxiliaryInstaller.install.bind(auxiliaryInstaller),
    preview: auxiliaryInstaller.preview.bind(auxiliaryInstaller),
  }
  const transport = await verifyRuntimeTransport({
    appVersion: selection.appVersion,
    directory: transportDirectory,
    trustedKeys: selection.trustedKeys,
  })
  valid(
    transport.manifest.runtimeEnvelopeSha256 ===
      createHash('sha256').update(selection.envelope).digest('hex'),
    'The cached transport does not belong to the reviewed expanded runtime.',
  )
  const auxiliary = await reviewEngineAuxiliary(capturedAuxiliary)
  const runtime = {
    filename: transport.manifest.artifact.filename,
    id: 'python-runtime-transport',
    installedSizeBytes: null,
    sha256: transport.manifest.artifact.sha256,
    sizeBytes: transport.manifest.artifact.sizeBytes,
  }
  const plan = createEngineInstallPlan({
    runtimeArtifacts: [runtime],
    verifiedCachedRuntimeArtifacts: [
      {
        filename: runtime.filename,
        id: runtime.id,
        sha256: runtime.sha256,
        sizeBytes: runtime.sizeBytes,
      },
    ],
    verifiedInstalledArtifacts: auxiliary.installed
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
  return Object.freeze({
    installAuxiliary: async (signal: AbortSignal) => {
      canceled(signal)
      await transport.verifyCompleteTransportSnapshot()
      canceled(signal)
      await auxiliary.installAuxiliary(signal)
    },
    plan,
  })
}

/** One exact LaMa review shared by local and metadata-first engine composition. */
export async function reviewEngineAuxiliary(
  installer: Pick<AuxiliaryArtifactInstaller, 'install' | 'preview'>,
) {
  const install = installer.install.bind(installer)
  const auxiliary = await installer.preview()
  valid(
    auxiliary.scope === 'auxiliary-weights' &&
      auxiliary.artifact.filename === LAMA_OUTPAINT_ARTIFACT.filename &&
      auxiliary.artifact.role === LAMA_OUTPAINT_ARTIFACT.role &&
      auxiliary.artifact.sha256 === LAMA_OUTPAINT_ARTIFACT.sha256 &&
      auxiliary.artifact.sizeBytes === LAMA_OUTPAINT_ARTIFACT.sizeBytes &&
      typeof auxiliary.installed === 'boolean' &&
      auxiliary.requiredDownloadBytes ===
        (auxiliary.installed ? 0 : LAMA_OUTPAINT_ARTIFACT.sizeBytes) &&
      typeof auxiliary.planId === 'string' &&
      auxiliary.planId.length > 0,
    'The engine auxiliary preview must describe the exact pinned LaMa resource.',
  )
  const planId = auxiliary.planId
  return Object.freeze({
    installAuxiliary: async (signal: AbortSignal) => {
      canceled(signal)
      const result = await install(planId, { signal })
      valid(
        result.role === LAMA_OUTPAINT_ARTIFACT.role &&
          result.sha256 === LAMA_OUTPAINT_ARTIFACT.sha256 &&
          result.byteSize === LAMA_OUTPAINT_ARTIFACT.sizeBytes,
        'The engine auxiliary installation returned a different resource.',
      )
      canceled(signal)
    },
    installed: auxiliary.installed,
  })
}

function valid(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new RuntimeInstallationError('RUNTIME_INSTALL_PREPARATION_INVALID', message)
  }
}
function canceled(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new RuntimeInstallationError('RUNTIME_INSTALL_CANCELED', 'Engine setup was canceled.')
  }
}
