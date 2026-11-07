import {
  ANIMA_PROMPT_INTERPRETATION,
  type CompiledAnimaPromptWeighting,
} from '../../shared/projects/anima-prompt-weighting.js'

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import type { AppDatabase } from '../db/database.js'
import type { SmartPatchInputMaterial } from './smart-patch-frozen-input.js'
import type { AnimaStagingFixture } from './test-fixtures/anima-staging.js'
import type { SmartPatchQueueFixture } from './test-fixtures/smart-patch-queue.js'

import { openAppDatabase } from '../db/database.js'
import { withQueuedAnimaGenerationRequest } from './anima-queued-request.js'
import { GenerationQueueRepository } from './generation-queue.js'
import { GenerationStagingRepository } from './generation-staging.js'
import { provenanceFromVerifiedRasterCandidate } from './project-generation-provenance.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { ANIMA_BATCH_READY } from './test-fixtures/anima-batch.js'
import {
  animaProvisionalOutput,
  enqueueAnimaStagingBatch,
  withAnimaStagingFixture,
} from './test-fixtures/anima-staging.js'
import { admitSmartPatch, withSmartPatchQueueFixture } from './test-fixtures/smart-patch-queue.js'

// Real SQLite, queue/staging repositories and PNG files; the fixture's exact-file resolver uses
// synthetic resource bytes. No trained inference, renderer, explicit Add or Save is qualified here.
// Invoke a61ac4fb: backend/anima/prompt_weighting.py joins leaves with neutral spaces, while
// app/services/session_queue/session_queue_default.py persists execution state across queue owners.
const RAW_PROMPTS = { negative: '(blur)0.75, noise', positive: '(a,b)2' }
type CompiledPrompts = {
  negative: CompiledAnimaPromptWeighting
  positive: CompiledAnimaPromptWeighting
}

// These pre-upgrade sidecars are literal historical fixtures, never outputs of today's compiler.
const LEGACY_PROMPTS: CompiledPrompts = {
  negative: {
    cleanedText: 'blur, noise',
    spans: [
      { end: 4, start: 0, weight: 0.75 },
      { end: 11, start: 4, weight: 1 },
    ],
    version: 'anima-prompt-weighting-v1',
  },
  positive: {
    cleanedText: 'a,b',
    spans: [{ end: 3, start: 0, weight: 2 }],
    version: 'anima-prompt-weighting-v1',
  },
}
const FRAGMENT_PROMPTS: CompiledPrompts = {
  negative: {
    cleanedText: 'blur , noise',
    spans: [
      { end: 4, start: 0, weight: 0.75 },
      { end: 12, start: 4, weight: 1 },
    ],
    version: 'anima-prompt-weighting-v1',
  },
  positive: {
    cleanedText: 'a , b',
    spans: [
      { end: 1, start: 0, weight: 2 },
      { end: 2, start: 1, weight: 1 },
      { end: 3, start: 2, weight: 2 },
      { end: 4, start: 3, weight: 1 },
      { end: 5, start: 4, weight: 2 },
    ],
    version: 'anima-prompt-weighting-v1',
  },
}

function setOrdinaryPrompts(fixture: AnimaStagingFixture, prompts = RAW_PROMPTS): void {
  fixture.prepared.context.prompts = { ...prompts }
  fixture.prepared.context.generationDraft.positivePrompt.text = prompts.positive
  fixture.prepared.context.generationDraft.negativePrompt.text = prompts.negative
}

function queueRow(database: AppDatabase, id: string) {
  return database.db
    .selectFrom('generation_queue_item')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
}

async function withReopenedDatabase<T>(
  fixture: AnimaStagingFixture,
  use: (database: AppDatabase) => Promise<T>,
): Promise<T> {
  const database = openAppDatabase(fixture.root, path.resolve('src/main/db/migrations'))
  try {
    return await use(database)
  } finally {
    await database.close()
  }
}

