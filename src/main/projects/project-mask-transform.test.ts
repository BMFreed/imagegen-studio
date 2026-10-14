import {
  PROJECT_MASK_MAX_COORDINATE,
  type ProjectMaskBitmap,
  type ProjectMaskTransform,
} from '../../shared/projects/project-mask.js'

import assert from 'node:assert/strict'
import test from 'node:test'

import { applyProjectMaskTransform } from './project-mask-transform.js'
import { decodeProjectMaskPng, encodeProjectMaskPng } from './project-mask.js'

const asymmetric = (): ProjectMaskBitmap => ({
  alpha: Uint8Array.from([255, 64, 0, 0, 128, 255]),
  bounds: { height: 2, width: 3, x: -2, y: 5 },
})
const transform = (overrides: Partial<ProjectMaskTransform> = {}) => ({
  kind: 'transform' as const,
  transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -2, y: 5, ...overrides },
})

// Boundary: real Main CPU transform. Oracle: literal asymmetric alpha/bounds, not a second
// transform implementation. Controls: identity/translation versus rotation/scaling. Mutations:
// swap the inverse sign, use source world offset twice, blur unit transforms or drop edge taps.
test('integer translations and full rotations preserve exact coverage and canonical PNG bytes', () => {
  const source = asymmetric()
  const before = [...source.alpha]
  const encoded = encodeProjectMaskPng(source.alpha, 3, 2)
  for (const rotationDegrees of [0, 360, -360]) {
    const identity = applyProjectMaskTransform(source, transform({ rotationDegrees }))
    assert.deepEqual(identity.bounds, { height: 2, width: 3, x: -2, y: 5 })
    assert.deepEqual([...identity.alpha], [255, 64, 0, 0, 128, 255])
    assert.notEqual(identity.alpha, source.alpha)
    assert.ok(encodeProjectMaskPng(identity.alpha, 3, 2).equals(encoded))
  }
  const moved = applyProjectMaskTransform(source, transform({ x: -13, y: -8 }))
  assert.deepEqual(moved.bounds, { height: 2, width: 3, x: -13, y: -8 })
  assert.deepEqual([...moved.alpha], [255, 64, 0, 0, 128, 255])
  assert.ok(encodeProjectMaskPng(moved.alpha, 3, 2).equals(encoded))
  moved.alpha[0] = 1
  assert.deepEqual([...source.alpha], before)
  assert.deepEqual(source.bounds, { height: 2, width: 3, x: -2, y: 5 })
})

test('quarter turns remap asymmetric pixels about the supplied world anchor without filtering', () => {
  const source = asymmetric()
  const clockwise = applyProjectMaskTransform(
    source,
    transform({ rotationDegrees: 90, x: 10, y: 20 }),
  )
  assert.deepEqual(clockwise.bounds, { height: 3, width: 2, x: 8, y: 20 })
  assert.deepEqual([...clockwise.alpha], [0, 255, 128, 64, 255, 0])
  const halfTurn = applyProjectMaskTransform(
    source,
    transform({ rotationDegrees: 180, x: -3, y: 4 }),
  )
  assert.deepEqual(halfTurn.bounds, { height: 2, width: 3, x: -6, y: 2 })
  assert.deepEqual([...halfTurn.alpha], [255, 128, 0, 0, 64, 255])
  for (const rotationDegrees of [270, -90]) {
    const counterclockwise = applyProjectMaskTransform(
      source,
      transform({ rotationDegrees, x: 10, y: 20 }),
    )
    assert.deepEqual(counterclockwise.bounds, { height: 3, width: 2, x: 10, y: 17 })
    assert.deepEqual([...counterclockwise.alpha], [0, 255, 64, 128, 255, 0])
    const png = encodeProjectMaskPng(counterclockwise.alpha, 2, 3)
    assert.deepEqual(
      [...decodeProjectMaskPng(png, { height: 3, width: 2 })],
      [0, 255, 64, 128, 255, 0],
    )
  }
  assert.deepEqual([...source.alpha], [255, 64, 0, 0, 128, 255])
})

test('half-pixel translation retains fractional area with transparent exterior and tight world bounds', () => {
  const source = { alpha: Uint8Array.from([255]), bounds: { height: 1, width: 1, x: 100, y: -90 } }
  const horizontal = applyProjectMaskTransform(source, transform({ x: 0.5, y: 0 }))
  assert.deepEqual(horizontal.bounds, { height: 1, width: 2, x: 0, y: 0 })
  assert.deepEqual([...horizontal.alpha], [128, 128])
  const diagonal = applyProjectMaskTransform(source, transform({ x: -0.5, y: -0.5 }))
  assert.deepEqual(diagonal.bounds, { height: 2, width: 2, x: -1, y: -1 })
  assert.deepEqual([...diagonal.alpha], [64, 64, 64, 64])
  assert.deepEqual([...source.alpha], [255])
})

test('two-times resize uses literal clamped bilinear alpha rather than nearest-neighbor or opaque fill', () => {
  const source = {
    alpha: Uint8Array.from([255, 0, 64, 128]),
    bounds: { height: 2, width: 2, x: 20, y: 30 },
  }
  const resized = applyProjectMaskTransform(
    source,
    transform({ scaleX: 2, scaleY: 2, x: -8, y: 7 }),
  )
  assert.deepEqual(resized.bounds, { height: 4, width: 4, x: -8, y: 7 })
  assert.deepEqual(
    [...resized.alpha],
    [255, 191, 64, 0, 207, 163, 76, 32, 112, 108, 100, 96, 64, 80, 112, 128],
  )
  assert.deepEqual([...source.alpha], [255, 0, 64, 128])
})

