/** Joint installed-component guards; no model loading, file reads or inferred release readiness. */
import assert from 'node:assert/strict'
import path from 'node:path'

import {
  assertNoiseCatalog,
  assertNoiseExecution,
  executionFor,
  noiseModelKeys,
  normalizeNoiseInputs,
  officialEpsilonIdentity,
  validateNoiseProfileFixture,
} from './noobai-noise-qualification.mjs'

export const componentStages = ['txt2img', 'img2img', 'outpaint', 'lifecycle']
export const componentChoices = [
  'fullstack',
  'lora-disabled',
  'positive-zero',
  'negative-zero',
  'vae-control',
  'ldm-layout',
]
export const componentKeys = [
  'embeddingTrained',
  'embeddingControl',
  'externalVaeLdm',
  'externalVaeNative',
  'externalVaeControl',
]
export const componentPublicationIds = {
  embeddingTrained: { managedId: 700_100, modelId: 2360940, versionId: 2655289, fileId: 2542976 },
  embeddingControl: { managedId: 700_110, modelId: 2360940, versionId: 700_111, fileId: 700_112 },
  externalVaeLdm: { managedId: 700_070, modelId: 700_070, versionId: 700_071, fileId: 700_072 },
  externalVaeNative: { managedId: 700_080, modelId: 700_070, versionId: 700_081, fileId: 700_082 },
  externalVaeControl: { managedId: 700_090, modelId: 700_070, versionId: 700_091, fileId: 700_092 },
}
export const trainedEmbeddingIdentity = {
  sha256: '91a95b244b8ba01d905d32ced7e3cc20eb74b4da8f519de3764505500d386c36',
  byteSize: 49736,
  origin: {
    kind: 'civitai-trained',
    modelId: 2360940,
    versionId: 2655289,
    fileId: 2542976,
    url: 'https://civitai.com/api/download/models/2655289?fileId=2542976',
    creator: 'CautionMergeAhead',
    creditRequired: true,
  },
}
const extractedVaeIdentities = {
  externalVaeLdm: {
    sha256: '642ca8780b893744a5a66f9dc762768186bb3c4d7a4b17fde2de3845377b7481',
    byteSize: 167333366,
    format: 'original-ldm',
  },
  externalVaeNative: {
    sha256: 'f09b42f799d82812ef38461205c4764ecb3e10384bb6ee198321124dbc59e9b7',
    byteSize: 167335542,
    format: 'diffusers',
  },
}

function exactKeys(value, expected, message) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), message)
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), message)
}
function absolute(value) {
  assert.ok(typeof value === 'string' && path.isAbsolute(value) && path.normalize(value) === value)
}
function sha(value) {
  assert.match(value, /^[a-f0-9]{64}$/)
}
function objectiveModelKey(objective) {
  assert.ok(
    ['epsilon', 'v_prediction'].includes(objective),
    'An exact trained objective is required.',
  )
  return objective === 'epsilon' ? 'illustriousEpsilon' : 'illustrious'
}
function tokenFor(value) {
  const filename = path.basename(value.path)
  assert.ok(/\.safetensors$/i.test(filename) && !/[<>\x00-\x1f\x7f/\\]/u.test(filename))
  const stem = filename.slice(0, -'.safetensors'.length)
  assert.ok(stem.trim())
  return `<${stem}>`
}
function descriptor(value, type) {
  exactKeys(
    value,
    ['path', 'sha256', 'byteSize', 'type', 'family', 'name', 'versionName', 'origin'],
    'Component source descriptors must retain exact identity, labels and origin fields.',
  )
  absolute(value.path)
  assert.ok(value.path.endsWith('.safetensors'))
  sha(value.sha256)
  assert.ok(Number.isSafeInteger(value.byteSize) && value.byteSize > 0)
  assert.equal(value.type, type)
  assert.equal(value.family, 'illustrious')
  for (const field of ['name', 'versionName'])
    assert.ok(
      typeof value[field] === 'string' && value[field].trim() === value[field] && value[field],
    )
}

