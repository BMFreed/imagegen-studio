import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'

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

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGO06bnDwMDAxMDAwMDAAAATOgGonVuaBAAAAABJRU5ErkJggg==',
  'base64',
)
const webp = Buffer.from(
  'UklGRjoAAABXRUJQVlA4IC4AAADwAQCdASoCAAIAAUAmJaACdLoB+AAETAAA/q4X/0mzxNnibPkkf/OwbEu14AAA',
  'base64',
)

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
