import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import {
  createEmptyProjectDocumentV1,
  type IgsRegionalGuidanceReferenceImageV1,
  type IgsRegionalGuidanceV1,
  isIgsMemberPathV1,
  parseProjectDocumentV1,
  projectAssetReferences,
  projectMaskAssets,
  projectOwnedIds,
  projectRasterAssets,
  validateIgsPackageMetadataV1,
} from './project-schema.js'
import { isProjectRegionalGuidanceReferenceImageChange } from './regional-guidance.js'

function reference(): IgsRegionalGuidanceReferenceImageV1 {
  const id = randomUUID()
  return {
    asset: {
      bytes: 1000,
      height: 128,
      path: `assets/regional-references/${id}/${'a'.repeat(64)}.png`,
      sha256: 'a'.repeat(64),
      width: 256,
    },
    id,
    name: 'Source.png',
    sourceFormat: 'PNG',
    sourceIccProfile: {
      bytes: 128,
      path: `assets/profiles/${'c'.repeat(64)}.icc`,
      sha256: 'c'.repeat(64),
    },
    thumbnail: {
      bytes: 200,
      height: 64,
      path: `assets/regional-references/${id}/${'b'.repeat(64)}.webp`,
      sha256: 'b'.repeat(64),
      width: 128,
    },
  }
}
function region(): IgsRegionalGuidanceV1 {
  return {
    enabled: true,
    id: randomUUID(),
    locked: false,
    mask: { asset: null, id: randomUUID(), revision: 0 },
    name: 'Region',
    overlayOpacity: 0,
  }
}

test('regional reference schema preserves legacy absence and separates all assets from raster and mask collectors', () => {
  const document = createEmptyProjectDocumentV1({ title: 'Portable references' })
  assert.equal(Object.hasOwn(parseProjectDocumentV1(document), 'regionalGuidance'), false)
  const owner = region()
  document.regionalGuidance = [owner]
  assert.equal(
    Object.hasOwn(parseProjectDocumentV1(document).regionalGuidance![0], 'referenceImages'),
    false,
  )
  const ref = reference()
  owner.referenceImages = [ref]
  assert.deepEqual(parseProjectDocumentV1(document), document)
  assert.deepEqual(projectAssetReferences(document), [
    ref.asset,
    ref.thumbnail,
    ref.sourceIccProfile,
  ])
  assert.deepEqual(projectRasterAssets(document), [])
  assert.deepEqual(projectMaskAssets(document), [])
  assert.deepEqual(projectOwnedIds(document), [owner.id, owner.mask.id, ref.id])
  for (const member of projectAssetReferences(document)) {
    assert.equal(isIgsMemberPathV1(member.path), true)
  }
})

test('regional references reject empty arrays, crossed owners, forged roles, runtime URLs, limits and global ID collisions', () => {
  const mutations: ((r: IgsRegionalGuidanceV1) => void)[] = [
    (r) => {
      r.referenceImages = []
    },
    (r) => {
      r.referenceImages![0].asset.path = `assets/layers/${randomUUID()}.png`
    },
    (r) => {
      r.referenceImages![0].thumbnail.path = r.referenceImages![0].asset.path
    },
    (r) => {
      r.referenceImages![0].id = randomUUID()
    },
    (r) => {
      r.referenceImages![0].id = r.mask.id
    },
    (r) => {
      r.referenceImages!.push(structuredClone(r.referenceImages![0]))
    },
    (r) => {
      r.referenceImages![0].asset.width = 16_385
    },
    (r) => {
      r.referenceImages![0].asset.width = 16_384
      r.referenceImages![0].asset.height = 4096
    },
    (r) => {
      r.referenceImages![0].asset.bytes = 512 * 1024 * 1024 + 1
    },
    (r) => {
      r.referenceImages![0].thumbnail.bytes = 128_001
    },
    (r) => {
      r.referenceImages![0].thumbnail.width = 129
    },
    (r) => {
      r.referenceImages![0].sourceIccProfile!.sha256 = 'd'.repeat(64)
    },
    (r) => {
      Reflect.set(r.referenceImages![0], 'thumbnailUrl', 'igs-layer://forged')
    },
    (r) => {
      Reflect.set(r.referenceImages![0], 'weight', 1)
    },
    (r) => {
      Reflect.set(r.referenceImages![0], 'sourceFormat', 'SVG')
    },
  ]
  for (const mutate of mutations) {
    const document = createEmptyProjectDocumentV1({ title: 'Reject malformed' })
    const owner = region()
    owner.referenceImages = [reference()]
    document.regionalGuidance = [owner]
    mutate(owner)
    assert.throws(() => parseProjectDocumentV1(document), { code: 'INVALID_PROJECT' })
  }
})

test('regional reference package metadata requires every exact role and rejects unreferenced owned images', () => {
  const document = createEmptyProjectDocumentV1({ title: 'Package role accounting' })
  const ref = reference()
  document.regionalGuidance = [{ ...region(), referenceImages: [ref] }]
  const required = ['project.json', 'preview/thumbnail.webp', 'preview/merged.png'].map((path) => ({
    bytes: 1,
    path,
    sha256: 'e'.repeat(64),
  }))
  const manifest = {
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    members: [
      ...required,
      ...projectAssetReferences(document).map(({ bytes, path, sha256 }) => ({
        bytes,
        path,
        sha256,
      })),
    ],
    preview: { rect: null, status: 'empty' },
    schemaVersion: 1,
  }
  assert.deepEqual(validateIgsPackageMetadataV1(manifest, document).document, document)
  for (const missing of [ref.asset.path, ref.thumbnail.path, ref.sourceIccProfile!.path]) {
    assert.throws(() =>
      validateIgsPackageMetadataV1(
        { ...manifest, members: manifest.members.filter(({ path }) => path !== missing) },
        document,
      ),
    )
  }
  const foreign = reference().asset
  assert.throws(() =>
    validateIgsPackageMetadataV1(
      { ...manifest, members: [...manifest.members, foreign] },
      document,
    ),
  )
})

test('reference commands accept only exact remove and bounded move values', () => {
  const referenceId = randomUUID()
  for (const value of [
    { kind: 'remove', referenceId },
    { kind: 'move', referenceId, targetIndex: 0 },
  ]) {
    assert.equal(isProjectRegionalGuidanceReferenceImageChange(value), true)
  }
  for (const value of [
    null,
    { kind: 'remove', path: '/outside', referenceId },
    { kind: 'move', referenceId, targetIndex: -1 },
    { kind: 'move', referenceId, targetIndex: 0.5 },
    { kind: 'move', referenceId, targetIndex: 10_000 },
    { kind: 'move', referenceId },
    { kind: 'remove', referenceId: 'bad' },
  ]) {
    assert.equal(isProjectRegionalGuidanceReferenceImageChange(value), false)
  }
})
