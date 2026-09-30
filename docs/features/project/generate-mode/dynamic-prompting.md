# Dynamic Prompting

## Feature

Dynamic prompting expands one authored prompt into one or more concrete prompts before queueing generation jobs.

## Reference

Reference: InvokeAI dynamic prompt components and settings.

## ImageGen Studio Decision

Include Invoke-like dynamic prompting in Generate. Do not include wildcard files.

Dynamic prompting is prompt expansion logic. It does not imply A1111 wildcard packs, external wildcard folders or wildcard autocomplete.

Dynamic prompting is reached from the positive or negative prompt toolbar. It is not a permanent settings card. The preview modal expands positive and negative prompts into concrete pairs before queueing.

## Scope

MVP:

- detect dynamic syntax in positive and negative prompt fields;
- preview expanded prompts before running;
- show parse errors near the prompt editor;
- configure max expanded prompts;
- configure seed behavior for expanded prompts;
- store the concrete expansion in accepted-result provenance.

Post-MVP:

- richer expansion diff/inspection UI;
- per-section dynamic prompt controls if needed.

Rejected:

- wildcard file expansion;
- wildcard database management;
- external wildcard pack import.
- nested brace expressions in the current prototype.

The current prototype supports non-nested brace alternatives such as `{red|green|blue}`. Multiple groups use deterministic Cartesian expansion. `maxPrompts` defaults to 100 and the combined expanded-prompts × iterations batch is capped at 100 prototype jobs.

## Seed Behavior

Seed behavior must be explicit because it changes reproducibility.

Supported modes:

- `Per iteration`: use one seed per iteration and share it across every expanded
  positive/negative prompt pair in that iteration;
- `Per prompt`: use a different seed for every prompt-pair × iteration job.

For `Fixed`, the entered seed starts the sequence. For `Random`, Generate picks
one random base seed for the batch, then advances the sequence. Seeds wrap in the
32-bit unsigned range. Queue display order remains prompt pair first, then
iteration within that pair. `Reuse` snapshots the last actual seed from a
completed output of this same Project as the base seed at Generate time, then
uses the same `Per iteration` or `Per prompt` schedule. It never searches another
Project, accepted layer provenance or prunable queue rows for a substitute. If
the Project has no completed seed, Generate is disabled with an explicit reason;
there is no silent random fallback.

The project-scoped last-actual-seed cursor advances only after a candidate
output is validated and durably committed as completed. Pending, canceled,
failed and partially written outputs do not advance it. Later discard of a
completed candidate does not erase the fact that its seed was actually used.
The cursor is operational metadata outside document dirty/undo history and
survives same-session tab switches and graceful close/reopen. Production stores
it in app-managed project recovery independently of staging manifests and queue
rows; explicit Project Save also snapshots it into `.igs`. Without Save, a newer
local cursor is not part of the portable `.igs` file.

Each queued job freezes its actual seed and its requested seed policy separately.
The selected dynamic seed behavior and requested policy are stored in
accepted-result provenance alongside the actual seed, even when the requested
policy was `Random` or `Reuse`.

## Persistence

Expanded-prompt preview state is transient UI state.

Persist:

- dynamic prompt source text;
- dynamic prompt settings;
- concrete expanded prompt used for each generation result.

Do not persist:

- loading state;
- parse error UI state beyond normal project/session diagnostics;
- full transient preview list unless it is tied to an actual generated result.

## Production Seed Reuse checkpoint

[The current internal checkpoint](../../../engineering/phase-2b-seed-reuse-research.md)
records actual seed only after durable candidate completion. Main reads that
cursor with the local Project key and open `.igs` `documentId`, then freezes
the concrete `reuse` seed before enqueue. If the local cursor is absent, the
saved `.igs` snapshot is used; if both are absent, Prepare stops explicitly.
The Results IPC exposes the local cursor and explicit Save records its snapshot
without marking the document dirty or adding Undo history. This does not yet
implement renderer Generate, dynamic batch expansion in the production worker
or a packaged Linux/NVIDIA release pipeline.

## Production prepared-batch planning checkpoint

The [internal planner and capacity checkpoint](../../../engineering/phase-2b-batch-planning-research.md)
adds `planGenerationBatch` and `enqueuePreparedBatch`. The caller supplies one
already frozen Project preparation with a resolved Fixed/Random/Reuse base;
main snapshots it and the options before asynchronous admission. The pure
planner validates all source syntax before selecting a bounded Cartesian prefix,
uses positive outer/negative inner and pair outer/iteration inner order, and
returns an explicit `truncated` flag when `maxPrompts` selects only a prefix.
Overflow of the independent job limit refuses the whole batch instead of
silently truncating it again. Huge products are not eagerly allocated.

