/** One trained ordinary TXT request through the released local AppImage and its installed worker. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import { expect } from '@playwright/test'

import { snapshotDatabase } from './application-state-upgrade-fixture.mjs'

const execute = promisify(execFile)
const bbox = { x: 0, y: 0, width: 256, height: 256 }
const iccSha256 = '113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1'
const plainPrompts = { positive: 'a red cup', negative: 'blurry, low quality' }
const weightedPrompts = { positive: 'a (red:1.3) cup', negative: '(blurry:0.7), low quality' }
const animaPrompts = {
  positive: {
    version: 'anima-prompt-weighting-v1',
    cleanedText: 'a red cup',
    spans: [
      { start: 0, end: 2, weight: 1 },
      { start: 2, end: 5, weight: 1.3 },
      { start: 5, end: 9, weight: 1 },
    ],
  },
  negative: {
    version: 'anima-prompt-weighting-v1',
    cleanedText: 'blurry , low quality',
    spans: [
      { start: 0, end: 6, weight: 0.7 },
      { start: 6, end: 20, weight: 1 },
    ],
  },
}
const eulerPlan = {
  beginIndex: 0,
  guidanceScale: 4,
  height: 256,
  initialSigma: 1,
  mode: 'txt2img',
  posteriorSeed: null,
  scheduler: 'euler',
  seed: 0,
  sigmas: [1, 0.8571428571428571, 0.6, 0],
  startStep: 0,
  steps: 3,
  stepSeed: 0,
  strength: null,
  timesteps: [1000, 857.1428571428571, 600],
  totalSteps: 3,
  version: 'anima-flow-denoising-v1',
  width: 256,
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const exactHash = /^[0-9a-f]{64}$/
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

function inside(parent, filename) {
  return (
    path.isAbsolute(filename) &&
    path.normalize(filename) === filename &&
    filename.startsWith(parent + path.sep)
  )
}

function statFields(stat) {
  return Object.fromEntries(
    ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs'].map((key) => [
      key,
      String(stat[key]),
    ]),
  )
}

/** Compare within the opened inode and at the canonical name before returning small evidence. */
async function readOwned(filename, maximum) {
  assert.equal(await realpath(filename), filename)
  const handle = await open(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const stat = await handle.stat({ bigint: true })
    assert.ok(
      stat.isFile() && stat.nlink === 1n && stat.size > 0n && stat.size <= BigInt(maximum),
      filename,
    )
    const bytes = await handle.readFile()
    assert.equal(BigInt(bytes.length), stat.size)
    assert.deepEqual(statFields(await handle.stat({ bigint: true })), statFields(stat))
    assert.deepEqual(statFields(await lstat(filename, { bigint: true })), statFields(stat))
    return bytes
  } finally {
    await handle.close()
  }
}

async function assertModelFiles(files, identity, engineRun) {
  for (const file of files) {
    assert.ok(path.isAbsolute(file.path) && path.normalize(file.path) === file.path)
    assert.equal(inside(engineRun, file.path), false)
    assert.equal(path.extname(file.path), '.safetensors')
    assert.equal(await realpath(file.path), file.path)
    assert.match(file.sha256, exactHash)
    const before = await lstat(file.path, { bigint: true })
    assert.ok(before.isFile() && before.size === BigInt(file.byteSize))
    assert.deepEqual(statFields(before), file.stat)
    assert.deepEqual(await identity(file.path), {
      path: file.path,
      sizeBytes: file.byteSize,
      sha256: file.sha256,
    })
    assert.deepEqual(statFields(await lstat(file.path, { bigint: true })), file.stat)
  }
}

