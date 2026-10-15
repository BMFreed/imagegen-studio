# Private Smart Patch acceptance plan

## Prospective scope and risk

Base `80e2521470304c3393e201283b3e96ab9afe7837`, clean master. High risk:
immutable provenance, private staging byte ownership, source identity and future
`.igs` acceptance. Supporting contracts: PP-007/008,
[Smart Patch](../features/project/generate-mode/smart-patch-layer.md),
[Results](../features/project/generate-mode/generation-results.md) and
[storage](../specs/03-data-storage.md). The previous
[queued execution](./phase-4-smart-patch-queued-execution-research.md) publishes
independent world RGBA and final-mask recovery candidates.

Confirmed: production Project schema explicitly permits only empty Patch
variants. Save/asset enumeration, active compositing, history/resource identities
and durable acceptance journal all remain Raster-only. Widening that schema
before its consumers would silently drop/ignore accepted pixels. Normal Raster
provenance also equates reusable Size with grid8 output/bbox, incompatible with
independent world7×5/internal64×64 Smart Patch output. The current normal
cancellation facade cannot acknowledge a running private Smart owner, so public
acceptance must remain off until lifecycle routing is connected.

Chosen finite prerequisite: separate standalone portable variant/provenance
contract, identity-bound staging image+mask read, proposed variant projection,
owned-input/source staleness assessment and read-only Main acceptance planning.
Project schema continues rejecting nonempty variants. No document/Undo/shadow/
`.igs`/history mutation, journal, cancellation, tombstone/discard or public
Generate/Results/Add is enabled. A plan contains proposed metadata only; it is
not an accepted Project provenance record or an authorization to commit later
without revalidation.

## Owners and invariants

- Staging captures project/document/session/candidate/image/payload nomination
  before awaits; verifies actual PNG, mask, shared completed receipt, surviving
  queue row and tombstone. Return detached buffers only for the nominated read,
  not every candidate scan. Pruned queue/input files are unnecessary.
- Standalone variant has its own frozen bbox/asset/identity and three portable
  provenance groups. Reusable configuration omits Size; explicit four modes
  preserve both families without weakening normal Raster schemas. Anima
  component hashes/sizes are retained without inventing local registry UUIDs.
  Current inputs do not freeze planner seed behavior or LaMa/runtime identity;
  the projector must not invent them or read a later catalog to fill history.
- Projector consumes freshly verified bytes and strict frozen payload, verifies
  seed/output/source/alpha identities and excludes operational paths, compiled
  arrays, queue-bundle IDs, Project key and all regional data. Proposed frozen
  diagnostic baseline is independent of current mutable inputs.
- Planner captures caller selection, owner methods and worker before await;
  scopes exact local Project/document/target. Selected IDs must come from the
  exact reviewed target set. Anchor is focused if selected, otherwise stable
  completion order. Missing/wrong-kind target remains orphaned, locked OR hidden
  refuses before source composition, preserving temporary results.
- Current source uses actual captured below-target composition. Changed mask,
  bbox/internal/blur/coherence/relevant authored draft or source pixels yields
  outdated; current draft never replaces proposed historical fields. Padding,
  labels, unrelated document revision/normal settings and inactive authoring
  fields do not falsely stale a result. Missing source cannot report ready.
  This assessment does not qualify the current model registry/runtime.
- Main checks current owner/document/revision again after async preparation.
  Source capture leases and nominated read own their actual bytes; a changed
  document or candidate makes the plan stale. Future commit must revalidate and
  prove durable shadow adoption before staging cleanup.

Alternative rejected: disguised ordinary Raster candidate/provenance, premature
Project schema widening, prototype JSON draft equality as staleness oracle,
or resolving current model paths to fill immutable history.

## Parameters and verification plan

Existing bounds only: selection1..64, world sides1..2048 and4M pixels,
internal grid8 (Anima at least64), PNG32MiB, uint32 actual seed0/MAX,
128KiB frozen operational payload, portable member/document ceilings. These
are defensive policy limits, not measured ML capacity. No downloads/runtime
upgrade or trained GPU qualification.

Verify standalone strict schema and unchanged legacy/normal rejection;
real SQLite/FS image+mask read after prune, nomination aliases, wrong lineage,
tombstones/receipts/topology and truthful wrong alpha; exact family projection
with independent world/internal geometry, no operational paths; one real
ProjectService capture/queued publication → private Main plan with actual CPU
source composition and unchanged document/.igs/shadow/history/staging/cursor.
Exercise changed inputs/outdated and blocked/orphan, stable anchor, late document
change and selection mutation. Execute causal isolated semantic RED/neighbor
GREEN pairs, confirm physical exit/source restoration and clean owned payloads.
Use serial bounded checks with zero swap; update PP bodies/matrix and roadmap
without raising public readiness. Evidence and final limitations follow below.

## Implemented boundary and initial evidence

This is self-review with delegated contract/owner review, not a blind audit.
The standalone parsers/types live beside the existing shared project schemas;
normal Raster contracts and empty-only Smart Patch document membership are
unchanged. Proposed variants retain their own world bbox, output PNG and raw
alpha identity. Source context records authored mask/draft, effective blur and
coherence, internal resolution, raw beneath-source identity and prepared
model/latent/final-mask identities. These diagnostic snapshots reference hashes,
not operational files or historical source/mask asset ownership.

