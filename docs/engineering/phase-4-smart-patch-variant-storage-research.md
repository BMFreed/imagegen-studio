# Smart Patch variant storage and material composition

## Prospective scope and risk

Base: `28c8630` on `master`. This is an authorized phase-4 implementation,
with self-review rather than a blind audit. PP-007/008 remain unqualified for
the complete public Smart Patch flow. Persistence, recovery and immutable
accepted pixels are high-risk boundaries.

The preceding private acceptance plan proposes verified portable variants but
does not adopt them. This slice adds document/package ownership and active-pixel
consumers. It does not connect Generate, Add, cancellation, a durable acceptance
journal, accepted-history navigation or variant lifecycle controls.

## Invariants and consumer map

- Empty patches remain valid. Nonempty patches own all variant assets and have
  exactly one active member. Layer, mask and variant identities cannot collide.
  Frozen source document/target IDs remain historical; acceptance enforces exact
  current target before creation, while a later copy must not rewrite provenance.
- `projectRasterLayers` remains a top-level Raster owner selector. Distinct
  helpers enumerate every owned raster asset and current active material.
- Save, local shadow recovery, Undo/Redo and asset retention preserve inactive
  variants. `.igs` changes only on explicit Save; recovery does not become Save.
- Actual package bytes must match variant dimensions, sRGB PNG and immutable
  output/alpha identities. A truthfully rehashed but changed alpha is invalid.
- Composition preserves stack order and parent visibility/opacity/blend. The
  active variant uses its own frozen world bbox. Editing the current Patch bbox,
  mask or internal resolution cannot move, resize or remask accepted pixels.
- Preview and visible-bounds consumers must recognize Smart-only material.
  Source capture beneath a Patch includes active contributions below it while
  excluding the target and higher owners.
- Opening a newly valid package must not silently drop active pixels in renderer
  DTO/resource consumers. Unsupported public actions remain explicitly closed.

Affected owners are `project-schema`, `igs-package`, raster snapshot/preview,
session bounds, generic autosave/shadow ownership, layer resource projection and
renderer display. Generic lifecycle code must not confuse a synthetic material
projection with a mutable top-level Raster owner.

## Verification plan and resource policy

Use real writer/loader/filesystem and autosave/shadow/Undo owners. Fixture
adoption is a declared setup, not evidence that public Add exists. Test active
and inactive bytes, edited authoring geometry, denied/corrupt package inputs and
neighboring empty/Raster controls. Exercise actual CPU composition when pixel
behavior is asserted. Semantic mutations must produce a causal RED with a
neighboring GREEN; setup/import failures and memory-limit aborts do not count.
Byte-bearing assertions use short booleans rather than unbounded object diffs.

Root serializes native/build/test runs under finite user cgroups, at most4GiB,
zero swap and explicit deadlines. No model download, runtime copy or GPU run is
needed. Initial artifact inventory is approximately27GiB shared +1.3GiB runs,
42GiB free. The existing compact-evidence budget exception remains under review;
this slice adds only its compact logs/descriptors and removes its own disposable
scratch after physical process exit and mutation restoration.

## Implemented boundaries

`project-schema` now distinguishes top-level Raster owners, every owned raster
asset, and active material contributions. Nonempty Patch membership requires an
existing active ID; all current layer/mask/variant IDs share one namespace. The
portable format remains v1, with the already designed variant record admitted
into the document. Older empty-only readers do not gain forward compatibility.
Historical source IDs are not rewritten for copied hierarchy. Duplicate itself
is not implemented by this slice.

The package loader and temporary-package verification before atomic Save use
`verifySmartPatchVariantPng` for every stored variant. The actual canonical ICC,
complete PNG CRC/structure, RGBA8 dimensions and alpha digest must match portable
metadata. Autosave stages and validates new image proofs; exact trusted pixel
identities cache metadata only. A changed alpha claim cannot use a previous proof.
Shadow write/inspect validate newly owned or changed proofs, including inactive
images and metadata-only claims over unchanged saved members. Low-level shadow
write trusts its `savedDocument` argument as loader-validated; production
coordinator obtains and checks this through the real package loader.

Material projection retains parent stack position/appearance and accepted world
placement. It feeds Main source snapshots, CPU preview, Save bounds, Main DTO,
preload validation, renderer fingerprints/Canvas and signed image resources.
Only current active pixels are nominated by a renderer URL; saved membership
includes inactive images needed by Undo and later active selection. UI reports
`stored`, not `ready` or `outdated`. No current catalog qualification is implied.

