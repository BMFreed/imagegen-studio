# Smart Patch private world output

## Prospective scope and risk

Base `7979f6da2f8d0645537fa396df55c0ebb4209f8c`, clean master.
Supporting contracts: [PP-007/008](../product-promises.md),
[Smart Patch](../features/project/generate-mode/smart-patch-layer.md),
[compositing](../features/project/generate-mode/smart-patch-compositing.md).
The previous [Main/worker bridge](./phase-4-smart-patch-execution-bridge-research.md)
returns verified processing-size RGB and independent frozen mask planes.

This high-risk file/process/lease slice adds a private CPU world contribution
after execution. It does not create public Generate, durable jobs/candidates,
receipts, accepted variants, provenance/presets/Compare fields or `.igs` changes.
There are no UI or installed-runtime upgrades. Public promise status stays unchanged.

## Confirmed numerical and ownership contract

The already computed `conditioning.finalContributionMask` is world-bbox-sized
numeric GENERATE alpha, with restored binary authored core and world-pixel fade.
It must not be inverted, resized, multiplied by painted softness, blurred again
or reconstructed from latent KEEP. Resize generated RGB first with explicit
Pillow BICUBIC to world dimensions, then attach the final contribution alpha
unchanged. Identity-size output preserves exact generated RGB, including RGB
under alpha0. No original-source pasteback or document composite belongs here.

Local Invoke graph `addInpaint.ts:171–180,228–253` and
`addOutpaint.ts:223–265` resize generated output to original size before applying
the mask. `image.py:510–523` uses BICUBIC; `apply_mask_to_image:1426–1450`
replaces alpha while preserving RGB. IGS already computes its fade in world
pixels, so full scaled mask pixel parity with Invoke is not claimed.

World bbox uses existing bounded integer geometry, including negative origins;
its dimensions need not follow the latent /8 grid. Processing RGB retains /8,
side2048/pixels4M ceilings. World planes retain side2048/pixels4M and PNG32MiB
ceilings. Coordinates stay in frozen Main context; the CPU operation handles
pixels without rounding or moving the bbox. No new product decision is needed.

Add private CPU `compose-smart-patch-output` / `smart-patch-output-composed`,
capability `smart-patch-output-composition`. Its inputs are verified processing
RGB, numeric world contribution and a nominated private RGBA output. Reuse exact
PNG/hash/ICC/CRC readers and exclusive link/fsync publication with inode-aware
rollback. Existing outputs and inputs cannot be overwritten or alias each other.

Preserve `capture.execute` and its RGB contract. Add `capture.executeAndCompose`
with the same captured execution options plus an output-worker collaborator,
captured before awaits. One registered operation runs preparation, inference,
world composition and final consumption before cleanup. Return existing detached
processing data plus `worldContribution` RGBA; placement stays `context.bbox`.
Main independently verifies topology/profile/hash/dimensions and compares actual
output alpha byte-for-byte with the frozen final contribution mask. Callback
failure drains admitted work; unconfirmed child exit retains the complete lease.

## Verification plan

Inventory: artifact root28GiB/shared27GiB/runs1.3GiB/free44GiB. Use checkout
Python and small CPU fixtures, no downloads/environment/model copies. All heavy
checks run serially under whole-process ceilings, swap0 and deadlines. Reuse the
bounded runner; native cases4GiB, typecheck2GiB, lint4GiB. Avoid a monolithic full
worker process: the previous suite hit4GiB and passed when split into fresh groups.

- Actual CPU protocol: identity/up/down/nonuniform resize, literal alpha values,
  hidden RGB, strict malformed inputs, exclusive output/rollback and unchanged inputs.
- Main capture into actual CPU composition and small native family execution;
  immutable aliases, unchanged raw package/document/history/shadow/cursor/queue,
  lost latent coverage with world core retained, and final wrong-alpha refusal.
- Full-chain drain/closed calls and existing physical-exit/retention contracts.
- Isolated semantic RED/GREEN probes for resize, alpha and lease ownership;
  byte-exact source restoration and physical exit before disposal.
- Required TS checks and affected Python regressions/static checks. Record exact
  executed counts and fixture seams; no trained GPU/installed/public claim.

## Executed behavior and boundaries

This is implementation self-review of the dirty working tree over the base above,
with a separate read-only cross-review of the Main and Python boundaries. It is
not a blind product audit or an installed-runtime qualification. No additional
product question was needed.

