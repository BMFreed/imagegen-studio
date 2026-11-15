# Native qualification of the reviewed runtime and LaMa

Base: `4f22daa8b4b576e752b87bf852e8c8737433c2f4` on `master`.
Risk: **High** — authenticated executable inputs, multiple installed runtime
slots, native CPU/CUDA processes, shared-resource publication, activation and
rollback. Supporting contracts: [runtime management](../specs/07-python-runtime-management.md),
[PP-001](../product-promises.md#pp-001-понятный-интерфейс-вместо-собираемого-workbench),
[reviewed engine composition](./phase-5-engine-lama-composition-research.md),
[full offline Python qualification](./phase-4-runtime-offline-full-research.md),
[transport extraction](./phase-4-runtime-release-extraction-research.md),
[artifact lifecycle](./artifact-lifecycle.md), [research protocol](./research-protocol.md)
and [review protocol](./review-protocol.md).

This note records fresh source research, the finite qualification design and
Root's execution record below. Source authoring, source review, actual native
execution and Root self-audits are separate evidence. Public promise statuses
remain unchanged.

## Expected result and the remaining boundary

The existing Main engine review already binds an exact local expanded release
to its signed cached transport and the pinned LaMa installer. Its planner keeps
cached source bytes separate from an installed runtime slot. Its explicit
Install/Repair operation consumes the reviewed auxiliary plan, verifies LaMa,
then uses the existing runtime assembler, worker qualification and pointer
controller. Late auxiliary failure follows the existing rollback path.

The preceding composition checkpoint used a real LaMa file and real resource,
review/token and pointer owners, with controlled runtime assembly and worker
ports. That demonstrates the composition boundary; it does not establish that
the complete installed Python closure and native workers cooperate with it.
Earlier successful full Python-slot qualification omitted LaMa and had a
different signed fixture. Neither result can be relabeled as the new combined
native execution.

The new finite profile is `--profile full-engine` in the maintained
`scripts/qualify-runtime-offline.mjs`. It adopts the existing signed transport,
extracts it through the existing owner and exercises the production aggregate
review and native installation path. The default two-wheel CPU/refusal profile
and existing `full-inference` profile remain separate preserved consumers.
There is no new installer, worker, queue, sampler or pointer wrapper.

## Fresh Invoke implementation and callers

The local Invoke checkout was reread clean at
`4875d96531ca6712b288f6e660fcbb34143408c1` for this stage:

- `invokeai/app/services/model_install/install_staging_ledger.py:114–150`
  publishes complete no-replace claims with Linux process-start identity;
  `HeldClaim:321–347` releases its owned claim. `_write_marker:189–219` writes
  synced temporary metadata and atomically replaces the marker, followed by
  directory sync. Persisted staging at452–485 and `create_staging:611–678`
  retain source/revision identity and recovery ownership. Actual installation
  callers are `model_install_default.py:293,2138–2182`.
- `model_install_default.py:987–1138` claims a destination before transferring
  and protects recovery data until registration. Rollback refuses to overwrite
  a recreated source or erase unrecognized destination artifacts. The installer
  worker and callers at1716–1857 settle the operation before releasing staging
  ownership. These are model-resource transactions, not a managed-Python
  runtime-slot implementation.
- Cancellation API `invokeai/app/api/routers/model_manager.py:1206` delegates
  to `model_install_default.py:1267–1295`. Active file transfer refuses unsafe
  cancellation; `_discard_cancelled_staging:308` is called only after callbacks
  stop using staging. `download_default.py:821` similarly finalizes a composed
  download's cancellation after its active part has stopped touching disk.
- `invokeai/app/invocations/infill.py:130–143` supplies the fixed shared LaMa
  source and calls `context.models.load_remote_model`. That caller in
  `invocation_context.py:800–824` obtains the shared cached resource and then
  loads it. `model_install_default.py:1549–1603` serializes same-source cache
  downloads and rechecks after locking. Its unhashed first-entry cache fast
  path cannot replace Studio's exact source/resource verification.
- `download_default.py:245–319,783–848` composes known source parts, sums their
  transfer totals and runs them sequentially. `starterModelInstallSources.ts:36–72`
  composes dependencies plus main artifacts; actual callers are
  `AddModelsView.tsx:226,249` and `launchpad/ModelsNotice.tsx:374`, through
  `useInstallActions.ts:74`. Independent constituent composition is not an
  atomic signed engine installation.
- `invokeai/app/util/startup_utils.py:28,44,60,75` identifies the actual Torch
  build, cuDNN and driver/GPU compatibility. Its real boot caller is
  `invokeai/app/run_app.py:146–177`. These functions log diagnostics; a return
  does not establish successful native kernel execution or installation.
- `startup_utils.py:116,177` supplies the optional attention-backend probe.
  Actual generation callers are
  `session_processor_default.py:1256,1523`. The probe creates a CUDA primary
  context retained until process exit, so Invoke deliberately keeps it off
  idle startup. It asks backend eligibility, not whether an attention kernel
  executed. It is not substituted for the installed operation probe.
- `session_processor_default.py:1061–1102` sets cancellation events and joins
  workers under one deadline. A still-live abandoned worker prevents a new
  processor/device pool through `refuse_while_an_abandoned_worker_runs:86`.
  This is the physical-exit principle behind the existing Studio fences;
  neither a parent exit nor a stop-method return proves that GPU work ended.
- `invokeai/backend/image_util/infill_methods/lama.py:25–61` normalizes RGB,
  builds a positive mask from inverse alpha and invokes the model under
  `torch.inference_mode()`. `load_jit_model` uses
  `torch.jit.load(..., map_location="cpu").to(device)` and `eval`; the concrete
  caller is `infill.py:137`. Studio already adapts that mechanism in
  `worker-python/src/imagegen_worker/lama_infill.py:161` and its
  `LocalLamaModel` methods. A native smoke must call this existing owner,
  rather than recreate the preprocessing or a model runner.

The optional launcher reference was also reread clean at
`c267bdb439519216b277a7a8c6ad408b9d79efce`. Its
`src/main/install-manager.ts:298` sequences Python, venv and package setup;
Main callers are1034–1077 and renderer caller is
`src/renderer/features/InstallFlow/state.ts:184`. Repair deletes the existing
`.venv` at598–605, and sync uses `--inexact` at744–766. These conflict with
Studio's exact fresh-slot/rollback contract and are not copied.

No compatible signed managed-runtime plus eager LaMa qualification harness,
pre/post runtime-slot acceptance protocol or publisher distribution mechanism
was found in the inspected Invoke owners. That missing boundary must be
disclosed before adapting a Studio qualification profile. The adaptation reuses
the existing Studio owners already based on Invoke's ownership, composition,
native loading and failure mechanisms; it does not invent a second runtime
installation implementation.

## Adopt the exact signed source

The engine profile accepts explicit local transport, external public keyring,
app-version, pinned LaMa source, wheelhouse-proof and new report inputs. Main
trust is supplied externally to the transport; neither archive members nor a
downloaded keyring select it. The retained signing identity is qualification
only and cannot establish shipped publisher trust.

The existing full-inference fixture creates a fresh release ID and envelope.
Attaching the retained ZIP to that re-signed selection would fail the tested
exact inner-envelope binding even if its Python/config/wheel contents matched.
The full-engine path therefore adopts the original signed selection returned
through `extractRuntimeTransport`. It preserves its app version, release ID,
inner envelope and byte identities. No duplicate ZIP or copy-then-resign
67-wheel source preparation is required.

One expanded source tree is materialized by the bounded extractor. Every
installation still creates its own managed Python/environment slot at its
final absolute path through the existing assembler; a completed venv is never
moved into place. Source reuse does not make an environment installed.

Before installation, the adopted manifest's exact 67 wheel identities must
match the verified wheelhouse report and its bound plan, current lock/project,
and the current built worker package bytes. The fixed signed dependency policy
and pinned 17-file config remain unchanged. A valid signature or matching
release label cannot replace those current-source and actual-byte checks.
Read-only inputs and all newly material owners are frozen separately.

## Material execution route

```text
external keyring + exact retained transport + proof/current source
→ existing signature/archive verification and bounded extraction
→ adopted exact release selection and verified expanded inventory
→ aggregate engine review and one-use operation token
→ default Linux/NVIDIA host preflight and existing admission fences
→ pinned LaMa factory/publication and verification-only resource resolver
→ real offline assembler, exact package/worker checks and dependency policy
→ native CPU + inference workers before activation
→ existing pointer publication and native workers after activation
→ reopened manager/installed worker resolution and small CUDA operation
→ installed local LaMa loader and 64×64 CUDA infill smoke
→ successful Repair in a new slot with verified shared-resource reuse
→ real CUDA-hidden post-activation worker refusal in another new slot
→ exact previous-pointer rollback, cleared fences and shared LaMa preservation
```

The profile reuses `RuntimeManager`, its aggregate engine backend,
`assembleOfflineRuntime`, `RuntimeInstallationController`,
`ProjectWorkerClient`, `GenerationWorkerClient`, `fullInstalledChecks` and the
existing command owner. The standard auxiliary readiness hook stays strictly
verification-only. LaMa transfer is the explicit production factory's operation
behind the reviewed token; there is no inference-time download.

The LaMa transfer port reads the exact protected local source into the owned
staging path. Its destination publication, hash/size checks and reuse remain
production behavior. This controlled copy port does not qualify HTTP delivery,
public release endpoints, DNS policy or publisher-key distribution. The source
and installed weights must each match the pinned identity, and the source must
remain unchanged. An installed receipt without fresh byte verification is not
reuse proof.

Native worker qualification, package installation and CUDA operations are real
in this profile; the assembly and worker substitutes of the preceding stage
are not used as their acceptance evidence. The existing small operation probe
tests actual device allocation/fill/synchronization under the installed
interpreter. The additional 64×64 LaMa probe calls `load_local_lama` and its
existing infill method against the newly installed verified path. It tests a
bounded native auxiliary operation, not a diffusion checkpoint, visual quality,
general image capacity or an arbitrary resolution matrix.

Reopened native runtime checks and fresh shared-resource verification are
recorded as their actual boundaries. They do not silently change the public
advisory status API into a general aggregate auxiliary-health contract.

## Repair, refusal and rollback

Successful Repair must consume a fresh review token, create a different slot
and retain the previously working files. Exact installed LaMa is reverified and
reused with zero additional transfer. Cached source bytes do not remove new
slot footprint requirements; aggregate peak remains unknown in the review,
with the signed slot floor reported separately.

The subsequent failure case must reach the real post-activation consumer.
The candidate's pre-activation native qualification succeeds; after its pointer
is published, an inference worker is started with CUDA hidden. Its actual native
startup must refuse for the intended CUDA-unavailable reason. A fixture/setup
error, timeout, OOM, missing file or generic thrown failure is not this control.

After that refusal, the existing controller must restore the exact previous
pointer bytes and preserve the preceding successful slot and shared LaMa.
All owned worker/command processes must confirm physical exit, and startup/
generation fences must clear before an unmasked healthy neighbor is admitted.
The retained journal/receipts must identify the candidate and rollback phase;
returning an error without observing the published-pointer transition does not
establish post-activation rollback.

The three fresh slots have separate purposes: initial installation, successful
Repair and a candidate whose post-activation qualification is refused. They
are temporary qualification payloads, not a retained runtime fleet or a reason
to replace the existing protected reusable environment.

## Bounds and resource ownership

These are explicit qualification bounds, not measured product capacity:

| Parameter / owner | Bound or decision | Meaning |
| --- | --- | --- |
| Aggregate process boundary | one 8 GiB cgroup, zero swap, 600 seconds | CLI, commands, CPU/inference and smoke children share one budget |
| GPU work | serial owned processes | no overlapping native qualification or unrelated-process termination |
| Temporary disk planning exception | up to 48 GiB | one expanded source, three fresh qualification slots and owned scratch/cache; measure actual use and release it after audit |
| LaMa native smoke | 64×64, existing CUDA owner | bounded infill operation, not quality or resolution/capacity acceptance |
| Signed input/proof/config limits | existing verifier/extractor/plan bounds | no enlarged schema, archive, package or metadata ceilings |
| Installed command/startup deadlines | existing owners inside the outer deadline | timeout never substitutes for confirmed exit |
| Engine disk preview | aggregate unknown, signed slot floor separate | the operational disk exception is not a guessed user-facing required peak |

Before the heavy run, inventory disk/VRAM again and record the concrete
reconstruction/dependency graph under the artifact lifecycle. No yesterday's
idle state authorizes stopping another Invoke process. No global cache/model
or ordinary app-data cleanup is part of qualification.

The 48 GiB exception is a temporary budget for this three-attempt experiment,
not a measured installed footprint. Actual memory, disk, swap, process groups,
deadline and physical exits need their own reports. File cache belongs to the
aggregate cgroup budget; warm-cache behavior is not a capacity guarantee.

## Acceptance and sensitivity plan

1. Preserve default and full-inference argument/input behavior. Reject missing,
   extra, mismatched or unsupported engine inputs before they can establish a
   usable engine review. No implicit key, source URL or new release signature
   substitutes for the supplied exact identity.
2. Exercise the exact adopted transport/expanded binding and all 67 current
   wheel/proof identities. Include a neighboring valid control for trust,
   selection and source-drift refusals.
3. Complete real engine Install with default host admission, pinned LaMa,
   exact offline package membership/current worker bytes, pre/post native
   workers, pointer/journal completion and normal physical closure.
4. Observe reopened runtime/CPU worker readiness, the installed CUDA operation
   and the 64×64 installed local LaMa operation. Their successful receipts do
   not qualify an unexecuted model workflow or public Setup.
5. Complete a fresh-slot Repair and observe verified zero-transfer LaMa reuse.
   Verify the old slot and protected source/input bytes remain unchanged.
6. Reach the real CUDA-hidden post-activation refusal, prove exact pointer
   rollback, shared-weight preservation and cleared exit fences, then run an
   unmasked healthy neighbor. Diagnose the intended native refusal separately
   from setup/resource failures.
7. Semantic mutation must reach the actual new consumer and produce the
   intended assertion RED, with adjacent GREEN and exact restoration. Source
   authoring or an expected process failure is not automatically mutation
   evidence. Preserve all diagnostics and rollback data until closure.
8. Audit retained bytes, source pins, complete package/resource identities,
   phase/pointer receipts and dependency closure. Distinguish self-audit from
   independent review. Audit is distinct from rerunning the native operation
   and does not authorize deletion.
9. After every reader and owned process exits and source mutations are
   restored, retain compact conclusions/controls/reconstruction inputs, then
   dispose only exact idle agent-generated roots. Preserve protected Shared
   transport, original LaMa/runtime/models and their required companions.
   Record actual reclaimed allocated bytes and lifecycle/dependency updates.

## Unqualified scope and completion record

This is one Linux/NVIDIA host and one explicitly selected release. It does not
qualify checkpoint/diffusion generation, Regional Guidance visuals, Illustrious/
NoobAI release matrices, arbitrary image or memory capacity, other platforms,
shipping publisher trust, public network delivery, an Electron distributable,
clean-user install/upgrade/rollback, public provider/preview IPC/UI or manual app
updates. The existing accepted product boundaries and generation defaults are
unchanged. PP-001/005/007/008 remain **«Пока не обещать»**.

## Root execution record — 2026-11-15

Evidence owner: `runs/native-engine-qualification/20261115` under the established
artifact root. This is fresh Root execution against the dirty delivery source
on the base above. The retained `actual-source.json` binds both changed scripts;
`native-source-closure.json` retains the 99 unique frozen production/Python
owners. No production application or Python worker implementation changed.

- `lower-final`: **127 PASS, two pre-existing opt-in SKIP** across the qualifier,
  planner and RuntimeManager checks; no claim of the complete Main test suite.
  Typecheck, scoped ESLint for the two changed scripts and `app:build` passed.
  UI/prototype code did not change; no browser acceptance is inferred.
- Two semantic mutations remove wheel-proof equality and lock binding from the
  new release-admission consumer. Both produce the intended assertion RED with
  adjacent GREEN and byte-exact restoration (`mutations.json`, six bounded
  executions). Setup errors, resource failures and expected native refusal are
  not counted as mutation evidence.
- `actual-engine-r1.json`: **13 native checks PASS**, 322.011 seconds. The exact
  retained 3,218,614,866-byte transport was adopted without re-signing, along
  with its qualification-only external keyring and original selection. Three
  separate slots each installed the exact 67-package closure/current worker.
  The real host preflight, pre/post native workers and activation owners ran.
- Seven CPU clients closed normally. Ten inference starts comprise eight ready
  clients with normal close and two real CUDA-hidden refusals. Twenty-one
  command receipts comprise 20 successful exits and the separate intended
  diagnostic exit 78. Physical-exit receipts/fences are checked, rather than
  assuming launcher exit proves child exit.
- The installed interpreter executed the 16-element CUDA fill/synchronization
  probe and the existing local LaMa owner's 64×64 CUDA infill. Its retained RGB
  PNG has an sRGB profile; the original source and exact 205,669,692-byte LaMa
  remain unchanged. One explicit auxiliary copy was followed by verified reuse
  with no second transfer. This is compute/wiring evidence, not visual quality.
- Repair installed a different fresh slot. Another candidate passed native
  pre-activation checks, published its pointer, then its actual post-activation
  worker refused with CUDA hidden. Production rollback restored the exact
  preceding pointer and preserved the successful slot and shared LaMa. Fresh
  unmasked readiness succeeded; operation/startup fences cleared.

The manager's startup error is generic `WORKER_EXITED`; it does not retain the
original refused worker's stderr. Source review found this diagnostic gap. The
qualifier now runs a **separate** same-slot interpreter with the same hidden-CUDA
environment and requires exit 78, empty stdout and the exact CUDA-unavailable
startup diagnostic. That receipt is not attributed to the original manager
attempt. The reviewer performed source review only; Root executed the checks.

The actual native cgroup had an 8 GiB aggregate ceiling, zero swap and a
600-second deadline. It reached the full 8 GiB ceiling, mostly file cache;
recorded OOM/kill counters stayed zero and all owned cgroups were empty after
closure. This run establishes no memory headroom, larger image capacity or
compatibility beyond the observed Linux/NVIDIA host. No foreign process was
stopped.

`output-byte-audit.json` records **21 Root self-audit checks** using a separate
Python implementation: both Ed25519 envelopes, original transport/expanded
bytes, all three package/worker closures, original/published LaMa, pointer and
phase receipts, PNG, source restoration and physical/resource closure. The
additional `retention-audit.json` checks complete classification, reconstruction
references and every compact archive member without extraction. A delegated
retention assistant hit the provider usage limit before creating files. These
are explicitly **Root self-audits**, not independent agent execution or another
native run; the separate source review remains source-only.

The first config-preparation attempt lacked its owned parent directory; the
corrected preparation passed before the native run. The first retention
inventory exceeded the old 128 MiB metadata ceiling: the complete inventory is
150,517,402 bytes. Only this run-owned retention helper's metadata limit was
raised to 192 MiB and inventory repeated. Product manifest/archive limits,
signed disk floors and runtime parameters were unchanged. Both setup failures
and their corrected runs remain recorded.

Retention accounts for **181,233 entries**, including every live excluded file.
The compact archive retains 25,561 entries (78,159,255 compressed bytes); omitted
48,166,094,789 regular bytes are exact protected wheel/member or LaMa copies,
retained construction copies, or explicit CPython 3.12 bytecode regeneration
recipes. The archive SHA-256 is
`47f102ea141cbee3c2e6e70b4a9cf843c61a73621c62568091d0020cd4a0eb06`.
All regular files have one link. This is construction/metadata retention, not
an executable venv backup. Reassemble at fresh final paths and requalify; do not
resume disposed raw paths or extract recorded links automatically.

Final cleanup rehashed the complete live inventory and checked exact membership,
stat identity, closed owned units, source pins and restored mutations immediately
before no-follow disposal. Only the two recorded idle run-owned payload/scratch
trees were removed. **48,838,430,720 allocated bytes (45.48 GiB)** were released;
filesystem free space changed from 9,059,753,984 to 57,896,353,792 bytes during the
operation. The cleanup controller confirmed physical exit and zero swap. The
lifecycle is `retained`, with `payloads: []` and the temporary budget resolved.
The protected signed transport, 67-wheel source/proof and original shared
runtime/LaMa companions retain reciprocal dependencies; none were deleted.

`release-gates.json` binds the final process/source/dependency closure;
`delivery-source.json` binds the eight staged files, and `commit-proof.json`
records local/remote commit equality after delivery. These receipts remain
separate from native execution and source review. The next public consumer
remains Setup Install/Repair and its provider/preview IPC/UI, with shipping
trust/delivery and reopened auxiliary health still explicit prerequisites.
