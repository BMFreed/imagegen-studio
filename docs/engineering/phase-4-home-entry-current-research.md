# Home Create and Import current-tab presentation

Base `625eeec93bc4c321e03bd39a0cc4265d9501d8a2`, clean master at entry.
Medium UI-navigation slice adjacent to unchanged Create/Import/recovery owners.
PP-001 composition and PP-007/008 explicit decisions remain bounded; public
statuses stay **«Пока не обещать»**. Main, preload, shared API, packages, catalog,
queue and worker behavior are unchanged. No new non-UI application mechanism or
fresh Invoke review is claimed. Prior storage research is not a fresh source check.

## Reconciled next consumer

The preceding Home browser opening slice is complete. Production Create and both
Import success branches still use generic `focusTab`, leaving Home and appending
the new tab. The approved prototype `HomePrototype.vue` Create/external Import
handlers emit `target: 'current'`; prototype App `openHomeProject` replaces Home
after success. Supporting contracts: Home New Project/Import/opening behavior and
navigation's unique-tab invariant. No New-tab selector or modifier for Create or
Import is specified or introduced.

Finite remaining groups after this consumer: richer Home metadata/session
continuity; remaining Model Manager contexts and hard local-resource removal;
composited exports; runtime Install/Repair, packaged install/upgrade/rollback and
manual updates; compatibility/recovery/release and actual visual MVP acceptance.
Existing Trash, workspace management, location/Move/Rename, saved preview, browse,
grid/panels and public regional consumers are completed checkpoints, not new TODOs.
Temporary dirty/cross-filesystem/resource guards need contract reconciliation,
not automatic conversion into mandatory new features.

## Sources and data path

UI source: approved HomePrototype `createProject`/`openExternal`, prototype App
`openHomeProject`; production App `beginNewProject`/`createProject`, `selectImport`,
`finishImport`, `cancelImport`, recovery, `focusHomeOpenedTab` and their HomeView
callers. Main `index.ts` Create/selectImport/finishImport/resolveRecovery callers
and existing ProjectService import/session/shadow owners supply the actual result.
Their domain behavior is read for boundary mapping and fixtures, not changed.

Home New → existing modal/input validation → unchanged real Create → tab →
existing Home presentation. Home Import → existing OS picker → Main known/opened
or transfer result → unchanged destination/Move/Copy → opened/recovery → existing
Home presentation. Recovery resolves the exact returned Project ID and explicit
Recover/Discard. No placeholder Project ID is invented before Main returns.

`HomePresentationIntent` contains epoch/target; browser `HomeOpenIntent` additionally
contains its already-known Project ID. Create captures Current at dialog entry;
Import captures it before the picker and retains it with the transfer dialog.
Submit captures a local intent before async work or modal leave clears UI state.
Recovery binds that intent to the actual result Project ID. New Cancel and Import
Cancel/terminal leave clear their own intent. Generic Queue/History positional
boolean and non-Home presentation stay unchanged.

Only a newly presented tab closes Home and moves to index0. Already-open Import
focuses its unique existing tab without moving it or closing Home. The shared
placement helper now enforces this for its callers. Invalidated epoch retains an
actually opened Main-owned tab without focus or Home removal; this changes no
Main cancellation, Import ticket consumption, transfer or recovery decision.
Late transfer/recovery-required dialogs retain their prior scheduling; suppressing
them or automatically canceling a ticket is outside this tab-presentation change.
The default Modal/OS picker can block navigation behind it; source fencing is not
relabeled as reachable user-interaction proof for blocked modal controls.

## Preserved boundaries and verification plan

Workspace defaults/availability, detached New Project preset initialization,
one-use importId and confirmed Move/Copy are the existing owners. No implicit
Save, rename, rollback or recovery discard accompanies presentation. Picker or
destination Cancel and real errors keep Home. Refresh advisory errors do not
turn a successful Main result into failed opening. Existing Current/New browser
gestures retain their existing target and unique-tab behavior.

Focused native qualification uses actual built renderer/preload/Main/SQLite and
real packages/shadows, not Project API reply mocks. Controlled OS picker callbacks
must restore exact identity. Original packages and pre-decision shadow inputs are
backed up while physically closed. A controlled future destination shadow may
exercise finishImport → recovery through its real canonical owner; it is a
prepared fixture, not crash recovery qualification. Recover issues its existing
fresh revision; explicit dirty Close uses Discard Changes before normal shutdown.

Planned cases: UI Create/Cancel; managed closed Import; already-open dirty Import;
managed recovery Cancel/Recover/Discard; picker Cancel/malformed file; external
destination Cancel/Copy/Move and transfer recovery. Source/bytes/identity controls,
normal physical closure and screenshot review are distinct evidence. No replay
of the prior19 gesture checks, original destructive lifecycle matrix, prototype
suite, Python/inference/ML/visual-generation or release acceptance is claimed.
Meaningful unchanged navigation controls, typecheck, lint and app build accompany
the new native consumers. Medium UI-only scope requires no domain mutation.