export function componentStagePlan(stage) {
  assert.ok(
    componentStages.includes(stage),
    'A declared component qualification stage is required.',
  )
  const lifecycle = stage === 'lifecycle'
  return {
    mode: lifecycle ? 'img2img' : stage,
    choices: lifecycle ? ['fullstack'] : [...componentChoices],
    matchedPixelControlCases: lifecycle ? 0 : 5,
    fullMvpClaim: false,
    combinedMatrixClaim: false,
    expectedOutcome: {
      finiteCompletions: lifecycle ? 1 : 6,
      actualAdmissions: lifecycle ? 2 : 6,
      canceledOriginals: lifecycle ? 1 : 0,
      preservingRetryRefusals: lifecycle ? 3 : 0,
    },
  }
}

export function assertNoobaiComponentStageOutcome(summary) {
  objectiveModelKey(summary.objective)
  const plan = componentStagePlan(summary.stage)
  for (const [field, expected] of Object.entries(plan.expectedOutcome))
    assert.equal(summary[field], expected, `The ${summary.stage} stage requires exact ${field}.`)
  for (const field of ['matchedPixelControlCases', 'fullMvpClaim', 'combinedMatrixClaim'])
    assert.equal(
      summary[field],
      plan[field],
      'One bounded run cannot promote the full component matrix.',
    )
}

export function validateNoobaiComponentsFixture(fixture, ready) {
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.profile, 'noobai-components')
  const modelKey = objectiveModelKey(fixture.objective)
  const plan = componentStagePlan(fixture.stage)
  exactKeys(
    fixture,
    [
      'schemaVersion',
      'profile',
      'stage',
      'objective',
      'appData',
      'artifacts',
      'side',
      'steps',
      ...noiseModelKeys,
      'authorRecipes',
      ...componentKeys,
      ...(fixture.stage !== 'txt2img' ? ['commonSource'] : []),
      ...(fixture.stage === 'outpaint' ? ['lama'] : []),
    ],
    'The joint component fixture accepts exactly its five-resource/eight-version closure.',
  )
  absolute(fixture.appData)
  absolute(fixture.artifacts)
  const noiseFixture = Object.fromEntries(
    [
      'schemaVersion',
      'appData',
      'artifacts',
      'side',
      'steps',
      ...noiseModelKeys,
      'authorRecipes',
    ].map((key) => [key, fixture[key]]),
  )
  noiseFixture.profile = 'noise-profile'
  noiseFixture.stage = fixture.stage === 'outpaint' ? 'outpaint' : 'bounded'
  if (fixture.stage === 'outpaint') noiseFixture.lama = fixture.lama
  validateNoiseProfileFixture(noiseFixture, ready)
  for (const key of componentKeys)
    descriptor(fixture[key], key.startsWith('embedding') ? 'embedding' : 'vae')
  assert.equal(fixture.embeddingTrained.sha256, trainedEmbeddingIdentity.sha256)
  assert.equal(fixture.embeddingTrained.byteSize, trainedEmbeddingIdentity.byteSize)
  assert.deepEqual(fixture.embeddingTrained.origin, trainedEmbeddingIdentity.origin)
  assert.deepEqual(fixture.embeddingControl.origin, {
    kind: 'artificial-zero-control',
    sourceEmbeddingSha256: trainedEmbeddingIdentity.sha256,
  })
  assert.equal(fixture.embeddingControl.name, fixture.embeddingTrained.name)
  assert.notEqual(fixture.embeddingControl.versionName, fixture.embeddingTrained.versionName)
  assert.equal(tokenFor(fixture.embeddingControl), tokenFor(fixture.embeddingTrained))
  for (const [key, pinned] of Object.entries(extractedVaeIdentities)) {
    assert.equal(fixture[key].sha256, pinned.sha256)
    assert.equal(fixture[key].byteSize, pinned.byteSize)
    assert.deepEqual(fixture[key].origin, {
      kind: 'checkpoint-extraction',
      checkpointSha256: officialEpsilonIdentity.sha256,
      format: pinned.format,
    })
  }
  assert.deepEqual(fixture.externalVaeControl.origin, {
    kind: 'artificial-causal-control',
    sourceVaeSha256: extractedVaeIdentities.externalVaeNative.sha256,
    format: 'diffusers',
    decoderBiasAdd: 0.15,
  })
  assert.equal(
    new Set(
      ['externalVaeLdm', 'externalVaeNative', 'externalVaeControl'].map((key) => fixture[key].name),
    ).size,
    1,
  )
  assert.equal(
    new Set(
      ['externalVaeLdm', 'externalVaeNative', 'externalVaeControl'].map(
        (key) => fixture[key].versionName,
      ),
    ).size,
    3,
  )
  assert.equal(
    new Set([...noiseModelKeys, ...componentKeys].map((key) => fixture[key].sha256)).size,
    8,
  )
  if (fixture.stage !== 'txt2img') {
    const source = fixture.commonSource
    exactKeys(
      source,
      [
        'path',
        'sha256',
        'byteSize',
        'pixelSha256',
        'width',
        'height',
        'sourceQueueItemId',
        'sourcePackagePath',
        'objective',
      ],
      'Image-based controls require one objective-bound saved source.',
    )
    absolute(source.path)
    absolute(source.sourcePackagePath)
    sha(source.sha256)
    sha(source.pixelSha256)
    assert.ok(Number.isSafeInteger(source.byteSize) && source.byteSize > 0)
    assert.equal(source.width, 256)
    assert.equal(source.height, 256)
    assert.ok(typeof source.sourceQueueItemId === 'string' && source.sourceQueueItemId.trim())
    assert.equal(source.objective, fixture.objective)
  }
  return {
    modelKey,
    execution: executionFor(modelKey, 'bounded'),
    ...plan,
    expectedCatalogResources: 5,
    expectedCatalogVersions: 8,
  }
}

