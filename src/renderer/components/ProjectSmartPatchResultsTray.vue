<script setup lang="ts">
import type {
  ProjectSmartPatchResultTarget,
  ProjectSmartPatchResultView,
} from '../../shared/api.js'

import { ChevronLeft, ChevronRight, Eye, EyeOff, Photo, Refresh, Trash } from '@vicons/tabler'
import { NButton, NCheckbox, NDropdown, NIcon, NSelect, NTag } from 'naive-ui'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  busy: boolean
  candidates: ProjectSmartPatchResultView[]
  focusedCandidateId: string | null
  loading: boolean
  previewVisible: boolean
  selectedIds: string[]
  target: ProjectSmartPatchResultTarget
}>()
const emit = defineEmits<{
  accept: []
  acceptRaster: [candidate: ProjectSmartPatchResultView]
  discard: []
  export: [candidate: ProjectSmartPatchResultView]
  focus: [candidateId: string]
  refresh: []
  resize: [height: number]
  select: [candidateId: string, selected: boolean]
  selectAll: [selected: boolean]
  togglePreview: []
}>()
const sessionId = ref<string>('all')
const tray = ref<HTMLElement | null>(null)
const strip = ref<HTMLElement | null>(null)
const failedThumbnails = ref(new Set<string>())
function thumbnail(candidate: ProjectSmartPatchResultView): string | null {
  return candidate.thumbnailUrl && !failedThumbnails.value.has(candidate.thumbnailUrl)
    ? candidate.thumbnailUrl
    : null
}
function thumbnailFailed(candidate: ProjectSmartPatchResultView) {
  if (candidate.thumbnailUrl) {
    failedThumbnails.value = new Set([...failedThumbnails.value, candidate.thumbnailUrl])
  }
}
watch(
  () => props.candidates,
  () => {
    failedThumbnails.value = new Set()
  },
)
const sessions = computed(() => [
  ...new Set(props.candidates.map((candidate) => candidate.stagingSessionId)),
])
const visibleCandidates = computed(() =>
  props.candidates.filter(
    (candidate) => sessionId.value === 'all' || candidate.stagingSessionId === sessionId.value,
  ),
)
const sessionOptions = computed(() => [
  { label: 'All sessions', value: 'all' },
  ...sessions.value.map((value, index) => ({ label: `Session ${index + 1}`, value })),
])
const focusedIndex = computed(() =>
  visibleCandidates.value.findIndex(({ candidateId }) => candidateId === props.focusedCandidateId),
)
const hiddenSelected = computed(
  () =>
    props.selectedIds.filter(
      (id) => !visibleCandidates.value.some(({ candidateId }) => candidateId === id),
    ).length,
)
const selectionDisabled = computed(() => props.busy || props.target.disposition !== 'available')
const focusedRasterUnavailableReason = computed(
  () =>
    props.candidates.find((candidate) => candidate.candidateId === props.focusedCandidateId)
      ?.rasterConversionUnavailableReason ?? null,
)
function rasterUnavailableReason(candidate: ProjectSmartPatchResultView): string | null {
  return (
    candidate.rasterConversionUnavailableReason ??
    (candidate.disposition === 'orphaned' && props.target.disposition === 'orphaned'
      ? null
      : 'Only a result whose original Smart Patch is missing can be added as a Raster Layer.')
  )
}
function menuOptions(candidate: ProjectSmartPatchResultView) {
  return [
    { key: 'export', label: 'Save Candidate Image' },
    {
      disabled: props.busy || rasterUnavailableReason(candidate) !== null,
      key: 'raster',
      label: 'Add as Raster Layer',
    },
  ]
}
function selectAction(key: number | string, candidate: ProjectSmartPatchResultView) {
  if (props.busy) {
    return
  }
  if (key === 'export') {
    emit('export', candidate)
  } else if (key === 'raster' && rasterUnavailableReason(candidate) === null) {
    emit('acceptRaster', candidate)
  }
}
function step(delta: number) {
  const values = visibleCandidates.value
  const next = values[(Math.max(0, focusedIndex.value) + delta + values.length) % values.length]
  if (next) {
    emit('focus', next.candidateId)
  }
}
watch([() => props.target.documentId, () => props.target.layerId], () => {
  sessionId.value = 'all'
})
watch(sessions, (values) => {
  if (sessionId.value !== 'all' && !values.includes(sessionId.value)) {
    sessionId.value = 'all'
  }
})
watch(visibleCandidates, (values) => {
  if (
    values.length &&
    !values.some(({ candidateId }) => candidateId === props.focusedCandidateId)
  ) {
    emit('focus', values[0]!.candidateId)
  }
})
watch(
  () => props.focusedCandidateId,
  () => {
    const candidate = props.candidates.find(
      ({ candidateId }) => candidateId === props.focusedCandidateId,
    )
    if (
      candidate &&
      !visibleCandidates.value.some(({ candidateId }) => candidateId === candidate.candidateId)
    ) {
      sessionId.value = candidate.stagingSessionId
    }
    void nextTick(() =>
      strip.value
        ?.querySelector<HTMLElement>('[aria-pressed="true"]')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' }),
    )
  },
)
let observer: ResizeObserver | null = null
onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    if (entry) {
      emit('resize', Math.ceil(entry.contentRect.height))
    }
  })
  if (tray.value) {
    observer.observe(tray.value)
  }
})
onBeforeUnmount(() => {
  observer?.disconnect()
  emit('resize', 0)
})
</script>

