import type { ProjectWorkspaceSummary, StudioApi } from '../../shared/api.js'
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

async function fixture() {
  let api: StudioApi | undefined
  const calls: { args: unknown[]; channel: string }[] = []
  const state = { value: null as unknown }
  runInNewContext((await bundle).outputFiles[0].text, {
    Buffer,
    clearTimeout,
    console,
    exports: {},
    module: { exports: {} },
    require: (name: string) => {
      assert.equal(name, 'electron')
      return {
        contextBridge: {
          exposeInMainWorld: (_name: string, value: StudioApi) => (api = value),
        },
        ipcRenderer: {
          invoke: async (channel: string, ...args: unknown[]) => {
            calls.push({ args, channel })
            return { ok: true, value: state.value }
          },
        },
      }
    },
    setTimeout,
    structuredClone,
    TextEncoder,
    URL,
  })
  assert.ok(api)
  return { api, calls, state }
}

function workspace(): ProjectWorkspaceSummary {
  return {
    availability: 'available',
    color: 'teal',
    directoryPath: '/trusted/main-selected-folder',
    displayName: 'Workspace',
    id: randomUUID(),
    isDefault: false,
    projectCount: 0,
    writable: true,
  }
}

test('workspace preload transports metadata and preserves legacy and scoped list arities', async () => {
  const f = await fixture()
  const value = workspace()
  f.state.value = value
  const input = { color: 'teal' as const, displayName: 'Workspace' }
  assert.equal((await f.api.projects.addWorkspace(input)).ok, true)
  f.state.value = null
  assert.deepEqual(structuredClone(await f.api.projects.addWorkspace(input)), {
    ok: true,
    value: null,
  })
  f.state.value = []
  assert.equal((await f.api.projects.list()).ok, true)
  assert.equal((await f.api.projects.list(value.id)).ok, true)
  f.state.value = [value]
  assert.equal((await f.api.projects.listWorkspaces()).ok, true)
  assert.deepEqual(f.calls, [
    { args: [input], channel: ipcChannels.projects.addWorkspace },
    { args: [input], channel: ipcChannels.projects.addWorkspace },
    { args: [], channel: ipcChannels.projects.list },
    { args: [value.id], channel: ipcChannels.projects.list },
    { args: [], channel: ipcChannels.projects.listWorkspaces },
  ])
})

test('workspace preload rejects impossible writable availability, counts and identities', async () => {
  const f = await fixture()
  const value = workspace()
  for (const patch of [
    { availability: 'missing', writable: true },
    { projectCount: -1 },
    { projectCount: 0.5 },
    { id: '../folder' },
    { availability: 'unknown' },
    { writable: 'yes' },
  ]) {
    f.state.value = [{ ...value, ...patch }]
    const result = await f.api.projects.listWorkspaces()
    assert.equal(result.ok, false, JSON.stringify(patch))
  }
  f.state.value = [{ ...value, availability: 'missing', writable: false }]
  assert.equal((await f.api.projects.listWorkspaces()).ok, true)
})

test('project list requires workspace ownership and import forwards explicit destination only when supplied', async () => {
  const f = await fixture()
  const project = {
    bbox: null,
    health: 'ready',
    id: `project-v1-${'a'.repeat(64)}`,
    previewStatus: 'empty',
    recoveryStatus: 'none',
    thumbnailUrl: null,
    title: 'Project',
    workspaceId: 'uncategorized',
  }
  f.state.value = [project]
  assert.equal((await f.api.projects.list()).ok, true)
  f.state.value = [{ ...project, workspaceId: undefined }]
  assert.equal((await f.api.projects.list()).ok, false)
  await f.api.projects.finishImport('import-token', 'copy')
  await f.api.projects.finishImport('import-token', 'move', 'uncategorized')
  assert.deepEqual(f.calls.slice(-2), [
    { args: ['import-token', 'copy'], channel: ipcChannels.projects.finishImport },
    { args: ['import-token', 'move', 'uncategorized'], channel: ipcChannels.projects.finishImport },
  ])
})

test('workspace management preload forwards explicit identity/confirmation and validates saved metadata', async () => {
  const f = await fixture()
  const value = workspace()
  const input = { color: 'violet' as const, displayName: 'Renamed' }
  f.state.value = { ...value, ...input }
  assert.equal((await f.api.projects.updateWorkspace(value.id, input)).ok, true)
  f.state.value = undefined
  assert.equal((await f.api.projects.removeWorkspace(value.id, true)).ok, true)
  assert.deepEqual(f.calls, [
    { args: [value.id, input], channel: ipcChannels.projects.updateWorkspace },
    { args: [value.id, true], channel: ipcChannels.projects.removeWorkspace },
  ])
  f.state.value = { ...value, availability: 'missing', writable: true }
  assert.equal((await f.api.projects.updateWorkspace(value.id, input)).ok, false)
})

