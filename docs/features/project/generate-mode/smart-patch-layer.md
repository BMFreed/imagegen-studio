# Smart Patch Layer

[Save Current as Preset](../../../engineering/phase-4-smart-patch-current-preset-research.md)
captures the exact acknowledged selected Patch draft synchronously as a detached
authoring source, separate from accepted-result presets and Apply. It retains
authored prompt templates and exact resources, starts with Smart Patch workflow
and omits Size/Seed/batch and all
Patch geometry/source/execution context. Hidden, locked, empty-mask and variant-free
sources may be copied without ML or an available catalog; pending synchronization
anywhere in the Project blocks without flush/seal. Source Project/Patch identity
stays fixed in the Manager banner through later authoring/catalog changes and actual
failed INSERT/retry. Explicit Create changes only the preset catalog.

Root execution passes **222 neighbor tests, zero failures/skips**,
typecheck r3, full lint r2 and a fresh build. The isolated wrong-owner mutation
goes GREEN (2) → semantic RED/control GREEN → restored GREEN (2), with all 1,313
archived source members byte-exact restored. The focused owner regression goes
RED before the fix → GREEN after it with the causal assertion unchanged;
same-owner invalid raw input is preserved. Actual `native-r2` passes all **12
automated checks**, exits code 0 across two healthy Electron lifetimes and retains
two recipes after restart. Exact accepted PNG/provenance, Project, seed/library
policy and package bytes stay unchanged; keyboard/focus/layout pass at 1440×900
and the real 900×620 minimum. Production review R2 and final native-source R4
review of the two `useInnerText` assertions are clean; scoped final-harness ESLint
passes. Root opened six final native-r2 screenshots (normal, minimum-width source,
scrolled, restored, SQLite failure and restart), with no material UI defect in
scope; `root-visual-review.json` is retained. Both retention audits are clean; root completes the exact listed
temporary-data cleanup with 96.59 MiB reclaimed and compact evidence preserved. This slice does not qualify inference, release
or complete PP-006; public status remains **Пока не обещать**.

[Smart-target preset Apply](../../../engineering/phase-4-smart-patch-preset-apply-research.md)
implements a finite copy into the selected Patch generation draft through
dedicated `getSmartPatchPresetApplicationReview` / `applySmartPatchPreset` APIs.
The detached preview uses current Patch values and model family. Its ephemeral
review token binds the exact coordinator, document epoch, revision and layer
through staged commit; it is never persisted. Hidden targets remain editable,
locked targets refuse, and pending Project/sibling-Patch draft synchronization
blocks opening/submitting without flushing drafts or sealing prompt history.

Every preset workflow is eligible; the badge is advisory and never changes mode
or supplies absent sections. Smart Size is omitted from preview and Select all;
selected Size refuses. A size-only source has no available sections and cannot
Apply. Preset Size never touches bbox or internal resolution. Seed starts
deselected; explicit selection copies policy/value without resolving a seed or
advancing its cursor. Selected-only resource verification needs no ML runtime.

Only the reviewed Patch generation draft changes, with one Undo for a changed
Apply, no history entry for a no-op and no implicit Save. Source preset, Project
draft/primary bbox, other Patch drafts, mask/bbox/internal resolution,
coherence/compositing, variants/active member, accepted pixels/provenance,
queue/frozen jobs, seed cursor and Model Manager policies stay unchanged.
Derived freshness may reflect authored changes. Ordinary Apply, result-preset
creation and Compare retain their separate owners.

The finite checkpoint passes **363 focused/neighbor tests** (including 33
shared/renderer/control and 18 real Main tests), **12 native checks**, typecheck,
lint and a fresh build. Native qualification covers both families, selected-only
mutation, one Undo/Redo, actual Save/loader/reopen and 900×620 layout/keyboard.
The staged-review semantic mutation fails as intended and restores to GREEN.
Earlier failed attempts remain recorded. Portable fixtures do not qualify
installed Smart Apply→inference or release; PP-006 remains **Пока не обещать**.

[Smart settings Compare](../../../engineering/phase-4-smart-patch-compare-research.md)
is implemented from the active accepted variant's layer menu and the converted
Smart Raster menu. The dedicated strict read compares recorded generation
settings with the current **Project Canvas**, including while a Patch is selected.
It omits the entire Size section and geometry/layer/source/execution context,
without activation or Project mutation. Existing ordinary Compare and Smart
preset actions remain intact. The scoped native qualification passes all 18 checks.
At that Compare checkpoint, inactive direct Compare, Smart-target Apply,
image comparison and inference were outside its slice. The later finite
Smart-target Apply checkpoint is linked above. PP-005/006 remain
**Пока не обещать**; final outcomes belong to the linked research.

[Accepted variant history](../../../engineering/phase-4-smart-patch-history-research.md)
includes each accepted nested variant in Project history and, after explicit Save,
Saved generations. Navigation reveals its current parent and opens the exact
stored variant with a separate **From history** marker. Inactive and hidden/locked
variants remain inspectable without activation, document edits or implicit Save.
Parent-ID Canvas resources remain active-only; exact variant resources retain
revision, asset and ownership checks. Smart Compare belongs to the separate
checkpoint above; history does not add a direct inactive-variant Compare action.

[Save Preset from Result](../../../engineering/phase-4-smart-patch-result-preset-research.md)
copies frozen reusable settings from the active accepted variant, an exact
inactive stored variant, or a converted Smart Raster into the existing detached
Preset Manager. Every Smart origin defaults to `Smart Patch`; Size, Seed by
default, masks, bbox, internal resolution and source/execution context are
excluded. It does not activate variants or edit the Project. Current containment
and asset identity own the read; hidden/locked and unverified sources remain
eligible without a worker or catalog. Explicit Create owns preset storage.
Smart Compare uses its separate route above, with scoped native qualification
recorded in the linked checkpoint. At that result-source checkpoint, Smart-target
Apply was pending; its later finite implementation is linked above.

[Explicit orphan Raster acceptance](../../../engineering/phase-4-smart-patch-orphan-raster-research.md)
is a separate result action when the original Patch is absent from the current
original document. It preserves the committed world contribution and complete
Smart provenance in a new ordinary Raster, at the frozen bbox, without a runtime,
current mask or automatic retargeting. The normal journal/recovery/Undo/Save rules
apply. Reviewed target-local Retry work is canceled; unrelated results remain.
A converted Raster appears in ordinary accepted history. Its settings Compare
uses the dedicated Smart route above, with scoped native qualification recorded in the linked checkpoint;
its preset source retains its separate dedicated route. Evidence and
limits belong to their respective checkpoints.

## Feature

Smart Patch Layer is the main ImageGen Studio entity for local generative editing in `Project` / `Generate`.

It replaces standalone inpaint masks with a layer-owned model:

```text
1 Smart Patch Layer
= 1 mask
= 1 layer-owned bounding box
= 1 internal resolution
= 1 layer-owned generation draft
= N raster sub-layers
= 1 active/visible raster sub-layer
= immutable provenance per accepted raster sub-layer
```

## Previous production checkpoint: empty document foundation

