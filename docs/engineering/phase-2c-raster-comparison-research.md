# Read-only Raster generation settings comparison

Base: clean `master` at `3f581fc`. Risk: high for immutable configuration, strict
IPC ownership and asynchronous document reads; this is a self-review of the
implementation, not a blind independent audit. This is a preparatory Phase 2C
slice of PP-005. Full pipelines/runtime and Smart Patch remain separate work. The existing
[supporting contract](../features/project/generate-mode/generation-provenance.md#compare-generation-settings)
defines the bounded layer-context popover, sections, statuses and negative scope.

## Owners and boundaries

- Renderer layer adapter supplies the comparison menu and popover state through
  the existing dumb entity surface. Imported/manual layers keep a disabled
  `No generation data` item. Read-only inspection is also available for locked
  generated layers; it does not select or change the layer.
- A narrow typed Main/preload read resolves the exact open Project/document and
  owning layer. Only cloned portable generation configuration crosses IPC, never
  layer/source/execution context, file paths, queue IDs or full provenance.
- The current side uses the current Project draft, including the renderer's
  optimistic draft overlay, the primary bbox size, live exact model catalog and
  document-scoped completed seed. No Prepare, random allocation, relink, recall,
  history seal, Apply, preset creation or document write belongs to this flow.
- Current model prediction type comes from the library override; the historical
  value remains frozen. Resource equality uses portable exact identity; presence
  requires a valid exact local binding. Names/default versions cannot stand in
  for missing files or an unlinked portable reference.
- Pixel-derived current mode reuses the existing CPU derivatives composition,
  frozen source-file lease and verified target PNG. Visible-layer count is not a
  mode classifier: content may be outside the bbox, transparent or partial.
  Unavailable/failed CPU composition preserves the configuration and reports the
  mode as `Unavailable`. It does not start an inference/GPU lease or queue job.
- Before and after asynchronous worker startup/file capture/composition, Main
  verifies the same coordinator, document ID/revision and monotonic document edit
  epoch. Undo can restore a revision (ABA); revision equality alone is insufficient.
  Renderer request tokens reject replies after close, context changes and newer
  target inputs. Current draft/library changes recompute the pure projection.
- The installed Naive follower does not expose cross-axis shift and does not
  guarantee containment when neither side of an anchor fits a tall body. Public
  `NPopover.x/y` keeps the horizontal anchor next to the menu and the vertical
  center at half the viewport height; resize/scroll updates the anchor. No private
  library props or scenario-specific CSS offsets are used.

## Completeness and limits

The source for recorded fields is the strict existing
`illustrious-txt2img` provenance schema. It records model, both prompts, actual
seed/requested policy, optional batch seed behavior, sampling and size. It does
not yet record LoRA, VAE, CFG Rescale, denoising strength, VAE precision or Clip Skip: these historical
values must be `Unavailable`, never fabricated defaults marked `Same`.
Missing optional legacy fields remain explicit. Regional Guidance, bbox position,
source mask/composition and execution identities are excluded from the settings
projection. Comparison does not compare two results or Smart Patch variants.

DTO bounds reuse portable document text/array ceilings and known generation
dimensions. No new arbitrary retention, timeout or generation cap is introduced.
CPU source/output limits and file verification remain owned by the existing
composition path. A missing release worker is a visible unavailable-mode state,
not a claim that packaged inference/runtime is implemented.

## Verification plan

Use real `.igs`, current coordinator/draft and immutable accepted configuration.
Verify the new public read, strict requested-document/layer response binding,
portable-only keys, and unchanged document/Undo/seed/shadow/index/saved package.
Control workers may inject delays/failures; actual CPU composition covers opaque,
outside-bbox and partial-alpha mode neighbors. Explicitly test edits, Undo ABA,
close/reopen and late replies. Execute isolated semantic mutations and restored
greens. Native RED must first witness a valid saved generated layer in the
previous delivered bundle before failing on the missing comparison entry point.

Native GREEN follows the production context-menu → preload → Main → comparison
projection → popover path. UI changes should recompute the current side while the
baseline remains frozen; opening/expanding/dismissing preserves Project state.
Inspect normal/compact, long text, unchanged, missing/unavailable and disabled
states using actual screenshots. Prototype DI mocks exercise the same component
without claiming storage or worker evidence. Record exact source, helper and
compiled bundle identities; run required checks before commit/push.

## Evidence

Checked dirty delivery tree on 02.10.2026 against the base above. Public promise
statuses remain unchanged: this comparison supports the current Raster provenance
format, not the full model/preset/Smart Patch MVP.

| Boundary                | Executed evidence                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend/schema          | 69/69 real service/schema tests. Portable-only baseline; unavailable worker; immutable document/Undo/shadow/index/`.igs`/seed; exact owners; delayed worker startup; edit, Undo ABA, close/reopen; real CPU outside-bbox/opaque/partial-alpha neighbors.                                                                                                                                                                                  |
| Pure projection         | 13/13 tests: exact portable identities versus local availability, visible CivitAI IDs, current library prediction override, both prompts/embedding refs, seed zero/Reuse/random, original bbox size, unknown legacy fields and family-aware resolved scheduler. Anima receives no invented Illustrious resolved scheduler.                                                                                                                |
| Full application tests  | `pnpm run app:test`: 813 passed, 0 failed/cancelled/skipped/todo.                                                                                                                                                                                                                                                                                                                                                                         |
| Full UI suite           | `pnpm run prototype:test`: 167 passed; the 6 focused comparison checks use the production row/popover/projection with DI mock data. Whole dialog bounds, wrapping and reachable footer are checked; all page errors and Vue warnings fail these focused tests. Only the exact unrelated missing `favicon.ico` transport error is excluded.                                                                                                |
| Native old-bundle RED   | Final harness against retained delivered `3f581fc` dist first opens a real saved generated/locked layer and imported neighbor; failure is specifically `RASTER_COMPARISON_ENTRYPOINT_MISSING`, with 0 renderer page errors. It checks absent action text independently of new menu ARIA.                                                                                                                                                  |
| Native production GREEN | `pnpm exec tsx scripts/smoke-generation-comparison.mjs`: 7 checks, 0 page errors. Actual Home/Open → layer menu → preload/Main → real CPU composition → comparison UI; library v-pred versus saved epsilon, 8×8 comparison size despite the current 16×16 layer asset, seed 0, imported disabled neighbor, normal/900×620 containment, Close/Escape focus, real Steps edit versus immutable saved baseline and unchanged Project/package. |
| Late response/preload   | The native harness holds a genuine completed Main read, closes/reopens the same layer and releases the old response after the new one. A witnessed Main delivery and subsequent actual IPC read are the barrier, not a fixed sleep. Separate corrupt document/layer/private-field response controls are rejected by the actual preload, then the real handler is restored.                                                                |
| Semantic mutations      | 16/16 killed in isolated copies: 5 backend, 10 projection and 1 compiled renderer. The renderer mutant removes the older-request guard and demonstrably replaces current `img2img` with stale `outpaint`; its preceding 5 native checks pass and it has 0 page errors. Restored controls: 69/69 backend, 13/13 projection, 7/7 native. Root sources remain unchanged by mutation runs.                                                    |
| Static/build            | `pnpm run typecheck`, `pnpm run lint`, `pnpm run app:build`, `pnpm run prototype:build`, changed-file Prettier and `git diff --check` pass. Local file targets in changed documentation were checked.                                                                                                                                                                                                                                     |

Native smoke is registered as `pnpm run app:smoke:comparison` and included in the
aggregate `app:smoke`. Reports capture SHA-256 of the canonical native helper,
fixture sources and compiled Main/preload/renderer/migrations. Local evidence:

- `/home/user/.codex/artifacts/imagegen-studio/raster-settings-comparison-2026-10-02/`:
  backend mutations, retained old bundle, native RED/GREEN, isolated compiled UI
  mutation and restored native control;
- `/home/user/.codex/artifacts/imagegen-studio/generation-settings-comparison-2026-10-02/projection/`:
  exact final projection/test identities, 10 mutant logs and restored control;
- `docs/prototype-app/screenshots/generation-comparison-{1440,900,missing,error}.png`:
  locally generated, ignored screenshots inspected by the projection agent; root
  also opened native compact and dirty-current screenshots. They show full header,
  Close and footer without clipping. These are local artifacts, not committed PNGs.

Visual review caught defects that the first checks missed: whole-row anchoring
clipped the left edge at 900 px, nesting a fragment-root dropdown as a trigger
produced Vue/follower errors, and tall/asynchronously growing content overflowed
vertically. The final tests retain stronger viewport/error assertions; public
manual positioning and a real native menu anchor resolve those cases. Prototype
`Record` accesses in the newly imported shared graph were changed mechanically
to brackets for its existing strict TS options; those options were not weakened.

Inference is not part of this verification. Canonical fixtures create real
`.igs`/SQLite state and PNGs; catalog checkpoint bytes are intentionally dummy
input proving resource identity only. CPU composition uses the source-checkout
image worker. Release runtime, full Illustrious/Anima pipelines, complete recorded
advanced options, Smart Patch and result-to-preset remain open. Failed mode
composition stays explicitly `Unavailable`; rejected owner/edit reads show a
notice and the user can reopen the comparison.
