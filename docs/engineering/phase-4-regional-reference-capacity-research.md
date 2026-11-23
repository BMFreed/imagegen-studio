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

## Original PNG dimensions and near-limit byte capacity

Studio `59bf2d5aa2e426960614106f85c885e480376ffb`, InvokeAI
`4875d96531ca6712b288f6e660fcbb34143408c1`. The fresh source trace read
`invokeai/app/api/routers/images.py` and
`invokeai/app/services/image_files/image_files_disk.py` for original image
decode and storage. `invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts`
calls `addRegionalGuidance.ts`, which routes each original alongside its
owned mask. `invokeai/app/invocations/sd/ip_adapter.py` resolves the vision
model and `invokeai/app/invocations/sd/denoise_latents.py` consumes the decoded
RGB original before applying the associated mask. The exact Studio ceilings
belong to the existing Project import, package and Generate consumers.

The follow-up uses real RGB PNGs from a seeded generator. Main imports
them through the installed CPU worker, which produces canonical RGBA PNGs
and owned thumbnails. The three invalid originals have one isolated
dimension violation each. They are 16,385 × 1, 1 × 16,385, and 5,213 × 12,277.
The last image exceeds the area limit by exactly one pixel. The PNG content
and geometry were checked separately from the importer.

| Original | Dimensions | Normalized PNG bytes |
| --- | ---: | ---: |
| Valid replacement | 4,096 × 4,096 | 33,419,438 |
| Maximum-width original | 16,384 × 800 | 33,409,098 |
| Maximum-area original | 8,000 × 8,000 | 33,424,410 |
| Oversized normalized original | 4,096 × 4,096 | 33,688,472 |

The refused set contains three references and totals 100,521,980 bytes,
below the 96 MiB aggregate ceiling. Only the oversized original exceeds
32 MiB. The acceptable set replaces that original on the same owner,
preserves both neighboring references, and totals 100,252,946 bytes
(95.61 MiB). The earlier four-count control remains a separate profile.
The inherited `passes` and `riskBoundary` strings in the frozen Run R1
fixture described that earlier profile. The retained preregistration and
`fixture-metadata-correction.json` record the actual scope and preserve
the original fixture bytes.

The installed importer returned `IMAGE_TOO_LARGE` for all three geometry
controls. The same Project document, tab state, Undo/Redo availability,
saved package hash and scratch file hashes remained intact. The oversized
normalized PNG imported, saved and reopened. Main Generate refused it with
`GENERATION_INVALID_REQUEST` and the explicit byte-limit message before
capture, resource lookup, worker startup or queue admission. All application
tables and the owned staging trees matched the snapshot before refusal.

Replacing that one original admitted exactly one Current Canvas IMG job.
The signed worker consumed all three frozen original PNGs and masks and sent
16 progress receipts. The worker result and staged candidate matched exactly
at 146,920 bytes with SHA-256
`e0e50f427a7825e4e04b2de46d5b25223dcae31f44d99581071e77cdf0e68cb8`.
The fixture explicitly discarded the candidate. The saved Project, history
and accepted-result state remained intact.

