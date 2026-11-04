# External VAE resource and authoring checkpoint

## Scope and risk

Base: ImageGen Studio `a714e644ea2fce52800bee0756a7a285974f3cd4`, clean
`master`. This Phase 2C checkpoint implements a managed external VAE resource
and exact Project selection for Illustrious. It supports PP-004 and the
[managed library contract](../contracts/managed-model-library.md), together with
[Generation settings](../features/project/generate-mode/generation-settings.md).
Installation, exact resource resolution and `.igs` authoring are high risk.
External VAE inference, frozen worker inputs and accepted-result VAE provenance
are deliberately the following checkpoint; Generate must continue to refuse
an external VAE explicitly rather than ignore the selection.

## Confirmed baseline and reference

- CivitAI parses `VAE` as a resource type, but its family parser accepts only
  Illustrious/Anima labels. The repository explicitly rejects CivitAI VAE;
  current installed VAEs are pinned Anima dependencies.
- Project schema already stores nullable exact `generationDraft.vae`. No
  production selection, clear or portable relink command exists. Generic draft
  editing must not allow the renderer to supply trusted file paths or hashes.
- Normal preparation refuses external VAE and CLIP Skip before admission;
  embedded VAE precision already works in qualified worker 0.8.0.
- Invoke `9e1540962bcca7f8fa668d7d8e02cf79d75fda3b` connects selected VAE to
  decoding and img2img encoding. Its SDXL UI hides CLIP Skip, its SDXL graph
  uses both CLIP encoders without a skip node, and Anima uses Qwen3/T5 instead.
  Generic Diffusers/Invoke skip APIs have different hidden-state and pooled
  semantics; their existence does not qualify a new Illustrious control.
- Invoke also permits alternative Anima VAEs. Our present contract instead
  pins exact Qwen3/VAE companions. This checkpoint preserves that pairing;
  an alternative Anima VAE requires later ML compatibility qualification.

