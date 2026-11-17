import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'

import { withRegionalReferenceCapacityProject } from '../src/main/projects/test-fixtures/regional-reference-capacity-project.js'
import { InferenceAuxiliaryResources } from '../src/main/runtime/inference-auxiliary-resources.js'
import {
  REGIONAL_REFERENCE_ADAPTER_ARTIFACT,
  REGIONAL_REFERENCE_VISION_CONFIG_ARTIFACT,
  REGIONAL_REFERENCE_VISION_DIRECTORY,
  REGIONAL_REFERENCE_VISION_MODEL_ARTIFACT,
} from '../src/main/runtime/regional-reference-manifest.js'
import { runRegionalReferenceCapacityMain } from './fixtures/regional-reference-capacity-main.js'
import {
  artifactRoot,
  assertRuntimeIdle,
  assertUpgradeBounds,
  bytesAt,
  errorText,
  type FilePin,
  observeGpu,
  readEngine,
  regular,
  sha,
  verify,
  writeJson,
} from './qualify-installed-reference-img-utility.mjs'

const repository = path.resolve(import.meta.dirname, '..')
const [flag, run, ...extra] = process.argv.slice(2)
assert.equal(flag, '--run')
assert.ok(run && !extra.length)
assert.equal(path.dirname(run), path.join(artifactRoot, 'runs/regional-reference-capacity'))
assert.match(path.basename(run), /^20261118-r[1-9]\d*$/)
assert.equal(await realpath(run), run)
assert.equal(await realpath(path.join(run, 'payloads')), path.join(run, 'payloads'))

const fixturePath = path.join(run, 'fixture.json')
const fixtureBytes = await bytesAt(fixturePath)
const fixture = JSON.parse(fixtureBytes.toString()) as {
  applicationBase: string
  geometry: object
  invokeRevision: string
  model: { byteSize: number; name: string; sha256: string }
  referenceImages: readonly [FilePin, FilePin, FilePin, FilePin]
  sampling: object
  schema: string
  sourceImage: FilePin
}
const revision = (cwd: string) =>
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8', timeout: 10_000 }).trim()
const invoke = path.resolve(repository, '../sources/InvokeAI')
assert.equal(fixture.schema, 'regional-reference-capacity-v1')
assert.equal(revision(repository), fixture.applicationBase)
assert.equal(revision(invoke), fixture.invokeRevision)
assert.equal(fixture.invokeRevision, '4875d96531ca6712b288f6e660fcbb34143408c1')
assert.equal(
  execFileSync('git', ['status', '--porcelain=v1'], { cwd: invoke, encoding: 'utf8' }).trim(),
  '',
)
assert.deepEqual(fixture.geometry, {
  bounds: [0, 128, 320, 512],
  height: 512,
  width: 512,
  x: 0,
  y: 0,
})
assert.deepEqual(fixture.sampling, {
  cfgRescale: 0,
  cfgScale: 5,
  expectedProgress: 16,
  sampler: 'Euler',
  scheduler: 'Normal',
  seed: 123,
  steps: 30,
  strength: 0.5,
  vaePrecision: 'FP16',
})
assert.deepEqual(fixture.model, {
  byteSize: 6_938_040_760,
  name: 'Illustrious XL v0.1',
  sha256: '3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9',
})
const imagePins = [fixture.sourceImage, ...fixture.referenceImages]
assert.equal(fixture.referenceImages.length, 4)
assert.equal(new Set(fixture.referenceImages.map((image) => image.sha256)).size, 4)
assert.equal(
  fixture.referenceImages.slice(0, 3).reduce((sum, image) => sum + image.byteSize, 0),
  14_750,
)
for (const pin of imagePins) {
  assert.ok(
    pin.byteSize < 1024 ** 2 && pin.path.startsWith(path.join(artifactRoot, 'runs') + path.sep),
  )
  await verify({ path: pin.path, sha256: pin.sha256, sizeBytes: pin.byteSize })
}

