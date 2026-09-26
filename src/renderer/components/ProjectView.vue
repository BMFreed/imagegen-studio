<script setup lang="ts">
import type { ProjectApi, ProjectGenerationDraftChange, ProjectTab } from '../../shared/api.js'
import type { IgsRectV1 } from '../../shared/projects/project-schema.js'
import { IGS_SAFETY_CEILINGS } from '../../shared/projects/project-schema.js'

import { DeviceFloppy as SaveIcon } from '@vicons/tabler'
import { DnDProvider } from '@vue-dnd-kit/core'
import { NAlert, NButton, NFormItem, NIcon, NInputNumber, NSelect } from 'naive-ui'
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'

import PlainPromptEditor from './PlainPromptEditor.vue'
import { fitTargetBounds } from './project-canvas-geometry.js'
import ProjectCanvas from './ProjectCanvas.vue'
import ProjectLayerStack from './ProjectLayerStack.vue'

const props = defineProps<{
  busy: boolean
  draftPending: boolean
  error: string | null
  generationDraft: ProjectTab['generationDraft']
  pending: 'bbox' | 'import-image' | 'save' | null
  reloadRequired: boolean
  saveNotice: string | null
  tab: ProjectTab
}>()

const emit = defineEmits<{
  applyBbox: [rect: IgsRectV1]
  importImage: []
  moveLayer: [layerId: string, targetIndex: number]
  save: []
  updateDraft: [change: ProjectGenerationDraftChange]
  updateLayer: [layerId: string, change: Parameters<ProjectApi['updateRasterLayer']>[2]]
  validateDraft: [tabId: string, valid: boolean]
}>()

const seedOptions = [
  { label: 'Random', value: 'random' },
  { label: 'Fixed', value: 'fixed' },
  { label: 'Reuse last', value: 'reuse' },
]
const fixedSeedInput = ref<number | null>(null)
const rawFixedSeedInvalid = ref(false)
const fixedSeedInvalid = computed(
  () =>
    props.generationDraft.seed.policy === 'fixed' &&
    (rawFixedSeedInvalid.value ||
      fixedSeedInput.value === null ||
      !Number.isSafeInteger(fixedSeedInput.value) ||
      fixedSeedInput.value < 0 ||
      fixedSeedInput.value > 0xff_ff_ff_ff),
)
watch(fixedSeedInvalid, (invalid) => emit('validateDraft', props.tab.id, !invalid), {
  immediate: true,
})
onBeforeUnmount(() => emit('validateDraft', props.tab.id, true))
watch(
  () => props.generationDraft.seed,
  (seed) => {
    if (seed.policy === 'fixed') {
      fixedSeedInput.value = seed.value
    }
  },
  { immediate: true },
)

function updateSeedPolicy(policy: string) {
  if (props.busy || props.reloadRequired || policy === props.generationDraft.seed.policy) {
    return
  }
  if (policy === 'fixed') {
    const value = fixedSeedInput.value ?? props.tab.lastActualSeedSnapshot ?? 0
    fixedSeedInput.value = value
    emit('updateDraft', { kind: 'seed', policy: 'fixed', value })
  } else if (policy === 'random' || policy === 'reuse') {
    emit('updateDraft', { kind: 'seed', policy, value: null })
  }
}

function updateFixedSeed(value: number | null) {
  fixedSeedInput.value = value
  if (
    props.busy ||
    props.reloadRequired ||
    value === null ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 0xff_ff_ff_ff ||
    (props.generationDraft.seed.policy === 'fixed' && props.generationDraft.seed.value === value)
  ) {
    return
  }
  emit('updateDraft', { kind: 'seed', policy: 'fixed', value })
}

function captureFixedSeedInput(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) {
    return
  }
  const raw = event.target.value.trim()
  const value = /^\d+$/.test(raw) ? Number(raw) : null
  rawFixedSeedInvalid.value =
    value === null || !Number.isSafeInteger(value) || value > 0xff_ff_ff_ff
  if (rawFixedSeedInvalid.value) {
    fixedSeedInput.value = null
    return
  }
  updateFixedSeed(value)
}

function restoreInvalidFixedSeed() {
  if (fixedSeedInvalid.value) {
    const restored = props.generationDraft.seed.value ?? 0
    rawFixedSeedInvalid.value = false
    fixedSeedInput.value = restored
    void nextTick(() => {
      fixedSeedInput.value = restored
    })
  }
}