/** Published fixture source IDs are independent of locally generated registry UUIDs. */
export function assertNoobaiComponentCatalog(catalog, fixture, { adopting = false } = {}) {
  assert.ok(Array.isArray(catalog))
  const baseHashes = new Set(noiseModelKeys.map((key) => fixture[key].sha256))
  const base = catalog.filter(({ versions }) =>
    versions.some(({ file }) => baseHashes.has(file.sha256)),
  )
  assertNoiseCatalog(base, fixture)
  for (const key of noiseModelKeys) {
    const declared = fixture[key]
    if (!declared.installed) continue
    const resource = base.find(({ versions }) => versions[0].file.sha256 === declared.sha256)
    assert.equal(resource.id, declared.installed.resourceId)
    assert.equal(resource.versions[0].id, declared.installed.versionId)
    assert.equal(resource.versions[0].file.managedPath, declared.installed.managedPath)
  }
  const added = catalog.filter((resource) => !base.includes(resource))
  assert.ok(adopting ? added.length <= 2 : added.length === 2)
  const seen = new Set()
  const resourceTypes = new Set()
  for (const resource of added) {
    const embedding = resource.type === 'embedding'
    assert.ok(
      embedding || resource.type === 'vae',
      'Only declared embedding and external VAE resources may be added.',
    )
    assert.ok(
      !resourceTypes.has(resource.type),
      'Versions must share exactly one resource of each component type.',
    )
    resourceTypes.add(resource.type)
    const allowed = embedding
      ? ['embeddingTrained', 'embeddingControl']
      : ['externalVaeLdm', 'externalVaeNative', 'externalVaeControl']
    assert.ok(resource.versions.length > 0 && resource.versions.length <= allowed.length)
    if (!adopting) assert.equal(resource.versions.length, allowed.length)
    const first = fixture[allowed[0]]
    assert.equal(resource.displayName, first.name)
    assert.deepEqual(resource.source, {
      kind: 'civitai',
      modelId: componentPublicationIds[allowed[0]].modelId,
    })
    assert.equal(resource.sourceMetadata.qualificationPrecondition, true)
    if (embedding) {
      assert.equal(resource.creator, trainedEmbeddingIdentity.origin.creator)
      assert.deepEqual(resource.sourceMetadata.origin, trainedEmbeddingIdentity.origin)
    } else assert.equal(resource.sourceMetadata.origin, undefined)
    assert.ok(resource.versions.some(({ id }) => id === resource.defaultVersionId))
    for (const version of resource.versions) {
      const key = allowed.find((key) => fixture[key].sha256 === version.file.sha256)
      assert.ok(
        key && !seen.has(key),
        'Every added exact identity must occur once in its declared resource.',
      )
      seen.add(key)
      const declared = fixture[key]
      const ids = componentPublicationIds[key]
      assert.equal(version.name, declared.versionName)
      assert.equal(version.file.sizeBytes, declared.byteSize)
      assert.equal(version.expectedSha256, declared.sha256)
      assert.equal(version.file.status, 'ready')
      assert.equal(version.file.originalFilename, path.basename(declared.path))
      assert.equal(
        version.file.managedPath,
        path.join(fixture.appData, 'models', `qualified-${ids.managedId}.safetensors`),
      )
      assert.equal(version.format, 'safetensors')
      assert.equal(version.baseModelFamily, 'illustrious')
      assert.equal(version.predictionType, null)
      assert.equal(version.civitaiVersionId, ids.versionId)
      assert.equal(version.civitaiFileId, ids.fileId)
      assert.deepEqual(version.dependencyVersionIds, {})
      assert.equal(version.sourceMetadata.qualificationPrecondition, true)
      assert.deepEqual(version.sourceMetadata.origin, declared.origin)
      if (declared.installed) {
        assert.equal(resource.id, declared.installed.resourceId)
        assert.equal(version.id, declared.installed.versionId)
        assert.equal(version.file.managedPath, declared.installed.managedPath)
      }
    }
  }
  assert.equal(catalog.length, 3 + added.length)
  assert.equal(catalog.flatMap(({ versions }) => versions).length, 3 + seen.size)
  if (!adopting) assert.deepEqual([...seen].sort(), [...componentKeys].sort())
  return seen
}

