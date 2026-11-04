/**
 * ROOT-only, import-safe Main producer for the preregistered red/blue-haired character scene. This
 * adapts existing Main owners; it adds no inference, queue, admission or publication policy.
 * InvokeAI basis: a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd, addRegionalGuidance.ts and its
 * compileCanvasGraph.ts caller. Their existing conditioning association is consumed unchanged. ROOT
 * owns execution, the installed derivatives/inference workers, supervision and cleanup. A completed
 * mechanical report leaves visual and human acceptance pending.
 */
import { IGS_SRGB_ICC_SHA256 } from '../../../shared/projects/color-profile.js'
import { planGenerationBatch } from '../../../shared/projects/generation-batch-plan.js'
import {
  type IgsProjectDocumentV1,
  type IgsRectV1,
  type IgsRegionalGuidanceV1,
  parseProjectDocumentV1,
} from '../../../shared/projects/project-schema.js'
import type { GenerationPrompt } from '../../../shared/projects/prompt-embeddings.js'

import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { openAppDatabase } from '../../db/database.js'
import { CivitaiClient } from '../../models/civitai-client.js'
import { CivitaiTokenStore } from '../../models/civitai-token-store.js'
import { ModelRepository } from '../../models/model-repository.js'
import { ModelService } from '../../models/model-service.js'
import { type IgsAssetSource, readIgsPackage } from '../igs-package.js'
import { ProjectAutosaveLeaseRegistry } from '../project-autosave.js'
import {
  type CurrentCanvasRegionalRecipe,
  prepareCurrentCanvasRegionalRecipe,
} from '../project-current-canvas-regional-recipe.js'
import {
  type PreparedNormalTxt2Img,
  prepareNormalTxt2Img,
} from '../project-generation-preparation.js'
import { ProjectIndexRepository } from '../project-index.js'
import { encodeProjectMaskPng } from '../project-mask.js'
import { ProjectService } from '../project-service.js'
import { ProjectShadowStore } from '../project-shadow.js'
import { classifyTargetPngAlpha, decodeTargetPngAlpha } from '../target-png-mode.js'
import { ProjectWorkerClient } from '../worker-client.js'

const REPO = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/\/$/, '')
const RUN =
  '/home/user/.codex/artifacts/imagegen-studio/runs/regional-guidance-character-visual/20261104-red-blue'
const SOURCE =
  '/home/user/.codex/artifacts/imagegen-studio/shared/illustrious-epsilon-source-20261026/Illustrious-XL-v0.1.safetensors'
const SOURCE_SHA256 = '3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9'
const SOURCE_BYTES = 6_938_040_760
const CONTRACT_SHA256 = 'aaa2c64d59e6e1ab5f90e4e739d3a556a9ff346efb1d0b3f6aafd6e3a625d733'
const GLOBAL =
  'anime illustration of two women standing apart side by side, waist-up, simple clothing, plain light gray background, coherent daylight'
const RED = 'one woman with long red hair'
const BLUE = 'one woman with long blue hair'
const BBOX: IgsRectV1 = { height: 1024, width: 1024, x: -13, y: 5 }
const SEEDS = [123, 124] as const
const CONDITIONS = ['baseline', 'assignment', 'swapped'] as const
const LABELS = [
  'seed123-baseline',
  'seed123-assignment',
  'seed123-swapped',
  'seed124-baseline',
  'seed124-assignment',
  'seed124-swapped',
  'seed123-assignment-repeat',
] as const
const NOISE = {
  baseSchedule: 'sdxl-scaled-linear-v1',
  rescaleBetasZeroSnr: false,
  schemaVersion: 1,
  timestepSpacing: 'leading',
} as const

