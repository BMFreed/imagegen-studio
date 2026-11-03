import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import { parseProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import fs, { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { CapturedCurrentCanvasRegionalGenerationInput } from './project-current-canvas-regional-generation-input.js'
import type { ProjectWorkerClient } from './worker-client.js'

import { openAppDatabase } from '../db/database.js'
import { readIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { encodeProjectMaskPng } from './project-mask.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
import { literalSmartPatchColorPng } from './test-fixtures/smart-patch-input-material.js'

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const bbox = { height: 64, width: 64, x: -13, y: 5 }
const maskAlpha = [1, 127, 128, 255]
type Fixture = Awaited<ReturnType<typeof fixture>>
type TargetWorker = Pick<ProjectWorkerClient, 'composeTarget'>

function deferred() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

/** Real Service/coordinator/SQLite/Save/reopen, with literal model-free PNG fixture bytes. */
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-combined-capture-'))
  const database = openAppDatabase(root, path.resolve('src/main/db/migrations'))
  const scratch = path.join(root, 'scratch')
  const service = new ProjectService({
    autosaveOptions: { debounceMs: 60_000, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    dataRoot: root,
    repository: new ProjectIndexRepository(database.db),
    roots: { placeholdersDir: path.resolve('src/main/projects/placeholders'), scratchDir: scratch },
    shadow: new ProjectShadowStore(path.join(root, 'autosave')),
  })
  const dispose = async () => {
    for (const tab of service.getOpenTabs()) {
      await service.discardAndClose(tab.id)
    }
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
  try {
    const { id } = await service.create({ height: 256, title: 'Coherent capture', width: 256 })
    const coordinator = () => service.getOpenDocumentForAcceptance(id)!
    const document = () => coordinator().document
    const png = literalSmartPatchColorPng(
      64,
      64,
      Array.from({ length: 64 * 64 }, () => [23, 47, 91, 255]).flat(),
      4,
    )
    const mask = encodeProjectMaskPng(Uint8Array.from(maskAlpha), 2, 2)
    const layerId = randomUUID()
    const regionId = randomUUID()
    const maskId = randomUUID()
    const rasterPath = `assets/layers/${layerId}.png`
    const maskPath = `assets/masks/${maskId}/${digest(mask)}.png`
    await coordinator().applyDocument(
      parseProjectDocumentV1({
        ...document(),
        generationDraft: {
          ...document().generationDraft,
          positivePrompt: { embeddingRefs: [], text: 'Original Canvas text' },
        },
        layers: [
          {
            asset: {
              bytes: png.length,
              height: 64,
              path: rasterPath,
              sha256: digest(png),
              width: 64,
            },
            blendMode: 'normal',
            id: layerId,
            kind: 'raster',
            locked: false,
            name: 'Captured Raster',
            opacity: 1,
            transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: bbox.x, y: bbox.y },
            visible: true,
          },
        ],
        primaryBbox: bbox,
        regionalGuidance: [
          {
            enabled: true,
            id: regionId,
            locked: true,
            mask: {
              asset: {
                bytes: mask.length,
                height: 2,
                path: maskPath,
                sha256: digest(mask),
                width: 2,
              },
              bounds: { height: 2, width: 2, x: bbox.x, y: bbox.y },
              id: maskId,
              revision: 1,
            },
            name: 'Captured region',
            overlayOpacity: 0,
          },
        ],
      }),
      { [maskPath]: { bytes: mask }, [rasterPath]: { bytes: png } },
    )
    await service.save(id)
    const savedPath = coordinator().filePath
    await service.close(id)
    assert.equal((await service.open(id)).kind, 'opened')
    assert.deepEqual((await readIgsPackage(savedPath)).project, document())
    return {
      coordinator,
      database,
      dispose,
      document,
      id,
      mask,
      maskPath,
      png,
      rasterPath,
      regionId,
      root,
      savedPath,
      scratch,
      service,
    }
  } catch (error) {
    await dispose()
    throw error
  }
}

async function withFixture(run: (f: Fixture) => Promise<void>) {
  const f = await fixture()
  try {
    await run(f)
  } finally {
    await f.dispose()
  }
}

function worker(
  f: Fixture,
  inspect?: (request: Parameters<TargetWorker['composeTarget']>[0]) => Promise<void>,
): TargetWorker {
  return {
    composeTarget: async (request) => {
      await inspect?.(request)
      await writeFile(request.targetPngPath, f.png)
      return {
        composite: {
          byteSize: f.png.length,
          colorSpace: 'srgb',
          height: 64,
          iccSha256: IGS_SRGB_ICC_SHA256,
          path: request.targetPngPath,
          sha256: digest(f.png),
          width: 64,
        },
        mode: 'img2img',
        rect: { ...bbox },
      }
    },
  }
}

async function scratchNames(f: Fixture) {
  return (await readdir(f.scratch)).sort()
}

test('real Service combines saved raster/region inputs without changing Project or granting generation', async () => {
  await withFixture(async (f) => {
    const before = structuredClone(f.document())
    const epoch = f.coordinator().documentEpoch
    const saved = await readFile(f.savedPath)
    let retained!: CapturedCurrentCanvasRegionalGenerationInput
    let targetStage = ''
    const target = await f.service.withCapturedCurrentCanvasRegionalGenerationInput(
      f.id,
      async (capture) => {
        retained = capture
        assert.deepEqual(capture.document, before)
        assert.equal(capture.regional.snapshot.documentRevision, before.documentRevision)
        assert.equal(capture.document.regionalGuidance![0].locked, true)
        assert.equal(capture.document.regionalGuidance![0].overlayOpacity, 0)
        assert.deepEqual(await capture.regional.readAsset(f.maskPath), f.mask)
        capture.document.primaryBbox.x = 900
        capture.document.generationDraft.positivePrompt.text = 'Mutated exposed document'
        capture.regional.snapshot.generationDraft.positivePrompt.text =
          'Mutated exposed regional snapshot'
        const coverage = await capture.regional.projectMask(f.regionId, bbox)
        assert.deepEqual(Array.from(coverage.alpha.slice(0, 2)), [1, 127])
        assert.deepEqual(Array.from(coverage.alpha.slice(64, 66)), [128, 255])
        capture.assertCurrent()
        return await capture.composeTarget(
          worker(f, async (request) => {
            targetStage = request.stagingRoot
            assert.deepEqual(request.bbox, bbox)
            assert.equal(request.layers.length, 1)
            assert.deepEqual(await readFile(request.layers[0].path), f.png)
          }),
        )
      },
    )
    assert.deepEqual(target.bbox, bbox)
    assert.equal(target.generationDraft.positivePrompt.text, 'Original Canvas text')
    assert.deepEqual(target.composite.bytes, f.png)
    assert.equal(existsSync(targetStage), false)
    assert.equal(existsSync(retained.regional.stagingRoot), false)
    await assert.rejects(retained.composeTarget(worker(f)), /lease is closed/)
    await assert.rejects(retained.regional.projectMask(f.regionId, bbox), /lease is closed/)
    assert.deepEqual(await scratchNames(f), [])
    assert.deepEqual(f.document(), before)
    assert.equal(f.coordinator().documentEpoch, epoch)
    assert.deepEqual(await readFile(f.savedPath), saved)
    assert.equal(
      (await f.database.db.selectFrom('generation_queue_item').selectAll().execute()).length,
      0,
    )
  })
})

test('both pending-source collections detach before the first acquisition await', async () => {
  await withFixture(async (f) => {
    const co = f.coordinator()
    const original = co.getCurrentAssetSource
    const raster = Buffer.from(f.png)
    const mask = Buffer.from(f.mask)
    const observed: string[] = []
    co.getCurrentAssetSource = (member) => {
      observed.push(member.path)
      return { bytes: member.path === f.rasterPath ? raster : mask }
    }
    const capturing = f.service.withCapturedCurrentCanvasRegionalGenerationInput(
      f.id,
      async (capture) => {
        assert.deepEqual(await capture.regional.readAsset(f.maskPath), f.mask)
        await capture.composeTarget(
          worker(f, async (request) => {
            assert.deepEqual(await readFile(request.layers[0].path), f.png)
          }),
        )
      },
    )
    co.getCurrentAssetSource = () =>
      assert.fail('A later acquisition reread live coordinator sources')
    raster.fill(0)
    mask.fill(0)
    try {
      await capturing
      assert.deepEqual(observed.sort(), [f.maskPath, f.rasterPath].sort())
      assert.deepEqual(await scratchNames(f), [])
    } finally {
      co.getCurrentAssetSource = original
    }
  })
})

test('target invocation binds the original worker method and detaches request metadata', async () => {
  await withFixture(async (f) => {
    await f.service.withCapturedCurrentCanvasRegionalGenerationInput(f.id, async (capture) => {
      const originalWorker = worker(f)
      const compose = originalWorker.composeTarget
      originalWorker.composeTarget = async function (request) {
        assert.equal(this, originalWorker)
        const result = await compose(request)
        request.bbox.x = 12_345
        request.layers[0].transform.x = 12_345
        return result
      }
      const composing = capture.composeTarget(originalWorker)
      originalWorker.composeTarget = async () => assert.fail('A replaced worker method was reread')
      const target = await composing
      assert.deepEqual(target.bbox, bbox)
      assert.deepEqual(capture.document.primaryBbox, bbox)
      assert.deepEqual(f.document().primaryBbox, bbox)
    })
  })
})

async function acquisitionBarrier(f: Fixture, prefix: string) {
  const original = fs.mkdtemp
  const entered = deferred()
  const release = deferred()
  let observed = false
  fs.mkdtemp = (async (...args: Parameters<typeof fs.mkdtemp>) => {
    const result = await original(...args)
    if (!observed && String(args[0]).startsWith(path.join(f.scratch, prefix))) {
      observed = true
      entered.release()
      await release.promise
    }
    return result
  }) as typeof fs.mkdtemp
  syncBuiltinESMExports()
  return {
    entered: entered.promise,
    release: release.release,
    restore: () => {
      fs.mkdtemp = original
      syncBuiltinESMExports()
    },
  }
}

test('each lease acquisition rejects edit, revision ABA and coordinator close/reopen', async (t) => {
  for (const prefix of ['project-target-', 'regional-input-']) {
    for (const interference of ['edit', 'edit-undo', 'close-reopen']) {
      await t.test(`${prefix}${interference}`, async () =>
        withFixture(async (f) => {
          const revision = f.document().documentRevision
          const epoch = f.coordinator().documentEpoch
          const coordinator = f.coordinator()
          const barrier = await acquisitionBarrier(f, prefix)
          let callbackCalls = 0
          const capturing = f.service.withCapturedCurrentCanvasRegionalGenerationInput(
            f.id,
            async () => {
              callbackCalls++
            },
          )
          const refused = assert.rejects(capturing, { code: 'EDIT_CONFLICT' })
          try {
            await barrier.entered
            if (interference === 'close-reopen') {
              await f.service.close(f.id)
              assert.equal((await f.service.open(f.id)).kind, 'opened')
              assert.notEqual(f.coordinator(), coordinator)
              assert.equal(f.document().documentRevision, revision)
            } else {
              await f.service.updateGenerationDraft(f.id, {
                kind: 'positive-prompt',
                text: 'Later authoring',
              })
              if (interference === 'edit-undo') {
                await f.service.undo(f.id)
                assert.equal(f.document().documentRevision, revision)
                assert.ok(f.coordinator().documentEpoch > epoch)
              }
            }
            const expected = structuredClone(f.document())
            barrier.release()
            await refused
            assert.equal(callbackCalls, 0)
            assert.deepEqual(f.document(), expected)
            assert.deepEqual(await scratchNames(f), [])
          } finally {
            barrier.release()
            await refused.finally(barrier.restore)
          }
        }),
      )
    }
  }
})

test('acquired capture keeps historical bytes while assertCurrent rejects subsequent edits and close', async () => {
  await withFixture(async (f) => {
    await f.service.withCapturedCurrentCanvasRegionalGenerationInput(f.id, async (capture) => {
      const revision = capture.document.documentRevision
      await f.service.updateGenerationDraft(f.id, {
        kind: 'positive-prompt',
        text: 'Later authoring',
      })
      assert.throws(capture.assertCurrent, { code: 'EDIT_CONFLICT' })
      await f.service.undo(f.id)
      assert.equal(f.document().documentRevision, revision)
      assert.throws(capture.assertCurrent, { code: 'EDIT_CONFLICT' })
      const target = await capture.composeTarget(worker(f))
      assert.equal(target.documentRevision, revision)
      assert.equal(target.generationDraft.positivePrompt.text, 'Original Canvas text')
      await f.service.close(f.id)
      assert.throws(capture.assertCurrent, { code: 'EDIT_CONFLICT' })
      assert.deepEqual(await capture.regional.readAsset(f.maskPath), f.mask)
    })
    assert.deepEqual(await scratchNames(f), [])
  })
})

test('callback return and failure wait for started target operations before both cleanups', async (t) => {
  for (const fail of [false, true]) {
    await t.test(fail ? 'callback throws' : 'callback returns', async () =>
      withFixture(async (f) => {
        const entered = deferred()
        const release = deferred()
        const failure = new Error('Callback failed')
        let targetStage = ''
        let regionalStage = ''
        let target!: ReturnType<CapturedCurrentCanvasRegionalGenerationInput['composeTarget']>
        let settled = false
        const capturing = f.service.withCapturedCurrentCanvasRegionalGenerationInput(
          f.id,
          async (capture) => {
            regionalStage = capture.regional.stagingRoot
            target = capture.composeTarget(
              worker(f, async (request) => {
                targetStage = request.stagingRoot
                entered.release()
                await release.promise
                assert.equal(existsSync(regionalStage), true)
                assert.deepEqual(await readFile(request.layers[0].path), f.png)
              }),
            )
            if (fail) {
              throw failure
            }
            return 'callback result'
          },
        )
        const completion = fail
          ? assert.rejects(capturing, (error) => error === failure)
          : capturing
        void capturing.then(
          () => {
            settled = true
          },
          () => {
            settled = true
          },
        )
        try {
          await entered.promise
          assert.equal(settled, false)
          assert.equal(existsSync(targetStage), true)
          assert.equal(existsSync(regionalStage), true)
        } finally {
          release.release()
        }
        await completion
        assert.deepEqual((await target).composite.bytes, f.png)
        assert.equal(existsSync(targetStage), false)
        assert.equal(existsSync(regionalStage), false)
        assert.deepEqual(await scratchNames(f), [])
      }),
    )
  }
})

test('overlapping target calls serialize their shared output path and retain separate verified bytes', async () => {
  await withFixture(async (f) => {
    const entered = deferred()
    const release = deferred()
    let calls = 0
    await f.service.withCapturedCurrentCanvasRegionalGenerationInput(f.id, async (capture) => {
      const targetWorker = worker(f, async () => {
        calls++
        if (calls === 1) {
          entered.release()
          await release.promise
        }
      })
      const first = capture.composeTarget(targetWorker)
      const second = capture.composeTarget(targetWorker)
      await entered.promise
      assert.equal(calls, 1)
      release.release()
      const targets = await Promise.all([first, second])
      assert.equal(calls, 2)
      targets[0].composite.bytes.fill(0)
      assert.deepEqual(targets[1].composite.bytes, f.png)
    })
    assert.deepEqual(await scratchNames(f), [])
  })
})

test('a corrupt regional source after raster acquisition refuses before callback and releases both leases', async () => {
  await withFixture(async (f) => {
    const co = f.coordinator()
    const original = co.getCurrentAssetSource
    const saved = await readFile(f.savedPath)
    let callbackCalls = 0
    co.getCurrentAssetSource = function (member) {
      return member.path === f.maskPath
        ? { bytes: Buffer.alloc(f.mask.length) }
        : original.call(this, member)
    }
    try {
      await assert.rejects(
        f.service.withCapturedCurrentCanvasRegionalGenerationInput(f.id, async () => {
          callbackCalls++
        }),
      )
      assert.equal(callbackCalls, 0)
      assert.deepEqual(await scratchNames(f), [])
      assert.deepEqual(await readFile(f.savedPath), saved)
    } finally {
      co.getCurrentAssetSource = original
    }
  })
})

test('a target failure preserves its cause and closes the target capability with both leases', async () => {
  await withFixture(async (f) => {
    const failure = new Error('Controlled target failure')
    let retained!: CapturedCurrentCanvasRegionalGenerationInput
    await assert.rejects(
      f.service.withCapturedCurrentCanvasRegionalGenerationInput(f.id, async (capture) => {
        retained = capture
        await capture.composeTarget({
          composeTarget: async (request) => {
            assert.deepEqual(await readFile(request.layers[0].path), f.png)
            throw failure
          },
        })
      }),
      (error) => error === failure,
    )
    await assert.rejects(retained.composeTarget(worker(f)), /lease is closed/)
    assert.deepEqual(await scratchNames(f), [])
  })
})

for (const catches of [false, true]) {
  test(`unconfirmed target exit retains owned files and refuses queued work when callback ${catches ? 'catches' : 'rethrows'}`, async () => {
    await withFixture(async (f) => {
      const failure = Object.assign(new Error('Fixture child physical exit is unconfirmed'), {
        code: 'WORKER_EXIT_UNCONFIRMED',
      })
      const held: { request?: Parameters<TargetWorker['composeTarget']>[0] } = {}
      let replacements = 0
      const capturing = f.service.withCapturedCurrentCanvasRegionalGenerationInput(
        f.id,
        async (capture) => {
          const first = capture.composeTarget({
            composeTarget: async (request) => {
              held.request = structuredClone(request)
              throw failure
            },
          })
          const queued = capture.composeTarget({
            composeTarget: async (request) => {
              replacements++
              return await worker(f).composeTarget(request)
            },
          })
          const outcomes = await Promise.allSettled([first, queued])
          assert.equal(replacements, 0, 'No new composition may touch retained child-owned files.')
          for (const outcome of outcomes) {
            assert.equal(outcome.status, 'rejected')
            if (outcome.status === 'rejected') {
              assert.equal(outcome.reason, failure)
            }
          }
          await assert.rejects(capture.composeTarget(worker(f)), (error) => error === failure)
          if (!catches) {
            throw failure
          }
          return 'Caught failure cannot authorize cleanup'
        },
      )
      if (catches) {
        assert.equal(await capturing, 'Caught failure cannot authorize cleanup')
      } else {
        await assert.rejects(capturing, (error) => error === failure)
      }
      assert.ok(held.request)
      assert.ok(existsSync(held.request.stagingRoot), 'The unconfirmed child still owns staging.')
      // Independent late consumption after the entire callback/lease returned must remain valid.
      assert.deepEqual(await readFile(held.request.layers[0].path), f.png)
      assert.equal((await scratchNames(f)).length, 1, 'Only the raster owner is retained.')
      assert.ok((await scratchNames(f))[0].startsWith('project-target-'))
      // This fixture has no process: explicitly settle the simulated reader before releasing it.
      await rm(held.request.stagingRoot, { recursive: true })
    })
  })
}

test('confirmed target failure permits queued recovery and releases both capture leases', async () => {
  await withFixture(async (f) => {
    const failure = Object.assign(new Error('Fixture child confirmed exit'), {
      code: 'WORKER_PROTOCOL_ERROR',
    })
    await f.service.withCapturedCurrentCanvasRegionalGenerationInput(f.id, async (capture) => {
      const failed = capture.composeTarget({
        composeTarget: async () => {
          throw failure
        },
      })
      const recovered = capture.composeTarget(worker(f))
      await assert.rejects(failed, (error) => error === failure)
      assert.deepEqual((await recovered).composite.bytes, f.png)
    })
    assert.deepEqual(await scratchNames(f), [])
  })
})
