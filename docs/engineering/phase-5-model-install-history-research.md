# Clear finished model installation history

The [Model Manager contract](../features/model-manager.md#install-queue)
defines a bulk action for completed, failed and canceled jobs. Studio base
`0c1c2f792da4fa1fb0fffb8550554e1be76d42a8`. The donor checkout was clean at
`4875d96531ca6712b288f6e660fcbb34143408c1`.

- `invokeai/frontend/webv2/src/features/models/ui/install-queue/InstallQueueBar.tsx`
- `invokeai/frontend/webv2/src/features/models/data/api.ts`
- `invokeai/frontend/webv2/src/features/models/data/installsStore.ts`
- `invokeai/app/api/routers/model_manager.py`
- `invokeai/app/services/model_install/model_install_default.py`
- `invokeai/app/services/model_install/model_install_common.py`

Invoke's queue bar calls `pruneCompletedModelInstalls` and applies the
returned IDs before refreshing. The router calls `prune_jobs`, which
selects terminal jobs under the install condition and preserves the rest.
Its terminal set is completed, error and canceled.

Studio's Main coordinator selects terminal job IDs, excludes jobs with
live controllers or pending terminal updates, and joins admitted
cancellation and preparation acknowledgments. A job finishing during
this operation can be cleared on a subsequent action. The repository
deletes only the selected terminal IDs in one SQLite transaction and
returns the rows actually deleted. The existing foreign key cascades
from job history to install artifacts. Installed versions, managed files
and Project references have their own owners.

Clear is tracked through the installer shutdown barrier. The control
applies returned IDs, invalidates any older queue read, and refreshes
from Main. One active download can continue while old history is cleared.

## Verification

Four Main scenarios used real SQLite, repository and coordinator owners.
The all-status scenario cleared completed, failed and canceled jobs
while a controlled download continued and later completed. Waiting and
verifying rows and their artifacts survived. Additional scenarios held
publication after its SQL commit, held the Cancel acknowledgment, and
began shutdown during an admitted clear. A different job finishing
after candidate selection remained in the queue.

The focused suite passed 266 tests with zero failures or skips. Typecheck,
scoped lint, app build and AppImage packaging passed. In isolated source
copies, deleting the publication ownership filter removed a still-owned
job, and removing the Cancel join left Cancel without its terminal row.
The corresponding Main assertions failed in both mutations and passed
again after restoring the exact source bytes.

The freshly built unsigned AppImage passed run `20261122-r1` on an
isolated X11 desktop. A prepared profile contained three terminal jobs,
their artifacts and a verified 49,736-byte IllustriousPhoto embedding.
The UI action removed exactly the three jobs and their three artifacts.
The empty action returned an empty result. The catalog identifiers,
embedding bytes and neighboring staging file stayed intact. The two
lifetimes closed normally and their closed SQLite bodies matched with
SHA-256 `597102d2546dd94e45600ef33f3cb8b737b7760542ad642c462e1e2f119692c1`.
The AppImage SHA-256 was
`b98d7f5ecfd93c85aaf6790b8550a28deb62553fd3b98429890dcb6503a12b87`.
An independent byte audit verified the AppImage and ASAR, four closed
SQLite readbacks, the embedding, the staging neighbor and both exits.

The native case exercised prepared terminal history. The active transfer
and timing controls ran through the production Main owners with a
controlled provider response.
