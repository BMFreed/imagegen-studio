# Installed NoobAI outpaint VAE encoder qualification

## Boundary and acceptance criteria

Continue the authorized roadmap from clean, pushed `076d89d9eeb9e408a0f343b738df5e1e49a8c0ca`.
Supporting promises are PP-004/005/007/008: exact managed components, captured
generation settings and immutable accepted provenance. This is high-risk
verification through the actual renderer/IPC/Main, installed noneditable worker,
queue/staging and explicit Add/Save/readback/reopen. Production inference behavior
is not changed by this verification slice.

The preceding [encoder checkpoint](./phase-2c-noobai-vae-encoder-research.md)
independently establishes native CPU lineage and TXT/IMG influence, but does not
establish encoder effect through the mixed-alpha outpaint path. Reuse that exact
encoder-only control, healthy native VAE, two trained objectives and shared
worker0.14/catalog5/9. No extra runtime, checkpoint or component copy is needed.

Extend only the explicit `noobai-vae-encoder` profile to stage `outpaint`.
Each objective has exactly two ordinary finite Generate/Add/Save/reopen cycles:
native full stack and encoder control, one matched pair, two admissions, no
Cancel/refusals. Existing TXT/IMG counts and old component5/8 closure remain
unchanged. Retain fixed seed0, FP32, signed ordinary LoRA−0.5, both trained
embedding polarities, common source, prediction/noise/sampler, bbox and
strength0.5. An independent native schedule oracle requires two effective
denoising evaluations from three requested steps.

Differences in hidden RGB, encoded PNG bytes or provenance alone do not qualify
encoder influence. Require exact contribution alpha, changed visible generated
RGB and changed saved merged RGB at at least one corresponding generated
coordinate. Actual source layers, protected source pixels and target bytes must
remain unchanged; portable accepted settings must survive Save and reopen while
the current authoring draft is changed to seed37 and different components/prompts.

## Owners, controls and failure boundaries

The existing runner imports the independently bound TXT source through the UI,
sets strength0.5, shifts the bbox through `prepareOutpaint` and captures the
actual mixed-alpha target. The selected exact native VAE reaches the ordinary
Illustrious img2img pipeline and its masked subclass in `sdxl_outpaint.py`.
That subclass retains the native encoder, scheduler and cloned posterior RNG;
it stores encoded source latents, adds captured initial noise and applies
mask-guided source restoration through the actual scheduler loop. Main owns
LaMa delivery and the conditioning/output alpha contract. Saved contribution and
merged preview are decoded independently for the numerical oracle.

Reuse the shared visible-outpaint guard, with an explicit opt-in requirement for
overlap between changed contribution and corresponding merged coordinates.
Other component-profile behavior remains unchanged. Imported guard tests must
refuse invisible-only changes, alpha changes, unchanged/disjoint merged pixels,
invalid preview coverage, changed neighboring frozen inputs, unsupported stages
and missing/malformed LaMa or installed capability. Genuine CLI refusals must
occur before original source reads, copying, catalog mutation or native startup.

After both normal objective pairs pass, run one installed EPS outpaint semantic
mutation discarding the genuinely encoded latents before they enter the masked
loop. Preserve actual loading/encoding, posterior RNG consumption, initial noise,
decoder, LaMa and masks. Two complete finite cycles must reach the intended
visible-pixel assertion RED. Restore only the owned mutation after confirmed
physical Main/worker/KDE scope exit, verify all43 source files and original
inode/mode/mtime/bytes, then run a fresh two-cycle EPS GREEN pair. Rename may
change ctime; its preservation is not claimed. Setup/import/non-finite/timeout/OOM
failures do not count as semantic mutation evidence.

## Resource bounds and entry evidence

Compact evidence root:
`~/.codex/artifacts/imagegen-studio/runs/noobai-vae-encoder-outpaint/20261008-checks/`.
Entry inventory is21,967,020,032 allocated bytes in the artifact root,
21,884,518,400 in the single compatible pool and82,501,632 in compact evidence.
Both30 GiB/1 GiB soft budgets are respected. Entry source proof confirms actual
Main/worker idleness and all43 unchanged installed worker files.

Root alone executes checks, ML, source hashing and cleanup; delegated agents
inspect source or edit pure guards/tests without starting heavy processes.
Native runs are serial with12 GiB per process group, swap0,1200-second launcher
and1800-second owned-scope deadlines. Separate group caps are not an aggregate
12 GiB limit. Focused checks use3 GiB/300s and static checks6 GiB/300s.
Before entry the host reported24,557,608 KiB available RAM and RTX4080 with
16,376 MiB VRAM,1,135 MiB used. These observations do not determine inference
quality or establish universal resource requirements.

## Observed normal installed pairs

`native-eps-outpaint/report.json` and `native-v-outpaint/report.json` both passed
with two finite Generate/Add/Save/readback/reopen/comparison cycles and two actual
admissions each. Both physical Main/worker/KDE scope exits are confirmed. Exactly
four normal cycles and two pairs are accounted separately from preceding
component/TXT/IMG checkpoints; no Cancel, refusal or lifecycle cycle is counted.
Catalog5/9 and original source identities/defaults remain unchanged, with zero new
managed files. The real current draft becomes seed37 with changed component and
prompt selections while each captured job retains seed0 and its exact tuple.

