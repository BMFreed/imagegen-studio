# Public Smart Patch Generate, Results and Add

## Scope, revision and risk

Authorized continuation after variant lifecycle/status on base `f18596c`, including
that preceding uncommitted implementation. Preserve all existing dirty/untracked
files. This slice crosses renderer/IPC, installed worker leases, durable queue,
temporary candidates, immutable acceptance and Close/recovery: **high risk**.
Supporting contracts: PP-007/008, Smart Patch Layer, GenerationResults and
document lifecycle/Undo. Existing prototypes remain visual references, not
production persistence evidence.

The outcome is explicit public Generate for the captured selected Patch, typed
temporary results and Add as Variants through the already qualified acceptance
journal. Generate never edits the Project; Save never accepts candidates. Public
Retry, Smart accepted-history navigation, Compare/Preset, orphan Raster conversion
and trained installed-model/release qualification remain separate. Orphans stay
visible with export/discard and a visible conversion limitation.

## Confirmed starting boundaries

- Layer-owned drafts/masks/bounds, source capture, four-mode preparation,
  concrete input persistence, dedicated Smart queue claims/world staging,
  immutable Add, and variant lifecycle already exist.
- Renderer and Main explicitly refuse public Smart Generate. The public drain
  only drives ordinary jobs. Smart private execution has an undriven handle.
- Normal Results, temporary recovery presence and Close enumerate normal staging
  only. Merely removing the Generate refusal would hide completed Smart results
  from those owners. Whole-Project cancellation currently routes through the
  ordinary processor and must dispatch by actual operation.
- Installed preparation exposes only `composeTarget`. Smart preparation needs
  the qualified installed CPU methods; production must not cast the narrow
  transport or fall back to repository/system Python.
- Canvas ordinary candidate preview paints after the entire stack. Smart preview
  must substitute the target contribution at its current stack position with
  the candidate's frozen bbox, preserving parent display settings and layers above.

## Decisions and invariants

Use dedicated discriminated Smart APIs/results. Never feed a Smart candidate to
ordinary Raster acceptance, discover it in the normal store, or accept
renderer-supplied paths/pixels/provenance. Main owns exact reads and signatures.
Capture tab/document/revision/layer before pending renderer draft flush; changed
identity requires renewed review. Main rechecks owner and visible/unlocked
membership at admission. Edits after capture retain frozen inputs; explicit Add
into an existing changed eligible target retains immutable output/provenance and
derives outdated. Missing/hidden/locked targets cannot be silently retargeted,
revealed or unlocked.

One existing Main drain/CUDA lease drives both typed processors through the same
global SQL running slot. Cancel, Close and shutdown await actual inference/CPU
startup, output/publication and physical exit. Unknown exit/publication retains
ownership, files and fences. Completed valid candidates recover independently
of prunable queue rows; old pending/running jobs are canceled after restart.

Replacement is **target scoped**: ordinary Generate replaces ordinary staging;
Smart Generate replaces only the exact source document/Patch's reviewed jobs
and candidates. Other Patches and ordinary candidates remain. Recheck the exact
reviewed sets around preparation and cancellation; late completion renews review.
Publish verified new durable inputs before irreversible old-result cleanup.
Close and document-recovery discard remain Project-wide across both stores.

Results selection is distinct from focus/preview. Add uses selected IDs and the
reviewed available/unfinished set, cancels only confirmed siblings, adopts through
the shared gate/journal and creates one Undo without implicit Save. Uncertain
handoff remains recoverable. Signed image/export reads reacquire the exact
candidate after async work and revoke after discard/close.

## Alternatives, parameters and verification plan

Widening Raster result DTOs or reusing normal target inspection would blur owner,
source and provenance contracts. A second independent drain could compete for
the installed lease. Reusing the existing journal/queue/worker owners avoids
duplicating durable recovery. Advisory capability flags never replace actual
admission/dispatch validation.

