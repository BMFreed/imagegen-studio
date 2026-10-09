# Installed Random and uint32 seed boundaries

This qualification follows the [dynamic embedding subset gate](./phase-2c-illustrious-dynamic-embeddings-research.md).
It tests the existing production seed contract rather than adding a new seed policy.
The entry revision is `645e626ad6e455cea5dbbfda2ea2405343f77d81` on `master`.

## Contract and risk

[Dynamic Seed Behavior](../features/project/generate-mode/dynamic-prompting.md#seed-behavior)
requires one Random base per Generate batch, pair-major ordering, per-iteration
sharing or per-prompt advancement, unsigned 32-bit wrap, frozen requested policy,
and actual completed seeds in accepted provenance and the explicit Save snapshot.
PP-004/005/007/008 retain their current public readiness status.

This is a high-risk qualification of renderer/Main/worker/queue/acceptance/Save
boundaries. Production seed algorithms, worker payload and the supported actual-seed
deviation contract are unchanged. Test-only Main observation and temporary installed
worker mutations need exact cleanup, physical exit and bounded execution.

## Data path and independent expectation

The real Random switch and Fixed input update Project generation draft. Generate
captures that draft and target, resolves one seed in family preparation, and the
pure Main batch planner assigns seeds. Frozen context and native request must agree.
Verified worker completion commits receipt and document-scoped cursor together;
Add copies the actual seed and requested policy/behavior into immutable provenance.
Explicit Save snapshots the current cursor after preview creation. Reopen and
read-only comparisons must retain each accepted layer's original values.

The new DI profile observes the original Main `node:crypto.randomBytes` result:
the wrapper forwards the receiver and arguments and returns the same Buffer.
Only four-byte calls through family preparation are recorded. The first admitted
seed must equal the observed numeric base, with exactly one such call. The original
function identity is restored before subsequent authoring/inference observation.
Later queue rows never supply their own expected seeds. The independent oracle
expands the recorded base and uses literal endpoint tuples; it does not import a
production seed planner or RNG.

## Finite matrix and parameters

Each of Anima, Illustrious EPS and Illustrious v-pred executes the following bounded
sequence using the same existing worker0.14 runtime/catalog:

| Stage              | Pairs × iterations | Policy / behavior                   | Expected seeds                                |
| ------------------ | ------------------ | ----------------------------------- | --------------------------------------------- |
| Random             | 2 × 2              | Random / per iteration              | base, next, base, next                        |
| Numeric replay     | 2 × 2              | Fixed recorded base / per iteration | same as Random                                |
| Wrap               | 2 × 2              | Fixed4294967295 / per prompt        | 4294967295, 0, 1, 2                           |
| Installed mutation | 2 × 2 admitted     | Same wrap inputs                    | Stop on first same-input pixel RED before Add |
| Fresh restoration  | 1 × 2              | Fixed4294967295 / per prompt        | 4294967295, 0                                 |

Here `next = (base + 1) % 4294967296`. The full authored positive/negative templates
are retained; maxPrompts2 selects red/blurry and red/noisy in pair-major order, while
the restored maxPrompts1 selects the first pair. This is a finite ordered-prefix
check, not general maximum32 native or arbitrary truncation qualification.

All jobs use256×256 and three TXT evaluations with exact signed LoRA−0.5. Anima
uses Euler/CFG4/native BF16 and its verified Qwen3/VAE. EPS uses Euler a/CFG5/
non-ZTSNR; V uses Euler/CFG5/ZTSNR. Both use leading spacing, Normal scheduler,
native external VAE/FP32, CFG Rescale0 and no embedding sidecars. No models/runtime
are installed, copied or downloaded. Full source identities and catalog/default
preservation remain independently bound by fixture and actual file hashes.

Launcher/native/combined memory limits are2/≤12/14GiB, swap0. Each native stage
has a1200-second launcher deadline and a bounded owned native scope with physical
exit checks. Pure/source tests use finite3GiB/swap0 limits. File cache contributes
to `memory.current`; bounds record anon/file separately and do not measure cold
performance or promise release memory requirements.

## Mutation design and neighboring controls

Fixed numeric replay may omit only requested policy when matching Random execution.
All native inputs, signed LoRA, prompts, actual numeric seed and seed behavior remain
equal; same-runtime RGBA pixels must match before Add. Saved requested policy is
still Random versus Fixed. Current prompt/sampler/seed37/LoRA/dynamic edits cannot
change frozen/native/portable records. Each saved layer's comparison treats a legal
Random seed36/37 according to actual equality, rather than assuming every seed
differs from the current37.

Installed mutation clears the high bit only where the CPU generation-noise generator
consumes `command.seed` (Illustrious) or `captured.seed` (Anima), preserving declared
MAX inputs and completion metadata. Same-input pixel RED is required, with0 accepted
mutant layers. This is separate from generic worker receipt validation: a correlated
valid returned uint32 seed differing from planned seed remains supported.

Protected rename retains the original installed module inode/mode/size/mtime/bytes;
temporary replacement is isolated from linked originals. Root owns mutation and
cleanup, waits for physical Main/worker exit, restores all43 original worker sources,
checks backup absence, then runs fresh MAX/0 controls against the healthy wrap pixels.
Stopping after the first MAX RED does not execute a mutant low-seed GREEN control;
fresh original MAX/0 controls and lightweight planner controls are distinct evidence.

The existing actual planner test detects isolated removal of final modulo:
13 tests,11 pass/2 semantic assertion failures. Swapping per-iteration/per-prompt
offset selection yields13 tests,10 pass/3 semantic failures. Original isolated and
fresh production baselines each pass13/13. The isolated payload was restored and
removed after physical service exit. A PATH setup failure before tests is recorded
separately and does not count as semantic RED.

## Test boundaries and review

The focused producer tests call actual Project preparation, the production batch
planner, Anima request building, durable payload parsing and provenance projection.
The new oracle tests feed those outputs into an independent literal expectation;
they do not implement a seed planner inside the test and then test that planner.
The EPS unit example assembles a worker job before passing it through the actual
durable parser. It therefore does not, by itself, prove EPS request assembly;
installed EPS runs and raw native payload checks cover that boundary.

Fake browser methods and named preparation callbacks are limited to profile wiring
and observer mechanics. A serialized VM callback test uses the actual observer
code, original Node crypto result, receiver and arguments. It detects the previous
dynamic-import bootstrap failure without requiring Electron; native runs separately
prove that the observer works in the actual built Main process.

This is an implementation-aware self-review with a second read-only source review,
not a blind product audit. The raw evidence reader uses SQLite, ZIP and Pillow,
without importing application rules, the production planner or the qualification
oracle. It independently verifies ordered requests, receipts, PNG pixels, accepted
provenance, saved snapshots, comparisons, preserved rows and physical restoration.

## Execution evidence

All fifteen native stages completed on 09.10.2026, including three intended
same-input pixel failures before Add. The independent SQLite/raw ZIP/Pillow reader
passed **15,006 assertions**. The uniform qualification contains **54 admissions,
45 finite completions, 42 accepted saved layers, twelve saved/reopened packages
and nine APP_RESTART cancellations**. Completions comprise36 ordinary, six fresh
restoration controls and three provisional mutant outputs. Every accepted layer
has an observed read-only settings comparison; no mutant layer was accepted.

| Pipeline           | Original Main Random base | Per-iteration sequence                         | Random/replay saved cursor |
| ------------------ | ------------------------- | ---------------------------------------------- | -------------------------- |
| Illustrious EPS    | 3512241929                | 3512241929, 3512241930, 3512241929, 3512241930 | 3512241930                 |
| Illustrious v-pred | 561640902                 | 561640902, 561640903, 561640902, 561640903     | 561640903                  |
| Anima              | 922853605                 | 922853605, 922853606, 922853605, 922853606     | 922853606                  |

All twelve Fixed replay pixels equal the corresponding Random outputs. Each
healthy wrap stage admits/completes literal MAX/0/1/2 and saves cursor2; each fresh
restored stage repeats MAX/0 pixels and saves cursor0. The completed Random draws
did not happen to equal0 or MAX. Endpoint Random-base behavior is source/unit
evidence, not an installed endpoint draw claim.

Raw totals are separately **58 new admissions,49 finite completions,46 accepted
saved layers, thirteen saved packages and nine cancellations**. The extra four
healthy EPS Random outputs (base1713683585) were already saved before a shared
test-selector repair. They remain valid historical evidence but are excluded
from the uniform seventeen-source manifest. Strict source guards required a new
Random baseline after that repair; the old report and exact old driver are retained.

Two native setup failures are retained separately with0 admissions/0 outputs:
Electron's serialized evaluation lacked a dynamic-import callback for the first
observer implementation, and a global text locator selected the popup trigger
instead of the requested seed-behavior option. The observer now uses
`process.getBuiltinModule`; the shared runner uses its existing scoped select
helper. Neither failure counts as numerical RED or failed model inference. The
serialized callback regression and actual subsequent native stages cover the fixes.

The reader accounts for every raw new job, verifies all receipts and all thirteen
real packages, and preserves the prior302 whole queue rows,186 cursor rows,
249 receipts,9 model resources/14 versions, dependency/default policies and eight
original model/component/LoRA identities. Entry raw values were reconstructed
from current rows and checked against genuine pre-run whole-row digests and pinned
earlier receipt evidence; this is explicitly not an entry-time raw copy. Delivery
pins seventeen qualification sources and five built application artifacts. All43
original installed sources/assets, original mutation-file attributes and backup
absence were verified after restoration; Main and worker are physically idle.

The largest observed combined owned-memory peak was14,157,291,520 bytes
(about13.18 GiB, Anima wrap), within the14 GiB watchdog ceiling. Launcher/native
cgroup limits remained2/12 GiB, swap0; no stage had an OOM, deadline failure or
watchdog stop. Recorded anon/file component peaks occur at different instants and
must not be added as a simultaneous-memory measurement.

Raw evidence lives in
`~/.codex/artifacts/imagegen-studio/runs/generation-seed-boundary/20261009-checks/`:
`final-evidence.json`, fifteen reports, fixtures, bounds/logs, protected restoration
journals and source manifests, plus the separately retained superseded/setup runs.
The independent reader `aggregate.py` has SHA256
`eb8d8508a7eacd944995a0f57b4580d93470e060fc76bd902435e22028186402`;
`final-evidence.json` has SHA256
`c74b31ba1dd2054eb3320099f960d8ba83b9e96baf2fb34eb73ac009248facda`.
The command is `pnpm exec tsx scripts/qualify-installed-generation-seed-boundary.mjs
--fixture <absolute fixture>`, executed serially through the recorded bounded
launcher. `pnpm run app:qualify:seed-boundary` additionally builds the application.

## Final checks and artifact lifecycle

The fresh production build passed before native qualification; all source and
bundle hashes stayed fixed throughout those runs. The final focused selection
contains twenty test files: the new oracle/profile/CLI, previous Anima/Illustrious
dynamic and embedding qualification regressions, actual family preparation,
orchestrator/batch planner, provenance and settings-comparison tests. Executed
with `tsx --test --test-concurrency=1`, it passed **309 tests,0 failures,0 skipped**
inside3 GiB/swap0/300 seconds. Full `pnpm run typecheck` passed within6 GiB/
240 seconds; full `pnpm run lint` passed within6 GiB/swap0/180 seconds and
4 GiB Node heap. The first lint attempt exhausted an intentionally smaller
1.5 GiB Node heap (exit134, host cgroup peak about2.2 GiB); that retained resource
failure is separate from native/model results and semantic mutations. No code
or lint rule was changed to obtain the successful repeat. Prototype components
were unchanged, so no prototype UI-suite result is claimed.
Formatting and `git diff --check` passed; all774 relative targets and38 local
Markdown anchors in the five changed documents resolve. Final verification
confirmed all seventeen qualification source and five application bundle hashes.

Artifact closure confirms physical Main/worker exit, all three protected journals
restored, no displaced originals, and no new runtime/weight copies. The existing
shared worker0.14/catalog is retained for the next concrete cap32/truncation gate.
The root grew from28,039,958,528 to28,077,809,664 allocated bytes (about26.15 GiB);
this run uses28,794,880 bytes and all `runs/` evidence uses213,618,688 bytes.
Both soft budgets remain satisfied. Actual root cleanup reclaimed0 bytes:
there are no new disposable bulky payloads; the restored isolated planner scratch
was already removed. Compact normal/RED/fresh, setup/superseded evidence and
their shared-runtime dependencies remain pinned. Both lifecycle records name
the next gate and clear protected rollback paths only after restoration/exit.

## Remaining scope

This gate does not qualify maximum32 native inference, the full seed-policy/mode
matrix, arbitrary geometry/components/formats, quality/Invoke parity, cold-cache
performance, public installation/delivery or the Linux/NVIDIA release. It does not
change Random distribution, add a deterministic debug seed or tighten the generic
actual-seed deviation contract. Replacement document identity and full MVP remain
separate checks.

The next finite gate is installed cap32 and bounded truncation qualification.
