# Regional Guidance durable reference-image authoring

## Boundary and status

This finite owner follows the completed [owned-mask checkpoint](./phase-4-regional-guidance-masks-research.md)
on dirty `master@10115df581d9e07049478dee3866a280886794fd`. The preserved baseline
has 1,331 source members. Earlier results do not qualify the new reference owner.
Source is implemented. Root completed the bounded CPU/native authoring qualification:
`native-r10` passed 12/12. Final retention/release and documentation review are
complete; this does not promote the overall Regional Guidance promise.

The user can attach an authorized PNG/JPEG/WebP to a region, see a bounded
full-frame thumbnail and source metadata, reorder/remove attachments, duplicate
the region independently, Undo/Redo, Save/reopen and recover unsaved images.
One file per Add is sufficient; repeated Add supports multiple references.
Cancel allocates no document record or history entry. Existing inline prompt
mounting, selection and approved layer-row composition are preserved.

Risk is **high**: authorized filesystem input, owned assets, strict IPC, staged
publication, `.igs` persistence, recovery and signed resources change. The
[regional contract](../features/project/generate-mode/regional-guidance.md)
and PP-001/007/008 remain the product basis; their public status remains
**Пока не обещать**.

## Choice of next owner

Main research recommends ordinary TXT positive conditioning first. Worker
research recommends a frozen-recipe/CPU mask-preparation foundation, retaining
Generate refusal. Both are possible later owners. They require different
decisions from authoring: spatial attention, token-padding composition, global
prompt policy, dynamic expansion, durable queue inputs and replay, actual model
qualification, plus unresolved Smart inherited-negative ownership and the Anima
regional-negative gate. A private preparation owner would be infrastructure.

Root selects durable reference authoring now: it completes another useful
document/UI boundary using the existing CPU image pipeline. It does not open
model conditioning or claim spatial generation. Adapter resource selection,
weights/scheduling, generic IP Adapter/ControlNet, image editing, masks shared
between owners, regional presets and provenance expansion remain excluded.
The existing NEW-generation regional refusal and frozen Retry behavior remain.

## Pre-implementation source-backed path and gaps

Production Raster import already authorizes one source in Main, freezes it
with canonical-path/no-follow/source-change checks, normalizes through
`ProjectWorkerClient.normalizeImport`, verifies bytes/hash/dimensions and pinned
sRGB ICC, then transfers sources through the autosave coordinator. It creates
a compositing Raster and cannot be called as the regional reference action.
Extract/reuse its source-freezing boundary without changing ordinary behavior.

The prototype's inline data URLs, SVG import, mock IDs and duplication are
visual/interaction references only. They do not provide durable ownership,
family gating, thumbnail validation or package evidence.

`createResourcePreview` has a 1,000,000-byte input ceiling. Existing
`deriveImage` rejects ICC, including canonical imports' pinned profile.
`composePreview` crops visible alpha and omits all-transparent output. None is
a direct full-frame imported-image thumbnail primitive. Preserve those APIs.
Add a narrow CPU thumbnail operation over exact canonical PNG input; reuse
existing image/profile/file validation and WebP output verification, with no
new canonicalizer or inference dependency. Transparent and mixed-alpha images
retain full-frame aspect/alpha; no upscale and no crop.

## Settled contract

Persist optional, nonempty `region.referenceImages`. Removing the last item
omits the property; legacy absence remains absent. Each attachment contains:

```ts
{
  id: string
  name: string
  sourceFormat: 'PNG' | 'JPEG' | 'WEBP'
  asset: { path: string; sha256: string; bytes: number; width: number; height: number }
  thumbnail: { path: string; sha256: string; bytes: number; width: number; height: number }
  sourceIccProfile?: { path: string; sha256: string; bytes: number }
}
```

Attachment UUIDs join the existing current-owned-ID collision domain. Images
and thumbnails have immutable hash-named members under
`assets/regional-references/<referenceId>/`; paths must match their exact owner
and role. Original ICC uses the existing hash-addressed profile namespace.
Duplicate allocates fresh reference IDs and member paths, copying verified
source/thumbnail bytes; ICC can retain existing immutable sharing semantics.
Keep all-asset/profile collectors complete and composition/Raster collectors
unchanged. Package, shadow and source adoption verify actual content and exact
dimensions, not only metadata. No eager deletion is introduced.

