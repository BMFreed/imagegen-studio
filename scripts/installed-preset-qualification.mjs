/** Literal finite preset/inference oracle. No production mapper, planner or filesystem reads. */
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import path from 'node:path'

const artifactRoot = path.join(homedir(), '.codex/artifacts/imagegen-studio')
const icc = '113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1'
const resources = {
  illustriousEpsilon: {
    byteSize: 6938040416,
    sha256: 'ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1',
    kind: 'checkpoint',
    managedId: 700140,
    modelId: 833294,
    versionId: 1022833,
    fileId: 928571,
    objective: 'epsilon',
  },
  illustrious: {
    byteSize: 6938040794,
    sha256: 'edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d',
    kind: 'checkpoint',
    managedId: 700040,
    modelId: 1147756,
    versionId: 2679856,
    fileId: 2566634,
    objective: 'v_prediction',
  },
  illustriousLora: {
    byteSize: 114437420,
    sha256: 'c2bd847fb3859cc8ce16af6ecce291c96b36ca486999e620af9b886367ee6ee9',
    kind: 'lora',
    managedId: 700060,
    modelId: 700060,
    versionId: 700061,
    fileId: 700062,
  },
  externalVaeNative: {
    byteSize: 167335542,
    sha256: 'f09b42f799d82812ef38461205c4764ecb3e10384bb6ee198321124dbc59e9b7',
    kind: 'vae',
    managedId: 700080,
    modelId: 700070,
    versionId: 700081,
    fileId: 700082,
  },
}
const prompt = {
  text: 'a (red:1.3) ceramic cup on a wooden table, studio photograph',
  embeddingRefs: [],
}
const negativePrompt = { text: '(blurry:0.7), low quality', embeddingRefs: [] }
const allSections = [
  'prompt',
  'negativePrompt',
  'model',
  'loras',
  'size',
  'sampling',
  'guidance',
  'cfgRescale',
  'seed',
  'vae',
  'vaePrecision',
]

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}
function exactKeys(value, keys) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value))
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort())
}
function absolute(filename) {
  assert.ok(
    typeof filename === 'string' &&
      path.isAbsolute(filename) &&
      path.resolve(filename) === filename,
  )
}
function artifact(filename) {
  absolute(filename)
  assert.ok(
    filename.startsWith(artifactRoot + path.sep),
    'Path must be inside the owned artifact root.',
  )
}
function sha(value) {
  assert.match(value, /^[a-f0-9]{64}$/)
}
function overlaps(left, right) {
  return left === right || left.startsWith(right + path.sep) || right.startsWith(left + path.sep)
}

/** Strict lexical validation precedes all runner reads; the runner checks canonical containment. */
export function validateInstalledPresetFixture(fixture) {
  exactKeys(fixture, [
    'schemaVersion',
    'profile',
    'referenceFixture',
    'workerBaseline',
    'artifacts',
  ])
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.profile, 'installed-presets')
  artifact(fixture.artifacts)
  for (const descriptor of [fixture.referenceFixture, fixture.workerBaseline]) {
    exactKeys(descriptor, ['path', 'sha256'])
    artifact(descriptor.path)
    sha(descriptor.sha256)
    assert.equal(overlaps(fixture.artifacts, descriptor.path), false)
  }
  return freeze({
    expectedScopes: 4,
    expectedAdmissions: 8,
    expectedCompletions: 8,
    expectedAccepted: 4,
  })
}

export function installedPresetCurrentNoiseProfile(objective) {
  assert.ok(['epsilon', 'v_prediction'].includes(objective))
  return {
    schemaVersion: 1,
    baseSchedule: 'sdxl-scaled-linear-v1',
    rescaleBetasZeroSnr: objective === 'v_prediction',
    timestepSpacing: 'leading',
  }
}

/** Bind the prior installed descriptors to known trained bytes, without loading/hashing weights. */
export function assertInstalledPresetSources(reference) {
  absolute(reference.appData)
  for (const [key, expected] of Object.entries(resources)) {
    const source = reference[key]
    assert.ok(source, `Missing exact ${key} source.`)
    assert.equal(source.byteSize, expected.byteSize)
    assert.equal(source.sha256, expected.sha256)
    assert.equal(source.type, expected.kind)
    assert.equal(source.family, 'illustrious')
    for (const field of ['name', 'versionName'])
      assert.ok(typeof source[field] === 'string' && source[field].trim())
    exactKeys(source.installed, ['resourceId', 'versionId', 'managedPath'])
    for (const field of ['resourceId', 'versionId'])
      assert.ok(typeof source.installed[field] === 'string' && source.installed[field].trim())
    assert.equal(
      source.installed.managedPath,
      path.join(reference.appData, 'models', `qualified-${expected.managedId}.safetensors`),
    )
    if (expected.objective) {
      assert.equal(source.trainedObjective, expected.objective)
      for (const field of ['modelId', 'versionId', 'fileId'])
        assert.equal(source.origin[field], expected[field])
    }
  }
}

