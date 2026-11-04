# Smart Patch generation input capture

## Qualified private Main/CPU boundary

Base `31cc249035786d5e5c162f7e9b0797da75de25ac` (owned mask settings).
This finite phase-4 preparation slice implements a private Main/CPU boundary under PP-007/008 and
[Smart Patch](../features/project/generate-mode/smart-patch-layer.md).
Risk is high because frozen source ownership, package/pending-asset reads,
callback leases and asynchronous Project changes share persistence boundaries.

Main captures one existing Smart Patch's input for a callback. It freezes the
document/layer identity and revision, owned bbox, internal resolution, independent
generation draft, mask descriptor and verified bytes, blur/padding and only the
visible source layers beneath the target. The target and layers above it are
excluded. Actual CPU composition returns the frozen source RGBA and its source
alpha classification. This first slice does not rasterize an effective clipped
mask, derive a four-mode inference classification, resize to internal resolution
or prepare masked conditioning. The original verified PNG is copied to a
Main-only `maskPngPath` inside the callback's leased scratch tree (null for an
empty mask); `maskPngBytes` and context handed to the caller are detached copies.
Mask/source files stay leased through callback use and every composition that
started during that use. Callback settlement closes admission to `composeSource`;
cleanup waits for all already-started compositions to settle, including a sibling
still running after another rejects in `Promise.all`. A retained capability cannot
start a late operation after callback closure. Temporary copies are then cleaned
on success or failure. This is read-only document capture:
no dirty/history/seed change, queue admission, inference, candidate publication,
accepted variant, provenance or `.igs` write is introduced.

Locked and hidden existing targets can be inspected by this read-only capture.
Permission to generate or accept into such targets belongs to future admission
and acceptance, and is not inferred from the authoring tools' restrictions.
Public Smart Patch Generate and variant/preset actions remain unavailable.

## Fixed product decisions for subsequent masked preparation

- A null mask or a verified mask with no nonzero coverage inside the frozen bbox
  is valid. The original descriptor/bytes are retained; future clipped coverage
  is derived separately. This first capture does not compute that clipped mask
  or its coverage, and fabricates no mask revision or bbox change.
- Automatic mode uses actual source alpha and effective mask coverage, following
  Invoke: fully transparent source → `txt2img`; mixed source → `outpaint`;
  opaque source plus no effective mask → `img2img`; opaque source plus nonzero
  effective mask → `inpaint`. There is no user workflow selector or silent
  substitution based on rectangle overlap alone. This is a future masked-worker/
  admission rule, not an inference-mode output of the current capture slice.
- A future completed candidate with a still-existing target may be explicitly
  accepted after that target's inputs change. Keep the frozen result/context;
  derive `outdated` against current inputs. Missing-target recovery remains the
  separate orphaned-candidate contract, with no automatic retargeting.
- Blur is an owned integer project-pixel value; it affects future conditioning/
  compositing and staleness. Padding is Fit-only and does not stale a variant by
  itself; a subsequent Fit that changes bbox does. Defaults16/8 and zero retain
  their current semantics.
- Source/layer context is distinct from reusable generation configuration.
  Regional Guidance remains outside every accepted provenance group. Presets
  do not copy masks, owned bbox, internal resolution, blur/compositing or source
  identities. Those future consumers are not implemented by input capture.

## Existing entry points and adaptation

`ProjectService.withCapturedNormalGenerationInput` and
`project-raster-snapshot.ts` already copy the validated document and byte-backed
pending Raster sources before filesystem awaits, verify saved assets under the
package path lock and retain disposable files through a callback. Existing target
composition verifies exact bbox, output PNG, size, SHA-256 and pinned sRGB ICC.
The Smart Patch extension captures the original ordered document first,
selects only compositing inputs beneath its exact layer ID, binds the owned draft
and bbox, and adds independently verified whole owned mask material. Only source
RGBA/source alpha and original mask metadata/bytes are prepared here. Current empty
Patches contribute no source pixels; flattening accepted variants remains a
future schema/compositor owner.

Invoke source anchors at the local checkout are:
`features/controlLayers/konva/CanvasCompositorModule.ts:662-724` for mode;
`features/nodes/util/graph/generation/addInpaint.ts:127-247` for scaled processing.
The checkout root is `~/Work/sources/InvokeAI/invokeai/frontend/web/src/`.
The latter expands/fades at processing size before resizing its mask back. Our
explicit project-pixel blur therefore needs a deliberate future scale adaptation,
including nonuniform internal resolution. Capture records values and geometry;
it does not execute fade or claim scaled Invoke blur parity.

## Parameter registry and refusal boundary

