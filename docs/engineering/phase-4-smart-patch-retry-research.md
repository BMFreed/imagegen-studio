# Smart Patch: frozen Queue Retry

## Scope and research, 21–22 October 2026

High risk: queue persistence, exact resources and immutable frozen inputs. Base
`10115df581d9e07049478dee3866a280886794fd`; the existing uncommitted freshness
changes are retained. This slice implements the next explicit gap in
[PP-007/008](../product-promises.md), [Queue Manager](../features/queue-manager.md)
and the [Smart Patch contract](../features/project/generate-mode/smart-patch-layer.md).
It does not qualify the complete Smart Patch MVP.

Expected result: Retry on a failed/canceled Smart Patch creates one new pending
attempt of the reviewed concrete job, with its original pixels, mask, prompts,
resources, sampling and actual seed. It does not capture today's Project,
replace existing candidates, accept a variant, modify Undo or save `.igs`.
The original saved Project/document must be open. Source sequence is consumed
atomically so repeated stale clicks cannot enqueue duplicates.

Confirmed before implementation:

- Queue Manager already calls the public `retryGenerationJob` IPC with only
  reviewed job ID/status sequence. Its advisory helper explicitly refuses both
  Smart operations. Main independently refuses them in `retryUnlocked`.
- Ordinary queue readers and Retry accept normal/outpaint payloads only. Keep
  that typed boundary; Smart input bundles have fixed-role PNGs and a separate
  strict payload parser/verifier.
- Smart Generate uses app-wide admission and the existing FIFO dispatch owner.
  `RuntimeService.withGenerationAdmission` can borrow a running worker's qualified
  readiness without a second CUDA worker. A Retry needs no CPU preparation.
- A Smart queue row binds one concrete item index to a verified immutable bundle.
  The bundle owner checks references before deletion; staging candidates preserve
  their own image/mask and frozen provenance independently of queue history.

Data path: Queue Manager → preload/IPC → app-wide generation admission → typed
Smart frozen-input/resource verification → SQLite source CAS/new row → existing
Smart dispatch → temporary Results → explicit Add as Variant.

Decisions: a dedicated Smart Retry API copies the verified original bundle into
an independent new bundle; exact model references are requalified for the selected
item before publication and again by dispatch. The extra copy makes the new
attempt independent of later source history deletion or file damage. Sharing a
bundle was also viable with reference-aware cleanup, but was not chosen. A
current-target revision check would change Replay semantics: the original
document identity remains required, whereas current draft/source edits must
not replace the original frozen inputs. Adopted local policy: target deletion,
locking or hiding does not prevent replay into temporary Results. A missing
acceptance target remains orphaned; Add is unavailable, and no retarget occurs.
This follows frozen queue replay rather than today's Generate permissions and
does not promise orphan Raster conversion. The original open coordinator identity
is checked around admission in addition to the original document ID.

Retry creates one fresh Smart staging session, independently of older candidate
sessions. Existing per-session publication ceilings remain enforced by the Smart
staging owner. This slice adds no ordinary Raster capacity preflight or claim of
measured disk capacity. OUT model-source RGB is already frozen: retry never needs
LaMa installed again and never reruns it. Existing resource verification resolves
authored embedding references before selecting the concrete effective subset;
this existing conservative resource policy is retained.

Failure matrix: stale/nonterminal review; receipt recovery pending; missing or
tampered PNG/bundle/model; mismatched file/document; close/shutdown during await;
resource replacement during preflight; SQLite rollback/lost acknowledgement;
uncertain publication/physical exit. Refusal preserves source history, candidates,
saved bytes and accepted variants. Uncertain publication retains data and fences
the Project; existing startup reconciliation and explicit recovery remain owners.

Finite domains come from `GenerationQueueEntry.operation`, terminal status schema,
`FrozenQueuedSmartPatchV1` and `FrozenSmartPatchInputV1`: two families, four Smart
modes, one reviewed concrete item of an original 1–32 item plan. No new product
limits or runtime timeouts are introduced. Native validation uses declared
bounded launchers, isolated XDG roots and compact evidence separate from payloads.

