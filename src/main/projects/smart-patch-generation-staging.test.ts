import { compileAnimaFlowSamplingPlan } from '../../shared/projects/anima-flow-sampling-plan.js'
import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import type { SmartPatchInputBundle } from './project-smart-patch-input-bundle.js'
import type { SmartPatchGenerationStagingTestHooks } from './smart-patch-generation-staging.js'
import type { AnimaStagingFixture } from './test-fixtures/anima-staging.js'
import type { VerifiedWorkerImage } from './worker-client.js'

import { GenerationStagingRepository } from './generation-staging.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { SmartPatchInputBundleRepository } from './project-smart-patch-input-bundle.js'
import { captureSmartPatchInputMaterial } from './smart-patch-frozen-input.js'
import { SmartPatchGenerationStagingRepository } from './smart-patch-generation-staging.js'
import { buildFrozenQueuedSmartPatchV1 } from './smart-patch-queued-generation.js'
import { withAnimaStagingFixture } from './test-fixtures/anima-staging.js'
import {
  literalSmartPatchColorPng,
  literalSmartPatchNumericPng,
  literalSmartPatchPreparedInput,
} from './test-fixtures/smart-patch-input-material.js'

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const width = 7
const height = 5
const alpha = Array.from({ length: width * height }, (_, index) =>
  index === 31 ? 255 : [0, 64, 128, 255][index % 4],
)
const rgba = (coverage = alpha) =>
  literalSmartPatchColorPng(
    width,
    height,
    coverage.flatMap((value, index) => [index + 20, 80, 140, value]),
    4,
  )

interface Fixture extends AnimaStagingFixture {
  bundle: SmartPatchInputBundle
  candidateDirectory: string
  id: string
  output: VerifiedWorkerImage
  outputDirectory: string
  outputPath: string
  patch: SmartPatchGenerationStagingRepository
  projectKey: string
  sessionId: string
  validOutputBytes: Buffer
}

/**
 * Real queue row/bundle/SQLite/portable file, literal independent output pixels. Admission and ML
 * are outside this staging boundary; the Main executor integration covers them.
 */
async function fixture(
  family: 'anima' | 'illustrious',
  run: (f: Fixture) => Promise<void>,
  hooks: SmartPatchGenerationStagingTestHooks = {},
  seed = 0xff_ff_ff_ff,
) {
  await withAnimaStagingFixture(async (normal) => {
    const { executions, prepared } = literalSmartPatchPreparedInput(family, 'inpaint')
    prepared.context.projectKey = localProjectRecoveryKey(normal.projectPath)
    prepared.context.documentId = normal.prepared.context.documentId
    prepared.context.documentRevision = normal.prepared.context.documentRevision
    prepared.context.bbox = { ...prepared.context.bbox, height, width }
    const source = literalSmartPatchColorPng(
      width,
      height,
      Array.from({ length: width * height }, () => [20, 40, 60, 255]).flat(),
      4,
    )
    prepared.source = {
      ...prepared.source,
      bytes: source,
      byteSize: source.length,
      height,
      sha256: digest(source),
      width,
    }
    const final = literalSmartPatchNumericPng(alpha, width, height)
    prepared.conditioning.finalContributionMask = {
      bytes: final,
      height,
      polarity: 'generate',
      sha256: digest(final),
      width,
    }
    executions[0].item.seed = seed
    const request = executions[0].request
    if (request.family === 'anima') {
      request.inference = {
        ...request.inference,
        sampling: compileAnimaFlowSamplingPlan({
          guidanceScale: 4,
          height: 64,
          mode: 'img2img',
          scheduler: 'euler',
          seed,
          steps: 3,
          strength: 0.5,
          width: 64,
        }),
      }
    } else {
      request.inference.sampling.seed = seed
    }
    const material = await captureSmartPatchInputMaterial(prepared, executions)
    const bundle = await new SmartPatchInputBundleRepository(normal.root, {}, 'queue').publish(
      material,
    )
    const id = randomUUID()
    const sessionId = randomUUID()
    const payload = buildFrozenQueuedSmartPatchV1(bundle, 0)
    const now = new Date().toISOString()
    await normal.database.db
      .insertInto('generation_queue_item')
      .values({
        batch_id: randomUUID(),
        canonical_project_path: normal.projectPath,
        created_at: now,
        document_id: prepared.context.documentId,
        document_revision: prepared.context.documentRevision,
        error_code: null,
        error_message: null,
        finished_at: null,
        frozen_payload_json: JSON.stringify(payload),
        id,
        local_project_key: prepared.context.projectKey,
        operation: payload.kind,
        staging_session_id: sessionId,
        started_at: now,
        status: 'running',
        status_sequence: 1,
        updated_at: now,
      })
      .execute()
    const outputDirectory = await mkdtemp(path.join(normal.scratch, 'smart-patch-request-'))
    await chmod(outputDirectory, 0o700)
    const outputPath = path.join(outputDirectory, 'world-result.png')
    const validOutputBytes = rgba()
    await writeFile(outputPath, validOutputBytes, { flag: 'wx', mode: 0o600 })
    const output: VerifiedWorkerImage = {
      byteSize: validOutputBytes.length,
      colorSpace: 'srgb',
      height,
      iccSha256: IGS_SRGB_ICC_SHA256,
      path: outputPath,
      sha256: digest(validOutputBytes),
      width,
    }
    const patch = new SmartPatchGenerationStagingRepository(normal.database.db, normal.root, hooks)
    await patch.recoverAfterRestart()
    await run({
      ...normal,
      bundle,
      candidateDirectory: path.join(
        normal.root,
        'recovery',
        'smart-patch-staging',
        prepared.context.projectKey,
        sessionId,
        id,
      ),
      id,
      output,
      outputDirectory,
      outputPath,
      patch,
      projectKey: prepared.context.projectKey,
      sessionId,
      validOutputBytes,
    })
  })
}

