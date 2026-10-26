import { parseProjectDocumentV1 } from '../../shared/projects/project-schema.js'
import {
  isSmartResultComparisonDataForRequest,
  type SmartResultComparisonRequest,
} from '../../shared/projects/smart-result-comparison.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { readdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { readIgsPackage } from './igs-package.js'
import {
  ProjectTargetInspectionOwner,
  type TargetInspectionWorkerProvider,
} from './project-target-inspection-owner.js'
import { classifyTargetPngAlpha } from './target-png-mode.js'
import {
  comparisonRequestFor,
  type Fixture,
  withSmartComparisonProject,
} from './test-fixtures/smart-result-comparison.js'
import { ProjectWorkerClient, ProjectWorkerError } from './worker-client.js'

function activeRequest(f: Fixture): SmartResultComparisonRequest {
  return comparisonRequestFor(f.owner.document, {
    kind: 'smart-patch-variant',
    layerId: f.patch.id,
    variantId: f.sources[0].variant.id,
  })
}

const comparisonStages = async (f: Fixture) =>
  (await readdir(path.join(f.root, 'scratch'))).filter((name) => name.startsWith('project-target-'))

for (const family of ['illustrious', 'anima'] as const) {
  for (const mode of ['txt2img', 'img2img', 'inpaint', 'outpaint'] as const) {
    test(`${family} ${mode} active and converted Smart comparison returns frozen settings without mutating real package owners`, async () => {
      await withSmartComparisonProject(family, mode, async (f) => {
        const beforeDocument = structuredClone(f.owner.document)
        const beforeTab = f.service.getOpenTabs()[0]
        const beforeBytes = await readFile(f.owner.filePath)
        const saved = await readIgsPackage(f.owner.filePath)
        const beforeShadow = await f.shadow.inspect({
          projectPath: f.owner.filePath,
          savedPackage: saved,
        })
        const beforeIndex = await f.repository.listSavedAcceptedResults(f.tabId)
        for (const [request, source] of [
          [activeRequest(f), f.sources[0].variant],
          [
            comparisonRequestFor(f.owner.document, { kind: 'raster', layerId: f.converted.id }),
            f.sources[2].variant,
          ],
        ] as const) {
          const reply = await f.service.getSmartResultComparisonData(f.tabId, request)
          assert.ok(isSmartResultComparisonDataForRequest(reply, request))
          assert.deepEqual(
            reply.generationConfiguration,
            source.generationProvenance.generationConfiguration,
          )
          assert.equal(reply.generationConfiguration.sampling.actualSeed, 0)
          assert.equal(reply.generationConfiguration.mode, mode)
          assert.equal(reply.currentMode, null)
          assert.match(reply.modeUnavailableReason!, /unavailable/)
          assert.equal('size' in reply.generationConfiguration, false)
          assert.equal(reply.resultId, source.id)
          assert.notEqual(
            reply.owner.layerId,
            source.generationProvenance.layerSourceContext.layerId,
          )
          assert.deepEqual(Object.keys(reply).sort(), [
            'assetSha256',
            'currentMode',
            'documentId',
            'documentRevision',
            'generationConfiguration',
            'modeUnavailableReason',
            'owner',
            'resultId',
          ])
          assert.notEqual(
            reply.generationConfiguration.positivePrompt.text,
            f.owner.document.generationDraft.positivePrompt.text,
          )
          assert.notEqual(
            reply.generationConfiguration.positivePrompt.text,
            f.patch.generationDraft.positivePrompt.text,
          )
          reply.generationConfiguration.positivePrompt.text = 'Mutated reply'
          reply.generationConfiguration.model.fileSha256 = '0'.repeat(64)
          reply.owner.layerId = randomUUID()
        }
        assert.deepEqual(f.owner.document, beforeDocument)
        assert.deepEqual(f.service.getOpenTabs()[0], beforeTab)
        assert.deepEqual(await readFile(f.owner.filePath), beforeBytes)
        assert.deepEqual(
          await f.shadow.inspect({ projectPath: f.owner.filePath, savedPackage: saved }),
          beforeShadow,
        )
        assert.deepEqual(await f.repository.listSavedAcceptedResults(f.tabId), beforeIndex)
        const request = activeRequest(f)
        const expected = await f.service.getSmartResultComparisonData(f.tabId, request)
        await f.service.discardAndClose(f.tabId)
        assert.equal((await f.service.open(f.tabId)).kind, 'opened')
        assert.deepEqual(await f.service.getSmartResultComparisonData(f.tabId, request), expected)
      })
    })
  }
}

