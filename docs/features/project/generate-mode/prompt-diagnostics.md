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

## Acceptance Criteria

- Prompt editor shows token count and diagnostics in the same local status area.
- Definite bracket errors are visually distinguishable from soft warnings.
- User can still run generation with unresolved diagnostics.
- Tooltip/popover explains the warning with a short concrete message.
