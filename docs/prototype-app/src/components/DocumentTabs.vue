<template>
  <nav class="document-tabs" aria-label="Open documents">
    <button class="document-tab" type="button">
      <NIcon :component="HomeIcon" />
      <span>Home</span>
      <span class="tab-close">×</span>
    </button>
    <button class="document-tab document-tab--active" type="button">
      <span class="workspace-marker workspace-marker--green" />
      <span>Sample Project B.igs</span>
      <span class="dirty-dot" aria-label="Unsaved changes" />
      <span class="tab-close">×</span>
    </button>
    <button class="document-tab" type="button">
      <span class="workspace-marker workspace-marker--blue" />
      <span>Sample Project A.igs</span>
      <span class="tab-close">×</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { Home as HomeIcon } from '@vicons/tabler';
import { NIcon } from 'naive-ui';
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
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 260px;
  height: 35px;
  padding: 0 12px;
  color: var(--app-text-muted);
  background: var(--app-control);
  border: 1px solid var(--app-border);
  border-bottom: 0;
  border-radius: var(--app-radius) var(--app-radius) 0 0;
  font: inherit;
}

.document-tab + .document-tab {
  margin-left: 2px;
}

.document-tab--active {
  color: var(--app-text);
  background: var(--app-surface);
  box-shadow: inset 0 2px 0 var(--app-accent);
}

.workspace-marker,
.dirty-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

.workspace-marker--green {
  background: var(--app-accent);
}

.workspace-marker--blue {
  background: #74a8ff;
}

.dirty-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--app-warning);
}

.tab-close {
  margin-left: auto;
  color: var(--app-text-soft);
}
</style>