function resource(reference, key) {
  const source = reference[key]
  const expected = resources[key]
  return {
    baseModelFamily: 'illustrious',
    civitaiFileId: expected.fileId,
    civitaiModelId: expected.modelId,
    civitaiVersionId: expected.versionId,
    displayName: source.name,
    fileSha256: expected.sha256,
    kind: expected.kind,
    localModelId: source.installed.resourceId,
    localVersionId: source.installed.versionId,
    predictionType: expected.objective ?? null,
    versionName: source.versionName,
  }
}
function file(reference, key) {
  return {
    byteSize: resources[key].byteSize,
    path: reference[key].installed.managedPath,
    sha256: resources[key].sha256,
  }
}
function modelKey(objective) {
  assert.ok(['epsilon', 'v_prediction'].includes(objective))
  return objective === 'epsilon' ? 'illustriousEpsilon' : 'illustrious'
}
function expectedPayload(reference, objective) {
  return {
    prompt: structuredClone(prompt),
    negativePrompt: structuredClone(negativePrompt),
    model: {
      ...resource(reference, modelKey(objective)),
      noiseProfile: installedPresetCurrentNoiseProfile(objective),
    },
    loras: [{ enabled: true, resource: resource(reference, 'illustriousLora'), weight: -0.5 }],
    size: { width: 256, height: 256 },
    sampling: { sampler: 'Euler', scheduler: 'Normal' },
    guidance: { steps: 3, cfgScale: 4 },
    cfgRescale: 0,
    seed: { policy: 'fixed', value: 0 },
    vae: resource(reference, 'externalVaeNative'),
    vaePrecision: 'FP32',
  }
}
function draftFromPayload(payload) {
  const { noiseProfile: _noise, ...model } = payload.model
  return {
    primaryBbox: { x: 0, y: 0, ...payload.size },
    generationDraft: {
      model,
      positivePrompt: structuredClone(payload.prompt),
      negativePrompt: structuredClone(payload.negativePrompt),
      loras: structuredClone(payload.loras),
      sampling: { ...payload.sampling, ...payload.guidance, denoisingStrength: null },
      seed: structuredClone(payload.seed),
      vae: structuredClone(payload.vae),
      vaePrecision: payload.vaePrecision,
      cfgRescale: payload.cfgRescale,
      // Presets do not own dynamic batch settings; preserve the fresh Project's actual default.
      dynamicPrompt: { maxPrompts: 100, seedBehavior: 'per-iteration' },
    },
  }
}

/** Four distinct selection boundaries, each paired with independently manually authored inputs. */
export function installedPresetCases(reference) {
  assertInstalledPresetSources(reference)
  return freeze(
    ['epsilon', 'v_prediction'].flatMap((objective) =>
      ['full', 'partial'].map((scope) => {
        const target = expectedPayload(reference, objective)
        const other = objective === 'epsilon' ? 'v_prediction' : 'epsilon'
        const baselinePayload = structuredClone(target)
        baselinePayload.prompt.text = 'before Apply: a green glass bowl'
        baselinePayload.negativePrompt.text = 'before Apply negative'
        baselinePayload.guidance = { steps: 4, cfgScale: 5 }
        baselinePayload.cfgRescale = 0.25
        if (scope === 'full') {
          baselinePayload.model = {
            ...resource(reference, modelKey(other)),
            noiseProfile: installedPresetCurrentNoiseProfile(other),
          }
          baselinePayload.loras = []
          baselinePayload.size = { width: 320, height: 320 }
          baselinePayload.sampling = { sampler: 'Euler a', scheduler: 'Normal' }
          baselinePayload.seed = { policy: 'fixed', value: 37 }
          baselinePayload.vae = null
          baselinePayload.vaePrecision = 'Auto'
        }
        const sourcePayload = structuredClone(target)
        sourcePayload.cfgRescale = 0.25
        if (scope === 'full') {
          sourcePayload.model.predictionType = other
          sourcePayload.model.noiseProfile = {
            ...installedPresetCurrentNoiseProfile(other),
            timestepSpacing: 'trailing',
          }
        } else {
          sourcePayload.model = {
            ...resource(reference, modelKey(other)),
            noiseProfile: installedPresetCurrentNoiseProfile(other),
          }
          sourcePayload.loras = []
          sourcePayload.size = { width: 320, height: 320 }
          sourcePayload.sampling = { sampler: 'Euler a', scheduler: 'Normal' }
          sourcePayload.seed = { policy: 'fixed', value: 37 }
          sourcePayload.vae = null
          sourcePayload.vaePrecision = 'Auto'
        }
        const expectedDraft = draftFromPayload(target)
        if (scope === 'full') expectedDraft.generationDraft.model.predictionType = other
        return {
          id: `${objective}-${scope}`,
          name: `Installed ${objective === 'epsilon' ? 'EPS' : 'V'} ${scope}`,
          objective,
          scope,
          modelKey: modelKey(objective),
          baselinePayload,
          sourcePayload,
          expectedPayload: target,
          selectedSections:
            scope === 'full'
              ? [...allSections]
              : ['prompt', 'negativePrompt', 'guidance', 'cfgRescale'],
          editedFields: { cfgRescale: 0 },
          expectedDraft,
        }
      }),
    ),
  )
}

