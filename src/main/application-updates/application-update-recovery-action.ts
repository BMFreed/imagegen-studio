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
  publishVerifiedApplicationRecovery,
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
    expectedVersion,
    getRecoveryStatus,
    isCurrent,
    originalAppImage,
    prepareVerifiedArtifact,
    readTrust,
  } = input
  if (
    !originalAppImage ||
    !isApplicationUpdateVersion(expectedVersion) ||
    getRecoveryStatus().status !== 'required'
  ) {
    throw new ApplicationUpdateRecoveryActionError('APPLICATION_UPDATE_RECOVERY_UNAVAILABLE')
  }
  const assertCurrent = () => {
    if (!isCurrent() || getRecoveryStatus().status !== 'required') {
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
      return { artifact, authority, sourceAppImage: artifact.path, trust, trustBytes }
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
