<script setup lang="ts">
import {
  ANIMA_SAMPLING_METHOD_OPTIONS,
  isAnimaSamplingMethod,
} from '../../../../../src/shared/projects/anima-sampling-method'

import { InfoCircle as InfoIcon, RotateClockwise } from '@vicons/tabler'
import { NButton, NCard, NCollapse, NIcon, NInputNumber, NSelect, NText, NTooltip } from 'naive-ui'
import { computed, ref, watch } from 'vue'

import type {
  PresetEditorResources,
  PresetPayload,
  PresetSectionKey,
  PresetWorkflow,
} from './presets.types'

import { createGenerationPrompt } from '../../components/generation/generation-prompt.utils'
import { mockDanbooruTags } from '../../components/generation/generation.mock'
import GenerationLoraStack from '../../components/generation/GenerationLoraStack.vue'
import GenerationPromptEditor from '../../components/generation/GenerationPromptEditor.vue'
import GenerationResourceSelect from '../../components/generation/GenerationResourceSelect.vue'
import IconButton from '../../components/IconButton.vue'
import PresetPayloadSection from './PresetPayloadSection.vue'
import { clonePreset, sectionLabels } from './presets.utils'

const props = withDefaults(
  defineProps<{
    disabledSections?: PresetSectionKey[]
    resources: PresetEditorResources
    sections: PresetSectionKey[]
    workflow: PresetWorkflow
  }>(),
  {
    disabledSections: () => [],
  },
)

const payload = defineModel<PresetPayload>({ required: true })
// A detached native-only section stays in its editing context when cleared.
const editingNativeOnlySampling = ref(false)
watch(payload, () => {
  editingNativeOnlySampling.value = false
})
const nativeSampling = computed(
  () =>
    payload.value.model?.baseModelFamily === 'anima' ||
    (!payload.value.model &&
      (editingNativeOnlySampling.value || payload.value.sampling?.animaMethod !== undefined)),
)
const animaModel = computed(() => payload.value.model?.baseModelFamily === 'anima')
const expandedSections = defineModel<PresetSectionKey[]>('expandedSections', {
  default: () => [],
})

const visibleSections = computed(() =>
  props.sections.filter(
    (section) => section !== 'denoisingStrength' || props.workflow !== 'textToImage',
  ),
)
const vaeOptions = computed(() =>
  props.resources.vaes.map((vae) => ({ label: vae.name, value: vae.id })),
)
const modelResources = computed(() => {
  const selected = payload.value.model

  if (!selected || props.resources.models.some((model) => model.id === selected.id)) {
    return props.resources.models
  }

  // Keep an unavailable exact version visible until the user explicitly replaces it.
  return [{ ...selected, missing: true }, ...props.resources.models]
})
const samplerOptions = ['DPM++ 2M', 'Euler a', 'Euler', 'DPM++ SDE'].map((value) => ({
  label: value,
  value,
}))
const schedulerOptions = ['Karras', 'Normal', 'Exponential'].map((value) => ({
  label: value,
  value,
}))
const vaePrecisionOptions = ['Auto', 'FP16', 'FP32'].map((value) => ({ label: value, value }))
const seedPolicyOptions = [
  { label: 'Random', value: 'random' },
  { label: 'Fixed', value: 'fixed' },
  { label: 'Reuse', value: 'reuse' },
]
const loras = computed({
  get: () => payload.value.loras ?? [],
  set: (value) => (payload.value.loras = value),
})

function removeLora(resourceId: string) {
  payload.value.loras = (payload.value.loras ?? []).filter(
    (lora) => lora.resource.id !== resourceId,
  )
}

function sectionDisabled(section: PresetSectionKey): boolean {
  return props.disabledSections.includes(section)
}

function sectionPresent(section: PresetSectionKey): boolean {
  return payload.value[section] !== undefined
}

function updateModel(modelId: string | null | undefined) {
  const model = props.resources.models.find((candidate) => candidate.id === modelId)

  if (model) {
    payload.value.model = clonePreset(model)
  }
}

function updateVae(vaeId: string) {
  const vae = props.resources.vaes.find((candidate) => candidate.id === vaeId)

  if (vae) {
    payload.value.vae = clonePreset(vae)
  }
}

