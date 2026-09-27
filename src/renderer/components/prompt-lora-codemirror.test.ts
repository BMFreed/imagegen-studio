import { CompletionContext } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loraCompletionSource, loraContextExtensions } from './prompt-lora-codemirror.js'

const sources = [{ id: 'one', name: 'Painter', phrases: ['soft lighting', '<style>'] }]

test('real CodeMirror completion source enforces typing threshold, explicit browse and read-only', async () => {
  const source = loraCompletionSource(sources)
  const complete = (doc: string, explicit: boolean, readOnly = false) =>
    source(
      new CompletionContext(
        EditorState.create({ doc, extensions: [EditorState.readOnly.of(readOnly)] }),
        doc.length,
        explicit,
      ),
    )
  assert.equal(await complete('s', false), null)
  assert.equal((await complete('', true))?.options.length, 2)
  assert.equal(await complete('soft li', true, true), null)
  const result = await complete('portrait, soft li', false)
  assert.equal(result?.from, 10)
  assert.deepEqual(
    result?.options.map((option) => option.label),
    ['soft lighting'],
  )
})

test('CodeMirror decorations update with document edits and yield ranges to embedding sidecars', () => {
  let state = EditorState.create({
    doc: 'soft lighting, <style>',
    extensions: [loraContextExtensions(sources, ['<style>'])],
  })
  function ranges() {
    const result: string[] = []
    for (const set of state.facet(EditorView.decorations)) {
      assert.equal(typeof set, 'object')
      if (typeof set !== 'function') {
        set.between(0, state.doc.length, (from, to) => {
          result.push(state.sliceDoc(from, to))
        })
      }
    }
    return result
  }
  assert.deepEqual(ranges(), ['soft lighting'])
  state = state.update({ changes: { from: 0, insert: 'soft lightings', to: 13 } }).state
  assert.deepEqual(ranges(), [])
  state = state.update({
    changes: { from: 0, insert: 'SOFT_LIGHTING', to: state.doc.length },
  }).state
  assert.deepEqual(ranges(), ['SOFT_LIGHTING'])
})
