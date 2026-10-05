import { history, undo } from '@codemirror/commands'
import { Compartment, EditorSelection, EditorState } from '@codemirror/state'
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  promptAttentionAdvisory,
  promptModelFamily,
  promptSyntaxExtensions,
  promptSyntaxField,
} from './prompt-diagnostics-codemirror.js'
import { attentionTransaction } from './prompt-editing-codemirror.js'

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

test('family-aware real diagnostics explain operator conflicts and clear on family changes', () => {
  const family = new Compartment()
  let state = EditorState.create({
    doc: '(word:2)+, word+-',
    extensions: [promptSyntaxExtensions, family.of(promptModelFamily.of('illustrious'))],
    selection: EditorSelection.cursor(4),
  })
  assert.deepEqual(state.field(promptSyntaxField).items, [])
  state = state.update({ effects: family.reconfigure(promptModelFamily.of('anima')) }).state
  const report = state.field(promptSyntaxField)
  assert.ok(report.items.some((item) => /conflicting operators/.test(item.message)))
  assert.ok(report.items.some((item) => /mixes increase and decrease/.test(item.message)))
  assert.equal(state.doc.toString(), '(word:2)+, word+-')
  assert.equal(state.selection.main.head, 4)
  state = state.update({ effects: family.reconfigure(promptModelFamily.of(null)) }).state
  assert.deepEqual(state.field(promptSyntaxField).items, [])
})

test('refused attention keeps one static warning and clears only a distinct transient advisory', () => {
  const family = new Compartment()
  let state = EditorState.create({
    doc: '(word:2)+',
    extensions: [history(), promptSyntaxExtensions, family.of(promptModelFamily.of('anima'))],
    selection: EditorSelection.single(0, 9),
  })
  const initial = state.field(promptSyntaxField)
  assert.equal(initial.items.length, 1)
  assert.match(initial.items[0]!.message, /conflicting operators/)
  for (const direction of [1, -1] as const) {
    const refused = attentionTransaction(state, direction, 'anima')
    assert.ok(refused)
    assert.equal(refused.docChanged, false)
    state = refused.state
    assert.deepEqual(state.field(promptSyntaxField), initial)
  }
  assert.equal(state.doc.toString(), '(word:2)+')
  assert.equal(state.selection.main.anchor, 0)
  assert.equal(state.selection.main.head, 9)
  state = state.update({
    effects: promptAttentionAdvisory.of({
      from: initial.items[0]!.from,
      message: 'The selection cuts an Anima attention operator.',
      to: initial.items[0]!.to,
    }),
  }).state
  assert.equal(state.field(promptSyntaxField).items.length, 2)
  assert.equal(state.field(promptSyntaxField).items.at(-1)?.code, 'anima-selection')
  state = state.update({ selection: EditorSelection.cursor(4) }).state
  assert.deepEqual(state.field(promptSyntaxField), initial)
  assert.equal(
    undo({
      dispatch: (transaction) => {
        state = transaction.state
      },
      state,
    }),
    false,
  )
  state = state.update({ effects: family.reconfigure(promptModelFamily.of('illustrious')) }).state
  assert.deepEqual(state.field(promptSyntaxField).items, [])
})
