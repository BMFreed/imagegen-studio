# Selected VAE and precision with Regional Guidance

Base: `5168802cab63e554ad608a15da2ae41a41c25036`. High risk: exact resources,
native compute precision, frozen queue/Retry and accepted portable settings.
Scope is the current public Illustrious epsilon route with existing static
batches, Euler/Euler a, global LoRA and global/regional TI. No new UI, schema,
recipe fields, generic adapter or Anima behavior is introduced.

## Current sources and ownership

Current clean InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:

- `frontend/webv2/src/features/generation/core/graph.ts` chooses a compatible VAE
  override and passes the selected precision to the final `l2i` node.
- `app/invocations/model.py::VAELoaderInvocation` supplies the selected VAE.
- `app/invocations/vae/latents_to_image.py::LatentsToImageInvocation` casts both
  VAE and raw latents before scaling, native decode and denormalization.

Ordinary Studio already owns exact standalone VAE loading through
`inference_external_vae.py` and policy configuration through `inference_vae.py`.
Its `Auto` preserves native `force_upcast`; manual FP16/FP32 override the policy.
Loading remains FP16, then FP32 compute uses those loaded values; this does not
introduce FP32 checkpoint loading or recover precision lost during loading.

The pinned native SDXL pipeline's temporary upcast/restore changes borrowed
VAE storage. A permanently FP32 VAE alone also fails: native CUDA latents remain
FP16, and its mismatch branch repairs only MPS. This is why merely removing
the old admission ban is insufficient. The adaptation was disclosed before edits.

New public execution profiles reuse Invoke's separation: prepare the fresh
worker-owned selected VAE at its effective dtype before borrowing; run the
unchanged original native denoising loop with `output_type="latent"`; then cast
the raw terminal latent before scaling and call the actual native VAE decoder
inside the existing reservation and finite-output guards. No diffusion loop,
fallback, borrowed dtype change or restoration algorithm is added. New decoded
image dtype is independent of the FP16 UNet/CLIP lane. Legacy public
Embedded/FP16 and all old private profiles retain their prior execution path.

## Frozen identity and capability

Reuse `FrozenGenerationVae`, `workerVae`, `frozenVaeFieldsAgree` and
`reverifyFrozenGenerationVae`. Full saved reference, path, size and digest remain
in existing context/worker payloads, as does the selected precision. Embedded
null and historical absence retain their existing distinct storage semantics.
Default and later Project edits do not replace the original selection.

The additive `illustrious-regional-vae-v1` capability requires qualified worker
0.14/public regional support for external VAE or effective precision other than
FP16. Old peers remain valid for public Embedded/FP16. Action state/advisory,
capture, Retry, processor and client use the same rule; Queue Retry derives the
requirement from frozen data. Exact VAE/precision agreement and resource
reverification precede admission/staging/files/SQL and original frozen Retry SQL.
The logical and native bundle retain VAE descriptors; unlike recipe-owned TI,
there is no independent recipe VAE loader or descriptor stripping.

## Parameters and finite acceptance

Existing job, geometry, alpha, LoRA, TI, conditioning-row and attention ceilings
remain unchanged. One selected VAE uses the ordinary complete pinned architecture
bound:334,615,452 maximum tensor-payload bytes plus its32MiB header and eight-byte
prefix. This is a snapshot bound, not a peak-memory promise. State validation
uses bounded8Mi-element scans. At four million pixels, a float32 RGB tensor
contains48,000,000 payload bytes; CPU conversion/PNG/native intermediates remain
additional. Serial execution retains the12GiB aggregate host/zero-swap/600-second
envelope, with2GiB launcher and10GiB native scope, not a general capacity claim.

Lower acceptance covers Embedded/external and all three authored precision
values, Auto with both native policies, exact identity versus Default/same-byte
refs, unsupported peers before composition, missing/changed frozen VAE before
Retry SQL, batch atomicity, LoRA/TI neighbors, actual decoder input/weight/output
dtypes, independent pixel quantization, preserved borrowed state and recovery.
Mutations must challenge a real capability/resource refusal and native decode
precision/consumption, with unaffected controls and exact source restoration.

Installed qualification reuses the canonical runtime, official Illustrious v0.1
and two already retained full standalone VAE files. A is the native VAE extracted
from a documented NoobAI epsilon checkpoint; B is an explicitly artificial
decoder-bias control, not a separately trained VAE. Their248-tensor layouts are
qualified by real ModelService. Default B must not replace selected A/FP32.
The existing three-wire/two-PNG batch/Cancel/frozen Retry flow saves later
Embedded/FP16 authoring edits, then verifies original A/FP32 accepted provenance,
Results/Add/Discard/Undo/Redo/Save ZIP/reopen. No new model/environment copy or
download is required. Different-seed outputs establish ownership, not VAE quality.

Evidence directory: artifact-relative
`runs/regional-guidance-vae/20261106-selected-precision`.

## Executed evidence and boundaries

