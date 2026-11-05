/**
 * Opt-in Main-owner/default installed RuntimeManager qualification. No import starts a worker.
 * InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd: session_queue_common.py concrete graph
 * capture, session_queue_default.py retry_items_by_id and API caller, noise.py/latent_noise.py and
 * devices.py. Existing Studio queue/bootstrap/Retry/conditioning/publication owners do the work.
 * Two native requests only: recovered frozen Retry candidate and identical private-input control.
 * This is not Electron renderer/IPC, public admission, release installation or visual acceptance.
 */
import { IGS_SRGB_ICC_SHA256 } from '../src/shared/projects/color-profile.js'
import { planGenerationBatch } from '../src/shared/projects/generation-batch-plan.js'
import type { GenerationDenoisingProgress } from '../src/shared/projects/generation-progress.js'
import {
  isQualifiedInferenceWorkerReady,
  supportsInferenceRegionalInvokeInitialization,
} from '../src/shared/projects/inference-worker-capabilities.js'
import {
  type IgsRegionalGuidanceV1,
  parseProjectDocumentV1,
} from '../src/shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { crc32, inflateSync } from 'node:zlib'

import type { IgsAssetSource } from '../src/main/projects/igs-package.js'
import type {
  RegionalWorkerInput,
  RegionalWorkerResult,
} from '../src/main/projects/regional-worker-request.js'

import { openAppDatabase } from '../src/main/db/database.js'
import { CivitaiClient } from '../src/main/models/civitai-client.js'
import { CivitaiTokenStore } from '../src/main/models/civitai-token-store.js'
import { ModelRepository } from '../src/main/models/model-repository.js'
import { ModelService } from '../src/main/models/model-service.js'
import {
  createGenerationAppContext,
  type GenerationAppContext,
} from '../src/main/projects/generation-app-context.js'
import { readIgsPackage } from '../src/main/projects/igs-package.js'
import {
  type InferenceWorkerReady,
  withIllustriousTxt2ImgRequest,
} from '../src/main/projects/illustrious-txt2img-job.js'
import { ProjectAutosaveLeaseRegistry } from '../src/main/projects/project-autosave.js'
import {
  type CurrentCanvasRegionalRecipe,
  prepareCurrentCanvasRegionalRecipe,
} from '../src/main/projects/project-current-canvas-regional-recipe.js'
import {
  type PreparedNormalTxt2Img,
  prepareNormalTxt2Img,
} from '../src/main/projects/project-generation-preparation.js'
import { ProjectIndexRepository } from '../src/main/projects/project-index.js'
import { encodeProjectMaskPng } from '../src/main/projects/project-mask.js'
import { ProjectService } from '../src/main/projects/project-service.js'
import { ProjectShadowStore } from '../src/main/projects/project-shadow.js'
import { RegionalGenerationProcessor } from '../src/main/projects/regional-generation-processor.js'
import { classifyTargetPngAlpha } from '../src/main/projects/target-png-mode.js'
import { createRuntimeRoots, RuntimeManager } from '../src/main/runtime/index.js'

interface Helpers {
  assertRuntimeIdle: (appData: string, ownedPython: string) => Promise<unknown>
  assertUpgradeBounds: (options: { maxRuntimeSeconds: number }) => Promise<unknown>
  treeManifest: (root: string) => Promise<Record<string, { bytes: number; sha256: string }>>
}
const helpersUrl = new URL('./upgrade-qualification-worker.mjs', import.meta.url)
const { assertRuntimeIdle, assertUpgradeBounds, treeManifest } = (await import(
  helpersUrl.href
)) as Helpers
const execute = promisify(execFile)
const ROOT = path.resolve(import.meta.dirname, '..')
const ARTIFACT_ROOT = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const BASE = 'e3904569acc81240205607a52e26dfb9f1533cfe'
const PROFILE = 'installed-regional-invoke-init-v1'
const INITIALIZATION = 'invoke-cpu-f32-add-noise-v1' as const
const SOURCE_SHA = '3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9'
const SOURCE_BYTES = 6_938_040_760
const BBOX = { height: 1024, width: 1024, x: -13, y: 5 }
const GLOBAL =
  '2girls, anime illustration of two women standing apart side by side, waist-up, simple clothing, plain light gray background, coherent daylight'
