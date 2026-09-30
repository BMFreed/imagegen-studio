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
  GenerationAcceptanceJournalError,
  GenerationAcceptanceJournalRepository,
} from './generation-acceptance-journal.js'
import { localProjectRecoveryKey } from './project-identity.js'
import {
  acceptedOutputPngFixture,
  acceptedRasterProvenanceFixture,
} from './test-fixtures/accepted-provenance.js'

const migrations = path.resolve('src/main/db/migrations')
const projectPath = '/private/projects/portrait.igs'

async function fixture(
  filePath = projectPath,
  documentId: string = randomUUID(),
): Promise<GenerationAcceptanceHandoff> {
  const document = createEmptyProjectDocumentV1({ documentId, title: 'Journal fixture' })
  const output = await acceptedOutputPngFixture()
  const id = randomUUID()
  const provenance = acceptedRasterProvenanceFixture(document, output, {
    height: 8,
    width: 8,
    x: -24,
    y: 48,
  })
  return {
    acceptedLayers: [
      {
        asset: {
          bytes: output.length,
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
        name: 'Generated 1',
        opacity: 1,
        transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -24, y: 48 },
        visible: true,
      },
    ],
    documentId,
    localProjectKey: localProjectRecoveryKey(filePath),
    operationId: randomUUID(),
    projectPath: filePath,
    stagingSessionIds: [randomUUID(), randomUUID()],
  }
}

