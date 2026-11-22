import { ANIMA_PROMPT_INTERPRETATION } from '../src/shared/projects/anima-prompt-weighting.js'
import { IGS_SRGB_ICC_SHA256 } from '../src/shared/projects/color-profile.js'
import type { GenerationDenoisingProgress } from '../src/shared/projects/generation-progress.js'
import { ANIMA_REGIONAL_COMPOSITION_PROFILE } from '../src/shared/projects/regional-invoke-generation.js'

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { mkdir, open, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { prepareAnimaGenerationBatch } from '../src/main/projects/anima-generation-batch.js'
import { withAnimaGenerationBatchRequests } from '../src/main/projects/anima-generation-request.js'
import { GenerationWorkerClient } from '../src/main/projects/generation-worker-client.js'
import { captureInferenceWorkerOwner } from '../src/main/projects/inference-worker-ownership.js'
import {
  type AnimaRegionalTrainedBundle,
  produceAnimaRegionalNegativeVisualProbe,
} from '../src/main/projects/test-fixtures/anima-regional-input.js'
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
const invokeRepository = path.resolve(repository, '../sources/InvokeAI')
const [flag, run, ...extra] = process.argv.slice(2)
assert.equal(flag, '--run')
assert.ok(run && extra.length === 0)
const appleRunParent = path.join(artifactRoot, 'runs/anima-apple-negative')
const appleProfile = path.dirname(run) === appleRunParent
if (appleProfile) {
  assert.match(path.basename(run), /^\d{8}-r[1-9]\d*$/)
} else {
  assert.equal(path.dirname(run), path.join(artifactRoot, 'runs/anima-negative-visual'))
  assert.match(path.basename(run), /^20261118-r[1-9]\d*$/)
}
assert.equal(await realpath(run), run)
const write = (name: string, value: unknown) => writeJson(name, value, run)

const bbox = { height: 512, width: 512, x: 0, y: 0 }
// These literals are independent of the authoring fixture and the sampling/prompt compilers.
const profile = appleProfile
  ? {
      beginIndex: 14,
      denoisingStrength: 0.65,
      expectedActualSteps: 25,
      globalPositive:
        'anime still life illustration, a continuous pale wooden tabletop against a plain light blue wall, front view, even lighting',
      regionalNegative: '(red apple)2.0',
      regionalNegativeCleaned: 'red apple',
      regionalNegativeWeight: 2,
      regionalPositive: 'a pale wooden tabletop against a plain light blue wall, even lighting',
      schema: 'anima-apple-negative-v1',
      sourceFilename: 'apple-mug-source.png',
      startStep: 7,
    }
  : {
      beginIndex: 20,
      denoisingStrength: 0.5,
      expectedActualSteps: 19,
      globalPositive: 'two white cats wearing scarves, illustration, plain light background',
      regionalNegative: '(red scarf)1.5',
      regionalNegativeCleaned: 'red scarf',
      regionalNegativeWeight: 1.5,
      regionalPositive: 'one white cat wearing a scarf',
      schema: 'anima-negative-visual-v1',
      sourceFilename: 'cat-scarves-source.png',
      startStep: 10,
    }
const { expectedActualSteps, globalPositive, regionalNegative, regionalPositive } = profile
const globalNegative = '(blur)0.75, noise'
const cases = [
  { label: 'baseline', negativeSide: null },
  { label: 'negative-left', negativeSide: 'left' },
  { label: 'negative-right', negativeSide: 'right' },
] as const
const seed = 123
const sampling = {
  cfgScale: 4,
  denoisingStrength: profile.denoisingStrength,
  expectedActualSteps,
  nominalSteps: 20,
  sampler: 'Heun',
  vaePrecision: 'Auto',
}
const regionId = (side: 'left' | 'right') =>
  `00000000-0000-4000-8000-00000000010${side === 'left' ? 1 : 2}`
const literalPrompt = (cleanedText: string, weight = 1) => ({
  cleanedText,
  spans: [{ end: cleanedText.length, start: 0, weight }],
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
const priorRun = path.join(artifactRoot, 'runs/packaged-installed-engine/20261118/trained-anima-r1')
const priorHashes = {
  'native/report.json': '7dcda0678e2a8caa15cef62aec1e77999ad8a5a1c69589bf394263c2f56ebc94',
  'trained-fixture.json': '2fa068c1325e4ab0c74f3d215395a5ab478bf744bb2b03e393ad5197dda80ecc',
  'trained-sources-unchanged.json':
    'a0f2081ca3730e1a253cee3bb1af12cdaf468e76451796255a23f97c679effdf',
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

async function revalidateSourceFiles(files: SourceFile[]): Promise<SourceFile[]> {
  const verified: SourceFile[] = []
  for (const file of files) {
    const current = await currentSourceStat(file.path)
    // The same model store can receive a different device number when remounted.
    assert.deepEqual(current, { ...file.stat, dev: current.dev })
    assert.equal(current.size, String(file.byteSize))
    const reader = await open(
      file.path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    )
    const statReader = async (): Promise<SourceFile['stat']> => {
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
      assert.equal(digest.digest('hex'), file.sha256, file.path)
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

const start = Date.now()
const bounds = await assertUpgradeBounds({ maxRuntimeSeconds: 600 })
assert.ok(bounds.unit.endsWith('.service'))
const fixturePath = path.join(run, 'fixture.json')
const fixtureBytes = await bytesAt(fixturePath)
const fixture = JSON.parse(fixtureBytes.toString()) as {
  contract: FilePin
  sourceImage: FilePin
}
assert.deepEqual(Object.keys(fixture).sort(), ['contract', 'sourceImage'])
assert.equal(fixture.contract.path, path.join(run, 'experiment-contract.json'))
assert.equal(fixture.sourceImage.path, path.join(run, profile.sourceFilename))
if (appleProfile) {
  assert.deepEqual(fixture.sourceImage, {
    byteSize: 144_401,
    path: path.join(run, 'apple-mug-source.png'),
    sha256: 'db013bc05f95c01b6a4cc5442560fe1d31b37876d834cc4061d33580fbb26af7',
  })
}
for (const descriptor of Object.values(fixture)) {
  await verifyFixtureFile(descriptor)
}
const contractBytes = await bytesAt(fixture.contract.path)
assert.equal(contractBytes.length, fixture.contract.byteSize)
assert.equal(sha(contractBytes), fixture.contract.sha256)
const contract = JSON.parse(contractBytes.toString())
if (appleProfile) {
  assert.equal(contract.iccSha256, IGS_SRGB_ICC_SHA256)
  assert.equal(
    contract.sourceRgbaSha256,
    'b0a5c5733d2cf3b294bf9901b462fe35b4d4ba6bcdd30df549e6e129a4d9507b',
  )
}
const revision = (cwd: string) =>
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8', timeout: 10_000 }).trim()
const applicationRevision = revision(repository)
const invokeRevision = revision(invokeRepository)
assert.deepEqual(
  [
    contract.schema,
    contract.applicationBase,
    contract.invokeRevision,
    contract.nativeRequestCeiling,
  ],
  [profile.schema, applicationRevision, invokeRevision, cases.length],
)
assert.deepEqual(
  [
    contract.globalPositive,
    contract.globalNegative,
    contract.regionalPositive,
    contract.regionalNegative,
    contract.seed,
  ],
  [globalPositive, globalNegative, regionalPositive, regionalNegative, seed],
)
assert.deepEqual(contract.cases, cases)
assert.deepEqual(contract.geometry, bbox)
assert.deepEqual(contract.sampling, sampling)
assert.deepEqual(contract.sourceImage, fixture.sourceImage)

const install = await readEngine([
  'anima-img2img',
  'anima-flow-sampling',
  'anima-prompt-weighting',
  'anima-regional-txt2img-v1',
  'anima-regional-img2img-v1',
  'anima-regional-negative-v1',
  'anima-regional-sampling-v1',
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
const ownerFiles = [
  'scripts/qualify-installed-anima-negative-visual.mts',
  'scripts/qualify-installed-reference-img-utility.mts',
  'src/main/projects/test-fixtures/anima-regional-input.ts',
  'src/main/projects/project-current-canvas-anima-regional-input.ts',
  'src/main/projects/anima-generation-request.ts',
  'src/shared/projects/anima-euler-plan.ts',
  'src/shared/projects/anima-sampling-plan.ts',
  'worker-python/src/imagegen_worker/anima_regional.py',
]
const invokeFiles = [
  'invokeai/frontend/webv1/src/features/nodes/util/graph/generation/buildAnimaGraph.ts',
  'invokeai/frontend/webv1/src/features/nodes/util/graph/generation/addImageToImage.ts',
  'invokeai/frontend/webv2/src/features/generation/core/canvas/addRegionalGuidance.ts',
  'invokeai/app/invocations/anima/anima_denoise.py',
  'invokeai/backend/anima/scheduler_driver.py',
  'invokeai/backend/anima/regional_prompting.py',
  'invokeai/backend/anima/anima_transformer_patch.py',
  'invokeai/backend/flux/schedulers.py',
]
const sourceWitness = (root: string, names: string[]) =>
  Promise.all(
    names.map(async (name) => ({
      name,
      sha256: sha(await bytesAt(path.join(root, name))),
    })),
  )
const source = await sourceWitness(repository, ownerFiles)
const invokeSource = await sourceWitness(invokeRepository, invokeFiles)
await write('native-start.json', {
  applicationRevision,
  bootstrapStorage,
  bounds,
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
const observations: unknown[] = []
const outputPins: FilePin[] = []
let failure: unknown
try {
  await produceAnimaRegionalNegativeVisualProbe({
    pythonExecutable: install.pythonExecutable,
    run,
    runtimeRoot: install.runtimeDir,
    sourceImage: fixture.sourceImage,
    trainedBundle,
    async useCase({ case: testCase, compiledPrompts, models, prepared, recipe }) {
      assert.deepEqual(testCase, cases[attempted])
      assert.equal(prepared.context.mode, 'img2img')
      assert.deepEqual(prepared.context.bbox, bbox)
      assert.equal(prepared.context.target.iccSha256, IGS_SRGB_ICC_SHA256)
      targetSha ??= sha(prepared.targetPngBytes)
      assert.equal(sha(prepared.targetPngBytes), targetSha)
      assert.equal(prepared.context.target.sha256, targetSha)
      assert.equal(recipe.family, 'anima')
      assert.deepEqual(
        recipe.regions.map(({ regionId: id }) => id),
        [regionId('left'), regionId('right')],
      )
      const negatives = compiledPrompts.filter(({ polarity }) => polarity === 'negative')
      const positives = compiledPrompts.filter(({ polarity }) => polarity === 'positive')
      assert.deepEqual(
        positives.map(({ prompt, sourceId, text }) => [sourceId, text, prompt]),
        [
          ['current-canvas', globalPositive, literalPrompt(globalPositive)],
          ...(['left', 'right'] as const).map((side) => [
            regionId(side),
            regionalPositive,
            literalPrompt(regionalPositive),
          ]),
        ],
      )
      const [global, ...local] = negatives
      assert.deepEqual(global, {
        polarity: 'negative',
        prompt: {
          cleanedText: 'blur , noise',
          spans: [
            { end: 4, start: 0, weight: 0.75 },
            { end: 12, start: 4, weight: 1 },
          ],
          version: 'anima-prompt-weighting-v1',
        },
        sourceId: 'current-canvas',
        text: globalNegative,
      })
      assert.deepEqual(
        local,
        testCase.negativeSide === null
          ? []
          : [
              {
                polarity: 'negative',
                prompt: literalPrompt(
                  profile.regionalNegativeCleaned,
                  profile.regionalNegativeWeight,
                ),
                sourceId: regionId(testCase.negativeSide),
                text: regionalNegative,
              },
            ],
      )
      for (const [index, region] of recipe.regions.entries()) {
        const side = index === 0 ? 'left' : 'right'
        assert.equal(region.negative.source, 'regional')
        assert.equal(
          region.negative.prompt.text,
          testCase.negativeSide === side ? regionalNegative : '',
        )
        assert.equal(region.coverage.alpha.length, 512 ** 2)
        assert.ok(
          region.coverage.alpha.every(
            (value, offset) => value === (offset % 512 < 256 === (side === 'left') ? 255 : 0),
          ),
        )
      }

      assert.deepEqual(await idle(), bootstrapStorage)
      await assertSourceFiles(liveSourceFiles)
      const previousChildren = new Set(await children())
      const remaining = 600_000 - (Date.now() - start)
      assert.ok(remaining > 0)
      attempted++
      const progress: GenerationDenoisingProgress[] = []
      let client: GenerationWorkerClient | undefined
      let owner: Awaited<ReturnType<typeof captureInferenceWorkerOwner>> | undefined
      let stopGpu: ReturnType<typeof observeGpu> | undefined
      let output: FilePin | undefined
      let physicalExit = false
      let caseError: unknown
      try {
        client = await GenerationWorkerClient.start(
          {
            pythonExecutable: install.pythonExecutable,
            runtimeRoot: install.runtimeDir,
            scratchBasePath,
          },
          {
            environment: {
              HF_DATASETS_OFFLINE: '1',
              HF_HOME: hfHome,
              IGS_SDXL_CONFIG_DIR: install.configDir,
              LANG: 'C.UTF-8',
              LC_ALL: 'C.UTF-8',
              TMPDIR: scratchBasePath,
            },
            requestTimeoutMs: remaining,
            startupTimeoutMs: Math.min(120_000, remaining),
          },
        )
        const active = client
        assert.deepEqual(active.ready, install.ready)
        const created = (await children()).filter((pid) => !previousChildren.has(pid))
        assert.equal(created.length, 1)
        owner = await captureInferenceWorkerOwner(created[0])
        const proc = `/proc/${owner.worker.pid}`
        assert.equal(await realpath(`${proc}/exe`), install.exactPython)
        assert.equal(await realpath(`${proc}/cwd`), install.runtimeDir)
        assert.equal((await readFile(`${proc}/cgroup`, 'utf8')).trim(), `0::${bounds.group}`)
        const batch = prepareAnimaGenerationBatch({ iterations: 1, prepared })
        output = await withAnimaGenerationBatchRequests({
          modelService: models,
          prepared: batch,
          ready: active.ready,
          scratchBasePath,
          async use(requests) {
            assert.equal(requests.length, 1)
            const [request] = requests
            const {
              beginIndex,
              guidanceScale,
              posteriorSeed,
              scheduler,
              seed: actualSeed,
              startStep,
              steps,
              strength,
              totalSteps,
            } = request.job.sampling
            assert.equal(request.type, 'generate-anima-img2img')
            assert.deepEqual(
              [
                beginIndex,
                guidanceScale,
                posteriorSeed,
                scheduler,
                actualSeed,
                startStep,
                steps,
                strength,
                totalSteps,
              ],
              [
                profile.beginIndex,
                4,
                (seed ^ 0x9e_37_79_b9) >>> 0,
                'heun',
                seed,
                profile.startStep,
                20,
                profile.denoisingStrength,
                expectedActualSteps,
              ],
            )
            assert.deepEqual(request.job.prompts, {
              negative: global.prompt,
              positive: positives[0].prompt,
            })
            assert.equal(request.job.target.sha256, targetSha)
            assert.deepEqual(request.job.model, {
              architecture: 'anima-base-1.0',
              ...trainedBundle,
            })
            assert.deepEqual(request.job.loras, [])
            await write(`${testCase.label}.request.json`, {
              case: testCase,
              compiledPrompts,
              owner,
              regions: recipe.regions.map(({ coverage, ...region }) => ({
                ...region,
                alphaSha256: sha(Buffer.from(coverage.alpha)),
              })),
              request,
            })
            stopGpu = observeGpu(owner!.worker.pid)
            submitted++
            const result = await active.executeCurrentCanvasRegional(
              {
                compiledPrompts: [...compiledPrompts],
                compositionProfile: ANIMA_REGIONAL_COMPOSITION_PROFILE,
                promptInterpretation: ANIMA_PROMPT_INTERPRETATION,
                recipe,
                request,
              },
              (value) => {
                assert.deepEqual(value, {
                  step: progress.length + 1,
                  totalSteps: expectedActualSteps,
                })
                progress.push(value)
              },
            )
            assert.equal(result.seed, seed)
            assert.equal(result.output.height, bbox.height)
            assert.equal(result.output.width, bbox.width)
            assert.equal(result.output.iccSha256, IGS_SRGB_ICC_SHA256)
            assert.equal(result.pngBytes.length, result.output.byteSize)
            assert.equal(sha(result.pngBytes), result.output.sha256)
            const filename = path.join(outputRoot, `${testCase.label}.png`)
            await writeFile(filename, result.pngBytes, { flag: 'wx', mode: 0o600 })
            assert.equal(progress.length, expectedActualSteps)
            return {
              byteSize: result.output.byteSize,
              path: filename,
              sha256: result.output.sha256,
            }
          },
        })
        outputPins.push(output)
        return output
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
      }
    },
  })
  assert.equal(submitted, cases.length)
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
  assert.deepEqual(await sourceWitness(invokeRepository, invokeFiles), invokeSource)
  assert.equal(revision(repository), applicationRevision)
  assert.equal(revision(invokeRepository), invokeRevision)
  assert.deepEqual(await bytesAt(fixturePath), fixtureBytes)
  for (const descriptor of Object.values(fixture)) {
    await verifyFixtureFile(descriptor)
  }
  for (const pin of outputPins) {
    await verifyFixtureFile(pin)
  }
} catch (error) {
  preservationError = error
}
const memoryRoot = path.join('/sys/fs/cgroup', bounds.group)
const memory = Object.fromEntries(
  await Promise.all(
    ['memory.peak', 'memory.events', 'memory.stat'].map(async (name) => [
      name,
      (await readFile(path.join(memoryRoot, name), 'utf8')).trim(),
    ]),
  ),
)
assert.match(memory['memory.events'], /^oom_kill 0$/m)
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
  scheduledSteps: expectedActualSteps,
  signedConfigPins: install.configs.length,
  submitted,
  targetSha,
  visualStatus: 'pending',
})
if (failure || preservationError) {
  throw failure ?? preservationError
}
