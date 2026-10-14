import type { ProjectMaskSettings } from '../../shared/projects/project-mask-settings.js'

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

test('real fitting uses the owned unequal settings, preserves zero and retains outward grid rounding', () => {
  const bounds = { height: 4, width: 6, x: 10, y: 20 }
  assert.deepEqual(fitProjectMaskBbox(bounds, { blur: 7, padding: 18 }), {
    height: 64,
    width: 64,
    x: -16,
    y: -8,
  })
  assert.deepEqual(fitProjectMaskBbox(bounds, { blur: 0, padding: 0 }), {
    height: 8,
    width: 8,
    x: 8,
    y: 16,
  })
  assert.deepEqual(fitProjectMaskBbox(bounds, { blur: 512, padding: 512 }), {
    height: 2056,
    width: 2056,
    x: -1016,
    y: -1008,
  })
  assert.deepEqual(bounds, { height: 4, width: 6, x: 10, y: 20 })
})

test('fitting refuses malformed original settings rather than coercing, dropping keys or falling back', () => {
  const bounds = { height: 4, width: 6, x: 10, y: 20 }
  for (const invalid of [
    null,
    { blur: 16 },
    { blur: -1, padding: 8 },
    { blur: 0.5, padding: 8 },
    { blur: 16, padding: 513 },
    { blur: NaN, padding: 8 },
    { blur: 16, padding: Infinity },
    { blur: '16', padding: 8 },
    { blur: 16, extra: true, padding: 8 },
  ]) {
    assert.throws(() => fitProjectMaskBbox(bounds, invalid as ProjectMaskSettings), {
      code: 'MASK_INPUT_INVALID',
    })
    assert.deepEqual(bounds, { height: 4, width: 6, x: 10, y: 20 })
  }
  assert.deepEqual(fitProjectMaskBbox(bounds, { blur: 16, padding: 8 }), {
    height: 56,
    width: 56,
    x: -16,
    y: -8,
  })
})
