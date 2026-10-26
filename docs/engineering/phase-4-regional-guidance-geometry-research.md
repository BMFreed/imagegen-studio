# Private ordinary Canvas regional latent coverage

Status: **complete within its private CPU world-to-latent/consumer boundary** on dirty
`master@10115df581d9e07049478dee3866a280886794fd`. This follows the
[encoded-conditioning bridge](./phase-4-regional-guidance-conditioning-research.md).

## Finite decision

The completed Main recipe already owns full-target world-alpha planes, exact
bbox metadata and four coverage classifications. The existing Python bridge
consumes only latent-sized `Alpha8`. Add one private numerical operation between
them: `ordinary_canvas_coverage_to_latent` returns the existing `Alpha8`, using
the explicitly selected `ordinary-canvas-origin-nearest8-v1` profile.

Ordinary composition preserves the exact captured `primaryBbox` dimensions.
Illustrious generation requires sides divisible by eight, with at most 2,048
pixels per side and 4,000,000 pixels per target. Its expected latent grid is
`(height/8, width/8)`. The supplied model sample is independently checked by the
existing bridge. SDXL micro-conditioning size is separate from this geometry.
Smart's separate processing resolution is outside this owner.

The helper requires exact matching `coverage_bounds` and `bbox`, immutable bytes
of exactly `width * height`, and an explicit existing `Shape` equal to the
expected latent dimensions. It validates both rectangles, including strict
integer origins and no Boolean integers. The origin limit applies to each
origin, preserving the existing projection contract without adding a new
endpoint restriction. Rectangle metadata is captured into locals synchronously;
callers must not concurrently mutate metadata during the call.

Sampling is bbox-local and row-major:

```text
result[y,x] = alpha[(8*y)*bbox.width + 8*x]
```

The Main projection has already applied world translation, clipping and zero
padding. Negative or non-grid-aligned world origins do not shift sampling phase.
Selected alpha8 bytes remain exact, including 1/127/128/254. This operation does
not threshold, normalize, invert, max-pool, blur or multiply by display opacity.
It neither fabricates global coverage nor infers source classification from the
sampled result. A `covered` world plane can legitimately sample to all zeros;
the original four kinds remain in the recipe. Downstream eligibility is still
the numerical planner's explicit `>=128` profile and ceil/max attention pyramid.

This named lossy algorithm is a private preparation choice, not a public mask
default or model-quality claim. Global support, overlap/composition, pooled
selection, effective text/embedding resources, regional expansion, Smart,
Anima, references and durable replay remain separate. No production caller,
worker command, queue/capability or persistence change is introduced.

## Source research and alternatives

Two source-only investigations confirm the ordinary path: primary bbox capture,
exact target composition, retained preparation dimensions, divisible-by-eight
worker admission and explicit latent checks. Their source observations do not
establish native behavior. The previous 351-case checkpoint remains historical
ROOT evidence, not an executed result for this helper.

The local Invoke reference is `7a4ea3517a13ad6bb9d7883bafb1e3d056a37fba` with an
untracked frontend directory. The old `app/invocations/denoise_latents.py` is now
a forwarding shim; current code is in `app/invocations/sd/denoise_latents.py`.
It standardizes masks and uses tensor nearest resize. That supports investigating
origin-aligned nearest, but does not establish parity with this raw-byte helper.
Pillow nearest/pixel-center sampling is a different candidate. An actual pinned
Torch-nearest comparison is required before recording agreement for this finite
ratio. No third-party implementation is copied.

General processing rescale has no ordinary consumer here. Reusing Smart's
BICUBIC/keep/coherence routines would choose unrelated behavior. Adding another
recipe, tensor bank or Service wrapper would duplicate completed ownership.
Immediate production denoising would additionally cross CPU-float32 versus the
production float16/CUDA loader and unresolved composition policy. The existing
private native consumer provides a smaller executable boundary for this owner.

## Bounds, risk and acceptance

Risk is medium for the numerical helper: incorrect sampling can assign a region
to different attention queries, but it changes no mutable native scope, asset
acquisition, SQL, `.igs`, history, seed or queue. Consumer evidence still uses
the qualified native adapter's existing lifecycle guards.

| Parameter            | Decision and boundary                                                                |
| -------------------- | ------------------------------------------------------------------------------------ |
| Profile              | Required exact `ordinary-canvas-origin-nearest8-v1`; unsupported profile refuses     |
| Rectangle            | Exact built-in dict with x/y/width/height and exact integers; matching bounds        |
| Origin               | Existing ±2,147,483,647 origin ceiling; no absolute-grid snapping                    |
| Dimensions           | Sides 8–2,048, divisible by eight; area at most 4,000,000                            |
| Alpha input          | Exact immutable bytes, exact full-target count; no decode or intermediate image      |
| Latent output        | At most 62,500 bytes; `2000×2000 → 250×250` reaches the area limit                   |
| Owned scratch/output | At most 125,000 payload bytes together; excludes input and Python metadata/RSS       |
| Aggregate limits     | Existing recipe 64 MiB, capture 512 MiB, planner and adapter budgets remain separate |
| Runs                 | Serial 3 GiB groups, zero swap, 600-second deadline; 100 MiB local artifact aim      |

