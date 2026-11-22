# Keyboard focus in the Model Manager install queue

Studio base `392d8a03a2bc45258573aeacb44f3a5a817a5bf4`.
The [Model Manager](../features/model-manager.md#install-queue) flow enters
the queue from Home, reviews a failed job, clears its history, returns to
the catalog and closes the manager. The existing IllustriousPhoto fixture
provides three terminal jobs and one verified installed embedding.

## Observed at 1380×900

Run `20261122-r2` used an unmodified application build on isolated X11.
Chromium keyboard input through CDP opened Home's Manage Models and the
install queue. Escape and Cancel in the Retry dialog returned visible
focus to the original Retry button. Escape from Model Manager returned
visible focus to the Home Manage Models button.

After Clear finished, the focus owner was `BODY`. The clear button
became disabled while it was focused, and remained disabled after the
last entries disappeared. Back to models also left focus on `BODY` when
the queue action was removed. Both states were visible in the screenshots
and failed the fixture's focus assertions after its two normal closes
and database checks finished.

## Renderer change

Clear finished uses Naive's guarded loading state while the request and
queue refresh are pending. If the action still owns focus when it becomes
unavailable, focus moves to Back to models before Clear is disabled.
Focus that moved during the request takes priority. Back to models focuses
the persistent search input through Naive's public input API.

## Corrected AppImage

Run `20261122-r3` passed all five focus transitions with the original
keyboard scenario. Back to models showed the Naive accent in focused
text. The search input showed a visible border and highlight. Retry's
two dismissal paths and Home's launcher passed in both runs.

Both AppImages completed two normal lifetimes. In each run all three
terminal jobs and their three artifacts were removed, and the two
post-clear SQLite snapshots matched byte for byte. The exact embedding
and staging neighbor survived. Independent audit verified all four
closed database readbacks in each run, both packages and their ASARs,
the managed and borrowed embedding bytes, screenshots, source pins and
process exits. Among the pinned application sources, only
`ModelManager.vue` differed between the packages.

The fixed AppImage SHA-256 is
`57ea2623ef5838f00cd036e78883148efae72913c2d84a8442be731d0e917dac`.
Typecheck, app build, AppImage packaging and scoped lint passed.
The focused `app:test` subset passed 19 tests with zero failures or
skips. The keyboard results are for the tested X11 viewport and
Chromium input path.