const REGIONAL = ['1girl, long hair, red hair', '1girl, long hair, blue hair']
const NOISE = {
  baseSchedule: 'sdxl-scaled-linear-v1',
  rescaleBetasZeroSnr: false,
  schemaVersion: 1,
  timestepSpacing: 'leading',
} as const
const digest = (bytes: string | Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex')
const prompt = (text: string) => ({ embeddingRefs: [], text })

interface Fixture {
  appData: string
  checkpoint: { byteSize: number; path: string; sha256: string }
  deadlineSeconds: 600
  profile: typeof PROFILE
  provisionReport: string
  provisionReportSha256: string
  run: string
  schemaVersion: 1
  scratchBasePath: string
  workerManifest: Record<string, { bytes: number; sha256: string }>
}

export async function runQualification(fixturePath: string): Promise<unknown> {
  assert.equal(process.platform, 'linux')
  assert.equal(process.arch, 'x64')
  canonical(fixturePath)
  assert.ok(within(ARTIFACT_ROOT, fixturePath))
  const fixture = fixtureFrom(await boundedJson(fixturePath))
  await directory(fixture.run)
  await directory(fixture.appData)
  await directory(fixture.scratchBasePath)
  assert.equal((await lstat(fixture.scratchBasePath)).mode & 0o777, 0o700)
  assert.deepEqual(await readdir(fixture.scratchBasePath), [])
  const bounds = await assertUpgradeBounds({ maxRuntimeSeconds: fixture.deadlineSeconds })
  assert.equal((await execute('git', ['rev-parse', 'HEAD'], { cwd: ROOT })).stdout.trim(), BASE)
  assert.equal(await hashFile(fixture.provisionReport), fixture.provisionReportSha256)
  assert.equal((await lstat(fixture.checkpoint.path)).size, SOURCE_BYTES)
  assert.equal(await realpath(fixture.checkpoint.path), fixture.checkpoint.path)
  assert.equal(await hashFile(fixture.checkpoint.path), SOURCE_SHA)
  const runtimeRoots = await createRuntimeRoots(fixture.appData)
  const pointerBytes = await readFile(runtimeRoots.pointerFile)
  const pointer = JSON.parse(pointerBytes.toString('utf8')) as {
    pythonExecutable: string
    runtimeId: string
    schemaVersion: number
  }
  assert.deepEqual(Object.keys(pointer).sort(), ['pythonExecutable', 'runtimeId', 'schemaVersion'])
  assert.equal(pointer.schemaVersion, 1)
  assert.match(pointer.runtimeId, /^[a-z0-9][\w.-]{0,127}$/i)
  const environment = path.join(runtimeRoots.environmentsDir, pointer.runtimeId)
  const workerRoot = path.join(environment, 'lib/python3.12/site-packages/imagegen_worker')
  const ownedPython = path.join(runtimeRoots.pythonDir, `${pointer.runtimeId}-cpython-3.12.13`)
  await directory(workerRoot)
  await directory(ownedPython)
  assert.equal(pointer.pythonExecutable, path.join(environment, 'bin/python'))
  assert.ok(within(ownedPython, await realpath(pointer.pythonExecutable)))
  assert.deepEqual(await treeManifest(workerRoot), fixture.workerManifest)
  assert.deepEqual(
    await treeManifest(path.join(ROOT, 'worker-python/src/imagegen_worker')),
    fixture.workerManifest,
  )
  await assertRuntimeIdle(fixture.appData, ownedPython)
  const payloads = path.join(fixture.run, 'payloads')
  await mkdir(payloads, { mode: 0o700 })
  const data = path.join(payloads, 'data')
  await mkdir(data, { mode: 0o700 })
  const shadow = path.join(data, 'autosave')
  const database = openAppDatabase(data, path.join(ROOT, 'src/main/db/migrations'))
  const projectIndex = new ProjectIndexRepository(database.db)
  const projects = new ProjectService({
    autosaveOptions: { debounceMs: 60_000, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    dataRoot: data,
    repository: projectIndex,
    roots: {
      placeholdersDir: path.join(ROOT, 'src/main/projects/placeholders'),
      scratchDir: fixture.scratchBasePath,
    },
    shadow: new ProjectShadowStore(shadow),
  })
  let networkAttempts = 0
  const offline = async (): Promise<never> => {
    networkAttempts++
    throw new Error('This qualification cannot access the network.')
  }
  const tokens = new CivitaiTokenStore(
    {
      decryptStringAsync: async () => {
        throw new Error('No tokens in qualification.')
      },
      encryptStringAsync: async () => {
        throw new Error('No tokens in qualification.')
      },
      getSelectedStorageBackend: () => 'test-only-storage',
      isAsyncEncryptionAvailable: async () => false,
    },
    data,
  )
  const models = new ModelService(
    new ModelRepository(database.db),
    new CivitaiClient(offline),
    tokens,
  )
  const runtime = new RuntimeManager(runtimeRoots)
  const reportPath = path.join(fixture.run, 'installed-init-report.json')
  const report: Record<string, unknown> = {
    base: BASE,
    bounds,
    checkpoint: fixture.checkpoint,
    checks: [],
    fixtureSha256: await hashFile(fixturePath),
    gpuAllocatorFraction: 'Not configured by this installed Main boundary; capacity unqualified.',
    invokeRevision: 'a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd',
    nativeRequestCeiling: 2,
    profile: PROFILE,
    status: 'running',
    visualStatus: 'not-assessed',
  }
  const checks = report.checks as string[]
  const checkpoint = async () => await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  const checked = async (message: string) => {
    checks.push(message)
    await checkpoint()
  }
  let context: GenerationAppContext | undefined
  let processor: RegionalGenerationProcessor | undefined
  let projectId: string | undefined
  let nativeCalls = 0
  let caught: unknown
  try {
    const repository = new ModelRepository(database.db)
    const installed = await repository.publishVerifiedInstallation({
      primary: {
        file: {
          managedPath: fixture.checkpoint.path,
          originalFilename: 'Illustrious-XL-v0.1.safetensors',
          sha256: SOURCE_SHA,
          sizeBytes: SOURCE_BYTES,
          verifiedAt: new Date().toISOString(),
        },
        resource: {
          displayName: 'Illustrious XL v0.1 (official pinned epsilon)',
          source: { kind: 'civitai', modelId: 795_765 },
          sourceMetadata: { testOnlyCatalog: true },
          type: 'checkpoint',
        },
        version: {
          baseModelFamily: 'illustrious',
          format: 'safetensors',
          name: 'v0.1',
          source: {
            expectedSha256: SOURCE_SHA,
            fileId: 798_303,
            kind: 'civitai',
            versionId: 889_818,
          },
          sourceMetadata: {},
        },
      },
    })
    const reference = await models.resolveGenerationCheckpoint(
      installed.resourceId,
      installed.versionId,
    )
    assert.equal(reference.fileSha256, SOURCE_SHA)
    assert.equal(reference.predictionType, 'epsilon')
    const tab = await projects.create({
      height: 1024,
      title: 'Installed initialization control',
      width: 1024,
    })
    projectId = tab.id
    const id = tab.id
    const owner = () => {
      const value = projects.getOpenDocumentForAcceptance(id)
      assert.ok(value)
      return value
    }
    const initial = structuredClone(owner().document)
    const sources: Record<string, IgsAssetSource> = {}
    const regions: IgsRegionalGuidanceV1[] = REGIONAL.map((text, index) => {
      const maskId = randomUUID()
      const png = encodeProjectMaskPng(new Uint8Array(512 * 1024).fill(255), 512, 1024)
      const member = `assets/masks/${maskId}/${digest(png)}.png`
      sources[member] = { bytes: png }
      return {
        enabled: true,
        id: randomUUID(),
        locked: false,
        mask: {
          asset: { bytes: png.length, height: 1024, path: member, sha256: digest(png), width: 512 },
          bounds: { ...BBOX, width: 512, x: BBOX.x + index * 512 },
          id: maskId,
          revision: 1,
        },
        name: index ? 'Right character' : 'Left character',
        overlayOpacity: 0,
        prompts: { negative: prompt(''), positive: prompt(text), useGlobalNegativePrompt: false },
      }
    })
    await owner().applyDocument(
      parseProjectDocumentV1({
        ...initial,
        generationDraft: {
          cfgRescale: 0,
          loras: [],
          model: reference,
          negativePrompt: prompt(''),
          positivePrompt: prompt(GLOBAL),
          sampling: {
            cfgScale: 5,
            denoisingStrength: null,
            sampler: 'Euler a',
            scheduler: 'Normal',
            steps: 28,
          },
          seed: { policy: 'fixed', value: 123 },
          vae: null,
          vaePrecision: 'FP16',
        },
        primaryBbox: BBOX,
        regionalGuidance: regions,
      }),
      sources,
      {
        expectedDocumentEpoch: owner().documentEpoch,
        expectedDocumentRevision: owner().document.documentRevision,
      },
    )
    await projects.save(id)
    const packagePath = owner().filePath
    await projects.close(id)
    assert.equal((await projects.open(id)).kind, 'opened')
    await projects.flushAutosave(id)
    assert.equal(owner().filePath, packagePath)
    assert.equal(owner().dirty, false)
    const opened = await readIgsPackage(packagePath)
    assert.deepEqual(opened.project, owner().document)
    const authored = structuredClone(owner().document)
    const packageBefore = await hashFile(packagePath)
    const preparedCapture = await runtime.withGenerationPreparation(
      fixture.scratchBasePath,
      async (preparation) => {
        readyForInitialization(preparation.inferenceReady)
        return await projects.withCapturedCurrentCanvasRegionalGenerationInput(
          id,
          async (capture) => {
            capture.assertCurrent()
            assert.deepEqual(capture.document, authored)
            const target = await capture.composeTarget(preparation.targetWorker)
            assert.equal(target.mode, 'txt2img')
            const prepared = await prepareNormalTxt2Img({
              lastActualSeed: null,
              modelService: models,
              target,
            })
            assert.equal(classifyTargetPngAlpha(prepared.targetPngBytes, 1024, 1024), 'txt2img')
            assert.deepEqual(prepared.context.bbox, BBOX)
            assert.deepEqual(prepared.context.sampling.noiseProfile, NOISE)
            assert.equal(prepared.context.sampling.invokeScheduler, 'euler_a')
            const plan = planGenerationBatch({
              baseSeed: 123,
              iterations: 1,
              maxJobs: 1,
              maxPrompts: 1,
              negativePrompt: prepared.context.prompts.negative,
              positivePrompt: prepared.context.prompts.positive,
              seedBehavior: 'per-iteration',
            })
            assert.equal(plan.items.length, 1)
            const recipe = await prepareCurrentCanvasRegionalRecipe({
              capture: capture.regional,
              job: {
                bbox: prepared.context.bbox,
                documentId: prepared.context.documentId,
                documentRevision: prepared.context.documentRevision,
                family: 'illustrious',
                item: plan.items[0],
              },
              models,
            })
            assert.equal(recipe.regions.length, 2)
            assert.deepEqual(recipe.globalEmbeddings, { negative: [], positive: [] })
            for (const region of recipe.regions) {
              assert.deepEqual(region.embeddings, { negative: [], positive: [] })
              assert.equal(region.referenceImages?.length ?? 0, 0)
            }
            capture.assertCurrent()
            return { prepared, recipe }
          },
        )
      },
    )
    assert.ok(preparedCapture)
    const prepared: PreparedNormalTxt2Img = {
      context: structuredClone(preparedCapture.prepared.context),
      targetPngBytes: Buffer.from(preparedCapture.prepared.targetPngBytes),
    }
    const recipe: CurrentCanvasRegionalRecipe = structuredClone(preparedCapture.recipe)
    assert.deepEqual(owner().document, authored)
    assert.equal(await hashFile(packagePath), packageBefore)
    await assertRuntimeIdle(fixture.appData, ownedPython)
    await checked(
      'Fresh saved/reopened Main capture, installed target composition and exact ModelService preparation preserve authored state.',
    )
    const dependencies = {
      database,
      dataRoot: data,
      modelService: models,
      projectIndex,
      projectService: projects,
      scratchBasePath: fixture.scratchBasePath,
    }
    context = await createGenerationAppContext(dependencies)
    const first = context.requireRecoveredServices()
    const admission = await runtime.withGenerationAdmission(
      fixture.scratchBasePath,
      async (ready) => {
        readyForInitialization(ready)
        report.admissionReady = structuredClone(ready)
        return await withIllustriousTxt2ImgRequest({
          modelService: models,
          prepared,
          ready,
          scratchBasePath: fixture.scratchBasePath,
          use: async (request) => {
            const regional: Omit<RegionalWorkerInput, 'request'> = {
              globalNegativeCoverage: { kind: 'everywhere' },
              globalPositiveCoverage: { kind: 'everywhere' },
              initializationProfile: INITIALIZATION,
              layout: 'cfg-negative-first',
              negativePooledSourceId: 'current-canvas',
              positivePooledSourceId: 'current-canvas',
              recipe,
            }
            const queued = await first.queue.enqueueCurrentCanvasRegional({
              prepared,
              projectPath: packagePath,
              regional,
              request,
              stagingSessionId: randomUUID(),
            })
            return { originalTargetPath: request.job.target.path, queued }
          },
        })
      },
    )
    assert.ok(admission)
    await assert.rejects(readFile(admission.originalTargetPath), { code: 'ENOENT' })
    const original = await first.queue.loadVerifiedRegionalInput(admission.queued.id)
    assert.equal(original.input.initializationProfile, INITIALIZATION)
    assert.equal(original.payload.initializationProfile, INITIALIZATION)
    assert.equal(original.payload.kind, 'illustrious-regional')
    assert.equal(Object.hasOwn(original.input, 'compositionProfile'), false)
    const originalRow = await database.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .where('id', '=', admission.queued.id)
      .executeTakeFirstOrThrow()
    assert.equal((await first.queue.claimNextPendingRegional())?.item.id, admission.queued.id)
    const edit = structuredClone(owner().document)
    edit.generationDraft.positivePrompt.text = 'later authoring control'
    edit.generationDraft.seed = { policy: 'fixed', value: 124 }
    for (const region of edit.regionalGuidance ?? []) {
      region.enabled = false
    }
    await owner().applyDocument(
      parseProjectDocumentV1(edit),
      {},
      {
        expectedDocumentEpoch: owner().documentEpoch,
        expectedDocumentRevision: owner().document.documentRevision,
      },
    )
    await projects.save(id)
    const postEdit = structuredClone(owner().document)
    const postEditPackageHash = await hashFile(packagePath)
    context.shutdown()
    context = await createGenerationAppContext(dependencies)
    const recovered = context.requireRecoveredServices()
    const canceled = await recovered.queue.loadVerifiedRegionalInput(admission.queued.id)
    const canceledRow = await database.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .where('id', '=', admission.queued.id)
      .executeTakeFirstOrThrow()
    assert.equal(canceled.item.status, 'canceled')
    assert.equal(canceledRow.error_code, 'APP_RESTART')
    assert.equal(canceledRow.frozen_payload_json, originalRow.frozen_payload_json)
    assert.deepEqual(canceled.payload, original.payload)
    assert.equal(await recovered.staging.hasPublicationReceipt(admission.queued.id), false)
    const retried = await recovered.queue.retryCurrentCanvasRegionalTerminal(
      admission.queued.id,
      canceled.item.statusSequence,
    )
    const frozen = await recovered.queue.loadVerifiedRegionalInput(retried.id)
    assert.deepEqual(frozen.payload, original.payload)
    assert.equal(frozen.input.initializationProfile, INITIALIZATION)
    assert.equal(fingerprint(frozen.input.recipe), fingerprint(recipe))
    assert.notEqual(frozen.targetPath, original.targetPath)
    assert.ok((await readFile(frozen.targetPath)).equals(prepared.targetPngBytes))
    report.frozen = {
      after: frozen.payload,
      before: original.payload,
      recipeSha256: fingerprint(recipe),
      retryQueueItemId: retried.id,
      sourceQueueItemId: admission.queued.id,
      targetSha256: digest(prepared.targetPngBytes),
    }
    await checked(
      'Original Main bootstrap cancels the claimed row APP_RESTART; explicit Retry copies the unchanged private initialization despite later saved authoring.',
    )
    processor = new RegionalGenerationProcessor(recovered.queue, recovered.staging, models)
    const queuedProgress: GenerationDenoisingProgress[] = []
    const completion = await runtime.withGenerationWorker(
      fixture.scratchBasePath,
      async (client, qualified) => {
        readyForInitialization(client.ready)
        assert.equal(qualified.location.pythonExecutable, pointer.pythonExecutable)
        assert.equal(qualified.location.runtimeRoot, runtimeRoots.runtimeDir)
        report.nativeReady = structuredClone(client.ready)
        report.qualifiedInstalledWorker = qualified
        return await processor!.runOne({
          close: client.close.bind(client),
          executeCurrentCanvasRegional: async (input, onProgress) => {
            assert.equal(input.initializationProfile, INITIALIZATION)
            assert.equal(Object.hasOwn(input, 'compositionProfile'), false)
            assert.equal(fingerprint(input.recipe), fingerprint(recipe))
            assert.deepEqual(input.request.job.sampling, frozen.input.request.job.sampling)
            assert.ok(nativeCalls < 2)
            nativeCalls++
            return await client.executeCurrentCanvasRegional(input, (progress) => {
              queuedProgress.push(structuredClone(progress))
              onProgress?.(progress)
            })
          },
          ready: client.ready,
        })
      },
    )
    assert.ok(completion && completion.kind === 'completed')
    assert.equal(completion.queueItemId, retried.id)
    assert.equal(completion.candidate.actualSeed, 123)
    assert.equal(completion.candidate.frozenPayloadJson, originalRow.frozen_payload_json)
    const candidateBytes = await readFile(completion.candidate.assetPath)
    const candidateRgb = decodedRgb(candidateBytes)
    assert.equal(digest(candidateBytes), completion.candidate.image.sha256)
    assert.ok(await recovered.staging.hasPublicationReceipt(retried.id))
    assert.equal(
      (await recovered.staging.listVerifiedRegionalCandidates(retried.localProjectKey)).length,
      1,
    )
    assert.equal(
      (await recovered.staging.listVerifiedCandidates(retried.localProjectKey)).length,
      0,
    )
    exactProgress(queuedProgress)
    assert.deepEqual(owner().document, postEdit)
    assert.equal(await hashFile(packagePath), postEditPackageHash)
    await writeFile(path.join(payloads, 'retry.png'), candidateBytes, { flag: 'wx', mode: 0o600 })
    report.retry = {
      candidate: completion.candidate,
      pngSha256: digest(candidateBytes),
      progress: queuedProgress,
      rgbSha256: digest(candidateRgb),
    }
    await assertRuntimeIdle(fixture.appData, ownedPython)
    await checked(
      'Recovered frozen Retry consumes the real installed worker and publishes one private durable candidate with all 28 native progress steps.',
    )
    const directProgress: GenerationDenoisingProgress[] = []
    const directInput = structuredClone(frozen.input)
    directInput.request.requestId = randomUUID()
    const direct = await runtime.withGenerationWorker(
      fixture.scratchBasePath,
      async (client): Promise<RegionalWorkerResult> => {
        readyForInitialization(client.ready)
        assert.ok(nativeCalls < 2)
        nativeCalls++
        return await client.executeCurrentCanvasRegional(directInput, (progress) => {
          directProgress.push(structuredClone(progress))
        })
      },
    )
    assert.ok(direct)
    assert.equal(direct.seed, 123)
    exactProgress(directProgress)
    const directRgb = decodedRgb(direct.pngBytes)
    assert.ok(
      direct.pngBytes.equals(candidateBytes),
      'Whole PNG bytes must match the same installed private-input control.',
    )
    assert.ok(
      directRgb.equals(candidateRgb),
      'Every reopened RGB channel must match the same installed private-input control.',
    )
    assert.equal(direct.output.iccSha256, IGS_SRGB_ICC_SHA256)
    await writeFile(path.join(payloads, 'control.png'), direct.pngBytes, {
      flag: 'wx',
      mode: 0o600,
    })
    report.control = {
      everyRgbByteEqual: true,
      output: direct.output,
      pngSha256: digest(direct.pngBytes),
      progress: directProgress,
      rgbSha256: digest(directRgb),
      seed: direct.seed,
      wholePngEqual: true,
    }
    assert.equal(nativeCalls, 2)
    assert.deepEqual(owner().document, postEdit)
    assert.equal(await hashFile(packagePath), postEditPackageHash)
    assert.deepEqual(await readFile(runtimeRoots.pointerFile), pointerBytes)
    assert.deepEqual(await treeManifest(workerRoot), fixture.workerManifest)
    assert.equal(networkAttempts, 0)
    assert.equal(
      (await database.db.selectFrom('generation_queue_item').select('id').execute()).length,
      2,
    )
    assert.equal(
      (
        await database.db
          .selectFrom('generation_candidate_receipt')
          .select('candidate_id')
          .execute()
      ).length,
      1,
    )
    await checked(
      'Second identical installed request matches whole PNG and every independent decoded RGB byte; authored Project, runtime pointer and worker payload remain exact.',
    )
    report.status = 'passed'
    report.limits = [
      'Main service/default installed worker qualification, not Electron renderer or IPC.',
      'Recovery was exercised before native dispatch, not an in-flight GPU/Main crash.',
      'No raw-noise/native initialization observation or fresh trained-weight census.',
      'No prior Invoke-composition PNG comparison, visual judgment, public/default or Anima promotion.',
    ]
  } catch (error) {
    caught = error
    report.status = 'failed'
    report.error = String(error instanceof Error ? (error.stack ?? error.message) : error).slice(
      0,
      16 * 1024,
    )
  } finally {
    report.nativeCalls = nativeCalls
    const cleanupErrors: string[] = []
    try {
      await processor?.stopAndCancelActive()
    } catch (error) {
      cleanupErrors.push(String(error))
    }
    context?.shutdown()
    runtime.preventNewGenerationWork()
    try {
      assert.equal(await runtime.retryUnconfirmedGenerationExit(), true)
    } catch (error) {
      cleanupErrors.push(String(error))
    }
    try {
      report.finalIdle = await assertRuntimeIdle(fixture.appData, ownedPython)
    } catch (error) {
      cleanupErrors.push(String(error))
    }
    try {
      if (projectId) {
        await projects.close(projectId)
      }
    } catch (error) {
      cleanupErrors.push(String(error))
    }
    try {
      await database.close()
    } catch (error) {
      cleanupErrors.push(String(error))
    }
    report.cleanupErrors = cleanupErrors
    if (cleanupErrors.length) {
      report.status = 'failed'
      caught ??= new Error('Qualification shutdown did not confirm every owned boundary.')
    }
    await checkpoint()
  }
  if (caught) {
    throw caught
  }
  return report
}

export function fingerprint(value: unknown): string {
  return digest(JSON.stringify(captured(value)))
}

function within(root: string, file: string): boolean {
  const relative = path.relative(root, file)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function canonical(file: unknown): asserts file is string {
  assert.ok(typeof file === 'string' && path.isAbsolute(file) && path.resolve(file) === file)
  assert.ok(!file.includes('\0') && file.length <= 4096)
}

async function directory(file: string): Promise<void> {
  canonical(file)
  const entry = await lstat(file)
  assert.ok(entry.isDirectory() && !entry.isSymbolicLink())
  assert.equal(await realpath(file), file)
  assert.equal(entry.uid, process.getuid!())
}

async function boundedJson(file: string, maximum = 64 * 1024): Promise<unknown> {
  canonical(file)
  const entry = await lstat(file)
  assert.ok(entry.isFile() && !entry.isSymbolicLink() && entry.size <= maximum)
  assert.equal(await realpath(file), file)
  return JSON.parse(await readFile(file, 'utf8')) as unknown
}

async function hashFile(file: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(file, { highWaterMark: 2 * 1024 ** 2 })) {
    hash.update(bytes)
  }
  return hash.digest('hex')
}

function captured(value: unknown): unknown {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { bytes: value.byteLength, sha256: digest(value) }
  }
  if (Array.isArray(value)) {
    return value.map(captured)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, captured(child)]),
    )
  }
  return value
}

