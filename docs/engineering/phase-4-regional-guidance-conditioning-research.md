# Private Illustrious encoded-conditioning bridge

Status: **complete within its private native CPU assembly/consumption boundary** on dirty
`master@10115df581d9e07049478dee3866a280886794fd`, following the
[CPU tensor adapter](./phase-4-regional-guidance-tensor-research.md).

## Finite owner

One private module assembles and consumes ordered sign-local encoded tensor
bindings. Each binding contains its ID, an actual unpadded `[1,L,2048]` context,
explicit latent-grid coverage and an optional `[1,1280]` pooled vector. The owner
derives numerical lengths, ranges, common K and context rows from those same
records. It accepts no independently supplied plan or replacement context. A
normal native Transformer/SDXL UNet forward runs under the existing scoped
adapter, with owned copied context injected by this owner. No denoising loop or
production generation caller is added.

The API is one-shot: ordered bindings enter, a normal native result returns.
There is no reusable object exposing mutable internal tensors. A small owned
conversion helper accepts the existing exact `SdxlConditioning`, validates its
paired shape/true lengths and removes only final cross-sign padding. It never
trims zero-valued rows. Empty text remains the encoder's actual 77 zero rows.
The canonical tensor API remains encoder-neutral with arbitrary positive row
lengths inside the existing numerical limits.

Late observation-only guards bind root inputs and every bound `attn2` context
to the owned values after pre-existing argument-transforming hooks. Changed
values refuse before original attention consumes them; equal-valued clones and
observers remain valid. Native signatures bind positional arguments and defaults.
Guard registration and execution share a handle journal, removed before the
outer adapter restores. This remains cooperative: owned snapshots must not be
mutated in place and model/hooks/processors must not change during the call.

Pooled ownership is explicit by source ID within each sign. Transformer calls
require no pooled/time selection; SDXL `text_time` UNet calls require both signed
selections and explicit CPU float32 scalar timestep and `[B,6]` time IDs. No
first/global/longest/average heuristic is introduced. CFG is negative then
positive; positive-only retains both signs' validation and common K. Root-level
prior masks are explicit `[B,K]` binary key permissions, passed through normal
native preprocessing. There is no arbitrary model-kwargs forwarding or context
override.

Raw tensors cannot prove their textual origin. The guarantee is preservation of
the caller's declared binding association through actual consumption. Prompt
composition, global coverage, pooled policy, catalog/embedding loading, dynamic
expansion, world-to-latent mapping, Smart inheritance, Anima, references and
durable replay remain separate. Main/UI/protocol/capability/queue/provenance and
public admission are unchanged. Enabled-region NEW refusal, target-only Smart
permissions and published/frozen Retry independence remain. PP-001/007/008 stay
**Пока не обещать**.

## Research and risk

The existing `build_sdxl_conditioning` aligns CLIP1/CLIP2 within each sign,
concatenates features and records true lengths before padding across signs.
The existing adapter intentionally trusts a separately supplied context/plan
correspondence. This owner closes that mechanical seam by deriving both from
the same ordered records and passing them together to a real consumer.

Root actually reuses the existing Python environment and executes three
native CLIP/Compel baseline cases: distinct signed embedding vectors and two
empty-opposite-sign controls. All three pass without skips, using local random
CLIPs at widths 768/1280, native tokenizers and pinned Torch/Diffusers. No trained
weights, downloads, catalog or new environment are used. This is baseline
readiness evidence, not a new bridge result.

Risk is high at the mutable native-model scope and input-ownership boundary.
Wrong concatenation can silently assign a spatial mask to another stream;
shared storage can retarget a call after preparation. Both signs, all IDs,
coverage, selected pools, sample/time/mask shapes and resource arithmetic must
pass structural preflight before validation scratch or snapshots. Finite checks
may allocate bounded temporary Boolean tensors; cloning, padding and
concatenation wait until validation succeeds. A read-only validation seam in the
existing adapter reuses its complete model/binding/profile rules before owned
tensor assembly. It reserves no model; actual scope entry revalidates and
reserves before installation.

Alternatives: a separate `(context, plan)` DTO retains the mixing gap; a reusable
mutable owner adds lifecycle without a current reuse consumer; accepting only
paired conditioning couples independently ordered signs. One tensor-input
surface plus an owned producer conversion and one-shot native consumer keeps
this boundary finite. The existing text encoder, embedding-loading path and
denoising loop remain unchanged.

## Parameter register and acceptance

| Parameter                  | Decision and boundary                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Native profile             | Existing CPU float32/eval/no-grad/no-autocast Torch 2.7.1 / Diffusers 0.40.0 profile                                                  |
| Encoded widths             | 2048 context / 1280 pooled, current dual-CLIP SDXL profile                                                                            |
| Numerical bounds           | Existing 16 streams/sign, 308 aggregate rows/sign, latent sides 1–256 and alpha limits                                                |
| Owned context/pool payload | At most 5,056,512 float32 bytes for CFG context plus two pools; excludes sample, masks, validation scratch, plan and native workspace |
| Sample snapshot            | New private 32 MiB logical byte ceiling before finite scratch/copy; explicit refusal, no clamping                                     |
| Prior mask                 | Only binary `[B,K]`, bool or float32; existing adapter's separate 32 MiB expanded Boolean-mask ceiling remains                        |
| Runs                       | Serial owned groups, 3 GiB, zero swap, 600-second deadline; 100 MiB new local evidence aim                                            |

