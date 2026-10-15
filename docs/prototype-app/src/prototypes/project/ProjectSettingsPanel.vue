<script setup lang="ts">
import {
  ANIMA_SAMPLING_METHOD_OPTIONS,
  isAnimaSamplingMethod,
} from '../../../../../src/shared/projects/anima-sampling-method'
import {
  isSmartPatchCoherenceSettings,
  resolveSmartPatchCoherenceSettings,
} from '../../../../../src/shared/projects/smart-patch-coherence-settings'

import { ArrowsShuffle, ListCheck, RotateClockwise, Wand, X } from '@vicons/tabler'
import {
  NAlert,
  NBadge,
  NButton,
  NCard,
  NIcon,
  NInputNumber,
  NScrollbar,
  NSelect,
  NSwitch,
  NText,
  NTooltip,
} from 'naive-ui'
import { computed, ref } from 'vue'

import type { ProjectCoherenceSettingsCommand } from '../../../../../src/renderer/components/project-coherence-settings-editor'
import type { ProjectMaskSettingsOwner } from '../../../../../src/renderer/components/project-mask-settings-editor'
import type { GenerationLora } from '../../components/generation/generation.types'
import type { ProjectDynamicPromptSettings, ProjectSession } from './project.types'

import ProjectCoherenceSettings from '../../../../../src/renderer/components/ProjectCoherenceSettings.vue'
import {
  promptHasAmbiguousEmbedding,
  promptHasMissingEmbedding,
  serializeGenerationPrompt,
} from '../../components/generation/generation-prompt.utils'
import GenerationLoraStack from '../../components/generation/GenerationLoraStack.vue'
import GenerationResourceSelect from '../../components/generation/GenerationResourceSelect.vue'
import IconButton from '../../components/IconButton.vue'
import { presetEditorResources } from '../presets/presets.mock'
import DynamicPromptsModal from './DynamicPromptsModal.vue'
import { commitProjectMutation } from './project-history'
import { expandPromptPairs } from './project-prompt.utils'
import {
  deriveGenerationMode,
  getActiveGenerationDraft,
  getSelectedEntity,
  projectHasBlockingGenerationErrors,
} from './project.utils'
import ProjectPresetCard from './ProjectPresetCard.vue'
import ProjectPromptCard from './ProjectPromptCard.vue'
import ProjectSizeCard from './ProjectSizeCard.vue'

const props = defineProps<{ active?: boolean; session: ProjectSession }>()
const emit = defineEmits<{
  applyPreset: [presetId: string]
  cancelGeneration: []
  generate: [count: number]
  manageModels: []
  managePresets: []
  savePreset: []
  toggleQueue: []
}>()

