# Installed NoobAI external VAE encoder qualification

## Boundary and intended result

Authorized roadmap continuation from clean, pushed `28dd95e91e04c879a50dd4085cc749023d2fe55c`.
Supporting promises: PP-004/005/007/008, exact managed resources, generation
settings and immutable accepted provenance. This is a high-risk verification
slice through actual renderer/IPC/Main, the installed worker, queue/staging and
explicit Add/Save/readback/reopen; production inference behavior is unchanged.
The preceding [component matrix](./phase-2c-noobai-component-inference-research.md)
uses a decoder-only VAE control and does not establish independent encoder effect.

Use a separate strict `noobai-vae-encoder` profile. Each invocation declares one
trained objective and one ordinary txt2img/img2img mode, with healthy native VAE
and an independently verified encoder-only control. Eight required normal cases
are two objectives × two modes × two VAE choices, accounted separately from the
previous 36-case matrix and lifecycle results. TXT must give identical decoded
pixels; common-source nonzero IMG must give different pixels. Both paths must
preserve exact captured identities/settings through real explicit Add and Save.

The shared pool remains one installed worker0.14/runtime. All eight existing
versions in five resources must survive unchanged; only a fourth version of the
same VAE resource is added, producing five resources/nine versions. Old component
profiles retain their strict eight-version closure. Exact local catalog/source
preparation is a qualification precondition, not public CivitAI delivery or
engine installation/repair evidence.

## Controlled variable and native owners

The healthy native VAE is extracted from the official EPS checkpoint:
SHA `f09b42f799d82812ef38461205c4764ecb3e10384bb6ee198321124dbc59e9b7`,
167,335,542 bytes. Add `0.5` to the eight F16 entries of
`encoder.conv_out.bias`; preserve every other tensor and pinned configuration.
The transform is explicitly artificial, not an independently trained VAE.
It may change posterior mean and variance; neither invariance is assumed.

`inference_external_vae.py` verifies exact bytes, complete native architecture
and all finite tensors, then loads through pinned offline AutoencoderKL.
`inference.py` supplies that selected VAE to the pipeline. Native encode uses
encoder and quantization, while decode uses post-quantization and decoder.
Img2img performs real native encoding with a separate cloned CPU posterior
generator; initial noise uses the captured generator independently. Retain all
these owners, fixed seed0, FP32 VAE, signed LoRA−0.5, both trained embedding
polarities, source pixels, prediction/noise/sampler and strength0.5.

The installed semantic mutation deliberately discards the already encoded
latents with `torch.zeros_like(encoded)` after the genuine parent
`prepare_latents(add_noise=False)`, before noise addition. It keeps actual
encoding/loading, posterior RNG consumption, initial noise and decoder intact.
Two EPS IMG cycles must complete before equality causes the intended pixel
inequality RED. Then restore exact sources, confirm physical exit and repeat the
two healthy cycles GREEN. Setup, import, non-finite or timeout failures are not
causal evidence.

## Observed source preparation

Compact evidence root:
`~/.codex/artifacts/imagegen-studio/runs/noobai-vae-encoder/20261008-checks/`.
Entry inventory: 21,616,820,224 allocated bytes in the artifact root,
74,522,624 in compact evidence and 21,542,289,408 in the canonical pool.
The entry proof confirms actual Main/worker idleness and all43 unchanged worker
files. Root alone executes checks/ML/hashes/cleanup; source/helper delegation
does not execute another heavy process.

`prepare-encoder2` passed with a 4 GiB process-group cap, swap0, 300-second
deadline, 35.777-second runtime and observed 2.6 GiB peak. The first preparation
attempt selected the interpreter's base-prefix instead of the environment's
configuration path and refused before model reads or new source writes. It is
excluded setup evidence, not a failed model/control.

`encoder-cpu-evidence.json` uses the actual noneditable installed loader and
Diffusers0.40.0. It verifies all248 tensors, only the declared encoder bias
changed, exact remaining247 tensors including quantization/decoder, exact native
round-trip loading and unchanged parent bytes/identity/config. On both retained
objective-specific common images, actual CPU posteriors and same-generator
samples are finite and different; generator states remain equal. Decode of
identical sampled latents is finite and exactly equal. Actual mean and log
variance both differ. This is native CPU evidence, not full GPU execution.

Derived control: SHA
`9c382bfbbe48cd6f28fb61724087369b013ec6972ef1d298fee8ecf0544b1f9e`,
167,335,502 bytes. Publication precondition IDs:
managed700085/model700070/version700083/file700084; origin explicitly names
the parent native SHA and encoder-output-bias transform. No original weights or
ordinary application data are modified.

## Preliminary execution and neighboring catalog control

The first EPS TXT invocation completed two finite UI/Add/Save/readback/reopen
cycles and its identical-pixel oracle passed. It then refused at the final
catalog-preservation assertion: publishing the ninth version legitimately
updates the existing VAE resource's `sourceCheckedAt`. The observed default,
original version/file identities, bytes and source metadata remained equal.
Production `ModelRepository.publishArtifact` assigns the same publication
`now` to resource `sourceCheckedAt` and new version `createdAt`.

The preservation guard must allow that timestamp transition only when adding
the exact ninth version, and require its equality to that version's valid
creation timestamp. Existing nine-version catalogs and all other resources
must retain their timestamps exactly. The preliminary failed report remains
separate and its two completions are excluded from the eight normal cases.
Fresh source proof confirms physical Main/worker exit and all43 unchanged
worker files after that invocation.

## Observed normal installed matrix

