import assert from 'node:assert/strict'
import test from 'node:test'

import type { ProjectSummary } from '../api.js'

import { isHomeProjectTimestamp, selectHomeProjects } from './home-project-browse.js'

function project(id: string, patch: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    bbox: null,
    health: 'ready',
    id,
    previewStatus: 'empty',
    recoveryStatus: 'none',
    thumbnailUrl: null,
    title: id,
    workspaceId: 'available',
    ...patch,
  }
}
const workspaces = [
  { availability: 'available' as const, id: 'available' },
  { availability: 'missing' as const, id: 'missing' },
]
const view = (
  projects: ProjectSummary[],
  patch: Partial<Parameters<typeof selectHomeProjects>[0]> = {},
) =>
  selectHomeProjects({
    openProjectIds: [],
    projects,
    search: '',
    sort: 'lastOpened',
    status: 'all',
    workspaces,
    ...patch,
  })

test('Home view adapts Invoke natural-name sorting and trimmed name-only search without mutation', () => {
  const rows = [
    project('c', { title: 'Scene 10' }),
    project('b', { title: 'scene 2' }),
    project('a', { recoveryReason: 'private searchable note', title: 'Scene 2' }),
  ]
  const original = structuredClone(rows)
  assert.deepEqual(
    view(rows, { sort: 'name' }).map(({ id }) => id),
    ['a', 'b', 'c'],
  )
  assert.deepEqual(
    view(rows, { search: '  SCENE 2  ' }).map(({ id }) => id),
    ['a', 'b'],
  )
  assert.deepEqual(view(rows, { search: 'private' }), [])
  assert.deepEqual(rows, original)
  assert.equal(view(rows, { sort: 'name' })[0], rows[2])
})

test('Home timestamp sorts use actual selected metadata, unknown last and stable name/identity ties', () => {
  const rows = [
    project('a', {
      lastOpenedAt: '2026-01-01T00:00:00.000Z',
      modifiedAt: '2026-03-01T00:00:00.000Z',
      title: 'Earlier',
    }),
    project('b', {
      lastOpenedAt: '2026-02-01T00:00:00.000Z',
      modifiedAt: '2026-01-01T00:00:00.000Z',
      title: 'Later',
    }),
    project('c', { lastOpenedAt: null, modifiedAt: null, title: 'Unknown' }),
    project('d', { title: 'Legacy' }),
    project('e', { modifiedAt: '1969-01-01T00:00:00.000Z', title: 'Pre-epoch' }),
  ]
  assert.deepEqual(
    view(rows).map(({ id }) => id),
    ['b', 'a', 'd', 'e', 'c'],
  )
  assert.deepEqual(
    view(rows, { sort: 'modified' }).map(({ id }) => id),
    ['a', 'b', 'e', 'd', 'c'],
  )
})

test('Home status predicates stay independent across open, recovery, preview and workspace conditions', () => {
  const rows = [
    project('ready'),
    project('preview', { previewStatus: 'unavailable' }),
    project('recovery', { recoveryStatus: 'recoverable' }),
    project('stale', { recoveryStatus: 'stale' }),
    project('bad', { health: 'corrupt' }),
    project('missing-file', { health: 'missing' }),
    project('unsupported', { health: 'unsupported_schema' }),
    project('offline', { workspaceId: 'missing' }),
    project('unregistered', { workspaceId: 'unknown' }),
    project('pending', { pendingRename: { message: 'Pending', name: 'New name' } }),
  ]
  assert.deepEqual(
    view(rows, { status: 'attention' }).map(({ id }) => id),
    ['bad', 'missing-file', 'offline', 'unregistered', 'unsupported'],
  )
  assert.deepEqual(
    view(rows, { status: 'recovery' }).map(({ id }) => id),
    ['recovery'],
  )
  assert.deepEqual(
    view(rows, { openProjectIds: ['ready', 'preview', 'offline'], status: 'open' }).map(
      ({ id }) => id,
    ),
    ['offline', 'preview', 'ready'],
  )
  assert.deepEqual(
    view(rows, { search: 'FILE', status: 'attention' }).map(({ id }) => id),
    ['missing-file'],
  )
})

test('Home timestamp boundary accepts canonical ISO/null and refuses non-finite or noncanonical messages', () => {
  for (const value of [null, '2026-11-11T01:02:03.000Z', '1969-01-01T00:00:00.000Z']) {
    assert.equal(isHomeProjectTimestamp(value), true)
  }
  for (const value of [
    undefined,
    2,
    '',
    '2026-11-11',
    '2026-11-11T01:02:03Z',
    'invalid',
    'x'.repeat(1000),
  ]) {
    assert.equal(isHomeProjectTimestamp(value), false)
  }
})