function publish(
  f: Fixture,
  overrides: Partial<
    Parameters<SmartPatchGenerationStagingRepository['publishGenerationCandidate']>[0]
  > = {},
) {
  return f.patch.publishGenerationCandidate({
    actualSeed: 0xff_ff_ff_ff,
    expectedProvisionalRoot: f.outputDirectory,
    expectedStatusSequence: 1,
    output: f.output,
    provisionalOutputPath: f.outputPath,
    queueItemId: f.id,
    ...overrides,
  })
}
async function unchangedProject(f: Fixture) {
  assert.ok(
    (await readFile(f.projectPath)).equals(f.originalProjectBytes),
    'Temporary world output does not change saved .igs bytes',
  )
}
async function receipts(f: Fixture) {
  return await f.database.db.selectFrom('generation_candidate_receipt').selectAll().execute()
}
async function cursor(f: Fixture) {
  return await f.database.db.selectFrom('generation_seed_cursor').selectAll().execute()
}

for (const family of ['illustrious', 'anima'] as const) {
  test(`actual ${family} Smart Patch world candidate survives terminal input pruning with its independent final mask and seed receipt`, async () => {
    await fixture(family, async (f) => {
      const candidate = await publish(f)
      assert.equal(candidate.kind, 'smart-patch-world-candidate')
      assert.equal(candidate.actualSeed, 0xff_ff_ff_ff)
      assert.deepEqual(candidate.bbox, { height, width, x: -9, y: 13 })
      assert.deepEqual(candidate.payload.context.internalResolution, { height: 64, width: 64 })
      assert.ok(
        (await readFile(candidate.assetPath)).equals(f.validOutputBytes),
        'The candidate owns the actual world RGBA',
      )
      assert.ok(
        (await readFile(candidate.finalContributionMask.path)).equals(
          f.bundle.files['final-contribution-mask.png'],
        ),
        'The candidate owns an independent numeric mask',
      )
      assert.equal((await receipts(f))[0].status, 'completed')
      assert.equal((await cursor(f))[0].actual_seed, 0xff_ff_ff_ff)
      assert.equal((await cursor(f))[0].document_id, candidate.documentId)
      await f.queue.deleteTerminal(f.id, 2)
      await assert.rejects(
        new SmartPatchInputBundleRepository(f.root, {}, 'queue').load(f.bundle.id),
      )
      const fresh = new SmartPatchGenerationStagingRepository(f.database.db, f.root)
      assert.deepEqual(await fresh.recoverAfterRestart(), { invalidCount: 0, reconciledCount: 0 })
      const [reloaded] = await fresh.listVerifiedCandidates(f.projectKey)
      assert.deepEqual(reloaded, candidate)
      assert.ok((await readFile(reloaded.assetPath)).equals(f.validOutputBytes))
      assert.deepEqual(
        await f.staging.listVerifiedCandidates(f.projectKey),
        [],
        'Normal Raster discovery cannot expose a Smart Patch',
      )
      assert.equal(
        await f.staging.readVerifiedCandidatePng({
          candidateId: f.id,
          imageSha256: candidate.image.sha256,
          localProjectKey: f.projectKey,
          stagingSessionId: f.sessionId,
        }),
        null,
      )
      await unchangedProject(f)
    })
  })
}

