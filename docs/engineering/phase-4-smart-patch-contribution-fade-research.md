# Smart Patch world contribution core and external fade

## Qualified private Main/CPU boundary

Base `888fc768b7fb276911ca6e11acfdc5e91e4e08ac` (effective-mask/internal-size
preparation). This finite Phase4 extension follows PP-007/008,
[Smart Patch layer](../features/project/generate-mode/smart-patch-layer.md) and
[compositing](../features/project/generate-mode/smart-patch-compositing.md).
Risk is high: immutable frozen inputs and worker-created output files share
asynchronous capture leases with the existing document/persistence owners.
The prospective scope and verification plan were written before implementation.
Implementation and qualification are complete for this private boundary; executed
evidence below does not establish public Generate readiness.

The private `capture.prepareContribution(worker)` chains the existing real
`prepareInput` path inside one admitted/drained capture operation, then invokes a
new typed CPU `fadeSmartPatch` transport. It adds a fourth derived output:
world-bbox numeric white-RGBA/no-ICC contribution alpha. The result remains private
prepared geometry; no inference,staging or accepted pixels are published.

The private wire operation is `fade-smart-patch`:effective-mask/source references,
frozen `mode`,`maskBlur`,and `output:{stagingRoot,contributionMaskPngPath}`.
The response is `smart-patch-faded` with numeric `contributionMask` metadata.
Main nominates `world-contribution-mask.png` as the fourth path;the returned
prepared input owns detached `contributionMask` bytes/identity.

## Settled product rule and ownership

The user selected the Invoke-style distinction: authored soft alpha stays in
the generation-conditioning input,while output contribution has a binary/full
core and external fade. Soft alpha1/64/128/255 remain unchanged in the existing
world effective and internal processing planes. They all seed the same binary
contribution core when nonzero; a soft painted core does not directly attenuate
the eventual generated output. This slice does not yet execute conditioning or
blend any generated image into the Project.

Main freezes the original document/layer identity,revision,owned bbox/internal
size,draft,whole verified mask,source below the target and mask settings through
the existing capture owner. It passes the frozen world-derived mode and owned
blur to the fade operation. Padding is excluded: it is Fit policy,not a pixel
operation. Caller/adaptor mutations and later edits/Undo/Clear/Save/close cannot
replace these private inputs or alter a sibling operation's snapshot.

Each world pixel's contribution core follows this explicit mode table:

| Frozen mode | Binary/full contribution core                                                 |
| ----------- | ----------------------------------------------------------------------------- |
| `txt2img`   | Entire bbox255                                                                |
| `img2img`   | Entire bbox255                                                                |
| `inpaint`   | 255 exactly where clipped authored world alpha>0;0 elsewhere                  |
| `outpaint`  | 255 where authored world alpha>0 OR actual world source alpha<255;0 elsewhere |

The OUT union combines authored edit coverage and source holes/soft alpha without
overwriting either original plane or treating authored coverage as source alpha.
Existing strict source policy remains all0/all255/mixed,with the prior explicit
differences from Invoke's source transparency rule. World mode is decided before
internal resizing. Internal coverage loss is still reported by
`processingMaskHasCoverage`; the new contribution helper does not redefine mode
or qualify a lost-conditioning mask for inference.

Clip authored mask to the world bbox first. A null mask,disjoint original mask or
hole-only clipped region uses the existing source-only mode. Outside original
pixels cannot seed fade into bbox from beyond its edges. In opaque source-only
IMG mode,the whole bbox contributes by the table above; this is not an invented
mask revision or automatic fit. Original tight owned-mask PNG and bounds remain
verified,including disjoint input.

## Fade algorithm and coordinate system

Build binary keep polarity from the contribution core:0 in the core and255
outside. For blur0,the contribution is exactly the binary core. For positive
blur,use the pinned Invoke algorithm: threshold keep values at0,OpenCV
`distanceTransform(DIST_L2,5)`,and its cubic NumPy fit in the band
`0 < distance < blur`. Control points are
`x=[0,1/blur,0.2,0.8,1]`, `y=[0,0,0.2,0.9,1]`; clip the polynomial to[0,1] and
quantize `(value*255).astype(uint8)`. Keep remains exactly255 at/beyond the band;
invert back so contribution is255 in the core and0 at/beyond the fade radius.
Full core remains all255;empty core remains all0. There is no contribution
outside the world bbox. Distances and blur are project pixels,independent of
internal width/height and any later ML resolution.

