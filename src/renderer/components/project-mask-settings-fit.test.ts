import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ProjectMaskSettingsFit,
  type ProjectMaskSettingsFitState,
} from './project-mask-settings-fit.js'

const state: ProjectMaskSettingsFitState = {
  available: true,
  busy: false,
  failed: false,
  geometry: {
    boundingBox: { height: 256, width: 136, x: 80, y: -64 },
    internalResolution: { height: 768, width: 768 },
    mask: {
      asset: {
        bytes: 2048,
        height: 180,
        path: 'assets/masks/38bc91c2-c06e-4d63-99b8-d4775733b5ed/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png',
        sha256: 'a'.repeat(64),
        width: 60,
      },
      bounds: { height: 180, width: 60, x: 116, y: -28 },
      id: '38bc91c2-c06e-4d63-99b8-d4775733b5ed',
      revision: 3,
    },
  },
  owner: {
    documentId: '30fa722d-f7df-4574-98ca-f3f0c44cad06',
    documentRevision: 'a154f2af-2e1b-4bc5-b745-505ba3dcadf3',
    layerId: '3f774a84-c7e0-4f58-9e22-174cfd79492c',
    maskId: '38bc91c2-c06e-4d63-99b8-d4775733b5ed',
    maskRevision: 3,
    projectKey: 'local-project',
  },
  settings: { blur: 31, padding: 5 },
}
const settled = (): ProjectMaskSettingsFitState => ({
  ...structuredClone(state),
  owner: { ...state.owner!, documentRevision: '548cba2b-819f-408f-a3fa-d7fe69df19fd' },
  settings: { blur: 31, padding: 6 },
})
const intent = () =>
  new ProjectMaskSettingsFit(state.owner!, { blur: 31, padding: 6 }, state.geometry)

test('the actual explicit Fit continuation waits for its scalar and emits one request with the new revision', () => {
  const continuation = intent()
  assert.deepEqual(continuation.advance({ ...state, busy: true }), { kind: 'waiting' })
  const current = settled()
  assert.deepEqual(continuation.advance(current), {
    kind: 'ready',
    layerId: state.owner!.layerId,
    request: {
      documentId: state.owner!.documentId,
      documentRevision: current.owner!.documentRevision,
      edit: { kind: 'fit-bbox' },
      maskId: state.owner!.maskId,
      maskRevision: 3,
    },
  })
  assert.deepEqual(
    continuation.advance(current),
    { kind: 'cancelled' },
    'A later render cannot Fit again.',
  )
})

test('unchanged revision, failed scalar and wrong neighboring setting consume the intent instead of fitting', () => {
  for (const current of [
    state,
    { ...settled(), settings: { blur: 31, padding: 5 } },
    { ...settled(), settings: { blur: 32, padding: 6 } },
    { ...settled(), failed: true },
  ]) {
    const continuation = intent()
    assert.deepEqual(continuation.advance(current), { kind: 'cancelled' })
    assert.deepEqual(
      continuation.advance(settled()),
      { kind: 'cancelled' },
      'Failure cannot retry silently.',
    )
  }
  assert.equal(intent().advance(settled()).kind, 'ready')
})

test('owner or mask changes, lock/reload availability and geometry changes cancel even during busy settlement', () => {
  for (const change of [
    { projectKey: 'later-project' },
    { documentId: 'later-document' },
    { layerId: 'later-layer' },
    { maskId: 'later-mask' },
    { maskRevision: 4 },
  ]) {
    const continuation = intent()
    assert.deepEqual(
      continuation.advance({ ...settled(), busy: true, owner: { ...state.owner!, ...change } }),
      { kind: 'cancelled' },
    )
  }
  for (const current of [
    { ...settled(), owner: null },
    { ...settled(), available: false },
    {
      ...settled(),
      geometry: { ...state.geometry, boundingBox: { ...state.geometry.boundingBox, x: 81 } },
    },
    {
      ...settled(),
      geometry: { ...state.geometry, internalResolution: { height: 768, width: 1024 } },
    },
    {
      ...settled(),
      geometry: { ...state.geometry, mask: { ...state.geometry.mask, asset: null } },
    },
  ]) {
    assert.deepEqual(intent().advance({ ...current, busy: true }), { kind: 'cancelled' })
  }
  const cancelled = intent()
  cancelled.cancel()
  assert.deepEqual(cancelled.advance(settled()), { kind: 'cancelled' })
  assert.equal(intent().advance(settled()).kind, 'ready')
})
