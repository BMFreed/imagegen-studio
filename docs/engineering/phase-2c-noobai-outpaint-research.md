# Installed NoobAI mixed-alpha outpaint qualification

## Entry, scope and risk

Authorized roadmap continuation from clean `master`
`b304124f0e92bfee81a6f0b53df05d1fd1b2a309`. High risk: exact auxiliary-resource
installation, frozen Generate/Retry and accepted `.igs` persistence/provenance.
The preceding [author-recipe qualification](phase-2c-noobai-author-recipe-research.md)
activated worker0.14 and qualified trained ordinary txt2img/img2img; it did not
execute the declared NoobAI outpaint stage. PP-004/005/007/008 remain open.

Supporting contracts: managed-model library, generation provenance, worker
protocol, document lifecycle and the NoobAI roadmap subsection. The existing
[public outpaint checkpoint](phase-2c-public-outpaint-research.md) defines the
Invoke alpha/LaMa policy and ownership. This slice qualifies that same normal
mixed-alpha path on the official NoobAI epsilon file and the credited Cyberfalafel
v-pred derivative. It does not introduce a new algorithm or product capability.

## Owners and observable invariants

Main verifies the exact checkpoint/noise policy and pinned LaMa bytes, freezes
the source PNG/alpha mask and queue payload, and independently validates the
worker contribution before publication. Python owns the native numerical
schedule, LaMa infill and masked denoising. Renderer exposes ordinary Generate,
Cancel, Retry, Add, Save and immutable settings comparison.

Each objective uses an independently accepted opaque source, a real keyboard
bbox shift of64px and mixed-alpha input. Source RGB at the shifted overlap must
match the original PNG exactly. Accepted contributions retain transparent
protected pixels; independent merged-preview pixels must equal the source where
the contribution alpha is zero. New-layer placement must equal the captured
bbox with unit scale, zero rotation, opacity1, normal blend and visibility.
Original layer assets/properties survive Add, explicit Save and reopen.

Real Cancel must release the inference process. Changing each captured policy
axis (prediction, ZTSNR, spacing) before Retry must refuse without admission or
mutation of the frozen job. Restoring the baseline must admit the same frozen
source, seed0 and strength0.5 despite current draft edits. Temporary completion
must leave the saved package unchanged. Add/Save/readback/reopen retain exact
model, noise profile, contribution/provenance and compare recorded outpaint
against the now opaque current img2img source.

Progress must match an independent pinned native scheduler's effective selected
timesteps. The installed adapter uses a training-timestep cutoff, not flooring
`steps * strength`; for the three-step leading baseline,667/334/1 with cutoff500
selects two denoising evaluations.

## Resource plan

Reuse the existing canonical shared runtime/catalog at its original path;
verify worker0.14 installed payload and physical idleness before reuse. Keep the
historical0.12 provision report unchanged. The exact three retained resources,
source attribution and recipe assumptions carry forward from the author note.
Epsilon source and managed file are immutable hardlinks; no weight mutation is
allowed through either alias. Do not copy or move the environment.

At entry artifact root allocation is20,090,470,400 bytes, about18.71GiB; disk
free57GiB, available RAM21GiB and RTX4080 total16GiB/about1.3GiB used. LaMa is
absent from the retained pool. Obtain only its pinned205,669,692-byte artifact
with SHA256344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9,
then exercise the actual Main installer using local transport. This qualifies
local publication/verification, not public first setup or a signed release.

One serial native launcher uses MemoryMax12GiB, zero cgroup swap and a1200s
deadline. The guard separately bounds actual KDE-moved Electron/worker scopes
at12GiB each, zero swap and1800s owned-scope timers;12GiB is not an aggregate
limit across all groups. Smaller checks have finite smaller bounds. Record new
evidence/lifecycle dependencies before writes, and keep one reusable ML
environment. Root owns heavyweight runs and cleanup.

## Cases, independent controls and mutations

Planned cases: source txt2img plus canceled/restored outpaint Retry for each
objective: four finite completions, six admissions, two real Cancels and six
pre-admission policy refusals. Source cases provide neighboring healthy controls.
Both profiles retain their baseline Euler/Euler a and Embedded FP32 VAE;
256x256/three steps is bounded execution evidence, not author-resolution quality.

Strengthen qualification assertions before the native run: independent fixed
stage counts, all-stage fixture acceptance, effective-step oracle, source/preview
RGB and accepted-layer placement, plus both noise and outpaint comparison rows.
Mutations must kill a causal behavioral assertion after a healthy baseline, not
fail collection/import/resource setup. Prefer isolated tooling mutation seams;
installed worker changes, if necessary, require byte/mode restoration and
independent startup/physical exit before cleanup.

## Evidence boundary and remaining work

