import {
  adjustPromptAttention,
  findTopLevelPromptPhraseRange,
} from '../../shared/projects/prompt-text.js'

import { isolateHistory } from '@codemirror/commands'
import {
  EditorSelection,
  type EditorState,
  type Extension,
  type Transaction,
} from '@codemirror/state'
import { EditorView, type KeyBinding } from '@codemirror/view'

export function attentionTransaction(state: EditorState, direction: -1 | 1): Transaction | null {
  if (state.readOnly) {
    return null
  }
  const before = state.doc.toString()
  const main = state.selection.main
  const result = adjustPromptAttention(before, { anchor: main.anchor, head: main.head }, direction)
  if (result.text === before) {
    return null
  }
  // Keep untouched text outside the transaction's change range.
  let from = 0
  while (from < before.length && from < result.text.length && before[from] === result.text[from]) {
    from += 1
  }
  let to = before.length
  let end = result.text.length
  while (to > from && end > from && before[to - 1] === result.text[end - 1]) {
    to -= 1
    end -= 1
  }
  return state.update({
    annotations: isolateHistory.of('full'),
    changes: { from, insert: result.text.slice(from, end), to },
    scrollIntoView: true,
    selection: EditorSelection.single(result.selection.anchor, result.selection.head),
    userEvent: 'input.prompt-attention',
  })
}

export function applyPromptAttention(view: EditorView, direction: -1 | 1): boolean {
  const transaction = attentionTransaction(view.state, direction)
  if (!transaction) {
    return false
  }
  view.dispatch(transaction)
  return true
}

export const promptAttentionKeymap: readonly KeyBinding[] = [
  { key: 'Mod-ArrowUp', run: (view) => applyPromptAttention(view, 1) },
  { key: 'Mod-ArrowDown', run: (view) => applyPromptAttention(view, -1) },
]

export function clearPromptTransaction(state: EditorState): Transaction | null {
  return state.readOnly || !state.doc.length
    ? null
    : state.update({
        annotations: isolateHistory.of('full'),
        changes: { from: 0, insert: '', to: state.doc.length },
        selection: EditorSelection.cursor(0),
        userEvent: 'input.prompt-clear',
      })
}

export function tripleClickPhraseSelection(): Extension {
  return EditorView.mouseSelectionStyle.of((view, event) => {
    if (event.detail !== 3 || event.shiftKey) {
      return null
    }
    const position = view.posAtCoords({ x: event.clientX, y: event.clientY })
    if (position === null) {
      return null
    }
    return {
      get() {
        const range = findTopLevelPromptPhraseRange(view.state.doc.toString(), position)
        return EditorSelection.single(range.from, range.to)
      },
      update() {},
    }
  })
}
