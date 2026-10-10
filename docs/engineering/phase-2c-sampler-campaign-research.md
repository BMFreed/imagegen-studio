# Installed numerical campaign for the five remaining samplers

## Boundary and finite plan

Entry: `1b742c3cba2977815b78f18a14c17fa5f66207fc`, clean `master`.
Continue [Anima DPM++ 2M image qualification](./phase-2c-anima-dpmpp2m-image-research.md)
in one campaign. The five algorithms already exist; this is high-risk numerical
and durable qualification of PP-004/005/007/008, the
[worker contract](../specs/05-worker-protocol.md),
[immutable provenance](../features/project/generate-mode/generation-provenance.md)
and [explicit acceptance](../features/project/generate-mode/generation-results.md).
It does not change supported models, introduce another runtime or claim release readiness.

The actual boundary is built Project Import/Generate → Main composition → frozen
SQLite admission → installed worker0.14 → temporary RGBA candidate → explicit Add
→ Save/readback/reopen and owning settings comparison. Only the OS import chooser
is controlled. CPU tests separately enter actual native loops with tiny models
and independent Diffusers or pinned external Invoke references. They prove
numerical wiring and mutation sensitivity, not trained-model quality.

The closed registry has three Anima methods: DPM++ 2M SDE, ER-SDE and LCM. Each
has eight runs: healthy IMG neighbor, IMG history and OUT history; matching three
provisional mutation controls; fresh restored IMG/OUT history. DPM/LCM use four
authored steps, ER five. Only strength differs between the neighbor0.5 and
history0.75 of a method. The selected grids retain an effective second-order
update, ER third-order nonterminal update or second LCM stochastic draw only in
the sensitive case. ER terminal dispatch alone does not prove the third-order term.

Illustrious/NoobAI has DPM++ 2M and DPM++ SDE, each with Normal/Karras. Each pair
has eleven runs: healthy TXT history, IMG neighbor, IMG history, OUT history;
four matching provisional controls; restored three history cases. Authored steps4,
history strength0.75; neighbor strength0.5 for 2M and0.05 for SDE. Production
IMG clipping uses the training timestep cutoff and native scheduler order,
not authored-steps multiplication. SDE has seven raw TXT callbacks, five raw
history IMG/OUT callbacks and one terminal-only neighbor callback. The captured
installed Diffusers0.40 grids confirm this for both schedules.

Planning totals are68 admissions/completions,43 accepted saved/reopened results,
25 provisional controls,18 numerical RED and7 neighbor GREEN. These are
expectations until executed and independently verified. All cases use256×256,
CFG4, Fixed0, weighted positive red1.3/negative blurry0.7 and one signed LoRA−0.5.
IMG imports the same opaque source at bbox0. OUT moves the bbox64 pixels right,
retaining192 opaque/64 transparent target columns, pinned LaMa and existing
contribution-alpha policy. Illustrious uses the pinned EPS NoobAI checkpoint,
explicit false-ZTSNR/leading profile and FP32 external VAE.

## Mutations, failure and restoration

Five narrow actual-worker mutations are exercised separately, never in shared
Diffusers dependencies:

- Anima SDE: reset only its native lower-order history counter before each step.
- Anima ER: omit only the third-order `dd_x0` contribution in the vendored scheduler.
- Anima LCM: restart its step RNG before each step, repeating a draw.
- Illustrious2M: reset native history after the actual pipeline callback while
  retaining configured solver order2.
- Illustrious SDE: change its explicit Brownian seed domain while retaining
  the configured algorithm and deterministic seed delivery.

Each has a neighbor whose full RGBA must remain identical and sensitive cases
whose RGB must differ where alpha>0. Hidden OUT RGB alone is insufficient; alpha
must remain identical. Numerical RED occurs after successful generation and
before Add; every control has zero acceptance and preserves its saved package
(empty for TXT, source-only for IMG/OUT). Setup, collection, import, resource and cleanup failures are
separate outcomes and never count as a killed mutation.

Before mutation, verify healthy baselines, exact installed43-file bytes and
physical process exit. Journal and retain the original inode in a protected
rollback directory before replacement. Restoration refuses an unknown
intervening change. After physical exit, restore original byte/inode/mode/mtime,
then require fresh complete-RGBA replay of every sensitive baseline, followed
by Add/Save/reopen. Persisted raw rows, catalog, source files and immutable
provenance must survive the whole campaign. Interruption leaves recoverable
rollback evidence; do not delete protected data or resume generation with an
undeclared source delta.

## Resource limits and evidence

Root owns all execution, mutation, restoration and cleanup. Agents prepare
disjoint scripts/tests or review them; no parallel inference. Reuse the single
compatible runtime/catalog and existing weights offline, without downloads or
extra environment/model copies. Native launcher2GiB and owned native12GiB use
zero swap,1800-second per-run deadline and a14GiB combined watchdog. CPU/build
checks have separate finite cgroup limits and deadlines. Failure diagnostics
compare buffers without expanding full image diffs.

