/**
 * Invoke4875 model_install_default.py:_remote_files_from_source and download_default.py:
 * multifile_download/submit_multifile_download separate metadata from acquisition. Its
 * invocation_context.py/infill.py callers consume cached local resources. Signed engine review is
 * absent upstream; compose Studio's existing verifier/cache/extractor/auxiliary owners.
 * RuntimeManager remains the only review-token and installation authority.
 */
import { createHash } from 'node:crypto'
import path from 'node:path'

import type { ModelDownloader, ModelDownloadInput } from '../models/model-downloader.js'
import type { AuxiliaryArtifactInstaller } from './inference-auxiliary-installer.js'

import { validateRuntimeArtifactSource } from '../models/model-downloader.js'
import {
  createEngineInstallPlan,
  ENGINE_OUTPAINT_INFILL_ARTIFACT_ID,
} from './engine-install-plan.js'
import {
  type CapturedEngineInstallation,
  reviewEngineAuxiliary,
} from './engine-installation-review.js'
import { LAMA_OUTPAINT_ARTIFACT } from './lama-manifest.js'
import { RuntimeInstallationError } from './runtime-installation.js'
import { extractRuntimeTransport } from './runtime-release-extraction.js'
import {
  RuntimeTransportError,
  transportNotCanceled,
  verifyRuntimeTransportMetadata,
} from './runtime-release-transport.js'
import {
  type RuntimeReleaseManifest,
  type VerifiedRuntimeRelease,
  verifyRuntimeRelease,
} from './runtime-release.js'
import { cacheRuntimeTransport, inspectRuntimeTransportCache } from './runtime-transport-cache.js'

/** Explicit trusted Main selection; no keys, paths or source policy arrive from renderer. */
export interface EngineMetadataReleaseSelection {
  readonly appVersion: string
  readonly cacheDirectory: string
  readonly runtimeEnvelope: Buffer
  readonly source: Readonly<{ redirectOrigins: readonly string[]; url: string }>
  readonly transportEnvelope: Buffer
  readonly trustedKeys: Readonly<Record<string, string>>
}

/** Metadata delivery is an external Main collaborator, not a shipped discovery/trust service. */
export interface EngineMetadataInstallationBackend {
  readonly auxiliaryInstaller: Pick<AuxiliaryArtifactInstaller, 'install' | 'preview'>
  /** Qualification seam only; production uses the existing HTTPS stream owner. */
  readonly downloader?: Pick<ModelDownloader, 'downloadRuntimeArtifact'>
  readonly loadMetadata: () => Promise<EngineMetadataReleaseSelection | null>
}

export interface EngineRuntimePreparationProgress {
  onProgress?: ModelDownloadInput['onProgress']
  onStage?: (stage: 'extracting-runtime' | 'preparing-runtime') => void
}

export interface CapturedMetadataEngineInstallation {
  readonly manifest: RuntimeReleaseManifest
  readonly plan: CapturedEngineInstallation['plan']
  /** Only the existing RuntimeManager calls this after consuming explicit consent. */
  readonly prepareRelease: (
    signal: AbortSignal,
    outputDirectory: string,
    progress?: EngineRuntimePreparationProgress,
  ) => Promise<{ engine: CapturedEngineInstallation; release: VerifiedRuntimeRelease }>
}

