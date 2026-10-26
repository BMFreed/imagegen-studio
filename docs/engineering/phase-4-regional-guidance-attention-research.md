# Regional Guidance numerical Illustrious attention

Status: complete within the private numerical CPU boundary. This follows the completed
[concrete Canvas recipe checkpoint](./phase-4-regional-guidance-recipe-research.md).

## Decision and source boundary

Add a private, stdlib-only Python planner for explicit encoded token lengths and
already latent-sized alpha8 grids. It returns sign-local token ranges, immutable
spatial pyramids and a factorized query interface. It does not interpret Project
documents or the Canvas recipe, encode text, resample world masks, install hooks,
invoke inference, or publish a worker capability.

Research concerns dirty `master@10115df581d9e07049478dee3866a280886794fd`, including
prior uncommitted work. The preserved baseline contains 1,351 source files.
Two independent source investigations traced the current worker and local Invoke
`c03de89d7c403be6b0f23c4d22947ec2234facd5`. Their findings are source proposals;
the prior checkpoint's 1,039 tests are not execution evidence for this owner.

Current `build_sdxl_conditioning` aligns CLIP1/CLIP2 rows per sign, concatenates
feature dimensions and then pads signs to a common sequence length. Empty text
still encodes 77 zero rows in the current profile; it is not a zero-length stream.
`run_sdxl_pipeline` handles ordinary sign padding in a scoped UNet hook. Equal
lengths bypass that padding-only hook, but must not bypass spatial restrictions.

Local Invoke illustrates token-range tracking and repeated ceil/max downsampling.
The implementation here independently expresses the numerical contract; it copies
no attention processor or denoising loop. Invoke's missing-mask-to-ones fallback,
Q-only lookup, dense allocation, pooled-context heuristic and finite blocked
scores are not adopted as ImageGen product policy. The local source is Apache-2.0;
this checkpoint adds no third-party implementation transplant.

## Settled numerical contract

All arguments are explicit. One plan represents one supplied signed pair:

```python
plan_illustrious_attention(
    latent_shape=Shape(height, width),
    negative=(EncodedSegment(binding_id, encoded_length, coverage), ...),
    positive=(EncodedSegment(binding_id, encoded_length, coverage), ...),
    profile="alpha8-ge128-ceil2x2-max-v1",
    layout="cfg-negative-first",  # or "positive-only"
)
```

Coverage is either explicit `Everywhere()` or `Alpha8(shape, samples)`. Inputs use
exact frozen records, tuples and immutable `bytes`; mutable planes and coercions
are rejected. Encoded lengths describe actual aligned sequence rows before final
sign padding, including chunk/special-token positions. They are not text/token
estimates. The numerical interface accepts positive integral lengths without
enforcing encoder-specific multiples of 77.

Each sign starts its ordered, contiguous half-open ranges at zero. The common
key length is the maximum sign total; each sign's padding stays blocked even for
`Everywhere`. CFG rows are negative then positive. Positive-only layout retains
the same supplied pair and common key length but exposes only the positive row.
There is no general image-batch input or per-image variation in this owner.

Alpha levels retain exact byte maxima at factors 1, 2, 4 and 8. Each next level
takes a 2×2 maximum over existing cells with ceiling height/width. All four factor
records remain even when shapes repeat. Query eligibility is exactly alpha
`>= 128`; raw pyramids are not binarized. This is an explicit private binary
profile, not qualification of continuous guidance strength or trained-model
compatibility.

`plan.query(factor=..., shape=..., key_length=...)` binds an exact factor/grid/K.
`view.allowed_ranges(batch_index=..., query_index=...)` returns applicable spans
in supplied order. Flattening is row-major. Same-area/transposed grids, wrong K,
invalid factors and invalid indices refuse; there is no square-root inference.
Identical/overlapping streams retain distinct ranges. No priority, weighting,
overlap normalization, global-positive scope or inverse-mask auto-negative is
invented.

An empty tuple of allowed ranges is a valid numerical all-masked diagnostic.
Empty/outside coverage never becomes `Everywhere`, and no global fallback is
manufactured. Future attention execution must refuse all-masked rows until their
behavior is separately defined and qualified. The planner chooses no tensor bias:
giving every key the same finite negative score would not remove attention.