const selectedLayerId = ref<string | null>(null)
watch(
  () => [props.tab.id, props.tab.layers] as const,
  ([tabId, layers], previous) => {
    if (previous && previous[0] !== tabId) {
      selectedLayerId.value = null
      return
    }
    const previousLayers = previous?.[1] ?? []
    const previousIds = new Set(previousLayers.map((layer) => layer.id))
    const added = layers.filter((layer) => !previousIds.has(layer.id))
    if (previous && layers.length === previousLayers.length + 1 && added.length === 1) {
      selectedLayerId.value = added[0]?.id ?? null
      return
    }
    if (selectedLayerId.value && !layers.some((layer) => layer.id === selectedLayerId.value)) {
      selectedLayerId.value = null
    }
  },
)

const draft = reactive<{
  height: number | null
  width: number | null
  x: number | null
  y: number | null
}>({
  height: null,
  width: null,
  x: null,
  y: null,
})

watch(
  () => props.tab.primaryBbox,
  (bbox) => Object.assign(draft, bbox),
  { immediate: true },
)

const validBbox = computed(
  () =>
    draft.x !== null &&
    draft.y !== null &&
    draft.width !== null &&
    draft.height !== null &&
    Number.isSafeInteger(draft.x) &&
    Number.isSafeInteger(draft.y) &&
    Number.isSafeInteger(draft.width) &&
    Number.isSafeInteger(draft.height) &&
    Math.abs(draft.x) <= IGS_SAFETY_CEILINGS.coordinateMagnitude &&
    Math.abs(draft.y) <= IGS_SAFETY_CEILINGS.coordinateMagnitude &&
    draft.width >= 1 &&
    draft.height >= 1 &&
    draft.width <= IGS_SAFETY_CEILINGS.rasterDimension &&
    draft.height <= IGS_SAFETY_CEILINGS.rasterDimension,
)

const bboxChanged = computed(() =>
  (['x', 'y', 'width', 'height'] as const).some((key) => draft[key] !== props.tab.primaryBbox[key]),
)

function applyBbox() {
  if (!validBbox.value || !bboxChanged.value || props.busy || props.reloadRequired) {
    return
  }
  const { height, width, x, y } = draft
  if (x === null || y === null || width === null || height === null) {
    return
  }
  emit('applyBbox', { height, width, x, y })
}

const fitBbox = computed<IgsRectV1 | null>(() => {
  const selected = props.tab.layers.find(
    (layer) => layer.id === selectedLayerId.value && layer.visible && layer.opacity > 0,
  )
  const visible = selected
    ? [selected]
    : props.tab.layers.filter((layer) => layer.visible && layer.opacity > 0)
  if (visible.length === 0) {
    return null
  }
  const bounds = fitTargetBounds(visible, props.tab.primaryBbox)
  const x = Math.floor(bounds.left)
  const y = Math.floor(bounds.top)
  const rect = {
    height: Math.ceil(bounds.bottom) - y,
    width: Math.ceil(bounds.right) - x,
    x,
    y,
  }
  return Number.isSafeInteger(x) &&
    Number.isSafeInteger(y) &&
    Math.abs(x) <= IGS_SAFETY_CEILINGS.coordinateMagnitude &&
    Math.abs(y) <= IGS_SAFETY_CEILINGS.coordinateMagnitude &&
    rect.width >= 1 &&
    rect.height >= 1 &&
    rect.width <= IGS_SAFETY_CEILINGS.rasterDimension &&
    rect.height <= IGS_SAFETY_CEILINGS.rasterDimension
    ? rect
    : null
})

const canFitBbox = computed(
  () =>
    fitBbox.value !== null &&
    (['x', 'y', 'width', 'height'] as const).some(
      (key) => fitBbox.value?.[key] !== props.tab.primaryBbox[key],
    ),
)

function applyFitBbox() {
  if (fitBbox.value && canFitBbox.value && !props.busy && !props.reloadRequired) {
    emit('applyBbox', fitBbox.value)
  }
}
</script>