const activeDraft = computed(() => getActiveGenerationDraft(props.session))
const target = computed(() => {
  const entity = getSelectedEntity(props.session)
  return entity && 'kind' in entity && entity.kind === 'smart-patch' ? entity : undefined
})
const coherenceOwner = computed<ProjectMaskSettingsOwner | null>(() =>
  target.value && props.active !== false
    ? {
        documentId: props.session.document.id,
        documentRevision: JSON.stringify(props.session.document),
        layerId: target.value.id,
        projectKey: props.session.document.id,
      }
    : null,
)
function changeCoherence(command: ProjectCoherenceSettingsCommand) {
  const owner = coherenceOwner.value
  const patch = target.value
  if (
    !owner ||
    !patch ||
    patch.locked ||
    command.layerId !== owner.layerId ||
    command.change.documentId !== owner.documentId ||
    command.change.documentRevision !== owner.documentRevision ||
    !isSmartPatchCoherenceSettings(command.change.value)
  ) {
    return
  }
  const current = resolveSmartPatchCoherenceSettings(patch.coherenceSettings)
  const value = command.change.value
  if (
    current.mode === value.mode &&
    current.edgeSize === value.edgeSize &&
    current.minimumDenoise === value.minimumDenoise
  ) {
    return
  }
  commitProjectMutation(props.session, 'Change Smart Patch coherence', (document) => {
    const layer = document.layers.find((item) => item.id === command.layerId)
    if (layer?.kind === 'smart-patch') {
      layer.coherenceSettings = { ...value }
    }
  })
}
const payload = computed(() => activeDraft.value.payload)
const animaModel = computed(() => payload.value.model?.baseModelFamily === 'anima')
const seedPolicy = computed(() => payload.value.seed?.policy ?? 'random')
const displayedSeed = computed(() =>
  seedPolicy.value === 'reuse'
    ? (props.session.lastActualSeed ?? null)
    : (payload.value.seed?.value ?? 0),
)
const imagesPerClick = defineModel<number>('imagesPerClick', { default: 4 })
const dynamicPreviewOpen = ref(false)
const modelChoices = presetEditorResources.models.filter(
  (model, index, models) => models.findIndex((item) => item.name === model.name) === index,
)
const versionOptions = computed(() =>
  presetEditorResources.models
    .filter((model) => model.name === payload.value.model?.name)
    .map((model) => ({ label: model.version ?? 'Version unavailable', value: model.id })),
)
function selectModel(name: string | null | undefined) {
  const model = presetEditorResources.models.find((model) => model.name === name)
  if (model) {
    updateModel(model.id)
  }
}
const samplerOptions = ['DPM++ 2M', 'Euler a', 'Euler', 'DPM++ SDE'].map((value) => ({
  label: value,
  value,
}))
const schedulerOptions = ['Karras', 'Normal', 'Exponential'].map((value) => ({
  label: value,
  value,
}))
const vaeOptions = presetEditorResources.vaes.map((value) => ({
  label: value.name,
  value: value.id,
}))
const expandedPrompts = computed(() =>
  expandPromptPairs(
    serializeGenerationPrompt(payload.value.prompt),
    serializeGenerationPrompt(payload.value.negativePrompt),
    activeDraft.value.dynamicPrompt.maxPrompts,
  ),
)
const totalJobs = computed(() => expandedPrompts.value.pairs.length * imagesPerClick.value)
const activeQueueCount = computed(
  () =>
    props.session.queueItems.filter(
      (item) => item.status === 'pending' || item.status === 'running',
    ).length,
)
const blockingReason = computed(() => {
  if (
    promptHasMissingEmbedding(payload.value.prompt) ||
    promptHasMissingEmbedding(payload.value.negativePrompt)
  ) {
    return 'Replace the missing embedding in the prompt before generating.'
  }
  if (
    promptHasAmbiguousEmbedding(payload.value.prompt, presetEditorResources.embeddings) ||
    promptHasAmbiguousEmbedding(payload.value.negativePrompt, presetEditorResources.embeddings)
  ) {
    return 'Choose a specific embedding for the ambiguous prompt token before generating.'
  }
  if (projectHasBlockingGenerationErrors(props.session)) {
    return 'Choose an installed model before generating.'
  }
  if (payload.value.seed?.policy === 'reuse' && props.session.lastActualSeed === undefined) {
    return 'No completed seed in this project yet. Complete a generation before using Reuse.'
  }
  if (expandedPrompts.value.error) {
    return expandedPrompts.value.error
  }
  if (totalJobs.value > 100) {
    return `This batch would create ${totalJobs.value} jobs. The prototype limit is 100.`
  }
  return undefined
})
const denoisingDisabled = computed(() => deriveGenerationMode(props.session) === 'txt2img')

