# CFG Rescale with public Regional Guidance

Base: `7e49e25a05fe6d3508006256857af7682c7022ae`. High risk: post-CFG native
consumption, frozen sampling association, capability refusal before composition,
Retry SQL and dispatch, installed worker lifecycle and accepted base provenance.
The finite scope is the existing Illustrious epsilon Current Canvas path with
Euler/Normal, Euler-a/Normal and DPM++2M/Normal or Karras. Default remains zero.

## Current InvokeAI and existing Studio owners

Clean InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:

- `frontend/webv2/src/features/generation/core/graph.ts` forwards the authored
  multiplier to the same denoiser used by `canvas/addRegionalGuidance.ts`.
- `app/invocations/sd/denoise_latents.py` installs `RescaleCFGExt` only for a
  positive multiplier.
- `backend/stable_diffusion/diffusion_backend.py` combines the negative/positive
  predictions, then invokes the post-combine extension before native scheduler.step.
- `backend/stable_diffusion/extensions/rescale_cfg.py` computes per-image standard
  deviations across C/H/W, scales the guided prediction by std(positive)/std(guided),
  then blends multiplier*rescaled+(1-multiplier)*guided in the existing dtype/order.

Studio's ordinary `run_sdxl_pipeline` already forwards guidance_rescale to the
pinned Diffusers0.40.0 SDXL pipeline, whose native operation has the same formula
and position in the loop. Reuse that owner; no new formula, extension manager,
denoising loop, scheduler, clamp, epsilon denominator or precision repair is added.
The same-value tiny CPU/CUDA scheduler-input oracles check actual consumption.
This parameter is distinct from the scheduler's rescale_betas_zero_snr noise policy.

## Finite admission and ownership

The existing product/command/portable range is0..0.99. Public Invoke profiles now
accept exact finite int/float values in that range, excluding bool. Missing draft
data keeps its effective zero semantics; default and historical unknown provenance
are unchanged. Invalid public values refuse before native work. Historical private
profiles retain their zero-only code, message and refusal position.

The separate capability `illustrious-regional-cfg-rescale-v1` is required only for
nonzero public regional jobs. Ordinary `illustrious-cfg-rescale` alone is insufficient:
older qualified regional workers advertised it but still required regional zero.
One strict optional transient state Boolean drives existing Generate/Retry
advisories. Main independently gates preparation/admission, frozen Retry before SQL
and dispatch before scratch creation. Retry reads the frozen value, not the draft.

Existing cfgRescale fields already cross draft, command, queue, frozen reload,
context/request agreement and accepted base provenance. No persisted field,
migration, command field, numeric control or default changes. Private transport
still refuses nonzero. Region data remains excluded from accepted provenance,
Compare and result-derived presets. Existing resource, initialization, scheduler,
precision, geometry, batch, text, alias and mask bounds remain in force.

The native call receives the actual validated value. Original CFG, rescaling,
multistep history, Euler/ancestral updates and decode remain in their owners.
Undefined zero-variance rescaling follows the native operation and existing finite
guards; no successful completion or partial candidate is manufactured. Recovery
retains borrowed-state/RNG/reservation guarantees within the cooperative contract.

## Qualification plan and evidence boundary

Main tests enter actual Service/save/reopen/capture, planner, SQLite/files,
dispatch, receipt and base provenance with controlled catalog/compositor/numerics.
They cover0/.7/.99, explicit regional capability, frozen.7 after draft.2 edits,
old-peer/neutral/private refusals, strict state and actual OS JSONL child transport.

Native tests use real tiny dual-CLIP/Compel, original UNet/schedulers/VAE, static
conversion and publication on CPU/CUDA. Independent original signed predictions
produce a literal CFG/std-ratio/blend oracle for every actual scheduler input.
Separate original scheduler primitives check transitions/history/RNG. Assertions
follow PNG publication and independent quantization of the original native PT.
Zero controls compare exact original ordinary-native PT/RGB. Invalid inputs,
partial failures, zero variance, TI/LoRA and a prepared FP32 VAE retain recovery.

Mutations remove the explicit regional capability check and silently replace the
native rescale argument with zero. Require targeted semantic RED, neutral controls
GREEN, exact restoration and fresh restored GREEN; setup/import/OOM errors do not
count. Resource/prompt changes are not substitutes for the numerical rescale oracle.

Installed qualification reuses the canonical runtime/catalog/exact checkpoint,
four tiny TI files, four tiny LoRAs and two full original VAE files. An in-place
worker payload refresh follows idle proof; no dependency/model/environment copy.
Actual Advanced Options selects.7 for DPM++2M/Karras30, dynamic prefix2of3,
seeds123/124, then Cancel. Save current.2 with the other template/options/mask/
resource edits and invoke frozen Retry124. Require the original.7 on all three
wires, two PNG receipts, Results/Add/Discard/Undo/Redo and Save ZIP/reopen.

Two separately reported backend controls may reuse the verified original durable
Main input after physical Electron exit. They vary only CFG Rescale0/.7 and fresh
request/staging identities through the existing client. The.7 output must match
its original UI.7 RGB, while zero must differ. These are controlled native replays,
not new queue admissions or receipts; original SQL/packages/frozen bytes stay exact.

Serial lower units use3GiB, zero swap and600seconds. Installed UI uses the existing
aggregate12GiB host bound (2GiB launcher/10GiB native); direct controls use one
12GiB process group. These are finite test envelopes, not capacity promises.