<template>
  <section :aria-label="`Project ${tab.title}`" class="project-view">
    <div class="project-notices">
      <NAlert v-if="error" title="Project action failed" type="error">{{ error }}</NAlert>
      <NAlert v-if="saveNotice" key="n-alert-2" title="Project saved with a warning" type="warning">
        {{ saveNotice }}
      </NAlert>
      <NAlert v-if="reloadRequired" key="n-alert-3" title="Reopen this project" type="warning">
        The saved file changed during verification. Close this tab and reopen it before editing.
      </NAlert>
      <NAlert
        v-if="tab.autosaveError"
        key="n-alert-4"
        title="Recovery copy could not be updated"
        type="warning"
      >
        Your changes are still open here. Save the project to keep them in the .igs file.
        {{ tab.autosaveError }}
      </NAlert>
    </div>

    <div class="project-layout">
      <aside aria-label="Project settings" class="project-settings">
        <div class="document-actions">
          <span
            class="document-state"
            :class="{ 'document-state--dirty': tab.dirty || draftPending }"
          >
            {{ tab.dirty || draftPending ? 'Unsaved changes' : 'Saved' }}
          </span>
          <NButton
            aria-label="Save Project"
            :disabled="reloadRequired || busy || fixedSeedInvalid"
            :loading="pending === 'save'"
            size="small"
            @click="emit('save')"
          >
            <template v-slot:icon><NIcon :component="SaveIcon" /></template>
            Save
          </NButton>
        </div>
        <section aria-label="Generation settings" class="settings-section">
          <h2>Generation</h2>
          <div class="prompt-field">
            <span class="field-label">Positive prompt</span>
            <PlainPromptEditor
              ariaLabel="Positive prompt"
              :disabled="busy || reloadRequired"
              :modelValue="generationDraft.positivePrompt.text"
              @update:modelValue="emit('updateDraft', { kind: 'positive-prompt', text: $event })"
            />
          </div>
          <div class="prompt-field">
            <span class="field-label">Negative prompt</span>
            <PlainPromptEditor
              ariaLabel="Negative prompt"
              :disabled="busy || reloadRequired"
              :modelValue="generationDraft.negativePrompt.text"
              @update:modelValue="emit('updateDraft', { kind: 'negative-prompt', text: $event })"
            />
          </div>
          <div class="seed-fields">
            <NFormItem label="Seed policy" :showFeedback="false">
              <NSelect
                aria-label="Seed policy"
                :disabled="busy || reloadRequired"
                :options="seedOptions"
                size="small"
                :value="generationDraft.seed.policy"
                @update:value="updateSeedPolicy"
              />
            </NFormItem>
            <NFormItem
              v-if="generationDraft.seed.policy === 'fixed'"
              label="Fixed seed"
              :showFeedback="false"
            >
              <div class="fixed-seed-input" @input.capture="captureFixedSeedInput">
                <NInputNumber
                  :disabled="busy || reloadRequired"
                  :inputProps="{ 'aria-label': 'Fixed seed' }"
                  :max="0xff_ff_ff_ff"
                  :min="0"
                  :precision="0"
                  :showButton="false"
                  size="small"
                  :value="fixedSeedInput"
                  @blur="restoreInvalidFixedSeed"
                  @update:value="updateFixedSeed"
                />
              </div>
            </NFormItem>
          </div>
          <p v-if="fixedSeedInvalid" class="seed-validation" role="alert">
            Enter a fixed seed from 0 to 4294967295 before saving.
          </p>
          <p
            v-if="generationDraft.seed.policy === 'reuse' && tab.lastActualSeedSnapshot === null"
            class="seed-diagnostic"
            role="status"
          >
            No completed generation has a seed to reuse. Generate will be unavailable until one
            completes.
          </p>
          <p v-else-if="generationDraft.seed.policy === 'reuse'" class="seed-diagnostic">
            Last saved seed: {{ tab.lastActualSeedSnapshot }}
          </p>
        </section>
        <section aria-label="Generation area" class="settings-section">
          <h2>Generation area</h2>
          <p>Set the position and size of the area used for the next image.</p>
          <div class="bbox-fields">
            <NFormItem label="X" :showFeedback="false">
              <NInputNumber
                v-model:value="draft.x"
                :inputProps="{ 'aria-label': 'Generation area X' }"
                :max="IGS_SAFETY_CEILINGS.coordinateMagnitude"
                :min="-IGS_SAFETY_CEILINGS.coordinateMagnitude"
                :showButton="false"
              />
            </NFormItem>
            <NFormItem label="Y" :showFeedback="false">
              <NInputNumber
                v-model:value="draft.y"
                :inputProps="{ 'aria-label': 'Generation area Y' }"
                :max="IGS_SAFETY_CEILINGS.coordinateMagnitude"
                :min="-IGS_SAFETY_CEILINGS.coordinateMagnitude"
                :showButton="false"
              />
            </NFormItem>
            <NFormItem label="Width" :showFeedback="false">
              <NInputNumber
                v-model:value="draft.width"
                :inputProps="{ 'aria-label': 'Generation area width' }"
                :max="IGS_SAFETY_CEILINGS.rasterDimension"
                :min="1"
                :showButton="false"
              />
            </NFormItem>
            <NFormItem label="Height" :showFeedback="false">
              <NInputNumber
                v-model:value="draft.height"
                :inputProps="{ 'aria-label': 'Generation area height' }"
                :max="IGS_SAFETY_CEILINGS.rasterDimension"
                :min="1"
                :showButton="false"
              />
            </NFormItem>
          </div>
          <NButton
            aria-label="Apply generation area"
            class="apply-bbox"
            :disabled="!validBbox || !bboxChanged || busy || reloadRequired"
            :loading="pending === 'bbox'"
            @click="applyBbox"
          >
            Apply
          </NButton>
          <NButton
            aria-label="Fit generation area to visible layers"
            class="fit-bbox"
            :disabled="!canFitBbox || busy || reloadRequired"
            secondary
            @click="applyFitBbox"
          >
            Fit to visible layers
          </NButton>
        </section>
      </aside>

      <ProjectCanvas
        :key="tab.id"
        :bbox="tab.primaryBbox"
        :disabled="busy || reloadRequired"
        :layers="tab.layers"
        :selectedLayerId
        @changeBbox="emit('applyBbox', $event)"
        @selectLayer="selectedLayerId = $event"
      />

      <DnDProvider :autoScrollViewport="false">
        <ProjectLayerStack
          v-model:selectedLayerId="selectedLayerId"
          :disabled="busy || reloadRequired"
          :importing="pending === 'import-image'"
          :layers="tab.layers"
          @importImage="emit('importImage')"
          @move="(layerId, targetIndex) => emit('moveLayer', layerId, targetIndex)"
          @update="(layerId, change) => emit('updateLayer', layerId, change)"
        />
      </DnDProvider>
    </div>
  </section>
