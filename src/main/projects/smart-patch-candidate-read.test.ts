import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, symlink, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import type { SmartPatchCandidateReadIdentity } from './smart-patch-generation-staging.js'

import { SmartPatchInputBundleRepository } from './project-smart-patch-input-bundle.js'
import { SmartPatchGenerationStagingRepository } from './smart-patch-generation-staging.js'
import {
  withSmartPatchWorldCandidateFixture as fixture,
  smartPatchWorldPng as worldPng,
} from './test-fixtures/smart-patch-world-candidate.js'

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

for (const family of ['illustrious', 'anima'] as const) {
  test(`verified ${family} Smart Patch candidate bytes survive queue and input pruning without normal Raster discovery`, async () => {
    await fixture(family, async (f) => {
      const candidate = await f.publish()
      await f.queue.cancel(f.siblingId)
      assert.equal(await f.queue.pruneTerminal(['completed', 'canceled']), 2)
      await assert.rejects(
        new SmartPatchInputBundleRepository(f.root, {}, 'queue').load(candidate.payload.bundle.id),
      )
      const fresh = new SmartPatchGenerationStagingRepository(f.database.db, f.root)
      await fresh.recoverAfterRestart()
      const read = await fresh.readVerifiedCandidate(f.nomination)
      assert.ok(read)
      assert.deepEqual(read.candidate, candidate)
      assert.ok(
        read.imagePngBytes.equals(f.outputBytes),
        'Read returns the exact verified world PNG',
      )
      assert.ok(
        read.finalMaskPngBytes.equals(f.material.files['final-contribution-mask.png']),
        'Read returns the independent exact final numeric mask',
      )
      assert.deepEqual(await f.staging.listVerifiedCandidates(f.nomination.localProjectKey), [])
      assert.equal(
        await f.staging.readVerifiedCandidatePng({
          candidateId: candidate.candidateId,
          imageSha256: candidate.image.sha256,
          localProjectKey: candidate.localProjectKey,
          stagingSessionId: candidate.stagingSessionId,
        }),
        null,
      )
      assert.ok(
        (await readFile(f.projectPath)).equals(f.originalProjectBytes),
        'Read does not Save',
      )
    })
  })
}

test('Smart Patch candidate read requires the exact project, document, session, candidate and reviewed hashes', async () => {
  await fixture('illustrious', async (f) => {
    await f.publish()
    const overrides: Partial<SmartPatchCandidateReadIdentity>[] = [
      { candidateId: randomUUID() },
      { documentId: randomUUID() },
      { frozenPayloadSha256: 'f'.repeat(64) },
      { imageSha256: 'f'.repeat(64) },
      { localProjectKey: `project-v1-${'f'.repeat(64)}` },
      { stagingSessionId: randomUUID() },
    ]
    for (const changed of overrides) {
      const result = await f.patch.readVerifiedCandidate({ ...f.nomination, ...changed })
      assert.equal(result === null, true, 'A changed nomination must not read candidate pixels')
    }
    assert.ok(await f.patch.readVerifiedCandidate(f.nomination), 'Exact neighboring identity reads')
    await assert.rejects(
      f.patch.readVerifiedCandidate({ ...f.nomination, imageSha256: '../outside' }),
      { code: 'STAGING_INPUT_INVALID' },
    )
  })
})

test('Smart Patch candidate read freezes caller nomination before waiting for publication', async () => {
  let entered!: () => void
  let release!: () => void
  const paused = new Promise<void>((resolve) => {
    entered = resolve
  })
  const resume = new Promise<void>((resolve) => {
    release = resolve
  })
  await fixture(
    'illustrious',
    async (f) => {
      const publication = f.publish()
      await paused
      const nomination = { ...f.nomination }
      const read = f.patch.readVerifiedCandidate(nomination)
      nomination.candidateId = randomUUID()
      nomination.documentId = randomUUID()
      nomination.imageSha256 = 'f'.repeat(64)
      nomination.frozenPayloadSha256 = 'f'.repeat(64)
      nomination.localProjectKey = `project-v1-${'f'.repeat(64)}`
      nomination.stagingSessionId = randomUUID()
      release()
      await publication
      const result = await read
      assert.ok(result)
      assert.equal(result.candidate.candidateId, f.nomination.candidateId)
      assert.ok(
        result.imagePngBytes.equals(f.outputBytes),
        'Queued read retains its first nomination',
      )
    },
    {
      beforeCompletionCommit: async () => {
        entered()
        await resume
      },
    },
  )
})

