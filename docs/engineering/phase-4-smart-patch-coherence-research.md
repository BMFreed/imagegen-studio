# Smart Patch processing-space coherence and final world contribution

## Prospective private Main/CPU boundary

Base `844f6f55984d34c522747991d9d296bdc398a872` (private world contribution/fade).
This finite Phase4 extension follows PP-007/008,
[Smart Patch layer](../features/project/generate-mode/smart-patch-layer.md) and
[compositing](../features/project/generate-mode/smart-patch-compositing.md).
Risk is high: frozen caller policy,numeric mask polarity/quantization,worker-created
files and asynchronous capture leases touch document/persistence owners.
The prospective scope below was written before implementation. Executed evidence
is recorded at the end; numerical preparation does not establish public inference
readiness.

The new private `capture.prepareConditioning(worker,profile=default)` freezes a
typed caller-owned profile before the first await. It runs the existing private
preparation within one admitted/drained operation,then calls CPU
`condition-smart-patch` / `smart-patch-conditioned`. Inputs are verified original
WORLD source/effective mask,internal resolution,world-derived mode,frozen owned
blur and detached profile. No renderer/public IPC action or UI is added.

## Settled coordinates and profile scope

The user selected **edge size in PROCESSING pixels**,following Invoke. Owned
blur remains **WORLD project pixels**. The two radii do not share units and must
not be converted into each other through internal/world scaling.

The private caller profile admits exactly:

- coherence mode:`Gaussian Blur`,`Box Blur` or `Staged`,default `Gaussian Blur`;
- integer edge size0..1024 processing pixels,default16;
- finite minimum denoise0..1,default0.

This profile is private operation policy,not newly persisted Patch settings.
No coherence UI,`.igs` field,preset section or new product-control promise is
introduced. The broader compositing document's MVP candidates do not become
implemented controls because this CPU helper admits their algorithm names.
Padding remains Fit-only and does not enter conditioning/fade policy.

This method alone requires internal dimensions8..2048,multiples of8 and at most
4,000,000pixels. Existing `prepareInput`/`prepareContribution` still accept their
previous finite one-pixel processing sizes. Portable document side32768 is not
narrowed,and latent-grid compliance is not proof of model/inference admission.

## Numeric ownership and operation order

Original authored mask remains numeric generate coverage:zero outside,255 full,
soft values retained exactly in the clipped world plane. Existing BICUBIC
processing planes retain numeric soft-coverage semantics but can change alpha
values or lose tiny coverage;they are not promised byte-identical to world alpha.
The original PNG/bounds/id/revision,document/history/dirty/seed/Save and earlier
prepared source/mask artifacts are not replaced by conditioning outputs.

Construct world KEEP before either resize,using actual source alpha:

| Frozen mode | World keep alpha |
| --- | --- |
| `txt2img`,`img2img` | Entire bbox0 |
| `inpaint` |255 minus authored effective world alpha |
| `outpaint` | `ImageChops.multiply(255-authored effective alpha,source alpha)` |

For OUT,combine authored coverage and source alpha numerically BEFORE BICUBIC
resize. For example,source128 and authored64 produce keep95 by Pillow multiply's
integer rule. A binary union or separately resized operands is not equivalent.
No authored mask is substituted into source alpha,and earlier normal OUT's
fixed Gaussian/source-only algorithm remains unchanged.

Resize world keep to internal processing size with BICUBIC,then BILINEAR-reduce
to latent size `internal/8`. Coherence consumes that latent numeric keep in F32.
Latent radius is `floor(edgeSize/8)`:edge sizes0..7 give radius0,which copies the
reduced numeric plane without minimum-denoise/coherence expansion. Fractional
edge sizes or malformed profiles refuse rather than being rounded or clamped.

Implement the pinned Invoke weighted MAX,not an ordinary Gaussian/box convolution:

- Gaussian uses normalized OpenCV kernel with sigma `latentRadius/2.5`,zero
  weights outside the circular radius and F32 image multiplication/MAX.
- Box Blur uses the circular linear-distance kernel `1-distance/radius` in F32.
- Staged uses Gaussian expansion,then the upstream original-vs-expanded threshold
  selection,followed by the shared minimum-denoise threshold.

All positive-radius modes apply the exact threshold `(1-minimumDenoise)*255`,
clip0..255 and truncate to uint8. The operation does not import Torch to perform
MAX;actual numerical parity is checked against the pinned upstream body.

The private response contains six white-RGBA8/no-ICC numeric PNG artifacts:

1. `worldKeepMask`:world bbox,combined numeric keep;
2. `processingKeepMask`:internal size,BICUBIC numeric keep;
3. `latentKeepMask`:internal/8,post-coherence numeric keep;
4. `expandedProcessingKeepMask`:internal size,binary post-coherence keep,
   NEAREST from latent `(keep<255 ?0:255)`;
5. `expandedWorldKeepMask`:world bbox,NEAREST projection of expanded processing
   keep,then union with the original binary world edit core in generate polarity;
6. `finalContributionMask`:world bbox,inverted expanded world keep with the
   existing exact WORLD-pixel blur/distance/curve applied.

The world edit-core union prevents small authored/source edit pixels from
disappearing out of final contribution due to reduction/projection. It does
not fabricate latent edit coverage. `latentMaskHasCoverage` separately reports
whether post-coherence latent keep has any value below255;world-derived mode
remains unchanged. Future inference admission must handle a lost latent mask
explicitly;full final-world core does not prove viable latent conditioning.

TXT/IMG keep0 gives full contribution without inventing inpaint. Null/disjoint
original masks retain the qualified source-only world-mode rule,and original
integrity still refuses when disjoint. Later world mask or bbox changes cannot
silently retarget frozen preparation.

## Source pin and deliberate adaptations

Local Invoke root:`/home/user/Work/sources/InvokeAI`,pin
`9e1540962bcca7f8fa668d7d8e02cf79d75fda3b`.

- `invokeai/app/invocations/create_gradient_mask.py:47-169` defines the three
  modes,processing-to-latent `/8`,BILINEAR reduction,F32 weighted MAX,Staged and
  minimum-denoise threshold/uint8 truncation,expanded binary NEAREST projection.
- `invokeai/frontend/web/src/features/nodes/util/graph/generation/addInpaint.ts`
  constructs scaled source/mask processing,coherence and output fade nodes.
- `invokeai/app/invocations/image.py` provides the existing BICUBIC resize default
  and `expand_mask_with_fade` L2/mask5+cubic curve reused by world contribution.
- `MaskCombineInvocation` in that file uses `ImageChops.multiply`; the pinned
  `addOutpaint.ts` graph combines world masks before processing resize.

The profile's processing gradient matches the pinned upstream numerical body in
36 executed comparisons. OUT multiplication-before-resize also follows Invoke.
ImageGen Studio explicitly adapts source/soft-mask policy,world projected core
restoration and WORLD blur. It does not claim full scaled Invoke pixel
parity or a model-level denoising/quality result. VAE/tensors/infill and the Invoke
graph are excluded;the new production CPU operation must not import Torch,
Diffusers,Compel or trained weights. Native dependencies are reused lazily with
explicit unavailable-dependency refusal and no download/new runtime copy.

## Parameter,path and resource registry

| Parameter/path | Bound/source | Meaning/refusal |
| --- | --- | --- |
| World source/effective/derived planes | Integer side≤2048,pixels≤4,000,000,PNG≤32MiB | Existing finite CPU geometry;source exact sRGB ICC,numeric masks whiteRGBA8/noICC. |
| Internal conditioning size | Each8..2048,multiple8,pixels≤4,000,000 | New-method-only grid requirement;old one-pixel prep and portable side32768 unchanged. |
| Latent dimensions | Internal width/8,height/8;≤62,500pixels total | Exact independent axes,not world bbox/8 and not model-latent capability. |
| Coherence profile | Three explicit enums,edge integer0..1024,minDenoise finite0..1 | Caller-owned frozen metadata/defaultGaussian16/0;not new persisted UI state. |
| Latent kernel | Radius floor(edge/8)≤128,side≤257 | Finite numerical work bound;not measured throughput. Worst full square is66,049weights×62,500latent pixels≈4.13billion multiply/MAX visits before circle pruning. |
| World blur/padding | Blur integer0..512/default16,padding excluded | Existing WORLD fade,independent of processing edge radius/nonuniform scale. |
| Original mask | Side≤4096,pixels≤4,000,000,PNG≤32MiB,≤256IDAT | Existing strict tight/nonempty whole owned input remains verified;derived padding/allzero uses explicit decoder. |
| Inputs | Main-only verified frozen world source/mask references | Paths/hash/bytes/dimensions/ICC/owner must agree;never substitute caller lookalike or current edited bytes. |
| Outputs | Six distinct Main-nominated PNG paths in one operation-owned subtree | Grouped publication/no overwrite/input collision/outside-tree/symlink;exact size/hash/bytes/color/file identity guards. |
| Lease | One admitted conditioning chain | Callback closure refuses late starts;already-admitted preparation/conditioning drains before cleanup. |
| Native dependency/runtime | Existing compatible NumPy/OpenCV/Pillow;lazy loading | No Torch/model/GPU or download;unavailable path refuses explicitly,old Pillow prep stays independent. |
| Verification resource owner | Root,serial bounded CPU tests/source-oracle/probes | Tiny fixtures and physical exit;maximum-size numerical throughput is not claimed by enum/limit tests. |

