<script setup lang="ts">
import { autocompletion, completionKeymap, startCompletion } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { Compartment, EditorSelection, EditorState, type StateEffect } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { DanbooruTagMock } from './generation-prompt.utils'
import type {
  GenerationEmbeddingResourceRef,
  GenerationLora,
  GenerationPrompt,
  GenerationPromptPolarity,
  GenerationPromptSelection,
} from './generation.types'

import {
  addPromptEmbeddingEffect,
  createPromptCompletionSource,
  createPromptResourceExtensions,
  promptTooltipParent,
  tripleClickPhraseSelection,
} from './generation-prompt-codemirror'
import {
  adjustPromptAttention,
  findTopLevelPromptPhraseRange,
  getPromptEmbeddingMatches,
  reconcilePromptEmbeddingRefs,
} from './generation-prompt.utils'

export type PromptEditorHistoryMode = 'external' | 'local'
export interface GenerationPromptEditorHandle {
  applyAttention(direction: -1 | 1): boolean
  focus(): void
  openAutocomplete(): void
}

const props = withDefaults(
  defineProps<{
    ariaLabel: string
    danbooruTags: DanbooruTagMock[]
    disabled?: boolean
    embeddings: GenerationEmbeddingResourceRef[]
    historyMode: PromptEditorHistoryMode
    loras: GenerationLora[]
    minimumLines?: number
    polarity: GenerationPromptPolarity
  }>(),
  { minimumLines: 4 },
)
const emit = defineEmits<{ blur: []; focus: [] }>()
const prompt = defineModel<GenerationPrompt>({ required: true })
const selection = defineModel<GenerationPromptSelection>('selection', {
  default: () => ({ anchor: 0, head: 0 }),
})
const host = ref<HTMLElement>()
const readOnlyCompartment = new Compartment()
const resourcesCompartment = new Compartment()
const autocompleteCompartment = new Compartment()
let view: EditorView | undefined
let syncingExternal = false

const matches = computed(() => getPromptEmbeddingMatches(prompt.value, props.embeddings))
const missingMatches = computed(() => matches.value.filter((match) => match.ref?.resource.missing))
const ambiguousMatches = computed(() => matches.value.filter((match) => match.ambiguous))

const completionSource = createPromptCompletionSource({
  danbooruTags: () => props.danbooruTags,
  embeddings: () => props.embeddings,
  loras: () => props.loras,
  polarity: () => props.polarity,
})

function resourceExtensions() {
  return createPromptResourceExtensions({
    embeddings: props.embeddings,
    loras: props.loras,
    prompt: {
      ...prompt.value,
      text: view?.state.doc.toString() ?? prompt.value.text,
    },
  })
}

function reconcileUpdate(nextText: string, transactionEffects: readonly StateEffect<unknown>[]) {
  const selectedEmbedding = transactionEffects
    .map((effect) => (effect.is(addPromptEmbeddingEffect) ? effect.value : undefined))
    .find(Boolean)
  const refs = selectedEmbedding
    ? [...prompt.value.embeddingRefs, selectedEmbedding]
    : prompt.value.embeddingRefs
  return reconcilePromptEmbeddingRefs({ embeddingRefs: refs, text: nextText }, props.embeddings)
}

function createView() {
  if (!host.value) {
    return
  }
  const initialSelection = clampSelection(selection.value, prompt.value.text.length)
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: prompt.value.text,
      extensions: [
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({
          'aria-label': props.ariaLabel,
          'aria-multiline': 'true',
        }),
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-content': { minHeight: `calc(${props.minimumLines} * 20px)` },
          '.cm-scroller': { fontFamily: 'inherit', lineHeight: '20px', overflow: 'auto' },
        }),
        tripleClickPhraseSelection(),
        promptTooltipParent(),
        readOnlyCompartment.of([
          EditorState.readOnly.of(Boolean(props.disabled)),
          EditorView.editable.of(!props.disabled),
        ]),
        resourcesCompartment.of(resourceExtensions()),
        autocompleteCompartment.of(
          autocompletion({ activateOnTyping: true, override: [completionSource] }),
        ),
        keymap.of([
          ...completionKeymap,
          ...(props.historyMode === 'local' ? historyKeymap : []),
          ...defaultKeymap,
        ]),
        ...(props.historyMode === 'local' ? [history()] : []),
        EditorView.domEventHandlers({
          blur() {
            emit('blur')
          },
          focus() {
            emit('focus')
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !syncingExternal) {
            prompt.value = reconcileUpdate(
              update.state.doc.toString(),
              update.transactions.flatMap((transaction) => transaction.effects),
            )
            reconfigureResources()
          }
          if (update.selectionSet || update.docChanged) {
            const main = update.state.selection.main
            selection.value = { anchor: main.anchor, head: main.head }
          }
        }),
      ],
      selection: EditorSelection.single(initialSelection.anchor, initialSelection.head),
    }),
  })
}

function reconfigureResources() {
  if (!view) {
    return
  }
  view.dispatch({ effects: resourcesCompartment.reconfigure(resourceExtensions()) })
}

function applyAttention(direction: -1 | 1) {
  if (!view) {
    return false
  }
  const current = view.state.selection.main
  const result = adjustPromptAttention(
    view.state.doc.toString(),
    { anchor: current.anchor, head: current.head },
    direction,
  )
  if (result.text === view.state.doc.toString()) {
    return false
  }
  view.dispatch({
    changes: { from: 0, insert: result.text, to: view.state.doc.length },
    selection: EditorSelection.single(result.selection.anchor, result.selection.head),
  })
  return true
}

