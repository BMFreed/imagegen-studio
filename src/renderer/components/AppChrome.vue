<script setup lang="ts">
import { NButton } from 'naive-ui'

import logoUrl from '../../../docs/assets/brand/imagegen-studio-logo-horizontal-no-bg.svg'

defineProps<{
  homeOpen: boolean
}>()

defineEmits<{
  home: []
}>()
</script>

<template>
  <header class="app-chrome">
    <NButton aria-label="Open Home" class="brand-button" text @click="$emit('home')">
      <img alt="ImageGen Studio" class="brand-logo" :src="logoUrl" />
    </NButton>
    <span class="chrome-context">{{ homeOpen ? 'Projects' : 'No document' }}</span>
  </header>
</template>

<style scoped>
.app-chrome {
  display: flex;
  align-items: center;
  gap: 18px;
  height: var(--app-chrome-height);
  padding: 0 8px;
  border-bottom: 1px solid var(--app-elevated);
  background: var(--app-chrome);
  user-select: none;
  -webkit-app-region: drag;
}

.brand-button {
  flex: 0 0 auto;
  -webkit-app-region: no-drag;
}

.brand-logo {
  display: block;
  width: 70px;
  height: 24px;
  object-fit: contain;
}

.chrome-context {
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}
</style>