[Foundation evidence](../../../engineering/phase-4-smart-patch-foundation-research.md)
qualifies the real `+ Patch` command, top-of-stack creation, independently owned
bbox/internal resolution/generation draft, selection, targeted editing,
Undo/Redo, `.igs` Save/reopen and local crash recovery without an ML runtime.
The empty mask is an explicit document descriptor
`{ id: UUID, revision: 0, asset: null }`, not fabricated pixels or a shared layer.
Production uses `kind: 'smart-patch'`; the suggested full-MVP shape below is a
product model, not the current persistence schema.

Empty masks contribute no asset references. Patches without accepted variants
contribute no compositing pixels or accepted-history records. The later owned-mask
authoring extension below admits painted masks; nonempty raster sub-layers and
active variants were unsupported at this earlier checkpoint. At that checkpoint,
Patch Generate, Apply Preset and Save Current as Preset showed explicit unavailable
reasons; Manage Presets stayed available. Generation/variants, staleness,
comparison and preset projection were subsequent phase-4 slices. Later finite
Smart-target Apply is linked above.

## Production checkpoint: owned mask authoring

[Owned-mask authoring](../../../engineering/phase-4-smart-patch-mask-authoring-research.md)
implements Brush, Eraser, Lasso, Polygon Lasso, Add/Subtract, overlay visibility
and Clear through captured renderer gestures and an authoritative Main CPU
rasterizer. It does not require an ML runtime or model. A completed gesture creates
one Project Undo step; a cancelled or unchanged gesture creates no mask revision.
The original empty descriptor remains valid. Clear retains the mask identity and
increments its revision, with `asset: null` and no `bounds`; cleared revisions may
be greater than zero.

A painted mask stores `asset: { path, sha256, bytes, width, height }` and integer
world-space `bounds: { x, y, width, height }`. One mask pixel is one project pixel;
bounds are independent of the Patch bbox and internal resolution. Assets use
`assets/masks/<mask-id>/<sha256>.png`, canonical white RGBA8 with linear alpha8
coverage. Transparent means outside the mask, opaque means fully covered; soft
coverage is preserved. Main creates pixels/paths and validates ownership, hashes,
dimensions, PNG structure and tight nonempty coverage before publishing. The PNG
reader accepts at most 256 IDAT chunks and refuses the 257th before adding another
data view; the current Main encoder writes one IDAT chunk. This bounds chunk-object
allocation in addition to encoded byte and decoded pixel limits. The renderer
shows a provisional gesture and scales the stored PNG for its mask
thumbnail; this is not a new preview worker or generated Raster output.

Main refuses stale identities/revisions, locked or hidden targets, invalid pixels
and edits beyond the finite CPU limits without a document/history commit. Existing
asset ownership retains prior mask bytes for Undo/Redo, explicit Save and local
recovery. Eight real Service cases, full app regression (3751 PASS), affected
checks after IDAT hardening (176 PASS), and 33 native UI/recovery checks pass.
Five semantic RED/neighbor GREEN pairs have byte-exact restoration. Bounded
typecheck/lint/build pass; counts, actual boundary and excluded attempts are
recorded in the authoring checkpoint. This qualifies the declared authoring slice.

## Production checkpoint: owned mask settings

[Mask settings checkpoint](../../../engineering/phase-4-smart-patch-mask-settings-research.md)
adds two always-visible compact rows after Hide overlay/Clear mask in the selected
Patch's left Mask section: `Mask blur` (16px) and `BBox padding` (8px). Values are
independent integer project pixels0..512, including zero. Enter or blur commits
one captured scalar change; Escape/owner changes cancel and invalid raw text is
not clamped or rounded into a saved setting.

Each Patch owns optional `maskSettings: { blur, padding }`. New patches store16/8;
older documents resolve16/8 without injecting fields, dirtying the document or
creating history. Real settings edits use normal Undo/Redo, explicit Save and
local recovery. They retain painted PNG/id/revision/bounds, owned bbox, internal
resolution, draft and neighboring layers. Settings do not automatically fit bbox.
Fit uses the selected Patch's `blur + padding` margin and outward grid8. Padding
is Fit policy. At this settings checkpoint blur consumption was a later owner;
the subsequent private coherence/fade path freezes and consumes it in world
project pixels. Changing blur must stale future variants,whose lifecycle remains
unimplemented. These settings do not add a blurred authored-mask preview.

Qualification: impacted regression1835 PASS before final UI refinement, final
affected104 PASS, built native109 checks and three semantic RED/neighbor GREEN
pairs; typecheck/lint/build PASS. Real mouse Fit, keyboard Fit, invalid raw,
field focus and document navigation are verified. Chronology/source/exit proof
and viewed screenshots are in the checkpoint. Prototype lacks these production
settings controls; its mock history is not persistence evidence. Public statuses
remain unchanged.

## Previous production checkpoint: private generation input capture

[Capture checkpoint](../../../engineering/phase-4-smart-patch-generation-capture-research.md)
qualifies the finite read-only Main preparation slice. It captures an existing
Patch's bbox, internal resolution, draft, blur/padding, original verified mask
descriptor/bytes and visible source layers beneath the target. The target and
layers above it are excluded. This first capture preserves whole original mask
bytes and source RGBA/source alpha; effective mask clipping, four-mode
classification and internal-size preparation were later owners, qualified by the
current preparation checkpoint below.
Null/disjoint masks remain valid for the future source-only mode contract.
Locked/hidden existing targets remain readable by private preparation. Public
generation and Add as Variants are forbidden when the target is locked **or**
hidden (user decision15.10.2026). Public admission and acceptance must recheck both
flags at their own boundary and show an unavailable reason. They must not unlock
or reveal the target implicitly. A completed frozen candidate remains temporary
if its target becomes locked/hidden; it may be accepted after the user restores
eligibility, or explicitly discarded. This does not change the settled rules for
changed or missing targets.

Final focused14/affected1852 PASS, four actual CPU tests/nine production
`compose-target` calls and three isolated semantic RED/neighbor GREEN probes
qualify this private boundary; required typecheck/lint/build pass. Physical exit
and temporary-copy cleanup are confirmed in the checkpoint. No Electron/browser/ML run is
claimed. This preparation does not enable Generate,
enqueue work, run inference, publish candidates or persist accepted variants.
At that preparation checkpoint, variant lifecycle, staleness/compositing/comparison
and Patch presets remained subsequent owners; later finite Smart-target Apply is
linked above. Existing authoring evidence and public promise statuses stay unchanged.

## Current frozen queue Retry

[Frozen Retry](../../../engineering/phase-4-smart-patch-retry-research.md) repeats
one reviewed failed/canceled concrete Smart job through Queue Manager. The original
verified bundle is copied independently, preserving its selected index, pixels,
masks, prepared model-source, geometry, prompts, exact resources and numeric seed.
It never captures the current draft or replaces older candidate sessions. The
original Project/document/coordinator must remain open; worker/resource and source
CAS/receipt checks remain authoritative. One fresh job/batch/session enters the
existing shared FIFO drain, including during another inference owner's work.

Results remain temporary until explicit Add. Retry does not modify dirty/Undo,
accepted variants or `.igs`. Current target edits, hiding/locking and deletion
do not replace frozen replay inputs. A missing target remains orphaned with Add
as Variant unavailable; the explicit Raster recovery action is described above.
Retry performs no automatic retargeting or conversion. OUT uses its frozen model-source RGB
without resolving or rerunning LaMa. Late refusal cancels the new attempt;
uncertain publication or exit retains recovery ownership. Evidence and limits
are in the linked research; PP-007/008 remain **Пока не обещать**.