All validation precedes output allocation. Local diagnostics are `INPUT_INVALID`,
`PROFILE_INVALID` and `LIMIT`; there is no rounding or fallback. Unit checks must
cover exact bytes, phase-sensitive impulses, skinny rectangles, area/side limits,
wrong bounds and same-area transposed latent shapes. Native tests must consume
the projected output through real encoding/conversion and original attention,
observing permissions and output with an independent oracle. A genuine
four-stage VAE/noise path must establish the actual `/8` sample grid; the previous
bridge fixture's one-stage VAE alone cannot prove it.

ROOT's test-only transfer should enter real `ProjectService` capture and
`prepareCurrentCanvasRegionalRecipe`, retain actual produced alpha and metadata,
then run Python sampling and the native bridge. It does not add production IPC.
A center-phase mutation must turn the asymmetric consumer test semantic RED,
leave the constant-cell control GREEN, then restore exact source and rerun.
No source review or authored test is reported as executed qualification.

Enabled-region NEW refusal, target-only Smart permission, published/frozen Retry
independence and provenance/Compare/result-derived-preset exclusions remain
unchanged. PP-001/007/008 remain **Пока не обещать**.

## Evidence and lifecycle

ROOT executes two real saved-package Service capture/recipe probes, translated
from `(-13,5)` to `(18,-22)`. Both preserve document/history/epoch, SQL, shadow and
package bytes. All four coverage kinds plus an unsampled opaque impulse survive
in the test-only transfer. Ten actual Main-produced planes pass through the
helper and agree exactly with pinned Torch tensor `nearest` for this ratio.
Four normal native UNet forwards consume their literal expected permissions in
CFG and positive-only layouts, with exact model restoration. This transfer is
not production worker IPC or installed-model qualification.

The first focused run executes 237 cases: 234 PASS and three fixture errors.
`pytest.raises` was read as a context manager rather than the returned
`ExceptionInfo`. Binding that return value fixes the test without changing its
assertions or the implementation. The initial typing run reports 24 test-only
diagnostics; narrow private-fixture imports and runtime-no-op casts retain the
intentional invalid inputs. Original failed logs/source remain retained.

The corrected combined run passes **588 tests**, zero failures/errors/skips:
237 new geometry cases plus the previous 351 bridge/adapter/numerical/native
neighbors. This includes isolated no-site stdlib import, preallocation refusal,
actual original-attention masks/output and the genuine four-stage VAE/pipeline:
24×40 pixels encode to 3×5, native noise samples have that same grid, and one is
consumed through the regional bridge. Original components/state/hooks/call-entry
slots are restored. Final scoped Ruff/check-format and strict BasedPyright pass.
The production helper is byte-identical to its first executed version.

The isolated center-phase mutation changes only `(8y,8x)` to `(8y+4,8x+4)`.
It gives GREEN2 → semantic original-attention permission RED1 / constant-cell
control GREEN1 → restored GREEN2. All 1,363 isolated source members restore
byte-exactly; the shared production helper stays unchanged. Independent source
R1 is CLEAN/READFINISHED; candidate retention is CLEAN/READFINISHED within
retained-byte/dependency scope. Neither review independently reruns native tests.

ROOT's fresh release gates cover all ten registered owned units/cgroups,
candidate-related process handles/arguments, seven then-existing child tasks and
readers, source/restoration identities, retained fixture/archive bytes, the
artifact lifecycle graph and incoming symlinks. Only three declared idle payloads
are removed. Measured artifact-root reduction is **31,268,864 bytes
(29.8203125 MiB)**, matching their allocated total. Actual Main fixture bytes stay
in the verified four-member archive: two closed SQLite databases and two saved
IGS packages, with all mask members. Unit fixtures remain as six mappings to four
CAS contents (49,958 bytes), including synthetic TI and a literal checkpoint
marker, not trained weights. Raw causal records, source/primary-source archives
and version mappings remain protected. Final source contains 1,363 members;
only three documents change after the qualified source freeze. No fresh app,
prototype or packaged-worker build is claimed.

Evidence is
under `~/.codex/artifacts/imagegen-studio/runs/regional-guidance-geometry/20261026-origin/`.
The 1,360-member baseline source archive is reused read-only from the completed
conditioning owner, with a bidirectional dependency. The existing Python runtime
is reused; no environment or model weights are copied or provisioned. Historical
Regional evidence remains protected under its recorded compact-budget exception.
