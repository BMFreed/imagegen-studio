import type { ProjectSmartPatchVariantsInspection } from '../../shared/projects/smart-patch-variants.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { inspectSmartPatchVariantsWithOptionalWorker } from './project-smart-patch-variant-inspection.js'
import { ProjectTargetInspectionOwner } from './project-target-inspection-owner.js'
import { ProjectWorkerClient, ProjectWorkerError } from './worker-client.js'

function inspection(): ProjectSmartPatchVariantsInspection {
  return {
    documentId: randomUUID(),
    documentRevision: randomUUID(),
    layerId: randomUUID(),
    resourceDiagnostics: [
      { code: 'RESOURCE_MISSING', message: 'The exact checkpoint is missing.' },
    ],
    resourcesChecked: true,
    sourceUnavailableReason: 'Current source pixels could not be verified.',
    variants: [
      { changedInputs: [], id: randomUUID(), sourceVerified: false, status: 'unverified' },
    ],
  }
}

const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

/**
 * Controlled protocol peer only: real executable validation, spawn, handshake and physical exit run
 * through the production owner/client. No Python, model, composition or inference is faked as
 * successful; the peer never receives an image request.
 */
async function withConfiguredWorker(
  workerVersion: string,
  run: (input: {
    assertExited: () => Promise<void>
    owner: ProjectTargetInspectionOwner
  }) => Promise<void>,
): Promise<void> {
  const scratch = await mkdtemp(path.join(tmpdir(), 'igs-variant-inspection-'))
  const runtimeRoot = path.join(scratch, 'runtime')
  const stagingBasePath = path.join(scratch, 'staging')
  const marker = path.join(scratch, 'child-identity.json')
  const pythonExecutable = path.join(runtimeRoot, 'controlled-python')
  const source = Buffer.from(String.raw`#!${process.execPath}
const fs = require('node:fs')
if (process.argv.slice(2).join(' ') !== '-I -m imagegen_worker') process.exit(21)
const stat = fs.readFileSync('/proc/self/stat', 'utf8')
const startTime = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/)[19]
fs.writeFileSync(process.env.IGS_TEST_IDENTITY, JSON.stringify({ pid: process.pid, startTime }))
process.stdout.write(JSON.stringify({
  type: 'ready', protocolVersion: '1', workerVersion: process.env.IGS_TEST_VERSION,
  pythonVersion: '3.12.13', runtimeProfile: 'derivatives-only',
  capabilities: ['image-derivatives', 'import-normalization', 'self-test', 'target-composition']
}) + '\n')
process.stdin.resume()
setTimeout(() => process.exit(22), 10000)
`)
  await mkdir(runtimeRoot)
  await mkdir(stagingBasePath)
  await writeFile(pythonExecutable, source)
  await chmod(pythonExecutable, 0o700)
  const sourceHash = hash(source)
  const owner = new ProjectTargetInspectionOwner(async () => ({
    environment: { IGS_TEST_IDENTITY: marker, IGS_TEST_VERSION: workerVersion },
    location: { pythonExecutable, runtimeRoot, stagingBasePath },
  }))
  const assertExited = async (requireSpawnProof = true): Promise<void> => {
    let saved: { pid: number; startTime: string }
    try {
      saved = JSON.parse(await readFile(marker, 'utf8')) as typeof saved
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        assert.equal(requireSpawnProof, false, 'The configured worker must actually cross spawn.')
        return
      }
      throw error
    }
    assert.ok(Number.isSafeInteger(saved.pid) && saved.pid > 0 && /^\d+$/.test(saved.startTime))
    let current: string
    try {
      current = await readFile(`/proc/${saved.pid}/stat`, 'utf8')
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return
      }
      throw error
    }
    const currentStart = current
      .slice(current.lastIndexOf(')') + 2)
      .trim()
      .split(/\s+/)[19]
    assert.notEqual(currentStart, saved.startTime, 'The exact owned worker must physically exit.')
  }
  try {
    await run({ assertExited, owner })
  } finally {
    await owner.shutdown()
    await assertExited(false)
    assert.equal(ProjectWorkerClient.hasUnconfirmedExit(), false)
    assert.equal(
      hash(await readFile(pythonExecutable)),
      sourceHash,
      'Worker fixture bytes are restored.',
    )
    await rm(scratch, { force: true, recursive: true })
  }
}

test(
  'failed configured handshake confirms child exit before returning stored diagnostics without a worker',
  { timeout: 15_000 },
  async () => {
    await withConfiguredWorker('9.9.9', async ({ assertExited, owner }) => {
      const expected = inspection()
      let reads = 0
      const actual = await inspectSmartPatchVariantsWithOptionalWorker(owner, async (worker) => {
        reads++
        assert.equal(worker, undefined)
        await assertExited()
        return expected
      })
      assert.equal(reads, 1)
      assert.deepEqual(actual, expected)
    })
  },
)

test(
  'a successful configured handshake uses its real worker lease and confirms exit before reply',
  { timeout: 15_000 },
  async () => {
    await withConfiguredWorker('0.1.0', async ({ assertExited, owner }) => {
      const expected = inspection()
      let reads = 0
      const actual = await inspectSmartPatchVariantsWithOptionalWorker(owner, async (worker) => {
        reads++
        assert.ok(worker)
        return expected
      })
      assert.equal(reads, 1)
      assert.deepEqual(actual, expected)
      await assertExited()
    })
  },
)

test('missing configured source performs one ordinary stored inspection without a worker', async () => {
  const owner = new ProjectTargetInspectionOwner(async () => null)
  const expected = inspection()
  let reads = 0
  try {
    assert.deepEqual(
      await inspectSmartPatchVariantsWithOptionalWorker(owner, async (worker) => {
        reads++
        assert.equal(worker, undefined)
        return expected
      }),
      expected,
    )
    assert.equal(reads, 1)
  } finally {
    await owner.shutdown()
  }
})

test('controlled unconfirmed startup exit refuses inspection instead of entering a workerless fallback', async () => {
  const uncertain = new ProjectWorkerError(
    'WORKER_EXIT_UNCONFIRMED',
    'Controlled unconfirmed startup exit.',
  )
  const owner = new ProjectTargetInspectionOwner(async () => {
    throw uncertain
  })
  let reads = 0
  try {
    await assert.rejects(
      inspectSmartPatchVariantsWithOptionalWorker(owner, async () => {
        reads++
        return inspection()
      }),
      (error: unknown) => error === uncertain,
    )
    assert.equal(reads, 0)
  } finally {
    await owner.shutdown()
  }
})

test(
  'a real worker lease drains before an ordinary document-read conflict is propagated unchanged',
  { timeout: 15_000 },
  async () => {
    await withConfiguredWorker('0.1.0', async ({ assertExited, owner }) => {
      const conflict = Object.assign(new Error('The document changed during inspection.'), {
        code: 'EDIT_CONFLICT',
      })
      let reads = 0
      await assert.rejects(
        inspectSmartPatchVariantsWithOptionalWorker(owner, async (worker) => {
          reads++
          assert.ok(worker)
          throw conflict
        }),
        (error: unknown) => error === conflict,
      )
      assert.equal(reads, 1, 'A document conflict must not trigger a second read.')
      await assertExited()
    })
  },
)
