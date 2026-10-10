# NoobAI multiple-LoRA IMG/OUT qualification

## Boundary, entry and owners

Entry: `914a7b47fff0656d2f75b60874b16bacf03c9aac`, following the
[signed embedding image gate](./phase-2c-noobai-embedding-image-polarity-research.md).
The [native LoRA gate](./phase-2c-noobai-lora-stack-native-research.md) and
[installed application TXT gate](./phase-2c-noobai-lora-stack-ui-research.md)
established exact two-source loading and TXT acceptance. Both explicitly left
multiple-LoRA IMG/OUT combinations unqualified. PP-004/005/007/008 and the
[LoRA contract](../features/project/generate-mode/lora-selector.md) require
ordered exact resources, signed weights, immutable accepted settings and
explicit Add/Save. Their public readiness remains «Пока не обещать».

This is high-risk qualification across persistent queue, installed worker
sources, provisional receipts, explicit Add, provenance and portable Save.
Root owns the frozen plan, serial bounded execution, mutation journal,
restoration, physical-exit proof, lifecycle and Git. Delegated source inspection
and review are source-informed, not blind. The following plan is pre-execution;
executed outcomes must be added separately after raw readback. No new model
family, production inference behavior, library default or approval workflow is
introduced by the qualification harness.

## Confirmed source map and missing evidence

Project stores the entire configured ordered stack. Main Prepare verifies each
enabled exact version and freezes its identity, managed bytes and signed
weight. Enabled weight zero is still verified and dispatched; disabled B stays
in configured/provenance metadata but is absent from native inputs. LoRA trigger
phrases remain ordinary prompt text and do not supply resource ownership.

`scripts/noobai-lora-stack-qualification.mjs` explicitly requires TXT. Its prior
AB/BA/zero/disabled images therefore do not prove the IMG/OUT boundaries.
Actual image paths are public Generate →
`prepareNormalGeneration` / `prepareNormalOutpaintGeneration` → persistent
frozen queue → installed `_generate_illustrious` → exact checkpoint/native VAE
and mode-specific pipeline → `load_generation_loras` → conditioning → actual
native denoising → provisional receipt → explicit Add → real `.igs` writer,
loader and read-only comparison. OUT also uses the existing LaMa preparation,
latent keep mask and published contribution alpha.

The installed loader assigns `igs_lora_<index>` in enabled-resource order,
validates every source tensor/rank/alpha and effective signed scale, then the
pipeline computes conditioning. Both IMG and OUT call that loader. A wrong
resource-to-weight association after validation could leave queue/provenance
metadata apparently correct while changing native output. Metadata inspection
alone is insufficient to close this gap.

Ordinary PEFT forward adds each adapter's low-rank update. AB and BA are not
required to produce different pixels: accumulation order may commute or differ
only through floating-point rounding. Their configured/effective order and
source-bound weights must nevertheless remain exact. B-enabled-zero and
B-disabled are distinct metadata/native-load cases with a matched full-RGBA
expectation. Disabled, rather than enabled zero, is the single-adapter control
for a mutation acting only when two adapters are active.

## Exact reusable resources

Reuse the sole pool
`~/.codex/artifacts/imagegen-studio/shared/illustrious-vpred-worker-012-20261007/`.
Its historical name does not describe the installed worker: it is0.14.0.
App data `A` is its `data/imagegen-studio/`; managed files below are under
`A/models/`. Entry has9 resources/14 versions/14 local files. The entire eleven
captured SQLite tables, checkpoint prediction/noise overrides and existing
catalog rows must remain intact. No publication, download, environment or
managed-weight copy is planned.

