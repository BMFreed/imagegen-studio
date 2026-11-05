# Public authored Euler a with frozen Invoke initialization

## Scope and source

Base: `455c43870d1aa70516ab91ee242d604b3e220cca`. This follows the private
[installed worker check](./phase-4-regional-guidance-init-installed-research.md).
High risk: public admission, queue/Retry and immutable accepted-result consumers.
The new route uses the existing sampler choice, not a new control or default.

Current InvokeAI was reread at clean
`a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:

- `invokeai/frontend/webv2/src/features/generation/core/graph.ts`: selected
  scheduler and separate CPU-noise node.
- `core/canvas/compileCanvasGraph.ts` and `addRegionalGuidance.ts` under that
  generation directory: add regional conditioning to the existing graph without
  replacing the selected sampler.
- `invokeai/app/invocations/noise.py`, `latent_noise.py`,
  `invokeai/backend/util/devices.py`: CPU FP32 draw and CPU cast.
- `invokeai/app/invocations/sd/denoise_latents.py`: zero txt2img latents and
  independently seeded ancestral step generator.
- `invokeai/backend/stable_diffusion/diffusion_backend.py`,
  `schedulers/schedulers.py`: original add_noise and Euler ancestral scheduler.
- `invokeai/app/services/session_queue/session_queue_default.py` and its API
  caller: Retry from the saved execution input.

Studio reuses the already qualified numerical mechanism and owners. The
previously disclosed adaptation remains: Invoke reads noise dtype globally;
Studio freezes the exact initialization identity for independent future Retry.

Existing public Euler already coexists with unqualified visual findings. The
contracts do not require human PASS before an additive explicit sampler route;
they do prohibit interpreting mechanical results as quality or silently changing
defaults. The Project's initial sampler remains null. Historical Euler and its
absence-based initialization retain their existing meaning.

## Finite public matrix

| Captured public request                                   | Admission                                 |
| --------------------------------------------------------- | ----------------------------------------- |
| Euler / Normal, no initialization identity                | Existing route, unchanged                 |
| Euler a / Normal, known Invoke identity                   | New route with separate worker capability |
| Euler a without the identity                              | Refuse                                    |
| Euler with an explicit identity, null or unknown identity | Refuse                                    |

Main derives `initializationProfile: "invoke-cpu-f32-add-noise-v1"` only from the
fresh captured authored Euler-a selection. Renderer input cannot select or
override it. Public `invoke-canvas-v1` remains a distinct operation; private rows
are never promoted automatically. The shared worker parser and existing native
profile already support the combination, so Python and sampling algorithms do
not change.

The advisory state adds optional strict Boolean
`regionalInvokeInitializationSupported`. Absence does not enable Euler a;
legacy Euler ignores this extra flag. Main and coordinator independently check
actual live capability before composition, resource preparation and durable
publication. An older worker refuses the new route while retaining the existing
Euler route and existing jobs/results.

Public Retry loads the verified frozen regional input before Retry SQL and
requires capability from that input, not from the currently edited sampler.
The Queue advisory uses its existing frozen sampling details. No new queue
display schema, database migration, replacement confirmation or cancellation
policy is introduced. Both old/new Retry retain the original recipe, target,
seed, schedule and explicit field presence.

Accepted-result projection continues to strip initialization, composition and
regional operational material. The ordinary authored sampler Euler a is valid
base sampling provenance. Regional masks/prompts/operational identities do not
become Compare or result-derived preset inputs.

## Bounds and acceptance

Retain existing epsilon Illustrious, static prompts, one image, up to three
enabled regions, embedded FP16 VAE, CFG `(1,30]`, zero rescale, steps `1..200`,
normal authored schedule, resolved versioned noise policy and all existing
geometry/text/TI/attention/wire/resource ceilings. No new arbitrary limit or
checkpoint substitution. Ordinary generation and private legacy selectors keep
their previous policies.

Lower checks cover both matrix branches, old/missing capabilities, refusal
before composition/publication and preservation of prior jobs/results. Real
SQLite/file tests exercise recovery, frozen Retry after opposite authoring
edits, sidecar/outer agreement and accepted-base exclusions. Semantic mutations
must distinguish a missing frozen field and a capability check based on the
wrong current input, with an unaffected legacy control and restored GREEN.

The existing installed Electron qualification gains a separate
`installed-regional-invoke-initialization-v1` profile. It uses the same official
Illustrious XL v0.1 file (`3e15ba…45aa9`), reusable runtime and real public
renderer → IPC → Main → worker → Results → explicit Raster Add/Undo/Redo/Save/
reopen path. Fixed 1024×1024, origin `(-13,5)`, seed123, Euler a, 30 steps, CFG5,
false-ZTSNR/leading and no LoRA/TI/reference inputs; no search or tuning.

The finite native plan is one real Generate canceled after observed completed
steps and one explicit Queue Retry. The current authored sampler is changed
back to Euler before Retry; the original frozen request must remain Euler a.
Original wire bundles and frozen sidecars must contain the known identity.
Prior Euler outputs and all prior operational/portable data remain immutable
controls; a new Euler-a image is not required to equal an old Euler image.

Use inherited finite host/cgroup limits, zero swap and a 600-second controller
deadline, recording actual child scopes and physical exit. GPU allocation is
observed, not advertised as an allocator/capacity guarantee. No environment or
model copy/download, release installer change or arbitrary process termination.

## Evidence and limitations

Compact records live under artifact-relative
`runs/regional-guidance-public-initialization/20261105-euler-a`.
ROOT records **312 distinct lower PASS**: 68 shared/advisory/payload cases and
244 Main neighbors, with zero failures/skips. The 21 new cases comprise ten
payload, eight action/coordinator, two shared-advisory and one renderer-Retry
case. Commands use `pnpm exec tsx --test --test-reporter=tap`; exact selectors,
TAP and bounded unit records are retained. Four typing-only capability casts in
appended test setup resolve the initial four readonly-array diagnostics; the
corrected `pnpm run typecheck`, fresh production build and scoped ESLint pass.
The build's normal chunk-size warning is retained.

Two isolated mutations complete **4 GREEN → 2 semantic RED + 2 legacy controls
GREEN → 4 restored GREEN** (12 executions, not 12 additional unique cases).
One wrongly consults current authoring before requiring frozen Euler-a capability;
the other drops only the public frozen initialization identity. Failures are the
missing refusal and invalid frozen-payload association, without import/setup
failure. All 1,480 qualification source files restore exactly.

### Installed public result

`native-r3` passes **14 grouped checks** in 197.032 seconds, using the fresh built
production Electron app, actual installed RuntimeManager/worker, official
checkpoint and real UI/IPC. The two actual regional wires are one canceled
Generate and one completed 30-step Retry. Native scalar steps 5/30 and 6/30 reach
Project and Queue before Cancel; progress clears before child exit. After saved
edits to Euler, steps2, seed124 and disabled regions, explicit Queue Retry still
uses Euler a, steps30, seed123, the original regional inputs and initialization.
Both actual bundle snapshots and verified outer/sidecar inputs retain the exact
identity. Retry reports 1..30 without treating 30/30 as publication.

Results/browser PNG, preview, explicit Raster Add, Undo/Redo, Save and independent
ZIP read/reopen preserve the exact output and base-only provenance. Both
completed outputs in this task have the same 1,080,923 PNG bytes and RGBA digest;
the repeat oracle was pinned before `native-r3`. Prior Euler is preserved as a
different-policy control, without claiming cross-policy pixel equality. All
previous SQL rows/packages, accepted history and the earlier unaccepted
candidate remain preserved.

Two earlier attempts remain separate:

- `native-r1` refuses before Electron/ML because ROOT supplied a 3 GiB launcher
  while the inherited aggregate envelope requires a launcher at most 2 GiB.
- `native-r2` completes the same two wires and 11 workflow checks, then fails
  the unchanged historical-index guard. Home refresh had replaced device `66310`
  with `66306` in 30 old cached file fingerprints; the other fingerprint parts
  and 102 prior package/input/candidate byte pins match. Raw `native-r2` BEFORE
  and `native-r3` BEFORE records independently retain that comparison. No SQL
  repair, assertion relaxation, prompt/seed change or tuning was used. Its
  overall result remains FAILED. The additional identical replay and its
  two wires were declared before running `native-r3`.

Total actual regional wires across attempts: four, producing two completed PNGs.
The launcher/owned native scopes retain aggregate 12 GiB ceilings, zero swap and
600-second deadlines. Recorded process identities and owned groups exit;
default-runtime idle verification passes. These are bounded operational records,
not a memory/capacity guarantee. No model/environment copy, worker refresh or
new Python sampling implementation is introduced by this slice.

The qualification-source review is independently CLEAN at source level; ROOT's
runtime observations and retained-byte verification are separate evidence.
All 1,571 own payload entries are byte-retained in one verified no-follow
archive. After physical exit of 56 recorded process identities, empty/absent
16 observed groups, source restoration and reader completion, only four declared
RUN payload directories are removed: **41,771,008 allocated bytes reclaimed**.
Compact evidence remains `state: retained`, `payloads: []`; shared runtime,
original checkpoint, dependencies and all durable Project/SQL/candidate/accepted
data remain protected, including this task's saved results. Final source/document
and retention review is a separate recorded gate.

Visual/human quality remains
NOT_QUALIFIED (historical 3 PASS / 1 INCONCLUSIVE); Anima, other public samplers,
full Invoke parity and release readiness remain outside this slice.
Smart target-only permissions, published/frozen-work independence, provenance
exclusions and PP-001/007/008 **«Пока не обещать»** are preserved.
