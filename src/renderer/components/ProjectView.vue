<script setup lang="ts">
import type { ProjectTab } from '../../shared/api.js'
import type { IgsRectV1 } from '../../shared/projects/project-schema.js'
import { IGS_SAFETY_CEILINGS } from '../../shared/projects/project-schema.js'

import { DeviceFloppy as SaveIcon } from '@vicons/tabler'
import { NAlert, NButton, NFormItem, NIcon, NInputNumber } from 'naive-ui'
import { computed, reactive, watch } from 'vue'

const props = defineProps<{
  busy: boolean
  error: string | null
  pending: 'bbox' | 'save' | null
  reloadRequired: boolean
  saveNotice: string | null
  tab: ProjectTab
}>()

const emit = defineEmits<{
  applyBbox: [rect: IgsRectV1]
  save: []
}>()

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
</script>

<template>
  <section :aria-label="`Project ${tab.title}`" class="project-view">
    <header class="project-heading">
      <div class="project-identity">
        <h1>{{ tab.title }}</h1>
        <span class="document-state" :class="{ 'document-state--dirty': tab.dirty }">
          {{ tab.dirty ? 'Unsaved changes' : 'Saved' }}
        </span>
      </div>
      <NButton
        aria-label="Save Project"
        :disabled="reloadRequired || busy"
        :loading="pending === 'save'"
        type="primary"
        @click="emit('save')"
      >
        <template v-slot:icon><NIcon :component="SaveIcon" /></template>
        Save
      </NButton>
    </header>

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
      <div aria-label="Generation area preview" class="project-stage">
        <div class="generation-area">
          <span class="area-caption">Primary generation area</span>
          <strong>{{ tab.primaryBbox.width }} × {{ tab.primaryBbox.height }}</strong>
          <span class="area-coordinates">
            X {{ tab.primaryBbox.x }} · Y {{ tab.primaryBbox.y }}
          </span>
        </div>
      </div>

      <aside aria-label="Project settings" class="project-settings">
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
      </aside>
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

.project-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  min-height: 53px;
  padding: 0 18px 0 22px;
  border-bottom: 1px solid var(--app-border);
}

.project-identity {
  display: flex;
  align-items: baseline;
  gap: 12px;
  min-width: 0;
}

.project-identity h1 {
  overflow: hidden;
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  padding: 0 18px;
}

.project-notices:has(.n-alert) {
  padding-top: 12px;
}

.project-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 288px;
  flex: 1 1 auto;
  min-height: 0;
}

.project-stage {
  display: grid;
  place-items: center;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  background: var(--app-chrome);
}

.generation-area {
  display: grid;
  place-items: center;
  gap: 12px;
  width: min(52vw, 460px);
  min-width: 230px;
  min-height: 220px;
  padding: 24px;
  border: 1px solid var(--app-border);
  color: var(--app-text-muted);
  text-align: center;
}

.generation-area strong {
  color: var(--app-text);
  font-size: 24px;
  font-weight: 500;
}

.area-caption {
  align-self: start;
  font-size: var(--app-font-size-meta);
}

.area-coordinates {
  align-self: end;
  font-size: var(--app-font-size-meta);
}

.project-settings {
  min-width: 0;
  overflow: auto;
  padding: 20px 16px;
  border-left: 1px solid var(--app-border);
  background: var(--app-surface);
}

.project-settings h2 {
  margin: 0;
  font-size: 13px;
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
</style>
