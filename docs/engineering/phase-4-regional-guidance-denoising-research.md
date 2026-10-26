# Private ordinary Canvas regional Euler denoising

Status: **complete within the private CPU ordinary Canvas Euler denoising/decode boundary** on dirty
`master@10115df581d9e07049478dee3866a280886794fd`. This follows the
[concrete recipe encoding/native consumer](./phase-4-regional-guidance-consumer-research.md).
Its 878 Python / 91 Main results are historical evidence, not this checkpoint's
denoising result.

## Finite owner and contract

The new private runner consumes the complete existing Main recipe, encodes and
assembles its signed streams once, and lets the original native SDXL pipeline
own initial noise, scheduler transitions, CFG, the denoising loop and VAE decode.
Shared private extraction preserves the existing one-shot frontend. No public
tensor bank, copied diffusion loop, worker command or generation caller is added.

The explicit encoding profile remains `ordinary-canvas-static-dualclip-cpu-v1`.
The explicit execution profile is `ordinary-canvas-euler-txt2img-cpu-v1`: one
image, exact integer steps 1 or 2, Euler/epsilon, finite CFG 1–30, CFG rescale zero,
and native `pt` image output. Layout remains explicit and must agree with CFG.
Dimensions come from the recipe bbox and seed from the matching concrete item.
No sample, timestep, time IDs, generator, callback, independent plan/context,
replacement text or arbitrary kwargs can be supplied.

Execution fixes the existing `sdxl-scaled-linear-v1` beta policy: 1,000 training
timesteps, beta start 0.00085, beta end 0.012, scaled-linear, no trained betas,
steps offset 1, linspace spacing and zero-SNR rescaling false. The existing
scheduler selector receives an internal copy with that explicit noise profile;
the caller's noise profile must be absent. Borrowed scheduler configuration and
history therefore cannot retarget this named private experiment. Existing
ordinary micro-conditioning remains 1024×1024 with zero crops; it is separate
from bbox-local geometry and actual `/8` sample dimensions.

The recipe cannot prove target mode, batch membership, seed history or installed
checkpoint identity. The caller must establish ordinary transparent-target
txt2img and the same captured concrete job. Main qualification separately uses
the actual target composer and independent PNG-alpha classifier before handing
the complete recipe to Python. Opaque/partial targets fail that test-only gate;
the runner has no target-pixel API from which to authenticate mode.

Global support and signed pooled sources remain explicit. Global-first order,
independent regional streams, inherited negatives, absent versus empty positive,
local empty negatives, both-sign validation and all four coverage kinds retain
the completed recipe semantics. Nearest8 sampling and the threshold/pyramid
profiles remain unchanged private candidates. Static text only: active
embeddings, resource markup, LoRAs/adapters, references, Smart and Anima refuse.

## Ownership and failures

A fresh native pipeline wrapper and fresh scheduler borrow validated components.
The source pipeline's scheduler, call attributes and configuration remain owned
by the caller. A fresh CPU generator uses the matched seed; global RNG is not
the noise source. Both CLIPs must already have native capture hooks initialized.
CPU float32, eval, no-grad/no-autocast and native uncompiled/non-offloaded paths
are required; no warming, `.to()`, `.eval()`, resource load or repair occurs.

VAE decode makes its module tree an active reserved dependency. New-runner
preflight refuses every pre-existing local UNet/VAE forward pre/post hook across
their complete trees, including observers, and global forward hooks. The old
one-shot hook contract is preserved. Existing CLIP hooks retain guarded
value-equal replacements. Owned regional, padding, value and finite observers
are installed only after this profile check and removed through their journals.
Fixed context, pools and time IDs are checked through actual root and attention
consumption; samples and timesteps must satisfy the evolving native profile.

Failures during setup, encoding, a later UNet call, scheduling or decode return
no result. Exact processors, hook entries, call-entry slots and reservations
must restore before a fresh call. Nonfinite UNet/VAE output must refuse before
native postprocessing can clamp it. Successful output is the original native
result with finite CPU float32 `[1,3,height,width]` image. Caller model state,
vocabularies, training flags and configuration remain unchanged.

The scope is cooperative: no direct concurrent forwards, in-place mutation of
owned inputs, or registry/model mutation during execution. It is not a hostile
plugin or arbitrary Python sandbox.

## Risk, bounds and acceptance

