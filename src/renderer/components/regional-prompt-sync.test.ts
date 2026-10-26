import type { ProjectTab } from '../../shared/api.js'
import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'
import type {
  ProjectRegionalGuidanceOwner,
  ProjectRegionalGuidancePromptChange,
} from '../../shared/projects/regional-guidance.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { RegionalPromptSync } from './regional-prompt-sync.js'

function fixture() {
  const document = createEmptyProjectDocumentV1({ title: 'Regional stream' })
  let current: ProjectTab | undefined = {
    ...document,
    acceptedResults: [],
    autosaveError: null,
    canRedo: false,
    canUndo: false,
    dirty: false,
    id: `project-v1-${'a'.repeat(64)}`,
    layers: [],
    regionalGuidance: [0, 1].map((index) => ({
      enabled: index === 0,
      id: randomUUID(),
      locked: false,
      mask: { asset: null, id: randomUUID(), revision: 0 },
      name: `Region ${index}`,
      overlayOpacity: 0.5,
      prompts: {
        negative: { embeddingRefs: [], text: 'custom negative' },
        positive: { embeddingRefs: [], text: 'start' },
        useGlobalNegativePrompt: false,
      },
    })),
  }
  const calls: {
    change?: ProjectRegionalGuidancePromptChange
    group?: string
    owner?: ProjectRegionalGuidanceOwner
  }[] = []
  const errors: (string | null)[] = []
  const overlays: unknown[] = []
  const acknowledgements: ProjectTab[] = []
  let beforeSend = async () => {}
  const sync = new RegionalPromptSync({
    current: () => current,
    onAcknowledged: (tab) => {
      current = tab
      acknowledgements.push(structuredClone(tab))
      sync.observe(tab)
    },
    onError: (_id, error) => errors.push(error?.message ?? null),
    onOverlay: (_id, value) => overlays.push(structuredClone(value)),
    seal: async (_tabId, group) => {
      calls.push({ group })
      return structuredClone(current!)
    },
    send: async (_tabId, owner, change) => {
      calls.push({ change: structuredClone(change), owner: { ...owner } })
      await beforeSend()
      const next = structuredClone(current!)
      assert.equal(owner.documentRevision, next.documentRevision)
      const region = next.regionalGuidance!.find((value) => value.id === owner.regionId)!
      if (change.kind === 'text') {
        region.prompts![change.polarity]!.text = change.text
      } else if (change.kind === 'negative-source') {
        region.prompts!.useGlobalNegativePrompt = change.useGlobalNegativePrompt
      } else if (!change.present) {
        region.prompts![change.polarity] = null
      }
      next.documentRevision = randomUUID()
      return next
    },
  })
  return {
    acknowledgements,
    calls,
    errors,
    overlays,
    owner: (index = 0): ProjectRegionalGuidanceOwner => ({
      documentId: current!.documentId,
      documentRevision: current!.documentRevision,
      regionId: current!.regionalGuidance![index]!.id,
    }),
    setBeforeSend: (run: () => Promise<void>) => {
      beforeSend = run
    },
    setCurrent: (tab: ProjectTab | undefined) => {
      current = tab
    },
    sync,
    tab: () => current!,
  }
}

function gate() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