test('Smart comparison refuses inactive, crossed, stale, non-Smart and historical owners; ordinary APIs stay separate', async () => {
  await withSmartComparisonProject('anima', 'inpaint', async (f) => {
    const request = activeRequest(f)
    const inactive = comparisonRequestFor(f.owner.document, {
      kind: 'smart-patch-variant',
      layerId: f.patch.id,
      variantId: f.sources[1].variant.id,
    })
    for (const invalid of [
      inactive,
      {
        ...request,
        owner: {
          kind: 'smart-patch-variant' as const,
          layerId: f.sources[0].variant.generationProvenance.layerSourceContext.layerId,
          variantId: f.sources[0].variant.id,
        },
      },
      {
        ...request,
        owner: {
          kind: 'smart-patch-variant' as const,
          layerId: f.patch.id,
          variantId: f.converted.id,
        },
      },
      { ...request, owner: { kind: 'raster' as const, layerId: f.patch.id } },
    ]) {
      await assert.rejects(f.service.getSmartResultComparisonData(f.tabId, invalid), {
        code: 'PROJECT_LAYER_NOT_FOUND',
      })
    }
    for (const invalid of [
      { ...request, documentRevision: randomUUID() },
      { ...request, assetSha256: '0'.repeat(64) },
    ]) {
      await assert.rejects(f.service.getSmartResultComparisonData(f.tabId, invalid), {
        code: 'PROJECT_TARGET_CHANGED',
      })
    }
    await assert.rejects(
      f.service.getSmartResultComparisonData(f.tabId, { ...request, documentId: randomUUID() }),
      { code: 'PROJECT_IDENTITY_MISMATCH' },
    )
    for (const invalid of [
      { ...request, owner: { ...request.owner, path: '/private' } },
      { ...request, documentRevision: 'invalid' },
    ]) {
      await assert.rejects(f.service.getSmartResultComparisonData(f.tabId, invalid), {
        code: 'PROJECT_INVALID_INPUT',
      })
    }
    await assert.rejects(f.service.getSmartResultComparisonData('invalid', request), {
      code: 'PROJECT_INVALID_INPUT',
    })
    for (const raster of [f.ordinary, f.imported]) {
      await assert.rejects(
        f.service.getSmartResultComparisonData(
          f.tabId,
          comparisonRequestFor(f.owner.document, { kind: 'raster', layerId: raster.id }),
        ),
        { code: 'PROJECT_INVALID_INPUT' },
      )
    }
    await assert.rejects(
      f.service.getRasterGenerationData(f.tabId, request.documentId, f.converted.id),
      { code: 'PROJECT_COMPARISON_UNSUPPORTED' },
    )
    assert.deepEqual(
      (await f.service.getRasterGenerationData(f.tabId, request.documentId, f.ordinary.id))
        .generationConfiguration?.size,
      { height: 8, width: 8 },
    )
    assert.equal(
      (await f.service.getRasterGenerationData(f.tabId, request.documentId, f.imported.id))
        .generationConfiguration,
      null,
    )
    for (const [id, kind] of [
      [f.converted.id, 'smart-patch'],
      [f.ordinary.id, 'raster'],
      [f.imported.id, undefined],
    ] as const) {
      const view = f.service.getOpenTabs()[0].layers.find((layer) => layer.id === id)
      assert.ok(view && view.kind !== 'smart-patch')
      assert.equal(view.resultComparisonSourceKind, kind)
      assert.equal(view.resultPresetSourceKind, kind)
      assert.equal(view.generationSettingsUnavailableReason, undefined)
    }
    await f.service.discardAndClose(f.tabId)
    await assert.rejects(f.service.getSmartResultComparisonData(f.tabId, request), {
      code: 'PROJECT_NOT_OPEN',
    })
  })
})