Risk is high: regional conditioning can silently drift on a later step; native
scope failures can leak model mutations; scheduler/decode add active consumers.
The alternative of calling the one-shot frontend per timestep repeats encoding
and does not bind one owned bank to a whole native run. Copying the diffusion
loop would create a second scheduler/CFG owner. Both are excluded.

| Parameter       | Private decision or existing owner                                        |
| --------------- | ------------------------------------------------------------------------- |
| Steps / images  | 1 or 2 / exactly 1; finite experiment limits                              |
| Regions / rows  | Existing 3 regions / 308 aggregate rows per sign                          |
| Geometry        | Existing sides 8–2,048 divisible by 8; area ≤4,000,000                    |
| Context / pools | Existing 5,056,512 logical float32 payload bytes                          |
| Expanded mask   | Existing 32×1,024×1,024 Boolean logical elements, including heads         |
| Terminal latent | At most 1,000,000 float32 payload bytes under area bound                  |
| CFG sample      | At most 2,000,000 float32 payload bytes under area bound                  |
| Decoded RGB     | At most 48,000,000 float32 payload bytes under area bound                 |
| Qualification   | Serial 3 GiB groups, zero swap, 600-second deadline                       |
| Artifacts       | Reuse existing runtime; local 100 MiB aim; preserve causal/source closure |

Pipeline copies, encoding/conversion temporaries, validation scratch, model
workspaces and test observations are additional. These arithmetic bounds are
neither RSS nor performance/model-capacity guarantees. Existing Main capture,
recipe and numerical budgets remain separate.

Acceptance requires whole freshly produced Main recipes, actual target-mode
classification, unchanged Main state, real CLIP/Compel, literal contexts/masks/
pools on both denoising calls, native scheduler transitions and VAE decode.
Encoding counts must stay fixed when steps change from one to two. Include both
layouts, sign padding, empty/absent/negative-only/zero coverage, non-first pools,
zero-region ordinary equivalence, same-seed repeat and changed-seed control.
Refusals precede encoding; partial setup, later-step and decode failures require
exact restoration and fresh-call recovery. A valid semantic mutation must alter
actual regional consumption and a scheduler input or decoded output while an
unaffected control stays green, then byte-exact restoration returns both green.

## Evidence to date

ROOT rechecked every one of the 1,366 baseline files before changes. Disk
inventory was about 6.1 GiB under the artifact root with about 80 GiB free; no
environment or weights were provisioned. The initial ordinary baseline failed
collection because the external test lacked the repository tests import path;
the corrected harness passed one real native two-step Euler/VAE case at 24×40,
observing both CFG UNet samples at 3×5. This establishes ordinary mechanics only.
The fresh real Service/coordinator/package probe produced four whole recipes
from two projects with unchanged state. ROOT then used the real derivative
worker and independent Main alpha classifier:
matching transparent targets classify txt2img; opaque and partial controls classify
img2img and outpaint and do not enter the test-only denoising handoff. Eight
whole-recipe runs across both layouts observed 16 native UNet calls, 16 Euler
steps and eight VAE decodes, with literal contexts, masks, pools, fixed time IDs,
original native results and exact borrowed/global-RNG restoration. This run used
the pre-typing source; eight production diagnostics were corrected by casts only.
The old recipe/conditioning suites passed 470 cases after shared extraction.

The first new focused run executed 71 cases: 67 PASS / four failures plus one
teardown error (72 JUnit records), zero skips. These were fixture/API assumptions:
scheduler setattr registered a replacement pipeline config during fixture repair;
the helper-call spy omitted two empty shortcuts; syntax retained its existing
GENERATION_PROMPT_UNSUPPORTED code; and binding/all-masked preflight legitimately
uses tokenization before encoding. Narrow test corrections preserve the inputs,
semantic assertions, encoder/install tripwires and 71-case matrix. Strict project
typing found 42 test diagnostics, addressed by annotations/casts. Final strict
typing and scoped Ruff/format pass. Combined execution passes 1,082
cases: 71 new + 1,010 neighbors + one actual Main boundary, zero failures/errors/
skips, 506 dependency warnings. The final typed Main observations match the
pre-typing observations exactly. Independent full source review R1 is CLEAN
within the cooperative contract;
the retained-byte audit is independently CLEAN and ROOT release gates are complete.
Corrected focused execution passes all 71 cases, zero skips; scoped strict
BasedPyright passes with zero diagnostics. Independent investigations are
source-only, separate from ROOT runs.

