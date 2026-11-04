# Public mixed-alpha Generate and Retry

Date: 2026-10-07. Base: `0df3d82a7df13eedff48c2b0c5b180d12b5c5071`
on `master`; this note describes the subsequent working-tree checkpoint.
Risk: High — durable queue admission, resource identity, cancellation and frozen provenance.
Contracts: [PP-008](../product-promises.md), [Generate](../features/project/generate-mode/generation-actions.md),
[internal execution](./phase-2c-outpaint-execution-research.md), [LaMa delivery](./phase-2c-lama-install-research.md).

## Expected result and preservation

Normal Project Generate derives mode from the captured visible composite. Mixed
alpha admits an explicit native outpaint job for either supported family, provided
the live worker qualifies version 0.12.0 and the exact local pinned LaMa file.
Retry of a failed/canceled outpaint row uses its retained inputs, not current draft
or newly composed pixels. Legacy workers and unavailable/corrupt resources refuse
before canceling old work or discarding candidates. No RGB img2img fallback exists.
Worker completion remains temporary. Explicit Add/Save owns document acceptance;
Save/recovery, actual-seed handling, source preservation and portable provenance
retain their established contracts. Smart Patch, authored masks, regional guidance,
first-setup runtime installation and release qualification remain separate phases.

## Owners and boundaries

Renderer derives support from independent family-specific advisory flags. Optional
flags preserve older ordinary-only responses; absence cannot enable outpaint. Flags
represent worker capability, not a successful LaMa proof. Status polling never
hashes the 205,669,692-byte file. Admission and dispatch independently verify it.

Project action capture precedes asynchronous composition. Main prepares native
family conditioning, qualifies explicit detached worker envelopes for the entire
batch and only then publishes through the durable queue. Orchestrator binds the
capture to open document and indexed Project path. Queue captures a synchronous
`assertCurrent` callback before awaits, checks it before SQL mutations and again
immediately before commit. Model and LaMa verification stays outside SQLite's
transaction mutex; the final callback does not access the database. For outpaint replacement, reviewed old cancellation/discard is deferred until
both runtime worker exit and the entire raster capture lease cleanup succeed.
Fresh index/document/impact/confirmation checks then precede destructive cleanup.
Any partial old cleanup still fences uncertainty. Retry preserves
its source row and sequence on rejection before admission. Dispatch retains its independent local
resource qualification and RGBA contribution verification.

A missing/unsafe auxiliary root cannot disable normal queue/staging recovery.
The app context supplies the same resource collaborator to preparation, action
owner and processor; unsafe storage yields an outpaint-only refusal. It does not
follow a linked root or pretend to repair it. This addresses a confirmed source
path in which auxiliary-root initialization was inside the all-storage catch.

## Parameters, completeness and refusal scenarios

Existing bounds are retained: supported families from the strict family domain
(`illustrious`, `anima`), modes from composed final alpha (all 0 / all 255 /
every other distribution), worker version/capabilities from the strict readiness
schema, batches at most 32 jobs, 8-pixel grid, sides at most 2048 and 4M pixels,
PNG at most 32MiB, JSONL at most 64KiB, payload at most 128KiB, staging at most
64 candidates. LaMa identity is the pinned manifest (205,669,692 bytes, SHA-256
`344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9`).
No new production ceiling or inferred release guarantee is introduced.

Axes requiring evidence: both families; Generate/Retry; current/closed/replaced
document; held last resource qualifier and late SQL hook; legacy/current worker;
missing/corrupt helper; old queued work and old candidates; scalar/Buffer mutation
after capture; explicit Add/Save/reopen and comparison. Filesystem/DB regressions
use actual production repositories; controlled peers cannot prove trained ML.
Native installed qualification must use genuine weights and non-editable 0.12.0
worker through built Electron UI. Resource delivery from an existing genuine local
file substitutes transport/DNS only and does not prove a public GitHub download.

Failure diagnostics use bounded byte equality. Heavy checks run sequentially with
whole-process cgroup limits and zero swap: focused tests/mutations 2GiB, full app
4GiB, installed trained inference 12GiB. OOM/import/timeout never counts as a
semantic mutation. Research/review is self-review plus source-informed independent
review, not a blind audit.

## Executed evidence

Artifact root: `~/.codex/artifacts/imagegen-studio/public-outpaint-2026-10-07/`.

- Focused final queue/controller/storage regressions: 48 executed/passed, zero
  failures or skips (`focused-final.log`). Both family queue child probes enumerate
  Generate/Retry × final qualifier/SQL hook × closed/replaced/current documents.
  Public controller cases retain actual old RGBA candidates and pending jobs through
  runtime-exit and capture-exit revocation, preserving files, seed and saved package.
