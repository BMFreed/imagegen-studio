<script setup lang="ts">
import {
  ChevronDown as ChevronDownIcon,
  Key as KeyIcon,
  Refresh as RefreshIcon,
  Trash as TrashIcon,
} from '@vicons/tabler';
import { NBadge, NButton, NDivider, NIcon, NPopover, useThemeVars } from 'naive-ui';

const themeVars = useThemeVars();
</script>

<template>
  <NPopover placement="bottom-end" trigger="click" :width="270">
    <template v-slot:trigger>
      <NButton class="token-trigger" secondary size="medium">
        <NBadge :color="themeVars.primaryColor" dot />
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
  flex: 0 0 auto;
  width: fit-content;
}

.token-trigger :deep(.n-button__content) {
  gap: 8px;
}

.token-label {
  white-space: nowrap;
}

.status-anchor {
  display: block;
  width: 8px;
  height: 8px;
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
