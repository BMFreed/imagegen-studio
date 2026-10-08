# NoobAI: multiple-LoRA through the installed application

## Scope and boundary

This high-risk qualification extends the [native multiple-LoRA gate](./phase-2c-noobai-lora-stack-native-research.md)
through actual Project controls, Main preparation, durable frozen queue, installed
worker0.14, provisional candidate, explicit Add, portable Save/readback/reopen and
read-only comparison. Product contracts are [LoRA stack](../features/project/generate-mode/lora-selector.md)
and PP-004/005/007/008 in [Product promises](../product-promises.md).
Base revision: `8f6f8ee1dcde153cef48829e44bae69d88fb066d`, clean entry.
Production application and installed worker behavior are unchanged; the opt-in
qualification harness and its guards are the implementation under review.

The finite matrix is one EPS or v_prediction objective per invocation,
TXT-only,256×256/three requested steps/seed0: `ab`, `ba`, `b-zero`, `b-disabled`.
DigitalArt A uses−0.5; Lineless B uses+.75, enabled0 or disabled+.75.
The UI has no dedicated reorder action: BA uses explicit Remove→Add.
The native986 targets/source gate is prior separate evidence, not additional
images in this run. Pixel equality/inequality between AB and BA is deliberately
unspecified for actual FP16 accumulation. Zero/disabled is an independent
neighboring pixel control. This is not image-quality, Invoke parity, arbitrary
format, img2img/outpaint, new Cancel/Retry, dynamic, Anima or release evidence.

## Data flow and invariants

Source files and metadata → controlled Main ModelDownloader transport/staging →
SQLite exact installed versions → real Add LoRA controls/row weights/switches →
Project draft → public Generate → exact enabled resource verification → frozen
full configured stack plus ordered enabled context/wire subset → installed native
FP16 model/LoRA loading and denoising → verified receipt/candidate → explicit Add
→ immutable portable provenance → worker previews and real `.igs` writer/loader
→ reopened Project and comparison.

Only the exact second trained source may be adopted: official CivitAI
model1795307/version2031703/file1934353, creator Underdorks, credit required,
SHA `90f9f879ff2e27fcaec5723a2c3e5db53ec5ffbdd4c7df49159c0ccbfe63b1ca`,
171540060 bytes. The nine existing identities remain mandatory. Initial catalog
is5/9 or exact already-adopted6/10; final6/10. At most one additional managed file
on first adoption, zero on reuse. Source paths are read-only preconditions;
controlled transport is not a claim of live CivitAI product installation.

Every configured enabled/disabled/zero entry retains identity, position, weight
and enabled state in frozen/portable tuples. Only enabled entries dispatch;
enabled0 still verifies and dispatches. Later live Remove→Add and weight/prompt/
seed37/VAE edits must not alter queue payload, accepted settings or saved/reopened
provenance. Saved authoring draft retains those actual edits independently.
Comparison must show ordered recorded/current source/version/weight/enabled values
without changing draft/history/bbox/layers, recovery/autosave bytes or `.igs`.

## Failure plan and alternatives

An omitted/substituted adapter or swapped source-bound weights is detected by
independent fixture tuple guards and matched zero/disabled neighbors. Metadata
alone cannot prove actual numerical weight assignment: after healthy baselines,
an installed loader weight-swap mutation must produce a causal decoded-pixel RED
against a source/bundle-bound same-input normal report, before explicit Add.
A fresh restored EPS matrix must reproduce the healthy normal pixels.

Unsupported stages, incomplete source identities, missing creator credit, invalid
baseline descriptors, old capabilities or non-resume fail before original source
reads, publication or ML. Existing profile guards retain their original strictness;
new6/10 ownership does not silently relax prior5/9 profiles. Unknown changes to a
mutable runtime are never overwritten during rollback. Restoration preserves
original inode/mode/mtime/bytes, all43 worker source files and absence of backups,
and requires actual process exit including KDE-moved scopes.

## Resource registry

| Parameter                  | Bound/source                                                | Behavior                                                                     |
| -------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Runtime                    | Existing canonical qualified worker0.14/pinned dependencies | Reuse one environment, no duplicate provisioning                             |
| Geometry/steps             | 256px/3; finite helper plan                                 | Reject undeclared matrix before ML                                           |
| Launcher RAM/swap/deadline | 12GiB/0/1200s systemd group                                 | Finite hard failure; moved native scopes are separately bounded and observed |
| GPU                        | NVIDIA RTX4080,16376MiB total                               | Actual CUDA denoising, no CPU-only quality claim                             |
| New weights                | 171540060 bytes exact Lineless                              | One independent managed copy; preserve original                              |
| Artifact soft budgets      | 30GiB root/1GiB evidence                                    | Inspect and prune only proven idle disposable data                           |

