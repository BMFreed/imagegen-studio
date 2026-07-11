# GenerationResults And Staging

## Feature

`GenerationResults` is the canvas-adjacent staging surface for pending, running and completed generation candidates.

A completed candidate is not project state yet. The user previews one candidate at a time, selects one or more candidates to keep and explicitly adds the selected set to the project.

This applies to:

- normal generation targeting Project Canvas;
- Smart Patch Layer generation;
- dynamic prompting and multi-output generation.

## Reference

Primary reference: InvokeAI Canvas `StagingArea`.

Useful Invoke source areas:

- `features/controlLayers/components/StagingArea/state.ts` — flattened queue outputs, focused candidate, progress and auto-switch;
- `features/controlLayers/components/StagingArea/context.tsx` — Accept/Discard lifecycle and conversion of a staged image into a Raster Layer;
- `features/controlLayers/components/StagingArea/StagingAreaToolbar.tsx` — canvas-adjacent actions;
- `features/controlLayers/components/StagingArea/StagingAreaItemsList.tsx` — thumbnail strip;
- `features/controlLayers/konva/CanvasStagingAreaModule.ts` — isolated preview layer over the canvas.

ImageGen Studio keeps this staging model but extends it with explicit multi-selection. Invoke's primary `Accept` commits one focused candidate; ImageGen Studio can add several selected candidates in one project mutation.

## ImageGen Studio Decision

The product model is:

```text
completed generation = temporary staging candidate
selected + Add to Project = persistent Raster Layer or Smart Patch variant
```

Generation completion alone must not mutate `.igs`, create an undo step or add an entry to project/global result history.

`GenerationResults` is the visible UI name. The domain/session model should use a less ambiguous name such as `GenerationStagingSession`.

## State Model

```ts
type GenerationCandidateStatus = 'pending' | 'running' | 'completed' | 'failed' | 'canceled';

interface GenerationCandidate {
  assetId?: string;
  id: string;
  imageIndex: number;
  queueItemId: string;
  status: GenerationCandidateStatus;
}

interface GenerationStagingSession {
  candidates: GenerationCandidate[];
  focusedCandidateId?: string;
  selectedCandidateIds: string[];
  target: { kind: 'project-canvas' } | { kind: 'smart-patch'; layerId: string };
}
```

The two selection concepts are intentionally separate:

- `focusedCandidateId` — the single candidate shown on canvas;
- `selectedCandidateIds` — the completed candidates that will be added to Project.

Changing the focused preview must not silently change the multi-selection mask.

## Candidate Lifecycle

When generation starts:

- Queue Manager receives frozen jobs;
- `GenerationResults` shows pending/running entries for the current staging session;
- progress images may be shown in the isolated canvas preview layer;
- project layers and Smart Patch variants are unchanged.

When a candidate completes:

- its temporary raster asset becomes previewable;
- the first completed candidate becomes focused and selected by default;
- later auto-switch behavior may change focus, but never changes `selectedCandidateIds`;
- the candidate remains outside persistent project state until explicit acceptance.

Candidate assets live in application-managed temporary/cache storage. They are not placed in the main `.igs` project package merely because the worker completed successfully.

## Multi-Selection UX

The thumbnail strip supports:

- click a thumbnail to focus/preview it;
- checkbox a completed candidate to include/exclude it from acceptance;
- `Select all`;
- `Clear selection`;
- previous/next focus navigation;
- show/hide focused result on canvas;
- remove/discard one candidate;
- `Discard All`;
- context-specific primary action with selected count.

Primary labels:

```text
Add 1 as Layer
Add 3 as Layers
Add 1 as Variant
Add 3 as Variants
```

The primary action is disabled when no completed candidates are selected.

The accepted anchor candidate is resolved deterministically:

- use `focusedCandidateId` when the focused candidate is selected;
- otherwise use the first selected candidate in stable candidate order.

That anchor becomes the visible Raster Layer or active Smart Patch variant after acceptance. Focusing an unselected candidate for comparison therefore never changes the selection implicitly.