## Parameters and risk

Risk is medium: a pure bounded CPU computation and its immutable output. It has
no production caller and changes no Main/schema/IPC/queue/worker request, resource
lifecycle, `.igs`, history, seed cursor, provenance, Compare or preset behavior.

| Parameter            | Decision/source                                                                                     | Refusal or bound                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Latent dimensions    | 1–256 independently; a private side bound informed by current 2,048-side processing and scale eight | Reject before materialization; no world-area or model-capacity claim |
| Streams              | 1–16 per sign; new defensive CPU safeguard                                                          | Complete both-sign preflight                                         |
| Encoded rows         | 1–308 aggregate per sign; new aggregate use of the existing 77×4 conditioning ceiling               | Reject overflow; never truncate                                      |
| Binding ID           | Nonempty, at most 128 UTF-8 bytes, unique within sign                                               | Reject malformed/duplicate IDs without normalization                 |
| Pyramid samples      | At most 87,040 per maximum-size alpha plane; 32 planes imply 2,785,280 retained alpha bytes         | Exact ceiling arithmetic, not a 4/3 approximation                    |
| Sample visits        | At most 4,849,664 during one plan's pyramid preparation under the selected stream/grid bounds       | Arithmetic preparation bound, not measured time/RSS                  |
| Query representation | Frozen metadata, tuples/bytes and per-query ranges                                                  | No dense batch×Q×K materializer or mutable query cache               |

The complete input is validated before the first pyramid allocation. `Everywhere`
requires no alpha plane. Factor-one immutable input bytes may be shared safely;
caller-owned mutable buffers are not accepted. Python object overhead and scratch
buffers are distinct from the retained alpha-byte bound.

## Verification plan

Test the actual exported factory/query boundary through stdlib `unittest`, also
collectable by pytest. Use literal odd rectangular planes and independently
specified ranges/CFG rows. A small dense oracle computes each factor directly
from original windows, rather than reusing recursive production pooling or its
range/shape outputs. Cover 0/127/128/255, odd edges, skinny grids, repeated levels,
both padding directions, equal sign lengths with different geometry, overlaps,
empty support and explicit unrestricted support.

Exercise all limits/types and a malformed last stream before observable
materialization. Verify ordinary output immutability and a fresh isolated no-site
interpreter import/call without optional dependencies or unrelated worker imports.
Run Python formatting/lint/type checks and relevant existing padding/encoder
controls, explicitly distinguishing controlled tensor fixtures from native ML.

Isolate a one-line `>=128` to `>128` mutation. The threshold-boundary test must
fail while the 0/255 control stays green; restore exact source and rerun. Retain
complete source and RED/control/restored evidence, then release only owned idle
payloads after audit and fresh process/reader/dependency checks.

## Remaining execution boundary

The future consumer must encode/concatenate streams in this range order, use
actual layer geometry, combine spatial permissions with padding, verify tensor
batch/K/features and restore scoped attention processors on every exit. Actual
UNet grids, kernel/dtype behavior, all-masked execution, pooled conditioning and
trained-model effects are unqualified here.

World-to-latent resampling, global/region composition, empty-block encoding,
regional dynamics, reference adapters, Smart negative inheritance, Anima attention
and durable regional queue/replay remain separate owners. Current enabled-region
NEW refusal, target-only Smart permissions, post-publication/frozen Retry
independence and regional provenance exclusions remain intact. PP-001/007/008
remain **Пока не обещать**. No native, worker-protocol, packaged-runtime, model or
public-generation PASS is claimed by this numerical checkpoint.

## Final execution evidence

Root executed these checks against the two new Python files on the dirty working
tree, using the existing Python 3.12.13 interpreter without provisioning. The
module remains disconnected from production generation.

| Check               | Actual result and boundary                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Focused unittest r2 | 48 passed, zero failures/errors/skips, 0.784 s; whole suite under `-I -S -B`, including a fresh guarded no-site child import/call                |
| Pytest neighbor r1  | 52 passed, zero failures/skips, 1.044 s; the same 48 cases plus four existing padding/CLIP controls using explicit shape/tensor/encoder fixtures |
| Ruff and format r2  | Both new files PASS                                                                                                                              |
| BasedPyright r2     | Both new files, strict project settings: zero errors/warnings/notes, 1.297 s                                                                     |
| Threshold mutation  | Isolated GREEN 2 → semantic RED 1 / binary control GREEN 1 → restored GREEN 2, 0.524 s; alpha 128 loses its range under `>128`                   |

