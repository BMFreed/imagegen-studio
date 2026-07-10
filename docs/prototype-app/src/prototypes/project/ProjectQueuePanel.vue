<script setup lang="ts">
import { NButton, NProgress, NTag } from 'naive-ui';

import type { ProjectSession } from './project.types';

defineProps<{ session: ProjectSession }>();
defineEmits<{ cancelCurrent: []; cancelPending: []; clear: []; close: [] }>();
</script>

<template>
  <aside v-if="session.ui.queueOpen" aria-label="Project generation queue" class="queue-panel">
    <header>
      <strong>Project Queue</strong
      ><NButton
        aria-label="Close project queue"
        circle
        quaternary
        size="tiny"
        @click="$emit('close')"
        >×</NButton
      >
    </header>
    <div v-if="session.queueItems.length" class="queue-list">
      <article v-for="item of session.queueItems" :key="item.id" class="queue-item">
        <div>
          <strong>{{ item.label }}</strong
          ><NTag
            size="small"
            :type="
              item.status === 'failed'
                ? 'error'
                : item.status === 'completed'
                  ? 'success'
                  : 'default'
            "
            >{{ item.status }}</NTag
          >
        </div>
        <NProgress v-if="item.status === 'running'" :percentage="item.progress" type="line" />
      </article>
    </div>
    <p v-else>No jobs in this project queue.</p>
    <footer>
      <NButton size="small" tertiary @click="$emit('clear')">Clear terminal</NButton
      ><NButton size="small" tertiary @click="$emit('cancelPending')">Cancel pending</NButton
      ><NButton secondary size="small" type="error" @click="$emit('cancelCurrent')"
        >Cancel current</NButton
      >
    </footer>
  </aside>
</template>

<style scoped>
.queue-panel {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: var(--z-floating-control);
  display: grid;
  gap: 10px;
  width: 330px;
  max-height: calc(100% - 24px);
  padding: 12px;
  overflow: auto;
  background: var(--app-elevated);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  box-shadow: 0 12px 28px #0008;
}
header,
footer,
.queue-item > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.queue-list {
  display: grid;
  gap: 6px;
}
.queue-item {
  padding: 8px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
}
footer {
  justify-content: end;
  flex-wrap: wrap;
}
p {
  margin: 8px 0;
  color: var(--app-text-muted);
}
</style>
