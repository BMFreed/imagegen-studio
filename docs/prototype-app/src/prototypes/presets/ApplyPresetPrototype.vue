<script setup lang="ts">
import { Wand as ApplyIcon, Settings as SettingsIcon, X as XIcon } from '@vicons/tabler';
import {
  NButton,
  NCard,
  NCheckbox,
  NIcon,
  NModal,
  NScrollbar,
  NTag,
  NText,
  useMessage,
} from 'naive-ui';
import { computed, ref } from 'vue';

import type { ApplyPresetSection } from './presets.types';

const message = useMessage();
const show = ref(true);
const sections = ref<ApplyPresetSection[]>([
  {
    key: 'prompt',
    name: 'Prompt',
    selected: true,
    status: 'replace',
    summary: 'cinematic shot, teal-orange grade, film grain, shallow depth of field',
  },
  {
    key: 'negative',
    name: 'Negative Prompt',
    selected: true,
    status: 'replace',
    summary: 'lowres, washed out, flat lighting',
  },
  {
    key: 'model',
    name: 'Model',
    selected: true,
    status: 'ready',
    summary: 'Illustrious XL · v1.1 · installed',
  },
  {
    key: 'lora-soft-detailer',
    missing: true,
    name: 'LoRA · Soft Detailer',
    selected: true,
    status: 'ready',
    summary: 'weight 0.6 · file not found in library',
  },
  {
    key: 'guidance',
    name: 'Steps & CFG',
    selected: true,
    status: 'replace',
    summary: '28 steps · CFG 4.5',
  },
  {
    key: 'sampling',
    name: 'Sampler & Scheduler',
    selected: true,
    status: 'replace',
    summary: 'DPM++ 2M · Karras',
  },
  {
    key: 'size',
    name: 'Size',
    selected: false,
    status: 'optional',
    summary: '1024 × 1024 · current project is 832 × 1216',
  },
]);

const selectedCount = computed(() => sections.value.filter((section) => section.selected).length);
const allSelected = computed(() => selectedCount.value === sections.value.length);
const partiallySelected = computed(
  () => selectedCount.value > 0 && selectedCount.value < sections.value.length,
);
const selectedMissingResource = computed(() =>
  sections.value.some((section) => section.selected && section.missing),
);
const applyDisabled = computed(() => selectedCount.value === 0 || selectedMissingResource.value);

function setAllSections(selected: boolean) {
  for (const section of sections.value) {
    section.selected = selected;
  }
}

function applyPreset() {
  if (applyDisabled.value) {
    return;
  }

  show.value = false;
  message.success('Preset applied');
}
</script>

<template>
  <NModal v-model:show="show" :maskClosable="false">
    <NCard
      aria-label="Apply Preset: Cinematic Img2Img Pass"
      class="apply-card"
      role="dialog"
      size="small"
    >
      <header class="dialog-header">
        <div>
          <h1>Apply Preset: Cinematic Img2Img Pass</h1>
          <NText depth="3">Choose what to copy into <strong>Sample Project B.igs</strong>.</NText>
        </div>
        <NButton aria-label="Close Apply Preset" circle quaternary @click="show = false">
          <template v-slot:icon><NIcon :component="XIcon" /></template>
        </NButton>
      </header>

      <NScrollbar class="dialog-scroll">
        <div class="dialog-content">
          <div class="preset-tags">
            <NTag type="info">Image to Image</NTag>
            <NTag :bordered="false">Favorite</NTag>
          </div>
          <p class="preset-description">
            Teal-orange grade, low-denoise film look. Best applied to a finished portrait composite.
          </p>

          <NCheckbox
            :checked="allSelected"
            :indeterminate="partiallySelected"
            @update:checked="setAllSections"
          >
            Select all sections
          </NCheckbox>

          <div class="section-list">
            <article
              v-for="section of sections"
              :key="section.key"
              class="apply-section"
              :class="{ 'apply-section--warning': section.missing }"
            >
              <NCheckbox v-model:checked="section.selected" :aria-label="section.name" />
              <div class="section-main">
                <strong>{{ section.name }}</strong>
                <NText depth="3">{{ section.summary }}</NText>
                <NText v-if="section.missing" class="missing-copy">
                  Missing resource. Install it or deselect this section before applying.
                </NText>
              </div>
              <NButton v-if="section.missing" size="small" tertiary type="warning">
                <template v-slot:icon><NIcon :component="SettingsIcon" /></template>
                Open in Models
              </NButton>
              <NTag v-else-if="section.status === 'ready'" size="small" type="success">
                Ready
              </NTag>
              <NText v-else depth="3">
                {{ section.status === 'replace' ? 'Replace' : 'Optional' }}
              </NText>
            </article>
          </div>
        </div>
      </NScrollbar>

      <footer class="dialog-actions">
        <NText v-if="selectedMissingResource" class="blocked-note">
          Resolve the missing LoRA, or deselect that section, to apply.
        </NText>
        <span v-else />
        <NButton tertiary @click="show = false">Cancel</NButton>
        <NButton :disabled="applyDisabled" type="primary" @click="applyPreset">
          <template v-slot:icon><NIcon :component="ApplyIcon" /></template>
          Apply
        </NButton>
      </footer>
    </NCard>
  </NModal>
</template>

<style scoped>
.apply-card {
  width: min(640px, calc(100vw - 48px));
  max-height: calc(100vh - 80px);
  overflow: hidden;
}

.apply-card :deep(.n-card__content) {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: 0;
}

.dialog-header,
.dialog-actions,
.preset-tags,
.apply-section {
  display: flex;
  align-items: center;
}

.dialog-header {
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 14px;
}

h1 {
  margin: 0 0 3px;
  font-size: 18px;
}

.dialog-scroll {
  min-height: 0;
}

.dialog-content {
  display: grid;
  gap: 14px;
  padding-right: 8px;
}

.preset-tags {
  gap: 6px;
}

.preset-description {
  margin: 0;
  padding: 12px;
  border-left: 2px solid var(--workspace-blue);
  background: var(--app-elevated);
}

.section-list {
  display: grid;
  gap: 8px;
}

.apply-section {
  gap: 12px;
  min-height: 66px;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
}

.apply-section--warning {
  border-color: color-mix(in srgb, var(--status-warning) 55%, var(--app-border));
}

.section-main {
  display: grid;
  flex: 1 1 auto;
  min-width: 0;
}

.section-main .n-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.missing-copy,
.blocked-note {
  color: var(--status-warning);
}

.section-main .missing-copy {
  white-space: normal;
}

.dialog-actions {
  justify-content: end;
  gap: 8px;
  padding-top: 14px;
}

.dialog-actions > :first-child {
  margin-right: auto;
}

.blocked-note {
  max-width: 320px;
  font-size: 12px;
}
</style>
