<script setup lang="ts">
import type { ProjectGenerationQueueJob } from '../../shared/api.js'
import type { GenerationProgressCurrent } from '../../shared/projects/generation-progress.js'

import { X as CloseIcon } from '@vicons/tabler'
import { NAlert, NButton, NIcon, NTag } from 'naive-ui'
import { ref } from 'vue'

import GenerationProgressIndicator from './GenerationProgressIndicator.vue'

defineProps<{
  canceling: boolean
  disabled: boolean
  error: string | null
  jobs: ProjectGenerationQueueJob[]
  loading: boolean
  progress: GenerationProgressCurrent | null
  runningJobId: string | null
}>()
const emit = defineEmits<{ cancelCurrent: []; close: []; refresh: [] }>()
const closeButton = ref<{ $el: HTMLButtonElement } | null>(null)
defineExpose({ focusClose: () => closeButton.value?.$el.focus({ preventScroll: true }) })
</script>

<template>
  <aside
    aria-label="Project generation queue"
    class="queue-panel"
    @keydown.esc.stop="emit('close')"
    @pointerdown.stop
    @wheel.stop
  >
    <header class="queue-heading">
      <strong>Project Queue</strong>
      <NButton
        ref="closeButton"
        aria-label="Close project queue"
        circle
        quaternary
        size="tiny"
        @click="emit('close')"
      >
        <template v-slot:icon><NIcon :component="CloseIcon" /></template>
      </NButton>
    </header>
    <div class="queue-content">
      <NAlert v-if="error" type="error">
        {{ error }}
        <NButton :disabled="loading" :loading size="tiny" tertiary @click="emit('refresh')">
          Retry
        </NButton>
      </NAlert>
      <div v-if="jobs.length" class="queue-list">
        <article
          v-for="(job, index) of jobs"
          :key="job.id"
          :aria-label="`Generation job ${index + 1}`"
          class="queue-item"
        >
          <div class="queue-item-heading">
            <strong>Job {{ index + 1 }}</strong>
            <NTag size="small">{{ job.status === 'running' ? 'Running' : 'Pending' }}</NTag>
          </div>
          <p class="queue-prompt">{{ job.prompt || 'Empty positive prompt' }}</p>
          <p class="queue-seed">Seed {{ job.seed }}</p>
          <GenerationProgressIndicator v-if="progress?.jobId === job.id" :progress />
        </article>
      </div>
      <p v-else class="queue-empty" role="status">
        {{ loading ? 'Loading project queue…' : 'No pending or running jobs in this project.' }}
      </p>
    </div>
    <footer class="queue-actions">
      <NButton
        :disabled="disabled || !runningJobId || canceling"
        :loading="canceling"
        secondary
        size="small"
        type="error"
        @click="emit('cancelCurrent')"
      >
        Cancel current
      </NButton>
    </footer>
  </aside>
</template>

<style scoped>
.queue-panel {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 4;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 10px;
  width: 330px;
  max-width: calc(100% - 24px);
  max-height: calc(100% - 24px);
  box-sizing: border-box;
  padding: 12px;
  background: var(--app-elevated);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  cursor: auto;
}

.queue-heading,
.queue-actions,
.queue-item-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.queue-content {
  min-height: 0;
  overflow: auto;
  scrollbar-color: var(--app-border) transparent;
  scrollbar-width: thin;
}

.queue-list {
  display: grid;
  gap: 6px;
}

.queue-item {
  min-width: 0;
  padding: 8px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
}

.queue-prompt {
  margin: 8px 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.queue-seed,
.queue-empty {
  margin: 8px 0;
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}

.queue-actions {
  justify-content: end;
}
</style>