test('Trash preload keeps the lifecycle owner and actual filename and validates pending deletion replies', async () => {
  const f = await fixture()
  const id = `project-v1-${'b'.repeat(64)}`
  const trashId = randomUUID()
  const item = {
    bbox: null,
    deletionError: null,
    deletionStatus: 'trashed',
    fileName: 'project-actual-uuid.igs',
    health: 'ready',
    id,
    originalWorkspaceDirectoryPath: '/trusted/workspace',
    originalWorkspaceName: 'Uncategorized',
    previewStatus: 'empty',
    recoveryStatus: 'none',
    thumbnailUrl: null,
    title: 'Readable title',
    trashedAt: '2026-11-11T00:00:00.000Z',
    trashId,
    workspaceId: 'uncategorized',
  }
  f.state.value = [item]
  const list = await f.api.projects.listTrash()
  assert.equal(list.ok, true)
  if (list.ok) {
    assert.equal(list.value[0].fileName, 'project-actual-uuid.igs')
  }
  for (const patch of [
    { trashId: '../file' },
    { deletionStatus: 'unknown' },
    { trashedAt: 'invalid' },
    { deletionError: 3 },
  ]) {
    f.state.value = [{ ...item, ...patch }]
    assert.equal((await f.api.projects.listTrash()).ok, false)
  }
  f.state.value = undefined
  assert.equal((await f.api.projects.trashProject(id)).ok, true)
  assert.equal((await f.api.projects.restoreProject(id, trashId)).ok, true)
  f.state.value = {
    kind: 'pending',
    message: 'The original file is unavailable; deletion remains pending.',
  }
  assert.equal((await f.api.projects.deleteProjectPermanently(id, trashId, true)).ok, true)
  assert.deepEqual(f.calls.slice(-3), [
    { args: [id], channel: ipcChannels.projects.trashProject },
    { args: [id, trashId], channel: ipcChannels.projects.restoreProject },
    { args: [id, trashId, true], channel: ipcChannels.projects.deleteProjectPermanently },
  ])
  f.state.value = { kind: 'pending', message: null }
  assert.equal((await f.api.projects.deleteProjectPermanently(id, trashId, true)).ok, false)
})

test('reveal preload sends opaque IDs only and validates void responses', async () => {
  const f = await fixture()
  const id = `project-v1-${'a'.repeat(64)}`
  const workspaceId = randomUUID()
  f.state.value = undefined
  assert.equal((await f.api.projects.revealProject(id)).ok, true)
  assert.equal((await f.api.projects.revealWorkspace(workspaceId)).ok, true)
  assert.deepEqual(f.calls, [
    { args: [id], channel: ipcChannels.projects.revealProject },
    { args: [workspaceId], channel: ipcChannels.projects.revealWorkspace },
  ])
  f.state.value = '/unexpected/filesystem/path'
  assert.equal((await f.api.projects.revealProject(id)).ok, false)
})

test('tab workspace identity is additive for legacy messages and strict when supplied', async () => {
  const f = await fixture()
  const document = createEmptyProjectDocumentV1({ title: 'Tab owner' })
  const tab = {
    acceptedResults: [],
    autosaveError: null,
    canRedo: false,
    canUndo: false,
    dirty: false,
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    generationDraft: document.generationDraft,
    id: `project-v1-${'b'.repeat(64)}`,
    lastActualSeedSnapshot: null,
    layers: [],
    primaryBbox: document.primaryBbox,
    title: document.title,
  }
  const request = { height: 64, title: 'Tab owner', width: 64 }
  for (const workspaceId of [undefined, randomUUID(), 'uncategorized']) {
    f.state.value = { ...tab, ...(workspaceId === undefined ? {} : { workspaceId }) }
    assert.equal((await f.api.projects.create(request)).ok, true)
  }
  for (const workspaceId of [null, '../foreign', 5, 'trash']) {
    f.state.value = { ...tab, workspaceId }
    assert.equal((await f.api.projects.create(request)).ok, false)
  }
})

