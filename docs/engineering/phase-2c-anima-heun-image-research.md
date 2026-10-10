# Installed Anima Heun image modes

## Boundary and research plan

Entry: `1af2ee359e754c5cefefc0bfc1c29da90cfcbf33`, clean `master`.
Continue the next phase2C gate after the
[ER-SDE third-order qualification](./phase-2c-anima-er-sde-order3-research.md).
This is high-risk numerical/durable verification of PP-004/005/007/008 and the
[worker contract](../specs/05-worker-protocol.md),
[immutable provenance](../features/project/generate-mode/generation-provenance.md)
and [explicit acceptance](../features/project/generate-mode/generation-results.md).
Production Heun and normal alpha outpaint already exist. This slice qualifies
their installed image paths; it does not introduce a new model, algorithm,
authored mask, runtime or release claim.

Confirmed path: built Project Generate → actual Main composition/preparation →
frozen SQLite job and hash-bound input → installed Python worker0.14 → verified
RGBA/PNG receipt and temporary candidate → explicit Add → Save/readback/reopen
and owning settings comparison. A shared driver currently assumes empty TXT
targets, opaque output, no source layers and requested steps equal native
progress. New optional image hooks must preserve those historical defaults.

Use one real opaque 256×256 source PNG through UI Import; only the OS chooser
is controlled. Import normalization, source ownership, bbox keyboard movement,
mode derivation, LaMa conditioning and inference stay real. Ordinary IMG keeps
bbox(0,0,256,256); OUT moves it64px right, producing192 opaque/64 transparent
columns. Original source pixels/assets must remain unchanged; accepted OUT is
a separate RGBA contribution, not a rewritten source.

Both cases use exact existing Anima/Qwen3/Wan/Myth/LaMa files, weighted positive
and negative prompts, CFG4, signed LoRA−0.5 and Fixed seed0. Requested steps4,
strength0.5 imply startStep2, beginIndex4 and three native evaluations. Independent
Heun literals are sigmas `[0.602150559425354, 0.008928571827709675,
0.008928571827709675, 0]`, timesteps `[602.1505737304688,
8.928571701049805, 8.928571701049805]`, initialSigma0.602150559425354,
posteriorSeed2654435769 and stepSeed0. Actual progress is1/3,2/3,3/3.
Before-step predictor/corrector flags yield completes `[false,true,true]`.

The narrow semantic mutation sets only `anima_sampling.py`'s mask-completion
predicate to `True`, restoring protected latents prematurely after the Heun
predictor. Ordinary IMG has no latent transform and must remain GREEN. OUT must
complete but produce a same-input numerical RED before Add, with zero accepted
mutant results. A meaningful visible claim also requires RGB difference at
pixels with contribution alpha>0 and an unchanged alpha plane: raw whole-RGBA
differences in hidden alpha0 pixels alone do not establish visible sensitivity.
After actual process exit restore all43 original bytes and file identities,
then repeat OUT and require healthy pixels, Add/Save/reopen/comparison.

Source tests use existing actual-native IMG and masked OUT tests with fresh
Diffusers and externally pinned Invoke mask reference. Add strength0.5 to the
existing OUT matrix, then execute the selected Heun neighbor/sensitive tests
under the same isolated source mutation and repeat the restored tests. Synthetic
models prove loop algebra/inputs and test sensitivity, not installed weights.

## Resources and evidence

Root exclusively owns builds/tests/ML, protected mutations and cleanup. Agents
edit disjoint source-test/profile files or conduct read-only review. All heavy
checks run serially with finite memory/swap/deadline bounds; native launcher2GiB,
owned native scopes12GiB, combined watchdog14GiB, swap0, offline model loading.
Reuse the single compatible worker0.14/catalog9/14; no model/environment copies
or downloads. Entry artifact root28,173,201,408 allocated bytes (26.24GiB),
293,011,456 bytes of evidence runs, filesystem free50,490,638,336 bytes.

Raw evidence lives under
`~/.codex/artifacts/imagegen-studio/runs/anima-heun-image/20261010-checks/`.
The entry check confirms physically idle canonical runtime,43 unchanged worker
source/assets and original file identities; raw starting rows are482 queue,
420 receipts,216 cursors and401 accepted index rows. Preserve every prior row,
catalog/defaults, managed files and original source files. Separate setup or
cleanup failures from semantic RED; do not infer readiness from mock tests.

## Result

The installed five-run matrix and independent aggregate passed. Five actual
admissions produced five finite completions; three healthy results completed
explicit Add, Save/readback, reopen and owning settings comparison. Each of the
three saved packages contains the unchanged imported source and one accepted
result. The two mutation controls remain temporary, with zero accepted results
and unchanged source-only saved packages/seed snapshots.

