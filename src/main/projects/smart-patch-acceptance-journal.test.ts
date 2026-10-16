import {
  createEmptyProjectDocumentV1,
  IGS_SAFETY_CEILINGS,
} from '../../shared/projects/project-schema.js'

import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { type AppDatabase, openAppDatabase } from '../db/database.js'
import {
  type GenerationAcceptanceHandoff,
  GenerationAcceptanceJournalRepository,
} from './generation-acceptance-journal.js'
import { localProjectRecoveryKey } from './project-identity.js'
import {
  parseSmartPatchAcceptanceHandoff,
  readGenerationAcceptanceKind,
  type SmartPatchAcceptanceHandoff,
  SmartPatchAcceptanceJournalRepository,
} from './smart-patch-acceptance-journal.js'
import {
  acceptedOutputPngFixture,
  acceptedRasterProvenanceFixture,
} from './test-fixtures/accepted-provenance.js'
import { smartPatchVariantMetadataFixture } from './test-fixtures/smart-patch-variant.js'

const migrations = path.resolve('src/main/db/migrations')
const projectPath = '/private/projects/patch.igs'
const CONFLICT = { code: 'SMART_PATCH_ACCEPTANCE_JOURNAL_CONFLICT' }
const INVALID = { code: 'SMART_PATCH_ACCEPTANCE_JOURNAL_INVALID' }
const INPUT_INVALID = { code: 'SMART_PATCH_ACCEPTANCE_JOURNAL_INPUT_INVALID' }

/** Declared metadata precondition only. Journal tests never pretend that these are adopted pixels. */
function fixture(
  family: 'anima' | 'illustrious' = 'illustrious',
  filePath = projectPath,
  documentId: string = randomUUID(),
): SmartPatchAcceptanceHandoff {
  const targetLayerId = randomUUID()
  const acceptedVariants = [
    smartPatchVariantMetadataFixture(family),
    smartPatchVariantMetadataFixture(family),
  ]
  for (const variant of acceptedVariants) {
    variant.generationProvenance.layerSourceContext.layerId = targetLayerId
    variant.generationProvenance.layerSourceContext.sourceDocumentId = documentId
  }
  const stagingSessionIds = [randomUUID(), randomUUID()]
  return {
    acceptedVariants,
    activeVariantId: acceptedVariants[1].id,
    documentId,
    kind: 'smart-patch-variants',
    localProjectKey: localProjectRecoveryKey(filePath),
    operationId: randomUUID(),
    projectPath: filePath,
    reviewedCandidates: acceptedVariants.map((variant, index) => ({
      candidateId: variant.generationProvenance.executionResultContext.candidateId,
      frozenPayloadSha256: (index === 0 ? 'c' : 'd').repeat(64),
      stagingSessionId: stagingSessionIds[index],
    })),
    schemaVersion: 1,
    stagingSessionIds,
    targetLayerId,
  }
}

/** Distinct valid variants/witnesses isolate the accepted-count ceiling from uniqueness rules. */
function withVariantCount(
  handoff: SmartPatchAcceptanceHandoff,
  count: number,
): SmartPatchAcceptanceHandoff {
  const result = structuredClone(handoff)
  result.acceptedVariants = Array.from({ length: count }, () => {
    const variant = smartPatchVariantMetadataFixture('illustrious')
    variant.generationProvenance.layerSourceContext.layerId = result.targetLayerId
    variant.generationProvenance.layerSourceContext.sourceDocumentId = result.documentId
    return variant
  })
  result.activeVariantId = result.acceptedVariants[0].id
  result.reviewedCandidates = result.acceptedVariants.map((variant) => ({
    candidateId: variant.generationProvenance.executionResultContext.candidateId,
    frozenPayloadSha256: 'c'.repeat(64),
    stagingSessionId: result.stagingSessionIds[0],
  }))
  return result
}

