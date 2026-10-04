# Prompt Editor

## Decision

Positive Prompt and Negative Prompt use plain-text editors built directly on
the modular CodeMirror 6 runtime: `GenerationPromptEditor` in the prototype and
`PlainPromptEditor` in Electron. `GenerationPrompt.text` is the only source of
truth for authored content and order. The editor does not use prompt chips,
stable token IDs, a language grammar, `basicSetup`, or a Vue CodeMirror wrapper.

The Project card keeps the existing compact composition: title and approximate token count at the top left, an Info action beside the metadata, a vertical action rail on the right, about nine visible positive lines and at least four negative lines, line wrapping, and CSS vertical resize. The card's minimum height must also fit every action at the shared compact button size; actions must not be clipped when the editor is empty.

## Editing and selection

The surface supports normal caret movement, character selection, Shift+click, Shift+Arrow, select all, cut/copy/paste, drag selection, bulk deletion, multiline input, and arbitrary phrase reordering. Double-click keeps CodeMirror's native word selection. Triple-click is the only overridden pointer gesture and selects the current top-level comma/newline-separated phrase. Commas inside `()`, `[]`, `{}` and escaped delimiters do not split a phrase; surrounding whitespace is excluded from the semantic range.

Attention actions operate on the current non-empty selection. With a collapsed selection they operate on the top-level phrase under the caret and are disabled for an empty phrase. `Ctrl/Cmd+Up` increases attention and `Ctrl/Cmd+Down` decreases it. The existing suffix, outer-parentheses, and numeric-step semantics remain, including neutral transitions that remove helper parentheses without accumulating new layers.

These actions author plain text; they do not prove model-side attention support.
The first Anima pipeline must implement the
[weighting contract](./prompt-weighting.md), including current editor-produced
`word+`, `(two words)-` and `(word)1.1` forms and previously saved prompts.
Compilation leaves authored Project/preset text intact; Anima inference is
still pending.

## Editor runtime

The minimal runtime uses `EditorState`, `EditorView`, `keymap`, `defaultKeymap`, `Decoration`, `hoverTooltip`, `autocompletion`, completion sections, `EditorView.lineWrapping`, content attributes, themes, and compartments for read-only/resource/autocomplete reconfiguration. `history` and `historyKeymap` are enabled only for local editors in Preset Manager, Apply Preset, and New Project. Project uses external document history.

Autocomplete tooltips use fixed positioning under a `document.body` tooltip parent so panel and modal overflow cannot clip them. Production embedding completion uses a custom `StateEffect` to carry exact resource/version IDs and its literal through typed IPC. Main creates trusted refs after file verification; optimistic renderer overlays may only retain/prune them.

## Project undo grouping

Project prompt input updates the active generation draft immediately, including dirty comparison, but focus starts a transient edit transaction and blur commits at most one history entry. Returning to the baseline creates no entry. Switching prompt editors, a regular Project mutation, Undo/Redo, Save, Generate, Apply Preset, tab switch, and close flush the active transaction. Project `Ctrl/Cmd+Z` therefore restores the whole focus-to-blur edit, while overlay editors retain local CodeMirror undo.

## Discoverability

The first prompt focus opens a controlled onboarding popover:

```text
Triple-click selects a comma-separated phrase.
Ctrl/Cmd+Space browses embeddings and LoRA triggers.
Ctrl/Cmd+Up / Down adjusts attention.
```

The hint deliberately omits ordinary typing and native double-click word selection, keeping only the editor-specific gestures. It names only completion sources supported by that editor. On first display, whether from prompt focus or the Info button, it records `imagegen-studio.prompt-editor-hint-shown.v1` in `localStorage`, so the automatic hint appears just once across positive and negative prompts, including after reload. A corner X closes the current popover. The same help remains available from the Info button through hover, focus, or click. The previous dismissed preference is honored for existing users.

## Resource-aware text

Embeddings and enabled non-missing LoRA trigger phrases are rendered as restrained decorations over ordinary text. Missing and ambiguous embedding states also expose textual diagnostics; resource ranges have metadata hover tooltips. Danbooru matches and ordinary text do not retain metadata or tooltips.

## Prototype boundary

The prototype token count remains a whitespace-based approximation. Production
tokenizer integration, persistent range annotations, wildcard syntax, nested
dynamic prompting and translation remain outside this prototype iteration.

## Production coverage at the Phase 2A checkpoint

The production normal Project currently exposes plain-text CodeMirror editing
for positive and negative prompts through typed Project IPC. At that checkpoint
main retained/pruned only pre-existing embedding refs; new embedding authoring
is connected by the checkpoint below. The production editor
now provides exact-version LoRA trigger decorations, metadata hover and
autocomplete through shared phrase rules. These only add authoring context:
completion inserts ordinary text, while disabling/removing a LoRA never changes
text. Existing embedding sidecar ranges exclude LoRA decoration.

Triple-click phrase selection, attention buttons and Ctrl/Cmd+Up/Down now use
the same rules and CodeMirror commands as the prototype. Shared action/help
components provide suggestion browsing, Copy, Clear, first-focus onboarding and
ordinary Info help. Empty/whitespace attention targets and read-only editors do
not mutate text. Actions preserve the selected range; Clear and attention are
separate local undo steps. Explicit Save persists their text through the existing
Project IPC and real `.igs` writer/loader.

[Syntax diagnostics](./prompt-diagnostics.md#implemented-coverage-27092026) now
mark bracket/weight issues and expose local explanations in both editors. They
are advisory derived state: malformed text remains editable and saveable without
automatic fixes or persisted annotations.

Danbooru suggestions and tokenizer counts remain outside the implemented editor
coverage. Current Project uses document Undo/Redo with focus-to-blur grouping;
the embedding checkpoint below makes text and its refs one persistent edit.
These authoring controls are not evidence of completed generation.

LoRA context and portable popup styling are shared with the prototype without
importing mock embedding resolution into the production editor. Checked behavior
and remaining scope: [LoRA prompt review](../../../engineering/project-lora-prompt-research.md)
[editing actions review](../../../engineering/project-prompt-actions-research.md),
[syntax diagnostics review](../../../engineering/project-prompt-diagnostics-research.md).

## Exact embedding authoring checkpoint (04.10.2026)

Installed Illustrious embedding completion, decoration and diagnostics share
literal rules with main. New tokens use `<original safetensors filename stem>`
in both polarities; CivitAI `trainedWords` are search context only. Completion
replaces its current fragment and carries an ID-only choice even when the token
was already typed. Main verifies the exact installed bytes, links a uniquely
owned canonical literal or waits for an explicit choice on collisions, and
keeps recalled missing refs while their text remains.

Clear or deleting the final literal prunes its ref. Document Undo/Redo restores
text and refs together in the current open Project; history itself remains
transient. Shadow recovery and explicit Save/reopen persist authored refs.
Portable `Link` replaces local IDs only. Late verification, edit/Undo ABA and
tab close cannot publish stale refs, including during the asynchronous commit.

The Info help now names embeddings and LoRA triggers. Missing, corrupt, unlinked,
ambiguous and unsupported-family diagnostics expose repair or explicit selection
without rewriting prompt text. Anima embedding actions and ML loading remain
unsupported; Generate preserves its explicit refusal. Evidence and remaining
scope: [embedding authoring research](../../../engineering/phase-2c-embedding-authoring-research.md).
