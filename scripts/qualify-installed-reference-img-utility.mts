import { IGS_SRGB_ICC_SHA256 } from '../src/shared/projects/color-profile.js'
import type { GenerationDenoisingProgress } from '../src/shared/projects/generation-progress.js'
import { defaultIllustriousNoiseProfile } from '../src/shared/projects/illustrious-noise-profile.js'
import type { QualifiedInferenceWorkerReady } from '../src/shared/projects/inference-worker-capabilities.js'
import { regionalReferenceProfileForMode } from '../src/shared/projects/regional-reference-inference.js'

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readFile, realpath, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'

import { GenerationWorkerClient } from '../src/main/projects/generation-worker-client.js'
import {
  type IllustriousImg2ImgRequestV1,
  withIllustriousGenerationRequest,
} from '../src/main/projects/illustrious-txt2img-job.js'
import { captureInferenceWorkerOwner } from '../src/main/projects/inference-worker-ownership.js'
import {
  produceReferenceImgUtilityProbe,
  produceReferencePlacementProbe,
  REFERENCE_PLACEMENT_CASES,
  REFERENCE_PLACEMENT_MASKS,
  REFERENCE_PLACEMENT_POSITIVE,
  REFERENCE_PLACEMENT_ROOT,
  type ReferenceImgUtilityUseCase,
} from '../src/main/projects/test-fixtures/regional-guidance-character-visual-probe.js'
import { readSmartPatchModelSourceOutput } from '../src/main/projects/worker-client.js'
import { InferenceAuxiliaryResources } from '../src/main/runtime/inference-auxiliary-resources.js'

export interface FilePin {
  byteSize: number
  path: string
  sha256: string
}
interface ReportPin extends Omit<FilePin, 'byteSize'> {
  sizeBytes: number
}
interface Fixture {
  contract: FilePin
  referenceImages: Record<'A' | 'B', FilePin>
  sourceImage: FilePin
}
interface Release {
  activatedPointer: { pythonExecutable: string; runtimeId: string; schemaVersion: 1 }
  assembledSlots: { runtimeId: string }[]
  inferenceStarts: { exitConfirmed: boolean; ready: QualifiedInferenceWorkerReady | null }[]
  installationProvenance: { path: string; sha256: string; value: { manifestSha256: string } }
  installedInspection: {
    basePrefix: string
    workerFiles: Record<string, { bytes: number; sha256: string }>
    workerRoot: string
  }
  outcome: string
  qualification: string
  reopenedStatus: { kind: string; profile: string; runtimeId: string }
  roots: { appDataDir: string; pointerFile: string; runtimeDir: string }
  signedRelease: {
    manifest: { configPath: string; files: (ReportPin & { kind: string })[] }
    manifestSha256: string
  }
}
interface NativeReport {
  outcome: string
  packagedInstalledRuntime: { runtimeId: string; unchangedInputs: ReportPin[] }
}
interface Bounds {
  group: string
  memoryMax: string
  runtimeMaxSeconds: number
  swapMax: string
  unit: string
}
type Owner = Awaited<ReturnType<typeof captureInferenceWorkerOwner>>
type PlacementUseCase = Parameters<
  Parameters<typeof produceReferencePlacementProbe>[0]['useCase']
>[0]
type ProbeUseCase = PlacementUseCase | ReferenceImgUtilityUseCase

const helperUrl = new URL('./upgrade-qualification-worker.mjs', import.meta.url)
const { assertRuntimeIdle, assertUpgradeBounds } = (await import(helperUrl.href)) as {
  assertRuntimeIdle: (appData: string, basePrefix: string) => Promise<unknown>
  assertUpgradeBounds: (options: { maxRuntimeSeconds: number }) => Promise<Bounds>
}
const execute = promisify(execFile)
const repository = path.resolve(import.meta.dirname, '..')
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const runRoot = path.join(artifactRoot, 'runs/regional-reference-img-utility')
const run = process.argv[3] ?? ''
const engineRun = path.join(artifactRoot, 'runs/packaged-installed-engine/20261118')
const referenceRun = path.join(artifactRoot, 'runs/regional-reference-utility/20261111-fixed-cat')
const resourcesRoot = path.join(
  artifactRoot,
  'shared/regional-public-worker-014-20261103/data/imagegen-studio/inference-resources',
)
const checkpoint = path.join(
  artifactRoot,
  'shared/illustrious-epsilon-source-20261026/Illustrious-XL-v0.1.safetensors',
)
const checkpointSha = '3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9'
const checkpointBytes = 6_938_040_760
const utilityPositive =
  'a simple illustration of one cat head, front view, two pointed ears, two eyes, plain light background'
