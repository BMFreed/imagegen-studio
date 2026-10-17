# Smart Patch variant lifecycle and current state

## Scope and risk

Base `f18596c`, authorized continuation of phase 4. This implementation and
self-review changes accepted variant ownership, history and IPC: high risk.
Supporting contracts are PP-007/008, Smart Patch Layer, generation provenance,
document lifecycle and Undo/Redo. Complete public Smart Generate/Add, accepted
history navigation, Compare/Preset and trained installed inference stay separate.

The current next step uses the independent repository CPU environment. The
historical installed qualification pool was explicitly retired by user-requested
cleanup; it must not be resumed or called compatible. Keep existing LaMa/control
fixtures and compact campaign evidence. Initial artifacts: 2.7 GiB, 87 GiB free.

## Boundaries and invariants

Renderer browser → validated preload/API → Main shared document action gate →
ProjectService → existing coordinator/shadow/history → explicit package Save.
Select changes only active membership; rename changes only the nominated name;
delete removes only that variant. Deleting an inactive member preserves the
active ID. Deleting the active member selects the next surviving index, or the
preceding last member. Deleting the last leaves the same empty Patch with its
mask, geometry and generation draft. This neighbor choice is a local deterministic
decision; the product contract does not prescribe one.

Each actual edit creates one Undo step and dirty/shadow state, never implicit
Save. No-op creates none. No direct file deletion is allowed: coordinator owns
retention for Undo/Redo, including Delete → Save → Undo. Stale document/revision,
missing/foreign member and locked mutations refuse without changing the document.
Hidden stored patches remain editable. Shared acceptance/close fencing remains
authoritative. Renderer flushes pending authored drafts before mutation and binds
the acknowledged owner; it cannot replay a stale destructive command silently.

Freshness is derived, never persisted or written back into immutable provenance.
Stored variants compare against their explicit current owner: historical frozen
document/layer/mask IDs do not orphan copies. Mask pixel identity and bounds
matter; an edit counter or renamed ownership alone does not. Relevant authored
differences prove outdated even without a source read. Otherwise missing source
verification is unverified, not ready. Actual source capture includes only
material below the current target, excluding the target and layers above, and
rechecks the exact owner/epoch/revision after asynchronous work. Source failure
cannot silently become a successful match. Locked/hidden presentation does not
suppress freshness or destroy pixels.

Resource diagnostics inspect current exact-bound configured resources separately
from saved pixels/freshness. Disabled LoRAs and inactive embedding references do
not become missing-resource failures. Catalog failure is unknown availability;
an equal file at another registry binding is not an automatic relink. Matching
inputs/resources never constitutes public Generate or runtime readiness.

## Alternatives and refusal cases

Reusing proposal-only freshness unchanged would bind historical ownership and
return blocked before inspecting hidden/locked saved pixels. A stored assessment
shares input normalization but has an explicit current owner. Persisting a status
bit would drift after Undo, resource removal and lower-layer edits. Immediate
unlink on Delete would break Undo after Save. A separate history/storage owner
would duplicate the already qualified coordinator; all edits use its existing
atomic document publication and retention boundary.

## Parameters and verification plan

Inherited limits: 10,000 archive entries/variant members, 1,024 UTF-8 bytes for
names, 16 MiB project JSON, 32 MiB contribution PNG, 2,048 source side and 4M
source pixels. These are safety decisions, not measured product capacities. No
new inference/GPU limit or format version is introduced. Source capture beyond
the existing CPU limit stays unverified with a visible explanation; stored
variant actions remain available.

Use actual Service/coordinator/SQLite/writer/loader/shadow, with fixture adoption
declared as setup rather than public Add. Cover each action, final deletion,
neighbor controls, no-op, conflict/lock refusal, Save/reopen, recovery, and Undo
after saved deletion. Verify actual built Electron IPC/UI, visible active pixels,
browser focus/error/lock states and reopening. Assess source differences with
actual CPU composition where claimed; deterministic failure seams are declared.
Test sensitivity with isolated semantic mutations and neighboring GREEN controls,
then prove unchanged original sources and physical process exit.

Root serializes checks under finite cgroups, at most 4 GiB aggregate, zero swap;
native launcher 1 GiB and native actor 2 GiB retain independent deadlines and
physical-exit evidence. No ML download, installed runtime or model copy. Record
executed checks, actual limitations, cleanup and final evidence below.

## Executed evidence and review

Evidence root:
`~/.codex/artifacts/imagegen-studio/runs/smart-patch-variant-lifecycle/20261016-lifecycle/`.
The run continued across local midnight; its original evidence path is unchanged.
Reports, exact commands, source/bundle hashes and bounded logs remain there.

- `typecheck-delivery`: `pnpm run typecheck`, PASS, 20.44 s, 1.78 GiB peak.
- `lint-fix`: all four repository lint partitions, PASS, 59.23 s, 2.66 GiB
  peak. The final native harness edits also pass focused ESLint and Prettier.
- `build-delivery`: production build PASS, 1.80 s, 1.19 GiB peak. The existing
  renderer chunk-size warning remains. No prototype source changed, so
  `prototype:test` is outside this change's required checks.
- `focused-final`: 76 tests pass, no failures or skips. This includes actual
  independent CPU source composition, owned-worker startup/failure tests and
  renderer owner guards. The final broad suite is recorded below.
- `affected-final`: **2,398 pass, zero failures/skips**, 277.02 s TAP,
  1.26 GiB peak, zero swap and no remaining group PIDs. The exact serial command
  covers `src/main/db/*.test.ts`, `src/main/projects/*.test.ts`,
  `src/shared/projects/*.test.ts`, `src/shared/presets/*.test.ts` and
  `src/renderer/components/*.test.ts`, with the existing pinned LaMa path enabled.
