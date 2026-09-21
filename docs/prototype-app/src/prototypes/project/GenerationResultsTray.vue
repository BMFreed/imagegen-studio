<script setup lang="ts">
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  DotsVertical,
  Eye,
  EyeOff,
  Trash,
} from '@vicons/tabler'
import { NButton, NDropdown, NIcon, NTooltip } from 'naive-ui'
import { computed, nextTick, ref, watch } from 'vue'

import type { ProjectSession } from './project.types'

import GenerationCandidateCard from './GenerationCandidateCard.vue'

const props = defineProps<{ session: ProjectSession }>()
const emit = defineEmits<{ accept: []; discard: []; resize: [height: number] }>()
const tray = ref<HTMLElement>()
const strip = ref<HTMLElement>()
const staging = computed(() => props.session.staging)
const completed = computed(
  () => staging.value?.candidates.filter((item) => item.status === 'completed') ?? [],
)
const selectedCount = computed(() => staging.value?.selectedCandidateIds.length ?? 0)
const hasUnfinished = computed(() =>
  staging.value?.candidates.some((item) => item.status === 'pending' || item.status === 'running'),
)
const label = computed(() => {
  const variants = staging.value?.target.kind === 'smart-patch'
  return `Add ${selectedCount.value} as ${variants ? (selectedCount.value === 1 ? 'Variant' : 'Variants') : selectedCount.value === 1 ? 'Layer' : 'Layers'}`
})
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
  () => staging.value?.focusedCandidateId,
  async () => {
    await nextTick()
    const candidate = strip.value?.querySelector<HTMLElement>('.candidate--focused')
    const container = strip.value
    if (candidate && container) {
      const bounds = candidate.getBoundingClientRect()
      const viewport = container.getBoundingClientRect()
      if (bounds.left < viewport.left) {
        container.scrollLeft -= viewport.left - bounds.left + 3
      }
      if (bounds.right > viewport.right) {
        container.scrollLeft += bounds.right - viewport.right + 3
      }
    }
  },
)
function setSelected(id: string, selected: boolean) {
  const value = staging.value
  if (!value) {
    return
  }
  value.selectedCandidateIds = selected
    ? [...new Set([...value.selectedCandidateIds, id])]
    : value.selectedCandidateIds.filter((item) => item !== id)
}
function previewStep(delta: number) {
  const value = staging.value
  if (!value || !completed.value.length) {
    return
  }
  const index = completed.value.findIndex((c) => c.id === value.focusedCandidateId)
  value.focusedCandidateId =
    completed.value[(index + delta + completed.value.length) % completed.value.length]?.id
  value.previewVisible = true
}
function selectAll() {
  if (staging.value) {
    staging.value.selectedCandidateIds = completed.value.map((item) => item.id)
  }
}
</script>

<template>
  <section
    v-if="staging"
    ref="tray"
    aria-label="Generation Results"
    class="results-tray"
    :class="{ 'results-tray--collapsed': staging.collapsed }"
    @pointerdown.stop
    @wheel.stop
  >
    <div v-if="!staging.collapsed" ref="strip" class="candidate-strip">
      <GenerationCandidateCard
        v-for="candidate of staging.candidates"
        :key="candidate.id"
        :candidate
        :focused="candidate.id === staging.focusedCandidateId"
        :selected="staging.selectedCandidateIds.includes(candidate.id)"
        @focus="staging.focusedCandidateId = candidate.id"
        @select="setSelected(candidate.id, $event)"
      />
    </div>
    <div aria-label="Temporary generation results" class="staging-toolbar" role="toolbar">
      <div class="preview-navigation">
        <NButton
          aria-label="Previous result preview"
          :disabled="completed.length < 2"
          quaternary
          size="small"
          @click="previewStep(-1)"
        >
          <NIcon :component="ChevronLeft" />
        </NButton>
        <span
          class="preview-count"
          :title="`${completed.length} completed of ${staging.candidates.length}${hasUnfinished ? ' · generation running' : ''}`"
        >
          {{ staging.candidates.findIndex((c) => c.id === staging?.focusedCandidateId) + 1 }} /
          {{ staging.candidates.length }}
          <i v-if="hasUnfinished" aria-label="Generation running" />
        </span>
        <NButton
          aria-label="Next result preview"
          :disabled="completed.length < 2"
          quaternary
          size="small"
          @click="previewStep(1)"
        >
          <NIcon :component="ChevronRight" />
        </NButton>
      </div>
      <NTooltip>
        <template v-slot:trigger>
          <NButton
            :disabled="selectedCount === 0"
            size="small"
            type="primary"
            @click="emit('accept')"
          >
            {{ label }}
          </NButton>
        </template>
        Add checked results to the project. Previewing an image does not select it.
      </NTooltip>
      <NTooltip>
        <template v-slot:trigger>
          <NButton
            :aria-label="
              staging.previewVisible ? 'Hide candidate preview' : 'Show candidate preview'
            "
            quaternary
            size="small"
            @click="staging.previewVisible = !staging.previewVisible"
          >
            <NIcon :component="staging.previewVisible ? Eye : EyeOff" />
          </NButton>
        </template>
        {{ staging.previewVisible ? 'Show project canvas' : 'Show result preview' }}
      </NTooltip>
      <NDropdown
        :options="[
          { key: 'all', label: 'Select all completed' },
          { key: 'none', label: 'Clear selection' },
        ]"
        trigger="click"
        @select="$event === 'all' ? selectAll() : (staging.selectedCandidateIds = [])"
      >
        <NButton aria-label="Result selection actions" quaternary size="small">
          <NIcon :component="DotsVertical" />
        </NButton>
      </NDropdown>
      <NTooltip>
        <template v-slot:trigger>
          <NButton
            aria-label="Discard all candidates"
            quaternary
            size="small"
            @click="emit('discard')"
          >
            <NIcon :component="Trash" />
          </NButton>
        </template>
        Discard temporary results
      </NTooltip>
      <NButton
        :aria-label="
          staging.collapsed ? 'Expand Generation Results' : 'Collapse Generation Results'
        "
        quaternary
        size="small"
        @click="staging.collapsed = !staging.collapsed"
      >
        <NIcon :component="staging.collapsed ? ChevronUp : ChevronDown" />
      </NButton>
    </div>
    <span v-if="staging.candidates.some((c) => c.error)" class="result-error">
      {{ staging.candidates.find((c) => c.error)?.error }}
    </span>
  </section>
</template>

<style scoped>
.results-tray {
  position: absolute;
  bottom: 12px;
  left: 50%;
  z-index: var(--z-floating-control);
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: max-content;
  max-width: calc(100% - 24px);
}
.candidate-strip {
  display: flex;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  padding: 3px;
}
.staging-toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  max-width: 100%;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-elevated);
  white-space: nowrap;
}
.preview-navigation {
  display: flex;
  align-items: center;
}
.preview-count {
  display: flex;
  gap: 5px;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  color: var(--app-text);
  font-variant-numeric: tabular-nums;
  font-size: 12px;
}
.preview-count i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--workspace-green);
}
.result-error {
  max-width: 100%;
  color: var(--app-window-close);
  background: var(--app-surface);
  padding: 3px 8px;
  font-size: 12px;
}
</style>