</template>

<style scoped>
.project-view {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}

.document-state {
  flex: 0 0 auto;
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}

.document-state--dirty {
  color: var(--app-tab-active-text);
}

.project-notices {
  display: grid;
  gap: 8px;
  padding: 0 12px;
}

.project-notices:has(.n-alert) {
  padding-top: 8px;
  padding-bottom: 8px;
}

.project-layout {
  display: grid;
  grid-template-columns: 244px minmax(0, 1fr) minmax(280px, 22vw);
  flex: 1 1 auto;
  min-height: 0;
}

.project-settings {
  min-width: 0;
  overflow: auto;
  padding: 14px 12px;
  border-right: 1px solid var(--app-border);
  background: var(--app-surface);
}

.document-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 20px;
}

.project-settings h2 {
  margin: 0;
  font-size: 13px;
}

.settings-section + .settings-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--app-border);
}

.prompt-field {
  display: grid;
  gap: 5px;
  margin-top: 13px;
}

.field-label {
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}

.seed-fields {
  display: grid;
  gap: 9px;
  margin-top: 13px;
}

.seed-fields :deep(.n-select),
.seed-fields :deep(.n-input-number) {
  width: 100%;
}

.fixed-seed-input {
  width: 100%;
}

.project-settings .seed-diagnostic {
  margin: 8px 0 0;
}

.project-settings .seed-validation {
  margin: 8px 0 0;
}

.project-settings p {
  margin: 6px 0 18px;
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}

.bbox-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 8px;
}

.bbox-fields :deep(.n-input-number) {
  width: 100%;
}

.apply-bbox {
  width: 100%;
  margin-top: 18px;
}

.fit-bbox {
  width: 100%;
  margin-top: 8px;
}
</style>
