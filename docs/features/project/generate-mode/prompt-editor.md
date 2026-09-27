# Prompt Editor

## Decision

Positive Prompt and Negative Prompt use the shared `GenerationPromptEditor`, a plain-text editor built directly on the modular CodeMirror 6 runtime. `GenerationPrompt.text` is the only source of truth for authored content and order. The editor does not use prompt chips, stable token IDs, a language grammar, `basicSetup`, or a Vue CodeMirror wrapper.

The Project card keeps the existing compact composition: title and approximate token count at the top left, an Info action beside the metadata, a vertical action rail on the right, about nine visible positive lines and four negative lines, line wrapping, and CSS vertical resize.

## Editing and selection

The surface supports normal caret movement, character selection, Shift+click, Shift+Arrow, select all, cut/copy/paste, drag selection, bulk deletion, multiline input, and arbitrary phrase reordering. Double-click keeps CodeMirror's native word selection. Triple-click is the only overridden pointer gesture and selects the current top-level comma/newline-separated phrase. Commas inside `()`, `[]`, `{}` and escaped delimiters do not split a phrase; surrounding whitespace is excluded from the semantic range.

Attention actions operate on the current non-empty selection. With a collapsed selection they operate on the top-level phrase under the caret and are disabled for an empty phrase. `Ctrl/Cmd+Up` increases attention and `Ctrl/Cmd+Down` decreases it. The existing suffix, outer-parentheses, and numeric-step semantics remain, including neutral transitions that remove helper parentheses without accumulating new layers.

## Editor runtime

The minimal runtime uses `EditorState`, `EditorView`, `keymap`, `defaultKeymap`, `Decoration`, `hoverTooltip`, `autocompletion`, completion sections, `EditorView.lineWrapping`, content attributes, themes, and compartments for read-only/resource/autocomplete reconfiguration. `history` and `historyKeymap` are enabled only for local editors in Preset Manager, Apply Preset, and New Project. Project uses external document history.

Autocomplete tooltips use fixed positioning under a `document.body` tooltip parent so panel and modal overflow cannot clip them. Embedding completion uses a custom `StateEffect` to carry resource identity into the Vue model.

## Project undo grouping

Project prompt input updates the active generation draft immediately, including dirty comparison, but focus starts a transient edit transaction and blur commits at most one history entry. Returning to the baseline creates no entry. Switching prompt editors, a regular Project mutation, Undo/Redo, Save, Generate, Apply Preset, tab switch, and close flush the active transaction. Project `Ctrl/Cmd+Z` therefore restores the whole focus-to-blur edit, while overlay editors retain local CodeMirror undo.

## Discoverability

The first prompt focus opens a controlled onboarding popover:

```text
Triple-click selects a comma-separated phrase.
Ctrl/Cmd+Space browses embeddings and LoRA triggers.
```

The hint deliberately omits ordinary typing and native double-click word selection, keeping only the editor-specific gestures. It stays visible only while a prompt editor is focused. Its text-style `Don't show again` action stores `imagegen-studio.prompt-editor-hint-dismissed.v1` in `localStorage`. The same compact help layout, without the action row, remains available from the Info button through an ordinary hover/focus popover.

## Resource-aware text

Embeddings and enabled non-missing LoRA trigger phrases are rendered as restrained decorations over ordinary text. Missing and ambiguous embedding states also expose textual diagnostics; resource ranges have metadata hover tooltips. Danbooru matches and ordinary text do not retain metadata or tooltips.

## Prototype boundary

The prototype token count remains a whitespace-based approximation. Production
tokenizer integration, persistent range annotations, wildcard syntax, nested
dynamic prompting and translation remain outside this prototype iteration.

## Production coverage at the Phase 2A checkpoint

The production normal Project currently exposes plain-text CodeMirror editing
for positive and negative prompts through typed Project IPC. The main process
retains only pre-existing embedding sidecar refs whose literal activation token
still appears in the edited text; the renderer cannot create refs in this
slice. Retyping a removed token does not restore its ref. The production editor
now provides exact-version LoRA trigger decorations, metadata hover and
autocomplete through shared phrase rules. These only add authoring context:
completion inserts ordinary text, while disabling/removing a LoRA never changes
text. Existing embedding sidecar ranges exclude LoRA decoration. The editor does
not yet provide the prototype's phrase selection, attention actions, embedding
diagnostics/insertion, Danbooru suggestions or focus-to-blur Project undo transaction. It uses local editor history while
Project-level undo remains unimplemented. These missing editor behaviors and
model-aware resource feedback remain product contract work, not evidence of
completed generation.

LoRA context and portable popup styling are shared with the prototype without
importing mock embedding resolution into the production editor. Checked behavior
and remaining scope: [Project prompt review](../../../engineering/project-lora-prompt-research.md).
