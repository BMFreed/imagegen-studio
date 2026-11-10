import {
  createEmptyProjectDocumentV1,
  type IgsRegionalGuidanceReferenceImageV1,
} from '../../shared/projects/project-schema.js'
import { REGIONAL_REFERENCE_INFERENCE_PROFILE } from '../../shared/projects/regional-reference-inference.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import test from 'node:test'

import type { VerifiedRegionalReferenceResources } from '../runtime/inference-auxiliary-resources.js'
import type { CapturedRegionalGuidanceInput } from './project-regional-guidance-input.js'

import { prepareCurrentCanvasRegionalRecipe } from './project-current-canvas-regional-recipe.js'
import { captureCurrentCanvasRegionalReferences } from './project-current-canvas-regional-references.js'
import { projectRegionalGuidanceCoverage } from './project-regional-guidance-coverage.js'
import { literalSmartPatchColorPng } from './test-fixtures/smart-patch-input-material.js'

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const resources: VerifiedRegionalReferenceResources = {
  adapter: {
    byteSize: 12,
    managedPath: '/managed/adapter.safetensors',
    role: 'regional-reference-adapter',
    sha256: 'a'.repeat(64),
  },
  visionConfig: {
    byteSize: 12,
    managedPath: '/managed/vision/config.json',
    role: 'regional-reference-vision-config',
    sha256: 'b'.repeat(64),
  },
  visionModel: {
    byteSize: 12,
    managedPath: '/managed/vision/model.safetensors',
    role: 'regional-reference-vision-model',
    sha256: 'c'.repeat(64),
  },
}

async function fixture() {
  const document = createEmptyProjectDocumentV1({ title: 'Captured references' })
  document.generationDraft.model = {
    baseModelFamily: 'illustrious',
    civitaiFileId: null,
    civitaiModelId: null,
    civitaiVersionId: null,
    displayName: 'Model',
    fileSha256: 'd'.repeat(64),
    kind: 'checkpoint',
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: 'epsilon',
    versionName: 'Version',
  }
  document.primaryBbox = { height: 64, width: 64, x: 0, y: 0 }
  const png = literalSmartPatchColorPng(2, 1, [12, 35, 90, 220, 180, 60], 3)
  const makeReference = (): IgsRegionalGuidanceReferenceImageV1 => {
    const id = randomUUID()
    return {
      asset: {
        bytes: png.length,
        height: 1,
        path: `assets/regional-references/${id}/${digest(png)}.png`,
        sha256: digest(png),
        width: 2,
      },
      id,
      name: 'Original image',
      sourceFormat: 'PNG',
      thumbnail: {
        bytes: 128,
        height: 1,
        path: `assets/regional-references/${id}/${'e'.repeat(64)}.webp`,
        sha256: 'e'.repeat(64),
        width: 2,
      },
    }
  }
  document.regionalGuidance = [0, 1].map(() => ({
    enabled: true,
    id: randomUUID(),
    locked: false,
    mask: { asset: null, id: randomUUID(), revision: 0 },
    name: 'Image-only owner',
    overlayOpacity: 0,
    referenceImages: [makeReference()],
  }))
  const reads: string[] = []
  const capture: CapturedRegionalGuidanceInput = {
    assets: document.regionalGuidance.flatMap((r) =>
      r.referenceImages!.map((ref) => ({
        filePath: '/leased/original.png',
        member: structuredClone(ref.asset),
        referenceId: ref.id,
        regionId: r.id,
        role: 'image' as const,
      })),
    ),
    projectMask: async (_id, target) => projectRegionalGuidanceCoverage(null, target),
    readAsset: async (p) => {
      reads.push(p)
      return png
    },
    snapshot: {
      documentId: document.documentId,
      documentRevision: document.documentRevision,
      generationDraft: document.generationDraft,
      lastActualSeedSnapshot: document.lastActualSeedSnapshot,
      primaryBbox: document.primaryBbox,
      regionalGuidance: document.regionalGuidance,
    },
    stagingRoot: '/leased',
  }
  const recipe = await prepareCurrentCanvasRegionalRecipe({
    capture,
    job: {
      bbox: document.primaryBbox,
      documentId: document.documentId,
      documentRevision: document.documentRevision,
      family: 'illustrious',
      item: {
        iteration: 0,
        promptPairIndex: 0,
        prompts: { negative: '', positive: '' },
        seed: 123,
      },
    },
  })
  return { capture, document, png, reads, recipe }
}

