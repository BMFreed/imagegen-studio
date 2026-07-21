<script setup lang="ts">
import { AlertTriangle, InfoCircle, X } from '@vicons/tabler'
import { NButton, NIcon, NPopover, NText, NTooltip, useMessage } from 'naive-ui'
import { computed, ref } from 'vue'

import type {
  GenerationPrompt,
  GenerationPromptSelection,
} from '../../components/generation/generation.types'
import type { GenerationPromptEditorHandle } from '../../components/generation/GenerationPromptEditor.vue'
import type { ProjectSession } from './project.types'

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
import ProjectPromptActions from './ProjectPromptActions.vue'

const HINT_STORAGE_KEY = 'imagegen-studio.prompt-editor-hint-dismissed.v1'
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
const hintDismissed = ref(localStorage.getItem(HINT_STORAGE_KEY) === '1')
const hintOpen = ref(false)
const hintLines = [
  'Triple-click selects a comma-separated phrase.',
  'Ctrl/Cmd+Space browses embeddings and LoRA triggers.',
]
const value = computed(
  () => getActiveGenerationDraft(props.session).payload[props.field] ?? createGenerationPrompt(),
)
const serialized = computed(() => serializeGenerationPrompt(value.value))
const tokenCount = computed(() => countPromptTokens(serialized.value))
const warning = computed(() => serialized.value.includes('(broken'))
const loras = computed(() => getActiveGenerationDraft(props.session).payload.loras ?? [])
const transactionKey = computed(() => {
  const selected = props.session.ui.selection
  return `prompt:${selected?.kind ?? 'project'}:${selected?.id ?? props.session.document.id}:${props.field}`
})
const attentionTargetAvailable = computed(() => {
  if (selection.value.anchor !== selection.value.head) {
    return true
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
  hintDismissed.value = localStorage.getItem(HINT_STORAGE_KEY) === '1'
  hintOpen.value = !hintDismissed.value
}

function handleBlur() {
  editorFocused.value = false
  hintOpen.value = false
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

function dismissHint() {
  localStorage.setItem(HINT_STORAGE_KEY, '1')
  hintDismissed.value = true
  hintOpen.value = false
}

function handleInfoMouseDown(event: MouseEvent) {
  if (!hintDismissed.value) {
    event.preventDefault()
  }
}

function handleInfoClick() {
  if (!hintDismissed.value) {
    editor.value?.focus()
  }
}

function showDismissedHint() {
  if (hintDismissed.value) {
    hintOpen.value = true
  }
}

function hideDismissedHint() {
  if (hintDismissed.value) {
    hintOpen.value = false
  }
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
  <section
    class="prompt-card"
    :class="{ 'prompt-card--focused': editorFocused }"
    @keydown.capture="hotkey"
  >
    <header class="prompt-meta">
      <strong>{{ title }}</strong>
      <NText depth="3">{{ tokenCount }} tokens</NText>
      <NPopover :show="hintOpen" trigger="manual">
        <template v-slot:trigger>
          <NButton
            :aria-label="`About ${title} editor`"
            circle
            class="prompt-info"
            quaternary
            size="tiny"
            @blur="hideDismissedHint"
            @click="handleInfoClick"
            @focus="showDismissedHint"
            @mousedown="handleInfoMouseDown"
            @mouseenter="showDismissedHint"
            @mouseleave="hideDismissedHint"
          >
            <template v-slot:icon><NIcon :component="InfoCircle" /></template>
          </NButton>
        </template>
        <div class="prompt-help">
          <span v-for="line of hintLines" :key="line">{{ line }}</span>
          <NButton
            v-if="!hintDismissed"
            class="prompt-help__dismiss"
            size="tiny"
            text
            @click="dismissHint"
            @mousedown.prevent
          >
            <template v-slot:icon><NIcon :component="X" /></template>
            Don't show again
          </NButton>
        </div>
      </NPopover>
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
    <GenerationPromptEditor
      ref="editor"
      v-model:selection="selection"
      :ariaLabel="title"
      :danbooruTags="mockDanbooruTags"
      :embeddings="presetEditorResources.embeddings"
      historyMode="external"
      :loras
      :minimumLines="field === 'prompt' ? 9 : 4"
      :modelValue="value"
      :polarity="field === 'prompt' ? 'positive' : 'negative'"
      @blur="handleBlur"
      @focus="handleFocus"
      @update:modelValue="update($event)"
    />
    <ProjectPromptActions
      :attentionTargetAvailable
      class="prompt-actions-rail"
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
  min-height: 0;
  overflow: hidden;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  transition:
    background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1);
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
.prompt-info {
  color: var(--app-text-muted);
}
.prompt-warning {
  flex: 0 0 auto;
  color: var(--status-warning);
}
.prompt-actions-rail {
  position: absolute;
  z-index: 2;
  top: 7px;
  right: 5px;
}
.prompt-help {
  display: grid;
  gap: 3px;
  font-size: var(--app-font-size-meta);
}
.prompt-help__dismiss {
  justify-self: end;
  margin-top: 6px;
}
</style>