test('tab relocation state is additive for legacy messages and strictly boolean when supplied', async () => {
  const f = await fixture()
  const document = createEmptyProjectDocumentV1({ title: 'Moving tab' })
  const tab = {
    acceptedResults: [],
    autosaveError: null,
    canRedo: false,
    canUndo: false,
    dirty: false,
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    generationDraft: document.generationDraft,
    id: `project-v1-${'e'.repeat(64)}`,
    lastActualSeedSnapshot: null,
    layers: [],
    primaryBbox: document.primaryBbox,
    title: document.title,
  }
  for (const relocationPending of [undefined, false, true]) {
    f.state.value = { ...tab, relocationPending }
    assert.equal(
      (await f.api.projects.create({ height: 64, title: 'Moving tab', width: 64 })).ok,
      true,
    )
  }
  for (const relocationPending of [null, 1, 'true']) {
    f.state.value = { ...tab, relocationPending }
    assert.equal(
      (await f.api.projects.create({ height: 64, title: 'Moving tab', width: 64 })).ok,
      false,
    )
  }
})

test('Move preload transports only stable Project and target workspace IDs and validates pending results', async () => {
  const f = await fixture()
  const id = `project-v1-${'c'.repeat(64)}`
  const target = randomUUID()
  f.state.value = { kind: 'moved' }
  assert.equal((await f.api.projects.moveProject(id, target)).ok, true)
  f.state.value = { kind: 'pending', message: 'Restore access to the original destination.' }
  assert.equal((await f.api.projects.moveProject(id, target)).ok, true)
  assert.deepEqual(f.calls[0], { args: [id, target], channel: ipcChannels.projects.moveProject })
  for (const value of [
    { kind: 'pending' },
    { kind: 'pending', message: null },
    { kind: 'copied' },
  ]) {
    f.state.value = value
    assert.equal((await f.api.projects.moveProject(id, target)).ok, false)
  }
})

test('Home preload preserves a finite pending Move projection and rejects arbitrary target paths', async () => {
  const f = await fixture()
  const summary = {
    bbox: { height: 64, width: 64 },
    health: 'ready',
    id: `project-v1-${'d'.repeat(64)}`,
    previewStatus: 'unavailable',
    recoveryStatus: 'none',
    thumbnailUrl: null,
    title: 'Pending Move',
    workspaceId: randomUUID(),
  }
  f.state.value = [{ ...summary, pendingMove: { message: 'Pending', workspaceId: randomUUID() } }]
  assert.equal((await f.api.projects.list()).ok, true)
  for (const pendingMove of [
    { message: 'Pending', workspaceId: '/tmp/foreign' },
    { workspaceId: randomUUID() },
    { message: null, workspaceId: randomUUID() },
  ]) {
    f.state.value = [{ ...summary, pendingMove }]
    assert.equal((await f.api.projects.list()).ok, false)
  }
})

test('Rename preload transports opaque Project identity and a name, validating finite pending replies', async () => {
  const f = await fixture()
  const id = `project-v1-${'f'.repeat(64)}`
  for (const value of [{ kind: 'renamed' }, { kind: 'pending', message: 'Retry original name' }]) {
    f.state.value = value
    assert.equal((await f.api.projects.renameProject(id, 'New name')).ok, true)
  }
  assert.deepEqual(f.calls[0], {
    args: [id, 'New name'],
    channel: ipcChannels.projects.renameProject,
  })
  for (const value of [
    { kind: 'moved' },
    { kind: 'pending' },
    { kind: 'pending', message: null },
  ]) {
    f.state.value = value
    assert.equal((await f.api.projects.renameProject(id, 'New name')).ok, false)
  }
  const summary = {
    bbox: null,
    health: 'ready',
    id,
    previewStatus: 'unavailable',
    recoveryStatus: 'none',
    thumbnailUrl: null,
    title: 'Old name',
    workspaceId: randomUUID(),
  }
  f.state.value = [{ ...summary, pendingRename: { message: 'Pending', name: 'New name' } }]
  assert.equal((await f.api.projects.list()).ok, true)
  for (const pendingRename of [
    { message: 'Pending', name: '../outside' },
    { message: 'Pending', name: ' Untrimmed ' },
    { name: 'New name' },
    { message: 'Pending', name: 4 },
  ]) {
    f.state.value = [{ ...summary, pendingRename }]
    assert.equal((await f.api.projects.list()).ok, false)
  }
  f.state.value = [
    {
      ...summary,
      pendingMove: { message: 'Other operation', workspaceId: randomUUID() },
      pendingRename: { message: 'Pending', name: 'New name' },
    },
  ]
  assert.equal((await f.api.projects.list()).ok, false)
})

