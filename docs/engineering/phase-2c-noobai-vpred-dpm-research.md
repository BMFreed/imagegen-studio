# NoobAI v-prediction DPM++ 2M profile qualification

## Scope and entry

Entry revision: `213357db8d2137e2218987358c1ff7408d040ebe`, clean `master`.
This is the next finite gate from the [five-sampler campaign](./phase-2c-sampler-campaign-research.md#limits-and-next-gate),
not another sampler implementation or completion of the MVP.
PP-004/005/007/008 remain «Пока не обещать».

The [managed library contract](../contracts/managed-model-library.md) owns
prediction and noise policies by exact SHA-256 plus byte size, independently of
Project/preset snapshots. Native selection already supports v-prediction and
ZTSNR for DPM++ 2M. The previous DPM adapter/oracle explicitly qualified only
epsilon/false-ZTSNR; merely selecting another checkpoint would leave its
expectations wrong. Extend the finite oracle explicitly, preserving all previous
EPS cases. DPM++ SDE plus ZTSNR must remain refused.

Risk is high for test operations: installed-payload mutation, persistent queue,
immutable accepted provenance and explicit `.igs` Save. Product behavior is
not intentionally changed. Root owns all execution, mutation and restoration;
source-informed delegated reviews do not count as blind reviews.

## Frozen finite plan before execution

Exactly eight installed jobs, sequential and offline in the single existing
worker 0.14.0/catalog (nine resources/fourteen versions):

| Exact checkpoint/profile                  | Grid   | Healthy | Mutated control                        | Fresh restored |
| ----------------------------------------- | ------ | ------- | -------------------------------------- | -------------- |
| Cyberfalafel V, ZTSNR=true, leading       | Normal | 1       | 1 expected numerical RED               | 1              |
| Cyberfalafel V, ZTSNR=true, leading       | Karras | 1       | 1 expected numerical RED               | 1              |
| Official NoobAI EPS, ZTSNR=false, leading | Normal | 1       | 1 expected identical neighboring GREEN | 0              |

All jobs are TXT,256×256, four authored steps/four callbacks, CFG4,
Fixed0/per-iteration, positive `a (red:1.3) ceramic cup on a wooden table, studio photograph`,
negative `(blurry:0.7), low quality`, Digital Art LoRA −0.5 and exact external
native VAE/FP32. Five healthy/restored candidates use explicit Add/Save/readback/
reopen/owning comparison. All three mutated candidates remain temporary and
must never be accepted, including the unchanged neighbor.

The sole installed semantic mutation changes only DPM++ 2M's
`prediction_type=command.prediction_type` to `prediction_type="epsilon"` in
`inference.py`. Same V bytes, authored DTO, noise/grid, seed, conditioning and
components stay fixed. V controls must change complete decoded RGBA; EPS
neighbor must remain identical. Fresh V runs after byte/stat-exact restoration
must reproduce complete healthy RGBA. Import/collection/OOM/resource stops are
diagnostics, never numerical kills. The independent CPU tests additionally
compare actual native timesteps/sigmas/alpha state, UNet inputs, decoder latents,
pixels and progress against fresh directly constructed Diffusers references;
the reference never calls the production scheduler selector.

Exact Cyberfalafel V v1.2 by Knightus_Ai: CivitAI model/version/file
1147756/2679856/2566634,6,938,040,794 bytes,
SHA `edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d`.
Select local version `3a6a83ea-44af-4204-9174-577fe77b7d9c` of resource
`3fd56926-0107-4397-a292-98ee282231f4`; the same resource contains an Anima
version, which must not be substituted. Raw source prediction metadata remains
null; effective exact-file override is V/true/leading. EPS neighbor is the
previously pinned 6,938,040,416-byte `ff827fc3…` checkpoint.
Leading is an export-based assumption from the
[author-recipe study](./phase-2c-noobai-author-recipe-research.md), not a consequence
of v-prediction or an exact Cyberfalafel author prescription.

Confirm the current exact-version Model Manager prediction/ZTSNR/spacing UI
and raw SQLite policies, then new Prepare → frozen DTO → actual native worker →
temporary candidate → explicit acceptance → portable Save/reopen. Library policy
edits and model installation are not part of this gate. Later current edits
must use a supported sampler under true ZTSNR, preserve accepted context and
yield owning comparison differences. Queue/receipts/cursors/prior catalog rows
and all original files are independently checked for preservation.

## Parameter and resource register

| Parameter/owner        | Frozen value and basis                                                      | Observation/refusal                                                               |
| ---------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Finite jobs/root       | 8 from the table above; 5 accepted                                          | Actual admission/completion/acceptance IDs, independent SQLite and ZIP reader     |
| Geometry/steps/profile | 256×256,4, CFG4, Fixed0; prior bounded campaign size                        | Actual UI draft, frozen DTO, callbacks and decoded dimensions                     |
| Launcher/systemd       | 2 GiB, zero swap,1800 seconds/job; same verified campaign launcher boundary | Recorded actual cgroup/owned PID start; refusal/stop never mutation RED           |
| Native owned scope     | 12 GiB, zero swap; existing qualification guard                             | Actual owned Electron/worker scope limits and physical exit                       |
| Combined watchdog/root | 14 GiB including file cache; prior campaign peak13.995 GiB                  | `memory.current` and anon/file statistics; own scopes stopped on exceedance       |
| CPU/static/root        | 2–6 GiB, zero swap, bounded per command, serial                             | Explicit bounds/log/status; no parallel ML suites                                 |
| Disk/root              | Entry26.362 GiB; compact evidence0.367 GiB; free49,916,846,080 bytes        | 30 GiB/1 GiB soft budgets, forecast ≤64 MiB evidence; no downloads/runtime copies |

Evidence root: `~/.codex/artifacts/imagegen-studio/runs/noobai-vpred-dpm/20261010-checks`.
Reuse the canonical `shared/illustrious-vpred-worker-012-20261007` in place;
its historical name does not change the actual worker 0.14.0 payload.
Entry physical-idle/source proof confirms all 43 packaged files and original
device/inode/mode/size/mtime. Durable rollback journals preserve originals
before mutation; restore in `finally`, confirm 43-file equality and physical
exit before any disposable CPU-source cleanup. Interruption retains rollback
data. No original model/image or ordinary app data is modified or cleaned.

## Executed local checks

The actual CPU native-pipeline baseline passed all 22 tests:20 retained EPS cases
and two new V/true-ZTSNR Normal/Karras cases. An isolated scheduler mutation
executed three tests: both V cases failed on decoded native latents, while the
EPS neighbor stayed GREEN. Fresh restored execution passed all three; none
were skipped. The separate installed-selector CPU capture matched directly
constructed Diffusers grids/alphas/sigmas for V Normal/Karras and EPS Normal.
This capture does not load trained weights or prove image quality.

Focused Node/TS verification passed 82 unique tests: 60 previous EPS cases and 22
new V profile/CLI/producer tests. The producer tests enter actual Main Prepare,
orchestrator and SQLite persistence, then inspect frozen requests/provenance
after caller edits; worker transport is controlled. Adapter/label doubles are
mechanical wiring checks, separate from the later actual Model Manager/native
path. Typecheck, corrected lint, fresh app build, formatting, ruff and Python
type checks passed. No full-app suite or prototype suite result is claimed.

Initial failures are retained as setup diagnostics, not numerical kills:

- Four of 22 initial Node tests failed because the readiness double omitted the
  required worker 0.14 outpaint capability and used incorrect Model Manager
  labels. The doubles were corrected to actual contracts; the 22-test rerun
  passed without weakening assertions or adding native admissions.
- Ruff required a blank import-group line; the corrected run passed.
- Full ESLint exhausted its1536 MiB V8 heap (exit134). Its cgroup did not OOM;
  the retry passed with4096 MiB heap/6 GiB scope inside the declared static budget.
  The initial lint and 1.916-second build briefly overlapped, each bounded 3 GiB,
  with a combined hard ceiling 6 GiB. Numerical CPU and native runs are serial.

The first installed V Normal baseline completed Generate/Add/Save/reopen and
owning comparison. Its watchdog then raced with the disappearing native scope
and lost its volatile combined-memory samples. The original successful report,
CLI log and physical PID/start exit are retained without a second admission.
Only the exact first case has recovered observer evidence: combined sampled
peak is unknown, observer exit1 is explicit, and two observed hard cgroup limits
sum 14 GiB. The final native phase records a 9,707,036,672-byte native peak;
the exact service-invocation journal records 2 GiB launcher peak/zero swap and
terminal timing. These are separate observations, not a measured combined peak.
Late `systemctl show` for an unloaded transient unit supplies default success/0
values; its numeric launcher exit status is therefore unknown. Native exit0 and
the successful CLI report/log remain actual evidence.

The observer fix rechecks PID/start after a scope mismatch. Only a physically
gone or replaced original identity is skipped; a changed owner for the same
live identity still fails. Four actual guard-function cases confirm those
boundaries. All seven later jobs require ordinary measured watchdog evidence;
the numerical/DTO/Save assertions are unchanged. See
`observer-exit-race-diagnostic.json`, `first-baseline-unit-journal.json` and
`watchdog-exit-race-checks.json` in the evidence root.

## Unexpected Karras control and bounded diagnosis

The fifth actual application admission, wrong-EPS V Karras control
`a46cfbb1-27ea-4985-a3ee-ca7f72e99a09`, failed with
`GENERATION_WORKER_FAILED` before any candidate/receipt/seed cursor. Its native
cleanup SIGKILL happened after the recorded queue failure. The measured combined
peak was 5,226,565,632 bytes; the resource guard did not stop this run. This is
not a pixel RED: no decoded output exists. Main normalizes the worker error and
discards the original detailed stderr; the exact original exception remains
unknown.

One separate bounded trained diagnostic reused the same frozen command, weights,
profile and sole wrong-EPS source delta in the existing isolated source copy.
Only staging paths/request ID and read-only observation hooks differed. No new
application job or acceptance was created. The direct fourth UNet input was
finite FP16 (max absolute value 14,352); its output was non-finite (`NaN`). Three
of four progress events preceded the `inference_lora.py` finite-output guard's
`DerivativeError`: `LoRA inference produced non-finite values.` VAE was never
called, and no PNG was published. This reproduces a numerical validity failure
under the mutation; it does not recover the original application's lost trace or
prove Karras pixel inequality. See `karras-failure-diagnostic-v3/result.json`.
The diagnostic's 12 GiB/zero-swap/600-second group completed in about 29 seconds,
with 1,718,935,552-byte measured memory peak and physical process exit.

Two preceding setup-only diagnostics are retained separately: protocol version
must be string `"1"`, not numeric 1; then a group-writable 0775 staging root was
rejected as unsafe. The successful diagnostic used a new 0700 staging directory,
without weakening the worker path guard. Both earlier attempts loaded no model,
ran no denoising steps and created no application admissions; neither is a
semantic mutation result.

The original eight-job plan and all raw rows remain preserved. The observed
matrix now expects eight admissions, seven completions and five accepted
packages: one Normal pixel RED, one Karras failed-before-output control and one
EPS unchanged control. Karras's healthy/restored pixel identity remains a
separate check. The original protected mutation journal was restored before the
diagnostic. A distinct second journal protects the EPS neighboring control;
it does not overwrite the first cycle's history. `campaign-deviation.json`
records this decision before the final three jobs. No failed or mutated control
may enter Add/Save.

## Installed outcomes and limits

The independent raw SQLite/ZIP/Pillow reader passed 5,247 checks.
All eight planned application admissions actually ran, with seven completions
and five accepted Add/Save/readback/reopened packages and owning comparisons.
Three baseline and two fresh restored outputs were accepted; both completed
mutant outputs remained temporary, and the Karras failed control published
nothing. No mutated or failed control was accepted.

The Normal V control changed 65,491 decoded RGBA pixels
before Add. The EPS neighbor stayed identical under the same source mutation.
Both fresh restored V Normal/Karras results reproduced complete healthy RGBA,
with identical normalized numerical inputs. Karras's mutated pixel criterion
from the original plan is explicitly unqualified because no image was created;
its separate direct numerical refusal is not substituted for a pixel comparison.

Raw storage deltas are exactly eight queue rows, seven candidate receipts, seven
project/document seed cursors and five accepted-result indexes. Prior eleven-table
rows and catalog9/14/defaults/exact-file prediction/noise overrides are preserved.
All eight Model Manager profile observations, frozen/native DTOs, portable
configuration and five saved TXT previews were checked. The 52 captured
native PID/start identities plus the separate direct diagnostic identity are
physically exited. Both installed mutation cycles restore all43 original bytes
and device/inode/mode/size/mtime; both protected original backups are absent.

The first reader attempt exposed a missing report field in the failed-before-
completion branch: `lastActualSeed` was never captured. The corrected reader
requires its absence rather than inventing a null capture; raw SQLite separately
proves no seed cursor. The original failed reader log is retained. Its second
bounded2 GiB/zero-swap execution passed; this setup correction created no jobs.

After final source and physical-idle guards, exactly one declared isolated CPU
source copy was disposed, reclaiming 4,128,768 allocated bytes.
Actual trusted-system PID/start/unit/root-file/manager-environment checks preceded
cleanup; unreadable environments are not claimed empty. Compact source declarations,
mutation journals, raw failed/control/restored outputs, requests, PNGs, `.igs`,
screenshots and diagnostics remain pinned alongside the single runtime/catalog.
The disposed source copy can be reconstructed from the retained restored packaged
tree, recorded43-file manifest and single old/new mutation. Final root is 26.379 GiB,
compact evidence 0.382 GiB, inside both soft budgets.
No model/runtime copy or download was created. The new pnpm qualification alias
builds fresh, as neighboring aliases do; this campaign invoked the direct CLI
against its previously built and pinned17-source/five-bundle input. Those inputs
remain byte-exact through closure.

IMG/OUT for this V sampler/profile, arbitrary checkpoints/geometry/formats/seed
policies, subjective quality, trained-output identity with Invoke, full NoobAI/
MVP/public installation and release remain outside this claim.

The next bounded gate is V/true-ZTSNR/leading DPM++ 2M Normal/Karras opaque
nonzero IMG and existing normal mixed-alpha OUT on one pinned full-stack TXT
source. Its finite count, strength/grid, independent oracle, contribution alpha,
merged preview and budgets must be frozen separately before execution. The
current V validator intentionally accepts TXT only. The Karras trained mutated
pixel comparison remains an explicit gap. No new product decision is required.
