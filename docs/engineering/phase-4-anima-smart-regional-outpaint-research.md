# Anima Smart OUT Regional Guidance

Base `de3ba888de86bf88b0cbb90f71d4125e4214856a`. High risk: actual source/mode
classification, exact frozen input identity, worker dispatch, Retry and durable
candidate publication meet here. The finite public OUT integration and installed
qualification pass; no overall PP-001/005/007/008 status or visual-quality claim
is raised.

## Current source and finite adaptation

Consulted clean local InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`:
`frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts`
(`graftOutpaint`, mode graft before regional collection), `addRegionalGuidance.ts`
(separate signed collectors), `backend/anima/regional_prompting.py`,
`backend/anima/anima_transformer_patch.py` and
`app/invocations/anima/anima_denoise.py` (direct NEAREST, positive background,
negative-global Everywhere, masked even/unmasked odd blocks). Invoke's saved
root-graph Retry remains the basis for Studio's existing whole-bundle Retry.

Studio already routes Smart INP and OUT through the same native
`generate_anima_outpaint` callback. Only the prediction-factory mode guard needs
to admit OUT; no numerical loop, solver, IMG/TXT wrapper, conditioning algorithm,
LaMa implementation or world publisher is introduced. The separate global
negative remains the selected Smart Patch's frozen settings, per user decision.

Old `invoke-anima-smart-regional-inpaint-v1` keeps INP/opaque meaning and default.
New `invoke-anima-smart-regional-outpaint-v1` means OUT/mixed only, with separate
`anima-smart-patch-regional-outpaint-v1` worker capability. Profiles cannot cross
modes. Existing descriptor command/Smart queue operation/raw alpha roles and
limits remain. No new `.igs` field, DB migration or accepted provenance field.

Fresh admission uses existing leased CPU `composeSource` for actual source-alpha
classification before OUT LaMa/model preparation. A mixed source selects OUT;
opaque selects the existing INP candidate (the unchanged material owner still
refuses IMG/no-edit mismatches); transparent refuses this finite lane. Exact mode
capability is checked then. No refusal-before-every-CPU-call claim is made while
mode is unknown. Existing batch preparation recomposes the same frozen lease,
then actual manifest/pixels must agree with the selected profile.

The new OUT capability is independent from the prior INP capability. Fresh,
client, processor and frozen Retry requirements derive from actual classified or
strictly parsed saved mode. Queue Manager's extra OUT requirement is derived from
frozen input, never current Project regions/settings. Unsupported or older peers
refuse without ordinary fallback. Existing INP and ordinary/frozen work retain
their meanings.

Frozen OUT stores actual world source, infilled processing RGB, KEEP, contribution
and raw regional masks. LaMa is a fresh-preparation dependency only. Retry copies
and revalidates saved `model-source.png`; it does not resolve/re-run LaMa or read
current infill/source/mask/regions. Existing world candidate, explicit Add,
Undo/Redo and Save remain authoritative, with ordinary-only provenance/Compare/
result-derived presets.

## Parameters and acceptance

Retain one static original-Anima item, Euler/Heun, embedded Auto VAE, processing
64–512 divisible by8, world sides≤2048/area≤4,000,000, three regions/eight signed
inputs,16KiB/text and128KiB aggregate,512 context rows/source and33,554,432 mask
elements/sign/call. No enabled LoRA, TI, references, TXT/IMG or other architecture.
Regional permissions remain independent of Smart KEEP and final contribution.

Actual OUT acceptance uses translated/non-square world107×73 at(-13,5),
processing264×128, Heun20/CFG4/strength0.5/seed123. World source includes
alpha0/127/128/255, with a separately owned Smart mask and independent regions.
The existing edit core is `(authored alpha > 0) OR (source alpha < 255)`; no
regional mask may replace that core, KEEP, source trajectory or contribution.

Required evidence: strict Main/frozen/queue/client/worker/native refusals and
controls, old INP compatibility, ordinary OUT equivalence, original CPU/CUDA
native signed consumption/KEEP/decode/publication, and failure/fresh-call recovery.
Missing OUT capability must stop before LaMa/inference/SQL after classification;
fresh missing-LaMa refuses before SQL; Retry infill-resolver tripwire stays idle.

Installed qualification is two finite phases: A/B and progress-canceled A with
explicit Add/history/Save plus future source/Smart/Canvas/region edits; then a new
application lifetime retries that same saved canceled A. A/B change only one local
negative, preserving source/infilled RGB/KEEP/alpha/seed/policy. Retry must match
original PNG/RGBA and all frozen files, preserving current authored edits. Native
processing RGB is captured passively before normal cleanup and independently
checked against BICUBIC world RGB plus exact contribution alpha. Source-over
reference arithmetic is distinct from observing flattened Canvas rendering.

The decisive isolated mutation routes only valid OUT regional requests through
ordinary OUT after earlier validation. Real PNG publication must occur before the
independent prediction/association oracle turns semantic RED. Ordinary OUT and
old INP controls stay GREEN; exact source restoration restores GREEN. Setup,
imports, OOM and early descriptor refusal are not semantic evidence.

## Operations

Owned run: `runs/anima-smart-regional-outpaint/20261109-public`, temporary payloads
also under `t-asro-1109`. Initial artifact root26,435,661,824B/free45,441,224,704B;
GPU14,235MiB free of16,376. Reuse the single qualified installed catalog/runtime.
The existing managed LaMa passed the actual Main resolver:205,669,692B,
SHA`344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9`.
No downloads or environment/model copies. Source and installed qualification stay
separate; refresh the real worker payload before installed claims.

Small checks≤4GiB. Native installed phases use launcher2GiB plus qualified native
scope10GiB, aggregate≤12GiB, zero swap,600seconds/phase and existing CUDA fraction
0.75. These are test envelopes, not general capacity. Own payload soft256MiB.
Retain source, inputs, controls/RED/restoration and compact reports before fresh
physical-exit/readers/dependency checks and exact own-payload release. Shared
runtime/models and dependent reports remain protected. Source review, retained
bytes, ROOT runtime, actual release and public readiness remain distinct.

## Executed qualification

ROOT executed the following against the dirty base above; independent source
and retained-data reviews remain separate from runtime execution:

- 1,003 distinct affected Main cases PASS, zero failures/skips. The complete
  47-file run includes the earlier focused/shared cases; they are not added again.
- 136 distinct Python native cases PASS:26 new OUT,58 public descriptor-worker
  and52 previous private INP cases. CPU float32 and CUDA bfloat16 exercise actual
  native prediction/KEEP/decode and exclusive PNG/world publication. The small
  fixture substitutes LaMa's neural result/model construction; it does not prove
  the installed infill. The installed path below uses the real managed LaMa.
- All226 prototype browser cases PASS, including fresh OUT capability and saved
  OUT Retry after current regions are removed. These use prototype mocks.
- Full TypeScript checks, Python typing(0 errors/0 warnings), scoped Ruff,
  `git diff --check` and the actual app build PASS. The build emits its existing
  chunk-size warning. Full lint retains two unchanged base project-service parse
  errors in `qualify-installed-regional-init.mts` and
  `qualify-regional-character-visual.mts`; excluding exactly those paths is checked
  separately. No unrelated lint repair is included.

The installed, noneditable worker was refreshed and qualified before the built
renderer test. Two separately bounded application lifetimes make four genuine
queue requests: A, local-negative-only B, progress-canceled A and restarted frozen
Retry A. Three actual completions/receipts/world PNGs and one progress cancellation
pass ten installed checks. Progress reaches1 of19 before Cancel. A explicit Add,
one Undo/Redo, Save/reopen and unchanged source/above-layer controls pass.

B changes15,018 RGB channels at fully visible world pixels. Source, infilled RGB,
KEEP, raw regional masks, contribution, seed and sampling remain exact. A passive
original-child stdout observer retains the native processing PNG before cleanup;
an independently invoked Pillow-only oracle verifies every world RGBA byte from
BICUBIC processing RGB and contribution alpha. Source compositing permits at most
one RGB byte at the authored127/128 alpha columns; opaque/transparent RGB and all
alpha remain exact. This is separate from an observed flattened Canvas preview.

After Cancel, real IPC changes/clears Smart and regional masks, disables/deletes
regions, changes source opacity to0.25, Smart seed to321, method/steps/processing
size, Canvas text/seed/bbox and explicitly Saves. A new application lifetime retries
only the original canceled row. All saved frozen files, native processing RGB,
world PNG bytes and decoded RGBA match A exactly. The current edited package
remains unchanged. Four real queue rows, three receipts, all four complete frozen
bundles, final `.igs` and a consistent SQLite backup are retained; shared sources
are preserved. Retry's no-LaMa dependency is also covered by a Main resolver
tripwire; exact replay alone is not that proof.

The isolated OUT-only dispatch mutation runs12 native selections:
4 GREEN →2 OUT semantic RED +2 INP control GREEN →4 restored GREEN. Both REDs
occur at the independent native prediction oracle after processing/world PNG
publication, with changed OUT prediction/processing/world output. Both INP
controls remain exact. All1,601 copied source files are restored and live source
is unchanged; each native unit records physical exit. No installed worker is
mutated. This establishes consumption sensitivity, not trained visual quality.

Operational limit: after the Retry's functional/pixel assertions passed, owned
Electron close exceeded the harness's10-second wait. Its exact owned scope was
SIGKILLed, then the original PID identities/scope exit and runtime idle were
confirmed. The report retains `closeError` and `forcedOwnedClose`. This is bounded
forced closure, not a normal/clean shutdown qualification; it does not count as
a semantic failure or erase the observed Retry result. Prepare closed normally.

Excluded diagnostics: an early focused run had99 PASS and one malformed healthy
worker fixture lacking the baseline `illustrious-outpaint` capability; the fixture
was corrected and passes in the final affected run. Seven initial Python typing
diagnostics were corrected with annotations/casts only. An idle-helper call omitted
its output filename; the read-only check passed but a repeated exclusive output
write refused. The explicit fresh idle report passes. These are not native failures
or semantic mutation evidence.

Compact reports live in the owned run above: `qualification-summary.json`,
`installed-prepare-r1.json`, `installed-retry-r1.json`, `shared-closure.json`,
`outpaint-dispatch-mutation-r1.verdict.json`, source archives/pins and bounded
resource receipts. Retention and release records identify original paths as
historical after disposal. Shared runtime/catalog/models, the refreshed worker's
report dependencies and the saved qualification Project remain protected.

Only the stated original-Anima OUT/INP bounds are qualified. Other Smart modes,
resources, full model/options matrix, useful visual placement, release Install/
Repair and overall public readiness remain open. Existing ordinary-only
provenance/Compare/result-derived-preset scope and explicit Add/Save remain exact.