async function normalFixture(
  handoff: SmartPatchAcceptanceHandoff,
): Promise<GenerationAcceptanceHandoff> {
  const document = createEmptyProjectDocumentV1({
    documentId: handoff.documentId,
    title: 'Normal namespace neighbor',
  })
  const bytes = await acceptedOutputPngFixture()
  const provenance = acceptedRasterProvenanceFixture(document, bytes, {
    height: 8,
    width: 8,
    x: 0,
    y: 0,
  })
  const id = randomUUID()
  return {
    acceptedLayers: [
      {
        asset: {
          bytes: bytes.length,
          height: 8,
          path: `assets/layers/${id}.png`,
          sha256: provenance.executionResultContext.output.sha256,
          width: 8,
        },
        blendMode: 'normal',
        generationProvenance: provenance,
        id,
        kind: 'raster',
        locked: false,
        name: 'Normal output',
        opacity: 1,
        transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
        visible: true,
      },
    ],
    documentId: handoff.documentId,
    localProjectKey: handoff.localProjectKey,
    operationId: randomUUID(),
    projectPath: handoff.projectPath,
    stagingSessionIds: [randomUUID()],
  }
}

async function withJournal(
  run: (journal: SmartPatchAcceptanceJournalRepository, database: AppDatabase) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-smart-acceptance-journal-'))
  const database = openAppDatabase(root, migrations)
  try {
    await run(new SmartPatchAcceptanceJournalRepository(database.db), database)
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

for (const family of ['illustrious', 'anima'] as const) {
  test(`${family} Smart intent survives actual SQLite reopen and selected session cleanup is retryable`, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'igs-smart-journal-reopen-'))
    let database = openAppDatabase(root, migrations)
    try {
      const handoff = fixture(family)
      const journal = new SmartPatchAcceptanceJournalRepository(database.db)
      assert.equal(
        await readGenerationAcceptanceKind(
          database.db,
          handoff.localProjectKey,
          handoff.documentId,
        ),
        null,
      )
      await journal.record(handoff)
      await journal.record(structuredClone(handoff))
      assert.equal(
        await readGenerationAcceptanceKind(
          database.db,
          handoff.localProjectKey,
          handoff.documentId,
        ),
        'smart-patch-variants',
      )
      assert.deepEqual(await journal.read(handoff.localProjectKey, handoff.documentId), handoff)
      assert.deepEqual(
        await database.db.selectFrom('generation_staging_discarded_session').selectAll().execute(),
        [],
      )
      await database.close()
      database = openAppDatabase(root, migrations)
      const reopened = new SmartPatchAcceptanceJournalRepository(database.db)
      assert.deepEqual(await reopened.read(handoff.localProjectKey, handoff.documentId), handoff)
      await reopened.complete(handoff)
      await database.close()
      database = openAppDatabase(root, migrations)
      await new SmartPatchAcceptanceJournalRepository(database.db).complete(handoff)
      assert.equal(
        await readGenerationAcceptanceKind(
          database.db,
          handoff.localProjectKey,
          handoff.documentId,
        ),
        null,
      )
      const sessions = await database.db
        .selectFrom('generation_staging_discarded_session')
        .selectAll()
        .execute()
      assert.deepEqual(
        sessions.map(({ staging_session_id }) => staging_session_id).sort(),
        [...handoff.stagingSessionIds].sort(),
      )
      assert.ok(
        sessions.every(({ local_project_key }) => local_project_key === handoff.localProjectKey),
      )
    } finally {
      await database.close()
      await rm(root, { force: true, recursive: true })
    }
  })

  test(`${family} intent snapshots caller metadata before await and returned metadata cannot alias durable rows`, async () => {
    await withJournal(async (journal) => {
      const input = fixture(family)
      const expected = structuredClone(input)
      const saving = journal.record(input)
      input.acceptedVariants[0].asset.sha256 = '0'.repeat(64)
      input.stagingSessionIds.pop()
      await saving
      const returned = await journal.read(expected.localProjectKey, expected.documentId)
      assert.deepEqual(returned, expected)
      assert.ok(returned)
      returned.acceptedVariants[0].name = 'Changed returned name'
      returned.stagingSessionIds.length = 0
      assert.deepEqual(await journal.read(expected.localProjectKey, expected.documentId), expected)
      const parsed = parseSmartPatchAcceptanceHandoff(expected)
      parsed.acceptedVariants[0].generationProvenance.layerSourceContext.bbox.x++
      assert.notEqual(
        parsed.acceptedVariants[0].generationProvenance.layerSourceContext.bbox.x,
        expected.acceptedVariants[0].generationProvenance.layerSourceContext.bbox.x,
      )
    })
  })
}