function updateAnimaMethod(value: string | null) {
  if (!nativeSampling.value || (value !== null && !isAnimaSamplingMethod(value))) {
    return
  }
  editingNativeOnlySampling.value = true
  payload.value.sampling ??= {}
  if (value === null) {
    delete payload.value.sampling.animaMethod
  } else {
    payload.value.sampling.animaMethod = value
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

        <GenerationPromptEditor
          v-if="section === 'prompt'"
          key="prompt"
          ariaLabel="Prompt"
          :danbooruTags="mockDanbooruTags"
          :disabled="sectionDisabled(section)"
          :embeddings="resources.embeddings"
          historyMode="local"
          :loras="payload.loras ?? []"
          :minimumLines="3"
          :modelFamily="payload.model?.baseModelFamily ?? null"
          :modelValue="payload.prompt ?? createGenerationPrompt()"
          polarity="positive"
          @update:modelValue="payload.prompt = $event"
        />

        <GenerationPromptEditor
          v-else-if="section === 'negativePrompt'"
          key="negative-prompt"
          ariaLabel="Negative Prompt"
          :danbooruTags="mockDanbooruTags"
          :disabled="sectionDisabled(section)"
          :embeddings="resources.embeddings"
          historyMode="local"
          :loras="payload.loras ?? []"
          :minimumLines="3"
          :modelFamily="payload.model?.baseModelFamily ?? null"
          :modelValue="payload.negativePrompt ?? createGenerationPrompt()"
          polarity="negative"
          @update:modelValue="payload.negativePrompt = $event"
        />

        <div v-else-if="section === 'model' && payload.model" class="field-stack">
          <label>
            <NText depth="3">Model &amp; version</NText>
            <GenerationResourceSelect
              ariaLabel="Model"
              :disabled="sectionDisabled(section)"
              :modelValue="payload.model.id"
              :resources="modelResources"
              @update:modelValue="updateModel"
            />
          </label>
          <div class="model-compatibility">
            <NText depth="3">{{ payload.model.baseModel }}</NText>
            <NText v-if="!animaModel">{{ payload.model.predictionType }}</NText>
            <NTooltip v-if="!animaModel">
              <template v-slot:trigger>
                <NButton aria-label="About prediction type" circle quaternary size="tiny">
                  <template v-slot:icon><NIcon :component="InfoIcon" /></template>
                </NButton>
              </template>
              Prediction mode required by this model.
            </NTooltip>
          </div>
        </div>

        <GenerationLoraStack
          v-else-if="section === 'loras'"
          v-model="loras"
          :disabled="sectionDisabled(section)"
          :resources="resources.loras"
          @remove="removeLora"
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

        <div
          v-else-if="section === 'sampling' && payload.sampling && nativeSampling"
          class="field-stack"
        >
          <label>
            <NText depth="3">Sampler</NText>
            <NSelect
              aria-label="Anima method"
              clearable
              :disabled="sectionDisabled(section)"
              :options="ANIMA_SAMPLING_METHOD_OPTIONS"
              placeholder="Choose method"
              :value="payload.sampling.animaMethod ?? null"
              @update:value="updateAnimaMethod"
            />
          </label>
          <NText v-if="payload.sampling.animaMethod === undefined" depth="3">
            No Anima method is included. Apply keeps the current method.
          </NText>
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

        <div
          v-else-if="animaModel && ['cfgRescale', 'vae', 'vaePrecision'].includes(section)"
          class="field-stack"
        >
          <div class="unsupported-setting-row">
            <NText>
              {{
                section === 'vae'
                  ? payload.vae?.name
                  : section === 'vaePrecision'
                    ? payload.vaePrecision
                    : payload.cfgRescale
              }}
            </NText>
            <IconButton
              compact
              :disabled="sectionDisabled(section)"
              :icon="RotateClockwise"
              :label="`Reset unsupported ${sectionLabels[section]}`"
              @click="delete payload[section]"
            />
          </div>
          <NText depth="3">
            {{
              section === 'vae'
                ? 'Anima uses its pinned companion VAE.'
                : `${sectionLabels[section]} is not supported by Anima.`
            }}
            The saved value is preserved until Reset.
          </NText>
        </div>

        <NInputNumber
          v-else-if="section === 'cfgRescale'"
          key="cfg-rescale"
          :disabled="sectionDisabled(section)"
          :inputProps="{ 'aria-label': 'CFG Rescale' }"
          :max="0.99"
          :min="0"
          :precision="2"
          :step="0.05"
          :value="payload.cfgRescale ?? 0"
          @update:value="payload.cfgRescale = $event ?? 0"
        />

        <NInputNumber
          v-else-if="section === 'denoisingStrength'"
          key="denoising-strength"
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
          key="vae"
          aria-label="VAE"
          :disabled="sectionDisabled(section)"
          :options="vaeOptions"
          :value="payload.vae.id"
          @update:value="updateVae"
        />

        <NSelect
          v-else-if="section === 'vaePrecision'"
          key="vae-precision"
          aria-label="VAE Precision"
          :disabled="sectionDisabled(section)"
          :options="vaePrecisionOptions"
          :value="payload.vaePrecision ?? 'Auto'"
          @update:value="payload.vaePrecision = $event"
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

.unsupported-setting-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
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
