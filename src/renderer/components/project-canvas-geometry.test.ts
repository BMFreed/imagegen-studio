import type { ProjectRasterLayerView } from '../../shared/api.js'

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  fitCamera,
  fitTargetBounds,
  rasterBounds,
  zoomCameraAt,
} from './project-canvas-geometry.js'

const raster: ProjectRasterLayerView = {
  blendMode: 'normal',
  height: 80,
  id: 'visible',
  imageUrl: 'igs-layer://asset/visible',
  locked: false,
  name: 'Visible raster',
  opacity: 1,
  transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -40, y: 20 },
  visible: true,
  width: 120,
}

test('Fit View uses visible transformed raster bounds, including negative coordinates', () => {
  const hidden: ProjectRasterLayerView = {
    ...raster,
    id: 'hidden',
    transform: { ...raster.transform, x: 2000 },
    visible: false,
  }
  const transparent = { ...hidden, id: 'transparent', opacity: 0, visible: true }
  assert.deepEqual(
    fitTargetBounds([raster, hidden, transparent], { height: 1024, width: 1024, x: 0, y: 0 }),
    {
      bottom: 100,
      left: -40,
      right: 80,
      top: 20,
    },
  )
  assert.deepEqual(
    rasterBounds({
      ...raster,
      transform: { ...raster.transform, rotationDegrees: 90 },
    }),
    {
      bottom: 140,
      left: -120,
      right: -40,
      top: 20,
    },
  )
})

test('Fit View falls back to the project generation area only when no raster is visible', () => {
  assert.deepEqual(
    fitTargetBounds([{ ...raster, visible: false }], { height: 300, width: 400, x: -200, y: 50 }),
    { bottom: 350, left: -200, right: 200, top: 50 },
  )
})

test('fit camera centers content while leaving a viewport margin', () => {
  const camera = fitCamera(
    { bottom: 350, left: -200, right: 200, top: 50 },
    { height: 600, width: 800 },
  )
  assert.equal(camera.scale, 1)
  assert.equal(-200 * camera.scale + camera.x, 200)
  assert.equal(50 * camera.scale + camera.y, 150)
})

test('Fit View still contains the largest allowed raster dimensions', () => {
  const camera = fitCamera(
    { bottom: 32_768, left: 0, right: 32_768, top: 0 },
    { height: 600, width: 800 },
  )
  assert.ok(camera.scale < 0.05)
  assert.ok(camera.x >= 0)
  assert.ok(camera.x + 32_768 * camera.scale <= 800)
  assert.ok(camera.y >= 0)
  assert.ok(camera.y + 32_768 * camera.scale <= 600)
})

test('a short or narrow preview area keeps the focused contribution visible', () => {
  for (const viewport of [
    { height: 120, width: 324 },
    { height: 324, width: 120 },
  ]) {
    const bounds = { bottom: 247, left: 160, right: 289, top: 120 }
    const camera = fitCamera(bounds, viewport)
    const width = (bounds.right - bounds.left) * camera.scale
    const height = (bounds.bottom - bounds.top) * camera.scale
    assert.ok(Math.max(width / viewport.width, height / viewport.height) >= 0.5)
    assert.ok(bounds.left * camera.scale + camera.x >= 0)
    assert.ok(bounds.top * camera.scale + camera.y >= 0)
    assert.ok(bounds.right * camera.scale + camera.x <= viewport.width)
    assert.ok(bounds.bottom * camera.scale + camera.y <= viewport.height)
  }
})

test('wheel zoom keeps the world point under the pointer stationary', () => {
  const start = { scale: 0.5, x: 120, y: -80 }
  const screen = { x: 360, y: 240 }
  const before = { x: (screen.x - start.x) / start.scale, y: (screen.y - start.y) / start.scale }
  const next = zoomCameraAt(start, 1.25, screen.x, screen.y)
  assert.equal((screen.x - next.x) / next.scale, before.x)
  assert.equal((screen.y - next.y) / next.scale, before.y)
})
