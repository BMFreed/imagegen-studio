<script setup lang="ts">
import type {
  PromptEmbeddingMatch,
  PromptEmbeddingRef,
} from '../../shared/projects/prompt-embeddings.js'

import { NButton } from 'naive-ui'
import { computed } from 'vue'

import { promptEmbeddingDiagnosticReason } from './prompt-embeddings-codemirror.js'

const props = defineProps<{ disabled: boolean; matches: PromptEmbeddingMatch[]; title: string }>()
const emit = defineEmits<{
  manage: [reference: PromptEmbeddingRef | undefined]
  relink: [reference: PromptEmbeddingRef]
}>()
const warnings = computed(() =>
  props.matches
    .filter(
      (match, index, all) =>
        match.status !== 'ready' && all.findIndex((entry) => entry.token === match.token) === index,
    )
    .map((match) => ({
      ...match,
      reason: match.status === 'ready' ? '' : promptEmbeddingDiagnosticReason(match.status),
    })),
)
</script>

<template>
  <section
    v-if="warnings.length"
    :aria-label="`${title} embedding diagnostics`"
    class="embedding-diagnostics"
  >
    <div v-for="match of warnings" :key="match.token" class="embedding-warning">
      <p role="status">Embedding {{ match.token }}: {{ match.reason }}</p>
      <div class="embedding-actions">
        <NButton
          v-if="match.status === 'unlinked' && match.ref"
          :aria-label="`Link installed embedding ${match.token}`"
          :disabled
          quaternary
          size="tiny"
          @click="emit('relink', match.ref)"
        >
          Link installed version
        </NButton>
        <NButton
          v-if="match.status !== 'checking' || match.ref"
          key="n-button-2"
          :aria-label="`Manage embedding ${match.token}`"
          :disabled
          quaternary
          size="tiny"
          @click="emit('manage', match.ref)"
        >
          Manage models
        </NButton>
      </div>
    </div>
  </section>
</template>

<style scoped>
.embedding-diagnostics {
  display: grid;
  gap: 6px;
  padding: 4px 2px;
  font-size: var(--app-font-size-meta);
}
.embedding-warning p {
  margin: 0;
  color: var(--prompt-syntax-warning);
  overflow-wrap: anywhere;
}
.embedding-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 3px;
}
</style>
