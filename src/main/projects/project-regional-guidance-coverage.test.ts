import type { ProjectMaskBitmap } from '../../shared/projects/project-mask.js'
import type { IgsRectV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import test from 'node:test'

import { projectRegionalGuidanceCoverage } from './project-regional-guidance-coverage.js'

test('regional coverage keeps null masks distinct and returns a detached zero-padded target', () => {
  const target = { height: 2, width: 3, x: -4, y: -3 }
  const result = projectRegionalGuidanceCoverage(null, target)
  assert.equal(result.kind, 'empty')
  assert.equal(result.intersection, null)
  assert.deepEqual(result.bounds, target)
  assert.notEqual(result.bounds, target)
  assert.deepEqual([...result.alpha], [0, 0, 0, 0, 0, 0])
})

test('regional coverage mutation boundary: preserves soft alpha at negative target origins', () => {
  const mask = {
    alpha: Uint8Array.from([75, 53, 255, 1, 128, 254]),
    bounds: { height: 2, width: 3, x: -2, y: -1 },
  }
  const result = projectRegionalGuidanceCoverage(mask, { height: 3, width: 4, x: -3, y: -2 })
  assert.equal(result.kind, 'covered')
  assert.deepEqual(result.bounds, { height: 3, width: 4, x: -3, y: -2 })
  assert.deepEqual(result.intersection, { height: 2, width: 3, x: -2, y: -1 })
  assert.deepEqual([...result.alpha], [0, 0, 0, 0, 0, 75, 53, 255, 0, 1, 128, 254])
  assert.deepEqual([...mask.alpha], [75, 53, 255, 1, 128, 254])
})

test('regional coverage mutation control: preserves binary coverage at negative target origins', () => {
  const mask = {
    alpha: Uint8Array.from([255, 0, 255, 0, 255, 0]),
    bounds: { height: 2, width: 3, x: -2, y: -1 },
  }
  const result = projectRegionalGuidanceCoverage(mask, { height: 3, width: 4, x: -3, y: -2 })
  assert.equal(result.kind, 'covered')
  assert.deepEqual(result.intersection, { height: 2, width: 3, x: -2, y: -1 })
  assert.deepEqual([...result.alpha], [0, 0, 0, 0, 0, 255, 0, 255, 0, 0, 255, 0])
  assert.deepEqual([...mask.alpha], [255, 0, 255, 0, 255, 0])
})

test('regional coverage clips asymmetric rows and columns without transposing or resampling', () => {
  const mask = {
    alpha: Uint8Array.from([1, 2, 3, 4, 11, 0, 13, 14, 21, 22, 23, 24]),
    bounds: { height: 3, width: 4, x: -4, y: -3 },
  }
  const clipped = projectRegionalGuidanceCoverage(mask, { height: 3, width: 3, x: -2, y: -2 })
  assert.equal(clipped.kind, 'covered')
  assert.deepEqual(clipped.intersection, { height: 2, width: 2, x: -2, y: -2 })
  assert.deepEqual([...clipped.alpha], [13, 14, 0, 23, 24, 0, 0, 0, 0])
  const interior = projectRegionalGuidanceCoverage(mask, { height: 2, width: 2, x: -3, y: -2 })
  assert.equal(interior.kind, 'covered')
  assert.deepEqual(interior.intersection, { height: 2, width: 2, x: -3, y: -2 })
  assert.deepEqual([...interior.alpha], [0, 13, 22, 23])
})

test('regional coverage places single-pixel intersections at all four target corners', () => {
  const mask = {
    alpha: Uint8Array.from([1, 2, 3, 4, 5, 6]),
    bounds: { height: 2, width: 3, x: 10, y: 20 },
  }
  for (const { alpha, intersection, target } of [
    { alpha: [0, 0, 0, 1], intersection: { x: 10, y: 20 }, target: { x: 9, y: 19 } },
    { alpha: [0, 0, 3, 0], intersection: { x: 12, y: 20 }, target: { x: 12, y: 19 } },
    { alpha: [0, 4, 0, 0], intersection: { x: 10, y: 21 }, target: { x: 9, y: 21 } },
    { alpha: [6, 0, 0, 0], intersection: { x: 12, y: 21 }, target: { x: 12, y: 21 } },
  ]) {
    const result = projectRegionalGuidanceCoverage(mask, { height: 2, width: 2, ...target })
    assert.equal(result.kind, 'covered')
    assert.deepEqual(result.intersection, { height: 1, width: 1, ...intersection })
    assert.deepEqual([...result.alpha], alpha)
  }
})

test('regional coverage distinguishes an intersecting zero-only hole from outside geometry', () => {
  const mask = {
    alpha: Uint8Array.from([1, 2, 3, 4, 5, 0, 0, 6, 7, 0, 0, 8, 9, 10, 11, 12]),
    bounds: { height: 4, width: 4, x: -3, y: -3 },
  }
  const hole = projectRegionalGuidanceCoverage(mask, { height: 2, width: 2, x: -2, y: -2 })
  assert.equal(hole.kind, 'intersecting-empty')
  assert.deepEqual(hole.intersection, { height: 2, width: 2, x: -2, y: -2 })
  assert.deepEqual([...hole.alpha], [0, 0, 0, 0])
  const edge = projectRegionalGuidanceCoverage(mask, { height: 2, width: 2, x: -3, y: -2 })
  assert.equal(edge.kind, 'covered')
  assert.deepEqual([...edge.alpha], [5, 0, 7, 0])
})

test('regional coverage treats edge and corner contact as outside without filling the target', () => {
  const mask = {
    alpha: Uint8Array.from([75, 53, 255, 1, 128, 254]),
    bounds: { height: 2, width: 3, x: -2, y: -1 },
  }
  for (const origin of [
    { x: -5, y: -1 },
    { x: 1, y: -1 },
    { x: -2, y: -3 },
    { x: -2, y: 1 },
    { x: 1, y: 1 },
    { x: -100, y: 99 },
  ]) {
    const target = { height: 2, width: 3, ...origin }
    const result = projectRegionalGuidanceCoverage(mask, target)
    assert.equal(result.kind, 'outside')
    assert.equal(result.intersection, null)
    assert.deepEqual(result.bounds, target)
    assert.deepEqual([...result.alpha], [0, 0, 0, 0, 0, 0])
  }
})

test('regional coverage owns output bytes and both rectangles independently of its inputs', () => {
  const mask = {
    alpha: Uint8Array.from([75, 53, 255, 0]),
    bounds: { height: 2, width: 2, x: -1, y: -1 },
  }
  const target = { ...mask.bounds }
  const result = projectRegionalGuidanceCoverage(mask, target)
  assert.ok(result.intersection)
  assert.notEqual(result.alpha.buffer, mask.alpha.buffer)
  assert.notEqual(result.bounds, target)
  assert.notEqual(result.intersection, mask.bounds)
  assert.notEqual(result.intersection, result.bounds)
  result.alpha.fill(0)
  result.bounds.x = 99
  result.intersection.y = 99
  assert.deepEqual([...mask.alpha], [75, 53, 255, 0])
  assert.deepEqual(mask.bounds, { height: 2, width: 2, x: -1, y: -1 })
  assert.deepEqual(target, { height: 2, width: 2, x: -1, y: -1 })
  const detached = projectRegionalGuidanceCoverage(mask, target)
  mask.alpha.fill(255)
  mask.bounds.x = 88
  target.y = 77
  assert.deepEqual([...detached.alpha], [75, 53, 255, 0])
  assert.deepEqual(detached.bounds, { height: 2, width: 2, x: -1, y: -1 })
  assert.deepEqual(detached.intersection, { height: 2, width: 2, x: -1, y: -1 })
})

test('regional coverage reads only a supplied alpha view and supports frozen metadata', () => {
  const storage = Uint8Array.from([99, 75, 53, 255, 99])
  const mask = Object.freeze({
    alpha: storage.subarray(1, 4),
    bounds: Object.freeze({ height: 1, width: 3, x: -2, y: 0 }),
  })
  const result = projectRegionalGuidanceCoverage(
    mask,
    Object.freeze({ height: 1, width: 5, x: -3, y: 0 }),
  )
  assert.equal(result.kind, 'covered')
  assert.deepEqual([...result.alpha], [0, 75, 53, 255, 0])
  assert.deepEqual([...storage], [99, 75, 53, 255, 99])
})

test('regional coverage refuses malformed alpha shape and noncanonical empty or loose masks', () => {
  for (const alpha of [
    undefined,
    null,
    [255, 255, 255, 255],
    Uint16Array.from([255, 255, 255, 255]),
    new Uint8ClampedArray([255, 255, 255, 255]),
    Uint8Array.from([255]),
    Uint8Array.from([255, 255, 255, 255, 255]),
    Uint8Array.from([0, 0, 0, 0]),
    Uint8Array.from([255, 0, 0, 0]),
    Uint8Array.from([0, 0, 255, 255]),
    Uint8Array.from([0, 255, 0, 255]),
    Uint8Array.from([255, 0, 255, 0]),
  ]) {
    const mask = { alpha, bounds: { height: 2, width: 2, x: 0, y: 0 } } as ProjectMaskBitmap
    assert.throws(
      () => projectRegionalGuidanceCoverage(mask, { height: 1, width: 1, x: 99, y: 99 }),
      { code: 'MASK_IMAGE_INVALID' },
    )
  }
  for (const mask of [undefined, [], 0, {}, { bounds: null }, { bounds: [] }]) {
    assert.throws(
      () =>
        projectRegionalGuidanceCoverage(mask as unknown as ProjectMaskBitmap, {
          height: 1,
          width: 1,
          x: 0,
          y: 0,
        }),
      { code: 'MASK_IMAGE_INVALID' },
    )
  }
})

test('regional coverage validates complete owned mask bounds before reading alpha even outside', () => {
  for (const bounds of [
    { height: 1, width: 0, x: 0, y: 0 },
    { height: -1, width: 1, x: 0, y: 0 },
    { height: 1, width: 1.5, x: 0, y: 0 },
    { height: 1, width: 4097, x: 0, y: 0 },
    { height: 977, width: 4096, x: 0, y: 0 },
    { height: 1, width: 1, x: 0.5, y: 0 },
    { height: 1, width: 1, x: 0, y: NaN },
    { height: 1, width: 1, x: Infinity, y: 0 },
    { height: 1, width: 1, x: -2_147_483_648, y: 0 },
    { height: 1, width: 1, x: 2_147_483_647, y: 0 },
    { height: 1, width: 1, x: 0, y: 2_147_483_647 },
  ]) {
    const mask = {
      get alpha(): Uint8Array {
        throw new Error('Invalid owned geometry must refuse before reading alpha.')
      },
      bounds,
    }
    assert.throws(
      () => projectRegionalGuidanceCoverage(mask, { height: 1, width: 1, x: 99, y: 99 }),
      { code: 'MASK_LIMIT' },
    )
  }
})

test('regional coverage refuses invalid or oversized targets before reading the owned mask', () => {
  const mask = {
    get alpha(): Uint8Array {
      throw new Error('Invalid targets must refuse before reading alpha.')
    },
    get bounds(): IgsRectV1 {
      throw new Error('Invalid targets must refuse before reading owned bounds.')
    },
  }
  for (const change of [
    { width: 0 },
    { height: -1 },
    { width: 1.5 },
    { height: NaN },
    { width: Infinity },
    { width: 2049 },
    { height: 2049 },
    { height: 2048, width: 2048 },
    { height: 2000, width: 2001 },
    { x: 0.5 },
    { y: Infinity },
    { x: 2_147_483_648 },
    { y: -2_147_483_648 },
    { x: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    assert.throws(
      () => projectRegionalGuidanceCoverage(mask, { height: 1, width: 1, x: 0, y: 0, ...change }),
      { code: 'MASK_LIMIT' },
    )
  }
  for (const target of [null, undefined, [], 0]) {
    assert.throws(() => projectRegionalGuidanceCoverage(mask, target as unknown as IgsRectV1), {
      code: 'MASK_INPUT_INVALID',
    })
  }
})

test('regional coverage accepts exact compositor target limits and bounded extreme origins', () => {
  for (const target of [
    { height: 1, width: 2048, x: -2_147_483_647, y: 0 },
    { height: 2048, width: 1, x: 0, y: 2_147_483_647 },
    { height: 2000, width: 2000, x: 0, y: 0 },
    { height: 1, width: 1, x: 2_147_483_647, y: -2_147_483_647 },
  ]) {
    const result = projectRegionalGuidanceCoverage(null, target)
    assert.equal(result.kind, 'empty')
    assert.deepEqual(result.bounds, target)
    assert.equal(result.alpha.length, target.width * target.height)
    assert.equal(
      result.alpha.some((value) => value !== 0),
      false,
    )
  }
  const mask = {
    alpha: Uint8Array.from([75, 53]),
    bounds: { height: 1, width: 2, x: 2_147_483_645, y: -2_147_483_647 },
  }
  const result = projectRegionalGuidanceCoverage(mask, {
    height: 1,
    width: 3,
    x: 2_147_483_645,
    y: -2_147_483_647,
  })
  assert.equal(result.kind, 'covered')
  assert.deepEqual([...result.alpha], [75, 53, 0])
})

test('regional coverage permits owned mask dimension and area limits independently of target size', () => {
  const wide = {
    alpha: new Uint8Array(4096).fill(255),
    bounds: { height: 1, width: 4096, x: -4096, y: 0 },
  }
  wide.alpha.set([75, 53], 4094)
  const clipped = projectRegionalGuidanceCoverage(wide, { height: 1, width: 2, x: -2, y: 0 })
  assert.equal(clipped.kind, 'covered')
  assert.deepEqual([...clipped.alpha], [75, 53])
  const maximum = {
    alpha: new Uint8Array(4_000_000).fill(255),
    bounds: { height: 2000, width: 2000, x: -2000, y: -2000 },
  }
  const corner = projectRegionalGuidanceCoverage(maximum, { height: 1, width: 1, x: -1, y: -1 })
  assert.equal(corner.kind, 'covered')
  assert.deepEqual([...corner.alpha], [255])
})
