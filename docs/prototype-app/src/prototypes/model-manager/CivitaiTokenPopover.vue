<template>
  <NPopover trigger="click" placement="bottom-end" class="token-popover" :width="270">
    <template #trigger>
      <NButton secondary size="small" class="token-trigger">
        <span class="status-dot" />
        CivitAI connected
        <NIcon :component="ChevronDownIcon" />
      </NButton>
    </template>

    <div class="token-menu">
      <strong>CivitAI token</strong>
      <p>Connected and ready for downloads.</p>
      <NDivider />
      <NButton tertiary block size="small" class="menu-action">
        <template #icon>
          <NIcon :component="KeyIcon" />
        </template>
        Change token
      </NButton>
      <NButton tertiary block size="small" class="menu-action">
        <template #icon>
          <NIcon :component="RefreshIcon" />
        </template>
        Check connection
      </NButton>
      <NButton tertiary block size="small" type="error" class="menu-action">
        <template #icon>
          <NIcon :component="TrashIcon" />
        </template>
        Remove token
      </NButton>
    </div>
  </NPopover>
</template>

<script setup lang="ts">
import { ChevronDown as ChevronDownIcon, Key as KeyIcon, Refresh as RefreshIcon, Trash as TrashIcon } from '@vicons/tabler';
import { NButton, NDivider, NIcon, NPopover } from 'naive-ui';
</script>

<style scoped>
.token-trigger {
  min-width: 158px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--app-accent);
  box-shadow: 0 0 10px var(--app-accent);
}

.token-menu {
  display: grid;
  gap: 6px;
}

.token-menu p {
  margin: 0;
  color: var(--app-text-muted);
}

.menu-action {
  justify-content: flex-start;
}
</style>
