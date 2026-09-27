# Prompt Diagnostics

## Feature

Prompt diagnostics warn the user about likely prompt syntax mistakes while keeping generation non-blocking.

## Reference

Reference: Forge prompt bracket checker and token counter behavior.

## ImageGen Studio Decision

Prompt syntax diagnostics are non-blocking by default.

The user can still press `Generate` when the prompt has bracket or weight warnings, because prompt parsers and model pipelines can differ. The UI should warn clearly without turning prompt writing into a rigid form-validation flow.

## Scope

MVP:

- balanced `()`, `[]` and `{}` checks;
- escaped bracket handling where prompt syntax supports it;
- basic prompt attention weight validation for common forms like `(tag:1.2)`;
- token counter integration so syntax warnings and token count live in the same prompt-status area.

Post-MVP:

- pipeline-aware parser if Diffusers/Invoke prompt parsing exposes enough reliable structure;
- quick fixes only if they are predictable and do not rewrite creative prompt text unexpectedly.

## UI Behavior

Diagnostics should be shown locally in the prompt editor:

- underline or otherwise mark the suspicious text range inside the editor;
- show a warning icon next to the token counter when diagnostics exist;
- open a tooltip/popover from the warning icon or highlighted range;
- show a pre-generation warning only when the issue is definite and still unresolved.

Message examples:

- `Unclosed "("`;
- `Unexpected ")"`;
- `Invalid weight "(tag:abc)"`;
- `Prompt attention may not be parsed as intended`.

Severity:

- yellow warning for suspicious but possibly valid syntax;
- red warning for definitely broken bracket structure.

Diagnostics must not appear as global app errors. They belong to the prompt field that contains the issue.

## Implemented coverage (27.09.2026)

Electron and the Vue prototype use the same conservative text inspection and
CodeMirror extension. They check nested `()`, `[]`, `{}`, escaped characters,
unclosed/unexpected/mismatched delimiters, malformed `(phrase:weight)` and
numeric `(phrase)weight` suffixes. Finite signed decimal/exponent values are
accepted without imposing model-specific ranges. `+`/`-` attention markers,
dynamic alternatives, escaped colons, URL schemes and ordinary punctuation are
not treated as malformed weights. Multiple top-level colons are left to the
pipeline parser instead of guessing a language grammar.

Structure issues have a red wavy underline; suspicious weights use amber.
Hover over the marked range explains the issue. A compact header button opens
the diagnostic list by pointer or keyboard, using text labels as well as color.
Project places it beside Info (and the prototype's approximate token count);
prototype Preset/Apply/New Project editors show it inside their editor surface.
Popovers/hover tooltips are outside scroll clipping. Reports are capped at 100
displayed issues with explicit truncation feedback; this is a UI work ceiling,
not a model or prompt-length limit.

Derived reports update on typing, external replacement, Undo and reopen. They
never modify authored text, sidecars, selection, undo history, dirty state or
validation. Electron saves malformed text through the existing `.igs` path;
prototype Generate/Apply remain available with syntax hints alone. Missing or
ambiguous embedding resources remain separate blocking resource diagnostics.

The mock `(broken` check has been removed. Production tokenizer/counts,
pipeline-aware parsing, quick fixes and a pre-generation warning are still
pending. The production inference entry point does not yet exist; non-blocking
Generate evidence currently applies only to the prototype.
[Implementation and verification](../../../engineering/project-prompt-diagnostics-research.md).

## Acceptance Criteria

- Prompt editor shows token count and diagnostics in the same local status area.
- Definite bracket errors are visually distinguishable from soft warnings.
- User can still run generation with unresolved diagnostics.
- Tooltip/popover explains the warning with a short concrete message.
