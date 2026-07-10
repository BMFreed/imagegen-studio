<script setup lang="ts">
import {
  AlertTriangle as AlertIcon,
  Copy as CopyIcon,
  InfoCircle as InfoIcon,
  DeviceFloppy as SaveIcon,
  Settings as SettingsIcon,
  Trash as TrashIcon,
} from '@vicons/tabler';
import {
  NAlert,
  NButton,
  NCard,
  NCollapse,
  NDynamicTags,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NInputNumber,
  NScrollbar,
  NSelect,
  NSwitch,
  NText,
  NTooltip,
} from 'naive-ui';
import { computed, ref } from 'vue';

import type { PresetRecord, PresetSectionKey } from './presets.types';

import PresetEditorSection from './PresetEditorSection.vue';
import PresetEmbeddings from './PresetEmbeddings.vue';
import PresetLoraStack from './PresetLoraStack.vue';
import { presetHasMissingResources, workflowLabels } from './presets.utils';

const props = defineProps<{
  dirty: boolean;
}>();

const emit = defineEmits<{
  delete: [];
  duplicate: [];
  save: [];
}>();

const draft = defineModel<PresetRecord>({ required: true });
const expandedSections = ref<Array<number | string>>(['prompt', 'model', 'loras']);

const workflowOptions = Object.entries(workflowLabels).map(([value, label]) => ({
  label,
  value,
}));

const modelOptions = [
  { label: 'Illustrious XL', value: 'illustrious-xl-v1-1' },
  { label: 'NoobAI XL', value: 'noobai-xl-v3' },
];

const versionOptions = [
  { label: 'v1.1 main', value: 'v1.1 main' },
  { label: 'v1.0 archive', value: 'v1.0 archive' },
];

const samplerOptions = ['DPM++ 2M', 'Euler a', 'DPM++ SDE'].map((value) => ({
  label: value,
  value,
}));

const schedulerOptions = ['Karras', 'Normal', 'Exponential'].map((value) => ({
  label: value,
  value,
}));

const seedPolicyOptions = [
  { label: 'Random', value: 'random' },
  { label: 'Fixed', value: 'fixed' },
  { label: 'Reuse', value: 'reuse' },
];

const vaeOptions = [
  { label: 'Illustrious built-in', value: 'illustrious-built-in-vae' },
  { label: 'None', value: 'none' },
];

const hasMissingResources = computed(() => presetHasMissingResources(draft.value));
const isValid = computed(
  () => draft.value.name.trim().length > 0 && Object.keys(draft.value.payload).length > 0,
);
const loras = computed({
  get: () => draft.value.payload.loras ?? [],
  set: (value) => {
    draft.value.payload.loras = value;
  },
});
const embeddings = computed({
  get: () => draft.value.payload.embeddings ?? [],
  set: (value) => {
    draft.value.payload.embeddings = value;
  },
});

function sectionIncluded(section: PresetSectionKey): boolean {
  return draft.value.payload[section] !== undefined;
}

function setSectionIncluded(section: PresetSectionKey, included: boolean) {
  if (!included) {
    delete draft.value.payload[section];
    return;
  }

  switch (section) {
    case 'denoisingStrength': {
      draft.value.payload.denoisingStrength = 0.5;
      break;
    }
    case 'embeddings': {
      draft.value.payload.embeddings = [];
      break;
    }
    case 'guidance': {
      draft.value.payload.guidance = { cfgScale: 5, steps: 28 };
      break;
    }
    case 'loras': {
      draft.value.payload.loras = [];
      break;
    }
    case 'model': {
      draft.value.payload.model = {
        baseModel: 'Illustrious',
        id: 'illustrious-xl-v1-1',
        name: 'Illustrious XL',
        predictionType: 'v-pred',
        version: 'v1.1 main',
      };
      break;
    }
    case 'negativePrompt': {
      draft.value.payload.negativePrompt = '';
      break;
    }
    case 'prompt': {
      draft.value.payload.prompt = '';
      break;
    }
    case 'sampling': {
      draft.value.payload.sampling = { sampler: 'DPM++ 2M', scheduler: 'Karras' };
      break;
    }
    case 'seed': {
      draft.value.payload.seed = { policy: 'random' };
      break;
    }
    case 'size': {
      draft.value.payload.size = { height: 1024, width: 1024 };
      break;
    }
    case 'vae': {
      draft.value.payload.vae = {
        id: 'illustrious-built-in-vae',
        name: 'Illustrious built-in',
      };
      break;
    }
  }
}