No trained outpaint run had executed at initial research. Final results, exact
command, resource bounds, source/build/installed hashes, semantic REDs, cleanup
and actual physical exit are recorded below. No claim of Invoke pixel
parity, visual quality, component matrix, new-worker Anima regression, authored
masks, Regional Guidance, Smart Patch, dynamic batches, first setup or release
readiness follows from this slice.

## Implemented qualification assertions

The qualification assertions live in opt-in tooling and its tests; the native
discovery below also requires a targeted production refusal-diagnostic fix.
Worker numerics and product scope remain unchanged. `noiseStagePlan` declares the
four/six/two/six outcome explicitly. Independent fixed-value tests cover these
counts and their missing-Cancel/refusal neighbors, including valid outpaint
fixture admission. Relative policy controls cover epsilon and v-prediction,
plus restoration from a trailing baseline rather than assuming one profile.

The installed runner reads the accepted source PNG from the saved package before
geometry edits invalidate revision-bound URLs. It independently checks the
shifted target RGB, protected merged-preview pixels and new-layer composition
at Add, saved readback and reopen. Generated seam pixels remain allowed to
change. Rectangle endpoints and image bounds are validated before pixel loops.
The same read-only comparison dialog checks Changed ZTSNR, Same spacing,
recorded outpaint/current img2img and frozen0.5/current0.25 strength.

An independent pinned native scheduler selects334/1 from667/334/1; its values
are compared to the actual installed adapter's `get_timesteps`. Delivered
progress must retain the resulting total2, reach step2 and never regress or
exceed the total, while allowing coalesced events. Source txt2img retains its
separate exact requested-three-step check.

## Executed tooling and numerical checks

Evidence root:
`~/.codex/artifacts/imagegen-studio/runs/noobai-outpaint/20261007-checks/`.
The canonical pool was physically idle and all43 installed worker source files
matched the active worker0.14 upgrade manifest before reuse. LaMa was downloaded
from the manifest's pinned Sanster release URL; exact SHA256/size verified before
local installation. This one source download is distinct from the runner's
intercepted local Main installer and does not establish engine first setup.

Fresh `pnpm run app:build` passed under3GiB/zero swap/300s, peak1.1GiB. The six
qualification-tooling suites passed239/239 with serial test concurrency under
2GiB/zero swap/180s; actual runtime101.9s, peak183.8MiB. These include real CLI
preflight/filesystem behavior and controlled installer/process peers; they are
not trained inference evidence.

Actual installed CPU semantic mutation: replace the production
`get_timesteps` training-cutoff start index with legacy
`num_inference_steps - int(num_inference_steps * strength)`. Healthy oracle
selected two evaluations for both objectives. The mutant exited1 at
`Installed image-based adapter differs from independent native timestep cutoff`,
not import/setup/OOM. Original bytes/mode and all43 source files were restored;
the independent oracle passed again and CPU processes physically exited. Unit
`igs-noob-outpaint-cutoff-mutation-20261007` used4GiB/zero swap/240s;
actual10.1s/445.3MiB. Fresh native worker startup/exit after restoration is
verified by the subsequent installed application run, once that run finishes.

Six isolated semantic tooling mutations also failed the actual exported guard
tests: unchecked source RGB, unchecked protected-preview RGB, wrong layer X,
legacy effective-step floor, v-only Retry policy and missing policy refusals.
The healthy and restored independent fixed fixtures passed29/29; unit
`igs-noob-outpaint-tooling-mutations-tap-20261007` used1GiB/zero swap/90s,
actual0.6s/43MiB. Repository helper/test bytes were unchanged by these copies.
An initial mutation-report consumer wrongly assumed TAP from Node's default
reporter; the RGB mutant had failed its causal assertion, but that attempt is
not a successful overall run. Explicit TAP fixed the report consumer, and all
six REDs plus restored GREEN were then executed successfully.

## Native-run discoveries before completion

Attempt1 completed the trained v source with Add/Save/reopen/comparison, then
failed in the qualification VAE selector: global `getByText('FP32').last()`
selected the already displayed value, not a menu option. The helper now avoids
reselecting an already authored equal value and scopes changed selection to an
actual visible Naive option. Explicit Auto-from-undefined authoring remains.
This is tooling repair, not an application VAE defect; the attempt is partial.

Attempt2 passed that boundary and admitted/canceled a real mixed-alpha outpaint
job. Changing ZTSNR before Retry produced a real preserving refusal, but the
wrong public diagnostic: `QUEUE_INPUT_INVALID` and generic "Generation storage
could not be verified". `reverifyFrozenQueuedOutpaintGeneration` classifies a
changed verified checkpoint/noise policy as queue-storage invalidity, whereas
ordinary Illustrious request verification uses `IllustriousJobError` with
`GENERATION_INPUT_CHANGED` and a safe literal explanation. Public controller
error projection intentionally suppresses queue-error implementation messages.
The queue input itself remained valid; this diagnosis misleads the user into
reopening instead of restoring Model Manager policy.

