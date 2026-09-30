<script setup lang="ts">
import type { GenerationDenoisingProgress } from '../../shared/projects/generation-progress.js'

import { NProgress } from 'naive-ui'

defineProps<{ progress: GenerationDenoisingProgress }>()
</script>

<template>
  <div class="generation-progress" data-testid="generation-progress">
    <span>Denoising step {{ progress.step }} of {{ progress.totalSteps }}</span>
    <NProgress
      aria-label="Denoising progress"
      :height="4"
      :percentage="(progress.step / progress.totalSteps) * 100"
      :showIndicator="false"
      type="line"
    />
  </div>
</template>

<style scoped>
.generation-progress {
  display: grid;
  gap: 6px;
  min-width: 0;
  color: var(--app-text-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
</style>
