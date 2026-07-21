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

Supported modes should include:

- keep the same base seed across expanded prompts where appropriate;
- advance/new seed per expanded prompt where appropriate.

The selected seed behavior is stored in accepted-result provenance.

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

## Vue Prototype Coverage

The shared preview modal parses non-nested brace alternatives directly from `GenerationPrompt.text`, produces deterministic Cartesian prompt pairs and exposes `maxPrompts` plus `per-iteration` / `per-prompt` seed behavior. Opening preview is transient; changing these settings is a Project generation-draft mutation. Nested braces and malformed expressions show local errors.

Generate flushes the active prompt edit, expands the frozen plain text, multiplies the pairs by images-per-click and blocks the action when the result exceeds 100 mock jobs. Queue items freeze each concrete prompt plus cloned positive/negative embedding refs; Danbooru and LoRA-trigger metadata are not stored. The prototype does not execute a production seed scheduler or write accepted-result provenance.

## Acceptance Criteria

- User can preview expanded prompts before generation.
- Invalid dynamic syntax is visible before queueing a job.
- Dynamic prompt settings affect the generated job list.
- Concrete expanded prompts are stored in accepted-result provenance.
- Wildcard expansion is not supported.
