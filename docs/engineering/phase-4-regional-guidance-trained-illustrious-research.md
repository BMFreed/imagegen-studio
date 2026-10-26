# Private trained Illustrious regional qualification

## Boundary and current evidence

This checkpoint concerns one exact trained **Illustrious** file, using its
native SDXL architecture internally. It adds neither a generic SDXL product
family nor Anima regional execution. The previous shared-text checkpoint used
full random CLIPs and small random UNet/VAE components; it did not establish
trained checkpoint loading or the complete trained UNet topology.

The working boundary is dirty `master@10115df581d9e07049478dee3866a280886794fd`.
ROOT verified all 1,379 baseline source files against the preceding retained
archive before this work. Source-only research and authored tests are distinct
from the execution results recorded below.

The selected source is official `Illustrious-XL-v0.1.safetensors`, pinned to
Hugging Face revision `dca0dac303e6dc4b0c31d8001bc685b89b5d0204` in
`OnomaAIResearch/Illustrious-xl-early-release-v0`. Its 6,938,040,760 bytes hash to
`3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9`.
The in-file prediction objective is epsilon and its header fingerprint matches
the existing built-in compatibility record. This choice requires no new
prediction objective or scheduler profile. Original external user models and
ordinary application data remain untouched.

ROOT's initial real `load_illustrious_pipeline` call loaded the complete native
CLIP-L, CLIP-G, UNet and embedded VAE on `cuda:0` in FP16. Their parameter counts
are respectively 123,060,480; 694,659,840; 2,567,463,684; and 83,653,863.
The actual UNet contains 11 Transformer parents and 70 cross-attention blocks.
The ordinary two-step Euler/manual-FP16-VAE calibration completed with finite
native `pt` output. This is ordinary mechanics evidence, not regional acceptance.

## Concrete admission correction

The first regional calibration refused before encoding with `PROFILE_INVALID`:
the pinned native UNet config and its Attention objects carry
`upcast_attention=None`, whereas the adapter required exact `False`.
The admitted exact native `AttnProcessor2_0` does not read this field; its native
SDPA path consumes the actual query/key/value dtypes. Changing borrowed model
metadata to `False` would evade the preservation contract.

The intended narrow correction admits **exactly `False` or `None`** for that
one field. `True`, integers including zero, strings, and other values continue
to refuse. All other native type, processor, topology, dtype, device, hook,
autograd, autocast and attention-configuration checks remain. The new small
CPU/FP32 and CUDA/FP16 regression compares original processor results and whole
regional forwards for self-attention, cross-attention and both `None`, with an
unchanged `False` control, invalid-value refusals, restoration and recovery.
ROOT owns the pre-correction RED/control and corrected execution records.

## Unrestricted native attention path

The first full matrix exposed a second concrete integration gap. Its six
nonzero-region matrix cases and three recoverable-failure cases passed; the
ordinary zero-region comparison failed, and the aggregate causal-record check
correctly refused to pass without that seventh successful record.

ROOT compared the original native calls directly. Initial sample, contexts,
pools, time IDs, timesteps and scheduler configurations were exact. Supplying
an all-true Boolean mask instead of native `None` changed the first sampled
attention output by at most 0.000244140625 and the first UNet prediction by
0.001953125. The next latent differed by 0.15673828125 and the final image by
0.35498046875. This is not an acceptable rounding allowance for this control.
No particular fused kernel was identified or claimed.

A controlled original-processor counterfactual changed only those all-true
cross-attention arguments to `None`. All 140 original native cross-attention
calls completed, and both predictions and the image matched ordinary execution
exactly. The source model, scheduler configuration and RNG were preserved.

The resulting finite rule preserves the native no-mask path only when the
incoming prior mask is absent and **each emitted sign has exactly one
`Everywhere` segment spanning the complete K range**. Explicit prior masks,
Alpha8 classification, multiple streams and terminal sign padding retain their
Boolean permissions. Geometry, complete bindings, mask budgets, all-masked
checks, numerical plans and restoration are still validated before this
argument selection. There is no fallback or inferred global coverage.

## Acceptance and limits

The qualification must establish three independent loading comparisons:
verified file bytes to native reader tensors; independently specified key/value
transformations to original converter outputs; and expected FP16 destination
values to the returned live CUDA components. The expected 2,641 checkpoint-backed
destination tensors comprise 196 CLIP-L, 517 CLIP-G, 1,680 UNet and 248 VAE tensors.
The unused contrastive CLIP-G logit-scale scalar and generated position-ID
buffers require separate accounting. Hashing converter output alone is not an
independent conversion oracle. Observers call originals and retain bounded
chunks and metadata, without another complete checkpoint or model copy.

Fresh saved/reopened Main projects must produce the whole recipes through the
existing capture, actual planner item and real ModelService verification. The
checkpoint resolved by Main must be the file consumed by the actual loader.
Actual target composition and independent alpha classification must establish
transparent txt2img input. Separate genuine recipe variants change only a
regional resource or coverage, retaining text, seed and global pool choices.

