# Phase 2c: Anima Main preparation and concrete batches

## Scope and baseline

Continue the authorized roadmap on clean `master` `311dddd`, 2026-10-05,
after [Project authoring](./phase-2c-anima-authoring-research.md) and the
[qualified worker entrypoint](./phase-2c-anima-worker-entrypoint-research.md).
This checkpoint connects a separate Main preparation boundary to exact managed
Anima resources, concrete dynamic-prompt batches and qualified, scoped worker
requests. It does not enqueue, dispatch or accept results, expose Generate to
Anima, or expand `.igs` accepted provenance.

Sources: [PP-004/005/007](../product-promises.md),
[generation settings](../features/project/generate-mode/generation-settings.md),
[prompt weighting](../features/project/generate-mode/prompt-weighting.md),
[storage](../specs/03-data-storage.md),
[measured batch policy](./phase-2b-batch-planning-research.md),
[research](./research-protocol.md) and [review](./review-protocol.md).

Risk is high: a mutable draft or incorrect file/seed capture can change generated
pixels, and a request lease can leak or remove filesystem data. No numerical,
Python, worker protocol, GPU, UI or accepted-record changes are planned.

## Confirmed boundaries and alternatives

- `ProjectService.withCapturedNormalGenerationInput` owns the document and
  visible-raster snapshot before callback awaits; the callback retains the
  source-file lease through composition. Reuse this owner for Anima instead of
  rereading the live Project after runtime/model/seed awaits.
- Current `validateNormalGenerationDraft`, prepared Normal types, durable queue
  SQL operation CHECK, worker-client dispatch and accepted provenance are
  independently Illustrious-only. Widening just the prepared return union would
  admit a partially connected operation. Keep those gates and introduce a
  separate Anima context and explicit Main service method.
- `ModelService.resolveVerifiedGenerationAnimaBundleForPlan` already checks the
  exact checkpoint and linked pinned Qwen/VAE, including post-await file checks.
  `resolveVerifiedAnimaGenerationLoraForPlan` separately qualifies exact Anima
  adapters. Do not substitute Library Default, infer dependencies or use the
  Illustrious-only recorded LoRA schema.
- The actual `planGenerationBatch` owns prompt-pair ordering, prefix truncation,
  seed behavior and uint32 wrap. The existing Main job cap is 32. Both Anima
  compilers and `buildAnimaWorkerRequest` own syntax, native grids, seed domains,
  capabilities and the complete 64 KiB transport envelope. Reuse these owners;
  do not reinterpret prompts or convert an SD scheduler into a native method.
- Project seed options already provide a document-scoped operational reader.
  Reuse reads `(localProjectKey, captured documentId)`, then the saved snapshot;
  seed `0` is valid. Fixed/Random do not need a cursor read. Resolve one Random
  base for the entire batch, without modifying the authored seed or cursor.

These findings are source-confirmed on the current checkout. The initial
existing preparation/planner/request/flow-plan test run passed 79/79 tests,
with no failures, cancellations or skips (`baseline-focused.log`).

## Implementation contract

1. A separate preparation copies draft, target mode/bytes/bbox/metadata,
   document identity/revision and seed sources before its first await. Validate
   native family, explicit method, current numerical envelope and active
   authored options before composition or model loading where applicable.
2. Preserve inactive Illustrious sampler/scheduler and disabled resource rows in
   the copied authoring context. They do not become worker options. Allow neutral
   `cfgRescale=0` and `vaePrecision=Auto` as inert authored policies; omit them
   from the strict Anima wire. Refuse nonzero CFG Rescale, manual precision,
   external VAE, embedding refs, CLIP Skip and wrong-family enabled adapters
   explicitly. Never silently discard an active unsupported setting.
3. Verify actual bounded sRGB RGBA PNG bytes, exact length/hash/profile and
   dimensions. Derive transparent txt2img / opaque img2img from pixels and check
   declared mode. Mixed alpha remains unsupported. Img2img requires strength;
   txt2img does not forward inactive denoising strength.
4. Freeze exact bundle identities and the ordered enabled signed adapter subset.
   Disabled rows remain authored history, without requiring their files.
   Reverify captured paths, hashes, sizes, component IDs and adapter identity
   before materialization; never read a newer draft or use another version.