- Existing source tests now cover strength0.5 for all six OUT methods. Exact
  Heun4/strength0.5 IMG and OUT baseline:2/2 PASS,103 deselected,0 skipped.
  Isolated actual-source premature-mask mutation: ordinary IMG PASS and OUT
  semantic FAIL; actual module path/hash and unchanged repository source are
  recorded. Fresh original full affected files:105/105 PASS,0 skipped.
- Focused actual TS producers, independent literal/profile guards and CLI
  refusals:625/625 PASS,0 skipped, one test process at a time. Typecheck, full
  lint and fresh application build PASS. Synthetic/CPU assertions are separate
  from trained-weight evidence.
- The actual pinned Invoke gradient/fade method bodies reproduce the complete
  selected mask. Source keep alpha is192 opaque/64 transparent columns;
  published contribution alpha is0 through column152, fractional153–167 and
  255 from168. The first oracle probe compared keep polarity against contribution
  polarity and failed before any model work; explicit inversion corrected the
  probe and all three native keep-mask planes match the external reference.
- Review found and fixed a renderer serialization error in the new generic
  decoder hook. Its real imported-source callback now executes both legacy
  no-RGBA and image RGBA variants and compares exact encoded bytes/dimensions.
  Imported layer capabilities are read through Main `net.fetch`; CSP/protocol
  privileges are preserved. Model authoring precedes real import/strength/bbox
  preparation. Existing profiles retain their original defaults.
- Review also found a weak Save pixel guard. IMG now checks all preview RGBA;
  OUT checks217 protected source columns and88 opaque generated columns. The
  independent raw Pillow reader additionally checks the entire source-over
  composition, including all fractional seam pixels, and exact raw ownership
  sets rather than only row counts or report flags.
- Installed healthy IMG and OUT both passed. With only the mask-completion
  predicate mutated, IMG reproduced the exact healthy pixels; OUT completed
  but failed the same-input pixel guard before Add. OUT changed25,819 pixels
  with alpha>0 and11,545 hidden pixels; the entire alpha plane stayed identical.
  The visible difference establishes sensitivity to premature predictor mask
  restoration, rather than only to hidden RGB bytes. After physical process
  exit, all43 packaged files (30 Python sources and13 assets) recovered their
  exact bytes/inode/mode/mtime. A fresh OUT run reproduced the entire healthy
  RGBA contribution, then passed Add/Save/readback/reopen/comparison.
- The independent SQLite/ZIP/Pillow aggregate passed2,578 checks. It checks
  exact new admission/receipt/cursor/accepted ownership sets, preserves every
  prior row and catalog9 resources/14 versions/14 files/2 dependencies, hashes
  original and managed weights/LaMa, validates frozen source assets/provenance,
  and checks all saved preview RGBA including fractional seam pixels. Its
  final installed-file and process checks confirm restoration and physical
  idleness; it does not import the production compiler or qualification oracle.
- Full OUT preview verification uses literal world transforms and the external
  Pillow affine/BICUBIC step before source-over composition. Omitting that step
  changes2,230 pixels by RGB rounding at world columns217–231, even with integer
  translation. The actual saved320×256 preview matches the complete independent
  affine/source-over composition exactly; no tolerance was introduced. IMG
  matches its full256×256 preview exactly. This reader correction is separate
  from the five native attempts and the semantic mutation.
- Native runs remained serial and offline, without new downloads or runtime/
  weight copies. Every run used zero swap, launcher2GiB/native12GiB limits and
  the combined14GiB watchdog; the largest observed combined usage was
  13,814,583,296 bytes (12.87GiB). No resource stop/OOM or cleanup failure occurred.

Raw files include `independent-aggregate.json`, five native reports/bounds,
`preview-external-proof.json`, `alpha-external-proof.json`, CPU mutation and
restoration evidence, frozen delivery hashes, and final source/physical-exit
proofs. After fresh physical-exit and byte/identity restoration checks, the
isolated CPU mutant source was removed, reclaiming3,907,584 allocated bytes.
Compact evidence and the single compatible runtime/catalog are retained for
the next bounded gate. Final artifact root28,184,551,424 bytes (26.25GiB),
evidence runs302,211,072 bytes (288.21MiB), filesystem free50,501,775,360 bytes;
both30GiB/1GiB soft budgets are respected. `cleanup-proof.json` and
`final-inventory.json` record the deleted path, preserved dependencies and
physical-exit/restoration proof. Shared/run lifecycle records are updated.

This closes only Heun opaque IMG/mixed-alpha OUT at256×256, four authored steps,
strength0.5, CFG4, Fixed0 and Myth−0.5. It does not establish arbitrary models,
geometry, authored masks, full mode/policy/format/quality parity or a release.
PP-004/005/007/008 remain «Пока не обещать». The next bounded gate is installed
Anima DPM++ 2M IMG/OUT.

The later [installed DPM++ 2M IMG/OUT qualification](./phase-2c-anima-dpmpp2m-image-research.md)
closes that next finite gate. The Heun counts and claims above remain historical;
the full image/method/policy matrix and release remain open.