The finite native geometry is translated 104 by 72 pixels, yielding a 9 by 13
latent grid. Complete explicit bindings use factors two and four, with observed
ceil grids 5 by 7 and 3 by 4. All 70 original cross-attention processors and
their original SDPA calls must consume independently checked signed contexts,
permissions, padding and pools through the native Euler steps and VAE decode.
Selected bounded dense numerical observations supplement exact association
checks. Reopened RGB bytes must equal independent quantization of the original
native output. Ordinary zero-region equivalence, same-seed and changed-seed
controls remain separate from regional-resource and permission causality.

Isolated wrong-regional-vector and later-step permission mutations must retain
valid inputs and original native computation, produce a semantic RED with an
unaffected GREEN control, then restore exact source and GREEN. Prediction-only
change that vanishes at RGB quantization cannot be reported as pixel causality.
Recoverable setup, encoding, later native-step, decode and publication failures
must preserve source state/RNG and allow a fresh call; GPU-context poisoning is
outside that claim.

Operational qualification uses serial units with at most 12 GiB aggregate host
memory, zero swap, a 600-second deadline, and CUDA allocator fraction 0.75.
Those are test envelopes, not model capacity guarantees. Existing private
profiles, one/two Euler steps, epsilon objective, fixed scheduler policy,
manual-FP16 VAE, text/region/row/geometry/mask/TI budgets remain unchanged.
No offload, autocast, device repair, replacement VAE or fallback is introduced.

The native output remains a provisional worker PNG. This work does not admit
public enabled-region NEW jobs, establish Main candidate durability, Add/Save,
trained image quality, or visual regional quality. Smart target-only permission,
published/frozen Retry independence, provenance/Compare/result-derived-preset
exclusions and PP-001/007/008 **«Пока не обещать»** remain unchanged.

Main's exact checkpoint resolver reports the existing versioned scaled-linear
noise profile with **leading** spacing. This experiment deliberately selects
the already named private execution profile, whose fixed policy uses
**linspace**, and supplies no caller noise-profile override. Ordinary comparison
uses that same explicit private policy. It does not qualify the production
default noise policy merely because the trained objective is epsilon.

## Execution and lifecycle

Work began on 26 October 2026; final retention/release closed after midnight
Moscow time on 27 October. ROOT executed the checks below. Independent source
review and retention audit inspected pinned source/records; neither reran ML.

| Recorded group | PASS | Warnings | Source boundary |
| --- | ---: | ---: | --- |
| Final adapter/bridge/geometry/recipe/denoising/CUDA/native-flag neighbors, `adapter-neighbors-r3` | 1,034 | 320 | Final live source |
| Trained Main matrix, causal-record check and three recoverable failures, `trained-final-r2` | 11 | 34 | Frozen complete qualification R2 |
| Four named trained mutation selectors, healthy baseline | 4 | 13 | Same frozen complete R2 |
| Unique qualified selections | **1,049** | **367** | Separate groups, not one combined run |

All listed groups have zero failures, errors and skips. Repeated mutation
phases are not added to that unique count. Scoped strict basedpyright with the explicit worker-project config
and scoped Ruff/format pass; `pnpm run typecheck` passes. No repository TS/Vue,
public protocol, Main implementation, loader or native-loop implementation was
changed. The new trained suite is opt-in with an explicit retained RUN and
record/verify policy.

After R2, ten old neighbor errors all stopped in a test observer that called
`.detach()` on the newly correct native `None` mask. The compatibility fix
retains actual `None` and interprets it as all permissions in the old semantic
oracle. All 34 existing conditioning test definitions remain AST-identical;
the 470 affected bridge/recipe cases and then all 1,034 neighbors pass. The
production adapter and new trained/native-flag tests remain byte-identical to
qualified R2. The frozen trained experiments use that complete R2 archive;
final source additionally contains this test-observer adaptation. This is not
an unrecorded whole-suite rerun on one revision.

The accepted records contain **25 regional invocation lifetimes**, including
three deliberately failed requests and their fresh recoveries. Transparent
observers recorded **49 original UNet calls, 48 Euler transitions, 24 VAE
calls, and 3,430 original cross-attention processors/native SDPA calls**.
Four additional ordinary two-step comparisons are recorded separately from
those regional counters. The **22 accepted provisional RGB PNGs** include the
isolated causal runs; every reopened RGB byte matches independent quantization
of its own original native `pt` output. Calibration and failed R1 diagnostics
are excluded from these counters.

