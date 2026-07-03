<template>
  <nav class="document-tabs" aria-label="Open documents">
    <NButton text class="document-tab">
      <NIcon :component="HomeIcon" />
      <span class="tab-title">Home</span>
      <NIcon class="tab-close" :component="XIcon" />
    </NButton>
    <NButton text class="document-tab document-tab--active">
      <span class="workspace-marker workspace-marker--green" />
      <span class="tab-title">Sample Project B.igs</span>
      <span class="dirty-dot" aria-label="Unsaved changes" />
      <NIcon class="tab-close" :component="XIcon" />
    </NButton>
    <NButton text class="document-tab">
      <span class="workspace-marker workspace-marker--blue" />
      <span class="tab-title">Sample Project A.igs</span>
      <NIcon class="tab-close" :component="XIcon" />
    </NButton>
  </nav>
</template>

<script setup lang="ts">
import { Home as HomeIcon, X as XIcon } from '@vicons/tabler';
import { NButton, NIcon } from 'naive-ui';
</script>

<style scoped>
.document-tabs {
  display: flex;
  align-items: end;
  min-width: 0;
  height: 40px;
  padding: 5px 12px 0;
  background: var(--app-chrome);
  border-bottom: 1px solid var(--app-border);
  user-select: none;
}

.document-tab {
  --n-text-color-hover: #dbdbdc;
  --n-text-color-pressed: #dbdbdc;
  --n-padding: 0 12px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;
  max-width: 260px;
  height: 35px;
  padding: 0 12px;
  background: #18181c;
  border: 1px solid var(--app-border);
  border-bottom: 0;
  border-radius: var(--app-radius) var(--app-radius) 0 0;
  cursor: pointer;
  font: inherit;
}

.document-tab :deep(.n-button__content) {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.document-tab + .document-tab {
  margin-left: 2px;
}

.document-tab--active {
  background: #232327;
}

.workspace-marker,
.dirty-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

.workspace-marker--green {
  background: #64e36e;
}

.workspace-marker--blue {
  background: #74a8ff;
}

.dirty-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #f2c97d;
}

.tab-title {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-close {
  flex: 0 0 auto;
  margin-left: auto;
  color: #6f6f73;
}
</style>
