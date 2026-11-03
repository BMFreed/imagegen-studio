import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import { defaultIllustriousNoiseProfile } from '../../shared/projects/illustrious-noise-profile.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { chmod, link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import type { FrozenQueuedIllustriousTxt2ImgV1 } from './generation-queue.js'
import type {
  FrozenQueuedRegionalV1,
  RegionalQueuedMaterial,
} from './regional-queued-generation.js'
import type { RegionalWorkerInput } from './regional-worker-request.js'

import { parseFrozenGenerationPayloadV1 } from './generation-queue.js'
import {
  captureRegionalQueuedMaterial,
  loadRegionalQueuedFiles,
  loadRegionalQueuedInput,
  parseFrozenQueuedRegionalV1,
} from './regional-queued-generation.js'

const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
const isInvalid = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'QUEUE_INPUT_INVALID'

interface Fixture {
  input: RegionalWorkerInput
  material: RegionalQueuedMaterial
  payload: FrozenQueuedRegionalV1
  root: string
}

function inputFixture(root: string): RegionalWorkerInput {
  const prompt = (text: string) => ({ embeddingRefs: [], text })
  const bbox = { height: 64, width: 64, x: -13, y: 5 }
  const negative = prompt('quiet background')
  const positive = prompt('two separate objects')
  const bytes = Uint8Array.from({ length: 64 * 64 }, (_, index) => index % 251)
  return {
    globalNegativeCoverage: {
      alpha: Uint8Array.from({ length: 8 * 8 }, (_, index) => index * 4),
      height: 8,
      kind: 'alpha8',
      width: 8,
    },
    globalPositiveCoverage: { kind: 'everywhere' },
    layout: 'cfg-negative-first',
    negativePooledSourceId: 'current-canvas',
    positivePooledSourceId: 'current-canvas',
    recipe: {
      bbox,
      documentId: randomUUID(),
      documentRevision: randomUUID(),
      family: 'illustrious',
      globalEmbeddings: { negative: [], positive: [] },
      globalPrompts: { negative, positive },
      item: {
        iteration: 0,
        promptPairIndex: 0,
        prompts: { negative: negative.text, positive: positive.text },
        seed: 123,
      },
      kind: 'current-canvas-regional-recipe',
      regions: [
        {
          authoredPrompts: {
            negative: null,
            positive: prompt('a red apple'),
            useGlobalNegativePrompt: true,
          },
          coverage: {
            alpha: bytes,
            bounds: { ...bbox },
            intersection: { ...bbox },
            kind: 'covered',
          },
          embeddings: { negative: [], positive: [] },
          maskId: randomUUID(),
          maskRevision: 7,
          negative: { prompt: negative, source: 'current-canvas' },
          positive: prompt('a red apple'),
          regionId: randomUUID(),
        },
      ],
    },
    request: {
      job: {
        bbox: { ...bbox },
        checkpoint: {
          path: path.join(root, 'installed-checkpoint.safetensors'),
          predictionType: 'epsilon',
          sha256: '1'.repeat(64),
        },
        output: { pngPath: path.join(root, 'result.png'), stagingRoot: root },
        prompts: { negative: negative.text, positive: positive.text },
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
          byteSize: 512,
          height: 64,
          iccSha256: IGS_SRGB_ICC_SHA256,
          path: path.join(root, 'target.png'),
          sha256: '2'.repeat(64),
          width: 64,
        },
        vaePrecision: 'FP16',
      },
      protocolVersion: '1',
      requestId: randomUUID(),
      type: 'generate-illustrious-txt2img',
    },
  }
}

function frozenPayload(
  input: RegionalWorkerInput,
  regional: FrozenQueuedRegionalV1['regional'],
): FrozenQueuedRegionalV1 {
  const { output: _output, target, ...job } = structuredClone(input.request.job)
  const { path: _targetPath, ...descriptor } = target
  const ordinary: FrozenQueuedIllustriousTxt2ImgV1 = {
    context: {
      bbox: input.recipe.bbox,
      documentId: input.recipe.documentId,
      documentRevision: input.recipe.documentRevision,
      kind: 'normal-txt2img-preparation',
      model: {
        managedPath: job.checkpoint.path,
        reference: {
          baseModelFamily: 'illustrious',
          civitaiFileId: 3,
          civitaiModelId: 1,
          civitaiVersionId: 2,
          displayName: 'Exact checkpoint',
          fileSha256: job.checkpoint.sha256,
          kind: 'checkpoint',
          localModelId: randomUUID(),
          localVersionId: randomUUID(),
          predictionType: 'epsilon',
          versionName: 'Saved version',
        },
      },
      prompts: job.prompts,
      sampling: {
        ...job.sampling,
        invokeScheduler: 'euler',
        requestedSeedPolicy: 'fixed',
        sampler: 'Euler',
        scheduler: 'Normal',
      },
      schemaVersion: 1,
      target: { ...descriptor, colorSpace: 'srgb', format: 'png' },
      vaePrecision: 'FP16',
    },
    kind: 'illustrious-txt2img',
    originRequestId: input.request.requestId,
    schemaVersion: 1,
    workerJob: { ...job, target: descriptor },
  }
  return { ...ordinary, kind: 'illustrious-regional', regional }
}

