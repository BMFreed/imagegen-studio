# Phase 2B: target composition in the qualified inference worker

Base: `f72c005`, clean `master`. Risk: high at the TS/Python subprocess,
filesystem and frozen-target boundary. Sources:
[PP-007](../product-promises.md#pp-007-проект-принадлежит-пользователю),
[PP-008](../product-promises.md#pp-008-генерация-меняет-проект-только-по-явному-решению),
[Generate actions](../features/project/generate-mode/generation-actions.md),
[worker ownership](../specs/05-worker-protocol.md),
[previous preview checkpoint](./phase-2b-dynamic-preview-research.md).

## Confirmed missing boundary and selected scope

RuntimeManager owns an app-activated Linux/NVIDIA environment and one exclusive
inference lease. Its installed worker entry accepts only generation requests.
ProjectService's frozen-target preparation requires composeTarget; that transport
is currently available only in the development derivatives worker. Existing
protocol parsing and Python compositor already support this command, including
real alpha mode, source hashes and pinned sRGB output. The inference client cannot
use that operation or verify its response. Therefore merely exposing Generate
would leave preparation dependent on the development worker.

The selected prerequisite extends the same qualified inference child with
`target-composition` and a typed composeTarget operation. Reuse the existing
Project compositor and TS target validation; do not start another Python child,
produce pixels in main, relax startup qualification, change worker version or
call the development worker in packaged code. A caller holding the existing
runtime lease will be able to pass that same client to ProjectService preparation
and then to inference; both operations stay serial and close has the same owner.

Alternatives considered: a separate installed derivatives child requires another
exit/activation owner, while building a transparent target in main breaks worker
image ownership and cannot derive modes from raster pixels. Neither is needed.
This slice does not add Generate IPC/UI or automatic drain: queue status/current
cancel and Keep/Discard replacement still need one production controller; the
prototype cannot supply those boundaries. No new product decision is needed.

## Data path and invariants

RuntimeManager live qualification → one GenerationWorkerClient → typed
compose-target JSONL → strict existing Python parser → real compositor/file →
correlated target-done → shared TS path/hash/ICC/geometry/alpha verification →
ProjectService frozen target/normal preparation. Main owns staging/source paths;
worker cannot return an arbitrary file. Opening Project or target preparation
never creates queue rows, accepted layers, provenance, dirty history or Save.

The existing derivative client keeps the same shared target validation. New
request handling must retain request ID/type isolation, byte envelope, deadline,
serial request exclusion, caller snapshots before awaits, response verification
and confirmed child exit. A composition response cannot satisfy a generation
request or vice versa. Missing capability refuses explicitly before writing a
request; older inference workers remain usable for their existing generation
capability. Protocol/output mismatch closes the transport. A correlated worker
request error also closes this inference client under its existing failure policy;
correction requires a fresh qualified lease, not reuse of the failed child.
No hidden target/output reuse.

## Parameter register and refusal

| Parameter           | Existing source/value                                             | Refusal/recovery                                                                 |
| ------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Wire                | Protocol 1, worker 0.2.0, linux-nvidia; additive capability       | Existing startup checks unchanged; missing target capability refuses composition |
| Line                | 64 KiB JSONL                                                      | Serialized request refuses before send; oversized response closes                |
| Target              | Side 2,048, 4,000,000 pixels, 32 MiB PNG                          | Existing shared target/PNG verifier; no relaxation                               |
| Composition sources | 256 layers, 64M pixels/source, 128M total, 256 MiB/source         | Existing shared bounded validators; source path/hash/image checks before request |
| Color and alpha     | Pinned sRGB ICC, RGBA and worker pixel-derived mode               | Re-read and verify actual bytes; declared mode cannot override alpha             |
| Deadlines           | Existing inference startup 120s/request 30min and close 2s policy | Timeout or malformed protocol closes; runtime owner retains unconfirmed exit     |

Do not infer GPU throughput, Anima/LoRA/advanced/img2img support, runtime installer
readiness or user-facing Generate from a target-composition test.

## Verification plan

Obtain a missing-behavior RED for the new real transport entry and Python route
before implementation. Tests use the actual client (real child process with a
controlled transport peer) and strict output verifier; the peer is substituted,
not client/path/PNG validation. Python tests call the real inference request
entry/parser/compositor and read actual output PNGs; only ML startup/generation
is substituted, so no CUDA result is claimed. Cover transparent/partial/opaque
mode, sources changed/missing, output metadata and pixels tampering, wrong ID/type,
capability refusal, concurrent compose/generate, close, and request capture.
Keep existing generation and development-derivative control tests.

A real ProjectService integration passes the new inference client's composeTarget
into frozen preparation, verifying bbox/draft/bytes are retained without document
mutation. Use an observable request/completion witness before assertions. Execute
an isolated semantic mutation of output mode/pixel checking and restore green.
Run app tests, Python scoped controls, typecheck, lint, build/native smoke and
scoped formatting/link checks. No prototype UI changes are planned.

## Implemented boundary and review

`GenerationWorkerClient.composeTarget` now uses the same child, serial admission,
JSONL envelope, deadline and confirmed close as `generate`. The shared
`composeTargetWithTransport` snapshots caller state before its first await and
owns the existing source/path/output checks. Pending requests carry their expected
completion type; composition cannot complete a generation request, or the reverse.
The Python entry advertises the additive capability and routes the existing
strict command to the real compositor. Generation qualification/unsupported-input
refusal is unchanged; the default derivatives entry remains derivatives-only.

This is source-aware self-review of the dirty tree based on `f72c005`, not a blind
review of a finished GPU flow. A focused second reader checked the mixed-response
path and filesystem/lifecycle invariants. An initial concern about recoverable
Python errors was withdrawn after checking the explicit existing inference
failure policy: worker errors close the client; local pre-send validation does not.
A future caller must reacquire a qualified lease after worker failure. No remaining
concrete blocker was found in that focused review; its scope did not include
unimplemented UI scheduling or packaging.

## Executed evidence

The Python missing-route RED was also reproduced against an isolated copy whose
`inference_main.py` alone was replaced by the `f72c005` version. Import origins
point to that copy: 7 failed, 2 passed, including the existing generation-error
correlation control. Checkout and venv were unchanged. Current route plus scoped
controls are green as recorded below.

| Invariant / boundary                | Actual check                                                                                                                                                                                                | Result / limitation                                                                                                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing production target operation | New actual client starts the exact isolated inference command, then calls composeTarget before implementation                                                                                               | RED: missing-method failure, 1 fail; controlled peer, no CUDA startup                                                                                                         |
| Mode and source/output integrity    | New TS client suite reads actual transparent/partial/opaque RGBA PNG; refuses false alpha/hash/ICC/rect/dimensions, changed/missing sources and unsafe/preexisting outputs                                  | 11 tests green, also included in full app run; Python/GPU peer substituted, validation is real                                                                                |
| Request/lifetime isolation          | Real child witnesses exact request IDs/types, two-way busy refusal, capability-before-send, old generation control, close and timeout/error                                                                 | Actual child PID is gone after close (ESRCH); subsequent operation is CLOSED; malformed output cannot become a result                                                         |
| Input snapshot and no publication   | Real ProjectService import/open, SQLite/shadow/.igs and prepareNormalGenerationInput with this client; user edits after witnessed request do not alter prepared target/draft                                | Saved bytes stay identical; preparation creates no queue row, accepted layer or history edit, preserves the later user edit/shadow and cleans target scratch                  |
| Python routing/composition          | Existing strict parser → real inference request entry → Pillow compositor, actual PNG/pixels/ICC/hash/rect, changed/missing sources and preexisting output refusal; generation correlation control retained | 36 passed, 1 existing Compel parser test skipped because optional inference dependency is absent; no CUDA/runtime-ready proof                                                 |
| Test sensitivity                    | Isolated copy removes only rejection of reported mode differing from real alpha                                                                                                                             | RED: 1 fail for false-alpha, 10 neighboring controls pass; exact helper restored, 11 pass; live source hashes unchanged                                                       |
| App regression                      | pnpm run app:test, typecheck, lint                                                                                                                                                                          | 604 passed, zero skips; both typecheck and lint passed                                                                                                                        |
| Native regression                   | Rebuilt app:smoke, final command exit 0                                                                                                                                                                     | Home/Manager IPC, Save/reopen/recovery, imports, draft/native-close, candidate export/discard and early Add/Undo/portable Save; no Generate or newly packaged inference claim |
| Static checks                       | Scoped Python basedpyright, Ruff check/format; changed TS/Markdown Prettier, git diff check, local docs links                                                                                               | No Python errors/warnings; scoped formatting and 209 local docs/code links passed                                                                                             |

The first full app run exposed a test-harness assumption, not a production close
requirement: a peer's SIGTERM callback marker might not be written when EOF ends
the process first. The close test now witnesses the actual request/PID and checks
OS exit instead of requiring one termination mechanism. Final full app run has
604 passes. The first native Results run timed out on a Recovery dialog click;
an unchanged-build, isolated Results retry passed with zero page errors. A later
full run read an empty OS clipboard immediately after the renderer reported Copied.
The native smoke now polls the actual system clipboard for the exact expected text
before restoring it; it does not substitute clipboard content or weaken the
assertion. Final rebuilt app:smoke passed desktop, Results and acceptance scenarios
with zero page errors. Initial failure logs are retained with final evidence. The first mutation copy lacked the
Adobe RGB fixture and is not counted as a semantic RED; after copying the unchanged
fixture, the required false-alpha assertion is the observed failure.

Local logs, mutation patch, baseline/source hashes and provenance of substituted
boundaries are archived under
`/home/user/.codex/artifacts/imagegen-studio/inference-target-2026-09-30/`.
This directory is outside the repository; see its README and command logs rather
than treating the presence of test files as run evidence.

## Remaining next boundary

Connect one main-owned Generate controller to draft flush, immutable Project/model
capture, the live runtime lease, prepared batch publication and worker dispatch.
That controller must expose total pending/running queue state and scoped current
cancel, implement confirmed Keep/Discard replacement without losing recovered
candidates, and settle or refuse uncommitted bbox edits. Results sibling IDs are
not a total queue count; prototype queue/replacement state cannot be used as
production truth. Images-per-click remains transient UI state and must not dirty
or block Save. Automatic drain, installer/repair, remaining inference conditioning
and the phase 2B real-installed-model exit check remain separate open work.

No new product decision is needed for this prerequisite. It prepares the existing
frozen Canvas contract; it does not announce Generate, release inference or MVP
completion.
