import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  IgsIllustriousRasterGenerationProvenanceV1,
  IgsManifestV1,
  IgsProjectDocumentV1,
} from './project-schema.js'

import { IGS_SRGB_ICC_SHA256 } from './color-profile.js'
import {
  createEmptyProjectDocumentV1,
  IGS_GENERATION_PNG_MAX_BYTES,
  IGS_MIMETYPE,
  IGS_REQUIRED_MEMBER_PATHS,
  IgsSchemaError,
  isIgsMemberPathV1,
  isRasterGenerationConfigurationV1,
  parseIgsManifestV1,
  parseProjectDocumentV1,
  parseRasterGenerationProvenanceV1,
  validateIgsPackageMetadataV1,
} from './project-schema.js'

const DOCUMENT_ID = 'f1099bf4-05ea-44d8-b5de-6884ece7ba45'
const REVISION_ID = '6ea21a66-41e5-43ee-80e2-e9837b7c0eb8'
const LAYER_ID = 'b8468727-804a-4522-a3e7-c5145967e43f'
const MODEL_ID = '57424ef4-e87e-4413-9c38-17ec576265f2'
const VERSION_ID = 'd89496a9-c30f-42c9-bfcb-1d82c68963c1'
const SHA256 = 'a'.repeat(64)
const SECOND_SHA256 = 'b'.repeat(64)
const ASSET_PATH = `assets/layers/${LAYER_ID}.png`

test('optional native method is portable draft data without defaults or rewriting Illustrious accepted results', () => {
  const legacy = emptyDocument()
  assert.equal(
    Object.hasOwn(parseProjectDocumentV1(legacy).generationDraft.sampling, 'animaMethod'),
    false,
  )
  for (const animaMethod of [
    'euler',
    'heun',
    'dpmpp_2m',
    'dpmpp_2m_sde',
    'er_sde',
    'lcm',
  ] as const) {
    const document = emptyDocument()
    document.generationDraft.sampling.animaMethod = animaMethod
    assert.deepEqual(parseProjectDocumentV1(document), document)
    assert.equal(document.generationDraft.sampling.sampler, null)
    assert.equal(document.generationDraft.sampling.scheduler, null)
  }
  for (const animaMethod of [null, '', 'Euler', 'euler_a', 'turbo', 0, {}, []]) {
    const document = emptyDocument()
    Object.assign(document.generationDraft.sampling, { animaMethod })
    assert.throws(() => parseProjectDocumentV1(document), assertSchemaCode('INVALID_PROJECT'))
  }
  const accepted = rasterGenerationProvenance()
  Object.assign(accepted.generationConfiguration.sampling, { animaMethod: 'euler' })
  assert.equal(isRasterGenerationConfigurationV1(accepted.generationConfiguration), false)
  assert.throws(
    () => parseRasterGenerationProvenanceV1(accepted),
    assertSchemaCode('INVALID_PROJECT'),
  )
})

function emptyDocument(): IgsProjectDocumentV1 {
  return createEmptyProjectDocumentV1({
    documentId: DOCUMENT_ID,
    documentRevision: REVISION_ID,
    title: 'A portable project',
  })
}

function emptyManifest(): IgsManifestV1 {
  return {
    documentId: DOCUMENT_ID,
    documentRevision: REVISION_ID,
    members: IGS_REQUIRED_MEMBER_PATHS.map((path) => ({ bytes: 128, path, sha256: SHA256 })),
    preview: { rect: null, status: 'empty' },
    schemaVersion: 1,
  }
}

function exactResource(kind: 'checkpoint' | 'embedding' | 'lora' | 'vae') {
  return {
    baseModelFamily: 'illustrious' as const,
    civitaiFileId: 93,
    civitaiModelId: 91,
    civitaiVersionId: 92,
    displayName: `${kind} resource`,
    fileSha256: SHA256,
    kind,
    localModelId: 'local-model-1',
    localVersionId: 'local-version-1',
    predictionType: 'epsilon' as const,
    versionName: 'v1',
  }
}

