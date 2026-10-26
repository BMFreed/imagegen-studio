# Regional Guidance private input capture

Status: complete within the private capture/CPU boundary. This checkpoint follows the completed
[reference-image authoring owner](./phase-4-regional-guidance-references-research.md).
It is infrastructure for later conditioning, with no new public generation flow.

## Decision and evidence boundary

Implement a private Main-owned snapshot/asset lease and an independent CPU
world-mask projection. The real internal ProjectService entry point captures the
acknowledged document before filesystem awaits. It preserves the regional
collection, including disabled entities and absent versus empty prompt blocks,
and Current Canvas authoring context. It acquires independently verified files
for every captured mask and reference image/thumbnail/original ICC member.

The snapshot is authored input, not an executable recipe. It does not resolve
effective negatives, expand dynamic prompts, select seeds, verify installed
embeddings, filter compatible regions, choose adapters, or send a worker request.
In particular, Current Canvas context does not decide future Smart inheritance.

The projection intersects one owned world alpha grid with a supplied target bbox,
translates by the bbox origin, and zero-pads. It preserves every alpha8 value.
Empty masks, outside masks, intersecting holes and covered intersections remain
distinguishable. It does not resample to processing/latent geometry, invert,
threshold, combine overlapping regions, or multiply display opacity.

## Source research and alternatives

Research concerns dirty `master@10115df581d9e07049478dee3866a280886794fd`, including
prior uncommitted work. The frozen baseline contains 1,343 regular source files.
Three independent source-research tasks traced Main capture, worker algorithms,
and the evidence boundary. Their findings are proposals/source observations,
not executed results for this checkpoint.

Confirmed source paths:

- `ProjectService.withCapturedNormalGenerationInput` and
  `withCapturedSmartPatchGenerationInput` capture different draft/bbox owners.
- `project-raster-snapshot.ts` freezes pending buffers and saved package members
  behind the Project path lock. Copying metadata alone does not freeze bytes.
- `project-mask.ts` validates white-RGB/alpha8 masks with world bounds and baked
  transforms. Numeric regional coverage differs from Smart KEEP masks.
- `igs-package.ts`, `project-regional-reference-import.ts` and the coordinator
  provide strict role validation and exact saved/pending member ownership.
- Worker requests have no regional conditioning consumer. Illustrious spatial
  attention and Anima transformer masking require different implementations.
  The local Invoke reference supplies algorithm research, not a qualified drop-in.

Actual Illustrious TXT regional conditioning was considered. It additionally
needs global/region prompt composition, overlap policy, attention integration,
durable queue roles/replay and trained-model evidence. Anima spatial negatives,
Smart inherited-negative ownership, regional dynamic expansion and image-adapter
resources remain explicit later decisions. A descriptor-only planner was also
considered; this checkpoint includes materialization so the result owns actual
bytes independently of later authoring changes.

## Invariants and risk

Risk is high at source acquisition and temporary-file cleanup; pure geometry is
medium risk. There is no new stored schema, migration, renderer/preload endpoint,
worker protocol, queue bundle, provenance field, comparison or preset field.

Capture clones document and mutable pending buffers synchronously. Saved reads
hold the existing path lock and require exact captured regional ownership and
member descriptors, not hash-only lookup or a newer live owner. The service
checks its captured coordinator, revision and monotonic epoch before handing
the lease to its callback. A preparation race refuses without rebasing. Once
the callback receives the snapshot, later edits/Undo/Save/close cannot retarget
its metadata or files. Callback failure releases only its owned scratch files.

Cleanup first drains all started operations. Awaited checks are advisory; final
canonical-path, directory/file identity, version and link-count checks share one
synchronous Main turn with `unlinkSync`/`rmdirSync`. Thus cooperative Main work
cannot replace a validated path across an await before deletion. These private
scratch operations are not OS-atomic compare-and-unlink or a security boundary
against an actively hostile external writer with the same filesystem rights.

