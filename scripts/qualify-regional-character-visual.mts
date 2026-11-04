import { IGS_SRGB_ICC_SHA256 } from '../src/shared/projects/color-profile.js'
import type { GenerationDenoisingProgress } from '../src/shared/projects/generation-progress.js'
import { isQualifiedInferenceWorkerReady } from '../src/shared/projects/inference-worker-capabilities.js'

/**
 * ROOT-only character visual experiments: the legacy seven-request regional profile, a fixed
 * three-request ordinary count-tag control and a four-request regional count-tag continuation.
 * Importing this module runs nothing. Existing Main capture/preparation, installed worker0.14,
 * native regional execution and owned PNG readers remain authoritative. This direct backend probe
 * does not qualify UI, queue durability, independent native PT-to-RGB lineage, trained quality,
 * Anima or a generic SDXL product family.
 *
 * InvokeAI basis: a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd, graph.ts,
 * core/canvas/addRegionalGuidance.ts and compileCanvasGraph.ts, text_encoder/compel.py and
 * sd/denoise_latents.py. Adaptations use the already qualified invoke-canvas-v1 Studio path.
 * Readiness/installation/resource guards reuse upgrade-qualification-worker.mjs; the small RGB
 * observation decoder follows qualify-installed-regional-generation.mjs. No custom publisher,
 * replacement sampling loop, model/environment copy, allocator patch or automatic retry is used.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { type BigIntStats, constants } from 'node:fs'
import { lstat, mkdir, open, readFile, realpath, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { inflateSync } from 'node:zlib'

import { GenerationWorkerClient } from '../src/main/projects/generation-worker-client.js'
import { withIllustriousTxt2ImgRequest } from '../src/main/projects/illustrious-txt2img-job.js'
import { captureInferenceWorkerOwner } from '../src/main/projects/inference-worker-ownership.js'
import {
  type CharacterVisualProbeUseCase,
  produceCharacterVisualProbe,
} from '../src/main/projects/test-fixtures/regional-guidance-character-visual-probe.js'
import { readSmartPatchModelSourceOutput } from '../src/main/projects/worker-client.js'

interface QualificationHelpers {
  assertRuntimeIdle: (appData: string, ownedPython: string) => Promise<void>
  assertUpgradeBounds: (options: { maxRuntimeSeconds: number }) => Promise<unknown>
  treeManifest: (root: string) => Promise<Record<string, { bytes: number; sha256: string }>>
}
// The existing JavaScript helper has no declaration file. The URL is fixed, never fixture input.
const qualificationHelpersUrl = new URL('./upgrade-qualification-worker.mjs', import.meta.url)
const { assertRuntimeIdle, assertUpgradeBounds, treeManifest } = (await import(
  qualificationHelpersUrl.href
)) as QualificationHelpers

const REPOSITORY = path.resolve(import.meta.dirname, '..')
const ARTIFACT_ROOT = path.join(os.homedir(), '.codex', 'artifacts', 'imagegen-studio')
const BASE = 'cf0171be3e8261d5b1f17252cc47d770142b6a07'
const INVOKE_BASE = 'a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd'
const CONTRACT_SHA256 = 'aaa2c64d59e6e1ab5f90e4e739d3a556a9ff346efb1d0b3f6aafd6e3a625d733'
const CHECKPOINT_SHA256 = '3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9'
const CHECKPOINT_BYTES = 6_938_040_760
const PROFILE = 'regional-character-visual-v1'
const ORDINARY_PROFILE = 'ordinary-two-character-tags-v1'
const ORDINARY_BASE = '474aa1bc17a2637a85b94e9749f9e798af36a3fc'
const ORDINARY_CONTRACT_SHA256 = '12512a2ca955cce7326471cdc66001a74781eb2d511a4858ceb5c50a327e41a9'
const ORDINARY_RUN = path.join(
  ARTIFACT_ROOT,
  'runs/illustrious-ordinary-character/20261105-count-tag',
)
const ORDINARY_GLOBAL =
  '2girls, anime illustration of two women standing apart side by side, waist-up, simple clothing, plain light gray background, coherent daylight'
const ORDINARY_LABELS = ['seed123-baseline', 'seed124-baseline', 'seed123-baseline-repeat'] as const
const TAGGED_PROFILE = 'regional-two-character-tags-v1'
const TAGGED_BASE = '9befdf893b382d9bdc880b9b6bd29613acc8559b'
const TAGGED_CONTRACT_SHA256 = 'a016a617f39362568aa122ab06aab5a25c1a3adad7341bc875b8be78c4fa990e'
const TAGGED_RUN = path.join(
  ARTIFACT_ROOT,
  'runs/regional-guidance-tagged-visual/20261105-red-blue',
)
const TAGGED_LABELS = [
  'seed123-assignment',
  'seed123-swapped',
  'seed124-assignment',
  'seed124-swapped',
] as const
const LABELS = [
  'seed123-baseline',
  'seed123-assignment',
  'seed123-swapped',
  'seed124-baseline',
  'seed124-assignment',
  'seed124-swapped',
  'seed123-assignment-repeat',
] as const
const MAX_PNG_BYTES = 32 * 1024 ** 2
const execute = promisify(execFile)

interface Descriptor {
  path: string
  sha256: string
}
interface Checkpoint extends Descriptor {
  byteSize: number
  civitaiFileId: number
  civitaiModelId: number
  civitaiVersionId: number
  modelName: string
  versionName: string
}
interface Fixture {
  appData: string
  artifacts: string
  checkpoint: Checkpoint
  contract: Descriptor
  deadlineSeconds: 1800
  profile: typeof ORDINARY_PROFILE | typeof PROFILE | typeof TAGGED_PROFILE
  provisionReport: Descriptor
  schemaVersion: 1
}
interface CaseOutcome {
  condition: string
  confirmedWorkerExit: true
  elapsedMilliseconds: number
  label: string
  output: { byteSize: number; path: string; rgbSha256: string; sha256: string }
  preparedSha256: string
  progress: GenerationDenoisingProgress[]
  ready: unknown
  recipeSha256: string
  requestSha256: string
  seed: number
  visualStatus: 'pending'
  worker: unknown
}
export async function qualifyRegionalCharacterVisual(fixturePath: string): Promise<unknown> {
  assert.equal(process.platform, 'linux')
  assert.equal(process.arch, 'x64')
  assert.ok(within(ARTIFACT_ROOT, canonicalPath(fixturePath)))
  const fixtureFile = await json(fixturePath, 64 * 1024)
  const fixture = fixtureFrom(fixtureFile.value)
  const ordinary = fixture.profile === ORDINARY_PROFILE
  const tagged = fixture.profile === TAGGED_PROFILE
  const base = tagged ? TAGGED_BASE : ordinary ? ORDINARY_BASE : BASE
  const contractSha256 = tagged
    ? TAGGED_CONTRACT_SHA256
    : ordinary
      ? ORDINARY_CONTRACT_SHA256
      : CONTRACT_SHA256
  const labels = tagged ? TAGGED_LABELS : ordinary ? ORDINARY_LABELS : LABELS
  const nativeRequestCeiling = tagged ? 4 : ordinary ? 3 : 7
  const originalLabel = tagged ? null : ordinary ? 'seed123-baseline' : 'seed123-assignment'
  const repeatLabel = tagged
    ? null
    : ordinary
      ? 'seed123-baseline-repeat'
      : 'seed123-assignment-repeat'
  for (const target of [
    fixture.artifacts,
    fixture.appData,
    fixture.provisionReport.path,
    fixture.checkpoint.path,
    fixture.contract.path,
  ]) {
    assert.ok(within(ARTIFACT_ROOT, target))
  }
  assert.ok(
    !within(fixture.appData, fixture.artifacts) && !within(fixture.artifacts, fixture.appData),
  )
  assert.equal(path.dirname(fixturePath), fixture.artifacts)
  assert.equal(path.dirname(fixture.contract.path), fixture.artifacts)
  await directory(fixture.artifacts)
  await directory(fixture.appData)
  const contractFile = await json(fixture.contract.path, 64 * 1024)
  assert.equal(fixture.contract.sha256, contractSha256)
  assert.equal(contractFile.sha256, contractSha256)
  const contract = contractFile.value
  assert.equal(contract.base, base)
  assert.equal(contract.profile, fixture.profile)
  assert.equal(contract.fixedBeforeNativeExecution, true)
  assert.deepEqual(contract.caseLabels, labels)
  assert.equal(contract.nativeRequestCeiling, nativeRequestCeiling)
  if (ordinary || tagged) {
    assert.equal(
      contract.schema,
      tagged
        ? 'regional-two-character-tags-experiment-v1'
        : 'ordinary-two-character-tags-experiment-v1',
    )
    assert.equal(contract.globalPositive, ORDINARY_GLOBAL)
    assert.equal(contract.globalNegative, '')
    assert.deepEqual(contract.bbox, { height: 1024, width: 1024, x: -13, y: 5 })
    assert.deepEqual(contract.seeds, [123, 124])
    assert.deepEqual(contract.conditions, tagged ? ['assignment', 'swapped'] : ['baseline'])
    assert.equal(contract.noResources, true)
  }
  const startedAt = Date.now()
  const bounds = await assertUpgradeBounds({ maxRuntimeSeconds: fixture.deadlineSeconds })
  const mainGroup = groupFrom(await readFile(`/proc/${process.pid}/cgroup`, 'utf8'))
  const revision = (
    await execute('git', ['rev-parse', 'HEAD'], {
      cwd: REPOSITORY,
      maxBuffer: 4096,
      timeout: 10_000,
    })
  ).stdout.trim()
  assert.equal(revision, base)
  const invokeRevision = (
    await execute('git', ['rev-parse', 'HEAD'], {
      cwd: path.resolve(REPOSITORY, '../sources/InvokeAI'),
      maxBuffer: 4096,
      timeout: 10_000,
    })
  ).stdout.trim()
  assert.equal(invokeRevision, INVOKE_BASE)
  const initialSources = await sourceCensus()
  const checkpoint = await snapshot(fixture.checkpoint.path, CHECKPOINT_BYTES, false)
  assert.equal(checkpoint.byteSize, CHECKPOINT_BYTES)
  assert.equal(checkpoint.sha256, CHECKPOINT_SHA256)
  const installed = await installation(fixture)
  const outputRoot = path.join(fixture.artifacts, 'character-outputs')
  const scratchBasePath = path.join(fixture.artifacts, 'character-worker-scratch')
  await mkdir(outputRoot, { mode: 0o700 })
  await mkdir(scratchBasePath, { mode: 0o700 })
  const payloadRoot = path.join(fixture.artifacts, 'payloads')
  await mkdir(payloadRoot, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') {
      throw error
    }
  })
  await directory(payloadRoot)
  const outcomes: CaseOutcome[] = []
  let attemptedCalls = 0
  let submittedNativeRequests = 0
  let originalRepeat: { preparedSha256: string; recipeSha256: string; rgb: Buffer } | undefined
  let failure: unknown
  const initialReport = {
    bounds,
    checkpoint: { ...fixture.checkpoint, identity: checkpoint.identity },
    contract: fixture.contract,
    cudaAllocatorFraction: null,
    fixture: { path: fixturePath, sha256: fixtureFile.sha256 },
    installation: installed,
    limits:
      'GPU capacity/allocator ceilings and independent per-case PT-to-RGB lineage are unqualified; actual installed readiness and original owned PNG readers are observed.',
    mainGroup,
    profile: fixture.profile,
    schema: tagged
      ? 'regional-two-character-backend-v1'
      : ordinary
        ? 'ordinary-two-character-backend-v1'
        : 'regional-character-visual-backend-v1',
    source: { files: initialSources, invokeRevision, revision },
    startedAt: new Date(startedAt).toISOString(),
    visualStatus: 'pending',
  }
  await exclusive(path.join(fixture.artifacts, 'character-run-start.json'), initialReport)
  const useCase = async (input: CharacterVisualProbeUseCase): Promise<CaseOutcome> => {
    assert.ok(Date.now() - startedAt < fixture.deadlineSeconds * 1000)
    const { condition, label, models, prepared, recipe, seed } = input
    assert.equal(label, labels[attemptedCalls])
    assert.ok(attemptedCalls < nativeRequestCeiling)
    const recipeSha256 = digest(encoded(recipe))
    const preparedSha256 = digest(encoded(prepared))
    if (label === repeatLabel) {
      assert.ok(originalRepeat)
      assert.equal(recipeSha256, originalRepeat.recipeSha256)
      assert.equal(preparedSha256, originalRepeat.preparedSha256)
    }
    if (ordinary || tagged) {
      if (ordinary) {
        assert.equal(condition, 'baseline')
        assert.deepEqual(recipe.regions, [])
      } else {
        assert.ok(condition === 'assignment' || condition === 'swapped')
        assert.equal(recipe.regions.length, 2)
        const texts = ['one woman with long red hair', 'one woman with long blue hair']
        for (const [index, region] of recipe.regions.entries()) {
          assert.deepEqual(region.positive, {
            embeddingRefs: [],
            text: texts[condition === 'assignment' ? index : 1 - index],
          })
          assert.deepEqual(region.negative, {
            prompt: { embeddingRefs: [], text: '' },
            source: 'regional',
          })
          assert.deepEqual(region.embeddings, { negative: [], positive: [] })
          assert.equal(region.referenceImages?.length ?? 0, 0)
        }
      }
      assert.deepEqual(recipe.globalPrompts, {
        negative: { embeddingRefs: [], text: '' },
        positive: { embeddingRefs: [], text: ORDINARY_GLOBAL },
      })
      assert.deepEqual(recipe.globalEmbeddings, { negative: [], positive: [] })
    }
    assert.equal(recipe.regions.length, condition === 'baseline' ? 0 : 2)
    assert.equal(seed, label.includes('124') ? 124 : 123)
    assert.deepEqual(await sourceCensus(), initialSources)
    assert.deepEqual((await json(fixture.contract.path, 64 * 1024)).sha256, contractSha256)
    await assertUpgradeBounds({ maxRuntimeSeconds: fixture.deadlineSeconds })
    await assertRuntimeIdle(fixture.appData, installed.basePrefix)
    // Create-only intent precedes worker startup. No failed case is retried or relabelled.
    await exclusive(path.join(fixture.artifacts, `${label}.intent.json`), {
      condition,
      contractSha256,
      index: attemptedCalls + 1,
      label,
      maximumNativeRequests: 1,
      preparedSha256,
      recipeSha256,
      requestDeadlineMilliseconds: 600_000,
      route: condition === 'baseline' ? 'ordinary-client-generate' : 'invoke-canvas-v1',
      schema: tagged
        ? 'regional-two-character-native-intent-v1'
        : ordinary
          ? 'ordinary-two-character-native-intent-v1'
          : 'regional-character-native-intent-v1',
      seed,
      sourceSha256: digest(encoded(initialSources)),
      time: new Date().toISOString(),
    })
    attemptedCalls++
    const caseStartedAt = Date.now()
    const beforeChildren = new Set(await children())
    let client: GenerationWorkerClient | undefined
    let worker: Awaited<ReturnType<typeof captureInferenceWorkerOwner>> | undefined
    let ready: unknown
    const progress: GenerationDenoisingProgress[] = []
    let requestSha256 = ''
    let output: CaseOutcome['output'] | undefined
    let caseError: unknown
    let confirmedWorkerExit = false
    let submitted = false
    try {
      client = await GenerationWorkerClient.start(
        {
          pythonExecutable: installed.pythonExecutable,
          runtimeRoot: installed.runtimeRoot,
          scratchBasePath,
        },
        {
          environment: {
            IGS_SDXL_CONFIG_DIR: installed.configDir,
            LANG: 'C.UTF-8',
            LC_ALL: 'C.UTF-8',
            PYTHONDONTWRITEBYTECODE: '1',
            TOKENIZERS_PARALLELISM: 'false',
          },
          requestTimeoutMs: 600_000,
          startupTimeoutMs: 120_000,
        },
      )
      const created = (await children()).filter((pid) => !beforeChildren.has(pid))
      assert.equal(created.length, 1, 'Exactly one fresh owned inference worker is required')
      worker = await captureInferenceWorkerOwner(created[0])
      assert.equal(
        groupFrom(await readFile(`/proc/${worker.worker.pid}/cgroup`, 'utf8')),
        mainGroup,
      )
      ready = client.ready
      assert.ok(isQualifiedInferenceWorkerReady(ready))
      assert.equal(client.ready.workerVersion, '0.14.0')
      assert.equal(client.ready.pythonVersion, '3.12.13')
      assert.deepEqual(
        [...client.ready.capabilities].sort(),
        [...(installed.ready.capabilities as string[])].sort(),
      )
      assert.equal(client.ready.protocolVersion, installed.ready.protocolVersion)
      assert.equal(client.ready.runtimeProfile, installed.ready.runtimeProfile)
      const activeClient = client
      const onProgress = (value: GenerationDenoisingProgress): void => {
        assert.equal(value.step, progress.length + 1)
        assert.equal(value.totalSteps, 30)
        progress.push({ ...value })
      }
      output = await withIllustriousTxt2ImgRequest({
        modelService: models,
        prepared,
        ready: client.ready,
        scratchBasePath,
        use: async (request) => {
          assert.deepEqual(request.job.bbox, contract.bbox)
          assert.equal(request.job.sampling.seed, seed)
          assert.equal(request.job.sampling.scheduler, 'euler')
          assert.equal(request.job.sampling.steps, 30)
          assert.equal(request.job.sampling.cfgScale, 5)
          assert.equal(request.job.sampling.cfgRescale ?? 0, 0)
          assert.deepEqual(
            request.job.sampling.noiseProfile,
            record(contract.sampling, 'sampling').noiseProfile,
          )
          assert.equal(request.job.vaePrecision, 'FP16')
          assert.equal(request.job.checkpoint.path, fixture.checkpoint.path)
          assert.equal(request.job.checkpoint.sha256, CHECKPOINT_SHA256)
          assert.equal(request.job.checkpoint.predictionType, 'epsilon')
          assert.equal(request.job.prompts.positive, contract.globalPositive)
          assert.equal(request.job.prompts.negative, '')
          assert.ok(!request.job.loras?.length)
          assert.ok(!request.job.vae)
          assert.ok(
            !request.job.embeddings?.positive.length && !request.job.embeddings?.negative.length,
          )
          requestSha256 = digest(encoded(request))
          await exclusive(path.join(fixture.artifacts, `${label}.request.json`), {
            preparedSha256,
            ready,
            recipe,
            recipeSha256,
            request,
            requestSha256,
            worker,
          })
          let pngBytes: Buffer
          let response: unknown
          assert.ok(submittedNativeRequests < nativeRequestCeiling)
          submittedNativeRequests++
          submitted = true
          if (condition === 'baseline') {
            response = await activeClient.generate(request, onProgress)
            const completed = record(response, 'ordinary completion')
            assert.equal(completed.type, 'generation-done')
            assert.equal(completed.requestId, request.requestId)
            assert.equal(completed.outputPath, request.job.output.pngPath)
            assert.equal(completed.seed, seed)
            const actual = await snapshot(request.job.output.pngPath, MAX_PNG_BYTES, false)
            // Read before the standard request lease removes its own output directory.
            pngBytes = await readSmartPatchModelSourceOutput(request.job.output.pngPath, {
              byteSize: actual.byteSize,
              colorSpace: 'srgb',
              height: 1024,
              iccSha256: IGS_SRGB_ICC_SHA256,
              path: request.job.output.pngPath,
              sha256: actual.sha256,
              width: 1024,
            })
          } else {
            const regional = await activeClient.executeCurrentCanvasRegional(
              {
                compositionProfile: 'invoke-canvas-v1',
                globalNegativeCoverage: { kind: 'everywhere' },
                globalPositiveCoverage: { kind: 'everywhere' },
                layout: 'cfg-negative-first',
                negativePooledSourceId: 'current-canvas',
                positivePooledSourceId: 'current-canvas',
                recipe,
                request,
              },
              onProgress,
            )
            assert.equal(regional.seed, seed)
            // The regional owner detaches the command into its own verified, disposed lease.
            // readRegionalWorkerResult already correlates the completion to that exact request.
            const regionalLease = path.dirname(regional.output.path)
            assert.equal(path.dirname(regionalLease), scratchBasePath)
            assert.match(path.basename(regionalLease), /^regional-request-[\w-]+$/)
            assert.equal(path.basename(regional.output.path), 'result.png')
            assert.equal(regional.output.width, 1024)
            assert.equal(regional.output.height, 1024)
            assert.equal(regional.output.iccSha256, IGS_SRGB_ICC_SHA256)
            pngBytes = regional.pngBytes
            response = { ...regional, pngBytes: undefined }
            assert.equal(pngBytes.length, regional.output.byteSize)
            assert.equal(digest(pngBytes), regional.output.sha256)
          }
          assert.equal(progress.length, 30)
          const decoded = decodedRgb(pngBytes)
          if (label === originalLabel) {
            originalRepeat = { preparedSha256, recipeSha256, rgb: Buffer.from(decoded.rgb) }
          }
          if (label === repeatLabel) {
            assert.ok(
              decoded.rgb.equals(originalRepeat!.rgb),
              ordinary
                ? 'Frozen ordinary repeat must reproduce every decoded RGB byte'
                : 'Frozen assignment repeat must reproduce every decoded RGB byte',
            )
          }
          const outputPath = path.join(outputRoot, `${label}.png`)
          await writeFile(outputPath, pngBytes, { flag: 'wx', mode: 0o600 })
          const retained = await snapshot(outputPath, MAX_PNG_BYTES, true)
          assert.ok(retained.bytes!.equals(pngBytes))
          assert.equal(decodedRgb(retained.bytes!).rgbSha256, decoded.rgbSha256)
          await exclusive(path.join(fixture.artifacts, `${label}.completion.json`), {
            output: {
              byteSize: retained.byteSize,
              path: outputPath,
              rgbSha256: decoded.rgbSha256,
              sha256: retained.sha256,
            },
            progress,
            requestId: request.requestId,
            requestSha256,
            response,
          })
          return {
            byteSize: retained.byteSize,
            path: outputPath,
            rgbSha256: decoded.rgbSha256,
            sha256: retained.sha256,
          }
        },
      })
      assert.equal(digest(encoded(recipe)), recipeSha256)
      assert.equal(digest(encoded(prepared)), preparedSha256)
    } catch (error) {
      caseError = error
      throw error
    } finally {
      try {
        if (client) {
          await client.close()
          if (worker) {
            await physicalExit(worker.worker.pid)
          }
          assert.equal(GenerationWorkerClient.hasUnconfirmedStartExit(), false)
          confirmedWorkerExit = true
        }
      } finally {
        await exclusive(path.join(fixture.artifacts, `${label}.outcome.json`), {
          condition,
          confirmedWorkerExit,
          elapsedMilliseconds: Date.now() - caseStartedAt,
          error:
            caseError instanceof Error
              ? { message: caseError.message, name: caseError.name }
              : caseError,
          label,
          output,
          preparedSha256,
          progress,
          ready,
          recipeSha256,
          requestSha256,
          seed,
          status: caseError
            ? 'failed'
            : confirmedWorkerExit && output
              ? 'mechanical-pass'
              : 'incomplete',
          submitted,
          visualStatus: 'pending',
          worker,
        })
      }
    }
    assert.ok(output && confirmedWorkerExit)
    const outcome: CaseOutcome = {
      condition,
      confirmedWorkerExit: true,
      elapsedMilliseconds: Date.now() - caseStartedAt,
      label,
      output,
      preparedSha256,
      progress,
      ready,
      recipeSha256,
      requestSha256,
      seed,
      visualStatus: 'pending',
      worker,
    }
    outcomes.push(outcome)
    return outcome
  }
  let producer: unknown
  try {
    const producerOptions = {
      pythonExecutable: installed.pythonExecutable,
      run: fixture.artifacts,
      runtimeRoot: installed.runtimeRoot,
      source: fixture.checkpoint.path,
      useCase,
    }
    producer = tagged
      ? await produceCharacterVisualProbe<CaseOutcome>({
          ...producerOptions,
          profile: TAGGED_PROFILE,
        })
      : ordinary
        ? await produceCharacterVisualProbe<CaseOutcome>({
            ...producerOptions,
            profile: ORDINARY_PROFILE,
          })
        : await produceCharacterVisualProbe<CaseOutcome>(producerOptions)
    assert.equal(attemptedCalls, nativeRequestCeiling)
    assert.equal(submittedNativeRequests, nativeRequestCeiling)
    assert.equal(outcomes.length, nativeRequestCeiling)
    assert.deepEqual(
      outcomes.map((entry) => entry.label),
      labels,
    )
    assert.deepEqual(await sourceCensus(), initialSources)
    assert.deepEqual((await json(fixture.contract.path, 64 * 1024)).sha256, contractSha256)
    await installation(fixture)
    const finalCheckpoint = await snapshot(fixture.checkpoint.path, CHECKPOINT_BYTES, false)
    assert.equal(finalCheckpoint.sha256, CHECKPOINT_SHA256)
    assert.deepEqual(finalCheckpoint.identity, checkpoint.identity)
  } catch (error) {
    failure = error
    throw error
  } finally {
    await exclusive(path.join(fixture.artifacts, 'character-run-final.json'), {
      ...initialReport,
      attemptedCalls,
      completedCalls: outcomes.length,
      elapsedMilliseconds: Date.now() - startedAt,
      error: failure instanceof Error ? { message: failure.message, name: failure.name } : failure,
      outcomes,
      producer,
      status: failure
        ? 'failed'
        : outcomes.length === nativeRequestCeiling
          ? 'mechanical-pass-visual-pending'
          : 'incomplete',
      submittedNativeRequests,
      visualStatus: 'pending',
    })
  }
  return { attemptedCalls, outcomes, outputRoot, status: 'mechanical-pass-visual-pending' }
}

function digest(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}
/** Lossless metadata only: actual native input receives original Buffer/Uint8Array objects. */
function metadata(value: unknown): unknown {
  if (Buffer.isBuffer(value)) {
    return { $buffer_b64: value.toString('base64') }
  }
  if (value instanceof Uint8Array) {
    return { $alpha8_b64: Buffer.from(value).toString('base64') }
  }
  if (Array.isArray(value)) {
    return value.map(metadata)
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, metadata(entry)]),
    )
  }
  return value
}
function encoded(value: unknown): string {
  return `${JSON.stringify(metadata(value), null, 2)}\n`
}
function record(value: unknown, name: string): Record<string, unknown> {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), name)
  return value as Record<string, unknown>
}
function keys(value: Record<string, unknown>, expected: readonly string[]): void {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort())
}
function text(value: unknown): string {
  assert.equal(typeof value, 'string')
  return value as string
}
function canonicalPath(value: unknown): string {
  const name = text(value)
  assert.ok(path.isAbsolute(name) && path.normalize(name) === name && !name.includes('\0'))
  return name
}
function within(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}
async function directory(name: string): Promise<void> {
  canonicalPath(name)
  const entry = await lstat(name)
  assert.ok(entry.isDirectory() && !entry.isSymbolicLink() && entry.uid === process.getuid?.())
  assert.equal(await realpath(name), name)
}

