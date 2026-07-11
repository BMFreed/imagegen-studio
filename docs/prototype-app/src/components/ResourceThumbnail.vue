<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  tone: 'blue' | 'green' | 'violet' | 'warning'
}>()

const toneClass = computed(() => `resource-thumbnail--${props.tone}`)
</script>

<template>
  <div aria-hidden="true" class="resource-thumbnail" :class="toneClass" />
</template>

<style scoped>
.resource-thumbnail {
  --thumbnail-end: transparent;
  --thumbnail-start: transparent;

  position: relative;
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background:
    linear-gradient(135deg, transparent 48%, #ffffff1f 49%, #ffffff1f 51%, transparent 52%),
    linear-gradient(135deg, var(--thumbnail-start) 0%, var(--thumbnail-end) 100%);
}

.resource-thumbnail--green {
  --thumbnail-end: #26924a;
  --thumbnail-start: #17351e;
}

.resource-thumbnail--blue {
  --thumbnail-end: #5c99bd;
  --thumbnail-start: #18304b;
}

.resource-thumbnail--violet {
  --thumbnail-end: #8e68c5;
  --thumbnail-start: #2d2244;
}

.resource-thumbnail--warning {
  --thumbnail-end: #c79d55;
  --thumbnail-start: #3a2d18;
}

.resource-thumbnail::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #ffffff26 0%, transparent 42%);
  content: '';
}
</style>
