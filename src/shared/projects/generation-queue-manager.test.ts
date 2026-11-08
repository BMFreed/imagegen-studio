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
    stagingSessionId: randomUUID(),
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
  assert.ok(row.details && row.details.sampling.animaMethod === undefined)
  assert.equal(
    isGenerationQueuePage(
      page([
        {
          ...row,
          details: {
            ...row.details,
            sampling: { ...row.details.sampling, predictionType: 'sample' },
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

test('Queue Manager wire guard requires a valid staging session identity', () => {
  const row = entry()
  assert.equal(isGenerationQueuePage(page([row])), true)
  for (const stagingSessionId of [undefined, null, '', '/private/staging', row.projectKey]) {
    assert.equal(
      isGenerationQueuePage({ ...page([row]), items: [{ ...row, stagingSessionId }] }),
      false,
    )
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

test('Queue Manager Anima details expose native methods and reject fake SD fields or operation/mode disagreement', () => {
  const legacy = entry()
  const row: GenerationQueueEntry = {
    ...legacy,
    details: {
      ...legacy.details!,
      sampling: { animaMethod: 'heun', cfgScale: 4, seed: 0, steps: 200 },
    },
    operation: 'anima-txt2img',
  }
  assert.equal(isGenerationQueuePage(page([row])), true)
  assert.equal(isGenerationQueuePage(page([{ ...row, details: null }])), true)
  for (const animaMethod of [
    'euler',
    'heun',
    'dpmpp_2m',
    'dpmpp_2m_sde',
    'er_sde',
    'lcm',
  ] as const) {
    assert.equal(
      isGenerationQueuePage(
        page([
          {
            ...row,
            details: {
              ...row.details!,
              sampling: { animaMethod, cfgScale: 4, seed: 0, steps: 200 },
            },
          },
        ]),
      ),
      true,
    )
  }
  const img: GenerationQueueEntry = {
    ...row,
    details: {
      ...row.details!,
      sampling: { animaMethod: 'heun', cfgScale: 4, denoisingStrength: 0, seed: 0, steps: 200 },
    },
    operation: 'anima-img2img',
  }
  assert.equal(isGenerationQueuePage(page([img])), true)
  for (const sampling of [
    { ...row.details!.sampling, sampler: 'Euler' },
    { ...row.details!.sampling, scheduler: 'Normal' },
    { ...row.details!.sampling, predictionType: 'epsilon' },
    { ...row.details!.sampling, cfgRescale: 0 },
    { ...row.details!.sampling, denoisingStrength: 0.5 },
    { ...row.details!.sampling, animaMethod: 'DDIM' },
    { ...row.details!.sampling, cfgScale: 0 },
    { ...row.details!.sampling, steps: 201 },
  ]) {
    assert.equal(
      isGenerationQueuePage({
        ...page([row]),
        items: [{ ...row, details: { ...row.details!, sampling } }],
      }),
      false,
    )
  }
  assert.equal(isGenerationQueuePage(page([{ ...img, details: row.details }])), false)
  assert.equal(isGenerationQueuePage(page([{ ...row, operation: 'illustrious-txt2img' }])), false)
  assert.equal(isGenerationQueuePage(page([{ ...legacy, operation: 'anima-txt2img' }])), false)
})

test('Queue Manager outpaint history requires exact family details and frozen strength without exposing conditioning paths', () => {
  const illustrious = entry()
  const row: GenerationQueueEntry = {
    ...illustrious,
    details: {
      ...illustrious.details!,
      sampling: { ...illustrious.details!.sampling, denoisingStrength: 0 },
    },
    operation: 'illustrious-outpaint',
  }
  const anima: GenerationQueueEntry = {
    ...row,
    details: {
      ...row.details!,
      sampling: { animaMethod: 'heun', cfgScale: 4, denoisingStrength: 1, seed: 0, steps: 4 },
    },
    operation: 'anima-outpaint',
  }
  for (const candidate of [row, anima]) {
    assert.equal(isGenerationQueuePage(page([candidate])), true)
    assert.equal(isGenerationQueuePage(page([{ ...candidate, details: null }])), true)
    const { denoisingStrength: _strength, ...withoutStrength } = candidate.details!.sampling
    assert.equal(typeof _strength, 'number')
    assert.equal(
      isGenerationQueuePage({
        ...page([candidate]),
        items: [{ ...candidate, details: { ...candidate.details!, sampling: withoutStrength } }],
      }),
      false,
    )
    assert.equal(
      isGenerationQueuePage({
        ...page([candidate]),
        items: [
          {
            ...candidate,
            details: { ...candidate.details!, conditioning: { infillPath: '/private/lama' } },
          },
        ],
      }),
      false,
    )
  }
  assert.equal(isGenerationQueuePage(page([{ ...row, operation: 'anima-outpaint' }])), false)
  assert.equal(
    isGenerationQueuePage(page([{ ...anima, operation: 'illustrious-outpaint' }])),
    false,
  )
  assert.equal(isGenerationQueuePage(page([illustrious])), true)
})

test('Smart Patch queue summaries preserve native family and non-grid world bounds without weakening normal bounds', () => {
  const row = entry()
  for (const operation of ['illustrious-smart-patch', 'anima-smart-patch'] as const) {
    const sampling =
      operation === 'anima-smart-patch'
        ? { animaMethod: 'heun' as const, cfgScale: 4, seed: 0, steps: 4 }
        : row.details!.sampling
    const details = { ...row.details!, sampling, size: { height: 1, width: 3 } }
    const patch = { ...row, details, operation }
    assert.equal(isGenerationQueuePage(page([patch])), true)
    assert.equal(
      isGenerationQueuePage(
        page([
          { ...patch, details: { ...details, sampling: { ...sampling, denoisingStrength: 0 } } },
        ]),
      ),
      true,
    )
    assert.equal(
      isGenerationQueuePage(
        page([{ ...patch, details: { ...details, size: { height: 0, width: 3 } } }]),
      ),
      false,
    )
    const opposite =
      operation === 'anima-smart-patch' ? 'illustrious-smart-patch' : 'anima-smart-patch'
    assert.equal(isGenerationQueuePage(page([{ ...patch, operation: opposite }])), false)
    const normal = operation === 'anima-smart-patch' ? 'anima-txt2img' : 'illustrious-txt2img'
    assert.equal(isGenerationQueuePage(page([{ ...patch, operation: normal }])), false)
  }
  assert.equal(isGenerationQueuePage(page([row])), true)
})

test('Queue Manager regional Anima OUT accepts frozen strength for every status and preserves family refusals', () => {
  const base = entry()
  const anima: GenerationQueueEntry = {
    ...base,
    details: {
      ...base.details!,
      sampling: { animaMethod: 'heun', cfgScale: 4, denoisingStrength: 0.5, seed: 123, steps: 20 },
    },
    operation: 'anima-regional-outpaint',
  }
  for (const status of generationQueueStatuses) {
    const candidate = { ...anima, status }
    assert.equal(isGenerationQueuePage(page([candidate])), true, status)
    assert.equal(isGenerationQueuePage(page([{ ...candidate, details: null }])), true)
    const { denoisingStrength: _strength, ...withoutStrength } = candidate.details!.sampling
    assert.equal(_strength, 0.5)
    assert.equal(
      isGenerationQueuePage({
        ...page([]),
        items: [{ ...candidate, details: { ...candidate.details!, sampling: withoutStrength } }],
      }),
      false,
    )
    assert.equal(
      isGenerationQueuePage(page([{ ...candidate, operation: 'anima-regional-txt2img' }])),
      false,
    )
    assert.equal(
      isGenerationQueuePage(page([{ ...candidate, operation: 'illustrious-regional-outpaint' }])),
      false,
    )
    assert.equal(
      isGenerationQueuePage(page([{ ...candidate, operation: 'anima-regional-img2img' }])),
      true,
    )
    assert.equal(isGenerationQueuePage(page([{ ...candidate, operation: 'anima-outpaint' }])), true)
  }
})
