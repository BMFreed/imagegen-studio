<script setup lang="ts">
import { NAlert, NButton, NCard, NModal, NSplit, NText, useMessage } from 'naive-ui';
import { computed, onBeforeUnmount, ref } from 'vue';

import type { PresetSectionKey } from '../presets/presets.types';
import type { ProjectSession } from './project.types';

import {
  cloneGenerationPrompt,
  createGenerationPrompt,
  serializeGenerationPrompt,
} from '../../components/generation/generation-prompt.utils';
import ApplyPresetModal from '../presets/ApplyPresetModal.vue';
import { presetResources } from '../presets/presets.mock';
import { redoProject, undoProject } from './project-history';
import { expandPromptPairs } from './project-prompt.utils';
import {
  acceptStagingCandidates,
  applyPresetSections,
  deriveGenerationMode,
  discardStagingSession,
  getActiveGenerationDraft,
} from './project.utils';
import ProjectCanvasWorkspace from './ProjectCanvasWorkspace.vue';
import ProjectLayersPanel from './ProjectLayersPanel.vue';
import ProjectSettingsPanel from './ProjectSettingsPanel.vue';
import { useProjectPanelSizes } from './useProjectPanelSizes';

const props = defineProps<{ active?: boolean; session: ProjectSession }>();
const emit = defineEmits<{ manageModels: []; managePresets: []; save: []; savePreset: [] }>();
const message = useMessage();
const imagesPerClick = ref(4);
const pendingPresetId = ref<string>();
const showApplyPreset = computed({
  get: () => props.session.ui.applyPresetOpen,
  set: (value: boolean) => {
    props.session.ui.applyPresetOpen = value;
  },
});
const showEarlyAccept = ref(false);
const timers = new Set<ReturnType<typeof globalThis.setTimeout>>();
const { centerMax, centerMin, centerSize, innerHost, leftMax, leftMin, leftSize, outerHost } =
  useProjectPanelSizes(props.session);
void innerHost;
void outerHost;
const selectedPreset = computed(
  () => presetResources.find((item) => item.id === pendingPresetId.value) ?? presetResources[0]!,
);
const currentPayload = computed(() => getActiveGenerationDraft(props.session).payload);

function schedule(callback: () => void, delay: number) {
  const id = globalThis.setTimeout(() => {
    timers.delete(id);
    callback();
  }, delay);
  timers.add(id);
}
function runNext() {
  if (props.session.queueItems.some((item) => item.status === 'running')) {
    return;
  }
  const next = props.session.queueItems.find((item) => item.status === 'pending');
  if (!next) {
    return;
  }
  next.status = 'running';
  next.progress = 22;
  const candidate = props.session.staging?.candidates.find((item) => item.queueItemId === next.id);
  if (candidate) {
    candidate.status = 'running';
  }
  schedule(() => {
    next.progress = 100;
    next.status = 'completed';
    if (candidate) {
      candidate.status = 'completed';
      const staging = props.session.staging;
      if (staging) {
        if (!staging.focusedCandidateId) {
          staging.focusedCandidateId = candidate.id;
          staging.selectedCandidateIds = [candidate.id];
        } else {
          staging.focusedCandidateId = candidate.id;
        }
      }
    }
    runNext();
  }, 420);
}
function generate(count: number) {
  for (const timer of timers) {
    clearTimeout(timer);
  }
  timers.clear();
  const id = Date.now();
  const draft = getActiveGenerationDraft(props.session);
  const expansion = expandPromptPairs(
    serializeGenerationPrompt(draft.payload.prompt),
    serializeGenerationPrompt(draft.payload.negativePrompt),
    draft.dynamicPrompt.maxPrompts,
  );
  const jobs = expansion.pairs.flatMap((pair) =>
    Array.from({ length: count }, (_, iteration) => ({ iteration: iteration + 1, ...pair })),
  );
  const mode = deriveGenerationMode(props.session);
  props.session.queueItems = jobs.map((job, index) => ({
    derivedMode: mode,
    id: `queue-${id}-${index}`,
    iteration: job.iteration,
    label: `Image ${index + 1}`,
    negativePrompt: job.negativePrompt,
    negativePromptTokens: cloneGenerationPrompt(
      draft.payload.negativePrompt ?? createGenerationPrompt(),
    ).tokens,
    progress: 0,
    prompt: job.prompt,
    promptTokens: cloneGenerationPrompt(draft.payload.prompt ?? createGenerationPrompt()).tokens,
    status: 'pending' as const,
  }));
  const selected = props.session.ui.selection;
  const patchTarget =
    selected?.kind === 'compositing-layer' &&
    props.session.document.layers.find((layer) => layer.id === selected.id)?.kind === 'smart-patch';
  props.session.staging = {
    candidates: props.session.queueItems.map((item, index) => ({
      id: `candidate-${id}-${index}`,
      imageIndex: index + 1,
      queueItemId: item.id,
      status: 'pending',
      tone: (['emerald', 'blue', 'rose', 'violet'] as const)[index % 4]!,
    })),
    collapsed: false,
    previewVisible: true,
    selectedCandidateIds: [],
    target: patchTarget
      ? { kind: 'smart-patch', layerId: selected!.id }
      : { kind: 'project-canvas' },
  };
  runNext();
}
function cancelCurrent() {
  const current = props.session.queueItems.find((item) => item.status === 'running');
  if (current) {
    current.status = 'canceled';
    const candidate = props.session.staging?.candidates.find(
      (item) => item.queueItemId === current.id,
    );
    if (candidate) {
      candidate.status = 'canceled';
    }
  }
  runNext();
}
function cancelPending() {
  props.session.queueItems.forEach((item) => {
    if (item.status === 'pending') {
      item.status = 'canceled';
    }
  });
  props.session.staging?.candidates.forEach((item) => {
    if (item.status === 'pending') {
      item.status = 'canceled';
    }
  });
}
function requestAccept() {
  const unfinished = props.session.queueItems.some(
    (item) => item.status === 'running' || item.status === 'pending',
  );
  if (unfinished) {
    showEarlyAccept.value = true;
  } else {
    accept();
  }
}
function accept() {
  showEarlyAccept.value = false;
  acceptStagingCandidates(props.session);
  message.success('Selected results added to project');
}
function openPreset(id: string) {
  pendingPresetId.value = id;
  showApplyPreset.value = true;
}
function applyPreset(value: {
  payload: typeof currentPayload.value;
  selectedSections: PresetSectionKey[];
}) {
  applyPresetSections(
    props.session,
    value.payload,
    value.selectedSections,
    selectedPreset.value.name,
  );
  pendingPresetId.value = undefined;
  message.success('Preset applied');
}
onBeforeUnmount(() => {
  for (const timer of timers) {
    clearTimeout(timer);
  }
});
</script>