test('Smart creation intent rejects unsupported shape, foreign source ownership, duplicate identities and false output bindings before SQLite edits', async () => {
  await withJournal(async (journal, database) => {
    const original = fixture()
    const malformed: unknown[] = [
      null,
      { ...original, kind: 'raster' },
      { ...original, schemaVersion: 2 },
      { ...original, extra: true },
      { ...original, projectPath: 'relative.igs' },
      { ...original, projectPath: '/private/projects/../patch.igs' },
      { ...original, projectPath: '/private/projects/patch.png' },
      { ...original, localProjectKey: localProjectRecoveryKey('/private/projects/other.igs') },
      { ...original, operationId: 'not-uuid' },
      { ...original, targetLayerId: randomUUID() },
      { ...original, reviewedCandidates: [] },
      { ...original, reviewedCandidates: [original.reviewedCandidates[0]] },
      {
        ...original,
        reviewedCandidates: [
          ...original.reviewedCandidates,
          ...Array.from({ length: IGS_SAFETY_CEILINGS.archiveEntries - 1 }, () => ({
            candidateId: randomUUID(),
            frozenPayloadSha256: 'c'.repeat(64),
            stagingSessionId: original.stagingSessionIds[0],
          })),
        ],
      },
      {
        ...original,
        reviewedCandidates: [original.reviewedCandidates[0], original.reviewedCandidates[0]],
      },
      { ...original, documentId: randomUUID() },
      { ...original, activeVariantId: randomUUID() },
      { ...original, acceptedVariants: [] },
      {
        ...original,
        acceptedVariants: [original.acceptedVariants[0], original.acceptedVariants[0]],
      },
      withVariantCount(original, 65),
      { ...original, stagingSessionIds: [] },
      { ...original, stagingSessionIds: ['bad-id'] },
      {
        ...original,
        stagingSessionIds: [original.stagingSessionIds[0], original.stagingSessionIds[0]],
      },
      {
        ...original,
        stagingSessionIds: Array.from({ length: IGS_SAFETY_CEILINGS.archiveEntries + 1 }, () =>
          randomUUID(),
        ),
      },
      { ...original, projectPath: `/${'x'.repeat(IGS_SAFETY_CEILINGS.projectJsonBytes)}.igs` },
    ]
    for (const edit of [
      (value: SmartPatchAcceptanceHandoff) => {
        value.acceptedVariants[0].asset.bytes++
      },
      (value: SmartPatchAcceptanceHandoff) => {
        value.reviewedCandidates[0].frozenPayloadSha256 = 'bad-hash'
      },
      (value: SmartPatchAcceptanceHandoff) => {
        value.reviewedCandidates[0].stagingSessionId = randomUUID()
      },
      (value: SmartPatchAcceptanceHandoff) => {
        value.reviewedCandidates[0].candidateId = randomUUID()
      },
      (value: SmartPatchAcceptanceHandoff) => {
        Reflect.set(value.reviewedCandidates[0], 'unexpected', true)
      },
      (value: SmartPatchAcceptanceHandoff) => {
        value.acceptedVariants[0].asset.sha256 = '0'.repeat(64)
      },
      (value: SmartPatchAcceptanceHandoff) => {
        value.acceptedVariants[0].bbox.x++
      },
      (value: SmartPatchAcceptanceHandoff) => {
        value.acceptedVariants[0].generationProvenance.layerSourceContext.layerId = randomUUID()
      },
      (value: SmartPatchAcceptanceHandoff) => {
        value.acceptedVariants[0].generationProvenance.layerSourceContext.sourceDocumentId =
          randomUUID()
      },
      (value: SmartPatchAcceptanceHandoff) => {
        const second = value.acceptedVariants[1].generationProvenance.executionResultContext
        const first = value.acceptedVariants[0].generationProvenance.executionResultContext
        second.candidateId = first.candidateId
        second.queueItemId = first.queueItemId
      },
      (value: SmartPatchAcceptanceHandoff) => {
        value.acceptedVariants[0].id = value.targetLayerId
        value.acceptedVariants[0].asset.path = `assets/layers/${value.targetLayerId}.png`
      },
    ]) {
      const copy = structuredClone(original)
      edit(copy)
      malformed.push(copy)
    }
    for (const [index, bad] of malformed.entries()) {
      assert.throws(() => parseSmartPatchAcceptanceHandoff(bad), INPUT_INVALID, `input ${index}`)
      await assert.rejects(journal.record(bad as SmartPatchAcceptanceHandoff), INPUT_INVALID)
    }
    assert.deepEqual(
      await database.db.selectFrom('generation_acceptance_journal').selectAll().execute(),
      [],
    )
    assert.deepEqual(
      await database.db.selectFrom('generation_staging_discarded_session').selectAll().execute(),
      [],
    )
    assert.doesNotThrow(() => parseSmartPatchAcceptanceHandoff(original))
  })
})

