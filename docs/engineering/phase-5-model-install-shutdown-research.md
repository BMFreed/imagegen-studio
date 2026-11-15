# Model installation drain before app close

Base: `3854a81644baa19423f6e32883affbe7c5dd9a2f`, clean `master`.
Risk: **High**: resource publication, shared SQLite lifetime and native close.
Supporting contracts: [Application Updates](../features/application-updates.md),
[managed model library](../contracts/managed-model-library.md),
[PP-004](../product-promises.md#pp-004-управляемая-библиотека-моделей-вместо-ручной-работы-с-файлами),
[research](./research-protocol.md), [review](./review-protocol.md) and
[artifact lifecycle](./artifact-lifecycle.md).

## Fresh source and selected consumer

Read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`:
`invokeai/app/services/model_install/model_install_default.py:774–880,1716–1745`,
`download/download_default.py:128–175`, callers
`model_manager/model_manager_default.py:130–140`,
`invokeai/app/services/invoker.py:39–48` and
`invokeai/app/api/dependencies.py:316–322`. Invoke closes download admission,
stops taking queued work, joins installer/download callbacks and disposes the
database only after service shutdown. Its multifile pause/resume policies do not
replace Studio's existing cancel/retry contract.

Also reread clean launcher `c267bdb439519216b277a7a8c6ad408b9d79efce`
`src/main/updater.ts`, actual `main-process-manager.ts:167` check caller and
`index.ts:124` quit caller; exact electron-updater6.6.2 `BaseUpdater` and
`AppImageUpdater`. Safe AppImage replacement/rollback and Linux publisher trust
remain absent there. They were disclosed before introducing any alternative;
this slice adds neither installer nor custom replacement algorithm.

The immediate missing consumer is ModelInstallCoordinator stop/drain. Existing
`cancelInstall` acknowledges abort before running transfer/cleanup settles;
preparation can still be awaiting token/source checks before a controller exists.
The app's existing GenerationAppShutdown closes shared SQLite without awaiting
that owner. A pending progress write or resource-removal storage claim can also
outlive the pump. The change adapts Invoke stop/join into the existing owners,
without a second queue, downloader or shutdown coordinator.

## Ownership and intended behavior

Main reads a copied, synchronous model close-impact snapshot before asking the
user. Active/preparing installs and an existing resource removal are described
alongside current Project/generation effects. Cancel performs no irreversible
model stop; work may naturally continue. New model mutations are refused while
the close decision/sequence is pending. After Cancel, that temporary Main guard
is released. Read-only status does not stop or cancel work.

After confirmed closing, coordinator shutdown synchronously closes admission,
prevents late preparation from enqueuing a new controller and stops dequeueing.
It cancels unfinished cancellable downloads/queued jobs, durably records terminal
state and awaits real downloader cleanup, preparation, explicit cancellation,
progress writes and storage work. Already committing publication finishes under
its existing commit owner; success wins. Failure keeps the shutdown boundary
unsettled or failed and SQLite open, allowing a later close retry. No new timeout,
partial-download resume or automatic retry policy is introduced.

GenerationAppShutdown starts both model and generation stop owners and awaits
both outcomes even when one fails. SQLite/context finalization follows their
settlement. The actual Main coordinator is supplied to this existing barrier,
including its will-quit fallback. Runtime setup already has an awaited operation
barrier and is not reimplemented. Project Save/Discard/Cancel remains the
existing close flow; earlier confirmed actions are not rolled back.

## Verification plan and boundaries

Use actual SQLite/repository/files with controlled nondeterministic validation,
transport and commit gates. Cover held preparation before/after row creation,
running plus queued jobs, real downloader body cancellation/cleanup, late
progress, overlapping explicit Cancel, committing success, storage mutation,
coalesced shutdown, refused late admission and durable failure/retry. A substantial
test must enter the real app shutdown boundary and keep SQLite usable until
installer settlement. Isolated omission of the model barrier must give an actual
early-close/durable-state RED with adjacent GREEN/restoration.

Native qualification uses actual built Electron Main/preload/renderer, real
coordinator/downloader/repository and synthetic tiny catalog bytes. A declared
copied-bundle capture exposes original lexical owners to the Main inspector;
it does not replace shutdown behavior and is not pristine/fused AppImage evidence.
Only token/source/DNS/HTTP and native dialog choices are controlled. Cancel must
leave the held download active; confirmed close must wait for cleanup and
durable rows, followed by normal physical exit/restart readback. Source/bundle
instrumentation, lower controlled ports and observed process lifetimes are
reported separately. No ML, actual model validity, live CivitAI, worker release,
clean-machine install or app-binary replacement acceptance follows.

Initial artifact inventory: protected root39GiB/shared23GiB/runs16GiB, free disk50GiB,
observed free VRAM14227MiB. No GPU work or ML/runtime/weights copies are required;
foreign processes remain untouched. Heavy checks are serial with bounded groups,
zero swap and600-second outer deadlines. Exact owned payloads are disposed only
after retention, physical exit and mutation restoration checks.

## Executed evidence

Root executed the dirty delivery over the base above:

- Focused coordinator/app-shutdown: **20 PASS**. Expanded neighboring model
  installation, Anima/upscaler group, download, repair/removal and Project close
  owners: **281 PASS**, no failures/skips,20.199s, peak822MiB, zero swap.
  Actual SQLite/repository/files and real ModelDownloader are retained subjects;
  validation, transport body completion and database error timing are controlled.
  Held real `ReadableStream.cancel` keeps the file/reader cleanup incomplete while
  the shutdown promise remains pending. Committing publication succeeds and keeps
  its verified managed bytes. A durable cancellation failure keeps admission
  closed and permits successful explicit shutdown retry.
- Required `pnpm run typecheck`, scoped ESLint for six changed code/test sources
  and `pnpm run app:build`: **PASS**. Build has the existing chunk-size advisory.
  Of42 rebuilt non-map consumers,41 are byte-identical to the previous retained
  package; only Main changes. Vue/prototype/preload sources and renderer bytes are
  unchanged, so the earlier320 browser results are not repeated or relabeled as
  this stage's execution.
- Native built Main: **3 selections =2 GREEN +1 intended semantic RED**,
  **six normal physical app lifetimes**. Each starts the real downloader for a
  declared256-byte fixture, writes two64-byte chunks and queues a second
  installation. Native close options include the
  model-work warning. Controlled Cancel leaves the downloader un-aborted, allows
  the next real chunk to enlarge its staging file, preserves the queued row and
  keeps the own saved Project open. Confirmed close waits for the actual held
  downloader cleanup with SQLite still readable and a new install refused.
- Healthy and restored first-close rows are **canceled/canceled**, staging empty;
  both remain canceled after normal restart. The copied mutant changes only
  `modelInstalls: installCoordinator` to null. Its first-close rows are actually
  **downloading/waiting**, with incomplete cleanup and staging still present.
  Existing startup recovery changes both to failed. The strict semantic assertion
  runs after both normal exits and retained witnesses: `false !== true` for
  canceled-cleanup settlement. No timeout/setup failure supplies the RED.
- Three own `.igs` files preserve exact bytes through closing/reopen. All **six
  retained SQLite stores** have30 exact migration name/hash rows and
  integrity_check=ok. Current-schema persistence is verified, not release upgrade,
  live CivitAI, ML validation or broad resource concurrency.

The actual source/live dist never mutate. Each isolated copied Main contains one
declaration-only lexical capture; the mutant additionally changes the one Main
dependency. Root removes those exact additions in memory and compares complete
bytes to the original, and checks every other copied dist member/package.json.
Existing node_modules are a read-only symlink, never a copied ML environment.
Token/provider/DNS/HTTP completion, native dialog choices and a forwarding
database-close observer are explicit controlled ports. This is **captured built
Electron evidence**, not pristine/fused AppImage or visual verification of the
platform dialog. Native source ports are restored on normal quit; actual process
identities/groups confirm exit, with no forced close counted.

Independent finite source review is CLEAN for coordinator, app barrier and Main
warning/admission. It reread Invoke stop/download-stop and callers, and ran no
tests/native or artifact inspection. Root runtime, byte and retention audits
remain distinct. Evidence lives at
`~/.codex/artifacts/imagegen-studio/runs/model-install-shutdown/20261115`;
source/delivery, source-only review, commands/logs, all controls, SQLite witnesses
and lifecycle/publication receipts are kept separately. Raw paths need archive
reconstruction after disposal; no historic resume is implied.

Retention compares all **5,180 remaining entries** against the archive before
disposal, including membership, kinds, modes, link text and every regular-file
hash. The archive is18,588,995 bytes; an independent read-only check confirms its
hash/header membership and all three captured Main consumers. Dependency symlink
targets are not copied or followed. Exact idle payload/temporary/cache removal
reclaims **100,405,248 allocated bytes** (about96MiB); shared resources and
unrelated runs remain intact. Compact evidence stays below32MiB; measured protected
root is about38.39GiB and free disk about47.23GiB. An initial retention wrapper
resolved source paths relative to systemd's default directory and failed its
guard before inventory/removal. Resolving them against the repository fixes that
setup error; the complete repeat succeeds. It is not a semantic RED.

Remaining mandatory app
update gates include signed app release/descriptor admission, compatibility,
complete install close preview (including recovered generation work outside open
tabs), final-byte handoff, recoverable binary replacement and upgrade/migration
qualification. Publisher URL/key remain unconfigured. No promise status is raised.
