import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ProjectLaunchPaths } from './project-launch-paths.js'

test('launch paths keep OS invocation order and resolve relative paths against the sender directory', () => {
  const pending = new ProjectLaunchPaths()
  assert.equal(pending.enqueue(['Project A.igs'], '/first'), true)
  assert.equal(pending.enqueue(['/first/./Project A.igs'], '/second'), true)
  assert.equal(pending.enqueue(['../second/Project A.IGS'], '/second'), true)
  assert.equal(pending.take(), '/first/Project A.igs')
  assert.equal(pending.hasPending, true)
  assert.equal(pending.take(), '/second/Project A.IGS')
  assert.equal(pending.hasPending, false)
  assert.equal(pending.take(), null)
  assert.equal(pending.enqueue(['/first/Project A.igs'], '/'), true)
  assert.equal(pending.take(), '/first/Project A.igs')
})

test('launch paths ignore options and URLs and allow a dash-prefixed file after the delimiter', () => {
  const pending = new ProjectLaunchPaths()
  assert.equal(
    pending.enqueue(
      [
        '--label=Project.igs',
        '-project.igs',
        'file:///some/project.igs',
        'igs://project.igs',
        'notes.txt',
      ],
      '/caller',
    ),
    false,
  )
  assert.equal(pending.enqueue(['--', '-project.igs'], '/caller'), true)
  assert.equal(pending.take(), '/caller/-project.igs')
  assert.equal(pending.enqueue(['relative.igs'], ''), false)
  assert.equal(pending.enqueue(['/absolute.igs'], ''), true)
  assert.equal(pending.take(), '/absolute.igs')
})