test('world candidate independently refuses valid PNG with wrong actual alpha before reserving a receipt', async () => {
  await fixture(
    'illustrious',
    async (f) => {
      const wrong = rgba(alpha.map(() => 255))
      await writeFile(f.outputPath, wrong)
      await assert.rejects(
        publish(f, {
          actualSeed: 0,
          output: { ...f.output, byteSize: wrong.length, sha256: digest(wrong) },
        }),
      )
      assert.deepEqual(await receipts(f), [])
      assert.deepEqual(await cursor(f), [])
      assert.equal((await f.queue.getManagerEntry(f.id)).status, 'running')
      await writeFile(f.outputPath, f.validOutputBytes)
      assert.equal(
        (await publish(f, { actualSeed: 0 })).actualSeed,
        0,
        'The exact neighboring alpha and seed zero remain valid',
      )
      await unchangedProject(f)
    },
    {},
    0,
  )
})

test('world candidate refuses stale sequence and canceled owner without reserving or advancing the cursor', async () => {
  await fixture('anima', async (f) => {
    await assert.rejects(publish(f, { expectedStatusSequence: 0 }), {
      code: 'STAGING_STATUS_CONFLICT',
    })
    await f.queue.cancel(f.id, 1)
    await assert.rejects(publish(f), { code: 'STAGING_STATUS_CONFLICT' })
    assert.deepEqual(await receipts(f), [])
    assert.deepEqual(await cursor(f), [])
    await unchangedProject(f)
  })
})

test('world publication refuses a plausible uint32 seed different from its exact frozen request before receipt reservation', async () => {
  await fixture('anima', async (f) => {
    await assert.rejects(publish(f, { actualSeed: 0 }), { code: 'STAGING_INPUT_INVALID' })
    assert.deepEqual(await receipts(f), [])
    assert.deepEqual(await cursor(f), [])
    assert.equal((await publish(f)).actualSeed, 0xff_ff_ff_ff)
    await unchangedProject(f)
  })
})

test('fresh world recovery refuses altered seed metadata even when its shared receipt agrees', async () => {
  await fixture('illustrious', async (f) => {
    await publish(f)
    const manifestPath = path.join(f.candidateDirectory, 'manifest.json')
    const original = await readFile(manifestPath)
    const changed = JSON.parse(original.toString())
    changed.actualSeed = 0
    await writeFile(manifestPath, JSON.stringify(changed))
    await f.database.db
      .updateTable('generation_candidate_receipt')
      .set({ actual_seed: 0 })
      .where('candidate_id', '=', f.id)
      .execute()
    const fresh = new SmartPatchGenerationStagingRepository(f.database.db, f.root)
    assert.deepEqual(await fresh.recoverAfterRestart(), { invalidCount: 1, reconciledCount: 0 })
    assert.deepEqual(await fresh.listVerifiedCandidates(f.projectKey), [])
    await writeFile(manifestPath, original)
    await f.database.db
      .updateTable('generation_candidate_receipt')
      .set({ actual_seed: 0xff_ff_ff_ff })
      .where('candidate_id', '=', f.id)
      .execute()
    assert.equal((await fresh.listVerifiedCandidates(f.projectKey)).length, 1)
    await unchangedProject(f)
  })
})

