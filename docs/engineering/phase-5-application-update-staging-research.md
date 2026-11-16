# Same-directory staging of a verified application update

Base: `56ff0569c40219576d100d504ee2226d72616ca4`, clean `master`.
Risk: **High**: executable-parent writes, durable recovery material and private
release authority. Contracts: [Application Updates](../features/application-updates.md),
[explicit intent](../contracts/explicit-intent.md), [research](./research-protocol.md),
[review](./review-protocol.md), [artifact lifecycle](./artifact-lifecycle.md).

## Fresh source and adaptation

Read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`:
`invokeai/app/services/model_install/install_staging_ledger.py` `_publish_claim`,
`_write_marker`, `InstallStaging.claim/persist/begin_transfer`; callers
`model_install_default.py:_install_path_with_info_claimed`, `_register_or_install`
and `_install_next_item`; `_restore_moved_path` and `app/util/no_replace.py`.
The ledger protects staging before material transfer, durably records intent and
retains ambiguous states. Cross-filesystem restoration stages a copy beside the
target before no-replace publication. Adapt those mechanisms, not a cache-to-target
move or a second download/verifier.

Read the current adapters `runtime-installation.ts` and its installation callers,
`offline-runtime-assembly.ts:copyVerifiedFile`, and `runtime-release-transport.ts`.
Their fd-anchored parent, create-only copy, bounded streams and fsync are donors.
The runtime controller itself is not a generic executable installer: its roots,
slots, metadata bounds and pointer rollback remain unchanged. Its warning-only
post-rename directory sync cannot establish executable publication durability.

Read clean launcher `c267bdb439519216b277a7a8c6ad408b9d79efce` updater and callers,
and exact electron-updater6.6.2 BaseUpdater/AppImageUpdater. Native install occurs
before app.quit and unlinks the old AppImage before moving the candidate. No safe
running-AppImage replacement/rollback is available there. This absence was disclosed;
this slice adds **staging only**, not an independently invented replacement protocol.

There is no AppImage envelope checker in Invoke. This narrow format adapter was
also disclosed before implementation. Primary sources freshly checked:
[AppImage type2 specification](https://github.com/AppImage/AppImageSpec/blob/master/draft.md),
[Linux ELF header](https://github.com/torvalds/linux/blob/master/include/uapi/linux/elf.h),
[Linux machine constants](https://github.com/torvalds/linux/blob/master/include/uapi/linux/elf-em.h).
The check recognizes ELF64/little-endian/x86-64 plus type2 magic at offset8.
It does not validate the appended filesystem, internal app/version, executable
behavior or compatibility. LinuxFoundation reference pages were access-denied;
they are not claimed as inspected sources.

## Owner and intended finite behavior

The existing ApplicationUpdateService gets a **Main-private** staging entry point
after its signed downloaded artifact gate. Main captures the external `APPIMAGE`
path, not process.execPath inside the mounted/extracted image. No renderer path,
new IPC, public state or Install button is introduced. Generate, Check, Download
and getters never call staging implicitly. Default publisher remains unavailable.

The stage owner validates a canonical user-owned, non-shared-writable target parent
through a directory FD, and an owned single-link current executable. It snapshots
current bytes/identity without changing them. It revalidates the existing private
native artifact authority before writes and around copying. A per-target exclusive
0700 sibling directory is the claim. Any existing directory, unknown/failed stage
or foreign object refuses; nothing is automatically adopted, repaired or deleted.

Candidate bytes stream into a fresh create-only0600 inode inside that sibling,
independent of native cache inode and permissions. Exact declared size/SHA512,
source FD/path stability, output bytes and fsync precede a durable prepared journal.
The journal binds the signed manifest, current binary/parent/staging identities and
new candidate. A returned frozen private plan rechecks current, candidate and
journal identity/bytes before future use. After the last authority await and read-handle
closure, a synchronous FD-anchored identity/membership/retirement sweep follows the
existing ProjectRelocation final guard pattern; no later async hash reopens a long
verification window. This does not promise filesystem CAS against arbitrary same-UID writers. Failure after claim creation retains
owned material with fixed diagnostics; original executable and native cache remain
untouched. Directory sync uncertainty is failure/recovery, not successful staging.

This claim coordinates cooperating Studio staging owners. Ordinary POSIX name
checks are not CAS protection against arbitrary concurrent writers of the same UID;
observed interference refuses and retains evidence. Stage completion does not
authorize replacement or restart and does not execute either binary. Known-good
backup, helper after physical Main exit, atomic activation, post-start validation,
rollback, recovery/adoption/discard and the public Install review are later consumers.

## Bounds and verification plan

Use the existing1MiB streaming chunk pattern and bounded1MiB durable metadata (the existing canonical app-release maximum);
size derives from the signed manifest, not an arbitrary package-size promise.
The signed manifest is preserved as facts in this journal; a persisted journal is not
a signed envelope or restart/adoption authority. Existing stages always refuse; a
future helper must obtain authenticated authority again, not trust this JSON alone.
No parent directory is created/chmodded and no elevation is attempted. Ownership,
permissions, aliases, exclusive existing stage, changed/current/candidate/journal
bytes, same-byte inode ABA, revoked authority, invalid format/hash/size and partial
failure all need concrete refusal controls. The stage is retained on ambiguity;
repeating the action cannot overwrite it. Real target/cache hashes, modes, inode
and mtimes must remain unchanged.

Execute focused tests through real files and the service entry point; use the actual
native updater/signature consumer where possible. A copied real AppImage gives a
separate size/format consumer without running or replacing a host installation.
Semantic mutation must reach staged bytes/revalidation, give a precise RED, then
original GREEN/restoration. Authored tests/source review, actual execution, physical
process exit, retained-byte audit and commit/push remain separate evidence levels.
Run full typecheck, app build and relevant lint; prototype is unchanged.

## Executed evidence and limits

Root executed **220 targeted tests PASS**, full `pnpm run typecheck`,
`pnpm run app:build` and scoped ESLint of all five changed code/test files PASS.
The tests include actual canonical Ed25519 declarations, real file copies,
fourteen byte/identity/permission/journal/parent tamper variants and four changes
injected inside the last authority await. Those late changes must refuse rather
than escape through an earlier hash. Native GenericProvider parsing, signature
admission, cache/file receipt and the new service staging consumer are joined
in integration tests with **controlled metadata HTTP and transfer ports**. This
is not a real HTTP, Electron renderer or public Install workflow qualification.
Metadata-only and missing-current-path cases create no sibling; a new Check
retires a service plan while preserving all its existing bytes. Download never
stages implicitly and public snapshots keep their existing exact field set.

A standalone esbuild compilation of the actual stage owner passed a separate
**147,106,530-byte** data fixture copied from the retained previous default
AppImage. The current/cached copies and staged candidate have the expected full
hashes; current/cache modes, inode, mtime and ctime remain unchanged. The original
retained source outside this run also retains its exact hash/mode/inode/mtime.
This is a large real container/size/filesystem consumer with a controlled authority
callback and an actual verified signature declaration. That declaration is a test
identity, not a shipping release; internal binary version is not checked, and no
AppImage is executed or replaced. Copying these bytes had that concrete test reason;
no ML runtime, weights or Electron distribution were duplicated.

The adjacent small-fixture **GREEN / semantic RED / exact restored GREEN** removes
one final candidate identity guard from an isolated compiled module. Initial
copy/header/hash, old binary/journal checks and authority calls remain intact.
The controlled final authority await changes one existing candidate byte after
its async hash. Original and restored reject; the mutant accepts and then fails
specifically at the false-acceptance assertion. This is neither setup failure,
OOM nor timeout RED. Original/restored module hashes match; live source and app
dist were never mutated. Reports and exact compiled modules are retained.

Independent finite production source review is **CLEAN**, without test/runtime
claims. The fixed per-target directory is an existence claim only: no stale-owner
adoption, process-exit protocol or resume is implemented. Journal facts alone are
not restart authority. Exact0755 current executable and owned/non-shared-writable
parent,0700 stage,0600 candidate and single-link profile remain conservative
admission constraints, not universal Linux/filesystem support. The final sync
sweep reduces async interleaving, not arbitrary same-UID filesystem races.

Evidence is under
`~/.codex/artifacts/imagegen-studio/runs/application-update-staging/20261116`:
`filesystem-summary.json`, `qualification-source.json` and its source archive,
`filesystem-evidence`, commands, bounded logs/receipts and review/audit proofs.
The fsynced payload archive retains all **4,475 entries**, including three complete
real-container body copies, exact journals/failed claims, compiled original/mutant
and controlled fixtures. Root verified complete membership, kinds, modes, link
text and file hashes before removing its idle payloads/TMP, reclaiming
**473,550,848 allocated bytes**. All Node groups had settled; no separate native
AppImage processes were started. The old fixture's reciprocal temporary dependency
was released after independent copies and source restoration verification. Its
pinned source, shared runtime/models, ordinary app data, external files and repo
dependencies remain protected. Independent retained-byte and final source/staged
byte audits are separate records in the same run. Prototype/UI is unchanged;
previous browser/native-app results are historical, not new execution evidence.

This stage does not provide public Install Update, executable activation/rollback,
known-good app backup, restart recovery, shipping publisher configuration,
upgrade/migration/runtime qualification or final MVP acceptance. Promise statuses
remain unchanged.
