# Private regional Euler ancestral sampling

Base: clean `6500046b7136324ebdc6d622b7d73ffc7379d7df`. The user explicitly
retains official Illustrious XL v0.1. The prior tag-form prompt attempt remains
NOT_QUALIFIED: one narrow color PASS and three INCONCLUSIVE. This checkpoint
checks a fixed author sampling candidate without changing text or checkpoint.

## Source and finite ownership

Read current clean InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:

- `invokeai/backend/stable_diffusion/schedulers/schedulers.py`: `euler_a`
  selects native `EulerAncestralDiscreteScheduler`.
- `invokeai/app/invocations/sd/denoise_latents.py`, `init_scheduler`: a separate
  compute-device generator is seeded with `seed ^ 0xFFFFFFFF`.
- `invokeai/backend/stable_diffusion/diffusion_backend.py`, `step`, and the
  legacy `diffusers_pipeline.py` caller forward this generator to native step.

Studio's ordinary scheduler selector already uses this native class. Extend
only the private regional profiles and existing file-backed qualification path.
The two explicit ancestral profiles require Euler a/epsilon, the existing
versioned Main noise policy, exact integer steps 1–200, and their existing
CPU FP32 or CUDA FP16 lane. Existing Euler profiles retain their admission and
behavior. No scheduler equation or denoising loop is copied.

The fresh native SDXL wrapper's original `prepare_extra_step_kwargs` remains
authoritative for supported kwargs. A scoped adapter replaces only its returned
generator with Invoke's independent compute-device generator, restoring its
attribute presence on every exit. The initial CPU generator and native
compute-dtype initial draw are unchanged. This is an explicit adaptation of
Invoke's step RNG, not complete Invoke initial-noise or cross-app pixel parity.
Ordinary generation is unchanged. Public draft/coordinator/queued admission
remains Euler-only; private wire admission adds Euler a without raising public
capabilities or changing defaults.

Risk: medium inference behavior, with the existing owned-file transport and
publication lifetimes retained. Preserve request/recipe/target association,
original native loop, attention, finite checks, borrowed model/scheduler/RNG
state, exclusive publication and physical-child-exit lease ownership. Failures
return no successful completion; a fresh call must remain possible.

## Preregistered comparison

Contract `regional-euler-ancestral-v1`, SHA-256
`a9af03b7349041046bca3e28ad77bc529f063ca2709795d17dcda35936d96efb`.
Evidence: `~/.codex/artifacts/imagegen-studio/runs/regional-guidance-euler-ancestral/20261105-red-blue`.

Exactly six fresh saved/reopened Main callbacks: baseline, assignment and swapped
for each of seeds123/124. No repeat, extra Invoke run or adaptive tuning.
Baselines genuinely author disabled owners and produce `regions == []`; all six
use the same private output and step RNG. The ordinary Euler-a path has a
different generator contract and is not silently used as a matched control.

Keep the exact official epsilon file SHA-256
`3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9`,
1024², bbox `(-13,5)`, CFG5/rescale0, embedded explicit FP16 VAE, Main-resolved
scaled-linear/false-ZTSNR/leading, empty negatives and no TI/LoRA/references.
Keep the global `2girls, anime illustration of two women standing apart side by
side, waist-up, simple clothing, plain light gray background, coherent daylight`
and regional `1girl, long hair, red hair` / `1girl, long hair, blue hair` literals.
Binary half masks split at x512, Everywhere global supports, `current-canvas`
pools, negative-first CFG and `invoke-canvas-v1` remain fixed.