test('world publication refuses a valid PNG in an external private operation directory and accepts its scratch neighbor', async () => {
  await fixture('anima', async (f) => {
    const external = await mkdtemp(path.join(f.root, 'smart-patch-request-'))
    await chmod(external, 0o700)
    const externalPath = path.join(external, 'world-result.png')
    await writeFile(externalPath, f.validOutputBytes, { mode: 0o600 })
    await assert.rejects(
      publish(f, {
        expectedProvisionalRoot: external,
        output: { ...f.output, path: externalPath },
        provisionalOutputPath: externalPath,
      }),
      { code: 'STAGING_STORAGE_UNSAFE' },
    )
    assert.deepEqual(await receipts(f), [])
    assert.deepEqual(await cursor(f), [])
    assert.ok(
      (await readFile(externalPath)).equals(f.validOutputBytes),
      'Rejected nomination does not consume external files',
    )
    assert.equal((await publish(f)).candidateId, f.id)
    await unchangedProject(f)
  })
})

test('manifest-first Smart Patch crash reconciles exact APP_RESTART reservation once and preserves actual seed', async () => {
  await fixture(
    'anima',
    async (f) => {
      await assert.rejects(publish(f), { code: 'STAGING_PUBLICATION_UNCERTAIN' })
      assert.equal((await receipts(f))[0].status, 'reserved')
      assert.deepEqual(await cursor(f), [])
      assert.deepEqual(await f.patch.listVerifiedCandidates(f.projectKey), [])
      assert.equal((await f.queue.recoverAfterRestart()).canceledCount, 1)
      const fresh = new SmartPatchGenerationStagingRepository(f.database.db, f.root)
      assert.deepEqual(await fresh.recoverAfterRestart(), { invalidCount: 0, reconciledCount: 1 })
      assert.equal((await fresh.listVerifiedCandidates(f.projectKey)).length, 1)
      assert.equal((await f.queue.getManagerEntry(f.id)).status, 'completed')
      assert.equal((await cursor(f))[0].actual_seed, 0xff_ff_ff_ff)
      assert.deepEqual(await fresh.recoverAfterRestart(), { invalidCount: 0, reconciledCount: 0 })
      assert.equal((await receipts(f)).length, 1)
      await unchangedProject(f)
    },
    {
      afterManifestPublish: async () => {
        throw new Error('Controlled crash after exact durable manifest')
      },
    },
  )
})

test('partial Smart Patch publication retains its receipt and bytes without exposing or replaying an incomplete result', async () => {
  await fixture(
    'illustrious',
    async (f) => {
      await assert.rejects(publish(f), { code: 'STAGING_PUBLICATION_UNCERTAIN' })
      assert.equal(await f.patch.hasPublicationReceipt(f.id), true)
      assert.equal((await receipts(f))[0].status, 'reserved')
      assert.deepEqual(await readdir(f.candidateDirectory), ['final-contribution-mask.png'])
      await f.queue.recoverAfterRestart()
      const fresh = new SmartPatchGenerationStagingRepository(f.database.db, f.root)
      assert.equal((await fresh.recoverAfterRestart()).reconciledCount, 0)
      assert.deepEqual(await fresh.listVerifiedCandidates(f.projectKey), [])
      assert.deepEqual(await cursor(f), [])
      const row = await f.queue.getManagerEntry(f.id)
      await assert.rejects(f.queue.deleteTerminal(row.id, row.statusSequence), {
        code: 'QUEUE_PUBLICATION_UNCERTAIN',
      })
      assert.ok(
        (await readFile(path.join(f.candidateDirectory, 'final-contribution-mask.png'))).equals(
          f.bundle.files['final-contribution-mask.png'],
        ),
      )
      await unchangedProject(f)
    },
    {
      afterMaskPublish: async () => {
        throw new Error('Controlled interruption after copied final mask')
      },
    },
  )
})

