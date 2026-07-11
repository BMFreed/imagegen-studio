# Prompt Editor

## Feature

The prompt editor is the primary text authoring surface in `Project` / `Generate`.

It contains positive and negative structured prompt tokens, unified autocomplete, dynamic-prompt preview affordances and preset/accepted-result recall actions.

## Reference

Primary reference: InvokeAI prompt components.

Secondary reference: Forge prompt toolbar ideas, limited to useful actions such as clear, paste and metadata recall.

## ImageGen Studio Decision

Use an ImageGen Studio-native prompt editor. Do not copy Invoke's `Choose Prompt Template` dropdown.

Prompt templates/settings templates belong to [Presets](../../presets.md). Generate exposes presets through an `Apply preset...` action above the settings stack, while direct prompt writing remains the main UI.

## Scope

MVP:

- positive prompt editor;
- negative prompt editor;
- wrapping token editing with a vertically resizable surface;
- prompt history;
- prompt attention syntax editing;
- prompt token count when tokenizer/model support is available;
- unified autocomplete for Danbooru tags, installed embeddings and active LoRA trigger phrases;
- dynamic prompt preview entry point;
- recall prompt/settings from accepted-result provenance;
- explicit preset actions.

Post-MVP:

- image-to-prompt helper;
- advanced prompt comparison;
- saved prompt snippets if they become separate from Presets.

Rejected:

- Invoke-style `Choose Prompt Template` dropdown;
- Forge prompt styles dropdown;
- wildcard expansion.

## UI Behavior

Positive prompt is always visible.

Negative prompt can be visible by default or collapsible, but it must be available without changing modes. If collapsed, the collapsed state should show whether the negative prompt has content.

Prompt editor status area should contain:

- token count;
- prompt diagnostics warning icon;
- dynamic prompt preview indicator when dynamic syntax is detected;
- model/tokenizer unavailable warning when token counting cannot run.

Allowed preset-related affordances in Generate:

- compact `Apply preset...` action launcher;
- `Apply Preset` through apply preview;
- `Save Current as Preset`;
- `Recall Settings from Result`;
- missing-resource warnings after applying a preset.

These actions must be visually distinct from direct prompt editing.

Positive and negative prompts expose the same helper actions: increase/decrease attention for the selected token, dynamic preview, copy and clear. Creating a token starts from a compact dashed `+` action, which becomes a three-character-wide inline autocomplete input and expands with its content. There is no separate `Insert Tag` action. Attention uses Invoke-like `+` / `-` suffixes and supports `Ctrl/Cmd+Up` and `Ctrl/Cmd+Down` when a token is selected.

The Vue prototype uses a compact prompt-specific card shell instead of the generic card header/content/footer composition. The title and token count share the top-left metadata line, diagnostics use a compact adjacent warning, and helper actions form a vertical rail on the right. `GenerationPromptTokenEditor` is built from Naive `NTag`, `NAutoComplete`, tooltip and popover primitives. The surface uses ordinary CSS vertical resizing and starts at approximately nine lines for positive and four for negative.

Single click selects a token and adds an input-like outline without replacing its neutral background. Clicking outside the editor clears selection. Double click replaces the chip in place with an input of the same measured initial width; the input then expands or contracts with the edited text without jumping to a generic full-row width. The same autocomplete dropdown is available during create and edit. Enter or blur commits, Escape cancels the draft, every chip has a close action, and Backspace remains a keyboard deletion path. Paste can create several top-level comma-separated tokens. A create, edit, delete or attention operation produces one named undo entry; uncommitted inline text does not mutate the document.

Attention helpers reuse at most one outer pair of parentheses. When repeated increase/decrease actions return a token to neutral attention, the helper removes both the suffix and its helper-added outer parentheses.

The editor's unused surface has no text cursor or hover treatment. Tooltips are limited to resource-bearing embedding and LoRA-trigger tokens, where they explain source identity; ordinary custom, Danbooru and dynamic tokens do not repeat their kind in a tooltip.

## Acceptance Criteria

- User can edit positive and negative prompts in Generate.
- Prompt fields support multiline editing and expansion.
- Prompt history can recall previous prompt text.
- Preset actions are explicit and do not appear as a copied template dropdown.
- [Tag autocomplete](./tag-autocomplete.md) and [dynamic prompt preview](./dynamic-prompting.md) can be reached from the prompt editor.