The service finished in 128.832 seconds. Sampled worker VRAM peaked at
8,460 MiB across 35 samples. Group memory reached the 12 GiB cap. cgroup
recorded 1,408 `max` events, with zero swap and zero OOM events. The final
snapshot recorded 10,475,917,312 bytes of file cache and 314,675,200 bytes
of anonymous memory. These are final values and leave peak attribution
open. This establishes capacity for the exercised host and set, with
smaller hardware profiles and visual acceptance still open. The
[exact stored byte test](#exact-stored-png-byte-boundaries) covers the byte
endpoints separately.

All 79 focused tests passed, with zero failures or skips. Typecheck, scoped
ESLint and formatting checks, and `pnpm run app:build` passed.

An independent live audit verified eight input PNGs, exact RGB preservation
with opaque alpha and sRGB in the four normalized originals, six thumbnails,
all 32 ZIP entries, the closed SQLite and all three frozen queue originals.
It rehashed 12 source, 77 engine and 17 signed configuration pins and
confirmed physical exit. Checkpoint and auxiliary files matched their
verified inode identities. The audit made no additional GPU request.

Run `regional-reference-capacity/20261123-r1` retains the synthetic input
generator and exact seeds, row counts and file hashes, compact Project and
queue manifests, closed SQLite, mask and target bytes, the worker PNG and
reports. It released 558,219,264 allocated bytes from both temporary
directories and both generated `.igs` snapshots after verifying their
member digests. The large synthetic PNG and package bodies were disposed.
All 55 retained evidence files matched after cleanup.

## Exact stored PNG byte boundaries

InvokeAI source was rechecked at clean `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/app/api/routers/images.py` and
`invokeai/app/services/image_files/image_files_disk.py` decode the original.
`invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts`
calls `addRegionalGuidance.ts` to bind the image and its owner mask.
`invokeai/app/invocations/sd/ip_adapter.py` and
`invokeai/app/invocations/sd/denoise_latents.py` load the vision model and
consume the original pixels. Studio's existing 32/96 MiB stored-PNG
policy defines the acceptance boundary here.

The fixture first imports three 512×512 originals through the actual CPU
worker. It adopts five exact-length PNG variants through the real Project
edit and asset owners, with regular Save, close and reopen. Each variant
uses the corresponding canonical RGBA plane and sRGB ICC plus a private
`vpAg` chunk with valid CRC before `IEND`. The imported region, reference,
thumbnail and mask identities stay consistent between the two saved states.
This controls PNG file length at the package boundary. The earlier near-limit
run covers large decoded geometry and measured normalizer outputs.

| Saved state | First PNG | Second PNG | Third PNG | Total bytes |
| --- | ---: | ---: | ---: | ---: |
| One byte above the per-file limit | 33,554,433 | 33,554,431 | 33,554,432 | 100,663,296 |
| At both limits | 33,554,432 | 33,554,432 | 33,554,432 | 100,663,296 |

The first state isolates the per-file rule. A total strictly above 96 MiB
with at most three items entails an individual limit violation. The
`20261123-r2` attempt stopped at the shared test pin reader's 32 MiB
ceiling, before Main or worker startup. The corrected R3 test reader
admits exactly one additional byte for this profile's fixture input.
R3 reuses the five exact R2 PNGs and preserves the failed attempt receipt.

With Studio `77aa7dfef934be84c3bba492964d995959293eb8`, R3 reached the
Main byte-limit diagnostic before capture, resource lookup, worker startup
or queue admission. The saved `.igs`, live document and history, complete
database snapshot and owned staging directories matched before and after
the refusal. Main then accepted all three exact 32 MiB files and froze the
actual 100,663,296 bytes with their original owners and masks.

The signed installed worker completed one 512×512 IMG job with all 16
progress receipts. Its output and staged candidate were both 171,328 bytes
and matched the prior small-encoded control byte for byte, with SHA-256
`ca7bc143ba90707290a91ce4b91d31086ab914440379b532b3d7df01156aa`.
The candidate was explicitly discarded. The saved Project and the empty
accepted-result index and journal survived Generate.

Observed service runtime was 93.921 seconds. Peak worker VRAM was 8,460 MiB
across 34 samples. Peak cgroup memory reached its 12 GiB cap, with 785
`max` events, zero swap and zero OOM events. The exact byte endpoints pass
on this host. Hardware capacity at smaller limits, a combined maximum
decoded geometry and exact byte cohort, and broader visual acceptance
remain open. The production UI and shipping host matrix are separate checks.

The final checks ran 79 focused tests with zero failures or skips, full
typecheck and app build, and scoped formatting and lint. These are private
qualification results. Public promise statuses retain their existing scope.

The independent audit passed 451 assertions and a separate exact check of
the empty acceptance index and journal. It verified the five fixture PNGs,
all 32 entries from both saved ZIPs, the six thumbnails, closed SQLite and
the exact frozen queue originals. The comparison rehashed 12 source, 77
engine and 17 configuration pins, then verified the controller and both
recorded workers had physically exited. The audit used retained bytes and
made no new generation request.

Runs `20261123-r2` and `20261123-r3` retain the generator, exact fixture
descriptors and source seeds, the first preflight log, compact Project and
queue manifests, closed SQLite, mask and target bytes, result PNG and
reports. Cleanup reclaimed 648,089,600 allocated bytes from the synthetic
working data and both generated `.igs` snapshots. All 71 files sealed across
the two runs matched after cleanup.