5. Compile a bounded concrete batch from captured dynamic policy and transient
   iterations. Every item records concrete positive/negative interpretations
   and its own full native sampling plan. Invalid later branches or oversized
   requests refuse the whole batch before the consumer starts.
6. A scoped request helper owns one private scratch target and distinct output
   paths/request IDs. Capture caller context/items/bytes/ready before awaits;
   verify them against actual planner/compiler results. Build all real qualified
   worker requests and check complete serialized envelopes before invoking the
   consumer. Cleanup removes only this helper's stage, including on callback
   failure. No generated output survives as a durable candidate here.
7. One Main service entry composes this chain while retaining the captured
   raster lease. It derives cursor identity and scratch root from the open
   Project/service, not renderer-supplied paths. Existing public Generate stays
   refused, and queue/cursor/document/portable files remain untouched by this
   preparation-only operation.

## Parameter registry

| Parameter      | Existing owner                      | Behavior                                                                            |
| -------------- | ----------------------------------- | ----------------------------------------------------------------------------------- |
| Iterations     | Existing Generate contract          | 1–100; transient, not saved                                                         |
| Dynamic prefix | Captured dynamic settings           | 1–100 prompt pairs, default 100 / per-iteration; explicit truncation                |
| Concrete jobs  | Measured Main batch policy          | At most 32; overflow refuses, never truncates jobs                                  |
| Prompt         | Existing planner/weighting compiler | 16 KiB UTF-8 per concrete sign; malformed/invalid Unicode refuses                   |
| Native grid    | Existing flow-plan compiler         | Six methods, 1–200 steps, CFG 1–30, uint32 seeds including 0; strength 0–1          |
| Geometry       | Existing native plan                | 64–2048 sides aligned to 8; at most 4M pixels; existing bounded coordinates         |
| Target         | Existing generation PNG policy      | At most 32 MiB, exact sRGB/profile/hash/size and alpha                              |
| Worker line    | Actual Anima request builder        | 64 KiB including newline, compiled spans/grids and actual paths                     |
| Files/peer     | Existing qualification owners       | Exact original bundle/ordinary adapters; qualified 0.11 and five Anima capabilities |

These are inherited safety/compatibility envelopes, not newly measured GPU
throughput or minimum-VRAM promises. Durable Anima payload/storage capacity and
accepted metadata sizes still need checks when those later boundaries are added.

## Verification and failures

Use real Main Project import/session/capture, SQLite resource links and exact
managed files. Tiny trusted companion profiles and narrow structural qualifier
substitutes must be named; they do not prove trained-model loading or inference.
Use actual sRGB composition where available. Enter at the new service boundary
and observe the real planner, compilers, request materialization and cleanup.

Verify concurrent seed/model/draft/bbox/raster edits after capture, both alpha
modes, six methods, both seed behaviors, uint32 wrap/zero, one Random base,
Save-snapshot fallback, prefix truncation and overflow. Test target corruption,
missing/changed bundle and adapters, symlinks, unqualified peers, unsupported
options, malformed later expansions and callback failure. Await identified
operations or controlled barriers rather than fixed sleeps. Assert original
Project/`.igs`, operational cursor, queue and unrelated filesystem sentinels
remain unchanged; inspect owned scratch paths after completion/refusal.

For each important invariant state the production boundary, observable outcome,
neighboring control and semantic mutation. Execute mutations in isolated copies,
with green baseline/restored controls and imported source hashes. Collection or
fixture failures are not killed mutations. Run full app tests, typecheck/lint,
fresh production build and relevant existing production smoke; no prototype or
GPU evidence is claimed without corresponding changes and actual runs.

Artifacts:
`/home/user/.codex/artifacts/imagegen-studio/anima-main-preparation-2026-10-05/`.
Update promise matrix/body and supporting roadmap together, retaining public
readiness and the queue/Retry/accepted/release gaps.

## Findings closed during implementation

- The package PNG validator validates a present ICC profile but also permits
  an ICC-free image. Generation target preparation now separately requires the
  actual `iCCP` chunk, matching the existing captured-target policy. Missing and
  foreign profiles refuse before model resolution; changing the recorded hash
  alone cannot make those pixels qualified.
