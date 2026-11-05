# Global exact embeddings with Regional Guidance

Base: `6ad574fcc32d2e65f9c8867bc99b2ac8b82cba8b`. Risk: high — public admission,
exact resource ownership, frozen Retry and accepted base provenance.
This connects global textual-inversion (TI) refs to the existing regional TI
consumer; no new inference algorithm, worker protocol or default is selected.

## Current sources and owner

Current local InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd` was read directly:
`app/invocations/text_encoder/compel.py`, `app/util/ti_utils.py`,
`backend/model_patcher.py`, and frontend generation `core/graph.ts` /
`core/canvas/addRegionalGuidance.ts`. Each global/regional prompt reaches the
same Compel/TI owner. Studio retains its existing exact saved-resource policy;
Invoke's name fallback does not replace catalog/local identity or select Default.

The existing Main recipe already contains effective global and regional signed
descriptors. Python already snapshots/qualifies their exact bytes, allocates
stream-local aliases on owned text components and installs through the existing
native loader. Its base parameter embedding tuples must remain empty, so that
resources are loaded exactly once through that recipe owner.

The new public seam is three-way agreement:

1. Ordinary frozen context retains authored global refs and effective full
   descriptors for resource reload and base provenance.
2. `recipe.globalEmbeddings` and global effective refs/text must describe those
   same exact signed bindings. Matching only path/SHA is insufficient when two
   catalog identities share bytes. Dormant authored refs do not become active.
3. The logical ordinary command retains the corresponding thin descriptors.
   Only the serialized native bundle gets a detached resource-empty command;
   the logical request/lease and frozen inputs are not stripped.

Agreement is checked before durable admission and again on hydrated reload.
Truly empty absent/array cases preserve historical meaning. Private direct
recipe-owned TI with empty commands remains valid; private Main submission
continues to refuse authored global TI. Existing public empty-resource jobs,
Euler/explicit Euler-a policies and static batches retain their behavior.

Existing `illustrious-embeddings` support and `embeddingsSupported` state supply
early admission and Retry checks. A qualified current worker already requires
this capability; removing it makes the peer incompatible at startup, rather
than a qualified empty-global-only peer. No new capability or schema flag is needed.
Accepted ordinary provenance keeps consumed global refs; regional masks/prompts/refs and
composition/initialization operational identities stay excluded.

## Bounds and acceptance

Retain existing 32-job policy, 16 aggregate descriptors, 300 vectors per emitted
sign / 600 total, 64 MiB unique serialized resources, 512 MiB shared-owned budget,
4 GiB source payload guard and 308 emitted rows per sign. Existing text, geometry,
mask, transport and resource ceilings remain. This adds no capacity claim.

Lower real Main/SQLite/file tests cover full context/recipe/command agreement,
different catalog identities with identical bytes, dormant refs, signed same
literal ownership, batch/refusal/replacement, capability-before-composition,
frozen recovery/Retry after draft/default edits and global-only base provenance.
Mutations challenge lost/swap association and failure to clear native command
resources, with empty-global controls and exact restoration.

One installed flow uses exactly three regional wires: a two-item public Euler-a
batch at seeds123/124, first healthy completion, second Cancel after genuine
observed native steps, then frozen Retry124 after saved authoring edits. Two
healthy PNGs pass original Results and explicit Add/Discard/Undo/Save/reopen.
The same literal and same positive text bind global A and regional C; global
negative B is inherited separately, while another local negative binds D.
Four tiny, real paired F32 safetensors have fixed row/column-varying vectors;
they are nontrained fixtures, not quality evidence. Register through the actual
ModelRepository and resolve through real ModelService. Their catalog-managed
SHARED paths remain protected for future Retry.

The actual bundle must contain recipe-owned A/B/C/D while its native command
contains no global TI tuples. Native vector-consumption/causality qualification
is reused from the existing unchanged TI owner; this slice does not claim a new
row/context observer or infer TI sensitivity merely from different-seed PNGs.
No new numerical mechanism, model/environment copy or prompt search.
Use the same official Illustrious v0.1, 1024², 30 steps, CFG5 and versioned Main
policy, with aggregate12GiB host guard, zero swap and600-second deadline.

Evidence: artifact-relative
`runs/regional-guidance-global-embeddings/20261106-exact-global`.

## Confirmed implementation and checks

Public static preparation filters refs through the existing active-literal
selector before ordinary resource preparation, then restores all authored refs
in the frozen context. Unavailable dormant refs therefore neither resolve nor
enter consumed provenance. Ordinary dynamic preparation retains its broader pool.
Full signed context/recipe/command agreement is enforced before publication and
on reload. Frozen Retry rechecks original global resources before its SQL change;
current draft or Default edits cannot replace them. Only the detached native
command loses global TI tuples; logical requests, leases and durable inputs keep
their exact descriptors.

The first installed attempt exposed a real additional seam: the shared model
loader normalized global TI text as ordinary text before recipe conditioning.
`illustrious_regional_worker.py` now makes a detached base-parameter copy with
empty prompts **for model loading only**. Complete recipe/ref/syntax/resource
validation still precedes loading, and the original checked command/text reaches
the unchanged recipe TI/Compel owner. All other inference fields are preserved;
the borrowed source CLIPs receive no TI installation. This follows Invoke's
component acquisition before per-prompt `generate_ti_list`/`apply_ti`/Compel,
also checked in `backend/model_manager/load/model_loaders/stable_diffusion.py`.
No inference-loop, protocol, capability or default change is involved.

ROOT execution:

- **418 distinct Main/transport cases PASS** across the lower regional set129,
  new-global/client set24 and disjoint queue/preparation/provenance neighbors265.
  The final client fixture rerun6 is included, not added again.
- **164 Python cases PASS** across worker transport, initialization transport,
  inference boundary and protocol. Twelve appended cases use real owned
  snapshots/parser and paired F32 fixtures, with explicitly fake native
  loader/output collaborators. Pre-fix2 TI RED plus2 plain GREEN reproduce the
  loader-copy boundary; malformed/unbound cases still refuse before loading.
- Typecheck, scoped ESLint/Prettier/Ruff, scoped strict Python typing and fresh
  application build PASS. Existing bundle-size warning remains nonblocking.
- Isolated Main mutations: **12 selections =10 GREEN /2 semantic RED**.
  Removing full descriptor equality lets a same-path/same-byte different catalog
  identity reach forbidden publication preflight; retaining global native
  command tuples violates the sole-loader assertion. Empty-global controls
  remain GREEN and exact restoration returns both targets GREEN. Every1,484
  source file in the copy/live freeze matched before disposal.
- Independent source reviews of Main, installed harness and the worker
  correction are CLEAN. They did not rerun ROOT execution.

The existing owned noneditable worker0.14 was refreshed in place with the
qualified payload-refresh tool. Its actual Ready/physical exit passed, while
dependency versions, runtime location and original checkpoint stayed unchanged.
Current companion: `worker-refresh-r1.json` (SHA-256
`3df6157c6d6b7afb6070f700dd3f5fa84e04a82c1d3217d65187d6197ebd6ed8`).
This is developer-runtime qualification, not release Install/Repair evidence.

## Installed outcome and exclusions

`native-r3` passes **15 grouped checks** in271.781s (bounded launcher272.903s).
One genuine UI Generate admits a two-item Euler-a30/CFG5 batch at seeds123/124.
Seed123 completes; seed124 is canceled after observed5/6; saved global
text/refs, sampling/seed and regional edits precede its explicit frozen Retry.
Exactly **3 regional wires /2 verified PNGs /66 scalar progress events** are
observed. Every serialized native command has no global embedding tuples while
its recipe keeps global A/B and regional C/inherited B/local D. Default C does
not replace saved A, including their same literal and same positive text.

Both Results independently decode to their own receipts and browser pixels.
Reviewed Add-one/Discard-one closes both original and Retry sessions with their
tombstones; Raster Undo/Redo, two explicit Saves, independent ZIP reading and
reopen retain exact accepted pixels and global-only A/B provenance. Prior
business rows/packages/history/candidate/input bytes remain preserved; normal
Home `indexed_at` refreshes and the receipt allocation counter's two increments
are expected exceptions, not byte-identical-SQL claims.

Excluded diagnostics are retained: initial dormant-ref and invalid-ready test
fixtures; two TS readonly corrections and one Python typing cast; initial
mutation-driver pnpm relocation refusal/ambiguous assertion anchor; a wrong
test filename and maintenance helper import. Installed `native-r1` made one
failed wire before denoising (ordinary loader rejected TI text), no PNG, and
its pending neighbor was canceled through the original queue with unrelated
rows exact. `native-r2` made no regional wire: real Project open succeeded but
the default5s tab wait expired; the harness now uses its existing bounded
readiness deadline. Neither attempt is a successful native acceptance. Across
all attempts there are4 wires, with only the final3 forming the healthy matrix.

## Retention and boundary

All **4,725 entries** are retained in `retained-payloads.tar.gz` with a per-entry
manifest, including exact disposed source/native payloads, original PNGs,
nine authored packages, own queue inputs, four16,528-byte TI fixtures and a
consistent SQLite backup. After fresh exit/restoration/source/incoming-reader
checks, six exact own payload directories were removed; the deletion-only root
allocation reduction is **112,029,696 bytes**. The canonical runtime/catalog,
model, durable Projects/queue data, current refresh companion and four SHARED
TI originals remain protected for future frozen Retry. No symlink target or
ordinary user app data was deleted.

This connects exact global resources to the existing native TI owner; it adds
no fresh loaded-row/context causal observer and no quality claim. Public
defaults, visual NOT_QUALIFIED, human acceptance, Anima, capacity/release and
PP-001/007/008 **«Пока не обещать»** remain unchanged.