The final independent reader uses2GiB/zero swap and a600-second deadline.
Actual retained entry snapshots identify23 unique protected input files with
33,996,412,454 bytes in total; streamed4MiB hashing plus68 ZIP/pixel checks needs
an I/O allowance independent of the short native denoising time. This is a finite
operational budget, not a measured reader duration or a change to native limits.

Evidence root:
`~/.codex/artifacts/imagegen-studio/runs/sampler-campaign/20261010-checks/`.
Entry inventory:28,199,063,552 allocated artifact bytes;313,769,984 evidence bytes;
50,262,851,584 free filesystem bytes. The30GiB/1GiB soft budgets are respected.
Entry raw SQLite rows, exact43 installed sources/stat identities and physical
idleness have been captured. Reused runtime and prior source fixture are pinned
as lifecycle dependencies. An initial CPU grid-capture typo failed before any
admission; corrected capture passed within2GiB with zero swap. Both attempts
are retained, excluding the setup failure from numerical evidence.

Freeze consumed sources and fresh bundle before native execution. The independent
aggregate reads actual SQLite/ZIP/Pillow bytes without production/planner/oracle
imports. Bind each fixture and literal plan to its method, schedule, mode and
case; retain complete executed semantics across baseline/control/restored inputs,
omitting only portable document identity/revision. Verify complete source-over
merged previews, fractional OUT seams, actual resources, signed LoRA, provenance,
edited-draft separation, exact new ownership sets and every prior row.

Source-informed read-only review of the oracles, producer tests, optional source
import and independent reader found a reader-only comparison expectation error:
after Add even a source-free TXT case compares against the now-opaque current
Canvas, whose mode is IMG. The reader was corrected without changing frozen
execution sources. Raw catalog prediction metadata remains null; for the
Illustrious-family EPS cases, applied checkpoint references, portable
configuration and native DTOs separately require epsilon. These are reader/schema
corrections, not killed numerical mutations.
The first actual Illustrious TXT saved/reopened comparison confirms the corrected
mode row: accepted TXT versus current IMG, recorded in `source-informed-review.json`.

The first aggregate attempt exposed another reader-only schema error: the
legacy/RGBA decoder compatibility marker is written inside source import and
does not exist for source-free TXT. All56 IMG/OUT reports contain the exact
four true observations; all12 TXT reports omit that marker while keeping actual
RGBA output decoding. The corrected reader requires those distinct observations
and retains full PNG/pixel verification. The failed attempt and its bounded
diagnostics remain separate from native numerical evidence; no execution source
or generated result changed for this correction.

The first cleanup attempt refused unreadable `environ`/cwd metadata of
preexisting systemd/KDE services before any deletion. The cleanup observer now
excludes only seven exact trusted system identities, including one already
exited system zombie, bound to the current boot, monotonic startup, recorded
filesystem birth times, ancestry, systemd units and root-owned executable/unit
bytes. These are trusted exclusions, not observations of empty environment/cwd.
Every owned native process still requires physical exit; unknown same-user
processes fail closed. An actual synthetic nondumpable process verifies that
refusal before cleanup intent or deletion, with a destructive-primitive tripwire.
It exited physically, and the five copies remained intact before actual cleanup.
`protected-system-processes.json` and `cleanup-unknown-process-proof.json` retain
this separate cleanup-only evidence; it adds no native admission or numerical kill.

The installed healthy reference is our production output. Together with the
independent CPU solver references and causal controls it qualifies the selected
numerical wiring and reproducibility, not general trained-output identity with
Invoke. Anima CPU references share conditioning/LoRA helpers and do not separately
qualify those helpers. Illustrious here is EPS/false-ZTSNR/leading only;
v-prediction/profile interactions remain a separate gate.

## Result

Confirmed before installed execution:

- Focused TypeScript/Node checks:756 existing tests and105 final campaign tests,
  all passed with zero skips. The latter include16 cases through actual Main
  preparation, queue admission, frozen request and accepted provenance.
- Actual CPU numerical baseline:32 selected cases. Five isolated source
  mutations:32 executed,14 neighboring controls GREEN and18 numerical RED,
  zero skips. Restored broader Python checks:365 passed, zero skips.
- Typecheck, full lint, fresh application build, Python static checks and
  Python types passed. Initial static/type diagnostics were corrected; the
  failed attempts are retained separately from numerical mutation evidence.