function fixtureFrom(value: unknown): Fixture {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value))
  const fixture = value as Fixture
  assert.deepEqual(Object.keys(fixture).sort(), [
    'appData',
    'checkpoint',
    'deadlineSeconds',
    'profile',
    'provisionReport',
    'provisionReportSha256',
    'run',
    'schemaVersion',
    'scratchBasePath',
    'workerManifest',
  ])
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.profile, PROFILE)
  assert.equal(fixture.deadlineSeconds, 600)
  for (const file of [
    fixture.run,
    fixture.appData,
    fixture.scratchBasePath,
    fixture.provisionReport,
  ]) {
    canonical(file)
    assert.ok(within(ARTIFACT_ROOT, file))
  }
  assert.ok(within(fixture.appData, fixture.scratchBasePath))
  assert.ok(!within(fixture.run, fixture.appData) && !within(fixture.appData, fixture.run))
  assert.match(fixture.provisionReportSha256, /^[a-f0-9]{64}$/)
  assert.deepEqual(Object.keys(fixture.checkpoint).sort(), ['byteSize', 'path', 'sha256'])
  canonical(fixture.checkpoint.path)
  assert.ok(within(ARTIFACT_ROOT, fixture.checkpoint.path))
  assert.equal(fixture.checkpoint.sha256, SOURCE_SHA)
  assert.equal(fixture.checkpoint.byteSize, SOURCE_BYTES)
  assert.ok(fixture.workerManifest && typeof fixture.workerManifest === 'object')
  const entries = Object.entries(fixture.workerManifest)
  assert.ok(entries.length >= 60 && entries.length <= 128)
  let total = 0
  for (const [name, entry] of entries) {
    assert.ok(!path.isAbsolute(name) && path.normalize(name) === name && !name.startsWith('..'))
    assert.ok(!name.includes('\0') && !name.endsWith('.pyc'))
    assert.deepEqual(Object.keys(entry).sort(), ['bytes', 'sha256'])
    assert.ok(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0 && entry.bytes <= 4 * 1024 ** 2)
    assert.match(entry.sha256, /^[a-f0-9]{64}$/)
    total += entry.bytes
  }
  assert.ok(total <= 32 * 1024 ** 2)
  return structuredClone(fixture)
}

