import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import {
  ACCEPTED_RESULT_HISTORY_PAGE_SIZE,
  type AcceptedResultHistoryCursor,
  type AcceptedResultHistoryEntry,
  type AcceptedResultHistoryPage,
  type AcceptedResultHistoryReference,
  isAcceptedResultHistoryCursor,
  isAcceptedResultHistoryPage,
  isAcceptedResultHistoryReference,
} from './accepted-result-history.js'
import { IGS_SAFETY_CEILINGS } from './project-schema.js'

function entry(): AcceptedResultHistoryEntry {
  const result: AcceptedResultHistoryEntry = {
    acceptedAt: '2026-10-02T10:00:00.000Z',
    assetSha256: 'a'.repeat(64),
    documentId: randomUUID(),
    documentRevision: randomUUID(),
    height: 1024,
    imageUrl: null,
    layerId: randomUUID(),
    layerName: 'Accepted image',
    modelFileSha256: 'b'.repeat(64),
    modelName: 'Copied checkpoint metadata',
    modelVersionName: 'Saved version',
    projectKey: `project-v1-${'c'.repeat(64)}`,
    projectName: 'Saved Project',
    seed: 0,
    width: 768,
  }
  result.imageUrl = imageUrl(result)
  return result
}

function imageUrl(value: AcceptedResultHistoryReference): string {
  return `igs-history://result/${value.projectKey}/${value.documentId}/${value.documentRevision}/${value.layerId}/${value.assetSha256}/${'d'.repeat(64)}.img`
}

function reference(value: AcceptedResultHistoryEntry): AcceptedResultHistoryReference {
  return {
    assetSha256: value.assetSha256,
    documentId: value.documentId,
    documentRevision: value.documentRevision,
    layerId: value.layerId,
    projectKey: value.projectKey,
  }
}

function cursor(value: AcceptedResultHistoryEntry): AcceptedResultHistoryCursor {
  return { acceptedAt: value.acceptedAt, layerId: value.layerId, projectKey: value.projectKey }
}

function page(items: AcceptedResultHistoryEntry[]): AcceptedResultHistoryPage {
  return { items, nextCursor: null, totalCount: items.length }
}

test('history guards accept bounded pages, exact portable references and nullable preview fallback', () => {
  const valid = entry()
  assert.equal(isAcceptedResultHistoryCursor(cursor(valid)), true)
  assert.equal(isAcceptedResultHistoryReference(reference(valid)), true)
  assert.equal(isAcceptedResultHistoryPage(page([valid])), true)
  assert.equal(
    isAcceptedResultHistoryPage(page([{ ...valid, imageUrl: null, seed: 0xff_ff_ff_ff }])),
    true,
  )
  const items = Array.from({ length: ACCEPTED_RESULT_HISTORY_PAGE_SIZE }, entry)
  assert.equal(
    isAcceptedResultHistoryPage({ items, nextCursor: cursor(items.at(-1)!), totalCount: 51 }),
    true,
  )
  const copy = { ...valid, projectKey: `project-v1-${'e'.repeat(64)}` }
  copy.imageUrl = imageUrl(copy)
  assert.equal(isAcceptedResultHistoryPage(page([valid, copy])), true)
  const importedUuidCase = {
    ...valid,
    documentId: valid.documentId.toUpperCase(),
    documentRevision: valid.documentRevision.toUpperCase(),
    layerId: valid.layerId.toUpperCase(),
  }
  importedUuidCase.imageUrl = imageUrl(importedUuidCase)
  assert.equal(isAcceptedResultHistoryReference(reference(importedUuidCase)), true)
  assert.equal(isAcceptedResultHistoryPage(page([importedUuidCase])), true)
})