export async function readTrainedGeneration({ filename, engine, outputRoot, appImage, identity }) {
  const run = path.dirname(filename)
  assert.ok(inside(engine.run, run))
  assert.equal(filename, path.join(run, 'trained-fixture.json'))
  assert.equal(outputRoot, path.join(run, 'native'))
  const fixtureBefore = await identity(filename)
  const fixture = JSON.parse(await readOwned(filename, 1024 * 1024))
  assert.deepEqual(await identity(filename), fixtureBefore)
  assert.deepEqual(Object.keys(fixture).sort(), [
    'appData',
    'family',
    'files',
    'model',
    'runtimeId',
    'schemaVersion',
  ])
  assert.equal(fixture.schemaVersion, 1)
  assert.ok(['illustrious', 'anima'].includes(fixture.family))
  assert.equal(fixture.appData, engine.dataRoot)
  assert.equal(fixture.runtimeId, engine.runtimeId)

  const previousPath = path.join(engine.run, 'native/report.json')
  const previousBefore = await identity(previousPath)
  const previous = JSON.parse(await readOwned(previousPath, 8 * 1024 * 1024))
  assert.deepEqual(await identity(previousPath), previousBefore)
  assert.equal(previous.outcome, 'PASS')
  assert.equal(previous.packagedInstalledRuntime.runtimeId, engine.runtimeId)
  assert.deepEqual(previous.packageBefore, previous.packageAfter)
  assert.deepEqual(await identity(appImage), previous.packageBefore)
  const python = engine.pythonExecutable
  assert.equal(
    python,
    path.join(engine.dataRoot, 'runtime/environments', engine.runtimeId, 'bin/python'),
  )
  const pythonPath = await realpath(python)
  assert.ok(inside(path.join(engine.dataRoot, 'runtime'), pythonPath))

  const { model, files } = fixture
  assert.equal(model.ref.baseModelFamily, fixture.family)
  assert.equal(model.ref.localModelId, model.resourceId)
  assert.equal(model.ref.localVersionId, model.versionId)
  assert.equal(model.ref.displayName, model.name)
  assert.equal(model.ref.versionName, model.versionName)
  assert.deepEqual(
    files.map(({ role }) => role),
    fixture.family === 'anima' ? ['checkpoint', 'qwen3Encoder', 'vae'] : ['checkpoint'],
  )
  assert.equal(model.ref.fileSha256, files[0].sha256)
  await assertModelFiles(files, identity, engine.run)
  const databasePath = path.join(engine.dataRoot, 'database/app.sqlite')
  assert.equal(await realpath(databasePath), databasePath)
  const baseline = snapshotDatabase(databasePath, { closed: true })
  assert.equal(baseline.schemaMigrations.length, 30)
  assert.equal(baseline.integrityCheck, 'ok')
  assert.deepEqual(baseline.foreignKeyCheck, [])
  for (const name of ['project_index', 'generation_queue_item', 'generation_candidate_receipt']) {
    assert.deepEqual(baseline.tables[name].rows, [])
  }
  return {
    fixture,
    databasePath,
    baseline,
    python,
    pythonPath,
    engineRun: engine.run,
    inputs: [fixtureBefore, previousBefore],
  }
}

async function projectCall(page, name, ...args) {
  const result = await page.evaluate(({ name, args }) => window.api.projects[name](...args), {
    name,
    args,
  })
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}

async function openTab(page, projectId) {
  const opened = await projectCall(page, 'open', projectId)
  assert.equal(opened.kind, 'opened')
  return opened.tab
}

async function setInput(page, label, value) {
  const input = page.locator('input[aria-label="' + label + '"]')
  await input.fill(String(value))
  await input.press('Tab')
}

async function selectOption(page, input, option) {
  await page.locator('[aria-label="' + input + '"]').click()
  await page.getByText(option, { exact: true }).last().click()
}

async function createAndAuthor(page, fixture) {
  const title = 'Packaged trained ' + fixture.family
  await page.getByRole('button', { name: 'New Project', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'New Project', exact: true })
  await dialog.locator('input[aria-label="Project name"]').fill(title)
  for (const dimension of ['width', 'height'])
    await dialog.locator('input[aria-label="Project ' + dimension + '"]').fill('256')
  await dialog.getByRole('button', { name: 'Create Project', exact: true }).click()
  await expect(page.getByRole('tab', { name: title, exact: true })).toBeVisible()
  const summaries = await projectCall(page, 'list')
  assert.equal(summaries.length, 1)
  const [project] = summaries
  assert.equal(project.title, title)
  assert.equal(project.previewStatus, 'empty')

  const { model, family } = fixture
  await setInput(page, 'Images per click', 1)
  await selectOption(page, 'Generation model', model.name)
  // Wait for real model verification before choosing the exact version in the picker.
  await expect(page.locator('[aria-label="Model version"]')).not.toHaveClass(/n-select--disabled/, {
    timeout: 90_000,
  })
  await selectOption(page, 'Model version', model.versionName)
  await expect
    .poll(async () => (await openTab(page, project.id)).generationDraft.model, { timeout: 90_000 })
    .toEqual(model.ref)
  if (family === 'anima') await selectOption(page, 'Anima method', 'Euler')
  else {
    await selectOption(page, 'Sampler', 'Euler')
    await selectOption(page, 'Scheduler', 'Normal')
  }
  await setInput(page, 'Steps', 3)
  await setInput(page, 'CFG scale', 4)
  const random = page.getByRole('switch', { name: 'Random seed switch' })
  if ((await random.getAttribute('aria-checked')) === 'true') await random.click()
  await setInput(page, 'Generation seed', 0)
  const prompts = family === 'anima' ? weightedPrompts : plainPrompts
  for (const [sign, title] of [
    ['positive', 'Positive prompt'],
    ['negative', 'Negative prompt'],
  ]) {
    await page.getByRole('textbox', { name: title, exact: true }).fill(prompts[sign])
    await expect
      .poll(async () => (await openTab(page, project.id)).generationDraft[sign + 'Prompt'].text)
      .toBe(prompts[sign])
  }
  const tab = await openTab(page, project.id)
  assert.deepEqual(tab.layers, [])
  assert.deepEqual(tab.primaryBbox, bbox)
  assert.deepEqual(tab.generationDraft.model, model.ref)
  assert.deepEqual(tab.generationDraft.seed, { policy: 'fixed', value: 0 })
  assert.deepEqual(tab.generationDraft.loras, [])
  assert.equal(tab.generationDraft.sampling.steps, 3)
  assert.equal(tab.generationDraft.sampling.cfgScale, 4)
  return { project, prompts, tab }
}