## Selected-Patch source freshness

[Selected freshness research](../../../engineering/phase-4-smart-patch-freshness-research.md) extends the previous
authored-only row summary with an automatic, read-only source inspection for the
selected stored Patch. The open variants browser shares that same App-owned
reader. Verified matching inputs display `Inputs match` in the row and
`Matches current inputs` in the browser; known authored
or lower-source changes display `Outdated`; unavailable source stays `Unverified`
with details in the browser. Model availability and Generate readiness remain
separate. Other rows retain conservative authored status.

Document revision, selection, runtime/catalog settlement and post-dispatch events
clear previous diagnostics and request current inputs. One running read plus the
newest waiting owner is shared across tab remounts. Pending drafts/busy/reload
state suspend reading. Wrong-owner/member replies and late success/failure are
refused. Diagnostics create no document revision, dirty flag, Undo or saved
provenance update. No polling or persisted freshness is introduced.

This renderer/CPU inspection extension does not qualify trained generation,
installer recovery or release; the earlier installed matrix remains separately
scoped below. Smart variant history, preset creation and settings Compare
have separate later checkpoints above; the scoped native Compare qualification passes all 18 checks.
PP-007/008 stay **Пока не обещать**.

## Previous installed qualification: trained public generation

[Installed Smart Patch generation](../../../engineering/phase-4-smart-patch-installed-generation-research.md)
passes 27 native checks through the built public UI and current noneditable
worker 0.14.0 with genuine trained Illustrious V-prediction and Anima resources.
The finite matrix is two families × TXT/IMG/INP/OUT plus each family's fixed-seed
INP replay: ten completions at processing 256/world 128, four steps, seed 123.
Independent full-world alpha checks cover every output. Each IMG/INP raw RGB
contrast differs at all 16,384 pixels, and both INP replays preserve exact whole
RGBA. These are finite numerical controls, not full Invoke parity or image quality.

All ten cycles explicitly Add a variant, exercise one Undo/Redo, Save and reopen
with exact image bytes, immutable provenance, authored Patch settings and normal/
above/below neighbors preserved. Generate does not implicitly accept or Save.
Actual correlated denoising steps appear in the UI through shared transient
telemetry. Layer Select is disabled during existing busy actions. Healthy worker
close preserves runtime ready status; all ten reopened selected Patches offer
Generate without a Repair notice before any diagnostic status getter. The 51 installed
worker files and final source/bundle/original/managed hashes are unchanged, and
all 80 observed actors physically exited. Failed attempts remain separately
recorded in the research.

Reopened stored rows can still show `unverified`. The matrix verifies stored
pixels and lineage, without qualifying automatic source-freshness re-verification
after worker lifecycle.

At that checkpoint, Smart Retry, orphan Raster conversion, accepted-history navigation, Compare/
Preset, arbitrary options, broader device/capacity coverage and release
qualification were open. PP-007/008 remain **Пока не обещать**.

## Previous production integration: public Generate, Results and Add

[Public generation integration](../../../engineering/phase-4-smart-patch-public-generation-research.md)
adds dedicated renderer/preload/Main requests for the captured selected Patch,
its exact document/revision and owned draft. Installed capabilities and current
visible/unlocked membership are checked at the real admission/dispatch boundaries.
Dynamic prompts and Fixed/Random/Reuse plan concrete bounded jobs from that frozen
draft. The single public dispatch/worker lease drives typed Smart execution.

Completed world contributions remain temporary in the dedicated Smart store.
The Canvas tray scopes selection to one original document/Patch, keeps focus
separate from selection, and supports reviewed Add, discard and image export.
Preview replaces that Patch's active contribution at its current stack position
with the candidate's frozen geometry; above layers and parent display settings
remain effective. Signed bounded thumbnails do not substitute for verified full
candidate bytes. Smart candidates never become ordinary Raster result DTOs.

Generate replacement confirms only the same document/Patch's current candidate
and unfinished-job sets. Sibling Patches and ordinary generation are independent.
Project Close and document-recovery discard inspect/drain both stores. Valid
completed candidates survive restart independently of prunable queue rows;
unfinished work follows the existing cancel-on-restart policy. Missing targets
stay visible as orphaned with Add as Variant disabled and export/discard available.
At that checkpoint, explicit orphan Raster conversion, Smart Retry,
accepted-history navigation and Compare/Preset remained separate limitations.
The current Raster and Retry checkpoints above supersede those two gaps.

Add retains the existing shared gate/journal/asset handoff and immutable lineage.
It checks the public reviewed owner inside the gate before any destructive work.
A source CPU lease is acquired inside that gate to preserve Save's lock order.
Changes made before the reviewed Add click remain current authoring, while the
accepted candidate keeps its frozen provenance and may be outdated. Generate
does not edit the document; only explicit Save writes accepted variants to `.igs`.
Executed checks and literal test inference belong to that checkpoint; installed
trained evidence is recorded above, while release remains open. PP-007/008 remain
**Пока не обещать**.

## Previous production checkpoint: variant lifecycle and current state

[Variant lifecycle/status](../../../engineering/phase-4-smart-patch-variant-lifecycle-research.md)
connects select, rename and delete for already accepted variants through actual
renderer/preload/Main commands and the existing Project history/asset owner.
Each real change is one Undo step; identical selection/normalized name is a no-op.
Deleting an inactive variant preserves active selection. Deleting the active
variant selects the next surviving index, or the preceding last member. Deleting
the final variant leaves the same empty Patch and all of its authored inputs.
Deleted pixels remain retained for Undo even after explicit Save. Locked variants
are read-only; hidden stored variants remain editable. Revision conflicts refuse
rather than replay a stale command after a pending prompt flush.

The row exposes known authored freshness and opens a persistent variants browser.
The browser separately checks actual source pixels and current exact-bound
resource availability. Matching authored inputs without source verification are
`unverified`; any known difference is `outdated`; `ready` requires a verified
matching source. Readiness here means matching generation inputs, not available
Generate or an installed runtime. Resource loss does not erase stored pixels or
block their selection/rename/delete. Catalog failure is unknown availability.
Only enabled LoRAs and active literal embedding references require resources.

Stored freshness uses the explicit current owner and preserves historical frozen
lineage on copies. Mask pixel/bounds identity matters; ownership IDs, paths and
revision counters alone do not stale restored identical coverage. Fit-only
padding, unrelated Project revisions and parent display settings are excluded.
Actual below-target source includes lower active contributions and excludes the
current Patch and higher layers. Source failures remain visible and unverified;
uncertain physical worker exit is a refusal.

That lifecycle checkpoint manages existing accepted pixels. At that checkpoint,
public Smart Generate/Results/Add IPC, accepted-history navigation, Compare/Preset
and installed trained-model qualification remained separate. PP-007/008 stay «Пока не обещать». Prototype mock
status behavior remains a separate limitation, not production evidence.

## Previous private durable acceptance

[Smart Patch durable acceptance](../../../engineering/phase-4-smart-patch-durable-acceptance-research.md)
Private Main Add now appends verified world candidates to the exact Smart Patch,
preserving old variants and current authoring with one active anchor and one Undo.
A shared Project gate and SQL intent slot serialize Raster/Smart acceptance and
close. Dedicated Smart cancellation drains inference, claim startup, CPU work
and publication; late completions require renewed review. Captured sessions are
checked against foreign targets, documents and ordinary results.