<template>
  <section
    ref="tray"
    aria-label="Smart Patch Generation Results"
    class="smart-results"
    @pointerdown.stop
    @wheel.stop
  >
    <div v-if="visibleCandidates.length" ref="strip" class="smart-candidate-strip">
      <article
        v-for="(candidate, index) of visibleCandidates"
        :key="candidate.candidateId"
        class="smart-candidate"
        :data-smart-candidate-id="candidate.candidateId"
      >
        <button
          :aria-label="`Preview Smart Patch candidate ${index + 1}`"
          :aria-pressed="candidate.candidateId === focusedCandidateId"
          class="smart-candidate-preview"
          type="button"
          @click="emit('focus', candidate.candidateId)"
        >
          <img
            v-if="thumbnail(candidate)"
            alt=""
            decoding="async"
            loading="lazy"
            :src="thumbnail(candidate) ?? undefined"
            @error="thumbnailFailed(candidate)"
          />
          <NIcon v-else :component="Photo" :size="24" />
          <span>#{{ index + 1 }}</span>
        </button>
        <div class="smart-candidate-actions">
          <NCheckbox
            :aria-label="`Select Smart Patch candidate ${index + 1}`"
            :checked="selectedIds.includes(candidate.candidateId)"
            :disabled="selectionDisabled"
            @update:checked="emit('select', candidate.candidateId, $event)"
          />
          <NDropdown
            :menuProps="() => ({ role: 'menu' })"
            :nodeProps="
              (option) => ({
                'aria-disabled': option.disabled ? 'true' : 'false',
                role: 'menuitem',
                title:
                  option.key === 'raster'
                    ? (rasterUnavailableReason(candidate) ?? undefined)
                    : undefined,
              })
            "
            :options="menuOptions(candidate)"
            placement="top-start"
            trigger="click"
            @select="(key) => selectAction(key, candidate)"
          >
            <NButton
              :aria-label="`Smart Patch result ${index + 1} actions`"
              :disabled="busy"
              quaternary
              size="tiny"
            >
              •••
            </NButton>
          </NDropdown>
        </div>
      </article>
    </div>
    <div aria-label="Temporary Smart Patch results" class="smart-results-toolbar" role="toolbar">
      <NTag :bordered="false" size="small">Temp variants</NTag>
      <NSelect
        v-if="sessions.length > 1"
        v-model:value="sessionId"
        aria-label="Smart Patch result session"
        class="smart-session-select"
        :options="sessionOptions"
        placement="top-start"
        size="small"
      />
      <NButton
        aria-label="Previous Smart Patch preview"
        :disabled="visibleCandidates.length < 2"
        quaternary
        size="small"
        @click="step(-1)"
      >
        <NIcon :component="ChevronLeft" />
      </NButton>
      <span>{{ Math.max(0, focusedIndex + 1) }} / {{ visibleCandidates.length }}</span>
      <NButton
        aria-label="Next Smart Patch preview"
        :disabled="visibleCandidates.length < 2"
        quaternary
        size="small"
        @click="step(1)"
      >
        <NIcon :component="ChevronRight" />
      </NButton>
      <NButton
        :disabled="selectionDisabled || selectedIds.length === 0"
        size="small"
        type="primary"
        @click="emit('accept')"
      >
        Add {{ selectedIds.length }} as {{ selectedIds.length === 1 ? 'Variant' : 'Variants' }}
      </NButton>
      <NButton
        :aria-label="previewVisible ? 'Hide Smart Patch preview' : 'Show Smart Patch preview'"
        quaternary
        size="small"
        @click="emit('togglePreview')"
      >
        <NIcon :component="previewVisible ? Eye : EyeOff" />
      </NButton>
      <NDropdown
        :options="[
          { key: 'all', label: 'Select all completed in this target' },
          { key: 'none', label: 'Clear selection in this target' },
        ]"
        placement="top-start"
        trigger="click"
        @select="(key) => emit('selectAll', key === 'all')"
      >
        <NButton
          aria-label="Smart Patch selection actions"
          :disabled="selectionDisabled"
          quaternary
          size="small"
        >
          Select
        </NButton>
      </NDropdown>
      <NButton
        aria-label="Refresh Smart Patch results"
        :loading
        quaternary
        size="small"
        @click="emit('refresh')"
      >
        <NIcon :component="Refresh" />
      </NButton>
      <NButton
        aria-label="Discard Smart Patch results"
        :disabled="busy || (!candidates.length && !target.unfinishedJobIds.length)"
        quaternary
        size="small"
        @click="emit('discard')"
      >
        <NIcon :component="Trash" />
      </NButton>
    </div>
    <p v-if="target.disposition !== 'available'" class="smart-result-notice" role="status">
      {{ target.disposition === 'orphaned' ? 'Orphaned result. ' : ''
      }}{{ target.unavailableReason ?? 'This target is unavailable for Add.' }}
      <template v-if="target.disposition === 'orphaned' && !focusedRasterUnavailableReason">
        Use a result's actions menu to Add as Raster Layer.
      </template>
      <template v-else>
        {{ focusedRasterUnavailableReason }} You can save candidate images or discard these results.
      </template>
    </p>
    <p v-else class="smart-result-notice">
      {{ target.layerName ?? 'Smart Patch' }} · Frozen outputs. Changed Patch inputs are retained
      when adding variants.
    </p>
    <p v-if="hiddenSelected" class="smart-result-notice">
      {{ hiddenSelected }} selected in other sessions of this Patch. Add includes them.
    </p>
  </section>
