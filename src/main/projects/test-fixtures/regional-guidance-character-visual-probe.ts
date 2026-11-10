/**
 * ROOT-only, import-safe Main producer for fixed character-scene experiments. This adapts existing
 * Main owners; it adds no inference, queue, admission or publication policy. InvokeAI basis:
 * a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd, addRegionalGuidance.ts and its compileCanvasGraph.ts
 * caller. Their existing conditioning association is consumed unchanged. ROOT owns execution, the
 * installed derivatives/inference workers, supervision and cleanup. A completed mechanical report
 * leaves visual and human acceptance pending. The additive ordinary count-tag profile uses InvokeAI
 * a61ac4fb's graph.ts ordinary SDXL path: identical literal text reaches prompt/style and the
 * original text_encoder/compel.py consumer. Its fixed prompt is experimental content, not an
 * InvokeAI or model-author successful recipe.
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
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { VerifiedRegionalReferenceResources } from '../../runtime/inference-auxiliary-resources.js'
import type { RegionalWorkerInput } from '../regional-worker-request.js'

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
import { captureCurrentCanvasRegionalReferences } from '../project-current-canvas-regional-references.js'
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
const RUN = path.join(
  os.homedir(),
  '.codex/artifacts/imagegen-studio/runs/regional-guidance-character-visual/20261104-red-blue',
)
const SOURCE = path.join(
  os.homedir(),
  '.codex/artifacts/imagegen-studio/shared/illustrious-epsilon-source-20261026/Illustrious-XL-v0.1.safetensors',
)
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
const ORDINARY_LABELS = ['seed123-baseline', 'seed124-baseline', 'seed123-baseline-repeat'] as const
const LEGACY_SPEC = {
  base: 'cf0171be3e8261d5b1f17252cc47d770142b6a07',
  caseLabels: LABELS,
  conditions: CONDITIONS,
  contractProfile: 'regional-character-visual-v1',
  contractSchema: 'regional-character-visual-experiment-v1',
  contractSha256: CONTRACT_SHA256,
  globalPositive: GLOBAL,
  manifestName: 'main-character-visual.json',
  nativeRequestCeiling: 7,
  repeatCapture: 'owned-assignment123-repeat',
  repeatCondition: 'assignment',
  repeatLabel: 'seed123-assignment-repeat',
  repeatSourceLabel: 'seed123-assignment',
  run: RUN,
} as const
const ORDINARY_SPEC = {
  base: '474aa1bc17a2637a85b94e9749f9e798af36a3fc',
  caseLabels: ORDINARY_LABELS,
  conditions: ['baseline'],
  contractProfile: 'ordinary-two-character-tags-v1',
  contractSchema: 'ordinary-two-character-tags-experiment-v1',
  contractSha256: '12512a2ca955cce7326471cdc66001a74781eb2d511a4858ceb5c50a327e41a9',
  globalPositive: `2girls, ${GLOBAL}`,
  manifestName: 'main-ordinary-two-character-tags.json',
  nativeRequestCeiling: 3,
  repeatCapture: 'owned-baseline123-repeat',
  repeatCondition: 'baseline',
  repeatLabel: 'seed123-baseline-repeat',
  repeatSourceLabel: 'seed123-baseline',
  run: path.join(
    os.homedir(),
    '.codex/artifacts/imagegen-studio/runs/illustrious-ordinary-character/20261105-count-tag',
  ),
} as const
const TAGGED_REGIONAL_LABELS = [
  'seed123-assignment',
  'seed123-swapped',
  'seed124-assignment',
  'seed124-swapped',
] as const
const TAGGED_REGIONAL_SPEC = {
  base: '9befdf893b382d9bdc880b9b6bd29613acc8559b',
  caseLabels: TAGGED_REGIONAL_LABELS,
  conditions: ['assignment', 'swapped'],
  contractProfile: 'regional-two-character-tags-v1',
  contractSchema: 'regional-two-character-tags-experiment-v1',
  contractSha256: 'a016a617f39362568aa122ab06aab5a25c1a3adad7341bc875b8be78c4fa990e',
  globalPositive: `2girls, ${GLOBAL}`,
  manifestName: 'main-regional-two-character-tags.json',
  nativeRequestCeiling: 4,
  run: path.join(
    os.homedir(),
    '.codex/artifacts/imagegen-studio/runs/regional-guidance-tagged-visual/20261105-red-blue',
  ),
} as const
const REGIONAL_PROMPT_TAGS_SPEC = {
  ...TAGGED_REGIONAL_SPEC,
  base: '51396c51cc7051bdfe83b6cd528bb40280e3f310',
  contractProfile: 'regional-prompt-tags-v1',
  contractSchema: 'regional-prompt-tags-experiment-v1',
  contractSha256: '2012779e26e304aa22440de7d2d13ff4b4c812c04bc2ed03404a977c65cf51ef',
  manifestName: 'main-regional-prompt-tags.json',
  regionalTexts: ['1girl, long hair, red hair', '1girl, long hair, blue hair'],
  run: path.join(
    os.homedir(),
    '.codex/artifacts/imagegen-studio/runs/regional-guidance-regional-tags/20261105-red-blue',
  ),
} as const

const ANCESTRAL_LABELS = [
  'seed123-baseline',
  'seed123-assignment',
  'seed123-swapped',
  'seed124-baseline',
  'seed124-assignment',
  'seed124-swapped',
] as const
const ANCESTRAL_SPEC = {
  ...REGIONAL_PROMPT_TAGS_SPEC,
  base: '6500046b7136324ebdc6d622b7d73ffc7379d7df',
  caseLabels: ANCESTRAL_LABELS,
  conditions: CONDITIONS,
  contractProfile: 'regional-euler-ancestral-v1',
  contractSchema: 'regional-euler-ancestral-experiment-v1',
  contractSha256: 'a9af03b7349041046bca3e28ad77bc529f063ca2709795d17dcda35936d96efb',
  manifestName: 'main-regional-euler-ancestral.json',
  nativeRequestCeiling: 6,
  run: path.join(
    os.homedir(),
    '.codex/artifacts/imagegen-studio/runs/regional-guidance-euler-ancestral/20261105-red-blue',
  ),
} as const
const DPM_2M_SPEC = {
  ...ANCESTRAL_SPEC,
  base: '25d2338462d2a38d6719ebecff41e3697f82a9ce',
  contractProfile: 'regional-dpmpp-2m-karras-v1',
  contractSchema: 'regional-dpmpp-2m-experiment-v1',
  contractSha256: '61b46004c99a7e0664d5706731ac14478be11222dd71811a5dc7a3dac587d073',
  manifestName: 'main-regional-dpmpp-2m-karras.json',
  run: path.join(
    os.homedir(),
    '.codex/artifacts/imagegen-studio/runs/regional-guidance-dpmpp-2m/20261106-normal-karras/visual',
  ),
} as const

export type CharacterVisualCondition = (typeof CONDITIONS)[number]
export type CharacterVisualLabel = (typeof LABELS)[number]
export type OrdinaryCharacterCalibrationLabel = (typeof ORDINARY_LABELS)[number]
export type RegionalCharacterTagsLabel = (typeof TAGGED_REGIONAL_LABELS)[number]
export type CharacterVisualProbeLabel = CharacterVisualLabel | OrdinaryCharacterCalibrationLabel
export interface CharacterVisualProbeUseCase {
  condition: CharacterVisualCondition
  label: CharacterVisualProbeLabel
  models: ModelService
  prepared: PreparedNormalTxt2Img
  recipe: CurrentCanvasRegionalRecipe
  seed: (typeof SEEDS)[number]
}
export interface CharacterVisualProbeOptions<T> {
  profile?: never
  pythonExecutable: string
  run: string
  runtimeRoot: string
  source: string
  useCase: (input: CharacterVisualProbeUseCase) => Promise<T>
}
export interface OrdinaryCharacterCalibrationProbeOptions<T> extends Omit<
  CharacterVisualProbeOptions<T>,
  'profile'
> {
  profile: 'ordinary-two-character-tags-v1'
}
export interface RegionalCharacterTagsProbeOptions<T> extends Omit<
  CharacterVisualProbeOptions<T>,
  'profile'
> {
  profile: 'regional-two-character-tags-v1'
}
export interface RegionalPromptTagsProbeOptions<T> extends Omit<
  CharacterVisualProbeOptions<T>,
  'profile'
> {
  profile: 'regional-prompt-tags-v1'
}
export interface RegionalAncestralProbeOptions<T> extends Omit<
  CharacterVisualProbeOptions<T>,
  'profile'
> {
  profile: 'regional-euler-ancestral-v1'
}
export interface RegionalDpmpp2mProbeOptions<T> extends Omit<
  CharacterVisualProbeOptions<T>,
  'profile'
> {
  profile: 'regional-dpmpp-2m-karras-v1'
}
export interface RegionalAncestralManifest<T> extends Omit<
  CharacterVisualManifest<T>,
  'cases' | 'nativeRequestCeiling' | 'orderedCaseLabels' | 'profile'
> {
  cases: Record<
    (typeof ANCESTRAL_LABELS)[number],
    Omit<CharacterVisualCase<T>, 'capture'> & { capture: 'saved-reopened-current-canvas' }
  >
  nativeRequestCeiling: 6
  orderedCaseLabels: typeof ANCESTRAL_LABELS
  profile: 'main-regional-euler-ancestral-v1'
}
export interface RegionalDpmpp2mManifest<T> extends Omit<RegionalAncestralManifest<T>, 'profile'> {
  profile: 'main-regional-dpmpp-2m-karras-v1'
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
export interface OrdinaryCharacterCalibrationCase<T> extends Omit<
  CharacterVisualCase<T>,
  'capture' | 'condition' | 'label'
> {
  capture: 'owned-baseline123-repeat' | 'saved-reopened-current-canvas'
  condition: 'baseline'
  label: OrdinaryCharacterCalibrationLabel
}
export interface OrdinaryCharacterCalibrationManifest<T> extends Omit<
  CharacterVisualManifest<T>,
  'cases' | 'nativeRequestCeiling' | 'orderedCaseLabels' | 'profile'
> {
  cases: Record<OrdinaryCharacterCalibrationLabel, OrdinaryCharacterCalibrationCase<T>>
  nativeRequestCeiling: 3
  orderedCaseLabels: readonly OrdinaryCharacterCalibrationLabel[]
  profile: 'main-ordinary-two-character-tags-v1'
}
export interface RegionalCharacterTagsCase<T> extends Omit<
  CharacterVisualCase<T>,
  'capture' | 'condition' | 'label'
> {
  capture: 'saved-reopened-current-canvas'
  condition: 'assignment' | 'swapped'
  label: RegionalCharacterTagsLabel
}
export interface RegionalCharacterTagsManifest<T> extends Omit<
  CharacterVisualManifest<T>,
  'cases' | 'nativeRequestCeiling' | 'orderedCaseLabels' | 'profile'
> {
  cases: Record<RegionalCharacterTagsLabel, RegionalCharacterTagsCase<T>>
  nativeRequestCeiling: 4
  orderedCaseLabels: readonly RegionalCharacterTagsLabel[]
  profile: 'main-regional-two-character-tags-v1'
}
export interface RegionalPromptTagsManifest<T> extends Omit<
  RegionalCharacterTagsManifest<T>,
  'profile'
> {
  profile: 'main-regional-prompt-tags-v1'
}
type ProbeCase<T> = Omit<CharacterVisualCase<T>, 'capture' | 'label'> & {
  capture: 'owned-baseline123-repeat' | CharacterVisualCase<T>['capture']
  label: CharacterVisualProbeLabel
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
 * The omitted profile keeps six fresh handoffs and the owned assignment123 replay. The fixed
 * ordinary profile makes two fresh baseline handoffs and the owned baseline123 replay instead. The
 * tagged regional profiles make four fresh assignment/swapped handoffs without a repeat. The
 * regional-prompt-tag profile changes only its two fixed regional positive texts. All use the same
 * Main owners; runtime execution occurs only when ROOT calls this. The fixed ancestral profile
 * authors six fresh baseline/assignment/swapped handoffs with Euler a/28; no repeat or prompt
 * change. The additive DPM++ 2M/Karras profile retains that six-case scene at28 steps without a
 * repeat.
 */
