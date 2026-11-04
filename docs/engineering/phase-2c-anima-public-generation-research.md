# Phase 2c: public Anima Generate and portable accepted results

## Scope, revision and risk

Continue the authorized roadmap on `master`, base
`a264bc711d1f30153ba3e69e0b9b417e1efb631e`, 2026-10-05, after
[durable Anima jobs](./phase-2c-anima-durable-jobs-research.md).
Baseline `pnpm run app:test`: 1491 passed, zero failures, cancellations or skips.
Artifacts: `~/.codex/artifacts/imagegen-studio/anima-public-generation-2026-10-05/`.

This change opens public Project Generate for the existing original Anima bundle,
accepts verified temporary Anima candidates through the existing Add owner,
preserves their immutable native configuration in `.igs`, and compares it with
the current draft. Supporting promises are PP-004/005/007/008 in
[Product Promises](../product-promises.md); contracts are
[provenance](../features/project/generate-mode/generation-provenance.md),
[results](../features/project/generate-mode/generation-results.md),
[settings](../features/project/generate-mode/generation-settings.md) and
[frozen jobs](../features/queue-manager.md#frozen-job-rule).

Risk is high: persistent queue publication, document identity, irreversible
replacement cancellation, acceptance journal, shadow recovery and immutable
portable provenance cross multiple owners. No solver, Python protocol, runtime
installer, model architecture, Regional Guidance or preset behavior changes.
No new product decision was found in the source maps.

## Confirmed owners and selected design

- Project's existing public action controller captures the draft, bbox, local
  project key, document identity/revision and raster source before its first
  await. Select native preparation from that capture. Calling the internal
  ProjectService preparation after confirmation would capture a different
  Project and is rejected. Native preflight uses the existing grammar and flow
  compiler with seed 0 before composition; it does not draw Random or expand
  repeatedly after admission.
- RuntimeManager's existing preparation lease owns the one GPU process and
  optional CUDA-hidden CPU composition child. The native branch retains this
  lease and queue barrier, exact replacement review, close/document fences and
  post-publication cancellation. Queue `beforeCommit` executes inside its
  serialization/SQL transaction: do not reenter the queue or SQLite owner there.
  Full indexed identity/loss-set checks remain outside that callback; the callback
  checks synchronous captured tab/close identity and late changes cancel only the
  just-published batch through the established owner.
- Dispatch/staging already validate native frozen jobs, exact peers/resources,
  progress, PNGs and matching completion receipts. Completion owns the actual
  document-scoped seed cursor, including seed 0. Acceptance uses the candidate's
  verified frozen baseline; deleting today's model does not invalidate a stored
  image or rewrite its origin.
- Add builds and validates every selected layer and the complete prospective
  package before sibling cancellation, journal publication, shadow mutation or
  candidate cleanup. Keep this all-or-nothing owner for mixed-family selection.
  Undo removes the group; Redo restores the same baseline. Save remains explicit;
  recovery and previews retain their existing owners.
- Add strict portable v1 provenance kinds `anima-txt2img` and `anima-img2img`.
  Preserve legacy Illustrious shapes exactly. Native configuration records the
  checkpoint with null prediction type, original architecture, checkpoint byte
  size, exact Qwen3/VAE SHA+size with advisory local IDs, concrete raw weighted
  signs, requested steps/CFG/native method, actual seed and seed policy/behavior,
  img2img strength and the whole configured LoRA stack. Explicit neutral
  `cfgRescale=0` / `vaePrecision=Auto` remain distinguishable from absence.
  Exclude private paths, inactive SD pair, compiled spans/arrays, dynamic template
  and all regional data. No candidate contains trustworthy worker/backend version
  strings, so no such strings are fabricated.
- Portable schema version remains 1: the strict accepted union is additive.
  Historical Illustrious packages remain readable. Old application binaries
  cannot interpret a newly authored native provenance kind; no downgrade reader
  support is implied.
- Read-only comparison branches by the accepted family, preserves raw prompt
  semantics, native method, strength/seed zero and neutral absence. Bundle identity
  compares SHA+byte size+architecture, ignoring advisory local IDs. Missing or
  unsupported current inputs cannot appear as Same. Relink changes only current
  draft; accepted provenance never follows mutable catalog links.
- Installed catalog previously exposed only dependency failure strings. Add
  optional native companion identity metadata from the existing qualified
  installed rows/links and trusted profile. Its file status is the existing fast
  catalog check (stat plus installed hash metadata, or fingerprint-matched hash
  cache); it is not cold full-file tamper detection. Generate/dispatch still fully
  requalify bytes and structure. No new gigabyte hashing loop is added to listing.
- Renderer receives an optional advisory `animaSupported` flag, false when absent.
  Main returns it explicitly from the real ready peer. Native denoising follows
  native capability instead of the Illustrious flag. Retained unsupported SD
  settings have literal refusal messages and remain editable/resettable through
  existing draft controls; Save is not blocked by lack of inference support.

## Limits and realistic failures

All ceilings remain owned by the existing schemas/serializers: 32 jobs per
batch, 128 KiB frozen item, 64 KiB worker line, 8 MiB staging manifest, 64 selected
accepted candidates, 16 MiB actual escaped project JSON, 4 MiB manifest JSON,
10,000 archive entries, 32 GiB total uncompressed package, 32 MiB target/output
PNG, uint32 seed, native 1–200 steps/six methods, 64–2048 dimensions aligned to
8 and at most 4,000,000 pixels.
Capacity is measured through actual serializers and package preflight; no new
limit or claim that every simultaneous maximum fits is introduced.

| Trigger                                                                         | Observable invariant / evidence required                                                 |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Missing/altered companion, adapter or checkpoint                                | Refuse before inference; no invalid durable admission survives recheck                   |
| Unsupported embedding/VAE/CLIP Skip/nonneutral SD settings, unset native method | Literal native refusal before raster composition; no implicit SD fallback                |
| Bbox has mixed alpha                                                            | Refuse outpaint explicitly; opaque img2img requires authored strength, including valid 0 |
| Draft changes during await                                                      | Concrete batch remains the original click snapshot                                       |
| Document/index replacement or app close during admission                        | Refuse or cancel exact late batch; never operate on replacement document                 |
| Temporary results/loss set changes during confirmation                          | Re-review/refuse rather than silently discard new work                                   |
| Invalid second candidate or package overflow                                    | No sibling cancellation, journal, shadow edit or partial accepted layer                  |
| Acceptance interruption                                                         | Existing journal/shadow recovery resolves ownership without duplicate Add                |
| Save worker failure / unavailable runtime                                       | Existing placeholder preview path still saves the real accepted package                  |
| Missing catalog native metadata                                                 | Comparison gives Unavailable/Missing resource rather than false Same                     |
| Legacy `.igs` / mixed Illustrious+Anima Add                                     | Strict legacy preservation and one grouped history/Save baseline                         |

## Verification and evidence boundaries

Use actual shared parsers/compilers, SQLite migrations, ModelService installed
bindings, ProjectService capture, action controller, queue/orchestrator,
processor/staging receipts, acceptance journal, shadow owner and ZIP writer/loader
in focused tests. Tiny resource fixtures use an explicitly controlled trusted
qualification profile, and inference peers are controlled; those tests do not
prove trained model quality, CUDA execution or a downloadable release runtime.

Check all six methods and both pixel modes at the rule boundary, plus public
Generate snapshot/refusal/replacement/close and actual Add/Undo/Redo/recovery/Save
paths. Perform semantic mutations in isolated source copies: family dispatch,
capture identity, unsupported-control checks, immutable native provenance,
companion projection/comparison and renderer native capability selection.
Restore and confirm the unmodified controls after the campaigns.

Native Electron smoke exercises built renderer → preload/IPC/Main controls and
saved comparison, with screenshots at ordinary/compact sizes and console checks.
Its catalog-only resource bytes are not qualified models; a native Main refusal
for those bytes must remain. Public inference success is demonstrated at the real
owner integration boundary with the named controlled qualification/inference
collaborators, not by adding a production environment bypass.

This is source-aware implementation review, not a blind audit. Required final
checks: full app tests, typecheck, lint, build, full native smoke, actual screenshot
inspection and source/bundle-hashed artifact evidence. Prototype tests apply only
if prototype sources change. Update promise bodies and matrix rows together,
retaining release/GPU/preset gaps, then commit and push the completed slice.

## Delivered evidence and self-review

- Full `pnpm run app:test`: **1546/1546**, no failures, cancellations or skips.
  `pnpm run typecheck`, full lint, build, formatting and diff checks pass.
  No prototype source changed; prototype typecheck is included in typecheck.
- Actual focused admission/legacy/Retry owners: 126/126. Comparison/catalog
  neighbors: 108/108. Accepted schema/factory/storage owners: 34/34. These
  overlap the full suite; their counts are not added to 1546.
- Final isolated semantic campaigns detect **45/45** mutants: 10 admission,
  9 accepted provenance, 21 comparison/catalog and 5 renderer/wire. Restored
  controls pass and all 18 campaign source hashes match the delivered files.
  Production refusals in positive scenarios are counted only when they cross the
  intended real boundary, never for import, syntax, timeout or fixture setup errors.
- An initial whole-token dynamic-embedding control survived loss of
  `embeddingPool`: its raw template already activated every literal. A new
  valid saved `.igs` with a fragment-composed bound token exercises the actual
  loader → public controller → both concrete branches and detects that loss.
  The source family type guard preserves the entire normal preparation object.
  The initial survivor and new control remain in the admission evidence ledger.
- Actual capacity probe accepts/saves/reopens 1/32/64 candidates, with two
  32-item sessions for 64. Quote-heavy disabled metadata and both 8 KiB raw signs
  produce a 109,543-byte frozen item and 89,925-byte portable record. Actual
  `project.json` is 90,965 / 2,891,922 / 5,783,240 bytes respectively. A valid
  prior stress document plus 32 new records projects 17,585,550 bytes and refuses
  at the unchanged 16,777,216-byte ceiling before journal, cancellation, document
  mutation or session cleanup; all candidates remain available.
- All ten native smoke script scenarios were executed successfully against the
  same final build: Home/lifecycle, Results/acceptance, Generate/Queue, history,
  Illustrious and Anima comparison, VAE, embeddings, Anima authoring and native
  Queue details. Ordinary/compact comparison screenshots, focus, immutable saved
  bytes and current native-method updates were inspected. Page-error checks pass.
  The aggregate run first passed its eight earlier scenarios, then stopped on a
  newly invalid authoring fixture; the corrected authoring and remaining Queue
  script were run separately. The aggregate command itself is not reported green.
- That fixture had removed the baseline Illustrious img2img capability, which
  the current runtime qualifier requires. Restore the complete qualified peer.
  A named response probe suppresses only the legacy advisory field for the Anima
  tab while calling the genuine Main handler/qualification. The built renderer
  keeps native opaque strength editable, preserves 0 through IPC and Undo, and
  still refuses the retained external VAE before composition/queue/inference.
  This proves renderer routing, not support for an incompletely qualified worker.

No unresolved implementation finding remains in this source-aware review.
Public promises remain incomplete: numerical/trained-weight installed-runtime
qualification, presets/result-to-preset, Smart Patch, regions/outpaint and full
release acceptance are separate roadmap gates. The evidence root contains exact
commands, logs, source/bundle hashes, mutation reports, capacity measurements and
the final commit/push record; local tests do not imply remote CI execution.
