import type { PromptEmbeddingSource } from '../../shared/projects/prompt-embeddings.js'

import { CompletionContext } from '@codemirror/autocomplete'
import { EditorState, type TransactionSpec } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  embeddingCompletionSource,
  embeddingContextExtensions,
  selectPromptEmbedding,
} from './prompt-embeddings-codemirror.js'

function source(
  id: string,
  token = '<soft_light>',
  fileStatus: PromptEmbeddingSource['fileStatus'] = 'ready',
): PromptEmbeddingSource {
  return {
    fileStatus,
    resource: {
      baseModelFamily: 'illustrious',
      civitaiFileId: 30,
      civitaiModelId: 10,
      civitaiVersionId: 20,
      displayName: 'Soft light',
      fileSha256: 'a'.repeat(64),
      kind: 'embedding',
      localModelId: id,
      localVersionId: `${id}-version`,
      predictionType: null,
      versionName: id,
    },
    searchTerms: ['Soft light', 'rim light'],
    token,
  }
}

test('real embedding completion source ranks metadata search, bounds section and filters unsupported/missing choices', async () => {
  const candidates = Array.from({ length: 7 }, (_, index) => source(`v${index}`))
  const complete = embeddingCompletionSource(
    [...candidates, source('missing', '<missing>', 'missing')],
    'illustrious',
  )
  const context = (text: string, explicit: boolean, readOnly = false) =>
    new CompletionContext(
      EditorState.create({ doc: text, extensions: [EditorState.readOnly.of(readOnly)] }),
      text.length,
      explicit,
    )
  assert.equal(await complete(context('s', false)), null)
  const browse = await complete(context('', true))
  assert.equal(browse?.options.length, 5)
  assert.equal(
    browse?.options[0].section && typeof browse.options[0].section === 'object'
      ? browse.options[0].section.name
      : null,
    'Embeddings',
  )
  assert.equal(await complete(context('soft li', true, true)), null)
  assert.equal(await embeddingCompletionSource(candidates, 'anima')(context('', true)), null)
  const result = await complete(context('portrait, rim li', false))
  assert.equal(result?.from, 10)
  assert.equal(result?.options[0].label, '<soft_light>')
})

test('completion transaction carries exact IDs via real StateEffect and changes only the active fragment', async () => {
  const candidates = [source('v1'), source('v2')]
  let state = EditorState.create({ doc: 'portrait, soft li, background' })
  const result = await embeddingCompletionSource(
    candidates,
    'illustrious',
  )(new CompletionContext(state, 17, true))
  assert.ok(result)
  const option = result.options.find((item) => item.detail?.endsWith('v2'))
  assert.ok(option && typeof option.apply === 'function')
  const transitions: ReturnType<EditorState['update']>[] = []
  // Only the DOM host is omitted: production apply builds the real CodeMirror transaction.
  const view = {
    dispatch: (specification: TransactionSpec) => {
      const transaction = state.update(specification)
      transitions.push(transaction)
      state = transaction.state
    },
    get state() {
      return state
    },
  } as unknown as EditorView
  option.apply(view, option, result.from, 17)
  assert.equal(state.doc.toString(), 'portrait, <soft_light>, background')
  assert.equal(state.selection.main.head, 22)
  const effects = transitions[0].effects.filter((effect) => effect.is(selectPromptEmbedding))
  assert.deepEqual(
    effects.map((effect) => effect.value),
    [{ resourceId: 'v2', token: '<soft_light>', versionId: 'v2-version' }],
  )
  assert.equal(
    Object.keys(effects[0].value).length,
    3,
    'No renderer metadata or path crosses the effect',
  )
  state = EditorState.create({
    doc: state.doc.toString(),
    extensions: [EditorState.readOnly.of(true)],
  })
  option.apply(view, option, result.from, 17)
  assert.equal(transitions.length, 1)
})

test('same-text collision selection still emits an exact resource effect without requiring a document change', async () => {
  const candidates = [source('v1'), source('v2')]
  let state = EditorState.create({ doc: '<soft_light>' })
  const result = await embeddingCompletionSource(
    candidates,
    'illustrious',
  )(new CompletionContext(state, state.doc.length, true))
  assert.ok(result)
  const option = result.options[1]
  assert.equal(typeof option.apply, 'function')
  let selected: unknown
  const view = {
    dispatch: (specification: TransactionSpec) => {
      const transaction = state.update(specification)
      selected = transaction.effects.find((effect) => effect.is(selectPromptEmbedding))?.value
      state = transaction.state
    },
    get state() {
      return state
    },
  } as unknown as EditorView
  if (typeof option.apply === 'function') {
    option.apply(view, option, result.from, state.doc.length)
  }
  assert.equal(state.doc.toString(), '<soft_light>')
  assert.deepEqual(selected, { resourceId: 'v2', token: '<soft_light>', versionId: 'v2-version' })
})

test('real CodeMirror decoration field follows case-sensitive text and saved identity precedence', () => {
  const a = source('v1')
  const b = source('v2')
  const decorations = (state: EditorState) => {
    const marks: { class: string; text: string }[] = []
    for (const set of state.facet(EditorView.decorations)) {
      if (typeof set !== 'function') {
        set.between(0, state.doc.length, (from, to, mark) => {
          marks.push({ class: mark.spec.class, text: state.sliceDoc(from, to) })
        })
      }
    }
    return marks
  }
  let state = EditorState.create({
    doc: '<soft_light>',
    extensions: [
      embeddingContextExtensions(
        [{ resource: a.resource, token: a.token }],
        [a, b],
        true,
        'illustrious',
      ),
    ],
  })
  assert.deepEqual(decorations(state), [{ class: 'cm-prompt-embedding', text: '<soft_light>' }])
  state = state.update({ changes: { from: 0, insert: '<SOFT_LIGHT>', to: state.doc.length } }).state
  assert.deepEqual(decorations(state), [])
  const ambiguous = EditorState.create({
    doc: a.token,
    extensions: [embeddingContextExtensions([], [a, b], true, 'illustrious')],
  })
  assert.deepEqual(decorations(ambiguous), [
    { class: 'cm-prompt-embedding-warning', text: a.token },
  ])
  const missing = EditorState.create({
    doc: a.token,
    extensions: [
      embeddingContextExtensions(
        [{ resource: a.resource, token: a.token }],
        [],
        true,
        'illustrious',
      ),
    ],
  })
  assert.deepEqual(decorations(missing), [{ class: 'cm-prompt-embedding-warning', text: a.token }])
})