const bbox = { height: 512, width: 512, x: 0, y: 0 }
const utilityCases = [
  { image: null, label: 'ordinary', outside: false, seed: 123 },
  { image: 'A', label: 'reference-a', outside: false, seed: 123 },
  { image: 'B', label: 'reference-b', outside: false, seed: 123 },
] as const
// Euler Normal uses the leading step-33 grid offset by one. The IMG cutoff of 500 drops
// fourteen steps with timesteps >=500 from the authored thirty.
const deadlineMs = Date.now() + 600_000
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const errorText = (error: unknown) => (error instanceof Error ? error.stack : String(error))

async function regular(filename: string) {
  assert.ok(path.isAbsolute(filename) && path.normalize(filename) === filename, filename)
  assert.equal(await realpath(filename), filename)
  const stat = await lstat(filename, { bigint: true })
  assert.ok(stat.isFile() && stat.size > 0n, filename)
  return {
    ctime: String(stat.ctimeNs),
    dev: String(stat.dev),
    ino: String(stat.ino),
    mode: String(stat.mode),
    mtime: String(stat.mtimeNs),
    nlink: String(stat.nlink),
    size: Number(stat.size),
  }
}

async function bytesAt(filename: string, maximum = 8 * 1024 ** 2): Promise<Buffer> {
  const before = await regular(filename)
  assert.ok(before.size <= maximum, filename)
  const file = await open(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const stat = await file.stat({ bigint: true })
    assert.equal(String(stat.dev), before.dev)
    assert.equal(String(stat.ino), before.ino)
    const bytes = await file.readFile()
    assert.equal(bytes.length, before.size)
    assert.deepEqual(await regular(filename), before)
    return bytes
  } finally {
    await file.close()
  }
}

async function verify(pin: ReportPin) {
  assert.ok(Number.isSafeInteger(pin.sizeBytes) && pin.sizeBytes > 0)
  assert.match(pin.sha256, /^[a-f0-9]{64}$/)
  const bytes = await bytesAt(pin.path, 32 * 1024 ** 2)
  assert.equal(bytes.length, pin.sizeBytes, pin.path)
  assert.equal(sha(bytes), pin.sha256, pin.path)
}

async function verifyFixtureFile(pin: FilePin) {
  await verify({ ...pin, sizeBytes: pin.byteSize })
}

async function writeJson(name: string, value: unknown, directory = run) {
  await writeFile(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  })
}

