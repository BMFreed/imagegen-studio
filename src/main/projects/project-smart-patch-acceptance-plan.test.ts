import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import type { ProjectService } from './project-service.js'
import type { SmartPatchAcceptancePlanInput } from './project-smart-patch-acceptance-plan.js'
import type { SmartPatchWorldCandidateFixture } from './test-fixtures/smart-patch-world-candidate.js'

import { prepareSmartPatchAcceptancePlan } from './project-smart-patch-acceptance-plan.js'
import { projectVerifiedSmartPatchVariant } from './project-smart-patch-variant-projection.js'
import { smartPatchVariantMetadataFixture } from './test-fixtures/smart-patch-variant.js'
import {
  smartPatchWorldPng,
  withSmartPatchWorldCandidateFixture,
} from './test-fixtures/smart-patch-world-candidate.js'

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

/**
 * Actual publication/read/SQLite. Current source capture is a declared controlled collaborator;
 * actual ProjectService + native CPU source composition is covered in the execution integration.
 */
async function fixture(
  family: 'anima' | 'illustrious',
  use: (f: {
    base: SmartPatchWorldCandidateFixture
    input: SmartPatchAcceptancePlanInput
    owner: { document: ReturnType<typeof createEmptyProjectDocumentV1>; filePath: string }
    projects: Pick<
      ProjectService,
      'getOpenDocumentForAcceptance' | 'withCapturedSmartPatchGenerationInput'
    >
    setCaptureHook: (hook: () => Promise<void>) => void
    sourceCalls: () => number
  }) => Promise<void>,
) {
  await withSmartPatchWorldCandidateFixture(family, async (f) => {
    const candidate = await f.publish()
    const context = f.material.manifest.context
    const document = createEmptyProjectDocumentV1({
      documentId: context.documentId,
      documentRevision: randomUUID(),
      title: 'Plan fixture',
    })
    document.layers = [
      {
        activeRasterSubLayerId: null,
        blendMode: 'normal',
        boundingBox: { ...context.bbox },
        coherenceSettings: { ...context.coherenceSettings },
        generationDraft: structuredClone(context.generationDraft),
        id: context.layerId,
        internalResolution: { ...context.internalResolution },
        kind: 'smart-patch',
        locked: false,
        mask: structuredClone(context.mask),
        maskSettings: { ...context.maskSettings },
        name: 'Patch',
        opacity: 1,
        rasterSubLayers: [],
        visible: true,
      },
    ]
    const owner = { document, filePath: f.projectPath }
    let sourceCalls = 0
    let captureHook: () => Promise<void> = async () => undefined
    const projects = {
      getOpenDocumentForAcceptance: () => owner,
      withCapturedSmartPatchGenerationInput: async (
        _tab: string,
        _layer: string,
        consume: (capture: unknown) => Promise<unknown>,
      ) => {
        const capturedDocument = structuredClone(owner.document)
        return await consume({
          composeSource: async () => {
            sourceCalls++
            await captureHook()
            return { source: { ...f.material.manifest.files['source.png'] } }
          },
          document: capturedDocument,
        })
      },
    } as unknown as Pick<
      ProjectService,
      'getOpenDocumentForAcceptance' | 'withCapturedSmartPatchGenerationInput'
    >
    const input: SmartPatchAcceptancePlanInput = {
      acceptedAt: '2026-10-15T12:00:00.000Z',
      candidateIds: [candidate.candidateId],
      expectedAvailableIds: [candidate.candidateId],
      focusedCandidateId: candidate.candidateId,
      staging: f.patch,
      worker: {
        composeTarget: async () => {
          throw new Error('Controlled capture never invokes a CPU adapter')
        },
      },
    }
    await use({
      base: f,
      input,
      owner,
      projects,
      setCaptureHook: (hook) => {
        captureHook = hook
      },
      sourceCalls: () => sourceCalls,
    })
  })
}

async function sibling(f: SmartPatchWorldCandidateFixture) {
  const claimed = await f.queue.claimNextPendingSmartPatch()
  assert.ok(claimed)
  const root = await mkdtemp(path.join(f.scratch, 'smart-patch-request-'))
  const outputPath = path.join(root, 'world-result.png')
  await writeFile(outputPath, f.outputBytes, { flag: 'wx', mode: 0o600 })
  return await f.patch.publishGenerationCandidate({
    actualSeed: claimed.payload.item.item.seed,
    expectedProvisionalRoot: root,
    expectedStatusSequence: claimed.item.statusSequence,
    output: {
      byteSize: f.outputBytes.length,
      colorSpace: 'srgb',
      height: claimed.payload.context.bbox.height,
      iccSha256: (await f.patch.listVerifiedCandidates(claimed.item.localProjectKey))[0].image
        .iccSha256,
      path: outputPath,
      sha256: digest(f.outputBytes),
      width: claimed.payload.context.bbox.width,
    },
    provisionalOutputPath: outputPath,
    queueItemId: claimed.item.id,
  })
}

