# Installed public Regional Guidance qualification

## Boundary and current status

This continues the
[public Invoke Canvas slice](./phase-4-regional-guidance-public-invoke-research.md)
from clean Studio `260195542390a4a9e832ce2d429c679060af47f5`, with the necessary
startup correction below: installed RuntimeManager, renderer → IPC → public
Generate/Retry → worker → Results → Add → Undo/Redo → Save/reopen.

**Native-r6 finite full chain PASS; bounded UI review and lifecycle closure complete.**
R1–r5 remain excluded failed attempts. Frozen
`scripts/qualify-installed-regional-generation.mjs` SHA-256:
`a1288b1bd75e7b7777888fa32bcb2c63adf394f2222482c2c50ea6c1b1941491`.
Source review is not execution. PP-001/007/008 remain
**«Пока не обещать»**.

Evidence is ROOT-reported, not independently executed here.

## Installed runtime and checkpoint

Both older environments retired. Existing developer
`scripts/provision-qualification-runtime.mjs` created the new runtime.
This is **not release Install/Repair**: those methods remain unavailable.

| Item | Actual ROOT record |
| --- | --- |
| SHARED | `~/.codex/artifacts/imagegen-studio/shared/regional-public-worker-014-20261103` |
| Runtime/appData | ID `regional-public-worker-014-20261103`; `SHARED/data/imagegen-studio` |
| Report | `SHARED/provision-report.json`; SHA-256 `f17ee319fd03db98c2b35fb4fc708d81d44419e053a378d0f5fa96af459e11d8` |
| Qualification | **338.222 s**, noneditable worker **0.14.0**, actual `illustrious-regional-invoke-v1`, app-owned CPython **3.12.13**, **17** pinned config files; **61 worker-tree files** match checkout/provision/installed trees |
| Provision limits | Configured host MemoryMax **3 GiB** (3,221,225,472 bytes), swap **0**, deadline **1,800 s** |
| Observation | MemoryPeak **3,222,650,880 bytes**; observed peak/transient samples are distinct from the configured limit, not capacity evidence |

RUN is
`~/.codex/artifacts/imagegen-studio/runs/regional-guidance-installed/20261103-public`.
Original official epsilon checkpoint: **6,938,040,760 bytes**, SHA-256
`3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9`,
Civitai model/version/file **795765 / 889818 / 798303**. Same runtime/original
weights reused, without weight copy/download. ModelRepository catalog setup is
a prerequisite, not installation UI/Civitai-delivery qualification.

## Authorized production scratch fix

Pilot startup returned Ready but created **0775** scratch under umask **0002**.
Unchanged regional transport refused it; owned **0700** neighbor GREEN without
ML. Private probes had supplied private scratch, missing startup.

`src/main/app-paths.ts:ensureAppPaths` now creates/hardens only the fixed owned
scratch via `O_DIRECTORY|O_NOFOLLOW`, descriptor/path/UID/canonical and post-chmod
identity/permission checks. Inode/bytes preserved; links/files/foreign owners/
replacements refuse. Index calls it before services; transport intact. R2:
**0775 → 0700, same inode**, without harness chmod.

ROOT: **1,019 affected Main PASS**, zero failures/cancellations/skips; six scratch
cases and a final **48-PASS neighboring subset**, not extra distinct totals.
TypeScript/Vue typecheck and fresh build PASS; independent source review CLEAN.
Copied post-chmod-check mutation: **baseline two GREEN → one semantic RED + one
control GREEN → restored two GREEN**. This qualifies the owner guard, not ML.

## Attempts

| Attempt | Failed attempts remain excluded |
| --- | --- |
| r1, **6.139 s** | Non-tight fixture masks rejected before Electron/native/queue. Empty package: `RUN/failed-r1-inputs`. Corrected to white 512×1024 tight masks at x=-13/499, y=5; independent world-alpha digests unchanged |
| r2, **43.125 s** | Installed Ready/catalog/scratch passed. Images per click default 2 correctly preceded target refusal; zero native requests/jobs. Controls now set 1 through UI |
| r3, **134.607 s** | Two wires, one canceled/one completed; helper CORS failure. Owned SIGKILL needed; cached-channel failure. Separate fresh **23 PID/start identities + scope exit** proof |
| r4, **134.093 s** | Two wires, one canceled/one completed; PNG/browser/Canvas/Add succeeded. Helper wrongly required view `kind` (portable-only). Dirty close needed owned SIGKILL; **24 identities + scope exit** confirmed |
| r5, **27.340 s** | Unexpected New Project modal blocked Home before controls/generation. Cause unknown, no product bug inferred. Zero jobs/wires; healthy exit 0 and physical exit confirmed |
| r6 | **PASS**; same harness/runtime, empty operational DB reused; r5 fixtures/catalog retained |

