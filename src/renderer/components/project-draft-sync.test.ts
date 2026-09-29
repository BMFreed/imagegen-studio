import type { ProjectGenerationDraftChange, ProjectTab } from '../../shared/api.js'
import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { ProjectDraftSync } from './project-draft-sync.js'

function projectTab(): ProjectTab {
  const document = createEmptyProjectDocumentV1({ title: 'Draft test' })
  return {
    autosaveError: null,
    canRedo: false,
    canUndo: false,
    dirty: false,
    generationDraft: document.generationDraft,
    id: document.documentId,
    lastActualSeedSnapshot: null,
    layers: [],
    primaryBbox: document.primaryBbox,
    title: document.title,
  }
}

test('blur seal stays between queued prompt focus groups while earlier IPC is in flight', async () => {
  let saved = projectTab()
  const operations: string[] = []
  let releaseFirst: (() => void) | undefined
  const first = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  const sync = new ProjectDraftSync({
    onAcknowledged: (tab) => {
      saved = tab
    },
    onError: () => assert.fail('Unexpected draft error'),
    onOverlay: () => {},
    seal: async (_tabId, groupId) => {
      operations.push(`seal:${groupId}`)
      return saved
    },
    send: async (_tabId, change, groupId) => {
      assert.equal(change.kind, 'positive-prompt')
      operations.push(`send:${groupId}:${change.text}`)
      if (operations.length === 1) {
        await first
      }
      saved = apply(saved, change)
      return saved
    },
  })

  sync.change(saved, { kind: 'positive-prompt', text: 'first' }, 'first-focus')
  sync.change(saved, { kind: 'positive-prompt', text: 'first complete' }, 'first-focus')
  sync.sealPromptHistory(saved, 'first-focus')
  sync.change(saved, { kind: 'positive-prompt', text: 'second focus' }, 'second-focus')
  const flush = sync.flush(saved.id)
  releaseFirst?.()
  await flush
  assert.deepEqual(operations, [
    'send:first-focus:first',
    'send:first-focus:first complete',
    'seal:first-focus',
    'send:second-focus:second focus',
  ])
  assert.equal(saved.generationDraft.positivePrompt.text, 'second focus')
})

test('coalescing keeps an intervening setting mutation in its original Project history order', async () => {
  let saved = projectTab()
  const order: string[] = []
  let releaseFirst: (() => void) | undefined
  const first = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  const sync = new ProjectDraftSync({
    onAcknowledged: (tab) => {
      saved = tab
    },
    onError: () => assert.fail('Unexpected draft error'),
    onOverlay: () => {},
    send: async (_tabId, change) => {
      order.push(
        change.kind === 'positive-prompt'
          ? `prompt:${change.text}`
          : change.kind === 'seed'
            ? `seed:${change.value}`
            : change.kind,
      )
      if (order.length === 1) {
        await first
      }
      saved = apply(saved, change)
      return saved
    },
  })

  sync.change(saved, { kind: 'positive-prompt', text: 'in flight' })
  sync.change(saved, { kind: 'seed', policy: 'fixed', value: 1 })
  sync.change(saved, { kind: 'positive-prompt', text: 'after seed' })
  sync.change(saved, { kind: 'seed', policy: 'fixed', value: 2 })
  const flush = sync.flush(saved.id)
  releaseFirst?.()
  await flush
  assert.deepEqual(order, ['prompt:in flight', 'seed:1', 'prompt:after seed', 'seed:2'])
  assert.equal(saved.generationDraft.positivePrompt.text, 'after seed')
  assert.deepEqual(saved.generationDraft.seed, { policy: 'fixed', value: 2 })
})

function apply(tab: ProjectTab, change: ProjectGenerationDraftChange): ProjectTab {
  const next = structuredClone(tab)
  switch (change.kind) {
    case 'negative-prompt': {
      next.generationDraft.negativePrompt.text = change.text

      break
    }
    case 'positive-prompt': {
      next.generationDraft.positivePrompt.text = change.text

      break
    }
    case 'sampling-cfg-scale': {
      next.generationDraft.sampling.cfgScale = change.value

      break
    }
    case 'sampling-pair': {
      next.generationDraft.sampling.sampler = change.sampler
      next.generationDraft.sampling.scheduler = change.scheduler

      break
    }
    case 'sampling-steps': {
      next.generationDraft.sampling.steps = change.value

      break
    }
    case 'seed': {
      next.generationDraft.seed = { policy: change.policy, value: change.value }

      break
    }
    // No default
  }
  next.dirty = true
  return next
}

