# Internal outpaint execution, contribution publication and portable provenance

Research base: `af4f7035b116956365d2ec5e97ea864b899f1859`, `master`,
2026-10-06. Source-aware implementation and peer review of the dirty tree;
this is not a blind audit. Continues
[frozen outpaint jobs](./phase-2c-outpaint-jobs-research.md).

## Scope and risk

Connect the existing frozen Illustrious/Anima outpaint jobs to explicit worker
commands, verify real RGBA contributions in Main, retain candidates after queue
pruning, and support explicit Add/Undo/recovery/Save/reopen and settings comparison.
Public mixed-alpha Generate and public Retry remain closed. Main's automatic
first-engine LaMa installation and installed/release qualification remain future
boundaries. No new product decision is needed; PP-005/007/008 stay `пока не обещать`.

Risk is high: worker/file resource identity, immutable provenance, recovery and
portable `.igs`. Authorities are
[worker protocol](../specs/05-worker-protocol.md),
[normal generation](../features/project/generate-mode/generation-actions.md),
[provenance](../features/project/generate-mode/generation-provenance.md),
[auxiliary resources](../specs/07-python-runtime-management.md#общие-вспомогательные-веса-для-outpaint),
[research](./research-protocol.md) and [review](./review-protocol.md).

## Ownership and exact commands

- Protocol v1 adds `generate-illustrious-outpaint` and `generate-anima-outpaint`.
  Frozen numeric img2img plans remain numeric conditioning plans inside these
  explicit operations; neither wire dispatch nor pixels fall through to opaque
  img2img. Strict commands retain source PNG, raw keep-alpha, bbox, policy and
  pinned LaMa identities, plus the existing family settings/resources.
- Worker 0.12.0 qualifies the retained Illustrious capabilities and the explicit
  outpaint adapter. Native BF16 availability additionally controls the original
  Anima capabilities and `anima-outpaint`; lack of BF16 does not disable
  Illustrious. Legacy 0.11.0 remains available for its ordinary operations.
- Main verifies exact model/LaMa identities outside queue transactions, copies
  bounded target bytes into private scratch, then dispatches detached strict
  commands. Python captures source/LaMa through bounded descriptors and validates
  actual source CRC, pinned sRGB ICC, dimensions and original raw alpha before
  model execution. Ready local LaMa bytes have no download/network fallback.
- Family execution uses the previously qualified native masked cores. Existing
  weighted prompts, options, native sampling, independent seeds and progress
  remain family-owned. Shared publication has explicit RGB/RGBA modes; ordinary
  callers retain RGB and contribution callers retain RGBA, including thumbnails.
- Main independently computes the expected contribution alpha from the frozen
  source and compares actual RGBA bytes. A worker-reported mask hash is not a
  substitute. Uniform zero or opaque contribution alpha is legal when implied
  by the source policy.
- Before the candidate manifest commits, staging fsyncs one immutable
  `source-target.png` per outpaint session. Queue pruning does not remove this
  owned recovery source. Publication, list/recovery and Add reverify it and the
  contribution. Existing receipt identities bind frozen input and real output;
  no SQL migration is needed. Session tombstones own source cleanup.
- Portable v1 provenance adds both outpaint kinds, concrete family settings and
  strength, source/mask/policy/LaMa identity, and actual contribution-alpha hash.
  `.igs` retains accepted RGBA pixels and metadata; the source PNG, local paths,
  native compiled arrays and all regional inputs remain absent. The reader and
  staged Save validate actual asset alpha before returning/replacing the file.
  Comparison includes mode and strength, excluding conditioning identities.
- Preserve the generic actual-seed contract: a valid uint32 completion may differ
  from its scheduled seed. The receipt, operational cursor and accepted provenance
  retain the actual value; the frozen request retains the scheduled value.
  Equality guards proposed during implementation were rejected by the existing
  [seed regression contract](./product-audit-fixes.md#фактический-seed-при-принятии-результата).

## Independent alpha oracle

The fixed policy uses Pillow bilinear downsampling with 22-bit coefficients and
rounded uint8 horizontal/vertical passes. At radius2 and minimumDenoise0, the
expanded mask's quantized value is255 only when the 13-point positive Gaussian
footprint contains only255 reduced alpha. Nearest expansion and mask5 chamfer
distance feed the fixed fade polynomial, followed by uint8 truncation and inverse
alpha. Main implements only this observable contribution policy, not the ML
latent mask or a substitute inference backend.

Primary numerical sources:
[Pillow Resample.c](https://github.com/python-pillow/Pillow/blob/12.2.0/src/libImaging/Resample.c)
and [OpenCV distance transform](https://github.com/opencv/opencv/blob/5.0.0/modules/imgproc/src/distransform.cpp).
The checked oracle contains 116 live cases from pinned Invoke methods with
Pillow12.2.0, NumPy2.5.3 and OpenCV5.0.0, including both IPP and scalar paths,
soft/near-opaque pixels, boundaries and the largest admitted grid. A finite
minimal-distance test also covers zero, exact fade16 and quantization intervals.
Arbitrary nonminimal cost combinations were disproved as valid nearest-source
distances and excluded from that proof. The generator, source hashes and primary
source copies are retained with the evidence.

Production verification yields to Main's event loop every 128 rows. Measured raw
derivation on 2048×1952 pixels was 58–127 ms typically, with a 221 ms outlier;
these are local CPU observations, not a performance guarantee. Source/image
validation remains bounded but repeated candidate recovery is not claimed cheap.

## Parameters and refusal boundaries

| Parameter             | Authority                    | Bound / behavior                                                                   |
| --------------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| Source/output         | Existing generation ceilings | PNG32MiB each, side2048, pixels4,000,000, 8-pixel grid; family admission minimum64 |
| Policy                | Frozen Invoke v1             | edge16, fade16, minimumDenoise0, Gaussian weighted max, LaMa, contribution         |
| LaMa                  | Existing pinned manifest     | 205,669,692 bytes; SHA344c77bb…67a9ea9; Main-owned fixed local file                |
| Transport             | Protocol v1                  | 64KiB JSONL including newline; strict fields and alias refusal                     |
| Recovery source       | Session owner                | At most one32MiB source per session, before manifest publication                   |
| Contribution identity | Actual PNG alpha             | width×height alpha8 bytes and SHA256; no worker attestation trust                  |
| Test execution        | Local diagnostic safeguard   | Sequential heavy suites; independent cgroup RAM ceiling, swap0, runtime deadline   |

## Test-harness memory incident

At 22:00:53 the kernel recorded global OOM and killed PID 159162, named
`MainThread`, with 19,864,984 KiB anonymous RSS. The concurrent Python trained
worker had approximately 940 MiB RSS. Original mutation timing and observed copied
source show the first bilinear-rounding mutation was active.

The alpha oracle used `assert.deepEqual()` on buffers of up to 3,997,696 bytes.
Node 24 renders every Buffer byte for this assertion's diff, and its Myers diff
retains a full vector per edit level. A safe 1 KiB probe reproduced approximately
34 MiB of diff trace allocation. A maximum oracle vector alone is about 61 MiB per
level. This mechanism strongly explains the incident; the vanished PID's exact
command line could not be recovered and is not presented as directly observed.

The test now checks `actual.equals(expected)` with a short diagnostic, preserving
exact byte equality and mutation sensitivity. Heavy checks run sequentially in
separate systemd cgroups with `MemoryMax`, `MemorySwapMax=0`, `OOMPolicy=kill`
and a deadline. The desktop/user services and installed runtime are untouched.
The original interrupted trained run is not counted as successful evidence.

## Evidence and remaining boundaries

Artifacts:
`~/.codex/artifacts/imagegen-studio/outpaint-execution-2026-10-06/`.
The OOM report records kernel evidence, the small probe and confidence limits.
Focused real SQLite/filesystem/Add/Save/reopen cases use explicit tiny-model and
transport collaborators; they do not establish trained model or installed runtime
readiness. The independent oracle uses actual primary numerical methods.

Executed against the dirty working tree based on `af4f703`, with source hashes,
commands, phase logs and results retained in the artifact directory:

| Check                     | Executed result                                                                                                    | Boundary                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full application tests    | 1,920 passed, 0 failed/skipped; exact `app:test` file set with `--test-concurrency=1`                              | Real TS rules, SQLite, filesystem, staging and portable owners; explicit transport/model collaborators                                                                 |
| Full Python tests         | 985 passed, 0 failed/skipped; `uv run --locked --extra inference pytest -q`                                        | Actual parsers, scaled native CPU execution, alpha/LaMa/publication boundaries; no installed/release claim                                                             |
| Type/lint/build           | `pnpm run typecheck`, `pnpm run lint`, `pnpm run app:build`, Ruff check/format and basedpyright passed             | Both Vue projects, production source and worker source/tests; prototype UI unchanged                                                                                   |
| Publication mutations     | 10/10 detected; all 132 selected controls restored green; peak 193.1 MiB                                           | Numerical contribution, immutable source/output capture, source retention and recovery proof                                                                           |
| Main mutations            | 8/8 detected and restored; 22/22 full selected controls green; peak 140.2 MiB                                      | Duplicate wire identities, explicit routing, early legacy error, owning asset, forged portable alpha and all-selected Add effects                                      |
| Worker mutations          | 12/12 detected and restored; 11/11 selected controls green; peak 914.3 MiB                                         | Real worker entrypoints, bounded growth, CRC/raw alpha, infill order/identity, exact compiled prompts/sigmas and readiness                                             |
| Trained development JSONL | Four completed real LaMa/CUDA cases: Illustrious DPM++2M Karras and replay, Anima Heun weighted prompts and replay | Actual Main strict capture → development worker → native trained execution → RGBA PNG/thumbnail/progress → independent Main alpha proof; no public UI/installed worker |
| Built Electron regression | `smoke-generation-actions.mjs` and `smoke-anima-queue.mjs` passed                                                  | Real Main/preload/renderer/SQLite/staging/Save/readback with controlled runtime/pixels; ordinary generation and all six Anima labels retained, no GPU claim            |

The trained cases used 256×128, four requested steps, strength 0.75 and seed 42.
Decoded output pixels repeated exactly within each family, and every contribution
alpha byte matched Main's independent policy. The external cgroup reached its
12 GiB ceiling (including charged file cache), completed in 74.4 seconds and used
no swap. This is a controlled local qualification, not a supported GPU-size or
RAM-capacity guarantee. The previously installed worker remains unchanged.

The full check group ran serially with a 4 GiB ceiling, completed in 280.5 seconds
and peaked at 3 GiB with no swap. An initial 512 MiB JS heap was insufficient for
ESLint; it stopped inside the bounded group, was not counted as a mutation kill,
and the successful lint/type pass used the larger bounded tooling budget.
The two Electron harnesses then ran sequentially, completed in 74.4 seconds and
peaked at 1 GiB with no swap. No prototype UI was changed, so `prototype:test`
was not rerun; the shared `typecheck` includes its type check.

Mutation copies verify import/source origins, restore changed bytes and rerun
unchanged controls. The artifact-only growth/prompt-forwarding/policy probes were
promoted into permanent `test_outpaint_worker.py` tests, and the final 12 worker
mutations were rerun against those repository tests. These 30 selected mutations
establish sensitivity to their named violations; they are not an exhaustive score.
The full app suite exposed an ordinary Add error-code regression; the generic
missing-candidate refusal now preserves `ACCEPTANCE_SELECTION_STALE` and both
existing ordinary regression controls pass.

Trained source hashes still match the final production Python files: Ruff left
them unchanged. Formatting-only TS changes and permanent test additions are
checked by the final full suites. Public Generate/Retry, first-engine auxiliary
installation, clean-install/upgrade and release qualification remain open.
Phase 2C is not complete.