Verification planned: real SQLite/files queue tests with CAS/rollback/recovery and
independent bundle lifetimes; public controller tests through existing admission
and dispatch with declared numerical collaborators; renderer capability neighbor
controls; typecheck/lint/build; actual Queue Manager interaction/screenshots;
one isolated executed semantic mutation plus GREEN/restoration. Trained inference,
installer/release and maximum capacity are not established by fixture collaborators.

## Evidence

Working-tree implementation is complete. A public-controller run passed 37 tests
with real CPU composition/preparation/conditioning/world output and declared
readiness/numerical inference. This includes both families in TXT/IMG/INP,
frozen replay after edits, busy single-owner replay, exact-resource/capability
refusals, orphan Add refusal, late exit/owner changes, Close/shutdown and shared
Generate admission. Existing queue/controller/renderer neighbors passed 162;
prototype passed all 180 tests with one worker. Final typecheck passes.

Independent static review found one P2: a Project path rename/rebinding during
admission worker teardown escaped the earlier canonical-path check. The final
controller now rechecks the real path after admission returns and awaits
cancellation of only the new row. Both rename and symlink regression tests pass;
a second scoped review resolved the objection with no remaining material finding.
These reviewers did not independently execute tests.

The first repository run collected 43 tests: 42 passed, one FIFO fixture failed
because an uncanceled ordinary sibling correctly preceded the expected retry.
The fixture now cancels those siblings; product FIFO was retained. That run
preceded the two additional literal OUT replay cases. Final broad Project execution passed **1954 / 0 failed / 2 skipped** (1956 total),
including the final 45-case repository Retry suite. The two existing skipped
cases are LaMa-dependent OUT capture for Illustrious/Anima without
`IGS_SMART_PATCH_TEST_LAMA_PATH`; both new frozen literal OUT Retry cases execute
and pass without LaMa. No full installed OUT preparation qualification is added.
The initial typecheck failure was an optional fixture mask-setting access, now
asserted; initial lint findings were style/order, addressed before final checks.

Compact evidence root:
`~/.codex/artifacts/imagegen-studio/runs/smart-patch-retry/20261021-frozen/`.
Raw first failures stay separate from successful verification. No commit, push,
PR, installed trained inference or release qualification is implied.

### Executed sensitivity control

An isolated source copy reset Retry's selected `bundle.itemIndex` to zero.
Baseline: 2 passed. Mutation: exactly 1 expected assertion failure (`0 !== 1`)
for the nonzero concrete item, with the zero-index neighbor still passing.
Byte-exact restoration: 2 passed; the actual workspace queue source hash stayed
unchanged. Each run used a finite 3 GiB/zero-swap cgroup and confirmed no remaining
PIDs. Preserve `semantic-mutation.patch`, setup/restoration manifests and all
GREEN/RED/restored TAP/resource reports together.

Two initial isolated-copy setup failures are separate evidence: pnpm refused
its dependency-state reconciliation without a TTY, and direct tsx then revealed
the missing fixture ICC file. No install/purge was authorized or allowed. The
final runner uses the existing read-only tsx dependency directly and copies the
required source ICC into the isolated tree. Neither setup failure is a semantic
RED. Existing dependency and CPU environments remain protected.

### Native result and visual self-review

Final `native-r4.json`: **20 passed**, one visible built Electron launch,
1440×900 CSS px/DPR1, five screenshots actually opened. Real renderer clicks,
preload/IPC, Main, exact structural model-file qualification, Runtime leases and
physical child exit, real SQLite/input copies/staging, actual checkout CPU handlers,
world PNG bytes, ordinary Undo/Redo and saved-package readback remain real.
Readiness and numerical family inference are explicitly controlled, using a
miniature zero-weight structural checkpoint; this is not trained inference or
CUDA/image-quality qualification.

The native flow cancels original seed1 after a seed0 candidate completes, changes
prompt/seed/steps/lower visibility/mask through UI, then retries seed1 twice, including
while the first replay is held in inference. It proves exact original model-source,
mask, prompts/settings/seed and resulting world alpha, independent copied bundle and
new job/batch/session identities, one FIFO inference owner, stale-review refusal,
older candidate/receipt preservation, zero accepted variants, no implicit Save,
and visible missing-resource refusal with unchanged rows/inputs/candidates. The
withheld fixture model is byte-exact restored. Existing authored mask Undo/Redo
still works; Retry adds no history entry.

