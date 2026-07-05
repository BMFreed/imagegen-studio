<template>
  <NTag :type="tagType" size="small" round :bordered="bordered" class="status-badge" :class="`status-badge--${status}`">{{ label }}</NTag>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { NTag } from 'naive-ui';
import type { ModelResourceStatus } from '../prototypes/model-manager/model-manager.types';

const props = defineProps<{
  status: ModelResourceStatus;
  variant?: 'default' | 'neutral';
}>();

const label = computed(() => {
  switch (props.status) {
    case 'installed':
      return 'Installed';
    case 'downloading':
      return 'Downloading';
    case 'missing':
      return 'File missing';
    case 'checking':
      return 'Checking';
    case 'needsAttention':
      return 'Needs attention';
    default:
      return 'Unknown';
  }
});

const tagType = computed(() => {
  if (props.variant === 'neutral') {
    return 'default';
  }

  switch (props.status) {
    case 'installed':
      return 'success';
    case 'downloading':
      return 'info';
    case 'missing':
    case 'needsAttention':
      return 'warning';
    default:
      return 'default';
  }
});

const bordered = computed(() => props.variant !== 'neutral');
</script>