function assertFrozen(row, requested, fixture, projectFile) {
  const { project, tab, prompts } = requested
  const { model, family, files } = fixture
  const frozen = JSON.parse(row.frozen_payload_json)
  const { context, workerJob } = frozen
  assert.equal(row.operation, family + '-txt2img')
  assert.equal(row.document_id, tab.documentId)
  assert.equal(row.document_revision, tab.documentRevision)
  assert.equal(row.local_project_key, project.id)
  assert.equal(row.canonical_project_path, projectFile)
  assert.equal(frozen.schemaVersion, 1)
  assert.equal(frozen.kind, row.operation)
  assert.equal(context.documentId, row.document_id)
  assert.equal(context.documentRevision, row.document_revision)
  assert.deepEqual(context.bbox, bbox)
  assert.deepEqual(workerJob.bbox, bbox)
  assert.deepEqual(context.prompts, prompts)
  assert.deepEqual(context.loras ?? [], [])
  assert.deepEqual(context.loraStack ?? [], [])
  assert.deepEqual(workerJob.loras ?? [], [])
  assert.equal(context.sampling.seed, 0)
  assert.equal(context.sampling.requestedSeedPolicy, 'fixed')
  assert.equal(context.sampling.steps, 3)
  assert.equal(context.sampling.cfgScale, 4)
  assert.equal(context.target.width, 256)
  assert.equal(context.target.height, 256)
  assert.equal(context.target.iccSha256, iccSha256)
  assert.equal(workerJob.target.sha256, context.target.sha256)
  assert.equal(workerJob.target.byteSize, context.target.byteSize)
  assert.equal(workerJob.target.iccSha256, iccSha256)
  if (family === 'anima') {
    assert.equal(context.animaPromptInterpretation, 'invoke-fragments-v1')
    assert.deepEqual(workerJob.prompts, animaPrompts)
    assert.equal(context.sampling.animaMethod, 'euler')
    assert.deepEqual(workerJob.sampling, eulerPlan)
    assert.deepEqual(context.model.checkpoint.reference, model.ref)
    assert.equal(context.model.architecture, 'anima-base-1.0')
    assert.equal(workerJob.model.architecture, context.model.architecture)
    for (const file of files) {
      assert.deepEqual(workerJob.model[file.role], {
        path: file.path,
        byteSize: file.byteSize,
        sha256: file.sha256,
      })
      if (file.role !== 'checkpoint') {
        const { managedPath, ...component } = context.model[file.role]
        assert.equal(managedPath, file.path)
        assert.deepEqual(component, model.dependencies[file.role])
      }
    }
  } else {
    assert.deepEqual(context.model.reference, model.ref)
    assert.equal(context.sampling.invokeScheduler, 'euler')
    assert.deepEqual(workerJob.prompts, prompts)
    assert.deepEqual(workerJob.checkpoint, {
      path: files[0].path,
      predictionType: 'epsilon',
      sha256: files[0].sha256,
    })
    assert.equal(workerJob.sampling.scheduler, 'euler')
    assert.equal(workerJob.sampling.seed, 0)
    assert.equal(workerJob.sampling.steps, 3)
    assert.equal(workerJob.sampling.cfgScale, 4)
  }
  return frozen
}