Native R1/R2/R3 are failed harness attempts and are not counted as passes:

- R1 counted every source composition/preparation call as execution preparation.
  `targetState()` independently performs read-only mode inspection after generation
  notifications. The final oracle distinguishes `condition-smart-patch` and
  `prepare-smart-patch-model-source`; exact queue bundle/worker request comparisons
  and authoring invariants remain strict.
- R2 expected dirty intermediate Undo/Redo to reuse a historical revision UUID.
  `ProjectSession.applyDocument` only reuses the revision for exact saved content.
- R3 compared revision-bound signed image URLs as authored layer data. The final
  history comparison ignores only the revision/HMAC tokens, retaining Project,
  layer/mask IDs, mask revision and asset content hashes. Retry itself still must
  preserve the complete pre-history DTO/revision. Original failed harness bytes
  match each report's source SHA and are retained with the reports.

Visual self-review covers enabled Retry, pending/running FIFO rows, completed
result preview and missing-resource feedback. The Smart job label correctly says
`Generate · Smart Patch` in rows/details. Buttons, feedback and frozen settings
are readable; the list/details scroll independently and stay inside the dialog.
No new material layout finding was observed at this viewport. This is not an
independent audit of all Project UI, keyboard states or other screen sizes.

The final native launch exits normally (code0, no signal): all 48 observed actors,
including 42 recorded peer launches, have physical-exit proof. The launcher and
owned KDE scope each have a 2 GiB/zero-swap cap, aggregate ceiling4GiB; finite
service/scope deadlines and `memory.stat` anon/file samples are retained. Final
observed peaks: launcher851,746,816 bytes, KDE scope101,556,224 bytes. Across all
four attempts 187 distinct PID/start identities were independently rechecked idle.

Final required checks: typecheck PASS; complete lint PASS plus focused ESLint after
harness-only amendments; app build PASS; prototype180 PASS; Project1954 PASS,
0 failed/2 existing skips. The meaningful mutation is separately GREEN/RED/restored.
725 local documentation link paths exist; 13 existing anchor fragments were not
revalidated. Promise rows and supporting contracts change together while
PP-007/008 remain **Пока не обещать**.

### Retirement and retained evidence

`fixture-cleanup.json` records actual deletion of exactly five owned idle payload
roots: the restored isolated source copy and native R1/R2/R3/R4 fixtures. Physical
exit, source/model restoration, no active path users and canonical ownership were
checked before deletion. **70,651,904 bytes (67.38MiB)** were reclaimed; allocated
artifact root changed from2,968,641,536 to2,897,989,632 bytes (about2.70GiB).
Original native reports remain byte-for-byte unchanged.

Original `.igs`, SQLite snapshots, literal frozen PNG bundles, candidate PNGs and
manifests, relevant CPU/inference traces, screenshots, failed harnesses, bounded
logs and the 308-file source/bundle archive remain compact evidence. Reproduction
uses the committed-base/dirty-source identity and the retained harness; deleted
XDG/runtime fixture paths are historical and are not reusable installed runtimes.
The repository dependency/CPU environment and older evidence are protected. No
weights/environment copy or active disposable payload remains for this slice.

Pre-existing runs total about1.4GiB, above the evidence soft budget: inspected large
members are boundary-cap before/after state JSON and sampler baseline/replay reports.
They remain evidence for their existing contracts; this slice retires no historical
set. Their release checkpoint is superseding qualification plus a reference audit.
The total artifact root stays below30GiB. This exception and dependencies are in
`artifact-lifecycle.json`.

Remaining boundaries: no new trained installed Retry, maximum disk/VRAM capacity,
fsync/ENOSPC injection, installer or signed-release qualification. Orphan Raster
conversion, accepted-history navigation, Smart Compare/Preset and full quality/
Invoke parity remain separate work. No commit, push or publication was performed.