export type CharacterVisualCondition = (typeof CONDITIONS)[number]
export type CharacterVisualLabel = (typeof LABELS)[number]
export interface CharacterVisualProbeUseCase {
  condition: CharacterVisualCondition
  label: CharacterVisualLabel
  models: ModelService
  prepared: PreparedNormalTxt2Img
  recipe: CurrentCanvasRegionalRecipe
  seed: (typeof SEEDS)[number]
}
export interface CharacterVisualProbeOptions<T> {
  pythonExecutable: string
  run: string
  runtimeRoot: string
  source: string
  useCase: (input: CharacterVisualProbeUseCase) => Promise<T>
}
export interface CharacterVisualFile {
  byteSize: number
  path: string
  sha256: string
}
export interface CharacterVisualCase<T> {
  capture: 'owned-assignment123-repeat' | 'saved-reopened-current-canvas'
  condition: CharacterVisualCondition
  handoff: CharacterVisualFile
  label: CharacterVisualLabel
  package: CharacterVisualFile
  result: T
  seed: (typeof SEEDS)[number]
  target: CharacterVisualFile
}
export interface CharacterVisualManifest<T> {
  cases: Record<CharacterVisualLabel, CharacterVisualCase<T>>
  contractSha256: string
  nativeRequestCeiling: 7
  orderedCaseLabels: readonly CharacterVisualLabel[]
  profile: 'main-character-visual-v1'
  schemaVersion: 1
  source: CharacterVisualFile
  visualAcceptance: 'pending'
}
type ResolvedCheckpoint = Awaited<
  ReturnType<ModelService['resolveVerifiedGenerationCheckpointForPlan']>
>

const sha = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const prompt = (text: string): GenerationPrompt => ({ embeddingRefs: [], text })

/** Recurse before JSON.stringify so Buffer.toJSON cannot discard the lossless byte marker. */
function transport(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value))
    return value
  }
  if (value === undefined) {
    return undefined
  }
  assert.equal(typeof value, 'object', 'Handoffs/results must be JSON-compatible')
  const object = value
  assert.equal(ancestors.has(object), false, 'Handoffs/results must not contain cycles')
  if (Buffer.isBuffer(value)) {
    return { $buffer_b64: value.toString('base64') }
  }
  if (value instanceof Uint8Array) {
    return { $alpha8_b64: Buffer.from(value).toString('base64') }
  }
  ancestors.add(object)
  try {
    if (Array.isArray(value)) {
      return value.map((item) => transport(item, ancestors))
    }
    assert.ok(
      Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null,
    )
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, transport(item, ancestors)]),
    )
  } finally {
    ancestors.delete(object)
  }
}

const serialized = (value: unknown): string => `${JSON.stringify(transport(value), null, 2)}\n`
const clonePrepared = (prepared: PreparedNormalTxt2Img): PreparedNormalTxt2Img => ({
  ...structuredClone(prepared),
  targetPngBytes: Buffer.from(prepared.targetPngBytes),
})

async function directory(directoryPath: string): Promise<void> {
  const stat = await lstat(directoryPath)
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), directoryPath)
  assert.equal(await realpath(directoryPath), directoryPath)
}

async function freshDirectory(directoryPath: string): Promise<void> {
  await directory(path.dirname(directoryPath))
  await mkdir(directoryPath, { mode: 0o700 })
  await directory(directoryPath)
}

async function writeOwned(filePath: string, bytes: Buffer): Promise<CharacterVisualFile> {
  await directory(path.dirname(filePath))
  await writeFile(filePath, bytes, { flag: 'wx', mode: 0o600 })
  const actual = await readFile(filePath)
  assert.ok(actual.equals(bytes))
  return { byteSize: bytes.length, path: filePath, sha256: sha(bytes) }
}

const writeJson = (filePath: string, value: unknown): Promise<CharacterVisualFile> =>
  writeOwned(filePath, Buffer.from(serialized(value)))

/**
 * Six fresh Save/reopen/capture handoffs, then one exact owned assignment123 replay. No model or
 * environment copies are created. Runtime execution occurs only when ROOT calls this.
 */
