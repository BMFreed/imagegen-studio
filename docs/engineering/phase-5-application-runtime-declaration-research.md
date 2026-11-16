# Signed publisher declaration for application runtime files

## Finite contract and risk

High risk, PP-002 Application Updates. Research base is clean
`4af719a1de1001baf16de025ec0ce92f537c5600`. Extend the existing signed application
release and retained-startup inspector with a fixed archive/executable declaration.
The consumer compares the already captured native source descriptors with the
external signed declaration. No cleanup, retirement, recovery adoption, startup
refusal, global process lease or new installer is introduced. Ordinary Projects,
Save, Check and Download remain available. Every retained stage still vetoes
Review/preflight, regardless of either authentication result.

The declaration is an assertion by a trusted publisher that the named outer
artifact and the two runtime fingerprints belong to its release. It is **not** an
independent readback of AppImage container contents, proof of earlier compiled V8
bytes, coverage of unpacked dependencies or a successful-start acknowledgement.
Missing shipping publisher URL/key remains unchanged. All eight promise statuses
remain unchanged.

## Fresh source basis and disclosed gap

InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`, clean:

- `invokeai/frontend/webv2/src/workbench/projects/invk/fonts.ts`,
  `readEmbeddedFonts`: exact dependency membership and per-file content hashes.
  Callers `invk/importProject.ts:readInvkArchive` and
  `projects/projectFile.ts` preflight/restore with post-await owner checks.
- `invokeai/app/services/model_install/install_staging_ledger.py`,
  `protect_source`, `begin_transfer` and conservative restoration; callers
  `model_install_default.py` install/start/restoration and `api_app.py` lifespan.

Launcher `c267bdb439519216b277a7a8c6ad408b9d79efce`, clean:
`src/main/updater.ts`, `main-process-manager.ts`, builder config and Linux build
workflow. Neither donor provides signed Linux Electron execution-file identity.
This gap was disclosed before implementing the adapter. Reuse Studio's existing
Invoke-based signed runtime file-inventory mechanism (`runtime-release.ts`),
canonical Ed25519 envelope, held-file hashing and captured-source owner; do not
introduce extraction, cryptography, queue or storage implementations.

Pinned local `app-builder-lib26.17.0/out/platformPackager.js` runs user
`afterPack` before `doAddElectronFuses`; `afterSign` is conditional on actual
signing and is normally skipped for Linux. Its `pack` caller passes the completed
appOutDir to `targets/appimage/AppImageTarget.js`; its `appImageUtil.js` copies
it to the SquashFS staging area. The producer therefore takes explicit final appOutDir input **after** the
complete artifact build. Neither hook is a trustworthy final executable receipt.
The build pipeline does not freeze that directory or verify its containment in
the final AppImage. A publisher can sign a mistaken pairing; that remains a
publisher responsibility, clearly distinguished from container verification.

## Data path, compatibility and failure behavior

Publisher CLI receives final appOutDir, outer artifact, release template and
notes. Schema2 requires exactly `runtimeFiles.archive` and
`runtimeFiles.executable`, each `{sha512,sizeBytes}`. Paths are fixed locally to
`resources/app.asar` and `imagegen-studio`; no paths or arbitrary inventories enter
the signed payload. Existing no-follow held-input checks bracket hashing and
publication. The existing create-only output and envelope verifier remain owners.
The final tuple is signed together with the outer artifact identity and notes.

Schema1 remains accepted exactly as a target-only declaration; it cannot carry
runtimeFiles or acquire runtime authentication. Schema2 requires both roles and
rejects extra fields. Older schema1-only clients refuse schema2; a future publisher
rollout must account for that transition. Authority envelope/keyring and stage journal schemas do not
change. Publisher v1 invocation remains supported; `--runtime-directory` is
required only for v2 and refused for v1. No key, feed or URL is provisioned.

At startup Main passes the completed source capability to the existing retained
inspector. A signed, exact current target is still independently verified. Only
schema2 plus an exact matching source observation can report
`runtimeAuthentication: verified-publisher-declaration`. Missing/unsupported,
failed or mismatching observations report runtime `unverified` without inventing
target failure. v1 always reports runtime `unverified`. Full source revalidation
and final synchronous assertions preserve the existing no-rebase invariant;
there is no fallback to reopening a fresh ASAR pathname. Source fingerprints
remain Main-private and ephemeral, outside Project/provenance/journal state.

## Bounds, alternatives and regression plan

The finite inventory is the two-role type/schema, not an open file scan. SHA512
uses the existing canonical 64-byte base64 encoding; sizes are positive safe
integers. JSON/envelope input keeps the existing 1MiB ceiling; key input keeps
16KiB. Hash reads use existing 1MiB chunks and metadata/length guards. No new
arbitrary file-count, extraction, GPU or ML capacity is introduced.

Reject a new SquashFS reader or executing untrusted AppImages for inspection.
Reject embedding final outer-artifact hashes inside the same image, which creates
a self-hash cycle. A full signed inventory/whole-container verifier remains a
separate scope. Existing external retained authority avoids that cycle.

Checks cover strict v1/v2 schemas and CLI arguments; actual publisher file hashes
and changed inputs; exact source fingerprints; retained target with matching,
missing, wrong-role/hash/size and late-changed runtime; fixed target guards and
retained veto controls. A semantic mutation must remove the real comparison,
produce a precise wrong-declaration RED and restore its GREEN neighbor. A packaged
production Main/native capture run must observe matching and mismatching signed
declarations, retain recovery data, preserve ordinary Save/reopen and close
normally. Controls use the same package/defaults and change only the signed
declaration. Native promotion overhead before scope admission remains explicitly
unqualified, as in the previous checkpoint.

## Results

Root executed on the final code before native packaging:

- **588 Main/publisher cases: 587 PASS, one existing platform SKIP**. The real
  publisher CLI contributes 32 of those cases; its earlier32-case pass is not added
  again. Full `pnpm run typecheck`, `pnpm run app:build` and scoped ESLint pass.
  No Vue/UI change; the unchanged mock/browser matrix was not repeated.
- Actual retained-inspector tuple-consumer mutation: **2 GREEN → one GREEN plus
  one semantic RED → restored 2 GREEN**. Only signed runtime tuple equality was
  elided in an isolated compiled owner. A same-sized real archive with a different
  hash then falsely received runtime authentication. The matching neighbor stayed
  green; original production source was untouched and restored bundle bytes equal
  the original bundle.
- Two real packaged production Main/preload/Vue A→B flows pass: **four normal app
  lifetimes**, four explicit HTTP requests, two saved/reopened `.igs` Projects and
  two real SQLite stores with the same 30 exact applied migrations. Both packages
  verify 42 production dist entries and preserve original Electron/SQLite binaries.
  A uses FUSE; native relaunch starts B in extract-and-run mode. No startup network
  request is made. Native borrowed ASAR descriptors remain open after Main's own
  disposer; known PID/start identities, owned scopes and runtime scratch settle.
- The correct declaration produces the exact internal runtime-match diagnostic.
  The second validly signed capsule changes only archive fingerprint A versus B;
  outer B, notes, releaseId, executable tuple, compatibility and packaged defaults
  are identical. It preserves authenticated target status and refuses runtime
  authentication. Both keep stage bytes, saved Project and normal close intact.
  This is a controlled publisher-error case, not a natural mislaunch claim.

The native harness uses declared nonshipping CDP/X11/dialog/startup/close timing
ports. Early metadata capture still runs before native readiness; full hashes
wait for exact PID/start/ASAR and cgroup-inode admission. Launcher 1 GiB + A/B each
1 GiB + at most three 128 MiB watchdogs gives an admitted ceiling 3.375 GiB, zero swap,
600s deadlines. Native promotion overhead before admission is recorded and remains
unqualified. No ML runtime/model copy or inference is used. Same-source versions
and unchanged migrations do not establish real upgrade/changed-engine acceptance.

Independent production **source-only** review is CLEAN after correcting a missing
adapter tuple forwarding and replacing live method aliases with frozen observed
references. These are source findings, separate from the later root runtime checks.
Root also verified exact adapter hash/size forwarding through its controlled native
port test. No reviewer product execution is implied.

Evidence RUN:
`~/.codex/artifacts/imagegen-studio/runs/application-runtime-declaration/20261116`.
`qualification-summary.json`, settled TAP/wrapper receipts, mutation triples,
`source-review.json`, `native-package-manifest-r1.json` and both native result JSONs
preserve the checks and their limits. `retained-payloads.tar.gz` preserves all
**5,149 entries** (4,985 logical regular files, including 103 verified internal tar
aliases); zero entries are omitted. Its size is 626,336,031 bytes and SHA256 is
`d2d21c2b13de223cef5f949ae439ded3e09c197cf8d1ca287daa6bf632ec4d5a`.
Root has compared every raw/archive member, full hash and mode. Reconstruct aliases
as independent regular files, never filesystem hardlinks between current/cache/
backup. `final-source.json`/tar preserve 20 final source/document entries;
`qualification-source.json` additionally pins 28 code/tool/original-Node inputs,
while the native producer pins 42 dist entries and original Electron/SQLite.

Both native cases' 46 known PID/start identities and four owned scopes were
rechecked after exit. General same-UID descriptor scanning had 163 inaccessible
references; this is an explicit visibility limit, not a global ownership proof.
Exact raw roots are only RUN/payloads and artifact-root/t-ard-1116. Shared runtime,
models, ordinary app data, host integration and global caches are protected.
Independent pre-disposal and final retained audits, actual reclaimed bytes and
raw-path state are recorded in the adjacent `final-audit-live-r3.json`,
`final-audit.json`, `retention.json` and `artifact-lifecycle.json`.


The pre-disposal audit is CLEAN. Exact raw roots were removed only after that
comparison and known physical-exit checks, reclaiming **1,724,002,304 allocated
bytes**. Lifecycle is `retained` with `payloads: []`, no pins or cross-run
obligations. Do not resume the disposed raw paths; reconstruct needed files from
the full inventory/archive under the same guards. The final retained audit verifies
the archive after deletion; it is not a new native product run.

Two initial audit-helper failures are preserved separately: a `base` versus
`baseRevision` metadata-key mismatch, then raw ready-receipt equality including
derived driver annotations. The correction verifies the runtime tuple and bounded
wrapper ancestry separately before exact comparison with raw receipts. Original
scripts, FAIL reports and the final r3 CLEAN are indexed by `audit-attempts.json`.
These setup/normalization failures are not the intentional application semantic
RED and do not invalidate or replace the actual settled native flows.