Add is eligible only when Current Canvas checkpoint metadata identifies
Illustrious, independently of selected Smart settings or installed resources.
Anima/unknown family gets an explanation; existing references remain visible,
reorderable and removable for repair. Disabled regions remain editable; locks
refuse every attachment mutation. Family is rechecked authoritatively in Main.
Future generation validates the actual job family separately. All enabled
regions continue refusing NEW ordinary/Smart Generate in this owner.

Public APIs are dedicated:

```ts
importRegionalGuidanceReferenceImage(tabId, owner): Promise<ApiResult<ProjectTab | null>>
updateRegionalGuidanceReferenceImage(tabId, owner, change): Promise<ApiResult<ProjectTab>>
// owner: existing exact { documentId, documentRevision, regionId }
// change: { kind: 'remove', referenceId } |
//         { kind: 'move', referenceId, targetIndex }
```

Renderer supplies no paths, bytes, asset metadata or epochs. Capture coordinator,
revision/epoch and owner before dialog/worker awaits; revalidate after awaits
and synchronously at staged publication. Main owns the dialog callback. Cancel
returns null without publishing. A changed/closed/replaced owner never retargets.
One changed import/remove/reorder owns one Undo entry; equal-order moves own none.
Keep staging until adoption completes, and do not misreport a committed edit
as failed merely because temporary cleanup fails.

Display uses a separate signed regional-reference namespace within `igs-layer`,
bound to tab/revision/region/reference/thumbnail hash. Existing Raster/mask
resolvers remain separate. Runtime `thumbnailUrl` is never stored. UI uses the
bounded thumbnail, keeps controls inside `data-entity-control`, and returns
focus only to a surviving originating control without stealing later focus.

The CPU protocol adds `create-import-thumbnail` / `import-thumbnail-done`,
optional capability `import-thumbnail`, and
`ProjectWorkerClient.createImportThumbnail({ inputPath, inputSha256,
stagingRoot, thumbnailWebpPath })`. Return the existing verified image descriptor.
Require exact canonical PNG/profile input; fixed maximum side 128 and bounded
WebP output reuse existing thumbnail limits. Keep legacy derivative requests,
required base capabilities, protocol version and inference qualification intact.

## Parameters and refusal

Existing normalization ceilings: 256 MiB source bytes, 16,384 per side,
64,000,000 pixels, 4 MiB ICC and 512 MiB verified normalized output. Thumbnail
max side 128 and max 128,000 bytes reuse existing resource-thumbnail ceilings.
These are defensive engineering limits, not measured regional capacity.
Reuse the 16 MiB document, 4 MiB manifest, 10,000 ZIP-entry and 32 GiB aggregate
package ceilings. Check the candidate before publication, including Duplicate:
deduplicate asset/profile paths and account for the five non-asset ZIP members.
Do not invent a separate arbitrary attachment count or buffer all originals at
once during duplication. Exact byte/content validation still applies on adoption.

Refuse malformed IPC, forged roles/paths, unsupported family/format/profile,
missing/changed source, thumbnail failure, stale owner/epoch and oversize
candidate without document/history/shadow/package or neighbor mutation.
Preserve Project/Smart drafts, geometry, masks, accepted assets/provenance,
presets/Compare, seed cursor, queue and model policy. Input decoding/thumbnail
failure must leave source bytes untouched and dispose only owned staging.

## Validation and lifecycle

Use strict schema/preload matrices, actual service/coordinator/package/shadow
tests, controlled resolver/publication races and real CPU worker JSONL tests.
Cover absent versus nonempty, order/no-op/remove-last, duplicate ownership,
stale/lock/family refusal, dialog/worker delays including edit/Undo ABA and
close/reopen, corrupt source/thumbnail/ICC, full-frame transparent thumbnails,
and candidate size limits. Include an isolated semantic ownership/retention
mutation with RED, neighbor GREEN and exact restored GREEN.

Native qualification enters the real Add action and original Main handler,
uses declared dialog selections plus the real CPU normalizer/thumbnail worker,
and proves source-independent Save/reopen and dirty image crash recovery.
Inspect actual 1440×900 and 900×620 interactions/screenshots, selection stability,
keyboard remove/reorder, cancellation/error/focus and prepared Anima/unknown-family
repair controls. Installed-family transitions remain outside this qualification. Offline
authoring evidence does not qualify conditioning or packaged worker availability.