- `native-complete-report.json`: 20 checks PASS in the actual built Electron,
  with real SQLite, preload/IPC, signed resources, Konva pixels, Save and ZIP
  readback. Its own report-specific `.artifacts` directory retains six screenshots
  and the final `.igs` with both immutable variant records and exact images.
  Native groups have independent deadlines, zero swap and confirmed physical
  exit; the bounded launcher peaked at 0.84 GiB.

The native precondition uses the real Project writer to adopt two declared
literal ICC RGBA fixtures, green and purple, at distinct overlapping frozen
positions. Overlap, active-only and inactive-only pixel probes prove that only
the selected image contributes. This is an existing nonempty Patch fixture,
not a public Add or generated-model result. The native run also exercises
Escape/Cancel without document/history changes, focus restoration, locked
viewing, the 1000×640 viewport, active-neighbor deletion, final empty authoring,
Undo after saved deletion, two Undos after final deletion and subsequent exact
package readback. It does not establish physical crash recovery or actual
worker freshness.

The service CPU test separately uses the repository's independent CPU worker,
actual normalized Raster inputs and independently decoded full RGBA output.
The current Patch, an above-target Raster, normal generation draft and
lock/visibility edits do not contaminate its below-target source. Hiding the
lower Raster changes the actual source to transparent, reports only
`source-composite` outdated and returns to ready after Undo. Controlled failure
and delayed composition tests cover unavailable source and changed owner/revision;
these seams do not stand in for trained-model inference. Existing pinned LaMa
weights are read only for neighboring regression checks, with no provisioning.

`mutation-delivery-summary.json` retains seven semantic RED/control-GREEN/
restoration triples against the final source: ignored active selection, wrong
active-delete neighbor, removed revision guard, unknown source mislabeled ready,
copied historical owner rejected, disabled LoRA diagnosed and UTF-8 byte ceiling
replaced with character length. Each baseline/restoration has two passes; each
mutation has the intended one failure and one passing neighbor. All 519 original
source files are unchanged by isolated copies, and every mutation payload was
removed after physical exit. Earlier mutation runs are corroboration, not extra
independent feature coverage.

Actual screenshot review found that the first centered browser obscured the
Canvas and its active name inherited disabled contrast. The final browser uses
the existing right Layers area, preserves Canvas dimensions and normal active
text contrast, and keeps the mounted Layers list for focus/scroll restoration.
Final normal, narrow and empty screenshots were inspected against `ui-audit`.
The narrow panel scrolls vertically without horizontal overflow; long variant
names truncate within their action row. No new palette or app-wide layout was
introduced.

## Failed attempts and evidence boundaries

The first broad suite had one new fixture failure: worker `stagingBase` differed
from the service scratch root. Aligning those owned roots fixed the real CPU
test; the failed log remains. The first isolated mutation setup omitted the
worker ICC companion, causing baseline setup failures; those do not count as
semantic RED. Its diagnosis is retained in `mutation-setup-failure.json`.

Two extended native attempts exposed harness errors: comparing the renderer's
minimal `{id,name}` DTO with full portable records, and exporting to an existing
evidence filename. The first assertion now compares the intended projection,
while subsequent Save/ZIP readback still checks full records and bytes. Each
report now creates its own exclusive artifact directory, avoiding overwrite and
export collisions. `native-complete` is the complete successful final run.
Earlier fixed screenshot filenames were overwritten by retries; those root PNGs
must not be cited as preserved before-images of the original centered browser.
Raw failed reports are retained with this limitation, and all native actors
physically exited before cleanup.

The initial typecheck caught overly broad resource kinds in a reused preset
diagnostic helper. A dedicated indexed diagnostic pass now handles current exact
bindings, deduplicates repeated resources and caps the strict response with an
explicit truncation diagnostic. This avoids multiplying catalog scans by large
valid stacks. Stored-state assessment likewise validates the document once and
normalizes current authoring once per mode, without changing frozen lineage.

No public Smart Generate/Results/Add IPC, accepted-history navigation,
Compare/Preset, installed runtime qualification, trained inference or quality
parity was established. PP-007/008 remain **Пока не обещать**. The next finite
owner is public Smart Generate/Results integration with explicit admission,
cancellation, Close and recovery policy.

## Artifact completion

`cleanup-proof.json` records confirmed native scope/actor exits, empty final test
groups, restored mutation sources, current process-reference checks and exact
candidate paths. Four owned native fixture profiles were removed; the mutation
copies had already been removed after each restored GREEN. No root sweep or
external symlink traversal occurred. Final source and bundle hashes still match
the executed native report. All 166 retained files were unchanged immediately
across profile deletion; subsequent lifecycle metadata completion is recorded
separately.

Allocated artifact root: **2.70 → 2.66 GiB**, actual reclaimed **45.45 MiB**.
This run retains about **5 MiB** of compact evidence: reports/logs, semantic
triples and restoration, final screenshots, commands/hash manifests and the
verified final `.igs`. The initial user-requested retirement of the old installed
pool was a separate preceding cleanup; this step created no new ML environment
or model copy. Both LaMa files, component-source/control fixtures, historical
provision/config evidence, the independent repository CPU environment and
ordinary application data remain intact. This run's LaMa pin is released;
historical installed qualification remains retired.

The first cleanup metadata update encountered a historical `usedBy` string
among object entries after deletion and its proof had completed. A type guard
fixed that metadata-only step; `cleanup-metadata-completion.json` records the
completion without a second deletion. The task lifecycle is now `retained`,
with no active payloads/dependencies and compact evidence pinned for the current
integration review.