for (const family of ['illustrious', 'anima'] as const) {
  test(`private ${family} acceptance plan proposes portable frozen variant without consuming or editing any durable state`, async () => {
    await fixture(family, async (f) => {
      const before = structuredClone(f.owner.document)
      const candidateBefore = await f.base.patch.listVerifiedCandidates(
        f.base.nomination.localProjectKey,
      )
      const sql = async () => ({
        cursor: await f.base.database.db.selectFrom('generation_seed_cursor').selectAll().execute(),
        queue: await f.base.database.db.selectFrom('generation_queue_item').selectAll().execute(),
        receipts: await f.base.database.db
          .selectFrom('generation_candidate_receipt')
          .selectAll()
          .execute(),
      })
      const beforeSql = await sql()
      const plan = await prepareSmartPatchAcceptancePlan(
        f.projects,
        f.base.nomination.localProjectKey,
        f.input,
      )
      assert.equal(plan.kind, 'smart-patch-acceptance-plan')
      const { state, variant } = plan.proposedVariants[0]
      assert.equal(state.status, 'ready')
      assert.equal(plan.activeVariantId, variant.id)
      assert.deepEqual(variant.bbox, f.base.material.manifest.context.bbox)
      assert.equal(variant.generationProvenance.kind, `${family}-smart-patch`)
      assert.equal(
        variant.generationProvenance.generationConfiguration.model.predictionType,
        family === 'illustrious' ? 'v_prediction' : null,
        'Proposed provenance must record the executed checkpoint policy',
      )
      assert.equal('size' in variant.generationProvenance.generationConfiguration, false)
      assert.equal(
        'seedBehavior' in variant.generationProvenance.generationConfiguration.sampling,
        false,
      )
      const json = JSON.stringify(variant)
      assert.equal(
        json.includes(f.base.root),
        false,
        'No managed, project, recovery or scratch paths',
      )
      assert.equal(json.includes(f.base.nomination.localProjectKey), false)
      assert.deepEqual(f.owner.document, before)
      assert.deepEqual(await sql(), beforeSql)
      assert.deepEqual(
        await f.base.patch.listVerifiedCandidates(f.base.nomination.localProjectKey),
        candidateBefore,
      )
      assert.ok((await readFile(f.base.projectPath)).equals(f.base.originalProjectBytes))
    })
  })
}

test('private plan uses selected focus as anchor and otherwise stable completion order rather than caller selection order', async () => {
  await fixture('illustrious', async (f) => {
    const second = await sibling(f.base)
    const firstId = f.input.candidateIds[0]
    const input = {
      ...f.input,
      candidateIds: [second.candidateId, firstId],
      expectedAvailableIds: [second.candidateId, firstId],
      focusedCandidateId: second.candidateId,
    }
    const focused = await prepareSmartPatchAcceptancePlan(
      f.projects,
      f.base.nomination.localProjectKey,
      input,
    )
    assert.deepEqual(
      focused.proposedVariants.map(
        ({ variant }) => variant.generationProvenance.executionResultContext.candidateId,
      ),
      [firstId, second.candidateId],
    )
    assert.equal(focused.activeVariantId, focused.proposedVariants[1].variant.id)
    const unfocused = await prepareSmartPatchAcceptancePlan(
      f.projects,
      f.base.nomination.localProjectKey,
      { ...input, focusedCandidateId: randomUUID() },
    )
    assert.equal(unfocused.activeVariantId, unfocused.proposedVariants[0].variant.id)
  })
})

for (const block of ['hidden', 'locked', 'orphaned'] as const) {
  test(`private plan preserves ${block} target candidates and refuses before source composition`, async () => {
    await fixture('illustrious', async (f) => {
      const patch = f.owner.document.layers[0]
      if (block === 'hidden') {
        patch.visible = false
      } else if (block === 'locked') {
        patch.locked = true
      } else {
        f.owner.document.layers = []
      }
      await assert.rejects(
        prepareSmartPatchAcceptancePlan(f.projects, f.base.nomination.localProjectKey, f.input),
        {
          code: block === 'orphaned' ? 'SMART_PATCH_TARGET_ORPHANED' : 'SMART_PATCH_TARGET_BLOCKED',
        },
      )
      assert.equal(f.sourceCalls(), 0)
      assert.equal(
        (await f.base.patch.listVerifiedCandidates(f.base.nomination.localProjectKey)).length,
        1,
      )
    })
  })
}

