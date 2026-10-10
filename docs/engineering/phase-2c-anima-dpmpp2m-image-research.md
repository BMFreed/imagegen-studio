# Installed Anima DPM++ 2M image modes

## Boundary and plan

Entry: `cebfb6731652a4a44308f698925794e8c21b9c46`, clean `master`.
Continue the next phase2C gate after
[installed Heun IMG/OUT](./phase-2c-anima-heun-image-research.md).
This is high-risk numerical/durable qualification of PP-004/005/007/008 and
the [worker contract](../specs/05-worker-protocol.md),
[immutable provenance](../features/project/generate-mode/generation-provenance.md)
and [explicit acceptance](../features/project/generate-mode/generation-results.md).
The production DPM++ 2M and normal alpha-outpaint paths already exist. This
slice verifies their installed behavior without adding a model, runtime,
authored mask or release claim.

The actual path is built Project Import/Generate → Main composition and frozen
SQLite job → installed worker0.14 → verified temporary RGBA candidate → explicit
Add → Save/readback/reopen and owning settings comparison. Only the OS import
chooser is controlled. The source, target preparation, numerical execution,
acceptance, persistence and comparison remain actual application boundaries.

Confirmed from pinned Diffusers0.40: steps4/strength0.5 gives two evaluations.
The first has no history; terminal sigma0 forces the last to first order. This
case cannot qualify the second-order term. Steps4/strength0.75 gives three
evaluations, with update orders `[1,2,1]`; only strength differs from the
neighbor. Use the same opaque256 source, bbox0 for IMG and bbox64 for OUT,
CFG4, Fixed0, weighted red1.3/blurry0.7 and Myth−0.5. OUT retains exact LaMa,
192 opaque/64 transparent target columns and the existing contribution mask.

The narrow installed mutation resets only the deterministic DPM++ 2M native
history counter before each scheduler step in `anima_sampling.py`, forcing
update order1 while retaining configured solver order2. It leaves the SDE
branch, schedule, flow prediction, begin index, mask, RNG and progress unchanged.
This models a silent loss of multistep history. Mutating shared Diffusers itself is unsuitable:
independent CPU references use that dependency and would inherit the defect.
Actual-worker mutation preserves a fresh external solver-order2 oracle.

Planned matrix: healthy neighbor IMG0.5, history IMG0.75 and history OUT0.75;
three same-input provisional controls under the mutation; fresh restored
history IMG/OUT. Eight admissions/completions and five accepted saved/reopened
packages were planning expectations; actual outcomes are recorded below. The neighbor must stay pixel
GREEN; both history cases must fail before Add, with zero mutant acceptance.
OUT sensitivity must affect RGB where alpha>0 and preserve the alpha plane;
hidden RGB differences alone are insufficient. After physical exit, restore
all43 packaged files and original byte/inode/mode/mtime identities, then require
fresh exact full-RGBA replay of both sensitive cases.

CPU tests enter the real native loop with independently instantiated Diffusers
and externally pinned Invoke masks. Add the missing IMG strength0.75 case to
the existing matrix, run the selected neighbor/history cases under isolated
worker-source mutation, then repeat original affected files. These small
synthetic models verify loop inputs/algebra and test sensitivity, not trained
inference or subjective quality. New opt-in profile/CLI and literal assertions
reuse already checked geometry/resource helpers while explicitly validating
all DPM-specific method/strength/schedule fields first.

## Resources and evidence

Root owns every test/build/ML run, mutation, restoration and cleanup; agents
edit disjoint files or review read-only. Heavy checks remain serial with finite
RAM, zero swap and deadlines. Native launcher2GiB/owned native12GiB share a
combined14GiB watchdog; no parallel inference or extra model/runtime copies.
Reuse the single compatible worker0.14/catalog9/14 and pinned existing weights,
offline. Record original rows/catalog/files/source identities and retain them.

Raw evidence is under
`~/.codex/artifacts/imagegen-studio/runs/anima-dpmpp2m-image/20261010-checks/`.
Before heavy work, inventory and physical-idle/source verification must pass.
The lifecycle records pin the canonical runtime and compact evidence separately.
The isolated CPU mutant source is disposable only after physical exit and
restoration. Setup/resource/cleanup errors are distinct from semantic RED.

## Result

The eight-run installed matrix and independent aggregate passed. Eight actual
admissions produced eight finite completions. Three healthy baselines and two
fresh restored runs completed explicit Add, Save/readback, reopen and owning
settings comparison. Each saved package has the unchanged imported source and
one accepted result. All three mutation controls remained temporary, with zero
accepted layers and byte-identical source-only saved packages/seed snapshots.

