# Anima positive regions with dedicated global scene area

The [two-seed scarf retest](./phase-4-anima-visual-retest-research.md)
found both scarves in the requested order and in reverse order at seed 123.
The bench disappeared in both regional images. This comparison asks
whether the existing global scene text can maintain a shared bench when
part of the image is reserved for it.

## Fixed experiment

Studio base `195302f63b5d575288665e288a2d8aac83c110ca`. Re-read clean
InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/frontend/webv2/src/features/generation/core/graph.ts::buildAnimaGraph`
creates the original Anima conditioning inputs. The Canvas caller
`core/canvas/compileCanvasGraph.ts` attaches the region collector.
`core/canvas/addRegionalGuidance.ts::addRegionalGuidance` passes each
nonempty positive text with its owning mask as a separate conditioning.

`invokeai/app/invocations/anima/anima_denoise.py` prepares the original
Anima contexts and asks `backend/anima/regional_prompting.py` to build
positive permissions from the complement of the regional masks.
`backend/anima/anima_transformer_patch.py` applies the masks on even
blocks. Odd blocks retain unrestricted attention. The global negative
is image-wide. Studio's signed `invoke-krea2-global-support-v1` profile
also uses the existing full-cover fallback from
`backend/krea2/regional_prompting.py`: when the mask complement is empty,
global positive text has image-wide support. The inset comparison
assigns dedicated rows to the global positive text.

Four saved Current Canvas Projects use the exact same 512×512 TXT
request at origin (−13, 5), seed 123, 20 Euler steps, CFG 4 and embedded
Auto VAE. They borrow the same signed installed worker and exact
Cyberfalafel Anima v1.0, Qwen3 and Wan VAE bodies. The ordinary Project
authors an empty Regional Guidance list. Full assigned uses the original
two masks with their 127/128 horizontal seam. Inset assigned keeps the
same x coverage and alpha ramp and limits both masks to processing
`y ∈ [64, 352)`. Inset swapped exchanges the two whole regional positive
texts and keeps their masks. Global and local text literals, weights,
negative policy and sampling are frozen across their respective
comparisons.

The full masks are expected to cover the entire 32×32 attention grid.
The inset masks leave 14 rows, or 448 query positions, to global
positive text on masked blocks. These counts describe the input and its
existing nearest-neighbor sampling rule. The same-seed native visual
test asks whether two identifiable white cats retain one shared bench
and whether their neck scarves reverse red/blue positions between the
two inset cases. Blind readers score actual scarf assignment, animal
count, bench and conspicuous seams before key reveal. They score the
ordinary and full-assigned controls separately. Human visual acceptance
is a separate evidence boundary.

## Results

R1 stopped before inference because the device number in the historical
Anima model receipt differed from the current mount. R2 used a
byte-identical experiment contract. It matched every other historical
file identity field, streamed and verified the full SHA-256 of all
three borrowed model files, then used their current exact identities
for the preservation checks around inference.

Native **PASS**. All four Projects saved and reopened. The ordinary
case generated through the ordinary worker entry point with an empty
region list. The other three jobs used the signed regional path.
All four base requests and the transparent target matched. The positive
masks and compiled texts matched the assigned cases. The independent
reconstruction found zero background-only cells and 1,024 cells with
global support via fallback for the full mask. Both inset requests
had 448 background-only cells. All four workers completed 20 events
and physically exited. The controller ran for 209.683 seconds, with
zero swap and no OOM. Group memory reached the 12 GiB cap and the maximum
sampled VRAM was 7,026 MiB. The run leaves host memory headroom
undetermined.

Visual **NOT_QUALIFIED**. Both blinded readers agreed on the cat counts,
scarf colors and bench presence. There were no conspicuous horizontal
seams.

| Case           | Visible scene and scarves                                        |
| -------------- | ---------------------------------------------------------------- |
| Ordinary       | Two white cats without scarves share a coherent bench.           |
| Full assigned  | Two cats, red scarf on the left and blue on the right. No bench. |
| Inset assigned | A bench and two red scarves. The right cat's pose is distorted.  |
| Inset swapped  | A bench with one centered red-scarf cat.                         |

The ordinary scene passes. A recognizable bench appears in both inset
images. Both inset cases fail the paired regional assignment. This
one-seed result leaves the joint placement and scene gate open.

## Checks and retention

The independent audit checked 80 progress events, the shared base
request, four distinct decoded outputs, four copied saved Projects and
26 package members, the exact Alpha8 and weighted prompt spans, and
all 30 migrations in each closed private SQLite. It streamed all
5,628,217,094 model bytes and checked seven Studio, eight Invoke, 77
installed-file and 17 configuration pins. It verified physical exit of
the controller and four workers. The mask-cell counts are a
reconstruction from the input and pinned composition implementation.
The audit examined retained bytes and physical process state.

The focused suite passed all 238 tests. Typecheck, scoped ESLint and
the application build passed.

The rejected preflight and the successful execution are retained at
`runs/anima-background-visual/20261121-r1` and `20261121-r2`.
R2 contains the originals, frozen input and model manifests, saved
Projects, closed databases, two blind reports, comparison and
independent audit. The compressed payload archive contains 43 verified
entries. Cleanup reclaimed 41,353,216 bytes across seven exact paths and
all 74 sealed files matched after cleanup. The signed runtime and model
files are borrowed dependencies.

Replay uses
[`qualify-installed-anima-background-visual.mts`](../../scripts/qualify-installed-anima-background-visual.mts)
with the exact retained case contract and a fresh owned 12 GiB,
zero-swap user unit with a 600-second limit.
