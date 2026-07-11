<script setup lang="ts">
import { InfoCircle as InfoIcon, Plus as PlusIcon, X as XIcon } from '@vicons/tabler'
import { NButton, NIcon, NTooltip } from 'naive-ui'

defineEmits<{
  close: []
  create: []
}>()
</script>

<template>
  <header class="manager-header">
    <div class="title-line">
      <h1>Preset Manager</h1>
      <NTooltip trigger="hover">
        <template v-slot:trigger>
          <NButton aria-label="About Preset Manager" circle quaternary size="tiny">
            <template v-slot:icon>
              <NIcon :component="InfoIcon" />
            </template>
          </NButton>
        </template>
        Browse, create, and edit generation presets.
      </NTooltip>
    </div>
    <div class="header-actions">
      <NButton secondary size="small" @click="$emit('create')">
        <template v-slot:icon><NIcon :component="PlusIcon" /></template>
        New Preset
      </NButton>
      <NButton
        aria-label="Close Preset Manager"
        circle
        quaternary
        size="small"
        title="Close Preset Manager"
        @click="$emit('close')"
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}
</style>
