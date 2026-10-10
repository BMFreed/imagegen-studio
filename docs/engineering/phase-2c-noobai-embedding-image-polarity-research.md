# NoobAI signed embedding IMG/OUT directional qualification

## Boundary, entry and owners

Entry: `c2dae1317ca0d85c48043d9c18f974957fce7305`, following the
[finite V DPM++ 2M image gate](./phase-2c-noobai-vpred-dpm-image-research.md).
The [earlier asymmetric TXT gate](./phase-2c-noobai-embedding-polarity-research.md)
established signed tensor routing for exact trained/zero embeddings; it did not
qualify that directional invariant through IMG or mixed-alpha OUT.
PP-004/005/007/008 and their current readiness statuses remain unchanged.

This is high-risk qualification because the operations cross persistent queue,
installed worker sources, provisional receipts, explicit Add, immutable
provenance and portable Save/reopen. Root owns the frozen plan, bounded serial
execution, installed mutation journal, restoration, physical-exit proof and
cleanup. Delegated research and reviews are source-informed. This document
retains the frozen pre-execution plan and records the completed finite outcomes
and independent readback below; it does not claim full MVP readiness.

No production prediction/noise policy, model family, inference backend, resource
installation or approval workflow is changed. The exact-file policies belong
to Model Manager and Main; Project captures their effective values.

## Confirmed source map and oracle gap

`scripts/noobai-components-qualification.mjs` pins the existing trained embedding
T and finite paired-zero version Z, their common literal, signed worker inputs
and portable identities. `scripts/noobai-embedding-polarity-qualification.mjs`
defines crossed `positive-zero` = Z/T and `negative-zero` = T/Z. Swapping exact
versions while preserving the same literal in each sign breaks the symmetric
T/T case that could conceal a sign-routing error.

Main Prepare freezes plain prompt text and separate positive/negative exact
sidecars. Installed `inference_embeddings.py:load_generation_embeddings`
loads paired CLIP tensors and owns private sign-specific aliases.
`inference.py:build_sdxl_conditioning` supplies positive/negative concatenated
hidden conditioning and CLIP2 pooled conditioning to `run_sdxl_pipeline`.
Image execution uses the real IMG or OUT pipeline class, native external VAE,
captured CPU RNG, cutoff strength and, for OUT, LaMa and the contribution mask.

The existing independent native oracle
`scripts/noobai-embedding-polarity-oracle.py` reads safetensors itself, expands
vectors using separate reference aliases and calls pinned native Compel. It
checks all four hidden/pooled tensors, T/T, T/Z, Z/T and Z/Z branch isolation,
and actual worker-to-pipeline argument labels. Its CLI is explicitly TXT-only:
the parsed command type and pipeline class are TXT, and the observer expects
`width`/`height` call arguments. Actual `run_sdxl_pipeline` sends `image` and
`strength` for IMG/OUT instead. The new opt-in image oracle,
`scripts/noobai-embedding-polarity-image-oracle.py`, binds the genuine parsed
mode and real image pipeline class. It preserves the earlier TXT oracle as a
separate reference implementation; relabeling the old TXT observation would
not close this gap.

The native image observer must compare the original production tensors against
independent references, then stop at its dedicated sentinel before denoising.
Its rehydrated frozen queue ID is a correlation ID, not proof of the live wire
request/output path. Genuine installed UI jobs establish live dispatch; the
oracle adds no generated job, completion, acceptance or RNG consumption. Each
probe restores the pipeline method in `finally`. Original SDXL EOS=2 expansion
and pooling checks remain scoped to one unweighted literal per signed prompt.

## Exact reusable resources

Reuse one canonical pool:
`~/.codex/artifacts/imagegen-studio/shared/illustrious-vpred-worker-012-20261007/`.
Its historical directory name is not the installed worker version: worker is
0.14.0. App data `A` is its `data/imagegen-studio/`; managed model paths below
are relative to `A/models/`. Current catalog entry is9 resources/14 versions/14
files. Preserve all existing rows and the two exact-file prediction/noise
overrides; publish no additional version or managed file.

