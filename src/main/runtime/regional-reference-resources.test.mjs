import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  AuxiliaryArtifactInstaller,
  createLamaAuxiliaryInstaller,
  createRegionalReferenceAuxiliaryInstallers,
} from './inference-auxiliary-installer.ts'
import {
  auxiliaryArtifactMaximumBytes,
  createInferenceAuxiliaryResourceRoot,
  createRegionalReferenceVisionResourceRoot,
  InferenceAuxiliaryResources,
  regionalReferenceVisionResourcePath,
  verifyInferenceAuxiliaryFile,
  verifyInferenceAuxiliaryFiles,
} from './inference-auxiliary-resources.ts'
import { LAMA_OUTPAINT_ARTIFACT } from './lama-manifest.ts'
import {
  REGIONAL_REFERENCE_ADAPTER_ARTIFACT,
  REGIONAL_REFERENCE_ARTIFACTS,
  REGIONAL_REFERENCE_VISION_CONFIG_ARTIFACT,
  REGIONAL_REFERENCE_VISION_MODEL_ARTIFACT,
} from './regional-reference-manifest.ts'

const bytes = Buffer.from('synthetic regional reference installer fixture, not model weights')
const hash = (value) => createHash('sha256').update(value).digest('hex')

test('whole-group resource fence detects earlier file replacement while a later role verifies', async () => {
  await fixture(async ({ resources }) => {
    const first = path.join(resources, 'first.fixture')
    const second = path.join(resources, 'second.fixture')
    await writeFile(first, bytes)
    await writeFile(second, bytes)
    const descriptor = (managedPath) => ({ byteSize: bytes.length, managedPath, sha256: hash(bytes), maximumBytes: bytes.length })
    const later = descriptor(second)
    // A deterministic external write at the next verification boundary, after the first hash.
    Object.defineProperty(later, 'maximumBytes', { get() {
      writeFileSync(first, Buffer.alloc(bytes.length))
      return bytes.length
    } })
    await assert.rejects(verifyInferenceAuxiliaryFiles([descriptor(first), later]), /changed during verification/)
    assert.notEqual(hash(await readFile(first)), hash(bytes))
  })
})

