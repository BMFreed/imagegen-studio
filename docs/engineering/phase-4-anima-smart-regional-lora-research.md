# Anima Smart Regional global LoRA

Base `c79e7e0f4cb27447955a7c666d44f3c15a800f58`. High risk: public admission,
exact resources, frozen inputs and native patch lifetime. Continue the existing
four-mode Anima Smart Regional consumer; no new sampler, classifier, queue,
recipe field or acceptance layer. PP-001/005/007/008 remain **«Пока не обещать»**.
Authored tests, executed checks, source review, installed inference and visual
acceptance are separate evidence levels.

## Fresh Invoke source

Clean local revision `4875d96531ca6712b288f6e660fcbb34143408c1`, reread with callers:

- `invokeai/frontend/webv2/src/features/generation/core/graphBuilder.ts::getActiveCompatibleLoras`;
- `core/graph.ts::buildAnimaGraph`, `core/canvas/compileCanvasGraph.ts`,
  `core/canvas/addRegionalGuidance.ts` and
  `workbench/widgets/canvas/invoke/prepareCanvasInvocation.ts` under the same
  frontend generation/workbench roots;
- `invokeai/app/invocations/anima/anima_lora_loader.py`,
  `text_encoder/anima_text_encoder.py` and `anima/anima_denoise.py`;
- `invokeai/backend/patches/layer_patcher.py` and
  `backend/stable_diffusion/extensions/lora.py`.

The enabled filter retains weight zero. The ordered loader feeds transformer
and text conditioning; regional encoders copy the same model edges. Patch scopes
cover signed conditioning and denoising and restore the original model afterward.
Studio's existing ordinary/Canvas LoRA adaptation already implements the exact
resource, scoped patch and RNG mechanisms. This slice joins those owners to the
existing Smart consumer. No required Invoke mechanism is missing.

## Finite policy

Four additive `invoke-anima-smart-regional-lora-{mode}-v1` profiles and
`anima-smart-patch-regional-lora-{mode}-v1` capabilities independently cover
TXT/IMG/INP/OUT. Legacy profiles require an empty active inference tuple; the new
profiles require a nonempty ordered tuple, including an all-zero tuple. Configured
disabled rows remain in selected-Smart context and do not resolve missing files.
Enabled rows require exact resources even at weight zero. Finite signed weights
retain the existing product contract without a newly invented numeric bound.

The existing frozen manifest checks tuple order, SHA, weight and distinct file
roles; existing resource owners reverify exact files before admission, Retry and
native loading. The shared LoRA RNG reservation covers conditioning/denoising.
Prequalified attentions are passed into the existing prediction factory while
the patch scope is active. Failure and Cancel must restore tensors, processors,
PEFT metadata, tokenizers and RNG before another job.

Renderer Generate follows the selected Smart stack and exact known mode; queue
Retry follows frozen stack metadata and mode. Old Smart or Canvas grants cannot
authorize the new combination. The queue uses its existing `requiresRegionalLora`
detail; no queue operation or portable Project field is added.

All other bounds remain: original Anima, Euler/Heun, one static item, embedded
Auto VAE, processing 64–512 divisible by eight, bounded WORLD geometry, at most
three regions and existing signed text/context/attention budgets. No TI,
references, per-region LoRA routing, batch/dynamic prompts or additional methods
are admitted. Illustrious Smart Regional LoRA remains a separate open consumer.
Regional masks retain their own ownership and never replace Smart KEEP.
Inherited negative uses the frozen selected Smart. Generate/Retry perform no
implicit Add or Save; Regional Guidance remains excluded from accepted-result
provenance, Compare and result-derived presets.

## Qualification plan and evidence boundaries

Lower checks cover ordered signed/zero tuples, exact capabilities, disabled
missing rows, crossed profiles/modes, resource corruption/restoration, actual
frozen reload and Retry. Native tiny models keep original signed conditioning,
attention, solvers/KEEP and PNG publication; model construction/availability and
OUT neural LaMa substitution are explicitly named collaborators. Independent
transformer replay after PNG publication must reject a mutation that drops only
the final LoRA forwarding; no-LoRA controls stay GREEN. Setup failure, OOM and
timeout do not count as semantic RED.

Installed qualification reuses the protected noneditable 0.14 runtime/catalog
and one real compatible adapter. Per mode: prepare produces identical-input
positive/negative-weight A/B, explicit A Add/Undo/Redo/Save/reopen and native-step
Cancel; restarted Retry reproduces frozen A after saved current edits; a separate
authored control Project compares enabled-zero against disabled clean execution.
Every lifetime must close normally after explicitly handling its own candidates,
with physical launcher/native exit. Same-seed PNG inequality establishes influence,
not visual utility. Exact zero/clean output and subsequent jobs test scope release.
The planned matrix is twelve lifetimes and twenty-four requests across four modes;
executed reports, including failed attempts, determine the actual outcome.

