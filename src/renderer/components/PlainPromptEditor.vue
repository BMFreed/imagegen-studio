<script setup lang="ts">
import type { LoraTriggerSource } from '../../shared/projects/lora-triggers.js'
import { inspectPromptSyntax } from '../../shared/projects/prompt-diagnostics.js'
import { findTopLevelPromptPhraseRange } from '../../shared/projects/prompt-text.js'

import {
  autocompletion,
  closeCompletion,
  completionKeymap,
  startCompletion,
} from '@codemirror/autocomplete'
import { defaultKeymap } from '@codemirror/commands'
import { Compartment, EditorState, Transaction } from '@codemirror/state'
import { EditorView, keymap, tooltips } from '@codemirror/view'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { promptSyntaxExtensions } from './prompt-diagnostics-codemirror.js'
import {
  applyPromptAttention,
  clearPromptTransaction,
  promptAttentionKeymap,
  tripleClickPhraseSelection,
} from './prompt-editing-codemirror.js'
import { loraCompletionSource, loraContextExtensions } from './prompt-lora-codemirror.js'
import PromptDiagnosticsIndicator from './PromptDiagnosticsIndicator.vue'
import PromptEditorActions from './PromptEditorActions.vue'
import PromptEditorHelp from './PromptEditorHelp.vue'

const props = defineProps<{
  ariaLabel: string
  disabled: boolean
  dynamicPreviewAvailable?: boolean
  embeddingTokens: string[]
  loraSources: LoraTriggerSource[]
  polarity: 'negative' | 'positive'
}>()
const emit = defineEmits<{ blur: []; dynamicPreview: []; focus: [] }>()
const text = defineModel<string>({ required: true })
const host = ref<HTMLElement | null>(null)
const focused = ref(false)
const selection = ref({ anchor: 0, head: 0 })
const copyStatus = ref('')
const syntaxReport = computed(() => inspectPromptSyntax(text.value))
const attentionAvailable = computed(() => {
  const selected = selection.value
  const range =
    selected.anchor === selected.head
      ? findTopLevelPromptPhraseRange(text.value, selected.head)
      : {
          from: Math.min(selected.anchor, selected.head),
          to: Math.max(selected.anchor, selected.head),
        }
  return Boolean(text.value.slice(range.from, range.to).trim())
})
const editable = new Compartment()
const context = new Compartment()
const completion = new Compartment()
let view: EditorView | null = null
let syncingExternal = false

function focus() {
  if (!props.disabled) {
    view?.focus()
  }
}

function attention(direction: -1 | 1) {
  if (view && !props.disabled) {
    view.focus()
    applyPromptAttention(view, direction)
  }
}
function browse() {
  if (view && !props.disabled) {
    view.focus()
    startCompletion(view)
  }
}
function clear() {
  if (!view || props.disabled) {
    return
  }
  const transaction = clearPromptTransaction(view.state)
  if (transaction) {
    view.focus()
    view.dispatch(transaction)
  }
}
async function copy() {
  if (props.disabled) {
    return
  }
  try {
    await navigator.clipboard.writeText(text.value)
    copyStatus.value = 'Copied'
  } catch {
    copyStatus.value = 'Could not copy'
  }
}

function completionExtensions() {
  return props.disabled
    ? []
    : autocompletion({
        activateOnTyping: true,
        override: [loraCompletionSource(props.loraSources)],
      })
}

onMounted(() => {
  if (!host.value) {
    return
  }
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: text.value,
      extensions: [
        EditorView.lineWrapping,
        tripleClickPhraseSelection(),
        promptSyntaxExtensions,
        tooltips({ parent: document.body, position: 'fixed' }),
        context.of(loraContextExtensions(props.loraSources, props.embeddingTokens)),
        completion.of(completionExtensions()),
        EditorView.contentAttributes.of({
          'aria-label': props.ariaLabel,
          'aria-multiline': 'true',
        }),
        editable.of([
          EditorState.readOnly.of(props.disabled),
          EditorView.editable.of(!props.disabled),
        ]),
        keymap.of([...promptAttentionKeymap, ...completionKeymap, ...defaultKeymap]),
        EditorView.domEventHandlers({
          blur() {
            focused.value = false
            emit('blur')
          },
          focus() {
            focused.value = true
            emit('focus')
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.selectionSet || update.docChanged) {
            const main = update.state.selection.main
            selection.value = { anchor: main.anchor, head: main.head }
          }
          if (update.docChanged && !syncingExternal) {
            copyStatus.value = ''
            text.value = update.state.doc.toString()
          }
        }),
      ],
    }),
  })
})

