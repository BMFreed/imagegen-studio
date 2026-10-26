import { parseProjectMaskEdit } from '../../shared/projects/project-mask.js'

import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { MaskGestureOwner } from './project-mask-gesture.js'

import {
  projectMaskFitRequest,
  ProjectMaskTransformGesture,
  snapProjectMaskTransformToPixelGrid,
} from './project-mask-transform-gesture.js'

const owner: MaskGestureOwner = {
  documentId: '30fa722d-f7df-4574-98ca-f3f0c44cad06',
  documentRevision: 'a154f2af-2e1b-4bc5-b745-505ba3dcadf3',
  layerId: '3f774a84-c7e0-4f58-9e22-174cfd79492c',
  maskId: '38bc91c2-c06e-4d63-99b8-d4775733b5ed',
  maskRevision: 3,
  projectKey: 'local-project',
}
const bounds = { height: 12, width: 40, x: -20, y: 32 }

test('the actual transform producer retains one original owner, bounds and independent affine preview', () => {
  const mutableOwner = { ...owner }
  const mutableBounds = { ...bounds }
  const gesture = new ProjectMaskTransformGesture(mutableOwner, mutableBounds)
  mutableOwner.layerId = 'later-layer'
  mutableBounds.x = 900
  const transform = { rotationDegrees: -90, scaleX: 2, scaleY: 0.5, x: -10.5, y: 42 }
  gesture.update(transform)
  transform.x = 1000
  assert.deepEqual(gesture.bounds, bounds)
  assert.deepEqual(gesture.finish({ ...owner }), {
    documentId: owner.documentId,
    documentRevision: owner.documentRevision,
    edit: {
      kind: 'transform',
      transform: { rotationDegrees: 270, scaleX: 2, scaleY: 0.5, x: -10.5, y: 42 },
    },
    maskId: owner.maskId,
    maskRevision: owner.maskRevision,
  })
  assert.equal(gesture.finish(owner), null, 'Apply cannot publish the same session twice.')
})

test('changed project, document or mask identity and revisions cancel rather than retarget a transform', () => {
  for (const change of [
    { projectKey: 'later-project' },
    { documentId: 'later-document' },
    { documentRevision: 'later-revision' },
    { layerId: 'later-patch' },
    { maskId: 'later-mask' },
    { maskRevision: 4 },
    { kind: 'regional-guidance' as const },
  ]) {
    const gesture = new ProjectMaskTransformGesture(owner, bounds)
    gesture.update({ rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -19, y: 32 })
    assert.equal(gesture.finish({ ...owner, ...change }), null)
  }
  const original = new ProjectMaskTransformGesture(owner, bounds)
  original.update({ rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -19, y: 32 })
  assert.notEqual(original.finish(owner), null)
})

test('regional transforms preserve their captured owner and leave the Smart Fit producer unchanged', () => {
  const regionalOwner: MaskGestureOwner = { ...owner, kind: 'regional-guidance' }
  const moved = { rotationDegrees: 90, scaleX: 1, scaleY: 1, x: -19, y: 32 }
  const refused = new ProjectMaskTransformGesture(regionalOwner, bounds)
  refused.update(moved)
  assert.equal(refused.finish(owner), null)
  const valid = new ProjectMaskTransformGesture(regionalOwner, bounds)
  valid.update(moved)
  assert.deepEqual(valid.finish(regionalOwner)?.edit, { kind: 'transform', transform: moved })
  assert.deepEqual(projectMaskFitRequest(owner).edit, { kind: 'fit-bbox' })
})

test('Escape-style cancellation discards preview and refuses late dragend or Enter', () => {
  const gesture = new ProjectMaskTransformGesture(owner, bounds)
  gesture.update({ rotationDegrees: 45, scaleX: 1.5, scaleY: 1, x: 20, y: 70 })
  gesture.cancel()
  assert.equal(gesture.update({ rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 10, y: 10 }), false)
  assert.equal(gesture.finish(owner), null)
})

test('unchanged or full-turn preview emits no command while a one-pixel move is preserved', () => {
  const unchanged = new ProjectMaskTransformGesture(owner, bounds)
  assert.equal(unchanged.finish(owner), null)
  const fullTurn = new ProjectMaskTransformGesture(owner, bounds)
  fullTurn.update({ rotationDegrees: -360, scaleX: 1, scaleY: 1, x: -20, y: 32 })
  assert.equal(fullTurn.finish(owner), null)
  const moved = new ProjectMaskTransformGesture(owner, bounds)
  moved.update({ rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -21, y: 32 })
  assert.deepEqual(moved.finish(owner)?.edit, {
    kind: 'transform',
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -21, y: 32 },
  })
})

