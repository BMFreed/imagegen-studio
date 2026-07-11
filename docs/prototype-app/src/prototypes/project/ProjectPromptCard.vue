<script setup lang="ts">
import { AlertTriangle } from '@vicons/tabler'
import { NIcon, NText, NTooltip, useMessage } from 'naive-ui'
import { computed, ref } from 'vue'

import type { GenerationPrompt } from '../../components/generation/generation.types'
import type { ProjectSession } from './project.types'

import {
  adjustPromptTokenAttention,
  cloneGenerationPrompt,
  createGenerationPrompt,
  serializeGenerationPrompt,
} from '../../components/generation/generation-prompt.utils'
import { mockDanbooruTags } from '../../components/generation/generation.mock'
import GenerationPromptTokenEditor from '../../components/generation/GenerationPromptTokenEditor.vue'
import { presetEditorResources } from '../presets/presets.mock'
import { commitProjectMutation } from './project-history'
import { getActiveGenerationDraft } from './project.utils'
import ProjectPromptActions from './ProjectPromptActions.vue'

const props = defineProps<{
  field: 'negativePrompt' | 'prompt'
  session: ProjectSession
  title: string
}>()
const emit = defineEmits<{ dynamicPreview: [] }>()
const message = useMessage()
const selectedTokenId = ref<string>()
const value = computed(
  () => getActiveGenerationDraft(props.session).payload[props.field] ?? createGenerationPrompt(),
)
const serialized = computed(() => serializeGenerationPrompt(value.value))
const tokenCount = computed(() => serialized.value.split(/\s+/).filter(Boolean).length)
const warning = computed(() => serialized.value.includes('(broken'))
const loras = computed(() => getActiveGenerationDraft(props.session).payload.loras ?? [])

function update(next: GenerationPrompt, label = `Edit ${props.title.toLowerCase()}`) {
  commitProjectMutation(props.session, label, () => {
    getActiveGenerationDraft(props.session).payload[props.field] = cloneGenerationPrompt(next)
  })
}
function attention(direction: -1 | 1) {
  if (!selectedTokenId.value) {
    return
  }
  update(
    adjustPromptTokenAttention(value.value, selectedTokenId.value, direction),
    `${direction > 0 ? 'Increase' : 'Decrease'} prompt attention`,
  )
}
async function copy() {
  await navigator.clipboard.writeText(serialized.value)
  message.success(`${props.title} copied`)
}
function clear() {
  update(createGenerationPrompt(), `Clear ${props.title.toLowerCase()}`)
  selectedTokenId.value = undefined
}
function hotkey(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) {
    return
  }
  event.preventDefault()
  attention(event.key === 'ArrowUp' ? 1 : -1)
}
</script>

<template>
  <section class="prompt-card" @keydown.capture="hotkey">
    <header class="prompt-meta">
      <strong>{{ title }}</strong>
      <NText depth="3">{{ tokenCount }} tokens</NText>
      <NTooltip v-if="warning">
        <template v-slot:trigger>
          <NIcon
            aria-label="Check prompt weights"
            class="prompt-warning"
            :component="AlertTriangle"
          />
        </template>
        Check prompt weights
      </NTooltip>
    </header>
    <GenerationPromptTokenEditor
      v-model:selectedTokenId="selectedTokenId"
      :ariaLabel="title"
      :danbooruTags="mockDanbooruTags"
      :embeddings="presetEditorResources.embeddings"
      :loras
      :minimumLines="field === 'prompt' ? 9 : 4"
      :modelValue="value"
      :polarity="field === 'prompt' ? 'positive' : 'negative'"
      @update:modelValue="update($event)"
    />
    <ProjectPromptActions
      class="prompt-actions-rail"
      :tokenSelected="Boolean(selectedTokenId)"
      @clear="clear"
      @copy="copy"
      @decrease="attention(-1)"
      @dynamicPreview="emit('dynamicPreview')"
      @increase="attention(1)"
    />
  </section>
</template>

<style scoped>
.prompt-card {
  position: relative;
  min-height: 0;
  overflow: hidden;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
}
.prompt-meta {
  position: absolute;
  z-index: 1;
  top: 7px;
  left: 8px;
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  line-height: 1.2;
  pointer-events: none;
}
.prompt-meta strong {
  font-weight: 600;
}
.prompt-meta .n-text {
  font-size: var(--app-font-size-meta);
}
.prompt-warning {
  flex: 0 0 auto;
  color: var(--status-warning);
  pointer-events: auto;
}
.prompt-actions-rail {
  position: absolute;
  z-index: 2;
  top: 7px;
  right: 5px;
}
</style>
