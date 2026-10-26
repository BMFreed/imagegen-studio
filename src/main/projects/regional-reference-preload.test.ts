import type {
  ApiResult,
  ProjectRegionalGuidanceLayerView,
  ProjectRegionalGuidanceReferenceImageView,
  ProjectTab,
  StudioApi,
} from '../../shared/api.js'
import { ipcChannels } from '../../shared/api.js'
import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'

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

function reference(id: string = randomUUID()): ProjectRegionalGuidanceReferenceImageView {
  const imageHash = 'd'.repeat(64)
  const thumbnailHash = 'e'.repeat(64)
  return {
    asset: {
      bytes: 400,
      height: 16,
      path: `assets/regional-references/${id}/${imageHash}.png`,
      sha256: imageHash,
      width: 32,
    },
    id,
    name: 'Exact reference.png',
    sourceFormat: 'PNG',
    thumbnail: {
      bytes: 240,
      height: 16,
      path: `assets/regional-references/${id}/${thumbnailHash}.webp`,
      sha256: thumbnailHash,
      width: 32,
    },
    thumbnailUrl: '',
  }
}

function ownerFixture(count = 2) {
  const document = createEmptyProjectDocumentV1({ title: 'Reference IPC owner' })
  const region: ProjectRegionalGuidanceLayerView = {
    enabled: true,
    id: randomUUID(),
    locked: false,
    mask: { asset: null, id: randomUUID(), revision: 0 },
    name: 'Original region',
    overlayOpacity: 0.5,
    ...(count ? { referenceImages: Array.from({ length: count }, () => reference()) } : {}),
  }
  const value: ProjectTab = {
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
    regionalGuidance: [region],
    title: document.title,
  }
  refreshUrls(value)
  return {
    owner: {
      documentId: value.documentId,
      documentRevision: value.documentRevision,
      regionId: region.id,
    },
    region,
    value,
  }
}

function refreshUrls(tab: ProjectTab): void {
  for (const region of tab.regionalGuidance ?? []) {
    for (const image of region.referenceImages ?? []) {
      image.thumbnailUrl = `igs-layer://regional-reference/${tab.id}/${tab.documentRevision}/${region.id}/${image.id}/${image.thumbnail.sha256}/${'f'.repeat(64)}.webp`
    }
  }
}