The durable order is intent → asset adoption → synced shadow → atomic session
tombstones/intent removal → staging cleanup. Recovery dispatch selects one owner;
full immutable lineage completes, absence abandons without consuming candidates,
partial/changed lineage or unknown overlap stays fenced. A clean saved package
must pass actual member verification plus file/directory sync before replacing
shadow proof. Replays do not duplicate or reactivate variants. Add never performs
Save or rewrites completed receipts/seed cursor.

At that checkpoint public Generate/Results/IPC and variant lifecycle/status were
still pending. The current integration and lifecycle sections above now cover
those boundaries. Orphan Raster conversion, Retry and installed inference have
their own later checkpoints above. Smart variant accepted-history navigation
and Compare/Preset were still open at that durable-acceptance checkpoint; their
subsequent slices are described above, with scoped Compare qualification recorded in the linked checkpoint.
PP-007/008 remain «Пока не обещать». Executed evidence and finite limits belong
to each linked research note.

## Previous variant storage/display scope

[Variant storage and material composition](../../../engineering/phase-4-smart-patch-variant-storage-research.md)
The document now owns nonempty Smart Patches: all active and inactive variant
images survive explicit Save, local recovery and Undo/Redo retention. Actual PNG
bytes, canonical sRGB profile, dimensions and immutable contribution alpha are
verified before package or new shadow publication. A metadata-only alpha change
cannot reuse a prior pixel proof. Current layer/mask/variant IDs are unique;
frozen source IDs remain historical when a later copy has new ownership.

Only the active image contributes pixels, at its own frozen world bbox and its
parent's stack position, visibility, opacity and blend mode. Current Patch bbox,
mask, blur and internal-resolution edits do not move, resize or remask stored
RGBA. Main source capture, preview/bounds and the signed renderer image resource
use this projection. The DTO/card reports `stored`, without claiming freshness
or current model availability. Top-level Raster mutation/history selectors stay
separate from this material projection.

This is storage/display support for an already populated document, not the
public acceptance command. Generate/Add, durable acceptance journal and sibling
cancellation/reconciliation, variant lifecycle controls, accepted-history
navigation, Smart Patch Compare/Preset and installed inference qualification
were later owners at that storage/display checkpoint. PP-007/008 remain «Пока не обещать». Executed evidence and
remaining limits belong to the linked research.

## Previous private acceptance-plan scope

[Smart Patch acceptance plan](../../../engineering/phase-4-smart-patch-acceptance-plan-research.md)
adds strict standalone variant/provenance contracts and a read-only proposal;
the Project schema still accepts only empty Smart Patches. Identity-bound staging
reads verify actual world RGBA and final-mask bytes. The projector checks frozen
context, worker-confirmed seed, exact contribution alpha and inference prediction
type before proposing portable metadata without managed paths or reusable `Size`.
Owned authoring and independently composed current source pixels determine
ready/outdated; unrelated Project revisions and Fit-only padding do not.
This comparison does not qualify current model-registry or runtime availability.

Private `ProjectService.prepareSmartPatchVariantAcceptance` rechecks the exact
Project owner, document/revision, target and reviewed selection around byte reads
and current-source composition. Locked or hidden targets block the proposal;
missing targets remain orphaned. A changed eligible target keeps frozen proposal
metadata and reports outdated inputs. The returned plan is not an accepted result
or a capability to commit later without revalidation.

No Project/history/`.igs` mutation, sibling cancellation, acceptance journal,
staging discard or public UI is connected. Next owners are all-variant asset
storage/validation and active-variant composition, then durable Add/reconciliation,
variant lifecycle and public Generate/Results integration. PP-007/008 remain
«Пока не обещать»; executed evidence and limits belong to the linked research.

## Previous private queued execution scope

[Private queued Smart Patch execution](../../../engineering/phase-4-smart-patch-queued-execution-research.md)
connects dedicated SQL claim, exact frozen inference, worker-confirmed uint32 seed,
CPU world composition and independently durable Smart Patch world candidates.
The private `GenerationOrchestrator.createSmartPatchExecution` handle waits for
admission and exposes explicit run/cancel/stop ownership; public drain stays off.
Both family operations share the global running-slot CAS with ordinary jobs;
normal dispatch/readers and Raster acceptance remain separate. One cancellation
owner drains inference, CPU startup/request/readback and publication before
acknowledging cancel or cleaning scratch; unconfirmed exit retains its owner,
slot and files. The private inference capability now also requires
`smart-patch-seed-confirmation`; older installed payloads refuse before ML.

A separate typed store at `recovery/smart-patch-staging` reserves the shared
receipt before fsynced world RGBA/final-mask/manifest publication, then commits
queue+receipt+actual-seed cursor atomically. Exact reload and APP_RESTART recovery
keep independent final alpha and context after terminal queue/input pruning;
USER_CANCELED cannot resurrect a candidate. Shared tombstones hide discarded
sessions across both stores. Normal Results never discovers these candidates,
and the Smart DTO cannot be assigned to the normal Raster DTO.

That checkpoint established a private executable/recoverable path. Public
Generate/Retry/Results, immutable variant acceptance/outdated/orphan handling,
portable provenance and installed GPU/release qualification were subsequent
owners. It introduced no Project/document/`.igs`/history/preset/Compare edits. PP-007/008 public readiness
remains «Пока не обещать»; actual checks and limits belong to the linked research.

## Previous private SQL admission scope

[Private Smart Patch queue admission](../../../engineering/phase-4-smart-patch-queue-admission-research.md)
adds real `illustrious-smart-patch` / `anima-smart-patch` pending rows to the common
SQL queue. One independent queue-owned bundle under
`generation-queued-inputs/smart-patch/<UUID>` serves1..32 concrete items;
caller-owned prepared bundles remain independent. Strict DTO and actual-byte
reload bind Project/document/layer, world/internal geometry, exact manifest and
item index. Resource/prediction/noise policy and current unlocked+visible target
are rechecked before atomic SQL insertion. Exact lost-ack readback confirms the
whole batch; unknown outcomes retain files and fence the Project. Cancel and
restart cancel unfinished jobs without replay; terminal pruning reclaims only
an exact verified bundle after its last SQL reference. Unknown/corrupt/incomplete
bundles are retained. Queue metadata understands both families; normal dispatch,
ordinary Retry and normal input readers refuse these jobs before runtime use.
This is private durable admission, not runnable public generation. No candidate,
receipt, actual-seed cursor, variant, Project/`.igs`/provenance/preset/Compare or
public Smart Patch Generate/acceptance UI is introduced; Retry remains explicitly
disabled. At that admission checkpoint the next owners were dedicated typed
dispatch, worker-confirmed actualSeed, owned inference+CPU cancellation and
durable world candidates, now covered above; immutable acceptance remains next. Public PP-007/008 remain
«Пока не обещать». Verification evidence and limits are in the linked research.

## Previous private durable-input scope

[Durable input preparation](../../../engineering/phase-4-smart-patch-durable-input-research.md)
adds `capture.prepareBatchInput` for1..32 already concrete prompt/seed items. One
owned preparation freezes source RGBA, optional original authored mask, optional
model RGB, latent KEEP and final world GENERATE, plus exact per-item family
inference metadata. The separate input bundle persists fixed relative file roles
and frozen target context without transient execution paths. Fresh reload checks
actual bytes/hash/topology/ICC and their cross-field identities. Exclusive
manifest publication commits the complete bundle; uncertain durability retains
it for reconciliation. Explicit discard is limited to an exact verified owner.

