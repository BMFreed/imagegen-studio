import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { access, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import type { GenerationQueueTestHooks } from './generation-queue.js'
import type { ProjectRegionalGenerationCoordinator } from './project-regional-generation-coordinator.js'
import type { RegionalWorkerInput } from './regional-worker-request.js'
import type { RegionalProjectFixture } from './test-fixtures/regional-project.js'

import { GenerationQueueRepository } from './generation-queue.js'
import { GenerationStagingRepository } from './generation-staging.js'
import { readIgsPackage } from './igs-package.js'
import { inspectTemporaryRecovery } from './project-temporary-recovery.js'
import {
  createRegionalProjectFixture,
  regionalProjectDeferred,
  regionalProjectDigest,
} from './test-fixtures/regional-project.js'

type SubmitInput = Parameters<ProjectRegionalGenerationCoordinator['submit']>[1]

async function withProject(
  use: (f: RegionalProjectFixture) => Promise<void>,
  options: Parameters<typeof createRegionalProjectFixture>[0] = {},
) {
  const f = await createRegionalProjectFixture(options)
  try {
    await use(f)
  } finally {
    await f.close()
  }
}

async function row(f: RegionalProjectFixture, id: string) {
  const value = await f.db
    .selectFrom('generation_queue_item')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst()
  assert.ok(value)
  return value
}

async function rows(f: RegionalProjectFixture) {
  return await f.db.selectFrom('generation_queue_item').selectAll().orderBy('created_at').execute()
}

async function reached<T>(
  operation: Promise<T>,
  barrier: ReturnType<typeof regionalProjectDeferred>,
) {
  await Promise.race([
    barrier.promise,
    operation.then(() => assert.fail('Operation completed before the held boundary.')),
  ])
}

async function noAdmission(f: RegionalProjectFixture, input = f.input()) {
  const compose = f.calls.compose.length
  const before = await rows(f)
  await assert.rejects(f.coordinator.submit(f.tabId, input))
  assert.equal(f.calls.compose.length, compose, 'Refusal precedes target work.')
  assert.deepEqual(await rows(f), before, 'Refusal publishes no queue row.')
  assert.equal((await f.staging.listVerifiedRegionalCandidates(f.tabId)).length, 0)
}

const closeOptions = { confirmCloseImpact: true, discardDocument: true }

// Boundary: genuine Project submit -> owned queue -> private candidate. Removing snapshot/owned
// file publication, using a caller recipe, or admitting results into public discovery must fail.
test('saved and reopened Project submits one owned soft-alpha job and completes after later Project edits', async () => {
  await withProject(async (f) => {
    const original = structuredClone(f.document())
    const savedBytes = await readFile(f.packagePath)
    const queued = await f.coordinator.submit(f.tabId, f.input())
    assert.equal((await row(f, queued.id)).operation, 'illustrious-regional')
    assert.equal((await row(f, queued.id)).document_id, original.documentId)
    assert.equal((await rows(f)).length, 1)
    assert.equal(f.calls.compose.length, 1)
    const verified = await f.queue.loadVerifiedRegionalInput(queued.id)
    assert.ok(
      Buffer.from(verified.input.recipe.regions[0].coverage.alpha).equals(Buffer.from(f.alpha)),
    )
    assert.equal(verified.input.recipe.item.seed, 123)
    assert.equal(verified.input.recipe.item.prompts.positive, 'global positive')
    for (const composed of f.calls.compose) {
      await assert.rejects(access(composed.stagingRoot), { code: 'ENOENT' })
    }
    assert.deepEqual(f.document(), original, 'Submit does not apply or autosave generation output.')
    assert.ok((await readFile(f.packagePath)).equals(savedBytes))
    await f.edit((document) => {
      document.regionalGuidance = []
      document.generationDraft.positivePrompt.text = 'later global text'
      document.generationDraft.seed.value = 987
    })
    await f.projects.save(f.tabId)
    assert.equal((await readIgsPackage(f.packagePath)).project.regionalGuidance?.length, 0)
    const edited = structuredClone(f.document())
    const result = await f.coordinator.runNext(
      f.transport({
        executeCurrentCanvasRegional: async (input) => {
          assert.ok(
            Buffer.from(input.recipe.regions[0].coverage.alpha).equals(Buffer.from(f.alpha)),
          )
          assert.equal(input.recipe.regions[0].positive?.text, 'regional subject')
          assert.equal(input.request.job.sampling.seed, 123)
          await access(input.request.job.target.path)
          return f.resultFor(input)
        },
      }),
    )
    assert.equal(result.kind, 'completed')
    if (result.kind !== 'completed') {
      assert.fail('Expected a durable private candidate.')
    }
    assert.ok((await readFile(result.candidate.assetPath)).equals(f.outputBytes))
    assert.deepEqual(f.document(), edited)
    assert.equal((await f.staging.listVerifiedRegionalCandidates(f.tabId)).length, 1)
    assert.equal((await f.staging.listVerifiedCandidates(f.tabId)).length, 0)
    assert.deepEqual(await inspectTemporaryRecovery(f.lifecycle, f.tabId), {
      completedCandidateCount: 0,
      kind: 'available',
    })
    assert.equal(await f.staging.readLastActualSeed(f.tabId, original.documentId), 123)
  })
})

test('submit snapshots caller coverage, ready, owner and composition method before waiting on the Project gate', async () => {
  await withProject(async (f) => {
    const entered = regionalProjectDeferred()
    const release = regionalProjectDeferred()
    const held = f.gate.run(f.tabId, async () => {
      entered.resolve()
      await release.promise
    })
    await entered.promise
    const input = f.input()
    const alpha = Uint8Array.from({ length: 64 }, () => 128)
    input.globalPositiveCoverage = { alpha, height: 8, kind: 'alpha8', width: 8 }
    const worker = { composeTarget: f.compositionWorker.composeTarget }
    input.compositionWorker = worker
    const submitting = f.coordinator.submit(f.tabId, input)
    alpha.fill(0)
    input.documentRevision = randomUUID()
    input.ready.runtimeProfile = 'linux-cpu'
    input.positivePooledSourceId = 'caller mutation'
    worker.composeTarget = async () =>
      assert.fail('Composition method was captured before waiting.')
    release.resolve()
    await held
    const queued = await submitting
    const verified = await f.queue.loadVerifiedRegionalInput(queued.id)
    assert.equal(verified.input.positivePooledSourceId, 'current-canvas')
    assert.equal(verified.input.globalPositiveCoverage.kind, 'alpha8')
    if (verified.input.globalPositiveCoverage.kind !== 'alpha8') {
      assert.fail('Expected owned coverage.')
    }
    assert.ok(verified.input.globalPositiveCoverage.alpha.every((value) => value === 128))
    assert.equal(f.calls.compose.length, 1)
  })
})

test('submit validates both expected owner fields under the gate before capture', async () => {
  await withProject(async (f) => {
    await noAdmission(f, { ...f.input(), documentId: randomUUID() })
    await noAdmission(f, { ...f.input(), documentRevision: randomUUID() })
    const stale = f.input()
    const entered = regionalProjectDeferred()
    const release = regionalProjectDeferred()
    const held = f.gate.run(f.tabId, async () => {
      entered.resolve()
      await release.promise
    })
    await entered.promise
    const submitting = f.coordinator.submit(f.tabId, stale)
    const rejected = assert.rejects(submitting)
    await f.edit((document) => {
      document.generationDraft.positivePrompt.text = 'new current owner'
    })
    release.resolve()
    await held
    await rejected
    assert.equal(f.calls.compose.length, 0)
    assert.equal((await rows(f)).length, 0)
  })
})

test('private opt-in and qualified CUDA capability are mandatory before target work', async () => {
  await withProject(async (f) => {
    await noAdmission(f, { ...f.input(), optIn: 'public' } as unknown as SubmitInput)
    await noAdmission(f, {
      ...f.input(),
      ready: { ...f.input().ready, runtimeProfile: 'linux-cpu' },
    })
    await noAdmission(f, {
      ...f.input(),
      ready: {
        ...f.input().ready,
        capabilities: f
          .input()
          .ready.capabilities.filter((entry) => entry !== 'private-current-canvas-regional-v1'),
      },
    })
    await noAdmission(f, { ...f.input(), layout: 'positive-only' })
    await noAdmission(f, {
      ...f.input(),
      globalPositiveCoverage: {
        alpha: new Uint8Array(4096),
        height: 64,
        kind: 'alpha8',
        width: 64,
      },
    })
  })
})

test('enabled-region reference images refuse but disabled-region owned attachments remain dormant', async () => {
  await withProject(async (f) => {
    const thumbnail = await readFile(
      path.resolve('src/main/projects/test-fixtures/candidate-thumbnail-64x64.webp'),
    )
    const id = randomUUID()
    const asset = {
      bytes: f.outputBytes.length,
      height: 64,
      path: `assets/regional-references/${id}/${regionalProjectDigest(f.outputBytes)}.png`,
      sha256: regionalProjectDigest(f.outputBytes),
      width: 64,
    }
    const preview = {
      bytes: thumbnail.length,
      height: 64,
      path: `assets/regional-references/${id}/${regionalProjectDigest(thumbnail)}.webp`,
      sha256: regionalProjectDigest(thumbnail),
      width: 64,
    }
    const co = f.projects.getOpenDocumentForAcceptance(f.tabId)!
    const attached = structuredClone(co.document)
    attached.regionalGuidance![0].referenceImages = [
      { asset, id, name: 'Owned dormant reference', sourceFormat: 'PNG', thumbnail: preview },
    ]
    await co.applyDocument(attached, {
      [asset.path]: { bytes: f.outputBytes },
      [preview.path]: { bytes: thumbnail },
    })
    await noAdmission(f)
    await f.edit((document) => {
      document.regionalGuidance![0].enabled = false
    })
    const before = structuredClone(f.document())
    const queued = await f.coordinator.submit(f.tabId, f.input())
    const verified = await f.queue.loadVerifiedRegionalInput(queued.id)
    assert.equal(verified.input.recipe.regions.length, 0)
    assert.deepEqual(f.document(), before)
    assert.equal(f.document().regionalGuidance![0].referenceImages![0].asset.sha256, asset.sha256)
  })
})

const unsupported: { change: (document: IgsProjectDocumentV1) => void; name: string }[] = [
  {
    change: (d) => {
      d.generationDraft.vaePrecision = 'FP32'
    },
    name: 'manual FP32 VAE',
  },
  {
    change: (d) => {
      d.generationDraft.sampling.sampler = 'DPM++ 2M'
    },
    name: 'non-Euler scheduler',
  },
  {
    change: (d) => {
      d.generationDraft.loras = [
        { enabled: true, resource: { ...d.generationDraft.model!, kind: 'lora' }, weight: 1 },
      ]
    },
    name: 'effective LoRA',
  },
  {
    change: (d) => {
      d.generationDraft.positivePrompt.text = '{one|two}'
    },
    name: 'dynamic global text',
  },
  {
    change: (d) => {
      d.regionalGuidance![0].prompts!.positive!.text = '{one|two}'
    },
    name: 'dynamic regional text',
  },
  {
    change: (d) => {
      d.regionalGuidance = Array.from({ length: 4 }, (_, i) => ({
        ...structuredClone(d.regionalGuidance![0]),
        id: randomUUID(),
        mask: { asset: null, id: randomUUID(), revision: 0 },
        name: `Region ${i}`,
      }))
    },
    name: 'four enabled regions',
  },
]
for (const refusal of unsupported) {
  test(`private Project profile refuses ${refusal.name} before target work`, async () => {
    await withProject(async (f) => {
      await f.edit(refusal.change)
      await noAdmission(f)
    })
  })
}

test('active global TI refuses before compose while a dormant global sidecar remains authored', async () => {
  await withProject(async (f) => {
    await f.edit((d) => {
      d.generationDraft.positivePrompt.embeddingRefs = [structuredClone(f.embedding)]
    })
    const queued = await f.coordinator.submit(f.tabId, f.input())
    const verified = await f.queue.loadVerifiedRegionalInput(queued.id)
    assert.equal(verified.input.recipe.globalPrompts.positive.embeddingRefs.length, 0)
    assert.equal(f.document().generationDraft.positivePrompt.embeddingRefs.length, 1)
    assert.equal(verified.input.recipe.globalEmbeddings?.positive.length, 0)
    const resolvedDormant = f.calls.embedding
    await f.edit((d) => {
      d.generationDraft.positivePrompt.text = f.embedding.token
    })
    await noAdmission(f)
    assert.equal(
      f.calls.embedding,
      resolvedDormant,
      'Effective global TI refuses before further resource resolution.',
    )
  })
})

test('constructor captures regional resolver methods and freezes effective TI in the recipe only', async () => {
  await withProject(async (f) => {
    await f.edit((d) => {
      d.regionalGuidance![0].prompts!.positive = {
        embeddingRefs: [structuredClone(f.embedding)],
        text: f.embedding.token,
      }
    })
    f.models.resolveVerifiedGenerationEmbeddingForPlan = async () =>
      assert.fail('Coordinator and private processor retain their captured resolver method.')
    f.models.assertNoUnboundGenerationEmbeddings = async () =>
      assert.fail('Coordinator and private processor retain their captured prompt validator.')
    const queued = await f.coordinator.submit(f.tabId, f.input())
    const verified = await f.queue.loadVerifiedRegionalInput(queued.id)
    assert.equal(
      verified.input.recipe.regions[0].embeddings?.positive[0].reference.fileSha256,
      f.embedding.resource.fileSha256,
    )
    assert.equal(verified.payload.context.embeddings?.positive.length ?? 0, 0)
    assert.ok(f.calls.embedding > 0)
    const completed = await f.coordinator.runNext(
      f.transport({
        executeCurrentCanvasRegional: async (input) => {
          assert.ok(input.compositionProfile !== 'invoke-krea2-global-support-v1')
          assert.equal(input.recipe.regions[0].positive?.text, f.embedding.token)
          assert.equal(input.recipe.regions[0].embeddings?.positive[0].token, f.embedding.token)
          assert.equal(input.request.job.embeddings?.positive.length ?? 0, 0)
          return f.resultFor(input)
        },
      }),
    )
    assert.equal(completed.kind, 'completed')
  })
})

test('recipe distinguishes absent positive, explicit empty negative and inherited dormant negative', async () => {
  await withProject(async (f) => {
    await f.edit((d) => {
      const first = d.regionalGuidance![0]
      first.prompts = {
        negative: { embeddingRefs: [structuredClone(f.embedding)], text: '{dormant|negative}' },
        positive: null,
        useGlobalNegativePrompt: true,
      }
      d.regionalGuidance!.push({
        ...structuredClone(first),
        id: randomUUID(),
        mask: { asset: null, id: randomUUID(), revision: 0 },
        prompts: {
          negative: { embeddingRefs: [], text: '' },
          positive: { embeddingRefs: [], text: '' },
          useGlobalNegativePrompt: false,
        },
      })
    })
    const queued = await f.coordinator.submit(f.tabId, f.input())
    const { input: regional } = await f.queue.loadVerifiedRegionalInput(queued.id)
    const [inherited, explicit] = regional.recipe.regions
    assert.equal(inherited.positive, null)
    assert.equal(inherited.negative.source, 'current-canvas')
    assert.equal(inherited.negative.prompt.text, 'global negative')
    assert.equal(explicit.positive?.text, '')
    assert.equal(explicit.negative.source, 'regional')
    assert.equal(explicit.negative.prompt.text, '')
    assert.equal(f.document().regionalGuidance![0].prompts!.negative!.text, '{dormant|negative}')
  })
})

for (const phase of ['checkpoint', 'compose'] as const) {
  for (const change of ['edit-undo', 'close-reopen'] as const) {
    test(`${change} at ${phase} await invalidates the pinned owner even when revision returns`, async () => {
      await withProject(async (f) => {
        const entered = regionalProjectDeferred()
        const release = regionalProjectDeferred()
        f.hooks[phase] = async () => {
          entered.resolve()
          await release.promise
        }
        const before = f.owner()
        const original = f.projects.getOpenDocumentForAcceptance(f.tabId)
        const submitting = f.coordinator.submit(f.tabId, f.input())
        const rejected = assert.rejects(submitting)
        try {
          await reached(submitting, entered)
          if (change === 'edit-undo') {
            await f.edit((document) => {
              document.regionalGuidance![0].name = 'ABA temporary edit'
            })
            await f.projects.undo(f.tabId)
          } else {
            await f.projects.close(f.tabId)
            assert.equal((await f.projects.open(f.tabId)).kind, 'opened')
            assert.notEqual(f.projects.getOpenDocumentForAcceptance(f.tabId), original)
          }
          assert.deepEqual(f.owner(), before, 'Revision equality is deliberately restored.')
        } finally {
          release.resolve()
        }
        await rejected
        assert.equal((await rows(f)).length, 0)
      })
    })
  }
}

test('an owner change after queue files publish refuses the precommit row and removes the owned input', async () => {
  let fixture: RegionalProjectFixture | undefined
  const hooks: GenerationQueueTestHooks = {
    afterInputPublish: async () => {
      await fixture!.edit((d) => {
        d.regionalGuidance![0].name = 'Changed after publication'
      })
    },
  }
  await withProject(
    async (f) => {
      fixture = f
      await assert.rejects(f.coordinator.submit(f.tabId, f.input()))
      assert.equal((await rows(f)).length, 0)
      assert.equal((await f.queue.listUnfinishedByProject(f.tabId)).length, 0)
      assert.equal((await f.staging.listVerifiedRegionalCandidates(f.tabId)).length, 0)
      assert.deepEqual(
        await readdir(path.join(f.root, 'generation-inputs')),
        [],
        'Rejected owned files are removed before handoff.',
      )
    },
    { queueHooks: hooks },
  )
})

test('an owner change after commit cancels only the newly admitted row', async () => {
  let fixture: RegionalProjectFixture | undefined
  let mutate = false
  const hooks: GenerationQueueTestHooks = {
    afterBatchCommit: async () => {
      if (mutate) {
        await fixture!.edit((d) => {
          d.regionalGuidance![0].name = 'Changed after SQL commit'
        })
      }
    },
  }
  await withProject(
    async (f) => {
      fixture = f
      const older = await f.coordinator.submit(f.tabId, f.input())
      mutate = true
      await assert.rejects(f.coordinator.submit(f.tabId, f.input()))
      const all = await rows(f)
      assert.equal(all.length, 2)
      assert.equal((await row(f, older.id)).status, 'pending')
      assert.equal(all.find((item) => item.id !== older.id)!.status, 'canceled')
    },
    { queueHooks: hooks },
  )
})

test('Project close waits for the shared submit gate and cancels only its Project pending work', async () => {
  await withProject(async (f) => {
    const sibling = await f.createProject('Protected sibling')
    const siblingQueued = await f.coordinator.submit(sibling.tabId, f.input(sibling.tabId))
    const entered = regionalProjectDeferred()
    const release = regionalProjectDeferred()
    f.hooks.compose = async () => {
      entered.resolve()
      await release.promise
    }
    const submitting = f.coordinator.submit(f.tabId, f.input())
    await reached(submitting, entered)
    let closed = false
    const closing = f.generationClose.close(f.tabId, closeOptions).then(() => {
      closed = true
    })
    await Promise.resolve()
    assert.equal(closed, false)
    assert.ok(f.projects.getOpenDocumentForAcceptance(f.tabId))
    release.resolve()
    const queued = await submitting
    await closing
    assert.equal((await row(f, queued.id)).status, 'canceled')
    assert.equal((await row(f, siblingQueued.id)).status, 'pending')
    assert.ok(f.projects.getOpenDocumentForAcceptance(sibling.tabId))
    assert.equal(f.projects.getOpenDocumentForAcceptance(f.tabId), null)
  })
})

test('private completed candidate affects close while Results/Home stay empty and tombstone recovery hides it', async () => {
  let failCleanup = true
  await withProject(
    async (f) => {
      await f.coordinator.submit(f.tabId, f.input())
      const result = await f.coordinator.runNext(f.transport())
      assert.equal(result.kind, 'completed')
      assert.deepEqual(await f.generationClose.getCloseImpact(f.tabId), {
        completedCandidateCount: 1,
        generationStorageUnavailable: false,
        unfinishedJobCount: 0,
      })
      await assert.rejects(
        f.generationClose.close(f.tabId, { confirmCloseImpact: false, discardDocument: false }),
        { code: 'PROJECT_CLOSE_CONFIRMATION_REQUIRED' },
      )
      assert.equal((await f.lifecycle.listVerifiedCandidates(f.tabId)).length, 0)
      assert.equal((await f.lifecycle.listOwnedCandidates(f.tabId)).length, 1)
      await f.generationClose.close(f.tabId, closeOptions)
      assert.equal((await f.staging.listVerifiedRegionalCandidates(f.tabId)).length, 0)
      failCleanup = false
      const recovered = new GenerationStagingRepository(f.db, f.root)
      await recovered.recoverAfterRestart()
      assert.equal((await recovered.listVerifiedRegionalCandidates(f.tabId)).length, 0)
      assert.deepEqual(await inspectTemporaryRecovery(f.lifecycle, f.tabId), {
        completedCandidateCount: 0,
        kind: 'available',
      })
    },
    {
      stagingHooks: {
        beforeSessionCleanup: async () => {
          if (failCleanup) {
            throw new Error('Controlled post-tombstone cleanup failure')
          }
        },
      },
    },
  )
})

test('running Project close retains its slot until physical exit and ignores a late worker result', async () => {
  await withProject(async (f) => {
    const queued = await f.coordinator.submit(f.tabId, f.input())
    const entered = regionalProjectDeferred()
    const late = regionalProjectDeferred()
    const closingPeer = regionalProjectDeferred()
    const exited = regionalProjectDeferred()
    let dispatched: RegionalWorkerInput | undefined
    const run = f.coordinator.runNext(
      f.transport({
        close: async () => {
          closingPeer.resolve()
          await exited.promise
        },
        executeCurrentCanvasRegional: async (input) => {
          assert.ok(input.compositionProfile !== 'invoke-krea2-global-support-v1')
          dispatched = input
          entered.resolve()
          await late.promise
          return f.resultFor(input)
        },
      }),
    )
    await reached(run, entered)
    const closing = f.generationClose.close(f.tabId, closeOptions)
    await closingPeer.promise
    assert.equal((await row(f, queued.id)).status, 'running')
    assert.ok(f.projects.getOpenDocumentForAcceptance(f.tabId))
    assert.equal(await f.queue.claimNextPendingRegional(), null)
    exited.resolve()
    await closing
    assert.equal((await run).kind, 'canceled')
    late.resolve()
    await Promise.resolve()
    assert.ok(dispatched)
    assert.equal((await row(f, queued.id)).status, 'canceled')
    assert.equal(await f.staging.hasPublicationReceipt(queued.id), false)
    assert.equal((await f.staging.listVerifiedRegionalCandidates(f.tabId)).length, 0)
  })
})

test('unconfirmed regional physical exit keeps the Project and fence for explicit close retry', async () => {
  await withProject(async (f) => {
    const queued = await f.coordinator.submit(f.tabId, f.input())
    const entered = regionalProjectDeferred()
    const late = regionalProjectDeferred()
    let confirmed = false
    const run = f.coordinator.runNext(
      f.transport({
        close: async () => {
          if (!confirmed) {
            throw new Error('Controlled unconfirmed peer exit')
          }
        },
        executeCurrentCanvasRegional: async (input) => {
          entered.resolve()
          await late.promise
          return f.resultFor(input)
        },
      }),
    )
    const runSettled = run.catch((error: unknown) => error)
    await reached(run, entered)
    await assert.rejects(f.generationClose.close(f.tabId, closeOptions))
    assert.ok(f.projects.getOpenDocumentForAcceptance(f.tabId))
    assert.equal((await row(f, queued.id)).status, 'running')
    await assert.rejects(f.coordinator.submit(f.tabId, f.input()))
    confirmed = true
    await f.generationClose.close(f.tabId, closeOptions)
    await runSettled
    late.resolve()
    assert.equal((await row(f, queued.id)).status, 'canceled')
    assert.equal(await f.staging.hasPublicationReceipt(queued.id), false)
  })
})

test('restart cancellation retries frozen recipe after regional edits and source-row pruning', async () => {
  await withProject(async (f) => {
    const queued = await f.coordinator.submit(f.tabId, f.input())
    const claimed = await f.queue.claimNextPendingRegional()
    assert.equal(claimed?.item.id, queued.id)
    const recoveredQueue = new GenerationQueueRepository(f.db, f.root)
    await recoveredQueue.recoverAfterRestart()
    const recoveredStaging = new GenerationStagingRepository(f.db, f.root)
    await recoveredStaging.recoverAfterRestart()
    const canceled = await row(f, queued.id)
    assert.equal(canceled.status, 'canceled')
    assert.equal(canceled.error_code, 'APP_RESTART')
    await assert.rejects(
      f.coordinator.retry(f.tabId, {
        expectedStatusSequence: canceled.status_sequence + 1,
        optIn: 'private-current-canvas-regional-v1',
        queueItemId: queued.id,
      }),
    )
    const sibling = await f.createProject('Retry identity control')
    await assert.rejects(
      f.coordinator.retry(sibling.tabId, {
        expectedStatusSequence: canceled.status_sequence,
        optIn: 'private-current-canvas-regional-v1',
        queueItemId: queued.id,
      }),
    )
    await f.edit((d) => {
      d.regionalGuidance = []
      d.generationDraft.positivePrompt.text = 'later edit'
    })
    const retry = await f.coordinator.retry(f.tabId, {
      expectedStatusSequence: canceled.status_sequence,
      optIn: 'private-current-canvas-regional-v1',
      queueItemId: queued.id,
    })
    assert.notEqual(retry.id, queued.id)
    await f.queue.deleteTerminal(queued.id, (await row(f, queued.id)).status_sequence)
    assert.equal(
      await f.db
        .selectFrom('generation_queue_item')
        .select('id')
        .where('id', '=', queued.id)
        .executeTakeFirst(),
      undefined,
    )
    const result = await f.coordinator.runNext(
      f.transport({
        executeCurrentCanvasRegional: async (input) => {
          assert.equal(input.recipe.item.prompts.positive, 'global positive')
          assert.equal(input.recipe.regions[0].positive?.text, 'regional subject')
          assert.ok(
            Buffer.from(input.recipe.regions[0].coverage.alpha).equals(Buffer.from(f.alpha)),
          )
          return f.resultFor(input)
        },
      }),
    )
    assert.equal(result.kind, 'completed')
    assert.equal((await row(f, retry.id)).status, 'completed')
  })
})

test('ordinary NEW still refuses enabled regions and private shutdown permanently closes its owner', async () => {
  await withProject(async (f) => {
    await assert.rejects(
      f.orchestrator.enqueueOne(f.tabId, f.compositionWorker, {
        close: async () => {},
        generate: async () => assert.fail('Public enabled-region NEW must refuse before dispatch.'),
        ready: f.input().ready,
      }),
      { code: 'GENERATION_REGIONAL_GUIDANCE_UNSUPPORTED' },
    )
    assert.equal(f.calls.compose.length, 0)
    await f.coordinator.shutdown()
    await assert.rejects(f.coordinator.submit(f.tabId, f.input()))
    await assert.rejects(f.coordinator.runNext(f.transport()))
    assert.equal((await rows(f)).length, 0)
    assert.equal(f.calls.compose.length, 0)
    assert.equal((await readdir(f.scratch)).length, 0)
  })
})