watch(
  () => props.disabled,
  (disabled) => {
    if (view) {
      closeCompletion(view)
    }
    view?.dispatch({
      effects: [
        editable.reconfigure([
          EditorState.readOnly.of(disabled),
          EditorView.editable.of(!disabled),
        ]),
        completion.reconfigure(completionExtensions()),
      ],
    })
  },
)

watch(
  () => JSON.stringify([props.loraSources, props.embeddingTokens]),
  () => {
    if (view) {
      closeCompletion(view)
      view.dispatch({
        effects: [
          context.reconfigure(loraContextExtensions(props.loraSources, props.embeddingTokens)),
          completion.reconfigure(completionExtensions()),
        ],
      })
    }
  },
)

watch(text, (next) => {
  if (!view || view.state.doc.toString() === next) {
    return
  }
  syncingExternal = true
  const selection = view.state.selection.main
  view.dispatch({
    annotations: Transaction.addToHistory.of(false),
    changes: { from: 0, insert: next, to: view.state.doc.length },
    filter: false,
    selection: {
      anchor: Math.min(selection.anchor, next.length),
      head: Math.min(selection.head, next.length),
    },
  })
  syncingExternal = false
})

onBeforeUnmount(() => {
  view?.destroy()
  view = null
})
</script>

<template>
  <section
    :aria-label="`${ariaLabel} editor`"
    class="prompt-editor"
    :class="{ 'prompt-editor-positive': polarity === 'positive', 'prompt-editor-focused': focused }"
  >
    <header class="prompt-heading">
      <strong>{{ ariaLabel }}</strong>
      <PromptEditorHelp
        completionSources="LoRA triggers"
        :editorFocused="focused"
        :title="ariaLabel"
        @focusEditor="focus"
      />
      <PromptDiagnosticsIndicator :report="syntaxReport" :title="ariaLabel" />
      <span class="copy-status" role="status">{{ copyStatus }}</span>
    </header>
    <div ref="host" class="prompt-host" />
    <PromptEditorActions
      :attentionTargetAvailable="attentionAvailable"
      class="prompt-actions"
      :disabled
      :dynamicPreviewAvailable
      :empty="!text"
      @browse="browse"
      @clear="clear"
      @copy="copy"
      @decrease="attention(-1)"
      @dynamicPreview="emit('dynamicPreview')"
      @increase="attention(1)"
    />
  </section>
</template>

<style scoped>
.prompt-editor {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 144px;
  max-height: 420px;
  padding: 5px;
  overflow: hidden;
  resize: vertical;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-surface);
}

.prompt-editor-positive {
  min-height: 214px;
}

.prompt-editor-focused {
  border-color: var(--app-tab-active-text);
}

.prompt-heading {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  padding-left: 3px;
}
.prompt-heading strong {
  font-size: var(--app-font-size);
  font-weight: 600;
}
.copy-status {
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}
.prompt-host {
  grid-column: 1;
  grid-row: 2;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.prompt-actions {
  grid-column: 2;
  grid-row: 1 / 3;
  align-self: start;
}

.prompt-editor :deep(.cm-editor) {
  height: 100%;
  color: var(--app-text);
  background: transparent;
  font-family: inherit;
  font-size: var(--app-font-size);
}

.prompt-editor :deep(.cm-editor.cm-focused) {
  outline: none;
}

.prompt-editor :deep(.cm-content) {
  min-height: 100%;
  padding: 3px;
  caret-color: var(--app-text);
}

.prompt-editor :deep(.cm-scroller) {
  min-height: 0;
  overflow: auto;
  font-family: inherit;
  line-height: 1.45;
}

.prompt-editor :deep(.cm-selectionBackground),
.prompt-editor :deep(.cm-focused .cm-selectionBackground) {
  background: var(--app-border);
}

.prompt-editor :deep(.cm-line) {
  padding: 0;
}

.prompt-editor :deep(.cm-prompt-lora-trigger) {
  border-radius: 2px;
  background: var(--prompt-context-surface);
  box-shadow: inset 0 -1px 0 var(--prompt-context-border);
}
</style>
