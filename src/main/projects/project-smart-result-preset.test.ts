import { ANIMA_SAMPLING_METHOD_KEYS } from '../../shared/projects/anima-sampling-method.js'
import {
  type IgsProjectDocumentV1,
  type IgsRasterLayerV1,
  type IgsSmartPatchLayerV1,
  type IgsSmartPatchVariantV1,
  parseProjectDocumentV1,
  parseSmartPatchVariantV1,
  projectRasterAssets,
} from '../../shared/projects/project-schema.js'
import {
  isSmartResultPresetDataForRequest,
  type SmartResultPresetOwner,
  type SmartResultPresetRequest,
  smartResultPresetResultId,
} from '../../shared/projects/smart-result-preset.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { readIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
import { projectSmartResultPresetPayload } from './project-smart-result-preset.js'
import {
  acceptedOutputPngFixture,
  acceptedRasterProvenanceFixture,
} from './test-fixtures/accepted-provenance.js'
import { literalSmartPatchColorPng } from './test-fixtures/smart-patch-input-material.js'
import { smartPatchVariantMetadataFixture } from './test-fixtures/smart-patch-variant.js'

type Family = 'anima' | 'illustrious'
type Mode = 'img2img' | 'inpaint' | 'outpaint' | 'txt2img'
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

type Fixture = {
  converted: IgsRasterLayerV1
  database: ReturnType<typeof openAppDatabase>
  imported: IgsRasterLayerV1
  ordinary: IgsRasterLayerV1
  owner: NonNullable<ReturnType<ProjectService['getOpenDocumentForAcceptance']>>
  patch: IgsSmartPatchLayerV1
  repository: ProjectIndexRepository
  service: ProjectService
  shadow: ProjectShadowStore
  sources: { bytes: Buffer; variant: IgsSmartPatchVariantV1 }[]
  tabId: string
}

/** Accepted portable preconditions only; these tests do not substitute for Generate or Add. */
function storedResult(family: Family, mode: Mode, index: number) {
  const variant = smartPatchVariantMetadataFixture(family)
  const [width, height] = index === 1 ? [1, 1] : index === 2 ? [7, 5] : [13, 9]
  const alpha = Uint8Array.from({ length: width * height }, (_, i) => [0, 64, 128, 255][i % 4])
  const bytes = literalSmartPatchColorPng(
    width,
    height,
    Array.from(alpha, (a) => [23 + index, 47, 91, a]).flat(),
    4,
  )
  variant.name = `Accepted ${index}`
  Object.assign(variant.asset, { bytes: bytes.length, height, sha256: digest(bytes), width })
  Object.assign(variant.bbox, { height, width })
  const provenance = variant.generationProvenance
  const recorded = provenance.generationConfiguration
  const source = provenance.layerSourceContext
  Reflect.set(recorded, 'mode', mode)
  if (mode === 'txt2img') {
    Reflect.deleteProperty(recorded.sampling, 'denoisingStrength')
    source.preparedInputs.modelSource = null
  } else {
    Reflect.set(recorded.sampling, 'denoisingStrength', 0)
  }
  recorded.positivePrompt.text = `(lantern:1.5), accepted-${index}`
  recorded.negativePrompt.text = `(blur:-0.5), negative-${index}`
  const lora = {
    ...recorded.model,
    kind: 'lora' as const,
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: null,
  }
  recorded.loras = [
    { enabled: true, resource: lora, weight: -0.5 },
    {
      enabled: false,
      resource: { ...lora, baseModelFamily: null, fileSha256: '9'.repeat(64) },
      weight: 0,
    },
  ]
  if ('anima' in recorded) {
    recorded.sampling.animaMethod = 'heun'
  } else {
    const embedding = {
      ...recorded.model,
      kind: 'embedding' as const,
      localModelId: randomUUID(),
      localVersionId: randomUUID(),
      predictionType: null,
    }
    recorded.positivePrompt = {
      embeddingRefs: [{ resource: embedding, token: '<positive>' }],
      text: `<positive>, (lantern:1.5), accepted-${index}`,
    }
    recorded.negativePrompt = {
      embeddingRefs: [
        { resource: { ...embedding, fileSha256: '8'.repeat(64) }, token: '<negative>' },
      ],
      text: `<negative>, (blur:-0.5), negative-${index}`,
    }
    recorded.model.predictionType = 'v_prediction'
    recorded.sampling.noiseProfile = {
      baseSchedule: 'sdxl-scaled-linear-v1',
      rescaleBetasZeroSnr: true,
      schemaVersion: 1,
      timestepSpacing: 'trailing',
    }
    recorded.vae = {
      ...recorded.model,
      displayName: 'Original external VAE',
      kind: 'vae',
      localModelId: randomUUID(),
      localVersionId: randomUUID(),
      predictionType: null,
    }
    recorded.vaePrecision = 'FP32'
  }
  Object.assign(source.bbox, { height, width })
  Object.assign(source.sourceTarget, { height, width })
  Object.assign(source.preparedInputs.finalContributionMask, { height, width })
  Object.assign(provenance.executionResultContext.output, {
    byteSize: bytes.length,
    contributionAlpha8: { byteSize: alpha.length, height, sha256: digest(alpha), width },
    height,
    sha256: digest(bytes),
    width,
  })
  return { bytes, variant: parseSmartPatchVariantV1(variant) }
}

