# Smart Patch effective mask and internal-size preparation

## Private Main/CPU boundary

Base `e64949e1c57066a8fe8d0dd0c99cce8496ca662b` (private Smart Patch input capture).
This finite Phase4 extension follows PP-007/008 and the
[Smart Patch layer](../features/project/generate-mode/smart-patch-layer.md) and
[compositing](../features/project/generate-mode/smart-patch-compositing.md)
contracts. Risk is high: verified immutable inputs, worker-created files and
asynchronous callback leases touch the existing document/persistence owners.
The prospective scope and verification plan were written before implementation.
Implementation and qualification are complete for this private boundary. Executed
focused/affected tests, semantic probes, typecheck, lint/build and lifecycle
evidence are recorded below; they do not establish public Generate readiness.

The private `capture.prepareInput(worker)` boundary adds three derived
artifacts to an already frozen input: world-bbox generate coverage, internal-size
sRGB source RGBA, and internal-size numeric generate coverage. Main derives the
four-mode result from the original verified world source alpha and actual
world-bbox coverage. It does not enqueue work or enable public Patch Generate.

## Owners and preserved behavior

The existing `ProjectService.withCapturedSmartPatchGenerationInput` freezes the
exact document/layer identity, revision, owned bbox/internal resolution/draft,
original mask and blur/padding, and the visible Raster sources below the target.
The target and layers above it remain excluded. Verified whole mask bytes and
copied Raster sources stay private to the callback lease. Locked/hidden existing
targets remain readable; future generation/acceptance permissions are separate.

Preparation clips the original integer world-grid alpha to the frozen integer
bbox and fills uncovered output pixels with zero. It preserves alpha8 as numeric
generate coverage: zero is outside the authored mask,255 is full coverage and
soft values remain meaningful. It does not invert the mask into the normal
outpaint source-alpha/keep-mask convention. Original asset bytes/hash/bounds/id/
revision and the Project document remain unchanged.

A null mask produces all-zero derived coverage. A verified mask outside bbox also
produces all-zero coverage. The original mask is still verified before a disjoint
fast path; corrupt stored input never becomes an empty-mask fallback. Rectangle
overlap alone is insufficient: a cropped area containing only holes has no
effective coverage, while alpha1 inside bbox has nonzero coverage.

The owned codec continues to require tight, nonempty, white-RGBA mask pixels.
Derived white-RGBA masks carry no ICC or image color metadata and may include
transparent padding or be all zero. A separate explicit derived decoding mode
must not weaken the portable owned-mask validation default.

The worker resizes source RGBA and numeric mask coverage independently to the
frozen internal size with Pillow BICUBIC. For masks, resampling operates on the
numeric alpha plane; white display RGB is reconstructed afterward. Internal size
does not replace the world bbox. No latent-grid/model admission is implied.
Main verifies actual derived dimensions/hash/bytes and source color profile
before handing caller-owned outputs to the callback.

Mode uses the original world source, before resizing:

| Verified source alpha   | World effective coverage | Private mode |
| ----------------------- | ------------------------ | ------------ |
| All0                    | Any                      | `txt2img`    |
| Neither all0 nor all255 | Any                      | `outpaint`   |
| All255                  | All0                     | `img2img`    |
| All255                  | Any nonzero value        | `inpaint`    |

Resampling may erase a tiny nonzero world mask. The returned
`processingMaskHasCoverage` reports whether the resized numeric plane has any
nonzero coverage. World coverage with that field false exposes the loss while
retaining the world-derived mode. Later inference
must handle that condition explicitly rather than silently turn inpaint into
img2img. Source resampling also does not redefine the frozen world-mode decision.

Each preparation owns a separate scratch subtree and three output paths. Output
publication is grouped: an error creating or verifying any member publishes no
successful prepared input and removes this operation's partial outputs after
active readers/writers end. Callback settlement closes admission; all already
started composition/preparation operations drain before capture cleanup, even
when a sibling fails. Retained capabilities cannot start work after closure.
Caller metadata/bytes and worker adapters must not mutate the private snapshot
used by another admitted preparation.

There is no dirty/history/seed/Save mutation, `.igs` schema change, new accepted
Raster, candidate, provenance or recovery record. Concurrent edits/Undo/Clear/
Save/close after the lease is entered retain the original frozen input; failures
during materialization remain explicit integrity refusals as in the capture
checkpoint. Public UI and prototype are unchanged.

