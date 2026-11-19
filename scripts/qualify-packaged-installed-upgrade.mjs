/** Compose a historical or trained fixture with the packaged smoke in one idle installed slot. */
import assert from 'node:assert/strict'
import { execFile, execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants, createReadStream } from 'node:fs'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parseArgs, promisify } from 'node:util'

import { ProjectWorkerClient } from '../src/main/projects/worker-client.ts'
import { createRuntimeRoots, RuntimeManager } from '../src/main/runtime/index.ts'
import { prepareHistoricalState } from './fixtures/application-state-upgrade-fixture.mjs'

const exec = promisify(execFile)
const repo = path.dirname(import.meta.dirname)
const engineRuns = path.join(
  os.homedir(),
  '.codex/artifacts/imagegen-studio/runs/packaged-installed-engine',
)
const productionInputs = [
  'src',
  'worker-python',
  'package.json',
  'pnpm-lock.yaml',
  'electron-builder.config.cjs',
  'vite.desktop.config.ts',
  'scripts/build-electron.mjs',
]
const { values } = parseArgs({
  options: {
    artifacts: { type: 'string' },
    'engine-report': { type: 'string' },
    family: { type: 'string' },
    'model-inputs': { type: 'string' },
    'package-proof': { type: 'string' },
    profile: { type: 'string' },
  },
})
const run = values.artifacts
const engineReportPath = values['engine-report']
const { family, profile } = values
const sourcesPath = values['model-inputs']
const packageProofPath = values['package-proof']
assert.ok(family === undefined || family === 'illustrious' || family === 'anima')
assert.equal(sourcesPath === undefined, family === undefined)
assert.ok(
  profile === undefined ||
    (family === 'illustrious' && ['noobai-eps', 'noobai-eps-vae', 'noobai-v'].includes(profile)),
)
assert.equal(packageProofPath === undefined, profile === undefined)
const preserved = new Set(['inference-resources', 'runtime'])
const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim()
const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'))

async function absent(file) {
  await assert.rejects(fs.lstat(file), { code: 'ENOENT' })
}

async function directory(file) {
  const entry = await fs.lstat(file)
  assert.ok(entry.isDirectory() && entry.uid === process.getuid(), file)
  assert.equal(await fs.realpath(file), file)
  return entry
}

async function sha256(file) {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(file)) hash.update(bytes)
  return hash.digest('hex')
}

