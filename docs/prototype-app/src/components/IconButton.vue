<template>
  <NBadge v-if="badge" :value="badge" :offset="[-2, 2]" type="success">
    <NButton quaternary circle size="small" class="icon-button" :aria-label="label" :title="label">
      <template #icon>
        <NIcon :component="icon" />
      </template>
    </NButton>
  </NBadge>
  <NButton v-else quaternary circle size="small" class="icon-button" :aria-label="label" :title="label">
    <template #icon>
      <NIcon :component="icon" />
    </template>
  </NButton>
</template>

<script setup lang="ts">
import type { Component } from 'vue';
import { NBadge, NButton, NIcon } from 'naive-ui';

defineProps<{
  icon: Component;
  label: string;
  badge?: number | string;
}>();
</script>

<style scoped>
.icon-button {
}
</style>