The cubic is a least-squares fit,not an interpolating guarantee of a full1px
outside ring. At default blur16,the first axial outside contribution is247;
only the actual binary core is guaranteed255. Literal tests must preserve that
source-equivalent value rather than impose a different idealized fade.

This is an explicit coordinate adaptation. Invoke's scaled `addInpaint` runs
coherence/expansion/fade at processing size and then resizes back. Here the
contribution geometry is computed directly from world planes,independently of
the internal-size outputs already produced by `prepareInput`. It is not a fade
of the resized mask and is not resized back from processing space;any later
ML-scale transformation has a separate owner. Copying a numeric processing radius is not claimed
to produce full scaled Invoke parity. The fade calculation reuses its exact
keep-polarity distance/curve,not its graph or a new alternative backend.

This is **pre-coherence geometry only**. Later Gaussian edge coherence,latent
conditioning or infill may expand the base edit area and need to feed the proper
base into final output contribution. This helper is not the final inference mask
or proof that the current four planes are ready for all ML modes. It adds no
coherence/fade controls beyond the already-owned blur UI.

NumPy/OpenCV imports are lazy and required only for nontrivial positive-radius
fade. Unavailable native dependencies explicitly refuse that case with
`INFERENCE_UNAVAILABLE`;there is no fake
Pillow approximation or automatic download. The existing Pillow-only
`prepareInput` stays available and unchanged. The new path does not load Torch,
Diffusers,Compel,trained model weights or a GPU runtime.

## Paths,refusal and resource registry

| Parameter/path                   | Existing/declared bound                                              | Meaning/refusal                                                                                                            |
| -------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| World bbox/source/effective mask | Integer side≤2048,pixels≤4,000,000                                   | Existing finite CPU preparation;negative world origins valid,not new canvas/document bounds.                               |
| Internal processing size         | Integer side≤2048,pixels≤4,000,000                                   | Existing preparation bound;not fade geometry or latent-grid/model admission.                                               |
| Original owned mask              | Side≤4096,pixels≤4,000,000,PNG≤32MiB,≤256IDAT                        | Existing strict whole input verification unchanged,including disjoint original.                                            |
| Blur                             | Owned integer0..512,legacy default16                                 | Project-pixel external fade;0 gives exact binary core,no rounding/clamping of invalid inputs.                              |
| Padding                          | Owned integer0..512,default8                                         | Retained capture metadata only;excluded from fade payload/semantics.                                                       |
| Derived numeric PNG              | Each≤32MiB,exact bbox size/hash/bytes,whiteRGBA8,noICC               | Existing explicit derived codec permits padding/allzero;portable owned-mask default stays tight/nonempty.                  |
| Source PNG                       | Exact bbox RGBA and pinned sRGB ICC                                  | Verified actual alpha drives OUT core;source bytes are not changed or republished as generated pixels.                     |
| Contribution path                | New Main-nominated fourth path in the operation-owned subtree        | Distinct inputs/outputs,no overwrite/symlink/outside-tree output;partial artifacts cleaned after active consumers end.     |
| Lease lifetime                   | One admitted `prepareContribution` drains the preparation+fade chain | Callback closure refuses new work but cannot end already-admitted fade between its two stages.                             |
| Native dependencies              | Existing pinned NumPy/OpenCV in a compatible CPU environment         | Explicit missing-dependency refusal,no network/download/new copied environment;old Pillow preparation remains independent. |
| CPU test child                   | Bounded tiny literal fixtures,finite deadline,root sole actor        | NumPy/OpenCV/Pillow actual production code is real;no Torch/model/GPU load.                                                |

Preparation's three grouped outputs retain their existing rollback. New fade
publication owns only its fourth output;failure creates no successful returned
contribution result and preserves inputs. The whole operation remains within the
capture scratch subtree and drains before cleanup on success,callback failure or
a sibling rejection. Later-capability reuse after callback closure refuses.
Mode/blur,destination and source/mask metadata are detached before asynchronous
adapter/verification boundaries. Output path,PNG structure/dimensions/color,
hash/byte size and file identity are verified before handing caller-owned bytes
to the callback.

No Project document/history/dirty/seed/Save,recovery/provenance,`.igs` schema,
normal OUT conditioning or public worker admission is changed by this operation.
Larger structurally valid document settings can still refuse this finite CPU
boundary;no document ceiling is lowered and no model capacity is inferred.

## Verification plan

