# Private Regional provisional RGB output

Status: ROOT-qualified private output mechanics on dirty
`master@10115df581d9e07049478dee3866a280886794fd`, following the completed
[exact embedding owner](./phase-4-regional-guidance-embeddings-research.md).
Risk: high, because this slice joins native results to filesystem publication.
Public admission and PP-001/007/008 remain **Пока не обещать**.

## Settled finite owner

Connect a complete Main recipe and matching existing txt2img command to the
existing private denoising runner, then convert its already denormalized native
`pt` result and call the existing provisional PNG publisher. The actual frozen
target must pass the existing digest/size/ICC/transparent-alpha validator before
encoding. Command bbox, dimensions, seed and concrete prompts must agree with
the recipe. This is private computation and provisional output only, without a
worker dispatcher, queue publication, candidate admission, acceptance or Save.

`generate_current_canvas_regional_txt2img` is a new private sibling frontend in
`illustrious_regional_output.py`. It accepts the exact existing ordinary
`GenerateIllustriousTxt2ImgCommand`, the complete recipe and the existing
explicit native arguments; it derives the exact base parameters internally.
Img2img/outpaint subclasses and independently supplied parameters are refused.
The returned `generation-done` dictionary is a worker completion response,
not a durable Main candidate receipt.

The existing native runner remains responsible for recipe/resources, owned text
components, conditioning, original attention, Euler and VAE restoration. The
existing image publisher remains responsible for temporary PNG, exclusive link,
directory sync and optional thumbnail. No denoising or filesystem transaction is
copied. Existing native-result entry points keep their signatures and return
semantics.

## Acceptance

- Reject subtype modes and malformed caller-constructed command metadata.
- Preserve the explicit CPU/CUDA encoding and execution profiles, support and
  pooled selections, one/two steps and all existing limits/refusals.
- Reject nonfinite or out-of-range final image values before conversion. Native
  `pt` output has already been denormalized; conversion must not do it twice.
- Reopen the published PNG and compare exact RGB bytes with an independent
  quantization of the observed native result. Check pinned sRGB, dimensions,
  receipt request/seed/path and the actual optional thumbnail.
- Use freshly produced complete Main recipes and actual transparent targets;
  cover CPU/CUDA, both layouts and exact stream-local resources.
- Invalid target/hash/geometry/path and existing outputs refuse before encoding.
  Native, conversion, exclusive-link and directory-sync failures return no
  completion and preserve the borrowed state, source target and existing files.
- Execute a channel-order or normalization semantic mutation after real native
  consumption. A color-sensitive published-byte oracle must turn RED while an
  unaffected control stays GREEN; restore exact source and rerun.

Conversion uses the pinned static `VaeImageProcessor.pt_to_numpy` followed by
`numpy_to_pil`. Each already denormalized channel value is converted to CPU
float32, multiplied by 255, rounded and represented as uint8. No resize, crop,
second denormalization or image-processor instance policy enters this boundary.
PNG output is RGB8 with the bundled pinned sRGB profile; no alpha contribution
or spatial preservation claim follows.

The current 512 MiB exact-TI copy ceiling excludes the normal full production
CLIP architecture when active TI requires copying. The generated architecture's
32 CLIP-G MLP weight pairs alone occupy 800 MiB in FP16; the separate native
mean-resize scratch is another obstacle. This is payload arithmetic, not a
memory measurement. Publication does not qualify trained capacity or quality.
Selective sharing of
encoder weights would add a separate mutable-state/isolation contract; merely
raising that ceiling would not establish it.

## Parameter register and executed qualification

| Boundary | Finite rule | Owner |
| --- | --- | --- |
| Operation | One exact ordinary command, recipe, native call and required PNG | New frontend; no worker dispatch |
| Target | Positive exact byte count ≤32 MiB; digest, pinned ICC, dimensions and zero alpha | Existing snapshot validator |
| Geometry | Exact command/recipe bbox including origin; 8–2,048 sides, `/8`, area ≤4,000,000 | Existing recipe geometry |
| Paths | Exact absolute PosixPath, 1–4,096 characters, distinct direct `.png` children; canonical private root | New bounded metadata check and existing path validator |
| Native result | Original profile-specific `[1,3,H,W]`, finite and in `[0,1]` | Existing output validator plus new range check |
| Conversion | Static CPU-float32 RGB8 rounding; no second denormalization | Pinned native image processor |
| Publication | Exclusive required PNG and optional thumbnail; no new encoded-output ceiling | Existing publisher; Main admission remains separate |
| Encoding/execution | Existing text/TI/geometry/mask limits, one/two Euler steps, explicit CPU/CUDA profiles | Existing private owners unchanged |

ROOT verified all 1,374 files against the previous final archive. A separate
native CPU float32 / CUDA FP16 conversion probe passes **2 cases** using the
pinned image processor: values 0, .25, .5, .75, 1 become 0, 64, 128, 191, 255,
with source tensors and global RNG unchanged. This mechanism probe does not
establish whole-recipe publication.

