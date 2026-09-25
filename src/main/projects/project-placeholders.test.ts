import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { readProjectPlaceholders } from './project-placeholders.js'

const bundledDirectory = path.resolve('src/main/projects/placeholders')
const raster = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGO06bnDwMDAxMDAwMDAAAATOgGonVuaBAAAAABJRU5ErkJggg==',
  'base64',
)

test('bundled empty and unavailable images are valid portable preview members', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-placeholders-'))
  try {
    const emptyProject = createEmptyProjectDocumentV1({ title: 'Empty' })
    for (const kind of ['empty', 'unavailable'] as const) {
      const files = await readProjectPlaceholders(bundledDirectory, kind)
      const filePath = path.join(directory, `${kind}.igs`)
      const layerId = randomUUID()
      const assetPath = `assets/layers/${layerId}.png`
      const project =
        kind === 'empty'
          ? emptyProject
          : {
              ...emptyProject,
              layers: [
                {
                  asset: {
                    bytes: raster.length,
                    height: 2,
                    path: assetPath,
                    sha256: createHash('sha256').update(raster).digest('hex'),
                    width: 2,
                  },
                  blendMode: 'normal' as const,
                  id: layerId,
                  kind: 'raster' as const,
                  locked: false,
                  name: 'Raster',
                  opacity: 1,
                  transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
                  visible: true,
                },
              ],
            }
      await saveIgsPackage(filePath, {
        assets: kind === 'empty' ? {} : { [assetPath]: { bytes: raster } },
        preview: {
          ...files,
          rect: kind === 'empty' ? null : { height: 2, width: 2, x: 0, y: 0 },
          status: kind,
        },
        project,
      })
      const opened = await readIgsPackage(filePath)
      assert.equal(opened.manifest.preview.status, kind)
      assert.deepEqual(await opened.readMember('preview/merged.png'), files.merged)
      assert.deepEqual(await opened.readMember('preview/thumbnail.webp'), files.thumbnail)
    }
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})
