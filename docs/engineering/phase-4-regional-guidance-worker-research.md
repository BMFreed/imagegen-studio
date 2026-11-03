# Private Regional Guidance: Main → inference child → PNG

## Boundary and InvokeAI basis

3 November 2026; implementation base `4358eb6dfa2d3640b9bc3bfa61c18b42a03b02f0`.
This slice connects the existing complete Main recipe to the existing regional
output owner through the real inference child. It does not admit public NEW
requests, create queue rows, publish durable candidates or change sampling.

Consulted current local InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:

- `invokeai/app/services/shared/graph_materializer.py`: detached execution nodes.
- `invokeai/app/services/shared/graph_execution_runtime.py`: copied edge values.
- `invokeai/app/services/shared/invocation_context.py`: copied images, cloned
  tensors and detached conditioning loaded by resource name.
- `invokeai/app/invocations/sd/denoise_latents.py`: conditioning/mask references
  consumed by the existing denoiser.
- `invokeai/app/services/session_processor/session_processor_default.py`:
  cancellation and execution lifetime.
- `invokeai/frontend/webv2/src/features/generation/core/canvas/addRegionalGuidance.ts`
  and its Canvas invocation callers: captured masks referenced by the graph.

Invoke's service storage/graph transport cannot be used verbatim in Studio's
Node/Python child protocol. This was disclosed before implementation. The adapter
uses owned files and existing no-follow snapshots for the same detached-resource
handoff. The existing production loader, Compel, regional attention, native Euler
loop, VAE conversion and exclusive PNG publisher remain their execution owners.

## Ownership and finite parameters

`GenerationWorkerClient.executeCurrentCanvasRegional()` is private and outside
the durable/public request union. It snapshots its input before the first await.
`regional-worker-request.ts` creates one private directory containing a verified
transparent target copy, complete recipe metadata and separate raw alpha files.
The original capture and caller files are neither retained nor removed. Exact TI
paths stay installed-resource references; the worker independently snapshots them.
This creates no catalog deletion lease or authentication guarantee.

Only a compact descriptor goes over the existing JSONL connection. The Python
adapter verifies canonical direct-child paths, ownership, regular-file storage,
size and SHA, rejects duplicate JSON fields, and hydrates immutable alpha bytes.
It validates the complete recipe/command association, target transparency and
checkpoint/resource inputs before native loading. Finiteness and encoder-dtype
qualification remain with the existing TI consumer after loading.

| Parameter          | Value and source                                                                                                                                             | Refusal                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| JSONL              | Existing 64 KiB                                                                                                                                              | No limit increase; oversize descriptor refuses                      |
| Bundle             | Private defensive 1 MiB ceiling                                                                                                                              | Refuse before model load                                            |
| Raw alpha          | Existing Main aggregate ceiling, 64 MiB                                                                                                                      | Exact geometry/size and bounded snapshots                           |
| Effective regions  | Existing private maximum 3                                                                                                                                   | Refuse extras                                                       |
| Target             | Existing 32 MiB, sides 8–2048, area ≤4,000,000                                                                                                               | Verified pinned-sRGB RGBA, all-zero alpha                           |
| Text/TI/rows/masks | Existing 16 KiB/text, 128 KiB aggregate, 16 signed descriptors, 64 MiB unique TI bytes, 300 vectors/sign, 308 emitted rows/sign and 33,554,432 mask elements | Existing owners retain their refusals                               |
| Native lane        | CUDA FP16, embedded manual-FP16 VAE, shared-readonly exact-TI encoding, Euler v2 with explicit resolved noise policy                                         | No CPU-loader, LoRA, external VAE or independent embedding override |
| Steps              | Existing v2 exact integer 1–200                                                                                                                              | No implicit sampling default                                        |
| Native topology    | Qualified loaded Illustrious 11 parents / 70 cross-attention sites                                                                                           | No request-supplied factors or partial bindings                     |

The worker loads once using `load_illustrious_pipeline`, sets eval, invokes the
pinned native inner-CLIP capture-hook installer without forwarding, derives
complete native bindings and calls the existing regional output once. Its new
ready capability is explicitly `private-current-canvas-regional-v1`; ordinary
strict parsing and public admission remain unchanged.