async function readEngine(
  requiredCapabilities: readonly string[] = [
    'illustrious-img2img',
    'illustrious-regional-img2img-v1',
    'illustrious-regional-reference-img2img-v1',
    'illustrious-regional-progress-v1',
    'linux-owned-inference-v1',
  ],
) {
  const releasePath = path.join(engineRun, 'installed-engine.json')
  const priorPath = path.join(engineRun, 'native/report.json')
  const releaseBytes = await bytesAt(releasePath)
  // This retained installer receipt is the same root of truth consumed by packaged smoke.
  assert.equal(
    sha(releaseBytes),
    '7380c4246e76c4acd9107422caf92755677d5bc96e98a21be6ddd092e885c09b',
  )
  const release = JSON.parse(releaseBytes.toString()) as Release
  const priorBytes = await bytesAt(priorPath)
  assert.equal(sha(priorBytes), 'f08e0b2d2e44afbb719ae2dc4104a17da239a1fac7bc3477088fe94e1fdcae49')
  const prior = JSON.parse(priorBytes.toString()) as NativeReport
  assert.equal(release.outcome, 'PASS')
  assert.equal(release.qualification, 'actual-signed-full-engine-install-native-qualification')
  assert.equal(prior.outcome, 'PASS')
  const { appDataDir, pointerFile, runtimeDir } = release.roots
  assert.equal(
    appDataDir,
    path.join(engineRun, 'payloads/native-runtime-offline-VzNDka/data/imagegen-studio'),
  )
  assert.equal(await realpath(appDataDir), appDataDir)
  assert.equal(runtimeDir, path.join(appDataDir, 'runtime'))
  assert.equal(pointerFile, path.join(runtimeDir, 'current-runtime.json'))
  const { pythonExecutable, runtimeId } = release.activatedPointer
  const environment = path.join(runtimeDir, 'environments', runtimeId)
  const basePrefix = path.join(runtimeDir, 'python', runtimeId)
  const exactPython = path.join(basePrefix, 'bin/python3.12')
  assert.equal(release.installedInspection.basePrefix, basePrefix)
  assert.equal(pythonExecutable, path.join(environment, 'bin/python'))
  assert.equal(await realpath(pythonExecutable), exactPython)
  const configDir = path.join(environment, 'resources/sdxl-config')
  const workerRoot = path.join(environment, 'lib/python3.12/site-packages/imagegen_worker')
  assert.equal(release.installedInspection.workerRoot, workerRoot)
  const provenance = path.join(environment, 'runtime-installation.json')
  assert.equal(release.installationProvenance.path, provenance)
  assert.equal(
    release.installationProvenance.value.manifestSha256,
    release.signedRelease.manifestSha256,
  )
  assert.deepEqual(JSON.parse((await bytesAt(pointerFile)).toString()), release.activatedPointer)
  assert.deepEqual(
    release.assembledSlots.map((slot) => slot.runtimeId),
    [runtimeId],
  )
  assert.equal(prior.packagedInstalledRuntime.runtimeId, runtimeId)
  assert.equal(release.reopenedStatus.kind, 'ready')
  assert.equal(release.reopenedStatus.profile, 'linux-nvidia')
  assert.equal(release.reopenedStatus.runtimeId, runtimeId)
  const workerFiles = Object.entries(release.installedInspection.workerFiles)
  assert.equal(workerFiles.length, 73)
  const supplied = prior.packagedInstalledRuntime.unchangedInputs
  const pointer = supplied.find((entry) => entry.path === pointerFile)
  assert.ok(pointer)
  const provenanceBytes = await bytesAt(provenance)
  assert.equal(sha(provenanceBytes), release.installationProvenance.sha256)
  const manifest = release.signedRelease.manifest
  const python = manifest.files.find((entry) => entry.path === 'python/bin/python3.12')
  assert.equal(python?.kind, 'file')
  assert.ok(python)
  const pinned: ReportPin[] = [
    { path: releasePath, sha256: sha(releaseBytes), sizeBytes: releaseBytes.length },
    pointer,
    {
      path: provenance,
      sha256: release.installationProvenance.sha256,
      sizeBytes: provenanceBytes.length,
    },
    ...workerFiles.map(([member, item]) => ({
      path: path.join(workerRoot, member),
      sha256: item.sha256,
      sizeBytes: item.bytes,
    })),
  ]
  const byPath = (a: ReportPin, b: ReportPin) => a.path.localeCompare(b.path)
  assert.deepEqual([...supplied].sort(byPath), [...pinned].sort(byPath))
  pinned.push({ ...python, path: exactPython })
  assert.equal(new Set(pinned.map((pin) => pin.path)).size, 77)
  const configs = manifest.files
    .filter((entry) => entry.kind === 'file' && entry.path.startsWith(`${manifest.configPath}/`))
    .map(({ path: member, sha256, sizeBytes }) => ({
      path: path.join(configDir, path.relative(manifest.configPath, member)),
      sha256,
      sizeBytes,
    }))
  assert.equal(configs.length, 17)
  const active = release.inferenceStarts.filter((start) => start.ready && start.exitConfirmed)
  assert.ok(active.length > 0)
  const ready = active[0].ready!
  for (const capability of requiredCapabilities) {
    assert.ok(ready.capabilities.includes(capability), capability)
  }
  return {
    appDataDir,
    basePrefix,
    configDir,
    configs,
    exactPython,
    pinned,
    pythonExecutable,
    ready,
    runtimeDir,
    runtimeId,
    status: release.reopenedStatus,
  }
}

