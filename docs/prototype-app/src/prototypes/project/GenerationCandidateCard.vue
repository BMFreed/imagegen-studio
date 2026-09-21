<script setup lang="ts">
import { NCheckbox, NProgress, NTag } from 'naive-ui'

import type { GenerationCandidate } from './project.types'

import ProjectCanvasArtwork from './ProjectCanvasArtwork.vue'

defineProps<{ candidate: GenerationCandidate; focused: boolean; selected: boolean }>()
defineEmits<{ focus: []; select: [value: boolean] }>()
</script>

<template>
  <article class="candidate" :class="{ 'candidate--focused': focused }">
    <button
      :aria-label="`Preview candidate ${candidate.imageIndex}`"
      class="preview-button"
      :title="candidate.error ?? candidate.status"
      type="button"
      @click="$emit('focus')"
    >
      <ProjectCanvasArtwork :tone="candidate.tone" />
      <NTag
        v-if="candidate.status !== 'completed'"
        class="candidate-status"
        size="small"
        :type="candidate.status === 'failed' ? 'error' : 'default'"
      >
        {{ candidate.status }}
      </NTag>
    </button>
    <NProgress
      v-if="candidate.status === 'running'"
      :percentage="58"
      :showIndicator="false"
      type="line"
    />
    <div class="candidate-footer">
      <NCheckbox
        :aria-disabled="candidate.status !== 'completed'"
        :aria-label="`Select candidate ${candidate.imageIndex}`"
        :checked="selected"
        :disabled="candidate.status !== 'completed'"
        @update:checked="$emit('select', $event)"
      />
      <span>#{{ candidate.imageIndex }}</span>
    </div>
  </article>
</template>

<style scoped>
.candidate {
  position: relative;
  flex: 0 0 64px;
  width: 64px;
  height: 64px;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-elevated);
}
.candidate--focused {
  outline: 2px solid var(--workspace-green);
  outline-offset: 0;
}
.preview-button {
  position: absolute;
  inset: 0;
  width: 100%;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  background: var(--app-surface-soft);
  border: 0;
}
.preview-button:focus-visible {
  outline: 2px solid var(--workspace-green);
  outline-offset: -2px;
}
.candidate-status {
  position: absolute;
  top: 2px;
  left: 2px;
  max-width: calc(100% - 4px);
  font-size: 9px;
  height: 16px;
  padding: 0 3px;
}
.candidate-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 4px;
  font-size: 10px;
  background: var(--app-overlay-backdrop);
  pointer-events: none;
}
.candidate-footer .n-checkbox {
  pointer-events: auto;
}
.candidate :deep(.n-progress) {
  position: absolute;
  bottom: 0;
}
</style>
