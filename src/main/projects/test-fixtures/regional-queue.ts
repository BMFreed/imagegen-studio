import { IGS_SRGB_ICC_SHA256 } from '../../../shared/projects/color-profile.js'
import { defaultIllustriousNoiseProfile } from '../../../shared/projects/illustrious-noise-profile.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { crc32, deflateSync } from 'node:zlib'

import type { GenerationQueueTestHooks } from '../generation-queue.js'
import type { GenerationStagingTestHooks } from '../generation-staging.js'
import type { IllustriousTxt2ImgRequestV1 } from '../illustrious-txt2img-job.js'
import type { PreparedNormalTxt2Img } from '../project-generation-preparation.js'
import type { RegionalGenerationModelResolver } from '../regional-generation-processor.js'
import type { RegionalWorkerInput } from '../regional-worker-request.js'

import { openAppDatabase } from '../../db/database.js'
import { GenerationQueueRepository } from '../generation-queue.js'
import { GenerationStagingRepository } from '../generation-staging.js'

export const REGIONAL_QUEUE_READY = {
  capabilities: [
    'illustrious-txt2img',
    'denoising-progress',
    'candidate-thumbnails',
    'illustrious-cfg-rescale',
    'illustrious-img2img',
    'illustrious-lora',
    'illustrious-vae-precision',
    'illustrious-external-vae',
    'illustrious-embeddings',
    'illustrious-outpaint',
    'illustrious-euler',
    'illustrious-noise-profile',
    'private-current-canvas-regional-v1',
  ],
  protocolVersion: '1',
  runtimeProfile: 'linux-nvidia',
  workerVersion: '0.14.0',
}

export const regionalFixtureSha256 = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex')

export type RegionalQueueFixture = Awaited<ReturnType<typeof createRegionalQueueFixture>>

/**
 * Real migrated SQLite/filesystem queue and staging, with an explicitly tiny resolver substitute.
 * The .igs path is an identity fixture, not a claim of Save/package or trained-model
 * qualification.
 */