On success Main verifies actual RGB/ICC bytes and exact request/path/seed, returns
owned `pngBytes`, then removes the operation directory. `output.path` is historical
metadata after return. On failure after dispatch it confirms physical child exit
before disposal. Unconfirmed termination retains the lease and retryable client
owner; a late exit or close retry releases it. Unexpected links/directories or
replaced staging refuse cleanup rather than traversing them. PNG bytes are not a
Main staging receipt, candidate, Add or Save.

## Executed evidence

ROOT reused the existing compatible Python/runtime, pinned offline configs and
exact official Illustrious v0.1 epsilon file `3e15ba…45aa9` (6,938,040,760 bytes).
No model/environment copy, download or provisioning was introduced.

- **178 Main tests PASS**, including new bundle/client cases and recipe, private
  Smart Patch, ordinary worker and Regional Guidance neighbors.
- **134 Python tests PASS**, including 28 new handoff cases plus protocol,
  generation protocol and inference-boundary neighbors.
- `pnpm run typecheck`, scoped ESLint/Prettier, strict scoped basedpyright
  (zero diagnostics), Ruff check/format and `git diff --check` PASS.
- Fresh real Save/reopen/capture/planner/ModelService/target production prepared
  six Main handoffs. Services/database/derivative worker closed; network attempts
  zero and protected durable-state comparisons exact.
- One unchanged complete `seed123-assignment` handoff reached the **real qualified
  Python child and production loader**, then existing CUDA regional execution and
  publication: 1024×1024, bbox `(-13,5)`, two Euler steps, CFG 5, Main's explicit
  false-ZTSNR/leading policy, no TI. IPC was **556 bytes**, bundle 4,256 bytes,
  two raw mask planes total **2,097,152 bytes**. Verified PNG: 2,045,268 bytes,
  SHA `e5b160371d02f7385eb9113bd3061a40e03136c40a966470b132194d5faddcec`.
  The target stayed exact and request staging was empty after result consumption.
  The child exited and the controller confirmed no remaining owned PIDs.
- The trained unit completed in **18.650 s** including startup/close; native
  request elapsed 13.888 s. Aggregate host `MemoryMax=12G`, zero swap, 600-second
  unit ceiling; recorded host peak 2,003,087,360 bytes. CUDA allocator fraction
  and peak VRAM were not independently constrained/measured by this child probe;
  this is not a capacity claim.
- A source-only independent review found a refusal-test oracle that could fail
  before its loader tripwire. ROOT corrected its runtime collaborator and reran.
  Final review is CLEAN for exact restored source, without independent execution.

Fast client tests use a real OS child with an explicitly fake native peer. Python
dispatch tests use explicit loader/output collaborators. Those layers prove IPC,
file refusal, BUSY, cancellation, timeout/SIGKILL, unconfirmed-exit retention and
recovery; they do not replace the separate genuine trained-child result.

A bounded snapshot-byte reversal mutation preserves valid files, hashes and shapes
but returns wrong hydrated bytes. Its independent association assertion turns
RED, a zero-region parser fixture stays GREEN, and exact restoration returns
both GREEN. This is transport-oracle sensitivity, not another native semantic or
visual mutation qualification.

Earlier diagnostics remain excluded: producer module-path setup failure;
fixture file-mode/Alpha8-field mistakes; Valibot empty tuples initially stripped
forbidden resources (corrected to strict tuples with refusal controls); typing
and the deliberately extended ready-capability expectation. No excluded failure
counts as acceptance or semantic RED.

## Limits and next owner

This closes a private interprocess consumer boundary. It does not repair the
previous negative visual result, establish regional visual usefulness, qualify
Anima, add a generic SDXL family or select global support/pool/composition defaults.
Public enabled-region NEW refusal, Smart target-only permissions, published/frozen
Retry independence and provenance/Compare/result-derived-preset exclusions stay
unchanged. PP-001/007/008 remain **«Пока не обещать»**.

The next integration owner is durable frozen regional input/output ownership:
queue attempt → exact reload/Retry → correlated provisional completion → existing
Main candidate receipt transaction and recovery. Public admission remains a
separate decision after that boundary and the outstanding product/quality gates.

Evidence: `~/.codex/artifacts/imagegen-studio/runs/regional-guidance-worker/20261103-file-transport/`.
ROOT retains producer/child/controller sources, logs, JUnit, mutation originals,
patch/control/restoration, fresh Main inputs and original PNG. Lifecycle and
retention records distinguish compact evidence from disposed test payloads;
external runtime, pinned configs and the single checkpoint remain protected for
the next concrete integration slice.
