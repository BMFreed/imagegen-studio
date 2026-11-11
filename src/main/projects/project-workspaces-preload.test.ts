import type { ProjectWorkspaceSummary, StudioApi } from '../../shared/api.js'
import { ipcChannels } from '../../shared/api.js'

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
