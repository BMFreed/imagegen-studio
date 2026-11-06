# Dynamic global positive with Regional Guidance

Base: `73cd61923adc5240d6570d10dc6df4aef98403ed`. High risk: concrete resource
association, atomic queue/replacement, frozen Retry and accepted provenance.
Scope is public Illustrious Current Canvas: global positive expansion with
static global negative and effective regional text. LoRA, selected VAE/precision,
global/regional TI, initialization and static histories retain their owners.

## Current Invoke and adaptation

Current clean InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:

- `frontend/webv2/src/workbench/invocationSubmit.ts` expands merged global
  positive before submission and refuses failed expansion rather than forwarding
  raw syntax.
- `features/queue/data/submissionApi.ts` and `queue/core/promptBatch.ts` turn
  concrete positives into prompt/seed batch values, keeping one static negative.
- `features/generation/core/canvas/addRegionalGuidance.ts` sends regional text
  directly to conditioning. No regional or negative expansion is reused here.

Studio already has a bounded deterministic `planGenerationBatch` and effective
dynamic settings. Reuse them through the existing captured coordinator and atomic
batch owner. Preserve Studio's established prompt-pair/iteration ordering and
per-iteration/per-prompt seed rules; do not replace the parser, native loop or
worker protocol with a parallel implementation. Invoke's generic batch mechanism
is adapted to Studio's existing all-or-none admission/replacement contract.

## Owner path and exact resources

One detached capture → pure plan with placeholder seed0 → syntax/prefix/count
validation before composition or model work → selected union of active global
positive refs → existing ordinary preparation using the first concrete positive
and that selected ref pool → one actual Fixed/Random/Reuse base seed → actual
plan from the original template and captured settings → independent context,
logical request and full recipe per concrete item → aggregate preflight and
existing atomic publication → unchanged worker/receipt/Results/Add/Save.

The placeholder seed never enters execution or advances operational state. Full
grammar validates before prefix selection. `maxPrompts` truncation remains
separate from aggregate job overflow. The existing queued result reports actual
`truncated`, using internal plan metadata without a new wire field.

Select TI capability and refs from concrete positives, not the raw template:
`pre{fix|other}` can activate saved literal `prefix` only after expansion. Refs
from a discarded prefix alternative stay authored but are not resolved for this
route. This selected-plan pool is a deliberate regional adaptation; ordinary
preparation's broader authored-pool behavior remains unchanged. Supplying the
first concrete text to preparation avoids a false raw-template unbound refusal.
Every selected later item still completes unbound/resource/recipe validation
before any queue row or replacement is published.

Keep full original sidecars in frozen Main context, and use existing
`effectiveGenerationEmbeddings`/`workerEmbeddings` per item. The existing recipe
owner derives concrete global prompts, active exact refs and inherited static
negative from that item's real planner output. Cloning the first recipe and only
changing its item is insufficient. Region masks/owners and static local/global
negatives remain captured. Default, later edits and Retry cannot choose a new
binding. Accepted provenance contains concrete prompts and consumed global refs;
raw template/maxPrompts and regional state remain excluded.

The queue's previous static-material comparator required identical positives.
Normalize only concrete positive text/active refs/descriptors and planned
promptPairIndex/iteration/seed. Preserve exact static negatives/descriptors,
regions, alpha-file bytes, pools, profiles and the ordinary common-context
comparison. Existing per-item capture/resource agreement and atomic internal
admission remain their owners; mixed negative/region/mask/resource controls refuse.

## Parameters and acceptance

Retain authored `maxPrompts`1..100, iterations1..32, aggregate jobs≤32 and existing
syntax/text/resource/geometry/row/mask/transport ceilings. The plan refuses
aggregate overflow rather than truncating jobs. Existing maxPrompts selects a
deterministic prefix and reports it. Repeated alternatives are not deduplicated.
Random is picked once; uint32 wrap and per-item frozen seed behavior use the
existing planner. No new capacity, worker capability or numeric profile is added.

Lower acceptance uses genuine Service/capture/planner/SQLite/files/provenance
with explicitly controlled model/compositor/native substitutes. Cover two
positives×two iterations under both seed modes, wrap, Random/Reuse, prefix,
syntax in discarded branches,32/33 aggregate boundaries before work, static
negative/regional refusal, expansion-created literals, selected versus dormant
missing resources, later-item failure, exact per-item contexts/recipes/refs,
batch replacement and frozen Retry/reload after saved edits.

Installed acceptance reuses the unchanged52-module worker/runtime/catalog and
official v0.1 with VAE A/FP32, configured LoRA and existing TI files. A three-choice
positive template selects two variants by maxPrompts2, per-prompt seed behavior
and one iteration: pair0/iteration0/seed123 and pair1/iteration0/seed124. Distinct
global literals bind existing A/C; static regional C and negative B/D stay fixed.
Complete123, observe Cancel124 at steps5/6, save changed templates/options/
resources/masks, and Retry the original second concrete item. Exactly three
wires/two PNGs, original result correlation/provenance and reviewed Add/Discard/
Undo/Save-reopen remain the boundary. Different text/seed images do not establish
new numerical or visual guidance quality.