async function runtimeIdle(engine: Awaited<ReturnType<typeof readEngine>>) {
  const mountpoint = path.join(path.dirname(path.dirname(engine.pythonExecutable)), 'bootstrap')
  const mount = await execute(
    'findmnt',
    ['--json', '--mountpoint', mountpoint, '--output', 'TARGET,FSTYPE,SOURCE'],
    { timeout: 10_000 },
  ).catch((error: { code?: number; stderr?: string }) => {
    if (error.code === 1 && error.stderr === '') {
      return null
    }
    throw error
  })
  if (!mount) {
    await assertRuntimeIdle(engine.appDataDir, engine.basePrefix)
    return null
  }
  assert.deepEqual(JSON.parse(mount.stdout).filesystems, [
    { fstype: 'fuse.fuse-overlayfs', source: 'fuse-overlayfs', target: mountpoint },
  ])
  const unit = 'imagegen-qualification-view@bootstrap.service'
  const { stdout } = await execute(
    'systemctl',
    ['--user', 'show', unit, '--property=MainPID,ControlGroup,ActiveState'],
    { timeout: 10_000 },
  )
  const fields = Object.fromEntries(
    stdout
      .trim()
      .split('\n')
      .map((line) => line.split('=')),
  )
  assert.equal(fields.ActiveState, 'active')
  assert.match(fields.MainPID, /^[1-9]\d*$/)
  assert.equal(path.basename(fields.ControlGroup), unit)
  const proc = `/proc/${fields.MainPID}`
  const startTime = async () => {
    const stat = await readFile(`${proc}/stat`, 'utf8')
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]
  }
  const start = await startTime()
  assert.equal((await lstat(proc)).uid, process.getuid?.())
  assert.equal(await realpath(`${proc}/exe`), '/usr/bin/fuse-overlayfs')
  assert.equal(await realpath(`${proc}/cwd`), '/')
  assert.equal((await readFile(`${proc}/cgroup`, 'utf8')).trim(), `0::${fields.ControlGroup}`)
  const cmdline = await readFile(`${proc}/cmdline`, 'utf8')
  const parts = cmdline.split('\0')
  assert.equal(parts.length, 6)
  assert.match(parts[3], /^lowerdir=.+,upperdir=.+,workdir=.+$/)
  assert.deepEqual(parts, ['fuse-overlayfs', '-f', '-o', parts[3], mountpoint, ''])

  // Only the verified view's mountpoint operand describes storage rather than execution.
  const scan = assertRuntimeIdle as (
    appData: string,
    python: string,
    options: { read: (file: string, encoding: 'utf8') => Promise<string> },
  ) => Promise<unknown>
  await scan(engine.appDataDir, engine.basePrefix, {
    async read(file, encoding) {
      const body = await readFile(file, encoding)
      if (file !== `${proc}/cmdline`) {
        return body
      }
      assert.equal(await startTime(), start)
      assert.equal(body, cmdline)
      return [...parts.slice(0, 4), ''].join('\0')
    },
  })
  return { mountpoint, pid: Number(fields.MainPID), start, unit }
}

async function children(): Promise<number[]> {
  const raw = (await readFile(`/proc/${process.pid}/task/${process.pid}/children`, 'utf8')).trim()
  return raw ? raw.split(/\s+/).map(Number) : []
}

async function workerExited(owner: Owner) {
  const filename = `/proc/${owner.worker.pid}/stat`
  try {
    const stat = await readFile(filename, 'utf8')
    assert.notEqual(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19], owner.worker.startTicks)
  } catch (error) {
    if (!['ENOENT', 'ESRCH'].includes((error as NodeJS.ErrnoException).code ?? '')) {
      throw error
    }
  }
}

function observeGpu(pid: number) {
  const stop = new AbortController()
  let maximumMiB: number | null = null
  let samples = 0
  const observing = (async () => {
    while (!stop.signal.aborted) {
      const { stdout } = await execute(
        '/usr/bin/nvidia-smi',
        ['--query-compute-apps=pid,used_gpu_memory', '--format=csv,noheader,nounits'],
        { timeout: 2000 },
      )
      for (const line of stdout.split('\n')) {
        const [candidate, mib] = line.split(',').map((value) => Number(value.trim()))
        if (candidate === pid && Number.isSafeInteger(mib) && mib > 0) {
          maximumMiB = Math.max(maximumMiB ?? 0, mib)
          samples++
        }
      }
      await delay(1000, undefined, { signal: stop.signal }).catch((error: Error) => {
        if (error.name !== 'AbortError') {
          throw error
        }
      })
    }
  })().then(() => null, errorText)
  return async () => {
    stop.abort()
    return { error: await observing, maximumMiB, samples }
  }
}

