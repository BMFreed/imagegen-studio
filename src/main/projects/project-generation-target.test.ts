import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import {
  createEmptyProjectDocumentV1,
  type IgsProjectDocumentV1,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { ProjectWorkerClient } from './worker-client.js'

import { saveIgsPackage } from './igs-package.js'
import { buildFrozenGenerationTarget } from './project-generation-target.js'
import { readProjectPlaceholders } from './project-placeholders.js'
import { requireRasterLayer } from './test-fixtures/require-raster-layer.js'

const placeholdersDir = path.resolve('src/main/projects/placeholders')
// Real 2x2 RGBA PNGs with the worker's pinned sRGB ICC, prepared from Pillow once for this test.
const opaquePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAABd2lDQ1BJQ0MgUHJvZmlsZQAAeJx1kTtLA0EUhb8kiq+IoBYqFimiWCiIggo2Gos0QUKMYNQm2byETbLsbpBgK9hYBCxEG1+F/0BbwVZBEBRBxNrSVyOy3kmEiOgss/fjzJzL3bPgDulazqqbglzeNiPBgG8htuhreKKJbtoZZzKuWcZ0OBzi3/V+g0vV6yHV6/97f66WZMrSwNUoPKYZpi0s0xBatQ3Fm8KdWjaeFN4XHjRlQOELpSeq/Kg4U+VXxWY0MgNu1dOX+cGJH6xlzZzwgLA/pxe173nUl3hT+fk5qT2ye7GIECSAjwRFVtCxGZKal8z+9g1XfLMUxKPJ26CEKY4MWfEOilqUrimpadFT8uiUVO6/87TSoyPV7t4A1D84zksfNGzBZ9lxPg4c5/MQPPdwlq/5C5LTxJvo5Zrm34O2dTg5r2mJbTjdgK47I27GK5JHtjudhudjaI1BxxU0L1Wz+j7n6Baia/KLLmFnF/rlftvyF6IEaFREj5lCAAAAFElEQVR4nGM8IWfzn4GBgYGJAQoAINQCJVLpZxsAAAAASUVORK5CYII=',
  'base64',
)
const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAABd2lDQ1BJQ0MgUHJvZmlsZQAAeJx1kTtLA0EUhb8kiq+IoBYqFimiWCiIggo2Gos0QUKMYNQm2byETbLsbpBgK9hYBCxEG1+F/0BbwVZBEBRBxNrSVyOy3kmEiOgss/fjzJzL3bPgDulazqqbglzeNiPBgG8htuhreKKJbtoZZzKuWcZ0OBzi3/V+g0vV6yHV6/97f66WZMrSwNUoPKYZpi0s0xBatQ3Fm8KdWjaeFN4XHjRlQOELpSeq/Kg4U+VXxWY0MgNu1dOX+cGJH6xlzZzwgLA/pxe173nUl3hT+fk5qT2ye7GIECSAjwRFVtCxGZKal8z+9g1XfLMUxKPJ26CEKY4MWfEOilqUrimpadFT8uiUVO6/87TSoyPV7t4A1D84zksfNGzBZ9lxPg4c5/MQPPdwlq/5C5LTxJvo5Zrm34O2dTg5r2mJbTjdgK47I27GK5JHtjudhudjaI1BxxU0L1Wz+j7n6Baia/KLLmFnF/rlftvyF6IEaFREj5lCAAAAC0lEQVR4nGNgQAcAABIAAXfx+gAAAAAASUVORK5CYII=',
  'base64',
)
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

async function withPackage(
  run: (context: {
    document: IgsProjectDocumentV1
    packagePath: string
    scratchBasePath: string
  }) => Promise<void>,
  withRaster = true,
  lastActualSeedSnapshot: number | null = null,
): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-target-'))
  try {
    const packagePath = path.join(directory, 'project.igs')
    const scratchBasePath = path.join(directory, 'scratch')
    await mkdir(scratchBasePath)
    const empty = createEmptyProjectDocumentV1({ title: 'Frozen target' })
    const layerId = randomUUID()
    const assetPath = `assets/layers/${layerId}.png`
    const document: IgsProjectDocumentV1 = {
      ...empty,
      generationDraft: {
        ...empty.generationDraft,
        positivePrompt: { embeddingRefs: [], text: 'frozen prompt' },
      },
      lastActualSeedSnapshot,
      layers: withRaster
        ? [
            {
              asset: {
                bytes: opaquePng.length,
                height: 2,
                path: assetPath,
                sha256: sha256(opaquePng),
                width: 2,
              },
              blendMode: 'normal',
              id: layerId,
              kind: 'raster',
              locked: false,
              name: 'Source',
              opacity: 1,
              transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -7, y: 9 },
              visible: true,
            },
          ]
        : [],
      primaryBbox: { height: 2, width: 2, x: -7, y: 9 },
    }
    await saveIgsPackage(packagePath, {
      assets: withRaster ? { [assetPath]: { bytes: opaquePng } } : {},
      preview: {
        ...(await readProjectPlaceholders(placeholdersDir, withRaster ? 'unavailable' : 'empty')),
        rect: withRaster ? { height: 2, width: 2, x: -7, y: 9 } : null,
        status: withRaster ? 'unavailable' : 'empty',
      },
      project: document,
    })
    await run({ document, packagePath, scratchBasePath })
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

