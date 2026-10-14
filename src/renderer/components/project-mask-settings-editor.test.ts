import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  parseProjectMaskSettingInput,
  ProjectMaskSettingsEditor,
  type ProjectMaskSettingsOwner,
} from './project-mask-settings-editor.js'

const owner: ProjectMaskSettingsOwner = {
  documentId: '30fa722d-f7df-4574-98ca-f3f0c44cad06',
  documentRevision: 'a154f2af-2e1b-4bc5-b745-505ba3dcadf3',
  layerId: '3f774a84-c7e0-4f58-9e22-174cfd79492c',
  projectKey: 'local-project',
}

test('the real raw parser preserves zero and the finite ceiling while refusing Naive clamp/round candidates', () => {
  for (const [raw, expected] of [
    ['0', 0],
    ['512', 512],
    [' 16 ', 16],
    ['008', 8],
  ] as const) {
    assert.equal(parseProjectMaskSettingInput(raw), expected)
  }
  for (const raw of ['', ' ', '-1', '+1', '513', '1.5', '16px', '1e2', '0x10', 'Infinity', 'NaN']) {
    assert.equal(parseProjectMaskSettingInput(raw), null, `Malformed draft ${JSON.stringify(raw)}`)
  }
})

test('Enter then blur publishes exactly one captured scalar request with no neighboring setting', () => {
  const mutableOwner = { ...owner }
  const editor = new ProjectMaskSettingsEditor(mutableOwner, 'blur', 16)
  mutableOwner.layerId = 'later-patch'
  editor.update('2')
  editor.update('32')
  assert.deepEqual(editor.finish(owner), {
    change: {
      documentId: owner.documentId,
      documentRevision: owner.documentRevision,
      kind: 'mask-blur',
      value: 32,
    },
    layerId: owner.layerId,
  })
  assert.equal(editor.finish(owner), null, 'Blur after Enter cannot create a second history entry.')
  assert.equal(
    editor.update('40'),
    false,
    'Late input cannot reopen the consumed focus transaction.',
  )
  const padding = new ProjectMaskSettingsEditor(owner, 'padding', 8)
  padding.update('0')
  assert.deepEqual(padding.finish(owner), {
    change: {
      documentId: owner.documentId,
      documentRevision: owner.documentRevision,
      kind: 'bbox-padding',
      value: 0,
    },
    layerId: owner.layerId,
  })
})

test('the actual editor rejects malformed drafts, accepts a corrected draft and treats unchanged zero as a no-op', () => {
  for (const raw of ['', '-1', '513', '1.5', '16px']) {
    const invalid = new ProjectMaskSettingsEditor(owner, 'blur', 16)
    invalid.update(raw)
    assert.equal(invalid.finish(owner), null)
    const corrected = new ProjectMaskSettingsEditor(owner, 'blur', 16)
    corrected.update(raw)
    corrected.update('17')
    assert.equal(corrected.finish(owner)?.change.value, 17)
  }
  const untouched = new ProjectMaskSettingsEditor(owner, 'padding', 8)
  assert.equal(untouched.finish(owner), null)
  const unchangedZero = new ProjectMaskSettingsEditor(owner, 'blur', 0)
  unchangedZero.update('000')
  assert.equal(unchangedZero.finish(owner), null)
})

test('selection, project, document, revision changes and Escape cancel instead of retargeting to a new owner', () => {
  for (const change of [
    { projectKey: 'later-project' },
    { documentId: 'later-document' },
    { documentRevision: 'later-revision' },
    { layerId: 'later-patch' },
  ]) {
    const editor = new ProjectMaskSettingsEditor(owner, 'padding', 8)
    editor.update('32')
    assert.equal(editor.finish({ ...owner, ...change }), null)
  }
  const vanished = new ProjectMaskSettingsEditor(owner, 'padding', 8)
  vanished.update('32')
  assert.equal(vanished.finish(null), null)
  const canceled = new ProjectMaskSettingsEditor(owner, 'padding', 8)
  canceled.update('32')
  canceled.cancel()
  assert.equal(canceled.finish(owner), null)
  assert.equal(canceled.update('64'), false)
  const neighboringCurrentOwner = new ProjectMaskSettingsEditor(owner, 'padding', 8)
  neighboringCurrentOwner.update('32')
  assert.equal(neighboringCurrentOwner.finish(owner)?.change.value, 32)
})
