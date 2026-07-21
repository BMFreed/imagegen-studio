<script setup lang="ts">
import { AlertTriangle, InfoCircle } from '@vicons/tabler'
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
const selection = ref<GenerationPromptSelection>({ anchor: 0, head: 0 })
const hintOpen = ref(false)
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
  if (localStorage.getItem(HINT_STORAGE_KEY) !== '1') {
    hintOpen.value = true
  }
}

function handleBlur() {
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
  hintOpen.value = false
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
      <NPopover :show="hintOpen" trigger="manual">
        <template v-slot:trigger>
          <NTooltip :disabled="hintOpen">
            <template v-slot:trigger>
              <NButton
                :aria-label="`About ${title} editor`"
                circle
                class="prompt-info"
                quaternary
                size="tiny"
                @click="hintOpen = !hintOpen"
              >
                <template v-slot:icon><NIcon :component="InfoCircle" /></template>
              </NButton>
            </template>
            Type and edit prompt text freely. Double-click selects a word. Triple-click selects a
            comma-separated phrase. Ctrl/Cmd+Space browses embeddings and LoRA triggers.
          </NTooltip>
        </template>
        <div class="prompt-onboarding">
          <span>Type and edit prompt text freely.</span>
          <span>Double-click selects a word.</span>
          <span>Triple-click selects a comma-separated phrase.</span>
          <span>Ctrl/Cmd+Space browses embeddings and LoRA triggers.</span>
          <NButton size="tiny" type="primary" @click="dismissHint">Don't show again</NButton>
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
.prompt-onboarding {
  display: grid;
  max-width: 330px;
  gap: 3px;
  font-size: var(--app-font-size-meta);
}
.prompt-onboarding .n-button {
  justify-self: end;
  margin-top: 6px;
}
</style>