test('lost completion acknowledgement returns only the exact committed world candidate and single receipt', async () => {
  await fixture(
    'illustrious',
    async (f) => {
      const candidate = await publish(f)
      assert.equal(candidate.candidateId, f.id)
      assert.equal((await receipts(f)).length, 1)
      assert.equal((await receipts(f))[0].status, 'completed')
      assert.equal((await cursor(f))[0].candidate_id, f.id)
      assert.equal((await f.queue.getManagerEntry(f.id)).statusSequence, 2)
      await unchangedProject(f)
    },
    {
      afterCompletionCommit: async () => {
        throw new Error('Controlled lost SQL completion acknowledgement')
      },
    },
  )
})

test('Smart Patch completion transaction rollback keeps queue receipt and cursor atomic for restart recovery', async () => {
  await fixture(
    'anima',
    async (f) => {
      await assert.rejects(publish(f), { code: 'STAGING_PUBLICATION_UNCERTAIN' })
      assert.equal((await f.queue.getManagerEntry(f.id)).status, 'running')
      assert.equal((await receipts(f))[0].status, 'reserved')
      assert.deepEqual(await cursor(f), [])
      assert.deepEqual(await f.patch.listVerifiedCandidates(f.projectKey), [])
      await f.queue.recoverAfterRestart()
      const fresh = new SmartPatchGenerationStagingRepository(f.database.db, f.root)
      assert.deepEqual(await fresh.recoverAfterRestart(), { invalidCount: 0, reconciledCount: 1 })
      assert.equal((await fresh.listVerifiedCandidates(f.projectKey)).length, 1)
      assert.equal((await receipts(f))[0].status, 'completed')
      assert.equal((await cursor(f))[0].candidate_id, f.id)
      await unchangedProject(f)
    },
    {
      beforeCompletionCommit: async () => {
        throw new Error('Controlled rollback after actual queue receipt and cursor writes')
      },
    },
  )
})

test('USER_CANCELED world reservation cannot be resurrected by restart and remains hidden', async () => {
  let current: Fixture | undefined
  await fixture(
    'anima',
    async (f) => {
      current = f
      await assert.rejects(publish(f), { code: 'STAGING_STATUS_CONFLICT' })
      const canceled = await f.queue.getManagerEntry(f.id)
      assert.equal(canceled.status, 'running')
      assert.equal(canceled.error?.code, 'USER_CANCELED')
      await f.queue.acknowledgeCanceledRunning(f.id, canceled.statusSequence)
      await f.queue.recoverAfterRestart()
      const fresh = new SmartPatchGenerationStagingRepository(f.database.db, f.root)
      assert.deepEqual(await fresh.recoverAfterRestart(), { invalidCount: 1, reconciledCount: 0 })
      assert.deepEqual(await fresh.listVerifiedCandidates(f.projectKey), [])
      assert.deepEqual(await cursor(f), [])
      assert.equal((await receipts(f))[0].status, 'reserved')
      await unchangedProject(f)
    },
    {
      afterManifestPublish: async () => {
        await current!.queue.cancel(current!.id, 1)
      },
    },
  )
})

test('fresh world read refuses self-consistent image metadata whose pixels violate the independently retained final mask', async () => {
  await fixture('illustrious', async (f) => {
    const candidate = await publish(f)
    const manifestPath = path.join(f.candidateDirectory, 'manifest.json')
    const original = await readFile(manifestPath)
    const wrong = rgba(alpha.map(() => 255))
    const changed = JSON.parse(original.toString())
    changed.image.byteSize = wrong.length
    changed.image.sha256 = digest(wrong)
    await writeFile(candidate.assetPath, wrong)
    await writeFile(manifestPath, JSON.stringify(changed))
    await f.database.db
      .updateTable('generation_candidate_receipt')
      .set({ image_byte_size: wrong.length, image_sha256: digest(wrong) })
      .where('candidate_id', '=', f.id)
      .execute()
    assert.deepEqual(await f.patch.listVerifiedCandidates(f.projectKey), [])
    await writeFile(candidate.assetPath, f.validOutputBytes)
    await writeFile(manifestPath, original)
    await f.database.db
      .updateTable('generation_candidate_receipt')
      .set({ image_byte_size: candidate.image.byteSize, image_sha256: candidate.image.sha256 })
      .where('candidate_id', '=', f.id)
      .execute()
    assert.equal((await f.patch.listVerifiedCandidates(f.projectKey)).length, 1)
    await unchangedProject(f)
  })
})

