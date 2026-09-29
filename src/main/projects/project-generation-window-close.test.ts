import assert from 'node:assert/strict'
import test from 'node:test'

import { releaseCanceledWindowCloseFences } from './project-generation-window-close.js'

test('canceling native close releases only close-owned fences, preserving a failed Add guard', () => {
  const released: string[] = []
  const pending = new Set(['project-with-interrupted-add'])
  releaseCanceledWindowCloseFences(
    ['project-with-interrupted-add', 'clean-project'],
    (tabId) => pending.has(tabId),
    (tabId) => released.push(tabId),
  )
  assert.deepEqual(released, ['clean-project'])

  pending.clear()
  releaseCanceledWindowCloseFences(
    ['project-with-interrupted-add'],
    (tabId) => pending.has(tabId),
    (tabId) => released.push(tabId),
  )
  assert.deepEqual(released, ['clean-project', 'project-with-interrupted-add'])
})
