import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, open, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

import {
  createInferenceAuxiliaryResourceRoot,
  InferenceAuxiliaryResources,
  outpaintInfillResourcePath,
  verifyInferenceAuxiliaryFile,
} from './inference-auxiliary-resources.ts'
import { LAMA_OUTPAINT_ARTIFACT } from './lama-manifest.ts'

const bytes = Buffer.from('synthetic local resource, not trained LaMa')
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const identity = (managedPath) => ({ byteSize: bytes.length, managedPath, sha256: sha256(bytes) })

test('real auxiliary verifier accepts exact bytes and refuses missing, changed, oversized and nonregular neighbors', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-inference-resource-'))
  const file = path.join(root, 'fixture.pt')
  try {
    await writeFile(file, bytes)
    await verifyInferenceAuxiliaryFile(identity(file))
    for (const [name, supplied] of [
      ['missing file', identity(path.join(root, 'missing.pt'))],
      ['different SHA', { ...identity(file), sha256: '0'.repeat(64) }],
      ['different size', { ...identity(file), byteSize: bytes.length - 1 }],
      ['invalid SHA syntax', { ...identity(file), sha256: 'NOT-A-SHA' }],
      [
        'size over pinned maximum',
        { ...identity(file), byteSize: LAMA_OUTPAINT_ARTIFACT.sizeBytes + 1 },
      ],
      ['noninteger size', { ...identity(file), byteSize: 1.5 }],
      ['zero size', { ...identity(file), byteSize: 0 }],
      ['relative path', identity('fixture.pt')],
      ['noncanonical path', identity(`${root}/../${path.basename(root)}/fixture.pt`)],
      ['directory', identity(root)],
    ]) {
      await t.test(name, async () => {
        await assert.rejects(verifyInferenceAuxiliaryFile(supplied), {
          code: 'GENERATION_RESOURCE_CHANGED',
        })
      })
    }
    await t.test('same-size changed actual bytes', async () => {
      await writeFile(file, Buffer.alloc(bytes.length, 73))
      await assert.rejects(verifyInferenceAuxiliaryFile(identity(file)), {
        code: 'GENERATION_RESOURCE_CHANGED',
      })
      await writeFile(file, bytes)
      await verifyInferenceAuxiliaryFile(identity(file))
    })
    await t.test('final and parent symlinks', async () => {
      const link = path.join(root, 'linked.pt')
      const parentLink = path.join(root, 'alias')
      await symlink(file, link)
      await symlink(root, parentLink)
      await assert.rejects(verifyInferenceAuxiliaryFile(identity(link)), {
        code: 'GENERATION_RESOURCE_CHANGED',
      })
      await assert.rejects(
        verifyInferenceAuxiliaryFile(identity(path.join(parentLink, 'fixture.pt'))),
        { code: 'GENERATION_RESOURCE_CHANGED' },
      )
    })
    await t.test('FIFO returns refusal without waiting for a writer', async () => {
      const fifo = path.join(root, 'pipe')
      await promisify(execFile)('mkfifo', [fifo])
      await assert.rejects(verifyInferenceAuxiliaryFile(identity(fifo)), {
        code: 'GENERATION_RESOURCE_CHANGED',
      })
    })
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('actual descriptor verification detects growth and equal-byte path replacement after a real read', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-inference-resource-race-'))
  const file = path.join(root, 'fixture.pt')
  try {
    for (const name of ['growth', 'path replacement', 'same-inode rewrite']) {
      await t.test(name, async () => {
        await writeFile(file, bytes)
        await withFirstActualRead(
          async () => {
            if (name === 'growth') {
              await writeFile(file, Buffer.concat([bytes, Buffer.from('extra')]))
            } else if (name === 'path replacement') {
              await rename(file, path.join(root, 'original.pt'))
              await writeFile(file, bytes)
            } else {
              await writeFile(file, bytes)
            }
          },
          async () => {
            await assert.rejects(verifyInferenceAuxiliaryFile(identity(file)), {
              code: 'GENERATION_RESOURCE_CHANGED',
            })
          },
        )
        await writeFile(file, bytes)
        await verifyInferenceAuxiliaryFile(identity(file))
      })
    }
    await t.test('caller changes retained identity after invocation', async () => {
      const supplied = identity(file)
      const checking = verifyInferenceAuxiliaryFile(supplied)
      supplied.sha256 = '0'.repeat(64)
      supplied.byteSize = 1
      supplied.managedPath = path.join(root, 'absent')
      await checking
    })
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('shared resource root is durable outside cache/environments, rejects links and preserves neighboring data', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-inference-resources-layout-'))
  try {
    await mkdir(path.join(root, 'cache'))
    await mkdir(path.join(root, 'runtime'))
    await mkdir(path.join(root, 'runtime', 'environments'))
    const marker = path.join(root, 'cache', 'keep.txt')
    await writeFile(marker, 'neighbor')
    const resources = await createInferenceAuxiliaryResourceRoot(root)
    assert.equal(resources, path.join(root, 'inference-resources'))
    assert.equal(outpaintInfillResourcePath(resources), path.join(resources, 'big-lama.pt'))
    assert.equal(await createInferenceAuxiliaryResourceRoot(root), resources)
    await assert.rejects(createInferenceAuxiliaryResourceRoot('relative'), {
      code: 'INVALID_INFERENCE_RESOURCE_ROOT',
    })
    await rm(resources, { recursive: true })
    await symlink(path.join(root, 'cache'), resources)
    await assert.rejects(createInferenceAuxiliaryResourceRoot(root), {
      code: 'INVALID_INFERENCE_RESOURCE_ROOT',
    })
    await assert.rejects(
      new InferenceAuxiliaryResources(resources).resolveVerifiedOutpaintInfill(),
      { code: 'INVALID_INFERENCE_RESOURCE_ROOT' },
    )
    assert.equal(await readFile(marker, 'utf8'), 'neighbor')
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('production resolver hard-pins actual LaMa manifest and does not accept a synthetic local model', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-fixed-lama-manifest-'))
  try {
    const resources = await createInferenceAuxiliaryResourceRoot(root)
    const resolver = new InferenceAuxiliaryResources(resources)
    await assert.rejects(resolver.resolveVerifiedOutpaintInfill(), {
      code: 'GENERATION_RESOURCE_CHANGED',
    })
    await writeFile(outpaintInfillResourcePath(resources), bytes)
    // The generic descriptor verifier qualifies this synthetic fixture; production must refuse it.
    await verifyInferenceAuxiliaryFile(identity(outpaintInfillResourcePath(resources)))
    await assert.rejects(resolver.resolveVerifiedOutpaintInfill(), {
      code: 'GENERATION_RESOURCE_CHANGED',
    })
    assert.equal(LAMA_OUTPAINT_ARTIFACT.sizeBytes, 205_669_692)
    assert.equal(
      LAMA_OUTPAINT_ARTIFACT.sha256,
      '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9',
    )
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

/** Keep actual OS file reads; only schedule one concurrent filesystem edit at the read boundary. */
async function withFirstActualRead(afterRead, use) {
  const handle = await open(import.meta.filename, 'r')
  const prototype = Object.getPrototypeOf(handle)
  const original = prototype.read
  await handle.close()
  let triggered = false
  prototype.read = async function (...args) {
    const result = await Reflect.apply(original, this, args)
    if (!triggered && result.bytesRead > 0) {
      triggered = true
      await afterRead()
    }
    return result
  }
  try {
    await use()
    assert.equal(triggered, true)
  } finally {
    prototype.read = original
  }
}