test('private plan retains frozen output and records changed live mask blur as outdated', async () => {
  await fixture('illustrious', async (f) => {
    const patch = f.owner.document.layers[0]
    assert.equal(patch.kind, 'smart-patch')
    if (patch.kind !== 'smart-patch') {
      assert.fail('Patch fixture')
    }
    patch.maskSettings = {
      blur: f.base.material.manifest.context.maskSettings.blur + 1,
      padding: 400,
    }
    const plan = await prepareSmartPatchAcceptancePlan(
      f.projects,
      f.base.nomination.localProjectKey,
      f.input,
    )
    const proposal = plan.proposedVariants[0]
    assert.equal(proposal.state.status, 'outdated')
    assert.deepEqual(proposal.state.changedInputs, ['mask-blur'])
    assert.equal(
      proposal.variant.generationProvenance.layerSourceContext.maskBlur,
      f.base.material.manifest.context.maskSettings.blur,
    )
  })
})

test('private plan refuses late Project revision change after actual candidate validation and source progress', async () => {
  await fixture('illustrious', async (f) => {
    let release!: () => void
    let entered!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const progress = new Promise<void>((resolve) => {
      entered = resolve
    })
    f.setCaptureHook(async () => {
      entered()
      await gate
    })
    const run = prepareSmartPatchAcceptancePlan(
      f.projects,
      f.base.nomination.localProjectKey,
      f.input,
    )
    await progress
    f.owner.document.documentRevision = randomUUID()
    release()
    await assert.rejects(run, { code: 'PROJECT_DOCUMENT_CHANGED' })
    assert.equal(
      (await f.base.patch.listVerifiedCandidates(f.base.nomination.localProjectKey)).length,
      1,
    )
  })
})

test('private plan snapshots caller selection and staging methods before asynchronous candidate discovery', async () => {
  await fixture('illustrious', async (f) => {
    let release!: () => void
    let entered!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const progress = new Promise<void>((resolve) => {
      entered = resolve
    })
    const ids = [...f.input.candidateIds]
    const list = f.base.patch.listVerifiedCandidates.bind(f.base.patch)
    const request = {
      ...f.input,
      candidateIds: ids,
      expectedAvailableIds: [...ids],
      staging: {
        listVerifiedCandidates: async (key: string) => {
          entered()
          await gate
          return await list(key)
        },
        readVerifiedCandidate: f.base.patch.readVerifiedCandidate.bind(f.base.patch),
      },
    }
    const run = prepareSmartPatchAcceptancePlan(
      f.projects,
      f.base.nomination.localProjectKey,
      request,
    )
    await progress
    ids[0] = randomUUID()
    request.expectedAvailableIds[0] = randomUUID()
    request.staging.readVerifiedCandidate = async () => {
      throw new Error('Late retarget')
    }
    release()
    const plan = await run
    assert.equal(plan.candidateReads[0].candidateId, f.input.candidateIds[0])
  })
})

test('private projection snapshots buffers before await and refuses wrong seed or truthfully rehashed wrong alpha', async () => {
  await fixture('illustrious', async (f) => {
    const read = await f.base.patch.readVerifiedCandidate(f.base.nomination)
    assert.ok(read)
    const projection = projectVerifiedSmartPatchVariant({
      acceptedAt: f.input.acceptedAt,
      read,
      variantId: randomUUID(),
    })
    read.imagePngBytes.fill(0)
    read.finalMaskPngBytes.fill(0)
    read.candidate.actualSeed = 99
    assert.equal(
      (await projection).generationProvenance.generationConfiguration.sampling.actualSeed,
      0,
    )
    const valid = await f.base.patch.readVerifiedCandidate(f.base.nomination)
    assert.ok(valid)
    const wrongSeed = structuredClone(valid)
    wrongSeed.candidate.actualSeed = 1
    await assert.rejects(
      projectVerifiedSmartPatchVariant({
        acceptedAt: f.input.acceptedAt,
        read: { ...valid, candidate: wrongSeed.candidate },
        variantId: randomUUID(),
      }),
      { code: 'SMART_PATCH_VARIANT_INVALID' },
    )
    const wrongAlpha = smartPatchWorldPng(true)
    valid.imagePngBytes = wrongAlpha
    valid.candidate.image.byteSize = wrongAlpha.length
    valid.candidate.image.sha256 = digest(wrongAlpha)
    await assert.rejects(
      projectVerifiedSmartPatchVariant({
        acceptedAt: f.input.acceptedAt,
        read: valid,
        variantId: randomUUID(),
      }),
      { code: 'SMART_PATCH_VARIANT_INVALID' },
    )
  })
})

