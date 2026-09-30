# Phase 2B: persisted dynamic settings and production prompt preview

Base: `56378f0`, clean `master` aligned with `origin/master`. Risk: high because
the change extends the portable draft and recovery/history boundaries. Sources:
[PP-007](../product-promises.md#pp-007-проект-принадлежит-пользователю),
[PP-008](../product-promises.md#pp-008-генерация-меняет-проект-только-по-явному-решению),
[dynamic prompting](../features/project/generate-mode/dynamic-prompting.md),
[bounded batch planner](./phase-2b-batch-planning-research.md).

## Confirmed baseline and scope

The pure production planner and internal prepared-batch admission exist.
`generationDraft` has no dynamic settings; strict schema, incremental draft IPC,
preload response validation and optimistic renderer synchronization must all
recognize the new value. The prototype owns `dynamicPrompt.maxPrompts` and
`seedBehavior` in its draft (defaults 100 and `per-iteration`), while images per
click is a separate transient model. Production prompt actions already have a
hidden `dynamicPreview` slot. Production Generate is not yet exposed.

This slice stores only `generationDraft.dynamicPrompt` and opens one shared
preview modal from either prompt toolbar. Use the approved prototype composition,
existing Naive components/theme and the real bounded planner. Do not implement
Generate, add fake jobs, call inference/model qualification, choose random seeds,
persist preview pairs/errors or change the prototype's mock behavior. Preview
uses one iteration at this checkpoint; images-per-click wiring is a later Generate
boundary. Seed behavior is explained, rather than inventing a preview seed for
Random/Reuse. Existing accepted provenance and frozen jobs remain immutable.

## Ownership and compatibility

UI toolbar → modal with current positive/negative plain text and effective settings
→ ordinary typed draft change → optimistic `ProjectDraftSync` → existing preload
IPC → `ProjectService` → coordinator/history/shadow → explicit Save/real loader.
Opening, parsing or closing the modal never mutates a document. Actual settings
changes belong to Project dirty/recovery/Undo and do not rewrite accepted results.
Save/window close must flush them through the existing serialized draft path.

The v1 schema adds an optional strict settings object. New documents may store
explicit defaults; legacy missing fields stay absent when read/opened and derive
defaults only for use. No schema migration, file rewrite on open or synthesized
historical seed behavior is required. An effective-default no-op must preserve
revision/dirty state, including a legacy document without the object. Guard the
full object at IPC and package boundaries; reject unknown keys, invalid counts
and unknown enums before any mutation. Snapshot the new nested change object
before asynchronous synchronization so caller mutation cannot alter pending IPC.

## Parameter register

| Parameter              | Value and source                                                 | Overflow/absence behavior                                                        |
| ---------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Max prompt settings    | Integer 1..100, prototype/feature default 100                    | Invalid stored/IPC value refuses; missing legacy settings use effective defaults |
| Seed behavior          | `per-iteration` or `per-prompt`, prototype enum/default          | Unknown refuses; legacy effective default is `per-iteration`                     |
| Job cap                | 32, measured shared production policy                            | Planner refuses whole overflowing preview; no silent second truncation           |
| Iterations in preview  | 1, this slice's explicit boundary                                | No persisted images-per-click added                                              |
| Source/concrete prompt | 16 KiB UTF-8, production planner/worker envelope                 | Parse/byte errors shown in preview; editor's larger document limit is unchanged  |
| Cartesian products     | Bounded prefix, pure production planner                          | Full syntax checked; duplicates/dollar text/escapes preserved                    |
| Modal extent           | Approved 720px prototype composition, clamped to native viewport | Scroll content while controls and Close stay reachable                           |

`maxPrompts` limits the selected pair prefix and returns explicit truncation.
It is distinct from the 32-job admission limit. A default-100 setting can yield
a smaller valid plan, or a whole-plan refusal; do not silently reduce it to 32.
The preview proves prompt/seed planning rules only, not model capabilities,
escaped request/manifest bytes, free disk or GPU inference readiness. Literal
braces retained by the pure grammar remain an explicit current worker limitation.

## Failures, neighbors and verification

Malformed/oversized text and job overflow must show errors, retain authored text
and allow close/correction. Truncation must show a warning. Long strings, many
pairs and minimum native window size must not clip controls or make the modal
unclosable. Both toolbars open the same pair preview. Busy/reload states disable
settings mutation; closing the modal remains available. Editor focus/history,
the existing prompt-help contract and queued draft edits must remain intact.

Obtain missing-behavior red tests before implementation. Real service tests cover
strict guards, no-op defaults, settings edits, Undo/Redo, byte-unchanged portable
file before Save, Save/reopen, legacy absence and crash-shadow recovery. At least
one synchronization case calls the actual service rather than a test-local draft
implementation. Native Electron checks enter through toolbar/settings,
Save and reopen/read the real `.igs`, plus error/truncation/scroll states and the
minimum supported viewport. Inspect actual screenshots; a browser-only mock does
not prove Electron IPC or portable persistence. Run an isolated semantic mutation
on one new persistence/sync invariant, then restore and confirm green.

Run app tests, typecheck, lint, native smoke, scoped formatting and document links.
Prototype UI is unchanged, so its tests are needed only if that scope changes.
Update relevant promise matrix rows and sections, supporting contracts and roadmap
without claiming Generate, full conditioning or release inference completion.

## Executed verification and review

Verification targets the final production/source/script working tree over
`56378f0`; it includes the new untracked files. No prototype UI, worker/inference,
Generate IPC, acceptance or existing provenance serializer was changed.
The new modal uses installed Naive APIs (`contentStyle`, number `inputProps` and
precision) and the existing renderer theme/tokens; it is content-sized with a
720px maximum and a 380px scroll region, clamped to the actual native viewport.

| Observable invariant                                                               | Boundary and executed evidence                                                                                                                                       | Limits                                                                                                            |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Strict optional settings, owned defaults and clean legacy no-op                    | Real schema/API guard tests; actual `ProjectService` with `.igs` writer/loader, filesystem, SQLite and shadow                                                        | Invalid IPC is exercised through the real service guard; native transport does not inject every malformed variant |
| Settings survive edit/Undo/Redo/recovery/Save                                      | Actual service and native renderer → preload/IPC → main → `.igs` → reopen                                                                                            | Native Save waits for settings acknowledgement; pending dynamic Save is not a separate native reproduced case     |
| Queued/retried settings retain captured values and another Project stays unchanged | Actual `ProjectDraftSync` calling real `ProjectService`, controlled first-send gate, observable flush, shadow restore and portable Save                              | Only the timing gate is substituted; save/draft/history/storage owners remain real                                |
| Opening preview changes no source, seed, dirty/history or portable bytes           | Both native prompt toolbars; inspect acknowledged Project and saved package before/after close                                                                       | Source text edits and explicit settings changes legitimately dirty the document                                   |
| Ordered pairs, prefix truncation, malformed syntax and cap32 refusal               | Actual production planner/modal through native Electron toolbar; positive outer/negative inner order checked                                                         | One iteration; no model, request-byte preflight, Random selection or inference is performed                       |
| Long list remains usable                                                           | 32 long concrete pairs at native 900×620 and 1380×900; actual bounds and last article scrolled into view; final PNGs inspected                                       | Supported desktop window range, not a mobile/accessibility qualification                                          |
| Disabled settings retain an available Close                                        | Source guards and real production component with `disabled=true` in a transient T3 browser fixture; disabled number field/Naive selection and enabled Close observed | Fixture has no IPC; completed Close hiding and native busy/reload transition were not separately reproduced       |

Proper missing-behavior baseline: six focused storage/schema/service failures
on the base before implementation. A test-fixture title typo was fixed before
that saved baseline. The native base build also fails at the missing toolbar
button, rather than a selector/layout or dependency failure. That native red
is retained in the executing agent's command history, not a separate log file.
The corresponding implemented native flow passes in the preserved final log.

The focused new suite passes 10/10. In an isolated source copy, removing the
nested `ProjectDraftSync.change` snapshot causes **two semantic failures** with
four neighboring cases passing: queued 30 becomes caller-mutated 98 and retried
7 becomes 99. Restoring the snapshot gives 10/10 again. An earlier brief mutation
in the working tree was restored and is excluded from isolated evidence; a
copied-fixture pnpm reconciliation failure is also excluded. The artifact README
records both exceptions, commands and restoration. Full app suite: **593 passed,
0 failed, 0 skipped**. Typecheck and lint passed.

The final `pnpm run app:smoke` built successfully but its first desktop process
hit the previously documented native size clamp (`1440×900` requested,
`900×620` observed) in unchanged Home layout checks, before the new helper.
A sequential unchanged-build `pnpm exec tsx scripts/smoke-desktop.mjs` retry
passed both ordinary desktop and crash-shadow scenarios. The separate
`pnpm exec tsx scripts/smoke-generation-results.mjs` also passed recovery,
PNG export, cancellation/discard and confirmed early Add/neighbor/Undo/recovery/
portable Save checks, with no native Results page errors. Thus all three
constituents of `app:smoke` passed; the first composite invocation itself failed.
The existing [Wayland environment note](./phase-2b-electron-shutdown.md#проверки-и-границы-evidence-исходного-checkpoint)
records the recommended `ELECTRON_OZONE_PLATFORM_HINT=wayland` launch.
Large bundle and Wayland/Vulkan startup messages remain non-fatal existing
build/environment observations; no release/runtime qualification is inferred.

Root performed runtime self-review using T3 interactions and inspected the final
native PNGs. The T3 component-only fixture is not portable-persistence evidence;
its snapshot capture failed on later disabled-state requests. Focused disabled
inspection worked, but subsequent Close-hiding inspection timed out and the T3
automation host disconnected; no completed hiding assertion is claimed for
that fixture. Native PNGs are the appearance evidence.
A separate agent performed a source-aware read-only pass over the dirty tree
and found no concrete blocker. This is explicitly not a blind review. It
confirmed shared-cap handling, no RNG/main admission, strict guards, snapshots
before awaits, immutable provenance scope and existing Save/tab/window flush
paths. It identified the pending-Save native coverage limit recorded above.

Logs, mutation README and final native images are stored outside the checkout at
`/home/user/.codex/artifacts/imagegen-studio/dynamic-preview-2026-09-30/`.
Scoped formatting, diff whitespace and local Markdown targets are checked before
commit. Promise matrix rows and bodies, storage/dynamic contracts and the roadmap
are updated together; public readiness remains **not yet promised**.

## Remaining boundary

Next Generate integration must bind images-per-click and the saved settings to
one frozen preparation, resolve the actual seed once, qualify the real model and
each varied transport request, then use atomic admission. Preview success must
not be reported as model readiness. Full Invoke-like conditioning, app-owned
release ML runtime, Smart Patch and broader generation workflows remain open.
No new user product decision is required for this authoring/storage slice.