[Staging](../../src/main/projects/smart-patch-generation-staging.ts)
provides `readVerifiedCandidate` with exact document-aware nomination. Its
opt-in byte read returns detached image/mask only for that candidate; discovery
does not retain up to64 images in memory. Receipt, retained queue, tombstone,
directory/file witnesses and exact PNG/mask relation are rechecked. Queue/input
pruning remains independent.

[Projection](../../src/main/projects/project-smart-patch-variant-projection.ts)
captures metadata and buffers before async PNG validation, reparses the exact
frozen payload, checks actual seed/image/final alpha and constructs a proposed
portable record. It uses actual inference checkpoint prediction type, preserves
the authored baseline separately and never resolves a later model catalog to
rewrite history. Anima component sizes/hashes need no fabricated registry UUIDs.
Concrete raw prompts remain separate from authored dynamic templates; compiled
prompt arrays and operational paths are absent.

[State assessment](../../src/main/projects/project-smart-patch-variant-state.ts)
compares the frozen owned baseline with a current document and independently
supplied source identity. Source changes are detected even with unchanged
documentRevision. Labels/relinking, disabled LoRAs, unused embedding sidecars,
dormant seed values, Anima's inactive SD sampler pair, resolved-default absence,
Fit padding and unrelated Project edits are negative controls. Missing source
is unverified; wrong-kind/missing owner is orphaned; either lock or hidden state
is blocked. `ready` means authored/source freshness only, not current library
prediction/noise/component policy or runtime/resource availability qualification.

[Main plan](../../src/main/projects/project-smart-patch-acceptance-plan.ts)
is exposed only through `ProjectService.prepareSmartPatchVariantAcceptance`,
without IPC or renderer wiring. It verifies a single exact target/document and
the reviewed candidate set, reads each selected image sequentially, computes
current source once and rechecks owner/revision/available nominations afterward.
Only proposed metadata is retained in the result, not64 image buffers. Focused
selected candidate wins; otherwise stable completion order determines anchor.
The plan is not a journal, accepted provenance record or future commit token.

Initial accepted GREEN: **65 targeted TS checks, 0 failed/skipped**, covering
strict standalone schemas, real SQL/FS candidate reads, state rules, projection
and planning. **Two actual Main/native scenarios, one per family**, extend the
existing Project capture → queued native execution → CPU world output → pruned
queue/fresh recovery path with the real Service plan and an actual source CPU
JSONL child. They assert unchanged document/`.igs`/shadow/history, candidate
retention, existing completed receipt and seed cursor. Random tiny CPU ML models
are mechanical controls, not trained quality or installed/GPU qualification.
The other planning unit tests explicitly use a controlled source-capture
collaborator, while publication/read/SQL remain real. Schema/state fixtures are
declared literal metadata, not output assembled by the parser under test.

## Finding reproduced and corrected

Saved Project model prediction metadata can legitimately be stale or null:
ModelService returns the actual library policy during preparation. Copying
`draft.model.predictionType` into proposed provenance incorrectly recorded EPS
for a valid V-executed candidate. Before fixing, the exact two-test run produced
**Illustrious assertion RED (`epsilon` versus `v_prediction`) and Anima GREEN**,
with no skip/import/setup failure. Projection now copies the frozen inference
checkpoint policy and retains the old/null authored snapshot only as diagnostic
baseline. The same selected case and a null-authored control pass afterward.

Other initial failures were fixture/static issues: incorrect create-document
arguments, callback/ICC literal inference, queue DTO document field and a
txt2img metadata fixture retaining a nonnull model-source identity. They were
corrected without relaxing production checks and are not semantic RED evidence.
Review also corrected a supposed blur-change control that only changed padding,
renamed a staging-method snapshot test that did not exercise worker substitution,
and added actual sibling completion while source composition is held. The late
event is independently observed before release/assertion; no fixed sleep is used.

## Remaining integration limits

Next owner must connect all variant assets to archive/shadow/Undo retention and
active-only compositing at each variant's frozen bbox. Then dedicated durable
Add/journal/reconciliation must adopt assets, enforce target permissions again,
cancel only confirmed siblings through the actual Smart processor and prove
durable shadow before cleanup. Project/portable-copy/history/image resource/
renderer integration and public Generate/Results remain closed in this slice.

Current source recapture obeys the existing2048-side/4M-pixel CPU envelope;
changed targets beyond it refuse this preflight. Current model-registry policy
is not requalified by the state helper. Before public freshness/acceptance,
those owners must handle current resource-policy checks and source availability
without rewriting frozen history. The current private queue also does not freeze
actual planner seedBehavior, LaMa resource identity or runtime version; this
projector intentionally omits unavailable fields rather than claiming a complete
execution recipe. Public planning/admission must supply any required explicit
execution metadata before enabling accepted-result promises. PP-007/008 status
and matrix remain «Пока не обещать».

## Final regression and semantic sensitivity

