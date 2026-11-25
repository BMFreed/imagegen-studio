# Queue Manager focus after deleting generation history

The built Electron app at `d943d9642080953679ef00613280a62be60a9e7b` reproduced
focus loss on private KDE Wayland at 900×620 and DPR 1. The fixture creates
three canceled generation jobs through the real SQLite repository. It borrows
the retained NoobAI V Project with an accepted Raster and pinned NoobAI EPS
frozen queue material. Runtime status is unavailable in this private profile.
The existing generation-action smoke covers queue cleanup with an unaccepted
candidate. This run exercises the keyboard and the accepted Project fixture.
[Queue Manager contract](../features/queue-manager.md) ·
[Generation-action smoke](../../scripts/smoke-generation-actions.mjs).

Real Wayland keys reached the Queue Manager and its Delete confirmation.
The confirmation started on **Keep history**, trapped Tab and Shift+Tab
and returned focus to the same row's Delete button on Escape. Confirming a
deletion removed the expected row. In all three cases, including deletion
of the last row, the browser focused `body` and displayed no visible focus
inside Queue Manager. All three app lifetimes closed normally. A cold start
confirmed the final empty history.

The inner modal can restore its previous target while the queue refresh is
pending. When the deleted button disappears that target is gone. The
renderer keeps the confirmation through the refresh it starts, then handles
the successful Delete when the inner modal leaves. If focus belongs to
the dialog surface, document body or exact removed Delete button, it
focuses the stable **Close Queue Manager** control. Another valid focus
target takes precedence, including when the app has lost desktop focus.
The presentation change uses the same mutation and persistence owners.

The rebuilt app passed all ten checks with the same controller and input
helper. After deleting with two neighbors, one neighbor, and an empty
remaining queue, **Close Queue Manager** had visible keyboard focus.
Before and after screenshots at the minimum window size confirm the focus
highlight. The safe initial focus, both trap directions, exact-row Escape
return and outer Queue launcher return passed again.

The accepted Project package and preserved NoobAI Raster provenance matched
the original bytes. The surviving queue rows and frozen input files matched
their first snapshot after the first deletion. Removing each row removed
its own frozen input. A cold reopen repeated the empty history and preserved
the Project. All three Electron lifetimes closed normally. The trusted
input run covers individual Delete.

Typecheck, focused ESLint, the application build and 250 queue and
controller tests passed with zero failures or skips. The broader
generation-action smoke stopped before its history scenarios. Its first
attempt expected a Project card immediately after closing the last tab.
Adding the explicit Home action to the diagnostic replay got past that
step. The controlled test runtime then reported `needs-repair`. The
smoke logs and the diagnostic patch are retained locally. The current
trusted input result does not qualify bulk menu keyboard behavior.

An independent audit rehashed the before and after build inputs, eight
closed SQLite bodies, exact accepted Project and frozen neighbor inputs.
It checked 107 trusted events, both isolated desktop exits and all six
normal Electron closes. The local runs are
`runs/generation-queue-keyboard/20261125-r1` and `20261125-r2`. They retain
before and after screenshots, source and build pins, database snapshots
and the accepted Project. Disposing the closed private profiles and scratch
directories reclaimed 14,548,992 allocated bytes.

## Generation-action smoke recovery

Studio base `14ec788c`. InvokeAI `64ff2c600f04d220e470fdaeec570bd402af42a7`
was reread in `app/api/routers/session_queue.py`,
`app/services/session_queue/session_queue_default.py`,
`app/services/shared/database/queries/session_queue.py` and
`app/services/session_processor/session_processor_default.py`. The queue
write and clear tests exercise actual queue persistence with controlled
processor dependencies. Studio's Electron smoke already uses this
boundary and adds Main/preload/rendered UI through the local wire peer.

At Linux startup the app sends the controlled peer the current
`imagegen_worker.owned_inference` command. The old fixture exited before
its ready line because it only recognized `inference_main`. The fixture
now follows the client test's exact Linux arguments, checks the parent PID
and canonical scratch argument, and declares the required Linux capability.
The CPU derivatives role retains its own command.

The first updated run reached candidate publication. It still assumed Home
was an open tab during result navigation. All Home transitions in the smoke
now use Open Home in the app chrome and verify that Home is active. This
preserves the navigation scenario even when the Project already closed Home.
The app, its worker client and the queue operations remain on the production
path throughout.

Two private KDE Wayland runs passed the full 36 checks. The final run
used the formatted script and rebuilt app. It reached the real Delete
and confirmed Clear flows with an unaccepted result and verified the
candidate resource, seed, draft and exact saved Project bytes. It also
covered frozen Retry, held CPU preparation beside active inference,
and accepted LoRA, VAE and embedding provenance. No page errors were
reported. Focused ESLint and the application build passed.

The Node peer provides controlled readiness and deterministic pixels.
The smoke qualifies Electron behavior and actual Main IPC and persistence.
It uses forced teardown for the last Electron lifetime. The trusted
keyboard runs above supply the normal-close evidence. The retained smoke
reports and screenshots are under `runs/generation-actions-restored`.
Three exact idle scratch directories totaling 7,102,464 allocated bytes
were released after their scopes exited.