| Boundary                                                         | Executed result                                                                                                                                    |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main/project/model/runtime/shared TS, 144 files                  | **2294 passed, 0 failed/cancelled/skipped**, 237.928 s bounded runtime. Includes 9 added world integration cases and 4 added JSONL client cases.   |
| New Python output tests                                          | **58 passed, 0 failed/errors/skipped**; included in the affected regression total below, not added to it.                                          |
| Affected Python regression, 22 files in 3 fresh serial processes | **705 distinct tests passed, 0 failed/errors/skipped**: core238, ordinary outpaint115, Smart Patch352. This is not the entire worker suite.        |
| Isolated semantic mutations                                      | **3 causal RED / 3 neighboring GREEN**, 0 skipped/errors/cancelled. Original source hashes unchanged; physical exit verified before copy disposal. |

Exact file manifests, commands, TAP/JUnit and process reports are retained under
`~/.codex/artifacts/imagegen-studio/runs/smart-patch-world-output/20261015-world/`.
`affected-ts-files.json`, `python-regression-shards.json` and
`python-regression-summary.json` define the measured regression scope. Required
static/build checks and final disposal are recorded below.

The Python tests enter actual `process_request`, strict parser/readers and file
publication. Resize expectations use the public Pillow BICUBIC primitive over
literal nonuniform RGB, independently of our composition helper. Identity,
up/down/nonuniform resize, alpha0/1/64/128/254/255, hidden RGB, malformed topology,
ICC/CRC/metadata/grid/path/alias/limits and late/replaced/existing output are
covered. Actual fsync failure and replacement during metadata read verify that
rollback deletes only the operation's inode. A serialized CPU child exercises
the real entrypoint without importing Torch. Upstream Invoke source was inspected;
these cases do not execute a separate pinned Invoke composition body.

The new Main integration cases use actual `ProjectService` capture over `.igs`
and SQLite. Four execute native family inference plus actual CPU world output:
Illustrious and Anima IMG at world96×80/internal64, and each family's INP at
world512/internal64 with authored coverage disappearing from the latent grid.
The latter actually observes all255 latent KEEP while retaining INP mode and the
world authored core. Placement, including negative origins, stays frozen in Main.
Decoded output is actual RGBA8 with pinned ICC/hash and alpha equal to the private
final mask. Returned bytes survive removal of their operation stage. Raw package,
document/history/shadow, cursor, queue and receipts remain unchanged.

The trusted catalog fixture returns actual tiny resources. Illustrious uses real
native UNet/dual CLIP/Compel with scaled architecture/config discovery and CPU
placement; Anima uses its original-key bundle loader with scaled architecture and
CPU placement. This is Euler64 mechanical integration, not trained quality,
installed CUDA, all samplers/resources or full Invoke pixel parity. Five additional
world ownership/fault cases declare a literal valid-RGB generation collaborator
and retain actual CPU composition/readback. They test wrong-alpha output outside
the adapter, owned item/method/bbox snapshots, callback drain/escaped calls and
two unconfirmed-exit retention outcomes. The latter collaborator never owns a
child; it proves retention policy, not an actual unkillable OS process.

One new `ProjectWorkerClient` case crosses the real CPU JSONL entrypoint through
a declared checkout bootstrap executable; this does not qualify an installed
runtime. Three other cases use a declared non-ML Node protocol peer: missing
marker refuses before dispatch, a valid PNG with truthful metadata but unrelated
alpha is rejected, and a SIGTERM-resistant active child times out. Actual ESRCH
is observed before failed requests settle. The original RGB bridge and its
physical-exit tests remain regression controls.

No new world cases need LaMa. Existing OUT bridge regressions reuse the protected
shared 205669692-byte LaMa file with SHA
`344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9`.
The shared installed catalog/runtime is a dependency for that file only; execution
uses checkout Python. No environment, trained weights or catalogs were copied or
downloaded.

## Mutation evidence

`world-mutation-8babca0d39-summary.json` records the exact source edits, copied
dependency graphs, commands, assertions and process/restoration evidence:

| Actual production fault in an isolated copy         | Causal RED                                                                 | Neighboring GREEN                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| RGB world resize BICUBIC → NEAREST                  | Nonuniform upscaled actual RGB differs from the independent BICUBIC result | Identity-size RGB and literal final alpha remain exact                       |
| Remove Main's actual alpha equality check           | Real JSONL client fails to reject valid PNG/metadata with wrong alpha      | Real CPU JSONL composition returns exact world alpha                         |
| Remove the whole capture's admitted-operation drain | Callback settles while the independently witnessed world step is held      | Awaited native Illustrious IMG plus CPU world composition completes normally |