test('shared tombstone hides a world candidate before cleanup and restart removes only its qualified private files', async () => {
  await fixture(
    'anima',
    async (f) => {
      const candidate = await publish(f)
      await assert.rejects(
        f.patch.discardSessions(f.projectKey, [f.sessionId]),
        /Controlled crash after tombstone/,
      )
      assert.ok((await readFile(candidate.assetPath)).equals(f.validOutputBytes))
      assert.deepEqual(await f.patch.listVerifiedCandidates(f.projectKey), [])
      const fresh = new SmartPatchGenerationStagingRepository(f.database.db, f.root)
      await fresh.recoverAfterRestart()
      await assert.rejects(readFile(candidate.assetPath), { code: 'ENOENT' })
      assert.deepEqual(await fresh.listVerifiedCandidates(f.projectKey), [])
      assert.equal((await receipts(f))[0].status, 'completed')
      assert.equal((await cursor(f))[0].actual_seed, 0xff_ff_ff_ff)
      await unchangedProject(f)
    },
    {
      afterDiscardTombstone: async () => {
        throw new Error('Controlled crash after tombstone')
      },
    },
  )
})

test('ordinary Project discard tombstone also hides Smart Patch recovery and its dedicated owner cleans the separate root', async () => {
  await fixture('illustrious', async (f) => {
    const candidate = await publish(f)
    await f.staging.discardProject(f.projectKey)
    assert.deepEqual(await f.patch.listVerifiedCandidates(f.projectKey), [])
    assert.ok(
      (await readFile(candidate.assetPath)).equals(f.validOutputBytes),
      'Ordinary owner does not recursively sweep the Smart namespace',
    )
    const fresh = new SmartPatchGenerationStagingRepository(f.database.db, f.root)
    await fresh.recoverAfterRestart()
    await assert.rejects(readFile(candidate.assetPath), { code: 'ENOENT' })
    await unchangedProject(f)
  })
})

test('world discard retains corrupted or foreign members while its durable tombstone prevents exposure', async () => {
  await fixture('anima', async (f) => {
    const candidate = await publish(f)
    await writeFile(candidate.assetPath, 'corrupt owned bytes')
    assert.deepEqual(await f.patch.discardProject(f.projectKey), {
      cleanupDeferred: true,
      discardedSessionCount: 1,
    })
    assert.equal(await readFile(candidate.assetPath, 'utf8'), 'corrupt owned bytes')
    assert.deepEqual(await f.patch.listVerifiedCandidates(f.projectKey), [])
    const fresh = new SmartPatchGenerationStagingRepository(f.database.db, f.root)
    await fresh.recoverAfterRestart()
    assert.equal(await readFile(candidate.assetPath, 'utf8'), 'corrupt owned bytes')
    await unchangedProject(f)
  })
})

for (const unsafeMember of ['hardlink', 'symlink', 'mode'] as const) {
  test(`world publication refuses ${unsafeMember} output topology without creating a receipt`, async () => {
    await fixture('illustrious', async (f) => {
      const extra = path.join(f.outputDirectory, 'other.png')
      if (unsafeMember === 'hardlink') {
        await link(f.outputPath, extra)
      }
      if (unsafeMember === 'symlink') {
        await writeFile(extra, f.validOutputBytes, { mode: 0o600 })
        await unlink(f.outputPath)
        await symlink(extra, f.outputPath)
      }
      if (unsafeMember === 'mode') {
        await chmod(f.outputPath, 0o644)
      }
      await assert.rejects(publish(f), { code: 'STAGING_STORAGE_UNSAFE' })
      assert.deepEqual(await receipts(f), [])
      assert.deepEqual(await cursor(f), [])
      await unchangedProject(f)
    })
  })
}