The [exact author model card](https://huggingface.co/OnomaAIResearch/Illustrious-xl-early-release-v0/blob/dca0dac303e6dc4b0c31d8001bc685b89b5d0204/README.md)
recommends Euler a, 20–28 steps and CFG5–7.5. Select Euler a/28/CFG5 once.
The card does not endorse these exact prompts or establish quality for this
untuned base. Compared with retained Euler/30 tag-region controls, this bundles
sampler, step count and stochastic-step RNG; it cannot isolate one cause.

Freeze ten anonymous originals: six new images and four retained Euler/30
regional controls. Independent image-only descriptions precede key reveal.
Apply the prior conservative count/color criterion: two distinct figures,
one centered per half, unequivocal predominant red-left/blue-right and its
reverse for both seeds. Ambiguous pink/lavender shades stay INCONCLUSIVE;
clear missing/extra/fused or wrong-side/color figures fail. All four regional
cases must pass. Baselines check coherent two-figure ordinary scenes without
prescribed hair color. Record artifacts separately; no age/general-quality or
human acceptance follows automatically.

## Executed checks

ROOT executes **130 Python cases / 134 warnings** and **119 Main cases**, zero
failures/errors/skips in the accepted final sets. Native small fixtures cover
CPU/CUDA, actual ancestral class, leading28 grid, separate generator identity,
device/advancement, initial-stream independence, original step results, repeat,
changed seed, hostile borrowed scheduler, pre-work refusals, PNG publication and
second-step failure/restoration/fresh recovery. Main tests retain public Euler-a
refusal and prove exact private sampler handoff plus other-sampler rejection.

An isolated source mutation removes only the step seed xor. Twelve executions
reconcile to **4 GREEN → 2 semantic RED + 2 unchanged Euler controls GREEN →
4 restored GREEN**. Both CPU/CUDA targets fail at the incorrect consumed seed;
there are no import/OOM/setup substitutes. The source copy restores byte-exactly
and the workspace never receives the mutation.

The first expanded native set had129 PASS and one stale signature-oracle failure:
the historical test did not account for the already-existing optional
`on_progress`. Base/current high-level argument ASTs are equal. Its five-line
expectation correction preserves required semantic kwargs and explicitly checks
the optional progress slot; the final130 all pass. Initial typing invocation
used the wrong root configuration, then the correct project found11 diagnostics;
cast-only corrections preserve erased AST and finish with zero diagnostics.
These attempts stay separate from accepted results.

Full TypeScript typecheck, explicit `.mts` typing, separate scoped Main/runner
ESLint, scoped strict Python typing, Ruff, code/new-note Prettier and diff checks
pass. Historical README/feature prefixes are preserved byte-exact; their new
sections are formatted separately rather than reformatting historical notes.
Two independent source-only reviews are CLEAN; neither certifies execution.

## Native and visual outcome

The existing compatible worker0.14.0 is refreshed in place through its guarded
qualification owner. Actual readiness and physical exit pass; dependencies,
environment and checkpoint are reused without copies or downloads. ROOT's six
fresh genuine Main requests complete in **299.789 seconds**, with **168 scalar
progress events**, six original sRGB PNGs and all physical workers exited.
Observed host unit peak is **2,469,720,064 bytes**, swap zero, inside the serial
12 GiB/zero-swap/1,800-second unit and600-second request bounds. No allocator
fraction or capacity qualification follows.

Saved/reopened Main handoffs and requests retain exact prompt, mask-plane,
target-byte, checkpoint-path/SHA, VAE, CFG and resolved-noise association with the
retained Euler30 controls. Fresh isolated catalog/document/owner/request IDs
legitimately differ; local catalog UUID equality across runs is not claimed.
Every baseline genuinely retains two disabled owners and emits zero regions.
All six use the same private ancestral profile. Reopened PNG hashes, RGB bytes,
ICC, dimensions and response identity verify independently.

No fresh trained CLIP/context/70-site numerical observer or original native
PT-to-RGB witness is installed in these six visual requests. Native small-fixture
observations above remain a distinct execution boundary.

Ten full originals are randomized before independent image-only descriptions;
ROOT records its own observations before key reveal. ROOT knows prior outputs
and is not independently blind. The fixed conservative narrow gate is:

| New case           | Blind ID | Observed result                                                    | Verdict      |
| ------------------ | -------- | ------------------------------------------------------------------ | ------------ |
| Seed123 assignment | 08       | Two figures; orange-red/coral-red left, navy blue right            | PASS         |
| Seed123 swapped    | 06       | Three traceable head/body associations: silver-white, blue and red | FAIL         |
| Seed124 assignment | 03       | Two figures; clear warm red left, saturated cobalt/dark blue right | PASS         |
| Seed124 swapped    | 02       | Two figures; silver-white/very pale icy-blue left, brick-red right | INCONCLUSIVE |

Outcome: **2 PASS / 1 FAIL / 1 INCONCLUSIVE**, overall **NOT_QUALIFIED**. Both
baseline count/separation subcriteria pass (IDs09 and04); complete ordinary
prompt/age/framing and general quality are not promoted. Retained Euler30
controls keep1PASS/3INCONCLUSIVE. More saturated assignment images do not cancel
the extra-figure failure or pale-color ambiguity in swapped images. Elongated
legs, rough/hidden hands, clothing changes and framing drift remain visible.
The previous bright central band survives in its retained control; its absence
in new images does not establish a unique cause or general repair.

This is bounded AI assessment informed by independent descriptions, not human
ground truth. Human acceptance remains pending. No extra generation or input
change follows viewing. The bundle has not solved reliable color/side reversal
on this fixed v0.1 experiment, and supplies no source-backed attention defect.
Any next comparison must be separately declared; preserve the user's checkpoint
choice and consult Invoke before changing another non-UI mechanism.

## Retention and boundary

All originals, six complete packages/targets/handoffs, raw checks/mutation phases,
source archives, pinned Invoke/native dependency sources, anonymous observations
and runtime association remain retained. All82 own payload entries verify against a retained archive before disposal.
ROOT's fresh physical PID/start-time, reusable-runtime idle, restored mutation,
unchanged execution-source, ended-reader and global lifecycle incoming checks
precede removal of only this run's `payloads` and `character-worker-scratch`.
The deletion-only interval removes **4,411,392 allocated bytes**. Lifecycle is
`retained`, `payloads: []`; six original PNGs, packages/targets/handoffs, anonymous
copies and protected shared dependencies remain. This is ROOT lifecycle evidence,
not an independent physical-deletion certification.

Current public permissions, frozen-work independence, Smart target-only scope,
and Regional provenance/Compare/preset exclusions remain intact. Public Euler-a
admission, ordinary generator behavior, queue/persistence, UI, Anima, trained
quality and release readiness are unchanged. PP-001/007/008 remain
**«Пока не обещать»**.