test('one document stream preserves typing, region order and blur seals while advancing only its own ACK revisions', async () => {
  const f = fixture()
  const held = gate()
  let first = true
  f.setBeforeSend(async () => {
    if (first) {
      first = false
      await held.promise
    }
  })
  const owner = f.owner()
  const other = f.owner(1)
  const baseline = structuredClone(f.tab())
  f.sync.change(f.tab(), owner, {
    historyGroupId: 'focus-a',
    kind: 'text',
    polarity: 'positive',
    text: 'first',
  })
  f.sync.change(f.tab(), owner, {
    historyGroupId: 'focus-a',
    kind: 'text',
    polarity: 'positive',
    text: 'second',
  })
  f.sync.change(f.tab(), owner, {
    historyGroupId: 'focus-a',
    kind: 'text',
    polarity: 'positive',
    text: 'final',
  })
  f.sync.seal(f.tab(), owner, 'focus-a')
  f.sync.change(f.tab(), other, {
    historyGroupId: 'focus-b',
    kind: 'text',
    polarity: 'negative',
    text: 'second region',
  })
  assert.equal(f.calls.length, 1)
  assert.equal(f.sync.hasPending(f.tab().id), true)
  assert.deepEqual(f.tab(), baseline, 'optimistic typing never rewrites the acknowledged tab')
  held.release()
  await f.sync.flush(f.tab().id)
  assert.deepEqual(
    f.calls.map((call) => (call.change?.kind === 'text' ? call.change.text : call.group)),
    ['first', 'final', 'focus-a', 'second region'],
  )
  assert.equal(f.tab().regionalGuidance![0]!.prompts!.positive!.text, 'final')
  assert.equal(f.tab().regionalGuidance![1]!.prompts!.negative!.text, 'second region')
  assert.deepEqual(f.tab().generationDraft, baseline.generationDraft)
  assert.equal(f.calls[1]!.owner!.documentRevision, f.acknowledgements[0]!.documentRevision)
  assert.equal(f.calls[3]!.owner!.documentRevision, f.acknowledgements[1]!.documentRevision)
  assert.equal(f.sync.hasPending(f.tab().id), false)
  assert.equal(f.overlays.at(-1), null)
})

test('embedding choices and source toggles are coalescing barriers; the caller request is detached', async () => {
  const f = fixture()
  const held = gate()
  f.setBeforeSend(() => held.promise)
  const owner = f.owner()
  const change: ProjectRegionalGuidancePromptChange = {
    embeddingSelection: {
      resourceId: 'exact-resource',
      token: '<literal>',
      versionId: 'exact-version',
    },
    kind: 'text',
    polarity: 'positive',
    text: 'captured',
  }
  f.sync.change(f.tab(), owner, change)
  change.text = 'mutated caller'
  change.embeddingSelection!.resourceId = 'foreign'
  f.sync.change(f.tab(), owner, { kind: 'text', polarity: 'positive', text: 'plain before choice' })
  f.sync.change(f.tab(), owner, {
    embeddingSelection: {
      resourceId: 'second-resource',
      token: '<literal>',
      versionId: 'second-version',
    },
    kind: 'text',
    polarity: 'positive',
    text: '<literal>',
  })
  f.sync.change(f.tab(), owner, { kind: 'negative-source', useGlobalNegativePrompt: true })
  f.sync.change(f.tab(), owner, { kind: 'text', polarity: 'positive', text: 'plain after source' })
  assert.ok(f.overlays.at(-1))
  held.release()
  await f.sync.flush(f.tab().id)
  assert.equal(f.calls.length, 5)
  assert.equal(f.calls[0]!.change?.kind, 'text')
  assert.deepEqual(f.calls[0]!.change, {
    embeddingSelection: {
      resourceId: 'exact-resource',
      token: '<literal>',
      versionId: 'exact-version',
    },
    kind: 'text',
    polarity: 'positive',
    text: 'captured',
  })
  assert.deepEqual(
    f.tab().regionalGuidance![0]!.prompts!.positive!.embeddingRefs,
    [],
    'optimistic selection never invents a verified resource',
  )
})