/** Assert the configured advisory snapshot separately from the authoritative executed policy. */
export function assertInstalledPresetDraft(tab, scope, { manualControl = false } = {}) {
  const expected = structuredClone(scope.expectedDraft)
  if (manualControl) expected.generationDraft.model.predictionType = scope.objective
  assert.deepEqual(tab.primaryBbox, expected.primaryBbox)
  for (const [field, value] of Object.entries(expected.generationDraft))
    assert.deepEqual(
      tab.generationDraft[field],
      value,
      `Configured ${field} must match the independently selected sections.`,
    )
  assert.equal(Object.hasOwn(tab.generationDraft.model, 'noiseProfile'), false)
}

export function assertInstalledPresetFrozen(frozen, scope, reference) {
  assertInstalledPresetSources(reference)
  assert.equal(scope.modelKey, modelKey(scope.objective))
  exactKeys(frozen, ['schemaVersion', 'originRequestId', 'kind', 'context', 'workerJob'])
  assert.equal(frozen.schemaVersion, 1)
  assert.equal(frozen.kind, 'illustrious-txt2img')
  assert.ok(typeof frozen.originRequestId === 'string' && frozen.originRequestId.length > 0)
  const { context, workerJob: job } = frozen
  exactKeys(context, [
    'schemaVersion',
    'kind',
    'documentId',
    'documentRevision',
    'bbox',
    'prompts',
    'sampling',
    'model',
    'loraStack',
    'loras',
    'embeddingRefs',
    'embeddings',
    'vae',
    'vaePrecision',
    'target',
  ])
  exactKeys(job, [
    'schemaVersion',
    'bbox',
    'prompts',
    'sampling',
    'checkpoint',
    'loras',
    'vae',
    'vaePrecision',
    'target',
  ])
  assert.equal(context.schemaVersion, 1)
  assert.equal(job.schemaVersion, 1)
  assert.equal(context.kind, 'normal-txt2img-preparation')
  for (const key of ['documentId', 'documentRevision'])
    assert.match(context[key], /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/)
  const bbox = { x: 0, y: 0, width: 256, height: 256 }
  const prompts = { positive: prompt.text, negative: negativePrompt.text }
  assert.deepEqual(context.bbox, bbox)
  assert.deepEqual(job.bbox, bbox)
  assert.deepEqual(context.prompts, prompts)
  assert.deepEqual(job.prompts, prompts)
  assert.deepEqual(context.sampling, {
    cfgRescale: 0,
    cfgScale: 4,
    invokeScheduler: 'euler',
    noiseProfile: installedPresetCurrentNoiseProfile(scope.objective),
    requestedSeedPolicy: 'fixed',
    sampler: 'Euler',
    scheduler: 'Normal',
    seed: 0,
    seedBehavior: 'per-iteration',
    steps: 3,
  })
  assert.deepEqual(job.sampling, {
    cfgRescale: 0,
    cfgScale: 4,
    noiseProfile: installedPresetCurrentNoiseProfile(scope.objective),
    scheduler: 'euler',
    seed: 0,
    steps: 3,
  })
  assert.deepEqual(context.model, {
    managedPath: reference[scope.modelKey].installed.managedPath,
    reference: resource(reference, scope.modelKey),
  })
  assert.deepEqual(job.checkpoint, {
    path: reference[scope.modelKey].installed.managedPath,
    predictionType: scope.objective,
    sha256: resources[scope.modelKey].sha256,
  })
  const lora = resource(reference, 'illustriousLora')
  assert.deepEqual(context.loraStack, [{ enabled: true, resource: lora, weight: -0.5 }])
  assert.deepEqual(context.loras, [
    {
      byteSize: resources.illustriousLora.byteSize,
      managedPath: reference.illustriousLora.installed.managedPath,
      reference: lora,
      weight: -0.5,
    },
  ])
  assert.deepEqual(job.loras, [{ ...file(reference, 'illustriousLora'), weight: -0.5 }])
  assert.deepEqual(context.embeddingRefs, { positive: [], negative: [] })
  assert.deepEqual(context.embeddings, { positive: [], negative: [] })
  assert.deepEqual(context.vae, {
    byteSize: resources.externalVaeNative.byteSize,
    managedPath: reference.externalVaeNative.installed.managedPath,
    reference: resource(reference, 'externalVaeNative'),
  })
  assert.deepEqual(job.vae, file(reference, 'externalVaeNative'))
  assert.equal(context.vaePrecision, 'FP32')
  assert.equal(job.vaePrecision, 'FP32')
  exactKeys(context.target, [
    'byteSize',
    'colorSpace',
    'format',
    'height',
    'iccSha256',
    'sha256',
    'width',
  ])
  assert.equal(context.target.width, 256)
  assert.equal(context.target.height, 256)
  assert.equal(context.target.colorSpace, 'srgb')
  assert.equal(context.target.format, 'png')
  assert.equal(context.target.iccSha256, icc)
  sha(context.target.sha256)
  assert.ok(
    Number.isSafeInteger(context.target.byteSize) &&
      context.target.byteSize > 0 &&
      context.target.byteSize <= 32 * 1024 * 1024,
  )
  assert.deepEqual(job.target, {
    byteSize: context.target.byteSize,
    height: 256,
    iccSha256: icc,
    sha256: context.target.sha256,
    width: 256,
  })
}

