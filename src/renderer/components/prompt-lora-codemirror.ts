import {
  loraCompletionFragment,
  type LoraTriggerSource,
  matchLoraTriggers,
  suggestLoraTriggers,
} from '../../shared/projects/lora-triggers.js'
import { normalizePromptSearchValue } from '../../shared/projects/prompt-text.js'

import type { EditorState } from '@codemirror/state'

import { type CompletionSource, pickedCompletion } from '@codemirror/autocomplete'
import { EditorSelection, type Extension, StateField } from '@codemirror/state'
import { Decoration, EditorView, hoverTooltip } from '@codemirror/view'

export function loraCompletionSource(sources: LoraTriggerSource[]): CompletionSource {
  return (context) => {
    if (context.state.readOnly) {
      return null
    }
    const fragment = loraCompletionFragment(context.state.doc.toString(), context.pos, sources)
    if (!context.explicit && normalizePromptSearchValue(fragment.text).length < 2) {
      return null
    }
    const options = suggestLoraTriggers(fragment.text, sources)
    return options.length
      ? {
          filter: false,
          from: fragment.from,
          options: options.map((group) => ({
            apply(view, completion, from, to) {
              if (view.state.readOnly) {
                return
              }
              view.dispatch({
                annotations: pickedCompletion.of(completion),
                changes: { from, insert: group.phrase, to },
                selection: EditorSelection.cursor(from + group.phrase.length),
                userEvent: 'input.complete',
              })
            },
            detail: group.sources
              .map((source) => [source.name, source.version].filter(Boolean).join(' · '))
              .join(', '),
            label: group.phrase,
            section: { name: 'Active LoRA triggers', rank: 1 },
            type: 'text',
          })),
        }
      : null
  }
}

export function loraContextExtensions(
  sources: LoraTriggerSource[],
  embeddingTokens: string[],
): Extension {
  // Existing embedding sidecars own these ranges even when their files are missing.
  const matches = (text: string) => {
    const occupied = embeddingTokens.filter(Boolean).flatMap((token) => {
      const ranges: { from: number; to: number }[] = []
      let from = text.indexOf(token)
      while (from >= 0) {
        ranges.push({ from, to: from + token.length })
        from = text.indexOf(token, from + token.length)
      }
      return ranges
    })
    return matchLoraTriggers(text, sources).filter(
      (match) => !occupied.some((range) => match.from < range.to && match.to > range.from),
    )
  }
  const decorations = (state: EditorState) =>
    Decoration.set(
      matches(state.doc.toString()).map((match) =>
        Decoration.mark({ class: 'cm-prompt-lora-trigger' }).range(match.from, match.to),
      ),
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
        (item) => position >= item.from && position < item.to,
      )
      return match
        ? {
            create() {
              const dom = document.createElement('div')
              dom.className = 'prompt-resource-tooltip'
              dom.textContent = `LoRA · Trigger: ${match.phrase} · Sources: ${match.sources.map((source) => [source.name, source.version].filter(Boolean).join(' ')).join(', ')}`
              return { dom }
            },
            end: match.to,
            pos: match.from,
          }
        : null
    }),
  ]
}