test('a rejected write retains the latest editable text; correction replaces only the failed adjacent operation', async () => {
  const f = fixture()
  f.setBeforeSend(async () => {
    throw new Error('Document size limit')
  })
  f.sync.change(f.tab(), f.owner(), {
    kind: 'text',
    polarity: 'positive',
    text: 'oversized authored text',
  })
  await assert.rejects(f.sync.flush(f.tab().id), /Document size limit/)
  assert.equal(f.tab().regionalGuidance![0]!.prompts!.positive!.text, 'start')
  assert.ok(JSON.stringify(f.overlays.at(-1)).includes('oversized authored text'))
  f.setBeforeSend(async () => {})
  f.sync.change(f.tab(), f.owner(), { kind: 'text', polarity: 'positive', text: 'corrected' })
  await f.sync.flush(f.tab().id)
  assert.equal(f.tab().regionalGuidance![0]!.prompts!.positive!.text, 'corrected')
  assert.equal(f.errors.at(-1), null)
})

test('a transient failed write retries its captured revision before the queued history seal', async () => {
  const f = fixture()
  let refusal = true
  f.setBeforeSend(async () => {
    if (refusal) {
      refusal = false
      throw new Error('Transport unavailable')
    }
  })
  const owner = f.owner()
  f.sync.change(f.tab(), owner, { kind: 'text', polarity: 'positive', text: 'retry me' })
  await assert.rejects(f.sync.flush(f.tab().id), /Transport unavailable/)
  f.sync.seal(f.tab(), owner, 'captured-focus')
  await f.sync.flush(f.tab().id)
  assert.equal(f.calls.at(-1)!.group, 'captured-focus')
  assert.equal(f.calls[0]!.owner!.documentRevision, f.calls[1]!.owner!.documentRevision)
  assert.equal(f.tab().regionalGuidance![0]!.prompts!.positive!.text, 'retry me')
})

test('correction after blur supersedes only the refused text while preserving its queued seal', async () => {
  const f = fixture()
  const owner = f.owner()
  f.setBeforeSend(async () => {
    const change = f.calls.at(-1)?.change
    if (change?.kind === 'text' && change.text === 'refused text') {
      throw new Error('Invalid authored input')
    }
  })
  f.sync.change(f.tab(), owner, {
    historyGroupId: 'first focus',
    kind: 'text',
    polarity: 'positive',
    text: 'refused text',
  })
  f.sync.seal(f.tab(), owner, 'first focus')
  await assert.rejects(f.sync.flush(f.tab().id), /Invalid authored input/)
  f.sync.change(f.tab(), owner, {
    historyGroupId: 'second focus',
    kind: 'text',
    polarity: 'positive',
    text: 'corrected after returning',
  })
  await f.sync.flush(f.tab().id)
  assert.deepEqual(
    f.calls.map((call) => (call.change?.kind === 'text' ? call.change.text : call.group)),
    ['refused text', 'first focus', 'corrected after returning'],
  )
  assert.equal(f.tab().regionalGuidance![0]!.prompts!.positive!.text, 'corrected after returning')
})

test('an observed edit then Undo cannot revive a held regional success or silently rebase later text', async () => {
  const f = fixture()
  const held = gate()
  const saved = structuredClone(f.tab())
  f.setBeforeSend(() => held.promise)
  f.sync.change(f.tab(), f.owner(), {
    kind: 'text',
    polarity: 'positive',
    text: 'pending authoring',
  })
  const edited = { ...saved, documentRevision: randomUUID(), title: 'outside edit' }
  f.sync.observe(edited)
  f.sync.observe(saved)
  held.release()
  await assert.rejects(f.sync.flush(saved.id), /Project changed/)
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(f.acknowledgements.length, 0)
  assert.deepEqual(f.tab(), saved)
  assert.ok(JSON.stringify(f.overlays.at(-1)).includes('pending authoring'))
  f.sync.change(f.tab(), f.owner(), { kind: 'text', polarity: 'positive', text: 'still local' })
  assert.equal(f.calls.length, 1)
  f.sync.discard(saved.id)
  assert.equal(f.sync.hasPending(saved.id), false)
  assert.equal(f.overlays.at(-1), null)
  assert.deepEqual(f.tab(), saved)
})