function readyForInitialization(ready: InferenceWorkerReady): void {
  assert.ok(isQualifiedInferenceWorkerReady(ready))
  assert.ok(supportsInferenceRegionalInvokeInitialization(ready))
  assert.ok(ready.capabilities.includes('private-current-canvas-regional-v1'))
  assert.ok(ready.capabilities.includes('illustrious-regional-progress-v1'))
}

function exactProgress(progress: readonly GenerationDenoisingProgress[]): void {
  assert.deepEqual(
    progress,
    Array.from({ length: 28 }, (_, index) => ({ step: index + 1, totalSteps: 28 })),
  )
}

/** Independent bounded PNG reconstruction, including CRC, RGB8 and pinned ICC. */
function decodedRgb(bytes: Buffer): Buffer {
  assert.ok(bytes.length >= 45 && bytes.length <= 32 * 1024 ** 2)
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  const compressed: Buffer[] = []
  let offset = 8
  let ended = false
  let icc = 0
  for (let count = 0; offset < bytes.length; count++) {
    assert.ok(count < 4096 && offset + 12 <= bytes.length)
    const length = bytes.readUInt32BE(offset)
    const end = offset + length + 12
    assert.ok(end <= bytes.length)
    const tag = bytes.toString('ascii', offset + 4, offset + 8)
    const body = bytes.subarray(offset + 8, end - 4)
    assert.equal(crc32(bytes.subarray(offset + 4, end - 4)), bytes.readUInt32BE(end - 4))
    switch (tag) {
      case 'iCCP': {
        icc++
        const zero = body.indexOf(0)
        assert.ok(zero > 0 && zero <= 79 && body[zero + 1] === 0)
        assert.equal(
          digest(inflateSync(body.subarray(zero + 2), { maxOutputLength: 1024 * 1024 })),
          IGS_SRGB_ICC_SHA256,
        )
        break
      }
      case 'IDAT': {
        compressed.push(body)
        break
      }
      case 'IEND': {
        assert.equal(length, 0)
        assert.equal(end, bytes.length)
        ended = true
        break
      }
      case 'IHDR': {
        assert.equal(count, 0)
        assert.equal(length, 13)
        assert.equal(body.readUInt32BE(0), 1024)
        assert.equal(body.readUInt32BE(4), 1024)
        assert.deepEqual([...body.subarray(8)], [8, 2, 0, 0, 0])
        break
      }
    }
    if (ended) {
      break
    }
    offset = end
  }
  assert.ok(ended && compressed.length > 0 && icc === 1)
  const stride = 1024 * 3
  const filtered = inflateSync(Buffer.concat(compressed), {
    maxOutputLength: (stride + 1) * 1024,
  })
  assert.equal(filtered.length, (stride + 1) * 1024)
  const rgb = Buffer.alloc(stride * 1024)
  const paeth = (left: number, up: number, diagonal: number) => {
    const estimate = left + up - diagonal
    const a = Math.abs(estimate - left)
    const b = Math.abs(estimate - up)
    const c = Math.abs(estimate - diagonal)
    return a <= b && a <= c ? left : b <= c ? up : diagonal
  }
  for (let y = 0; y < 1024; y++) {
    const filter = filtered[y * (stride + 1)]
    assert.ok(filter <= 4)
    for (let x = 0; x < stride; x++) {
      const left = x >= 3 ? rgb[y * stride + x - 3] : 0
      const up = y ? rgb[(y - 1) * stride + x] : 0
      const diagonal = y && x >= 3 ? rgb[(y - 1) * stride + x - 3] : 0
      rgb[y * stride + x] =
        (filtered[y * (stride + 1) + x + 1] +
          [0, left, up, Math.floor((left + up) / 2), paeth(left, up, diagonal)][filter]) &
        255
    }
  }
  return rgb
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try {
    const args = process.argv.slice(2)
    assert.ok(args.length === 2 && args[0] === '--fixture')
    const report = await runQualification(args[1])
    process.stdout.write(`${JSON.stringify(report)}\n`)
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    )
    process.exitCode = 1
  }
}
