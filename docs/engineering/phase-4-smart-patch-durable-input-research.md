# Smart Patch durable execution inputs

## Prospective scope and risk

Base `0a0f5c84c63979a83d069b5c907de32eb58d6de2`, clean master.
Supporting promises: PP-007/008; contracts:
[Smart Patch](../features/project/generate-mode/smart-patch-layer.md),
[generation results](../features/project/generate-mode/generation-results.md),
[storage](../specs/03-data-storage.md).

This high-risk persistence/lease slice prepares the durable input owner needed
before extending queue dispatch. Current queue payloads and SQL operations admit
six ordinary family TXT/IMG/OUT operations, a single target PNG and normal /8 bbox.
Smart Patch instead needs separate world placement, internal resolution, prepared
RGB, latent KEEP and final world contribution. Publishing a new pending kind
before processor/staging/acceptance support would be unsafe.

The finite scope is a private versioned frozen DTO and app-owned durable input
bundle, plus real captured preparation into that bundle. Existing single-item
execution reuses an extracted nonexecuting request-preparation function. Concrete
items are supplied by the caller, bounded by the existing cap32 policy; this
slice does not choose Random/Reuse, expand dynamic prompts or advance the cursor.
One bundle shares pixel inputs across items and retains the exact effective
resource/sampling metadata prepared for each item. It is not a dispatchable SQL
job, completed candidate, recovery session or accepted variant.

## Ownership and invariants

- One frozen local project key/document ID/target layer ID, bbox/internal size,
  original mask identity/revision and draft/settings/coherence snapshot.
- Copy actual source RGBA, optional authored mask, optional prepared model RGB,
  latent KEEP and final world GENERATE planes. Numeric masks have no color ICC;
  color images use the pinned sRGB profile. Preserve source-only modes and all255
  latent KEEP without reclassification or invented coverage.
- Strip transient operation/output/request paths from the durable execution DTO.
  Store only fixed relative input roles and exact metadata; managed model paths
  remain private frozen resource metadata, never portable `.igs` paths.
- Files first, fsync, exclusive manifest commit marker, directory/parent fsync, then verify
  actual bytes on fresh reload. No admitted prefix on later invalid item or
  failed preparation; uncertain publication must not be silently treated as loss.
- Use a separate prepared-input root. Existing queue startup cleans unregistered
  UUID directories under `generation-inputs`, so that root is unsuitable.
- No automatic dispatch/resume or current Project reread. Only explicit discard
  of an exact owned bundle; no sweeping unrelated directories.

Public Generate, SQL migrations/queue admission/processor dispatch, candidates/
receipts, seed cursor, accepted variants, history/shadow/`.igs`, provenance,
presets/Compare and UI are outside this slice. Public promises remain unchanged.
User decision15.10.2026 forbids public generation and Add as Variants for locked
or hidden targets. The corresponding boundaries will recheck both flags and
never change them implicitly; private read-only preparation remains allowed.

## Verification plan

Actual ProjectService capture and real CPU preparation must publish a bundle
that reloads after capture cleanup and from a fresh owner/process. Check literal
world/internal dimensions, byte/hash/ICC/alpha identities, family request metadata,
owned method/item aliases and unchanged package/document/SQL/cursor owners.
File tests cover malformed/oversized metadata, path traversal/symlinks/aliases,
corrupt or crossed files, interrupted publication, collision, fsync failure and
exact discard ownership. Failed publication preserves foreign bytes.

Semantic mutations target frozen bytes/metadata binding, persistence validation
and full-operation drain, with neighboring GREEN cases and physical exit/source
restoration evidence. Run focused and affected regressions plus required
typecheck/lint/build; no trained GPU or installed-runtime qualification is claimed.

Artifact inventory before work: root28GiB, free44GiB. Reuse checkout Python and
tiny CPU fixtures, no downloads/environment/trained-weight copies. Heavy runs
remain serial under whole-process memory/deadline limits, swap0; retain compact
reports and remove idle own payloads after exit/restoration proof. Historical
pinned evidence over the1GiB soft budget remains an explicit protected exception.

Execution results, limitations, final static checks and cleanup follow.

## Executed behavior and limits

This is implementation self-review over the dirty tree above, with separate
read-only cross-reviews of resource/lease and filesystem ownership code. It is
not a blind product audit or an installed-runtime qualification.

Initial focused checks:48 contract/repository tests and16 actual Main batch
integration tests pass, with no skips. The Main tests use real ProjectService,
`.igs`/SQLite snapshots and serialized CPU preparation; the catalog collaborator
qualifies actual tiny files. No new family diffusion executes in these16 cases.
Two cases continue from capture cleanup into actual bundle publication and a
fresh repository load, one per family. Existing native execution/world-output
tests remain regression controls for the extracted single-item builder.

