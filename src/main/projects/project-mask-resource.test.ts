import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'

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
  streamStagedProjectMask,
} from './project-mask-resource.js'
import { ProjectSession } from './project-session.js'
import { fixtureMaskPng, paintedPatchFixture } from './test-fixtures/project-mask.js'

test('mask resource capability authenticates exact document, layer, mask and revision ownership', () => {
  const document = createEmptyProjectDocumentV1({ title: 'Mask resource' })
  const patch = paintedPatchFixture(document)
  assert.ok(patch.mask.asset)
  document.layers = [patch]
  const request = {
    assetSha256: patch.mask.asset.sha256,
    documentRevision: document.documentRevision,
    layerId: patch.id,
    maskId: patch.mask.id,
    maskRevision: patch.mask.revision,
    tabId: `project-v1-${'a'.repeat(64)}`,
  }
  const url = projectMaskImageUrl(request)
  assert.deepEqual(parseProjectMaskImageUrl(url), request)
  assert.deepEqual(resolveProjectMaskAsset(document, request), patch.mask.asset)
  for (const changed of [
    { ...request, documentRevision: randomUUID() },
    { ...request, layerId: randomUUID() },
    { ...request, maskId: randomUUID() },
    { ...request, maskRevision: 2 },
    { ...request, assetSha256: 'b'.repeat(64) },
  ]) {
    assert.equal(resolveProjectMaskAsset(document, changed), null)
  }
  assert.equal(parseProjectMaskImageUrl(url.replace(patch.mask.id, randomUUID())), null)
  assert.equal(parseProjectMaskImageUrl(url.replace('/1/', '/2/')), null)
  assert.equal(parseProjectMaskImageUrl(`${url}?path=/outside/image.png`), null)
  assert.equal(parseProjectMaskImageUrl(url.replace('igs-mask:', 'igs-layer:')), null)
})

test('actual saved and staged mask resource responses return verified PNG bytes; corruption refuses', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-mask-resource-'))
  try {
    const roots = {
      placeholdersDir: path.resolve('src/main/projects/placeholders'),
      scratchDir: path.join(root, 'scratch'),
    }
    const session = await ProjectSession.create(
      path.join(root, 'Project.igs'),
      'Mask resource',
      roots,
    )
    const png = fixtureMaskPng()
    const patch = paintedPatchFixture(session.document, png)
    assert.ok(patch.mask.asset)
    const asset = patch.mask.asset
    session.applyDocument({ ...session.document, layers: [patch] })
    await session.save({ assets: { [asset.path]: { bytes: png } } })
    const saved = await streamSavedProjectMask(session.filePath, asset)
    assert.equal(saved.status, 200)
    assert.equal(saved.headers.get('content-type'), 'image/png')
    assert.equal(saved.headers.get('cache-control'), 'no-store')
    assert.deepEqual(Buffer.from(await saved.arrayBuffer()), png)
    const staged = await streamStagedProjectMask({ bytes: png }, asset)
    assert.deepEqual(Buffer.from(await staged.arrayBuffer()), png)
    const corrupt = Buffer.from(png)
    corrupt[0] ^= 1
    await assert.rejects(streamStagedProjectMask({ bytes: corrupt }, asset), {
      code: 'MASK_IMAGE_INVALID',
    })
    assert.equal(
      (await streamSavedProjectMask(session.filePath, { ...asset, sha256: 'b'.repeat(64) })).status,
      404,
    )
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})