## Parameter registry

| Parameter                   | Source and use                                                           | Bound / refusal                                                                             |
| --------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| World image size            | Existing Smart world/provenance schemas and PNG decoder                  | 1..2048 per side; at most4M pixels; invalid metadata/image refuses                          |
| Encoded contribution        | Existing `IGS_GENERATION_PNG_MAX_BYTES`                                  | 32MiB; schema↔output binding bounds staged file allocation                                  |
| Current asset/variant count | Existing `IGS_SAFETY_CEILINGS.archiveEntries`                            | Existing10,000 ceiling; strict document/package membership                                  |
| Pixel-proof cache           | Coordinator metadata-only optimization                                   | At mostarchiveEntries proofs; oldest proof evicted, bytes revalidated on miss               |
| Contribution IDAT chunks    | Existing owned-mask decoder allocation policy reused for accepted output | 256 accepted;257th refuses before retaining more decoder views                              |
| Source reads                | Exact schema-bounded declared asset bytes                                | Regular/no-follow file, finite positional reads and dev/inode/size/mtime/ctime witnesses    |
| Test process                | User cgroup and native actor group                                       | Serial≤4GiB aggregate, zero swap, finite90..300s deadlines; no raised ceiling after failure |

These are inherited format/safety decisions and operational test budgets, not
measurements of trained model capacity. Finite matrices derive from the two
family tags, empty/nonempty active membership, current ID namespace, all/active
asset consumers, Save/shadow/Undo ownership and actual image metadata axes.
Unknown future variant lifecycle behavior is not inferred from these checks.

## Findings reproduced or corrected before final checks

- Validating the pending Save document's variants as if they belonged to the
  later shadow broke removing a newly introduced Patch while Save was blocked.
  Shadow owns the later current document only. A real coordinator/path-lock test
  now holds Save A, durably records later empty B, releases A and reopens B's
  recovery against the committed package. Before A commits, B equals old S and
  inspection correctly reports clean; the durable manifest still records B and
  A's commit witness. After A commits, B is recoverable.
- Two direct-shadow refusal fixtures initially reused the saved revision and
  stopped at `SHADOW_INVALID_REQUEST`; they now use a genuine new revision to
  reach alpha validation. An initial resource-stream fixture omitted the
  required nonempty unavailable-preview rect. These setup failures are not
  counted as semantic mutations.
- Existing Pillow BICUBIC RGBA affine composition quantizes the literal soft
  pixel(30,90,150,64) to(31,91,151,64), even at identity transform. A small actual
  Pillow probe established this, and a real ordinary Raster with identical bytes
  now serves as a neighboring full-RGBA control. Stored image bytes remain exact;
  no new compositor behavior or pixel-preserving derivative promise is invented.
- Initial typecheck found a callback narrowing and inferred UUID-template test
  parameter; both were corrected. The first global lint exhausted its isolated
  3GiB cgroup while Node's configured heap ceiling was4GiB. It physically exited
  with `Result=oom-kill`; this is a tool/resource failure, never a semantic RED.
  The retry kept the same3GiB cgroup and lowered Node's heap ceiling to2GiB;
  it reached Node's heap limit instead (39.867s, peak2,964,152,320 bytes), without
  exhausting the cgroup. Neither attempt is counted as a successful lint or
  semantic RED. The permanent `scripts/lint.mjs` now runs disjoint root/scripts,
  `src`, prototype and remaining-doc scopes sequentially under the same rules;
  the union covers the original `eslint .` tree. Each child has a2GiB heap.
  `--no-error-on-unmatched-pattern` permits a partition with no configured file
  types (currently non-prototype Markdown); it does not suppress lint errors.
  Both `pnpm lint` and `pnpm lint:fix` use this owner, with forwarded fix flags.
  No larger aggregate RAM budget or swap was introduced.

## Executed verification

Evidence root:
`~/.codex/artifacts/imagegen-studio/runs/smart-patch-variant-storage/20261016-storage/`.

- Final focused suite:60 PASS,0 failed/skipped, including real coordinator,
  package/shadow/Undo/Save/copy, signed-resource and actual CPU JSONL composition
  tests. Declared fixture adoption does not qualify public Add. Recovery tests
  using a new lease registry simulate process replacement, not physical crash.