Preparation runs CPU composition/conditioning/model-source once for the batch.
One scoped resource resolver memoizes detached exact descriptors; concrete
unbound-embedding checks still run per item. A final real resolver pass checks
every selected resource after async material validation, catching same-SHA
prediction/noise-policy changes without returning a prepared prefix. The cap32
case observes two underlying checkpoint qualifications and32 prompt checks,
rather than rehashing a checkpoint twice for every item. Fixed authored seed0
remains unchanged while concrete seeds vary, including uint32MAX. Dynamic prompt
expansion and Random/Reuse resolution are deliberately not performed here.

| Parameter                                        | Source and behavior                                                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Concrete items1..32                              | Existing `GENERATION_BATCH_JOB_LIMIT`; empty/33rd items refuse before CPU work. This is an admission ceiling, not a guarantee that every32-item payload fits. |
| Manifest128KiB                                   | Existing operational payload ceiling reused as a private bundle limit; actual serialized UTF-8 context/items are measured before publication.                 |
| Each PNG32MiB, at most5 roles                    | Existing strict PNG ceiling; derived aggregate encoded maximum160MiB, shared once per bundle rather than per item.                                            |
| World/color planes2048side/4M pixels             | Existing Smart Patch CPU preparation limit, independent of processing grid.                                                                                   |
| Original authored mask4096side/4M pixels         | Existing owned-mask limit retained; original mask can exceed bbox dimensions and remains byte exact.                                                          |
| Internal /8 grid and latent dimensionsinternal/8 | Existing private execution request parser; world bbox need not be /8.                                                                                         |
| Directories0700/files0600                        | Owned canonical prepared-input path, fixed direct PNG roles and bounded manifest; symlinks/hardlinks/foreign entries refuse.                                  |

## Review finding and corrected test setup

Filesystem cross-review found a real same-inode discard vulnerability before
delivery: after qualification, the original implementation checked only dev/ino.
A manifest or PNG rewritten in place during an awaited boundary could therefore
be removed under stale ownership. The fix preserves dev/ino/size/mtimeNs/ctimeNs
from the actual descriptor read, rechecks all members after qualification and
before the commit marker is removed, and rechecks each subsequent unlink.
Two tests actually overwrite same-sized manifest/PNG bytes without replacing the
inode; refusal preserves the changed file and every bundle member. Restoring the
bytes permits a fresh exact discard. Fault hooks surround real filesystem
boundaries; they do not replace storage with a fake repository.

Initial failed checks were retained separately from semantic evidence:

- The literal fixture first used the tight/nonempty authored-mask encoder for
  empty or padded derived masks; all48 cases failed in fixture setup. Derived
  planes now use a literal white-RGBA/no-ICC encoder. Original authored masks
  continue to use the production strict mask encoder.
- Two TXT integration expectations incorrectly counted a model-source worker
  operation, although TXT intentionally has no model RGB and skips that call.
  They now assert zero there and one for image modes.
- Two resource fixtures lacked required CivitAI IDs for embedding/VAE, then a
  shared LoRA source ID violated the established one-row-per-model invariant.
  The fixtures now supply valid exact identities without relaxing production
  validators. Typecheck also caught two attempted mutations of readonly Anima
  fields; tests now replace their own cloned outer values.

No setup/type error counts as a detected mutation or product regression. Actual
same-sized changed-PNG fixtures use literal stored-deflate encoding so their
valid topology/CRC, encoded size and alpha remain the neighboring control; only
the retained hash disagrees.

## Publication semantics and remaining owners

The directory is exclusively reserved with mkdir; Linux directory rename alone
is not NOREPLACE. After fixed files and a bounded sibling temporary manifest are
fsynced, an exclusive hard link publishes `manifest.json` as the commit marker.
Directory and parent are then fsynced. Caught postcommit failures retain pixels,
report `SMART_PATCH_INPUT_PUBLICATION_UNCERTAIN` with bundle/manifest identity,
and do not turn an uncertain commit into silent deletion. Explicit discard
removes the marker first and deletes only read-verified owned members.

A real child-process exit79 immediately after the link deliberately leaves the
temporary manifest's second hard link. Strict load refuses this incomplete
durability window and retains all bytes without sweeping. Exact reconciliation
of this window belongs to the subsequent queue owner/registry; completed publish
is separately verified through a fresh physical Node process and loads normally.
This slice does not claim automatic recovery/replay of unfinished preparation.

Next is complete queue admission/dispatch/staging integration with an owner for
the bundle handoff and uncertain/crash windows, then immutable variant acceptance.
The current bundle repository is private and not wired into public Generate;
existing ordinary jobs, candidates/receipts/cursor, Project/history/shadow/`.igs`
and public promise statuses remain unchanged. Locked or hidden public targets
are both forbidden by the user's decision, recorded in the supporting contracts.