Use real Service/capture,typed Main transport,strict Python parser/protocol,
Pillow/NumPy/OpenCV and filesystem publication. Transport may be a bounded
controlled bridge;test-local fade implementations do not prove production code.
Do not launch the public UI or trained ML merely to test the private helper.

- Literal axial/diagonal oracles at radii4 and16 distinguish OpenCV mask5/L2 and
  the pinned cubic curve/quantization. Assert core255 and distant0 exactly,not
  only monotonicity or resemblance. Blur0/empty/full boundary cases retain exact
  masks;TXT/IMG output all255 independent of authored soft mask.
- Exhaust the four-mode core table,including source alpha1/128/254/255 and
  authored alpha1/64/128/255. OUT uses the union,INP soft values seed full core;
  existing effective/internal planes and original owned PNG remain soft and
  unchanged. Null/disjoint/hole-only authored coverage does not invent inpaint
  or leak outside original pixels into the bbox edge.
- Compare equal world inputs at different/anisotropic internal sizes:contribution
  bytes stay identical,and same world blur keeps project-pixel distance. Current
  processing-mask coverage-loss metadata and world mode remain unchanged.
- Real Service tests freeze blur,source and masks before asynchronous work and
  preserve Project/history/seed/package state. Late edits and returned bytes/
  context/adaptor result mutation cannot poison repeated operations.
- Start contribution while the callback is open,then let callback closure occur
  between preparation and fade;the admitted chain finishes with leased files.
  Observe sibling failure/drain and physical progress rather than fixed sleeps.
  A retained post-closure capability cannot start another operation.
- Exercise wrong path/dimensions/hash/byte size,nonwhite numeric PNG,ICC injection,
  stale source input,preexisting output,partial publication and native-dependency
  refusal. Existing Pillow preparation remains GREEN when native fade refuses.
- Root executes isolated semantic faults for OUT authored/source union,soft
  contribution core,world/internal blur geometry or exact fade polarity/curve.
  Use an unchanged neighboring control through the same production boundary;
  retain RED/GREEN and byte-exact restoration/physical-exit proof.
- Root runs focused/affected TS and Python tests,typecheck,lint/build and global
  Python checks serially under existing budgets. No UI/prototype change means
  these results do not claim a new browser/visual/public Generate capability.

Artifact evidence follows [Artifact lifecycle](./artifact-lifecycle.md):inventory
before execution,one compatible reused environment,compact evidence,no heavy
copies/downloads,physical exit/restoration before disposal and measured retained/
reclaimed space. This documentation work creates no runtime or model payload.

## Negative scope and later owners

Coherence/edge expansion,latent conditioning,LaMa/infill,ML execution,public
admission/queue/Retry,staging/candidates/provenance,accepted variants/staleness/
compositing/comparison,Regional Guidance and Patch presets remain later owners.
The new geometric OUT union does not retroactively change existing normal OUT
source-only conditioning or assert that authored Smart Patch OUT is runnable.
Public PP-007/008 status remains «Пока не обещать».

## Executed evidence

Evidence root:
`~/.codex/artifacts/imagegen-studio/runs/smart-patch-contribution-fade/20261014-fade/`.
The implementation authors performed self-review; this is not a blind audit.
Transport seams are controlled, while ProjectService/capture, Main file validation,
Python protocol/parser, Pillow/NumPy/OpenCV and publication are real.

### Final checks and actual pixels

- Final affected TS regression: **1888 PASS,0fail/skip**,107.97s,observed group
  peak591,106,048 bytes,zero swap (`projects-regression.log`). It covers all Main
  Projects/shared Projects/renderer component tests, including17 new contribution
  Service cases and the original preparation/capture cases on final source/tests.
- Final affected Python regression: **203 PASS,0fail/skip**,3.42s,observed group
  peak553,807,872 bytes,zero swap (`python-regression.log`). Protocol,generation
  protocol,derivatives,compositor,target compositor,preparation,new fade and
  existing normal OUT conditioning are included. The new50-case fade set includes
  **21 actual pinned Invoke numerical-body comparisons** at radii0/1/2/4/5/16/512
  for mixed/full/empty binary masks. Original OUT comparisons use CPU Torch; the
  new path/bridge and new fade tests load no Torch/Diffusers/Compel or models.