Execution keeps the existing serial12GiB aggregate host, zero swap,600-second
envelope (2GiB launcher/10GiB native). It is an operational guard, not capacity.
No model/environment copy, worker refresh, public default, Anima or regional
dynamic mechanism is introduced. PP-001/005/007/008 remain unchanged.

Evidence directory: artifact-relative
`runs/regional-guidance-dynamic-positive/20261106-concrete-variants`.

## Lower execution and source review

ROOT: **458 distinct Main PASS**, including42 new concrete-flow cases, with zero
failures/cancelled/skips in `main-final-r1`. Real Service save/reopen/capture,
planner, SQLite/files, request/recipe transport, receipt/provenance and frozen
Retry/recovery remain real; resource catalog/qualification, composition and
numerical PNG inference are explicitly controlled substitutes. Typecheck,
scoped ESLint/Prettier, diff checks and app build pass. Build retains its existing
large-bundle warning; no prototype source changed. Python/worker payload is
unchanged, so no unrelated Python rerun is claimed.

Two isolated Main mutations pass the declared sensitivity gate:12 selections,
10GREEN/2intentional semanticRED, controls and exact1,494-file restoration. A
coherent second-item substitution completes both jobs but the consumed second
TI/recipe assertion detects A instead of B. Restricting preparation to the first
branch detects loss of later-file verification at the exact missing-file
assertion; the resulting missing-pool refusal remains pre-publication evidence,
not native output causality. Full live-source hashes remain unchanged.

Initial lower attempts are excluded diagnostics: historical static-only message
expectations needed the new negative/regional versus positive-grammar diagnostics;
removing a mandatory0.14 READY capability invalidated the whole peer. The corrected
active test uses a qualified0.9 peer and separately checks the explicit advisory
capability reason. The dormant/prefix test checks false-capability advisory
admission and executes with the qualified current peer;0.9 ordinary Euler is
outside its qualified lane. No production readiness guard was weakened.

Independent frozenR2 source review is CLEAN within its read-only scope: full
baseline1,492/current1,494 mapping,10 deltas/two additions, current Invoke callers,
four implementation files,42 cases, installed harness and docs. Review did not
rerun ROOT execution. Installed execution and retention/lifecycle are
recorded separately below.

## Installed execution and retained evidence

ROOT `native-r2`: **17 grouped checks PASS /285.157s**, one actual UI Generate,
two selected positives×one iteration, maxPrompts2of3 and actual truncatedtrue.
Three original regional wires are A123/C124/C124; the second attempt is canceled
after genuine steps5/6, and explicit frozen Retry creates a separate third row.
Two receipts/PNGs/Results complete. All66 scalar progress events and original
commands retain concrete positive text, per-item TI, static regional/negative
bindings, configured signed/zero/disabled LoRA stack and selected VAE A/FP32.

After Cancel, actual controls save another template/maxPrompts/seed behavior,
changed TI/LoRA/VAE/sampling/seed and clear the first owned mask. Retry still uses
the original C124 snapshot. Results correlate to each reopened PNG/receipt.
Reviewed Add-one/Discard-one, Raster Undo/Redo and two explicit Save/reopen paths
preserve concrete A123/activeA provenance independently of the edited saved draft.
No numerical causality follows from different text/seed outputs. Prior SQL,
packages, accepted history and unaccepted bytes remain pinned; expected Home
index timestamp and receipt-counter changes retain the existing owner.

`native-r1` is excluded: its harness incorrectly searched structural JSON braces
instead of individual prompt strings, before numerical consumption. Forced owned
shutdown is retained with physical-exit proof. The two pending own rows were
canceled as APP_RESTART by the unchanged recovery owner, with all prior rows
exact; no retry output is credited to that attempt. Only the harness assertion
changed. Its post-r2 Prettier line-wrap/trailing comma has an equal normalized
AST witness; no production or executed assertion semantics changed.

Retention contains both native attempts and the exact restored mutation copy:
1,581 owned entries plus45 input entries, including six own IGS packages, a
consistent SQLite backup, tiny TI/LoRA files and queued inputs. Full VAE originals,
checkpoint, canonical runtime and prior companion remain protected dependencies,
not copied or removed. Independent retained/source-delta review is CLEAN within
its scope: all bytes/metadata, six IGS closures, SQLite integrity/FK,21 migration
hashes, exact31 prior queue rows, both independently decoded PNGs and mutation
records reconcile. It read retained ROOT evidence without rerunning native work
or certifying physical release.

ROOT confirmed16 ended owned units, all readers ended, fresh runtime idle,
restored source and245 external lifecycle records with no incoming dependency on
the three exact scratch paths. After retained-byte verification, only native-r1,
native-r2 and mutation-source were disposed: **46,166,016 allocated bytes** measured
during the deletion-only interval. Archives and all external dependencies/business
data remain. Lifecycle is retained with no remaining disposable payloads. The
adapted cleanup utility's legacy schema label does not alter its exact current
RUN/payload identity; the original generated record is preserved.