function componentReference(fixture, key) {
  const value = fixture[key]
  const ids = componentPublicationIds[key]
  assert.ok(
    value.installed &&
      typeof value.installed.resourceId === 'string' &&
      value.installed.resourceId &&
      typeof value.installed.versionId === 'string' &&
      value.installed.versionId,
  )
  assert.equal(
    value.installed.managedPath,
    path.join(fixture.appData, 'models', `qualified-${ids.managedId}.safetensors`),
  )
  return {
    baseModelFamily: 'illustrious',
    civitaiFileId: ids.fileId,
    civitaiModelId: ids.modelId,
    civitaiVersionId: ids.versionId,
    displayName: value.name,
    fileSha256: value.sha256,
    kind: value.type,
    localModelId: value.installed.resourceId,
    localVersionId: value.installed.versionId,
    predictionType: null,
    versionName: value.versionName,
  }
}
function componentSelection(choice) {
  assert.ok(componentChoices.includes(choice))
  return {
    vae:
      choice === 'ldm-layout'
        ? 'externalVaeLdm'
        : choice === 'vae-control'
          ? 'externalVaeControl'
          : 'externalVaeNative',
    positive: choice === 'positive-zero' ? 'embeddingControl' : 'embeddingTrained',
    negative: choice === 'negative-zero' ? 'embeddingControl' : 'embeddingTrained',
    enabled: choice !== 'lora-disabled',
  }
}

