# Installed Illustrious CFG Rescale qualification

## Expected result and scope

Baseline: clean `master`, `267fbe70366343cdb423c3dbb4c29f1cba0efe36`,
06.10.2026. The [Phase 2C roadmap](../specs/01-implementation-roadmap.md)
requires actual Advanced Options → installed trained worker → Add → Save/reopen
qualification for CFG Rescale. Authority is
[Generation Settings](../features/project/generate-mode/generation-settings.md),
[accepted provenance](../features/project/generate-mode/generation-provenance.md)
and PP-005/007/008 in [Product Promises](../product-promises.md).

This qualifies an existing behavior; source inspection found no demonstrated
production defect. The earlier [CFG checkpoint](./phase-2c-cfg-rescale-research.md)
separately proved controlled native wiring and a small direct GPU ablation.
[Installed runtime qualification](./phase-2c-installed-runtime-qualification-research.md)
connected four trained normal jobs to the public UI, but its harness never
authored CFG Rescale or asserted its frozen/accepted value. Those results do
not establish the installed public parameter's numerical effect.

The harness change and evidence must be reviewed at the high-risk boundaries
being qualified: durable queue, installed worker, candidate receipt, immutable
accepted provenance and real `.igs` writer/loader. Production contracts, worker
dependencies, persistence formats, capability gates and user data remain
unchanged unless a reproducible defect requires a separately recorded fix.

## Current owners and finite case matrix

```text
Project Advanced Options / CFG Rescale
→ App serialized draft synchronization → strict Main IPC → ProjectService
→ captured Generate snapshot → validate/verify exact checkpoint and LoRA
→ frozen queue context + worker sampling
→ installed noneditable Python worker → pinned Diffusers guidance_rescale
→ actual output PNG/receipt/staging, outside Project until explicit Add
→ immutable accepted configuration → UI Save → actual .igs loader → reopen
→ read-only comparison against independently edited current draft
```

Main freezes `draft.cfgRescale ?? 0` before async verification. Materialization
forwards `context.sampling.cfgRescale`; dispatch clones the frozen request.
Python forwards `command.cfg_rescale` to the shared txt2img/img2img adapter's
actual `guidance_rescale` argument. Add records the frozen effective value at
top-level `generationConfiguration.cfgRescale`, not the latest draft. Historical
absence remains unknown; this experiment creates only current records.

The opt-in fixture profile `cfg-rescale` defines a bounded numerical/wiring
matrix; the ordinary family/mode qualification remains the default.

| Case                   | Draft before Generate                               | Required result                                                                     |
| ---------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Unset txt2img          | Field absent                                        | Frozen/accepted effective zero and real decoded RGBA baseline                       |
| Explicit-zero txt2img  | Own field present with zero                         | Same inputs and decoded pixels as unset; accepted zero                              |
| Nonzero txt2img        | Own field 0.7                                       | Same inputs, different decoded pixels; frozen/accepted 0.7                          |
| Nonzero opaque img2img | Own field 0.7, exact prior nonzero output as source | Genuine output, frozen/accepted 0.7, exact target pixels and portable mode/strength |

Use three separately created blank Projects for txt2img: accepting one result
makes its target opaque, and the existing harness's late prompt edit must not
contaminate the next ablation. Compare actual frozen checkpoint/LoRA identities,
sampling, authored signs, bbox and transparent target RGBA. Project/job IDs and
document revisions intentionally differ; they are not numerical inputs.

After durable admission, author CFG Rescale 0.2 through the actual control.
The queue bytes, accepted configuration, saved/reopened record must retain the
captured effective zero/0.7 while the current draft saves/reopens at 0.2.
Visible comparison must report Recorded zero/0.7, Current 0.2 and Changed.
Existing candidate/job/receipt correlation and completion-before-Add layer/file
invariants remain mandatory.

