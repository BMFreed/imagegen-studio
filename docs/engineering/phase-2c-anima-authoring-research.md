# Phase 2c: Anima Project authoring

## Scope and baseline

Research baseline: clean `1a776f1`, 2026-10-05. Authorized continuation of the
implementation roadmap. This checkpoint connects **authoring**, not Anima
Generate admission: public Main preparation, queue, Retry, immutable accepted
provenance and release qualification remain subsequent work.

Sources: [PP-004/005/006/007](../product-promises.md),
[generation settings](../features/project/generate-mode/generation-settings.md),
[prompt weighting](../features/project/generate-mode/prompt-weighting.md),
[presets](../features/presets.md),
[research protocol](./research-protocol.md),
[review protocol](./review-protocol.md),
[UI component contracts](./ui-component-contracts.md), and the existing
`frontend-design-principles`/`ui-audit` skills. Preserve the approved design;
this is not a new palette or design-direction exercise.

The draft persistence/IPC part is high risk because authored state crosses
history, recovery and explicit Save. Prompt editing and prototype composition
are medium risk. No worker, numerical pipeline, runtime or GPU changes are in
scope. Production preset storage is not implemented; prototype preset evidence
cannot establish that boundary.

## Confirmed findings

- Production `ProjectView` disables the Illustrious pair for Anima but has no
  native selector. The actual shared IPC validates Illustrious pairs, so a
  renderer-only selector cannot implement the feature.
- `GenerationDraftSchema` is separate from frozen accepted-result configuration.
  The optional native choice belongs only to the authored draft in this slice.
  Existing model switching preserves other authored settings.
- Pinned Invoke at `~/Work/sources/InvokeAI` has one native Anima
  Scheduler with Euler, Heun, DPM++ 2M, DPM++ 2M SDE, ER-SDE and LCM. The existing
  IGS typed flow scheduler is the exhaustive key source. Invoke defaults Euler;
  IGS starts new sampling settings unset, so that default must not be imported.
- Existing attention tests pass 20/20, but actual helper → CodeMirror → Anima
  compiler probes produce six behavioral regression failures: conflicting
  explicit weights, ineffective implicit Increase, incorrect implicit round
  trips, erased escaped markers, invalid bare-colon wrapping and decimal
  precision loss. Dynamic-prompt expansion also exposes explicit-weight
  conflicts. These are executed assertions, not collection errors.
- Prototype model refs lack explicit family metadata. Prototype sampling payload
  requires two SD strings; its Apply replaces the entire section. A native-only
  section therefore needs an additive shape and member-level copy semantics.
- Generic prompt diagnostics currently miss conflicting colon/suffix and mixed
  markers. Refusing these operations silently would not explain the unchanged
  text to the user.

Read-only evidence is under
`~/.codex/artifacts/imagegen-studio/anima-authoring-2026-10-05/`:
`main/authoring-sampling-map.json`, `main/current-boundary-probe.json`,
`editor/research-map.md`, `editor/current-behavior.json`,
`editor/current-red.log`, and
`reference/authoring-reference-and-visual-plan.json`.

## Implementation decisions

1. Add finite optional `sampling.animaMethod`, a narrow typed IPC change, and
   ordinary draft mutation/Undo/shadow/Save handling. No choice means absent;
   clear deletes the member; never invent Euler. Preserve the inactive
   Illustrious pair and native choice on family switches. Existing `.igs`
   documents stay valid. Accepted Raster DTOs remain unchanged.
2. Use one labeled native selector for Anima, with the six existing flow keys.
   No SD scheduler selector applies to Anima. Unsupported Advanced values are
   preserved and explained, with deliberate Reset; they are not new algorithms.
3. Prototype refs declare optional family metadata; never infer it from display
   labels. Native-only prototype sampling can omit pair members. Applying a
   sampling section copies only supplied members; absent members preserve the
   destination. Section deselection and detached source ownership remain intact.
4. Branch attention only for exact family `anima`. Preserve the old helper for
   Illustrious/null/unknown. Reuse common phrase/selection targeting and minimal
   CodeMirror transactions. Buttons and keymap read the current family at action
   time. Plain text, reversed/native selection, focus-session history and
   embedding sidecars keep their existing ownership.
