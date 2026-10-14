import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertProjectMaskBounds,
  assertProjectMaskDimensions,
  parseProjectMaskEdit,
  PROJECT_MASK_MAX_POINTS,
  PROJECT_MASK_MAX_TRANSFORM_SCALE,
} from './project-mask.js'

test('mask edit validation admits float world points and rejects malformed/foreign tool settings', () => {
  assert.deepEqual(
    parseProjectMaskEdit({
      diameter: 50,
      kind: 'brush',
      operation: 'add',
      points: [{ x: -1.25, y: 2.75 }],
    }),
    { diameter: 50, kind: 'brush', operation: 'add', points: [{ x: -1.25, y: 2.75 }] },
  )
  assert.deepEqual(parseProjectMaskEdit({ kind: 'clear' }), { kind: 'clear' })
  for (const invalid of [
    { kind: 'clear', points: [] },
    { diameter: 0, kind: 'brush', operation: 'add', points: [{ x: 0, y: 0 }] },
    { diameter: 513, kind: 'brush', operation: 'add', points: [{ x: 0, y: 0 }] },
    { diameter: 50, kind: 'brush', operation: 'replace', points: [{ x: 0, y: 0 }] },
    { diameter: 50, kind: 'brush', operation: 'add', points: [{ x: NaN, y: 0 }] },
    { diameter: 50, kind: 'brush', operation: 'add', points: [{ x: 0, y: Infinity }] },
    { diameter: 50, kind: 'brush', operation: 'add', points: [{ x: 2_147_483_648, y: 0 }] },
    { diameter: 50, kind: 'brush', operation: 'add', points: [{ pressure: 1, x: 0, y: 0 }] },
    {
      kind: 'polygon',
      operation: 'add',
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
      ],
    },
  ]) {
    assert.throws(() => parseProjectMaskEdit(invalid), { code: 'MASK_INPUT_INVALID' })
  }
})

test('mask transform and fit shapes are strict, finite and separate from authoring options', () => {
  const transform = { rotationDegrees: -90, scaleX: 1.25, scaleY: 2, x: -8.5, y: 12.25 }
  assert.deepEqual(parseProjectMaskEdit({ kind: 'transform', transform }), {
    kind: 'transform',
    transform,
  })
  assert.deepEqual(parseProjectMaskEdit({ kind: 'fit-bbox' }), { kind: 'fit-bbox' })
  assert.equal(
    parseProjectMaskEdit({
      kind: 'transform',
      transform: { ...transform, scaleX: PROJECT_MASK_MAX_TRANSFORM_SCALE },
    }).kind,
    'transform',
  )
  for (const invalid of [
    { kind: 'fit-bbox', transform },
    { kind: 'fit-bbox', padding: 24 },
    { kind: 'transform', operation: 'add', transform },
    { kind: 'transform', transform: { ...transform, skew: 0 } },
    { kind: 'transform', transform: { ...transform, scaleX: 0 } },
    { kind: 'transform', transform: { ...transform, scaleY: -1 } },
    {
      kind: 'transform',
      transform: { ...transform, scaleX: PROJECT_MASK_MAX_TRANSFORM_SCALE + 1 },
    },
    { kind: 'transform', transform: { ...transform, scaleX: Infinity } },
    { kind: 'transform', transform: { ...transform, scaleY: NaN } },
    { kind: 'transform', transform: { ...transform, rotationDegrees: 361 } },
    { kind: 'transform', transform: { ...transform, rotationDegrees: -361 } },
    { kind: 'transform', transform: { ...transform, rotationDegrees: Infinity } },
    { kind: 'transform', transform: { ...transform, x: 2_147_483_648 } },
    { kind: 'transform', transform: { ...transform, y: NaN } },
  ]) {
    assert.throws(() => parseProjectMaskEdit(invalid), { code: 'MASK_INPUT_INVALID' })
  }
})

test('excessive point counts refuse before visiting point properties', () => {
  const points = Array.from({ length: PROJECT_MASK_MAX_POINTS + 1 }, () => ({
    get x(): number {
      throw new Error('Point validation must not visit an already excessive array.')
    },
    y: 0,
  }))
  assert.throws(
    () => parseProjectMaskEdit({ diameter: 1, kind: 'brush', operation: 'add', points }),
    { code: 'MASK_LIMIT' },
  )
  assert.equal(
    parseProjectMaskEdit({
      diameter: 1,
      kind: 'brush',
      operation: 'add',
      points: Array.from({ length: PROJECT_MASK_MAX_POINTS }, () => ({ x: 0, y: 0 })),
    }).kind,
    'brush',
  )
})

test('mask safety ceilings distinguish pixel area, dimension and complete world extents', () => {
  assert.doesNotThrow(() => assertProjectMaskDimensions(4096, 976))
  for (const [width, height] of [
    [4097, 1],
    [4096, 977],
    [0, 1],
    [1.5, 2],
  ]) {
    assert.throws(() => assertProjectMaskDimensions(width, height), { code: 'MASK_LIMIT' })
  }
  assert.doesNotThrow(() => assertProjectMaskBounds({ height: 2, width: 2, x: -8, y: 2 }))
  assert.throws(() => assertProjectMaskBounds({ height: 1, width: 1, x: 2_147_483_647, y: 0 }), {
    code: 'MASK_LIMIT',
  })
})