function sameFile(left: BigIntStats, right: BigIntStats): boolean {
  return ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'mode', 'uid', 'gid', 'nlink'].every(
    (key) => left[key as keyof BigIntStats] === right[key as keyof BigIntStats],
  )
}
/** Bounded no-follow snapshot/digest; the large checkpoint never becomes another owned copy. */
async function snapshot(
  name: string,
  maximum: number,
  keep: boolean,
): Promise<{
  bytes?: Buffer
  byteSize: number
  identity: Record<string, string>
  sha256: string
}> {
  canonicalPath(name)
  const nominated = await lstat(name, { bigint: true })
  assert.ok(nominated.isFile() && !nominated.isSymbolicLink())
  assert.equal(nominated.uid, BigInt(process.getuid!()))
  assert.equal(await realpath(name), name)
  const file = await open(name, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const before = await file.stat({ bigint: true })
    assert.ok(before.isFile() && sameFile(nominated, before))
    assert.ok(before.size > 0n && before.size <= BigInt(maximum))
    const hash = createHash('sha256')
    const chunks: Buffer[] = []
    const scratch = Buffer.allocUnsafe(Math.min(Number(before.size) + 1, 2 * 1024 ** 2))
    let total = 0
    for (;;) {
      const { bytesRead } = await file.read(
        scratch,
        0,
        Math.min(scratch.length, maximum - total + 1),
        null,
      )
      if (!bytesRead) {
        break
      }
      total += bytesRead
      assert.ok(total <= maximum && total <= Number(before.size), `File grew: ${name}`)
      const chunk = scratch.subarray(0, bytesRead)
      hash.update(chunk)
      if (keep) {
        chunks.push(Buffer.from(chunk))
      }
    }
    assert.equal(total, Number(before.size))
    assert.ok(sameFile(before, await file.stat({ bigint: true })))
    assert.ok(sameFile(before, await lstat(name, { bigint: true })))
    assert.equal(await realpath(name), name)
    return {
      byteSize: total,
      sha256: hash.digest('hex'),
      ...(keep ? { bytes: Buffer.concat(chunks) } : {}),
      identity: Object.fromEntries(
        ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'mode', 'uid', 'gid', 'nlink'].map((key) => [
          key,
          String(before[key as keyof BigIntStats]),
        ]),
      ),
    }
  } finally {
    await file.close()
  }
}
async function json(
  name: string,
  maximum = 16 * 1024 ** 2,
): Promise<{
  sha256: string
  value: Record<string, unknown>
}> {
  const file = await snapshot(name, maximum, true)
  return {
    sha256: file.sha256,
    value: record(JSON.parse(file.bytes!.toString('utf8')) as unknown, name),
  }
}
async function exclusive(name: string, value: unknown): Promise<void> {
  await writeFile(name, encoded(value), { flag: 'wx', mode: 0o600 })
}
function descriptor(value: unknown): Descriptor {
  const object = record(value, 'descriptor')
  keys(object, ['path', 'sha256'])
  const sha256 = text(object.sha256)
  assert.match(sha256, /^[a-f0-9]{64}$/)
  return { path: canonicalPath(object.path), sha256 }
}