function rasterGenerationProvenance(): IgsIllustriousRasterGenerationProvenanceV1 {
  return {
    executionResultContext: {
      acceptedAt: '2026-09-29T12:01:00.000Z',
      candidateId: 'b445fc9d-260e-4ad2-b1e0-408dcb054edd',
      completedAt: '2026-09-29T12:00:00.000Z',
      output: {
        byteSize: 1024,
        colorSpace: 'srgb',
        format: 'png',
        height: 128,
        iccSha256: IGS_SRGB_ICC_SHA256,
        sha256: SECOND_SHA256,
        width: 64,
      },
      queueItemId: 'e7fd735d-54ce-46e8-a101-60565130182a',
    },
    generationConfiguration: {
      mode: 'txt2img',
      model: {
        ...exactResource('checkpoint'),
        kind: 'checkpoint',
        localModelId: MODEL_ID,
        localVersionId: VERSION_ID,
      },
      negativePrompt: { embeddingRefs: [], text: '' },
      positivePrompt: { embeddingRefs: [], text: 'portrait' },
      sampling: {
        actualSeed: 4_294_967_295,
        cfgScale: 7,
        invokeScheduler: 'dpmpp_2m_k',
        requestedSeedPolicy: 'random',
        sampler: 'DPM++ 2M',
        scheduler: 'Karras',
        steps: 30,
      },
      size: { height: 128, width: 64 },
    },
    kind: 'illustrious-txt2img',
    layerSourceContext: {
      bbox: { height: 128, width: 64, x: -12, y: 25 },
      sourceDocumentId: DOCUMENT_ID,
      sourceDocumentRevision: REVISION_ID,
      sourceTargetSha256: SHA256,
    },
    schemaVersion: 1,
  }
}

function generatedDocument(): IgsProjectDocumentV1 {
  const document = emptyDocument()
  document.layers.push({
    asset: { bytes: 1024, height: 128, path: ASSET_PATH, sha256: SECOND_SHA256, width: 64 },
    blendMode: 'normal',
    generationProvenance: rasterGenerationProvenance(),
    id: LAYER_ID,
    kind: 'raster',
    locked: false,
    name: 'Generated portrait',
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -12, y: 25 },
    visible: true,
  })
  return document
}

function assertSchemaCode(code: IgsSchemaError['code']): (error: unknown) => boolean {
  return (error) => error instanceof IgsSchemaError && error.code === code
}

test('new v1 document has infinite-coordinate bbox and nullable generation resources', () => {
  assert.equal(IGS_MIMETYPE, 'application/vnd.imagegen-studio.project+zip')
  const document = emptyDocument()
  assert.deepEqual(document.primaryBbox, { height: 1024, width: 1024, x: 0, y: 0 })
  assert.equal(document.generationDraft.model, null)
  assert.equal(document.generationDraft.vae, null)
  assert.equal(document.lastActualSeedSnapshot, null)
  assert.equal(document.colorSpace, 'srgb')
  assert.deepEqual(document.layers, [])
  assert.equal('canvas' in document, false)

  const moved = { ...document, primaryBbox: { height: 1152, width: 768, x: -20_000, y: 15_000 } }
  assert.deepEqual(parseProjectDocumentV1(moved).primaryBbox, moved.primaryBbox)
  assert.deepEqual(validateIgsPackageMetadataV1(emptyManifest(), document).document, document)
})

test('exact resource refs, plain prompts, embedding sidecars and typed advanced fields survive parse', () => {
  const document = emptyDocument()
  document.generationDraft.model = exactResource('checkpoint')
  document.generationDraft.vae = exactResource('vae')
  document.generationDraft.loras = [
    { enabled: true, resource: exactResource('lora'), weight: 0.75 },
  ]
  document.generationDraft.positivePrompt = {
    embeddingRefs: [{ resource: exactResource('embedding'), token: '<style>' }],
    text: 'portrait, <style>',
  }
  document.generationDraft.cfgRescale = 0.5
  document.generationDraft.vaePrecision = 'FP16'
  document.generationDraft.clipSkip = 2
  document.lastActualSeedSnapshot = 4_294_967_295

  assert.deepEqual(parseProjectDocumentV1(document), document)
})

