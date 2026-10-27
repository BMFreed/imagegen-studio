# Private Main-resolved Illustrious sampling

## Contract and scope

Work starts from clean `master@10147ef7c4797340e5b574c3cfcf82147abe37a7`.
The [trained checkpoint](./phase-4-regional-guidance-trained-illustrious-research.md)
established exact loading and regional pixel causality using one/two Euler steps
and a deliberately fixed false-ZTSNR/linspace experiment. Main resolves the
selected official Illustrious file to a versioned false-ZTSNR/leading policy.
Those are different schedules; the earlier experiment did not qualify the
policy returned by Main or ordinary multi-step sampling.

The new private CPU/FP32 and CUDA/FP16 `ordinary-canvas-euler-txt2img-*-v2`
execution profiles consume the existing command's explicit noise policy.
They add no protocol field, recipe field, dispatcher, capture owner or diffusion
loop. Both entry points retain their signatures. V1 keeps its one/two-step,
absent-caller-policy and fixed-linspace contract.

V2 requires the exact `IllustriousNoiseProfile` record and exactly its four
fields: integer schema version 1, `sdxl-scaled-linear-v1`, a Boolean rescaling
flag, and an exact `leading`, `linspace` or `trailing` spelling. A detached record
is passed to the existing scheduler selector. Missing or malformed policies
refuse; borrowed scheduler configuration/history cannot supply a default.
Steps use the existing exact integer `1..MAX_GENERATION_STEPS` bound, currently
200. This numerical admission bound is not a completion, image-quality or
capacity guarantee. The six existing policy combinations receive lower-level
coverage; trained acceptance concerns the exact Main-resolved leading policy.

Euler/epsilon, one image, CFG 1–30, zero CFG rescale, explicit global coverage
and pooled selections, CFG-consistent layout and matched concrete prompts/seed
remain required. CPU/CUDA precision, embedded-VAE, exact-TI ownership and all
text, row, resource, geometry and expanded-mask limits remain unchanged.
No new composition default, fallback, offload, autocast, model repair or VAE
replacement is introduced. Invalid metadata refuses before filesystem/native
work; verified transparent targets precede encoding.

The existing reservation, one encode/assembly, fresh native pipeline/scheduler,
CPU generator and scoped regional attention still own the complete native loop
and VAE decode. Existing output conversion and exclusive provisional PNG
publication remain authoritative. A worker completion is not a Main candidate.

## Qualified execution

ROOT executed the change on dirty `master@10147ef7c4797340e5b574c3cfcf82147abe37a7`.
The four implementation/test files remain byte-identical to the qualification
archive; finalization changes only this note and the two linked documentation
entries. The final source set contains 1,385 files, seven changes against the
1,382-file baseline, including three additions.

The exact checkpoint is the 6,938,040,760-byte official Illustrious XL v0.1
epsilon file, SHA-256
`3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9`.
The existing production loader, compatible workspace runtime, 17 offline
configuration/tokenizer files and independent loading journal are reused. No
model or environment copy/download was introduced. Each trained process checks
the actual native checkpoint/conversion/live-state association: 2,514 source
tensors account for all 2,641 checkpoint-backed destination tensors.

Fresh fixtures use actual ModelService resolution, saved/reopened ProjectService
state, capture, concrete planner items and target composition. Five whole Main
recipes are transported unchanged: base, resource-only neighbor, coverage-only
neighbor, zero-region and changed seed. The command consumes Main's exact
false-ZTSNR/leading policy. Geometry is 1024×1024 at world origin (-13, 5), with
three enabled regions, inherited/local negatives, absent/empty positives and
synthetic paired exact-TI resources sharing the same literal across streams.
The broad mask and threshold complement remain distinct at both factor-two
and factor-four grids; explicit 127/128 samples exercise the boundary.

The accepted trained matrix has seven native cases: base at 20 and 30 steps,
resource/coverage neighbors at 20, zero at 20, an exact base repeat and seed 124
instead of 123. One additional aggregate checks the separately pinned records
without another native request. Actual leading grids are `951,901,...,1` at 20
steps and `958,925,...,1` at 30. All 70 original cross-attention processors and
native SDPA consumers are observed on every step. Independent expectations cover
contexts, every installed alias row, pools, masks, padding, time IDs, initial
noise scaling, CFG/Euler transitions, decode and reopened RGB quantization.
Encoding stays at one plan/four pairs/two TI loads/two no-op resizes/15 CLIP
forwards, independent of the step count.

Zero-region PT and every RGB byte match the ordinary native counterpart exactly.
The repeat is exact. With the other inputs held fixed, resource and coverage
neighbors change 2,911,414 and 2,930,835 RGB channel bytes respectively; changed
seed changes 3,094,409. Resource changes preserve selected pools; coverage changes
preserve encoded streams. These controls establish the measured causes, without
requiring spatially blocked final pixels to remain equal.

## Checks, mutations and recovery

Accepted groups contain **567 distinct pytest selections, 477 warnings and zero
failures/errors/skips**:

| Group | PASS |
| --- | ---: |
| New CPU/CUDA policy and sampling cases | 82 |
| Existing denoising, CUDA, output, exact-TI and shared-text neighbors | 470 |
| Trained matrix, including its record-only aggregate | 8 |
| Separated trained failure/recovery cases | 3 |
| Healthy trained mutation selectors | 4 |

Two existing full-architecture opt-in cases are explicitly deselected in the
shared-text neighbor group. They are not counted as executed or skipped. The
trained sampling suite exercises the actual full checkpoint separately.
Ruff check/format, scoped strict basedpyright (zero errors/warnings), source and
diff checks pass. No repository TypeScript/Vue code changed. Authored tests,
source reviews, ROOT execution and retained-data audits remain different evidence
levels.

