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
const noobaiNoise = {
  baseSchedule: 'sdxl-scaled-linear-v1',
  rescaleBetasZeroSnr: false,
  schemaVersion: 1,
  timestepSpacing: 'leading',
}
const noobaiEps = {
  source: [833294, 1022833, 928571, 'epsilon'],
  sha256: 'ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1',
  sizeBytes: 6938040416,
}
const noobaiPins = {
  'noobai-eps': noobaiEps,
  'noobai-eps-vae': noobaiEps,
  'noobai-eps-stack': noobaiEps,
  'noobai-v': {
    source: [1147756, 2679856, 2566634, 'v_prediction'],
    sha256: 'edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d',
    sizeBytes: 6938040794,
  },
}
const componentPins = {
  standaloneVae: {
    kind: 'vae',
    source: [1219546, 1594319, 1494323],
    sha256: 'fc7d6b12b37b12759e30b1109068a4bb2a0a84e79ab01262cc5af6b89a783ec6',
    sizeBytes: 334640988,
  },
  standaloneLora: {
    kind: 'lora',
    source: [1121001, 1260279, 1165414],
    sha256: 'c2bd847fb3859cc8ce16af6ecce291c96b36ca486999e620af9b886367ee6ee9',
    sizeBytes: 114437420,
  },
  standaloneEmbedding: {
    kind: 'embedding',
    source: [2360940, 2655289, 2542976],
    sha256: '91a95b244b8ba01d905d32ced7e3cc20eb74b4da8f519de3764505500d386c36',
    sizeBytes: 49736,
  },
}
const stackLoraWeight = -0.5
const stackEmbeddingToken = '<illustriousphoto>'

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
  const noobai = fixture.profile !== undefined
  assert.ok(!noobai || Object.hasOwn(noobaiPins, fixture.profile))
  assert.deepEqual(Object.keys(fixture).sort(), [
    'appData',
    'family',
    'files',
    'model',
    ...(noobai ? ['package', 'profile'] : []),
    'runtimeId',
    'schemaVersion',
  ])
  assert.equal(fixture.schemaVersion, 1)
  assert.ok(['illustrious', 'anima'].includes(fixture.family))
  if (noobai) {
    assert.equal(fixture.family, 'illustrious')
    assert.match(path.basename(run), new RegExp(`^trained-${fixture.profile}-r[1-9]\\d*$`))
  }
  assert.equal(fixture.appData, engine.dataRoot)
  assert.equal(fixture.runtimeId, engine.runtimeId)

  const previousPath = path.join(engine.run, 'native/report.json')
  const previousBefore = await identity(previousPath)
  const previous = JSON.parse(await readOwned(previousPath, 8 * 1024 * 1024))
  assert.deepEqual(await identity(previousPath), previousBefore)
  assert.equal(previous.outcome, 'PASS')
  assert.equal(previous.packagedInstalledRuntime.runtimeId, engine.runtimeId)
  assert.deepEqual(previous.packageBefore, previous.packageAfter)
  assert.deepEqual(await identity(appImage), noobai ? fixture.package : previous.packageBefore)
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
  const roles = fixture.family === 'anima' ? ['checkpoint', 'qwen3Encoder', 'vae'] : ['checkpoint']
  const standaloneRoles =
    fixture.profile === 'noobai-eps-stack'
      ? Object.keys(componentPins)
      : fixture.profile === 'noobai-eps-vae'
        ? ['standaloneVae']
        : []
  roles.push(...standaloneRoles)
  assert.deepEqual(
    files.map(({ role }) => role),
    roles,
  )
  const catalogInputs = []
  for (const [role, pin] of Object.entries(componentPins)) {
    const reference = model[role]
    const catalog = model[role + 'Catalog']
    assert.equal(Boolean(reference), standaloneRoles.includes(role))
    assert.equal(Boolean(catalog), Boolean(reference))
    if (!reference) continue
    const source = files.find((entry) => entry.role === role)
    assert.deepEqual(
      [reference.civitaiModelId, reference.civitaiVersionId, reference.civitaiFileId],
      pin.source,
    )
    assert.equal(reference.fileSha256, pin.sha256)
    assert.equal(source.sha256, pin.sha256)
    assert.equal(source.byteSize, pin.sizeBytes)
    assert.equal(reference.baseModelFamily, 'illustrious')
    assert.equal(reference.kind, pin.kind)
    assert.equal(reference.predictionType, null)
    const catalogRun = path.dirname(catalog.path)
    const installRuns = path.join(path.dirname(path.dirname(engine.run)), 'packaged-noobai-install')
    assert.equal(path.dirname(catalogRun), installRuns)
    assert.match(path.basename(catalogRun), /^\d{8}(?:-r[1-9]\d*)?$/)
    assert.equal(path.basename(catalog.path), 'closed-catalog.sqlite')
    assert.equal(
      path.relative(catalogRun, source.path),
      `install/data/imagegen-studio/models/${pin.sha256.slice(0, 2)}/${pin.sha256}.safetensors`,
    )
    assert.deepEqual(await identity(catalog.path), catalog)
    catalogInputs.push(catalog)
  }
  assert.equal(model.ref.fileSha256, files[0].sha256)
  if (noobai) {
    const pin = noobaiPins[fixture.profile]
    assert.deepEqual(
      [
        model.ref.civitaiModelId,
        model.ref.civitaiVersionId,
        model.ref.civitaiFileId,
        model.ref.predictionType,
      ],
      pin.source,
    )
    assert.equal(model.ref.fileSha256, pin.sha256)
    assert.equal(files[0].byteSize, pin.sizeBytes)
  }
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
  if (noobai) assert.deepEqual(baseline.tables.checkpoint_prediction_override.rows, [])
  return {
    fixture,
    databasePath,
    baseline,
    python,
    pythonPath,
    engineRun: engine.run,
    inputs: [fixtureBefore, previousBefore, ...catalogInputs],
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

async function createAndAuthor(page, fixture, root) {
  const title = 'Packaged trained ' + (fixture.profile ?? fixture.family)
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
  if (!model.standaloneVae) {
    // The existing trained modes also exercise the version picker.
    await expect(page.locator('[aria-label="Model version"]')).not.toHaveClass(
      /n-select--disabled/,
      {
        timeout: 90_000,
      },
    )
    await selectOption(page, 'Model version', model.versionName)
  }
  // The single-version EPS fixture uses its exact Default and waits for Main's file verification.
  const selected =
    fixture.profile === 'noobai-v' ? { ...model.ref, predictionType: 'epsilon' } : model.ref
  await expect
    .poll(async () => (await openTab(page, project.id)).generationDraft.model, { timeout: 90_000 })
    .toEqual(selected)
  if (fixture.profile === 'noobai-v') {
    await page.getByRole('button', { name: 'Manage Models', exact: true }).click()
    const manager = page.getByRole('dialog', { name: 'Model Manager', exact: true })
    const version = manager.locator('.version-row--project')
    const prediction = version.locator('.version-prediction')
    await expect(prediction).toContainText('Assumed default; check the model author’s guidance')
    await expect(prediction).toContainText('Epsilon')
    await prediction.locator('.n-base-selection').click()
    await page.getByText('V-prediction', { exact: true }).last().click()
    // Main rehashes the full 6.9 GB checkpoint before committing the exact-file override.
    await expect(prediction).toContainText('Chosen for this exact file', { timeout: 90_000 })
    await expect(prediction).toContainText('V-prediction')
    await page.screenshot({ path: path.join(root, 'noobai-v-prediction-override.png') })
    await manager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
    await expect(manager).toBeHidden()
  }
  if (family === 'anima') await selectOption(page, 'Anima method', 'Euler')
  else {
    await selectOption(page, 'Sampler', 'Euler')
    await selectOption(page, 'Scheduler', 'Normal')
  }
  if (model.standaloneVae) {
    const picker = page.locator('[aria-label="VAE"]')
    if (!(await picker.isVisible()))
      await page.getByText('Advanced Options', { exact: true }).click()
    await expect(picker).toBeVisible()
    await expect(
      page.getByText('Uses the VAE included in the checkpoint.', { exact: true }),
    ).toBeVisible()
    await picker.click()
    await page
      .locator('.model-option')
      .filter({ hasText: model.standaloneVae.displayName })
      .filter({ hasText: model.standaloneVae.versionName })
      .click()
    await expect
      .poll(async () => (await openTab(page, project.id)).generationDraft.vae)
      .toEqual(model.standaloneVae)
  }
  await setInput(page, 'Steps', 3)
  await setInput(page, 'CFG scale', 4)
  const random = page.getByRole('switch', { name: 'Random seed switch' })
  if ((await random.getAttribute('aria-checked')) === 'true') await random.click()
  await setInput(page, 'Generation seed', 0)
  const prompts = model.standaloneEmbedding
    ? { ...plainPrompts, negative: `${plainPrompts.negative}, ${stackEmbeddingToken}` }
    : family === 'anima'
      ? weightedPrompts
      : plainPrompts
  const loras = model.standaloneLora
    ? [{ enabled: true, resource: model.standaloneLora, weight: stackLoraWeight }]
    : []
  const embeddingRefs = {
    positive: [],
    negative: model.standaloneEmbedding
      ? [{ resource: model.standaloneEmbedding, token: stackEmbeddingToken }]
      : [],
  }
  if (model.standaloneLora) {
    await page.locator('[aria-label="Add LoRA"]').click()
    await page
      .locator('.model-option')
      .filter({ hasText: model.standaloneLora.displayName })
      .filter({ hasText: model.standaloneLora.versionName })
      .click()
    const weightLabel = model.standaloneLora.displayName + ' weight'
    await setInput(page, weightLabel, stackLoraWeight)
    await expect
      .poll(async () => (await openTab(page, project.id)).generationDraft.loras)
      .toEqual(loras)
  }
  for (const [sign, title] of [
    ['positive', 'Positive prompt'],
    ['negative', 'Negative prompt'],
  ]) {
    const editor = page.getByRole('textbox', { name: title, exact: true })
    if (sign === 'negative' && model.standaloneEmbedding) {
      await editor.fill(`${plainPrompts.negative}, illustriousphoto`)
      await page.getByRole('option', { name: /<illustriousphoto>/ }).click()
    } else {
      await editor.fill(prompts[sign])
    }
    await expect
      .poll(async () => (await openTab(page, project.id)).generationDraft[sign + 'Prompt'].text)
      .toBe(prompts[sign])
  }
  const tab = await openTab(page, project.id)
  assert.deepEqual(tab.layers, [])
  assert.deepEqual(tab.primaryBbox, bbox)
  assert.deepEqual(tab.generationDraft.model, selected)
  assert.deepEqual(tab.generationDraft.seed, { policy: 'fixed', value: 0 })
  assert.deepEqual(tab.generationDraft.loras, loras)
  if (model.standaloneEmbedding) {
    await expect
      .poll(async () => (await openTab(page, project.id)).generationDraft.negativePrompt)
      .toEqual({ text: prompts.negative, embeddingRefs: embeddingRefs.negative })
  }
  if (model.standaloneVae) assert.deepEqual(tab.generationDraft.vae, model.standaloneVae)
  assert.equal(tab.generationDraft.sampling.steps, 3)
  assert.equal(tab.generationDraft.sampling.cfgScale, 4)
  return { project, prompts, tab, loras, embeddingRefs }
}

function assertFrozen(row, requested, fixture, projectFile) {
  const { project, tab, prompts, loras, embeddingRefs } = requested
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
  assert.deepEqual(context.loraStack ?? [], loras)
  const lora = files.find(({ role }) => role === 'standaloneLora')
  assert.deepEqual(
    context.loras ?? [],
    lora
      ? [
          {
            reference: model.standaloneLora,
            managedPath: lora.path,
            byteSize: lora.byteSize,
            weight: stackLoraWeight,
          },
        ]
      : [],
  )
  assert.deepEqual(
    workerJob.loras ?? [],
    lora
      ? [
          {
            path: lora.path,
            sha256: lora.sha256,
            byteSize: lora.byteSize,
            weight: stackLoraWeight,
          },
        ]
      : [],
  )
  const embedding = files.find(({ role }) => role === 'standaloneEmbedding')
  if (embedding) {
    assert.deepEqual(context.embeddingRefs, embeddingRefs)
    assert.deepEqual(context.embeddings, {
      positive: [],
      negative: [
        {
          reference: model.standaloneEmbedding,
          managedPath: embedding.path,
          byteSize: embedding.byteSize,
          token: stackEmbeddingToken,
        },
      ],
    })
    assert.deepEqual(workerJob.embeddings, {
      positive: [],
      negative: [
        {
          path: embedding.path,
          sha256: embedding.sha256,
          byteSize: embedding.byteSize,
          token: stackEmbeddingToken,
        },
      ],
    })
  }
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
      predictionType: model.ref.predictionType,
      sha256: files[0].sha256,
    })
    assert.equal(workerJob.sampling.scheduler, 'euler')
    assert.equal(workerJob.sampling.seed, 0)
    assert.equal(workerJob.sampling.steps, 3)
    assert.equal(workerJob.sampling.cfgScale, 4)
    if (model.standaloneVae) {
      const {
        path: managedPath,
        sha256,
        byteSize,
      } = files.find(({ role }) => role === 'standaloneVae')
      assert.deepEqual(context.vae, { reference: model.standaloneVae, managedPath, byteSize })
      assert.deepEqual(workerJob.vae, { path: managedPath, sha256, byteSize })
      assert.equal(context.vaePrecision, 'Auto')
      assert.equal(workerJob.vaePrecision, 'Auto')
    }
    if (fixture.profile) {
      assert.deepEqual(context.sampling.noiseProfile, noobaiNoise)
      assert.deepEqual(workerJob.sampling.noiseProfile, noobaiNoise)
    }
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
  const { prompts, loras, embeddingRefs } = requested
  const { model, family, files } = fixture
  assert.equal(configuration.mode, 'txt2img')
  assert.deepEqual(configuration.model, model.ref)
  assert.deepEqual(configuration.positivePrompt, {
    text: prompts.positive,
    embeddingRefs: embeddingRefs.positive,
  })
  assert.deepEqual(configuration.negativePrompt, {
    text: prompts.negative,
    embeddingRefs: embeddingRefs.negative,
  })
  assert.deepEqual(configuration.loras ?? [], loras)
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
    if (model.standaloneVae) {
      assert.deepEqual(configuration.vae, model.standaloneVae)
      assert.equal(configuration.vaePrecision, 'Auto')
    }
    if (fixture.profile) {
      assert.equal(configuration.model.predictionType, noobaiPins[fixture.profile].source[3])
      assert.deepEqual(configuration.sampling.noiseProfile, noobaiNoise)
    }
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