test('accepted Illustrious provenance parses on the actual Raster Layer without changing legacy layers', () => {
  const generated = generatedDocument()
  assert.notEqual(
    generated.layers[0].id,
    generated.layers[0].generationProvenance?.executionResultContext.candidateId,
  )
  assert.deepEqual(
    parseRasterGenerationProvenanceV1(generated.layers[0].generationProvenance),
    rasterGenerationProvenance(),
  )
  assert.deepEqual(parseProjectDocumentV1(generated), generated)

  const legacy = generatedDocument()
  delete legacy.layers[0].generationProvenance
  assert.deepEqual(parseProjectDocumentV1(legacy), legacy)
})

test('ordinary Euler and ancestral accepted configuration keys survive portable readers in every Illustrious mode', () => {
  for (const { invokeScheduler, sampler } of [
    { invokeScheduler: 'euler' as const, sampler: 'Euler' },
    { invokeScheduler: 'euler_a' as const, sampler: 'Euler a' },
  ]) {
    const provenance = rasterGenerationProvenance()
    Object.assign(provenance.generationConfiguration.sampling, {
      invokeScheduler,
      sampler,
      scheduler: 'Normal',
    })
    assert.deepEqual(parseRasterGenerationProvenanceV1(provenance), provenance)
    const document = generatedDocument()
    document.layers[0].generationProvenance = provenance
    Object.assign(document.generationDraft.sampling, { sampler, scheduler: 'Normal' })
    assert.deepEqual(parseProjectDocumentV1(document), document)
    for (const mode of ['txt2img', 'img2img', 'outpaint'] as const) {
      const configuration = {
        ...provenance.generationConfiguration,
        mode,
        sampling: {
          ...provenance.generationConfiguration.sampling,
          ...(mode === 'txt2img' ? {} : { denoisingStrength: 0.5 }),
        },
      }
      assert.equal(isRasterGenerationConfigurationV1(configuration), true)
      for (const alias of ['Euler', 'euler_normal', 'Euler a']) {
        const invalid = structuredClone(configuration)
        Object.assign(invalid.sampling, { invokeScheduler: alias })
        assert.equal(isRasterGenerationConfigurationV1(invalid), false)
      }
    }
  }
  assert.equal(emptyDocument().generationDraft.sampling.sampler, null)
  assert.equal(emptyDocument().generationDraft.sampling.scheduler, null)
})

test('accepted provenance rejects unportable fields, invalid model/geometry and forged output metadata', () => {
  assert.equal(IGS_GENERATION_PNG_MAX_BYTES, 32 * 1024 * 1024)
  const invalidCases: ((document: IgsProjectDocumentV1) => void)[] = [
    (document) => {
      Object.assign(document.layers[0].generationProvenance!, { regionalGuidance: [] })
    },
    (document) => {
      Object.assign(document.layers[0].generationProvenance!.executionResultContext.output, {
        localPath: '/tmp/result.png',
      })
    },
    (document) => {
      document.layers[0].generationProvenance!.generationConfiguration.model.predictionType = null
    },
    (document) => {
      document.layers[0].generationProvenance!.generationConfiguration.model.localModelId =
        '/home/user/models/checkpoint'
    },
    (document) => {
      document.layers[0].generationProvenance!.generationConfiguration.size.width = 72
    },
    (document) => {
      document.layers[0].generationProvenance!.executionResultContext.output.sha256 = 'not-a-hash'
    },
    (document) => {
      document.layers[0].generationProvenance!.executionResultContext.output.byteSize =
        IGS_GENERATION_PNG_MAX_BYTES + 1
    },
    (document) => {
      document.layers[0].generationProvenance!.executionResultContext.acceptedAt =
        '2026-02-30T12:01:00.000Z'
    },
    (document) => {
      document.layers[0].generationProvenance!.generationConfiguration.positivePrompt.embeddingRefs =
        [{ resource: exactResource('lora'), token: '<style>' }] as never
    },
  ]
  for (const mutate of invalidCases) {
    const document = generatedDocument()
    mutate(document)
    assert.throws(() => parseProjectDocumentV1(document), assertSchemaCode('INVALID_PROJECT'))
  }
})

