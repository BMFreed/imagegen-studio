# Public selected-VAE regional img2img

Base: `e1a9f10118cf01b36efe79809d01624d8e279c44`.
This slice connects the existing prepared-VAE IMG consumer to public
Generate and frozen Retry. No new encoder, scheduler, protocol field,
persistence schema or setting default is introduced.

## InvokeAI source and adaptation

Current local InvokeAI: `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`.
`invokeai/frontend/webv2/src/features/generation/core/graph.ts` selects the
compatible VAE; `core/canvas/compileCanvasGraph.ts::graftImageToImage` connects
that source to the encoder, with `addEncodeNode` forwarding precision.
`invokeai/app/invocations/model.py` owns exact model selection.
`vae/image_to_latents.py` casts the source to VAE dtype, calls native
encode/posterior, scales in that dtype, then converts the latent.
`vae/latents_to_image.py` casts before inverse scaling and original decode.
The existing queue owner is
`invokeai/app/services/session_queue/session_queue_default.py`.

Studio reuses the already qualified prepared-VAE adaptation and existing
exact-resource/frozen-queue owners. The deterministic independent frozen CPU
posterior-generator clone and borrowed-state restrictions remain Studio
adaptations documented in the [private prerequisite](./phase-4-regional-guidance-img2img-vae-research.md).
There is no claim of whole-Invoke byte parity or a replacement image factory.

## Finite admission and ownership

The new `illustrious-regional-img2img-vae-v1` capability is a combination:
base regional IMG plus regional VAE plus this explicit IMG/VAE capability.
It is required only for actual/frozen IMG with a selected VAE or effective
precision other than FP16. Embedded FP16 keeps its existing route and old-peer
support. TXT capability and TXT initialization remain independent.

A selected VAE under Auto/FP16/FP32, or Embedded Auto/FP32, uses the existing
prepared IMG profiles for
Euler Normal, Euler a Normal and DPM++ 2M Normal/Karras. Sampler, CFG-rescale,
strength, geometry, text, resource and attention limits remain unchanged.
Actual target mode is classified before the combination check, which precedes
resource preparation, transport files and SQL admission. Client and processor
repeat the gate before dispatch scratch. Partial-alpha and unsupported families
retain their existing refusals.

Existing FrozenGenerationVae ownership freezes exact saved reference,
managed path, size, digest and precision. Real ModelService verification and
frozen Retry re-verification remain authoritative; current authoring and a
changed Default cannot replace the saved version. No VAE fields are added to
Regional Guidance provenance: accepted ordinary IMG settings retain their
existing VAE/precision metadata.

## Qualification boundary

Planned checks cover complete Main Generate/frozen Retry, old-peer refusal
before work, exact-resource changes before Retry SQL, all prepared sampler
routes and Auto/manual precision, plus unchanged Embedded FP16 controls.
The installed profile is `installed-regional-invoke-img2img-vae-v1` using
the existing canonical runtime/catalog and exact native VAE A while Default B
is selected in the catalog. Generate/Cancel followed by saved Embedded FP16
authoring and frozen Retry must consume the original A/FP32 request, then pass
Results/Add/Undo/Redo/Save/reopen and exact independent PNG replay.

Evidence root: artifact-relative
`runs/regional-guidance-public-img2img-vae/20261107-selected-precision`.
Lower units retain 3GiB/zero swap/600 seconds; the installed launcher uses
2GiB with the established aggregate native 12GiB watchdog. These are execution
envelopes, not capacity promises. No runtime/model copy or dependency install
is planned. Executed results, source review and physical release are recorded
separately below when available.

PP-001/005/007/008 remain **«Пока не обещать»**. This slice does not qualify
Anima regional execution, soft-alpha/inpainting/outpainting, visual quality,
release readiness or arbitrary models and options. Frozen work stays independent
of authoring; Regional Guidance remains excluded from accepted provenance,
Compare and result-derived presets.


## Executed qualification

ROOT records **582 Main PASS,223 Python PASS/92 dependency warnings,196 browser
PASS**, with zero failures/errors/skips in the accepted fresh runs. The Python
set is178 worker/protocol cases plus45 existing native prepared-IMG cases,
partitioned16/15/14 without overlap. The full browser set includes both new
cases; a separate14-case diagnostic rerun is not added to its unique total.
TypeScript/Vue and final strict Python typechecks pass; Python reports0 errors/
0 warnings. Build, scoped Ruff/format and three bounded ESLint partitions pass.

The first Main run has581 PASS and one obsolete Auto/Auto refusal expectation.
It now tests logical Auto versus worker FP16 disagreement. The first full browser
run has194 PASS and two fixture failures: the old FP32-ban message and a selected
VAE reference without a corresponding mock catalog entry. The exact installed
version guard correctly refused that fixture. The corrected test supplies a
coherent distinct VAE record/reference; production validation stays intact.
A combined-project ESLint invocation reaches its JavaScript heap limit; fresh
partitions pass under the unchanged3GiB unit ceiling. These attempts are retained
as diagnostics, not accepted semantic REDs.

