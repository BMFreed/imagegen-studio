import {
  createEmptyProjectDocumentV1,
  parseProjectDocumentV1,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { saveIgsPackage } from './igs-package.js'
import {
  parseProjectLayerImageUrl,
  projectLayerImageUrl,
  resolveProjectLayerAsset,
  streamSavedProjectLayer,
  streamStagedProjectLayer,
} from './project-layer-resource.js'
import { literalSmartPatchColorPng } from './test-fixtures/smart-patch-input-material.js'
import { smartPatchVariantMetadataFixture } from './test-fixtures/smart-patch-variant.js'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGO06bnDwMDAxMDAwMDAAAATOgGonVuaBAAAAABJRU5ErkJggg==',
  'base64',
)
const webp = Buffer.from(
  'UklGRjoAAABXRUJQVlA4IC4AAADwAQCdASoCAAIAAUAmJaACdLoB+AAETAAA/q4X/0mzxNnibPkkf/OwbEu14AAA',
  'base64',
)

function storedPatchPixels() {
  const base = createEmptyProjectDocumentV1({ title: 'Portable Patch pixels' })
  const ownerId = randomUUID()
  const alpha = Uint8Array.from({ length: 35 }, (_, index) => (index === 17 ? 64 : 0))
  const images = [
    literalSmartPatchColorPng(7, 5, Array.from(alpha, (value) => [32, 64, 96, value]).flat(), 4),
    literalSmartPatchColorPng(7, 5, Array.from(alpha, (value) => [96, 64, 32, value]).flat(), 4),
  ]
  const variants = images.map((bytes, index) => {
    const variant = smartPatchVariantMetadataFixture('illustrious')
    variant.name = `Frozen variant ${index + 1}`
    variant.asset.bytes = bytes.length
    variant.asset.sha256 = createHash('sha256').update(bytes).digest('hex')
    const source = variant.generationProvenance.layerSourceContext
    source.layerId = ownerId
    source.sourceDocumentId = base.documentId
    const output = variant.generationProvenance.executionResultContext.output
    output.byteSize = bytes.length
    output.sha256 = variant.asset.sha256
    output.contributionAlpha8.sha256 = createHash('sha256').update(alpha).digest('hex')
    return variant
  })
  const active = variants[0]
  const inactive = variants[1]
  const project = parseProjectDocumentV1({
    ...base,
    layers: [
      {
        activeRasterSubLayerId: active.id,
        blendMode: 'normal',
        boundingBox: { height: 128, width: 128, x: 500, y: -500 },
        generationDraft: base.generationDraft,
        id: ownerId,
        internalResolution: { height: 64, width: 64 },
        kind: 'smart-patch',
        locked: false,
        mask: { asset: null, id: randomUUID(), revision: 0 },
        name: 'Original Patch owner',
        opacity: 1,
        rasterSubLayers: variants,
        visible: true,
      },
    ],
  })
  return { active, images, inactive, ownerId, project }
}

test('Patch image capabilities expose only current active pixels under the exact parent owner', () => {
  const { active, inactive, ownerId, project } = storedPatchPixels()
  const projectId = `project-v1-${'a'.repeat(64)}`
  const request = parseProjectLayerImageUrl(
    projectLayerImageUrl(projectId, project.documentRevision, ownerId, active.asset.sha256),
  )
  assert.ok(request)
  assert.deepEqual(resolveProjectLayerAsset(project, request), active.asset)
  for (const wrong of [
    { ...request, assetSha256: inactive.asset.sha256 },
    { ...request, documentRevision: randomUUID() },
  ]) {
    assert.equal(resolveProjectLayerAsset(project, wrong), null)
  }
  const edited = structuredClone(project)
  const patch = edited.layers[0]
  assert.equal(patch.kind, 'smart-patch')
  if (patch.kind !== 'smart-patch') {
    throw new Error('The literal owner must remain a Smart Patch.')
  }
  patch.boundingBox.x += 32
  patch.mask.revision += 1
  assert.deepEqual(resolveProjectLayerAsset(edited, request), active.asset)
  patch.activeRasterSubLayerId = inactive.id
  assert.equal(resolveProjectLayerAsset(edited, request), null)
  assert.deepEqual(
    resolveProjectLayerAsset(edited, { ...request, assetSha256: inactive.asset.sha256 }),
    inactive.asset,
  )
})