test('keeps latest typing visible and flush waits for serialized changes', async () => {
  let saved = projectTab()
  const sent: ProjectGenerationDraftChange[] = []
  const overlays: (ProjectTab['generationDraft'] | null)[] = []
  let releaseFirst: (() => void) | undefined
  const first = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  const sync = new ProjectDraftSync({
    onAcknowledged: (tab) => {
      saved = tab
    },
    onError: () => assert.fail('Unexpected draft error'),
    onOverlay: (_tabId, draft) => overlays.push(draft),
    send: async (_tabId, change) => {
      sent.push(change)
      if (sent.length === 1) {
        await first
      }
      saved = apply(saved, change)
      return saved
    },
  })

  sync.change(saved, { kind: 'positive-prompt', text: 'a' })
  sync.change(saved, { kind: 'positive-prompt', text: 'a portrait' })
  sync.change(saved, { kind: 'negative-prompt', text: 'blur' })
  sync.change(saved, { kind: 'seed', policy: 'fixed', value: 42 })
  assert.equal(overlays.at(-1)?.positivePrompt.text, 'a portrait')
  assert.equal(overlays.at(-1)?.negativePrompt.text, 'blur')
  assert.deepEqual(overlays.at(-1)?.seed, { policy: 'fixed', value: 42 })
  assert.deepEqual(sent, [{ kind: 'positive-prompt', text: 'a' }])

  const flush = sync.flush(saved.id)
  releaseFirst?.()
  await flush
  assert.deepEqual(sent, [
    { kind: 'positive-prompt', text: 'a' },
    { kind: 'positive-prompt', text: 'a portrait' },
    { kind: 'negative-prompt', text: 'blur' },
    { kind: 'seed', policy: 'fixed', value: 42 },
  ])
  assert.equal(saved.generationDraft.positivePrompt.text, 'a portrait')
  assert.equal(saved.generationDraft.negativePrompt.text, 'blur')
  assert.deepEqual(saved.generationDraft.seed, { policy: 'fixed', value: 42 })
  assert.equal(overlays.at(-1), null)
})

test('Steps and CFG scale stay independent during rapid edits and Save flush', async () => {
  let saved = projectTab()
  const sent: ProjectGenerationDraftChange[] = []
  const overlays: (ProjectTab['generationDraft'] | null)[] = []
  let releaseFirst: (() => void) | undefined
  const first = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  const sync = new ProjectDraftSync({
    onAcknowledged: (tab) => {
      saved = tab
    },
    onError: () => assert.fail('Unexpected draft error'),
    onOverlay: (_tabId, draft) => overlays.push(draft),
    send: async (_tabId, change) => {
      sent.push(change)
      if (sent.length === 1) {
        await first
      }
      saved = apply(saved, change)
      return saved
    },
  })

  sync.change(saved, { kind: 'sampling-steps', value: 20 })
  sync.change(saved, { kind: 'sampling-cfg-scale', value: 7.5 })
  sync.change(saved, { kind: 'sampling-steps', value: 28 })
  assert.equal(overlays.at(-1)?.sampling.steps, 28)
  assert.equal(overlays.at(-1)?.sampling.cfgScale, 7.5)
  assert.deepEqual(sent, [{ kind: 'sampling-steps', value: 20 }])

  const flush = sync.flush(saved.id)
  releaseFirst?.()
  await flush
  assert.deepEqual(sent, [
    { kind: 'sampling-steps', value: 20 },
    { kind: 'sampling-cfg-scale', value: 7.5 },
    { kind: 'sampling-steps', value: 28 },
  ])
  assert.deepEqual(saved.generationDraft.sampling, {
    cfgScale: 7.5,
    denoisingStrength: null,
    sampler: null,
    scheduler: null,
    steps: 28,
  })
  assert.equal(overlays.at(-1), null)

  sync.change(saved, { kind: 'sampling-cfg-scale', value: null })
  sync.change(saved, { kind: 'sampling-steps', value: null })
  await sync.flush(saved.id)
  assert.equal(saved.generationDraft.sampling.steps, null)
  assert.equal(saved.generationDraft.sampling.cfgScale, null)
})

