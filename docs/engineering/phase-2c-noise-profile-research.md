# Exact-file Illustrious noise profile

## Scope and entry revision

Authorized continuation of 2C, base `ac955e52ce6e3d2d995d36b1ba87f86bf10aefc6`
(`master`, initially clean). High risk: SQLite policy, frozen queue/Retry, worker
execution and immutable accepted provenance. Supporting contracts: PP-004,
PP-005, PP-007/008, managed-model library, generation settings/provenance and
the NoobAI subsection of the implementation roadmap. Full NoobAI support and
trained author-recipe qualification remain subsequent work.

User decisions: separate ZTSNR and timestep spacing in Model Manager; unknown
exact files use explicit assumptions `false` / `leading`, editable before or
after first use. Prediction type stays independent and editable only there.

## Confirmed baseline and owners

- `ModelService.resolveVerifiedGenerationCheckpointForPlan` verifies managed
  exact SHA-256/size and returns current prediction policy. Existing prediction
  overrides are keyed by bytes, separate from CivitAI metadata.
- Public Generate captures a Project document; preparation resolves resources,
  materialization reverifies them, durable SQLite queue freezes concrete inputs,
  Retry uses frozen inputs and target. The worker client adapts only a disposable
  wire copy for qualified older peers.
- Worker 0.13 implements ordinary Euler; no noise-profile DTO or override exists
  at this revision. Native schedulers currently inherit the pinned config.
- [Euler research](./phase-2c-euler-research.md) pins author source/config hashes
  and native Diffusers 0.40 behavior. NoobAI V-Pred author recipe specifies
  Euler/v_prediction/zero-SNR; scheduler JSON itself is false/leading. Neither
  family labels nor prediction type justify automatic zero-SNR or trailing.
- Native DPM++ SDE lacks a zero-SNR constructor parameter. Unknown config fields
  may be stored while actual betas are unchanged. Refuse SDE + zero-SNR rather
  than treating a config flag as execution evidence.

## Intended contracts and compatibility

Main owns a new SHA-256+size policy table with independently nullable overrides.
Each field reset restores its assumption and preserves the other override.
Identical files across source/version rows share policy; same-file repair retains
it; different bytes do not inherit. Policy is not added to resource identity or
editable Project/preset payloads. Current library policy governs new Prepare.

The frozen `sampling.noiseProfile` snapshot is strict and versioned:
`schemaVersion:1`, `baseSchedule:sdxl-scaled-linear-v1`, boolean
`rescaleBetasZeroSnr`, and `timestepSpacing:leading|linspace|trailing`.
Base semantics are 1000 train timesteps, scaled-linear beta 0.00085–0.012,
steps_offset=1. Python receives actual values, never assumption labels, local
library defaults or network metadata. Accepted records preserve the actual
snapshot; old accepted absence is Unavailable.

Worker 0.14 + explicit `illustrious-noise-profile` is required for non-neutral
profiles. Neutral false/leading may be omitted only from disposable wire copies
for older qualified workers. Historical frozen absence is the original baseline;
legacy durable JSON is not rewritten. A changed current policy refuses
materialization/Retry preserving original rows, receipts, candidates and target;
restoring the actual values permits Retry. Assumption-vs-override labels alone
do not change execution identity. Save does not require the new capability.

## Failure mechanisms and checks

Potential failures: partial per-field update loses adjacent override; same bytes
acquire conflicting policy; a library edit silently changes queued execution;
unknown worker inherits a new capability; SDE accepts an ignored flag; old
provenance is fabricated from today's library. Verify each at its real owner.

Planned checks: actual migrated SQLite/API and restart/repair; strict schema and
capability matrices; public Generate and preserving Retry against controlled
JSONL peers; `.igs` Save/readback and accepted comparison; native CPU scheduler
alphas/sigmas/timestep grids with matched single-axis controls. Semantic mutations
separately remove zero-SNR and spacing application after healthy setup. UI checks
cover field labels/assumptions/reset and approved Model Manager layout; prototype
mocks are not production storage evidence.

All heavy suites run serially under finite cgroup RAM, zero swap and deadlines.
Inventory before runs; reuse repo Python environment for CPU checks and keep the
single existing 0.12 installed pool protected. It is not requalified as 0.14 in
this slice. Compact logs/reports live under the noise-profile run; no model or
runtime copies are required. Independent trained recipe/quality, full component
matrix, dynamic batches and release qualification are not inferred from CPU tests.