test('history cursor and reference guards reject malformed, extra or private path fields', () => {
  const valid = entry()
  const validCursor = cursor(valid)
  for (const input of [
    null,
    [],
    {},
    { ...validCursor, acceptedAt: 'yesterday' },
    { ...validCursor, acceptedAt: '2026-02-30T10:00:00.000Z' },
    { ...validCursor, acceptedAt: '2026-10-02T10:00:00Z' },
    { ...validCursor, projectKey: valid.documentId },
    { ...validCursor, layerId: 'not-a-layer' },
    { ...validCursor, canonicalPath: '/private/projects/saved.igs' },
  ]) {
    assert.equal(isAcceptedResultHistoryCursor(input), false)
  }
  const validReference = reference(valid)
  const missingRevision: Partial<AcceptedResultHistoryReference> = { ...validReference }
  delete missingRevision.documentRevision
  for (const input of [
    null,
    [],
    {},
    missingRevision,
    { ...validReference, projectKey: valid.documentId },
    { ...validReference, documentId: 'not-a-document' },
    { ...validReference, assetSha256: 'A'.repeat(64) },
    { ...validReference, assetPath: 'assets/layers/private.png' },
    valid,
  ]) {
    assert.equal(isAcceptedResultHistoryReference(input), false)
  }
})

test('history page guard binds signed resource shape to every exact saved result reference', () => {
  const valid = entry()
  for (const changedField of [
    'projectKey',
    'documentId',
    'documentRevision',
    'layerId',
    'assetSha256',
  ] as const) {
    const changed = {
      ...valid,
      [changedField]:
        changedField === 'projectKey'
          ? `project-v1-${'e'.repeat(64)}`
          : changedField === 'assetSha256'
            ? 'f'.repeat(64)
            : randomUUID(),
    }
    assert.equal(isAcceptedResultHistoryPage(page([changed])), false, changedField)
    changed.imageUrl = imageUrl(changed)
    assert.equal(isAcceptedResultHistoryPage(page([changed])), true, changedField)
  }
  for (const url of [
    'file:///private/image.png',
    'https://example.com/image.png',
    valid.imageUrl!.replace('igs-history:', 'igs-layer:'),
    valid.imageUrl!.replace('://result/', '://thumbnail/'),
    valid.imageUrl!.replace('://result/', '://username@result/'),
    `${valid.imageUrl}?path=private`,
    `${valid.imageUrl}#fragment`,
    valid.imageUrl!.replace(`${'d'.repeat(64)}.img`, `${'d'.repeat(32)}.img`),
  ]) {
    assert.equal(isAcceptedResultHistoryPage(page([{ ...valid, imageUrl: url }])), false, url)
  }
})

test('history page guard enforces source metadata, unique ownership and consistent bounded continuation', () => {
  const valid = entry()
  const items = Array.from({ length: ACCEPTED_RESULT_HISTORY_PAGE_SIZE }, entry)
  for (const input of [
    null,
    [],
    {},
    { ...page([valid]), path: '/private/projects/saved.igs' },
    { ...page([valid]), totalCount: 0 },
    ...[-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map((totalCount) => ({
      ...page([valid]),
      totalCount,
    })),
    page([valid, valid]),
    page(Array.from({ length: ACCEPTED_RESULT_HISTORY_PAGE_SIZE + 1 }, entry)),
    { ...page([]), nextCursor: cursor(valid) },
    { ...page([valid]), nextCursor: cursor(valid) },
    { items, nextCursor: cursor(valid), totalCount: 51 },
    page([{ ...valid, width: 0 }]),
    page([{ ...valid, height: 2049 }]),
    page([{ ...valid, acceptedAt: '2026-02-30T10:00:00.000Z' }]),
    page([{ ...valid, modelName: ' ' }]),
    page([{ ...valid, layerName: 'x'.repeat(IGS_SAFETY_CEILINGS.titleBytes + 1) }]),
    page([{ ...valid, modelFileSha256: 'not-a-model-sha256' }]),
    page([{ ...valid, seed: -1 }]),
    page([
      { ...valid, canonicalPath: '/private/projects/saved.igs' } as AcceptedResultHistoryEntry,
    ]),
  ]) {
    assert.equal(isAcceptedResultHistoryPage(input), false)
  }
})
