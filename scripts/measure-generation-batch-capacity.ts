/**
 * Storage capacity evidence, not GPU throughput or a public Generate qualification. Run with: pnpm
 * exec tsx scripts/measure-generation-batch-capacity.ts --artifact-dir /absolute/new/path Each case
 * uses a fresh process and removes only its own newly created bulky fixture directory.
 */
import { IGS_SRGB_ICC_SHA256 } from '../src/shared/projects/color-profile.js'
import { IGS_GENERATION_PNG_MAX_BYTES } from '../src/shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  appendFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  statfs,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import { crc32, deflateSync } from 'node:zlib'

import type { PreparedNormalTxt2Img } from '../src/main/projects/project-generation-preparation.js'

import { type AppDatabase, openAppDatabase } from '../src/main/db/database.js'
import { recoverGenerationRepositories } from '../src/main/projects/generation-bootstrap.js'
import { GENERATION_STAGING_LIMITS } from '../src/main/projects/generation-staging-limits.js'
import { validateSrgbPngStream } from '../src/main/projects/igs-package.js'
import { withIllustriousTxt2ImgRequest } from '../src/main/projects/illustrious-txt2img-job.js'
import { ProjectGenerationResultResource } from '../src/main/projects/project-generation-result-resource.js'
import { ProjectSession } from '../src/main/projects/project-session.js'

const scriptPath = import.meta.filename
const repository = path.resolve(import.meta.dirname, '..')
const ready = {
  capabilities: ['illustrious-txt2img'],
  protocolVersion: '1',
  runtimeProfile: 'linux-nvidia',
  workerVersion: '0.2.0',
}
const profiles = ['normal1024', 'maximum2000', 'escaped1024', 'storage32MiB'] as const
type Profile = (typeof profiles)[number]
interface CaseConfig {
  artifactDirectory: string
  caseDataDirectory?: string
  count: number
  fixture: { outputPath: string; targetPath: string; width: number }
  id: string
  profile: Profile
  repetition: number
  sourceManifestPath: string
}
interface DiskSize {
  allocatedBytes: number
  files: number
  logicalBytes: number
}
interface PhaseMetrics {
  elapsedMs: number
  eventLoopMaxMs: number | null
  eventLoopP99Ms: number | null
  rssAfterBytes: number
  rssBeforeBytes: number
  sampledPeakRssBytes: number
  samples: number
  systemCpuMs: number
  userCpuMs: number
}

function digest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function pngChunk(name: string, bytes: Buffer): Buffer {
  const type = Buffer.from(name, 'ascii')
  const chunk = Buffer.alloc(bytes.length + 12)
  chunk.writeUInt32BE(bytes.length, 0)
  type.copy(chunk, 4)
  bytes.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(Buffer.concat([type, bytes])), bytes.length + 8)
  return chunk
}

