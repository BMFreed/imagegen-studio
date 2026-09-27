import { history, redo, undo } from '@codemirror/commands'
import { EditorSelection, EditorState } from '@codemirror/state'
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { attentionTransaction, clearPromptTransaction } from './prompt-editing-codemirror.js'

// The boundary is real CodeMirror transactions/history; no mock implements attention or undo.
test('attention and clear remain independent undoable transactions and preserve neighboring text', () => {
  let state = EditorState.create({
    doc: 'first, two words, last',
    extensions: [history()],
    selection: EditorSelection.single(16, 7),
  })
  const transaction = attentionTransaction(state, 1)
  assert.ok(transaction)
  state = transaction.state
  assert.equal(state.doc.toString(), 'first, (two words)+, last')
  assert.equal(state.selection.main.anchor, 19)
  assert.equal(state.selection.main.head, 7)
  assert.equal(
    undo({
      dispatch: (next) => {
        state = next.state
      },
      state,
    }),
    true,
  )
  assert.equal(state.doc.toString(), 'first, two words, last')
  assert.equal(
    redo({
      dispatch: (next) => {
        state = next.state
      },
      state,
    }),
    true,
  )
  const clear = clearPromptTransaction(state)
  assert.ok(clear)
  state = clear.state
  assert.equal(state.doc.toString(), '')
  assert.equal(
    undo({
      dispatch: (next) => {
        state = next.state
      },
      state,
    }),
    true,
  )
  assert.equal(state.doc.toString(), 'first, (two words)+, last')
})

test('read-only and empty-phrase controls do not produce attention or clear edits', () => {
  const locked = EditorState.create({
    doc: 'editable words',
    extensions: [EditorState.readOnly.of(true)],
  })
  assert.equal(attentionTransaction(locked, 1), null)
  assert.equal(attentionTransaction(locked, -1), null)
  assert.equal(clearPromptTransaction(locked), null)
  const empty = EditorState.create({ doc: 'first,  , last', selection: EditorSelection.cursor(7) })
  assert.equal(attentionTransaction(empty, 1), null)
  assert.equal(clearPromptTransaction(EditorState.create()), null)
})
