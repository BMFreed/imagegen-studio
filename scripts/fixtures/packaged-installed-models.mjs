/** Publish exact, read-only model sources into a temporary qualification catalog. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, readdir, realpath } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { openAppDatabase } from '../../src/main/db/database.ts'
import {
  ANIMA_QWEN3_0_6B_ENCODER,
  ANIMA_QWEN_IMAGE_VAE,
} from '../../src/main/models/anima-manifest.ts'
import { ModelRepository } from '../../src/main/models/model-repository.ts'

const checkout = path.resolve(import.meta.dirname, '../..')
const engineRuns = path.join(
  os.homedir(),
  '.codex/artifacts/imagegen-studio/runs/packaged-installed-engine',
)
const noobaiInstallRuns = path.join(path.dirname(engineRuns), 'packaged-noobai-install')
const checkpoints = {
  illustrious: {
    name: 'Illustrious XL v0.1',
    versionName: 'v0.1',
    predictionType: 'epsilon',
    modelId: 795765,
    versionId: 889818,
    fileId: 798303,
    creator: 'OnomaAIResearch',
    byteSize: 6938040760,
    sha256: '3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9',
    origin: {
      repository: 'OnomaAIResearch/Illustrious-xl-early-release-v0',
      revision: 'dca0dac303e6dc4b0c31d8001bc685b89b5d0204',
      path: 'Illustrious-XL-v0.1.safetensors',
    },
  },
  anima: {
    name: 'Cyberfalafel',
    versionName: 'Cyberfalafel anima v1.0',
    predictionType: null,
    modelId: 1147756,
    versionId: 3120487,
    fileId: 3000817,
    creator: 'Knightus_Ai',
    byteSize: 4182275752,
    sha256: '0fc7507b222e52ac8cc5e2826786bc4caed05223df32d17aeb05a76cb4de9941',
    origin: { url: 'https://civitai.com/api/download/models/3120487?fileId=3000817' },
  },
  'noobai-eps': {
    name: 'NoobAI-XL (NAI-XL)',
    versionName: 'Epsilon-pred 1.0-Version',
    predictionType: 'epsilon',
    modelId: 833294,
    versionId: 1022833,
    fileId: 928571,
    creator: 'L_A_X',
    originalFilename: 'NoobAI-XL-100_percent_EPS.safetensors',
    byteSize: 6938040416,
    sha256: 'ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1',
    origin: { url: 'https://civitai.com/api/download/models/1022833?fileId=928571' },
  },
  'noobai-v': {
    name: 'Cyberfalafel - falafel cyber fix',
    versionName: 'Cyberfalafel v-pred v1.2',
    predictionType: 'v_prediction',
    modelId: 1147756,
    versionId: 2679856,
    fileId: 2566634,
    creator: 'Knightus_Ai',
    byteSize: 6938040794,
    sha256: 'edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d',
    origin: { url: 'https://civitai.com/api/download/models/2679856?fileId=2566634' },
  },
}
const animaCompanions = {
  qwen3Encoder: {
    role: 'qwen3_encoder',
    name: 'Anima Qwen3 0.6B Encoder',
    pin: ANIMA_QWEN3_0_6B_ENCODER,
  },
  vae: { role: 'vae', name: 'Anima Qwen Image VAE', pin: ANIMA_QWEN_IMAGE_VAE },
}

function keys(object, exact) {
  assert.ok(object && typeof object === 'object' && !Array.isArray(object))
  assert.deepEqual(Object.keys(object).sort(), [...exact].sort())
}

function inside(parent, candidate) {
  return candidate.startsWith(parent + path.sep)
}

async function ownedDirectory(directory) {
  const entry = await lstat(directory)
  assert.ok(entry.isDirectory() && entry.uid === process.getuid(), directory)
  assert.equal(await realpath(directory), directory)
}

const statFields = ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
const fileStat = (entry) => Object.fromEntries(statFields.map((key) => [key, String(entry[key])]))

async function verifyFile({ path: filename, sha256, byteSize }, role) {
  assert.ok(path.isAbsolute(filename) && path.normalize(filename) === filename, role)
  assert.equal(path.extname(filename), '.safetensors', role)
  assert.equal(await realpath(filename), filename, role)
  const named = await lstat(filename, { bigint: true })
  assert.ok(named.isFile() && named.size === BigInt(byteSize), role)
  const stat = fileStat(named)
  const file = await open(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    assert.deepEqual(fileStat(await file.stat({ bigint: true })), stat, role)
    const hash = createHash('sha256')
    let bytesRead = 0
    for await (const bytes of file.createReadStream({ autoClose: false })) {
      bytesRead += bytes.length
      assert.ok(bytesRead <= byteSize, role)
      hash.update(bytes)
    }
    assert.equal(bytesRead, byteSize, role)
    assert.equal(hash.digest('hex'), sha256, role)
    assert.deepEqual(fileStat(await file.stat({ bigint: true })), stat, role)
    assert.deepEqual(fileStat(await lstat(filename, { bigint: true })), stat, role)
    assert.equal(await realpath(filename), filename, role)
    return { role, path: filename, sha256, byteSize, stat }
  } finally {
    await file.close()
  }
}

function rolesFor(family) {
  return family === 'anima' ? ['checkpoint', 'qwen3Encoder', 'vae'] : ['checkpoint']
}

function assertModelPin(family, role, file) {
  const pin = role === 'checkpoint' ? checkpoints[family] : animaCompanions[role].pin
  assert.equal(file.sha256, pin.sha256, role)
  assert.equal(file.byteSize, pin.byteSize ?? pin.sizeBytes, role)
}

/** Re-read the same exact source set and confirm its identity and contents survived the run. */
export async function verifyPackagedTrainedSources(files) {
  assert.ok(Array.isArray(files))
  const family = Object.keys(checkpoints).find(
    (family) => checkpoints[family].sha256 === files[0]?.sha256,
  )
  assert.ok(family, 'Expected a pinned trained checkpoint.')
  assert.deepEqual(
    files.map(({ role }) => role),
    rolesFor(family),
  )
  for (const file of files) {
    keys(file, ['role', 'path', 'sha256', 'byteSize', 'stat'])
    assertModelPin(family, file.role, file)
    assert.deepEqual(await verifyFile(file, file.role), file)
  }
}