| Parameter                | Existing boundary and source                                                                     | Effect in this slice                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Source target            | Worker compositor side≤2048, pixels≤4,000,000; `worker-python/src/imagegen_worker/compositor.py` | Reuse finite composition limits; a larger structurally valid bbox may refuse capture without editing the document.                |
| Source PNG               | Main target verification≤32MiB; `project-generation-target.ts`                                   | Verify bytes/hash/ICC/dimensions and refuse tampering or oversized output.                                                        |
| Owned mask               | Side≤4096, pixels≤4,000,000, PNG≤32MiB,≤256IDAT; existing mask codec                             | Verify the actual whole owned PNG. Bbox clipping is a later owner. Null is valid; invalid stored pixels are not treated as empty. |
| Coordinates              | Magnitude≤2,147,483,647; project/mask schemas                                                    | Negative and disjoint world origins retain exact geometry; no canvas bounds are invented.                                         |
| Bbox/internal size       | Document side≤32768; project schema                                                              | Structural validity does not promise inference support. Internal size is frozen without a model admission or resize claim.        |
| Blur/padding             | Each integer0..512; `project-mask-settings.ts`                                                   | Resolve legacy16/8 without injecting fields or dirtying documents; no edge processing or automatic Fit.                           |
| Aggregate input decoding | Existing compositor128,000,000pixels/256layers                                                   | Existing source-validation guards remain; this is an engineering bound, not measured ML capacity.                                 |

Mask descriptor/bytes, source PNG and document owner must agree throughout
verification. Saved-file replacement, invalid asset hash/PNG, worker output
tampering, callback mutation and callback failure must leave the Project and
saved package unchanged and release only this capture's disposable files.
Metadata and already byte-backed source buffers are copied before I/O. Pending
file-backed inputs and saved members are then read, verified and materialized
into the private scratch tree. Close, file replacement or asset deletion during
that pre-callback materialization may explicitly refuse integrity verification;
capture does not promise atomic success against every concurrent close. It never
treats a failed read as an empty mask or substitutes current source bytes.

Once the prepared callback lease has been entered, later edits, Undo/Clear, Save
or close cannot alter or prematurely release its materialized private files and
bytes. Caller-visible metadata must not mutate the private snapshot used by a
subsequent admitted `composeSource`. When the callback ends, new compositions
are refused and already-started work is observed to settlement before filesystem
cleanup. A materialization or callback failure leaves the Project unchanged and
releases this capture's disposable files only after their active consumers end.

## Verification plan

- Real ProjectService +package/pending/history/shadow owners: freeze below-target
  source order, owned draft/bbox/internal/settings/mask descriptor and copy
  already byte-backed buffers before awaited work; independently verify and
  materialize file-backed inputs. Exclude target/above layers and prove a
  neighboring source change matters.
- Null, disjoint and soft-alpha masks: preserve the original whole descriptor,
  world bounds and verified bytes; do not reject a valid mask for its relation
  to bbox or pretend to derive effective coverage. Literal source-only alpha
  classification is independent of that mask. Cropped mask, mode classification
  and internal-scale sampling need the subsequent actual CPU pixel oracle.
- Concurrent editing after metadata capture and integrity refusal during source
  materialization: original input identity remains authoritative without an
  unconditional pre-callback close-survival claim. After callback entry, the
  prepared private lease survives Clear/Save/close; callback mutation/refusal/
  throw cleans disposable data with no document/history/queue/seed effects.
- Real `ProjectService.withCapturedSmartPatchGenerationInput` with the checkout's
  Python `process_request` → `compose-target` compositor through a controlled
  transport: the transport forwards the actual request and response, without
  fabricating pixels or selecting a substitute compositor. Tiny literal RGBA
  expectations in the TS test independently check the published PNG, pinned ICC,
  source order, transforms and source alpha. The Python bridge also records the
  actual loaded compositor path and refuses ML-module loading.
- Verify the original `maskPngPath` exists with exact descriptor bytes during the
  callback and every already-started composition, and is removed with the leased
  source scratch tree after their settlement on success or failure. Prove an
  early rejecting `Promise.all` sibling cannot delete files still needed by the
  other real worker call, and late capability use refuses before starting I/O.
  Caller metadata/byte mutation must not alter private context used by
  `composeSource`. A controlled reply separately covers owner/refusal paths;
  this does not replace actual CPU composition evidence.
- Execute semantic mutations against source ordering/whole-mask ownership/freeze
  with neighboring controls and byte-exact rollback; run impacted tests and
  required typecheck/lint/build serially under existing resource budgets.

No model download, GPU inference or new reusable ML environment is required.
No Electron/browser/UI run is required for this private Main callback slice;
renderer/admission behavior remains blocked and is not claimed as verified here.
Artifact inventory, current-run ownership, physical exit and cleanup follow the
existing artifact lifecycle. Existing mask settings/authoring/Transform evidence
remains historical; it is not counted as execution of this new slice.

## Executed evidence

