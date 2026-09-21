<script setup lang="ts">
import { ChevronDown, ChevronUp, Eye, EyeOff, Trash } from '@vicons/tabler'
import { NButton, NIcon, NText } from 'naive-ui'
import { computed } from 'vue'

import type { ProjectSession } from './project.types'

import GenerationCandidateCard from './GenerationCandidateCard.vue'

const props = defineProps<{ session: ProjectSession }>()
const emit = defineEmits<{ accept: []; discard: [] }>()
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
    aria-label="Generation Results"
    class="results-tray"
    :class="{ 'results-tray--collapsed': staging.collapsed }"
  >
    <header class="tray-header">
      <div>
        <strong>Generation Results</strong>
        <NText depth="3">
          {{ selectedCount }} selected
          <span v-if="hasUnfinished">· generation running</span>
        </NText>
      </div>
      <div class="tray-actions">
        <NButton size="tiny" tertiary @click="selectAll">Select all</NButton>
        <NButton size="tiny" tertiary @click="staging.selectedCandidateIds = []">
          Clear selection
        </NButton>
        <NButton
          :aria-label="staging.previewVisible ? 'Hide candidate preview' : 'Show candidate preview'"
          circle
          quaternary
          size="tiny"
          @click="staging.previewVisible = !staging.previewVisible"
        >
          <template v-slot:icon>
            <NIcon :component="staging.previewVisible ? Eye : EyeOff" />
          </template>
        </NButton>
        <NButton
          aria-label="Discard all candidates"
          circle
          quaternary
          size="tiny"
          @click="emit('discard')"
        >
          <template v-slot:icon><NIcon :component="Trash" /></template>
        </NButton>
        <NButton
          :aria-label="
            staging.collapsed ? 'Expand Generation Results' : 'Collapse Generation Results'
          "
          circle
          quaternary
          size="tiny"
          @click="staging.collapsed = !staging.collapsed"
        >
          <template v-slot:icon>
            <NIcon :component="staging.collapsed ? ChevronUp : ChevronDown" />
          </template>
        </NButton>
      </div>
    </header>
    <template v-if="!staging.collapsed">
      <div class="preview-navigation">
        <NButton
          aria-label="Previous result preview"
          :disabled="completed.length < 2"
          size="tiny"
          @click="previewStep(-1)"
        >
          ←
        </NButton>
        <span>
          Preview {{ completed.findIndex((c) => c.id === staging?.focusedCandidateId) + 1 }} /
          {{ completed.length }} completed
        </span>
        <NButton
          aria-label="Next result preview"
          :disabled="completed.length < 2"
          size="tiny"
          @click="previewStep(1)"
        >
          →
        </NButton>
      </div>
      <div class="candidate-strip">
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
      <footer class="tray-footer">
        <NText depth="3">Temporary candidates are not project layers until added.</NText>
        <NButton :disabled="selectedCount === 0" type="primary" @click="emit('accept')">
          {{ label }}
        </NButton>
      </footer>
    </template>
  </section>
</template>

<style scoped>
.preview-navigation {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  color: var(--app-text-muted);
}
.results-tray {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  min-height: 154px;
  max-height: 250px;
  background: color-mix(in srgb, var(--app-surface) 96%, black);
  border-top: 1px solid var(--app-border);
}
.results-tray--collapsed {
  min-height: 38px;
  max-height: 38px;
}
.tray-header,
.tray-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 10px;
}
.tray-header > div:first-child {
  display: grid;
  gap: 0;
}
.tray-actions {
  display: flex;
  align-items: center;
  gap: 3px;
}
.candidate-strip {
  display: flex;
  gap: 8px;
  min-width: 0;
  padding: 4px 10px 8px;
  overflow-x: auto;
}
.tray-footer {
  border-top: 1px solid var(--app-border);
}
</style>
