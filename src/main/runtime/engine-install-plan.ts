import { LAMA_OUTPAINT_ARTIFACT } from './lama-manifest.js'

export const ENGINE_OUTPAINT_INFILL_ARTIFACT_ID = 'outpaint-infill-lama'

/** Exact runtime artifacts come from a complete, trusted Main manifest, never a renderer form. */
export interface EngineRuntimeArtifact {
  readonly filename: string
  readonly id: string
  /** Final installed footprint; null means the trusted manifest cannot determine it yet. */
  readonly installedSizeBytes: number | null
  readonly sha256: string
  readonly sizeBytes: number
}

/**
 * Main supplies these only after verifying the installed artifact against its trusted identity.
 * This pure planner neither verifies files nor establishes manifest signatures/completeness.
 */
export interface VerifiedInstalledEngineArtifact {
  readonly filename: string
  readonly id: string
  readonly kind: 'outpaint-infill' | 'runtime'
  readonly sha256: string
  readonly sizeBytes: number
}

export interface EngineInstallPlanInput {
  readonly runtimeArtifacts: readonly EngineRuntimeArtifact[]
  readonly verifiedInstalledArtifacts?: readonly VerifiedInstalledEngineArtifact[]
}

export interface EngineInstallArtifact extends EngineRuntimeArtifact {
  readonly kind: 'outpaint-infill' | 'runtime'
  readonly reused: boolean
}

/** Path-free metadata suitable for a public installation preview after Main builds the plan. */
export interface EngineInstallPlan {
  readonly artifacts: readonly EngineInstallArtifact[]
  readonly totals: Readonly<{
    /**
     * Sum of final footprints that still need installing. Null if any such footprint is unknown.
     * Previously verified artifacts occupy disk already and do not contribute to this number.
     */
    additionalInstalledBytes: number | null
    /** Non-reused source artifacts only; no network/compression overhead is guessed. */
    downloadBytes: number
    /** Complete final engine + shared LaMa footprint; null if any footprint is unknown. */
    installedBytes: number | null
    /**
     * Download artifact bytes only, equal to downloadBytes. This is not all installation staging:
     * an auxiliary publisher may retain the verified download and a destination-filesystem copy
     * concurrently. Unpacking scratch, publisher copies, backups and old runtime slots are not
     * included; these totals do not establish a sufficient free-space peak for an installer.
     */
    stagingBytes: number
  }>
  readonly unknownInstalledSizeArtifactIds: readonly string[]
}

export class EngineInstallPlanError extends Error {
  readonly code = 'INVALID_ENGINE_INSTALL_PLAN'

  constructor(message: string) {
    super(message)
    this.name = 'EngineInstallPlanError'
  }
}

/**
 * Build a full-artifact byte plan for a future engine installer. Main must provide the complete
 * runtime manifest: this helper rejects an empty list but cannot prove an unknown release's
 * completeness. LaMa alone is deliberately not accepted as a complete engine. No filesystem, URL,
 * release trust key, installer behavior or runtime-readiness claim is produced here.
 */
