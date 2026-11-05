# Frozen regional initialization identity

## Boundary and source

High risk: worker transport and queue recovery/Retry. Base: `ab84b55d`,
the private Invoke initialization profiles. This slice binds that existing
initialization to an explicit private job; it changes no sampling algorithm.

Current InvokeAI source read at
`a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:

- `invokeai/app/services/session_queue/session_queue_common.py`,
  `create_session_nfv_tuples`: serialize the concrete invocation graph.
- `invokeai/app/services/session_queue/session_queue_default.py`,
  `retry_items_by_id`: validate the stored root graph and create fresh execution
  state from it, rather than recapturing the edited Project.
- `invokeai/app/api/routers/session_queue.py`: enqueue and Retry callers.
- `invokeai/frontend/webv1/src/features/nodes/util/graph/generation/buildSDXLGraph.ts`:
  concrete seed/dimensions/CPU-noise inputs.
- `invokeai/app/invocations/noise.py`, `latent_noise.py` and
  `invokeai/backend/util/devices.py`: CPU draws and runtime `noise_dtype` choice.

Studio reuses the concrete-snapshot/Retry mechanism through its existing
files-first, atomic-SQL queue. Invoke does not freeze the SDXL draw dtype in
the invocation graph: it reads runtime-global configuration. That is insufficient
for Studio's immutable Retry contract. This difference was disclosed before
introducing the explicit Studio field below; the numerical initialization
remains the previously qualified Invoke adaptation.

## Contract and owners

`RegionalWorkerInput.initializationProfile` optionally contains the sole literal
`invoke-cpu-f32-add-noise-v1`. It is independent of the four-field schedule-only
`IllustriousNoiseProfileV1`.

- Main synchronously detaches and validates the full input. An explicit profile
  requires `euler_a`; null, unknown versions and other samplers refuse.
- The existing owned-file bundle carries the literal unchanged. The Python
  parser validates it before model loading and selects the existing
  `ordinary-canvas-euler-ancestral-invoke-init-txt2img-cuda-fp16-v1` profile.
- The private frozen operation stores it both in `regional.json` and the outer
  queue payload. Reload compares them, including absence. Resource hashes alone
  cannot excuse a contradictory initialization identity.
- Recovery and explicit private Retry retain the complete frozen payload and
  copy the verified sidecars. Later authoring/default changes do not reinterpret
  the original attempt.
- `illustrious-regional-invoke-init-v1` is a separate worker capability. The
  real client checks it before preparing files; the processor independently
  checks each captured frozen input before resource verification/dispatch,
  including structural transports that bypass the real client.

Missing capability yields client `WORKER_VERSION_MISMATCH`. The existing
processor failure path records `GENERATION_INPUT_CHANGED`, no candidate or
receipt, and permits an exact frozen Retry with a supported worker. Retry has
no runtime owner and may create pending work; dispatch still checks capability.

Absence is never filled from today's settings. Direct private transport keeps
its historical Euler and Euler-a selectors. Historical private queue jobs
remain Euler-only; explicit new initialization adds only the private
Euler-a operation. Public `invoke-canvas-v1` queue admission and frozen parsing
reject the new field and stay Euler-only. No renderer setting, public default,
ordinary request schema, dispatcher command, database migration, installed
runtime upgrade, provenance or Anima policy is added.

Existing bounds remain: 64 KiB wire descriptor, 1 MiB bundle/sidecar metadata,
128 KiB frozen payload, 64 MiB raw alpha, 32 MiB target; one request and output,
existing geometry/text/resource/mask/step limits. No new arbitrary size ceiling.

## Verification

ROOT execution and independent source review are reported separately. Compact
records live under artifact-relative
`runs/regional-guidance-init-transport/20261105-frozen`.

- Main focused queue/client and neighbors: 166 PASS. Eighteen new selections
  exercise real migrated SQLite, filesystem snapshots, restart, Retry,
  corruption refusal, public isolation and a real JSONL child with fake ML.
- Additional ordinary/Anima queue, staging, orchestrator, public regional and
  capability neighbors: 211 PASS. Main total: 377 distinct passing selections.
- Python parser/dispatch, worker, existing native CPU/CUDA initialization and
  inference boundary: 132 PASS, 164 warnings, no failures/errors/skips.
  Eighteen new cases replace loading/output explicitly; the existing native
  profile tests retain original native computation.
- Separate real Main queue → restart/Retry → owned transport → original Python
  parser bridge: two PASS (explicit Invoke and historical Euler). It observes
  the exact selected existing execution profile, with no model loading.

- Final `pnpm run typecheck`, full configured basedpyright (0 errors/warnings/
  notes), scoped ESLint/Ruff/format/diff checks PASS. Python typing diagnostics
  were fixed with type annotations/casts; no assertion or input was weakened.
- Isolated Main mutation removes only sidecar/outer initialization agreement:
  2 GREEN → 1 semantic RED + 1 historical control GREEN → 2 restored GREEN.
- Isolated Python mutation drops only the explicit initialization argument at
  dispatch, selecting the valid old profile: 6 GREEN → 2 semantic RED +
  4 legacy controls GREEN → 6 restored GREEN. Source import path/hash fences
  prove the mutated module is consumed. Both snapshots and live code restore
  exactly. These 24 executions repeat eight already counted selections.
- Independent source-only review: CLEAN against the frozen 1,475-member source
  archive, all 13 implementation/test files and current Invoke callers.
  The reviewer did not rerun ROOT execution or certify installed behavior.

Diagnostic attempts remain excluded: installed dependency Python had no pytest;
the existing development test runtime was used without installing/copying an
environment. Initial isolated Main launch through pnpm tried its dependency
check and aborted before tests (`NO_TTY`); the qualified rerun invokes the
existing Node/tsx entry directly. Both owned groups physically exited and
source restoration was verified. No setup failure counts as semantic RED.

Compact source archives, commands, bridge reports, mutation before/after bytes,
patches, logs, JUnit and resource reports are retained. All 1,475 disposable
source files byte-match the retained qualification archive; the dependency
symlink was not followed. After 19 physical-exit reports, source restoration,
incoming-dependency and all-reader checks, the owned mutation copy was removed.
Shared runtimes/model files and the linked workspace dependencies are protected.

## Limits and next owner

This closes explicit private transport/frozen-job identity, not a production
default switch. The installed worker is deliberately unchanged. Installed
Main → current worker → real trained output qualification and any public
sampler/default promotion remain separate. No fresh trained image or visual
assessment is claimed. Previous visual evidence stays 3 PASS / 1 INCONCLUSIVE,
NOT_QUALIFIED; PP-001/007/008 remain **«Пока не обещать»**. Smart target-only
permissions, existing public Euler behavior, frozen-work independence, and
Regional provenance/Compare/result-derived-preset exclusions remain intact.
