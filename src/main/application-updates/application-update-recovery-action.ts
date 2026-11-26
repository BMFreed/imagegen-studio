import type { ApplicationUpdateRecoverySnapshot } from '../../shared/application-updates.js'
import { isApplicationUpdateVersion } from '../../shared/application-updates.js'

import type { VerifiedApplicationArtifact } from './electron-update-checker.js'

import { canonicalRuntimeReleaseJson } from '../runtime/runtime-release.js'
import {
  type ApplicationReleaseTrust,
  copyApplicationReleaseAuthority,
  verifyApplicationReleaseAuthority,
} from './application-release.js'
import {
  AppUpdateRecoveryPublishError,
  inspectRetainedApplicationUpdate,
  publishVerifiedApplicationRecovery,
  type RetainedApplicationRecoverySource,
} from './application-update-staging.js'

const messages = {
  APPLICATION_UPDATE_RECOVERY_SAVE_FAILED:
    'The recovery AppImage could not be saved. Choose a new AppImage path and try again.',
  APPLICATION_UPDATE_RECOVERY_STALE: 'The recovery request changed. Open Updates and try again.',
  APPLICATION_UPDATE_RECOVERY_UNAVAILABLE:
    'A verified recovery AppImage is unavailable. Download and verify an update, then try again.',
} as const

type RecoveryAction = {
  chooseDestination: (suggestedName: string) => Promise<string | null>
  currentVersion: string
  expectedVersion: string
  getRecoveryStatus: () => ApplicationUpdateRecoverySnapshot
  isCurrent: () => boolean
  originalAppImage: string | null
  prepareVerifiedArtifact: (version: string) => Promise<VerifiedApplicationArtifact>
  readTrust: () => Promise<ApplicationReleaseTrust | null>
}

export class ApplicationUpdateRecoveryActionError extends Error {
  constructor(readonly code: keyof typeof messages) {
    super(messages[code])
    this.name = 'ApplicationUpdateRecoveryActionError'
  }
}

/**
 * InvokeAI 4875d965: database_copy.py:_move_into_place uses no_replace.py:publish_noreplace after
 * explicit destination choice and complete copy verification. Reuse Studio's existing no-replace
 * publisher, native download selection and bundled trust verification. This action writes only to
 * the newly chosen AppImage path and never requests close or restart.
 */