/** Verify the combined exact tuple before any normalization can hide a selected axis. */
export function assertNoobaiComponentFrozen(frozen, fixture, choice) {
  const modelKey = objectiveModelKey(fixture.objective)
  const execution = executionFor(modelKey, 'bounded')
  assertNoiseExecution(frozen, execution)
  const checkpoint = fixture[modelKey]
  const ref = frozen.context.model.reference
  assert.equal(ref.kind, 'checkpoint')
  assert.equal(ref.baseModelFamily, 'illustrious')
  assert.equal(ref.fileSha256, checkpoint.sha256)
  assert.equal(ref.displayName, checkpoint.name)
  assert.equal(ref.versionName, checkpoint.versionName)
  assert.equal(ref.localModelId, checkpoint.installed.resourceId)
  assert.equal(ref.localVersionId, checkpoint.installed.versionId)
  assert.equal(ref.civitaiModelId, checkpoint.origin.modelId)
  assert.equal(ref.civitaiVersionId, checkpoint.origin.versionId)
  assert.equal(ref.civitaiFileId, checkpoint.origin.fileId)
  assert.equal(frozen.context.model.managedPath, checkpoint.installed.managedPath)
  assert.equal(frozen.workerJob.checkpoint.path, checkpoint.installed.managedPath)
  assert.equal(frozen.workerJob.checkpoint.sha256, checkpoint.sha256)
  assert.deepEqual(frozen.workerJob.bbox, frozen.context.bbox)
  assert.equal(frozen.context.sampling.seed, 0)
  assert.equal(frozen.workerJob.sampling.seed, 0)
  assert.equal(frozen.context.vaePrecision, 'FP32')
  assert.equal(frozen.workerJob.vaePrecision, 'FP32')
  const selected = componentSelection(choice)
  const vae = fixture[selected.vae]
  assert.deepEqual(frozen.context.vae, {
    byteSize: vae.byteSize,
    managedPath: vae.installed.managedPath,
    reference: componentReference(fixture, selected.vae),
  })
  assert.deepEqual(frozen.workerJob.vae, {
    byteSize: vae.byteSize,
    path: vae.installed.managedPath,
    sha256: vae.sha256,
  })
  for (const polarity of ['positive', 'negative']) {
    const key = selected[polarity]
    const value = fixture[key]
    const token = tokenFor(value)
    const reference = componentReference(fixture, key)
    assert.deepEqual(frozen.context.embeddingRefs[polarity], [{ token, resource: reference }])
    assert.deepEqual(frozen.context.embeddings[polarity], [
      { token, byteSize: value.byteSize, managedPath: value.installed.managedPath, reference },
    ])
    assert.deepEqual(frozen.workerJob.embeddings[polarity], [
      { token, byteSize: value.byteSize, path: value.installed.managedPath, sha256: value.sha256 },
    ])
    assert.ok(
      frozen.context.prompts[polarity].includes(token),
      'Each declared polarity must contain its canonical literal embedding token.',
    )
    assert.equal(frozen.context.prompts[polarity].includes('igs_ti_private_'), false)
  }
  assert.deepEqual(frozen.workerJob.prompts, frozen.context.prompts)
  const lora = fixture.illustriousLora
  const loraReference = {
    baseModelFamily: 'illustrious',
    civitaiFileId: 700_062,
    civitaiModelId: 700_060,
    civitaiVersionId: 700_061,
    displayName: lora.name,
    fileSha256: lora.sha256,
    kind: 'lora',
    localModelId: lora.installed.resourceId,
    localVersionId: lora.installed.versionId,
    predictionType: null,
    versionName: lora.versionName,
  }
  assert.deepEqual(frozen.context.loraStack, [
    { enabled: selected.enabled, resource: loraReference, weight: -0.5 },
  ])
  assert.deepEqual(
    frozen.context.loras,
    selected.enabled
      ? [
          {
            byteSize: lora.byteSize,
            managedPath: lora.installed.managedPath,
            reference: loraReference,
            weight: -0.5,
          },
        ]
      : [],
  )
  assert.deepEqual(
    frozen.workerJob.loras,
    selected.enabled
      ? [
          {
            byteSize: lora.byteSize,
            path: lora.installed.managedPath,
            sha256: lora.sha256,
            weight: -0.5,
          },
        ]
      : [],
  )
}