## Artifacts

Fresh RUN `runs/home-entry-current/20261112`, temp `t-hec-1112`, under the artifact
root. Initial inventory: root29GiB/shared17GiB/runs12GiB, disk63GiB free,
GPU1398MiB used/14621MiB free. No GPU work, ML copy, SHARED dependency or foreign
process changes. Checks serial4GiB/600s/zero-swap; native launcher2GiB plus own
app2GiB, controller600s/lifetime480s. These are test envelopes, not product capacity.

Retain compact source/bundle/payload manifests, archives, reports, screenshots,
diagnostics and independent audit before exact idle payload cleanup after all
readers, callback restoration and physical PID/start/cgroup exit. Historical
raw profiles from prior runs were removed; they are never resumed. Final lifecycle
and delivery proof must bind the frozen staged tree to the pushed commit.

## Executed results

ROOT `native-r1`: **12 PASS**, two normal physically closed app lifetimes,
four screenshots at1440×900/900×620, zero page errors or Vue warnings. Actual
Create Cancel is read-only; Create commits selected-workspace default bbox
0,0,1024,1024 and replaces Home before the existing Anchor. Managed closed Import
does the same without a destination dialog. Picker Cancel and a genuinely invalid
package preserve Home, existing rows and files. Recovery Cancel preserves original
inputs; Recover restores full dirty content with its owner-issued fresh revision,
and Discard opens saved clean x0. Existing dirty Import keeps Home/order/revision.

Destination Cancel leaves external input and catalog unchanged. Actual external
Copy retains source; ordinary Move removes only its selected external source
after identical destination publication. The controlled finishImport target's
real shadow yields recovery-required: Home remains until explicit Recover, then
the x16 dirty tab replaces it. Existing Main deliberately retains the Move source
in this case and displays its warning. The absent-target preparation copied and
removed only an extra owned file while physically closed; source/backup bytes and
three original shadow inputs remain retained. This is not crash qualification.

Final SQLite has12 rows: eight original seeds, one UI Create and three imported
destinations. All eight seed packages and four committed result packages remain
exact. Original seed identity/path/workspace/document/revision are stable;
lastOpened changes only the four explicitly opened seed owners. Original external
Move bytes remain in the independent backup; other external inputs stay exact.
Two dirty tabs use explicit Discard Changes before normal close. Both controlled
OS picker wrappers restore exact original callback identity. No Project reply or
writer was mocked. Live shadows legitimately change after explicit decisions;
their equality to pre-decision inputs is not claimed.

Typecheck and app build PASS; the existing renderer chunk advisory remains.
Three unchanged Queue/result, accepted-history and New Project preset-draft files
give **29 PASS**, zero fail/skip. They are neighbor controls, not new UI proof.
Independent App source review is CLEAN/READ_FINISHED. ROOT read the authored
harness and viewed all four actual screenshots: dialogs/actions fit their bounded
surfaces and final tab placement is visible; no material local issue was observed.
Source review, ROOT runtime/visual checks and independent retained-byte audit are
separate evidence. No domain mutation was required/performed for this UI-only slice.

Standard `pnpm run lint` hit its explicit Node CLI2048MiB heap ceiling inside src;
this is an excluded OOM, not an ESLint/semantic failure. The redundant env-only
retry was stopped in its exact own unit once the CLI precedence was read. Final
lint uses the same four scopes, repository config and sole unchanged parser
exclusion `scripts/qualify-installed-regional-init.mts`, through the retained
`full-lint.mjs` test adapter with3072MiB child heap under the same4GiB group limit.
All four scopes PASS. Repository launcher/config and production behavior are
unchanged. `lint-adapter.json`, both diagnostics and all resource reports preserve
this distinction; ordinary unmodified launcher success is not claimed.

## Retention and reproduction

RUN retains `qualification-summary.json`, native report/screenshots/logs, source
review, resource/physical-exit reports, lint adapter/diagnostics, full source,
qualified bundles, payload inventory/archives, independent audit and release/
commit proof. Raw owned profile/temp data is removed only after archive/live-byte
verification, READ_FINISHED, callback restoration and physical exit. Lifecycle
records exact removed paths and actual reclaimed bytes; SHARED and ordinary app
data stay protected. Historical report paths are not resumable after cleanup.

Reproduce with a fresh owned evidence directory/TMPDIR after lifecycle inventory,
`pnpm run app:build`, then `pnpm exec tsx scripts/smoke-home-entry-current.mjs
--report-file <fresh-dir>/native.json` under the recorded envelopes. The harness
requires a new absolute report and prepares its own real inputs. Retained source,
bundle and payload archives are checked against manifests without following
symlinks; no runtime/model reconstruction or old `--resume` is needed. Delivery
gates bind that frozen source tree and executed bundle hashes to live master.

Late dialog scheduling, broader Home metadata/session continuity, Model Manager,
exports/runtime/update/release and visual/full MVP acceptance remain open. These
results do not promote public promise statuses.
