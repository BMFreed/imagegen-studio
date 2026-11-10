# Illustrious regional references in Current Canvas IMG/OUT

Base `aac4b9f72d4118f58d3033d47ef5d65aa905b4b3`. High risk: source-conditioned
native inference, exact operational profile/capability, frozen queue and Retry.
This extends the [first TXT consumer](./phase-4-regional-reference-inference-research.md)
without recreating reference authoring/storage or its adapter/vision resource pair.
PP-001/005/007/008 remain **«Пока не обещать»**.

## Fresh source and intended boundary

Clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1` reread before design:

- `invokeai/frontend/webv2/src/workbench/widgets/canvas/invoke/prepareCanvasInvocation.ts::resolveRegionalReferenceImages`;
- `invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts::graftImageToImage`,
  `graftOutpaint` and their callers at1088–1145;
- `invokeai/frontend/webv2/src/features/generation/core/canvas/addRegionalGuidance.ts`;
- `invokeai/app/invocations/sd/denoise_latents.py::parse_ip_adapter_field`,
  `prep_ip_adapter_image_prompts`, `prep_ip_adapter_data` and actual denoise callers;
- `invokeai/backend/stable_diffusion/extensions/ip_adapter.py`.

Confirmed source: IMG adds source→VAE latents and strength; OUT adds infill,
alpha-derived mask and existing mask tail. Both then graft the same ordered,
mask-owned reference collector onto the existing denoiser. Reference preparation
precedes UNet acquisition, and the full/all-step term follows the actual selected
denoising window. No new sampler, classifier, attention owner or resource loader
is needed. The existing output owner's IMG wrapper must forward optional
references, as its internal consumer already does.

The finite continuation adds independent `illustrious-regional-reference-img2img-v1`
and `illustrious-regional-reference-outpaint-v1` grants, with corresponding
`invoke-illustrious-regional-reference-{img2img,outpaint}-v1` frozen profiles.
The original TXT literal and its meaning remain unchanged. Actual composed
target mode selects the exact grant/profile; a regional mask cannot select it.
Retry selects by frozen operation/profile, never the current edited Project.
Metadata, captured bundle and actual worker command must agree on the mode.

## Preserved limits and ownership

Keep EPS, Euler/Normal, false/leading noise, CFG(1,30], steps1–200, embedded FP16
VAE, processing64–512 divisible8, one static item, existing source/OUT limits,
at most three enabled regions and three original references. Per-PNG32MiB and
aggregate96MiB budgets, original import dimensions/pixels, exact offline
adapter/vision group, capture/attention/text budgets retain their existing owners.
These are work guards, not measured capacity claims. No LoRA, active TI, selected
VAE, new objective/method, batch/dynamic prompts, Smart or Anima references.
Anima references, inverse auto-negative and generic adapters remain exclusions.

Original reference PNGs retain owner/order/ID/hash/dimensions, including duplicate
images and empty/outside masks. Reference alpha>0 masks remain distinct from OUT
source alpha, KEEP and contribution. Existing source preparation, posterior RNG,
strength window, denoising, source-over output and sRGB publication stay in their
existing owners. Strength zero is a no-denoising control, not an image influence
promise. Regional state remains live-Project-only; no accepted provenance,
Compare or result-preset fields. Generate/Retry never implicitly Add or Save.

## Verification plan and current unknowns

Check real Main Generate→coherent capture→SQLite/frozen dispatch for IMG/OUT;
wrong/missing exact peer grants and mismatched profiles refuse before admission
or dispatch. Frozen Retry must retain original source/reference bytes after live
edits/removal. Neighbor empty-reference IMG/OUT must not require the new grants.
Use existing tiny native CPU consumers for source/reference A/B, zero/no-reference
controls, OUT protected pixels, strength zero and post-PNG semantic mutation with
neighbor GREEN and exact restoration. Then qualify the refreshed installed worker
through existing built-app harness, explicit Add/history/Save/reopen, native
Cancel, restarted exact Retry and normal physical process exit.

Visual usefulness is separately assessed with fixed official Illustrious XLv0.1
controls. Pixel inequality and deterministic replay cannot close that gap; no
production default is changed for an attractive example. Maximum admitted counts,
NoobAI/Smart/resource combinations and packaged release acceptance remain open.

Initial inventory: artifact root about29GiB, filesystem64GiB free; RTX4080
16376MiB total/14124MiB free. Reuse the protected runtime/catalog/checkpoint and
reference pair; do not copy weights or environment. Root serializes heavy runs:
checks≤4GiB; app launcher≤2GiB/native≤10GiB/aggregate≤12GiB, zero swap,
600s per phase. No allocator fraction is enforced or claimed. Retain and audit
owned payloads before exact cleanup; SHARED and its reciprocal dependencies stay.
Evidence, execution outcomes and remaining limitations will be appended after
actual checks; this plan is not runtime evidence.

## Fresh visual inspection of the previous TXT cohort

Reconstructed four original PNGs from the audited previous archive into the new
run's `visual-baseline`, matching every selected member's size/SHA against its
retained inventory. ROOT viewed both calibration cards and both original output
PNGs. This is new inspection of old bytes, not new inference or independent
human acceptance. The cards differ only in red/blue body color. Both outputs
show repeated, fragmented apple/vessel-like shapes and high-contrast artifacts
instead of a coherent two-object still life. Visual status remains
**NOT_QUALIFIED**. The six-step512 transport cohort has competing cat-card and
still-life inputs and lacks authored no-reference/zero-mask installed controls;
it cannot isolate an adapter defect or close useful reference conditioning.
No production default was changed. A meaningful preregistered utility cohort
with ordinary/no-reference/zero-mask controls remains necessary.

## Lower verification checkpoint

ROOT executed324 affected/neighbor Main/shared/Retry cases, all PASS. Bounded peer
review found that the existing accepted-base projection removed operational
`referenceProfile` only in TXT. A real public-flow regression reproduced10 GREEN
and two IMG/OUT RED cases; both image branches now remove it. The36-case
post-fix public/frozen set passes and overlaps the324, rather than adding36
distinct cases. The current provenance builder already selects context fields
explicitly; no persisted `.igs`/preset leak was observed or claimed. Fresh Invoke
`graph.ts::addReferenceImageMetadata` and its canvas callers were reread for this
adaptation: Studio's existing projection retains its stricter product exclusion.

ROOT executed57 reference/native-mode,102 output/worker and71 denoising Python
cases:230 distinct PASS, no skips. Native tiny CPU models retain actual vision,
dual CLIP, VAE encode/sample, UNet/Euler and PNG publication. Model loading,
CUDA-to-tiny-CPU dispatch and trained LaMa are explicit collaborators, so these
checks do not establish installed/trained execution. The first attempt had a
ROOT basetemp-parent setup error; the second reached a remaining TXT-only
denoising guard (52 PASS/five FAIL). Both are retained separately. The existing
denoising owner now admits only its exact EPS Euler IMG/OUT profiles alongside
unchanged TXT. No new loop or sampling policy was introduced.

Isolated copied-source mutation executes16 selections:13 GREEN/three intended
post-PNG semantic RED,40 PNG witnesses. Suppressing the image residual fails both
image causal oracles; dropping IMG wrapper forwarding fails only IMG. Authored
no-reference/zero-mask image neighbors stay GREEN. Both original PNGs are read
before each intended RGB assertion. The entire1639-file repository map stays
unchanged during the campaign; both mutated copied sources restore exactly.
This is CPU execution, not installed mutation or visual acceptance.

Full Python typing passes with zero errors/warnings after test-only explicit
type narrowing; its initial eight test typing errors remain recorded. TS/Vue
typecheck passes after production/projection and browser-test changes. All274
browser cases pass with exactly two workers. Full lint passes with only the two
unchanged baseline parser exclusions (`qualify-installed-regional-init.mts` and
`qualify-regional-character-visual.mts`). Its initial17 field-order/case-brace
findings were fixed before the final build. Later harness-only synchronization/
inventory fixes pass scoped ESLint. Final production build is `app-build-r2`;
all five exact members were retained before installed execution.

Old empty-reference and TXT jobs retain their existing literals and behavior.
Older workers lacking either new independent grant fail closed at admission,
frozen Retry and actual-client dispatch. No database/portable schema migration
or automatic queue replacement is added. Missing/changed original images or
auxiliary resources retain the original job and surface existing diagnostics;
the offline worker never downloads replacements. Packaged version rollback and
joint protocol/recovery acceptance remain release gaps.

## Installed execution

Reuse the existing noneditable0.14.0 environment and exact offline reference
pair. Payload refresh `worker-refresh-r1.json` qualifies all three independent
reference grants; no weights/environment copy or dependency change. This is the
qualification updater, not completed release Install/Repair.

ROOT executed the existing built-app qualifier with independent
`installed-regional-invoke-reference-img2img-v1` and
`installed-regional-invoke-reference-outpaint-v1` profiles. Each final cohort
passes13 checks/four requests/three PNGs/one native-step1 Cancel/one exact
restarted Retry/three normal physical lifetimes. Together:26 checks/eight
requests/six PNGs/two Cancels/two exact Retries/six normal lifetimes. Exact
official Illustrious XLv0.1, one reference,512, Euler/Normal, N6/CFG5/Rescale0,
strength0.5, embedded FP16; selected training timesteps499,333,167,1.

A/B change only the original reference in the same control Project. Visible RGB
changes739518 channels for IMG and434893 for OUT. OUT uses the right/generated
regional owner; both references produce identical contribution alpha,107008
exact protected source pixels,147456 generated pixels and7680 soft pixels.
These are reference influence and existing contribution-policy observations,
not useful spatial association or aesthetic acceptance.

After genuine native/Main/DOM step1 Cancel, the public UI saves referenceB,
source opacity0.75, strength0.8, changed prompts/seed/steps, disabled regions and
model=null. A fresh app lifetime retries the original A/source/strength0.5
bundle exactly. The processing PNG and decoded RGBA equal original A. Generate
and Retry do not Add/Save; explicit Add/Undo/Redo/Save/ZIP readback/reopen retain
the candidate and ordinary-only provenance. Actual accepted-result presets
exclude Regional Guidance, references and auxiliary identities. All previous
SQL rows/packages/candidates and exact resource/model files remain unchanged.

Two failed IMG attempts remain separate:

- `app-img-r1`: A/B and step1 Cancel complete; a harness global→regional editor
  sequence failed to wait for acknowledged global text. Existing image-helper
  synchronization is now used for both new profiles. The final source/settings
  Save and restarted Retry were not reached; two lifetimes close normally.
- `app-img-r2`: setup refusal before Electron because259 preserved terminal rows
  exceed the old256-row test inventory ceiling. Only new image-reference
  profiles use ceiling320; receipt256/cursor128 and all product admission limits
  stay unchanged. No row/file was removed to fit the test.

Final IMG (`app-img-r3`) takes578.514s; OUT (`app-out-r1`)553.584s. Launcher≤2GiB,
native≤10GiB, aggregate≤12GiB, zero swap,600s deadline per cohort. Their successful
execution is near the deadline, not performance/headroom or maximum-capacity
qualification. Workspace OOM/setup/timeout are never semantic mutation RED.

## Finite remaining Regional scope

Fresh core contracts: Regional Guidance decision/scope/worker/acceptance,
Smart Patch scope/acceptance, Dynamic Prompting/Generate expansion and
Generation Settings model-aware compatibility. They promise enabled compatible
inputs and explicit pre-enqueue refusal, not the full Smart×resource×method×
batch×reference product. A guard alone is not another unconditional MVP feature.

| Axis | Current boundary and remaining classification |
| --- | --- |
| Regional text and global LoRA | Existing Current Canvas and four-mode Smart EPS/V/Anima finite consumers already exist. Do not reimplement them. |
| Illustrious references | Real EPS Current Canvas TXT/IMG/OUT consumer now exists. Visual usefulness, compatibility and capacity acceptance remain mandatory. |
| Smart references / Regional batch or dynamic prompts | General features exist; these intersections are not explicitly promised by the core contracts. Evaluate a finite useful combination rather than silently removing every guard. |
| Further methods, selected VAE/precision, Illustrious TI, V objectives with references | Unqualified intersections. Model-aware compatibility is concrete; neither compatibility nor exclusion follows from family labels alone. |
| Admitted maxima | Three regions/three images and existing budgets are guards. One-reference512 installed cohorts do not qualify the maxima. |
| Negative scope | Anima references/TI, inverse auto-negative, generic adapters, shared masks; advanced weighting/region presets/copy-merge remain excluded or post-MVP. |

The next Regional acceptance owner is fixed visual/compatibility/capacity
qualification on the already selected official Illustrious XLv0.1. After
Regional, the clear independent implementation owner is Home/workspaces/Project
Trash, followed by safe resource removal/remaining Models contexts, full exports,
release runtime and Linux/NVIDIA/manual-update/packaged compatibility acceptance.
No PP-001/005/007/008 readiness promotion follows from this checkpoint.

## Retention, audit and disposal

Evidence root: `runs/regional-reference-image/20261110-img-out` under the declared
artifact root. Active compatible worker report: `worker-refresh-r1.json`; its
persistent report/log/marker/config companions and protected SHARED/model/
managed-Project/queue dependencies remain in place.

ROOT retention-r2 and subsequent verification pass. Independent byte audit
`final-audit-r2.json` is **CLEAN / READ_FINISHED**:4502 archive entries
(3301 regular files/1141 directories/60 literal symlinks),560 scoped copies,
1639 source files, ten exact build bindings and two old-harness source fallbacks.
Both immutable SQLite copies have equal schema/typed rows across20 tables;
no WAL/SHM existed. Actual retained scope includes nine Projects,11 rows/bundles,
eight receipts/PNGs, five cursors, two result presets and eight reported normal
lifetimes. The qualified six-Project/eight-row/six-PNG/six-lifetime cohorts remain
separate from failed attempts. Five protected external pins and72 installed
worker files match. This audit does not rerun ML or promote visual/capacity status.

The first retention attempt stopped on a missing worker-PID join in its reader;
its partial copied bytes remain in the archive. The first independent reader
diagnostic assumed a receipt column that does not exist; corrected reader-r2
uses actual receipt/Project ownership with unchanged hash fences. Original
diagnostics stay retained. Source-only companion archives normalize manifest
field names/tar prefixes without changing source bytes; original archives stay.

ROOT separately confirms physical exits/restoration,30 ended bounded units,
293 lifecycle records without incoming raw-payload dependencies, fresh runtime
idle and ended audit readers. Exact own `RUN/payloads` and `t-rrii-1110` are
disposed after retention, reclaiming249720832 allocated bytes. No symlink target,
shared resource/model, managed Project/row, global cache or foreign process was
removed. Lifecycle is `retained`, `payloads: []`.

`retained-payloads.tar.gz` SHA256:
`3b6ad1301af19c38b2bf99f679f2300c465513fa72178ab32e2a3e5f769eb4c1`.
Use its inventory/restore map and recorded source origins to reconstruct exact
roles; old raw paths and `--resume` are not live. Final-source-r1 records the
pre-disposal documentation; final-source-r2 adds only these completion facts.
Neither source snapshot is itself an inference claim. The five actual app
members remain byte-identical to both qualified cohorts.
