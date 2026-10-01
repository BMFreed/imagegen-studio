import type { ProjectGenerationResultView } from '../../shared/api.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import {
  generationResultSessions,
  reconcileResultSession,
  resultSessionCandidates,
  resultSessionFocus,
  resultSessionSelection,
} from './generation-result-sessions.js'

function fixture() {
  const sessions = [randomUUID(), randomUUID(), randomUUID()]
  const candidates = [0, 1, 0, 2, 1].map((sessionIndex, index): ProjectGenerationResultView => {
    const candidateId = randomUUID()
    const stagingSessionId = sessions[sessionIndex]!
    return {
      actualSeed: index,
      bbox: { height: 64, width: 96, x: -10, y: 20 },
      candidateId,
      completedAt: `2026-10-01T00:00:0${index}.000Z`,
      completionOrder: index + 1,
      imageUrl: `igs-staging://asset/project-v1-${'a'.repeat(64)}/${stagingSessionId}/${candidateId}/${'b'.repeat(64)}/${'c'.repeat(64)}.png`,
      queueItemId: randomUUID(),
      sourceDocumentMismatch: index === 3,
      stagingSessionId,
    }
  })
  return { candidates, sessions }
}

// Production boundary: the projections consumed by actual Canvas and compact Results tray.
// Observable invariant: session navigation affects preview only; reviewed Add keeps its flat scope.
// Controls: interleaved sessions, unavailable filter/focus, orphaned preview and stale selection.
// Mutations: stop filtering visible candidates or count only the visible acceptance selection.
test('Verified candidate sessions preserve first occurrence and candidate order without queue history', () => {
  const { candidates, sessions } = fixture()
  const original = structuredClone(candidates)
  assert.deepEqual(generationResultSessions(candidates), [
    { candidateCount: 2, id: sessions[0] },
    { candidateCount: 2, id: sessions[1] },
    { candidateCount: 1, id: sessions[2] },
  ])
  assert.deepEqual(resultSessionCandidates(candidates, sessions[1]), [candidates[1], candidates[4]])
  assert.equal(resultSessionCandidates(candidates, null), candidates)
  assert.deepEqual(resultSessionCandidates(candidates, randomUUID()), [])
  assert.deepEqual(candidates, original)
})

test('A retained session remains selected; removing its last candidate falls back to All results', () => {
  const { candidates, sessions } = fixture()
  assert.equal(reconcileResultSession(candidates, sessions[0]), sessions[0])
  assert.equal(reconcileResultSession(candidates, null), null)
  assert.equal(reconcileResultSession(candidates, randomUUID()), null)
  const withoutSelectedSession = candidates.filter(
    (candidate) => candidate.stagingSessionId !== sessions[0],
  )
  assert.equal(reconcileResultSession(withoutSelectedSession, sessions[0]), null)
  assert.equal(reconcileResultSession([], sessions[0]), null)
  assert.equal(reconcileResultSession(candidates.slice(2), sessions[0]), sessions[0])
})

test('Preview focus stays visible or moves deterministically without excluding orphaned previews', () => {
  const { candidates, sessions } = fixture()
  const current = candidates[4]!.candidateId
  assert.equal(resultSessionFocus(candidates, sessions[1], current), current)
  assert.equal(resultSessionFocus(candidates, null, current), current)
  assert.equal(resultSessionFocus(candidates, sessions[0], current), candidates[0]!.candidateId)
  assert.equal(
    resultSessionFocus(candidates, sessions[2], current),
    candidates[3]!.candidateId,
    'a different source document prevents Add, not preview',
  )
  assert.equal(resultSessionFocus(candidates, randomUUID(), current), null)
  assert.equal(resultSessionFocus([], null, current), null)
  assert.equal(resultSessionFocus(candidates, null, randomUUID()), candidates[0]!.candidateId)
})

test('Filtered preview retains the global checked count and explains hidden checked results', () => {
  const { candidates, sessions } = fixture()
  const selected = [
    candidates[0]!.candidateId,
    candidates[1]!.candidateId,
    candidates[4]!.candidateId,
    candidates[3]!.candidateId,
    randomUUID(),
  ]
  const original = structuredClone({ candidates, selected })
  assert.deepEqual(resultSessionSelection(candidates, selected, null), { hidden: 0, total: 3 })
  assert.deepEqual(resultSessionSelection(candidates, selected, sessions[0]), {
    hidden: 2,
    total: 3,
  })
  assert.deepEqual(resultSessionSelection(candidates, selected, sessions[1]), {
    hidden: 1,
    total: 3,
  })
  assert.deepEqual(resultSessionSelection(candidates, selected, sessions[2]), {
    hidden: 3,
    total: 3,
  })
  assert.deepEqual(resultSessionSelection(candidates, [], sessions[0]), { hidden: 0, total: 0 })
  assert.deepEqual({ candidates, selected }, original, 'filtering never writes selection or pixels')
})