A translated mask can retain the saved PNG descriptor while its captured world
bounds/revision change; the captured geometry remains authoritative. Original
ICC profiles deliberately use shared hash paths. A new regional reference may
reuse an exact profile already owned by another saved regional/Raster image.
That profile lookup follows typed global profile ownership; image/thumbnail
lookup still requires its specific region/reference UUID owner and role.

The collection remains raw authored state: disabled, locked and zero-opacity
entities are preserved. This helper grants no generation admission. Existing
enabled-region NEW Generate refusal, target-only Smart permission checks,
post-publication `regionalAdmissionComplete` and frozen Retry stay unchanged.
Project content/history/shadow/package, SQL/cursor/policy, accepted bytes and
immutable provenance must remain unchanged by a successful or refused capture.

## Parameter register

These are defensive private-operation bounds, not measured model or document
capacity. The portable format's limits remain unchanged.

| Parameter                             | Source and decision                                                                                          | Failure boundary                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Aggregate unique captured asset bytes | 512 MiB, borrowing the existing regional canonical-image byte ceiling as a collection-wide staging safeguard | Refuse before creating staging or reading sources                   |
| Individual masks/references/profiles  | Existing strict schema and byte validators                                                                   | Refuse corrupt, changed, missing or wrong-role sources; no fallback |
| Projection target                     | 2,048 per side and 4,000,000 pixels, matching the existing finite CPU target compositor                      | Refuse before allocation                                            |
| Owned mask geometry                   | Existing Project mask bounds/dimension/alpha constraints                                                     | Refuse malformed grids                                              |
| Checks                                | Serial, process-group memory limit, zero swap and deadline                                                   | Retain bounded logs and physical-exit evidence                      |

## Verification plan

Use real Service/coordinator/SQLite/shadow/package boundaries for saved and dirty
sources. Controlled timing or CPU fixture creation must be identified. Assert
full durable neighbors before/after capture, including seed zero and both Smart
families where present. Cover legacy absence, explicit empty prompts, dormant
negative text/refs, ordered identical-content references with distinct owners,
and exact masks at negative coordinates.

Exercise synchronous buffer detachment, callback-read detachment, saved-source
replacement, corrupt/missing/foreign/symlinked sources, Save A/edit B, edit/Undo
ABA and close/reopen during acquisition. Await observed barriers before
asserting refusal. Verify owned cleanup after success/failure and preserved
foreign replacements. Test the byte/work preflight controls.

Projection oracles use independently specified alpha arrays, holes, edges and
negative origins. A semantic mutation must lose soft alpha or owner identity;
the relevant test must fail while its neighboring control stays green, followed
by byte-exact restoration and a green rerun in an isolated source copy.

Run required typecheck, affected/neighbor tests, lint and build. Independent
source review checks the full bounded contract. A native UI replay would not
exercise this private helper because there is no UI consumer; no native or
conditioning PASS will be claimed here. PP-001/007/008 remain **Пока не обещать**.

## Final execution evidence

Root executed the following against the final five production/test files pinned
in source review R3 on dirty `master@10115df581d9e07049478dee3866a280886794fd`.
No commit, publication, runtime/catalog provisioning or model execution occurred.

| Check                       | Actual result and boundary                                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Focused capture/coverage r5 | 47 passed, zero failures/skips; real Service/coordinator/SQLite/shadow/writer/loader, declared literal image and timing fixtures        |
| Affected/neighbor r3        | 999 passed across 59 files, zero failures/skips, 92.827 s; existing generation refusal/Retry and authoring neighbors included           |
| Required typecheck r4       | Both prototype and app projects PASS, 23.463 s                                                                                          |
| Full lint r3                | All four repository partitions PASS, 60.027 s                                                                                           |
| Fresh app build r1          | PASS, 1.801 s; all 33 build members independently retained and verified                                                                 |
| Alpha mutation              | Isolated GREEN 2 → semantic RED 1 / binary control GREEN 1 → restored GREEN 2; all 1,348 files restored, shared subject unchanged       |
| Source review               | R1 found two P2 gaps; R2 closed those and found one cleanup P2; R3 CLEAN after the same causal regressions became green                 |
| Retention                   | Two candidate-only audits CLEAN/READFINISHED; unit-generated SQLite/ZIP/I/O self-cleans by design, without a retained-native-data claim |