function stripVersion(reference) {
  for (const field of [
    'fileSha256',
    'localVersionId',
    'civitaiVersionId',
    'civitaiFileId',
    'versionName',
  ])
    delete reference[field]
}
function stripComponentFile(snapshot, wire) {
  delete snapshot.byteSize
  delete snapshot.managedPath
  stripVersion(snapshot.reference)
  delete wire.byteSize
  delete wire.path
  delete wire.sha256
}

/**
 * Normalize one named component axis; checkpoint/noise/other-polarity/weight authoring stay
 * observable.
 */
export function normalizeNoobaiComponentInputs(frozen, choice) {
  componentSelection(choice)
  const value = normalizeNoiseInputs(frozen)
  if (choice === 'positive-zero' || choice === 'negative-zero') {
    const polarity = choice === 'positive-zero' ? 'positive' : 'negative'
    assert.equal(value.context.embeddingRefs[polarity].length, 1)
    assert.equal(value.context.embeddings[polarity].length, 1)
    assert.equal(value.workerJob.embeddings[polarity].length, 1)
    stripVersion(value.context.embeddingRefs[polarity][0].resource)
    stripComponentFile(
      value.context.embeddings[polarity][0],
      value.workerJob.embeddings[polarity][0],
    )
  } else if (choice === 'vae-control' || choice === 'ldm-layout') {
    assert.ok(value.context.vae && value.workerJob.vae)
    stripComponentFile(value.context.vae, value.workerJob.vae)
  } else if (choice === 'lora-disabled') {
    assert.equal(value.context.loraStack.length, 1)
    const enabled = value.context.loraStack[0].enabled
    assert.equal(typeof enabled, 'boolean')
    assert.equal(value.context.loras.length, enabled ? 1 : 0)
    assert.equal(value.workerJob.loras.length, enabled ? 1 : 0)
    if (enabled) {
      const authored = value.context.loraStack[0]
      const effective = value.context.loras[0]
      const wire = value.workerJob.loras[0]
      assert.deepEqual(effective.reference, authored.resource)
      assert.equal(effective.weight, authored.weight)
      assert.deepEqual(wire, {
        byteSize: effective.byteSize,
        path: effective.managedPath,
        sha256: authored.resource.fileSha256,
        weight: authored.weight,
      })
    }
    delete value.context.loraStack[0].enabled
    // Active tensors disappear only together with the independently checked enable transition.
    delete value.context.loras
    delete value.workerJob.loras
  }
  return value
}

