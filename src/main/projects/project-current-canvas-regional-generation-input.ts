import {
  type IgsProjectAssetRefV1,
  type IgsProjectDocumentV1,
  parseProjectDocumentV1,
} from '../../shared/projects/project-schema.js'

import { isDeepStrictEqual } from 'node:util'

import type { IgsAssetSource } from './igs-package.js'
import type { FrozenGenerationTarget } from './project-generation-target.js'
import type { CapturedRegionalGuidanceInput } from './project-regional-guidance-input.js'
import type { ProjectWorkerClient } from './worker-client.js'

import { regionalReferenceMembers } from './igs-package.js'
import { composeFrozenGenerationTarget } from './project-generation-target.js'
import { compositionRasterLayers, withFrozenRasterComposition } from './project-raster-snapshot.js'
import {
  REGIONAL_INPUT_CAPTURE_MAX_BYTES,
  withFrozenRegionalGuidanceInput,
} from './project-regional-guidance-input.js'

/** One authored Canvas snapshot and its file leases; this grants no generation permission. */
export interface CapturedCurrentCanvasRegionalGenerationInput {
  assertCurrent: () => void
  composeTarget: (
    worker: Pick<ProjectWorkerClient, 'composeTarget'>,
  ) => Promise<FrozenGenerationTarget>
  document: IgsProjectDocumentV1
  regional: CapturedRegionalGuidanceInput
}

/** Freeze ordinary and regional inputs from one synchronously captured Project owner. */
export async function withFrozenCurrentCanvasRegionalGenerationInput<T>(
  input: {
    assertCurrent: () => void
    document: IgsProjectDocumentV1
    packagePath: string
    pendingSource: (member: IgsProjectAssetRefV1) => IgsAssetSource | null
    scratchBasePath: string
  },
  use: (capture: CapturedCurrentCanvasRegionalGenerationInput) => Promise<T>,
): Promise<T> {
  const document = parseProjectDocumentV1(structuredClone(input.document))
  const { assertCurrent, packagePath, pendingSource, scratchBasePath } = input
  // Resolve both collections now. The second file lease must never consult later coordinator data.
  const regionalMembers = (document.regionalGuidance ?? []).flatMap((region) => [
    ...(region.mask.asset ? [region.mask.asset] : []),
    ...(region.referenceImages ?? []).flatMap((reference) =>
      regionalReferenceMembers(reference).map(({ member }) => member),
    ),
  ])
  // Preserve the regional owner's preflight before copying any caller-owned source buffers.
  const uniqueRegionalMembers = new Map<string, IgsProjectAssetRefV1>()
  for (const member of regionalMembers) {
    const previous = uniqueRegionalMembers.get(member.path)
    if (previous && !isDeepStrictEqual(previous, member)) {
      throw new Error('Captured regional members have conflicting descriptors.')
    }
    uniqueRegionalMembers.set(member.path, member)
  }
  const regionalBytes = [...uniqueRegionalMembers.values()].reduce(
    (total, member) => total + member.bytes,
    0,
  )
  if (!Number.isSafeInteger(regionalBytes) || regionalBytes > REGIONAL_INPUT_CAPTURE_MAX_BYTES) {
    throw new Error('Regional input capture exceeds the 512 MiB staging limit.')
  }
  const members = [
    ...compositionRasterLayers(document).map((layer) => layer.asset),
    ...regionalMembers,
  ]
  const key = (member: IgsProjectAssetRefV1) => `${member.path}:${member.sha256}:${member.bytes}`
  const sources = new Map<string, IgsAssetSource | null>()
  for (const member of members) {
    const identity = key(member)
    if (!sources.has(identity)) {
      const source = pendingSource(structuredClone(member))
      sources.set(
        identity,
        source && ('bytes' in source ? { bytes: Buffer.from(source.bytes) } : { ...source }),
      )
    }
  }
  const capturedSource = (member: IgsProjectAssetRefV1): IgsAssetSource | null => {
    const identity = key(member)
    if (!sources.has(identity)) {
      throw new Error('The member is not part of the captured Canvas input.')
    }
    return sources.get(identity)!
  }
  assertCurrent()
  // A settled request may still have a physical child reading these files. Match the existing
  // Smart capture contract: once exit is unconfirmed this lease can never authorize cleanup.
  let cleanupAllowed = true
  let unconfirmedExit: unknown
  return await withFrozenRasterComposition(
    {
      document,
      packagePath,
      pendingSource: capturedSource,
      scratchBasePath,
      shouldCleanupStaging: () => cleanupAllowed,
      stagePrefix: 'project-target-',
    },
    (composition) =>
      withFrozenRegionalGuidanceInput(
        { assertCurrent, document, packagePath, pendingSource: capturedSource, scratchBasePath },
        async (regional) => {
          // Both acquisitions have completed on the original coordinator, revision and epoch.
          assertCurrent()
          let leaseOpen = true
          let targetTail = Promise.resolve()
          const operations = new Set<Promise<FrozenGenerationTarget>>()
          const composeTarget: CapturedCurrentCanvasRegionalGenerationInput['composeTarget'] = (
            worker,
          ) => {
            if (!leaseOpen) {
              return Promise.reject(new Error('The combined Canvas input lease is closed.'))
            }
            if (!cleanupAllowed) {
              return Promise.reject(unconfirmedExit)
            }
            const composeMethod = worker?.composeTarget
            if (typeof composeMethod !== 'function') {
              return Promise.reject(new TypeError('The captured target worker is unavailable.'))
            }
            const compose = composeMethod.bind(worker)
            // The existing compositor uses one target filename. Serialize concurrent consumers;
            // each owns its verified returned bytes before the next composition can replace it.
            const operation = targetTail
              .then(() => {
                // This call may have queued while an earlier request still appeared healthy.
                if (!cleanupAllowed) {
                  throw unconfirmedExit
                }
                return composeFrozenGenerationTarget(composition, {
                  composeTarget: async (request) =>
                    structuredClone(await compose(structuredClone(request))),
                })
              })
              .catch((error: unknown) => {
                if (
                  typeof error === 'object' &&
                  error !== null &&
                  'code' in error &&
                  error.code === 'WORKER_EXIT_UNCONFIRMED'
                ) {
                  cleanupAllowed = false
                  unconfirmedExit = error
                }
                throw error
              })
            targetTail = operation.then(
              () => undefined,
              () => undefined,
            )
            operations.add(operation)
            const settled = () => {
              operations.delete(operation)
            }
            void operation.then(settled, settled)
            return operation
          }
          try {
            return await use({
              assertCurrent,
              composeTarget,
              document: structuredClone(document),
              regional,
            })
          } catch (error) {
            // The preparation owner closes its child after the callback. A late exit refusal
            // owns the same raster inputs even when composeTarget itself already completed.
            if (
              typeof error === 'object' &&
              error !== null &&
              'code' in error &&
              error.code === 'WORKER_EXIT_UNCONFIRMED'
            ) {
              cleanupAllowed = false
              unconfirmedExit = error
            }
            throw error
          } finally {
            leaseOpen = false
            // Callback failure/return cannot remove files still used by a started composition.
            await Promise.allSettled(operations)
          }
        },
      ),
  )
}
