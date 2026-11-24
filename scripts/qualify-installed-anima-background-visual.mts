import { ANIMA_PROMPT_INTERPRETATION } from '../src/shared/projects/anima-prompt-weighting.js'
import type { AnimaWorkerRequest } from '../src/shared/projects/anima-worker-request.js'
import { IGS_SRGB_ICC_SHA256 } from '../src/shared/projects/color-profile.js'
import type { GenerationDenoisingProgress } from '../src/shared/projects/generation-progress.js'
import { ANIMA_REGIONAL_COMPOSITION_PROFILE } from '../src/shared/projects/regional-invoke-generation.js'

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { mkdir, open, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { CurrentCanvasRegionalRecipe } from '../src/main/projects/project-current-canvas-regional-recipe.js'

import { prepareAnimaGenerationBatch } from '../src/main/projects/anima-generation-batch.js'
import { withAnimaGenerationBatchRequests } from '../src/main/projects/anima-generation-request.js'
import { GenerationWorkerClient } from '../src/main/projects/generation-worker-client.js'
import { captureInferenceWorkerOwner } from '../src/main/projects/inference-worker-ownership.js'
import {
  type AnimaRegionalTrainedBundle,
  produceAnimaRegionalInputFixture,
} from '../src/main/projects/test-fixtures/anima-regional-input.js'
import { readSmartPatchModelSourceOutput } from '../src/main/projects/worker-client.js'
import {
  artifactRoot,
  assertUpgradeBounds,
  bytesAt,
  children,
  errorText,
  type FilePin,
  observeGpu,
  readEngine,
  regular,
  runtimeIdle,
  sha,
  verify,
  verifyFixtureFile,
  workerExited,
  writeJson,
} from './qualify-installed-reference-img-utility.mjs'

const repository = path.resolve(import.meta.dirname, '..')
const invoke = path.resolve(repository, '../sources/InvokeAI')
const bbox = { height: 512, width: 512, x: -13, y: 5 }
const globalPositive = '(two white cats)1.25 on one bench'
const globalNegative = '(blur)0.75, noise'
const regionalPositives = {
  blue: '(blue scarf)0.75, one white cat',
  red: '(red scarf)1.5, one white cat',
}
const equalBluePositive = '(blue scarf)1.5, one white cat'
const cases = [
  { label: 'ordinary', uncoveredBackground: false, variant: 'ordinary' },
  { label: 'full-assigned', uncoveredBackground: false, variant: 'base' },
  { label: 'inset-assigned', uncoveredBackground: true, variant: 'base' },
  { label: 'inset-swapped', uncoveredBackground: true, variant: 'swapped' },
] as const
const seed = 123
const sceneSeeds = [123, 124] as const
const sceneCases = sceneSeeds.flatMap(
  (seed) =>
    [
      { label: `seed-${seed}-ordinary`, seed, uncoveredBackground: false, variant: 'ordinary' },
      { label: `seed-${seed}-assigned`, seed, uncoveredBackground: false, variant: 'base' },
      { label: `seed-${seed}-swapped`, seed, uncoveredBackground: false, variant: 'swapped' },
    ] as const,
)
const scenePrompts = {
  'countertop-scene': {
    globalPositive:
      'anime still life illustration, front view, medium wide shot, continuous pale wooden tabletop in front of a plain light blue wall, open display space, even lighting',
    regionalPositives: {
      apple:
        'a red apple with a small green leaf on a continuous pale wooden tabletop in front of a plain light blue wall',
      mug: 'a blue ceramic mug with a loop handle on a continuous pale wooden tabletop in front of a plain light blue wall',
    },
  },
  'countertop-subject-weight': {
    globalPositive:
      'anime still life illustration, front view, medium wide shot, continuous pale wooden tabletop in front of a plain light blue wall, open display space, even lighting',
    regionalPositives: {
      apple:
        '(a red apple with a small green leaf)1.5 on a continuous pale wooden tabletop in front of a plain light blue wall',
      mug: '(a blue ceramic mug with a loop handle)1.5 on a continuous pale wooden tabletop in front of a plain light blue wall',
    },
  },
  'festival-stall': {
    globalPositive:
      'anime illustration of a Japanese festival stall, one continuous wooden display shelf across the lower foreground, open display space, visible backdrop, medium wide shot',
    regionalPositives: {
      lantern: 'a red paper lantern with curved ribs and a small tassel',
      mask: 'a white fox festival mask with pointed ears and red markings',
    },
  },
} as const
const sceneMasks = [
  { height: 288, width: 192, x: 32, y: 64 },
  { height: 288, width: 192, x: 288, y: 64 },
] as const
const expectedActualSteps = 20
const sampling = {
  cfgScale: 4,
  expectedActualSteps,
  nominalSteps: 20,
  sampler: 'Euler',
  vaePrecision: 'Auto',
}
const regionId = (index: number) => `00000000-0000-4000-8000-00000000010${index + 1}`
const maskId = (index: number) => `00000000-0000-4000-8000-00000000020${index + 1}`

const literalPrompt = (cleanedText: string, firstEnd: number, weight: number) => ({
  cleanedText,
  spans: [
    { end: firstEnd, start: 0, weight },
    { end: cleanedText.length, start: firstEnd, weight: 1 },
  ],
  version: 'anima-prompt-weighting-v1',
})
const globalCompiled = [
  {
    polarity: 'positive',
    prompt: literalPrompt('two white cats on one bench', 14, 1.25),
    sourceId: 'current-canvas',
    text: globalPositive,
  },
  {
    polarity: 'negative',
    prompt: literalPrompt('blur , noise', 4, 0.75),
    sourceId: 'current-canvas',
    text: globalNegative,
  },
]
const plainPrompt = (text: string) => ({
  cleanedText: text,
  spans: [{ end: text.length, start: 0, weight: 1 }],
  version: 'anima-prompt-weighting-v1',
})
interface SourceFile extends FilePin {
  role: keyof AnimaRegionalTrainedBundle
  stat: {
    ctimeNs: string
    dev: string
    ino: string
    mode: string
    mtimeNs: string
    nlink: string
    size: string
  }
}

function regionalInputs(
  testCase: (typeof cases)[number],
  recipe: CurrentCanvasRegionalRecipe,
  blueWeight: 0.75 | 1.5,
) {
  const colors =
    testCase.variant === 'ordinary'
      ? []
      : testCase.variant === 'swapped'
        ? (['blue', 'red'] as const)
        : (['red', 'blue'] as const)
  assert.equal(recipe.family, 'anima')
  assert.deepEqual(recipe.bbox, bbox)
  assert.deepEqual(recipe.item.prompts, { negative: globalNegative, positive: globalPositive })
  assert.equal(recipe.item.seed, seed)
  assert.equal(recipe.regions.length, colors.length)
  return recipe.regions.map((region, index) => {
    const color = colors[index]
    const text =
      color === 'blue' && blueWeight === 1.5 ? equalBluePositive : regionalPositives[color]
    assert.equal(region.regionId, regionId(index))
    assert.equal(region.maskId, maskId(index))
    assert.equal(region.maskRevision, 1)
    assert.equal(region.positive?.text, text)
    assert.equal(region.negative.source, 'regional')
    assert.equal(region.negative.prompt.text, '')
    assert.equal(region.coverage.kind, 'covered')
    assert.deepEqual(region.coverage.bounds, bbox)
    assert.deepEqual(region.coverage.intersection, {
      height: testCase.uncoveredBackground ? 288 : 512,
      width: 258,
      x: bbox.x + (index === 0 ? 0 : 254),
      y: bbox.y + (testCase.uncoveredBackground ? 64 : 0),
    })
    const { alpha, ...coverage } = region.coverage
    assert.equal(alpha.length, 512 ** 2)
    for (let offset = 0; offset < alpha.length; offset++) {
      const x = offset % 512
      const y = Math.floor(offset / 512)
      const insideRows = !testCase.uncoveredBackground || (y >= 64 && y < 352)
      let expected = 0
      if (insideRows) {
        if (index === 0 && x < 258) {
          expected = x < 256 ? 255 : x === 256 ? 128 : 127
        }
        if (index === 1 && x >= 254) {
          expected = x >= 256 ? 255 : x === 255 ? 128 : 127
        }
      }
      assert.equal(alpha[offset], expected, `${testCase.label} region ${index} alpha ${offset}`)
    }
    return {
      compiled: {
        polarity: 'positive',
        prompt:
          color === 'red'
            ? literalPrompt('red scarf , one white cat', 9, 1.5)
            : literalPrompt('blue scarf , one white cat', 10, blueWeight),
        sourceId: regionId(index),
        text,
      },
      coverage: { ...coverage, alphaSha256: sha(Buffer.from(alpha)) },
    }
  })
}

function sceneRegionalInputs(
  testCase: (typeof sceneCases)[number],
  recipe: CurrentCanvasRegionalRecipe,
  positive: string,
  regionalTexts: readonly [string, string],
  weightedSubjects: boolean,
) {
  const texts =
    testCase.variant === 'ordinary'
      ? []
      : testCase.variant === 'swapped'
        ? [regionalTexts[1], regionalTexts[0]]
        : regionalTexts
  assert.equal(recipe.family, 'anima')
  assert.deepEqual(recipe.bbox, bbox)
  assert.deepEqual(recipe.item.prompts, { negative: globalNegative, positive })
  assert.equal(recipe.item.seed, testCase.seed)
  assert.equal(recipe.regions.length, texts.length)
  return recipe.regions.map((region, index) => {
    const text = texts[index]
    assert.equal(region.regionId, regionId(index))
    assert.equal(region.maskId, maskId(index))
    assert.equal(region.maskRevision, 1)
    assert.deepEqual(region.positive, { embeddingRefs: [], text })
    assert.deepEqual(region.negative, {
      prompt: { embeddingRefs: [], text: '' },
      source: 'regional',
    })
    assert.equal(region.coverage.kind, 'covered')
    assert.deepEqual(region.coverage.bounds, bbox)
    const { height, width, x, y } = sceneMasks[index]
    assert.deepEqual(region.coverage.intersection, { height, width, x: bbox.x + x, y: bbox.y + y })
    const { alpha, ...coverage } = region.coverage
    const expected = Buffer.alloc(512 ** 2)
    for (let row = y; row < y + height; row++) {
      expected.fill(255, row * bbox.width + x, row * bbox.width + x + width)
    }
    assert.deepEqual(Buffer.from(alpha), expected)
    let interpretation = plainPrompt(text)
    if (weightedSubjects) {
      const { apple, mug } = scenePrompts['countertop-scene'].regionalPositives
      interpretation =
        text === regionalTexts[0] ? literalPrompt(apple, 35, 1.5) : literalPrompt(mug, 37, 1.5)
    }
    return {
      compiled: {
        polarity: 'positive',
        prompt: interpretation,
        sourceId: regionId(index),
        text,
      },
      coverage: { ...coverage, alphaSha256: sha(expected) },
    }
  })
}

function sampledSupport(
  testCase: (typeof cases)[number] | (typeof sceneCases)[number],
  recipe: CurrentCanvasRegionalRecipe,
) {
  if (testCase.variant === 'ordinary') {
    return null
  }
  const [left, right] = recipe.regions.map(({ coverage }) => coverage.alpha)
  // For 512px, the existing VAE /8 and transformer /2 select top-left samples on a 32x32 grid.
  let background = 0
  let leftSupport = 0
  let rightSupport = 0
  let overlap = 0
  for (let y = 0; y < 512; y += 16) {
    for (let x = 0; x < 512; x += 16) {
      const offset = y * 512 + x
      const leftCovered = left[offset] >= 128
      const rightCovered = right[offset] >= 128
      background += Number(!leftCovered && !rightCovered)
      leftSupport += Number(leftCovered)
      rightSupport += Number(rightCovered)
      overlap += Number(leftCovered && rightCovered)
    }
  }
  assert.deepEqual(
    [background, leftSupport, rightSupport, overlap],
    'seed' in testCase
      ? [592, 216, 216, 0]
      : testCase.uncoveredBackground
        ? [448, 306, 288, 18]
        : [0, 544, 512, 32],
  )
  return {
    background,
    globalPositiveEvenBlockSupport: background || 1024,
    grid: { height: 32, width: 32 },
    left: leftSupport,
    overlap,
    right: rightSupport,
  }
}
const priorRun = path.join(artifactRoot, 'runs/packaged-installed-engine/20261118/trained-anima-r1')
const priorHashes = {
  'native/report.json': '7dcda0678e2a8caa15cef62aec1e77999ad8a5a1c69589bf394263c2f56ebc94',
  'trained-fixture.json': '2fa068c1325e4ab0c74f3d215395a5ab478bf744bb2b03e393ad5197dda80ecc',
  'trained-sources-unchanged.json':
    'a0f2081ca3730e1a253cee3bb1af12cdaf468e76451796255a23f97c679effdf',
}
const weightControl = {
  pins: {
    'experiment-contract.json': 'be5389d936a6f6550f51c4adaaade4e1585cd0287394315196f8edd4556d1be8',
    'independent-audit.json': '34254ebc8231223d98c20bede915204e93759214c85f7246155b70ea800bb37f',
    'inset-assigned.request.json':
      '74effc4eccc61c7aee9d3f2050aabaab0cc450fefd5622161fa20818c98fa9fe',
    'inset-swapped.request.json':
      'ec5fc60537fb5e7ae4708c124f486deb9162515929ce2a15b6409f09de8fdb52',
    'native-start.json': '004045ed8779a28bc739443444a92a76dadfa26cb3155d4f803b95898800ce89',
  },
  run: 'anima-background-visual/20261121-r2',
}

function comparableRequest(request: AnimaWorkerRequest) {
  const { job, requestId: _requestId, ...envelope } = request
  const { path: _targetPath, ...target } = job.target
  const { output: _output, ...baseJob } = job
  return { ...envelope, job: { ...baseJob, target } }
}

async function readWeightControl<T>(name: keyof typeof weightControl.pins): Promise<T> {
  const bytes = await bytesAt(path.join(artifactRoot, 'runs', weightControl.run, name))
  assert.equal(sha(bytes), weightControl.pins[name])
  return JSON.parse(bytes.toString()) as T
}

async function readPrior<T>(name: keyof typeof priorHashes): Promise<T> {
  const bytes = await bytesAt(path.join(priorRun, name))
  assert.equal(sha(bytes), priorHashes[name])
  return JSON.parse(bytes.toString()) as T
}
async function currentSourceStat(filename: string): Promise<SourceFile['stat']> {
  const { ctime, mtime, size, ...identity } = await regular(filename)
  return { ...identity, ctimeNs: ctime, mtimeNs: mtime, size: String(size) }
}

async function revalidateSourceFiles(files: SourceFile[]) {
  const verified: SourceFile[] = []
  for (const file of files) {
    const current = await currentSourceStat(file.path)
    assert.deepEqual(current, { ...file.stat, dev: current.dev })
    assert.equal(current.size, String(file.byteSize))
    const reader = await open(
      file.path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    )
    const statReader = async () => {
      const stat = await reader.stat({ bigint: true })
      assert.ok(stat.isFile())
      return {
        ctimeNs: String(stat.ctimeNs),
        dev: String(stat.dev),
        ino: String(stat.ino),
        mode: String(stat.mode),
        mtimeNs: String(stat.mtimeNs),
        nlink: String(stat.nlink),
        size: String(stat.size),
      }
    }
    try {
      assert.deepEqual(await statReader(), current)
      const digest = createHash('sha256')
      for await (const chunk of reader.createReadStream({ autoClose: false })) {
        digest.update(chunk)
      }
      assert.equal(digest.digest('hex'), file.sha256)
      assert.deepEqual(await statReader(), current)
      assert.deepEqual(await currentSourceStat(file.path), current)
    } finally {
      await reader.close()
    }
    verified.push({ ...file, stat: current })
  }
  return verified
}

async function assertSourceFiles(files: SourceFile[]) {
  for (const file of files) {
    assert.deepEqual(await currentSourceStat(file.path), file.stat)
  }
}

const ownerFiles = [
  'scripts/qualify-installed-anima-background-visual.mts',
  'scripts/qualify-installed-reference-img-utility.mts',
  'src/main/projects/test-fixtures/anima-regional-input.ts',
  'src/main/projects/project-current-canvas-anima-regional-input.ts',
  'src/shared/projects/anima-prompt-weighting.ts',
  'src/main/projects/generation-worker-client.ts',
  'worker-python/src/imagegen_worker/anima_regional.py',
  'worker-python/src/imagegen_worker/anima_regional_worker.py',
]
const invokeFiles = [
  'invokeai/frontend/webv2/src/features/generation/core/graph.ts',
  'invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts',
  'invokeai/frontend/webv2/src/features/generation/core/canvas/addRegionalGuidance.ts',
  'invokeai/app/invocations/anima/anima_denoise.py',
  'invokeai/app/invocations/text_encoder/anima_text_encoder.py',
  'invokeai/backend/anima/regional_prompting.py',
  'invokeai/backend/anima/prompt_weighting.py',
  'invokeai/backend/anima/anima_transformer_patch.py',
  'invokeai/backend/krea2/regional_prompting.py',
]
const revision = (cwd: string) =>
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8', timeout: 10_000 }).trim()
const sourceWitness = async (root: string, names: string[]) =>
  Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [name, sha(await bytesAt(path.join(root, name)))] as const),
    ),
  )

