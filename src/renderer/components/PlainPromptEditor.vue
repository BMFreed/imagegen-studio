<script setup lang="ts">
import type { LoraTriggerSource } from '../../shared/projects/lora-triggers.js'

import { autocompletion, closeCompletion, completionKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { Compartment, EditorState, Transaction } from '@codemirror/state'
import { EditorView, keymap, tooltips } from '@codemirror/view'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { loraCompletionSource, loraContextExtensions } from './prompt-lora-codemirror.js'

const props = defineProps<{
  ariaLabel: string
  disabled: boolean
  embeddingTokens: string[]
  loraSources: LoraTriggerSource[]
}>()
const text = defineModel<string>({ required: true })
const host = ref<HTMLElement | null>(null)
const editable = new Compartment()
const context = new Compartment()
const completion = new Compartment()
let view: EditorView | null = null
let syncingExternal = false

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
        history(),
        keymap.of([...completionKeymap, ...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !syncingExternal) {
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
  <div ref="host" class="prompt-editor" />
</template>

<style scoped>
.prompt-editor {
  min-height: 76px;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-elevated);
}

.prompt-editor:focus-within {
  border-color: var(--app-tab-active-text);
}

.prompt-editor :deep(.cm-editor) {
  min-height: 76px;
  color: var(--app-text);
  background: transparent;
  font-family: inherit;
  font-size: var(--app-font-size);
}

.prompt-editor :deep(.cm-editor.cm-focused) {
  outline: none;
}

.prompt-editor :deep(.cm-content) {
  min-height: 76px;
  padding: 7px 8px;
  caret-color: var(--app-text);
}

.prompt-editor :deep(.cm-scroller) {
  max-height: 180px;
  overflow: auto;
  font-family: inherit;
  line-height: 1.45;
}

.prompt-editor :deep(.cm-selectionBackground),
.prompt-editor :deep(.cm-focused .cm-selectionBackground) {
  background: var(--app-border);
}

.prompt-editor :deep(.cm-prompt-lora-trigger) {
  border-radius: 2px;
  background: var(--prompt-context-surface);
  box-shadow: inset 0 -1px 0 var(--prompt-context-border);
}
</style>