test('private plan rejects an unreviewed available set and a foreign document without consuming candidates', async () => {
  await fixture('illustrious', async (f) => {
    await assert.rejects(
      prepareSmartPatchAcceptancePlan(f.projects, f.base.nomination.localProjectKey, {
        ...f.input,
        expectedAvailableIds: [],
      }),
      { code: 'SMART_PATCH_SELECTION_STALE' },
    )
    f.owner.document.documentId = randomUUID()
    await assert.rejects(
      prepareSmartPatchAcceptancePlan(f.projects, f.base.nomination.localProjectKey, f.input),
      { code: 'SMART_PATCH_SELECTION_INVALID' },
    )
    assert.equal(f.sourceCalls(), 0)
    assert.equal(
      (await f.base.patch.listVerifiedCandidates(f.base.nomination.localProjectKey)).length,
      1,
    )
  })
})

test('private plan refuses a new completed sibling during held source composition and preserves both candidates', async () => {
  await fixture('illustrious', async (f) => {
    let release!: () => void
    let entered!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const progress = new Promise<void>((resolve) => {
      entered = resolve
    })
    f.setCaptureHook(async () => {
      entered()
      await gate
    })
    const run = prepareSmartPatchAcceptancePlan(
      f.projects,
      f.base.nomination.localProjectKey,
      f.input,
    )
    await progress
    await sibling(f.base)
    release()
    await assert.rejects(run, { code: 'SMART_PATCH_SELECTION_STALE' })
    assert.equal(
      (await f.base.patch.listVerifiedCandidates(f.base.nomination.localProjectKey)).length,
      2,
    )
  })
})

test('private projection records actual library prediction while preserving an unset authored prediction snapshot', async () => {
  await fixture('illustrious', async (f) => {
    const read = await f.base.patch.readVerifiedCandidate(f.base.nomination)
    assert.ok(read)
    // Declared projector-boundary metadata control: a valid frozen request can carry an unset
    // authored prediction while its actual exact checkpoint policy is already v_prediction.
    read.candidate.payload.context.generationDraft.model!.predictionType = null
    read.candidate.frozenSmartPatchPayloadJson = JSON.stringify(read.candidate.payload)
    read.candidate.frozenPayloadSha256 = digest(
      Buffer.from(read.candidate.frozenSmartPatchPayloadJson),
    )
    const proposed = await projectVerifiedSmartPatchVariant({
      acceptedAt: f.input.acceptedAt,
      read,
      variantId: randomUUID(),
    })
    assert.equal(
      proposed.generationProvenance.generationConfiguration.model.predictionType,
      'v_prediction',
    )
    assert.equal(
      proposed.generationProvenance.layerSourceContext.generationDraft.model!.predictionType,
      null,
    )
  })
})

test('private planner retries a proposed UUID already owned by an inactive stored variant', async () => {
  await fixture('illustrious', async (f) => {
    const target = f.owner.document.layers[0]
    assert.ok(target.kind === 'smart-patch')
    const stored = smartPatchVariantMetadataFixture('illustrious')
    stored.generationProvenance.layerSourceContext.layerId = target.id
    stored.generationProvenance.layerSourceContext.sourceDocumentId = f.owner.document.documentId
    const active = smartPatchVariantMetadataFixture('anima')
    active.generationProvenance.layerSourceContext.layerId = target.id
    active.generationProvenance.layerSourceContext.sourceDocumentId = f.owner.document.documentId
    target.rasterSubLayers = [stored, active]
    target.activeRasterSubLayerId = active.id
    const nextId = randomUUID()
    let calls = 0
    f.input.createVariantId = () => (++calls === 1 ? stored.id : nextId)
    const plan = await prepareSmartPatchAcceptancePlan(
      f.projects,
      f.base.nomination.localProjectKey,
      f.input,
    )
    assert.equal(calls, 2, 'An inactive variant UUID remains occupied.')
    assert.equal(plan.proposedVariants[0].variant.id, nextId)
    assert.equal(target.activeRasterSubLayerId, active.id)
    assert.deepEqual(target.rasterSubLayers, [stored, active])
  })
})