export function createEngineInstallPlan(input: EngineInstallPlanInput): EngineInstallPlan {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, ['runtimeArtifacts'], ['verifiedInstalledArtifacts']) ||
    !Array.isArray(input.runtimeArtifacts) ||
    input.runtimeArtifacts.length === 0
  ) {
    refuse('A complete nonempty runtime artifact manifest is required.')
  }

  const artifacts: EngineInstallArtifact[] = []
  for (let index = 0; index < input.runtimeArtifacts.length; index++) {
    const artifact: unknown = input.runtimeArtifacts[index]
    if (
      !isRecord(artifact) ||
      !hasExactKeys(artifact, ['filename', 'id', 'installedSizeBytes', 'sha256', 'sizeBytes']) ||
      !validIdentity(artifact) ||
      (artifact['installedSizeBytes'] !== null && !validSize(artifact['installedSizeBytes']))
    ) {
      refuse('Every runtime artifact needs a safe exact identity and a known or null footprint.')
    }
    artifacts.push({
      filename: artifact.filename,
      id: artifact.id,
      installedSizeBytes: artifact['installedSizeBytes'],
      kind: 'runtime',
      reused: false,
      sha256: artifact.sha256,
      sizeBytes: artifact.sizeBytes,
    })
  }
  artifacts.push({
    filename: LAMA_OUTPAINT_ARTIFACT.filename,
    id: ENGINE_OUTPAINT_INFILL_ARTIFACT_ID,
    installedSizeBytes: LAMA_OUTPAINT_ARTIFACT.sizeBytes,
    kind: LAMA_OUTPAINT_ARTIFACT.role,
    reused: false,
    sha256: LAMA_OUTPAINT_ARTIFACT.sha256,
    sizeBytes: LAMA_OUTPAINT_ARTIFACT.sizeBytes,
  })

  const byId = new Map<string, EngineInstallArtifact>()
  const filenames = new Set<string>()
  for (const artifact of artifacts) {
    // Case-fold filenames conservatively so this manifest cannot describe colliding destinations.
    const filename = artifact.filename.toLowerCase()
    if (byId.has(artifact.id) || filenames.has(filename)) {
      refuse('Engine artifacts must have unique IDs and filenames, including the pinned LaMa.')
    }
    byId.set(artifact.id, artifact)
    filenames.add(filename)
  }

  if (input.verifiedInstalledArtifacts !== undefined) {
    if (!Array.isArray(input.verifiedInstalledArtifacts)) {
      refuse('Verified installed artifacts must be a finite list of exact Main-owned identities.')
    }
    const seen = new Set<string>()
    for (let index = 0; index < input.verifiedInstalledArtifacts.length; index++) {
      const verified: unknown = input.verifiedInstalledArtifacts[index]
      if (
        !isRecord(verified) ||
        !hasExactKeys(verified, ['filename', 'id', 'kind', 'sha256', 'sizeBytes']) ||
        !validIdentity(verified) ||
        (verified['kind'] !== 'runtime' && verified['kind'] !== 'outpaint-infill')
      ) {
        refuse('An installed artifact verification is not a strict exact identity.')
      }
      const planned = byId.get(verified.id)
      if (
        seen.has(verified.id) ||
        !planned ||
        planned.kind !== verified['kind'] ||
        planned.filename !== verified.filename ||
        planned.sha256 !== verified.sha256 ||
        planned.sizeBytes !== verified.sizeBytes
      ) {
        refuse('An installed artifact verification does not uniquely match the trusted plan.')
      }
      seen.add(verified.id)
      artifacts[artifacts.indexOf(planned)] = { ...planned, reused: true }
    }
  }

  let downloadBytes = 0
  let knownInstalledBytes = 0
  let knownAdditionalInstalledBytes = 0
  let additionalInstalledSizeUnknown = false
  const unknownInstalledSizeArtifactIds: string[] = []
  for (const artifact of artifacts) {
    if (!artifact.reused) {
      downloadBytes = checkedAdd(downloadBytes, artifact.sizeBytes)
    }
    if (artifact.installedSizeBytes === null) {
      unknownInstalledSizeArtifactIds.push(artifact.id)
      additionalInstalledSizeUnknown ||= !artifact.reused
    } else {
      knownInstalledBytes = checkedAdd(knownInstalledBytes, artifact.installedSizeBytes)
      if (!artifact.reused) {
        knownAdditionalInstalledBytes = checkedAdd(
          knownAdditionalInstalledBytes,
          artifact.installedSizeBytes,
        )
      }
    }
  }
  return Object.freeze({
    artifacts: Object.freeze(artifacts.map((artifact) => Object.freeze(artifact))),
    totals: Object.freeze({
      additionalInstalledBytes: additionalInstalledSizeUnknown
        ? null
        : knownAdditionalInstalledBytes,
      downloadBytes,
      installedBytes: unknownInstalledSizeArtifactIds.length === 0 ? knownInstalledBytes : null,
      stagingBytes: downloadBytes,
    }),
    unknownInstalledSizeArtifactIds: Object.freeze(unknownInstalledSizeArtifactIds),
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => required.includes(key) || optional.includes(key))
  )
}

function validIdentity(value: Record<string, unknown>): value is Record<string, unknown> & {
  filename: string
  id: string
  sha256: string
  sizeBytes: number
} {
  return (
    typeof value['id'] === 'string' &&
    /^[A-Z0-9][\w.-]{0,127}$/i.test(value['id']) &&
    typeof value['filename'] === 'string' &&
    /^[A-Z0-9][\w.-]{0,254}$/i.test(value['filename']) &&
    typeof value['sha256'] === 'string' &&
    /^[a-f0-9]{64}$/.test(value['sha256']) &&
    validSize(value['sizeBytes'])
  )
}

function validSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function checkedAdd(total: number, next: number): number {
  if (total > Number.MAX_SAFE_INTEGER - next) {
    refuse('The engine artifact byte total exceeds exact safe-integer accounting.')
  }
  return total + next
}

function refuse(message: string): never {
  throw new EngineInstallPlanError(message)
}
