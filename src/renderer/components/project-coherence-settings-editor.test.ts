import type { SmartPatchCoherenceSettings } from '../../shared/projects/smart-patch-coherence-settings.js'

import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { ProjectMaskSettingsOwner } from './project-mask-settings-editor.js'

import {
  parseProjectCoherenceNumericInput,
  ProjectCoherenceSettingsEditor,
} from './project-coherence-settings-editor.js'

const owner: ProjectMaskSettingsOwner = {
  documentId: 'document-a',
  documentRevision: 'revision-a',
  layerId: 'patch-a',
  projectKey: 'project-a',
}
const defaults: SmartPatchCoherenceSettings = {
  edgeSize: 16,
  minimumDenoise: 0,
  mode: 'Gaussian Blur',
}

test('coherence numeric drafts accept exact edge boundaries and fractional denoise without coercion', () => {
  assert.equal(parseProjectCoherenceNumericInput('edgeSize', '0'), 0)
  assert.equal(parseProjectCoherenceNumericInput('edgeSize', '7'), 7)
  assert.equal(parseProjectCoherenceNumericInput('edgeSize', '1024'), 1024)
  assert.equal(parseProjectCoherenceNumericInput('edgeSize', ' 16 '), 16)
  for (const raw of ['', '16.5', '1025', '-1', 'Infinity', 'NaN', '1e2', '0x10']) {
    assert.equal(parseProjectCoherenceNumericInput('edgeSize', raw), null, raw)
  }
  assert.equal(parseProjectCoherenceNumericInput('minimumDenoise', '0'), 0)
  assert.equal(parseProjectCoherenceNumericInput('minimumDenoise', '.125'), 0.125)
  assert.equal(parseProjectCoherenceNumericInput('minimumDenoise', '1'), 1)
  for (const raw of ['', '-.1', '1.01', 'Infinity', 'NaN', '1e-1', '0x0', '.']) {
    assert.equal(parseProjectCoherenceNumericInput('minimumDenoise', raw), null, raw)
  }
})

test('coherence Enter followed by blur emits one captured whole-profile change', () => {
  const editor = new ProjectCoherenceSettingsEditor(owner, 'edgeSize', defaults)
  editor.update('24')
  assert.deepEqual(editor.finish(owner), {
    change: {
      documentId: 'document-a',
      documentRevision: 'revision-a',
      kind: 'coherence-settings',
      value: { edgeSize: 24, minimumDenoise: 0, mode: 'Gaussian Blur' },
    },
    layerId: 'patch-a',
  })
  assert.equal(editor.finish(owner), null)
  assert.equal(editor.update('32'), false)
})

test('coherence editing minimum preserves nondefault edge and mode captured from its owner', () => {
  const editor = new ProjectCoherenceSettingsEditor(owner, 'minimumDenoise', {
    edgeSize: 64,
    minimumDenoise: 0.25,
    mode: 'Box Blur',
  })
  editor.update('0')
  assert.deepEqual(editor.finish(owner)?.change.value, {
    edgeSize: 64,
    minimumDenoise: 0,
    mode: 'Box Blur',
  })
})

test('coherence mode intent preserves the numeric profile and rejects unknown modes', () => {
  const profile: SmartPatchCoherenceSettings = {
    edgeSize: 7,
    minimumDenoise: 0.375,
    mode: 'Gaussian Blur',
  }
  const editor = new ProjectCoherenceSettingsEditor(owner, 'mode', profile)
  editor.update('Staged')
  assert.deepEqual(editor.finish(owner)?.change.value, {
    edgeSize: 7,
    minimumDenoise: 0.375,
    mode: 'Staged',
  })
  const invalid = new ProjectCoherenceSettingsEditor(owner, 'mode', profile)
  invalid.update('Gaussian')
  assert.equal(invalid.finish(owner), null)
})

test('coherence invalid raw refuses publication but a corrected same-focus draft can publish', () => {
  const refused = new ProjectCoherenceSettingsEditor(owner, 'edgeSize', defaults)
  refused.update('16.5')
  assert.equal(refused.finish(owner), null)
  const corrected = new ProjectCoherenceSettingsEditor(owner, 'edgeSize', defaults)
  corrected.update('16.5')
  corrected.update('8')
  assert.equal(corrected.finish(owner)?.change.value.edgeSize, 8)
})

test('coherence unchanged resolved default produces no whole-profile command', () => {
  for (const field of ['edgeSize', 'minimumDenoise', 'mode'] as const) {
    const editor = new ProjectCoherenceSettingsEditor(owner, field, defaults)
    editor.update(String(defaults[field]))
    assert.equal(editor.finish(owner), null)
  }
})

test('coherence later owner revision, document, project or layer cancels rather than retargets', () => {
  for (const field of ['projectKey', 'documentId', 'documentRevision', 'layerId'] as const) {
    const editor = new ProjectCoherenceSettingsEditor(owner, 'edgeSize', defaults)
    editor.update('32')
    assert.equal(editor.finish({ ...owner, [field]: 'other-owner' }), null, field)
    const unchangedOwner = new ProjectCoherenceSettingsEditor(owner, 'edgeSize', defaults)
    unchangedOwner.update('32')
    assert.equal(unchangedOwner.finish(owner)?.layerId, 'patch-a', field)
  }
  const vanished = new ProjectCoherenceSettingsEditor(owner, 'edgeSize', defaults)
  vanished.update('32')
  assert.equal(vanished.finish(null), null)
})

test('coherence Escape consumes the transaction while a fresh neighboring edit remains valid', () => {
  const cancelled = new ProjectCoherenceSettingsEditor(owner, 'minimumDenoise', defaults)
  cancelled.update('0.5')
  cancelled.cancel()
  assert.equal(cancelled.finish(owner), null)
  const fresh = new ProjectCoherenceSettingsEditor(owner, 'minimumDenoise', defaults)
  fresh.update('0.5')
  assert.equal(fresh.finish(owner)?.change.value.minimumDenoise, 0.5)
})

test('coherence caller mutation cannot poison captured owner or untouched profile fields', () => {
  const suppliedOwner = { ...owner }
  const suppliedSettings = { ...defaults }
  const editor = new ProjectCoherenceSettingsEditor(suppliedOwner, 'edgeSize', suppliedSettings)
  suppliedOwner.layerId = 'patch-b'
  suppliedSettings.mode = 'Staged'
  suppliedSettings.minimumDenoise = 1
  editor.update('8')
  assert.deepEqual(editor.finish(owner), {
    change: {
      documentId: 'document-a',
      documentRevision: 'revision-a',
      kind: 'coherence-settings',
      value: { edgeSize: 8, minimumDenoise: 0, mode: 'Gaussian Blur' },
    },
    layerId: 'patch-a',
  })
})
