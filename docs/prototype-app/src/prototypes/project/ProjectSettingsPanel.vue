<script setup lang="ts">
import { ListCheck, ListDetails, Wand, X } from '@vicons/tabler';
import {
  NAlert,
  NBadge,
  NButton,
  NCard,
  NIcon,
  NInput,
  NInputNumber,
  NScrollbar,
  NSelect,
  NText,
  NTooltip,
} from 'naive-ui';
import { computed, ref } from 'vue';

import type {
  GenerationLora,
  GenerationResourceRef,
} from '../../components/generation/generation.types';
import type { ProjectDynamicPromptSettings, ProjectSession } from './project.types';

import GenerationEmbeddings from '../../components/generation/GenerationEmbeddings.vue';
import GenerationLoraStack from '../../components/generation/GenerationLoraStack.vue';
import { presetEditorResources } from '../presets/presets.mock';
import DynamicPromptsModal from './DynamicPromptsModal.vue';
import { commitProjectMutation } from './project-history';
import { expandPromptPairs } from './project-prompt.utils';
import {
  deriveGenerationMode,
  getActiveGenerationDraft,
  projectHasBlockingGenerationErrors,
} from './project.utils';
import ProjectPresetCard from './ProjectPresetCard.vue';
import ProjectPromptCard from './ProjectPromptCard.vue';
import ProjectSizeCard from './ProjectSizeCard.vue';

const props = defineProps<{ session: ProjectSession }>();
const emit = defineEmits<{
  applyPreset: [presetId: string];
  cancelGeneration: [];
  generate: [count: number];
  manageModels: [];
  managePresets: [];
  savePreset: [];
  toggleQueue: [];
}>();

const activeDraft = computed(() => getActiveGenerationDraft(props.session));
const payload = computed(() => activeDraft.value.payload);
const imagesPerClick = defineModel<number>('imagesPerClick', { default: 4 });
const dynamicPreviewOpen = ref(false);
const modelOptions = presetEditorResources.models.map((model) => ({
  label: model.name,
  value: model.id,
}));
const samplerOptions = ['DPM++ 2M', 'Euler a', 'DPM++ SDE'].map((value) => ({
  label: value,
  value,
}));
const schedulerOptions = ['Karras', 'Normal', 'Exponential'].map((value) => ({
  label: value,
  value,
}));
const vaeOptions = presetEditorResources.vaes.map((value) => ({
  label: value.name,
  value: value.id,
}));
const expandedPrompts = computed(() =>
  expandPromptPairs(
    payload.value.prompt ?? '',
    payload.value.negativePrompt ?? '',
    activeDraft.value.dynamicPrompt.maxPrompts,
  ),
);
const totalJobs = computed(() => expandedPrompts.value.pairs.length * imagesPerClick.value);
const activeQueueCount = computed(
  () =>
    props.session.queueItems.filter(
      (item) => item.status === 'pending' || item.status === 'running',
    ).length,
);
const blockingReason = computed(() => {
  if (projectHasBlockingGenerationErrors(props.session)) {
    return 'Choose an installed model before generating.';
  }
  if (expandedPrompts.value.error) {
    return expandedPrompts.value.error;
  }
  if (totalJobs.value > 100) {
    return `This batch would create ${totalJobs.value} jobs. The prototype limit is 100.`;
  }
  return undefined;
});
const denoisingDisabled = computed(() => deriveGenerationMode(props.session) === 'txt2img');

function updatePayload(
  label: string,
  mutate: (draft: ReturnType<typeof getActiveGenerationDraft>) => void,
) {
  commitProjectMutation(props.session, label, () =>
    mutate(getActiveGenerationDraft(props.session)),
  );
}
function updateModel(id: string) {
  const model = presetEditorResources.models.find((item) => item.id === id);
  if (model) {
    updatePayload('Change model', (draft) => (draft.payload.model = structuredClone(model)));
  }
}
function updateLoras(value: GenerationLora[]) {
  updatePayload('Edit LoRAs', (draft) => (draft.payload.loras = structuredClone(value)));
}
function updateEmbeddings(value: GenerationResourceRef[]) {
  updatePayload('Edit embeddings', (draft) => (draft.payload.embeddings = structuredClone(value)));
}
function updateDynamicSettings(value: ProjectDynamicPromptSettings) {
  updatePayload('Change dynamic prompt settings', (draft) => (draft.dynamicPrompt = value));
}
function normalizeCount(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return;
  }
  imagesPerClick.value = Math.min(100, Math.max(1, Math.round(value)));
}
</script>

