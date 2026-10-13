# NoobAI V / DPM++ 2M Karras: observable numerical refusal

## Scope and entry

Entry: `c96aa176617daf70b5f80ce5aad2770314919874`, clean `master`.
This is a high-risk worker/queue diagnostic change under PP-004/005/007/008,
[worker protocol](../specs/05-worker-protocol.md) and
[generation results](../features/project/generate-mode/generation-results.md).
Public readiness stays unchanged. The original
[wrong-EPS Karras failure](phase-2c-noobai-vpred-dpm-research.md) has no retained
traceback; fresh evidence cannot recover or prove its exact original cause.

Confirmed by source inspection: `finite_lora_outputs` guards both UNet and VAE
decoder but blames LoRA for any non-finite output. It is installed only with a
LoRA. The separate VAE guard already covers VAE modules. Main recognizes only
the exact VAE refusal; UNet refusal becomes a generic failed job. Stderr is
discarded. A finite-input/wrong-EPS diagnostic previously observed NaN at the
fourth UNet call, before VAE decoding; this is historical evidence, not a new run.

## Implementation and invariants

Keep the JSONL version and error shape. Use an unconditional UNet-only finite
guard and retain the separate VAE guard. Name the observed failing stage without
claiming LoRA or prediction type caused it. Main maps only the correlated exact
Illustrious error literal to `GENERATION_UNET_NON_FINITE`; arbitrary messages,
paths, unrelated codes and Anima remain sanitized generic failures. The queue
stores and exposes a Main-owned safe message. No automatic model-setting change.

Failure must settle as failed after confirmed worker exit, never publish a PNG,
candidate, completion receipt, accepted layer or provenance, and never advance
the operational seed cursor or modify the saved `.igs`. Retry retains frozen
inputs. Existing VAE behavior remains intact. Guard handles are removed on
success/failure. A wrong prediction type is allowed to fail before pixels;
pixel inequality is not a required oracle for that invalid recipe.

## Finite verification plan

- Real pinned CPU UNet/VAE modules through the production worker entry point;
  NaN/Inf injection only at the numerical output boundary, healthy neighbors and
  hook cleanup. Mutation disables the actual guard in an isolated source copy.
- Real JSONL child -> Main processor -> SQLite/staging/Save tests, exact UNet and
  VAE refusals plus malicious/unrelated/untyped neighbors. Mutation removes the
  actual Main mapping; restored and neighboring cases must remain green.
- One existing worker0.14 runtime/catalog, offline and sequential. Exact
  Cyberfalafel V SHA `edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d`,
  V/true-ZTSNR/leading, DPM++2M Karras TXT256, N4/CFG4/Fixed0,
  weighted cup/blurry prompts, Digital Art LoRA -0.5 and native external VAE FP32.
  Healthy V, healthy EPS Normal neighbor, installed wrong-EPS V refusal,
  mutated EPS neighbor and restored V: five planned admissions. Healthy/restored
  wholeRGBA must match; EPS baseline/mutant wholeRGBA must match. Fresh failure
  must expose the typed diagnosis and preserve its pre-admission state.
- Root alone owns executions and protected installed-file replacement/restoration.
  Native scope <=12 GiB, launcher <=2 GiB, aggregate <=14 GiB, swap0, finite
  deadline1800s. CPU/static runs bounded separately and never overlap native runs.
  Reuse existing driver and bounded launcher; no model/environment copies.
  Preserve original installed inodes in protected rollback until all owners exit.

No subjective quality, original lost trace, arbitrary models/geometries, full
NoobAI/MVP or release qualification is promised. Results and cleanup will be
recorded below after execution.

## Executed native evidence

Evidence root: `~/.codex/artifacts/imagegen-studio/runs/noobai-karras-failure/20261013-checks`.
The existing worker0.14 pool was reused; only `inference.py` and
`inference_lora.py` were temporarily replaced with the new diagnostics, with
original inodes protected. A separate prediction-only mutation forced epsilon
inside the DPM++2M branch. No model, runtime environment or model policy was copied
or changed. Both replacement layers were restored; all43 original source bytes,
inodes, modes and mtimes were verified after physical process exit.

Five qualified cases: V Karras healthy, EPS Normal healthy, wrong-EPS V Karras
refusal, mutated EPS Normal, restored V Karras. Totals:5 admissions,4 completions,
1 failed job,2 accepted/Save-reopened V packages,2 own wholeRGBA matches
(V healthy/restored and EPS healthy/mutated). Both EPS controls stay provisional.

The fresh failure reports exactly `GENERATION_UNET_NON_FINITE`, after callbacks
1/4,2/4,3/4. Queue Manager's expanded error text is asserted through real UI
interaction. Before/after effects confirm zero receipt/cursor/acceptance-journal/
accepted-index deltas, no candidate, unchanged source layers and saved package,
and null operational seed. The private target is retained byte-exactly; no
candidate PNG or new scratch PNG is published. Later authoring edits stay outside
the frozen input. This proves the observed UNet stage under the new mutation,
not an original lost traceback, LoRA causality or pixel inequality for NaN.

The first restored run completed, accepted and Save-reopened an equal result,
but the external watchdog failed on `ENODEV` during cgroup teardown. Its exact
unavailable memory-file/group cannot be recovered from the old generic exception;
it is retained as an observer failure, never a product/mutation RED. The
replacement observer skips an unavailable sample only after the recorded PID/start
has physically exited, the group is empty/gone and its manager is inactive with
no MainPID/group. Live/unknown owners still fail. One additional restored run
passed with clean bounds and equal own pixels. Raw totals across attempts are
6 admissions/5 completions/1 failed/3 accepted packages; the qualified totals
exclude the first restored run. All owners physically exited.

