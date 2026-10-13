# Installed Project presets: EPS/V Apply and inference

## Prospective scope

Base: `4effcc7eb756ff7ab44e86e2433b00334a7ccb71`, `master`. This is the next
Phase 3 / PP-006 qualification, not a claim of complete preset or inference
support. The production entry is Project's native preset picker and Apply
modal. Four independent scopes cover installed NoobAI EPS/V, each with full
and partial Apply, followed by a separately authored manual control. Eight
real outputs are the finite campaign; no model/runtime downloads or copies.

Boundary: renderer → Apply IPC → exact-resource verification → one Project
history mutation → queue frozen input → actual Python inference → provisional
result → Add Raster → explicit Save → real reopen → Compare → Save Preset from
Result → SQLite readback. Source preset creation is test setup through real
IPC/storage, not a substitute for Apply. Manual controls use native settings.

## Invariants and controls

- Full Apply copies the selected portable fields; partial Apply cannot leak
  excluded checkpoint, LoRA, VAE, sampler, Size or Seed values. Size and seed
  intentionally differ in the partial source. Apply is one Undo/Redo change.
- Preset prediction/noise hints are advisory. Current exact-file library
  policy owns execution: EPS/false/leading and V/true/leading. The source preset
  deliberately carries a conflicting hint; its bytes and library overrides
  remain unchanged. A copied prediction hint in the configured reference is
  distinct from effective worker input and accepted provenance. Any comparison
  exception must name that exact field; do not strip arbitrary mismatches.
- Each Apply output equals its own independently authored control in decoded
  RGBA. This does not claim EPS/V equality, output quality or Invoke parity.
- Accepted, saved and reopened data retains actual effective prediction/noise
  and portable settings. Result-derived preset records the actual policy,
  omits Seed/execution data, and does not link back to mutable source settings.
- Key assertions use literal expectations and real production producers. A
  plausible semantic mutation must cause the targeted test to fail, followed
  by restoration and GREEN. Synthetic oracle sensitivity is labeled separately.

## Parameters and resources

Recipe decision: Euler/Normal, 256², 3 steps, CFG 4, Fixed seed 0, Digital Art
LoRA −0.5, explicit native external VAE/FP32. These are bounded controls, not
recommended quality settings. Euler/Normal avoids the separately documented
V/Karras numerical refusal and SDE/ZTSNR capability restriction. Both outputs
are generated before Add so an accepted layer cannot change TXT into IMG.

The sole reusable pool is
`~/.codex/artifacts/imagegen-studio/shared/illustrious-vpred-worker-012-20261007`.
Its actual runtime is worker 0.14/Python 3.12; the directory's 0.12 name is
historical. Current repository differs in five installed Python files and
adds `resource_previews.py`. Temporarily overlay all six, preserve original
43 package members and their bytes/inodes/modes/mtimes, pin the current 44-member manifest (31 Python files and 13 resources), and restore
only after physical exit. Original provision/upgrade/config/source companions
remain protected. Do not treat the historical provision report as proof of
current payload. Never select the pool's artificial default VAE/embedding.

Observed hardware: RTX 4080/16 GiB, RAM 31.18 GiB, about 22 GiB available;
artifact root 28 GiB, including one 27 GiB pool, disk about 44 GiB free.
Prior trained aggregate peaks were 9.7–10.2 GB. Operational ceilings: launcher
2 GiB, actual native Main/worker ≤12 GiB, aggregate watchdog ≤14 GiB, zero swap,
campaign deadline 1800 seconds. These are chosen guardrails; register actual
PID/start/cgroup and record anon/file memory, terminal state and physical exit.
Runs and checks are serialized. An interrupted run is not a semantic RED.

## Failures, evidence and completion

Worker/source mismatch must fail preflight. A timeout/OOM/worker failure must
remain an incomplete campaign; retain queue identities and exit evidence.
Keep rollback protected until byte/identity restoration and actual restored
worker startup/close are proven. New project/job/preset paths and rows are
explicitly owned; cleanup cannot touch original user files or other pool data.

Evidence root:
`~/.codex/artifacts/imagegen-studio/runs/installed-presets/20261014-checks`.
Record fixtures, source/bundle hashes, raw frozen inputs/worker outcomes,
candidate PNGs, reopened packages, independent SQLite readback, RED/GREEN,
physical exits and cleanup. Update roadmap and PP-006 body/matrix together
only with observed results. Remaining family/Smart Patch/manager scopes stay
separate. Final observed results will be appended after execution.

## Executed source checks

`focused-producers-r3`: 27 tests passed, none skipped. The new six tests use
actual shared Apply, preparation, request/orchestrator, SQLite queue,
provenance and result-preset producers; resource resolution and worker readiness
are declared test doubles. They do not prove tensor execution or native UI.
The independent literal oracle checks expected settings rather than deriving
them with the production mapper. The native manual control authors through UI.

Two actual production source mutations were executed and restored with original
bytes and file identity:

- `prepare-mutant`: replacing verified checkpoint reference with the copied
  Project reference gives two targeted full-Apply REDs; both partial neighbors
  remain GREEN. `prepare-restored`: all six tests GREEN.
- `selected-mutant`: ignoring the section selection and parsing every included
  field gives two targeted partial-Apply REDs; both full neighbors remain GREEN.
  `selected-restored`: all six tests GREEN.

The first two producer runs failed on setup mistakes (the production dynamic
prompt default is 100, and qualified worker readiness needs the complete
capability set). These are retained setup diagnostics, not semantic mutations.
Typecheck and production build passed. Current installed overlay image self-test,
actual inference ready 0.14 and physical exit passed in `current-r4` after fixing
the verification script's staging/config arguments; those earlier startup
attempts are also setup diagnostics.

## Installed execution and readback

`native-r2` passed: eight admissions/completions/receipts, four explicit accepted
Raster results, four Save/close/reopen/Compare/result-preset chains and four exact
wholeRGBA matches against separately authored manual controls. Every full/partial
Apply also passed the one-step Undo/Redo check. Source presets, exact model bytes,
library overrides, existing queue/cursor/preset rows and all 44 installed package
members remained unchanged. Full source prediction/noise hints deliberately
conflict; configured prediction remains copied/advisory, while frozen context,
worker request, accepted portable configuration and result preset use actual
current library policy. Excluded partial fields never leak.

Independent `independent-readback.json`: **646 checks passed** against real
read-only SQLite, ZIP members/digests, actual embedded sRGB ICC, accepted assets,
immutable provenance and Pillow wholeRGBA bytes. Four output pairs compare all
262144 bytes, not a crop or a browser-only checksum. The source `.igs` and its
evidence copy match exactly. Existing accepted-result index rows remain unchanged;
Home refresh updates only `indexed_at` on the 461 original Project index rows.
The first native attempt failed before launch on a runner source-hash path; it
has no admission and is a setup diagnostic.

Observed campaign: 27 min 13 s, aggregate owned peak **14129160192 bytes
(13.16 GiB)**, zero swap, no OOM/watchdog termination, confirmed Main/renderer/
worker and launcher physical exits. File-cache peaks are recorded separately
from anonymous memory; component peaks occur at different times and must not
be summed as a simultaneous total. The 14 GiB ceiling was retained.

The successful campaign's exact driver/helper/test bytes are archived as
`*.native-r2` with `tested-source-archive.json`. After execution, the driver's
quadratic neighbor verification (one full-table read/sort for every old row)
was replaced by one read per table and a full-row keyed comparison. Final
27 producer tests pass, including a controlled actual SQLite payload fault and
byte-exact restoration before provenance. This is oracle sensitivity, separate
from the two production source mutations. The inference/UI path is unchanged;
the installed campaign is evidence for the archived driver, and the final
batched guard has its own bounded verification. No campaign duration improvement
is claimed without a new measurement.

`final-verification` passes on the live retained SQLite tables (1329 queue rows,
450 cursors, zero remaining test presets) and all eight archived native queue
rows. It rechecks unchanged model/policy rows, original 43-member byte/identity
restoration and removal of only owned rows. Full lint passes under a serialized
6 GiB/zero-swap/300 s bound (observed peak 3.52 GiB); the initial run hit its
1.5 GiB V8 heap limit and exited within its bound. This tool setup failure is
separate from the successful ML campaign and semantic REDs. Typecheck/build,
formatting and diff checks also pass.

## Restoration, cleanup and remaining scope

Original 43 package members, bytes/inodes/modes/mtimes restored; added source
module removed. Actual restored image self-test, inference ready 0.14 and
physical exit passed. The sole shared pool retains its historical payload and
must be rechecked/overlaid before qualifying future current-source changes.

Cleanup archived exact owned SQL rows and target PNGs, retained eight output
PNGs/four accepted packages/reports/source archives/RED-GREEN evidence, and
removed only this campaign's eight original test Projects, generation inputs,
staging roots and self-test scratch plus their owned operational rows/presets.
Allocated bytes reclaimed: **1531904 (1.46 MiB)**. Models/runtime and preexisting
rows remain protected. An initial idle check recognized its own shell's literal
app-data argument and refused; no deletion occurred before the fresh standalone
idle proof. The guarded retry passed. Final inventory/lifecycle is recorded in
the evidence root.

Scope is only the declared NoobAI EPS/V Euler/Normal256 recipe. No Anima Apply,
IMG/OUT, quality, Invoke pixel parity, arbitrary checkpoint/recipe, Smart Patch,
full MVP or release claim. Phase 3's specified installed gate is closed; no extra
Cartesian ML campaign is automatically required. Next: Phase 4 Smart Patch
document foundation (owned mask/bbox/internal resolution/draft, selection,
Undo/Redo, Save/reopen/recovery). PP-006 public status remains «Пока не обещать»
until its remaining cross-phase owners are qualified.