5. Add a shared escape-aware authoring analyser, separate from the 16 KiB
   generation compiler. Preserve inner weights and literal text. Implicit outer
   groups represent one positive level; scalar weights move by 0.1 without
   rounding away authored precision; marker counts retain existing semantics.
   Escape previously literal non-URL colons only when a new group requires it.
   Real dynamic expansion plus the existing compiler checks equivalence.
6. Malformed/conflicting or grammar-cutting selections are unchanged and receive
   a narrow family-aware advisory through the existing diagnostics UI. Share the
   analyser with this diagnostic rather than a second grammar. Work must remain
   bounded by the existing authoring envelope: pathological numeric exponents
   cannot trigger enormous power/string allocation. Do not add model weight
   caps or apply the generation-size limit to editing.
7. A root self-review probe of 156 concrete authoring operations found two
   additional nested saved-suffix failures: Down on `((word).5)` or
   `((word)+0.5)` needs a neutral outer group, but the existing compiler consumed
   the parent-owned colon as part of the inner suffix. Narrowly stop a nested
   group suffix at its parent's colon. Top-level `(word).5:foo` still refuses;
   previously accepted cleaned text/weights stay unchanged. This additive syntax
   correction preserves inner markup, uses the existing weighting version and
   does not change the Python compiled-input contract or numerical pipeline.
   A terminal literal backslash also requires protection before appended syntax;
   actual compiler probes cover odd/even escapes and the `\q` neighbor.

## Verification and acceptance

Production invariants: each finite native choice and clear cross actual IPC/Main;
invalid keys are rejected; Undo/Redo, shadow and real writer/loader Save/reopen
retain the choice; old documents and Illustrious pairs remain unchanged; public
Anima Generate remains refused. Unknown accepted provenance stays explicitly
unavailable, rather than fabricated from the draft.

Attention invariants: compiled cleaned text and proportional weights for
implicit/explicit/numeric/marker/nested forms, both signs, escapes, precision,
dynamic branches, reversed and partial selections; malformed input unchanged
with visible advisory; actual CodeMirror history and current-family keyboard
wiring. Verify a neighboring Illustrious case and sidecar preservation.

Prototype invariants: explicit family wiring through Project and shared preset
editor, native-only and missing-member Apply, section deselection, source preset
unchanged and no automatic method default. This proves mock authoring only.

Use T3 native preview for prototype inspection. A separate existing isolated
Electron harness is needed for preload/IPC and `.igs`, not as an unavailable-
browser fallback. Seed a saved Anima draft/catalog as a named precondition;
fake catalog bytes do not prove model qualification or generation. Inspect
actual normal/minimum-window screenshots and both prompt interaction states.

Run appropriate app tests, typecheck, lint, full required prototype tests and
fresh Electron authoring smoke. Execute semantic mutations in isolated copies
against persistence, missing-member preservation and family-aware editor
invariants; collection/setup failures do not count as killed mutations.
Record commands, executed/failed/skipped counts, source revision and limitations.
Update promise bodies and matrix together without raising public readiness.

The authoring labels registry does not import the numerical plan into the
prototype's stricter TypeScript graph. An app-typechecked equality assertion
against `AnimaFlowScheduler`, plus compiling each listed method with the real
flow compiler, verifies the finite list without weakening prototype checks.

## Outcome

Completed the authoring checkpoint on 2026-10-05. All six native choices and
clear now cross the real Project control, typed IPC, Main history, recovery
shadow and explicit `.igs` writer/loader. Missing choices remain absent;
switching families preserves inactive settings. A native no-op also preserves
the active grouped prompt Undo session.

Anima attention actions now interpret the existing outer operator, preserve
decimal precision, inner markup and escapes, and refuse grammar-cutting
selections with a visible advisory. Actual compiler checks cover terminal
backslashes and the narrowly corrected nested-suffix colon boundary. The
Electron pass found a duplicate static/transient warning; it is fixed with a
real CodeMirror field regression. Project and preset prototype controls share
explicit family metadata and supplied-member Apply semantics. New Reset
actions were corrected to the existing compact icon-button composition after
visual review.