function updatePayload(
  label: string,
  mutate: (draft: ReturnType<typeof getActiveGenerationDraft>) => void,
) {
  commitProjectMutation(props.session, label, () => mutate(getActiveGenerationDraft(props.session)))
}
function updateModel(id: string) {
  const model = presetEditorResources.models.find((item) => item.id === id)
  if (model) {
    updatePayload('Change model', (draft) => (draft.payload.model = structuredClone(model)))
  }
}
function updateAnimaMethod(value: string | null) {
  if (
    payload.value.model?.baseModelFamily !== 'anima' ||
    (value !== null && !isAnimaSamplingMethod(value)) ||
    (payload.value.sampling?.animaMethod ?? null) === value
  ) {
    return
  }
  updatePayload('Change Anima method', (draft) => {
    draft.payload.sampling ??= {}
    if (value === null) {
      delete draft.payload.sampling.animaMethod
    } else {
      draft.payload.sampling.animaMethod = value
    }
  })
}
function updateLoras(value: GenerationLora[]) {
  updatePayload('Edit LoRAs', (draft) => {
    draft.payload.loras = JSON.parse(JSON.stringify(value)) as GenerationLora[]
  })
}
function removeLora(resourceId: string) {
  const value = (payload.value.loras ?? []).filter((lora) => lora.resource.id !== resourceId)
  updatePayload('Remove LoRA', (draft) => {
    draft.payload.loras = JSON.parse(JSON.stringify(value)) as GenerationLora[]
  })
}
function updateDynamicSettings(value: ProjectDynamicPromptSettings) {
  updatePayload('Change dynamic prompt settings', (draft) => (draft.dynamicPrompt = value))
}
function setRandomSeed(random: boolean) {
  updatePayload('Change seed policy', (draft) => {
    draft.payload.seed = random
      ? { policy: 'random', value: draft.payload.seed?.value ?? 0 }
      : { policy: 'fixed', value: draft.payload.seed?.value ?? 0 }
  })
}
function setFixedSeed(value: number | null) {
  if (value === null) {
    return
  }
  updatePayload('Change seed', (draft) => {
    draft.payload.seed = { policy: 'fixed', value }
  })
}
function shuffleSeed() {
  const random = globalThis.crypto.getRandomValues(new Uint32Array(1))[0]!
  setFixedSeed(random === displayedSeed.value ? (random + 1) >>> 0 : random)
}
function toggleReuseSeed() {
  const last = props.session.lastActualSeed
  if (last === undefined && seedPolicy.value !== 'reuse') {
    return
  }
  updatePayload('Change seed policy', (draft) => {
    draft.payload.seed =
      draft.payload.seed?.policy === 'reuse'
        ? { policy: 'fixed', value: last ?? draft.payload.seed?.value ?? 0 }
        : { policy: 'reuse', value: draft.payload.seed?.value ?? 0 }
  })
}
function normalizeCount(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return
  }
  imagesPerClick.value = Math.min(100, Math.max(1, Math.round(value)))
}
</script>

