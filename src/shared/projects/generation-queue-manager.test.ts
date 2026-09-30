import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import type { GenerationQueueEntry, GenerationQueuePage } from './generation-queue-manager.js'

import {
  GENERATION_QUEUE_PAGE_SIZE,
  generationQueueStatuses,
  isGenerationQueueCursor,
  isGenerationQueuePage,
  isGenerationQueueReview,
  isGenerationQueueTerminalStatuses,
} from './generation-queue-manager.js'

function entry(): GenerationQueueEntry {
  return {
    batchId: randomUUID(),
    cancelRequested: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    details: {
      modelName: 'Illustrious',
      modelVersion: 'v1',
      negativePrompt: '',
      prompt: 'frozen prompt',
      sampling: {
        cfgScale: 7.5,
        predictionType: 'v_prediction',
        sampler: 'DPM++ 2M',
        scheduler: 'Karras',
        seed: 0,
        steps: 24,
      },
      size: { height: 1024, width: 1024 },
    },
    documentId: randomUUID(),
    error: null,
    finishedAt: null,
    id: randomUUID(),
    operation: 'illustrious-txt2img',
    projectKey: `project-v1-${'a'.repeat(64)}`,
    projectName: 'Portrait',
    publicationPending: false,
    startedAt: null,
    status: 'pending',
    statusSequence: 0,
  }
}
function page(items: GenerationQueueEntry[]): GenerationQueuePage {
  return {
    counts: { canceled: 0, completed: 0, failed: 0, pending: 1, running: 0 },
    items,
    nextCursor: null,
  }
}

test('Queue Manager wire guard accepts all actual statuses, seed/sequence zero and missing frozen details', () => {
  for (const status of generationQueueStatuses) {
    const row = { ...entry(), status }
    assert.equal(isGenerationQueuePage(page([row])), true)
    assert.equal(isGenerationQueuePage(page([{ ...row, details: null }])), true)
  }
  const row = entry()
  assert.equal(
    isGenerationQueuePage(
      page([
        {
          ...row,
          details: {
            ...row.details!,
            sampling: { ...row.details!.sampling, predictionType: 'sample' },
          },
        },
      ]),
    ),
    true,
  )
})

test('Queue Manager wire guard rejects paths, malformed refs, duplicate rows, oversized pages and nonterminal clears', () => {
  const row = entry()
  assert.equal(isGenerationQueuePage(page([row, row])), false)
  assert.equal(
    isGenerationQueuePage(page(Array.from({ length: GENERATION_QUEUE_PAGE_SIZE + 1 }, entry))),
    false,
  )
  assert.equal(isGenerationQueuePage({ ...page([row]), path: '/private/staging' }), false)
  assert.equal(
    isGenerationQueuePage(
      page([
        {
          ...row,
          details: { ...row.details!, checkpointPath: '/private/weights' },
        } as GenerationQueueEntry,
      ]),
    ),
    false,
  )
  assert.equal(isGenerationQueuePage(page([{ ...row, projectKey: row.documentId }])), false)
  assert.equal(isGenerationQueuePage(page([{ ...row, statusSequence: -1 }])), false)
  assert.equal(
    isGenerationQueuePage({ ...page([row]), counts: { ...page([]).counts, failed: -1 } }),
    false,
  )
  assert.equal(isGenerationQueueTerminalStatuses(['completed', 'failed', 'canceled']), true)
  for (const invalid of [
    [],
    ['pending'],
    ['running'],
    ['failed', 'failed'],
    ['completed', 'canceled', 'failed', 'completed'],
  ]) {
    assert.equal(isGenerationQueueTerminalStatuses(invalid), false)
  }
})

test('Queue Manager reviewed commands and cursors enforce exact shape before main accepts them', () => {
  const row = entry()
  assert.equal(isGenerationQueueReview({ id: row.id, statusSequence: 0 }), true)
  assert.equal(isGenerationQueueReview({ id: row.id, status: 'pending', statusSequence: 0 }), false)
  assert.equal(
    isGenerationQueueReview({ id: row.id, statusSequence: Number.MAX_SAFE_INTEGER }),
    false,
  )
  assert.equal(isGenerationQueueReview({ id: row.projectKey, statusSequence: 0 }), false)
  assert.equal(isGenerationQueueCursor({ createdAt: row.createdAt, id: row.id }), true)
  assert.equal(isGenerationQueueCursor({ createdAt: 'invalid', id: row.id }), false)
  assert.equal(
    isGenerationQueueCursor({ createdAt: row.createdAt, id: row.id, path: '/private' }),
    false,
  )
})