Evidence root is
`~/.codex/artifacts/imagegen-studio/runs/regional-guidance-references/20261024-authoring`.
Initial artifact allocation: 5,494,751,232 bytes; free: 86,697,996,288 bytes.
Aim for compact evidence below 300 MiB; protected historical proof already
exceeds the 1 GiB soft budget and is not swept. No ML provisioning is planned.
At preparation, root confirmed checkout Python 3.12.13, Pillow 12.2.0 and editable
worker 0.1.0 source resolution as metadata only. Later actual ready/operation
responses are recorded in the executed native checkpoint below.
Reuse the existing derivatives-only development adapter when actually verified;
preserve external `.venv` and `node_modules` and record dependencies. Runs and
heavy tests are serial/bounded. Retain source/build/fixture/SQL/journal/PNG bytes
before disposing only owned idle candidates after restoration, physical exit,
dependency and all-reader checks. Root owns execution and cleanup.

## Historical execution checkpoints before native-r1

The pending statuses in this section describe those earlier checkpoints; current
results follow below.

Root executed the following against the dirty source; these are execution results,
not independently rerun results from a source reviewer. `python-thumb-r1` passed
118 CPU checks with no failures or skips. `typecheck-r2` passed both projects.
`neighbors-r1` passed 950 tests in 57 files before the later Save guard correction.
Initial failures were fixture/type declarations: missing App `nextTick` import,
stored-versus-view fixture types, an Undo comparison against an unsaved revision,
and an aggregate-limit setup which invalidated the saved package itself. The
corrected budget control first validates that package, then refuses only the
oversized candidate while preserving the complete document.

The isolated duplicate mutation retained the exact ordinary neighbor and produced
2 GREEN → 1 semantic RED / 1 control GREEN → 2 restored GREEN. All 1,343 isolated
source files were restored; shared source was never mutated. Retention R1 for
that checkout and the completed Python payload is CLEAN / READFINISHED, with
physical-exit and release gates still root-owned.

Source review R1 found a Save rebase race: reopened references had no retained
pending sources, and adoption rejected unrelated edit B after Save A committed
but before its base-document rebase. `save-rebase-red-r2` reproduced the exact
`SAVED_PROJECT_CHANGED` failure while the external-replacement control passed.
The correction accepts only full equality with `baseDocument` or the authorized
`saveTarget`, matching the existing shadow write guard. `save-rebase-green-r2`
passes both cases, including actual shadow recovery and Save/reopen. An earlier
GREEN attempt reached recovery and exposed a test oracle expecting the old
revision; recovery deliberately assigns a fresh one. The final test requires that
new revision plus complete unchanged content, then exact Save/reopen equality.
The causal edit and external-refusal assertions were preserved.

Full lint initially reported 196 autofixable ordering/braces errors in 16 changed
files. Those files were fixed in a bounded scoped run; complete post-fix lint,
typecheck, affected replay, independent R2 source review, fresh build and native
qualification remain pending at this checkpoint. The new twelve-check native
harness is authored and under independent source review, not executed. Neither
source review nor authored checks establish native behavior or appearance.

At the next root checkpoint, `lint-r2` passed all four configured scopes;
`typecheck-r3` passed after lint and the Save correction; `neighbors-r2` passed
952 tests in the same 57 files with no failures/skips, including both new Save
regressions. `build-r1` produced a fresh 33-file desktop build. Independent R2
source review is CLEAN, including full-document Save-target validation, the
external-replacement control, fixture corrections and the 16-file lint delta.
These results qualify those lower-level paths, not native UI or inference.

Native source R1 found one false-failure oracle: the observed configured Python
spawn path was compared to its resolved interpreter path. Symlinked venvs are
supported, so the harness must separately require the exact configured launch
argument and the independently captured resolved interpreter identity. Its
correction and source R2 review remain pending here; no native attempt has run.
The documented `ui-audit` Electron workflow will inspect the actual production
screenshots after interaction; the prototype/browser preview cannot replace
Main/CPU/storage evidence for this owner.

Root's first native attempt (`native-r1`, script `ce060543…`, qualified source
r1/build r1) completed legacy check 01, then failed after 7.402 seconds **before
first Add**. `settleCpu` demanded code 0 from existing fixture/target-inspection
workers, whereas `ProjectWorkerClient.closeOne` deliberately requests SIGTERM.
This is a harness oracle failure, not a product RED. The same assertion made
the restoration wrapper report a failure; its `finally` still recorded exact
spawn restoration and all known CPU closures. Original Main handlers and dialog
were restored with in-flight count 0. All 12 recorded PID/start identities were
freshly checked absent by root. Raw failure/history remain unchanged.