- Exact CPU IMG/OUT neighbor0.5/history0.75:4/4 PASS,104 deselected,0 skipped.
  Isolated actual-worker history reset:2 neighbor PASS and2 history semantic
  FAIL; the independent Diffusers reference and repository source stayed
  unchanged. Fresh original affected files:108/108 PASS,0 skipped. The initial
  collection selector also matched SDE by substring; it was corrected before
  execution. Both collection reports are retained.
- Actual TS producers, independent literal/profile guards and CLI refusals:
  652/652 PASS,0 skipped, serial bounded execution. Typecheck, full lint and
  fresh application build PASS. The six new profile/oracle/CLI files reuse
  common image/resource checks, but separately validate every actual DPM++ 2M
  sampling field before projecting a common validation view. Normalized paired
  inputs retain all method/strength/grid/resource/target semantics and omit
  only portable document identity/revision.
- Actual pinned Invoke gradient/fade method bodies reproduce all selected
  worker keep-mask planes and the entire contribution alpha. OUT target is
  192 opaque/64 transparent columns; contribution alpha is0 through152,
  fractional153–167 and255 from168. This independent source check performs
  no trained inference.
- Installed baseline IMG0.5, IMG0.75 and OUT0.75 passed. At authored4, the
  neighbor executes two first-order updates; history cases execute three
  updates with orders `[1,2,1]`. Resetting only the deterministic native history
  counter keeps the neighbor's entire RGBA identical. Both history cases
  complete but fail the same-input pixel guard before Add: IMG changes
  65,395 visible pixels; OUT changes
  25,794 pixels with alpha>0 and
  12,536 hidden pixels. Both alpha planes remain
  unchanged. Actual visible composite differences are
  65,395 IMG and
  24,778 OUT pixels; hidden RGB alone
  is not used as evidence of sensitivity.
- After physical process exit, all43 packaged files (30 Python sources and13
  assets) recover exact bytes/inode/mode/mtime; the protected backup is absent.
  Fresh independent IMG and OUT runs reproduce each complete healthy RGBA,
  then pass acceptance, Save/readback, reopen and read-only owning comparison.
  Comparison preserves DPM++ 2M/actual seed0 separately from the edited Euler/
  seed37 draft; OUT also compares its frozen mode against current IMG.
- The independent raw SQLite/ZIP/Pillow aggregate passes
  2,753 checks without production/planner/oracle imports.
  It preserves every prior row and exact catalog9 resources/14 versions/
  14 files/2 dependencies, verifies actual input/resource bytes and identities,
  exact new admission/receipt/cursor/accepted ownership sets, immutable sampling/
  source provenance, sRGB output ICC and current draft separation. Final source
  and process checks verify restoration and physical idleness.
- All five saved merged previews match complete independent world-space
  affine/BICUBIC plus source-over composition, including fractional seam pixels.
  Both OUT packages preserve217 source columns (111,104
  source pixels checked in total); no RGB tolerance is introduced. IMG preview
  is256×256; OUT preview is320×256.
- All native runs stay serial and offline, with no new download/runtime/weight
  copy, zero swap and launcher2GiB/native12GiB limits plus a14GiB combined
  watchdog. Largest observed combined usage: 14,567,157,760 bytes
  (13.57GiB). No resource stop/OOM or cleanup failure occurs.

Raw files include eight native reports/bounds, `independent-aggregate.json`,
`alpha-external-proof.json`, CPU mutation/restoration evidence, frozen17 consumed
source and5 built bundle hashes, and exact final source/physical-exit proofs.
After restoration and actual physical-exit checks, only the isolated CPU mutant
source is removed, reclaiming 3,907,584 allocated bytes.
Compact evidence and the single compatible runtime/catalog remain retained.
Final artifact root: 28,198,981,632 bytes
(26.26GiB); evidence runs:
313,688,064 bytes; filesystem free: 50,467,155,968
bytes. Both30GiB/1GiB soft budgets are respected. `cleanup-proof.json`,
`final-inventory.json` and shared/run lifecycle records capture the deletion,
preserved dependencies and restoration/physical-idle proof.

This closes only deterministic DPM++ 2M at256×256: opaque IMG strengths0.5/0.75
and mixed-alpha OUT strength0.75, four authored steps, CFG4, Fixed0 and Myth−0.5. Arbitrary
models/geometry/options, authored masks, other methods, full policy/format/
quality parity and release remain open. PP-004/005/007/008 remain «Пока не
обещать». The next bounded gate is installed Anima DPM++ 2M SDE IMG/OUT.

The later [combined five-sampler campaign](./phase-2c-sampler-campaign-research.md)
closes that selected SDE IMG/OUT gate together with the declared Anima ER-SDE/LCM
and EPS Illustrious-family DPM++ 2M/SDE Normal/Karras cases. The eight-run
counts and limits above remain historical; full MVP and release remain open.
