<script setup lang="ts">
import type { PromptSyntaxReport } from '../../shared/projects/prompt-diagnostics.js'

import { AlertCircle, AlertTriangle } from '@vicons/tabler'
import { NButton, NIcon, NPopover } from 'naive-ui'
import { computed } from 'vue'

const props = defineProps<{ report: PromptSyntaxReport; title: string }>()
const hasErrors = computed(() => props.report.items.some((item) => item.severity === 'error'))
</script>

<template>
  <NPopover v-if="report.items.length" placement="bottom-start" to="body" trigger="click">
    <template v-slot:trigger>
      <NButton
        :aria-label="`${title} syntax diagnostics (${report.items.length}${report.truncated ? '+' : ''})`"
        circle
        quaternary
        size="small"
        :themeOverrides="{ heightSmall: '24px', iconSizeSmall: '18px' }"
        :type="hasErrors ? 'error' : 'warning'"
      >
        <template v-slot:icon>
          <NIcon :component="hasErrors ? AlertCircle : AlertTriangle" :size="18" />
        </template>
      </NButton>
    </template>
    <section :aria-label="`${title} syntax diagnostics`" class="syntax-details">
      <strong>Prompt syntax</strong>
      <ul>
        <li v-for="item of report.items" :key="`${item.code}-${item.from}-${item.to}`">
          <span class="syntax-kind" :class="`syntax-kind--${item.severity}`">
            {{ item.severity === 'error' ? 'Bracket structure' : 'Attention weight' }}
          </span>
          <span>{{ item.message }}</span>
        </li>
      </ul>
      <p v-if="report.truncated">
        Showing {{ report.items.length }} issues. Fix these to reveal more.
      </p>
      <p>Hints only; interpretation depends on the model.</p>
    </section>
  </NPopover>
</template>

<style scoped>
.syntax-details {
  display: grid;
  gap: 6px;
  width: min(330px, calc(100vw - 48px));
  font-size: var(--app-font-size-meta);
}
.syntax-details ul {
  display: grid;
  gap: 8px;
  max-height: min(240px, calc(100vh - 180px));
  overflow: auto;
  margin: 0;
  padding: 0;
  list-style: none;
}
.syntax-details li {
  display: grid;
  gap: 2px;
  overflow-wrap: anywhere;
}
.syntax-kind--error {
  color: var(--prompt-syntax-error);
}
.syntax-kind--warning {
  color: var(--prompt-syntax-warning);
}
.syntax-details p {
  margin: 0;
  color: var(--app-text-muted);
}
</style>