test('64 distinct accepted variants remain a valid bounded journal payload', async () => {
  await withJournal(async (journal) => {
    const handoff = withVariantCount(fixture(), 64)
    await journal.record(handoff)
    assert.deepEqual(await journal.read(handoff.localProjectKey, handoff.documentId), handoff)
    await journal.abandon(handoff)
  })
})

test('an exact pending Smart intent cannot be overwritten, abandoned or completed by a changed operation or payload', async () => {
  await withJournal(async (journal, database) => {
    const handoff = fixture()
    await journal.record(handoff)
    const changedPayload = structuredClone(handoff)
    changedPayload.acceptedVariants[0].name = 'Another operation payload'
    for (const changed of [{ ...handoff, operationId: randomUUID() }, changedPayload]) {
      await assert.rejects(journal.record(changed), CONFLICT)
      await assert.rejects(journal.complete(changed), CONFLICT)
      await assert.rejects(journal.abandon(changed), CONFLICT)
      assert.deepEqual(await journal.read(handoff.localProjectKey, handoff.documentId), handoff)
    }
    assert.deepEqual(
      await database.db.selectFrom('generation_staging_discarded_session').selectAll().execute(),
      [],
    )
    await journal.abandon(handoff)
    await journal.abandon(handoff)
    await assert.rejects(journal.complete(handoff), CONFLICT)
  })
})

test('Smart and legacy Raster journals share one pending namespace and foreign-kind reads fail closed', async () => {
  await withJournal(async (smart, database) => {
    const handoff = fixture()
    const raster = new GenerationAcceptanceJournalRepository(database.db)
    const normal = await normalFixture(handoff)
    await raster.record(normal)
    assert.equal(
      await readGenerationAcceptanceKind(database.db, normal.localProjectKey, normal.documentId),
      'raster',
    )
    await assert.rejects(smart.read(handoff.localProjectKey, handoff.documentId), INVALID)
    await assert.rejects(smart.record(handoff), CONFLICT)
    await assert.rejects(smart.complete(handoff), CONFLICT)
    await assert.rejects(smart.abandon(handoff), CONFLICT)
    assert.deepEqual(await raster.read(normal.localProjectKey, normal.documentId), normal)
    await raster.abandon(normal)
    await smart.record(handoff)
    await assert.rejects(raster.read(normal.localProjectKey, normal.documentId), {
      code: 'ACCEPTANCE_JOURNAL_INVALID',
    })
    for (const action of ['record', 'complete', 'abandon'] as const) {
      await assert.rejects(raster[action](normal))
    }
    assert.deepEqual(await smart.read(handoff.localProjectKey, handoff.documentId), handoff)
    assert.deepEqual(
      await database.db.selectFrom('generation_staging_discarded_session').selectAll().execute(),
      [],
    )
  })
})

test('same-path replacement documents and other paths preserve separate pending intents and exact session sets', async () => {
  await withJournal(async (journal, database) => {
    const first = fixture()
    const replacement = fixture('anima')
    const anotherPath = fixture('illustrious', '/private/projects/another.igs', first.documentId)
    for (const handoff of [first, replacement, anotherPath]) {
      await journal.record(handoff)
    }
    await assert.rejects(
      journal.record({
        ...fixture('anima', '/private/projects/fourth.igs'),
        operationId: first.operationId,
      }),
      CONFLICT,
    )
    await journal.complete(first)
    assert.deepEqual(
      await journal.read(replacement.localProjectKey, replacement.documentId),
      replacement,
    )
    assert.deepEqual(
      await journal.read(anotherPath.localProjectKey, anotherPath.documentId),
      anotherPath,
    )
    const tombstones = await database.db
      .selectFrom('generation_staging_discarded_session')
      .selectAll()
      .execute()
    assert.equal(tombstones.length, first.stagingSessionIds.length)
    assert.ok(
      tombstones.every(
        (row) =>
          row.local_project_key === first.localProjectKey &&
          first.stagingSessionIds.includes(row.staging_session_id),
      ),
    )
  })
})

