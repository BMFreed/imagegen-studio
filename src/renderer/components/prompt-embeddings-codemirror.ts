import { loraCompletionFragment } from '../../shared/projects/lora-triggers.js'
import {
  getPromptEmbeddingMatches,
  type PromptEmbeddingRef,
  type PromptEmbeddingSelection,
  type PromptEmbeddingSource,
  selectablePromptEmbeddingSources,
} from '../../shared/projects/prompt-embeddings.js'
import { normalizePromptSearchValue } from '../../shared/projects/prompt-text.js'

import { type CompletionSource, pickedCompletion } from '@codemirror/autocomplete'
import {
  EditorSelection,
  type EditorState,
  type Extension,
  StateEffect,
  StateField,
} from '@codemirror/state'
import { Decoration, EditorView, hoverTooltip } from '@codemirror/view'

export const selectPromptEmbedding = StateEffect.define<PromptEmbeddingSelection>()

export function embeddingCompletionSource(
  sources: PromptEmbeddingSource[],
  modelFamily: string | null,
): CompletionSource {
  const selectable = selectablePromptEmbeddingSources(sources, modelFamily)
  return (context) => {
    if (context.state.readOnly) {
      return null
    }
    const fragment = loraCompletionFragment(
      context.state.doc.toString(),
      context.pos,
      selectable.map((source) => ({
        id: source.resource.localVersionId,
        name: source.resource.displayName,
        phrases: [source.token, ...source.searchTerms],
      })),
    )
    const query = normalizePromptSearchValue(fragment.text)
    if (!context.explicit && query.length < 2) {
      return null
    }
    const rank = (source: PromptEmbeddingSource) => {
      const values = [source.token, ...source.searchTerms].map(normalizePromptSearchValue)
      if (!query || values.includes(query)) {
        return 0
      }
      if (values.some((value) => value.startsWith(query))) {
        return 1
      }
      return values.some((value) => value.includes(query)) ? 2 : Infinity
    }
    const entries = selectable
      .map((source) => ({ rank: rank(source), source }))
      .filter((entry) => Number.isFinite(entry.rank))
      .sort(
        (a, b) =>
          a.rank - b.rank ||
          a.source.token.localeCompare(b.source.token) ||
          a.source.resource.versionName.localeCompare(b.source.resource.versionName),
      )
      .slice(0, 5)
    return entries.length
      ? {
          filter: false,
          from: fragment.from,
          options: entries.map(({ source }) => ({
            apply(view, completion, from, to) {
              if (view.state.readOnly) {
                return
              }
              view.dispatch({
                annotations: pickedCompletion.of(completion),
                changes: { from, insert: source.token, to },
                effects: selectPromptEmbedding.of({
                  resourceId: source.resource.localModelId,
                  token: source.token,
                  versionId: source.resource.localVersionId,
                }),
                selection: EditorSelection.cursor(from + source.token.length),
                userEvent: 'input.complete',
              })
            },
            detail: `${source.resource.displayName} · ${source.resource.versionName}`,
            label: source.token,
            section: { name: 'Embeddings', rank: 2 },
            type: 'text',
          })),
        }
      : null
  }
}

export function embeddingContextExtensions(
  refs: PromptEmbeddingRef[],
  sources: PromptEmbeddingSource[],
  catalogReady: boolean,
  modelFamily: string | null,
): Extension {
  const matches = (text: string) =>
    getPromptEmbeddingMatches({ embeddingRefs: refs, text }, sources, catalogReady, modelFamily)
  const decorations = (state: EditorState) =>
    Decoration.set(
      matches(state.doc.toString()).map((match) =>
        Decoration.mark({
          class: match.status === 'ready' ? 'cm-prompt-embedding' : 'cm-prompt-embedding-warning',
        }).range(match.from, match.to),
      ),
      true,
    )
  return [
    StateField.define({
      create: decorations,
      provide: (field) => EditorView.decorations.from(field),
      update(value, transaction) {
        return transaction.docChanged ? decorations(transaction.state) : value
      },
    }),
    hoverTooltip((view, position) => {
      const match = matches(view.state.doc.toString()).find(
        (entry) => position >= entry.from && position < entry.to,
      )
      if (!match) {
        return null
      }
      return {
        create() {
          const dom = document.createElement('div')
          dom.className = 'prompt-resource-tooltip'
          const resource = match.ref?.resource ?? match.candidates[0]?.resource
          dom.textContent = [
            'Embedding',
            resource?.displayName,
            resource?.versionName,
            resource?.baseModelFamily ? `Base model: ${resource.baseModelFamily}` : null,
            `Activation: ${match.token}`,
            `Status: ${match.status}`,
          ]
            .filter(Boolean)
            .join(' · ')
          return { dom }
        },
        end: match.to,
        pos: match.from,
      }
    }),
  ]
}

export function promptEmbeddingDiagnosticReason(
  status: Exclude<ReturnType<typeof getPromptEmbeddingMatches>[number]['status'], 'ready'>,
): string {
  switch (status) {
    case 'ambiguous': {
      return 'Several installed versions use this token. Choose the exact version from autocomplete.'
    }
    case 'checking': {
      return 'Checking the model library.'
    }
    case 'corrupt': {
      return 'The exact installed file is damaged. Repair it in Model Manager.'
    }
    case 'missing': {
      return 'The exact embedding is missing. Restore it in Model Manager.'
    }
    case 'unbound': {
      return 'Choose this embedding from autocomplete to attach its exact version.'
    }
    case 'unlinked': {
      return 'The exact version is installed in this library. Link it explicitly.'
    }
    case 'unsupported': {
      return 'This embedding is not supported for the selected model family.'
    }
  }
}