- Affected164-file regression:2575 PASS,0 failed,2 explicitly skipped existing
  OUT controls without a LaMa path;243.324s, observed peak1,759,436,800 bytes,
  zero swap. Both skipped controls then ran against the existing pinned LaMa:
  2 PASS,0 skipped,16.237s, peak1,380,605,952 bytes. No weights/environment copy or
  download occurred. This qualifies the checked native mechanical path, not
  trained diffusion quality or installed GPU execution.
- Eight isolated semantic RED/neighbor-GREEN pairs completed with exactly one
  causal failure and one control success each: all-variant asset references,
  frozen placement, package alpha, recovery alpha, cached alpha proof, pending
  Save/shadow ownership, saved inactive resource and active display projection.
  `storage-mutation-d8a896b750-summary.json` (final post-style repeat) records actual commands, unchanged
  original hashes, physical cgroup exit and removal of every private source copy.

- Required `pnpm typecheck` PASS (17.836s); complete partitioned `pnpm lint`
  PASS (45.077s, peak2,846,720,000 bytes under the unchanged3GiB cgroup);
  `pnpm app:build` PASS (1.613s). Standard Vite bundle-size warning remains.
  Markdown is not covered by the existing ESLint configuration; changed docs
  additionally use a scoped Prettier check. No prototype UI changed.
- Final post-style focused60 PASS and final eight semantic pairs verify the
  delivered TS behavior after import/format-only fixes. A full repeated broad
  run after those style-only corrections was unnecessary.
- Built native Electron:7 PASS, three successful screenshots, zero page errors.
  Real indexed Open crosses Main/preload/renderer, signed bytes load in Chromium,
  and live Konva samples equal literal(40,180,90,255) before edits, after actual
  bbox-width + Brush edits, and after Save/close/reopen. Both PNG bytes and
  portable variant metadata remain unchanged; absent runtime uses an honest
  unavailable preview with frozen world bounds. Generate remains disabled.
  The initial sampling helper awaited two animation frames inside a5s poll;
  it timed out despite recording the exact expected pixel. Removing that wait
  and polling current actual pixels preserved the same oracle and passed. The
  precise browser scheduling cause was not measured (background throttling is
  already disabled by the existing native isolation helper). The initial failed
  report/screenshot are retained; no application fix or semantic RED is claimed.
  All three successful screenshots were viewed in the local UI audit; approved
  density/colors and readable card/details were preserved. This is a localized
  display check, not an audit of all application screens.
  `native-v2/native-display-report.json` contains unchanged source/bundle hashes,
  actual2GiB native +2GiB launcher limits and confirmed physical exit. No GPU,
  trained diffusion, model installation or actual public Add is claimed.

## Cleanup and handoff

All39 recorded user units have MainPID0 and no remaining cgroup descendants.
Both native attempts additionally confirm physical PID/start identity and owned
scope exit. The final mutation manifest still matches actual source bytes, and
all isolated source copies were removed. `cleanup-proof.json` records the exact
owned paths disposed: two native application-data fixtures and controller
bytecode, **22,425,600 allocated bytes (21.39MiB)** reclaimed. Compact reports,
RED/GREEN/restoration, viewed PNGs and the small portable native `.igs` fixture
remain. The shared ML runtime/catalog and pinned LaMa remain at their original
paths for the existing qualification chain; dependency records were updated on
both sides. No ordinary application data or external original models were
removed.

The existing1GiB compact-evidence soft-budget exception remains: older large
native/sampler qualification sets are still linked to open inference/release
owners. This slice does not release those dependencies or sweep historical runs.
Its own compact evidence is recorded in the final lifecycle inventory.

Delivery uses one reviewed commit on `master`, followed by push and a clean
HEAD/upstream check. The exact revision belongs to the local `delivery.json`,
written only after those operations actually succeed.

## Remaining owners

No public Smart Patch admission/Generate, Add acceptance, journal or cancellation
routing is connected here. Storage fixtures do not create durable accepted-history
rows. Variant choose/remove/duplicate/browse controls, Smart result navigation,
Compare/Preset and actual installed GPU/inference qualification remain open.
The private freshness helper is still a proposal-time source comparison; it is
not wired as a user-facing stored-variant freshness/availability indicator.
