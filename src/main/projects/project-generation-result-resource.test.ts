import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import type { VerifiedGenerationCandidate } from './generation-staging.js'

import {
  parseGenerationResultImageUrl,
  ProjectGenerationResultResource,
} from './project-generation-result-resource.js'

const localProjectKey = `project-v1-${'a'.repeat(64)}`
const otherProjectKey = `project-v1-${'b'.repeat(64)}`
const imageSha256 = 'c'.repeat(64)

function candidate(): VerifiedGenerationCandidate {
  return {
    actualSeed: 42,
    assetPath: '/private/recovery/result.png',
    bbox: { height: 64, width: 64, x: -24, y: 48 },
    candidateId: randomUUID(),
    completedAt: '2026-09-29T12:00:00.000Z',
    completionOrder: 1,
    documentId: randomUUID(),
    documentRevision: randomUUID(),
    frozenPayloadJson: '{"prompts":"private"}',
    frozenPayloadSha256: 'd'.repeat(64),
    image: {
      byteSize: 3,
      height: 64,
      iccSha256: 'e'.repeat(64),
      sha256: imageSha256,
      width: 64,
    },
    localProjectKey,
    projectPath: '/private/Project.igs',
    queueItemId: randomUUID(),
    stagingSessionId: randomUUID(),
  }
}

test('results list exposes only a bounded view, and signed image URL is scoped to open Project', async () => {
  const published = candidate()
  const image = Buffer.from('png')
  let openDocumentId: string | null = published.documentId
  const reads: unknown[] = []
  const resource = new ProjectGenerationResultResource(
    {
      listVerifiedCandidates: async () => [published],
      readLastActualSeed: async (_key, documentId) =>
        documentId === published.documentId ? 42 : null,
      readVerifiedCandidatePng: async (request) => {
        reads.push(request)
        return image
      },
    },
    (key) => (key === localProjectKey ? openDocumentId : null),
    { listUnfinishedByProjectDocument: async () => [] },
  )

  const snapshot = await resource.list(localProjectKey)
  assert.equal(snapshot.recoveryUnavailable, false)
  assert.equal(snapshot.lastActualSeed, 42)
  assert.deepEqual(snapshot.unfinishedSiblingJobIds, [])
  assert.equal(snapshot.candidates.length, 1)
  const view = snapshot.candidates[0]
  assert.deepEqual(Object.keys(view).sort(), [
    'actualSeed',
    'bbox',
    'candidateId',
    'completedAt',
    'completionOrder',
    'imageUrl',
    'queueItemId',
    'sourceDocumentMismatch',
    'stagingSessionId',
  ])
  assert.equal(view.sourceDocumentMismatch, false)
  assert.equal(JSON.stringify(view).includes('/private'), false)
  assert.equal(JSON.stringify(view).includes('prompts'), false)
  assert.deepEqual(parseGenerationResultImageUrl(view.imageUrl), {
    candidateId: published.candidateId,
    imageSha256,
    localProjectKey,
    stagingSessionId: published.stagingSessionId,
  })
  assert.deepEqual(await resource.readImage(view.imageUrl), image)
  assert.deepEqual(reads, [
    {
      candidateId: published.candidateId,
      imageSha256,
      localProjectKey,
      stagingSessionId: published.stagingSessionId,
    },
  ])

  const forged = [
    view.imageUrl.replace(localProjectKey, otherProjectKey),
    view.imageUrl.replace(published.stagingSessionId, randomUUID()),
    view.imageUrl.replace(published.candidateId, randomUUID()),
    view.imageUrl.replace(imageSha256, 'f'.repeat(64)),
    `${view.imageUrl}?path=/private`,
    `${view.imageUrl}#fragment`,
    view.imageUrl.replace('igs-staging:', 'file:'),
  ]
  for (const url of forged) {
    assert.equal(parseGenerationResultImageUrl(url), null)
    assert.equal(await resource.readImage(url), null)
  }
  assert.equal(reads.length, 1)

  // Replacing the .igs at the same canonical path preserves the local key but changes its
  // documentId. Recovery remains visible for review, with no claim that it belongs to the new doc.
  openDocumentId = randomUUID()
  const reusedPath = await resource.list(localProjectKey)
  assert.equal(reusedPath.candidates[0].sourceDocumentMismatch, true)
  assert.equal(reusedPath.lastActualSeed, null)
  assert.equal(reusedPath.candidates[0].imageUrl, view.imageUrl)
  assert.deepEqual(await resource.readImage(view.imageUrl), image)

  openDocumentId = null
  assert.equal(await resource.readImage(view.imageUrl), null)
  await assert.rejects(resource.list(localProjectKey), { code: 'PROJECT_NOT_OPEN' })
  assert.equal(reads.length, 2)
})

