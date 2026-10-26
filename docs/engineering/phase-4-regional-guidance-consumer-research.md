# Private Current Canvas recipe encoding and native consumption

Status: **complete within its private CPU concrete-recipe encoding/native-consumer boundary** on dirty
`master@10115df581d9e07049478dee3866a280886794fd`. This follows the
[world-to-latent checkpoint](./phase-4-regional-guidance-geometry-research.md).
Prior 588-case evidence belongs to that checkpoint, not this new consumer.

## Finite owner

`run_current_canvas_regional_recipe` consumes the actual private Main recipe,
encodes its declared static text through unchanged `build_sdxl_conditioning`,
samples its world alpha through existing geometry, converts actual signed
conditioning lengths through the existing owned converter, and returns the
normal native UNet result from `run_illustrious_regional_conditioning`.
No second capture, Service wrapper, persisted recipe, worker command, tensor
bank, scheduler or denoising loop is introduced.

The existing Main result now adds `globalPrompts`. Both texts equal the supplied
concrete item's strings, with active exact refs selected from synchronously
detached captured Canvas sidecars. Global and inherited regional prompt/ref
objects are independently owned. Raw global templates and dormant local
negatives remain authored state. Batch membership, seed history and checkpoint
identity are trusted Main caller obligations; Python cannot authenticate them
from an ephemeral dictionary. No resource resolution or admission is implied.

The explicitly selected `ordinary-canvas-static-dualclip-cpu-v1` composition is:

- Global stream first for each sign, followed by emitted regions in recipe order.
- Every resolved regional negative remains a separate masked stream, including
  inherited text equal to the global negative. Repetition is not automatically
  neutral in attention.
- Absent positive emits no stream; present empty positive retains real 77 zero
  rows and zero pool. Local empty negative never falls back to global text.
- Each signed global coverage and pooled source ID is required explicitly.
  No global-support, inverse-negative, pooled-average or deduplication heuristic.
- All four world classifications stay associated with their region. Sampling
  preserves raw alpha; sampled-zero coverage never becomes Everywhere.
- Both signs are validated even in positive-only execution; K retains their max.

These are finite private candidate semantics, not public composition defaults.
Only ordinary Current Canvas Illustrious/static active text is admitted. Effective
embedding refs, resource markup, enabled reference images, active LoRAs,
preloaded TI/adapters, Anima and Smart refuse. Dormant authored refs/text do not
activate resources. Python does not accept separately supplied effective text,
embedding managers, plans, context banks, root overrides or arbitrary kwargs.

## Preparation, native profile and lifecycle

Complete recipe, resource, text, geometry, pooled membership, execution arguments
and model checks precede the first encoder forward. Actual pinned Compel parsing
and token/weight splitting yield per-CLIP row counts; each emitted stream uses
the larger aligned length. Aggregates are bounded before encoding, then compared
with actual producer lengths. `expanded_conditioning_length` extracts the
existing parser-based validator operation; its old wrapper still returns None
and retains refusal behavior. Character/word counts are not row estimates.

Native input is the pinned CPU float32/eval/no-grad/no-autocast SDXL profile:
Torch 2.7.1, Diffusers 0.40.0, Transformers 5.5.4 and Compel 2.4.0. Standard
768/1280 CLIPs, 77 positions, compatible vocab/table and four-stage VAE scale8
are checked. There is no `.to()`, `.eval()`, resize, load or offload repair.
Native `QuickGELUActivation` is explicitly supported. Transformers lazily installs
output-capture hooks on first use: supplied CLIP text models must already be
initialized by their caller before this consumer's unchanged-state interval.
Cold encoders refuse before tokenization; the consumer never warms them.

Caller owns pipeline, tokenizers, encoders and UNet exclusively throughout
preflight, encoding and forward. Local reservations reject overlapping consumer
calls/reentry across shared used objects. Disjoint models can share runtime and
unused VAE. Direct concurrent forwards/model mutation are outside this cooperative
contract. The existing adapter separately owns processor, hook and call-entry
restoration. Before native scope entry, failures return no result and leave no
installed scope; encoder failures release local reservations. Native/scope errors
propagate through existing journals and allow fresh-call recovery.

## Bounds and acceptance

Risk is high: wrong effective text, range or geometry association can silently
condition the wrong queries; native mutable-scope failure must restore exact
state. Public admission and durable persistence are outside this change.