async function main() {
  const [flag, run, ...extra] = process.argv.slice(2)
  assert.equal(flag, '--run')
  assert.ok(run && extra.length === 0)
  const equalWeight = path.dirname(run) === path.join(artifactRoot, 'runs/anima-equal-scarf-weight')
  const sceneName = (Object.keys(scenePrompts) as (keyof typeof scenePrompts)[]).find(
    (name) => path.dirname(run) === path.join(artifactRoot, 'runs', `anima-${name}`),
  )
  const scene = sceneName && scenePrompts[sceneName]
  const profile = sceneName
    ? `anima-${sceneName}`
    : equalWeight
      ? 'anima-equal-scarf-weight'
      : 'anima-background-visual'
  assert.equal(path.dirname(run), path.join(artifactRoot, 'runs', profile))
  assert.match(path.basename(run), /^\d{8}-r[1-9]\d*$/)
  assert.equal(await realpath(run), run)
  const selectedCases = scene ? sceneCases : equalWeight ? cases.slice(2) : cases
  const selectedPositives =
    scene?.regionalPositives ??
    (equalWeight ? { ...regionalPositives, blue: equalBluePositive } : regionalPositives)
  const selectedGlobalPositive = scene?.globalPositive ?? globalPositive
  const [firstRegionalText, secondRegionalText] = Object.values(selectedPositives)
  const regionalTexts = [firstRegionalText, secondRegionalText] as const
  const selectedGlobalCompiled = scene
    ? [
        {
          ...globalCompiled[0],
          prompt: plainPrompt(selectedGlobalPositive),
          text: selectedGlobalPositive,
        },
        globalCompiled[1],
      ]
    : globalCompiled
  const write = (name: string, value: unknown) => writeJson(name, value, run)

  const start = Date.now()
  const bounds = await assertUpgradeBounds({ maxRuntimeSeconds: 600 })
  assert.ok(bounds.unit.endsWith('.service'))
  const fixture = JSON.parse((await bytesAt(path.join(run, 'fixture.json'))).toString()) as {
    contract: FilePin
  }
  assert.deepEqual(Object.keys(fixture), ['contract'])
  assert.equal(fixture.contract.path, path.join(run, 'experiment-contract.json'))
  await verifyFixtureFile(fixture.contract)
  const contract = JSON.parse((await bytesAt(fixture.contract.path)).toString())
  const applicationRevision = revision(repository)
  const invokeRevision = revision(invoke)
  assert.deepEqual(
    [
      contract.schema,
      contract.applicationBase,
      contract.invokeRevision,
      contract.nativeRequestCeiling,
    ],
    [`${profile}-v1`, applicationRevision, invokeRevision, selectedCases.length],
  )
  assert.deepEqual(
    [
      contract.geometry,
      contract.globalPositive,
      contract.globalNegative,
      contract.regionalPositives,
      scene ? contract.seeds : contract.seed,
      contract.sampling,
      contract.cases,
    ],
    [
      bbox,
      selectedGlobalPositive,
      globalNegative,
      selectedPositives,
      scene ? sceneSeeds : seed,
      sampling,
      selectedCases,
    ],
  )
  if (scene) {
    assert.deepEqual(contract.regionalMasks, sceneMasks)
    assert.equal(contract.compositionProfile, ANIMA_REGIONAL_COMPOSITION_PROFILE)
  }
  if (equalWeight) {
    assert.deepEqual(contract.comparison, weightControl)
    const old = await readWeightControl<{
      cases: typeof cases
      regionalPositives: typeof regionalPositives
    }>('experiment-contract.json')
    assert.deepEqual(old.regionalPositives, regionalPositives)
    assert.deepEqual(old.cases, cases)
    assert.equal(
      (await readWeightControl<{ result: string }>('independent-audit.json')).result,
      'CLEAN',
    )
  }
  assert.equal(
    execFileSync('git', ['status', '--porcelain'], {
      cwd: invoke,
      encoding: 'utf8',
      timeout: 10_000,
    }),
    '',
  )

  const install = await readEngine([
    'anima-txt2img',
    'anima-flow-sampling',
    'anima-prompt-weighting',
    'anima-regional-txt2img-v1',
    'linux-owned-inference-v1',
  ])
  const enginePins = [...install.pinned, ...install.configs]
  for (const pin of enginePins) {
    await verify(pin)
  }
  const prior = await readPrior<{ family: string; files: SourceFile[]; runtimeId: string }>(
    'trained-fixture.json',
  )
  const proof = await readPrior<{
    outcome: string
    packagedInstalledRuntime: { runtimeId: string }
    trainedGeneration: { family: string; modelInputs: SourceFile[] }
  }>('native/report.json')
  const preserved = await readPrior<{ files: SourceFile[] }>('trained-sources-unchanged.json')
  assert.equal(proof.outcome, 'PASS')
  assert.equal(proof.trainedGeneration.family, 'anima')
  assert.equal(proof.packagedInstalledRuntime.runtimeId, install.runtimeId)
  assert.equal(prior.family, 'anima')
  assert.equal(prior.runtimeId, install.runtimeId)
  assert.deepEqual(
    prior.files.map(({ role }) => role),
    ['checkpoint', 'qwen3Encoder', 'vae'],
  )
  assert.deepEqual(prior.files, proof.trainedGeneration.modelInputs)
  assert.deepEqual(prior.files, preserved.files)
  const liveSourceFiles = await revalidateSourceFiles(prior.files)
  const trainedBundle = Object.fromEntries(
    prior.files.map(({ byteSize, path: filename, role, sha256 }) => [
      role,
      { byteSize, path: filename, sha256 },
    ]),
  ) as unknown as AnimaRegionalTrainedBundle

  const idle = () => runtimeIdle(install)
  const bootstrapStorage = await idle()
  const outputRoot = path.join(run, 'native-outputs')
  const scratchBasePath = path.join(run, 'native-scratch')
  const hfHome = path.join(run, 'native-hf-home')
  for (const directory of [outputRoot, scratchBasePath, hfHome]) {
    await mkdir(directory, { mode: 0o700 })
  }
  const payloadRoot = path.join(run, 'payloads')
  assert.equal(await realpath(payloadRoot), payloadRoot)
  const source = await sourceWitness(repository, ownerFiles)
  const invokeSource = await sourceWitness(invoke, invokeFiles)
  assert.equal(ANIMA_REGIONAL_COMPOSITION_PROFILE, 'invoke-krea2-global-support-v1')
  if (equalWeight) {
    const control = await readWeightControl<{
      compositionProfile: string
      installation: typeof install
      invokeSource: typeof invokeSource
      source: typeof source
      trainedBundle: AnimaRegionalTrainedBundle
    }>('native-start.json')
    assert.deepEqual(control.trainedBundle, trainedBundle)
    assert.deepEqual(control.installation, install)
    assert.deepEqual(control.invokeSource, invokeSource)
    assert.equal(control.compositionProfile, ANIMA_REGIONAL_COMPOSITION_PROFILE)
    for (const name of ownerFiles.filter(
      (name) =>
        name !== ownerFiles[0] &&
        name !== 'src/main/projects/test-fixtures/anima-regional-input.ts',
    )) {
      assert.equal(control.source[name], source[name])
    }
  }
  await write('native-start.json', {
    applicationRevision,
    bootstrapStorage,
    bounds,
    cases: selectedCases,
    ...(equalWeight ? { comparison: weightControl } : {}),
    compositionProfile: ANIMA_REGIONAL_COMPOSITION_PROFILE,
    fixture,
    installation: install,
    invokeRevision,
    invokeSource,
    modelSourceIdentity: { current: liveSourceFiles, historical: prior.files },
    priorHashes,
    sampling,
    source,
    trainedBundle,
  })

  let attempted = 0
  let submitted = 0
  let targetSha: string | undefined
  const commonJobs = new Map<number, unknown>()
  const observations: unknown[] = []
  let failure: unknown
  try {
    for (const testCase of selectedCases) {
      const root = path.join(payloadRoot, testCase.label)
      const caseSeed = 'seed' in testCase ? testCase.seed : seed
      const retained = await produceAnimaRegionalInputFixture(root, {
        height: bbox.height,
        installedVisual: {
          pythonExecutable: install.pythonExecutable,
          runtimeRoot: install.runtimeDir,
          ...(sceneName ? { scene: sceneName } : {}),
          async useCase({ compiledPrompts, models, prepared, recipe }) {
            assert.equal(prepared.context.mode, 'txt2img')
            assert.deepEqual(prepared.context.bbox, bbox)
            assert.equal(prepared.context.target.iccSha256, IGS_SRGB_ICC_SHA256)
            if (!targetSha) {
              if (!equalWeight) {
                assert.equal(testCase.variant, 'ordinary')
              }
              targetSha = sha(prepared.targetPngBytes)
              await writeFile(path.join(run, 'target.png'), prepared.targetPngBytes, {
                flag: 'wx',
                mode: 0o600,
              })
            }
            assert.equal(sha(prepared.targetPngBytes), targetSha)
            assert.equal(prepared.context.target.sha256, targetSha)
            const regional =
              'seed' in testCase
                ? sceneRegionalInputs(
                    testCase,
                    recipe,
                    selectedGlobalPositive,
                    regionalTexts,
                    sceneName === 'countertop-subject-weight',
                  )
                : regionalInputs(testCase, recipe, equalWeight ? 1.5 : 0.75)
            const support = sampledSupport(testCase, recipe)
            assert.deepEqual(compiledPrompts, [
              ...selectedGlobalCompiled,
              ...regional.map(({ compiled }) => compiled),
            ])

            await idle()
            await assertSourceFiles(liveSourceFiles)
            const previousChildren = new Set(await children())
            const remaining = 600_000 - (Date.now() - start)
            assert.ok(remaining > 0)
            attempted++
            const progress: GenerationDenoisingProgress[] = []
            const onProgress = (value: GenerationDenoisingProgress) => {
              assert.deepEqual(value, {
                step: progress.length + 1,
                totalSteps: expectedActualSteps,
              })
              progress.push(value)
            }
            let client: GenerationWorkerClient | undefined
            let owner: Awaited<ReturnType<typeof captureInferenceWorkerOwner>> | undefined
            let stopGpu: ReturnType<typeof observeGpu> | undefined
            let output: FilePin | undefined
            let physicalExit = false
            let caseError: unknown
            try {
              const active = await GenerationWorkerClient.start(
                {
                  pythonExecutable: install.pythonExecutable,
                  runtimeRoot: install.runtimeDir,
                  scratchBasePath,
                },
                {
                  environment: {
                    HF_DATASETS_OFFLINE: '1',
                    HF_HOME: hfHome,
                    HF_HUB_OFFLINE: '1',
                    IGS_SDXL_CONFIG_DIR: install.configDir,
                    LANG: 'C.UTF-8',
                    LC_ALL: 'C.UTF-8',
                    TMPDIR: scratchBasePath,
                  },
                  requestTimeoutMs: remaining,
                  startupTimeoutMs: Math.min(120_000, remaining),
                },
              )
              client = active
              assert.deepEqual(active.ready, install.ready)
              const created = (await children()).filter((pid) => !previousChildren.has(pid))
              assert.equal(created.length, 1)
              owner = await captureInferenceWorkerOwner(created[0])
              const proc = `/proc/${owner.worker.pid}`
              assert.equal(await realpath(`${proc}/exe`), install.exactPython)
              assert.equal(await realpath(`${proc}/cwd`), install.runtimeDir)
              assert.equal((await readFile(`${proc}/cgroup`, 'utf8')).trim(), `0::${bounds.group}`)
              output = await withAnimaGenerationBatchRequests({
                modelService: models,
                prepared: prepareAnimaGenerationBatch({ iterations: 1, prepared }),
                ready: active.ready,
                scratchBasePath,
                async use(requests) {
                  assert.equal(requests.length, 1)
                  const [request] = requests
                  assert.equal(request.type, 'generate-anima-txt2img')
                  const { job, requestId } = request
                  const {
                    beginIndex,
                    guidanceScale,
                    mode,
                    posteriorSeed,
                    scheduler,
                    seed: actualSeed,
                    startStep,
                    steps,
                    stepSeed,
                    strength,
                    totalSteps,
                  } = job.sampling
                  assert.deepEqual(
                    [
                      beginIndex,
                      guidanceScale,
                      mode,
                      posteriorSeed,
                      scheduler,
                      actualSeed,
                      startStep,
                      stepSeed,
                      steps,
                      strength,
                      totalSteps,
                    ],
                    [
                      0,
                      4,
                      'txt2img',
                      null,
                      'euler',
                      caseSeed,
                      0,
                      caseSeed,
                      20,
                      null,
                      expectedActualSteps,
                    ],
                  )
                  assert.deepEqual(job.prompts, {
                    negative: selectedGlobalCompiled[1].prompt,
                    positive: selectedGlobalCompiled[0].prompt,
                  })
                  assert.deepEqual(job.model, { architecture: 'anima-base-1.0', ...trainedBundle })
                  assert.deepEqual(job.loras, [])
                  assert.equal(job.target.sha256, targetSha)
                  const stableJob = comparableRequest(request)
                  if (!commonJobs.has(caseSeed)) {
                    commonJobs.set(caseSeed, stableJob)
                  }
                  assert.deepEqual(stableJob, commonJobs.get(caseSeed))
                  const regions = recipe.regions.map(
                    ({ coverage: _coverage, ...region }, index) => ({
                      ...region,
                      coverage: regional[index].coverage,
                    }),
                  )
                  if (equalWeight) {
                    assert.ok(
                      testCase.label === 'inset-assigned' || testCase.label === 'inset-swapped',
                    )
                    const control = await readWeightControl<{
                      case: typeof testCase
                      compiledPrompts: unknown
                      compositionProfile: string
                      regions: unknown
                      request: AnimaWorkerRequest
                      sampledSupport: unknown
                    }>(`${testCase.label}.request.json`)
                    assert.deepEqual(control.case, testCase)
                    assert.deepEqual(comparableRequest(control.request), stableJob)
                    assert.equal(control.compositionProfile, ANIMA_REGIONAL_COMPOSITION_PROFILE)
                    assert.deepEqual(control.sampledSupport, support)
                    assert.deepEqual(
                      control.regions,
                      regions.map((region) => {
                        if (region.positive?.text !== equalBluePositive) {
                          return region
                        }
                        const positive = { ...region.positive, text: regionalPositives.blue }
                        return {
                          ...region,
                          authoredPrompts: { ...region.authoredPrompts, positive },
                          positive,
                        }
                      }),
                    )
                    assert.deepEqual(
                      control.compiledPrompts,
                      compiledPrompts.map((entry) =>
                        entry.text === equalBluePositive
                          ? {
                              ...entry,
                              prompt: literalPrompt('blue scarf , one white cat', 10, 0.75),
                              text: regionalPositives.blue,
                            }
                          : entry,
                      ),
                    )
                  }
                  await write(`${testCase.label}.request.json`, {
                    case: testCase,
                    compiledPrompts,
                    compositionProfile:
                      testCase.variant === 'ordinary' ? null : ANIMA_REGIONAL_COMPOSITION_PROFILE,
                    owner,
                    regions,
                    request,
                    sampledSupport: support,
                  })
                  stopGpu = observeGpu(owner!.worker.pid)
                  submitted++
                  let png: Buffer
                  if (testCase.variant === 'ordinary') {
                    const response = (await active.generate(request, onProgress)) as {
                      outputPath: string
                      requestId: string
                      seed: number
                      type: string
                    }
                    const destination = job.output.pngPath
                    assert.deepEqual(
                      [response.type, response.requestId, response.seed, response.outputPath],
                      ['generation-done', requestId, caseSeed, destination],
                    )
                    const body = await bytesAt(destination)
                    png = await readSmartPatchModelSourceOutput(destination, {
                      byteSize: body.length,
                      colorSpace: 'srgb',
                      height: bbox.height,
                      iccSha256: IGS_SRGB_ICC_SHA256,
                      path: destination,
                      sha256: sha(body),
                      width: bbox.width,
                    })
                  } else {
                    const response = await active.executeCurrentCanvasRegional(
                      {
                        compiledPrompts: [...compiledPrompts],
                        compositionProfile: ANIMA_REGIONAL_COMPOSITION_PROFILE,
                        promptInterpretation: ANIMA_PROMPT_INTERPRETATION,
                        recipe,
                        request,
                      },
                      onProgress,
                    )
                    assert.equal(response.seed, caseSeed)
                    assert.equal(response.output.height, bbox.height)
                    assert.equal(response.output.width, bbox.width)
                    assert.equal(response.output.iccSha256, IGS_SRGB_ICC_SHA256)
                    assert.equal(response.output.byteSize, response.pngBytes.length)
                    assert.equal(response.output.sha256, sha(response.pngBytes))
                    png = response.pngBytes
                  }
                  assert.equal(progress.length, expectedActualSteps)
                  const filename = path.join(outputRoot, `${testCase.label}.png`)
                  await writeFile(filename, png, { flag: 'wx', mode: 0o600 })
                  return { byteSize: png.length, path: filename, sha256: sha(png) }
                },
              })
            } catch (error) {
              caseError = error
              throw error
            } finally {
              const gpu = await stopGpu?.()
              try {
                await client?.close()
                if (owner) {
                  await workerExited(owner)
                  physicalExit = true
                }
                assert.equal(GenerationWorkerClient.hasUnconfirmedStartExit(), false)
              } finally {
                const observation = {
                  case: testCase,
                  error: caseError && errorText(caseError),
                  gpu,
                  output,
                  owner,
                  physicalExit,
                  progress,
                }
                observations.push(observation)
                await write(`${testCase.label}.outcome.json`, observation)
              }
              if (!caseError) {
                assert.ok(gpu && gpu.maximumMiB && gpu.samples > 0 && !gpu.error)
              }
            }
          },
        },
        regionalTexts,
        seed: caseSeed,
        steps: sampling.nominalSteps,
        trainedBundle,
        uncoveredBackground: testCase.uncoveredBackground,
        variant: testCase.variant,
        width: bbox.width,
      })
      assert.equal(retained.durablePreservation.durableUnchanged, true)
      assert.equal(retained.durablePreservation.savedAndReopened, true)
    }
    assert.equal(submitted, selectedCases.length)
  } catch (error) {
    failure = error
  }

  let preservationError: unknown
  try {
    assert.deepEqual(await idle(), bootstrapStorage)
    await assertSourceFiles(liveSourceFiles)
    for (const pin of enginePins) {
      await verify(pin)
    }
    assert.deepEqual(await sourceWitness(repository, ownerFiles), source)
    assert.deepEqual(await sourceWitness(invoke, invokeFiles), invokeSource)
    assert.equal(revision(repository), applicationRevision)
    assert.equal(revision(invoke), invokeRevision)
    await verifyFixtureFile(fixture.contract)
  } catch (error) {
    preservationError = error
  }
  const memoryRoot = path.join('/sys/fs/cgroup', bounds.group)
  const memory = Object.fromEntries(
    await Promise.all(
      ['memory.peak', 'memory.events', 'memory.stat', 'memory.swap.peak'].map(async (name) => [
        name,
        (await readFile(path.join(memoryRoot, name), 'utf8')).trim(),
      ]),
    ),
  )
  assert.match(memory['memory.events'], /^oom_kill 0$/m)
  assert.equal(memory['memory.swap.peak'], '0')
  await write('native-report.json', {
    attempted,
    bounds,
    enginePins: install.pinned.length,
    failure: failure && errorText(failure),
    memory,
    observations,
    outcome: failure || preservationError ? 'FAIL' : 'PASS',
    preservationError: preservationError && errorText(preservationError),
    runtimeId: install.runtimeId,
    signedConfigPins: install.configs.length,
    submitted,
    targetSha,
    visualStatus: 'pending',
  })
  if (failure || preservationError) {
    throw failure ?? preservationError
  }
}

if (import.meta.main) {
  await main()
}