Expected warnings come from deliberately replacing a leased file and retaining
that foreign file/directory. They are failure/ownership controls, not successful
cleanup claims. The unchanged alpha helper is the mutation subject; this does
not stand in for the separate acquisition and cleanup regression evidence.

The commands, TAP, bounded resource records, source snapshots, exact candidate
diff and review results remain under
`~/.codex/artifacts/imagegen-studio/runs/regional-guidance-preparation/20261024-capture/`.
Each heavy check ran serially in its own 3 GiB, zero-swap process group with a
600-second deadline (the causal transport probe used 120 seconds). Physical
remaining-PID lists are empty. No prototype UI source changed; no prototype
browser suite or native UI replay is claimed for a helper the UI does not invoke.

## Historical failures and causal corrections

The first focus run passed 41/42 but expected portable seed zero without wiring
the fixture's operational reader. Moving its cursor setup before Save alone
still failed that fixture precondition. Root then wired a real SQLite cursor
reader and established the row before Save. These are setup failures, not
product REDs. Typecheck r1's test Buffer generic mismatch and scoped lint-only
changes are retained separately.

Source R1 found Service copying pending buffers before the aggregate budget, and
saved extraction using a replacing rename. The first budget regression changed
a detached document copy and therefore was not causal. Root corrected it with
an explicit, temporary schema-valid oversized getter; no huge invented assets
were published. On isolated R1 source, the corrected run produced two semantic
REDs and one under-limit GREEN: nine premature source accesses and lost foreign
destination bytes. The same three assertions passed after passing a synchronous
source resolver behind preflight and replacing saved acquisition with a pinned
archive stream into an exclusive opened descriptor. Shared package extraction
semantics and the `.igs` format remain unchanged.

Source R2 then identified stale `lstat` evidence across awaited `realpath` before
cleanup. Actual filesystem replies plus a controlled rename reproduced RED 1 /
control GREEN 1. Fresh synchronous final identity/version checks and deletion in
one Main turn made the unchanged pair GREEN 2. The documented cooperative-Main
scope does not claim OS-atomic compare-and-unlink against hostile external writers.
All failed runs, corrected tests, exact source overlays and neighboring controls
remain retained. Earlier green runs do not qualify later code by themselves.

## Retention and release

The retained baseline has 1,343 members. The final source archive has 1,348;
source review R3 pins the complete five-file production/test delta. The mutation
archive has 1,348 members; the historical R1 regression source is reconstructed
exactly from that archive plus its retained test overlay. The qualified build
has 33 members. Configurations, lockfiles, all 19 migrations, fixture PNG/WebP/ICC
bytes, fixture generators, helpers and test/review/resource records survive
outside disposable trees. The final source/build version map distinguishes all
these identities. No model, GPU, native Electron or conditioning claim follows.

Both independent retention audits found no candidate-only reproduction bytes.
After confirming all 16 delegated tasks terminal, exact source/restoration,
owned process-group exit, accessible process references, incoming symlinks and
cross-run dependencies, root removed only:

- `payloads/mutation-soft-alpha-r1` — 29,954,048 allocated bytes.
- `payloads/regression-review-r1` — 31,510,528 allocated bytes.

Measured artifact-root allocation fell from 6,393,024,512 to 6,331,559,936 bytes:
**61,464,576 bytes (58.617 MiB) actually reclaimed**. Both paths are absent;
compact proof and external `node_modules`/worker `.venv` remain protected.
Protected pre-existing foreign OS services were not stopped or escalated to
inspect their denied `/proc` descriptors; their unrelated scopes are recorded
separately. Owned groups and declared consumers passed fresh release gates.

This completes the internal checkpoint. Dynamic/regional prompt composition,
Smart negative ownership, processing/latent resampling, adapter resources,
family-specific attention, durable regional queue/replay and real generation
qualification remain later owners. PP-001/007/008 remain **Пока не обещать**.
