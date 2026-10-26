# Private Illustrious regional tensor attention

Status: **complete within the private CPU tensor-mechanics boundary** on dirty
`master@10115df581d9e07049478dee3866a280886794fd`. This checkpoint follows the
[numerical planner](./phase-4-regional-guidance-attention-research.md) and does not
connect public generation. Final source R2 is CLEAN; root execution, independent
candidate retention audit and root release gates are complete within the limits
below.

## Expected result and scope

A private scoped adapter consumes one explicit numerical attention plan through
the original pinned Diffusers cross-attention processor. The finite profile is
CPU float32, evaluation mode and disabled autograd, Torch 2.7.1 / Diffusers 0.40.0.
The caller binds every continuous Transformer2D module by identity and explicit
factor (1, 2, 4 or 8). Actual parent height/width must match that level before
flattening. Factors are never inferred from query count or ambiguous repeated
1x1 levels. The complete root's cross-attention modules must be covered.

The adapter supplies a hard Boolean spatial mask, intersects existing supported
binary masks and sign padding, and refuses effective all-masked rows before
calling attention. Supported existing masks are Boolean permissions or additive
values exactly 0, -10000 or negative infinity; arbitrary score biases refuse.
It delegates projection, normalization, SDPA and output processing to the exact
original `AttnProcessor2_0`; no third-party processor or denoising loop is copied.
Self-attention processors remain untouched. Scoped processors and hooks restore
their exact original identities on success, callback failure and refusal.
The final lifecycle guard also temporarily owns each monitored module's
`_call_impl` instance slot. It enters before native hooks, calls the captured
native bound dispatcher once, latches owned failures and unwinds in `finally`.
Late prehooks observe the geometry after existing argument transformations.
Existing hook entries and global Torch functions are never replaced. Instance
call-entry shadows/custom/compiled/offloaded dispatch refuse. Cleanup restores
the exact previous slot presence/reference, including absence. Mutation,
compilation and serialization of a model inside its scope are unsupported.
The prior-mask forms at `attn2` are `[B,1|Q,K]`, `[B*heads,1|Q,K]` and
`[B,1|heads,1|Q,K]`, with CPU bool or float32 values. Parent rank-two binary masks
may undergo native preprocessing first. Sharing one stateless original
`AttnProcessor2_0` instance across distinct native modules is supported; sharing
module identities remains a scope conflict.

The caller still owns encoding and tensor range/sign correspondence. This does
not resolve Project recipes, global coverage, pooled conditioning, overlap
policy, empty-prompt encoding, regional dynamic prompts, world-to-latent geometry,
Smart inheritance, reference adapters or Anima. There is no production caller,
protocol/capability, renderer, Main, queue, persistence or provenance change.
Every enabled-region NEW refusal, target-only Smart permission, published/frozen
Retry independence and provenance exclusion remains unchanged.
PP-001/007/008 remain **Пока не обещать**.

## Risk and evidence plan

This is high risk at the local mutable-processor lifecycle boundary: a leaked
processor/hook could affect later calls on a reused model. Overlapping-model
concurrent or nested scope, unsupported processors/configuration, wrong grids/tensors,
effective empty support, and setup/forward failures must refuse without leaving
installed state. Cooperative callers must not modify model topology/processors
inside the scope. This is not a process-wide security or concurrent model-sharing
guarantee.

Fully disjoint models may have nested or concurrent scopes; each forward belongs
to its scope's entering thread. Scope reservations cover all reachable module
identities, so roots that share a submodule conflict even when their root objects
differ. There is no global lock on unrelated inference.

Root's actual pre-implementation CPU probe imports the existing repository venv,
constructs a real `Transformer2DModel`, executes a finite forward and observes
`[2,8,3,5]` at the parent becoming `[2,15,8]` at `attn2`. Original processors and
zero remaining probe hooks are verified. Torch 2.7.1, Diffusers 0.40.0 and Python
3.12.13 match the required profile. CUDA-enabled Torch is installed, but this
probe executes CPU only. No environment, checkpoint or catalog is provisioned.

Alternatives considered: a new attention implementation would unnecessarily
duplicate the pinned processor; a Q-only mask lookup loses rectangular geometry;
automatic UNet factor inference adds an unqualified topology policy; connection
to public Generate would additionally require encoding/composition, durable
inputs and model qualification. Explicit bindings plus observed parent geometry
keep this checkpoint finite.

