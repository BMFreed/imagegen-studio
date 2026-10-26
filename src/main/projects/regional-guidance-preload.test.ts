import type { ApiResult, ProjectTab, StudioApi } from '../../shared/api.js'
import { ipcChannels } from '../../shared/api.js'
import {
  createEmptyProjectDocumentV1,
  type IgsRegionalGuidanceV1,
} from '../../shared/projects/project-schema.js'

import { build } from 'esbuild'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const bundle = build({
  bundle: true,
  entryPoints: ['src/preload/index.ts'],
  external: ['electron'],
  format: 'cjs',
  platform: 'node',
  write: false,
})

function region(): Omit<IgsRegionalGuidanceV1, 'referenceImages'> {
  return {
    enabled: true,
    id: randomUUID(),
    locked: false,
    mask: { asset: null, id: randomUUID(), revision: 0 },
    name: 'Owned region',
    overlayOpacity: 0.5,
  }
}
function tab(): ProjectTab {
  const document = createEmptyProjectDocumentV1({ title: 'Preload owner' })
  return {
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
    layers: [],
    primaryBbox: document.primaryBbox,
    title: document.title,
  }
}
async function fixture() {
  let api: StudioApi | undefined
  const calls: { args: unknown[]; channel: string }[] = []
  const listeners = new Map<string, (...args: unknown[]) => void>()
  const state = {
    reply: async (_channel: string, _args: unknown[]): Promise<unknown> => ({
      ok: true,
      value: tab(),
    }),
  }
  const electron = {
    contextBridge: {
      exposeInMainWorld: (name: string, value: StudioApi) => {
        assert.equal(name, 'api')
        api = value
      },
    },
    ipcRenderer: {
      invoke: (channel: string, ...args: unknown[]) => {
        calls.push({ args: structuredClone(args), channel })
        return state.reply(channel, args)
      },
      on: (channel: string, handler: (...args: unknown[]) => void) =>
        listeners.set(channel, handler),
      removeListener: (channel: string) => listeners.delete(channel),
      send: () => undefined,
    },
  }
  const output = await bundle
  runInNewContext(output.outputFiles[0].text, {
    Buffer,
    clearTimeout,
    console,
    exports: {},
    module: { exports: {} },
    require: (name: string) => {
      assert.equal(name, 'electron')
      return electron
    },
    setTimeout,
    structuredClone,
    TextEncoder,
  })
  assert.ok(api)
  return { api, calls, listeners, state }
}
function refusal(result: ApiResult<unknown>, code: string) {
  assert.equal(result.ok, false)
  assert.ok(!result.ok)
  assert.equal(result.error.code, code)
}

test('actual bundled preload snapshots regional owners and changes before awaiting IPC', async () => {
  const f = await fixture()
  const value = { ...tab(), regionalGuidance: [region()] }
  const owner = {
    documentId: value.documentId,
    documentRevision: value.documentRevision,
    regionId: value.regionalGuidance[0].id,
  }
  const change = { kind: 'rename' as const, name: 'Captured name' }
  const expected = structuredClone({ change, owner })
  let release!: (value: unknown) => void
  f.state.reply = () =>
    new Promise((resolve) => {
      release = resolve
    })
  const pending = f.api.projects.updateRegionalGuidance(value.id, owner, change)
  owner.documentId = randomUUID()
  owner.regionId = randomUUID()
  change.name = 'Later renderer edit'
  assert.equal(f.calls.length, 1)
  assert.deepEqual(f.calls[0], {
    args: [value.id, expected.owner, expected.change],
    channel: ipcChannels.projects.updateRegionalGuidance,
  })
  release({ ok: true, value })
  const result = await pending
  assert.ok(result.ok)
  assert.equal(result.value.documentId, expected.owner.documentId)
})

test('actual preload snapshots dedicated regional text and exact ID-only embedding selection', async () => {
  const f = await fixture()
  const value = { ...tab(), regionalGuidance: [region()] }
  const target = value.regionalGuidance[0]
  const owner = {
    documentId: value.documentId,
    documentRevision: value.documentRevision,
    regionId: target.id,
  }
  const change = {
    embeddingSelection: {
      resourceId: randomUUID(),
      token: '<literal>',
      versionId: randomUUID(),
    },
    historyGroupId: `regional:${target.id}:positive:${randomUUID()}`,
    kind: 'text' as const,
    polarity: 'positive' as const,
    text: '  {first|second}, <literal>\nUnicode 🌙  ',
  }
  const expected = structuredClone({ change, owner })
  let release!: (reply: unknown) => void
  f.state.reply = () =>
    new Promise((resolve) => {
      release = resolve
    })
  const pending = f.api.projects.updateRegionalGuidancePrompt(value.id, owner, change)
  owner.regionId = randomUUID()
  change.text = 'later text'
  change.embeddingSelection.resourceId = randomUUID()
  assert.deepEqual(f.calls, [
    {
      args: [value.id, expected.owner, expected.change],
      channel: ipcChannels.projects.updateRegionalGuidancePrompt,
    },
  ])
  target.prompts = {
    negative: null,
    positive: { embeddingRefs: [], text: expected.change.text },
    useGlobalNegativePrompt: true,
  }
  release({ ok: true, value })
  assert.ok((await pending).ok)
})

