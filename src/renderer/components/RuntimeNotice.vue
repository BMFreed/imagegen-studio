<script setup lang="ts">
import type { RuntimeStatus } from '../../shared/api.js'

import { NAlert, NButton, NSpin } from 'naive-ui'
import { computed } from 'vue'

const props = defineProps<{
  error: string | null
  pending: 'check' | 'install' | 'repair' | null
  status: RuntimeStatus | null
}>()

const emit = defineEmits<{
  check: []
  install: []
  repair: []
}>()

const heading = computed(() => {
  switch (props.status?.kind) {
    case 'needs-repair': {
      return 'Image generation needs repair'
    }
    case 'not-installed': {
      return 'Set up image generation'
    }
    case 'unsupported': {
      return 'Image generation is unavailable on this computer'
    }
    default: {
      return props.error ? 'Image generation status is unavailable' : 'Checking image generation'
    }
  }
})

const description = computed(() => {
  switch (props.status?.kind) {
    case 'needs-repair': {
      return 'The image engine cannot start. Repair it to resume generation.'
    }
    case 'not-installed': {
      return 'Install the image engine to start generating. You can still use the rest of the app.'
    }
    case 'unsupported': {
      return 'This release requires Linux with a supported NVIDIA GPU.'
    }
    default: {
      return props.error
        ? 'Check the desktop app connection and try again.'
        : 'Checking whether image generation is available.'
    }
  }
})
</script>

<template>
  <section aria-label="Image generation status" aria-live="polite" class="runtime-notice">
    <div class="notice-copy">
      <div class="notice-heading">
        <NSpin v-if="pending === 'check' && !status" size="small" />
        <h2>{{ heading }}</h2>
      </div>
      <p>{{ description }}</p>
      <details v-if="status?.detail" class="notice-detail">
        <summary>Details</summary>
        <p>{{ status.detail }}</p>
      </details>
      <NAlert v-if="error" class="notice-error" title="Action could not be completed" type="error">
        {{ error }}
      </NAlert>
    </div>
    <div class="notice-actions">
      <NButton
        v-if="status?.kind === 'not-installed'"
        key="n-button-1"
        :disabled="pending !== null"
        :loading="pending === 'install'"
        secondary
        @click="emit('install')"
      >
        Set up
      </NButton>
      <NButton
        v-else-if="status?.kind === 'needs-repair'"
        key="n-button-2"
        :disabled="pending !== null"
        :loading="pending === 'repair'"
        secondary
        @click="emit('repair')"
      >
        Repair
      </NButton>
      <NButton v-if="error" key="n-button-3" :disabled="pending !== null" @click="emit('check')">
        Check again
      </NButton>
    </div>
  </section>
</template>

<style scoped>
.runtime-notice {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 14px 24px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-elevated);
}

.notice-copy {
  min-width: 0;
}

.notice-heading {
  display: flex;
  align-items: center;
  gap: 9px;
}

.notice-heading h2 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.notice-copy > p,
.notice-detail p {
  margin: 3px 0 0;
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}

.notice-detail {
  margin-top: 7px;
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}

.notice-detail summary {
  width: fit-content;
  cursor: pointer;
}

.notice-error {
  margin-top: 10px;
}

.notice-actions {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
</style>
