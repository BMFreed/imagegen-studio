<script setup lang="ts">
import { DeviceFloppy as SaveIcon, X as XIcon } from '@vicons/tabler';
import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NCheckboxGroup,
  NDynamicTags,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NModal,
  NScrollbar,
  NSelect,
  NSwitch,
  NText,
  useMessage,
} from 'naive-ui';
import { computed, ref } from 'vue';

import type { PresetSectionKey, PresetWorkflow, SavePresetForm } from './presets.types';

import { sectionLabels, workflowLabels } from './presets.utils';

const message = useMessage();
const show = ref(true);
const includeSeed = ref(false);
const form = ref<SavePresetForm>({
  description: '',
  favorite: true,
  name: 'Sample Portrait Baseline',
  sections: [
    'prompt',
    'negativePrompt',
    'model',
    'loras',
    'embeddings',
    'size',
    'sampling',
    'guidance',
    'vae',
  ],
  tags: ['sample', 'portrait'],
  workflow: 'textToImage',
});

const workflowOptions = Object.entries(workflowLabels).map(([value, label]) => ({
  label,
  value,
}));

const baseSectionOptions = [
  'prompt',
  'negativePrompt',
  'model',
  'loras',
  'embeddings',
  'size',
  'sampling',
  'guidance',
  'vae',
] as const satisfies readonly PresetSectionKey[];

const saveSectionLabels: Partial<Record<PresetSectionKey, string>> = {
  denoisingStrength: 'Denoising Strength',
  embeddings: 'Embeddings',
  guidance: 'Steps & CFG',
  loras: 'LoRAs & Weights',
  model: 'Model & Version',
  negativePrompt: 'Negative Prompt',
  prompt: 'Prompt',
  sampling: 'Sampler & Scheduler',
  size: 'Project Size',
  vae: 'VAE',
};

const visibleSectionOptions = computed(() =>
  form.value.workflow === 'textToImage'
    ? baseSectionOptions
    : [...baseSectionOptions, 'denoisingStrength' as const],
);

const formValid = computed(
  () => form.value.name.trim().length > 0 && (form.value.sections.length > 0 || includeSeed.value),
);

function updateWorkflow(workflow: PresetWorkflow) {
  form.value.workflow = workflow;

  if (workflow === 'textToImage') {
    form.value.sections = form.value.sections.filter((section) => section !== 'denoisingStrength');
  }
}

function savePreset() {
  if (!formValid.value) {
    return;
  }

  show.value = false;
  message.success('Preset saved');
}
</script>

<template>
  <NModal v-model:show="show" :maskClosable="false">
    <NCard aria-label="Save Current as Preset" class="save-card" role="dialog" size="small">
      <header class="dialog-header">
        <div>
          <h1>Save Current as Preset</h1>
          <NText depth="3">Capture reusable generation settings from the open project.</NText>
        </div>
        <NButton aria-label="Close Save Preset" circle quaternary @click="show = false">
          <template v-slot:icon><NIcon :component="XIcon" /></template>
        </NButton>
      </header>

      <NScrollbar class="dialog-scroll">
        <div class="dialog-content">
          <div class="source-summary">
            <NText depth="3">Source project</NText>
            <strong>Sample Project B.igs</strong>
            <NText depth="3">832 × 1216 · Illustrious XL v1.1</NText>
          </div>

          <NForm labelPlacement="top">
            <NFormItem
              label="Name"
              :showFeedback="form.name.trim().length === 0"
              :validationStatus="form.name.trim().length === 0 ? 'error' : undefined"
            >
              <NInput v-model:value="form.name" :inputProps="{ 'aria-label': 'Preset name' }" />
            </NFormItem>
            <NFormItem label="Description (optional)">
              <NInput
                v-model:value="form.description"
                :inputProps="{ 'aria-label': 'Preset description' }"
                placeholder="What is this preset for?"
              />
            </NFormItem>
            <div class="form-grid">
              <NFormItem label="Workflow">
                <NSelect
                  aria-label="Workflow"
                  :options="workflowOptions"
                  :value="form.workflow"
                  @update:value="updateWorkflow"
                />
              </NFormItem>
              <NFormItem label="Favorite">
                <NSwitch v-model:value="form.favorite" aria-label="Favorite" />
              </NFormItem>
            </div>
            <NFormItem label="Tags">
              <NDynamicTags v-model:value="form.tags" aria-label="Preset tags" />
            </NFormItem>
          </NForm>

          <section class="sections-form">
            <h2>Sections to save</h2>
            <NCheckboxGroup v-model:value="form.sections">
              <div class="section-grid">
                <NCheckbox
                  v-for="section of visibleSectionOptions"
                  :key="section"
                  :label="saveSectionLabels[section] ?? sectionLabels[section]"
                  :value="section"
                />
              </div>
            </NCheckboxGroup>
          </section>

          <NAlert type="warning">
            <NCheckbox v-model:checked="includeSeed">Include seed</NCheckbox>
            <p>
              Off by default. Preserving a fixed seed makes future generations repeat the same
              image. Turn this on only when you need exact reproducibility.
            </p>
          </NAlert>
        </div>
      </NScrollbar>

      <footer class="dialog-actions">
        <NButton tertiary @click="show = false">Cancel</NButton>
        <NButton :disabled="!formValid" type="primary" @click="savePreset">
          <template v-slot:icon><NIcon :component="SaveIcon" /></template>
          Save Preset
        </NButton>
      </footer>
    </NCard>
  </NModal>
</template>

<style scoped>
.save-card {
  width: min(580px, calc(100vw - 48px));
  max-height: calc(100vh - 80px);
  overflow: hidden;
}

.save-card :deep(.n-card__content) {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: 0;
}

.dialog-header,
.dialog-actions,
.source-summary {
  display: flex;
  align-items: center;
}

.dialog-header {
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 14px;
}

h1 {
  margin: 0 0 3px;
  font-size: 18px;
}

.dialog-scroll {
  min-height: 0;
}

.dialog-content {
  display: grid;
  gap: 14px;
  padding-right: 8px;
}

.source-summary {
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 12px;
  background: var(--app-elevated);
}

.form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 110px;
  gap: 12px;
}

.sections-form {
  display: grid;
  gap: 10px;
}

h2 {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.section-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.section-grid .n-checkbox {
  min-height: 34px;
  padding: 7px 9px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
}

.n-alert p {
  margin: 6px 0 0 24px;
  font-size: 12px;
}

.dialog-actions {
  justify-content: end;
  gap: 8px;
  padding-top: 14px;
}
</style>