test('Smart Patch candidate read returns detached image, mask and metadata values', async () => {
  await fixture('illustrious', async (f) => {
    await f.publish()
    const first = await f.patch.readVerifiedCandidate(f.nomination)
    assert.ok(first)
    first.imagePngBytes.fill(0)
    first.finalMaskPngBytes.fill(0)
    first.candidate.payload.context.generationDraft.positivePrompt.text = 'caller mutation'
    const next = await f.patch.readVerifiedCandidate(f.nomination)
    assert.ok(next)
    assert.ok(next.imagePngBytes.equals(f.outputBytes))
    assert.ok(next.finalMaskPngBytes.equals(f.material.files['final-contribution-mask.png']))
    assert.equal(
      next.candidate.payload.context.generationDraft.positivePrompt.text,
      f.material.manifest.context.generationDraft.positivePrompt.text,
    )
  })
})

test('Smart Patch candidate read rechecks completed receipt and any retained queue row', async () => {
  await fixture('illustrious', async (f) => {
    await f.publish()
    await f.database.db
      .updateTable('generation_candidate_receipt')
      .set({ status: 'reserved' })
      .where('candidate_id', '=', f.nomination.candidateId)
      .execute()
    assert.equal(await f.patch.readVerifiedCandidate(f.nomination), null)
    await f.database.db
      .updateTable('generation_candidate_receipt')
      .set({ status: 'completed' })
      .where('candidate_id', '=', f.nomination.candidateId)
      .execute()
    assert.ok(await f.patch.readVerifiedCandidate(f.nomination))
    await f.database.db
      .updateTable('generation_queue_item')
      .set({ status: 'failed' })
      .where('id', '=', f.nomination.candidateId)
      .execute()
    assert.equal(await f.patch.readVerifiedCandidate(f.nomination), null)
    await f.database.db
      .deleteFrom('generation_queue_item')
      .where('id', '=', f.nomination.candidateId)
      .execute()
    assert.ok(await f.patch.readVerifiedCandidate(f.nomination), 'Pruned row is not required')
  })
})

test('Smart Patch candidate read observes shared session discard without consuming the retained PNG', async () => {
  await fixture('illustrious', async (f) => {
    const candidate = await f.publish()
    await f.staging.discardSessions(candidate.localProjectKey, [candidate.stagingSessionId])
    assert.equal(await f.patch.readVerifiedCandidate(f.nomination), null)
    assert.ok(
      (await readFile(candidate.assetPath)).equals(f.outputBytes),
      'Shared tombstone hides the Smart candidate before its own physical cleanup',
    )
  })
})

for (const member of ['image', 'mask'] as const) {
  test(`Smart Patch candidate read revalidates actual ${member} PNG after prior discovery`, async () => {
    await fixture('illustrious', async (f) => {
      const [candidate] = await f
        .publish()
        .then(() => f.patch.listVerifiedCandidates(f.nomination.localProjectKey))
      const target = member === 'image' ? candidate.assetPath : candidate.finalContributionMask.path
      await writeFile(target, Buffer.from('not a PNG'))
      assert.equal(await f.patch.readVerifiedCandidate(f.nomination), null)
      assert.equal((await readFile(target)).toString(), 'not a PNG', 'Invalid data is retained')
    })
  })
}

test('Smart Patch candidate read refuses truthfully rehashed RGBA that contradicts its retained final mask', async () => {
  await fixture('illustrious', async (f) => {
    const candidate = await f.publish()
    const wrong = worldPng(true)
    await writeFile(candidate.assetPath, wrong)
    const manifestPath = path.join(path.dirname(candidate.assetPath), 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.image.byteSize = wrong.length
    manifest.image.sha256 = digest(wrong)
    await writeFile(manifestPath, JSON.stringify(manifest))
    await f.database.db
      .updateTable('generation_candidate_receipt')
      .set({ image_byte_size: wrong.length, image_sha256: digest(wrong) })
      .where('candidate_id', '=', candidate.candidateId)
      .execute()
    assert.equal(
      await f.patch.readVerifiedCandidate({ ...f.nomination, imageSha256: digest(wrong) }),
      null,
    )
    assert.ok(
      (await readFile(candidate.assetPath)).equals(wrong),
      'Read does not delete failed proof',
    )
  })
})

test('Smart Patch candidate read refuses a symlinked PNG without following or changing its target', async () => {
  await fixture('illustrious', async (f) => {
    const candidate = await f.publish()
    const foreign = path.join(f.root, 'foreign.png')
    await writeFile(foreign, f.outputBytes, { flag: 'wx', mode: 0o600 })
    await unlink(candidate.assetPath)
    await symlink(foreign, candidate.assetPath)
    await assert.rejects(f.patch.readVerifiedCandidate(f.nomination), {
      code: 'STAGING_STORAGE_UNSAFE',
    })
    assert.ok((await readFile(foreign)).equals(f.outputBytes), 'Foreign target is untouched')
  })
})