export async function saveApplicationRecovery(
  input: RecoveryAction,
): Promise<{ status: 'canceled' | 'saved' }> {
  const {
    chooseDestination,
    currentVersion,
    expectedVersion,
    getRecoveryStatus,
    isCurrent,
    originalAppImage,
    prepareVerifiedArtifact,
    readTrust,
  } = input
  const fromRetainedTarget = expectedVersion === currentVersion
  const recoveryEligible = () => {
    const status = getRecoveryStatus()
    return status.status === 'required' && (!fromRetainedTarget || status.target === 'verified')
  }
  if (!originalAppImage || !isApplicationUpdateVersion(expectedVersion) || !recoveryEligible()) {
    throw new ApplicationUpdateRecoveryActionError('APPLICATION_UPDATE_RECOVERY_UNAVAILABLE')
  }
  const assertCurrent = () => {
    if (!isCurrent() || !recoveryEligible()) {
      throw new ApplicationUpdateRecoveryActionError('APPLICATION_UPDATE_RECOVERY_STALE')
    }
  }
  const readSelection = async (
    failure: 'APPLICATION_UPDATE_RECOVERY_STALE' | 'APPLICATION_UPDATE_RECOVERY_UNAVAILABLE',
  ) => {
    try {
      const rawTrust = await readTrust()
      assertCurrent()
      if (!rawTrust) {
        throw new ApplicationUpdateRecoveryActionError(failure)
      }
      const trustBytes = canonicalRuntimeReleaseJson(rawTrust)
      // The captured data is independent of the asynchronous trust provider's original object.
      const trust = JSON.parse(trustBytes.toString('utf8')) as ApplicationReleaseTrust
      if (fromRetainedTarget) {
        const observed: { source?: RetainedApplicationRecoverySource } = {}
        const inspection = await inspectRetainedApplicationUpdate({
          captureVerifiedTarget: (source) => {
            observed.source = source
          },
          currentAppImage: originalAppImage,
          currentVersion,
          readTrust: async () => trust,
        })
        assertCurrent()
        if (
          inspection.status !== 'retained' ||
          inspection.targetAuthentication !== 'verified' ||
          !observed.source
        ) {
          throw new ApplicationUpdateRecoveryActionError(failure)
        }
        return {
          artifact: null,
          authority: observed.source.authority,
          retainedSource: observed.source,
          sourceAppImage: originalAppImage,
          trust,
          trustBytes,
        }
      }
      const artifact = await prepareVerifiedArtifact(expectedVersion)
      assertCurrent()
      const authority = copyApplicationReleaseAuthority(artifact.authority)
      const manifest = verifyApplicationReleaseAuthority(authority, trust)
      if (
        manifest.version !== expectedVersion ||
        !canonicalRuntimeReleaseJson(manifest).equals(
          canonicalRuntimeReleaseJson(artifact.manifest),
        )
      ) {
        throw new ApplicationUpdateRecoveryActionError(failure)
      }
      return {
        artifact,
        authority,
        retainedSource: undefined,
        sourceAppImage: artifact.path,
        trust,
        trustBytes,
      }
    } catch (error) {
      assertCurrent()
      throw error instanceof ApplicationUpdateRecoveryActionError
        ? error
        : new ApplicationUpdateRecoveryActionError(failure)
    }
  }

  assertCurrent()
  const before = await readSelection('APPLICATION_UPDATE_RECOVERY_UNAVAILABLE')
  assertCurrent()
  let destinationAppImage: string | null
  try {
    destinationAppImage = await chooseDestination(
      `ImageGen-Studio-${expectedVersion}-Recovery.AppImage`,
    )
  } catch {
    assertCurrent()
    throw new ApplicationUpdateRecoveryActionError('APPLICATION_UPDATE_RECOVERY_SAVE_FAILED')
  }
  assertCurrent()
  if (destinationAppImage === null) {
    return { status: 'canceled' }
  }

  const after = await readSelection('APPLICATION_UPDATE_RECOVERY_STALE')
  assertCurrent()
  try {
    before.retainedSource?.assertCurrentSnapshot()
  } catch {
    throw new ApplicationUpdateRecoveryActionError('APPLICATION_UPDATE_RECOVERY_STALE')
  }
  if (
    after.artifact !== before.artifact ||
    after.sourceAppImage !== before.sourceAppImage ||
    after.authority.envelope !== before.authority.envelope ||
    after.authority.releaseNotesJson !== before.authority.releaseNotesJson ||
    !after.trustBytes.equals(before.trustBytes)
  ) {
    throw new ApplicationUpdateRecoveryActionError('APPLICATION_UPDATE_RECOVERY_STALE')
  }
  try {
    await publishVerifiedApplicationRecovery({
      assertReadyToPublish: assertCurrent,
      authority: after.authority,
      destinationAppImage,
      originalAppImage,
      retainedSource: after.retainedSource,
      sourceAppImage: after.sourceAppImage,
      trust: after.trust,
    })
  } catch (error) {
    if (error instanceof AppUpdateRecoveryPublishError) {
      if (error.code === 'APPLICATION_UPDATE_RECOVERY_UNSAFE') {
        assertCurrent()
      }
      throw error
    }
    if (error instanceof ApplicationUpdateRecoveryActionError) {
      throw error
    }
    throw new ApplicationUpdateRecoveryActionError('APPLICATION_UPDATE_RECOVERY_SAVE_FAILED')
  }
  return { status: 'saved' }
}
