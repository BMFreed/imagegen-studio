<script setup lang="ts">
import { Edit as DraftIcon } from '@vicons/tabler'
import { NButton, NIcon, NTag, useThemeVars } from 'naive-ui'
import { computed } from 'vue'

import type { PresetDefinition } from './presets.types'

import { includedSections, sectionLabels, workflowLabels } from './presets.utils'

const props = defineProps<{
  draft: PresetDefinition
  selected: boolean
}>()

defineEmits<{
  select: []
}>()

const themeVars = useThemeVars()
const accentStyle = computed(() => ({ '--preset-accent': themeVars.value.primaryColor }))
const sections = computed(() => includedSections(props.draft.payload))
</script>

<template>
  <article class="draft-row" :class="{ 'draft-row--selected': selected }" :style="accentStyle">
    <NButton
      aria-label="Select draft preset"
      :aria-pressed="selected"
      class="draft-select"
      text
      @click="$emit('select')"
    >
      <span class="draft-icon"><NIcon :component="DraftIcon" size="22" /></span>
      <span class="draft-main">
        <span class="draft-title-line">
          <strong>{{ draft.name.trim() || 'Untitled preset' }}</strong>
          <NTag :bordered="false" size="small" type="info">Draft</NTag>
          <NTag :bordered="false" size="small">{{ workflowLabels[draft.workflow] }}</NTag>
        </span>
        <span class="draft-description">
          {{ draft.description.trim() || 'Not saved to the preset catalog' }}
        </span>
        <span class="section-tags">
          <NTag v-for="section of sections" :key="section" :bordered="false" size="small">
            {{ sectionLabels[section] }}
          </NTag>
        </span>
      </span>
    </NButton>
  </article>
</template>

<style scoped>
.draft-row {
  --preset-accent: transparent;

  position: relative;
  border: 1px dashed var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-elevated);
}

.draft-row--selected {
  border-color: var(--preset-accent);
  background: var(--app-elevated-hover);
}

.draft-select {
  --n-padding: 10px 12px;
  width: 100%;
  height: auto;
  padding: 10px 12px;
  text-align: left;
}

.draft-select :deep(.n-button__content) {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
  line-height: 1.4;
  white-space: normal;
}

.draft-select:focus-visible {
  outline: 2px solid var(--preset-accent);
  outline-offset: -2px;
}

.draft-icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
}

.draft-main {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.draft-title-line,
.section-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}

.draft-title-line strong,
.draft-description {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.draft-title-line strong {
  font-size: 13px;
}

.draft-description {
  font-size: 12px;
}
</style>
