import type { AnimaAttentionAdvisory } from '../../shared/projects/anima-prompt-attention.js'
import {
  inspectPromptSyntax,
  MAX_PROMPT_DIAGNOSTICS,
  type PromptSyntaxReport,
} from '../../shared/projects/prompt-diagnostics.js'

import { Facet, StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, hoverTooltip } from '@codemirror/view'

export const promptModelFamily = Facet.define<string | null, string | null>({
  combine: (values) => values.at(-1) ?? null,
})
export const promptAttentionAdvisory = StateEffect.define<AnimaAttentionAdvisory>()

export const promptSyntaxField = StateField.define<PromptSyntaxReport>({
  create: (state) => inspectPromptSyntax(state.doc.toString(), state.facet(promptModelFamily)),
  provide: (field) =>
    EditorView.decorations.from(field, (report) =>
      Decoration.set(
        report.items.map((item) =>
          Decoration.mark({
            class: `cm-prompt-syntax-${item.severity}`,
          }).range(item.from, item.to),
        ),
        true,
      ),
    ),
  update(value, transaction) {
    const family = transaction.state.facet(promptModelFamily)
    const familyChanged = family !== transaction.startState.facet(promptModelFamily)
    let report =
      transaction.docChanged || familyChanged
        ? inspectPromptSyntax(transaction.state.doc.toString(), family)
        : transaction.selection !== undefined &&
            value.items.some((item) => item.code === 'anima-selection')
          ? inspectPromptSyntax(transaction.state.doc.toString(), family)
          : value
    for (const effect of transaction.effects) {
      if (effect.is(promptAttentionAdvisory) && family === 'anima') {
        const items = report.items.filter((item) => item.code !== 'anima-selection')
        const alreadyVisible = items.some(
          (item) =>
            item.from === effect.value.from &&
            item.to === effect.value.to &&
            item.message === effect.value.message,
        )
        if (alreadyVisible) {
          report = { ...report, items }
          continue
        }
        report = {
          ...report,
          items: [
            ...items.slice(0, MAX_PROMPT_DIAGNOSTICS - 1),
            { ...effect.value, code: 'anima-selection', severity: 'warning' },
          ],
          truncated: report.truncated || items.length >= MAX_PROMPT_DIAGNOSTICS,
        }
      }
    }
    return report
  },
})

export const promptSyntaxExtensions = [
  promptSyntaxField,
  hoverTooltip((view, position) => {
    const items = view.state
      .field(promptSyntaxField)
      .items.filter((item) => position >= item.from && position < item.to)
    return items.length
      ? {
          create() {
            const dom = document.createElement('div')
            dom.className = 'prompt-syntax-tooltip'
            // Prompt text is untrusted content, never tooltip markup.
            dom.textContent = items.map((item) => item.message).join('\n')
            return { dom }
          },
          end: Math.max(...items.map((item) => item.to)),
          pos: Math.min(...items.map((item) => item.from)),
        }
      : null
  }),
]