test('dedicated regional preload rejects private fields and foreign history groups without invoking Main', async () => {
  const f = await fixture()
  const value = { ...tab(), regionalGuidance: [region()] }
  const owner = {
    documentId: value.documentId,
    documentRevision: value.documentRevision,
    regionId: value.regionalGuidance[0].id,
  }
  const text = { kind: 'text', polarity: 'positive', text: 'plain' }
  for (const change of [
    { ...text, embeddingRefs: [] },
    { ...text, historyGroupId: `regional:${randomUUID()}:positive:${randomUUID()}` },
    { ...text, historyGroupId: `regional:${owner.regionId}:negative:${randomUUID()}` },
    {
      ...text,
      embeddingSelection: {
        resource: { kind: 'embedding' },
        resourceId: 'r',
        token: '<token>',
        versionId: 'v',
      },
    },
    { historyGroupId: randomUUID(), kind: 'negative-source', useGlobalNegativePrompt: true },
    { kind: 'block', mask: '/private.png', polarity: 'positive', present: true },
  ]) {
    refusal(
      await Reflect.apply(f.api.projects.updateRegionalGuidancePrompt, null, [
        value.id,
        owner,
        change,
      ]),
      'IPC_INVALID_CALLER',
    )
  }
  assert.equal(f.calls.length, 0)
})

test('dedicated regional reply validation rejects missing or crossed source blocks and preserves ordinary regional calls', async () => {
  const f = await fixture()
  const value = { ...tab(), regionalGuidance: [region()] }
  const target = value.regionalGuidance[0]
  const owner = {
    documentId: value.documentId,
    documentRevision: value.documentRevision,
    regionId: target.id,
  }
  const change = { kind: 'text' as const, polarity: 'positive' as const, text: 'requested text' }
  const valid = structuredClone(value)
  valid.regionalGuidance[0].prompts = {
    negative: null,
    positive: { embeddingRefs: [], text: change.text },
    useGlobalNegativePrompt: true,
  }
  const crossed = structuredClone(valid)
  crossed.regionalGuidance[0].id = randomUUID()
  const wrongText = structuredClone(valid)
  wrongText.regionalGuidance[0].prompts!.positive!.text = 'other owner text'
  const wrongDocument = { ...valid, documentId: randomUUID() }
  for (const reply of [value, crossed, wrongText, wrongDocument]) {
    f.state.reply = async () => ({ ok: true, value: reply })
    refusal(
      await f.api.projects.updateRegionalGuidancePrompt(value.id, owner, change),
      'IPC_INVALID_RESPONSE',
    )
  }
  f.state.reply = async () => ({ ok: true, value: valid })
  assert.ok((await f.api.projects.updateRegionalGuidancePrompt(value.id, owner, change)).ok)
  f.state.reply = async () => ({ ok: true, value })
  assert.ok(
    (
      await f.api.projects.updateRegionalGuidance(value.id, owner, {
        kind: 'rename',
        name: target.name,
      })
    ).ok,
  )
})

test('actual preload rejects unknown regional request fields before IPC and crossed response owners afterward', async () => {
  const f = await fixture()
  const value = tab()
  const owner = { documentId: value.documentId, documentRevision: value.documentRevision }
  for (const input of [
    { ...owner, mask: { asset: '/private.png' } },
    { ...owner, regionId: randomUUID() },
    { documentId: owner.documentId },
  ]) {
    const result: ApiResult<unknown> = await Reflect.apply(
      f.api.projects.addRegionalGuidance,
      null,
      [value.id, input],
    )
    refusal(result, 'IPC_INVALID_CALLER')
  }
  const entityOwner = { ...owner, regionId: randomUUID() }
  const privateChange = { kind: 'overlay-opacity', overlayOpacity: 0.5, referenceImages: [] }
  const result: ApiResult<unknown> = await Reflect.apply(
    f.api.projects.updateRegionalGuidance,
    null,
    [value.id, entityOwner, privateChange],
  )
  refusal(result, 'IPC_INVALID_CALLER')
  assert.equal(f.calls.length, 0)
  for (const crossed of [
    { ...value, documentId: randomUUID() },
    { ...value, id: `project-v1-${'b'.repeat(64)}` },
  ]) {
    f.state.reply = async () => ({ ok: true, value: crossed })
    refusal(await f.api.projects.addRegionalGuidance(value.id, owner), 'IPC_INVALID_RESPONSE')
  }
  f.state.reply = async () => ({ ok: true, value: { ...value, regionalGuidance: [region()] } })
  assert.ok((await f.api.projects.addRegionalGuidance(value.id, owner)).ok)
})