Inherit the existing 1..32 concrete job bound, 100 requested iterations, 16 KiB
concrete prompt envelope, 64 selected candidates, 10,000 member/reply limit,
16 MiB portable JSON, 32 MiB contribution PNG and 2,048/4M-pixel CPU source
limits. These are safety decisions, not measured product/ML capacities. No
format version, GPU capacity or installed-runtime compatibility claim is added.

Exercise the actual public controller/resource/acceptance with real SQLite,
Project writer/loader, CPU source/preparation/world output and declared literal
inference/qualification collaborators. Cover both families, changed inputs,
invalid/stale/blocked owners, target-scoped replacement and late completions,
cancel/Close physical ownership, orphan/foreign recovery, exact signed reads,
Save/reopen and Undo. Run a built native UI path and inspect screenshots using
the existing design/UI-audit guidance. Semantic mutations must cause intended
RED with a neighboring GREEN, then restore exact original bytes.

Root serializes heavy checks under finite cgroups/deadlines, aggregate at most
4 GiB and zero swap. Initial artifacts are about 2.66 GiB with 86 GiB free.
Historical installed qualification is retired. Keep existing pinned LaMa/control
sources and use the independent repository CPU environment only in declared
tests; no model download/runtime copy. Existing historical evidence above the
compact soft budget remains pinned for open integration review, not silently
deleted. Record actual executed checks, source hashes, exclusions, process exit
and exact payload cleanup before handoff.


## Implemented boundary and review findings

The public Smart action controller captures the selected document/revision/Patch,
uses the ordinary admission owner and wakes its existing typed global drain.
Normal replacement enumerates normal jobs; Smart replacement enumerates only
its original document/Patch. Shared Close/recovery enumerates both stores. The
new resource boundary signs full-image and thumbnail capabilities against the
actual immutable frozen-input hash, not only the identical output PNG hash.

Optional thumbnails fit a 256-pixel side and 256 KiB each; a 64-entry in-memory
cache is at most 16 MiB of PNG payload. Thumbnail failure preserves the verified
full-image fallback. These are operational bounds, not benchmarked product
capacities. No thumbnail becomes portable provenance or an accepted asset.

Review found and fixed three admission/ownership defects before qualification:

- A public Add initially borrowed the image lease before waiting for the private
  Project gate. Save holds that gate before borrowing the same lease, creating a
  cycle. Add now passes a lazy compose proxy; actual acquisition happens only
  inside the existing private acceptance gate. A real-gate ordering test observes
  the queued Add without an image acquisition, then verifies acquisition under
  the gate after Save releases it.
- A revision validated before queuing private Add could change ahead of gate
  admission. Main now carries an internal expected document/revision/epoch/layer;
  the private owner rechecks it inside the gate before any handoff. A fresh
  explicitly reviewed Add can still accept frozen outdated output into the edited
  eligible Patch without overwriting its authored settings.
- A failed concurrent Smart Add marker could satisfy a waiting Raster classifier
  without reconciling its pending Smart owner. Completion now reclassifies after
  either Add marker. The regression uses the actual shared gate and SQLite
  classifier, with declared controlled recovery delegates.

The independent final review also found a Smart CPU-startup race: a borrowed GPU
could acquire an unconfirmed-exit fence after the initial check but before the
CPU ready line. Smart preparation now repeats `hasUnconfirmedGenerationExit()`
after CPU startup, as ordinary preparation already does. A real-child test holds
CPU readiness, observes refused GPU close, then releases readiness and verifies
no Smart callback, confirmed CPU exit and continued refusal until actual GPU exit
is observed. Controlled peer capabilities and close refusal are explicit test
collaborators; the ownership mechanism is the actual RuntimeManager.

## Test fixture boundaries and discarded attempts

The public integration fixture uses actual ProjectService, SQLite queue/staging,
source capture, installed-preparation API, CPU preparation/world output, acceptance
journal, writer/loader and signed resources. Numerical inference emits declared
literal RGB; model resolvers/readiness are controlled. Native Electron additionally
uses actual preload/Main wiring, automatic public drain, managed structural
checkpoint qualification and installed-runtime lease resolution. Its app-owned
wrapper delegates CPU work to the existing repository environment. No trained
model or production GPU readiness is inferred from that wrapper.