Qualified aggregate memory peaks:10,056,945,664;9,747,906,560;9,751,486,464;
9,798,414,336;10,200,289,280 bytes, all below14GiB. Native scopes retain12GiB,
launcher2GiB, swap0 and deadline1800s. The excluded observer run peaked at
9,112,850,432 bytes and also physically exited.

Independent raw SQLite/ZIP/Pillow readback passed7754 assertions. It compares the
complete frozen native inputs with only three validated UUID owner fields
excluded, independently reads RGBA and portable provenance, verifies the failure
pre/post proofs and preserves16 old durable tables. `project_index` and
`project_accepted_result_index` are rebuildable Home caches: startup refresh changes
index timestamps and reconstructs rowids, so cross-launch byte immutability is
not claimed for them. The failure's within-session accepted-index rows are
compared in full and remain unchanged. All code/bundle hashes frozen before the
native campaign matched at this readback.

The hidden-window `capturePage` PNG named `expected-unet-failure.png` contains a
stale canvas frame rather than the open modal. It is not visual proof of the
message; correlated DOM visibility/text assertions are the UI evidence. The
original numerical failure did not regain its discarded stderr or exception.

## Focused tests and sensitivity

145 real pinned CPU tests passed across LoRA, VAE precision/external VAE and image
LoRA oracles. The new NaN/Inf tests reach the production worker entry point for
TXT/IMG without LoRA, refuse before decode/publication and remove hooks. Tiny
native weights, a verified tiny loader fixture and CPU-only device are explicit
preconditions; they do not claim trained quality or installation qualification.

Disabling the actual production UNet guard in an isolated source copy gives
4 semantic RED tests and8 neighboring VAE GREEN tests. Restoring it gives12 GREEN.
Disabling Main's actual UNet stage projection gives one semantic failing leaf
(the Node report also counts its failed parent),9 neighboring GREEN and11 restored
GREEN. The JSONL peer and numerical responses are controlled collaborators;
client, processor, SQLite, staging, acceptance and Save remain actual owners.

170 focused Main tests and48 qualification/profile/CLI tests pass with zero skips.
The outpaint transport test explicitly substitutes only tiny LaMa verification;
all other path checks, the full actual JSONL wire and dispatch/physical close are
real. It does not prove trained LaMa or native OUT failure. Typecheck, build,
full Ruff lint, changed-file Ruff formatting and Python type checks passed.

Setup/observer mistakes remain visible in their original logs: the first wrapper
retained its predecessor's controller-root literal and refused before execution;
one outpaint test first used identity-only LaMa data against the real verifier;
the first source-copy mutation setup refused a differently formatted needle before
editing, and its11 GREEN log is an unmutated control; the first SQL reader used
an unaliased rowid and was corrected before the first admission; the first final
raw reader incorrectly assumed a numeric revision instead of UUID. None is a
semantic RED. An unused import was removed; full Ruff formatting also reported
an unrelated pre-existing `test_sdxl_img2img.py` style difference, left untouched.

The next implementation item is local thumbnails/previews for installed resources
in Phase2C, before production Presets. Broader inputs/geometry/Advanced/quality,
Invoke trained-pixel parity, fullNoobAI/MVP and Linux/NVIDIA release remain open.

## Final checks, lineage and cleanup

The full Python suite initially found6 failures in a progress/publication double
that treated post hooks as attention-mask pre hooks. The double now separates
them, retaining real publication assertions and explicit hook cleanup; numerical
behavior remains covered by native modules. Full suite:1215 PASS/zero skips.
Final Node run:218 PASS/zero skips. Final typecheck, build, ESLint, full Ruff lint,
changed-file formatting and Python type checks pass.

Four post-native source changes are explicitly bound to retained original bytes:
the test double, the Queue Manager screenshot locator, alphabetic error-literal
ordering for lint and removal of an erased test-only TypeScript assertion. Native
inference/queue transition/diagnostic behavior is unchanged. Final rebuild changes
`main.cjs` and its auxiliary source map; original main bundle bytes are retained,
while only the original map hash is retained. No native-current-bundle byte
identity or original-map reconstruction is claimed. The corrected screenshot
locator follows the existing surface-capture API; the six trained runs used the
older hidden-window capture, whose visual limitation remains recorded above.
Final independent readback passes7767 checks with these explicit lineage bounds;
the original7754 check result remains in its own log.

Only the two restored sensitivity copies were deleted after all recorded actors
physically exited, fresh process-use checks and final inode/hash checks. Retained
original mutation-source bytes make the removed copies reconstructible. No model,
ordinary app data, shared runtime or external symlink target was removed. Actual
allocated space reclaimed:10,985,472 bytes. The protected original-source directory
was empty and removed after all43 installed identities were restored. Post-cleanup
pool verification passes with original43 source bytes/identities and no users.

Final inventory: root29,417,340,928 allocated bytes; pool28,108,660,736;
new compact run42,848,256; free47,018,000,384. Existing evidence above the1GiB soft
budget remains referenced. The new run exceeds its32MiB target because full
failure snapshots and the excluded/restored attempt are retained; this exception
is explicit in lifecycle metadata. There are no bulky payloads or rollback files
left. The pool remains pinned for the next resource-preview implementation.
