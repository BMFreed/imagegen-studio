import type { ProjectAcceptedResultTarget } from '../../../shared/projects/project-accepted-results.js'
import {
  type IgsProjectDocumentV1,
  type IgsRasterLayerV1,
  type IgsSmartPatchLayerV1,
  type IgsSmartPatchVariantV1,
  parseProjectDocumentV1,
  parseSmartPatchVariantV1,
  projectRasterAssets,
} from '../../../shared/projects/project-schema.js'
import {
  type SmartResultComparisonRequest,
  smartResultComparisonResultId,
} from '../../../shared/projects/smart-result-comparison.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { openAppDatabase } from '../../db/database.js'
import { ProjectAutosaveLeaseRegistry } from '../project-autosave.js'
import { ProjectIndexRepository } from '../project-index.js'
import { ProjectService } from '../project-service.js'
import { ProjectShadowStore } from '../project-shadow.js'
import { acceptedOutputPngFixture, acceptedRasterProvenanceFixture } from './accepted-provenance.js'
import { literalSmartPatchColorPng } from './smart-patch-input-material.js'
import { smartPatchVariantMetadataFixture } from './smart-patch-variant.js'

export type Family = 'anima' | 'illustrious'
export type Mode = 'img2img' | 'inpaint' | 'outpaint' | 'txt2img'
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

export type Fixture = {
  converted: IgsRasterLayerV1
  database: ReturnType<typeof openAppDatabase>
  imported: IgsRasterLayerV1
  ordinary: IgsRasterLayerV1
  owner: NonNullable<ReturnType<ProjectService['getOpenDocumentForAcceptance']>>
  patch: IgsSmartPatchLayerV1
  repository: ProjectIndexRepository
  root: string
  service: ProjectService
  shadow: ProjectShadowStore
  sources: { bytes: Buffer; variant: IgsSmartPatchVariantV1 }[]
  tabId: string
}

export async function withSmartComparisonProject(
  family: Family,
  mode: Mode,
  run: (fixture: Fixture) => Promise<void>,
) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-smart-result-comparison-'))
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
      transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
      visible: true,
    }
    const importedId = randomUUID()
    const imported: IgsRasterLayerV1 = {
      ...ordinary,
      asset: { ...ordinary.asset, path: `assets/layers/${importedId}.png` },
      generationProvenance: undefined,
      id: importedId,
      name: 'Imported control without generation data',
      visible: false,
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
      root,
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

export function comparisonRequestFor(
  document: IgsProjectDocumentV1,
  owner: ProjectAcceptedResultTarget,
): SmartResultComparisonRequest {
  const result = projectRasterAssets(document).find(
    ({ id }) => id === smartResultComparisonResultId(owner),
  )
  assert.ok(result)
  return {
    assetSha256: result.asset.sha256,
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    owner,
  }
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
