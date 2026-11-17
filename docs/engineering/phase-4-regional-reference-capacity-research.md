# Illustrious Current Canvas reference capacity

Studio base `b7220e3d1767b4a5cf93325b7945652b706ae066`. The
[signed installed engine](./phase-5-packaged-installed-engine-research.md)
and [one-reference IMG pilot](./phase-4-reference-img-utility-research.md)
provide exact installed inputs. This experiment checks the joint processing
size and reference count boundary, and the next count at the actual Main
Generate entry. It does not revisit the previous color quality gate.

## Fresh donor and product owners

Re-read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/frontend/webv2/src/workbench/widgets/layers/layerOps.ts` assigns
reference identity to the owning layer.
`invokeai/frontend/webv2/src/workbench/widgets/canvas/invoke/prepareCanvasInvocation.ts`
prepares the source and layer inputs. The matching
`invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts`
grafts the IMG source and hands the owned reference list to
`invokeai/frontend/webv2/src/features/generation/core/canvas/addRegionalGuidance.ts`.
Each original, owned alpha mask and adapter setting reaches a separate
IP-Adapter graph node. `invokeai/app/invocations/sd/ip_adapter.py`
resolves the ViT-H image encoder for the checkpoint. In
`invokeai/app/invocations/sd/denoise_latents.py`, `prep_ip_adapter_image_prompts` encodes
each image before acquiring the large model and `prep_ip_adapter_data` binds
its mask, signed embeddings and step window.
`invokeai/backend/stable_diffusion/diffusion/shared_invokeai_diffusion.py`
consumes the aligned lists.
`invokeai/backend/stable_diffusion/diffusion/unet_attention_patcher.py` scopes
their attention processors. Studio uses the previously qualified adaptation
and resource group.

Project authoring allows four separately owned originals. The three-image
limit is an operational Generate predicate in `regional-invoke-generation.ts`.
`ProjectGenerationActionController.generateInvokeUnlocked` reports
`GENERATION_INVALID_REQUEST` before opening the preparation or enqueue path.
Reapply the same fixed request with three images after deleting the fourth
through the actual Project service. The headless Main test drives the real
controller, regional coordinator, model resolution, queue, dispatcher and
staging, and uses the real signed installed CPU and CUDA worker clients. The
auxiliary resolver reads the pinned adapter/ViT-H group from its protected
shared directory. The retained AppImage's canonical slot has only LaMa in
that group, so the public renderer path is outside this particular test.

## Fixed positive and adjacent refusal

One 512×512 opaque IMG target with official Illustrious XL v0.1 epsilon
(`3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9`).
Three enabled image-only regions have independent masks in the x ranges
`[0,128)`, `[128,320)`, `[320,512)`. The boundaries align at the reference
mask pyramid scales. Three distinct pinned 512px PNGs occupy one owner each;
the historical red, blue and neutral inputs total 14,750 raw bytes before
import normalization. The fourth PNG is a separately authored asset of the
first owner. The two snapshots differ by removal of that asset entry and
its legitimate Project revision, with all generation settings held fixed.

Use one static seed-123 item, Euler/Normal 30, strength 0.5, CFG 5, Rescale 0,
embedded FP16 VAE, no LoRA or TI. The expected IMG progress window is 16 native
evaluations. First save and reopen the four-reference Project. Snapshot
its package, live document/history and durable work state, then call Generate
and require the exact count refusal. Next remove the fourth via the normal
authoring owner, save/reopen and require one actual completed queue job with an
owned staging result and no implicit Project Add or Save.

Run with one inherited 12 GiB cgroup, zero swap and a 600 s deadline. Record
file-cache-inclusive memory and one-second sampled CUDA memory attributed to
the actual worker. This checks the representative maximum count/canvas case on
one host. The byte and original-dimension limits and other hardware profiles
remain separate measurements.

## Executed qualification

- Four images returned `GENERATION_INVALID_REQUEST` with the exact diagnostic
  “Regional reference images support at most 3 images across enabled regions
  per generation.” The call never captured the source, entered admission,
  prepared model resources, called the worker or published work. The Project
  document, undo/redo, tab and revision, saved `.igs` bytes, all 24 application
  tables and owned scratch/recovery trees matched before and after the call.
- Three images produced one admitted item, one completed SQLite queue row and
  one staged candidate, with 16 worker progress events. The candidate's
  171,328 PNG bytes match the retained worker output, with SHA-256
  `ca7bc143ba90707290a91ce4b91d31086ab914440379b532b3fb3d7df01156aa`.
  The fixture discarded it explicitly after readback. The saved Project
  stayed byte-identical, and the accepted-result index and journal stayed
  empty. The two reopened packages were also checked as ZIP and image bodies.
  The source and reference assets preserve exact decoded RGBA and ICC data.
- The RTX 4080 used driver `615.71.09`. The service finished in 114.956 s,
  including fixture authoring and model loading. Its RAM peak was
  10,199,232,512 bytes (9.50 GiB) with file cache included, zero swap and no
  OOM. Worker VRAM reached 8,852 MiB in 55 positive one-second samples. The
  readback checked SQLite integrity and foreign keys, and confirmed the
  exact CPU and CUDA worker processes exited. All 77 installed engine pins
  and 17 signed configuration pins matched before and after the run.

This qualifies the combined three-reference and 512×512 IMG case on the
measured host. The visual pilots, larger original-image byte and dimension
limits, clean Setup/Repair and the wider hardware matrix remain separate
acceptance work. All eight public promise statuses stay **«Пока не обещать»**.

## Verification and retained evidence

The eight focused application test files completed with 120 PASS, zero
failures and zero skips. Full `pnpm run typecheck` and `pnpm run app:build`
passed. Vite reported a chunk-size warning. The new qualification sources
passed scoped ESLint and formatting checks.

Evidence is under
`~/.codex/artifacts/imagegen-studio/runs/regional-reference-capacity/20261118-r1`.
`native-report.json` records the Main and worker receipts. The `.igs` pair,
worker and candidate PNGs, database/image readback and original check logs
are retained there. The run reuses the exact signed installed engine, protected
adapter/ViT-H group and model files in place.

An independent read-only audit checked both packages, the exact refusal and
queue result, the native image bytes, the closed SQLite database, the source
and installed engine/configuration pins and the recorded process and memory
bounds. It matched the large weight file identities by metadata. The
30-entry payload archive was verified entry by entry before disposing of the
two owned temporary directories. Net allocated space reclaimed was
12,824,576 bytes. `retention.json` records the archive digest and exact paths.