async function withProject(family: Family, mode: Mode, run: (fixture: Fixture) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-smart-result-preset-'))
  const database = openAppDatabase(root, path.resolve('src/main/db/migrations'))
  const repository = new ProjectIndexRepository(database.db)
  const shadow = new ProjectShadowStore(path.join(root, 'autosave'))
  const service = new ProjectService({
    autosaveOptions: { debounceMs: 60_000, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    dataRoot: root,
    repository,
    roots: {
      placeholdersDir: path.resolve('src/main/projects/placeholders'),
      scratchDir: path.join(root, 'scratch'),
    },
    shadow,
  })
  try {
    const tab = await service.create({
      height: 256,
      title: 'Smart result preset source',
      width: 256,
    })
    const owner = service.getOpenDocumentForAcceptance(tab.id)!
    const sources = [1, 2, 3].map((index) => storedResult(family, mode, index))
    const patch: IgsSmartPatchLayerV1 = {
      activeRasterSubLayerId: sources[0].variant.id,
      blendMode: 'normal',
      boundingBox: { height: 128, width: 256, x: 500, y: -500 },
      generationDraft: {
        ...owner.document.generationDraft,
        positivePrompt: {
          embeddingRefs: [],
          text: 'Current Patch authoring, not accepted settings',
        },
        seed: { policy: 'fixed', value: 913 },
      },
      id: randomUUID(),
      internalResolution: { height: 128, width: 256 },
      kind: 'smart-patch',
      locked: true,
      mask: { asset: null, id: randomUUID(), revision: 0 },
      name: 'Current containing parent, distinct from historical sources',
      opacity: 0.4,
      rasterSubLayers: sources.slice(0, 2).map(({ variant }) => variant),
      visible: false,
    }
    const convertedSource = sources[2].variant
    const converted: IgsRasterLayerV1 = {
      asset: convertedSource.asset,
      blendMode: 'normal',
      generationProvenance: convertedSource.generationProvenance,
      id: convertedSource.id,
      kind: 'raster',
      locked: true,
      name: 'Converted Smart contribution',
      opacity: 1,
      transform: { rotationDegrees: 31, scaleX: 2, scaleY: 3, x: 42, y: 97 },
      visible: false,
    }
    const ordinaryBytes = await acceptedOutputPngFixture(8, 8)
    const ordinaryId = randomUUID()
    const ordinary: IgsRasterLayerV1 = {
      ...converted,
      asset: {
        bytes: ordinaryBytes.length,
        height: 8,
        path: `assets/layers/${ordinaryId}.png`,
        sha256: digest(ordinaryBytes),
        width: 8,
      },
      generationProvenance: acceptedRasterProvenanceFixture(owner.document, ordinaryBytes, {
        height: 8,
        width: 8,
        x: 0,
        y: 0,
      }),
      id: ordinaryId,
      name: 'Ordinary accepted Raster control',
    }
    const importedId = randomUUID()
    const imported: IgsRasterLayerV1 = {
      ...ordinary,
      asset: { ...ordinary.asset, path: `assets/layers/${importedId}.png` },
      generationProvenance: undefined,
      id: importedId,
      name: 'Imported control without generation data',
    }
    const document = parseProjectDocumentV1({
      ...owner.document,
      generationDraft: {
        ...owner.document.generationDraft,
        positivePrompt: { embeddingRefs: [], text: 'Different current Canvas authoring' },
      },
      layers: [patch, converted, ordinary, imported],
    })
    await owner.applyDocument(document, {
      ...Object.fromEntries(sources.map(({ bytes, variant }) => [variant.asset.path, { bytes }])),
      [imported.asset.path]: { bytes: ordinaryBytes },
      [ordinary.asset.path]: { bytes: ordinaryBytes },
    })
    await service.save(tab.id)
    await service.clearHistory(tab.id)
    await run({
      converted,
      database,
      imported,
      ordinary,
      owner,
      patch,
      repository,
      service,
      shadow,
      sources,
      tabId: tab.id,
    })
  } finally {
    for (const tab of service.getOpenTabs()) {
      await service.discardAndClose(tab.id)
    }
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

function requestFor(
  document: IgsProjectDocumentV1,
  owner: SmartResultPresetOwner,
): SmartResultPresetRequest {
  const result = projectRasterAssets(document).find(
    ({ id }) => id === smartResultPresetResultId(owner),
  )
  assert.ok(result)
  return {
    assetSha256: result.asset.sha256,
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    owner,
  }
}

for (const family of ['illustrious', 'anima'] as const) {
  for (const mode of ['txt2img', 'img2img', 'inpaint', 'outpaint'] as const) {
    // Real boundary: ProjectService over a saved/readable package; no worker or model catalog exists.
    // Mutations: active substitution, historical-parent lookup, current draft copy, invented Size.
    test(`${family} ${mode} Smart preset source reads active, inactive and converted owners exactly without mutating saved state`, async () => {
      await withProject(family, mode, async (f) => {
        const beforeDocument = structuredClone(f.owner.document)
        const beforeTab = f.service.getOpenTabs()[0]
        const beforeBytes = await readFile(f.owner.filePath)
        const saved = await readIgsPackage(f.owner.filePath)
        const beforeShadow = await f.shadow.inspect({
          projectPath: f.owner.filePath,
          savedPackage: saved,
        })
        const beforeIndex = await f.repository.listSavedAcceptedResults(f.tabId)
        const targets: SmartResultPresetOwner[] = [
          { kind: 'smart-patch-variant', layerId: f.patch.id, variantId: f.sources[0].variant.id },
          { kind: 'smart-patch-variant', layerId: f.patch.id, variantId: f.sources[1].variant.id },
          { kind: 'raster', layerId: f.converted.id },
        ]
        for (const [index, target] of targets.entries()) {
          const source = f.sources[index].variant
          const configuration = source.generationProvenance.generationConfiguration
          assert.notEqual(source.generationProvenance.layerSourceContext.layerId, f.patch.id)
          const request = requestFor(f.owner.document, target)
          const captured = structuredClone(request)
          const reply = f.service.getSmartResultPresetData(f.tabId, request)
          assert.equal('then' in reply, false, 'The source copy must remain synchronous.')
          assert.ok(isSmartResultPresetDataForRequest(reply, captured))
          assert.equal(
            reply.workflow,
            'smartPatch',
            'Smart origin determines workflow even for TXT/IMG/OUT or converted Raster.',
          )
          assert.equal(reply.resultId, source.id)
          assert.equal(
            reply.payload.prompt.text,
            family === 'anima'
              ? `(lantern:1.5), accepted-${index + 1}`
              : `<positive>, (lantern:1.5), accepted-${index + 1}`,
          )
          assert.equal(
            reply.payload.negativePrompt.text,
            family === 'anima'
              ? `(blur:-0.5), negative-${index + 1}`
              : `<negative>, (blur:-0.5), negative-${index + 1}`,
          )
          assert.deepEqual(
            reply.payload.prompt.embeddingRefs,
            configuration.positivePrompt.embeddingRefs,
          )
          assert.deepEqual(
            reply.payload.negativePrompt.embeddingRefs,
            configuration.negativePrompt.embeddingRefs,
          )
          assert.deepEqual(reply.payload.guidance, { cfgScale: 4, steps: 4 })
          assert.deepEqual(reply.payload.loras, configuration.loras)
          assert.equal(reply.payload.loras?.[0].weight, -0.5)
          assert.equal(reply.payload.loras?.[1].enabled, false)
          assert.equal(reply.payload.loras?.[1].weight, 0)
          assert.equal(reply.payload.cfgRescale, 0)
          assert.equal(reply.payload.denoisingStrength, mode === 'txt2img' ? undefined : 0)
          if (family === 'anima') {
            assert.deepEqual(reply.payload.model, configuration.model)
            assert.deepEqual(reply.payload.sampling, { animaMethod: 'heun' })
            assert.equal(Object.hasOwn(reply.payload, 'vae'), false)
            assert.equal(reply.payload.vaePrecision, 'Auto')
          } else {
            assert.deepEqual(reply.payload.model, {
              ...configuration.model,
              noiseProfile: {
                baseSchedule: 'sdxl-scaled-linear-v1',
                rescaleBetasZeroSnr: true,
                schemaVersion: 1,
                timestepSpacing: 'trailing',
              },
            })
            assert.deepEqual(reply.payload.sampling, { sampler: 'Euler', scheduler: 'Normal' })
            assert.ok('vae' in configuration)
            assert.deepEqual(reply.payload.vae, configuration.vae)
            assert.equal(reply.payload.vaePrecision, 'FP32')
          }
          assert.deepEqual(Object.keys(reply).sort(), [
            'assetSha256',
            'documentId',
            'documentRevision',
            'owner',
            'payload',
            'resultId',
            'workflow',
          ])
          assert.deepEqual(
            Object.keys(reply.payload).sort(),
            [
              'cfgRescale',
              ...(mode === 'txt2img' ? [] : ['denoisingStrength']),
              'guidance',
              'loras',
              'model',
              'negativePrompt',
              'prompt',
              'sampling',
              ...(family === 'anima' ? [] : ['vae']),
              'vaePrecision',
            ].sort(),
          )
          reply.payload.model.displayName = 'Mutated response'
          reply.payload.prompt.text = 'Mutated response'
          if (reply.payload.loras) {
            reply.payload.loras[0].resource.fileSha256 = '7'.repeat(64)
          }
          if (reply.payload.prompt.embeddingRefs.length) {
            reply.payload.prompt.embeddingRefs[0].resource.fileSha256 = '6'.repeat(64)
          }
          reply.owner.layerId = randomUUID()
          assert.deepEqual(request, captured)
          assert.deepEqual(f.owner.document, beforeDocument)
        }
        assert.deepEqual(f.service.getOpenTabs()[0], beforeTab)
        assert.ok(
          (await readFile(f.owner.filePath)).equals(beforeBytes),
          'Reading a preset source must not Save.',
        )
        assert.deepEqual(
          await f.shadow.inspect({ projectPath: f.owner.filePath, savedPackage: saved }),
          beforeShadow,
        )
        assert.deepEqual(await f.repository.listSavedAcceptedResults(f.tabId), beforeIndex)
        const request = requestFor(f.owner.document, targets[1])
        const expected = f.service.getSmartResultPresetData(f.tabId, request)
        await f.service.discardAndClose(f.tabId)
        const reopened = await f.service.open(f.tabId)
        assert.equal(reopened.kind, 'opened')
        assert.deepEqual(f.service.getSmartResultPresetData(f.tabId, request), expected)
      })
    })
  }
}

test('Smart preset source validates exact revision, containment, result hash and source kind before returning data', async () => {
  await withProject('illustrious', 'inpaint', async (f) => {
    const request = requestFor(f.owner.document, {
      kind: 'smart-patch-variant',
      layerId: f.patch.id,
      variantId: f.sources[1].variant.id,
    })
    const document = structuredClone(f.owner.document)
    const beforeTab = f.service.getOpenTabs()[0]
    const bytes = await readFile(f.owner.filePath)
    const changed = [
      { ...request, documentRevision: randomUUID() },
      { ...request, assetSha256: '0'.repeat(64) },
    ]
    for (const input of changed) {
      assert.throws(() => f.service.getSmartResultPresetData(f.tabId, input), {
        code: 'PROJECT_TARGET_CHANGED',
      })
    }
    assert.throws(
      () => f.service.getSmartResultPresetData(f.tabId, { ...request, documentId: randomUUID() }),
      { code: 'PROJECT_IDENTITY_MISMATCH' },
    )
    for (const owner of [
      {
        kind: 'smart-patch-variant',
        layerId: f.sources[1].variant.generationProvenance.layerSourceContext.layerId,
        variantId: f.sources[1].variant.id,
      },
      { kind: 'smart-patch-variant', layerId: f.patch.id, variantId: f.converted.id },
      { kind: 'smart-patch-variant', layerId: f.converted.id, variantId: f.sources[1].variant.id },
      { kind: 'raster', layerId: f.patch.id },
    ] as const) {
      assert.throws(() => f.service.getSmartResultPresetData(f.tabId, { ...request, owner }), {
        code: 'PROJECT_LAYER_NOT_FOUND',
      })
    }
    for (const raster of [f.ordinary, f.imported]) {
      assert.throws(
        () =>
          f.service.getSmartResultPresetData(
            f.tabId,
            requestFor(f.owner.document, { kind: 'raster', layerId: raster.id }),
          ),
        { code: 'PROJECT_INVALID_INPUT' },
      )
    }
    const malformed = { ...request, owner: { ...request.owner, path: '/private/owner' } }
    assert.throws(() => f.service.getSmartResultPresetData(f.tabId, malformed), {
      code: 'PROJECT_INVALID_INPUT',
    })
    assert.throws(() => f.service.getSmartResultPresetData('invalid-tab', request), {
      code: 'PROJECT_INVALID_INPUT',
    })
    assert.ok(
      isSmartResultPresetDataForRequest(
        f.service.getSmartResultPresetData(f.tabId, request),
        request,
      ),
    )
    assert.deepEqual(f.owner.document, document)
    assert.deepEqual(f.service.getOpenTabs()[0], beforeTab)
    assert.ok((await readFile(f.owner.filePath)).equals(bytes))
    await f.service.discardAndClose(f.tabId)
    assert.throws(() => f.service.getSmartResultPresetData(f.tabId, request), {
      code: 'PROJECT_NOT_OPEN',
    })
  })
})

test('Smart source markers distinguish converted and ordinary Raster while ordinary Compare stays isolated and Size stays recorded', async () => {
  await withProject('anima', 'outpaint', async (f) => {
    const tab = f.service.getOpenTabs()[0]
    const converted = tab.layers.find(({ id }) => id === f.converted.id)
    const ordinary = tab.layers.find(({ id }) => id === f.ordinary.id)
    const imported = tab.layers.find(({ id }) => id === f.imported.id)
    assert.ok(converted && converted.kind !== 'smart-patch')
    assert.ok(ordinary && ordinary.kind !== 'smart-patch')
    assert.ok(imported && imported.kind !== 'smart-patch')
    assert.equal(converted.resultPresetSourceKind, 'smart-patch')
    assert.equal(ordinary.resultPresetSourceKind, 'raster')
    assert.equal(imported.resultPresetSourceKind, undefined)
    assert.equal(converted.resultComparisonSourceKind, 'smart-patch')
    assert.equal(ordinary.resultComparisonSourceKind, 'raster')
    assert.equal(imported.resultComparisonSourceKind, undefined)
    assert.equal(converted.generationSettingsUnavailableReason, undefined)
    assert.equal(ordinary.generationSettingsUnavailableReason, undefined)
    await assert.rejects(
      f.service.getRasterGenerationData(f.tabId, tab.documentId, f.converted.id),
      {
        code: 'PROJECT_COMPARISON_UNSUPPORTED',
        message: 'Smart Patch generation settings are unavailable for Compare.',
      },
    )
    const control = await f.service.getRasterGenerationData(f.tabId, tab.documentId, f.ordinary.id)
    assert.deepEqual(control.generationConfiguration?.size, { height: 8, width: 8 })
    assert.deepEqual(tab.primaryBbox, { height: 256, width: 256, x: 0, y: 0 })
    assert.equal(
      (await f.service.getRasterGenerationData(f.tabId, tab.documentId, f.imported.id))
        .generationConfiguration,
      null,
    )
  })
})

test('Smart preset source preserves pending prompt edit grouping rather than sealing or applying authoring', async () => {
  await withProject('illustrious', 'inpaint', async (f) => {
    const groupId = randomUUID()
    await f.service.updateGenerationDraft(
      f.tabId,
      { kind: 'positive-prompt', text: 'first pending edit' },
      groupId,
    )
    const request = requestFor(f.owner.document, {
      kind: 'smart-patch-variant',
      layerId: f.patch.id,
      variantId: f.sources[1].variant.id,
    })
    const before = structuredClone(f.owner.document)
    assert.equal(
      f.service.getSmartResultPresetData(f.tabId, request).payload.prompt.text,
      '<positive>, (lantern:1.5), accepted-2',
    )
    assert.deepEqual(f.owner.document, before)
    await f.service.updateGenerationDraft(
      f.tabId,
      { kind: 'positive-prompt', text: 'second pending edit' },
      groupId,
    )
    const undone = await f.service.undo(f.tabId)
    assert.equal(undone.generationDraft.positivePrompt.text, 'Different current Canvas authoring')
    assert.equal(undone.canUndo, false, 'A read must not split the existing prompt edit group.')
    assert.equal(undone.dirty, false)
  })
})

test('Main whitelist preserves historical optional absence versus explicit zero, empty stack, Embedded and Auto', () => {
  const recorded =
    smartPatchVariantMetadataFixture('illustrious').generationProvenance.generationConfiguration
  assert.ok(!('anima' in recorded))
  if ('anima' in recorded) {
    assert.fail('Expected Illustrious source configuration.')
  }
  const explicit = projectSmartResultPresetPayload(recorded)
  assert.deepEqual(explicit.loras, [])
  assert.equal(explicit.vae, null)
  assert.equal(explicit.cfgRescale, 0)
  assert.equal(explicit.vaePrecision, 'Auto')
  for (const key of ['loras', 'vae', 'cfgRescale', 'vaePrecision'] as const) {
    Reflect.deleteProperty(recorded, key)
  }
  const absent = projectSmartResultPresetPayload(recorded)
  for (const key of ['loras', 'vae', 'cfgRescale', 'vaePrecision', 'size', 'seed']) {
    assert.equal(Object.hasOwn(absent, key), false, key)
  }
  assert.deepEqual(absent.guidance, { cfgScale: 4, steps: 4 })
  absent.model.fileSha256 = '0'.repeat(64)
  assert.equal(recorded.model.fileSha256, 'a'.repeat(64))
})

test('Main Anima whitelist preserves every recorded method and absent neutral options without inventing a reusable VAE', () => {
  const recorded =
    smartPatchVariantMetadataFixture('anima').generationProvenance.generationConfiguration
  if (!('anima' in recorded)) {
    assert.fail('Expected Anima source configuration.')
  }
  Reflect.deleteProperty(recorded, 'cfgRescale')
  Reflect.deleteProperty(recorded, 'vaePrecision')
  for (const animaMethod of ANIMA_SAMPLING_METHOD_KEYS) {
    recorded.sampling.animaMethod = animaMethod
    const projected = projectSmartResultPresetPayload(recorded)
    assert.deepEqual(projected.sampling, { animaMethod })
    assert.deepEqual(projected.loras, [])
    assert.equal(projected.prompt.text, '(lantern:1.5)')
    for (const key of ['cfgRescale', 'vaePrecision', 'vae', 'size', 'seed', 'anima']) {
      assert.equal(Object.hasOwn(projected, key), false, key)
    }
  }
})
