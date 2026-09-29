import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import type { VerifiedGenerationCandidate } from './generation-staging.js'

import {
  ProjectCandidateImageExporter,
  writeCandidateImageCreateOnly,
} from './project-candidate-image-export.js'

const tabId = `project-v1-${'a'.repeat(64)}`

function candidate(bytes: Buffer): VerifiedGenerationCandidate {
  return {
    actualSeed: 42,
    assetPath: '/private/staging/candidate.png',
    bbox: { height: 64, width: 64, x: 80, y: -24 },
    candidateId: randomUUID(),
    completedAt: '2026-09-29T12:00:00.000Z',
    completionOrder: 1,
    documentId: randomUUID(),
    documentRevision: randomUUID(),
    frozenPayloadJson: '{"private":"worker context"}',
    frozenPayloadSha256: 'b'.repeat(64),
    image: {
      byteSize: bytes.length,
      height: 64,
      iccSha256: 'c'.repeat(64),
      sha256: createHash('sha256').update(bytes).digest('hex'),
      width: 64,
    },
    localProjectKey: tabId,
    projectPath: '/private/Project.igs',
    queueItemId: randomUUID(),
    stagingSessionId: randomUUID(),
  }
}

function fixture(
  entry: VerifiedGenerationCandidate,
  bytes: Buffer,
  chooseDestination: (defaultFileName: string) => Promise<{ canceled: boolean; filePath?: string }>,
) {
  let currentDocumentId: string | null = randomUUID()
  while (currentDocumentId === entry.documentId) {
    currentDocumentId = randomUUID()
  }
  let candidates = [entry]
  let listCount = 0
  let readCount = 0
  const exporter = new ProjectCandidateImageExporter(
    {
      listVerifiedCandidates: async () => {
        listCount += 1
        return candidates
      },
      readVerifiedCandidatePng: async (request) => {
        readCount += 1
        return candidates.some(
          (candidate) =>
            candidate.candidateId === request.candidateId &&
            candidate.stagingSessionId === request.stagingSessionId &&
            candidate.image.sha256 === request.imageSha256,
        )
          ? bytes
          : null
      },
    },
    (key) => (key === tabId ? currentDocumentId : null),
    chooseDestination,
  )
  return {
    get currentDocumentId() {
      return currentDocumentId
    },
    exporter,
    get listCount() {
      return listCount
    },
    get readCount() {
      return readCount
    },
    setCandidates(value: VerifiedGenerationCandidate[]) {
      candidates = value
    },
    setDocumentId(value: string | null) {
      currentDocumentId = value
    },
  }
}

