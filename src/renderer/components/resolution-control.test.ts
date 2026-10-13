import assert from 'node:assert/strict'
import test from 'node:test'

import { inverseRatio, resizeDimension, sizeForAspectRatio } from './resolution-control'

const limits = { max: 16_384, min: 1, step: 8 }

test('ratio presets preserve approximate area and fit both sides together at the size limit', () => {
  const wide = sizeForAspectRatio(16 / 9, 1024 * 1024, limits)
  assert.ok(Math.abs(wide.width / wide.height - 16 / 9) < 0.02)
  assert.ok(Math.abs(wide.width * wide.height - 1024 * 1024) < 16_384)
  const capped = sizeForAspectRatio(8, 16_384 * 16_384, limits)
  assert.deepEqual(capped, { height: 2048, width: 16_384 })
  assert.equal(inverseRatio('16:9'), '9:16')
})

test('locked width and height edits preserve the ratio, including at the opposite side limit', () => {
  const aspect = { id: '4:5' as const, locked: true, value: 4 / 5 }
  const original = { height: 1280, width: 1024 }
  assert.deepEqual(resizeDimension(original, 'width', 640, aspect, limits), {
    height: 800,
    width: 640,
  })
  const capped = resizeDimension(original, 'width', limits.max, aspect, limits)
  assert.equal(capped.height, limits.max)
  assert.ok(Math.abs(capped.width! / capped.height - 4 / 5) < 0.0001)
  assert.deepEqual(resizeDimension(original, 'height', 800, aspect, limits), {
    height: 800,
    width: 640,
  })
  // Neighbor: without the lock, the unedited dimension is retained exactly.
  assert.deepEqual(resizeDimension(original, 'width', 640, { ...aspect, locked: false }, limits), {
    height: 1280,
    width: 640,
  })
  assert.deepEqual(original, { height: 1280, width: 1024 })
})

test('a cleared dimension remains unset so the owning form can reject an incomplete size', () => {
  assert.deepEqual(
    resizeDimension(
      { height: 512, width: 512 },
      'width',
      null,
      { id: '1:1', locked: true, value: 1 },
      limits,
    ),
    { height: 512, width: null },
  )
})