function fixtureFrom(value: Record<string, unknown>): Fixture {
  keys(value, [
    'schemaVersion',
    'profile',
    'artifacts',
    'appData',
    'provisionReport',
    'checkpoint',
    'contract',
    'deadlineSeconds',
  ])
  assert.equal(value.schemaVersion, 1)
  assert.ok(
    value.profile === PROFILE ||
      value.profile === ORDINARY_PROFILE ||
      value.profile === TAGGED_PROFILE,
  )
  if (value.profile === ORDINARY_PROFILE) {
    assert.equal(value.artifacts, ORDINARY_RUN)
  }
  if (value.profile === TAGGED_PROFILE) {
    assert.equal(value.artifacts, TAGGED_RUN)
  }
  assert.equal(value.deadlineSeconds, 1800)
  const source = record(value.checkpoint, 'checkpoint')
  keys(source, [
    'path',
    'sha256',
    'byteSize',
    'modelName',
    'versionName',
    'civitaiModelId',
    'civitaiVersionId',
    'civitaiFileId',
  ])
  assert.equal(source.sha256, CHECKPOINT_SHA256)
  assert.equal(source.byteSize, CHECKPOINT_BYTES)
  assert.equal(source.civitaiModelId, 795_765)
  assert.equal(source.civitaiVersionId, 889_818)
  assert.equal(source.civitaiFileId, 798_303)
  for (const key of ['civitaiModelId', 'civitaiVersionId', 'civitaiFileId']) {
    assert.ok(Number.isSafeInteger(source[key]) && Number(source[key]) > 0)
  }
  for (const key of ['modelName', 'versionName']) {
    assert.ok(text(source[key]).length > 0)
  }
  return {
    appData: canonicalPath(value.appData),
    artifacts: canonicalPath(value.artifacts),
    checkpoint: { ...source, path: canonicalPath(source.path) } as unknown as Checkpoint,
    contract: descriptor(value.contract),
    deadlineSeconds: 1800,
    profile: value.profile,
    provisionReport: descriptor(value.provisionReport),
    schemaVersion: 1,
  }
}

