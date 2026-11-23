# Manual SQLite recovery through stock AppImage startup

The [startup backup checkpoint](./phase-5-database-migration-backup-research.md)
restored a selected database through the real initializer. The
[installed historical AppImage checkpoint](./phase-5-packaged-installed-historical-upgrade-research.md)
upgraded a schema 29 profile and saved a Project across native launches.
This follow-up exercises the documented operator copy and the resulting
cold startup in a private profile.

Studio base `a27d4150b6d5376917ffbe2f4aee847fa8af2757` and clean InvokeAI
`4875d96531ca6712b288f6e660fcbb34143408c1`.
`docs/src/content/docs/start-here/upgrading.mdx` describes the manual
procedure. Stop all users of the database, preserve the current SQLite
main file and its companions together, and copy the chosen backup while
retaining its original. Starting the current version again applies the
pending migrations. In
`invokeai/app/services/shared/sqlite_migrator/sqlite_migrator_impl.py`
the startup migrator uses an independent backup before it applies SQL.

The AppImage uses Studio's existing Main initializer and manual copy
contract. The harness owns the isolated profile and the operator steps.
It checks the selected backup, the displaced newer state and the saved
`.igs` separately so a current database reopen cannot hide missing WAL
data or changes to the Project file.

## Native result

Run `20261123-r1` used the stock AppImage with SHA-256
`478292110072a8ae74113f9bcdb789be3064eff8f952b60bcd8e54320ede19a6`.
The private seed used the first 29 repository migrations, one saved
Project and a pre-upgrade metadata marker. The first startup retained
all 29 installed names and hashes, applied migration 30 and wrote a
schema 29 backup.

After the first normal close, a bounded test process committed a second
marker with SQLite WAL and exited without a checkpoint. The operator
step moved the 368,640-byte main file, 8,272-byte WAL and 32,768-byte SHM
into one separate directory under matching filenames. The second marker
was readable with a copy of the trio. The immutable main alone held the
pre-upgrade marker. The raw set-aside files kept their bytes and identity.

The test chose the original pre-migration backup despite a separate
decoy with a later filename and schema 30. It copied the chosen file to
`app.sqlite` with mode `0600` and witnessed a distinct inode and exact
bytes. The chosen original and the decoy both survived. The second app
startup applied migration 30 again and created another private schema 29
backup. Both upgraded profiles retained all 24 historical table
definitions and rows, adding the new migration and its empty strict
table and index. The expected Home workspace scan updated only the
saved Project's index timestamp among existing rows. The post-upgrade
marker stayed in the set-aside WAL, while the recovered database retained
the original marker.

The saved Project appeared in Home in both lifetimes. Its file bytes
and inode remained exact. The two AppImages closed normally. The
private X11 scope finished in 8.575 seconds with a reported 1 GiB peak,
a 4 GiB cap and zero swap. This verifies the manual procedure followed
by forward migration in the current AppImage. Native compatibility
with older AppImage versions remains a separate boundary.

All 20 focused database tests passed with zero failures or skips. The
AppImage build, scoped ESLint, formatting and syntax checks passed.

An independent read-only audit verified the AppImage, its ASAR, 42 built
files, 49 build-source pins, 45 runner-source pins and 44 owned files. It
confirmed all 18 enrolled process identities exited. Reconstructing the
two checksummed WAL frames in memory recovered exactly the expected marker.
After the audit, cleanup removed eight idle test directories and reclaimed
571,965,440 allocated bytes. The run retained the three raw database files,
the backup and Project copies, logs and receipts. All 83 files sealed before
cleanup matched afterward. The borrowed Xvfb package remains registered in
the parent run.
