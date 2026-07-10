<script setup lang="ts">
import { InfoCircle as InfoIcon, Plus as PlusIcon, X as XIcon } from '@vicons/tabler';
import { NButton, NIcon, NTooltip } from 'naive-ui';

import CivitaiTokenPopover from './CivitaiTokenPopover.vue';

defineEmits<{
  openImport: [];
}>();
</script>

<template>
  <header class="manager-header">
    <div class="title-line">
      <h1>Model Manager</h1>
      <NTooltip trigger="hover">
        <template v-slot:trigger>
          <NButton aria-label="About Model Manager" circle quaternary size="tiny">
            <template v-slot:icon>
              <NIcon :component="InfoIcon" />
            </template>
          </NButton>
        </template>
        Install, inspect and repair the models used by your projects.
      </NTooltip>
    </div>
    <div class="header-actions">
      <CivitaiTokenPopover />
      <NButton size="medium" type="primary" @click="$emit('openImport')">
        <template v-slot:icon>
          <NIcon :component="PlusIcon" />
        </template>
        Add from CivitAI URL
      </NButton>
      <NButton
        aria-label="Close Model Manager"
        circle
        quaternary
        size="small"
        title="Close Model Manager"
      >
        <template v-slot:icon>
          <NIcon :component="XIcon" />
        </template>
      </NButton>
    </div>
  </header>
</template>

<style scoped>
.manager-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 12px 24px;
  border-bottom: 1px solid var(--app-border);
}

.title-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