- `mutations.json`: 65/65 clean baseline, 11/11 named semantic mutations detected
  by intended assertions, 65/65 restored. Mutations affect actual DTO/renderer gates,
  final SQLite document fences, helper-vs-storage isolation, late new-ID cleanup
  and outpaint iteration count. No import/OOM/timeout is counted. The first isolated
  baseline lacked the genuine ICC fixture and was invalid; another trial targeted
  an ordinary method after ESLint reordered methods. Both harness mistakes were
  corrected before the recorded green baseline and outpaint-specific mutation.
- `typecheck-delivery.log`: final prototype and app TypeScript checks passed,
  18.389s, peak 1.5GiB and zero swap.
- `scoped-lint.log`: changed-source ESLint/fixes passed. `build.log`: fresh app build
  passed; its existing large-chunk advisory is unchanged.
- `app-test-final.log`: final whole-app regression passed 2062/2062 tests, zero
  failures/canceled/skips/todos, 104.5s test duration, peak 601.2MiB and zero swap.
- `lint-final.log`: full-repository ESLint passed, 32.3s, peak 2.7GiB and zero swap.
- `native-legacy/native-report.json`: 36 native UI checks passed with controlled
  worker/pixels, including legacy mixed-alpha refusal and ordinary queue,
  Cancel/Retry, Add/Save/reopen, resource and settings controls. This neighboring
  compatibility evidence does not claim GPU inference. The process exited
  successfully in 71.2s, peak 908.8MiB and zero swap (`native-legacy.log`).
- `provision-report.json`: fresh isolated, non-editable worker 0.12.0 installed with
  locked dependencies, both explicit family outpaint capabilities and confirmed
  real worker exit. Provisioning peaked at 9.7GiB within the 12GiB cgroup, zero swap.
- `native-v3/report.json`: `passed`, nine checks and six actual successful trained
  completions through built Electron UI, production Main and the installed worker.
  Each family completed an ordinary txt2img source, mixed-alpha Generate and a
  public frozen outpaint Retry. The two original Retry source jobs were actually
  admitted, canceled and retained; they are not counted as successful completions.
  Genuine pinned CPU LaMa and trained CUDA models used 256×256 targets, three
  steps and signed ordinary LoRA weight −0.5. Seed 0/Reuse and strength 0.5 are
  captured; Retry preserves its original inputs/settings after current prompt and
  strength edits to 0.25. Actual bbox keyboard moves by 64 pixels produce mixed
  alpha; the second outpaint target is at x=128 after accepting the first.
  Main verifies frozen family kind, source PNG/keep-mask/policy/LaMa identities and
  exact contribution alpha. Explicit Add, rendered Save, real close/reopen and
  read-only comparison preserve contribution bytes/alpha, existing source layers
  and portable provenance without machine-local paths or source/weight bytes.
  `nativeExit.code` is 0; `trained-v3.log` independently records systemd success,
  9min 38.310s, peak 7.9GiB and zero swap.
  Post-run source verification confirms the recorded native bundle hashes still
  match `dist`, all mutation production-source hashes are unchanged, and all 43
  provisioned worker payload files match both current source and installed bytes.
  Actual screenshots were inspected for the mixed target, accepted Illustrious
  comparison and Anima Retry comparison; current strength 0.25 is visibly separate
  from the recorded 0.5. Screenshot inspection does not establish image quality.

The first native attempt used the fixed Main installer to publish the exact LaMa
file into the new isolated data root (`native/report.json`: `reused: false`,
one transport call, source unchanged). Existing genuine read-only bytes replaced
DNS/network transport; no public network download is claimed. Resumed v2/v3 runs
verified and reused that pinned file; v3 records `reused: true` and zero transport
calls. This proves local installer publication/reuse plus installed development
inference on this Linux/NVIDIA host. It does not qualify public first setup,
Install/Repair, a signed release, arbitrary models/GPU, maximum geometry or image
quality, and does not complete phase 2C or PP-005/007/008.

The earlier native attempts are failed harness evidence. The first completed only
the ordinary source case, then hung in `application.close()` with a dirty Project;
its original error was not checkpointed before cleanup, and the owned cgroup was
stopped. V2 checkpointed a 404 when the harness fetched an old revision-bound
asset URL after committing the bbox edit. Its failed cleanup was bounded at 30
seconds; a closed automation channel and `forcedExit: false` do not prove physical
exit. V3 captures the source-layer baseline before the bbox/draft mutation, keeping
revision-bound URL invalidation intact, and completes all six cases with the exit
evidence above. Neither earlier attempt counts as qualified native completion.

The first whole-app run executed 2062 tests: 2060 passed and two failed counts
(one Anima legacy refusal assertion and its parent). Its old expected global
unsupported-mode code was updated to the explicit unsupported-worker code; the
0.11 fixture remains a refusal neighbor, with no inference or durable input.
The final whole-app rerun above passes with the explicit unsupported-worker
expectation.