The native INP fixture authors a soft 2×2 mask at world 128×128 and processing
64×64. The existing latent 8×8 path expands its first covered cell to a literal
16×16 world contribution even with zero edge/fade. The independent pixel oracle
checks that exact coverage and every remaining alpha byte; it does not copy the
implementation's coverage helper.

Early setup failures are retained, not counted as semantic RED: an incomplete
0.12 qualification fixture; duplicate test-controlled/manual drains causing BUSY;
a wrong 2×2 world-alpha oracle; and a cloned Buffer precondition. Native attempts
separately exposed a CPU-wrapper assertion that incorrectly required inference
config for a derivatives-only child, forgotten four UI iterations (eight dynamic
outputs), and re-stopping a prior launch's already removed deadline timer. The
native harness now sets one iteration for its two dynamic alternatives, keeps
per-launch cleanup state and bounds failure-close with a verified owned-scope
fallback. Failed reports and independent physical-exit proofs remain available.
The first broad attempt stopped at a stale ordinary replacement-read test hook
with no TAP footer; its wrapper exit zero is explicitly recorded as incomplete,
not a passing suite. The hook now observes the typed normal reader.


## Built native and visual evidence

Authoritative native run: `native-fourth-report.json`, **15 passed checks** in
18.151 seconds. The report binds 29 selected source and five bundle hashes to
the executed build; those hashes still match at final native review. Real UI
Generate automatically produces two typed Smart results, switches preview
without changing the checkbox selection, adds both through one Undo transaction,
saves/reopens exact world images/provenance, cancels a held worker, declines and
confirms combined Close, crashes/relaunches a partial batch and explicitly adds
its recovered completed candidate. Unfinished sibling recovery is `APP_RESTART`.
The retained 11-member `.igs` contains three accepted variants with exact bytes;
their actual seeds are 0, 1, 0. Six executed peer requests use 0, 1, 0, 1, 0, 1.

The actual 1440×900 and minimum 900×620 Electron screenshots were opened and
inspected using the UI-audit checklist. Checked states: focused versus selected
candidate, Add enabled/zero-selection disabled, accepted/reopened Patch, partial
batch/recovery, and actual native resize back to 1440×900. At minimum size the
result toolbar and notice wrap; 230 visible Canvas toolbar/candidate descendants
remain inside the Canvas. Existing layer density, icon treatment, selected border
and Generate emphasis are preserved. No new confirmed clipping/overlap or missing
result action was found in these states. This is a scoped inspection, not full
keyboard/accessibility, arbitrary long-name, multi-session or complete app-layout
qualification. Pure renderer tests additionally cover orphan/foreign isolation
and parent visibility/opacity/blend at the actual target stack position.

Native per-launch closure confirms both owned scopes and recorded PID/start
identities; the final actor proof covers all 64 CPU/inference launches (42
CPU derivatives, 22 inference including qualification). Zero page errors. Native
memory ceilings are 2 GiB plus a 1 GiB launcher, zero swap and finite deadlines;
all heavy checks remain serialized. Numerical inference/readiness remain declared
collaborators even though the managed file/runtime/queue and CPU ownership paths
are actual application code.


## Executed regression checks

All checks use the bounded controller in the evidence directory, a 3 GiB ceiling
(except native launcher 1 GiB), zero swap, 600-second service deadlines and
confirmed empty process groups. The authoritative affected suite is
`affected-second`: **2,583 passed, zero failed/cancelled/skipped**, 284.225 seconds,
1,363,058,688-byte peak. It includes DB, all Project tests, actual RuntimeManager
`.test.mjs`, shared Project/preset contracts and renderer helpers, serialized with
`--test-concurrency=1`. Existing pinned LaMa enables all OUT cases; no environment
or model copy is created. Focused final ownership/renderer cases are
`focused-fifth`: **206 passed, zero skipped**, 25.016 seconds and 500,355,072-byte
peak. Earlier focused31 is superseded by this complete set.

