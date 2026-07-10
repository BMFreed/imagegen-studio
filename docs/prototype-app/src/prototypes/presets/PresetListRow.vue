<script setup lang="ts">
import {
  AlertTriangle as AlertIcon,
  Photo as ImageIcon,
  Bandage as SmartPatchIcon,
  Star as StarIcon,
  FileText as TextIcon,
} from '@vicons/tabler';
import { NIcon, NTag, useThemeVars } from 'naive-ui';
import { computed } from 'vue';

import type { PresetRecord, PresetWorkflow } from './presets.types';

import {
  includedSections,
  presetHasMissingResources,
  sectionLabels,
  workflowLabels,
} from './presets.utils';

const props = defineProps<{
  preset: PresetRecord;
  selected: boolean;
}>();

defineEmits<{
  select: [id: string];
}>();

const workflowIcons: Record<PresetWorkflow, typeof TextIcon> = {
  imageToImage: ImageIcon,
  smartPatch: SmartPatchIcon,
  textToImage: TextIcon,
};

const themeVars = useThemeVars();
const accentStyle = computed(() => ({ '--preset-accent': themeVars.value.primaryColor }));
const sections = computed(() => includedSections(props.preset.payload));
const hasMissingResources = computed(() => presetHasMissingResources(props.preset));
</script>

<template>
  <article class="preset-row" :class="{ 'preset-row--selected': selected }" :style="accentStyle">
    <button
      :aria-label="`Select ${preset.name}`"
      :aria-pressed="selected"
      class="preset-select"
      type="button"
      @click="$emit('select', preset.id)"
    >
      <span class="workflow-icon">
        <NIcon :component="workflowIcons[preset.workflow]" size="22" />
      </span>
      <span class="preset-main">
        <span class="preset-title-line">
          <strong v-overflow-title>{{ preset.name }}</strong>
          <NTag :bordered="false" size="small">{{ workflowLabels[preset.workflow] }}</NTag>
          <NTag v-if="hasMissingResources" size="small" type="warning">
            <template v-slot:icon><NIcon :component="AlertIcon" /></template>
            Missing resource
          </NTag>
        </span>
        <span v-overflow-title class="preset-description">{{ preset.description }}</span>
        <span class="section-tags">
          <NTag v-for="section of sections" :key="section" :bordered="false" size="small">
            {{ sectionLabels[section] }}
          </NTag>
        </span>
      </span>
      <NIcon
        v-if="preset.favorite"
        aria-label="Favorite"
        class="favorite-icon"
        :component="StarIcon"
        size="18"
      />
    </button>
  </article>
</template>

<style scoped>
.preset-row {
  --preset-accent: transparent;

  position: relative;
  min-width: 0;
  border: 1px solid transparent;
  border-radius: var(--app-radius);
  background: var(--app-elevated);
}

.preset-row:hover:not(.preset-row--selected),
.preset-row--selected {
  border-color: var(--app-border);
  background: var(--app-elevated-hover);
}

.preset-row--selected::before {
  position: absolute;
  inset-block: 8px;
  left: 0;
  width: 2px;
  border-radius: 999px;
  background: var(--preset-accent);
  content: '';
}

.preset-row:has(.preset-select:focus-visible) {
  border-color: var(--preset-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--preset-accent) 25%, transparent);
}

.preset-select {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.preset-select:focus-visible {
  outline: 0;
}

.workflow-icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
}

.preset-main {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.preset-title-line,
.section-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.preset-title-line strong,
.preset-description {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preset-title-line strong {
  min-width: 0;
  font-size: 13px;
}

.preset-description {
  font-size: 12px;
}

.section-tags {
  overflow: hidden;
}

.section-tags .n-tag {
  flex: 0 0 auto;
}

.favorite-icon {
  color: var(--status-warning);
}
</style>