Independent source review is CLEAN across1517 baseline/1518 qualification files
and24 deltas. A fresh R2-to-R3 review verifies the single browser-fixture-only
correction; production bytes are unchanged. The controlled replay helper also
has an independent CLEAN source-only review. Reviewers did not run native code
or adopt ROOT execution as independently measured runtime evidence.

The isolated capability mutation has **six selections:five GREEN/one semantic
RED**. Omitting the new IMG/VAE proof allows the unsupported peer through the
actual-mode admission test; the Embedded FP16 neighbor stays GREEN. Exact
restoration returns both GREEN and verifies all1518 source-copy/live files at
that phase. This is admission sensitivity, not a native-pixel mutation.

## Installed Generate, frozen Retry and accepted result

The unchanged canonical environment is refreshed in place to current worker0.14
source; actual Ready includes all three IMG/VAE prerequisites and exits cleanly.
No environment/model is copied or dependency installed. The existing locked
native test environment and installed environment have matching torch,
torchvision, diffusers, transformers, Compel, safetensors and Pillow versions.
This is developer qualification setup, not release Install/Repair acceptance.

Installed native-r1 passes **19 checks in302.021s** (303.270s bounded). It uses
actual renderer/IPC, default RuntimeManager and the official Illustrious v0.1
checkpoint with the existing full native VAE A while catalog Default is B.
Real picker reset/reselection and Auto-to-FP32 changes precede generation.
The fixture uses512x512 at world origin(-13,5), opaque imported pixels, Euler/
Normal, Main false-ZTSNR/leading,30 requested steps, strength.5, CFG5 and
rescale.7. Its original selected window has16 steps.

Three numerical requests comprise an independent healthy control, Generate/
Cancel and frozen Retry, producing two healthy PNGs. Cancel invalidates scalar
progress before child exit. Saved later authoring selects Embedded FP16,
rescale.2, steps2, seed124, strength.8, changed source opacity/text and disabled
regions. Retry still consumes the original exact A/FP32, seed123, strength.5,
policy and rescale.7 on every wire. It restarts at1 and completes16 selected
steps. Partial alpha refuses before SQL/inference. Real Results/preview,
explicit Raster Add, Undo/Redo, four Saves and independent ZIP/reopen checks
preserve exact output and ordinary IMG VAE/precision provenance. Regional
operational fields remain excluded. The healthy control is explicitly discarded
through normal UI before shutdown; prior SQL/packages/history/candidates and
resource/runtime/config/source bytes remain protected.

ROOT opens six full installed screenshots under ui-audit and records no new
material local layout finding in the named Generate/Queue/Results/reopen states.
This is bounded self-review; popup legibility, general accessibility and generated
image quality are not certified by those screenshots.

## Controlled installed-client resource consumption

Two additional read-only backend requests finish in56.541s bounded. The existing
ModelService independently verifies both exact A/B descriptors before the SQL
baseline. The complete genuine frozen Main input is reused as explicitly
controlled numerical copies: only the selected descriptor and fresh protocol
nonces differ. Actual default client/capture/worker owners execute both; there
are no queue admissions, candidate receipts, project/default edits or SQL changes.

A/FP32 reproduces **every decoded RGBA channel** of both UI candidate and healthy
control. B/FP32 changes **785915 RGB channels/262110 pixels**. B is an authored
native decoder-bias control; this is finite VAE-resource influence, not isolated
encoder causality, improved images or new trained-loading lineage. Existing
private native tests remain the encode/scale/cast and failure-preservation
oracles. All original inputs, packages, resources, source/config/wheel state and
physical exit are checked. No replacement loop, offload, fallback or repair of
borrowed state is introduced.

## Retention and release

All1692 owned payload entries are retained in the verified archive:1586 regular
files,105 directories and one unfollowed source node_modules symlink. Independent
retained-byte/dependency audit is CLEAN: archive/live metadata and byte streams,
source/mutation restoration, independently decoded PNG contrast, three IGS
packages, immutable SQLite integrity/FK and all22 migration hashes reconcile.
Five protected frozen-input files,17 offline configs, seven Invoke primary pins
and reciprocal dependencies remain available. One copied collector scope label
is corrected to the actual Euler/Normal IMG/VAE run without payload changes.

ROOT's fresh release checks cover20 ended bounded units,46 distinct ended native
identities, empty recorded cgroups, current same-user cwd/fds and256 lifecycle
records with zero blocking incoming dependencies. All seven author/source/data
readers have ended. A read-only release preflight initially rejects a stale case
status label; the helper now requires the actual mechanical-pass status plus
confirmed physical exit. No deletion occurs on that refused preflight.

Only the exact own payloads tree is disposed, reclaiming **51605504 allocated
bytes** during a deletion-only interval. The20,145,830-byte archive is retained
with SHA-256 `5c114322909efa625250e7b595b9126f81a9255fa50d9738c9996dd4da5de06e`.
Lifecycle is retained with payloads empty. Canonical runtime/catalog, current
qualification companion, exact checkpoint, VAE A/B and durable input/project/
autosave data stay protected. Historical compact evidence remains an explicit
soft-budget exception; there is no model/runtime duplicate or global sweep.
Audits certify retained data within their scope, not independent runtime or
physical-deletion outcomes; those remain ROOT observations. Final source/docs
bookkeeping review is separate from the historical release gate.
