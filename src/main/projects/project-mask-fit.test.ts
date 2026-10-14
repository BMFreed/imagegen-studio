import assert from 'node:assert/strict'
import test from 'node:test'

import { fitProjectMaskBbox } from './project-mask-fit.js'

test('real fitting keeps full 24px margin and rounds negative origins outward on grid8', () => {
  assert.deepEqual(fitProjectMaskBbox({ height: 4, width: 6, x: -15, y: 11 }), {
    height: 56,
    width: 56,
    x: -40,
    y: -16,
  })
  assert.deepEqual(fitProjectMaskBbox({ height: 8, width: 16, x: 0, y: 0 }), {
    height: 56,
    width: 64,
    x: -24,
    y: -24,
  })
  assert.deepEqual(fitProjectMaskBbox({ height: 1, width: 1, x: 0, y: 0 }), {
    height: 56,
    width: 56,
    x: -24,
    y: -24,
  })
})

test('fitting refuses coordinate overflow without clipping or mutating its valid neighboring bounds', () => {
  const bounds = { height: 1, width: 1, x: -2_147_483_647, y: 0 }
  const old = { ...bounds }
  assert.throws(() => fitProjectMaskBbox(bounds), { code: 'MASK_LIMIT' })
  assert.deepEqual(bounds, old)
  assert.deepEqual(fitProjectMaskBbox({ ...bounds, x: -2_147_483_600 }), {
    height: 56,
    width: 56,
    x: -2_147_483_624,
    y: -24,
  })
})