Fix scope: preserve all verification and refusal timing, but use the same typed
input-change error for an otherwise valid frozen Illustrious outpaint job whose
verified checkpoint/prediction/noise policy changed. Add a regression through
the real public controller and durable queue for both objectives, three policy
axes and restored frozen Retry; do not widen generic queue-message disclosure
or treat malformed storage as a policy edit. Update behavior/evidence claims
only after this regression, neighboring outpaint/ordinary controls, typecheck,
semantic mutation and a fresh built installed run pass.

## Production diagnostic regression

`generation-queue.ts` now throws the existing `IllustriousJobError` with
`GENERATION_INPUT_CHANGED` and the exact ordinary-path safe literal when the
verified checkpoint/reference/noise profile differs from the valid frozen
Illustrious outpaint input. Verification, timing, resource checks, Anima and
malformed-storage branches remain unchanged; generic queue-error projection is
not widened. This same revalidation helper serves Generate and Retry.

Six public-controller/SQLite regressions cover epsilon and v-prediction ×
prediction, ZTSNR and spacing. They create real durable jobs, cancel a pending
one, retain an existing candidate, change the current draft, and inspect queue,
receipts, seed cursor, target/staging bytes, Project/tabs and saved package before
checking the error. Restoring the policy executes the original frozen payload
and target without new composition. Tiny checkpoint bytes, numerical ML,
composition and auxiliary metadata are explicitly controlled peers; this is
public storage/control evidence, not trained inference.

All six first failed at the intended public diagnostic, then passed after the
fix. The retained isolated whole-source mutation reintroduced the old queue
classification: baseline6 GREEN →6 causal diagnostic RED → restored6 GREEN.
Collection/storage setup and preservation assertions passed before the RED.
Unit `igs-noob-outpaint-public-mutation-20261007` used2GiB/zero swap/240s,
actual4.3s/153.1MiB; the repository source was not mutated by this copy.

Eight neighboring production suites passed227/227 under2GiB/zero swap/180s,
actual17.7s/259.1MiB. Full `pnpm run typecheck` passed under6GiB/zero swap/300s,
actual17.3s/1.5GiB. Initial full lint found13 fixable formatting/import-order
issues in the new test; after fixing only that file, its44 public tests passed
again and full lint passed under6GiB/zero swap/300s, actual33.5s/3.6GiB.
Fresh production build after the diagnostic fix passed under3GiB/zero
swap/300s, actual1.6s/1.1GiB. The subsequent fresh installed application run,
including native worker startup and physical exit, confirms the trained outcome
below. The agent's initial RED/GREEN outputs were tool stdout only; retained
causal logs belong to the root's isolated whole-source mutation report. Final
typecheck after test formatting also passed, actual16.0s/1.5GiB under the same
6GiB/zero-swap/300s bound; no code changed during final documentation formatting.

## Final installed execution and exact evidence

`native-green3/report.json` is **passed**, with no failures or renderer page
errors. Four finite completions comprise two genuine opaque txt2img source
preconditions and two completed frozen outpaint Retry operations; six actual
admissions include two genuinely canceled originals. Six independent preserving
Retry refusals cover prediction/ZTSNR/spacing for both objectives. These are not
four completed outpaints or a combined full numerical/component matrix.

Each shifted target retains49,152 exact overlapping source pixels and16,384
transparent pixels. Its320×256 accepted merged preview retains55,552 protected
source pixels exactly, including39,168 inside the outpaint bbox. Contribution
alpha, original layer assets/properties and captured(64,0) unit placement pass
Add, explicit Save, independent package readback and reopen. Same-dialog
comparison records Changed ZTSNR/Same spacing, outpaint versus current img2img
and frozen0.5 versus current0.25 strength. Restored Retry preserves source,
frozen seed0 and exact inputs despite current draft edits. Completion does not
rewrite the saved package before explicit Save.

Both actual image-based adapters equal the independent pinned native schedule:
requested3 with strength0.5 selects334/1 from667/334/1, and observed progress
reaches2/2. Source txt2img separately reaches3/3. The restored installed worker
started and physically exited through the real native application. All43 source
files still match the worker0.14 upgrade manifest; `inference.py` remains
`c5d6bbe89ad51e8b60233ee6915bad143bee55f481b4c9fdd559501bacc6cd32` with its
original mode. Exact source weights are unchanged and catalog closure is three
resources/three versions/no new managed model files. The pool is independently
confirmed idle after native exit; its active pointer and historical0.12 report
are retained.