Affected TS regression: **2545 PASS, 0 failed/skipped**,160 files,278.638s.
Final focused set after the diagnostic-only correction below: **65 PASS,
0 failed/skipped**. The two real Main/native cases above also passed separately.
These counts overlap and must not be summed as distinct tests. No Python
implementation changed; this slice uses the existing source CPU/native runtime
without claiming a new Python-wide or installed-GPU qualification.

Seven isolated mutations each produced exactly one causal assertion RED and
one neighboring GREEN, with correct private import routing:

| Mutation                                                       | RED observation                                                                 | GREEN control                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Copy authored prediction instead of executed checkpoint policy | Legal EPS-authored/V-executed candidate proposes the wrong recorded prediction. | Anima proposal still preserves its native null prediction.         |
| Ignore nominated document lineage                              | A completed candidate can be read under another document ID.                    | Exact Illustrious candidate still reads after queue/input pruning. |
| Retain caller nomination instead of capturing it               | A queued read follows caller mutations made during held publication.            | Exact pruned-candidate read still succeeds.                        |
| Omit final reviewed-set check                                  | A sibling completing during held source composition silently expands the set.   | Stable reviewed proposal still succeeds.                           |
| Omit actual RGBA/final-mask equality                           | A valid truthfully rehashed PNG with wrong actual alpha forms a proposal.       | Original valid pixels still propose successfully.                  |
| Ignore actual source identity                                  | Changed source pixels with unchanged documentRevision incorrectly remain ready. | Matching frozen inputs/source remain ready.                        |
| Require both lock and hidden instead of either                 | Hidden target gets a proposal instead of refusing before source work.           | Visible unlocked target still succeeds.                            |

The complete final probe is `plan-mutation-89e4ba13dd-summary.json`. Original
source hashes stayed identical before/after every case and after final source
formatting. Isolated copies were removed only after independent MainPID0 and
empty-cgroup confirmation. Final unmutated65 checks passed afterward.

### Bounded diagnostic allocation incident

An earlier probe stopped at the4GiB/zero-swap cgroup ceiling while reporting
the deliberately broken document-lineage assertion. Its sole GREEN neighbor
completed, but the failing test produced no causal TAP RED/footer; this is
**excluded** from semantic results. Physical result was `oom-kill`, not success.
The whole initial prefix is retained under
`plan-mutation-cd3da7b8b3-summary.json`; it must not inflate the seven final pairs.

The test compared a returned byte-bearing object directly with null. Replacing
that assertion with the identical boolean predicate and a short message made
the same mutation produce the expected small assertion RED at the original
memory limit; the unchanged exact read stayed GREEN. This isolates the issue to
failure reporting, not a change in production read behavior. The precise
allocator stack was not measured. No memory ceiling was increased. Failed-unit
physical exit and copy restoration preceded the retry; the actual abandoned
dummy fixture is identified and cleaned separately at handoff.

Required final checks PASS: `pnpm run typecheck`, `pnpm run lint`,
`pnpm run app:build`. The built Main bundle contains the private Service
entry point, planner and projection. Broad regression preceded only the short
boolean diagnostic change; final65 and the complete seven-pair mutation run
verify the delivered assertion. Production behavior did not change after the
broader run. No Vue/prototype/layout files changed, so no prototype visual test
or public UI scenario is claimed. Final active checks were serial, zero-swap,
with finite180/300s deadlines:2GiB typecheck/build,4GiB broad TS/lint/mutations.
The complete mutation run's observed peak was280,395,776 bytes; the excluded
diagnostic failure hit its4GiB ceiling without increasing the later budget.

## Artifacts and cleanup

Compact commands/logs, source hashes, actual prediction RED/GREEN, both mutation
prefixes, physical-exit/restoration and cleanup proof are retained at
`~/.codex/artifacts/imagegen-studio/runs/smart-patch-acceptance-plan/20261015-plan/`.
All owned bounded process groups independently confirmed MainPID0 and no child
PIDs before cleanup. The interrupted probe's remaining temporary fixture was
recognized by its exact candidate/document, completion within the failed unit's
2-second lifetime, self-owned paths, literal checkpoint content and six tiny
dummy model files (17–24 bytes). Its descriptor/manifest was saved; this was
agent-created test data, not ordinary app data or original models. Removed only
that exact fixture and this run's controller cache: **1,294,336 allocated bytes
reclaimed**, about1.23MiB. Successful fixtures had already cleaned their own
temporary data after child exit. No mutation copies or rollback payload remain.

This run retains about1.04MiB evidence. Artifact root is about27.5GiB, shared
pool26.2GiB and runs1.29GiB; free space about42.9GiB at cleanup. The existing
runs-over1GiB evidence-budget exception remains recorded: prior linked native/
GPU qualification and semantic/recovery evidence, including184/129MiB cap sets,
is retained until its owning qualification/reproduction can be consolidated.
No blind sweep or model/environment copy was made. Existing source `.venv` and
the shared catalog/LaMa companions stay protected; reuse is recorded on both
lifecycle sides. Delivery revision/push and clean-tree proof are added to
`delivery.json` only after the actual Git operations.
