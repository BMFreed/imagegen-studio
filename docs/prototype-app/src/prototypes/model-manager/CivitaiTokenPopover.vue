<template>
  <NPopover trigger="click" placement="bottom-end" class="token-popover" :width="270">
    <template #trigger>
      <NButton secondary size="medium" class="token-trigger">
        <span class="status-dot" />
        <span class="token-label">CivitAI connected</span>
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
  min-width: 184px;
  justify-content: center;
}

.token-trigger :deep(.n-button__content) {
  display: flex;
  align-items: center;
  gap: 8px;
}

.token-label {
  white-space: nowrap;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #64e36e;
  box-shadow: 0 0 10px #64e36e;
}

.token-menu {
  display: grid;
  gap: 6px;
}

.token-menu p {
  margin: 0;
}

.menu-action {
  justify-content: flex-start;
}
</style>
