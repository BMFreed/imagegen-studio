<script setup lang="ts">
import { Link, Plus, Puzzle } from '@vicons/tabler'
import { NAutoComplete, NButton, NIcon, NTag, NTooltip } from 'naive-ui'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import type { DanbooruTagMock } from './generation-prompt.utils'
import type {
  GenerationEmbeddingResourceRef,
  GenerationLora,
  GenerationPrompt,
  GenerationPromptPolarity,
  GenerationPromptToken,
} from './generation.types'

import { getPromptAutocompleteSuggestions } from './generation-autocomplete.utils'
import {
  classifyPromptToken,
  createGenerationPrompt,
  removePromptToken,
  replacePromptToken,
  splitPromptText,
} from './generation-prompt.utils'

const props = withDefaults(
  defineProps<{
    ariaLabel: string
    danbooruTags: DanbooruTagMock[]
    disabled?: boolean
    embeddings: GenerationEmbeddingResourceRef[]
    loras: GenerationLora[]
    minimumLines?: number
    polarity: GenerationPromptPolarity
  }>(),
  { minimumLines: 4 },
)
const prompt = defineModel<GenerationPrompt>({ required: true })
const selectedTokenId = defineModel<string | undefined>('selectedTokenId')
const draft = ref('')
const creating = ref(false)
const editingBaseTextWidth = ref(0)
const editingBaseWidth = ref(0)
const editingFont = ref('')
const editingTokenId = ref<string>()
const root = ref<HTMLElement>()
const autocompleteMenuProps = {
  style: { maxWidth: 'min(360px, calc(100vw - 32px))', minWidth: '260px' },
}

const createInputWidth = computed(() => {
  const characters = Math.max(3, Math.min(28, [...String(draft.value ?? '')].length + 1))
  return `calc(${characters}ch + 20px)`
})
const editInputWidth = computed(() => {
  const widthDelta =
    measureTextWidth(String(draft.value ?? ''), editingFont.value) - editingBaseTextWidth.value
  const availableWidth = Math.max(42, (root.value?.clientWidth ?? 360) - 12)
  return Math.min(availableWidth, Math.max(42, editingBaseWidth.value + widthDelta))
})

const suggestions = computed(() =>
  getPromptAutocompleteSuggestions({
    danbooruTags: props.danbooruTags,
    embeddings: props.embeddings,
    loras: props.loras,
    polarity: props.polarity,
    query: draft.value,
  }),
)
const suggestionById = computed(() => new Map(suggestions.value.map((item) => [item.id, item])))
const options = computed(() => {
  const groupNames = {
    danbooru: 'Danbooru tags',
    embeddings: 'Embeddings',
    loras: 'Active LoRA triggers',
  } as const
  const groupedOptions = (['loras', 'embeddings', 'danbooru'] as const).flatMap((group) => {
    const children = suggestions.value
      .filter((item) => item.group === group)
      .map((item) => ({ label: `${item.label} · ${item.detail}`, value: item.id }))
    return children.length ? [{ children, label: groupNames[group], type: 'group' as const }] : []
  })
  const danbooruHint =
    String(draft.value ?? '').trim().length < 2
      ? [
          {
            disabled: true,
            label: 'Type 2 characters to search Danbooru tags',
            value: 'danbooru-search-hint',
          },
        ]
      : []
  const emptyHint =
    groupedOptions.length === 0 && danbooruHint.length === 0
      ? [{ disabled: true, label: 'No matching suggestions', value: 'no-matches-hint' }]
      : []
  return [...danbooruHint, ...groupedOptions, ...emptyHint]
})

