# Two ordinary FP32 controls

## Question and source

Base: clean `d7c99f37a5656f0a6cdb45c6fb51c246578c2848`.
The [noise comparison](./phase-4-regional-guidance-noise-research.md) leaves a
partial FP32 improvement and an extra mug for seed 124. Compare ordinary scenes
without enabled regions against the two already retained FP32/native swapped
results. Exactly **two fresh trained calls**, seeds 123 and 124; no seed search,
prompt revision, new sampling sweep or repeat of the previous matrix.

Current clean Invoke source is `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`.
Its actual ordinary path is applicable without a new algorithm:

- `app/invocations/text_encoder/compel.py`: independently encoded global text,
  dual-CLIP penultimate non-normalized states, CLIP-G pool, exact-empty zeros.
- `app/invocations/sd/denoise_latents.py`: all conditioning masks absent gives
  no regional structures; the global conditioning/pool remains.
- `backend/stable_diffusion/diffusion/shared_invokeai_diffusion.py`: negative
  before positive and no encoder mask for equal signed lengths.
- `backend/stable_diffusion/diffusers_pipeline.py`: no regional/IP-Adapter data
  preserves native attention processors.
- `app/invocations/latent_noise.py` and `backend/util/devices.py`: source-default
  seeded CPU FP32 noise is cast to FP16 for SD compute.

These paths are relative to `invokeai/`. Current active frontend graph/canvas
callers and all nine relevant source files are retained with revision/hashes.
Existing ImageGen capture/recipe/conditioning/native-output owners already
express this mechanism; no required mechanism is missing from Invoke. Native
`init_noise_sigma` stays fixed as in the comparator experiment, so this is
ordinary Main/native execution with Invoke's noise draw on the common runtime,
not an installed/full Invoke application qualification.

## Fixed inputs and observations

Use the existing genuinely saved/reopened `seed123-baseline` and
`seed124-baseline` Main handoffs. Their authored owners are disabled and their
complete recipes have no enabled regions. Do not delete regions from a swapped
recipe to manufacture these controls.

Keep official Illustrious XL v0.1 epsilon SHA-256
`3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9`,
1024×1024 at world origin (-13,5), the same global prompt and empty global
negative, thirty Euler steps, CFG 5, Main false-ZTSNR/leading policy, CUDA FP16
and embedded manual-FP16 VAE. Reuse the compatible runtime/model/config set.
No TI, LoRA, adapters or references. Public execution defaults stay unchanged.

Reuse the existing source-noise/preparation scope and original native loop.
Expect one pair/K77, three consumed CLIP forwards, no TI installation/resizing,
no regional structures, and original processor/SDPA masks `None` at all seventy
cross-attention sites on every step. Keep streaming state/RNG/reservation and
method-slot restoration checks, actual initial-latent consumption, beta/sigma
timeline, native Euler/VAE and independently reopened PNG quantization.

The selected FP32 initial latent, global encoded pair, pools/time IDs and
schedule must match that seed's pinned regional comparator. Context banks and
permissions intentionally change from K231 to K77 through the genuine disabled
recipe. This removes the entire enabled-regional path, not one isolated mask
subcomponent. The two regional images/records remain historical comparators.

Compare all four unchanged original PNGs in anonymous order. Record recognizable
objects/counts, colors, placement, support, malformed geometry and coherence
before revealing conditions. Ordinary global text does not prescribe a side.
If defects persist without regions, they already exist in ordinary generation;
this does not exclude an additional regional effect. If ordinary scenes are
coherent and regional ones add defects, focus the next check on the Invoke-based
regional adaptation. Neither outcome selects a product default or qualifies
general quality or full assignment/swapped reversal.

## Evidence and bounds

Evidence owner: `runs/regional-guidance-ordinary/20261031-fp32-controls/`.
`ordinary-contract.json` freezes the two-call ceiling, complete inputs and two
regional comparator pins. A compact run-owned probe adapts existing qualified
test owners; no new production implementation or permanent test suite is needed.
Its exact source and hash remain retained with commands, reports and originals.

Use one serial trained unit within 12 GiB host, zero unit swap, 600 seconds and
CUDA allocator fraction 0.75. Small/preflight units use 3 GiB. New compact proof
targets 96 MiB; source/model/runtime and earlier required proof remain protected
dependencies. Archive needed bytes and confirm physical idle before disposable
payload cleanup. Commit/push follow source/results verification.

## Executed result — 2 November 2026

