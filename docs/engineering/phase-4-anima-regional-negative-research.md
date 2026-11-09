# Anima Regional Guidance — signed negative conditioning

Base `03f34340d5f08a21428575e85b2555318572f75f`. This high-risk slice connects
spatial Anima negatives to the existing TXT/IMG/OUT owners. It adds no numerical
loop, sampler, loader, wire field/version, queue kind, persistence format or DB
migration. Current original-Anima architecture, source/VAE/LoRA scopes, explicit
composition and temporary-result acceptance remain their existing owners.

## Source and contract

Consulted clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`:

- `backend/architectures/defs/anima.py` declares regional negatives and CFG gating.
- `frontend/webv2/src/features/generation/core/canvas/addRegionalGuidance.ts`
  sends separate masked negative conditioning to the negative collector.
- `app/invocations/anima/anima_denoise.py` independently prepares each polarity's
  context bank and supplies the corresponding mask on both solver paths.
- `backend/anima/regional_prompting.py` assigns regional coverage to its columns;
  `unmasked_covers_whole_image=True` keeps the global negative image-wide.
- `backend/anima/anima_transformer_patch.py` applies the active sign's mask only
  on even blocks. Odd blocks retain the original unmasked attention.

The feature's earlier claim that Invoke lacks masked Anima negatives applies to
its historical consulted revision. This current mechanism can be reused. No
inverse-mask auto-negative is introduced: product inheritance means freezing the
current global negative text and references separately for that region.

## Finite behavior

The additive `anima-regional-negative-v1` capability on worker0.14 is required for
every nonempty effective regional negative, including CFG1. Prior peers reject
those records before CFG inspection; dropping them would discard frozen input.
Empty effective negatives preserve older peers. A nonempty global negative with
explicit local-empty regions does not by itself require the new capability.

An explicit private `negative_profile="invoke-anima-regional-negative-v1"`
preserves default private refusal. Main compiles the complete recipe into global
positive/negative records, followed by each region's present positive and nonempty
negative. Negative emission is independent of an absent positive. Old empty-only
record order remains exact. Identical text across sources/signs does not merge
ownership, ranges, encoding or masks. Inherited text and refs must match the frozen
global pair; local text and refs must match the authored local block.

The negative global columns remain Everywhere. Local and inherited negative
columns follow their own owned mask, normalized/binarized before native nearest
sampling. A zero-support negative has closed columns on even blocks; it can still
affect odd blocks, which see the whole bank. No final-pixel locality or global
inertness is promised. Existing positive support, positive-zero refusal and the
explicit Krea-2 fallback remain unchanged.

The existing native `not math.isclose(guidance_scale, 1.0)` rule controls actual
negative consumption. Inactive CFG still freezes, validates and preflights signed
records, while skipping regional-negative extra encoders, mask, context and
transformer calls. The ordinary global-pair encoding owner remains unchanged.
Either active signed mask can select the existing prediction factory, including
private negative-only input. Public regions still require nonempty positives.

Fresh admission, authoritative selected frozen Retry and actual worker dispatch
check the new capability against the actual frozen records. Current draft edits
cannot replace their signed text, compiled interpretation, mask, source or sampling.
Generic renderer Retry hints remain generic because its synchronous row metadata
does not contain the verified regional sidecar. Main refusal preserves the job and
reports the missing capability. No persisted UI hint is added.

## Parameters and preservation

Retain three regions, eight possible signed sources, 16 KiB per text, 128 KiB
aggregate including inherited repetitions, fixed512 context rows/source and the
existing Qwen8192-token/T5/fragment/weight preflight. Existing1MiB sidecar/bundle
and128KiB frozen-row limits remain; larger signed records may reach them earlier.

Public dimensions remain64–512, divisible by8; steps1–200, CFG1–30, six existing
flow methods, source strength0–1, existing batch limits and Auto embedded VAE.
At512 squared, Q=1024 and K<=2048 per sign. The original16-head Base therefore
reaches the existing33,554,432 expanded-element ceiling per native attention
call/sign. Each broadcast Boolean mask is at most2MiB; two materialized masks
total at most4MiB, before scratch. These are payload calculations, not capacity
claims. No budget is raised or aggregate expansion rule invented.

Global LoRA scopes, CFG/solver order, step RNG, source posterior/window, LaMa/keep,
RGB/RGBA contribution and publisher remain unchanged. All borrowed state, native
processors, metadata, caches, reservations and RNG must unwind on failure.
Original values and exceptions remain observable; no borrowed-state repair or
allocator-reclamation promise is added. Smart/TI/references, new architectures,
per-region LoRA and quality/readiness remain separate. Regional Guidance remains
excluded from accepted provenance, Compare and result-derived presets.

## Acceptance plan

Use genuine Main save/reopen/capture/compiler fixtures. Small original CPU/CUDA
consumers must observe independent signed context ranges, even masks, odd unmasked
calls and original SDPA. Include equal-length banks with different permissions,
unequal lengths, inherited/local/empty/whitespace, negative-only private input,
threshold/overlap/zero support, CFG1 exact output, all six samplers, source modes,
LoRA combination and recoverable late failures.

Isolated semantic mutations must remove only the new Main admission guard, and
misroute only valid negative native permissions after preparation. Require RED
after actual PNG publication for the native intervention, unaffected controls,
exact source restoration and fresh GREEN. Setup/OOM/import failures do not count.

Installed acceptance reuses the one existing runtime/catalog and fixed original
Anima checkpoint/companions. Fix512 squared/Heun20/CFG4/seed123, Auto VAE, no LoRA;
IMG/OUT strength0.5. One local negative changes from `(red scarf)1.5` to
`(green scarf)1.5`, with nonempty global/inherited negatives, positives, masks,
sampling and target/source bytes unchanged. No prompt/seed tuning follows viewing.
TXT/IMG reuse explicit accept/hide/control-discard/show. OUT adds pending/running
Cancel, saved edits/restart and selected frozen Retry. Planned total: eight native
requests/seven PNGs. Require visible RGB contrast, exact OUT alpha/source protection,
exact replay and Add/history/Save/reopen. Floating-only change leaves PNG causality
unqualified. Visual usefulness remains a separate acceptance gate.

Serial installed units retain12GiB aggregate host memory (2GiB launcher plus10GiB
owned native), zero swap and600 seconds. Small native units use at most4GiB.
Operational guards do not establish capacity. No model/environment copy or download
is planned. Initial artifact root is26,096,386,048 bytes, with45,731,282,944 bytes
free; own payload soft budget256MiB. Protected historical evidence remains pinned
for open promises, separately from disposable current inputs.

## Lower qualification

ROOT qualified the affected union of **1,941 Main, 580 Python and 222 browser
cases**. These are affected/neighbor unions, not a final whole-repository rerun.
The new original-native negative suite contributes102 cases:81 unchanged passing
cases plus21 corrected tail cases. The Main neighbor run had1,940 passing cases
and one obsolete rejection-message expectation; the corrected neighboring196
cases close that same boundary. The two-worker browser run had220 passing cases;
the two new cases passed after fixing their Vue-proxy snapshot fixture.

Final TypeScript/Vue and basedpyright checks pass. Scoped ESLint covers16 changed
TypeScript/Vue/JS files; Ruff covers all six changed Python files. The application
build passes with its existing bundle-size warning. Later changes to executable
code are limited to a browser callback's formatting and a negative-profile-only
installed authoring helper; their proofs and scoped checks remain separate.

The isolated mutation run qualifies24 selections: **19 GREEN / five semantic
RED**, with exact1,585-file restoration and an unchanged live checkout. Removing
only the new capability guard gives three Main REDs (TXT/IMG/OUT); the legacy
empty-negative control stays GREEN. Routing only the first regional negative's
columns to its neighbor gives CPU/CUDA prediction RED after real PNG publication.
An independent original-transformer replay observes the wrong signed mask/context;
CFG1 controls remain exact. Restoring source returns all targets GREEN. Complete
post-publication prediction records and PNGs are retained, separately from the
installed trained output controls.

Frozen R2 source review and the separate mutation-driver source review are CLEAN.
Neither reviewer executed the application or adopted ROOT runtime observations as
independent execution. R3 changes only browser formatting, with identical syntax,
identifiers and literals. R4 additionally unlocks the first fixture region via the
ordinary UI before negative editing; it changes no production guard or assertion.

## Installed qualification

TXT and IMG pass the two-request A/B experiment through selected Add,
Undo/Redo, Save/reopen, hiding accepted A for B, explicit B discard and showing A.
Independently reopened512-square RGB PNGs differ in **471,330 TXT / 430,043 IMG
channels**. The same seed123 and every other normalized semantic input remain
exact; each signed bank has1,536 keys. Actual Main capture retains six ordered
signed sources, including the inherited duplicate negative as an independent
stream. Auto embedded VAE, Heun20/CFG4 and IMG strength0.5 stay fixed.

OUT passes A/B, pending/running Cancel, saved global/local/inheritance/mask/source/
model edits, clean restart and selected frozen Retry. Independent reopening finds
220,836 changed raw RGB channels,180,923 with positive alpha and **176,972 fully
visible channels**. Both contributions have exact matching alpha:119,025 protected
zero-alpha pixels,132,544 fully generated pixels and10,575 soft pixels. The existing
Main contribution owner verifies inverse-faded-keep/source protection. Retry is
exact to negative A in both original PNG bytes and reopened RGBA, while B stays
different. Selected Add/Undo/Redo/Save/reopen passes with ordinary-only provenance.

Total: **eight native requests/seven PNGs/nine installed checks**, four healthy
native lifetimes. TXT/IMG/OUT finish in336.507/331.481/504.878 seconds, each within
the declared600-second/2+10GiB/no-swap envelope. Native Heun progress totals are
39/19/19, distinct from authored20 steps and the source-conditioned half window.
One additional locked-authoring diagnostic lifetime has no native generation.
Recorded native host-group peaks reach the10GiB ceiling, including file cache;
this is not spare capacity or a measured peak-VRAM guarantee.
Installed wire/progress, source/image and persistence observations do not establish
a complete trained per-block tensor trace. Native signed-mask consumption is
observed separately on the original small CPU/CUDA consumers.

## Diagnostic attempts and corrections

- Initial type diagnostics were test annotations/casts only; erased runtime AST
  equality is retained. A later browser callback wrap is formatting only.
- Eight browser workers hit the4GiB envelope. The repeat used two workers under
  the same limit. OOM is excluded from functional or semantic mutation evidence.
- A Vue reactive object cannot be passed to `structuredClone` in the new test.
  Returning it through Playwright's existing serialization boundary preserves the
  full authored-prompt comparison; both corrected cases pass.
- The overflow fixture's exponent suffix was rejected by the real Main grammar
  before Qwen. An equivalent finite decimal1e39 now reaches dtype preflight at
  CFG1 and CFG3; the preceding81 passing definitions are unchanged.
- The old OUT oracle's whole-file Invoke hash moved. Every numerical definition
  it executes is independently AST-identical across the old/current revisions;
  only its source pin/documentation changed. Current Krea2 has separate negative
  Everywhere and positive fallback branches. The old public test now selects the
  exact positive `else`; its numerical predicate and every other definition stay
  unchanged. Neither oracle falls back to older Invoke to avoid source drift.
- The first installed TXT attempt stopped before any generation: the inherited
  fixture's first region was locked. Its disabled negative switch was correct UI
  behavior. R4 explicitly uses `Unlock` before editing. The diagnostic report,
  failure screenshot, zero native requests and confirmed physical closure remain
  separate from healthy installed results. No memory limit was raised.

## Operations and remaining gates

Evidence lives under the local artifact run
`runs/anima-regional-negative/20261109-signed-banks`. Baseline, R1/R2/R3/R4 source
archives, current Invoke pins, ROOT commands, JUnit/logs, independent PNG hashes,
mutation witnesses and correction beforeimages are separate from disposable
payloads. The one reusable runtime/catalog remains on its canonical path, pointing
to this run's successful worker-only refresh report. This is not release
Install/Repair qualification. No environment/model copy or download was added.

ROOT confirms physical exit of45 bounded units and five installed native
lifetimes, with a fresh canonical-runtime idle proof. A consistent closed catalog
backup passes integrity/FK checks and all26 migration hashes match the beforeimage.
Four copied closed packages preserve the failed authoring diagnostic and the three
healthy final states. Original shared catalog/projects/models remain protected.

The exact no-follow payload inventory contains7,512 entries,5,708 regular files,
1,674 directories and130 literal symlinks. The verified retained archive preserves
424,066,781 regular-content bytes. Its two own payload roots occupy445,325,312
allocated bytes. This exceeds the256MiB soft budget; a recorded temporary768MiB
exception preserves diagnostics until archive verification and release. The independent
retained-byte/dependency audit is CLEAN, including all seven independently decoded
PNGs, four closed packages, both SQLite snapshots and lower/mutation reconciliation.
It grants no physical-release or deletion authority. After every reader ended,
ROOT rechecked canonical-runtime idle, exact mutation restoration and external
incoming references, then removed only this run's `payloads` and short temporary
root. The deletion-only interval reclaims exactly **445,325,312 allocated bytes**;
artifact root changes26,651,967,488 →26,206,642,176 bytes before later compact
bookkeeping. The archive and restoration instructions remain; disposed raw paths
in original reports are historical. Canonical shared runtime/catalog/models,
original project packages and predecessor dependencies remain protected. None of
these sizes is a model/runtime capacity claim.

Peers without the new capability refuse nonempty frozen regional negatives with
an actionable runtime message and preserve the original job. There is no silent
drop, global-negative substitution or automatic Retry. Existing failed-job/fresh
worker and frozen-input recovery owners remain authoritative. Repair/update the
runtime before explicitly retrying unsupported signed work; legacy empty-negative
jobs retain their prior meaning.

Visual usefulness, new architectures, Smart, TI/references and per-region LoRA
remain unqualified. Regional Guidance remains excluded from accepted provenance,
Compare and result-derived presets. Source review, retained-byte audit, ROOT
execution and physical release remain separate. PP-001/005/007/008 stay
**«Пока не обещать»**.