## Reference implementation and deliberate adaptations

Local Invoke source is `/home/user/Work/sources/InvokeAI`, pinned at
`9e1540962bcca7f8fa668d7d8e02cf79d75fda3b`.

- `invokeai/frontend/web/src/features/nodes/util/graph/generation/addInpaint.ts`
  creates source/mask resize nodes for scaled inpaint.
- `invokeai/app/invocations/image.py:513` declares `img_resize`'s default BICUBIC
  resampling; both resize nodes inherit that default.
- `features/controlLayers/konva/CanvasCompositorModule.ts:662-724` chooses modes
  from source and mask transparency. Its helper `konva/util.ts:472-494` calls
  a source opaque when every alpha is greater than zero. ImageGen Studio retains
  its existing stricter all255 source policy; an entirely alpha128 source is
  `outpaint` here and `img2img` there when no mask is present.
- `CanvasCompositorModule.ts:571` thresholds authored mask alpha at127 when
  building the worker mask. ImageGen Studio retains numeric soft coverage and
  uses any nonzero world alpha for this mode decision. This is an explicit
  adaptation, not complete Invoke pixel/mode parity.

Owned blur is integer project pixels0..512/default16; padding is Fit-only
0..512/default8. Neither is applied to pixels in this slice. Invoke's scaled
`addInpaint` runs gradient/coherence and contribution fade at processing size
before resizing back. Our project-space blur and nonuniform scaling need a
subsequent explicit numeric edge-processing adaptation. Padding alone does not
stale a variant; a later Fit that changes bbox does.

## Parameter and path registry

| Parameter/path           | Existing or planned bound                                          | Meaning/refusal                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| World source bbox        | Integer coordinates,side≤2048,pixels≤4,000,000                     | Existing finite CPU composition; not new document bounds. Negative origins are valid.                                                         |
| Internal processing size | Integer side≤2048,pixels≤4,000,000                                 | Finite CPU preparation capability only; invalid/oversized size refuses without changing the document. No multiple-of8 or ML capacity promise. |
| Original mask            | Side≤4096,pixels≤4,000,000,PNG≤32MiB,≤256IDAT                      | Existing strict whole-mask validation, even for disjoint input. Null remains valid.                                                           |
| Source/derived PNG       | Each≤32MiB;exact expected dimensions/hash                          | Existing defensive byte ceiling; source must retain pinned sRGB ICC, numeric masks must not carry ICC.                                        |
| Project schema           | Side≤32768,coordinate magnitude≤2,147,483,647                      | Structurally valid projects can exceed this private CPU capability and refuse preparation; schema is not narrowed.                            |
| Compositor aggregate     | ≤256layers,≤128,000,000decoded source pixels                       | Existing source guards; not measured GPU capacity.                                                                                            |
| Blur/padding             | Each integer0..512,legacy defaults16/8                             | Frozen metadata retained without injecting legacy fields or applying fade/Fit.                                                                |
| Inputs                   | Main-only leased original mask/source snapshots                    | No renderer capability or arbitrary input path; identities/hashes/owner must agree.                                                           |
| Outputs                  | One operation-owned subtree;three distinct bounded paths           | No overwrite/symlink/outside-tree publication; grouped refusal/rollback owns only this subtree.                                               |
| CPU test child           | Existing checkout Python/Pillow,small literal fixtures,deadline10s | No downloads,new runtime,trained weights,Torch/Diffusers/Compel or GPU use. Root owns bounded execution.                                      |

## Verification plan

Use the lowest real boundary that proves each invariant. Production Service,
strict worker parser/protocol and Pillow preparation/compositor remain real;
transport can be a controlled tiny Python bridge. No Electron/browser inference
evidence is claimed for this private API.

- Literal exact world-alpha oracles cover clipping on every edge, negative bbox
  origin, same-size preservation, alpha1/soft/255, rectangle overlap with a hole,
  null/disjoint mask and malformed original mask even when disjoint. Owned
  decoding still rejects padded/all-zero portable masks; derived decoding accepts
  those expected outputs without bypassing structural checks.
- Exhaust the source-alpha × effective-coverage mode table on verified pixels,
  including an all128 source and alpha1 mask. Test internal coverage loss as a
  separate observed field with world-mode unchanged.