test('Home browse timestamps accept legacy or canonical nullable metadata and reject malformed replies', async () => {
  const f = await fixture()
  const summary = {
    bbox: null,
    health: 'ready',
    id: `project-v1-${'f'.repeat(64)}`,
    previewStatus: 'empty',
    recoveryStatus: 'none',
    thumbnailUrl: null,
    title: 'Time metadata',
    workspaceId: randomUUID(),
  }
  for (const fields of [
    {},
    { lastOpenedAt: null, modifiedAt: null },
    { lastOpenedAt: '2026-11-11T01:02:03.000Z', modifiedAt: '1969-01-01T00:00:00.000Z' },
  ]) {
    f.state.value = [{ ...summary, ...fields }]
    assert.equal((await f.api.projects.list()).ok, true)
  }
  for (const fields of [
    { lastOpenedAt: 0 },
    { modifiedAt: 'yesterday' },
    { modifiedAt: '2026-11-11' },
    { lastOpenedAt: 'x'.repeat(1000) },
  ]) {
    f.state.value = [{ ...summary, ...fields }]
    assert.equal((await f.api.projects.list()).ok, false)
  }
})

test('Remove from Home preload transports opaque identity and explicit confirmation, accepting only void success', async () => {
  const f = await fixture()
  const id = `project-v1-${'a'.repeat(64)}`
  f.state.value = undefined
  assert.equal((await f.api.projects.removeMissingProject(id, true)).ok, true)
  assert.equal((await f.api.projects.removeMissingProject(id, false)).ok, true)
  assert.deepEqual(f.calls, [
    { args: [id, true], channel: ipcChannels.projects.removeMissingProject },
    { args: [id, false], channel: ipcChannels.projects.removeMissingProject },
  ])
  for (const value of [null, true, { removed: true }]) {
    f.state.value = value
    assert.equal((await f.api.projects.removeMissingProject(id, true)).ok, false)
  }
})

test('Locate Project preload sends only opaque identity and validates boolean linked or canceled replies', async () => {
  const f = await fixture()
  const id = `project-v1-${'a'.repeat(64)}`
  for (const value of [true, false]) {
    f.state.value = value
    const reply = await f.api.projects.locateProject(id)
    assert.equal(reply.ok, true)
    if (reply.ok) {
      assert.equal(reply.value, value)
    }
  }
  assert.deepEqual(f.calls, [
    { args: [id], channel: ipcChannels.projects.locateProject },
    { args: [id], channel: ipcChannels.projects.locateProject },
  ])
  for (const value of [null, undefined, 'true', 1, { located: true }]) {
    f.state.value = value
    assert.equal((await f.api.projects.locateProject(id)).ok, false)
  }
})

test('Locate Folder preload sends only workspace identity and validates boolean connected or canceled replies', async () => {
  const f = await fixture()
  const id = randomUUID()
  for (const value of [true, false]) {
    f.state.value = value
    const reply = await f.api.projects.locateWorkspace(id)
    assert.equal(reply.ok, true)
    if (reply.ok) {
      assert.equal(reply.value, value)
    }
  }
  assert.deepEqual(f.calls, [
    { args: [id], channel: ipcChannels.projects.locateWorkspace },
    { args: [id], channel: ipcChannels.projects.locateWorkspace },
  ])
  for (const value of [null, undefined, 'true', 1, { located: true }]) {
    f.state.value = value
    assert.equal((await f.api.projects.locateWorkspace(id)).ok, false)
  }
})

test('Home preload admits only opaque versioned merged preview URLs and preserves older summaries', async () => {
  const f = await fixture()
  const project = {
    bbox: null,
    health: 'ready',
    id: `project-v1-${'a'.repeat(64)}`,
    previewStatus: 'empty',
    recoveryStatus: 'none',
    thumbnailUrl: null,
    title: 'Saved preview',
    workspaceId: 'uncategorized',
  }
  const url = `igs-preview://merged/${project.id}/${'b'.repeat(64)}/${'c'.repeat(64)}/${'d'.repeat(64)}.png`
  for (const previewUrl of [undefined, null, url]) {
    f.state.value = [{ ...project, previewUrl }]
    assert.equal((await f.api.projects.list()).ok, true)
  }
  for (const previewUrl of [
    '/local/project.igs',
    url.replace('igs-preview:', 'file:'),
    url.replace('//merged/', '//thumbnail/'),
    url.replace('.png', '.webp'),
    `${url}?path=elsewhere`,
    `${url}#old`,
    url.replace('//merged/', '//user@merged/'),
    url.replace('//merged/', '//merged:443/'),
    true,
  ]) {
    f.state.value = [{ ...project, previewUrl }]
    assert.equal((await f.api.projects.list()).ok, false)
  }
})