The complete five-sampler installed campaign and independent aggregate passed.
All68 actual admissions produced finite completions:25 healthy baselines,
25 provisional controls and18 fresh restored sensitive cases. The25 healthy
and18 fresh cases completed explicit Add, Save/readback, reopen and owning
settings comparison, producing43 saved/reopened packages and43 accepted layers.
Every provisional control remained temporary:18 semantic numerical RED before
Add and7 unchanged neighboring GREEN, with0 mutant accepted layers. Pre-generation
saved packages (source-only IMG/OUT, empty TXT) and explicit-Save seed snapshots
are preserved for all controls.
The confirmed TypeScript/Node groups above total756+105=861 unique passing tests;
365 restored Python checks and32 CPU mutation cases remain separate evidence
from the68 trained installed runs.

### Installed numerical and durable outcomes

Anima DPM++ 2M SDE, ER-SDE and LCM cover opaque IMG and mixed-alpha OUT;
Illustrious-family DPM++ 2M and DPM++ SDE cover Normal/Karras and TXT/IMG/OUT
on the exact trained EPS NoobAI checkpoint. All cases use256×256, CFG4, Fixed0,
weighted positive red1.3/negative blurry0.7 and one signed LoRA−0.5. DPM/LCM
have four authored steps; Anima ER has five. Anima neighbor strength0.5 and
history strength0.75 retain the independently selected solver-history/order/
stochastic-draw boundaries. Illustrious2M neighbor strength0.5 and SDE neighbor
strength0.05 preserve terminal/first-order controls; history strength0.75 and
TXT cases retain sensitive native updates. Illustrious clipping follows actual
training-timestep cutoff and scheduler order; SDE has seven raw TXT callbacks,
five history IMG/OUT callbacks and one terminal-only neighbor callback.

Each of the five narrow installed mutations gives its declared finite neighbor
GREEN and sensitive RED outcomes. All7 neighbors reproduce the entire healthy
RGBA exactly. Every sensitive control completes inference, preserves its exact
alpha plane and changes visible generated RGB plus the actual visible composite
before Add. Hidden OUT RGB alone is insufficient and is recorded separately:

| Method / schedule / mode                | Visible generated RGB changes | Hidden RGB changes | Visible composite changes |
| --------------------------------------- | ----------------------------: | -----------------: | ------------------------: |
| `anima-dpmpp_2m_sde/img2img`            |                        65,449 |                  0 |                    65,449 |
| `anima-dpmpp_2m_sde/outpaint`           |                        25,894 |             12,309 |                    24,856 |
| `anima-er_sde/img2img`                  |                        57,623 |                  0 |                    57,623 |
| `anima-er_sde/outpaint`                 |                        23,490 |             10,786 |                    22,586 |
| `anima-lcm/img2img`                     |                        65,164 |                  0 |                    65,164 |
| `anima-lcm/outpaint`                    |                        25,795 |             11,855 |                    24,716 |
| `illustrious-dpmpp_2m-Normal/txt2img`   |                        63,242 |                  0 |                    63,242 |
| `illustrious-dpmpp_2m-Normal/img2img`   |                        64,548 |                  0 |                    64,548 |
| `illustrious-dpmpp_2m-Normal/outpaint`  |                        25,661 |             22,659 |                    24,650 |
| `illustrious-dpmpp_2m-Karras/txt2img`   |                        65,054 |                  0 |                    65,054 |
| `illustrious-dpmpp_2m-Karras/img2img`   |                        65,286 |                  0 |                    65,286 |
| `illustrious-dpmpp_2m-Karras/outpaint`  |                        26,347 |             38,886 |                    25,897 |
| `illustrious-dpmpp_sde-Normal/txt2img`  |                        65,413 |                  0 |                    65,413 |
| `illustrious-dpmpp_sde-Normal/img2img`  |                        65,506 |                  0 |                    65,506 |
| `illustrious-dpmpp_sde-Normal/outpaint` |                        26,138 |             25,279 |                    25,262 |
| `illustrious-dpmpp_sde-Karras/txt2img`  |                        65,471 |                  0 |                    65,471 |
| `illustrious-dpmpp_sde-Karras/img2img`  |                        65,445 |                  0 |                    65,445 |
| `illustrious-dpmpp_sde-Karras/outpaint` |                        26,050 |             24,917 |                    24,975 |

After confirmed native physical exit, all five mutation journals reach restored
state without protected backups. All43 installed packaged files (30 Python
sources and13 assets) recover exact bytes and original inode/mode/mtime.
All18 fresh restored sensitive cases reproduce complete healthy raw RGBA and
then pass Add/Save/readback/reopen/owning comparison. Immutable accepted settings
retain actual seed0 and complete method/profile/resource/target semantics
separately from the edited current seed37 draft. Paired normalized inputs omit
only portable document identity/revision, without dropping method/grid fields.

