# Prompt Editor

## Feature

The prompt editor is the primary text authoring surface in `Project` / `Generate`.

It contains positive and negative prompts, prompt history, tag autocomplete entry points, dynamic-prompt preview affordances and preset/accepted-result recall actions.

## Reference

Primary reference: InvokeAI prompt components.

Secondary reference: Forge prompt toolbar ideas, limited to useful actions such as clear, paste and metadata recall.

## ImageGen Studio Decision

Use an ImageGen Studio-native prompt editor. Do not copy Invoke's `Choose Prompt Template` dropdown.

Prompt templates/settings templates belong to [Presets](../../presets.md). Generate exposes presets through a compact selector above the prompt editor, while direct prompt writing remains the main UI.

## Scope

MVP:

- positive prompt editor;
- negative prompt editor;
- multiline editing;
- resize/expand affordance;
- prompt history;
- prompt attention syntax editing;
- prompt token count when tokenizer/model support is available;
- Danbooru-style tag autocomplete integration;
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

- compact `Preset` selector above the prompt editor;
- `Apply Preset` through apply preview;
- `Save Current as Preset`;
- `Recall Settings from Result`;
- missing-resource warnings after applying a preset.

These actions must be visually distinct from direct prompt editing.

## Acceptance Criteria

- User can edit positive and negative prompts in Generate.
- Prompt fields support multiline editing and expansion.
- Prompt history can recall previous prompt text.
- Preset actions are explicit and do not appear as a copied template dropdown.
- [Tag autocomplete](./tag-autocomplete.md) and [dynamic prompt preview](./dynamic-prompting.md) can be reached from the prompt editor.