- Actual CPU/Pillow bridge asserts exact source RGBA and numeric mask outputs,
  same-size identity, independent anisotropic internal dimensions and explicit
  BICUBIC results. Use literal expected values independently of the implementation;
  a test-local lookalike compositor is not evidence. Assert forbidden ML imports
  are absent.
- Real Service entry proves below-target source/frozen mask/bbox/internal/draft/
  blur/padding, caller/adaptor copy isolation and no Project/history/dirty/seed/
  saved-package effects. Late edits/Undo/Clear/close do not retarget preparation.
- Verify worker output identity/dimensions/hash/ICC/path errors, partial output
  cleanup and grouped rollback. Observe actual operation settlement, rather than
  sleeping, before judging absence of late effects. Callback failure with a live
  sibling retains leased files until that sibling exits; post-closure reuse refuses.
- Execute isolated semantic faults for clipping/polarity, world-vs-internal mode,
  internal source/mask sizing or lease draining. Keep an unchanged neighboring
  control through the same production entry; preserve exact restoration and
  physical exit proof. Root selects the finite meaningful probes after tests exist.
- Root runs relevant focused/affected TS and Python tests,typecheck,lint/build
  serially under the existing resource budgets. No prototype UI changes means
  no new prototype/browser check is implied by this implementation.

Artifact evidence and any temporary mutation copies follow
[Artifact lifecycle](./artifact-lifecycle.md): inventory before execution, one
existing compatible CPU environment, compact evidence,physical exit/restoration
before cleanup,and measured retained/reclaimed bytes. No heavy data is created
by this prospective documentation work.

## Open later owners and negative scope

Preparation does not implement blur/fade/coherence,infill/LaMa,latent conditioning,
GPU inference,public admission,queue/Retry,staging/provenance,accepted variants,
staleness/composition/comparison,Regional Guidance or Patch presets. Existing
normal modes and strict outpaint keep-mask contracts remain unchanged.

Future mixed-source Smart Patch outpaint must explicitly combine authored
generate coverage with source holes; existing normal OUT uses source alpha alone.
Future internal-coverage-loss handling and project-space blur scale adaptation
must have numerical oracles before enabling inference. Exact coherence/infill/
edge/noise controls are only MVP candidates in the supporting contract and are
not invented here. Future changed-existing-target acceptance preserves frozen
output/context and marks `outdated`; missing target remains orphaned. Public
PP-007/008 statuses remain «Пока не обещать».

## Executed evidence

Evidence root:
`~/.codex/artifacts/imagegen-studio/runs/smart-patch-mask-preparation/20261014-prepare/`.
This checkpoint qualifies only the private preparation boundary. No browser,
Electron,GPU inference or public Generate run is
claimed. Transport collaborators are controlled; Main Service/filesystem,
production Python protocol/parser/compositor/preparation and Pillow pixels are real.

### Observed focused checks

- Final-source TS focused: **33 PASS,0fail/skip**,7.05s,reported peak255M,zero
  swap (`focused-final.log`). This includes19 new preparation cases and14 prior capture
  cases. Tests enter the real ProjectService callback, invoke production CPU
  composition/preparation through the bounded bridge, and assert literal decoded
  RGBA/numeric coverage, frozen ownership and cleanup. The bridge confirms no
  Torch/Diffusers/Compel imports or trained models. This final run follows the
  test-only typing guards described below.
- Python focused: **24 PASS,0fail/skip**,0.15s,reported peak51.1M,zero swap
  (`python-focused.log`). Real protocol/parser/Pillow tests cover all four clipped
  edges,negative origin,soft pixels,null/disjoint masks,anisotropic numeric resize,
  original integrity even when disjoint,strict invalid requests,grouped publication
  rollback and the actual JSON-lines worker route/capability.
- Global Python Ruff: **PASS** (`python-ruff.log`). Global basedpyright:
  **PASS,0errors/warnings**,3.97s,reported peak659.6M,zero swap
  (`python-typecheck.log`). No new ML environment or model was installed.
- Final affected TS regression: **1871 PASS,0fail/skip**,94.67s,reported
  peak519.7M,zero swap (`projects-regression.log`),covering all Main Projects,
  shared Projects and renderer Project components after final production source/lint
  fixes, before the final test-only typing guards. Production source was unchanged
  afterward; final focused tests and all three semantic probes were rerun with the
  guarded tests. Final source/test hashes match the semantic-probe manifest.