async function sourceCensus(): Promise<Record<string, { bytes: number; sha256: string }>> {
  // Includes the entire current Python payload, producer and direct Main/output ownership seams.
  const python = await treeManifest(path.join(REPOSITORY, 'worker-python/src/imagegen_worker'))
  const files = [
    'scripts/qualify-regional-character-visual.mts',
    'scripts/upgrade-qualification-worker.mjs',
    'scripts/qualification-resource-limits.mjs',
    'src/main/projects/test-fixtures/regional-guidance-character-visual-probe.ts',
    'src/main/projects/generation-worker-client.ts',
    'src/main/projects/inference-worker-ownership.ts',
    'src/main/projects/illustrious-txt2img-job.ts',
    'src/main/projects/regional-worker-request.ts',
    'src/main/projects/worker-client.ts',
    'src/main/runtime/index.ts',
    'src/main/projects/igs-package.ts',
    'src/main/projects/project-current-canvas-regional-recipe.ts',
    'src/main/projects/project-generation-preparation.ts',
    'src/main/projects/project-service.ts',
    'src/shared/projects/regional-invoke-generation.ts',
    'src/shared/projects/generation-progress.ts',
    'src/shared/projects/inference-worker-capabilities.ts',
    'worker-python/pyproject.toml',
    'worker-python/uv.lock',
  ]
  const result: Record<string, { bytes: number; sha256: string }> = {}
  for (const name of files) {
    const current = await snapshot(path.join(REPOSITORY, name), 32 * 1024 ** 2, false)
    result[name] = { bytes: current.byteSize, sha256: current.sha256 }
  }
  for (const [name, entry] of Object.entries(python)) {
    result[`worker-python/src/imagegen_worker/${name}`] = entry
  }
  return result
}