Each pair preserves26,368 visible contribution pixels and identical alpha.
The rendered browser oracle records:

| Objective | Changed visible contribution RGB | Changed saved merged RGB | Changed corresponding coordinates |
| --------- | -------------------------------- | ------------------------ | --------------------------------- |
| EPS       | 25,257                           | 25,223                   | 25,223                            |
| V         | 23,820                           | 23,778                   | 23,778                            |

Independent native scheduling retains strength0.5 and exactly two evaluations
from three requested steps. Source import, shifted mixed-alpha target, protected
source pixels, contribution placement, portable accepted settings, saved preview
and read-only comparison all pass through their actual production owners.

## Installed semantic mutation and restoration

The mutation is installed only in the isolated pool's `sdxl_outpaint.py`, after
the real parent's encoding/posterior sample and before retaining source latents:
`encoded = torch.zeros_like(encoded)`. `native-mut-discarded-outpaint-encoder/report.json`
completes two finite EPS cycles with real Add/Save/readback/reopen/comparison.
Only then the shared visible oracle produces its intended RED:
“A component control must change visible generated RGB, not only invisible RGB.”
Both decoded contribution pixel hashes become
`572214f15bb9bdd7a81c961e287aefd81e1a0b1bfe2c8e4aaba6973c174fc150`.
Actual loading/encoding, posterior RNG consumption, initial noise, decoder,
LoRA, embeddings, LaMa and masks remain in place. There was no setup/import,
non-finite, timeout or OOM failure.

The protected journal confirms physical exit before restoration, original
inode/mode/mtime/bytes and all43 exact worker files; the backup is absent.
Fresh `native-restored-eps-outpaint/report.json` passes two ordinary complete
cycles and physical exit. Both individual decoded contribution and saved merged
pixel results exactly reproduce their original normal EPS counterparts.
Counts are four normal cycles, two mutation cycles and two fresh restored cycles;
the mutation is not promoted to an ordinary successful qualification.

## Independent final binding and resource handoff

`aggregate.py` decodes actual saved ZIP members with the installed Pillow,
independently of the browser guard. It verifies contribution/output bytes against
the genuine receipt and saved provenance, exact alpha and fully opaque merged
preview before counting visible changes. Every cycle retains55,552 protected
source coordinates and the imported source's independently decoded original
pixels. EPS/V labels are bound to exact prior trained checkpoint SHA, CivitAI
identities, objective, common-source objective and actual frozen queue rows;
directory names alone do not establish two-objective coverage.

Raw PNG and browser-canvas contribution counters are separate observables:
Pillow records25,912 EPS and24,579 V changed visible contribution coordinates.
Both oracles agree on26,368 visible coordinates and25,223/23,778 changed
corresponding saved merged coordinates. The mutant has zero visible or merged
changes; the fresh EPS raw contribution and merged bytes match the corresponding
original normal decoded images exactly.

`final-evidence.json` passes with all eight unique actual completed SQLite queue
rows and genuine candidate receipts bound to saved assets, the independent CPU
parent/control SHA/size/origin and captured seed0/strength0.5. The final catalog
remains5/9. `final-sources.json` confirms all43 exact installed source files and
no live Main/worker/native data users. The independent aggregate itself exits
successfully under3 GiB/300s, observed20.2 MiB peak.

Focused imported-guard/component/noise/resource-limit and genuine CLI preflight
checks pass267/267, zero failed/skipped,128.128s, observed326.9 MiB peak under
3 GiB/300s. This includes23 encoder-helper tests and six new outpaint CLI
refusals. Lint passes under6 GiB/300s,37.127s, observed3.6 GiB peak. No
TypeScript/Vue, production UI or prototype change requires additional builds or
prototype checks. Source review is separate from root's executed verification.

Serial native groups take311.970s EPS,344.195s V,294.111s intended RED and313.235s
fresh GREEN. Observed per-group peaks are7.9/7.1/7.3/8.1 GiB, swap0; each remains
within its12 GiB/1200s bound. Separate group ceilings remain distinct from a
global aggregate memory bound.

Final inventory snapshot:21,978,238,976 allocated bytes in the artifact root,
21,889,912,832 in the one compatible shared pool and88,326,144 in compact
evidence; this run uses5,820,416 bytes. Both30 GiB/1 GiB soft budgets remain
respected. Zero bytes are reclaimed: there are no bulky disposable copies.
Retain compact RED/GREEN/source proof, the one runtime/catalog, nine exact
sources, LaMa and dependent source/output PNG/.igs/queue associations for the
remaining polarity/stack/order/Anima/dynamic gates. Release the restored rollback
backup pin; its compact journal remains available.

## Remaining scope

This does not qualify every encoder layer, arbitrary VAE format/training lineage,
subjective quality, Invoke pixel parity, embedding polarity swap, multiple-LoRA
stack/order, trained Anima worker0.14, dynamic batches, public CivitAI delivery or
release installation/repair. Whole-MVP readiness remains open.