| Parameter          | Private decision                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| Regions            | At most three enabled regions, including negative-only/zero-coverage                           |
| Signed pair inputs | At most eight, including technical empty counterparts                                          |
| Text               | 16 KiB UTF-8 each; 128 KiB aggregate, counting repeated inheritance                            |
| Encoded rows       | Actual Compel-aligned aggregate at most 308 per emitted sign                                   |
| Encoder builds     | At most four paired builds; internal pooled/weighted forwards vary                             |
| Geometry           | Existing divisible-by-eight sides 8–2048, area at most 4,000,000                               |
| Alpha              | At most 12,000,000 borrowed bytes across three full-target planes                              |
| Latent alpha       | At most 187,500 retained sampled bytes before downstream copies                                |
| Sample             | Existing 32 MiB payload cap; consumer snapshot and bridge snapshot are separate                |
| Bridge             | Existing 5,056,512 context/selected-pool payload bound, excluding intermediates                |
| Attention          | Existing 32*1024*1024 expanded Boolean logical-element ceiling                                 |
| Runs               | Native runs serial in 3 GiB groups, zero swap, 600-second deadline; 100 MiB local artifact aim |

Validation scratch, transient encoder outputs, converted bindings, copies,
metadata, diagnostic/test state snapshots and native workspaces are separate
from those payload bounds. They are not an RSS/performance/model-capacity claim.
Existing Main 64 MiB recipe and 512 MiB asset bounds remain their own owners.

Acceptance requires actual Service/coordinator/package capture and Main-planned
concrete branches, transporting the complete produced recipe through a test-only
byte sentinel into this consumer. Rebuilt Python text or only transferred alpha
would not qualify the seam. Literal expected text and masks, direct independent
native encoding, original processor contexts/pools/permissions/output, returned
native result, and exact Main/native state comparisons form the oracle.

The executed semantic mutation must keep valid text, masks, sample and selected
global pools while selecting the wrong regional negative. Local-negative native
context/output should turn RED; an inherited-global control stays GREEN;
byte-exact restoration returns both GREEN. Setup/typing failures do not count.

## Evidence chronology

Two source-only investigations selected this finite seam. Their claims are
source observations, independent from ROOT execution. Main's additive-field
suite initially had five exact-key fixture failures; adding only globalPrompts
to its lease-field whitelist preserved prior assertions. Corrected suite:
44 PASS, including four new cases. Full pnpm typecheck passed. Scoped ESLint
removed seven unnecessary non-null assertions in the new tests, without behavior
changes. Final same-source TypeScript checks passed (typecheck-r2 and canonical Main-neighbors-r2).

ROOT's real Main probe produced four full recipes: two saved/reopened projects
at translated/non-grid-aligned origins, each with concrete blur/noise branches
from raw `{blur|noise}`. Each has three enabled regions (including locked and
zero-overlay authoring), empty/absent positives, inherited/dormant/local-empty
negatives and all four coverage kinds across projects. Document/history/epoch,
package/shadow/SQL and seed cursor remained exact; native consumption completed in a separate test-only handoff. Main uses
authored unresolved model metadata; native fixtures use local random models,
without catalog or installed-checkpoint attestation. Its first attempt
compared a native rank3 mask directly to a rank4 oracle; the corrected observer
uses the existing mask-view normalizer without changing permissions. Eight
forwards across four whole recipes and both layouts pass with literal contexts,
pools, masks, returned native results and unchanged state/transport bytes.

First Python attempt: 246 collected cases, 98 failures and two teardown errors
(247 JUnit entries). Standard QuickGELU was rejected by the over-narrow class
profile; fixture's direct expected encoding also lazily installed native capture
hooks. The explicit class allowance and initialized-encoder precondition plus
fixture warm-up address those mechanisms. Second attempt: 222 PASS/26 failures/
one teardown error; inherited-method monkeypatch rollback left instance shadows
and polluted following cases. Using dictionary-key journaling preserves original
absence and the same invalid profile values/assertions. Static correction keeps
invalid inputs/assertions. Corrected focused run: 248 PASS. Combined run: 839 PASS
= 248 new + 588 prior + three actual expanded-budget neighbors, no skips. Main capture/coverage/recipe neighbors pass 91 cases under canonical TAP. The
previous default-spec reporter ran 91 successfully but the ROOT wrapper refused
its missing TAP footer; that record is not the canonical test evidence. Final full
TypeScript typecheck and scoped Python strict typing/Ruff/format pass. The
initial Python typing command omitted project configuration; the corrected
project run exposed 22 targeted test typing errors, then zero after narrow fixes.

R1 semantic mutation first produced two setup errors from a harness indentation
error; it was restored and is not semantic RED. Corrected R2 harness reuses the
verified restored checkout and records 2 GREEN→one local-negative semantic RED
plus inherited-global control GREEN→two restored GREEN. It changes the active
regional encoding pair to global negative after canonical validation; ranges,
mask, sample, row counts and global pools stay unchanged. The RED observes
actual encoded grain replaced by blur; original native consumption ran before
that assertion. All 1,366 isolated members restore exactly.

