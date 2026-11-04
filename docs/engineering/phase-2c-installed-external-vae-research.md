# Installed external Illustrious VAE qualification

## Scope and starting evidence

Base: `514cd02f25352d64aca6b9645d711ee53c14d0a8`, `master`; clean before this
slice. Risk: high because qualification observes exact managed resource identity,
durable queue/Retry, accepted provenance and actual `.igs` Save/readback.
Supporting promises: PP-004/005/008 in [Product Promises](../product-promises.md).
Behavior comes from [generation settings](../features/project/generate-mode/generation-settings.md),
[external VAE authoring](./phase-2c-external-vae-authoring-research.md) and
[external inference](./phase-2c-external-vae-inference-research.md).

Confirmed by source review: production external selection, Reset and relink are
already implemented. No production defect is established at entry. The remaining
roadmap gap is installed UI evidence connecting those paths to trained CUDA
inference. This slice extends the native qualification harness rather than
inventing another loader or changing the accepted resource contract.

## Owners and observable boundaries

Project selector supplies local model/version IDs; Main resolves qualified
source/hash/size and freezes an external VAE or explicit `null` (Embedded).
Preparation composes the real source target. SQLite owns durable admission;
Retry and dispatch reverify the original exact reference and managed file.
The installed Python worker loads a complete offline AutoencoderKL snapshot,
injects it before VAE encode/decode and selected inference precision, and emits
finite PNG/thumbnail or a correlated failure. Completion stays in staging.
Only explicit Add creates layers and immutable portable provenance; Save writes
the `.igs`, and the actual loader independently rereads it.

Library Default and later Project edits must not alter a queued request. Reset
changes only the current draft. Accepted provenance must have portable source
IDs/hash/reference metadata, never a managed filesystem path or operational VAE
byte size. Size stays in the frozen worker inputs. Comparison reports external to
Embedded as `Removed`, and Embedded to external as `Added`.

Relink does not rewrite older accepted records. Its controlled native/portable
evidence remains in the authoring slice; this run does not claim an installed
trained relink expansion. Loader refusal for incomplete/non-finite weights is
also distinct from inference-output non-finiteness: external loading initially
casts to FP16, so FP32 is not a remedy for arbitrary unsupported files.

## Bounded matrix and causal control

The dedicated `external-vae` profile uses exactly 256×256, three requested steps,
fixed seed `0`, explicit FP32 and a resumed owned Linux/NVIDIA runtime. Four VAE
choices each run through txt2img and opaque img2img: eight finite completions.
An actual cancellation and frozen Retry adds one retained canceled admission
(nine admissions total). A failure, OOM, timeout or unsupported import is never
counted as a successful finite case.

Choices are Embedded, original-LDM extracted VAE, native-Diffusers extracted VAE,
and an explicitly artificial finite native control. Both unmodified files were
extracted from the same Bismuth checkpoint used by Embedded. They should produce
equal decoded RGBA. Equality alone cannot detect an ignored selector: the control
adds `0.1` to `encoder.conv_out.bias` and `0.15` to `decoder.conv_out.bias` and
must produce different pixels. This proves selected weights have a causal effect;
the combined control does not independently ablate encoder versus decoder. It is
not a second published model or an image-quality assessment.

For img2img, the source is one PNG produced by this run's Embedded txt2img.
Each fresh project imports that identical file through the real UI/Main/installed
CPU-worker import flow. The fixture overrides only the native file-dialog return.
Strength `0` isolates VAE encoding/decoding and legitimately has no denoising
progress; actual terminal completion, receipt, PNG, thumbnail and seed are still
required. This does not qualify a broader external-VAE denoising matrix.

The exact-native img case enters via Generate, then actual Cancel. Check child
exit, no receipt/candidate/cursor advance. Use the real Model Manager to change
the resource's library Default to the artificial control and Reset the current
Project draft. Public Queue Manager Retry must retain exact-native identity,
target, prompt, seed, strength and FP32. Every completion remains unaccepted until
the real Add/Save/reopen flow, with recorded/current comparison afterwards.

## Resource and operational parameters

- Reuse the existing isolated runtime/catalog, installed worker `0.12.0` and
  genuine CPython `3.12.13`; original weights remain read-only.
- Retain all six existing resource rows. Append one explicitly declared
  Illustrious VAE resource with three exact versions/files: final seven resources
  and nine file identities. Resume accepts only those declared hashes, not
  arbitrary extra resources. Other profiles retain their existing strict guards.
- New copies total `502,003,754` bytes (three standalone VAE files), not another
  checkpoint/runtime copy. Verify exact source hash and size with bounded streams.
- At entry: approximately 9.2 GiB free disk and 21 GiB available RAM; RTX 4080
  16 GiB VRAM. These are host observations, not supported capacity promises.
- Root alone runs heavy work serially. Native whole-process user cgroup:
  `MemoryMax=12G`, `MemorySwapMax=0`, Node heap 512 MiB, deadline 1800 seconds.
  Checks use smaller independent caps. No concurrent ML/suite/build execution.
- Artifact directories are exclusive. Binary/pixel failures use short boolean
  comparisons rather than large assertion diffs.

## Refusals, sensitivity and acceptance