test('optional confirmed worker failure preserves readable settings and synchronous request capture', async () => {
  await withSmartComparisonProject('illustrious', 'outpaint', async (f) => {
    const request = activeRequest(f)
    const captured = structuredClone(request)
    const before = structuredClone(f.owner.document)
    const pending = f.service.getSmartResultComparisonData(f.tabId, request, async () => {
      request.documentId = randomUUID()
      request.documentRevision = randomUUID()
      request.owner.layerId = randomUUID()
      request.assetSha256 = '0'.repeat(64)
      throw new Error('Confirmed optional CPU startup failure')
    })
    const reply = await pending
    assert.ok(isSmartResultComparisonDataForRequest(reply, captured))
    assert.equal(reply.currentMode, null)
    assert.deepEqual(
      reply.generationConfiguration,
      f.sources[0].variant.generationProvenance.generationConfiguration,
    )
    assert.deepEqual(f.owner.document, before)
    assert.deepEqual(await comparisonStages(f), [])
  })
})

for (const race of [
  'active-switch',
  'edit-undo',
  'close-reopen',
  'asset',
  'containment',
] as const) {
  for (const failure of [false, true]) {
    test(`Smart comparison rechecks ${race} during awaited provider close, including confirmed failure=${failure}`, async () => {
      await withSmartComparisonProject('illustrious', 'inpaint', async (f) => {
        const request = activeRequest(f)
        let reachedClose = false
        let restoredRevision: string | undefined
        await assert.rejects(
          f.service.getSmartResultComparisonData(f.tabId, request, async () => {
            reachedClose = true
            assert.equal(
              (await comparisonStages(f)).length,
              1,
              'Capture survives until the provider settles.',
            )
            if (race === 'close-reopen') {
              await f.service.discardAndClose(f.tabId)
              assert.equal((await f.service.open(f.tabId)).kind, 'opened')
            } else if (race === 'edit-undo') {
              await f.service.updateGenerationDraft(f.tabId, {
                kind: 'positive-prompt',
                text: 'ABA edit during close',
              })
              await f.service.undo(f.tabId)
              restoredRevision = f.owner.document.documentRevision
              assert.equal(f.owner.document.documentRevision, request.documentRevision)
            } else {
              const document = structuredClone(f.owner.document)
              const assetSources: Record<string, { bytes: Buffer }> = {}
              const patch = document.layers.find((layer) => layer.id === f.patch.id)
              assert.ok(patch?.kind === 'smart-patch')
              if (race === 'active-switch') {
                patch.activeRasterSubLayerId = f.sources[1].variant.id
              } else if (race === 'containment') {
                document.layers = document.layers.filter((layer) => layer.id !== patch.id)
              } else {
                // An exact active asset substitution with valid corresponding provenance.
                const replacement = structuredClone(f.sources[1].variant)
                replacement.id = f.sources[0].variant.id
                replacement.asset.path = f.sources[0].variant.asset.path
                assetSources[replacement.asset.path] = { bytes: f.sources[1].bytes }
                patch.rasterSubLayers[0] = replacement
              }
              await f.owner.applyDocument(parseProjectDocumentV1(document), assetSources)
            }
            if (failure) {
              throw new Error('Confirmed teardown failure after owner changed')
            }
            return null
          }),
          { code: 'PROJECT_COMPARISON_CHANGED' },
        )
        if (race === 'edit-undo') {
          assert.equal(restoredRevision, request.documentRevision)
        }
        assert.equal(reachedClose, true)
        assert.deepEqual(await comparisonStages(f), [])
      })
    })
  }
}