| Resource            | Managed file; bytes                             | Exact SHA-256                                                      |
| ------------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| Official NoobAI EPS | `qualified-700140.safetensors`;6,938,040,416    | `ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1` |
| Cyberfalafel V v1.2 | `qualified-700040.safetensors`;6,938,040,794    | `edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d` |
| Digital Art A       | `qualified-700060.safetensors`;114,437,420      | `c2bd847fb3859cc8ce16af6ecce291c96b36ca486999e620af9b886367ee6ee9` |
| Lineless B          | `qualified-700150.safetensors`;171,540,060      | `90f9f879ff2e27fcaec5723a2c3e5db53ec5ffbdd4c7df49159c0ccbfe63b1ca` |
| External native VAE | `qualified-700080.safetensors`;167,335,542      | `f09b42f799d82812ef38461205c4764ecb3e10384bb6ee198321124dbc59e9b7` |
| LaMa                | `A/inference-resources/big-lama.pt`;205,669,692 | `344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9` |

Read-only raw entry confirms B resource
`66307ac0-1dd4-4006-8591-03c23e684719`, version
`08c7ae69-82dc-4eaa-a487-686fa31f579c`, local file
`44525306-b7fb-4c4a-a941-6a37a90db314`, CivitAI1795307/2031703/1934353.
Its copied source lineage retains creator Underdorks and `creditRequired:true`.
Its existing publication/source check is separate evidence; using the retained
file does not measure live CivitAI availability or public installation.
A uses−0.5, B uses+0.75, enabled0 or disabled+0.75. Historical native probes
independently resolved986 targets per source (UNet722/CLIP1 72/CLIP2 192), with
rank16/alpha8 for A and rank24/alpha12 for B. New native probe counts and
source-bound observations must be measured anew.

Preserve all43 original worker files, hashes and physical inode/mode/mtime.
Changing and restoring ctime is expected; ctime preservation is not claimed.

## Common opaque sources and geometry

Use the two unmodified prior accepted TXT PNGs already pinned by the signed
image gate. They are preconditions, not new TXT jobs. EPS is112,804 bytes,
PNG SHA`b7f98f34d9c1e9ad0729075cb40ce8daf100e7f7f3812daba9e7e3bad3091ade`,
RGBA SHA`a2a7dedd54d94e08d7611e7204bacda1cdaa1086cab52aa519c7dcef144c626a`.
V is73,935 bytes,
PNG SHA`8c6722bfb52b664d7b902c60077af5505b2ff1b29ca2becefc05d3235f68c6b6`,
RGBA SHA`d01722b60187eea82a039dc51473f1bacfe2d172cb34192bf6bddc4bf5fab9db`.
Both are256×256/all65536 pixels opaque. New owned tiny copies must equal the
originals byte-for-byte and preserve original report/package dependencies.

Import the appropriate source as an ordinary layer at `(0,0)`. IMG bbox is
`(0,0,256,256)`, OUT bbox `(64,0,256,256)`. OUT therefore receives192 opaque
and64 transparent source columns. Contribution alpha is zero through local153
exclusive, fifteen intermediate columns at153..167, then255 from168. The full
source-over preview is opaque320×256. Independent Pillow composition must
verify the entire preview, including3840 soft-edge pixels omitted by the older
driver's opaque-pixel helper. Browser Canvas un/premultiplication hashes are
not interchangeable with native complete OUT RGBA.

## Frozen finite matrix and observations to obtain

The root-owned literal plan fixes exactly22 installed admissions:

| Stage                             | Exact cases                               | Jobs | Accepted after Add/Save/reopen |
| --------------------------------- | ----------------------------------------- | ---- | ------------------------------ |
| Healthy                           | EPS/V × IMG/OUT × AB,BA,B-zero,B-disabled | 16   | 16                             |
| Installed weight-swap RED         | EPS × IMG/OUT × AB                        | 2    | 0                              |
| Installed disabled neighbor GREEN | EPS × IMG/OUT × B-disabled                | 2    | 0                              |
| Fresh restored AB                 | EPS × IMG/OUT × AB                        | 2    | 2                              |