The fresh real Service/ModelService/package probe produces four complete
recipes from two saved/reopened projects, with unchanged durable state. ROOT's
CPU and CUDA native legs pass two cases covering **16 runs, 32 UNet calls,
32 Euler transitions, 16 VAE decodes and 16 provisional PNGs**. Every reopened
RGB byte matches independently quantized original native output; ICC, dimensions,
completion correlation, optional thumbnails and borrowed-state/RNG preservation
pass. The first CPU attempt failed only while recording a diagnostic hash after
the pixel assertion: a probe variable was reused for an attention tensor.
Renaming that probe variable changes no production code or assertion.

The new focused suite passes **60 cases**, the unchanged publisher/thumbnail
neighbors pass **15**, and the two whole-Main native cases pass: **77 PASS**,
zero failures/errors/skips, 41 dependency warnings. The separate two-case static
conversion mechanism probe is not added to that total. Fifteen fresh workers
run the focused matrix serially within the same 3 GiB / zero-swap / 600-second
envelope; observed focused peak is 1,696,071,680 bytes. The CPU/CUDA Main peaks
are 2,338,283,520 / 2,232,315,904 bytes. These are observed fixture runs, not
maximum-geometry or trained-model capacity bounds.

Draft test typing diagnostics are retained as **30 → 5 → 0**. Seven casts
precede the 60-case execution; a final dictionary typing cast follows it.
ROOT's AST comparison with casts removed proves unchanged inputs, conditions,
assertions and parameterization. Ruff/format and strict typing `quality-r3`
pass; the final typed source is also used by the isolated mutation phases.
Production source is byte-identical throughout all native runs.

A valid regional-positive exact-resource change, with text/literal, global
pools, geometry and seed fixed, changes actual published RGB8 on both lanes:
305 / 318 channel bytes of each 1,152-byte output. Independent native-context,
permission, pool and original-result oracles pass before the file comparison.
No final-pixel spatial-locality claim is made.

The isolated final conversion mutation reverses RGB channels only, after the
original native forward/decode. Six selected cases produce **6 GREEN →
4 semantic RED + 2 grayscale controls GREEN → 6 restored GREEN**. Two RED
cases consume real native pipeline results and fail at reopened PNG bytes;
two localize the literal RGB mapping. Native `pt` bytes remain identical across
all phases, only colored RGB results change, and restored observations are
exact. All 1,377 checkout files restore byte-for-byte.

Independent frozen R1 source review is CLEAN within its source-only boundary;
it does not independently rerun these ROOT results. It reviews the full module
and 60 cases before the final one-cast typing adjustment. Retained-byte audit and ROOT release are complete as recorded below. Final
source/document mapping is reviewed separately from native qualification.

Existing geometry remains 8–2,048 pixels per side, divisible by eight, and at
most 4,000,000 pixels. Existing target snapshots are bounded at 32 MiB. Final
RGB8 pixels use at most 12,000,000 bytes; native images, CPU conversion arrays,
quantization scratch, PNG encoding and optional thumbnail are separate
lifetimes, without a total RSS/VRAM claim. The serial qualification envelope is
3 GiB host memory, zero swap and 600 seconds per unit; the existing runtime is
reused. No additional environment, trained weights or network use is planned.

## Retention and release

Compact evidence is under
`~/.codex/artifacts/imagegen-studio/runs/regional-guidance-publication/20261026-rgb`.
It retains the full source/version/review archives, unchanged native primary
source dependencies, twelve Main originals in a verified archive, all raw
execution/mutation observations and **221 fixture mappings → 83 CAS blobs /
827,611 content bytes**. The 1,377-file isolated checkout is restored exactly.
Sources, generators, locks, migrations, ICC and actual causal PNGs remain outside
disposal. No environment or trained-weight copy was created.

The scoped retained-byte/dependency audit is CLEAN within its read-only limits.
ROOT separately refreshes owned process/cgroup exit, accessible same-UID users,
all source/restoration/entry hashes, incoming artifact references and completion
of all seven then-existing child tasks. After these gates ROOT removes exactly
23 idle candidate paths, including this run's generated bytecode cache, and
measures **34,156,544 bytes** reclaimed. Compact evidence, the previous
exact-TI source/primary evidence and the shared external runtime stay protected
with bidirectional lifecycle dependencies. The lifecycle has no live payloads.
An audit is not deletion authorization or independent runtime certification.

## Preserved exclusions

Enabled-region public NEW refusal, target-only Smart permission, published/frozen
Retry independence and Regional provenance/Compare/result-derived-preset
exclusions remain. No dispatcher, protocol, queue, Main candidate transaction,
acceptance, Save, UI or composition default changes. The generation-done response
describes worker provisional output only. Random native models and authored TI
vectors establish mechanics, not trained quality/capacity, checkpoint-to-pipeline
identity, installed/packaged-worker or public readiness. The 512 MiB TI copy
ceiling still excludes the normal full production CLIP architecture when TI is
active. PP-001/007/008 remain **Пока не обещать**.
