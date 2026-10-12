/**
 * Actual exported qualification guard, using schema-validated captured native layer entities. Data
 * is metadata-only; no installed inference/persistence/reopen proof is claimed here.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  createEmptyProjectDocumentV1,
  parseProjectDocumentV1,
} from '../src/shared/projects/project-schema.ts'
import { assertBatchCapImportedSource } from './generation-batch-cap-profile.mjs'

const captured = JSON.parse(
  readFileSync(new URL('./fixtures/image-cap-source-layer-metadata.json', import.meta.url), 'utf8'),
)
function rawProject(layer) {
  const project = createEmptyProjectDocumentV1({
    documentId: 'f1099bf4-05ea-44d8-b5de-6884ece7ba45',
    documentRevision: '6ea21a66-41e5-43ee-80e2-e9837b7c0eb8',
    primaryBbox: { x: 0, y: 0, width: 256, height: 256 },
    title: 'Captured source guard metadata',
  })
  project.layers = [structuredClone(layer)]
  return parseProjectDocumentV1(project)
}
function input(layer) {
  // Production emits presentation fields without generationProvenance for all native views.
  return {
    before: {
      effects: { portable: { project: rawProject(layer) }, tab: { layers: [{ id: layer.id }] } },
    },
    precondition: { layerId: layer.id, layer: structuredClone(layer) },
  }
}

test('actual captured imported raw raster is accepted without inventing provenance on its view', () => {
  const { before, precondition } = input(captured.sourceLayer)
  assert.equal(Object.hasOwn(before.effects.tab.layers[0], 'generationProvenance'), false)
  assert.doesNotThrow(() => assertBatchCapImportedSource(before, precondition))
})

test('schema-valid generated raw raster is refused even with a matching provenance-free native view', () => {
  const { before, precondition } = input(captured.generatedLayer)
  assert.equal(Object.hasOwn(before.effects.tab.layers[0], 'generationProvenance'), false)
  assert.throws(
    () => assertBatchCapImportedSource(before, precondition),
    /must have no generation provenance/,
  )
})

test('native view alone cannot replace the real saved Project source entity', () => {
  const { before, precondition } = input(captured.sourceLayer)
  delete before.effects.portable
  assert.throws(
    () => assertBatchCapImportedSource(before, precondition),
    /actual saved Project layer list is required/,
  )
})

for (const [label, mutate] of [
  [
    'missing-source',
    (p) => {
      p.layers = []
    },
  ],
  [
    'wrong-source-id',
    (p) => {
      p.layers[0].id = 'b8468727-804a-4522-a3e7-c5145967e43f'
    },
  ],
  [
    'changed-asset-digest',
    (p) => {
      p.layers[0].asset.sha256 = 'b'.repeat(64)
    },
  ],
  [
    'changed-transform',
    (p) => {
      p.layers[0].transform.x = 1
    },
  ],
  [
    'hidden-source',
    (p) => {
      p.layers[0].visible = false
    },
  ],
  [
    'unexpected-second-layer',
    (p) => {
      p.layers.push(structuredClone(captured.generatedLayer))
    },
  ],
])
  test(`actual guard rejects ${label} in a schema-valid saved Project while the native source ID stays unchanged`, () => {
    const { before, precondition } = input(captured.sourceLayer)
    mutate(before.effects.portable.project)
    // Reject invalid fixtures separately; the guard must catch a valid entity violating its contract.
    before.effects.portable.project = parseProjectDocumentV1(before.effects.portable.project)
    assert.throws(() => assertBatchCapImportedSource(before, precondition))
  })