test('exact variant capabilities expose inactive hidden/locked pixels without changing the active parent contract', () => {
  const { active, inactive, ownerId, project } = storedPatchPixels()
  const patch = project.layers[0]
  assert.ok(patch.kind === 'smart-patch')
  patch.locked = true
  patch.visible = false
  const before = structuredClone(project)
  const tabId = `project-v1-${'a'.repeat(64)}`
  for (const variant of [active, inactive]) {
    const url = projectLayerImageUrl(
      tabId,
      project.documentRevision,
      variant.id,
      variant.asset.sha256,
    )
    const request = parseProjectLayerImageUrl(url)
    assert.ok(request)
    assert.deepEqual(resolveProjectLayerAsset(project, request), variant.asset)
    assert.equal(parseProjectLayerImageUrl(url.replace(variant.id, ownerId)), null)
    assert.equal(
      resolveProjectLayerAsset(project, { ...request, assetSha256: 'f'.repeat(64) }),
      null,
    )
  }
  assert.deepEqual(project, before)
  const inactiveRequest = parseProjectLayerImageUrl(
    projectLayerImageUrl(tabId, project.documentRevision, inactive.id, inactive.asset.sha256),
  )!
  patch.rasterSubLayers = [active]
  assert.equal(resolveProjectLayerAsset(project, inactiveRequest), null)
  assert.equal(resolveProjectLayerAsset(project, { ...inactiveRequest, layerId: ownerId }), null)
})

test('variant capabilities preserve uppercase portable UUIDs without relaxing hash or MAC case', () => {
  const { inactive, project } = storedPatchPixels()
  const patch = project.layers[0]
  assert.ok(patch.kind === 'smart-patch')
  const uppercaseId = 'ABCDEFAB-1234-4ABC-8DEF-123456ABCDEF'
  const variant = patch.rasterSubLayers.find(({ id }) => id === inactive.id)!
  variant.id = uppercaseId
  variant.asset.path = `assets/layers/${uppercaseId}.png`
  const document = parseProjectDocumentV1({
    ...project,
    documentRevision: 'ABCDEFAB-5678-4ABC-8DEF-123456ABCDEF',
  })
  const url = projectLayerImageUrl(
    `project-v1-${'a'.repeat(64)}`,
    document.documentRevision,
    uppercaseId,
    variant.asset.sha256,
  )
  const request = parseProjectLayerImageUrl(url)
  assert.ok(request)
  assert.deepEqual(resolveProjectLayerAsset(document, request), variant.asset)
  assert.equal(parseProjectLayerImageUrl(url.replace(uppercaseId, uppercaseId.toLowerCase())), null)
  assert.equal(
    parseProjectLayerImageUrl(
      url.replace(variant.asset.sha256, variant.asset.sha256.toUpperCase()),
    ),
    null,
  )
  const macStart = url.lastIndexOf('/') + 1
  assert.equal(
    parseProjectLayerImageUrl(
      `${url.slice(0, macStart)}${url.slice(macStart, -4).toUpperCase()}.img`,
    ),
    null,
  )
})

test('saved Patch assets remain streamable after an inactive saved variant is selected in the open document', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-patch-layer-resource-'))
  try {
    const { active, images, inactive, ownerId, project } = storedPatchPixels()
    const packagePath = path.join(directory, 'patch.igs')
    await saveIgsPackage(packagePath, {
      assets: {
        [active.asset.path]: { bytes: images[0] },
        [inactive.asset.path]: { bytes: images[1] },
      },
      preview: { merged: png, rect: active.bbox, status: 'unavailable', thumbnail: webp },
      project,
    })
    const edited = structuredClone(project)
    const patch = edited.layers[0]
    assert.equal(patch.kind, 'smart-patch')
    if (patch.kind !== 'smart-patch') {
      throw new Error('The literal owner must remain a Smart Patch.')
    }
    patch.activeRasterSubLayerId = inactive.id
    const member = resolveProjectLayerAsset(edited, {
      assetSha256: inactive.asset.sha256,
      documentRevision: edited.documentRevision,
      layerId: ownerId,
      tabId: `project-v1-${'a'.repeat(64)}`,
    })
    assert.deepEqual(member, inactive.asset)
    assert.ok(member)
    const response = await streamSavedProjectLayer(
      packagePath,
      member,
      path.join(directory, 'scratch'),
    )
    assert.equal(response.status, 200)
    assert.equal(Buffer.from(await response.arrayBuffer()).equals(images[1]), true)
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})