Final executed evidence is under the artifact directory above:

| Check                                                              | Result                                                                                 | Evidence                                                                       |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm run app:test`                                                | 1301 passed; 0 failed/skipped                                                          | `app-test-final.log`                                                           |
| `pnpm run prototype:test`                                          | 173 passed; 0 failed/skipped; Playwright persisted `status: passed`                    | `prototype-test-final.log`, `root-final-evidence.json`                         |
| Focused editor/compiler/CodeMirror tests                           | 42 passed                                                                              | `editor/final-evidence.json`                                                   |
| Focused schema/Main/sync tests                                     | 107 passed                                                                             | `main/authoring-sampling-evidence.json`                                        |
| Focused native/Advanced prototype tests                            | 8 passed                                                                               | `main/authoring-sampling-evidence.json`                                        |
| Built Electron authoring smoke                                     | 22 passed; 0 page errors                                                               | `reference/electron-final/native-report.json`                                  |
| Isolated semantic mutations                                        | 18 editor + 15 draft/prototype mutations killed; green baselines and restored controls | `editor/mutation-report.json`, `main/mutations-final-strengthened/report.json` |
| Root helper → compiler probes                                      | 160 operations; 0 failed; 4 invalid source candidates excluded                         | `root-semantic-probe.json`                                                     |
| `pnpm run typecheck`, `pnpm run lint`, fresh `pnpm run app:build`  | Passed                                                                                 | `typecheck-final.log`, `lint-final.log`, `build-final.log`                     |
| Changed-file Prettier, local document links and `git diff --check` | Passed                                                                                 | `root-final-evidence.json`                                                     |

Focused counts are subsets, not additional tests added to the full-suite count.
The full prototype runner printed all 173 passes and wrote a passing last-run
record; its enclosing command reported SIGTERM (143) after the completed
summary. The exact shutdown cause was not established, so that command exit is
recorded separately rather than reported as zero.

Earlier concurrent global runs had one unchanged model-install 5-second timeout
and one unchanged prototype Seed scenario timeout. The final standalone app
suite and Seed 4/4 pass, followed by the full prototype 173/173 pass, retain the
original assertions and timeouts. Those earlier runs remain in
`app-test-parallel-timeout.log` and `prototype-test-concurrent-timeout.log`;
the precise timing cause is not established. A copied mutation baseline missing
worker fixtures, interrupted/misdirected prototype runs, and provisional
Electron fixture/locator failures are retained in the owner evidence and
`reference/electron-attempt-index.json`; none count as killed mutations or
successful verification. An initial surviving no-op mutation exposed a missing
grouped-history assertion. After strengthening that real service invariant,
the complete 15-mutation campaign was repeated and all mutations were killed.

The inspected production renderer is `index-B6sxGijm.js`, SHA-256
`823ef3fb1b5f2dfdfed27e46cc070762baad2ceb6e3c5a45f9d28c934839d26c`.
The native report pins Main, preload, renderer and source hashes. The root
manifest pins every changed source file and validates owner freezes against the
final tree. Eight production screenshots at 1380×900 / 900×620 and eight
prototype screenshots at 1440×900 / 1280×800 were opened and reviewed for the
named controls and interaction states. Native T3 prototype snapshots failed;
that limitation is recorded in `reference/t3-prototype-observation.json`.
Prototype appearance evidence comes from the existing repository Playwright
captures, not a successful T3 visual inspection. See
`reference/electron-visual-review.json` and
`reference/prototype-visual-review.json`.

Review combines root self-review, source-aware owner verification, and separate
Electron/visual inspection; it is not a blind audit of the entire application.
Catalog fixtures and the ready fake worker prove authoring/persistence only,
not trained-model loading, CUDA inference or model-selection qualification.
Preset Apply/Save evidence is in-memory prototype behavior. No Python/runtime
or numerical sampling algorithms changed. Public Main Anima Generate, durable
queue/Retry/dispatch and immutable accepted provenance remain closed and are
the next checkpoints; promise bodies and matrix retain that boundary. No
additional product decision is open for this completed slice.