Expected total:22 completions,18 accepted saved/reopened packages, four
provisional controls and zero accepted mutants. No additional admission,
Cancel/Retry, failed-case replay or automatic matrix expansion is planned.
Unexpected failures remain actual failures rather than numerical REDs.

All new jobs use256×256, authored3 steps, CFG5, CFG rescale0, Fixed0/
per-iteration, strength0.5, exact native external VAE/FP32 and Normal schedule.
EPS uses Euler a/false-ZTSNR/leading; V uses Euler/true-ZTSNR/leading. Those
effective policies belong to Model Manager and Main. The expected full grid
`[667,334,1]`, cutoff500 and retained `[334,1]` with two real callbacks are
pre-execution assertions, not a copied observation of this campaign. This
small recipe does not assert author quality or all sampler/strength behavior.

Prompts are ordinary unweighted text without embedding literals or sidecars:
`a red ceramic cup on a wooden table, studio photograph` and
`blurry, low quality`. BA uses actual Remove→Add because Project has no
dedicated reorder action. Genuine later draft edits change A to−0.25, both
prompts and seed37 independently from frozen seed0; B's weight/enabled state
and the configured order remain as authored. Queue/native DTO and
immutable accepted settings must retain the original exact configured stack;
saved/reopened authoring must retain the actual later edits. Comparison must
show the ordered recorded/current identities and weights without mutating
Project, recovery/autosave, source assets or saved package.

Four separately bounded native probes are planned for EPS/V × IMG/OUT. Each
binds the four actual healthy frozen DTOs and target bytes. The native oracle
independently reads ordinary safetensors keys, resolves real native modules,
checks complete per-source tensor/rank/alpha/weight associations and low-rank
forward algebra, then observes the genuine image pipeline handoff before
denoising. Its trained graph loads in F16 on CPU; independent module-level
algebra temporarily uses FP32 and restores each original dtype. These probes
do not execute a full GPU UNet, denoising loop or VAE decode; installed UI jobs
provide the separate actual CUDA image evidence. Its sentinel adds zero image
jobs, completions or accepted outputs.
The captured durable queue ID is a correlation, not interception of the
earlier live dispatch. Native result flags alone cannot replace exact input,
source and process binding in raw readback.

## Executed-mutation criteria and restoration

One protected installed mutation appends a second `set_adapters` call after
`load_generation_loras` has performed its existing validation. Only when two
adapters are active, exchange their resource-bound weights while preserving
ordered names, exact source bytes, prompt, seed, scheduler, model/VAE and target.
Inserting the mutation before effective-scale checks would produce refusal
instead of the required completed image; that is not an equivalent test.
Root must freeze the exact old/new strings and reconstructed original/mutant
SHA before replacement, and maintain a single rollback journal.

Inferred expectation to measure: each EPS AB mutant completes provisionally,
has the exact same frozen semantics as its healthy reference, and differs in
visible RGB. OUT additionally preserves every alpha byte and changes the
independent source-over composite; hidden-only RGB is insufficient. Each
disabled-B mutant neighbor retains complete RGBA because only A dispatches.
All four controls remain before Add, with no generated accepted layer,
accepted-result index or generated provenance saved to the source-only package.
After physical exit and restoration, two fresh EPS AB cases must reproduce
their healthy complete RGBA with new queue identities.

The installed pixel-causal cycle is EPS-only. Healthy V images plus separate
native mapping/algebra/handoff observations do not justify a claim of executed
V weight-swap pixel causality. Import, fixture, capability, NaN, memory/deadline
or launcher failures do not count as semantic RED.

## Resources, refusal and raw readback

Evidence root:
`~/.codex/artifacts/imagegen-studio/runs/noobai-lora-stack-image/20261010-checks/`.
Before native work freeze source/fixture/bundle hashes, original43 identities,
literal22 matrix, common-source origins and complete eleven-table entry rows.
Fresh source inventory identifies every consumed source independently; do not
reuse the predecessor's source count without enumerating the new imports.