async function withJournal(
  run: (journal: GenerationAcceptanceJournalRepository, database: AppDatabase) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-acceptance-journal-'))
  const database = openAppDatabase(root, migrations)
  try {
    await run(new GenerationAcceptanceJournalRepository(database.db), database)
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

function isJournalError(
  code: GenerationAcceptanceJournalError['code'],
): (error: unknown) => boolean {
  return (error) => error instanceof GenerationAcceptanceJournalError && error.code === code
}

test('acceptance intent persists exact asset and provenance evidence through a real SQLite reopen', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-acceptance-journal-reopen-'))
  let database = openAppDatabase(root, migrations)
  try {
    const handoff = await fixture()
    const first = new GenerationAcceptanceJournalRepository(database.db)
    await first.record(handoff)
    await first.record(structuredClone(handoff))
    assert.deepEqual(await first.read(handoff.localProjectKey, handoff.documentId), handoff)
    assert.deepEqual(
      await database.db.selectFrom('generation_staging_discarded_session').selectAll().execute(),
      [],
    )
    await database.close()

    database = openAppDatabase(root, migrations)
    const reopened = new GenerationAcceptanceJournalRepository(database.db)
    assert.deepEqual(await reopened.read(handoff.localProjectKey, handoff.documentId), handoff)
    const returned = await reopened.read(handoff.localProjectKey, handoff.documentId)
    assert.ok(returned)
    returned.acceptedLayers[0].asset.sha256 = 'c'.repeat(64)
    assert.deepEqual(await reopened.read(handoff.localProjectKey, handoff.documentId), handoff)
    await reopened.complete(handoff)
    assert.equal(await reopened.read(handoff.localProjectKey, handoff.documentId), null)
    await database.close()

    database = openAppDatabase(root, migrations)
    await new GenerationAcceptanceJournalRepository(database.db).complete(handoff)
    assert.deepEqual(
      (
        await database.db
          .selectFrom('generation_staging_discarded_session')
          .select('staging_session_id')
          .execute()
      )
        .map((row) => row.staging_session_id)
        .sort(),
      [...handoff.stagingSessionIds].sort(),
    )
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('different operation or exact payload cannot overwrite, complete or abandon a pending intent', async () => {
  await withJournal(async (journal, database) => {
    const handoff = await fixture()
    await journal.record(handoff)
    const changedOperation = { ...handoff, operationId: randomUUID() }
    const changedPayload = structuredClone(handoff)
    changedPayload.acceptedLayers[0].generationProvenance!.generationConfiguration.sampling.actualSeed = 0
    for (const changed of [changedOperation, changedPayload]) {
      await assert.rejects(journal.record(changed), isJournalError('ACCEPTANCE_JOURNAL_CONFLICT'))
      await assert.rejects(journal.complete(changed), isJournalError('ACCEPTANCE_JOURNAL_CONFLICT'))
      await assert.rejects(journal.abandon(changed), isJournalError('ACCEPTANCE_JOURNAL_CONFLICT'))
      assert.deepEqual(await journal.read(handoff.localProjectKey, handoff.documentId), handoff)
    }
    assert.deepEqual(
      await database.db.selectFrom('generation_staging_discarded_session').selectAll().execute(),
      [],
    )
  })
})

test('same-path replacement and another path keep separate intents and completion tombstones', async () => {
  await withJournal(async (journal, database) => {
    const first = await fixture()
    const replacement = await fixture(projectPath)
    const anotherPath = await fixture('/private/projects/other.igs', first.documentId)
    for (const handoff of [first, replacement, anotherPath]) {
      await journal.record(handoff)
    }
    await assert.rejects(
      journal.record({ ...anotherPath, operationId: first.operationId }),
      isJournalError('ACCEPTANCE_JOURNAL_CONFLICT'),
    )
    await journal.complete(first)
    assert.equal(await journal.read(first.localProjectKey, first.documentId), null)
    assert.deepEqual(
      await journal.read(replacement.localProjectKey, replacement.documentId),
      replacement,
    )
    assert.deepEqual(
      await journal.read(anotherPath.localProjectKey, anotherPath.documentId),
      anotherPath,
    )
    const rows = await database.db
      .selectFrom('generation_staging_discarded_session')
      .selectAll()
      .execute()
    assert.equal(rows.length, first.stagingSessionIds.length)
    assert.ok(
      rows.every(
        (row) =>
          row.local_project_key === first.localProjectKey &&
          first.stagingSessionIds.includes(row.staging_session_id),
      ),
    )
  })
})

test('abandon removes only the exact intent, leaves sessions untouched, and is safe to repeat', async () => {
  await withJournal(async (journal, database) => {
    const handoff = await fixture()
    await journal.record(handoff)
    await journal.abandon(handoff)
    await journal.abandon(handoff)
    assert.equal(await journal.read(handoff.localProjectKey, handoff.documentId), null)
    assert.deepEqual(
      await database.db.selectFrom('generation_staging_discarded_session').selectAll().execute(),
      [],
    )
    await assert.rejects(journal.complete(handoff), isJournalError('ACCEPTANCE_JOURNAL_CONFLICT'))
  })
})

test('completion without an intent requires every captured session tombstone at the same project key', async () => {
  await withJournal(async (journal, database) => {
    const handoff = await fixture()
    await database.db
      .insertInto('generation_staging_discarded_session')
      .values({
        discarded_at: '2026-09-30T10:00:00.000Z',
        local_project_key: handoff.localProjectKey,
        staging_session_id: handoff.stagingSessionIds[0],
      })
      .execute()
    await assert.rejects(journal.complete(handoff), isJournalError('ACCEPTANCE_JOURNAL_CONFLICT'))
    await database.db
      .insertInto('generation_staging_discarded_session')
      .values({
        discarded_at: '2026-09-30T10:00:00.000Z',
        local_project_key: localProjectRecoveryKey('/private/projects/another.igs'),
        staging_session_id: handoff.stagingSessionIds[1],
      })
      .execute()
    await assert.rejects(journal.complete(handoff), isJournalError('ACCEPTANCE_JOURNAL_CONFLICT'))
    await database.db
      .insertInto('generation_staging_discarded_session')
      .values({
        discarded_at: '2026-09-30T10:00:00.000Z',
        local_project_key: handoff.localProjectKey,
        staging_session_id: handoff.stagingSessionIds[1],
      })
      .execute()
    await journal.complete(handoff)
    assert.equal(
      (await database.db.selectFrom('generation_staging_discarded_session').selectAll().execute())
        .length,
      3,
    )
  })
})

test('invalid or oversized intent and mismatched generated output are rejected before any SQLite edit', async () => {
  await withJournal(async (journal, database) => {
    const original = await fixture()
    const malformed: unknown[] = [
      null,
      { ...original, operationId: 'not-an-operation' },
      { ...original, documentId: randomUUID() },
      { ...original, projectPath: 'portrait.igs' },
      { ...original, projectPath: '/private/projects/../portrait.igs' },
      { ...original, projectPath: '/private/projects/portrait.png' },
      { ...original, localProjectKey: localProjectRecoveryKey('/private/projects/different.igs') },
      { ...original, stagingSessionIds: [] },
      { ...original, stagingSessionIds: ['not-a-session'] },
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
      { ...original, acceptedLayers: [] },
      { ...original, acceptedLayers: [original.acceptedLayers[0], original.acceptedLayers[0]] },
      { ...original, acceptedLayers: Array.from({ length: 65 }, () => original.acceptedLayers[0]) },
      { ...original, unexpected: true },
      { ...original, projectPath: `/${'a'.repeat(IGS_SAFETY_CEILINGS.projectJsonBytes)}.igs` },
    ]
    const duplicateCandidate = structuredClone(original)
    const duplicatedLayer = structuredClone(original.acceptedLayers[0])
    duplicatedLayer.id = randomUUID()
    duplicatedLayer.asset.path = `assets/layers/${duplicatedLayer.id}.png`
    duplicateCandidate.acceptedLayers.push(duplicatedLayer)
    malformed.push(duplicateCandidate)
    for (const edit of [
      (copy: GenerationAcceptanceHandoff) => {
        delete copy.acceptedLayers[0].generationProvenance
      },
      (copy: GenerationAcceptanceHandoff) => {
        copy.acceptedLayers[0].asset.sha256 = 'c'.repeat(64)
      },
      (copy: GenerationAcceptanceHandoff) => {
        copy.acceptedLayers[0].asset.bytes += 1
      },
      (copy: GenerationAcceptanceHandoff) => {
        copy.acceptedLayers[0].asset.width += 8
      },
      (copy: GenerationAcceptanceHandoff) => {
        copy.acceptedLayers[0].asset.path = `assets/layers/${randomUUID()}.png`
      },
      (copy: GenerationAcceptanceHandoff) => {
        copy.acceptedLayers[0].generationProvenance!.executionResultContext.queueItemId =
          randomUUID()
      },
    ]) {
      const copy = structuredClone(original)
      edit(copy)
      malformed.push(copy)
    }
    for (const input of malformed) {
      await assert.rejects(
        journal.record(input as GenerationAcceptanceHandoff),
        isJournalError('ACCEPTANCE_JOURNAL_INPUT_INVALID'),
      )
    }
    assert.deepEqual(
      await database.db.selectFrom('generation_acceptance_journal').selectAll().execute(),
      [],
    )
    assert.deepEqual(
      await database.db.selectFrom('generation_staging_discarded_session').selectAll().execute(),
      [],
    )
    const validZeroSeed = structuredClone(original)
    validZeroSeed.acceptedLayers[0].generationProvenance!.generationConfiguration.sampling.actualSeed = 0
    await journal.record(validZeroSeed)
    assert.deepEqual(
      await journal.read(validZeroSeed.localProjectKey, validZeroSeed.documentId),
      validZeroSeed,
    )
  })
})

test('the maximum captured session set completes in bounded statements and retries exactly', async () => {
  await withJournal(async (journal, database) => {
    const handoff = await fixture()
    handoff.stagingSessionIds = Array.from({ length: IGS_SAFETY_CEILINGS.archiveEntries }, () =>
      randomUUID(),
    )
    await journal.record(handoff)
    await journal.complete(handoff)
    await journal.complete(handoff)
    assert.equal(await journal.read(handoff.localProjectKey, handoff.documentId), null)
    const tombstones = await database.db
      .selectFrom('generation_staging_discarded_session')
      .select(['local_project_key', 'staging_session_id'])
      .execute()
    assert.equal(tombstones.length, handoff.stagingSessionIds.length)
    assert.ok(tombstones.every((row) => row.local_project_key === handoff.localProjectKey))
    assert.deepEqual(
      tombstones.map((row) => row.staging_session_id).sort(),
      [...handoff.stagingSessionIds].sort(),
    )
  })
})

test('a corrupted stored payload or indexed identity cannot become cleanup authority', async () => {
  await withJournal(async (journal, database) => {
    const handoff = await fixture()
    await journal.record(handoff)
    for (const update of [
      { payload_json: '{broken-json' },
      { payload_json: JSON.stringify({ ...handoff, documentId: randomUUID() }) },
      { operation_id: randomUUID(), payload_json: JSON.stringify(handoff) },
      {
        canonical_project_path: '/private/projects/wrong.igs',
        operation_id: handoff.operationId,
        payload_json: JSON.stringify(handoff),
      },
    ]) {
      await database.db.updateTable('generation_acceptance_journal').set(update).execute()
      await assert.rejects(
        journal.read(handoff.localProjectKey, handoff.documentId),
        isJournalError('ACCEPTANCE_JOURNAL_INVALID'),
      )
      await assert.rejects(journal.complete(handoff), isJournalError('ACCEPTANCE_JOURNAL_INVALID'))
      await assert.rejects(journal.abandon(handoff), isJournalError('ACCEPTANCE_JOURNAL_INVALID'))
      assert.equal(
        (await database.db.selectFrom('generation_acceptance_journal').selectAll().execute())
          .length,
        1,
      )
      assert.deepEqual(
        await database.db.selectFrom('generation_staging_discarded_session').selectAll().execute(),
        [],
      )
    }
  })
})

test('tombstone failure rolls back all inserted sessions and preserves the exact pending intent', async () => {
  await withJournal(async (journal, database) => {
    const handoff = await fixture()
    // The first insertion statement succeeds before the second statement fails. This proves the
    // real transaction boundary rather than merely SQLite's atomicity for one INSERT statement.
    handoff.stagingSessionIds = Array.from({ length: 401 }, () => randomUUID())
    await journal.record(handoff)
    await sql
      .raw(
        `CREATE TRIGGER reject_second_acceptance_tombstone
      BEFORE INSERT ON generation_staging_discarded_session
      WHEN NEW.staging_session_id = '${handoff.stagingSessionIds[400]}'
      BEGIN SELECT RAISE(ABORT, 'injected tombstone failure'); END`,
      )
      .execute(database.db)
    await assert.rejects(journal.complete(handoff), /injected tombstone failure/)
    assert.deepEqual(await journal.read(handoff.localProjectKey, handoff.documentId), handoff)
    assert.deepEqual(
      await database.db.selectFrom('generation_staging_discarded_session').selectAll().execute(),
      [],
    )
    await sql`DROP TRIGGER reject_second_acceptance_tombstone`.execute(database.db)
    await journal.complete(handoff)
    assert.equal(await journal.read(handoff.localProjectKey, handoff.documentId), null)
    assert.equal(
      (await database.db.selectFrom('generation_staging_discarded_session').selectAll().execute())
        .length,
      401,
    )
  })
})

test('intent deletion failure rolls back tombstones as well as preserving the pending row', async () => {
  await withJournal(async (journal, database) => {
    const handoff = await fixture()
    await journal.record(handoff)
    await sql`CREATE TRIGGER reject_acceptance_intent_delete
      BEFORE DELETE ON generation_acceptance_journal
      BEGIN SELECT RAISE(ABORT, 'injected journal deletion failure'); END`.execute(database.db)
    await assert.rejects(journal.complete(handoff), /injected journal deletion failure/)
    assert.deepEqual(await journal.read(handoff.localProjectKey, handoff.documentId), handoff)
    assert.deepEqual(
      await database.db.selectFrom('generation_staging_discarded_session').selectAll().execute(),
      [],
    )
    await sql`DROP TRIGGER reject_acceptance_intent_delete`.execute(database.db)
    await journal.complete(handoff)
    assert.equal(await journal.read(handoff.localProjectKey, handoff.documentId), null)
  })
})