The eight isolated mutation phases execute 60 cases: **55 GREEN / 5 semantic
RED / zero errors or skips**. Small CPU mutations distinguish exact False/None
admission from equality with zero, and distinguish the native no-mask path from
an unnecessary all-true mask. Their unaffected controls stay GREEN. The trained
vector mutation changes only alias-2 rows after validation: actual encoder
forward records 6/7/8 change, the other twelve inputs/row hashes remain exact,
and pre-mutation native load rows remain exact. Predictions and RGB equal the
legitimate A/A Main resource neighbor; **14,757 RGB channels** differ from C/A.
The later-step permission mutation preserves the first 70 native consumers and
first prediction exactly, keeps all encoder rows/inputs exact, and changes the
second prediction and **5,704 RGB channels**. Its zero-region control remains
GREEN. Restored source and all healthy controls return GREEN, with all 1,382
mutation-checkout members matching the frozen archive and no extras.

Second-UNet, post-native-decode and exclusive-publication-link failures return
no successful receipt, preserve target/source state, unwind scopes and allow
fresh real successful calls. Streaming hashes cover all registered source
weights/buffers; metadata, storage, hooks/call slots, vocabularies, configs,
reservations and CPU/CUDA RNG remain exact. The broader malformed-input,
partial-TI-load and geometry refusal matrix remains lower-level regression
evidence; it was not duplicated exhaustively on full trained components.

Initial strict-None refusals, the first environment-forwarding skip, the first
zero-diagnosis report-key error, the failed ordinary-zero R1 matrix, old observer
errors and typing diagnostics are retained as distinct historical outcomes.
They are excluded from the final PASS accounting. The ordinary-zero assertion
was strengthened to exact PT/RGB; no tolerance was increased to hide the gap.
The selected dense FP16-vs-FP32 softmax oracles retain their separate small
numeric tolerance and recorded errors.

Operational records retain anon/file memory and independent physical exits.
Native groups used the declared 12 GiB/no-swap/600-second envelope and .75 CUDA
allocator fraction. Those are test settings, not peak-capacity promises. The
separate download configured `MemoryMax=1G` but reports MemoryPeak
**1,091,141,632 bytes**, above 1 GiB; successful exit does not establish a strict
1 GiB bound. No swap/OOM/setup failure is counted as a semantic mutation.

The retained-byte audit is CLEAN for 14 declared candidates: 1,650 lstat entries,
129 mappings to 30 CAS blobs / 486,900 bytes, complete source/native/config
pins and six archived Main fixtures. One final IGS package and closed SQLite
catalog are retained; earlier authored states are complete in the five recipe
handoffs, not five package files. The auditor independently streamed the exact
trained SOURCE digest. Its conclusions are closure evidence, not runtime or
release certification.

ROOT refreshed 742 lifecycle/runtime/provision/fixture/report metadata files,
found no external candidate dependency, confirmed all then-existing fourteen
delegated tasks complete/READFINISHED, checked current physical process/cgroup
exit and exact restoration, and deleted only the fourteen inventoried payload
directories. Actual allocation fell by **32,862,208 bytes**. Lifecycle is
`retained`, live disposable payloads are empty. PNGs and required input bytes
remain through CAS/archive mappings; original output-path receipts are
historical. The single 6,938,040,760-byte checkpoint, external workspace runtime,
preceding pinned config/source and primary-source dependencies remain protected
for exact replay and the next trained Illustrious owner; release the reusable
source after replacement or completion of that chain, retaining reproduction
bytes first. Original external models, ordinary app data and global caches
were not modified or deleted.

Final source/document/retained-bookkeeping review follows this physical release
and is a separate, later reader. A clean review must not be described as an
independent ML execution, physical-release certification or product promotion.

## Source and reproduction anchors

- [Native adapter](../../worker-python/src/imagegen_worker/illustrious_regional_attention_adapter.py): `_validate_attention`, `_single_unrestricted_bank` and the original-processor argument selection.
- [Trained qualification](../../worker-python/tests/test_illustrious_regional_trained.py) and [native admission/permission controls](../../worker-python/tests/test_illustrious_regional_native_attention_flags.py).
- [Existing native denoising owner](../../worker-python/src/imagegen_worker/illustrious_regional_denoising.py) and [provisional output owner](../../worker-python/src/imagegen_worker/illustrious_regional_output.py).
- [Built-in exact checkpoint declaration](../../src/main/models/model-compatibility-manifest.ts).

Compact retained ROOT evidence is under
`~/.codex/artifacts/imagegen-studio/runs/regional-guidance-trained-illustrious/20261026-epsilon`:
full source archives/manifests, `main-trained-recipes.json`, original-calling
loading journal, native/causal records, mutation plans/verdicts, CAS mappings,
physical release and dependency records. `qualification-summary-r1.json`
separates the checked revisions and groups. The full native-loop and model
ownership assumptions remain cooperative and finite. None of this qualifies
trained visual quality, maximum geometry, arbitrary checkpoints, Anima regional
execution, public enabled-region NEW jobs, durable Main candidates or immutable
Regional Guidance provenance. PP-001/007/008 remain **«Пока не обещать»**.