export async function produceCharacterVisualProbe<T>(
  options: CharacterVisualProbeOptions<T>,
): Promise<CharacterVisualManifest<T>> {
  assert.deepEqual(Object.keys(options).sort(), [
    'pythonExecutable',
    'run',
    'runtimeRoot',
    'source',
    'useCase',
  ])
  assert.equal(options.run, RUN)
  assert.equal(options.source, SOURCE)
  assert.equal(typeof options.useCase, 'function')
  assert.ok(path.isAbsolute(options.pythonExecutable) && path.isAbsolute(options.runtimeRoot))
  await directory(RUN)
  const contractBytes = await readFile(path.join(RUN, 'experiment-contract.json'))
  assert.equal(sha(contractBytes), CONTRACT_SHA256)
  const contract = JSON.parse(contractBytes.toString('utf8')) as Record<string, unknown>
  assert.equal(contract.schema, 'regional-character-visual-experiment-v1')
  assert.equal(contract.base, 'cf0171be3e8261d5b1f17252cc47d770142b6a07')
  assert.equal(contract.profile, 'regional-character-visual-v1')
  assert.equal(contract.fixedBeforeNativeExecution, true)
  assert.equal(contract.globalPositive, GLOBAL)
  assert.equal(contract.globalNegative, '')
  assert.equal(contract.leftPositive, RED)
  assert.equal(contract.rightPositive, BLUE)
  assert.deepEqual(contract.bbox, BBOX)
  assert.deepEqual(contract.seeds, SEEDS)
  assert.deepEqual(contract.conditions, CONDITIONS)
  assert.deepEqual(contract.caseLabels, LABELS)
  assert.equal(contract.nativeRequestCeiling, 7)
  assert.equal(contract.noResources, true)
  assert.equal(contract.compositionProfile, 'invoke-canvas-v1')
  const sourceStat = await lstat(SOURCE)
  assert.ok(sourceStat.isFile() && !sourceStat.isSymbolicLink())
  assert.equal(await realpath(SOURCE), SOURCE)
  assert.equal(sourceStat.size, SOURCE_BYTES)
  const sourceHash = createHash('sha256')
  for await (const chunk of createReadStream(SOURCE, { highWaterMark: 2 * 1024 * 1024 })) {
    sourceHash.update(chunk)
  }
  assert.equal(sourceHash.digest('hex'), SOURCE_SHA256)
  // ROOT has inventoried the run and created only this parent. Refuse reusing producer output.
  await directory(path.join(RUN, 'payloads'))
  const data = path.join(RUN, 'payloads', 'main')
  await freshDirectory(data)
  const scratch = path.join(data, 'scratch')
  const shadowRoot = path.join(data, 'autosave')
  await freshDirectory(scratch)
  for (const name of ['handoffs', 'packages', 'targets']) {
    await freshDirectory(path.join(RUN, name))
  }
  const database = openAppDatabase(data, path.join(REPO, 'src/main/db/migrations'))
  const service = new ProjectService({
    autosaveOptions: { debounceMs: 60_000, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    dataRoot: data,
    repository: new ProjectIndexRepository(database.db),
    roots: {
      placeholdersDir: path.join(REPO, 'src/main/projects/placeholders'),
      scratchDir: scratch,
    },
    shadow: new ProjectShadowStore(shadowRoot),
  })
  const repository = new ModelRepository(database.db)
  let networkAttempts = 0
  const offline = async (): Promise<never> => {
    networkAttempts++
    throw new Error('The character visual producer cannot access the network')
  }
  const tokenStore = new CivitaiTokenStore(
    {
      decryptStringAsync: async () => {
        throw new Error('The character visual producer cannot read tokens')
      },
      encryptStringAsync: async () => {
        throw new Error('The character visual producer cannot write tokens')
      },
      getSelectedStorageBackend: () => 'test-only-storage',
      isAsyncEncryptionAvailable: async () => false,
    },
    data,
  )
  const models = new ModelService(repository, new CivitaiClient(offline), tokenStore)
  const cases: Partial<Record<CharacterVisualLabel, CharacterVisualCase<T>>> = {}
  let worker: ProjectWorkerClient | undefined
  let repeat:
    | {
        authoredDocument: IgsProjectDocumentV1
        package: CharacterVisualFile
        prepared: PreparedNormalTxt2Img
        recipe: CurrentCanvasRegionalRecipe
        resolved: ResolvedCheckpoint
        target: CharacterVisualFile
      }
    | undefined
  let callbacks = 0
  try {
    const installed = await repository.publishVerifiedInstallation({
      primary: {
        file: {
          managedPath: SOURCE,
          originalFilename: 'Illustrious-XL-v0.1.safetensors',
          sha256: SOURCE_SHA256,
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
            expectedSha256: SOURCE_SHA256,
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
    assert.equal(reference.fileSha256, SOURCE_SHA256)
    assert.equal(reference.predictionType, 'epsilon')
    assert.equal(reference.baseModelFamily, 'illustrious')
    const tab = await service.create({
      height: 1024,
      title: 'Two characters: red and blue hair',
      width: 1024,
    })
    const id = tab.id
    const co = () => {
      const coordinator = service.getOpenDocumentForAcceptance(id)
      assert.ok(coordinator)
      return coordinator
    }
    const packagePath = co().filePath
    assert.ok(packagePath.startsWith(`${data}${path.sep}`))
    const initial = structuredClone(co().document)
    assert.deepEqual(initial.layers, [])
    const sources: Record<string, IgsAssetSource> = {}
    const regions: IgsRegionalGuidanceV1[] = [RED, BLUE].map((text, index) => {
      const maskId = randomUUID()
      const png = encodeProjectMaskPng(new Uint8Array(512 * 1024).fill(255), 512, 1024)
      const member = `assets/masks/${maskId}/${sha(png)}.png`
      sources[member] = { bytes: png }
      return {
        enabled: true,
        id: randomUUID(),
        locked: false,
        mask: {
          asset: { bytes: png.length, height: 1024, path: member, sha256: sha(png), width: 512 },
          bounds: { ...BBOX, width: 512, x: BBOX.x + index * 512 },
          id: maskId,
          revision: 1,
        },
        name: index === 0 ? 'Left character' : 'Right character',
        overlayOpacity: 0,
        prompts: { negative: prompt(''), positive: prompt(text), useGlobalNegativePrompt: false },
      }
    })
    assert.equal(new Set(regions.flatMap((region) => [region.id, region.mask.id])).size, 4)
    const template = parseProjectDocumentV1({
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
          sampler: 'Euler',
          scheduler: 'Normal',
          steps: 30,
        },
        seed: { policy: 'fixed', value: 123 },
        vae: null,
        vaePrecision: 'FP16',
      },
      primaryBbox: BBOX,
      regionalGuidance: regions,
    })
    async function state() {
      const coordinator = co()
      const schema = (
        await sql<{ name: string; sql: string | null; tbl_name: string; type: string }>`
        select type, name, tbl_name, sql from sqlite_master order by type,name`.execute(database.db)
      ).rows
      const tables: Record<string, Record<string, unknown>[]> = {}
      for (const entry of schema.filter((row) => row.type === 'table')) {
        tables[entry.name] = (
          await sql<Record<string, unknown>>`select * from ${sql.table(entry.name)}`.execute(
            database.db,
          )
        ).rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
        if (
          /queue|acceptance|accepted|seed_cursor|staging|install_job|install_artifact/.test(
            entry.name,
          )
        ) {
          assert.equal(tables[entry.name].length, 0, entry.name)
        }
      }
      const reopened = await readIgsPackage(coordinator.filePath)
      assert.deepEqual(reopened.project, coordinator.document)
      const members: Record<string, string> = {}
      for (const member of reopened.manifest.members) {
        const bytes = await reopened.readMember(member.path)
        assert.equal(bytes.length, member.bytes)
        assert.equal(sha(bytes), member.sha256)
        members[member.path] = sha(bytes)
      }
      return {
        dirty: coordinator.dirty,
        document: structuredClone(coordinator.document),
        epoch: coordinator.documentEpoch,
        history: {
          canRedo: coordinator.canRedo,
          canUndo: coordinator.canUndo,
          epoch: Reflect.get(coordinator, 'historyEpoch') as unknown,
          future: structuredClone(Reflect.get(coordinator, 'future')) as unknown,
          group: structuredClone(Reflect.get(coordinator, 'historyGroup')) as unknown,
          past: structuredClone(Reflect.get(coordinator, 'past')) as unknown,
        },
        members,
        packageHash: sha(await readFile(coordinator.filePath)),
        packageManifest: reopened.manifest,
        seed: {
          draft: structuredClone(coordinator.document.generationDraft.seed),
          lastActual: coordinator.document.lastActualSeedSnapshot,
        },
        shadow: await tree(shadowRoot),
        sql: { schema, tables },
        tab: service.getOpenTabs().find((open) => open.id === id),
      }
    }

    for (const seed of SEEDS) {
      for (const condition of CONDITIONS) {
        const label: CharacterVisualLabel = `seed${seed}-${condition}`
        const desired = structuredClone(template)
        desired.documentRevision = co().document.documentRevision
        desired.generationDraft.seed = { policy: 'fixed', value: seed }
        for (const [index, region] of desired.regionalGuidance!.entries()) {
          region.enabled = condition !== 'baseline'
          region.prompts!.positive!.text = (condition === 'swapped' ? [BLUE, RED] : [RED, BLUE])[
            index
          ]!
        }
        await co().applyDocument(parseProjectDocumentV1(desired), sources, {
          expectedDocumentEpoch: co().documentEpoch,
          expectedDocumentRevision: co().document.documentRevision,
        })
        await service.save(id)
        await service.close(id)
        assert.equal((await service.open(id)).kind, 'opened')
        await service.flushAutosave(id)
        assert.equal(co().filePath, packagePath)
        assert.equal(co().dirty, false)
        assert.deepEqual(semantics(co().document), semantics(desired))
        assert.equal(co().document.lastActualSeedSnapshot, initial.lastActualSeedSnapshot)
        const before = await state()
        const authoredDocument = structuredClone(co().document)
        const retainedPackage = await writeOwned(
          path.join(RUN, 'packages', `${label}.igs`),
          await readFile(packagePath),
        )
        await service.withCapturedCurrentCanvasRegionalGenerationInput(id, async (capture) => {
          capture.assertCurrent()
          assert.deepEqual(capture.document, authoredDocument)
          // The installed runtime must be physically idle before the caller starts inference.
          // Keep this Main capture alive, but release its CPU derivatives child after composition.
          worker = await ProjectWorkerClient.start(
            {
              pythonExecutable: options.pythonExecutable,
              runtimeRoot: options.runtimeRoot,
              stagingBasePath: scratch,
            },
            { environment: { LANG: 'C.UTF-8', PYTHONDONTWRITEBYTECODE: '1', TMPDIR: scratch } },
          )
          const target = await capture.composeTarget(worker)
          await worker.close()
          worker = undefined
          assert.equal(ProjectWorkerClient.hasUnconfirmedExit(), false)
          assert.equal(target.mode, 'txt2img')
          const prepared = await prepareNormalTxt2Img({
            lastActualSeed: null,
            modelService: models,
            target,
          })
          const resolved = await models.resolveVerifiedGenerationCheckpointForPlan(
            authoredDocument.generationDraft.model!,
          )
          assert.deepEqual(resolved, {
            managedPath: prepared.context.model.managedPath,
            noiseProfile: prepared.context.sampling.noiseProfile,
            reference: prepared.context.model.reference,
          })
          const plan = planGenerationBatch({
            baseSeed: prepared.context.sampling.seed,
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
          assertRecipe(recipe, prepared, authoredDocument, condition, seed)
          capture.assertCurrent()
          const ownedRecipe = structuredClone(recipe)
          const ownedPrepared = clonePrepared(prepared)
          const retainedTarget = await writeOwned(
            path.join(RUN, 'targets', `${label}.png`),
            ownedPrepared.targetPngBytes,
          )
          const beforeUse = await state()
          assert.deepEqual(beforeUse, before)
          const handoff = await writeJson(path.join(RUN, 'handoffs', `${label}.json`), {
            authoredDocument,
            capture: 'saved-reopened-current-canvas',
            checkpoint: { byteSize: SOURCE_BYTES, resolved, sha256: SOURCE_SHA256 },
            condition,
            contractSha256: CONTRACT_SHA256,
            label,
            package: retainedPackage,
            prepared: ownedPrepared,
            recipe: ownedRecipe,
            seed,
            stateBefore: beforeUse,
            target: retainedTarget,
          })
          const inputHash = sha(serialized({ prepared: ownedPrepared, recipe: ownedRecipe }))
          if (label === 'seed123-assignment') {
            repeat = {
              authoredDocument: structuredClone(authoredDocument),
              package: { ...retainedPackage },
              prepared: clonePrepared(ownedPrepared),
              recipe: structuredClone(ownedRecipe),
              resolved: structuredClone(resolved),
              target: { ...retainedTarget },
            }
          }
          assert.ok(callbacks < 7)
          callbacks++
          const result = await options.useCase({
            condition,
            label,
            models,
            prepared: ownedPrepared,
            recipe: ownedRecipe,
            seed,
          })
          serialized(result)
          assert.equal(sha(serialized({ prepared: ownedPrepared, recipe: ownedRecipe })), inputHash)
          capture.assertCurrent()
          assert.deepEqual(await state(), beforeUse)
          cases[label] = {
            capture: 'saved-reopened-current-canvas',
            condition,
            handoff,
            label,
            package: retainedPackage,
            result,
            seed,
            target: retainedTarget,
          }
          await writeJson(path.join(RUN, 'handoffs', `${label}-result.json`), cases[label])
        })
        assert.deepEqual(await state(), before)
      }
    }
    assert.ok(repeat)
    assert.equal(callbacks, 6)
    const label = 'seed123-assignment-repeat'
    const ownedRecipe = structuredClone(repeat.recipe)
    const ownedPrepared = clonePrepared(repeat.prepared)
    assertRecipe(ownedRecipe, ownedPrepared, repeat.authoredDocument, 'assignment', 123)
    const inputHash = sha(serialized({ prepared: ownedPrepared, recipe: ownedRecipe }))
    assert.equal(inputHash, sha(serialized({ prepared: repeat.prepared, recipe: repeat.recipe })))
    const beforeRepeat = await state()
    const handoff = await writeJson(path.join(RUN, 'handoffs', `${label}.json`), {
      authoredDocument: repeat.authoredDocument,
      capture: 'owned-assignment123-repeat',
      checkpoint: { byteSize: SOURCE_BYTES, resolved: repeat.resolved, sha256: SOURCE_SHA256 },
      condition: 'assignment',
      contractSha256: CONTRACT_SHA256,
      label,
      originalHandoff: cases['seed123-assignment']!.handoff,
      package: repeat.package,
      prepared: ownedPrepared,
      recipe: ownedRecipe,
      seed: 123,
      stateBefore: beforeRepeat,
      target: repeat.target,
    })
    callbacks++
    const result = await options.useCase({
      condition: 'assignment',
      label,
      models,
      prepared: ownedPrepared,
      recipe: ownedRecipe,
      seed: 123,
    })
    serialized(result)
    assert.equal(sha(serialized({ prepared: ownedPrepared, recipe: ownedRecipe })), inputHash)
    assert.deepEqual(await state(), beforeRepeat)
    cases[label] = {
      capture: 'owned-assignment123-repeat',
      condition: 'assignment',
      handoff,
      label,
      package: repeat.package,
      result,
      seed: 123,
      target: repeat.target,
    }
    await writeJson(path.join(RUN, 'handoffs', `${label}-result.json`), cases[label])
    assert.equal(callbacks, 7)
    assert.equal(networkAttempts, 0)
    assert.deepEqual(Object.keys(cases), LABELS)
    const manifest: CharacterVisualManifest<T> = {
      cases: cases as Record<CharacterVisualLabel, CharacterVisualCase<T>>,
      contractSha256: CONTRACT_SHA256,
      nativeRequestCeiling: 7,
      orderedCaseLabels: LABELS,
      profile: 'main-character-visual-v1',
      schemaVersion: 1,
      source: { byteSize: SOURCE_BYTES, path: SOURCE, sha256: SOURCE_SHA256 },
      visualAcceptance: 'pending',
    }
    await writeJson(path.join(RUN, 'main-character-visual.json'), manifest)
    return manifest
  } finally {
    // Preserve all payloads on failure. ROOT separately proves physical exit before any cleanup.
    try {
      if (worker) {
        await worker.close()
      }
    } finally {
      try {
        for (const tab of service.getOpenTabs()) {
          await service.close(tab.id)
        }
      } finally {
        await database.close()
      }
    }
  }
}

async function tree(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  let total = 0
  async function visit(current: string): Promise<void> {
    let names: string[]
    try {
      names = (await readdir(current)).sort()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return
      }
      throw error
    }
    for (const name of names) {
      assert.ok(Object.keys(result).length < 1024)
      const member = path.join(current, name)
      const stat = await lstat(member)
      assert.equal(stat.isSymbolicLink(), false)
      if (stat.isDirectory()) {
        result[`${path.relative(root, member)}/`] = 'directory'
        await visit(member)
      } else {
        assert.ok(stat.isFile())
        total += stat.size
        assert.ok(total <= 32 * 1024 * 1024)
        result[path.relative(root, member)] = sha(await readFile(member))
      }
    }
  }
  await visit(root)
  return result
}

function semantics(document: IgsProjectDocumentV1): unknown {
  const { documentRevision: _revision, ...content } = structuredClone(document)
  return content
}

function assertRecipe(
  recipe: CurrentCanvasRegionalRecipe,
  prepared: PreparedNormalTxt2Img,
  authored: IgsProjectDocumentV1,
  condition: CharacterVisualCondition,
  seed: (typeof SEEDS)[number],
): void {
  assert.equal(recipe.family, 'illustrious')
  assert.equal(recipe.documentId, authored.documentId)
  assert.equal(recipe.documentRevision, authored.documentRevision)
  assert.deepEqual(recipe.bbox, BBOX)
  assert.equal(recipe.item.seed, seed)
  assert.deepEqual(recipe.globalPrompts, { negative: prompt(''), positive: prompt(GLOBAL) })
  assert.deepEqual(recipe.globalEmbeddings, { negative: [], positive: [] })
  assert.equal(recipe.regions.length, condition === 'baseline' ? 0 : 2)
  for (const [index, region] of recipe.regions.entries()) {
    const owner = authored.regionalGuidance![index]
    assert.equal(region.regionId, owner.id)
    assert.equal(region.maskId, owner.mask.id)
    assert.equal(region.maskRevision, 1)
    assert.deepEqual(region.positive, owner.prompts!.positive)
    assert.deepEqual(region.negative, { prompt: prompt(''), source: 'regional' })
    assert.deepEqual(region.embeddings, { negative: [], positive: [] })
    assert.equal(region.referenceImages?.length ?? 0, 0)
    assert.equal(region.coverage.kind, 'covered')
    assert.deepEqual(region.coverage.bounds, BBOX)
    const alpha = region.coverage.alpha
    assert.ok(alpha instanceof Uint8Array)
    assert.equal(alpha.length, 1024 * 1024)
    for (let offset = 0; offset < alpha.length; offset++) {
      assert.equal(alpha[offset], (offset % 1024 < 512 ? 0 : 1) === index ? 255 : 0)
    }
  }
  const context = prepared.context
  assert.equal(context.kind, 'normal-txt2img-preparation')
  assert.equal(context.documentId, recipe.documentId)
  assert.equal(context.documentRevision, recipe.documentRevision)
  assert.deepEqual(context.bbox, BBOX)
  assert.deepEqual(context.prompts, { negative: '', positive: GLOBAL })
  assert.equal(context.model.managedPath, SOURCE)
  assert.equal(context.model.reference.fileSha256, SOURCE_SHA256)
  assert.equal(context.model.reference.predictionType, 'epsilon')
  assert.equal(context.vae, null)
  assert.equal(context.vaePrecision, 'FP16')
  assert.equal(context.loras?.length ?? 0, 0)
  assert.equal(context.loraStack?.length ?? 0, 0)
  assert.deepEqual(context.embeddings, { negative: [], positive: [] })
  assert.equal(context.sampling.seed, seed)
  assert.equal(context.sampling.steps, 30)
  assert.equal(context.sampling.cfgScale, 5)
  assert.equal(context.sampling.cfgRescale, 0)
  assert.equal(context.sampling.sampler, 'Euler')
  assert.equal(context.sampling.scheduler, 'Normal')
  assert.equal(context.sampling.invokeScheduler, 'euler')
  assert.deepEqual(context.sampling.noiseProfile, NOISE)
  assert.equal(context.target.iccSha256, IGS_SRGB_ICC_SHA256)
  assert.equal(context.target.sha256, sha(prepared.targetPngBytes))
  assert.equal(context.target.byteSize, prepared.targetPngBytes.length)
  assert.equal(classifyTargetPngAlpha(prepared.targetPngBytes, 1024, 1024), 'txt2img')
  assert.ok(decodeTargetPngAlpha(prepared.targetPngBytes, 1024, 1024).every((byte) => byte === 0))
}