async function installation(fixture: Fixture) {
  const provisionFile = await json(fixture.provisionReport.path)
  assert.equal(provisionFile.sha256, fixture.provisionReport.sha256)
  const provision = provisionFile.value
  const installed = record(provision.installed, 'installed')
  const inputs = record(provision.inputs, 'inputs')
  const workerInputs = record(inputs.worker, 'worker inputs')
  const configInputs = record(inputs.config, 'config inputs')
  const ready = record(provision.ready, 'provision ready')
  const runtimeRoot = path.join(fixture.appData, 'runtime')
  await directory(runtimeRoot)
  const marker = (await json(path.join(fixture.appData, 'qualification-runtime.json'), 1024 ** 2))
    .value
  const pointer = (await json(path.join(runtimeRoot, 'current-runtime.json'), 1024 ** 2)).value
  assert.equal(provision.status, 'activated-qualified')
  assert.equal(provision.appData, fixture.appData)
  assert.equal(provision.confirmedWorkerExit, true)
  assert.equal(marker.report, fixture.provisionReport.path)
  assert.equal(marker.status, 'passed')
  assert.equal(marker.appData, fixture.appData)
  assert.equal(marker.runtimeId, provision.runtimeId)
  assert.equal(marker.confirmedWorkerExit, true)
  assert.equal(pointer.runtimeId, provision.runtimeId)
  assert.equal(pointer.pythonExecutable, provision.pythonExecutable)
  assert.equal(installed.editable, false)
  assert.equal(installed.pythonVersion, '3.12.13')
  const prefix = canonicalPath(installed.prefix)
  const basePrefix = canonicalPath(installed.basePrefix)
  const workerRoot = canonicalPath(installed.workerRoot)
  for (const name of [prefix, basePrefix, workerRoot]) {
    assert.ok(within(runtimeRoot, name))
    await directory(name)
  }
  assert.ok(within(prefix, workerRoot))
  const pythonExecutable = canonicalPath(pointer.pythonExecutable)
  assert.ok(within(runtimeRoot, pythonExecutable))
  const canonicalPython = await realpath(pythonExecutable)
  assert.ok(within(basePrefix, canonicalPython))
  assert.ok((await lstat(canonicalPython)).isFile())
  assert.ok(isQualifiedInferenceWorkerReady(ready))
  assert.equal(ready.workerVersion, '0.14.0')
  for (const capability of [
    'illustrious-regional-invoke-v1',
    'private-current-canvas-regional-v1',
    'illustrious-regional-progress-v1',
    'linux-owned-inference-v1',
    'denoising-progress',
  ]) {
    assert.ok((ready.capabilities as string[]).includes(capability))
  }
  assert.equal(
    (await snapshot(path.join(REPOSITORY, 'worker-python/pyproject.toml'), 1024 ** 2, false))
      .sha256,
    workerInputs.pyprojectSha256,
  )
  assert.equal(
    (await snapshot(path.join(REPOSITORY, 'worker-python/uv.lock'), 16 * 1024 ** 2, false)).sha256,
    workerInputs.lockSha256,
  )
  const sourceFiles = await treeManifest(path.join(REPOSITORY, 'worker-python/src/imagegen_worker'))
  const installedFiles = await treeManifest(workerRoot)
  assert.deepEqual(installedFiles, sourceFiles)
  assert.deepEqual(installedFiles, installed.workerFiles)
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(record(workerInputs.files, 'worker files')).map(([key, value]) => [
        key.replace(/^imagegen_worker\//, ''),
        value,
      ]),
    ),
    sourceFiles,
  )
  const configFiles = await treeManifest(path.join(prefix, 'resources/sdxl-config'))
  assert.deepEqual(configFiles, configInputs.files)
  await assertRuntimeIdle(fixture.appData, basePrefix)
  return {
    basePrefix,
    configDir: path.join(prefix, 'resources/sdxl-config'),
    configFiles,
    installedFiles,
    marker,
    pointer,
    provision,
    pythonExecutable,
    ready,
    runtimeRoot,
    workerRoot,
  }
}
async function children(): Promise<number[]> {
  const value = await readFile(`/proc/${process.pid}/task/${process.pid}/children`, 'utf8')
  return value.trim() ? value.trim().split(/\s+/).map(Number) : []
}
function groupFrom(value: string): string {
  const group = value
    .trim()
    .split('\n')
    .find((line) => line.startsWith('0::'))
    ?.slice(3)
  assert.ok(group && path.isAbsolute(group) && group !== '/')
  return group
}