The first isolated second-step mutation reached its intended spatial permission
assertion, but default pytest failure rendering invoked Diffusers ConfigMixin
repr before fixture teardown. Its to_json_string writes class/version keys into
the borrowed internal config, causing a second diagnostic teardown error. This
attempt is retained and excluded from the qualifying mutation result. All 1,369
isolated files were restored/verified. The identical mutation's second attempt
with short traceback still triggered
rewritten-assert repr and the same extra teardown error. The third runner uses
short traceback plus pytest's plain assertions: no test inputs or assertions
change, only diagnostic repr generation is disabled. It records two GREEN → one
spatial semantic RED / two-step zero-region control GREEN → two restored GREEN,
zero errors/skips. The failing equality observes the second original processor's
actual permissions after the full native run/decode; step one, contexts, pools,
ranges, sign padding, scheduler and seed remain unchanged. All 1,369 isolated
files and the shared subject match their archived originals afterward.

## Independent review and completion boundary

The full independent frozen R1 review verifies the 1,366-member baseline,
1,369-member overlay, eight deltas, beforeimages, protected source pins, native
primary sources and historical document tails. It finds no concrete reachable
material defect in extraction/refusal order, per-step association/padding,
scheduler policy, dynamic guard restoration, adapter latching or VAE lifecycle.
Its CLEAN is source-only; it independently executes no native code or tests.

All five Python files remain identical to that reviewed typed freeze. Changes
following it are documentation finalization only. No TypeScript/Vue source
changes occurred in this owner; no new app build, prototype test, packaged-worker
or installed-model claim is made. ROOT's Main probe is development Service/
SQLite/package capture plus an actual derivatives worker and private test-only
recipe handoff, not Electron or public Generate qualification. Serial native
and mutation units use 3 GiB/zero-swap/600-second bounds; small source/archive/
format work is not an aggregate native memory-capacity claim.

## Retention and release

Evidence root:
`~/.codex/artifacts/imagegen-studio/runs/regional-guidance-denoising/20261026-cpu`.
Baseline source has 1,366 members; the executed/reviewed overlay has 1,369 with
exactly eight deltas. All five Python files remain byte-identical to the typed
R1 freeze; finalization changes only three documents. There is no fresh app
build claim. Runtime, typing, mutation and final source generations remain
separately pinned in the retained version map.

The independent read-only retained-byte audit is CLEAN within exactly three
candidates. It verifies every baseline/mutation/Main archive member and all
169 fixture mappings to 33 unique CAS blobs / 692,635 content bytes, including
four IGS packages and two immutable-read-only SQLite databases from both Main
probes. All 19 migrations, generators, PNG/ICC and config/lock dependencies close
outside disposal. Synthetic checkpoint markers and random local models do not
become trained-weight or installed-resource evidence. Audit found the lifecycle's
combined-r1 omission; ROOT reconciled its explicit list before release.

ROOT freshly checked all 17 owned units, physical candidate users, complete
source/restoration and CAS pins, all artifact-root lifecycle declarations and
symlink incoming references without following their targets. The ten then-existing
delegated tasks were terminal without pending children/questions/approvals; two
capacity failures and their successful retries remain distinct. After those
gates, exactly `combined-r1`, `main-probe-r1` and `mutation-second-step-r1` were
removed. All three are absent. Measured root and run reduction is **32,870,400
bytes**, matching the audited allocation. Root allocation changed from
6,602,039,296 to 6,569,168,896 bytes at that event.

Lifecycle is retained with no live payloads. Raw Main fixtures, source archives,
original/mutant patches, all diagnostic attempts and RED/control/restoration
logs, JUnit, primary sources and CAS remain. External `.venv` and the previous
consumer's baseline/native sources stay protected by bidirectional dependencies.
The run stayed below its 100 MiB local aim; older promise-linked compact evidence
has a recorded retention exception, not an age-based cleanup rule. Final source
archive and final bookkeeping review follow this release event; historical path
references do not assert disposed payloads still exist.

## Preserved exclusions

Enabled-region NEW refusal, target-only Smart permission, published/frozen Retry
independence, and provenance/Compare/result-derived-preset exclusions remain.
There is no public Generate, worker-protocol, durable queue, acceptance, UI or
persistence change. Production float16/CUDA, trained regional quality, installed
checkpoint identity, packaged-worker and public readiness remain unqualified.
PP-001/007/008 remain **Пока не обещать**.
