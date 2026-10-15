# Smart Patch private Main/worker execution bridge

## Prospective scope

Base `b38b5cea54eeab95f740b0a2cbd9f82b2a0ea9d6`, clean master.
Supporting contracts: [PP-007/008](../product-promises.md),
[Smart Patch](../features/project/generate-mode/smart-patch-layer.md),
[compositing](../features/project/generate-mode/smart-patch-compositing.md).
Previous [numerical adapters](./phase-4-smart-patch-denoising-research.md) execute
real native family models but do not expose a file/transport or resource owner.

This step adds a private leased capture-to-worker execution path, exact prepared
file readers, family resource qualification/loading and exclusive internal RGB
publication/reconsumption. It does not enable public Generate, enqueue jobs,
update the actual-seed cursor, create candidates/receipts/variants, edit the
Project or `.igs`, or apply final world contribution/compositing.

Risk is high: this crosses process, resource identity and destructive scratch
cleanup boundaries. Wrong source/mask/mode or premature cleanup can silently
alter numerical results or destroy admitted work. The existing ordinary flows
must preserve strict source-alpha admission, resource checks and publications.

## Confirmed path and rejected alternatives

Main already captures the layer-owned draft, bbox, mask, internal resolution and
below-layer source. Its source-preparation chain produces RGB and six numeric
planes in one tracked lease. The next operation must track preparation, resource
qualification, worker execution and actual output consumption as one operation;
a separately awaited preparation followed by untracked inference is insufficient.

Normal request constructors are unsuitable: they reclassify source alpha and
couple bbox size to pixel size. Normal OUT also repeats LaMa/coherence and applies
contribution alpha. Keep normal commands unchanged; use a separate private
`execute-smart-patch` request with family, frozen four-way mode, internal size,
nullable model RGB reference, numeric latent KEEP reference, family inference
parameters and nominated private RGB output. World bbox remains captured context.

Reuse resource validators and native loaders, not dummy ordinary targets or
duplicate numerical loops. Illustrious retains exact prediction/noise policy,
VAE precision, signed LoRA and embedding handling; Anima retains its exact
checkpoint/Qwen 3/VAE bundle, compiled weighting and TS-generated native plan.
Lazy dispatch must avoid protocol/inference/adaptor import cycles.

The private entry takes one explicit concrete execution item (prompts and uint 32
actual seed) from its caller. It does not expand dynamic syntax, consume Random
or redefine Reuse; the later batch/queue owner must plan those items. Capture the
item and authored draft before awaits. Authored embedding refs are filtered against
the concrete prompts using the existing exact-resource rule.

## Invariants and parameter registry

- Four-way world mode stays unchanged. TXT has null RGB and native TXT; IMG has
  RGB and ordinary IMG; INP/OUT use prepared RGB and exact numeric latent KEEP.
  All 255 KEEP still executes VAE/denoising per the user's settled decision.
- Internal dimensions use the existing /8 grid and 2048-side/4M-pixel ceiling;
  Anima retains its existing minimum 64. RGB PNG limit 32 MiB, protocol line 64 KiB,
  Steps 1..200, CFG 1..30 and CFG Rescale 0..0.99 remain existing boundaries.
- Numeric latent PNG is white RGBA, alpha=KEEP, no color conversion, exact /8
  dimensions. RGB is strict noninterlaced RGB8 with pinned sRGB metadata.
  Verify actual bounded file bytes/hash/size/CRC/complete compressed pixels.
- Source/mask/output are distinct canonical staging children. Resources are
  canonical exact regular files outside staging and cannot alias input/output.
  Main reuses actual model-service verifiers; worker verifies identities around
  loading. No missing resource triggers a download.
- Output publication is exclusive and exact RGB; no image-mode coercion,
  candidate thumbnail or generation-done response. Late existing output survives;
  rollback removes only publication owned by this operation.
- One registered operation drains before scratch removal, including callback
  failure and admitted worker failure. Escaped capture methods refuse after close.
  Returned material is detached bytes/context rather than surviving scratch paths.
