import type { ProjectWorkspaceSummary } from '../../shared/projects/project-workspaces.js'

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  defaultProjectWorkspaceId,
  projectWorkspaceDestinationOptions,
  projectWorkspaceDestinationProblem,
} from './project-workspace-destinations.js'

const uncategorized: ProjectWorkspaceSummary = {
  availability: 'available',
  color: 'green',
  directoryPath: '/app/workspaces/Uncategorized',
  displayName: 'Uncategorized',
  id: 'uncategorized',
  isDefault: true,
  projectCount: 0,
  writable: true,
}
const selected: ProjectWorkspaceSummary = {
  ...uncategorized,
  color: 'teal',
  directoryPath: '/workspace',
  displayName: 'Selected workspace',
  id: '5a69bedd-7d56-4c73-9f90-aed742ed4f0f',
  isDefault: false,
}

test('new dialogs use the selected writable workspace and Uncategorized for aggregate or unavailable views', () => {
  for (const workspace of [
    selected,
    { ...selected, availability: 'missing' as const },
    { ...selected, availability: 'inaccessible' as const },
    { ...selected, writable: false },
  ]) {
    const workspaces = [uncategorized, workspace]
    assert.equal(
      defaultProjectWorkspaceId(workspaces, selected.id),
      workspace.availability === 'available' && workspace.writable ? selected.id : uncategorized.id,
    )
    assert.equal(defaultProjectWorkspaceId(workspaces, null), uncategorized.id)
    assert.equal(defaultProjectWorkspaceId(workspaces, 'unregistered'), uncategorized.id)
  }
})

test('captured destinations report disappearance, availability and write failures without changing the selection', () => {
  assert.equal(projectWorkspaceDestinationProblem([uncategorized, selected], selected.id), null)
  for (const workspaces of [
    [uncategorized],
    [uncategorized, { ...selected, availability: 'missing' as const }],
    [uncategorized, { ...selected, availability: 'inaccessible' as const }],
    [uncategorized, { ...selected, writable: false }],
  ]) {
    assert.ok(projectWorkspaceDestinationProblem(workspaces, selected.id))
    assert.equal(projectWorkspaceDestinationProblem(workspaces, uncategorized.id), null)
  }
})

test('the destination picker retains a disabled captured selection and omits other unwritable destinations', () => {
  const unavailable = { ...selected, availability: 'missing' as const }
  const readonly = { ...selected, id: 'cfece5e4-4991-421b-888b-82ac83097ba5', writable: false }
  const workspaces = [uncategorized, unavailable, readonly]
  assert.deepEqual(projectWorkspaceDestinationOptions(workspaces, selected.id), [
    { disabled: false, label: 'Uncategorized', value: uncategorized.id },
    { disabled: true, label: 'Selected workspace', value: selected.id },
  ])
  assert.deepEqual(projectWorkspaceDestinationOptions(workspaces, uncategorized.id), [
    { disabled: false, label: 'Uncategorized', value: uncategorized.id },
  ])
})