This is private preparation before SQL admission. It creates no pending/running
jobs, candidates/receipts/cursor updates, accepted variants or Project/`.igs`/UI
changes. Dynamic expansion and Random/Reuse resolution remain outside this
already-concrete boundary. Next owners are complete queue/dispatch/staging and
immutable acceptance; public promise status is unchanged.

## Previous private world-output scope

[World output](../../../engineering/phase-4-smart-patch-world-output-research.md)
adds `capture.executeAndCompose` after the existing native execution. The CPU
worker BICUBIC-resizes generated RGB to the frozen bbox dimensions, then attaches
the already computed final world GENERATE alpha unchanged. No repeated fade,
latent-mask reconstruction or source pasteback is applied. Main independently
verifies actual RGBA/ICC/hash/geometry and exact alpha equality before returning
detached `worldContribution`; world placement remains the frozen `context.bbox`.
One drained lease covers preparation, resources, native execution, world output
and final consumption. Callback failure drains admitted work; unconfirmed worker
exit retains all inputs. The CPU derivatives-only worker 0.1.0 requires explicit
`smart-patch-output-composition`; older payloads refuse before dispatch. The
operation stage is `0700`; the owned scratch base may retain `0775`.

The existing `capture.execute` processing RGB contract and inference worker0.14.0
gate are unchanged. Source changes do not upgrade installed runtime. This private
material creates no public Generate, durable queue/batch/candidate/receipt,
accepted variant, document/`.igs`, provenance/preset/Compare or UI behavior.
Evidence and qualification limits belong to the linked research. Durable queue
integration and immutable variant acceptance remain next; public promise statuses
are unchanged.

## Previous private execution scope: Main/worker bridge

[Execution bridge](../../../engineering/phase-4-smart-patch-execution-bridge-research.md)
connects the existing owned capture to native family execution through the actual
private protocol. `capture.execute` takes one concrete prompt pair and uint32
seed. It neither expands dynamic syntax nor selects Random/Reuse or updates the
seed cursor. Main resolves exact family resources, freezes their policy and
rechecks selections; Python independently verifies file identities around native
loading. The private `smart-patch-execution` capability is required on worker0.14.0;
source support does not upgrade an existing installed runtime.

Preparation, resource admission, execution and strict RGB file consumption share
one drained lease. TXT/IMG use ordinary routes; INP/OUT keep their frozen masked
mode, including all255 KEEP. Processing dimensions stay independent of the world
bbox. Main returns detached verified sRGB RGB bytes. Worker process failure/timeout waits
for physical exit before cleanup; unconfirmed exit retains the capture staging,
including when a sibling callback already failed.

This publication is transient private numerical material. It adds no public
Generate, durable batch/queue/candidate/receipt, world compositing, accepted
variant, provenance/preset/Compare, schema or UI behavior. Evidence and exact
qualification limits belong to the linked research. World composition was next
at that checkpoint and is added above; durable queue integration and immutable
variant acceptance remain open; public promise
statuses are unchanged.

## Previous private execution scope: family VAE and denoising

[Denoising research](../../../engineering/phase-4-smart-patch-denoising-research.md)
qualifies private numerical adapters for prepared RGB and independent numeric
latent KEEP images, using caller-owned loaded native models. TXT/IMG retain the
ordinary route; INP/OUT use the existing masked family route. Source alpha is not
reclassified, masks/coherence and LaMa are not rebuilt, and pixels are not pasted
back into the document. Source/mask buffers are detached before native callbacks.

If reduction removes latent edit coverage (KEEP all255), VAE and denoising still
execute as in Invoke with fully protected latents and the same frozen world mode.
There is no refusal, fallback or invented mask coverage. The result is a VAE
reconstruction, not new generated detail for the lost tiny edit.

Focused72 Python PASS:65 real tiny native family cases plus seven actual CPU
protocol preparation-to-adapter cases. The finite matrix covers six solvers per
family and Illustrious EPS/V; actual prepared INP uses world128/internal64/Euler
for both families. These random small CPU-native models do not qualify trained,
installed, GPU or full Invoke pixel parity. No Main transport/public worker
command, queue/publication, world compositing, immutable variants, schema, preset,
Compare or UI behavior is added at that numerical checkpoint. The later bridge
above adds worker/Main transport and resource admission; the later world-output
scope adds private composition. Immutable acceptance remains a subsequent owner.
PP-007/008 public readiness remains unchanged; further checks/mutation evidence
are recorded separately in the linked research note.

## Previous private model-source scope: RGB preparation and LaMa

[Model-source research](../../../engineering/phase-4-smart-patch-model-source-research.md)
qualifies actual Main `prepareModelSource` through source composition,preparation,
six-plane conditioning and private worker RGB publication in one admitted/drained
lease. TXT has null model source;IMG/INP use exact processing RGBA converted to RGB
without resolving/loading LaMa. Only OUT lazily resolves the existing pinned
Main-owned LaMa and uses its full RGB output. Its binary holes are source alpha<255,
independent of authored/coherence masks;world OUT stays OUT when BICUBIC processing
resize yields uniformly0/255 alpha. Existing normal OUT mixed-alpha refusal stays
unchanged. Missing/changed resources and invalid RGB/hash/ICC/path/topology refuse;
there is no download,approximation,source paste-back or mode fallback.

Affected1937 TS/527 Python (focused65/68),two actual Main trained-source cases (OUT plus IMG control)
with unchanged storage/original source,four exact trained wholeRGB matches to
pinned Invoke and three semantic RED/GREEN pairs qualify this boundary. Global
lint/typecheck/build and worker Ruff/basedpyright PASS;execution limits live in
the linked note.
The six conditioning planes remain separate. No `.igs` state/schema,UI,jobs,
diffusion/VAE,candidates,accepted variants,provenance or preset/Compare fields are
added. Prototype source/infill controls and accepted-variant lifecycle are not
qualified by this private operation. At that checkpoint model-source RGB did not
prove Smart Patch diffusion readiness; the later private adapter above now
defines the all255 latent-coverage policy without adding a public execution path.

## Previous qualified owned coherence scope: controls,persistence and capture

[Owned coherence research](../../../engineering/phase-4-smart-patch-coherence-settings-research.md)
qualifies this UI/Main/document slice:affected1927 TS,prototype180,native14
(including Save/reopen/owned SIGKILL→Home Recover),three semantic RED/GREEN pairs
and typecheck/lint/build PASS. Physical exit/restoration/cleanup confirmed. Each
Patch can store optional top-level `coherenceSettings:{mode,edgeSize,minimumDenoise}`.
The exact modes are Gaussian Blur/Box Blur/Staged;edge is integer0..1024 PROCESSING
pixels,minimum denoise finite0..1. Effective defaults are Gaussian Blur/16/0;
legacy absence stays absent on read/open and default no-op,without dirty/history
or altered member hashes. Original mask PNG/revision,blur/padding,bbox/internal
size,draft and neighboring layers remain independent.

