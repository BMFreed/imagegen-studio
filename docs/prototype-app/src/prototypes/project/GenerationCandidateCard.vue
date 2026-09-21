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
    <small v-if="candidate.error">{{ candidate.error }}</small>
  </article>
</template>

<style scoped>
.candidate {
  flex: 0 0 112px;
  display: grid;
  grid-template-rows: 72px auto;
  width: 112px;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-elevated);
}
.candidate--focused {
  border-color: var(--workspace-green);
}
.preview-button {
  position: relative;
  min-width: 0;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  background: var(--app-surface-soft);
  border: 0;
}
.candidate-status {
  position: absolute;
  top: 4px;
  left: 4px;
}
.candidate-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 7px;
  font-size: 11px;
}
small {
  padding: 0 7px 6px;
  color: var(--app-window-close);
}
</style>
