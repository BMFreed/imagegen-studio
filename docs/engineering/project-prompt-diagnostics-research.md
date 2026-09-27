# Prompt syntax diagnostics

## Research

Base `befc455`, clean checkout, 27.09.2026. Medium risk: shared prompt editing
behavior and presentation. Feature owner:
[Prompt Diagnostics](../features/project/generate-mode/prompt-diagnostics.md).
PP-002 explicit authoring intent and PP-007 unchanged text persistence apply;
no new IPC, resource resolution, archive schema or generation validation.

Confirmed: Electron has no syntax diagnostics; prototype Project displays a
mock warning only when text includes `(broken`. The same prototype editor is
also used by Preset Manager, Apply and New Project, so diagnostics must work in
those consumers without reading their state or changing their submit rules.

Path: authored or externally restored text → shared pure diagnostics → real
CodeMirror state/decorations/hover + local accessible status popover. Existing
text update → main → shadow/Save remains untouched. Warnings are derived state,
never persisted, never converted into resource errors or validation blockers.

Invariants: balanced/nested and escaped delimiters are accepted; unmatched and
crossed brackets get definite structure errors; malformed colon/numeric-suffix
weights get advisory warnings. Do not claim to parse the entire Invoke/Compel
language or validate model-specific ranges. Preserve dynamic alternatives,
literal URLs, attention +/- markers, native selection and resource decorations.
Diagnostics update on typing, external replacement and Undo without altering the
text, selection or history. Missing/ambiguous embedding validation stays separate.

UI uses existing status tokens, 24/18 px compact controls and approved prompt
headers. CodeMirror hover and Naive popover escape scroll clipping. Read-only
editors still expose diagnostics. Use at most 100 visible diagnostics per prompt
as a UI work ceiling (not a model limit), with explicit truncation feedback;
test that ceiling and a valid large neighboring input.

Validation plan: pure production rules with ranges and neighboring valid cases;
real CodeMirror state edits/history; Electron malformed positive/negative prompts,
keyboard status access, repair, Undo and actual `.igs` Save/reopen;
prototype Project and overlay editors, Generate/Apply not blocked solely by syntax.
Targeted mutations remove escape handling and stop diagnostics updates after
document edits. Visual self-review uses ui-audit at normal/minimum desktop size.

## Validation

Implemented in the working tree over `befc455`. This is a self-review, not an
independent audit. Pure rules live in
[`prompt-diagnostics.ts`](../../src/shared/projects/prompt-diagnostics.ts), the
CodeMirror field and hover in
[`prompt-diagnostics-codemirror.ts`](../../src/renderer/components/prompt-diagnostics-codemirror.ts),
and the shared accessible status in
[`PromptDiagnosticsIndicator.vue`](../../src/renderer/components/PromptDiagnosticsIndicator.vue).

### Executed checks

- `pnpm run app:test`: **273 passed**, no failures/skips. Six new tests exercise
  the real shared inspector and CodeMirror state/history. Coverage includes
  nested/escaped/crossed brackets, UTF-16 ranges, empty/non-finite/signed weights,
  valid alternative syntax, explicit 100-issue truncation, read-only inspection,
  repair/external replacement/Undo and unchanged selection/text. The independent
  valid-text control catches false positives, not only missing warnings.
- `pnpm run prototype:test`: **144 passed**. Two new browser tests enter actual
  Project and Apply Preset editors; they check underline ranges, keyboard-accessible
  explanations, reset and applied text. Focused follow-up also verifies the
  CodeMirror hover explanation and Generate with unresolved structure/weight hints.
  Prototype Generate is a mock, not an inference claim.
- `pnpm run app:smoke`: **7 desktop scenarios passed**. Real renderer → IPC →
  `.igs` writer/loader preserves malformed text in both polarities. Close/reopen
  shows the same text and recomputed marks. The helper checks repair/Undo,
  separate neighboring prompt state, accessible status and enabled Save;
  it does not inject a diagnostics model into the renderer.
- Typecheck, lint and prototype/app builds passed. The existing >500 kB chunk
  warning remains. Documentation links and `git diff --check` are checked.

### Findings and test sensitivity

The first implementation treated a URL in `(see https://example.com)` and a
sentence-ending period after `(soft light).` as malformed weights. A regression
case failed with both warnings, then passed after the numeric-suffix and URL
candidate checks were narrowed. These are concrete false-positive fixes, not
attempts to parse every prompt language.

Targeted mutations ran in isolated temporary source copies with the actual
CodeMirror dependencies: removing escape handling failed **3 of 4** rule tests;
freezing the diagnostic state after text changes failed **1 of 2** CodeMirror
tests. Normal runs pass all six. This measures sensitivity of these invariants,
not a whole-repository mutation score.

### Visual and product boundaries

Visual self-review used ui-audit: Electron at **1380×900 and 900×620**, prototype
errors state at **1440×900**. The local icon aligns with Info, headings and action
rails remain distinct, both prompt cards are reachable at minimum size, and the
explanation extends beyond the settings scrollbar without clipping. Error and
warning marks have different colors plus textual explanations; no global alert
or automatic repair was added. Missing embedding feedback remains separate.
Artifacts: `/tmp/igs-prompt-diagnostics.png`,
`/tmp/igs-prompt-diagnostics-small.png`,
`docs/prototype-app/screenshots/project-errors.png`.

Production tokenizer/counts, complete pipeline-aware parsing and pre-generation
warnings remain separate work. The existing mock token count is not presented
as a production tokenizer. No worker, queue, resource validation or archive
contract was changed. PP-002 evidence and the roadmap are updated without
raising public readiness or marking a phase complete.

Local logs: `/tmp/igs-diagnostics-tests.log`,
`/tmp/igs-diagnostics-prototype.log`, `/tmp/igs-diagnostics-ui-final.log`,
`/tmp/igs-diagnostics-smoke-final.log`, `/tmp/igs-diagnostics-typecheck-final.log`,
`/tmp/igs-diagnostics-lint-final.log`, `/tmp/igs-diagnostics-build.log`,
`/tmp/igs-diagnostics-prose-red.log`, `/tmp/igs-diagnostics-mutation-escape.log`,
`/tmp/igs-diagnostics-mutation-stale.log`.