The initial shared prepared-batch policy is 32 jobs, selected by persistent
storage measurements. Recovery's 64-candidate ceiling and escaped-byte
preflight remain separate constraints; this is not GPU or release qualification.

The current internal grammar supports non-nested alternatives, preserves
duplicates and literal dollar text, rejects empty/single alternatives, and
retains backslash escapes. Sources and concrete strings are bounded to 16 KiB
UTF-8. The current Python worker cannot condition literal brace text, even
escaped; main explicitly refuses remaining braces before qualification. Pure
lexical preservation is not evidence of Compel/GPU support.

One common target lease qualifies the group, and every varied concrete request
is checked against the transport envelope before atomic queue publication.
New frozen contexts and accepted provenance retain the selected `seedBehavior`;
legacy records without it remain readable and unspecified. Integration tests
use real Project preparation for Fixed, one Random choice and completed Reuse
seed zero, then actual queue/staging/Add/portable Save with external inference
substituted. Seed behavior remains main metadata rather than a Python sampling
parameter.

At that planning checkpoint renderer Generate, preview/settings UI and persisted
dynamic draft options were unconnected. The following checkpoint closes preview
and draft storage only; full conditioning and release inference remain open.
The prototype's 100-job guard remains separate from production admission policy.

## Production persisted-settings and preview checkpoint

The [production preview checkpoint](../../../engineering/phase-2b-dynamic-preview-research.md)
opens one modal from either prompt toolbar. It expands the current positive and
negative source text with the real pure planner, using one iteration and the
shared 32-job cap. It displays concrete pairs, parse/byte/count errors and an
explicit warning when `maxPrompts` selects a shorter prefix. Literal braces
retained by the grammar are marked as unsupported by the current worker.
It does not select Random/Reuse seeds, call main admission or qualify a model.

`generationDraft.dynamicPrompt` stores `maxPrompts` (integer 1..100, default 100)
and `seedBehavior` (`per-iteration` by default, or `per-prompt`). These are
Project edits with Undo/Redo, recovery shadow and explicit portable Save.
Preview pairs, errors and modal visibility stay transient. Opening and closing
the preview alone preserves dirty/history, the actual seed snapshot and `.igs`
bytes. Legacy documents without settings remain readable and absent on open;
effective defaults do not create an edit or silently add the field. New documents
store an owned default object. Strict package/IPC guards reject invalid objects.

Native Electron checks cover both toolbars, four ordered pairs, truncation,
malformed text, job overflow, 32 long pairs at 900×620, Undo/Redo and actual
`.igs` Save/reopen. Real service/synchronization tests additionally cover legacy
no-ops, captured values while updates are pending and crash-shadow recovery.
Native Save with a dynamic update still pending and native busy/reload states
are not separate reproduced scenarios in this slice.

Renderer Generate, images-per-click wiring, transport/model qualification,
full conditioning and release inference remain open. Successful expansion
is not a generation-readiness check.

## Vue Prototype Coverage

The shared preview modal parses non-nested brace alternatives directly from `GenerationPrompt.text`, produces deterministic Cartesian prompt pairs and exposes `maxPrompts` plus `per-iteration` / `per-prompt` seed behavior. Opening preview is transient; changing these settings is a Project generation-draft mutation. Nested braces and malformed expressions show local errors.

Generate flushes the active prompt edit, expands the frozen plain text, multiplies the pairs by images-per-click and blocks the action when the result exceeds 100 mock jobs. Queue items freeze each concrete prompt, the scheduled actual seed, requested seed policy and cloned positive/negative embedding refs; Danbooru and LoRA-trigger metadata are not stored. The mock completion advances a session-owned cursor only after a candidate reaches `completed`; cancel and queue pruning do not change it. Accepting a result copies its frozen actual seed, requested policy and selected seed behavior into in-memory provenance. The prototype does not execute a production worker seed scheduler or persist the cursor/provenance to `.igs` or an app-managed recovery store.

## Acceptance Criteria

- User can preview expanded prompts before generation.
- Invalid dynamic syntax is visible before queueing a job.
- Dynamic prompt settings affect the generated job list.
- `Reuse` uses the last completed actual seed of the current Project and cannot
  generate until one exists; canceled/failed jobs cannot supply that seed.
- Concrete expanded prompts are stored in accepted-result provenance.
- Wildcard expansion is not supported.
