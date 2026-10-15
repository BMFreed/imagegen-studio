import { IGS_SRGB_ICC_SHA256 } from '../../../shared/projects/color-profile.js'

import { createHash } from 'node:crypto'
import { chmod, mkdtemp, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type {
  SmartPatchCandidateReadIdentity,
  SmartPatchGenerationStagingTestHooks,
  VerifiedSmartPatchWorldCandidate,
} from '../smart-patch-generation-staging.js'
import type { SmartPatchQueueFixture } from './smart-patch-queue.js'

import { SmartPatchGenerationStagingRepository } from '../smart-patch-generation-staging.js'
import { literalSmartPatchColorPng } from './smart-patch-input-material.js'
import { admitSmartPatch, withSmartPatchQueueFixture } from './smart-patch-queue.js'

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const width = 128
const height = 128

export interface SmartPatchWorldCandidateFixture extends SmartPatchQueueFixture {
  nomination: SmartPatchCandidateReadIdentity
  outputBytes: Buffer
  patch: SmartPatchGenerationStagingRepository
  publish: () => Promise<VerifiedSmartPatchWorldCandidate>
  siblingId: string
}

/** Literal world pixels for the fixture's one-pixel final contribution, independently encoded. */
export function smartPatchWorldPng(wrongAlpha = false): Buffer {
  return literalSmartPatchColorPng(
    width,
    height,
    Array.from({ length: width * height }, (_, index) => [
      20,
      80,
      140,
      index === 515 || (wrongAlpha && index === 0) ? 255 : 0,
    ]).flat(),
    4,
  )
}

/** Real SQL admission/claim, receipts and recovery files; no trained-model inference is claimed. */
export async function withSmartPatchWorldCandidateFixture(
  family: 'anima' | 'illustrious',
  run: (f: SmartPatchWorldCandidateFixture) => Promise<void>,
  hooks: SmartPatchGenerationStagingTestHooks = {},
) {
  await withSmartPatchQueueFixture(family, async (f) => {
    const admitted = await admitSmartPatch(f)
    const claimed = await f.queue.claimNextPendingSmartPatch()
    if (!claimed) {
      throw new Error('The actual Smart Patch fixture was not claimed.')
    }
    const patch = new SmartPatchGenerationStagingRepository(f.database.db, f.root, hooks)
    await patch.recoverAfterRestart()
    const provisionalRoot = await mkdtemp(path.join(f.scratch, 'smart-patch-request-'))
    await chmod(provisionalRoot, 0o700)
    const provisionalOutputPath = path.join(provisionalRoot, 'world-result.png')
    const bytes = smartPatchWorldPng()
    await writeFile(provisionalOutputPath, bytes, { flag: 'wx', mode: 0o600 })
    const nomination: SmartPatchCandidateReadIdentity = {
      candidateId: claimed.item.id,
      documentId: claimed.payload.context.documentId,
      frozenPayloadSha256: digest(Buffer.from(JSON.stringify(claimed.payload))),
      imageSha256: digest(bytes),
      localProjectKey: claimed.item.localProjectKey,
      stagingSessionId: claimed.item.stagingSessionId,
    }
    await run({
      ...f,
      nomination,
      outputBytes: bytes,
      patch,
      publish: () =>
        patch.publishGenerationCandidate({
          actualSeed: 0,
          expectedProvisionalRoot: provisionalRoot,
          expectedStatusSequence: claimed.item.statusSequence,
          output: {
            byteSize: bytes.length,
            colorSpace: 'srgb',
            height,
            iccSha256: IGS_SRGB_ICC_SHA256,
            path: provisionalOutputPath,
            sha256: digest(bytes),
            width,
          },
          provisionalOutputPath,
          queueItemId: claimed.item.id,
        }),
      siblingId: admitted[1].id,
    })
  })
}