Four jobs qualify the written roadmap: txt2img numerical ablation and nonzero
img2img wiring through the shared adapter. They do **not** establish a separate
img2img zero/nonzero numerical ablation; that claim requires a same-source
neutral fifth job. No value is claimed to improve image quality.

## Parameters, assets and isolation

Declared existing qualification inputs: 1024 × 1024, three configured steps,
CFG 4, fixed seed zero, Euler a/Normal, one exact ordinary Illustrious LoRA at
−0.5. The opaque img2img control uses strength 0.5 and Reuse of completed seed
zero. CFG values unset/zero/0.7/late-edit 0.2 are within the accepted 0–0.99
authoring range. These are experiment inputs, not expanded resolution, timing,
VRAM, batch or product limits. Harness observation deadlines are not product
timeout promises.

The existing app-owned qualification environment and marker/pointer were
inspected at
`/home/user/.codex/artifacts/imagegen-studio/installed-runtime-2026-10-05/data/imagegen-studio/`.
It contains managed CPython 3.12.13, noneditable worker distribution 0.1.0 /
protocol 0.11.0, pinned inference dependencies and the previously verified
Bismuth Illustrious epsilon checkpoint plus ordinary LoRA. The existing
`fixture-qualified-v5.json` supplies exact source hashes/sizes. Runtime and
model bytes are qualified developer preconditions, not CivitAI download,
model-family discovery, signed release installation or repair evidence.

The primary run reuses that explicitly owned qualification catalog with
`--resume` and a fresh exclusive evidence directory. It creates new qualification
Projects; it never replaces existing reports, the runtime pointer or model
files. Ordinary user app data is outside this scope. Mutations must execute
only in separately owned copies, with actual imported module/build identities
recorded and unchanged original identities verified afterward.

## Review and mutation plan

1. Extend the real installed harness with strict profile preflight, distinct
   Project/screenshot case names, UI authoring, frozen/accepted/reopened CFG
   assertions, actual visible comparison and decoded-pixel controls. Existing
   real CLI/filesystem tests must preserve refusal and report ownership behavior.
2. Run the fresh production build and installed profile through genuine Electron
   renderer/preload/Main/SQLite/worker. Do not substitute the inference peer or
   synthesize the accepted result. Inspect actual Advanced Options/comparison
   screenshots and retain source, build, runtime and input/output identities.
3. Main semantic mutation: in an isolated compiled checkout, replace sampling
   `cfgRescale` with zero in `project-generation-preparation.ts`. It changes
   context/materialization consistently, so schema/agreement guards alone cannot
   kill it. The UI-authored 0.7 versus actual frozen value assertion must fail.
4. ML semantic mutation: in a private installed worker copy, replace actual
   `guidance_rescale=cfg_rescale` with zero. Queue/accepted metadata can remain
   perfect because they describe the requested frozen setting. The actual
   same-input nonzero/neutral decoded RGBA assertion must detect the lost effect.
   A checkout-only Python edit cannot test a noneditable installed worker.
5. Restore only mutation copies and rerun a genuine green control. No original
   qualified runtime, normal user state, dependencies or downloaded weights may
   be modified to manufacture evidence.

Failures must retain their candidate/job/receipt or harness/preflight identity.
Distinguish a real product failure from a fixture, selector, unsupported runtime,
stale build or wrong imported module. Do not widen timeouts or weaken assertions
to obtain green. Source review/self-review is not a blind product audit.

## Execution record

Evidence root:
`/home/user/.codex/artifacts/imagegen-studio/installed-cfg-rescale-2026-10-06/`.

### Installed green and numerical controls

The primary command used the fresh unmodified production build and actual
qualified installed environment:

```bash
pnpm exec tsx scripts/qualify-installed-generation.mjs --fixture /home/user/.codex/artifacts/imagegen-studio/installed-cfg-rescale-2026-10-06/fixture-green.json --resume
```