Evidence: artifact-relative
`runs/regional-guidance-cfg-rescale/20261106-frozen-strength`. Execution, review,
mutations and the finite controls are recorded below; retained-byte/release gates
remain separate. Existing DPM visual
3 narrow PASS/1 INCONCLUSIVE remains NOT_QUALIFIED; no new visual cohort or seed/
prompt/settings search belongs to this slice. Human/general-quality acceptance,
Anima, other objectives/samplers/modes, release and PP-001/005/007/008 stay unchanged.

## Executed evidence

ROOT:623 distinct Main PASS, including27 new projected cases, and392 distinct
Python PASS, including40 new native cases. A separate27-case Main repeat after
diagnostic/type corrections is not added to the unique total. The six accepted
Python units report453 warnings. TypeScript typecheck, strict Python typing,
scoped ESLint/Prettier/Ruff and build PASS; the existing large-bundle warning
remains. No prototype UI changed.

Two isolated mutations produce18 selections:15GREEN/3semanticRED. Removing the
explicit regional capability check turns the Main target RED before the claimed
composition boundary. Replacing the actual native multiplier with zero turns
CPU/CUDA consumption targets RED after PNG publication: actual scheduler inputs
fail the independent signed-prediction oracle, and reopened RGB differs by177/189
channels. Neutral controls remain exact, and restored source/PNG bytes return
GREEN. The complete1,500-file mutation copy and live workspace remain restored.

The canonical worker is refreshed in place, with52 verified Python modules and
the new capability. Dependencies, models and configuration are reused. Installed
native-r1 passes19 grouped checks in413.080s (414.220s bounded unit): real Advanced Options selects.7,
DPM++2M/Karras30 and dynamic prefix2of3 produce A123/C124; Cancel precedes saved.2
and template/options/TI/mask/LoRA/VAE edits. Original frozen Retry124 still consumes
.7. Three original wires, two PNG receipts, signed Results/browser decoding,
reviewed Raster Add/Discard/Undo/Redo and explicit Save ZIP/reopen preserve the
original.7 accepted base provenance and current.2 saved draft. Prior SQL rows,
packages, accepted history and candidate bytes remain preserved.

After physical Electron exit, the separate controls-r1 unit completes exactly
two original installed-client requests in73.932s. The existing queue owner first
verifies terminal A123's genuine durable Main input; controlled copies change
only CFG Rescale0/.7 and request/staging nonces. No queue admission, status write
or candidate receipt is created. The.7 replay matches the original UI output
at every decoded RGBA channel. Zero differs by2,835,194 RGB channels across
1,042,250 pixels. An independent Pillow reopen verifies all four output PNGs,
dimensions, ICC and these contrasts. Both backend workers close physically;
all SQL table hashes, original frozen input/tree, own packages, resources,
source/bundle/configuration and current runtime companion remain unchanged.
This establishes finite trained numerical influence and replay association,
not better image quality, visual regional acceptance or another UI lifecycle.

Independent frozen source review is CLEAN for23 deltas/3 additions, all1,497 base/
1,500 current members and six retained primary-source pins. A separate bounded
source-only review of the941-line direct-control helper is CLEAN; virtual-path
typing reports zero diagnostics without copying a file into the repository.
Neither review independently reruns ROOT's native results.

Excluded diagnostics remain retained: the first Main fixture supplied an extra
dispatcher constructor argument, causing18 setup failures; the corrected suite
passes27 and the broad623. Initial Python static checking from the wrong cwd
reported nine import-layout errors; the correct worker configuration passes.
Two return casts and Node assertion narrowing/diagnostic fixes preserve inputs,
order and assertions; original authored beforeimages are retained byte-exact.
The old public DPM refusal fixture now tests out-of-range1 instead of newly valid
.25, and its expected code follows public INPUT_INVALID. The ready-capability
list gains only the new string. These are not semantic mutation REDs.

## Retention boundary

All2,897 entries of five exact owned payloads are retained in a verified no-follow
archive, including the original UI/backend PNGs, reports, native fixtures and
restored mutation copy. The one wholly owned two-link negative fixture preserves
both byte streams and explicit inode topology; literal symlinks are not followed.
Thirty external-input entries retain the three own packages, exact tiny TI/LoRA
files, own queue inputs and consistent SQLite backup. Full checkpoint/VAE weights,
current runtime/catalog/configuration, saved business data and the refreshed
worker companion remain protected dependencies. Complementary independent
source/docs/retained-byte audit is CLEAN: archive/current metadata and bytes,
three IGS packages, SQLite integrity/FKs/21 migration hashes, all control-before
SQL hashes, independent mutation177/189 RGB contrasts and trained/UI pixel
associations reconcile. That audit does not rerun native inference or certify
physical release.

ROOT then confirms26 ended recorded units, the exact1,500-file restored mutation
copy and current source, all readers READFINISHED, and248 lifecycle records with
no incoming exact-child dependency. After verified retention, five exact idle
payloads are disposed, reclaiming53,858,304 allocated bytes in the deletion-only
interval. The approved hardlink group has witnessed2→1→0 transitions; no external
files or dependencies are deleted. Lifecycle is retained with payloads empty.
Its earlier omission of the controls path was corrected before release gates.
Finalization changes only these three documents (cleanup and explicit timing
labels); implementation, tests and harness remain qualification-exact.
