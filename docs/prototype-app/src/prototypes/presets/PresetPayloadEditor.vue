<script setup lang="ts">
import { InfoCircle as InfoIcon } from '@vicons/tabler';
import {
  NButton,
  NCard,
  NCollapse,
  NIcon,
  NInput,
  NInputNumber,
  NSelect,
  NText,
  NTooltip,
} from 'naive-ui';
import { computed } from 'vue';

import type {
  PresetEditorResources,
  PresetPayload,
  PresetSectionKey,
  PresetWorkflow,
} from './presets.types';

import PresetEmbeddings from './PresetEmbeddings.vue';
import PresetLoraStack from './PresetLoraStack.vue';
import PresetPayloadSection from './PresetPayloadSection.vue';
import { clonePreset, sectionLabels } from './presets.utils';

const props = withDefaults(
  defineProps<{
    disabledSections?: PresetSectionKey[];
    resources: PresetEditorResources;
    sections: PresetSectionKey[];
    workflow: PresetWorkflow;
  }>(),
  {
    disabledSections: () => [],
  },
);

const payload = defineModel<PresetPayload>({ required: true });
const expandedSections = defineModel<PresetSectionKey[]>('expandedSections', {
  default: () => [],
});

const visibleSections = computed(() =>
  props.sections.filter(
    (section) => section !== 'denoisingStrength' || props.workflow !== 'textToImage',
  ),
);
const modelOptions = computed(() =>
  props.resources.models.map((model) => ({
    label: `${model.name}${model.version ? ` · ${model.version}` : ''}`,
    value: model.id,
  })),
);
const vaeOptions = computed(() =>
  props.resources.vaes.map((vae) => ({ label: vae.name, value: vae.id })),
);
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
const loras = computed({
  get: () => payload.value.loras ?? [],
  set: (value) => {
    payload.value.loras = value;
  },
});
const embeddings = computed({
  get: () => payload.value.embeddings ?? [],
  set: (value) => {
    payload.value.embeddings = value;
  },
});

function sectionDisabled(section: PresetSectionKey): boolean {
  return props.disabledSections.includes(section);
}

function sectionPresent(section: PresetSectionKey): boolean {
  return payload.value[section] !== undefined;
}

function updateModel(modelId: string) {
  const model = props.resources.models.find((candidate) => candidate.id === modelId);

  if (model) {
    payload.value.model = clonePreset(model);
  }
}

function updateVae(vaeId: string) {
  const vae = props.resources.vaes.find((candidate) => candidate.id === vaeId);

  if (vae) {
    payload.value.vae = clonePreset(vae);
  }
}
</script>