function rgbaImage(value) {
  assert.ok(
    value &&
      Number.isSafeInteger(value.width) &&
      value.width > 0 &&
      Number.isSafeInteger(value.height) &&
      value.height > 0,
  )
  assert.ok(
    value.rgba instanceof Uint8Array && value.rgba.length === value.width * value.height * 4,
  )
}
function visibleOutpaint(full, control, equal) {
  for (const value of [full.contribution, control.contribution, full.preview, control.preview])
    rgbaImage(value)
  assert.deepEqual(control.bbox, full.bbox)
  assert.deepEqual(control.previewRect, full.previewRect)
  assert.ok(full.bbox && Number.isSafeInteger(full.bbox.x) && Number.isSafeInteger(full.bbox.y))
  assert.ok(
    full.previewRect &&
      Number.isSafeInteger(full.previewRect.x) &&
      Number.isSafeInteger(full.previewRect.y),
  )
  assert.equal(full.contribution.width, full.bbox.width)
  assert.equal(full.contribution.height, full.bbox.height)
  assert.equal(control.contribution.width, full.contribution.width)
  assert.equal(control.contribution.height, full.contribution.height)
  assert.equal(full.preview.width, full.previewRect.width)
  assert.equal(full.preview.height, full.previewRect.height)
  assert.equal(control.preview.width, full.preview.width)
  assert.equal(control.preview.height, full.preview.height)
  let visible = 0
  let rgbChanged = 0
  let mergedChanged = 0
  for (let y = 0; y < full.contribution.height; y++) {
    for (let x = 0; x < full.contribution.width; x++) {
      const offset = (y * full.contribution.width + x) * 4
      assert.equal(
        control.contribution.rgba[offset + 3],
        full.contribution.rgba[offset + 3],
        'A component ablation must preserve the exact contribution alpha mask.',
      )
      if (full.contribution.rgba[offset + 3] === 0) continue
      visible++
      if (
        [0, 1, 2].some(
          (channel) =>
            control.contribution.rgba[offset + channel] !==
            full.contribution.rgba[offset + channel],
        )
      )
        rgbChanged++
      const px = full.bbox.x + x - full.previewRect.x
      const py = full.bbox.y + y - full.previewRect.y
      assert.ok(
        px >= 0 && py >= 0 && px < full.preview.width && py < full.preview.height,
        'Every visible generated pixel must be covered by the saved merged preview.',
      )
      const p = (py * full.preview.width + px) * 4
      assert.equal(control.preview.rgba[p + 3], full.preview.rgba[p + 3])
      if (
        [0, 1, 2].some(
          (channel) => control.preview.rgba[p + channel] !== full.preview.rgba[p + channel],
        )
      )
        mergedChanged++
    }
  }
  assert.ok(visible > 0)
  if (equal) {
    assert.deepEqual(
      control.contribution.rgba,
      full.contribution.rgba,
      'Same-weight LDM/native layouts must have equal complete contribution RGBA.',
    )
    assert.deepEqual(
      control.preview.rgba,
      full.preview.rgba,
      'Same-weight LDM/native layouts must have equal complete merged preview RGBA.',
    )
  } else {
    assert.ok(
      rgbChanged > 0,
      'A component control must change visible generated RGB, not only invisible RGB.',
    )
    assert.ok(
      mergedChanged > 0,
      'A component control must change visible generated pixels in the saved merged preview.',
    )
  }
  return {
    visiblePixels: visible,
    changedContributionPixels: rgbChanged,
    changedMergedPixels: mergedChanged,
  }
}

export function assertNoobaiComponentPixels(cases, mode) {
  assert.ok(['txt2img', 'img2img', 'outpaint'].includes(mode))
  assert.deepEqual(
    cases.map(({ choice }) => choice),
    componentChoices,
    'Exactly six independently declared component choices are required in fixed order.',
  )
  const full = cases[0]
  const evidence = []
  for (const value of cases) {
    sha(value.target.sha256)
    sha(value.target.pixelSha256)
    sha(value.dimensions.pixelSha256)
  }
  for (const control of cases.slice(1)) {
    assert.deepEqual(
      normalizeNoobaiComponentInputs(control.frozen, control.choice),
      normalizeNoobaiComponentInputs(full.frozen, control.choice),
      'Only the named component axis may differ; noise, prompts, other polarity and target stay matched.',
    )
    assert.deepEqual(
      control.target,
      full.target,
      'Every component case must use one identical frozen source target.',
    )
    const equal = control.choice === 'ldm-layout'
    if (equal)
      assert.equal(
        control.dimensions.pixelSha256,
        full.dimensions.pixelSha256,
        'Same-weight LDM/native layouts must produce identical decoded pixels.',
      )
    else
      assert.notEqual(
        control.dimensions.pixelSha256,
        full.dimensions.pixelSha256,
        'Each trained component must change pixels relative to its independent matched control.',
      )
    evidence.push({
      choice: control.choice,
      ...(mode === 'outpaint' ? visibleOutpaint(full, control, equal) : {}),
    })
  }
  return evidence
}
