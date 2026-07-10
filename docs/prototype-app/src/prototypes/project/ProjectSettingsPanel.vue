<script setup lang="ts">
import { Braces, Copy, DeviceFloppy, Hash, Settings } from '@vicons/tabler';
import {
  NAlert,
  NButton,
  NCard,
  NIcon,
  NInput,
  NInputNumber,
  NScrollbar,
  NSelect,
  NSwitch,
  NText,
} from 'naive-ui';
import { computed } from 'vue';

import type {
  GenerationLora,
  GenerationResourceRef,
} from '../../components/generation/generation.types';
import type { ProjectSession } from './project.types';

import GenerationEmbeddings from '../../components/generation/GenerationEmbeddings.vue';
import GenerationLoraStack from '../../components/generation/GenerationLoraStack.vue';
import { presetEditorResources, presetResources } from '../presets/presets.mock';
import { commitProjectMutation } from './project-history';
import {
  generationModeLabel,
  getActiveGenerationDraft,
  projectHasBlockingGenerationErrors,
} from './project.utils';

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
const promptWarning = computed(() => payload.value.prompt?.includes('(broken'));
const generateBlocked = computed(() => projectHasBlockingGenerationErrors(props.session));
const imagesPerClick = defineModel<number>('imagesPerClick', { default: 4 });
const presetOptions = presetResources.map((preset) => ({ label: preset.name, value: preset.id }));
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

function updatePayload(
  label: string,
  mutate: (draft: ReturnType<typeof getActiveGenerationDraft>) => void,
) {
  commitProjectMutation(props.session, label, () =>
    mutate(getActiveGenerationDraft(props.session)),
  );
}
function updatePrompt(value: string) {
  updatePayload('Edit prompt', (draft) => {
    draft.payload.prompt = value;
  });
}
function updateNegative(value: string) {
  updatePayload('Edit negative prompt', (draft) => {
    draft.payload.negativePrompt = value;
  });
}
function updateSize(key: 'height' | 'width', value: number | null) {
  if (!value) {
    return;
  }
  commitProjectMutation(props.session, 'Resize Project Canvas', (document) => {
    document.canvas[key] = value;
    document.generationDraft.payload.size = { ...document.canvas };
  });
}
function swapSize() {
  commitProjectMutation(props.session, 'Swap canvas dimensions', (document) => {
    [document.canvas.width, document.canvas.height] = [
      document.canvas.height,
      document.canvas.width,
    ];
    document.generationDraft.payload.size = { ...document.canvas };
  });
}
function updateModel(id: string) {
  const model = presetEditorResources.models.find((item) => item.id === id);
  if (model) {
    updatePayload('Change model', (draft) => {
      draft.payload.model = structuredClone(model);
    });
  }
}
function updateLoras(value: GenerationLora[]) {
  updatePayload('Edit LoRAs', (draft) => {
    draft.payload.loras = structuredClone(value);
  });
}
function updateEmbeddings(value: GenerationResourceRef[]) {
  updatePayload('Edit embeddings', (draft) => {
    draft.payload.embeddings = structuredClone(value);
  });
}
</script>