test('a replacement document suppresses a late reply without opening a tab or publishing an overlay', async () => {
  const f = fixture()
  const held = gate()
  f.setBeforeSend(() => held.promise)
  const id = f.tab().id
  f.sync.change(f.tab(), f.owner(), { kind: 'text', polarity: 'positive', text: 'old lifetime' })
  f.sync.forget(id)
  const replacement = { ...structuredClone(f.tab()), documentId: randomUUID() }
  f.setCurrent(replacement)
  held.release()
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(f.acknowledgements.length, 0)
  assert.equal(f.overlays.at(-1), null)
  assert.equal(f.sync.hasPending(id), false)
  assert.deepEqual(f.tab(), replacement)
})

test('a disposed stream suppresses late errors as well as successes', async () => {
  const f = fixture()
  const held = gate()
  f.setBeforeSend(async () => {
    await held.promise
    throw new Error('obsolete transport error')
  })
  const id = f.tab().id
  f.sync.change(f.tab(), f.owner(), { kind: 'text', polarity: 'positive', text: 'abandoned' })
  f.sync.forget(id)
  const count = f.errors.length
  held.release()
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(f.errors.length, count)
  assert.equal(f.overlays.at(-1), null)
})

test('a changed owner or revision refuses before sending, and explicit discard cannot race an in-flight write', async () => {
  const f = fixture()
  f.sync.change(
    f.tab(),
    { ...f.owner(), regionId: randomUUID() },
    { kind: 'text', polarity: 'positive', text: 'foreign' },
  )
  f.sync.change(
    f.tab(),
    { ...f.owner(), documentRevision: randomUUID() },
    { kind: 'text', polarity: 'positive', text: 'stale' },
  )
  assert.equal(f.calls.length, 0)
  const held = gate()
  f.setBeforeSend(() => held.promise)
  f.sync.change(f.tab(), f.owner(), { kind: 'text', polarity: 'positive', text: 'real pending' })
  assert.throws(() => f.sync.discard(f.tab().id), /Wait for the regional update/)
  held.release()
  await f.sync.flush(f.tab().id)
  assert.equal(f.tab().regionalGuidance![0]!.prompts!.positive!.text, 'real pending')
})

test('failed embedding choices remain barriers while their exact token is still authored', async () => {
  const f = fixture()
  const owner = f.owner()
  const selection = { resourceId: randomUUID(), token: '<missing>', versionId: randomUUID() }
  f.setBeforeSend(async () => {
    const change = f.calls.at(-1)?.change
    if (change?.kind === 'text' && change.embeddingSelection?.resourceId === selection.resourceId) {
      throw new Error('Exact selected embedding is unavailable')
    }
  })
  f.sync.change(f.tab(), owner, {
    embeddingSelection: selection,
    kind: 'text',
    polarity: 'positive',
    text: '<missing>',
  })
  await assert.rejects(f.sync.flush(f.tab().id), /selected embedding is unavailable/)
  f.sync.change(f.tab(), owner, {
    kind: 'text',
    polarity: 'positive',
    text: '<missing>, more text',
  })
  await assert.rejects(f.sync.flush(f.tab().id), /selected embedding is unavailable/)
  assert.equal(f.tab().regionalGuidance![0]!.prompts!.positive!.text, 'start')
  f.sync.change(f.tab(), owner, {
    kind: 'text',
    polarity: 'positive',
    text: 'corrected without that token',
  })
  await f.sync.flush(f.tab().id)
  assert.equal(
    f.tab().regionalGuidance![0]!.prompts!.positive!.text,
    'corrected without that token',
  )
})