Independent R1 source review found one P2: pre-existing CLIP prehooks can return
changed same-shaped token IDs or attention masks, retargeting declared text
without changing encoded lengths or model/hook registration. Existing downstream
context guards protect the already encoded bank and cannot detect this earlier
substitution. ROOT reproduces this before correction: a compact 8-case probe yields 4 semantic
missing-refusal RED/4 controls GREEN. The complete 38-case authored matrix yields
14 semantic RED (IDs/masks, layer pre/post replacements and global-hook refusal)
plus 24 equal-clone/observation controls GREEN, zero errors/skips. A preceding
selector typo collected zero tests and remains an explicit setup-only record.
Encoder-hook correction is implemented. All 38 authored cases and all eight
compact causal/control cases now pass. Final strict project typing passes after 13 annotation/cast-only corrections.
The same typed source passes 878 combined cases = 287 consumer + 588 prior +
three expanded-budget neighbors, no failures/errors/skips (97 dependency
deprecation warnings). The added partial-setup case proves a real first guard
is installed before the injected second construction failure, then exact
restoration and fresh native recovery. Pre-typing R2 remains retained distinctly.
Existing local pre/post-hook callables across both complete CLIP trees are
temporarily guarded under the same keys. Native ordering, kwargs and always-call
flags remain untouched. Before prehook invocation a canonical forward-signature
binding snapshots argument associations; afterward even None observers are
checked, allowing equivalent positional/keyword forms and equal-valued clones.
Changed values refuse before the affected body or downstream consumer. Tensor
comparisons require exact CPU profiles; bounded recursive comparisons admit
only finite native values (depth 16/nodes 4096), with both mapping and dataclass
attributes checked for native ModelOutput replacements. No dense masks or extra
tensor snapshots are introduced by these guards. Global Torch forward hooks
refuse before tokenization and are never modified.

Setup and all encoder builds share one reverse restoration journal; original
exceptions propagate. Local encoder hook functions restore before the existing
bridge owns attention. In-place mutation of owned tensors/contained output
values, concurrent forwards, and registry/model mutation remain explicitly
outside this cooperative profile. Kwargs entry replacement is checked from the
before-hook binding. These restrictions do not qualify hostile arbitrary hooks.
R1 retention audit is CLEAN/READFINISHED for exactly three candidates and 31,526,912
allocated bytes; it grants no cleanup authorization. Final same-source Main-native-r3 passes eight forwards from all four complete
Main recipes; context/mask/pool/native-output observations match R1 byte-for-byte.
Final-source mutation round 3 again records 2 GREEN→one semantic RED plus control
GREEN→two restored GREEN; all 1,366 R2 isolated members and shared subject match
the retained originals. Mutation round 2 belongs to R1 source, round 3 to R2 source.
Independent fresh source R2 is CLEAN/READFINISHED under the stated cooperative
contract; it did not execute qualification. Fresh R2 retention is CLEAN/READFINISHED for exactly the two new candidates,
30,900,224 allocated bytes. Both audits retain 22 fixture mappings in eight
CAS blobs totaling 648,716 bytes, plus raw Main archive, full source archives,
all original/mutant/patch/runner/log/JUnit bytes and primary sources. The five
candidates totaled **62,427,136 allocated bytes**. ROOT freshly verified all 16
then-existing delegated tasks completed without pending child/question/approval,
all 36 owned units and recorded groups physically idle, exact current source,
all 1,366 members in each restored isolated checkout, archive/CAS closure and
global incoming dependency/symlink checks. ROOT then removed only those five
paths; the measured artifact-root reduction is **62,427,136 bytes**, with all
paths absent and protected dependencies preserved. Audits supplied retained-byte
closure, not deletion authorization or independent runtime certification.

## Preserved exclusions

No production generation caller, UI/preload, public protocol/capability, queue,
Save/history/provenance or accepted-result path changes. Every enabled-region
NEW refusal remains, including empty/locked/zero-opacity regions. Smart permission
stays target-only; published work and frozen Retry remain independent of later
regional edits. Regional Guidance stays excluded from provenance, Compare and
result-derived presets. PP-001/007/008 remain **Пока не обещать**. Random native
CPU components do not establish trained quality, GPU, packaged worker, public
flow, preferred soft weighting or composition policy. Actual denoising and
resolved regional resource preparation remain separate owners.

## Evidence retention

Compact evidence is retained under
`~/.codex/artifacts/imagegen-studio/runs/regional-guidance-consumer/20261026-text`.
`source-version-map.json` distinguishes the initial source/fixtures, R1, causal
regressions, pre-typing guard, typed R2 and final documentation. The actual
external runtime and the geometry baseline remain protected bidirectionally.
No new environment, trained weights or downloads were created. The run remains
below its 100 MiB local aim; native runs were serial, while one small source-only
Ruff check overlapped a mutation controller. Per-unit ceilings are not a measured
aggregate capacity claim. No fresh app build is claimed.
