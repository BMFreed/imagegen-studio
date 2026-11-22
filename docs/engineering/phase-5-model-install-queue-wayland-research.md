# Model install queue keyboard on KDE Wayland

The [X11 focus fix](./phase-5-model-install-queue-keyboard-research.md)
passed Chromium keyboard input through CDP. This follow-up uses a fresh
AppImage and the same three finished jobs and exact IllustriousPhoto
embedding. A private KWin session supplies real Wayland keyboard input
through the [persistent input helper](../../scripts/fixtures/packaged-wayland-keyboard.c).
CDP observes the packaged renderer.

Studio package base `14624fa8a1be7d4a41a32bc874eba4afb9b47421`.
The AppImage SHA-256 is
`0c2f717e628ad9f7b73e7846350db3f367acd9ad9a7eeaf0dc602794a930a89b`.
Independent extraction verified the ASAR, 42 compiled files and 20
package source pins. Those files match the previous fixed X11 package.
The current Invoke checkout `4875d96531ca6712b288f6e660fcbb34143408c1`
was reviewed under `invokeai/frontend/webv2/src/features/models/`.
`ui/ModelManagerView.tsx` includes
`ui/install-queue/InstallQueueBar.tsx`, which calls the prune owner in
`data/api.ts`. The adjacent queue table and job-action hook were also
reviewed. This trial exercises Studio's existing cleanup and focus flow.

## Private credential environment

The first attempt stopped at the run-directory name guard before AppImage
startup. The next two attempts reached a fresh KWallet prompt and timed
out before keyboard input. The second of these selected libsecret and
disabled the separate Electron portal provider, but the host's private
Secret Service still activated KWallet. Those attempts have no completed
keyboard result or normal close receipt.
[Electron 44.4.5 providers](https://github.com/electron/electron/blob/v44.4.5/shell/browser/browser_process_impl.cc#L442-L495)

The passing Wayland scenario explicitly exercises the app's secure-store
unavailable state. Its AppImage child selects `basic_text` and disables
the separate portal provider. The real API must report the exact
`basic_text` refusal. The Retry dialog shows the token requirement,
leaves Fetch disabled and has no token form in this state. The ordinary
X11 scenario retains the missing-token control. Native KDE first-run
wallet setup and token storage remain separate release checks.

## Results

Wayland run `20261123-r4` recorded 70 trusted keydown events at 1380×900,
DPR 1. Five focus checks passed. Escaping Retry and activating Cancel
each returned focus to the Retry button. Clearing the last jobs moved
focus to Back to models. Activating it focused the persistent search
input. Escape from Model Manager returned focus to Home's Manage Models
button. The screenshots show the accented Back to models text and the
search border in their focused states.

After two normal closes the independent audit verified all 20 application
process exits, three closed SQLite bodies, the managed and borrowed
49,736-byte embedding, and the staging neighbor. Only the three finished
jobs and their three artifact rows were removed. The databases after
clearing and after the cold reopen matched byte for byte. The 4 GiB,
zero-swap scope finished in 14.465 seconds with a reported 1 GiB peak.
KWin reported an EGL initialization error and continued through the
native Wayland frame and input checks.

X11 run `20261123-r5` passed all five focus checks, two normal closes and
the same preserved state with the missing-token control. This check
covers the tested keyboard and focus transitions. Screen readers and
the wider shipping desktop matrix remain open.

The focused Model Manager and install-history tests passed 19 cases,
with zero failures or skips. Typecheck, AppImage packaging, scoped
ESLint and syntax checks passed. The run retains screenshots, key traces,
closed SQLite snapshots, process exit records and package receipts.
Disposing the inactive private profiles, build payload and transient
Anima check cache released 1,395,695,616 allocated bytes. The cleanup
rechecked 199 retained files by hash.
