import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  isProjectImageExportRect,
  isProjectImageExportRegion,
  isProjectImageExportResult,
} from './project-image-export.js'

test('only the two explicit export scopes are accepted at the IPC boundary', () => {
  for (const value of ['canvas', 'bbox']) {
    assert.equal(isProjectImageExportRegion(value), true)
  }
  for (const value of ['', 'smart-patch', 'selection', {}, null, ['canvas']]) {
    assert.equal(isProjectImageExportRegion(value), false)
  }
})

test('export result exposes a finite PNG basename and world rect without native filesystem paths', () => {
  assert.equal(isProjectImageExportResult({ kind: 'canceled' }), true)
  assert.equal(
    isProjectImageExportResult({
      fileName: 'image.PNG',
      kind: 'exported',
      rect: { height: 4096, width: 4096, x: -3, y: 17 },
    }),
    true,
  )
  for (const value of [
    { fileName: 'ignored.png', kind: 'canceled' },
    { fileName: '/home/image.png', kind: 'exported', rect: { height: 1, width: 1, x: 0, y: 0 } },
    {
      fileName: String.raw`..\image.png`,
      kind: 'exported',
      rect: { height: 1, width: 1, x: 0, y: 0 },
    },
    { fileName: 'image.jpg', kind: 'exported', rect: { height: 1, width: 1, x: 0, y: 0 } },
    { fileName: 'image.png', kind: 'saved', rect: { height: 1, width: 1, x: 0, y: 0 } },
  ]) {
    assert.equal(isProjectImageExportResult(value), false)
  }
})

test('export dimensions remain separate from inference ceilings and fail closed on oversized or noninteger rectangles', () => {
  assert.equal(isProjectImageExportRect({ height: 1, width: 16_384, x: 0, y: 0 }), true)
  assert.equal(isProjectImageExportRect({ height: 8000, width: 8000, x: 0, y: 0 }), true)
  for (const rect of [
    { height: 8001, width: 8000, x: 0, y: 0 },
    { height: 1, width: 16_385, x: 0, y: 0 },
    { height: 0, width: 1, x: 0, y: 0 },
    { height: 1, width: 1, x: 0.5, y: 0 },
    { height: 1, width: 1, x: 2_200_000_000, y: 0 },
    { height: 1, hidden: true, width: 1, x: 0, y: 0 },
  ]) {
    assert.equal(isProjectImageExportRect(rect), false)
  }
})