export async function createRegionalQueueFixture(
  options: {
    queueHooks?: GenerationQueueTestHooks
    stagingHooks?: GenerationStagingTestHooks
  } = {},
) {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-regional-queue-'))
  const database = openAppDatabase(root, path.resolve('src/main/db/migrations'))
  try {
    const source = path.join(root, 'source')
    await mkdir(source, { mode: 0o700 })
    const projectPath = path.join(root, 'Project.igs')
    await writeFile(projectPath, 'explicit queue Project identity fixture', { mode: 0o600 })
    const profile = await readFile(path.resolve('worker-python/src/imagegen_worker/srgb.icc'))
    assert.equal(regionalFixtureSha256(profile), IGS_SRGB_ICC_SHA256)
    const targetBytes = fixturePng(profile, false)
    const outputBytes = fixturePng(profile, true)
    const targetPath = path.join(source, 'target.png')
    const modelPath = path.join(root, 'checkpoint.safetensors')
    const modelBytes = Buffer.from('explicit tiny regional queue checkpoint fixture')
    await writeFile(modelPath, modelBytes, { mode: 0o600 })
    await writeFile(targetPath, targetBytes, { mode: 0o600 })
    const reference = {
      baseModelFamily: 'illustrious' as const,
      civitaiFileId: 33,
      civitaiModelId: 11,
      civitaiVersionId: 22,
      displayName: 'Explicit queue fixture checkpoint',
      fileSha256: regionalFixtureSha256(modelBytes),
      kind: 'checkpoint' as const,
      localModelId: randomUUID(),
      localVersionId: randomUUID(),
      predictionType: 'epsilon' as const,
      versionName: 'fixture',
    }
    const bbox = { height: 64, width: 64, x: -13, y: 5 }
    const prompts = { negative: 'global negative', positive: 'global positive' }
    const documentId = randomUUID()
    const documentRevision = randomUUID()
    const noiseProfile = defaultIllustriousNoiseProfile()
    const prepared: PreparedNormalTxt2Img = {
      context: {
        bbox,
        documentId,
        documentRevision,
        kind: 'normal-txt2img-preparation',
        model: { managedPath: modelPath, reference },
        prompts,
        sampling: {
          cfgRescale: 0,
          cfgScale: 5,
          invokeScheduler: 'euler',
          noiseProfile,
          requestedSeedPolicy: 'fixed',
          sampler: 'Euler',
          scheduler: 'Normal',
          seed: 123,
          steps: 2,
        },
        schemaVersion: 1,
        target: {
          byteSize: targetBytes.length,
          colorSpace: 'srgb',
          format: 'png',
          height: 64,
          iccSha256: IGS_SRGB_ICC_SHA256,
          sha256: regionalFixtureSha256(targetBytes),
          width: 64,
        },
        vae: null,
        vaePrecision: 'FP16',
      },
      targetPngBytes: targetBytes,
    }
    const request: IllustriousTxt2ImgRequestV1 = {
      job: {
        bbox,
        checkpoint: { path: modelPath, predictionType: 'epsilon', sha256: reference.fileSha256 },
        output: { pngPath: path.join(source, 'result.png'), stagingRoot: source },
        prompts,
        sampling: {
          cfgRescale: 0,
          cfgScale: 5,
          noiseProfile,
          scheduler: 'euler',
          seed: 123,
          steps: 2,
        },
        schemaVersion: 1,
        target: {
          byteSize: targetBytes.length,
          height: 64,
          iccSha256: IGS_SRGB_ICC_SHA256,
          path: targetPath,
          sha256: regionalFixtureSha256(targetBytes),
          width: 64,
        },
        vae: null,
        vaePrecision: 'FP16',
      },
      protocolVersion: '1',
      requestId: randomUUID(),
      type: 'generate-illustrious-txt2img',
    }
    const prompt = (text: string) => ({ embeddingRefs: [], text })
    const regional: Omit<RegionalWorkerInput, 'request'> = {
      globalNegativeCoverage: { kind: 'everywhere' },
      globalPositiveCoverage: { kind: 'everywhere' },
      layout: 'cfg-negative-first',
      negativePooledSourceId: 'current-canvas',
      positivePooledSourceId: 'current-canvas',
      recipe: {
        bbox,
        documentId,
        documentRevision,
        family: 'illustrious',
        globalEmbeddings: { negative: [], positive: [] },
        globalPrompts: { negative: prompt(prompts.negative), positive: prompt(prompts.positive) },
        item: { iteration: 0, promptPairIndex: 0, prompts, seed: 123 },
        kind: 'current-canvas-regional-recipe',
        regions: [
          {
            coverage: {
              alpha: Uint8Array.from({ length: 4096 }, (_, index) => (index % 64 < 32 ? 255 : 0)),
              bounds: bbox,
              intersection: bbox,
              kind: 'covered',
            },
            embeddings: { negative: [], positive: [] },
            maskId: randomUUID(),
            maskRevision: 1,
            negative: { prompt: prompt(prompts.negative), source: 'current-canvas' },
            positive: prompt('regional positive'),
            regionId: randomUUID(),
          },
        ],
      },
    }
    const models: RegionalGenerationModelResolver = {
      assertNoUnboundGenerationEmbeddings: async () => {},
      resolveVerifiedGenerationCheckpointForPlan: async (saved) => {
        assert.deepEqual(saved, reference)
        const bytes = await readFile(modelPath)
        assert.equal(regionalFixtureSha256(bytes), reference.fileSha256)
        return {
          managedPath: modelPath,
          noiseProfile: structuredClone(noiseProfile),
          reference: structuredClone(reference),
        }
      },
      resolveVerifiedGenerationEmbeddingForPlan: async () => {
        throw new Error('No TI fixture is installed.')
      },
    }
    const queue = new GenerationQueueRepository(database.db, root, options.queueHooks)
    await queue.recoverAfterRestart()
    const staging = new GenerationStagingRepository(database.db, root, options.stagingHooks)
    await staging.recoverAfterRestart()
    return {
      close: async () => {
        await database.close()
        await rm(root, { force: true, recursive: true })
      },
      database,
      dataRoot: root,
      db: database.db,
      input: { ...regional, request },
      models,
      outputBytes,
      prepared,
      projectPath,
      queue,
      regional,
      request,
      root,
      staging,
    }
  } catch (error) {
    await database.close()
    await rm(root, { force: true, recursive: true })
    throw error
  }
}

export async function enqueueRegionalFixture(fixture: RegionalQueueFixture) {
  return await fixture.queue.enqueueCurrentCanvasRegional({
    prepared: fixture.prepared,
    projectPath: fixture.projectPath,
    regional: fixture.regional,
    request: fixture.request,
    stagingSessionId: randomUUID(),
  })
}

/** Literal color-managed PNGs, independent of inference or a worker's output implementation. */
function fixturePng(profile: Buffer, rgb: boolean): Buffer {
  const chunk = (name: string, bytes: Buffer): Buffer => {
    const result = Buffer.alloc(bytes.length + 12)
    result.writeUInt32BE(bytes.length)
    result.write(name, 4)
    bytes.copy(result, 8)
    result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4)
    return result
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(64)
  header.writeUInt32BE(64, 4)
  header[8] = 8
  header[9] = rgb ? 2 : 6
  const channels = rgb ? 3 : 4
  const rows = Buffer.alloc((64 * channels + 1) * 64)
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      rows.set(
        rgb ? [32 + x, 48 + y, 96] : [17, 59, 133, 0],
        y * (64 * channels + 1) + 1 + x * channels,
      )
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