- A private worker capability fences older installed payloads. It does not enable
  a renderer action or change existing public generation capabilities.

## Verification plan

Inventory artifacts before execution. Reuse the checkout Python environment and
small native CPU models; use explicit model-loading/device collaborators where a
tiny fixture cannot satisfy the production trained architecture/GPU precondition.
Those collaborators must be named. Actual parser, file verification, native
VAE/denoising, publication and Main reconsumption remain real. No new trained
model/environment download or installed-runtime update is planned for this slice.

1. Actual Service capture -> resource qualification -> serialized child protocol ->
   real small native family execution -> exclusive RGB -> Main verified bytes.
2. Both families/modes, independent world/internal sizes, all255 KEEP, exact
   replay and valid ordinary neighbors. Preserve raw package/history/recovery,
   cursor, queue and receipt state after completion and refusal.
3. Changed resources/inputs, malformed/profiled/wrong-size PNG, aliases, unsafe
   paths, stale output, late collision and native failures refuse with no partial
   output consumed. Keep ordinary uniform/mixed-alpha rules unchanged.
4. Captured draft/item aliases and whole-chain drain; physical process exit
   precedes cleanup. Execute isolated semantic faults with RED/GREEN controls and
   original-source restoration proof.
5. Required TS typecheck, relevant TS/Python regressions, lint and worker static
   checks. No UI changes or browser/prototype evidence are planned.

## Executed behavior and regression evidence

Evidence root:
`~/.codex/artifacts/imagegen-studio/runs/smart-patch-execution-bridge/20261015-private/`.
Tests execute the dirty implementation on the base above, not the previous HEAD
bundle. Commands, full TAP/JUnit, cgroup reports and source manifests are retained
there. The checkout Python environment is used; no installed runtime was upgraded.

| Boundary                                                            | Actual result                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main/project/model/runtime/shared TS tests, 143 files               | **2281 passed, 0 failed/cancelled/skipped**; 219.316 s bounded runtime. This includes all 16 new Main execution/lease cases, five real JSONL client/exit cases and the new CPU-child exit regression.                                                                                        |
| New Python parser/file/native/publication tests                     | **38 passed, 0 failed/errors/skips**; also included in the full worker result below.                                                                                                                                                                                                         |
| All 45 worker test files, seven serial independent pytest processes | **1541 distinct tests passed, 0 failures/errors/skips**. Counts by group: embeddings 60, core 238, outpaint 115, Illustrious native 336, Anima 446, Smart Patch 294, existing native oracles 52. `python-regression-summary.json`, manifest and individual JUnit reports retain exact scope. |

The new Main tests enter actual `ProjectService.withCapturedSmartPatchGenerationInput`
over real `.igs` and SQLite state. They execute production capture, composition,
preparation, conditioning, model-source and request builders/readers; serialized
requests cross actual Python child boundaries. CPU preparation exits before the
native child starts. Native parser, resource hash checks, VAE/denoising, exclusive
RGB publication and final Main file consumption remain real. World 96×80 at
negative/positive coordinates and internal 64×64 stay independent. Both families
execute all four modes. The lost-coverage INP cases use a 512×512 world bbox and
actually observe all255 latent KEEP, then actual VAE/denoising without mode changes.

The catalog resolver is a declared trusted fixture collaborator, returning actual
small files rather than admitting them as trained managed models. Illustrious
loads the exact tiny safetensors into a native UNet and uses real dual CLIP/Compel;
only architecture/config discovery and CUDA-to-CPU placement are scaled. Anima
uses its actual original-key bundle loader with a scaled architecture and CPU
placement. These are Euler 64 mechanical bridge checks, not installed CUDA,
trained quality, all-resource-combination or full Invoke pixel-parity qualification.
The wider existing native suites remain separate regression evidence.