test('unconfirmed worker exit propagates and retains capture scratch until its physical owner releases it', async () => {
  await withSmartComparisonProject('illustrious', 'inpaint', async (f) => {
    let stagingRoot = ''
    const failure = new ProjectWorkerError('WORKER_EXIT_UNCONFIRMED', 'Controlled live worker')
    await assert.rejects(
      f.service.getSmartResultComparisonData(f.tabId, activeRequest(f), async (use) =>
        use({
          composeTarget: async (input) => {
            stagingRoot = input.stagingRoot
            throw failure
          },
        }),
      ),
      (error) => error === failure,
    )
    assert.ok(stagingRoot)
    assert.ok(existsSync(stagingRoot))
    assert.ok((await readdir(stagingRoot)).some((name) => name.startsWith('layer-')))
    // This controlled worker has no physical child. In production the inspection owner fences
    // further work and retries close on shutdown; only confirmed exit releases these inputs.
    await rm(stagingRoot, { recursive: true })
    assert.deepEqual(await comparisonStages(f), [])
  })
})

test('comparison leaves pending Project prompt edits in their existing Undo group', async () => {
  await withSmartComparisonProject('illustrious', 'inpaint', async (f) => {
    const group = randomUUID()
    await f.service.updateGenerationDraft(
      f.tabId,
      { kind: 'positive-prompt', text: 'first' },
      group,
    )
    await f.service.getSmartResultComparisonData(f.tabId, activeRequest(f))
    await f.service.updateGenerationDraft(
      f.tabId,
      { kind: 'positive-prompt', text: 'second' },
      group,
    )
    const undone = await f.service.undo(f.tabId)
    assert.equal(undone.generationDraft.positivePrompt.text, 'Different current Canvas authoring')
    assert.equal(undone.canUndo, false)
    assert.equal(undone.dirty, false)
  })
})

const python = path.resolve('worker-python/.venv/bin/python')
function runtimeRoot(): string | null {
  if (!existsSync(python)) {
    return null
  }
  const actual = realpathSync(python).split(path.sep)
  const requested = python.split(path.sep)
  let common = 0
  while (actual[common] === requested[common] && common < requested.length) {
    common++
  }
  const root = requested.slice(0, common).join(path.sep)
  return root && root !== path.sep ? root : null
}