test('v1 document rejects finite-canvas mock fields, malformed kinds and invalid seed', () => {
  const withCanvas = { ...emptyDocument(), canvas: { height: 1024, width: 1024 } }
  assert.throws(() => parseProjectDocumentV1(withCanvas), assertSchemaCode('INVALID_PROJECT'))

  const wrongKind = emptyDocument()
  wrongKind.generationDraft.model = exactResource('lora')
  assert.throws(() => parseProjectDocumentV1(wrongKind), assertSchemaCode('INVALID_PROJECT'))

  const invalidSeed = { ...emptyDocument(), lastActualSeedSnapshot: 4_294_967_296 }
  assert.throws(() => parseProjectDocumentV1(invalidSeed), assertSchemaCode('INVALID_PROJECT'))
  assert.throws(
    () => parseProjectDocumentV1({ ...emptyDocument(), colorSpace: 'display-p3' }),
    assertSchemaCode('INVALID_PROJECT'),
  )
  assert.throws(
    () => parseProjectDocumentV1({ ...emptyDocument(), title: '   ' }),
    assertSchemaCode('INVALID_PROJECT'),
  )
})

test('manifest rejects missing, duplicate, dangerous and future-schema members', () => {
  assert.throws(
    () => parseIgsManifestV1({ ...emptyManifest(), schemaVersion: 2 }),
    assertSchemaCode('UNSUPPORTED_SCHEMA'),
  )
  assert.throws(
    () => parseIgsManifestV1({ ...emptyManifest(), schemaVersion: '2' }),
    assertSchemaCode('INVALID_MANIFEST'),
  )
  assert.throws(
    () => parseIgsManifestV1({ ...emptyManifest(), members: emptyManifest().members.slice(1) }),
    assertSchemaCode('INVALID_MANIFEST'),
  )
  assert.throws(
    () =>
      parseIgsManifestV1({
        ...emptyManifest(),
        members: [...emptyManifest().members, emptyManifest().members[0]],
      }),
    assertSchemaCode('INVALID_MANIFEST'),
  )
  for (const path of ['../project.json', '/tmp/project.json', String.raw`assets\layers\evil.png`]) {
    assert.equal(isIgsMemberPathV1(path), false)
    assert.throws(
      () =>
        parseIgsManifestV1({ ...emptyManifest(), members: [{ bytes: 1, path, sha256: SHA256 }] }),
      assertSchemaCode('INVALID_MANIFEST'),
    )
  }
})

test('preview state requires a visible-content rect only for rendered or unavailable previews', () => {
  const renderedWithoutRect = {
    ...emptyManifest(),
    preview: { rect: null, status: 'rendered' },
  }
  const emptyWithRect = {
    ...emptyManifest(),
    preview: { rect: { height: 1, width: 1, x: 0, y: 0 }, status: 'empty' },
  }
  assert.throws(() => parseIgsManifestV1(renderedWithoutRect), assertSchemaCode('INVALID_MANIFEST'))
  assert.throws(() => parseIgsManifestV1(emptyWithRect), assertSchemaCode('INVALID_MANIFEST'))
  const unavailable = {
    ...emptyManifest(),
    preview: { rect: { height: 64, width: 32, x: -10, y: 20 }, status: 'unavailable' },
  }
  assert.equal(parseIgsManifestV1(unavailable).preview.status, 'unavailable')
  const wideWorldRect = {
    ...emptyManifest(),
    preview: {
      rect: { height: 2, width: 1_000_002, x: -500_000, y: 0 },
      status: 'rendered',
    },
  }
  assert.deepEqual(parseIgsManifestV1(wideWorldRect).preview.rect, wideWorldRect.preview.rect)
  assert.throws(
    () =>
      parseIgsManifestV1({
        ...wideWorldRect,
        preview: {
          ...wideWorldRect.preview,
          rect: { ...wideWorldRect.preview.rect, width: 4_400_000_001 },
        },
      }),
    assertSchemaCode('INVALID_MANIFEST'),
  )
  assert.throws(
    () => validateIgsPackageMetadataV1(unavailable, emptyDocument()),
    assertSchemaCode('PACKAGE_MISMATCH'),
  )
})