[Primary report](/home/user/.codex/artifacts/imagegen-studio/installed-cfg-rescale-2026-10-06/green/report.json)
passed seven checks and all four trained jobs, with zero page errors and native
Electron exit 0. Each output traversed explicit UI Add, real rendered Save,
actual `.igs` loader, close/reopen and read-only settings comparison. Later draft
0.2 did not change captured effective zero/0.7. Completion preserved Project
layers and the saved package before explicit Add/Save. Frozen inputs and exact
job/receipt identities, output PNG bytes, decoded pixels and previews are kept
in the report, rather than inferred from UI labels alone.

| Primary decoded RGBA       | SHA-256                                                          |
| -------------------------- | ---------------------------------------------------------------- |
| Unset txt2img              | c142e300b9c43c295f50acc1e4a0dce771e42e09368939bff8fce278f6dd5a45 |
| Explicit-zero txt2img      | c142e300b9c43c295f50acc1e4a0dce771e42e09368939bff8fce278f6dd5a45 |
| Nonzero 0.7 txt2img        | 4839c5ebc79e3851b4ebec06ff78005dc384b5ff42cab84d4bd441a1e62cd14b |
| Nonzero 0.7 opaque img2img | 9555b60155f5fa494b55e1ef5e0c3940374c7f14b410225533d55c59910c67e2 |

The three numerical controls compare full frozen context/worker inputs and
transparent target pixels, removing only required Project identity/revision and
CFG itself. They do not compare images from different prompts or checkpoints.
The img2img source is the exact accepted nonzero output in the same Project;
its applied strength and Reuse actual seed zero remain frozen.

### Isolated sensitivity

Only a detached checkout and a new derivative installed runtime were mutated.
The runtime graph was copied privately, without shared file inodes, downloads,
uv sync or relocation of the old venv. A new venv was created at its final
canonical prefix with copied owned CPython. Preparation checked the full copied
Python/site-packages/config byte manifests (excluding regenerated `__pycache__`
and `.pyc`), 66 installed distribution identities,
noneditable worker import and actual Python prefixes. Real production
GenerationWorkerClient then confirmed CUDA readiness and exit before exclusively
publishing the new derivative pointer/marker. Startup readiness alone was not
counted as CFG numerical evidence.

[Main mutation outcome](/home/user/.codex/artifacts/imagegen-studio/installed-cfg-rescale-2026-10-06/main-mutant-outcome.json)
records CLI exit 1 at the exact invariant: UI-authored 0.7 versus actual durable
frozen sampling 0 (`0 !== 0.7`). Both neighboring neutral trained cases completed
Add/Save/reopen/comparison. The third job was canceled on native close; Electron
exit 0 and absence of remaining workers were confirmed before the next campaign.
This was the private compiled production Main, not a test-local fake.

The restored private Main source equals root production bytes. Private and root
bundle SHA-256 differ because esbuild labels the shared node_modules relative
to each checkout. Replacing only that module-label prefix makes each full
Main/preload bundle equal; the
[identity record](/home/user/.codex/artifacts/imagegen-studio/installed-cfg-rescale-2026-10-06/restored-main-build-identity.json)
preserves both raw hashes and the narrowly scoped comparison. Distinct bundles
are not reported as raw byte-identical.

[Installed worker mutation outcome](/home/user/.codex/artifacts/imagegen-studio/installed-cfg-rescale-2026-10-06/worker-mutant-outcome.json)
records a second behavioral kill: CLI exit 1 because all three actual trained
txt2img outputs have the neutral `c142e300…` decoded RGBA SHA. Frozen requests,
accepted provenance, rendered Save/reopen and visible comparison still correctly
carry zero/zero/0.7. The exact failed assertion requires 0.7 to change decoded
pixels at otherwise equal inputs. A metadata-only test would miss this mutation.
The actual isolated installed import had SHA `234bb3a6…`, private inode and
noneditable path; the mutation was not applied to checkout Python source.
Electron exited 0, no page errors or remaining workers were observed, and the
private installed module was restored to baseline SHA `ee0d356a…` before the
final native control. Original runtime identities and full byte manifests
remained unchanged.

