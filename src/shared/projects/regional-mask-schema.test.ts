import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { paintedPatchFixture } from '../../main/projects/test-fixtures/project-mask.js'
import {
  createEmptyProjectDocumentV1,
  type IgsManifestV1,
  type IgsRegionalGuidanceV1,
  parseProjectDocumentV1,
  projectActiveRasterContributions,
  projectAssetReferences,
  projectMaskAssets,
  validateIgsPackageMetadataV1,
} from './project-schema.js'

test('regional owned masks use strict shared geometry while asset collectors include both owners and composition excludes regions', () => {
  const document = createEmptyProjectDocumentV1({ title: 'Regional mask schema' })
  const patch = paintedPatchFixture(document)
  const other = paintedPatchFixture(document)
  assert.ok(patch.mask.asset && other.mask.asset)
  const region: IgsRegionalGuidanceV1 = {
    enabled: false,
    id: other.id,
    locked: false,
    mask: other.mask,
    name: 'Owned region',
    overlayOpacity: 0,
  }
  document.layers = [patch]
  document.regionalGuidance = [region]
  assert.deepEqual(parseProjectDocumentV1(document), document)
  assert.deepEqual(projectMaskAssets(document), [patch.mask.asset, region.mask.asset])
  assert.deepEqual(projectAssetReferences(document), [patch.mask.asset, region.mask.asset])
  assert.deepEqual(projectActiveRasterContributions(document), [])
  const cleared = { ...region, mask: { asset: null, id: region.mask.id, revision: 9 } }
  assert.deepEqual(
    parseProjectDocumentV1({ ...document, regionalGuidance: [cleared] }).regionalGuidance,
    [cleared],
  )
  for (const mask of [
    { ...region.mask, id: patch.mask.id },
    { ...region.mask, revision: 0 },
    { ...region.mask, bounds: { ...other.mask.bounds, x: 0.5 } },
    { ...region.mask, asset: { ...other.mask.asset, path: patch.mask.asset.path } },
    { ...region.mask, bounds: { ...other.mask.bounds, width: 3 } },
    { ...region.mask, asset: { ...other.mask.asset, width: 4097 } },
    { asset: null, id: region.mask.id, revision: -1 },
    { asset: null, bounds: other.mask.bounds, id: region.mask.id, revision: 1 },
  ]) {
    assert.throws(
      () => parseProjectDocumentV1({ ...document, regionalGuidance: [{ ...region, mask }] }),
      { code: 'INVALID_PROJECT' },
    )
  }
  for (const field of [
    { maskImageUrl: 'igs-mask://regional/forged' },
    { boundingBox: document.primaryBbox },
  ]) {
    assert.throws(
      () => parseProjectDocumentV1({ ...document, regionalGuidance: [{ ...region, ...field }] }),
      { code: 'INVALID_PROJECT' },
    )
  }
  assert.throws(
    () => parseProjectDocumentV1({ ...document, regionalGuidance: [{ ...region, id: patch.id }] }),
    { code: 'INVALID_PROJECT' },
  )
})

test('regional package metadata requires exact mask members and rejects unreferenced or mismatched members', () => {
  const document = createEmptyProjectDocumentV1({ title: 'Regional member accounting' })
  const painted = paintedPatchFixture(document)
  assert.ok(painted.mask.asset)
  document.regionalGuidance = [
    {
      enabled: true,
      id: painted.id,
      locked: false,
      mask: painted.mask,
      name: 'Region',
      overlayOpacity: 0.5,
    },
  ]
  const member = painted.mask.asset
  const manifest: IgsManifestV1 = {
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    members: ['project.json', 'preview/thumbnail.webp', 'preview/merged.png']
      .map((path) => ({ bytes: 1, path, sha256: 'a'.repeat(64) }))
      .concat([{ bytes: member.bytes, path: member.path, sha256: member.sha256 }]),
    preview: { rect: null, status: 'empty' },
    schemaVersion: 1,
  }
  assert.deepEqual(validateIgsPackageMetadataV1(manifest, document).document, document)
  const missing = {
    ...manifest,
    members: manifest.members.filter(({ path }) => path !== member.path),
  }
  assert.throws(() => validateIgsPackageMetadataV1(missing, document), { code: 'PACKAGE_MISMATCH' })
  for (const changed of [
    { ...member, bytes: member.bytes + 1 },
    { ...member, sha256: 'b'.repeat(64) },
  ]) {
    assert.throws(
      () =>
        validateIgsPackageMetadataV1(
          {
            ...missing,
            members: [
              ...missing.members,
              { bytes: changed.bytes, path: changed.path, sha256: changed.sha256 },
            ],
          },
          document,
        ),
      { code: 'PACKAGE_MISMATCH' },
    )
  }
  assert.throws(
    () =>
      validateIgsPackageMetadataV1(
        {
          ...manifest,
          members: [
            ...manifest.members,
            {
              bytes: 1,
              path: `assets/masks/${randomUUID()}/${'c'.repeat(64)}.png`,
              sha256: 'c'.repeat(64),
            },
          ],
        },
        document,
      ),
    { code: 'PACKAGE_MISMATCH' },
  )
})