Planned executable evidence enters the new adapter with real Torch/Diffusers:
an independently computed small attention oracle; same-input context interventions
at permitted/blocked queries; distinct CFG signs and padding; equal-length spatial
restrictions; odd rectangular parent grids and explicit factors; real tiny random
UNet consumption; supported-mask intersection and all-masked refusal; and exact
processor/hook restoration on every exit. A semantic spatial-mask mutation must
fail its boundary test while an Everywhere control stays green, then restore.
These mechanical CPU checks do not establish trained-model spatial quality,
GPU/dtype compatibility, packaged runtime, worker dispatch or public generation.

## Parameter register

| Parameter                 | Value, origin and refusal                                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan shape/ranges/profile | Existing numerical planner bounds and explicit factor/K/batch contract; no extension                                                                                       |
| Native profile            | Existing pinned Torch 2.7.1 / Diffusers 0.40.0; this adapter admits CPU float32/eval/no-grad only                                                                          |
| Expanded Boolean mask     | New private engineering ceiling of 32 MiB logical elements per cross-attention call, including heads; preflight before allocation, explicit refusal rather than truncation |
| Mask retention            | No cumulative per-layer/query cache; no claim about RSS, SDPA workspace or elapsed-time capacity                                                                           |
| Qualification group       | Root-owned serial runs, 3 GiB memory, zero swap, 600 s deadline; no model downloads                                                                                        |
| New compact evidence      | 100 MiB local aim; older protected Regional evidence remains an explicit historical soft-budget exception                                                                  |

## Execution and release

Implementation, authored cases, static checks, native CPU execution, independent
review, mutation and payload release are separate states. The chronology below
preserves the earlier source-review freezes and their pending gates; the final
result is recorded after those corrections.
Evidence is under
`~/.codex/artifacts/imagegen-studio/runs/regional-guidance-tensor/20261025-adapter/`.
The 1,354-member baseline and 1,357-member final source are byte-verified.
No trained-model qualification is claimed.

Root's first complete adapter run passes **102 cases, zero failures/skips** on
real pinned CPU Torch/Diffusers. It includes the literal-span dense softmax
oracle, causal permitted/blocked context interventions, sign padding, existing
masks, all-masked refusal, explicit rectangular factor grids, actual random tiny
UNet calls at all 13 down/mid/up transformer bindings, and lifecycle guards.
The controlled-query helper calls a real wrapped `attn2` from a real parent
prehook; separate normal Transformer/UNet forwards cover actual model traversal.
No encoders or trained weights are substituted for this mechanical boundary.

Root self-review first reproduces a geometry ordering defect: an existing native
prehook transposes 3x5 to 5x3 after the adapter's initial capture. Q remains 15,
so the stale grid is accepted. The regression is **RED / unchanged-hook control
GREEN**. Registering the capture after pre-existing hooks closes that window;
the same two assertions pass, before the complete 102-case run. Callers may not
install or modify hooks inside an active scope.

The test author's tentative refusal for a shared stateless processor instance
is corrected from source inspection before the first full run. It becomes a
real tiny-UNet success control; actual module-alias refusals remain. This is a
fixture-contract correction, not a production RED. Original authored bytes are
retained. Initial static checks report 39 style findings and 22 strict typing
diagnostics. Equivalent formatting/context-manager simplification, explicit
types and casts after existing runtime guards correct these without changing
the numerical assertions. Final scoped Ruff/check-format and strict BasedPyright
pass, with zero typing errors/warnings/notes. The post-static combined run passes
**156 cases**: 102 new adapter, 48 numerical planner, four controlled prior
padding/encoder cases and two existing real-native outpaint/cleanup controls.
There are zero failures/skips. Pinned upstream deprecation warnings are retained:
40 Transformer output warnings and 10 scheduler/NumPy warnings. Isolated semantic
mutation and final independent review/release remain separate evidence.

Independent source review R1 reports one **P2**, not CLEAN: a pre-existing root
posthook can raise after the model produced a non-None result. Torch passes that
result to remaining always-call hooks, so `output is None` misses the failure if
the body catches it. Root also identifies conditional reentry from an existing
prehook before the late geometry hook acquires its frame. Against unchanged R1
production, the two regressions are **RED**, and both observational/success
neighbors are **GREEN**. Retained source and logs distinguish these failures
from the earlier geometry correction.

