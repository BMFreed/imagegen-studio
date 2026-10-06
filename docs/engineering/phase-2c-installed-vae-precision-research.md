# Installed VAE precision qualification

Date: 2026-10-07. Base `dc2a6f90e0da3ea49019f5fd68636ec3fdfbbf38`, clean
`master`. Subsequent source changes and evidence describe the working tree.
Risk: High — worker failure classification, durable queue diagnostics and
qualification of immutable accepted settings.
Contracts: [PP-005/008](../product-promises.md),
[generation settings](../features/project/generate-mode/generation-settings.md),
[precision implementation](./phase-2c-vae-precision-research.md),
[installed outpaint runtime](./phase-2c-public-outpaint-research.md).

## Expected result and current gap

The applicable Advanced Options already have production paths: Illustrious
embedded/exact external VAE, Auto/FP16/FP32 precision and CFG Rescale. CLIP Skip
is explicitly inapplicable to both MVP pipelines. Anima uses its pinned companion
VAE and refuses SD-only manual precision/nonzero rescale. No additional required
encoder/decoder option is named. Remaining work must qualify these paths rather
than invent another control. External VAE qualification remains separate.

Existing evidence combines actual development GPU calls with Electron using a
controlled inference peer. This slice connects the actual production precision
control, Main, installed non-editable worker, trained CUDA weights, staging,
explicit Add, Save/reopen and comparison. At the pinned configuration Auto uses
the native upcast policy; FP32 should produce the same matched txt2img pixels.
FP16 may legitimately fail the finite guard. Such refusal must be observable and
cannot be counted as successful inference or inferred from a generic failure.

Confirmed baseline source defect at `dc2a6f9`: `inference_vae.finite_vae_outputs` raises
`GENERATION_WORKER_FAILED` with the fixed message
`VAE inference produced non-finite values.`. The JSONL client retained only the
worker code, the processor stored a generic failure and the Queue Manager mapped
it to a generic literal. Thus the earlier precision contract's visible finite
explanation was lost at the actual public boundary. This slice fixes that path.

## Owners and preservation

```text
Project Advanced Options -> typed draft -> captured frozen job
-> qualified installed worker -> exact VAE compute / finite guard
-> validated JSONL client -> processor -> durable queue -> public Queue Manager
completion -> verified staging -> explicit Add -> portable Save/reopen/comparison
```

Recognize only the exact validated native Illustrious generation error pair.
Carry a typed Main-internal reason and expose a fixed Main-owned message under
`GENERATION_VAE_NON_FINITE`. Arbitrary errors, paths, other non-finite failures,
composition responses and malformed protocol data must not acquire this reason
or enter the renderer. Preserve actual worker code and all existing unknown-error
refusals. No Python wire/version change, new worker capability, database migration
or raw worker-message presentation is required.

Worker failure publishes no PNG/candidate, accepts no layer, advances no completed
seed and does not save the Project. Current authoring edits remain authored edits.
Cancel requires actual child exit. Retry retains the original precision, source,
seed, prompts and operation even after current precision changes. Changing to
FP32 for a new Generate is distinct from Retry of a frozen FP16 attempt.
Main-owned error messages remain fixed literals even for historical unsafe stored
messages. Save/recovery, source files, other jobs and accepted provenance retain
their established contracts.

## Finite scope and verification

Profile `vae-precision` has explicit 256x256 targets and three authored steps,
the same exact Illustrious checkpoint and ordinary LoRA weight -0.5 used by the
qualified development fixture. These are bounded probe parameters, not maximum
GPU resolution or image-quality promises. Model geometry, queue/batch limits,
JSONL line bound 64KiB and error-message bound 512 characters are unchanged.
The existing isolated worker 0.12.0 and six-resource catalog are reused; source
weights remain read-only. No additional runtime/model copies or downloads.

The policy domain is exactly Auto/FP16/FP32. Planned cases cover all three in
txt2img and opaque img2img. Matched txt2img Auto/FP32 normalize only authored
precision and document identity/revision; all material inputs must agree
and decoded pixels must match. FP16 must either complete with finite output or
reach the exact VAE finite refusal, with no PNG/candidate or accepted-state
mutation. Import, OOM, timeout and generic failure never satisfy that check.
Opaque cases establish encoding/decoding wiring and portable settings, not a
matched numerical img2img ablation. The FP32 opaque case includes actual Cancel,
a current FP16 edit, frozen FP32 Retry and recorded/current comparison. Report
completed/refused/canceled admissions separately.

Run real JSONL client, SQLite/staging and public queue projection regressions,
with changed code/message/operation and unsafe-path neighbors. Isolated semantic
mutations must demonstrate sensitivity of classification, processor persistence
and renderer-safe projection. CLI tests execute the actual script and prove
parameter/profile refusals precede model/worker side effects. The installed
native profile proves the trained boundary. Inspect actual screenshots and
record exit and hashes. Review is self-review plus source-informed independent
review; it is not a blind audit.