## Regression and mutation evidence

Affected146 Main/project/model/runtime/shared test files: **2358 passed,
0 failed/cancelled/skipped**,245.136s under4GiB/swap0/300s. New64 cases
(24 frozen-contract,24 real-filesystem,16 actual Main) are included in that total,
not added again. The earlier focused48/16 results are overlapping localization
checks. Python source is unchanged; no whole-worker Python regression is claimed.
The retained existing TS native tests still cross actual Python CPU/native
boundaries, including the previous bridge/world output. Old OUT controls reuse
the protected shared exact LaMa file; no runtime, catalog or trained weight copy
or download was created.

`input-mutation-f02eb9a722-summary.json` records four isolated production faults.
Each runs exactly two cases: one causal assertion RED and one neighboring GREEN,
with0 errors/skips/cancelled. Whole process groups have physically exited, every
original hash is unchanged and all private copied graphs were removed.

| Isolated production fault                  | Causal RED                                                                                        | Neighboring GREEN                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Skip actual PNG hash comparison            | A valid same-sized changed RGB file incorrectly reloads under the old frozen hash                 | Unchanged input bundle publishes/reloads exactly                       |
| Treat committed publication as uncommitted | Parent fsync failure deletes pixel members from an already committed bundle                       | True precommit directory failure cleans its own incomplete reservation |
| Reduce read-version comparison to dev/ino  | Exact discard deletes a same-inode rewritten PNG                                                  | Unchanged exact discard preserves neighbors and ordinary queue data    |
| Omit admitted-operation drain              | Callback settles while independently witnessed final batch resource qualification remains blocked | Awaited real ProjectService/CPU/bundle handoff completes normally      |

The initial probe harness attempt generated invalid hidden-file relative imports
(`.input-mutation-...` without `./`) and was rejected as setup failure. The harness
path renderer was corrected, the failure report retained, and the complete
four-pair rerun passed. Original files were unchanged in both attempts. No
production change or weakened assertion was required for these probes.

The implementation source and test hashes used by the regression are retained
in `verified-source.json`; TAP, commands, cgroup limits/peaks and mutation graphs
live under
`~/.codex/artifacts/imagegen-studio/runs/smart-patch-durable-input/20261015-input/`.
This validates the declared private input owner, not installed GPU inference,
public queue/Results, variant acceptance or full Invoke parity.

## Final static checks and artifact handoff

Full `pnpm run typecheck` (both Vue projects), `pnpm run lint` and
`pnpm run app:build` pass. No UI or Python source changed, so prototype interaction
and standalone Python suites were not rerun. `git diff --check` and newly added
local Markdown links pass. Supporting promises and their matrix rows report the
same private scope and2358-test/four-pair evidence; public statuses are unchanged.

All heavy checks ran serially with CPU threads1, CUDA hidden, swap0 and explicit
whole-process memory/deadline limits. No OOM or watchdog failure occurred.

| Check                 | Ceiling/deadline | Elapsed  | Sampled peak bytes |
| --------------------- | ---------------- | -------- | ------------------ |
| Contract/filesystem48 | 2GiB/180s        | 2.220s   | 361156608          |
| Main batch16          | 4GiB/180s        | 13.434s  | 754978816          |
| Affected TS2358       | 4GiB/300s        | 245.136s | 1330663424         |
| Full typecheck        | 2GiB/180s        | 19.041s  | 1800380416         |
| Full ESLint           | 4GiB/180s        | 40.069s  | 3893854208         |
| App build             | 2GiB/180s        | 1.615s   | 1176096768         |

`cleanup.json` confirms physical exit of all19 verification groups before cleanup,
unchanged original source hashes and removal of every isolated mutation graph.
The successful four-pair campaign disposed652477 logical bytes of source copies;
the rejected setup attempt disposed another86647. These logical sizes are not
claimed as measured disk space reclaimed. Test fixtures clean their own temporary
data only after awaited children exit; no bulky runtime/model/catalog payload was
created. No ordinary application data or original external model/image was used
as a cleanup target.

Final housekeeping removed only the unused copied Python-regression helpers and
idle own import bytecode: **45056 allocated bytes reclaimed**,38524 logical bytes.
Compact logs/TAP/commands/source and process proofs occupy approximately1MiB;
they retain both rejected setup attempts and meaningful RED/GREEN evidence.
Run and shared dependency lifecycle records were updated. The shared LaMa/runtime
and historical pinned evidence remain protected for their ongoing qualification
chain; artifact root remains about28GiB with44GiB free.