<template>
  <aside aria-label="Generate settings" class="settings-panel">
    <NScrollbar class="settings-scroll">
      <div class="settings-stack">
        <div class="create-label">
          <strong>Create</strong><NText depth="3">{{ generationModeLabel(session) }}</NText>
        </div>

        <NCard size="small" title="Preset">
          <div class="card-header-actions">
            <NSelect
              aria-label="Apply preset"
              :options="presetOptions"
              placeholder="Apply preset..."
              @update:value="emit('applyPreset', $event)"
            />
            <NButton aria-label="Manage Presets" circle quaternary @click="emit('managePresets')"
              ><template v-slot:icon><NIcon :component="Settings" /></template
            ></NButton>
            <NButton
              aria-label="Save Current as Preset"
              circle
              quaternary
              @click="emit('savePreset')"
              ><template v-slot:icon><NIcon :component="DeviceFloppy" /></template
            ></NButton>
          </div>
        </NCard>

        <NCard size="small">
          <template v-slot:header
            ><div class="card-title-line">
              <strong>Prompt</strong
              ><span
                ><NButton circle quaternary size="tiny" title="Insert tag"
                  ><NIcon :component="Hash" /></NButton
                ><NButton circle quaternary size="tiny" title="Preview dynamic prompt"
                  ><NIcon :component="Braces" /></NButton
                ><NButton circle quaternary size="tiny" title="Copy prompt"
                  ><NIcon :component="Copy" /></NButton
              ></span></div
          ></template>
          <NInput
            aria-label="Prompt"
            :autosize="{ minRows: 4, maxRows: 7 }"
            :inputProps="{ 'aria-label': 'Prompt' }"
            type="textarea"
            :value="payload.prompt"
            @update:value="updatePrompt"
          />
          <div class="field-footer">
            <NText depth="3"
              >{{ payload.prompt?.split(/\s+/).filter(Boolean).length ?? 0 }} tokens</NText
            ><NText v-if="promptWarning" type="warning">Check prompt weights</NText>
          </div>
        </NCard>

        <NCard size="small" title="Negative Prompt">
          <NInput
            aria-label="Negative Prompt"
            :autosize="{ minRows: 3, maxRows: 6 }"
            :inputProps="{ 'aria-label': 'Negative Prompt' }"
            type="textarea"
            :value="payload.negativePrompt"
            @update:value="updateNegative"
          />
          <div class="field-footer">
            <NText depth="3"
              >{{ payload.negativePrompt?.split(/\s+/).filter(Boolean).length ?? 0 }} tokens</NText
            >
          </div>
        </NCard>

        <NCard size="small" title="Size">
          <div class="two-fields">
            <label
              >Width<NInputNumber
                aria-label="Canvas width"
                :step="64"
                :value="session.document.canvas.width"
                @update:value="updateSize('width', $event)" /></label
            ><label
              >Height<NInputNumber
                aria-label="Canvas height"
                :step="64"
                :value="session.document.canvas.height"
                @update:value="updateSize('height', $event)"
            /></label>
          </div>
          <div class="card-footer-actions">
            <NButton size="small" tertiary @click="swapSize">Swap</NButton
            ><NButton size="small" tertiary @click="updateSize('width', 888)"
              >Fit to layers</NButton
            >
          </div>
        </NCard>

        <NCard size="small">
          <template v-slot:header>
            <div class="card-title-line">
              <strong>Generation</strong>
              <NButton size="tiny" tertiary @click="emit('manageModels')">
                <template v-slot:icon><NIcon :component="Settings" /></template>
                Manage Models
              </NButton>
            </div>
          </template>
          <NAlert v-if="payload.model?.missing" title="Selected model is missing" type="error"
            >Choose an installed model before generating.</NAlert
          >
          <div class="field-stack">
            <label
              >Model<NSelect
                aria-label="Generation model"
                :options="modelOptions"
                :value="payload.model?.id"
                @update:value="updateModel"
            /></label>
            <label
              >Version<NInput aria-label="Model version" disabled :value="payload.model?.version"
            /></label>
            <div class="two-fields">
              <label
                >Sampler<NSelect
                  aria-label="Sampler"
                  :options="samplerOptions"
                  :value="payload.sampling?.sampler"
                  @update:value="
                    updatePayload('Change sampler', (draft) => {
                      if (draft.payload.sampling) draft.payload.sampling.sampler = $event;
                    })
                  " /></label
              ><label
                >Scheduler<NSelect
                  aria-label="Scheduler"
                  :options="schedulerOptions"
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
                  :value="payload.guidance?.steps"
                  @update:value="
                    updatePayload('Change steps', (draft) => {
                      if (draft.payload.guidance) draft.payload.guidance.steps = $event ?? 1;
                    })
                  " /></label
              ><label
                >CFG<NInputNumber
                  aria-label="CFG"
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
              >Denoising Strength<NInputNumber
                aria-label="Denoising Strength"
                :disabled="generationModeLabel(session).startsWith('Text')"
                :max="1"
                :min="0"
                :step="0.05"
                :value="payload.denoisingStrength ?? 0.75"
                @update:value="
                  updatePayload('Change denoising', (draft) => {
                    draft.payload.denoisingStrength = $event ?? 0;
                  })
                "
              /><NText v-if="generationModeLabel(session).startsWith('Text')" depth="3"
                >Available when the target contains raster pixels.</NText
              ></label
            >
            <details>
              <summary>Advanced Options</summary>
              <div class="field-stack advanced">
                <label
                  >VAE<NSelect
                    aria-label="VAE"
                    :options="vaeOptions"
                    :value="payload.vae?.id" /></label
                ><label
                  >VAE precision<NSelect
                    aria-label="VAE precision"
                    :options="['Auto', 'FP16', 'FP32'].map((value) => ({ label: value, value }))"
                    :value="activeDraft.vaePrecision"
                /></label>
              </div>
            </details>
          </div>
        </NCard>

        <NCard size="small" title="LoRAs"
          ><NAlert v-if="payload.loras?.some((lora) => lora.resource.missing)" type="warning"
            >One selected LoRA is missing or incompatible.</NAlert
          ><GenerationLoraStack
            :modelValue="payload.loras ?? []"
            :resources="presetEditorResources.loras"
            @update:modelValue="updateLoras"
        /></NCard>
        <NCard size="small" title="Embeddings"
          ><GenerationEmbeddings
            :modelValue="payload.embeddings ?? []"
            :resources="presetEditorResources.embeddings"
            @update:modelValue="updateEmbeddings"
        /></NCard>
        <NCard size="small" title="Dynamic Prompting"
          ><div class="switch-row">
            <span>Expand dynamic syntax</span
            ><NSwitch
              :value="activeDraft.dynamicPrompting"
              @update:value="
                updatePayload('Toggle dynamic prompting', (draft) => {
                  draft.dynamicPrompting = $event;
                })
              "
            /></div
        ></NCard>
      </div>
    </NScrollbar>

    <footer class="generation-footer">
      <div class="generation-mode">
        <strong>{{ generationModeLabel(session) }}</strong
        ><NText v-if="generateBlocked" type="error">Resolve missing model</NText>
      </div>
      <NButton :disabled="generateBlocked" type="primary" @click="emit('generate', imagesPerClick)"
        >Generate</NButton
      >
      <NSelect
        v-model:value="imagesPerClick"
        aria-label="Images per click"
        class="count-select"
        :options="[1, 2, 4].map((value) => ({ label: String(value), value }))"
      />
      <NButton aria-label="Generation queue" quaternary @click="emit('toggleQueue')">Queue</NButton>
      <NButton
        aria-label="Cancel current generation"
        circle
        :disabled="!session.queueItems.some((item) => item.status === 'running')"
        quaternary
        @click="emit('cancelGeneration')"
        >×</NButton
      >
    </footer>
  </aside>