Separate scope caps do not establish a single aggregate12GiB bound. Host swap
already in use belongs to other processes; task groups require swap0. Root is
sole heavy executor and cleanup owner. Source/bundle/manifests, readonly entry
SQLite snapshot, physical-idle check and disk/RAM/GPU inventory precede execution.

## Executed evidence

Raw evidence is retained under
`~/.codex/artifacts/imagegen-studio/runs/noobai-lora-stack-ui/20261008-checks/`.
This is a self-review of the changed harness, with separate read-only agent
review of its guards and documentation. Production UI/IPC, Main, installed
worker, SQLite, candidate acceptance and `.igs` writer/loader remain real.
The application bundle is byte-identical to the previously qualified bundle,
as recorded in `bundle-reuse-proof.json`; no new production build is claimed.

| Execution                          | Observed boundary/result                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Normal EPS TXT                     | Four admissions/four complete Generate → Add → Save/readback/reopen/comparison cycles: AB/BA/B-zero/B-disabled    |
| Normal v_prediction TXT            | The same four choices and four complete cycles on the exact trained v-pred checkpoint                             |
| Installed source-bound weight swap | One completed provisional AB job; exact same-input pixel mismatch before Add; no accepted mutant layer/full cycle |
| Fresh restored EPS TXT             | Four full cycles; all four decoded pixel SHAs exactly reproduce the corresponding healthy EPS result              |

`native-eps-txt2img/report.json`, `native-v-txt2img/report.json` and
`native-restored-eps-txt2img/report.json` are passed. In every matrix,
B-enabled-zero equals B-disabled in decoded pixels; both full AB and BA stacks
differ from those controls. There is no assertion about AB versus BA pixel
equality, image quality or visual style. The EPS/V recipes, FP32 external VAE,
trained embedding in both prompts, target, seed and all other semantic inputs
are held constant within each matrix. Exact configured and effective tuples
are checked independently before normalization removes the declared LoRA axis.

After queue admission, actual current Remove → Add reverses the authoring stack;
A changes to −0.25, B to +0.125, prompts change, seed becomes37 and current VAE/
embedding selections are removed. Frozen input and accepted settings remain
the captured ordered stack/weights/seed0. The saved/reopened authoring draft
retains the later edits. Read-only comparison checks ordered name/version/SHA,
enabled state and weight, plus no draft/history/bbox/layer/package/recovery/
autosave changes. The UI interaction combines order and weight edits; it is not
an order-only comparison oracle. The existing production comparison test covers
order-only `Changed`. The new text guard does not independently assert every
rendered family/kind/CivitAI-ID description line; exact portable CivitAI IDs are
checked separately in the frozen/provenance/archive evidence.

The mutation inserts a second `set_adapters` call that exchanges only the two
source-bound weights, preserving correct names and frozen payload. The actual
installed worker completes an otherwise valid candidate. The same-source,
same-bundle, same-choice healthy reference then fails with
`Installed multiple-LoRA pixels differ from the retained healthy same-input reference.`
The mutant pixel SHA is
`264ec6fbea73a4de7a1436241b8523b194785a89d53d0db1054f1d0786541913`,
versus healthy EPS AB
`ce099516547369b4002b436c9252b8491164d9f42dc22ab825fdf1623343fe64`.
This is a numerical RED, not an import/fixture/capability/OOM failure. Protected
rollback confirms original inode/mode/mtime/bytes, all43 source files and backup
absence after actual native process exit. Fresh EPS4 then passes without
weakening the pixel assertion. Its exact source binding is retained alongside
the normal and mutant reports.

An independent `aggregate.py` imports no production helpers or worker code. It
reads SQLite directly, opens all12 qualified saved ZIPs, verifies mimetype,
manifest members/lengths/SHAs/revisions, full portable identities/order/enabled/
weights, actual receipt and accepted PNG, opaque256px RGBA, merged preview
pixels, later authoring draft and read-only comparison result. It also verifies
the matched pixel controls, fresh same-choice equality, original catalog/queue
rows, protected restoration and physically idle worker/application. Its passed
`final-evidence.json` records catalog6/10, one additional managed file,12
qualified saved packages and14 admissions: normal8, fresh4, one excluded saved
setup partial and one unaccepted provisional mutant. The original153 queue rows
are unchanged; final queue contains167 completed rows. Historical native
algebra observations are not added to these image counts.

## Setup failures and harness corrections

Three failed setup attempts are retained separately and excluded from the eight
normal and four fresh qualified cycles:

1. `setup-url-pin-failed`: the local transport only allowed the earlier EPS URL
   and refused the exact Lineless URL before publication/UI/ML. The helper now
   admits those two exact URLs only. Real Main downloader tests cover a matching
   Lineless URL and refusal of a neighboring file ID before local source reads.