Root runs heavy operations serially using the retained compatible pool. Chosen
ceilings are launcher2GiB, moved owned native scope12GiB, combined watchdog
14GiB including file cache, zero task-group swap and1800s per UI job. Native
probes have a separate12GiB/zero-swap/900s group with no live inference child.
Record actual total/anon/file peaks and process identities. These ceilings are
safety choices, not measured supported-model capacity. Artifact soft budgets
remain30GiB root/1GiB compact evidence and trigger review, not blind deletion.

Exact fixture guards reject unsupported mode/objective/stage/case, missing or
changed source/baseline, undeclared mutation, malformed tuple, unknown family
or old runtime before source reads/native startup where applicable. An enabled
missing/corrupt B refuses; disabled B must not trigger enabled resource access.
Neither temporary controlled transport nor native CPU tests qualify release
installer/GPU delivery. Later completion remains provisional until explicit Add.

The new independent reader imports no production/planner/oracle/ML helper. It
uses raw SQLite, actual PNG/ZIP bytes and Pillow to check22 new completed queue,
receipt and document-scoped seed0 cursor owners,18 new accepted index owners,
empty acceptance journal, unchanged original rows/catalog/overrides, four raw
provisional recovery manifests, all18 portable configurations/provenance and
later authoring drafts. Recompute B-zero/B-disabled complete RGBA for all four
healthy matrices, observable nonzero-B changes against disabled controls,
two EPS visible-pixel REDs, two neighbor GREENs, two restored whole-RGBA matches
and all nine accepted OUT full previews. Verify complete immutable source
assets and protected source pixels, actual source/bundle bindings, native
probe associations, original43 restoration and physical exits.

Cleanup requires confirmed physical exit and byte/identity restoration before
removing only explicitly owned idle payloads. Preserve original source models,
the reusable runtime, old queue/results and cross-run PNG/report/package pins.
Record actual allocation reclaimed and retained dependencies. This gate leaves
arbitrary formats/all-layer compatibility, broader weighted/chunked embedding
and dynamic image batches, author quality, Invoke parity, installation/release
and full MVP readiness open; it does not raise PP-004/005/007/008 status.

## Installed outcomes and independent readback

The executed frozen plan SHA is
`5b7c7f10497ec73ea4e549fadff68f8a1325089251ff662ffd6abd69f1a560ad`.
All 22 admissions produced finite completed candidates: 16 healthy cases,
four provisional controls and two fresh restored cases. Exactly 18 results
were explicitly added, saved and reopened; their owning read-only comparisons
passed. No mutant was accepted. The declared matrix did not expand and no
application generation was replayed after an unexpected failure.

The configured/effective AB/BA order, exact resources and source-bound signed
weights remained correct for both checkpoints and image modes. B-enabled-zero
remained in native inputs; B-disabled remained in recorded configuration while
being absent from native inputs. Complete RGBA matched between zero and disabled
in all four objective/mode matrices. AB and BA with nonzero B changed visible
pixels against their disabled controls in eight cases. AB/BA pixel inequality
was neither required nor used as an oracle. BA was authored through actual
Remove A/Add A controls.

The installed EPS resource-weight-swap completed both images before Add, then
failed the intended pixel assertions. IMG changed 60,776 visible RGB pixels;
OUT changed 26,039 visible RGB pixels, preserved every alpha byte and changed
25,255 pixels in the independent source-over composite. Hidden-only RGB changes
were not counted as success. Both disabled neighbors preserved complete RGBA.
After physical exit and source restoration, fresh EPS IMG and OUT reproduced
the respective healthy complete RGBA with new queue identities. These controls
prove EPS pixel causality; installed V weight-swap pixel causality remains open.