function emitPrompt(tokens: GenerationPromptToken[]) {
  prompt.value = createGenerationPrompt(tokens)
}
function selectToken(id: string) {
  selectedTokenId.value = id
}
function editToken(token: GenerationPromptToken, event: MouseEvent) {
  selectedTokenId.value = token.id
  const tokenElement = event.currentTarget as HTMLElement
  const textElement = tokenElement.querySelector<HTMLElement>('.prompt-token-text') ?? tokenElement
  const textStyle = getComputedStyle(textElement)
  editingFont.value = `${textStyle.fontWeight} ${textStyle.fontSize} ${textStyle.fontFamily}`
  editingBaseTextWidth.value = measureTextWidth(token.text, editingFont.value)
  editingBaseWidth.value = Math.ceil(tokenElement.getBoundingClientRect().width)
  editingTokenId.value = token.id
  creating.value = false
  draft.value = token.text
  void nextTick(focusInput)
}
function removeToken(id: string, event?: MouseEvent) {
  event?.stopPropagation()
  prompt.value = removePromptToken(prompt.value, id)
  if (selectedTokenId.value === id) {
    selectedTokenId.value = undefined
  }
  if (editingTokenId.value === id) {
    cancelDraft()
  }
}
function commitToken(token?: GenerationPromptToken) {
  const text = String(draft.value ?? '').trim()
  if (!text && !token) {
    cancelDraft()
    return
  }
  // Resource identity is created only through an explicit autocomplete choice.
  // A manually typed activation token remains ordinary prompt text.
  const next = token ?? classifyPromptToken(text, [], props.danbooruTags)
  if (editingTokenId.value) {
    const replacement = token
      ? { ...next, id: editingTokenId.value }
      : { id: editingTokenId.value, kind: 'custom' as const, text }
    prompt.value = replacePromptToken(prompt.value, editingTokenId.value, replacement)
    selectedTokenId.value = editingTokenId.value
  } else {
    emitPrompt([...prompt.value.tokens, next])
    selectedTokenId.value = undefined
  }
  draft.value = ''
  creating.value = false
  editingTokenId.value = undefined
  resetEditingMeasurement()
}
function chooseSuggestion(value: string) {
  const suggestion = suggestionById.value.get(value)
  if (suggestion) {
    commitToken(JSON.parse(JSON.stringify(suggestion.token)) as GenerationPromptToken)
  }
}
function cancelDraft() {
  draft.value = ''
  creating.value = false
  editingTokenId.value = undefined
  resetEditingMeasurement()
}
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    cancelDraft()
    return
  }
  if (event.key === 'Backspace' && !draft.value && !editingTokenId.value) {
    const last = prompt.value.tokens.at(-1)
    if (!last) {
      return
    }
    if (selectedTokenId.value === last.id) {
      removeToken(last.id)
    } else {
      selectedTokenId.value = last.id
    }
  }
}
function handleEditorKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.code === 'Space' && !props.disabled) {
    event.preventDefault()
    if (creating.value || editingTokenId.value) {
      focusInput()
    } else {
      beginCreate()
    }
  }
}
function handlePaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text') ?? ''
  const parts = splitPromptText(text)
  if (parts.length < 2) {
    return
  }
  event.preventDefault()
  emitPrompt([
    ...prompt.value.tokens,
    ...parts.map((part) => classifyPromptToken(part, [], props.danbooruTags)),
  ])
  draft.value = ''
}
function tokenKeydown(event: KeyboardEvent, token: GenerationPromptToken) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    selectToken(token.id)
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    removeToken(token.id)
  }
}
function focusInput() {
  root.value?.querySelector<HTMLInputElement>('input')?.focus()
}
function measureTextWidth(text: string, font: string) {
  const context = document.createElement('canvas').getContext('2d')
  if (!context) {
    return text.length * 7
  }
  context.font = font
  return context.measureText(text || ' ').width
}
function resetEditingMeasurement() {
  editingBaseTextWidth.value = 0
  editingBaseWidth.value = 0
  editingFont.value = ''
}
function beginCreate() {
  selectedTokenId.value = undefined
  editingTokenId.value = undefined
  draft.value = ''
  creating.value = true
  void nextTick(focusInput)
}
function handleOutsideClick(event: MouseEvent) {
  if (!root.value?.contains(event.target as Node)) {
    selectedTokenId.value = undefined
  }
}
function handleEditorClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (
    target.closest('[role="option"]') ||
    target.closest('.prompt-token-input') ||
    target.closest('.prompt-token-add')
  ) {
    return
  }
  selectedTokenId.value = undefined
}

onMounted(() => document.addEventListener('click', handleOutsideClick))
onBeforeUnmount(() => document.removeEventListener('click', handleOutsideClick))
</script>

