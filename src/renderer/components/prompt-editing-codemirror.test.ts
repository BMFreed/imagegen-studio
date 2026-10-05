import { compileAnimaPromptWeighting } from '../../shared/projects/anima-prompt-weighting.js'

import type { EditorView } from '@codemirror/view'

import { history, redo, undo } from '@codemirror/commands'
import { Compartment, EditorSelection, EditorState } from '@codemirror/state'
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  promptModelFamily,
  promptSyntaxExtensions,
  promptSyntaxField,
} from './prompt-diagnostics-codemirror.js'
import {
  attentionTransaction,
  clearPromptTransaction,
  createPromptAttentionKeymap,
} from './prompt-editing-codemirror.js'

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

test('Anima transaction preserves reversed selection, neighboring text and actual history', () => {
  let state = EditorState.create({
    doc: 'left, (word:2), right',
    extensions: [history(), promptSyntaxExtensions, promptModelFamily.of('anima')],
    selection: EditorSelection.single(14, 6),
  })
  const next = attentionTransaction(state, 1, 'anima')
  assert.ok(next?.docChanged)
  state = next.state
  assert.equal(state.doc.toString(), 'left, (word:2.1), right')
  assert.equal(state.selection.main.anchor, 16)
  assert.equal(state.selection.main.head, 6)
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
  assert.equal(state.doc.toString(), 'left, (word:2), right')
  assert.equal(
    redo({
      dispatch: (transaction) => {
        state = transaction.state
      },
      state,
    }),
    true,
  )
  assert.equal(state.doc.toString(), 'left, (word:2.1), right')
})

test('actual key binding commands read the current family for both directions', () => {
  let family: string | null = null
  const compartment = new Compartment()
  let state = EditorState.create({
    doc: '(word:2)',
    extensions: [promptSyntaxExtensions, compartment.of(promptModelFamily.of(family))],
    selection: EditorSelection.single(0, 8),
  })
  const bindings = createPromptAttentionKeymap(() => family)
  // Only DOM transport is replaced. Commands, state, transactions and diagnostics remain actual.
  const transport = {
    dispatch(transaction: ReturnType<EditorState['update']>) {
      state = transaction.state
    },
    get state() {
      return state
    },
  } as EditorView
  family = 'anima'
  state = state.update({ effects: compartment.reconfigure(promptModelFamily.of(family)) }).state
  assert.equal(bindings[0]?.run?.(transport), true)
  assert.deepEqual(
    compileAnimaPromptWeighting(state.doc.toString()).spans.map((span) => span.weight),
    [2.1],
  )
  assert.equal(bindings[1]?.run?.(transport), true)
  assert.deepEqual(
    compileAnimaPromptWeighting(state.doc.toString()).spans.map((span) => span.weight),
    [2],
  )
  family = 'illustrious'
  state = state.update({ effects: compartment.reconfigure(promptModelFamily.of(family)) }).state
  assert.equal(bindings[0]?.run?.(transport), true)
  assert.equal(state.doc.toString(), '(word:2)+')
  assert.deepEqual(state.field(promptSyntaxField).items, [])
})

test('partial selection refusal is a transient visible report and creates no history edit', () => {
  const family = new Compartment()
  let state = EditorState.create({
    doc: '(word:2)',
    extensions: [history(), promptSyntaxExtensions, family.of(promptModelFamily.of('anima'))],
    selection: EditorSelection.single(1, 7),
  })
  assert.deepEqual(state.field(promptSyntaxField).items, [])
  const refused = attentionTransaction(state, 1, 'anima')
  assert.ok(refused)
  assert.equal(refused.docChanged, false)
  state = refused.state
  assert.equal(state.doc.toString(), '(word:2)')
  assert.equal(state.selection.main.anchor, 1)
  assert.equal(state.selection.main.head, 7)
  assert.match(state.field(promptSyntaxField).items[0]?.message ?? '', /selection cuts/)
  assert.equal(
    undo({
      dispatch: (transaction) => {
        state = transaction.state
      },
      state,
    }),
    false,
  )
  state = state.update({ selection: EditorSelection.single(0, 8) }).state
  assert.deepEqual(state.field(promptSyntaxField).items, [])
  state = state.update({ selection: EditorSelection.single(1, 7) }).state
  state = attentionTransaction(state, -1, 'anima')!.state
  state = state.update({ effects: family.reconfigure(promptModelFamily.of('illustrious')) }).state
  assert.deepEqual(state.field(promptSyntaxField).items, [])
})

test('selection refusal stays visible within the existing 100-item diagnostics ceiling', () => {
  const prefix = '(word:abc), '.repeat(100)
  const state = EditorState.create({
    doc: `${prefix}(word:2)`,
    extensions: [promptSyntaxExtensions, promptModelFamily.of('anima')],
    selection: EditorSelection.single(prefix.length + 1, prefix.length + 7),
  })
  const initial = state.field(promptSyntaxField)
  assert.equal(initial.items.length, 100)
  const refused = attentionTransaction(state, 1, 'anima')
  assert.ok(refused)
  const report = refused.state.field(promptSyntaxField)
  assert.equal(report.items.length, 100)
  assert.equal(report.items.at(-1)?.code, 'anima-selection')
  assert.equal(report.truncated, true)
  const cleared = refused.state.update({ selection: EditorSelection.cursor(0) }).state
  assert.deepEqual(cleared.field(promptSyntaxField), initial)
})