<template>
  <aside aria-label="Generate settings" class="settings-panel">
    <div class="create-label"><strong>Create</strong></div>

    <footer class="generation-footer">
      <div class="generation-primary-actions">
        <NButton
          :disabled="Boolean(blockingReason)"
          type="primary"
          @click="emit('generate', imagesPerClick)"
        >
          <template v-slot:icon><NIcon :component="Wand" /></template>
          <strong>Generate</strong>
        </NButton>
        <NInputNumber
          aria-label="Images per click"
          class="count-input"
          :max="100"
          :min="1"
          :step="1"
          :value="imagesPerClick"
          @update:value="normalizeCount"
        />
      </div>
      <div class="generation-secondary-actions">
        <NBadge
          class="generation-queue-badge"
          :max="99"
          :offset="[-3, 3]"
          :show="activeQueueCount > 0"
          type="success"
          :value="activeQueueCount"
        >
          <NButton
            :aria-label="`Generation queue${activeQueueCount ? `, ${activeQueueCount} active jobs` : ''}`"
            circle
            secondary
            @click="emit('toggleQueue')"
          >
            <template v-slot:icon><NIcon :component="ListCheck" /></template>
          </NButton>
        </NBadge>
        <NButton
          aria-label="Cancel current generation"
          circle
          :disabled="!session.queueItems.some((item) => item.status === 'running')"
          secondary
          @click="emit('cancelGeneration')"
        >
          <template v-slot:icon><NIcon :component="X" /></template>
        </NButton>
      </div>
      <NText v-if="blockingReason" class="blocking-reason" type="error">{{ blockingReason }}</NText>
    </footer>

    <NScrollbar class="settings-scroll">
      <div class="settings-stack">
        <ProjectPresetCard
          @apply="emit('applyPreset', $event)"
          @manage="emit('managePresets')"
          @save="emit('savePreset')"
        />
        <ProjectSizeCard :session />
        <ProjectPromptCard
          field="prompt"
          :session
          title="Prompt"
          @dynamicPreview="dynamicPreviewOpen = true"
        />
        <ProjectPromptCard
          field="negativePrompt"
          :session
          title="Negative Prompt"
          @dynamicPreview="dynamicPreviewOpen = true"
        />

        <NCard size="small" title="LoRAs">
          <NAlert v-if="payload.loras?.some((lora) => lora.resource.missing)" type="warning"
            >One selected LoRA is missing or incompatible.</NAlert
          >
          <GenerationLoraStack
            :modelValue="payload.loras ?? []"
            :resources="presetEditorResources.loras"
            @update:modelValue="updateLoras"
          />
        </NCard>

        <NCard size="small" title="Embeddings">
          <GenerationEmbeddings
            :modelValue="payload.embeddings ?? []"
            :resources="presetEditorResources.embeddings"
            @update:modelValue="updateEmbeddings"
          />
        </NCard>

        <NCard size="small">
          <template v-slot:header
            ><div class="card-title-line">
              <strong>Generation</strong>
              <NButton
                aria-label="Manage Models"
                quaternary
                size="tiny"
                @click="emit('manageModels')"
                >Manage models<template v-slot:icon><NIcon :component="ListDetails" /></template
              ></NButton></div
          ></template>
          <NAlert v-if="payload.model?.missing" title="Selected model is missing" type="error"
            >Choose an installed model before generating.</NAlert
          >
          <div class="field-stack">
            <label
              >Model<NSelect
                aria-label="Generation model"
                :options="modelOptions"
                size="small"
                :value="payload.model?.id"
                @update:value="updateModel"
            /></label>
            <label
              >Version<NInput
                aria-label="Model version"
                disabled
                size="small"
                :value="payload.model?.version"
            /></label>
            <div class="two-fields">
              <label
                >Sampler<NSelect
                  aria-label="Sampler"
                  :options="samplerOptions"
                  size="small"
                  :value="payload.sampling?.sampler"
                  @update:value="
                    updatePayload('Change sampler', (draft) => {
                      if (draft.payload.sampling) draft.payload.sampling.sampler = $event;
                    })
                  "
              /></label>
              <label
                >Scheduler<NSelect
                  aria-label="Scheduler"
                  :options="schedulerOptions"
                  size="small"
                  :value="payload.sampling?.scheduler"
                  @update:value="
                    updatePayload('Change scheduler', (draft) => {
                      if (draft.payload.sampling) draft.payload.sampling.scheduler = $event;
                    })
                  "
              /></label>
            </div>
            <div class="two-fields">
              <label
                >Steps<NInputNumber
                  aria-label="Steps"
                  :min="1"
                  size="small"
                  :value="payload.guidance?.steps"
                  @update:value="
                    updatePayload('Change steps', (draft) => {
                      if (draft.payload.guidance) draft.payload.guidance.steps = $event ?? 1;
                    })
                  "
              /></label>
              <label
                >CFG<NInputNumber
                  aria-label="CFG"
                  size="small"
                  :step="0.1"
                  :value="payload.guidance?.cfgScale"
                  @update:value="
                    updatePayload('Change CFG', (draft) => {
                      if (draft.payload.guidance) draft.payload.guidance.cfgScale = $event ?? 0;
                    })
                  "
              /></label>
            </div>
            <label
              >Denoising Strength<NTooltip :disabled="!denoisingDisabled"
                ><template v-slot:trigger
                  ><NInputNumber
                    aria-label="Denoising Strength"
                    :disabled="denoisingDisabled"
                    :max="1"
                    :min="0"
                    size="small"
                    :step="0.05"
                    :value="payload.denoisingStrength ?? 0.75"
                    @update:value="
                      updatePayload('Change denoising', (draft) => {
                        draft.payload.denoisingStrength = $event ?? 0;
                      })
                    " /></template
                >Available when the generation area contains visible raster content.</NTooltip
              ><NText v-if="denoisingDisabled" depth="3"
                >Available when the generation area contains visible raster content.</NText
              ></label
            >
            <details>
              <summary>Advanced Options</summary>
              <div class="field-stack advanced">
                <label
                  >VAE<NSelect
                    aria-label="VAE"
                    :options="vaeOptions"
                    size="small"
                    :value="payload.vae?.id" /></label
                ><label
                  >VAE precision<NSelect
                    aria-label="VAE precision"
                    :options="['Auto', 'FP16', 'FP32'].map((value) => ({ label: value, value }))"
                    size="small"
                    :value="activeDraft.vaePrecision"
                /></label>
              </div>
            </details>
          </div>
        </NCard>
      </div>
    </NScrollbar>

    <DynamicPromptsModal
      v-model:show="dynamicPreviewOpen"
      :negativePrompt="payload.negativePrompt ?? ''"
      :prompt="payload.prompt ?? ''"
      :settings="activeDraft.dynamicPrompt"
      @updateSettings="updateDynamicSettings"
    />
  </aside>