test('actual preload rejects private regional DTO fields and colliding owners, including tab-change notifications', async () => {
  const f = await fixture()
  const value = tab()
  const owner = { documentId: value.documentId, documentRevision: value.documentRevision }
  const first = region()
  const invalidRegions: unknown[][] = [
    [{ ...first, positivePrompt: 'not supported yet' }],
    [{ ...first, mask: { ...first.mask, asset: { path: '/private.png' } } }],
    [{ ...first, mask: { ...first.mask, revision: -1 } }],
    [{ ...first, mask: { ...first.mask, id: first.id } }],
    [first, { ...region(), id: first.mask.id }],
  ]
  const raster = {
    blendMode: 'normal' as const,
    height: 1,
    id: randomUUID(),
    imageUrl: 'igs-layer://asset/controlled',
    kind: 'raster' as const,
    locked: false,
    name: 'Raster neighbor',
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
    visible: true,
    width: 1,
  }
  let delivered = 0
  const unsubscribe = f.api.projects.onTabsChanged(() => {
    delivered++
  })
  const notify = f.listeners.get(ipcChannels.projects.tabsChanged)
  assert.ok(notify)
  for (const regions of invalidRegions) {
    const reply = { ...value, regionalGuidance: regions }
    f.state.reply = async () => ({ ok: true, value: reply })
    refusal(await f.api.projects.addRegionalGuidance(value.id, owner), 'IPC_INVALID_RESPONSE')
    notify({}, [reply])
  }
  const crossed = {
    ...value,
    layers: [raster],
    regionalGuidance: [{ ...first, mask: { ...first.mask, id: raster.id } }],
  }
  f.state.reply = async () => ({ ok: true, value: crossed })
  refusal(await f.api.projects.addRegionalGuidance(value.id, owner), 'IPC_INVALID_RESPONSE')
  notify({}, [crossed])
  assert.equal(delivered, 0)
  notify({}, [value])
  notify({}, [{ ...value, regionalGuidance: [first] }])
  assert.equal(delivered, 2, 'Legacy absence and valid regional owners remain accepted')
  unsubscribe()
})

test('regional mask preload snapshots a complete gesture and correlates changed and no-op replies', async () => {
  const f = await fixture()
  const value: ProjectTab = { ...tab(), regionalGuidance: [region(), region()] }
  const target = value.regionalGuidance![1]
  const request = {
    documentId: value.documentId,
    documentRevision: value.documentRevision,
    edit: {
      diameter: 1,
      kind: 'brush' as const,
      operation: 'add' as const,
      points: [{ x: -4, y: 7 }],
    },
    maskId: target.mask.id,
    maskRevision: 0,
  }
  const expected = structuredClone(request)
  let release!: (reply: unknown) => void
  f.state.reply = () =>
    new Promise((resolve) => {
      release = resolve
    })
  const pending = f.api.projects.editRegionalGuidanceMask(value.id, target.id, request)
  request.edit.points[0].x = 999
  request.maskId = randomUUID()
  assert.deepEqual(f.calls, [
    {
      args: [value.id, target.id, expected],
      channel: ipcChannels.projects.editRegionalGuidanceMask,
    },
  ])
  const changed = structuredClone(value)
  changed.documentRevision = randomUUID()
  const hash = 'a'.repeat(64)
  changed.regionalGuidance![1].mask = {
    asset: {
      bytes: 80,
      height: 2,
      path: `assets/masks/${expected.maskId}/${hash}.png`,
      sha256: hash,
      width: 2,
    },
    bounds: { height: 2, width: 2, x: -5, y: 6 },
    id: expected.maskId,
    revision: 1,
  }
  changed.regionalGuidance![1].maskImageUrl = `igs-mask://regional/${value.id}/${changed.documentRevision}/${target.id}/${expected.maskId}/1/${hash}/${'b'.repeat(64)}.png`
  release({ ok: true, value: changed })
  assert.ok((await pending).ok)
  f.state.reply = async () => ({ ok: true, value })
  assert.ok((await f.api.projects.editRegionalGuidanceMask(value.id, target.id, expected)).ok)
  assert.deepEqual(value.regionalGuidance![0], changed.regionalGuidance![0])
})