function placementMasks(input: ProbeUseCase, left: 'A' | 'B', fixture: Fixture) {
  const keys = left === 'A' ? (['A', 'B'] as const) : (['B', 'A'] as const)
  const images = input.references?.images
  assert.equal(images?.length, keys.length)
  assert.equal(input.recipe.regions.length, keys.length)
  assert.equal(new Set(input.recipe.regions.map(({ regionId }) => regionId)).size, keys.length)
  assert.equal(new Set(input.recipe.regions.map(({ maskId }) => maskId)).size, keys.length)
  assert.equal(new Set(images?.map(({ referenceId }) => referenceId)).size, keys.length)
  return input.recipe.regions.map((region, index) => {
    const mask = REFERENCE_PLACEMENT_MASKS[index]
    const key = keys[index]
    const captured = images?.[index]
    const authored = region.referenceImages?.[0]
    assert.ok(mask && key && captured && authored)
    assert.equal(region.positive, null)
    assert.equal(region.negative.source, 'regional')
    assert.equal(region.negative.prompt.text, '')
    assert.equal(region.referenceImages?.length, 1)
    assert.equal(captured.regionId, region.regionId)
    assert.equal(captured.referenceId, authored.id)
    assert.equal(captured.image.byteSize, fixture.referenceImages[key].byteSize)
    assert.equal(captured.image.sha256, fixture.referenceImages[key].sha256)
    assert.equal(sha(Buffer.from(captured.image.bytes)), fixture.referenceImages[key].sha256)
    assert.equal(authored.asset.sha256, captured.image.sha256)
    assert.equal(authored.asset.bytes, captured.image.byteSize)
    assert.equal(authored.asset.width, captured.image.width)
    assert.equal(authored.asset.height, captured.image.height)
    assert.deepEqual(region.coverage.bounds, bbox)
    assert.deepEqual(region.coverage.intersection, mask)
    assert.equal(region.coverage.kind, 'covered')
    const { alpha } = region.coverage
    assert.equal(alpha.length, bbox.width * bbox.height)
    assert.ok(
      alpha.every((pixel, offset) => {
        const x = offset % bbox.width
        const y = Math.floor(offset / bbox.width)
        const covered =
          x >= mask.x && x < mask.x + mask.width && y >= mask.y && y < mask.y + mask.height
        return pixel === (covered ? 255 : 0)
      }),
    )
    return {
      alphaSha256: sha(Buffer.from(alpha)),
      bounds: mask,
      maskId: region.maskId,
      maskRevision: region.maskRevision,
      regionId: region.regionId,
    }
  })
}

function commonPlacementInput(request: IllustriousImg2ImgRequestV1) {
  const { job: _job, requestId: _requestId, ...envelope } = request
  const { output: _output, target, ...job } = request.job
  const { path: _path, ...targetContent } = target
  return { ...envelope, job: { ...job, target: targetContent } }
}