The two TS OUT cases reuse the existing exact 205669692-byte LaMa file with SHA
`344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9`.
They execute trained LaMa preparation once per case; the family inference bridge
does not repeat it. No environment, trained weight or catalog copy/download was
created. The shared installed worker/catalog is a protected dependency providing
that file only; it is not the worker environment used by these tests.

Actual final RGBA output with updated truthful metadata is refused by Main's
independent RGB reader, including through a declared adapter seam. A changed
checkpoint after Main qualification refuses in the real worker before its native
loader. Captured item/draft/method aliases cannot retarget admitted work. Package
bytes, document, history, shadow, seed cursor, queue and receipts remain unchanged after
completion/refusal. Successful operations remove their scratch before returning
detached RGB and mask buffers.

Real JSONL transport tests use a declared non-ML Node protocol peer. They verify
old capability fencing before dispatch, actual RGB-file consumption, corrupted
output refusal and physical child exit before a failed request settles. The
timeout peer ignores SIGTERM and retains an active interval, so closing stdin
cannot substitute for the required forced exit. Controlled unconfirmed-exit
adapter tests separately verify retention through callback success and failure;
they do not claim an unkillable OS child was reproduced.

## Findings corrected during verification

- A new CPU regression first failed because `REQUEST_TIMEOUT` settled before the
  resistant child physically exited. `ProjectWorkerClient.exclusive` now awaits
  close after a failed/closed child; the same test passed with observed SIGKILL
  and ESRCH before its input lease may clean up. Unconfirmed exit remains an
  explicit error and retains scratch. Existing close tests preserve this stronger
  contract rather than expecting premature `CLOSED` settlement.
- A real capture uses a private `mkdtemp` operation stage, but the pre-existing
  shared scratch may be 0775 under umask 0002. The new wire initially applied its
  private-stage permission rule to both. It now checks canonical ownership for
  the base and separately forbids group/world writing to the operation stage.
  Controls accept the existing shared-base mode and refuse writable stages
  before sending work. The client fixture now creates a real 0700 stage.
- Extracted conditioning initially registered VAE/UNet guards inside the normal
  executor's existing guards. Six existing boundary cases reproduced duplicate
  registration. The pure conditioning helper now performs only conditioning and
  its finite-value checks; normal execution and private numerical adapters retain
  their own VAE/UNet guard lifetimes. All 49 boundary tests then passed without
  weakening their hook/progress/publication assertions.
- Fixture/static issues were corrected separately: TS array/type inference,
  strict Python annotations, an Anima seed edit with stale derived plan values,
  a tiny config directory incorrectly mixed with model files, and a second exact
  ready-capability expectation. Actual config admission remains strict; the native
  fixture now isolates `offline-config`. Error replies in the integration seam
  are surfaced before successful-output validation instead of being hidden as
  generic metadata failures. Initial failed logs remain retained.

## Resource execution and remaining scope

Regression and mutation native runs are serial with a whole-process 4 GiB/swap 0
ceiling and deadlines, with CUDA hidden and CPU/BLAS threads 1. A final one-case
native replay inadvertently overlapped the tail of global lint; both groups had
separate 4 GiB ceilings, so this was not a shared 4 GiB run. Both physically exited;
no further heavy check was started before them. This exception is recorded rather
than treating separate ceilings as one aggregate limit. An initial monolithic full-worker pytest
attempt reached that ceiling and was killed within its cgroup at 163.234 s; the
physical report records `Result=oom-kill`, MainPID 0 and peak 4294967296 bytes.
Its incomplete dot stream is not a passing suite or semantic RED. The same full
test set was then partitioned into seven fresh processes under unchanged limits.
All 1541 cases passed; largest observed successful group peak was 2798927872 bytes.
The TS regression observed 1353052160 bytes. No memory ceiling was raised.

## Executed semantic probes and informed review

Four isolated copies produced exactly one causal assertion RED and one valid
neighbor GREEN each, with no errors/skips or resource termination:

| Fault                                   | Causal RED                                                                    | Neighbor GREEN                                         |
| --------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| Remove final Main RGB topology guard    | A genuinely published RGBA PNG is accepted instead of refused.                | Actual ordinary IMG with valid RGB completes.          |
| Remove capture drain                    | Callback failure releases staging while admitted native execution is blocked. | Awaited ordinary IMG retains and consumes its files.   |
| Remove CPU request exit fence           | Timeout settles while the resistant child is still alive.                     | Existing executable/handshake/self-test controls pass. |
| Reject all255 KEEP at private admission | Frozen INP refuses instead of executing its VAE/denoising.                    | Ordinary IMG still publishes native RGB.               |

`bridge-mutation-993897a636-summary.json` retains exact edits, commands, source
hashes, test results and physical exits. Original sources were byte-exact after
each probe; all source copies were then removed. The initial harness wrapper
failed its cleanup byte counter on pytest's normal `current` symlinks after all
four RED/GREEN pairs had completed. `mutation-cleanup-recovery.json` independently
reconfirmed all physical exits/original hashes and removed those links without
following them; the original failed summary remains unchanged. This is a cleanup
harness failure, not an additional semantic test result.

The final Main/native Illustrious IMG replay passed after the conditioning guard
fix. Static checks and final artifact cleanup are recorded below. Reviewers had
implementation context; their source review is informed self-review, not a blind
audit. It found the shared-scratch mismatch and CPU exit gap corrected above;
the runtime regressions additionally found the duplicate conditioning guards.

TS 2281 preceded the Python conditioning-guard correction; the full 1541 worker
checks and final Main/native IMG replay ran after it. Subsequent edits to tested
source are formatter/import-order fixes only. Full `pnpm run typecheck` and
`pnpm run lint`, worker `ruff check worker-python` and strict basedpyright pass.
The external fixture uses the same Ruff rules with its declared repository
bootstrap E 402 exception and explicit first-party import classification. An
initial root-relative Ruff `--config` invocation incorrectly applied worker-relative
exclusions/import roots to the repository root; it was discarded in favor of
normal worker config discovery, without editing the pinned vendor or baseline
sources. Failed static logs remain retained. No UI/prototype interaction change
is part of this checkpoint.

`pnpm run app:build` passed on the final implementation. The existing large-chunk
Vite warning and upstream numerical/deprecation warnings remain visible; no
dependency or guard was changed to suppress them.

## Artifact cleanup and handoff

`cleanup-final.json` independently confirms physical exit for 47 recorded groups
before fixture disposal. Original mutation sources were restored byte-exact
before later style-only edits; no hidden TS mutation copies remain. Six compact
PNG inputs/results with hashes, mode, dimensions and ICC identities are retained
under `input-samples/`. They are scaled CPU fixtures, not trained output examples.

Completed pytest payloads reclaimed 537513984 allocated bytes; the separately
verified Python mutation payload reclaimed 4681728 bytes, total 542195712 bytes.
TS mutation-copy logical sizes are recorded separately and are not added to this
allocated-space claim. Pytest `current` symlinks were removed without following
their targets. Logs, JUnits, commands, source manifests and failure diagnostics stay.
The compact run occupied about 1.8 MB after cleanup; the artifact root about 27.5 GiB
with 43.5 GiB free. The existing shared LaMa/runtime/catalog and checkout environment
remain intact. The initial temporary-payload estimate below 100 MiB was exceeded
by whole-suite fixtures; those payloads are now disposed, not silently retained.
Lifecycle/dependency records are updated on both the run and shared dependency.

PP-007/008 bodies and matrix rows, roadmap, supporting contracts and worker protocol
record this finite boundary with unchanged public status. Final source/delivery
metadata accompanies the compact evidence; this is source implementation and
mechanical qualification, not an installed-runtime or public Generate rollout.

Public PP-007/008 status remains unchanged. Next owners are world-space output
composition, durable queue/batch integration and immutable Smart Patch variants/
acceptance. This checkpoint does not change `.igs` schema, provenance, presets,
Compare, UI or the public Generate boundary.