Per-instance native call-entry wrappers close both mechanisms without copying
Torch dispatch or replacing existing hooks. The same four cases pass after the
fix. Additional controls require refusal of subsequent forward calls after a
caught posthook error, recovery in a fresh scope, exact call-entry restoration
and pre-existing instance-shadow refusal. A successful forward inside an
unrelated exception handler remains valid. The expanded combined run passes
**165 cases**: 111 adapter, 48 planner, four controlled and two real-native
neighbors. The final focused run passes **111**, zero failures/skips. An explicit
test-only reflection cast corrects one post-fix BasedPyright diagnostic;
assertions remain unchanged, and final strict BasedPyright passes. The 165 run
precedes that typing-only cast; the 111 run includes it. Warnings remain pinned
upstream deprecations: 48 Transformer and 10 scheduler warnings in the combined
run. No new TypeScript, app/prototype or packaged-worker build is run.

Spatial-mask omission mutation R1 is **GREEN 2 → semantic RED 1 / Everywhere
control GREEN 1 → restored GREEN 2**. Its single change allows every stored
alpha sample, preserving signed token ranges and padding. All four isolated
import-closure files restore byte-exact; the shared source is untouched by the
mutation. The same experiment is executed separately against the final R2
call-entry correction: **GREEN 2 → semantic RED 1 / control GREEN 1 → restored
GREEN 2**. Both four-file closures restore byte-exact to their own archived
sources. R1 evidence is never relabelled as R2.

Independent source review R2 is **CLEAN / READFINISHED**. It reads the complete
final helper, all 111 authored cases, correction history and exact retained
Torch/Diffusers consumers. It closes R1's posthook P2 and root's early-reentry
mechanism at source level. It independently certifies neither the root-run test
results nor trained-model behavior. Final Ruff/format, strict BasedPyright and
scoped whitespace/link checks pass; all 1,352 unaffected baseline members and
both existing documentation tails remain byte-exact. No commit or publication
occurs.

## Retention, release and remaining boundaries

The independent candidate-only retention audit is **CLEAN / READFINISHED**. It
verifies all members of the baseline and both 1,357-member mutation archives,
both exact four-file isolated import closures, original/mutant/patch/runner and
RED/control/restoration evidence. The two combined-run fixtures each contain
only a 19-byte literal `checkpoint identity` and a 483-byte source-generated PNG;
these are not trained weights or production images. All four raw files also
survive as two content-addressed byte copies outside the candidates. Source,
Python lock/configuration, ICC and fixture definitions are retained. External
runtime compatibility remains root execution evidence; no exact external-runtime
replay certificate follows.

After all 14 then-existing delegated tasks/readers end, root freshly verifies
22 owned units inactive with no process references, both isolated closures
restored, shared source equal to R2, and no incoming dependency/symlink in the
accessible artifact/repository scope. Only these exact audited paths are removed:

- `payloads/combined-r1` — 24,576 allocated bytes.
- `payloads/combined-r2` — 24,576 allocated bytes.
- `payloads/mutation-spatial-r1` — 135,168 allocated bytes.
- `payloads/mutation-spatial-r2` — 143,360 allocated bytes.

All four paths are absent. **327,680 bytes actually reclaimed** from the artifact
root; source archives, raw proof and exact native consumer source remain. Denied
protected `/proc` reads are recorded without escalation: this is an accessible
same-user ownership/reference check, not an all-OS security guarantee. No external
environment, model or global cache is provisioned, changed or deleted. Final
source/mutation/version mapping distinguishes every freeze, typing correction
and execution. There is no new app or packaged-worker build. The local evidence
set remains under its 100 MiB aim; the historical compact-evidence exception for
earlier unfinished Regional promises remains protected.

This completes scoped native CPU attention mechanics only. Actual encoded
stream/sign correspondence and factor assignment remain caller preconditions.
Production recipe/encoder integration, trained-model influence, GPU/other dtypes,
pooled/global/overlap composition, world-to-latent mapping, regional dynamics,
Anima/Smart/reference execution and durable replay remain separate owners.
Public enabled-region NEW refusal and PP-001/007/008 **Пока не обещать** remain.