R3/r4 exact scripts/app archives retained before exact resets. Current harness:
production-matching CORS, cached process handle, view/portable assertions and
finished/OK original Add IPC wait. Source-only review CLEAN.

ROOT opened all six final r6 screenshots under ui-audit, plus r4 Results: refusal
controls, frozen Queue settings, edited authoring, Results and saved/reopened Raster.
This is bounded UI self-review; optional-thumbnail
placeholder observed; no thumbnail-production/quality qualification.

## Native-r6 actual finite PASS

ROOT: **eight checks**, controller **147.397 s**, internal **146.430 s**.
UI/Main/default installed RuntimeManager, no injection/adapter.
Exactly **two regional wires, one canceled job, one completed receipt**;
**14 worker spawns at the post-Retry checkpoint; 19 across the full run** include
qualification/preparation and five later CPU children. No ordinary replacement.

| Boundary | Actual result |
| --- | --- |
| Frozen request | Transparent 1024² at (-13,5), Euler/Normal, CFG5, seed123, 30 steps, embedded FP16 VAE, Main leading policy; actual wire before UI Cancel |
| Frozen Retry | UI changed seed124/two steps/both regions disabled and explicitly Saved; Retry consumed original 30-step/123 profile, masks and policies |
| Exact output | Signed RGB PNG **1,379,326 bytes**, SHA-256 `942f59c35b92c3bab04328d92d3714cca48a24106b0c4a8e818559af17e913a1`; decoded RGBA SHA-256 `7bc3695217b9f44285c97d7b19a9d2c3478b0441da019b30897c51f5ce126829` |
| Consumers | Independent PNG/browser whole-RGBA equality, Canvas delivery samples, signed Results, exact Raster/Save ZIP/reopen bytes; base-only provenance and placement; Undo/Redo same layer; current disabled authoring preserved |
| Explicit mutation | Original Add IPC finished/OK awaited. No implicit Save on Generate/Cancel/completion/Add. Opaque/partial UI refusal created zero jobs/Generate IPC/regional wires |
| Closure/identity | Observer restoration, healthy exit **0**, **28 PID/start identities plus owned scope exit**, pageErrors empty; source/bundle/provision/pointer/config/model inode+SHA/catalog equality PASS |

Configured native **10 GiB** plus launcher **2 GiB**, zero swap, **1,800 s**
deadline. Native MemoryPeak **1,844,232,192 bytes**, launcher **1,197,953,024
bytes**; sampled maxima remain separate. These are measured run envelopes, not
application capacity. Across attempts r1/r2/r5 had zero regional wires; r3/r4/r6
each had two. Only r6 passed the full chain.

Numerical regional progress is absent from Python/client/Main. No qualification
of numerical progress, visual quality/useful assignment, Anima/Smart regional
inference, full Invoke parity, arbitrary options, performance/capacity, release
Install/Repair or public release. Earlier negative visual findings remain.

## Source basis and retention

InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`: dependencies, model services,
invocation context and queue/processor callers read directly; composition paths
are in the public note. Private `mkdtemp` in `image_files_disk.py:stage_delete`
and its images-service caller inform existing descriptor isolation. The
[runtime contract](../specs/07-python-runtime-management.md) is unchanged.

Initial cache cleanup **COMPLETE: 5,839,495,168 allocated bytes reclaimed**.
Excluded r3/r4 mutable app state was archived before exact reset, reclaiming
16,363,520 and 20,135,936 bytes. The exact restored scratch-mutation copy, including
an inert `node_modules` symlink, was archived and removed without following it:
12,173,312 bytes reclaimed. Total across deletion-only intervals:
**5,888,167,936 bytes**; these figures do not imply a net decrease since provisioning.

`RUN/final-app-state.tar.gz` preserves the final DB/packages/operational assets;
its manifest verifies119 entries (SHA-256
`a38697b7b0d6088b87d9c15b7694f0cc2aaa39f35270e00a7db85d73fb704180`).
Failed archives, executed source snapshots, original output PNGs, controls,
mutation RED/GREEN/restoration and exact commands remain retained. ROOT verified
physical exits and restored source before disposal. No source weights, reusable
runtime, ordinary app data, global caches or symlink targets were removed.

RUN/SHARED lifecycle is retained. Keep the one compatible installed runtime/catalog,
original checkpoint and config/provision companions for the next finite installed
interruption/restart/recovery checkpoint; retire the runtime only when replaced
and no incoming dependency remains. Final root is approximately19.81 GiB and this
run approximately31 MiB before final source archives. Older runs total about6.4GiB;
the larger historical source/evidence graphs were inventoried and remain outside
this run's cleanup candidates. No age-based root sweep or unpinning occurred.
See `RUN/qualification-summary.json` and release records for exact measurements.