async function fixture(use) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-regional-reference-resources-'))
  try {
    const resources = await createInferenceAuxiliaryResourceRoot(root)
    await use({ resources, root })
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

test('fixed reference installer previews pin the complete ViT-H pair and preserve LaMa policy without HTTP', async () => {
  await fixture(async ({ resources }) => {
    let requests = 0
    const downloader = {
      async download() {
        requests++
        throw new Error('unexpected network request')
      },
    }
    const installers = await createRegionalReferenceAuxiliaryInstallers(resources, downloader)
    const pairs = [
      [installers.adapter, REGIONAL_REFERENCE_ADAPTER_ARTIFACT],
      [installers.visionConfig, REGIONAL_REFERENCE_VISION_CONFIG_ARTIFACT],
      [installers.visionModel, REGIONAL_REFERENCE_VISION_MODEL_ARTIFACT],
    ]
    let downloadBytes = 0
    for (const [installer, manifest] of pairs) {
      const preview = await installer.preview()
      assert.deepEqual(preview.artifact, {
        filename: manifest.filename,
        role: manifest.role,
        sha256: manifest.sha256,
        sizeBytes: manifest.sizeBytes,
      })
      assert.equal(preview.scope, 'auxiliary-weights')
      assert.equal(preview.installed, false)
      assert.equal(preview.requiredDownloadBytes, manifest.sizeBytes)
      assert.equal(auxiliaryArtifactMaximumBytes(manifest.role), manifest.sizeBytes)
      downloadBytes += preview.requiredDownloadBytes
    }
    assert.equal(downloadBytes, 3_226_765_072)
    assert.equal(requests, 0)
    assert.deepEqual(await readdir(resources), ['illustrious-regional-reference-vision'])
    assert.deepEqual(await readdir(regionalReferenceVisionResourcePath(resources)), [])
    const lama = await createLamaAuxiliaryInstaller(resources, downloader).preview()
    assert.equal(lama.artifact.role, 'outpaint-infill')
    assert.equal(lama.requiredDownloadBytes, 205_669_692)
    assert.equal(auxiliaryArtifactMaximumBytes('outpaint-infill'), 205_669_692)
    assert.equal(Object.isFrozen(installers), true)
  })
})

test('regional resolver refuses missing, incomplete, synthetic and linked resources without creating files', async () => {
  await fixture(async ({ resources, root }) => {
    const resolver = new InferenceAuxiliaryResources(resources)
    await assert.rejects(resolver.resolveVerifiedRegionalReferenceResources(), {
      code: 'GENERATION_RESOURCE_CHANGED',
    })
    assert.deepEqual(await readdir(resources), [])
    const vision = await createRegionalReferenceVisionResourceRoot(resources)
    assert.equal(vision, path.join(resources, 'illustrious-regional-reference-vision'))
    assert.equal(await createRegionalReferenceVisionResourceRoot(resources), vision)
    await writeFile(path.join(resources, REGIONAL_REFERENCE_ADAPTER_ARTIFACT.filename), bytes)
    await assert.rejects(resolver.resolveVerifiedRegionalReferenceResources(), {
      code: 'GENERATION_RESOURCE_CHANGED',
    })
    for (const manifest of [
      REGIONAL_REFERENCE_VISION_CONFIG_ARTIFACT,
      REGIONAL_REFERENCE_VISION_MODEL_ARTIFACT,
    ]) {
      await writeFile(path.join(vision, manifest.filename), bytes)
    }
    await assert.rejects(resolver.resolveVerifiedRegionalReferenceResources(), {
      code: 'GENERATION_RESOURCE_CHANGED',
    })
    await rm(vision, { recursive: true })
    const neighbor = path.join(root, 'keep')
    await mkdir(neighbor)
    await writeFile(path.join(neighbor, 'marker'), 'preserve')
    await symlink(neighbor, vision)
    await assert.rejects(resolver.resolveVerifiedRegionalReferenceResources(), {
      code: 'GENERATION_RESOURCE_CHANGED',
    })
    await assert.rejects(createRegionalReferenceAuxiliaryInstallers(resources), {
      code: 'INVALID_INFERENCE_RESOURCE_ROOT',
    })
    assert.equal(await readFile(path.join(neighbor, 'marker'), 'utf8'), 'preserve')
  })
})

test('bounded verifier keeps the LaMa default and validates an explicit trusted role bound', async () => {
  await fixture(async ({ resources }) => {
    const managedPath = path.join(resources, 'fixture')
    await writeFile(managedPath, bytes)
    const identity = { byteSize: bytes.length, managedPath, sha256: hash(bytes) }
    await verifyInferenceAuxiliaryFile(identity, bytes.length)
    for (const maximum of [0, -1, 1.5, Number.POSITIVE_INFINITY, bytes.length - 1]) {
      await assert.rejects(verifyInferenceAuxiliaryFile(identity, maximum), {
        code: 'GENERATION_RESOURCE_CHANGED',
      })
    }
    await assert.rejects(
      verifyInferenceAuxiliaryFile({ ...identity, byteSize: LAMA_OUTPAINT_ARTIFACT.sizeBytes + 1 }),
      { code: 'GENERATION_RESOURCE_CHANGED' },
    )
    await verifyInferenceAuxiliaryFile(identity)
  })
})

test('each reference role uses the real staged publisher, independent verifier, cancellation and exact reuse', async (t) => {
  for (const artifact of REGIONAL_REFERENCE_ARTIFACTS) {
    await t.test(artifact.role, async () => {
      await fixture(async ({ resources }) => {
        const directory =
          artifact.role === 'regional-reference-adapter'
            ? resources
            : await createRegionalReferenceVisionResourceRoot(resources)
        const manifest = { ...artifact, sha256: hash(bytes), sizeBytes: bytes.length }
        let requests = 0
        let corrupt = true
        const installer = new AuxiliaryArtifactInstaller({
          downloader: {
            async download(input) {
              requests++
              assert.equal(input.source, 'invoke-regional-reference')
              assert.equal(input.url, artifact.url)
              assert.equal(input.expectedBytes, bytes.length)
              assert.equal(input.expectedSha256, hash(bytes))
              assert.equal(input.bearerToken, undefined)
              const stagingPath = path.join(input.stagingDirectory, `${randomUUID()}.part`)
              await writeFile(stagingPath, corrupt ? Buffer.alloc(bytes.length) : bytes, {
                flag: 'wx',
                mode: 0o600,
              })
              return { sha256: hash(bytes), sizeBytes: bytes.length, stagingPath }
            },
          },
          manifest,
          resourcesDirectory: directory,
        })
        const canceled = new AbortController()
        canceled.abort()
        await assert.rejects(
          installer.install((await installer.preview()).planId, { signal: canceled.signal }),
          { code: 'DOWNLOAD_CANCELED' },
        )
        assert.equal(requests, 0)
        await assert.rejects(installer.install((await installer.preview()).planId), {
          code: 'GENERATION_RESOURCE_CHANGED',
        })
        assert.equal(requests, 1)
        assert.deepEqual(await readdir(directory), [])
        corrupt = false
        const installed = await installer.install((await installer.preview()).planId)
        assert.deepEqual(installed, {
          byteSize: bytes.length,
          managedPath: path.join(directory, artifact.filename),
          reused: false,
          role: artifact.role,
          sha256: hash(bytes),
        })
        assert.deepEqual(await readFile(installed.managedPath), bytes)
        const again = await installer.preview()
        assert.equal(again.installed, true)
        assert.equal(again.requiredDownloadBytes, 0)
        assert.equal((await installer.install(again.planId)).reused, true)
        assert.equal(requests, 2)
      })
    })
  }
})

test('trusted installer applies distinct role ceilings without widening the outpaint role', async () => {
  await fixture(async ({ resources }) => {
    for (const artifact of [...REGIONAL_REFERENCE_ARTIFACTS, LAMA_OUTPAINT_ARTIFACT]) {
      assert.throws(
        () =>
          new AuxiliaryArtifactInstaller({
            downloader: { async download() {} },
            manifest: {
              ...artifact,
              sizeBytes: artifact.sizeBytes + 1,
              source: artifact.source ?? 'invoke-lama',
            },
            resourcesDirectory: resources,
          }),
        { code: 'AUXILIARY_INVALID_MANIFEST' },
      )
    }
  })
})