test('completion transaction rolls back all tombstones when exact intent removal fails', async () => {
  await withJournal(async (journal, database) => {
    const handoff = fixture()
    await journal.record(handoff)
    await sql`CREATE TRIGGER refuse_acceptance_delete BEFORE DELETE ON generation_acceptance_journal BEGIN SELECT RAISE(ABORT, 'controlled intent delete failure'); END`.execute(
      database.db,
    )
    await assert.rejects(journal.complete(handoff), /controlled intent delete failure/)
    assert.deepEqual(await journal.read(handoff.localProjectKey, handoff.documentId), handoff)
    assert.deepEqual(
      await database.db.selectFrom('generation_staging_discarded_session').selectAll().execute(),
      [],
    )
    await sql`DROP TRIGGER refuse_acceptance_delete`.execute(database.db)
    await journal.complete(handoff)
    assert.equal(await journal.read(handoff.localProjectKey, handoff.documentId), null)
  })
})

test('missing-intent completion requires every tombstone at the exact Project key', async () => {
  await withJournal(async (journal, database) => {
    const handoff = fixture()
    await database.db
      .insertInto('generation_staging_discarded_session')
      .values([
        {
          discarded_at: '2026-10-16T10:00:00.000Z',
          local_project_key: handoff.localProjectKey,
          staging_session_id: handoff.stagingSessionIds[0],
        },
        {
          discarded_at: '2026-10-16T10:00:00.000Z',
          local_project_key: localProjectRecoveryKey('/private/projects/other.igs'),
          staging_session_id: handoff.stagingSessionIds[1],
        },
      ])
      .execute()
    await assert.rejects(journal.complete(handoff), CONFLICT)
    await database.db
      .insertInto('generation_staging_discarded_session')
      .values({
        discarded_at: '2026-10-16T10:00:00.000Z',
        local_project_key: handoff.localProjectKey,
        staging_session_id: handoff.stagingSessionIds[1],
      })
      .execute()
    await journal.complete(handoff)
  })
})

test('maximum captured session list completes and retries using bounded SQLite statements', async () => {
  await withJournal(async (journal, database) => {
    const handoff = fixture()
    handoff.stagingSessionIds = Array.from({ length: IGS_SAFETY_CEILINGS.archiveEntries }, () =>
      randomUUID(),
    )
    for (const [index, candidate] of handoff.reviewedCandidates.entries()) {
      candidate.stagingSessionId = handoff.stagingSessionIds[index]
    }
    await journal.record(handoff)
    await journal.complete(handoff)
    await journal.complete(handoff)
    const tombstones = await database.db
      .selectFrom('generation_staging_discarded_session')
      .selectAll()
      .execute()
    assert.equal(tombstones.length, handoff.stagingSessionIds.length)
    assert.deepEqual(
      tombstones.map(({ staging_session_id }) => staging_session_id).sort(),
      [...handoff.stagingSessionIds].sort(),
    )
  })
})

test('stored malformed JSON, unknown kind or mismatched indexed identity cannot dispatch or authorize cleanup', async () => {
  await withJournal(async (journal, database) => {
    const handoff = fixture()
    await journal.record(handoff)
    const initial = await database.db
      .selectFrom('generation_acceptance_journal')
      .selectAll()
      .executeTakeFirstOrThrow()
    for (const update of [
      { payload_json: '{bad-json' },
      { payload_json: JSON.stringify({ ...handoff, kind: 'unknown' }) },
      { payload_json: JSON.stringify({ ...handoff, documentId: randomUUID() }) },
      { operation_id: randomUUID() },
      { canonical_project_path: '/private/projects/other.igs' },
    ]) {
      await database.db
        .updateTable('generation_acceptance_journal')
        .set({ ...initial, ...update })
        .execute()
      await assert.rejects(
        readGenerationAcceptanceKind(database.db, handoff.localProjectKey, handoff.documentId),
        INVALID,
      )
      await assert.rejects(journal.read(handoff.localProjectKey, handoff.documentId), INVALID)
      await assert.rejects(journal.complete(handoff))
      assert.deepEqual(
        await database.db.selectFrom('generation_staging_discarded_session').selectAll().execute(),
        [],
      )
    }
    await database.db.updateTable('generation_acceptance_journal').set(initial).execute()
    assert.deepEqual(await journal.read(handoff.localProjectKey, handoff.documentId), handoff)
  })
})