| Resource            | Managed file; bytes                             | Exact SHA-256                                                      |
| ------------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| Official NoobAI EPS | `qualified-700140.safetensors`;6,938,040,416    | `ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1` |
| Cyberfalafel V v1.2 | `qualified-700040.safetensors`;6,938,040,794    | `edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d` |
| Digital Art LoRA    | `qualified-700060.safetensors`;114,437,420      | `c2bd847fb3859cc8ce16af6ecce291c96b36ca486999e620af9b886367ee6ee9` |
| External native VAE | `qualified-700080.safetensors`;167,335,542      | `f09b42f799d82812ef38461205c4764ecb3e10384bb6ee198321124dbc59e9b7` |
| Trained T           | `qualified-700100.safetensors`;49,736           | `91a95b244b8ba01d905d32ced7e3cc20eb74b4da8f519de3764505500d386c36` |
| Paired-zero Z       | `qualified-700110.safetensors`;49,552           | `b736cd9c1f9ee07795c5917825baa95ae14bac6383bdddff5530dfefa4bece0d` |
| LaMa                | `A/inference-resources/big-lama.pt`;205,669,692 | `344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9` |

T/Z share resource `1b59402b-35b4-4134-b784-7ec0efc6e94e` and exact literal
`<illustriousphoto>`. T version is
`58c68d31-d35a-4f38-91a3-44c9340f63f2`, local file
`63078909-5a2a-4478-8331-0b9e3152f237`, CivitAI2360940/2655289/2542976.
Creator CautionMergeAhead's credit requirement remains in its source lineage.
Z version is `a21973a8-ec81-4e69-af24-bf07a7f72da1`, local file
`25e16564-35b8-4535-a872-59742424cd29`, synthetic fixture2360940/700111/700112.
Its lineage names the exact T SHA. Both original filenames are
`illustriousphoto.safetensors`; both contain twelve F16 vectors in each paired
CLIP branch, shapes `[12,768]` and `[12,1280]`. Historical
`runs/noobai-embedding-polarity/20261008-checks/embedding-source-proof.json`
records nonzero T and exactly-zero Z. That precondition alone does not prove
directional conditioning or new image outcomes.

The shared source descriptors and original identities require fresh binding in
the new plan. Full43-file installed membership, SHA and original inode/mode/mtime
must be preserved after the protected mutation. ctime preservation is not
claimed because replacement/restoration can change it.

## Common opaque sources and image geometry

Use one unmodified prior accepted full-stack TXT source per objective across
both modes, both assignments, mutation controls and restoration. These sources
are preconditions rather than new TXT qualification cases:

| Objective | Original relative run path and queue identity                                                                                                | PNG bytes/SHA; decoded RGBA SHA                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| EPS       | `runs/sampler-campaign/20261010-checks/native-illustrious-dpmpp_2m-Normal-baseline-history-txt2img/cc45fc02-087e-41ba-935e-bc369ca8b3fd.png` | 112,804; `b7f98f34d9c1e9ad0729075cb40ce8daf100e7f7f3812daba9e7e3bad3091ade`; `a2a7dedd54d94e08d7611e7204bacda1cdaa1086cab52aa519c7dcef144c626a` |
| V         | `runs/noobai-vpred-dpm/20261010-checks/native-v-Normal-baseline/e847c523-3e5f-4aa2-8007-c66509424a10.png`                                    | 73,935; `8c6722bfb52b664d7b902c60077af5505b2ff1b29ca2becefc05d3235f68c6b6`; `d01722b60187eea82a039dc51473f1bacfe2d172cb34192bf6bddc4bf5fab9db`  |

Both sources are256×256/all65536 pixels opaque. EPS owning report SHA is
`e8d771aa6e828cd7004629a53ddd1756851fda7ed8837c4cd384652ab8c2b4d2`;
V owning report SHA is
`31dbc38bd508b139a911009ba9e75426676a15674d8cb8489368812f858b3f70`.
V's previously verified tiny copy also exists at
`runs/noobai-vpred-dpm-image/20261010-checks/common-source.png`.
Preserve original report, source and accepted `.igs` dependencies. Small owned
PNG copies must match the originals byte-for-byte, with their origins pinned.

Import each source as a real ordinary layer at `(0,0)`. IMG bbox is
`(0,0,256,256)`; normal OUT bbox is `(64,0,256,256)` using the existing literal
mixed-alpha/fade policy. The OUT target has192 opaque source columns and64
transparent columns. Published OUT contribution alpha is zero through local
x152, starts5 at153, has fifteen intermediate columns and is255 from168.
The full preview is opaque320×256, including protected source and soft edge.
The raw independent reader must recompute the entire affine/source-over merge;
the older driver pixel helper omits3840 soft-edge RGB pixels and cannot alone
prove full composition. Browser Canvas un/premultiplication can alter soft-edge
or hidden RGB, so an OUT browser hash is not interchangeable with native RGBA.