export function produceCharacterVisualProbe<T>(
  options: CharacterVisualProbeOptions<T>,
): Promise<CharacterVisualManifest<T>>
export function produceCharacterVisualProbe<T>(
  options: OrdinaryCharacterCalibrationProbeOptions<T>,
): Promise<OrdinaryCharacterCalibrationManifest<T>>
export function produceCharacterVisualProbe<T>(
  options: RegionalCharacterTagsProbeOptions<T>,
): Promise<RegionalCharacterTagsManifest<T>>
export function produceCharacterVisualProbe<T>(
  options: RegionalPromptTagsProbeOptions<T>,
): Promise<RegionalPromptTagsManifest<T>>
export function produceCharacterVisualProbe<T>(
  options: RegionalAncestralProbeOptions<T>,
): Promise<RegionalAncestralManifest<T>>
export function produceCharacterVisualProbe<T>(
  options: RegionalDpmpp2mProbeOptions<T>,
): Promise<RegionalDpmpp2mManifest<T>>
export async function produceCharacterVisualProbe<T>(
  options:
    | CharacterVisualProbeOptions<T>
    | OrdinaryCharacterCalibrationProbeOptions<T>
    | RegionalAncestralProbeOptions<T>
    | RegionalCharacterTagsProbeOptions<T>
    | RegionalDpmpp2mProbeOptions<T>
    | RegionalPromptTagsProbeOptions<T>,
): Promise<
  | CharacterVisualManifest<T>
  | OrdinaryCharacterCalibrationManifest<T>
  | RegionalAncestralManifest<T>
  | RegionalCharacterTagsManifest<T>
  | RegionalDpmpp2mManifest<T>
  | RegionalPromptTagsManifest<T>
