<script setup lang="ts">
import type { Component } from 'vue';

import { NBadge, NButton, NIcon } from 'naive-ui';

defineProps<{
  badge?: number | string;
  icon: Component;
  label: string;
}>();

defineEmits<{ click: [] }>();
</script>

<template>
  <NBadge v-if="badge" :offset="[-2, 2]" type="success" :value="badge">
    <NButton
      :aria-label="label"
      circle
      quaternary
      size="small"
      :title="label"
      @click="$emit('click')"
    >
      <template v-slot:icon>
        <NIcon :component="icon" />
      </template>
    </NButton>
  </NBadge>
  <NButton
    v-else
    :aria-label="label"
    circle
    quaternary
    size="small"
    :title="label"
    @click="$emit('click')"
  >
    <template v-slot:icon>
      <NIcon :component="icon" />
    </template>
  </NButton>
</template>