## Frozen finite matrix and expected observations

The root-authored literal plan contains exactly18 installed admissions:

| Stage                     | Exact cases                       | Jobs | Accepted after Add/Save/reopen |
| ------------------------- | --------------------------------- | ---- | ------------------------------ |
| Healthy crossed           | EPS/V × IMG/OUT × Z/T,T/Z         | 8    | 8                              |
| Healthy ordinary neighbor | EPS IMG, no literal/no embeddings | 1    | 1                              |
| Swapped crossed controls  | EPS × IMG/OUT × Z/T,T/Z           | 4    | 0                              |
| Swapped ordinary neighbor | Same EPS IMG ordinary input       | 1    | 0                              |
| Fresh restored crossed    | EPS × IMG/OUT × Z/T,T/Z           | 4    | 4                              |

Expected total is18 completions/13 accepted saved/reopened packages, five
provisional controls, zero mutant acceptance. The single ordinary neighbor is
paired baseline/control IMG; an ordinary OUT neighbor is outside this matrix.
No Cancel/Retry or admission beyond this frozen table is planned. Unexpected
failures stay actual failures, not semantic REDs or automatic extra cases.

All new image jobs use256×256, authored3 steps, CFG5, CFG rescale0,
Fixed0/per-iteration, denoising strength0.5, Digital Art LoRA−0.5, exact native
external VAE/FP32 and Normal schedule. EPS uses Euler a/false-ZTSNR/leading;
V uses Euler/true-ZTSNR/leading. Leading remains an export assumption from the
prior exact-file policy. This finite recipe is not the author quality recipe
or a universal strength/schedule recommendation. Actual retained grid and
nonzero callback count must be observed before counting completions.

Crossed prompts are plain unweighted text with one literal per sign:
`a red ceramic cup on a wooden table, studio photograph, <illustriousphoto>`
and `blurry, low quality, <illustriousphoto>`. Ordinary uses the same surrounding
words without literal or sidecar. A genuine later draft changes seed to37,
both prompts and ordinary authoring settings after Prepare. Owning comparisons
must keep each immutable captured signed version/seed0, show removed embeddings
for the later no-literal draft, and retain the IMG Same/OUT Changed mode result.
Source layers/assets and accepted-result index records must survive Save/reopen.

Before mutation, four independent native probes bind the two actual healthy
crossed commands for each EPS/V × IMG/OUT combination. Each separately checks
four assignments T/T,T/Z,Z/T,Z/Z:16 direct assignments total, zero additional
generated jobs. All hidden/pooled positive/negative reference and actual
pipeline handoff comparisons and branch isolation must pass. A failed probe
cannot count all four assignments as successfully checked.

## Executed-mutation criteria and restoration

One protected installed mutation exchanges positive/negative resource lists
in `inference_embeddings.py:load_generation_embeddings`, retaining prompt
texts, resource bytes, exact policies, input PNG, LoRA/VAE and denoising. The
prior TXT plan supplies the exact replacement strings. Original module SHA is
`90497c0fd79e7a07ca3e1e3dc544220aa59315f395678d16ea59c3a409d99172`;
the new rollback journal must freeze the reconstructed mutant SHA and original
physical identity before replacement.

Inferred expectation, to be measured: each EPS mutant crossed output reproduces
the opposite healthy assignment's complete RGBA exactly. It must also differ
from its own healthy assignment in visible generated RGB. OUT RED additionally
requires identical complete alpha, changed RGB where alpha is nonzero and a
changed full source-over composite. Hidden-only RGB changes are insufficient.
The ordinary EPS IMG neighbor must retain every RGBA pixel and frozen input.
All five controls remain provisional, with no generated layer, acceptance-index
entry or saved generation provenance. Fresh restored EPS crossed jobs must
reproduce their same-choice healthy complete RGBA with new queue identities.

This installed pixel-causal cycle covers EPS only. V directional evidence is
the healthy signed image pair plus independent exact tensor/branch/handoff
observations; do not claim an installed V sign-swap mutation was executed.
Import/setup failures, unsupported syntax, NaN, resource stops and timeouts
cannot be relabeled as the intended directional or pixel RED.