Fresh inventory: about 25 GiB artifact root, 68 GiB free disk; GPU 16,376 MiB total,
14,660 MiB free. These are observations, not capacity guarantees or authorization
to stop another process. ROOT owns serial heavy work. Installed phases retain
launcher ≤2 GiB, native scope ≤10 GiB, aggregate ≤12 GiB, zero swap and 600 seconds
per phase. No CUDA allocator fraction is enforced or claimed. Runtime idle is
rechecked before refresh/campaign. New payloads are retained and audited before
exact owned-path cleanup; SHARED, managed Projects/rows and report companions stay
protected.

## Executed lower checks

The original ROOT lower run covered 973 distinct Main cases. The first run had 969 PASS and four
failures in the new controlled resolver fixture: its assertion intercepted the
changed returned SHA before production reverify could reject it. Corrected
fixture-only code then passed all 46 cases in that file. Full TS/Vue typecheck
passes. Python has 407 distinct PASS (77 new native cases, 326 neighbors and four
additional enabled-zero controls exercised in the isolated baseline), with the
two pre-existing external-fixture opt-in skips. Full Python typing reports zero
errors/warnings; Ruff and changed-file formatting pass.

All 254 prototype browser cases pass with two workers. Full JS lint passes with
only the two unchanged baseline parser exclusions recorded in the previous stage;
the changed harness also receives scoped checks after diagnostic edits. The
production application builds. These results are new ROOT execution, distinct
from the previous EPS/V/Anima checkpoints.

The isolated final-forwarding mutation has 36 selections: baseline 12 GREEN,
mutated four post-PNG prediction RED plus eight empty/zero GREEN, restored 12
GREEN. Independent patched-transformer replay differs from actual predictions
in all four signed cases after genuine PNG publication. All live and isolated
source/test bytes restore exactly. An earlier isolated setup gave twelve SKIP
because its topology lacked the real TS plan/prompt fixture dependency; that
attempt is retained and excluded from semantic evidence. The corrected isolated
repository uses captured source and a link to existing pnpm dependencies, with
no environment/model copy.

## Installed campaign and diagnostic history

The same noneditable 0.14 worker was refreshed and startup/physical-exit qualified
in place, including all four new grants. No weights or ML environment were
copied. The real compatible adapter remains an original read-only external file
referenced by the current catalog; it is outside the cleanup boundary.

The first setup safely refused an existing Project filename before creation or
app launch. Anima fixture names now include the LoRA campaign and fixture digest;
the existing file was not changed. A second owned app attempt timed out waiting
120 seconds for pre-SQL admission, with no rows/results/native inference. Its
failure closure physically exited but is not a successful normal-close check.

Read-only source diagnosis found three existing full resource-reverify passes
before the first SQL row: batch materialization and two queue publication guards.
For the selected resources they request 69,202,570,236 bytes of forced SHA reads.
This is a source-derived count, not measured throughput or proof of deadlock.
The harness now records passive owned-Main I/O counters and permits 240 seconds
for its SQL predicate inside the unchanged 600-second outer phase. Exact resource
checks are retained. That attempt did not establish installed acceptance; failed attempts do
not count as successful inference or semantic mutation.


The first TXT restarted Retry reproduced A exactly, explicitly discarded its
candidate and completed normal close, but its final idle guard refused a transient
unreadable `/proc` process. A fresh direct idle proof then passed without signaling
any process. The original failed report, completed row/receipt/bundle and output
are retained. Only Retry was repeated: the replacement fully passed, followed by
fresh enabled-zero/disabled-clean controls with exact PNG/RGBA equality. TXT now
has three passed phases; the remaining modes are in progress. Whole-campaign
counts will separate qualified scope from every executed owned attempt.


A later IMG Retry also reproduced A and closed normally, but exposed an unrelated
harness assertion: frozen replay does not require a fresh derivative-worker
invocation. Its failed outcome and completed row/receipt/bundle are preserved.
The repaired harness requires inference in every phase and derivatives only in
prepare/controls. Its only other changed block permits exactly the known archived
Anima predecessor after canonical hash checks and mechanical reconstruction of
all 114,350 predecessor bytes. ROOT verified that reconstruction independently;
a bounded independent source review found no arbitrary hash bypass. Fixture,
compiled app, worker, source/input and physical-close guards remain intact. The
replacement IMG Retry passed; its outputs and failed predecessor stay distinct.

Source research found an additional descriptor-client grant defect masked by an
installed worker carrying both grants. Public admission and processor dispatch
already select the active LoRA grant, but the real client still selected its old
empty-stack grant. Directed actual-client/controlled-child tests reproduced 16
semantic RED and eight empty-stack GREEN controls. The first authored TXT fixture
used native null strength in the numeric authored recipe field; corrected setup
is excluded from those semantic counts. The client correction is deferred until
the frozen native matrix completes. Then exact campaign source/build bytes will
be retained, the membership guard corrected and rerun, and a separate final-build
TXT enabled-zero/clean native control will qualify the changed build. This does
not claim a new full four-mode native matrix on that final build. Native inference
code and input semantics are unchanged by this client predicate correction.


## Final executed qualification and build boundary

