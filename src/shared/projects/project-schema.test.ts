import assert from 'node:assert/strict'
import test from 'node:test'

import type { IgsManifestV1, IgsProjectDocumentV1 } from './project-schema.js'

import {
  createEmptyProjectDocumentV1,
  IGS_MIMETYPE,
  IGS_REQUIRED_MEMBER_PATHS,
  IgsSchemaError,
  isIgsMemberPathV1,
  parseIgsManifestV1,
  parseProjectDocumentV1,
  validateIgsPackageMetadataV1,
} from './project-schema.js'

const DOCUMENT_ID = 'f1099bf4-05ea-44d8-b5de-6884ece7ba45'
const REVISION_ID = '6ea21a66-41e5-43ee-80e2-e9837b7c0eb8'
const LAYER_ID = 'b8468727-804a-4522-a3e7-c5145967e43f'
const SHA256 = 'a'.repeat(64)
const SECOND_SHA256 = 'b'.repeat(64)
const ASSET_PATH = `assets/layers/${LAYER_ID}.png`

function emptyDocument(): IgsProjectDocumentV1 {
  return createEmptyProjectDocumentV1({
    documentId: DOCUMENT_ID,
    documentRevision: REVISION_ID,
    title: 'A portable project',
  })
}

function emptyManifest(): IgsManifestV1 {
  return {
    documentId: DOCUMENT_ID,
    documentRevision: REVISION_ID,
    members: IGS_REQUIRED_MEMBER_PATHS.map((path) => ({ bytes: 128, path, sha256: SHA256 })),
    preview: { rect: null, status: 'empty' },
    schemaVersion: 1,
  }
}

function exactResource(kind: 'checkpoint' | 'embedding' | 'lora' | 'vae') {
  return {
    baseModelFamily: 'illustrious' as const,
    civitaiFileId: 93,
    civitaiModelId: 91,
    civitaiVersionId: 92,
    displayName: `${kind} resource`,
    fileSha256: SHA256,
    kind,
    localModelId: 'local-model-1',
    localVersionId: 'local-version-1',
    predictionType: 'epsilon' as const,
    versionName: 'v1',
  }
}

function assertSchemaCode(code: IgsSchemaError['code']): (error: unknown) => boolean {
  return (error) => error instanceof IgsSchemaError && error.code === code
}

test('new v1 document has infinite-coordinate bbox and nullable generation resources', () => {
  assert.equal(IGS_MIMETYPE, 'application/vnd.imagegen-studio.project+zip')
  const document = emptyDocument()
  assert.deepEqual(document.primaryBbox, { height: 1024, width: 1024, x: 0, y: 0 })
  assert.equal(document.generationDraft.model, null)
  assert.equal(document.generationDraft.vae, null)
  assert.equal(document.lastActualSeedSnapshot, null)
  assert.equal(document.colorSpace, 'srgb')
  assert.deepEqual(document.layers, [])
  assert.equal('canvas' in document, false)

  const moved = { ...document, primaryBbox: { height: 1152, width: 768, x: -20_000, y: 15_000 } }
  assert.deepEqual(parseProjectDocumentV1(moved).primaryBbox, moved.primaryBbox)
  assert.deepEqual(validateIgsPackageMetadataV1(emptyManifest(), document).document, document)
})

test('exact resource refs, plain prompts, embedding sidecars and typed advanced fields survive parse', () => {
  const document = emptyDocument()
  document.generationDraft.model = exactResource('checkpoint')
  document.generationDraft.vae = exactResource('vae')
  document.generationDraft.loras = [
    { enabled: true, resource: exactResource('lora'), weight: 0.75 },
  ]
  document.generationDraft.positivePrompt = {
    embeddingRefs: [{ resource: exactResource('embedding'), token: '<style>' }],
    text: 'portrait, <style>',
  }
  document.generationDraft.cfgRescale = 0.5
  document.generationDraft.vaePrecision = 'FP16'
  document.generationDraft.clipSkip = 2
  document.lastActualSeedSnapshot = 4_294_967_295

  assert.deepEqual(parseProjectDocumentV1(document), document)
})

test('v1 document rejects finite-canvas mock fields, malformed kinds and invalid seed', () => {
  const withCanvas = { ...emptyDocument(), canvas: { height: 1024, width: 1024 } }
  assert.throws(() => parseProjectDocumentV1(withCanvas), assertSchemaCode('INVALID_PROJECT'))

  const wrongKind = emptyDocument()
  wrongKind.generationDraft.model = exactResource('lora')
  assert.throws(() => parseProjectDocumentV1(wrongKind), assertSchemaCode('INVALID_PROJECT'))

  const invalidSeed = { ...emptyDocument(), lastActualSeedSnapshot: 4_294_967_296 }
  assert.throws(() => parseProjectDocumentV1(invalidSeed), assertSchemaCode('INVALID_PROJECT'))
  assert.throws(
    () => parseProjectDocumentV1({ ...emptyDocument(), colorSpace: 'display-p3' }),
    assertSchemaCode('INVALID_PROJECT'),
  )
  assert.throws(
    () => parseProjectDocumentV1({ ...emptyDocument(), title: '   ' }),
    assertSchemaCode('INVALID_PROJECT'),
  )
})