<template>
  <aside aria-label="Generate settings" class="settings-panel">
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
          class="count-input"
          :inputProps="{ 'aria-label': 'Images per click' }"
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
      <NText v-if="target" class="generation-target" depth="3">
        Smart Patch · {{ target.name }}
      </NText>
      <NText v-if="blockingReason" key="n-text-2" class="blocking-reason" type="error">
        {{ blockingReason }}
      </NText>
    </footer>

    <NScrollbar class="settings-scroll">
      <div class="settings-stack">
        <ProjectPresetCard
          @apply="emit('applyPreset', $event)"
          @manage="emit('managePresets')"
          @save="emit('savePreset')"
        />
        <section aria-label="Active model" class="model-summary">
          <div class="card-title-line">
            <strong>Model</strong>
            <NButton aria-label="Manage Models" size="tiny" text @click="emit('manageModels')">
              Manage models
            </NButton>
          </div>
          <GenerationResourceSelect
            ariaLabel="Generation model"
            :modelValue="payload.model?.name"
            :resources="modelChoices"
            valueKey="name"
            @update:modelValue="selectModel"
          />
          <NSelect
            aria-label="Model version"
            :options="versionOptions"
            size="small"
            :value="payload.model?.id"
            @update:value="updateModel"
          />
          <NText v-if="payload.model?.baseModelFamily !== 'anima'" depth="3">
            {{ payload.model?.predictionType ?? 'Prediction type unavailable' }}
          </NText>
        </section>
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

        <ProjectSizeCard :session />

        <NCard v-if="target" aria-label="Smart Patch mask" size="small" title="Mask">
          <ProjectCoherenceSettings
            :disabled="target.locked || active === false"
            :owner="coherenceOwner"
            :settings="target.coherenceSettings"
            @change="changeCoherence"
          />
        </NCard>

        <NCard size="small" title="LoRAs">
          <NAlert v-if="payload.loras?.some((lora) => lora.resource.missing)" type="warning">
            One selected LoRA is missing or incompatible.
          </NAlert>
          <GenerationLoraStack
            :modelValue="payload.loras ?? []"
            :resources="presetEditorResources.loras"
            @remove="removeLora"
            @update:modelValue="updateLoras"
          />
        </NCard>

        <NCard size="small">
          <template v-slot:header>
            <div class="card-title-line">
              <strong>Generation</strong>
            </div>
          </template>
          <NAlert v-if="payload.model?.missing" title="Selected model is missing" type="error">
            Choose an installed model before generating.
          </NAlert>
          <div class="field-stack">
            <label v-if="payload.model?.baseModelFamily === 'anima'">
              Sampler
              <NSelect
                aria-label="Anima method"
                clearable
                :options="ANIMA_SAMPLING_METHOD_OPTIONS"
                placeholder="Choose method"
                size="small"
                :value="payload.sampling?.animaMethod ?? null"
                @update:value="updateAnimaMethod"
              />
            </label>
            <div v-else class="two-fields">
              <label>
                Sampler
                <NSelect
                  aria-label="Sampler"
                  :options="samplerOptions"
                  size="small"
                  :value="payload.sampling?.sampler"
                  @update:value="
                    updatePayload('Change sampler', (draft) => {
                      if (draft.payload.sampling) draft.payload.sampling.sampler = $event
                    })
                  "
                />
              </label>
              <label>
                Scheduler
                <NSelect
                  aria-label="Scheduler"
                  :options="schedulerOptions"
                  size="small"
                  :value="payload.sampling?.scheduler"
                  @update:value="
                    updatePayload('Change scheduler', (draft) => {
                      if (draft.payload.sampling) draft.payload.sampling.scheduler = $event
                    })
                  "
                />
              </label>
            </div>
            <div class="two-fields">
              <label>
                Steps
                <NInputNumber
                  aria-label="Steps"
                  :min="1"
                  size="small"
                  :value="payload.guidance?.steps"
                  @update:value="
                    updatePayload('Change steps', (draft) => {
                      if (draft.payload.guidance) draft.payload.guidance.steps = $event ?? 1
                    })
                  "
                />
              </label>
              <label>
                CFG
                <NInputNumber
                  aria-label="CFG"
                  size="small"
                  :step="0.1"
                  :value="payload.guidance?.cfgScale"
                  @update:value="
                    updatePayload('Change CFG', (draft) => {
                      if (draft.payload.guidance) draft.payload.guidance.cfgScale = $event ?? 0
                    })
                  "
                />
              </label>
            </div>
            <label>
              Denoising Strength
              <NTooltip :disabled="!denoisingDisabled">
                <template v-slot:trigger>
                  <NInputNumber
                    aria-label="Denoising Strength"
                    :disabled="denoisingDisabled"
                    :max="1"
                    :min="0"
                    size="small"
                    :step="0.05"
                    :value="payload.denoisingStrength ?? 0.75"
                    @update:value="
                      updatePayload('Change denoising', (draft) => {
                        draft.payload.denoisingStrength = $event ?? 0
                      })
                    "
                  />
                </template>
                Available when the generation area contains visible raster content.
              </NTooltip>
              <NText v-if="denoisingDisabled" depth="3">
                Available when the generation area contains visible raster content.
              </NText>
            </label>
            <div class="seed-controls">
              <label class="seed-value">
                Seed
                <NInputNumber
                  :disabled="seedPolicy === 'random'"
                  :inputProps="{ 'aria-label': 'Generation seed' }"
                  :max="4294967295"
                  :min="0"
                  placeholder="—"
                  :precision="0"
                  size="small"
                  :value="displayedSeed"
                  @update:value="setFixedSeed"
                />
              </label>
              <label class="seed-random">
                Random
                <NSwitch
                  aria-label="Random seed"
                  size="small"
                  :value="seedPolicy === 'random'"
                  @update:value="setRandomSeed"
                />
              </label>
              <NButton
                aria-label="Shuffle Seed"
                class="seed-shuffle"
                :disabled="seedPolicy === 'random'"
                secondary
                size="small"
                @click="shuffleSeed"
              >
                <template v-slot:icon><NIcon :component="ArrowsShuffle" /></template>
                Shuffle
              </NButton>
              <div class="seed-reuse">
                <NButton
                  aria-label="Reuse last seed"
                  :aria-pressed="seedPolicy === 'reuse'"
                  :disabled="session.lastActualSeed === undefined && seedPolicy !== 'reuse'"
                  size="tiny"
                  text
                  :type="seedPolicy === 'reuse' ? 'primary' : 'default'"
                  @click="toggleReuseSeed"
                >
                  Reuse last seed
                </NButton>
                <NText v-if="session.lastActualSeed !== undefined" key="completed" depth="3">
                  Last completed: {{ session.lastActualSeed }}
                </NText>
                <NText v-else-if="seedPolicy === 'reuse'" key="missing" depth="3">
                  No completed seed in this project yet.
                </NText>
              </div>
            </div>
            <details>
              <summary>Advanced Options</summary>
              <div class="field-stack advanced">
                <div class="advanced-field">
                  <div class="advanced-control-row">
                    <label>
                      VAE
                      <NSelect
                        aria-label="VAE"
                        :disabled="animaModel"
                        :options="vaeOptions"
                        size="small"
                        :value="payload.vae?.id"
                        @update:value="
                          updatePayload('Change VAE', (draft) => {
                            draft.payload.vae = presetEditorResources.vaes.find(
                              (v) => v.id === $event,
                            )
                          })
                        "
                      />
                    </label>
                    <IconButton
                      v-if="animaModel && payload.vae !== undefined"
                      compact
                      :icon="RotateClockwise"
                      label="Reset unsupported VAE"
                      @click="
                        updatePayload('Reset unsupported VAE', (draft) => delete draft.payload.vae)
                      "
                    />
                  </div>
                  <NText v-if="animaModel" depth="3">Anima uses its pinned companion VAE.</NText>
                </div>
                <div class="advanced-field">
                  <div class="advanced-control-row">
                    <label>
                      VAE precision
                      <NSelect
                        aria-label="VAE precision"
                        :disabled="animaModel"
                        :options="
                          ['Auto', 'FP16', 'FP32'].map((value) => ({ label: value, value }))
                        "
                        size="small"
                        :value="payload.vaePrecision ?? (animaModel ? null : 'Auto')"
                        @update:value="
                          updatePayload('Change VAE precision', (draft) => {
                            draft.payload.vaePrecision = $event
                          })
                        "
                      />
                    </label>
                    <IconButton
                      v-if="animaModel && payload.vaePrecision !== undefined"
                      compact
                      :icon="RotateClockwise"
                      label="Reset unsupported VAE Precision"
                      @click="
                        updatePayload(
                          'Reset unsupported VAE precision',
                          (draft) => delete draft.payload.vaePrecision,
                        )
                      "
                    />
                  </div>
                  <NText v-if="animaModel" depth="3">
                    Manual VAE precision is not supported by Anima.
                  </NText>
                </div>
                <div class="advanced-field">
                  <div class="advanced-control-row">
                    <label>
                      CFG Rescale
                      <NInputNumber
                        aria-label="CFG Rescale"
                        :disabled="animaModel"
                        :max="0.99"
                        :min="0"
                        :precision="2"
                        size="small"
                        :step="0.05"
                        :value="payload.cfgRescale ?? (animaModel ? null : 0)"
                        @update:value="
                          updatePayload('Change CFG Rescale', (draft) => {
                            draft.payload.cfgRescale = $event ?? 0
                          })
                        "
                      />
                    </label>
                    <IconButton
                      v-if="animaModel && payload.cfgRescale !== undefined"
                      compact
                      :icon="RotateClockwise"
                      label="Reset unsupported CFG Rescale"
                      @click="
                        updatePayload(
                          'Reset unsupported CFG Rescale',
                          (draft) => delete draft.payload.cfgRescale,
                        )
                      "
                    />
                  </div>
                  <NText v-if="animaModel" depth="3">CFG Rescale is not supported by Anima.</NText>
                </div>
              </div>
            </details>
          </div>
        </NCard>
      </div>
    </NScrollbar>

    <DynamicPromptsModal
      v-model:show="dynamicPreviewOpen"
      :negativePrompt="serializeGenerationPrompt(payload.negativePrompt)"
      :prompt="serializeGenerationPrompt(payload.prompt)"
      :settings="activeDraft.dynamicPrompt"
      @updateSettings="updateDynamicSettings"
    />
  </aside>
</template>

<style scoped>
.generation-target {
  grid-column: 1 / -1;
  font-size: 12px;
}
.model-summary {
  display: grid;
  gap: 5px;
  padding: 8px 9px;
  border-bottom: 1px solid var(--app-border);
}
.settings-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
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
.seed-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: end;
  gap: 6px;
}
.seed-value,
.seed-random {
  display: grid;
  min-width: 0;
  gap: 3px;
  color: var(--app-text-muted);
  font-size: 11px;
}
.seed-random {
  justify-items: center;
}
.seed-shuffle {
  margin-bottom: 1px;
}
.seed-reuse {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.advanced {
  margin-top: 6px;
}
.advanced-field {
  display: grid;
  gap: 3px;
}
.advanced-control-row {
  display: flex;
  align-items: end;
  gap: 6px;
  min-width: 0;
}
.advanced-control-row > label {
  flex: 1;
  min-width: 0;
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