- A target check before the final model-reverification await left a replacement
  window. The final check now follows that await, opens with `O_NOFOLLOW` and
  `O_NONBLOCK`, checks a regular file and stable path/inode/size/timestamps, and
  verifies exact bytes. Replacement, changed bytes and an extra byte during the
  final resource await refuse before consumption and preserve unrelated files.
- Checking file size before `FileHandle.readFile()` did not establish an
  allocation bound: installed Node 24 performs its own later size check. The
  reader now allocates only the captured size plus one overflow byte and uses
  explicit bounded reads. The extra-byte control tests replacement before the
  reader starts; no deterministic concurrent stat-to-read growth test is claimed.
- Full typecheck caught an intentional forbidden Anima assignment in the old
  accepted configuration test. A precise `@ts-expect-error` now checks that this
  type boundary continues to reject Anima, alongside the actual runtime-schema
  rejection. The accepted DTO was not widened.

## Outcome

The separate Main preparation and concrete request boundary is implemented.
No new product choice was required: active-option refusals and negative scope
follow accepted contracts. Public readiness is unchanged in both the promise
matrix and PP-004/005/007 bodies.

| Evidence                                                                                                                                            | Actual result and boundary                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Preparation tests](../../src/main/projects/anima-generation-preparation.test.ts)                                                                   | 61/61, no skips: capture, seed, native bounds, actual PNG/profile/alpha and exact reverification with controlled tiny resolver collaborators            |
| [Batch tests](../../src/main/projects/anima-generation-batch.test.ts) and [request tests](../../src/main/projects/anima-generation-request.test.ts) | 14/14, no skips: real planner/compilers/wire builder, complete envelopes, captured peer/items, target replacement and owned cleanup                     |
| [ProjectService integration](../../src/main/projects/project-anima-generation-preparation.test.ts)                                                  | 25/25, no skips: actual service, SQLite, managed files, `.igs` import/writer/loader, retained visible raster and actual derivatives worker              |
| Isolated semantic mutations                                                                                                                         | 25/25 caught: 11 preparation, 6 batch/materialization, 8 service integration; green baselines and byte-exact restored controls, unchanged live sources  |
| Full application tests                                                                                                                              | `pnpm run app:test`: 1401/1401, zero failures/cancellations/skips                                                                                       |
| Type and style checks                                                                                                                               | `pnpm run typecheck` and `pnpm run lint`: exit 0; final changed-file Prettier, links and whitespace checks recorded with source hashes in root evidence |
| Existing production regression                                                                                                                      | `pnpm run app:smoke`: fresh production build and all eight Electron scripts exit 0, including authoring and the unchanged explicit public Anima refusal |

Artifact owners are `main/preparation-evidence.json`, `main/mutation-report.json`,
`worker/batch-materialization/manifest.json`, `integration/evidence.json` and
`integration/mutations/report.json`. Root `final-evidence.json` pins the final
working files, owner hashes, commands and logs. The integration mutation controls
include one additional imported-source hash test (26 tests, not 26 feature tests).
The read-only cross-review is source-aware, not a blind product audit; its final
target guard observations and limits are in `main/cross-review.json`.

The checkpoint proves ephemeral preparation, not trained inference or CUDA.
Integration substitutes tiny trusted companion identities and a narrow
checkpoint structural qualifier; ordinary LoRA qualification, exact filesystem
and SQL ownership, portable files and CPU composition remain real. Its ready
advertisement is controlled. Existing Electron smoke uses controlled inference
transport/pixels and does not dispatch this Anima helper. No immutable on-disk
model lease, new ActionController close fences, durable queue/Retry, accepted
Anima provenance or installed-runtime/release qualification is claimed.

The initial intentional accepted-DTO type error was corrected without widening
that contract. Integration records two discarded mutation attempts: an
interrupted skipped-barrier wait and a nonassertion failure. Neither counts as
a caught mutation; strengthened observable assertions and the complete final
campaign establish the reported result.

Next is family-specific durable job serialization/admission and frozen
Retry/dispatch with actual progress, followed by accepted configuration and
release qualification. Check the existing 128 KiB durable payload and its
escaped nesting inside the 8 MiB staging session manifest before expanding
operation unions. Existing cap32 is retained; new durable capacity and GPU
throughput are not inferred from this checkpoint.
