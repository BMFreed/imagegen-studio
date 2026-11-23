# AppImage startup recovery of committed Project deletion

Studio base `4fc0222d28f2ad71faedfd8602cd5e83a9d96b27`. This adds a
packaged consumer for the existing
[Home Trash contract](../features/home-screen.md#app-managed-trash).
The previous [AppImage Trash check](./phase-5-packaged-project-and-preset-research.md#home-trash)
covered ordinary deletion, Restore and cold restart. This case starts
with committed deletion records and leaves the packaged startup owner
responsible for recovery.

## Source and authority

The local InvokeAI checkout was clean at
`4875d96531ca6712b288f6e660fcbb34143408c1`. The source read included
`invokeai/app/api/routers/images.py::delete_image`,
`invokeai/app/services/images/images_default.py::delete`, and
`invokeai/app/services/image_files/image_files_disk.py`'s `start`,
`begin_delete`, `commit_delete`, `__commit_pending_delete` and
`__recover_pending_deletes`. `invokeai/app/api/dependencies.py` creates
`DiskImageFileStorage` and the `Invoker`. `invokeai/app/services/invoker.py`
starts storage services before the queue processor.

Invoke writes the purge intent before the record is deleted and performs
the purge after that commit. Startup consults its record store and
persists the affected directories before retiring the journal. Studio's
[existing adaptation](./phase-4-project-trash-research.md) records the
positive authority in SQLite and binds it to frozen source and parent
witnesses. Main awaits `ProjectService.initialize`; it recovers committed
deletes ahead of the workspace and index scan. The packaged case uses
that startup path without introducing a recovery implementation.

## Prepared cuts

The fixture uses real `ProjectSession`, index and Trash owners in a new
private profile. The cuts cover committed authority with the exact file
still present, after unlink but before final retirement, and with a
different valid `.igs` at the same canonical path. Ordinary Trash and an
unrelated active Project are neighboring controls. The AppImage reads the
closed profile and exercises the real Home and Trash readbacks through
two cold launches.

## Executed evidence

The first fixture run stopped before AppImage launch at an incorrect
expectation of five explicit identity bindings. Newly created paths
use derived keys. R2 corrected the fixture assertion, seeded a new
private profile and reused the identical AppImage. Its SHA-256 was
`87b4800b73156d60b789bc3a36c71be7bea18cef2a362223592f8c0d4e97947c`.

The after-unlink cut reached the store's pre-finalization hook. The
real store had already performed the owned unlink and synchronized its
parent. R2 then finalized that commit and the commit whose exact file
was still present. Both keys were retired. The valid replacement, the
displaced original, the file in ordinary Trash, the active neighbor and
a neighboring text file kept their exact witnessed bytes. Home showed
only the active neighbor. Trash showed the ordinary item and the
unchanged pending operation with the changed-file diagnostic. Restore
returned `PROJECT_TRASH_DELETE_PENDING`. The Retry Delete dialog opened
and closed with the same reason displayed.

Both AppImage lifetimes closed normally. The SQLite comparison removed
exactly the two completed lifecycle rows and added the two retired keys.
The replacement received no identity binding or active index entry.
Across startup reads, the remaining changes were the pending diagnostic
and its timestamp and the active neighbor's index timestamp. The live
scope peaked at 980,267,008 bytes under its 4 GiB limit with zero swap.
The independent audit checked four closed database readbacks, the owned
and prepared `.igs` files, the AppImage and embedded ASAR, and both
physical process exits.

Typecheck, app build, AppImage packaging and scoped lint passed. The
focused selection passed 82 tests with zero failures or skips. Removing
the actual `ProjectService.initialize` recovery call in an isolated
source copy left the committed file on disk. The existing startup test
failed its expected absence check and passed after exact restoration.

## Explicit Retry after restoring workspace permissions

The follow-up used Studio base `8bcba3bdba1af783973e4ab798a984771421904e`
and the clean InvokeAI revision `4875d96531ca6712b288f6e660fcbb34143408c1`.
The current Invoke callers remain
`invokeai/app/api/routers/images.py::delete_image`,
`invokeai/app/services/images/images_default.py::delete` and
`invokeai/app/services/image_files/image_files_disk.py`'s commit and
startup recovery. The fixture uses Studio's existing committed-delete
owner and its Retry Delete action.

The AppImage recovered the two original startup cuts. A third committed
Project lived in a separate private workspace. Its parent was searchable
but lacked write permission at mode `0500`. Startup kept the exact file
and the original committed authority, including trash and deletion IDs
and parent and file witnesses. Restore returned `PROJECT_TRASH_DELETE_PENDING`.
The fixture restored mode `0700` on the same parent while the first
AppImage was open and activated **Retry Delete**.

Only the intended Project disappeared from the restored directory. The
replacement, displaced original, ordinary Trash item, active neighbor
and sentinel kept their exact contents. Two normal closes and a cold
reopen confirmed three retired keys and the two remaining Trash
records. Four SQLite readbacks passed integrity and foreign-key checks.
The final profile database matched the retained after-reopen body.

The independent audit verified 12 files, 42 compiled ASAR members,
21 application source pins, 23 runner source pins and all 18 enrolled
process exits. The native scope ran for 11.513 seconds with a reported
1.3 GiB peak, a 4 GiB cap and zero swap. All 82 focused tests passed
with zero failures or skips. AppImage packaging, scoped ESLint,
formatting and syntax checks passed. The raw build and private test
profiles released 571,797,504 allocated bytes after retention. Closed
databases, source pins, project copies and screenshots remain available.
