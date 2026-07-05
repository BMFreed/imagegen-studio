<script setup lang="ts">
import { NTag } from 'naive-ui';
import { computed } from 'vue';

import type { ModelResourceStatus } from '../prototypes/model-manager/model-manager.types';

const props = defineProps<{
  status: ModelResourceStatus;
  variant?: 'default' | 'neutral';
}>();

const label = computed(() => {
  switch (props.status) {
    case 'checking': {
      return 'Checking';
    }
    case 'downloading': {
      return 'Downloading';
    }
    case 'installed': {
      return 'Installed';
    }
    case 'missing': {
      return 'File missing';
    }
    case 'needsAttention': {
      return 'Needs attention';
    }
    default: {
      return 'Unknown';
    }
  }
});

const tagType = computed(() => {
  if (props.variant === 'neutral') {
    return 'default';
  }

  switch (props.status) {
    case 'downloading': {
      return 'info';
    }
    case 'installed': {
      return 'success';
    }
    case 'missing':
    case 'needsAttention': {
      return 'warning';
    }
    default: {
      return 'default';
    }
  }
});

const bordered = computed(() => props.variant !== 'neutral');
</script>

<template>
  <NTag
    :bordered
    class="status-badge"
    :class="`status-badge--${status}`"
    round
    size="small"
    :type="tagType"
    >{{ label }}</NTag
  >
</template>