## Required raw evidence and resource bounds

Compact evidence root is
`~/.codex/artifacts/imagegen-studio/runs/noobai-embedding-polarity-image/20261010-checks/`.
Before native work, freeze the literal matrix, entry table rows, original43
worker identities, common source origins, all consumed source hashes and fresh
bundle bindings. Installed native work is serial in the existing canonical
runtime; no dependency installation, model/environment copy or download.

Reuse the prior ceilings, after a fresh root-owned RAM/VRAM/disk/process
inventory: launcher2GiB, owned native scope12GiB, combined watchdog14GiB
including file cache, zero task-group swap,1800s per finite UI job. Separate
scope maxima do not prove the combined ceiling. Native tensor probes must run
with no live inference child, have their own bounded timeout and physical exit,
and do not overlap ML suites. Record actual anon/file/total memory and exit
identities. Budget numbers are execution choices, not observed current peaks.

Independent readback uses raw SQLite, PNG and ZIP bytes with stdlib/Pillow;
it must not import application, qualification planner or native oracle helpers.
Check exact18 new queue/receipt/cursor rows,13 accepted index records, consumed
empty acceptance journal, unchanged original rows/catalog/overrides, five
provisional staged outputs, all13 portable packages/current draft/immutable
provenance, complete source assets and six accepted OUT full previews. Recompute
four opposite-assignment full-RGBA controls, one full-RGBA neighbor and four
restored outputs. Validate all consumed source/bundle bindings and exact43-file
restoration independently; a report's `passed` flag is not sufficient.

Cleanup needs fresh physical Main/worker/native probe/CPU-process exit and
restoration proof before deleting only owned disposable payloads. Preserve
original weights, reusable runtime, old queue/results and cross-run source
reports/PNGs/packages. Record actual reclaimed allocation and retained pins.

## Installed outcomes and independent readback

**Confirmed:** the original frozen plan SHA
`18b77be15846007e1da223c1e11c97307d0b6d2140db407878742b8a2fddcf51`
completed exactly18 real admissions and18 native image completions. Nine healthy
cases and four fresh restored cases produced13 explicit Add/Save/readback/reopen
packages. All five controls remained provisional; mutant acceptance was0.
There were no app replays, additional admissions or setup/resource failures
counted as semantic RED. `campaign-progress.json` and the18 owning reports and
bounds retain the actual outcomes.

Both native scheduler grids were observed as `[667,334,1]`, retaining
`[334,1]` at strength0.5. Every image job reported exactly two real callbacks.
The four separately executed installed native probes passed their eight
captured commands,16 signed assignments,64 hidden/pooled conditioning
comparisons and64 real IMG/OUT call-handoff comparisons. T/T,T/Z,Z/T,Z/Z
branch isolation passed; input image/mask and RNG state remained unchanged at
the sentinel, with zero extra denoising or publication. These are separate
source-bound rehydrated observations, not interception of the earlier
Electron job's live wire. Native result/binding/process/bounds/physical-exit
records exist for each EPS/V × IMG/OUT scope.

The single installed sign-swap cycle produced all four intended EPS pre-Add
pixel REDs. Each mutant's complete native RGBA equalled the opposite healthy
assignment exactly; all alpha bytes stayed unchanged. The two IMG controls
each changed59,686 visible RGB pixels. The two OUT controls each changed26,036
visible contribution pixels and25,351 full-composite pixels;35,280 hidden RGB
changes were recorded separately and were not used to satisfy the visible RED
criterion. The ordinary no-embedding EPS IMG control retained every RGBA pixel.
All four fresh restored outputs equalled their same-choice healthy RGBA.

`independent-aggregate.json` records PASS/8,136 checks from the bounded
`independent-readback-v2` execution. The stdlib/Pillow reader imports no app,
planner, production pixel helper or native oracle. It directly checked all11
SQLite tables, unchanged original rows/catalog/overrides and exact new deltas:
18 queue rows,18 receipts,18 document-scoped seed cursors and13 accepted index
records, with an empty consumed acceptance journal. It bound all19 executed
driver sources and the five fresh application bundle files, literal DTOs and
signed exact versions, provisional staging,13 ZIP assets/provenances/current
drafts and owning comparisons. It independently recomposed all six accepted
OUT previews, including the3840 soft-edge RGB pixels omitted by the JS helper,
and checked333,312 protected source pixels across those previews.