CLI tests must reject malformed profile dimensions/steps, missing resume, wrong
types/families, source lineage descriptors, duplicate identities and invalid
version naming before installation. Runtime source/size/hash mismatches and
unknown catalogs must refuse; partial controlled installs can resume only within
the declared resource set. Canceled admission must not leave a completion or
advance the seed. A terminal error remains observable and fails this profile.

After a positive installed run, execute a plausible semantic mutation in an
isolated owned installed-worker copy: ignore the selected external VAE and retain
Embedded. The artificial-control pixel assertion must turn red while matched
Embedded neighbors still complete. Restore the exact installed payload and
confirm its source hashes/healthy handshake; never publish the mutant.

Review is self-review plus source-boundary review by a delegated reader, not a
blind product audit. Validate the actual report, SQLite jobs/receipts, saved
archives and native screenshots. Run appropriate app/CLI regression checks,
typecheck, lint and build; record successful executions separately from tests
that merely exist.

This slice does not establish live CivitAI delivery, training lineage from shape
metadata, alternate Anima VAE, external-VAE outpaint, embeddings, v-prediction,
batch/Reuse capacity, release installation/update or all-GPU support. PP-004/005/008
remain open; update their evidence and matrix row together after actual runs.

## Results

Artifacts: `~/.codex/artifacts/imagegen-studio/installed-external-vae-2026-10-07/`.
Source and installed worker match in all 43 payload files. Streaming verification
confirms all three historical fixture hashes/sizes. A fresh tensor-byte check
finds exactly 248 matching native/control tensor descriptors: 246 unchanged
tensors and only the two declared biases changed. Nominal additions are rounded
to F16 before addition, as recorded in `causal-control-lineage.json`.

First native attempt (`native-v1`) completed a genuine Embedded generation,
Add, Save and reopen, then failed its new comparison assertion: FP32 was `Same`
and the actual UI intentionally hides unchanged settings by default. This was
a harness omission, not an inference or product defect. The fix operates the
real `Show unchanged settings` checkbox before requiring the same FP32 row;
the value/status assertions are preserved. The failed report and exact tested
runner remain available; the next attempt uses a fresh artifact directory.

The final positive attempt (`native-v2/report.json`, exact runner copy
`tested-harness-v2.mjs`) passed all eight finite completions and nine actual
admissions, including one retained canceled original. Four real UI imports use
one common source. The original six catalog rows/versions/defaults are unchanged;
the positive resumed run copied no additional weights. Final catalog: seven
resources, nine ready files/versions. Renderer errors are empty and Electron
exited with code `0`.

Observed decoded RGBA hashes:

| Mode                | Embedded / exact LDM / exact native                                | Artificial native control                                          |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| txt2img             | `926bf5288803d17b89c4011e12159b8579ae5df98ba019d98e84f0e6cef81658` | `edb50322fdbee8410e2b9692ceaa0583d2eaf68ba30b765a9e4896dd03adce0b` |
| img2img, strength 0 | `01d3194bf832566773bd1b97fe4b91bc71e523b55aaeefb2cdcfdb42687dc76a` | `0b9c6515d94f5b2e4e62f2eb0121809d84b5ea7f7d76de9fca936511375bfa26` |

Native Default changed through the actual Model Manager to the artificial
control after Cancel. Draft Reset stored Embedded; public Retry completed with
the original native file/ref/target/FP32/fixed seed. The canceled source remains
canceled and its sequence advances once on consumption (`3` to `4`). Explicit
Add, real Save/readback/reopen and read-only comparison preserve exact recorded
VAE/Embedded despite the current different draft. The real checkbox exposes
unchanged FP32 rows. Eighteen native screenshots are retained; source/managed
VAE paths are absent from accepted metadata.

Positive native whole-process cgroup: `11min 52.746s`, reported memory peak
`1.1G`, swap `0B`, successful exit. These are measurements of this bounded
development run, not maximum geometry or VRAM guarantees.

The actual installed-worker semantic mutation silently retained Embedded rather
than injecting the selected external VAE. Its four txt2img neighbors completed
and passed Add/Save/reopen/comparison, then the causal pixel assertion failed:
the artificial control produced Embedded pixels. This is an assertion-level red,
not a startup/protocol/fixture failure. Evidence: `installed-ignore-mutation.json`
and `mutant-ignore-external/report.json`. The experiment restored all 43 original
payload hashes in `finally`; `restored-handshake.json` independently confirms
genuine installed Linux/NVIDIA worker 0.12.0 startup and exit `0`. The full
trained matrix ran before mutation; it was not redundantly rerun after byte-exact
restoration and the healthy handshake.

Two actual CLI mutations in copied scripts also turn the tests red: omit external
profile validation, or omit the mandatory resume boundary. The unmodified CLI
neighbor is green, and the copied runner is restored to the tested hash. An
initial experiment setup stopped at pnpm's workspace auto-install refusal,
before any tests or mutation; it is retained separately and is not a mutation
kill. The final experiment invokes Node directly and includes the runner helper.

Checks: 2069 app/provisioning tests and 65 qualification CLI tests pass (2134
total), plus typecheck, full lint, build, scoped lint after the unchanged-row UI
fix, and final formatting/diff checks. Three semantic mutations are killed: one
real installed inference mutation and two CLI boundary mutations. Heavy work is
serial, whole-process cgroup bounded and swap-free; final artifact hashes are
sealed in `delivery.json`. No production loader/selection change was necessary.
Promise statuses remain open; the next bounded phase2C step is trained installed
embedding qualification.