Heavy checks run sequentially in whole-process cgroups with zero swap and
deadlines: focused/mutations 2GiB, full app 4GiB, installed inference 12GiB.
Bound binary diagnostics with byte equality/hash rather than enormous diffs.
No first-setup/Repair, signed release, public CivitAI/GitHub download, arbitrary
model/GPU, external VAE, authored masks/regions/Smart Patch, preset implementation
or whole-MVP readiness is claimed.

## Executed evidence

Artifacts: `/home/user/.codex/artifacts/imagegen-studio/installed-vae-precision-2026-10-07/`.
Native `native-v2/report.json` is `passed`. The built Electron process used
unmodified production Main and the same six-resource catalog; the two selected
exact checkpoint/LoRA files were reused without copies. Installed worker 0.12.0
is non-editable CPython 3.12.13. All 43 current worker payload files agree by hash
with the installed payload (`installed-payload.json`). No Python implementation
change was needed. The exact tested harness is archived under `native-v2`;
`harness-lineage.json` verifies that final formatting only wrapped one unchanged
assertion, with every other source byte unchanged. Native bundle hashes still
match the shipped Main/preload/renderer build.

Six cases actually completed finite inference: Auto/FP32/FP16 in txt2img and
opaque img2img, seven actual admissions including one retained canceled original.
The native fixture produced **zero non-finite refusals**. Matched txt2img Auto and
FP32 decoded RGBA hash is
`926bf5288803d17b89c4011e12159b8579ae5df98ba019d98e84f0e6cef81658`;
FP16 is `acb2e6f078f8065964fe62f5de7164ac951b4fd50e5b209569e87a22261d20d1`.
All material normalized inputs and exact transparent targets agree. Opaque
Auto/FP32 use that same accepted source, while FP16 uses its own accepted source;
these cases establish wiring, not matched img2img numerical effects.

The actual public Cancel left no candidate/receipt or cursor change. The original
remained canceled; Retry copied the exact frozen FP32 JSON/target after a current
FP16 edit and consumed the reviewed source sequence once. All six completions
required explicit Add and Save. Saved assets, source layers, previews, actual
seed `0` and precision passed actual package readback, rendered reopen and
read-only comparison. Screenshots of authored Auto and the reopened FP32/FP16
comparison were visually inspected. No renderer page errors. Native exit is
confirmed `code: 0, signal: null`. The entire cgroup completed in 8m58.995s with
systemd-reported `958.3M` peak (below 1GiB) and zero swap; a 12GiB ceiling was a safety limit, not measured use.
This is one trained checkpoint/configuration, not every model/GPU or image quality.

Non-finite diagnosis is qualified separately through controlled actual JSONL
children and real processor, SQLite, staging, accepted Project and `.igs` package
owners. Exact message/code/operation and malformed/crossed/private-path neighbors
are exercised. Existing accepted pixels/package/history, source target, receipts
and completed seed remain unchanged. Outpaint JSONL cases additionally substitute
only the tiny LaMa authenticity precondition; ordinary model/target/adapter/VAE
path checks and strict native capture remain real. Those cases do not qualify
LaMa authenticity or trained refusal. The actual trained fixture's healthy FP16
output is not evidence that every FP16 VAE is finite.

The first focused run exposed a test-fixture error: an open Project legitimately
owns `igs-pending-*` scratch. The test now compares its genuine pre-worker scratch
inventory while still requiring absent inference output and preserved ownership.
The first native attempt stopped before generation because the draft's explicit
Embedded VAE is `null`, rather than absent; the runner assertion was corrected.
Both failed attempts are retained as artifacts and are not counted as passes.
A first mutation driver stopped on a non-unique textual edit anchor; the corrected
isolated rerun completed. No production mutation was made in the main checkout.

Final full app suite: **2083/2083 passed**, no skipped/canceled tests, 125.418s;
whole-process cgroup reported `576.6M` peak and zero swap. The earlier focused
normal-mode client/processor/queue/CLI run passed 170/170. Prototype UI was not
changed; the prototype and production TypeScript projects are both checked.

Final isolated mutation pass: baseline and restored source passed; the existing
exports on original `dc2a6f9` Main produced six assertion failures, demonstrating
the baseline behavior defect. **Ten semantic mutations were detected**: drop typed
reason; prefix-match the message; classify Anima JSONL; drop Illustrious outpaint
classification; drop frozen-family, instance, transport-code or worker-code
guards; hide the fixed public diagnosis; expose stored private messages.
Every expected red run was assertion-based, not a missing module, syntax failure,
OOM or timeout. The owned mutation tree was restored; no mutation entered the
repository. `mutations.json` and individual logs retain actual counts. Final
mutation cgroup reported `159.2M` peak and zero swap.

Final typecheck passed for both prototype and production Vue/TypeScript. Its
first pass found an unannotated parameter in the new test's mock callback; the
only correction was `input: GenerationWorkerRequest`, with no runtime change.
`test-type-erasure.json` confirms identical emitted JavaScript before/after the
annotation and final formatting; the affected outpaint file also passes 8/8
focused checks afterward. The production source and native bundle are unchanged;
all three modified Main modules match the actual native bundle's source map.
Final whole-repository lint passed; formatting/diff checks and delivery hashes
are retained in the artifact delivery manifest. The application build passed
before the native run. Prototype
mocks are not evidence for trained inference or production persistence.
