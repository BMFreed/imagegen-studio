<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  tone: 'blue' | 'green' | 'violet' | 'warning';
}>();

const toneClass = computed(() => `resource-thumbnail--${props.tone}`);
</script>

<template>
  <div aria-hidden="true" class="resource-thumbnail" :class="toneClass">
    <span class="thumbnail-shine" />
  </div>
</template>

<style scoped>
.resource-thumbnail {
  position: relative;
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background:
    linear-gradient(135deg, transparent 48%, #ffffff22 49%, #ffffff22 51%, transparent 52%),
    linear-gradient(135deg, #123 0%, #345 100%);
}

.resource-thumbnail--green {
  background:
    linear-gradient(135deg, transparent 48%, #ffffff1f 49%, #ffffff1f 51%, transparent 52%),
    linear-gradient(135deg, #17351e 0%, #26924a 100%);
}

.resource-thumbnail--blue {
  background:
    linear-gradient(135deg, transparent 48%, #ffffff1f 49%, #ffffff1f 51%, transparent 52%),
    linear-gradient(135deg, #18304b 0%, #5c99bd 100%);
}

.resource-thumbnail--violet {
  background:
    linear-gradient(135deg, transparent 48%, #ffffff1f 49%, #ffffff1f 51%, transparent 52%),
    linear-gradient(135deg, #2d2244 0%, #8e68c5 100%);
}

.resource-thumbnail--warning {
  background:
    linear-gradient(135deg, transparent 48%, #ffffff1f 49%, #ffffff1f 51%, transparent 52%),
    linear-gradient(135deg, #3a2d18 0%, #c79d55 100%);
}

.thumbnail-shine {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #ffffff26 0%, transparent 42%);
}
</style>
