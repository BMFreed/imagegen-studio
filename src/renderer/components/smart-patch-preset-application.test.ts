import type { ProjectSmartPatchLayerView, ProjectTab } from '../../shared/api.js'
import type { PresetRecord } from '../../shared/presets/preset-schema.js'
import type { SmartPatchPresetApplicationReview } from '../../shared/presets/smart-patch-preset-application.js'
import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { reactive } from 'vue'

import {
  captureSmartPatchPresetApplicationOwner,
  type SmartPatchPresetApplicationContext,
  smartPatchPresetApplicationOwnerCurrent,
  SmartPatchPresetApplicationReader,
} from './smart-patch-preset-application.js'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, reject, resolve }
}

function fixture() {
  const document = createEmptyProjectDocumentV1({ title: 'Reviewed Smart settings' })
  document.generationDraft.positivePrompt.text = 'Project Canvas prompt'
  const draft = structuredClone(document.generationDraft)
  draft.positivePrompt.text = 'Selected Patch prompt'
  const patch: ProjectSmartPatchLayerView = {
    activeRaster: null,
    activeRasterSubLayerId: null,
    blendMode: 'normal',
    boundingBox: { height: 71, width: 99, x: -31, y: 47 },
    generationDraft: draft,
    id: randomUUID(),
    internalResolution: { height: 256, width: 512 },
    kind: 'smart-patch',
    locked: false,
    mask: { asset: null, id: randomUUID(), revision: 0 },
    maskImageUrl: null,
    name: 'Hidden reviewed Patch',
    opacity: 1,
    rasterSubLayers: [],
    status: 'empty',
    visible: false,
  }
  const tab: ProjectTab = {
    acceptedResults: [],
    autosaveError: null,
    canRedo: false,
    canUndo: false,
    dirty: false,
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    generationDraft: document.generationDraft,
    id: `project-v1-${'a'.repeat(64)}`,
    lastActualSeedSnapshot: null,
    layers: [patch],
    primaryBbox: document.primaryBbox,
    title: document.title,
  }
  const source: PresetRecord = {
    deletedAt: null,
    description: 'All workflows can supply reusable settings',
    expiresAt: null,
    favorite: false,
    id: randomUUID(),
    name: 'Temporary application source',
    payload: {
      prompt: { embeddingRefs: [], text: 'Saved source prompt' },
      seed: { policy: 'fixed', value: 0 },
      size: { height: 1024, width: 1024 },
    },
    tags: [],
    updatedAt: '2026-10-22T00:00:00.000Z',
    workflow: 'textToImage',
  }
  const owner = captureSmartPatchPresetApplicationOwner(tab, patch.id)!
  assert.ok(owner)
  const review: SmartPatchPresetApplicationReview = {
    documentId: owner.documentId,
    documentRevision: owner.documentRevision,
    generationDraft: structuredClone(draft),
    layerId: owner.layerId,
    reviewToken: randomUUID(),
  }
  const context: SmartPatchPresetApplicationContext = {
    activeTabId: tab.id,
    blocked: false,
    pendingDraft: false,
    selectedLayerId: patch.id,
    tab,
  }
  const reader = (
    overrides: Partial<ConstructorParameters<typeof SmartPatchPresetApplicationReader>[0]> = {},
  ) =>
    new SmartPatchPresetApplicationReader({
      current: (captured) => smartPatchPresetApplicationOwnerCurrent(captured, context),
      readPreset: async () => source,
      readReview: async () => review,
      ...overrides,
    })
  return { context, owner, patch, reader, review, source, tab }
}

// Production boundary: App uses this reader and owner predicate before displaying Smart Apply.
// Main review issuance, token lifetime, mutation, modal focus and native routing remain separate.
test('reviewed Current stays detached from both Project Canvas and later source/catalog objects', async () => {
  const { owner, patch, reader, review, source, tab } = fixture()
  const original = structuredClone({ source, tab })
  const capturedFromVue = captureSmartPatchPresetApplicationOwner(reactive(tab), patch.id)
  assert.deepEqual(capturedFromVue, owner, 'reactive Project views are captured as plain data')
  const opened = await reader().open(owner, source.id)
  assert.ok(opened)
  assert.equal(opened.review.generationDraft.positivePrompt.text, 'Selected Patch prompt')
  assert.notEqual(
    opened.review.generationDraft.positivePrompt.text,
    tab.generationDraft.positivePrompt.text,
  )
  opened.source.payload.prompt!.text = 'Detached customized Apply prompt'
  opened.review.generationDraft.positivePrompt.text = 'Detached Current witness'
  assert.deepEqual({ source, tab }, original)
  assert.equal(review.generationDraft.positivePrompt.text, 'Selected Patch prompt')

  const another = await reader().open(owner, source.id)
  assert.ok(another)
  source.payload.prompt!.text = 'Later saved preset edit'
  review.generationDraft.positivePrompt.text = 'Later read object replacement'
  assert.equal(another.source.payload.prompt!.text, 'Saved source prompt')
  assert.equal(another.review.generationDraft.positivePrompt.text, 'Selected Patch prompt')
})

test('a hidden Patch accepts every source workflow without changing geometry or visibility', async () => {
  const { owner, reader, source, tab } = fixture()
  const before = structuredClone(tab)
  for (const workflow of ['textToImage', 'imageToImage', 'smartPatch'] as const) {
    source.workflow = workflow
    const opened = await reader().open(owner, source.id)
    assert.ok(opened)
    assert.equal(opened.source.workflow, workflow)
  }
  assert.deepEqual(tab, before)
})

