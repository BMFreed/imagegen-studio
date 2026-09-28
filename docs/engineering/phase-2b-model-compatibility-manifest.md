# Phase 2B: exact checkpoint compatibility manifest

> **Historical decision, superseded on 2026-09-28.** The exact-hash allowlist
> and ban on an `epsilon` default below describe the Phase 2B implementation
> checkpoint, not the current product contract. The current
> [managed model-library contract](../contracts/managed-model-library.md)
> permits supported CivitAI Illustrious/Anima `.safetensors` installation without
> an allowlist, stores Illustrious user prediction overrides by exact SHA-256
> and size only in Model Manager with an explicitly labeled `epsilon` default;
> Project displays the current value read-only, while `.igs` snapshots are
> advisory. It installs custom
> Anima checkpoints with pinned Qwen3/VAE. Generate still requires structural
> and component checks. The source evidence and past test results below are retained
> unchanged; they do not prove the new behavior is implemented.

Base: clean `c59fe30`. Risk: **high** for generation correctness: the wrong
prediction mode can yield a plausible but incorrect image, and silently changing
an exact Project reference would violate portable `.igs` identity. The product
decision is to permit first-release inference only for checkpoints listed in a
verified app-owned compatibility manifest. Unknown models remain installable
but Generate must explain why it is unavailable.

## Evidence and first qualified record

The official [OnomaAIResearch Illustrious XL v0.1 repository](https://huggingface.co/OnomaAIResearch/Illustrious-xl-early-release-v0)
contains both the single-file checkpoint and an author-supplied
[`scheduler_config.json`](https://huggingface.co/OnomaAIResearch/Illustrious-xl-early-release-v0/blob/dca0dac303e6dc4b0c31d8001bc685b89b5d0204/scheduler/scheduler_config.json)
whose `prediction_type` is `epsilon`. At pinned repository revision
`dca0dac303e6dc4b0c31d8001bc685b89b5d0204`, the
[`Illustrious-XL-v0.1.safetensors`](https://huggingface.co/OnomaAIResearch/Illustrious-xl-early-release-v0/blob/dca0dac303e6dc4b0c31d8001bc685b89b5d0204/Illustrious-XL-v0.1.safetensors)
has SHA-256
`3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9`
and size `6,938,040,760` bytes. A 1 MiB HTTP range read of **that exact
single-file checkpoint** returned `206` and a 365,016-byte safetensors header;
its own `__metadata__` declares `modelspec.prediction_type: epsilon` and
`modelspec.architecture: stable-diffusion-xl-v1-base`. This in-file declaration
is the primary evidence, with the author scheduler config as a cross-check.
The [CivitAI version API](https://civitai.com/api/v1/model-versions/889818)
response for model `795765`, version `889818`, file `798303` advertises the same complete hash; those IDs
are source evidence, **not** the lookup key. The installed file's actually
computed hash and size, plus supported family, are the lookup key.

This is evidence for the author's declared mode of **one exact file**, not an
inference smoke test or evidence that all Illustrious derivatives use
`epsilon`. InvokeAI's SDXL single-file default of `epsilon` is an assumption,
not a reliable classification of an arbitrary model. Tensor shape and a
successful model load can verify architecture/decoding compatibility, but do
not reveal the training objective. CivitAI version metadata has no reliable
prediction-type field for this purpose.

## Data and failure boundary

The download pipeline already computes the installed bytes' SHA-256 and size.
An exact manifest match may enrich the catalog's nullable prediction type at
installation. Before a generation plan, ModelService force-verifies the exact
installed file again and qualifies it against the bundled manifest; a stale,
corrupt, replaced or unknown file cannot inherit a type merely from its
catalog row. A saved `.igs` reference with `predictionType: null` can be
enriched **only in the frozen plan** by a matching verified manifest entry;
the portable reference and document revision are not silently rewritten.
Known contradictory values in the catalog or Project reference are errors, not
automatic corrections. The frozen job and eventual accepted provenance use
the qualified effective value.

The finite first manifest has one Illustrious record. A new record requires a
pin to the source revision, complete checkpoint digest/size and an authoritative
mode declaration associated with those bytes; matching a model name, CivitAI
ID, family or nearby release is insufficient. The app can distribute updated
records through its own update mechanism. User-editable overrides and
automatic `epsilon` fallback are outside this decision.

Tests should check the production install/plan path with a small byte fixture
and an injected exact manifest entry, plus positive and negative lookup tests
for the bundled official record. A neighboring unknown-hash fixture must stay
nullable and block Generate; known conflicting types and a modified file must
fail. Replacing the hash comparison with a family-only match is the principal
semantic mutation to catch. The official 6.94 GB file is not present locally,
so real model loading and inference remain an explicit validation gap.

## Verification on this checkpoint

The dirty tree based on `c59fe30` passed `pnpm run typecheck`, `pnpm run lint`,
`pnpm run app:test` (294/294) and `pnpm run app:smoke`. The
[manifest test](../../src/main/models/model-compatibility-manifest.test.ts)
checks the pinned source artifacts, while installation and plan tests enter
through real model catalog/file paths. Isolated semantic mutations that ignored
the SHA-256 or file size made the targeted tests fail. The Electron smoke still
does not load this 6.94 GB checkpoint or exercise inference.
