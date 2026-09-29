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
