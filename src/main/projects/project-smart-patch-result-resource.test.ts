import type { ProjectTab } from '../../shared/api.js'
import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import { GENERATION_THUMBNAIL_MAX_BYTES } from '../../shared/projects/generation-thumbnail.js'
import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'
import { isProjectSmartPatchResultsSnapshot } from '../../shared/projects/smart-patch-public-generation.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import test from 'node:test'

import type { ProjectService } from './project-service.js'
import type { VerifiedSmartPatchWorldCandidate } from './smart-patch-generation-staging.js'
import type { ProjectWorkerClient } from './worker-client.js'

import { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import { ProjectSmartPatchResultActions } from './project-smart-patch-result-actions.js'
import {
  ProjectSmartPatchResultResource,
  type SmartPatchResultResourceOptions,
} from './project-smart-patch-result-resource.js'
import { paintedPatchFixture } from './test-fixtures/project-mask.js'
import { literalSmartPatchColorPng } from './test-fixtures/smart-patch-input-material.js'

const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

/**
 * This boundary fixture explicitly substitutes the already-verified staging repository and open
 * owner. It proves resource capability/cache policy, not storage verification or CPU generation.
 * The resource reads only payload.context.layerId; the generation suite owns complete frozen rows.
 */
function resourceFixture(
  makeThumbnail: NonNullable<SmartPatchResultResourceOptions['makeThumbnail']>,
) {
  const tabId = `project-v1-${'a'.repeat(64)}`
  const document = createEmptyProjectDocumentV1({ title: 'Signed Smart result' })
  const patch = paintedPatchFixture(document)
  document.layers = [patch]
  const owner = {
    document,
    documentEpoch: 0,
    filePath: '/declared-resource-fixture/Project.igs',
  } as NonNullable<ReturnType<ProjectService['getOpenDocumentForAcceptance']>>
  const image = literalSmartPatchColorPng(
    7,
    5,
    Array.from({ length: 35 }, (_, index) => [20, 80, 140, index === 17 ? 128 : 0]).flat(),
    4,
  )
  const candidateId = randomUUID()
  const candidate: VerifiedSmartPatchWorldCandidate = {
    actualSeed: 37,
    assetPath: '/declared-resource-fixture/world.png',
    bbox: { height: 5, width: 7, x: -19, y: 31 },
    candidateId,
    completedAt: '2026-10-17T10:00:00.000Z',
    completionOrder: 1,
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    finalContributionMask: {
      byteSize: 35,
      height: 5,
      path: '/declared-resource-fixture/mask.png',
      sha256: 'd'.repeat(64),
      width: 7,
    },
    frozenPayloadSha256: 'b'.repeat(64),
    frozenSmartPatchPayloadJson: '{}',
    image: {
      byteSize: image.length,
      height: 5,
      iccSha256: IGS_SRGB_ICC_SHA256,
      sha256: digest(image),
      width: 7,
    },
    kind: 'smart-patch-world-candidate',
    localProjectKey: tabId,
    payload: {
      context: { layerId: patch.id },
    } as VerifiedSmartPatchWorldCandidate['payload'],
    projectPath: owner.filePath,
    queueItemId: candidateId,
    stagingSessionId: randomUUID(),
  }
  let visible = true
  const resource = new ProjectSmartPatchResultResource({
    makeThumbnail,
    projects: { getOpenDocumentForAcceptance: (id) => (id === tabId ? owner : null) },
    queue: { listUnfinishedSmartPatchJobsByProject: async () => [] },
    readLastActualSeed: async () => 37,
    staging: {
      listVerifiedCandidates: async (id) => (visible && id === tabId ? [candidate] : []),
      readVerifiedCandidate: async (input) => {
        if (
          !visible ||
          input.candidateId !== candidate.candidateId ||
          input.documentId !== candidate.documentId ||
          input.frozenPayloadSha256 !== candidate.frozenPayloadSha256 ||
          input.imageSha256 !== candidate.image.sha256 ||
          input.localProjectKey !== candidate.localProjectKey ||
          input.stagingSessionId !== candidate.stagingSessionId
        ) {
          return null
        }
        return {
          candidate,
          finalMaskPngBytes: Buffer.alloc(0),
          imagePngBytes: Buffer.from(image),
        }
      },
    },
  })
  return { candidate, image, owner, resource, revoke: () => (visible = false), tabId }
}

test('Smart thumbnail cache authenticates frozen source ownership and refuses revoked capabilities', async () => {
  let decodes = 0
  const f = resourceFixture((bytes, size) => {
    decodes++
    assert.deepEqual(size, { height: 5, width: 7 })
    return bytes // The authoritative tiny PNG already has the requested thumbnail dimensions.
  })
  const snapshot = await f.resource.list(f.tabId)
  assert.ok(isProjectSmartPatchResultsSnapshot(snapshot))
  const first = snapshot.candidates[0]
  assert.equal(first.disposition, 'available')
  assert.ok(first.thumbnailUrl)
  assert.deepEqual(await f.resource.readImage(first.imageUrl), f.image)
  const thumbnail = await f.resource.readThumbnail(first.thumbnailUrl)
  assert.deepEqual(thumbnail, f.image)
  assert.ok(thumbnail)
  thumbnail.fill(0)
  assert.deepEqual(await f.resource.readThumbnail(first.thumbnailUrl), f.image)
  await f.resource.list(f.tabId)
  assert.equal(
    decodes,
    1,
    'Repeated reads use the bounded derivative cache, with isolated buffers.',
  )
  const substitutedSource = first.thumbnailUrl.replace(f.candidate.image.sha256, '0'.repeat(64))
  assert.equal(await f.resource.readThumbnail(substitutedSource), null)
  assert.equal(await f.resource.readThumbnail(`${first.thumbnailUrl}?path=/outside.png`), null)

  // Equal image bytes cannot carry an earlier frozen-input capability into a different binding.
  f.candidate.frozenPayloadSha256 = 'c'.repeat(64)
  assert.equal(await f.resource.readImage(first.imageUrl), null)
  assert.equal(await f.resource.readThumbnail(first.thumbnailUrl), null)
  const rebound = (await f.resource.list(f.tabId)).candidates[0]
  assert.ok(rebound.thumbnailUrl)
  assert.notEqual(rebound.imageUrl, first.imageUrl)
  assert.notEqual(rebound.thumbnailUrl, first.thumbnailUrl)
  assert.deepEqual(await f.resource.readThumbnail(rebound.thumbnailUrl), f.image)
  assert.equal(decodes, 2, 'The cache key includes the exact frozen-input binding.')

  f.revoke()
  assert.equal(await f.resource.readImage(rebound.imageUrl), null)
  assert.equal(await f.resource.readThumbnail(rebound.thumbnailUrl), null)
  assert.deepEqual((await f.resource.list(f.tabId)).candidates, [])
  assert.equal(
    decodes,
    2,
    'A cached derivative does not bypass authoritative candidate revocation.',
  )
})

test('invalid or oversized Smart thumbnail output preserves the verified full-image fallback', async () => {
  for (const badDerivative of [
    () => Buffer.from('not a PNG'),
    () => Buffer.alloc(GENERATION_THUMBNAIL_MAX_BYTES + 1),
    () => literalSmartPatchColorPng(1, 1, [20, 80, 140, 128], 4),
    () => {
      throw new Error('The optional thumbnail decoder failed.')
    },
  ]) {
    const f = resourceFixture(badDerivative)
    const snapshot = await f.resource.list(f.tabId)
    assert.ok(isProjectSmartPatchResultsSnapshot(snapshot))
    assert.equal(snapshot.recoveryUnavailable, false)
    assert.equal(snapshot.candidates.length, 1)
    const candidate = snapshot.candidates[0]
    assert.equal(candidate.thumbnailUrl, undefined)
    assert.deepEqual(await f.resource.readImage(candidate.imageUrl), f.image)
  }
})

test('public Smart Add acquires the shared image lease only after its private Project gate', async () => {
  // This ordering guard uses the real shared gate and an explicit private-acceptance delegate.
  // The generation integration suite owns actual adoption; no CPU process is needed for this cycle.
  const f = resourceFixture((bytes) => bytes)
  const gate = new ProjectGenerationOperationGate()
  let enteredSave!: () => void
  const saveEntered = new Promise<void>((resolve) => (enteredSave = resolve))
  let finishSave!: () => void
  const saveRelease = new Promise<void>((resolve) => (finishSave = resolve))
  let enteredDelegate!: () => void
  const delegateEntered = new Promise<void>((resolve) => (enteredDelegate = resolve))
  let privateGateActive = false
  const acquisitions: boolean[] = []
  const tab = { documentId: f.owner.document.documentId, id: f.tabId } as ProjectTab
  const composed = { mode: 'txt2img' } as Awaited<ReturnType<ProjectWorkerClient['composeTarget']>>
  const worker = {
    composeTarget: async () => composed,
  } as unknown as ProjectWorkerClient
  const unused = async (): Promise<never> => {
    throw new Error('This gate-order fixture does not perform storage or cancellation.')
  }
  const actions = new ProjectSmartPatchResultActions({
    acceptance: {
      accept: async (tabId, request) => {
        enteredDelegate()
        return await gate.run(tabId, async () => {
          privateGateActive = true
          try {
            assert.deepEqual(
              await request.worker.composeTarget(
                {} as Parameters<ProjectWorkerClient['composeTarget']>[0],
              ),
              composed,
            )
            return {
              documentRevision: f.owner.document.documentRevision,
              kind: 'accepted' as const,
              layerId: f.candidate.payload.context.layerId,
              variantIds: [randomUUID()],
            }
          } finally {
            privateGateActive = false
          }
        })
      },
    },
    chooseDestination: unused,
    gate,
    normalStaging: { listVerifiedCandidates: unused },
    orchestrator: {
      cancelGenerationJob: unused,
      fenceProjectGeneration: unused,
      quiesceSmartPatchForProject: unused,
      releaseProjectGenerationFence: () =>
        assert.fail('No generation fence is used by this fixture.'),
    },
    projects: {
      getOpenDocumentForAcceptance: (id) => (id === f.tabId ? f.owner : null),
      getOpenTabs: () => [tab],
      withCapturedSmartPatchGenerationInput: unused,
    },
    queue: {
      listSmartPatchAcceptanceSessionJobs: unused,
      listUnfinishedSmartPatchJobsByProject: unused,
    },
    staging: {
      discardSessions: unused,
      listVerifiedCandidates: async () => [f.candidate],
      readVerifiedCandidate: unused,
    },
    withWorker: async (use) => {
      acquisitions.push(privateGateActive)
      return await use(worker)
    },
  })
  const save = gate.run(f.tabId, async () => {
    enteredSave()
    await saveRelease
  })
  await saveEntered
  const add = actions.accept(f.tabId, {
    candidateIds: [f.candidate.candidateId],
    documentId: f.owner.document.documentId,
    documentRevision: f.owner.document.documentRevision,
    expectedAvailableIds: [f.candidate.candidateId],
    expectedUnfinishedJobIds: [],
    focusedCandidateId: f.candidate.candidateId,
    kind: 'smart-patch',
    layerId: f.candidate.payload.context.layerId,
  })
  try {
    await Promise.race([
      delegateEntered,
      add.then(() => assert.fail('Add must reach the gate-owning private delegate.')),
    ])
    assert.deepEqual(
      acquisitions,
      [],
      'Add queued behind Save must not hold the shared image lease.',
    )
    finishSave()
    assert.equal(await add, tab)
    assert.deepEqual(
      acquisitions,
      [true],
      'Only the gate-owning private compose request borrows the image lease.',
    )
  } finally {
    finishSave()
    await Promise.allSettled([save, add])
  }
})
