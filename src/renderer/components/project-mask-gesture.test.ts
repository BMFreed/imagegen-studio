import {
  parseProjectMaskEdit,
  PROJECT_MASK_MAX_POINTS,
} from '../../shared/projects/project-mask.js'

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  type MaskGestureOwner,
  maskWorldPoint,
  ProjectMaskGesture,
  sameMaskGestureOwner,
} from './project-mask-gesture.js'

const owner: MaskGestureOwner = {
  documentId: '30fa722d-f7df-4574-98ca-f3f0c44cad06',
  documentRevision: 'a154f2af-2e1b-4bc5-b745-505ba3dcadf3',
  layerId: '3f774a84-c7e0-4f58-9e22-174cfd79492c',
  maskId: '38bc91c2-c06e-4d63-99b8-d4775733b5ed',
  maskRevision: 3,
  projectKey: 'local-project',
}

test('native client coordinates preserve a literal negative project point across pan and zoom', () => {
  const canvas = { left: 280, top: 110 }
  assert.deepEqual(
    maskWorldPoint({ clientX: 370, clientY: 212 }, canvas, {
      scale: 1,
      x: 130,
      y: 70,
    }),
    { x: -40, y: 32 },
  )
  assert.deepEqual(
    maskWorldPoint({ clientX: 270, clientY: 224 }, canvas, {
      scale: 2,
      x: 70,
      y: 50,
    }),
    { x: -40, y: 32 },
  )
})

test('the actual gesture producer captures its owner and endpoint, emits one schema-valid edit', () => {
  const mutableOwner = { ...owner }
  const gesture = new ProjectMaskGesture(mutableOwner, 'brush', 'subtract', 20)
  mutableOwner.layerId = 'later-selected-layer'
  const point = { x: -40, y: 32 }
  gesture.append(point)
  point.x = 900
  assert.equal(gesture.append({ x: -40, y: 32 }), false)
  gesture.append({ x: -20, y: 60 })
  const completed = gesture.finish({ ...owner })
  assert.deepEqual(completed, {
    documentId: owner.documentId,
    documentRevision: owner.documentRevision,
    edit: {
      diameter: 20,
      kind: 'brush',
      operation: 'add',
      points: [
        { x: -40, y: 32 },
        { x: -20, y: 60 },
      ],
    },
    maskId: owner.maskId,
    maskRevision: 3,
  })
  assert.deepEqual(parseProjectMaskEdit(completed?.edit), completed?.edit)
  assert.equal(
    gesture.finish(owner),
    null,
    'A terminal pointerup cannot submit the same stroke twice.',
  )
})

test('Eraser removes coverage and Polygon uses the operation captured before controls change', () => {
  const eraser = new ProjectMaskGesture(owner, 'eraser', 'add', 20)
  eraser.append({ x: 70, y: 70 })
  assert.deepEqual(eraser.finish(owner)?.edit, {
    diameter: 20,
    kind: 'brush',
    operation: 'subtract',
    points: [{ x: 70, y: 70 }],
  })
  const polygon = new ProjectMaskGesture(owner, 'polygon-lasso', 'subtract', 50)
  for (const point of [
    { x: 40, y: 40 },
    { x: 100, y: 40 },
    { x: 100, y: 100 },
  ]) {
    polygon.append(point)
  }
  assert.deepEqual(parseProjectMaskEdit(polygon.finish(owner)?.edit), {
    kind: 'polygon',
    operation: 'subtract',
    points: [
      { x: 40, y: 40 },
      { x: 100, y: 40 },
      { x: 100, y: 100 },
    ],
  })
})

test('changed owner or baseline refuses the complete gesture instead of retargeting', () => {
  const neighboringChanges: Partial<MaskGestureOwner>[] = [
    { projectKey: 'other-local-project' },
    { documentId: 'other-document' },
    { documentRevision: 'other-revision' },
    { layerId: 'other-patch' },
    { maskId: 'other-mask' },
    { maskRevision: 4 },
    { kind: 'regional-guidance' },
  ]
  for (const change of neighboringChanges) {
    const gesture = new ProjectMaskGesture(owner, 'brush', 'add', 20)
    gesture.append({ x: -40, y: 32 })
    assert.equal(gesture.finish({ ...owner, ...change }), null)
  }
  const valid = new ProjectMaskGesture(owner, 'brush', 'add', 20)
  valid.append({ x: -40, y: 32 })
  assert.notEqual(valid.finish(owner), null)
})

test('regional strokes retain their explicit owner kind and cannot finish as a Smart mask', () => {
  const regionalOwner: MaskGestureOwner = { ...owner, kind: 'regional-guidance' }
  const gesture = new ProjectMaskGesture(regionalOwner, 'eraser', 'add', 20)
  regionalOwner.kind = 'smart-patch'
  gesture.append({ x: -40, y: 32 })
  assert.equal(gesture.owner.kind, 'regional-guidance')
  assert.equal(gesture.finish(regionalOwner), null)

  const original = { ...owner, kind: 'regional-guidance' as const }
  const valid = new ProjectMaskGesture(original, 'brush', 'subtract', 20)
  valid.append({ x: -40, y: 32 })
  assert.deepEqual(valid.finish(original)?.edit, {
    diameter: 20,
    kind: 'brush',
    operation: 'add',
    points: [{ x: -40, y: 32 }],
  })
  assert.equal(sameMaskGestureOwner(owner, { ...owner, kind: 'smart-patch' }), true)
  assert.equal(sameMaskGestureOwner(original, owner), false)
})

test('Escape-style cancellation and incomplete Lasso cannot produce an edit on later pointerup', () => {
  const cancelled = new ProjectMaskGesture(owner, 'brush', 'add', 20)
  cancelled.append({ x: 70, y: 70 })
  cancelled.cancel()
  assert.equal(cancelled.append({ x: 80, y: 80 }), false)
  assert.equal(cancelled.finish(owner), null)
  const short = new ProjectMaskGesture(owner, 'lasso', 'add', 50)
  short.append({ x: 1, y: 1 })
  short.append({ x: 2, y: 2 })
  assert.equal(short.finish(owner), null)
})

test('canonical point ceiling fails visibly without silently dropping the terminal sample', () => {
  const gesture = new ProjectMaskGesture(owner, 'brush', 'add', 20)
  for (let x = 0; x < PROJECT_MASK_MAX_POINTS; x++) {
    gesture.append({ x, y: 0 })
  }
  assert.throws(() => gesture.append({ x: PROJECT_MASK_MAX_POINTS, y: 0 }), /too many points/)
  gesture.cancel()
  assert.equal(gesture.finish(owner), null)
})