test('pending tab-wide draft state refuses reads, then the acknowledged state can open normally', async () => {
  const { context, owner, reader, source } = fixture()
  let reads = 0
  const application = reader({
    readPreset: async () => {
      reads += 1
      return source
    },
  })
  context.pendingDraft = true
  assert.equal(await application.open(owner, source.id), null)
  assert.equal(reads, 0, 'Apply must not flush/retry or review around a pending owner')
  context.pendingDraft = false
  assert.ok(await application.open(owner, source.id))
  assert.equal(reads, 1)
})

test('both original asynchronous reads must settle before the reviewed preview is published', async () => {
  const { owner, reader, review, source } = fixture()
  const presetRead = deferred<PresetRecord | null>()
  const reviewRead = deferred<SmartPatchPresetApplicationReview>()
  let published = false
  const pending = reader({
    readPreset: () => presetRead.promise,
    readReview: () => reviewRead.promise,
  })
    .open(owner, source.id)
    .then((result) => {
      published = true
      return result
    })
  reviewRead.resolve(review)
  await reviewRead.promise
  assert.equal(published, false)
  presetRead.resolve(source)
  assert.ok(await pending)
  assert.equal(published, true)
})

test('awaited success cannot populate another selection, revision, owner or blocked context', async () => {
  const changes: ((value: ReturnType<typeof fixture>) => void)[] = [
    ({ context }) => {
      context.selectedLayerId = randomUUID()
    },
    ({ context }) => {
      context.activeTabId = 'another-project'
    },
    ({ context }) => {
      context.tab = undefined
    },
    ({ context }) => {
      context.pendingDraft = true
    },
    ({ context }) => {
      context.blocked = true
    },
    ({ tab }) => {
      tab.documentId = randomUUID()
    },
    ({ tab }) => {
      tab.documentRevision = randomUUID()
    },
    ({ tab }) => {
      tab.layers = []
    },
    ({ patch }) => {
      patch.locked = true
    },
  ]
  for (const change of changes) {
    const current = fixture()
    const gate = deferred<SmartPatchPresetApplicationReview>()
    const pending = current
      .reader({ readReview: () => gate.promise })
      .open(current.owner, current.source.id)
    change(current)
    gate.resolve(current.review)
    assert.equal(await pending, null)
  }
  const healthy = fixture()
  assert.ok(await healthy.reader().open(healthy.owner, healthy.source.id))
})

test('selection A to B to A invalidation rejects the old read even when final owner equality holds', async () => {
  const { context, owner, reader, review, source } = fixture()
  const gate = deferred<SmartPatchPresetApplicationReview>()
  let next = gate.promise
  const application = reader({ readReview: () => next })
  const pending = application.open(owner, source.id)
  context.selectedLayerId = randomUUID()
  application.invalidate()
  context.selectedLayerId = owner.layerId
  assert.equal(smartPatchPresetApplicationOwnerCurrent(owner, context), true)
  gate.resolve(review)
  assert.equal(await pending, null, 'final ID equality must not resurrect the previous choice')
  const fresh = { ...review, reviewToken: randomUUID() }
  next = Promise.resolve(fresh)
  const reopened = await application.open(owner, source.id)
  assert.equal(reopened?.review.reviewToken, fresh.reviewToken)
})

test('newer opening owns the result and stale rejection cannot replace its state', async () => {
  const { owner, reader, review, source } = fixture()
  const old = deferred<PresetRecord | null>()
  const newerSource = { ...source, id: randomUUID(), name: 'Newer choice' }
  let reads = 0
  const application = reader({
    readPreset: () => (reads++ === 0 ? old.promise : Promise.resolve(newerSource)),
    readReview: async () => ({ ...review, reviewToken: randomUUID() }),
  })
  const previous = application.open(owner, source.id)
  const newest = await application.open(owner, newerSource.id)
  assert.equal(newest?.source.id, newerSource.id)
  old.reject(new Error('Obsolete source read failure'))
  assert.equal(await previous, null)
  assert.equal(newest?.source.name, 'Newer choice')
})

test('late errors after context loss are suppressed while a live failure remains retryable', async () => {
  const { context, owner, reader, review, source, tab } = fixture()
  const before = structuredClone({ source, tab })
  const gate = deferred<SmartPatchPresetApplicationReview>()
  const application = reader({ readReview: () => gate.promise })
  const pending = application.open(owner, source.id)
  context.blocked = true
  gate.reject(new Error('Late review failure'))
  assert.equal(await pending, null)

  context.blocked = false
  let fail = true
  const retryable = reader({
    readReview: async () => {
      if (fail) {
        throw new Error('Current review failed')
      }
      return review
    },
  })
  await assert.rejects(retryable.open(owner, source.id), /Current review failed/)
  fail = false
  assert.ok(await retryable.open(owner, source.id))
  assert.deepEqual({ source, tab }, before)
})

test('valid replies for a crossed owner and malformed review tokens are refused before preview', async () => {
  const { owner, reader, review, source } = fixture()
  for (const replacement of [
    { documentId: randomUUID() },
    { documentRevision: randomUUID() },
    { layerId: randomUUID() },
    { reviewToken: 'not-a-uuid' },
  ]) {
    await assert.rejects(
      reader({ readReview: async () => ({ ...review, ...replacement }) }).open(owner, source.id),
      /different Smart Patch/,
    )
  }
  assert.ok(await reader().open(owner, source.id))
})

test('deleted, absent or crossed preset sources cannot enter the detached preview', async () => {
  const { owner, reader, source } = fixture()
  for (const response of [
    null,
    { ...source, id: randomUUID() },
    { ...source, deletedAt: '2026-10-22T01:00:00.000Z', expiresAt: '2026-11-21T01:00:00.000Z' },
  ]) {
    await assert.rejects(
      reader({ readPreset: async () => response }).open(owner, source.id),
      /no longer active/,
    )
  }
  assert.ok(await reader().open(owner, source.id))
})