- Affected Python regression: **125 PASS,0fail/skip**,0.87s,reported peak96.2M,
  zero swap (`python-regression.log`),covering protocol,generation protocol,
  derivatives,compositor,target compositor and Smart Patch preparation. These
  are CPU/parser/file checks; trained inference is not run or claimed.
- Required `pnpm run typecheck`: **PASS**,16.77s,reported peak1.6G,zero swap
  (`typecheck-r3.log`). Global `pnpm run lint`: **PASS**,33.98s,reported peak3.5G,
  zero swap (`lint-final.log`). `pnpm run app:build`: **PASS**,1.43s,reported
  peak1.1G,zero swap (`build.log`); the existing large-chunk warning remains.
- Actual field semantics are tested: world alpha1 plus opaque source retains
  `mode:'inpaint'` even when BICUBIC minification yields an all-zero processing
  plane and `processingMaskHasCoverage:false`. This reports unsupported future
  inference input explicitly; it does not qualify that input for ML generation.

### Semantic probes and adapter regression

Three final-source isolated probes each produce **1 semantic RED +1 unchanged
neighbor GREEN,0skip** (`mutation-summary.json`). The production originals retain
their recorded hashes, and mirrored source-only packages/test copies have been
removed after observed process completion. The final probe cycle disposed7,467,046
logical copied-source bytes; both cycles total14,933,330. Physical filesystem blocks
reclaimed were not independently measured and are not inferred from those counts.

| Fault in the real preparation path                            | Observable RED                                                | Neighbor through the same entry                       |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------- |
| Use processing alpha to choose mode instead of world coverage | World alpha1/minified all0 becomes img2img instead of inpaint | One-pixel right-edge crop remains covered and inpaint |
| Python thresholds authored coverage at127                     | Literal negative-origin crop changes64 to0 and128 to255       | Null-mask source-only img2img stays unchanged         |
| Resize numeric mask with NEAREST instead of BICUBIC           | Eight independently derived anisotropic mask bytes differ     | Same-size literal world crop stays unchanged          |

Separately, the actual adapter regression was RED before the repair
(`adapter-reply-red.log`): an adapter mutated a valid result's dimensions across
Main's asynchronous verification, making the correct returned preparation fail.
An unchanged neighbor remained GREEN. Main now clones the reply immediately;
the retained assertions pass in the final33-test run. This is a real regression
reproduction and repair,distinct from the three isolated synthetic faults above.

### Corrected attempts retained separately

The initial TS run had14 PASS/18 failures (`focused-tests.log`). Seventeen new
cases exposed Main numeric-mask metadata verification returning bbox `x/y` through
a spread although the derived decoder accepts only dimensions. The fix returns
explicit width/height; assertions were retained. One prior capture case observed
a still-pending painted-mask autosave change after its baseline was taken. Its
setup now waits for the real `service.flushAutosave` before baseline comparison,
without a fixed sleep or weaker assertion. The same focused boundary passes in
the initial32-test rerun (`focused-r2.log`,7.13s,peak245M,zero swap). The final
33-test run adds adapter reply isolation after that successful baseline.

The first typecheck attempt failed (`typecheck.log`): processing-source metadata
omitted required `byteSize`,and the typed transport payload interface lacked the
request record shape. The fixes derive `byteSize` from the verified buffer length
and use the corresponding typed payload alias. The next typecheck attempt
(`typecheck-final.log`) found three test-only typing errors: a potentially absent
last observation and an untyped zero-filled array. Positive `assert.ok` observation
guards and a numeric `Array.from` callback corrected these without weakening the
semantic assertions. The final typecheck passes. The initial focused/probe run
before those test guards remains under `before-test-type-guards/`; the final33
tests and all three semantic probes pass after them. These compile corrections
are not semantic sensitivity evidence.

### Lifecycle and next owners

`physical-exit.json` confirms23 owned execution units inactive with `MainPID=0`,
no owned test/compositor processes, no isolated source/test copies and matching
final hashes. `artifact-lifecycle.json` records the final artifact root at
29,341,456,515 logical bytes (about27.33GiB),46,385,410,048 free filesystem bytes
and about0.6MiB compact evidence for this run before final reports. No model or
runtime copy/download was created; the existing shared ML pool, historical
evidence and checkout CPU environment remain protected and unchanged.

Private preparation qualification is complete. Numerical blur/fade/coherence,
internal coverage-loss handling, combined outpaint conditioning and latent/infill
owners precede public queue/inference/accepted variants. Public promise statuses
remain unchanged.
