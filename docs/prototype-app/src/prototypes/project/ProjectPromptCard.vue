<script setup lang="ts">
import { inspectPromptSyntax } from '../../../../../src/shared/projects/prompt-diagnostics'

import { NText, useMessage } from 'naive-ui'
import { computed, ref } from 'vue'

import type {
  GenerationPrompt,
  GenerationPromptSelection,
} from '../../components/generation/generation.types'
import type { GenerationPromptEditorHandle } from '../../components/generation/GenerationPromptEditor.vue'
import type { ProjectSession } from './project.types'

import PromptDiagnosticsIndicator from '../../../../../src/renderer/components/PromptDiagnosticsIndicator.vue'
import PromptEditorActions from '../../../../../src/renderer/components/PromptEditorActions.vue'
import PromptEditorHelp from '../../../../../src/renderer/components/PromptEditorHelp.vue'
import {
  cloneGenerationPrompt,
  countPromptTokens,
  createGenerationPrompt,
  findTopLevelPromptPhraseRange,
  serializeGenerationPrompt,
} from '../../components/generation/generation-prompt.utils'
import { mockDanbooruTags } from '../../components/generation/generation.mock'
import GenerationPromptEditor from '../../components/generation/GenerationPromptEditor.vue'
import { presetEditorResources } from '../presets/presets.mock'
import { beginProjectEdit, commitActiveProjectEdit, updateProjectEdit } from './project-history'
import { getActiveGenerationDraft } from './project.utils'

const props = defineProps<{
  field: 'negativePrompt' | 'prompt'
  session: ProjectSession
  title: string
}>()
const emit = defineEmits<{ dynamicPreview: [] }>()
const message = useMessage()
const editor = ref<GenerationPromptEditorHandle>()
const editorFocused = ref(false)
const selection = ref<GenerationPromptSelection>({ anchor: 0, head: 0 })
const value = computed(
  () => getActiveGenerationDraft(props.session).payload[props.field] ?? createGenerationPrompt(),
)
const serialized = computed(() => serializeGenerationPrompt(value.value))
const tokenCount = computed(() => countPromptTokens(serialized.value))
const modelFamily = computed(
  () => getActiveGenerationDraft(props.session).payload.model?.baseModelFamily ?? null,
)
const syntaxReport = ref(inspectPromptSyntax(serialized.value, modelFamily.value))
const loras = computed(() => getActiveGenerationDraft(props.session).payload.loras ?? [])
const transactionKey = computed(() => {
  const selected = props.session.ui.selection
  return `prompt:${selected?.kind ?? 'project'}:${selected?.id ?? props.session.document.id}:${props.field}`
})
const attentionTargetAvailable = computed(() => {
  if (selection.value.anchor !== selection.value.head) {
    const { anchor, head } = selection.value
    return Boolean(serialized.value.slice(Math.min(anchor, head), Math.max(anchor, head)).trim())
  }
  const range = findTopLevelPromptPhraseRange(serialized.value, selection.value.head)
  return Boolean(serialized.value.slice(range.from, range.to).trim())
})

function beginEdit() {
  beginProjectEdit(props.session, transactionKey.value, `Edit ${props.title.toLocaleLowerCase()}`)
}

function update(next: GenerationPrompt) {
  beginEdit()
  updateProjectEdit(props.session, () => {
    getActiveGenerationDraft(props.session).payload[props.field] = cloneGenerationPrompt(next)
  })
}

function handleFocus() {
  beginEdit()
  editorFocused.value = true
}

function handleBlur() {
  editorFocused.value = false
  commitActiveProjectEdit(props.session)
}

function attention(direction: -1 | 1) {
  beginEdit()
  editor.value?.applyAttention(direction)
}

async function copy() {
  await navigator.clipboard.writeText(serialized.value)
  message.success(`${props.title} copied`)
}

function clear() {
  beginEdit()
  update(createGenerationPrompt())
  selection.value = { anchor: 0, head: 0 }
  editor.value?.focus()
}
</script>

<template>
  <section class="prompt-card" :class="{ 'prompt-card--focused': editorFocused }">
    <header class="prompt-meta">
      <strong>{{ title }}</strong>
      <NText depth="3">{{ tokenCount }} tokens</NText>
      <PromptEditorHelp
        completionSources="embeddings and LoRA triggers"
        :editorFocused
        :title
        @focusEditor="editor?.focus()"
      />
      <PromptDiagnosticsIndicator :report="syntaxReport" :title />
    </header>
    <GenerationPromptEditor
      ref="editor"
      v-model:selection="selection"
      :ariaLabel="title"
      :danbooruTags="mockDanbooruTags"
      :embeddings="presetEditorResources.embeddings"
      historyMode="external"
      :loras
      :minimumLines="field === 'prompt' ? 9 : 4"
      :modelFamily
      :modelValue="value"
      :polarity="field === 'prompt' ? 'positive' : 'negative'"
      :showSyntaxStatus="false"
      @blur="handleBlur"
      @focus="handleFocus"
      @syntaxReport="syntaxReport = $event"
      @update:modelValue="update($event)"
    />
    <PromptEditorActions
      :attentionTargetAvailable
      class="prompt-actions-rail"
      dynamicPreviewAvailable
      :empty="!serialized"
      @browse="editor?.openAutocomplete()"
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
  min-height: 164px;
  overflow: hidden;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  transition:
    background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.prompt-card :deep(.generation-prompt-editor) {
  min-height: max(164px, calc(var(--prompt-minimum-lines) * 20px + 18px));
}
.prompt-card--focused {
  background: var(--prompt-editor-focus-surface);
  border-color: var(--prompt-editor-focus-border);
  box-shadow: 0 0 8px 0 var(--prompt-editor-focus-shadow);
}
.prompt-meta {
  position: absolute;
  z-index: 2;
  top: 5px;
  left: 8px;
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
  line-height: 1.2;
}
.prompt-meta strong {
  font-weight: 600;
}
.prompt-meta .n-text {
  font-size: var(--app-font-size-meta);
}
.prompt-actions-rail {
  position: absolute;
  z-index: 2;
  top: 7px;
  right: 5px;
}
</style>
