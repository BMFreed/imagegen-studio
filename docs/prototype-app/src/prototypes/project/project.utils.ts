import type { PresetCreateIntent, PresetPayload, PresetSectionKey } from '../presets/presets.types';
import type { GenerationCandidate, ProjectGenerationDraft, ProjectSession } from './project.types';

import { promptHasMissingEmbedding } from '../../components/generation/generation-prompt.utils';
import { commitProjectMutation } from './project-history';

export function getSelectedEntity(session: ProjectSession) {
  const selection = session.ui.selection;
  if (!selection) {
    return undefined;
  }
  return selection.kind === 'regional-guidance'
    ? session.document.regionalGuidance.find((entity) => entity.id === selection.id)
    : session.document.layers.find((layer) => layer.id === selection.id);
}

export function getActiveGenerationDraft(session: ProjectSession): ProjectGenerationDraft {
  const entity = getSelectedEntity(session);
  return entity && 'kind' in entity && entity.kind === 'smart-patch'
    ? entity.generationDraft
    : session.document.generationDraft;
}

export function deriveGenerationMode(session: ProjectSession) {
  const entity = getSelectedEntity(session);
  if (entity && 'kind' in entity && entity.kind === 'smart-patch' && entity.maskRevision > 0) {
    return 'inpaint' as const;
  }
  const visibleLayers = session.document.layers.filter(
    (layer) =>
      layer.visible &&
      (layer.kind === 'raster' || Boolean(layer.activeVariantId && layer.variants.length)),
  );
  if (!visibleLayers.length) {
    return 'txt2img' as const;
  }
  return visibleLayers.some((layer) => layer.kind === 'raster' && layer.mockCoverage === 'opaque')
    ? ('img2img' as const)
    : ('outpaint' as const);
}

export function projectHasBlockingGenerationErrors(session: ProjectSession) {
  const payload = getActiveGenerationDraft(session).payload;
  return (
    payload.model?.missing === true ||
    promptHasMissingEmbedding(payload.prompt) ||
    promptHasMissingEmbedding(payload.negativePrompt)
  );
}

export function resolveAcceptedAnchor(session: ProjectSession): GenerationCandidate | undefined {
  const staging = session.staging;
  if (!staging) {
    return undefined;
  }
  const selected = staging.candidates.filter(
    (candidate) =>
      candidate.status === 'completed' && staging.selectedCandidateIds.includes(candidate.id),
  );
  return selected.find((candidate) => candidate.id === staging.focusedCandidateId) ?? selected[0];
}

export function acceptStagingCandidates(session: ProjectSession) {
  const staging = session.staging;
  if (!staging) {
    return;
  }
  const selected = staging.candidates.filter(
    (candidate) =>
      candidate.status === 'completed' && staging.selectedCandidateIds.includes(candidate.id),
  );
  const anchor = resolveAcceptedAnchor(session);
  if (selected.length === 0 || !anchor) {
    return;
  }

  const target = staging.target;
  commitProjectMutation(
    session,
    target.kind === 'smart-patch' ? 'Add variants' : 'Add layers',
    (document) => {
      if (target.kind === 'smart-patch') {
        const patch = document.layers.find((layer) => layer.id === target.layerId);
        if (patch?.kind !== 'smart-patch') {
          return;
        }
        patch.variants.push(
          ...selected.map((candidate) => ({
            id: `variant-${candidate.id}`,
            name: `Variant ${patch.variants.length + candidate.imageIndex}`,
            tone: candidate.tone,
          })),
        );
        patch.activeVariantId = `variant-${anchor.id}`;
        patch.status = 'ready';
        return;
      }
      const additions = selected.map((candidate) => ({
        blendMode: 'normal' as const,
        id: `accepted-${candidate.id}`,
        kind: 'raster' as const,
        locked: false,
        mockCoverage: 'partial' as const,
        name: `Generated Result ${candidate.imageIndex}`,
        opacity: 100,
        tone: candidate.tone,
        visible: candidate.id === anchor.id,
      }));
      document.layers.unshift(...additions);
      session.ui.selection = { id: `accepted-${anchor.id}`, kind: 'compositing-layer' };
    },
  );
  session.queueItems = session.queueItems.map((item) =>
    item.status === 'pending' || item.status === 'running'
      ? { ...item, progress: item.progress, status: 'canceled' }
      : item,
  );
  session.staging = undefined;
}

export function discardStagingSession(session: ProjectSession) {
  session.staging = undefined;
  session.queueItems = session.queueItems.map((item) =>
    item.status === 'pending' || item.status === 'running' ? { ...item, status: 'canceled' } : item,
  );
}

export function createPresetIntent(session: ProjectSession): PresetCreateIntent {
  const draft = getActiveGenerationDraft(session);
  const payload = structuredClone(draft.payload);
  delete payload.seed;
  return {
    definition: {
      description: '',
      favorite: false,
      name: session.document.title.replace(/\.igs$/i, ' Baseline'),
      payload,
      tags: ['project'],
      workflow: deriveGenerationMode(session) === 'inpaint' ? 'smartPatch' : 'textToImage',
    },
    kind: 'project',
    projectName: session.document.title,
    projectSummary: `${session.document.canvas.width} × ${session.document.canvas.height} · ${payload.model?.name ?? 'No model'}`,
  };
}

export function applyPresetSections(
  session: ProjectSession,
  payload: PresetPayload,
  selectedSections: PresetSectionKey[],
  presetName?: string,
) {
  commitProjectMutation(
    session,
    presetName ? `Apply preset: ${presetName}` : 'Apply preset',
    () => {
      const target = getActiveGenerationDraft(session).payload;
      for (const section of selectedSections) {
        const value = payload[section];
        if (value === undefined) {
          Reflect.deleteProperty(target, section);
        } else {
          Reflect.set(target, section, structuredClone(value));
        }
      }
    },
  );
}