test('world publisher captures nomination and metadata before its first await', async () => {
  await fixture(
    'anima',
    async (f) => {
      const input = {
        actualSeed: 0,
        expectedProvisionalRoot: f.outputDirectory,
        expectedStatusSequence: 1,
        output: { ...f.output },
        provisionalOutputPath: f.outputPath,
        queueItemId: f.id,
      }
      const pending = f.patch.publishGenerationCandidate(input)
      input.actualSeed = 42
      input.output.sha256 = '0'.repeat(64)
      input.output.path = path.join(f.outputDirectory, 'unrelated.png')
      input.queueItemId = randomUUID()
      const candidate = await pending
      assert.equal(candidate.candidateId, f.id)
      assert.equal(candidate.actualSeed, 0)
      assert.equal(candidate.image.sha256, f.output.sha256)
      await unchangedProject(f)
    },
    {},
    0,
  )
})

test('normal staging cannot consume Smart world metadata through its frozen Raster parser', async () => {
  await fixture('illustrious', async (f) => {
    const candidate = await publish(f)
    const normal = new GenerationStagingRepository(f.database.db, f.root)
    await normal.recoverAfterRestart()
    assert.deepEqual(await normal.listVerifiedCandidates(f.projectKey), [])
    await assert.rejects(
      normal.publishGenerationCandidate({
        actualSeed: 0,
        expectedProvisionalRoot: f.outputDirectory,
        expectedStatusSequence: 2,
        provisionalOutputPath: f.outputPath,
        queueItemId: candidate.queueItemId,
      }),
      { code: 'QUEUE_INPUT_INVALID' },
    )
    assert.equal((await receipts(f)).length, 1)
    await unchangedProject(f)
  })
})

test('world staging readiness gate refuses access before its own recovery', async () => {
  await fixture('anima', async (f) => {
    const fresh = new SmartPatchGenerationStagingRepository(f.database.db, f.root)
    assert.throws(() => fresh.assertReadyForPublication(), { code: 'STAGING_NOT_RECONCILED' })
    await assert.rejects(fresh.listVerifiedCandidates(f.projectKey), {
      code: 'STAGING_NOT_RECONCILED',
    })
    await fresh.recoverAfterRestart()
    fresh.assertReadyForPublication()
    assert.deepEqual(await fresh.listVerifiedCandidates(f.projectKey), [])
  })
})

test('world staging enforces the actual 64-candidate session ceiling before a new receipt', async () => {
  await fixture('illustrious', async (f) => {
    await publish(f)
    const entry = JSON.parse(
      await readFile(path.join(f.candidateDirectory, 'manifest.json'), 'utf8'),
    )
    const sessionPath = path.dirname(f.candidateDirectory)
    // Qualified real member files exercise capacity; these artificial siblings are not presented
    // as visible results because no receipts are fabricated for them.
    for (let index = 1; index < 64; index++) {
      const id = randomUUID()
      const directory = path.join(sessionPath, id)
      await mkdir(directory, { mode: 0o700 })
      await writeFile(path.join(directory, 'world-result.png'), f.validOutputBytes, { mode: 0o600 })
      await writeFile(
        path.join(directory, 'final-contribution-mask.png'),
        f.bundle.files['final-contribution-mask.png'],
        { mode: 0o600 },
      )
      await writeFile(
        path.join(directory, 'manifest.json'),
        JSON.stringify({ ...entry, candidateId: id, queueItemId: id }),
        { mode: 0o600 },
      )
    }
    const originalRow = await f.database.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .where('id', '=', f.id)
      .executeTakeFirstOrThrow()
    const id = randomUUID()
    await f.database.db
      .insertInto('generation_queue_item')
      .values({
        ...originalRow,
        error_code: null,
        error_message: null,
        finished_at: null,
        id,
        status: 'running',
        status_sequence: 1,
      })
      .execute()
    await assert.rejects(publish({ ...f, id }), { code: 'STAGING_INPUT_INVALID' })
    assert.equal((await receipts(f)).length, 1)
    assert.equal((await cursor(f))[0].candidate_id, f.id)
    assert.equal((await f.queue.getManagerEntry(id)).status, 'running')
    assert.equal((await f.patch.listVerifiedCandidates(f.projectKey)).length, 1)
    await unchangedProject(f)
  })
})