All jobs used ordinary unweighted cup/studio prompts without embedding sidecars,
Normal N3/CFG5/Fixed0/strength0.5 and the pinned external VAE FP32. The actual
constructor/strength capture retained `[334,1]` from `[667,334,1]`; each job
reported two real updates. Later actual authoring edits changed A to -0.25,
seed to 37, both prompts and dynamic maximum/seed behavior. Frozen queue and
accepted provenance retained original seed 0 and A -0.5; saved/reopened drafts
retained the later edits. OUT changed the next current context to IMG after Add;
its comparison correctly reported that change rather than pretending the modes
were identical.

Four bounded native CPU/F16 trained-pipeline probes independently checked
24 low-rank algebra variants, 23,664 per-target variant forward observations,
16 captured ordered stack handoffs and 15,776 target observations at those
handoffs. Each source resolved 986 targets: 722 UNet, 72 first CLIP and 192
second CLIP; A rank/alpha were 16/8 and B 24/12. The probes compared 64
conditioning and 64 handoff hidden/pooled tensors. Selected modules temporarily
used FP32 for algebra and returned to their original dtype. The ordinary Compel
reference was separately configured on the same validated encoders, so it does
not constitute an independently trained encoder oracle. Variant/handoff RNG,
request generator, conditioning, dtype and adapter cleanup were checked; whole
pipeline-initialization global RNG preservation is not claimed. The real native
image handoff was observed before denoising, including actual image preparation
and LaMa for OUT. These probes created no extra image, job, completion or candidate.
Their durable queue IDs are correlations to captured commands, not interception
of earlier live application dispatch. Actual CUDA image jobs are separate evidence.

The independent reader used raw SQLite, PNG/ZIP bytes and Pillow without
production, planner, oracle or ML imports. Its actual SHA is
`0fa7b65b6e77084960b52f791b5217e3f13c13c3f0dafdd51e6cf7f04714e7a9`;
`independent-aggregate.json` SHA is
`e962dc536603f3de4ec34078508dcc9f6f1dad2370f8397a2106dee8609d8db0`.
All 9,724 checks passed. Native tensor values were checked by the separately
source-bound native oracle; the raw reader does not claim to recompute them.

Raw deltas were exactly 22 completed queue rows (605→627), 22 candidate receipts
(542→564), 22 document-scoped seed-0 cursors (338→360) and 18 accepted indexes
(480→498). Every pre-existing row in all 11 captured tables remained unchanged,
as did the nine-resource/14-version/14-file catalog, overrides and managed-file
identities. The acceptance journal remained empty. The reader verified all
18 portable configurations, later authoring drafts, four provisional recovery
manifests, every ZIP member/manifest digest, immutable source/receipt bytes and
owning comparisons. All nine accepted OUT packages matched the independently
composed entire 320×256 preview, including 3,840 soft-edge pixels per preview.
Across those nine packages 499,968 protected source pixels were checked;
contribution alpha was exact and source-layer PNGs were unchanged. This does
not claim the entire merged original layer remains unchanged where new alpha
contributes.

The first executed reader failed on its own lineage-path assertion: a copied
historical descriptor correctly retained the earlier run's PNG path, whereas
the new fixture pointed at this run's exact copy. The executed v1 source,
failed log and bounds remain preserved. The revised reader pins the historical
descriptor explicitly and requires the historical descriptor source, original
origin path and new copied source to contain identical bytes, retaining all
size/hash/RGBA/origin-report checks. `raw-reader-revisions.json` records both
source hashes and the failed execution; the original orchestration freeze was
not rewritten. Successful v2 readback required zero extra application jobs.

### Automated verification actually run

- `node-focused`: 144 passed, zero failed/skipped, across seven focused harness
  and neighboring driver files. The final profile rerun passed seven cases;
  this overlaps the earlier set and is not a claim of 151 distinct tests.
- Real native CPU image tests: baseline eight passed; the isolated source mutation
  caused four exact independent low-rank-algebra failures while all four disabled
  neighbors passed; after restoration all eight passed. The final typing-adjusted
  rerun also passed eight, as overlapping evidence. Tiny native CLIP/UNet/VAE,
  PEFT, Compel and actual image denoising are exercised. CPU OUT uses an injected
  prepared-mask fixture; trained native probes exercise actual LaMa separately.