test('sampler and scheduler edits stay paired through pending draft overlay and flush', async () => {
  let saved = projectTab()
  const sent: ProjectGenerationDraftChange[] = []
  const overlays: (ProjectTab['generationDraft'] | null)[] = []
  let releaseFirst: (() => void) | undefined
  const first = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  const sync = new ProjectDraftSync({
    onAcknowledged: (tab) => {
      saved = tab
    },
    onError: () => assert.fail('Unexpected draft error'),
    onOverlay: (_tabId, draft) => overlays.push(draft),
    send: async (_tabId, change) => {
      sent.push(change)
      if (sent.length === 1) {
        await first
      }
      saved = apply(saved, change)
      return saved
    },
  })

  sync.change(saved, { kind: 'sampling-pair', sampler: 'DPM++ 2M', scheduler: null })
  sync.change(saved, { kind: 'sampling-pair', sampler: 'DPM++ 2M', scheduler: 'Karras' })
  assert.deepEqual(
    {
      sampler: overlays.at(-1)?.sampling.sampler,
      scheduler: overlays.at(-1)?.sampling.scheduler,
    },
    { sampler: 'DPM++ 2M', scheduler: 'Karras' },
  )
  assert.deepEqual(sent, [{ kind: 'sampling-pair', sampler: 'DPM++ 2M', scheduler: null }])

  const flush = sync.flush(saved.id)
  releaseFirst?.()
  await flush
  assert.deepEqual(sent, [
    { kind: 'sampling-pair', sampler: 'DPM++ 2M', scheduler: null },
    { kind: 'sampling-pair', sampler: 'DPM++ 2M', scheduler: 'Karras' },
  ])
  assert.equal(saved.generationDraft.sampling.sampler, 'DPM++ 2M')
  assert.equal(saved.generationDraft.sampling.scheduler, 'Karras')
  assert.equal(overlays.at(-1), null)
})

test('new edit after failed request restarts even before the failed run settles', async () => {
  let saved = projectTab()
  const sent: ProjectGenerationDraftChange[] = []
  let sync!: ProjectDraftSync
  sync = new ProjectDraftSync({
    onAcknowledged: (tab) => {
      saved = tab
    },
    onError: () => {
      sync.change(saved, { kind: 'positive-prompt', text: 'corrected' })
    },
    onOverlay: () => {},
    send: async (_tabId, change) => {
      sent.push(change)
      if (sent.length === 1) {
        throw new Error('Transient IPC failure')
      }
      saved = apply(saved, change)
      return saved
    },
  })

  sync.change(saved, { kind: 'positive-prompt', text: 'first' })
  await sync.flush(saved.id)
  assert.deepEqual(sent, [
    { kind: 'positive-prompt', text: 'first' },
    { kind: 'positive-prompt', text: 'corrected' },
  ])
  assert.equal(saved.generationDraft.positivePrompt.text, 'corrected')
})

test('failed queued edit blocks flush and preserves the draft for retry', async () => {
  let saved = projectTab()
  let fail = true
  let overlay: ProjectTab['generationDraft'] | null = null
  const sync = new ProjectDraftSync({
    onAcknowledged: (tab) => {
      saved = tab
    },
    onError: () => {},
    onOverlay: (_tabId, draft) => {
      overlay = draft
    },
    send: async (_tabId, change) => {
      if (fail) {
        throw new Error('IPC unavailable')
      }
      saved = apply(saved, change)
      return saved
    },
  })

  sync.change(saved, { kind: 'negative-prompt', text: 'distortion' })
  await assert.rejects(sync.flush(saved.id), /IPC unavailable/)
  assert.equal((overlay as ProjectTab['generationDraft'] | null)?.negativePrompt.text, 'distortion')
  assert.equal(saved.generationDraft.negativePrompt.text, '')
  fail = false
  await sync.flush(saved.id)
  assert.equal(saved.generationDraft.negativePrompt.text, 'distortion')
  assert.equal(overlay, null)
})

test('window-close flush waits for draft updates in every open project', async () => {
  const first = projectTab()
  const second = projectTab()
  const saved = new Map([
    [first.id, first],
    [second.id, second],
  ])
  const releases = new Map<string, () => void>()
  let finished = false
  const sync = new ProjectDraftSync({
    onAcknowledged: (tab) => saved.set(tab.id, tab),
    onError: () => assert.fail('Unexpected draft error'),
    onOverlay: () => {},
    send: async (tabId, change) => {
      await new Promise<void>((resolve) => releases.set(tabId, resolve))
      const tab = saved.get(tabId)
      assert.ok(tab)
      return apply(tab, change)
    },
  })
  sync.change(first, { kind: 'positive-prompt', text: 'first project' })
  sync.change(second, { kind: 'negative-prompt', text: 'second project' })
  const flush = sync.flushAll().then(() => {
    finished = true
  })
  releases.get(first.id)?.()
  await Promise.resolve()
  assert.equal(finished, false)
  releases.get(second.id)?.()
  await flush
  assert.equal(saved.get(first.id)?.generationDraft.positivePrompt.text, 'first project')
  assert.equal(saved.get(second.id)?.generationDraft.negativePrompt.text, 'second project')
})
