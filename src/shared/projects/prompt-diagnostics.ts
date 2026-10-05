import { inspectAnimaAttentionSyntax } from './anima-prompt-attention.js'

export interface PromptSyntaxDiagnostic {
  code:
    | 'anima-attention'
    | 'anima-selection'
    | 'invalid-weight'
    | 'mismatched-close'
    | 'unclosed-bracket'
    | 'unexpected-close'
  from: number
  message: string
  severity: 'error' | 'warning'
  to: number
}

export interface PromptSyntaxReport {
  items: PromptSyntaxDiagnostic[]
  truncated: boolean
}

/** UI work ceiling, independent of tokenizer limits and generation validation. */
export const MAX_PROMPT_DIAGNOSTICS = 100
const CLOSERS: Readonly<Record<string, string>> = { '(': ')', '[': ']', '{': '}' }
const FINITE_WEIGHT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i

interface OpenGroup {
  bracket: string
  colons: number[]
  from: number
}

/** Conservative authoring hints, not a pipeline parser or a generation gate. */
export function inspectPromptSyntax(
  text: string,
  modelFamily: string | null = null,
): PromptSyntaxReport {
  const report: PromptSyntaxReport = { items: [], truncated: false }
  const stack: OpenGroup[] = []
  const add = (item: PromptSyntaxDiagnostic) => {
    if (report.items.length < MAX_PROMPT_DIAGNOSTICS) {
      report.items.push(item)
    } else {
      report.truncated = true
    }
  }
  const checkWeight = (from: number, to: number, emptyFrom: number) => {
    const weight = text.slice(from, to).trim()
    if (FINITE_WEIGHT.test(weight) && Number.isFinite(Number(weight))) {
      return
    }
    add({
      code: 'invalid-weight',
      from: from === to ? emptyFrom : from,
      message: weight
        ? `Invalid attention weight "${weight.slice(0, 40)}${weight.length > 40 ? '…' : ''}"; expected a finite number.`
        : 'Missing attention weight after ":".',
      severity: 'warning',
      to,
    })
  }
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index)
    if (char === '\\') {
      index += 1
      continue
    }
    if (CLOSERS[char]) {
      stack.push({ bracket: char, colons: [], from: index })
      continue
    }
    const top = stack.at(-1)
    if (char === ':' && top?.bracket === '(') {
      top.colons.push(index)
    }
    if (!')]}'.includes(char)) {
      continue
    }
    if (!top || CLOSERS[top.bracket] !== char) {
      add({
        code: top ? 'mismatched-close' : 'unexpected-close',
        from: index,
        message: top
          ? `Unexpected "${char}"; expected "${CLOSERS[top.bracket]}".`
          : `Unexpected "${char}".`,
        severity: 'error',
        to: index + 1,
      })
      continue
    }
    stack.pop()
    if (top.bracket !== '(') {
      continue
    }
    // A lone top-level colon is the common (phrase:weight) form. Multiple
    // colons may belong to other prompt languages; do not guess their grammar.
    const colon = top.colons[0]
    if (top.colons.length === 1 && colon !== undefined) {
      const url =
        /(?:^|\s)[a-z][a-z\d+.-]*$/i.test(text.slice(top.from + 1, colon)) &&
        text.slice(colon + 1, colon + 3) === '//'
      if (!url) {
        checkWeight(colon + 1, index, colon)
      }
    }
    // Compel-style numeric suffixes. +/- attention markers and ordinary prose
    // after a group are intentionally not interpreted as numeric weights.
    const suffix = text.slice(index + 1).match(/^[+-]?(?:\d|\.\d)[^\s,()[\]{}\\]*/)?.[0]
    if (suffix) {
      checkWeight(index + 1, index + 1 + suffix.length, index)
      index += suffix.length
    }
  }
  for (const group of stack) {
    add({
      code: 'unclosed-bracket',
      from: group.from,
      message: `Unclosed "${group.bracket}"; expected "${CLOSERS[group.bracket]}".`,
      severity: 'error',
      to: group.from + 1,
    })
  }
  if (modelFamily === 'anima') {
    for (const advisory of inspectAnimaAttentionSyntax(text, MAX_PROMPT_DIAGNOSTICS)) {
      if (!report.items.some((item) => item.from === advisory.from && item.to === advisory.to)) {
        add({ ...advisory, code: 'anima-attention', severity: 'warning' })
      }
    }
  }
  report.items.sort((a, b) => a.from - b.from || a.to - b.to)
  return report
}