/** Seeded opaque RGB noise prevents a solid-color output from understating storage cost. */
function fixturePng(width: number, transparent: boolean, profile: Buffer): Buffer {
  const channels = transparent ? 4 : 3
  const rowBytes = 1 + width * channels
  const scanlines = Buffer.alloc(rowBytes * width)
  if (!transparent) {
    let state = 0x12_34_56_78
    for (let row = 0; row < width; row++) {
      for (let column = 1; column < rowBytes; column++) {
        state ^= state << 13
        state ^= state >>> 17
        state ^= state << 5
        scanlines[row * rowBytes + column] = state & 255
      }
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(width, 4)
  header[8] = 8
  header[9] = transparent ? 6 : 2
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('iCCP', Buffer.concat([Buffer.from('sRGB\0\0'), deflateSync(profile)])),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function padStoragePng(bytes: Buffer): Buffer {
  // Signature, IHDR and iCCP precede IDAT. Ancillary padding is inside the CRC-checked container.
  let offset = 8
  while (bytes.toString('ascii', offset + 4, offset + 8) !== 'IDAT') {
    offset += bytes.readUInt32BE(offset) + 12
  }
  return Buffer.concat([
    bytes.subarray(0, offset),
    pngChunk('igSt', Buffer.alloc(IGS_GENERATION_PNG_MAX_BYTES - bytes.length - 12)),
    bytes.subarray(offset),
  ])
}

async function diskSize(root: string): Promise<DiskSize> {
  const seen = new Set<string>()
  const total = { allocatedBytes: 0, files: 0, logicalBytes: 0 }
  const visit = async (entryPath: string): Promise<void> => {
    const entry = await lstat(entryPath, { bigint: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return null
      }
      throw error
    })
    if (!entry) {
      return
    }
    assert.equal(entry.isSymbolicLink(), false, `Unexpected symlink: ${entryPath}`)
    const identity = `${entry.dev}:${entry.ino}`
    if (seen.has(identity)) {
      return
    }
    seen.add(identity)
    total.allocatedBytes += Number(entry.blocks) * 512
    if (entry.isDirectory()) {
      for (const name of await readdir(entryPath)) {
        await visit(path.join(entryPath, name))
      }
    } else {
      assert.equal(entry.isFile(), true)
      total.files++
      total.logicalBytes += Number(entry.size)
    }
  }
  await visit(root)
  return total
}

async function diskSnapshot(root: string) {
  return {
    database: await diskSize(path.join(root, 'database')),
    generationInputs: await diskSize(path.join(root, 'generation-inputs')),
    recovery: await diskSize(path.join(root, 'recovery')),
    scratch: await diskSize(path.join(root, 'scratch')),
    total: await diskSize(root),
  }
}

function errorDetails(error: unknown) {
  return error instanceof Error
    ? {
        code: 'code' in error ? String(error.code) : null,
        message: error.message,
        stack: error.stack,
      }
    : { code: null, message: String(error) }
}

function commandOutput(command: string, args: string[]): string {
  const result = spawnSync(command, args, { cwd: repository, encoding: 'utf8' })
  return result.status === 0
    ? result.stdout.trim()
    : `unavailable: ${result.error?.message ?? result.stderr.trim()}`
}

async function sourceHashes(): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {}
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(path.join(repository, directory), { withFileTypes: true })) {
      const relative = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(relative)
      } else if (/\.(ts|sql)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
        hashes[relative] = digest(await readFile(path.join(repository, relative)))
      }
    }
  }
  for (const directory of ['src/main/projects', 'src/main/db', 'src/shared/projects']) {
    await visit(directory)
  }
  for (const relative of [
    path.relative(repository, scriptPath),
    'src/shared/api.ts',
    'worker-python/src/imagegen_worker/srgb.icc',
  ]) {
    hashes[relative] = digest(await readFile(path.join(repository, relative)))
  }
  return hashes
}

