import assert from 'node:assert/strict'
import test from 'node:test'
import * as v from 'valibot'

import { isProjectSmartPatchLayerChange } from '../api.js'
import {
  PROJECT_MASK_DEFAULT_SETTINGS,
  PROJECT_MASK_SETTINGS_MAX,
  ProjectMaskSettingsSchema,
  resolveProjectMaskSettings,
} from './project-mask-settings.js'

test('actual mask settings schema retains independent zero/default/max values and rejects malformed policies', () => {
  for (const settings of [
    { blur: 0, padding: 0 },
    { blur: 16, padding: 8 },
    { blur: 512, padding: 0 },
    { blur: 0, padding: 512 },
  ]) {
    assert.deepEqual(v.parse(ProjectMaskSettingsSchema, settings), settings)
  }
  assert.equal(PROJECT_MASK_SETTINGS_MAX, 512)
  for (const invalid of [
    null,
    [],
    { blur: 16 },
    { padding: 8 },
    { blur: -1, padding: 8 },
    { blur: 0.5, padding: 8 },
    { blur: 513, padding: 8 },
    { blur: NaN, padding: 8 },
    { blur: Infinity, padding: 8 },
    { blur: '16', padding: 8 },
    { blur: 16, padding: -1 },
    { blur: 16, padding: 0.5 },
    { blur: 16, padding: 513 },
    { blur: 16, other: 1, padding: 8 },
  ]) {
    assert.equal(v.safeParse(ProjectMaskSettingsSchema, invalid).success, false)
  }
})

test('legacy settings resolve without mutation and return detached policy values', () => {
  assert.ok(Object.isFrozen(PROJECT_MASK_DEFAULT_SETTINGS))
  const absent = resolveProjectMaskSettings(undefined)
  assert.deepEqual(absent, { blur: 16, padding: 8 })
  absent.blur = 0
  assert.deepEqual(PROJECT_MASK_DEFAULT_SETTINGS, { blur: 16, padding: 8 })
  const explicit = { blur: 0, padding: 27 }
  const resolved = resolveProjectMaskSettings(explicit)
  resolved.padding = 0
  assert.deepEqual(explicit, { blur: 0, padding: 27 })
})

test('actual targeted setting API requires exactly the captured document identities and bounded scalar', () => {
  const documentId = 'f1099bf4-05ea-44d8-b5de-6884ece7ba45'
  const documentRevision = '6ea21a66-41e5-43ee-80e2-e9837b7c0eb8'
  for (const kind of ['mask-blur', 'bbox-padding']) {
    const change = { documentId, documentRevision, kind, value: 0 }
    assert.equal(isProjectSmartPatchLayerChange(change), true)
    assert.equal(isProjectSmartPatchLayerChange({ ...change, value: 512 }), true)
    for (const invalid of [
      { ...change, value: -1 },
      { ...change, value: 0.5 },
      { ...change, value: 513 },
      { ...change, value: NaN },
      { ...change, value: Infinity },
      { ...change, value: '0' },
      { ...change, documentId: 'wrong' },
      { ...change, documentRevision: 'wrong' },
      { ...change, documentId: undefined },
      { kind, value: 0 },
      { ...change, layerId: documentId },
      { ...change, padding: 8 },
    ]) {
      assert.equal(isProjectSmartPatchLayerChange(invalid), false)
    }
  }
  assert.equal(isProjectSmartPatchLayerChange({ kind: 'lock', locked: false }), true)
  assert.equal(isProjectSmartPatchLayerChange({ kind: 'opacity', opacity: 0.5 }), true)
})