function expectCatalog(catalog, fixture, predictionType = fixture.model.ref.predictionType) {
  const { model } = fixture
  const version = catalog
    .find(({ id }) => id === model.resourceId)
    ?.versions.find(({ id }) => id === model.versionId)
  assert.equal(version?.name, model.versionName)
  assert.equal(version.fileStatus, 'ready')
  assert.equal(version.sha256, model.ref.fileSha256)
  assert.equal(version.fileSizeBytes, fixture.files[0].byteSize)
  assert.equal(version.baseModelFamily, fixture.family)
  assert.equal(version.predictionType, predictionType)
  if (fixture.profile) {
    assert.equal(version.predictionTypeSource, predictionType === 'epsilon' ? 'default' : 'user')
  }
  for (const [role, pin] of Object.entries(componentPins)) {
    const ref = model[role]
    if (!ref) continue
    const resource = catalog.find(({ id }) => id === ref.localModelId)
    assert.equal(resource?.resourceType, pin.kind)
    assert.equal(resource.name, ref.displayName)
    const selected = resource.versions.find(({ id }) => id === ref.localVersionId)
    assert.equal(selected?.name, ref.versionName)
    assert.equal(selected.fileStatus, 'ready')
    assert.equal(selected.sha256, ref.fileSha256)
    assert.equal(selected.fileSizeBytes, pin.sizeBytes)
  }
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
  const noobai = fixture.profile !== undefined
  const noobaiV = fixture.profile === 'noobai-v'
  expectCatalog(ports.catalog.value, fixture, noobai ? 'epsilon' : undefined)
  const requested = await createAndAuthor(first.page, fixture, root)
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
  if (fixture.model.standaloneVae) {
    await first.page.getByRole('button', { name: 'Reset VAE', exact: true }).click()
    await expect
      .poll(async () => (await openTab(first.page, project.id)).generationDraft.vae)
      .toBeNull()
  }
  if (fixture.model.standaloneLora) {
    await first.page
      .getByRole('button', {
        name: 'Remove ' + fixture.model.standaloneLora.displayName,
        exact: true,
      })
      .click()
    await expect
      .poll(async () => (await openTab(first.page, project.id)).generationDraft.loras)
      .toEqual([])
  }
  if (fixture.model.standaloneEmbedding) {
    await first.page
      .getByRole('textbox', { name: 'Negative prompt', exact: true })
      .fill(plainPrompts.negative)
    await expect
      .poll(async () => (await openTab(first.page, project.id)).generationDraft.negativePrompt)
      .toEqual({ text: plainPrompts.negative, embeddingRefs: [] })
  }

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
  if (fixture.model.standaloneVae) assert.equal(stored.generationDraft.vae, null)
  if (fixture.model.standaloneLora) assert.deepEqual(stored.generationDraft.loras, [])
  if (fixture.model.standaloneEmbedding) {
    assert.deepEqual(stored.generationDraft.negativePrompt, {
      text: plainPrompts.negative,
      embeddingRefs: [],
    })
  }
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
  if (fixture.model.standaloneVae) {
    assert.deepEqual(afterFirst.tables.local_model_file, baseline.tables.local_model_file)
  }
  if (noobaiV) {
    const { rows } = afterFirst.tables.checkpoint_prediction_override
    assert.equal(rows.length, 1)
    const [{ prediction_type, sha256, size_bytes }] = rows
    assert.deepEqual(
      [prediction_type, sha256, size_bytes],
      ['v_prediction', fixture.files[0].sha256, fixture.files[0].byteSize],
    )
    assert.equal(stored.generationDraft.model.predictionType, 'epsilon')
  }
  if (noobai && !noobaiV) {
    assert.deepEqual(afterFirst.tables.checkpoint_prediction_override.rows, [])
    assert.equal(stored.generationDraft.model.predictionType, 'epsilon')
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
  if (fixture.model.standaloneVae) assert.equal(reopened.generationDraft.vae, null)
  if (fixture.model.standaloneLora) assert.deepEqual(reopened.generationDraft.loras, [])
  if (fixture.model.standaloneEmbedding) {
    assert.deepEqual(reopened.generationDraft.negativePrompt, {
      text: plainPrompts.negative,
      embeddingRefs: [],
    })
  }
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
      ...(noobai ? { profile: fixture.profile, explicitPredictionOverride: noobaiV } : {}),
      actualAdmissions: 1,
      actualCompletions: 1,
      model: fixture.model.ref,
      ...(fixture.model.standaloneVae && { vae: fixture.model.standaloneVae }),
      ...(fixture.model.standaloneLora && { loras: requested.loras }),
      ...(fixture.model.standaloneEmbedding && { embeddingRefs: requested.embeddingRefs }),
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
