import {
  type ProjectMaskSettings,
  resolveProjectMaskSettings,
} from '../../shared/projects/project-mask-settings.js'
import type {
  IgsProjectDocumentV1,
  IgsRectV1,
  IgsSmartPatchLayerV1,
} from '../../shared/projects/project-schema.js'
import { parseProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import { mkdtemp, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { IgsAssetSource } from './igs-package.js'
import type { FrozenGenerationTarget } from './project-generation-target.js'
import type { ProjectWorkerClient } from './worker-client.js'

import { readIgsPackage } from './igs-package.js'
import { composeFrozenGenerationTarget } from './project-generation-target.js'
import { readProjectMaskSource } from './project-mask.js'
import { withProjectPathLock } from './project-path-lock.js'
import { compositionRasterLayers, withFrozenRasterComposition } from './project-raster-snapshot.js'
import {
  type PreparedSmartPatchContributionInput,
  type PreparedSmartPatchGenerationInput,
  prepareFrozenSmartPatchContribution,
  prepareFrozenSmartPatchInput,
} from './project-smart-patch-preparation.js'
import { classifyTargetPngAlpha } from './target-png-mode.js'
import { assertSmartPatchProcessingSize } from './worker-client.js'

/** Matches the existing CPU compositor/target verifier; not a model capacity or document ceiling. */
const MAX_SOURCE_SIDE = 2048
const MAX_SOURCE_PIXELS = 4_000_000

export interface FrozenSmartPatchGenerationContext {
  bbox: IgsRectV1
  documentId: string
  documentRevision: string
  generationDraft: IgsProjectDocumentV1['generationDraft']
  internalResolution: IgsSmartPatchLayerV1['internalResolution']
  lastActualSeedSnapshot: IgsProjectDocumentV1['lastActualSeedSnapshot']
  layerId: string
  locked: boolean
  mask: IgsSmartPatchLayerV1['mask']
  maskSettings: ProjectMaskSettings
  projectKey: string
  sourceLayerIds: string[]
  visible: boolean
}

export interface FrozenSmartPatchGenerationInput {
  context: FrozenSmartPatchGenerationContext
  maskPngBytes: Buffer | null
  source: FrozenGenerationTarget['composite']
  /** Source-only alpha classification, distinct from the future generation mode. */
  sourceAlpha: 'mixed' | 'opaque' | 'transparent'
}

export interface CapturedSmartPatchGenerationInput {
  composeSource: (
    worker: Pick<ProjectWorkerClient, 'composeTarget'>,
  ) => Promise<FrozenSmartPatchGenerationInput>
  /** Caller-owned snapshots cannot mutate the private context used by composeSource. */
  context: FrozenSmartPatchGenerationContext
  document: IgsProjectDocumentV1
  maskPngBytes: Buffer | null
  /** Main-only leased material; never a portable path or renderer capability. */
  maskPngPath: string | null
  prepareContribution: (
    worker: Pick<ProjectWorkerClient, 'composeTarget' | 'fadeSmartPatch' | 'prepareSmartPatch'>,
  ) => Promise<PreparedSmartPatchContributionInput>
  prepareInput: (
    worker: Pick<ProjectWorkerClient, 'composeTarget' | 'prepareSmartPatch'>,
  ) => Promise<PreparedSmartPatchGenerationInput>
}

/** Existing immutable members and pending byte buffers are captured before filesystem awaits. */
export async function withFrozenSmartPatchGenerationInput<T>(
  input: {
    document: IgsProjectDocumentV1
    layerId: string
    maskSource: IgsAssetSource | null
    packagePath: string
    pendingSource: (asset: { bytes: number; path: string; sha256: string }) => IgsAssetSource | null
    projectKey: string
    scratchBasePath: string
  },
  use: (capture: CapturedSmartPatchGenerationInput) => Promise<T>,
): Promise<T> {
  const document = parseProjectDocumentV1(structuredClone(input.document))
  const patch = document.layers.find((layer) => layer.id === input.layerId)
  if (!patch || patch.kind !== 'smart-patch') {
    throw new Error('The captured Smart Patch owner no longer exists.')
  }
  const bbox = { ...patch.boundingBox }
  if (
    bbox.width > MAX_SOURCE_SIDE ||
    bbox.height > MAX_SOURCE_SIDE ||
    bbox.width * bbox.height > MAX_SOURCE_PIXELS
  ) {
    throw new Error('The Smart Patch source bbox exceeds the existing CPU compositor limits.')
  }
  const scope = { beneathLayerId: patch.id }
  const context: FrozenSmartPatchGenerationContext = {
    bbox,
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    generationDraft: structuredClone(patch.generationDraft),
    internalResolution: { ...patch.internalResolution },
    lastActualSeedSnapshot: document.lastActualSeedSnapshot,
    layerId: patch.id,
    locked: patch.locked,
    mask: structuredClone(patch.mask),
    maskSettings: resolveProjectMaskSettings(patch.maskSettings),
    projectKey: input.projectKey,
    sourceLayerIds: compositionRasterLayers(document, scope).map((layer) => layer.id),
    visible: patch.visible,
  }
  const maskSource = copySource(input.maskSource)
  // Start this verified read before other I/O; saved replacement uses the same package path lock.
  const maskReading = readCapturedMask(document, patch, maskSource, input.packagePath)
  // A source-snapshot failure must still observe the independent mask read's settlement.
  void maskReading.catch(() => undefined)
  try {
    return await withFrozenRasterComposition(
      {
        document,
        packagePath: input.packagePath,
        pendingSource: input.pendingSource,
        scope,
        scratchBasePath: input.scratchBasePath,
        stagePrefix: 'smart-patch-input-',
      },
      async (composition) => {
        const maskPngBytes = await maskReading
        const maskPngPath = maskPngBytes ? path.join(composition.stagingRoot, 'mask.png') : null
        if (maskPngPath && maskPngBytes) {
          await writeFile(maskPngPath, maskPngBytes, { flag: 'wx', mode: 0o600 })
        }
        const operations = new Set<Promise<unknown>>()
        let open = true
        const startOperation = <T>(run: () => Promise<T>): Promise<T> => {
          if (!open) {
            return Promise.reject(new Error('The Smart Patch capture lease is closed.'))
          }
          const operation = run()
          operations.add(operation)
          const settled = () => {
            operations.delete(operation)
          }
          void operation.then(settled, settled)
          return operation
        }
        const composeAt = async (
          worker: Pick<ProjectWorkerClient, 'composeTarget'>,
          stagingRoot: string,
        ): Promise<FrozenSmartPatchGenerationInput> => {
          const sourceTarget = await composeFrozenGenerationTarget(
            { ...composition, stagingRoot },
            worker,
            { bbox: context.bbox, generationDraft: context.generationDraft },
          )
          const sourceMode = classifyTargetPngAlpha(
            sourceTarget.composite.bytes,
            sourceTarget.composite.width,
            sourceTarget.composite.height,
          )
          if (sourceMode !== sourceTarget.mode) {
            throw new Error('The Smart Patch source alpha differs from the composed pixels.')
          }
          return {
            context: structuredClone(context),
            maskPngBytes: maskPngBytes ? Buffer.from(maskPngBytes) : null,
            source: sourceTarget.composite,
            sourceAlpha:
              sourceMode === 'txt2img'
                ? 'transparent'
                : sourceMode === 'img2img'
                  ? 'opaque'
                  : 'mixed',
          }
        }
        const composeSource: CapturedSmartPatchGenerationInput['composeSource'] = (worker) =>
          startOperation(async () => {
            const stagingRoot = await mkdtemp(path.join(composition.stagingRoot, 'source-'))
            return composeAt(worker, stagingRoot)
          })
        const prepareAt = async (
          worker: Pick<ProjectWorkerClient, 'composeTarget' | 'prepareSmartPatch'>,
          stagingRoot: string,
        ): Promise<PreparedSmartPatchGenerationInput> => {
          const composed = await composeAt(worker, stagingRoot)
          return prepareFrozenSmartPatchInput(
            {
              context,
              maskPngBytes,
              maskPngPath,
              source: composed.source,
              sourceAlpha: composed.sourceAlpha,
              stagingRoot,
            },
            worker,
          )
        }
        const prepareInput: CapturedSmartPatchGenerationInput['prepareInput'] = (worker) =>
          startOperation(async () => {
            assertSmartPatchProcessingSize(context.internalResolution)
            const stagingRoot = await mkdtemp(path.join(composition.stagingRoot, 'prepared-'))
            return prepareAt(worker, stagingRoot)
          })
        const prepareContribution: CapturedSmartPatchGenerationInput['prepareContribution'] = (
          worker,
        ) =>
          startOperation(async () => {
            assertSmartPatchProcessingSize(context.internalResolution)
            const stagingRoot = await mkdtemp(path.join(composition.stagingRoot, 'contribution-'))
            const prepared = await prepareAt(worker, stagingRoot)
            return prepareFrozenSmartPatchContribution(prepared, stagingRoot, worker)
          })
        try {
          return await use({
            composeSource,
            context: structuredClone(context),
            document: structuredClone(document),
            maskPngBytes: maskPngBytes ? Buffer.from(maskPngBytes) : null,
            maskPngPath,
            prepareContribution,
            prepareInput,
          })
        } finally {
          open = false
          // A sibling failure may settle the callback while another started worker still reads.
          await Promise.allSettled(operations)
        }
      },
    )
  } finally {
    await maskReading.catch(() => undefined)
  }
}

function copySource(source: IgsAssetSource | null): IgsAssetSource | null {
  return source && ('bytes' in source ? { bytes: Buffer.from(source.bytes) } : { ...source })
}

async function readCapturedMask(
  document: IgsProjectDocumentV1,
  patch: IgsSmartPatchLayerV1,
  source: IgsAssetSource | null,
  packagePath: string,
): Promise<Buffer | null> {
  const asset = patch.mask.asset
  if (!asset) {
    return null
  }
  if (source) {
    return await readProjectMaskSource(source, asset)
  }
  return await withProjectPathLock(packagePath, async () => {
    const saved = await readIgsPackage(packagePath)
    if (saved.project.documentId !== document.documentId) {
      throw new Error('The saved Project identity changed while freezing its owned mask.')
    }
    return await readProjectMaskSource({ bytes: await saved.readMember(asset.path) }, asset)
  })
}