<template>
  <div
    ref="root"
    :aria-label
    class="prompt-token-editor"
    :class="{ 'prompt-token-editor--disabled': disabled }"
    role="listbox"
    :style="{ '--prompt-lines': minimumLines }"
    @click="handleEditorClick"
    @keydown="handleEditorKeydown"
  >
    <template v-for="token of prompt.tokens" :key="token.id">
      <NAutoComplete
        v-if="editingTokenId === token.id"
        v-model:value="draft"
        :aria-label="`Edit ${token.text}`"
        class="prompt-token-input prompt-token-input--editing"
        :getShow="() => true"
        :inputProps="{ 'aria-label': `Edit ${token.text}` }"
        :menuProps="autocompleteMenuProps"
        :options
        placeholder=""
        size="small"
        :style="{ width: `${editInputWidth}px` }"
        @blur="commitToken()"
        @keydown="handleKeydown"
        @keyup.enter="commitToken()"
        @select="chooseSuggestion"
      />
      <NTooltip v-else :disabled="token.kind !== 'embedding' && token.kind !== 'lora-trigger'">
        <template v-slot:trigger>
          <NTag
            :aria-label="`${token.kind} token ${token.text}`"
            :aria-selected="selectedTokenId === token.id"
            :class="{ 'prompt-token--selected': selectedTokenId === token.id }"
            closable
            :disabled
            role="option"
            tabindex="0"
            :type="token.kind === 'embedding' && token.resource.missing ? 'warning' : 'default'"
            @click="selectToken(token.id)"
            @close="removeToken(token.id, $event)"
            @dblclick="editToken(token, $event)"
            @keydown="tokenKeydown($event, token)"
          >
            <NIcon v-if="token.kind === 'embedding'" key="n-icon-1" :component="Puzzle" />
            <NIcon v-else-if="token.kind === 'lora-trigger'" key="n-icon-2" :component="Link" />
            <span class="prompt-token-text">{{ token.text }}</span>
          </NTag>
        </template>
        <template v-if="token.kind === 'embedding'">
          Embedding: {{ token.resource.name }}
          <span v-if="token.resource.missing">· Missing resource</span>
        </template>
        <template v-else-if="token.kind === 'lora-trigger'">Trigger from active LoRA</template>
      </NTooltip>
    </template>

    <NAutoComplete
      v-if="creating && !editingTokenId"
      v-model:value="draft"
      :aria-label="`Add ${ariaLabel} token`"
      class="prompt-token-input"
      clearAfterSelect
      :disabled
      :getShow="() => true"
      :inputProps="{ 'aria-label': `Add ${ariaLabel} token` }"
      :menuProps="autocompleteMenuProps"
      :options
      placeholder=""
      size="small"
      :style="{ width: createInputWidth }"
      @blur="commitToken()"
      @keydown="handleKeydown"
      @keyup.enter="commitToken()"
      @paste="handlePaste"
      @select="chooseSuggestion"
    />
    <NTooltip v-else-if="!editingTokenId">
      <template v-slot:trigger>
        <NButton
          :aria-label="`Add ${ariaLabel} token`"
          class="prompt-token-add"
          dashed
          :disabled
          size="small"
          @click="beginCreate"
        >
          <template v-slot:icon><NIcon :component="Plus" /></template>
        </NButton>
      </template>
      Add {{ ariaLabel }} token
    </NTooltip>
  </div>
</template>

<style scoped>
.prompt-token-editor {
  display: flex;
  min-width: 0;
  min-height: calc(var(--prompt-lines) * 20px + 18px);
  align-content: flex-start;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 5px;
  padding: 24px 28px 12px 8px;
  overflow: auto;
  resize: vertical;
}
.prompt-token-editor--disabled {
  opacity: 0.55;
}
.prompt-token-input {
  flex: 0 0 auto;
  min-width: 3ch;
  max-width: 100%;
}
.prompt-token-input--editing {
  flex: 0 0 auto;
}
.n-tag {
  max-width: 100%;
  height: 26px;
  border: 1px solid var(--app-border);
  background: var(--app-elevated);
}
.n-tag.prompt-token--selected {
  border-color: var(--workspace-green);
  background: var(--app-elevated);
  box-shadow: 0 0 0 1px var(--workspace-green);
}
.n-tag :deep(.n-tag__content) {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
  line-height: 20px;
}
.n-tag :deep(.n-icon) {
  flex: 0 0 auto;
}
.prompt-token-text {
  min-width: 0;
  overflow: hidden;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.prompt-token-add {
  width: 30px;
  padding-inline: 0;
}
.prompt-token-add :deep(.n-button__icon) {
  margin: 0;
}
</style>