ROOT's original frozen-build matrix passes 64 checks: 24 requests, 20 world
publications, four cancellations after native step 1, four byte-exact restarted
Retry outputs and twelve normal application lifetimes with physical scope exit
and runtime idle. Every mode passes explicit Add/Undo/Redo/Save/reopen, saved
current edits and enabled-zero/disabled-clean processing PNG and world PNG/RGBA
equality. Signed-weight visible RGB changes are TXT 19,752, IMG 22,813, INP 12,259
and OUT 19,702. These counts establish influence, not useful visual quality.

After preserving all five campaign build members and a 1,625-file source archive,
ROOT corrected exactly one client predicate argument: actual captured tuple
presence selects the separate LoRA grant. No descriptor, input, sampler or worker
code changed in that correction. The regression's 16 semantic RED/eight empty
GREEN controls become 24 GREEN; the complete two client files pass 62 cases.
Final distinct Main coverage is 997; Python remains 407 PASS/two existing opt-in
skips and browser 254 PASS. Latest full TS/Vue typecheck, full JS lint with only
the unchanged baseline exclusions and production build pass. Full Python typing,
Ruff and changed-file formatting pass on the unchanged Python source.

Only Main differs between the original and final five-member builds; preload,
renderer HTML, JS and CSS are byte-identical. A separate fresh TXT controls phase
on the final build passes five checks/two native requests/two world publications
and normal physical close, including exact enabled-zero/clean equality and
agreement with the original TXT controls. Thus the qualified aggregate is 69
checks, 26 requests, 22 world publications and thirteen normal lifetimes. The
full four-mode native matrix belongs to the preserved predecessor build; the
additional final-build native scope is TXT only. Directed client tests cover the
changed grant condition in all four modes. No strict old-build Retry guard was
bypassed to create this final control.

ROOT executed retention successfully: 385 copied files, exact source/destination
bytes, private SQLite/WAL reconstruction and logical typed-table equality,
Pillow processing-to-world checks, packages, receipts and complete bundles.
OriginalFourMode, finalGuardControl and qualifiedAggregate remain separate.
Actual retained owned state, including the three closed failed app attempts, is
ten Projects, 28 queue rows, 24 receipts, 28 bundles, 24 processing/world pairs and
sixteen application lifetimes. The filename-refusal attempt created no app or
owned Project and its existing package is not adopted. Failed reports retain
failed outcomes. The independent retained-byte audit and exact payload cleanup
are completed below.

Operational evidence uses fixed processing 136×128, WORLD 107×73, Euler, 20
requested steps (ten effective image updates), CFG 4, Fixed seed 123, image
strength 0.5, embedded Auto VAE and one real exact adapter. Global LoRA scopes,
RNG ownership, all component banks, signed stacks and Heun have separate tiny
native lower coverage. Arbitrary trained stacks/architectures, higher capacity,
visual utility, official Illustrious XL v0.1 acceptance and release/MVP acceptance
remain open. PP-001/005/007/008 remain **«Пока не обещать»**.


## Final independent audit, retention and disposal

Independent read-only source/document/retained-byte audit is CLEAN. It checks
1,625 current source files and both source archives; all 71 installed worker
source files; both five-member build cohorts; all 385 source-mapped retained
copies; 19 safe Project packages; scoped readonly SQLite schema, FK/integrity and
typed rows; and all 24 processing-to-WORLD RGBA pairs independently with Pillow.
Exact restarted Retry, zero/clean controls, signed influence counts, accepted A
bytes, current edits and Regional Guidance provenance exclusions pass. The raw
and backup SQLite files differ only in documented header metadata, including a
schema cookie change; other bytes, schema and scoped typed values agree. Audit
performs no inference or original-weight qualification and does not authorize
cleanup or promote product promises.

ROOT separately confirms ended readers, physical application/worker/cgroup exit,
exact mutation restoration and reciprocal incoming dependencies. The archive
retains all 7,258 entries: 5,308 regular files, 1,838 directories, 111 literal
symlinks and one idle socket represented by an inert zero-byte metadata marker.
No link was followed and no IPC socket recreated. The existing V-labelled v1
archive-format identifier is reused; owner paths and actual data are Anima.

After fresh guards ROOT deletes only this run's `payloads` and its exact owned
`t-asrl-1110` short scratch directory. Allocated artifact-root bytes change from
26,933,583,872 to 26,806,562,816 during deletion: **127,021,056 bytes reclaimed**.
The lifecycle is retained with no live payload paths. Archive hashes, inventory,
source/build/worker lineage, reports, failed attempts and reconstruction metadata
remain outside disposed trees. SHARED, models, original external adapter, all
managed Projects/rows and active worker report companions remain protected.

Raw scratch paths in historical reports are no longer live. Reconstruction must
restore the declared prefixes from the verified archive without following links;
the current runtime/catalog/qualification companions and exact original resources
are dependencies. Do not run historical `--resume` against absent raw paths or
substitute the final client build for its predecessor matrix. Release
Install/Repair, clean distributable/update/migration acceptance, visual utility,
capacity and the remaining Illustrious/reference consumers remain separate work.