<template>
  <NCard class="payload-card" size="small">
    <NCollapse v-model:expandedNames="expandedSections" displayDirective="show">
      <PresetPayloadSection
        v-for="section of visibleSections"
        :key="section"
        :contentVisible="sectionPresent(section)"
        :name="section"
        :title="sectionLabels[section]"
      >
        <template v-slot:context>
          <slot name="section-context" :section />
        </template>
        <template v-slot:actions>
          <slot name="section-actions" :section />
        </template>
        <template v-slot:control>
          <slot name="section-control" :section />
        </template>
        <template v-slot:empty>
          <slot name="section-empty" :section />
        </template>

        <NInput
          v-if="section === 'prompt'"
          key="prompt"
          :autosize="{ minRows: 3, maxRows: 6 }"
          :disabled="sectionDisabled(section)"
          :inputProps="{ 'aria-label': 'Prompt' }"
          type="textarea"
          :value="payload.prompt"
          @update:value="payload.prompt = $event"
        />

        <NInput
          v-else-if="section === 'negativePrompt'"
          key="negative-prompt"
          :autosize="{ minRows: 3, maxRows: 6 }"
          :disabled="sectionDisabled(section)"
          :inputProps="{ 'aria-label': 'Negative Prompt' }"
          type="textarea"
          :value="payload.negativePrompt"
          @update:value="payload.negativePrompt = $event"
        />

        <div v-else-if="section === 'model' && payload.model" class="field-stack">
          <label>
            <NText depth="3">Model</NText>
            <NSelect
              aria-label="Model"
              :disabled="sectionDisabled(section)"
              :options="modelOptions"
              :value="payload.model.id"
              @update:value="updateModel"
            />
          </label>
          <label>
            <NText depth="3">Version</NText>
            <NInput
              :disabled="sectionDisabled(section)"
              :inputProps="{ 'aria-label': 'Model version' }"
              :value="payload.model.version"
              @update:value="payload.model!.version = $event"
            />
          </label>
          <div class="model-compatibility">
            <NText depth="3">{{ payload.model.baseModel }}</NText>
            <NText>{{ payload.model.predictionType }}</NText>
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

        <PresetLoraStack
          v-else-if="section === 'loras'"
          v-model="loras"
          :disabled="sectionDisabled(section)"
          :resources="resources.loras"
        />

        <PresetEmbeddings
          v-else-if="section === 'embeddings'"
          v-model="embeddings"
          :disabled="sectionDisabled(section)"
          :resources="resources.embeddings"
        />

        <div v-else-if="section === 'size' && payload.size" class="two-column-fields">
          <label>
            <NText depth="3">Width</NText>
            <NInputNumber
              :disabled="sectionDisabled(section)"
              :inputProps="{ 'aria-label': 'Width' }"
              :min="64"
              :step="64"
              :value="payload.size.width"
              @update:value="payload.size!.width = $event ?? 64"
            />
          </label>
          <label>
            <NText depth="3">Height</NText>
            <NInputNumber
              :disabled="sectionDisabled(section)"
              :inputProps="{ 'aria-label': 'Height' }"
              :min="64"
              :step="64"
              :value="payload.size.height"
              @update:value="payload.size!.height = $event ?? 64"
            />
          </label>
        </div>

        <div v-else-if="section === 'sampling' && payload.sampling" class="two-column-fields">
          <label>
            <NText depth="3">Sampler</NText>
            <NSelect
              aria-label="Sampler"
              :disabled="sectionDisabled(section)"
              :options="samplerOptions"
              :value="payload.sampling.sampler"
              @update:value="payload.sampling!.sampler = $event"
            />
          </label>
          <label>
            <NText depth="3">Scheduler</NText>
            <NSelect
              aria-label="Scheduler"
              :disabled="sectionDisabled(section)"
              :options="schedulerOptions"
              :value="payload.sampling.scheduler"
              @update:value="payload.sampling!.scheduler = $event"
            />
          </label>
        </div>

        <div v-else-if="section === 'guidance' && payload.guidance" class="two-column-fields">
          <label>
            <NText depth="3">Steps</NText>
            <NInputNumber
              :disabled="sectionDisabled(section)"
              :inputProps="{ 'aria-label': 'Steps' }"
              :min="1"
              :value="payload.guidance.steps"
              @update:value="payload.guidance!.steps = $event ?? 1"
            />
          </label>
          <label>
            <NText depth="3">CFG</NText>
            <NInputNumber
              :disabled="sectionDisabled(section)"
              :inputProps="{ 'aria-label': 'CFG' }"
              :min="0"
              :step="0.1"
              :value="payload.guidance.cfgScale"
              @update:value="payload.guidance!.cfgScale = $event ?? 0"
            />
          </label>
        </div>

        <NInputNumber
          v-else-if="section === 'denoisingStrength'"
          :disabled="sectionDisabled(section)"
          :inputProps="{ 'aria-label': 'Denoising Strength' }"
          :max="1"
          :min="0"
          :step="0.05"
          :value="payload.denoisingStrength"
          @update:value="payload.denoisingStrength = $event ?? 0"
        />

        <div v-else-if="section === 'seed' && payload.seed" class="field-stack">
          <label>
            <NText depth="3">Seed policy</NText>
            <NSelect
              aria-label="Seed policy"
              :disabled="sectionDisabled(section)"
              :options="seedPolicyOptions"
              :value="payload.seed.policy"
              @update:value="payload.seed!.policy = $event"
            />
          </label>
          <label v-if="payload.seed.policy === 'fixed'">
            <NText depth="3">Seed value</NText>
            <NInputNumber
              :disabled="sectionDisabled(section)"
              :inputProps="{ 'aria-label': 'Seed value' }"
              :min="0"
              :value="payload.seed.value ?? 0"
              @update:value="payload.seed!.value = $event ?? 0"
            />
          </label>
        </div>

        <NSelect
          v-else-if="section === 'vae' && payload.vae"
          aria-label="VAE"
          :disabled="sectionDisabled(section)"
          :options="vaeOptions"
          :value="payload.vae.id"
          @update:value="updateVae"
        />
      </PresetPayloadSection>
    </NCollapse>
  </NCard>
</template>

<style scoped>
.payload-card :deep(.n-card__content) {
  padding: 0 14px;
}

.field-stack,
.two-column-fields label {
  display: grid;
  gap: 6px;
}

.field-stack {
  gap: 12px;
}

.two-column-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}

.model-compatibility {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