> {
  const ancestral = options.profile === 'regional-euler-ancestral-v1'
  const dpmpp2m = options.profile === 'regional-dpmpp-2m-karras-v1'
  const ordinary = options.profile === 'ordinary-two-character-tags-v1'
  const taggedRegional = options.profile === 'regional-two-character-tags-v1'
  const regionalPromptTags = options.profile === 'regional-prompt-tags-v1'
  const regional = taggedRegional || regionalPromptTags || ancestral || dpmpp2m
  const optionKeys = ['pythonExecutable', 'run', 'runtimeRoot', 'source', 'useCase']
  if (ordinary || regional) {
    optionKeys.push('profile')
    optionKeys.sort()
  }
  assert.deepEqual(Object.keys(options).sort(), optionKeys)
  assert.ok(options.profile === undefined || ordinary || regional)
  const spec = dpmpp2m
    ? DPM_2M_SPEC
    : ancestral
      ? ANCESTRAL_SPEC
      : regionalPromptTags
        ? REGIONAL_PROMPT_TAGS_SPEC
        : taggedRegional
          ? TAGGED_REGIONAL_SPEC
          : ordinary
            ? ORDINARY_SPEC
            : LEGACY_SPEC
  const repeatSpec = regional ? undefined : ordinary ? ORDINARY_SPEC : LEGACY_SPEC
  const regionalTexts = 'regionalTexts' in spec ? spec.regionalTexts : [RED, BLUE]
  const sampling = dpmpp2m
    ? {
        sampler: 'DPM++ 2M' as const,
        scheduler: 'Karras' as const,
        steps: 28,
        workerScheduler: 'dpmpp_2m_k' as const,
      }
    : {
        sampler: ancestral ? ('Euler a' as const) : ('Euler' as const),
        steps: ancestral ? 28 : 30,
        workerScheduler: ancestral ? ('euler_a' as const) : ('euler' as const),
      }
  const run = spec.run
  assert.equal(options.run, run)
  assert.equal(options.source, SOURCE)
  assert.equal(typeof options.useCase, 'function')
  assert.ok(path.isAbsolute(options.pythonExecutable) && path.isAbsolute(options.runtimeRoot))
  await directory(run)
  const contractBytes = await readFile(path.join(run, 'experiment-contract.json'))
  assert.equal(sha(contractBytes), spec.contractSha256)
  const contract = JSON.parse(contractBytes.toString('utf8')) as Record<string, unknown>
  assert.equal(contract.schema, spec.contractSchema)
  assert.equal(contract.base, spec.base)
  assert.equal(contract.profile, spec.contractProfile)
  assert.equal(contract.fixedBeforeNativeExecution, true)
  assert.equal(contract.globalPositive, spec.globalPositive)
  assert.equal(contract.globalNegative, '')
  assert.equal(contract.leftPositive, regionalTexts[0])
  assert.equal(contract.rightPositive, regionalTexts[1])
  assert.deepEqual(contract.bbox, BBOX)
  assert.deepEqual(contract.seeds, SEEDS)
  assert.deepEqual(contract.conditions, spec.conditions)
  assert.deepEqual(contract.caseLabels, spec.caseLabels)
  assert.equal(contract.nativeRequestCeiling, spec.nativeRequestCeiling)
  assert.equal(contract.noResources, true)
  assert.equal(contract.compositionProfile, 'invoke-canvas-v1')
  if (dpmpp2m) {
    assert.equal(contract.initializationProfile, 'invoke-cpu-f32-add-noise-v1')
    assert.deepEqual(contract.comparators, [])
  }
  if (ordinary || regional) {
    assert.deepEqual(contract.sampling, {
      cfgRescale: 0,
      cfgScale: 5,
      noiseProfile: NOISE,
      sampler: sampling.sampler,
      scheduler: dpmpp2m ? 'Karras' : 'Normal',
      steps: sampling.steps,
      workerScheduler: sampling.workerScheduler,
    })
    assert.equal(contract.vaePrecision, 'FP16')
  }
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
  await directory(path.join(run, 'payloads'))
  const data = path.join(run, 'payloads', 'main')
  await freshDirectory(data)
  const scratch = path.join(data, 'scratch')
  const shadowRoot = path.join(data, 'autosave')
  await freshDirectory(scratch)
  for (const name of ['handoffs', 'packages', 'targets']) {
    await freshDirectory(path.join(run, name))
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
  const cases: Partial<Record<CharacterVisualProbeLabel, ProbeCase<T>>> = {}
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
    const regions: IgsRegionalGuidanceV1[] = regionalTexts.map((text, index) => {
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
        positivePrompt: prompt(spec.globalPositive),
        sampling: {
          cfgScale: 5,
          denoisingStrength: null,
          sampler: sampling.sampler,
          scheduler: dpmpp2m ? 'Karras' : 'Normal',
          steps: sampling.steps,
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
      for (const condition of spec.conditions) {
        const label: CharacterVisualLabel = `seed${seed}-${condition}`
        const desired = structuredClone(template)
        desired.documentRevision = co().document.documentRevision
        desired.generationDraft.seed = { policy: 'fixed', value: seed }
        for (const [index, region] of desired.regionalGuidance!.entries()) {
          region.enabled = condition !== 'baseline'
          region.prompts!.positive!.text = (
            condition === 'swapped' ? [regionalTexts[1], regionalTexts[0]] : regionalTexts
          )[index]!
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
          path.join(run, 'packages', `${label}.igs`),
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
          assertRecipe(
            recipe,
            prepared,
            authoredDocument,
            condition,
            seed,
            spec.globalPositive,
            ordinary,
            sampling,
          )
          capture.assertCurrent()
          const ownedRecipe = structuredClone(recipe)
          const ownedPrepared = clonePrepared(prepared)
          const retainedTarget = await writeOwned(
            path.join(run, 'targets', `${label}.png`),
            ownedPrepared.targetPngBytes,
          )
          const beforeUse = await state()
          assert.deepEqual(beforeUse, before)
          const handoff = await writeJson(path.join(run, 'handoffs', `${label}.json`), {
            authoredDocument,
            capture: 'saved-reopened-current-canvas',
            checkpoint: { byteSize: SOURCE_BYTES, resolved, sha256: SOURCE_SHA256 },
            condition,
            contractSha256: spec.contractSha256,
            label,
            package: retainedPackage,
            prepared: ownedPrepared,
            recipe: ownedRecipe,
            seed,
            stateBefore: beforeUse,
            target: retainedTarget,
          })
          const inputHash = sha(serialized({ prepared: ownedPrepared, recipe: ownedRecipe }))
          if (repeatSpec && label === repeatSpec.repeatSourceLabel) {
            repeat = {
              authoredDocument: structuredClone(authoredDocument),
              package: { ...retainedPackage },
              prepared: clonePrepared(ownedPrepared),
              recipe: structuredClone(ownedRecipe),
              resolved: structuredClone(resolved),
              target: { ...retainedTarget },
            }
          }
          assert.ok(callbacks < spec.nativeRequestCeiling)
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
          await writeJson(path.join(run, 'handoffs', `${label}-result.json`), cases[label])
        })
        assert.deepEqual(await state(), before)
      }
    }
    if (repeatSpec) {
      assert.ok(repeat)
      assert.equal(callbacks, spec.nativeRequestCeiling - 1)
      const label = repeatSpec.repeatLabel
      const ownedRecipe = structuredClone(repeat.recipe)
      const ownedPrepared = clonePrepared(repeat.prepared)
      assertRecipe(
        ownedRecipe,
        ownedPrepared,
        repeat.authoredDocument,
        repeatSpec.repeatCondition,
        123,
        spec.globalPositive,
        ordinary,
      )
      const inputHash = sha(serialized({ prepared: ownedPrepared, recipe: ownedRecipe }))
      assert.equal(inputHash, sha(serialized({ prepared: repeat.prepared, recipe: repeat.recipe })))
      const beforeRepeat = await state()
      const handoff = await writeJson(path.join(run, 'handoffs', `${label}.json`), {
        authoredDocument: repeat.authoredDocument,
        capture: repeatSpec.repeatCapture,
        checkpoint: { byteSize: SOURCE_BYTES, resolved: repeat.resolved, sha256: SOURCE_SHA256 },
        condition: repeatSpec.repeatCondition,
        contractSha256: spec.contractSha256,
        label,
        originalHandoff: cases[repeatSpec.repeatSourceLabel]!.handoff,
        package: repeat.package,
        prepared: ownedPrepared,
        recipe: ownedRecipe,
        seed: 123,
        stateBefore: beforeRepeat,
        target: repeat.target,
      })
      callbacks++
      const result = await options.useCase({
        condition: repeatSpec.repeatCondition,
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
        capture: repeatSpec.repeatCapture,
        condition: repeatSpec.repeatCondition,
        handoff,
        label,
        package: repeat.package,
        result,
        seed: 123,
        target: repeat.target,
      }
      await writeJson(path.join(run, 'handoffs', `${label}-result.json`), cases[label])
    } else {
      assert.equal(repeat, undefined)
    }
    assert.equal(callbacks, spec.nativeRequestCeiling)
    assert.equal(networkAttempts, 0)
    assert.deepEqual(Object.keys(cases), spec.caseLabels)
    const commonManifest = {
      contractSha256: spec.contractSha256,
      schemaVersion: 1 as const,
      source: { byteSize: SOURCE_BYTES, path: SOURCE, sha256: SOURCE_SHA256 },
      visualAcceptance: 'pending' as const,
    }
    const manifest:
      | CharacterVisualManifest<T>
      | OrdinaryCharacterCalibrationManifest<T>
      | RegionalAncestralManifest<T>
      | RegionalCharacterTagsManifest<T>
      | RegionalDpmpp2mManifest<T>
      | RegionalPromptTagsManifest<T> = dpmpp2m
      ? {
          ...commonManifest,
          cases: cases as RegionalDpmpp2mManifest<T>['cases'],
          nativeRequestCeiling: 6,
          orderedCaseLabels: ANCESTRAL_LABELS,
          profile: 'main-regional-dpmpp-2m-karras-v1',
        }
      : ancestral
        ? {
            ...commonManifest,
            cases: cases as RegionalAncestralManifest<T>['cases'],
            nativeRequestCeiling: 6,
            orderedCaseLabels: ANCESTRAL_LABELS,
            profile: 'main-regional-euler-ancestral-v1',
          }
        : regional
          ? {
              ...commonManifest,
              cases: cases as Record<RegionalCharacterTagsLabel, RegionalCharacterTagsCase<T>>,
              nativeRequestCeiling: 4,
              orderedCaseLabels: TAGGED_REGIONAL_LABELS,
              profile: regionalPromptTags
                ? 'main-regional-prompt-tags-v1'
                : 'main-regional-two-character-tags-v1',
            }
          : ordinary
            ? {
                ...commonManifest,
                cases: cases as Record<
                  OrdinaryCharacterCalibrationLabel,
                  OrdinaryCharacterCalibrationCase<T>
                >,
                nativeRequestCeiling: 3,
                orderedCaseLabels: ORDINARY_LABELS,
                profile: 'main-ordinary-two-character-tags-v1',
              }
            : {
                ...commonManifest,
                cases: cases as Record<CharacterVisualLabel, CharacterVisualCase<T>>,
                nativeRequestCeiling: 7,
                orderedCaseLabels: LABELS,
                profile: 'main-character-visual-v1',
              }
    await writeJson(path.join(run, spec.manifestName), manifest)
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

export const REFERENCE_UTILITY_RUN = path.join(
  os.homedir(),
  '.codex/artifacts/imagegen-studio/runs/regional-reference-utility/20261111-fixed-cat',
)
export const REFERENCE_UTILITY_CASES = [
  { image: null, label: 'seed123-baseline', outside: false, seed: 123 },
  { image: 'A', label: 'seed123-reference-A', outside: false, seed: 123 },
  { image: 'B', label: 'seed123-reference-B', outside: false, seed: 123 },
  { image: null, label: 'seed124-baseline', outside: false, seed: 124 },
  { image: 'A', label: 'seed124-reference-A', outside: false, seed: 124 },
  { image: 'B', label: 'seed124-reference-B', outside: false, seed: 124 },
  { image: 'A', label: 'seed123-zero-A', outside: true, seed: 123 },
  { image: 'B', label: 'seed123-zero-B', outside: true, seed: 123 },
] as const
export const REFERENCE_UTILITY_CONTRACT = {
  base: 'a39bff4fa5c45154175fa412f77f147afa7683d8',
  bbox: { height: 512, width: 512, x: -13, y: 5 },
  cases: REFERENCE_UTILITY_CASES,
  fixedBeforeNativeExecution: true,
  globalNegative: '',
  globalPositive:
    'a simple illustration of one cat head, front view, two pointed ears, two eyes, plain light background',
  invokeRevision: '4875d96531ca6712b288f6e660fcbb34143408c1',
  nativeRequestCeiling: 8,
  profile: 'reference-utility-v1',
  referenceImages: {
    A: {
      byteSize: 4803,
      sha256: '2631b04caf604bb2529b49344687cde663caca012b88d6a740692ecf52dee6ed',
    },
    B: {
      byteSize: 4804,
      sha256: 'cc188e8e2fe80a3f820cc8710c7b0f649a2c02eb6260a29e490d19c010c1cf65',
    },
  },
  sampling: {
    cfgRescale: 0,
    cfgScale: 5,
    noiseProfile: NOISE,
    sampler: 'Euler',
    scheduler: 'Normal',
    steps: 30,
  },
  schema: 'reference-utility-experiment-v1',
  schemaVersion: 1,
  scope:
    'Direct installed backend, one image-only Regional owner; no UI/queue, spatial association, maximum capacity or human acceptance claim.',
  vaePrecision: 'FP16',
} as const
export type ReferenceUtilityCase = (typeof REFERENCE_UTILITY_CASES)[number]
export interface ReferenceUtilityUseCase {
  case: ReferenceUtilityCase
  models: ModelService
  prepared: PreparedNormalTxt2Img
  recipe: CurrentCanvasRegionalRecipe
  references?: NonNullable<RegionalWorkerInput['references']>
}

/**
 * Additive fixed reference experiment. Invoke4875 prepareCanvasInvocation→addRegionalGuidance keeps
 * image-only owners separate from text; sd/denoise_latents.py prepares their original images before
 * UNet acquisition. These existing Main services/capture owners produce the input; ROOT's callback
 * alone executes inference. No ordinary recipe is manufactured by stripping refs.
 */
export async function produceReferenceUtilityProbe<T>(options: {
  pythonExecutable: string
  referenceImages: Record<'A' | 'B', CharacterVisualFile>
  resources: VerifiedRegionalReferenceResources
  run: string
  runtimeRoot: string
  useCase: (input: ReferenceUtilityUseCase) => Promise<T>
}): Promise<unknown> {
  assert.equal(options.run, REFERENCE_UTILITY_RUN)
  const bbox = REFERENCE_UTILITY_CONTRACT.bbox
  const run = options.run
  await directory(run)
  await directory(path.join(run, 'payloads'))
  const data = path.join(run, 'payloads', 'reference-main')
  await freshDirectory(data)
  const scratch = path.join(data, 'scratch')
  await freshDirectory(scratch)
  for (const name of ['reference-packages', 'reference-targets', 'reference-handoffs']) {
    await freshDirectory(path.join(run, name))
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
    shadow: new ProjectShadowStore(path.join(data, 'autosave')),
  })
  const repository = new ModelRepository(database.db)
  let networkAttempts = 0
  const offline = async (): Promise<never> => {
    networkAttempts++
    throw new Error('Reference visual probe is offline')
  }
  const tokens = new CivitaiTokenStore(
    {
      decryptStringAsync: async () => {
        throw new Error('No token read in visual probe')
      },
      encryptStringAsync: async () => {
        throw new Error('No token write in visual probe')
      },
      getSelectedStorageBackend: () => 'test-only-storage',
      isAsyncEncryptionAvailable: async () => false,
    },
    data,
  )
  const models = new ModelService(repository, new CivitaiClient(offline), tokens)
  let worker: ProjectWorkerClient | undefined
  const cases: unknown[] = []
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
    const model = await models.resolveGenerationCheckpoint(
      installed.resourceId,
      installed.versionId,
    )
    assert.equal(model.fileSha256, SOURCE_SHA256)
    assert.equal(model.predictionType, 'epsilon')
    const tab = await service.create({
      height: 512,
      title: 'Fixed cat reference utility',
      width: 512,
    })
    const co = () => {
      const value = service.getOpenDocumentForAcceptance(tab.id)
      assert.ok(value)
      return value
    }
    const initial = structuredClone(co().document)
    const maskId = randomUUID()
    const regionId = randomUUID()
    const bytes = encodeProjectMaskPng(new Uint8Array(512 * 512).fill(255), 512, 512)
    const member = `assets/masks/${maskId}/${sha(bytes)}.png`
    const sources: Record<string, IgsAssetSource> = { [member]: { bytes } }
    for (const testCase of REFERENCE_UTILITY_CASES) {
      const owner: IgsRegionalGuidanceV1 = {
        enabled: true,
        id: regionId,
        locked: false,
        mask: {
          asset: { bytes: bytes.length, height: 512, path: member, sha256: sha(bytes), width: 512 },
          bounds: { ...bbox, x: testCase.outside ? bbox.x + bbox.width + 8 : bbox.x },
          id: maskId,
          revision: testCase.outside ? 2 : 1,
        },
        name: 'Cat reference owner',
        overlayOpacity: 0,
        prompts: { negative: prompt(''), positive: null, useGlobalNegativePrompt: false },
      }
      const desired = parseProjectDocumentV1({
        ...initial,
        documentRevision: co().document.documentRevision,
        generationDraft: {
          ...initial.generationDraft,
          cfgRescale: 0,
          loras: [],
          model,
          negativePrompt: prompt(''),
          positivePrompt: prompt(REFERENCE_UTILITY_CONTRACT.globalPositive),
          sampling: {
            cfgScale: 5,
            denoisingStrength: null,
            sampler: 'Euler',
            scheduler: 'Normal',
            steps: 30,
          },
          seed: { policy: 'fixed', value: testCase.seed },
          vae: null,
          vaePrecision: 'FP16',
        },
        primaryBbox: bbox,
        regionalGuidance: testCase.image === null ? [] : [owner],
      })
      await co().applyDocument(desired, testCase.image === null ? {} : sources, {
        expectedDocumentEpoch: co().documentEpoch,
        expectedDocumentRevision: co().document.documentRevision,
      })
      if (testCase.image !== null) {
        const image = options.referenceImages[testCase.image]
        const pin = REFERENCE_UTILITY_CONTRACT.referenceImages[testCase.image]
        assert.equal(image.path, path.join(run, `reference-${testCase.image}.png`))
        assert.equal(image.byteSize, pin.byteSize)
        assert.equal(image.sha256, pin.sha256)
        const imageBytes = await readFile(image.path)
        assert.equal(imageBytes.length, pin.byteSize)
        assert.equal(sha(imageBytes), pin.sha256)
        worker = await ProjectWorkerClient.start(
          {
            pythonExecutable: options.pythonExecutable,
            runtimeRoot: options.runtimeRoot,
            stagingBasePath: scratch,
          },
          { environment: { LANG: 'C.UTF-8', PYTHONDONTWRITEBYTECODE: '1', TMPDIR: scratch } },
        )
        await service.importRegionalGuidanceReferenceImage(
          tab.id,
          {
            documentId: co().document.documentId,
            documentRevision: co().document.documentRevision,
            regionId,
          },
          async () => image.path,
          worker,
        )
        await worker.close()
        worker = undefined
        assert.equal(ProjectWorkerClient.hasUnconfirmedExit(), false)
      }
      await service.save(tab.id)
      await service.close(tab.id)
      assert.equal((await service.open(tab.id)).kind, 'opened')
      await service.flushAutosave(tab.id)
      const authored = structuredClone(co().document)
      assert.equal(co().dirty, false)
      assert.equal(authored.lastActualSeedSnapshot, initial.lastActualSeedSnapshot)
      if (testCase.image === null) {
        assert.deepEqual(authored.regionalGuidance, [])
      }
      const packageFile = await writeOwned(
        path.join(run, 'reference-packages', `${testCase.label}.igs`),
        await readFile(co().filePath),
      )
      await service.withCapturedCurrentCanvasRegionalGenerationInput(tab.id, async (capture) => {
        capture.assertCurrent()
        assert.deepEqual(capture.document, authored)
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
        const plan = planGenerationBatch({
          baseSeed: testCase.seed,
          iterations: 1,
          maxJobs: 1,
          maxPrompts: 1,
          negativePrompt: prepared.context.prompts.negative,
          positivePrompt: prepared.context.prompts.positive,
          seedBehavior: 'per-iteration',
        })
        const recipe = await prepareCurrentCanvasRegionalRecipe({
          capture: capture.regional,
          job: {
            bbox,
            documentId: authored.documentId,
            documentRevision: authored.documentRevision,
            family: 'illustrious',
            item: plan.items[0],
          },
          models,
        })
        assert.equal(recipe.regions.length, testCase.image === null ? 0 : 1)
        if (testCase.image !== null) {
          const region = recipe.regions[0]
          assert.equal(region.regionId, regionId)
          assert.equal(region.maskId, maskId)
          assert.equal(region.positive, null)
          assert.equal(region.coverage.kind, testCase.outside ? 'outside' : 'covered')
          assert.ok(region.coverage.alpha.every((value) => value === (testCase.outside ? 0 : 255)))
          assert.equal(region.referenceImages!.length, 1)
        }
        const references =
          testCase.image === null
            ? undefined
            : await captureCurrentCanvasRegionalReferences({
                capture: capture.regional,
                mode: 'txt2img',
                recipe,
                resources: options.resources,
              })
        const ownedPrepared = clonePrepared(prepared)
        const ownedRecipe = structuredClone(recipe)
        const captured = {
          case: testCase,
          models,
          prepared: ownedPrepared,
          recipe: ownedRecipe,
          ...(references ? { references: structuredClone(references) } : {}),
        }
        const before = sha(
          serialized({
            prepared: captured.prepared,
            recipe: captured.recipe,
            references: captured.references,
          }),
        )
        const targetFile = await writeOwned(
          path.join(run, 'reference-targets', `${testCase.label}.png`),
          ownedPrepared.targetPngBytes,
        )
        const handoff = await writeJson(
          path.join(run, 'reference-handoffs', `${testCase.label}.json`),
          {
            authoredDocument: authored,
            case: testCase,
            package: packageFile,
            prepared: ownedPrepared,
            recipe: ownedRecipe,
            references,
            target: targetFile,
          },
        )
        const result = await options.useCase(captured)
        assert.equal(
          sha(
            serialized({
              prepared: captured.prepared,
              recipe: captured.recipe,
              references: captured.references,
            }),
          ),
          before,
        )
        capture.assertCurrent()
        assert.deepEqual(co().document, authored)
        assert.equal(co().dirty, false)
        const reopened = await readIgsPackage(co().filePath)
        assert.deepEqual(reopened.project, authored)
        for (const table of [
          'generation_queue_item',
          'generation_candidate_receipt',
          'generation_seed_cursor',
        ]) {
          // Table discovery keeps the private-store no-queue assertion tied to the real schema.
          const present = await sql<{
            name: string
          }>`select name from sqlite_master where type='table' and name=${table}`.execute(
            database.db,
          )
          assert.equal(present.rows.length, 1, `Missing private-store table ${table}`)
          if (present.rows.length) {
            assert.equal(
              (
                await sql<{
                  count: number
                }>`select count(*) as count from ${sql.table(table)}`.execute(database.db)
              ).rows[0].count,
              0,
            )
          }
        }
        cases.push({
          case: testCase,
          handoff,
          label: testCase.label,
          package: packageFile,
          result,
          target: targetFile,
        })
      })
    }
    assert.equal(cases.length, 8)
    assert.equal(networkAttempts, 0)
    const manifest = {
      cases,
      nativeRequestCeiling: 8,
      networkAttempts,
      noSharedDatabaseWrites: true,
      profile: 'main-reference-utility-v1',
      schemaVersion: 1,
      visualAcceptance: 'pending',
    }
    await writeJson(path.join(run, 'main-reference-utility.json'), manifest)
    return manifest
  } finally {
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
  globalPositive = GLOBAL,
  ordinaryOnly = false,
  sampling: {
    sampler: 'DPM++ 2M' | 'Euler' | 'Euler a'
    scheduler?: 'Karras' | 'Normal'
    steps: number
    workerScheduler: 'dpmpp_2m_k' | 'euler_a' | 'euler'
  } = { sampler: 'Euler', steps: 30, workerScheduler: 'euler' },
): void {
  assert.equal(recipe.family, 'illustrious')
  assert.equal(recipe.documentId, authored.documentId)
  assert.equal(recipe.documentRevision, authored.documentRevision)
  assert.deepEqual(recipe.bbox, BBOX)
  assert.equal(recipe.item.seed, seed)
  assert.deepEqual(recipe.globalPrompts, { negative: prompt(''), positive: prompt(globalPositive) })
  assert.deepEqual(recipe.globalEmbeddings, { negative: [], positive: [] })
  assert.equal(recipe.regions.length, condition === 'baseline' ? 0 : 2)
  if (ordinaryOnly) {
    assert.equal(condition, 'baseline')
    assert.equal(authored.regionalGuidance?.length, 2)
    for (const [index, owner] of authored.regionalGuidance.entries()) {
      assert.equal(owner.enabled, false)
      assert.deepEqual(owner.prompts, {
        negative: prompt(''),
        positive: prompt([RED, BLUE][index]),
        useGlobalNegativePrompt: false,
      })
    }
  }
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
  assert.deepEqual(context.prompts, { negative: '', positive: globalPositive })
  assert.equal(context.model.managedPath, SOURCE)
  assert.equal(context.model.reference.fileSha256, SOURCE_SHA256)
  assert.equal(context.model.reference.predictionType, 'epsilon')
  assert.equal(context.vae, null)
  assert.equal(context.vaePrecision, 'FP16')
  assert.equal(context.loras?.length ?? 0, 0)
  assert.equal(context.loraStack?.length ?? 0, 0)
  assert.deepEqual(context.embeddings, { negative: [], positive: [] })
  assert.equal(context.sampling.seed, seed)
  assert.equal(context.sampling.steps, sampling.steps)
  assert.equal(context.sampling.cfgScale, 5)
  assert.equal(context.sampling.cfgRescale, 0)
  assert.equal(context.sampling.sampler, sampling.sampler)
  assert.equal(context.sampling.scheduler, sampling.scheduler ?? 'Normal')
  assert.equal(context.sampling.invokeScheduler, sampling.workerScheduler)
  assert.deepEqual(context.sampling.noiseProfile, NOISE)
  assert.equal(context.target.iccSha256, IGS_SRGB_ICC_SHA256)
  assert.equal(context.target.sha256, sha(prepared.targetPngBytes))
  assert.equal(context.target.byteSize, prepared.targetPngBytes.length)
  assert.equal(classifyTargetPngAlpha(prepared.targetPngBytes, 1024, 1024), 'txt2img')
  assert.ok(decodeTargetPngAlpha(prepared.targetPngBytes, 1024, 1024).every((byte) => byte === 0))
}