- `pnpm run typecheck`, `pnpm run lint`, final changed-test ESLint and fresh
  `pnpm run app:build` passed. Five application bundle hashes and 19 qualification/
  driver/reference source entries were frozen before trained execution.
- Ruff check over the worker and new image oracle, Ruff format check on the two
  new Python files, final worker basedpyright and Prettier on the ten owned
  package/JS files passed. Three native oracle source hashes remained frozen.
- Initial basedpyright failed on 12 test typing errors; annotations were corrected
  before the final successful check/CPU rerun. The first final profile rerun
  failed because its added locator double lacked `innerText()`; the corrected
  double passed without changing production behavior. Neither failure is an
  intended semantic mutation RED. Initial reader-mechanical setup lacked older
  TXT ICC metadata; the corrected historical-profile boundary was tested before
  trained work. Failed-run logs remain retained.

Neither the full `app:test` suite nor `prototype:test` was run for this gate;
there were no prototype or renderer UI changes.

## Final resources, cleanup and handoff

All 43 installed worker sources have original bytes and dev/inode/mode/size/mtime
restored. The protected original backup is absent; ctime preservation is not
claimed. All 151 recorded native PID/start identities physically exited.
A separate fresh proof checked 473 live system/process conditions, boot timeline,
trusted root files, user units and manager environment before cleanup. Seven
pre-existing system processes with unreadable environment/cwd were explicitly
reverified by identity and trusted ancestry; those fields were not claimed empty,
and unknown same-user processes fail closed.

Guarded cleanup removed only the confirmed idle, restored isolated CPU source
copy, reclaiming 4,042,752 allocated bytes. `cleanup-proof.json` SHA is
`d8d47d723aed148cb18e9bd709c4b04f39241e632191a3d268a466ed9299ed13`.
The post-cleanup inventory recorded root 28,353,667,583 bytes, compact evidence
503,538,739 bytes, shared pool 27,850,128,844 bytes and current run 40,652,571 bytes;
free disk was 49,534,849,024 bytes. These are timestamped measurements before
final documentation/commit proofs, not an invariant exact final directory size.
Both soft budgets remained satisfied. The sole compatible runtime/catalog and
historical source PNG/report/package and causal dependencies remain retained.
No original model/image or ordinary application data was deleted.

Operations were serial, with combined 14 GiB including charged file cache,
launcher 2 GiB, owned native 12 GiB, zero task-group swap and 1,800 seconds per
image case; native probes had 12 GiB/zero swap/900-second limits. Actual combined
application peak across 22 jobs was 9,904,590,848 bytes. Three native probe
peaks reached 12,884,901,888 bytes (12 GiB); V OUT reached 12,884,897,792 bytes,
4 KiB below that ceiling. All completed with zero task-group swap and no watchdog
stop. They took 574.208–596.974 seconds each.
The EPS IMG probe recorded anon peak 11,646,967,808 bytes and file peak
6,713,143,296 bytes in different phases; these component maxima must not be added
or interpreted as simultaneous usage. Hitting the 12 GiB ceiling gives no memory
headroom claim. System-wide swap was already occupied at entry; task-group zero
swap does not assert that the entire computer used no swap.

PP-004/005/007/008 remain «Пока не обещать». Historical signed-image and V Karras
wrong-EPS TXT uncertainties remain intact. Arbitrary formats/stacks/geometry,
quality, trained-pixel Invoke parity, public installation/delivery/release and
full MVP remain open. Next is a separately frozen and budgeted Illustrious/NoobAI
dynamic common-source IMG/normal OUT gate; existing dynamic TXT evidence does
not prove that image boundary. Final publication identity, clean tree, live
remote equality, repeated physical idle and inventory are recorded separately
in this run's `final-handoff.json` after actual commit and push.