</template>

<style scoped>
.settings-panel {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-width: 0;
  height: 100%;
  background: var(--app-surface);
  border-right: 1px solid var(--app-border);
}
.settings-scroll {
  min-height: 0;
}
.settings-stack {
  display: grid;
  gap: 10px;
  padding: 12px;
}
.create-label {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 7px 10px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-elevated);
}
.card-header-actions,
.card-title-line,
.field-footer,
.card-footer-actions,
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.card-title-line {
  width: 100%;
}
.card-title-line span {
  display: flex;
}
.field-stack {
  display: grid;
  gap: 10px;
}
.field-stack label,
.two-fields label {
  display: grid;
  gap: 4px;
  color: var(--app-text-muted);
  font-size: 12px;
}
.two-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
}
.field-footer {
  margin-top: 6px;
  font-size: 11px;
}
.card-footer-actions {
  justify-content: end;
  margin-top: 8px;
}
.advanced {
  margin-top: 8px;
}
summary {
  cursor: pointer;
  color: var(--app-text-muted);
}
.generation-footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 62px auto auto;
  align-items: center;
  gap: 6px;
  padding: 9px 10px;
  background: var(--app-elevated);
  border-top: 1px solid var(--app-border);
}
.generation-mode {
  display: grid;
  grid-column: 1 / -1;
  min-width: 0;
  font-size: 11px;
}
.generation-mode strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.count-select {
  width: 62px;
}
:deep(.n-card-header) {
  padding: 10px 12px 6px;
  font-size: 13px;
}
:deep(.n-card__content) {
  padding: 8px 12px 12px;
}
</style>
