# Phase 2C: Illustrious opaque img2img

## Scope and risk

Continue [Phase 2C](../specs/01-implementation-roadmap.md) from
`cf1533baa5e05fc4893cff0fc106826c18d00794` on clean `master`.
[PP-005](../product-promises.md#pp-005-принятый-результат-хранит-настройки-генерации)
and PP-008 require derived generation mode, frozen settings and immutable accepted
provenance. This is a high-risk change to queue persistence, worker transport and
portable result records. It does not complete either promise or Phase 2C.

This slice covers Illustrious generation where the verified target-area composite
is fully opaque. Fully transparent input retains txt2img; partial alpha remains
outpaint and is refused explicitly. Anima, inpaint, Smart Patch generation, LoRA,
embeddings, other Advanced Options and release runtime installation remain open.

## Confirmed boundaries before edits

- Main already captures the finite bbox and visible Raster stack before runtime
  awaits. `composeFrozenGenerationTarget` verifies PNG/hash/ICC/size and the image
  worker client independently decodes alpha. Geometry is not a substitute for
  alpha: an intersecting layer can be transparent, and the Konva viewport also
  contains presentation overlays.
- Preparation, request, queue SQL CHECK, staging and portable provenance currently
  accept only txt2img. A new operation needs a new SQLite table-rebuild migration;
  changing a historical migration would not upgrade installed databases.
- Portable draft denoising strength is nullable 0–1. Production initializes it to
  null. The prototype's displayed 0.75 is an unpersisted presentation fallback;
  the contract does not establish it as a production default.
- Invoke reference checkout is
  `~/Work/sources/InvokeAI/` at
  `9e1540962bcca7f8fa668d7d8e02cf79d75fda3b`. Its denoising scheduler slices using
  a rounded training-timestep threshold. Pinned Diffusers 0.40.0's native img2img
  strength instead floors `steps * strength`. A simple forwarded argument would
  change small-strength behavior. `denoising_start` is also insufficient: it
  disables ordinary image-noise addition.
- Invoke's empty timestep window returns encoded latents, then VAE decoding still
  occurs. Strength 0 therefore does not promise byte-identical source pixels.
  Its unseeded posterior sampling has a reproducibility FIXME; this application
  must retain deterministic frozen-seed behavior instead.

## Implementation contract

One typed normal-generation preparation/request path gains a discriminated img2img
branch. Existing txt2img records retain their shape. Img2img freezes actual
`sampling.denoisingStrength` (required 0–1), source pixels, bbox, prompts, resource
identity and all other supported settings. Unset strength requires explicit user
input for opaque targets. A stored strength has no effect on transparent txt2img
and is not recorded as an applied setting there.

Worker 0.6.0 requires `illustrious-img2img` plus prior qualified capabilities.
Old peers retain neutral txt2img compatibility and cannot inherit img2img by
advertising an extra string. Main and transport both check the actual handshake.
Queue/staging read and write validate operation, request, preparation kind,
strength and independently decoded alpha together. Accepted provenance records
the actual mode/strength without local source paths; legacy absence remains
unavailable in comparisons.

The pinned img2img adapter retains Diffusers' actual VAE, denoising and CFG Rescale
loop while selecting the Invoke timestep window and adding noise only when the
window is nonempty. Separate frozen-seed CPU generators make posterior sampling
and image noise replayable without a mutable cache. Strength 0 and sufficiently
small strengths perform a VAE roundtrip and emit no fabricated denoising steps.
Progress counts actual selected scheduler callbacks, including second-order
schedulers, within the existing request ceiling.

Production displays a contextual denoising field. A standalone read-only Main
endpoint uses the existing CPU compositor, not a GPU qualification or viewport
screenshot. A canonical exact raster/bbox fingerprint excludes unrelated draft
edits. Coordinator/document/key checks and renderer request tokens reject stale
responses. This state is advisory: Generate still independently freezes and
verifies its input. Unknown CPU mode is explained rather than guessed.

## Invariants, refusals and parameter register

- Preserve queue IDs, status sequence, payloads, completion receipts, staging,
  document-scoped seed cursor, explicit Save and Undo/recovery boundaries.
- Retry copies the source attempt, including target PNG and strength; changing
  current layers or settings cannot rewrite it.
- Wrong alpha, mismatched strength/kind, missing capability, invalid raw input,
  partial target, changed resource or stale owner must fail visibly before an
  accepted result can be published. Failed advisory reads cannot dirty a Project.
- Migration is transactional; old txt2img rows and independent receipts survive.
  Interrupted inference retains normal canceled/failed job and recovery behavior.
- No new target/VRAM/file/transport ceilings: existing 2048-per-side, 4 MP,
  multiples-of-8, 200 steps, CFG 1–30, PNG 32 MiB and existing timeouts remain
  defensive protocol limits, not a tested image-quality or GPU-size promise.
  Strength's existing finite 0–1 domain is preserved. The finite mode source is
  the actual alpha classifier; scheduler coverage is the five qualified keys.

## Planned evidence

- Real SQLite migration/admission/read/Retry, Project draft/shadow/Save/reopen,
  accepted provenance and malformed neighboring inputs.
- Actual pinned tiny CPU VAE/denoising execution, replay and strength/source/CFG
  controls across the five scheduler windows; actual local NVIDIA checkpoint
  parser/loader/output smoke, separate from native renderer wiring.
- Built Electron control → IPC → frozen queue → controlled inference peer → Add
  → Save/reopen/comparison. Inspect normal/small screenshots and unavailable,
  invalid, transparent and opaque control states.
- Isolated semantic mutations at mode/strength/freeze/alpha/capability/portable
  storage and actual ML argument boundaries, then restored green baselines.
- Full applicable typecheck, lint, app and prototype regressions, pinned Python
  checks, build and format checks. Record executed results and remaining limits
  below before delivery; this section is a plan, not evidence of a run.

## Executed evidence

Artifacts:
`~/.codex/artifacts/imagegen-studio/img2img-2026-10-02/`.
The delivery manifest records final source/build/report hashes and commit. This
is implementation self-review with a separate focused backend review, not a
blind audit of the entire application.

| Boundary                      | Executed result                                                                                                                                                                                                                                                                 | Limit                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Full application tests        | `pnpm run app:test`: 854 passed, zero failed/skipped (`app-tests-verified.log`)                                                                                                                                                                                                 | Actual SQLite, files, CPU compositor and subprocess transport; ML responses in TS integration tests are controlled                         |
| Pinned Python ML suite        | 186 passed, zero skips (`python/full-pinned.log`); lightweight locked environment: 182 passed, four explicit ML dependency skips                                                                                                                                                | Temporary interpreter references the existing pinned local ML packages; not a release runtime install                                      |
| Actual tiny CPU ML            | Actual VAE/UNet/scheduler output, source/strength/replay/CFG Rescale controls and 100 timestep-boundary cases across all five qualified schedulers                                                                                                                              | Tiny initialized components establish adapter behavior, not production image quality                                                       |
| Actual NVIDIA checkpoint      | Six production parser/qualifier/loader/generate/output calls; source128×128, Steps4, seed42, epsilon, DPM++2M Karras; strength0 has no callbacks, 0.75 has three, 1 has four; 0.75 replay is pixel-identical, changed source/strength/rescale change pixels (`gpu/report.json`) | One local bismuthIllustrious_v80 checkpoint and RTX4080; no larger-target, all-checkpoint, CivitAI-lineage or v-pred-quality qualification |
| Native Electron wiring        | 32 checks, 41 screenshots, zero page errors (`native-verified/native-report.json`); explicit0.75 → frozen img2img request → edit draft0.25 → frozen Queue details → Add → Save/reopen/comparison; partial-alpha neighbor refuses Generate                                       | Built app/main/preload/SQLite/filesystem are real; controlled runtime peer replaces CUDA and generated pixels                              |
| Read-only target/draft owners | Focused104/104 without skips; real CPU children serialize newest target/comparison requests, cache ignores unrelated prompt edits, stale owners refuse; null/0/1 pass shadow Recover, Undo/Redo and portable Save                                                               | Advisory reads do not prove inference and never change admission, seed or document                                                         |
| Independent focused review    | No confirmed defect; real SQLite migration1/1 and retained bootstrap script preserve old completed row, independent receipt and document-scoped seed0 (`review/`)                                                                                                               | Reviewed backend material boundaries; no renderer/GPU flow or whole-codebase audit                                                         |
| Prototype regression          | `pnpm run prototype:test`: 167 passed (`prototype-tests.log`)                                                                                                                                                                                                                   | Mocks establish existing UI regression behavior, not production persistence                                                                |

Final full typecheck and lint, fresh app build, changed-file formatting and diff
checks passed. Python Ruff format/check and BasedPyright passed for production,
tests and the explicit GPU script. The same final build also passed the existing
read-only native comparison regression: seven checks, zero page errors
(`native-comparison/native-comparison-report.json`).

Native screenshots were actually opened at1380×900 and900×620. The label, compact
input and Reset fit the approved settings panel; comparison displays0.75 versus
0.25 within its scroll bounds; partial input leaves its refusal visible. No
layout defect was found in these inspected controls. This is not a full visual
or accessibility audit.

### Sensitivity and retained failures

**26 isolated semantic mutations were detected**, with original source restored
and green control runs: ten backend (freeze/zero, cross-field agreement, alpha,
capabilities, portable strength, operation and migration retention), eight Python
(actual source/strength/noise/cutoff/progress/CFG argument boundaries), eight
UI/target/shutdown (nullable draft, opacity fingerprint, comparison, newest and
late reads, disposal and shutdown barrier). Reports:
`backend/mutation-report.json`, `python/mutations.json`,
`ui/mutations/results.json` and `ui/mutations/extra-results.json`.

Executed review exposed a latest-tab read lost behind another CPU read; the
serialized owner now retains the latest waiting intent independently for target
and comparison. This was fixed before the verified native run and checked by
real-child tests plus semantic mutation.

Interim failures remain in artifacts: the first full application run had23
recovery tests whose old fixture labeled an opaque PNG as transparent txt2img,
plus a hard-coded migration count12. Fixtures now separate actual transparent
input from opaque output; production alpha checks and assertions were retained.
The migration check compares real installed SQL names with the bundled files.
The next parallel run passed853/854, with the existing tight subprocess-exit test
timing out while prototype browsers were active. Its focused18/18 control and a
quiet full854/854 rerun passed; no timeout or exit assertion was weakened.

The first native extension mistakenly retained the reopened Project's default
four transient iterations and released only one controlled job. Setting its
fixture count explicitly to1 fixed the harness; the verified run passed the same
production path. Initial style checks during unformatted owner edits failed;
the final checks use the frozen formatted tree. These failures are not counted
as successful evidence.

Release runtime installation/repair, Anima, LoRA, inpaint/outpaint, Smart Patch,
result-to-preset and remaining Advanced Options stay open. No public promise or
Phase2B/2C readiness is raised by this bounded mode extension.