The first raw reader attempt failed on its own stale historical TXT schema:
`g.mode` did not exist. The preserved `independent-readback.log` records that
KeyError; it was neither an app failure nor a semantic RED. Reader-v2 uses
strict actual expected-item, frozen kind/context, full worker DTO, portable
configuration, raw operation/receipt and ZIP-provenance bindings for both
original TXT sources. It also validates the entire native sampling ledger
against independent literal grids. Final reader SHA is
`7b46a89a255f0c65e97921085c2978c50c15ab94090f645c4688a33cee3ed409`;
only the readback was rerun, with no new app admission. Numeric CLIP tensor
bytes were independently recomputed by the separate native oracle; the raw
reader validates its bound observations and does not recompute those tensors.
V installed sign-swap pixel causality remains unclaimed.

Final focused checks passed:54 Node tests and23 CPU native-reference tests,
each with0 failures/0 skips; TypeScript typecheck, ESLint, Ruff, basedpyright
and a fresh application build passed. The isolated CPU source mutation ran
eight tests:four real conditioning REDs and four neighboring GREENs; original
43 source bytes were restored and all eight tests passed again. Later Python
test-only annotations fixed basedpyright's inferred heterogeneous argument
dictionary; the affected eight tests were rerun after that correction, all
passing. The post-run restoration record is not represented as an earlier
pre-execution record. Initial bounded ESLint hit the1536MiB V8 heap limit;
the retained failure was resolved by a6GiB cgroup/4096MiB heap run. It was not
a model failure or mutation detection. Optional source Prettier reported one
line-wrap warning in the image qualification module; its exact executed bytes
were retained. Python formatting passed; a blanket source-formatter PASS is
not claimed.

## Final resources, cleanup and handoff

`final-sources.json`, the restored rollback journal and independent readback
confirm the original43 installed files, SHA-256, inode/mode/size/mtime identity
and one completed mutation rollback; the protected original backup is absent.
The reader verified physical exit of112 captured app/native/probe identities.
Its seven inaccessible same-user environments remained Unknown rather than
being treated as empty or authorizing deletion.

Fresh `protected-system-processes.json` passed473 checks after completion:
current same-boot identity/unit/root-file/manager-environment evidence verified
those exact preexisting system processes, disjoint from all owned identities.
Unreadable environment/cwd was not claimed empty; unknown/restarted processes
still fail closed. `cleanup-proof.json` confirms final physical idle and
restoration before deleting only this run's disposable `cpu-mutant-source`.
It reclaimed4,042,752 allocated bytes (3.855MiB). No original image/weight,
ordinary Project, reusable runtime/catalog, staged control result, accepted
package or cross-run evidence was removed.

`final-inventory.json` records root allocation28,406,927,360 bytes, compact run
evidence472,580,096 bytes and free disk49,663,037,440 bytes. Both soft budgets
are satisfied. The18 installed job bounds recorded a maximum combined owned
memory peak of8.252GiB, including file cache, with zero task-group swap and no
resource stops. The single compatible runtime/catalog and source/package
dependencies remain pinned for the next separately budgeted gate.

## Remaining scope

The declared finite gate is complete. This slice does not establish universal
checkpoint/strength/geometry coverage, image quality, weighted/repeated/chunked
embedding literals, dynamic embedding image matrices, all samplers, full V
mutation causality, trained-pixel parity with Invoke, public delivery or release.
It does not close the historical V Karras wrong-EPS TXT pixel-RED gap, and
unsupported V DPM++ SDE plus true-ZTSNR remains an explicit preserving refusal.

The subsequent multiple-LoRA image gate is recorded separately in
[NoobAI multiple-LoRA IMG/OUT qualification](./phase-2c-noobai-lora-stack-image-research.md).
The following next-step description is historical at this signed-image checkpoint;
its original counts and unclosed V sign-swap/Karras TXT wrong-EPS criteria remain unchanged.

At this checkpoint the next step was: multiple-LoRA common-source opaque IMG/normal mixed-alpha OUT for EPS/V,
with exact ordered configured/effective AB/BA, B-enabled-zero/B-disabled,
resource-specific weight mutation, disabled neighboring controls and fresh
restoration. Freeze its own literal matrix, sources and resource budgets before
execution. Dynamic IMG/OUT remains a later separate gate; existing multiple-LoRA
and dynamic TXT evidence does not prove either image boundary.