[CLI profile mutation report](/home/user/.codex/artifacts/imagegen-studio/installed-cfg-rescale-2026-10-06/cli-profile-mutations/report.json)
separately detects all three guard mutations: omitted explicit-profile validation
reaches the wrong size refusal; rejecting the supported profile refuses too
early; omitted three-step validation reaches the wrong missing-model refusal.
Baseline and restored real CLI suites both pass 9/9, zero skipped; copied source
is restored and original source hashes stay unchanged. These tests deliberately
stop at controlled preflight failures and do not start Electron, CUDA or models.
They establish refusal order/reason sensitivity, separate from the two actual
Main/installed-ML inference mutations.

### Restored control and final visual checks

[Final restored report](/home/user/.codex/artifacts/imagegen-studio/installed-cfg-rescale-2026-10-06/isolated-restored-green/report.json)
passes seven checks and all four trained jobs again, zero page errors, Electron
exit 0. It uses the same final v2 script as both native mutation campaigns:
SHA `64a6129a83fd7688a037f009f9cd3f170ade544b24073f21848b8a43d2aa0e57`.
Its restored installed import is independently checked at the private
site-packages path with original SHA `ee0d356a…`. All four decoded RGBA hashes
equal the primary table above; unset/zero equality and nonzero difference return
after restoration. Current draft 0.2 remains distinct from captured zero/0.7
through all four accepted records, real packages, reopen and visible comparison.

Eleven PNGs preserve the actual 1380 × 900 native renderer. The restored initial
unset control and unset/nonzero comparison images were opened: CFG values,
control help text and Recorded zero/0.7 versus Current 0.2 are readable; the
popover is opaque after its entrance animation. The nonzero authored screenshot
retains its actual scroll state with the numeric row below the viewport; it is
not used as visual proof of the value. The independent before-click draft,
frozen queue and numerical assertions establish that value. This is local
control/comparison inspection, not a full interface/accessibility audit.

Five targeted semantic mutations were detected: two through actual native
Main/installed-worker execution and three through real CLI preflight. Restored
controls are green at their respective boundaries. Source-aware peer review
checked the frozen harness, reports, import/build identities and documentation;
it was not a blind product audit. No production behavior defect was demonstrated
and no production source, dependency or persistence format changed.

### Harness corrections and regression boundary

The first Main-copy build refused pnpm's attempted automatic dependency refresh
against shared node_modules in a non-TTY. No native test had started, and this
setup failure was not counted as a mutation kill. The successful retry disabled
only dependency auto-verification for the owned checkout; dependencies stayed
unchanged and the normal production build scripts compiled its private dist.

Primary v1 screenshot capture sometimes landed inside Naive's entrance
transition. The translucent PNG was inspected against the actual opaque theme
and was not declared a product color defect. Final v2 capture observes finite
animation completion, two painted frames and opacity 1 through comparison
ancestors. No UI style, animation, fixed sleep or numerical assertion was changed.
The primary v1 script SHA is retained in its report; v2 has a separate final
source identity and subsequent evidence, rather than claiming one source for all
runs.

Final v2 app tests: 1611/1611 passed, zero failed/canceled/skipped; focused actual
CLI preflight tests: 9/9 passed. Whole-repository lint and full typecheck passed;
the production app build succeeded. These checks are separate from trained CUDA
execution. No prototype UI changed. The normal lightweight app smoke chain was
not rerun for this harness-only change; the installed native profile and its
restored control execute the relevant genuine production path instead.

PP-005/007/008 and Phase 2C remain open. This parameter does not qualify VAE
precision, v-pred, embeddings, dynamic batches, seed crash/restart, authored
masks/Regional Guidance, Smart Patch or release packaging. Missing-runtime Save
and Home Rebuild belong to the earlier default-profile qualification and were
not rerun by this CFG profile. No independent img2img zero/nonzero numerical
ablation, checkpoint generality, image-quality or VRAM-limit claim is made.
