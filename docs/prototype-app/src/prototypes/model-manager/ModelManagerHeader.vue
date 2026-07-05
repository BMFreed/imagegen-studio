<script setup lang="ts">
import { Plus as PlusIcon, X as XIcon } from '@vicons/tabler';
import { NButton, NIcon } from 'naive-ui';

import CivitaiTokenPopover from './CivitaiTokenPopover.vue';

defineEmits<{
  openImport: [];
}>();
</script>

<template>
  <header class="manager-header">
    <div class="title-block">
      <h1>Model Manager</h1>
      <p>Install, inspect and repair the models used by your projects.</p>
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
  align-items: start;
  justify-content: space-between;
  gap: 24px;
  padding: 22px 24px 18px;
  border-bottom: 1px solid var(--app-border);
}

.title-block {
  min-width: 0;
}

h1 {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 700;
}

p {
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