function outputWorker(
  bytes: Buffer,
  mode: 'img2img' | 'txt2img',
  inspect?: (input: Parameters<ProjectWorkerClient['composeTarget']>[0]) => Promise<void>,
): Pick<ProjectWorkerClient, 'composeTarget'> {
  return {
    composeTarget: async (input) => {
      await inspect?.(input)
      await writeFile(input.targetPngPath, bytes)
      return {
        composite: {
          byteSize: bytes.length,
          colorSpace: 'srgb',
          height: 2,
          iccSha256: IGS_SRGB_ICC_SHA256,
          path: input.targetPngPath,
          sha256: sha256(bytes),
          width: 2,
        },
        mode,
        rect: input.bbox,
      }
    },
  }
}

test('real package raster, bbox, draft and saved seed snapshot are frozen before worker returns', async () => {
  await withPackage(
    async ({ document, packagePath, scratchBasePath }) => {
      let stage = ''
      const worker = outputWorker(opaquePng, 'img2img', async (input) => {
        stage = input.stagingRoot
        assert.deepEqual(input.bbox, { height: 2, width: 2, x: -7, y: 9 })
        assert.equal(input.layers.length, 1)
        assert.deepEqual(await readFile(input.layers[0].path), opaquePng)
        document.primaryBbox.x = 100
        document.generationDraft.positivePrompt.text = 'edited while worker ran'
        document.lastActualSeedSnapshot = 99
        requireRasterLayer(document.layers[0]).transform.x = 100
      })
      const target = await buildFrozenGenerationTarget({
        document,
        packagePath,
        pendingSource: () => null,
        scratchBasePath,
        worker,
      })
      assert.equal(target.documentId, document.documentId)
      assert.equal(target.documentRevision, document.documentRevision)
      assert.deepEqual(target.bbox, { height: 2, width: 2, x: -7, y: 9 })
      assert.equal(target.generationDraft.positivePrompt.text, 'frozen prompt')
      assert.equal(target.lastActualSeedSnapshot, 37)
      assert.equal(target.mode, 'img2img')
      assert.equal(target.composite.sha256, sha256(opaquePng))
      assert.deepEqual(target.composite.bytes, opaquePng)
      assert.equal(existsSync(stage), false)
      assert.deepEqual(await readdir(scratchBasePath), [])
    },
    true,
    37,
  )
})

test('empty Project still materializes a transparent finite txt2img input', async () => {
  await withPackage(async ({ document, packagePath, scratchBasePath }) => {
    const target = await buildFrozenGenerationTarget({
      document,
      packagePath,
      pendingSource: () => null,
      scratchBasePath,
      worker: outputWorker(transparentPng, 'txt2img', async (input) => {
        assert.deepEqual(input.layers, [])
        assert.deepEqual(input.bbox, { height: 2, width: 2, x: -7, y: 9 })
      }),
    })
    assert.equal(target.mode, 'txt2img')
    assert.deepEqual(target.composite.bytes, transparentPng)
    assert.deepEqual(await readdir(scratchBasePath), [])
  }, false)
})

test('a changed saved asset is refused before worker execution', async () => {
  await withPackage(async ({ document, packagePath, scratchBasePath }) => {
    requireRasterLayer(document.layers[0]).asset.sha256 = '0'.repeat(64)
    let called = false
    await assert.rejects(
      buildFrozenGenerationTarget({
        document,
        packagePath,
        pendingSource: () => null,
        scratchBasePath,
        worker: {
          composeTarget: async () => {
            called = true
            throw new Error('Must not run')
          },
        },
      }),
      /saved Raster Layer changed/,
    )
    assert.equal(called, false)
    assert.deepEqual(await readdir(scratchBasePath), [])
  })
})

test('pending source bytes are copied before any await and output tampering is rejected', async () => {
  await withPackage(async ({ document, packagePath, scratchBasePath }) => {
    const pending = Buffer.from(opaquePng)
    const worker = outputWorker(opaquePng, 'img2img', async (input) => {
      assert.deepEqual(await readFile(input.layers[0].path), opaquePng)
    })
    const targetPromise = buildFrozenGenerationTarget({
      document,
      packagePath,
      pendingSource: () => ({ bytes: pending }),
      scratchBasePath,
      worker,
    })
    pending.fill(0)
    const target = await targetPromise
    assert.deepEqual(target.composite.bytes, opaquePng)

    await assert.rejects(
      buildFrozenGenerationTarget({
        document,
        packagePath,
        pendingSource: () => null,
        scratchBasePath,
        worker: {
          composeTarget: async (input) => {
            await writeFile(input.targetPngPath, opaquePng)
            return {
              composite: {
                byteSize: opaquePng.length,
                colorSpace: 'srgb',
                height: 2,
                iccSha256: IGS_SRGB_ICC_SHA256,
                path: input.targetPngPath,
                sha256: '0'.repeat(64),
                width: 2,
              },
              mode: 'img2img',
              rect: input.bbox,
            }
          },
        },
      }),
      /changed while being verified/,
    )
    assert.deepEqual(await readdir(scratchBasePath), [])
  })
})