test('unavailable recovery reports an explicit state without exposing result URLs', async () => {
  const resource = new ProjectGenerationResultResource(null, (key) =>
    key === localProjectKey ? randomUUID() : null,
  )
  assert.deepEqual(await resource.list(localProjectKey), {
    candidates: [],
    lastActualSeed: null,
    recoveryUnavailable: true,
    unfinishedSiblingJobIds: [],
  })
  await assert.rejects(resource.list(otherProjectKey), { code: 'PROJECT_NOT_OPEN' })
})

test('results expose unfinished siblings only from eligible completed sessions in the current document', async () => {
  const published = candidate()
  const orphan = { ...candidate(), documentId: randomUUID() }
  const runningSibling = randomUUID()
  const reads: unknown[] = []
  const resource = new ProjectGenerationResultResource(
    {
      listVerifiedCandidates: async () => [published, orphan],
      readLastActualSeed: async () => 0,
      readVerifiedCandidatePng: async () => null,
    },
    (key) => (key === localProjectKey ? published.documentId : null),
    {
      listUnfinishedByProjectDocument: async (key, documentId) => {
        reads.push([key, documentId])
        return [
          { id: runningSibling, localProjectKey, stagingSessionId: published.stagingSessionId },
          { id: randomUUID(), localProjectKey, stagingSessionId: orphan.stagingSessionId },
          { id: randomUUID(), localProjectKey, stagingSessionId: randomUUID() },
          {
            id: randomUUID(),
            localProjectKey: otherProjectKey,
            stagingSessionId: published.stagingSessionId,
          },
        ]
      },
    },
  )
  const snapshot = await resource.list(localProjectKey)
  assert.deepEqual(reads, [[localProjectKey, published.documentId]])
  assert.deepEqual(snapshot.unfinishedSiblingJobIds, [runningSibling])
  assert.equal(snapshot.lastActualSeed, 0)
  assert.deepEqual(
    snapshot.candidates.map((view) => view.sourceDocumentMismatch),
    [false, true],
  )
  assert.equal(JSON.stringify(snapshot).includes('/private'), false)
  assert.equal(JSON.stringify(snapshot).includes('prompts'), false)
})

test('a document replaced during the queue read cannot expose a stale confirmation snapshot', async () => {
  const published = candidate()
  let documentId = published.documentId
  const resource = new ProjectGenerationResultResource(
    {
      listVerifiedCandidates: async () => [published],
      readLastActualSeed: async () => 42,
      readVerifiedCandidatePng: async () => null,
    },
    () => documentId,
    {
      listUnfinishedByProjectDocument: async () => {
        documentId = randomUUID()
        return []
      },
    },
  )
  await assert.rejects(resource.list(localProjectKey), { code: 'PROJECT_NOT_OPEN' })
})

test('missing queue storage cannot claim an available zero-job acceptance snapshot', async () => {
  const published = candidate()
  const resource = new ProjectGenerationResultResource(
    {
      listVerifiedCandidates: async () => [published],
      readLastActualSeed: async () => 42,
      readVerifiedCandidatePng: async () => null,
    },
    () => published.documentId,
    null,
  )
  assert.deepEqual(await resource.list(localProjectKey), {
    candidates: [],
    lastActualSeed: null,
    recoveryUnavailable: true,
    unfinishedSiblingJobIds: [],
  })
})