Each pair executes exactly two cases with one assertion failure and one pass;
resource termination, import/setup errors and skipped tests cannot count as RED.
The lease case waits for an independent admitted-world witness before checking
that callback settlement remains blocked. Its bounded hold is not the only
evidence that the operation entered composition.

The first harness attempt correctly produced the BICUBIC RGB assertion failure
and a passing identity control, but the summary parser incorrectly required the
literal word `AssertionError` in pytest's rewritten JUnit failure body. That
harness-only condition was corrected to accept pytest's `E assert` expression
while retaining the exact RGB-difference cause and failure/error counts. The
complete three-pair rerun passed; the initial report remains retained. Original
sources were untouched in both attempts and every private copy was disposed only
after confirmed physical exit. No production change or test weakening was needed.

## Delivery and remaining owners

The completed private chain ends at detached world RGBA plus its frozen context;
it still creates no durable candidate or variant and does not edit the Project.
The CPU worker marker fences older installed payloads before dispatch. Source
support alone does not update a user's installed worker. PP-007/008 remain
«Пока не обещать»; supporting contracts and matrix rows describe the same scope.

Next are durable queue/batch ownership and immutable Smart Patch variant
acceptance, followed by public wiring and installed qualification. No public
Generate, recovery replay, provenance/preset/Compare or `.igs` support is claimed
by this slice.

## Final checks, limits and cleanup

`pnpm run typecheck` (both Vue projects), full `pnpm run lint`, worker
`ruff check worker-python`, strict
`basedpyright --project worker-python/pyproject.toml` and `pnpm run app:build`
all passed. No production source changed after the successful behavior/mutation
runs. No prototype UI changed, so prototype interaction tests were not rerun.

Every heavy run was serial, CPU threads1, CUDA hidden, swap0, under a whole-process
memory/deadline limit. No OOM, watchdog expiry or resource-related test failure
occurred. Observed peak bytes include the bounded cgroup's sampled accounting,
not just a single Python process's RSS:

| Check                    | Ceiling / deadline | Elapsed   | Observed peak bytes |
| ------------------------ | ------------------ | --------- | ------------------- |
| 2294 TS regression cases | 4 GiB / 300 s      | 237.928 s | 1330540544          |
| Python core238           | 4 GiB / 300 s      | 6.624 s   | 480735232           |
| Python outpaint115       | 4 GiB / 300 s      | 14.835 s  | 781099008           |
| Python Smart Patch352    | 4 GiB / 300 s      | 22.443 s  | 726790144           |
| Full typecheck           | 2 GiB / 180 s      | 18.639 s  | 1782988800          |
| Full ESLint              | 4 GiB / 180 s      | 38.065 s  | 3859394560          |
| Strict basedpyright      | 2 GiB / 180 s      | 4.822 s   | 584204288           |
| App build                | 2 GiB / 180 s      | 1.617 s   | 1194045440          |

Separate focused and mutation reports retain their own limits and peaks. Ruff
finished between controller samples, so its recorded zero is not a measured
claim of zero memory use.

`cleanup.json` verifies physical exit for all 18 bounded process groups and
unchanged original source hashes before removal of the four enumerated own pytest
directories. **64311296 allocated bytes reclaimed** (58557812 logical bytes
disposed); mutation copy disposal is recorded separately and is not added to this
number. Test-created symlinks/FIFOs were unlinked locally without following them.
No global cache, ordinary app data, external source image/model, checkout runtime
or shared catalog/LaMa was deleted. Both run and shared lifecycle records were
updated.

Compact logs/TAP/JUnit, source/process/restoration manifests, harnesses and one
actual 8×8 RGB → 19×13 RGBA/mask triple remain at roughly 1.2 MiB allocated.
`world-png-inspection.json` independently confirms that retained result's RGB
equals public Pillow BICUBIC and alpha equals the numeric input, including all six
literal alpha values; pinned ICC is present only on color images. Bulky pytest
payloads were removed, so their historical paths in reports are not live fixtures.
Artifact root remains28GiB with44GiB free; historical pinned evidence over the
1GiB soft budget remains an explicit exception until its owning qualification
chain releases it.