async function runCase(config: CaseConfig): Promise<void> {
  const caseRoot =
    config.caseDataDirectory ?? (await mkdtemp(path.join(config.artifactDirectory, 'case-data-')))
  assert.equal(await realpath(caseRoot), caseRoot)
  assert.equal(path.dirname(caseRoot), config.artifactDirectory)
  assert.ok(path.basename(caseRoot).startsWith('case-data-'))
  assert.deepEqual(await readdir(caseRoot), [], 'Case storage must be freshly allocated')
  const metrics: Record<string, unknown> = {
    config,
    disk: {},
    outcome: 'error',
    phases: {},
    pid: process.pid,
    startedAt: new Date().toISOString(),
  }
  const phases = metrics.phases as Record<string, PhaseMetrics>
  const disk = metrics.disk as Record<string, unknown>
  let database: AppDatabase | undefined
  const activePhases = new Set<PhaseMetrics>()
  let peakHeapBytes = 0
  let peakExternalBytes = 0
  let peakArrayBufferBytes = 0
  let sampledPeakRssBytes = 0
  const sample = () => {
    const memory = process.memoryUsage()
    sampledPeakRssBytes = Math.max(sampledPeakRssBytes, memory.rss)
    peakHeapBytes = Math.max(peakHeapBytes, memory.heapUsed)
    peakExternalBytes = Math.max(peakExternalBytes, memory.external)
    peakArrayBufferBytes = Math.max(peakArrayBufferBytes, memory.arrayBuffers)
    for (const current of activePhases) {
      current.sampledPeakRssBytes = Math.max(current.sampledPeakRssBytes, memory.rss)
      current.samples++
    }
  }
  const sampler = setInterval(sample, 10)
  const phase = async <T>(name: string, operation: () => Promise<T>): Promise<T> => {
    const before = process.resourceUsage()
    const started = performance.now()
    const entry: PhaseMetrics = {
      elapsedMs: 0,
      eventLoopMaxMs: null,
      eventLoopP99Ms: null,
      rssAfterBytes: 0,
      rssBeforeBytes: process.memoryUsage.rss(),
      sampledPeakRssBytes: 0,
      samples: 0,
      systemCpuMs: 0,
      userCpuMs: 0,
    }
    phases[name] = entry
    activePhases.add(entry)
    const histogram = monitorEventLoopDelay({ resolution: 10 })
    histogram.enable()
    sample()
    try {
      return await operation()
    } finally {
      sample()
      entry.elapsedMs = performance.now() - started
      entry.rssAfterBytes = process.memoryUsage.rss()
      const after = process.resourceUsage()
      entry.systemCpuMs = (after.systemCPUTime - before.systemCPUTime) / 1000
      entry.userCpuMs = (after.userCPUTime - before.userCPUTime) / 1000
      if (histogram.count > 0) {
        entry.eventLoopMaxMs = histogram.max / 1_000_000
        entry.eventLoopP99Ms = histogram.percentile(99) / 1_000_000
      }
      histogram.disable()
      activePhases.delete(entry)
    }
  }
  try {
    const expectedSources = JSON.parse(await readFile(config.sourceManifestPath, 'utf8')) as Record<
      string,
      string
    >
    assert.deepEqual(
      await sourceHashes(),
      expectedSources,
      'Production/harness sources changed during measurement',
    )
    metrics.sourceManifestSha256 = digest(await readFile(config.sourceManifestPath))
    const available = await statfs(caseRoot, { bigint: true })
    // The full stress retains 4 GiB of assets plus scratch/WAL; do not consume the last free space.
    const required =
      BigInt(config.count) * BigInt(2 * IGS_GENERATION_PNG_MAX_BYTES) + 2n * 1024n ** 3n
    assert.ok(
      available.bavail * available.bsize >= required,
      'Insufficient free space for bounded case',
    )
    const scratch = path.join(caseRoot, 'scratch')
    await mkdir(scratch, { mode: 0o700 })
    const project = await ProjectSession.create(
      path.join(caseRoot, 'Capacity.igs'),
      'Capacity fixture',
      {
        placeholdersDir: path.join(repository, 'src/main/projects/placeholders'),
        scratchDir: scratch,
      },
      { height: config.fixture.width, width: config.fixture.width, x: 0, y: 0 },
    )
    const document = project.document
    const projectHash = digest(await readFile(project.filePath))
    const target = await readFile(config.fixture.targetPath)
    const output = await readFile(config.fixture.outputPath)
    const outputSha256 = digest(output)
    const modelBytes = Buffer.from('capacity exact-model adapter; not inference weights')
    const modelPath = path.join(caseRoot, 'checkpoint.safetensors')
    await writeFile(modelPath, modelBytes, { mode: 0o600 })
    const prepared: PreparedNormalTxt2Img = {
      context: {
        bbox: document.primaryBbox,
        documentId: document.documentId,
        documentRevision: document.documentRevision,
        kind: 'normal-txt2img-preparation',
        model: {
          managedPath: modelPath,
          reference: {
            baseModelFamily: 'illustrious',
            civitaiFileId: null,
            civitaiModelId: null,
            civitaiVersionId: null,
            displayName: 'Capacity adapter checkpoint',
            fileSha256: digest(modelBytes),
            kind: 'checkpoint',
            localModelId: randomUUID(),
            localVersionId: randomUUID(),
            predictionType: 'epsilon',
            versionName: '1',
          },
        },
        prompts: {
          negative: 'é'.repeat(8 * 1024),
          positive: (config.profile === 'escaped1024' ? '\\' : 'a').repeat(16 * 1024),
        },
        sampling: {
          cfgScale: 7.5,
          invokeScheduler: 'dpmpp_2m_k',
          requestedSeedPolicy: 'fixed',
          sampler: 'DPM++ 2M',
          scheduler: 'Karras',
          seed: 0,
          steps: 24,
        },
        schemaVersion: 1,
        target: {
          byteSize: target.length,
          colorSpace: 'srgb',
          format: 'png',
          height: config.fixture.width,
          iccSha256: IGS_SRGB_ICC_SHA256,
          sha256: digest(target),
          width: config.fixture.width,
        },
      },
      targetPngBytes: target,
    }
    metrics.fixture = {
      outputBytes: output.length,
      outputSha256,
      promptUtf8Bytes: {
        negative: Buffer.byteLength(prepared.context.prompts.negative),
        positive: Buffer.byteLength(prepared.context.prompts.positive),
      },
      targetBytes: target.length,
      targetSha256: digest(target),
    }
    database = openAppDatabase(caseRoot, path.join(repository, 'src/main/db/migrations'))
    let { queue, staging } = await recoverGenerationRepositories(database, caseRoot)
    metrics.sqlite = await database.db
      .selectNoFrom((eb) => eb.fn<string>('sqlite_version', []).as('version'))
      .executeTakeFirst()
    const stagingSessionId = randomUUID()
    let expectedIds: string[] = []
    let preflightInvoked = false
    let requestBytes = 0
    await phase(
      'qualifiedLeaseLifetime',
      async () =>
        await withIllustriousTxt2ImgRequest({
          // This adapter preserves exact fixture identity. The subject is storage, not model qualification.
          modelService: {
            assertNoUnboundGenerationEmbeddings: async () => {},
            resolveVerifiedGenerationCheckpointForPlan: async (reference) => ({
              managedPath: modelPath,
              reference,
            }),
            resolveVerifiedGenerationLoraForPlan: async () => {
              throw new Error('Capacity fixture has no active LoRAs.')
            },
            resolveVerifiedGenerationVaeForPlan: async () => {
              throw new Error('Capacity fixture uses embedded VAE.')
            },
          },
          prepared,
          ready,
          scratchBasePath: scratch,
          use: async (request) => {
            requestBytes = Buffer.byteLength(JSON.stringify(request)) + 1
            assert.ok(requestBytes <= 64 * 1024)
            const items = Array.from({ length: config.count }, (_, index) => {
              const context = structuredClone(prepared.context)
              context.sampling.seed = index
              const concrete = structuredClone(request)
              concrete.requestId = randomUUID()
              concrete.job.sampling.seed = index
              return { prepared: { context, targetPngBytes: target }, request: concrete }
            })
            const beforeInputs = await diskSize(path.join(caseRoot, 'generation-inputs'))
            const beforeRecovery = await diskSize(path.join(caseRoot, 'recovery'))
            const beforeRows = await database!.db
              .selectFrom('generation_queue_item')
              .selectAll()
              .execute()
            try {
              const queued = await phase(
                'admission',
                async () =>
                  await queue.enqueueIllustriousTxt2ImgBatch({
                    items,
                    preflight: async (entries) => {
                      preflightInvoked = true
                      metrics.payloadBytes = entries.map((entry) =>
                        Buffer.byteLength(entry.frozenPayloadJson),
                      )
                      await phase(
                        'preflight',
                        async () =>
                          await staging.preflightBatchCapacity({
                            entries,
                            localProjectKey: project.localRecoveryKey,
                            projectPath: project.filePath,
                            stagingSessionId,
                          }),
                      )
                    },
                    projectPath: project.filePath,
                    stagingSessionId,
                  }),
              )
              expectedIds = queued.map((item) => item.id)
              assert.notEqual(
                config.count,
                65,
                'The oversized 65-item control was unexpectedly admitted',
              )
              assert.equal(queued.length, config.count)
              assert.equal(new Set(queued.map((item) => item.batchId)).size, 1)
              assert.equal(new Set(queued.map((item) => item.stagingSessionId)).size, 1)
            } catch (error) {
              const detail = errorDetails(error)
              const oversized =
                config.count === 65 &&
                (detail.code === 'QUEUE_INPUT_INVALID' || detail.code === 'STAGING_INPUT_INVALID')
              const manifest =
                config.profile === 'escaped1024' &&
                detail.code === 'STAGING_INPUT_INVALID' &&
                detail.message === 'The batch staging manifest is too large.'
              if (!oversized && !manifest) {
                throw error
              }
              assert.deepEqual(await queue.listUnfinishedByProject(project.localRecoveryKey), [])
              assert.deepEqual(
                await database!.db.selectFrom('generation_queue_item').selectAll().execute(),
                beforeRows,
              )
              assert.deepEqual(
                await diskSize(path.join(caseRoot, 'generation-inputs')),
                beforeInputs,
              )
              assert.deepEqual(await diskSize(path.join(caseRoot, 'recovery')), beforeRecovery)
              metrics.refusal = detail
              metrics.outcome = 'refused-before-publication'
              return
            }
            assert.equal(preflightInvoked, true)
            disk.afterAdmission = await diskSnapshot(caseRoot)
            await writeFile(request.job.output.pngPath, output, { flag: 'wx', mode: 0o600 })
            const publicationTimes: number[] = []
            const claimTimes: number[] = []
            await phase('completionAll', async () => {
              for (const [index, id] of expectedIds.entries()) {
                const claimStarted = performance.now()
                const claimed = await queue.claimNextPending()
                claimTimes.push(performance.now() - claimStarted)
                assert.equal(claimed?.item.id, id)
                assert.ok(claimed)
                const publicationStarted = performance.now()
                const candidate = await staging.publishIllustriousTxt2Img({
                  actualSeed: index,
                  expectedProvisionalRoot: request.job.output.stagingRoot,
                  expectedStatusSequence: claimed.item.statusSequence,
                  provisionalOutputPath: request.job.output.pngPath,
                  queueItemId: id,
                })
                publicationTimes.push(performance.now() - publicationStarted)
                assert.equal(candidate.candidateId, id)
                assert.equal(candidate.image.sha256, outputSha256)
                if ((index + 1) % 8 === 0) {
                  process.stdout.write(
                    `${JSON.stringify({ case: config.id, completed: index + 1, event: 'publication-progress' })}\n`,
                  )
                }
              }
            })
            metrics.claimTimesMs = claimTimes
            metrics.publicationTimesMs = publicationTimes
            assert.equal(await queue.claimNextPending(), null)
            disk.afterCompletionWithLease = await diskSnapshot(caseRoot)
            metrics.outcome = 'completed'
          },
        }),
    )
    metrics.requestLineBytes = requestBytes
    metrics.preflightInvoked = preflightInvoked
    disk.afterLeaseCleanup = await diskSnapshot(caseRoot)
    const resource = () =>
      new ProjectGenerationResultResource(
        staging,
        (key) => (key === project.localRecoveryKey ? document.documentId : null),
        queue,
      )
    const checkResults = async () => {
      const snapshot = await resource().list(project.localRecoveryKey)
      assert.deepEqual(
        snapshot.candidates.map((item) => item.queueItemId),
        expectedIds,
      )
      assert.deepEqual(snapshot.unfinishedSiblingJobIds, [])
      assert.deepEqual(
        snapshot.candidates.map((item) => item.actualSeed),
        expectedIds.map((_, index) => index),
      )
      assert.equal(snapshot.recoveryUnavailable, false)
      if (expectedIds.length) {
        assert.equal(snapshot.lastActualSeed, expectedIds.length - 1)
      }
      assert.equal(
        snapshot.candidates.some((item) => item.sourceDocumentMismatch),
        false,
      )
    }
    await phase('resultsList', checkResults)
    await phase('databaseClose', async () => await database!.close())
    database = undefined
    await phase('restart', async () => {
      database = openAppDatabase(caseRoot, path.join(repository, 'src/main/db/migrations'))
      ;({ queue, staging } = await recoverGenerationRepositories(database, caseRoot))
    })
    await phase('resultsAfterRestart', checkResults)
    assert.equal(digest(await readFile(project.filePath)), projectHash)
    metrics.invariants = {
      candidateOrderAndSeeds: true,
      noPartialRowsOnRefusal: metrics.outcome === 'refused-before-publication' ? true : null,
      projectPackageUnchanged: true,
      recoveredResultsMatch: true,
    }
    disk.afterRestart = await diskSnapshot(caseRoot)
    assert.deepEqual(
      await sourceHashes(),
      expectedSources,
      'Production/harness sources changed during measurement',
    )
  } catch (error) {
    metrics.outcome = 'error'
    metrics.error = errorDetails(error)
    process.exitCode = 1
  } finally {
    sample()
    clearInterval(sampler)
    metrics.memory = {
      peakArrayBufferBytes,
      peakExternalBytes,
      peakHeapBytes,
      processLifetimeHighWaterRssBytes: process.resourceUsage().maxRSS * 1024,
      sampledPeakRssBytes,
    }
    try {
      await database?.close()
      await rm(caseRoot, { force: true, recursive: true })
      metrics.ownedCaseDataRemoved = true
    } catch (error) {
      metrics.cleanupError = errorDetails(error)
      metrics.ownedCaseDataRemoved = false
      process.exitCode = 1
    }
    metrics.finishedAt = new Date().toISOString()
    await writeFile(
      path.join(config.artifactDirectory, `${config.id}.result.json`),
      `${JSON.stringify(metrics, null, 2)}\n`,
      { mode: 0o600 },
    )
    process.stdout.write(
      `${JSON.stringify({ event: 'case-finished', id: config.id, memory: metrics.memory, outcome: metrics.outcome })}\n`,
    )
  }
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  if (index < 0) {
    return undefined
  }
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${name}`)
  }
  return value
}

async function runHarness(): Promise<void> {
  const requested = option('--artifact-dir')
  assert.ok(
    requested && path.isAbsolute(requested) && path.resolve(requested) === requested,
    'Supply --artifact-dir with a new absolute directory on persistent storage',
  )
  const parent = await realpath(path.dirname(requested))
  assert.equal(
    parent,
    path.dirname(requested),
    'Artifact parent must be canonical and already exist',
  )
  const filesystem = await statfs(parent, { bigint: true })
  assert.notEqual(
    filesystem.type,
    0x01_02_19_94n,
    'tmpfs is unsuitable for persistent-storage capacity measurements',
  )
  const selected = (option('--profiles')?.split(',') ?? [...profiles]) as Profile[]
  assert.ok(
    selected.length &&
      new Set(selected).size === selected.length &&
      selected.every((item) => profiles.includes(item)),
    'Unknown or duplicate profile',
  )
  const counts = option('--counts')?.split(',').map(Number) ?? [1, 8, 16, 32, 64]
  assert.ok(
    counts.length &&
      new Set(counts).size === counts.length &&
      counts.every((count) => Number.isSafeInteger(count) && count >= 1 && count <= 64),
    'Counts must be unique integers from 1 through 64',
  )
  const repetitions = Number(option('--repetitions') ?? 3)
  assert.ok(
    Number.isSafeInteger(repetitions) && repetitions >= 1 && repetitions <= 10,
    'Repetitions must be from 1 through 10',
  )
  await mkdir(requested, { mode: 0o700 }) // EEXIST refuses accidental reuse/cleanup of an existing directory.
  const fixtures = path.join(requested, 'fixtures')
  await mkdir(fixtures, { mode: 0o700 })
  const sourceManifestPath = path.join(requested, 'source-sha256.json')
  await writeFile(sourceManifestPath, `${JSON.stringify(await sourceHashes(), null, 2)}\n`, {
    mode: 0o600,
  })
  await writeFile(path.join(requested, 'harness-source.ts'), await readFile(scriptPath), {
    mode: 0o600,
  })
  const system = {
    architecture: os.arch(),
    argv: process.argv,
    boundaries: [
      'Actual qualified-request lease, queue batch/preflight, WAL/FULL SQLite, filesystem fsync, claim, staging publication, Results list and restart recovery.',
      'Exact-model adapter and deterministic controlled output replace model qualification and GPU inference. Project inputs are fixture-prepared; no renderer/IPC Generate.',
      'One common target lease; source target/output fixtures and their generation cost are outside measured case phases.',
      '32 MiB ancillary padding is accepted storage stress, not a typical compositor/inference output.',
      '10 ms sampled memory/event-loop observations may miss short synchronous peaks; OS RSS high water covers the entire fresh child lifetime, including fixture setup.',
      'No cache eviction, repeated warm filesystem reads, same local machine/filesystem; no cross-machine or installed-release extrapolation.',
      'Disk snapshots count unique inodes and allocated blocks but are boundary snapshots, not an exact transient peak; durable input/candidate/WAL sizes are included.',
      'Nested phase wall/CPU measurements are inclusive and must not be summed. qualifiedLeaseLifetime includes admission and completion under one retained lease.',
    ],
    cpu: os.cpus()[0]?.model,
    cpuCount: os.cpus().length,
    filesystem: commandOutput('df', ['-PT', requested]),
    filesystemType: filesystem.type.toString(),
    freeDiskBytesAtStart: String(filesystem.bavail * filesystem.bsize),
    freeMemoryBytes: os.freemem(),
    limits: GENERATION_STAGING_LIMITS,
    node: process.version,
    platform: os.platform(),
    pnpm: commandOutput('pnpm', ['--version']),
    release: os.release(),
    revision: commandOutput('git', ['rev-parse', 'HEAD']),
    status: commandOutput('git', ['status', '--short']),
    totalMemoryBytes: os.totalmem(),
  }
  await writeFile(path.join(requested, 'system.json'), `${JSON.stringify(system, null, 2)}\n`, {
    mode: 0o600,
  })
  const profileFixtures = new Map<Profile, CaseConfig['fixture']>()
  const icc = await readFile(path.join(repository, 'worker-python/src/imagegen_worker/srgb.icc'))
  assert.equal(digest(icc), IGS_SRGB_ICC_SHA256)
  const fixtureManifest: Record<string, unknown> = {}
  const results: Record<string, unknown>[] = []
  try {
    for (const name of selected) {
      const width = name === 'normal1024' || name === 'escaped1024' ? 1024 : 2000
      let target = fixturePng(width, true, icc)
      let output = fixturePng(width, false, icc)
      if (name === 'storage32MiB') {
        target = padStoragePng(target)
        output = padStoragePng(output)
        assert.equal(target.length, IGS_GENERATION_PNG_MAX_BYTES)
        assert.equal(output.length, IGS_GENERATION_PNG_MAX_BYTES)
      }
      for (const [label, bytes] of [
        ['target', target],
        ['output', output],
      ] as const) {
        await validateSrgbPngStream(
          (async function* () {
            yield bytes
          })(),
          `${label}.png`,
          IGS_GENERATION_PNG_MAX_BYTES,
          width,
        )
        await writeFile(path.join(fixtures, `${name}-${label}.png`), bytes, { mode: 0o600 })
      }
      profileFixtures.set(name, {
        outputPath: path.join(fixtures, `${name}-output.png`),
        targetPath: path.join(fixtures, `${name}-target.png`),
        width,
      })
      fixtureManifest[name] = {
        height: width,
        outputBytes: output.length,
        outputSha256: digest(output),
        targetBytes: target.length,
        targetSha256: digest(target),
        width,
      }
    }
    await writeFile(
      path.join(requested, 'fixture-manifest.json'),
      `${JSON.stringify(fixtureManifest, null, 2)}\n`,
      { mode: 0o600 },
    )
    const planned: CaseConfig[] = []
    for (const profile of selected) {
      const runs =
        profile === 'storage32MiB' && option('--repetitions') === undefined ? 1 : repetitions
      const sizes = profile === 'storage32MiB' && option('--counts') === undefined ? [64] : counts
      for (const count of sizes) {
        for (let repetition = 1; repetition <= runs; repetition++) {
          planned.push({
            artifactDirectory: requested,
            count,
            fixture: profileFixtures.get(profile)!,
            id: `${profile}-${count}-r${repetition}`,
            profile,
            repetition,
            sourceManifestPath,
          })
        }
      }
    }
    const controlProfile = selected.find((profile) => profile !== 'storage32MiB') ?? 'storage32MiB'
    planned.push({
      artifactDirectory: requested,
      count: 65,
      fixture: profileFixtures.get(controlProfile)!,
      id: 'oversized-65-r1',
      profile: controlProfile,
      repetition: 1,
      sourceManifestPath,
    })
    await writeFile(path.join(requested, 'plan.json'), `${JSON.stringify(planned, null, 2)}\n`, {
      mode: 0o600,
    })
    for (const config of planned) {
      // Parent ownership lets an OOM/signal failure be reported and cleaned without guessing paths.
      config.caseDataDirectory = await mkdtemp(path.join(requested, 'case-data-'))
      const configPath = path.join(requested, `${config.id}.config.json`)
      await writeFile(configPath, `${JSON.stringify(config)}\n`, { mode: 0o600 })
      const args = [
        path.join(repository, 'node_modules/tsx/dist/cli.mjs'),
        scriptPath,
        '--case',
        configPath,
      ]
      await appendFile(
        path.join(requested, 'commands.jsonl'),
        `${JSON.stringify({ args, command: process.execPath, cwd: repository })}\n`,
        { mode: 0o600 },
      )
      process.stdout.write(
        `${JSON.stringify({ event: 'case-started', id: config.id, remaining: planned.length - results.length })}\n`,
      )
      let stdout = ''
      let stderr = ''
      const childExit = await new Promise<{
        code: number | null
        error?: ReturnType<typeof errorDetails>
        signal: NodeJS.Signals | null
      }>((resolve) => {
        const child = spawn(process.execPath, args, {
          cwd: repository,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        child.stdout.on('data', (chunk: Buffer) => {
          stdout += chunk.toString()
          process.stdout.write(chunk)
        })
        child.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString()
          process.stderr.write(chunk)
        })
        child.on('error', (error) =>
          resolve({ code: null, error: errorDetails(error), signal: null }),
        )
        child.on('close', (code, signal) => resolve({ code, signal }))
      })
      await writeFile(path.join(requested, `${config.id}.log`), stdout + stderr, { mode: 0o600 })
      const resultPath = path.join(requested, `${config.id}.result.json`)
      let result: Record<string, unknown>
      try {
        result = JSON.parse(await readFile(resultPath, 'utf8')) as Record<string, unknown>
      } catch (error) {
        result = {
          config,
          error: { detail: errorDetails(error), message: 'Child did not leave a readable result' },
          outcome: 'error',
        }
      }
      result.childExit = childExit
      try {
        await rm(config.caseDataDirectory, { force: true, recursive: true })
        result.ownedCaseDataRemoved = true
      } catch (error) {
        result.parentCleanupError = errorDetails(error)
        result.ownedCaseDataRemoved = false
      }
      await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 })
      results.push(result)
      await writeFile(
        path.join(requested, 'results.json'),
        `${JSON.stringify(results, null, 2)}\n`,
        { mode: 0o600 },
      )
      if (
        childExit.code !== 0 ||
        result.outcome === 'error' ||
        result.ownedCaseDataRemoved !== true
      ) {
        throw new Error(`Capacity case failed: ${config.id}; see its saved result/log`)
      }
    }
    process.stdout.write(
      `${JSON.stringify({ artifactDirectory: requested, cases: results.length, event: 'harness-finished' })}\n`,
    )
  } finally {
    await rm(fixtures, { force: true, recursive: true })
  }
}

try {
  const casePath = option('--case')
  await (casePath
    ? runCase(JSON.parse(await readFile(casePath, 'utf8')) as CaseConfig)
    : runHarness())
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({ error: errorDetails(error), event: 'harness-error' })}\n`,
  )
  process.exitCode = 1
}
