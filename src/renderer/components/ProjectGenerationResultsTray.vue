<script setup lang="ts">
import type { ProjectGenerationResultView } from '../../shared/api.js'

import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  DotsVertical,
  Eye,
  EyeOff,
  ListCheck,
  Refresh,
} from '@vicons/tabler'
import { NButton, NCheckbox, NDropdown, NIcon, NTag, NTooltip } from 'naive-ui'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  actionsDisabled: boolean
  candidates: ProjectGenerationResultView[]
  focusedCandidateId: string | null
  loading: boolean
  previewVisible: boolean
  selectedCandidateIds: string[]
}>()

const emit = defineEmits<{
  acceptCandidates: []
  clearSelection: []
  focus: [candidateId: string]
  refresh: []
  resize: [height: number]
  saveCandidateImage: [candidateId: string]
  selectAll: []
  selectCandidate: [candidateId: string, selected: boolean]
  togglePreview: []
}>()

const collapsed = ref(false)
const tray = ref<HTMLElement | null>(null)
const strip = ref<HTMLElement | null>(null)
const candidateActions = [{ key: 'save-image', label: 'Save Candidate Image' }]
const selectionActions = [
  { key: 'all', label: 'Select all completed' },
  { key: 'none', label: 'Clear selection' },
]
const selectedCount = computed(() => props.selectedCandidateIds.length)
const addLabel = computed(() =>
  selectedCount.value === 0
    ? 'Add as Layers'
    : `Add ${selectedCount.value} as ${selectedCount.value === 1 ? 'Layer' : 'Layers'}`,
)
const focusedIndex = computed(() =>
  props.candidates.findIndex((candidate) => candidate.candidateId === props.focusedCandidateId),
)
const hasSourceDocumentMismatch = computed(() =>
  props.candidates.some((candidate) => candidate.sourceDocumentMismatch),
)

function focusStep(delta: number) {
  if (props.candidates.length < 2) {
    return
  }
  const index = Math.max(focusedIndex.value, 0)
  const next = props.candidates[(index + delta + props.candidates.length) % props.candidates.length]
  if (next) {
    emit('focus', next.candidateId)
  }
}

watch(tray, (element, _previous, onCleanup) => {
  if (!element) {
    emit('resize', 0)
    return
  }
  const observer = new ResizeObserver(([entry]) => {
    if (entry) {
      emit('resize', Math.ceil(entry.contentRect.height))
    }
  })
  observer.observe(element)
  onCleanup(() => observer.disconnect())
})

watch(
  () => props.focusedCandidateId,
  () => {
    requestAnimationFrame(() => {
      const candidate = strip.value?.querySelector<HTMLElement>('.candidate--focused')
      const container = strip.value
      if (!candidate || !container) {
        return
      }
      const bounds = candidate.getBoundingClientRect()
      const viewport = container.getBoundingClientRect()
      if (bounds.left < viewport.left) {
        container.scrollLeft -= viewport.left - bounds.left + 3
      } else if (bounds.right > viewport.right) {
        container.scrollLeft += bounds.right - viewport.right + 3
      }
    })
  },
)
</script>

