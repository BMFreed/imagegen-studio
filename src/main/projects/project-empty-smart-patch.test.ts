import {
  createEmptyProjectDocumentV1,
  type IgsProjectDocumentV1,
  type IgsRasterLayerV1,
  type IgsSmartPatchLayerV1,
  parseProjectDocumentV1,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { readIgsPackage } from './igs-package.js'
import { projectAcceptedResults } from './project-accepted-results.js'
import { resolveProjectLayerAsset } from './project-layer-resource.js'
import { buildProjectPreview } from './project-preview.js'
import { withFrozenRasterComposition } from './project-raster-snapshot.js'
import { ProjectSession } from './project-session.js'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGO06bnDwMDAxMDAwMDAAAATOgGonVuaBAAAAABJRU5ErkJggg==',
  'base64',
)
const sha256 = createHash('sha256').update(png).digest('hex')

function patch(document: IgsProjectDocumentV1): IgsSmartPatchLayerV1 {
  return {
    activeRasterSubLayerId: null,
    blendMode: 'normal',
    boundingBox: { height: 2048, width: 4096, x: -50_000, y: 45_000 },
    generationDraft: structuredClone(document.generationDraft),
    id: randomUUID(),
    internalResolution: { height: 512, width: 1024 },
    kind: 'smart-patch',
    locked: false,
    mask: { asset: null, id: randomUUID(), revision: 0 },
    name: 'Invisible empty patch',
    opacity: 1,
    rasterSubLayers: [],
    visible: true,
  }
}
function raster(): IgsRasterLayerV1 {
  const id = randomUUID()
  return {
    asset: { bytes: png.length, height: 2, path: `assets/layers/${id}.png`, sha256, width: 2 },
    blendMode: 'normal',
    id,
    kind: 'raster',
    locked: false,
    name: 'Visible Raster',
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -9, y: 21 },
    visible: true,
  }
}

test('empty Smart Patch contributes no preview, accepted result or image resource without contacting a worker', async () => {
  const document = createEmptyProjectDocumentV1({ title: 'Empty patch material consumers' })
  const owned = patch(document)
  document.layers.push(owned)
  const parsed = parseProjectDocumentV1(document)
  const original = JSON.stringify(parsed)
  const preview = await buildProjectPreview({
    document: parsed,
    packagePath: '/unused/no-worker.igs',
    pendingSource: () => assert.fail('An empty mask has no asset source.'),
    scratchBasePath: '/unused/no-scratch',
    worker: { composePreview: async () => assert.fail('An empty Patch must not invoke a worker.') },
  })
  assert.deepEqual(preview, { documentRevision: parsed.documentRevision, kind: 'empty' })
  assert.deepEqual(projectAcceptedResults(`project-v1-${'a'.repeat(64)}`, parsed), [])
  assert.equal(
    resolveProjectLayerAsset(parsed, {
      assetSha256: sha256,
      documentRevision: parsed.documentRevision,
      layerId: owned.id,
      tabId: `project-v1-${'a'.repeat(64)}`,
    }),
    null,
  )
  assert.equal(JSON.stringify(parsed), original)
})

test('actual raster snapshot and worker-unavailable Save exclude empty Patch geometry while retaining its document data', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'igs-empty-patch-composition-'))
  try {
    const roots = {
      placeholdersDir: path.resolve('src/main/projects/placeholders'),
      scratchDir: path.join(directory, 'scratch'),
    }
    const session = await ProjectSession.create(
      path.join(directory, 'mixed.igs'),
      'Mixed foundation',
      roots,
    )
    const visible = raster()
    const owned = patch(session.document)
    session.applyDocument({ ...session.document, layers: [owned, visible] })
    const snapshot = await withFrozenRasterComposition(
      {
        document: session.document,
        packagePath: session.filePath,
        pendingSource: (asset) => {
          assert.deepEqual(asset, visible.asset)
          return { bytes: png }
        },
        scratchBasePath: roots.scratchDir,
        stagePrefix: 'empty-patch-',
      },
      async ({ document, layers, stagingRoot }) => {
        assert.deepEqual(document.layers, [owned, visible])
        assert.equal(layers.length, 1)
        assert.deepEqual(layers[0].transform, {
          rotationDegrees: 0,
          scaleX: 1,
          scaleY: 1,
          x: -9,
          y: 21,
        })
        assert.equal(layers[0].sha256, sha256)
        assert.deepEqual(await readFile(layers[0].path), png)
        assert.equal((await readdir(stagingRoot)).length, 1)
        return { geometry: layers[0].transform, stage: stagingRoot }
      },
    )
    assert.deepEqual(snapshot.geometry, visible.transform)
    await session.save({ assets: { [visible.asset.path]: { bytes: png } } })
    const saved = await readIgsPackage(session.filePath)
    assert.deepEqual(saved.project.layers, [owned, visible])
    assert.deepEqual(saved.manifest.preview, {
      rect: { height: 2, width: 2, x: -9, y: 21 },
      status: 'unavailable',
    })
    assert.deepEqual(await saved.readMember(visible.asset.path), png)
    assert.equal(
      saved.manifest.members.filter(({ path: member }) => member.startsWith('assets/')).length,
      1,
    )
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})
