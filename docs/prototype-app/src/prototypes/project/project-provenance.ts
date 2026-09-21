import type { GenerationPayload } from '../../components/generation/generation.types'
import type { PresetCreateIntent } from '../presets/presets.types'
import type { GenerationProvenance, ProjectCompositingLayer, ProjectSession } from './project.types'

import { clonePreset } from '../presets/presets.utils'
import { deriveGenerationMode, getActiveGenerationDraft, getSelectedEntity } from './project.utils'

export function resultProvenance(layer: ProjectCompositingLayer) {
  return layer.kind === 'raster'
    ? layer.provenance
    : layer.variants.find((v) => v.id === layer.activeVariantId)?.provenance
}

export function freezeGeneration(
  session: ProjectSession,
  queueItemId: string,
  prompt: string,
  negativePrompt: string,
  seed: number,
): GenerationProvenance {
  const draft = getActiveGenerationDraft(session)
  const payload = clonePreset(draft.payload)
  payload.prompt = { embeddingRefs: clonePreset(payload.prompt?.embeddingRefs ?? []), text: prompt }
  payload.negativePrompt = {
    embeddingRefs: clonePreset(payload.negativePrompt?.embeddingRefs ?? []),
    text: negativePrompt,
  }
  payload.seed = { policy: 'fixed', value: seed }
  const entity = getSelectedEntity(session)
  const patch = entity && 'kind' in entity && entity.kind === 'smart-patch' ? entity : undefined
  if (patch) {
    delete payload.size
  } else {
    payload.size = clonePreset(session.document.canvas)
  }
  const mode = deriveGenerationMode(session)
  if (mode === 'txt2img') {
    delete payload.denoisingStrength
  }
  return {
    advanced: { cfgRescale: draft.cfgRescale, vaePrecision: draft.vaePrecision },
    engine: 'Prototype simulation',
    mode,
    payload,
    queueItemId,
    regionalGuidance: clonePreset(session.document.regionalGuidance.filter((r) => r.enabled)),
    source: patch
      ? clonePreset({
          bbox: patch.bbox,
          draft,
          internalHeight: patch.internalHeight,
          internalWidth: patch.internalWidth,
          maskRevision: patch.maskRevision,
        })
      : undefined,
  }
}

export function currentCanvasPayload(session: ProjectSession): GenerationPayload {
  const payload = clonePreset(session.document.generationDraft.payload)
  payload.size = clonePreset(session.document.canvas)
  const canvasSession = { ...session, ui: { ...session.ui, selection: undefined } }
  if (deriveGenerationMode(canvasSession) === 'txt2img') {
    delete payload.denoisingStrength
  }
  return payload
}

export function presetIntentFromResult(
  layer: ProjectCompositingLayer,
): PresetCreateIntent | undefined {
  const record = resultProvenance(layer)
  if (!record) {
    return undefined
  }
  const payload = clonePreset(record.payload)
  // Seed remains opt-in in the preset editor, as in Save Current as Preset.
  delete payload.seed
  return {
    definition: {
      description: '',
      favorite: false,
      name: `${layer.name} Preset`,
      payload,
      tags: ['result'],
      workflow:
        record.mode === 'inpaint'
          ? 'smartPatch'
          : record.mode === 'txt2img'
            ? 'textToImage'
            : 'imageToImage',
    },
    kind: 'project',
    projectName: layer.name,
    projectSummary: 'Accepted result · frozen generation settings',
  }
}