test('diagonal rotation samples edges and crops empty rows rather than doubling a one-pixel area', () => {
  const source = { alpha: Uint8Array.from([255]), bounds: { height: 1, width: 1, x: 0, y: 0 } }
  const rotated = applyProjectMaskTransform(source, transform({ rotationDegrees: 45, x: 0, y: 0 }))
  assert.deepEqual(rotated.bounds, { height: 1, width: 2, x: -1, y: 0 })
  assert.deepEqual([...rotated.alpha], [128, 128])
  const repeat = applyProjectMaskTransform(source, transform({ rotationDegrees: 45, x: 0, y: 0 }))
  assert.deepEqual(repeat, rotated)
})

test('nonuniform scale respects separate axes and retains a weak nonzero alpha sample', () => {
  const source = { alpha: Uint8Array.from([17, 255]), bounds: { height: 1, width: 2, x: 0, y: 0 } }
  const resized = applyProjectMaskTransform(
    source,
    transform({ scaleX: 1, scaleY: 2, x: 3, y: -4 }),
  )
  assert.deepEqual(resized.bounds, { height: 2, width: 2, x: 3, y: -4 })
  assert.deepEqual([...resized.alpha], [47, 225, 47, 225])
})

test('empty and subpixel-disappearing transforms refuse without clearing or mutating the old mask', () => {
  assert.throws(() => applyProjectMaskTransform(null, transform()), { code: 'MASK_INPUT_INVALID' })
  const source = { alpha: Uint8Array.from([1]), bounds: { height: 1, width: 1, x: 0, y: 0 } }
  assert.throws(
    () => applyProjectMaskTransform(source, transform({ scaleX: 0.01, scaleY: 0.01, x: 0, y: 0 })),
    { code: 'MASK_INPUT_INVALID' },
  )
  const exact = applyProjectMaskTransform(source, transform({ x: 4, y: -7 }))
  assert.deepEqual([...exact.alpha], [1])
  assert.deepEqual(source, {
    alpha: Uint8Array.from([1]),
    bounds: { height: 1, width: 1, x: 0, y: 0 },
  })
})

test('coordinate and output-dimension ceilings refuse before allocation; adjacent exact moves remain supported', () => {
  const source = asymmetric()
  assert.throws(
    () =>
      applyProjectMaskTransform(source, transform({ x: PROJECT_MASK_MAX_COORDINATE - 2, y: 0 })),
    { code: 'MASK_LIMIT' },
  )
  assert.throws(() => applyProjectMaskTransform(source, transform({ scaleX: 1366, x: 0, y: 0 })), {
    code: 'MASK_LIMIT',
  })
  const neighbor = applyProjectMaskTransform(
    source,
    transform({ x: PROJECT_MASK_MAX_COORDINATE - 3, y: 0 }),
  )
  assert.deepEqual(neighbor.bounds, {
    height: 2,
    width: 3,
    x: PROJECT_MASK_MAX_COORDINATE - 3,
    y: 0,
  })
  assert.deepEqual([...neighbor.alpha], [255, 64, 0, 0, 128, 255])
})

test('resampling work refusal precedes pixel reads even when output dimensions fit the four-million-pixel limit', () => {
  const source = {
    get alpha(): Uint8Array {
      throw new Error('Work preflight must run before reading pixels.')
    },
    bounds: { height: 1000, width: 1000, x: 0, y: 0 },
  }
  assert.throws(
    () => applyProjectMaskTransform(source, transform({ scaleX: 2, scaleY: 2, x: 0, y: 0 })),
    { code: 'MASK_LIMIT' },
  )
  const neighbor = applyProjectMaskTransform(
    asymmetric(),
    transform({ scaleX: 2, scaleY: 2, x: 0, y: 0 }),
  )
  assert.deepEqual(neighbor.bounds, { height: 4, width: 6, x: 0, y: 0 })
})

test('maximum supported alpha bitmap remains usable for byte-exact integer translations', () => {
  const source = {
    alpha: new Uint8Array(4096 * 976).fill(255),
    bounds: { height: 976, width: 4096, x: 0, y: 0 },
  }
  const moved = applyProjectMaskTransform(source, transform({ x: -2, y: 3 }))
  assert.deepEqual(moved.bounds, { height: 976, width: 4096, x: -2, y: 3 })
  assert.equal(moved.alpha.length, 4096 * 976)
  assert.ok(
    Buffer.from(moved.alpha).equals(Buffer.from(source.alpha)),
    'Exact large translation must preserve every alpha byte.',
  )
})

test('invalid source coverage refuses instead of inventing opaque, padded or empty pixels', () => {
  for (const alpha of [
    Uint8Array.from([255]),
    Uint8Array.from([0, 0, 0, 0]),
    Uint8Array.from([255, 0, 0, 0]),
  ]) {
    assert.throws(
      () =>
        applyProjectMaskTransform(
          { alpha, bounds: { height: 2, width: 2, x: 0, y: 0 } },
          transform(),
        ),
      { code: 'MASK_IMAGE_INVALID' },
    )
  }
})
