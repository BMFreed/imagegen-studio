import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import type { IgsPreviewRectV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import { developmentImageWorkerLocation } from './development-image-worker.js'
import { exportProjectImage, ProjectImageExportError } from './project-image-export.js'
import { literalSmartPatchColorPng } from './test-fixtures/smart-patch-input-material.js'
import {
  type Fixture,
  withSmartComparisonProject,
} from './test-fixtures/smart-result-comparison.js'
import {
  type ComposeExportInput,
  ProjectWorkerClient,
  ProjectWorkerError,
} from './worker-client.js'

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const code = (expected: string) => (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === expected
type ExportWorker = Pick<ProjectWorkerClient, 'composeExport'>
const onePixelRect = { height: 1, width: 1, x: 0, y: 0 }

/**
 * CPU transport substitute only. Pixel/compositor behavior is qualified separately in
 * Python/native.
 */
function workerFixture(
  options: {
    before?: (request: ComposeExportInput) => Promise<void>
    bytes?: Buffer
    mutate?: (result: Awaited<ReturnType<ProjectWorkerClient['composeExport']>>) => void
    rect?: IgsPreviewRectV1
  } = {},
) {
  const requests: ComposeExportInput[] = []
  const worker: ExportWorker = {
    composeExport: async (request) => {
      requests.push(structuredClone(request))
      await options.before?.(request)
      const rect = request.bbox ?? options.rect ?? onePixelRect
      const bytes =
        options.bytes ??
        literalSmartPatchColorPng(
          rect.width,
          rect.height,
          Array.from({ length: rect.width * rect.height }, () => [23, 47, 91, 128]).flat(),
          4,
        )
      await writeFile(request.compositePngPath, bytes, { flag: 'wx' })
      const result = {
        composite: {
          byteSize: bytes.length,
          colorSpace: 'srgb' as const,
          height: rect.height,
          iccSha256: IGS_SRGB_ICC_SHA256,
          path: request.compositePngPath,
          sha256: digest(bytes),
          width: rect.width,
        },
        rect: { ...rect },
        status: 'rendered' as const,
      }
      options.mutate?.(result)
      return result
    },
  }
  return { requests, worker }
}

async function snapshot(f: Fixture) {
  return {
    canRedo: f.owner.canRedo,
    canUndo: f.owner.canUndo,
    dirty: f.owner.dirty,
    document: f.owner.document,
    epoch: f.owner.documentEpoch,
    index: await f.repository.listProjects(),
    packageBytes: await readFile(f.owner.filePath),
  }
}

test('actual service exports only visible Raster and the active Smart world contribution without saving or editing', async () => {
  await withSmartComparisonProject('illustrious', 'txt2img', async (f) => {
    const document = f.owner.document
    const patch = { ...f.patch, activeRasterSubLayerId: f.sources[1].variant.id, visible: true }
    await f.owner.applyDocument({
      ...document,
      layers: document.layers.map((layer) => (layer.id === patch.id ? patch : layer)),
    })
    const before = await snapshot(f)
    const destination = path.join(f.root, 'canvas.png')
    const { requests, worker } = workerFixture()
    const result = await f.service.exportImage(f.tabId, 'canvas', worker, async (name) => {
      assert.equal(name, 'canvas.png')
      return { canceled: false, filePath: destination }
    })
    assert.deepEqual(result, { fileName: 'canvas.png', kind: 'exported', rect: onePixelRect })
    assert.equal(requests.length, 1)
    const request = requests[0]
    assert.equal(request.bbox, undefined)
    assert.deepEqual(
      request.layers.map(({ sha256 }) => sha256),
      [f.sources[1].variant.asset.sha256, f.ordinary.asset.sha256],
    )
    assert.deepEqual(request.layers[0].transform, {
      rotationDegrees: 0,
      scaleX: 1,
      scaleY: 1,
      x: f.sources[1].variant.bbox.x,
      y: f.sources[1].variant.bbox.y,
    })
    assert.equal(request.layers[0].opacity, patch.opacity)
    assert.equal(
      request.layers.some(({ sha256 }) => sha256 === f.sources[0].variant.asset.sha256),
      false,
    )
    assert.ok(
      (await readFile(destination)).equals(literalSmartPatchColorPng(1, 1, [23, 47, 91, 128], 4)),
    )
    assert.deepEqual(await snapshot(f), before)
    assert.equal(existsSync(request.stagingRoot), false)
  })
})

test('bbox export uses the exact primary world bbox even when a visible Smart owner has different geometry', async () => {
  await withSmartComparisonProject('anima', 'outpaint', async (f) => {
    const primaryBbox = { height: 3, width: 5, x: -91, y: 107 }
    await f.owner.applyDocument({
      ...f.owner.document,
      layers: f.owner.document.layers.map((layer) =>
        layer.id === f.patch.id ? { ...f.patch, visible: true } : layer,
      ),
      primaryBbox,
    })
    const before = await snapshot(f)
    const destination = path.join(f.root, 'bbox.PNG')
    const { requests, worker } = workerFixture()
    const result = await f.service.exportImage(f.tabId, 'bbox', worker, async (name) => {
      assert.equal(name, 'generation-bbox.png')
      return { canceled: false, filePath: destination }
    })
    assert.deepEqual(requests[0].bbox, primaryBbox)
    assert.notDeepEqual(requests[0].bbox, f.patch.boundingBox)
    assert.deepEqual(result, { fileName: 'bbox.PNG', kind: 'exported', rect: primaryBbox })
    const bytes = await readFile(destination)
    assert.equal(bytes.readUInt32BE(16), 5)
    assert.equal(bytes.readUInt32BE(20), 3)
    assert.deepEqual(await snapshot(f), before)
  })
})

test('dirty pending raster bytes are frozen without Save and remain owned by the original Project', async () => {
  await withSmartComparisonProject('illustrious', 'img2img', async (f) => {
    const bytes = literalSmartPatchColorPng(
      8,
      8,
      Array.from({ length: 64 }, () => [21, 42, 63, 127]).flat(),
      4,
    )
    const imported = {
      ...f.imported,
      asset: { ...f.imported.asset, bytes: bytes.length, sha256: digest(bytes) },
      visible: true,
    }
    await f.owner.applyDocument(
      { ...f.owner.document, layers: [imported] },
      { [imported.asset.path]: { bytes } },
    )
    assert.equal(f.owner.dirty, true)
    const before = await snapshot(f)
    const { worker } = workerFixture({
      before: async ({ layers }) => {
        assert.equal(layers.length, 1)
        assert.equal(layers[0].sha256, digest(bytes))
        assert.deepEqual(await readFile(layers[0].path), bytes)
      },
    })
    await f.service.exportImage(f.tabId, 'canvas', worker, async () => ({
      canceled: false,
      filePath: path.join(f.root, 'pending'),
    }))
    assert.equal(existsSync(path.join(f.root, 'pending.png')), true)
    assert.deepEqual(await snapshot(f), before)
    const retained = f.owner.getCurrentAssetSource(imported.asset)
    assert.ok(retained)
    assert.deepEqual(
      'bytes' in retained ? retained.bytes : await readFile(retained.sourcePath),
      bytes,
    )
  })
})

test('the export reader accepts exact full-resolution images beyond the inference side ceiling', async () => {
  await withSmartComparisonProject('illustrious', 'txt2img', async (f) => {
    const rect = { height: 1, width: 4097, x: -13, y: 5 }
    const { worker } = workerFixture({ rect })
    const destination = path.join(f.root, 'full-resolution.png')
    const result = await f.service.exportImage(f.tabId, 'canvas', worker, async () => ({
      canceled: false,
      filePath: destination,
    }))
    assert.deepEqual(result, { fileName: 'full-resolution.png', kind: 'exported', rect })
    const bytes = await readFile(destination)
    assert.equal(bytes.readUInt32BE(16), 4097)
    assert.equal(bytes.readUInt32BE(20), 1)
  })
})

test('the actual service entry rejects unsupported regions without invoking the worker or chooser', async () => {
  await withSmartComparisonProject('illustrious', 'txt2img', async (f) => {
    const { requests, worker } = workerFixture()
    let choices = 0
    await assert.rejects(
      f.service.exportImage(f.tabId, 'selection' as 'canvas', worker, async () => {
        choices++
        return { canceled: true }
      }),
      code('PROJECT_IMAGE_EXPORT_INVALID_INPUT'),
    )
    assert.equal(requests.length, 0)
    assert.equal(choices, 0)
  })
})

test('empty visible projection refuses before composing or opening a native destination chooser', async () => {
  await withSmartComparisonProject('illustrious', 'txt2img', async (f) => {
    await f.owner.applyDocument({
      ...f.owner.document,
      layers: f.owner.document.layers.map((layer) => ({ ...layer, visible: false })),
    })
    const { requests, worker } = workerFixture()
    let choices = 0
    await assert.rejects(
      f.service.exportImage(f.tabId, 'canvas', worker, async () => {
        choices++
        return { canceled: true }
      }),
      code('PROJECT_IMAGE_EXPORT_EMPTY'),
    )
    assert.equal(requests.length, 0)
    assert.equal(choices, 0)
  })
})

test('actual all-alpha-empty response refuses both export regions rather than fabricating a saved image', async () => {
  await withSmartComparisonProject('illustrious', 'txt2img', async (f) => {
    const worker: ExportWorker = {
      composeExport: async () => ({ composite: null, rect: null, status: 'empty' }),
    }
    for (const region of ['canvas', 'bbox'] as const) {
      let choices = 0
      await assert.rejects(
        f.service.exportImage(f.tabId, region, worker, async () => {
          choices++
          return { canceled: true }
        }),
        code('PROJECT_IMAGE_EXPORT_EMPTY'),
      )
      assert.equal(choices, 0)
    }
  })
})

test('native dialog Cancel leaves package, current draft/history/dirty and index untouched', async () => {
  await withSmartComparisonProject('anima', 'inpaint', async (f) => {
    const before = await snapshot(f)
    const { requests, worker } = workerFixture()
    assert.deepEqual(
      await f.service.exportImage(f.tabId, 'canvas', worker, async () => ({ canceled: true })),
      { kind: 'canceled' },
    )
    assert.deepEqual(await snapshot(f), before)
    assert.equal(existsSync(requests[0].stagingRoot), false)
  })
})

test('an edit during real service composition rejects before the native chooser and publication', async () => {
  await withSmartComparisonProject('illustrious', 'txt2img', async (f) => {
    let choices = 0
    const { requests, worker } = workerFixture({
      before: async () => {
        const document = f.owner.document
        await f.owner.applyDocument({ ...document, title: 'Changed during export' })
      },
    })
    await assert.rejects(
      f.service.exportImage(f.tabId, 'canvas', worker, async () => {
        choices++
        return { canceled: false, filePath: path.join(f.root, 'stale.png') }
      }),
      code('PROJECT_IMAGE_EXPORT_CHANGED'),
    )
    assert.equal(choices, 0)
    assert.equal(existsSync(path.join(f.root, 'stale.png')), false)
    assert.equal(existsSync(requests[0].stagingRoot), false)
  })
})

test('dialog edit then Undo ABA is stale even when portable document and revision match again', async () => {
  await withSmartComparisonProject('illustrious', 'txt2img', async (f) => {
    const destination = path.join(f.root, 'aba.png')
    const epoch = f.owner.documentEpoch
    const original = f.owner.document
    const { worker } = workerFixture()
    await assert.rejects(
      f.service.exportImage(f.tabId, 'canvas', worker, async () => {
        await f.owner.applyDocument({ ...original, title: 'Temporary edit' })
        await f.owner.undo()
        assert.deepEqual(f.owner.document, original)
        assert.ok(f.owner.documentEpoch > epoch)
        return { canceled: false, filePath: destination }
      }),
      code('PROJECT_IMAGE_EXPORT_CHANGED'),
    )
    assert.equal(existsSync(destination), false)
  })
})

test('closing and reopening the same Project during the chooser cannot retarget the export', async () => {
  await withSmartComparisonProject('illustrious', 'txt2img', async (f) => {
    const destination = path.join(f.root, 'closed.png')
    const { worker } = workerFixture()
    await assert.rejects(
      f.service.exportImage(f.tabId, 'canvas', worker, async () => {
        await f.service.close(f.tabId)
        await f.service.open(f.tabId)
        assert.notEqual(f.service.getOpenDocumentForAcceptance(f.tabId), f.owner)
        return { canceled: false, filePath: destination }
      }),
      code('PROJECT_IMAGE_EXPORT_CHANGED'),
    )
    assert.equal(existsSync(destination), false)
  })
})

test('a genuine pending relocation started in the chooser invalidates the original export owner', async () => {
  await withSmartComparisonProject('illustrious', 'txt2img', async (f) => {
    const destination = path.join(f.root, 'moving.png')
    const { worker } = workerFixture()
    const movedDirectory = path.join(f.root, 'relocated')
    await mkdir(movedDirectory)
    let reservation: Awaited<ReturnType<typeof f.owner.prepareRelocation>> | undefined
    try {
      await assert.rejects(
        f.service.exportImage(f.tabId, 'canvas', worker, async () => {
          reservation = await f.owner.prepareRelocation(path.join(movedDirectory, 'Project.igs'))
          assert.equal(f.owner.relocationPending, true)
          return { canceled: false, filePath: destination }
        }),
        code('PROJECT_IMAGE_EXPORT_CHANGED'),
      )
      assert.equal(existsSync(destination), false)
    } finally {
      reservation?.release()
    }
  })
})

test('existing destination and symlink targets survive create-only publication unchanged', async () => {
  await withSmartComparisonProject('illustrious', 'txt2img', async (f) => {
    const alias = path.join(f.root, 'alias.png')
    const existing = path.join(f.root, 'existing.png')
    const bytes = Buffer.from('This existing user file must survive.')
    await writeFile(existing, bytes)
    await symlink(existing, alias)
    const before = await snapshot(f)
    for (const filePath of [existing, alias]) {
      await assert.rejects(
        f.service.exportImage(f.tabId, 'canvas', workerFixture().worker, async () => ({
          canceled: false,
          filePath,
        })),
        code('CANDIDATE_EXPORT_EXISTS'),
      )
      assert.deepEqual(await readFile(existing), bytes)
    }
    assert.deepEqual(await snapshot(f), before)
    assert.equal(
      (await readdir(f.root)).some((name) => name.startsWith('.igs-candidate-')),
      false,
    )
  })
})

test('invalid destination and real I/O failure publish no image or Project mutation', async () => {
  await withSmartComparisonProject('illustrious', 'txt2img', async (f) => {
    const before = await snapshot(f)
    for (const filePath of [
      'relative.png',
      path.join(f.root, 'project.igs'),
      `${f.root}/x/../escape.png`,
      `${f.root}/invalid\0.png`,
    ]) {
      await assert.rejects(
        f.service.exportImage(f.tabId, 'canvas', workerFixture().worker, async () => ({
          canceled: false,
          filePath,
        })),
        code('PROJECT_IMAGE_EXPORT_INVALID_DESTINATION'),
      )
    }
    await assert.rejects(
      f.service.exportImage(f.tabId, 'canvas', workerFixture().worker, async () => ({
        canceled: false,
        filePath: path.join(f.root, 'absent-directory', 'output.png'),
      })),
      code('CANDIDATE_EXPORT_WRITE_FAILED'),
    )
    assert.deepEqual(await snapshot(f), before)
  })
})

test('worker path/hash/dimension/color/geometry corruption never reaches the chooser or destination', async (t) => {
  await withSmartComparisonProject('illustrious', 'txt2img', async (f) => {
    for (const [name, mutate] of [
      [
        'path',
        (r) => {
          r.composite!.path = path.join(f.root, 'foreign.png')
        },
      ],
      [
        'hash',
        (r) => {
          r.composite!.sha256 = 'f'.repeat(64)
        },
      ],
      [
        'dimension',
        (r) => {
          r.composite!.width = 7
        },
      ],
      [
        'profile',
        (r) => {
          r.composite!.iccSha256 = 'f'.repeat(64)
        },
      ],
      [
        'capacity',
        (r) => {
          r.rect!.width = 16_385
          r.composite!.width = 16_385
        },
      ],
    ] as [string, (r: Awaited<ReturnType<ProjectWorkerClient['composeExport']>>) => void][]) {
      await t.test(name, async () => {
        let choices = 0
        const { worker } = workerFixture({ mutate })
        await assert.rejects(
          f.service.exportImage(f.tabId, 'canvas', worker, async () => {
            choices++
            return { canceled: true }
          }),
        )
        assert.equal(choices, 0)
      })
    }
    let choices = 0
    await assert.rejects(
      f.service.exportImage(
        f.tabId,
        'canvas',
        workerFixture({ bytes: literalSmartPatchColorPng(1, 1, [23, 47, 91], 3) }).worker,
        async () => {
          choices++
          return { canceled: true }
        },
      ),
    )
    assert.equal(choices, 0)
  })
})

test('bbox output must match the primary rectangle; worker mutation of the sent request cannot expand it', async () => {
  await withSmartComparisonProject('illustrious', 'txt2img', async (f) => {
    await f.owner.applyDocument({
      ...f.owner.document,
      primaryBbox: { height: 2, width: 2, x: -7, y: 11 },
    })
    const { worker } = workerFixture({
      before: async (request) => {
        request.bbox!.x++
      },
    })
    let choices = 0
    await assert.rejects(
      f.service.exportImage(f.tabId, 'bbox', worker, async () => {
        choices++
        return { canceled: true }
      }),
      code('PROJECT_IMAGE_EXPORT_INVALID_OUTPUT'),
    )
    assert.equal(choices, 0)
  })
})

test('unconfirmed worker exit retains its frozen source lease while ordinary worker failure cleans it', async () => {
  await withSmartComparisonProject('illustrious', 'txt2img', async (f) => {
    for (const workerCode of ['WORKER_EXIT_UNCONFIRMED', 'WORKER_EXITED'] as const) {
      let root = ''
      const worker: ExportWorker = {
        composeExport: async (request) => {
          root = request.stagingRoot
          throw new ProjectWorkerError(
            workerCode,
            'Declared transport failure; no actual child started.',
          )
        },
      }
      await assert.rejects(
        f.service.exportImage(f.tabId, 'canvas', worker, async () => ({ canceled: true })),
        code(workerCode),
      )
      assert.equal(existsSync(root), workerCode === 'WORKER_EXIT_UNCONFIRMED')
      if (workerCode === 'WORKER_EXIT_UNCONFIRMED') {
        assert.ok((await readdir(root)).some((name) => name.startsWith('layer-')))
      }
    }
  })
})

test('the final existing writer guard refuses a late source change and removes the synced temporary image', async () => {
  await withSmartComparisonProject('illustrious', 'txt2img', async (f) => {
    const destination = path.join(f.root, 'late.png')
    const { worker } = workerFixture()
    let checksAfterChoice = 0
    let chooserReturned = false
    await assert.rejects(
      exportProjectImage({
        assertCurrent: () => {
          if (chooserReturned && ++checksAfterChoice === 2) {
            throw new ProjectImageExportError(
              'PROJECT_IMAGE_EXPORT_CHANGED',
              'Declared late owner invalidation at the real writer guard.',
            )
          }
        },
        chooseDestination: async () => {
          chooserReturned = true
          return { canceled: false, filePath: destination }
        },
        document: f.owner.document,
        packagePath: f.owner.filePath,
        pendingSource: (asset) => f.owner.getCurrentAssetSource(asset),
        region: 'canvas',
        scratchBasePath: path.join(f.root, 'scratch'),
        worker,
      }),
      code('PROJECT_IMAGE_EXPORT_CHANGED'),
    )
    assert.equal(checksAfterChoice, 2)
    assert.equal(existsSync(destination), false)
    assert.equal(
      (await readdir(f.root)).some((name) => name.startsWith('.igs-candidate-')),
      false,
    )
  })
})

test('real CPU transport reaches the actual service native destination chooser with canonical output', async () => {
  await withSmartComparisonProject('illustrious', 'txt2img', async (f) => {
    const scratch = path.join(f.root, 'scratch')
    await mkdir(scratch, { recursive: true })
    const location = developmentImageWorkerLocation({
      isPackaged: false,
      mainDirectory: path.resolve('dist/main'),
      nodeEnv: 'test',
      scratchDirectory: scratch,
      smokeOptIn: '1',
    })
    assert.ok(location)
    const worker = await ProjectWorkerClient.start(location)
    try {
      let chosen = false
      const result = await f.service.exportImage(f.tabId, 'canvas', worker, async () => {
        chosen = true
        return { canceled: true }
      })
      assert.equal(chosen, true)
      assert.deepEqual(result, { kind: 'canceled' })
    } finally {
      await worker.close()
    }
  })
})
