import {
  type Completion,
  type CompletionSection,
  type CompletionSource,
  pickedCompletion,
} from '@codemirror/autocomplete'
import { EditorSelection, type Extension, StateEffect } from '@codemirror/state'
import { Decoration, EditorView, hoverTooltip, tooltips } from '@codemirror/view'

import type { DanbooruTagMock } from './generation-prompt.utils'
import type {
  GenerationEmbeddingResourceRef,
  GenerationLora,
  GenerationPrompt,
  GenerationPromptEmbeddingRef,
  GenerationPromptPolarity,
} from './generation.types'

import { getPromptAutocompleteSuggestions } from './generation-autocomplete.utils'
import {
  findTopLevelPromptPhraseRange,
  getPromptEmbeddingMatches,
  getPromptLoraTriggerMatches,
  normalizePromptSearchValue,
} from './generation-prompt.utils'

export const addPromptEmbeddingEffect = StateEffect.define<GenerationPromptEmbeddingRef>()

const completionSections = {
  danbooru: { name: 'Danbooru tags', rank: 3 },
  embeddings: { name: 'Embeddings', rank: 2 },
  loras: { name: 'Active LoRA triggers', rank: 1 },
} satisfies Record<string, CompletionSection>

export function createPromptCompletionSource(getters: {
  danbooruTags: () => DanbooruTagMock[]
  embeddings: () => GenerationEmbeddingResourceRef[]
  loras: () => GenerationLora[]
  polarity: () => GenerationPromptPolarity
}): CompletionSource {
  return (context) => {
    const fragment = context.matchBefore(/[^\s,\n]*/)
    const query = fragment?.text ?? ''
    const danbooruFragment = findDanbooruFragment(
      context.state.doc.toString(),
      context.pos,
      getters.danbooruTags(),
    )
    if (
      !context.explicit &&
      normalizePromptSearchValue(query).length < 2 &&
      normalizePromptSearchValue(danbooruFragment.text).length < 2
    ) {
      return null
    }

    const suggestions = getPromptAutocompleteSuggestions({
      danbooruQuery: danbooruFragment.text,
      danbooruTags: getters.danbooruTags(),
      embeddings: getters.embeddings(),
      explicit: context.explicit,
      loras: getters.loras(),
      polarity: getters.polarity(),
      query,
    })
    if (!suggestions.length) {
      return null
    }

    return {
      filter: false,
      from: fragment?.from ?? context.pos,
      options: suggestions.map<Completion>((suggestion) => ({
        apply(view, completion, from, to) {
          const applyFrom = suggestion.group === 'danbooru' ? danbooruFragment.from : from
          const effects = suggestion.embedding
            ? [
                addPromptEmbeddingEffect.of({
                  resource: structuredClone(suggestion.embedding),
                  token: suggestion.label,
                }),
              ]
            : []
          view.dispatch({
            annotations: pickedCompletion.of(completion),
            changes: { from: applyFrom, insert: suggestion.label, to },
            effects,
            selection: EditorSelection.cursor(applyFrom + suggestion.label.length),
          })
        },
        detail: suggestion.detail,
        label: suggestion.label,
        section: completionSections[suggestion.group],
        type: suggestion.group === 'embeddings' ? 'variable' : 'text',
      })),
      validFor: /[^\s,\n]*/,
    }
  }
}

export function createPromptResourceExtensions(args: {
  embeddings: GenerationEmbeddingResourceRef[]
  loras: GenerationLora[]
  prompt: GenerationPrompt
}): Extension[] {
  const embeddingMatches = getPromptEmbeddingMatches(args.prompt, args.embeddings)
  const loraMatches = getPromptLoraTriggerMatches(args.prompt.text, args.loras)
  const occupied = embeddingMatches.map((match) => ({ from: match.from, to: match.to }))
  const decorations = [
    ...embeddingMatches.map((match) =>
      Decoration.mark({
        attributes: {
          'data-prompt-resource': match.ambiguous
            ? 'ambiguous-embedding'
            : match.ref?.resource.missing
              ? 'missing-embedding'
              : 'embedding',
        },
        class: match.ambiguous
          ? 'cm-prompt-embedding cm-prompt-embedding--ambiguous'
          : match.ref?.resource.missing
            ? 'cm-prompt-embedding cm-prompt-embedding--missing'
            : 'cm-prompt-embedding',
      }).range(match.from, match.to),
    ),
    ...loraMatches
      .filter((match) => !occupied.some((range) => match.from < range.to && match.to > range.from))
      .map((match) =>
        Decoration.mark({ class: 'cm-prompt-lora-trigger' }).range(match.from, match.to),
      ),
  ]

  return [
    EditorView.decorations.of(Decoration.set(decorations, true)),
    hoverTooltip((view, position) => {
      const text = view.state.doc.toString()
      const prompt = { ...args.prompt, text }
      const embedding = getPromptEmbeddingMatches(prompt, args.embeddings).find(
        (match) => position >= match.from && position <= match.to,
      )
      const lora = getPromptLoraTriggerMatches(text, args.loras).find(
        (match) => position >= match.from && position <= match.to,
      )
      if (!embedding && !lora) {
        return null
      }
      return {
        create() {
          const dom = document.createElement('div')
          dom.className = 'prompt-resource-tooltip'
          if (embedding) {
            const resource = embedding.ref?.resource ?? embedding.resources[0]
            dom.textContent = embedding.ambiguous
              ? `Embedding · Ambiguous activation: ${embedding.token} · Matches: ${embedding.resources.map((item) => item.name).join(', ')}`
              : [
                  'Embedding',
                  resource?.name,
                  resource?.version,
                  resource?.baseModel ? `Base model: ${resource.baseModel}` : undefined,
                  `Activation: ${embedding.token}`,
                  resource?.missing ? 'Missing resource' : undefined,
                ]
                  .filter(Boolean)
                  .join(' · ')
          } else if (lora) {
            const sources = lora.loras.map((item) =>
              [item.resource.name, item.resource.version].filter(Boolean).join(' '),
            )
            dom.textContent = `LoRA · Trigger: ${lora.phrase} · Sources: ${sources.join(', ')}`
          }
          return { dom }
        },
        end: (embedding ?? lora)!.to,
        pos: (embedding ?? lora)!.from,
      }
    }),
  ]
}

export function promptTooltipParent(): Extension {
  return tooltips({ parent: document.body, position: 'fixed' })
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

function findDanbooruFragment(text: string, position: number, tags: DanbooruTagMock[]) {
  const phrase = findTopLevelPromptPhraseRange(text, position)
  const beforeCaret = text.slice(phrase.from, position)
  const suffixStarts = [0]
  for (const match of beforeCaret.matchAll(/\s+/g)) {
    suffixStarts.push((match.index ?? 0) + match[0].length)
  }
  for (const start of suffixStarts) {
    const candidate = beforeCaret.slice(start)
    const normalized = normalizePromptSearchValue(candidate)
    if (
      normalized.length >= 2 &&
      tags.some((tag) =>
        [tag.name, ...tag.aliases]
          .map(normalizePromptSearchValue)
          .some((value) => value.includes(normalized)),
      )
    ) {
      return { from: phrase.from + start, text: candidate }
    }
  }
  const fallback = beforeCaret.match(/\S*$/)?.[0] ?? ''
  return { from: position - fallback.length, text: fallback }
}