test(
  'Smart comparison uses actual CPU Project alpha, preserves inputs through close and rejects late close races',
  { skip: !runtimeRoot(), timeout: 60_000 },
  async () => {
    await withSmartComparisonProject('anima', 'outpaint', async (f) => {
      const owner = new ProjectTargetInspectionOwner({
        pythonExecutable: python,
        runtimeRoot: runtimeRoot()!,
        stagingBasePath: path.join(f.root, 'scratch'),
      })
      const provider: TargetInspectionWorkerProvider = (use) =>
        owner.read(async (worker) => (worker ? worker(use) : null), 'comparison')
      try {
        // The only visible input is the ordinary opaque 8x8 control. Hidden/locked Smart owners
        // still expose immutable settings; their selected Patch draft cannot determine Canvas mode.
        for (const [bbox, mode] of [
          [{ height: 8, width: 8, x: 0, y: 0 }, 'img2img'],
          [{ height: 8, width: 8, x: 100, y: 0 }, 'txt2img'],
          [{ height: 8, width: 8, x: 4, y: 0 }, 'outpaint'],
        ] as const) {
          await f.service.setPrimaryBbox(f.tabId, bbox)
          const reply = await f.service.getSmartResultComparisonData(
            f.tabId,
            activeRequest(f),
            provider,
          )
          assert.equal(reply.currentMode, mode)
          assert.equal(reply.modeUnavailableReason, null)
          assert.equal(reply.generationConfiguration.mode, 'outpaint')
          assert.deepEqual(await comparisonStages(f), [])
        }
        // An exact Undo recovers the saved revision. Returning to an unsaved historical state
        // deliberately receives a fresh revision, so establish the real ABA precondition first.
        await f.service.save(f.tabId)
        for (const race of ['active-switch', 'edit-undo', 'close-reopen'] as const) {
          const request = activeRequest(f)
          let closing = false
          let closeHookFailure: unknown
          const duringClose: TargetInspectionWorkerProvider = (use) =>
            owner.read(async (workerProvider) => {
              assert.ok(workerProvider)
              return workerProvider(async (worker) => {
                assert.ok(worker instanceof ProjectWorkerClient)
                const close = worker.close.bind(worker)
                worker.close = async () => {
                  worker.close = close
                  try {
                    closing = true
                    assert.equal((await comparisonStages(f)).length, 1)
                    if (race === 'close-reopen') {
                      await f.service.discardAndClose(f.tabId)
                      assert.equal((await f.service.open(f.tabId)).kind, 'opened')
                    } else if (race === 'edit-undo') {
                      await f.service.updateGenerationDraft(f.tabId, {
                        kind: 'positive-prompt',
                        text: 'CPU close ABA',
                      })
                      await f.service.undo(f.tabId)
                      assert.equal(f.owner.document.documentRevision, request.documentRevision)
                    } else {
                      const next = structuredClone(f.owner.document)
                      const patch = next.layers.find((layer) => layer.id === f.patch.id)
                      assert.ok(patch?.kind === 'smart-patch')
                      patch.activeRasterSubLayerId = f.sources[1].variant.id
                      await f.owner.applyDocument(parseProjectDocumentV1(next), {})
                    }
                  } catch (error) {
                    closeHookFailure = error
                    throw error
                  } finally {
                    await close()
                  }
                }
                return use(worker)
              })
            }, 'comparison')
          await assert.rejects(
            f.service.getSmartResultComparisonData(f.tabId, request, duringClose),
            { code: 'PROJECT_COMPARISON_CHANGED' },
            `Comparison must refuse the ${race} close race`,
          )
          assert.ifError(closeHookFailure)
          assert.equal(closing, true)
          assert.deepEqual(await comparisonStages(f), [])
          if (race === 'active-switch') {
            await f.service.undo(f.tabId)
          }
          if (race === 'close-reopen') {
            f.owner = f.service.getOpenDocumentForAcceptance(f.tabId)!
          }
        }
        let retained = ''
        let attempts = 0
        const exitFailure = new ProjectWorkerError(
          'WORKER_EXIT_UNCONFIRMED',
          'Controlled physical close refusal',
        )
        const refusesClose: TargetInspectionWorkerProvider = (use) =>
          owner.read(async (workerProvider) => {
            assert.ok(workerProvider)
            return workerProvider(async (worker) => {
              assert.ok(worker instanceof ProjectWorkerClient)
              const close = worker.close.bind(worker)
              worker.close = async () => {
                if (++attempts === 1) {
                  throw exitFailure
                }
                await close()
              }
              return await use({
                composeTarget: async (input) => {
                  retained = input.stagingRoot
                  const result = await worker.composeTarget(input)
                  assert.equal(
                    classifyTargetPngAlpha(
                      await readFile(input.targetPngPath),
                      input.bbox.width,
                      input.bbox.height,
                    ),
                    result.mode,
                  )
                  return result
                },
              })
            })
          }, 'comparison')
        await assert.rejects(
          f.service.getSmartResultComparisonData(f.tabId, activeRequest(f), refusesClose),
          (error) => error === exitFailure,
        )
        assert.ok(existsSync(retained))
        assert.equal(
          await owner.read(async () => assert.fail('Live child fences another read')),
          null,
        )
        await owner.shutdown()
        assert.equal(
          attempts,
          2,
          'Shutdown retry confirms physical child exit before releasing scratch.',
        )
        assert.ok(
          existsSync(retained),
          'The scratch lease is retained for explicit release, not silently swept.',
        )
        await rm(retained, { recursive: true })
      } finally {
        await owner.shutdown()
      }
    })
  },
)