</template>

<style scoped>
.settings-panel {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  min-width: 0;
  height: 100%;
  font-size: var(--app-font-size);
  background: var(--app-surface);
  border-right: 1px solid var(--app-border);
}
.settings-scroll {
  min-height: 0;
}
.settings-stack {
  display: grid;
  gap: 7px;
  padding: 8px;
}
.create-label {
  margin: 8px 8px 0;
  padding: 5px 8px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-elevated);
}
.card-title-line {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.field-stack {
  display: grid;
  gap: 7px;
}
.field-stack label,
.two-fields label {
  display: grid;
  gap: 3px;
  color: var(--app-text-muted);
  font-size: 11px;
}
.two-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.advanced {
  margin-top: 6px;
}
summary {
  cursor: pointer;
  color: var(--app-text-muted);
  font-size: 12px;
}
.generation-footer {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  padding: 7px 8px;
  background: var(--app-elevated);
  border-bottom: 1px solid var(--app-border);
}
.generation-primary-actions,
.generation-secondary-actions {
  display: grid;
  align-items: center;
  gap: 5px;
}
.generation-primary-actions {
  grid-template-columns: auto 70px;
  grid-column: 1;
}
.generation-secondary-actions {
  grid-template-columns: repeat(2, auto);
  grid-column: 3;
}
.blocking-reason {
  grid-column: 1 / -1;
  grid-row: 2;
  font-size: 11px;
}
.count-input {
  width: 70px;
}
:deep(.n-card-header) {
  padding: 7px 9px 4px;
  font-size: 12px;
}
:deep(.n-card-header__main) {
  font-weight: 600;
}
:deep(.n-card__content) {
  padding: 6px 9px 9px;
}
:deep(.n-alert) {
  margin-bottom: 6px;
  padding: 6px 8px;
  font-size: 11px;
}
</style>