function updateModel(modelId: string) {
  if (!draft.value.payload.model) {
    return;
  }

  if (modelId === 'noobai-xl-v3') {
    draft.value.payload.model = {
      baseModel: 'NoobAI',
      id: modelId,
      name: 'NoobAI XL',
      predictionType: 'epsilon',
      version: 'v3',
    };
    return;
  }

  draft.value.payload.model = {
    baseModel: 'Illustrious',
    id: modelId,
    name: 'Illustrious XL',
    predictionType: 'v-pred',
    version: 'v1.1 main',
  };
}
</script>

<template>
  <section class="preset-editor">
    <NScrollbar class="editor-scroll">
      <div class="editor-content">
        <NCard size="small">
          <NForm labelPlacement="top" size="small">
            <NFormItem
              label="Name"
              :validationStatus="draft.name.trim().length === 0 ? 'error' : undefined"
            >
              <NInput v-model:value="draft.name" :inputProps="{ 'aria-label': 'Preset name' }" />
            </NFormItem>
            <NFormItem label="Description">
              <NInput
                v-model:value="draft.description"
                :autosize="{ minRows: 2, maxRows: 3 }"
                :inputProps="{ 'aria-label': 'Preset description' }"
                type="textarea"
              />
            </NFormItem>
            <div class="identity-grid">
              <NFormItem label="Workflow">
                <NSelect
                  v-model:value="draft.workflow"
                  aria-label="Workflow"
                  :options="workflowOptions"
                />
              </NFormItem>
              <NFormItem label="Favorite">
                <NSwitch v-model:value="draft.favorite" aria-label="Favorite" />
              </NFormItem>
            </div>
            <NFormItem label="Tags">
              <NDynamicTags v-model:value="draft.tags" aria-label="Preset tags" />
            </NFormItem>
          </NForm>
        </NCard>

        <NAlert v-if="hasMissingResources" title="Missing resource" type="warning">
          <div class="missing-alert-content">
            <span>One or more resources used by this preset are not installed.</span>
            <NButton size="small" tertiary type="warning">
              <template v-slot:icon><NIcon :component="SettingsIcon" /></template>
              Open in Models
            </NButton>
          </div>
        </NAlert>

        <NCard size="small">
          <NCollapse v-model:expandedNames="expandedSections" displayDirective="show">
            <PresetEditorSection
              :included="sectionIncluded('prompt')"
              name="prompt"
              title="Prompt"
              @update:included="setSectionIncluded('prompt', $event)"
            >
              <NInput
                :autosize="{ minRows: 3, maxRows: 6 }"
                :inputProps="{ 'aria-label': 'Prompt' }"
                type="textarea"
                :value="draft.payload.prompt"
                @update:value="draft.payload.prompt = $event"
              />
            </PresetEditorSection>

            <PresetEditorSection
              :included="sectionIncluded('negativePrompt')"
              name="negativePrompt"
              title="Negative Prompt"
              @update:included="setSectionIncluded('negativePrompt', $event)"
            >
              <NInput
                :autosize="{ minRows: 3, maxRows: 6 }"
                :inputProps="{ 'aria-label': 'Negative Prompt' }"
                type="textarea"
                :value="draft.payload.negativePrompt"
                @update:value="draft.payload.negativePrompt = $event"
              />
            </PresetEditorSection>

            <PresetEditorSection
              :included="sectionIncluded('model')"
              name="model"
              title="Model"
              @update:included="setSectionIncluded('model', $event)"
            >
              <div v-if="draft.payload.model" class="field-stack">
                <label>
                  <NText depth="3">Model</NText>
                  <NSelect
                    aria-label="Model"
                    :options="modelOptions"
                    :value="draft.payload.model.id"
                    @update:value="updateModel"
                  />
                </label>
                <label>
                  <NText depth="3">Version</NText>
                  <NSelect
                    aria-label="Model version"
                    :options="versionOptions"
                    :value="draft.payload.model.version"
                    @update:value="draft.payload.model!.version = $event"
                  />
                </label>
                <div class="model-compatibility">
                  <NText depth="3">{{ draft.payload.model.baseModel }}</NText>
                  <NText>{{ draft.payload.model.predictionType }}</NText>
                  <NTooltip>
                    <template v-slot:trigger>
                      <NButton aria-label="About prediction type" circle quaternary size="tiny">
                        <template v-slot:icon><NIcon :component="InfoIcon" /></template>
                      </NButton>
                    </template>
                    Prediction mode required by this model.
                  </NTooltip>
                </div>
              </div>
            </PresetEditorSection>

            <PresetEditorSection
              :included="sectionIncluded('loras')"
              name="loras"
              title="LoRA Stack"
              @update:included="setSectionIncluded('loras', $event)"
            >
              <PresetLoraStack v-model="loras" />
            </PresetEditorSection>

            <PresetEditorSection
              :included="sectionIncluded('embeddings')"
              name="embeddings"
              title="Embeddings"
              @update:included="setSectionIncluded('embeddings', $event)"
            >
              <PresetEmbeddings v-model="embeddings" />
            </PresetEditorSection>

            <PresetEditorSection
              :included="sectionIncluded('size')"
              name="size"
              title="Size"
              @update:included="setSectionIncluded('size', $event)"
            >
              <div v-if="draft.payload.size" class="two-column-fields">
                <label>
                  <NText depth="3">Width</NText>
                  <NInputNumber
                    :inputProps="{ 'aria-label': 'Width' }"
                    :min="64"
                    :step="64"
                    :value="draft.payload.size.width"
                    @update:value="draft.payload.size!.width = $event ?? 64"
                  />
                </label>
                <label>
                  <NText depth="3">Height</NText>
                  <NInputNumber
                    :inputProps="{ 'aria-label': 'Height' }"
                    :min="64"
                    :step="64"
                    :value="draft.payload.size.height"
                    @update:value="draft.payload.size!.height = $event ?? 64"
                  />
                </label>
              </div>
            </PresetEditorSection>

            <PresetEditorSection
              :included="sectionIncluded('sampling')"
              name="sampling"
              title="Sampler & Scheduler"
              @update:included="setSectionIncluded('sampling', $event)"
            >
              <div v-if="draft.payload.sampling" class="two-column-fields">
                <label>
                  <NText depth="3">Sampler</NText>
                  <NSelect
                    aria-label="Sampler"
                    :options="samplerOptions"
                    :value="draft.payload.sampling.sampler"
                    @update:value="draft.payload.sampling!.sampler = $event"
                  />
                </label>
                <label>
                  <NText depth="3">Scheduler</NText>
                  <NSelect
                    aria-label="Scheduler"
                    :options="schedulerOptions"
                    :value="draft.payload.sampling.scheduler"
                    @update:value="draft.payload.sampling!.scheduler = $event"
                  />
                </label>
              </div>
            </PresetEditorSection>

            <PresetEditorSection
              :included="sectionIncluded('guidance')"
              name="guidance"
              title="Steps & CFG"
              @update:included="setSectionIncluded('guidance', $event)"
            >
              <div v-if="draft.payload.guidance" class="two-column-fields">
                <label>
                  <NText depth="3">Steps</NText>
                  <NInputNumber
                    :inputProps="{ 'aria-label': 'Steps' }"
                    :min="1"
                    :value="draft.payload.guidance.steps"
                    @update:value="draft.payload.guidance!.steps = $event ?? 1"
                  />
                </label>
                <label>
                  <NText depth="3">CFG</NText>
                  <NInputNumber
                    :inputProps="{ 'aria-label': 'CFG' }"
                    :min="0"
                    :step="0.1"
                    :value="draft.payload.guidance.cfgScale"
                    @update:value="draft.payload.guidance!.cfgScale = $event ?? 0"
                  />
                </label>
              </div>
            </PresetEditorSection>

            <PresetEditorSection
              v-if="draft.workflow !== 'textToImage'"
              :included="sectionIncluded('denoisingStrength')"
              name="denoisingStrength"
              title="Denoising Strength"
              @update:included="setSectionIncluded('denoisingStrength', $event)"
            >
              <NInputNumber
                :inputProps="{ 'aria-label': 'Denoising Strength' }"
                :max="1"
                :min="0"
                :step="0.05"
                :value="draft.payload.denoisingStrength"
                @update:value="draft.payload.denoisingStrength = $event ?? 0"
              />
            </PresetEditorSection>

            <PresetEditorSection
              :included="sectionIncluded('seed')"
              name="seed"
              title="Seed"
              @update:included="setSectionIncluded('seed', $event)"
            >
              <div v-if="draft.payload.seed" class="field-stack">
                <label>
                  <NText depth="3">Seed policy</NText>
                  <NSelect
                    aria-label="Seed policy"
                    :options="seedPolicyOptions"
                    :value="draft.payload.seed.policy"
                    @update:value="draft.payload.seed!.policy = $event"
                  />
                </label>
                <label v-if="draft.payload.seed.policy === 'fixed'">
                  <NText depth="3">Seed value</NText>
                  <NInputNumber
                    :inputProps="{ 'aria-label': 'Seed value' }"
                    :min="0"
                    :value="draft.payload.seed.value ?? 0"
                    @update:value="draft.payload.seed!.value = $event ?? 0"
                  />
                </label>
              </div>
            </PresetEditorSection>

            <PresetEditorSection
              :included="sectionIncluded('vae')"
              name="vae"
              title="VAE"
              @update:included="setSectionIncluded('vae', $event)"
            >
              <NSelect
                v-if="draft.payload.vae"
                aria-label="VAE"
                :options="vaeOptions"
                :value="draft.payload.vae.id"
                @update:value="
                  draft.payload.vae =
                    $event === 'none'
                      ? { id: 'none', name: 'None' }
                      : { id: 'illustrious-built-in-vae', name: 'Illustrious built-in' }
                "
              />
            </PresetEditorSection>
          </NCollapse>
        </NCard>
      </div>
    </NScrollbar>

    <footer class="editor-actions">
      <NButton size="small" tertiary type="error" @click="emit('delete')">
        <template v-slot:icon><NIcon :component="TrashIcon" /></template>
        Delete
      </NButton>
      <NButton secondary size="small" @click="emit('duplicate')">
        <template v-slot:icon><NIcon :component="CopyIcon" /></template>
        Duplicate
      </NButton>
      <span class="save-status-slot">
        <NText v-if="props.dirty" class="save-status" type="warning">
          <NIcon :component="AlertIcon" />
          Unsaved changes
        </NText>
      </span>
      <NButton
        :disabled="!props.dirty || !isValid"
        size="small"
        type="primary"
        @click="emit('save')"
      >
        <template v-slot:icon><NIcon :component="SaveIcon" /></template>
        Save Changes
      </NButton>
    </footer>
  </section>
</template>

<style scoped>
.preset-editor {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.editor-scroll {
  min-height: 0;
}

.editor-content {
  display: grid;
  gap: 12px;
  padding: 14px;
}

.identity-grid,
.two-column-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}

.identity-grid {
  grid-template-columns: minmax(0, 1fr) auto;
}

.field-stack,
.two-column-fields label {
  display: grid;
  gap: 6px;
}

.field-stack {
  gap: 12px;
}

.model-compatibility {
  display: flex;
  align-items: center;
  gap: 8px;
}

.missing-alert-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.editor-actions {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 54px;
  padding: 9px 14px;
  border-top: 1px solid var(--app-border);
  background: var(--app-surface);
}

.save-status-slot,
.save-status {
  display: inline-flex;
  align-items: center;
}

.save-status-slot {
  justify-self: end;
}

.save-status {
  gap: 5px;
  white-space: nowrap;
}

@media (max-width: 1350px) {
  .editor-actions {
    grid-template-columns: auto auto minmax(0, 1fr);
  }

  .save-status-slot {
    display: none;
  }
}
</style>