async function installPreUpgradeOrdinaryRow(fixture: AnimaStagingFixture, id: string) {
  const original = await fixture.queue.loadVerifiedInput(id)
  assert.ok(original.payload.kind === 'anima-txt2img' || original.payload.kind === 'anima-img2img')
  const payload = {
    ...structuredClone(original.payload),
    workerJob: { ...original.payload.workerJob, prompts: structuredClone(LEGACY_PROMPTS) },
  }
  delete payload.context.animaPromptInterpretation
  const json = JSON.stringify(payload)
  // Prepare an internally consistent pre-upgrade database/file pair. Reload, Retry and recovery
  // below use the real owners; this is fixture construction, not an alternate persistence path.
  await fixture.database.db
    .updateTable('generation_queue_item')
    .set({ frozen_payload_json: json })
    .where('id', '=', id)
    .execute()
  const manifestPath = path.join(path.dirname(original.targetPath), 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.payloadSha256 = createHash('sha256').update(json).digest('hex')
  await writeFile(manifestPath, JSON.stringify(manifest))
  return { json, payload, targetBytes: await readFile(original.targetPath) }
}

for (const opaque of [false, true]) {
  const mode = opaque ? 'img2img' : 'txt2img'

  test(`new Anima ${mode} admission captures marked Invoke fragment text and neutral separator spans`, async () => {
    await withAnimaStagingFixture(
      async (fixture) => {
        setOrdinaryPrompts(fixture)
        const { items, preparedBatch } = await enqueueAnimaStagingBatch(fixture)
        assert.equal(items.length, 1)
        assert.deepEqual(preparedBatch.items[0].compiledPrompts, FRAGMENT_PROMPTS)
        const loaded = await fixture.queue.loadVerifiedInput(items[0].id)
        assert.equal(loaded.payload.kind, `anima-${mode}`)
        assert.ok(
          loaded.payload.kind === 'anima-txt2img' || loaded.payload.kind === 'anima-img2img',
        )
        assert.equal(loaded.payload.context.animaPromptInterpretation, ANIMA_PROMPT_INTERPRETATION)
        assert.deepEqual(loaded.payload.context.prompts, RAW_PROMPTS)
        assert.deepEqual(loaded.payload.workerJob.prompts, FRAGMENT_PROMPTS)
        assert.ok((await readFile(loaded.targetPath)).equals(fixture.prepared.targetPngBytes))
        assert.ok((await readFile(fixture.projectPath)).equals(fixture.originalProjectBytes))
      },
      { opaque },
    )
  })

  test(`unmarked pre-upgrade Anima ${mode} survives actual reopen, Retry, dispatch and pruned candidate recovery`, async () => {
    await withAnimaStagingFixture(
      async (fixture) => {
        setOrdinaryPrompts(fixture)
        const { items } = await enqueueAnimaStagingBatch(fixture)
        assert.equal(items.length, 1)
        const old = await installPreUpgradeOrdinaryRow(fixture, items[0].id)
        setOrdinaryPrompts(fixture, { negative: '(later noise)3', positive: '(later authoring)4' })
        fixture.prepared.context.sampling.seed = 987
        await fixture.database.close()

        const candidate = await withReopenedDatabase(fixture, async (database) => {
          const queue = new GenerationQueueRepository(database.db, fixture.root)
          const staging = new GenerationStagingRepository(database.db, fixture.root)
          assert.equal((await queue.recoverAfterRestart()).canceledCount, 1)
          await staging.recoverAfterRestart()
          const source = await queue.loadVerifiedRetryInput(items[0].id)
          assert.equal(source.item.status, 'canceled')
          assert.deepEqual(source.payload, old.payload)
          assert.equal((await queueRow(database, items[0].id)).frozen_payload_json, old.json)
          const retried = await queue.retryTerminal(items[0].id, source.item.statusSequence)
          const frozen = await queue.loadVerifiedInput(retried.id)
          assert.equal((await queueRow(database, retried.id)).frozen_payload_json, old.json)
          assert.ok((await readFile(frozen.targetPath)).equals(old.targetBytes))
          assert.ok(
            frozen.payload.kind === 'anima-txt2img' || frozen.payload.kind === 'anima-img2img',
          )
          assert.equal(Object.hasOwn(frozen.payload.context, 'animaPromptInterpretation'), false)
          await withQueuedAnimaGenerationRequest({
            modelService: fixture.modelService,
            payload: frozen.payload,
            ready: ANIMA_BATCH_READY,
            scratchBasePath: fixture.scratch,
            targetPngBytes: await readFile(frozen.targetPath),
            use: async (request) => {
              assert.deepEqual(request.job.prompts, LEGACY_PROMPTS)
              assert.equal(request.job.sampling.seed, 0)
              assert.ok((await readFile(request.job.target.path)).equals(old.targetBytes))
            },
          })
          const claim = await queue.claimNextPending()
          assert.equal(claim?.item.id, retried.id)
          assert.ok(claim)
          const output = await animaProvisionalOutput(fixture)
          try {
            const published = await staging.publishGenerationCandidate({
              ...output,
              actualSeed: 0,
              expectedStatusSequence: claim.item.statusSequence,
              queueItemId: retried.id,
            })
            assert.equal(published.frozenPayloadJson, old.json)
            await queue.deleteTerminal(retried.id, claim.item.statusSequence + 1)
            assert.equal(await queue.pruneTerminal(['canceled']), 1)
            assert.deepEqual(
              await database.db.selectFrom('generation_queue_item').selectAll().execute(),
              [],
            )
            return published
          } finally {
            await rm(output.expectedProvisionalRoot, { force: true, recursive: true })
          }
        })

        await withReopenedDatabase(fixture, async (database) => {
          const queue = new GenerationQueueRepository(database.db, fixture.root)
          await queue.recoverAfterRestart()
          const staging = new GenerationStagingRepository(database.db, fixture.root)
          assert.deepEqual(await staging.recoverAfterRestart(), {
            invalidCount: 0,
            reconciledCount: 0,
          })
          const key = localProjectRecoveryKey(fixture.projectPath)
          assert.deepEqual(await staging.listVerifiedCandidates(key), [candidate])
          const imagePngBytes = await staging.readVerifiedCandidatePng({
            candidateId: candidate.candidateId,
            imageSha256: candidate.image.sha256,
            localProjectKey: key,
            stagingSessionId: candidate.stagingSessionId,
          })
          assert.ok(imagePngBytes?.equals(fixture.outputBytes))
          assert.ok(imagePngBytes)
          const provenance = provenanceFromVerifiedRasterCandidate({
            acceptedAt: '2026-11-07T12:00:00.000Z',
            candidate,
            imagePngBytes,
          })
          assert.equal(provenance.kind, `anima-${mode}`)
          assert.deepEqual(provenance.generationConfiguration.positivePrompt, {
            embeddingRefs: [],
            text: RAW_PROMPTS.positive,
          })
          assert.deepEqual(provenance.generationConfiguration.negativePrompt, {
            embeddingRefs: [],
            text: RAW_PROMPTS.negative,
          })
          assert.equal(provenance.generationConfiguration.sampling.actualSeed, 0)
          assert.ok((await readFile(fixture.projectPath)).equals(fixture.originalProjectBytes))
        })
      },
      { opaque },
    )
  })
}

function smartMaterial(fixture: SmartPatchQueueFixture, legacy: boolean): SmartPatchInputMaterial {
  const manifest = structuredClone(fixture.material.manifest)
  if (legacy) {
    delete manifest.animaPromptInterpretation
  } else {
    manifest.animaPromptInterpretation = ANIMA_PROMPT_INTERPRETATION
  }
  manifest.context.generationDraft.positivePrompt.text = RAW_PROMPTS.positive
  manifest.context.generationDraft.negativePrompt.text = RAW_PROMPTS.negative
  manifest.items = manifest.items.map((entry) => {
    assert.equal(entry.family, 'anima')
    assert.ok(entry.family === 'anima')
    return {
      ...entry,
      inference: {
        ...entry.inference,
        prompts: structuredClone(legacy ? LEGACY_PROMPTS : FRAGMENT_PROMPTS),
      },
      item: { ...entry.item, prompts: { ...RAW_PROMPTS } },
    }
  })
  return { files: fixture.material.files, manifest }
}

for (const legacy of [true, false]) {
  test(`${legacy ? 'unmarked legacy' : 'marked current'} Anima Smart Patch keeps complete frozen sidecars through admission, Retry and actual reopen`, async () => {
    await withSmartPatchQueueFixture('anima', async (fixture) => {
      const material = smartMaterial(fixture, legacy)
      const prompts = legacy ? LEGACY_PROMPTS : FRAGMENT_PROMPTS
      // Admission performs actual exact-file requalification against these compiled historical
      // sidecars. Recompiling old text with the current default must not refuse a valid old job.
      const items = await admitSmartPatch(fixture, { material })
      assert.equal(items.length, 2)
      const original = await fixture.queue.loadVerifiedSmartPatchInput(items[1].id)
      const manifestPath = (id: string) =>
        path.join(fixture.root, 'generation-queued-inputs', 'smart-patch', id, 'manifest.json')
      const originalManifestBytes = await readFile(manifestPath(original.bundle.id))
      assert.equal(Object.hasOwn(original.payload, 'animaPromptInterpretation'), !legacy)
      assert.equal(Object.hasOwn(original.bundle.manifest, 'animaPromptInterpretation'), !legacy)
      const interpretation = legacy ? undefined : ANIMA_PROMPT_INTERPRETATION
      assert.equal(original.payload.animaPromptInterpretation, interpretation)
      assert.equal(original.bundle.manifest.animaPromptInterpretation, interpretation)
      assert.deepEqual(original.payload.item.inference.prompts, prompts)
      assert.deepEqual(original.payload.item.item.prompts, RAW_PROMPTS)
      assert.equal(original.payload.item.item.seed, 1)
      for (const item of items) {
        await fixture.queue.cancel(item.id, item.statusSequence)
      }
      material.manifest.context.generationDraft.positivePrompt.text = '(poison current draft)5'
      material.manifest.context.generationDraft.negativePrompt.text = '(poison negative)6'
      setOrdinaryPrompts(fixture, { negative: '(edited noise)7', positive: '(edited draft)8' })
      const source = await fixture.queue.getManagerEntry(items[1].id)
      const retried = await fixture.queue.retryPreparedSmartPatchTerminal(
        source.id,
        source.statusSequence,
        {
          assertCurrent: () => undefined,
          modelService: fixture.models,
        },
      )
      const copied = await fixture.queue.loadVerifiedSmartPatchInput(retried.id)
      assert.notEqual(copied.bundle.id, original.bundle.id)
      assert.equal(copied.bundle.manifestSha256, original.bundle.manifestSha256)
      assert.ok((await readFile(manifestPath(copied.bundle.id))).equals(originalManifestBytes))
      assert.deepEqual(copied.bundle.manifest, original.bundle.manifest)
      assert.deepEqual(copied.payload, {
        ...original.payload,
        bundle: { ...original.payload.bundle, id: copied.bundle.id },
      })
      const copiedJson = (await queueRow(fixture.database, retried.id)).frozen_payload_json
      assert.equal(await fixture.queue.pruneTerminal(['canceled']), 2)
      await fixture.database.close()

      await withReopenedDatabase(fixture, async (database) => {
        const queue = new GenerationQueueRepository(database.db, fixture.root)
        assert.equal((await queue.recoverAfterRestart()).canceledCount, 1)
        const recovered = await queue.loadVerifiedSmartPatchInput(retried.id)
        assert.equal(recovered.item.status, 'canceled')
        assert.equal((await queueRow(database, retried.id)).frozen_payload_json, copiedJson)
        assert.deepEqual(recovered.payload, copied.payload)
        assert.deepEqual(recovered.bundle.manifest, original.bundle.manifest)
        assert.ok((await readFile(manifestPath(recovered.bundle.id))).equals(originalManifestBytes))
        for (const [name, bytes] of Object.entries(original.bundle.files)) {
          assert.ok(
            recovered.bundle.files[name].equals(bytes),
            `${name}: exact independent frozen PNG`,
          )
        }
        assert.equal(Object.hasOwn(recovered.payload, 'animaPromptInterpretation'), !legacy)
        assert.equal(Object.hasOwn(recovered.bundle.manifest, 'animaPromptInterpretation'), !legacy)
        assert.equal(recovered.payload.animaPromptInterpretation, interpretation)
        assert.equal(recovered.bundle.manifest.animaPromptInterpretation, interpretation)
        assert.deepEqual(recovered.payload.item.inference.prompts, prompts)
        assert.equal(recovered.bundle.manifest.items.length, 2)
        assert.ok((await readFile(fixture.projectPath)).equals(fixture.originalProjectBytes))
      })
    })
  })
}