LaMa is205,669,692 bytes with
`344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9` at source and
managed destination. Attempt1 exercised real Main local installer publication;
the successful run reused and reverified those exact bytes. Transport remains
intercepted/local, distinct from the root's real source download. No runtime
installer, token service or public model delivery readiness follows.

Exact successful command (PATH uses the Node24.16.0/pnpm11.9.0 installation):

```bash
systemd-run --user --unit=igs-noob-outpaint-native3-20261007 \
  --wait --pipe --working-directory=~/Work/imagegen-studio \
  --setenv=PATH=~/.nvm/versions/node/v24.16.0/bin:/usr/bin:/bin \
  --setenv=NODE_OPTIONS=--max-old-space-size=512 \
  -p MemoryMax=12G -p MemorySwapMax=0 -p RuntimeMaxSec=1200 -p LimitCORE=0 \
  ~/.nvm/versions/node/v24.16.0/bin/node --import tsx \
  scripts/qualify-installed-generation.mjs \
  --fixture ~/.codex/artifacts/imagegen-studio/runs/noobai-outpaint/20261007-checks/fixture-outpaint3.json \
  --resume
```

Actual launcher duration12m28.081s, peak12,868,546,560 bytes (about11.99GiB), zero swap.
The independently guarded KDE-moved Main scope peaked2,221,342,720 bytes
(about2.07GiB) and had its own12GiB/zero-swap/1800s timer; these are separate
groups, not an aggregate12GiB
budget. Native exit code0 and physical identities/owned scope exit are confirmed;
the deadline timer was stopped. Initial failed reports are retained as partial:
`native-green/report.json` (selector), `native-green2/report.json` (diagnostic).
They do not count as successful outpaint qualification.

Successful report source/build fingerprints:

| Input                      | SHA256                                                             |
| -------------------------- | ------------------------------------------------------------------ |
| Qualification script       | `abf27985bdd8b2f3cd86df3e251e2feac9e8ae463f47072b55458951c761c56d` |
| Noise qualification helper | `ef2b69738a9726437d9b1440484e853327a813e8935ce0d535cdb3f9c236492f` |
| Worker lock                | `5526e7408e31d244975a6147165bad52457138640016a0576bbec87bebe5c5af` |
| Production Main bundle     | `228405e60f5a84a95dd8ea4037956fb8d84beaa8a4ba4ec25f799ed2d8d3de7d` |
| Production preload bundle  | `6c9a07c13c2eb5cfd22a1be4da0990f895baf260945d771e052d018231de84f7` |
| Production renderer JS     | `9dea4dcba6609bb9cdc4c5dd953334f5d8a78c7c3f168c6c9252757a56ed1c9d` |

The final report also retains renderer HTML/CSS, scheduler tensor, model/source
recipe, frozen payload/target, contribution and preview hashes. Supporting raw
evidence: `guards.log`, `neighbors.log`, `typecheck.log`, `lint2.log`,
`build2.log`, `format-recheck.log`, `final-format.log`, `final-typecheck.log`,
`final-verification.json`, `native-green3.log`,
`installed-timestep-mutation/report.json`, `tooling-mutations/report.json`,
`public-refusal-mutation/report.json` and their causal RED/restored logs.
Existing evidence paths are preserved; use a new artifact destination for reruns.

## Review, cleanup and next gate

This is source-informed implementation/self-review, not a blind audit. An agent
reviewed the final error-classification/public-regression diff and qualification
assertions read-only; no material defect found. The native diagnostic/persistence
path is separately exercised above. PP-004/005/007/008 bodies and matrix rows
retain “Пока не обещать”; roadmap/supporting contracts distinguish this new
checkpoint from historical author/both-family evidence.

After physical exit and exact restoration, removed only owned isolated source/test
copies and the released installed-mutation rollback file. Compact reports/logs,
failed reproduction reports and final GREEN remain. Actual cleanup removed22
owned paths, reclaiming7,950,336 bytes; artifact root allocation changes from
20,516,851,712 to20,508,901,376 bytes (about19.1GiB), below the30GiB soft budget.
`cleanup.json`, run/shared `artifact-lifecycle.json` and the final pool verification
record these dependencies. The canonical worker/catalog/LaMa source+managed bytes
remain pinned for subsequent component/Anima/dynamic qualification; no extra
runtime or model copy was created for this slice.

Next: component/type-aware NoobAI resource matrix and trained Anima regression on
this worker, then dynamic multi-job batches. Integer-placement opaque-source
normal outpaint evidence does not qualify arbitrary transforms, full LoRA/
embedding/external-VAE combinations, new-worker Anima, authored masks/inpaint,
Regional Guidance/Smart Patch, Presets/result-to-preset, first setup, signed
release, image quality or Invoke pixel parity. No new protocol/capability,
numerical algorithm, standalone SDXL family or backend was introduced.
