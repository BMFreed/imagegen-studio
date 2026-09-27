import { history, undo } from '@codemirror/commands'
import { EditorSelection, EditorState } from '@codemirror/state'
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { promptSyntaxExtensions, promptSyntaxField } from './prompt-diagnostics-codemirror.js'

test('real editor diagnostics track edits and undo without inserting text or moving the selection', () => {
  let state = EditorState.create({
    doc: '(light',
    extensions: [promptSyntaxExtensions, history()],
    selection: EditorSelection.cursor(3),
  })
  assert.equal(state.field(promptSyntaxField).items[0]?.code, 'unclosed-bracket')
  assert.equal(state.doc.toString(), '(light')
  assert.equal(state.selection.main.head, 3)
  const before = state.field(promptSyntaxField)
  state = state.update({ selection: EditorSelection.cursor(6) }).state
  assert.equal(state.field(promptSyntaxField), before, 'selection-only changes retain the report')
  state = state.update({ changes: { from: 6, insert: ')' } }).state
  assert.equal(state.doc.toString(), '(light)')
  assert.deepEqual(state.field(promptSyntaxField).items, [])
  assert.equal(
    undo({
      dispatch: (transaction) => {
        state = transaction.state
      },
      state,
    }),
    true,
  )
  assert.equal(state.doc.toString(), '(light')
  assert.equal(state.field(promptSyntaxField).items[0]?.code, 'unclosed-bracket')
  state = state.update({ changes: { from: 0, insert: 'normal', to: state.doc.length } }).state
  assert.deepEqual(state.field(promptSyntaxField).items, [])
})

test('read-only editor still explains syntax without creating edits', () => {
  const state = EditorState.create({
    doc: '(light:abc)',
    extensions: [promptSyntaxExtensions, EditorState.readOnly.of(true)],
  })
  assert.equal(state.readOnly, true)
  assert.equal(state.field(promptSyntaxField).items[0]?.severity, 'warning')
  assert.equal(state.doc.toString(), '(light:abc)')
})