The interrupted preparation resumed with fresh runtime and full checkpoint-byte
verification. The compatible Torch 2.7.1 / Diffusers 0.40.0 / Transformers 5.5.4 /
Compel 2.4.0 runtime was reused; no provisioning or model copy was needed.
The independent frozen-probe source review found no reachable blocker.

One serial unit completed **3 PASS / 4 warnings / zero failures, errors or
skips**: two trained requests and one model-free comparison. There were exactly
60 UNet calls, 60 Euler transitions, two VAE decodes and 4,200 cross-attention
site observations. Each request consumed one K77 prompt pair, three CLIP
forwards, zero TI loads/resizes, and native `None` attention masks at every site
and step. Actual Invoke global concat/kwargs consumption agreed with the
observed context, pool and time IDs. Complete source state/storage, mutable
graphs, tokenizers, RNG, reservations and method slots passed restoration checks.

For each seed, the actual selected initial latent, global conditioning,
pool/time IDs and schedule matched the pinned regional comparator. Guided
batch-one Euler predictions differed at all thirty steps. Reopened RGB changed
in 2,977,262 channels / 1,045,028 pixels for seed 123, and 2,961,844 channels /
1,038,684 pixels for seed 124. These measure the whole enabled-regional-path
contrast, not an isolated mask effect. A separate model-free readback reproduced
every RGB byte of both fresh PNGs from the original FP16 native snapshots using
independent float32 quantization, and checked dimensions and pinned ICC bytes.

The trained unit took 145.682 seconds, with host cgroup peak 7,913,971,712 bytes
and zero swap. Peak observed host sample separated 903,467,008 anonymous bytes
from 6,984,388,608 file bytes. Maximum recorded CUDA allocated/reserved values
are retained per request; these observations do not establish general capacity.
Both requests recorded CUDA peaks of 9,617,606,144 allocated and 12,192,841,728
reserved bytes. All owned unit groups were physically empty after exit.

## Visual finding and next boundary

An independent observer viewed all four anonymous full PNGs without prompts,
conditions or the key; ROOT separately viewed all originals. The observations
agree on these visible results:

| Seed | Genuine no-region control                                                                                                               | Historical regional comparator                                                                                                       |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 123  | One blue decorated mug and one red apple, apparently grounded; distorted wood-grain foreground and ambiguous curved surface boundaries. | Same principal object count and placement; ambiguous wood-grain foreground persists, with an additional incomplete silvery fragment. |
| 124  | Blue mug left, extra white mug right, apple between them on a tray; tangled, ambiguous background structure.                            | The same three-object arrangement and ambiguous background persist.                                                                  |

The extra mug at seed 124 and foreground distortion at seed 123 therefore occur
without enabled regions. They cannot be attributed solely to Regional Guidance;
this does not exclude additional regional effects. Ordinary text prescribes no
side, so this control supplies no assignment/reversal PASS. Human acceptance and
general visual quality remain unqualified; the earlier swapped visual result
is unchanged.

The next diagnostic boundary is ordinary-scene calibration against the current
Invoke implementation and its applicable model/sampling preparation. Do not
repair the regional mask algorithm or select FP32 as a production default from
this two-seed contrast. Any further settings experiment needs separately frozen
inputs and ordinary controls; no further trained calls were made here.

Evidence includes the pinned probe/contract, loading journal, JUnit, both fresh
raw native snapshots, four unchanged PNGs, anonymous observations, source pins,
resource/exit records and full payload retention/readback. The source-only
review is separate from ROOT's execution and pixel measurements.

The no-follow inventory and complete archive readback retained all twelve
payload entries (eight regular files/four directories), including both original
PNG/thumbnail/target/native-snapshot sets. After a fresh eight-unit exit check,
three completed readers, source checks and incoming-dependency clearance, only
this run's `payloads/` was removed: **14,737,408 allocated bytes reclaimed** in
the deletion-only interval. Its 10,273,993-byte archive, four display PNGs,
reports and required historical dependencies remain. Lifecycle is `retained`
with empty live payloads. The same-UID process scan explicitly excludes
inaccessible preexisting desktop-service handles; it is not a whole-OS census.
The compact set remains below its 96 MiB target; the artifact root is about
13.9 GiB, below the 30 GiB soft budget.

Enabled-region public NEW refusal,
frozen Retry independence, Smart target-only permissions, Regional provenance/
Compare/preset exclusions and PP-001/007/008 **«Пока не обещать»** remain unchanged.
No durable Main candidate, acceptance, Add/Save or Anima capability is added.