Evidence root:
`~/.codex/artifacts/imagegen-studio/runs/smart-patch-generation-capture/20261014-capture/`.
This checkpoint qualifies only the private Main callback and actual CPU source
composition; it does not qualify renderer/admission, inference or accepted variants.

- Final-source focused tests: **14 PASS,0fail/skip**,2.73s/reported peak251.6M/
  zero swap, including four actual CPU tests
  making nine production Python `process_request`/`compose-target` calls.
  The controlled transport forwards requests/results; the checkout compositor
  generates the pixels. Independent tiny literal RGBA/ICC/dimension assertions
  verify below-target stack order, exclusion of red content above the Patch,
  empty source, half-opacity/hidden neighbors and unchanged normal full-stack
  controls. Pinned Pillow12.2.0 and actual compositor module path are checked;
  Torch/Diffusers/Compel are not imported. No trained model is loaded.
- Main Service cases retain original mask bytes/descriptor and leased path,
  frozen bbox/internal/draft/settings and source order. Null/disjoint masks remain
  valid, callback mutation cannot poison private inputs, invalid stored mask
  refuses, and prepared leases survive Clear/Save/close. Late composition use
  refuses before I/O; callback exit waits for admitted sibling operations.
- A real lifetime regression was first **RED1** with a null-mask neighboring
  **GREEN1**: one rejecting `Promise.all` branch ended the callback while another
  worker still needed its lease. Pending-operation observation/closed admission
  fixes it. The unchanged assertions pass in the final-source14 GREEN run.
- Affected regression before mechanical lint cleanup: **1852 PASS,0fail/skip**, Main Projects/shared Projects/
  renderer component tests,90.1s, reported peak680.7M/zero swap. This is a test
  runtime measurement, not application performance or inference qualification.
- Final-source required typecheck (prototype+app): **PASS**,16.66s/reported
  peak1.6G/zero swap; the earlier pre-lint run also passed in16.55s.
  Initial lint found28 autofixable ordering/
  braces issues; scoped ESLint fix and Prettier changed no API behavior or test
  assertions. Iterating `Promise.allSettled` over the Set directly is equivalent
  to the original array spread. Final focused/typecheck/current-hash mutations
  have been rerun; required lint/build PASS.

### Semantic probes

Three final-source isolated probes each produced **1 semantic RED +1 neighboring GREEN,
0skip**. `mutation-summary.json` records original hashes unchanged and every
isolated source copy removed; production originals were not left mutated.
The original logs/summary/focused14 evidence are retained under `pre-lint/`;
fresh probes against the final formatted source passed the same semantic
RED/GREEN expectations, with final original hashes unchanged and copies removed.

| Mutation                                     | Observable RED                                                               | Neighboring GREEN                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------- |
| Ignore below-target source scope             | Real CPU empty Patch receives opaque red above instead of transparent source | Ordinary full-stack composition remains opaque red |
| Alias caller mask buffer to private snapshot | Actual private mask byte equality fails after caller mutation                | Null/cleared mask snapshot remains valid           |
| Bypass owned mask verification               | Invalid stored mask reaches callback instead of refusing                     | Null/cleared mask snapshot remains valid           |

### Excluded initial attempt and remaining boundaries

The initial focused13 run had11 PASS/2 failures because test cleanup observations
called `readdir` on a scratch directory legitimately never created by early
refusal (`ENOENT`). The observation helper now treats only `ENOENT` as an absent
empty scratch tree; other filesystem errors still throw. Production behavior and
assertions about ownership/refusal were not weakened. The final14 run includes
the additional lifetime regression described above.

Compact current-run evidence is520KiB, including scripts/results and retained
pre-lint chronology. No bulky payload, model/runtime copy or download was created.
Final lint: **PASS**,33.88s/reported peak3.5G/zero swap. App build: **PASS**,
1.42s/reported peak1.1G/zero swap, with the existing chunk-size warning.
`validation-report.json` records exact checks; `physical-exit.json` confirms
17 collected/inactive units, no active owned test/compositor processes and no
isolated source copies. Final lifecycle is `retained`: about0.5MiB compact
evidence, artifact root29,340,869,462logical bytes (about27.33GiB), free
filesystem46,395,854,848bytes. No bulky payload or model/runtime copy was
created; bulky artifact bytes reclaimed:0. Only compact evidence/scripts are
retained. Existing protected ML shared pool and historical qualification
evidence are untouched; checkout Pillow environment was reused read-only.
Public promise statuses remain unchanged. The next finite owner is effective
clipped mask, four-mode inference classification and internal-scale conditioning
with a real CPU pixel oracle; queue/inference routing, durable candidate recovery,
owned variant Add/Undo/Save, staleness, compositing, comparison and presets remain
subsequent owners. Historical mask settings1835/104/native109 evidence belongs
to its prior checkpoint and is not counted in this private capture slice.