Retention R2 for that attempt is CLEAN / READFINISHED for its two payloads:
1,218 snapshot hashes, 1,047 source mappings, 33 build mappings and three complete
SQLite checkpoints verify. The final WAL reconstruction matches all 62 schema
objects and 20 tables. One transient target-composition PNG (1,576 bytes,
`0a8299ca…`) has metadata only; production removed it before capture and it is
absent from both candidates. Persistent packages, previews, actual inputs and
ICC bytes survive. This owner claims no target-input replay or inference.
Worker-close observation/oracle correction and its native replay remain pending.

The completed mutation/Python payloads were released after fresh verification of
all 1,343 isolated source files, stopped units/empty retained groups, no process
references and the completed audit. Candidate allocation was 35,954,688 bytes;
the measured artifact-root allocation reduction was 35,950,592 bytes after
retaining release proof. External `node_modules`, `.venv` and interpreter targets
were not followed or removed. Native-r1 payloads remain pinned pending release.

## Executed bounded checkpoint: native-r10

Root executed the final exact script `1f5ac7ceb099c01730da500fd28de81f384e4fac95ccd2a350458342f5ef90d0`
on dirty `master@10115df`, with qualified source-r2 (1,343 members) plus its exact
script overlay and the fresh qualified build-r1 (33 members). **12/12 PASS** in
191.188 seconds. Production R2 source review and the final R11 harness delta
review are CLEAN, source-only; they did not independently execute these checks.

| Check | Actual entry/result                                                                                                                                                                       |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01    | Legacy absent references: clean UI Save, production loader and reopen retain absence and all neighbors.                                                                                   |
| 02    | UI Add through real Main/CPU preserves full mixed RGBA, canonical ICC/hash, full-frame thumbnail and one Undo/Redo.                                                                       |
| 03    | Repeated Add retains a canonical original larger than the old 1 MB preview limit and exact original ICC.                                                                                  |
| 04    | Disabled, unselected B imports while Anima Smart stays selected; Current Canvas Illustrious context, fully transparent padding and all neighbors stay exact.                              |
| 05    | Keyboard order/remove, disabled boundaries, equal-index no-op, Undo/Redo and last-remove omission.                                                                                        |
| 06    | Duplicate creates fresh region/reference/mask IDs and paths; exact bytes/prompts/ICC sharing survive independent edit, Delete and Undo.                                                   |
| 07    | Cancel, real invalid/unsupported CPU failures, exact visible error/focus, no data effects and valid JPEG/WebP retry with cleared feedback.                                                |
| 08    | Malformed preload calls reach Main zero times; valid refused owners reach original Main once. Anima repair/unknown explanation and enabled-new-generation/offline-disabled controls pass. |
| 09    | Actual thumbnail decode and original Main protocol fetch prove current/stale/tampered/cross-owner/cross-namespace isolation, with valid Raster control.                                   |
| 10    | Actual 1440×900 and 900×620 scrolling, keyboard, tooltips, glyphs, thumbnails and footer remain reachable; prompt mounts/Smart selection persist.                                         |
| 11    | Actual Save/loader/reopen, unsaved PNG/thumb/new-ICC shadow bytes, physical crash, Home Recover, hidden original inputs and portable Save/reopen.                                         |
| 12    | Healthy final Main code 0, physical exits, exact observer/method restoration, independent post-exit full SQL/files/source/build and complete journals.                                    |

The final report records 882 original Main calls and 149 actual CPU children,
with two native lifetimes: intentional dirty SIGKILL then healthy code 0.
Worker disposition is independently correlated with original kill/write calls,
frozen source/build call sites, exact wire requests/replies and physical PID/start
exit. Normal `closeOne` SIGTERM is not misreported as an arbitrary crash. All
original Main/dialog/spawn/worker methods and descriptors are restored; in-flight
and page-error counts are zero. The final standalone DB and twelve checkpoint
files cover all 62 schema objects and 20 tables, including `sqlite_sequence`.
Launcher peak was 1,687,220,224 bytes, zero swap; each actual group is bounded at
2 GiB, aggregate at 4 GiB, with one 300-second deadline across both lifetimes.
Final attempt compact evidence is 121,691,728 bytes. No ML runtime was provisioned.

Root used `ui-audit` and actually opened all ten final screenshots: cards,
keyboard-focus/hover tooltips and overview at both sizes, plus the recovered
image. No material new-reference layout defect was identified. Long filenames
wrap at minimum size; transparent previews remain meaningful through metadata;
actions and Add stay reachable through independent scrolling. Tooltip overlap
while focused/hovered is intentional portal behavior. This is a bounded root
self-review, not blind independent appearance or complete WCAG certification.