The independent SQLite/raw ZIP/Pillow aggregate passes
19,102 actual checks without production/planner/oracle
imports. It preserves all prior raw rows and the exact catalog9 resources/
14 versions/14 files/2 dependencies, verifies complete native/frozen/portable
configurations and exact new queue/receipt/cursor/accepted ownership sets,
signed LoRA and resource identities, sRGB output ICC, immutable source
provenance and separation from edited authoring. Every68 fixture and literal
plan binds to its actual report; raw catalog prediction metadata remains null,
while applied checkpoint references/configurations/native DTOs require epsilon
for the Illustrious-family EPS cases.

All43 saved merged previews match the entire independent world-space
affine/BICUBIC plus source-over composition without RGB tolerance. This includes
all14 accepted OUT packages and fractional seam pixels. Each OUT preview is
320×256 and preserves217 source columns; the independent reader checks
777,728 protected source pixels in total.
Opaque IMG and source-free TXT previews are256×256. The reused pinned external
Invoke mask proof, keep-mask planes and contribution alpha remain retained;
OUT alpha is0 through column152, fractional153–167 and255 from168.

### Resource boundary and retained evidence

The68 native runs remain serial and offline using the single compatible
worker0.14 runtime/catalog and existing weights, with no new download, runtime
copy or model copy. Every launcher uses2GiB, zero swap and a1800-second deadline;
owned native execution is bounded to12GiB with a14GiB combined watchdog.
Largest actual combined owned usage across the68 bounds reports is
15,027,134,464 bytes (13.995GiB). No native run has a resource stop or cleanup
failure, and each actual report confirms physical exit. Setup/static/type/reader
corrections are retained as separate diagnostics and are not semantic kills.

Raw evidence includes all68 native reports and matching bounds, their finite
fixtures, `campaign-plan.json`, `campaign-independent-aggregate.json`, CPU
baseline/mutation/restoration logs and `cpu-mutation-proof.json`, retained
external alpha proof, `frozen-sources-bundles.json` (17 Anima and16 Illustrious
consumed-source hashes, five built-bundle hashes for each profile), five
installed mutation rollback journals, exact43-file final byte/stat identities
and physical-exit proof. CPU helper references do not replace trained evidence;
the861 TS checks,365 broader Python checks and32 mutation cases have their own
bounded command/log evidence.

After restoration and physical-exit verification, only the five declared
isolated CPU mutant source directories are removed, reclaiming
19,849,216 allocated bytes. Compact semantic
RED/GREEN/restoration evidence, the single compatible shared runtime/catalog
and the prior DPM2M common source/mask proof remain retained dependencies.
Final artifact root: 28,305,731,584 allocated bytes
(26.36GiB); evidence runs:
393,957,376 allocated bytes
(0.37GiB); filesystem free:
49,927,278,592 bytes. Both30GiB/1GiB soft budgets are respected.
`cleanup-proof.json`, `final-inventory.json` and lifecycle dependency records
capture the actual deletion, retained inputs, exact restoration and final
physical idleness. Original model/image files outside the artifact root and
ordinary application data are untouched.

### Limits and next gate

This closes the declared finite cases of all five remaining sampler algorithms.
The installed healthy reference is our own production output. Independent CPU
solver references and causal installed controls qualify selected numerical
wiring and reproducibility; they do not establish general trained-output
identity with Invoke or image quality. Anima CPU references share conditioning/
LoRA helpers and do not independently qualify those helpers. Illustrious here
uses only EPS, false-ZTSNR/leading and the exact external VAE FP32 choice.
Arbitrary checkpoints, geometry/formats, the full seed-policy/mode matrix,
remaining Advanced options, authored masks/inpaint, Regional Guidance,
Smart Patch/variants, general quality/parity, public delivery and release remain
open. Full MVP and PP-004/005/007/008 remain «Пока не обещать».

The V TXT follow-up is now recorded in
[NoobAI V DPM++ 2M research](./phase-2c-noobai-vpred-dpm-research.md), including
its failed-before-output Karras control and separately reproduced numerical
validity failure. It does not change these historical68/43 counts.

At this campaign checkpoint, the next bounded gate was the installed
v-prediction/profile interaction for
DPM++ 2M Normal/Karras TXT on the existing exact Cyberfalafel NoobAI derivative,
with ZTSNR=true, leading spacing,256×256/four authored steps/Fixed0. Research
must freeze its finite job count and resource budget before execution, without
inventing them here. Verify the actual Model Manager profile → native grid →
temporary result → explicit Add/Save/readback/reopen/owning comparison,
causal mismatch controls and fresh restoration. Leading spacing remains a
separately declared export-based assumption rather than a consequence of
v-prediction or an exact Cyberfalafel author recipe. Preserve the explicit
DPM++ SDE + ZTSNR refusal; this is profile qualification, not another algorithm.