async function withFixture(run: (fixture: Fixture) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-regional-queued-'))
  try {
    const input = inputFixture(root)
    const material = captureRegionalQueuedMaterial(input)
    for (const [name, bytes] of Object.entries(material.files)) {
      await writeFile(path.join(root, name), bytes, { mode: 0o600 })
    }
    // Existing target/manifest validation is the queue owner's separate boundary.
    await writeFile(path.join(root, 'target.png'), 'not consumed by this resource reader', {
      mode: 0o600,
    })
    await writeFile(path.join(root, 'manifest.json'), '{}', { mode: 0o600 })
    await run({ input, material, payload: frozenPayload(input, material.regional), root })
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

test('regional frozen mask association survives independent reload and caller edits', async () => {
  await withFixture(async ({ input, material, payload, root }) => {
    const expected = structuredClone(input)
    const pending = loadRegionalQueuedInput(root, payload, input.request)
    input.recipe.regions[0].coverage.alpha.fill(255)
    input.recipe.globalPrompts.positive.text = 'new live authoring'
    input.request.job.sampling.seed = 124
    const loaded = await pending
    assert.deepEqual(loaded, expected)
    assert.equal(
      Buffer.from(loaded.recipe.regions[0].coverage.alpha).equals(
        material.files['region-0.alpha8'],
      ),
      true,
    )
    assert.equal(loaded.globalNegativeCoverage.kind, 'alpha8')
    if (loaded.globalNegativeCoverage.kind === 'alpha8') {
      assert.equal(
        Buffer.from(loaded.globalNegativeCoverage.alpha).equals(
          material.files['global-negative.alpha8'],
        ),
        true,
      )
    }
    const files = await loadRegionalQueuedFiles(root, payload)
    assert.deepEqual(Object.keys(files).sort(), [
      'global-negative.alpha8',
      'region-0.alpha8',
      'regional.json',
    ])
    files['region-0.alpha8'].fill(0)
    assert.equal(
      (await readFile(path.join(root, 'region-0.alpha8'))).equals(
        material.files['region-0.alpha8'],
      ),
      true,
    )
  })
})

test('regional material keeps recipe ownership and stores no request or disposable paths', async () => {
  await withFixture(async ({ input, material, payload }) => {
    const metadata = JSON.parse(material.files['regional.json'].toString('utf8')) as Record<
      string,
      unknown
    >
    assert.equal(Object.hasOwn(metadata, 'request'), false)
    assert.equal(
      material.files['regional.json'].includes(Buffer.from(input.request.job.target.path)),
      false,
    )
    assert.equal(
      material.files['regional.json'].includes(Buffer.from(input.request.job.output.pngPath)),
      false,
    )
    assert.equal(sha(material.files['regional.json']), payload.regional.sha256)
    assert.equal(material.files['regional.json'].length, payload.regional.byteSize)
    assert.equal(payload.kind, 'illustrious-regional')
    assert.deepEqual(parseFrozenQueuedRegionalV1(JSON.stringify(payload)), payload)
    assert.throws(() => parseFrozenGenerationPayloadV1(JSON.stringify(payload)), isInvalid)
  })
})

test('regional zero-resource zero-region parser fixture reloads without raw alpha members', async () => {
  await withFixture(async ({ input, root }) => {
    input.recipe.regions = []
    input.globalNegativeCoverage = { kind: 'everywhere' }
    const material = captureRegionalQueuedMaterial(input)
    await rm(path.join(root, 'region-0.alpha8'))
    await rm(path.join(root, 'global-negative.alpha8'))
    await writeFile(path.join(root, 'regional.json'), material.files['regional.json'])
    const payload = frozenPayload(input, material.regional)
    assert.deepEqual(Object.keys(await loadRegionalQueuedFiles(root, payload)), ['regional.json'])
    assert.deepEqual(await loadRegionalQueuedInput(root, payload, input.request), input)
  })
})

for (const fault of [
  'changed',
  'truncated',
  'missing',
  'symlink',
  'hardlink',
  'extra',
  'directory',
  'writable',
] as const) {
  test(`regional frozen resource ${fault} refuses before returning owned inputs`, async () => {
    await withFixture(async ({ input, payload, root }) => {
      const filename = path.join(root, 'region-0.alpha8')
      switch (fault) {
        case 'changed': {
          await writeFile(filename, Buffer.alloc(64 * 64, 17))

          break
        }
        case 'directory': {
          await rm(filename)
          await mkdir(filename)

          break
        }
        case 'extra': {
          await writeFile(path.join(root, 'unregistered.alpha8'), 'extra', { mode: 0o600 })

          break
        }
        case 'hardlink': {
          await link(filename, path.join(root, 'other-link'))

          break
        }
        case 'missing': {
          await rm(filename)

          break
        }
        case 'symlink': {
          await rm(filename)
          await symlink(path.join(root, 'global-negative.alpha8'), filename)

          break
        }
        case 'truncated': {
          await writeFile(filename, Buffer.alloc(1))

          break
        }
        default: {
          await chmod(filename, 0o666)
        }
      }
      await assert.rejects(loadRegionalQueuedInput(root, payload, input.request), isInvalid)
    })
  })
}

for (const fault of [
  'role-escape',
  'duplicate-field',
  'wrong-document',
  'wrong-schema',
  'extra-request',
  'wrong-length',
] as const) {
  test(`regional frozen metadata ${fault} refuses even with a freshly matching descriptor`, async () => {
    await withFixture(async ({ input, material, payload, root }) => {
      const metadata = JSON.parse(material.files['regional.json'].toString('utf8')) as {
        recipe: {
          documentId: string
          regions: { coverage: { alpha: { $alpha8: { byteSize: number; file: string } } } }[]
        }
        request?: unknown
        schemaVersion: number
      }
      switch (fault) {
        case 'extra-request': {
          metadata.request = input.request

          break
        }
        case 'role-escape': {
          metadata.recipe.regions[0].coverage.alpha.$alpha8.file = '../outside.alpha8'

          break
        }
        case 'wrong-document': {
          metadata.recipe.documentId = randomUUID()

          break
        }
        case 'wrong-length': {
          metadata.recipe.regions[0].coverage.alpha.$alpha8.byteSize = 1

          break
        }
        case 'wrong-schema': {
          metadata.schemaVersion = 2

          break
        }
        // No default
      }
      const bytes = Buffer.from(
        fault === 'duplicate-field'
          ? JSON.stringify(metadata).replace('{', '{"schemaVersion":1,')
          : JSON.stringify(metadata),
      )
      payload.regional = { byteSize: bytes.length, sha256: sha(bytes) }
      await writeFile(path.join(root, 'regional.json'), bytes)
      await assert.rejects(loadRegionalQueuedInput(root, payload, input.request), isInvalid)
    })
  })
}

for (const fault of ['seed', 'checkpoint', 'policy'] as const) {
  test(`regional replay rejects an independently substituted ${fault}`, async () => {
    await withFixture(async ({ input, payload, root }) => {
      if (fault === 'seed') {
        input.request.job.sampling.seed = 124
      } else if (fault === 'checkpoint') {
        input.request.job.checkpoint.sha256 = '3'.repeat(64)
      } else {
        input.request.job.sampling.noiseProfile = {
          ...defaultIllustriousNoiseProfile(),
          timestepSpacing: 'linspace',
        }
      }
      await assert.rejects(loadRegionalQueuedInput(root, payload, input.request), isInvalid)
    })
  })
}

test('regional replay allows a fresh operational request identity and target/output paths', async () => {
  await withFixture(async ({ input, payload, root }) => {
    input.request.requestId = randomUUID()
    input.request.job.output = {
      pngPath: path.join(root, 'scratch', 'result.png'),
      stagingRoot: path.join(root, 'scratch'),
    }
    input.request.job.target.path = path.join(root, 'independent-retry', 'target.png')
    const loaded = await loadRegionalQueuedInput(root, payload, input.request)
    assert.equal(loaded.request.requestId, input.request.requestId)
    assert.equal(loaded.recipe.item.seed, payload.context.sampling.seed)
    assert.equal(
      Buffer.from(loaded.recipe.regions[0].coverage.alpha).equals(
        (await loadRegionalQueuedFiles(root, payload))['region-0.alpha8'],
      ),
      true,
    )
  })
})

test('regional private payload refuses unsupported execution and unknown outer fields', async () => {
  await withFixture(async ({ payload }) => {
    const variants = [
      { ...payload, injected: true },
      { ...payload, regional: { ...payload.regional, byteSize: 1024 * 1024 + 1 } },
      { ...payload, regional: { ...payload.regional, file: '../elsewhere' } },
      {
        ...payload,
        context: { ...payload.context, vaePrecision: 'FP32' },
        workerJob: { ...payload.workerJob, vaePrecision: 'FP32' },
      },
      {
        ...payload,
        context: {
          ...payload.context,
          sampling: { ...payload.context.sampling, noiseProfile: undefined },
        },
        workerJob: {
          ...payload.workerJob,
          sampling: { ...payload.workerJob.sampling, noiseProfile: undefined },
        },
      },
    ]
    for (const value of variants) {
      assert.throws(() => parseFrozenQueuedRegionalV1(JSON.stringify(value)), isInvalid)
    }
  })
})