test('manifest and document must agree on IDs, revision, and every raster asset', () => {
  const document = emptyDocument()
  document.layers.push({
    asset: { bytes: 1024, height: 128, path: ASSET_PATH, sha256: SECOND_SHA256, width: 64 },
    blendMode: 'normal',
    id: LAYER_ID,
    kind: 'raster',
    locked: false,
    name: 'Foreground',
    opacity: 1,
    transform: { rotationDegrees: 15, scaleX: 1.25, scaleY: 0.75, x: -14, y: 21 },
    visible: true,
  })
  const manifest = emptyManifest()
  assert.throws(
    () => validateIgsPackageMetadataV1(manifest, document),
    assertSchemaCode('PACKAGE_MISMATCH'),
  )
  manifest.members.push({ bytes: 1024, path: ASSET_PATH, sha256: SECOND_SHA256 })
  assert.equal(validateIgsPackageMetadataV1(manifest, document).document.layers.length, 1)
  assert.throws(
    () =>
      validateIgsPackageMetadataV1(
        { ...manifest, documentRevision: crypto.randomUUID() },
        document,
      ),
    assertSchemaCode('PACKAGE_MISMATCH'),
  )
  assert.throws(
    () =>
      validateIgsPackageMetadataV1(
        {
          ...manifest,
          members: manifest.members.map((entry) =>
            entry.path === ASSET_PATH ? { ...entry, sha256: SHA256 } : entry,
          ),
        },
        document,
      ),
    assertSchemaCode('PACKAGE_MISMATCH'),
  )

  const invalidTransform = structuredClone(document)
  invalidTransform.layers[0].transform.scaleX = 0
  assert.throws(() => parseProjectDocumentV1(invalidTransform), assertSchemaCode('INVALID_PROJECT'))
  invalidTransform.layers[0].transform.scaleX = 1
  invalidTransform.layers[0].transform.rotationDegrees = 361
  assert.throws(() => parseProjectDocumentV1(invalidTransform), assertSchemaCode('INVALID_PROJECT'))

  const profileSha = 'c'.repeat(64)
  const profilePath = `assets/profiles/${profileSha}.icc`
  document.layers[0].sourceIccProfile = {
    bytes: 128,
    path: profilePath,
    sha256: profileSha,
  }
  manifest.members.push({ bytes: 128, path: profilePath, sha256: profileSha })
  assert.deepEqual(validateIgsPackageMetadataV1(manifest, document).document, document)
  manifest.members.pop()
  assert.throws(
    () => validateIgsPackageMetadataV1(manifest, document),
    assertSchemaCode('PACKAGE_MISMATCH'),
  )
  manifest.members.push({ bytes: 128, path: profilePath, sha256: profileSha })
  document.layers[0].sourceIccProfile = {
    bytes: 128,
    path: profilePath,
    sha256: SECOND_SHA256,
  }
  assert.throws(() => parseProjectDocumentV1(document), assertSchemaCode('INVALID_PROJECT'))
  delete document.layers[0].sourceIccProfile
  assert.throws(
    () => validateIgsPackageMetadataV1(manifest, document),
    assertSchemaCode('PACKAGE_MISMATCH'),
  )
})

test('accepted seed behavior is optional for legacy provenance and restricted to the two supported schedules', () => {
  const legacy = rasterGenerationProvenance()
  assert.equal(
    parseRasterGenerationProvenanceV1(legacy).generationConfiguration.sampling.seedBehavior,
    undefined,
  )
  for (const behavior of ['per-iteration', 'per-prompt'] as const) {
    const planned = structuredClone(legacy)
    planned.generationConfiguration.sampling.seedBehavior = behavior
    assert.equal(
      parseRasterGenerationProvenanceV1(planned).generationConfiguration.sampling.seedBehavior,
      behavior,
    )
  }
  const invalid = structuredClone(legacy)
  Object.assign(invalid.generationConfiguration.sampling, { seedBehavior: 'unknown' })
  assert.throws(
    () => parseRasterGenerationProvenanceV1(invalid),
    assertSchemaCode('INVALID_PROJECT'),
  )
})

