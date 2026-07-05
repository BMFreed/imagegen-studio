<script setup lang="ts">
import {
  ChevronDown as ChevronDownIcon,
  Key as KeyIcon,
  Refresh as RefreshIcon,
  Trash as TrashIcon,
} from '@vicons/tabler';
import { NButton, NDivider, NIcon, NPopover } from 'naive-ui';
</script>

<template>
  <NPopover class="token-popover" placement="bottom-end" trigger="click" :width="270">
    <template v-slot:trigger>
      <NButton class="token-trigger" secondary size="medium">
        <span class="status-dot" />
        <span class="token-label">CivitAI connected</span>
        <NIcon :component="ChevronDownIcon" />
      </NButton>
    </template>

    <div class="token-menu">
      <strong>CivitAI token</strong>
      <p>Connected and ready for downloads.</p>
      <NDivider />
      <NButton block class="menu-action" size="small" tertiary>
        <template v-slot:icon>
          <NIcon :component="KeyIcon" />
        </template>
        Change token
      </NButton>
      <NButton block class="menu-action" size="small" tertiary>
        <template v-slot:icon>
          <NIcon :component="RefreshIcon" />
        </template>
        Check connection
      </NButton>
      <NButton block class="menu-action" size="small" tertiary type="error">
        <template v-slot:icon>
          <NIcon :component="TrashIcon" />
        </template>
        Remove token
      </NButton>
    </div>
  </NPopover>
</template>

<style scoped>
.token-trigger {
  min-width: 192px;
  justify-content: center;
}

.token-trigger :deep(.n-button__content) {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
}

.token-label {
  white-space: nowrap;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--workspace-green);
  box-shadow: 0 0 8px color-mix(in srgb, var(--workspace-green) 60%, transparent);
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