## Results

Implemented on 07.10.2026: additive SQLite migration 0016 and exact-file policy,
independent Model Manager controls/reset, read-only Project display, frozen
Prepare/materialization/Retry, strict worker 0.14 DTO and native scheduler
application, immutable accepted profile and independent `.igs` readback.
Prediction policy, preset/resource identity and historical accepted absence
remain separate. Defaults are assumptions; this slice does not infer an author
recipe from a NoobAI label or v-prediction.

Evidence is retained at
`~/.codex/artifacts/imagegen-studio/runs/noise-profile/20261007-checks/`.
Validation includes actual migrated/reopened SQLite, same-byte aliases and
repair, preserving public Generate/Retry refusals, all three accepted modes in
portable `.igs`, legacy comparison, native CPU schedule equations/grids/steps,
and tiny real UNet/VAE img2img/outpaint pipelines. The complete Python suite
passed 378 tests, without skips; prototype coverage passed 175 tests with one
browser worker. Final delivery commands and process/resource measurements are
recorded in the compact validation summary.

| Check                                                     | Result                                   | Boundary                                                                            |
| --------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| App test manifest, `tsx --test --test-concurrency=1`      | 2279 passed, zero skips                  | Real production services/storage plus controlled JSONL peers; not trained inference |
| Full Python suite                                         | 378 passed, zero skips                   | Pinned CPU scheduler and tiny UNet/VAE execution                                    |
| `pnpm run prototype:test --workers=1`                     | 175 passed                               | Prototype interaction/layout; not storage                                           |
| Model Manager prototype rerun                             | 15 passed                                | Includes newly installed mock version's assumed profile                             |
| `pnpm run typecheck`, `pnpm run lint`, app build          | Passed                                   | Vue/TS, lint and packaging source checks                                            |
| Python basedpyright / Ruff                                | Passed                                   | Strict types and lint                                                               |
| Native Model Manager handoff + profile + catalog ordering | Passed                                   | Real Electron IPC/Main/SQLite, X11/XWayland                                         |
| Semantic mutation controls / mutants                      | Two green controls, three killed mutants | Source hashes checked; isolated copies removed                                      |

The final typecheck's first 2 GiB cgroup attempt hit Node's automatically selected
1 GiB heap limit. Rerun with an explicit 2 GiB Node heap within a 3 GiB cgroup
passed (1.5 GiB peak); this is resource setup evidence, not a product regression.

Three semantic mutations were killed after healthy controls: force zero-SNR
off (24 failed/36 passed selected native cases), force leading spacing (two
failed/one passed independent Euler grids), and omit the effective-profile
Retry recheck (expected preserving rejection disappears). Mutation copies,
not working sources, were changed; subprocesses exited and source hashes were
verified before disposing the copies. `mutations.json` records exact reclaimed
allocated space and commands. A failed first harness detector and invalid test
setup were corrected; they are not counted as killed product mutations.

Native Electron verification uses the real preload/Main/SQLite boundary:
UI edits and independent resets, catalog policy, direct SQLite rows, unchanged
Project draft/dirty state and saved bytes, and read-only Project values. A
screenshot exposed controls compressed beside the version actions. They now
use the full version-card width; before/after screenshots were inspected and
the smoke checks the regression geometry. The component is shared with the
prototype; the basic Naive Select DOM was inspected before choosing locators.
Native smoke uses explicit X11/XWayland because this environment's default
Wayland window ignores programmatic resize. Browser locator failures and this
platform setup failure are not storage/inference evidence.

Source cross-review found no concrete blocker. The policy check occurs before
scratch materialization (and before frozen Retry); there is no final-SQL CAS
against a later library edit. Do not interpret this as an atomic policy fence
through enqueue. Zero-SNR + DPM++ SDE/SDE Karras is explicitly unsupported by
the pinned native constructor. DPM++ 2M Karras uses its own grid irrespective
of spacing; native tests and the UI explain this boundary.

All heavy checks are serial, with finite RAM, zero swap and deadlines. No new
trained weights or full runtime copies were created. The retained installed
worker0.12 is protected for subsequent qualification, not used as proof of
worker0.14 support. Genuine trained epsilon/v-pred author-recipe qualification,
component compatibility, dynamic batches and release gates remain open in the
NoobAI roadmap; PP-004/005/007/008 are not promoted to full readiness.