test('regional mask preload refuses Fit, private pixels and malformed envelopes before IPC', async () => {
  const f = await fixture()
  const value = { ...tab(), regionalGuidance: [region()] }
  const target = value.regionalGuidance[0]
  const request = {
    documentId: value.documentId,
    documentRevision: value.documentRevision,
    edit: { kind: 'clear' },
    maskId: target.mask.id,
    maskRevision: 0,
  }
  for (const input of [
    { ...request, edit: { kind: 'fit-bbox' } },
    { ...request, asset: { path: '/private.png' } },
    { ...request, edit: { kind: 'clear', pixels: [255] } },
    { ...request, maskRevision: -1 },
    { ...request, documentEpoch: 0, documentId: randomUUID() },
    {
      ...request,
      edit: {
        kind: 'transform',
        transform: { rotationDegrees: 0, scaleX: 0, scaleY: 1, x: 0, y: 0 },
      },
    },
  ]) {
    refusal(
      await Reflect.apply(f.api.projects.editRegionalGuidanceMask, null, [
        value.id,
        target.id,
        input,
      ]),
      'IPC_INVALID_CALLER',
    )
  }
  assert.equal(f.calls.length, 0)
})

test('regional mask preload rejects crossed owners/revisions and binds display URLs to the returned regional tuple', async () => {
  const f = await fixture()
  const value: ProjectTab = { ...tab(), regionalGuidance: [region(), region()] }
  const target = value.regionalGuidance![0]
  const request = {
    documentId: value.documentId,
    documentRevision: value.documentRevision,
    edit: {
      diameter: 1,
      kind: 'brush' as const,
      operation: 'add' as const,
      points: [{ x: -0.5, y: 2.5 }],
    },
    maskId: target.mask.id,
    maskRevision: 0,
  }
  const valid = structuredClone(value)
  valid.documentRevision = randomUUID()
  const maskId = target.mask.id
  const hash = 'a'.repeat(64)
  valid.regionalGuidance![0].mask = {
    asset: {
      bytes: 80,
      height: 1,
      path: `assets/masks/${maskId}/${hash}.png`,
      sha256: hash,
      width: 1,
    },
    bounds: { height: 1, width: 1, x: -1, y: 2 },
    id: maskId,
    revision: 1,
  }
  const url = `igs-mask://regional/${value.id}/${valid.documentRevision}/${target.id}/${maskId}/1/${hash}/${'b'.repeat(64)}.png`
  valid.regionalGuidance![0].maskImageUrl = url
  // This boundary validates DTO association. The separate resource tests authenticate HMAC/PNG bytes.
  const badReplies: ProjectTab[] = [
    { ...valid, id: `project-v1-${'b'.repeat(64)}` },
    { ...valid, documentId: randomUUID() },
    { ...valid, documentRevision: request.documentRevision },
    { ...valid, regionalGuidance: [valid.regionalGuidance![1]] },
  ]
  for (const badUrl of [
    undefined,
    url.replace('://regional/', '://asset/'),
    url.replace(target.id, valid.regionalGuidance![1].id),
    `${url}?path=/private.png`,
  ]) {
    const copy = structuredClone(valid)
    if (badUrl === undefined) {
      delete copy.regionalGuidance![0].maskImageUrl
    } else {
      copy.regionalGuidance![0].maskImageUrl = badUrl
    }
    badReplies.push(copy)
  }
  for (const reply of badReplies) {
    f.state.reply = async () => ({ ok: true, value: reply })
    refusal(
      await f.api.projects.editRegionalGuidanceMask(value.id, target.id, request),
      'IPC_INVALID_RESPONSE',
    )
  }
  f.state.reply = async () => ({ ok: true, value: valid })
  assert.ok((await f.api.projects.editRegionalGuidanceMask(value.id, target.id, request)).ok)
  const empty = structuredClone(value)
  empty.regionalGuidance![0].mask.revision = 1
  f.state.reply = async () => ({ ok: true, value: empty })
  assert.ok(
    (
      await f.api.projects.addRegionalGuidance(value.id, {
        documentId: value.documentId,
        documentRevision: value.documentRevision,
      })
    ).ok,
    'Cleared empty masks with nonzero revision remain valid DTOs',
  )
})