test('transform preview rejects nonfinite, zero, mirrored or unbounded scales before replacing valid state', () => {
  const gesture = new ProjectMaskTransformGesture(owner, bounds)
  const valid = { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -20, y: 32 }
  for (const change of [
    { x: Number.NaN },
    { y: Number.POSITIVE_INFINITY },
    { scaleX: 0 },
    { scaleY: -1 },
    { scaleX: 10_001 },
    { rotationDegrees: Number.NaN },
  ]) {
    assert.throws(() => gesture.update({ ...valid, ...change }), /invalid/)
    assert.deepEqual(gesture.transform, valid)
  }
  gesture.update({ ...valid, scaleX: 2 })
  assert.equal(gesture.transform.scaleX, 2)
})

test('Fit emits the same captured revision contract and never sends renderer-computed padding or bounds', () => {
  const request = projectMaskFitRequest(owner)
  assert.deepEqual(request, {
    documentId: owner.documentId,
    documentRevision: owner.documentRevision,
    edit: { kind: 'fit-bbox' },
    maskId: owner.maskId,
    maskRevision: owner.maskRevision,
  })
  assert.deepEqual(parseProjectMaskEdit(request.edit), { kind: 'fit-bbox' })
})

test('Konva matrix roundoff retains exact integer quarter-turn geometry without quantizing fractional transforms', () => {
  const quarterTurn = new ProjectMaskTransformGesture(owner, bounds)
  quarterTurn.update({
    rotationDegrees: 90,
    scaleX: 1.000_000_000_000_000_2,
    scaleY: 0.999_999_999_999_999_9,
    x: 116.000_000_000_000_03,
    y: 39.999_999_999_999_99,
  })
  assert.deepEqual(quarterTurn.finish(owner)?.edit, {
    kind: 'transform',
    transform: { rotationDegrees: 90, scaleX: 1, scaleY: 1, x: 116, y: 40 },
  })
  const fractional = new ProjectMaskTransformGesture(owner, bounds)
  fractional.update({ rotationDegrees: 30.5, scaleX: 1.5, scaleY: 0.75, x: 0.5, y: 32.25 })
  assert.deepEqual(fractional.finish(owner)?.edit, {
    kind: 'transform',
    transform: { rotationDegrees: 30.5, scaleX: 1.5, scaleY: 0.75, x: 0.5, y: 32.25 },
  })
})

test('interactive transform end snaps anchor and displayed nonsquare dimensions to pixels while retaining rotation and fresh intent', () => {
  const interactive = {
    rotationDegrees: 90,
    scaleX: 1.499_98,
    scaleY: 1.0833,
    x: 55.996,
    y: 31.996,
  }
  const snapped = snapProjectMaskTransformToPixelGrid(interactive, bounds)
  assert.deepEqual(snapped, {
    rotationDegrees: 90,
    scaleX: 1.5,
    scaleY: 13 / 12,
    x: 56,
    y: 32,
  })
  assert.equal(snapped.scaleX * bounds.width, 60)
  assert.equal(snapped.scaleY * bounds.height, 13)
  assert.equal(interactive.x, 55.996, 'Snapping does not mutate the original preview.')
  assert.deepEqual(bounds, { height: 12, width: 40, x: -20, y: 32 })
  const gesture = new ProjectMaskTransformGesture(owner, bounds)
  gesture.update(snapped)
  assert.deepEqual(gesture.finish(owner), {
    documentId: owner.documentId,
    documentRevision: owner.documentRevision,
    edit: { kind: 'transform', transform: snapped },
    maskId: owner.maskId,
    maskRevision: owner.maskRevision,
  })
  assert.deepEqual(
    snapProjectMaskTransformToPixelGrid(
      { rotationDegrees: -45, scaleX: 0.001, scaleY: 0.002, x: -10.4, y: 3.6 },
      bounds,
    ),
    { rotationDegrees: -45, scaleX: 1 / 40, scaleY: 1 / 12, x: -10, y: 4 },
    'Interactive minification retains a one-pixel dimension and keeps its requested angle.',
  )
})