<template>
  <section
    ref="tray"
    aria-label="Generation Results"
    class="results-tray"
    @pointerdown.stop
    @wheel.stop
  >
    <div v-if="!collapsed" ref="strip" class="candidate-strip">
      <article
        v-for="(candidate, index) of candidates"
        :key="candidate.candidateId"
        class="candidate"
        :class="{ 'candidate--focused': candidate.candidateId === focusedCandidateId }"
      >
        <button
          :aria-label="`Preview candidate ${index + 1}`"
          :aria-pressed="candidate.candidateId === focusedCandidateId"
          class="candidate-button"
          type="button"
          @click="emit('focus', candidate.candidateId)"
        >
          <img alt="" :src="candidate.imageUrl" />
          <NTag
            v-if="candidate.sourceDocumentMismatch"
            class="candidate-mismatch"
            size="small"
            title="Created for a different Project document previously at this path"
            type="warning"
          >
            <NIcon :component="AlertTriangle" :size="12" />
          </NTag>
        </button>
        <div
          class="candidate-select"
          :title="
            candidate.sourceDocumentMismatch
              ? 'This result belongs to a different Project document and cannot be added here.'
              : 'Select this result to add it as a Raster Layer.'
          "
        >
          <NCheckbox
            :aria-label="`Select candidate ${index + 1}`"
            :checked="selectedCandidateIds.includes(candidate.candidateId)"
            :disabled="actionsDisabled || candidate.sourceDocumentMismatch"
            @update:checked="emit('selectCandidate', candidate.candidateId, $event)"
          />
        </div>
        <div class="candidate-footer">
          <NDropdown
            :menuProps="() => ({ role: 'menu', 'aria-label': `Result ${index + 1} actions` })"
            :nodeProps="() => ({ role: 'menuitem' })"
            :options="candidateActions"
            placement="top-start"
            size="small"
            trigger="click"
            @select="
              (key) => key === 'save-image' && emit('saveCandidateImage', candidate.candidateId)
            "
          >
            <NButton
              aria-haspopup="menu"
              :aria-label="`Result ${index + 1} actions`"
              circle
              class="candidate-actions"
              :disabled="actionsDisabled"
              quaternary
              size="tiny"
            >
              <template v-slot:icon><NIcon :component="DotsVertical" :size="16" /></template>
            </NButton>
          </NDropdown>
          <span>#{{ index + 1 }}</span>
        </div>
      </article>
    </div>

    <div aria-label="Temporary generation results" class="results-toolbar" role="toolbar">
      <span
        class="results-label"
        title="These images are temporary on this computer and not part of the Project. Save an individual image from its menu."
      >
        Temp results
      </span>
      <div class="results-navigation">
        <NButton
          aria-label="Previous result preview"
          :disabled="candidates.length < 2"
          quaternary
          size="small"
          @click="focusStep(-1)"
        >
          <NIcon :component="ChevronLeft" />
        </NButton>
        <span class="results-count">{{ focusedIndex + 1 }} / {{ candidates.length }}</span>
        <NButton
          aria-label="Next result preview"
          :disabled="candidates.length < 2"
          quaternary
          size="small"
          @click="focusStep(1)"
        >
          <NIcon :component="ChevronRight" />
        </NButton>
      </div>
      <NTooltip>
        <template v-slot:trigger>
          <span>
            <NButton
              :disabled="actionsDisabled || selectedCount === 0"
              size="small"
              type="primary"
              @click="emit('acceptCandidates')"
            >
              {{ addLabel }}
            </NButton>
          </span>
        </template>
        Add checked results to Project. Previewing an image does not select it.
      </NTooltip>
      <NTooltip>
        <template v-slot:trigger>
          <NButton
            :aria-label="previewVisible ? 'Hide candidate preview' : 'Show candidate preview'"
            quaternary
            size="small"
            @click="emit('togglePreview')"
          >
            <NIcon :component="previewVisible ? Eye : EyeOff" />
          </NButton>
        </template>
        {{ previewVisible ? 'Show project canvas' : 'Show result preview' }}
      </NTooltip>
      <NDropdown
        :menuProps="() => ({ role: 'menu', 'aria-label': 'Result selection actions' })"
        :nodeProps="() => ({ role: 'menuitem' })"
        :options="selectionActions"
        placement="top-start"
        size="small"
        trigger="click"
        @select="(key) => (key === 'all' ? emit('selectAll') : emit('clearSelection'))"
      >
        <NButton
          aria-haspopup="menu"
          aria-label="Result selection actions"
          :disabled="actionsDisabled"
          quaternary
          size="small"
        >
          <NIcon :component="ListCheck" />
        </NButton>
      </NDropdown>
      <NButton
        aria-label="Refresh results"
        :loading
        quaternary
        size="small"
        @click="emit('refresh')"
      >
        <NIcon :component="Refresh" />
      </NButton>
      <NButton
        :aria-label="collapsed ? 'Expand Generation Results' : 'Collapse Generation Results'"
        quaternary
        size="small"
        @click="collapsed = !collapsed"
      >
        <NIcon :component="collapsed ? ChevronUp : ChevronDown" />
      </NButton>
    </div>
    <p v-if="hasSourceDocumentMismatch" class="source-warning" role="status">
      <NTag size="small" type="warning">Different document</NTag>
      <span>
        One or more results were created for a different Project document previously at this path.
        You can preview or save their images, but cannot add them to this Project.
      </span>
    </p>
  </section>
</template>

<style scoped>
.results-tray {
  position: absolute;
  bottom: 12px;
  left: 50%;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  max-width: calc(100% - 24px);
  transform: translateX(-50%);
}

.candidate-strip {
  display: flex;
  gap: 6px;
  max-width: 100%;
  padding: 2px;
  overflow-x: auto;
  scrollbar-width: thin;
}

.candidate-select {
  position: absolute;
  top: 3px;
  left: 3px;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: var(--app-radius);
  background: var(--app-elevated);
}

.candidate {
  position: relative;
  flex: 0 0 72px;
  width: 72px;
  height: 72px;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-elevated);
}

.candidate--focused {
  outline: 2px solid var(--app-tab-active-text);
  outline-offset: 0;
}

.candidate-button {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  overflow: hidden;
  border: 0;
  color: var(--app-text);
  background: var(--app-chrome);
  cursor: pointer;
}

.candidate-button:focus-visible {
  outline: 2px solid var(--app-tab-active-text);
  outline-offset: -2px;
}

.candidate-button img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.candidate-footer {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1px 3px;
  color: var(--app-text);
  background: var(--app-elevated);
  font-size: var(--app-font-size-meta);
}

.candidate-actions {
  flex: 0 0 20px;
}

.candidate-mismatch {
  position: absolute;
  top: 3px;
  right: 3px;
  z-index: 1;
}

.results-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 2px;
  width: max-content;
  max-width: 100%;
  padding: 2px 4px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-elevated);
}

.results-label,
.results-count {
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
  white-space: nowrap;
}

.results-label {
  margin: 0 6px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.results-navigation {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
}

.results-count {
  min-width: 34px;
  text-align: center;
}

.source-warning {
  display: flex;
  align-items: center;
  gap: 5px;
  max-width: min(100%, 520px);
  margin: 0;
  padding: 4px 6px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  color: var(--app-text);
  background: var(--app-elevated);
  font-size: var(--app-font-size-meta);
}
</style>