2. `setup-publication-shape-failed`: real Main download/hash/size/staging and
   catalog publication succeeded, creating the sole171,540,060-byte Lineless
   managed file. The new fixture guard expected the three identity fields while
   publication also returned two additional fields. Only the new profile now
   projects the required identity subset; other profiles retain their original
   fixture contract. There were no UI jobs in this attempt. Subsequent normal,
   mutant and fresh runs reuse this published version and add zero files.
3. `setup-comparison-parser-failed`: one actual AB image reached Add, Save and
   reopen; the harness incorrectly expected weight on the name line rather
   than in the existing multiline resource description. The guard now checks
   each complete ordered description block, with a literal multiline regression
   test for reordered/substituted/missing entries, weights and enabled state.
   This is one saved setup partial, not a full qualified cycle or a numerical RED.

These failures corrected the qualification harness. No production behavioral
defect was identified or production implementation changed in this checkpoint.

## Verification and handoff

Final focused run:499 passed,0 failed/cancelled/skipped,139.6s,359.5MiB peak,
task-group swap0,3GiB cap/300s deadline. It covers the new literal stack/
multiline guards, existing noise/component/encoder/polarity guards, actual CLI
preflight, genuine controlled-source Main downloader, Project service/
preparation and settings comparison. `pnpm run lint` passes with a6GiB cap/
300s deadline;32.97s,3.7GiB peak/swap0. Commands and complete logs are retained
in `final-focused.{log,bounds.json}` and `final-lint.{log,bounds.json}`:

```sh
pnpm exec tsx --test --test-concurrency=1 \
  scripts/noobai-lora-stack-qualification.test.mjs \
  scripts/noobai-noise-qualification.test.mjs \
  scripts/noobai-components-qualification.test.mjs \
  scripts/noobai-vae-encoder-qualification.test.mjs \
  scripts/noobai-embedding-polarity-qualification.test.mjs \
  scripts/qualification-local-civitai.test.mjs \
  scripts/qualify-installed-generation.test.mjs \
  src/main/projects/project-service.test.ts \
  src/main/projects/project-generation-preparation.test.ts \
  src/shared/projects/generation-settings-comparison.test.ts
pnpm run lint
```

The lower-level guard tests use independent literal fixtures and test the
exported harness boundary. They do not themselves prove trained inference;
actual system qualification and installed semantic mutation supply that
evidence. No full `app:test`, Python suite or prototype run is claimed here;
production TypeScript/Vue/Python and prototype UI did not change.
Qualification uses an opt-in profile:

```sh
pnpm exec tsx scripts/qualify-installed-generation.mjs --fixture <exact-eps-or-v-fixture.json> --resume
```

Fixtures, bounded launcher commands/logs, entry/final catalog and source
manifests, the mutation plan/rollback journal, raw packages/screenshots and
independent aggregate remain in the run directory. The runner SHA is
`93e47bedb1aba08b9ca2619f4160f4d062500987890f60a838c840ec21f5afa8`;
the new helper SHA is
`81b2fe9f17c3d96408f0cf4ed9d9351d80fc7ccbad304cceba8db106dba3bfda`.
Both match the executed normal/mutant/fresh reports. Source hashes bind the
harness; separate entry/restored/final43-file manifests bind the installed
runtime. Earlier native algebra evidence remains separately bound to its own
oracle and execution reports.

Normal EPS/V and fresh EPS finish within their20-minute launcher deadlines;
observed launcher memory peaks are8.1/7.9/9.6GiB, each with task-group swap0.
The mutant fails at the intended assertion in2min32s with8.6GiB peak/swap0.
The launcher and KDE-moved native scopes are separately bounded; these values
are not aggregate host memory or host swap measurements. All owned processes
are physically exited before final inventory or cleanup.

Completion inventory in `cleanup-and-inventory.json`:22,172,254,208 allocated
bytes under the artifact root,22,070,394,880 in the single shared pool,
101,851,136 compact evidence and8,290,304 in this run;57,380,446,208 bytes free
on the filesystem. Both30GiB/1GiB soft budgets are satisfied. Reclaimed0 bytes:
no disposable runtime/checkpoint copies were created; the only new managed
weights are the intentional exact Lineless catalog dependency. The restored
rollback journal is compact evidence and its backup is absent. Current pool/
run lifecycle records retain the actual source, saved packages, frozen queue
and normal/mutant/fresh evidence dependencies. The single pool is pinned for
trained Anima0.14/dynamic follow-up, with release after those gates or verified
replacement; no new runtime copy was provisioned.

PP-004/005/007/008 bodies and matrix rows retain «Пока не обещать». The next
separate component gate is trained Anima on worker0.14, followed by dynamic
multi-job batches. Arbitrary formats/all-layer compatibility, img2img/outpaint
multiple-LoRA combinations, quality, Invoke parity, public delivery and release
remain open. This finite qualification does not certify the whole MVP.