test('Retry uses a newer correction already queued before an earlier plain-text refusal arrived', async () => {
  const f = fixture()
  const held = gate()
  const owner = f.owner()
  f.setBeforeSend(async () => {
    await held.promise
    const change = f.calls.at(-1)?.change
    if (change?.kind === 'text' && change.text === 'refused intermediate') {
      throw new Error('Intermediate value refused')
    }
  })
  f.sync.change(f.tab(), owner, {
    kind: 'text',
    polarity: 'positive',
    text: 'refused intermediate',
  })
  f.sync.change(f.tab(), owner, {
    kind: 'text',
    polarity: 'positive',
    text: 'newer corrected value',
  })
  held.release()
  await assert.rejects(f.sync.flush(f.tab().id), /Intermediate value refused/)
  await f.sync.flush(f.tab().id)
  assert.deepEqual(
    f.calls.map((call) => (call.change?.kind === 'text' ? call.change.text : call.group)),
    ['refused intermediate', 'newer corrected value'],
  )
})

test('Remove can clear a refused unpublished field without changing another prompt or dropping its seal', async () => {
  const f = fixture()
  const owner = f.owner()
  const negative = structuredClone(f.tab().regionalGuidance![0]!.prompts!.negative)
  f.setBeforeSend(async () => {
    if (f.calls.at(-1)?.change?.kind === 'text') {
      throw new Error('Field refused')
    }
  })
  f.sync.change(f.tab(), owner, { kind: 'text', polarity: 'positive', text: 'unpublished' })
  f.sync.seal(f.tab(), owner, 'refused focus')
  await assert.rejects(f.sync.flush(f.tab().id), /Field refused/)
  f.sync.change(f.tab(), owner, { kind: 'block', polarity: 'positive', present: false })
  await f.sync.flush(f.tab().id)
  assert.equal(f.calls[1]!.group, 'refused focus')
  assert.equal(f.tab().regionalGuidance![0]!.prompts!.positive, null)
  assert.deepEqual(f.tab().regionalGuidance![0]!.prompts!.negative, negative)
})

test('an unresolved exact choice cannot release dependent text across a seal; Remove cancels only its unpublished field', async () => {
  const f = fixture()
  const owner = f.owner()
  const other = f.owner(1)
  const selection = { resourceId: randomUUID(), token: '<missing>', versionId: randomUUID() }
  f.setBeforeSend(async () => {
    const change = f.calls.at(-1)?.change
    if (change?.kind === 'text' && change.embeddingSelection?.resourceId === selection.resourceId) {
      throw new Error('Exact choice unavailable')
    }
  })
  f.sync.change(f.tab(), owner, {
    embeddingSelection: selection,
    historyGroupId: 'old focus',
    kind: 'text',
    polarity: 'positive',
    text: '<missing>',
  })
  f.sync.change(f.tab(), owner, {
    historyGroupId: 'old focus',
    kind: 'text',
    polarity: 'positive',
    text: 'dependent <missing>',
  })
  f.sync.seal(f.tab(), owner, 'old focus')
  f.sync.change(f.tab(), other, { kind: 'text', polarity: 'negative', text: 'unrelated owner' })
  await assert.rejects(f.sync.flush(f.tab().id), /Exact choice unavailable/)
  f.sync.change(f.tab(), owner, {
    historyGroupId: 'new focus',
    kind: 'text',
    polarity: 'positive',
    text: 'without that token',
  })
  await assert.rejects(f.sync.flush(f.tab().id), /Exact choice unavailable/)
  assert.equal(
    f.calls.some(
      (call) => call.change?.kind === 'text' && call.change.text === 'dependent <missing>',
    ),
    false,
  )
  f.sync.change(f.tab(), owner, { kind: 'block', polarity: 'positive', present: false })
  await f.sync.flush(f.tab().id)
  assert.equal(f.tab().regionalGuidance![0]!.prompts!.positive, null)
  assert.equal(f.tab().regionalGuidance![0]!.prompts!.negative!.text, 'custom negative')
  assert.equal(f.tab().regionalGuidance![1]!.prompts!.negative!.text, 'unrelated owner')
  assert.equal(f.calls.filter((call) => call.group === 'old focus').length, 1)
  assert.equal(
    f.calls.some(
      (call) => call.change?.kind === 'text' && call.change.text === 'dependent <missing>',
    ),
    false,
  )
})