Selected-Patch Mask controls show compact Coherence/Edge size/Minimum denoise
rows. Captured whole-profile edits use one normal Undo step,explicit Save and
local recovery;invalid/stale/locked/missing/foreign/Raster owners refuse. Numeric
Enter/blur commits once,Escape/owner/navigation changes cancel raw drafts,and
tooltips distinguish processing edge from world blur and coherence minimum from
Generation denoising strength. These settings remain editable without a worker.

Main capture freezes a detached resolved owned profile before awaits;
`prepareConditioning(worker)` uses that profile despite later edits. Explicit
private overrides remain operation policy and do not change the Project. Future
variants will include these relevant settings in frozen layer/source context for
staleness,but this slice adds no variants/provenance/preset/comparison fields or
public Generate/native ML support.

## Previous qualified private conditioning checkpoint: processing edge and world blur

[Coherence research](../../../engineering/phase-4-smart-patch-coherence-research.md)
qualifies the private Main/CPU slice:1905 affected TS/268 Python PASS,
36 pinned Invoke comparisons and four isolated semantic RED/GREEN pairs.
`prepareConditioning` freezes caller policy before await and runs preparation/
conditioning inside one admitted/drained lease. Its private profile has exactly
Gaussian Blur/Box Blur/Staged,integer processing-pixel edge0..1024/default16 and
minimum denoise0..1/default0. This does not add persisted Patch settings or UI.

WORLD numeric keep is255-authored coverage for INP,and Pillow multiply of that
keep with actual source alpha for OUT;TXT/IMG use0. Combine before BICUBIC
internal resize and BILINEAR latent reduction. Six grouped outputs retain numeric
keep,exact upstream processing-space coherence and binary expanded projection;
the original world edit core is restored before owned WORLD-pixel contribution
fade. Internal8-grid limits apply to this method only;old one-pixel preparation
and portable document limits remain valid.

`latentMaskHasCoverage` reports loss separately without silently changing the
frozen world mode. Preserving world output core does not prove a viable latent
mask or ML admission. This algorithm checkpoint left VAE/infill/denoising,
queue/candidates/variants/provenance,public Generate and coherence controls to
later owners;the owned-settings checkpoint above now qualifies the controls.
The remaining inference/variant owners stay open. Existing normal
OUT conditioning stays unchanged;full scaled Invoke pixel parity is not claimed.

## Previous qualified private contribution checkpoint: full core and external fade

[Contribution research](../../../engineering/phase-4-smart-patch-contribution-fade-research.md)
qualifies the private Main/CPU slice:affected1888 TS/203 Python PASS,including50
fade cases/21 pinned Invoke comparisons,and three semantic RED/single-condition
neighbor GREEN pairs;typecheck/lint/build/global Python checks PASS,physical
exit/temporary-copy cleanup confirmed.
`prepareContribution` chains existing preparation within one admitted/drained
lease and adds world-bbox numeric `contributionMask`,without replacing original
mask/document or enabling public Generate.

The settled output rule differs from conditioning coverage:authored soft alpha
is retained in the world/internal generation inputs,but every nonzero authored
pixel seeds full contribution core. TXT/IMG core fills the whole bbox;INP core
uses clipped authored coverage;OUT core is the union of authored coverage and
source alpha<255. Owned blur adds external distance-transform/cubic fade in
project pixels,padding is excluded,and internal resolution does not set the
fade distance. Clip first:outside original paint cannot leak into bbox from
beyond its edges. Blur0 keeps the exact binary core.

This is pre-coherence geometry,not the final inference/compositing pipeline.
At that contribution checkpoint edge coherence/latent processing were later
owners. The subsequent coherence scope above expands conditioning coverage;
model-source infill is separate and never replaces a mask plane.
Full Invoke scaled-pixel parity,ML execution,queue/candidates/accepted variants
and public promise readiness remain unclaimed.

## Previous qualified private preparation checkpoint: effective mask and internal size

[Preparation research](../../../engineering/phase-4-smart-patch-mask-preparation-research.md)
qualifies the private Main/CPU slice with final focused33 TS/Python24 PASS and
three isolated semantic RED/neighbor GREEN pairs. Global Python Ruff/basedpyright
and affected1871 TS/125 Python pass; required typecheck/lint/build pass, physical
exit and temporary-copy cleanup are confirmed. It derives
an exact integer bbox-local numeric alpha plane from the verified original owned
mask, with zero coverage outside the original bounds. Null/disjoint masks are
valid all-zero outputs; corrupt originals still refuse even when disjoint.
Derived masks may have transparent padding or no coverage without weakening the
portable owned-mask codec's tight/nonempty default.

The original world source alpha and any nonzero world coverage determine the
private mode. Source RGBA and numeric coverage are independently resized with
BICUBIC to the frozen internal size. Loss of tiny coverage during resize is
reported separately and does not silently change the world-derived mode.
Each internal side is capped at2048 and total pixels at4,000,000 for this finite
CPU operation; structurally valid larger document settings remain unchanged and
can refuse preparation. No latent-grid or ML capability is implied.

These are explicit adaptations: ImageGen Studio's opaque source requires all
alpha255, while Invoke considers any all-nonzero source opaque; our numeric soft
mask remains meaningful below Invoke's worker-mask threshold128. This slice
does not claim full mode/pixel parity, apply owned blur, run inference, enable
public Generate or accept variants. Three operation-owned derived outputs and
already-started asynchronous readers remain inside the existing drained capture
lease; original mask/document/history/seed/Save owners are preserved.

## Previous production checkpoint: Transform Mask and Fit

[Transform/Fit implementation](../../../engineering/phase-4-smart-patch-mask-transform-research.md)
adds selected-mask move/scale/rotation through a local Konva preview and explicit
Apply/Enter or Cancel/Escape. Captured document/layer/mask identities and revisions
are retained through the session. Owner/revision, camera, busy or external focus
changes cancel; hidden/locked/empty targets cannot transform. One changed Apply
creates one Undo step. Interactive release snaps anchors and displayed dimensions
to whole project pixels (minimum 1px); the command API retains fractional geometry.
Main reads verified owned pixels and bakes a new tight
world-grid PNG, with no persisted affine metadata. Transform leaves bbox,
internal resolution, layer draft, other layers and Raster pixels unchanged.

Integer unit translations and quarter turns preserve exact alpha. General
transforms use fixed 2×2 inverse bilinear samples with clamped interpolation inside
the source pixel-area rectangle and transparent exterior. Original verified PNG
bytes are reused when output dimensions and alpha remain identical, including
valid imported PNG chunk packaging. An identity/no-op changes no document/history;
all-zero minification refuses instead of clearing a nonempty mask. Scale is
positive and capped at 10000, angle is finite within [-360,360], and actual
geometry/work must satisfy existing mask limits. CPU interpolation does not
promise Invoke pixel parity.

Fit reads the verified mask bounds and changes only this Patch's bbox. At that
checkpoint the fixed policy added **24 project pixels per side** (blur16 + padding8),
equivalent to the current owned defaults, then rounded
left/top down and right/bottom up on grid8 for Illustrious and Anima. There is no
64px world-bbox minimum. Mask identity/revision/bytes, internal resolution and
draft are unchanged; repeated Fit is a no-op. The newer settings checkpoint adds
configurable blur UI; the inference/compositing blur step remains pending.