## Preserved native failures and oracle corrections

| Attempt    | Outcome and correction boundary                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| native-r1  | Failed after 01 before first Add: code-zero expectation rejected normal CPU SIGTERM. Restoration wrapper also reported the same oracle failure despite `finally` restoring originals. |
| native-r2  | Failed after 01–06: a read-only Smart variants target CPU child was counted as cancelled-import work. R4 identifies exact import ownership and separately validates background reads. |
| native-r3  | Failed after 01–03: obsolete variants read legitimately returned exact EDIT_CONFLICT. R5 also requires its actual successful same-owner current-revision replacement.                 |
| native-r4  | Failed after 01–06: NAlert title is a div, not a heading. R6 checks the visible alert/title/returned error text.                                                                      |
| native-r5  | Failed after 01–06: intentional error-banner resize recentred the Canvas.                                                                                                             |
| native-r6  | Failed after 01–06: manual Zoom alone still permits resize-centre preservation; source R7 correctly reported this P2.                                                                 |
| native-r7  | Failed after 01–06: the declared JPEG fixture accidentally duplicated Chromium's embedded ICC; the unchanged worker correctly refused it.                                             |
| native-r8  | Failed after 01–07: two family-control returns reused a SQLite checkpoint name; the exclusive-write guard refused overwrite.                                                          |
| native-r9  | Failed after 01–09: actual NTooltip was visible but has no tooltip role. R11 keeps exact text/count/visibility/layout/hide checks through its actual portal class.                    |
| native-r10 | Passed all twelve with no assertion or preservation requirement bypass.                                                                                                               |

The viewport oracle now measures notice/host/stage geometry and permits only the
exact delta/2 resize translation, unchanged scale and unchanged world centre;
all document/history/SQL/file/selection fields remain exact. Successful retries
must remove old error feedback (source R8's remaining P2 was closed by R9).
JPEG preparation replaces only encoder-owned ICC APP2 headers with one pinned
profile, retaining original/stripped bytes. Production's duplicate-ICC rejection
remains strict. Family labels preserve no-overwrite backup guards. Historical
reports are never rewritten as PASS.

## Qualification limits and finalization

The picker result is a declared controlled source-selection/cancel input;
actual UI, original Main and real development CPU processing remain in the path.
This does not certify native picker internals, packaged-worker availability,
installed-model family transitions, inference/conditioning, successful admission,
active frozen-work preservation or every desktop compositor. The X11 smoke
profile is recorded; real rAF/frame deadlines were retained. Main ABA/failure
atomicity, size ceilings and frozen Retry have their separate lower-level tests.

Every durable reference PNG/WebP/ICC, source input, package and recovery dependency
must survive outside disposable payloads. Some transient target/Smart-preparation
outputs have metadata only and are absent from the candidates as well; they back
no durable queue/receipt/acceptance row. No exact raw target-input replay is
claimed. Synthetic historical provenance-mask lineage is fixture metadata.

Retention R1–R7 are CLEAN for candidate-only retention and READFINISHED;
contract R1 is CLEAN, source/document-only. Root rehashed 15,659 unique retained
snapshot files, current production/test and 33 build members, rechecked every
recorded PID/start identity and actual groups, exact original-method restoration,
process references, incoming links and all-reader/dependency gates. Only then did
root dispose all 20 native payload paths (plus the 2 previously released unit
paths). Native allocation removed: 180,486,144 bytes; measured root reduction:
180,469,760 bytes. Combined measured reduction: **216,420,352 bytes**, with all
22 exact candidate paths absent. Compact proof, original reports, causal tests,
archives, bytes/journals/SQL/screenshots and external dependencies are protected.
Native-r1's historical wrapper failure/false lifecycle flag stays unchanged;
its exact-restoration-in-finally and physical-exit proof are separate records.

The final current source archive/version map includes all 1,343 source members;
qualified build-r1 retains its exact 33 members. Qualified source-r1/r2 and every
attempt's exact script overlays remain separately mapped. No commit, publication,
packaged-worker or public-promise promotion is claimed. The local 300 MiB aggregate
aim required a documented exception to retain distinct diagnosed oracle REDs and
their source/input/SQL/journal proof; every native attempt's own compact evidence
stayed below 300 MiB. Root-wide protected historical evidence is not swept.
PP-001/007/008 remain **Пока не обещать**.