const bounds = await assertUpgradeBounds({ maxRuntimeSeconds: 600 })
assert.ok(bounds.unit.endsWith('.service'))
const install = await readEngine()
const enginePins = [...install.pinned, ...install.configs]
for (const pin of enginePins) {
  await verify(pin)
}
const assertIdle = () => assertRuntimeIdle(install.appDataDir, install.basePrefix)
await assertIdle()
const auxiliaryRoot = path.join(
  artifactRoot,
  'shared/regional-public-worker-014-20261103/data/imagegen-studio/inference-resources',
)
const resources = new InferenceAuxiliaryResources(auxiliaryRoot)
const auxiliaryFiles = [
  path.join(auxiliaryRoot, REGIONAL_REFERENCE_ADAPTER_ARTIFACT.filename),
  path.join(
    auxiliaryRoot,
    REGIONAL_REFERENCE_VISION_DIRECTORY,
    REGIONAL_REFERENCE_VISION_CONFIG_ARTIFACT.filename,
  ),
  path.join(
    auxiliaryRoot,
    REGIONAL_REFERENCE_VISION_DIRECTORY,
    REGIONAL_REFERENCE_VISION_MODEL_ARTIFACT.filename,
  ),
]
const auxiliaryIdentity = () =>
  Promise.all(auxiliaryFiles.map(async (file) => ({ file, stat: await regular(file) })))
const auxiliaryBefore = await auxiliaryIdentity()
const modelPath = path.join(
  artifactRoot,
  'shared/illustrious-epsilon-source-20261026/Illustrious-XL-v0.1.safetensors',
)
const modelBefore = await regular(modelPath)
assert.equal(modelBefore.size, fixture.model.byteSize)

const sources = [
  'scripts/qualify-installed-reference-capacity.mts',
  'scripts/qualify-installed-reference-img-utility.mts',
  'scripts/fixtures/regional-reference-capacity-main.ts',
  'src/main/projects/test-fixtures/regional-reference-capacity-project.ts',
  'src/main/projects/generation-action-controller.ts',
  'src/main/projects/project-regional-generation-coordinator.ts',
  'src/shared/projects/regional-invoke-generation.ts',
]
const sourceWitness = () =>
  Promise.all(
    sources.map(async (name) => ({
      name,
      sha256: sha(await bytesAt(path.join(repository, name))),
    })),
  )
const before = await sourceWitness()
const controller = {
  pid: process.pid,
  startTicks: (await readFile('/proc/self/stat', 'utf8')).split(') ').at(-1)!.split(' ')[19],
}
await writeJson(
  'native-start.json',
  {
    auxiliaryBefore,
    bounds,
    controller,
    fixture,
    fixtureSha256: sha(fixtureBytes),
    installation: install,
    modelBefore,
    source: before,
  },
  run,
)

const nativeRoot = path.join(run, 'native')
await mkdir(nativeRoot, { mode: 0o700 })
let actual: unknown
let failure: unknown
try {
  actual = await withRegionalReferenceCapacityProject({
    install,
    referenceImages: fixture.referenceImages,
    run,
    sourceImage: fixture.sourceImage,
    use: (context) =>
      runRegionalReferenceCapacityMain(context, {
        assertIdle,
        install,
        observeGpu,
        resources,
        run,
      }),
  })
} catch (error) {
  failure = error
}
let preservation: unknown
try {
  await assertIdle()
  assert.deepEqual(await sourceWitness(), before)
  assert.equal(sha(await bytesAt(fixturePath)), sha(fixtureBytes))
  assert.deepEqual(await regular(modelPath), modelBefore)
  assert.deepEqual(await auxiliaryIdentity(), auxiliaryBefore)
  for (const pin of enginePins) {
    await verify(pin)
  }
  for (const pin of imagePins) {
    await verify({ path: pin.path, sha256: pin.sha256, sizeBytes: pin.byteSize })
  }
} catch (error) {
  preservation = error
}
const cgroup = path.join('/sys/fs/cgroup', bounds.group)
const memory = Object.fromEntries(
  await Promise.all(
    ['memory.peak', 'memory.events', 'memory.stat', 'memory.swap.max'].map(
      async (name) => [name, (await readFile(path.join(cgroup, name), 'utf8')).trim()] as const,
    ),
  ),
)
assert.match(memory['memory.events'], /^oom_kill 0$/m)
await writeJson(
  'native-report.json',
  {
    actual,
    bounds,
    controller,
    enginePins: install.pinned.length,
    failure: failure && errorText(failure),
    memory,
    outcome: failure || preservation ? 'FAIL' : 'PASS',
    preservation: preservation && errorText(preservation),
    runtimeId: install.runtimeId,
    signedConfigPins: install.configs.length,
  },
  run,
)
if (failure || preservation) {
  throw failure ?? preservation
}