function focus() {
  view?.focus()
}

function openAutocomplete() {
  if (view) {
    view.focus()
    startCompletion(view)
  }
}

defineExpose<GenerationPromptEditorHandle>({ applyAttention, focus, openAutocomplete })

watch(
  () => prompt.value,
  (next) => {
    if (!view || view.state.doc.toString() === next.text) {
      reconfigureResources()
      return
    }
    syncingExternal = true
    const current = view.state.selection.main
    view.dispatch({
      changes: { from: 0, insert: next.text, to: view.state.doc.length },
      selection: EditorSelection.single(
        Math.min(current.anchor, next.text.length),
        Math.min(current.head, next.text.length),
      ),
    })
    syncingExternal = false
    reconfigureResources()
  },
  { deep: true },
)

watch(
  () => [props.disabled, props.ariaLabel],
  () => {
    view?.dispatch({
      effects: readOnlyCompartment.reconfigure([
        EditorState.readOnly.of(Boolean(props.disabled)),
        EditorView.editable.of(!props.disabled),
        EditorView.contentAttributes.of({
          'aria-label': props.ariaLabel,
          'aria-multiline': 'true',
        }),
      ]),
    })
  },
)

watch(
  () => [props.embeddings, props.loras, props.polarity, props.danbooruTags],
  () => {
    reconfigureResources()
    view?.dispatch({
      effects: autocompleteCompartment.reconfigure(
        autocompletion({ activateOnTyping: true, override: [completionSource] }),
      ),
    })
  },
  { deep: true },
)

watch(
  () => selection.value,
  (next) => {
    if (!view) {
      return
    }
    const current = view.state.selection.main
    const clamped = clampSelection(next, view.state.doc.length)
    if (current.anchor === clamped.anchor && current.head === clamped.head) {
      return
    }
    view.dispatch({ selection: EditorSelection.single(clamped.anchor, clamped.head) })
  },
  { deep: true },
)

onMounted(createView)
onBeforeUnmount(() => view?.destroy())

function clampSelection(value: GenerationPromptSelection, length: number) {
  return {
    anchor: Math.max(0, Math.min(length, value.anchor)),
    head: Math.max(0, Math.min(length, value.head)),
  }
}

function attentionTargetAvailable() {
  if (!view) {
    return false
  }
  const main = view.state.selection.main
  if (!main.empty) {
    return true
  }
  const range = findTopLevelPromptPhraseRange(view.state.doc.toString(), main.head)
  return Boolean(view.state.doc.sliceString(range.from, range.to).trim())
}
void attentionTargetAvailable
</script>

<template>
  <div
    class="generation-prompt-editor"
    :class="{ 'generation-prompt-editor--disabled': disabled }"
    :style="{ '--prompt-minimum-lines': minimumLines }"
  >
    <div ref="host" class="generation-prompt-editor__host" />
    <div
      v-if="missingMatches.length || ambiguousMatches.length"
      class="prompt-diagnostics"
      role="status"
    >
      <span v-if="missingMatches.length">
        Missing embedding: {{ missingMatches.map((match) => match.ref?.resource.name).join(', ') }}.
      </span>
      <span v-if="ambiguousMatches.length">
        Ambiguous embedding token {{ ambiguousMatches.map((match) => match.token).join(', ') }}.
        Choose a resource from prompt suggestions.
      </span>
    </div>
  </div>
</template>

<style scoped>
.generation-prompt-editor {
  min-height: calc(var(--prompt-minimum-lines) * 20px + 18px);
  max-height: 420px;
  overflow: hidden;
  resize: vertical;
  color: var(--app-text);
}
.generation-prompt-editor__host {
  height: 100%;
  min-height: inherit;
}
.generation-prompt-editor--disabled {
  resize: none;
  opacity: 0.7;
}
.prompt-diagnostics {
  display: grid;
  gap: 2px;
  padding: 4px 8px 5px;
  color: var(--status-warning-text, var(--status-warning));
  font-size: var(--app-font-size-meta);
}
:deep(.cm-editor) {
  min-height: inherit;
  outline: none;
  background: transparent;
}
:deep(.cm-content) {
  padding: 26px 34px 8px 8px;
  caret-color: var(--app-text);
}
:deep(.cm-focused .cm-selectionBackground),
:deep(.cm-selectionBackground) {
  background: var(--app-selection) !important;
}
:deep(.cm-cursor) {
  border-left-color: var(--app-text);
}
:deep(.cm-prompt-embedding) {
  border-radius: 3px;
  background: var(--prompt-resource-surface);
  box-shadow: inset 0 -1px 0 var(--prompt-resource-border);
}
:deep(.cm-prompt-embedding--missing) {
  background: var(--prompt-warning-surface);
  box-shadow: inset 0 -2px 0 var(--status-warning);
}
:deep(.cm-prompt-embedding--ambiguous) {
  text-decoration: underline wavy var(--status-warning);
  text-underline-offset: 2px;
}
:deep(.cm-prompt-lora-trigger) {
  border-radius: 2px;
  background: var(--prompt-context-surface);
  box-shadow: inset 0 -1px 0 var(--prompt-context-border);
}
</style>