The small CPU/CUDA policy mutation records 4 GREEN → 2 semantic RED plus 2 V1
controls GREEN → 4 restored GREEN. The trained copy records 4 GREEN → policy
RED/control GREEN → permission RED/control GREEN → 4 restored GREEN. Combined,
these are 24 repeated mutation executions: 20 GREEN and four intentional
semantic RED, with no errors/skips. Repeated phases and the pilot are excluded
from the 567-selection total.

The trained policy mutation substitutes linspace after valid leading admission.
The actual schedule assertion fails after genuine PNG publication; prediction,
native PT and 2,849,561 reopened RGB channels differ. Its V1 control remains exact.
The permission mutation removes one valid regional positive range from step 15.
All observations for steps 1–14 remain exact; later prediction, native PT and
1,983,491 RGB channels differ. The zero-region control remains exact. Exact
source restoration returns all four selectors and their PNGs to GREEN. All
1,385 mutation-checkout members restore exactly with no extras, and the live
workspace is unchanged by the driver.

Separate trained faults occur on step 15, after VAE decode and during PNG
publication. They return no successful completion, preserve borrowed tensor
values/storage, configs, tokenizers, hooks/processors/call slots, reservations,
RNG and target bytes, and allow fresh recovery exactly matching the pinned
base20 GREEN. These are recoverable cooperative exceptions, not GPU-context
poisoning or hostile concurrent mutation guarantees.

## Envelopes and excluded attempts

Trained units run serially under aggregate 12 GiB host memory, zero swap,
600 seconds per unit and CUDA allocator fraction 0.75. The healthy matrix
completed in 403.592 seconds with recorded cgroup peak 8,039,030,784 bytes.
The base20 report records CUDA peak allocation 9,831,422,976 bytes and reservation
12,486,443,008 bytes. These observations concern the exact checkpoint, geometry,
policy and calls tested; allocator fractions do not bound every GPU allocation.
The accepted failure tests use separate units, each within the same envelope.

Earlier diagnostics remain retained and excluded:

- Two initial small-suite failures expected four loader calls rather than the
  native installer's two. Only that expectation and its comment changed; the
  pair/CLIP counts and step-invariance checks remain. The corrected 82 cases pass.
- Combined neighbors at 3 GiB, isolated exact-TI at 3 GiB and then 6 GiB without
  post-test GC exceeded their envelopes. Isolated exact-TI/shared-text groups
  pass at 6 GiB with an external plugin calling `gc.collect()` after the original
  pytest protocol/teardown. No assertion, native source or Torch-cache behavior
  is changed by that plugin. These are separate successful groups, not a
  successful combined run.
- Grouping all three trained faults into one unit exceeded 600 seconds after
  two completed cases. The grouped unit is excluded. Running each fault in a
  fresh unit preserves the deadline, inputs and assertions.
- Initial Main producer geometry/path errors are setup diagnostics. Its dense
  512 palette fixture succeeded but both masks pooled to full support, so it
  was not used for decisive coverage acceptance. The genuine broad 1024 fixture
  supplies that contrast.

Ordinary calibration at 512×512/20 and 1024×1024/28 also completed with exact
loading witnesses. ROOT viewed severe visual artifacts in the former and a
coherent castle landscape in the latter. These two ordinary observations are
not regional visual-quality acceptance, a resolution rule or a general quality
claim. Synthetic TI vectors and pixel changes establish influence; useful
regional semantics still need separate visual acceptance.

## Retention and remaining scope

Local ROOT evidence is under
`~/.codex/artifacts/imagegen-studio/runs/regional-guidance-sampling/20261027-leading`.
`qualification-summary.json`, accepted JUnit/log/resource groups, complete
observations, independent PNG comparisons, originals/mutants/patches and both
restoration verdicts are retained. Source R2, immutable-input and completed-output
audits are CLEAN within their declared scopes; they did not rerun ROOT's ML.
The final source/document/retained-bookkeeping review is recorded separately.

ROOT refreshed all 29 owned unit states, source restoration, incoming pointers
and the nine then-existing principal child-task reader states before disposal.
Available same-user process handles had no candidate users. Seven pre-existing
nondumpable desktop services are explicitly outside that handle census and the
owned qualification groups; their inaccessible handles are not claimed verified.
All global incoming pointers found for the candidate are local historical replay
records with archived byte coverage.

The exact `payloads` tree (4,565 entries: 3,620 regular files, 831 directories and
114 symlinks) is preserved in `retained-payloads-r1.tar.gz`, 68,413,974 bytes, with
SHA-256 `a43e0f60fcff0313125b4e1a5d3c0751a5cd106546c7a5c5bc8ead0551dbfc4f`.
The archive's complete member set, lengths, hashes, metadata and link text were
read back without following links. An exact fresh inventory preceded removal.
Disposal released **126,599,168 allocated bytes** during the measured deletion
interval, with the archive already present. This is not a net whole-checkpoint
storage claim. Historical report paths identify archive members after disposal;
replay must restore their required bytes first. The compact genuine Main inputs
at `main-broad-r4/payloads`, selected PNGs, exact source, offline configs,
predecessor journal/native sources and the reusable external runtime remain
pinned; no source weights, runtime or ordinary app data were deleted.

Public enabled-region NEW admission, durable Main queue/candidate publication,
Add/Save, immutable Regional Guidance provenance, Compare/result-derived presets,
Anima regional execution, arbitrary checkpoints/policies at trained scale,
maximum capacity and general visual quality remain outside this checkpoint.
Smart target-only permission and published/frozen Retry independence remain.
Product model families remain Anima and Illustrious. PP-001/007/008 stay
**«Пока не обещать»**.