</template>

<style scoped>
.smart-results {
  position: absolute;
  bottom: 12px;
  left: 50%;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: max-content;
  max-width: calc(100% - 24px);
  transform: translateX(-50%);
}
.smart-candidate-strip {
  display: flex;
  gap: 6px;
  max-width: 100%;
  padding: 2px;
  overflow-x: auto;
  scrollbar-width: thin;
}
.smart-candidate {
  flex: 0 0 70px;
  padding: 4px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-surface);
}
.smart-candidate-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 100%;
  height: 70px;
  padding: 4px;
  border: 1px solid transparent;
  border-radius: var(--app-radius);
  color: var(--app-text-muted);
  background: var(--app-elevated);
  cursor: pointer;
}
.smart-candidate-preview img {
  width: 100%;
  height: 40px;
  object-fit: contain;
}
.smart-candidate-preview[aria-pressed='true'] {
  border-color: var(--app-tab-active-text);
  color: var(--app-text);
}
.smart-candidate-preview:focus-visible {
  outline: 1px solid var(--app-tab-active-text);
}
.smart-candidate-actions,
.smart-results-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.smart-candidate-actions {
  justify-content: space-between;
  margin-top: 3px;
}
.smart-results-toolbar {
  flex-wrap: wrap;
  padding: 5px 7px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-surface);
}
.smart-session-select {
  width: 115px;
}
.smart-result-notice {
  max-width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 4px 7px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  color: var(--app-text-muted);
  background: var(--app-surface);
  font-size: var(--app-font-size-meta);
  overflow-wrap: anywhere;
}
</style>