SDXL-architecture VAE resources are components applicable to Illustrious, not
standalone SDXL checkpoints. Preserve the source base-model label in registry
metadata; type-aware family mapping must not widen checkpoint or LoRA support.
Safetensors integrity and an API applicability label are installation evidence,
not proof of successful ML loading or of the VAE training/scaling semantics.
The exact `SDXL 1.0` and `Illustrious` spellings are also present in
[CivitAI's public source](https://github.com/civitai/civitai/blob/main/src/server/common/constants.ts),
checked 04.10.2026; this does not qualify all VAE architectures or scaling policies.

## Data path and invariants

```text
CivitAI VAE preview → existing install/repair transaction → verified managed bytes
→ registry exact version → main-owned resolution → typed Project command
→ undo/recovery shadow → explicit Save → .igs reopen
```

The Project sends resource/version IDs only. Main verifies resource kind,
applicability and exact managed bytes before copying registry metadata. Clear
restores the embedded VAE by storing null. Library Default changes never alter
an existing Project. Missing or changed files retain the saved name/version and
diagnostic. Portable relink checks the entire stable source/hash identity and
changes only local IDs; it never selects another version implicitly.

Late resolution must reject a closed/replaced/changed document. Commands obey
the existing admission/close gate and leave unrelated draft fields, seed cursor,
queue, staging and accepted provenance unchanged. Unsupported families stay
visible with a reason. Anima's pinned dependency cannot be selected as an
Illustrious external VAE. Installing or repairing does not authorize generation.

## Alternatives and verification plan

Do not forward a guessed `clip_skip` to Diffusers: our prebuilt Compel tensors
bypass its text encoder path. Do not infer SDXL VAE compatibility from four latent
channels alone: SD1 and SDXL can share shapes while requiring different scaling.
Do not unpin Anima companions just to reuse a generic selector.

Execute resource preview/install/repair/reverification tests through existing
filesystem/SQLite boundaries, typed Project selection/clear/relink through
Undo/shadow/Save/reopen, missing/tampered/late-response and neighboring checkpoint/
LoRA controls. Exercise production Electron IPC and native selector at normal
and compact viewports; inspect screenshots. Mutate significant guards in isolated
copies, restore green, then run required typecheck/lint/app checks. Report actual
counts, bundle freshness and the explicit inference gap below before commit.

## Execution evidence

Artifacts are retained under
`~/.codex/artifacts/imagegen-studio/external-vae-authoring-2026-10-04/`.
The delivery seal records changed source, scripts, compiled bundles and executed
commands. This is a scoped implementation/self-review, not a blind whole-product
audit.

- `pnpm run app:test`: **937 passed, 0 failed, 0 skipped**. Focused resource tests
  additionally executed 71 cases, and the entire model suite 122; Project VAE
  tests executed 12 real service/storage cases. These counts overlap the full
  suite and must not be added to it.
- Resource coverage enters the actual preview/install coordinator/downloader,
  managed filesystem and SQLite publication/repair/reopen. Transport responses
  and small model bytes are fixtures; no live CivitAI download or ML load is claimed.
  Unknown families, wrong kind/prediction type, missing/tampered bytes and exact
  portable mismatch/ambiguity fail without replacing the selected version.
- Project coverage executes actual Undo/Redo, recovery shadow, Save/reopen,
  reset, independent registry Default changes, portable relink and late
  select/relink after edit, Undo, newer selection or close/reopen. Tests first
  caught a genuine ABA defect: Undo restores an older `documentRevision`.
  Checking the existing monotonic `documentEpoch` fixes both new paths before
  even same-reference no-op. IPC uses main-owned resolution callbacks and the
  shared gate used by history/Save/Close; ordinary edits remain guarded by epoch.
- **30 isolated semantic mutations detected**: 9 resource guards, 15 Project
  guards and 6 picker/inference-warning guards. Baselines and restored runs are
  green; mutations remain outside the checkout. Reports retain source hashes
  and assertion failures, rather than counting setup/syntax errors as detections.
- Native `smoke-project-vae.mjs`: **10 checks, 10 PNGs, 9 viewport measurements,
  0 page errors** at 1380×900 and 900×620. Real compiled renderer/preload/main,
  registry, IDs-only IPC, history, explicit Save/reopen, Copy/Open/relink, exact
  Models focus and missing diagnostics are exercised. A controlled qualified
  JSONL peer supplies target composition only: explicit external-VAE Generate
  refusal leaves queue empty and sends no inference request.
- All initial native PNGs were opened and inspected against the local UI
  checklist. The compact dropdown opens above its trigger without clipping;
  names wrap in rich options, selected one-line text intentionally ellipsizes
  with full identity accessible in the dropdown/Models. Reset and relink remain
  reachable. The final native delivery rerun uses the updated gated main bundle;
  renderer/preload were unchanged. This is not a whole-app accessibility audit.
- Full typecheck, lint, build, scoped formatting and **339 local documentation
  targets** pass. Final `pnpm run app:smoke` completes all six native scripts,
  including 11 desktop scenario messages, Results/acceptance, Generate/Queue,
  14 accepted-history checks, 7 comparison checks and 10 VAE checks. Scripts
  that report page errors report zero. The delivery seal records the successful
  command and compiled bundle hashes.

The first full app run included a newly added invalid test fixture (checkpoint
in the VAE field); the existing schema correctly refused it before the intended
assertion. The corrected neighboring test uses valid Anima/null-family VAE refs;
its behavioral assertions were not weakened. The native harness also corrected
an invalid CivitAI Anima VAE fixture to a supported dependency and replaced a
nonexistent option-role locator with the actual rich option surface.

The broad desktop smoke additionally exposed an existing harness race, reproduced
on a freshly built isolated `a714e64`. Mouse-down hit the still-leaving `Move down`
dropdown, so drag never started. A pointer trace proves the interception; the
neighbor control waits for observable menu disappearance and passes all 11
desktop scenario messages. The checked-in repair adds that wait before bounding
boxes, preserving the real drag/order assertion and production DnD behavior.
Baseline/diagnostic/control logs and bundle hashes are in
`desktop-reorder-investigation/`.

An extra standalone comparison run overlapping the aggregate native run timed out
before its first check: its failure PNG shows Home after the earlier Project-open
assertions. The cause of that surface switch was not established. This failed
concurrent run is retained as `root/comparison-smoke.log`; it does not count as
passing comparison evidence. The final serial aggregate executes the unchanged
comparison script successfully (7 checks, 0 page errors).

## Remaining boundaries and recovery

External VAE structural/scaling qualification, native worker loading,
frozen request/Retry identity and immutable accepted VAE provenance remain the
next Phase 2C checkpoint. Anima inference/alternative VAE, embeddings and the
remaining pipeline modes are still open. CLIP Skip is not applicable to the
current two family pipelines; portable unsupported values remain explicit refusals.
No runtime version, queue operation/schema or accepted-result schema changed here.

On selection/relink failure the previous draft stays intact and main exposes a
diagnostic; repair/restore the exact resource or reset to Embedded. Interrupted
install follows the existing staging/repair lifecycle; interrupted authoring
follows document recovery. Explicit Save remains the portable snapshot boundary.
PP-004 matrix and body record this new evidence together, retaining **Пока не
обещать**; public promise readiness and Phase 2C completion are unchanged.