Profile caps are engineering safety ceilings,not performance measurements. Default
edge16 yields latent radius2/kernel5;extreme profile/dimensions can be materially
more expensive. Qualification must retain its concrete tiny fixtures/deadlines
and avoid running every maximum-size combination as an uncontrolled stress test.
Any additional finite work refusal must be explicit and documented before public
admission;this private slice does not promise arbitrary-profile throughput.

Publication is grouped:failure writing/linking any of six outputs removes only
this operation's partial files after active users exit and publishes no successful
conditioned input. Existing preparation output rollback remains separate. Main
detaches request/profile and immediately snapshots returned metadata before awaits;
caller/adaptor aliases cannot poison validation or a repeated sibling operation.
Main rechecks nominated path,PNG structure/color/dimensions/hash/bytes and physical
file identity before consuming detached output bytes.

No `.igs` schema/coherence setting persistence,new Undo/Save/recovery/seed change,
queue/job/candidate/result,public capability/UI or accepted variant is created.
Already-admitted late work drains despite callback failure/close;retained
capabilities after closure explicitly refuse rather than starting another worker.

## Verification plan

Use real ProjectService/capture,typed Main transport,strict Python parser/protocol,
actual Pillow/NumPy/OpenCV and filesystem publication. Transport may be a bounded
controlled bridge;self-declared test implementations are not production evidence.

- Literal numeric planes include a soft alpha1 circular edit and uniform OUT
  source128×authored64→keep95 BEFORE resize. Assert original/world exact alpha,
  numeric polarity,dimension and each of the six result planes.
- All three modes receive exact upstream-body oracle comparisons across minimum
  denoise0/intermediate/1 and processing edge0..7/8/16. Preserve F32 promotion,
  weighted MAX,Staged original selection,threshold and truncation;ordinary blur
  or a radius rounded instead of floored must fail a distinguishing case.
- Compare anisotropic internal/world shapes:edge remains processing pixels,
  latent sizes use each internal axis/8,projection is NEAREST,and world blur
  distances remain project pixels. Tiny latent loss does not alter world mode;
  original binary edit core remains in expanded/final world contribution.
- Null/disjoint/source-only/full-core cases follow frozen mode,without outside
  authored fade leaks. Derived padded/allzero outputs remain valid;original
  portable owned-mask strict default stays unchanged.
- Reject invalid enums,raw/NaN/out-of-range settings,edge1025,invalid latent grids,
  oversize PNG/geometry,wrong paths/hash/ICC/white pixels/metadata and preexisting
  output. Controlled publication failure proves grouped six-output rollback and
  preservation of earlier inputs or unrelated existing files.
- Real Service operation freezes caller profile before await and preserves
  document/history/dirty/seed/saved-package owners through late edits/close.
  Mutating returned buffers/context/profile/adaptor metadata cannot change a
  repeated operation's frozen inputs. Observe callback closure between stages,
  sibling failure/draining and rejected post-closure reuse via actual progress.
- No Torch/model/GPU imports in the new operation;missing native dependencies
  refuse explicitly while the unchanged Pillow-only preparation neighbor works.
- Root runs isolated semantic faults for processing-vs-world radius,OUT
  multiplication-before-resize,Gaussian/Box/Staged MAX/threshold,projection core
  restoration or lost-latent/world-mode policy. Each distinguishing RED has an
  unchanged neighboring control through the same real boundary;retain exact
  original restoration/physical-exit evidence.
- Root serializes focused/affected TS and Python tests,global Python checks,
  typecheck,lint/build and bounded pinned source-body oracle. No UI change means
  no new visual/browser/public inference capability is claimed.

Evidence and temporary source-only probes follow
[Artifact lifecycle](./artifact-lifecycle.md):inventory,reuse one compatible
environment,no model/runtime copies/downloads,compact raw logs and literal
oracles,physical exit/restoration before disposal,measured retained/reclaimed
space. This prospective documentation itself creates no runtime/model payload.