ROOT records **484 distinct Main PASS**:445 affected neighbors and39 focused
cases, including23 new VAE cases and existing advisory/Retry coverage. Genuine
Service/capture/planner/SQLite/files/receipt/provenance owners are exercised;
the lower Main fixture explicitly substitutes model verification, composition
and native inference. A returned-reference substitution test exposed a missing
defensive saved-reference check in the regional resolver wrapper; the guard now
refuses a different valid same-byte catalog identity before publication.

Python: **409 distinct PASS /125 warnings**:358 ordinary/regional LoRA/VAE/protocol
neighbors plus51 new cases, split into18 native matrix and33 refusal/recovery
cases in fresh3GiB units. Real small CLIP/UNet/VAE, Compel, native schedulers,
selected VAE snapshots and original decoders are used where claimed. Independent
decoder-input, image-tensor and RGB8 readback assertions follow real PNG
publication. Auto true/false, manual policies, unchanged native predictions,
LoRA/TI coexistence, stateful-module refusal and fresh recovery pass. The worker
handoff subset explicitly substitutes checkpoint loading/publication; the
installed run below closes that consumer boundary separately. Full TypeScript
typecheck, scoped strict Python typing, lint/format and fresh app build pass.

Three isolated mutations execute18 selections: **15GREEN/3semanticRED** with
neighboring controls and exact restoration of all1,492 source files. Missing
capability and pre-SQL frozen-file checks fail their Main targets. Moving the
FP32 cast after half-precision division reaches original decode and PNG
publication, then fails the independent actual decoder-input assertion. Legacy
Embedded/FP16 remains GREEN. The semantic gate measures actual native input;
independent retained-PNG comparison additionally finds six changed target RGB
channels, zero changed control channels and exact restored bytes.
Independent core/boundary source reviews and completed-evidence audit are CLEAN
within their stated limits; none independently reruns ROOT's runtime checks.

Installed **native-r1:17 grouped PASS /282.788s**. The same canonical noneditable
worker0.14 is refreshed in place with52 Python modules and the new capability.
The original official Illustrious v0.1, existing full native VAE A, artificial
decoder-control B and existing LoRA/TI fixtures remain exact. Real UI resets and
selects A despite Default B, moves precision through Auto to FP32, then admits
one static batch123/124. Exactly three regional wires yield two completed
receipts/PNGs, one Cancel and66 original progress events. Cancel observes
steps5/6; saved Embedded/FP16, LoRA/TI, sampler/seed and regional edits cannot
change frozen Retry A/FP32. Two independent PNG readbacks, Results, cross-session
Add1/Discard1/tombstones, Undo/Redo and two Save ZIP/reopens pass. The accepted
Raster records original A/FP32 and configured LoRA/global TI; later authoring
remains Embedded/FP16. Prior business SQL/packages/candidate bytes stay preserved,
with normal Home index timestamps and two receipt-counter increments explicit.
Different-seed PNGs establish association, not installed VAE pixel causality.

Excluded attempts remain retained: the old blanket Embedded/FP16 advisory
expectation; two Main fixture errors (explicit undefined invoked a helper's FP32
default, and a non-UUID VAE model ID failed portable provenance); and the
returned-reference refusal before its production guard. Initial Python typing
used the wrong project root/working directory, followed by test-only annotation
diagnostics. A grouped51-case native attempt was OOM-killed at3GiB after21.983s;
its partial output is not PASS or semantic RED. A separate diagnostic produced
14PASS/1FAIL because the reused observer counted only Euler steps. A transparent
original Euler-a delegate fixes that observer; assertions are unchanged. Fresh
18+33 units pass below the same3GiB ceiling. The later typed empty-bindings fixture
function and scoped curly-brace fix do not change accepted assertions.

No automatic precision fallback, generic borrowed-VAE repair, FP32 source-weight
loading, architecture expansion, trained VAE quality, visual/human, Anima,
capacity or release qualification follows. PP-001/005/007/008 remain unchanged.

## Retention and delivery

Original source freezes, mutations/RED/control/restoration, logs, native outputs
and input packages are archived separately from disposable source/native scratch.
The two full VAE originals remain protected at their existing cross-run paths,
with streamed SHA/header verification and direct dependency records from the
current catalog/runtime owner. They are not duplicated into every run archive.
Independent retained-byte/input audit is CLEAN:all1,625 own entries and30 input
entries match their archives/current metadata; both protected full VAE originals
match their SHA and248-tensor F16 layouts. SQLite integrity/FK and all21 migration
hashes verify. The three frozen handoffs/queue rows are completed123, canceled124
and completed Retry124; there are two healthy receipts. Both PNGs and all three
packages independently reopen, with accepted seed123 Raster/provenance exact.

After fresh physical-idle proof,28 ended-unit checks, exact source restoration,
244-lifecycle incoming checks and all-reader completion, ROOT removes exactly
`native-r1`, `mutation-source` and `mutation-native-payloads`:
**44,277,760 allocated bytes** reclaimed during the deletion-only interval.
All1,655 archived entries remain available for reconstruction. Lifecycle is
`retained`, with no disposable payloads. The current runtime/catalog, LoRA/TI,
full VAE originals and refresh/config/source companions remain protected.
Reviews read source/retained data; they do not independently certify runtime
or physical deletion. A later final review reads only the retained archives.