export function assertInstalledPresetConfiguration(config, scope, reference) {
  assertInstalledPresetSources(reference)
  assert.deepEqual(config, {
    cfgRescale: 0,
    loras: [{ enabled: true, resource: resource(reference, 'illustriousLora'), weight: -0.5 }],
    mode: 'txt2img',
    model: resource(reference, modelKey(scope.objective)),
    negativePrompt: structuredClone(negativePrompt),
    positivePrompt: structuredClone(prompt),
    sampling: {
      actualSeed: 0,
      cfgScale: 4,
      invokeScheduler: 'euler',
      noiseProfile: installedPresetCurrentNoiseProfile(scope.objective),
      requestedSeedPolicy: 'fixed',
      sampler: 'Euler',
      scheduler: 'Normal',
      seedBehavior: 'per-iteration',
      steps: 3,
    },
    size: { width: 256, height: 256 },
    vae: resource(reference, 'externalVaeNative'),
    vaePrecision: 'FP32',
  })
  for (const source of Object.values(resources))
    assert.equal(
      JSON.stringify(config).includes(`qualified-${source.managedId}.safetensors`),
      false,
    )
}

export function assertInstalledPresetResultPayload(payload, scope) {
  const expected = structuredClone(scope.expectedPayload)
  delete expected.seed
  assert.deepEqual(
    payload,
    expected,
    'Result preset must describe actual portable execution, without Seed or batch/source context.',
  )
}

/** Compare complete protected DB rows in O(originals + current), after one table read. */
export function assertInstalledPresetRetainedRows(originals, current, key) {
  assert.ok(['id', 'local_project_key'].includes(key), 'Use the declared table primary key.')
  assert.ok(Array.isArray(originals) && Array.isArray(current))
  const keyed = new Map()
  for (const row of current) {
    assert.ok(row && typeof row === 'object' && !Array.isArray(row))
    assert.ok(typeof row[key] === 'string' && row[key].trim().length > 0)
    assert.equal(keyed.has(row[key]), false, 'Current primary keys must be unique.')
    keyed.set(row[key], row)
  }
  const protectedKeys = new Set()
  for (const row of originals) {
    assert.ok(row && typeof row === 'object' && !Array.isArray(row))
    assert.ok(typeof row[key] === 'string' && row[key].trim().length > 0)
    assert.equal(protectedKeys.has(row[key]), false, 'Protected primary keys must be unique.')
    protectedKeys.add(row[key])
    assert.equal(keyed.has(row[key]), true, 'A protected row must still exist.')
    assert.deepEqual(
      keyed.get(row[key]),
      row,
      'Every column of a protected row must remain unchanged.',
    )
  }
}

/** Cross-project replay strips only validated opaque owners, never execution semantics. */
export function normalizeInstalledPresetExecutionInputs(frozen) {
  assert.ok(typeof frozen.originRequestId === 'string' && frozen.originRequestId.length > 0)
  for (const key of ['documentId', 'documentRevision'])
    assert.match(frozen.context[key], /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/)
  const result = structuredClone(frozen)
  delete result.originRequestId
  delete result.context.documentId
  delete result.context.documentRevision
  return result
}
