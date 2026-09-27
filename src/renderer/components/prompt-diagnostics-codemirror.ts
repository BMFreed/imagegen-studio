import {
  inspectPromptSyntax,
  type PromptSyntaxReport,
} from '../../shared/projects/prompt-diagnostics.js'

import { StateField } from '@codemirror/state'
import { Decoration, EditorView, hoverTooltip } from '@codemirror/view'

export const promptSyntaxField = StateField.define<PromptSyntaxReport>({
  create: (state) => inspectPromptSyntax(state.doc.toString()),
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
  update: (value, transaction) =>
    transaction.docChanged ? inspectPromptSyntax(transaction.state.doc.toString()) : value,
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
