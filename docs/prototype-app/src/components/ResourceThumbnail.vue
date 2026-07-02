<template>
  <div class="resource-thumbnail" :class="toneClass" aria-hidden="true">
    <span class="thumbnail-shine" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  tone: 'green' | 'blue' | 'violet' | 'warning';
}>();

const toneClass = computed(() => `resource-thumbnail--${props.tone}`);
</script>

<style scoped>
.resource-thumbnail {
  position: relative;
  flex: 0 0 auto;
  width: 54px;
  height: 54px;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background:
    linear-gradient(135deg, transparent 48%, #ffffff22 49%, #ffffff22 51%, transparent 52%),
    linear-gradient(135deg, #123 0%, #345 100%);
}

.resource-thumbnail--green {
  background:
    linear-gradient(135deg, transparent 48%, #ffffff26 49%, #ffffff26 51%, transparent 52%),
    linear-gradient(135deg, #103315 0%, #22d15b 100%);
}

.resource-thumbnail--blue {
  background:
    linear-gradient(135deg, transparent 48%, #ffffff26 49%, #ffffff26 51%, transparent 52%),
    linear-gradient(135deg, #142b4a 0%, #70c0e8 100%);
}

.resource-thumbnail--violet {
  background:
    linear-gradient(135deg, transparent 48%, #ffffff26 49%, #ffffff26 51%, transparent 52%),
    linear-gradient(135deg, #2c1c47 0%, #b68cff 100%);
}

.resource-thumbnail--warning {
  background:
    linear-gradient(135deg, transparent 48%, #ffffff26 49%, #ffffff26 51%, transparent 52%),
    linear-gradient(135deg, #3b2b12 0%, #f2c97d 100%);
}

.thumbnail-shine {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #ffffff35 0%, transparent 42%);
}
</style>