test('layer URL requires an untampered process capability and an open matching revision', () => {
  const base = createEmptyProjectDocumentV1({ title: 'Layer preview' })
  const layerId = randomUUID()
  const sha256 = createHash('sha256').update(png).digest('hex')
  const asset = {
    bytes: png.length,
    height: 2,
    path: `assets/layers/${layerId}.png`,
    sha256,
    width: 2,
  }
  const document = {
    ...base,
    layers: [
      {
        asset,
        blendMode: 'normal' as const,
        id: layerId,
        kind: 'raster' as const,
        locked: false,
        name: 'Base',
        opacity: 1,
        transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
        visible: true,
      },
    ],
  }
  const projectId = `project-v1-${'a'.repeat(64)}`
  const url = projectLayerImageUrl(projectId, base.documentRevision, layerId, sha256)
  const request = parseProjectLayerImageUrl(url)
  assert.ok(request)
  assert.deepEqual(resolveProjectLayerAsset(document, request), asset)
  const lastMacDigit = url.at(-5)
  const forged = `${url.slice(0, -5)}${lastMacDigit === '0' ? '1' : '0'}.img`
  assert.equal(parseProjectLayerImageUrl(forged), null)
  assert.equal(parseProjectLayerImageUrl(`${url}?file=/etc/passwd`), null)
  assert.equal(
    resolveProjectLayerAsset({ ...document, documentRevision: randomUUID() }, request),
    null,
  )
  assert.equal(resolveProjectLayerAsset({ ...document, layers: [] }, request), null)
})

test('layer response streams exact verified pixels from a saved .igs member', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-layer-resource-'))
  try {
    const base = createEmptyProjectDocumentV1({ title: 'Saved pixels' })
    const layerId = randomUUID()
    const member = {
      bytes: png.length,
      height: 2,
      path: `assets/layers/${layerId}.png`,
      sha256: createHash('sha256').update(png).digest('hex'),
      width: 2,
    }
    const project = {
      ...base,
      layers: [
        {
          asset: member,
          blendMode: 'normal' as const,
          id: layerId,
          kind: 'raster' as const,
          locked: false,
          name: 'Base',
          opacity: 1,
          transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -3, y: 4 },
          visible: true,
        },
      ],
    }
    const packagePath = path.join(directory, 'source.igs')
    await saveIgsPackage(packagePath, {
      assets: { [member.path]: { bytes: png } },
      preview: {
        merged: png,
        rect: { height: 2, width: 2, x: -3, y: 4 },
        status: 'rendered',
        thumbnail: webp,
      },
      project,
    })
    const response = await streamSavedProjectLayer(
      packagePath,
      member,
      path.join(directory, 'scratch'),
    )
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'image/png')
    assert.equal(response.headers.get('access-control-allow-origin'), '*')
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png)
    const absent = await streamSavedProjectLayer(
      packagePath,
      { ...member, sha256: '0'.repeat(64) },
      path.join(directory, 'scratch'),
    )
    assert.equal(absent.status, 404)

    const webpMember = {
      ...member,
      bytes: webp.length,
      path: `assets/layers/${layerId}.webp`,
      sha256: createHash('sha256').update(webp).digest('hex'),
    }
    const webpPath = path.join(directory, 'webp.igs')
    await saveIgsPackage(webpPath, {
      assets: { [webpMember.path]: { bytes: webp } },
      preview: {
        merged: png,
        rect: { height: 2, width: 2, x: -3, y: 4 },
        status: 'rendered',
        thumbnail: webp,
      },
      project: {
        ...project,
        layers: [{ ...project.layers[0], asset: webpMember }],
      },
    })
    const webpResponse = await streamSavedProjectLayer(
      webpPath,
      webpMember,
      path.join(directory, 'scratch'),
    )
    assert.equal(webpResponse.headers.get('content-type'), 'image/webp')
    assert.deepEqual(Buffer.from(await webpResponse.arrayBuffer()), webp)
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})

test('unsaved layer response verifies coordinator-owned staging bytes before display', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-staged-layer-'))
  try {
    const layerId = randomUUID()
    const member = {
      bytes: png.length,
      height: 2,
      path: `assets/layers/${layerId}.png`,
      sha256: createHash('sha256').update(png).digest('hex'),
      width: 2,
    }
    const sourcePath = path.join(directory, 'normalized.png')
    await writeFile(sourcePath, png)
    const response = await streamStagedProjectLayer(
      { sourcePath },
      member,
      path.join(directory, 'scratch'),
    )
    assert.equal(response.status, 200)
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png)
    await writeFile(sourcePath, Buffer.alloc(png.length))
    await assert.rejects(
      streamStagedProjectLayer({ sourcePath }, member, path.join(directory, 'scratch')),
      /integrity verification/,
    )
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})