Acceptance does not need to wait for the full batch. If the user accepts completed candidates while sibling jobs are still pending or running, the confirmation/action copy must explain that the remaining jobs will be canceled and unselected candidates discarded. Confirming ends the staging session, requests cancellation for unfinished sibling jobs and commits only the completed selected candidates.

## Normal Project Canvas Acceptance

For a `project-canvas` target, every selected candidate becomes an independent Raster Layer.

Rules:

- selected candidates are inserted as adjacent layers in deterministic candidate order;
- the accepted anchor candidate becomes selected and visible;
- other accepted full-canvas candidates start hidden so opaque alternatives do not cover one another;
- all pre-existing project layers remain unchanged;
- an existing selected Raster Layer is never overwritten implicitly;
- unselected candidates are discarded when the staging session closes;
- accepting `N` candidates is one grouped undo step, while the resulting layers remain independently editable afterward.

## Smart Patch Acceptance

For a `smart-patch` target, every selected candidate becomes a raster variant inside that Smart Patch Layer, not a new top-level project layer.

Rules:

- the accepted anchor candidate becomes the active variant;
- other accepted candidates become inactive variants;
- the previously active variant remains stored but becomes inactive;
- only one variant is active/visible at a time;
- unselected candidates are discarded when the staging session closes;
- accepting `N` variants is one grouped undo step.

This preserves Smart Patch Layer as a self-contained generative entity.

## Auto-Switch

Supported focus modes may follow Invoke:

- `off`;
- `switch_on_start`;
- `switch_on_finish`.

Auto-switch changes only `focusedCandidateId`. It must never add or remove candidates from `selectedCandidateIds`.

`switch_on_finish` is the preferred initial default because it moves preview focus only when a real image is available.

## Undo, Queue And History Boundaries

Not undoable:

- enqueueing jobs;
- job status/progress;
- focusing or selecting staging candidates;
- discarding candidates;
- worker completion by itself.

Undoable:

- `Add N as Layers`;
- `Add N as Variants`.

Queue Manager owns job lifecycle and remains prunable operational history. It is not generation result history.

Only accepted layers/variants receive immutable generation provenance and derived global history entries. Discarded candidates receive neither.

Undo removes the accepted project mutation; it does not reconstruct the previous staging session.

## Placement

`GenerationResults` is a collapsible bottom tray inside the central canvas workspace:

- thumbnail strip above a compact toolbar;
- selected candidate preview rendered through a dedicated non-project canvas layer;
- collapsed state preserves canvas space;
- the tray is absent when no staging session exists.

It is not a permanent right sidebar and does not replace Queue Manager or the layer stack.

## Vue Prototype Coverage

The `staging` scenario contains three completed candidates, one running job and two selected completed candidates. Focus and acceptance selection are separate. The bottom tray supports focus, checkbox selection, Select all/Clear selection, previous/next, preview visibility, single-candidate discard, Discard All and context-specific multi-accept labels.

Normal acceptance creates one independent Raster Layer per selected candidate. Smart Patch acceptance creates variants owned by the selected Smart Patch. The focused selected candidate, or otherwise the first selected candidate in stable order, becomes the accepted anchor. If unfinished sibling jobs exist, acceptance uses a confirmation before canceling them and discarding unselected candidates. One acceptance produces one Project history entry and undo does not recreate staging.

Candidate imagery, progress and temporary assets are deterministic CSS/in-memory mocks. The prototype does not write cache files, `.igs` assets, global result-history rows or production provenance records.

## Acceptance Criteria

- Completed worker outputs remain temporary candidates until explicit acceptance.
- User can focus one candidate and independently select one or more candidates.
- Normal acceptance creates one Raster Layer per selected candidate.
- Smart Patch acceptance creates one variant per selected candidate.
- The focused selected result, or otherwise the first selected result, becomes the visible/active accepted anchor; accepted alternatives remain hidden/inactive.
- Accepting before a batch finishes explicitly cancels unfinished sibling jobs and discards unselected candidates.
- Existing project content is never overwritten implicitly.
- One multi-accept action creates one grouped undo step.
- Candidate navigation, selection and discard do not create undo steps.
- Only accepted results receive generation provenance and global history entries.
- Queue Manager and `GenerationResults` remain distinct surfaces with distinct ownership.