function fileMetadata(source, originalFilename = path.basename(source.path)) {
  return {
    managedPath: source.path,
    originalFilename,
    sha256: source.sha256,
    sizeBytes: source.byteSize,
    verifiedAt: new Date().toISOString(),
  }
}

function companionDependency(source) {
  const { name, pin, role } = animaCompanions[source.role]
  const filename = path.basename(pin.path)
  return {
    role,
    artifact: {
      file: fileMetadata(source, filename),
      resource: {
        displayName: name,
        type: role,
        source: { kind: 'supported_dependency', key: `anima:${pin.role}:${pin.sha256}` },
        sourceMetadata: { license: pin.license.id, qualificationPrecondition: true },
      },
      version: {
        baseModelFamily: 'anima',
        format: 'SafeTensor',
        name: filename,
        predictionType: null,
        source: {
          kind: 'supported_dependency',
          expectedSha256: pin.sha256,
          revision: pin.revision,
        },
        sourceMetadata: { path: pin.path, repository: pin.repository },
      },
    },
  }
}

export async function preparePackagedTrainedModels({
  repo,
  run,
  appData,
  family,
  profile,
  sourcesPath,
}) {
  assert.ok(
    profile === undefined
      ? ['illustrious', 'anima'].includes(family)
      : ['noobai-eps', 'noobai-v'].includes(profile) && family === 'illustrious',
  )
  const checkpointKey = profile ?? family
  assert.equal(repo, checkout)
  const engineRun = path.dirname(run)
  assert.equal(path.dirname(engineRun), engineRuns)
  assert.match(path.basename(run), new RegExp(`^trained-${checkpointKey}-r[1-9]\\d*$`))
  const [payloads, slot, data, name, ...extra] = path.relative(engineRun, appData).split(path.sep)
  assert.ok(
    payloads === 'payloads' && data === 'data' && name === 'imagegen-studio' && extra.length === 0,
  )
  assert.match(slot, /^native-runtime-offline-[a-zA-Z0-9]+$/)
  for (const directory of [repo, engineRun, run, appData]) await ownedDirectory(directory)
  assert.deepEqual((await readdir(appData)).sort(), ['inference-resources', 'runtime'])
  assert.equal(sourcesPath, path.join(engineRun, `trained-input-${checkpointKey}.json`))
  assert.equal(await realpath(sourcesPath), sourcesPath)
  const input = await open(
    sourcesPath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  let sources
  try {
    const entry = await input.stat()
    assert.ok(entry.isFile() && entry.uid === process.getuid() && entry.size <= 16384)
    sources = JSON.parse(await input.readFile('utf8'))
  } finally {
    await input.close()
  }
  const roles = rolesFor(family)
  keys(sources, ['schemaVersion', 'family', ...roles, ...(profile ? ['profile'] : [])])
  assert.equal(sources.schemaVersion, 1)
  assert.equal(sources.family, family)
  assert.equal(sources.profile, profile)
  const files = []
  for (const role of roles) {
    const file = sources[role]
    keys(file, ['path', 'sha256', 'byteSize'])
    assert.ok(typeof file.path === 'string' && !inside(engineRun, file.path), role)
    assertModelPin(checkpointKey, role, file)
    if (profile === 'noobai-eps') {
      const [installRun, ...managedFile] = path
        .relative(noobaiInstallRuns, file.path)
        .split(path.sep)
      assert.match(installRun, /^\d{8}(?:-r[1-9]\d*)?$/)
      assert.deepEqual(managedFile, [
        'install',
        'data',
        'imagegen-studio',
        'models',
        'ff',
        `${checkpoints[profile].sha256}.safetensors`,
      ])
    }
    files.push(await verifyFile(file, role))
  }
  assert.equal(new Set(files.map(({ stat }) => `${stat.dev}:${stat.ino}`)).size, files.length)

  // InvokeAI model_install_default.py register_path -> _register supports borrowed original paths.
  // Studio's existing original-file qualification uses the same real ModelRepository publication.
  // The temporary catalog is generated solely for Generate/Add/Save, with no install or removal job.
  const database = openAppDatabase(appData, path.join(repo, 'src/main/db/migrations'))
  try {
    const repository = new ModelRepository(database.db)
    assert.deepEqual(await repository.listInstalled(), [])
    assert.deepEqual(await repository.listInstallJobs(), [])
    const [checkpoint, ...companions] = files
    const pin = checkpoints[checkpointKey]
    const { resourceId, versionId, dependencyVersionIds } =
      await repository.publishVerifiedInstallation({
        primary: {
          file: fileMetadata(checkpoint, pin.originalFilename),
          resource: {
            displayName: pin.name,
            creator: pin.creator,
            type: 'checkpoint',
            source: { kind: 'civitai', modelId: pin.modelId },
            sourceMetadata: { qualificationPrecondition: true },
          },
          version: {
            baseModelFamily: family,
            format: 'safetensors',
            name: pin.versionName,
            predictionType: profile === undefined ? pin.predictionType : null,
            source: {
              kind: 'civitai',
              expectedSha256: pin.sha256,
              versionId: pin.versionId,
              fileId: pin.fileId,
            },
            sourceMetadata: { origin: pin.origin, qualificationPrecondition: true },
          },
        },
        dependencies: companions.map(companionDependency),
      })
    const catalog = await repository.listInstalled()
    assert.equal(catalog.length, roles.length)
    assert.ok(catalog.every(({ versions }) => versions.length === 1))
    const version = catalog.find(({ id }) => id === resourceId).versions[0]
    assert.equal(version.id, versionId)
    assert.equal(version.predictionType, profile === undefined ? pin.predictionType : null)
    assert.deepEqual(version.dependencyVersionIds, dependencyVersionIds)
    assert.equal(version.file.managedPath, checkpoint.path)
    const dependencies = {}
    for (const source of companions) {
      const dependencyId = dependencyVersionIds[animaCompanions[source.role].role]
      const dependency = catalog.find(({ versions }) => versions[0].id === dependencyId)
      const file = dependency.versions[0].file
      assert.equal(file.managedPath, source.path)
      assert.equal(file.sha256, source.sha256)
      dependencies[source.role] = {
        localModelId: dependency.id,
        localVersionId: dependencyId,
        sha256: source.sha256,
        byteSize: source.byteSize,
      }
    }
    return {
      files,
      model: {
        name: pin.name,
        versionName: pin.versionName,
        resourceId,
        versionId,
        dependencies,
        ref: {
          kind: 'checkpoint',
          baseModelFamily: family,
          localModelId: resourceId,
          localVersionId: versionId,
          civitaiModelId: pin.modelId,
          civitaiVersionId: pin.versionId,
          civitaiFileId: pin.fileId,
          displayName: pin.name,
          versionName: pin.versionName,
          fileSha256: pin.sha256,
          predictionType: pin.predictionType,
        },
      },
    }
  } finally {
    await database.close()
  }
}