test('capture forwards ordered original canonical PNGs with distinct owners and exact zero masks', async () => {
  const f = await fixture()
  const result = await captureCurrentCanvasRegionalReferences({ ...f, resources })
  assert.equal(result.profile, REGIONAL_REFERENCE_INFERENCE_PROFILE)
  assert.equal(result.images.length, 2)
  assert.deepEqual(
    f.reads,
    f.document.regionalGuidance!.map((r) => r.referenceImages![0].asset.path),
  )
  for (const [index, entry] of result.images.entries()) {
    const owner = f.document.regionalGuidance![index]
    assert.equal(entry.regionId, owner.id)
    assert.equal(entry.referenceId, owner.referenceImages![0].id)
    assert.deepEqual(Buffer.from(entry.image.bytes), f.png)
    assert.equal(entry.image.width, 2)
    assert.equal(entry.image.height, 1)
    assert.ok(f.recipe.regions[index].coverage.alpha.every((v) => v === 0))
    assert.equal(f.recipe.regions[index].positive, null)
  }
  assert.notEqual(result.images[0].referenceId, result.images[1].referenceId)
  assert.deepEqual(result.resources.adapter, {
    byteSize: resources.adapter.byteSize,
    path: resources.adapter.managedPath,
    sha256: resources.adapter.sha256,
  })
  f.png[0] = 0
  assert.notEqual(result.images[0].image.bytes[0], 0, 'The operational bytes are owned copies.')
})

test('capture rejects recipe/region/ref/image ownership and changed bytes before returning material', async () => {
  for (const mutation of ['region', 'reference', 'member', 'bytes', 'extra'] as const) {
    const f = await fixture()
    if (mutation === 'region') {
      f.recipe.regions[0].regionId = randomUUID()
    }
    if (mutation === 'reference') {
      f.recipe.regions[0].referenceImages![0].id = randomUUID()
    }
    if (mutation === 'member') {
      f.capture.assets[0].referenceId = randomUUID()
    }
    if (mutation === 'bytes') {
      f.capture.readAsset = async () => Buffer.alloc(f.png.length)
    }
    if (mutation === 'extra') {
      f.capture.assets.push(structuredClone(f.capture.assets[0]))
    }
    await assert.rejects(
      captureCurrentCanvasRegionalReferences({ ...f, resources }),
      /owners|owned|changed/,
    )
  }
})

test('capture freezes all original descriptors and image order before asynchronous asset reads', async () => {
  const f = await fixture()
  let release!: () => void
  let enter!: () => void
  const started = new Promise<void>((r) => {
    enter = r
  })
  const hold = new Promise<void>((r) => {
    release = r
  })
  f.capture.readAsset = async (p) => {
    f.reads.push(p)
    enter()
    await hold
    return f.png
  }
  const expected = f.document.regionalGuidance!.map((r) => ({
    id: r.id,
    path: r.referenceImages![0].asset.path,
    ref: r.referenceImages![0].id,
  }))
  const pending = captureCurrentCanvasRegionalReferences({ ...f, resources })
  await started
  f.document.regionalGuidance!.reverse()
  f.recipe.regions.reverse()
  f.document.regionalGuidance![0].referenceImages = []
  release()
  const result = await pending
  assert.deepEqual(
    result.images.map((r) => ({ id: r.regionId, ref: r.referenceId })),
    expected.map(({ id, ref }) => ({ id, ref })),
  )
  assert.deepEqual(
    f.reads,
    expected.map(({ path }) => path),
  )
})