test('native selection exports verified raw bytes without adopting or consuming a mismatched-document candidate', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-candidate-export-'))
  try {
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
    const entry = candidate(bytes)
    const destination = path.join(root, 'my-candidate.png')
    let suggestedName = ''
    const subject = fixture(entry, bytes, async (defaultFileName) => {
      suggestedName = defaultFileName
      return { canceled: false, filePath: destination }
    })
    // The source document at this path was replaced, but exporting the pixels is still allowed.
    assert.notEqual(entry.documentId, subject.currentDocumentId)
    assert.deepEqual(await subject.exporter.save(tabId, entry.candidateId), {
      fileName: 'my-candidate.png',
      kind: 'saved',
    })
    assert.equal(suggestedName, `generation-${entry.candidateId.slice(0, 8)}.png`)
    assert.deepEqual(await readFile(destination), bytes)
    assert.equal(subject.listCount, 2, 'the candidate must be reacquired after the dialog')
    assert.equal(subject.readCount, 1)
    assert.deepEqual((await readdir(root)).sort(), ['my-candidate.png'])
    await assert.rejects(subject.exporter.save(tabId, entry.candidateId), {
      code: 'CANDIDATE_EXPORT_EXISTS',
    })
    assert.deepEqual(await readFile(destination), bytes)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('cancel and a closed Project never read candidate bytes or write a destination', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-candidate-export-cancel-'))
  try {
    const bytes = Buffer.from('candidate')
    const entry = candidate(bytes)
    const subject = fixture(entry, bytes, async () => ({ canceled: true }))
    assert.deepEqual(await subject.exporter.save(tabId, entry.candidateId), { kind: 'canceled' })
    assert.equal(subject.readCount, 0)
    assert.deepEqual(await readdir(root), [])
    subject.setDocumentId(null)
    await assert.rejects(subject.exporter.save(tabId, entry.candidateId), {
      code: 'PROJECT_NOT_OPEN',
    })
    assert.equal(subject.readCount, 0)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('candidate or Project changed during dialog leaves the existing destination untouched', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-candidate-export-race-'))
  try {
    const bytes = Buffer.from('candidate')
    const entry = candidate(bytes)
    const destination = path.join(root, 'existing.png')
    await writeFile(destination, 'original')
    const vanished = fixture(entry, bytes, async () => {
      vanished.setCandidates([])
      return { canceled: false, filePath: destination }
    })
    await assert.rejects(vanished.exporter.save(tabId, entry.candidateId), {
      code: 'CANDIDATE_EXPORT_NOT_FOUND',
    })
    assert.equal(vanished.readCount, 0)
    assert.equal(await readFile(destination, 'utf8'), 'original')

    const changed = fixture(entry, bytes, async () => {
      changed.setCandidates([{ ...entry, image: { ...entry.image, sha256: 'f'.repeat(64) } }])
      return { canceled: false, filePath: destination }
    })
    await assert.rejects(changed.exporter.save(tabId, entry.candidateId), {
      code: 'CANDIDATE_EXPORT_NOT_FOUND',
    })
    assert.equal(changed.readCount, 0)
    assert.equal(await readFile(destination, 'utf8'), 'original')

    const replaced = fixture(entry, bytes, async () => {
      replaced.setDocumentId(randomUUID())
      return { canceled: false, filePath: destination }
    })
    await assert.rejects(replaced.exporter.save(tabId, entry.candidateId), {
      code: 'PROJECT_DOCUMENT_CHANGED',
    })
    assert.equal(replaced.readCount, 0)
    assert.equal(await readFile(destination, 'utf8'), 'original')

    const closed = fixture(entry, bytes, async () => {
      closed.setDocumentId(null)
      return { canceled: false, filePath: destination }
    })
    await assert.rejects(closed.exporter.save(tabId, entry.candidateId), {
      code: 'PROJECT_NOT_OPEN',
    })
    assert.equal(closed.readCount, 0)
    assert.equal(await readFile(destination, 'utf8'), 'original')
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('invalid dialog target and verified-byte failure cannot damage an existing file', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-candidate-export-invalid-'))
  try {
    const bytes = Buffer.from('candidate')
    const entry = candidate(bytes)
    const destination = path.join(root, 'existing.png')
    await writeFile(destination, 'original')
    const invalid = fixture(entry, bytes, async () => ({
      canceled: false,
      filePath: 'relative.png',
    }))
    await assert.rejects(invalid.exporter.save(tabId, entry.candidateId), {
      code: 'CANDIDATE_EXPORT_DESTINATION_INVALID',
    })
    assert.equal(invalid.readCount, 0)

    const unverified = new ProjectCandidateImageExporter(
      {
        listVerifiedCandidates: async () => [entry],
        readVerifiedCandidatePng: async () => null,
      },
      () => entry.documentId,
      async () => ({ canceled: false, filePath: destination }),
    )
    await assert.rejects(unverified.save(tabId, entry.candidateId), {
      code: 'CANDIDATE_EXPORT_NOT_FOUND',
    })
    assert.equal(await readFile(destination, 'utf8'), 'original')
    assert.deepEqual((await readdir(root)).sort(), ['existing.png'])

    const noExtension = fixture(entry, bytes, async () => ({
      canceled: false,
      filePath: path.join(root, 'typed-name'),
    }))
    assert.deepEqual(await noExtension.exporter.save(tabId, entry.candidateId), {
      fileName: 'typed-name.png',
      kind: 'saved',
    })
    assert.deepEqual(await readFile(path.join(root, 'typed-name.png')), bytes)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('atomic create keeps an existing target and cleans the temp on conflict or pre-publication failure', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-candidate-export-atomic-'))
  try {
    const destination = path.join(root, 'result.png')
    await writeFile(destination, 'original')
    await assert.rejects(writeCandidateImageCreateOnly(destination, Buffer.from('new')), {
      code: 'CANDIDATE_EXPORT_EXISTS',
    })
    assert.equal(await readFile(destination, 'utf8'), 'original')
    assert.deepEqual(await readdir(root), ['result.png'])

    await assert.rejects(
      writeCandidateImageCreateOnly(destination, Buffer.from('new'), {
        beforePublish: async () => {
          throw new Error('injected write failure before atomic publish')
        },
      }),
      { code: 'CANDIDATE_EXPORT_WRITE_FAILED' },
    )
    assert.equal(await readFile(destination, 'utf8'), 'original')
    assert.deepEqual(await readdir(root), ['result.png'])

    const impossible = path.join(root, 'missing', 'result.png')
    await assert.rejects(writeCandidateImageCreateOnly(impossible, Buffer.from('new')), {
      code: 'CANDIDATE_EXPORT_WRITE_FAILED',
    })
    assert.deepEqual(await readdir(root), ['result.png'])
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})