The native and affected suites test the final Smart CPU-startup guard and the
updated normal replacement-read hook. Production source and bundle hashes stay
bound to the final native report. Prototype UI is unchanged, so prototype browser
coverage is not claimed; `pnpm run typecheck` includes both prototype and app.
The build succeeds with the existing Vite warning about a chunk above 500 KiB.


## Semantic sensitivity and restoration

`mutation-public-r1-summary.json` records eight isolated triples. Every baseline
has two passing tests; each plausible mutation yields exactly its intended RED
and a neighboring GREEN; exact restoration gives two passing tests again:

| Guard changed in the isolated copy | Intended observed failure |
| --- | --- |
| Ignore Generate's reviewed revision | Stale admission is no longer refused. |
| Drop the candidate Patch filter | Replacement includes a sibling Patch. |
| Skip Add's gate-time expected owner | A queued stale Add accepts after another edit. |
| Skip Smart Add marker reclassification | Raster Add enters with a foreign pending Smart owner. |
| Omit immutable input hash from resource MAC | Identical PNG bytes reuse an old frozen-input capability. |
| Hide upper Raster layers during Smart preview | Preview changes the original stack above the Patch. |
| Eagerly borrow the image worker before Add's gate | Queued Add takes the shared lease before Save releases its gate. |
| Omit the post-CPU-start uncertain-exit check | Smart callback receives readiness after refused GPU close. |

All 570 original source/package/CPU companion files remain byte-exact. Only the
isolated test launcher points to the original compatible CPU environment; the
relocation hashes are recorded and no ML environment/model is copied. Each
isolated tree is restored and physically idle before deletion. Eight payloads
release 80,838,656 allocated bytes across these sequential temporary copies.
The reports retain all baseline, intended RED, neighbor GREEN, restored GREEN,
original/isolated hashes and process-boundary evidence.

## Delivery limits and next owner

The public UI/IPC/queue/journal connection is qualified within the declared
boundaries above. PP-007/008 remain **Пока не обещать**. This slice does not qualify
trained installed-model/GPU output, release packaging, public Smart Retry,
accepted-history navigation, orphan-to-Raster conversion or Smart Compare/Preset.
The next inference owner must provision/qualify a compatible installed worker
and real trained resources for the public frozen Smart path; the retired
historical runtime cannot be resumed or represented as current qualification.
The remaining product flows keep their explicit unavailable states.

Four exclusive native profiles are removed only after their recorded Main,
CPU/inference and actual cgroup exits. Their 59,699,200 allocated bytes are released
while original reports and retained PNG/11-member `.igs` evidence remain byte-exact.
The scan records inaccessible foreign daemon fields rather than touching those
processes; exact owned PID/start/cgroup closure is independent evidence. The
repository CPU environment, both pinned LaMa files, historical controls/component
sources and ordinary application data remain intact. The current LaMa test lease
is released in both lifecycle records; historical installed environments stay
retired. Old evidence exceeding the compact soft budget remains a documented
exception for the still-open trained integration/release comparison, releasable
after its independent installed Smart baseline and archival dependency review.


Final gates: `pnpm run typecheck` after the exit guard passes (19.148 seconds),
`pnpm run lint` passes all four scopes (50.005 seconds), and `pnpm run app:build`
passes (1.809 seconds). `git diff --check` and 679 local documentation links pass.
The final process audit confirms all 47 owned bounded services closed. No commit
or publication is performed. `delivery-manifest.json` binds the final working-tree
sources, built bundles, executed reports and retained evidence; the complete
run lives at
`~/.codex/artifacts/imagegen-studio/runs/smart-patch-public-generation/20261017-public/`.
The run retains roughly 4.4 MiB of evidence and the entire artifact root is about
2.67 GiB, with no live test payload or retained installed runtime added by this
slice. Exact allocated sizes and dependency releases are in `artifact-lifecycle.json`.