- Final required `pnpm run typecheck`: **PASS**,20.04s,observed group peak
  1,805,852,672 bytes,zero swap (`typecheck-final-r3.log`). Global `pnpm run lint`:
  **PASS**,37.46s,observed group peak3,883,978,752 bytes,zero swap
  (`lint-final-r3.log`). Global Python Ruff and basedpyright pass with0 type errors/
  warnings (`python-ruff-final.log`,`python-typecheck-final.log`).
- `pnpm run app:build`: **PASS**,1.62s,observed group peak1,183,371,264 bytes,zero
  swap (`build.log`); existing large-chunk warning remains. There is no UI or
  prototype change and no browser/Electron/installed inference qualification.

Actual decoded pixels verify the default16 axial contribution row
`[255,255,247,230,212,193,172,151,130,109,89,70,52,36,23,12,5,0,0,0]`,radius4
`[255,255,225,137,44,0,0,0]`,and diagonal/knight distances that distinguish
OpenCV5/L2 from Manhattan or exact Euclidean substitutes. Binary core preserves
soft world/processing inputs; OUT covers source alpha0/1/128/254 and authored
coverage even over opaque source. Equal world inputs at different/anisotropic
internal sizes and padding0/512 produce identical contribution bytes. Null and
touching-disjoint masks retain IMG whole-bbox contribution; TXT and uniform128 OUT
remain whole-bbox. Full soft core at blur512 has no invented image-border fade.

The Service tests retain frozen blur despite later real setting changes, exposed
context/byte mutation and adapter input/reply mutation. An admitted chain finishes
fade after callback closure between its two stages and cleans leased files only
after settlement; retained late calls refuse. Wrong numeric RGB fails after actual
publication and is followed by an unchanged successful operation. Python checks
also cover source/mask hash,dimensions,RGB/ICC,mode/blur/extra-field refusal,
missing native dependencies with a real Pillow preparation neighbor,preexisting
output preservation and failure rollback after publication.

### Semantic sensitivity and corrected checks

Each isolated final-source probe produces **1 semantic RED +1 GREEN neighbor,
0skip** through the same real Service/CPU boundary (`mutation-summary.json`). The
neighbor changes one input condition, rather than replacing the subject with a
test-local fade.

| Fault                                                      | Observable RED                                  | One-condition GREEN neighbor                                                    |
| ---------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| Main sends padding instead of owned blur                   | Exact radius4 outside bytes differ              | Same stripe/mask/settings with source alpha0 still yields full TXT contribution |
| OUT drops authored coverage from union                     | Opaque authored pixels become transparent       | Same source/bbox/settings with authored mask null retains source-hole coverage  |
| Threshold authored core at127 instead of any nonzero alpha | Weak alpha1/64 no longer seed full contribution | Same stripe/mask/blur0 with source alpha0 retains full TXT contribution         |

Initial focused runs before the final typing/control edits were47 TS PASS and50
Python PASS (`focused-ts.log`,`focused-python.log`). Final regressions above execute
the corrected source and three additional single-condition Service controls.
The initial basedpyright attempt found8 annotation errors: Pillow's generic extrema/
point signatures and a redundant protocol mode cast. Verified L-channel extrema
are explicitly typed,point transforms use256-value LUTs,and the redundant cast is
removed. Initial lint found6 test key-order errors; after the three controls were
added,a later attempt found2 Array-constructor style errors. Key ordering and
numeric `Array.from` callbacks corrected these without weakening assertions.
Those compile/style failures are retained separately and are not semantic REDs.
After validation, formatting the Python test bridge changed only one ternary's
line wrapping; its complete parsed AST is unchanged (`bridge-format.json`). All
six changed Python files pass the worker's line100 formatter configuration.

### Physical exit and artifact lifecycle

`physical-exit.json` confirms **21 owned units exited with MainPID0**, no active
owned unit, no mutation source/test mirrors and exact final production/test hashes.
Three source-only probe mirrors/copies were disposed:7,556,589 logical file bytes;
physical filesystem blocks reclaimed were not independently measured.
`artifact-lifecycle.json` records final root29,341,977,855 logical bytes (about
27.33GiB),46,445,481,984 free filesystem bytes,and514,358 compact run bytes before
final reports. Existing shared ML resources and pinned historical qualifications
are untouched; no model/runtime copy or download was created. Only compact
evidence is retained. All heavy checks were serial with memory limits,zero-swap
guards and deadlines.

Private pre-coherence contribution geometry is qualified. Edge coherence,latent
conditioning/infill and actual masked inference/queue/accepted variants remain
next owners; public PP-007/008 status remains unchanged.