The mutation copies only the complete three-file stdlib import closure: package
initializer, numerical module and its test. All three are restored byte-exact;
the shared source is unchanged. The full 1,354-member mutation source archive,
runner, original/mutant bytes, reports and logs remain outside the disposable
checkout. No environment or model copy is created.

The first focused run already passed all 48 cases. Initial Ruff findings cover
one equivalent production branch merge plus test import/reflection style. Initial
BasedPyright findings are eleven test annotation/private-spy diagnostics; explicit
types and typed reflection correct them without changing numerical assertions.
The unchanged numerical suite passes again after those corrections.

The first four-control pytest attempt passed three cases and failed the fourth's
setup because root had not created the basetemp parent directory. Root created
that directory; the same four assertions passed in padding-controls r2. This is a
fixture setup failure, not a numerical or product RED. Both original and corrected
records are retained.

All checks run serially in owned process groups with a 3 GiB ceiling, zero swap
and a 600-second deadline. Retained resource records have empty remaining-PID
lists. No TypeScript, Vue, prototype or app build source changed; their source
identity and the admission/frozen-work paths remain baseline-exact. No new app,
prototype, packaged-worker, real-tensor or model qualification is claimed.

Independent source review R1 is **CLEAN / READFINISHED**, covering the complete
helper/test delta and unchanged baseline consumers. It independently inspects
source and the oracle, without rerunning execution or certifying model behavior.
The candidate-only retention audit and root final release are complete within
their scope below. Compact evidence is under
`~/.codex/artifacts/imagegen-studio/runs/regional-guidance-attention/20261025-numerical/`.
No test/check is claimed to have executed the production regional attention path:
that path is not connected. No commit or publication occurred.

## Retention and release

The independent candidate-only audit is **CLEAN / READFINISHED**. It verifies all
1,351 baseline and 1,354 mutation archive members, the complete three-file
isolated import closure, exact source restoration and semantic RED/control/GREEN
records. New alpha inputs are literal vectors. Existing controls use generated
PNG and the literal 19-byte `checkpoint identity`, not trained weights. Required
source/configuration/lock/fixture definitions and pinned sRGB profile bytes remain
archived. The four tiny raw control files also survive as compact byte-verified
copies outside the disposable roots.

After all six then-existing delegated tasks/readers closed, root freshly verifies
owned units inactive and groups empty, source restoration, no accessible process
references, no incoming symlinks in the artifact/repo scope and no outside-run
metadata consumer. Only these exact paths are removed:

- `payloads/python-controls-r1` — 24,576 allocated bytes.
- `payloads/python-checks-r1` — 24,576 allocated bytes.
- `payloads/mutation-threshold-r1` — 110,592 allocated bytes.

Artifact-root allocation falls from 6,398,713,856 to 6,398,554,112 bytes:
**159,744 bytes actually reclaimed**. All three paths are absent. External Python
runtime/environment and protected earlier evidence are not provisioned or deleted.
Denied `/proc` reads in protected unrelated OS scopes are recorded without
escalation; this is not an all-process security claim. No native payload or exact
external-runtime replay certificate follows from these unit fixtures.

The final source contains 1,354 members. Version mapping distinguishes the frozen
R1 source, prelint test/source copies, actual mutation archive and final docs.
There is no new app/packaged-worker build. The local evidence set stays below its
100 MiB aim and adds no environment/model copy. The historical compact-evidence
exception remains: prior Regional failure/qualification evidence supports current
unfinished promises; deleting it requires a separate dependency reduction review.

This completes numerical preparation only. Native tensor consumption, trained
model effects, latent resampling/composition, image adapters, Smart/Anima policy
and durable regional execution/replay remain later owners. NEW generation with
any enabled region is still refused. Frozen work/Retry and all regional provenance
exclusions remain unchanged; PP-001/007/008 remain **Пока не обещать**.