## Negative scope and later owners

Caller profile is not a new persisted coherence control. Model admission,
infill/LaMa,VAE/tensors,latent denoising/ML execution,GPU,public Generate/IPC,
queue/Retry,staging/candidates/provenance,accepted variants/staleness/composition/
comparison,Regional Guidance and Patch presets remain later owners. Existing
normal OUT's fixed Gaussian conditioning and public inference routes remain
unchanged. Public PP-007/008 status remains «Пока не обещать».

## Executed evidence

Read-only source review found no reachable numerical/order/unit/lease defect.
This was an informed review,not a blind audit. Root executed the checks below
against the working tree over the stated base,with bounded whole-process memory,
zero swap and deadlines. Test runs were serial;final lint and Python typecheck
briefly overlapped under a combined5GiB ceiling. No Electron/browser/GPU/model
run was performed.

- Real Service/Main/CPU final focused suite:53 PASS,including17 new conditioning cases
  (`ts-conditioning-final.log`); unchanged worker/capture/composition neighbors:76 PASS
  (`ts-worker-neighbors.log`). Every new bridge invocation verified the actual
  checkout module identities and no Torch/Diffusers/Compel imports.
- New Python suite:65 PASS (`python-conditioning.log`),including36 byte-for-byte
  comparisons of the pinned actual Invoke numerical body for three modes × four
  edges0/7/8/16 × minimum denoise0/.4/1. The unchanged Gaussian normal-OUT
  neighbor also matches the actual upstream body. After test import/lint cleanup,
  the affected protocol/derivative/compositor/preparation/fade/coherence suite
  passed268 cases (`python-regression.log`).
- Literal Service data proves processing-edge/WORLD-blur units: world40×8,
  left2 authored columns,edge16 and blur4 give a projected boundary at bbox-local
  x24 with internal40×8 and x12 with internal80×8. Relative WORLD fade samples stay
  `[225,137,44]` in both. Padding-only change preserves all derived planes.
- Four isolated source-only semantic mutations each produced exactly1 assertion
  RED and1 GREEN (`mutation-summary.json`): OUT multiply→minimum,disabled Staged
  selection,removed original world-core restoration,and mistakenly rescaled
  processing edge by internal/world width. The first three use single-axis
  authored-mask/profile-mode/alpha neighbors. The units RED contains a paired
  identity→doubled-internal-width experiment; its separate GREEN uses an
  identity-sized Gaussian fixture and is not claimed to be a single-axis sibling
  of that whole test. No import/collection/OOM/timeout failure counted as RED.
  Original source hashes are unchanged,copies were disposed after physical exit.
- One separately bounded maximum-size/profile CPU probe used2000×2000 internal,
  edge1024,Gaussian and minimum.4 (`maximum-profile.log`):1.227s algorithm time,
  66,684KiB process peak RSS,correct250×250 latent/2000×2000 expanded geometry,
  no Torch import. This is a concrete mixed/soft input measurement,not a benchmark
  of every extreme profile or a denoising-quality claim.

The remaining affected TS suite passed1776 cases (`ts-regression.log`),giving1905
distinct affected TS cases together with the focused/neighbor sets above. Final
TypeScript typecheck/global ESLint and global Python Ruff/basedpyright pass.
ESLint's initial2GiB ceiling caused a bounded OOM exit with no surviving process;
the final run reused the measured prior full-repository budget under4GiB,with
peak3,759,013,888bytes and zero swap. Initial scoped TS ordering,TS test style and
Python test-import lint findings were corrected without algorithm changes;failed
attempts are retained separately from semantic mutations. Application build
passes (`build.log`). Final artifact handoff records physical exit of all owned
units,source-only-copy disposal and retained compact evidence;no runtime/model
copies,downloads or protected dependency cleanup occurred.

Compact raw logs,source hashes,process reports and lifecycle registry live at
`~/.codex/artifacts/imagegen-studio/runs/smart-patch-coherence/20261014-coherence/`.
The final `validation-report.json` records this working tree's identities;the
`physical-exit.json` report verifies MainPID0 and empty/absent owned cgroups.
All25 owned execution units have exited. Disposed mutation copies account for
14,424,354 logical bytes;retained compact evidence is under1MiB. The protected
shared runtime/catalog and historical qualification dependencies remain intact.
Numerical preparation,normal-OUT regression and the concrete resource probe
do not qualify native Smart Patch inference,accepted variants or public UI.
