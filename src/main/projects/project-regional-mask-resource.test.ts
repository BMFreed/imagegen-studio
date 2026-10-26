import {
  createEmptyProjectDocumentV1,
  type IgsProjectDocumentV1,
  type IgsRegionalGuidanceV1,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  parseProjectMaskImageUrl,
  projectMaskImageUrl,
  resolveProjectMaskAsset,
  streamSavedProjectMask,
} from './project-mask-resource.js'
import {
  parseProjectRegionalMaskImageUrl,
  projectRegionalMaskImageUrl,
  resolveProjectRegionalMaskAsset,
  streamSavedProjectRegionalMask,
  streamStagedProjectRegionalMask,
} from './project-regional-mask-resource.js'
import { ProjectSession } from './project-session.js'
import { fixtureMaskPng, paintedPatchFixture } from './test-fixtures/project-mask.js'

function paintedRegion(document: IgsProjectDocumentV1): IgsRegionalGuidanceV1 {
  const patch = paintedPatchFixture(document)
  return {
    enabled: false,
    id: patch.id,
    locked: true,
    mask: patch.mask,
    name: 'Inspectable regional mask',
    overlayOpacity: 0,
  }
}

test('regional capability signs its namespace and complete tuple without Smart or Raster fallback', () => {
  const document = createEmptyProjectDocumentV1({ title: 'Regional resource' })
  const region = paintedRegion(document)
  const patch = paintedPatchFixture(document)
  assert.ok(region.mask.asset && patch.mask.asset)
  document.regionalGuidance = [region]
  document.layers = [patch]
  const request = {
    assetSha256: region.mask.asset.sha256,
    documentRevision: document.documentRevision,
    maskId: region.mask.id,
    maskRevision: region.mask.revision,
    regionId: region.id,
    tabId: `project-v1-${'a'.repeat(64)}`,
  }
  const url = projectRegionalMaskImageUrl(request)
  assert.deepEqual(parseProjectRegionalMaskImageUrl(url), request)
  assert.deepEqual(resolveProjectRegionalMaskAsset(document, request), region.mask.asset)
  for (const changed of [
    { ...request, documentRevision: randomUUID() },
    { ...request, regionId: randomUUID() },
    { ...request, regionId: patch.id },
    { ...request, maskId: randomUUID() },
    { ...request, maskRevision: 2 },
    { ...request, assetSha256: 'b'.repeat(64) },
    { ...request, assetSha256: patch.mask.asset.sha256, maskId: patch.mask.id, regionId: patch.id },
  ]) {
    assert.equal(resolveProjectRegionalMaskAsset(document, changed), null)
    assert.equal(
      parseProjectRegionalMaskImageUrl(
        projectRegionalMaskImageUrl(changed).replace(
          /\/[^/]+\.png$/,
          new URL(url).pathname.slice(new URL(url).pathname.lastIndexOf('/')),
        ),
      ),
      null,
    )
  }
  const smart = projectMaskImageUrl({
    assetSha256: patch.mask.asset.sha256,
    documentRevision: document.documentRevision,
    layerId: patch.id,
    maskId: patch.mask.id,
    maskRevision: patch.mask.revision,
    tabId: request.tabId,
  })
  assert.equal(parseProjectMaskImageUrl(url), null)
  assert.equal(parseProjectRegionalMaskImageUrl(smart), null)
  assert.equal(parseProjectRegionalMaskImageUrl(smart.replace('://asset/', '://regional/')), null)
  assert.equal(parseProjectMaskImageUrl(url.replace('://regional/', '://asset/')), null)
  assert.equal(resolveProjectMaskAsset(document, { ...request, layerId: region.id }), null)
  assert.equal(
    parseProjectRegionalMaskImageUrl(url.replace(request.tabId, `project-v1-${'b'.repeat(64)}`)),
    null,
  )
  for (const malformed of [
    `${url}?path=/outside`,
    `${url}#fragment`,
    url.replace('igs-mask:', 'igs-layer:'),
    url.replace('/1/', '/9007199254740992/'),
  ]) {
    assert.equal(parseProjectRegionalMaskImageUrl(malformed), null)
  }
})

test('regional saved and staged streams return exact verified PNGs and refuse Smart ownership or corruption', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-regional-resource-'))
  try {
    const session = await ProjectSession.create(
      path.join(root, 'Project.igs'),
      'Regional streams',
      {
        placeholdersDir: path.resolve('src/main/projects/placeholders'),
        scratchDir: path.join(root, 'scratch'),
      },
    )
    const region = paintedRegion(session.document)
    const smart = paintedPatchFixture(session.document)
    assert.ok(region.mask.asset && smart.mask.asset)
    const png = fixtureMaskPng()
    session.applyDocument({ ...session.document, layers: [smart], regionalGuidance: [region] })
    await session.save({
      assets: { [region.mask.asset.path]: { bytes: png }, [smart.mask.asset.path]: { bytes: png } },
    })
    for (const response of [
      await streamSavedProjectRegionalMask(session.filePath, region.mask.asset),
      await streamStagedProjectRegionalMask({ bytes: png }, region.mask.asset),
    ]) {
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('content-type'), 'image/png')
      assert.equal(response.headers.get('cache-control'), 'no-store')
      assert.ok(Buffer.from(await response.arrayBuffer()).equals(png))
    }
    assert.equal(
      (await streamSavedProjectRegionalMask(session.filePath, smart.mask.asset)).status,
      404,
    )
    assert.equal((await streamSavedProjectMask(session.filePath, region.mask.asset)).status, 404)
    const corrupt = Buffer.from(png)
    corrupt[0] ^= 1
    await assert.rejects(streamStagedProjectRegionalMask({ bytes: corrupt }, region.mask.asset), {
      code: 'MASK_IMAGE_INVALID',
    })
    assert.equal(
      (
        await streamSavedProjectRegionalMask(session.filePath, {
          ...region.mask.asset,
          sha256: 'b'.repeat(64),
        })
      ).status,
      404,
    )
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})
