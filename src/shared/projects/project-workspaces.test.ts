import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import {
  isProjectWorkspaceAddInput,
  isProjectWorkspaceId,
  parseProjectWorkspaceAddInput,
  PROJECT_WORKSPACE_COLORS,
  PROJECT_WORKSPACE_NAME_MAX_LENGTH,
} from './project-workspaces.js'

test('workspace metadata accepts only trimmed bounded names and approved colors without a path', () => {
  for (const color of PROJECT_WORKSPACE_COLORS) {
    assert.deepEqual(parseProjectWorkspaceAddInput({ color, displayName: '  Work  ' }), {
      color,
      displayName: 'Work',
    })
  }
  assert.equal(
    isProjectWorkspaceAddInput({
      color: 'teal',
      displayName: 'x'.repeat(PROJECT_WORKSPACE_NAME_MAX_LENGTH),
    }),
    true,
  )
  for (const value of [
    null,
    [],
    {},
    { color: 'teal', displayName: '' },
    { color: 'teal', displayName: '  ' },
    { color: 'teal', displayName: 3 },
    { color: 'teal', displayName: 'x'.repeat(PROJECT_WORKSPACE_NAME_MAX_LENGTH + 1) },
    { color: 'red', displayName: 'Work' },
    { color: 'teal', directoryPath: '/renderer/path', displayName: 'Work' },
  ]) {
    assert.equal(isProjectWorkspaceAddInput(value), false)
    assert.throws(() => parseProjectWorkspaceAddInput(value))
  }
})

test('workspace identity rejects paths, aggregate selections and malformed IDs', () => {
  assert.equal(isProjectWorkspaceId('uncategorized'), true)
  assert.equal(isProjectWorkspaceId(randomUUID()), true)
  for (const value of [
    undefined,
    null,
    '',
    'projects',
    'trash',
    '../folder',
    '/folder',
    'arbitrary',
  ]) {
    assert.equal(isProjectWorkspaceId(value), false)
  }
})