async function physicalExit(pid: number): Promise<void> {
  try {
    await lstat(`/proc/${pid}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return
    }
    throw error
  }
  throw new Error(`Owned worker physical exit remains unconfirmed: ${pid}`)
}

/** Observation only, adapted from the existing installed qualifier; production readers run first. */
function decodedRgb(bytes: Buffer): {
  height: number
  rgb: Buffer
  rgbSha256: string
  width: number
} {
  assert.ok(bytes.length >= 45 && bytes.length <= MAX_PNG_BYTES)
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  let channels = 0
  let ended = false
  let height = 0
  let width = 0
  const compressed: Buffer[] = []
  for (let count = 0, offset = 8; offset < bytes.length; count++) {
    assert.ok(count < 4096 && offset + 12 <= bytes.length)
    const length = bytes.readUInt32BE(offset)
    const next = offset + length + 12
    assert.ok(next <= bytes.length)
    const tag = bytes.toString('ascii', offset + 4, offset + 8)
    const body = bytes.subarray(offset + 8, next - 4)
    switch (tag) {
      case 'IDAT': {
        compressed.push(body)
        break
      }
      case 'IEND': {
        assert.equal(next, bytes.length)
        assert.equal(length, 0)
        ended = true
        break
      }
      case 'IHDR': {
        assert.equal(count, 0)
        assert.equal(length, 13)
        width = body.readUInt32BE(0)
        height = body.readUInt32BE(4)
        assert.equal(width, 1024)
        assert.equal(height, 1024)
        assert.equal(body[8], 8)
        assert.equal(body[9], 2)
        assert.deepEqual([...body.subarray(10)], [0, 0, 0])
        channels = 3
        break
      }
    }
    if (ended) {
      break
    }
    offset = next
  }
  assert.ok(ended && channels === 3 && compressed.length > 0)
  const stride = width * channels
  const filtered = inflateSync(Buffer.concat(compressed), {
    maxOutputLength: (stride + 1) * height,
  })
  assert.equal(filtered.length, (stride + 1) * height)
  const rgb = Buffer.alloc(stride * height)
  const paeth = (left: number, up: number, diagonal: number): number => {
    const estimate = left + up - diagonal
    const a = Math.abs(estimate - left)
    const b = Math.abs(estimate - up)
    const c = Math.abs(estimate - diagonal)
    return a <= b && a <= c ? left : b <= c ? up : diagonal
  }
  for (let y = 0; y < height; y++) {
    const filter = filtered[y * (stride + 1)]
    assert.ok(filter <= 4)
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? rgb[y * stride + x - channels] : 0
      const up = y ? rgb[(y - 1) * stride + x] : 0
      const diagonal = y && x >= channels ? rgb[(y - 1) * stride + x - channels] : 0
      rgb[y * stride + x] =
        (filtered[y * (stride + 1) + x + 1] +
          [0, left, up, Math.floor((left + up) / 2), paeth(left, up, diagonal)][filter]) &
        255
    }
  }
  return { height, rgb, rgbSha256: digest(rgb), width }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const argv = process.argv.slice(2)
  try {
    assert.ok(
      argv.length === 2 && argv[0] === '--fixture',
      'Usage: pnpm exec tsx scripts/qualify-regional-character-visual.mts --fixture ABSOLUTE_JSON',
    )
    process.stdout.write(
      `${JSON.stringify(await qualifyRegionalCharacterVisual(canonicalPath(argv[1])))}\n`,
    )
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