test('manifest rejects missing, duplicate, dangerous and future-schema members', () => {
  assert.throws(
    () => parseIgsManifestV1({ ...emptyManifest(), schemaVersion: 2 }),
    assertSchemaCode('UNSUPPORTED_SCHEMA'),
  )
  assert.throws(
    () => parseIgsManifestV1({ ...emptyManifest(), schemaVersion: '2' }),
    assertSchemaCode('INVALID_MANIFEST'),
  )
  assert.throws(
    () => parseIgsManifestV1({ ...emptyManifest(), members: emptyManifest().members.slice(1) }),
    assertSchemaCode('INVALID_MANIFEST'),
  )
  assert.throws(
    () =>
      parseIgsManifestV1({
        ...emptyManifest(),
        members: [...emptyManifest().members, emptyManifest().members[0]],
      }),
    assertSchemaCode('INVALID_MANIFEST'),
  )
  for (const path of ['../project.json', '/tmp/project.json', String.raw`assets\layers\evil.png`]) {
    assert.equal(isIgsMemberPathV1(path), false)
    assert.throws(
      () =>
        parseIgsManifestV1({ ...emptyManifest(), members: [{ bytes: 1, path, sha256: SHA256 }] }),
      assertSchemaCode('INVALID_MANIFEST'),
    )
  }
})

test('preview state requires a visible-content rect only for rendered or unavailable previews', () => {
  const renderedWithoutRect = {
    ...emptyManifest(),
    preview: { rect: null, status: 'rendered' },
  }
  const emptyWithRect = {
    ...emptyManifest(),
    preview: { rect: { height: 1, width: 1, x: 0, y: 0 }, status: 'empty' },
  }
  assert.throws(() => parseIgsManifestV1(renderedWithoutRect), assertSchemaCode('INVALID_MANIFEST'))
  assert.throws(() => parseIgsManifestV1(emptyWithRect), assertSchemaCode('INVALID_MANIFEST'))
  const unavailable = {
    ...emptyManifest(),
    preview: { rect: { height: 64, width: 32, x: -10, y: 20 }, status: 'unavailable' },
  }
  assert.equal(parseIgsManifestV1(unavailable).preview.status, 'unavailable')
  const wideWorldRect = {
    ...emptyManifest(),
    preview: {
      rect: { height: 2, width: 1_000_002, x: -500_000, y: 0 },
      status: 'rendered',
    },
  }
  assert.deepEqual(parseIgsManifestV1(wideWorldRect).preview.rect, wideWorldRect.preview.rect)
  assert.throws(
    () =>
      parseIgsManifestV1({
        ...wideWorldRect,
        preview: {
          ...wideWorldRect.preview,
          rect: { ...wideWorldRect.preview.rect, width: 4_400_000_001 },
        },
      }),
    assertSchemaCode('INVALID_MANIFEST'),
  )
  assert.throws(
    () => validateIgsPackageMetadataV1(unavailable, emptyDocument()),
    assertSchemaCode('PACKAGE_MISMATCH'),
  )
})

test('manifest and document must agree on IDs, revision, and every raster asset', () => {
  const document = emptyDocument()
  document.layers.push({
    asset: { bytes: 1024, height: 128, path: ASSET_PATH, sha256: SECOND_SHA256, width: 64 },
    blendMode: 'normal',
    id: LAYER_ID,
    kind: 'raster',
    locked: false,
    name: 'Foreground',
    opacity: 1,
    transform: { rotationDegrees: 15, scaleX: 1.25, scaleY: 0.75, x: -14, y: 21 },
    visible: true,
  })
  const manifest = emptyManifest()
  assert.throws(
    () => validateIgsPackageMetadataV1(manifest, document),
    assertSchemaCode('PACKAGE_MISMATCH'),
  )
  manifest.members.push({ bytes: 1024, path: ASSET_PATH, sha256: SECOND_SHA256 })
  assert.equal(validateIgsPackageMetadataV1(manifest, document).document.layers.length, 1)
  assert.throws(
    () =>
      validateIgsPackageMetadataV1(
        { ...manifest, documentRevision: crypto.randomUUID() },
        document,
      ),
    assertSchemaCode('PACKAGE_MISMATCH'),
  )
  assert.throws(
    () =>
      validateIgsPackageMetadataV1(
        {
          ...manifest,
          members: manifest.members.map((entry) =>
            entry.path === ASSET_PATH ? { ...entry, sha256: SHA256 } : entry,
          ),
        },
        document,
      ),
    assertSchemaCode('PACKAGE_MISMATCH'),
  )

  const invalidTransform = structuredClone(document)
  invalidTransform.layers[0].transform.scaleX = 0
  assert.throws(() => parseProjectDocumentV1(invalidTransform), assertSchemaCode('INVALID_PROJECT'))
  invalidTransform.layers[0].transform.scaleX = 1
  invalidTransform.layers[0].transform.rotationDegrees = 361
  assert.throws(() => parseProjectDocumentV1(invalidTransform), assertSchemaCode('INVALID_PROJECT'))

  const profileSha = 'c'.repeat(64)
  const profilePath = `assets/profiles/${profileSha}.icc`
  document.layers[0].sourceIccProfile = {
    bytes: 128,
    path: profilePath,
    sha256: profileSha,
  }
  manifest.members.push({ bytes: 128, path: profilePath, sha256: profileSha })
  assert.deepEqual(validateIgsPackageMetadataV1(manifest, document).document, document)
  manifest.members.pop()
  assert.throws(
    () => validateIgsPackageMetadataV1(manifest, document),
    assertSchemaCode('PACKAGE_MISMATCH'),
  )
  manifest.members.push({ bytes: 128, path: profilePath, sha256: profileSha })
  document.layers[0].sourceIccProfile = {
    bytes: 128,
    path: profilePath,
    sha256: SECOND_SHA256,
  }
  assert.throws(() => parseProjectDocumentV1(document), assertSchemaCode('INVALID_PROJECT'))
  delete document.layers[0].sourceIccProfile
  assert.throws(
    () => validateIgsPackageMetadataV1(manifest, document),
    assertSchemaCode('PACKAGE_MISMATCH'),
  )
})
