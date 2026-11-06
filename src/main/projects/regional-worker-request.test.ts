import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import { defaultIllustriousNoiseProfile } from '../../shared/projects/illustrious-noise-profile.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { crc32, deflateSync } from 'node:zlib'

import type { FrozenGenerationEmbedding } from './illustrious-generation-embeddings.js'
import type { RegionalWorkerInput, RegionalWorkerLease } from './regional-worker-request.js'

import {
  prepareRegionalWorkerRequest,
  readRegionalWorkerResult,
} from './regional-worker-request.js'

const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

interface Fixture {
  input: RegionalWorkerInput
  profile: Buffer
  root: string
  scratch: string
  targetBytes: Buffer
}

type Bundle = {
  globalNegativeCoverage: {
    alpha?: { $alpha8: { byteSize: number; path: string; sha256: string } }
    height?: number
    kind: string
    width?: number
  }
  globalPositiveCoverage: { kind: string }
  recipe: RegionalWorkerInput['recipe'] & {
    regions: {
      coverage: { alpha: { $alpha8: { byteSize: number; path: string; sha256: string } } }
    }[]
  }
  request: RegionalWorkerInput['request']
  schemaVersion: number
}

/** Literal transport fixtures, with actual pinned-ICC PNGs; these do not claim native inference. */
function png(width: number, height: number, profile: Buffer, alpha: number | null): Buffer {
  const chunk = (name: string, data: Buffer): Buffer => {
    const out = Buffer.alloc(data.length + 12)
    out.writeUInt32BE(data.length)
    out.write(name, 4)
    data.copy(out, 8)
    out.writeUInt32BE(crc32(out.subarray(4, -4)), out.length - 4)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = alpha === null ? 2 : 6
  const channels = alpha === null ? 3 : 4
  const stride = width * channels + 1
  const rows = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      rows.set(alpha === null ? [41, 83, 127] : [41, 83, 127, alpha], y * stride + 1 + x * channels)
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('iCCP', Buffer.concat([Buffer.from('srgb\0\0'), deflateSync(profile)])),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

async function withFixture(run: (fixture: Fixture) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-regional-request-'))
  try {
    const scratch = path.join(root, 'scratch')
    const source = path.join(root, 'source')
    await mkdir(scratch, { mode: 0o700 })
    await mkdir(source, { mode: 0o700 })
    const profile = await readFile(
      new URL('../../../worker-python/src/imagegen_worker/srgb.icc', import.meta.url),
    )
    assert.equal(sha(profile), IGS_SRGB_ICC_SHA256)
    const targetBytes = png(64, 64, profile, 0)
    const targetPath = path.join(source, 'target.png')
    const checkpoint = path.join(root, 'checkpoint.bin')
    await writeFile(targetPath, targetBytes)
    await writeFile(checkpoint, 'declared checkpoint transport fixture')
    const bbox = { height: 64, width: 64, x: -13, y: 5 }
    const prompt = (text: string) => ({ embeddingRefs: [], text })
    const input: RegionalWorkerInput = {
      globalNegativeCoverage: { kind: 'everywhere' },
      globalPositiveCoverage: { kind: 'everywhere' },
      layout: 'cfg-negative-first',
      negativePooledSourceId: 'current-canvas',
      positivePooledSourceId: 'current-canvas',
      recipe: {
        bbox: { ...bbox },
        documentId: randomUUID(),
        documentRevision: randomUUID(),
        family: 'illustrious',
        globalEmbeddings: { negative: [], positive: [] },
        globalPrompts: { negative: prompt('negative'), positive: prompt('global') },
        item: {
          iteration: 0,
          promptPairIndex: 0,
          prompts: { negative: 'negative', positive: 'global' },
          seed: 123,
        },
        kind: 'current-canvas-regional-recipe',
        regions: [
          {
            authoredPrompts: {
              negative: null,
              positive: prompt('regional'),
              useGlobalNegativePrompt: true,
            },
            coverage: {
              alpha: new Uint8Array(64 * 64).fill(128),
              bounds: { ...bbox },
              intersection: { ...bbox },
              kind: 'covered',
            },
            embeddings: { negative: [], positive: [] },
            maskId: randomUUID(),
            maskRevision: 1,
            negative: { prompt: prompt('negative'), source: 'current-canvas' },
            positive: prompt('regional'),
            regionId: randomUUID(),
          },
        ],
      },
      request: {
        job: {
          bbox,
          checkpoint: {
            path: checkpoint,
            predictionType: 'epsilon',
            sha256: sha(Buffer.from('declared checkpoint transport fixture')),
          },
          output: { pngPath: path.join(source, 'original-result.png'), stagingRoot: source },
          prompts: { negative: 'negative', positive: 'global' },
          sampling: {
            cfgRescale: 0,
            cfgScale: 5,
            noiseProfile: defaultIllustriousNoiseProfile(),
            scheduler: 'euler',
            seed: 123,
            steps: 20,
          },
          schemaVersion: 1,
          target: {
            byteSize: targetBytes.length,
            height: 64,
            iccSha256: IGS_SRGB_ICC_SHA256,
            path: targetPath,
            sha256: sha(targetBytes),
            width: 64,
          },
          vaePrecision: 'FP16',
        },
        protocolVersion: '1',
        requestId: randomUUID(),
        type: 'generate-illustrious-txt2img',
      },
    }
    await run({ input, profile, root, scratch, targetBytes })
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

const bundleOf = async (lease: RegionalWorkerLease): Promise<Bundle> =>
  JSON.parse(await readFile(lease.wire.bundle.path, 'utf8')) as Bundle

test('regional wire owns exact recipe, raw alpha and target beyond the originating capture', async () => {
  await withFixture(async ({ input, scratch, targetBytes }) => {
    const original = structuredClone(input)
    const lease = await prepareRegionalWorkerRequest(input, scratch)
    try {
      assert.deepEqual(input, original)
      assert.equal(lease.wire.type, 'execute-current-canvas-regional')
      assert.equal(lease.wire.protocolVersion, '1')
      assert.equal(lease.wire.requestId, input.request.requestId)
      assert.equal(path.dirname(lease.wire.stagingRoot), scratch)
      assert.equal(Buffer.byteLength(JSON.stringify(lease.wire)) < 64 * 1024, true)
      const bundleBytes = await readFile(lease.wire.bundle.path)
      assert.equal(bundleBytes.length, lease.wire.bundle.byteSize)
      assert.equal(sha(bundleBytes), lease.wire.bundle.sha256)
      const bundle = await bundleOf(lease)
      assert.equal(bundle.schemaVersion, 1)
      assert.deepEqual(bundle.request, lease.request)
      assert.deepEqual(bundle.recipe.item, input.recipe.item)
      assert.deepEqual(bundle.recipe.globalPrompts, input.recipe.globalPrompts)
      assert.deepEqual(
        bundle.recipe.regions[0].authoredPrompts,
        input.recipe.regions[0].authoredPrompts,
      )
      const descriptor = bundle.recipe.regions[0].coverage.alpha.$alpha8
      const alpha = await readFile(descriptor.path)
      assert.equal(alpha.length, 4096)
      assert.equal(descriptor.byteSize, alpha.length)
      assert.equal(descriptor.sha256, sha(alpha))
      assert.deepEqual(alpha, Buffer.from(input.recipe.regions[0].coverage.alpha))
      assert.equal(path.dirname(descriptor.path), lease.wire.stagingRoot)
      assert.deepEqual(await readFile(lease.request.job.target.path), targetBytes)
      await rm(input.request.job.target.path)
      input.recipe.regions[0].coverage.alpha.fill(0)
      assert.deepEqual(await readFile(lease.request.job.target.path), targetBytes)
      assert.equal(
        (await readFile(descriptor.path)).every((value) => value === 128),
        true,
      )
      assert.equal((await lstat(lease.wire.stagingRoot)).mode & 0o077, 0)
    } finally {
      await lease.dispose()
    }
    assert.deepEqual(await readdir(scratch), [])
  })
})

test('regional input detaches synchronously before its first filesystem await', async () => {
  await withFixture(async ({ input, scratch }) => {
    const prepared = prepareRegionalWorkerRequest(input, scratch)
    input.request.job.sampling.seed = 999
    Object.assign(input.recipe.item, { seed: 999 })
    input.recipe.regions[0].coverage.alpha.fill(0)
    input.recipe.globalPrompts.positive.text = 'later text'
    const lease = await prepared
    try {
      assert.equal(lease.request.job.sampling.seed, 123)
      const bundle = await bundleOf(lease)
      assert.equal(bundle.recipe.item.seed, 123)
      assert.equal(bundle.recipe.globalPrompts.positive.text, 'global')
      assert.equal(
        (await readFile(bundle.recipe.regions[0].coverage.alpha.$alpha8.path)).every(
          (value) => value === 128,
        ),
        true,
      )
      assert.equal(Object.isFrozen(lease.request.job.sampling), true)
      assert.equal(Object.isFrozen(lease.wire.bundle), true)
    } finally {
      await lease.dispose()
    }
  })
})

test('regional global alpha remains an independent latent-resolution descriptor', async () => {
  await withFixture(async ({ input, scratch }) => {
    input.globalNegativeCoverage = {
      alpha: new Uint8Array(64).fill(127),
      height: 8,
      kind: 'alpha8',
      width: 8,
    }
    const lease = await prepareRegionalWorkerRequest(input, scratch)
    try {
      const bundle = await bundleOf(lease)
      assert.equal(bundle.globalNegativeCoverage.kind, 'alpha8')
      assert.equal(bundle.globalNegativeCoverage.width, 8)
      assert.equal(bundle.globalNegativeCoverage.height, 8)
      const file = bundle.globalNegativeCoverage.alpha!.$alpha8
      assert.equal(file.byteSize, 64)
      assert.equal(file.sha256, sha(Buffer.alloc(64, 127)))
      assert.deepEqual(await readFile(file.path), Buffer.alloc(64, 127))
      assert.deepEqual(bundle.globalPositiveCoverage, { kind: 'everywhere' })
    } finally {
      await lease.dispose()
    }
  })
})

test('regional zero-region positive-only input preserves genuine empty resource fields', async () => {
  await withFixture(async ({ input, scratch }) => {
    input.recipe.regions = []
    input.request.job.sampling.cfgScale = 1
    input.request.job.embeddings = { negative: [], positive: [] }
    input.request.job.loras = []
    input.layout = 'positive-only'
    const lease = await prepareRegionalWorkerRequest(input, scratch)
    try {
      const bundle = await bundleOf(lease)
      assert.deepEqual(bundle.recipe.regions, [])
      assert.deepEqual(bundle.recipe.globalEmbeddings, { negative: [], positive: [] })
      assert.deepEqual(bundle.request.job.embeddings, { negative: [], positive: [] })
      assert.deepEqual(bundle.request.job.loras, [])
      assert.deepEqual((await readdir(lease.wire.stagingRoot)).sort(), [
        'bundle.json',
        'target.png',
      ])
      assert.equal(bundle.request.job.sampling.cfgScale, 1)
    } finally {
      await lease.dispose()
    }
  })
})

test('regional binding resources preserve exact stream identity without copying model bytes', async () => {
  await withFixture(async ({ input, root, scratch }) => {
    const resource = async (name: string): Promise<FrozenGenerationEmbedding> => {
      const content = Buffer.from(`declared ${name} resource`)
      const managedPath = path.join(root, `${name}.safetensors`)
      await writeFile(managedPath, content)
      return {
        byteSize: content.length,
        managedPath,
        reference: {
          baseModelFamily: 'illustrious',
          civitaiFileId: 1,
          civitaiModelId: 2,
          civitaiVersionId: 3,
          displayName: `saved ${name}`,
          fileSha256: sha(content),
          kind: 'embedding',
          localModelId: randomUUID(),
          localVersionId: randomUUID(),
          predictionType: null,
          versionName: `saved ${name} version`,
        },
        token: '<same>',
      }
    }
    const global = await resource('global')
    const regional = await resource('regional')
    input.request.job.prompts.positive = '<same>'
    Object.assign(input.recipe.item.prompts, { positive: '<same>' })
    input.recipe.globalPrompts.positive = {
      embeddingRefs: [{ resource: global.reference, token: global.token }],
      text: '<same>',
    }
    input.recipe.globalEmbeddings!.positive = [global]
    input.recipe.regions[0].positive = {
      embeddingRefs: [{ resource: regional.reference, token: regional.token }],
      text: '<same>',
    }
    input.recipe.regions[0].embeddings!.positive = [regional]
    const lease = await prepareRegionalWorkerRequest(input, scratch)
    try {
      const bundle = await bundleOf(lease)
      assert.deepEqual(bundle.recipe.globalEmbeddings!.positive, [global])
      assert.deepEqual(bundle.recipe.regions[0].embeddings!.positive, [regional])
      assert.notEqual(global.reference.fileSha256, regional.reference.fileSha256)
      assert.deepEqual((await readdir(lease.wire.stagingRoot)).sort(), [
        'bundle.json',
        'region-0.alpha8',
        'target.png',
      ])
    } finally {
      await lease.dispose()
    }
    assert.equal((await lstat(global.managedPath)).isFile(), true)
  })
})

const invalidCases: [string, (input: RegionalWorkerInput) => void][] = [
  ['wrong-family', (value) => Object.assign(value.recipe, { family: 'anima' })],
  ['subclass-fields', (value) => Object.assign(value.request.job, { denoisingStrength: 0.5 })],
  [
    'missing-resolved-policy',
    (value) => {
      delete value.request.job.sampling.noiseProfile
    },
  ],
  ['boolean-steps', (value) => Object.assign(value.request.job.sampling, { steps: true })],
  [
    'non-FP16',
    (value) => {
      value.request.job.vaePrecision = 'Auto'
    },
  ],
  [
    'external-VAE',
    (value) =>
      Object.assign(value.request.job, {
        vae: { byteSize: 1, path: '/unrelated.vae', sha256: 'a'.repeat(64) },
      }),
  ],
  [
    'independent-embedding',
    (value) =>
      Object.assign(value.request.job, {
        embeddings: {
          negative: [],
          positive: [{ byteSize: 1, path: '/other.ti', sha256: 'a'.repeat(64), token: '<same>' }],
        },
      }),
  ],
  [
    'independent-negative-embedding',
    (value) =>
      Object.assign(value.request.job, {
        embeddings: {
          negative: [{ byteSize: 1, path: '/other.ti', sha256: 'a'.repeat(64), token: '<same>' }],
          positive: [],
        },
      }),
  ],
  [
    'independent-lora',
    (value) =>
      Object.assign(value.request.job, {
        loras: [{ byteSize: 1, path: '/other.lora', sha256: 'a'.repeat(64), weight: 1 }],
      }),
  ],
  [
    'regional-reference-image',
    (value) => Object.assign(value.recipe.regions[0], { referenceImages: [{}] }),
  ],
  [
    'seed-disagreement',
    (value) => {
      Object.assign(value.recipe.item, { seed: value.recipe.item.seed + 1 })
    },
  ],
  [
    'bbox-origin-disagreement',
    (value) => {
      value.recipe.bbox.x++
    },
  ],
  [
    'global-text-disagreement',
    (value) => {
      value.recipe.globalPrompts.positive.text = 'other'
    },
  ],
  [
    'inherited-negative-disagreement',
    (value) => {
      value.recipe.regions[0].negative.prompt.text = 'other'
    },
  ],
  [
    'world-alpha-length',
    (value) => {
      value.recipe.regions[0].coverage.alpha = new Uint8Array(1)
    },
  ],
  [
    'global-alpha-world-grid',
    (value) => {
      value.globalPositiveCoverage = {
        alpha: new Uint8Array(4096),
        height: 64,
        kind: 'alpha8',
        width: 64,
      }
    },
  ],
  [
    'wrong-layout',
    (value) => {
      value.layout = 'positive-only'
    },
  ],
  [
    'unknown-pool',
    (value) => {
      value.positivePooledSourceId = 'unknown-source'
    },
  ],
  ['unknown-input-key', (value) => Object.assign(value, { managers: [] })],
  [
    'too-many-regions',
    (value) => {
      value.recipe.regions = Array.from({ length: 4 }, () =>
        structuredClone(value.recipe.regions[0]),
      )
    },
  ],
]
for (const [name, alter] of invalidCases) {
  test(`regional ${name} refuses before creating a request stage`, async () => {
    await withFixture(async ({ input, scratch }) => {
      alter(input)
      await assert.rejects(prepareRegionalWorkerRequest(input, scratch), {
        code: 'INVALID_REQUEST',
      })
      assert.deepEqual(await readdir(scratch), [])
    })
  })
}

for (const alpha of [127, 255]) {
  test(`regional target with alpha ${alpha} refuses without changing caller files`, async () => {
    await withFixture(async ({ input, profile, scratch }) => {
      const bytes = png(64, 64, profile, alpha)
      await writeFile(input.request.job.target.path, bytes)
      Object.assign(input.request.job.target, { byteSize: bytes.length, sha256: sha(bytes) })
      await assert.rejects(prepareRegionalWorkerRequest(input, scratch), {
        code: 'INVALID_REQUEST',
      })
      assert.deepEqual(await readdir(scratch), [])
      assert.deepEqual(await readFile(input.request.job.target.path), bytes)
    })
  })
}

test('regional stale target hash and linked source fail before request-stage publication', async () => {
  await withFixture(async ({ input, root, scratch }) => {
    input.request.job.target.sha256 = 'a'.repeat(64)
    await assert.rejects(prepareRegionalWorkerRequest(input, scratch), { code: 'OUTPUT_MISMATCH' })
    const checkpoint = input.request.job.checkpoint.path
    const link = path.join(root, 'linked-checkpoint.bin')
    await symlink(checkpoint, link)
    input.request.job.checkpoint.path = link
    await assert.rejects(prepareRegionalWorkerRequest(input, scratch), { code: 'INVALID_PATH' })
    assert.deepEqual(await readdir(scratch), [])
  })
})

test('regional oversized complete metadata rolls back its own new stage', async () => {
  await withFixture(async ({ input, scratch }) => {
    Object.assign(input.recipe.regions[0], {
      authoredPrompts: { note: 'x'.repeat(1024 * 1024 + 1) },
    })
    await assert.rejects(prepareRegionalWorkerRequest(input, scratch), /bundle exceeds 1 MiB/)
    assert.deepEqual(await readdir(scratch), [])
  })
})

test('regional unsafe scratch refuses without traversing a linked directory', async () => {
  await withFixture(async ({ input, root, scratch }) => {
    const linked = path.join(root, 'linked-scratch')
    await symlink(scratch, linked)
    await assert.rejects(prepareRegionalWorkerRequest(input, linked), { code: 'INVALID_PATH' })
    await chmod(scratch, 0o777)
    await assert.rejects(prepareRegionalWorkerRequest(input, scratch), { code: 'INVALID_PATH' })
    await chmod(scratch, 0o700)
    assert.deepEqual(await readdir(scratch), [])
  })
})

test('regional response verifies exact RGB bytes and keeps them after idempotent disposal', async () => {
  await withFixture(async ({ input, profile, scratch, targetBytes }) => {
    const originalOutput = input.request.job.output.pngPath
    await writeFile(originalOutput, 'caller-owned existing output')
    const lease = await prepareRegionalWorkerRequest(input, scratch)
    const rgb = png(64, 64, profile, null)
    await writeFile(lease.request.job.output.pngPath, rgb)
    const done = {
      outputPath: lease.request.job.output.pngPath,
      protocolVersion: '1',
      requestId: input.request.requestId,
      seed: 123,
      type: 'generation-done',
    }
    const result = await readRegionalWorkerResult(lease, done)
    assert.equal(result.seed, 123)
    assert.equal(result.output.sha256, sha(rgb))
    assert.equal(result.output.byteSize, rgb.length)
    assert.equal(result.output.iccSha256, IGS_SRGB_ICC_SHA256)
    assert.deepEqual(result.pngBytes, rgb)
    assert.equal((await lstat(lease.wire.stagingRoot)).isDirectory(), true)
    await lease.dispose()
    await lease.dispose()
    assert.deepEqual(result.pngBytes, rgb)
    assert.deepEqual(await readdir(scratch), [])
    assert.equal(await readFile(originalOutput, 'utf8'), 'caller-owned existing output')
    assert.deepEqual(await readFile(input.request.job.target.path), targetBytes)
    await assert.rejects(readRegionalWorkerResult(lease, done), { code: 'INVALID_REQUEST' })
  })
})

test('regional completion mismatch and malformed output retain the lease for the child owner', async () => {
  await withFixture(async ({ input, profile, scratch }) => {
    const lease = await prepareRegionalWorkerRequest(input, scratch)
    try {
      const output = lease.request.job.output.pngPath
      await writeFile(output, png(64, 64, profile, null))
      const done = {
        outputPath: output,
        protocolVersion: '1',
        requestId: input.request.requestId,
        seed: 123,
        type: 'generation-done',
      }
      for (const altered of [
        { ...done, requestId: randomUUID() },
        { ...done, seed: 124 },
        { ...done, outputPath: input.request.job.output.pngPath },
        { ...done, type: 'smart-patch-executed' },
        { ...done, unexpected: true },
      ]) {
        await assert.rejects(readRegionalWorkerResult(lease, altered), { code: 'OUTPUT_MISMATCH' })
        assert.equal((await lstat(lease.wire.bundle.path)).isFile(), true)
      }
      await writeFile(output, png(64, 64, profile, 0))
      await assert.rejects(readRegionalWorkerResult(lease, done), { code: 'OUTPUT_MISMATCH' })
      await writeFile(output, png(64, 64, profile, null))
      assert.equal((await readRegionalWorkerResult(lease, done)).seed, 123)
    } finally {
      await lease.dispose()
    }
  })
})

test('regional disposal refuses a replaced stage and can retry after exact restoration', async () => {
  await withFixture(async ({ input, scratch }) => {
    const lease = await prepareRegionalWorkerRequest(input, scratch)
    const original = `${lease.wire.stagingRoot}-preserved`
    await rename(lease.wire.stagingRoot, original)
    await mkdir(lease.wire.stagingRoot, { mode: 0o700 })
    await writeFile(path.join(lease.wire.stagingRoot, 'foreign.txt'), 'protected replacement')
    await assert.rejects(lease.dispose(), { code: 'INVALID_PATH' })
    assert.equal(
      await readFile(path.join(lease.wire.stagingRoot, 'foreign.txt'), 'utf8'),
      'protected replacement',
    )
    await rm(lease.wire.stagingRoot, { recursive: true })
    await rename(original, lease.wire.stagingRoot)
    await lease.dispose()
    assert.deepEqual(await readdir(scratch), [])
  })
})

test('regional disposal does not follow an unexpected linked worker entry', async () => {
  await withFixture(async ({ input, root, scratch }) => {
    const lease = await prepareRegionalWorkerRequest(input, scratch)
    const external = path.join(root, 'external.txt')
    await writeFile(external, 'protected external bytes')
    const link = path.join(lease.wire.stagingRoot, 'linked-output')
    await symlink(external, link)
    await assert.rejects(lease.dispose(), { code: 'INVALID_PATH' })
    assert.equal(await readFile(external, 'utf8'), 'protected external bytes')
    await rm(link)
    await lease.dispose()
  })
})

for (const scheduler of ['euler', 'euler_a'] as const) {
  test(`private regional wire preserves exact ${scheduler} sampling without changing its caller`, async () => {
    await withFixture(async ({ input, scratch }) => {
      input.request.job.sampling.scheduler = scheduler
      input.request.job.sampling.steps = 28
      const original = structuredClone(input)
      const lease = await prepareRegionalWorkerRequest(input, scratch)
      try {
        const bundle = await bundleOf(lease)
        assert.equal(bundle.request.job.sampling.scheduler, scheduler)
        assert.equal(bundle.request.job.sampling.steps, 28)
        assert.deepEqual(
          bundle.request.job.sampling.noiseProfile,
          original.request.job.sampling.noiseProfile,
        )
        assert.deepEqual(input, original)
      } finally {
        await lease.dispose()
      }
    })
  })
}

test('private regional wire still refuses a different ordinary sampler before creating a lease', async () => {
  await withFixture(async ({ input, scratch }) => {
    input.request.job.sampling.scheduler = 'dpmpp_2m'
    await assert.rejects(prepareRegionalWorkerRequest(input, scratch))
    assert.deepEqual(await readdir(scratch), [])
  })
})

async function useOpaqueImgFixture(fixture: Fixture, strength = 0.5): Promise<void> {
  const { input, profile } = fixture
  input.compositionProfile = 'invoke-canvas-v1'
  input.globalNegativeCoverage = { kind: 'everywhere' }
  input.globalPositiveCoverage = { kind: 'everywhere' }
  const bytes = png(64, 64, profile, 255)
  await writeFile(input.request.job.target.path, bytes)
  input.request = {
    ...input.request,
    job: {
      ...input.request.job,
      sampling: { ...input.request.job.sampling, denoisingStrength: strength },
      target: { ...input.request.job.target, byteSize: bytes.length, sha256: sha(bytes) },
    },
    type: 'generate-illustrious-img2img',
  }
}

for (const strength of [0, 0.5, 1]) {
  test(`public regional image bundle owns opaque pixels and explicit strength ${strength}`, async () => {
    await withFixture(async (fixture) => {
      await useOpaqueImgFixture(fixture, strength)
      const before = structuredClone(fixture.input)
      const source = await readFile(fixture.input.request.job.target.path)
      const lease = await prepareRegionalWorkerRequest(fixture.input, fixture.scratch)
      try {
        const bundle = await bundleOf(lease)
        assert.equal(bundle.request.type, 'generate-illustrious-img2img')
        assert.equal(lease.request.type, 'generate-illustrious-img2img')
        assert.ok(bundle.request.type === 'generate-illustrious-img2img')
        assert.equal(bundle.request.job.sampling.denoisingStrength, strength)
        assert.deepEqual(fixture.input, before)
        assert.ok((await readFile(lease.request.job.target.path)).equals(source))
        await rm(fixture.input.request.job.target.path)
        assert.ok((await readFile(lease.request.job.target.path)).equals(source))
      } finally {
        await lease.dispose()
      }
      assert.deepEqual(await readdir(fixture.scratch), [])
    })
  })
}

for (const fault of [
  'private',
  'init',
  'ancestral',
  'dpm',
  'rescale',
  'auto',
  'fp32',
  'missing-strength',
  'bool-strength',
  'overflow-strength',
]) {
  test(`regional img2img refuses ${fault} before creating its transport lease`, async () => {
    await withFixture(async (fixture) => {
      await useOpaqueImgFixture(fixture)
      const { input } = fixture
      assert.ok(input.request.type === 'generate-illustrious-img2img')
      switch (fault) {
        case 'ancestral': {
          input.request.job.sampling.scheduler = 'euler_a'
          break
        }
        case 'auto':
        case 'fp32': {
          input.request.job.vaePrecision = fault === 'auto' ? 'Auto' : 'FP32'
          break
        }
        case 'dpm': {
          input.request.job.sampling.scheduler = 'dpmpp_2m'
          break
        }
        case 'init': {
          input.initializationProfile = 'invoke-cpu-f32-add-noise-v1'
          break
        }
        case 'missing-strength': {
          Reflect.deleteProperty(input.request.job.sampling, 'denoisingStrength')
          break
        }
        case 'private': {
          delete input.compositionProfile
          break
        }
        case 'rescale': {
          input.request.job.sampling.cfgRescale = 0.7
          break
        }
        default: {
          Object.assign(input.request.job.sampling, {
            denoisingStrength: fault === 'bool-strength' ? true : 1.1,
          })
        }
      }
      await assert.rejects(prepareRegionalWorkerRequest(input, fixture.scratch))
      assert.deepEqual(await readdir(fixture.scratch), [])
    })
  })
}

for (const alpha of [0, 127]) {
  test(`regional img2img refuses alpha ${alpha} despite matching declared PNG identity`, async () => {
    await withFixture(async (fixture) => {
      await useOpaqueImgFixture(fixture)
      const target = fixture.input.request.job.target
      const bytes = png(64, 64, fixture.profile, alpha)
      await writeFile(target.path, bytes)
      target.sha256 = sha(bytes)
      target.byteSize = bytes.length
      await assert.rejects(prepareRegionalWorkerRequest(fixture.input, fixture.scratch))
      assert.deepEqual(await readdir(fixture.scratch), [])
    })
  })
}