Qualification: impacted regression1820 PASS before terminal snapping, final
affected59 PASS, built native57 checks and three semantic RED/neighbor GREEN
pairs. Required typecheck/lint/build pass; source/exit proof, attempt chronology
and limits are recorded in the linked checkpoint. At that Transform/Fit checkpoint, Smart Patch
inpaint/generation, accepted variants, staleness, compositing, comparison,
Regional Guidance and Patch preset source/target flows remained pending. Later
finite Smart-target Apply is linked above; public promise statuses are unchanged.

## Reference

Reference: InvokeAI inpaint mask, canvas entity list, bbox controls and compositing settings.

ImageGen Studio adapts these ideas, but does not copy Invoke's standalone inpaint mask layer model.

The selected mask overlay remains a viewer inspection state even when its layer
is hidden or locked; editing is disabled in those states and Pan/overlay toggle
remain available. The selector is labeled `Lasso operation`: Brush always adds,
Eraser subtracts, and Lasso/Polygon use its captured Add/Subtract choice.

## ImageGen Studio Decision

Smart Patch Layer is a self-contained generative entity. The mask, bounding box, internal resolution, generation draft, compositing settings and accepted raster results belong to the layer.

This is intentionally separate from:

- the unbounded Project Canvas and its project-owned primary generation bbox;
- ordinary Raster Layer transform/position.

Hard rule:

```text
Primary Generation BBox
!= Smart Patch Layer Bounding Box
!= Raster Layer Transform
```

## Scope

MVP:

- create Smart Patch Layer;
- edit layer-owned mask;
- edit layer-owned bounding box;
- edit layer-owned internal resolution;
- regenerate layer;
- stage multiple candidates and explicitly add one or more selected candidates as raster sub-layer variants;
- store multiple raster sub-layers as result alternatives;
- keep exactly one active/visible raster sub-layer;
- mark layer `outdated` when editable inputs change after generation;
- compare active-variant provenance with current Canvas state through the shared
  layer context-menu popover;
- duplicate Smart Patch Layer when the user wants an alternate mask/bbox/internal-resolution state.

Post-MVP:

- `Duplicate & Regenerate`;
- richer compare UI for raster sub-layers;
- reusable mask assets;
- more advanced Smart Patch layer types if needed.

Rejected for MVP:

- standalone inpaint mask layers;
- one mask shared by multiple Smart Patch Layers;
- multiple masks inside one Smart Patch Layer;
- multiple visible raster sub-layers inside one Smart Patch Layer;
- full internal revision history for mask/bbox/internal resolution.

## Owned State

Smart Patch Layer owns:

- `maskAssetId`;
- `boundingBox`;
- `internalResolution`;
- layer-owned generation draft;
- compositing settings that affect regeneration;
- `rasterSubLayers`;
- `activeRasterSubLayerId`;
- current status;
- generation provenance for each accepted raster sub-layer.

Suggested shape:

```ts
type SmartPatchLayer = {
  id: string
  type: 'smart-patch'

  name: string
  visible: boolean
  opacity: number
  blendMode?: string

  maskAssetId: string

  boundingBox: {
    x: number
    y: number
    width: number
    height: number
  }

  internalResolution: {
    width: number
    height: number
  }

  generationDraft: PresetPayload

  rasterSubLayers: Array<{
    id: string
    name: string
    rasterAssetId: string
    provenance: GenerationProvenance
    sourceRevisionHash: string
    createdAt: string
  }>

  activeRasterSubLayerId: string | null

  status: 'empty' | 'ready' | 'outdated' | 'generating' | 'failed'

  createdAt: string
  updatedAt: string
}
```

Selecting a Smart Patch Layer binds the left generation editor to `generationDraft`. Editing normal Project generation settings must not make unrelated Smart Patch Layers outdated.

## Creation And Regeneration Flow

The layer exists before the first generation:

```text
Add Smart Patch Layer
→ create empty layer-owned mask, bbox, internal resolution and generation draft
→ edit mask/bbox/settings
→ Generate temporary candidates
→ Add N as Variants
→ accepted anchor candidate becomes active
```

Regeneration freezes a source composite from compositing layers beneath the target Smart Patch Layer inside its bbox. The target layer's current active variant is excluded from its own generation input, preventing cumulative self-regeneration artifacts. Layers above remain visible in final Project preview but are not part of the patch source input.

Automatic mode is derived from actual frozen source alpha and mask coverage
inside that bbox, adapting Invoke's mode table:

| Frozen source     | Effective mask coverage inside bbox | Mode       |
| ----------------- | ----------------------------------- | ---------- |
| Fully transparent | Any, including none                 | `txt2img`  |
| Mixed alpha       | Any, including none                 | `outpaint` |
| Fully opaque      | None                                | `img2img`  |
| Fully opaque      | Nonzero, including soft coverage    | `inpaint`  |

A null mask or a verified mask fully outside the bbox uses the source-only
mode; it is not rejected solely for lacking effective coverage. The original
owned mask is retained unchanged. No workflow selector is added, and rectangle
intersection alone is not evidence of nonzero pixels.

Here fully opaque means every source alpha is255, and mixed means neither all0
nor all255. Invoke's transparency helper instead considers every alpha>0 opaque.
Effective authored coverage means any world alpha>0 without thresholding soft
pixels; Invoke's uploaded worker mask thresholds alpha at128. These boundaries
are deliberate ImageGen Studio adaptations. The private mode is computed before
internal resizing; internal coverage loss is reported for a later inference
decision rather than changing that mode silently.

## Layer-Owned Bounding Box

Smart Patch Layer Bounding Box is not the same thing as the project-owned primary generation bbox or Raster Layer transform. Both bboxes live in the unbounded Project Canvas coordinate space.

It defines the project-space area sent to the worker for this layer's local generation.

Product bbox controls:

- direct canvas handles;
- compact `Bounding Box` button/badge in selected-layer controls;
- popover for exact x/y/width/height;
- internal resolution width/height;
- aspect lock;
- `Fit Patch BBox to Mask`, exposed primarily in the Smart Patch contextual left toolbar;
- fit to the primary generation bbox where useful;
- scale before processing.

Changing layer bbox or internal resolution marks the layer `outdated` if it already has an active raster sub-layer.

The bbox can extend beyond all existing raster content. Smart Patch outpainting and acceptance do not expand Project Canvas, because it has no fixed bounds; they do not transform existing Raster Layer pixels. The previous auto-expand rule is retired.

## Mask

The mask belongs to the Smart Patch Layer.

Rules:

- mask is not a top-level layer;
- mask is not shared by other Smart Patch Layers;
- mask visibility/overlay can be changed without changing generated raster pixels;
- editing mask marks existing generated result `outdated`;
- owned blur affects future edge processing and staleness, without modifying painted PNG;
- owned bbox padding affects explicit Fit and does not automatically move bbox.

Canvas tools for the selected Smart Patch Layer:

- `Transform Mask` moves/scales/rotates the layer-owned mask only;
- `Transform Mask` does not move active raster sub-layer pixels;
- `Transform Mask` does not move or resize the layer-owned Bounding Box;
- Lasso, Polygon Lasso, Brush and Eraser edit the layer-owned mask;
- Bounding Box tool edits the layer-owned Bounding Box.

## Raster Sub-Layers

Smart Patch Layer can store multiple raster sub-layers as generated result alternatives.

Rules:

- only one raster sub-layer can be active/visible at a time;
- switching active raster sub-layer changes the visible result;
- each accepted raster sub-layer stores its own immutable generation provenance;
- mask/bbox/internal resolution are current layer-owned state, not separate per-sub-layer editable revisions.

If the user needs to preserve an alternate mask/bbox/internal-resolution state, they duplicate the whole Smart Patch Layer.

`Duplicate Layer` is also the canonical reuse action for Smart Patch geometry and
layer-owned processing state. A preset created from an accepted variant copies
only reusable generation configuration; it does not copy the mask, bbox,
internal resolution, compositing state or source identities. Smart Patch
`internalResolution` must not become generic preset `Size` implicitly.

Variant provenance still records identities/hashes for this layer/source context
so the app can explain the run and derive `outdated`. Those fields are excluded
from the read-only `Compare generation settings` diff: that popover compares how
the image was generated, not whether two Smart Patch Layers have the same shape
or mask.

## Layer Row Display

Smart Patch Layer should be visually distinct from a normal Raster Layer.

Layer stack row:

```text
visibility | mask thumbnail | active raster thumbnail | name + status | switch variants | lock | delete
```

Rules:

- mask thumbnail shows the layer-owned mask;
- active raster thumbnail shows the currently visible generated result;
- mask thumbnail comes before active raster thumbnail to match the Photoshop-like mental model where the mask is visually tied to the layer's visible pixels;
- `status` shows whether the active raster result matches current mask/bbox/internal resolution/settings;
- `switch variants` opens a compact persistent variants browser for this Smart Patch Layer;
- saved variants are not expanded into a vertical thumbnail list under the layer row by default.

## GenerationResults

Smart Patch regeneration can produce several results in one action.

Rules:

- every completed result first remains a temporary staging candidate;
- focus controls canvas preview while checkbox selection controls which candidates will be kept;
- `Add N as Variants` commits only selected candidates into `.igs`;
- the accepted anchor candidate becomes the active visible variant;
- other accepted candidates become inactive variants;
- the previous active variant remains stored but becomes inactive;
- only one permanent raster sub-layer can be active/visible at a time;
- unselected candidates are discarded when staging closes;
- accepted variants can be managed later through Smart Patch variant controls;
- each accepted raster sub-layer stores immutable generation provenance.

If the target still exists but its editable inputs changed while the job ran,
explicit Add keeps the candidate's frozen result and provenance. The accepted
active variant is `outdated` when that frozen baseline differs from current
inputs; acceptance does not rewrite the candidate to the latest mask/bbox/draft.
A missing target remains the separate orphaned-candidate recovery flow.

See [GenerationResults](./generation-results.md).

## Status Model

States:

- `empty` — mask/bbox exist, but no raster result exists yet;
- `ready` — active raster sub-layer matches current editable inputs;
- `outdated` — editable inputs changed after the active raster sub-layer was generated;
- `generating` — generation is in progress;
- `failed` — last generation failed.

Inputs that mark a layer `outdated`:

- mask;
- bounding box;
- internal resolution;
- compositing settings that affect regeneration;
- layer-owned prompt/settings/model resources used by regeneration;
- source composite revision/hash beneath the Smart Patch Layer.

Owned blur is included when it affects generation/compositing. BBox padding is
Fit-only: changing padding alone does not stale a variant, but subsequently
fitting to a changed bbox does. Derived staleness must compare the frozen inputs,
not any unrelated Project document revision.

## Vue Prototype Coverage

The `smart-patch` scenario contains a self-contained Smart Patch with owned bbox, internal size, generation draft, mask revision, three accepted variants and one active variant. The mixed compositing stack displays mask before active raster, exposes variant switching and keeps only the active variant in the visual composite.

The prototype supports adding an empty Smart Patch, selecting its layer-owned generation draft, deterministic mask revision/outdated transitions, deterministic fit-to-mask, generating temporary candidates, multi-accepting them as variants and switching the active accepted variant. These persistent actions participate in Project undo/redo.

The current details card only reads mask revision, bbox size, internal size and active variant. The selected Patch's Mask section now renders the shared Coherence, Edge size and Minimum denoise controls with mock owned-profile edits and history. General bbox dragging, numeric precision editing, internal-size editing, mask painting, the remaining compositing controls and source-composite hashing are not implemented. The finite Project Canvas frame in the prototype remains a gap against the unbounded-canvas contract. `generating`/`failed` are represented in mock state and staging, not driven by a production worker.

The prototype exposes `Compare generation settings` and result-to-preset from
the active accepted variant's layer menu. Its read-only popover compares
`Generated with` against `Current Canvas` and omits the entire Size section for
Smart provenance, including converted Rasters; ordinary Raster Size remains. Its
simplified `outdated` flag remains
a separate mock. Smart result presets use the `Smart Patch` workflow for every
recorded mode and exclude geometry and Seed by default. These in-memory paths
do not qualify production comparison or native preset storage. The direct
inactive-variant action is preset creation only; inactive direct Compare is
outside this slice. Native comparison focus restoration remains under the
in-progress qualification above; preset-source focus evidence belongs to its
separate checkpoint.
Its frozen provenance and staleness comparison do not yet consume
`coherenceSettings`: editing that profile changes prototype document/history
without making existing variants outdated. These mocks do not qualify production
acceptance or freshness. The separately implemented Main-owned stored variants,
lifecycle controls and current-state checks are described above.

## Acceptance Criteria

- Smart Patch Layer is documented as its own Generate feature.
- Unbounded Project Canvas, primary generation bbox, Raster Layer transform and Smart Patch Layer bbox are explicitly separate.
- Smart Patch Layer owns its mask, bbox, internal resolution, compositing settings and raster sub-layers.
- Smart Patch Layer owns the generation draft used by its regeneration workflow.
- Standalone inpaint mask layers are not part of MVP.
- Only one raster sub-layer inside one Smart Patch Layer can be active/visible at a time.
- Smart Patch regeneration can generate several temporary candidates and explicitly persist one or more selected candidates as variants.
- Changing layer-owned editable inputs marks existing generated output `outdated`.
- Null/disjoint masks use the actual frozen source-only mode without changing the owned mask.
- Explicit acceptance into a still-existing changed target retains frozen context and derives `outdated`; it never retargets a missing target.
- Smart Patch comparison uses active-variant provenance against the current Project Canvas draft, including while a Patch is selected, and never compares two variant provenance records.
- Converted Smart Rasters use the same Smart settings comparison rules; Size, geometry and layer/source/execution context are absent.
- Inactive direct Compare is outside this slice; existing inactive preset actions remain separate.

## Regional negative inheritance and private Anima INP

For Smart generation, Regional Guidance's `Use global negative prompt` inherits
from the **selected Smart Patch's generation settings**, frozen for that job.
Current Canvas remains the regional editor's authoring display/context; it does
not replace the executing Smart negative, model, prompts, seed or sampling.

The [private Anima Smart INP owner](../../../engineering/phase-4-anima-smart-regional-research.md)
joins coherent historical Smart/regional captures to the existing source/KEEP,
Euler/Heun, native decode, processing RGB and world-contribution owners. Regional
alpha is projected independently to Anima's processing token grid; it does not
reuse Smart blur/fade/coherence/KEEP as attention permissions. This checkpoint
adds no public Smart+regional admission, frozen queue/Retry, Add-as-Variant,
provenance or quality claim. PP-001/005/007/008 remain **«Пока не обещать»**.
