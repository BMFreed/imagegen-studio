<script setup lang="ts">
import type { GenerationSettingsComparisonSection } from '../../shared/projects/generation-settings-comparison.js'

import { X } from '@vicons/tabler'
import { NAlert, NButton, NCheckbox, NIcon, NSpin } from 'naive-ui'
import { computed, nextTick, onMounted, ref } from 'vue'

const props = defineProps<{
  error: string | null
  layerName: string
  loading: boolean
  sections: GenerationSettingsComparisonSection[]
}>()
const emit = defineEmits<{ close: [] }>()
const showSame = ref(false)
const closeButton = ref<InstanceType<typeof NButton> | null>(null)
onMounted(() => {
  void nextTick(() => closeButton.value?.$el.focus({ preventScroll: true }))
})
const rows = computed(() => props.sections.flatMap((section) => section.rows))
const sameCount = computed(() => rows.value.filter((row) => row.status === 'Same').length)
const visibleSections = computed(() =>
  props.sections
    .map((section) => ({
      ...section,
      rows: section.rows.filter((row) => showSame.value || row.status !== 'Same'),
    }))
    .filter((section) => section.rows.length > 0),
)
</script>

<template>
  <section
    aria-label="Compare generation settings"
    class="comparison-panel"
    role="dialog"
    @keydown.esc.stop="emit('close')"
  >
    <header class="comparison-header">
      <div class="comparison-heading">
        <strong :title="layerName">{{ layerName }}</strong>
        <span>Generation settings · read only</span>
      </div>
      <NButton
        ref="closeButton"
        aria-label="Close generation settings comparison"
        quaternary
        size="tiny"
        @click="emit('close')"
      >
        <template v-slot:icon><NIcon :component="X" :size="16" /></template>
      </NButton>
    </header>
    <NAlert v-if="error" :showIcon="false" type="warning">{{ error }}</NAlert>
    <div v-if="loading && sections.length === 0" class="comparison-loading">
      <NSpin size="small" />
      <span>Reading generation data…</span>
    </div>
    <template v-else-if="sections.length > 0">
      <p class="comparison-summary">
        {{ rows.length - sameCount }} settings to review · {{ sameCount }} same
        <span v-if="loading">· Checking current generation mode…</span>
      </p>
      <div class="comparison-columns">
        <strong>Generated with</strong>
        <strong>Current Canvas</strong>
      </div>
      <div :aria-busy="loading" class="comparison-scroll">
        <section
          v-for="section of visibleSections"
          :key="section.key"
          :aria-label="section.label"
          class="comparison-section"
        >
          <h3>{{ section.label }}</h3>
          <article
            v-for="row of section.rows"
            :key="row.key"
            class="comparison-row"
            :data-setting="row.key"
            :data-status="row.status"
          >
            <header class="comparison-row-header">
              <strong>{{ row.label }}</strong>
              <span>{{ row.status }}</span>
            </header>
            <div class="comparison-values">
              <p>{{ row.before }}</p>
              <p>{{ row.after }}</p>
            </div>
          </article>
        </section>
      </div>
      <NCheckbox v-model:checked="showSame" class="comparison-same-toggle" size="small">
        Show unchanged settings
      </NCheckbox>
    </template>
    <p v-else-if="!error" class="comparison-empty">No generation data</p>
  </section>
</template>

<style scoped>
.comparison-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(640px, calc(100vw - 64px));
  max-height: min(640px, calc(100vh - 100px));
  min-height: 0;
}

.comparison-header,
.comparison-row-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.comparison-heading {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.comparison-heading strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comparison-heading span,
.comparison-summary,
.comparison-row-header span,
.comparison-empty,
.comparison-loading {
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}

.comparison-summary {
  margin: 0;
}

.comparison-columns,
.comparison-values {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 18px;
}

.comparison-columns {
  padding: 6px 0;
  border-bottom: 1px solid var(--app-border);
}

.comparison-scroll {
  min-height: 0;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--app-border) transparent;
}

.comparison-section h3 {
  margin: 12px 0 2px;
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
  font-weight: 600;
}

.comparison-section:first-child h3 {
  margin-top: 0;
}

.comparison-row {
  padding: 8px 0;
  border-bottom: 1px solid var(--app-border);
}

.comparison-row-header strong {
  font-size: var(--app-font-size);
  font-weight: 500;
}

.comparison-row-header span {
  flex: 0 0 auto;
}

.comparison-values p {
  margin: 5px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.comparison-same-toggle {
  flex: 0 0 auto;
}

.comparison-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 0;
}
</style>