/** Authenticate metadata and inspect existing cache/LaMa without acquiring executable bytes. */
export async function reviewEngineMetadataInstallation(
  supplied: EngineMetadataReleaseSelection,
  backend: EngineMetadataInstallationBackend,
): Promise<CapturedMetadataEngineInstallation> {
  valid(
    Buffer.isBuffer(supplied.runtimeEnvelope) &&
      supplied.runtimeEnvelope.length <= 1024 ** 2 &&
      Buffer.isBuffer(supplied.transportEnvelope) &&
      supplied.transportEnvelope.length <= 1024 ** 2,
    'Runtime metadata must be bounded signed envelopes.',
  )
  valid(
    typeof supplied.cacheDirectory === 'string' &&
      path.isAbsolute(supplied.cacheDirectory) &&
      path.resolve(supplied.cacheDirectory) === supplied.cacheDirectory,
    'A canonical runtime cache entry is required.',
  )
  const selection = Object.freeze({
    appVersion: supplied.appVersion,
    cacheDirectory: supplied.cacheDirectory,
    runtimeEnvelope: Buffer.from(supplied.runtimeEnvelope),
    source: validateRuntimeArtifactSource(supplied.source),
    transportEnvelope: Buffer.from(supplied.transportEnvelope),
    trustedKeys: Object.freeze({ ...supplied.trustedKeys }),
  })
  const metadata = verifyRuntimeTransportMetadata(selection)
  const downloader = backend.downloader
    ? {
        downloadRuntimeArtifact: backend.downloader.downloadRuntimeArtifact.bind(
          backend.downloader,
        ),
      }
    : undefined
  const capturedAuxiliary = {
    install: backend.auxiliaryInstaller.install.bind(backend.auxiliaryInstaller),
    preview: backend.auxiliaryInstaller.preview.bind(backend.auxiliaryInstaller),
  }
  const cached = await inspectRuntimeTransportCache(selection)
  const auxiliary = await reviewEngineAuxiliary(capturedAuxiliary)
  const runtime = {
    filename: metadata.manifest.artifact.filename,
    id: 'python-runtime-transport',
    installedSizeBytes: null,
    sha256: metadata.manifest.artifact.sha256,
    sizeBytes: metadata.manifest.artifact.sizeBytes,
  }
  const plan = createEngineInstallPlan({
    runtimeArtifacts: [runtime],
    verifiedCachedRuntimeArtifacts: cached
      ? [
          {
            filename: runtime.filename,
            id: runtime.id,
            sha256: runtime.sha256,
            sizeBytes: runtime.sizeBytes,
          },
        ]
      : [],
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
    manifest: metadata.runtimeManifest,
    plan,
    prepareRelease: async (
      signal: AbortSignal,
      outputDirectory: string,
      progress?: EngineRuntimePreparationProgress,
    ) => {
      transportNotCanceled(signal)
      progress?.onStage?.('preparing-runtime')
      if (cached) {
        await cached.verifyCompleteTransportSnapshot()
      }
      transportNotCanceled(signal)
      const transport = await cacheRuntimeTransport({
        ...selection,
        downloader,
        onProgress: progress?.onProgress,
        requireCached: cached !== null,
        signal,
      })
      await transport.verifyCompleteTransportSnapshot()
      progress?.onStage?.('extracting-runtime')
      const releaseSelection = await extractRuntimeTransport({
        appVersion: selection.appVersion,
        outputDirectory,
        signal,
        transportDirectory: transport.directory,
        trustedKeys: selection.trustedKeys,
      })
      if (
        !releaseSelection.envelope.equals(selection.runtimeEnvelope) ||
        transport.manifest.runtimeEnvelopeSha256 !==
          createHash('sha256').update(selection.runtimeEnvelope).digest('hex')
      ) {
        throw new RuntimeTransportError(
          'RUNTIME_TRANSPORT_CHANGED',
          'The prepared runtime differs from the reviewed release.',
        )
      }
      await transport.verifyCompleteTransportSnapshot()
      transportNotCanceled(signal)
      const release = await verifyRuntimeRelease(releaseSelection)
      transportNotCanceled(signal)
      const engine: CapturedEngineInstallation = Object.freeze({
        installAuxiliary: async (
          auxiliarySignal: AbortSignal,
          onProgress?: ModelDownloadInput['onProgress'],
        ) => {
          transportNotCanceled(auxiliarySignal)
          await transport.verifyCompleteTransportSnapshot()
          transportNotCanceled(auxiliarySignal)
          await auxiliary.installAuxiliary(auxiliarySignal, onProgress)
        },
        plan,
      })
      return { engine, release }
    },
  })
}

function valid(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new RuntimeInstallationError('RUNTIME_INSTALL_PREPARATION_INVALID', message)
  }
}