<template>
  <section
    :aria-hidden="!active || undefined"
    aria-label="Project prototype"
    class="project-prototype"
    :inert="!active || undefined"
  >
    <NAlert
      v-if="session.ui.notice"
      class="project-notice"
      closable
      :title="session.ui.notice.text"
      :type="session.ui.notice.type"
      @close="session.ui.notice = undefined"
    />
    <div ref="outerHost" class="project-split-host">
      <NSplit v-model:size="leftSize" class="project-left-split" :max="leftMax" :min="leftMin">
        <template v-slot:1
          ><ProjectSettingsPanel
            v-if="!session.ui.leftCollapsed"
            v-model:imagesPerClick="imagesPerClick"
            :session
            @applyPreset="openPreset"
            @cancelGeneration="cancelCurrent"
            @generate="generate"
            @manageModels="emit('manageModels')"
            @managePresets="emit('managePresets')"
            @savePreset="emit('savePreset')"
            @toggleQueue="session.ui.queueOpen = !session.ui.queueOpen" />
          <div v-else class="collapsed-panel"
        /></template>
        <template v-slot:2>
          <div ref="innerHost" class="project-split-host">
            <NSplit
              v-model:size="centerSize"
              class="project-right-split"
              :disabled="session.ui.rightCollapsed"
              :max="centerMax"
              :min="centerMin"
            >
              <template v-slot:1
                ><ProjectCanvasWorkspace
                  :session
                  @acceptCandidates="requestAccept"
                  @cancelCurrent="cancelCurrent"
                  @cancelPending="cancelPending"
                  @clearQueue="
                    session.queueItems = session.queueItems.filter(
                      (item) => item.status === 'pending' || item.status === 'running',
                    )
                  "
                  @discardCandidates="discardStagingSession(session)"
                  @redo="redoProject(session)"
                  @undo="undoProject(session)"
              /></template>
              <template v-slot:2
                ><ProjectLayersPanel v-if="!session.ui.rightCollapsed" :session />
                <div v-else class="collapsed-panel"
              /></template>
            </NSplit>
          </div>
        </template>
      </NSplit>
    </div>

    <ApplyPresetModal
      v-model:show="showApplyPreset"
      :currentPayload
      :projectName="session.document.title"
      :sourcePreset="selectedPreset"
      @apply="applyPreset"
      @editOriginal="
        showApplyPreset = false;
        emit('managePresets');
      "
      @update:show="!$event && (pendingPresetId = undefined)"
    />
    <NModal v-model:show="showEarlyAccept" :maskClosable="false"
      ><NCard aria-label="Accept generation results" class="confirm-card" role="dialog" size="small"
        ><h2>Add selected results now?</h2>
        <NText
          >Unfinished jobs will be canceled and unselected temporary candidates discarded.</NText
        >
        <footer>
          <NButton tertiary @click="showEarlyAccept = false">Cancel</NButton
          ><NButton type="primary" @click="accept">Add selected results</NButton>
        </footer></NCard
      ></NModal
    >
  </section>
</template>

<style scoped>
.project-prototype {
  position: absolute;
  inset: 0;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.project-notice {
  position: absolute;
  top: 12px;
  left: 50%;
  z-index: var(--z-floating-control);
  width: min(440px, calc(100% - 80px));
  translate: -50% 0;
}
.project-left-split,
.project-right-split {
  min-width: 0;
  min-height: 0;
  height: 100%;
}
.project-split-host {
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
}
.collapsed-panel {
  width: 44px;
  height: 100%;
  background: var(--app-surface);
}
.confirm-card {
  width: min(460px, calc(100vw - 48px));
}
.confirm-card h2 {
  margin: 0 0 6px;
  font-size: 18px;
}
.confirm-card footer {
  display: flex;
  justify-content: end;
  gap: 8px;
  margin-top: 18px;
}
</style>