async function main() {
  assert.deepEqual(process.argv.slice(2), ['--run', run])
  const placement = path.dirname(run) === REFERENCE_PLACEMENT_ROOT
  assert.equal(path.dirname(run), placement ? REFERENCE_PLACEMENT_ROOT : runRoot)
  assert.match(path.basename(run), placement ? /^\d{8}-r[1-9]\d*$/ : /^20261118-r[1-9]\d*$/)
  const cases = placement ? REFERENCE_PLACEMENT_CASES : utilityCases
  const globalPositive = placement ? REFERENCE_PLACEMENT_POSITIVE : utilityPositive
  const denoisingStrength = placement ? 0.6 : 0.5
  const scheduledSteps = placement ? 19 : 16
  const produce = placement ? produceReferencePlacementProbe : produceReferenceImgUtilityProbe
  assert.equal(await realpath(run), run)
  const bounds = await assertUpgradeBounds({ maxRuntimeSeconds: 600 })
  assert.ok(bounds.unit.endsWith('.service'))
  const fixture = JSON.parse((await bytesAt(path.join(run, 'fixture.json'))).toString()) as Fixture
  assert.deepEqual(Object.keys(fixture).sort(), ['contract', 'referenceImages', 'sourceImage'])
  assert.deepEqual(Object.keys(fixture.referenceImages).sort(), ['A', 'B'])
  assert.equal(fixture.contract.path, path.join(run, 'experiment-contract.json'))
  assert.equal(
    fixture.sourceImage.path,
    path.join(run, placement ? 'display-source.png' : 'cat-source.png'),
  )
  for (const key of ['A', 'B'] as const) {
    assert.equal(
      fixture.referenceImages[key].path,
      path.join(placement ? run : referenceRun, `reference-${key}.png`),
    )
  }
  const fixturePins = [
    fixture.contract,
    fixture.sourceImage,
    ...Object.values(fixture.referenceImages),
  ]
  for (const pin of fixturePins) {
    await verifyFixtureFile(pin)
  }
  const contract = JSON.parse((await bytesAt(fixture.contract.path)).toString())
  assert.equal(contract.schema, placement ? 'reference-placement-v1' : 'reference-img-utility-v1')
  if (placement) {
    assert.deepEqual(contract.masks, REFERENCE_PLACEMENT_MASKS)
    assert.notEqual(fixture.referenceImages.A.sha256, fixture.referenceImages.B.sha256)
  }
  assert.equal(contract.nativeRequestCeiling, cases.length)
  assert.deepEqual(
    contract.cases,
    cases.map(({ image, label }) => ({ image, label })),
  )
  assert.deepEqual(contract.geometry, bbox)
  assert.deepEqual(contract.model, {
    bytes: checkpointBytes,
    label: 'Illustrious XL v0.1',
    sha256: checkpointSha,
  })
  assert.equal(contract.seed, 123)
  assert.equal(contract.globalPositive, globalPositive)
  assert.equal(contract.globalNegative, '')
  assert.equal(contract.iccSha256, IGS_SRGB_ICC_SHA256)
  assert.deepEqual(contract.referenceImages, fixture.referenceImages)
  assert.deepEqual(contract.sourceImage, fixture.sourceImage)
  assert.deepEqual(contract.sampling, {
    cfgRescale: 0,
    cfgScale: 5,
    denoisingStrength,
    expectedActualSteps: scheduledSteps,
    nominalSteps: 30,
    sampler: 'Euler',
    scheduler: 'Normal',
    timestepSpacing: 'leading',
    vaePrecision: 'FP16',
    zeroTerminalSNR: false,
  })
  const revision = async (directory: string) =>
    (
      await execute('git', ['-C', directory, 'rev-parse', 'HEAD'], { timeout: 10_000 })
    ).stdout.trim()
  const applicationRevision = await revision(repository)
  const invoke = path.resolve(repository, '../sources/InvokeAI')
  const invokeRevision = await revision(invoke)
  assert.equal(applicationRevision, contract.applicationBase)
  assert.equal(invokeRevision, contract.invokeRevision)
  const ownerFiles = [
    'scripts/qualify-installed-reference-img-utility.mts',
    'src/main/projects/test-fixtures/regional-guidance-character-visual-probe.ts',
  ]
  const invokeFiles = [
    'invokeai/frontend/webv2/src/features/generation/core/graph.ts',
    'invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts',
    'invokeai/frontend/webv2/src/features/generation/core/canvas/addRegionalGuidance.ts',
    'invokeai/app/invocations/sd/denoise_latents.py',
    'invokeai/app/invocations/sd/ip_adapter.py',
    'invokeai/backend/stable_diffusion/diffusion/regional_ip_data.py',
    'invokeai/backend/stable_diffusion/diffusion/shared_invokeai_diffusion.py',
  ]
  if (placement) {
    ownerFiles.push(
      'src/main/projects/project-current-canvas-regional-references.ts',
      'src/main/projects/regional-worker-request.ts',
      'worker-python/src/imagegen_worker/illustrious_regional_references.py',
      'worker-python/src/imagegen_worker/illustrious_regional_attention_adapter.py',
    )
  }
  const sourceWitness = async (root: string, files: string[]) =>
    Object.fromEntries(
      await Promise.all(
        files.map(async (name) => [name, sha(await bytesAt(path.join(root, name)))] as const),
      ),
    )
  const authoredSource = await sourceWitness(repository, ownerFiles)
  const invokeSource = placement ? await sourceWitness(invoke, invokeFiles) : undefined
  const install = await readEngine()
  const enginePins = [...install.pinned, ...install.configs]
  for (const pin of enginePins) {
    await verify(pin)
  }
  const modelBefore = await regular(checkpoint)
  assert.equal(modelBefore.size, checkpointBytes)
  const idle = () => runtimeIdle(install)
  const bootstrapStorage = await idle()
  const resourceResolver = new InferenceAuxiliaryResources(resourcesRoot)
  const resources = await resourceResolver.resolveVerifiedRegionalReferenceResources()
  const resourceEntries = Object.values(resources)
  const resourceStats = await Promise.all(
    resourceEntries.map((entry) => regular(entry.managedPath)),
  )
  const outputRoot = path.join(run, 'native-outputs')
  const scratchBasePath = path.join(run, 'native-scratch')
  const hfHome = path.join(run, 'native-hf-home')
  for (const directory of [outputRoot, scratchBasePath, hfHome]) {
    await mkdir(directory, { mode: 0o700 })
  }
  await writeJson('native-start.json', {
    bootstrapStorage,
    bounds,
    cases,
    fixture,
    installation: install,
    resources,
    scheduledSteps,
    source: {
      applicationRevision,
      files: authoredSource,
      invokeFiles: invokeSource,
      invokeRevision,
    },
  })

  let targetSha: string | undefined
  let attempted = 0
  let submitted = 0
  let placedMasks: ReturnType<typeof placementMasks> | undefined
  let controls: ReturnType<typeof commonPlacementInput> | undefined
  const observations: unknown[] = []
  let failure: unknown
  try {
    await produce({
      pythonExecutable: install.pythonExecutable,
      referenceImages: fixture.referenceImages,
      resources,
      run,
      runtimeRoot: install.runtimeDir,
      sourceImage: fixture.sourceImage,
      async useCase(input: ProbeUseCase) {
        const testCase = input.case
        assert.deepEqual(testCase, cases[attempted])
        await idle()
        assert.equal(input.prepared.context.kind, 'normal-img2img-preparation')
        assert.deepEqual(input.prepared.context.bbox, bbox)
        const currentTarget = sha(input.prepared.targetPngBytes)
        assert.equal(input.prepared.context.target.sha256, currentTarget)
        targetSha ??= currentTarget
        assert.equal(
          currentTarget,
          targetSha,
          'All cases must consume the same opaque captured target.',
        )
        assert.equal(input.recipe.regions.length, testCase.image === null ? 0 : placement ? 2 : 1)
        if (testCase.image === null) {
          assert.equal(input.references, undefined)
        } else {
          assert.equal(input.references?.profile, regionalReferenceProfileForMode('img2img'))
          if (placement) {
            const actualMasks = placementMasks(input, testCase.image, fixture)
            placedMasks ??= actualMasks
            assert.deepEqual(actualMasks, placedMasks)
          } else {
            assert.equal(input.references?.images.length, 1)
            assert.equal(input.recipe.regions[0].positive, null)
            assert.equal(input.recipe.regions[0].coverage.kind, 'covered')
            assert.ok(input.recipe.regions[0].coverage.alpha.every((pixel) => pixel === 255))
          }
        }
        const progress: GenerationDenoisingProgress[] = []
        const onProgress = (value: GenerationDenoisingProgress) => {
          assert.equal(value.totalSteps, scheduledSteps)
          assert.equal(value.step, progress.length + 1)
          progress.push({ ...value })
        }
        const beforeChildren = new Set(await children())
        const remaining = deadlineMs - Date.now()
        assert.ok(remaining > 0)
        attempted++
        let client: GenerationWorkerClient | undefined
        let owner: Owner | undefined
        let stopGpu: ReturnType<typeof observeGpu> | undefined
        let output: FilePin | undefined
        let physicalExit = false
        let caseError: unknown
        let exitError: unknown
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
                TOKENIZERS_PARALLELISM: 'false',
              },
              requestTimeoutMs: remaining,
              startupTimeoutMs: Math.min(120_000, remaining),
            },
          )
          const active = client
          assert.deepEqual(active.ready, install.ready)
          const created = (await children()).filter((pid) => !beforeChildren.has(pid))
          assert.equal(created.length, 1)
          owner = await captureInferenceWorkerOwner(created[0])
          const processPath = `/proc/${owner.worker.pid}`
          assert.equal(await realpath(`${processPath}/exe`), install.exactPython)
          assert.equal(await realpath(`${processPath}/cwd`), install.runtimeDir)
          assert.equal(
            (await readFile(`${processPath}/cgroup`, 'utf8')).trim(),
            `0::${bounds.group}`,
          )
          stopGpu = observeGpu(owner.worker.pid)

          output = await withIllustriousGenerationRequest({
            modelService: input.models,
            prepared: input.prepared,
            ready: active.ready,
            scratchBasePath,
            async use(request) {
              assert.equal(request.type, 'generate-illustrious-img2img')
              assert.deepEqual(request.job.bbox, bbox)
              assert.equal(request.job.target.sha256, targetSha)
              assert.deepEqual(request.job.checkpoint, {
                path: checkpoint,
                predictionType: 'epsilon',
                sha256: checkpointSha,
              })
              assert.equal(request.job.vaePrecision, 'FP16')
              assert.equal(request.job.sampling.seed, 123)
              assert.equal(request.job.sampling.steps, 30)
              assert.equal(request.job.sampling.cfgScale, 5)
              assert.equal(request.job.sampling.cfgRescale ?? 0, 0)
              assert.equal(request.job.sampling.denoisingStrength, denoisingStrength)
              assert.equal(request.job.sampling.scheduler, 'euler')
              assert.deepEqual(request.job.prompts, { negative: '', positive: globalPositive })
              assert.deepEqual(request.job.sampling.noiseProfile, defaultIllustriousNoiseProfile())
              assert.ok(!request.job.vae && !request.job.loras?.length)
              assert.ok(
                !request.job.embeddings?.positive.length &&
                  !request.job.embeddings?.negative.length,
              )
              if (placement) {
                const common = commonPlacementInput(request)
                if (testCase.image === null) {
                  controls = common
                } else {
                  assert.deepEqual(common, controls)
                }
              }
              await writeJson(`${testCase.label}.request.json`, {
                ...(placement && testCase.image !== null ? { masks: placedMasks } : {}),
                owner,
                recipe: input.recipe,
                references: input.references?.images.map(({ image, referenceId, regionId }) => ({
                  byteSize: image.byteSize,
                  referenceId,
                  regionId,
                  sha256: image.sha256,
                })),
                request,
              })
              let png: Buffer
              submitted++
              if (input.references) {
                const response = await active.executeCurrentCanvasRegional(
                  {
                    compositionProfile: 'invoke-canvas-v1',
                    globalNegativeCoverage: { kind: 'everywhere' },
                    globalPositiveCoverage: { kind: 'everywhere' },
                    layout: 'cfg-negative-first',
                    negativePooledSourceId: 'current-canvas',
                    positivePooledSourceId: 'current-canvas',
                    recipe: input.recipe,
                    references: input.references,
                    request,
                  },
                  onProgress,
                )
                assert.equal(response.seed, 123)
                assert.equal(response.output.width, 512)
                assert.equal(response.output.height, 512)
                assert.equal(response.output.iccSha256, IGS_SRGB_ICC_SHA256)
                png = response.pngBytes
                assert.equal(png.length, response.output.byteSize)
                assert.equal(sha(png), response.output.sha256)
              } else {
                const response = (await active.generate(request, onProgress)) as {
                  outputPath: string
                  requestId: string
                  seed: number
                  type: string
                }
                const destination = request.job.output.pngPath
                assert.equal(response.type, 'generation-done')
                assert.equal(response.requestId, request.requestId)
                assert.equal(response.outputPath, destination)
                assert.equal(response.seed, 123)
                const bytes = await bytesAt(destination)
                png = await readSmartPatchModelSourceOutput(destination, {
                  byteSize: bytes.length,
                  colorSpace: 'srgb',
                  height: 512,
                  iccSha256: IGS_SRGB_ICC_SHA256,
                  path: destination,
                  sha256: sha(bytes),
                  width: 512,
                })
              }
              const filename = path.join(outputRoot, `${testCase.label}.png`)
              await writeFile(filename, png, { flag: 'wx', mode: 0o600 })
              assert.equal(progress.length, scheduledSteps)
              return { byteSize: png.length, path: filename, sha256: sha(png) }
            },
          })
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
          } catch (error) {
            exitError = error
            throw error
          } finally {
            const observation = {
              case: testCase,
              error: caseError && errorText(caseError),
              exitError: exitError && errorText(exitError),
              gpu,
              output,
              owner,
              physicalExit,
              progress,
            }
            observations.push(observation)
            await writeJson(`${testCase.label}.outcome.json`, observation)
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
    await idle()
    for (const pin of enginePins) {
      await verify(pin)
    }
    for (const pin of fixturePins) {
      await verifyFixtureFile(pin)
    }
    assert.deepEqual(await sourceWitness(repository, ownerFiles), authoredSource)
    if (placement) {
      assert.deepEqual(await sourceWitness(invoke, invokeFiles), invokeSource)
      assert.equal(await revision(invoke), invokeRevision)
    }
    assert.equal(await revision(repository), applicationRevision)
    assert.deepEqual(await regular(checkpoint), modelBefore)
    assert.deepEqual(await resourceResolver.resolveVerifiedRegionalReferenceResources(), resources)
    assert.deepEqual(
      await Promise.all(resourceEntries.map((entry) => regular(entry.managedPath))),
      resourceStats,
    )
  } catch (error) {
    preservationError = error
  }
  const cgroupRoot = path.join('/sys/fs/cgroup', bounds.group)
  const memory = Object.fromEntries(
    await Promise.all(
      ['memory.peak', 'memory.events', 'memory.stat', 'memory.swap.peak'].map(
        async (name) =>
          [name, (await readFile(path.join(cgroupRoot, name), 'utf8')).trim()] as const,
      ),
    ),
  )
  assert.match(memory['memory.events'], /^oom_kill 0$/m)
  assert.equal(memory['memory.swap.peak'], '0')
  await writeJson('native-report.json', {
    attempted,
    bounds,
    enginePins: install.pinned.length,
    failure: failure && errorText(failure),
    memory,
    observations,
    outcome: failure || preservationError ? 'FAIL' : 'PASS',
    preservationError: preservationError && errorText(preservationError),
    runtimeId: install.runtimeId,
    scheduledSteps,
    signedConfigPins: install.configs.length,
    submitted,
    targetSha,
    visualStatus: 'pending',
  })
  if (failure || preservationError) {
    throw failure ?? preservationError
  }
}

export {
  artifactRoot,
  assertRuntimeIdle,
  assertUpgradeBounds,
  bytesAt,
  children,
  errorText,
  observeGpu,
  readEngine,
  regular,
  runtimeIdle,
  sha,
  verify,
  verifyFixtureFile,
  workerExited,
  writeJson,
}

if (import.meta.main) {
  await main()
}
