import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { createEmptyProjectDocumentV1 } from '../projects/project-schema.js'
import {
  isSmartPatchPresetApplicationReviewForRequest,
  parseSmartPatchPresetApplicationRequest,
  parseSmartPatchPresetApplicationReviewRequest,
} from './smart-patch-preset-application.js'

const owner = { documentId: randomUUID(), documentRevision: randomUUID(), layerId: randomUUID() }
const prompt = { embeddingRefs: [], text: '(lantern:1.5), {red|blue}' }
const envelope = <T>(payload: T, selectedSections: unknown = ['prompt']) => ({
  ...owner,
  payload,
  reviewToken: randomUUID(),
  selectedSections,
  sourcePresetId: randomUUID(),
})

test('Smart preset review requires the strict exact owner and binds a strict authored draft reply', () => {
  const request = parseSmartPatchPresetApplicationReviewRequest(owner)
  assert.deepEqual(request, owner)
  const reply = {
    ...owner,
    generationDraft: createEmptyProjectDocumentV1({ title: 'Review' }).generationDraft,
    reviewToken: randomUUID(),
  }
  assert.equal(isSmartPatchPresetApplicationReviewForRequest(reply, request), true)
  for (const key of ['documentId', 'documentRevision', 'layerId'] as const) {
    assert.equal(
      isSmartPatchPresetApplicationReviewForRequest({ ...reply, [key]: randomUUID() }, request),
      false,
    )
    assert.throws(() =>
      parseSmartPatchPresetApplicationReviewRequest({ ...owner, [key]: 'invalid' }),
    )
    const missing = { ...owner } as Partial<typeof owner>
    delete missing[key]
    assert.throws(() => parseSmartPatchPresetApplicationReviewRequest(missing))
  }
  for (const invalid of [
    null,
    { ...reply, reviewToken: 'invalid' },
    { ...reply, privatePath: '/private' },
    { ...reply, generationDraft: {} },
    { ...reply, generationDraft: { ...reply.generationDraft, workflow: 'smartPatch' } },
  ]) {
    assert.equal(isSmartPatchPresetApplicationReviewForRequest(invalid, request), false)
  }
  assert.throws(() =>
    parseSmartPatchPresetApplicationReviewRequest({ ...owner, reviewToken: randomUUID() }),
  )
  assert.equal(
    isSmartPatchPresetApplicationReviewForRequest(reply, { ...owner, layerId: 'bad' }),
    false,
  )
})

test('Smart Apply ignores every unselected field but never admits selected Size or a loose envelope', () => {
  const input = envelope({ masks: ['private'], model: null, prompt, size: { width: 'unfinished' } })
  assert.deepEqual(parseSmartPatchPresetApplicationRequest(input), {
    ...input,
    payload: { prompt },
  })
  const bad = [
    envelope({ prompt }, []),
    envelope({ prompt }, ['prompt', 'prompt']),
    envelope({ prompt }, ['mask']),
    envelope({ prompt }, ['negativePrompt']),
    envelope({ size: { height: 64, width: 64 } }, ['size']),
    envelope({ prompt, size: null }, ['prompt', 'size']),
    envelope({ prompt: undefined }),
    envelope(Object.create({ prompt })),
    { ...envelope({ prompt }), workflow: 'smartPatch' },
    { ...envelope({ prompt }), variantId: randomUUID() },
    { ...envelope({ prompt }), documentId: 'bad' },
    { ...envelope({ prompt }), documentRevision: 'bad' },
    { ...envelope({ prompt }), layerId: 'bad' },
    { ...envelope({ prompt }), reviewToken: 'bad' },
    { ...envelope({ prompt }), sourcePresetId: 'bad' },
  ]
  for (const input of bad) {
    assert.throws(() => parseSmartPatchPresetApplicationRequest(input))
  }
})

test('Smart selected payload retains explicit clears, zero and partial sampling without inventing optional members', () => {
  const payload = {
    cfgRescale: 0,
    denoisingStrength: 0,
    guidance: { cfgScale: 0, steps: 1 },
    loras: [],
    negativePrompt: { embeddingRefs: [], text: '' },
    prompt: { embeddingRefs: [], text: '' },
    sampling: { animaMethod: 'heun' },
    seed: { policy: 'fixed', value: 0 },
    vae: null,
    vaePrecision: 'Auto',
  }
  const input = envelope(payload, Object.keys(payload))
  const parsed = parseSmartPatchPresetApplicationRequest(input)
  assert.deepEqual(parsed.payload, payload)
  assert.equal(Object.hasOwn(parsed.payload.sampling, 'sampler'), false)
  assert.equal(Object.hasOwn(parsed.payload, 'model'), false)
  parsed.payload.prompt.text = 'detached'
  assert.equal(input.payload.prompt.text, '')
  for (const [payload, selected] of [
    [{ model: null }, ['model']],
    [{ cfgRescale: null }, ['cfgRescale']],
    [{ sampling: {} }, ['sampling']],
    [{ sampling: { animaMethod: null } }, ['sampling']],
    [{ guidance: { steps: 1 } }, ['guidance']],
    [{ guidance: { cfgScale: 0, steps: 0 } }, ['guidance']],
  ] as const) {
    assert.throws(() => parseSmartPatchPresetApplicationRequest(envelope(payload, selected)))
  }
})

test('selected resource identities and prompt sidecars are captured rather than aliased', () => {
  const resource = {
    baseModelFamily: 'illustrious',
    civitaiFileId: 3,
    civitaiModelId: 1,
    civitaiVersionId: 2,
    displayName: 'Saved embedding alias',
    fileSha256: 'a'.repeat(64),
    kind: 'embedding',
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: null,
    versionName: 'Exact version',
  }
  const input = envelope({
    prompt: { embeddingRefs: [{ resource, token: '<literal>' }], text: '<literal>' },
  })
  const parsed = parseSmartPatchPresetApplicationRequest(input)
  parsed.payload.prompt!.embeddingRefs[0].resource.displayName = 'Changed output'
  assert.equal(resource.displayName, 'Saved embedding alias')
  resource.fileSha256 = 'b'.repeat(64)
  assert.equal(parsed.payload.prompt!.embeddingRefs[0].resource.fileSha256, 'a'.repeat(64))
})