async function runningWorker(state, trained) {
  const parent = state.mainPid
  const pids = (await readFile('/proc/' + parent + '/task/' + parent + '/children', 'utf8'))
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  for (const pid of pids) {
    assert.match(pid, /^\d+$/)
    const root = '/proc/' + pid
    try {
      const argv = (await readFile(root + '/cmdline', 'utf8')).split('\0').filter(Boolean)
      if (argv[3] !== 'imagegen_worker.owned_inference') continue
      assert.deepEqual(argv.slice(0, 6), [
        trained.python,
        '-I',
        '-m',
        'imagegen_worker.owned_inference',
        '--parent-pid',
        String(parent),
      ])
      const proc = await readFile(root + '/stat', 'utf8')
      const fields = proc.slice(proc.lastIndexOf(')') + 2).split(' ')
      assert.equal(Number(fields[1]), parent)
      assert.equal(await realpath(root + '/exe'), trained.pythonPath)
      assert.equal(await realpath(root + '/cwd'), path.join(trained.fixture.appData, 'runtime'))
      const observed = (await readFile(root + '/cgroup', 'utf8')).trim()
      assert.match(observed, /^0::\//)
      const group = observed.slice(3)
      const limit = state.checks
        .flatMap(({ groups }) => groups)
        .find((item) => item.group === group)
      assert.ok(limit, 'Trained worker must run inside the observed bounded native group.')
      assert.equal(limit.swapMax, '0')
      assert.ok(Number(limit.memoryMax) > 0 && Number(limit.memoryMax) <= 12 * 1024 ** 3)
      return {
        pid: Number(pid),
        startTicks: fields[19],
        argv,
        executable: trained.pythonPath,
        group,
      }
    } catch (error) {
      if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error
    }
  }
  return null
}

async function assertWorkerExited({ pid, startTicks }) {
  await expect
    .poll(
      async () => {
        try {
          const raw = await readFile('/proc/' + pid + '/stat', 'utf8')
          return raw.slice(raw.lastIndexOf(')') + 2).split(' ')[19] === startTicks
        } catch (error) {
          if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error
          return false
        }
      },
      { timeout: 20_000 },
    )
    .toBe(false)
}

async function retainGeneration({ row, candidate, frozen, receipt, root, dataRoot }) {
  const payload = row.frozen_payload_json
  const payloadSha256 = sha(Buffer.from(payload))
  assert.match(row.id, uuid)
  assert.match(row.staging_session_id, uuid)
  assert.match(candidate.candidateId, uuid)
  assert.match(row.local_project_key, /^project-v1-[0-9a-f]{64}$/)
  assert.equal(candidate.queueItemId, row.id)
  assert.equal(candidate.stagingSessionId, row.staging_session_id)
  assert.equal(candidate.sourceDocumentMismatch, false)
  assert.deepEqual(candidate.bbox, bbox)
  assert.equal(candidate.actualSeed, 0)
  assert.equal(receipt.status, 'completed')
  assert.equal(receipt.queue_item_id, row.id)
  assert.equal(receipt.candidate_id, candidate.candidateId)
  assert.equal(receipt.staging_session_id, row.staging_session_id)
  assert.equal(receipt.local_project_key, row.local_project_key)
  assert.equal(receipt.canonical_project_path, row.canonical_project_path)
  assert.equal(receipt.actual_seed, candidate.actualSeed)
  assert.equal(receipt.completion_order, candidate.completionOrder)
  assert.equal(receipt.frozen_payload_sha256, payloadSha256)
  assert.equal(receipt.expected_status_sequence + 1, row.status_sequence)

  const inputPath = path.join(dataRoot, 'generation-inputs', row.id)
  const inputManifestBytes = await readOwned(path.join(inputPath, 'manifest.json'), 64 * 1024)
  const targetBytes = await readOwned(path.join(inputPath, 'target.png'), 8 * 1024 * 1024)
  const { target } = frozen.context
  assert.deepEqual(JSON.parse(inputManifestBytes), {
    payloadSha256,
    queueInputVersion: 1,
    queueItemId: row.id,
    targetByteSize: target.byteSize,
    targetFile: 'target.png',
    targetSha256: target.sha256,
  })
  assert.equal(targetBytes.length, target.byteSize)
  assert.equal(sha(targetBytes), target.sha256)

  const candidateRoot = path.join(
    dataRoot,
    'recovery/generation-staging',
    row.local_project_key,
    row.staging_session_id,
  )
  const candidateManifestBytes = await readOwned(
    path.join(candidateRoot, 'manifest.json'),
    1024 * 1024,
  )
  const candidateManifest = JSON.parse(candidateManifestBytes)
  assert.equal(candidateManifest.schemaVersion, 1)
  assert.equal(candidateManifest.localProjectKey, row.local_project_key)
  assert.equal(candidateManifest.stagingSessionId, row.staging_session_id)
  assert.equal(candidateManifest.candidates.length, 1)
  const [entry] = candidateManifest.candidates
  const imagePath = 'assets/' + row.id + '.png'
  assert.equal(entry.candidateId, candidate.candidateId)
  assert.equal(entry.queueItemId, row.id)
  assert.equal(entry.projectPath, row.canonical_project_path)
  assert.equal(entry.documentId, row.document_id)
  assert.equal(entry.documentRevision, row.document_revision)
  assert.equal(entry.stagingSessionId, row.staging_session_id)
  assert.equal(entry.actualSeed, 0)
  assert.equal(entry.completionOrder, receipt.completion_order)
  assert.equal(entry.expectedStatusSequence, receipt.expected_status_sequence)
  assert.equal(entry.frozenPayloadJson, payload)
  assert.equal(entry.frozenPayloadSha256, payloadSha256)
  assert.deepEqual(entry.image, {
    byteSize: receipt.image_byte_size,
    height: 256,
    width: 256,
    relativePath: imagePath,
    sha256: receipt.image_sha256,
    iccSha256,
  })
  const imageBytes = await readOwned(path.join(candidateRoot, imagePath), 8 * 1024 * 1024)
  assert.equal(imageBytes.length, receipt.image_byte_size)
  assert.equal(sha(imageBytes), receipt.image_sha256)
  for (const [name, bytes] of [
    ['frozen-payload.json', payload],
    ['target-manifest.json', inputManifestBytes],
    ['target.png', targetBytes],
    ['candidate-manifest.json', candidateManifestBytes],
    ['candidate.png', imageBytes],
    ['candidate-receipt.json', JSON.stringify(receipt, null, 2)],
  ]) {
    await writeFile(path.join(root, name), bytes, { flag: 'wx', mode: 0o600 })
  }
}

function assertPortableConfiguration(configuration, requested, fixture) {
  const { prompts } = requested
  const { model, family, files } = fixture
  assert.equal(configuration.mode, 'txt2img')
  assert.deepEqual(configuration.model, model.ref)
  assert.deepEqual(configuration.positivePrompt, { text: prompts.positive, embeddingRefs: [] })
  assert.deepEqual(configuration.negativePrompt, { text: prompts.negative, embeddingRefs: [] })
  assert.deepEqual(configuration.loras ?? [], [])
  assert.deepEqual(configuration.size, { width: 256, height: 256 })
  assert.equal(configuration.sampling.actualSeed, 0)
  assert.equal(configuration.sampling.requestedSeedPolicy, 'fixed')
  assert.equal(configuration.sampling.steps, 3)
  assert.equal(configuration.sampling.cfgScale, 4)
  if (family === 'anima') {
    assert.equal(configuration.sampling.animaMethod, 'euler')
    assert.deepEqual(configuration.anima, {
      architecture: 'anima-base-1.0',
      checkpointByteSize: files[0].byteSize,
      ...model.dependencies,
    })
  } else {
    assert.equal(configuration.sampling.sampler, 'Euler')
    assert.equal(configuration.sampling.scheduler, 'Normal')
  }
  const portable = JSON.stringify(configuration)
  assert.equal(Object.hasOwn(configuration, 'animaPromptInterpretation'), false)
  for (const file of files) assert.equal(portable.includes(file.path), false)
}

const inspectArchive = String.raw`
import hashlib, io, json, sys, zipfile
from pathlib import Path
from PIL import Image

filename, target_file, candidate_file, icc_hash = sys.argv[1:]
def checked_image(raw, expected_alpha):
    with Image.open(io.BytesIO(raw)) as image:
        assert image.size == (256, 256)
        assert image.format == 'PNG'
        assert hashlib.sha256(image.info['icc_profile']).hexdigest() == icc_hash
        rgba = image.convert('RGBA')
        assert rgba.getchannel('A').getextrema() == (expected_alpha, expected_alpha)
        return rgba.tobytes(), rgba.getextrema()[:3]

target_pixels, _ = checked_image(Path(target_file).read_bytes(), 0)
source = Path(candidate_file).read_bytes()
generated, rgb = checked_image(source, 255)
assert any(lower != upper for lower, upper in rgb)
with zipfile.ZipFile(filename) as package:
    names = package.namelist()
    assert len(names) == len(set(names))
    assert all(item.file_size <= 8 * 1024 * 1024 for item in package.infolist())
    assert package.testzip() is None
    manifest = json.loads(package.read('manifest.json'))
    project = json.loads(package.read('project.json'))
    [layer] = project['layers']
    asset = package.read(layer['asset']['path'])
    assert asset == source
    assert manifest['preview']['status'] == 'rendered'
    merged, _ = checked_image(package.read('preview/merged.png'), 255)
    assert merged == generated
    with Image.open(io.BytesIO(package.read('preview/thumbnail.webp'))) as thumbnail:
        assert thumbnail.size == (256, 256)
        assert thumbnail.format == 'WEBP'
        assert hashlib.sha256(thumbnail.info['icc_profile']).hexdigest() == icc_hash
        assert thumbnail.convert('RGBA').tobytes() == generated
    print(json.dumps(dict(manifest=manifest, project=project,
                          sourcePixelSha256=hashlib.sha256(target_pixels).hexdigest(),
                          outputPixelSha256=hashlib.sha256(generated).hexdigest(),
                          outputSha256=hashlib.sha256(asset).hexdigest(), outputBytes=len(asset))))
`

function expectCatalog(catalog, fixture) {
  const { model } = fixture
  const version = catalog
    .find(({ id }) => id === model.resourceId)
    ?.versions.find(({ id }) => id === model.versionId)
  assert.equal(version?.name, model.versionName)
  assert.equal(version.fileStatus, 'ready')
  assert.equal(version.sha256, model.ref.fileSha256)
  assert.equal(version.fileSizeBytes, fixture.files[0].byteSize)
  assert.equal(version.baseModelFamily, fixture.family)
  assert.equal(version.predictionType, model.ref.predictionType)
}

export async function runTrainedGeneration({
  trained,
  launch,
  readPorts,
  closeNormally,
  retainOwnStore,
  root,
  identity,
  records,
  observeGpuWorker,
}) {
  const { fixture, databasePath, baseline, python } = trained
  const first = await launch('first')
  const ports = await readPorts(first)
  assert.deepEqual(ports.projects.value, [])
  expectCatalog(ports.catalog.value, fixture)
  const requested = await createAndAuthor(first.page, fixture)
  const { project, tab } = requested
  const snapshot = (closed = false) => snapshotDatabase(databasePath, { closed })
  const [initialRow] = snapshot().tables.project_index.rows
  const packagePath = initialRow.canonical_path
  assert.equal(initialRow.local_project_key, project.id)
  assert.equal(path.dirname(packagePath), path.join(fixture.appData, 'workspaces/Uncategorized'))
  assert.equal(path.extname(packagePath), '.igs')
  assert.equal(await realpath(packagePath), packagePath)
  const initialPackage = await identity(packagePath)

  await first.page.evaluate(() => {
    window.packagedQualificationProgress = []
    window.api.projects.onGenerationProgress((event) =>
      window.packagedQualificationProgress.push(event),
    )
  })
  const generate = first.page.getByRole('button', { name: 'Generate', exact: true })
  await expect(generate).toBeEnabled({ timeout: 90_000 })
  await observeGpuWorker(first)
  await generate.click()
  let admitted
  let worker
  await expect
    .poll(
      async () => {
        const rows = snapshot().tables.generation_queue_item.rows
        assert.ok(rows.length <= 1, 'One click must admit exactly one trained job.')
        if (rows.length === 1) {
          admitted = rows[0]
          if (admitted.status === 'running') worker ??= await runningWorker(first, trained)
          return 'admitted'
        }
        const { error } = await projectCall(first.page, 'getGenerationState', project.id)
        if (error) throw new Error('Actual packaged Generate refused: ' + JSON.stringify(error))
        return 'pending'
      },
      { timeout: 90_000, intervals: [100, 250, 500] },
    )
    .toBe('admitted')
  const frozen = assertFrozen(admitted, requested, fixture, packagePath)
  records.push({ name: 'Public Generate admits one exact frozen job', queueItemId: admitted.id })
  const afterCapturePrompt = 'Draft edited after trained capture.'
  await first.page
    .getByRole('textbox', { name: 'Positive prompt', exact: true })
    .fill(afterCapturePrompt)
  await expect
    .poll(async () => (await openTab(first.page, project.id)).generationDraft.positivePrompt.text)
    .toBe(afterCapturePrompt)

  let durable
  await expect
    .poll(
      async () => {
        durable = snapshot()
        const rows = durable.tables.generation_queue_item.rows
        assert.equal(rows.length, 1)
        assert.equal(rows[0].id, admitted.id)
        if (rows[0].status === 'pending' || rows[0].status === 'running') {
          if (rows[0].status === 'running') worker ??= await runningWorker(first, trained)
          return 'busy'
        }
        return 'terminal'
      },
      { timeout: 330_000, intervals: [250, 500, 1000] },
    )
    .toBe('terminal')
  const [row] = durable.tables.generation_queue_item.rows
  assert.equal(row.status, 'completed', JSON.stringify(row))
  assert.equal(row.frozen_payload_json, admitted.frozen_payload_json)
  assert.ok(worker, 'Observe the actual installed CUDA worker while the job is active.')
  await assertWorkerExited(worker)
  const cgroupRoot = path.join('/sys/fs/cgroup', worker.group)
  const resourceWitness = {}
  for (const filename of [
    'memory.max',
    'memory.swap.max',
    'memory.peak',
    'memory.events',
    'memory.stat',
  ]) {
    resourceWitness[filename] = (await readFile(path.join(cgroupRoot, filename), 'utf8')).trim()
  }
  assert.equal(resourceWitness['memory.swap.max'], '0')
  assert.match(resourceWitness['memory.events'], /^oom_kill 0$/m)
  const results = await projectCall(first.page, 'listGenerationResults', project.id)
  assert.equal(results.lastActualSeed, 0)
  assert.equal(results.recoveryUnavailable, false)
  assert.deepEqual(results.unfinishedSiblingJobIds, [])
  assert.equal(results.candidates.length, 1)
  const [candidate] = results.candidates
  const receipts = durable.tables.generation_candidate_receipt.rows
  assert.equal(receipts.length, 1)
  const [receipt] = receipts
  await retainGeneration({ row, candidate, frozen, receipt, root, dataRoot: fixture.appData })
  const progress = await first.page.evaluate(
    (id) => window.packagedQualificationProgress.filter(({ current }) => current?.jobId === id),
    row.id,
  )
  assert.ok(progress.length > 0, 'Observe real packaged preload denoising progress.')
  for (const { current } of progress) {
    assert.equal(current.projectKey, project.id)
    assert.equal(current.documentId, tab.documentId)
    assert.equal(current.statusSequence, receipt.expected_status_sequence)
    assert.equal(current.totalSteps, 3)
  }
  assert.equal(progress.at(-1).current.step, 3)
  assert.deepEqual((await openTab(first.page, project.id)).layers, [])
  assert.deepEqual(await identity(packagePath), initialPackage)

  await first.page.getByRole('button', { name: 'Add 1 as Layer', exact: true }).click()
  await expect.poll(async () => (await openTab(first.page, project.id)).layers.length).toBe(1)
  const accepted = await openTab(first.page, project.id)
  assert.equal(accepted.dirty, true)
  assert.equal(accepted.generationDraft.positivePrompt.text, afterCapturePrompt)
  const [layer] = accepted.layers
  const acceptedData = await projectCall(
    first.page,
    'getRasterGenerationData',
    project.id,
    accepted.documentId,
    layer.id,
  )
  assertPortableConfiguration(acceptedData.generationConfiguration, requested, fixture)
  assert.deepEqual(await identity(packagePath), initialPackage)
  await expect
    .poll(
      async () =>
        (await projectCall(first.page, 'listGenerationResults', project.id)).candidates.length,
    )
    .toBe(0)
  await first.page.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await openTab(first.page, project.id)).dirty).toBe(false)
  assert.equal((await openTab(first.page, project.id)).documentRevision, accepted.documentRevision)
  const [summary] = await projectCall(first.page, 'list')
  assert.equal(summary.previewStatus, 'rendered')
  await closeNormally(first)
  const saved = await retainOwnStore('after-first-close')
  assert.equal(saved.project.path, packagePath)
  assert.notEqual(saved.project.sha256, initialPackage.sha256)
  const inspection = JSON.parse(
    (
      await execute(
        python,
        [
          '-I',
          '-B',
          '-c',
          inspectArchive,
          path.join(root, saved.retainedProject),
          path.join(root, 'target.png'),
          path.join(root, 'candidate.png'),
          iccSha256,
        ],
        { timeout: 10_000, maxBuffer: 256 * 1024 },
      )
    ).stdout,
  )
  const { manifest, project: stored } = inspection
  assert.equal(stored.documentId, tab.documentId)
  assert.equal(stored.documentRevision, accepted.documentRevision)
  assert.equal(manifest.documentRevision, stored.documentRevision)
  assert.deepEqual(manifest.preview, { rect: bbox, status: 'rendered' })
  assert.equal(stored.lastActualSeedSnapshot, 0)
  assert.equal(stored.generationDraft.positivePrompt.text, afterCapturePrompt)
  const [storedLayer] = stored.layers
  assert.equal(storedLayer.id, layer.id)
  const provenance = storedLayer.generationProvenance
  assert.equal(provenance.kind, fixture.family + '-txt2img')
  assert.deepEqual(provenance.generationConfiguration, acceptedData.generationConfiguration)
  assert.deepEqual(provenance.layerSourceContext, {
    bbox,
    sourceDocumentId: tab.documentId,
    sourceDocumentRevision: tab.documentRevision,
    sourceTargetSha256: frozen.context.target.sha256,
  })
  const result = provenance.executionResultContext
  assert.equal(result.queueItemId, row.id)
  assert.equal(result.candidateId, candidate.candidateId)
  assert.equal(result.completedAt, candidate.completedAt)
  assert.deepEqual(result.output, {
    byteSize: receipt.image_byte_size,
    colorSpace: 'srgb',
    format: 'png',
    height: 256,
    iccSha256,
    sha256: receipt.image_sha256,
    width: 256,
  })
  assert.equal(storedLayer.asset.sha256, inspection.outputSha256)
  assert.equal(storedLayer.asset.bytes, inspection.outputBytes)
  assert.equal(inspection.outputSha256, receipt.image_sha256)
  const afterFirst = snapshot(true)
  assert.deepEqual(afterFirst.tables.generation_queue_item.rows, [row])
  assert.deepEqual(afterFirst.tables.generation_candidate_receipt.rows, [receipt])
  assert.deepEqual(afterFirst.schemaMigrations, baseline.schemaMigrations)
  for (const name of Object.keys(baseline.tables).filter((name) => name.startsWith('model_'))) {
    assert.deepEqual(afterFirst.tables[name], baseline.tables[name], name)
  }
  const [acceptedIndex] = afterFirst.tables.project_accepted_result_index.rows
  assert.equal(acceptedIndex.local_project_key, project.id)
  assert.equal(acceptedIndex.layer_id, layer.id)
  assert.equal(acceptedIndex.model_file_sha256, fixture.model.ref.fileSha256)
  assert.equal(acceptedIndex.document_revision, stored.documentRevision)

  const second = await launch('restarted')
  const restartedPorts = await readPorts(second)
  expectCatalog(restartedPorts.catalog.value, fixture)
  assert.equal(restartedPorts.projects.value.length, 1)
  await second.page.getByRole('button', { name: 'Open ' + project.title, exact: true }).click()
  await expect(second.page.getByRole('tab', { name: project.title, exact: true })).toBeVisible()
  const reopened = await openTab(second.page, project.id)
  assert.equal(reopened.documentRevision, stored.documentRevision)
  assert.equal(reopened.documentId, stored.documentId)
  assert.equal(reopened.dirty, false)
  assert.equal(reopened.layers.length, 1)
  assert.equal(reopened.layers[0].id, layer.id)
  assert.equal(reopened.generationDraft.positivePrompt.text, afterCapturePrompt)
  const reopenedData = await projectCall(
    second.page,
    'getRasterGenerationData',
    project.id,
    reopened.documentId,
    layer.id,
  )
  assert.deepEqual(reopenedData.generationConfiguration, provenance.generationConfiguration)
  assert.deepEqual(
    (await projectCall(second.page, 'listGenerationResults', project.id)).candidates,
    [],
  )
  await closeNormally(second)
  const restarted = await retainOwnStore('after-restarted-close')
  assert.deepEqual(restarted.project, saved.project)
  const afterReopen = snapshot(true)
  assert.equal(afterReopen.integrityCheck, 'ok')
  assert.deepEqual(afterReopen.foreignKeyCheck, [])
  for (const [key, value] of Object.entries(afterFirst.tables)) {
    if (key !== 'project_index') assert.deepEqual(afterReopen.tables[key], value, key)
  }
  for (const input of trained.inputs) assert.deepEqual(await identity(input.path), input)
  await assertModelFiles(fixture.files, identity, trained.engineRun)

  records.push({
    name: 'One actual trained packaged generation was explicitly accepted, saved and reopened',
    family: fixture.family,
    row,
    receipt,
    progress,
    provenance,
    worker,
    resourceWitness,
    initialRuntime: ports.runtime.value,
    reopenedRuntime: restartedPorts.runtime.value,
  })
  return {
    saved,
    restarted,
    trainedGeneration: {
      family: fixture.family,
      actualAdmissions: 1,
      actualCompletions: 1,
      model: fixture.model.ref,
      queueItemId: row.id,
      candidateId: candidate.candidateId,
      worker,
      resultSha256: inspection.outputSha256,
      resultBytes: inspection.outputBytes,
      resultPixelSha256: inspection.outputPixelSha256,
      targetPixelSha256: inspection.sourcePixelSha256,
      acceptedRasterId: layer.id,
      modelInputs: fixture.files,
      explicitAdd: true,
      explicitSave: true,
      sameSavedProjectAfterReopen: true,
    },
  }
}