test('accepted CFG Rescale records actual neutral zero while historical absence stays unknown at the portable boundary', () => {
  const legacy = rasterGenerationProvenance()
  const parsed = parseRasterGenerationProvenanceV1(legacy)
  assert.equal(Object.hasOwn(parsed.generationConfiguration, 'cfgRescale'), false)
  for (const cfgRescale of [0, 0.3, 0.99]) {
    const recorded = structuredClone(legacy)
    recorded.generationConfiguration.cfgRescale = cfgRescale
    assert.equal(
      parseRasterGenerationProvenanceV1(recorded).generationConfiguration.cfgRescale,
      cfgRescale,
    )
    const document = emptyDocument()
    document.generationDraft.cfgRescale = cfgRescale
    assert.equal(parseProjectDocumentV1(document).generationDraft.cfgRescale, cfgRescale)
  }
  for (const cfgRescale of [-0.1, 1, Infinity, NaN, null, '0.3']) {
    const invalid = structuredClone(legacy)
    Object.assign(invalid.generationConfiguration, { cfgRescale })
    assert.throws(
      () => parseRasterGenerationProvenanceV1(invalid),
      assertSchemaCode('INVALID_PROJECT'),
    )
    const document = emptyDocument()
    Object.assign(document.generationDraft, { cfgRescale })
    if (cfgRescale === 1) {
      // Earlier v1 packages allowed 1. Opening their draft must not prevent resetting the value.
      assert.equal(parseProjectDocumentV1(document).generationDraft.cfgRescale, 1)
    } else {
      assert.throws(() => parseProjectDocumentV1(document), assertSchemaCode('INVALID_PROJECT'))
    }
  }
})

test('dynamic draft settings have explicit new-document defaults while legacy absence stays absent', () => {
  const document = emptyDocument()
  assert.deepEqual(document.generationDraft.dynamicPrompt, {
    maxPrompts: 100,
    seedBehavior: 'per-iteration',
  })
  delete document.generationDraft.dynamicPrompt
  const parsed = parseProjectDocumentV1(document)
  assert.equal(Object.hasOwn(parsed.generationDraft, 'dynamicPrompt'), false)
  assert.deepEqual(parsed, document)
  const neighbor = emptyDocument()
  neighbor.generationDraft.dynamicPrompt!.maxPrompts = 1
  assert.equal(emptyDocument().generationDraft.dynamicPrompt!.maxPrompts, 100)
})

test('dynamic draft settings strictly validate count bounds and seed behavior at the package boundary', () => {
  for (const maxPrompts of [1, 32, 100]) {
    for (const seedBehavior of ['per-iteration', 'per-prompt'] as const) {
      const document = emptyDocument()
      document.generationDraft.dynamicPrompt = { maxPrompts, seedBehavior }
      assert.deepEqual(parseProjectDocumentV1(document), document)
    }
  }
  for (const settings of [
    null,
    {},
    { maxPrompts: 1 },
    { maxPrompts: 0, seedBehavior: 'per-iteration' },
    { maxPrompts: 101, seedBehavior: 'per-iteration' },
    { maxPrompts: 1.5, seedBehavior: 'per-iteration' },
    { maxPrompts: NaN, seedBehavior: 'per-iteration' },
    { maxPrompts: Infinity, seedBehavior: 'per-iteration' },
    { maxPrompts: '10', seedBehavior: 'per-iteration' },
    { maxPrompts: 10, seedBehavior: 'random' },
    { iterations: 2, maxPrompts: 10, seedBehavior: 'per-prompt' },
  ]) {
    const document = emptyDocument()
    Object.assign(document.generationDraft, { dynamicPrompt: settings })
    assert.throws(() => parseProjectDocumentV1(document), assertSchemaCode('INVALID_PROJECT'))
  }
})

test('portable comparison configuration uses the same strict accepted provenance schema', () => {
  const baseline = rasterGenerationProvenance().generationConfiguration
  assert.equal(isRasterGenerationConfigurationV1(baseline), true)
  assert.equal(isRasterGenerationConfigurationV1({ ...baseline, layerSourceContext: {} }), false)
  assert.equal(
    isRasterGenerationConfigurationV1({ ...baseline, executionResultContext: {} }),
    false,
  )
  assert.equal(
    isRasterGenerationConfigurationV1({
      ...baseline,
      model: { ...baseline.model, path: '/private/model' },
    }),
    false,
  )
  assert.equal(
    isRasterGenerationConfigurationV1({
      ...baseline,
      sampling: { ...baseline.sampling, actualSeed: -1 },
    }),
    false,
  )
  assert.equal(
    isRasterGenerationConfigurationV1({
      ...baseline,
      sampling: { ...baseline.sampling, seedBehavior: 'per-prompt' },
    }),
    true,
  )
  assert.deepEqual(
    parseRasterGenerationProvenanceV1(rasterGenerationProvenance()).generationConfiguration,
    baseline,
  )
})