Planned acceptance includes real encoder → owned conversion → assembly → normal
native UNet/Transformer consumption; independently specified order, sign, ranges
and padding; unequal real dual-CLIP alignment; 77/154/231/308 row cases; empty
zero-77 retention; explicit non-first pooled sources; both CFG layouts; input
storage mutation after assembly; bounded preflight/refusal; exact model scope
restoration and fresh-call recovery. A concatenation-order mutation must produce
semantic RED with an unaffected single-stream control GREEN, then restore.
Actual model-quality, GPU, packaged-worker and public-generation qualification
remain outside this checkpoint.

## Evidence and release

Root completes the three native encoder baseline cases and an additional real
unequal-tokenizer probe: repetitions of `cat` at 1/26/51/76 give raw tokenizer
counts `(3n,n)`, actual combined rows 77/154/231/308 and shorter CLIP2 rows
77/77/77/154. Shorter-channel alignment and negative terminal padding are exactly
zero. A separate probe carries all four through the new owned converter and
one-shot normal SDXL UNet forward, observing exact consumed context/pooled rows,
finite results and processor/hook/call-entry restoration. These are explicit
root-run probes, separate from the new regression suite.

The adapter extension is additive: all existing definitions are AST-exact.
The existing 165 adapter/numerical/padding/native-neighbor cases pass again with
zero failures/skips. Initial production Ruff passes; one strict typing
diagnostic at an already-validated pooled value is corrected by a cast without
changing runtime guards. The first full new run executes 160 cases: 156 pass,
three fail because model-profile checks follow finite scratch, and one fails
because a test observer binds an unbound native signature without `self`.
The latter is a fixture error, not a production ownership failure. Root moves
read-only model validation before finite checks and corrects only the observer's
binding. The same targeted nine cases pass, including unchanged refusal and
storage assertions. Original failed records and source bytes remain retained.

The initial combined run passes **328 cases**, zero failures/errors/skips: all 160
new cases, 111 existing adapter, 48 numerical, four controlled padding/encoder,
two existing native outpaint/cleanup and three native CLIP embedding/empty
neighbors. This is CPU mechanics, not trained-image evidence. Final Ruff/format
and strict BasedPyright pass. The three test typing diagnostics are two generator
annotations and an explicit cast for an intentionally malformed mutable-alpha
input; runtime assertions remain unchanged.

Independent source review R1 finds a P2: a pre-existing hook can replace context
with reversed rows of the same shape, leaving the original ranges attached to
different bindings. Root runs the unchanged R1 production with 22 added cases:
11 semantic RED and 11 equal-clone/observer controls GREEN, zero setup errors or
skips. They cover root, Transformer and `attn2` key/CFG replacements plus root
sample, timestep, pooled text, time IDs and key-mask replacement. The late guard
correction is confined to this new module; existing adapter definitions remain
unchanged. All 22 then pass, together with a new partial guard-registration
failure/restoration/recovery case. The first corrected combined R2 run passes **351 cases**:
183 new and the same 168 existing neighbors, zero failures/errors/skips. The old
328-case result is preserved as R1 evidence. Both actual unchanged-source RED
records and corrected-source GREEN records remain retained.

Corrected-source Ruff/check-format and strict BasedPyright pass. Two optional
subscript diagnostics in the new guard are resolved with a cast after the
existing exact-dict/key guard; no runtime condition or assertion changes. The
351-case pre-cast source is retained separately for execution mapping.

The R1 concatenation mutation is semantic RED with its single-stream control
GREEN, then restored GREEN; every isolated source member is restored exactly.
The corrected R2 source passes the same 351-case combined run after the
typing-only cast, zero failures/errors/skips. Final R2 order mutation again gives
GREEN2 → semantic RED1 / single-stream control GREEN1 → restored GREEN2. Every
member of each 1,360-file isolated checkout is restored to its own R1/R2 archive;
shared source remains unchanged by both mutations. Final independent source R2
is CLEAN/READFINISHED, closing R1's P2 at source level; both candidate retention
audits are CLEAN/READFINISHED within retained-byte/dependency scope. These reviews
did not independently rerun ROOT's native checks.

ROOT's release gates freshly check all 26 registered owned units, recorded
cgroups, candidate-related process handles/arguments, all 12 then-existing child
tasks/readers, source and CAS identities, both restored checkouts, the artifact
lifecycle dependency graph and incoming symlinks. Only the seven declared idle
payloads are removed: four R1 and three R2 paths. Measured artifact-root reduction
is **61,374,464 bytes (58.53125 MiB)**, matching their allocated total. Raw generated
unit fixtures remain as 24 source mappings to four CAS blobs; they include
synthetic TI vectors and a literal checkpoint marker, not trained weights.
Reports, failures, semantic RED/control/GREEN, source archives/manifests and
native-source dependencies remain retained. Final source has 1,360 members;
qualified R1, pre-typing R2, corrected R2 and final documentation are mapped
separately. No fresh app/prototype/packaged-worker build is claimed.

Evidence is under
`~/.codex/artifacts/imagegen-studio/runs/regional-guidance-conditioning/20261025-encoded/`.
The byte-verified 1,357-member baseline archive is reused read-only from the
completed tensor owner, with a bidirectional lifecycle dependency. Existing
historical Regional evidence remains protected under the recorded compact-budget
exception; this task provisions no environment or model copy.