async function fixture() {
  let api: StudioApi | undefined
  const calls: { args: unknown[]; channel: string }[] = []
  const state = {
    reply: async (_channel: string, _args: unknown[]): Promise<unknown> => ({
      ok: true,
      value: null,
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
      on: () => undefined,
      removeListener: () => undefined,
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
  return { api, calls, state }
}

function refusal(result: ApiResult<unknown>, code: string): void {
  assert.equal(result.ok, false)
  assert.ok(!result.ok)
  assert.equal(result.error.code, code)
}

test('actual reference preload captures the original owner through held dialog reply and permits cancel', async () => {
  const f = await fixture()
  const { owner, value } = ownerFixture()
  const captured = structuredClone(owner)
  let release!: (value: unknown) => void
  f.state.reply = () => new Promise((resolve) => (release = resolve))
  const pending = f.api.projects.importRegionalGuidanceReferenceImage(value.id, owner)
  owner.documentId = randomUUID()
  owner.regionId = randomUUID()
  assert.deepEqual(f.calls, [
    {
      args: [value.id, captured],
      channel: ipcChannels.projects.importRegionalGuidanceReferenceImage,
    },
  ])
  release({ ok: true, value })
  assert.ok((await pending).ok)
  f.state.reply = async () => ({ ok: true, value: null })
  const canceled = await f.api.projects.importRegionalGuidanceReferenceImage(value.id, captured)
  assert.ok(canceled.ok)
  assert.equal(canceled.value, null)
})

test('actual reference preload snapshots move arguments before IPC and validates ordered reply', async () => {
  const f = await fixture()
  const { owner, region, value } = ownerFixture()
  assert.ok(region.referenceImages)
  const id = region.referenceImages[0].id
  const change = { kind: 'move' as const, referenceId: id, targetIndex: 1 }
  const captured = structuredClone({ change, owner })
  let release!: (value: unknown) => void
  f.state.reply = () => new Promise((resolve) => (release = resolve))
  const pending = f.api.projects.updateRegionalGuidanceReferenceImage(value.id, owner, change)
  change.referenceId = randomUUID()
  change.targetIndex = 0
  owner.regionId = randomUUID()
  assert.deepEqual(f.calls, [
    {
      args: [value.id, captured.owner, captured.change],
      channel: ipcChannels.projects.updateRegionalGuidanceReferenceImage,
    },
  ])
  region.referenceImages.reverse()
  release({ ok: true, value })
  assert.ok((await pending).ok)
})

test('reference preload rejects malformed/private owner and changes without invoking Main or opening import', async () => {
  const f = await fixture()
  const { owner, value } = ownerFixture()
  for (const input of [
    { ...owner, path: '/private/source.png' },
    { ...owner, documentEpoch: 2 },
    { ...owner, regionId: 'not-an-id' },
    { documentId: owner.documentId, documentRevision: owner.documentRevision },
  ]) {
    refusal(
      await Reflect.apply(f.api.projects.importRegionalGuidanceReferenceImage, null, [
        value.id,
        input,
      ]),
      'IPC_INVALID_CALLER',
    )
  }
  for (const change of [
    undefined,
    null,
    { kind: 'remove', referenceId: 'bad' },
    { asset: { path: '/private.png' }, kind: 'remove', referenceId: randomUUID() },
    { kind: 'move', referenceId: randomUUID(), targetIndex: -1 },
    { kind: 'move', referenceId: randomUUID(), targetIndex: 0.5 },
    { kind: 'move', referenceId: randomUUID(), targetIndex: NaN },
    { historyGroupId: randomUUID(), kind: 'move', referenceId: randomUUID(), targetIndex: 0 },
    { kind: 'import', path: '/private/source.png' },
  ]) {
    refusal(
      await Reflect.apply(f.api.projects.updateRegionalGuidanceReferenceImage, null, [
        value.id,
        owner,
        change,
      ]),
      'IPC_INVALID_CALLER',
    )
  }
  assert.equal(f.calls.length, 0)
})

test('reference preload binds successful replies to the original tab document and region', async () => {
  const f = await fixture()
  const { owner, value } = ownerFixture()
  const wrongRegion = structuredClone(value)
  wrongRegion.regionalGuidance![0].id = randomUUID()
  refreshUrls(wrongRegion)
  for (const reply of [
    { ...value, id: `project-v1-${'b'.repeat(64)}` },
    { ...value, documentId: randomUUID() },
    { ...value, regionalGuidance: undefined },
    wrongRegion,
  ]) {
    f.state.reply = async () => ({ ok: true, value: reply })
    refusal(
      await f.api.projects.importRegionalGuidanceReferenceImage(value.id, owner),
      'IPC_INVALID_RESPONSE',
    )
  }
  f.state.reply = async () => ({ ok: true, value })
  assert.ok((await f.api.projects.importRegionalGuidanceReferenceImage(value.id, owner)).ok)
})

test('reference preload rejects crossed resource identities and runtime fields in portable descriptors', async () => {
  const f = await fixture()
  const { owner, region, value } = ownerFixture()
  assert.ok(region.referenceImages)
  const original = region.referenceImages[0]
  for (const url of [
    original.thumbnailUrl.replace(owner.regionId, randomUUID()),
    original.thumbnailUrl.replace(original.id, randomUUID()),
    original.thumbnailUrl.replace(value.documentRevision, randomUUID()),
    original.thumbnailUrl.replace(original.thumbnail.sha256, 'c'.repeat(64)),
    original.thumbnailUrl.replace('://regional-reference/', '://asset/'),
    `${original.thumbnailUrl}?file=/private.png`,
    'file:///private.png',
    'data:image/webp;base64,AAAA',
    undefined,
  ]) {
    const reply = structuredClone(value)
    Object.assign(reply.regionalGuidance![0].referenceImages![0], { thumbnailUrl: url })
    f.state.reply = async () => ({ ok: true, value: reply })
    refusal(
      await f.api.projects.importRegionalGuidanceReferenceImage(value.id, owner),
      'IPC_INVALID_RESPONSE',
    )
  }
  for (const mutation of [
    { asset: { ...original.asset, imageUrl: 'file:///private.png' } },
    { asset: { ...original.asset, path: `assets/layers/${original.id}.png` } },
    { thumbnail: { ...original.thumbnail, width: 129 } },
    { thumbnail: { ...original.thumbnail, bytes: 128_001 } },
    { sourceFormat: 'SVG' },
    { sourcePath: '/private/source.png' },
  ]) {
    const reply = structuredClone(value)
    Object.assign(reply.regionalGuidance![0].referenceImages![0], mutation)
    f.state.reply = async () => ({ ok: true, value: reply })
    refusal(
      await f.api.projects.importRegionalGuidanceReferenceImage(value.id, owner),
      'IPC_INVALID_RESPONSE',
    )
  }
})

test('reference IDs cannot collide with region mask or sibling identities in a returned DTO', async () => {
  const f = await fixture()
  const { owner, region, value } = ownerFixture()
  assert.ok(region.referenceImages)
  for (const id of [region.id, region.mask.id, region.referenceImages[1].id]) {
    const reply = structuredClone(value)
    reply.regionalGuidance![0].referenceImages![0] = reference(id)
    refreshUrls(reply)
    f.state.reply = async () => ({ ok: true, value: reply })
    refusal(
      await f.api.projects.importRegionalGuidanceReferenceImage(value.id, owner),
      'IPC_INVALID_RESPONSE',
    )
  }
})

test('reference move/remove replies require their exact effect; null is import-only and legacy remains accepted', async () => {
  const f = await fixture()
  const { owner, region, value } = ownerFixture(1)
  assert.ok(region.referenceImages)
  const referenceId = region.referenceImages[0].id
  f.state.reply = async () => ({ ok: true, value })
  refusal(
    await f.api.projects.updateRegionalGuidanceReferenceImage(value.id, owner, {
      kind: 'remove',
      referenceId,
    }),
    'IPC_INVALID_RESPONSE',
  )
  f.state.reply = async () => ({ ok: true, value: null })
  refusal(
    await f.api.projects.updateRegionalGuidanceReferenceImage(value.id, owner, {
      kind: 'move',
      referenceId,
      targetIndex: 0,
    }),
    'IPC_INVALID_RESPONSE',
  )
  delete region.referenceImages
  f.state.reply = async () => ({ ok: true, value })
  assert.ok(
    (
      await f.api.projects.updateRegionalGuidanceReferenceImage(value.id, owner, {
        kind: 'remove',
        referenceId,
      })
    ).ok,
  )
  assert.ok(
    (
      await f.api.projects.updateRegionalGuidance(value.id, owner, {
        kind: 'rename',
        name: region.name,
      })
    ).ok,
  )
})