Fresh `native-eps-txt2img2/report.json` and `native-eps-img2img/report.json`
both passed with two finite completions/two admissions each, no Cancel/refusals,
explicit Add/Save/readback/reopen/comparison, unchanged source files and preserved
catalog. Native Main/worker/scope exit is confirmed independently after each.
TXT decoded pixel SHA is equal for healthy/control:
`585ab8a28684fac5b968d8c1567b63476d791b3ac9d90661c65bea9909bd12cf`.
Nonzero IMG healthy SHA is
`9e580a1a0e7923bd4b952497ee0b91d4038f89bb1ad88dd30c02a5a07939adc9`;
encoder-control SHA is
`5d7ca36e1959996d8e8ad5a73262e7b3a65b59d4e0ad9088ae84de3c6f8e1137`.
Both V invocations also passed with two finite completions/two admissions each,
exact catalog/source preservation and native physical exit. V TXT healthy/control
SHA is equal:
`0c4b50cd571750a2bfca4de627d4b74635e9c6b1cc29f15f90996f6c1da09a52`.
V IMG healthy SHA is
`42a876223f9f3aeb39f01a7dafa9daa04a085e9df5f7e209e2d107c3a89d4b22`;
encoder-control SHA is
`65759bc01325808989821944f1f2ee96e7ba5c5157a537337b291e59d890b1f0`.

| Objective | Mode                 | Normal finite completions/admissions | Matched decoder-pixel result |
| --------- | -------------------- | ------------------------------------ | ---------------------------- |
| EPS       | txt2img              | 2/2                                  | Equal                        |
| EPS       | img2img, strength0.5 | 2/2                                  | Different                    |
| V         | txt2img              | 2/2                                  | Equal                        |
| V         | img2img, strength0.5 | 2/2                                  | Different                    |

`normal-results.json` accounts exactly eight normal completions/eight admissions,
four matched pairs, no Cancel/refusals, separately from the preliminary timestamp
failure and the installed mutation/restoration cycles. All cases capture seed0
while real current draft edits use seed37 and change component/prompt selections;
accepted provenance, original pixels and independently expected portable settings
survive Add/Save/readback/reopen/read-only comparison. Each invocation validates
all nine source hashes/physical identities unchanged and the same five-resource,
nine-version catalog. No original managed file is recopied.

## Installed semantic mutation and restoration

`native-mut-discarded-encoder/report.json` completed two finite EPS IMG
Generate/Add/Save/readback/reopen/comparison cycles. Their decoded pixel SHA
became equal:
`2ea8e1decc4659af81535bf777fd1263344aa4f699ed51df9a123ff25caba1ae`.
Only then the imported pixel oracle failed with its intended assertion:
“Selected VAE encoder must change nonzero img2img pixels while decoder and
neighboring inputs stay matched.” This is a causal numerical RED, not startup,
loading, non-finite or timeout evidence.

The protected journal restores the original inode/mode/mtime/bytes only after
Main/worker/native-scope physical exit. All43 worker files are byte-exact and
no original backup remains. Rename legitimately changes ctime; ctime preservation
is not claimed. Fresh `native-restored-eps-img2img/report.json` then passed two
ordinary complete cycles. Both individual pixel hashes match the corresponding
original normal EPS IMG cases exactly. Counts are separate: eight normal cases,
two finite mutation cycles and two fresh restored cycles; the preliminary two
finite timestamp-failure cycles are excluded.

## Final evidence and retained boundaries

`final-evidence.json` binds the independently verified CPU parent/control
SHA/size/origin to all twelve actual captured VAE snapshots and completed SQLite
queue rows, matching genuine candidate receipts/output bytes. Normal source
identities/configuration and four matched pairs remain exact. The preparation
lineage is an explicit independent qualification precondition; the CLI's origin
metadata alone is not tensor-lineage proof. `final-sources.json` independently
confirms43 exact source files and no live Main/worker/native data users after
the fresh restored run. All source/helper agents have finished their work.

Final inventory: 21,967,003,648 allocated bytes in the artifact root,
21,884,518,400 in the one shared pool and 82,485,248 in compact evidence;
this run uses7,958,528 bytes. Both30 GiB/1 GiB soft budgets are respected.
Native groups ran serially with12 GiB **per group**, swap0 and1200-second launcher
deadlines; owned KDE scopes retain their1800-second exit deadlines. This is not
an aggregate12 GiB bound. Observed peaks were12 GiB for each normal group,
9.5 GiB for the mutation group and11.8 GiB for restored GREEN. CPU preparation
used4 GiB/300s, focused tests3 GiB/300s and typecheck/lint6 GiB/300s.

No disposable runtime/checkpoint copies were created. Zero allocated bytes were
reclaimed: compact evidence and the one compatible runtime/catalog, nine exact
sources and retained source PNG/.igs/queue associations are dependencies of
subsequent polarity/stack/order/Anima/dynamic work. The restored rollback backup
is absent and its protection pin is released; the compact journal remains.
Final focused checks passed255/255,
including17 imported-guard tests and actual CLI preflight refusals; typecheck and
lint passed. The first bare-node focused invocation refused a TS import before
the CLI suite executed; the supported tsx invocation passed and that setup error
is excluded from qualification evidence.
This slice does not qualify every encoder layer, arbitrary VAE formats/training
lineage, new trained outpaint encoder behavior, polarity swap, multiple-adapter
order, Anima worker0.14, dynamic batches, subjective quality, Invoke exact pixels
or release installation. Whole-MVP readiness remains open.