async function ownedFileIdentity(file, maximumBytes) {
  const statFields = ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
  const fingerprint = (stat) => statFields.map((name) => stat[name])
  assert.equal(await fs.realpath(file), file)
  const before = await fs.lstat(file, { bigint: true })
  assert.ok(before.isFile() && before.uid === BigInt(process.getuid()) && before.nlink === 1n, file)
  assert.ok((before.mode & 0o022n) === 0n, file)
  assert.ok(before.size > 0n && before.size <= BigInt(maximumBytes), file)
  const handle = await fs.open(
    file,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  let digest
  try {
    assert.deepEqual(fingerprint(await handle.stat({ bigint: true })), fingerprint(before), file)
    const hash = createHash('sha256')
    for await (const bytes of handle.createReadStream({ autoClose: false })) hash.update(bytes)
    digest = hash.digest('hex')
    assert.deepEqual(fingerprint(await handle.stat({ bigint: true })), fingerprint(before), file)
  } finally {
    await handle.close()
  }
  assert.equal(await fs.realpath(file), file)
  assert.deepEqual(fingerprint(await fs.lstat(file, { bigint: true })), fingerprint(before), file)
  return { path: file, sizeBytes: Number(before.size), sha256: digest }
}

async function readNoobaiPackageProof(filename) {
  assert.ok(path.isAbsolute(filename) && path.normalize(filename) === filename)
  const previewRun = path.dirname(filename)
  assert.equal(
    path.dirname(previewRun),
    path.join(path.dirname(engineRuns), 'packaged-noobai-preview'),
  )
  assert.match(path.basename(previewRun), /^\d{8}(?:-r[1-9]\d*)?$/)
  assert.equal(path.basename(filename), 'v-package-proof.json')
  await directory(previewRun)
  const identity = await ownedFileIdentity(filename, 16384)
  const proof = await readJson(filename)
  assert.deepEqual(await ownedFileIdentity(filename, 16384), identity)
  assert.deepEqual(Object.keys(proof).sort(), ['appImage', 'dist', 'revision'])
  assert.match(proof.revision, /^[0-9a-f]{40}$/)
  assert.equal(git('diff', '--name-only', proof.revision, '--', ...productionInputs), '')
  assert.equal(git('ls-files', '--others', '--exclude-standard', '--', ...productionInputs), '')

  const manifestPath = path.join(previewRun, 'package-live.json')
  const manifestIdentity = await ownedFileIdentity(manifestPath, 65536)
  const manifest = await readJson(manifestPath)
  assert.deepEqual(await ownedFileIdentity(manifestPath, 65536), manifestIdentity)
  assert.equal(manifest.mode, 'live')
  assert.equal(manifest.entrypoint, 'dist/main/main.cjs')
  assert.equal(manifest.variant, null)
  assert.deepEqual(proof.appImage, manifest.package)
  assert.deepEqual(proof.dist, manifest.dist)
  const { appImage, dist, revision } = proof
  const packageDirectory = path.join(previewRun, 'package-work/live/output')
  await directory(packageDirectory)
  assert.equal(path.dirname(appImage.path), packageDirectory)
  assert.match(path.basename(appImage.path), /^imagegen-studio-[\w.-]+-x86_64\.AppImage$/)
  assert.deepEqual(await ownedFileIdentity(appImage.path, 512 * 1024 ** 2), appImage)
  assert.equal((await fs.lstat(appImage.path)).mode & 0o777, 0o755)

  const actualDist = {}
  async function verifyDist(directoryName) {
    for (const entry of await fs.readdir(path.join(repo, directoryName), { withFileTypes: true })) {
      const member = path.join(directoryName, entry.name)
      if (entry.isDirectory()) {
        await verifyDist(member)
      } else if (!entry.name.endsWith('.map')) {
        assert.ok(entry.isFile(), member)
        actualDist[member] = await sha256(path.join(repo, member))
      }
    }
  }
  await verifyDist('dist')
  assert.equal(Object.keys(dist).length, 42)
  for (const member of [
    'dist/main/main.cjs',
    'dist/preload/preload.cjs',
    'dist/renderer/index.html',
  ]) {
    assert.match(dist[member], /^[0-9a-f]{64}$/)
  }
  assert.deepEqual(actualDist, dist)
  return { appImage, revision, dist, identity, manifestIdentity }
}

async function writeRecord(file, value) {
  const handle = await fs.open(file, 'wx', 0o600)
  try {
    await handle.writeFile(JSON.stringify(value, null, 2) + '\n')
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function inventory(root, names) {
  const result = []
  async function visit(relative) {
    const file = path.join(root, relative)
    const entry = await fs.lstat(file, { bigint: true })
    const row = {
      path: relative,
      device: String(entry.dev),
      inode: String(entry.ino),
      mode: String(entry.mode),
      size: String(entry.size),
      modified: String(entry.mtimeNs),
    }
    if (entry.isDirectory()) {
      result.push(row)
      for (const name of (await fs.readdir(file)).sort()) await visit(path.join(relative, name))
    } else if (entry.isSymbolicLink()) {
      result.push({ ...row, link: await fs.readlink(file) })
    } else {
      assert.ok(entry.isFile(), file)
      result.push({ ...row, sha256: await sha256(file) })
    }
  }
  for (const name of names) await visit(name)
  return result
}

// An exclusive claim coordinates qualification runs. The physical scan also detects live use of
// this exact fixture by packaged Main or its workers. It never terminates another process.
async function assertIdle(appData) {
  const xdgData = path.dirname(appData)
  const usesRoot = (value) => value === appData || value?.startsWith(`${appData}/`)
  const maybe = async (operation) => {
    try {
      return await operation()
    } catch (error) {
      if (!['ENOENT', 'ESRCH', 'EACCES', 'EPERM'].includes(error.code)) throw error
      return undefined
    }
  }
  for (const pid of await fs.readdir('/proc')) {
    if (!/^\d+$/.test(pid) || Number(pid) === process.pid) continue
    const proc = `/proc/${pid}`
    const entry = await maybe(() => fs.stat(proc))
    if (entry?.uid !== process.getuid()) continue
    const [cwd, executable, environment] = await Promise.all([
      maybe(() => fs.readlink(`${proc}/cwd`)),
      maybe(() => fs.readlink(`${proc}/exe`)),
      maybe(() => fs.readFile(`${proc}/environ`, 'utf8')),
    ])
    assert.ok(
      !usesRoot(cwd) &&
        !usesRoot(executable) &&
        !environment?.split('\0').includes(`XDG_DATA_HOME=${xdgData}`),
      `Installed fixture is in use by PID ${pid}.`,
    )
    for (const fd of (await maybe(() => fs.readdir(`${proc}/fd`))) ?? []) {
      const target = await maybe(() => fs.readlink(`${proc}/fd/${fd}`))
      assert.ok(!usesRoot(target), `Installed fixture is in use by PID ${pid}.`)
    }
  }
}

assert.ok(
  path.isAbsolute(engineReportPath ?? '') && path.normalize(engineReportPath) === engineReportPath,
)
const engineRun = path.dirname(engineReportPath)
assert.equal(path.dirname(engineRun), engineRuns)
assert.equal(path.basename(engineReportPath), 'installed-engine.json')
assert.ok(
  path.isAbsolute(run ?? '') && path.normalize(run) === run && path.dirname(run) === engineRun,
)
const runType = family ? `trained-${profile ?? family}` : 'historical-upgrade'
assert.match(path.basename(run), new RegExp(`^${runType}-r[1-9]\\d*$`))
await directory(engineRun)
assert.equal(await fs.realpath(engineReportPath), engineReportPath)
const release = await readJson(engineReportPath)
const lifecycle = await readJson(path.join(engineRun, 'artifact-lifecycle.json'))
assert.equal(lifecycle.state, 'retained')
assert.equal(release.outcome, 'PASS')
assert.equal(release.qualification, 'actual-signed-full-engine-install-native-qualification')
const priorNativeReport = path.join(engineRun, 'native/report.json')
assert.equal(await fs.realpath(priorNativeReport), priorNativeReport)
const prior = await readJson(priorNativeReport)
assert.equal(prior.outcome, 'PASS')
assert.equal(prior.lifetimes.length, 2)
assert.ok(
  prior.lifetimes.every(
    ({ normalPhysicalExit, forcedCleanup }) => normalPhysicalExit && !forcedCleanup,
  ),
)
const pins = await readJson(path.join(engineRun, 'retained-inputs.json'))
const retainedAppImage = prior.packageBefore.path
assert.equal(path.dirname(retainedAppImage), path.join(engineRun, 'package'))
assert.equal(await fs.realpath(retainedAppImage), retainedAppImage)
for (const file of [engineReportPath, priorNativeReport, retainedAppImage]) {
  assert.equal(await sha256(file), pins[file], file)
}
assert.equal(pins[retainedAppImage], prior.packageBefore.sha256)
const appData = release.roots.appDataDir
assert.equal(appData, path.join(release.payloadRoot, 'data/imagegen-studio'))
assert.equal(path.dirname(release.payloadRoot), path.join(engineRun, 'payloads'))
assert.match(path.basename(release.payloadRoot), /^native-runtime-offline-[a-zA-Z0-9]+$/)
assert.ok(lifecycle.payloads.includes(appData) && lifecycle.payloads.includes(retainedAppImage))
await directory(appData)
const pointerFile = path.join(appData, 'runtime/current-runtime.json')
assert.deepEqual(await readJson(pointerFile), release.activatedPointer)
const { pythonExecutable, runtimeId } = release.activatedPointer
assert.equal(pythonExecutable, path.join(appData, 'runtime/environments', runtimeId, 'bin/python'))
const manifest = release.signedRelease.manifest
const interpreter = path.join(appData, 'runtime/python', runtimeId, 'bin/python3.12')
assert.equal(await fs.realpath(pythonExecutable), interpreter)
assert.equal(manifest.python.executable, 'python/bin/python3.12')
const interpreterEntry = manifest.files.find(
  ({ path: member }) => member === manifest.python.executable,
)
assert.equal(interpreterEntry.kind, 'file')
const engineInputs = prior.packagedInstalledRuntime.unchangedInputs
const workerRoot = path.join(
  path.dirname(path.dirname(pythonExecutable)),
  'lib/python3.12/site-packages/imagegen_worker',
)
const workerFiles = Object.keys(release.installationProvenance.value.workerFiles).map((member) =>
  path.join(workerRoot, member),
)
const provenancePath = path.join(
  path.dirname(path.dirname(pythonExecutable)),
  'runtime-installation.json',
)
assert.deepEqual(
  engineInputs.map((input) => input.path).sort(),
  [engineReportPath, pointerFile, provenancePath, ...workerFiles].sort(),
)
const exactInputs = [
  ...engineInputs,
  { path: interpreter, sizeBytes: interpreterEntry.sizeBytes, sha256: interpreterEntry.sha256 },
]
async function assertEngineInputs() {
  for (const input of exactInputs) {
    assert.equal(await fs.realpath(input.path), input.path)
    const entry = await fs.lstat(input.path)
    assert.ok(entry.isFile() && entry.size === input.sizeBytes, input.path)
    assert.equal(await sha256(input.path), input.sha256, input.path)
  }
}
await assertEngineInputs()
const sourceRevision = release.sourceBefore.head
assert.match(sourceRevision, /^[0-9a-f]{40}$/)
const packageProof = packageProofPath ? await readNoobaiPackageProof(packageProofPath) : null
const appImage = packageProof?.appImage.path ?? retainedAppImage
if (packageProof) {
  assert.equal(git('diff', '--name-only', sourceRevision, '--', 'worker-python'), '')
} else {
  assert.equal(
    git('diff', '--name-only', sourceRevision, '--', ...productionInputs),
    '',
    'Current production inputs differ from the retained package.',
  )
}

const group = (await fs.readFile('/proc/self/cgroup', 'utf8'))
  .trim()
  .match(/^0::(\/[^\n]+\/igs-[\w-]+\.service)$/)?.[1]
assert.ok(group && path.posix.normalize(group) === group, 'Use a bounded qualification service.')
const memoryLimit = path.join('/sys/fs/cgroup', group)
const memoryMax = (await fs.readFile(path.join(memoryLimit, 'memory.max'), 'utf8')).trim()
const swapMax = (await fs.readFile(path.join(memoryLimit, 'memory.swap.max'), 'utf8')).trim()
assert.ok(/^\d+$/.test(memoryMax) && Number(memoryMax) <= (family ? 2 : 4) * 1024 ** 3)
assert.equal(swapMax, '0')

await fs.mkdir(run, { mode: 0o700 })
const payloads = path.join(run, 'payloads')
await fs.mkdir(payloads, { mode: 0o700 })
await writeRecord(path.join(run, 'artifact-lifecycle.json'), {
  owner: { repository: repo, task: `packaged installed ${runType}` },
  revision: git('rev-parse', 'HEAD'),
  state: 'running',
  evidence: run,
  payloads: [payloads],
  dependsOn: [
    engineReportPath,
    priorNativeReport,
    retainedAppImage,
    ...(packageProof
      ? [appImage, packageProof.identity.path, packageProof.manifestIdentity.path]
      : []),
    appData,
    ...(sourcesPath ? [sourcesPath] : []),
  ],
  usedBy: [],
  pins: [],
})
const claim = path.join(path.dirname(appData), '.packaged-upgrade-qualification')
await fs.mkdir(claim, { mode: 0o700 })
const held = path.join(payloads, 'prior-owned-app-data')
const staged = path.join(payloads, 'completed-upgrade-state')
const moved = []
let before
let stagedOwned = false
let fixture
let trained
let verifyTrainedSources
let normalized
let smokeExit
const nativeRoot = path.join(run, 'native')
try {
  await writeRecord(path.join(claim, 'owner.json'), { run, appData, pid: process.pid })
  await assertIdle(appData)
  await writeRecord(path.join(run, 'engine-inputs.json'), {
    group,
    memoryMax,
    swapMax,
    appImage,
    appImageSha256: packageProof?.appImage.sha256 ?? pins[retainedAppImage],
    sourceRevision,
    inputs: exactInputs,
    ...(packageProof ? { packageProof } : {}),
  })
  const entries = (await fs.readdir(appData)).sort()
  const names = entries.filter((name) => !preserved.has(name))
  for (const name of preserved) await directory(path.join(appData, name))
  before = await inventory(appData, names)
  await writeRecord(path.join(run, 'prior-app-data.json'), {
    appData,
    held,
    staged,
    preserved: [...preserved],
    inventory: before,
  })
  await fs.mkdir(held, { mode: 0o700 })
  assert.equal((await directory(held)).dev, (await directory(appData)).dev)
  for (const name of names) {
    await fs.rename(path.join(appData, name), path.join(held, name))
    moved.push(name)
  }
  assert.deepEqual(await inventory(held, names), before)
  stagedOwned = true

  if (family) {
    const { preparePackagedTrainedModels, verifyPackagedTrainedSources } =
      await import('./fixtures/packaged-installed-models.mjs')
    verifyTrainedSources = verifyPackagedTrainedSources
    trained = await preparePackagedTrainedModels({
      repo,
      run,
      appData,
      family,
      sourcesPath,
      profile,
    })
    await writeRecord(path.join(run, 'trained-fixture.json'), {
      schemaVersion: 1,
      family,
      appData,
      runtimeId,
      ...trained,
      ...(packageProof ? { profile, package: packageProof.appImage } : {}),
    })
  } else {
    const rasterSourcePath = path.join(run, 'historical-raster.png')
    const profile = path.join(repo, 'worker-python/src/imagegen_worker/srgb.icc')
    await exec(
      pythonExecutable,
      [
        '-I',
        '-B',
        '-c',
        `from pathlib import Path
from PIL import Image
import sys
with Path(sys.argv[1]).open('xb') as out:
    Image.new('RGBA', (48, 32), (31, 101, 197, 255)).save(out, format='PNG', icc_profile=Path(sys.argv[2]).read_bytes())`,
        rasterSourcePath,
        profile,
      ],
      { timeout: 15_000 },
    )
    fixture = await prepareHistoricalState({
      repo,
      run,
      root: path.join(payloads, 'subject'),
      installed: {
        appData,
        runtimeId,
        pythonExecutable,
        rasterSourcePath,
        normalizeImport: async (input) => {
          const manager = new RuntimeManager(await createRuntimeRoots(appData))
          const source = await manager.resolveInstalledProjectWorker(path.join(appData, 'scratch'))
          assert.ok(source)
          assert.equal(source.location.pythonExecutable, pythonExecutable)
          const client = await ProjectWorkerClient.start(source.location, {
            environment: source.environment,
          })
          try {
            const result = await client.normalizeImport(input)
            normalized = { ready: client.ready, rasterBytes: await sha256(rasterSourcePath) }
            return result
          } finally {
            await client.close()
          }
        },
      },
    })
    await writeRecord(path.join(run, 'historical-normalization.json'), normalized)
  }
  const env = {
    ...process.env,
    IMAGEGEN_LINUX_PACKAGE_APPIMAGE: appImage,
    IMAGEGEN_LINUX_PACKAGE_ARTIFACTS: nativeRoot,
    IMAGEGEN_LINUX_PACKAGE_INSTALLED_ENGINE_REPORT: engineReportPath,
  }
  for (const key of [
    'IMAGEGEN_LINUX_PACKAGE_UPDATE_CHECK',
    'IMAGEGEN_LINUX_PACKAGE_UPDATE_RELEASE_FIXTURES',
    'IMAGEGEN_LINUX_PACKAGE_UPDATE_FEED_PORT',
    'IMAGEGEN_LINUX_PACKAGE_HISTORICAL_FIXTURE',
    'IMAGEGEN_LINUX_PACKAGE_NOOBAI_INSTALL',
    'IMAGEGEN_LINUX_PACKAGE_NOOBAI_PREVIEW',
    'IMAGEGEN_LINUX_PACKAGE_NOOBAI_TOKEN_FILE',
    'IMAGEGEN_LINUX_PACKAGE_TRAINED_FIXTURE',
  ])
    delete env[key]
  if (family) env.IMAGEGEN_LINUX_PACKAGE_TRAINED_FIXTURE = path.join(run, 'trained-fixture.json')
  else env.IMAGEGEN_LINUX_PACKAGE_HISTORICAL_FIXTURE = path.join(run, 'historical-fixture.json')
  smokeExit = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(repo, 'scripts/smoke-linux-package.mjs')], {
      cwd: repo,
      env,
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  assert.deepEqual(smokeExit, { code: 0, signal: null })
} finally {
  // On a deadline/crash the on-disk claim and prior inventory survive for explicit inspection.
  // Never restore over a retained or still-live application, and never unlink either state.
  if (moved.length > 0 || stagedOwned) {
    assert.equal(ProjectWorkerClient.hasUnconfirmedExit(), false)
    await assertIdle(appData)
  }
  if (smokeExit) {
    assert.equal(smokeExit.signal, null)
    const observations = await fs.readdir(nativeRoot).catch((error) => {
      if (error.code === 'ENOENT' && smokeExit.code !== 0) return []
      throw error
    })
    for (const phase of ['first', 'restarted']) {
      const receipt = `${phase}.physical-exit.json`
      if (smokeExit.code === 0 || observations.some((name) => name.startsWith(`${phase}.`))) {
        assert.equal((await readJson(path.join(nativeRoot, receipt))).scopeExit.confirmed, true)
      }
    }
  }
  if (stagedOwned) {
    await fs.mkdir(staged, { mode: 0o700 })
    for (const name of await fs.readdir(appData)) {
      if (!preserved.has(name)) await fs.rename(path.join(appData, name), path.join(staged, name))
    }
  }
  for (const name of moved) {
    await absent(path.join(appData, name))
    await fs.rename(path.join(held, name), path.join(appData, name))
  }
  if (before) {
    const names = (await fs.readdir(appData)).sort().filter((name) => !preserved.has(name))
    const after = await inventory(appData, names)
    assert.deepEqual(after, before)
    await assertEngineInputs()
    assert.deepEqual(await readJson(pointerFile), release.activatedPointer)
    await writeRecord(path.join(run, 'restoration.json'), {
      appData,
      staged,
      restoredEntries: after.length,
      exactIdentityAndBytes: true,
    })
  }
  if (trained) {
    await verifyTrainedSources(trained.files)
    await writeRecord(path.join(run, 'trained-sources-unchanged.json'), { files: trained.files })
  }
  await fs.rename(claim, path.join(run, 'released-claim'))
  if (packageProof) {
    const after = await readNoobaiPackageProof(packageProofPath)
    assert.deepEqual(after, packageProof)
    await writeRecord(path.join(run, 'package-verified-after.json'), after)
  }
}
console.log(
  JSON.stringify({ outcome: 'PASS', appData, run, family, projectId: fixture?.project.projectId }),
)
