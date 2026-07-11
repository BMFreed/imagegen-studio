<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ height: number; width: number }>();
const ratio = computed(() => Math.max(0.05, Math.min(20, props.width / props.height)));
const frameStyle = computed(() =>
  ratio.value >= 1
    ? { height: `${52 / ratio.value}px`, width: '52px' }
    : { height: '40px', width: `${40 * ratio.value}px` },
);
</script>

<template>
  <div aria-label="Aspect ratio preview" class="aspect-preview">
    <span :style="frameStyle" />
  </div>
</template>

<style scoped>
.aspect-preview {
  display: grid;
  width: 66px;
  height: 54px;
  place-items: center;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-surface-soft);
}
.aspect-preview span {
  max-width: 52px;
  max-height: 40px;
  border: 1px solid color-mix(in srgb, var(--workspace-green) 65%, var(--app-border));
  background: color-mix(in srgb, var(--workspace-green) 10%, var(--app-elevated));
}
</style>
